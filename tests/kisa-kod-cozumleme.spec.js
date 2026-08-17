// Sabit Kimlik Kısa Kod -- çözümleme + askıda kayıt + oturum yönlendirme
// testleri (SUPV-65, 2026-08-17).
//
// KRİTİK: bu dosyadaki fixture'lar (`fixtures_desktop_gercek.json`)
// Desktop'ta (isg_denetim) GERÇEK Python fonksiyonları (kisa_kod_uret(),
// kurum_qr_aktarim.kurum_qr_parcalari_uret()/_parcalari_birlestir())
// ÇALIŞTIRILARAK üretildi -- PWA tarafının kendi başına "doğru görünen"
// sentetik veri UYDURMASI değil. Checksum algoritmasında (alfabe sırası,
// toplama yöntemi) TEK bir sapma olsa bu dosyadaki testler YAKALAR.
const { test, expect } = require('@playwright/test');
const { benzersizAd, storeTumu } = require('./helpers');
const fixture = require('./fixtures_desktop_gercek.json');

test.describe('SUPV-65 Kısa Kod -- Desktop fixture ile gerçek doğrulama', () => {
  test('Desktop\'ın GERÇEKTEN ürettiği tüm kısa kodlar PWA\'da geçerli sayılır', async ({ page }) => {
    await page.goto('/index.html');
    const sonuclar = await page.evaluate((kodlar) => kodlar.map((k) => window.kisaKodGecerliMi(k)), fixture.kisaKodlar);
    expect(sonuclar.every(Boolean)).toBe(true);
  });

  test('checksum karakteri BOZULAN gerçek bir kod artık geçersiz sayılır', async ({ page }) => {
    // Checksum algoritmasında bir sapma varsa BU test hem yanlış-negatif
    // (gerçek kodu reddetme) hem yanlış-pozitif (bozuk kodu kabul etme)
    // yönünde YAKALAR -- iki taraf da GERÇEK Desktop değerine göre sınanıyor.
    await page.goto('/index.html');
    const sonuclar = await page.evaluate((kodlar) => {
      const ALFABE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return kodlar.map((kod) => {
        const sonKarakter = kod[kod.length - 1];
        const farkliKarakter = ALFABE.split('').find((c) => c !== sonKarakter);
        const bozukKod = kod.slice(0, -1) + farkliKarakter;
        return window.kisaKodGecerliMi(bozukKod);
      });
    }, fixture.kisaKodlar);
    expect(sonuclar.every((v) => v === false)).toBe(true);
  });

  test('kisaKodOnekTuru M/E oneklerini dogru ayirt eder', async ({ page }) => {
    await page.goto('/index.html');
    const sonuc = await page.evaluate((kodlar) => kodlar.map((k) => window.kisaKodOnekTuru(k)), fixture.kisaKodlar);
    expect(sonuc.slice(0, 5).every((t) => t === 'mahal')).toBe(true);
    expect(sonuc.slice(5).every((t) => t === 'ekipman')).toBe(true);
  });

  test('kurumAgaciUpsertEt Desktop\'ın GERÇEK payload\'ını mahal/ekipman dahil dogru upsert eder', async ({ page }) => {
    await page.goto('/index.html');
    // id çakışmasını önlemek için Desktop id'lerine benzersiz bir ön ek --
    // yalnız TEKRAR ÇALIŞTIRILABİLİRLİK için, payload'ın GERÇEK ŞEKLİ
    // (alan adları/değerleri) HİÇ değiştirilmedi.
    const onEk = benzersizAd('gercek');
    const payload = JSON.parse(JSON.stringify(fixture.payload));
    function idOnekle(dugum) {
      dugum.id = `${onEk}-${dugum.id}`;
      for (const m of (dugum.mahaller || [])) {
        m.id = `${onEk}-${m.id}`;
        for (const e of (m.ekipmanlar || [])) e.id = `${onEk}-${e.id}`;
      }
      for (const c of (dugum.children || [])) idOnekle(c);
    }
    payload.kurum.id = `${onEk}-${payload.kurum.id}`;
    for (const b of payload.birimler) idOnekle(b);

    const sonuc = await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);
    expect(sonuc.kurumAdi).toBe(fixture.gercekDegerler.kurumAd);

    const kurumlar = await storeTumu(page, 'kurumlar');
    expect(kurumlar.find((k) => k.id === payload.kurum.id).ad).toBe(fixture.gercekDegerler.kurumAd);

    const birimler = await storeTumu(page, 'birimler');
    const rektorluk = birimler.find((b) => b.id === payload.birimler[0].id);
    expect(rektorluk.ad).toBe(fixture.gercekDegerler.birim1Ad);
    const sgdb = birimler.find((b) => b.id === payload.birimler[0].children[0].id);
    expect(sgdb.ad).toBe(fixture.gercekDegerler.birim2Ad);

    const mahaller = await storeTumu(page, 'mahaller');
    const mahal1 = mahaller.find((m) => m.id === payload.birimler[0].mahaller[0].id);
    expect(mahal1.ad).toBe(fixture.gercekDegerler.mahal1Ad);
    expect(mahal1.kat).toBe(fixture.gercekDegerler.mahal1Kat);
    expect(mahal1.etiketler.slice().sort()).toEqual(fixture.gercekDegerler.mahal1Etiketler);
    expect(mahal1.kisaKod).toBe(fixture.payload.birimler[0].mahaller[0].kisaKod);
    expect(mahal1.birimId).toBe(payload.birimler[0].id);

    const mahal2 = mahaller.find((m) => m.id === payload.birimler[0].children[0].mahaller[0].id);
    expect(mahal2.ad).toBe(fixture.gercekDegerler.mahal2Ad);

    const ekipmanlar = await storeTumu(page, 'ekipmanlar');
    const ekipman1 = ekipmanlar.find((e) => e.mahalId === mahal1.id);
    expect(ekipman1.ad).toBe(fixture.gercekDegerler.ekipman1Ad);
    expect(ekipman1.tur).toBe(fixture.gercekDegerler.ekipman1Tur);
    expect(ekipman1.kisaKod).toBe(fixture.payload.birimler[0].mahaller[0].ekipmanlar[0].kisaKod);
  });

  test('kisaKoduCoz senkron edilen GERÇEK mahal kısa kodunu tam bağlamla çözer', async ({ page }) => {
    await page.goto('/index.html');
    const onEk = benzersizAd('coz');
    const payload = JSON.parse(JSON.stringify(fixture.payload));
    function idOnekle(dugum) {
      dugum.id = `${onEk}-${dugum.id}`;
      for (const m of (dugum.mahaller || [])) {
        m.id = `${onEk}-${m.id}`;
        for (const e of (m.ekipmanlar || [])) e.id = `${onEk}-${e.id}`;
      }
      for (const c of (dugum.children || [])) idOnekle(c);
    }
    payload.kurum.id = `${onEk}-${payload.kurum.id}`;
    for (const b of payload.birimler) idOnekle(b);
    await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);

    const mahalKisaKodu = fixture.payload.birimler[0].mahaller[0].kisaKod;
    const baglam = await page.evaluate((kod) => window.kisaKoduCoz(kod), mahalKisaKodu);
    expect(baglam.tur).toBe('mahal');
    expect(baglam.ad).toBe(fixture.gercekDegerler.mahal1Ad);
    expect(baglam.kat).toBe(fixture.gercekDegerler.mahal1Kat);
    expect(baglam.kurumAd).toBe(fixture.gercekDegerler.kurumAd);
    expect(baglam.birimAd).toBe(fixture.gercekDegerler.birim1Ad);

    const ekipmanKisaKodu = fixture.payload.birimler[0].mahaller[0].ekipmanlar[0].kisaKod;
    const ekipmanBaglam = await page.evaluate((kod) => window.kisaKoduCoz(kod), ekipmanKisaKodu);
    expect(ekipmanBaglam.tur).toBe('ekipman');
    expect(ekipmanBaglam.ad).toBe(fixture.gercekDegerler.ekipman1Ad);
    expect(ekipmanBaglam.ekipmanTuru).toBe(fixture.gercekDegerler.ekipman1Tur);
    expect(ekipmanBaglam.mahalAd).toBe(fixture.gercekDegerler.mahal1Ad);
  });

  test('kisaKoduCoz henuz senkron edilmemis gercek formatli bir kod icin null doner', async ({ page }) => {
    await page.goto('/index.html');
    // fixture'daki 10 kod hiçbiri bu testte upsert edilmedi -- tanınmamalı.
    const sonuc = await page.evaluate((kod) => window.kisaKoduCoz(kod), fixture.kisaKodlar[0]);
    expect(sonuc).toBeNull();
  });
});

