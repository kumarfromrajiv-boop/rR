"""Part 6: checks that the chosen browser exists on the server, and whether it is Live or Busy."""
import asyncio
import os

import part5_firefox as p5


async def check(browser, busy):
    exists, detail = False, ""
    if browser == "playwright":
        try:
            from playwright.async_api import async_playwright
            async with async_playwright() as p:
                exists = os.path.exists(p.chromium.executable_path)
            if not exists:
                detail = "Run: playwright install --with-deps chromium"
        except ImportError:
            detail = "Playwright package is not installed."
        except Exception as e:
            detail = str(e)[:150]
    elif browser == "firefox":
        apk = os.path.exists(p5.APK) and os.path.getsize(p5.APK) > 1_000_000
        dev = False
        try:
            dev = "\tdevice" in await asyncio.to_thread(p5.adb, "devices")
        except Exception:
            pass
        exists = apk and dev
        detail = ("" if exists else "part5_firefox.apk is missing." if not apk
                  else "No Android device or emulator connected through adb.")
    else:
        detail = "Unknown browser."
    return {"exists": exists, "status": ("Busy" if busy else "Live") if exists else None, "detail": detail}
