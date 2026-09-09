// İkinci bağımsız inceleme R08/R09 (2026-09-09) -- Hızlı Kritik Kontrol
// "bu mahalde HANGİ maddeler sorulmalı" seçim kuralının Desktop ile
// PARİTESİ + alan-tipi normalizasyonu + çoklu etiket.
//
// KRİTİK: `fixtures/kritik_secim_parite.json` Desktop'ta (isg_denetim)
// GERÇEK Python fonksiyonu (kritik_kontrol.kritik_madde_secimi_coklu,
// `python tools/kritik_json_disa_aktar.py --parite`) ÇALIŞTIRILARAK
// üretildi -- fixtures_desktop_gercek.json ile AYNI ilke, PWA'nın kendi
// başına "doğru görünen" sentetik değer UYDURMASI değil. app.js'teki JS
// mirror'ı (alanTipiAnahtar / alanTipiEslesiyorMu / kritikMaddeSecimi /
// genelHavuzSecimi / kritikMaddeSecimiCoklu) kuralda TEK bir sapma yapsa
// bu dosyadaki testler YAKALAR. Kural burada tek taraflı DEĞİŞTİRİLMEZ:
// Desktop'ta değiştirilir, fixture yeniden üretilip iki repo'ya kopyalanır.
//
// Offline-first KORUNDU: PWA hâlâ internete ihtiyaç duymadan, elindeki
// senkron kritik-kontrol-kutuphanesi.js verisinden karar verir -- bu
// testler de yalnız o yerel veriyle koşar.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const parite = require('./fixtures/kritik_secim_parite.json');

test.describe('R08/R09 -- alan tipi anahtarı Desktop tr_metin.alan_tipi_anahtar ile birebir', () => {
  test('fixture anahtar örneklerinin TAMAMI aynı anahtarı üretir', async ({ page }) => {
    await page.goto('/index.html');
    const sonuclar = await page.evaluate(
      (ornekler) => ornekler.map((o) => window.alanTipiAnahtar(o.metin)),
      parite.anahtar_ornekleri);
    for (let i = 0; i < parite.anahtar_ornekleri.length; i++) {
      expect(sonuclar[i], `metin=${JSON.stringify(parite.anahtar_ornekleri[i].metin)}`)
        .toBe(parite.anahtar_ornekleri[i].anahtar);
    }
  });

  test('alanTipiEslesiyorMu: serbest metin varyantları ve PWA/Desktop sözlüğü iki yönlü eşleşir', async ({ page }) => {
    await page.goto('/index.html');
    const sonuc = await page.evaluate(() => ({
      kucukHarf: window.alanTipiEslesiyorMu(['kanal kazisi'], ['Kanal Kazısı']),
      bosluk: window.alanTipiEslesiyorMu(['  DOKUMA/ÜRETİM HATTI '], ['Dokuma/Üretim Hattı']),
      pwaSozlugu: window.alanTipiEslesiyorMu(['Ofis / idari oda'], ['Ofis']),
      tersYon: window.alanTipiEslesiyorMu(['Ofis'], ['Açık Ofis Alanı']),
      eslesmez: window.alanTipiEslesiyorMu(['Ofis'], ['Koridor', 'Depo/Arşiv']),
      bosEtiket: window.alanTipiEslesiyorMu([], ['Ofis']),
      bosMadde: window.alanTipiEslesiyorMu(['Ofis'], []),
      nullGuvenli: window.alanTipiEslesiyorMu(['', null], ['']),
    }));
    expect(sonuc).toEqual({
      kucukHarf: true, bosluk: true, pwaSozlugu: true, tersYon: true,
      eslesmez: false, bosEtiket: false, bosMadde: false, nullGuvenli: false,
    });
  });
});

