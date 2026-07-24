// PWA 4R-PKG-1 -- kullanıcının gerçek Desktop DÖF paketiyle
// (tests/fixtures/DOF_Kutuphane_2026-07-03.json, Desktop export'undan
// birebir, 59 kayıt) import -> liste/detay -> takip -> kanıt medyası
// (foto+ses) -> replay ZIP zincirini gerçek UI üzerinden doğrular.
// Gerçek servisler (dofPaketiIceriAktar, dofTakipTaslagiGuncelle,
// dofKanitMedyasiEkle, dofReplayHazirlikHazirla, dofReplayZipOlustur)
// DEĞİŞTİRİLMEDİ -- bu dosya yalnız gerçek dosya/UI/IndexedDB
// etkileşimini test eder (S/V/AH/AI dosyalarıyla aynı desen).
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { sahteMikrofonKur } = require('./media-mocks');

test.describe.configure({ mode: 'serial' });

const PAKET_YOLU = path.join(__dirname, 'fixtures', 'DOF_Kutuphane_2026-07-03.json');
const PAKET_METNI = fs.readFileSync(PAKET_YOLU, 'utf-8');
const PAKET = JSON.parse(PAKET_METNI);

// Görev promptunda önerilen iki aday, gerçek pakette dofId 2 ve dofId 26
// olarak doğrulandı (read-only inceleme, bu dosyanın kod incelemesi
// bölümünde).
const DOF_A_UUID = '83f68019-f0ed-46ac-a5ed-0101a7117975';   // 2026-KUT-ASAN-00003-R02
const DOF_B_UUID = 'a71621ad-7c60-4073-a7fe-5a40f4fb0723';   // 2026-KUT-KOMP-00012-R01

const dofAKaynak = PAKET.tehlikeler.find((t) => t.dofUuid === DOF_A_UUID);
const dofBKaynak = PAKET.tehlikeler.find((t) => t.dofUuid === DOF_B_UUID);

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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

const _DOF_TAKIP_SELECT_ALANLARI = new Set(['yeni_o', 'yeni_f', 'yeni_s']);

async function takipKaydet(page, alanlar) {
  const haritalar = {
    sorumlu: '#dof-takip-sorumlu',
    gerceklesen_faaliyet: '#dof-takip-gerceklesen-faaliyet',
    yeni_o: '#dof-takip-yeni-o',
    yeni_f: '#dof-takip-yeni-f',
    yeni_s: '#dof-takip-yeni-s',
  };
  for (const [alan, deger] of Object.entries(alanlar)) {
    const locator = page.locator(haritalar[alan]);
    if (_DOF_TAKIP_SELECT_ALANLARI.has(alan)) {
      await locator.selectOption(String(deger));
    } else {
      await locator.fill(String(deger));
    }
  }
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'kanit.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
  await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Fotoğraf eklendi.');
}

async function dofSesNotuEkle(page) {
  const sesBtn = page.locator('#dof-kanit-ses-btn');
  await expect(sesBtn).toContainText('Ses Notu');
  await sesBtn.click();
  await expect(sesBtn).toContainText('Durdur');
  await page.waitForTimeout(600);
  await sesBtn.click();
  await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Ses notu eklendi.');
}

async function zipIndirTikla(page) {
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dof-replay-zip-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-4rpkg1-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return new AdmZip(geciciYol);
}

