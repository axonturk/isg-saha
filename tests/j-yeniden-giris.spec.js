// PWA Commit 2 / Bölüm J -- mevcut yeniden giriş davranışı karakterizasyonu.
// BU DAVRANIŞ DEĞİŞTİRİLMEZ -- yalnız gözlemlenip isimde açıkça yazılır.
// Commit 8'de ürün kararıyla bilinçli olarak değiştirilecektir.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

test.describe('J. Mevcut yeniden giriş davranışı', () => {
  test('mevcut baseline aynı konuma (kurum/birim/kat/alan/oda) ikinci girişte yeni bir denetim kaydi olusturur, eski kayda eklemez', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    const birimAdi = benzersizAd('Birim');
    await page.goto('/index.html');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });

    // --- Birinci giriş: kurum/birim/kat/alan/oda aynı ---
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    const alanChip1 = page.locator('#kat-alan-hizli-chips .chip').first();
    const alanAdi = (await alanChip1.getAttribute('data-alan')) || (await alanChip1.textContent());
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
    // NOT (ayrı gözlem): geri navigasyon sonrası "Bu Kattaki Mevcut Odalar"
    // hızlı-seçim bölümü YENİDEN ÇİZİLMEZ (popstate handler yalnız
    // showScreen() çağırır, _katAlanMevcutOdalariGoster() TEKRAR
    // ÇALIŞTIRILMAZ) -- DOM o an için "eski" kalır. Bu test o quirk'i
    // DEĞİL, asıl denetim-kaydı davranışını hedeflediği için aynı alan
    // chip'i + aynı oda no'yu ELLE tekrar girerek (gerçek kullanıcının
    // odayı yeniden yazması gibi) aynı odaKaydi eşleşmesini tetikler.
    await page.click('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    const alanChip2 = page.locator('#kat-alan-hizli-chips .chip').first();
    await alanChip2.click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    const denetimlerIkinciGiris = await storeTumu(page, 'denetimler');
    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler[0];

    // Gözlemlenen (DEĞİŞTİRİLMEYEN) davranış: YENİ bir denetim kaydı oluşur.
    // NOT: `dbTumu` (IndexedDB getAll()) sonuçları PRIMARY KEY (uuid metni)
    // sırasına göre döner, EKLENME sırasına göre DEĞİL -- bu yüzden ikinci
    // kaydı array index'iyle DEĞİL, id'siyle (ilkDenetim.id'den FARKLI olan)
    // buluyoruz.
    expect(denetimlerIkinciGiris.length).toBe(2);
    const ikinciDenetim = denetimlerIkinciGiris.find((d) => d.id !== ilkDenetim.id);
    expect(ikinciDenetim).toBeTruthy();
    expect(ikinciDenetim.id).not.toBe(ilkDenetim.id);
    // Ama fiziksel oda kaydı TEKRAR OLUŞTURULMAZ -- ikisi de AYNI odaId'yi paylaşır.
    expect(ikinciDenetim.odaId).toBe(ilkDenetim.odaId);
    expect(birim.odalar.length).toBe(1);

    // İlk ziyaretin bulgusu ikinci (yeni) denetime GÖRÜNMEZ -- iki ayrı
    // "Geçmiş Kayıt" olarak kalır, birleşik/tekil bir oturum OLUŞTURULMAZ.
    await expect(page.locator('#findings-list')).not.toContainText('Birinci ziyaret bulgusu.');

    // Geçmiş Kayıtlar listesinde aynı birim altında 2 ayrı satır görünür.
    await page.click('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await page.click('button[onclick="katAlanGeri()"]');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    const gecmisSatirlari = page.locator(`[data-swipe-id="${ilkDenetim.id}"], [data-swipe-id="${ikinciDenetim.id}"]`);
    await expect(gecmisSatirlari).toHaveCount(2);
  });
});
