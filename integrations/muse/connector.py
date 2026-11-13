"""Muse hook transport: durable claims and final replies, Python standard library only."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

VERSION = "1.0.0"
LEASE_SECONDS = 600
AGENTS = [{"id": "main", "name": "Muse 托管助理", "isDefault": True}]


class RelayError(Exception):
    def __init__(self, status, code=None):
        self.status = status
        self.code = code
        super().__init__(f"微伴连接请求失败（HTTP {status}）")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def origin(value):
    u = urllib.parse.urlsplit(value)
    if u.scheme != "https" and not (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")):
        raise ValueError("仅支持 HTTPS 或本机回环 HTTP")
    if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise ValueError("站点地址必须为 origin")
    return f"{u.scheme}://{u.netloc}"


def request(account, action, body):
    req = urllib.request.Request(
        origin(account["endpoint"]) + "/api/muse/" + action,
        data=json.dumps(body, ensure_ascii=False).encode(), method="POST",
        headers={"Authorization": "Bearer " + account["token"], "Content-Type": "application/json", "User-Agent": "Wechatai-Muse/" + VERSION},
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=20) as response:
            data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024:
                raise ValueError("微伴响应过大")
            return json.loads(data)
    except urllib.error.HTTPError as error:
        code = None
        try:
            data = json.loads(error.read(8192))
            if isinstance(data, dict) and isinstance(data.get("error"), str):
                code = data["error"]
        except (OSError, ValueError):
            pass
        finally:
            error.close()
        raise RelayError(error.code, code) from None


class Connector:
    def __init__(self, home, relay=request):
        self.home = Path(home).resolve()
        self.account = json.loads((self.home / "account.json").read_text())
        self.relay = lambda action, body: relay(self.account, action, body)
        fingerprint = hashlib.sha256((self.account["endpoint"] + "\0" + self.account["token"]).encode()).hexdigest()
        journal = self.home / ("journal-" + fingerprint + ".sqlite")
        self.db = sqlite3.connect(journal, isolation_level=None, timeout=10)
        os.chmod(journal, 0o600)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
          PRAGMA journal_mode=WAL;
          PRAGMA synchronous=FULL;
          CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, routeId TEXT NOT NULL, text TEXT NOT NULL, state TEXT NOT NULL, touched REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS routes (id TEXT PRIMARY KEY);
          CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, routeId TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, jobId TEXT UNIQUE, data TEXT NOT NULL, state TEXT NOT NULL);
        """)
        self.db.execute("INSERT OR IGNORE INTO settings VALUES ('runnerId',?)", (str(uuid.uuid4()),))
        self.runner = self.db.execute("SELECT value FROM settings WHERE id='runnerId'").fetchone()[0]

    @contextlib.contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.db.execute("COMMIT")
        except BaseException:
            self.db.execute("ROLLBACK")
            raise

    def close(self):
        self.db.close()

    def queue(self, route_id, text, job_id=None, failed=False, expired_only=False, push_key=None):
        if not self.db.execute("SELECT 1 FROM routes WHERE id=?", (route_id,)).fetchone():
            raise ValueError("未知返回路由，请先从微信发起对话")
        if not failed and (not text.strip() or len(text) > 30000):
            raise ValueError("最终回复需为 1–30000 字符，请先精简后再提交")
        if not job_id:
            if not isinstance(push_key, str) or not 1 <= len(push_key.strip()) <= 200:
                raise ValueError("主动通知需要 1–200 字符的单次发送标识 --key；同一次发送重试须沿用原标识")
            # Stable across command retries, process restarts and local journal loss.
            event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "wechatai-muse-push:" + route_id + "\0" + push_key.strip()))
        else:
            event_id = str(uuid.uuid4())
        with self.transaction():
            if job_id:
                previous = self.db.execute("SELECT id,state FROM outbox WHERE jobId=?", (job_id,)).fetchone()
                if previous:
                    return {"eventId": previous["id"], "state": previous["state"]}
                job = self.db.execute("SELECT * FROM jobs WHERE id=? AND routeId=?", (job_id, route_id)).fetchone()
                if not job or job["state"] not in ("starting", "running"):
                    raise ValueError("任务未领取或已结束")
                if expired_only and job["touched"] >= time.time() - LEASE_SECONDS:
                    return {"state": job["state"]}
                if not failed and job["touched"] < time.time() - LEASE_SECONDS:
                    raise ValueError("任务处理租约已过期，不能提交成功结果")
            else:
                previous = self.db.execute("SELECT state FROM outbox WHERE id=?", (event_id,)).fetchone()
                if previous:
                    return {"eventId": event_id, "state": previous["state"]}
            event = {"eventId": event_id, "routeId": route_id, "status": "failed" if failed else "completed", "text": "" if failed else text.strip()}
            if job_id:
                event.update(jobId=job_id, runnerId=self.runner)
            self.db.execute("INSERT INTO outbox VALUES (?,?,?,'pending')", (event["eventId"], job_id, json.dumps(event)))
            if job_id:
                # Tools are done, but the job and its input remain until relay acknowledgement.
                self.db.execute("UPDATE jobs SET state='sending' WHERE id=?", (job_id,))
        return {"eventId": event["eventId"], "state": "pending"}

    def flush(self):
        # Paused proactive notifications must not starve a completed user task.
        for row in self.db.execute("SELECT id,jobId,data FROM outbox WHERE state='pending' ORDER BY jobId IS NULL,rowid LIMIT 20").fetchall():
            event = json.loads(row["data"])
            receipt = None
            try:
                receipt = self.relay("event", event)
                if not isinstance(receipt, dict) or not isinstance(receipt.get("acceptedText"), str):
                    raise ValueError("微伴回执缺少实际接收的正文")
                state = "sent"
            except RelayError as error:
                if error.status in (402, 403) and error.code != "claw_push_disabled":
                    # Membership, plugin access and credit pauses can recover.
                    # Retain both payload and event ID; never execute tools again.
                    # The same pause also affects the remaining notifications.
                    break
                if error.status not in (400, 401, 403, 409, 413, 422) and error.code != "plugin_missing":
                    raise
                state = "rejected"
            with self.transaction():
                # watch and a manual flush can receive the same idempotent receipt.
                if not self.db.execute("SELECT 1 FROM outbox WHERE id=? AND state='pending'", (row["id"],)).fetchone():
                    continue
                if state == "sent" and not receipt.get("historyCleared"):
                    if row["jobId"]:
                        job = self.db.execute("SELECT text FROM jobs WHERE id=?", (row["jobId"],)).fetchone()
                        self.db.execute("INSERT INTO messages(routeId,role,text) VALUES (?,'user',?)", (event["routeId"], job["text"]))
                    self.db.execute("INSERT INTO messages(routeId,role,text) VALUES (?,'assistant',?)", (event["routeId"], receipt["acceptedText"]))
                    self.db.execute("DELETE FROM messages WHERE routeId=? AND id NOT IN (SELECT id FROM messages WHERE routeId=? ORDER BY id DESC LIMIT 20)", (event["routeId"], event["routeId"]))
                if row["jobId"]:
                    self.db.execute("UPDATE jobs SET state='finished',text='' WHERE id=?", (row["jobId"],))
                self.db.execute("UPDATE outbox SET state=?,data='{}' WHERE id=?", (state, row["id"]))

    def watch(self):
        self.flush()
        self.relay("heartbeat", {"agents": AGENTS, "nativeCommands": False, "connectorVersion": VERSION})
        for job in self.db.execute("SELECT * FROM jobs WHERE state IN ('starting','running') AND touched<?", (time.time() - LEASE_SECONDS,)).fetchall():
            if job["state"] == "starting":
                try:
                    # A lost claim request may never have reached the server.
                    # Claim only to close it as failed; never execute its tools.
                    self.relay("claim", {"id": job["id"], "runnerId": self.runner, "nativeCommands": False})
                except RelayError as error:
                    if error.status != 409:
                        raise
                    self.db.execute("UPDATE jobs SET state='finished',text='' WHERE id=?", (job["id"],))
                    continue
            self.queue(job["routeId"], "", job["id"], failed=True, expired_only=True)
        self.flush()
        if self.db.execute("SELECT 1 FROM jobs WHERE state IN ('starting','running','sending')").fetchone():
            return {"wake": False}
        result = self.relay("poll", {"runnerId": self.runner, "waitMs": 15000, "nativeCommands": False})
        for job in result["jobs"]:
            self.db.execute("INSERT OR IGNORE INTO routes VALUES (?)", (job["routeId"],))
            if job["state"] == "claimed":
                # This runner claimed it previously, but the worker disappeared.
                self.db.execute("INSERT OR IGNORE INTO jobs VALUES (?,?,?,'starting',0)", (job["id"], job["routeId"], job["text"]))
                current = self.db.execute("SELECT state,touched FROM jobs WHERE id=?", (job["id"],)).fetchone()
                if current["state"] in ("starting", "running") and current["touched"] < time.time() - LEASE_SECONDS:
                    self.queue(job["routeId"], "", job["id"], failed=True, expired_only=True)
                self.flush()
                return {"wake": False}
            self.db.execute("INSERT OR IGNORE INTO jobs VALUES (?,?,?,'pending',0)", (job["id"], job["routeId"], job["text"]))
            current = self.db.execute("SELECT state,touched FROM jobs WHERE id=?", (job["id"],)).fetchone()
            if current["state"] == "pending" and current["touched"] < time.time() - 30:
                self.db.execute("UPDATE jobs SET touched=? WHERE id=?", (time.time(), job["id"]))
                return {"wake": True, "jobId": job["id"], "home": str(self.home), "instructions": str(self.home / "WORKER.md")}
        return {"wake": False}

    def take(self, job_id):
        with self.transaction():
            if self.db.execute("SELECT 1 FROM jobs WHERE state IN ('starting','running','sending')").fetchone():
                return {"claimed": False}
            job = self.db.execute("SELECT * FROM jobs WHERE id=? AND state='pending'", (job_id,)).fetchone()
            if not job:
                return {"claimed": False}
            self.db.execute("UPDATE jobs SET state='starting',touched=? WHERE id=?", (time.time(), job_id))
        try:
            result = self.relay("claim", {"id": job_id, "runnerId": self.runner, "nativeCommands": False})
        except RelayError as error:
            if error.status == 403:
                # A denied claim has not executed. Membership renewal can retry it.
                self.db.execute("UPDATE jobs SET state='pending',touched=0 WHERE id=?", (job_id,))
            elif error.status in (400, 401, 409, 422):
                self.db.execute("UPDATE jobs SET state='finished',text='' WHERE id=?", (job_id,))
            # Unknown remote outcome remains starting; never rerun tools automatically.
            raise
        if not result.get("claimed"):
            self.queue(job["routeId"], "", job_id, failed=True)
            return {"claimed": False}
        self.db.execute("UPDATE jobs SET state='running',touched=? WHERE id=?", (time.time(), job_id))
        history = self.db.execute("SELECT role,substr(text,1,3000) AS text FROM messages WHERE routeId=? ORDER BY id DESC LIMIT 10", (job["routeId"],)).fetchall()
        return {"claimed": True, "jobId": job_id, "routeId": job["routeId"], "text": job["text"], "maxOutputTokens": result["maxOutputTokens"], "history": [dict(row) for row in reversed(history)]}

    def touch(self, job_id):
        changed = self.db.execute("UPDATE jobs SET touched=? WHERE id=? AND state='running' AND touched>=?", (time.time(), job_id, time.time() - LEASE_SECONDS)).rowcount
        if not changed:
            raise ValueError("任务已结束或处理租约已过期")
        return {"ok": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", required=True)
    parser.add_argument("action", choices=("watch", "take", "touch", "reply", "fail", "push", "flush"))
    parser.add_argument("--job")
    parser.add_argument("--route")
    parser.add_argument("--key", help="主动通知的单次发送标识；同一次发送重试沿用，不同次发送使用不同标识")
    args = parser.parse_args()
    if args.action == "push" and (not args.route or not args.key or not 1 <= len(args.key.strip()) <= 200):
        parser.error("push 需要 --route 和 1–200 字符的 --key；同一次发送重试须沿用原标识")
    if args.action in ("take", "touch") and not args.job:
        parser.error("需要 --job")
    os.umask(0o077)
    # Pairing holds this lock exclusively; open account.json only after acquiring it.
    with open(Path(args.home) / "watch.lock", "a") as lock:
        flags = fcntl.LOCK_EX | fcntl.LOCK_NB if args.action == "watch" else fcntl.LOCK_SH
        try:
            fcntl.flock(lock, flags)
        except BlockingIOError:
            print(json.dumps({"wake": False}))
            return 0
        return run(args)


def run(args):
    connector = Connector(args.home)
    try:
        if args.action == "watch":
            result = connector.watch()
        elif args.action in ("take", "touch"):
            result = getattr(connector, args.action)(args.job)
        elif args.action == "flush":
            connector.flush()
            result = {"ok": True}
        elif args.action == "push":
            result = connector.queue(args.route, sys.stdin.read(30001), push_key=args.key)
        else:
            job = connector.db.execute("SELECT routeId FROM jobs WHERE id=?", (args.job,)).fetchone()
            if not job:
                raise ValueError("未知任务")
            result = connector.queue(job["routeId"], "" if args.action == "fail" else sys.stdin.read(30001), args.job, args.action == "fail")
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, sqlite3.Error, RelayError):
        print("Muse 连接器未完成操作，请检查连接、配对有效期和任务状态。", file=sys.stderr)
        return 1
    finally:
        connector.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
