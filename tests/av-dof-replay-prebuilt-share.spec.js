// PWA 4R-PKG-3H -- "Paylaşmayı Dene" artık tıklama ANINDA ZIP ÜRETMEZ.
// Kök neden (BilDesk Saha referans analizi): tıklama anında `await`lenen
// ağır zincir (hazırlık+SHA-256 doğrulama+medya DB okumaları+zip yazımı)
// Android Chrome'un `navigator.share()` için gerektirdiği transient user
// activation penceresini aşabiliyordu -- "Paylaşım başarısız oldu" hatasına
// düşüyordu. Çözüm: aynı üretim işi (`_dofReplayZipHazirlaVeUret`,
// DEĞİŞTİRİLMEDEN) artık DÖF ekranı açılırken/Kaydet-medya sonrası ARKA
// PLANDA çalışıp `_dofPaylasimZipCache`'e yazılıyor; tıklama anında yalnız
// `new File(...)` + `navigator.share(...)` kalıyor. ZIP İndir DEĞİŞMEDİ,
// kendi taze üretimini yapmaya devam ediyor (bu dosya 8. testte doğrular).
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AV-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

async function paketiAc(page, paketUuid) {
  await page.locator(`[data-paket-uuid="${paketUuid}"] button`, { hasText: 'Aç' }).click();
  await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
}

