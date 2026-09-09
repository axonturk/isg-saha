// PWA Commit 2 / Bölüm E -- yazılı bulgu kaydı karakterizasyonu.
// Gerçek alanlar app.js:1179'daki `const bulgu = {...}` satırından çıkarıldı:
// id, denetimId, metin, fotolar, sesler, hayatiRisk, zaman.
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

async function _denetimBaslat(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
  const denetimler = await storeTumu(page, 'denetimler');
  return denetimler[0];
}

test.describe('E. Yazılı bulgu kaydı', () => {
  test('yalniz yazili not iceren bulgu IndexedDBde dogru denetimId ile olusur, sayfa yenilemesinde tekrar gosterilir', async ({ page }) => {
    const denetim = await _denetimBaslat(page);
    const metin = 'Yangın tüpü son kullanma tarihi geçmiş.';

    await page.locator('#finding-manual').fill(metin);
    await page.click('button[onclick="saveFinding()"]');

    await expect(page.locator('#findings-list')).toContainText(metin);

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    const bulgu = bulgular[0];

    expect(bulgu.denetimId).toBe(denetim.id);
    expect(bulgu.metin).toBe(metin);
    expect(bulgu.fotolar).toEqual([]);
    expect(bulgu.sesler).toEqual([]);
    expect(bulgu.hayatiRisk).toBe(false);
    expect(typeof bulgu.zaman).toBe('string');
    expect(typeof bulgu.id).toBe('string');

    // Sayfa yenilemesi sonrası bulgu tekrar gösterilir mi -- gerçek davranış:
    // resumeSession çağrılmadığı için setup ekranına döner, geçmiş kayıttan
    // devam edilirse (resumeSession) bulgu tekrar yüklenir.
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.locator(`[data-swipe-id="${denetim.id}"]`).click();
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await expect(page.locator('#findings-list')).toContainText(metin);
  });

  test('hayati risk isaretlenmis bulgu dogru bayrakla saklanir', async ({ page }) => {
    await _denetimBaslat(page);
    await page.locator('#finding-manual').fill('Çıplak kablo görüldü.');
    await page.click('button[onclick="toggleHayatiRisk()"]');
    await page.click('button[onclick="saveFinding()"]');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].hayatiRisk).toBe(true);
  });
});

// Faz 11, PWA planı madde 1/3/5/9 (2026-09-08) -- SUPV-22'nin chip/pasif-
// hatırlatma UI'sı KALDIRILDI, yerini Hızlı Kritik Kontrol'ün 2-butonlu
// (Sorun Yok / Sorun Var) yapılandırılmış cevabı aldı. checklist-
// kutuphanesi.js'deki checklistKaynagiBul (basit anahtar-kelime
// eşleşmesi) HÂLÂ kullanılıyor -- yalnız artık CHECKLIST_KUTUPHANESI
// (tüm maddeler) değil KRITIK_KONTROL_KUTUPHANESI (yalnız kritik
// etiketliler) sorgulanıyor.
const { sahteKameraKur } = require('./media-mocks');

async function _denetimBaslatAlanTipiIle(page, alanTipiChipMetni) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip', { hasText: alanTipiChipMetni }).click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
}

