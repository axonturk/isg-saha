// PWA Commit 4D -- medyasız replay ZIP üretim çekirdeği
// (`dofReplayZipOlustur`). UI/download/medya YOKTUR -- fonksiyon Blob
// döndürür; test tarafında Blob base64'e çevrilip Node'da `adm-zip`
// (yalnız devDependency) ile açılır. ZIP BYTE determinizmi kasıtlı olarak
// test edilmez (zipYaz DOS zaman damgası yazar) -- `dof_donus.json`
// METNİNİN determinizmi test edilir.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki dosyalarla aynı desen).
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

const UUID_V4_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

/** ZIP üretir; başarılıysa Blob'u base64 olarak Node tarafına taşır. */
async function replayZipUret(page, dofUuidListesi) {
  return page.evaluate(async (liste) => {
    try {
      const sonuc = await window._dofImport.dofReplayZipOlustur(liste);
      const buf = new Uint8Array(await sonuc.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) {
        ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      }
      return {
        basarili: true,
        zipB64: btoa(ikili),
        blobTipi: sonuc.zipBlob.type,
        dosyaAdi: sonuc.dosyaAdi,
        dofSayisi: sonuc.dofSayisi,
        paketUuid: sonuc.paketUuid,
      };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
}

function zipAc(zipB64) {
  return new AdmZip(Buffer.from(zipB64, 'base64'));
}

function zipEntryAdlari(zipB64) {
  return zipAc(zipB64).getEntries().map((e) => e.entryName);
}

function zipDofDonusMetni(zipB64) {
  return zipAc(zipB64).readAsText('dof_donus.json', 'utf8');
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

async function tumDoflerGetir(page) {
  return page.evaluate(async () => window._idb.dbTumu('dofler'));
}

/** Tek kanonik DÖF import edip dofUuid'ini döner. */
async function tekDofKur(page, dofId = 1) {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId })] });
  await dofIceriAktarDene(page, paket);
  return paket.tehlikeler[0].dofUuid;
}

