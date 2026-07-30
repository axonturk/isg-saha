// PWA 4R-PKG-3E-FINAL/3F -- hash route tabanlı DÖF ekranları, ortak sayaç/
// source-of-truth (_dofMedyaSayaclariHesapla), Kaydet native disabled
// sözleşmesi ve Paylaşmayı Dene'nin otomatik ZIP indirme fallback'inin
// KALDIRILMASI. 3F ile üç seviyeli route'a (home/package/work) geçildi --
// bu dosya artık "paketi aç" adımını (home -> package) içerir. Gerçek
// servisler (dofReplayZipOlustur, dofDonusBelgesiOlustur,
// dofPaketiDegismisDofUuidleri, dofKanitMedyasiEkle/Sil) DEĞİŞTİRİLMEDİ --
// bu dosya yalnız UI/route/state katmanını test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
const { sahteMikrofonKur } = require('./media-mocks');

/** 1x1 şeffaf PNG -- galeri yükleme testleri için gerçek, geçerli görsel. */
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
}

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AS-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

/** 4R-PKG-3F: paket ekranına gir -- ana ekrandaki paket kartının "Aç"
 * butonuna basar (gerçek UI akışı, doğrudan hash yazmaz). */
async function paketiAc(page, paketUuid) {
  await page.locator(`[data-paket-uuid="${paketUuid}"] button`, { hasText: 'Aç' }).click();
  await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
}

async function paylasimMockKur(page, { destekli, hataAt = null }) {
  await page.addInitScript(({ destekli, hataAt }) => {
    window.__paylasimCagrilari = [];
    navigator.canShare = (veri) => destekli && !!(veri && veri.files);
    navigator.share = async (veri) => {
      window.__paylasimCagrilari.push({ dosyaAdi: veri.files[0].name });
      if (hataAt) { const e = new Error(hataAt.mesaj); e.name = hataAt.ad; throw e; }
      return undefined;
    };
  }, { destekli, hataAt });
}