test.describe('R09 -- seçim kuralı Desktop kritik_kontrol.kritik_madde_secimi_coklu ile birebir', () => {
  test('Desktop fixture\'ındaki HER örnek PWA mirror\'ında AYNI madde kümesini verir', async ({ page }) => {
    await page.goto('/index.html');
    const sonuclar = await page.evaluate((ornekler) => {
      return ornekler.map((o) => {
        // Desktop tum_kaynaklar_sektor_icin(sektor) <-> SEKTOR_KAYNAKLARI[sektor]
        // (sektor null -> "_evrensel"), B06'nın aynı sözleşmesi.
        const kodlar = o.sektor ? SEKTOR_KAYNAKLARI[o.sektor] : SEKTOR_KAYNAKLARI._evrensel;
        const kaynaklar = (kodlar || [])
          .map((kod) => ({ kod, kaynak: KRITIK_KONTROL_KUTUPHANESI[kod] }))
          .filter((x) => x.kaynak && x.kaynak.kritik_maddeler && x.kaynak.kritik_maddeler.length);
        const cevaplanmis = new Set(o.cevaplanmis.map((c) => `${c[0]}|${c[1]}`));
        const secilen = window.kritikMaddeSecimiCoklu(kaynaklar, o.mahal_etiketleri, cevaplanmis);
        return secilen.map((m) => `${m.kaynakKod}|${m.madde_sira}`).sort();
      });
    }, parite.ornekler);
    expect(parite.ornekler.length).toBeGreaterThan(10);
    for (let i = 0; i < parite.ornekler.length; i++) {
      expect(sonuclar[i], parite.ornekler[i].aciklama).toEqual(parite.ornekler[i].beklenen);
    }
  });

  test('R09 sapmanın kendisi: tesis-geneli adayı VARKEN alan-tipi eşleşmesi yoksa kaynak-içi fallback YİNE gelir', async ({ page }) => {
    // Eski PWA kuralı "tesis-geneli DE yoksa" diye bir koşul daha koyuyordu --
    // bu durumda fallback madde (2) hiç gösterilmiyor, Desktop 3 madde
    // beklerken saha 2 madde cevaplıyordu. Desktop test_kritik_madde_secimi_
    // saf_fallback_kosulu_yalniz_alan_tipi_eslesmesine_bagli ile AYNI veri.
    await page.goto('/index.html');
    const sonuc = await page.evaluate(() => {
      const kritikler = [
        { soru: 'tesis', madde_sira: 0, tesis_geneli: true, alan_tipleri: [] },
        { soru: 'ofis', madde_sira: 1, tesis_geneli: false, alan_tipleri: ['Ofis'] },
        { soru: 'genel', madde_sira: 2, tesis_geneli: false, alan_tipleri: [] },
      ];
      const siralar = (s) => s.map((m) => m.madde_sira);
      return {
        eslesmeYok: siralar(window.kritikMaddeSecimi(kritikler, ['Koridor'], [])),
        eslesmeVar: siralar(window.kritikMaddeSecimi(kritikler, ['ofis / idari oda'], [])),
        tesisCevaplanmis: siralar(window.kritikMaddeSecimi(kritikler, ['Koridor'], [0])),
      };
    });
    expect(sonuc).toEqual({ eslesmeYok: [0, 2], eslesmeVar: [0, 1], tesisCevaplanmis: [2] });
  });

  test('genelHavuzSecimi: kaynakların zaten kapsadığı genel tipi atlar, kapsamadığını ekler', async ({ page }) => {
    await page.goto('/index.html');
    const sonuc = await page.evaluate(() => {
      const secilenler = [{ madde_sira: 5, alan_tipleri: ['Koridor'], tesis_geneli: false }];
      const havuz = window.genelHavuzSecimi(['Koridor', 'Ofis / idari oda'], secilenler);
      return {
        kodlar: [...new Set(havuz.map((m) => m.kaynakKod))],
        siralar: havuz.map((m) => m.madde_sira),
        beklenenAdet: GENEL_KRITIK_MADDELER.Ofis.length,
        adlar: [...new Set(havuz.map((m) => m.kaynakAd))],
      };
    });
    expect(sonuc.kodlar).toEqual(['genel:Ofis']);
    expect(sonuc.siralar).toEqual([...Array(sonuc.beklenenAdet).keys()]);
    expect(sonuc.adlar).toEqual(['Genel — Ofis']);
  });
});

