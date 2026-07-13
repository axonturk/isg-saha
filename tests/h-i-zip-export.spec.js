// PWA Commit 2 / Bölüm H+I -- normal ZIP export sözleşme ve güvenlik
// karakterizasyonu. Bu, Commit 2'nin EN KRİTİK testidir.
//
// Test tarafında ZIP açmak için `adm-zip` (yalnız devDependency, production
// PWA'ya HİÇ bundle edilmez/HTML'e eklenmez) kullanılır.
//
// Gerçek alanlar app.js:1612 `_denetimPaketiOlustur` (committed 852764c
// baseline, WIP DEĞİL) satırlarından çıkarıldı -- tahmin edilmedi:
//   paket.denetim: {id, baslangic, isyeri, tur, binaProfili, kurumId,
//     kurumAdi, birimId, birimAdi, kat, oda, odaNo, sorumlu}   -- odaId YOK
//   paket.tespitler[]: {alanTipi, konumKodu, not, hayatiRisk, fotografsiz,
//     sesNotlari, checklist, zaman, fotolar}
//   paket.manifest: {dosyalar, fotoSayisi, sesDosyalari, sesSayisi}
//   -- dofKontrolleri anahtarı YOK (WIP bu worktree'ye taşınmadı).
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

async function _tamDenetimHazirla(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 2 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-kat-chips .chip', { hasText: '1.Kat' }).click();
  const alanChip = page.locator('#kat-alan-hizli-chips .chip').first();
  const alanTipiMetni = (await alanChip.getAttribute('data-alan')) || (await alanChip.textContent());
  await alanChip.click();
  const odaNo = '305';
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

  // Yazılı not + fotoğraf + ses birlikte içeren bir bulgu.
  await page.locator('#finding-manual').fill('ZIP export test bulgusu -- yazılı not.');

  await page.locator('button[onclick="openOCR(\'kanit\')"]').click();
  await page.waitForFunction(() => {
    const v = document.getElementById('video');
    return v && v.videoWidth > 0;
  });
  await page.click('button[onclick="capturePhoto()"]');
  await expect(page.locator('#foto-onizleme img')).toHaveCount(1);

  const sesButonu = page.locator('#btn-ses-kaydi');
  await sesButonu.click();
  await page.waitForTimeout(500);
  await sesButonu.click();
  await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);

  await page.locator('button[onclick="saveFinding()"]').click();
  await expect(page.locator('#findings-list')).toContainText('ZIP export test bulgusu');

  const denetimler = await storeTumu(page, 'denetimler');
  const kurumlar = await storeTumu(page, 'kurumlar');
  const birimler = await storeTumu(page, 'birimler');
  const denetim = denetimler.find((d) => d.oda && d.odaNo === odaNo);
  const kurum = kurumlar.find((k) => k.ad === kurumAdi);
  const birim = birimler.find((b) => b.ad === birimAdi);
  return { denetim, kurum, birim, alanTipiMetni, odaNo };
}

async function _zipIndir(page) {
  // "Yedekle (ZIP)" butonu YALNIZ Kurulum ekranında var -- Denetim
  // ekranından gerçek geri tuşu akışıyla dönülür: inceleme->kat-alan->kurulum
  // (history yığını bu sırayla açılır, bkz. app.js startInspection yorumu).
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
  for (let i = 0; i < adet; i++) {
    await kutular.nth(i).check();
  }
  await expect(page.locator('.yedek-birim-cb:checked')).toHaveCount(adet);

  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-action-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return geciciYol;
}

