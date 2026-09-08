// PWA 4R-PKG-3E-0 -- Android canlıda hangi build/cache'in çalıştığını
// görünür kılan minimum rozet. Amaç: eski cache yüzünden "çözülmüş bug
// hâlâ varmış" yanılgısını önlemek. Yalnız görünürlük + tek-kaynak
// tutarlılık test eder -- route/state/ZIP/Kaydet mantığına dokunmaz.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

const appJsMetni = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const swMetni = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test.describe('AR. Build/version rozeti (4R-PKG-3E-0)', () => {
  test('1. APP_CACHE sabiti sw.js CACHE ile birebir aynı -- rozet yanlış sürüm göstermez', () => {
    const appCacheEslesme = appJsMetni.match(/const APP_CACHE = '([^']+)';/);
    const swCacheEslesme = swMetni.match(/const CACHE = '([^']+)';/);
    expect(appCacheEslesme).toBeTruthy();
    expect(swCacheEslesme).toBeTruthy();
    expect(appCacheEslesme[1]).toBe(swCacheEslesme[1]);
  });

  test('2. Sayfa yüklenince #build-info görünür, cache sürümü ve faz etiketini içerir (commit hash DEĞİL -- bu commit sonrası yanlış olurdu)', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const rozet = page.locator('#build-info');
    await expect(rozet).toBeVisible();
    await expect(rozet).toContainText('isg-saha-v32');
    await expect(rozet).toContainText('4R-PKG-3K');
  });
});
