// PWA Commit 3B -- Desktop replay-v2 DÖF export paketinin PWA'da
// doğrulanması + `dofler` store'una atomik/idempotent kaydedilmesi.
// UI YOKTUR -- yalnız `window._dofImport.dofPaketiIceriAktar` production
// servis fonksiyonu gerçek IndexedDB üzerinden test edilir (mock yok).
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (yalnız bu dosya -- `l-indexeddb-migration.spec.js`
// ile aynı, ticket'in kendi izniyle kurulmuş desen; global `workers: 4`
// tavanı DEĞİŞTİRİLMEDİ).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi, sentetikUuidV4 } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

async function doflerTumu(page) {
  return page.evaluate(async () => window._idb.dbTumu('dofler'));
}

test.describe('M. DÖF replay-v2 içe aktarma', () => {
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

  test('A. Gerçek sözleşmeye uygun geçerli paket -- iki kayıt, kimlikler ve index sorguları doğru', async ({ page }) => {
    const paket = gecerliDofPaketi();
    const sonuc = await dofIceriAktarDene(page, paket);

    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc).toEqual({ toplam: 2, eklenen: 2, degismeyen: 0 });

    const kayitlar = await doflerTumu(page);
    expect(kayitlar.length).toBe(2);

    const k1 = kayitlar.find((k) => k.dofId === 1);
    const k2 = kayitlar.find((k) => k.dofId === 2);
    expect(k1.id).toBe(paket.tehlikeler[0].dofUuid);
    expect(k1.dofUuid).toBe(paket.tehlikeler[0].dofUuid);
    expect(k1.exportUuid).toBe(paket.tehlikeler[0].exportUuid);
    expect(k1.paketUuid).toBe(paket.paketUuid);
    expect(k1.replayVersion).toBe(2);
    expect(k1.baseStateHash).toBe(paket.tehlikeler[0].baseStateHash);
    expect(k1.aktifTurSirasi).toBe(1);
    expect(k1.birimId).toBe('birim-sentetik-1');
    expect(typeof k1.iceAktarilmaZamani).toBe('string');

    // null konum/derece alanları BOZULMADI (boş stringe dönüştürülmedi).
    expect(k2.odaId).toBe(null);
    expect(k2.kurumId).toBe(null);
    expect(k2.birimId).toBe(null);
    expect(k2.riskKodu).toBe(null);
    expect(k2.riskDuzeyi).toBe(null);
    expect(k2.r).toBe(null);

    const birimSorgusu = await page.evaluate(async () => window._idb.dbIndexTumu('dofler', 'birimId', 'birim-sentetik-1'));
    expect(birimSorgusu.length).toBe(1);
    expect(birimSorgusu[0].dofId).toBe(1);

    const dofUuidSorgusu = await page.evaluate(async (u) => window._idb.dbIndexTumu('dofler', 'dofUuid', u), k1.dofUuid);
    expect(dofUuidSorgusu.length).toBe(1);
    expect(dofUuidSorgusu[0].id).toBe(k1.id);
  });

  test('B. JSON metni desteği -- nesne ve JSON string aynı kanonik sonucu üretir', async ({ page }) => {
    const paket = gecerliDofPaketi();

    const nesneSonuc = await dofIceriAktarDene(page, paket);
    expect(nesneSonuc.basarili).toBe(true);
    expect(nesneSonuc.sonuc).toEqual({ toplam: 2, eklenen: 2, degismeyen: 0 });

    // AYNI paket JSON METNİ olarak tekrar verilir -- içerik (kimlik alanları)
    // birebir aynı olduğundan idempotent "degismeyen" olarak tanınmalı; bu,
    // nesne ve string yollarının AYNI doğrulama/depolama mantığına
    // ulaştığının kanıtıdır (farklı davranmıyorlar).
    const stringSonuc = await dofIceriAktarDene(page, JSON.stringify(paket));
    expect(stringSonuc.basarili).toBe(true);
    expect(stringSonuc.sonuc).toEqual({ toplam: 2, eklenen: 0, degismeyen: 2 });

    const kayitlar = await doflerTumu(page);
    expect(kayitlar.length).toBe(2);
  });

  test('C. Exact duplicate import -- ikinci import yeni kayıt oluşturmaz, iceAktarilmaZamani değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi();
    await dofIceriAktarDene(page, paket);
    const ilkKayitlar = await doflerTumu(page);
    const ilkZamanlar = Object.fromEntries(ilkKayitlar.map((k) => [k.id, k.iceAktarilmaZamani]));

    const ikinciSonuc = await dofIceriAktarDene(page, paket);
    expect(ikinciSonuc.basarili).toBe(true);
    expect(ikinciSonuc.sonuc).toEqual({ toplam: 2, eklenen: 0, degismeyen: 2 });

    const sonKayitlar = await doflerTumu(page);
    expect(sonKayitlar.length).toBe(2);
    for (const k of sonKayitlar) {
      expect(k.iceAktarilmaZamani).toBe(ilkZamanlar[k.id]);
    }
  });

  test('D. Paket içi duplicate -- reddedilir, hiçbir kayıt oluşmaz', async ({ page }) => {
    const ortakDofUuid = sentetikUuidV4();
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, dofUuid: ortakDofUuid }),
        gecerliDofKaydi({ dofId: 2, dofUuid: ortakDofUuid }),
      ],
    });

    const sonuc = await dofIceriAktarDene(page, paket);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('PAKET_ICI_DUPLICATE');

    expect(await doflerTumu(page)).toEqual([]);
  });

  test('E. Eksik zorunlu kimlikler -- her biri reddedilir, kısmi kayıt kalmaz', async ({ page }) => {
    const senaryolar = [
      { ad: 'dofUuid eksik', kodBeklenen: 'EKSIK_KIMLIK', paketUret: () => gecerliDofPaketi({ tehlikelerOverride: [{ ...gecerliDofKaydi(), dofUuid: undefined }] }) },
      { ad: 'exportUuid eksik', kodBeklenen: 'EKSIK_KIMLIK', paketUret: () => gecerliDofPaketi({ tehlikelerOverride: [{ ...gecerliDofKaydi(), exportUuid: undefined }] }) },
      { ad: 'baseStateHash eksik', kodBeklenen: 'EKSIK_KIMLIK', paketUret: () => gecerliDofPaketi({ tehlikelerOverride: [{ ...gecerliDofKaydi(), baseStateHash: undefined }] }) },
      { ad: 'aktifTurSirasi eksik', kodBeklenen: 'EKSIK_KIMLIK', paketUret: () => gecerliDofPaketi({ tehlikelerOverride: [{ ...gecerliDofKaydi(), aktifTurSirasi: undefined }] }) },
      { ad: 'paketUuid eksik (üst seviye)', kodBeklenen: 'GECERSIZ_PAKET', paketUret: () => { const p = gecerliDofPaketi(); delete p.paketUuid; return p; } },
    ];

    for (const s of senaryolar) {
      const sonuc = await dofIceriAktarDene(page, s.paketUret());
      expect(sonuc.basarili, s.ad).toBe(false);
      expect(sonuc.kod, s.ad).toBe(s.kodBeklenen);
    }

    expect(await doflerTumu(page)).toEqual([]);
  });

  test('F. Yanlış sürümler -- üst paket sürümü ve replayVersion reddedilir', async ({ page }) => {
    const yanlisSurum = gecerliDofPaketi();
    yanlisSurum.surum = 2;
    const s1 = await dofIceriAktarDene(page, yanlisSurum);
    expect(s1.basarili).toBe(false);
    expect(s1.kod).toBe('DESTEKLENMEYEN_SURUM');

    const yanlisReplay = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ replayVersion: 1 })] });
    const s2 = await dofIceriAktarDene(page, yanlisReplay);
    expect(s2.basarili).toBe(false);
    expect(s2.kod).toBe('DESTEKLENMEYEN_REPLAY_VERSION');

    expect(await doflerTumu(page)).toEqual([]);
  });

  test('G. Legacy paket reddi -- yanlış paket aileleri kabul edilmez', async ({ page }) => {
    const senaryolar = [
      {
        ad: 'embedded dofKontrolleri (replay dönüş paketi)',
        paket: { paketUuid: sentetikUuidV4(), dofKontrolleri: [{ dofId: 1, sonuc: 'duzeldi' }] },
      },
      {
        ad: 'WIP sonuc/kontrolNotu/fotolar yapısı',
        paket: { dofId: 1, sonuc: 'duzeldi', kontrolNotu: 'not', fotolar: [], zaman: new Date().toISOString() },
      },
      {
        ad: 'normal denetim ZIP zarfı (denetim/tespitler/manifest)',
        paket: { denetim: {}, tespitler: [], manifest: {} },
      },
      {
        ad: 'dof_donus.json replay dönüş yapısı',
        paket: { paketUuid: sentetikUuidV4(), dofKontrolleri: [] },
      },
    ];

    for (const s of senaryolar) {
      const sonuc = await dofIceriAktarDene(page, s.paket);
      expect(sonuc.basarili, s.ad).toBe(false);
      expect(sonuc.kod, s.ad).toBe('GECERSIZ_PAKET');
    }

    expect(await doflerTumu(page)).toEqual([]);
  });

  test('H. Explicit allowlist -- fazladan/legacy alanlar kayda taşınmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({
        durum: 'kapali',
        sonuc: 'duzeldi',
        kontrolNotu: 'gizli not',
        fotolar: ['f1.jpg'],
        sesler: ['s1.webm'],
        dofKontrolleri: [{ x: 1 }],
        bilinmeyenAlan: 'sızmamalı',
      })],
    });

    const sonuc = await dofIceriAktarDene(page, paket);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.eklenen).toBe(1);

    const kayitlar = await doflerTumu(page);
    expect(kayitlar.length).toBe(1);
    const k = kayitlar[0];
    for (const yasakliAlan of ['durum', 'sonuc', 'kontrolNotu', 'fotolar', 'sesler', 'dofKontrolleri', 'bilinmeyenAlan']) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakliAlan), yasakliAlan).toBe(false);
    }
  });

  test('I. Existing record conflict -- çelişen ikinci paket reddedilir, mevcut kayıt değişmez', async ({ page }) => {
    const dofUuid = sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofUuid })] });
    const ilkSonuc = await dofIceriAktarDene(page, ilkPaket);
    expect(ilkSonuc.basarili).toBe(true);

    const oncekiKayit = (await doflerTumu(page))[0];

    const celisenPaket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofUuid, exportUuid: sentetikUuidV4() })],
    });
    const ikinciSonuc = await dofIceriAktarDene(page, celisenPaket);
    expect(ikinciSonuc.basarili).toBe(false);
    expect(ikinciSonuc.kod).toBe('IMPORT_CONFLICT');

    const sonKayitlar = await doflerTumu(page);
    expect(sonKayitlar.length).toBe(1);
    expect(sonKayitlar[0]).toEqual(oncekiKayit);
  });

  test('J. Paket atomikliği -- conflict içeren paket TAMAMEN reddedilir, yeni kayıt bile yazılmaz', async ({ page }) => {
    const mevcutDofUuid = sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid: mevcutDofUuid })] });
    await dofIceriAktarDene(page, ilkPaket);
    const oncekiKayit = (await doflerTumu(page))[0];

    const yeniDofUuid = sentetikUuidV4();
    const karisikPaket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 2, dofUuid: yeniDofUuid }),                                   // yeni, çelişkisiz
        gecerliDofKaydi({ dofId: 1, dofUuid: mevcutDofUuid, exportUuid: sentetikUuidV4() }),    // mevcutla çelişiyor
      ],
    });

    const sonuc = await dofIceriAktarDene(page, karisikPaket);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('IMPORT_CONFLICT');

    const sonKayitlar = await doflerTumu(page);
    expect(sonKayitlar.length).toBe(1);   // yeni DÖF YAZILMADI
    expect(sonKayitlar[0]).toEqual(oncekiKayit);   // mevcut DÖF DEĞİŞMEDİ
    expect(sonKayitlar.some((k) => k.dofUuid === yeniDofUuid)).toBe(false);
  });

  test('K1. Legacy WIP kayıt koruması -- normal (id çakışmasız) durumda WIP kaydı bozulmaz', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_1', dofId: 101, bulguKodu: 'B-1',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null, fotolar: [],
      birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const paket = gecerliDofPaketi();
    const sonuc = await dofIceriAktarDene(page, paket);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.eklenen).toBe(2);

    const kayitlar = await doflerTumu(page);
    expect(kayitlar.length).toBe(3);   // 1 WIP + 2 kanonik
    const wipSonra = kayitlar.find((k) => k.id === 'dof_wip_1');
    expect(wipSonra).toEqual(wipKayit);   // WIP kaydı BİREBİR korunmuş
  });

  test('K2. Legacy WIP kayıt koruması -- yapay id çakışması conflict olarak reddedilir, WIP değişmez', async ({ page }) => {
    const cakisanId = sentetikUuidV4();
    const wipKayit = {
      id: cakisanId, dofId: 202, bulguKodu: 'B-2',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null, fotolar: [],
      birimId: 'birim-wip',
      // Bilerek exportUuid/baseStateHash/aktifTurSirasi/replayVersion YOK
      // -- gerçek WIP kaydı bu alanları hiç yazmıyordu.
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofUuid: cakisanId })] });
    const sonuc = await dofIceriAktarDene(page, paket);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('IMPORT_CONFLICT');

    const kayitlar = await doflerTumu(page);
    expect(kayitlar.length).toBe(1);
    expect(kayitlar[0]).toEqual(wipKayit);   // WIP kaydı DEĞİŞMEDİ, yeni kayıt YAZILMADI
  });
});
