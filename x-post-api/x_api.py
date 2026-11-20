#!/usr/bin/env python3
"""x-post-api: post text to X using a logged-in Chrome tab.

The service is intentionally small and dependency-free. It binds to loopback
only, and is expected to be exposed to a tailnet by a Tailscale container.
"""

from __future__ import annotations

import copy
import hashlib
import hmac
import json
import math
import os
import re
import signal
import socket
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

try:
    import fcntl
except ImportError:  # pragma: no cover - the service runs on macOS
    fcntl = None  # type: ignore

from chrome_bridge import (
    BridgeError,
    ButtonDisabled,
    ChromeBridge,
    ChromePermission,
    DraftExists,
    NoAccount,
    NoChromeTab,
    NoComposer,
    UnknownState,
)


JST = ZoneInfo("Asia/Tokyo")
MAX_WEIGHTED_LENGTH = 280
URL_WEIGHT = 23
TOKEN_REQUIRED_BYTES = 32
DEFAULT_ALLOWED_ORIGINS = (
    "https://amay077.github.io",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
)

CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)
ACCOUNT_PATTERN = re.compile(r"^[A-Za-z0-9_]{1,15}$")


def now_jst_iso() -> str:
    return datetime.now(timezone.utc).astimezone(JST).isoformat(timespec="seconds")


class ConfigError(Exception):
    pass


class ValidationError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _env_int(env: Dict[str, str], name: str, default: int, minimum: int, maximum: int) -> int:
    raw = env.get(name, "").strip()
    if raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ConfigError("%s は整数で指定してください" % name)
    if value < minimum or value > maximum:
        raise ConfigError("%s は %d〜%d の範囲で指定してください" % (name, minimum, maximum))
    return value


def _env_float(env: Dict[str, str], name: str, default: float, minimum: float, maximum: float) -> float:
    raw = env.get(name, "").strip()
    if raw == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError("%s は数値で指定してください" % name)
    if value < minimum or value > maximum:
        raise ConfigError("%s は %s〜%s の範囲で指定してください" % (name, minimum, maximum))
    return value


@dataclass(frozen=True)
class Config:
    token: str
    account: str
    bind: str = "127.0.0.1"
    port: int = 8788
    log_path: str = "logs/x-api.ndjson"
    rate_limit: int = 10
    rate_window_sec: int = 3600
    min_interval_sec: int = 10
    allowed_origins: Tuple[str, ...] = DEFAULT_ALLOWED_ORIGINS
    lock_path: Optional[str] = ".x-post-api.lock"
    body_limit: int = 8192
    request_timeout_sec: float = 20.0
    lock_timeout_sec: float = 20.0

    @classmethod
    def from_env(cls, env: Optional[Dict[str, str]] = None) -> "Config":
        env = env if env is not None else dict(os.environ)

        token = env.get("X_API_TOKEN", "").strip()
        if not token.isascii() or len(token.encode("utf-8")) < TOKEN_REQUIRED_BYTES:
            raise ConfigError("X_API_TOKEN は 32 バイト以上の ASCII 文字列で設定してください")

        account = env.get("X_ACCOUNT", "").strip().lstrip("@")
        if ACCOUNT_PATTERN.match(account) is None:
            raise ConfigError("X_ACCOUNT は @ なしの X ハンドル（英数字と _、15 文字以内）で設定してください")

        bind = env.get("X_API_BIND", "127.0.0.1").strip()
        if bind not in ("127.0.0.1", "localhost"):
            raise ConfigError("X_API_BIND は 127.0.0.1 または localhost にしてください")

        log_path = env.get("X_API_LOG_PATH", "logs/x-api.ndjson").strip() or "logs/x-api.ndjson"
        lock_path_raw = env.get("X_API_LOCK_PATH", ".x-post-api.lock").strip()
        lock_path = lock_path_raw or None

        origins_raw = env.get("X_API_ALLOWED_ORIGINS", ",".join(DEFAULT_ALLOWED_ORIGINS))
        allowed_origins = tuple(origin.strip() for origin in origins_raw.split(",") if origin.strip())

        return cls(
            token=token,
            account=account,
            bind=bind,
            port=_env_int(env, "X_API_PORT", 8788, 1, 65535),
            log_path=log_path,
            rate_limit=_env_int(env, "X_API_RATE_LIMIT", 10, 1, 1000),
            rate_window_sec=_env_int(env, "X_API_RATE_WINDOW_SEC", 3600, 1, 86400),
            min_interval_sec=_env_int(env, "X_API_MIN_INTERVAL_SEC", 10, 0, 3600),
            allowed_origins=allowed_origins,
            lock_path=lock_path,
            body_limit=_env_int(env, "X_API_BODY_LIMIT", 8192, 1, 1024 * 1024),
            request_timeout_sec=_env_float(env, "X_API_REQUEST_TIMEOUT_SEC", 20.0, 1.0, 300.0),
            lock_timeout_sec=_env_float(env, "X_API_LOCK_TIMEOUT_SEC", 20.0, 0.0, 300.0),
        )

    def cors_headers(self, origin: Optional[str]) -> Dict[str, str]:
        if not origin:
            return {}
        headers: Dict[str, str] = {"Vary": "Origin"}
        if origin not in self.allowed_origins:
            return headers
        headers.update(
            {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
                "Access-Control-Max-Age": "600",
            }
        )
        return headers


