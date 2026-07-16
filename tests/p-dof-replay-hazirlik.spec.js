// PWA Commit 4C -- replay submission UUID yaşam döngüsü ve yerel replay
// hazırlık metadata'sı (`dofReplayHazirlikGetir/Hazirla/Temizle` +
// `dofDonusGirdileriHazirla`). ZIP/medya/UI YOKTUR -- gerçek IndexedDB
// üzerinden `window._dofImport` test köprüsüyle test edilir.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki dosyalarla aynı desen).
const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

const UUID_V4_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64_DESENI = /^[0-9a-f]{64}$/;

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

async function hazirlikGetirDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofReplayHazirlikGetir(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

async function hazirlikTemizleDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofReplayHazirlikTemizle(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

async function girdileriHazirlaDene(page, dofUuidListesi) {
  return page.evaluate(async (liste) => {
    try {
      const sonuc = await window._dofImport.dofDonusGirdileriHazirla(liste);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuidListesi);
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

async function tumDoflerGetir(page) {
  return page.evaluate(async () => window._idb.dbTumu('dofler'));
}

/** Kayda doğrudan (servis dışı) taslak yerleştirir -- savunmacı doğrulama
 * ve key-order testleri için. Değer NaN gibi JSON'a taşınamayan tipler
 * gerektiriyorsa `sayfaIciKurulum` metni sayfa bağlamında çalıştırılır. */
async function taslakDogrudanYaz(page, dofUuid, taslak) {
  await page.evaluate(async ({ u, t }) => {
    const kayit = await window._idb.dbGetir('dofler', u);
    await window._idb.dbGuncelle('dofler', { ...kayit, takipTaslagi: t });
  }, { u: dofUuid, t: taslak });
}

/** Tek kanonik DÖF import edip dofUuid'ini döner. */
async function tekDofKur(page, dofId = 1) {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId })] });
  await dofIceriAktarDene(page, paket);
  return paket.tehlikeler[0].dofUuid;
}

