#!/usr/bin/env python3
"""Run-scoped Python exec server. Files persist; processes do not."""

from __future__ import annotations

import base64
import ctypes
import hashlib
import json
import os
import platform
import resource
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

WORKSPACE_ROOT = Path(os.environ.get("SANDBOX_WORKSPACE_ROOT", "/workspaces"))
LISTEN_HOST = os.environ.get("SANDBOX_HOST", "0.0.0.0")
LISTEN_PORT = int(os.environ.get("SANDBOX_PORT", "8080"))
MAX_WORKSPACE_BYTES = int(
    os.environ.get("SANDBOX_MAX_WORKSPACE_BYTES", str(32 * 1024 * 1024))
)
MAX_WORKSPACE_FILES = int(os.environ.get("SANDBOX_MAX_WORKSPACE_FILES", "1000"))
MAX_OUTPUT_BYTES = int(os.environ.get("SANDBOX_MAX_OUTPUT_BYTES", "65536"))
MAX_SOURCE_BYTES = int(os.environ.get("SANDBOX_MAX_SOURCE_BYTES", "100000"))
DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("SANDBOX_DEFAULT_TIMEOUT_SECONDS", "30"))
MAX_TIMEOUT_SECONDS = int(os.environ.get("SANDBOX_MAX_TIMEOUT_SECONDS", "120"))
UID_MIN = int(os.environ.get("SANDBOX_UID_MIN", "20000"))
UID_MAX = int(os.environ.get("SANDBOX_UID_MAX", "20099"))
MAX_CHILD_PROCS = int(os.environ.get("SANDBOX_MAX_CHILD_PROCS", "32"))
FUDA_ISSUER = os.environ.get("SANDBOX_FUDA_ISSUER", "").strip()
FUDA_JWKS_URI = os.environ.get("SANDBOX_FUDA_JWKS_URI", "").strip()
FUDA_JWKS_JSON = os.environ.get("SANDBOX_FUDA_JWKS_JSON", "").strip()
FUDA_AUDIENCE = "shaiden-sandbox"
JWKS_TTL_SECONDS = 60

RUN_ID_OK = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
_locks_guard = threading.Lock()
_run_locks: dict[str, threading.Lock] = {}
_uid_guard = threading.Lock()
_jwks_guard = threading.Lock()
_jwks_cached: dict | None = None
_jwks_loaded_at = 0.0


def load_jwks(force: bool = False) -> dict:
    global _jwks_cached, _jwks_loaded_at
    with _jwks_guard:
        fresh = (
            _jwks_cached is not None
            and not force
            and (
                FUDA_JWKS_JSON or time.monotonic() - _jwks_loaded_at < JWKS_TTL_SECONDS
            )
        )
        if fresh and _jwks_cached is not None:
            return _jwks_cached
        if FUDA_JWKS_JSON:
            document = json.loads(FUDA_JWKS_JSON)
        else:
            with urllib.request.urlopen(FUDA_JWKS_URI, timeout=5) as response:
                document = json.loads(response.read().decode())
        if not isinstance(document, dict) or not isinstance(document.get("keys"), list):
            raise RuntimeError("Fuda JWKS document is invalid")
        _jwks_cached = document
        _jwks_loaded_at = time.monotonic()
        return document


class BearerError(Exception):
    pass


def b64url_decode(segment: str) -> bytes:
    padding = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + padding)


def jwk_int(value: str) -> int:
    return int.from_bytes(b64url_decode(value), "big")


def rs256_valid(signing_input: bytes, signature: bytes, jwk: dict) -> bool:
    if jwk.get("kty") != "RSA" or "n" not in jwk or "e" not in jwk:
        return False
    modulus = jwk_int(jwk["n"])
    exponent = jwk_int(jwk["e"])
    key_bytes = (modulus.bit_length() + 7) // 8
    if len(signature) != key_bytes:
        return False
    decrypted = pow(int.from_bytes(signature, "big"), exponent, modulus).to_bytes(
        key_bytes, "big"
    )
    digest = hashlib.sha256(signing_input).digest()
    # DigestInfo for SHA-256, DER.
    prefix = bytes.fromhex("3031300d060960864801650304020105000420")
    expected = (
        b"\x00\x01"
        + (b"\xff" * (key_bytes - len(prefix) - len(digest) - 3))
        + b"\x00"
        + prefix
        + digest
    )
    return decrypted == expected


