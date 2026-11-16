// Part 4: Playwright adapter for the AI Browser automation worker
const { chromium } = require('playwright');

async function open() {
  // ब्राउज़र लॉन्च करें (आप चाहें तो headless: false कर सकते हैं ताकि ब्राउज़र स्क्रीन पर दिखे)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  return {
    async goto(url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
    },
    async click(selector) {
      await page.click(selector);
    },
    async type(selector, text, enter) {
      await page.fill(selector, text);
      if (enter) {
        await page.press(selector, 'Enter');
      }
    },
    async press(key) {
      await page.keyboard.press(key);
    },
    async evaluate(fn, ...args) {
      return await page.evaluate(fn, ...args);
    },
    async close() {
      await browser.close();
    }
  };
}

module.exports = { open };
