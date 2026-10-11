"""Hermes native platform adapter. Uses documented adapter and lifecycle hooks."""
import asyncio
import contextvars
import fcntl
import json
import logging
import uuid
import time
from pathlib import Path

from hermes_constants import get_hermes_home
from gateway.config import Platform
from gateway.platforms.base import BasePlatformAdapter, SendResult
from gateway.platforms.event import MessageEvent, MessageType, ProcessingOutcome
from gateway.session import SessionSource
from .transport import Journal, origin, relay

log = logging.getLogger(__name__)
turn_context = contextvars.ContextVar("wechatai_hermes_turn", default=None)
AGENTS = [{"id": "main", "name": "Hermes 当前配置", "isDefault": True}]


def accounts(home=None):
    path = Path(home or get_hermes_home()) / "plugin-data" / "wechatai" / "accounts.json"
    if not path.exists():
        return {}
    value = json.loads(path.read_text())
    for key, account in value.items():
        uuid.UUID(key)
        origin(account["endpoint"])
        if not isinstance(account.get("token"), str) or not account["token"]:
            raise ValueError("Invalid Wechatai credential")
    return value


def destination(chat_id):
    parts = str(chat_id).removeprefix("wechatai:").split(":")
    if len(parts) != 2:
        raise ValueError("Use the Wechatai destination from an existing conversation")
    return tuple(str(uuid.UUID(part)) for part in parts)


class WechataiAdapter(BasePlatformAdapter):
    def __init__(self, config):
        super().__init__(config, Platform("wechatai"))
        self.home = get_hermes_home()
        self.accounts = accounts(self.home)
        self.journals = {}
        self.workers = []
        self.turns = {}
        self.locks = []

    async def connect(self, *, is_reconnect=False):
        if not self.accounts:
            return False
        try:
            for account_id, account in self.accounts.items():
                journal = Journal(self.home, account)
                self.journals[account_id] = journal
                path = self.home / "plugin-data" / "wechatai" / (account_id + ".poll.lock")
                lock = open(path, "a")
                self.locks.append(lock)
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                await relay(account, "heartbeat", {"agents": AGENTS, "nativeCommands": True})
                self.workers.extend([
                    asyncio.create_task(self._poll(account_id, account, journal, "message")),
                    asyncio.create_task(self._poll(account_id, account, journal, "control")),
                    asyncio.create_task(self._outbox(account, journal)),
                    asyncio.create_task(self._heartbeat(account)),
                ])
            self._mark_connected()
            return True
        except Exception:
            await self.disconnect()
            log.warning("Wechatai connection failed; check the pairing and relay availability")
            return False

    async def disconnect(self):
        for task in self.workers:
            task.cancel()
        await asyncio.gather(*self.workers, return_exceptions=True)
        self.workers.clear()
        # Interrupt local tasks during shutdown; never resume uncertain tool execution.
        for turn in self.turns.values():
            turn["closed"] = True
            if not turn["done"].done():
                turn["done"].cancel()
        for journal in self.journals.values():
            journal.close()
        self.journals.clear()
        for lock in self.locks:
            lock.close()
        self.locks.clear()
        self._mark_disconnected()

    async def _poll(self, account_id, account, journal, lane):
        while True:
            try:
                await journal.flush(account)
                started = time.monotonic()
                result = await relay(account, "poll", {"runnerId": journal.runner_id, "waitMs": 15000, "nativeCommands": True, "lane": lane})
                jobs = [job for job in result["jobs"] if job.get("lane", "message") == lane]
                for job in jobs:
                    await journal.execute(account, job, lambda item: self._run(account_id, item))
                await journal.flush(account)
                delay = min(30, result.get("retryAfterMs", 0) / 1000)
                if not jobs:
                    delay = max(delay, 1 - (time.monotonic() - started))
                if delay > 0:
                    await asyncio.sleep(delay)
            except asyncio.CancelledError:
                raise
            except Exception:
                log.warning("Wechatai task transport unavailable; retrying without re-executing tools")
                await asyncio.sleep(5)

    async def _heartbeat(self, account):
        while True:
            await asyncio.sleep(20)
            try:
                await relay(account, "heartbeat", {"agents": AGENTS, "nativeCommands": True})
            except Exception:
                log.warning("Wechatai heartbeat unavailable")

    async def _outbox(self, account, journal):
        while True:
            journal.changed.clear()
            try:
                await journal.flush(account)
            except Exception:
                await asyncio.sleep(5)
            try:
                await asyncio.wait_for(journal.changed.wait(), timeout=1)
            except asyncio.TimeoutError:
                pass  # Also observes messages persisted by standalone cron/CLI processes.

    async def _run(self, account_id, job):
        # Hermes 2026.9 startup restore acknowledges queued inbound with None,
        # before replaying it. Wait for that gate before dispatching a relay job;
        # otherwise the empty first completion could be misclassified as failure.
        # Older SDKs without this gate are immediately ready.
        while getattr(self.gateway_runner, "_startup_restore_in_progress", False):
            await asyncio.sleep(0.1)
        if job["agentId"] != "main":
            raise ValueError("This connector uses the current Hermes profile")
        chat_id = account_id + ":" + job["routeId"]
        turn = {"job": job, "chat_id": chat_id, "chunks": [], "closed": False,
                "done": asyncio.get_running_loop().create_future()}
        self.turns[job["id"]] = turn
        context = turn_context.set(turn)
        try:
            event = MessageEvent(
                text=job["text"], message_type=MessageType.TEXT, message_id=job["id"],
                user_id=account_id, user_name="微信用户", allow_gateway_control=bool(job.get("command")),
                source=SessionSource(platform=Platform("wechatai"), chat_id=chat_id,
                                     chat_name="微伴微信", user_id=account_id, chat_type="dm"),
            )
            await self.handle_message(event)
            if not event._gateway_accepted and job.get("command") and turn["chunks"]:
                # Active-session /stop bypasses the background lifecycle: its
                # inline final reply is already complete when handle_message returns.
                return "\n\n".join(turn["chunks"])
            if not event._gateway_accepted:
                raise RuntimeError("Hermes did not accept the message")
            return await turn["done"]
        finally:
            turn["closed"] = True
            turn_context.reset(context)
            self.turns.pop(job["id"], None)

    async def send(self, chat_id, content, reply_to=None, metadata=None):
        account_id, route_id = destination(chat_id)
        turn = turn_context.get()
        if turn and turn["chat_id"] == chat_id:
            # Same final marker used by Hermes' bundled A2A adapter. Progress and
            # intermediate reasoning are never forwarded or included in billing.
            if not turn["closed"] and (metadata or {}).get("notify"):
                if content and (not turn["chunks"] or turn["chunks"][-1] != content):
                    turn["chunks"].append(content)
            return SendResult(success=True, message_id=turn["job"]["id"])
        if account_id not in self.journals:
            return SendResult(success=False, error="Unknown Wechatai account")
        event_id = self.journals[account_id].queue(route_id, content)
        return SendResult(success=True, message_id=event_id)

    async def on_processing_complete(self, event, outcome):
        turn = self.turns.get(event.message_id)
        if not turn or turn["done"].done():
            return
        if outcome != ProcessingOutcome.SUCCESS:
            turn["done"].set_exception(RuntimeError("Hermes task did not complete"))
        else:
            turn["done"].set_result("\n\n".join(turn["chunks"]))

    async def send_typing(self, chat_id, metadata=None):
        pass

    async def get_chat_info(self, chat_id):
        destination(chat_id)
        return {"name": "微伴微信", "type": "dm"}

    async def send_exec_approval(self, *args, **kwargs):
        raise RuntimeError("Complete tool approvals in Hermes; Wechatai does not transport approvals")


