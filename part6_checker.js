"""Part 6: checks that the chosen browser exists on the server, and whether it is Live or Busy."""
import os
import re


async def check(browser, busy):
    exists, detail = False, ""
    if browser == "playwright":                   # Firefox through Playwright
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                exists = os.path.exists(p.firefox.executable_path)
            if not exists:
                detail = "Run: playwright install --with-deps firefox"
        except ImportError:
            detail = "Playwright package is not installed."
        except Exception as e:
            detail = str(e)[:150]
    else:
        detail = "Unknown browser."
    return {"exists": exists, "status": ("Busy" if busy else "Live") if exists else None, "detail": detail}


def selection(browser: str, step_by_step: bool) -> dict:
    """What the user chose: which browser, and whether Step by step is on. Part 2 and Part 3 get this."""
    return {"browser": browser, "step_by_step": bool(step_by_step),
            "text": f"Browser: {browser}. Step by step: {'ON' if step_by_step else 'OFF'}."}


def message_plan(send_text, notify_text) -> dict:
    """The user's Message page: which messages to send (one per line) and what kind of message to be told about.
    has_plan says whether there is anything to do (yes / no)."""
    send = [re.sub(r"^\s*(?:\d+[.)]|[-*•])\s*", "", ln).strip() for ln in str(send_text or "").splitlines()]
    send = [x for x in send if x][:50]
    notify = str(notify_text or "").strip()[:300]
    text = "\n".join(send) + (("\n" if send else "") + "🔔 " + notify if notify else "")
    return {"has_plan": bool(send or notify), "send": send, "notify": notify, "text": text}
