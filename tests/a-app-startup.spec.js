// PWA Commit 2 / Bölüm A -- uygulama başlangıcı karakterizasyonu.
const { test, expect } = require('@playwright/test');
const { storeAdlari } = require('./helpers');

test.describe('A. Uygulama başlangıcı', () => {
  test('ana sayfa acilir, console error yok, kurulum ekrani aktiftir, temel form kontrolleri mevcuttur', async ({ page }) => {
    const konsolHatalari = [];
    page.on('console', (msg) => { if (msg.type() === 'error') konsolHatalari.push(msg.text()); });
    page.on('pageerror', (err) => konsolHatalari.push(String(err)));

    const yanit = await page.goto('/index.html');
    expect(yanit.status()).toBe(200);

    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('#setup-birim')).toBeVisible();
    await expect(page.locator('#setup-tur')).toBeVisible();
    await expect(page.locator('#setup-responsible')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeVisible();

    expect(konsolHatalari, `Konsol hataları: ${JSON.stringify(konsolHatalari)}`).toEqual([]);
  });

  test('IndexedDB isgSahaDB acilir, committed baseline object store listesi dofler icermez', async ({ page }) => {
    await page.goto('/index.html');
    const { adlar, versiyon } = await storeAdlari(page);

    expect(versiyon).toBe(2);
    expect(adlar.sort()).toEqual(['ayarlar', 'birimler', 'bulgular', 'denetimler', 'kurumlar'].sort());
    expect(adlar).not.toContain('dofler');
  });
});
