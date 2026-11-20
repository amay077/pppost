#!/usr/bin/env python3
"""Chrome automation bridge for x-post-api.

This module talks to Google Chrome through AppleScript. It is intentionally
separate from the HTTP server so that it can be replaced with a fake in tests.
"""

from __future__ import annotations

import json
import re
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional


ACCOUNT_JS = """
(() => {
  const b = document.querySelector('[data-testid=SideNav_AccountSwitcher_Button]');
  return b ? (b.innerText || '') : '';
})()
"""

SUCCESS_WORDS = ("sent", "送信", "投稿しました", "ポストしました")
ERROR_WORDS = ("failed", "error", "wrong", "couldn't", "could not", "できません", "失敗", "エラー")


class BridgeError(Exception):
    """Base error raised by the Chrome bridge."""

    code = "BRIDGE_ERROR"

    def __init__(self, message: str, code: Optional[str] = None) -> None:
        super().__init__(message)
        if code:
            self.code = code


class NoChromeTab(BridgeError):
    code = "NO_CHROME_TAB"


class NoAccount(BridgeError):
    code = "NO_ACCOUNT"


class NoComposer(BridgeError):
    code = "NO_COMPOSER"


class DraftExists(BridgeError):
    code = "DRAFT_EXISTS"


class ButtonDisabled(BridgeError):
    code = "POST_FAILED"


class UnknownState(BridgeError):
    code = "UNKNOWN_STATE"


class ChromePermission(BridgeError):
    code = "CHROME_PERMISSION"


@dataclass
class Tab:
    window: int
    tab: int
    url: str
    title: str


@dataclass
class TabState:
    composer: bool
    draft: bool
    draft_text: str
    button: bool
    button_enabled: bool
    toast: str


@dataclass
class BridgeState:
    chrome_tab: bool
    logged_in: bool
    composer_ready: bool
    draft_exists: bool
    button_enabled: bool


Runner = Callable[[List[str], float], subprocess.CompletedProcess]


