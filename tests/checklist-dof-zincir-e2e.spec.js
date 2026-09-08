// SUPV-23 (2026-08-10) -- Checklist -> Ramak Kala -> Bulgu -> DÖF -> DÖF
// "Sonra" uçtan-uca zincir testi, PWA tarafı.
//
// ÖNEMLİ MİMARİ FARK (Desktop'un tests/test_checklist_dof_zincir_e2e.py'si
// İLE KARIŞTIRILMASIN): PWA'nın veri modelinde Desktop'un "Ramak Kala"
// nesnesine (ramak_kala_olaylar tablosu) veya "Bulgu -> Risk -> DÖF
// oluşturma" (dof_getir_veya_olustur) akışına KARŞILIK GELEN YEREL bir
// mekanizma YOKTUR. PWA'nın `bulgular` deposu doğrudan saha bulgusu
// tutar (ramak kala/risk ayrımı yok), `dofler` deposu ise YALNIZ Desktop'un
// dof_disa_aktar() ile ürettiği bir paketin `dofPaketiIceriAktar()` ile
// İÇE AKTARILMASIYLA doldurulur -- PWA'da yerel bir "DÖF oluştur" akışı
// YOKTUR (grep doğrulaması: app.js'de dofOlustur/dofYerelOlustur benzeri
// bir fonksiyon yok, yalnız dofYerelKayitOlustur -- bu da içe aktarımın
// KENDİSİ, bağımsız bir oluşturma değil). Kısacası: Checklist->Ramak
// Kala->Bulgu->DÖF terfi zinciri Desktop'a ÖZGÜDÜR; PWA yalnız (a)
// checklist chip'ten beslenen saha bulgusu notunu ÜRETİR VE (b) Desktop'ta
// zaten oluşturulup dışa aktarılmış bir DÖF'ün "sonra" (yeniden ölçüm)
// takibini YEREL OLARAK GÜNCELLER. Bu test bu İKİ GERÇEK PWA-yerli parçayı
// ayrı ayrı ama aynı senaryo içinde kanıtlar -- aralarındaki BOŞLUĞU
// (yerel terfi/DÖF-oluşturma YOK) SESSİZCE gizlemez, açıkça yorumlar.
//
// DÖF "SONRA" ARTIK YÖNTEM-FARKINDALI (SUPV-28, 2026-08-11) -- Desktop'un
// SUPV-14 ile "önce" VE "sonra" tarafını yöntem-farkındalı yaptığı, PWA'nın
// ise (plan §8'de kayıtlı bilinen sınır olarak) HÂLÂ Fine-Kinney'e sabit
// kaldığı boşluk artık KAPANDI: Desktop dof_islemleri.py'nin export
// payload'ına eklenen additive `riskYontemi` alanı (SUPV-28 madde 1) PWA'ya
// taşınıyor, PWA `_DOF_YONTEM_GIRDI_TABLOLARI` (app.js, isg_denetim
// risk_yontemleri.GIRDI_TABLOLARI'nin salt-okunur portu) ile BU DÖF'ün
// yöntemine göre hangi O/F/S/D alanının gerekli/geçerli olduğunu bilir.
// Aşağıdaki "E." testi bunu FMEA senaryosuyla POZİTİF kanıtlar (SUPV-23'ün
// eski negatif kanıtının YERİNE) -- "yeni_d" artık FMEA'lı bir DÖF için
// KABUL edilir, ama AYNI DÖF için "yeni_o" (FMEA'nın kullanmadığı alan)
// hâlâ reddedilir; bu ikisi birlikte yöntem-farkındalığın gerçekten
// çalıştığını (yalnız "her şeyi kabul et"e gevşemediğini) gösterir.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { dbTemizle } = require('./migration-helpers');
const { dofIceriAktarDene } = require('./dof-import-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
const { sahteKameraKur } = require('./media-mocks');

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

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

test.describe('SUPV-23 -- Checklist -> Bulgu -> [Desktop DÖF] -> DÖF Sonra zinciri (PWA)', () => {
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

  test('A+B. Gerçek kritik kontrol maddesine "Sorun Var" basılınca sahada bulgu üretilir (Faz 11)', async ({ page }) => {
    // 2026-09-08 -- SUPV-22'nin chip->not sistemi kaldırıldığı için bu
    // test artık Hızlı Kritik Kontrol'ün "Sorun Var" akışını kullanır
    // (fotoğraf ZORUNLU, mevcut kamera altyapısı yeniden kullanılır --
    // bkz. app.js::_kritikKontrolFotoKaydet). Senaryonun ASIL amacı
    // DEĞİŞMEDİ: gerçek bir resmi kontrol maddesinden sahada bir bulgu
    // üretilir.
    await sahteKameraKur(page);
    await page.goto('/index.html');   // addInitScript sonrası sayfayı tazele (bkz. ah-dof-kanit-medya.spec.js emsali)
    const kurumAdi = benzersizAd('AhsapAtolye');
    const birimAdi = benzersizAd('Atolye');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    // HIZLI_ALANLAR.genel[0] === 'Ofis / idari oda' -- "ofis" anahtar
    // kelimesi csgb_ofisler'e eşleşir (checklist-kutuphanesi.js).
    await page.locator('#kat-alan-hizli-chips .chip', { hasText: 'Ofis / idari oda' }).click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    const ilkSatir = page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first();
    const madde = await ilkSatir.locator('div').first().innerText();
    await ilkSatir.locator('.kk-var').click();
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('.finding-item')).toHaveCount(1);

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].metin).toBe(madde);
    expect(bulgular[0].kritikKontrol).toBe(true);
    expect(bulgular[0].fotolar.length).toBe(1);

    // ── BOŞLUK (bilinçli, GİZLENMEDİ) ──────────────────────────────────
    // Bu bulgu PWA'da OTOMATİK olarak bir "ramak kala"ya, risk'e veya
    // DÖF'e TERFİ EDİLMEZ -- böyle bir yerel mekanizma YOK. Gerçek iş
    // akışında bu bulgu ZIP ile Desktop'a aktarılır, bilirkişi orada
    // (ramak_kala_ekle -> ramak_kala_bulguya_donustur -> dof_getir_veya_
    // olustur ile, bkz. isg_denetim/tests/test_checklist_dof_zincir_e2e.py)
    // riske/DÖF'e dönüştürür, DÖF'ü tekrar PWA'ya (replay export) gönderir.
    // Aşağıdaki adım BU noktadan devam eder -- PWA'nın kendisi bu adımı
    // ÜRETMEZ, yalnız SONUCUNU (içe aktarılmış bir DÖF) alır.
  });

  test('C. Desktop tarafından oluşturulmuş DÖF içe aktarılır, "sonra" (O/F/Ş) takibi güncellenir', async ({ page }) => {
    // Bu DÖF'ün tehlike tanımı, üstteki testte kullanılan GERÇEK checklist
    // maddesiyle AYNI metni taşır -- "Desktop'ta bu tam checklist bulgusu
    // risk/DÖF'e dönüştürülüp geri gönderildi" senaryosunu temsil eder.
    // (window.CHECKLIST_KUTUPHANESI -- sayfa zaten yüklü, script tag
    // çalıştı; dosya module.exports YAPMAZ, bu yüzden Node'da require()
    // ile DEĞİL, tarayıcı bağlamından okunur.)
    const madde = await page.evaluate(
      () => window.CHECKLIST_KUTUPHANESI.csgb_ofisler.maddeler[0]);
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, tehlikeTanimi: madde })],
    });
    const iceAktarim = await dofIceriAktarDene(page, paket);
    expect(iceAktarim.basarili).toBe(true);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const kayitOnce = await dofKaydiGetir(page, dofUuid);
    expect(kayitOnce).toBeTruthy();
    expect(kayitOnce.tehlikeTanimi).toBe(madde);

    // "Sonra" -- Fine-Kinney biçiminde 3'lü O/F/Ş (PWA'nın TEK bildiği
    // biçim). Gerçekleşen faaliyet + etkinlik kontrol tarihi de gerçek
    // takip alanları.
    const sonuc = await taslakGuncelleDene(page, dofUuid, {
      sorumlu: 'Saha Sorumlusu', gerceklesen_faaliyet: 'Önlem uygulandı, kontrol edildi.',
      etkinlik_kontrol_tarihi: '2026-08-10', yeni_o: 0.2, yeni_f: 0.5, yeni_s: 1,
    });
    expect(sonuc.basarili).toBe(true);
    expect(sonuc.sonuc.durum).toBe('guncellendi');
    expect(sonuc.sonuc.takipTaslagi.yeni_o).toBe(0.2);
    expect(sonuc.sonuc.takipTaslagi.yeni_f).toBe(0.5);
    expect(sonuc.sonuc.takipTaslagi.yeni_s).toBe(1);

    // GERÇEK IndexedDB durumu -- yalnız fonksiyon dönüş değeri DEĞİL.
    // SPARSE birleştirme (bkz. dofTakipTaslagiGuncelle'nin kendi
    // dokümantasyonu): yalnız GERÇEKTEN dokunulan alanlar own-property
    // olarak kalır -- planlanan_tarih/gozlem_degerlendirme burada hiç
    // dokunulmadı, own-property OLARAK BİLE görünmemeli.
    const kayitSonra = await dofKaydiGetir(page, dofUuid);
    expect(kayitSonra.takipTaslagi).toEqual({
      sorumlu: 'Saha Sorumlusu',
      gerceklesen_faaliyet: 'Önlem uygulandı, kontrol edildi.',
      etkinlik_kontrol_tarihi: '2026-08-10',
      yeni_o: 0.2, yeni_f: 0.5, yeni_s: 1,
    });
    // Kimlik/snapshot alanları içe aktarımdan beri DEĞİŞMEDİ.
    expect(kayitSonra.tehlikeTanimi).toBe(madde);
    expect(kayitSonra.dofUuid).toBe(dofUuid);
  });

  test('D. "Sonra" O/F/Ş eksik/kısmi girilirse reddedilir (üçlü kural burada da geçerli)', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    const sonuc = await taslakGuncelleDene(page, dofUuid, { yeni_o: 0.2, yeni_f: 0.5 });
    expect(sonuc.basarili).toBe(false);
    expect(sonuc.kod).toBe('GECERSIZ_TAKIP_DEGERI');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();
  });

  test('E. FMEA yöntemli DÖF -- "yeni_d" (Saptanabilirlik) artık KABUL edilir, "yeni_o" (bu yöntemde kullanılmayan alan) hâlâ reddedilir', async ({ page }) => {
    // SUPV-28 öncesi bu test PWA'nın "yeni_d"yi HER ZAMAN reddettiğini
    // (bilinen, plan §8'de kayıtlı bir sınır) kanıtlıyordu. Artık Desktop
    // export'u DÖF'ün riskYontemi'ni taşıyor (dof_islemleri.py SUPV-28),
    // PWA da bunu kullanıyor -- bu test şimdi TERSİNİ, pozitif kabulü
    // kanıtlıyor. FMEA'nın gerçek alan haritası (isg_denetim
    // risk_yontemleri.GIRDI_TABLOLARI[YONTEM_FMEA]) "f"/"s"/"d" -- "o" HİÇ
    // yok (Desktop storage kolonu yeni_f, FMEA'da "Oluşma Sıklığı" taşır,
    // "Olasılık" değil) -- bu İKİ yönlü kanıt (d kabul + o ret) yöntem-
    // farkındalığın GERÇEKTEN çalıştığını, "her şeyi kabul et"e
    // gevşemediğini gösterir.
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, riskYontemi: 'fmea' })],
    });
    await dofIceriAktarDene(page, paket);
    const dofUuid = paket.tehlikeler[0].dofUuid;

    // FMEA'nın gerçek üçlüsü (f/s/d) -- hepsi birlikte, kanonik 1-10 kümesinde.
    const kabul = await taslakGuncelleDene(page, dofUuid, {
      yeni_f: 2, yeni_s: 3, yeni_d: 7,
    });
    expect(kabul.basarili).toBe(true);
    expect(kabul.sonuc.durum).toBe('guncellendi');
    expect(kabul.sonuc.takipTaslagi.yeni_f).toBe(2);
    expect(kabul.sonuc.takipTaslagi.yeni_s).toBe(3);
    expect(kabul.sonuc.takipTaslagi.yeni_d).toBe(7);

    const kayitKabulSonrasi = await dofKaydiGetir(page, dofUuid);
    expect(kayitKabulSonrasi.takipTaslagi).toEqual({ yeni_f: 2, yeni_s: 3, yeni_d: 7 });

    // Aynı FMEA DÖF'üne "yeni_o" göndermek -- bu yöntem hiç kullanmıyor,
    // İZİNSİZ_TAKIP_ALANI ile reddedilir (sessizce yok sayılmaz).
    const ret = await taslakGuncelleDene(page, dofUuid, { yeni_o: 1 });
    expect(ret.basarili).toBe(false);
    expect(ret.kod).toBe('IZINSIZ_TAKIP_ALANI');
    expect(ret.mesaj).toContain('yeni_o');
    expect(ret.mesaj).toContain('fmea');

    // Reddedilen çağrı hiçbir yan etki bırakmaz -- önceki kabul edilmiş
    // taslak DEĞİŞMEDEN kalır.
    const kayitRetSonrasi = await dofKaydiGetir(page, dofUuid);
    expect(kayitRetSonrasi.takipTaslagi).toEqual({ yeni_f: 2, yeni_s: 3, yeni_d: 7 });
  });
});