async function _katAlanEkraninaGel(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  // gercekBirimEkle option'ın DOM'a eklenmesini bekler; seçicinin DEĞERİ
  // yeniBirimEkle'nin kaydet dalında set edilir ama eş zamanlı ikinci bir
  // birimleriYukle() yeniden çizimi bunu ara sıra sıfırlıyor (önceden
  // bilinen suit flake'i, bu işin kapsamı DEĞİL) -- burada birim AÇIKÇA
  // seçilir, test o yarışa bağımlı kalmaz.
  await page.selectOption('#setup-birim', { label: birimAdi });
  await expect(page.locator('#setup-birim')).not.toHaveValue('');
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
}

/** "+ Özel Tip" akışı İKİ native diyalog üretir: prompt (ad) ve -- tekrar
 * ise -- alert ("zaten var"). Tek bir handler prompt'u `deger` ile
 * kabul eder, alert metnini toplar; tıklama sonrası handler kaldırılır. */
async function _ozelTipEkle(page, deger) {
  const alertler = [];
  const handler = async (d) => {
    if (d.type() === 'prompt') await d.accept(deger);
    else { alertler.push(d.message()); await d.accept(); }
  };
  page.on('dialog', handler);
  await page.locator('#kat-alan-hizli-chips .chip', { hasText: '+ Özel Tip' }).click();
  // _katAlanOzelAlanEkle async -- alert/yeniden çizim mikrogörev sonrası gelir.
  await page.waitForTimeout(300);
  page.off('dialog', handler);
  return alertler;
}

test.describe('R08 -- "+ Özel Tip" serbest metni KORUNUR, yalnız normalize/tekilleştirilir', () => {
  test('ardışık boşluklar tek boşluğa iner, büyük/küçük harf kullanıcının yazdığı gibi KALIR', async ({ page }) => {
    await _katAlanEkraninaGel(page);
    const alertler = await _ozelTipEkle(page, '  Sunucu   Odası ');
    expect(alertler).toEqual([]);
    const chip = page.locator('#kat-alan-hizli-chips .chip[data-alan="Sunucu Odası"]');
    await expect(chip).toBeVisible();
    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => (b.ozelAlanlar || []).length);
    expect(birim.ozelAlanlar).toEqual(['Sunucu Odası']);   // serbest metin, sabit listeye ZORLANMADI
  });

  test('aynı anahtara düşen ikinci özel tip ("SUNUCU ODASI", "sunucu odasi") eklenmez', async ({ page }) => {
    await _katAlanEkraninaGel(page);
    expect(await _ozelTipEkle(page, 'Sunucu Odası')).toEqual([]);
    await expect(page.locator('#kat-alan-hizli-chips .chip[data-alan="Sunucu Odası"]')).toBeVisible();

    for (const varyant of ['SUNUCU ODASI', 'sunucu odasi', ' sunucu  odası ']) {
      const alertler = await _ozelTipEkle(page, varyant);
      expect(alertler.length, varyant).toBe(1);
      expect(alertler[0]).toContain('zaten var');
    }
    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => (b.ozelAlanlar || []).length);
    expect(birim.ozelAlanlar).toEqual(['Sunucu Odası']);
  });

  test('sabit listedeki bir tipin varyantı ("ofis / idari oda") özel tip olarak ikinci kez eklenmez', async ({ page }) => {
    await _katAlanEkraninaGel(page);
    const alertler = await _ozelTipEkle(page, 'OFİS / İDARİ ODA');
    expect(alertler.length).toBe(1);
    expect(alertler[0]).toContain('zaten var');
    const birimler = await storeTumu(page, 'birimler');
    expect(birimler.every((b) => !(b.ozelAlanlar || []).length)).toBe(true);
  });
});

