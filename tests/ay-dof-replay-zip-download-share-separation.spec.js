// PWA 4R-PKG-3K -- "ZIP İndir" ve "Paylaşmayı Dene" aksiyonlarının
// bağımsızlığını kilitleyen sözleşme testleri.
//
// KÖK NEDEN (saha bulgusu): gerçek Android testinde "ZIP İndir"e basınca
// "Paylaşmayı Dene" butonu da görsel olarak tetikleniyor GİBİ görünüyordu
// ve ZIP indirme güvenilir çalışmıyordu (3-5 kez tıklandı). Kod incelemesi
// `navigator.share`'in ZIP İndir handler'ında HİÇ çağrılmadığını doğruladı
// -- asıl sorun iki butonun `disabled` durumunun (ve alttan alta indirme
// güvenilirliğinin) birbirine karışmasıydı:
//   1) `_dofReplayZipIndirTikla` "Paylaşmayı Dene" butonunu da
//      disabled=true/false yapıyordu (gereksiz çapraz bağlantı).
//   2) `_dofReplayPaylasTikla`'nın paylaşım SONRASI temizliği "ZIP İndir"/
//      "Hazırlık Oluştur" butonlarını da disabled=true/false yapıyordu.
//   3) ZIP İndir tıklama ile gerçek indirme arasında ağır (await'li) bir
//      üretim zinciri vardı -- Paylaş'ta zaten çözülmüş olan "tıklama ile
//      eylem arasındaki gecikme güvenilirliği düşürür" sınıfından bir risk.
//
// Bu dosya üç şeyi kilitler: (a) iki aksiyon fonksiyonel olarak bağımsız
// kalır, (b) iki butonun disabled/loading görsel durumu birbirine
// KARIŞMAZ, (c) ZIP İndir artık PAYLAŞIM için önceden üretilmiş, GÜNCEL
// cache'i tıklama anında yeniden üretmeden kullanabilir (indirme
// güvenilirliğini artırmak için) -- ama sözleşme/çıktı DEĞİŞMEZ.
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

async function tekDofKur(page, dofId = 1, bulguKodu = 'AY-1') {
  const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId, bulguKodu })] });
  await dosyaSec(page, JSON.stringify(paket));
  return { dofUuid: paket.tehlikeler[0].dofUuid, paketUuid: paket.paketUuid };
}

async function paketiAc(page, paketUuid) {
  await page.locator(`[data-paket-uuid="${paketUuid}"] button`, { hasText: 'Aç' }).click();
  await expect(page).toHaveURL(new RegExp(`#dof-package/${paketUuid}$`));
}

