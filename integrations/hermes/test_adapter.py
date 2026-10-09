"""Run with a Hermes runtime (see README). No upstream calls or user credentials."""
import asyncio
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location("wechatai_test", Path(__file__).with_name("__init__.py"), submodule_search_locations=[str(Path(__file__).parent)])
import sys
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from wechatai_test import transport
from wechatai_test.adapter import WechataiAdapter, standalone_send, turn_context
from gateway.config import PlatformConfig
from gateway.platform_registry import platform_registry, PlatformEntry
platform_registry.register(PlatformEntry(name="wechatai", label="Wechatai", adapter_factory=WechataiAdapter, check_fn=lambda: True))


class ChannelTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.home = Path(self.tmp.name)
        self.account = {"endpoint": "http://127.0.0.1:9999", "token": "private-test-token"}
        self.account_id = str(uuid.uuid4())
        self.job = {"id": str(uuid.uuid4()), "routeId": str(uuid.uuid4()), "agentId": "main", "text": "测试", "state": "pending"}
        self.journal = transport.Journal(self.home, self.account)
        with patch("wechatai_test.adapter.get_hermes_home", return_value=self.home):
            self.adapter = WechataiAdapter(PlatformConfig(enabled=True))
        self.adapter.journals[self.account_id] = self.journal

    async def asyncTearDown(self):
        for task in list(self.adapter._session_tasks.values()):
            task.cancel()
        await asyncio.gather(*self.adapter._session_tasks.values(), return_exceptions=True)
        self.journal.close()
        self.tmp.cleanup()

    async def execute(self, handler):
        self.adapter.set_message_handler(handler)
        with patch("wechatai_test.transport.relay", AsyncMock(return_value={"claimed": True})):
            await asyncio.wait_for(self.journal.execute(self.account, self.job, lambda item: self.adapter._run(self.account_id, item)), 10)
        return self.journal.pending()

    async def test_real_hermes_lifecycle_only_final_reply(self):
        async def handler(event):
            self.assertFalse(event.allow_gateway_control)
            await self.adapter.send(event.source.chat_id, "执行进度", metadata={})
            return "**连接成功**"
        events = await self.execute(handler)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["text"], "**连接成功**")
        self.assertEqual(events[0]["jobId"], self.job["id"])
        self.assertEqual(events[0]["status"], "completed")
        self.assertIsNone(turn_context.get())

    async def test_startup_restore_waits_before_dispatch(self):
        from types import SimpleNamespace
        self.adapter.gateway_runner = SimpleNamespace(_startup_restore_in_progress=True)
        handler = AsyncMock(return_value="启动后回复")
        task = asyncio.create_task(self.execute(handler))
        await asyncio.sleep(0.05)
        handler.assert_not_awaited()
        self.adapter.gateway_runner._startup_restore_in_progress = False
        events = await task
        self.assertEqual(events[0]["text"], "启动后回复")
        self.assertEqual(handler.await_count, 1)

    async def test_failure_is_not_a_billable_reply(self):
        async def handler(_):
            raise RuntimeError("simulated failure")
        events = await self.execute(handler)
        self.assertEqual(events[0]["status"], "failed")
        self.assertEqual(events[0]["text"], "")

    async def test_interruption_never_repeats_agent_tools(self):
        self.journal.start(self.job)
        runner = AsyncMock(return_value="must not run")
        with patch("wechatai_test.transport.relay", AsyncMock(return_value={"claimed": True})):
            await self.journal.execute(self.account, self.job, runner)
            await self.journal.execute(self.account, self.job, runner)
        runner.assert_not_awaited()
        self.assertEqual(len(self.journal.pending()), 1)
        self.assertEqual(self.journal.pending()[0]["status"], "failed")

    async def test_lost_http_response_retries_same_event_id(self):
        self.journal.start(self.job)
        event_id = self.journal.queue(self.job["routeId"], "已完成", job_id=self.job["id"])
        relay = AsyncMock(side_effect=[OSError("offline"), {"status": "queued"}])
        with patch("wechatai_test.transport.relay", relay):
            with self.assertRaises(OSError):
                await self.journal.flush(self.account)
            await self.journal.flush(self.account)
        self.assertEqual([call.args[2]["eventId"] for call in relay.await_args_list], [event_id, event_id])
        self.assertEqual(self.journal.pending(), [])

    async def test_standalone_proactive_uses_known_route_and_durable_queue(self):
        self.journal.start(self.job)
        with patch("wechatai_test.adapter.get_hermes_home", return_value=self.home), patch("wechatai_test.adapter.accounts", return_value={self.account_id: self.account}), patch("wechatai_test.transport.relay", AsyncMock(side_effect=OSError("offline"))):
            result = await standalone_send(None, self.account_id + ":" + self.job["routeId"], "后台任务完成")
            self.assertTrue(result["success"])
            with self.assertRaises(ValueError):
                await standalone_send(None, self.account_id + ":" + str(uuid.uuid4()), "wrong route")
        event = self.journal.pending()[0]
        self.assertNotIn("jobId", event)
        self.assertEqual(event["text"], "后台任务完成")

    async def test_credentials_are_scoped_and_redirects_rejected(self):
        other = transport.Journal(self.home, {**self.account, "token": "different-token"})
        try:
            self.journal.start(self.job)
            self.assertFalse(other.has_route(self.job["routeId"]))
            self.assertNotEqual(other.runner_id, self.journal.runner_id)
        finally:
            other.close()
        with self.assertRaises(ValueError):
            transport.origin("http://example.com")
        self.assertIsNone(transport.NoRedirect().redirect_request(None, None, 302, None, None, "https://elsewhere.example"))


if __name__ == "__main__":
    unittest.main()
