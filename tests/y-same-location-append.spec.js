// PWA Commit 4M -- aynı konuma geri dönüşte yeni denetim açmak yerine
// mevcut denetime devam etme. Eşleşme anahtarı: kurumId + birimId + odaId
// (oda zaten kat/alanTipi/no ile tekilleştirilmiş durumda, bkz. startInspection)
// + tur (denetim türü). Production değişikliği yalnız app.js::startInspection
// + küçük bir durum metni (index.html #denetim-devam-durum) -- DÖF, Service
// Worker, galeri/kamera/ses kayıt sözleşmesi, normal ZIP formatı DEĞİŞMEDİ.
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

const KUCUK_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function kucukPngBuffer() {
  return Buffer.from(KUCUK_PNG_B64, 'base64');
}

async function _kurumBirimHazirla(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

async function _konumaGir(page, { odaNo = '101', tur = null } = {}) {
  if (tur) await page.selectOption('#setup-tur', tur);   // #setup-tur yalnız #screen-setup üzerinde
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
}

async function _geriKurulumaDon(page) {
  await page.click('button[onclick="goToSetup()"]');
  await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
  await page.click('button[onclick="katAlanGeri()"]');
  await expect(page.locator('#screen-setup')).toHaveClass(/active/);
}

async function _zipIndir(page) {
  if (await page.locator('#screen-inspection').evaluate((el) => el.classList.contains('active'))) {
    await page.click('button[onclick="goToSetup()"]');
    await page.locator('#screen-kat-alan.active, #screen-setup.active').first().waitFor();
  }
  if (await page.locator('#screen-kat-alan').evaluate((el) => el.classList.contains('active'))) {
    await page.click('button[onclick="katAlanGeri()"]');
  }
  await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  await page.click('button[onclick="yedekModalAc()"]');
  await expect(page.locator('#modal-form')).toBeVisible();
  const kutular = page.locator('.yedek-birim-cb');
  await kutular.first().waitFor({ state: 'attached' });
  const adet = await kutular.count();
  for (let i = 0; i < adet; i++) await kutular.nth(i).check();
  await expect(page.locator('.yedek-birim-cb:checked')).toHaveCount(adet);
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-action-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-samelocation-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return geciciYol;
}

test.describe('Y. Aynı konuma geri dönüş / mevcut denetime ekleme', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await sahteKameraKur(page);
    await sahteMikrofonKur(page);
  });

  test('A. Aynı konuma ikinci giriş -- tek denetim, iki bulgu', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');
    await page.locator('#finding-manual').fill('İkinci bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(2);
    expect(bulgular.every((b) => b.denetimId === denetimler[0].id)).toBe(true);
  });

  test('B. Farklı oda yeni denetim oluşturur', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, { odaNo: '101' });
    await page.locator('#finding-manual').fill('Oda 101 bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page, { odaNo: '202' });
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
    await page.locator('#finding-manual').fill('Oda 202 bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    expect(new Set(denetimler.map((d) => d.odaId)).size).toBe(2);
  });

  test('C. Farklı denetim türü yeni denetim oluşturur', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, { odaNo: '101', tur: 'saha' });
    await page.locator('#finding-manual').fill('Saha denetimi bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page, { odaNo: '101', tur: 'risk' });
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
    await page.locator('#finding-manual').fill('Risk analizi bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    expect(new Set(denetimler.map((d) => d.tur))).toEqual(new Set(['saha', 'risk']));
    // Aynı oda -- odaId PAYLAŞILIR, oda kaydı tekrar oluşturulmaz.
    expect(denetimler[0].odaId).toBe(denetimler[1].odaId);
  });

  test('D. Kamera fotoğrafı mevcut denetime eklenir', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    const kameraliBulgu = bulgular.find((b) => b.fotolar && b.fotolar.length > 0);
    expect(kameraliBulgu).toBeTruthy();
    expect(kameraliBulgu.denetimId).toBe(denetimler[0].id);
  });

  test('E. Galeri fotoğrafı mevcut denetime eklenir', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await page.setInputFiles('#galeri-foto-input', { name: 'galeri.png', mimeType: 'image/png', buffer: kucukPngBuffer() });
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    const galerliBulgu = bulgular.find((b) => b.fotolar && b.fotolar.length > 0);
    expect(galerliBulgu).toBeTruthy();
    expect(galerliBulgu.denetimId).toBe(denetimler[0].id);
  });

  test('F. Ses/not mevcut denetime eklenir', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İkinci ziyaret -- yazılı not ve ses.');
    const sesButonu = page.locator('#btn-ses-kaydi');
    await sesButonu.click();
    await page.waitForTimeout(500);
    await sesButonu.click();
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    const sesliBulgu = bulgular.find((b) => b.sesler && b.sesler.length > 0);
    expect(sesliBulgu).toBeTruthy();
    expect(sesliBulgu.denetimId).toBe(denetimler[0].id);
    expect(sesliBulgu.metin).toBe('İkinci ziyaret -- yazılı not ve ses.');
  });

  test('G. Normal ZIP aynı denetime eklenen bulguları taşır', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await page.locator('#finding-manual').fill('Kamera bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await page.setInputFiles('#galeri-foto-input', { name: 'galeri.png', mimeType: 'image/png', buffer: kucukPngBuffer() });
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
    await page.locator('#finding-manual').fill('Galeri bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const zipYolu = await _zipIndir(page);
    try {
      const zip = new AdmZip(zipYolu);
      const girdiler = zip.getEntries();
      const adlar = girdiler.map((e) => e.entryName);
      const jsonGirdi = girdiler.find((e) => e.entryName === 'denetimler.json');
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      expect(paketler.length).toBe(1);
      expect(paketler[0].tespitler.length).toBe(2);

      const tumFotoAdlari = paketler[0].tespitler.flatMap((t) => t.fotolar);
      expect(tumFotoAdlari.length).toBe(2);
      expect(new Set(tumFotoAdlari).size).toBe(2);   // benzersiz path'ler
      for (const ad of tumFotoAdlari) {
        expect(adlar).toContain(`fotolar/${ad}`);
      }
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });

  test('H. Geçmiş kayıtlar listesi -- aynı konuma iki giriş duplicate kart üretmez', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();
    const denetimlerIlk = await storeTumu(page, 'denetimler');

    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İkinci bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    await _geriKurulumaDon(page);
    await expect(page.locator(`[data-swipe-id="${denetimlerIlk[0].id}"]`)).toHaveCount(1);
    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
  });

  test('I. DÖF regresyonu -- import/liste/takip/replay ZIP etkilenmez', async ({ page }) => {
    const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'Y-1' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'y_paketi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
    });
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await page.locator('.dof-liste-karti').first().click();
    await page.locator('#dof-takip-etkinlik-kontrol-tarihi').fill('2026-09-05');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    const geciciYol = path.join(os.tmpdir(), `pwa-test-y-dof-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(geciciYol);
    try {
      const zip = new AdmZip(geciciYol);
      expect(zip.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    } finally {
      fs.rmSync(geciciYol, { force: true });
    }
  });

  test('J. Service Worker / offline smoke -- SW registration ile aynı-konum davranışı etkilenmez', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('./sw.js');
      return !!reg;
    }, { timeout: 5000 });

    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();
    await _geriKurulumaDon(page);
    await _konumaGir(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
  });

  test('K. Normal ana akış regresyonu -- yeni denetim/bulgu/foto/galeri/ses akışları çalışır', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');

    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await page.setInputFiles('#galeri-foto-input', { name: 'galeri.png', mimeType: 'image/png', buffer: kucukPngBuffer() });
    await expect(page.locator('#foto-onizleme img')).toHaveCount(2);
    const sesButonu = page.locator('#btn-ses-kaydi');
    await sesButonu.click();
    await page.waitForTimeout(500);
    await sesButonu.click();
    await page.locator('#finding-manual').fill('Normal akış regresyon bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();
    await expect(page.locator('#findings-list')).toContainText('Normal akış regresyon bulgusu.');
  });
});
