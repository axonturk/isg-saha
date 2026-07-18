// Gerçek Android hotfix -- oda bazlı bulgu/state izolasyonu + konum chip
// navigasyonu. Kök neden: taslak (henüz kaydedilmemiş) foto/ses/açıklama/
// hayati-risk state'i (aktifFotolarTaslak/aktifSeslerTaslak/hayatiRiskAktif/
// #finding-manual) SADECE "Bulguyu Kaydet" başarılı olunca temizleniyordu --
// "Bu Odayı Tamamla" (_odaSecimineDon) ve inceleme ekranına yeniden giriş
// (startInspection/resumeSession) bu taslağı HİÇ temizlemiyordu. Sonuç: Oda
// A'da kaydedilmemiş foto/ses/not bırakılıp "Bu Odayı Tamamla"ya basılırsa,
// Oda B ekranı Oda A'nın taslağıyla açılıyordu -- kaydedilirse Oda B'nin
// denetimId'siyle ama Oda A'nın İÇERİĞİYLE bir bulgu oluşuyordu. Düzeltme:
// merkezi _taslakTemizle() artık inceleme ekranına HER giriş noktasında
// (startInspection, resumeSession) çağrılıyor. Ayrıca konum chip'leri artık
// tıklanabilir -- hepsi aynı güvenli _odaSecimineDon() hedefine yönlendirir
// (model yalnız tek birleşik kat+oda seçim ekranını destekliyor).
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');
const { sahteKameraKur, sahteMikrofonKur } = require('./media-mocks');

test.use({ viewport: { width: 393, height: 851 }, hasTouch: true });

async function _kurumBirimHazirla(page, birimAdi = 'Rektörlük Binası') {
  const kurumAdi = benzersizAd('Kurum');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  return { kurumAdi, birimAdi };
}

async function _odaSecFormDoldurVeBaslat(page, odaNo = '101') {
  await page.locator('#screen-kat-alan.active').waitFor();
  await page.locator('#kat-alan-hizli-chips .chip').first().tap();
  await page.locator('#kat-alan-oda-no').fill(odaNo);
  await page.tap('button[onclick="startInspection()"]');
  await page.locator('#screen-inspection.active').waitFor({ timeout: 5000 });
}

async function _konumaGir(page, odaNo = '101') {
  await page.tap('button[onclick="ekranKatAlanaGec()"]');
  await _odaSecFormDoldurVeBaslat(page, odaNo);
}

async function _odayiTamamla(page) {
  await page.tap('button[onclick="_odaSecimineDon()"]');
  await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
}

async function _fotoEkle(page) {
  await page.tap('button[onclick="openOCR(\'kanit\')"]');
  await page.waitForFunction(() => { const v = document.getElementById('video'); return v && v.videoWidth > 0; });
  await page.tap('button[onclick="capturePhoto()"]');
  await expect(page.locator('#foto-onizleme img')).toHaveCount(1);
}

async function _sesEkle(page) {
  await page.tap('#btn-ses-kaydi');
  await page.waitForTimeout(500);
  await page.tap('#btn-ses-kaydi');
  await expect(page.locator('#ses-onizleme audio')).toHaveCount(1);
}

async function _bulguKaydet(page, metin) {
  await page.locator('#finding-manual').fill(metin);
  await page.tap('button[onclick="saveFinding()"]');
  await expect(page.locator('#findings-list')).toContainText(metin);
}

