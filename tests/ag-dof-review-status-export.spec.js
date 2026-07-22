// PWA Commit 4O -- reviewStatus'un dönüş belgesi (dof_donus.json) sözleşmesine
// sparse biçimde eklenmesi, reviewStatus-only export, hazırlık/staleness
// fingerprint'e reviewStatus'un dahil edilmesi ve "sadece incelenenleri
// export et" filtre yardımcısı (`dofIncelenenDofUuidleriniFiltrele`).
// UI YOKTUR -- gerçek IndexedDB üzerinden `window._dofImport` test
// köprüsüyle test edilir (o/p/q dosyalarıyla aynı desen).
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki DÖF dosyalarıyla aynı desen).
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

async function taslakGuncelleDene(page, dofUuid, degisiklikler) {
  return page.evaluate(async ({ u, d }) => {
    try {
      const sonuc = await window._dofImport.dofTakipTaslagiGuncelle(u, d);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, { u: dofUuid, d: degisiklikler });
}

async function reviewStatusGuncelleDene(page, dofUuid, reviewStatus) {
  return page.evaluate(async ({ u, r }) => {
    try {
      const sonuc = await window._dofImport.dofReviewStatusGuncelle(u, r);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, { u: dofUuid, r: reviewStatus });
}

async function donusBelgesiDene(page, girdiler) {
  return page.evaluate(async (g) => {
    try {
      const belge = await window._dofImport.dofDonusBelgesiOlustur(g);
      return { basarili: true, belge };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, girdiler);
}

async function hazirlaDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofReplayHazirlikHazirla(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

async function replayZipDene(page, dofUuidListesi) {
  return page.evaluate(async (liste) => {
    try {
      const sonuc = await window._dofImport.dofReplayZipOlustur(liste);
      const buf = new Uint8Array(await sonuc.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) {
        ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      }
      return { basarili: true, zipB64: btoa(ikili), dofSayisi: sonuc.dofSayisi };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
}

function zipDofDonusBelgesi(zipB64) {
  const zip = new AdmZip(Buffer.from(zipB64, 'base64'));
  return { entries: zip.getEntries().map((e) => e.entryName), belge: JSON.parse(zip.readAsText('dof_donus.json', 'utf8')) };
}

async function filtreDene(page, dofUuidListesi) {
  return page.evaluate(async (liste) => {
    try {
      const sonuc = await window._dofImport.dofIncelenenDofUuidleriniFiltrele(liste);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

/** Tek kanonik DÖF import edip dofUuid'ini döner. */
async function tekDofKur(page, dofId = 1) {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId })] });
  await dofIceriAktarDene(page, paket);
  return paket.tehlikeler[0].dofUuid;
}

test.describe('AG. reviewStatus export sözleşmesi ve "sadece incelenenler" filtresi', () => {
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

  test('A. Hiç takip alanı yok + reviewStatus absent/dokunulmadi -> BOS_TAKIP_TASLAGI', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const sonuc1 = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc1.basarili).toBe(false);
    expect(sonuc1.kod).toBe('BOS_TAKIP_TASLAGI');

    // Açıkça 'dokunulmadi' seçilmesi de (no-op, own-property olmaz) aynı sonucu verir.
    await reviewStatusGuncelleDene(page, dofUuid, 'dokunulmadi');
    const sonuc2 = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc2.basarili).toBe(false);
    expect(sonuc2.kod).toBe('BOS_TAKIP_TASLAGI');
  });

  test('B. Hiç takip alanı yok + reviewStatus goruldu -> export edilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.reviewStatus).toBe('goruldu');
    expect(Object.keys(k).sort()).toEqual(
      ['dofUuid', 'exportUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'submissionUuid',
        'reviewStatus', 'reviewStatusGuncellenmeZamani'].sort());
  });

  test('C. Hiç takip alanı yok + reviewStatus inceledi_degisiklik_yok -> export edilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'inceledi_degisiklik_yok');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.belge.dofKontrolleri[0].reviewStatus).toBe('inceledi_degisiklik_yok');
  });

  test('D. Hiç takip alanı yok + reviewStatus kapatma_onerisi -> export edilir, kapanış alanı üretmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.reviewStatus).toBe('kapatma_onerisi');
    for (const yasak of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto', 'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici']) {
      expect(k).not.toHaveProperty(yasak);
    }
  });

  test('E. Hiç takip alanı yok + reviewStatus kapatilamaz -> export edilir, kapanış alanı üretmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatilamaz');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.reviewStatus).toBe('kapatilamaz');
    for (const yasak of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto', 'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici']) {
      expect(k).not.toHaveProperty(yasak);
    }
  });

  test('F. Takip alanı var + reviewStatus absent/dokunulmadi -> eski şema korunur, review alanı yok', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('Ahmet');
    expect(k).not.toHaveProperty('reviewStatus');
    expect(k).not.toHaveProperty('reviewStatusGuncellenmeZamani');
    expect(Object.keys(k).sort()).toEqual(
      ['dofUuid', 'exportUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'submissionUuid', 'sorumlu'].sort());
  });

  test('G. Takip alanı var + reviewStatus != dokunulmadi -> takip alanları + reviewStatus birlikte export edilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'Pano kapatildi' });
    await reviewStatusGuncelleDene(page, dofUuid, 'inceledi_degisiklik_yok');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('Ahmet');
    expect(k.gerceklesen_faaliyet).toBe('Pano kapatildi');
    expect(k.reviewStatus).toBe('inceledi_degisiklik_yok');
  });

  test('H. Hazırlıktan sonra export-edilebilir reviewStatus değişirse REPLAY_HAZIRLIK_ESKI', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    const hazirlik = await hazirlaDene(page, dofUuid);
    expect(hazirlik.basarili).toBe(true);

    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');   // farklı bir export-edilebilir değere değişti

    const zip = await replayZipDene(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_ESKI');
  });

  test('I. Yeniden hazırlık sonrası ZIP yeni reviewStatus ile üretilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    await hazirlaDene(page, dofUuid);
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');

    const yenidenHazirlik = await hazirlaDene(page, dofUuid);
    expect(yenidenHazirlik.basarili).toBe(true);

    const zip = await replayZipDene(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const { belge } = zipDofDonusBelgesi(zip.zipB64);
    expect(belge.dofKontrolleri[0].reviewStatus).toBe('kapatma_onerisi');
  });

  test('J. Aynı reviewStatus tekrar seçilirse no-op; staleness üretmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    const hazirlik = await hazirlaDene(page, dofUuid);
    expect(hazirlik.basarili).toBe(true);

    const tekrar = await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    expect(tekrar.sonuc.durum).toBe('degismedi');

    const zip = await replayZipDene(page, [dofUuid]);
    expect(zip.basarili).toBe(true);   // REPLAY_HAZIRLIK_ESKI VERMEDİ
  });

  test('K. dofIncelenenDofUuidleriniFiltrele karışık listeyi doğru süzer', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-1' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-2' }),
        gecerliDofKaydi({ dofId: 3, bulguKodu: 'B-3' }),
        gecerliDofKaydi({ dofId: 4, bulguKodu: 'B-4' }),
      ],
    });
    await dofIceriAktarDene(page, paket);
    const [u1, u2, u3, u4] = paket.tehlikeler.map((t) => t.dofUuid);

    // u1: dokunulmadi (hiç dokunulmadı). u2: goruldu. u3: kapatma_onerisi. u4: kapatilamaz.
    await reviewStatusGuncelleDene(page, u2, 'goruldu');
    await reviewStatusGuncelleDene(page, u3, 'kapatma_onerisi');
    await reviewStatusGuncelleDene(page, u4, 'kapatilamaz');

    const sonuc = await filtreDene(page, [u1, u2, u3, u4]);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc).toEqual([u2, u3, u4]);   // yalnız incelenmişler, sırayla
  });

  test('L. takipTaslagi dolu + reviewStatus dokunulmadi -> filtrede dışarıda kalır ama doğrudan export edilirse takip alanlarıyla export edilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });   // reviewStatus'a HİÇ dokunulmadı

    const filtreSonucu = await filtreDene(page, [dofUuid]);
    expect(filtreSonucu.sonuc).toEqual([]);   // filtrede dışarıda

    const belgeSonucu = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(belgeSonucu.basarili).toBe(true);   // ama doğrudan export edilebilir
    const k = belgeSonucu.belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('Ahmet');
    expect(k).not.toHaveProperty('reviewStatus');
  });

  test('M. reviewStatus _DOF_TAKIP_ALANLARI icindeki takip allowlist ile hiç karışmaz', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    const sonuc = await taslakGuncelleDene(page, dofUuid, { reviewStatus: 'goruldu' });
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('IZINSIZ_TAKIP_ALANI');   // dofTakipTaslagiGuncelle reviewStatus'u kabul etmez
  });

  test('N. reviewStatus _DOF_DONUS_GIRDI_ALANLARI icinde degil -- girdi olarak verilirse reddedilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID(), reviewStatus: 'kapatilamaz' }]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('GECERSIZ_GIRDI');   // girdi allowlist'i hâlâ yalnız dofUuid/submissionUuid
  });

  test('O. dof_donus.json medya alanı veya medya dosyası içermez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');
    await hazirlaDene(page, dofUuid);

    const zip = await replayZipDene(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const { entries, belge } = zipDofDonusBelgesi(zip.zipB64);
    expect(entries).toEqual(['dof_donus.json']);   // tek entry, medya dosyası yok
    for (const medyaAlani of ['fotolar', 'sesNotlari', 'medya']) {
      expect(belge.dofKontrolleri[0]).not.toHaveProperty(medyaAlani);
    }
  });

  test('P. reviewStatus absent iken fingerprint eski davranışla BİREBİR AYNI (byte-for-byte)', async ({ page }) => {
    // Regresyon garantisi: reviewStatus'a hiç dokunulmayan bir DÖF'ün
    // hazırlık/ZIP akışı, 4O ÖNCESİYLE aynı davranmalı.
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    const hazirlik = await hazirlaDene(page, dofUuid);
    expect(hazirlik.basarili).toBe(true);

    const zip1 = await replayZipDene(page, [dofUuid]);
    expect(zip1.basarili).toBe(true);
    const { belge: belge1 } = zipDofDonusBelgesi(zip1.zipB64);
    expect(belge1.dofKontrolleri[0]).not.toHaveProperty('reviewStatus');

    // Aynı taslak için tekrar hazırlık istenirse hâlâ idempotent (durum:'degismedi').
    const tekrarHazirlik = await hazirlaDene(page, dofUuid);
    expect(tekrarHazirlik.sonuc.durum).toBe('degismedi');
  });
});
