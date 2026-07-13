// PWA Commit 2 / Bölüm E -- yazılı bulgu kaydı karakterizasyonu.
// Gerçek alanlar app.js:1179'daki `const bulgu = {...}` satırından çıkarıldı:
// id, denetimId, metin, fotolar, sesler, hayatiRisk, zaman.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

async function _denetimBaslat(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
  const denetimler = await storeTumu(page, 'denetimler');
  return denetimler[0];
}

test.describe('E. Yazılı bulgu kaydı', () => {
  test('yalniz yazili not iceren bulgu IndexedDBde dogru denetimId ile olusur, sayfa yenilemesinde tekrar gosterilir', async ({ page }) => {
    const denetim = await _denetimBaslat(page);
    const metin = 'Yangın tüpü son kullanma tarihi geçmiş.';

    await page.locator('#finding-manual').fill(metin);
    await page.click('button[onclick="saveFinding()"]');

    await expect(page.locator('#findings-list')).toContainText(metin);

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    const bulgu = bulgular[0];

    expect(bulgu.denetimId).toBe(denetim.id);
    expect(bulgu.metin).toBe(metin);
    expect(bulgu.fotolar).toEqual([]);
    expect(bulgu.sesler).toEqual([]);
    expect(bulgu.hayatiRisk).toBe(false);
    expect(typeof bulgu.zaman).toBe('string');
    expect(typeof bulgu.id).toBe('string');

    // Sayfa yenilemesi sonrası bulgu tekrar gösterilir mi -- gerçek davranış:
    // resumeSession çağrılmadığı için setup ekranına döner, geçmiş kayıttan
    // devam edilirse (resumeSession) bulgu tekrar yüklenir.
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.locator(`[data-swipe-id="${denetim.id}"]`).click();
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await expect(page.locator('#findings-list')).toContainText(metin);
  });

  test('hayati risk isaretlenmis bulgu dogru bayrakla saklanir', async ({ page }) => {
    await _denetimBaslat(page);
    await page.locator('#finding-manual').fill('Çıplak kablo görüldü.');
    await page.click('button[onclick="toggleHayatiRisk()"]');
    await page.click('button[onclick="saveFinding()"]');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].hayatiRisk).toBe(true);
  });
});
