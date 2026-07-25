// PWA 4R-PKG-3B -- "Paylaş / Gönder" butonu. AYNI ZIP üretim adımını
// (`_dofReplayZipHazirlaVeUret`) kullanır -- içerik BİREBİR aynı, yalnız
// teslim yöntemi farklı: Web Share API (dosya) destekleniyorsa
// `navigator.share`, desteklenmiyorsa/gerçek hata olursa normal indirme.
// Gerçek `dofReplayZipOlustur`/`dofPaketiDegismisDofUuidleri` servisleri
// DEĞİŞTİRİLMEDİ.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe.configure({ mode: 'serial' });

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
    await page.locator('#dof-takip-sorumlu').fill(String(deger));
  }
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

/** `navigator.canShare`/`navigator.share`'i GERÇEK Web Share API sözleşmesine
 * (dosya desteği true/false) uygun, sayfa çağrılarını Node tarafına
 * (`window.__paylasimCagrilari`) kaydeden bir mock ile değiştirir. */
async function paylasimMockKur(page, { destekli, hataAt = null }) {
  await page.addInitScript(({ destekli, hataAt }) => {
    window.__paylasimCagrilari = [];
    navigator.canShare = (veri) => destekli && !!(veri && veri.files);
    navigator.share = async (veri) => {
      window.__paylasimCagrilari.push({ dosyaAdi: veri.files[0].name, tip: veri.files[0].type, boyut: veri.files[0].size });
      if (hataAt) { const e = new Error(hataAt.mesaj); e.name = hataAt.ad; throw e; }
      return undefined;
    };
  }, { destekli, hataAt });
}

test.describe('AO. DÖF replay Paylaş/Gönder (4R-PKG-3B)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('A. Paylaşım destekli -- navigator.share gerçek ZIP dosyasıyla çağrılır, indirme OLUŞMAZ', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuid);
    await takipKaydet(page, { sorumlu: 'Paylaşım Testi' });

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(1);
    expect(cagrilar[0].dosyaAdi).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);
    expect(cagrilar[0].tip).toBe('application/zip');
    expect(indirmeOldu).toBe(false);   // paylaşım yolu -- indirme tetiklenmedi
  });

  test('B. Paylaşım desteklenmiyor -- normal indirmeye düşer, dosya adı gösterilir', async ({ page }) => {
    await paylasimMockKur(page, { destekli: false });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuid);
    await takipKaydet(page, { sorumlu: 'Fallback Testi' });

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-paylas-btn'),
    ]);
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım desteklenmiyor, ZIP indirildi:');
    expect(indirme.suggestedFilename()).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(0);   // navigator.share hiç çağrılmadı
  });

  test('C. Kullanıcı paylaşımı iptal ederse (AbortError) sessizce indirmeye düşülmez', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true, hataAt: { ad: 'AbortError', mesaj: 'iptal' } });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuid);
    await takipKaydet(page, { sorumlu: 'İptal Testi' });

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşım iptal edildi.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('D. Gerçek paylaşım hatasında (iptal DEĞİL) indirmeye düşülür', async ({ page }) => {
    await paylasimMockKur(page, { destekli: true, hataAt: { ad: 'NotAllowedError', mesaj: 'izin yok' } });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuid);
    await takipKaydet(page, { sorumlu: 'Hata Testi' });

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-paylas-btn'),
    ]);
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım desteklenmiyor, ZIP indirildi:');
    expect(indirme.suggestedFilename()).toMatch(/^dof_replay_\d{8}_\d{6}_[a-f0-9]{8}_1dof\.zip$/);
  });

  test('E. Paylaşılan dosyanın ZIP içeriği kökte kalır -- wrapper yok, dof_donus.json/fotolar/sesler doğru', async ({ page }) => {
    await page.addInitScript(() => {
      window.__paylasilanZipB64 = null;
      navigator.canShare = (veri) => !!(veri && veri.files);
      navigator.share = async (veri) => {
        const dosya = veri.files[0];
        const buf = new Uint8Array(await dosya.arrayBuffer());
        let ikili = '';
        const PARCA = 0x8000;
        for (let i = 0; i < buf.length; i += PARCA) ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
        window.__paylasilanZipB64 = btoa(ikili);
      };
    });
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSec(page, dofUuid);
    await takipKaydet(page, { sorumlu: 'ZIP İçerik Testi' });

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const b64 = await page.evaluate(() => window.__paylasilanZipB64);
    expect(b64).toBeTruthy();
    const zip = new AdmZip(Buffer.from(b64, 'base64'));
    const adlar = zip.getEntries().map((e) => e.entryName);
    expect(adlar).toEqual(['dof_donus.json']);   // medyasız -- tek entry, wrapper yok
    expect(adlar.some((a) => a.startsWith('dof_replay_'))).toBe(false);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri.length).toBe(1);
  });
});
