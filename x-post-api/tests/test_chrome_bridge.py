import json
import subprocess
import unittest

from chrome_bridge import (
    ButtonDisabled,
    ChromeBridge,
    ChromePermission,
    DraftExists,
    NoAccount,
    NoChromeTab,
    UnknownState,
)


def state(composer=True, draft=False, text="", button=True, button_enabled=True, toast=""):
    return {
        "composer": composer,
        "draft": draft,
        "text": text,
        "button": button,
        "button_enabled": button_enabled,
        "toast": toast,
    }


class FakeRunner:
    def __init__(
        self,
        tabs,
        account_texts=None,
        states=None,
        fill_result=None,
        click_result=None,
        list_error=None,
    ):
        self.tabs = tabs
        self.account_texts = account_texts or {}
        self.states = list(states or [state()])
        self.fill_result = fill_result or {"ok": True}
        self.click_result = click_result or {"ok": True}
        self.list_error = list_error
        self.fill_calls = 0
        self.click_calls = 0
        self.state_calls = 0

    def __call__(self, cmd, timeout):
        mode = cmd[2]
        if mode == "list":
            if self.list_error is not None:
                return subprocess.CompletedProcess(cmd, 1, "", self.list_error)
            return subprocess.CompletedProcess(cmd, 0, self.tabs, "")

        js = cmd[5]
        if "button_enabled" in js:
            current = self.states[min(self.state_calls, len(self.states) - 1)]
            self.state_calls += 1
            return subprocess.CompletedProcess(cmd, 0, json.dumps(current), "")

        if "SideNav_AccountSwitcher_Button" in js:
            window = int(cmd[3])
            return subprocess.CompletedProcess(cmd, 0, self.account_texts.get(window, ""), "")

        if '"fill"' in js:
            self.fill_calls += 1
            return subprocess.CompletedProcess(cmd, 0, json.dumps(self.fill_result), "")

        if '"click"' in js:
            self.click_calls += 1
            return subprocess.CompletedProcess(cmd, 0, json.dumps(self.click_result), "")

        raise AssertionError("unexpected JS: %s" % js[:120])


def make_bridge(runner, account="example"):
    return ChromeBridge(account=account, runner=runner, sleep=lambda _: None)


class ListTabsTest(unittest.TestCase):
    def test_list_tabs(self):
        runner = FakeRunner("1\t1\thttps://x.com/home\tHome\n2\t1\thttps://example.com\tExample\n")
        bridge = make_bridge(runner)

        tabs = bridge.list_tabs()

        self.assertEqual(len(tabs), 2)
        self.assertEqual(tabs[0].window, 1)
        self.assertEqual(tabs[0].tab, 1)
        self.assertEqual(tabs[0].url, "https://x.com/home")
        self.assertEqual(tabs[0].title, "Home")


class FindAccountTabTest(unittest.TestCase):
    def test_selects_matching_account(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n2\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Other @other", 2: "Example @example"},
        )
        bridge = make_bridge(runner)

        tab = bridge.find_account_tab()

        self.assertEqual(tab.window, 2)

    def test_no_matching_account(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Other @other"},
        )
        bridge = make_bridge(runner)

        with self.assertRaises(NoAccount):
            bridge.find_account_tab()

    def test_no_x_tab(self):
        runner = FakeRunner("1\t1\thttps://example.com\tExample\n")
        bridge = make_bridge(runner)

        with self.assertRaises(NoChromeTab):
            bridge.find_account_tab()

    def test_chrome_not_running(self):
        runner = FakeRunner("", list_error="CHROME_NOT_RUNNING")
        bridge = make_bridge(runner)

        with self.assertRaises(NoChromeTab):
            bridge.find_account_tab()

    def test_permission_error(self):
        runner = FakeRunner(
            "",
            list_error="execution error: Not authorized to send Apple events to Google Chrome. (-1743)",
        )
        bridge = make_bridge(runner)

        with self.assertRaises(ChromePermission):
            bridge.find_account_tab()


class PostTest(unittest.TestCase):
    def test_success(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[
                state(draft=False, text="", button_enabled=False),
                state(draft=True, text="hello", button_enabled=True),
                state(draft=False, text="", toast="Your post was sent."),
            ],
        )
        bridge = make_bridge(runner)

        bridge.post("hello")

        self.assertEqual(runner.fill_calls, 1)
        self.assertEqual(runner.click_calls, 1)

    def test_draft_exists(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[state(draft=True, text="existing")],
        )
        bridge = make_bridge(runner)

        with self.assertRaises(DraftExists):
            bridge.post("hello")

        self.assertEqual(runner.fill_calls, 0)
        self.assertEqual(runner.click_calls, 0)

    def test_button_disabled(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[
                state(draft=False, text="", button_enabled=False),
                state(draft=True, text="hello", button_enabled=False),
            ],
        )
        bridge = make_bridge(runner)

        with self.assertRaises(ButtonDisabled):
            bridge.post("hello")

        self.assertEqual(runner.fill_calls, 1)
        self.assertEqual(runner.click_calls, 0)

    def test_input_mismatch_does_not_click(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[state(draft=False, text="", button_enabled=False)],
            fill_result={"ok": False, "error": "INPUT_MISMATCH"},
        )
        bridge = make_bridge(runner)

        with self.assertRaises(Exception):
            bridge.post("hello")

        self.assertEqual(runner.click_calls, 0)

    def test_unknown_state_does_not_retry(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[
                state(draft=False, text="", button_enabled=False),
                state(draft=True, text="hello", button_enabled=True),
                state(draft=True, text="hello", button_enabled=True, toast=""),
            ],
        )
        bridge = make_bridge(runner)

        with self.assertRaises(UnknownState):
            bridge.post("hello")

        self.assertEqual(runner.click_calls, 1)


class HealthTest(unittest.TestCase):
    def test_health(self):
        runner = FakeRunner(
            "1\t1\thttps://x.com/home\tHome\n",
            account_texts={1: "Example @example"},
            states=[state(draft=False, text="", button_enabled=False)],
        )
        bridge = make_bridge(runner)

        result = bridge.health()

        self.assertTrue(result.chrome_tab)
        self.assertTrue(result.logged_in)
        self.assertTrue(result.composer_ready)
        self.assertFalse(result.draft_exists)


if __name__ == "__main__":
    unittest.main()
