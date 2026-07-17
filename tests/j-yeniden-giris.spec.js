// PWA Commit 2 / Bölüm J -- yeniden giriş davranışı.
// PWA Commit 4M ile davranış BİLİNÇLİ olarak değiştirildi: aynı kurum/birim/
// oda/denetim türü ile ikinci kez girildiğinde ARTIK yeni bir denetim kaydı
// AÇILMAZ -- mevcut kayda devam edilir (bkz. tests/y-same-location-append.spec.js,
// kapsamlı davranış orada test edilir; burada yalnız bu dosyanın önceki
// negatif karakterizasyonu pozitife çevrildi).
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

test.describe('J. Yeniden giriş davranışı', () => {
  test('PWA Commit 4M ile aynı konuma (kurum/birim/kat/alan/oda) ikinci girişte YENİ denetim ACILMAZ, mevcut kayda devam edilir', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('Birim');
    await page.goto('/index.html');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });

    // --- Birinci giriş: kurum/birim/kat/alan/oda aynı ---
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    const alanChip1 = page.locator('#kat-alan-hizli-chips .chip').first();
    await alanChip1.click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await page.locator('#finding-manual').fill('Birinci ziyaret bulgusu.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const denetimlerIlkGiris = await storeTumu(page, 'denetimler');
    expect(denetimlerIlkGiris.length).toBe(1);
    const ilkDenetim = denetimlerIlkGiris[0];

    // --- Geri dön, TAM AYNI kurum/birim/kat/alan/oda ile ikinci kez başlat ---
    await page.click('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    const alanChip2 = page.locator('#kat-alan-hizli-chips .chip').first();
    await alanChip2.click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');

    const denetimlerIkinciGiris = await storeTumu(page, 'denetimler');
    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler[0];

    // PWA Commit 4M: YENİ denetim kaydı AÇILMAZ -- tek kayıt kalır, aynı id.
    expect(denetimlerIkinciGiris.length).toBe(1);
    expect(denetimlerIkinciGiris[0].id).toBe(ilkDenetim.id);
    expect(denetimlerIkinciGiris[0].odaId).toBe(ilkDenetim.odaId);
    expect(birim.odalar.length).toBe(1);

    // İlk ziyaretin bulgusu mevcut denetime bağlı olduğu için GÖRÜNÜR kalır.
    await expect(page.locator('#findings-list')).toContainText('Birinci ziyaret bulgusu.');

    // Geçmiş Kayıtlar listesinde bu konum için TEK satır görünür (duplicate yok).
    await page.click('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await page.click('button[onclick="katAlanGeri()"]');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator(`[data-swipe-id="${ilkDenetim.id}"]`)).toHaveCount(1);
  });
});
