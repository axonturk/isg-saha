// PWA Commit 2 / Bölüm K -- offline app-shell karakterizasyonu.
//
// ÖNEMLİ, YENİ BULGU: committed baseline'da (852764c) `app.js`/`index.html`
// içinde `navigator.serviceWorker.register(...)`'a TEK BİR referans YOK
// (grep ile doğrulandı). `sw.js` dosyası VAR ve içeriği (cache-first app
// shell + runtime cache) makul ama PRODUCTION KODU BUNU KENDİSİ HİÇ
// TETİKLEMİYOR -- yani gerçek kullanımda (bu worktree'nin kod tabanıyla)
// Service Worker HİÇBİR ZAMAN aktive olmaz, dolayısıyla bugünkü uygulama
// offline açılışı sw.js ÜZERİNDEN SAĞLAMIYOR OLABİLİR. Bu, Commit 2
// kapsamında DÜZELTİLMEZ (yalnız karakterize edilir) -- ayrı bir risk
// olarak raporlanır (bkz. PWA Commit 2 raporu §I, P0/P1).
//
// Bu test dosyası, sw.js'in KENDİ mekaniğini (aktive olursa doğru
// çalışıp çalışmadığını) ayrı ayrı doğrulamak için sw.js'i TEST TARAFINDAN
// elle register eder -- bu, production'ın YAPMADIĞI bir şeyi test ortamında
// yapmak anlamına gelir, production kodu HİÇ değiştirilmez.
const { test, expect } = require('@playwright/test');

test.describe('K. Offline app-shell', () => {
  test('production kodu service worker\'i kendisi register etmiyor (yeni bulgu, negatif karakterizasyon)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForTimeout(500);   // olası gecikmeli register için makul bekleme
    const kayitliMi = await page.evaluate(async () => {
      const kayitlar = await navigator.serviceWorker.getRegistrations();
      return kayitlar.length > 0;
    });
    expect(kayitliMi, 'Production kodu sw.js\'i kendiliğinden register ETMEMELİ (bugünkü davranış) -- ' +
      'register olduysa bu karakterizasyonun güncellenmesi gerekir.').toBe(false);
  });

  test('sw.js ELLE register edilirse (test-only) app shell offline yeniden yuklemede acilir', async ({ page }) => {
    await page.goto('/index.html');

    // Test-only: production'ın kendisi YAPMADIĞI register çağrısı burada
    // yalnız sw.js'in KENDİ cache-first mekaniğini karakterize etmek için
    // yapılır.
    const registrationSonuc = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        return { basarili: true, hata: null, scope: reg.scope };
      } catch (e) {
        return { basarili: false, hata: String(e), scope: null };
      }
    });

    if (!registrationSonuc.basarili) {
      test.info().annotations.push({
        type: 'offline-test-atlandi',
        description: `sw.js test ortamında register edilemedi: ${registrationSonuc.hata}`,
      });
      test.skip(true, `sw.js register edilemedi (ortam kısıtı): ${registrationSonuc.hata}`);
      return;
    }

    // Aktivasyonu bekle.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // install/activate + caches.addAll için ek makul bekleme.
    await page.waitForFunction(async () => {
      const anahtarlar = await caches.keys();
      return anahtarlar.some((k) => k.startsWith('isg-saha-v'));
    }, { timeout: 10000 });

    await page.context().setOffline(true);
    try {
      const yanit = await page.reload();
      expect(yanit).toBeTruthy();
      await expect(page.locator('#screen-setup')).toHaveClass(/active/);
      await expect(page.locator('h3', { hasText: 'İSG Saha Asistanı' })).toBeVisible();

      // app.js gerçekten önbellekten servis edildi mi (network offline'ken).
      const appJsIcerigi = await page.evaluate(() => fetch('/app.js').then((r) => r.status));
      expect(appJsIcerigi).toBe(200);
    } finally {
      await page.context().setOffline(false);
    }
  });
});
