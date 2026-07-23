// PWA Commit 4Q -- DÖF replay ZIP paketine kanıt medyası (foto/ses) dahil
// edilmesi. Medya (PWA Commit 4P'de yerel yakalanan `dofKanitlari` store'u),
// takip alanlarından VE reviewStatus'tan (4O) TAMAMEN BAĞIMSIZ üçüncü bir
// export kaynağıdır: `dofDonusBelgesiOlustur` manifestine Desktop'ın
// beklediği DÜZ (bare) `fotolar`/`sesNotlari` dosya adı dizilerini +
// PWA'nın kendi katma `kanitMedyalari` audit alanını ekler,
// `dofReplayZipOlustur` bu dosyaları `fotolar/`/`sesler/` ZIP klasörlerine
// gerçek Blob içerikleriyle yazar, hazırlık fingerprint'i (4C/4O) artık
// medya setini de (localMediaUuid/mediaType/relativePath) kapsar.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

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

async function ikiDofKur(page) {
  const paket = gecerliDofPaketi({
    tehlikelerOverride: [
      gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
      gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
    ],
  });
  await dosyaSec(page, JSON.stringify(paket));
  return paket.tehlikeler.map((t) => t.dofUuid);
}

/** `medyaGirdisi.icerikB64` verilirse Blob TAM OLARAK o baytlardan
 * üretilir (SHA-256 doğruluğu ve dosya içeriği testleri için) -- yoksa
 * sabit küçük bir gövde kullanılır. */
