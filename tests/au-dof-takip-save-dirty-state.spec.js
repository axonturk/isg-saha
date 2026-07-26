// PWA 4R-PKG-3G -- Kaydet dirty-state kontratı: yalnız takip/durum alanları
// Kaydet'i aktifleştirir (medya auto-persist Kaydet'ten BAĞIMSIZDIR), Kaydet
// sonrası pasifleşir, yeniden alan değiştirilince tekrar aktifleşir. Gerçek
// servisler (dofTakipTaslagiGetir/Guncelle, dofKanitMedyaEkle) DEĞİŞTİRİLMEDİ
// -- bu dosya yalnız UI dirty-state/event-binding katmanını test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AU-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

async function ikiDofKur(page) {
  const paket = gecerliDofPaketi({
    tehlikelerOverride: [
      gecerliDofKaydi({ dofId: 1, bulguKodu: 'AU-2A' }),
      gecerliDofKaydi({ dofId: 2, bulguKodu: 'AU-2B' }),
    ],
  });
  await dosyaSec(page, JSON.stringify(paket));
  return {
    paketUuid: paket.paketUuid,
    dofUuidA: paket.tehlikeler[0].dofUuid,
    dofUuidB: paket.tehlikeler[1].dofUuid,
  };
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

test.describe('AU. DÖF takip Kaydet dirty-state (4R-PKG-3G)', () => {
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

  test('1. İlk açılış pasif -- Kaydet disabled, tıklama/programatik çağrı kayıt oluşturmaz', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await expect(kaydetBtn).toBeDisabled();

    await page.evaluate(() => window._dofTakipKaydet());
    await expect(page.locator('#dof-takip-durum')).toHaveText('Değişiklik yok.');
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();
  });

  test('2. Alan değişince aktif -- Sorumlu yazınca disabled=false, ipucu değişiklik metni gösterir', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await expect(kaydetBtn).toBeEnabled();
    await expect(page.locator('#dof-takip-ipucu')).toHaveText('Değişiklik var -- Kaydet aktif.');
  });

  test('3. Kaydet sonrası pasif -- "Takip bilgileri kaydedildi" görünür, buton disabled olur', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await expect(kaydetBtn).toBeEnabled();
    await kaydetBtn.click();

    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi.sorumlu).toBe('Ahmet Yilmaz');
  });

  test('4. Kaydet sonrası tekrar değişiklik -- ana kabul kriteri: Kaydet yeniden aktifleşir, yeni değer kaydedilir', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();

    // Aynı DÖF'te başka bir alan değiştirilir -- Kaydet tekrar aktifleşmeli.
    await page.locator('#dof-takip-gozlem-degerlendirme').fill('İkinci ziyarette düzeltildi.');
    await expect(kaydetBtn).toBeEnabled();
    await kaydetBtn.click();

    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi.sorumlu).toBe('Ahmet Yilmaz');
    expect(kayit.takipTaslagi.gozlem_degerlendirme).toBe('İkinci ziyarette düzeltildi.');
  });

  test('5. Select/change event -- Saha inceleme durumu (Yeni O/F/S) değişince aktif, Kaydet sonrası pasif, tekrar seçilince yeniden aktif', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    // O/F/S üçlü kuralı: biri dokunulursa üçü birlikte gönderilir, kısmi
    // üçlü (yalnız O dolu) servis tarafından reddedilir -- bu yüzden test
    // üçünü birden seçer (gerçek saha kullanımını yansıtır).
    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await page.selectOption('#dof-takip-yeni-o', '10');
    await expect(kaydetBtn).toBeEnabled();
    await page.selectOption('#dof-takip-yeni-f', '10');
    await page.selectOption('#dof-takip-yeni-s', '100');
    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();

    await page.selectOption('#dof-takip-yeni-o', '6');
    await expect(kaydetBtn).toBeEnabled();
    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi.yeni_o).toBe(6);
  });

  test('6. DÖF değiştirince dirty state sızmaz -- bir DÖF\'te kaydet, listeye dön, başka DÖF\'e gir: başlangıçta pasif', async ({ page }) => {
    const { paketUuid, dofUuidA, dofUuidB } = await ikiDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuidA);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await page.locator('#dof-takip-sorumlu').fill('A Sorumlusu');
    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();
    await dofunaGir(page, dofUuidB);

    // B'ye yeni girildi -- A'nın sorumlu değeri sızmamalı, form BOŞ, Kaydet pasif.
    await expect(page.locator('#dof-takip-sorumlu')).toHaveValue('');
    await expect(kaydetBtn).toBeDisabled();

    await page.locator('#dof-takip-sorumlu').fill('B Sorumlusu');
    await expect(kaydetBtn).toBeEnabled();
    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayitA = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuidA);
    const kayitB = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuidB);
    expect(kayitA.takipTaslagi.sorumlu).toBe('A Sorumlusu');
    expect(kayitB.takipTaslagi.sorumlu).toBe('B Sorumlusu');
  });

  test('7. Medya Kaydet\'i aktif yapmaz ama sayaç/özet günceller', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await expect(kaydetBtn).toBeDisabled();
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('Henüz kanıt eklenmedi.');

    await dofGaleriFotoYukle(page);

    // Medya auto-persist edildi -- sayaç güncellenir, ama Kaydet takip
    // alanları için pasif KALIR (ürün kararı: medya Kaydet'i aktifleştirmez).
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf eklendi.');
    await expect(kaydetBtn).toBeDisabled();
    await expect(page.locator('#dof-replay-paket-ozet')).toHaveText(/^Paket: 1 DÖF · 1 Foto · 0 Ses$/);
  });
});