def jwk_for_kid(token: str) -> dict:
    header_segment = token.split(".", 1)[0]
    header = json.loads(b64url_decode(header_segment))
    if header.get("alg") != "RS256":
        raise BearerError("unsupported alg")
    kid = header.get("kid")

    def find(document: dict) -> dict | None:
        for key in document["keys"]:
            if isinstance(key, dict) and key.get("kid") == kid:
                return key
        return None

    found = find(load_jwks())
    if found is None and FUDA_JWKS_URI:
        found = find(load_jwks(force=True))
    if found is None:
        raise BearerError("unknown signing key")
    return found


def verify_bearer(header: str | None) -> None:
    if not header or not header.startswith("Bearer "):
        raise BearerError("missing bearer")
    token = header[7:].strip()
    parts = token.split(".")
    if len(parts) != 3:
        raise BearerError("malformed token")
    if not rs256_valid(
        f"{parts[0]}.{parts[1]}".encode(),
        b64url_decode(parts[2]),
        jwk_for_kid(token),
    ):
        raise BearerError("bad signature")
    claims = json.loads(b64url_decode(parts[1]))
    now = int(time.time())
    if claims.get("iss") != FUDA_ISSUER:
        raise BearerError("bad issuer")
    audience = claims.get("aud")
    audiences = audience if isinstance(audience, list) else [audience]
    if FUDA_AUDIENCE not in audiences:
        raise BearerError("bad audience")
    exp = claims.get("exp")
    if not isinstance(exp, int) or exp < now:
        raise BearerError("expired")


def run_lock(run_id: str) -> threading.Lock:
    with _locks_guard:
        lock = _run_locks.get(run_id)
        if lock is None:
            lock = threading.Lock()
            _run_locks[run_id] = lock
        return lock


def valid_run_id(run_id: str) -> bool:
    return 1 <= len(run_id) <= 128 and all(ch in RUN_ID_OK for ch in run_id)


def workspace_path(run_id: str) -> Path:
    path = (WORKSPACE_ROOT / run_id).resolve()
    if path.parent != WORKSPACE_ROOT.resolve():
        raise ValueError("run id escapes workspace root")
    return path


def usage(path: Path) -> tuple[int, int]:
    files = 0
    total = 0
    if not path.exists():
        return 0, 0
    for entry in path.rglob("*"):
        if entry.is_file() and not entry.is_symlink():
            files += 1
            total += entry.stat().st_size
    return files, total


def procs_for_uid(uid: int) -> list[int]:
    if not Path("/proc").is_dir():
        return []
    found: list[int] = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            stat = entry.stat()
        except OSError:
            continue
        if stat.st_uid == uid:
            found.append(int(entry.name))
    return found


def assign_uid(run_id: str) -> int | None:
    if os.geteuid() != 0:
        return None
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    map_path = WORKSPACE_ROOT / ".uid-map.json"
    with _uid_guard:
        mapping: dict[str, int] = {}
        if map_path.exists():
            mapping = json.loads(map_path.read_text())
        if run_id in mapping:
            return int(mapping[run_id])
        used = set(mapping.values())
        for uid in range(UID_MIN, UID_MAX + 1):
            if uid not in used and not procs_for_uid(uid):
                mapping[run_id] = uid
                map_path.write_text(json.dumps(mapping))
                return uid
    raise RuntimeError("sandbox uid pool exhausted")


def release_uid(run_id: str) -> None:
    map_path = WORKSPACE_ROOT / ".uid-map.json"
    with _uid_guard:
        if not map_path.exists():
            return
        mapping = json.loads(map_path.read_text())
        uid = mapping.pop(run_id, None)
        if isinstance(uid, int):
            kill_owned(-1, uid)
            if procs_for_uid(uid):
                mapping[f".held-{uid}"] = uid
        map_path.write_text(json.dumps(mapping))