test.describe('Q. DÖF replay ZIP üretimi (medyasız)', () => {
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

  test('A. Tek DÖF medyasız ZIP -- tek entry, submissionUuid hazırlıktan, dofId yok, takip alanları doğru', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet Yilmaz', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    const hazirlik = await hazirlaDene(page, dofUuid);
    const kayit = await dofKaydiGetir(page, dofUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.blobTipi).toBe('application/zip');
    expect(zip.dofSayisi).toBe(1);
    expect(zip.paketUuid).toBe(kayit.paketUuid);
    expect(zip.dosyaAdi).toBe(`dof_replay_${kayit.paketUuid}.zip`);

    expect(zipEntryAdlari(zip.zipB64)).toEqual(['dof_donus.json']);

    const belge = JSON.parse(zipDofDonusMetni(zip.zipB64));
    expect(belge.paketUuid).toBe(kayit.paketUuid);
    expect(belge.dofKontrolleri.length).toBe(1);
    const k = belge.dofKontrolleri[0];
    expect(k.submissionUuid).toBe(hazirlik.sonuc.replayHazirlik.submissionUuid);   // hazırlıktan geliyor
    expect(k.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(Object.prototype.hasOwnProperty.call(k, 'dofId')).toBe(false);
    expect(k.dofUuid).toBe(kayit.dofUuid);
    expect(k.exportUuid).toBe(kayit.exportUuid);
    expect(k.baseStateHash).toBe(kayit.baseStateHash);
    expect(k.aktifTurSirasi).toBe(kayit.aktifTurSirasi);
    expect(k.replayVersion).toBe(2);
    expect(k.sorumlu).toBe('Ahmet Yilmaz');
    expect(k.yeni_o).toBe(0.2);
    expect(k.yeni_f).toBe(3);
    expect(k.yeni_s).toBe(1);
  });

  test('B. İki DÖF ZIP -- aynı paketUuid, sıra input sırasıyla aynı, submission UUID\'ler doğru', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt, aynı paketUuid
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Birinci' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'Ikinci' });
    const h1 = await hazirlaDene(page, uuid1);
    const h2 = await hazirlaDene(page, uuid2);

    // Ters sırayla iste -- belge sırası da ters olmalı.
    const zip = await replayZipUret(page, [uuid2, uuid1]);
    expect(zip.basarili).toBe(true);
    expect(zip.dofSayisi).toBe(2);

    const belge = JSON.parse(zipDofDonusMetni(zip.zipB64));
    expect(belge.dofKontrolleri.length).toBe(2);
    expect(belge.dofKontrolleri[0].dofUuid).toBe(uuid2);
    expect(belge.dofKontrolleri[0].submissionUuid).toBe(h2.sonuc.replayHazirlik.submissionUuid);
    expect(belge.dofKontrolleri[0].sorumlu).toBe('Ikinci');
    expect(belge.dofKontrolleri[1].dofUuid).toBe(uuid1);
    expect(belge.dofKontrolleri[1].submissionUuid).toBe(h1.sonuc.replayHazirlik.submissionUuid);
    expect(belge.dofKontrolleri[1].sorumlu).toBe('Birinci');
  });

  test('C. Explicit null korunur -- ZIP içindeki JSON parse edilince alan own property ve null', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: null, planlanan_tarih: null, gerceklesen_faaliyet: 'Dolu deger' });
    await hazirlaDene(page, dofUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);

    const k = JSON.parse(zipDofDonusMetni(zip.zipB64)).dofKontrolleri[0];
    expect(Object.prototype.hasOwnProperty.call(k, 'sorumlu')).toBe(true);
    expect(k.sorumlu).toBe(null);
    expect(Object.prototype.hasOwnProperty.call(k, 'planlanan_tarih')).toBe(true);
    expect(k.planlanan_tarih).toBe(null);
    expect(k.gerceklesen_faaliyet).toBe('Dolu deger');
    expect(Object.prototype.hasOwnProperty.call(k, 'gozlem_degerlendirme')).toBe(false);   // dokunulmamış -> yok
  });

  test('D. Hazırlık yoksa ret -- REPLAY_HAZIRLIK_YOK, ZIP oluşmaz', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    // Hazırlık BİLEREK oluşturulmadı.

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_YOK');
    expect(zip.zipB64).toBeUndefined();
  });

  test('E. Hazırlık eskiyse ret -- REPLAY_HAZIRLIK_ESKI, DB değişmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlaDene(page, dofUuid);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Mehmet' });   // taslak hazırlıktan SONRA değişti

    const oncekiTumKayitlar = await tumDoflerGetir(page);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_ESKI');

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);   // hazırlık/taslak/timestamp değişmedi
  });

  test('F. Hazırlık temizlendiyse ret -- REPLAY_HAZIRLIK_YOK', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlaDene(page, dofUuid);
    await page.evaluate(async (u) => window._dofImport.dofReplayHazirlikTemizle(u), dofUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_YOK');
  });

  test('G. Legacy WIP reddi -- KANONIK_DOF_DEGIL, legacy kayıt değişmez', async ({ page }) => {
    const uuidBenzeriId = crypto.randomUUID();
    const wipKayit = {
      id: uuidBenzeriId, dofId: 501, bulguKodu: 'B-1', durum: 'bekliyor', birimId: 'birim-wip',
      takipTaslagi: { sorumlu: 'Test' },
      replayHazirlik: { submissionUuid: 'sahte', taslakParmakIzi: 'sahte' },
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const zip = await replayZipUret(page, [uuidBenzeriId]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('KANONIK_DOF_DEGIL');

    const kayitSonra = await dofKaydiGetir(page, uuidBenzeriId);
    expect(kayitSonra).toEqual(wipKayit);
  });

  test('H. Karışık paket reddi -- KARISIK_EXPORT_PAKETI', async ({ page }) => {
    const paket1 = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket1);
    const paket2 = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 2 })] });
    await dofIceriAktarDene(page, paket2);
    expect(paket1.paketUuid).not.toBe(paket2.paketUuid);

    const uuid1 = paket1.tehlikeler[0].dofUuid;
    const uuid2 = paket2.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'B' });
    await hazirlaDene(page, uuid1);
    await hazirlaDene(page, uuid2);

    const zip = await replayZipUret(page, [uuid1, uuid2]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('KARISIK_EXPORT_PAKETI');
  });

  test('I. Duplicate DÖF input reddi -- PAKET_ICI_DUPLICATE', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'A' });
    await hazirlaDene(page, dofUuid);

    const zip = await replayZipUret(page, [dofUuid, dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('PAKET_ICI_DUPLICATE');
  });

  test('J. ZIP path güvenliği -- entry listesi tam olarak ["dof_donus.json"]', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'A' });
    await hazirlaDene(page, dofUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);

    const adlar = zipEntryAdlari(zip.zipB64);
    expect(adlar).toEqual(['dof_donus.json']);   // tek entry, duplicate yok
    for (const ad of adlar) {
      expect(ad.startsWith('/'), 'mutlak yol').toBe(false);
      expect(ad.includes('..'), 'path traversal').toBe(false);
      expect(ad.includes('\\'), 'backslash').toBe(false);
    }
    // Medya klasörü / normal denetim dosyası yok.
    expect(adlar.some((a) => a.startsWith('fotolar/') || a.startsWith('sesler/'))).toBe(false);
    expect(adlar.includes('denetimler.json')).toBe(false);
    expect(adlar.includes('manifest.json')).toBe(false);

    // Dosya adı güvenli: path ayracı yok, beklenen desen.
    expect(zip.dosyaAdi).toMatch(/^dof_replay_[0-9a-f-]+\.zip$/i);
    expect(zip.dosyaAdi.includes('/')).toBe(false);
    expect(zip.dosyaAdi.includes('\\')).toBe(false);
  });

  test('K. JSON determinism -- iki ZIP üretiminden çıkan dof_donus.json metni birebir aynı', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: null, gerceklesen_faaliyet: 'X' });
    await hazirlaDene(page, dofUuid);

    const zip1 = await replayZipUret(page, [dofUuid]);
    const zip2 = await replayZipUret(page, [dofUuid]);
    expect(zip1.basarili).toBe(true);
    expect(zip2.basarili).toBe(true);

    const metin1 = zipDofDonusMetni(zip1.zipB64);
    const metin2 = zipDofDonusMetni(zip2.zipB64);
    expect(metin1).toBe(metin2);   // ZIP byte'ı DEĞİL, JSON metni kıyaslanır

    // dofDonusJsonOlustur çıktısıyla da birebir aynı olmalı.
    const dogrudanJson = await page.evaluate(async (u) => {
      const girdiler = await window._dofImport.dofDonusGirdileriHazirla([u]);
      return window._dofImport.dofDonusJsonOlustur(girdiler);
    }, dofUuid);
    expect(metin1).toBe(dogrudanJson);
  });

  test('L. Salt-okunur davranış -- ZIP üretimi öncesi/sonrası tüm dofler kayıtları birebir aynı', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    await taslakGuncelleDene(page, uuid2, { sorumlu: null });
    await hazirlaDene(page, uuid1);
    await hazirlaDene(page, uuid2);

    const oncekiTumKayitlar = await tumDoflerGetir(page);

    const zip = await replayZipUret(page, [uuid1, uuid2]);
    expect(zip.basarili).toBe(true);
    expect(zip.dofSayisi).toBe(2);

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);
    expect(sonrakiTumKayitlar.length).toBe(2);
  });
});
