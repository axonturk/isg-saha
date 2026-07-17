// PWA Mobile Field Hotfix -- gerçek cihazda (Android/Chrome) görülen iki
// sorunu hedefler:
//   1. Bulgu/foto akışından sonra kırmızı global hata bandı ("Bir hata
//      oluştu...") çıkması.
//   2. Üst breadcrumb/konum metninin (ör. "Rektörlük / Zemin") Android'de
//      uzun basmada seçilebilir olup sözlük/çeviri balonu açması.
//
// Kapsamlı reprodüksiyon (kamera+galeri+ses+hayati risk+aynı-konuma çoklu
// geri dönüş, touch/tap tabanlı) mevcut TUTARLI (tek sürüm) app.js/index.html
// ile HİÇBİR senkron hata üretmedi -- production mantığı sağlam. Alan
// bulgusunun en olası kök nedeni: 4K-4M arası SW cache adı ('isg-saha-v16')
// hiç değişmediği için önceden register olmuş bir sekmenin ESKİ (galeri/
// aynı-konum fonksiyonlarını içermeyen) app.js ile çalışmaya devam etmesi
// ("eski-yeni JS karışımı") -- klasik PWA update-lag senaryosu. Bu dosya
// hem (mevcut kodun temiz olduğunu kanıtlamak için) gerçekçi mobil akışları
// hem de eklenen `controllerchange` self-heal güvenlik ağını test eder.
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

// Android/Pixel benzeri dar viewport + dokunmatik.
test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

