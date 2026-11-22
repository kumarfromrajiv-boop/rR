"""Part 5: Firefox (APK) on the server's Android device/emulator, driven with geckodriver + adb."""
import asyncio
import os
import subprocess

APK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "part5_firefox.apk")   # put your Firefox .apk here (this name)
PKG = os.getenv("FIREFOX_PACKAGE", "org.mozilla.firefox")


def app_path() -> str:
    """The Firefox file on the server (Part 6 checks that it exists)."""
    return APK


def adb(*args) -> str:
    r = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:300])
    return r.stdout


def install() -> str:
    """Install Firefox on the Android device. Returns the package name."""
    adb("install", "-r", APK)
    return PKG


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
        pkg = PKG
        try:
            pkg = install()
        except Exception as e:                        # fine if Firefox is already installed
            try:
                installed = PKG in adb("shell", "pm", "list", "packages", PKG)
            except Exception:
                installed = False
            if not installed:
                raise RuntimeError(f"Could not install Firefox: {e}")

        class AndroidOptions(Options):                # tells geckodriver to use Firefox on the Android device
            def to_capabilities(self):
                caps = super().to_capabilities()
                caps.setdefault("moz:firefoxOptions", {})["androidPackage"] = pkg
                return caps
        return webdriver.Firefox(options=AndroidOptions())
    return Browser(await asyncio.to_thread(make))
