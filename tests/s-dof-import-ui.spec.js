// PWA Commit 4F -- DÖF paket import UI ("DÖF Paketi Al" kartı). Yalnız
// JSON dosya seçimi test edilir (ZIP okuma bu commit'in kapsamı dışında,
// bkz. app.js yorum bloğu). Gerçek `dofPaketiIceriAktar` servisi (Commit
// 3B) DEĞİŞTİRİLMEDİ -- bu dosya yalnız UI/DOM etkileşimini test eder.
const { test, expect } = require('@playwright/test');
const { storeTumu } = require('./helpers');
const { gecerliDofKaydi, gecerliDofPaketi, sentetikUuidV4 } = require('./dof-import-fixtures');

test.describe('S. DÖF paket import UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  /** Dosyayı gerçek `<input type=file>` üzerinden seçtirir (Playwright
   * `setInputFiles` -- gerçek `change` event'i tetikler, `onchange`
   * handler'ı sayfa içinde GERÇEKTEN çalışır). */
  async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
    await page.setInputFiles('#dof-import-input', {
      name: dosyaAdi,
      mimeType: 'application/json',
      buffer: Buffer.from(jsonMetni, 'utf-8'),
    });
  }

  test('A. Import UI görünür -- başlık ve dosya seçme kontrolü erişilebilir', async ({ page }) => {
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeVisible();
    await expect(page.locator('#dof-import-btn')).toBeVisible();
    await expect(page.locator('#dof-import-btn')).toContainText('Paket Seç');
    await expect(page.locator('#dof-import-input')).toBeAttached();   // gizli ama DOM'da gerçek
  });

  test('B. Geçerli JSON dosyası import -- özet görünür, IndexedDB\'de kayıt oluşur', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt

    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');
    await expect(page.locator('#dof-import-ozet')).toBeVisible();
    await expect(page.locator('#dof-import-toplam')).toHaveText('2');
    await expect(page.locator('#dof-import-eklenen')).toHaveText('2');
    await expect(page.locator('#dof-import-degismeyen')).toHaveText('0');

    const kayitlar = await storeTumu(page, 'dofler');
    expect(kayitlar.length).toBe(2);
    expect(kayitlar.map((k) => k.dofUuid).sort()).toEqual(paket.tehlikeler.map((t) => t.dofUuid).sort());
  });

  test('C. Aynı dosyayı tekrar import -- "zaten içe aktarılmış", duplicate kayıt oluşmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    const jsonMetni = JSON.stringify(paket);

    await dosyaSec(page, jsonMetni);
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');

    await dosyaSec(page, jsonMetni);   // AYNI dosya ikinci kez
    await expect(page.locator('#dof-import-durum')).toHaveText('Paket zaten içe aktarılmış');
    await expect(page.locator('#dof-import-eklenen')).toHaveText('0');
    await expect(page.locator('#dof-import-degismeyen')).toHaveText('1');

    const kayitlar = await storeTumu(page, 'dofler');
    expect(kayitlar.length).toBe(1);   // duplicate OLUŞMADI
  });

  test('D. Conflict paketi -- çakışma mesajı, mevcut kayıt bozulmaz', async ({ page }) => {
    const dofUuid = sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid })] });
    await dosyaSec(page, JSON.stringify(ilkPaket));
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');
    const oncekiKayitlar = await storeTumu(page, 'dofler');

    const celisenPaket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid, exportUuid: sentetikUuidV4() })],
    });
    await dosyaSec(page, JSON.stringify(celisenPaket), 'celisen.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Çakışma var');
    await expect(page.locator('#dof-import-cakisan')).toHaveText('1');

    const sonrakiKayitlar = await storeTumu(page, 'dofler');
    expect(sonrakiKayitlar).toEqual(oncekiKayitlar);   // mevcut kayıt DEĞİŞMEDİ
  });

  test('E. Geçersiz JSON -- geçersiz dosya mesajı, uygulama çökmeden devam eder', async ({ page }) => {
    const konsolHatalari = [];
    page.on('pageerror', (err) => konsolHatalari.push(String(err)));

    await dosyaSec(page, '{ bu gecerli json degil', 'bozuk.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Geçersiz dosya veya JSON');
    await expect(page.locator('#dof-import-hatali')).toHaveText('1');

    expect(konsolHatalari).toEqual([]);   // yakalanmamış hata YOK, sayfa çökmedi
    // Uygulama hâlâ tepki veriyor -- normal akış elementleri erişilebilir.
    await expect(page.locator('#setup-kurum')).toBeVisible();
    const kayitlar = await storeTumu(page, 'dofler');
    expect(kayitlar).toEqual([]);
  });

  test('F. Yanlış paket türü -- geçersiz paket mesajı', async ({ page }) => {
    const yanlisTurluPaket = { ...gecerliDofPaketi(), tur: 'yanlis_tur' };

    await dosyaSec(page, JSON.stringify(yanlisTurluPaket), 'yanlis-tur.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Geçersiz paket');
    await expect(page.locator('#dof-import-hatali')).toHaveText('1');

    const kayitlar = await storeTumu(page, 'dofler');
    expect(kayitlar).toEqual([]);
  });

  test('G. Çift tetikleme koruması -- eşzamanlı iki çağrıda yalnız biri işlenir, buton geçici disable', async ({ page }) => {
    const paket = gecerliDofPaketi();   // 2 kayıt
    const jsonMetni = JSON.stringify(paket);

    const sonuc = await page.evaluate(async (metin) => {
      const input = document.getElementById('dof-import-input');
      const dosya = new File([metin], 'paket.json', { type: 'application/json' });
      const dt = new DataTransfer();
      dt.items.add(dosya);
      input.files = dt.files;

      const btnOncesi = document.getElementById('dof-import-btn').disabled;
      const p1 = window._dofPaketDosyaSecildi(input);
      const btnEsSirasinda = document.getElementById('dof-import-btn').disabled;   // p1 henüz tamamlanmadı (ilk await'te)
      const p2 = window._dofPaketDosyaSecildi(input);   // eşzamanlı ikinci çağrı -- guard ANINDA reddetmeli
      await Promise.all([p1, p2]);
      const btnSonra = document.getElementById('dof-import-btn').disabled;
      return { btnOncesi, btnEsSirasinda, btnSonra };
    }, jsonMetni);

    expect(sonuc.btnOncesi).toBe(false);
    expect(sonuc.btnEsSirasinda).toBe(true);    // işlem sırasında buton kilitli
    expect(sonuc.btnSonra).toBe(false);         // işlem bitince tekrar aktif

    const kayitlar = await storeTumu(page, 'dofler');
    expect(kayitlar.length).toBe(paket.tehlikeler.length);   // ÇİFT import OLUŞMADI (tek seferlik işlendi)
  });

  test('H. Normal saha akışı regresyonu -- DÖF import kartı eklendikten sonra kurulum ekranı normal çalışır', async ({ page }) => {
    // Smoke: normal denetim akışının temel giriş noktaları hâlâ görünür/tıklanabilir.
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('#setup-birim')).toBeVisible();
    await expect(page.locator('#setup-tur')).toBeVisible();
    await expect(page.locator('#setup-responsible')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Yedekle (ZIP)' })).toBeVisible();
    // DÖF kartı normal akışın SONRASINDA/ayrı, form elemanlarını gizlemiyor.
    await expect(page.locator('#setup-kurum')).toBeEnabled();
  });
});
