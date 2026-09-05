// BB -- "Denetim Türü" (Saha Denetimi / Risk Analizi) seçiminin GERÇEK
// tarayıcıda, uçtan uca doğrulanması: #setup-tur seçimi -> IndexedDB
// (denetimler.tur) -> ZIP export (denetimler.json içindeki paket.denetim.tur).
//
// Bu dosyaya kadar hiçbir test "risk" değerini seçip ZIP çıktısını
// DOĞRULAMAMIŞTI (d-denetim-konum.spec.js yalnız 'saha' varsayılanını,
// yalnız IndexedDB seviyesinde test ediyordu). Masaüstü tarafında da
// (isg_denetim/tests) tur='risk' ile gelen bir ZIP'i içe aktaran hiçbir
// test yoktu -- bkz. isg_denetim/tests/test_zip_bitti_kapsam_ata.py ve
// zip_import.py:412-418 (d.get("tur", "saha")).
//
// İKİ akış da (saha VE risk) BİREBİR AYNI ekran/adım sırasını izliyor --
// bu testin kendisi de bunu kanıtlıyor: tek fark #setup-tur seçimi,
// gerisi (kat-alan, bulgu kaydı, "Bu Odayı Tamamla", ZIP export) hiç
// değişmiyor. Yani PWA'da bugün "risk" ile "saha" arasında GERÇEK bir
// davranış farkı YOK, yalnız ZIP'e yazılan etiket farklı.
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle } = require('./helpers');

test.use({ hasTouch: true });

async function _kurumBirimHazirla(page, birimAdi) {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

async function _konumaGirTurSecerek(page, tur, odaNo = '101') {
  await page.locator('#setup-tur').selectOption(tur);
  await page.tap('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.locator('#kat-alan-hizli-chips .chip').first().tap();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.tap('button[onclick="startInspection()"]');
  await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
}

async function _bulguKaydet(page, metin) {
  await page.locator('#finding-manual').fill(metin);
  await page.tap('button[onclick="saveFinding()"]');
  await expect(page.locator('#findings-list')).toContainText(metin);
}

async function _odayiTamamla(page) {
  await page.tap('button[onclick="_odaSecimineDon()"]');
  await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
}

async function _tamamlaSonrasiSetupaDon(page) {
  for (let i = 0; i < 3; i++) {
    if (await page.locator('#screen-setup').evaluate((el) => el.classList.contains('active'))) return;
    await page.tap('button[onclick="katAlanGeri()"]');
    await page.waitForTimeout(300);
  }
  await expect(page.locator('#screen-setup')).toHaveClass(/active/);
}

async function _turSeciliZipUret(page, tur, bulguMetni) {
  const { birimAdi } = await _kurumBirimHazirla(page, benzersizAd('Birim'));
  await _konumaGirTurSecerek(page, tur);
  await _bulguKaydet(page, bulguMetni);
  await _odayiTamamla(page);
  await _tamamlaSonrasiSetupaDon(page);

  await page.tap('button[onclick="yedekModalAc()"]');
  await expect(page.locator('#modal-form')).toBeVisible();
  const kutular = page.locator('.yedek-birim-cb');
  await kutular.first().waitFor({ state: 'attached' });
  const adet = await kutular.count();
  for (let i = 0; i < adet; i++) await kutular.nth(i).check();

  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.tap('#form-action-btn'),
  ]);
  const zipYolu = path.join(
    os.tmpdir(), `pwa-test-bb-${tur}-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(zipYolu);
  try {
    const zip = new AdmZip(zipYolu);
    const jsonGirdi = zip.getEntries().find((e) => e.entryName === 'denetimler.json');
    expect(jsonGirdi).toBeTruthy();
    return JSON.parse(jsonGirdi.getData().toString('utf-8'));
  } finally {
    fs.rmSync(zipYolu, { force: true });
  }
}

test.describe('BB. Denetim Türü (Saha Denetimi / Risk Analizi) uçtan uca', () => {
  test('saha secilirse ZIP paketinde denetim.tur = "saha" olur', async ({ page }) => {
    const paketler = await _turSeciliZipUret(page, 'saha', 'Saha denetimi bulgusu.');
    expect(paketler.length).toBe(1);
    expect(paketler[0].denetim.tur).toBe('saha');
    expect(paketler[0].tespitler[0].not).toBe('Saha denetimi bulgusu.');
  });

  test('risk secilirse ZIP paketinde denetim.tur = "risk" olur -- ILK KEZ bu testte dogrulaniyor', async ({ page }) => {
    const paketler = await _turSeciliZipUret(page, 'risk', 'Risk analizi bulgusu.');
    expect(paketler.length).toBe(1);
    expect(paketler[0].denetim.tur).toBe('risk');
    expect(paketler[0].tespitler[0].not).toBe('Risk analizi bulgusu.');
  });

  test('saha ve risk akislari BIREBIR AYNI ekran/adim sirasini izler -- yalniz tur etiketi degisir', async ({ page }) => {
    // Bu test davranışsal EŞDEĞERLİĞİ kanıtlar: aynı yardımcı fonksiyon
    // (_turSeciliZipUret) iki farklı tur değeriyle çağrılıyor, İKİSİ de
    // hatasız aynı adımlardan geçip ZIP üretiyor -- PWA'nın bugün "risk"
    // seçimi için AYRI bir ekran/akış/soru dizisi YOK.
    const sahaPaket = (await _turSeciliZipUret(page, 'saha', 'X'))[0];
    const riskPaket = (await _turSeciliZipUret(page, 'risk', 'X'))[0];

    const anahtarlarKarsilastir = (p) => Object.keys(p.denetim).sort();
    expect(anahtarlarKarsilastir(sahaPaket)).toEqual(anahtarlarKarsilastir(riskPaket));
    expect(sahaPaket.tespitler.length).toBe(riskPaket.tespitler.length);
  });
});