test.describe('SUPV-65 Aşama D -- Askıda kayıt', () => {
  test('bulunamayan kod askida kayit olusturur, akisi durdurmaz', async ({ page }) => {
    await page.goto('/index.html');
    const kod = fixture.kisaKodlar[1];   // henüz hiç senkron edilmedi
    const islendiMi = await page.evaluate((k) => window.kisaKodIsle(k, 'serbest metin taslağı'), kod);
    expect(islendiMi).toBe(true);

    const askidakiler = await storeTumu(page, 'askidaKayitlar');
    const kayit = askidakiler.find((a) => a.kod === kod);
    expect(kayit).toBeTruthy();
    expect(kayit.serbestMetin).toBe('serbest metin taslağı');
  });

  test('gecersiz format (normal oda no) askida kayit OLUSTURMAZ, false doner', async ({ page }) => {
    await page.goto('/index.html');
    const oncekiSayi = (await storeTumu(page, 'askidaKayitlar')).length;
    const islendiMi = await page.evaluate(() => window.kisaKodIsle('203', '203'));
    expect(islendiMi).toBe(false);
    const sonrakiSayi = (await storeTumu(page, 'askidaKayitlar')).length;
    expect(sonrakiSayi).toBe(oncekiSayi);
  });

  test('kurumAgaciUpsertEt sonrasi bekleyen askida kayit OTOMATIK cozulur', async ({ page }) => {
    await page.goto('/index.html');
    const onEk = benzersizAd('askida');
    const payload = JSON.parse(JSON.stringify(fixture.payload));
    function idOnekle(dugum) {
      dugum.id = `${onEk}-${dugum.id}`;
      for (const m of (dugum.mahaller || [])) {
        m.id = `${onEk}-${m.id}`;
        for (const e of (m.ekipmanlar || [])) e.id = `${onEk}-${e.id}`;
      }
      for (const c of (dugum.children || [])) idOnekle(c);
    }
    payload.kurum.id = `${onEk}-${payload.kurum.id}`;
    for (const b of payload.birimler) idOnekle(b);

    const mahalKisaKodu = fixture.payload.birimler[0].mahaller[0].kisaKod;
    // Kurum henüz senkron edilmeden ÖNCE aynı kısa kod taranmış/girilmiş --
    // askıda kalmalı.
    await page.evaluate((k) => window.kisaKodIsle(k, null), mahalKisaKodu);
    let askidakiler = await storeTumu(page, 'askidaKayitlar');
    expect(askidakiler.some((a) => a.kod === mahalKisaKodu)).toBe(true);

    // Kurum ŞİMDİ senkron ediliyor -- kurumAgaciUpsertEt'in kendisi
    // askidaKayitlariCozmeyeCalis()'i OTOMATİK tetiklemeli.
    const sonuc = await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);
    expect(sonuc.askidaCozulen).toBeGreaterThanOrEqual(1);

    askidakiler = await storeTumu(page, 'askidaKayitlar');
    expect(askidakiler.some((a) => a.kod === mahalKisaKodu)).toBe(false);
  });
});