// 2026-09-08 dis inceleme B06 duzeltmesi -- sektoru olan bir kurum, ilgili
// alan tipinde SEKTOR_KAYNAKLARI'ndan gelen coklu-kaynak (MEB + evrensel)
// icerigi gormeli. `gercekKurumEkle`'nin gercek UI formu sektor alani
// SUNMUYOR (sektor yalniz QR/Desktop senkronundan gelir, bu duzeltmeyle
// eklendi) -- bu yuzden kurum kaydi olusturulduktan SONRA IndexedDB'de
// dogrudan guncellenir (gercek QR akisinin YAPACAGI seyin kisa yolu).
async function _denetimBaslatSektorIle(page, { sektor, profil, alanTipiChipMetni }) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await page.evaluate(async ({ kurumAdi, sektor }) => {
    const kurumlar = await window._idb.dbTumu('kurumlar');
    const kurum = kurumlar.find((k) => k.ad === kurumAdi);
    kurum.sektor = sektor;
    await window._idb.dbGuncelle('kurumlar', kurum);
  }, { kurumAdi, sektor });
  await gercekBirimEkle(page, { ad: birimAdi, profil, katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip', { hasText: alanTipiChipMetni }).click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
}

test.describe('Faz 11 -- Hızlı Kritik Kontrol (chip sisteminin yerini alır)', () => {
  test('B06 -- egitim_kurumu sektorlu kurumda MEB kaynaklarindan madde gorunur (raporun kapsam disi dedigi alan tipi)', async ({ page }) => {
    await _denetimBaslatSektorIle(page, {
      sektor: 'egitim_kurumu', profil: 'egitim', alanTipiChipMetni: 'Derslik / amfi',
    });
    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    const yanitlar = await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').count();
    expect(yanitlar).toBeGreaterThan(0);
    // Alt yazıda birden fazla farklı kaynak adı (MEB + varsa evrensel)
    // görünmeli -- eski tek-kaynak sürümünde her zaman TEK bir ad vardı.
    const altYazi = await page.locator('#kritik-kontrol-alt-yazi').textContent();
    expect(altYazi).toContain(',');
  });

  test('B06 -- sektoru olmayan (eski/senkronsuz) kurumda eski tek-kaynak davranisi kademeli olarak korunur', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    const maddeler = await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').count();
    expect(maddeler).toBeGreaterThan(0);
  });

  test('R11 -- kanal kazısı anahtar kelimesiyle eşleşen alan tipinde kaynak listesi tekilleştirilir', async ({ page }) => {
    // İkinci bağımsız inceleme R11 (2026-09-09): "csgb_kanal_kazisi"
    // hem eski tek-kaynak (anahtar-kelime) eşleşmesiyle HEM evrensel
    // kaynak listesinde geliyordu -- sektörsüz kurumda [eskiKod,
    // ...evrensel] birleştirmesi aynı kodu iki kez üretiyordu (21
    // satır/14 benzersiz kimlik, gerçek veriyle doğrulandı).
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const kodlar = await page.evaluate(async () => {
      const eski = currentSession.alanTipi;
      currentSession.alanTipi = 'Kanal Kazısı Alanı';
      const kaynaklar = await _kritikKontrolKaynaklariBul();
      currentSession.alanTipi = eski;
      return kaynaklar.map(k => k.kod);
    });
    expect(kodlar).toContain('csgb_kanal_kazisi');
    expect(new Set(kodlar).size).toBe(kodlar.length);
  });


  test('eslesen alan tipinde kritik kontrol basligi ve madde satiri gorunur', async ({ page }) => {
    // HIZLI_ALANLAR.genel[0] === 'Ofis / idari oda' -- "ofis" anahtar
    // kelimesi csgb_ofisler'e eşleşir, o kaynağın kritik maddeleri vardır.
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    await expect(page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first()).toBeVisible();
  });

  test('eski chip elemanlari artik DOM da yok (kaldirildi)', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await expect(page.locator('#checklist-chip-baslik')).toHaveCount(0);
    await expect(page.locator('#checklist-chip-grup')).toHaveCount(0);
  });

  test('eslesmeyen alan tipinde sektore ozel kaynak gorunmez, ama evrensel tesis-geneli sorular gorunur (B06)', async ({ page }) => {
    // "Toplantı salonu" hiçbir sektöre-özel kaynağın anahtarKelimeler
    // listesiyle eşleşmez -- ESKİDEN bu durumda başlık TAMAMEN gizli
    // kalıyordu. 2026-09-08 dış inceleme B06 düzeltmesi: evrensel
    // kaynaklardaki (`csgb_kanal_kazisi` vb.) TÜM maddeler tesis_geneli
    // olduğu için (Desktop'un kendi algoritmasıyla AYNI) her alan
    // tipinde -- eşleşen/eşleşmeyen fark etmeksizin -- aday olurlar.
    await _denetimBaslatAlanTipiIle(page, 'Toplantı salonu');
    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    const yanitlar = await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').count();
    expect(yanitlar).toBeGreaterThan(0);
    // Sektöre-özel (Ofis'e özgü) kaynak GÖRÜNMEMELİ -- yalnız evrensel.
    await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first().locator('.kk-yok').click();
    const kaydedilen = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(kaydedilen[0].kaynakKod).not.toBe('csgb_ofisler');
  });

  test('Sorun Yok basilinca IndexedDBde durum=sorun_yok kaydedilir, bulgu OLUSMAZ', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first()
      .locator('.kk-yok').click();

    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar.length).toBe(1);
    expect(yanitlar[0].durum).toBe('sorun_yok');
    expect(yanitlar[0].kaynakKod).toBe('csgb_ofisler');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(0);
  });

  test('Kapsam Disi basilinca durum=kapsam_disi kaydedilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first()
      .locator('.kk-disi').click();

    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar[0].durum).toBe('kapsam_disi');
  });

  test('Sorun Var -- kamera acilir, fotografsiz kaydedilmez, foto cekince bulgu olusur', async ({ page }) => {
    await sahteKameraKur(page);
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');

    await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first()
      .locator('.kk-var').click();
    await expect(page.locator('#camera-ui')).toBeVisible();
    // Sahte video akışının gerçekten kare üretmeye başladığını bekle (bkz.
    // ah-dof-kanit-medya.spec.js emsali) -- aksi halde capturePhoto()
    // videoWidth=0 ile boş bir kare yakalar.
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });

    // Foto çekilmeden (kamera kapatılmadan) hiçbir kayıt OLUŞMAMALI.
    let bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(0);

    await page.click('button[onclick="capturePhoto()"]');
    // capturePhoto()'nun onclick işleyicisi ASENKRON (_kritikKontrolFotoKaydet
    // IndexedDB yazımlarını await eder) -- Playwright'ın click() çağrısı
    // bunu BEKLEMEZ, bu yüzden storeTumu ham okumasından ÖNCE otomatik
    // TEKRAR-DENEYEN bir expect() ile (Saha Tespitleri listesi) işin
    // gerçekten bittiği kanıtlanır.
    await expect(page.locator('#findings-list .finding-item')).toHaveCount(1);

    bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].kritikKontrol).toBe(true);
    expect(bulgular[0].fotolar.length).toBe(1);

    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar[0].durum).toBe('sorun_var');
    expect(yanitlar[0].bulguId).toBe(bulgular[0].id);
  });

  test('kritikKontrol bulgusu normal bulgu listesinden ayri sayilir (checklist alani null kalir)', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#finding-manual').fill('Sadece elle yazıldı.');
    await page.click('button[onclick="saveFinding()"]');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].checklist).toBeNull();
    expect(bulgular[0].kritikKontrol).toBeUndefined();
  });

  test('Kalanlari Onayla -- isaretlenmemis TUM maddeler sorun_yok olur, tamamlama kaydi olusur', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const maddeSayisi = await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').count();
    expect(maddeSayisi).toBeGreaterThan(0);

    await page.click('#kk-kalanlari-onayla-btn');
    // Asenkron onclick -- storeTumu ham okumasından ÖNCE otomatik
    // TEKRAR-DENEYEN bir expect() ile işin bittiği kanıtlanır (bkz.
    // yukarıdaki "Sorun Var" testinin AYNI yorumu).
    await expect(page.locator('#kritik-kontrol-liste')).toContainText('tamamlandı');

    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar.length).toBe(maddeSayisi);
    expect(yanitlar.every((y) => y.durum === 'sorun_yok')).toBe(true);

    const tamamlamalar = await storeTumu(page, 'kritikKontrolTamamlama');
    expect(tamamlamalar.length).toBe(1);
  });

  test('B07 -- Kalanlari Onayla sonrasi tamamlama beyani ZIPe export edilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.click('#kk-kalanlari-onayla-btn');
    await expect(page.locator('#kritik-kontrol-liste')).toContainText('tamamlandı');

    const tamamlamalar = await storeTumu(page, 'kritikKontrolTamamlama');
    expect(tamamlamalar.length).toBe(1);

    const { paket } = await _zipPaketiniAl(page);
    expect(paket.tamamlama).toBeTruthy();
    expect(paket.tamamlama.length).toBe(1);
    expect(paket.tamamlama[0].odaId).toBe(tamamlamalar[0].odaId);
    expect(paket.tamamlama[0].zaman).toBe(tamamlamalar[0].zaman);
  });

  test('B11 -- ayni birimde/gunde ikinci odaya gecince AYNI ziyaretId kullanilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const denetimlerIlk = await storeTumu(page, 'denetimler');
    expect(denetimlerIlk.length).toBe(1);
    const ilkZiyaretId = denetimlerIlk[0].ziyaretId;
    expect(ilkZiyaretId).toBeTruthy();
    expect(ilkZiyaretId).toBe(`${denetimlerIlk[0].birimId}|${denetimlerIlk[0].baslangic.slice(0, 10)}`);

    // Ayni birimde IKINCI bir odaya gec (farkli alan tipi) -- gercek
    // sahada ayni fiziksel ziyarette birden fazla oda gezme senaryosu.
    await page.click('button[onclick="_odaSecimineDon()"]');
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    await page.locator('#kat-alan-hizli-chips .chip', { hasText: 'Toplantı salonu' }).click();
    await page.locator('#kat-alan-oda-no').fill('102');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    const denetimlerSonra = await storeTumu(page, 'denetimler');
    expect(denetimlerSonra.length).toBe(2);
    const ikinciDenetim = denetimlerSonra.find((d) => d.id !== denetimlerIlk[0].id);
    expect(ikinciDenetim.ziyaretId).toBe(ilkZiyaretId);

    const { paket } = await _zipPaketiniAl(page);
    expect(paket.denetim.ziyaretId).toBe(ilkZiyaretId);
  });

  test('B11 -- canli ekran: ayni ziyarette farkli odada tesis geneli soru tekrar CIKMAZ', async ({ page }) => {
    // "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?" -- csgb_ofisler
    // kaynağının tesis_geneli:true tek maddesi (bkz. kritik-kontrol-
    // kutuphanesi.js). Ayni chip ('Ofis / idari oda') IKI FARKLI oda
    // numarasiyla kullanilarak, ikisi de AYNI kaynaga (csgb_ofisler)
    // cozulur -- yalniz oda NUMARASI farkli, boylece ziyaret-kapsamli
    // dedup'in GERCEKTEN devrede oldugu (kaynak farkliligindan degil)
    // izole ediliyor.
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const tesisGeneliSatiri = page.locator(
      '.kritik-kontrol-satir', { hasText: 'Kaçak akım rölesi' });
    await expect(tesisGeneliSatiri).toBeVisible();
    await tesisGeneliSatiri.locator('.kk-yok').click();
    await expect(page.locator('#kritik-kontrol-liste')).not.toContainText('Kaçak akım rölesi');

    // Ayni birimde IKINCI bir odaya (farkli oda no, AYNI alan tipi) gec --
    // gercek sahada ayni fiziksel ziyarette birden fazla oda gezme
    // senaryosu.
    await page.click('button[onclick="_odaSecimineDon()"]');
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    await page.locator('#kat-alan-hizli-chips .chip', { hasText: 'Ofis / idari oda' }).click();
    await page.locator('#kat-alan-oda-no').fill('205');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    // Ikinci (farkli) odada: kritik kontrol basligi hala gorunur (o odaya
    // ozel/evrensel baska maddeler var), AMA tesis-geneli soru bir daha
    // ADAY OLARAK CIKMAMALI.
    await expect(page.locator('#kritik-kontrol-baslik')).toBeVisible();
    await expect(page.locator('#kritik-kontrol-liste')).not.toContainText('Kaçak akım rölesi');
  });

  test('ZIP export -- kritikKontrol[] gercekten yaziliyor, sorun_var bulgusu tespitler[]e KARISMAZ (PWA plani madde 9)', async ({ page }) => {
    await sahteKameraKur(page);
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');

    const satirlar = page.locator('#kritik-kontrol-liste .kritik-kontrol-satir');
    // İlk madde -- Sorun Var (foto ile).
    await satirlar.first().locator('.kk-var').click();
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#findings-list .finding-item')).toHaveCount(1);
    // İkinci madde -- Sorun Yok.
    await satirlar.nth(1).locator('.kk-yok').click();

    // Setup ekranına dön (yedekModalAc oradan erişilir -- _odaSecimineDon
    // ile AYNI navigasyon, bkz. ab-location-chip-room-complete.spec.js --
    // o dosya hasTouch:true ile page.tap() kullanıyor, bu dosyada hasTouch
    // YOK, bu yüzden click() kullanılıyor).
    await page.click('button[onclick="_odaSecimineDon()"]');
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    for (let i = 0; i < 3; i++) {
      if (await page.locator('#screen-setup').evaluate((el) => el.classList.contains('active'))) break;
      await page.click('button[onclick="katAlanGeri()"]');
      await page.waitForTimeout(300);
    }
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    await page.click('button[onclick="yedekModalAc()"]');
    await expect(page.locator('#modal-form')).toBeVisible();
    const kutular = page.locator('.yedek-birim-cb');
    await kutular.first().waitFor({ state: 'attached' });
    const adet = await kutular.count();
    for (let i = 0; i < adet; i++) await kutular.nth(i).check();
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#form-action-btn'),
    ]);
    const zipYolu = path.join(os.tmpdir(), `pwa-test-e-kk-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(zipYolu);
    try {
      const zip = new AdmZip(zipYolu);
      const jsonGirdi = zip.getEntries().find((e) => e.entryName === 'denetimler.json');
      expect(jsonGirdi).toBeTruthy();
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      const paket = paketler[0];

      expect(paket.kritikKontrol).toBeTruthy();
      expect(paket.kritikKontrol.length).toBe(2);
      const sorunVarGirdi = paket.kritikKontrol.find((k) => k.durum === 'sorun_var');
      const sorunYokGirdi = paket.kritikKontrol.find((k) => k.durum === 'sorun_yok');
      expect(sorunVarGirdi).toBeTruthy();
      expect(sorunYokGirdi).toBeTruthy();
      expect(sorunVarGirdi.kaynakKod).toBe('csgb_ofisler');
      expect(sorunVarGirdi.odaId).toBeTruthy();
      expect(sorunVarGirdi.fotolar.length).toBe(1);
      expect(typeof sorunVarGirdi.soru).toBe('string');

      // Fotoğraf dosyası ZIP'te GERÇEKTEN var mı.
      const fotoGirdi = zip.getEntries().find((e) => e.entryName === `fotolar/${sorunVarGirdi.fotolar[0]}`);
      expect(fotoGirdi).toBeTruthy();

      // kritikKontrol kaynaklı bulgu tespitler[]e KARIŞMAMALI (aksi halde
      // desktop zip_import.py AYNI gözlem için İKİ bulgu oluştururdu).
      expect(paket.tespitler.length).toBe(0);
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });

  // 2026-09-08 dis inceleme B01/B04/B13 duzeltmeleri.
  async function _zipPaketiniAl(page) {
    await page.click('button[onclick="_odaSecimineDon()"]');
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    for (let i = 0; i < 3; i++) {
      if (await page.locator('#screen-setup').evaluate((el) => el.classList.contains('active'))) break;
      await page.click('button[onclick="katAlanGeri()"]');
      await page.waitForTimeout(300);
    }
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.click('button[onclick="yedekModalAc()"]');
    await expect(page.locator('#modal-form')).toBeVisible();
    const kutular = page.locator('.yedek-birim-cb');
    await kutular.first().waitFor({ state: 'attached' });
    const adet = await kutular.count();
    for (let i = 0; i < adet; i++) await kutular.nth(i).check();
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#form-action-btn'),
    ]);
    const zipYolu = path.join(os.tmpdir(),
      `pwa-test-e-kk-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(zipYolu);
    const zip = new AdmZip(zipYolu);
    const jsonGirdi = zip.getEntries().find((e) => e.entryName === 'denetimler.json');
    const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
    fs.rmSync(zipYolu, { force: true });
    return { paket: paketler[0], zip };
  }

  test('B01 -- yanit Sorun Var dan Sorun Yoka cevrilince eski fotoflu bulgu ZIPte kaybolmaz, tespit olarak tasinir', async ({ page }) => {
    await sahteKameraKur(page);
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');

    // "raflar" sorusu (madde_sira 3, tesis_geneli:false, alan_tipleri
    // Ofis'i kapsar) BİLEREK seçildi -- satirlar.first() bu kaynağın İLK
    // tesis_geneli maddesine (madde_sira 18) denk geliyor, ve tesis-geneli
    // bir madde cevaplanınca `_kritikKontrolMaddeleriGetir`in "cevaplanmamış
    // adaylar" filtresi (denetimCapindaCevaplanmis) yüzünden bir SONRAKİ
    // render'da LİSTEDEN TAMAMEN DÜŞÜYOR -- aynı satırı ikinci kez
    // tıklamaya çalışmak yanlış (kaybolmuş) bir satırı hedefler. Alan-tipi
    // maddeler böyle filtrelenmiyor (her zaman görünür kalır, sadece
    // rengi/durumu güncellenir) -- bu yüzden metin eşleşmesiyle, POZİSYON
    // yerine, AYNI satır güvenle iki kez bulunabiliyor.
    const raflarSatiri = page.locator('.kritik-kontrol-satir', { hasText: 'raflar' });
    await raflarSatiri.locator('.kk-var').click();
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#findings-list .finding-item')).toHaveCount(1);

    const bulgularOnce = await storeTumu(page, 'bulgular');
    const eskiBulguId = bulgularOnce[0].id;

    // Fikir degistirir -- ayni maddeyi Sorun Yok'a cevirir. Asenkron
    // onclick (_kritikKontrolYanitVer) -- ham storeTumu okumasindan ONCE
    // otomatik TEKRAR-DENEYEN expect ile isin bittigi kanitlanir
    // (yukaridaki "Sorun Var" testinin AYNI gerekcesi).
    await raflarSatiri.locator('.kk-yok').click();
    await expect(raflarSatiri.locator('.kk-yok')).toHaveCSS('background-color', 'rgb(39, 174, 96)');
    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar.length).toBe(1);
    expect(yanitlar[0].durum).toBe('sorun_yok');
    expect(yanitlar[0].bulguId).toBeNull();

    // Eski bulgu IndexedDB'de SILINMEDEN kalir (otomatik silme YASAK).
    const bulgularSonra = await storeTumu(page, 'bulgular');
    expect(bulgularSonra.length).toBe(1);
    expect(bulgularSonra[0].id).toBe(eskiBulguId);

    const { paket, zip } = await _zipPaketiniAl(page);
    try {
      // Guncel yanit sorun_yok -- kritikKontrol[] icinde foto/soru TASIMAZ.
      expect(paket.kritikKontrol.length).toBe(1);
      expect(paket.kritikKontrol[0].durum).toBe('sorun_yok');
      expect(paket.kritikKontrol[0].fotolar).toBeUndefined();

      // Eski fotografli bulgu artik SESSIZCE KAYBOLMAZ -- normal tespitler[]
      // yoluyla tasinir.
      expect(paket.tespitler.length).toBe(1);
      expect(paket.tespitler[0].fotolar.length).toBe(1);
      const fotoGirdi = zip.getEntries().find(
        (e) => e.entryName === `fotolar/${paket.tespitler[0].fotolar[0]}`);
      expect(fotoGirdi).toBeTruthy();

      // R07 -- geri alinan kritik-kontrol kaniti BAGLAMSIZ tasinmiyor:
      // Desktop'ta bunun sirf sorulan sorunun metni gibi gorunup YENI/
      // acik bir sorun sanilmamasi icin not'a acik bir baglam etiketi
      // eklenmis olmali.
      expect(paket.tespitler[0].not).toContain('GERİ ALINAN');
      expect(paket.tespitler[0].not).toContain('raflar');
    } finally {
      // zip nesnesi zaten dosyadan okundu, ek temizlik gerekmiyor.
    }
  });

  test('B04/B10 -- kritik bulgu silinince ZIP fotografsiz sorun_var uretmez', async ({ page }) => {
    await sahteKameraKur(page);
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');

    const satirlar = page.locator('#kritik-kontrol-liste .kritik-kontrol-satir');
    await satirlar.first().locator('.kk-var').click();
    await expect(page.locator('#camera-ui')).toBeVisible();
    await page.waitForFunction(() => {
      const v = document.getElementById('video');
      return v && v.videoWidth > 0;
    });
    await page.click('button[onclick="capturePhoto()"]');
    await expect(page.locator('#findings-list .finding-item')).toHaveCount(1);

    await page.locator('.finding-item button').first().click();
    await page.click('#modal-action-btn');
    await expect(page.locator('#findings-list .finding-item')).toHaveCount(0);

    // 2026-09-09 ikinci dis inceleme R06 duzeltmesi -- kanit silme ARTIK
    // OTOMATIK "sorun_yok" beyani URETMEZ (kullanici bunu ACIKCA
    // soylemedi). Yanit satiri SILINIR -- soru tekrar CEVAPSIZ olur,
    // ZIP'e hic girmez (Desktop'ta da bu madde "henuz kontrol edilmedi"
    // olarak kalir, YANLIS bir olumlu sonuc GORUNMEZ).
    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(yanitlar.length).toBe(0);

    const { paket } = await _zipPaketiniAl(page);
    expect(paket.kritikKontrol.length).toBe(0);
    expect(paket.tespitler.length).toBe(0);
  });

  test('B13 -- saha yanit zamani ZIPe export edilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#kritik-kontrol-liste .kritik-kontrol-satir').first()
      .locator('.kk-yok').click();

    const yanitlar = await storeTumu(page, 'kritikKontrolYanitlari');
    expect(typeof yanitlar[0].zaman).toBe('string');

    const { paket } = await _zipPaketiniAl(page);
    expect(paket.kritikKontrol[0].sahaZamani).toBe(yanitlar[0].zaman);
  });

  test('B05 -- denetim.alanTipi ZIPe export edilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler[0].alanTipi).toBeTruthy();

    const { paket } = await _zipPaketiniAl(page);
    expect(paket.denetim.alanTipi).toBe(denetimler[0].alanTipi);
  });
});
