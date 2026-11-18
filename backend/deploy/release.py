#!/usr/bin/env python3
"""Root-owned /usr/local/libexec/wechatai-release; trusted releases only.

This installs code, never changes account routes or deletes previous releases.
The service must be bootstrapped by the operator; no credentials are accepted
as arguments. The root-owned service configuration selects standby or accounts.
"""

import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

ROOT = Path("/opt/wechatai")
UNIT = "wechatai-backend.service"
PROTOCOL = "wechatai-rpc-v1"


def run(args, *, capture=False):
    return subprocess.run(args, check=True, text=True, capture_output=capture)


def as_service(binary, *args):
    return run(["runuser", "-u", "wechatai", "--", str(binary), *args], capture=True)


def deployment_settings(binary):
    # PID 1 reads the root-owned environment file. The child emits only the two
    # public coordinates, with the same identity, state and cwd as the service.
    command = ["systemd-run", "--quiet", "--pipe", "--wait", "--collect",
               "-p", "User=wechatai", "-p", "Group=wechatai",
               "-p", "WorkingDirectory=/var/lib/wechatai",
               "-p", "StateDirectory=wechatai", "-p", "StateDirectoryMode=0700",
               "-p", "EnvironmentFile=/etc/wechatai/backend.env",
               str(binary), "deployment-settings"]
    return json.loads(run(command, capture=True).stdout)