test.describe('SUPV-65 Aşama F -- alan eşlemesi (bina/kat/oda)', () => {
  async function _senkronEt(page, onEk) {
    const payload = JSON.parse(JSON.stringify(fixture.payload));
    function idOnekle(dugum) {
      dugum.id = `${onEk}-${dugum.id}`;
      for (const m of (dugum.mahaller || [])) {
        m.id = `${onEk}-${m.id}`;
        for (const e of (m.ekipmanlar || [])) e.id = `${onEk}-${e.id}`;
      }
      for (const c of (dugum.children || [])) idOnekle(c);
    }
    payload.kurum.id = `${onEk}-${payload.kurum.id}`;
    for (const b of payload.birimler) idOnekle(b);
    await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);
    return payload;
  }

  // `currentSession` app.js'te top-level `let` -- klasik (module olmayan)
  // script'te `window.currentSession` OLUŞMAZ (yalnız `var`/fonksiyon
  // bildirimleri window'a bağlanır). Bu yüzden sonuç `denetimler` store'undan
  // (gerçek kaynak, currentSession zaten aynı nesneye işaret eder) okunur.
  async function _sonDenetimiBul(page, kurumId) {
    const denetimler = await storeTumu(page, 'denetimler');
    return denetimler
      .filter((d) => d.kurumId === kurumId)
      .sort((a, b) => (b.guncelleme || b.baslangic || '').localeCompare(a.guncelleme || a.baslangic || ''))[0];
  }

  test('mahal kisa kodu cozulunce denetim.bina/kat/oda dogru esler', async ({ page }) => {
    await page.goto('/index.html');
    const onEk = benzersizAd('esleme');
    const payload = await _senkronEt(page, onEk);
    const mahalKisaKodu = fixture.payload.birimler[0].mahaller[0].kisaKod;

    await page.evaluate(async (kod) => {
      const baglam = await window.kisaKoduCoz(kod);
      await window.kisaKodBaglamiUygula(baglam);
    }, mahalKisaKodu);

    const denetim = await _sonDenetimiBul(page, payload.kurum.id);
    expect(denetim).toBeTruthy();
    expect(denetim.bina).toBe(fixture.gercekDegerler.birim1Ad);   // birim.ad -- MAHAL DEĞİL
    expect(denetim.kat).toBe(fixture.gercekDegerler.mahal1Kat);
    expect(denetim.oda).toBe(fixture.gercekDegerler.mahal1Ad);
  });

  test('ekipman kisa kodu cozulunce oda alani mahal+ekipman adini tasir', async ({ page }) => {
    await page.goto('/index.html');
    const onEk = benzersizAd('esleme2');
    const payload = await _senkronEt(page, onEk);
    const ekipmanKisaKodu = fixture.payload.birimler[0].mahaller[0].ekipmanlar[0].kisaKod;

    await page.evaluate(async (kod) => {
      const baglam = await window.kisaKoduCoz(kod);
      await window.kisaKodBaglamiUygula(baglam);
    }, ekipmanKisaKodu);

    const denetim = await _sonDenetimiBul(page, payload.kurum.id);
    expect(denetim).toBeTruthy();
    expect(denetim.bina).toBe(fixture.gercekDegerler.birim1Ad);
    expect(denetim.kat).toBe(fixture.gercekDegerler.mahal1Kat);   // ekipmanın BAĞLI olduğu mahalin katı
    expect(denetim.oda).toBe(`${fixture.gercekDegerler.mahal1Ad} — ${fixture.gercekDegerler.ekipman1Ad}`);
  });

  test('farkli kurumdan mahal cozulunce kurum degisti bildirimi gorunur', async ({ page }) => {
    await page.goto('/index.html');
    const onEkA = benzersizAd('kurumA');
    const onEkB = benzersizAd('kurumB');
    const payloadA = await _senkronEt(page, onEkA);
    const payloadB = await _senkronEt(page, onEkB);

    // Önce A kurumundaki bir mahalle oturum başlat.
    await page.evaluate(async (mahalId) => {
      const mahal = await window._idb.dbGetir('mahaller', mahalId);
      const birim = await window._idb.dbGetir('birimler', mahal.birimId);
      await window.kisaKodBaglamiUygula({
        tur: 'mahal', id: mahal.id, ad: mahal.ad, kat: mahal.kat,
        etiketler: mahal.etiketler, birimId: mahal.birimId, kurumId: birim.kurumId,
      });
    }, payloadA.birimler[0].mahaller[0].id);

    // Sonra B kurumundaki bir mahale geç -- kurum SINIRI değişti.
    await page.evaluate(async (mahalId) => {
      const mahal = await window._idb.dbGetir('mahaller', mahalId);
      const birim = await window._idb.dbGetir('birimler', mahal.birimId);
      await window.kisaKodBaglamiUygula({
        tur: 'mahal', id: mahal.id, ad: mahal.ad, kat: mahal.kat,
        etiketler: mahal.etiketler, birimId: mahal.birimId, kurumId: birim.kurumId,
      });
    }, payloadB.birimler[0].mahaller[0].id);

    await expect(page.locator('text=Kurum değişti')).toBeVisible({ timeout: 2000 });
  });

  test('AYNI kurum icinde mahal degisince kurum degisti bildirimi CIKMAZ', async ({ page }) => {
    await page.goto('/index.html');
    const onEk = benzersizAd('aynikurum');
    const payload = await _senkronEt(page, onEk);

    await page.evaluate(async (mahalId) => {
      const mahal = await window._idb.dbGetir('mahaller', mahalId);
      const birim = await window._idb.dbGetir('birimler', mahal.birimId);
      await window.kisaKodBaglamiUygula({
        tur: 'mahal', id: mahal.id, ad: mahal.ad, kat: mahal.kat,
        etiketler: mahal.etiketler, birimId: mahal.birimId, kurumId: birim.kurumId,
      });
    }, payload.birimler[0].mahaller[0].id);

    await page.evaluate(async (mahalId) => {
      const mahal = await window._idb.dbGetir('mahaller', mahalId);
      const birim = await window._idb.dbGetir('birimler', mahal.birimId);
      await window.kisaKodBaglamiUygula({
        tur: 'mahal', id: mahal.id, ad: mahal.ad, kat: mahal.kat,
        etiketler: mahal.etiketler, birimId: mahal.birimId, kurumId: birim.kurumId,
      });
    }, payload.birimler[0].children[0].mahaller[0].id);

    const bildirimVarMi = await page.locator('text=Kurum değişti').count();
    expect(bildirimVarMi).toBe(0);
  });
});