test.describe('H+I. Normal ZIP export -- sözleşme ve güvenlik', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['camera', 'microphone']);
    await sahteKameraKur(page);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
  });

  test('ZIP entry yapisi, denetimler.json semasi ve embedded dofKontrolleri NEGATIF assertion', async ({ page }) => {
    const { denetim, kurum, birim, alanTipiMetni, odaNo } = await _tamDenetimHazirla(page);
    const zipYolu = await _zipIndir(page);

    let zip;
    try {
      zip = new AdmZip(zipYolu);
      const girdiler = zip.getEntries();

      // --- I. Yapısal/güvenlik kontrolleri ---
      expect(girdiler.length).toBeGreaterThan(0);
      const adlar = girdiler.map((e) => e.entryName);
      expect(new Set(adlar).size).toBe(adlar.length);   // aynı entry adı iki kez YOK
      for (const ad of adlar) {
        expect(ad.startsWith('/')).toBe(false);          // mutlak yol DEĞİL
        expect(/^[a-zA-Z]:/.test(ad)).toBe(false);        // sürücü harfi DEĞİL
        expect(ad.includes('..')).toBe(false);            // path traversal YOK
      }

      // --- H. denetimler.json sözleşmesi ---
      const jsonGirdi = girdiler.find((e) => e.entryName === 'denetimler.json');
      expect(jsonGirdi).toBeTruthy();
      const hamMetin = jsonGirdi.getData().toString('utf-8');
      let paketler;
      expect(() => { paketler = JSON.parse(hamMetin); }).not.toThrow();   // gecerli JSON + UTF-8 okunabilir
      expect(Array.isArray(paketler)).toBe(true);
      expect(paketler.length).toBe(1);
      const paket = paketler[0];

      expect(paket.denetim).toMatchObject({
        id: denetim.id,
        isyeri: birim.ad,
        tur: 'saha',
        binaProfili: birim.ad,
        kurumId: kurum.id,
        kurumAdi: kurum.ad,
        birimId: birim.id,
        birimAdi: birim.ad,
        kat: '1.Kat',
        odaNo: odaNo,
      });
      // Committed baseline: `odaId` alanı YOK (yalnız WIP'te eklenmişti).
      expect(paket.denetim).not.toHaveProperty('odaId');

      expect(Array.isArray(paket.tespitler)).toBe(true);
      expect(paket.tespitler.length).toBe(1);
      const tespit = paket.tespitler[0];
      expect(tespit.alanTipi).toBe(alanTipiMetni.trim());
      expect(tespit.konumKodu).toBe(`${birim.ad}/1.Kat/${denetim.oda}`);
      expect(tespit.not).toBe('ZIP export test bulgusu -- yazılı not.');
      expect(tespit.hayatiRisk).toBe(false);
      expect(tespit.fotografsiz).toBe(false);
      expect(tespit.checklist).toBeNull();
      expect(Array.isArray(tespit.fotolar)).toBe(true);
      expect(tespit.fotolar.length).toBe(1);
      expect(Array.isArray(tespit.sesNotlari)).toBe(true);
      expect(tespit.sesNotlari.length).toBe(1);

      expect(paket.manifest).toMatchObject({
        fotoSayisi: 1,
        sesSayisi: 1,
      });
      expect(paket.manifest.dosyalar).toContain(tespit.fotolar[0]);
      expect(paket.manifest.sesDosyalari).toContain(tespit.sesNotlari[0]);

      // --- Medya yolları ZIP entry'leriyle EŞLEŞİYOR ---
      expect(adlar).toContain(`fotolar/${tespit.fotolar[0]}`);
      expect(adlar).toContain(`sesler/${tespit.sesNotlari[0]}`);
      const fotoGirdi = girdiler.find((e) => e.entryName === `fotolar/${tespit.fotolar[0]}`);
      const sesGirdi = girdiler.find((e) => e.entryName === `sesler/${tespit.sesNotlari[0]}`);
      expect(fotoGirdi.getData().length).toBeGreaterThan(0);
      expect(sesGirdi.getData().length).toBeGreaterThan(0);

      // --- EN KRİTİK NEGATİF ASSERTION ---
      // denetimler.json içinde embedded dofKontrolleri alanı bulunmamalıdır
      // (WIP'in ürettiği eski/yanlış format bu temiz branch'e HİÇ taşınmadı).
      expect(paket).not.toHaveProperty('dofKontrolleri');
      // ZIP kökünde veya başka bir JSON dosyasında yanlış DÖF replay verisi yok.
      const digerJsonlar = girdiler.filter((e) => e.entryName.endsWith('.json') && e.entryName !== 'denetimler.json');
      expect(digerJsonlar).toEqual([]);
      expect(hamMetin).not.toContain('dofKontrolleri');
      expect(hamMetin).not.toContain('paketUuid');   // replay-v2 zarfı da YOK
      expect(adlar.some((a) => /dof/i.test(a))).toBe(false);
    } finally {
      fs.rmSync(zipYolu, { force: true });   // gecici indirme dosyasi temizlenir
    }
  });

  test('bos denetim (medyasiz, yalniz yazili not) da gecerli ZIP uretir', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('Birim');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.locator('#kat-alan-oda-no').fill('1');
    await page.click('button[onclick="startInspection()"]');
    await page.locator('#finding-manual').fill('Medyasız bulgu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const zipYolu = await _zipIndir(page);
    try {
      const zip = new AdmZip(zipYolu);
      const girdiler = zip.getEntries();
      const jsonGirdi = girdiler.find((e) => e.entryName === 'denetimler.json');
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      expect(paketler[0].tespitler[0].fotografsiz).toBe(true);
      expect(paketler[0].tespitler[0].fotolar).toEqual([]);
      expect(paketler[0].tespitler[0].sesNotlari).toEqual([]);
      // Medya klasörü hiç oluşmamış -- yalnız denetimler.json entry'si var.
      expect(girdiler.length).toBe(1);
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });
});