def kill_owned(pid: int, uid: int | None) -> None:
    if pid > 0:
        try:
            os.killpg(pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    if uid is None:
        return
    for _ in range(20):
        pids = procs_for_uid(uid)
        if not pids:
            return
        for owned in pids:
            try:
                os.kill(owned, signal.SIGKILL)
            except OSError:
                pass
        time.sleep(0.02)


def workspace_files(path: Path) -> list[Path]:
    if not path.exists():
        return []
    return [
        entry for entry in path.rglob("*") if entry.is_file() and not entry.is_symlink()
    ]


def snapshot_sizes(path: Path) -> dict[str, int]:
    sizes: dict[str, int] = {}
    for entry in workspace_files(path):
        try:
            sizes[str(entry)] = entry.stat().st_size
        except OSError:
            continue
    return sizes


def prune_workspace(path: Path, before: dict[str, int]) -> None:
    for entry in workspace_files(path):
        key = str(entry)
        if key not in before:
            entry.unlink(missing_ok=True)
            continue
        try:
            size = entry.stat().st_size
        except OSError:
            continue
        if size > before[key]:
            os.truncate(entry, before[key])
    while True:
        files, total = usage(path)
        if files <= MAX_WORKSPACE_FILES and total <= MAX_WORKSPACE_BYTES:
            return
        victims = workspace_files(path)
        if not victims:
            return
        victims.sort(key=lambda entry: entry.stat().st_mtime, reverse=True)
        victims[0].unlink(missing_ok=True)


def restrict_child(file_bytes: int) -> None:
    """Runs in the child, before it drops to the sandbox uid."""
    # Only the container child is still root here. Clamping NPROC for the
    # host user running unit tests would block their existing processes.
    if os.geteuid() == 0:
        try:
            resource.setrlimit(
                resource.RLIMIT_NPROC, (MAX_CHILD_PROCS, MAX_CHILD_PROCS)
            )
        except (ValueError, OSError):
            pass
    if file_bytes >= 0:
        try:
            resource.setrlimit(resource.RLIMIT_FSIZE, (file_bytes, file_bytes))
        except (ValueError, OSError):
            pass
    if sys.platform == "linux":
        block_unix_sockets()


def block_unix_sockets() -> None:
    machine = platform.machine()
    if machine in ("x86_64", "amd64"):
        socket_nr, socketpair_nr = 41, 53
    elif machine in ("aarch64", "arm64"):
        socket_nr, socketpair_nr = 198, 199
    else:
        raise OSError(f"no unix-socket seccomp map for {machine}")

    bpf_ld = 0x00 | 0x20
    bpf_jmp_jeq = 0x05 | 0x10
    bpf_ret = 0x06
    allow = 0x7FFF0000
    deny = 0x00050001  # SECCOMP_RET_ERRNO | EPERM
    arg0 = 16  # seccomp_data.args[0], little-endian low word

    def stmt(code: int, k: int) -> ctypes.Structure:
        return SockFilter(code, 0, 0, k)

    def jump(k: int, jt: int, jf: int) -> ctypes.Structure:
        return SockFilter(bpf_jmp_jeq, jt, jf, k)

    filters = (SockFilter * 12)(
        stmt(bpf_ld, 0),
        jump(socket_nr, 0, 4),
        stmt(bpf_ld, arg0),
        jump(1, 0, 1),
        stmt(bpf_ret, deny),
        stmt(bpf_ret, allow),
        jump(socketpair_nr, 0, 4),
        stmt(bpf_ld, arg0),
        jump(1, 0, 1),
        stmt(bpf_ret, deny),
        stmt(bpf_ret, allow),
        stmt(bpf_ret, allow),
    )
    prog = SockFprog(len(filters), ctypes.cast(filters, ctypes.POINTER(SockFilter)))
    libc = ctypes.CDLL(None, use_errno=True)
    libc.prctl.argtypes = [
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
    ]
    libc.prctl.restype = ctypes.c_int
    if libc.prctl(38, 1, 0, 0, 0) != 0:  # PR_SET_NO_NEW_PRIVS
        raise OSError(ctypes.get_errno(), "PR_SET_NO_NEW_PRIVS")
    if libc.prctl(22, 2, ctypes.addressof(prog), 0, 0) != 0:  # PR_SET_SECCOMP, FILTER
        raise OSError(ctypes.get_errno(), "PR_SET_SECCOMP")


class SockFilter(ctypes.Structure):
    _fields_ = [
        ("code", ctypes.c_uint16),
        ("jt", ctypes.c_uint8),
        ("jf", ctypes.c_uint8),
        ("k", ctypes.c_uint32),
    ]


class SockFprog(ctypes.Structure):
    _fields_ = [("len", ctypes.c_ushort), ("filter", ctypes.POINTER(SockFilter))]


def execute(run_id: str, source: str, timeout_seconds: int) -> dict:
    path = workspace_path(run_id)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(path, 0o700)
    files, total = usage(path)
    if files > MAX_WORKSPACE_FILES or total > MAX_WORKSPACE_BYTES:
        prune_workspace(path, snapshot_sizes(path))
        return {
            "exitCode": 1,
            "stdout": "",
            "stderr": "workspace size cap exceeded",
            "timedOut": False,
            "truncated": False,
        }

    before = snapshot_sizes(path)
    uid = assign_uid(run_id)
    if uid is not None:
        os.chown(path, uid, uid)
        os.chmod(path, 0o700)

    env = {
        "PATH": "/usr/local/bin:/usr/bin:/bin",
        "HOME": str(path),
        "TMPDIR": str(path),
        "TMP": str(path),
        "TEMP": str(path),
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONUNBUFFERED": "1",
        "PYTHONNOUSERSITE": "1",
    }
    remaining = max(0, MAX_WORKSPACE_BYTES - total)
    popen_kwargs: dict = {
        "cwd": path,
        "stdin": subprocess.PIPE,
        "stdout": subprocess.PIPE,
        "stderr": subprocess.PIPE,
        "start_new_session": True,
        "env": env,
        "preexec_fn": lambda: restrict_child(remaining),
    }
    if uid is not None:
        popen_kwargs["user"] = uid
        popen_kwargs["group"] = uid

    proc = subprocess.Popen([sys.executable, "-I", "-"], **popen_kwargs)
    timed_out = False
    over_cap = False

    def watch_cap() -> None:
        nonlocal over_cap
        while proc.poll() is None:
            files_now, total_now = usage(path)
            if files_now > MAX_WORKSPACE_FILES or total_now > MAX_WORKSPACE_BYTES:
                over_cap = True
                kill_owned(proc.pid, uid)
                return
            time.sleep(0.05)

    watcher = threading.Thread(target=watch_cap, daemon=True)
    watcher.start()
    try:
        stdout, stderr = proc.communicate(
            source.encode(),
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        timed_out = True
        kill_owned(proc.pid, uid)
        stdout, stderr = proc.communicate()
    finally:
        kill_owned(proc.pid, uid)
        watcher.join(timeout=1)

    out_text = stdout[:MAX_OUTPUT_BYTES]
    err_text = stderr[:MAX_OUTPUT_BYTES]
    truncated = len(stdout) > MAX_OUTPUT_BYTES or len(stderr) > MAX_OUTPUT_BYTES
    files, total = usage(path)
    if over_cap or files > MAX_WORKSPACE_FILES or total > MAX_WORKSPACE_BYTES:
        prune_workspace(path, before)
        err_text = (err_text + b"\nworkspace size cap exceeded")[:MAX_OUTPUT_BYTES]
        truncated = True
        return {
            "exitCode": 1,
            "stdout": out_text.decode(errors="replace"),
            "stderr": err_text.decode(errors="replace"),
            "timedOut": timed_out,
            "truncated": truncated,
        }
    return {
        "exitCode": proc.returncode if proc.returncode is not None else 1,
        "stdout": out_text.decode(errors="replace"),
        "stderr": err_text.decode(errors="replace"),
        "timedOut": timed_out,
        "truncated": truncated,
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _send(self, status: int, body: dict | list | None) -> None:
        self._discard_body()
        self.close_connection = True
        raw = b"" if body is None else json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _discard_body(self) -> None:
        if getattr(self, "_body_read", False):
            return
        length = int(self.headers.get("content-length", "0") or 0)
        if length > 0:
            self.rfile.read(length)
        self._body_read = True

    def _read_json(self) -> dict:
        length = int(self.headers.get("content-length", "0"))
        if length > MAX_SOURCE_BYTES + 1024:
            raise ValueError("body too large")
        raw = self.rfile.read(length)
        self._body_read = True
        parsed = json.loads(raw.decode() or "{}")
        if not isinstance(parsed, dict):
            raise ValueError("expected object")
        return parsed

    def _require_bearer(self) -> bool:
        try:
            verify_bearer(self.headers.get("authorization"))
        except BearerError:
            self._send(401, {"error": "invalid bearer"})
            return False
        except (RuntimeError, OSError, ValueError) as error:
            sys.stderr.write("sandbox.jwks_unavailable %s\n" % error)
            self._send(503, {"error": "identity unavailable"})
            return False
        return True

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health":
            self._send(200, {"ok": True})
            return
        if not self._require_bearer():
            return
        if path == "/runs":
            WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
            ids = sorted(
                entry.name
                for entry in WORKSPACE_ROOT.iterdir()
                if entry.is_dir() and valid_run_id(entry.name)
            )
            self._send(200, {"runIds": ids})
            return
        self._send(404, {"error": "not found"})

    def do_DELETE(self) -> None:
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 2 or parts[0] != "runs" or not valid_run_id(parts[1]):
            self._send(404, {"error": "not found"})
            return
        if not self._require_bearer():
            return
        run_id = parts[1]
        with run_lock(run_id):
            path = workspace_path(run_id)
            if path.exists():
                uid = None
                map_path = WORKSPACE_ROOT / ".uid-map.json"
                if map_path.exists():
                    uid = json.loads(map_path.read_text()).get(run_id)
                if isinstance(uid, int):
                    kill_owned(-1, uid)
                for entry in sorted(path.rglob("*"), reverse=True):
                    if entry.is_symlink() or entry.is_file():
                        entry.unlink()
                    elif entry.is_dir():
                        entry.rmdir()
                path.rmdir()
            release_uid(run_id)
        self._send(204, None)

    def do_POST(self) -> None:
        parts = urlparse(self.path).path.strip("/").split("/")
        if (
            len(parts) != 3
            or parts[0] != "runs"
            or parts[2] != "exec"
            or not valid_run_id(parts[1])
        ):
            self._send(404, {"error": "not found"})
            return
        if not self._require_bearer():
            return
        run_id = parts[1]
        try:
            body = self._read_json()
        except (ValueError, json.JSONDecodeError) as error:
            self._send(400, {"error": str(error)})
            return
        source = body.get("source")
        if not isinstance(source, str) or not source.strip():
            self._send(400, {"error": "source is required"})
            return
        if len(source.encode()) > MAX_SOURCE_BYTES:
            self._send(400, {"error": "source exceeds cap"})
            return
        timeout = body.get("timeoutSeconds", DEFAULT_TIMEOUT_SECONDS)
        if (
            isinstance(timeout, bool)
            or not isinstance(timeout, int)
            or timeout < 1
            or timeout > MAX_TIMEOUT_SECONDS
        ):
            self._send(400, {"error": "invalid timeoutSeconds"})
            return
        with run_lock(run_id):
            try:
                result = execute(run_id, source, timeout)
            except (RuntimeError, OSError) as error:
                self._send(503, {"error": str(error)})
                return
        self._send(200, result)


def main() -> None:
    if not FUDA_ISSUER or not (FUDA_JWKS_URI or FUDA_JWKS_JSON):
        raise SystemExit(
            "SANDBOX_FUDA_ISSUER and SANDBOX_FUDA_JWKS_URI or SANDBOX_FUDA_JWKS_JSON are required"
        )
    load_jwks()
    WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
