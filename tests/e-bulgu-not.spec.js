// PWA Commit 2 / Bölüm E -- yazılı bulgu kaydı karakterizasyonu.
// Gerçek alanlar app.js:1179'daki `const bulgu = {...}` satırından çıkarıldı:
// id, denetimId, metin, fotolar, sesler, hayatiRisk, zaman.
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

test.describe('Faz 11 -- Hızlı Kritik Kontrol (chip sisteminin yerini alır)', () => {
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

  test('eslesmeyen alan tipinde kritik kontrol basligi gizli kalir', async ({ page }) => {
    // "Toplantı salonu" hiçbir kaynağın anahtarKelimeler listesiyle eşleşmez.
    await _denetimBaslatAlanTipiIle(page, 'Toplantı salonu');
    await expect(page.locator('#kritik-kontrol-baslik')).toBeHidden();
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
});
