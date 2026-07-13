// PWA Commit 2 / Bölüm G -- ses kaydı davranışı karakterizasyonu.
// Fiziksel mikrofon GEREKTİRMEZ -- `getUserMedia`/`MediaRecorder` gerçek
// (canlı, AudioContext kaynaklı) bir ses stream'ine yönlendirilir (bkz.
// media-mocks.js). Production kodu (toggleSesKaydi/MediaRecorder) HİÇ
// değiştirilmedi.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteMikrofonKur } = require('./media-mocks');

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

test.describe('G. Ses kaydı davranışı (gerçek MediaRecorder akışı, sanal donanım)', () => {
  test.beforeEach(async ({ page, context }) => {
    await context.grantPermissions(['microphone']);
    await sahteMikrofonKur(page);
  });

  test('ses kaydi baslatma/durdurma calisir, Blob gecici listeye eklenir, bulguya baglanir, sure metadatasi korunur', async ({ page }) => {
    await _denetimBaslat(page);

    const sesButonu = page.locator('#btn-ses-kaydi');
    await expect(sesButonu).toBeVisible();
    await expect(sesButonu).toHaveText(/Ses Notu Kaydet/);

    await sesButonu.click();
    await expect(sesButonu).toHaveText(/Kaydediliyor/);

    await page.waitForTimeout(600);   // MediaRecorder'ın gerçek chunk üretmesi için

    await sesButonu.click();   // durdur
    await expect(sesButonu).toHaveText(/Ses Notu Kaydet/);

    // Geçici (kaydedilmemiş) ses önizlemesi eklendi mi.
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);

    await page.locator('button[onclick="saveFinding()"]').click();

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    const bulgu = bulgular[0];
    expect(bulgu.sesler.length).toBe(1);
    expect(bulgu.sesler[0].blob).toBeTruthy();
    expect(typeof bulgu.sesler[0].sure).toBe('number');
    expect(bulgu.sesler[0].sure).toBeGreaterThanOrEqual(0);

    const blobBilgisi = await page.evaluate(async () => {
      const kayitlar = await window._idb.dbTumu('bulgular');
      const ses = kayitlar[0].sesler[0];
      return { constructorAdi: ses.blob.constructor.name, tip: ses.blob.type, boyut: ses.blob.size };
    });
    expect(blobBilgisi.constructorAdi).toBe('Blob');
    expect(blobBilgisi.tip).toBe('audio/webm');
    expect(blobBilgisi.boyut).toBeGreaterThan(0);
  });
});
