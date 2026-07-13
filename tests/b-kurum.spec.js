// PWA Commit 2 / Bölüm B -- kurum oluşturma ve kalıcılık karakterizasyonu.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, storeTumu } = require('./helpers');

test.describe('B. Kurum oluşturma ve kalıcılık', () => {
  test('yeni kurum secim listesinde gorunur, sayfa yenilemesinden sonra IndexedDBden yuklenir', async ({ page }) => {
    await page.goto('/index.html');
    const ad = benzersizAd('Kurum');

    await gercekKurumEkle(page, ad);

    // 1) Seçim listesinde görünüyor + otomatik seçili.
    const secim = page.locator('#setup-kurum');
    await expect(secim.locator('option', { hasText: ad })).toHaveCount(1);
    await expect(secim).toHaveValue(await secim.locator('option', { hasText: ad }).getAttribute('value'));

    // 2) IndexedDB'de gerçekten oluşmuş -- benzersiz id + bozulmamış ad.
    const kurumlarOnce = await storeTumu(page, 'kurumlar');
    const kayitOnce = kurumlarOnce.find((k) => k.ad === ad);
    expect(kayitOnce).toBeTruthy();
    expect(kayitOnce.id).toBeTruthy();
    expect(typeof kayitOnce.id).toBe('string');

    // 3) Sayfa yenile -- kurum IndexedDB'den TEKRAR yüklenir (bellek değil).
    await page.reload();
    const secimYeniden = page.locator('#setup-kurum');
    await expect(secimYeniden.locator('option', { hasText: ad })).toHaveCount(1);

    const kurumlarSonra = await storeTumu(page, 'kurumlar');
    const kayitSonra = kurumlarSonra.find((k) => k.ad === ad);
    expect(kayitSonra).toBeTruthy();
    expect(kayitSonra.id).toBe(kayitOnce.id);
    expect(kayitSonra.ad).toBe(ad);
  });

  test('kurum kaydinda id benzersizdir -- iki farkli kurum farkli id tasir', async ({ page }) => {
    await page.goto('/index.html');
    const ad1 = benzersizAd('KurumA');
    const ad2 = benzersizAd('KurumB');

    await gercekKurumEkle(page, ad1);
    await gercekKurumEkle(page, ad2);

    const kurumlar = await storeTumu(page, 'kurumlar');
    const k1 = kurumlar.find((k) => k.ad === ad1);
    const k2 = kurumlar.find((k) => k.ad === ad2);
    expect(k1.id).not.toBe(k2.id);
  });
});
