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

  // PWA Commit 3A (bilinçli güncelleme): bu test Commit 2'de "committed
  // baseline'da dofler store'u YOKTUR" (DB_VERSION=2) davranışını
  // kilitliyordu. Commit 3A bunu KASITLI olarak değiştirdi -- IndexedDB
  // artık v4'e yükseliyor ve kanonik `dofler` store'unu oluşturuyor (bkz.
  // app.js::openDB, tests/l-indexeddb-migration.spec.js -- migration'ın
  // KENDİSİ orada ayrıntılı doğrulanıyor). Bu test yalnız "temiz kurulumda
  // GÜNCEL beklenen son durum" özetini korur, negatif assertion SESSİZCE
  // silinmedi -- pozitife çevrildi.
  // PWA Commit 4P (bilinçli güncelleme): DB_VERSION 4->5, yeni `dofKanitlari`
  // store'u (DÖF kanıt medyası) eklendi -- bkz. app.js::openDB.
  test('IndexedDB v5 temiz kurulumda kanonik dofler + dofKanitlari store\'larını oluşturur', async ({ page }) => {
    await page.goto('/index.html');
    const { adlar, versiyon } = await storeAdlari(page);

    expect(versiyon).toBe(5);
    expect(adlar.sort()).toEqual(['ayarlar', 'birimler', 'bulgular', 'denetimler', 'dofKanitlari', 'dofler', 'kurumlar'].sort());
    expect(adlar).toContain('dofler');
    expect(adlar).toContain('dofKanitlari');
  });
});
