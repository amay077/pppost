import os
import tempfile
import threading
import unittest

import x_api
from chrome_bridge import BridgeState, DraftExists, NoAccount, NoChromeTab, UnknownState


class FakeBridge:
    def __init__(self, state=None, error=None):
        self.state = state or BridgeState(
            chrome_tab=True,
            logged_in=True,
            composer_ready=True,
            draft_exists=False,
            button_enabled=True,
        )
        self.error = error
        self.calls = 0
        self.texts = []

    def health(self):
        if self.error is not None:
            raise self.error
        return self.state

    def post(self, text):
        self.calls += 1
        self.texts.append(text)
        if self.error is not None:
            raise self.error


def make_config(**overrides):
    values = {
        "token": "t" * 32,
        "account": "example",
        "port": 8788,
        "log_path": os.path.join(tempfile.mkdtemp(), "x-api.ndjson"),
        "rate_limit": 10,
        "rate_window_sec": 3600,
        "min_interval_sec": 0,
        "lock_path": None,
        "lock_timeout_sec": 1.0,
    }
    values.update(overrides)
    return x_api.Config(**values)


def make_service(bridge, **config_overrides):
    config = make_config(**config_overrides)
    return x_api.XPostService(
        config,
        bridge,
        clock=lambda: "2026-11-20T16:00:00+09:00",
    )


class ConfigTest(unittest.TestCase):
    def base_env(self, **overrides):
        env = {
            "X_API_TOKEN": "t" * 32,
            "X_ACCOUNT": "example",
        }
        env.update(overrides)
        return env

    def test_defaults(self):
        config = x_api.Config.from_env(self.base_env())

        self.assertEqual(config.bind, "127.0.0.1")
        self.assertEqual(config.port, 8788)
        self.assertEqual(config.account, "example")
        self.assertIn("https://amay077.github.io", config.allowed_origins)

    def test_strips_at_mark(self):
        config = x_api.Config.from_env(self.base_env(X_ACCOUNT="@Example"))
        self.assertEqual(config.account, "Example")

    def test_missing_token(self):
        with self.assertRaises(x_api.ConfigError):
            x_api.Config.from_env(self.base_env(X_API_TOKEN="short"))

    def test_missing_account(self):
        with self.assertRaises(x_api.ConfigError):
            x_api.Config.from_env(self.base_env(X_ACCOUNT=""))

    def test_non_loopback_bind(self):
        with self.assertRaises(x_api.ConfigError):
            x_api.Config.from_env(self.base_env(X_API_BIND="0.0.0.0"))

    def test_allowed_origins(self):
        config = x_api.Config.from_env(
            self.base_env(X_API_ALLOWED_ORIGINS="https://example.com, http://localhost:8080")
        )
        self.assertEqual(config.allowed_origins, ("https://example.com", "http://localhost:8080"))

    def test_empty_lock_path(self):
        config = x_api.Config.from_env(self.base_env(X_API_LOCK_PATH=""))
        self.assertIsNone(config.lock_path)


class WeightedLengthTest(unittest.TestCase):
    def test_english(self):
        self.assertEqual(x_api.weighted_length("hello"), 5)

    def test_japanese(self):
        self.assertEqual(x_api.weighted_length("こんにちは"), 10)

    def test_url(self):
        self.assertEqual(x_api.weighted_length("https://example.com"), 23)

    def test_mixed(self):
        self.assertEqual(x_api.weighted_length("見て https://example.com"), 28)

    def test_multiple_urls(self):
        self.assertEqual(
            x_api.weighted_length("https://example.com https://example.org"),
            47,
        )


