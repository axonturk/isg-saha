// PWA Commit 4E -- uçtan uca replay servis zinciri kontrat testi
// (TEST-ONLY, production kod değişmez):
//   Desktop replay-v2 DÖF paketi -> dofPaketiIceriAktar -> dofTakipTaslagiGuncelle
//   -> dofReplayHazirlikHazirla -> dofReplayZipOlustur -> ZIP içinden
//   dof_donus.json -> JSON sözleşme doğrulama.
// Amaç yeni özellik değil, Commit 3B-4D'de ayrı ayrı doğrulanmış
// servislerin BİRLİKTE doğru çalıştığını kanıtlamaktır.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki dosyalarla aynı desen).
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

/** ZIP üretir; başarılıysa Blob'u base64 olarak Node tarafına taşır (aynı
 * desen: tests/q-dof-replay-zip.spec.js). */
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

test.describe('R. DÖF replay servis zinciri -- uçtan uca kontrat (test-only)', () => {
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

  test('A. Tek DÖF happy path -- Desktop paket -> import -> taslak -> hazırlık -> ZIP -> JSON sözleşme', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    const importSonucu = await dofIceriAktarDene(page, paket);
    expect(importSonucu.basarili).toBe(true);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const taslakSonucu = await taslakGuncelleDene(page, dofUuid, {
      sorumlu: 'İSG Uzmanı',
      gerceklesen_faaliyet: 'Korkuluk sabitlendi',
      planlanan_tarih: null,
    });
    expect(taslakSonucu.basarili).toBe(true);

    const hazirlikSonucu = await hazirlaDene(page, dofUuid);
    expect(hazirlikSonucu.basarili).toBe(true);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zipEntryAdlari(zip.zipB64)).toEqual(['dof_donus.json']);

    const kayit = await dofKaydiGetir(page, dofUuid);
    const belge = JSON.parse(zipDofDonusMetni(zip.zipB64));
    expect(belge.paketUuid).toBe(paket.paketUuid);
    expect(belge.dofKontrolleri.length).toBe(1);
    const k = belge.dofKontrolleri[0];
    expect(k.dofUuid).toBe(kayit.dofUuid);
    expect(k.exportUuid).toBe(kayit.exportUuid);
    expect(k.baseStateHash).toBe(kayit.baseStateHash);
    expect(k.aktifTurSirasi).toBe(kayit.aktifTurSirasi);
    expect(k.replayVersion).toBe(2);
    expect(k.submissionUuid).toBe(hazirlikSonucu.sonuc.replayHazirlik.submissionUuid);
    expect(k.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(k.sorumlu).toBe('İSG Uzmanı');
    expect(k.gerceklesen_faaliyet).toBe('Korkuluk sabitlendi');
    expect(Object.prototype.hasOwnProperty.call(k, 'planlanan_tarih')).toBe(true);
    expect(k.planlanan_tarih).toBe(null);
    expect(Object.prototype.hasOwnProperty.call(k, 'dofId')).toBe(false);
    // Medya/UI metadata sızmadı.
    for (const yasakli of ['fotolar', 'sesNotlari', 'sesler', 'durum', 'sonuc', 'kontrolNotu', 'iceAktarilmaZamani', 'taslakGuncellenmeZamani']) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
  });

  test('B. İki DÖF happy path -- ters input sırası korunur, iki taslak karışmaz', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt, aynı paketUuid
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;

    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Birinci Uzman' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'Ikinci Uzman', gerceklesen_faaliyet: 'Pano etiketlendi' });
    const h1 = await hazirlaDene(page, uuid1);
    const h2 = await hazirlaDene(page, uuid2);

    const zip = await replayZipUret(page, [uuid2, uuid1]);   // TERS sıra
    expect(zip.basarili).toBe(true);

    const belge = JSON.parse(zipDofDonusMetni(zip.zipB64));
    expect(belge.paketUuid).toBe(paket.paketUuid);
    expect(belge.dofKontrolleri.length).toBe(2);
    expect(belge.dofKontrolleri[0].dofUuid).toBe(uuid2);
    expect(belge.dofKontrolleri[0].submissionUuid).toBe(h2.sonuc.replayHazirlik.submissionUuid);
    expect(belge.dofKontrolleri[0].sorumlu).toBe('Ikinci Uzman');
    expect(belge.dofKontrolleri[0].gerceklesen_faaliyet).toBe('Pano etiketlendi');
    expect(belge.dofKontrolleri[1].dofUuid).toBe(uuid1);
    expect(belge.dofKontrolleri[1].submissionUuid).toBe(h1.sonuc.replayHazirlik.submissionUuid);
    expect(belge.dofKontrolleri[1].sorumlu).toBe('Birinci Uzman');
    expect(Object.prototype.hasOwnProperty.call(belge.dofKontrolleri[1], 'gerceklesen_faaliyet')).toBe(false);   // dokunulmadı
  });

  test('C. Explicit null round-trip -- 5 explicit null alan uçtan uca korunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, {
      sorumlu: null,
      etkinlik_kontrol_tarihi: null,
      yeni_o: null,
      yeni_f: null,
      yeni_s: null,
    });
    await hazirlaDene(page, dofUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const k = JSON.parse(zipDofDonusMetni(zip.zipB64)).dofKontrolleri[0];

    for (const alan of ['sorumlu', 'etkinlik_kontrol_tarihi', 'yeni_o', 'yeni_f', 'yeni_s']) {
      expect(Object.prototype.hasOwnProperty.call(k, alan), alan).toBe(true);
      expect(k[alan], alan).toBe(null);
    }
    // Hiç dokunulmamış alanlar own property olarak YOK.
    for (const alan of ['planlanan_tarih', 'gerceklesen_faaliyet', 'gozlem_degerlendirme']) {
      expect(Object.prototype.hasOwnProperty.call(k, alan), alan).toBe(false);
    }
  });

  test('D. Hazırlık atlanırsa zincir kırılır -- REPLAY_HAZIRLIK_YOK', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'X' });
    // dofReplayHazirlikHazirla BİLEREK çağrılmadı.

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_YOK');
  });

  test('E. Taslak değişirse eski hazırlıkla ZIP reddedilir -- REPLAY_HAZIRLIK_ESKI, DB değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'X' });
    await hazirlaDene(page, dofUuid);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Y' });   // hazırlıktan SONRA değişti

    const oncekiTumKayitlar = await tumDoflerGetir(page);
    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(false);
    expect(zip.kod).toBe('REPLAY_HAZIRLIK_ESKI');

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);
  });

  test('F. Re-hazırlık sonrası ZIP kabul edilir -- yeni submission UUID, güncel taslak', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'X' });
    const eskiHazirlik = await hazirlaDene(page, dofUuid);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Y' });

    const yeniHazirlik = await hazirlaDene(page, dofUuid);
    expect(yeniHazirlik.basarili).toBe(true);
    expect(yeniHazirlik.sonuc.durum).toBe('yenilendi');
    expect(yeniHazirlik.sonuc.replayHazirlik.submissionUuid).not.toBe(eskiHazirlik.sonuc.replayHazirlik.submissionUuid);

    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    const k = JSON.parse(zipDofDonusMetni(zip.zipB64)).dofKontrolleri[0];
    expect(k.sorumlu).toBe('Y');
    expect(k.submissionUuid).toBe(yeniHazirlik.sonuc.replayHazirlik.submissionUuid);
  });

  test('G. Duplicate package import idempotency + zincir çalışır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    const ilkImport = await dofIceriAktarDene(page, paket);
    expect(ilkImport.basarili).toBe(true);
    expect(ilkImport.sonuc).toEqual({ toplam: 1, eklenen: 1, degismeyen: 0 });

    const ikinciImport = await dofIceriAktarDene(page, paket);   // AYNI paket tekrar
    expect(ikinciImport.basarili).toBe(true);
    expect(ikinciImport.sonuc).toEqual({ toplam: 1, eklenen: 0, degismeyen: 1 });   // idempotent

    const tumKayitlar = await tumDoflerGetir(page);
    expect(tumKayitlar.length).toBe(1);   // duplicate local DÖF OLUŞMADI

    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'X' });
    await hazirlaDene(page, dofUuid);
    const zip = await replayZipUret(page, [dofUuid]);
    expect(zip.basarili).toBe(true);
    expect(zip.dofSayisi).toBe(1);
  });

  test('H. Import conflict sonrası zincir korunur -- mevcut kayıt bozulmaz, ZIP hâlâ tutarlı', async ({ page }) => {
    const dofUuid = require('./dof-import-fixtures').sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid })] });
    const ilkImport = await dofIceriAktarDene(page, ilkPaket);
    expect(ilkImport.basarili).toBe(true);

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'X' });
    const hazirlik = await hazirlaDene(page, dofUuid);
    const zipOncesi = await replayZipUret(page, [dofUuid]);
    expect(zipOncesi.basarili).toBe(true);
    const metinOncesi = zipDofDonusMetni(zipOncesi.zipB64);

    // Aynı dofUuid, FARKLI exportUuid (çelişen replay identity) -- ikinci import.
    const celisenPaket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid, exportUuid: require('./dof-import-fixtures').sentetikUuidV4() })],
    });
    const celisenImport = await dofIceriAktarDene(page, celisenPaket);
    expect(celisenImport.basarili).toBe(false);
    expect(celisenImport.kod).toBe('IMPORT_CONFLICT');

    const kayitSonra = await dofKaydiGetir(page, dofUuid);
    expect(kayitSonra.exportUuid).toBe(ilkPaket.tehlikeler[0].exportUuid);   // ORİJİNAL export kimliği korundu
    expect(kayitSonra.takipTaslagi).toEqual({ sorumlu: 'X' });
    expect(kayitSonra.replayHazirlik).toEqual(hazirlik.sonuc.replayHazirlik);

    // Mevcut kayıtla hazırlanmış ZIP hâlâ aynı JSON'u üretiyor (kırılmadı).
    const zipSonrasi = await replayZipUret(page, [dofUuid]);
    expect(zipSonrasi.basarili).toBe(true);
    expect(zipDofDonusMetni(zipSonrasi.zipB64)).toBe(metinOncesi);
  });

  test('I. Legacy WIP zincire giremez -- taslak/hazırlık/ZIP üçü de KANONIK_DOF_DEGIL, kayıt değişmez', async ({ page }) => {
    const crypto = require('crypto');
    const uuidBenzeriId = crypto.randomUUID();
    const wipKayit = {
      id: uuidBenzeriId, dofId: 601, bulguKodu: 'B-1', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const taslakSonucu = await taslakGuncelleDene(page, uuidBenzeriId, { sorumlu: 'X' });
    expect(taslakSonucu.basarili).toBe(false);
    expect(taslakSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const hazirlikSonucu = await hazirlaDene(page, uuidBenzeriId);
    expect(hazirlikSonucu.basarili).toBe(false);
    expect(hazirlikSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const zipSonucu = await replayZipUret(page, [uuidBenzeriId]);
    expect(zipSonucu.basarili).toBe(false);
    expect(zipSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const kayitSonra = await dofKaydiGetir(page, uuidBenzeriId);
    expect(kayitSonra).toEqual(wipKayit);
  });

  test('J. Salt-okunur üretim -- happy path öncesi/sonrası tüm dofler kayıtları birebir aynı', async ({ page }) => {
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

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);   // replayHazirlik/takipTaslagi/kimlikler değişmedi
  });
});