def _is_east_asian(character: str) -> bool:
    code = ord(character)
    return (
        0x1100 <= code <= 0x11FF
        or 0x2E80 <= code <= 0x2FFF
        or 0x3000 <= code <= 0x303F
        or 0x3040 <= code <= 0x309F
        or 0x30A0 <= code <= 0x30FF
        or 0x3130 <= code <= 0x318F
        or 0x31F0 <= code <= 0x31FF
        or 0x3200 <= code <= 0x32FF
        or 0x3300 <= code <= 0x33FF
        or 0x3400 <= code <= 0x4DBF
        or 0x4E00 <= code <= 0x9FFF
        or 0xA960 <= code <= 0xA97F
        or 0xAC00 <= code <= 0xD7AF
        or 0xD7B0 <= code <= 0xD7FF
        or 0xF900 <= code <= 0xFAFF
        or 0xFE30 <= code <= 0xFE4F
        or 0xFF00 <= code <= 0xFFEF
        or 0x1B000 <= code <= 0x1B0FF
        or 0x20000 <= code <= 0x2FA1F
    )


def _weight_without_urls(text: str) -> int:
    return sum(2 if _is_east_asian(character) else 1 for character in text)


def weighted_length(text: str) -> int:
    total = 0
    last = 0
    for match in URL_PATTERN.finditer(text):
        total += _weight_without_urls(text[last : match.start()])
        total += URL_WEIGHT
        last = match.end()
    total += _weight_without_urls(text[last:])
    return total


