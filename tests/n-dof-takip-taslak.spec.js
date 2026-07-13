// PWA Commit 4A -- izinli sekiz DÖF takip alanı için yerel taslak servis
// katmanı (`dofTakipTaslagiGetir/Guncelle/Temizle`). UI YOKTUR -- gerçek
// IndexedDB üzerinden `window._dofImport` test köprüsüyle test edilir.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki dosyalarla aynı desen).
const crypto = require('crypto');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

async function taslakGetirDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofTakipTaslagiGetir(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

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

async function taslakTemizleDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofTakipTaslagiTemizle(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

test.describe('N. DÖF takip taslağı (izinli 8 alan)', () => {
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

  test('A. Geçerli partial update -- yalnız verilen alanlar taslağa yazılır, imported alanlar değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const sonuc = await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi' });
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.durum).toBe('guncellendi');
    expect(sonuc.sonuc.takipTaslagi).toEqual({
      planlanan_tarih: null, sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi',
      etkinlik_kontrol_tarihi: null, gozlem_degerlendirme: null, yeni_o: null, yeni_f: null, yeni_s: null,
    });

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    for (const alan of Object.keys(oncekiKayit)) {
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }
  });

  test('B. Sekiz alanın tamamı -- doğru okunur, tipler bozulmaz, top-level\'a sızmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const tamDegerler = {
      planlanan_tarih: '2026-07-15', sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi',
      etkinlik_kontrol_tarihi: '2026-09-05', gozlem_degerlendirme: 'Kontrol edildi, uygun.',
      yeni_o: 0.2, yeni_f: 3, yeni_s: 1,
    };
    const sonuc = await taslakGuncelleDene(page, dofUuid, tamDegerler);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.takipTaslagi).toEqual(tamDegerler);

    const okunan = await taslakGetirDene(page, dofUuid);
    expect(okunan.sonuc.takipTaslagi).toEqual(tamDegerler);

    const kayit = await dofKaydiGetir(page, dofUuid);
    for (const alan of Object.keys(tamDegerler)) {
      expect(kayit[alan], alan).toBeUndefined();   // top-level'a YAYILMADI
    }
    expect(kayit.takipTaslagi).toEqual(tamDegerler);
  });

  test('C. Get işlemi -- dönen nesne değiştirilirse gerçek IndexedDB taslağı etkilenmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const mutasyonSonucu = await page.evaluate(async (u) => {
      const t1 = await window._dofImport.dofTakipTaslagiGetir(u);
      t1.takipTaslagi.sorumlu = 'DEĞİŞTİRİLDİ';
      t1.takipTaslagi.yeni_alan = 'sızma-denemesi';
      const t2 = await window._dofImport.dofTakipTaslagiGetir(u);
      return t2;
    }, dofUuid);

    expect(mutasyonSonucu.takipTaslagi.sorumlu).toBe('Ahmet');
    expect(mutasyonSonucu.takipTaslagi.yeni_alan).toBeUndefined();
  });

  test('D. Unknown alan reddi -- IZINSIZ_TAKIP_ALANI, kayıt tamamen değişmeden kalır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const sonuc = await taslakGuncelleDene(page, dofUuid, { bilinmeyenAlan: 'x' });
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('IZINSIZ_TAKIP_ALANI');

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);
  });

  test('E. Yetkisiz alan reddi -- durum/sonuc/kontrolNotu/dofUuid/exportUuid/baseStateHash/aktifTurSirasi hiçbiri saklanmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const yetkisizAlanlar = ['durum', 'sonuc', 'kontrolNotu', 'dofUuid', 'exportUuid', 'baseStateHash', 'aktifTurSirasi'];
    for (const alan of yetkisizAlanlar) {
      const sonuc = await taslakGuncelleDene(page, dofUuid, { [alan]: 'x' });
      expect(sonuc.basarili, alan).toBe(false);
      expect(sonuc.kod, alan).toBe('IZINSIZ_TAKIP_ALANI');
    }

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);
  });

  test('F. Prototype girişimleri -- __proto__/constructor/prototype güvenle reddedilir, global prototype kirlenmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const sonuc = await page.evaluate(async (u) => {
      // JSON.parse ile __proto__ GERÇEK bir own-enumerable-key olarak
      // oluşturulur (object literal `{__proto__: x}` sözdiziminden farklı
      // olarak) -- bu yüzden test anlamlı bir own-key reddini doğrular.
      const kotu1 = JSON.parse('{"__proto__": {"kirletildi": true}}');
      const kotu2 = { constructor: 'x', prototype: 'y' };
      const r1 = await window._dofImport.dofTakipTaslagiGuncelle(u, kotu1).then(() => ({ basarili: true })).catch((e) => ({ basarili: false, kod: e.kod }));
      const r2 = await window._dofImport.dofTakipTaslagiGuncelle(u, kotu2).then(() => ({ basarili: true })).catch((e) => ({ basarili: false, kod: e.kod }));
      return { r1, r2, kirlendi: ({}).kirletildi !== undefined };
    }, dofUuid);

    expect(sonuc.r1.basarili).toBe(false);
    expect(sonuc.r1.kod).toBe('IZINSIZ_TAKIP_ALANI');
    expect(sonuc.r2.basarili).toBe(false);
    expect(sonuc.r2.kod).toBe('IZINSIZ_TAKIP_ALANI');
    expect(sonuc.kirlendi).toBe(false);
  });

  test('G. Geçersiz tipler -- metin alanına object/array, sayısal alana string/NaN/Infinity reddedilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const senaryolar = [
      { ad: 'metin alanına object', degisiklik: { sorumlu: { x: 1 } } },
      { ad: 'metin alanına array', degisiklik: { sorumlu: ['x'] } },
      { ad: 'sayısal alana string', degisiklik: { yeni_o: '0.2' } },
      { ad: 'sayısal alana NaN', degisiklik: { yeni_o: NaN } },
      { ad: 'sayısal alana Infinity', degisiklik: { yeni_o: Infinity } },
    ];

    for (const s of senaryolar) {
      const sonuc = await page.evaluate(async ({ u, d, ad }) => {
        try {
          const r = await window._dofImport.dofTakipTaslagiGuncelle(u, d);
          return { basarili: true, r };
        } catch (e) {
          return { basarili: false, kod: e.kod, ad };
        }
      }, { u: dofUuid, d: s.degisiklik, ad: s.ad });
      expect(sonuc.basarili, s.ad).toBe(false);
      expect(sonuc.kod, s.ad).toBe('GECERSIZ_TAKIP_DEGERI');
    }
  });

  test('H. Null/temizleme semantiği -- geçerli değer sonra null ile temizleme, diğer alanlar korunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'Pano kapatildi' });
    const temizlemeSonucu = await taslakGuncelleDene(page, dofUuid, { sorumlu: null });
    expect(temizlemeSonucu.basarili).toBe(true);
    expect(temizlemeSonucu.sonuc.takipTaslagi.sorumlu).toBe(null);
    expect(temizlemeSonucu.sonuc.takipTaslagi.gerceklesen_faaliyet).toBe('Pano kapatildi');   // korunur

    // yeni_o/f/s üçlüsü: TEK alanı null yapmak (diğerleri doluyken) reddedilir.
    await taslakGuncelleDene(page, dofUuid, { yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    const kismiTemizleme = await taslakGuncelleDene(page, dofUuid, { yeni_o: null });
    expect(kismiTemizleme.basarili).toBe(false);
    expect(kismiTemizleme.kod).toBe('GECERSIZ_TAKIP_DEGERI');

    // üçünü BİRLİKTE null yapmak kabul edilir.
    const tamTemizleme = await taslakGuncelleDene(page, dofUuid, { yeni_o: null, yeni_f: null, yeni_s: null });
    expect(tamTemizleme.basarili).toBe(true);
    expect(tamTemizleme.sonuc.takipTaslagi).toMatchObject({ yeni_o: null, yeni_f: null, yeni_s: null });
  });

  test('I. No-op idempotency -- aynı değerler ikinci kez gönderilirse taslakGuncellenmeZamani değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const ilkSonuc = await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    expect(ilkSonuc.sonuc.durum).toBe('guncellendi');
    const ilkZaman = ilkSonuc.sonuc.taslakGuncellenmeZamani;

    const ikinciSonuc = await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    expect(ikinciSonuc.basarili).toBe(true);
    expect(ikinciSonuc.sonuc.durum).toBe('degismedi');
    expect(ikinciSonuc.sonuc.taslakGuncellenmeZamani).toBe(ilkZaman);
  });

  test('J. Gerçek değişiklik zamanı -- taslakGuncellenmeZamani değişir, iceAktarilmaZamani değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const ilkSonuc = await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    const ilkZaman = ilkSonuc.sonuc.taslakGuncellenmeZamani;

    // Kontrollü, garanti-farklı bir "sonraki an" için gerçek bir bekleme
    // yerine ikinci güncellemenin FARKLI bir değere yol açtığını (gerçek
    // değişiklik) doğrulamak yeterli -- ancak zaman damgasının GERÇEKTEN
    // ilerlediğini kanıtlamak için birkaç ms bekleriz (kırılgan değil,
    // yalnız `ilkZaman !== ikinciZaman` karşılaştırılıyor).
    await page.waitForTimeout(5);
    const ikinciSonuc = await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Mehmet' });
    expect(ikinciSonuc.sonuc.durum).toBe('guncellendi');
    expect(ikinciSonuc.sonuc.taslakGuncellenmeZamani).not.toBe(ilkZaman);

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit.iceAktarilmaZamani).toBe(oncekiKayit.iceAktarilmaZamani);   // DEĞİŞMEDİ
  });

  test('K. Taslak temizleme -- nested taslak/zaman kaldırılır, imported alanlar korunur, ikinci temizleme idempotent', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const oncekiKayit = await dofKaydiGetir(page, dofUuid);
    expect(oncekiKayit.takipTaslagi).toBeTruthy();

    const temizleSonucu = await taslakTemizleDene(page, dofUuid);
    expect(temizleSonucu.basarili).toBe(true);
    expect(temizleSonucu.sonuc.durum).toBe('temizlendi');

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit.takipTaslagi).toBeUndefined();
    expect(sonKayit.taslakGuncellenmeZamani).toBeUndefined();
    for (const alan of Object.keys(sonKayit)) {
      expect(sonKayit[alan]).toEqual(oncekiKayit[alan]);
    }

    const ikinciTemizleSonucu = await taslakTemizleDene(page, dofUuid);
    expect(ikinciTemizleSonucu.basarili).toBe(true);
    expect(ikinciTemizleSonucu.sonuc.durum).toBe('degismedi');   // idempotent no-op
  });

  test('L. Legacy WIP reddi -- KANONIK_DOF_DEGIL, WIP kaydı değişmez/silinmez', async ({ page }) => {
    // Commit 3A'nın gerçek WIP fixture şekli (l-indexeddb-migration.spec.js
    // ile aynı, WIP app.js:1769-1785'ten salt-okunur çıkarılmıştı).
    const wipKayit = {
      id: 'dof_101', dofId: 101, bulguKodu: 'B-1', tehlikeNo: 1,
      kurumId: 'kurum-wip', birimId: 'birim-wip', odaId: null,
      kat: 'Zemin', oda: 'Ofis', alanTipi: 'Ofis',
      tehlikeTanimi: 'Açık pano', riskDuzeyi: 'Yüksek Risk', r: 100,
      duzelticiFaaliyet: 'Kapak kapatılmalı', aksiyonSuresi: 'derhal',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null,
      kontrolZamani: null, kontrolDenetimId: null, fotolar: [],
      yuklenme: '2026-07-06T10:00:00.000Z',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const sonuc = await taslakGuncelleDene(page, 'dof_101', { sorumlu: 'Ahmet' });
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('KANONIK_DOF_DEGIL');

    const sonKayit = await dofKaydiGetir(page, 'dof_101');
    expect(sonKayit).toEqual(wipKayit);   // birebir korunmuş, silinmemiş
  });

  test('M. Bulunamayan kayıt -- DOF_BULUNAMADI, yeni kayıt oluşturulmaz', async ({ page }) => {
    const bilinmeyenUuid = '00000000-0000-4000-8000-000000099999';
    const sonuc = await taslakGuncelleDene(page, bilinmeyenUuid, { sorumlu: 'Ahmet' });
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('DOF_BULUNAMADI');

    const kayit = await dofKaydiGetir(page, bilinmeyenUuid);
    expect(kayit).toBeUndefined();

    const tumKayitlar = await page.evaluate(async () => window._idb.dbTumu('dofler'));
    expect(tumKayitlar).toEqual([]);
  });

  test('N. İki DÖF izolasyonu -- birinin taslağı diğerini etkilemez', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt (dofId 1 ve 2)
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;

    await taslakGuncelleDene(page, uuid1, { sorumlu: 'Ahmet' });

    const kayit1 = await dofKaydiGetir(page, uuid1);
    const kayit2 = await dofKaydiGetir(page, uuid2);
    expect(kayit1.takipTaslagi.sorumlu).toBe('Ahmet');
    expect(kayit2.takipTaslagi).toBeUndefined();
    expect(kayit2.taslakGuncellenmeZamani).toBeUndefined();
  });

  test('O. Imported kimlik/snapshot deep equality -- yalnız takipTaslagi/taslakGuncellenmeZamani değişir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet', yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    const sonKayit = await dofKaydiGetir(page, dofUuid);

    const degisenAlanlar = Object.keys(sonKayit).filter((alan) => JSON.stringify(sonKayit[alan]) !== JSON.stringify(oncekiKayit[alan]));
    expect(degisenAlanlar.sort()).toEqual(['takipTaslagi', 'taslakGuncellenmeZamani'].sort());

    for (const alan of Object.keys(oncekiKayit)) {
      if (alan === 'takipTaslagi' || alan === 'taslakGuncellenmeZamani') continue;
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }
  });

  // ── PWA Commit 4A-1: Getir/Temizle de Guncelle ile AYNI kanoniklik
  // sınırına tabi -- aşağıdaki testler bu düzeltmeyi kilitler. ──────────

  test('P. Legacy kayıttan taslak getirme reddi -- KANONIK_DOF_DEGIL, legacy taslağı da sızdırmaz', async ({ page }) => {
    const wipKayit1 = {
      id: 'dof_wip_p1', dofId: 201, bulguKodu: 'B-1',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null, birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit1);

    const sonuc1 = await taslakGetirDene(page, 'dof_wip_p1');
    expect(sonuc1.basarili).toBe(false);
    expect(sonuc1.kod).toBe('KANONIK_DOF_DEGIL');
    const kayit1Sonra = await dofKaydiGetir(page, 'dof_wip_p1');
    expect(kayit1Sonra).toEqual(wipKayit1);

    // Legacy kayıt (savunma amaçlı senaryo -- normalde Guncelle bunu asla
    // yazmaz) ÜZERİNDE bir takipTaslagi taşısa BİLE dışarı sızmamalı.
    const wipKayit2 = {
      id: 'dof_wip_p2', dofId: 202, bulguKodu: 'B-2', durum: 'bekliyor', birimId: 'birim-wip',
      takipTaslagi: {
        sorumlu: 'SIZMAMALI', planlanan_tarih: null, gerceklesen_faaliyet: null,
        etkinlik_kontrol_tarihi: null, gozlem_degerlendirme: null, yeni_o: null, yeni_f: null, yeni_s: null,
      },
      taslakGuncellenmeZamani: '2026-01-01T00:00:00.000Z',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit2);

    const sonuc2 = await taslakGetirDene(page, 'dof_wip_p2');
    expect(sonuc2.basarili).toBe(false);
    expect(sonuc2.kod).toBe('KANONIK_DOF_DEGIL');
    const kayit2Sonra = await dofKaydiGetir(page, 'dof_wip_p2');
    expect(kayit2Sonra).toEqual(wipKayit2);   // legacy taslağı birebir korunmuş, hiç okunmamış gibi
  });

  test('Q. Legacy kayıtta taslak temizleme reddi -- KANONIK_DOF_DEGIL, iki alan silinmez', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_q1', dofId: 203, bulguKodu: 'B-3', durum: 'bekliyor', birimId: 'birim-wip',
      takipTaslagi: {
        sorumlu: 'Test', planlanan_tarih: null, gerceklesen_faaliyet: null,
        etkinlik_kontrol_tarihi: null, gozlem_degerlendirme: null, yeni_o: null, yeni_f: null, yeni_s: null,
      },
      taslakGuncellenmeZamani: '2026-01-01T00:00:00.000Z',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const sonuc = await taslakTemizleDene(page, 'dof_wip_q1');
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('KANONIK_DOF_DEGIL');

    const kayitSonra = await dofKaydiGetir(page, 'dof_wip_q1');
    expect(kayitSonra).toEqual(wipKayit);   // iki alan SİLİNMEDİ, kayıt birebir aynı
  });

  test('R. Eksik replay kimlikli kayıt -- id===dofUuid ama kimlik alanı eksik, Getir ve Temizle ikisi de reddeder', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const temelKayit = await dofKaydiGetir(page, dofUuid);

    const eksikAlanlar = ['exportUuid', 'paketUuid', 'baseStateHash', 'aktifTurSirasi'];
    for (const alan of eksikAlanlar) {
      const yeniUuid = crypto.randomUUID();
      const eksikKayit = { ...temelKayit, id: yeniUuid, dofUuid: yeniUuid };
      delete eksikKayit[alan];
      await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), eksikKayit);

      const getirSonucu = await taslakGetirDene(page, yeniUuid);
      expect(getirSonucu.basarili, `Getir: ${alan} eksik`).toBe(false);
      expect(getirSonucu.kod, `Getir: ${alan} eksik`).toBe('KANONIK_DOF_DEGIL');

      const temizleSonucu = await taslakTemizleDene(page, yeniUuid);
      expect(temizleSonucu.basarili, `Temizle: ${alan} eksik`).toBe(false);
      expect(temizleSonucu.kod, `Temizle: ${alan} eksik`).toBe('KANONIK_DOF_DEGIL');
    }
  });

  test('S. Kanonik kayıt regresyonu -- düzeltme sonrası Getir/Temizle hâlâ doğru çalışır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });

    const getirSonucu = await taslakGetirDene(page, dofUuid);
    expect(getirSonucu.basarili).toBe(true);
    // Dönen nesnenin mutasyonu DB'yi etkilemez.
    const mutasyonDenemesi = await page.evaluate(async (u) => {
      const t1 = await window._dofImport.dofTakipTaslagiGetir(u);
      t1.takipTaslagi.sorumlu = 'MUTASYON';
      const t2 = await window._dofImport.dofTakipTaslagiGetir(u);
      return t2.takipTaslagi.sorumlu;
    }, dofUuid);
    expect(mutasyonDenemesi).toBe('Ahmet');

    const temizleSonucu = await taslakTemizleDene(page, dofUuid);
    expect(temizleSonucu.basarili).toBe(true);
    expect(temizleSonucu.sonuc.durum).toBe('temizlendi');

    const ikinciTemizle = await taslakTemizleDene(page, dofUuid);
    expect(ikinciTemizle.basarili).toBe(true);
    expect(ikinciTemizle.sonuc.durum).toBe('degismedi');   // idempotent no-op

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    for (const alan of Object.keys(oncekiKayit)) {
      expect(sonKayit[alan], alan).toEqual(oncekiKayit[alan]);   // kimlik/snapshot değişmedi
    }
  });

  test('T. Bulunamayan kayıt -- Getir ve Temizle ikisi de DOF_BULUNAMADI, yeni kayıt oluşmaz', async ({ page }) => {
    const bilinmeyenUuid = '00000000-0000-4000-8000-000000088888';

    const getirSonucu = await taslakGetirDene(page, bilinmeyenUuid);
    expect(getirSonucu.basarili).toBe(false);
    expect(getirSonucu.kod).toBe('DOF_BULUNAMADI');

    const temizleSonucu = await taslakTemizleDene(page, bilinmeyenUuid);
    expect(temizleSonucu.basarili).toBe(false);
    expect(temizleSonucu.kod).toBe('DOF_BULUNAMADI');

    const kayit = await dofKaydiGetir(page, bilinmeyenUuid);
    expect(kayit).toBeUndefined();
    const tumKayitlar = await page.evaluate(async () => window._idb.dbTumu('dofler'));
    expect(tumKayitlar).toEqual([]);
  });

  // ── PWA Commit 4A-2: takipTaslagi artık SPARSE/PARTIAL -- yalnız
  // gerçekten dokunulan alanlar own-property'dir. Aşağıdaki testler bu
  // kök düzeltmeyi kilitler (bkz. commit raporu, Commit 4B-1'in ihtiyaç
  // duyduğu absent/explicit-null ayrımının önkoşulu). ──────────────────

  test('U. Sparse storage -- absent alan own-property değildir, explicit null own-property olarak kalır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    let kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.keys(kayit.takipTaslagi)).toEqual(['sorumlu']);
    expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, 'gerceklesen_faaliyet')).toBe(false);

    await taslakGuncelleDene(page, dofUuid, { gerceklesen_faaliyet: null });
    kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, 'gerceklesen_faaliyet')).toBe(true);
    expect(kayit.takipTaslagi.gerceklesen_faaliyet).toBe(null);
    expect(Object.keys(kayit.takipTaslagi).sort()).toEqual(['gerceklesen_faaliyet', 'sorumlu'].sort());
    for (const alan of ['planlanan_tarih', 'etkinlik_kontrol_tarihi', 'gozlem_degerlendirme', 'yeni_o', 'yeni_f', 'yeni_s']) {
      expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, alan), alan).toBe(false);
    }
  });

  test('V. Sparse partial merge -- ayrı çağrılarla dokunulan alanlar korunur, O/F/S own-property üçlüsü çağrılar arası da geçerli', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    // Önce başka (OFS-dışı) bir alana dokun, sonra O/F/S üçlüsünü BİRLİKTE
    // ekle (tek başına 2/3 gönderme -- bu artık GECERSIZ_TAKIP_DEGERI ile
    // reddedilir, ayrı bir davranıştır ve zaten önceki testlerde -- H --
    // kilitlenmiştir).
    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet' });
    await taslakGuncelleDene(page, dofUuid, { yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    let kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.keys(kayit.takipTaslagi).sort()).toEqual(['sorumlu', 'yeni_o', 'yeni_f', 'yeni_s'].sort());

    // Sonraki bir çağrıda YALNIZ tek bir O/F/S alanına dokunmak -- diğer
    // ikisi ÖNCEKİ çağrıdan own-property olarak zaten mevcut olduğundan
    // üçlü kural hâlâ sağlanır (own-property'nin ÇAĞRILAR ARASI kalıcılığı).
    const sonuc = await taslakGuncelleDene(page, dofUuid, { yeni_o: 0.5 });
    expect(sonuc.basarili).toBe(true);
    kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.keys(kayit.takipTaslagi).sort()).toEqual(['sorumlu', 'yeni_o', 'yeni_f', 'yeni_s'].sort());
    expect(kayit.takipTaslagi).toEqual({ sorumlu: 'Ahmet', yeni_o: 0.5, yeni_f: 3, yeni_s: 1 });
  });

  test('W. Sparse no-op idempotency -- ilk explicit null gerçek değişikliktir, ikinci aynı çağrı no-op', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const ilk = await taslakGuncelleDene(page, dofUuid, { sorumlu: null });
    expect(ilk.sonuc.durum).toBe('guncellendi');   // ilk kez null atama -- YENİ own-property, gerçek değişiklik
    const zaman = ilk.sonuc.taslakGuncellenmeZamani;

    const ikinci = await taslakGuncelleDene(page, dofUuid, { sorumlu: null });
    expect(ikinci.sonuc.durum).toBe('degismedi');
    expect(ikinci.sonuc.taslakGuncellenmeZamani).toBe(zaman);

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.keys(kayit.takipTaslagi)).toEqual(['sorumlu']);
    expect(kayit.takipTaslagi.sorumlu).toBe(null);
  });

  test('X. Sekiz alan regresyonu -- tamamı dokunulunca tamamı own-property olur (null olanlar dahil)', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const tamDegisiklik = {
      planlanan_tarih: null, sorumlu: 'Ahmet', gerceklesen_faaliyet: null,
      etkinlik_kontrol_tarihi: '2026-09-05', gozlem_degerlendirme: null,
      yeni_o: null, yeni_f: null, yeni_s: null,
    };
    const sonuc = await taslakGuncelleDene(page, dofUuid, tamDegisiklik);
    expect(sonuc.basarili).toBe(true);
    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.keys(kayit.takipTaslagi).sort()).toEqual(Object.keys(tamDegisiklik).sort());
    expect(kayit.takipTaslagi).toEqual(tamDegisiklik);
  });
});