class ChromeBridge:
    """Operate a logged-in X tab in Google Chrome."""

    def __init__(
        self,
        account: str,
        script_path: Optional[str] = None,
        timeout: float = 20.0,
        runner: Optional[Runner] = None,
        sleep: Optional[Callable[[float], None]] = None,
    ) -> None:
        self.account = account
        self.base_dir = Path(__file__).resolve().parent
        self.script_path = Path(script_path) if script_path else self.base_dir / "run-js.applescript"
        self.timeout = timeout
        self._runner = runner or self._default_runner
        self._sleep = sleep or time.sleep
        self._bridge_lock = threading.Lock()

    @staticmethod
    def _default_runner(cmd: List[str], timeout: float) -> subprocess.CompletedProcess:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

    def _run_applescript(self, args: List[str]) -> str:
        cmd = ["osascript", str(self.script_path)] + [str(a) for a in args]
        with self._bridge_lock:
            try:
                result = self._runner(cmd, self.timeout)
            except subprocess.TimeoutExpired:
                raise BridgeError("AppleScript がタイムアウトしました")
            except OSError as error:
                raise BridgeError("AppleScript を実行できません: %s" % error)

        if result.returncode != 0:
            raise self._map_error(result.stderr or "")

        return (result.stdout or "").strip()

    def _map_error(self, stderr: str) -> BridgeError:
        text = (stderr or "").strip()
        lower = text.lower()

        if "chrome_not_running" in lower:
            return NoChromeTab("Chrome が起動していません")
        if "not authorized" in lower or "not allowed" in lower or "-1743" in text:
            return ChromePermission(
                "macOS の自動化許可が必要です。システム設定 > プライバシーとセキュリティ > オートメーション で osascript から Google Chrome を許可してください"
            )
        if "executing javascript through applescript is turned off" in lower:
            return ChromePermission(
                "Chrome の「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にしてください"
            )
        if "javascript" in lower and "apple events" in lower:
            return ChromePermission(
                "Chrome の「表示 > デベロッパー > Apple Events からの JavaScript を許可」を ON にしてください"
            )
        return BridgeError(text or "AppleScript の実行に失敗しました")

    def _run_js(self, tab: Tab, js: str) -> str:
        return self._run_applescript(["js", str(tab.window), str(tab.tab), js])

    def list_tabs(self) -> List[Tab]:
        output = self._run_applescript(["list"])
        tabs: List[Tab] = []
        for line in output.splitlines():
            parts = line.split("\t")
            if len(parts) < 3:
                continue
            try:
                window = int(parts[0])
                tab = int(parts[1])
            except ValueError:
                continue
            tabs.append(
                Tab(
                    window=window,
                    tab=tab,
                    url=parts[2],
                    title="\t".join(parts[3:]),
                )
            )
        return tabs

    def _account_text(self, tab: Tab) -> str:
        try:
            return self._run_js(tab, ACCOUNT_JS)
        except ChromePermission:
            raise
        except BridgeError:
            return ""

    def _matches_account(self, text: str) -> bool:
        pattern = r"@" + re.escape(self.account) + r"(?![A-Za-z0-9_])"
        return re.search(pattern, text or "", re.IGNORECASE) is not None

    def find_account_tab(self) -> Tab:
        tabs = self.list_tabs()
        if not tabs:
            raise NoChromeTab("Chrome または X のタブがありません")

        candidates = [t for t in tabs if "x.com/" in t.url or "twitter.com/" in t.url]
        if not candidates:
            raise NoChromeTab("X のタブがありません。x.com/home を開いてください")

        matches: List[Tab] = []
        for tab in candidates:
            if self._matches_account(self._account_text(tab)):
                matches.append(tab)

        if not matches:
            raise NoAccount("対象アカウント @%s の X タブがありません" % self.account)

        matches.sort(key=lambda t: (0 if "/home" in t.url else 1, t.window, t.tab))
        return matches[0]

    def check_state(self, tab: Tab) -> TabState:
        js = (self.base_dir / "x-check.js").read_text(encoding="utf-8")
        output = self._run_js(tab, js)
        data = self._parse_json_object(output)
        return TabState(
            composer=bool(data.get("composer")),
            draft=bool(data.get("draft")),
            draft_text=str(data.get("text") or ""),
            button=bool(data.get("button")),
            button_enabled=bool(data.get("button_enabled")),
            toast=str(data.get("toast") or ""),
        )

    def health(self) -> BridgeState:
        tab = self.find_account_tab()
        state = self.check_state(tab)
        return BridgeState(
            chrome_tab=True,
            logged_in=True,
            composer_ready=state.composer,
            draft_exists=state.draft,
            button_enabled=state.button_enabled,
        )

    def post(self, text: str) -> None:
        tab = self.find_account_tab()
        state = self.check_state(tab)
        if not state.composer:
            raise NoComposer("X の投稿欄が見つかりません。x.com/home を開いてください")
        if state.draft:
            raise DraftExists("X の投稿欄に下書きがあります。下書きを消してから再実行してください")

        result = self._run_post_js(tab, "fill", text)
        if not result.get("ok"):
            error = result.get("error")
            if error == "DRAFT_EXISTS":
                raise DraftExists("X の投稿欄に下書きがあります。下書きを消してから再実行してください")
            if error == "NO_COMPOSER":
                raise NoComposer("X の投稿欄が見つかりません。x.com/home を開いてください")
            raise BridgeError("本文の入力に失敗しました（%s）" % error)

        self._sleep(0.8)
        state = self.check_state(tab)
        if not state.button:
            raise ButtonDisabled("投稿ボタンが見つかりません")
        if not state.button_enabled:
            raise ButtonDisabled("投稿ボタンが無効です")

        result = self._run_post_js(tab, "click", "")
        if not result.get("ok"):
            raise ButtonDisabled("投稿ボタンをクリックできませんでした（%s）" % result.get("error"))

        self._sleep(3.0)
        state = self.check_state(tab)
        toast = state.toast.lower()

        if any(word in toast for word in ERROR_WORDS):
            raise BridgeError("X が投稿を拒否しました（%s）" % state.toast)
        if state.composer and state.draft_text.strip() == "":
            return
        if any(word in toast for word in SUCCESS_WORDS):
            return

        raise UnknownState("投稿結果を確認できませんでした。二重投稿防止のため再実行しないでください。")

    def _run_post_js(self, tab: Tab, phase: str, text: str) -> Dict[str, Any]:
        js = (self.base_dir / "x-post.js").read_text(encoding="utf-8")
        js = js.replace("__PHASE__", json.dumps(phase))
        js = js.replace("__TEXT_JSON__", json.dumps(text))
        output = self._run_js(tab, js)
        return self._parse_json_object(output)

    @staticmethod
    def _parse_json_object(output: str) -> Dict[str, Any]:
        try:
            data = json.loads(output)
        except (TypeError, ValueError):
            raise BridgeError("Chrome から不正な応答が返りました")
        if not isinstance(data, dict):
            raise BridgeError("Chrome から不正な応答が返りました")
        return data
