// PWA Commit 2 / Bölüm C -- birim oluşturma ve kalıcılık karakterizasyonu.
// Gerçek alanlar app.js:733'teki `const birim = {...}` satırından çıkarıldı
// (tahmin edilmedi): id, kurumId, ad, tip, katlar, odalar, ozelAlanlar, olusturma.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

test.describe('C. Birim oluşturma ve kalıcılık', () => {
  test('yeni birim dogru kurumId ile saklanir, temel alanlari tasir, sayfa yenilemesinden sonra yuklenir', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('Birim');

    await gercekKurumEkle(page, kurumAdi);
    const kurumlar = await storeTumu(page, 'kurumlar');
    const kurum = kurumlar.find((k) => k.ad === kurumAdi);

    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 3 });

    const birimlerOnce = await storeTumu(page, 'birimler');
    const birim = birimlerOnce.find((b) => b.ad === birimAdi);
    expect(birim).toBeTruthy();

    // Gerçek üretim koduna göre beklenen alan kümesi.
    expect(birim).toMatchObject({
      kurumId: kurum.id,
      ad: birimAdi,
      tip: 'genel',
    });
    expect(Array.isArray(birim.katlar)).toBe(true);
    expect(birim.katlar).toEqual(['Zemin', '1.Kat', '2.Kat']);
    expect(Array.isArray(birim.odalar)).toBe(true);
    expect(birim.odalar).toEqual([]);
    expect(Array.isArray(birim.ozelAlanlar)).toBe(true);
    expect(typeof birim.olusturma).toBe('string');
    expect(typeof birim.id).toBe('string');

    // Sayfa yenilemesi sonrası birim seçim listesinde ve IndexedDB'de kalıcı.
    await page.reload();
    // Aynı kurumu tekrar seçmek gerekiyor (form state sayfa yenilemesiyle sıfırlanır).
    await page.locator('#setup-kurum').selectOption({ label: kurumAdi });
    await expect(page.locator('#setup-birim').locator('option', { hasText: birimAdi })).toHaveCount(1);

    const birimlerSonra = await storeTumu(page, 'birimler');
    const birimSonra = birimlerSonra.find((b) => b.ad === birimAdi);
    expect(birimSonra.id).toBe(birim.id);
    expect(birimSonra.kurumId).toBe(kurum.id);
  });

  test('tek katli birim varsayilan olarak Zemin katini tasir', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('Birim1Kat');

    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });

    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => b.ad === birimAdi);
    expect(birim.katlar).toEqual(['Zemin']);
  });
});
