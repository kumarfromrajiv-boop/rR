"""Part 5: Firefox (APK) on the server's Android device/emulator, driven with geckodriver + adb."""
import asyncio
import os
import subprocess

APK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "part5_firefox.apk")
PKG = os.getenv("FIREFOX_PACKAGE", "org.mozilla.firefox")


def adb(*args):
    return subprocess.run(["adb", *args], capture_output=True, text=True, timeout=120, check=True).stdout


class Browser:
    def __init__(self, driver):
        self.d = driver

    async def goto(self, url):
        await asyncio.to_thread(self.d.get, url)

    async def click(self, selector):
        from selenium.webdriver.common.by import By
        await asyncio.to_thread(lambda: self.d.find_element(By.CSS_SELECTOR, selector).click())

    def _type(self, selector, text, enter):
        from selenium.webdriver.common.by import By
        from selenium.webdriver.common.keys import Keys
        el = self.d.find_element(By.CSS_SELECTOR, selector)
        el.clear()
        el.send_keys(text + (Keys.ENTER if enter else ""))

    async def type(self, selector, text, enter):
        await asyncio.to_thread(self._type, selector, text, enter)

    def _press(self, key):
        from selenium.webdriver.common.keys import Keys
        from selenium.webdriver.common.action_chains import ActionChains
        ActionChains(self.d).send_keys(getattr(Keys, str(key).upper(), key)).perform()

    async def press(self, key):
        await asyncio.to_thread(self._press, key)

    async def evaluate(self, js):
        return await asyncio.to_thread(self.d.execute_script, "return (" + js + ")()")

    async def close(self):
        await asyncio.to_thread(self.d.quit)


async def open():
    def make():
        from selenium import webdriver
        from selenium.webdriver.firefox.options import Options
        try:
            adb("install", "-r", APK)          # ok if already installed
        except Exception:
            pass
        class AndroidOptions(Options):          # tells geckodriver to use Firefox on the Android device
            def to_capabilities(self):
                caps = super().to_capabilities()
                caps.setdefault("moz:firefoxOptions", {})["androidPackage"] = PKG
                return caps
        return webdriver.Firefox(options=AndroidOptions())
    return Browser(await asyncio.to_thread(make))
