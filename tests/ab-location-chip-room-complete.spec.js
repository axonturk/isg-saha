// PWA UX Commit -- üst konum chip bar + "Bu Odayı Tamamla" hızlı oda
// seçimine dönüş. Eski düz "Bina / Kat / Oda X" breadcrumb metni AYNI
// veriden (currentSession.bina/kat/oda) kompakt, seçilemeyen chip'lere
// bölündü (app.js::updateLocationDisplay) -- veri modeli, konum eşleşme
// anahtarı (kurumId+birimId+odaId+tur) ve 4M "mevcut denetime devam"
// davranışı DEĞİŞMEDİ. "Bu Odayı Tamamla" (app.js::_odaSecimineDon)
// denetimi silmeden/kilitlemeden aynı kurum/birim/kat bağlamındaki
// oda/mahal seçim ekranına (#screen-kat-alan) döner.
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

const KUCUK_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
function kucukPngBuffer() {
  return Buffer.from(KUCUK_PNG_B64, 'base64');
}

test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

// "Rektörlük" değil "Rektörlük Binası" -- #setup-birim açılır listesindeki
// sabit "+ Yeni: Rektörlük" kısayol seçeneğiyle (PROFILLER.rektorluk.ad)
// metin çakışmasını önler (bkz. tests/aa-mobile-field-hotfix.spec.js).
async function _kurumBirimHazirla(page, birimAdi = 'Rektörlük Binası') {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

// #screen-kat-alan ZATEN aktifken oda/mahal formunu doldurup denetimi
// başlatır (chip + oda no + Devam) -- ekranKatAlanaGec() TEKRAR tıklanmaz,
// o buton yalnız #screen-setup üzerinde var.
async function _odaSecFormDoldurVeBaslat(page, odaNo = '101') {
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.locator('#kat-alan-hizli-chips .chip').first().tap();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.tap('button[onclick="startInspection()"]');
  await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
}

// #screen-setup'tan başlayarak kat-alan'a geçip odayı seçer.
async function _konumaGir(page, odaNo = '101') {
  await page.tap('button[onclick="ekranKatAlanaGec()"]');
  await _odaSecFormDoldurVeBaslat(page, odaNo);
}

async function _bulguKaydet(page, metin) {
  await page.locator('#finding-manual').fill(metin);
  await page.tap('button[onclick="saveFinding()"]');
  await expect(page.locator('#findings-list')).toContainText(metin);
}

async function _odayiTamamla(page) {
  await page.tap('button[onclick="_odaSecimineDon()"]');
  await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
}

// GERÇEK ölçüm: Tamamla sonrası kat-alan'da geri (katAlanGeri) tek tıkla
// setup'a gitmiyor -- _ekraniDegistir (replaceState) inceleme yerine
// kat-alan'ı yazdığı için üst üste iki "kat-alan" history seviyesi oluşur.
// İlk geri, görsel olarak no-op (yine kat-alan); ikinci geri setup'a
// ulaşır. KRİTİK OLAN: hiçbir zaman tamamlanan #screen-inspection'a GERİ
// DÖNMEMESİ (eski pushState davranışının ürettiği kafa karıştırıcı döngü).
async function _tamamlaSonrasiSetupaDon(page) {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('#screen-setup').evaluate((el) => el.classList.contains('active'))) return;
    await page.tap('button[onclick="katAlanGeri()"]');
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#screen-setup')).toHaveClass(/active/);
}

