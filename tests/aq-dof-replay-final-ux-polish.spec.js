// PWA 4R-PKG-3D -- gerçek Android canlı testte bulunan mobil UX
// sorunlarının son polish turu: Kaydet dirty-state netliği, Kanıt
// Medyaları özet mesajı tek-kaynak (ZIP alt barı sayaçlarıyla tutarlı),
// medya buton satırı taşmayan responsive grid, alt ZIP barı kompakt
// (teknik "Hazırlık yok" metni kaldırıldı), "Tüm Veriyi Sıfırla" ayrı
// "Veri Yönetimi / Tehlikeli İşlemler" bölümünde, Aktif DÖF ekranında
// Takip/Kanıt Medyaları Kaynak DÖF Detayı'ndan ÖNCE, seçili DÖF kartı
// belirgin. Gerçek servisler (dofTakipTaslagiGuncelle, dofKanitMedyasiEkle,
// dofReplayHazirlikHazirla, dofReplayZipOlustur, dofPaketiDegismisDofUuidleri)
// DEĞİŞTİRİLMEDİ -- bu dosya yalnız UI katmanını test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

/** 4R-PKG-3F: import sonrası ana ekranda kalınır -- bu yardımcı (başarılı)
 * importtan hemen sonra o paketi otomatik açar. Reddedilen/çakışan
 * importlarda paket kartı hiç oluşmaz, sessizce atlanır. */
async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
  let paketUuid;
  try { paketUuid = JSON.parse(jsonMetni).paketUuid; } catch (e) { paketUuid = null; }
  if (paketUuid) {
    try {
      // Yalnız GERÇEKTEN yeni/başarılı bir import'ta otomatik aç -- aksi
      // halde duplicate/çakışma reddi (ki zaten hiçbir şeyi DEĞİŞTİRMEZ)
      // mevcut work/paket ekranından yanlışlıkla UZAKLAŞTIRIRDI.
      await page.waitForFunction(() => (document.getElementById('dof-import-durum') || {}).textContent, { timeout: 3000 });
      const durumMetni = (await page.locator('#dof-import-durum').innerText()).trim();
      if (durumMetni === 'İçe aktarma tamamlandı') {
        await page.locator(`[data-paket-uuid="${paketUuid}"]`).first().waitFor({ state: 'attached', timeout: 3000 });
        await page.evaluate((u) => { location.hash = `#dof-package/${u}`; }, paketUuid);
      }
    } catch (e) { /* import reddedildi/çakıştı -- paket kartı hiç oluşmadı, atla */ }
  }
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AQ-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return paket.tehlikeler[0].dofUuid;
}

async function dofSecVeFormBekle(page, index = 0) {
  await page.locator('.dof-liste-karti').nth(index).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function medyaEkleDene(page, dofUuid, medyaGirdisi) {
  return page.evaluate(async ({ u, m }) => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: m.mimeType || 'application/octet-stream' });
    return window._dofImport.dofKanitMedyasiEkle(u, { ...m, blob });
  }, { u: dofUuid, m: medyaGirdisi });
}

