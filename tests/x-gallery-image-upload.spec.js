// PWA Commit 4L -- galeriden resim yükleme. Mevcut kamera ile fotoğraf çekme
// akışının yanına, cihaz galerisi/dosya seçicisinden görsel seçme eklendi.
// Production tarafı yalnız `index.html` (input[type=file] + buton) ve
// `app.js::_galeriDosyaSecildi` -- mevcut `fotoAlVeSikistir`/`compressImage`/
// `aktifFotolarTaslak` hattı DEĞİŞTİRİLMEDİ, yalnız yeni bir kaynaktan
// (dosya seçici) beslendi. Bu yüzden galeri fotoğrafı kamera fotoğrafından
// kayıt/ZIP tarafında AYRIŞMAZ (kasıtlı).
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur } = require('./media-mocks');

// 1x1 şeffaf PNG (geçerli, minimal).
const KUCUK_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function kucukPngBuffer() {
  return Buffer.from(KUCUK_PNG_B64, 'base64');
}

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
}

async function _galeriYukle(page, { name = 'galeri.png', mimeType = 'image/png', buffer = kucukPngBuffer() } = {}) {
  await page.setInputFiles('#galeri-foto-input', { name, mimeType, buffer });
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
  const geciciYol = path.join(os.tmpdir(), `pwa-test-gallery-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return geciciYol;
}

test.describe('X. Galeriden resim yükleme', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await sahteKameraKur(page);
  });

  test('A. UI görünür -- Resim Yükle seçeneği ve kamera butonu birlikte mevcut', async ({ page }) => {
    await _denetimBaslat(page);
    await expect(page.locator('button', { hasText: 'Resim Yükle' })).toBeVisible();
    await expect(page.locator('#galeri-foto-input')).toBeAttached();
    await expect(page.locator('button[onclick="openOCR(\'kanit\')"]')).toBeVisible();
  });

  test('B. Geçerli görsel yükleme -- önizleme/sayaç güncellenir, IndexedDB\'ye bulgu ile birlikte yazılır', async ({ page }) => {
    await _denetimBaslat(page);
    await _galeriYukle(page);
    await expect(page.locator('#galeri-foto-durum')).toHaveText('Resim denetime eklendi.');
    await expect(page.locator('#foto-onizleme')).toContainText('1 fotoğraf hazır');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);

    await page.locator('button[onclick="saveFinding()"]').click();
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].fotolar.length).toBe(1);
    const foto = bulgular[0].fotolar[0];
    expect(foto.blob).toBeTruthy();
    expect(foto.boyut).toBeGreaterThan(0);
  });

  test('C. Kamera ve galeri birlikte -- iki fotoğraf da kayıtlı, birbirini ezmiyor', async ({ page }) => {
    await _denetimBaslat(page);

    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#foto-onizleme')).toContainText('1 fotoğraf hazır');

    await _galeriYukle(page);
    await expect(page.locator('#foto-onizleme')).toContainText('2 fotoğraf hazır');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(2);

    await page.locator('button[onclick="saveFinding()"]').click();
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].fotolar.length).toBe(2);
    for (const foto of bulgular[0].fotolar) {
      expect(foto.blob).toBeTruthy();
      expect(foto.boyut).toBeGreaterThan(0);
    }
  });

  test('D. Normal ZIP içinde galeri görseli -- fotolar/ altında, denetimler.json referansıyla eşleşir', async ({ page }) => {
    await _denetimBaslat(page);
    await page.locator('#finding-manual').fill('Galeri ZIP testi.');
    await _galeriYukle(page);
    await page.locator('button[onclick="saveFinding()"]').click();
    await expect(page.locator('#findings-list')).toContainText('Galeri ZIP testi');

    const zipYolu = await _zipIndir(page);
    try {
      const zip = new AdmZip(zipYolu);
      const girdiler = zip.getEntries();
      const adlar = girdiler.map((e) => e.entryName);
      const jsonGirdi = girdiler.find((e) => e.entryName === 'denetimler.json');
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      const tespit = paketler[0].tespitler[0];
      expect(tespit.fotografsiz).toBe(false);
      expect(tespit.fotolar.length).toBe(1);
      expect(adlar).toContain(`fotolar/${tespit.fotolar[0]}`);
      const fotoGirdi = girdiler.find((e) => e.entryName === `fotolar/${tespit.fotolar[0]}`);
      expect(fotoGirdi.getData().length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });

  test('E. Kamera ZIP regresyonu -- yalnız kamera fotoğrafıyla ZIP export eski davranışı korur', async ({ page }) => {
    await _denetimBaslat(page);
    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await page.locator('button[onclick="saveFinding()"]').click();
    await expect(page.locator('#findings-list')).toContainText('📷×1');

    const zipYolu = await _zipIndir(page);
    try {
      const zip = new AdmZip(zipYolu);
      const girdiler = zip.getEntries();
      const jsonGirdi = girdiler.find((e) => e.entryName === 'denetimler.json');
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      const tespit = paketler[0].tespitler[0];
      expect(tespit.fotolar.length).toBe(1);
      expect(girdiler.map((e) => e.entryName)).toContain(`fotolar/${tespit.fotolar[0]}`);
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });

  test('F. Geçersiz dosya reddi -- text/plain ve bozuk görsel bayt dizisi reddedilir, DB\'ye yazılmaz', async ({ page }) => {
    await _denetimBaslat(page);

    await _galeriYukle(page, { name: 'not.txt', mimeType: 'text/plain', buffer: Buffer.from('bu bir görsel değil') });
    await expect(page.locator('#galeri-foto-durum')).toHaveText('Yalnız görsel dosyası yüklenebilir.');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);

    await _galeriYukle(page, { name: 'bozuk.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('bu-gecerli-bir-jpeg-degil') });
    await expect(page.locator('#galeri-foto-durum')).toHaveText('Görsel okunamadı.');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);

    await page.locator('#finding-manual').fill('Sadece metin bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].fotolar.length).toBe(0);
  });

  test('G. Seçim iptali / boş input -- no-op, hata fırlamaz, mevcut liste değişmez', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await _denetimBaslat(page);
    await _galeriYukle(page);
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);

    await page.evaluate(() => {
      const input = document.getElementById('galeri-foto-input');
      input.value = '';
      input.dispatchEvent(new Event('change'));
    });
    await page.waitForTimeout(200);
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
    expect(pageErrors).toEqual([]);
  });

  test('H. DÖF replay regresyonu -- galeri görseli replay ZIP\'e sızmaz, dof_donus.json tek entry kalır', async ({ page }) => {
    const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'X-1' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'x_paketi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
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
    const geciciYol = path.join(os.tmpdir(), `pwa-test-dof-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(geciciYol);
    try {
      const zip = new AdmZip(geciciYol);
      const girdiler = zip.getEntries();
      expect(girdiler.map((e) => e.entryName)).toEqual(['dof_donus.json']);
      expect(girdiler.some((e) => /foto|jpg|png|jpeg/i.test(e.entryName) && e.entryName !== 'dof_donus.json')).toBe(false);
    } finally {
      fs.rmSync(geciciYol, { force: true });
    }
  });

  test('I. Offline/SW smoke -- SW registration sonrası galeri UI görünür ve çalışır', async ({ page }) => {
    await _denetimBaslat(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('./sw.js');
      return !!reg;
    }, { timeout: 5000 });
    await expect(page.locator('button', { hasText: 'Resim Yükle' })).toBeVisible();
    await _galeriYukle(page);
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
  });

  test('J. Normal saha akışı regresyonu -- kurulum/konum/bulgu/not/ses temel akışları etkilenmez', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('h2', { hasText: 'Yeni Denetim' })).toBeVisible();
    await _denetimBaslat(page);
    await page.locator('#finding-manual').fill('Yalnız yazılı bulgu -- regresyon.');
    await page.locator('button[onclick="saveFinding()"]').click();
    await expect(page.locator('#findings-list')).toContainText('Yalnız yazılı bulgu -- regresyon.');
  });
});