test.describe('AB. Üst konum chip bar + Bu Odayı Tamamla', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('A. Üst konum chip bar görünür -- AKTİF KONUM + birim + kat + oda kart-chip olarak, ikonlu', async ({ page }) => {
    const { birimAdi } = await _kurumBirimHazirla(page);
    await _konumaGir(page);

    // Tam yol "{bina} / {kat} / Oda {oda}" -- "/" ile bölünüp her parça ayrı
    // bir kart-chip olur (oda alanı kendi içinde de "/" içerebilir, ör.
    // "Ofis / idari oda" -- bu durumda ek chip'ler doğal olarak oluşur).
    const chipler = page.locator('#current-loc-display .konum-chip');
    const sayi = await chipler.count();
    expect(sayi).toBeGreaterThanOrEqual(4);   // en az: etiket + bina + kat + oda
    await expect(chipler.nth(0)).toHaveText('AKTİF KONUM');
    await expect(chipler.nth(0)).toHaveClass(/konum-chip-etiket/);
    await expect(chipler.nth(1)).toHaveText(birimAdi);
    await expect(chipler.nth(2)).toHaveText('Zemin');
    // Her chip'te bir ikon (<i class="fas ...">) olmalı.
    await expect(chipler.first().locator('i.fas')).toHaveCount(1);

    // Ayrı bir düz-metin başlık YOK -- kart satırı TEK bilgi kaynağıdır
    // (kullanıcı talebiyle sadeleştirildi).
    await expect(page.locator('#current-loc-baslik')).toHaveCount(0);
  });

  test('B. Text selection/callout engellenir -- .header korunan mobil hotfix davranışı', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);

    const stil = await page.locator('#current-loc-display').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { userSelect: cs.userSelect, webkitTouchCallout: cs.webkitTouchCallout || 'none' };
    });
    expect(stil.userSelect).toBe('none');

    const headerStil = await page.locator('#screen-inspection .header').evaluate((el) => getComputedStyle(el).userSelect);
    expect(headerStil).toBe('none');

    // Geri butonu hâlâ tıklanabilir -- user-select navigasyonu engellemez.
    await page.tap('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
  });

  test('C. Bu Odayı Tamamla ve Geri butonu görünür', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await expect(page.locator('button[onclick="_odaSecimineDon()"]')).toBeVisible();
    await expect(page.locator('button[onclick="_odaSecimineDon()"]')).toContainText('Bu Odayı Tamamla');
    // Üst-sol geri oku (mevcut, değişmedi).
    await expect(page.locator('button[onclick="goToSetup()"]')).toBeVisible();
    // Alt sticky bardaki ayrı "Geri" butonu (bu commit'te eklendi) -- aynı
    // davranışı (_altGeriTikla -> goToSetup) çağırır, farklı onclick metniyle
    // (selector çakışmasını önlemek için).
    await expect(page.locator('button[onclick="_altGeriTikla()"]')).toBeVisible();
    await expect(page.locator('button[onclick="_altGeriTikla()"]')).toContainText('Geri');
  });

  test('D. Bu Odayı Tamamla oda/mahal seçimine döner -- kurum/birim/kat bağlamı korunur', async ({ page }) => {
    const { kurumAdi, birimAdi } = await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _odayiTamamla(page);

    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await expect(page.locator('#kat-alan-baslik')).toContainText(kurumAdi);
    await expect(page.locator('#kat-alan-baslik')).toContainText(birimAdi);
    await expect(page.locator('#kat-alan-kat-chips .chip.active')).toHaveText(/Zemin/);
  });

  test('E. Bulgular korunur -- Bu Odayı Tamamla sonrası aynı odaya dönünce eski bulgu görünür', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _bulguKaydet(page, 'Tamamlanmadan önceki bulgu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');
    await expect(page.locator('#findings-list')).toContainText('Tamamlanmadan önceki bulgu.');
  });

  test('F. Aynı oda mevcut denetime devam eder -- tek denetim, birden fazla bulgu', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _bulguKaydet(page, 'İlk bulgu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page);
    await _bulguKaydet(page, 'İkinci bulgu.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(2);
    expect(bulgular.every((b) => b.denetimId === denetimler[0].id)).toBe(true);
  });

  test('G. Farklı oda yeni denetim oluşturur -- önceki odayla karışmaz', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Oda 101 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
    await _bulguKaydet(page, 'Oda 202 bulgusu.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    expect(new Set(denetimler.map((d) => d.odaId)).size).toBe(2);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(2);
    const denetim101 = denetimler.find((d) => d.odaNo === '101');
    const bulgu101 = bulgular.find((b) => b.denetimId === denetim101.id);
    expect(bulgu101.metin).toBe('Oda 101 bulgusu.');
  });

  test('H. Geri butonu regresyonu yok -- çoklu Tamamla/geri sonrası hâlâ çalışır, tamamlanan odaya döngü yapmaz', async ({ page }) => {
    await _kurumBirimHazirla(page);
    for (let i = 0; i < 3; i++) {
      await _konumaGir(page);
      await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
      await _odayiTamamla(page);
      await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
      // Kritik regresyon kontrolü: Tamamla sonrası geri, kullanıcıyı asla
      // tamamlanan #screen-inspection'a GERİ DÖNDÜRMEMELİ (eski pushState
      // davranışının ürettiği kafa karıştırıcı döngü) -- yalnız kat-alan
      // veya setup arasında ilerlemeli.
      await page.tap('button[onclick="katAlanGeri()"]');
      await page.waitForTimeout(300);
      await expect(page.locator('#screen-inspection')).not.toHaveClass(/active/);
      await _tamamlaSonrasiSetupaDon(page);
    }
    await expect(page.locator('#hata-banner')).toHaveCount(0);
  });

  test('I. Kırmızı hata bandı oluşmaz -- chip bar + Tamamla akışında', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });

    await sahteKameraKur(page);
    await sahteMikrofonKur(page);
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.tap('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => { const v = document.getElementById('video'); return v && v.videoWidth > 0; });
    await page.tap('button[onclick="capturePhoto()"]');
    await _bulguKaydet(page, 'Hata bandı kontrolü.');
    await _odayiTamamla(page);

    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('J. Normal ZIP smoke -- Tamamla sonrası export hâlâ çalışır', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _bulguKaydet(page, 'ZIP smoke bulgusu.');
    await _odayiTamamla(page);
    await _tamamlaSonrasiSetupaDon(page);
    await page.tap('button[onclick="yedekModalAc()"]');
    await expect(page.locator('#modal-form')).toBeVisible();
    const kutular = page.locator('.yedek-birim-cb');
    await kutular.first().waitFor({ state: 'attached' });
    const adet = await kutular.count();
    for (let i = 0; i < adet; i++) await kutular.nth(i).check();
    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.tap('#form-action-btn'),
    ]);
    const zipYolu = path.join(os.tmpdir(), `pwa-test-ab-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(zipYolu);
    try {
      const zip = new AdmZip(zipYolu);
      const jsonGirdi = zip.getEntries().find((e) => e.entryName === 'denetimler.json');
      expect(jsonGirdi).toBeTruthy();
      const paketler = JSON.parse(jsonGirdi.getData().toString('utf-8'));
      expect(paketler[0].tespitler[0].not).toBe('ZIP smoke bulgusu.');
    } finally {
      fs.rmSync(zipYolu, { force: true });
    }
  });

  test('K. DÖF replay smoke -- yalnız dof_donus.json üretir', async ({ page }) => {
    const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'AB-1' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'ab_paketi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
    });
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await page.locator('.dof-liste-karti').first().click();
    await page.locator('#dof-takip-etkinlik-kontrol-tarihi').fill('2026-09-05');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    const [dofIndirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    const dofZipYolu = path.join(os.tmpdir(), `pwa-test-ab-dof-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await dofIndirme.saveAs(dofZipYolu);
    try {
      const zip = new AdmZip(dofZipYolu);
      expect(zip.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    } finally {
      fs.rmSync(dofZipYolu, { force: true });
    }
  });

  test('L. Galeri/kamera smoke -- görünür, geçersiz dosya reddi bozulmadı', async ({ page }) => {
    await sahteKameraKur(page);
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await expect(page.locator('button', { hasText: 'Resim Yükle' })).toBeVisible();
    await expect(page.locator('button[onclick="openOCR(\'kanit\')"]')).toBeVisible();
    // Çek-Onayla + Resim Yükle aynı satırda (.ikili-buton-satiri) -- yapısal kanıt.
    await expect(page.locator('.ikili-buton-satiri button[onclick="openOCR(\'kanit\')"]')).toHaveCount(1);
    await expect(page.locator('.ikili-buton-satiri button', { hasText: 'Resim Yükle' })).toHaveCount(1);

    await page.setInputFiles('#galeri-foto-input', { name: 'not.txt', mimeType: 'text/plain', buffer: Buffer.from('görsel değil') });
    await expect(page.locator('#galeri-foto-durum')).toHaveText('Yalnız görsel dosyası yüklenebilir.');
    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);

    await page.setInputFiles('#galeri-foto-input', { name: 'g.png', mimeType: 'image/png', buffer: kucukPngBuffer() });
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
  });

  test('M. Service Worker smoke -- registration/cache testleri etkilenmez', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await page.waitForFunction(async () => {
      const reg = await navigator.serviceWorker.getRegistration('./sw.js');
      return !!reg;
    }, { timeout: 5000 });
    await _konumaGir(page);
    const sayi = await page.locator('#current-loc-display .konum-chip').count();
    expect(sayi).toBeGreaterThanOrEqual(4);
  });
});
