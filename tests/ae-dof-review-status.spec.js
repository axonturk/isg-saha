// PWA Commit 4N -- reviewStatus yerel model servis katmanı
// (`dofReviewStatusGetir/Guncelle`). UI YOKTUR -- gerçek IndexedDB
// üzerinden `window._dofImport` test köprüsüyle test edilir.
//
// reviewStatus, `takipTaslagi`'ndan TAMAMEN AYRI, top-level bir sibling
// alandır -- `_DOF_TAKIP_ALANLARI` allowlist'ine hiç girmez. Bu dosya
// özellikle bu izolasyonu ve "ekranın açılması DB'ye yazmaz, yalnız
// kullanıcının GERÇEK seçimi yazar" garantisini kilitler.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (önceki DÖF dosyalarıyla aynı desen).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

async function reviewStatusGetirDene(page, dofUuid) {
  return page.evaluate(async (u) => {
    try {
      const sonuc = await window._dofImport.dofReviewStatusGetir(u);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, dofUuid);
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

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

test.describe('AE. DÖF inceleme durumu (reviewStatus)', () => {
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

  test('A. Varsayılan -- hiç dokunulmamış kanonik kayıt "dokunulmadi" döner, own-property değildir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const sonuc = await reviewStatusGetirDene(page, dofUuid);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.reviewStatus).toBe('dokunulmadi');
    expect(sonuc.sonuc.reviewStatusGuncellenmeZamani).toBeNull();

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')).toBe(false);
  });

  test('B. Salt-okunur getirme -- ekranın açılması/Getir çağrısı DBye hiçbir yazma yapmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    await reviewStatusGetirDene(page, dofUuid);
    await reviewStatusGetirDene(page, dofUuid);
    await reviewStatusGetirDene(page, dofUuid);

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);   // birebir aynı -- Getir hiçbir alan eklemedi
  });

  test('C. Her enum değeri kalıcı yazılır ve doğru okunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    for (const deger of ['goruldu', 'inceledi_degisiklik_yok', 'kapatma_onerisi', 'kapatilamaz', 'dokunulmadi']) {
      const yazmaSonucu = await reviewStatusGuncelleDene(page, dofUuid, deger);
      expect(yazmaSonucu.basarili, deger).toBe(true);
      expect(yazmaSonucu.sonuc.reviewStatus, deger).toBe(deger);

      const okumaSonucu = await reviewStatusGetirDene(page, dofUuid);
      expect(okumaSonucu.sonuc.reviewStatus, deger).toBe(deger);
    }
  });

  test('D. Geçersiz enum değeri reddedilir -- GECERSIZ_REVIEW_STATUS, kayıt değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    for (const gecersiz of ['ONAYLANDI', 'kapatildi', '', null, 123, 'Dokunulmadi']) {
      const sonuc = await reviewStatusGuncelleDene(page, dofUuid, gecersiz);
      expect(sonuc.basarili, JSON.stringify(gecersiz)).toBe(false);
      expect(sonuc.kod, JSON.stringify(gecersiz)).toBe('GECERSIZ_REVIEW_STATUS');
    }

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit).toEqual(oncekiKayit);
  });

  test('E. Legacy/WIP kayıt reddi -- Getir ve Guncelle ikisi de KANONIK_DOF_DEGIL, kayıt değişmez', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_ae1', dofId: 101, bulguKodu: 'B-1', tehlikeNo: 1,
      kurumId: 'kurum-wip', birimId: 'birim-wip', odaId: null,
      kat: 'Zemin', oda: 'Ofis', alanTipi: 'Ofis',
      tehlikeTanimi: 'Açık pano', riskDuzeyi: 'Yüksek Risk', r: 100,
      duzelticiFaaliyet: 'Kapak kapatılmalı', aksiyonSuresi: 'derhal',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null,
      kontrolZamani: null, kontrolDenetimId: null, fotolar: [],
      yuklenme: '2026-07-06T10:00:00.000Z',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);

    const getirSonucu = await reviewStatusGetirDene(page, 'dof_wip_ae1');
    expect(getirSonucu.basarili).toBe(false);
    expect(getirSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const guncelleSonucu = await reviewStatusGuncelleDene(page, 'dof_wip_ae1', 'goruldu');
    expect(guncelleSonucu.basarili).toBe(false);
    expect(guncelleSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const sonKayit = await dofKaydiGetir(page, 'dof_wip_ae1');
    expect(sonKayit).toEqual(wipKayit);   // birebir korunmuş
  });

  test('F. Bulunamayan kayıt -- DOF_BULUNAMADI, yeni kayıt oluşturulmaz', async ({ page }) => {
    const bilinmeyenUuid = '00000000-0000-4000-8000-000000077777';

    const getirSonucu = await reviewStatusGetirDene(page, bilinmeyenUuid);
    expect(getirSonucu.basarili).toBe(false);
    expect(getirSonucu.kod).toBe('DOF_BULUNAMADI');

    const guncelleSonucu = await reviewStatusGuncelleDene(page, bilinmeyenUuid, 'goruldu');
    expect(guncelleSonucu.basarili).toBe(false);
    expect(guncelleSonucu.kod).toBe('DOF_BULUNAMADI');

    const kayit = await dofKaydiGetir(page, bilinmeyenUuid);
    expect(kayit).toBeUndefined();
  });

  test('G. İzolasyon -- reviewStatus değişse de takipTaslagi değişmez, takipTaslagi değişse de reviewStatus değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet Yilmaz' }), dofUuid);
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');

    let kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi).toEqual({ sorumlu: 'Ahmet Yilmaz' });   // reviewStatus yazımından ETKİLENMEDİ
    expect(kayit.reviewStatus).toBe('kapatma_onerisi');

    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { gerceklesen_faaliyet: 'Pano kapatildi' }), dofUuid);
    kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.reviewStatus).toBe('kapatma_onerisi');   // takipTaslagi yazımından ETKİLENMEDİ
    expect(kayit.takipTaslagi).toEqual({ sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi' });
  });

  test('H. No-op idempotency -- mevcut değerle (varsayılan "dokunulmadi" dahil) aynı değer gönderilirse yazma olmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    // Hiç dokunulmamışken açıkça "dokunulmadi" göndermek de no-op olmalı --
    // "ekran açılınca yazılmaz" garantisinin genişletilmiş hali.
    const varsayilanTekrari = await reviewStatusGuncelleDene(page, dofUuid, 'dokunulmadi');
    expect(varsayilanTekrari.sonuc.durum).toBe('degismedi');
    let kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')).toBe(false);

    const ilkSonuc = await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    expect(ilkSonuc.sonuc.durum).toBe('guncellendi');
    const ilkZaman = ilkSonuc.sonuc.reviewStatusGuncellenmeZamani;

    const ikinciSonuc = await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    expect(ikinciSonuc.sonuc.durum).toBe('degismedi');
    expect(ikinciSonuc.sonuc.reviewStatusGuncellenmeZamani).toBe(ilkZaman);
  });

  test('I. Gerçek değişiklik zamanı ilerliyor, diğer alanlar (iceAktarilmaZamani) değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    const ilkSonuc = await reviewStatusGuncelleDene(page, dofUuid, 'goruldu');
    const ilkZaman = ilkSonuc.sonuc.reviewStatusGuncellenmeZamani;

    await page.waitForTimeout(5);
    const ikinciSonuc = await reviewStatusGuncelleDene(page, dofUuid, 'inceledi_degisiklik_yok');
    expect(ikinciSonuc.sonuc.durum).toBe('guncellendi');
    expect(ikinciSonuc.sonuc.reviewStatusGuncellenmeZamani).not.toBe(ilkZaman);

    const sonKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonKayit.iceAktarilmaZamani).toBe(oncekiKayit.iceAktarilmaZamani);   // DEĞİŞMEDİ
  });

  test('J. İki DÖF izolasyonu -- birinin reviewStatus\'u diğerini etkilemez', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt (dofId 1 ve 2)
    await dofIceriAktarDene(page, paket);
    const uuid1 = paket.tehlikeler[0].dofUuid;
    const uuid2 = paket.tehlikeler[1].dofUuid;

    await reviewStatusGuncelleDene(page, uuid1, 'kapatilamaz');

    const kayit1 = await dofKaydiGetir(page, uuid1);
    const kayit2 = await dofKaydiGetir(page, uuid2);
    expect(kayit1.reviewStatus).toBe('kapatilamaz');
    expect(Object.prototype.hasOwnProperty.call(kayit2, 'reviewStatus')).toBe(false);
  });

  test('K. Sayfa yenileme sonrası kalıcılık -- IndexedDB\'den tekrar doğru okunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await reviewStatusGuncelleDene(page, dofUuid, 'kapatma_onerisi');

    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const sonuc = await reviewStatusGetirDene(page, dofUuid);
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.reviewStatus).toBe('kapatma_onerisi');
  });
});