async function dofunaGir(page, dofUuid) {
  await page.locator(`.dof-liste-karti[data-dof-id="${dofUuid}"]`).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function paylasCacheHazirBekle(page) {
  await page.waitForFunction(() => {
    const c = window._dofPaylasimZipCacheOku && window._dofPaylasimZipCacheOku();
    return !!(c && c.hazir);
  }, { timeout: 5000 });
}

async function sorumluGirVeKaydet(page, deger) {
  await page.locator('#dof-takip-sorumlu').fill(deger);
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

/** ZIP İndir butonuna basıp gerçek indirmeyi yakalar (v-dof-replay-actions-ui.spec.js
 * ile aynı desen), aynı zamanda tıklama anındaki paylasBtn.disabled değerini de döner. */
async function zipIndirTiklaVeYakala(page) {
  const paylasBtnOncesi = await page.locator('#dof-replay-paylas-btn').isDisabled();
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dof-replay-zip-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-ay-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return { geciciYol, paylasBtnOncesi };
}

async function shareMockKur(page, { hataAt = null } = {}) {
  await page.addInitScript((hataAt) => {
    window.__shareCagriSayisi = 0;
    navigator.canShare = (veri) => !!(veri && veri.files);
    navigator.share = async (veri) => {
      window.__shareCagriSayisi += 1;
      window.__shareDosyaAdi = veri.files[0].name;
      if (hataAt) { const e = new Error(hataAt.mesaj); e.name = hataAt.ad; throw e; }
      return undefined;
    };
  }, hataAt);
}

test.describe('AY. ZIP İndir / Paylaşmayı Dene bağımsızlığı (4R-PKG-3K)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('1. ZIP İndir tıklanınca navigator.share HİÇ çağrılmaz', async ({ page }) => {
    await shareMockKur(page);
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Zip Only');

    await zipIndirTiklaVeYakala(page);
    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');

    expect(await page.evaluate(() => window.__shareCagriSayisi)).toBe(0);
  });

  test('2. ZIP İndir tıklanınca "Paylaşmayı Dene" butonunun disabled durumu HİÇ değişmez', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Buton Ayrimi');

    const paylasBtn = page.locator('#dof-replay-paylas-btn');
    await expect(paylasBtn).toBeEnabled();   // başlangıç durumu

    // ZIP İndir artık (cache hazırsa) ÇOK HIZLI tamamlanabildiği için
    // "hazırlanıyor..." ara durumunu Playwright polling'iyle YAKALAMAK
    // yarışa girer (flaky olur) -- bunun yerine `disabled` SETTER'ını
    // enstrümante edip işlem boyunca HİÇ `true` yazılmadığını kanıtlıyoruz,
    // zamanlamadan tamamen bağımsız bir kanıt.
    await page.evaluate(() => {
      const el = document.getElementById('dof-replay-paylas-btn');
      window.__paylasBtnYazilanlar = [];
      const proto = Object.getPrototypeOf(el);
      const tanim = Object.getOwnPropertyDescriptor(proto, 'disabled')
        || Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
      Object.defineProperty(el, 'disabled', {
        configurable: true,
        get() { return tanim.get.call(this); },
        set(v) { window.__paylasBtnYazilanlar.push(v); tanim.set.call(this, v); },
      });
    });

    const [indirme] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#dof-replay-zip-btn'),
    ]);
    await indirme.saveAs(path.join(os.tmpdir(), `pwa-test-ay-zip-${Date.now()}.zip`));

    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');
    await expect(paylasBtn).toBeEnabled();   // sonrasında da etkin

    const yazilanlar = await page.evaluate(() => window.__paylasBtnYazilanlar);
    expect(yazilanlar).toEqual([]);   // ZIP İndir işlemi boyunca HİÇ dokunulmadı
  });

  test('3. Paylaşmayı Dene başarıyla tetiklenince otomatik ZIP indirme YAPILMAZ', async ({ page }) => {
    await shareMockKur(page);
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Share Only');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');
    await page.waitForTimeout(300);

    expect(indirmeOldu).toBe(false);
    expect(await page.evaluate(() => window.__shareCagriSayisi)).toBe(1);
  });

  test('4. Paylaşmayı Dene tıklanınca "ZIP İndir"/"Hazırlık Oluştur" butonlarının disabled durumu değişmez', async ({ page }) => {
    await shareMockKur(page);
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Paylas Buton');
    await paylasCacheHazirBekle(page);

    const zipBtn = page.locator('#dof-replay-zip-btn');
    const hazirlikBtn = page.locator('#dof-replay-hazirlik-btn');
    await expect(zipBtn).toBeEnabled();

    // Zamanlamadan bağımsız kanıt (bkz. Test 2 yorumu): `disabled`
    // setter'ını enstrümante edip paylaşım işlemi boyunca HİÇ
    // `true` yazılmadığını doğruluyoruz.
    await page.evaluate(() => {
      window.__izlenenler = [];
      for (const id of ['dof-replay-zip-btn', 'dof-replay-hazirlik-btn']) {
        const el = document.getElementById(id);
        const proto = Object.getPrototypeOf(el);
        const tanim = Object.getOwnPropertyDescriptor(proto, 'disabled')
          || Object.getOwnPropertyDescriptor(HTMLButtonElement.prototype, 'disabled');
        Object.defineProperty(el, 'disabled', {
          configurable: true,
          get() { return tanim.get.call(this); },
          set(v) { window.__izlenenler.push({ id, v }); tanim.set.call(this, v); },
        });
      }
    });

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');
    await expect(zipBtn).toBeEnabled();
    await expect(hazirlikBtn).toBeEnabled();

    const izlenenler = await page.evaluate(() => window.__izlenenler);
    expect(izlenenler).toEqual([]);
  });

  test('5. Paylaşma başarısız olursa (gerçek hata) otomatik ZIP indirme YAPILMAZ ve ZIP/Hazırlık butonları etkilenmez', async ({ page }) => {
    await shareMockKur(page, { hataAt: { ad: 'NotAllowedError', mesaj: 'Permission denied' } });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Share Hata');
    await paylasCacheHazirBekle(page);

    const zipBtn = page.locator('#dof-replay-zip-btn');
    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım başarısız oldu');
    await expect(page.locator('#dof-replay-durum')).toContainText('ZIP İndir düğmesini kullanın');
    await page.waitForTimeout(300);

    expect(indirmeOldu).toBe(false);
    await expect(zipBtn).toBeEnabled();
  });

  test('6. Hızlı çift tıklamada ZIP İndir yalnız BİR indirme tetikler', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Cift Tiklama');

    const indirmeler = [];
    page.on('download', (d) => indirmeler.push(d));

    await page.evaluate(() => {
      window._dofReplayZipIndirTikla();
      window._dofReplayZipIndirTikla();   // eşzamanlı ikinci çağrı -- guard reddetmeli
    });
    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');
    await page.waitForTimeout(300);

    expect(indirmeler.length).toBe(1);
  });

  test('7. ZIP İndir geçerli dof_donus.json üretir -- ZIP/JSON sözleşmesi değişmedi', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Sozlesme');

    const { geciciYol } = await zipIndirTiklaVeYakala(page);
    const zip = new AdmZip(geciciYol);
    expect(zip.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.paketUuid).toBe(paketUuid);
    expect(belge.dofKontrolleri[0].dofUuid).toBe(dofUuid);
    expect(belge.dofKontrolleri[0].sorumlu).toBe('AY Sozlesme');
  });

  test('8. Paylaşım cache GÜNCELse ZIP İndir onu kullanır -- dofReplayZipOlustur TEKRAR çağrılmaz (hız/güvenilirlik kazanımı)', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'AY Cache Hizli');
    await paylasCacheHazirBekle(page);   // arka plan üretimi TAMAMLANDI, cache güncel

    await page.evaluate(() => {
      const orij = window._dofImport.dofReplayZipOlustur;
      window.__zipUretimSayisi = 0;
      window._dofImport.dofReplayZipOlustur = function (...a) {
        window.__zipUretimSayisi += 1;
        return orij.apply(this, a);
      };
    });

    const { geciciYol } = await zipIndirTiklaVeYakala(page);
    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');

    expect(await page.evaluate(() => window.__zipUretimSayisi)).toBe(0);   // cache'ten geldi, YENİDEN üretilmedi

    const zip = new AdmZip(geciciYol);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri[0].sorumlu).toBe('AY Cache Hizli');   // içerik yine doğru
  });

  test('9. Cache ESKİ ise (imza uyuşmuyor) ZIP İndir TAZE üretir -- asla eski veri döndürmez', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await sorumluGirVeKaydet(page, 'Once');
    await paylasCacheHazirBekle(page);   // cache 'Once' değeriyle hazır

    // Kaydet SONRASI, arka plan yeniden-üretiminin 400ms gecikmesi
    // BİTMEDEN doğrudan ZIP İndir'e bas -- eski cache hâlâ orada duruyor
    // olabilir, ama imza artık uyuşmadığı için KULLANILMAMALI.
    await page.locator('#dof-takip-sorumlu').fill('Sonra');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const { geciciYol } = await zipIndirTiklaVeYakala(page);
    const zip = new AdmZip(geciciYol);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.dofKontrolleri[0].sorumlu).toBe('Sonra');   // YENİ değer, ASLA 'Once' değil
  });
});
