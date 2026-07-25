// PWA 4R-PKG-3B -- "Kütüphane" bulgusu: konteyner tipi (Rektörlük/Enstitü)
// bir profilde "Kendisi (bütün bina)" seçilince Birim Adı alanı artık
// OTOMATİK DOLDURULMUYOR -- yalnız placeholder/öneri gösteriliyor
// (`_birimFormKonteynerSec`, app.js). Kullanıcı alanı boş bırakıp
// "Birimi Oluştur"a basarsa mevcut doğrulama ("Birim adı gerekli.")
// reddeder -- profil adı SESSİZCE gerçek birim adı olamaz.
const { test, expect } = require('@playwright/test');
const { benzersizAd, promptKarsila, gercekKurumEkle } = require('./helpers');

test.describe('AN. Birim formu -- konteyner profil öneri/placeholder (Kütüphane bulgusu)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test('A. "Kendisi (bütün bina)" seçilince Ad alanı BOŞ kalır, yalnız placeholder önerilir', async ({ page }) => {
    await gercekKurumEkle(page, benzersizAd('Kurum'));
    await page.click('button[onclick="yeniBirimEkle()"]');
    await page.locator('#form-birim-profil').selectOption('rektorluk');
    await page.locator('[data-secim="kendisi"]').click();

    const adInput = page.locator('#form-birim-ad');
    await expect(adInput).toBeVisible();
    await expect(adInput).toHaveValue('');   // OTOMATİK doldurulmadı
    await expect(adInput).toHaveAttribute('placeholder', /Rektörlük/);   // yalnız öneri
  });

  test('B. Boş ad ile "Birimi Oluştur" reddedilir -- profil adı sessizce kaydedilmez', async ({ page }) => {
    await gercekKurumEkle(page, benzersizAd('Kurum'));
    await page.click('button[onclick="yeniBirimEkle()"]');
    await page.locator('#form-birim-profil').selectOption('rektorluk');
    await page.locator('[data-secim="kendisi"]').click();

    let uyariGoruldu = false;
    page.once('dialog', (d) => { uyariGoruldu = true; d.accept(); });
    await page.click('#form-action-btn');
    await page.waitForTimeout(200);
    expect(uyariGoruldu).toBe(true);   // "Birim adı gerekli." reddi

    const birimSayisi = await page.evaluate(() => window._idb.dbTumu('birimler').then((b) => b.length));
    expect(birimSayisi).toBe(0);   // hiçbir birim kaydedilmedi
  });

  test('C. Kullanıcı gerçek adı yazarsa o ad kaydedilir, seçilir ve dropdown\'da görünür -- "Kütüphane" sızmaz', async ({ page }) => {
    await gercekKurumEkle(page, benzersizAd('Kurum'));
    await page.click('button[onclick="yeniBirimEkle()"]');
    await page.locator('#form-birim-profil').selectOption('rektorluk');
    await page.locator('[data-secim="kendisi"]').click();

    await page.locator('#form-birim-ad').fill('Test Birimi 4R');
    await page.click('#form-action-btn');

    await page.locator('#setup-birim').locator('option[value]', { hasText: 'Test Birimi 4R' }).waitFor({ state: 'attached' });
    const seciliDeger = await page.locator('#setup-birim').inputValue();
    const seciliOption = page.locator(`#setup-birim option[value="${seciliDeger}"]`);
    await expect(seciliOption).toHaveText('Test Birimi 4R');
    await expect(seciliOption).not.toHaveText(/Kütüphane|Rektörlük/);
  });
});
