"""Install a Muse hosted hook. Hook registration is performed by Muse itself."""
import base64
from contextlib import closing
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shlex
import sqlite3
import tarfile
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

ARCHIVE_SHA256 = "a8901628a22bb573210e9548068c202f6f09a0d9490308e7e26fa4ee0a709350"
FILES = {"connector.py", "WORKER.md", "README.md", "LICENSE"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


class RequestError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"微伴连接失败（HTTP {status}），请检查网络或重新生成连接指令")


def fetch(url, body=None, token=None):
    headers = {"Content-Type": "application/json", "User-Agent": "Wechatai-Muse/1.0.0"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
            data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise RuntimeError("安装包过大")
            return data
    except urllib.error.HTTPError as error:
        error.close()
        raise RequestError(error.code) from None


def atomic_write(path, data, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, temp = tempfile.mkstemp(prefix=".wechatai-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp, mode)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def check_reconnect(home):
    account_file = home / "account.json"
    if not account_file.exists():
        return
    account = json.loads(account_file.read_text())
    fingerprint = hashlib.sha256((account["endpoint"] + "\0" + account["token"]).encode()).hexdigest()
    journal = home / ("journal-" + fingerprint + ".sqlite")
    if not journal.exists():
        return
    with closing(sqlite3.connect(journal)) as db:
        busy = db.execute("SELECT 1 FROM jobs WHERE state='sending' OR (state IN ('starting','running') AND touched>?)", (time.time() - 600,)).fetchone()
        pending = db.execute("SELECT 1 FROM outbox WHERE state='pending'").fetchone()
    if not busy and not pending:
        return
    try:
        fetch(account["endpoint"] + "/api/muse/heartbeat", {"nativeCommands": False, "connectorVersion": "1.0.0"}, account["token"])
    except RequestError as error:
        if error.status == 401:
            # An explicitly revoked credential can no longer deliver the old queue.
            return
    except OSError:
        pass
    raise RuntimeError("Muse 仍有处理中任务或待回传结果。请恢复原 hook 的网络、权限或额度，等待结果回传后再重新连接")


def connect(options):
    os.umask(0o077)
    u = urllib.parse.urlsplit(options["endpoint"])
    if u.scheme != "https" and not (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1", "::1")):
        raise RuntimeError("仅支持 HTTPS 或本机回环 HTTP")
    if not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ("", "/"):
        raise RuntimeError("站点地址必须为 origin")
    endpoint = f"{u.scheme}://{u.netloc}"
    code = options["code"]
    if not re.fullmatch(r"muse-pair1\.[a-f0-9]{64}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}", code):
        raise RuntimeError("配对指令格式无效")
    plugin_id = code.split(".")[2]
    home = Path.home() / "hooks" / "state" / "wechatai-muse" / plugin_id
    home.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Serialize the check and credential replacement with every connector command.
    with open(home / "watch.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return install(home, endpoint, code, plugin_id)


def install(home, endpoint, code, plugin_id):
    check_reconnect(home)
    proof_file = home / ("pair-" + hashlib.sha256(code.encode()).hexdigest() + ".json")
    if proof_file.exists():
        proof = json.loads(proof_file.read_text())["proof"]
    else:
        proof = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
        atomic_write(proof_file, json.dumps({"proof": proof}).encode())
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", proof):
        raise RuntimeError("本地配对证明无效，请重新生成指令")
    archive = fetch(endpoint + "/downloads/wechatai-muse-1.0.0.tgz")
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError("Muse 连接包校验失败，请刷新页面后重试")
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
        for member in package.getmembers():
            if member.name not in FILES or not member.isfile() or member.size > 262144 or member.name in contents:
                raise RuntimeError("Muse 连接包结构无效")
            contents[member.name] = package.extractfile(member).read()
    if set(contents) != FILES:
        raise RuntimeError("Muse 连接包不完整")
    for name, data in contents.items():
        atomic_write(home / name, data)
    paired = json.loads(fetch(endpoint + "/api/muse/pair", {"proof": proof, "agents": [{"id": "main", "name": "Muse 托管助理", "isDefault": True}]}, code))
    if paired.get("accountId") != plugin_id or not isinstance(paired.get("token"), str) or not paired["token"]:
        raise RuntimeError("Muse 配对响应无效")
    account = {"endpoint": endpoint, "token": paired["token"]}
    account_file = home / "account.json"
    # Each credential has its own journal; an in-flight old hook cannot corrupt it.
    atomic_write(account_file, json.dumps(account).encode())
    helper = f"python3 {shlex.quote(str(home / 'connector.py'))} --home {shlex.quote(str(home))}"
    hook = Path.home() / "hooks" / "scripts" / ("wechatai-muse-" + plugin_id + ".sh")
    script = '''#!/usr/bin/env bash
set -euo pipefail
source "$HATCH_HOOK_RUNTIME"
if [ "${HATCH_HOOK_DRY_RUN:-0}" = "1" ]; then
  silent "微伴 Muse hook 已安装；dry run 不领取任务或发送回复"
  exit 0
fi
if ! result=$(__HELPER__ watch); then
  silent "微伴连接暂不可用，请检查配对、会员或网络"
  exit 0
fi
if python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("wake") else 1)' <<< "$result"; then
  wake "wechatai_message" "$result"
else
  silent "没有待处理的微伴消息"
fi
'''.replace("__HELPER__", helper)
    atomic_write(hook, script.encode(), 0o700)
    setup = f"""# Muse hook 安装收尾

请使用 Muse 自带的 hooks 管理工具，为当前托管环境注册或更新 hook（不要创建重复 hook）：

- 名称：wechatai-muse-{plugin_id}
- 脚本：{hook}
- 轮询间隔：5 秒
- 单轮脚本超时：60 秒（包含最多 15 秒长轮询）
- worker 指令：读取 {home / 'WORKER.md'} 并严格按它处理 wake payload。
- 注册后启用，再实际运行一次。dry run 不会联网，不算上线验证。

在工具中查看运行状态与日志。只有真实 hook 成功轮询后，微伴才显示已连接。
若当前 Muse 版本没有 hook 运行环境或无法注册，不要用后台 shell 进程替代；告知用户尚未完成连接。
本安装程序不会注册 hook、创建微信连接、修改其他 hook 或重启 Muse。
不要输出 account.json、配对指令或永久凭据。配对已保存不代表 hook 已运行。
同一 Muse 环境可保存多个微伴配置，但共享该 Muse 的长期记忆和工具，不能用于不互信用户。
"""
    atomic_write(home / "SETUP.md", setup.encode())
    print(f"配对配置已保存。请读取 {home / 'SETUP.md'} 注册并启用 Muse hook；当前尚未确认上线。", flush=True)
    return {"configured": True, "setup": str(home / "SETUP.md"), "hook": str(hook)}