class ValidationTest(unittest.TestCase):
    def test_normalize_text(self):
        self.assertEqual(x_api.normalize_text("  hello  "), "hello")
        self.assertEqual(x_api.normalize_text("a\r\nb"), "a\nb")
        self.assertEqual(x_api.normalize_text("a\rb"), "a\nb")

    def test_validate_text(self):
        text, weight = x_api.validate_text("  hello  ")
        self.assertEqual(text, "hello")
        self.assertEqual(weight, 5)

    def test_empty_text(self):
        with self.assertRaises(x_api.ValidationError) as context:
            x_api.validate_text("   ")
        self.assertEqual(context.exception.code, "EMPTY_TEXT")

    def test_non_string_text(self):
        with self.assertRaises(x_api.ValidationError) as context:
            x_api.validate_text(None)
        self.assertEqual(context.exception.code, "EMPTY_TEXT")

    def test_control_character(self):
        with self.assertRaises(x_api.ValidationError) as context:
            x_api.validate_text("hello\x00world")
        self.assertEqual(context.exception.code, "INVALID_TEXT")

    def test_too_long(self):
        with self.assertRaises(x_api.ValidationError) as context:
            x_api.validate_text("a" * 281)
        self.assertEqual(context.exception.code, "TOO_LONG")

    def test_url(self):
        self.assertEqual(x_api.validate_url("https://example.com"), "https://example.com")
        self.assertEqual(x_api.validate_url(""), "")
        self.assertEqual(x_api.validate_url(None), "")

    def test_invalid_url_scheme(self):
        with self.assertRaises(x_api.ValidationError) as context:
            x_api.validate_url("ftp://example.com")
        self.assertEqual(context.exception.code, "INVALID_URL")

    def test_url_with_space(self):
        with self.assertRaises(x_api.ValidationError):
            x_api.validate_url("https://example.com/a b")


class AuthTest(unittest.TestCase):
    def test_valid(self):
        self.assertTrue(x_api.check_auth("Bearer secret", "secret"))

    def test_invalid(self):
        self.assertFalse(x_api.check_auth("Bearer wrong", "secret"))

    def test_missing(self):
        self.assertFalse(x_api.check_auth(None, "secret"))

    def test_wrong_scheme(self):
        self.assertFalse(x_api.check_auth("Basic secret", "secret"))


class RateLimiterTest(unittest.TestCase):
    def test_limit(self):
        clock = [0.0]
        limiter = x_api.RateLimiter(2, 60, 0, lambda: clock[0])
        self.assertIsNone(limiter.check_and_record())
        self.assertIsNone(limiter.check_and_record())
        self.assertGreater(limiter.check_and_record(), 0)

        clock[0] = 61.0
        self.assertIsNone(limiter.check_and_record())

    def test_min_interval(self):
        clock = [0.0]
        limiter = x_api.RateLimiter(10, 3600, 10, lambda: clock[0])
        self.assertIsNone(limiter.check_and_record())

        clock[0] = 5.0
        self.assertEqual(limiter.check_and_record(), 5)

        clock[0] = 10.0
        self.assertIsNone(limiter.check_and_record())


class IdempotencyStoreTest(unittest.TestCase):
    def test_round_trip(self):
        clock = [0.0]
        store = x_api.IdempotencyStore(10, lambda: clock[0])
        body = {"ok": True, "value": "a"}
        store.put("key", 200, body)

        body["value"] = "changed"
        stored = store.get("key")
        self.assertIsNotNone(stored)
        self.assertEqual(stored.status, 200)
        self.assertEqual(stored.body["value"], "a")

        clock[0] = 11.0
        self.assertIsNone(store.get("key"))


class PostLockTest(unittest.TestCase):
    def test_in_process_lock(self):
        lock = x_api.PostLock(0.1)
        self.assertTrue(lock.acquire())
        self.assertTrue(lock.locked())
        self.assertFalse(lock.acquire())
        lock.release()
        self.assertFalse(lock.locked())

    def test_file_lock(self):
        path = os.path.join(tempfile.mkdtemp(), "x-post-api.lock")
        first = x_api.PostLock(0.1, path)
        second = x_api.PostLock(0.1, path)
        self.assertTrue(first.acquire())
        self.assertFalse(second.acquire())
        first.release()
        self.assertTrue(second.acquire())
        second.release()


