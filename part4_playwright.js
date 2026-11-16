// Part 4: Playwright code (Chromium on the server).
const { chromium } = require('playwright');

exports.open = async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  return {
    goto: u => page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 }),
    click: s => page.click(s, { timeout: 8000 }),
    type: async (s, t, enter) => { await page.fill(s, t, { timeout: 8000 }); if (enter) await page.keyboard.press('Enter'); },
    press: k => page.keyboard.press(k),
    evaluate: f => page.evaluate(f),
    close: () => browser.close()
  };
};
