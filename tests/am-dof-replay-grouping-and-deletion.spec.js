// PWA 4R-PKG-3A -- DÖF replay grup/chip filtresi, paket özeti, yerel
// paket/kayıt silme ve ZIP kök (wrapper-siz) yapısının pekiştirilmiş
// doğrulaması. Gerçek servisler (dofReplayZipOlustur, dofPaketiDegismisDofUuidleri,
// dofTakipTaslagiGuncelle, dofKanitMedyasiEkle) DEĞİŞTİRİLMEDEN kullanılır;
// bu dosya yalnız YENİ eklenen UI/servis katmanını (gruplama, paket özeti,
// dofYerelKaydiSil/dofPaketiSil) test eder.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

const PAKET_YOLU = path.join(__dirname, 'fixtures', 'DOF_Kutuphane_2026-07-03.json');
const PAKET_METNI = fs.readFileSync(PAKET_YOLU, 'utf-8');
const PAKET = JSON.parse(PAKET_METNI);
const DOF_A_UUID = '83f68019-f0ed-46ac-a5ed-0101a7117975';
const DOF_B_UUID = 'a71621ad-7c60-4073-a7fe-5a40f4fb0723';

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

async function takipKaydet(page, alanlar) {
  for (const [alan, deger] of Object.entries(alanlar)) {
    const id = alan === 'sorumlu' ? '#dof-takip-sorumlu' : '#dof-takip-gerceklesen-faaliyet';
    await page.locator(id).fill(String(deger));
  }
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

async function zipIndirTikla(page) {
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dof-replay-zip-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-4rpkg3a-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return new AdmZip(geciciYol);
}

test.describe('AM. DÖF replay gruplama/paket özeti/yerel silme (4R-PKG-3A)', () => {
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

  test('1. ZIP kökünde wrapper klasör yok -- gerçek paketten 1 DÖF export (pekiştirme)', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'Kök test' });
    const zip = await zipIndirTikla(page);
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toContain('dof_donus.json');
    expect(adlar.some((a) => a.startsWith('dof_replay_'))).toBe(false);   // wrapper klasör YOK
    for (const a of adlar) expect(a.split('/')[0]).not.toMatch(/^dof_replay_/);
  });

  test('2. Paket açılınca boş ekranda kalınmaz -- chip\'ler ve tam liste görünür (varsayılan "Tümü")', async ({ page }) => {
    await gercekPaketiSec(page);
    await expect(page.locator('#dof-grup-kart')).toBeVisible();
    const chipler = page.locator('#dof-grup-chipleri .chip');
    await expect(chipler).not.toHaveCount(0);
    await expect(page.locator('.chip.active', { hasText: 'Tümü' })).toBeVisible();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(59);   // hiçbir DÖF gizli kalmaz
  });

  test('3. Tümü/İşlenen/Bekleyen + dinamik alan/risk chipleri doğru sayılarla görünür', async ({ page }) => {
    await gercekPaketiSec(page);
    await expect(page.locator('.chip', { hasText: 'Tümü 59' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'İşlenen 0' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'Bekleyen 59' })).toBeVisible();
    // Gerçek paketteki bilinen bir alanTipi ("Asansör makine dairesi") en az bir chip üretmeli.
    await expect(page.locator('#dof-grup-chipleri')).toContainText('Asansör');

    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'İşlenen testi' });
    await expect(page.locator('.chip', { hasText: 'İşlenen 1' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'Bekleyen 58' })).toBeVisible();
  });

  test('4. Chip seçimi listeyi filtreler -- yalnız o gruba ait DÖF\'ler görünür, tüm kartlar birden görünmez', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);
    await takipKaydet(page, { sorumlu: 'X' });   // 1 DÖF "İşlenen" oldu

    await page.locator('.chip', { hasText: 'İşlenen' }).click();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator(`.dof-liste-karti[data-dof-id="${DOF_A_UUID}"]`)).toBeVisible();

    await page.locator('.chip', { hasText: 'Tümü' }).click();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(59);   // tam liste geri gelir
  });

  test('5. Grup değişince eski seçim yanlış bağlamda açık kalmaz', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_B_UUID);   // "Bekleyen" grubunda (henüz değişmedi)
    await expect(page.locator('#dof-detay-kart')).toBeVisible();

    await page.locator('.chip', { hasText: 'İşlenen' }).click();   // DOF_B bu grupta YOK (henüz işlenmedi)
    await expect(page.locator('#dof-detay-kart')).toBeHidden();   // seçim temizlendi, yanlış bağlamda kalmadı
  });

  test('6. Aktif DÖF gömülü kayıt artık bulgu/risk kodunu da gösteriyor, salt-okunur kalıyor', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);
    await expect(page.locator('#dof-detay-kart')).toContainText('2026-KUT-ASAN-00003');
    await expect(page.locator('#dof-detay-kart')).toContainText('2026-KUT-ASAN-00003-R02');
    // Salt-okunur -- detay alanında input/textarea/select yok (yalnız takip formunda var, ayrı kart).
    await expect(page.locator('#dof-detay input, #dof-detay textarea, #dof-detay select')).toHaveCount(0);
  });

  test('7. DÖF Paketi özet kartı görünür -- toplam/işlenen/bekleyen/foto/ses ve Paketi Sil butonu var', async ({ page }) => {
    await gercekPaketiSec(page);
    await expect(page.locator('#dof-paket-ozet-kart')).toBeVisible();
    await expect(page.locator('#dof-paket-ozet-metin')).toContainText('59 DÖF');
    await expect(page.locator('button', { hasText: 'Paketi Sil / Kaldır' })).toBeVisible();
  });

  test('8. Replay ZIP alanı sticky sınıfı taşıyor', async ({ page }) => {
    await gercekPaketiSec(page);
    await dofSec(page, DOF_A_UUID);
    await expect(page.locator('#dof-replay-kart')).toHaveClass(/dof-replay-sticky/);
  });

  test('9. Canonical DÖF satırında tekil Sil (kırmızı X) YOK -- yalnız Paketi Sil/Kaldır ile kaldırılabilir (4R-PKG-3C)', async ({ page }) => {
    // Gerçek Android testinde kullanıcı satırdaki kırmızı X'i "DÖF'ü sil"
    // gibi tehlikeli algıladı -- bu yüzden canonical satırdan KALDIRILDI.
    // Alttaki servis (`dofYerelKaydiSil`) DEĞİŞMEDİ, yalnız bu UI kaldırıldı.
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await expect(page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`)).toBeVisible();
    await expect(page.locator('.dof-liste-sil-btn')).toHaveCount(0);   // canonical satırda YOK

    // Paketi Sil / Kaldır hâlâ çalışıyor (tek yol artık bu).
    await page.locator('button', { hasText: 'Paketi Sil / Kaldır' }).click();
    await page.locator('button', { hasText: 'Evet, Sil' }).click();
    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
    await expect(page.locator('#dof-liste-durum')).toHaveText('Henüz içe aktarılmış DÖF yok.');

    // Aynı JSON tekrar import edilebiliyor (eski taslak/medya geri gelmiyor -- taze kayıt).
    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    const yeniKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(yeniKayit.takipTaslagi).toBeUndefined();
  });

  test('10. Paketi Sil -- pakete ait tüm DÖF/taslak/medya silinir, başka paket etkilenmez, tekrar import edilebilir', async ({ page }) => {
    const paketX = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'PAKET-X' })] });
    const paketY = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 2, bulguKodu: 'PAKET-Y' })] });
    await dosyaSec(page, JSON.stringify(paketX), 'x.json');
    await dosyaSec(page, JSON.stringify(paketY), 'y.json');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(2);

    const dofUuidX = paketX.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuidX);
    await takipKaydet(page, { sorumlu: 'X sorumlusu' });   // taslak oluştur

    await page.locator('button', { hasText: 'Paketi Sil / Kaldır' }).click();
    await page.locator('button', { hasText: 'Evet, Sil' }).click();

    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('.dof-liste-karti')).toContainText('PAKET-Y');   // başka paket ETKİLENMEDİ

    const silinenKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuidX);
    expect(silinenKayit).toBeUndefined();

    // Aynı paket X tekrar import edilebiliyor, eski taslak geri GELMİYOR.
    await dosyaSec(page, JSON.stringify(paketX), 'x-tekrar.json');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(2);
    const yeniKayitX = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuidX);
    expect(yeniKayitX.takipTaslagi).toBeUndefined();
  });

  test('11. Sorunlu/yarım yerel kayıt -- ana listede görünmez ama "Tamamlanmamış Kayıtlar" bölümünde Sil ile kaldırılabilir (4R-PKG-3B)', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'SAGLAM-1' })] });
    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);

    // Bilinçli hatalı/eksik import metadata kaydı (kanonik DEĞİL -- replay-v2 kimlik seti eksik).
    const wipKayit = { id: 'dof_wip_am11', dofId: 999, bulguKodu: 'YARIM-1', durum: 'bekliyor' };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    // Ana listeye HİÇ girmez (mevcut "legacy görünmez" sözleşmesi korunuyor).
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('.dof-liste-karti')).not.toContainText('YARIM-1');

    // Ama "Tamamlanmamış Kayıtlar" bölümünde görünür ve Sil düğmesi var.
    await expect(page.locator('#dof-sorunlu-kart')).toBeVisible();
    await expect(page.locator('#dof-sorunlu-liste')).toContainText('YARIM-1');
    await page.locator('#dof-sorunlu-liste .dof-liste-sil-btn').click();
    await page.locator('button', { hasText: 'Evet, Sil' }).click();

    await expect(page.locator('#dof-sorunlu-kart')).toBeHidden();
    const kalanKayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), 'dof_wip_am11');
    expect(kalanKayit).toBeUndefined();
    // Sağlam paket ETKİLENMEDİ.
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('.dof-liste-karti')).toContainText('SAGLAM-1');
  });
});
