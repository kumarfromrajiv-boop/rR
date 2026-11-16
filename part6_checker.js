// Part 6: checks that the chosen browser exists on the server, and whether it is Live or Busy.
const fs = require('fs');
const p5 = require('./part5_firefox');

exports.check = async (browser, busy) => {
  let exists = false, detail = '';
  if (browser === 'playwright') {
    try {
      const { chromium } = require('playwright');
      exists = fs.existsSync(chromium.executablePath());
      if (!exists) detail = 'Run: npx playwright install --with-deps chromium';
    } catch { detail = 'Playwright package is not installed.'; }
  } else if (browser === 'firefox') {
    const apk = fs.existsSync(p5.APK) && fs.statSync(p5.APK).size > 1e6;
    let dev = false;
    try { dev = /\tdevice/.test(await p5.adb('devices')); } catch {}
    exists = apk && dev;
    detail = !apk ? 'part5_firefox.apk is missing.' : !dev ? 'No Android device or emulator connected through adb.' : '';
  } else detail = 'Unknown browser.';
  return { exists, status: exists ? (busy ? 'Busy' : 'Live') : null, detail };
};