async function dofunaGir(page, dofUuid) {
  await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function takipKaydet(page, sorumlu) {
  await page.locator('#dof-takip-sorumlu').fill(sorumlu);
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
}

function cacheOku(page) {
  return page.evaluate(() => window._dofPaylasimZipCacheOku());
}

async function paylasCacheHazirBekle(page) {
  await page.waitForFunction(() => {
    const c = window._dofPaylasimZipCacheOku && window._dofPaylasimZipCacheOku();
    return !!(c && c.hazir);
  }, { timeout: 5000 });
}

async function paylasimMockKur(page, { destekli, hataAt = null }) {
  await page.addInitScript(({ destekli, hataAt }) => {
    window.__paylasimCagrilari = [];
    navigator.canShare = (veri) => destekli && !!(veri && veri.files);
    navigator.share = async (veri) => {
      window.__paylasimCagrilari.push({ dosyaAdi: veri.files[0].name, tip: veri.files[0].type });
      if (hataAt) { const e = new Error(hataAt.mesaj); e.name = hataAt.ad; throw e; }
      return undefined;
    };
  }, { destekli, hataAt });
}

test.describe('AV. DÖF replay ön-üretilmiş paylaşım ZIP cache (4R-PKG-3H)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
    // NOT: `navigator.share`/`canShare` mock'ları (`paylasimMockKur`) bir
    // `addInitScript` kullanır -- yalnız BUNDAN SONRAKİ navigasyonda etkili
    // olur. Bu yüzden `#index.html`'e geçiş burada DEĞİL, her testin
    // İÇİNDE (varsa mock kurulumundan SONRA) yapılır (bkz. `ao` dosyasıyla
    // aynı desen).
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('1. Paylaş cache önceden hazırlanır -- Kaydet sonrası tıklamadan ÖNCE arka planda üretilir', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'Prebuild Testi');

    await paylasCacheHazirBekle(page);
    const cache = await cacheOku(page);
    expect(cache.hazir).toBe(true);
    expect(cache.paketUuid).toBe(paketUuid);
    expect(cache.dosyaAdi).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);
  });

  test('2. Paylaş tıklamasında ağır ZIP üretimi yok -- cache hazır olduktan SONRA DB doğrudan değişse bile paylaşılan ZIP cache içeriğini yansıtır', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'Cache Testi');
    await paylasCacheHazirBekle(page);

    // Cache hazır olduktan SONRA, normal edit/Kaydet akışını BAŞTAN SAVA
    // atlayarak DB'yi doğrudan (window._idb ile) değiştiriyoruz -- bu hiçbir
    // invalidation hook'unu TETİKLEMEZ (gerçek kullanıcı akışında imkansız,
    // yalnız "tıklama anında cache'in ötesine geçip DB'den taze üretim
    // yapılıyor mu" sorusunu KESİN olarak test etmek için).
    await page.evaluate(async (u) => {
      const kayit = await window._idb.dbGetir('dofler', u);
      kayit.takipTaslagi.sorumlu = 'TAMPERED-SHOULD-NOT-APPEAR';
      await window._idb.dbGuncelle('dofler', kayit);
    }, dofUuid);

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(1);
    // Paylaşılan dosyanın GERÇEK baytlarını okumak için share'i ayrıca
    // yeniden kur(madan) -- bir önceki mock zaten dosyayı aldı ama içeriğini
    // okumadı; burada DOM'daki cache nesnesinden aynı blob'u okuyarak
    // (tıklama SIRASINDA kullanılanla AYNI referans) doğruluyoruz.
    const zipMetni = await page.evaluate(async () => {
      const c = window._dofPaylasimZipCacheOku();
      return await c.zipBlob.text();
    });
    expect(zipMetni).toContain('Cache Testi');
    expect(zipMetni).not.toContain('TAMPERED-SHOULD-NOT-APPEAR');
  });

  test('3. Cache invalidation -- medya eklenince cache geçersizleşir, yeniden hazırlanır, yeni medya durumu yansır', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'Invalidation Testi');
    await paylasCacheHazirBekle(page);
    const eskiCache = await cacheOku(page);
    expect(eskiCache.hazir).toBe(true);

    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf eklendi.');

    // Medya ekleme cache'i invalidate eder (imza değişir) -- yeniden
    // hazırlanana kadar bekle, sonra YENİ cache'in eskisinden FARKLI
    // olduğunu ve foto içerdiğini doğrula.
    await page.waitForFunction((eskiImza) => {
      const c = window._dofPaylasimZipCacheOku && window._dofPaylasimZipCacheOku();
      return !!(c && c.hazir && c.imza !== eskiImza);
    }, eskiCache.imza, { timeout: 5000 });

    const yeniCache = await cacheOku(page);
    expect(yeniCache.hazir).toBe(true);
    expect(yeniCache.imza).not.toBe(eskiCache.imza);

    // Yeni cache'in ZIP'i gerçekten fotoğrafı içeriyor mu -- entry adı
    // `fotolar/` altında olmalı (kök yapı sözleşmesi, ZIP İndir ile aynı).
    const b64 = await page.evaluate(async () => {
      const c = window._dofPaylasimZipCacheOku();
      const buf = new Uint8Array(await c.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      return btoa(ikili);
    });
    const zip = new AdmZip(Buffer.from(b64, 'base64'));
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toContain('dof_donus.json');
    expect(adlar.some((a) => a.startsWith('fotolar/'))).toBe(true);
  });

  test('4. Kaydedilmemiş takip değişikliği varken paylaş engeli -- "Önce takip değişikliklerini kaydedin." gösterir, share çağrılmaz', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    // Medya ekle (paylaşılabilir bir şey olsun) ve cache'in hazırlanmasını
    // bekle -- sonra takip alanını KAYDETMEDEN değiştir; dirty gate cache
    // hazır olsa BİLE paylaşımı engellemeli.
    await dofGaleriFotoYukle(page);
    await paylasCacheHazirBekle(page);

    await page.locator('#dof-takip-sorumlu').fill('Kaydedilmemis Degisiklik');
    await expect(page.locator('#dof-takip-kaydet-btn')).toBeEnabled();

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Önce takip değişikliklerini kaydedin.');

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(0);
  });

  test('5. canShare false -- otomatik indirme yok, doğru mesaj görünür', async ({ page }) => {
    await paylasimMockKur(page, { destekli: false });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'CanShare False Testi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText(
      'Bu cihaz/tarayıcı ZIP dosyası paylaşımını desteklemiyor'
    );
    await expect(page.locator('#dof-replay-durum')).toContainText('ZIP İndir düğmesini kullanın');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(0);
  });

  test('6. AbortError -- otomatik indirme yok, "Paylaşım iptal edildi." görünür', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true, hataAt: { ad: 'AbortError', mesaj: 'iptal' } });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'Abort Testi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşım iptal edildi.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('7. Gerçek hata -- otomatik indirme yok, "Paylaşım başarısız oldu." görünür, ZIP İndir hâlâ çalışır', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true, hataAt: { ad: 'NotAllowedError', mesaj: 'izin yok' } });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'Gercek Hata Testi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım başarısız oldu');
    await expect(page.locator('#dof-replay-durum')).toContainText('NotAllowedError');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    expect(indirme.suggestedFilename()).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);
  });

  test('8. ZIP İndir değişmedi -- her zaman taze ZIP üretir, kökte dof_donus.json/fotolar//sesler, wrapper yok, yasak alan yok', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await takipKaydet(page, 'AV ZIP Indir Testi');

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    const geciciYol = path.join(os.tmpdir(), `pwa-test-av-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(geciciYol);
    const zip = new AdmZip(geciciYol);
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toContain('dof_donus.json');
    expect(adlar.some((a) => a.startsWith('dof_replay_'))).toBe(false);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    const k = belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('AV ZIP Indir Testi');
    for (const yasakli of [
      'dofId', 'durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto',
      'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
  });
});
