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

  // --- Kurum/Birim Hiyerarşisi (2026-08-02, Faz 2 Commit 3) ---

  test('ust birim secilirse parentBirimId dogru kaydedilir', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Kurum');
    const ustAdi = benzersizAd('Rektorluk');
    const altAdi = benzersizAd('SGDB');

    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: ustAdi, profil: 'genel' });

    const birimlerOnce = await storeTumu(page, 'birimler');
    const ust = birimlerOnce.find((b) => b.ad === ustAdi);

    await gercekBirimEkle(page, { ad: altAdi, profil: 'genel', ustBirimId: ust.id });

    const birimlerSonra = await storeTumu(page, 'birimler');
    const alt = birimlerSonra.find((b) => b.ad === altAdi);
    expect(alt.parentBirimId).toBe(ust.id);
    expect(ust.parentBirimId == null).toBe(true);
  });

  test('ust birim secilmezse parentBirimId null kaydedilir', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('UstSeviye');

    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel' });

    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => b.ad === birimAdi);
    expect(birim.parentBirimId).toBeNull();
  });

  // --- Kurum türüne göre birim-adı önerisi (2026-08-02) ---

  test('turu hastane olan kurumda birim adi onerisi chipleri gorunur ve tiklaninca ad alanini doldurur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Hastane');
    await gercekKurumEkle(page, kurumAdi, 'hastane');

    await page.click('button[onclick="yeniBirimEkle()"]');
    const oneriChip = page.locator('#form-birim-ad-onerisi-chips .chip', { hasText: 'Acil Servis Bloğu' });
    await expect(oneriChip).toBeVisible();
    await oneriChip.click();
    await expect(page.locator('#form-birim-ad')).toHaveValue('Acil Servis Bloğu');

    await page.locator('#form-birim-profil').selectOption('genel');
    await page.click('#form-action-btn');

    const birimler = await storeTumu(page, 'birimler');
    expect(birimler.some((b) => b.ad === 'Acil Servis Bloğu')).toBe(true);
  });

  test('turu belirtilmemis kurumda birim adi onerisi chip alani gorunmez', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('TurYokKurum');
    await gercekKurumEkle(page, kurumAdi);

    await page.click('button[onclick="yeniBirimEkle()"]');
    await expect(page.locator('#form-birim-ad-onerisi-wrap')).toHaveCount(0);
  });

  test('oneri chipi tiklandiktan sonra kullanici ad alanini serbestce degistirebilir', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Fabrika');
    await gercekKurumEkle(page, kurumAdi, 'fabrika');

    await page.click('button[onclick="yeniBirimEkle()"]');
    await page.locator('#form-birim-ad-onerisi-chips .chip', { hasText: 'Üretim Bölümü' }).click();
    await page.locator('#form-birim-ad').fill('Kendi Yazdığım Ad');
    await page.locator('#form-birim-profil').selectOption('genel');
    await page.click('#form-action-btn');

    const birimler = await storeTumu(page, 'birimler');
    expect(birimler.some((b) => b.ad === 'Kendi Yazdığım Ad')).toBe(true);
    expect(birimler.some((b) => b.ad === 'Üretim Bölümü')).toBe(false);
  });

  // --- İçerik genişletmesi (2026-08-02) -- fabrika/kamu kurumu/şantiye ---

  test('fabrika: genisletilmis birim adi onerileri (Ar-Ge Merkezi) gorunur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Fabrika2');
    await gercekKurumEkle(page, kurumAdi, 'fabrika');
    await page.click('button[onclick="yeniBirimEkle()"]');
    await expect(page.locator('#form-birim-ad-onerisi-chips .chip', { hasText: 'Ar-Ge Merkezi' })).toBeVisible();
  });

  test('kamu kurumu: genisletilmis birim adi onerileri (Meclis / Encümen Salonu) gorunur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('KamuKurumu');
    await gercekKurumEkle(page, kurumAdi, 'kamu_kurumu');
    await page.click('button[onclick="yeniBirimEkle()"]');
    await expect(page.locator('#form-birim-ad-onerisi-chips .chip', { hasText: 'Meclis / Encümen Salonu' })).toBeVisible();
  });

  test('santiye: genisletilmis birim adi onerileri (Beton Santrali) gorunur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Santiye');
    await gercekKurumEkle(page, kurumAdi, 'santiye');
    await page.click('button[onclick="yeniBirimEkle()"]');
    await expect(page.locator('#form-birim-ad-onerisi-chips .chip', { hasText: 'Beton Santrali / Karışım Alanı' })).toBeVisible();
  });

  test('fabrika: genisletilmis oda/alan tipi listesinde yeni maddeler var', async ({ page }) => {
    await page.goto('/index.html');
    const kurumAdi = benzersizAd('Fabrika3');
    const birimAdi = benzersizAd('FabrikaBirimi');
    await gercekKurumEkle(page, kurumAdi, 'fabrika');
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'fabrika' });
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await expect(page.locator('#kat-alan-alan-dropdown option', { hasText: 'Kaynak atölyesi' })).toHaveCount(1);
    await expect(page.locator('#kat-alan-alan-dropdown option', { hasText: 'İSG / güvenlik ofisi' })).toHaveCount(1);
  });
});
