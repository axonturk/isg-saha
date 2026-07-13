// PWA Commit 1 -- yalnız test altyapısının kendisini doğrulayan minimum
// smoke test. Uygulama davranışını KARAKTERİZE ETMEZ (bu, Commit 2'nin
// kapsamıdır) -- yalnız Playwright + statik sunucu + gerçek Chromium
// zincirinin uçtan uca çalıştığını kanıtlar.
const { test, expect } = require('@playwright/test');

test.describe('PWA Commit 1 -- test altyapısı smoke', () => {
  test('sayfa yüklenir, konsol hatası yok, kurulum ekranı görünür, IndexedDB açılır', async ({ page }) => {
    const konsolHatalari = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') konsolHatalari.push(msg.text());
    });
    page.on('pageerror', (err) => konsolHatalari.push(String(err)));

    await page.goto('/index.html');

    // Ana kurulum ekranı (screen-setup) aktif olmalı.
    const kurulumEkrani = page.locator('#screen-setup');
    await expect(kurulumEkrani).toHaveClass(/active/);
    await expect(page.locator('h3', { hasText: 'İSG Saha Asistanı' })).toBeVisible();

    // "Yeni Denetim" kartı ve Kurum seçici görünür olmalı.
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('#setup-birim')).toBeVisible();

    // IndexedDB gerçekten açılabiliyor mu -- sayfa içi gerçek tarayıcı API'si
    // ile (mock/polyfill YOK), openDB() app.js'in kendi fonksiyonu.
    const dbAcildiMi = await page.evaluate(() => {
      return new Promise((resolve) => {
        const req = indexedDB.open('isgSahaDB');
        req.onsuccess = () => { req.result.close(); resolve(true); };
        req.onerror = () => resolve(false);
      });
    });
    expect(dbAcildiMi).toBe(true);

    // Yakalanmamış hata banner'ı (app.js'in kendi 'error' dinleyicisi)
    // görünmemeli -- görünüyorsa bir şey gerçekten patlamış demektir.
    await expect(page.locator('#hata-banner')).toHaveCount(0);

    expect(konsolHatalari, `Konsol hataları: ${JSON.stringify(konsolHatalari)}`).toEqual([]);
  });
});
