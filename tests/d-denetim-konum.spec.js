// PWA Commit 2 / Bölüm D -- konum ve denetim başlatma karakterizasyonu.
// Gerçek alanlar app.js:1105'teki `const denetim = {...}` satırından
// çıkarıldı: id, kurumId, birimId, bina, kat, odaId, oda, alanTipi, odaNo,
// tur, sorumlu, baslangic, guncelleme.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

async function _temelKurulum(page, { katSayisi = 2 } = {}) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi });
  const kurumlar = await storeTumu(page, 'kurumlar');
  const birimler = await storeTumu(page, 'birimler');
  const kurum = kurumlar.find((k) => k.ad === kurumAdi);
  const birim = birimler.find((b) => b.ad === birimAdi);
  return { kurumAdi, birimAdi, kurum, birim };
}

test.describe('D. Konum ve denetim başlatma', () => {
  test('gercek akis: tur+kurum+birim+kat+alan+oda secilip denetim baslatilir, IndexedDBde dogru alanlarla saklanir', async ({ page }) => {
    const { kurum, birim } = await _temelKurulum(page, { katSayisi: 2 });

    await page.locator('#setup-tur').selectOption('saha');
    const sorumluAdi = 'Test Sorumlusu';
    await page.locator('#setup-responsible').fill(sorumluAdi);

    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);

    // İkinci kat chip'ine tıkla (1.Kat).
    await page.locator('#kat-alan-kat-chips .chip', { hasText: '1.Kat' }).click();

    // Hızlı alan tipi chip'lerinden ilkini seç (düz metin -- span sarmalayıcı YOK,
    // bkz. app.js chipHtml -- yalnız "özel" chip'lerde silme rozeti için span var).
    const ilkAlanChip = page.locator('#kat-alan-hizli-chips .chip').first();
    const alanTipiMetni = (await ilkAlanChip.getAttribute('data-alan')) || (await ilkAlanChip.textContent());
    await ilkAlanChip.click();

    const odaNo = '203';
    await page.locator('#kat-alan-oda-no').fill(odaNo);

    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
    const denetim = denetimler[0];

    expect(denetim.kurumId).toBe(kurum.id);
    expect(denetim.birimId).toBe(birim.id);
    expect(denetim.bina).toBe(birim.ad);
    expect(denetim.kat).toBe('1.Kat');
    expect(denetim.alanTipi).toBe(alanTipiMetni.trim());
    expect(denetim.odaNo).toBe(odaNo);
    expect(denetim.tur).toBe('saha');
    expect(denetim.sorumlu).toBe(sorumluAdi);
    expect(typeof denetim.id).toBe('string');
    expect(typeof denetim.odaId).toBe('string');   // oda kaydı IndexedDB'de OLUŞTURULUR (odalar[] içine)
    expect(typeof denetim.baslangic).toBe('string');
    expect(typeof denetim.guncelleme).toBe('string');

    // Oturum başlığı bina/kat/oda gösteriyor.
    await expect(page.locator('#current-loc-display')).toContainText(birim.ad);
  });

  test('denetim kimligi her baslatmada benzersizdir', async ({ page }) => {
    await _temelKurulum(page, { katSayisi: 1 });
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    const denetimlerIlkSonra = await storeTumu(page, 'denetimler');
    expect(denetimlerIlkSonra.length).toBe(1);

    // "Geri" -- gerçek uygulama davranışı: history yığınında Kat-Alan ekranı
    // kalır, Kurulum'a ATLAMAZ (bkz. app.js startInspection yorumu) -- bu
    // yüzden burada DOĞRUDAN Kat-Alan ekranındayız, aynı birim bağlamında
    // ikinci bir oda seçilebilir.
    await page.click('button[onclick="goToSetup()"]');
    await expect(page.locator('#screen-kat-alan')).toHaveClass(/active/);
    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.locator('#kat-alan-oda-no').fill('102');
    await page.click('button[onclick="startInspection()"]');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    expect(denetimler[0].id).not.toBe(denetimler[1].id);
  });
});