async def standalone_send(pconfig, chat_id, message, *, thread_id=None, media_files=None, force_document=False):
    if media_files:
        return {"error": "Wechatai currently supports text only"}
    account_id, route_id = destination(chat_id)
    account = accounts().get(account_id)
    if not account:
        return {"error": "Unknown Wechatai account"}
    journal = Journal(get_hermes_home(), account)
    try:
        event_id = journal.queue(route_id, message)
        # Durable local acceptance: the gateway retries with the same event ID.
        try:
            await journal.flush(account)
        except Exception:
            pass
        return {"success": True, "message_id": event_id}
    finally:
        journal.close()


def parse_target(raw):
    try:
        return (":".join(destination(raw)), None)
    except (ValueError, AttributeError):
        return None


def register(ctx):
    ctx.register_platform(
        name="wechatai", label="Wechatai 微信", adapter_factory=WechataiAdapter,
        check_fn=lambda: bool(accounts()), validate_config=lambda _: bool(accounts()),
        env_enablement_fn=lambda: {"enabled": True, "extra": {}} if accounts() else None,
        allowed_users_env="WECHATAI_HERMES_ALLOWED_USERS", display_tier="minimal",
        max_message_length=0, standalone_sender_fn=standalone_send,
        parse_target_ref_fn=parse_target,
        validate_target_ref_fn=lambda raw: parse_target(raw) is not None,
        cron_deliver_env_var="WECHATAI_HERMES_HOME_CHANNEL",
        platform_hint="Personal WeChat via Wechatai. Reply in text/Markdown. Slash commands address Hermes; /wx addresses Wechatai. Tool approvals are unavailable on this channel.",
        emoji="💬",
    )