test.describe('AS. DÖF replay route/state final (4R-PKG-3E-FINAL/3F)', () => {
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

  test('1. Home route -- import sonrası #home, paket kartı görünür, paket/çalışma alanları görünmez', async ({ page }) => {
    const { paketUuid } = await tekDofKur(page);
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator(`[data-paket-uuid="${paketUuid}"]`)).toBeVisible();
    await expect(page.locator('#dof-package-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-work-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-takip-form-kart')).toBeHidden();
    await expect(page.locator('#dof-replay-kart')).toBeHidden();
  });

  test('2. Work route -- paketi aç, DÖF kartına tıkla, #dof-work/<uuid>, paket/liste görünmez, yalnız aktif DÖF görünür', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();

    await expect(page).toHaveURL(new RegExp(`#dof-work/${dofUuid}$`));
    await expect(page.locator('#home-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-package-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-work-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await expect(page.locator('#dof-kanit-medya-kart')).toBeVisible();
    await expect(page.locator('#dof-aktif-baslik-kart')).toBeVisible();
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('AS-1');
  });

  test('2b. Geçersiz dofUuid -- güvenli şekilde home\'a döner, kırık ekranda kalınmaz', async ({ page }) => {
    await tekDofKur(page);
    // hashchange olayı asenkron gelir -- `toHaveURL`/`toBeVisible` otomatik
    // tekrar dener, doğrudan bir router fonksiyonu çağırmaya gerek yok.
    await page.evaluate(() => { location.hash = '#dof-work/uydurma-uuid-yok'; });
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-work-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-liste-durum')).toContainText('bulunamadı');
  });

  test('2c. Geçersiz paketUuid -- güvenli şekilde home\'a döner, kırık ekranda kalınmaz', async ({ page }) => {
    await tekDofKur(page);
    await page.evaluate(() => { location.hash = '#dof-package/uydurma-paket-yok'; });
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-package-mod-blok')).toBeHidden();
    await expect(page.locator('#dof-liste-durum')).toContainText('bulunamadı');
  });

  test('3. Listeye Dön / browser back -- work -> package, package -> home', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page.locator('#dof-work-mod-blok')).toBeVisible();

    // "Listeye Dön" -- work'ten PAKET ekranına döner (home'a değil).
    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-work-mod-blok')).toBeHidden();

    // "Ana Sayfaya Dön" -- package'dan home'a döner.
    await page.locator('button', { hasText: 'Ana Sayfaya Dön' }).click();
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-package-mod-blok')).toBeHidden();

    // Tekrar work moduna gir, bu kez tarayıcı geri tuşuyla package'a dön.
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page.locator('#dof-work-mod-blok')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-work-mod-blok')).toBeHidden();

    // Package'dan browser back ile home'a dön.
    await page.goBack();
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-package-mod-blok')).toBeHidden();
  });

  test('4. Kaydet state -- pasifken kayıt yapmaz, sorumlu yazınca aktifleşir, kaydet sonrası pasif olur, alt bar günceli gösterir', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();

    const kaydetBtn = page.locator('#dof-takip-kaydet-btn');
    await expect(kaydetBtn).toBeDisabled();

    // Native disabled buton gerçek tarayıcıda tıklansa bile click event'i
    // ateşlemez -- guard'ın kendisini (handler başındaki `disabled || !isDirty`
    // kontrolü) doğrudan çağırarak da doğruluyoruz: kayıt yapmaz, DB
    // değişmez.
    await page.evaluate(() => window._dofTakipKaydet());
    await expect(page.locator('#dof-takip-durum')).toHaveText('Değişiklik yok.');
    const kayitOnce = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayitOnce.takipTaslagi).toBeUndefined();

    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await expect(kaydetBtn).toBeEnabled();

    await kaydetBtn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(kaydetBtn).toBeDisabled();

    await expect(page.locator('#dof-replay-paket-ozet')).toHaveText(/^Paket: 1 DÖF · \d+ Foto · \d+ Ses$/);
  });

  test('5. Medya sayaçları -- gerçek UI akışıyla ses/foto ekleyince kanıt özeti, alt bar VE liste kartı rozeti AYNI sayıyı gösterir', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('Henüz kanıt eklenmedi.');

    // Gerçek ses kaydı akışı (sanal donanım) -- `_dofMedyaSonrasiYenile`
    // burada TETİKLENİR (yalnız servis bridge'i DEĞİL, gerçek UI akışı).
    const sesBtn = page.locator('#dof-kanit-ses-btn');
    await sesBtn.click();
    await expect(sesBtn).toContainText('Durdur');
    await page.waitForTimeout(400);
    await sesBtn.click();
    await expect(sesBtn).toContainText('Ses Notu');
    await expect(page.locator('#dof-kanit-medya-durum')).toHaveText('Ses notu eklendi.');
    await expect(page.locator('#dof-kanit-medya-ozet')).not.toContainText('Henüz kanıt eklenmedi.');
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 ses notu eklendi.');

    // Gerçek galeri yükleme akışı.
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf · 1 ses notu');

    // Alt bar aynı toplamları AYNI ANDA (medya ekleme henüz takip Kaydet
    // gerektirmeden) yansıtsın diye önce bir takip alanı kaydedilir --
    // alt bar paket özeti yalnız "değişmiş" DÖF'leri sayar.
    await page.locator('#dof-takip-sorumlu').fill('Sayac Testi');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(page.locator('#dof-replay-paket-ozet')).toHaveText('Paket: 1 DÖF · 1 Foto · 1 Ses');

    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    const kart = page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`);
    await expect(kart).toContainText('foto 1');
    await expect(kart).toContainText('ses 1');
  });

  test('6. Paylaşmayı Dene -- canShare false/AbortError/gerçek hata HİÇBİRİNDE otomatik indirme yok; ZIP İndir hâlâ çalışır', async ({ page }) => {
    await paylasimMockKur(page, { destekli: false });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await page.locator('#dof-takip-sorumlu').fill('Paylas Testi');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    // 4R-PKG-3H: "Paylaşmayı Dene" artık tıklama anında ZIP üretmiyor --
    // arka planda önceden hazırlanmış cache'in hazır olmasını bekle.
    await page.waitForFunction(() => {
      const c = window._dofPaylasimZipCacheOku && window._dofPaylasimZipCacheOku();
      return !!(c && c.hazir);
    }, { timeout: 5000 });

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('ZIP İndir düğmesini kullanın');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    expect(indirme.suggestedFilename()).toMatch(/\.zip$/);
  });

  test('7. ZIP sözleşmesi -- root yapısı değişmez, dof_donus.json/fotolar//sesler/ kökte, yasak alan yok', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await page.locator('#dof-takip-sorumlu').fill('ZIP Sozlesme Testi');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    const geciciYol = path.join(os.tmpdir(), `pwa-test-as-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(geciciYol);
    const zip = new AdmZip(geciciYol);
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toContain('dof_donus.json');
    expect(adlar.some((a) => a.startsWith('dof_replay_'))).toBe(false);   // wrapper klasör yok
    expect(indirme.suggestedFilename()).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri.length).toBe(1);
    const k = belge.dofKontrolleri[0];
    for (const yasakli of [
      'dofId', 'durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto',
      'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
    expect(k.dofUuid).toBe(dofUuid);
  });

  test('8. Version badge -- PWA isg-saha-v31 · 4R-PKG-3K görünür', async ({ page }) => {
    const rozet = page.locator('#build-info');
    await expect(rozet).toBeVisible();
    await expect(rozet).toContainText('isg-saha-v31');
    await expect(rozet).toContainText('4R-PKG-3K');
  });
});
