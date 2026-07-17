// PWA Commit 2 / Bölüm F -- fotoğraf davranışı karakterizasyonu.
// Fiziksel kamera GEREKTİRMEZ -- `getUserMedia` gerçek (canlı, kanvas
// kaynaklı) bir video stream'ine yönlendirilir (bkz. media-mocks.js).
// Production kodu (openOCR/capturePhoto/compressImage) HİÇ değiştirilmedi.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur } = require('./media-mocks');

async function _denetimBaslat(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
  const denetimler = await storeTumu(page, 'denetimler');
  return denetimler[0];
}

test.describe('F. Fotoğraf davranışı (gerçek kamera akışı, sanal donanım)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await sahteKameraKur(page);
  });

  test('kamerayla cekilen fotograf gecici listeye eklenir, bulguya dogru denetimId ile baglanir, Blob olarak saklanir', async ({ page }) => {
    await _denetimBaslat(page);

    // Kamera kontrolü mevcut mu -- "Çek-Onayla (Kanıt Fotoğrafı)".
    const kameraButonu = page.locator('button[onclick="openOCR(\'kanit\')"]');
    await expect(kameraButonu).toBeVisible();
    await kameraButonu.click();

    await expect(page.locator('#camera-ui')).toBeVisible();
    // Video gerçekten canlı kare alana kadar bekle (videoWidth>0).
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });

    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#camera-ui')).toBeHidden();

    // Geçici (kaydedilmemiş) foto önizleme listesine eklendi mi.
    await expect(page.locator('#foto-onizleme')).toContainText('1 fotoğraf hazır');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);

    // Birden fazla fotoğraf desteği -- ikinci fotoğrafı da çek.
    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#foto-onizleme')).toContainText('2 fotoğraf hazır');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(2);

    await page.locator('button[onclick="saveFinding()"]').click();

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    const bulgu = bulgular[0];
    expect(bulgu.fotolar.length).toBe(2);

    for (const foto of bulgu.fotolar) {
      expect(foto.blob).toBeTruthy();
      expect(typeof foto.boyut).toBe('number');
      expect(foto.boyut).toBeGreaterThan(0);
      expect(typeof foto.genislik).toBe('number');
      expect(typeof foto.yukseklik).toBe('number');
      expect(foto.genislik).toBeGreaterThan(0);
      expect(foto.yukseklik).toBeGreaterThan(0);
    }

    // Blob gerçekten IndexedDB'den Blob olarak dönüyor mu (yalnız referans
    // değil) -- constructor adını sayfa içinde doğrula.
    const blobTuru = await page.evaluate(async () => {
      const kayitlar = await window._idb.dbTumu('bulgular');
      const foto = kayitlar[0].fotolar[0];
      return { constructorAdi: foto.blob.constructor.name, tip: foto.blob.type, boyut: foto.blob.size };
    });
    expect(blobTuru.constructorAdi).toBe('Blob');
    expect(blobTuru.tip).toBe('image/jpeg');
    expect(blobTuru.boyut).toBeGreaterThan(0);
  });
});

test.describe('F. Galeri desteği', () => {
  test('PWA Commit 4L ile galeriden yükleme input\'u denetim ekranında mevcuttur', async ({ page }) => {
    await _denetimBaslat(page);
    // PWA Commit 4L öncesi burada `type="file"` bir input HİÇ YOKTU (yalnız
    // `getUserMedia` tabanlı kamera akışı vardı) -- bu negatif karakterizasyon
    // artık pozitife döndü (bkz. tests/x-gallery-image-upload.spec.js, kapsamlı
    // galeri davranışı orada test edilir, burada yalnız varlığı doğrulanır).
    const dosyaInputlari = await page.locator('#screen-inspection input[type="file"]').count();
    expect(dosyaInputlari, 'Galeriden yükleme input\'u PWA Commit 4L ile eklendi.').toBe(1);
  });
});
