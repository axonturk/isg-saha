// PWA Commit 4B -- kanonik replay-v2 DÖF dönüş belgesi üretim çekirdeği
// (`dofDonusBelgesiOlustur`/`dofDonusJsonOlustur`). UI/ZIP/medya YOKTUR --
// gerçek IndexedDB üzerinden `window._dofImport` test köprüsüyle test
// edilir. SALT-OKUNUR bir üretim çekirdeği test edildiği için DB durumu
// testler arasında yalnız import/taslak adımlarıyla değişir, üretim
// fonksiyonlarının kendisi hiçbir zaman DB'yi değiştirmemelidir.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki dosyalarla aynı desen).
const crypto = require('crypto');
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

async function donusJsonDene(page, girdiler) {
  return page.evaluate(async (g) => {
    try {
      const json = await window._dofImport.dofDonusJsonOlustur(g);
      return { basarili: true, json };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, girdiler);
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

async function tumDoflerGetir(page) {
  return page.evaluate(async () => window._idb.dbTumu('dofler'));
}

test.describe('O. DÖF dönüş belgesi üretimi (replay-v2, medyasız)', () => {
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

  test('A. Tek geçerli DÖF -- tam taslak, üst zarf ve kimlikler doğru', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const tamDegerler = {
      planlanan_tarih: '2026-07-15', sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi',
      etkinlik_kontrol_tarihi: '2026-09-05', gozlem_degerlendirme: 'Kontrol edildi, uygun.',
      yeni_o: 0.2, yeni_f: 3, yeni_s: 1,
    };
    await taslakGuncelleDene(page, dofUuid, tamDegerler);
    const kayit = await dofKaydiGetir(page, dofUuid);

    const submissionUuid = crypto.randomUUID();
    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid }]);
    expect(sonuc.basarili).toBe(true);

    expect(sonuc.belge.paketUuid).toBe(kayit.paketUuid);
    expect(sonuc.belge.dofKontrolleri.length).toBe(1);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.dofUuid).toBe(kayit.dofUuid);
    expect(k.exportUuid).toBe(kayit.exportUuid);
    expect(k.baseStateHash).toBe(kayit.baseStateHash);
    expect(k.aktifTurSirasi).toBe(kayit.aktifTurSirasi);
    expect(k.replayVersion).toBe(2);
    expect(k.dofId).toBe(kayit.dofId);
    expect(k.submissionUuid).toBe(submissionUuid);
    for (const alan of Object.keys(tamDegerler)) {
      expect(k[alan], alan).toBe(tamDegerler[alan]);
    }
  });

  test('B. Partial taslak -- yalnız doldurulan alanlar belgede bulunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'Pano kapatildi' });

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('Ahmet');
    expect(k.gerceklesen_faaliyet).toBe('Pano kapatildi');

    const digerAltiAlan = ['planlanan_tarih', 'etkinlik_kontrol_tarihi', 'gozlem_degerlendirme', 'yeni_o', 'yeni_f', 'yeni_s'];
    for (const alan of digerAltiAlan) {
      expect(Object.prototype.hasOwnProperty.call(k, alan), alan).toBe(false);
    }
  });

  test('C. Null takip alanı politikası (bilinçli tasarım kararı) -- null HER ZAMAN atlanır', async ({ page }) => {
    // BİLİNÇLİ SAPMA: Commit 4A/4A-1'in `takipTaslagi` şeması "hiç
    // dokunulmamış" ile "dokunulup sonra explicit null'a temizlenmiş"
    // alanı AYNI (`null`) değerle temsil eder -- bu ikisi mevcut şemadan
    // AYIRT EDİLEMEZ, ve bu commit o şemayı değiştirmeye yetkili değil.
    // "Tüm alanları (null dahil) her zaman belgeye koy" seçeneği GERÇEK
    // bir veri bütünlüğü riski taşırdı (kullanıcının hiç dokunmadığı bir
    // alanı yanlışlıkla Desktop tarafında sıfırlardı -- Desktop dict-diff
    // semantiği: anahtar mevcut + null = temizle). Bu yüzden GÜVENLİ
    // seçenek uygulandı: null değerli takip alanları HER ZAMAN atlanır.
    // Bu test, bu bilinçli davranışı kilitler -- bkz. commit raporu.
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await taslakGuncelleDene(page, dofUuid, { sorumlu: null, gerceklesen_faaliyet: 'Kalici deger' });

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    expect(Object.prototype.hasOwnProperty.call(k, 'sorumlu')).toBe(false);   // null -> atlandı, temizlenmiş VEYA hiç dokunulmamış ayrımı yapılmıyor
    expect(k.gerceklesen_faaliyet).toBe('Kalici deger');
  });

  test('D. Birden fazla DÖF -- aynı paketUuid, girdi sırası korunur, kayıtlar birbirini etkilemez', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt (dofId 1, 2), aynı paketUuid
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Birinci' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'Ikinci' });

    const sub1 = crypto.randomUUID();
    const sub2 = crypto.randomUUID();
    const sonuc = await donusBelgesiDene(page, [{ dofUuid: uuid1, submissionUuid: sub1 }, { dofUuid: uuid2, submissionUuid: sub2 }]);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.belge.dofKontrolleri.length).toBe(2);
    expect(sonuc.belge.dofKontrolleri[0].dofUuid).toBe(uuid1);
    expect(sonuc.belge.dofKontrolleri[0].submissionUuid).toBe(sub1);
    expect(sonuc.belge.dofKontrolleri[0].sorumlu).toBe('Birinci');
    expect(sonuc.belge.dofKontrolleri[1].dofUuid).toBe(uuid2);
    expect(sonuc.belge.dofKontrolleri[1].submissionUuid).toBe(sub2);
    expect(sonuc.belge.dofKontrolleri[1].sorumlu).toBe('Ikinci');
  });

  test('E. Karışık export paketleri -- farklı paketUuid reddedilir', async ({ page }) => {
    const paket1 = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket1);
    const paket2 = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 2 })] });   // farklı paketUuid (sentetikUuidV4 sayaç ilerler)
    await dofIceriAktarDene(page, paket2);

    const uuid1 = paket1.tehlikeler[0].dofUuid;
    const uuid2 = paket2.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'B' });

    expect(paket1.paketUuid).not.toBe(paket2.paketUuid);

    const sonuc = await donusBelgesiDene(page, [
      { dofUuid: uuid1, submissionUuid: crypto.randomUUID() },
      { dofUuid: uuid2, submissionUuid: crypto.randomUUID() },
    ]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('KARISIK_EXPORT_PAKETI');
  });

  test('F. Duplicate DÖF girdisi -- PAKET_ICI_DUPLICATE', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'A' });

    const sonuc = await donusBelgesiDene(page, [
      { dofUuid, submissionUuid: crypto.randomUUID() },
      { dofUuid, submissionUuid: crypto.randomUUID() },
    ]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('PAKET_ICI_DUPLICATE');
  });

  test('G. Duplicate submission UUID -- SUBMISSION_UUID_DUPLICATE', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'A' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'B' });

    const ortakSubmission = crypto.randomUUID();
    const sonuc = await donusBelgesiDene(page, [
      { dofUuid: uuid1, submissionUuid: ortakSubmission },
      { dofUuid: uuid2, submissionUuid: ortakSubmission },
    ]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('SUBMISSION_UUID_DUPLICATE');
  });

  test('H. Geçersiz submission UUID -- eksik ve yanlış biçim reddedilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'A' });

    const eksikSonuc = await donusBelgesiDene(page, [{ dofUuid }]);
    expect(eksikSonuc.basarili).toBe(false);
    expect(eksikSonuc.kod).toBe('GECERSIZ_SUBMISSION_UUID');

    const yanlisBicimSonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: 'gecersiz-deger' }]);
    expect(yanlisBicimSonuc.basarili).toBe(false);
    expect(yanlisBicimSonuc.kod).toBe('GECERSIZ_SUBMISSION_UUID');

    // Geçerli UUID ama v4 DEĞİL (v1 biçimli) -- Desktop v4 şartı arıyor.
    const v1Benzeri = '00000000-0000-1000-8000-000000000001';
    const v1Sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: v1Benzeri }]);
    expect(v1Sonuc.basarili).toBe(false);
    expect(v1Sonuc.kod).toBe('GECERSIZ_SUBMISSION_UUID');
  });

  test('I. DÖF bulunamadı -- DOF_BULUNAMADI', async ({ page }) => {
    const bilinmeyenUuid = '00000000-0000-4000-8000-000000077777';
    const sonuc = await donusBelgesiDene(page, [{ dofUuid: bilinmeyenUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('DOF_BULUNAMADI');
  });

  test('J. Legacy WIP reddi -- KANONIK_DOF_DEGIL, WIP kaydı değişmez', async ({ page }) => {
    // `girdiler` doğrulaması dofUuid'in UUID BİÇİMİNDE olmasını şart
    // koştuğundan (bkz. §8), WIP fixture'ı burada Commit 3A'nın gerçek
    // `dof_101` gibi UUID-olmayan id yerine, UUID-şekilli ama `dofUuid`
    // alanı hiç OLMAYAN (dolayısıyla `id===dofUuid` asla sağlanamayan)
    // gerçekçi bir legacy kayıt olarak kurgulanır -- girdi doğrulamasını
    // geçip gerçek kanoniklik reddine ulaşabilmesi için.
    const uuidBenzeriId = crypto.randomUUID();
    const wipKayit = {
      id: uuidBenzeriId, dofId: 301, bulguKodu: 'B-1', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const sonuc = await donusBelgesiDene(page, [{ dofUuid: uuidBenzeriId, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('KANONIK_DOF_DEGIL');

    const kayitSonra = await dofKaydiGetir(page, uuidBenzeriId);
    expect(kayitSonra).toEqual(wipKayit);
  });

  test('K. Eksik/boş taslak -- BOS_TAKIP_TASLAGI', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    // Hiç taslak yok (import sonrası hiç Guncelle çağrılmadı).
    const yokSonucu = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(yokSonucu.basarili).toBe(false);
    expect(yokSonucu.kod).toBe('BOS_TAKIP_TASLAGI');

    // takipTaslagi = {} (doğrudan DB manipülasyonu).
    const kayit = await dofKaydiGetir(page, dofUuid);
    await page.evaluate(async (k) => window._idb.dbGuncelle('dofler', k), { ...kayit, takipTaslagi: {} });
    const bosSonucu = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(bosSonucu.basarili).toBe(false);
    expect(bosSonucu.kod).toBe('BOS_TAKIP_TASLAGI');
  });

  test('L. Bozuk taslak savunması -- bilinmeyen alan/geçersiz sayı/kısmi üçlü/object metin -> GECERSIZ_TAKIP_TASLAGI', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const kayit = await dofKaydiGetir(page, dofUuid);

    const bozukTaslaklar = [
      { ad: 'bilinmeyen alan', taslak: { sorumlu: 'x', bilinmeyenAlan: 'y' } },
      { ad: 'geçersiz sayısal değer', taslak: { yeni_o: 99, yeni_f: 3, yeni_s: 1 } },
      { ad: 'kısmi O/F/S üçlüsü', taslak: { yeni_o: 0.2, yeni_f: null, yeni_s: null } },
      { ad: 'object tipli metin', taslak: { sorumlu: { x: 1 } } },
    ];

    for (const { ad, taslak } of bozukTaslaklar) {
      await page.evaluate(async (k) => window._idb.dbGuncelle('dofler', k), { ...kayit, takipTaslagi: taslak });
      const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
      expect(sonuc.basarili, ad).toBe(false);
      expect(sonuc.kod, ad).toBe('GECERSIZ_TAKIP_TASLAGI');
    }
  });

  test('M. Yetkisiz alan sızmaması -- imported/taslak üzerindeki legacy alanlar belgeye asla taşınmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'A' });

    // Kayda doğrudan (savunmacı senaryo) yetkisiz alanlar ekle.
    const kayit = await dofKaydiGetir(page, dofUuid);
    await page.evaluate(async (k) => window._idb.dbGuncelle('dofler', k), {
      ...kayit, durum: 'kapali', sonuc: 'duzeldi', kontrolNotu: 'gizli', fotolar: ['x.jpg'], sesler: [],
    });

    const sonuc = await donusBelgesiDene(page, [{ dofUuid, submissionUuid: crypto.randomUUID() }]);
    expect(sonuc.basarili).toBe(true);
    const k = sonuc.belge.dofKontrolleri[0];
    for (const yasakliAlan of ['durum', 'sonuc', 'kontrolNotu', 'fotolar', 'sesler', 'iceAktarilmaZamani', 'taslakGuncellenmeZamani']) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakliAlan), yasakliAlan).toBe(false);
    }
  });

  test('N. Deterministik belge -- aynı girdilerle iki kez çağrılınca object toEqual, JSON birebir eşit', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });

    const submissionUuid = crypto.randomUUID();
    const girdi = [{ dofUuid, submissionUuid }];

    const sonuc1 = await donusBelgesiDene(page, girdi);
    const sonuc2 = await donusBelgesiDene(page, girdi);
    expect(sonuc1.belge).toEqual(sonuc2.belge);

    const json1 = await donusJsonDene(page, girdi);
    const json2 = await donusJsonDene(page, girdi);
    expect(json1.basarili).toBe(true);
    expect(json1.json).toBe(json2.json);
  });

  test('O. Input sırası -- ters sırayla verilen girdiler ters sırayla üretilir', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Birinci' });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'Ikinci' });

    const sonuc = await donusBelgesiDene(page, [
      { dofUuid: uuid2, submissionUuid: crypto.randomUUID() },
      { dofUuid: uuid1, submissionUuid: crypto.randomUUID() },
    ]);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.belge.dofKontrolleri[0].dofUuid).toBe(uuid2);
    expect(sonuc.belge.dofKontrolleri[1].dofUuid).toBe(uuid1);
  });

  test('P. Salt-okunur davranış -- üretim öncesi/sonrası DÖF kayıtları birebir aynı', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;
    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Birinci', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    await taslakGuncelleDene(page, uuid2, { sorumlu: 'Ikinci' });

    const oncekiTumKayitlar = await tumDoflerGetir(page);

    await donusBelgesiDene(page, [
      { dofUuid: uuid1, submissionUuid: crypto.randomUUID() },
      { dofUuid: uuid2, submissionUuid: crypto.randomUUID() },
    ]);

    const sonrakiTumKayitlar = await tumDoflerGetir(page);
    expect(sonrakiTumKayitlar).toEqual(oncekiTumKayitlar);
    expect(sonrakiTumKayitlar.length).toBe(2);
  });

  test('Q. Dönen nesne bağımsızlığı -- belge mutasyonu DB ve sonraki üretimi etkilemez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const submissionUuid = crypto.randomUUID();
    const sonuc = await page.evaluate(async ({ u, s }) => {
      const belge1 = await window._dofImport.dofDonusBelgesiOlustur([{ dofUuid: u, submissionUuid: s }]);
      belge1.dofKontrolleri[0].sorumlu = 'MUTASYON';
      belge1.dofKontrolleri.push({ dofUuid: 'sahte' });
      belge1.paketUuid = 'sahte-paket';
      const belge2 = await window._dofImport.dofDonusBelgesiOlustur([{ dofUuid: u, submissionUuid: s }]);
      return belge2;
    }, { u: dofUuid, s: submissionUuid });

    expect(sonuc.dofKontrolleri.length).toBe(1);
    expect(sonuc.dofKontrolleri[0].sorumlu).toBe('Ahmet');
    expect(sonuc.paketUuid).not.toBe('sahte-paket');
  });
});
