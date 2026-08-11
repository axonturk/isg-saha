// PWA 4R-PKG-3J -- Kaydet durum metni ve UI netleştirme.
//
// Canlı kullanıcı bulgusu: foto/ses ekledikten sonra Kaydet gri kaldığı
// için kullanıcı "kaydedilmedi" sanıyor. Veri aslında IndexedDB'ye
// yazılmış durumda (medyanın Kaydet'ten bağımsız anında persist edilmesi
// BİLİNÇLİ bir üründür kararı, bu turda DEĞİŞMEDİ). Sorun butonun
// davranışı değil, hiçbir yerde "kaydedildi" geri bildiriminin
// gösterilmemesiydi -- bu dosya tek durum metni alanını (#dof-durum-metni)
// ve tek yazma noktasını (_dofDurumMetniGuncelle) doğrular.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
const { sahteKameraKur } = require('./media-mocks');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AX-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

async function paketiAc(page, paketUuid) {
  await page.locator(`[data-paket-uuid="${paketUuid}"] button`, { hasText: 'Aç' }).click();
  await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
}

async function dofunaGir(page, dofUuid) {
  await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
}

test.describe('AX. Kaydet durum metni ve UI netleştirme (4R-PKG-3J)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('H1. Medya eklendiğinde durum metni güncellenir, Kaydet disabled KALIR', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    const durumMetni = page.locator('#dof-durum-metni');
    await expect(durumMetni).toHaveText('');
    await expect(kaydetBtn).toBeDisabled();

    await dofGaleriFotoYukle(page);
    await expect(durumMetni).toHaveText(/^✓ Görsel eklendi · \d{2}:\d{2}$/);
    await expect(kaydetBtn).toBeDisabled();   // medya Kaydet'i ETKİLEMEZ -- bilinçli ürün kararı korunur

    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();   // medya takip DB'sine yazmaz, kendi store'una yazar
  });

  test('H1b. Kamera fotoğrafı "Fotoğraf eklendi", galeri görseli "Görsel eklendi" -- kaynak ayrımı korunur', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await sahteKameraKur(page);
    // NOT: `sahteKameraKur` bir `addInitScript` kullanır -- yalnız BUNDAN
    // SONRAKİ navigasyonda etkili olur, bu yüzden sayfa burada TEKRAR
    // yüklenir (üstteki `beforeEach`'in navigasyonu bu mock'tan öncedir).
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const durumMetni = page.locator('#dof-durum-metni');

    // Gerçek kamera akışı (sahte donanım, gerçek openOCR/capturePhoto UI).
    await page.click('button[onclick="openOCR(\'dof-kanit\')"]');
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#camera-ui')).toBeHidden();
    await expect(durumMetni).toHaveText(/^✓ Fotoğraf eklendi · \d{2}:\d{2}$/);

    // Gerçek galeri akışı -- AYNI DÖF'e ikinci medya, farklı kaynak metni.
    await dofGaleriFotoYukle(page);
    await expect(durumMetni).toHaveText(/^✓ Görsel eklendi · \d{2}:\d{2}$/);
  });

  test('H2. Takip metni değişince durum metni dirty mesajı gösterir, Kaydet enabled olur', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    const durumMetni = page.locator('#dof-durum-metni');
    await page.locator('#dof-takip-sorumlu').fill('AX Sorumlu');
    await expect(durumMetni).toHaveText('Kaydedilmemiş değişiklik var');
    await expect(kaydetBtn).toBeEnabled();
  });

  test('H2b. Medya eklendikten SONRA takip alanı değiştirilirse dirty mesajı önceliklidir (medya mesajını EZER)', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const durumMetni = page.locator('#dof-durum-metni');
    await dofGaleriFotoYukle(page);
    await expect(durumMetni).toHaveText(/^✓ Görsel eklendi/);

    await page.locator('#dof-takip-sorumlu').fill('AX Oncelik');
    await expect(durumMetni).toHaveText('Kaydedilmemiş değişiklik var');
  });

  test('H3. Kaydet sonrası durum metni başarı mesajı + saat gösterir, Kaydet disabled olur', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    const durumMetni = page.locator('#dof-durum-metni');
    await page.locator('#dof-takip-sorumlu').fill('AX Kaydedildi');
    await kaydetBtn.click();

    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(durumMetni).toHaveText(/^✓ Kaydedildi · \d{2}:\d{2}$/);
    await expect(kaydetBtn).toBeDisabled();

    // Tekrar değişiklik yapılırsa durum metni yeniden dirty'ye döner.
    await page.locator('#dof-takip-sorumlu').fill('AX Tekrar');
    await expect(durumMetni).toHaveText('Kaydedilmemiş değişiklik var');
  });

  test('H4. IndexedDB yazması BAŞARISIZ olursa başarı metni GÖSTERİLMEZ -- "Kaydedilemedi" görünür, DB değişmez', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    const durumMetni = page.locator('#dof-durum-metni');
    // O/F/S üçlü kuralı: yalnız "Yeni O" doldurulursa servis (`dofTakipTaslagiGuncelle`)
    // reddeder -- gerçek, testte-üretilebilir bir DB-yazma-başarısızlığı senaryosu
    // (mock'a gerek yok, servisin KENDİ reddi kullanılıyor).
    await page.selectOption('#dof-takip-yeni-o', '10');
    await expect(kaydetBtn).toBeEnabled();
    await kaydetBtn.click();

    await expect(page.locator('#dof-takip-durum')).toContainText('Olasılık (O), Frekans (F), Şiddet (Ş) birlikte doldurulmalı');
    await expect(durumMetni).toHaveText('Kaydedilemedi — tekrar deneyin');
    await expect(durumMetni).not.toContainText('Kaydedildi');

    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();   // DB DEĞİŞMEDİ
  });

  test('H5. Boş DÖF\'te "Henüz kanıt eklenmedi" -- özet ve liste alanlarında AYRI AYRI birer kez görünür, listede birden fazla değil', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    // İki bağımsız bölge -- özet satırı (#dof-kanit-medya-ozet) ve liste
    // yer tutucusu (#dof-kanit-medya-liste). Her ikisi de KENDİ İÇİNDE tam
    // olarak BİR kez göstermeli; ikisinin AYNI ANDA görünmesi bilinçli bir
    // tasarımdır (özet + liste-placeholder, iki farklı semantik bölge).
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('Henüz kanıt eklenmedi.');
    const listeParagraflari = page.locator('#dof-kanit-medya-liste p', { hasText: 'Henüz kanıt eklenmedi.' });
    await expect(listeParagraflari).toHaveCount(1);

    // Medya eklenince HER İKİ bölgeden de kaybolmalı.
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-ozet')).not.toContainText('Henüz kanıt eklenmedi.');
    await expect(page.locator('#dof-kanit-medya-liste')).not.toContainText('Henüz kanıt eklenmedi.');
  });

  test('A2. "Kanıt Medyaları" başlığı "(otomatik kaydedilir)" ikincil metniyle birlikte görünür', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const baslik = page.locator('#dof-kanit-medya-kart h2');
    await expect(baslik).toContainText('Kanıt Medyaları');
    await expect(baslik).toContainText('(otomatik kaydedilir)');
  });

  test('A3. Alt bar paket özeti "Paket:" öneki ile görünür', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AX Alt Bar');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    await expect(page.locator('#dof-replay-paket-ozet')).toHaveText(/^Paket: 1 DÖF · \d+ Foto · \d+ Ses$/);
  });

  test('A5. Debug paneli "Geliştirici" başlığı altında, varsayılan kapalı, açılınca tam içerik görünür', async ({ page }) => {
    const gelistiriciDetay = page.locator('#dof-gelistirici-detay');
    const panel = page.locator('#dof-debug-panel');
    await expect(page.locator('#dof-gelistirici-detay summary')).toContainText('Geliştirici');
    await expect(panel).toBeHidden();

    await page.click('#dof-gelistirici-detay summary');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('== KAYDET ==');
    await expect(panel).toContainText('== PAYLAŞ ==');
    expect(await gelistiriciDetay.evaluate((el) => el.open)).toBe(true);
  });
});