async function medyaEkleDene(page, dofUuid, medyaGirdisi) {
  return page.evaluate(async ({ u, m }) => {
    try {
      const bytes = m.icerikB64
        ? Uint8Array.from(atob(m.icerikB64), (c) => c.charCodeAt(0))
        : new Uint8Array([1, 2, 3, 4]);
      const blob = new Blob([bytes], { type: m.mimeType || 'application/octet-stream' });
      const { icerikB64, ...girdi } = m;
      const sonuc = await window._dofImport.dofKanitMedyasiEkle(u, { ...girdi, blob });
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

async function takipGuncelleDene(page, dofUuid, veri) {
  return page.evaluate(({ u, v }) => window._dofImport.dofTakipTaslagiGuncelle(u, v), { u: dofUuid, v: veri });
}

async function reviewGuncelleDene(page, dofUuid, reviewStatus) {
  return page.evaluate(({ u, r }) => window._dofImport.dofReviewStatusGuncelle(u, r), { u: dofUuid, r: reviewStatus });
}

async function hazirlikDene(page, dofUuid) {
  return page.evaluate((u) => window._dofImport.dofReplayHazirlikHazirla(u), dofUuid);
}

async function belgeDene(page, dofUuidListesi) {
  return page.evaluate(async (liste) => {
    try {
      const girdiler = liste.map((u) => ({ dofUuid: u, submissionUuid: crypto.randomUUID() }));
      const belge = await window._dofImport.dofDonusBelgesiOlustur(girdiler);
      return { basarili: true, belge };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
}

/** ZIP'i üretir + Node tarafında `AdmZip` ile açar. Başarısızlıkta
 * `{basarili:false, kod}` döner -- ZIP açma denemesi YAPILMAZ. */
async function zipOlusturVeAc(page, dofUuidListesi) {
  const sonuc = await page.evaluate(async (liste) => {
    try {
      const r = await window._dofImport.dofReplayZipOlustur(liste);
      const buf = new Uint8Array(await r.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      return { basarili: true, zipB64: btoa(ikili), dosyaAdi: r.dosyaAdi, dofSayisi: r.dofSayisi, paketUuid: r.paketUuid };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
  if (!sonuc.basarili) return sonuc;
  const zipDosya = new AdmZip(Buffer.from(sonuc.zipB64, 'base64'));
  return { ...sonuc, zipDosya };
}

test.describe('AI. DÖF Replay Medya Export + Sözleşme Testleri', () => {
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

  test('1. Medyasız kayıt geriye dönük uyumlu -- tek entry, medya alanı yok', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.zipDosya.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    const belge = JSON.parse(zip.zipDosya.readAsText('dof_donus.json', 'utf8'));
    const kontrol = belge.dofKontrolleri[0];
    for (const alan of ['fotolar', 'sesNotlari', 'kanitMedyalari']) {
      expect(kontrol).not.toHaveProperty(alan);
    }
  });

  test('2. Foto gerçek dosya olarak ZIP\'e yazılır -- fotolar/<uuid>.jpg', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ekle = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4, icerikB64: btoa('FOTO-ICERIK') });
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const beklenenAd = `fotolar/${ekle.sonuc.localMediaUuid}.jpg`;
    const entry = zip.zipDosya.getEntry(beklenenAd);
    expect(entry).toBeTruthy();
    expect(entry.getData().toString('utf8')).toBe('FOTO-ICERIK');
  });

  test('3. Ses notu gerçek dosya olarak ZIP\'e yazılır -- sesler/<uuid>.webm', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ekle = await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 800, icerikB64: btoa('SES-ICERIK') });
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const beklenenAd = `sesler/${ekle.sonuc.localMediaUuid}.webm`;
    const entry = zip.zipDosya.getEntry(beklenenAd);
    expect(entry).toBeTruthy();
    expect(entry.getData().toString('utf8')).toBe('SES-ICERIK');
  });

  test('4. Manifest relativePath, ZIP entry adıyla ve fotolar/sesNotlari çıplak adıyla birebir eşleşir (Desktop fotolar//sesler/ klasör sözleşmesi)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ekleFoto = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    const ekleSes = await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 800 });
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const belge = JSON.parse(zip.zipDosya.readAsText('dof_donus.json', 'utf8'));
    const kontrol = belge.dofKontrolleri[0];

    expect(kontrol.fotolar).toEqual([`${ekleFoto.sonuc.localMediaUuid}.jpg`]);
    expect(kontrol.sesNotlari).toEqual([`${ekleSes.sonuc.localMediaUuid}.webm`]);

    const entryAdlari = zip.zipDosya.getEntries().map((e) => e.entryName);
    for (const m of kontrol.kanitMedyalari) {
      expect(m.relativePath.startsWith(m.mediaType === 'photo' ? 'fotolar/' : 'sesler/')).toBe(true);
      expect(entryAdlari).toContain(m.relativePath);
    }
  });

  test('5. kanitMedyalari[].sha256, gerçek blob içeriğinin doğru SHA-256 hex64 özeti', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    // Bilinen içerik + Web Crypto ile tarayıcı içinde bağımsız hesaplanan
    // beklenen hash -- servis fonksiyonunun ÜRETTİĞİ değerle karşılaştırılır.
    const { icerikB64, beklenenHex } = await page.evaluate(async () => {
      const metin = 'SHA256-TEST-ICERIGI';
      const bytes = new TextEncoder().encode(metin);
      const ozet = await crypto.subtle.digest('SHA-256', bytes);
      const hex = Array.from(new Uint8Array(ozet)).map((b) => b.toString(16).padStart(2, '0')).join('');
      return { icerikB64: btoa(metin), beklenenHex: hex };
    });
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4, icerikB64 });

    const belgeSonucu = await belgeDene(page, [dofUuid]);
    expect(belgeSonucu.basarili).toBe(true);
    const kontrol = belgeSonucu.belge.dofKontrolleri[0];
    expect(kontrol.kanitMedyalari[0].sha256).toBe(beklenenHex);
    expect(kontrol.kanitMedyalari[0].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  test('6. Foto + ses birlikte -- ikisi de manifestte ve ZIP\'te doğru yer alır', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'camera', mimeType: 'image/jpeg', size: 4 });
    await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 500 });
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.zipDosya.getEntries().length).toBe(3);   // json + foto + ses
    const belge = JSON.parse(zip.zipDosya.readAsText('dof_donus.json', 'utf8'));
    const kontrol = belge.dofKontrolleri[0];
    expect(kontrol.fotolar.length).toBe(1);
    expect(kontrol.sesNotlari.length).toBe(1);
    expect(kontrol.kanitMedyalari.length).toBe(2);
  });

  test('7. DÖF A\'nın medyası DÖF B\'nin export belgesine sızmaz', async ({ page }) => {
    const [uuidA, uuidB] = await ikiDofKur(page);
    await takipGuncelleDene(page, uuidA, { sorumlu: 'Ahmet' });
    await takipGuncelleDene(page, uuidB, { sorumlu: 'Mehmet' });
    await medyaEkleDene(page, uuidA, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });

    const belgeSonucu = await belgeDene(page, [uuidA, uuidB]);
    expect(belgeSonucu.basarili).toBe(true);
    const kontrolA = belgeSonucu.belge.dofKontrolleri.find((k) => k.dofUuid === uuidA);
    const kontrolB = belgeSonucu.belge.dofKontrolleri.find((k) => k.dofUuid === uuidB);
    expect(kontrolA.kanitMedyalari.length).toBe(1);
    expect(kontrolB).not.toHaveProperty('kanitMedyalari');
    expect(kontrolB).not.toHaveProperty('fotolar');
  });

  test('8. Eklenip hazırlıktan ÖNCE silinen medya export edilmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ekle = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    await medyaSilDene(page, dofUuid, ekle.sonuc.localMediaUuid);
    await hazirlikDene(page, dofUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.zipDosya.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    const belge = JSON.parse(zip.zipDosya.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri[0]).not.toHaveProperty('kanitMedyalari');
  });

  test('9. Yalnız medya (takip + reviewStatus dokunulmamış) export mümkündür', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });

    const belgeSonucu = await belgeDene(page, [dofUuid]);
    expect(belgeSonucu.basarili).toBe(true);
    const kontrol = belgeSonucu.belge.dofKontrolleri[0];
    expect(Object.keys(kontrol).sort()).toEqual(
      ['dofUuid', 'exportUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'submissionUuid', 'fotolar', 'kanitMedyalari'].sort());

    await hazirlikDene(page, dofUuid);
    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.zipDosya.getEntries().length).toBe(2);   // json + foto
  });

  test('10. Takip + reviewStatus + medya ÜÇÜ DE boşsa BOS_TAKIP_TASLAGI korunur', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const belgeSonucu = await belgeDene(page, [dofUuid]);
    expect(belgeSonucu.basarili).toBe(false);
    expect(belgeSonucu.kod).toBe('BOS_TAKIP_TASLAGI');

    const hazirlikSonucu = await page.evaluate(async (u) => {
      try {
        await window._dofImport.dofReplayHazirlikHazirla(u);
        return { basarili: true };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    }, dofUuid);
    expect(hazirlikSonucu.basarili).toBe(false);
    expect(hazirlikSonucu.kod).toBe('BOS_TAKIP_TASLAGI');
  });

  test('11. Hazırlıktan SONRA medya eklenirse ZIP REPLAY_HAZIRLIK_ESKI verir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlikDene(page, dofUuid);

    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_ESKI');
  });

  test('12. Hazırlıktan SONRA medya silinirse ZIP REPLAY_HAZIRLIK_ESKI verir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ekle = await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    await hazirlikDene(page, dofUuid);

    await medyaSilDene(page, dofUuid, ekle.sonuc.localMediaUuid);

    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_ESKI');
  });

  test('13. ESKI sonrası yeniden hazırlık ile ZIP tekrar başarılı olur', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlikDene(page, dofUuid);
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });

    const ilkZip = await zipOlusturVeAc(page, [dofUuid]);
    expect(ilkZip.basarili).toBe(false);
    expect(ilkZip.kod).toBe('REPLAY_HAZIRLIK_ESKI');

    await hazirlikDene(page, dofUuid);
    const ikinciZip = await zipOlusturVeAc(page, [dofUuid]);
    expect(ikinciZip.basarili).toBe(true);
    expect(ikinciZip.zipDosya.getEntries().length).toBe(2);
  });

  test('14. reviewStatus + medya birlikte -- ikisi de belgede, birbirini etkilemez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewGuncelleDene(page, dofUuid, 'goruldu');
    await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 400 });

    const belgeSonucu = await belgeDene(page, [dofUuid]);
    expect(belgeSonucu.basarili).toBe(true);
    const kontrol = belgeSonucu.belge.dofKontrolleri[0];
    expect(kontrol.reviewStatus).toBe('goruldu');
    expect(kontrol.sesNotlari.length).toBe(1);
    expect(kontrol.kanitMedyalari.length).toBe(1);
  });

  test('15. reviewStatus=kapatma_onerisi + medya birlikte -- Desktop kapanış alanı ÜRETİLMEZ', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewGuncelleDene(page, dofUuid, 'kapatma_onerisi');
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'camera', mimeType: 'image/jpeg', size: 4 });

    const belgeSonucu = await belgeDene(page, [dofUuid]);
    expect(belgeSonucu.basarili).toBe(true);
    const kontrol = belgeSonucu.belge.dofKontrolleri[0];
    expect(kontrol.reviewStatus).toBe('kapatma_onerisi');
    for (const kapanisAlani of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapatan_kullanici', 'sonuc']) {
      expect(kontrol).not.toHaveProperty(kapanisAlani);
    }
  });

  test('17. dofReplayZipOlustur imzası değişmedi -- yalnız dofUuid dizisi alır, aynı 4 alanı döner', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    await hazirlikDene(page, dofUuid);

    const sonuc = await page.evaluate(async (u) => {
      const r = await window._dofImport.dofReplayZipOlustur([u]);
      return { anahtarlar: Object.keys(r).sort(), dofSayisi: r.dofSayisi, dosyaAdiUyum: /^dof_replay_.+\.zip$/.test(r.dosyaAdi) };
    }, dofUuid);
    expect(sonuc.anahtarlar).toEqual(['dofSayisi', 'dosyaAdi', 'paketUuid', 'zipBlob'].sort());
    expect(sonuc.dofSayisi).toBe(1);
    expect(sonuc.dosyaAdiUyum).toBe(true);
  });

  test('19. ZIP üretimi normal saha (bulgular) store\'una hiç dokunmaz', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await takipGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/jpeg', size: 4 });
    await hazirlikDene(page, dofUuid);

    const oncekiBulgular = await page.evaluate(() => window._idb.dbTumu('bulgular'));
    const zip = await zipOlusturVeAc(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const sonrakiBulgular = await page.evaluate(() => window._idb.dbTumu('bulgular'));
    expect(sonrakiBulgular).toEqual(oncekiBulgular);

    // Kanıt medyası store'u da yalnız OKUNDU -- kaydın kendisi değişmedi.
    const medyalar = await page.evaluate((u) => window._idb.dbIndexTumu('dofKanitlari', 'dofUuid', u), dofUuid);
    expect(medyalar.length).toBe(1);
  });
});