test.describe('P. DÖF replay hazırlık kimliği (submission UUID yaşam döngüsü)', () => {
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

  test('A. Hazırlık oluşturma -- UUIDv4 üretilir, metadata eklenir, taslak/kimlikler değişmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'Pano kapatildi' });
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const sonuc = await hazirlaDene(page, dofUuid);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.durum).toBe('olusturuldu');
    expect(sonuc.sonuc.replayHazirlik.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(sonuc.sonuc.replayHazirlik.taslakParmakIzi).toMatch(HEX64_DESENI);
    expect(typeof sonuc.sonuc.replayHazirlik.olusturulmaZamani).toBe('string');
    expect(sonuc.sonuc.replayHazirlik.guncellenmeZamani).toBe(sonuc.sonuc.replayHazirlik.olusturulmaZamani);

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit.replayHazirlik).toEqual(sonuc.sonuc.replayHazirlik);
    // replayHazirlik dışındaki TÜM alanlar (takipTaslagi, kimlikler,
    // taslakGuncellenmeZamani, iceAktarilmaZamani, snapshot) birebir aynı.
    for (const alan of Object.keys(oncekiKayit)) {
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }
    const degisenAlanlar = Object.keys(sonKayit).filter((a) => JSON.stringify(sonKayit[a]) !== JSON.stringify(oncekiKayit[a]));
    expect(degisenAlanlar).toEqual(['replayHazirlik']);
  });

  test('B. Aynı taslakta idempotency -- aynı submissionUuid/parmakIzi, guncellenmeZamani değişmez', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const ilk = await hazirlaDene(page, dofUuid);
    expect(ilk.sonuc.durum).toBe('olusturuldu');

    const ikinci = await hazirlaDene(page, dofUuid);
    expect(ikinci.basarili).toBe(true);
    expect(ikinci.sonuc.durum).toBe('degismedi');
    expect(ikinci.sonuc.replayHazirlik).toEqual(ilk.sonuc.replayHazirlik);   // UUID + parmak izi + zamanlar birebir aynı

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.replayHazirlik).toEqual(ilk.sonuc.replayHazirlik);
    const tumKayitlar = await tumDoflerGetir(page);
    expect(tumKayitlar.length).toBe(1);
  });

  test('C. Taslak değişince yeni submission -- yeni parmakIzi + yeni UUID, olusturulmaZamani korunur', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ilk = await hazirlaDene(page, dofUuid);
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Mehmet' });   // gerçek değişiklik
    const ikinci = await hazirlaDene(page, dofUuid);
    expect(ikinci.basarili).toBe(true);
    expect(ikinci.sonuc.durum).toBe('yenilendi');
    expect(ikinci.sonuc.replayHazirlik.taslakParmakIzi).not.toBe(ilk.sonuc.replayHazirlik.taslakParmakIzi);
    expect(ikinci.sonuc.replayHazirlik.submissionUuid).not.toBe(ilk.sonuc.replayHazirlik.submissionUuid);
    expect(ikinci.sonuc.replayHazirlik.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(ikinci.sonuc.replayHazirlik.olusturulmaZamani).toBe(ilk.sonuc.replayHazirlik.olusturulmaZamani);   // korunur

    // Imported kimlikler ve taslak değişmedi (taslak zaten Guncelle ile değişti -- burada hazırlığın dokunmadığını doğruluyoruz).
    const sonKayit = await dofKaydiGetir(page, dofUuid);
    for (const alan of ['id', 'dofUuid', 'exportUuid', 'paketUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'iceAktarilmaZamani']) {
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }
    expect(sonKayit.takipTaslagi).toEqual({ sorumlu: 'Mehmet' });
  });

  test('D. Explicit null fingerprint -- {sorumlu:null} geçerli taslaktır ve absent ile aynı parmak izini ÜRETMEZ', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt, aynı paket
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;

    // DÖF1: yalnız explicit null temizleme talebi -- GEÇERLİ taslak.
    await taslakGuncelleDene(page, uuid1, { sorumlu: null });
    const h1 = await hazirlaDene(page, uuid1);
    expect(h1.basarili).toBe(true);
    expect(h1.sonuc.replayHazirlik.taslakParmakIzi).toMatch(HEX64_DESENI);

    // DÖF2: sorumlu ABSENT (dokunulmamış), başka alan dolu.
    await taslakGuncelleDene(page, uuid2, { gerceklesen_faaliyet: 'X' });
    const h2 = await hazirlaDene(page, uuid2);
    expect(h2.basarili).toBe(true);

    // {sorumlu:null} != {gerceklesen_faaliyet:'X'} -- farklı parmak izi.
    expect(h1.sonuc.replayHazirlik.taslakParmakIzi).not.toBe(h2.sonuc.replayHazirlik.taslakParmakIzi);

    // Aynı DÖF'te {sorumlu:null, g:'X'} ile {g:'X'} (sorumlu absent) parmak izi FARKLI:
    await taslakGuncelleDene(page, uuid2, { sorumlu: null });   // artık {sorumlu:null, gerceklesen_faaliyet:'X'}
    const h2b = await hazirlaDene(page, uuid2);
    expect(h2b.sonuc.durum).toBe('yenilendi');   // absent -> explicit null GERÇEK değişikliktir
    expect(h2b.sonuc.replayHazirlik.taslakParmakIzi).not.toBe(h2.sonuc.replayHazirlik.taslakParmakIzi);
  });

  test('E. Key order determinism -- aynı semantik taslak farklı anahtar sırasıyla aynı parmak izini üretir', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;

    // Aynı içerik, doğrudan DB'ye FARKLI anahtar sırasıyla yazılır
    // (değerler kanonik normalize biçimde -- savunmacı doğrulamayı geçer).
    await taslakDogrudanYaz(page, uuid1, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'X' });
    await taslakDogrudanYaz(page, uuid2, { gerceklesen_faaliyet: 'X', sorumlu: 'Ahmet' });

    const h1 = await hazirlaDene(page, uuid1);
    const h2 = await hazirlaDene(page, uuid2);
    expect(h1.basarili).toBe(true);
    expect(h2.basarili).toBe(true);
    expect(h1.sonuc.replayHazirlik.taslakParmakIzi).toBe(h2.sonuc.replayHazirlik.taslakParmakIzi);
    // submissionUuid'ler elbette farklı (iki ayrı DÖF).
    expect(h1.sonuc.replayHazirlik.submissionUuid).not.toBe(h2.sonuc.replayHazirlik.submissionUuid);
  });

  test('F. O/F/S validasyonu -- geçerli üçlü ve tam-null üçlü hazırlanabilir, kısmi üçlü reddedilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);

    await taslakGuncelleDene(page, dofUuid, { yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    const sayisal = await hazirlaDene(page, dofUuid);
    expect(sayisal.basarili).toBe(true);

    await taslakGuncelleDene(page, dofUuid, { yeni_o: null, yeni_f: null, yeni_s: null });
    const tamNull = await hazirlaDene(page, dofUuid);
    expect(tamNull.basarili).toBe(true);
    expect(tamNull.sonuc.durum).toBe('yenilendi');   // taslak değişti -> yeni kimlik

    // Kısmi üçlü yalnız doğrudan DB manipülasyonuyla oluşabilir (servis reddeder).
    await taslakDogrudanYaz(page, dofUuid, { yeni_o: 0.2 });
    const kismi = await hazirlaDene(page, dofUuid);
    expect(kismi.basarili).toBe(false);
    expect(kismi.kod).toBe('GECERSIZ_TAKIP_TASLAGI');
  });

  test('G. Boş taslak reddi -- taslak yok ve {} durumları BOS_TAKIP_TASLAGI', async ({ page }) => {
    const dofUuid = await tekDofKur(page);

    const taslaksiz = await hazirlaDene(page, dofUuid);
    expect(taslaksiz.basarili).toBe(false);
    expect(taslaksiz.kod).toBe('BOS_TAKIP_TASLAGI');

    await taslakDogrudanYaz(page, dofUuid, {});
    const bosObje = await hazirlaDene(page, dofUuid);
    expect(bosObje.basarili).toBe(false);
    expect(bosObje.kod).toBe('BOS_TAKIP_TASLAGI');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.replayHazirlik).toBeUndefined();   // hiçbir hazırlık yazılmadı
  });

  test('H. Bozuk taslak reddi -- unknown alan/object metin/geçersiz Fine-Kinney/NaN', async ({ page }) => {
    const dofUuid = await tekDofKur(page);

    const bozukTaslaklar = [
      { ad: 'bilinmeyen alan', taslak: { sorumlu: 'x', bilinmeyenAlan: 'y' } },
      { ad: 'object tipli metin', taslak: { sorumlu: { x: 1 } } },
      { ad: 'geçersiz Fine-Kinney', taslak: { yeni_o: 99, yeni_f: 3, yeni_s: 1 } },
    ];
    for (const { ad, taslak } of bozukTaslaklar) {
      await taslakDogrudanYaz(page, dofUuid, taslak);
      const sonuc = await hazirlaDene(page, dofUuid);
      expect(sonuc.basarili, ad).toBe(false);
      expect(sonuc.kod, ad).toBe('GECERSIZ_TAKIP_TASLAGI');
    }

    // NaN/Infinity JSON üzerinden taşınamaz -- sayfa bağlamında kurulur.
    const nanSonucu = await page.evaluate(async (u) => {
      const kayit = await window._idb.dbGetir('dofler', u);
      await window._idb.dbGuncelle('dofler', { ...kayit, takipTaslagi: { yeni_o: NaN, yeni_f: Infinity, yeni_s: 1 } });
      try {
        await window._dofImport.dofReplayHazirlikHazirla(u);
        return { basarili: true };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    }, dofUuid);
    expect(nanSonucu.basarili).toBe(false);
    expect(nanSonucu.kod).toBe('GECERSIZ_TAKIP_TASLAGI');
  });

  test('I. Legacy WIP reddi -- Getir/Hazirla/Temizle üçü de KANONIK_DOF_DEGIL, kayıt değişmez', async ({ page }) => {
    const uuidBenzeriId = crypto.randomUUID();
    const wipKayit = {
      id: uuidBenzeriId, dofId: 401, bulguKodu: 'B-1', durum: 'bekliyor', birimId: 'birim-wip',
      takipTaslagi: { sorumlu: 'Test' },   // legacy üzerinde taslak/hazırlık dursa bile dokunulmamalı
      replayHazirlik: { submissionUuid: 'sahte', taslakParmakIzi: 'sahte' },
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    for (const [ad, dene] of [['Getir', hazirlikGetirDene], ['Hazirla', hazirlaDene], ['Temizle', hazirlikTemizleDene]]) {
      const sonuc = await dene(page, uuidBenzeriId);
      expect(sonuc.basarili, ad).toBe(false);
      expect(sonuc.kod, ad).toBe('KANONIK_DOF_DEGIL');
    }

    const kayitSonra = await dofKaydiGetir(page, uuidBenzeriId);
    expect(kayitSonra).toEqual(wipKayit);   // sahte hazırlık dahil, birebir korunmuş
  });

  test('J. Hazırlık getir -- yokken null, varken bağımsız kopya (mutasyon DB\'yi etkilemez)', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const yokken = await hazirlikGetirDene(page, dofUuid);
    expect(yokken.basarili).toBe(true);
    expect(yokken.sonuc.replayHazirlik).toBe(null);

    await hazirlaDene(page, dofUuid);
    const mutasyonSonrasi = await page.evaluate(async (u) => {
      const h1 = await window._dofImport.dofReplayHazirlikGetir(u);
      h1.replayHazirlik.submissionUuid = 'MUTASYON';
      h1.replayHazirlik.sahteAlan = 'sızma';
      const h2 = await window._dofImport.dofReplayHazirlikGetir(u);
      return h2.replayHazirlik;
    }, dofUuid);
    expect(mutasyonSonrasi.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(mutasyonSonrasi.submissionUuid).not.toBe('MUTASYON');
    expect(mutasyonSonrasi.sahteAlan).toBeUndefined();
  });

  test('K. Hazırlık temizle -- yalnız replayHazirlik kalkar, taslak/kimlikler kalır, ikinci temizleme idempotent', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await hazirlaDene(page, dofUuid);
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);
    expect(oncekiKayit.replayHazirlik).toBeTruthy();

    const temizle = await hazirlikTemizleDene(page, dofUuid);
    expect(temizle.basarili).toBe(true);
    expect(temizle.sonuc.durum).toBe('temizlendi');

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit.replayHazirlik).toBeUndefined();
    expect(sonKayit.takipTaslagi).toEqual(oncekiKayit.takipTaslagi);   // taslak KALDI
    for (const alan of Object.keys(sonKayit)) {
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }

    const ikinciTemizle = await hazirlikTemizleDene(page, dofUuid);
    expect(ikinciTemizle.basarili).toBe(true);
    expect(ikinciTemizle.sonuc.durum).toBe('degismedi');   // idempotent no-op
  });

  test('L. Belge girdisi hazırlama -- sıra korunur, hazırlıksız kayıt REPLAY_HAZIRLIK_YOK', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'B' });
    const h1 = await hazirlaDene(page, uuid1);
    const h2 = await hazirlaDene(page, uuid2);

    // Ters sırayla iste -- çıktı sırası girdi sırasını korumalı.
    const girdiler = await girdileriHazirlaDene(page, [uuid2, uuid1]);
    expect(girdiler.basarili).toBe(true);
    expect(girdiler.sonuc).toEqual([
      { dofUuid: uuid2, submissionUuid: h2.sonuc.replayHazirlik.submissionUuid },
      { dofUuid: uuid1, submissionUuid: h1.sonuc.replayHazirlik.submissionUuid },
    ]);

    // Hazırlığı temizlenen kayıt için REPLAY_HAZIRLIK_YOK.
    await hazirlikTemizleDene(page, uuid1);
    const eksikSonuc = await girdileriHazirlaDene(page, [uuid2, uuid1]);
    expect(eksikSonuc.basarili).toBe(false);
    expect(eksikSonuc.kod).toBe('REPLAY_HAZIRLIK_YOK');
  });

  test('M. Dönüş belgesi entegrasyonu -- hazırlık kimliğiyle geçerli belge üretilir', async ({ page }) => {
    const dofUuid = await tekDofKur(page);
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    await hazirlaDene(page, dofUuid);

    const belgeSonucu = await page.evaluate(async (u) => {
      const girdiler = await window._dofImport.dofDonusGirdileriHazirla([u]);
      const belge = await window._dofImport.dofDonusBelgesiOlustur(girdiler);
      return { girdiler, belge };
    }, dofUuid);

    const k = belgeSonucu.belge.dofKontrolleri[0];
    expect(k.submissionUuid).toBe(belgeSonucu.girdiler[0].submissionUuid);
    expect(k.submissionUuid).toMatch(UUID_V4_DESENI);
    expect(k.sorumlu).toBe('Ahmet');
    expect(k.replayVersion).toBe(2);

    // Belge üretimi hazırlık kimliğini DEĞİŞTİRMEZ, yeni UUID üretmez:
    // ikinci uçtan uca üretim birebir aynı belgeyi verir.
    const ikinci = await page.evaluate(async (u) => {
      const girdiler = await window._dofImport.dofDonusGirdileriHazirla([u]);
      return window._dofImport.dofDonusBelgesiOlustur(girdiler);
    }, dofUuid);
    expect(ikinci).toEqual(belgeSonucu.belge);
  });

  test('N. Salt-okunur davranış -- Getir ve GirdileriHazirla DB\'ye yazmaz', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'B' });
    await hazirlaDene(page, uuid1);
    await hazirlaDene(page, uuid2);

    const oncekiTumKayitlar = await tumDoflerGetir(page);

    await hazirlikGetirDene(page, uuid1);
    await hazirlikGetirDene(page, uuid2);
    await girdileriHazirlaDene(page, [uuid1, uuid2]);
    // Idempotent Hazirla da (aynı taslak) yazma yapmamalı.
    const tekrar = await hazirlaDene(page, uuid1);
    expect(tekrar.sonuc.durum).toBe('degismedi');

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);
  });
});
