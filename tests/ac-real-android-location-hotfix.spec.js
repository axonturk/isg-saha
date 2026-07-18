// Gerçek Android cihaz hotfix -- iki bulgu: (1) kırmızı global hata bandı
// riski (eski cache'ten yüklenmiş app.js ile yeni index.html karışımı --
// bkz. sw.js CACHE version bump ve app.js'teki controllerchange yorum
// bloğu), (2) üst konum alanı chip satırının YERİNE değil, ONUNLA BİRLİKTE
// bir düz-metin yol/breadcrumb başlığı (.konum-yol-baslik, .header içinde)
// göstermeliydi -- "sadeleştirme" turunda tamamen kaldırılmıştı, burada
// GERİ EKLENDİ. Devam/yeni-denetim durum segmenti de artık AYRI bir alt
// blok değil, aynı kaydırılabilir .konum-satiri şeridinin son öğesi.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

async function _kurumBirimHazirla(page, birimAdi = 'Rektörlük Binası') {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

async function _odaSecFormDoldurVeBaslat(page, odaNo = '101') {
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.locator('#kat-alan-hizli-chips .chip').first().tap();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.tap('button[onclick="startInspection()"]');
  await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
}

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

test.describe('AC. Gerçek Android hotfix -- üst konum yapısı + Bu Odayı Tamamla hata bandı', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('A. Hedef üst yapı görünür -- path/header + AKTİF KONUM + birim + kat + oda + durum segmenti', async ({ page }) => {
    const { birimAdi } = await _kurumBirimHazirla(page);
    await _konumaGir(page);

    // 1. Path/header (.header içinde, geri okunun yanında) görünür.
    const yolBaslik = page.locator('#konum-yol-metin');
    await expect(yolBaslik).toBeVisible();
    await expect(yolBaslik).toContainText(birimAdi);
    await expect(yolBaslik).toContainText('Zemin');
    await expect(yolBaslik).toContainText('101');

    // 2. Chip şeridi AYRICA (path'in yerine değil) görünür.
    const chipler = page.locator('#current-loc-display .konum-chip');
    expect(await chipler.count()).toBeGreaterThanOrEqual(4);
    await expect(chipler.nth(0)).toHaveText('AKTİF KONUM');
    await expect(chipler.nth(1)).toHaveText(birimAdi);
    await expect(chipler.nth(2)).toHaveText('Zemin');

    // 3. Devam/yeni-denetim durum segmenti görünür ve AYNI şeridin parçası.
    const durum = page.locator('.konum-satiri #denetim-devam-durum');
    await expect(durum).toBeVisible();
    await expect(durum).toHaveText('Yeni denetim başlatıldı.');
  });

  test('B. Düz metin fallback tek yapı değil -- chip şeridi ayrık kart-chip elemanlarından oluşur', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);

    // Path başlığı TEK bir düz metin satırıdır (breadcrumb) -- ama chip
    // şeridi buna EK olarak, birden fazla AYRIK .konum-chip elemanından
    // oluşmalı (tek bir uzun metin bloğuna indirgenmemiş olmalı).
    const chipSayisi = await page.locator('#current-loc-display .konum-chip').count();
    expect(chipSayisi).toBeGreaterThanOrEqual(4);

    // Durum segmenti chip şeridiyle AYNI satırda -- ayrı, tam-genişlik bir
    // alt blok (eski .konum-durum-karti yapısı) DEĞİL.
    const ayniSatirdaMi = await page.evaluate(() => {
      const serit = document.querySelector('.konum-satiri');
      const durum = document.getElementById('denetim-devam-durum');
      return serit && durum && durum.parentElement === serit;
    });
    expect(ayniSatirdaMi).toBe(true);

    const seritStil = await page.locator('.konum-satiri').evaluate((el) => getComputedStyle(el).flexWrap);
    expect(seritStil).toBe('nowrap');   // taşarsa yatay kaydırma, alt alta dökülme yok
  });

  test('C. "Bu Odayı Tamamla" kırmızı hata bandı üretmez -- foto+ses+not+hayati risk birlikte', async ({ page }) => {
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
    await expect(page.locator('#foto-onizleme img')).toHaveCount(1);

    await page.tap('#btn-ses-kaydi');
    await page.waitForTimeout(500);
    await page.tap('#btn-ses-kaydi');
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);

    await page.tap('#btn-hayati-risk');
    await _bulguKaydet(page, 'Hotfix C -- tam akış bulgusu.');
    await _odayiTamamla(page);

    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // Veri silinmedi/finalize edilmedi -- denetim ve bulgu hâlâ IndexedDB'de.
    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
  });

  test('D. Aynı odaya tekrar giriş -- mevcut denetime devam eder, eski bulgular korunur, hata bandı yok', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _bulguKaydet(page, 'İlk ziyaret bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');
    await expect(page.locator('#findings-list')).toContainText('İlk ziyaret bulgusu.');
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);   // yeni denetim OLUŞMADI, mevcuda eklendi
  });

  test('E. Farklı oda seçilirse yeni denetim oluşur -- önceki odayla karışmaz, hata bandı yok', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Oda 101 hotfix bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 101 hotfix bulgusu.');
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    expect(new Set(denetimler.map((d) => d.odaId)).size).toBe(2);
  });

  test('F. Header/chip text selection engeli korunur -- user-select:none, webkit-touch-callout:none', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page);

    const stiller = await page.evaluate(() => {
      const oku = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { userSelect: cs.userSelect, webkitTouchCallout: cs.webkitTouchCallout || 'none' };
      };
      return {
        header: oku('#screen-inspection .header'),
        yolBaslik: oku('#konum-yol-metin'),
        konumSatiri: oku('.konum-satiri'),
      };
    });

    for (const [ad, stil] of Object.entries(stiller)) {
      expect(stil, `${ad} bulunamadı`).not.toBeNull();
      expect(stil.userSelect, `${ad}.userSelect`).toBe('none');
    }
  });

  test('G. Service Worker cache surumu yenilendi -- runtime cache ve eski app-shell temizliği korunur', async () => {
    const swMetni = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    expect(swMetni).toMatch(/const CACHE = 'isg-saha-v\d+';/);   // sonraki hotfix'lerde artacak, sabit sürüm iddia etmez
    expect(swMetni).toContain("const RUNTIME = 'isg-saha-runtime-v1';");
    expect(swMetni).toMatch(/k\.startsWith\('isg-saha-'\) && k !== CACHE && k !== RUNTIME/);
    expect(swMetni).toMatch(/caches\.delete\(k\)/);
  });
});