test.describe('R08 -- QR/kısa kod mahalinin ÇOKLU etiketi: ilki öncelikli, kalanı EK olarak taşınır', () => {
  async function _senkronVeBaslat(page, etiketler) {
    await page.goto('/index.html');
    const onEk = benzersizAd('coklu');
    const payload = {
      kurum: { id: `${onEk}-kurum`, ad: 'Çoklu Etiket Okulu', tur: 'universite', sektor: 'egitim_kurumu' },
      birimler: [{
        id: `${onEk}-birim`, ad: 'Eğitim Bloğu', sgkNo: null, adres: null, children: [],
        mahaller: [{ id: `${onEk}-mahal`, ad: '5-A', kat: '1. Kat', kisaKod: null, etiketler, ekipmanlar: [] }],
      }],
    };
    await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);
    await page.evaluate(async (mahalId) => {
      const mahal = await window._idb.dbGetir('mahaller', mahalId);
      const birim = await window._idb.dbGetir('birimler', mahal.birimId);
      await window.kisaKodBaglamiUygula({
        tur: 'mahal', id: mahal.id, ad: mahal.ad, kat: mahal.kat,
        etiketler: mahal.etiketler, birimId: mahal.birimId, kurumId: birim.kurumId,
      });
    }, `${onEk}-mahal`);
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    const denetimler = await storeTumu(page, 'denetimler');
    return { payload, denetim: denetimler.find((d) => d.kurumId === payload.kurum.id) };
  }

  test('denetim.alanTipi = etiketler[0], denetim.ekAlanTipleri = kalanı; oda kaydı da taşır', async ({ page }) => {
    const { denetim } = await _senkronVeBaslat(page, ['Sınıf', 'Koridor', 'Ofis']);
    expect(denetim.alanTipi).toBe('Sınıf');                    // "bir oda = öncelikli tek alanTipi" korundu
    expect(denetim.ekAlanTipleri).toEqual(['Koridor', 'Ofis']);
    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => b.id === denetim.birimId);
    const oda = birim.odalar.find((o) => o.id === denetim.odaId);
    expect(oda.alanTipi).toBe('Sınıf');
    expect(oda.ekAlanTipleri).toEqual(['Koridor', 'Ofis']);
  });

  test('kritik kontrol listesi EK etiketin kaynağını da (meb_kl08 Koridor) gösterir -- eskiden yalnız ilk etiket', async ({ page }) => {
    await _senkronVeBaslat(page, ['Sınıf', 'Koridor']);
    const kodlar = await page.evaluate(async () => {
      const maddeler = await _kritikKontrolMaddeleriGetir();
      return [...new Set(maddeler.map((m) => m.kaynakKod))];
    });
    expect(kodlar).toContain('meb_kl07_siniflar');
    expect(kodlar).toContain('meb_kl08_koridorlar');
    expect(kodlar).not.toContain('genel:Koridor');   // meb_kl08 zaten kapsıyor, çift gösterim yok
  });

  test('ZIP paketi denetim.ekAlanTipleri taşır (Desktop zip_import bunları mahale yazar)', async ({ page }) => {
    await _senkronVeBaslat(page, ['Sınıf', 'Koridor']);
    const disaAktarilan = await page.evaluate(async () => {
      const { paket } = await _denetimPaketiOlustur(currentSession, 'K', 'B');
      return { alanTipi: paket.denetim.alanTipi, ekAlanTipleri: paket.denetim.ekAlanTipleri };
    });
    expect(disaAktarilan).toEqual({ alanTipi: 'Sınıf', ekAlanTipleri: ['Koridor'] });
  });

  test('tek etiketli / etiketsiz mahalde eski davranış AYNEN: ekAlanTipleri boş', async ({ page }) => {
    const { denetim } = await _senkronVeBaslat(page, []);
    expect(denetim.alanTipi).toBe('Genel');
    expect(denetim.ekAlanTipleri).toEqual([]);
  });

  test('elle chip akışında ekAlanTipleri her zaman boş ve export [] verir', async ({ page }) => {
    await _katAlanEkraninaGel(page);
    await page.locator('#kat-alan-hizli-chips .chip', { hasText: 'Ofis / idari oda' }).click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    const disaAktarilan = await page.evaluate(async () => {
      const { paket } = await _denetimPaketiOlustur(currentSession, 'K', 'B');
      return paket.denetim.ekAlanTipleri;
    });
    expect(disaAktarilan).toEqual([]);
  });
});