class ServiceTest(unittest.TestCase):
    def test_dry_run(self):
        bridge = FakeBridge()
        service = make_service(bridge)

        status, body, _ = service.post("req", {"text": "hello", "dry_run": True}, None)

        self.assertEqual(status, 200)
        self.assertTrue(body["dry_run"])
        self.assertEqual(bridge.calls, 0)

    def test_success(self):
        bridge = FakeBridge()
        service = make_service(bridge)

        status, body, _ = service.post("req", {"text": "hello"}, None)

        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["posted_at"], "2026-11-20T16:00:00+09:00")
        self.assertEqual(bridge.calls, 1)
        self.assertEqual(bridge.texts, ["hello"])

    def test_url_is_appended(self):
        bridge = FakeBridge()
        service = make_service(bridge)

        status, body, _ = service.post(
            "req",
            {"text": "hello", "url": "https://example.com"},
            None,
        )

        self.assertEqual(status, 200)
        self.assertEqual(bridge.texts, ["hello\nhttps://example.com"])
        self.assertEqual(body["weighted_length"], 5 + 1 + 23)

    def test_idempotent_replay(self):
        bridge = FakeBridge()
        service = make_service(bridge)

        first = service.post("req-1", {"text": "hello"}, "key")
        second = service.post("req-2", {"text": "hello"}, "key")

        self.assertEqual(first[0], 200)
        self.assertEqual(second[0], 200)
        self.assertEqual(second[2]["X-Idempotent-Replay"], "true")
        self.assertEqual(bridge.calls, 1)

    def test_unknown_state_is_not_retried(self):
        bridge = FakeBridge(error=UnknownState("unknown"))
        service = make_service(bridge)

        status, body, _ = service.post("req-1", {"text": "hello"}, "key")
        self.assertEqual(status, 502)
        self.assertEqual(body["error"], "UNKNOWN_STATE")
        self.assertEqual(bridge.calls, 1)

        status, body, _ = service.post("req-2", {"text": "hello"}, "key")
        self.assertEqual(status, 502)
        self.assertEqual(body["error"], "UNKNOWN_STATE")
        self.assertEqual(bridge.calls, 1)

    def test_draft_exists(self):
        bridge = FakeBridge(error=DraftExists("draft"))
        service = make_service(bridge)

        status, body, _ = service.post("req", {"text": "hello"}, None)

        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "DRAFT_EXISTS")

    def test_busy(self):
        bridge = FakeBridge()
        service = make_service(bridge, lock_timeout_sec=0.1)

        self.assertTrue(service._post_lock.acquire())
        try:
            status, body, _ = service.post("req", {"text": "hello"}, None)
        finally:
            service._post_lock.release()

        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "BUSY")
        self.assertEqual(bridge.calls, 0)

    def test_rate_limit(self):
        bridge = FakeBridge()
        service = make_service(bridge, rate_limit=1)

        first = service.post("req-1", {"text": "hello"}, "key-1")
        second = service.post("req-2", {"text": "hello"}, "key-2")

        self.assertEqual(first[0], 200)
        self.assertEqual(second[0], 429)
        self.assertEqual(second[1]["error"], "RATE_LIMITED")
        self.assertIn("Retry-After", second[2])
        self.assertEqual(bridge.calls, 1)

    def test_health_ok(self):
        service = make_service(FakeBridge())
        body = service.health()

        self.assertTrue(body["ok"])
        self.assertEqual(body["account"], "example")

    def test_health_no_account(self):
        service = make_service(FakeBridge(error=NoAccount("no account")))
        body = service.health()

        self.assertFalse(body["ok"])
        self.assertTrue(body["chrome_tab"])
        self.assertFalse(body["logged_in"])
        self.assertEqual(body["error"], "NO_ACCOUNT")

    def test_health_no_chrome(self):
        service = make_service(FakeBridge(error=NoChromeTab("no chrome")))
        body = service.health()

        self.assertFalse(body["ok"])
        self.assertFalse(body["chrome_tab"])
        self.assertEqual(body["error"], "NO_CHROME_TAB")


if __name__ == "__main__":
    unittest.main()
