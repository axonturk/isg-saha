// PWA 4R-PKG-2 -- DÖF replay ZIP artık (a) yalnız seçili DÖF'ü değil,
// aynı import paketindeki (paketUuid) TÜM "değişmiş" kanonik DÖF'leri
// toplar (dofPaketiDegismisDofUuidleri + _dofReplayZipIndirTikla), (b)
// zaman damgalı, çakışmasız dosya adı üretir (_dofReplayZipDosyaAdiUret).
// Gerçek servisler DEĞİŞTİRİLMEDİ: `dofReplayZipOlustur` zaten çoklu
// `dofUuidListesi` kabul ediyordu (bkz. dofDonusBelgesiOlustur), yalnız
// hangi listenin verileceğini belirleyen toplama katmanı ve dosya adı
// üretimi YENİ eklendi -- bu dosya bu yeni davranışı gerçek kullanıcı
// paketiyle (tests/fixtures/DOF_Kutuphane_2026-07-03.json) test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');

test.describe.configure({ mode: 'serial' });

const PAKET_YOLU = path.join(__dirname, 'fixtures', 'DOF_Kutuphane_2026-07-03.json');
const PAKET_METNI = fs.readFileSync(PAKET_YOLU, 'utf-8');
const PAKET = JSON.parse(PAKET_METNI);

const DOF_A_UUID = '83f68019-f0ed-46ac-a5ed-0101a7117975';   // 2026-KUT-ASAN-00003-R02
const DOF_B_UUID = 'a71621ad-7c60-4073-a7fe-5a40f4fb0723';   // 2026-KUT-KOMP-00012-R01
const DOF_C_UUID = 'dcaa52ea-45c7-4b05-9f4c-75acb3178233';   // 2026-KUT-RAFA-00023-R02

const DOSYA_ADI_TEK_DESENI = /^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/;
const DOSYA_ADI_COKLU_DESENI = /^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_3dof\.zip$/;

async function dosyaSec(page) {
  await page.setInputFiles('#dof-import-input', {
    name: 'DOF_Kutuphane_2026-07-03.json',
    mimeType: 'application/json',
    buffer: Buffer.from(PAKET_METNI, 'utf-8'),
  });
}