def regular(path, uid, maximum):
    # Use the opened descriptor for reading, rather than following a replacement
    # symlink between an lstat check and copying a privileged destination.
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "rb") as source:
        info = os.fstat(source.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_nlink != 1 or not 0 < info.st_size <= maximum:
            raise ValueError("Invalid staged artifact file")
        return source.read(maximum + 1)


def activate_link(release, name="current"):
    temporary = ROOT / (name + ".next")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(release)
    temporary.replace(ROOT / name)
    sync_root()


def sync_root():
    directory = os.open(ROOT, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def start_service():
    try:
        run(["systemctl", "reset-failed", UNIT], capture=True)
    except subprocess.CalledProcessError:
        # systemd can unload a never-started, inactive unit after 'stop'.
        # It then has no rate-limit state to reset. 'start' loads it again.
        state = run(["systemctl", "show", "--property=ActiveState", "--value", UNIT], capture=True)
        if state.stdout.strip() != "inactive":
            raise
    run(["systemctl", "start", UNIT])


def health(commit, origin, *, standby=False):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    end = time.monotonic() + 45
    while time.monotonic() < end:
        try:
            for endpoint in (("healthz",) if standby else ("healthz", "readyz")):
                with opener.open(origin + "/" + endpoint, timeout=2) as response:
                    data = json.loads(response.read(65536))
                if not data.get("ok") or data.get("version") != commit:
                    raise ValueError("Health version or readiness mismatch")
                if standby and data.get("mode") != "standby":
                    raise ValueError("Expected standby process")
            return
        except (OSError, ValueError):
            time.sleep(1)
    raise RuntimeError(f"Backend {commit} failed health/readiness checks")


def install(incoming):
    if os.geteuid() != 0 or "SUDO_UID" not in os.environ:
        raise ValueError("Run using the configured deploy user's sudo rule")
    if not re.fullmatch(r"/tmp/wechatai-release\.[A-Za-z0-9]{10}", str(incoming)):
        raise ValueError("Invalid staging directory")
    uid = int(os.environ["SUDO_UID"])
    info = incoming.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != uid or info.st_mode & 0o077:
        raise ValueError("Staging directory must be private and owned by deploy user")
    manifest_bytes = regular(incoming / "manifest.json", uid, 16384)
    manifest = json.loads(manifest_bytes)
    commit = manifest.get("commit", "")
    arch = {"x86_64": "amd64", "aarch64": "arm64"}.get(platform.machine())
    if (manifest.get("format") != 1 or not re.fullmatch(r"[a-f0-9]{40}", commit)
            or manifest.get("version") != commit or manifest.get("dirty") is not False
            or manifest.get("os") != "linux" or manifest.get("arch") != arch
            or manifest.get("protocol") != PROTOCOL or manifest.get("binary") != "wechatai"):
        raise ValueError("Invalid or incompatible release manifest")
    binary = regular(incoming / "wechatai", uid, 256 * 1024 * 1024)
    if hashlib.sha256(binary).hexdigest() != manifest.get("sha256"):
        raise ValueError("Binary checksum mismatch")
    releases = ROOT / "releases"
    releases.mkdir(parents=True, exist_ok=True, mode=0o755)
    releases = releases.resolve(strict=True)
    release = releases / commit
    if release.exists():
        if (release / "manifest.json").read_bytes() != manifest_bytes or hashlib.sha256((release / "wechatai").read_bytes()).hexdigest() != manifest["sha256"]:
            raise ValueError("Release commit already exists with different contents")
    else:
        temporary = releases / (commit + ".incoming")
        if temporary.exists():
            raise ValueError("Unfinished release staging exists; inspect it before retrying")
        temporary.mkdir(mode=0o755)
        try:
            for name, content, mode in (("wechatai", binary, 0o755), ("manifest.json", manifest_bytes, 0o600)):
                path = temporary / name
                with path.open("xb") as target:
                    target.write(content)
                    target.flush()
                    os.fsync(target.fileno())
                path.chmod(mode)
            temporary.rename(release)
        except BaseException:
            shutil.rmtree(temporary, ignore_errors=True)
            raise
    candidate = release / "wechatai"
    version = json.loads(as_service(candidate, "version").stdout)
    if version != {"version": commit, "protocol": PROTOCOL}:
        raise ValueError("Binary version does not match manifest")
    # All capability checks occur before touching the running service or data.
    settings = deployment_settings(candidate)
    standby = settings.get("standby") is True
    if not standby:
        as_service(candidate, "check-ready")
    data_dir = settings["dataDir"]
    data_check = "check-standby" if standby else "check-data"
    as_service(candidate, data_check, data_dir)
    def probe(version):
        if standby:
            health(version, settings["healthOrigin"], standby=True)
        else:
            health(version, settings["healthOrigin"])
    current = ROOT / "current"
    def target(link):
        if not link.is_symlink():
            if link.exists():
                raise ValueError(f"{link.name} must be a release symlink")
            return None
        path = link.resolve(strict=True)
        if path.parent != releases:
            raise ValueError(f"{link.name} points outside the release directory")
        return path

    installed = target(current)
    previous = target(ROOT / "last-healthy")
    if previous is None and installed is not None:
        # Adopt an existing installation, or resume after an interrupted first
        # deployment. Only verified versions become rollback candidates.
        try:
            probe(installed.name)
        except RuntimeError:
            pass
        else:
            previous = installed
            activate_link(previous, "last-healthy")
    run(["systemctl", "stop", UNIT])
    try:
        # The second read-only check closes the race with the previous process.
        as_service(candidate, data_check, data_dir)
        activate_link(release)
        start_service()
        probe(commit)
        activate_link(release, "last-healthy")
    except BaseException:
        run(["systemctl", "stop", UNIT])
        # Neither a failed candidate nor an incompatible rollback may be
        # started by a later service restart. Keep both release directories.
        if current.is_symlink():
            current.unlink()
            sync_root()
        if previous is not None:
            as_service(previous / "wechatai", data_check, data_dir)
            activate_link(previous)
            try:
                start_service()
                probe(previous.name)
            except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
                run(["systemctl", "stop", UNIT])
                current.unlink()
                sync_root()
                raise RuntimeError(f"Rollback to {previous.name} failed: {error}") from error
        raise
    print(json.dumps({"ok": True, "commit": commit, "previous": previous.name if previous else None}))


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: wechatai-release /tmp/wechatai-release.XXXXXXXXXX")
        with open("/run/lock/wechatai-release.lock", "a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            install(Path(sys.argv[1]))
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        # Captured child output can contain account diagnostics; don't echo it.
        print("Release failed: " + str(error), file=sys.stderr)
        sys.exit(1)
