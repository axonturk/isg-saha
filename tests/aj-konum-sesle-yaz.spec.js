// PWA -- Oda/Mahal/Konum Kodu için "Sesle Yaz" (Kamera/OCR'a alternatif,
// Web Speech API destek varsa). #kat-alan-oda-no inputuna yazan ÜÇÜNCÜ bir
// giriş yolu -- elle giriş ve kamera/OCR (openOCR('etiket')) hiç
// kaldırılmadı/bozulmadı. TAM OFFLINE STT GARANTİSİ YOK -- yalnız tarayıcı
// destekliyorsa kullanılabilir bir hızlı-giriş yardımcısı.
//
// Gerçek mikrofon/STT KULLANILMAZ -- `speech-mocks.js` üretim kodunun
// beklediği SpeechRecognition arayüzünü (start/abort/stop +
// onstart/onresult/onerror/onend) taklit eden bir STUB sınıf kurar.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle } = require('./helpers');
const { sahteSesTanimaKur, sesTanimaDesteginiKaldir, sesTanimaSonucVer, sesTanimaHataVer } = require('./speech-mocks');

async function _kurumBirimHazirla(page, birimAdi = 'Rektörlük Binası') {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
}

async function _katAlanaGec(page) {
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#screen-kat-alan.active').waitFor();
}

test.describe('AJ. Oda/Mahal/Konum Kodu -- Sesle Yaz', () => {
  test('A. SpeechRecognition desteklenmiyorsa buton tıklanınca desteklenmiyor mesajı görünür', async ({ page }) => {
    await sesTanimaDesteginiKaldir(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await expect(page.locator('#kat-alan-sesle-yaz-durum')).toHaveText(
      'Bu cihaz/tarayıcı sesle yazmayı desteklemiyor. Elle giriş yapabilirsiniz.');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('');
  });

  test('B. Destek varsa "Sesle Yaz" butonu recognition başlatır (tr-TR, interimResults false, maxAlternatives 1)', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await expect(page.locator('#kat-alan-sesle-yaz-durum')).toHaveText('Dinleniyor…');
    await expect(page.locator('#kat-alan-sesle-yaz-btn')).toHaveText('⏹');

    const bilgi = await page.evaluate(() => ({
      sayac: window.__sesTanimaBaslatildiSayaci,
      lang: window.__sonSesTanimaOrnegi.lang,
      interim: window.__sonSesTanimaOrnegi.interimResults,
      maxAlt: window.__sonSesTanimaOrnegi.maxAlternatives,
    }));
    expect(bilgi.sayac).toBe(1);
    expect(bilgi.lang).toBe('tr-TR');
    expect(bilgi.interim).toBe(false);
    expect(bilgi.maxAlt).toBe(1);
  });

  test('C. "el üç yüz yedi" -> "L 307"', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'el üç yüz yedi');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('L 307');
    await expect(page.locator('#kat-alan-sesle-yaz-durum')).toHaveText('Algılandı: "L 307"');
  });

  test('D. "a iki yüz üç" -> "A 203"', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'a iki yüz üç');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('A 203');
  });

  test('E. "zemin on beş" -> "Z 15"', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'zemin on beş');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('Z 15');
  });

  test('F. "laboratuvar iki" -> "Laboratuvar 2"', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'laboratuvar iki');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('Laboratuvar 2');
  });

  test('F2. Ek normalizasyon örnekleri -- l/z tek harf, ofis/depo/kimya lab', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    const ornekler = [
      ['l üç yüz yedi', 'L 307'],
      ['z on beş', 'Z 15'],
      ['ofis on iki', 'Ofis 12'],
      ['depo üç', 'Depo 3'],
      ['kimya laboratuvarı', 'Kimya Laboratuvarı'],
      ['kimya lab', 'Kimya Lab'],
      ['yirmi bir', '21'],
    ];
    for (const [ham, beklenen] of ornekler) {
      await page.click('#kat-alan-sesle-yaz-btn');
      await sesTanimaSonucVer(page, ham);
      await expect(page.locator('#kat-alan-oda-no')).toHaveValue(beklenen);
    }
  });

  test('G. Tanıma hatasında elle giriş alanı bozulmaz', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.locator('#kat-alan-oda-no').fill('203');
    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaHataVer(page, 'network');

    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('203');   // elle girilen değer bozulmadı
    await expect(page.locator('#kat-alan-sesle-yaz-durum')).toContainText('Ses tanıma hatası');
    await expect(page.locator('#kat-alan-sesle-yaz-btn')).toHaveText('🎤');   // dinleme durdu, buton eski hâline döndü
  });

  test('H. Kullanıcı sesle yazılan sonucu elle düzenleyebilir', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'a iki yüz üç');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('A 203');

    await page.locator('#kat-alan-oda-no').fill('A 203 Düzeltildi');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('A 203 Düzeltildi');
  });

  test('I. Kamera/OCR butonu hâlâ görünür, akıştan kaldırılmadı', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await expect(page.locator('button[onclick="openOCR(\'etiket\')"]')).toBeVisible();
    await expect(page.locator('#kat-alan-sesle-yaz-btn')).toBeVisible();
    await expect(page.locator('#kat-alan-oda-no')).toBeVisible();   // elle giriş de aynen duruyor
  });

  test('J. Sesle yazma otomatik ileri geçiş veya kayıt yapmaz, yalnız inputu doldurur', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'laboratuvar iki');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('Laboratuvar 2');

    // Hâlâ kat-alan ekranındayız -- inceleme ekranına otomatik geçilmedi.
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await expect(page.locator('#screen-inspection')).not.toHaveClass(/active/);
  });

  test('K. Aktif dinleme sırasında akış değişirse (geri) güvenli durur', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.click('#kat-alan-sesle-yaz-btn');
    await expect(page.locator('#kat-alan-sesle-yaz-btn')).toHaveText('⏹');
    const sayacOnce = await page.evaluate(() => window.__sesTanimaBaslatildiSayaci);
    expect(sayacOnce).toBe(1);

    // Akış değişir -- setup ekranına geri dön (showScreen üzerinden TÜM
    // navigasyon _sesleYazDurdur'u tetikler).
    await page.click('button[onclick="katAlanGeri()"]');
    await page.locator('#screen-setup.active').waitFor({ timeout: 5000 });

    // Buton eski hâline döndü (dinleme durduruldu).
    await expect(page.locator('#kat-alan-sesle-yaz-btn')).toHaveText('🎤');

    // Tekrar kat-alan'a girip mikrofona basınca YENİ bir recognition
    // başlamalı (eskisi "toggle-stop" olarak takılı kalmamış) -- sayaç 2'ye çıkar.
    await _katAlanaGec(page);
    await page.click('#kat-alan-sesle-yaz-btn');
    const sayacSonra = await page.evaluate(() => window.__sesTanimaBaslatildiSayaci);
    expect(sayacSonra).toBe(2);
  });

  test('L. Mevcut oda/mahal/konum kayıt akışı bozulmaz -- sesle doldurulan kod ile Devam edilir', async ({ page }) => {
    await sahteSesTanimaKur(page);
    await _kurumBirimHazirla(page);
    await _katAlanaGec(page);

    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.click('#kat-alan-sesle-yaz-btn');
    await sesTanimaSonucVer(page, 'a iki yüz üç');
    await expect(page.locator('#kat-alan-oda-no')).toHaveValue('A 203');

    await page.click('button[onclick="startInspection()"]');
    await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
    await expect(page.locator('#current-loc-display')).toContainText('203');
  });
});