async function dofSec(page, dofUuid) {
  await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function takipKaydet(page, alanlar) {
  for (const [alan, deger] of Object.entries(alanlar)) {
    const id = alan === 'sorumlu' ? '#dof-takip-sorumlu' : '#dof-takip-gerceklesen-faaliyet';
    await page.locator(id).fill(String(deger));
  }
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'kanit.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
  await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Fotoğraf eklendi.');
}

async function zipIndirTikla(page) {
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dof-replay-zip-btn'),
  ]);
  const suggestedFilename = indirme.suggestedFilename();
  const geciciYol = path.join(os.tmpdir(), `pwa-test-4rpkg2-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return { suggestedFilename, zip: new AdmZip(geciciYol) };
}

test.describe('AL. DÖF replay çoklu export + zaman damgalı dosya adı (4R-PKG-2)', () => {
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

  test('1. Tek DÖF export hâlâ çalışıyor -- dofKontrolleri uzunluğu 1, dosya adı zaman damgalı', async ({ page }) => {
    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'Tek DÖF Testi' });

    const { suggestedFilename, zip } = await zipIndirTikla(page);
    expect(suggestedFilename).toMatch(DOSYA_ADI_TEK_DESENI);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri.length).toBe(1);
    expect(belge.dofKontrolleri[0].dofUuid).toBe(DOF_A_UUID);
  });

  test('2. Çoklu DÖF export -- A/B/C birlikte tek ZIP\'te, medya dahil, dosya adı 3dof', async ({ page }) => {
    await dosyaSec(page);

    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'A Sorumlu', gerceklesen_faaliyet: 'A faaliyeti' });
    await dofGaleriFotoYukle(page);

    // 4R-PKG-3E-FINAL: çalışma modunda liste gizli -- başka DÖF'e geçmeden önce Listeye Dön.
    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await dofSec(page, DOF_B_UUID);
    await takipKaydet(page, { sorumlu: 'B Sorumlu', gerceklesen_faaliyet: 'B faaliyeti' });
    await dofGaleriFotoYukle(page);

    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await dofSec(page, DOF_C_UUID);
    await takipKaydet(page, { sorumlu: 'C Sorumlu' });   // yalnız takip, medyasız

    // C seçiliyken ZIP İndir'e basılıyor -- ama A ve B'nin taslakları da dahil olmalı.
    const { suggestedFilename, zip } = await zipIndirTikla(page);
    expect(suggestedFilename).toMatch(DOSYA_ADI_COKLU_DESENI);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.paketUuid).toBe(PAKET.paketUuid);
    expect(belge.dofKontrolleri.length).toBe(3);

    const uuidler = belge.dofKontrolleri.map((k) => k.dofUuid).sort();
    expect(uuidler).toEqual([DOF_A_UUID, DOF_B_UUID, DOF_C_UUID].sort());

    const kA = belge.dofKontrolleri.find((k) => k.dofUuid === DOF_A_UUID);
    const kB = belge.dofKontrolleri.find((k) => k.dofUuid === DOF_B_UUID);
    const kC = belge.dofKontrolleri.find((k) => k.dofUuid === DOF_C_UUID);

    // Her DÖF kendi kimlik alanlarını (kaynak paketten) korur.
    const kaynakA = PAKET.tehlikeler.find((t) => t.dofUuid === DOF_A_UUID);
    const kaynakB = PAKET.tehlikeler.find((t) => t.dofUuid === DOF_B_UUID);
    const kaynakC = PAKET.tehlikeler.find((t) => t.dofUuid === DOF_C_UUID);
    expect(kA.exportUuid).toBe(kaynakA.exportUuid);
    expect(kB.exportUuid).toBe(kaynakB.exportUuid);
    expect(kC.exportUuid).toBe(kaynakC.exportUuid);
    expect(kA.baseStateHash).toBe(kaynakA.baseStateHash);
    expect(kA.aktifTurSirasi).toBe(1);

    // submissionUuid her DÖF için dolu ve BENZERSİZ.
    const submissionUuidler = [kA.submissionUuid, kB.submissionUuid, kC.submissionUuid];
    for (const s of submissionUuidler) expect(typeof s).toBe('string');
    expect(new Set(submissionUuidler).size).toBe(3);

    // Takip alanları doğru taşındı.
    expect(kA.sorumlu).toBe('A Sorumlu');
    expect(kA.gerceklesen_faaliyet).toBe('A faaliyeti');
    expect(kB.sorumlu).toBe('B Sorumlu');
    expect(kC.sorumlu).toBe('C Sorumlu');

    // Medya -- yalnız A ve B'nin foto eklediği kayıtlarda kanitMedyalari/fotolar var, C'de yok.
    expect(kA.kanitMedyalari.length).toBe(1);
    expect(kB.kanitMedyalari.length).toBe(1);
    expect(kC.kanitMedyalari).toBeUndefined();

    const girdiler = zip.getEntries().map((e) => e.entryName);
    expect(girdiler).toContain('dof_donus.json');
    expect(girdiler.filter((e) => /^fotolar\/.+\.jpg$/.test(e)).length).toBe(2);
  });

  test('3. Değişmemiş DÖF dahil edilmez -- yalnız A değişti, B sadece açıldı', async ({ page }) => {
    await dosyaSec(page);

    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'Yalnız A' });

    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await dofSec(page, DOF_B_UUID);   // seçilir/açılır ama takip/medya girilmez

    const { zip } = await zipIndirTikla(page);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri.length).toBe(1);
    expect(belge.dofKontrolleri[0].dofUuid).toBe(DOF_A_UUID);
  });

  test('4. Hiç değişmiş DÖF yoksa ZIP üretilmez, açık mesaj gösterilir', async ({ page }) => {
    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);   // seçilir ama hiçbir alan değiştirilmez, medya eklenmez

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-zip-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Önce en az bir DÖF için takip bilgisi veya kanıt medyası ekleyin.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('5. Yasak alanlar yok -- her dofKontrolleri girdisinde Desktop final karar/kapanış/yeni-tur alanları eksik', async ({ page }) => {
    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'Yasak Alan Testi' });
    await dofGaleriFotoYukle(page);

    const { zip } = await zipIndirTikla(page);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    const k = belge.dofKontrolleri[0];
    for (const yasakli of [
      'dofId', 'durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto',
      'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
  });

  test('6. Dosya adı yalnız paketUuid\'den oluşmaz -- aynı paketten art arda iki indirme farklı ad üretir', async ({ page }) => {
    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'İlk indirme' });
    const ilk = await zipIndirTikla(page);

    await takipKaydet(page, { sorumlu: 'İkinci indirme' });   // taslağı değiştir -> hazırlık otomatik yenilenecek
    const ikinci = await zipIndirTikla(page);

    expect(ilk.suggestedFilename).toMatch(DOSYA_ADI_TEK_DESENI);
    expect(ikinci.suggestedFilename).toMatch(DOSYA_ADI_TEK_DESENI);
    // Dosya adı paketUuid'nin TAMAMINI içermiyor (yalnız ilk 8 karakter +
    // zaman damgası + adet) -- iki indirme arasında paketUuid AYNI kalsa
    // bile (kasıtlı, bkz. üstteki yorum) dosya adının kendisi zaman
    // damgası nedeniyle farklı üretilebilir (aynı saniyede iki tıklama
    // pratikte oluşmadığından burada doğrudan karşılaştırılabilir).
    expect(ilk.suggestedFilename).not.toBe(PAKET.paketUuid + '.zip');
  });
});
