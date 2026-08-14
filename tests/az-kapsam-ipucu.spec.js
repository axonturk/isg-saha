// SUPV-49 -- "Bu turda gezdiğim diğer birimler" İPUCU. PWA hiçbir
// bağlayıcı karar vermez -- yalnız ZIP export payload'ına (paket.denetim.
// turBirimleri) bir öneri listesi ekler, Desktop tarafı kendi kaydına
// göre karar verir (bkz. Desktop tarafındaki test_kapsam_atama.py).
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

async function _kurulumaDon(page) {
  // h-i-zip-export.spec.js::_zipIndir İLE AYNI gerçek geri-tuşu akışı
  // (inceleme->kat-alan->kurulum, history yığını bu sırayla açılır).
  if (await page.locator('#screen-inspection').evaluate((el) => el.classList.contains('active'))) {
    await page.click('button[onclick="goToSetup()"]');
    await page.locator('#screen-kat-alan.active, #screen-setup.active').first().waitFor();
  }
  if (await page.locator('#screen-kat-alan').evaluate((el) => el.classList.contains('active'))) {
    await page.click('button[onclick="katAlanGeri()"]');
  }
  await expect(page.locator('#screen-setup')).toHaveClass(/active/);
}

async function _zipIndir(page) {
  await _kurulumaDon(page);
  await page.click('button[onclick="yedekModalAc()"]');
  await expect(page.locator('#modal-form')).toBeVisible();
  const kutular = page.locator('.yedek-birim-cb');
  await kutular.first().waitFor({ state: 'attached' });
  const adet = await kutular.count();
  for (let i = 0; i < adet; i++) await kutular.nth(i).check();
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#form-action-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return geciciYol;
}

async function _paketleriOku(zipYolu) {
  try {
    const zip = new AdmZip(zipYolu);
    const jsonGirdi = zip.getEntries().find((e) => e.entryName === 'denetimler.json');
    return JSON.parse(jsonGirdi.getData().toString('utf-8'));
  } finally {
    fs.rmSync(zipYolu, { force: true });
  }
}

test.describe('SUPV-49. Kapsam ipucu (PWA tarafı)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
  });

  test('tek birimli kurumda ipucu linki gizli kalir', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: benzersizAd('Birim') });
    await expect(page.locator('#setup-tur-birimleri-link')).toBeHidden();
  });

  test('coklu birimli kurumda link gorunur, secim ZIP payloaduna dogru yazilir', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    const birimAAdi = benzersizAd('BirimA');
    const birimBAdi = benzersizAd('BirimB');
    const birimCAdi = benzersizAd('BirimC');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAAdi });
    await gercekBirimEkle(page, { ad: birimBAdi });
    await gercekBirimEkle(page, { ad: birimCAdi });

    // setup-birim'de KENDI denetimimiz icin A'yi sec.
    await page.locator('#setup-birim').selectOption({ label: birimAAdi });

    await expect(page.locator('#setup-tur-birimleri-link')).toBeVisible();
    await page.click('#setup-tur-birimleri-link');
    await expect(page.locator('#modal-form')).toBeVisible();

    // A (kendi birimi) checkbox listesinde HIC gorunmemeli.
    const kutular = page.locator('.tur-birim-cb');
    await kutular.first().waitFor({ state: 'attached' });
    await expect(kutular).toHaveCount(2);   // yalniz B ve C

    const birimler = await storeTumu(page, 'birimler');
    const birimB = birimler.find((b) => b.ad === birimBAdi);
    await page.locator(`.tur-birim-cb[value="${birimB.id}"]`).check();
    await page.click('#form-action-btn');

    await expect(page.locator('#setup-tur-birimleri-link')).toHaveText(/1 seçili/);

    // Denetimi baslat, ZIP al, payload'i dogrula.
    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.locator('#kat-alan-oda-no').fill('101');
    await page.click('button[onclick="startInspection()"]');
    await page.locator('#finding-manual').fill('Kapsam ipucu testi.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const zipYolu = await _zipIndir(page);
    const paketler = await _paketleriOku(zipYolu);
    const paket = paketler.find((p) => p.denetim.birimAdi === birimAAdi);
    expect(paket).toBeTruthy();
    expect(paket.denetim.turBirimleri).toEqual([{ birimId: birimB.id, birimAdi: birimBAdi }]);
  });

  test('hicbir ipucu secilmezse turBirimleri bos dizi olarak gider', async ({ page }) => {
    const kurumAdi = benzersizAd('Kurum');
    const birimAAdi = benzersizAd('BirimA');
    await gercekKurumEkle(page, kurumAdi);
    await gercekBirimEkle(page, { ad: birimAAdi });
    await gercekBirimEkle(page, { ad: benzersizAd('BirimB') });
    await page.locator('#setup-birim').selectOption({ label: birimAAdi });

    await page.click('button[onclick="ekranKatAlanaGec()"]');
    await page.locator('#kat-alan-hizli-chips .chip').first().click();
    await page.locator('#kat-alan-oda-no').fill('102');
    await page.click('button[onclick="startInspection()"]');
    await page.locator('#finding-manual').fill('Ipucu yok testi.');
    await page.locator('button[onclick="saveFinding()"]').click();

    const zipYolu = await _zipIndir(page);
    const paketler = await _paketleriOku(zipYolu);
    expect(paketler[0].denetim.turBirimleri).toEqual([]);
  });

  test('kurum degisince ipucu secimi sifirlanir', async ({ page }) => {
    const kurum1Adi = benzersizAd('Kurum1');
    const kurum2Adi = benzersizAd('Kurum2');
    await gercekKurumEkle(page, kurum1Adi);
    const birimAAdi = benzersizAd('BirimA');
    await gercekBirimEkle(page, { ad: birimAAdi });
    await gercekBirimEkle(page, { ad: benzersizAd('BirimB') });
    await page.locator('#setup-birim').selectOption({ label: birimAAdi });

    await page.click('#setup-tur-birimleri-link');
    const kutular = page.locator('.tur-birim-cb');
    await kutular.first().waitFor({ state: 'attached' });
    await kutular.first().check();
    await page.click('#form-action-btn');
    await expect(page.locator('#setup-tur-birimleri-link')).toHaveText(/1 seçili/);

    await gercekKurumEkle(page, kurum2Adi);
    // yeni kurumda henuz tek birim bile yok -> link gizli olmali (sifirlanmis durum dahil).
    await expect(page.locator('#setup-tur-birimleri-link')).toBeHidden();
  });
});
