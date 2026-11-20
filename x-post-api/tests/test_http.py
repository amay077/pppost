import http.client
import json
import os
import shutil
import tempfile
import threading
import unittest

import x_api
from chrome_bridge import BridgeState, DraftExists, UnknownState


TOKEN = "t" * 32


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


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.config = x_api.Config(
            token=TOKEN,
            account="example",
            port=0,
            log_path=os.path.join(self.temp_dir, "x-api.ndjson"),
            rate_limit=100,
            rate_window_sec=3600,
            min_interval_sec=0,
            lock_path=None,
            lock_timeout_sec=1.0,
        )
        self.bridge = FakeBridge()
        self.logger = x_api.AuditLogger(self.config.log_path)
        self.service = x_api.XPostService(
            self.config,
            self.bridge,
            clock=lambda: "2026-11-20T16:00:00+09:00",
        )
        self.server = x_api.XPostHTTPServer(
            ("127.0.0.1", 0),
            x_api.Handler,
            self.config,
            self.service,
            self.logger,
        )
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]
        self.conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)

    def tearDown(self):
        self.conn.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def request(self, method, path, body=None, headers=None):
        request_headers = dict(headers or {})
        if body is not None and not isinstance(body, (bytes, str)):
            body = json.dumps(body).encode("utf-8")
        self.conn.request(method, path, body=body, headers=request_headers)
        response = self.conn.getresponse()
        payload = response.read()
        parsed = json.loads(payload.decode("utf-8")) if payload else None
        return response.status, dict(response.getheaders()), parsed

    def auth_headers(self):
        return {
            "Authorization": "Bearer " + TOKEN,
            "Content-Type": "application/json",
        }

    def test_health_requires_auth(self):
        status, _, body = self.request("GET", "/health")

        self.assertEqual(status, 401)
        self.assertEqual(body["error"], "UNAUTHORIZED")

    def test_health(self):
        status, _, body = self.request("GET", "/health", headers=self.auth_headers())

        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(body["account"], "example")

    def test_options(self):
        status, headers, _ = self.request(
            "OPTIONS",
            "/post",
            headers={
                "Origin": "https://amay077.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type,idempotency-key",
            },
        )

        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Origin"), "https://amay077.github.io")
        self.assertIn("Authorization", headers.get("Access-Control-Allow-Headers", ""))
        self.assertIn("Idempotency-Key", headers.get("Access-Control-Allow-Headers", ""))

    def test_options_disallowed_origin(self):
        status, headers, _ = self.request(
            "OPTIONS",
            "/post",
            headers={"Origin": "https://evil.example"},
        )

        self.assertEqual(status, 204)
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_private_network_preflight(self):
        status, headers, _ = self.request(
            "OPTIONS",
            "/post",
            headers={
                "Origin": "https://amay077.github.io",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        self.assertEqual(status, 204)
        self.assertEqual(headers.get("Access-Control-Allow-Private-Network"), "true")

    def test_post(self):
        status, _, body = self.request(
            "POST",
            "/post",
            body={"text": "hello"},
            headers={**self.auth_headers(), "Idempotency-Key": "abc"},
        )

        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertEqual(self.bridge.calls, 1)

    def test_post_empty_text(self):
        status, _, body = self.request(
            "POST",
            "/post",
            body={"text": ""},
            headers=self.auth_headers(),
        )

        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "EMPTY_TEXT")

    def test_post_invalid_json(self):
        status, _, body = self.request(
            "POST",
            "/post",
            body="{",
            headers=self.auth_headers(),
        )

        self.assertEqual(status, 400)
        self.assertEqual(body["error"], "INVALID_JSON")

    def test_post_unknown_state_is_not_retried(self):
        self.bridge.error = UnknownState("unknown")

        first_status, _, first_body = self.request(
            "POST",
            "/post",
            body={"text": "hello"},
            headers={**self.auth_headers(), "Idempotency-Key": "same"},
        )
        second_status, second_headers, second_body = self.request(
            "POST",
            "/post",
            body={"text": "hello"},
            headers={**self.auth_headers(), "Idempotency-Key": "same"},
        )

        self.assertEqual(first_status, 502)
        self.assertEqual(first_body["error"], "UNKNOWN_STATE")
        self.assertEqual(second_status, 502)
        self.assertEqual(second_body["error"], "UNKNOWN_STATE")
        self.assertEqual(second_headers.get("X-Idempotent-Replay"), "true")
        self.assertEqual(self.bridge.calls, 1)

    def test_post_draft_exists(self):
        self.bridge.error = DraftExists("draft")

        status, _, body = self.request(
            "POST",
            "/post",
            body={"text": "hello"},
            headers=self.auth_headers(),
        )

        self.assertEqual(status, 409)
        self.assertEqual(body["error"], "DRAFT_EXISTS")

    def test_audit_log_does_not_contain_token(self):
        self.request(
            "POST",
            "/post",
            body={"text": "hello"},
            headers={**self.auth_headers(), "Idempotency-Key": "abc"},
        )

        with open(self.config.log_path, "r", encoding="utf-8") as handle:
            lines = [line for line in handle.read().splitlines() if line.strip()]

        self.assertEqual(len(lines), 1)
        record = json.loads(lines[0])
        self.assertEqual(record["text"], "hello")
        self.assertTrue(record["ok"])
        self.assertNotIn(TOKEN, lines[0])


if __name__ == "__main__":
    unittest.main()