test.describe('SUPV-65 -- Mevcut serbest-metin/Sesle-Yaz akışı BOZULMADI (regresyon)', () => {
  test('normal bir oda numarasi kisa kod olarak islenMEZ', async ({ page }) => {
    await page.goto('/index.html');
    // "203" gibi rastgele bir oda no'su kısa kod alfabesi/uzunluğuyla
    // ASLA çakışmaz -- kisaKodGecerliMi false döner, mevcut akış aynen sürer.
    const sonuc = await page.evaluate(() => window.kisaKodGecerliMi('203'));
    expect(sonuc).toBe(false);
  });

  test('#kat-alan-oda-no alanina normal metin yazmak kisa kod akisini TETIKLEMEZ', async ({ page }) => {
    await page.goto('/index.html');
    const oncekiAskida = (await storeTumu(page, 'askidaKayitlar')).length;
    await page.evaluate(() => {
      const input = document.getElementById('kat-alan-oda-no');
      input.value = 'Poliklinik 203';
      window._katAlanOdaNoDegisti();
    });
    const sonrakiAskida = (await storeTumu(page, 'askidaKayitlar')).length;
    expect(sonrakiAskida).toBe(oncekiAskida);
  });

  test('mevcut kurum/birim (mahalsiz) QR ice aktarimi hala calisiyor', async ({ page }) => {
    await page.goto('/index.html');
    const kurumId = benzersizAd('regresyon-kurum');
    const payload = {
      kurum: { id: kurumId, ad: 'Regresyon Kurumu', tur: 'universite' },
      birimler: [{ id: benzersizAd('regresyon-birim'), ad: 'Birim', sgkNo: null, adres: null, children: [] }]
    };
    const sonuc = await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);
    expect(sonuc.kurumAdi).toBe('Regresyon Kurumu');
    expect(sonuc.birimSayisi).toBe(1);
  });
});
