import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import uuid

import connect
from connector import Connector, RelayError, request


class Relay:
    def __init__(self):
        self.job = {"id": "message-1", "routeId": str(uuid.uuid4()), "text": "整理计划", "state": "pending"}
        self.calls = []
        self.events = []
        self.receipts = {}
        self.next_jobs = []
        self.accepted_text = None
        self.max_output_tokens = 4096

    def __call__(self, account, action, body):
        self.calls.append((action, body))
        if action == "poll":
            return {"jobs": [self.job] if self.job else []}
        if action == "claim":
            claimed = self.job["state"] == "pending"
            self.job["state"] = "claimed"
            return {"claimed": claimed, "maxOutputTokens": self.max_output_tokens}
        if action == "event":
            if body["eventId"] in self.receipts:
                return self.receipts[body["eventId"]]
            self.events.append(body)
            if body.get("jobId"):
                self.job = self.next_jobs.pop(0) if self.next_jobs else None
            failed = body["status"] == "failed"
            text = "Muse 未完成这次任务，本次未扣费。" if failed else (self.accepted_text if self.accepted_text is not None else body["text"])
            receipt = {"status": "queued", "acceptedText": text, "truncated": not failed and text != body["text"]}
            self.receipts[body["eventId"]] = receipt
            return receipt
        return {"ok": True}


class ConnectorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        (self.home / "account.json").write_text(json.dumps({"endpoint": "https://wechatai.example", "token": "private-fixture-token"}))
        self.relay = Relay()
        self.c = Connector(self.home, self.relay)

    def tearDown(self):
        self.c.close()
        self.temp.cleanup()

    def take(self):
        wake = self.c.watch()
        self.assertTrue(wake["wake"])
        result = self.c.take(wake["jobId"])
        self.assertTrue(result["claimed"])
        return result

    def test_duplicate_wakes_and_take_do_not_execute_twice(self):
        job = self.take()
        self.assertEqual(self.c.take(job["jobId"]), {"claimed": False})
        self.assertEqual(self.c.watch(), {"wake": False})
        self.assertEqual(sum(action == "claim" for action, _ in self.relay.calls), 1)

    def test_final_reply_is_durable_and_retry_keeps_event_id(self):
        job = self.take()
        receipt = self.c.queue(job["routeId"], "最终计划", job["jobId"])
        self.assertEqual(self.c.queue(job["routeId"], "重复结果", job["jobId"]), receipt)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 0)
        self.assertEqual(dict(self.c.db.execute("SELECT state,text FROM jobs").fetchone()), {"state": "sending", "text": job["text"]})
        self.c.close()
        self.c = Connector(self.home, self.relay)
        self.c.flush()
        self.assertEqual(self.relay.events[0]["eventId"], receipt["eventId"])
        self.assertEqual(self.relay.events[0]["text"], "最终计划")
        self.assertEqual(dict(self.c.db.execute("SELECT state,text FROM jobs").fetchone()), {"state": "finished", "text": ""})
        self.c.flush()
        self.assertEqual(len(self.relay.events), 1)

    def test_timed_out_send_retries_identical_event(self):
        job = self.take()
        self.c.queue(job["routeId"], "最终结果", job["jobId"])
        original = self.c.relay
        attempts = []

        def lose_response(action, body):
            result = original(action, body)
            if action == "event":
                attempts.append(body)
                if len(attempts) == 1:
                    raise TimeoutError()
            return result

        self.c.relay = lose_response
        with self.assertRaises(TimeoutError):
            self.c.flush()
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 0)
        self.c.flush()
        self.assertEqual(attempts[0], attempts[1])
        self.assertEqual(len(self.relay.events), 1)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 2)

    def test_deleted_history_receipt_finishes_without_restoring_a_transcript(self):
        job = self.take()
        queued = self.c.queue(job["routeId"], "已经删除的回复", job["jobId"])
        original = self.c.relay

        def lose_receipt(action, body):
            result = original(action, body)
            if action == "event":
                raise TimeoutError()
            return result

        self.c.relay = lose_receipt
        with self.assertRaises(TimeoutError):
            self.c.flush()
        # The user clears the platform history before the lost receipt is retried.
        self.relay.receipts[queued["eventId"]].update(acceptedText="", historyCleared=True)
        self.c.relay = original
        self.c.flush()
        self.assertEqual(len(self.relay.events), 1)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 0)
        self.assertEqual(dict(self.c.db.execute("SELECT state,text FROM jobs").fetchone()), {"state": "finished", "text": ""})
        self.assertEqual(dict(self.c.db.execute("SELECT state,data FROM outbox").fetchone()), {"state": "sent", "data": "{}"})

    def test_permission_pause_retains_reply_and_resumes_the_next_job_after_restart(self):
        for index, code in enumerate(("plugin_disabled", "plugin_limit", None)):
            with self.subTest(code=code):
                route = str(uuid.uuid4())
                self.relay.job = {"id": f"paused-{index}", "routeId": route, "text": "整理计划", "state": "pending"}
                self.relay.next_jobs = [{"id": f"next-{index}", "routeId": route, "text": "继续", "state": "pending"}]
                job = self.take()
                queued = self.c.queue(route, "完整结果", job["jobId"])
                original = self.c.relay

                def deny_event(action, body):
                    if action == "event":
                        raise RelayError(403, code)
                    return original(action, body)

                self.c.relay = deny_event
                self.assertEqual(self.c.watch(), {"wake": False})
                row = self.c.db.execute("SELECT state,data FROM outbox WHERE id=?", (queued["eventId"],)).fetchone()
                self.assertEqual(row["state"], "pending")
                self.assertEqual(json.loads(row["data"])["text"], "完整结果")
                self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages WHERE routeId=?", (route,)).fetchone()[0], 0)
                # Even a stale wake may not start another task before this receipt.
                self.assertEqual(self.c.take(f"next-{index}"), {"claimed": False})
                self.c.close()
                self.c = Connector(self.home, self.relay)
                next_job = self.take()
                self.assertEqual(next_job["jobId"], f"next-{index}")
                self.assertEqual(next_job["history"], [{"role": "user", "text": "整理计划"}, {"role": "assistant", "text": "完整结果"}])
                self.assertEqual(self.relay.events[-1]["eventId"], queued["eventId"])
                self.c.queue(route, "下一轮已完成", next_job["jobId"])
                self.c.flush()

    def test_truncated_reply_history_uses_the_accepted_text_after_a_lost_receipt(self):
        job = self.take()
        self.relay.accepted_text = "用户实际收到的部分"
        self.c.queue(job["routeId"], "用户实际收到的部分，还有未发送的选项", job["jobId"])
        original = self.c.relay

        def lose_receipt(action, body):
            result = original(action, body)
            if action == "event":
                raise TimeoutError()
            return result

        self.c.relay = lose_receipt
        with self.assertRaises(TimeoutError):
            self.c.flush()
        self.c.relay = original
        self.c.flush()
        self.relay.job = {"id": "follow-up", "routeId": job["routeId"], "text": "继续", "state": "pending"}
        follow_up = self.take()
        self.assertEqual(follow_up["history"][-1], {"role": "assistant", "text": "用户实际收到的部分"})
        self.assertNotIn("未发送的选项", json.dumps(follow_up["history"], ensure_ascii=False))
        self.assertEqual(len(self.relay.events), 1)

    def test_overlapping_flushes_record_one_history_pair(self):
        job = self.take()
        self.c.queue(job["routeId"], "结果", job["jobId"])
        original = self.c.relay

        def overlap(action, body):
            result = original(action, body)
            if action == "event":
                other = Connector(self.home, self.relay)
                try:
                    other.flush()
                finally:
                    other.close()
            return result

        self.c.relay = overlap
        self.c.flush()
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 2)
        self.assertEqual(len(self.relay.events), 1)

    def test_credit_paused_pushes_do_not_starve_user_results_and_recover_with_same_ids(self):
        job = self.take()
        pushes = [self.c.queue(job["routeId"], f"通知 {index}", push_key=f"notification-{index}") for index in range(25)]
        self.c.queue(job["routeId"], "任务已完成", job["jobId"])
        original = self.c.relay
        paused_attempts = []

        def pause_pushes(action, body):
            if action == "event" and not body.get("jobId"):
                paused_attempts.append(body["eventId"])
                raise RelayError(402, "insufficient_credits")
            return original(action, body)

        self.c.relay = pause_pushes
        self.relay.next_jobs = [{"id": "next", "routeId": job["routeId"], "text": "继续", "state": "pending"}]
        next_job = self.take()
        self.assertEqual(next_job["jobId"], "next")
        self.assertEqual(next_job["history"][-1]["text"], "任务已完成")
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox WHERE state='pending'").fetchone()[0], 25)
        self.assertGreater(len(paused_attempts), 0)
        self.assertLessEqual(len(paused_attempts), 2)
        self.c.relay = original
        self.c.flush()
        self.c.flush()
        self.assertEqual({event["eventId"] for event in self.relay.events if not event.get("jobId")}, {push["eventId"] for push in pushes})
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox WHERE state='pending'").fetchone()[0], 0)

    def test_disabled_proactive_preference_does_not_replay_notifications(self):
        job = self.take()
        push = self.c.queue(job["routeId"], "后台通知", push_key="notification-1")
        original = self.c.relay
        self.c.relay = lambda *args: (_ for _ in ()).throw(RelayError(403, "claw_push_disabled"))
        self.c.flush()
        row = self.c.db.execute("SELECT state,data FROM outbox WHERE id=?", (push["eventId"],)).fetchone()
        self.assertEqual(dict(row), {"state": "rejected", "data": "{}"})
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 0)
        self.c.relay = original
        self.assertEqual(self.c.queue(job["routeId"], "后台通知", push_key="notification-1"), {"eventId": push["eventId"], "state": "rejected"})
        self.c.flush()
        self.assertEqual(self.relay.events, [])

    def test_expired_worker_fails_without_reexecuting_tools(self):
        job = self.take()
        self.c.db.execute("UPDATE jobs SET touched=0")
        self.c.watch()
        self.assertEqual(self.relay.events[0]["status"], "failed")
        history = self.c.db.execute("SELECT role,text FROM messages ORDER BY id").fetchall()
        self.assertEqual([dict(row) for row in history], [{"role": "user", "text": job["text"]}, {"role": "assistant", "text": "Muse 未完成这次任务，本次未扣费。"}])
        self.assertEqual(self.c.take(job["jobId"]), {"claimed": False})
        with self.assertRaises(ValueError):
            self.c.touch(job["jobId"])

    def test_unknown_claim_outcome_is_never_reclaimed(self):
        wake = self.c.watch()
        original = self.c.relay

        def lose_claim(action, body):
            result = original(action, body)
            if action == "claim":
                raise TimeoutError()
            return result

        self.c.relay = lose_claim
        with self.assertRaises(TimeoutError):
            self.c.take(wake["jobId"])
        self.assertFalse(self.c.take(wake["jobId"])["claimed"])
        self.c.relay = original
        self.c.db.execute("UPDATE jobs SET touched=0")
        self.c.watch()
        self.assertEqual(self.relay.events[0]["status"], "failed")

    def test_history_is_scoped_to_route(self):
        job = self.take()
        self.c.queue(job["routeId"], "第一轮回复", job["jobId"])
        self.c.flush()
        self.relay.job = {"id": "message-2", "routeId": job["routeId"], "text": "继续", "state": "pending"}
        self.assertEqual(len(self.take()["history"]), 2)
        self.c.queue(job["routeId"], "第二轮回复", "message-2")
        self.c.flush()
        self.relay.job = {"id": "message-3", "routeId": str(uuid.uuid4()), "text": "新会话", "state": "pending"}
        self.assertEqual(self.take()["history"], [])

    def test_expired_unknown_claim_is_closed_even_if_it_never_reached_server(self):
        wake = self.c.watch()
        original = self.c.relay
        self.c.relay = lambda *args: (_ for _ in ()).throw(TimeoutError())
        with self.assertRaises(TimeoutError):
            self.c.take(wake["jobId"])
        self.c.relay = original
        self.c.db.execute("UPDATE jobs SET touched=0")
        self.c.watch()
        self.assertIsNone(self.relay.job)
        self.assertEqual(self.relay.events[0]["status"], "failed")

    def test_denied_claim_can_be_retried_after_membership_renewal(self):
        wake = self.c.watch()
        original = self.c.relay
        self.c.relay = lambda *args: (_ for _ in ()).throw(RelayError(403))
        with self.assertRaises(RelayError):
            self.c.take(wake["jobId"])
        self.c.relay = original
        self.assertTrue(self.c.take(wake["jobId"])["claimed"])

    def test_new_credentials_use_a_new_runner_and_private_journal(self):
        runner = self.c.runner
        (self.home / "account.json").write_text(json.dumps({"endpoint": "https://wechatai.example", "token": "replacement-token"}))
        with_connector = Connector(self.home, self.relay)
        try:
            self.assertNotEqual(runner, with_connector.runner)
            self.assertEqual(with_connector.db.execute("SELECT count(*) FROM routes").fetchone()[0], 0)
        finally:
            with_connector.close()
        for journal in self.home.glob("journal-*.sqlite"):
            self.assertEqual(journal.stat().st_mode & 0o777, 0o600)

    def test_unknown_route_and_oversized_reply_are_not_accepted(self):
        with self.assertRaises(ValueError):
            self.c.queue(str(uuid.uuid4()), "推送")
        job = self.take()
        with self.assertRaises(ValueError):
            self.c.queue(job["routeId"], "x" * 30001, job["jobId"])
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox").fetchone()[0], 0)
        for action in ("take", "touch"):
            result = subprocess.run([sys.executable, str(Path(__file__).parent / "connector.py"), "--home", str(self.home), action], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("需要 --job", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_push_retries_keep_the_first_event_across_restart_and_lost_receipts(self):
        job = self.take()
        route = job["routeId"]
        first = self.c.queue(route, "本次定时提醒", push_key="daily-reminder:2026-11-13T09:00:00+08:00")
        # The CLI output was lost; resubmitting must preserve the original payload.
        retry = self.c.queue(route, "重试时改变的内容", push_key="daily-reminder:2026-11-13T09:00:00+08:00")
        self.assertEqual(retry, first)
        original = self.c.relay

        def lose_receipt(action, body):
            result = original(action, body)
            if action == "event":
                raise TimeoutError()
            return result

        self.c.relay = lose_receipt
        with self.assertRaises(TimeoutError):
            self.c.flush()
        self.c.close()
        self.c = Connector(self.home, self.relay)
        self.c.flush()
        self.assertEqual(self.c.queue(route, "再次重试", push_key="daily-reminder:2026-11-13T09:00:00+08:00"), {"eventId": first["eventId"], "state": "sent"})
        self.assertEqual(len(self.relay.events), 1)
        self.assertEqual(self.relay.events[0]["text"], "本次定时提醒")
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages WHERE role='assistant'").fetchone()[0], 1)
        # Even recreating the local outbox cannot generate a second remote bill.
        self.c.db.execute("DELETE FROM outbox WHERE id=?", (first["eventId"],))
        recreated = self.c.queue(route, "本次定时提醒", push_key="daily-reminder:2026-11-13T09:00:00+08:00")
        self.assertEqual(recreated["eventId"], first["eventId"])
        self.c.flush()
        self.assertEqual(len(self.relay.events), 1)
        next_run = self.c.queue(route, "本次定时提醒", push_key="daily-reminder:2026-11-14T09:00:00+08:00")
        self.assertNotEqual(next_run["eventId"], first["eventId"])
        self.c.flush()
        self.assertEqual(len(self.relay.events), 2)

    def test_push_without_a_stable_key_is_rejected_before_enqueue(self):
        job = self.take()
        for key in (None, "", "   ", "x" * 201):
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.c.queue(job["routeId"], "提醒", push_key=key)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox").fetchone()[0], 0)
        result = subprocess.run([sys.executable, str(Path(__file__).parent / "connector.py"), "--home", str(self.home), "push", "--route", job["routeId"]], input="提醒", capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--key", result.stderr)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox").fetchone()[0], 0)

    def test_push_command_retries_return_the_same_event_without_reenqueueing(self):
        job = self.take()
        command = [sys.executable, str(Path(__file__).parent / "connector.py"), "--home", str(self.home), "push", "--route", job["routeId"], "--key", "reminder:2026-11-13T09:00:00+08:00"]
        first = subprocess.run(command, input="提醒正文", capture_output=True, text=True, check=True)
        retry = subprocess.run(command, input="提醒正文", capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(first.stdout), json.loads(retry.stdout))
        self.c.flush()
        sent = subprocess.run(command, input="提醒正文", capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(sent.stdout), {"eventId": json.loads(first.stdout)["eventId"], "state": "sent"})
        self.c.flush()
        self.assertEqual(len(self.relay.events), 1)
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM outbox").fetchone()[0], 1)

    def test_take_returns_the_current_server_output_limit(self):
        self.c.watch()
        self.relay.max_output_tokens = 256
        result = self.c.take(self.relay.job["id"])
        self.assertEqual(result["maxOutputTokens"], 256)

    def test_rejected_route_is_not_retried_forever(self):
        job = self.take()
        self.c.queue(job["routeId"], "完成", job["jobId"])
        original = self.c.relay
        self.c.relay = lambda *args: (_ for _ in ()).throw(RelayError(409, "claw_route_gone"))
        self.c.flush()
        self.assertEqual(self.c.db.execute("SELECT state FROM outbox").fetchone()[0], "rejected")
        self.assertEqual(self.c.db.execute("SELECT count(*) FROM messages").fetchone()[0], 0)
        self.assertEqual(dict(self.c.db.execute("SELECT state,text FROM jobs").fetchone()), {"state": "finished", "text": ""})
        self.c.relay = original
        self.relay.job = {"id": "new-route", "routeId": str(uuid.uuid4()), "text": "新的任务", "state": "pending"}
        self.assertEqual(self.take()["history"], [])


class InstallTests(unittest.TestCase):
    def package(self):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode="w:gz") as archive:
            for name in sorted(connect.FILES):
                data = (Path(__file__).parent / name).read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
        return output.getvalue()

    def test_reconnect_waits_for_running_jobs_and_all_pending_deliveries(self):
        archive = self.package()
        for state in ("running", "sending", "push", "paused", "offline"):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as temp:
                plugin_id = str(uuid.uuid4())
                code = "muse-pair1." + "a" * 64 + "." + plugin_id + "." + "b" * 43 + "." + "c" * 43
                calls = []

                def fetch(url, body=None, token=None):
                    calls.append(url)
                    if url.endswith("/heartbeat"):
                        if state == "paused":
                            raise connect.RequestError(403)
                        if state == "offline":
                            raise OSError("fixture unavailable")
                    return archive if body is None else json.dumps({"accountId": plugin_id, "token": "fixture-token"}).encode()

                with patch.object(Path, "home", return_value=Path(temp)), patch.object(connect, "fetch", side_effect=fetch), patch.object(connect, "ARCHIVE_SHA256", hashlib.sha256(archive).hexdigest()):
                    result = connect.connect({"endpoint": "https://wechatai.example", "code": code})
                    home = Path(result["setup"]).parent
                    c = Connector(home, Relay())
                    try:
                        wake = c.watch()
                        job = c.take(wake["jobId"])
                        if state != "running":
                            c.queue(job["routeId"], "待回传回复", job["jobId"])
                        if state == "push":
                            c.flush()
                            c.queue(job["routeId"], "待回传通知", push_key="reminder:one")
                        # Completed replies remain protected even after ten minutes.
                        if state == "sending":
                            c.db.execute("UPDATE jobs SET touched=0")
                        before = (home / "account.json").read_bytes()
                        before_calls = len(calls)
                        with self.assertRaisesRegex(RuntimeError, "待回传结果"):
                            connect.connect({"endpoint": "https://wechatai.example", "code": code})
                        self.assertEqual(calls[before_calls:], ["https://wechatai.example/api/muse/heartbeat"])
                        self.assertEqual((home / "account.json").read_bytes(), before)
                        if state == "running":
                            c.queue(job["routeId"], "", job["jobId"], failed=True)
                        c.flush()
                        self.assertTrue(connect.connect({"endpoint": "https://wechatai.example", "code": code})["configured"])
                    finally:
                        c.close()

    def test_reconnect_allows_an_explicitly_revoked_old_credential(self):
        archive = self.package()
        plugin_id = str(uuid.uuid4())
        code = "muse-pair1." + "a" * 64 + "." + plugin_id + "." + "b" * 43 + "." + "c" * 43
        paired_token = "fixture-old-token"

        def fetch(url, body=None, token=None):
            if body is None:
                return archive
            if url.endswith("/heartbeat"):
                raise connect.RequestError(401)
            return json.dumps({"accountId": plugin_id, "token": paired_token}).encode()

        with tempfile.TemporaryDirectory() as temp, patch.object(Path, "home", return_value=Path(temp)), patch.object(connect, "fetch", side_effect=fetch), patch.object(connect, "ARCHIVE_SHA256", hashlib.sha256(archive).hexdigest()):
            result = connect.connect({"endpoint": "https://wechatai.example", "code": code})
            home = Path(result["setup"]).parent
            c = Connector(home, Relay())
            try:
                wake = c.watch()
                job = c.take(wake["jobId"])
                c.queue(job["routeId"], "旧凭据已撤销，不能再发送", job["jobId"])
                paired_token = "fixture-new-token"
                connect.connect({"endpoint": "https://wechatai.example", "code": code})
                self.assertEqual(json.loads((home / "account.json").read_text())["token"], paired_token)
                # Old, disconnected journals must not permanently block later reconnects.
                paired_token = "fixture-next-token"
                connect.connect({"endpoint": "https://wechatai.example", "code": code})
                self.assertEqual(json.loads((home / "account.json").read_text())["token"], paired_token)
            finally:
                c.close()

    def test_stale_wake_cannot_claim_during_credential_replacement(self):
        archive = self.package()
        plugin_id = str(uuid.uuid4())
        code = "muse-pair1." + "a" * 64 + "." + plugin_id + "." + "b" * 43 + "." + "c" * 43
        processes = []
        paired_token = "fixture-old-token"
        job_id = None

        def fetch(url, body=None, token=None):
            if body is None:
                return archive
            if job_id:
                process = subprocess.Popen([sys.executable, str(Path(__file__).parent / "connector.py"), "--home", str(home), "take", "--job", job_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                processes.append(process)
                with self.assertRaises(subprocess.TimeoutExpired):
                    process.communicate(timeout=0.2)
            return json.dumps({"accountId": plugin_id, "token": paired_token}).encode()

        try:
            with tempfile.TemporaryDirectory() as temp, patch.object(Path, "home", return_value=Path(temp)), patch.object(connect, "fetch", side_effect=fetch), patch.object(connect, "ARCHIVE_SHA256", hashlib.sha256(archive).hexdigest()):
                result = connect.connect({"endpoint": "https://wechatai.example", "code": code})
                home = Path(result["setup"]).parent
                c = Connector(home, Relay())
                try:
                    job_id = c.watch()["jobId"]
                    paired_token = "fixture-new-token"
                    connect.connect({"endpoint": "https://wechatai.example", "code": code})
                    output, errors = processes[0].communicate(timeout=5)
                    self.assertEqual(processes[0].returncode, 0, errors)
                    self.assertEqual(json.loads(output), {"claimed": False})
                    self.assertEqual(c.db.execute("SELECT state FROM jobs").fetchone()[0], "pending")
                finally:
                    c.close()
        finally:
            for process in processes:
                if process.poll() is None:
                    process.kill()
                process.communicate(timeout=5)

    def test_installer_hook_wake_and_dry_run_contract(self):
        archive = self.package()
        plugin_id = str(uuid.uuid4())
        code = "muse-pair1." + "a" * 64 + "." + plugin_id + "." + "b" * 43 + "." + "c" * 43
        calls = []

        def fetch(url, body=None, token=None):
            calls.append((url, body, token))
            if body is None:
                return archive
            return json.dumps({"accountId": plugin_id, "token": "private-token"}).encode()

        with tempfile.TemporaryDirectory(prefix="muse hook ' test") as temp, patch.object(Path, "home", return_value=Path(temp)), patch.object(connect, "fetch", side_effect=fetch), patch.object(connect, "ARCHIVE_SHA256", hashlib.sha256(archive).hexdigest()):
            result = connect.connect({"endpoint": "https://wechatai.example", "code": code})
            home = Path(result["setup"]).parent
            self.assertEqual((home / "account.json").stat().st_mode & 0o777, 0o600)
            self.assertFalse(list(home.glob("journal-*.sqlite")))
            proof = calls[-1][1]["proof"]
            connect.connect({"endpoint": "https://wechatai.example", "code": code})
            self.assertEqual(calls[-1][1]["proof"], proof)
            runtime = Path(temp) / "runtime.sh"
            runtime.write_text('silent() { echo "SILENT:$1"; }; wake() { echo "WAKE:$1:$2"; };\n')
            environment = {**os.environ, "HATCH_HOOK_RUNTIME": str(runtime), "HATCH_HOOK_DRY_RUN": "1"}
            dry = subprocess.run(["bash", result["hook"]], env=environment, capture_output=True, text=True, check=True)
            self.assertIn("SILENT:", dry.stdout)
            self.assertFalse(list(home.glob("journal-*.sqlite")))
            self.assertNotIn("private-token", dry.stdout + dry.stderr)
            # Exercise the actual shell wrapper against a minimal connector output.
            (home / "connector.py").write_text('import json; print(json.dumps({"wake":True,"jobId":"test-job","home":"fixture"}))\n')
            environment["HATCH_HOOK_DRY_RUN"] = "0"
            live = subprocess.run(["bash", result["hook"]], env=environment, capture_output=True, text=True, check=True)
            self.assertIn("WAKE:wechatai_message:", live.stdout)
            self.assertIn('"jobId": "test-job"', live.stdout)

    def test_request_uses_muse_scope_and_refuses_redirects(self):
        requests = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_POST(self):
                requests.append((self.path, self.headers.get("Authorization"), self.headers.get("User-Agent")))
                self.rfile.read(int(self.headers["Content-Length"]))
                if self.path.endswith("heartbeat"):
                    self.send_response(302)
                    self.send_header("Location", "/stolen")
                    self.end_headers()
                elif self.path.endswith("event"):
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b'{"error":"plugin_disabled","message":"fixture"}')
                elif self.path.endswith("claim"):
                    self.send_response(403)
                    self.end_headers()
                    self.wfile.write(b'<html>Temporarily forbidden</html>')
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'{"jobs":[]}')

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            account = {"endpoint": f"http://127.0.0.1:{server.server_port}", "token": "fixture"}
            self.assertEqual(request(account, "poll", {}), {"jobs": []})
            with self.assertRaises(RelayError):
                request(account, "heartbeat", {})
            with self.assertRaises(RelayError) as denied:
                request(account, "event", {})
            self.assertEqual((denied.exception.status, denied.exception.code), (403, "plugin_disabled"))
            with self.assertRaises(RelayError) as temporary:
                request(account, "claim", {})
            self.assertEqual((temporary.exception.status, temporary.exception.code), (403, None))
            self.assertEqual([r[0] for r in requests], ["/api/muse/poll", "/api/muse/heartbeat", "/api/muse/event", "/api/muse/claim"])
            self.assertTrue(all(r[1] == "Bearer fixture" and r[2] == "Wechatai-Muse/1.0.0" for r in requests))
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
