"""Part 4: Playwright code (Chromium on the server)."""


class Browser:
    def __init__(self, pw, browser, page):
        self.pw, self.browser, self.page = pw, browser, page

    async def goto(self, url):
        await self.page.goto(url, wait_until="domcontentloaded", timeout=30000)

    async def click(self, selector):
        await self.page.click(selector, timeout=8000)

    async def type(self, selector, text, enter):
        await self.page.fill(selector, text, timeout=8000)
        if enter:
            await self.page.keyboard.press("Enter")

    async def press(self, key):
        await self.page.keyboard.press(key)

    async def evaluate(self, js):
        return await self.page.evaluate(js)

    async def close(self):
        await self.browser.close()
        await self.pw.stop()


async def open():
    from playwright.async_api import async_playwright
    pw = await async_playwright().start()
    try:
        browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
        page = await browser.new_page()
    except Exception:
        await pw.stop()
        raise
    return Browser(pw, browser, page)