def normalize_text(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def validate_text(value: Any) -> Tuple[str, int]:
    if not isinstance(value, str):
        raise ValidationError("EMPTY_TEXT", "本文を指定してください")

    text = normalize_text(value)
    if len(text) == 0:
        raise ValidationError("EMPTY_TEXT", "本文が空です")
    if CONTROL_CHARS.search(text) is not None:
        raise ValidationError("INVALID_TEXT", "本文に使用できない制御文字が含まれています")

    weight = weighted_length(text)
    if weight > MAX_WEIGHTED_LENGTH:
        raise ValidationError("TOO_LONG", "本文が長すぎます（%d/%d）" % (weight, MAX_WEIGHTED_LENGTH))
    return text, weight


def validate_url(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValidationError("INVALID_URL", "URL が不正です")

    url = value.strip()
    if len(url) == 0:
        return ""
    if CONTROL_CHARS.search(url) is not None or any(character.isspace() for character in url):
        raise ValidationError("INVALID_URL", "URL に空白や制御文字は使用できません")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValidationError("INVALID_URL", "URL は http または https で指定してください")
    return url


def compose_text(text: str, url: str) -> str:
    if url:
        return text + "\n" + url
    return text


def check_auth(header: Optional[str], token: str) -> bool:
    if not header:
        return False
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return False
    try:
        return hmac.compare_digest(parts[1], token)
    except TypeError:
        return False


@dataclass
class RequestContext:
    request_id: str
    text: Optional[str] = None
    url: Optional[str] = None


@dataclass
class Response:
    status: int
    body: Optional[Dict[str, Any]]
    headers: Dict[str, str] = field(default_factory=dict)


class AuditLogger:
    def __init__(self, path: str) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass

    def log(self, record: Dict[str, Any]) -> None:
        try:
            line = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
            with self._lock:
                descriptor = os.open(
                    str(self.path),
                    os.O_CREAT | os.O_APPEND | os.O_WRONLY,
                    0o600,
                )
                with os.fdopen(descriptor, "a", encoding="utf-8") as handle:
                    handle.write(line + "\n")
        except OSError as error:
            print("監査ログの書き込みに失敗しました: %s" % error, file=sys.stderr)


class RateLimiter:
    def __init__(
        self,
        limit: int,
        window_sec: int,
        min_interval_sec: int,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self.min_interval_sec = min_interval_sec
        self._now = now
        self._timestamps: List[float] = []
        self._lock = threading.Lock()

    def check_and_record(self) -> Optional[int]:
        with self._lock:
            now = self._now()
            cutoff = now - self.window_sec
            self._timestamps = [timestamp for timestamp in self._timestamps if timestamp > cutoff]

            retry_after = 0
            if len(self._timestamps) >= self.limit:
                retry_after = max(
                    retry_after,
                    int(math.ceil(self._timestamps[0] + self.window_sec - now)),
                )
            if self._timestamps and self.min_interval_sec > 0:
                elapsed = now - self._timestamps[-1]
                if elapsed < self.min_interval_sec:
                    retry_after = max(
                        retry_after,
                        int(math.ceil(self.min_interval_sec - elapsed)),
                    )

            if retry_after > 0:
                return max(1, retry_after)

            self._timestamps.append(now)
            return None


@dataclass
class StoredResponse:
    status: int
    body: Dict[str, Any]
    headers: Dict[str, str]
    expires_at: float


class IdempotencyStore:
    def __init__(self, ttl_sec: int = 900, now: Callable[[], float] = time.monotonic) -> None:
        self.ttl_sec = ttl_sec
        self._now = now
        self._items: Dict[str, StoredResponse] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _hash_key(key: str) -> str:
        return hashlib.sha256(key.encode("utf-8")).hexdigest()

    def get(self, key: str) -> Optional[StoredResponse]:
        hashed = self._hash_key(key)
        with self._lock:
            stored = self._items.get(hashed)
            if stored is None:
                return None
            if stored.expires_at <= self._now():
                del self._items[hashed]
                return None
            return StoredResponse(
                status=stored.status,
                body=copy.deepcopy(stored.body),
                headers=dict(stored.headers),
                expires_at=stored.expires_at,
            )

    def put(self, key: str, status: int, body: Dict[str, Any], headers: Optional[Dict[str, str]] = None) -> None:
        hashed = self._hash_key(key)
        with self._lock:
            self._items[hashed] = StoredResponse(
                status=status,
                body=copy.deepcopy(body),
                headers=dict(headers or {}),
                expires_at=self._now() + self.ttl_sec,
            )


class PostLock:
    def __init__(self, timeout_sec: float, file_path: Optional[str] = None) -> None:
        self.timeout_sec = timeout_sec
        self.file_path = file_path
        self._lock = threading.Lock()
        self._file_handle: Optional[Any] = None

    def locked(self) -> bool:
        return self._lock.locked()

    def acquire(self) -> bool:
        if not self._lock.acquire(timeout=self.timeout_sec):
            return False

        if self.file_path and fcntl is not None:
            handle = None
            try:
                handle = open(self.file_path, "a+")
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._file_handle = handle
            except OSError:
                if handle is not None:
                    try:
                        handle.close()
                    except OSError:
                        pass
                self._lock.release()
                return False

        return True

    def release(self) -> None:
        if self._file_handle is not None:
            try:
                fcntl.flock(self._file_handle.fileno(), fcntl.LOCK_UN)
                self._file_handle.close()
            except OSError:
                pass
            self._file_handle = None

        try:
            self._lock.release()
        except RuntimeError:
            pass


class XPostService:
    def __init__(
        self,
        config: Config,
        bridge: Any,
        clock: Callable[[], str] = now_jst_iso,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self.config = config
        self.bridge = bridge
        self._clock = clock
        self._post_lock = PostLock(config.lock_timeout_sec, config.lock_path)
        self._rate_limiter = RateLimiter(
            config.rate_limit,
            config.rate_window_sec,
            config.min_interval_sec,
            monotonic,
        )
        self._idempotency = IdempotencyStore(900, monotonic)
        self._last_post_at: Optional[str] = None
        self._last_post_lock = threading.Lock()

    def health(self) -> Dict[str, Any]:
        with self._last_post_lock:
            last_post_at = self._last_post_at
        busy = self._post_lock.locked()

        try:
            state = self.bridge.health()
            return {
                "ok": state.chrome_tab and state.logged_in and state.composer_ready,
                "account": self.config.account,
                "chrome_tab": state.chrome_tab,
                "logged_in": state.logged_in,
                "composer_ready": state.composer_ready,
                "draft_exists": state.draft_exists,
                "busy": busy,
                "last_post_at": last_post_at,
            }
        except NoChromeTab as error:
            return self._health_error("NO_CHROME_TAB", str(error), False, busy, last_post_at)
        except NoAccount as error:
            return self._health_error("NO_ACCOUNT", str(error), True, busy, last_post_at)
        except BridgeError as error:
            return self._health_error(
                getattr(error, "code", "BRIDGE_ERROR"),
                str(error),
                False,
                busy,
                last_post_at,
            )

    def _health_error(
        self,
        code: str,
        message: str,
        chrome_tab: bool,
        busy: bool,
        last_post_at: Optional[str],
    ) -> Dict[str, Any]:
        return {
            "ok": False,
            "account": self.config.account,
            "chrome_tab": chrome_tab,
            "logged_in": False,
            "composer_ready": False,
            "draft_exists": False,
            "busy": busy,
            "last_post_at": last_post_at,
            "error": code,
            "message": message,
        }

    def post(
        self,
        request_id: str,
        payload: Dict[str, Any],
        idempotency_key: Optional[str],
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        try:
            text, url, combined, weight = self._validate_payload(payload)
        except ValidationError as error:
            return error.status, self._error_body(error.code, error.message, request_id), {}

        if payload.get("dry_run", False) is True:
            return (
                200,
                {
                    "ok": True,
                    "dry_run": True,
                    "posted_at": None,
                    "weighted_length": weight,
                    "text": text,
                    "url": url,
                    "request_id": request_id,
                },
                {},
            )

        if not self._post_lock.acquire():
            return (
                409,
                self._error_body(
                    "BUSY",
                    "先行の投稿処理中です。しばらく待ってから再実行してください",
                    request_id,
                ),
                {},
            )

        try:
            if idempotency_key:
                stored = self._idempotency.get(idempotency_key)
                if stored is not None:
                    headers = dict(stored.headers)
                    headers["X-Idempotent-Replay"] = "true"
                    return stored.status, stored.body, headers

            retry_after = self._rate_limiter.check_and_record()
            if retry_after is not None:
                body = self._error_body(
                    "RATE_LIMITED",
                    "レート制限に達しました。%d 秒後に再実行してください" % retry_after,
                    request_id,
                )
                body["retry_after"] = retry_after
                headers = {"Retry-After": str(retry_after)}
                self._store(idempotency_key, 429, body, headers)
                return 429, body, headers

            try:
                self.bridge.post(combined)
            except NoChromeTab as error:
                return self._bridge_error_response(idempotency_key, 503, "NO_CHROME_TAB", str(error), request_id)
            except NoAccount as error:
                return self._bridge_error_response(idempotency_key, 409, "NO_ACCOUNT", str(error), request_id)
            except NoComposer as error:
                return self._bridge_error_response(idempotency_key, 409, "NO_COMPOSER", str(error), request_id)
            except DraftExists as error:
                return self._bridge_error_response(idempotency_key, 409, "DRAFT_EXISTS", str(error), request_id)
            except UnknownState as error:
                return self._bridge_error_response(idempotency_key, 502, "UNKNOWN_STATE", str(error), request_id)
            except ChromePermission as error:
                return self._bridge_error_response(idempotency_key, 503, "CHROME_PERMISSION", str(error), request_id)
            except ButtonDisabled as error:
                return self._bridge_error_response(idempotency_key, 502, "POST_FAILED", str(error), request_id)
            except BridgeError as error:
                return self._bridge_error_response(idempotency_key, 502, "POST_FAILED", str(error), request_id)

            posted_at = self._clock()
            with self._last_post_lock:
                self._last_post_at = posted_at

            body = {
                "ok": True,
                "posted_at": posted_at,
                "weighted_length": weight,
                "text": text,
                "url": url,
                "request_id": request_id,
            }
            self._store(idempotency_key, 200, body, {})
            return 200, body, {}
        finally:
            self._post_lock.release()

    def _validate_payload(self, payload: Dict[str, Any]) -> Tuple[str, str, str, int]:
        text, _ = validate_text(payload.get("text"))
        url = validate_url(payload.get("url"))
        combined = compose_text(text, url)
        weight = weighted_length(combined)
        if weight > MAX_WEIGHTED_LENGTH:
            raise ValidationError(
                "TOO_LONG",
                "本文が長すぎます（%d/%d）" % (weight, MAX_WEIGHTED_LENGTH),
            )
        return text, url, combined, weight

    def _error_body(self, code: str, message: str, request_id: str) -> Dict[str, Any]:
        return {
            "ok": False,
            "error": code,
            "message": message,
            "request_id": request_id,
        }

    def _bridge_error_response(
        self,
        idempotency_key: Optional[str],
        status: int,
        code: str,
        message: str,
        request_id: str,
    ) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
        body = self._error_body(code, message, request_id)
        self._store(idempotency_key, status, body, {})
        return status, body, {}

    def _store(
        self,
        idempotency_key: Optional[str],
        status: int,
        body: Dict[str, Any],
        headers: Dict[str, str],
    ) -> None:
        if idempotency_key:
            self._idempotency.put(idempotency_key, status, body, headers)


class XPostHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: Tuple[str, int],
        handler_class: Any,
        config: Config,
        service: XPostService,
        audit_logger: AuditLogger,
    ) -> None:
        super().__init__(server_address, handler_class)
        self.config = config
        self.service = service
        self.audit_logger = audit_logger


class Handler(BaseHTTPRequestHandler):
    server_version = "XPostAPI/1.0"
    protocol_version = "HTTP/1.1"

    @property
    def app(self) -> XPostHTTPServer:
        return self.server  # type: ignore[return-value]

    def log_message(self, format: str, *args: Any) -> None:
        return

    def do_OPTIONS(self) -> None:
        cors = self._cors_headers()
        self._send(Response(204, None), cors)

    def do_GET(self) -> None:
        self._handle("GET")

    def do_POST(self) -> None:
        self._handle("POST")

    def _handle(self, method: str) -> None:
        request_id = str(uuid.uuid4())
        started = time.monotonic()
        context = RequestContext(request_id)
        cors = self._cors_headers()

        try:
            response = self._dispatch(method, context)
        except socket.timeout:
            response = self._error_response(408, "TIMEOUT", "リクエストがタイムアウトしました", context)
        except Exception as error:  # keep the server alive for unexpected failures
            print("x-post-api internal error: %s" % error, file=sys.stderr)
            response = self._error_response(500, "INTERNAL_ERROR", "内部エラーが発生しました", context)

        duration_ms = int((time.monotonic() - started) * 1000)
        self.app.audit_logger.log(
            {
                "ts": now_jst_iso(),
                "request_id": request_id,
                "method": method,
                "path": urlparse(self.path).path,
                "text": context.text,
                "url": context.url,
                "ok": bool(response.body and response.body.get("ok")),
                "error": response.body.get("error") if response.body else None,
                "duration_ms": duration_ms,
                "idempotent": response.headers.get("X-Idempotent-Replay") == "true",
            }
        )
        self._send(response, cors)

    def _dispatch(self, method: str, context: RequestContext) -> Response:
        path = urlparse(self.path).path

        if path == "/health":
            if method != "GET":
                return self._error_response(405, "METHOD_NOT_ALLOWED", "GET のみ対応しています", context)
            if not self._authorized():
                return self._error_response(401, "UNAUTHORIZED", "認証が必要です", context)
            return Response(200, self.app.service.health())

        if path == "/post":
            if method != "POST":
                return self._error_response(405, "METHOD_NOT_ALLOWED", "POST のみ対応しています", context)
            if not self._authorized():
                return self._error_response(401, "UNAUTHORIZED", "認証が必要です", context)
            payload, error_response = self._read_json(context)
            if error_response is not None:
                return error_response
            status, body, headers = self.app.service.post(
                context.request_id,
                payload,
                self.headers.get("Idempotency-Key"),
            )
            return Response(status, body, headers)

        return self._error_response(404, "NOT_FOUND", "見つかりません", context)

    def _authorized(self) -> bool:
        return check_auth(self.headers.get("Authorization"), self.app.config.token)

    def _read_json(self, context: RequestContext) -> Tuple[Optional[Dict[str, Any]], Optional[Response]]:
        content_length = self.headers.get("Content-Length")
        if content_length is None:
            return None, self._error_response(400, "INVALID_JSON", "Content-Length が必要です", context)

        try:
            length = int(content_length)
        except ValueError:
            return None, self._error_response(400, "INVALID_JSON", "Content-Length が不正です", context)

        if length < 0 or length > self.app.config.body_limit:
            self.close_connection = True
            return None, self._error_response(
                413,
                "PAYLOAD_TOO_LARGE",
                "リクエストボディが大きすぎます",
                context,
            )

        self.connection.settimeout(self.app.config.request_timeout_sec)
        try:
            raw = self.rfile.read(length)
        except socket.timeout:
            return None, self._error_response(408, "TIMEOUT", "リクエストがタイムアウトしました", context)

        try:
            decoded = raw.decode("utf-8")
        except UnicodeDecodeError:
            return None, self._error_response(400, "INVALID_JSON", "UTF-8 で解釈できません", context)

        try:
            payload = json.loads(decoded)
        except ValueError:
            return None, self._error_response(400, "INVALID_JSON", "JSON として解釈できません", context)

        if not isinstance(payload, dict):
            return None, self._error_response(400, "INVALID_JSON", "JSON オブジェクトを送信してください", context)

        text = payload.get("text")
        url = payload.get("url")
        context.text = text if isinstance(text, str) else None
        context.url = url if isinstance(url, str) else None
        return payload, None

    def _cors_headers(self) -> Dict[str, str]:
        headers = self.app.config.cors_headers(self.headers.get("Origin"))
        if (
            headers
            and self.headers.get("Access-Control-Request-Private-Network", "").lower() == "true"
        ):
            headers["Access-Control-Allow-Private-Network"] = "true"
        return headers

    def _error_response(
        self,
        status: int,
        code: str,
        message: str,
        context: RequestContext,
    ) -> Response:
        return Response(
            status,
            {
                "ok": False,
                "error": code,
                "message": message,
                "request_id": context.request_id,
            },
        )

    def _send(self, response: Response, cors: Dict[str, str]) -> None:
        payload = (
            json.dumps(response.body, ensure_ascii=False).encode("utf-8")
            if response.body is not None
            else b""
        )
        self.send_response(response.status)
        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": str(len(payload)),
            "Cache-Control": "no-store",
        }
        headers.update(cors)
        headers.update(response.headers)
        for key, value in headers.items():
            self.send_header(key, str(value))
        self.end_headers()
        if payload:
            self.wfile.write(payload)


def main() -> int:
    try:
        config = Config.from_env()
    except ConfigError as error:
        print("設定エラー: %s" % error, file=sys.stderr)
        return 1

    bridge = ChromeBridge(account=config.account, timeout=config.request_timeout_sec)
    audit_logger = AuditLogger(config.log_path)
    service = XPostService(config, bridge)

    try:
        server = XPostHTTPServer(
            (config.bind, config.port),
            Handler,
            config,
            service,
            audit_logger,
        )
    except OSError as error:
        print("サーバーを起動できません: %s" % error, file=sys.stderr)
        return 1

    def shutdown(signum: int, frame: Any) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    print(
        "x-post-api listening on %s:%d (account=@%s)"
        % (config.bind, config.port, config.account),
        file=sys.stderr,
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
