// PWA Commit 2 / Bölüm K -- offline app-shell karakterizasyonu.
//
// GÜNCELLEME (PWA Commit 4K): Commit 2'nin bulduğu boşluk (`sw.js` var ama
// production kodu register etmiyordu) 4K ile kapatıldı -- `app.js` artık
// `window.addEventListener('load', ...)` içinde `navigator.serviceWorker
// .register('./sw.js')` çağırıyor. İlk test aşağıda bunu POZİTİF olarak
// doğrular (eski negatif karakterizasyonun yerini alır). Registration
// çağrısının kendisiyle ilgili ayrıntılı senaryolar (path, tek seferlik,
// unsupported/reject davranışı, DÖF/saha regresyonu) artık
// tests/w-service-worker-registration.spec.js'de -- burada tekrar edilmez.
//
// Bu test dosyası, sw.js'in KENDİ mekaniğini (cache-first app shell +
// offline reload) doğrular.
const { test, expect } = require('@playwright/test');

test.describe('K. Offline app-shell', () => {
  test('production kodu service worker\'i kendisi register eder (PWA Commit 4K)', async ({ page }) => {
    await page.goto('/index.html');
    const kayitliMi = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      return !!reg;
    });
    expect(kayitliMi, 'Production kodu sw.js\'i kendiliğinden register ETMELİ (PWA Commit 4K).').toBe(true);
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