// "Rektörlük" değil "Rektörlük Binası" -- #setup-birim açılır listesinde her
// zaman bulunan sabit "+ Yeni: Rektörlük" kısayol seçeneğiyle (PROFILLER.
// rektorluk.ad) metin çakışmasını önler, breadcrumb testinde yine "Rektörlük"
// alt dizesini içerir.
async function _kurumBirimHazirla(page, birimAdi = 'Rektörlük Binası') {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

async function _konumaGir(page, odaNo = '101') {
  await page.tap('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.locator('#kat-alan-hizli-chips .chip').first().tap();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.tap('button[onclick="startInspection()"]');
  await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
}

async function _geriDon(page) {
  await page.tap('button[onclick="goToSetup()"]');
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.tap('button[onclick="katAlanGeri()"]');
  await page.locator('#screen-setup.active').waitFor();
}

test.describe('AA. Mobil saha hotfix', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('A. Mobil bulgu kaydı (kamera+galeri+ses+hayati risk) hata bandı üretmez', async ({ page }) => {
    const pageErrors = [];
    const rejections = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('console', (msg) => { if (msg.type() === 'error') pageErrors.push(msg.text()); });
    await page.exposeFunction('_aaRejectionYakala', (mesaj) => rejections.push(mesaj));
    await page.addInitScript(() => {
      window.addEventListener('unhandledrejection', (e) => {
        window._aaRejectionYakala(String(e.reason && e.reason.message || e.reason));
      });
    });

    await sahteKameraKur(page);
    await sahteMikrofonKur(page);
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await expect(page.locator('#hata-banner')).toHaveCount(0);

    await page.tap('button[onclick="openOCR(\'kanit\')"]');
    await page.waitForFunction(() => { const v = document.getElementById('video'); return v && v.videoWidth > 0; });
    await page.tap('button[onclick="capturePhoto()"]');
    await page.setInputFiles('#galeri-foto-input', { name: 'g.png', mimeType: 'image/png', buffer: kucukPngBuffer() });
    await expect(page.locator('#foto-onizleme img')).toHaveCount(2);

    await page.tap('#btn-ses-kaydi');
    await page.waitForTimeout(400);
    await page.tap('#btn-ses-kaydi');
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);

    await page.tap('#btn-hayati-risk');
    await page.locator('#finding-manual').fill('Mobil dokunmatik test bulgusu.');
    await page.tap('button[onclick="saveFinding()"]');
    await expect(page.locator('#findings-list')).toContainText('Mobil dokunmatik test bulgusu.');

    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
    expect(rejections).toEqual([]);
  });

  test('B. Aynı konuma mobil dönüş -- tek denetim, iki bulgu, hata bandı yok', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await page.locator('#finding-manual').fill('İlk mobil bulgu.');
    await page.tap('button[onclick="saveFinding()"]');
    await expect(page.locator('#hata-banner')).toHaveCount(0);

    await _geriDon(page);
    await _konumaGir(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');
    await expect(page.locator('#findings-list')).toContainText('İlk mobil bulgu.');

    await page.locator('#finding-manual').fill('İkinci mobil bulgu.');
    await page.tap('button[onclick="saveFinding()"]');
    await expect(page.locator('#findings-list')).toContainText('İkinci mobil bulgu.');
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(2);
  });

  test('C. Breadcrumb/konum metni seçilemez -- user-select: none (Android sözlük balonu önlenir)', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await expect(page.locator('#current-loc-display')).toContainText('Rektörlük');

    const stil = await page.locator('#current-loc-display').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { userSelect: cs.userSelect, webkitUserSelect: cs.webkitUserSelect || cs.userSelect };
    });
    expect(stil.userSelect).toBe('none');
    expect(stil.webkitUserSelect).toBe('none');

    // Geri butonu (aynı .header içinde) hâlâ tıklanabilir olmalı -- user-select
    // navigasyonu engellememeli.
    await page.tap('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
  });

  test('D. Geri butonu regresyonu -- çoklu geri/ileri sonrası hâlâ çalışır (4M _geriTikla token fix bozulmadı)', async ({ page }) => {
    await _kurumBirimHazirla(page);
    for (let i = 0; i < 3; i++) {
      await _konumaGir(page);
      await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
      await _geriDon(page);
      await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    }
    await expect(page.locator('#hata-banner')).toHaveCount(0);
  });

  test('E. DÖF replay ZIP ve normal ZIP smoke -- mobil hotfix ile bozulmadı', async ({ page }) => {
    const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'AA-1' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'aa_paketi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
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
    const dofZipYolu = path.join(os.tmpdir(), `pwa-test-aa-dof-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await dofIndirme.saveAs(dofZipYolu);
    try {
      const zip = new AdmZip(dofZipYolu);
      expect(zip.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    } finally {
      fs.rmSync(dofZipYolu, { force: true });
    }
  });

  test('F. Yeni Service Worker devraldığında sayfa yenileme dinleyicisi kurulur (eski/yeni JS karışımını önler)', async ({ page }) => {
    // Gerçek `location.reload()` çağrısını güvenle intercept etmek
    // (Location nesnesi tarayıcıda özel/kısıtlı) güvenilir değil -- bunun
    // yerine production kodunun `navigator.serviceWorker`'a GERÇEKTEN bir
    // 'controllerchange' dinleyicisi kaydettiğini doğruluyoruz (bkz.
    // tests/w-service-worker-registration.spec.js Test D ile aynı desen:
    // gerçek API'yi spy'la, davranışı kanıtla).
    await page.addInitScript(() => {
      window.__aaControllerchangeDinleyicisiEklendi = false;
      if ('serviceWorker' in navigator) {
        const orijinalAdd = navigator.serviceWorker.addEventListener.bind(navigator.serviceWorker);
        navigator.serviceWorker.addEventListener = (tur, dinleyici, ...rest) => {
          if (tur === 'controllerchange') window.__aaControllerchangeDinleyicisiEklendi = true;
          return orijinalAdd(tur, dinleyici, ...rest);
        };
      }
    });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.waitForFunction(() => window.__aaControllerchangeDinleyicisiEklendi === true, { timeout: 5000 });
    expect(await page.evaluate(() => window.__aaControllerchangeDinleyicisiEklendi)).toBe(true);
  });

  test('G. İlk kurulumdaki clients.claim() (controller null->ilk worker) sayfayı YENİLEMEZ', async ({ page }) => {
    // GERÇEK regresyon: sw.js'deki (değiştirilmeyen) clients.claim() ilk
    // kurulumda da controller'ı null'dan bir worker'a geçirip
    // 'controllerchange' fırlatıyor -- bu, "eski sekme yeni SW'ye geçti"
    // durumu DEĞİL, sayfa zaten YENİ app.js ile yüklendi. Yanlışlıkla
    // reload tetiklenirse bu, Playwright'ın page.goto()'sunu "Navigation
    // interrupted by another navigation" hatasıyla kesintiye uğratır --
    // gerçek cihazda ise sonsuz olmayan ama gereksiz bir reload'a
    // (ve tam suite'te ara sıra görülen navigasyon çakışmalarına) yol açar.
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    // clients.claim() gerçekleşip controller atanana kadar bekle (ilk kurulum).
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 5000 });
    // Sayfa gerçekten yenilenmediyse bu marker hâlâ yerinde olmalı.
    await page.evaluate(() => { window.__aaYenilenmediMarker = 'orijinal-sayfa'; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__aaYenilenmediMarker)).toBe('orijinal-sayfa');
  });

  test('H. Mevcut oturumda (sayfa YÜKLENIRKEN zaten controller varken) controller değişirse sayfa yenilenir', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 5000 });
    // İkinci yükleme: bu sefer script çalışırken controller ZATEN mevcut --
    // gerçek "mevcut oturum" senaryosu budur.
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await Promise.all([
      page.waitForEvent('load', { timeout: 5000 }),
      page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange'))).catch(() => {}),
    ]);
    // page.waitForEvent('load') çözüldüyse gerçek bir yenileme/navigasyon oldu demektir.
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });
});
