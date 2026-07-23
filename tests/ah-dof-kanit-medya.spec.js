// PWA Commit 4P -- DÖF replay bağlamında yerel kanıt medyası (foto/ses)
// yakalama ("Kanıt Medyaları" kartı). Normal saha bulgu medyasından
// (aktifFotolarTaslak/aktifSeslerTaslak/sesRecorder/sesChunks) TAMAMEN
// AYRI state + ayrı IndexedDB store (`dofKanitlari`). Export/ZIP/
// dof_donus.json/hazırlık fingerprint'e dahil olma (M/N/Q/Y testleri) PWA
// Commit 4Q'da eklendi -- tam pozitif kapsam
// `tests/ai-dof-kanit-media-export.spec.js`'te.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

test.describe.configure({ mode: 'serial' });

async function dofSecVeKartBekle(page, index = 0) {
  await page.locator('.dof-liste-karti').nth(index).click();
  await expect(page.locator('#dof-kanit-medya-kart')).toBeVisible();
}

async function medyalarGetirDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofKanitMedyalariGetir(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

async function medyaEkleDene(page, dofUuid, medyaGirdisi) {
  return page.evaluate(async ({ u, m }) => {
    try {
      // Blob test tarafında (Node) üretilemez -- sayfa içinde küçük bir
      // gerçek Blob üretilir (foto/ses gövdesi bu testte önemli değil,
      // yalnız servis sözleşmesi test ediliyor).
      const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: m.mimeType || 'application/octet-stream' });
      const sonuc = await window._dofImport.dofKanitMedyasiEkle(u, { ...m, blob });
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, { u: dofUuid, m: medyaGirdisi });
}

async function medyaSilDene(page, dofUuid, localMediaUuid) {
  return page.evaluate(async ({ u, id }) => {
    try {
      await window._dofImport.dofKanitMedyasiSil(u, id);
      return { basarili: true };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, { u: dofUuid, id: localMediaUuid });
}

/** Gerçek dosya-yükleme akışı (`#dof-import-input`) -- `dofIceriAktarDene`
 * (salt-servis köprüsü) DEĞİL, çünkü bu dosyadaki testlerin çoğu
 * `.dof-liste-karti` UI etkileşimi gerektiriyor ve yalnız gerçek
 * `_dofPaketDosyaSecildi` yolu listeyi (`_dofListesiYukle`) yeniler. */
async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'B-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return paket.tehlikeler[0].dofUuid;
}

async function _denetimBaslat(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
}

/** 1x1 şeffaf PNG -- galeri yükleme testleri için gerçek, geçerli görsel. */
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
}

test.describe('AH. DÖF Kanıt Medyaları (foto/ses local capture)', () => {
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

  test('A. Kanonik DÖF seçilince Kanıt Medyaları kartı görünür', async ({ page }) => {
    await tekDofKur(page);
    await expect(page.locator('#dof-kanit-medya-kart')).toBeHidden();
    await dofSecVeKartBekle(page);
  });

  test('B. Legacy/WIP DÖF için kart gizlenir, servis KANONIK_DOF_DEGIL verir', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_ah1', dofId: 101, bulguKodu: 'B-1', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const getirSonucu = await medyalarGetirDene(page, 'dof_wip_ah1');
    expect(getirSonucu.basarili).toBe(false);
    expect(getirSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const ekleSonucu = await medyaEkleDene(page, 'dof_wip_ah1', { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    expect(ekleSonucu.basarili).toBe(false);
    expect(ekleSonucu.kod).toBe('KANONIK_DOF_DEGIL');
  });

  test('C. Galeri fotoğrafı DÖF\'e local kaydedilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);

    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Fotoğraf eklendi.');
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
    expect(medyalar.sonuc[0].mediaType).toBe('photo');
    expect(medyalar.sonuc[0].source).toBe('gallery');
    expect(medyalar.sonuc[0].dofUuid).toBe(dofUuid);
  });

  test('D. Kamera fotoğrafı DÖF\'e local kaydedilir (gerçek kamera akışı, sanal donanım)', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await sahteKameraKur(page);
    await page.goto('/index.html');   // addInitScript sonrası sayfayı tazele
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);

    await page.click('button[onclick="openOCR(\'dof-kanit\')"]');
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#camera-ui')).toBeHidden();

    await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Fotoğraf eklendi.');
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
    expect(medyalar.sonuc[0].source).toBe('camera');
    expect(medyalar.sonuc[0].blob).toBeTruthy();
  });

  test('E. Ses notu DÖF\'e local kaydedilir (gerçek MediaRecorder akışı, sanal donanım)', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);

    const sesBtn = page.locator('#dof-kanit-ses-btn');
    await expect(sesBtn).toContainText('Ses Notu');
    await sesBtn.click();
    await expect(sesBtn).toContainText('Durdur');
    await page.waitForTimeout(600);
    await sesBtn.click();
    await expect(sesBtn).toContainText('Ses Notu');

    await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Ses notu eklendi.');
    await expect(page.locator('#dof-kanit-medya-liste audio')).toHaveCount(1);

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
    expect(medyalar.sonuc[0].mediaType).toBe('audio');
    expect(medyalar.sonuc[0].source).toBe('audio');
    expect(medyalar.sonuc[0].durationMs).toBeGreaterThan(0);
  });

  test('F. DÖF A medyası DÖF B\'ye sızmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const [uuidA, uuidB] = paket.tehlikeler.map((t) => t.dofUuid);

    await medyaEkleDene(page, uuidA, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });

    const medyalarA = await medyalarGetirDene(page, uuidA);
    const medyalarB = await medyalarGetirDene(page, uuidB);
    expect(medyalarA.sonuc.length).toBe(1);
    expect(medyalarB.sonuc.length).toBe(0);

    // UI üzerinden de doğrula: DÖF B seçilince liste boş, DÖF A'ya dönünce dolu.
    await page.locator('.dof-liste-karti').filter({ hasText: 'B-2' }).click();
    await expect(page.locator('#dof-kanit-medya-kart')).toContainText('Henüz kanıt eklenmedi.');
    await page.locator('.dof-liste-karti').filter({ hasText: 'B-1' }).click();
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);
  });

  test('G. Sayfa yenileme sonrası medya listesi korunur', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 1500 });

    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await dofSecVeKartBekle(page);

    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);
    await expect(page.locator('#dof-kanit-medya-liste audio')).toHaveCount(1);
  });

  test('H. Silme medya kaydını DB\'den ve UI\'dan kaldırır', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);

    await page.locator('#dof-kanit-medya-liste button', { hasText: 'Sil' }).click();
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(0);
    await expect(page.locator('#dof-kanit-medya-liste')).toContainText('Henüz kanıt eklenmedi.');

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(0);
  });

  test('I. Normal saha fotoğraf taslağı (aktifFotolarTaslak) DÖF medya eklemesinden etkilenmez', async ({ page, context }) => {
    await context.grantPermissions(['camera']);
    await sahteKameraKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    // Önce DÖF'e iki foto ekle.
    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);
    await page.click('button[onclick="openOCR(\'dof-kanit\')"]');
    await page.waitForFunction(() => { const v = document.getElementById('video'); return v && v.videoWidth > 0; });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(2);

    // Sonra NORMAL saha akışında bir fotoğraf çek -- yalnız KENDİ fotoğrafı sayılmalı.
    await _denetimBaslat(page);
    await page.click('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => { const v = document.getElementById('video'); return v && v.videoWidth > 0; });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#foto-onizleme')).toContainText('1 fotoğraf hazır');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);   // 2 DEĞİL

    await page.locator('button[onclick="saveFinding()"]').click();
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].fotolar.length).toBe(1);   // DÖF'ün 2 fotoğrafı sızmadı

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(2);   // DÖF medyası da kendi başına doğru kaldı
  });

  test('J. Normal saha ses taslağı (aktifSeslerTaslak/sesRecorder) DÖF ses eklemesinden etkilenmez', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);
    const dofSesBtn = page.locator('#dof-kanit-ses-btn');
    await dofSesBtn.click();
    await page.waitForTimeout(500);
    await dofSesBtn.click();
    await expect(page.locator('#dof-kanit-medya-liste audio')).toHaveCount(1);

    await _denetimBaslat(page);
    const sesBtn = page.locator('#btn-ses-kaydi');
    await sesBtn.click();
    await page.waitForTimeout(500);
    await sesBtn.click();
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);

    await page.locator('button[onclick="saveFinding()"]').click();
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].sesler.length).toBe(1);   // DÖF'ün ses notu sızmadı

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
  });

  test('K. Medya ekleme reviewStatus\'u değiştirmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const oncekiKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(Object.prototype.hasOwnProperty.call(oncekiKayit, 'reviewStatus')).toBe(false);

    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });

    const sonKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(Object.prototype.hasOwnProperty.call(sonKayit, 'reviewStatus')).toBe(false);
  });

  test('L. Medya ekleme takipTaslagi\'nı ve dofler kaydının diğer alanlarını değiştirmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    const oncekiKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);

    await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 900 });
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'camera', mimeType: 'image/jpeg', size: 4 });

    const sonKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);   // dofler kaydı BİREBİR aynı -- medya store'u tamamen ayrı
  });

  // NOT (4Q bilinçli güncelleme): M ve N, 4P'nin "medya export'a hiç
  // girmez" kapsam sınırını doğruluyordu -- bu sınır 4Q'nun KENDİSİ
  // tarafından kaldırıldı (medya artık üçüncü, bağımsız export kaynağı).
  // Aşağıdaki iki test YENİ gerçek sözleşmeye güncellendi; tam pozitif
  // kapsam (19 senaryo) `tests/ai-dof-kanit-media-export.spec.js`'te.
  test('M. Medya ekleme artık dof_donus.json / ZIP şemasına medya alanı ekler (4Q bilinçli güncelleme)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 500 });

    await page.evaluate((u) => window._dofImport.dofReplayHazirlikHazirla(u), dofUuid);
    const zip = await page.evaluate(async (u) => {
      const sonuc = await window._dofImport.dofReplayZipOlustur([u]);
      const buf = new Uint8Array(await sonuc.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      return { zipB64: btoa(ikili) };
    }, dofUuid);

    const zipDosya = new AdmZip(Buffer.from(zip.zipB64, 'base64'));
    const entryAdlari = zipDosya.getEntries().map((e) => e.entryName).sort();
    expect(entryAdlari.length).toBe(3);   // dof_donus.json + 1 foto + 1 ses
    expect(entryAdlari).toContain('dof_donus.json');
    const belge = JSON.parse(zipDosya.readAsText('dof_donus.json', 'utf8'));
    const kontrol = belge.dofKontrolleri[0];
    expect(kontrol.fotolar.length).toBe(1);
    expect(kontrol.sesNotlari.length).toBe(1);
    expect(kontrol.kanitMedyalari.length).toBe(2);
  });

  test('N. Hazırlık sonrası medya eklenirse ZIP REPLAY_HAZIRLIK_ESKI verir (4Q bilinçli güncelleme -- medya artık fingerprint\'e dahil)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    const hazirlik = await page.evaluate((u) => window._dofImport.dofReplayHazirlikHazirla(u), dofUuid);
    expect(hazirlik).toBeTruthy();

    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });

    const zipSonucu = await page.evaluate(async (u) => {
      try {
        await window._dofImport.dofReplayZipOlustur([u]);
        return { basarili: true };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    }, dofUuid);
    expect(zipSonucu.basarili).toBe(false);
    expect(zipSonucu.kod).toBe('REPLAY_HAZIRLIK_ESKI');
  });

  test('O. Aktif DÖF ses kaydı sırasında başka DÖF\'e geçiş yanlış DÖF\'e kayıt üretmez', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const [uuidA, uuidB] = paket.tehlikeler.map((t) => t.dofUuid);

    await page.locator('.dof-liste-karti').filter({ hasText: 'B-1' }).click();
    const sesBtn = page.locator('#dof-kanit-ses-btn');
    await sesBtn.click();
    await expect(sesBtn).toContainText('Durdur');
    await page.waitForTimeout(300);

    // Kayıt DEVAM EDERKEN başka bir DÖF'e geç.
    await page.locator('.dof-liste-karti').filter({ hasText: 'B-2' }).click();
    await expect(page.locator('#dof-kanit-ses-btn')).toContainText('Ses Notu');   // otomatik durduruldu

    const medyalarA = await medyalarGetirDene(page, uuidA);
    const medyalarB = await medyalarGetirDene(page, uuidB);
    expect(medyalarA.sonuc.length).toBe(0);   // atıldı, A'ya yazılmadı
    expect(medyalarB.sonuc.length).toBe(0);   // B'ye de yazılmadı
  });

  test('P. ObjectURL cleanup -- yeni render öncesi eski URL\'ler revoke edilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await dofSecVeKartBekle(page);

    await page.evaluate(() => {
      window.__revokeSayisi = 0;
      const orijinal = URL.revokeObjectURL.bind(URL);
      URL.revokeObjectURL = (u) => { window.__revokeSayisi++; orijinal(u); };
    });

    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(1);
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-liste img')).toHaveCount(2);

    const revokeSayisiIlkIki = await page.evaluate(() => window.__revokeSayisi);
    expect(revokeSayisiIlkIki).toBeGreaterThanOrEqual(1);   // ikinci ekleme öncesi ilkin URL'i revoke edildi

    await page.locator('.dof-liste-karti').first().click();   // aynı DÖF -- yine de kart yeniden yüklenir
    await page.locator('.dof-liste-karti').first().click();

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(2);   // veri kaybı yok, yalnız önizleme URL'leri temizlendi
  });

  test('Q. Servis fonksiyonları dofReplayZipOlustur imzasını bozmaz -- belge artık medya alanlarını da içerir (4Q bilinçli güncelleme)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'camera', mimeType: 'image/jpeg', size: 4 });

    const belgeSonucu = await page.evaluate(async (u) => {
      const belge = await window._dofImport.dofDonusBelgesiOlustur([{ dofUuid: u, submissionUuid: crypto.randomUUID() }]);
      return belge;
    }, dofUuid);
    expect(Object.keys(belgeSonucu)).toEqual(['paketUuid', 'dofKontrolleri']);
    expect(Object.keys(belgeSonucu.dofKontrolleri[0]).sort()).toEqual(
      ['dofUuid', 'exportUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'submissionUuid', 'sorumlu', 'fotolar', 'kanitMedyalari'].sort());
  });

  // ── Codex bağımsız QA düzeltmesi: dofKanitMedyasiSil artık yalnız
  // localMediaUuid değil, ÇAĞIRANIN verdiği dofUuid ile medyanın GERÇEK
  // sahibi eşleşmiyorsa reddediyor -- aşağıdaki testler bu güvenlik
  // sınırını kilitler. ──────────────────────────────────────────────

  test('R. Silme doğru DÖF + doğru medya UUID ile başarılı olur (servis-seviyesi)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const ekleSonucu = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    const localMediaUuid = ekleSonucu.sonuc.localMediaUuid;

    const silSonucu = await medyaSilDene(page, dofUuid, localMediaUuid);
    expect(silSonucu.basarili).toBe(true);

    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(0);
  });

  test('S. Silme medya yoksa DOF_KANIT_MEDYA_BULUNAMADI ile reddedilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const silSonucu = await medyaSilDene(page, dofUuid, 'olmayan-bir-uuid');
    expect(silSonucu.basarili).toBe(false);
    expect(silSonucu.kod).toBe('DOF_KANIT_MEDYA_BULUNAMADI');
  });

  test('T. DÖF A\'nın medyası DÖF B bağlamından silinemez (Codex bulgusu -- zorunlu)', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const [uuidA, uuidB] = paket.tehlikeler.map((t) => t.dofUuid);

    const ekleSonucu = await medyaEkleDene(page, uuidA, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    const localMediaUuid = ekleSonucu.sonuc.localMediaUuid;

    // DÖF B bağlamından, DÖF A'nın medyasını silmeye çalış.
    const silSonucu = await medyaSilDene(page, uuidB, localMediaUuid);
    expect(silSonucu.basarili).toBe(false);
    expect(silSonucu.kod).toBe('DOF_KANIT_MEDYA_DOF_UYUSMAZLIGI');

    // Medya A'da HÂLÂ duruyor -- silinmedi.
    const medyalarA = await medyalarGetirDene(page, uuidA);
    expect(medyalarA.sonuc.length).toBe(1);
  });

  test('U. Legacy/WIP DÖF bağlamında silme reddedilir (Codex bulgusu -- zorunlu)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const ekleSonucu = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    const localMediaUuid = ekleSonucu.sonuc.localMediaUuid;

    const wipKayit = { id: 'dof_wip_ah2', dofId: 999, bulguKodu: 'B-WIP', durum: 'bekliyor', birimId: 'birim-wip' };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    // Legacy/WIP dofUuid ile silme dene -- medyanın gerçek sahibiyle
    // (kanonik dofUuid) hiç eşleşmese bile, ÖNCE kanoniklik reddedilir.
    const silSonucu = await medyaSilDene(page, 'dof_wip_ah2', localMediaUuid);
    expect(silSonucu.basarili).toBe(false);
    expect(silSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    // Gerçek medya da etkilenmedi.
    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
  });

  test('V. Kanonik olmayan hale gelmiş DÖF kaydına bağlı medya silinemez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const ekleSonucu = await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 500 });
    const localMediaUuid = ekleSonucu.sonuc.localMediaUuid;

    // DÖF kaydı sonradan (savunmacı senaryo) kanonik olmaktan çıkarılıyor.
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    await page.evaluate((k) => window._idb.dbGuncelle('dofler', k), { ...kayit, replayVersion: 1 });

    const silSonucu = await medyaSilDene(page, dofUuid, localMediaUuid);
    expect(silSonucu.basarili).toBe(false);
    expect(silSonucu.kod).toBe('KANONIK_DOF_DEGIL');
  });

  test('W. UI silme çağrısı aktif DÖF uuid\'siyle yapılır -- aidiyet uyuşmazlığında reddedilir, hata görünür', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const [uuidA, uuidB] = paket.tehlikeler.map((t) => t.dofUuid);
    const ekleSonucu = await medyaEkleDene(page, uuidA, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    const localMediaUuid = ekleSonucu.sonuc.localMediaUuid;

    // UI DÖF B'yi göstermeye geçmişken (aktif DÖF = B), DÖF A'nın medya
    // UUID'siyle silme UI handler'ı üzerinden tetiklenir (`_dofKanitMedyaSilTikla`
    // yalnız aktif DÖF'ü, listedeki UUID'ye güvenmeden, kullanır).
    await page.locator('.dof-liste-karti').filter({ hasText: 'B-2' }).click();
    await expect(page.locator('#dof-kanit-medya-kart')).toBeVisible();

    await page.evaluate((id) => window._dofKanitMedyaSilTikla(id), localMediaUuid);
    await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Medya (' + localMediaUuid + ') verilen dofUuid\'ye ait değil.');

    const medyalarA = await medyalarGetirDene(page, uuidA);
    expect(medyalarA.sonuc.length).toBe(1);   // silinmedi
  });

  test('X. Silme reviewStatus\'u ve takipTaslagi\'nı değiştirmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    const ekleSonucu = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'camera', mimeType: 'image/jpeg', size: 4 });
    const oncekiKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);

    await medyaSilDene(page, dofUuid, ekleSonucu.sonuc.localMediaUuid);

    const sonKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);
  });

  test('Y. Silme hazırlıktan sonraysa REPLAY_HAZIRLIK_ESKI verir; belge kalan medyayı doğru yansıtır (4Q bilinçli güncelleme -- medya artık fingerprint\'e dahil)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet' }), dofUuid);
    const ekle1 = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
    const ekle2 = await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 300 });

    const hazirlik = await page.evaluate((u) => window._dofImport.dofReplayHazirlikHazirla(u), dofUuid);
    expect(hazirlik).toBeTruthy();

    // Hazırlıktan SONRA bir medya siliniyor -- medya seti artık fingerprint'e
    // dahil olduğundan (4Q) bu, hazırlığı ESKİ kılar.
    await medyaSilDene(page, dofUuid, ekle1.sonuc.localMediaUuid);

    const zipSonucu = await page.evaluate(async (u) => {
      try {
        const sonuc = await window._dofImport.dofReplayZipOlustur([u]);
        return { basarili: true };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    }, dofUuid);
    expect(zipSonucu.basarili).toBe(false);
    expect(zipSonucu.kod).toBe('REPLAY_HAZIRLIK_ESKI');

    // dofDonusBelgesiOlustur hazırlık/staleness'tan bağımsız, salt-okunur
    // çalışmaya devam eder -- kalan (silinmeyen) medyayı doğru yansıtmalı.
    const belgeSonucu = await page.evaluate(async (u) => {
      return window._dofImport.dofDonusBelgesiOlustur([{ dofUuid: u, submissionUuid: crypto.randomUUID() }]);
    }, dofUuid);
    const kontrol = belgeSonucu.dofKontrolleri[0];
    expect(kontrol).not.toHaveProperty('fotolar');   // silinen foto artık yok
    expect(kontrol.sesNotlari.length).toBe(1);
    expect(kontrol.kanitMedyalari.length).toBe(1);
    expect(kontrol.kanitMedyalari[0].localMediaUuid).toBe(ekle2.sonuc.localMediaUuid);

    // İkinci medya (silinmeyen) hâlâ store'da duruyor -- silme yalnız hedeflenen kaydı etkiledi.
    const medyalar = await medyalarGetirDene(page, dofUuid);
    expect(medyalar.sonuc.length).toBe(1);
    expect(medyalar.sonuc[0].localMediaUuid).toBe(ekle2.sonuc.localMediaUuid);
  });
});