test.describe('AK. Gerçek kullanıcı DÖF paketi (2026-07-21 Desktop export) ile import/replay', () => {
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

  test('sanity: fixture dosyası bozulmadan kopyalandı, iki aday kaynak kayıtta bulundu', () => {
    expect(PAKET.tur).toBe('isg_dof_paketi');
    expect(PAKET.kaynak).toBe('isg_denetim_masaustu');
    expect(PAKET.tehlikeler.length).toBe(59);
    expect(dofAKaynak).toBeTruthy();
    expect(dofBKaynak).toBeTruthy();
    expect(dofAKaynak.bulguKodu).toBe('2026-KUT-ASAN-00003');
    expect(dofBKaynak.bulguKodu).toBe('2026-KUT-KOMP-00012');
  });

  test('A. Gerçek dosya seçici ile import -- 59 kayıt, liste dolu, iki aday kart DOM\'da', async ({ page }) => {
    await dosyaSec(page);
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');
    await expect(page.locator('#dof-import-toplam')).toHaveText('59');
    await expect(page.locator('#dof-import-eklenen')).toHaveText('59');

    await expect(page.locator('.dof-liste-karti')).toHaveCount(59);
    await expect(page.locator(`.dof-liste-karti[data-dof-id="${DOF_A_UUID}"]`)).toBeVisible();
    await expect(page.locator(`.dof-liste-karti[data-dof-id="${DOF_B_UUID}"]`)).toBeVisible();
  });

  test('B. Aynı dosya ikinci kez seçilirse duplicate oluşmaz -- "zaten içe aktarılmış"', async ({ page }) => {
    await dosyaSec(page);
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');

    await dosyaSec(page);
    await expect(page.locator('#dof-import-durum')).toHaveText('Paket zaten içe aktarılmış');
    await expect(page.locator('#dof-import-degismeyen')).toHaveText('59');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(59);
  });

  test('C. Uçtan uca tek DÖF akışı -- takip + galeri foto + ses notu + replay ZIP (gerçek UI)', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);

    // Detay salt-okunur alanlar kaynak paketle birebir eşleşiyor mu?
    // (#dof-detay-kart bulguKodu göstermez -- yalnız liste kartı gösterir,
    // bkz. app.js _dofDetayGoster/_dofListeKartHtml; bu yüzden detayda
    // Tehlike Tanımı/R Değeri, listede bulguKodu doğrulanıyor.)
    await expect(page.locator(`.dof-liste-karti[data-dof-id="${DOF_A_UUID}"]`)).toContainText(dofAKaynak.bulguKodu);
    await expect(page.locator('#dof-detay-kart')).toContainText(dofAKaynak.tehlikeTanimi);
    await expect(page.locator('#dof-detay-kart')).toContainText(String(dofAKaynak.r));

    await takipKaydet(page, {
      sorumlu: 'Test Sorumlusu',
      gerceklesen_faaliyet: 'Korkuluk ve topuk levhası monte edildi',
      yeni_o: 1, yeni_f: 1, yeni_s: 7,
    });

    await expect(page.locator('#dof-kanit-medya-kart')).toBeVisible();
    await dofGaleriFotoYukle(page);
    await dofSesNotuEkle(page);
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);
    await expect(page.locator('#dof-kanit-medya-liste audio')).toHaveCount(1);

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    const zip = await zipIndirTikla(page);
    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');

    const girdiler = zip.getEntries().map((e) => e.entryName).sort();
    expect(girdiler).toContain('dof_donus.json');
    expect(girdiler.some((e) => /^fotolar\/.+\.jpg$/.test(e))).toBe(true);
    expect(girdiler.some((e) => /^sesler\/.+\.webm$/.test(e))).toBe(true);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.paketUuid).toBe(PAKET.paketUuid);
    const k = belge.dofKontrolleri[0];

    // Kimlik alanları kaynak kayıtla birebir aynı.
    expect(k.dofUuid).toBe(DOF_A_UUID);
    expect(k.exportUuid).toBe(dofAKaynak.exportUuid);
    expect(k.baseStateHash).toBe(dofAKaynak.baseStateHash);
    expect(k.aktifTurSirasi).toBe(1);
    expect(typeof k.submissionUuid).toBe('string');
    expect(k.submissionUuid.length).toBeGreaterThan(0);

    // İzinli takip alanları doğru taşınmış.
    expect(k.sorumlu).toBe('Test Sorumlusu');
    expect(k.gerceklesen_faaliyet).toBe('Korkuluk ve topuk levhası monte edildi');
    expect(k.yeni_o).toBe(1);
    expect(k.yeni_f).toBe(1);
    expect(k.yeni_s).toBe(7);

    // Kanıt medyası audit metadata'sı mevcut ve foto+ses'i kapsıyor.
    expect(Array.isArray(k.kanitMedyalari)).toBe(true);
    expect(k.kanitMedyalari.length).toBe(2);
    expect(k.kanitMedyalari.map((m) => m.mediaType).sort()).toEqual(['audio', 'photo']);

    // Desktop kapanış/yeni-tur alanları YOK -- PWA bu yetkilere sahip değil.
    for (const yasakli of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto', 'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici', 'dofId']) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
  });

  test('D. Aynı taslakta ikinci hazırlık idempotent -- aynı submissionUuid, "zaten güncel"', async ({ page }) => {
    await dosyaSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'Test Sorumlusu' });

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const ilkKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), DOF_A_UUID);

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı zaten güncel.');
    const ikinciKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), DOF_A_UUID);
    expect(ikinciKayit.replayHazirlik).toEqual(ilkKayit.replayHazirlik);
  });

  test('E. paketUuid anomali kontrolü -- iki FARKLI DÖF\'ün replay ZIP\'i aynı paketUuid, farklı dofUuid/exportUuid/submissionUuid taşır (import-batch kimliği, bug DEĞİL)', async ({ page }) => {
    await dosyaSec(page);

    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'A Sorumlusu' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const zipA = await zipIndirTikla(page);
    const belgeA = JSON.parse(zipA.readAsText('dof_donus.json', 'utf8'));

    await dofSec(page, DOF_B_UUID);
    await takipKaydet(page, { sorumlu: 'B Sorumlusu' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const zipB = await zipIndirTikla(page);
    const belgeB = JSON.parse(zipB.readAsText('dof_donus.json', 'utf8'));

    // paketUuid = içe aktarılan PAKETİN kimliği (app.js _dofYerelKayitOlustur
    // -> her kayda import anında yazılır, replay export'ta ortakPaketUuid
    // olarak GERİ okunur) -- kasıtlı olarak İKİ farklı DÖF'te de AYNI.
    expect(belgeA.paketUuid).toBe(PAKET.paketUuid);
    expect(belgeB.paketUuid).toBe(PAKET.paketUuid);
    expect(belgeA.paketUuid).toBe(belgeB.paketUuid);

    // Ama per-DÖF/per-replay kimlikler BİRBİRİNDEN farklı -- gerçek
    // benzersizlik burada taşınıyor, paketUuid'de değil.
    const kA = belgeA.dofKontrolleri[0];
    const kB = belgeB.dofKontrolleri[0];
    expect(kA.dofUuid).not.toBe(kB.dofUuid);
    expect(kA.exportUuid).not.toBe(kB.exportUuid);
    expect(kA.submissionUuid).not.toBe(kB.submissionUuid);
    expect(kA.dofUuid).toBe(DOF_A_UUID);
    expect(kB.dofUuid).toBe(DOF_B_UUID);
  });
});