test.describe('AD. Oda bazlı state izolasyonu + konum chip navigasyonu', () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(['camera', 'microphone']);
  });

  test('A. Oda A bulgusu (kaydedilmiş) Oda B ekranına taşınmaz', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await sahteKameraKur(page);
    await sahteMikrofonKur(page);

    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _fotoEkle(page);
    await _sesEkle(page);
    await page.tap('#btn-hayati-risk');
    await _bulguKaydet(page, 'Oda A kaydedilmiş bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');

    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(0);
    await expect(page.locator('#finding-manual')).toHaveValue('');
    await expect(page.locator('#btn-hayati-risk')).not.toHaveClass(/aktif/);
    await expect(page.locator('#findings-list')).not.toContainText('Oda A kaydedilmiş bulgusu.');
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test('B. Oda B kaydı Oda A\'dan bağımsızdır', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Oda A metni.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await _bulguKaydet(page, 'Oda B metni.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda A metni.');

    await _odayiTamamla(page);
    await _odaSecFormDoldurVeBaslat(page, '101');
    await expect(page.locator('#findings-list')).toContainText('Oda A metni.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda B metni.');
  });

  test('C. Üç oda birbirine karışmaz -- her odaya tekrar girişte yalnız kendi bulgusu görünür', async ({ page }) => {
    await _kurumBirimHazirla(page);

    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Oda 101 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await _bulguKaydet(page, 'Oda 202 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '303');
    await _bulguKaydet(page, 'Oda 303 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '101');
    await expect(page.locator('#findings-list')).toContainText('Oda 101 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 202 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 303 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#findings-list')).toContainText('Oda 202 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 101 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 303 bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '303');
    await expect(page.locator('#findings-list')).toContainText('Oda 303 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 101 bulgusu.');
    await expect(page.locator('#findings-list')).not.toContainText('Oda 202 bulgusu.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(3);
    expect(new Set(denetimler.map((d) => d.odaId)).size).toBe(3);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(3);
  });

  test('D. Bulguyu Kaydet sonrası taslak temizlenir (_taslakTemizle)', async ({ page }) => {
    await sahteKameraKur(page);
    await sahteMikrofonKur(page);

    await _kurumBirimHazirla(page);
    await _konumaGir(page);
    await _fotoEkle(page);
    await _sesEkle(page);
    await page.tap('#btn-hayati-risk');
    await page.locator('#finding-manual').fill('Taslak temizlik testi.');

    await page.tap('button[onclick="saveFinding()"]');
    await expect(page.locator('#findings-list')).toContainText('Taslak temizlik testi.');

    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(0);
    await expect(page.locator('#finding-manual')).toHaveValue('');
    await expect(page.locator('#btn-hayati-risk')).not.toHaveClass(/aktif/);
  });

  test('E. Bu Odayı Tamamla sonrası KAYDEDİLMEMİŞ taslak yeni odaya taşınmaz', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await sahteKameraKur(page);
    await sahteMikrofonKur(page);

    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _fotoEkle(page);
    await _sesEkle(page);
    await page.tap('#btn-hayati-risk');
    await page.locator('#finding-manual').fill('Kaydedilmemiş taslak -- Oda A.');
    // KAYDETMEDEN doğrudan Tamamla -- gerçek cihaz bulgusunun tam senaryosu.
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');

    await expect(page.locator('#foto-onizleme img')).toHaveCount(0);
    await expect(page.locator('#ses-onizleme audio')).toHaveCount(0);
    await expect(page.locator('#finding-manual')).toHaveValue('');
    await expect(page.locator('#btn-hayati-risk')).not.toHaveClass(/aktif/);
    await expect(page.locator('#findings-list')).not.toContainText('Kaydedilmemiş taslak');
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // Oda B'de kaydedersek İÇERİK yalnız Oda B'nin kendi metni olmalı.
    await _bulguKaydet(page, 'Oda B kendi bulgusu.');
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    expect(bulgular[0].metin).toBe('Oda B kendi bulgusu.');
    expect(bulgular[0].fotolar.length).toBe(0);
    expect(bulgular[0].sesler.length).toBe(0);
    expect(bulgular[0].hayatiRisk).toBe(false);
  });

  test('F. Aynı odaya dönüş mevcut denetime devam eder', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Devam testi bulgusu.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '101');
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Bu konum için mevcut denetime devam ediliyor.');
    await expect(page.locator('#findings-list')).toContainText('Devam testi bulgusu.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(1);
  });

  test('G. Farklı oda yeni denetim oluşturur', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Yeni denetim testi -- Oda A.');
    await _odayiTamamla(page);

    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
    await expect(page.locator('#findings-list')).not.toContainText('Yeni denetim testi -- Oda A.');

    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
  });

  test('H. Konum chip navigasyonu çalışır -- tıklanınca oda/mahal seçimine güvenli döner', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');

    // AKTİF KONUM etiketi HARİÇ ilk chip (birim) -- .konum-chip-tiklanabilir.
    const tiklanabilirChip = page.locator('#current-loc-display .konum-chip-tiklanabilir').first();
    await expect(tiklanabilirChip).toBeVisible();
    await tiklanabilirChip.tap();

    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(pageErrors).toEqual([]);

    // Sonra farklı oda seçilebilmeli -- state bozulmamış.
    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await expect(page.locator('#denetim-devam-durum')).toHaveText('Yeni denetim başlatıldı.');
  });

  test('I. Konum chip navigasyonu state kirletmez -- bulgu silinmez, taslak yanlış odaya taşınmaz', async ({ page }) => {
    await _kurumBirimHazirla(page);
    await _konumaGir(page, '101');
    await _bulguKaydet(page, 'Chip testi -- Oda A.');

    // Chip ile oda seçimine dön (Bu Odayı Tamamla YERİNE).
    await page.locator('#current-loc-display .konum-chip-tiklanabilir').first().tap();
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });

    await _odaSecFormDoldurVeBaslat(page, '202');
    await expect(page.locator('#findings-list')).not.toContainText('Chip testi -- Oda A.');
    await expect(page.locator('#finding-manual')).toHaveValue('');

    // Oda A'ya dönünce bulgusu hâlâ orada olmalı (chip navigasyonu SİLMEDİ).
    await page.locator('#current-loc-display .konum-chip-tiklanabilir').first().tap();
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    await _odaSecFormDoldurVeBaslat(page, '101');
    await expect(page.locator('#findings-list')).toContainText('Chip testi -- Oda A.');

    // Oda B'ye girildiği için kendi denetim kaydı oluştu (beklenen -- her
    // oda ziyareti kendi denetimini açar), AMA hiç bulgu kaydedilmedi.
    const denetimler = await storeTumu(page, 'denetimler');
    expect(denetimler.length).toBe(2);
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);   // yalnız Oda A'nın bulgusu -- Oda B'de hiç kayıt yok
  });

  test('J. Global hata yok -- tam akış boyunca pageerror/console.error/hata-banner sıfır', async ({ page }) => {
    const hatalar = [];
    page.on('pageerror', (e) => hatalar.push('pageerror: ' + e.message));
    page.on('console', (msg) => { if (msg.type() === 'error') hatalar.push('console.error: ' + msg.text()); });

    await sahteKameraKur(page);
    await sahteMikrofonKur(page);
    await _kurumBirimHazirla(page);

    await _konumaGir(page, '101');
    await _fotoEkle(page);
    await _sesEkle(page);
    await page.tap('#btn-hayati-risk');
    await page.locator('#finding-manual').fill('Global hata testi -- kaydedilmemiş taslak.');
    await _odayiTamamla(page);   // taslak kaydedilmeden tamamlandı

    await _odaSecFormDoldurVeBaslat(page, '202');
    await _bulguKaydet(page, 'Global hata testi -- Oda B.');

    await page.locator('#current-loc-display .konum-chip-tiklanabilir').first().tap();
    await page.locator('#screen-kat-alan.active').waitFor({ timeout: 5000 });
    await _odaSecFormDoldurVeBaslat(page, '101');

    await expect(page.locator('#hata-banner')).toHaveCount(0);
    expect(hatalar).toEqual([]);
  });
});
