"""One-command installer. Uses only Python's standard library and the Hermes CLI."""
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tarfile
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ARCHIVE_SHA256 = "936a68b2a43358f51a93124c7cf28fd78559cd0528d99c880bacf781f21a13aa"
USER_AGENT = "Wechatai-Hermes/1.1.2"
FILES = {"__init__.py", "adapter.py", "transport.py", "plugin.yaml", "README.md"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def fetch(url, body=None, token=None):
    # Identify the connector; generic Python urllib signatures can be blocked at the edge.
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            data = response.read(2 * 1024 * 1024 + 1)
            if len(data) > 2 * 1024 * 1024:
                raise RuntimeError("下载内容过大")
            return data
    except urllib.error.HTTPError as error:
        error.close()
        if error.code == 403:
            raise RuntimeError("微伴连接被拒绝（HTTP 403），请刷新网页重新复制连接命令；如仍失败，请联系微伴支持") from None
        raise RuntimeError(f"微伴连接失败（HTTP {error.code}），请检查命令是否过期或重新生成") from None


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


def connect(options):
    executable = shutil.which("hermes")
    if not executable:
        candidate = Path.home() / ".local/bin/hermes"
        executable = str(candidate) if candidate.is_file() else None
    if not executable:
        raise RuntimeError("请先安装 Hermes Agent，再执行此连接命令：https://hermes-agent.nousresearch.com/docs/getting-started/installation")
    def cli(args, required=True):
        result = subprocess.run([executable, *args], text=True, capture_output=True, timeout=180)
        if result.returncode and required:
            raise RuntimeError("Hermes 命令未完成：hermes " + " ".join(args[:2]) + "。请检查本机配置后重试。")
        return result.stdout.strip() if result.returncode == 0 else None

    url = urllib.parse.urlsplit(options["endpoint"])
    if url.scheme != "https" and not (url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")):
        raise RuntimeError("仅支持 HTTPS 或本机回环 HTTP")
    if url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
        raise RuntimeError("站点地址必须为 origin")
    endpoint = f"{url.scheme}://{url.netloc}"
    code = options["code"]
    if not re.fullmatch(r"hermes-pair1\.[a-f0-9]{64}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}", code):
        raise RuntimeError("配对命令格式无效")
    config_path = Path(cli(["config", "path"]))
    if not config_path.is_absolute() or not config_path.is_file():
        raise RuntimeError("未找到当前 Hermes 配置，请先运行 hermes setup")
    home = config_path.parent
    state = home / "plugin-data" / "wechatai"
    proof_file = state / "pairing" / (hashlib.sha256(code.encode()).hexdigest() + ".json")
    if proof_file.exists():
        proof = json.loads(proof_file.read_text())["proof"]
    else:
        proof = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
        atomic_write(proof_file, json.dumps({"proof": proof}).encode())
    if not re.fullmatch(r"[A-Za-z0-9_-]{43}", proof):
        raise RuntimeError("本地重试凭证无效，请重新生成连接命令")

    print("1/3 正在安装微伴 Hermes 渠道…", flush=True)
    archive = fetch(endpoint + "/downloads/wechatai-hermes-1.1.2.tgz")
    if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError("渠道包校验失败，请重新生成连接命令")
    contents = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
        for member in package.getmembers():
            if member.name not in FILES or not member.isfile() or member.size > 262144 or member.name in contents:
                raise RuntimeError("渠道包结构无效")
            contents[member.name] = package.extractfile(member).read()
    if set(contents) != FILES:
        raise RuntimeError("渠道包不完整")
    plugin = home / "plugins" / "wechatai"
    for name, data in contents.items():
        if (plugin / name).exists():
            atomic_write(state / "previous-plugin" / name, (plugin / name).read_bytes())
        atomic_write(plugin / name, data)

    print("2/3 正在配对当前 Hermes 配置…", flush=True)
    payload = {"proof": proof, "agents": [{"id": "main", "name": "Hermes 当前配置", "isDefault": True}]}
    paired = None
    for attempt in range(3):
        try:
            paired = json.loads(fetch(endpoint + "/api/hermes/pair", payload, code))
            break
        except (OSError, TimeoutError):
            if attempt == 2:
                raise RuntimeError("网络暂时中断，可重新执行同一命令继续配对") from None
    if not paired or not re.fullmatch(r"[a-f0-9-]{36}", paired.get("accountId", "")) or not paired.get("token"):
        raise RuntimeError("配对响应无效")
    credentials = state / "accounts.json"
    saved = json.loads(credentials.read_text()) if credentials.exists() else {}
    saved[paired["accountId"]] = {"endpoint": endpoint, "token": paired["token"], "agentId": "main"}
    atomic_write(credentials, json.dumps(saved).encode())
    cli(["plugins", "enable", "wechatai", "--no-allow-tool-override"])
    cli(["config", "set", "WECHATAI_HERMES_ALLOWED_USERS", ",".join(sorted(saved))])
    # Only the new channel's presentation changes; other platforms retain their settings.
    cli(["config", "set", "display.platforms.wechatai.streaming", "false"])

    print("3/3 配置已保存，正在启动 Hermes Gateway…", flush=True)
    installed = cli(["gateway", "install", "--if-missing", "--start-now", "--no-start-on-login"], required=False)
    restarted = cli(["gateway", "restart"], required=False) if installed is not None else None
    if restarted is None:
        print("配置已保存。请按原有方式启动 Gateway，或执行：hermes gateway run", flush=True)
        return {"configured": True, "started": False}
    print("Hermes 已连接。回到微伴等待上线，然后在微信发送 /use hermes（以你设置的快捷名称为准）。", flush=True)
    return {"configured": True, "started": True}
