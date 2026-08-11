// PWA 4R-PKG-3I -- GERÇEK ANDROID CİHAZ sözleşme testleri + teşhis durumu.
//
// NEDEN BU DOSYA VAR: 3G (Kaydet) ve 3H (Paylaş) düzeltmelerinden sonra
// Playwright suite'i 424/424 YEŞİL geçtiği HÂLDE gerçek Android cihazda
// iki sorun da sürdü. Yani mevcut testler doğru şeyleri ölçüyordu ama
// EKSİK ölçüyordu. Bu dosya, testlerin daha önce HİÇ doğrulamadığı
// sözleşme noktalarını kapatır:
//
//   - "pasif görünüyor" ile "native disabled" ARASINDAKİ AYRIM: buton
//     pasifken gerçekten `disabled === true` mi, aria-disabled uyumlu mu,
//     ve pasif/aktif görünüm BİLGİSAYARLA ÖLÇÜLEBİLİR şekilde farklı mı
//     (gerçek cihazda kullanıcı AKTİF butonu pasif sanıyordu -- yalnız
//     opacity ile ayırt etmek güneş altında yetersizdi).
//   - wrapper/parent tıklamasının DB yazamayacağı.
//   - O/F/S kısmi üçlü reddinin kullanıcıya AÇIK sebeple bildirilmesi
//     (sahada "Kaydet güvenilmez" algısının en olası kaynağı).
//   - Paylaş tarafında `canShare` dalları, MIME geri düşüşü, hata adının
//     mesajda görünmesi ve tıklama->share gecikmesinin ölçülebilirliği.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (diğer DÖF dosyalarıyla aynı desen).
const { test, expect } = require('@playwright/test');
const { dbTemizle } = require('./migration-helpers');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test.describe.configure({ mode: 'serial' });

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi, mimeType: 'application/json', buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function tekDofKur(page, dofId = 1, bulguKodu = 'AW-1') {
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

async function dofGaleriFotoYukle(page) {
  await page.setInputFiles('#dof-kanit-galeri-input', {
    name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
  });
}

async function paylasCacheHazirBekle(page) {
  await page.waitForFunction(() => {
    const c = window._dofPaylasimZipCacheOku && window._dofPaylasimZipCacheOku();
    return !!(c && c.hazir);
  }, { timeout: 5000 });
}

function debugOku(page) {
  return page.evaluate(() => window._dofDebugDurumOku());
}

/** `canShare`'i MIME'a göre AYRI AYRI yanıtlayan mock -- gerçek Chrome'un
 * "izin verilen dosya tipi listesi" davranışını taklit eder. */
async function mimeDuyarliPaylasimMockKur(page, { izinliMimeler, hataAt = null }) {
  await page.addInitScript(({ izinliMimeler, hataAt }) => {
    window.__paylasimCagrilari = [];
    navigator.canShare = (veri) => {
      if (!veri || !veri.files) return false;
      return veri.files.every((f) => izinliMimeler.includes(f.type));
    };
    navigator.share = async (veri) => {
      window.__paylasimCagrilari.push({ dosyaAdi: veri.files[0].name, tip: veri.files[0].type });
      if (hataAt) { const e = new Error(hataAt.mesaj); e.name = hataAt.ad; throw e; }
      return undefined;
    };
  }, { izinliMimeler, hataAt });
}

test.describe('AW. Android canlı sözleşme + teşhis (4R-PKG-3I)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
    // NOT: paylaşım mock'ları addInitScript kullandığından `/index.html`'e
    // geçiş her testin İÇİNDE (mock kurulumundan SONRA) yapılır.
  });

  test.afterEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  // ─── KAYDET SÖZLEŞMESİ ─────────────────────────────────────────

  test('K1. Pasif Kaydet -- native disabled=true VE aria-disabled=true (görsel/anlamsal durum ayrışamaz)', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const btn = page.locator('#dof-takip-kaydet-btn');
    await expect(btn).toBeDisabled();
    expect(await btn.evaluate((el) => el.disabled)).toBe(true);
    await expect(btn).toHaveAttribute('aria-disabled', 'true');
  });

  test('K2. Pasif Kaydet -- programatik çağrı DB yazmaz, sonuç blocked_disabled_true olarak kaydedilir', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    await page.evaluate(() => window._dofTakipKaydet());
    await expect(page.locator('#dof-takip-durum')).toHaveText('Değişiklik yok.');

    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();
    const d = await debugOku(page);
    expect(d.sonKaydetSonucu).toBe('blocked_disabled_true');
    expect(d.sonDbYazmaZamani).toBeNull();
  });

  test('K3. Wrapper/parent tıklaması -- pasif butonun ATASINA tıklamak DB yazmaz', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    // Butonun ATASINA (buton grubunu saran div) tıkla -- gerçek cihazda
    // kalın parmakla butonun 1-2 piksel dışına basmak bu elemana denk gelir.
    await page.locator('#dof-takip-kaydet-btn').evaluate((el) => el.parentElement.click());
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();
  });

  test('K4. Dirty true -> disabled=false / aria-disabled=false; Kaydet sonrası tekrar true', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const btn = page.locator('#dof-takip-kaydet-btn');
    await page.locator('#dof-takip-sorumlu').fill('AW Sorumlu');
    await expect(btn).toBeEnabled();
    await expect(btn).toHaveAttribute('aria-disabled', 'false');

    await btn.click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('aria-disabled', 'true');

    const d = await debugOku(page);
    expect(d.sonKaydetSonucu).toBe('saved_ok');
    expect(d.sonDbYazmaZamani).not.toBeNull();
  });

  test('K5. Pasif/aktif Kaydet GÖRSEL olarak ölçülebilir biçimde farklı (yalnız opacity DEĞİL)', async ({ page }) => {
    // Gerçek Android kök nedeni: pasif ile aktif buton yalnız opacity 0.55
    // ile ayrılıyordu; parlak ekranda kullanıcı AKTİF butonu "pasif" sanıp
    // "Kaydet pasif ama kayıt yapıyor" diye bildirdi. Artık pasif buton
    // ZEMİN RENGİNİ de kaybediyor -- bu testi geçmek için renk farkı şart.
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const btn = page.locator('#dof-takip-kaydet-btn');
    const pasifStil = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, renk: s.color };
    });

    await page.locator('#dof-takip-sorumlu').fill('AW Gorsel');
    await expect(btn).toBeEnabled();
    const aktifStil = await btn.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, renk: s.color };
    });

    expect(pasifStil.bg).not.toBe(aktifStil.bg);   // zemin rengi DE değişmeli
  });

  test('K6. Medya ekleme Kaydet dirty-state\'ini DEĞİŞTİRMEZ, takip DB yazması yapmaz', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    const btn = page.locator('#dof-takip-kaydet-btn');
    await expect(btn).toBeDisabled();
    await dofGaleriFotoYukle(page);
    await expect(page.locator('#dof-kanit-medya-ozet')).toHaveText('1 fotoğraf eklendi.');

    await expect(btn).toBeDisabled();
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();   // medya takip taslağı YAZMAZ
  });

  test('K7. O/F/S kısmi üçlü -- kullanıcıya AÇIK sebep gösterilir (genel "geçersiz değer" değil)', async ({ page }) => {
    // Sahada en sık "Kaydet güvenilmez" algısı buradan doğuyordu: yalnız
    // "Yeni O" seçen kullanıcı, sebebi söylenmeden reddediliyordu.
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    await page.selectOption('#dof-takip-yeni-o', '10');   // yalnız O -- F ve S boş
    await page.locator('#dof-takip-kaydet-btn').click();

    await expect(page.locator('#dof-takip-durum')).toContainText('Olasılık (O), Frekans (F), Şiddet (Ş) birlikte doldurulmalı');
    const kayit = await page.evaluate((u) => window._idb.dbGetir('dofler', u), dofUuid);
    expect(kayit.takipTaslagi).toBeUndefined();   // DB DEĞİŞMEDİ
    // Kullanıcı düzeltebilsin diye buton tekrar aktif olmalı.
    await expect(page.locator('#dof-takip-kaydet-btn')).toBeEnabled();
  });

  test('K8. Son event türü/alanı teşhis durumuna yazılır (Android input/change ayrımı için)', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    await page.locator('#dof-takip-sorumlu').fill('AW Event');
    let d = await debugOku(page);
    expect(d.sonEventAlani).toBe('sorumlu');
    expect(['input', 'change']).toContain(d.sonEventTuru);

    await page.selectOption('#dof-takip-yeni-o', '10');
    d = await debugOku(page);
    expect(d.sonEventAlani).toBe('yeni_o');
    expect(['input', 'change']).toContain(d.sonEventTuru);
  });

  // ─── PAYLAŞ SÖZLEŞMESİ ─────────────────────────────────────────

  test('P1. Cache hazır değilken tıklama -- share çağrılmaz, kullanıcı bilgilendirilir', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, { izinliMimeler: ['application/zip'] });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    // Hiç takip/medya yok -> paylaşılacak değişmiş DÖF yok -> cache hazır olmaz.
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım hazırlanıyor');
    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(0);
  });

  test('P2. Tıklama -> navigator.share gecikmesi ÇOK KÜÇÜK (ağır üretim tıklama anında yok)', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, { izinliMimeler: ['application/zip'] });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW Paylas');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const d = await debugOku(page);
    // Gerçek cihazda transient user activation penceresi ~5sn; burada
    // ölçülen değer tıklama ile share çağrısı ARASINDAKİ süredir ve
    // yalnız `new File(...)` + `canShare` kadar olmalıdır.
    expect(d.shareCagriGecikmesiMs).toBeLessThan(250);
    expect(d.kullanilanMime).toBe('application/zip');
    expect(d.shareHataAdi).toBeNull();
  });

  test('P3. MIME geri düşüşü -- zip reddedilir ama octet-stream kabul edilirse AYNI dosya adıyla paylaşılır', async ({ page }) => {
    // Chrome (Android) Web Share dosya tipi allowlist'i `application/zip`i
    // kabul etmiyorsa paylaşım hiç denenmezdi. Artık aynı baytlar ve aynı
    // `.zip` adıyla octet-stream olarak denenir -- ZIP SÖZLEŞMESİ AYNI.
    await mimeDuyarliPaylasimMockKur(page, { izinliMimeler: ['application/octet-stream'] });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW MIME');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(1);
    expect(cagrilar[0].tip).toBe('application/octet-stream');
    expect(cagrilar[0].dosyaAdi).toMatch(/\.zip$/);   // dosya ADI değişmedi

    const d = await debugOku(page);
    expect(d.canShareZip).toBe(false);
    expect(d.canShareOctet).toBe(true);
    expect(d.kullanilanMime).toBe('application/octet-stream');
  });

  test('P4. Hiçbir MIME kabul edilmiyorsa -- otomatik indirme YOK, mesaj hangi MIME\'ların reddedildiğini söyler', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, { izinliMimeler: [] });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW Destek Yok');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('desteklemiyor');
    await expect(page.locator('#dof-replay-durum')).toContainText('zip:false');
    await expect(page.locator('#dof-replay-durum')).toContainText('octet:false');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);

    const cagrilar = await page.evaluate(() => window.__paylasimCagrilari);
    expect(cagrilar.length).toBe(0);
  });

  test('P5. NotAllowedError -- mesajda hata ADI görünür, otomatik indirme YOK, teşhis durumu dolu', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, {
      izinliMimeler: ['application/zip'],
      hataAt: { ad: 'NotAllowedError', mesaj: 'Permission denied' },
    });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW NotAllowed');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('Paylaşım başarısız oldu');
    await expect(page.locator('#dof-replay-durum')).toContainText('NotAllowedError');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);

    const d = await debugOku(page);
    expect(d.shareHataAdi).toBe('NotAllowedError');
    expect(d.shareHataMesaji).toBe('Permission denied');
  });

  test('P6. TypeError/DataError -- aynı sözleşme: hata adı mesajda, otomatik indirme YOK', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, {
      izinliMimeler: ['application/zip'],
      hataAt: { ad: 'DataError', mesaj: 'bozuk veri' },
    });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW DataError');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toContainText('DataError');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('P7. AbortError (kullanıcı iptali) -- ayrı mesaj, indirme YOK', async ({ page }) => {
    await mimeDuyarliPaylasimMockKur(page, {
      izinliMimeler: ['application/zip'],
      hataAt: { ad: 'AbortError', mesaj: 'iptal' },
    });
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill('AW Abort');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşım iptal edildi.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  // ─── 4R-PKG-3I-SHARE: USER GESTURE ZİNCİRİ ─────────────────────
  // Gerçek Android debug çıktısı kök nedeni kesinleştirdi:
  //   canShare(zip)=true, canShare(octet)=true  -> MIME sorunu DEĞİL
  //   share hata: NotAllowedError / Permission denied
  //   userActivation: isActive=FALSE  (tıklama->share yalnız 7ms olmasına rağmen)
  // Yani çağrı, kullanıcı gesture'ı SÜRE nedeniyle değil, tıklanan elemanın
  // dispatch sırasında değiştirilmesi nedeniyle aktivasyonu kaybediyordu
  // (eski kod share'den ÖNCE `paylasBtn.disabled = true` yapıyordu).
  // Aşağıdaki testler "share, tıklama handler'ının en erken senkron
  // noktasında çağrılıyor" sözleşmesini KİLİTLER.

  async function paylasaHazirla(page, etiket) {
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);
    await page.locator('#dof-takip-sorumlu').fill(etiket);
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    await paylasCacheHazirBekle(page);
  }

  test('G1. navigator.share, tıklamanın AYNI görev (task) turunda ve DOM değiştirilmeden çağrılır', async ({ page }) => {
    // Teknik notu: bayrağı bir MICROTASK ile kapatmak yanıltıcıdır --
    // olay gönderimi sırasında her dinleyici çağrısından sonra microtask
    // kontrol noktası çalışır, yani capture dinleyicisinin microtask'ı
    // butonun kendi onclick'inden ÖNCE koşar. Bu yüzden bayrak MAKROTASK
    // (setTimeout) ile kapatılır: bu, "share tıklamanın aynı görevinde mi
    // çağrıldı, yoksa sonraki bir göreve mi ertelendi" sorusunu doğru
    // ölçer. "Araya await girmedi" güvencesi ise G4 ile sağlanır --
    // `async` OLMAYAN bir fonksiyon zaten `await` EDEMEZ.
    await page.addInitScript(() => {
      window.__senkronPencere = false;
      window.__shareSenkronMuydu = null;
      window.__shareAnindaButonDisabled = null;
      window.__shareAnindaDurumMetni = null;
      document.addEventListener('click', () => {
        window.__senkronPencere = true;
        setTimeout(() => { window.__senkronPencere = false; }, 0);
      }, true);
      navigator.canShare = (veri) => !!(veri && veri.files);
      navigator.share = async (veri) => {
        window.__shareSenkronMuydu = window.__senkronPencere;
        const btn = document.getElementById('dof-replay-paylas-btn');
        window.__shareAnindaButonDisabled = btn ? btn.disabled : null;
        window.__shareAnindaDurumMetni = (document.getElementById('dof-replay-durum') || {}).textContent;
        return undefined;
      };
    });
    await page.goto('/index.html');
    await paylasaHazirla(page, 'AW Gesture');

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const olcum = await page.evaluate(() => ({
      senkron: window.__shareSenkronMuydu,
      butonDisabled: window.__shareAnindaButonDisabled,
      durumMetni: window.__shareAnindaDurumMetni,
    }));
    // ANA KABUL KRİTERİ: share, tıklamanın AYNI görev turunda çağrıldı
    // (sonraki bir task'a ertelenmedi).
    expect(olcum.senkron).toBe(true);
    // Tıklanan buton share çağrısı ANINDA hâlâ etkin olmalı -- gerçek
    // Android'de aktivasyonu bozan tam olarak buydu.
    expect(olcum.butonDisabled).toBe(false);
    // share'den ÖNCE durum metnine yazılmamış olmalı (DOM yazımı yok).
    expect(olcum.durumMetni).toBe('');
  });

  test('G2. share\'den ÖNCE ağır üretim fonksiyonları çağrılmaz (yalnız cache okuma + File + canShare)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__agirCagriSayaci = 0;
      window.__shareOncesiAgirCagri = null;
      navigator.canShare = (veri) => !!(veri && veri.files);
      navigator.share = async () => { window.__shareOncesiAgirCagri = window.__agirCagriSayaci; };
    });
    await page.goto('/index.html');
    await paylasaHazirla(page, 'AW Agir');

    // ZIP üretim zincirini sayaçla sar -- tıklamadan SONRA hiç artmamalı.
    await page.evaluate(() => {
      const orij = window._dofImport.dofReplayZipOlustur;
      window._dofImport.dofReplayZipOlustur = function (...a) {
        window.__agirCagriSayaci += 1;
        return orij.apply(this, a);
      };
      window.__agirCagriSayaci = 0;
    });

    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');
    expect(await page.evaluate(() => window.__shareOncesiAgirCagri)).toBe(0);
  });

  test('G3. userActivation share ÖNCESİ ve SONRASI ayrı ölçülür ve panelde ayrı gösterilir', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.canShare = (veri) => !!(veri && veri.files);
      navigator.share = async () => undefined;
    });
    await page.goto('/index.html');
    await paylasaHazirla(page, 'AW UA');

    await page.click('#dof-gelistirici-detay summary');
    await page.click('#dof-replay-paylas-btn');
    await expect(page.locator('#dof-replay-durum')).toHaveText('Paylaşıma gönderildi.');

    const d = await debugOku(page);
    // Alanlar AYRI kaydediliyor (değerler tarayıcıya göre değişebilir;
    // burada ölçümün YAPILDIĞI garanti altına alınır).
    expect(Object.prototype.hasOwnProperty.call(d, 'uaOnceIsActive')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(d, 'uaSonraIsActive')).toBe(true);

    const panel = page.locator('#dof-debug-panel');
    await expect(panel).toContainText('userActivation ÖNCE');
    await expect(panel).toContainText('userActivation SONRA');
  });

  test('G4. Paylaş handler\'ı async DEĞİL -- inline onclick doğrudan senkron fonksiyona bağlı', async ({ page }) => {
    await page.goto('/index.html');
    const bilgi = await page.evaluate(() => ({
      tip: typeof window._dofReplayPaylasTikla,
      // async fonksiyonların constructor adı 'AsyncFunction' olur.
      ctor: window._dofReplayPaylasTikla.constructor.name,
      onclick: document.getElementById('dof-replay-paylas-btn').getAttribute('onclick'),
    }));
    expect(bilgi.tip).toBe('function');
    expect(bilgi.ctor).toBe('Function');          // AsyncFunction DEĞİL
    expect(bilgi.onclick).toBe('_dofReplayPaylasTikla()');
  });

  // ─── DEBUG PANELİ ──────────────────────────────────────────────

  test('D1. Debug paneli VARSAYILAN OLARAK GİZLİ -- production kullanıcısını rahatsız etmez', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#dof-debug-panel')).toBeHidden();
  });

  test('D2. Debug paneli açılınca Kaydet ve Paylaş teşhis satırlarını gösterir, kapanınca gizlenir', async ({ page }) => {
    await page.goto('/index.html');
    const { dofUuid, paketUuid } = await tekDofKur(page);
    await paketiAc(page, paketUuid);
    await dofunaGir(page, dofUuid);

    await page.click('#dof-gelistirici-detay summary');
    const panel = page.locator('#dof-debug-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('== KAYDET ==');
    await expect(panel).toContainText('btn.disabled');
    await expect(panel).toContainText('dirty alan sayısı');
    await expect(panel).toContainText('== PAYLAŞ ==');
    await expect(panel).toContainText('canShare(zip)');
    await expect(panel).toContainText('userActivation');

    // Alan değişince panel canlı güncellenir.
    await page.locator('#dof-takip-sorumlu').fill('AW Panel');
    await expect(panel).toContainText('sorumlu');

    await page.click('#dof-gelistirici-detay summary');
    await expect(panel).toBeHidden();
  });

  test('D3. Debug tercihi localStorage.DEBUG_DOF ile saklanır -- sayfa yenilenince korunur', async ({ page }) => {
    await page.goto('/index.html');
    await page.click('#dof-gelistirici-detay summary');
    await expect(page.locator('#dof-debug-panel')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('DEBUG_DOF'))).toBe('1');

    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('#dof-debug-panel')).toBeVisible();
  });
});
