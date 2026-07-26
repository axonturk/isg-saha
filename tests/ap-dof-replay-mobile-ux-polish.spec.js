// PWA 4R-PKG-3C -- gerçek Android canlı testte bulunan mobil UX
// sorunlarının düzeltmesi: tek fixed alt replay bar, "Aktif DÖF" başlığı,
// kompakt chip pilleri, canonical satırda kırmızı X'in kaldırılması,
// "Hazırlık Oluştur"un ikincil/gizli hale getirilmesi. Gerçek servisler
// (dofReplayZipOlustur, dofPaketiDegismisDofUuidleri, dofReplayHazirlikHazirla)
// DEĞİŞTİRİLMEDİ -- bu dosya yalnız UI katmanını test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

const PAKET_YOLU = path.join(__dirname, 'fixtures', 'DOF_Kutuphane_2026-07-03.json');
const PAKET_METNI = fs.readFileSync(PAKET_YOLU, 'utf-8');
const DOF_A_UUID = '83f68019-f0ed-46ac-a5ed-0101a7117975';

async function gercekPaketiSec(page) {
  await page.setInputFiles('#dof-import-input', {
    name: 'DOF_Kutuphane_2026-07-03.json', mimeType: 'application/json', buffer: Buffer.from(PAKET_METNI, 'utf-8'),
  });
}

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function dofSec(page, dofUuid) {
  await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

test.describe('AP. DÖF replay mobil UX polish (4R-PKG-3C)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('1. Replay bar gerçek fixed konumlandırma kullanıyor, tek parça, "Hazırlık Oluştur" UI\'da TAMAMEN gizli (4R-PKG-3C Closure)', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);

    const konum = await page.locator('#dof-replay-kart').evaluate((el) => getComputedStyle(el).position);
    expect(konum).toBe('fixed');

    // ZIP İndir ve Paylaş/Gönder aynı barda, ana aksiyonlar.
    await expect(page.locator('#dof-replay-zip-btn')).toBeVisible();
    await expect(page.locator('#dof-replay-paylas-btn')).toBeVisible();
    await expect(page.locator('#dof-replay-zip-btn')).toHaveText('ZIP İndir');

    // "Hazırlık Oluştur" artık HİÇBİR görünür alanda yok (kullanıcı kararı:
    // tam gizle, otomatik hazırlık yeterli). `toBeHidden()` -- element DOM'da
    // var (geriye dönük iç erişim/servis için) ama `display:none` nedeniyle
    // görünür değil; ayrıca gerçek CSS-görünürlük farkındalıklı `innerText`
    // ile de doğrulanır (`textContent`'in aksine gizli metni SAYMAZ).
    await expect(page.locator('#dof-replay-hazirlik-btn')).toBeHidden();
    const gorunurMetin = await page.locator('#dof-replay-kart').innerText();
    expect(gorunurMetin).not.toContain('Hazırlık Oluştur');
    expect(gorunurMetin).not.toContain('Hazırlığı şimdi yenile');
  });

  test('2. Sayfa en alta kaydırılınca replay bar ile "Tüm Veriyi Sıfırla" çakışmaz', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);

    // Fixed bar aktifken içerik alanına bottom padding eklenir.
    await expect(page.locator('#screen-setup')).toHaveClass(/dof-replay-bar-aktif/);
    const paddingBottom = await page.locator('#screen-setup').evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    expect(paddingBottom).toBeGreaterThan(100);   // bar'ın kapatmayacağı kadar geniş boşluk

    // "Tüm Veriyi Sıfırla" DOM'da hâlâ var ve normal akışta (fixed/sticky DEĞİL).
    const sifirlaBtn = page.locator('button', { hasText: 'Tüm Veriyi Sıfırla' });
    await sifirlaBtn.scrollIntoViewIfNeeded();
    await expect(sifirlaBtn).toBeVisible();
    const sifirlaKonum = await sifirlaBtn.evaluate((el) => getComputedStyle(el).position);
    expect(['static', 'relative']).toContain(sifirlaKonum);
  });

  test('3. Bar DÖF paketi yokken görünmez -- ilgisiz ekranda yanlış görünmüyor', async ({ page }) => {
    await expect(page.locator('#dof-replay-kart')).toBeHidden();
    await expect(page.locator('#screen-setup')).not.toHaveClass(/dof-replay-bar-aktif/);
  });

  test('4. DÖF seçilince "Aktif DÖF" başlığı görünür -- bulgu/risk kodu + risk seviyesi/R + konum, salt-okunur', async ({ page }) => {
    await gercekPaketiSec(page);
    await expect(page.locator('#dof-aktif-baslik-kart')).toBeHidden();

    await dofSec(page, DOF_A_UUID);
    await expect(page.locator('#dof-aktif-baslik-kart')).toBeVisible();
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('Aktif DÖF');
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('2026-KUT-ASAN-00003');
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('2026-KUT-ASAN-00003-R02');
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('Ciddi Risk');
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('R=270');
    // Salt-okunur -- input/textarea/select yok.
    await expect(page.locator('#dof-aktif-baslik-metin input, #dof-aktif-baslik-metin textarea, #dof-aktif-baslik-metin select')).toHaveCount(0);
  });

  test('5. Başka DÖF seçilince Aktif DÖF başlığı güncellenir, hiçbiri seçili değilken gizlenir', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'AKTIF-A' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'AKTIF-B' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    const dofA = paket.tehlikeler[0].dofUuid;
    const dofB = paket.tehlikeler[1].dofUuid;

    await dofSec(page, dofA);
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('AKTIF-A');

    // 4R-PKG-3E-FINAL: çalışma modunda liste gizli -- başka bir DÖF'e
    // geçmek için önce Listeye Dön.
    await page.locator('button', { hasText: 'Listeye Dön' }).click();
    await dofSec(page, dofB);
    await expect(page.locator('#dof-aktif-baslik-metin')).toContainText('AKTIF-B');
    await expect(page.locator('#dof-aktif-baslik-metin')).not.toContainText('AKTIF-A');
  });

  test('6. Chip\'ler kompakt pill sınıfı taşıyor -- büyük genel .chip boyutunda değil', async ({ page }) => {
    await gercekPaketiSec(page);
    const ilkChip = page.locator('#dof-grup-chipleri .chip').first();
    await expect(ilkChip).toHaveClass(/dof-grup-chip/);
    const fontSize = await ilkChip.evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(fontSize)).toBeLessThan(13);

    const grupKart = page.locator('#dof-grup-chipleri');
    const overflowX = await grupKart.evaluate((el) => getComputedStyle(el).overflowX);
    expect(['auto', 'scroll']).toContain(overflowX);
  });

  test('7. Canonical DÖF satırlarında kırmızı X yok, sorunlu kayıtlarda ve paket özetinde Sil/Kaldır korunuyor', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'SAGLAM-7' })] });
    await dosyaSec(page, JSON.stringify(paket));

    // Ana listede tekil Sil YOK.
    await expect(page.locator('#dof-liste .dof-liste-sil-btn')).toHaveCount(0);
    // Paket özetinde "Paketi Sil / Kaldır" var.
    await expect(page.locator('button', { hasText: 'Paketi Sil / Kaldır' })).toBeVisible();

    // Sorunlu/tamamlanmamış kayıt eklenirse orada Sil hâlâ var.
    await page.evaluate(async () => window._idb.dbEkle('dofler', { id: 'dof_wip_ap7', dofId: 999, bulguKodu: 'YARIM-7', durum: 'bekliyor' }));
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('#dof-sorunlu-liste .dof-liste-sil-btn')).toHaveCount(1);
  });
});
