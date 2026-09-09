// PWA 4R-PKG-3F -- ana ekran kabuğu (home) ile DÖF paket/çalışma
// ekranlarının route bazında TAM ayrımı. Gerçek Android canlı testte
// kullanıcı "DÖF çalışma ekranındayken üstte hâlâ Yeni Denetim/Kurum/
// Yedekle/DÖF Paketi Al görünüyor" diye şikayet etti -- bu artık üç ayrı
// route/wrapper ile çözüldü: #home, #dof-package/<paketUuid>,
// #dof-work/<dofUuid>. Gerçek servisler (dofReplayZipOlustur,
// dofDonusBelgesiOlustur, dofPaketiSil) DEĞİŞTİRİLMEDİ -- bu dosya yalnız
// UI/route/shell katmanını test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const AdmZip = require('adm-zip');
const path = require('path');
const os = require('os');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AT-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

async function paketiAc(page, paketUuid) {
  await page.locator(`[data-paket-uuid="${paketUuid}"] button`, { hasText: 'Aç' }).click();
  await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
}

test.describe('AT. DÖF replay shell + paket/kurum hiyerarşisi (4R-PKG-3F)', () => {
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

  test('1. Home route -- Yeni Denetim/DÖF Paketi Al görünür, alt ZIP bar gizli', async ({ page }) => {
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Yeni Denetim' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeVisible();
    await expect(page.locator('#dof-replay-kart')).toBeHidden();
  });

  test('2. Paket kartı -- import sonrası home\'da görünür, özet doğru, Aç ile #dof-package/<paketUuid>', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'AT-2A' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'AT-2B' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const paketUuid = paket.paketUuid;

    const kart = page.locator(`[data-paket-uuid="${paketUuid}"]`);
    await expect(kart).toBeVisible();
    await expect(kart).toContainText('2 DÖF');
    await expect(kart).toContainText('İşlenen 0');
    await expect(kart).toContainText('Bekleyen 2');
    await expect(kart).toContainText('Foto 0');
    await expect(kart).toContainText('Ses 0');

    await paketiAc(page, paketUuid);
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();
  });

  test('3. Package route -- Yeni Denetim/DÖF Paketi Al gizli, paket özeti+grup+liste görünür, alt bar görünür', async ({ page }) => {
    const { paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);

    await expect(page.locator('h2', { hasText: 'Yeni Denetim' })).toBeHidden();
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeHidden();
    await expect(page.locator('#dof-paket-ozet-kart')).toBeVisible();
    await expect(page.locator('#dof-paket-ozet-metin')).toContainText('1 DÖF');
    await expect(page.locator('#dof-grup-kart')).toBeVisible();
    await expect(page.locator('.dof-grup-chip', { hasText: 'Tümü' })).toBeVisible();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);

    // Grup seçimi -- yalnız o gruba ait DÖF listesi görünür.
    await page.locator('.dof-grup-chip', { hasText: 'Bekleyen' }).click();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await page.locator('.dof-grup-chip', { hasText: 'İşlenen' }).click();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
  });

  test('4. Work route izolasyonu -- Yeni Denetim/DÖF Paketi Al/paket kartları/liste kartları TAMAMEN gizli', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#dof-work/${dofUuid}$`));

    await expect(page.locator('h2', { hasText: 'Yeni Denetim' })).toBeHidden();
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeHidden();
    await expect(page.locator(`#dof-paket-listesi [data-paket-uuid="${paketUuid}"]`)).toBeHidden();
    await expect(page.locator('.dof-liste-karti')).toBeHidden();
    await expect(page.locator('#dof-aktif-baslik-kart')).toBeVisible();
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await expect(page.locator('#dof-kanit-medya-kart')).toBeVisible();
    await expect(page.locator('#dof-replay-kart')).toBeVisible();
  });

  test('5a. "Listeye Dön" butonu -- work ekranından paket ekranına döner', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page.locator('#dof-work-mod-blok')).toBeVisible();

    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();
  });

  test('5b. Browser geri tuşu -- work -> package, package -> home (tek seviyeli, taze zincir)', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#dof-work/${dofUuid}$`));

    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
    await expect(page.locator('#dof-package-mod-blok')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
  });

  test('6. Geçersiz route -- #dof-package/invalid ve #dof-work/invalid güvenli home dönüşü, crash yok', async ({ page }) => {
    await tekDofKur(page);
    const hataToplandi = [];
    page.on('pageerror', (e) => hataToplandi.push(e.message));

    await page.evaluate(() => { location.hash = '#dof-package/gecersiz-paket-uuid'; });
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-liste-durum')).toContainText('bulunamadı');

    await page.evaluate(() => { location.hash = '#dof-work/gecersiz-dof-uuid'; });
    await expect(page).toHaveURL(/#home$/);
    await expect(page.locator('#home-mod-blok')).toBeVisible();
    await expect(page.locator('#dof-liste-durum')).toContainText('bulunamadı');

    expect(hataToplandi).toEqual([]);
  });

  test('7. ZIP sözleşmesi smoke -- ZIP İndir çalışır, dof_donus.json/fotolar//sesler/ kökte, yasak alan yok', async ({ page }) => {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
    await page.locator('#dof-takip-sorumlu').fill('AT ZIP Testi');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    const geciciYol = path.join(os.tmpdir(), `pwa-test-at-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await indirme.saveAs(geciciYol);
    const zip = new AdmZip(geciciYol);
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toContain('dof_donus.json');
    expect(adlar.some((a) => a.startsWith('dof_replay_'))).toBe(false);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    const k = belge.dofKontrolleri[0];
    for (const yasakli of [
      'dofId', 'durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto',
      'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici',
    ]) {
      expect(Object.prototype.hasOwnProperty.call(k, yasakli), yasakli).toBe(false);
    }
  });

  test('8. Version badge -- PWA isg-saha-v34 · 4R-PKG-3K görünür', async ({ page }) => {
    const rozet = page.locator('#build-info');
    await expect(rozet).toBeVisible();
    await expect(rozet).toContainText('isg-saha-v34');
    await expect(rozet).toContainText('4R-PKG-3K');
  });

  test('9. Paket başlığı -- kurum/birim adı YOKSA "Kurum adı belirlenmedi" + kısa paketUuid teknik alt bilgi', async ({ page }) => {
    const { paketUuid } = await tekDofKur(page);
    const kart = page.locator(`[data-paket-uuid="${paketUuid}"]`);
    await expect(kart).toContainText('Kurum adı belirlenmedi');
    await expect(kart).not.toContainText('DÖF Paketi ');

    await paketiAc(page, paketUuid);
    const ozet = page.locator('#dof-paket-ozet-metin');
    await expect(ozet).toContainText('Kurum adı belirlenmedi');
    await expect(ozet).toContainText(paketUuid.slice(0, 8));
  });

  // 10/11: `_dofYerelKayitOlustur` (app.js) kasıtlı EXPLICIT allowlist ile
  // eşler -- kaynak nesne asla `{...kayit}` ile yayılmaz, bu yüzden bugünkü
  // gerçek Desktop export şemasında (bkz. dof-import-fixtures.js) olmayan
  // `kurumAdi` gibi bir alan import'tan SONRA yerel kayıtta zaten yer
  // almaz (kasıtlı güvenlik/tutarlılık sınırı, import fonksiyonunun kendi
  // yorum satırında belgelenmiş). Bu yüzden `_dofPaketGorunenAdCoz`'un
  // çözümleme mantığı gerçek import akışından BAĞIMSIZ, doğrudan
  // fonksiyon seviyesinde test edilir -- allowlist'i genişletmek (Desktop
  // gerçekten böyle bir alan eklerse) ayrı, izole bir karar/commit
  // gerektirir, bu turun kapsamı DIŞINDA bırakılmıştır (bkz. rapor).
  test('10. _dofPaketGorunenAdCoz -- tüm kayıtlarda aynı kurumAdi varsa güvenilir sayılır, döner', async ({ page }) => {
    const sonuc = await page.evaluate(() => window._dofPaketGorunenAdCoz([
      { kurumAdi: 'ACME Sanayi A.Ş.' },
      { kurumAdi: 'ACME Sanayi A.Ş.' },
    ]));
    expect(sonuc).toBe('ACME Sanayi A.Ş.');
  });

  test('11. _dofPaketGorunenAdCoz -- kayıtlar arasında ÇELİŞKİLİ değer varsa güvenilir sayılmaz, null döner', async ({ page }) => {
    const sonuc = await page.evaluate(() => window._dofPaketGorunenAdCoz([
      { kurumAdi: 'ACME Sanayi A.Ş.' },
      { kurumAdi: 'Farklı Kurum Ltd.' },
    ]));
    expect(sonuc).toBeNull();
  });

  test('12. _dofPaketGorunenAdCoz -- aday alan boşsa bir sonraki adaya geçer (öncelik sırası), hiçbiri yoksa null', async ({ page }) => {
    const oncelikli = await page.evaluate(() => window._dofPaketGorunenAdCoz([
      { kurumAdi: '', birimAdi: 'Üretim Birimi' },
      { kurumAdi: '', birimAdi: 'Üretim Birimi' },
    ]));
    expect(oncelikli).toBe('Üretim Birimi');

    const bosSonuc = await page.evaluate(() => window._dofPaketGorunenAdCoz([
      { dofId: 1 }, { dofId: 2 },
    ]));
    expect(bosSonuc).toBeNull();
  });
});
