"""Credential-scoped relay and crash-safe journal; no dependency on Hermes internals."""
import asyncio
import hashlib
import json
import os
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

USER_AGENT = "Wechatai-Hermes/1.1.2"


class RelayError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Wechatai relay HTTP {status}")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin(value):
    url = urllib.parse.urlsplit(value)
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")):
        raise ValueError("Use HTTPS or loopback HTTP")
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise ValueError("Endpoint must be an origin")
    return f"{url.scheme}://{url.netloc}"


def request(account, action, body):
    req = urllib.request.Request(
        origin(account["endpoint"]) + "/api/hermes/" + action,
        data=json.dumps(body, ensure_ascii=False).encode(),
        headers={"Authorization": "Bearer " + account["token"], "Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
            data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024:
                raise ValueError("Relay response too large")
            return json.loads(data)
    except urllib.error.HTTPError as error:
        error.close()
        raise RelayError(error.code) from None


async def relay(account, action, body):
    return await asyncio.to_thread(request, account, action, body)


class Journal:
    def __init__(self, home, account):
        fingerprint = hashlib.sha256((account["endpoint"] + "\0" + account["token"]).encode()).hexdigest()
        directory = Path(home) / "plugin-data" / "wechatai"
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        path = directory / (fingerprint + ".sqlite")
        self.db = sqlite3.connect(path, isolation_level=None, timeout=5)
        os.chmod(path, 0o600)
        self.db.executescript("""
          PRAGMA journal_mode=WAL;
          PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, state TEXT NOT NULL, routeId TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, data TEXT NOT NULL, state TEXT NOT NULL, createdAt REAL NOT NULL);
        """)
        self.db.execute("INSERT OR IGNORE INTO settings VALUES ('runnerId',?)", (str(uuid.uuid4()),))
        self.runner_id = self.db.execute("SELECT value FROM settings WHERE id='runnerId'").fetchone()[0]
        self.flush_lock = asyncio.Lock()
        self.changed = asyncio.Event()

    def state(self, job_id):
        row = self.db.execute("SELECT state FROM jobs WHERE id=?", (job_id,)).fetchone()
        return row[0] if row else None

    def start(self, job):
        self.db.execute("INSERT OR IGNORE INTO jobs VALUES (?,'running',?)", (job["id"], job["routeId"]))
        self.db.execute("INSERT OR IGNORE INTO routes VALUES (?)", (job["routeId"],))

    def has_route(self, route_id):
        return bool(self.db.execute("SELECT id FROM routes WHERE id=?", (route_id,)).fetchone())

    def queue(self, route_id, text, *, job_id=None, failed=False):
        if not self.has_route(route_id):
            raise ValueError("Unknown Wechatai destination; start a conversation from WeChat first")
        if not job_id and (not text.strip() or len(text) > 30000):
            raise ValueError("A proactive message must contain 1–30000 characters")
        event = {"eventId": str(uuid.uuid4()), "routeId": route_id, "text": text if len(text) <= 30000 else text[:29970] + "\n\n[回复过长，已截断]", "status": "failed" if failed else "completed"}
        if job_id:
            event.update(jobId=job_id, runnerId=self.runner_id)
        self.db.execute("BEGIN IMMEDIATE")
        try:
            self.db.execute("INSERT INTO outbox VALUES (?,?,'pending',?)", (event["eventId"], json.dumps(event), time.time()))
            if job_id:
                self.db.execute("UPDATE jobs SET state='finished' WHERE id=?", (job_id,))
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        self.changed.set()
        return event["eventId"]

    def pending(self):
        return [json.loads(row[0]) for row in self.db.execute("SELECT data FROM outbox WHERE state='pending' ORDER BY createdAt LIMIT 20")]

    async def flush(self, account):
        async with self.flush_lock:
            while batch := self.pending():
                for event in batch:
                    try:
                        await relay(account, "event", event)
                        state = "sent"
                    except RelayError as error:
                        if error.status not in (400, 402, 403, 409, 413, 422):
                            raise
                        state = "rejected"
                    self.db.execute("UPDATE outbox SET state=?,data='{}' WHERE id=?", (state, event["eventId"]))

    async def execute(self, account, job, run):
        state = self.state(job["id"])
        if state == "finished":
            return
        interrupted = state == "running" or job["state"] == "claimed"
        self.start(job)
        if job["state"] != "claimed":
            result = await relay(account, "claim", {"id": job["id"], "runnerId": self.runner_id, "nativeCommands": True})
            if not result.get("claimed"):
                return
        if interrupted:
            self.queue(job["routeId"], "", job_id=job["id"], failed=True)
            return
        try:
            text = await run(job)
            failed = not isinstance(text, str) or not text.strip()
        except asyncio.CancelledError:
            raise  # Keep the running tombstone: restart must never repeat tools.
        except Exception:
            text, failed = "", True
        self.queue(job["routeId"], text or "", job_id=job["id"], failed=failed)

    def close(self):
        self.db.close()
