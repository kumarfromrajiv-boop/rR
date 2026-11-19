"""Part 5: Firefox (.xapk or .apk) on the server's Android device/emulator, driven with geckodriver + adb."""
import asyncio
import json
import os
import pathlib
import re
import subprocess
import tempfile
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
XAPK = os.path.join(HERE, "part5_firefox.xapk")      # put your Firefox .xapk here (this name)
APK = os.path.join(HERE, "part5_firefox.apk")        # a plain .apk also works
PKG = os.getenv("FIREFOX_PACKAGE", "org.mozilla.firefox")
ABI_RE = re.compile(r"(?:^|[._-])(x86_64|arm64_v8a|armeabi_v7a|x86)(?:[._-]|$)")


def app_path() -> str:
    """The Firefox file on the server: .xapk first, otherwise .apk."""
    for p in (XAPK, APK):
        if os.path.exists(p):
            return p
    return XAPK


def adb(*args) -> str:
    r = subprocess.run(["adb", *args], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip()[:300])
    return r.stdout


def device_abi() -> str:
    """CPU type of the Android device, e.g. x86_64 or arm64_v8a."""
    return adb("shell", "getprop", "ro.product.cpu.abi").strip().replace("-", "_")


def pick_files(folder: str, abi: str):
    """Inside an unzipped .xapk: which .apk pieces to install. Returns (package name or None, files)."""
    pkg, names = None, []
    mf = os.path.join(folder, "manifest.json")
    if os.path.exists(mf):
        m = json.loads(pathlib.Path(mf).read_text(encoding="utf-8"))   # (this file defines its own open(), so no builtin open here)
        pkg = m.get("package_name")
        names = [s["file"] for s in m.get("split_apks", []) if s.get("file")]
    if not names:                                     # no usable manifest -> every .apk at the top level
        names = sorted(n for n in os.listdir(folder) if n.endswith(".apk"))
    files = []
    for n in names:
        hit = ABI_RE.search(os.path.splitext(os.path.basename(n))[0])
        if hit and hit.group(1) != abi:               # skip pieces made for other CPU types
            continue
        p = os.path.join(folder, n)
        if os.path.exists(p):
            files.append(p)
    return pkg, files


def install() -> str:
    """Install Firefox on the Android device. Returns the package name."""
    path = app_path()
    if path.endswith(".xapk"):
        with tempfile.TemporaryDirectory() as tmp:
            with zipfile.ZipFile(path) as z:
                z.extractall(tmp)
            pkg, files = pick_files(tmp, device_abi())
            if not files:
                raise RuntimeError("No .apk found inside the .xapk file.")
            adb("install-multiple", "-r", *files)
            return pkg or PKG
    adb("install", "-r", path)
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
