// Part 5: Firefox (APK) running on the server's Android device/emulator, driven with geckodriver + adb.
const { Builder, By, Key } = require('selenium-webdriver');
const { execFile } = require('child_process');
const path = require('path');

const APK = path.join(__dirname, 'part5_firefox.apk');
const PKG = process.env.FIREFOX_PACKAGE || 'org.mozilla.firefox';
const adb = (...a) => new Promise((res, rej) => execFile('adb', a, (e, o) => (e ? rej(e) : res(o))));

exports.APK = APK;
exports.adb = adb;

exports.open = async () => {
  await adb('install', '-r', APK).catch(() => {});   // ok if already installed
  const d = await new Builder().forBrowser('firefox')
    .withCapabilities({ 'moz:firefoxOptions': { androidPackage: PKG } }).build();
  return {
    goto: u => d.get(u),
    click: s => d.findElement(By.css(s)).click(),
    type: async (s, t, enter) => {
      const el = d.findElement(By.css(s));
      await el.clear();
      await el.sendKeys(t, enter ? Key.ENTER : '');
    },
    press: k => d.actions().sendKeys(Key[String(k).toUpperCase()] || k).perform(),
    evaluate: f => d.executeScript(`return (${f.toString()})()`),
    close: () => d.quit()
  };
};