test.describe('AQ. DÖF replay son UX polish (4R-PKG-3D)', () => {
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

  test.describe('G. Kaydet dirty-state netliği', () => {
    test('1. Alan değişmeden Kaydet disabled, ipucu açıklayıcı', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeDisabled();
      await expect(page.locator('#dof-takip-ipucu')).toHaveText('Takip bilgisi girince aktif olur.');
    });

    test('2. Herhangi bir takip alanı değişince Kaydet aktif olur, ipucu güncellenir', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeEnabled();
      await expect(page.locator('#dof-takip-ipucu')).toHaveText('Değişiklik var -- Kaydet aktif.');
    });

    test('3. Kaydet sonrası ve Temizle sonrası dirty-state doğru sıfırlanır', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
      await page.locator('#dof-takip-kaydet-btn').click();
      await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeDisabled();
      await expect(page.locator('#dof-takip-ipucu')).toHaveText('Takip bilgisi girince aktif olur.');

      await page.locator('#dof-takip-gerceklesen-faaliyet').fill('Korkuluk sabitlendi');
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeEnabled();
      await page.locator('#dof-takip-temizle-btn').click();
      await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri temizlendi');
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeDisabled();
      await expect(page.locator('#dof-takip-ipucu')).toHaveText('Takip bilgisi girince aktif olur.');
    });

    test('4. Medya eklemek Kaydet\'i aktif ETMEZ (takip alanlarından bağımsız)', async ({ page }) => {
      const dofUuid = await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
      await expect(page.locator('#dof-takip-kaydet-btn')).toBeDisabled();
    });
  });

  test.describe('D. Kanıt Medyaları özet mesajı -- tek kaynak, ZIP sayaçlarıyla tutarlı', () => {
    test('1. Medya yokken "Henüz kanıt eklenmedi."', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('Henüz kanıt eklenmedi.');
    });

    test('2. Yalnız ses notu eklenince özet çelişkisiz -- "N ses notu eklendi." (4R-PKG-3E-FINAL sadeleştirilmiş metin)', async ({ page }) => {
      const dofUuid = await tekDofKur(page);
      await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 800 });
      await dofSecVeFormBekle(page);
      await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 ses notu eklendi.');
      // Liste ile çelişki YOK -- audio elementi de var, "Henüz kanıt eklenmedi." metni YOK.
      await expect(page.locator('#dof-kanit-medya-liste audio')).toHaveCount(1);
      await expect(page.locator('#dof-kanit-medya-liste')).not.toContainText('Henüz kanıt eklenmedi.');
    });

    test('3. Foto + ses birlikte -- "N fotoğraf · M ses notu"', async ({ page }) => {
      const dofUuid = await tekDofKur(page);
      await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
      await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 800 });
      await dofSecVeFormBekle(page);
      await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf · 1 ses notu');
    });

    test('4. Özet ZIP alt barı foto/ses sayaçlarıyla aynı toplamı yansıtır', async ({ page }) => {
      const dofUuid = await tekDofKur(page);
      await medyaEkleDene(page, dofUuid, { mediaType: 'photo', source: 'gallery', mimeType: 'image/png', size: 4 });
      await medyaEkleDene(page, dofUuid, { mediaType: 'audio', source: 'audio', mimeType: 'audio/webm', size: 4, durationMs: 800 });
      await dofSecVeFormBekle(page);
      await page.locator('#dof-takip-sorumlu').fill('Ahmet');
      await page.locator('#dof-takip-kaydet-btn').click();
      await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

      await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf · 1 ses notu');
      await expect(page.locator('#dof-replay-paket-ozet')).toHaveText('1 DÖF · 1 Foto · 1 Ses');
    });
  });

  test.describe('E. Medya butonları mobil düzen -- taşmayan responsive grid', () => {
    test('1. Buton satırı grid, Ses Notu tam genişlikte -- metin kesilmez', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await tekDofKur(page);
      await dofSecVeFormBekle(page);

      const grid = page.locator('.dof-kanit-buton-grid');
      await expect(grid).toHaveCSS('display', 'grid');

      const sesBtn = page.locator('#dof-kanit-ses-btn');
      const gridBox = await grid.boundingBox();
      const sesBox = await sesBtn.boundingBox();
      // Ses Notu butonu grid genişliğine yakın (tam satır) -- iki yan yana
      // dar sütuna sıkışmış/kesilmiş DEĞİL.
      expect(sesBox.width).toBeGreaterThan(gridBox.width * 0.9);

      // Hiçbir buton viewport dışına taşmıyor (yatay overflow yok).
      const fotoBtn = page.locator('.dof-kanit-buton-grid button', { hasText: 'Fotoğraf Çek' });
      const dosyaBtn = page.locator('.dof-kanit-buton-grid button', { hasText: 'Dosya Seç' });
      for (const btn of [fotoBtn, dosyaBtn, sesBtn]) {
        const box = await btn.boundingBox();
        expect(box.x + box.width).toBeLessThanOrEqual(375 + 1);
      }
      await expect(sesBtn).toContainText('Ses Notu');
    });
  });

  test.describe('B. Alt ZIP barı kompakt -- teknik metin yok', () => {
    test('1. İlk yüklemede teknik "Hazırlık yok/hazır" metni YOK', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      const gorunurMetin = await page.locator('#dof-replay-kart').innerText();
      expect(gorunurMetin).not.toContain('Hazırlık yok');
      expect(gorunurMetin).not.toContain('Hazırlık hazır');
    });

    test('2. Paket özeti "N DÖF · N Foto · N Ses" biçiminde', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await page.locator('#dof-takip-sorumlu').fill('Ahmet');
      await page.locator('#dof-takip-kaydet-btn').click();
      await expect(page.locator('#dof-replay-paket-ozet')).toHaveText(/^\d+ DÖF · \d+ Foto · \d+ Ses$/);
    });

    test('3. Paylaş butonu "Paylaşmayı Dene" (Android\'de ZIP paylaşımı garanti değil)', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      await expect(page.locator('#dof-replay-paylas-btn')).toHaveText('Paylaşmayı Dene');
    });
  });

  test.describe('A. Tüm Veriyi Sıfırla -- ayrı, sabit olmayan tehlikeli bölüm', () => {
    test('1. "Veri Yönetimi / Tehlikeli İşlemler" başlığı altında, normal akışta (fixed/sticky DEĞİL)', async ({ page }) => {
      const baslik = page.locator('h3', { hasText: 'Veri Yönetimi / Tehlikeli İşlemler' });
      await expect(baslik).toBeVisible();
      const sifirlaBtn = page.locator('button', { hasText: 'Tüm Veriyi Sıfırla' });
      await sifirlaBtn.scrollIntoViewIfNeeded();
      await expect(sifirlaBtn).toBeVisible();
      const konum = await sifirlaBtn.evaluate((el) => getComputedStyle(el).position);
      expect(['static', 'relative']).toContain(konum);
    });
  });

  test.describe('F. Aktif DÖF çalışma ekranı sıralaması', () => {
    test('1. Takip Bilgileri ve Kanıt Medyaları, Kaynak DÖF Detayı\'ndan ÖNCE gelir', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      const sira = await page.evaluate(() => {
        const ids = ['dof-aktif-baslik-kart', 'dof-takip-form-kart', 'dof-kanit-medya-kart', 'dof-detay-kart'];
        return ids.map((id) => Array.from(document.querySelectorAll('body *')).indexOf(document.getElementById(id)));
      });
      const [aktifBaslik, takip, kanit, detay] = sira;
      expect(aktifBaslik).toBeLessThan(takip);
      expect(takip).toBeLessThan(kanit);
      expect(kanit).toBeLessThan(detay);
    });

    test('2. Kaynak DÖF Detayı <details> ile varsayılan kapalı, içerik veri erişimi bozulmadan DOM\'da kalır', async ({ page }) => {
      await tekDofKur(page);
      await dofSecVeFormBekle(page);
      const detayKart = page.locator('#dof-detay-kart');
      await expect(detayKart).toBeVisible();
      const acikMi = await detayKart.evaluate((el) => el.open);
      expect(acikMi).toBe(false);
      // İçerik DOM'da mevcut (mevcut testlerin toContainText/toHaveCount
      // sözleşmesiyle uyumlu) -- yalnız <details> kapalıyken görünmüyor.
      await expect(page.locator('#dof-detay')).toContainText('AQ-1');
    });
  });

  test.describe('H. Seçili DÖF kartı belirgin', () => {
    test('1. Yalnız seçili kart "✓ Seçili" rozetini taşır', async ({ page }) => {
      const paket = gecerliDofPaketi({
        tehlikelerOverride: [
          gecerliDofKaydi({ dofId: 1, bulguKodu: 'SEC-A' }),
          gecerliDofKaydi({ dofId: 2, bulguKodu: 'SEC-B' }),
        ],
      });
      await dosyaSec(page, JSON.stringify(paket));
      const dofA = paket.tehlikeler[0].dofUuid;
      const dofB = paket.tehlikeler[1].dofUuid;

      await page.locator(`.dof-liste-karti[data-dof-id="${dofA}"]`).click();
      await expect(page.locator(`.dof-liste-karti[data-dof-id="${dofA}"]`)).toContainText('✓ Seçili');
      await expect(page.locator(`.dof-liste-karti[data-dof-id="${dofB}"]`)).not.toContainText('✓ Seçili');

      // 4R-PKG-3E-FINAL: çalışma modunda liste GİZLİ -- başka bir karta
      // geçmeden önce Listeye Dön ile liste moduna dönülmeli (yeni route
      // mimarisi, bkz. as-dof-replay-route-state-final.spec.js).
      await page.locator('button', { hasText: 'Listeye Dön' }).click();
      await page.locator(`.dof-liste-karti[data-dof-id="${dofB}"]`).click();
      await expect(page.locator(`.dof-liste-karti[data-dof-id="${dofB}"]`)).toContainText('✓ Seçili');
      await expect(page.locator(`.dof-liste-karti[data-dof-id="${dofA}"]`)).not.toContainText('✓ Seçili');
    });

    test('2. Kanonik "canonical satırlarda kırmızı X yok" kuralı korunur', async ({ page }) => {
      await tekDofKur(page);
      await expect(page.locator('#dof-liste .dof-liste-sil-btn')).toHaveCount(0);
    });
  });
});
