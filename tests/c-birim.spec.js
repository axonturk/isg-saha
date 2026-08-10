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

  // SUPV-22 (2026-08-10) -- Birim dropdown düzeltmesi: eskiden Object.
  // entries(PROFILLER) üzerinden HER profil için ayrı "+Yeni: X" kısayolı
  // üretiliyordu (onlarca öneri, kuruma bağlı birim sayısından bağımsız
  // sabit bir liste). Artık tek bir genel "+ Yeni Birim Ekle" seçeneği var.
  test.describe('SUPV-22 -- Birim dropdown duzeltmesi', () => {
    test('dropdown yalnizca TEK "+ Yeni Birim Ekle" secenegi gosterir, onlarca per-profil kisayolu YOK', async ({ page }) => {
      await page.goto('/index.html');
      const kurumAdi = benzersizAd('Kurum');
      await gercekKurumEkle(page, kurumAdi);

      const yeniSecenekler = page.locator('#setup-birim option', { hasText: '+ Yeni' });
      await expect(yeniSecenekler).toHaveCount(1);
      await expect(yeniSecenekler.first()).toHaveText('+ Yeni Birim Ekle');
      // Eski per-profil kısayolları (ör. "+ Yeni: Rektörlük") artık YOK.
      await expect(page.locator('#setup-birim option', { hasText: '+ Yeni: Rektörlük' })).toHaveCount(0);
      await expect(page.locator('#setup-birim option', { hasText: '+ Yeni: Hastane' })).toHaveCount(0);
    });

    test('dropdown yalnizca SECILI kuruma bagli birimleri listeler, baska kurumun birimi sizmaz', async ({ page }) => {
      await page.goto('/index.html');
      const kurumA = benzersizAd('KurumA');
      const kurumB = benzersizAd('KurumB');
      const birimA = benzersizAd('BirimA');
      const birimB = benzersizAd('BirimB');

      await gercekKurumEkle(page, kurumA);
      await gercekBirimEkle(page, { ad: birimA, profil: 'genel' });

      await gercekKurumEkle(page, kurumB);
      await gercekBirimEkle(page, { ad: birimB, profil: 'genel' });

      // Kurum B seçiliyken yalnız Birim B görünür, Birim A sızmaz.
      await expect(page.locator('#setup-birim option', { hasText: birimB })).toHaveCount(1);
      await expect(page.locator('#setup-birim option', { hasText: birimA })).toHaveCount(0);

      // Kurum A'ya geri dönünce yalnız Birim A görünür, Birim B sızmaz.
      await page.locator('#setup-kurum').selectOption({ label: kurumA });
      await expect(page.locator('#setup-birim option', { hasText: birimA })).toHaveCount(1);
      await expect(page.locator('#setup-birim option', { hasText: birimB })).toHaveCount(0);
    });

    test('"+ Yeni Birim Ekle" secilince yeni birim formu acilir, tip formun icinde secilir', async ({ page }) => {
      await page.goto('/index.html');
      const kurumAdi = benzersizAd('Kurum');
      const birimAdi = benzersizAd('DropdownBirimi');
      await gercekKurumEkle(page, kurumAdi);

      await page.locator('#setup-birim').selectOption('YENI');
      await expect(page.locator('#form-birim-profil')).toBeVisible();
      // onceTip verilmedigi icin "Bina Tipi" varsayilan bos ("Seçiniz...").
      await expect(page.locator('#form-birim-profil')).toHaveValue('');

      await page.locator('#form-birim-profil').selectOption('genel');
      await page.locator('#form-birim-ad').fill(birimAdi);
      await page.click('#form-action-btn');

      // yeniBirimEkle()'nin kendi kaydetme akışı, oluşturulan birimi
      // dropdown'da OTOMATİK seçili bırakır (bkz. app.js'teki
      // `document.getElementById('setup-birim').value = birim.id;`).
      await expect(page.locator('#setup-birim option:checked')).toHaveText(birimAdi);
    });
  });
});
