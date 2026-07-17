// PWA Commit 4I -- DÖF replay hazırlık oluşturma ve medyasız ZIP indirme
// UI'ı ("Replay Paketi" kartı). Yalnız seçili TEK DÖF, medya/galeri/çoklu
// seçim YOK. Gerçek servisler (`dofReplayHazirlikGetir/Hazirla`,
// `dofReplayZipOlustur`, Commit 4C/4D) DEĞİŞTİRİLMEDİ -- bu dosya yalnız
// UI/DOM etkileşimini ve gerçek dosya indirmesini test eder.
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

const UUID_V4_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi,
    mimeType: 'application/json',
    buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function dofSecVeFormBekle(page, index = 0) {
  await page.locator('.dof-liste-karti').nth(index).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
  await expect(page.locator('#dof-replay-kart')).toBeVisible();
}

async function takipKaydet(page, alanlar) {
  const haritalar = {
    sorumlu: '#dof-takip-sorumlu',
    gerceklesen_faaliyet: '#dof-takip-gerceklesen-faaliyet',
  };
  for (const [alan, deger] of Object.entries(alanlar)) {
    await page.locator(haritalar[alan]).fill(deger);
  }
  await page.locator('#dof-takip-kaydet-btn').click();
  await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

/** ZIP İndir butonuna basıp gerçek indirmeyi yakalar, geçici dosyaya
 * kaydeder ve dosya yolunu döner (h-i-zip-export.spec.js ile aynı desen). */
async function zipIndirTikla(page) {
  const [indirme] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#dof-replay-zip-btn'),
  ]);
  const geciciYol = path.join(os.tmpdir(), `pwa-test-dof-zip-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  await indirme.saveAs(geciciYol);
  return geciciYol;
}

test.describe('V. DÖF replay hazırlık ve ZIP indirme UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test('A. DÖF seçilmeden replay bölümü pasif', async ({ page }) => {
    await expect(page.locator('#dof-replay-kart')).toBeHidden();
  });

  test('B. DÖF seçilince replay bölümü görünür -- butonlar görünür', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);

    await expect(page.locator('#dof-replay-hazirlik-btn')).toBeVisible();
    await expect(page.locator('#dof-replay-zip-btn')).toBeVisible();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Hazırlık yok');
  });

  test('C. Takip yokken hazırlık reddi -- hata gösterilir, DB\'de replayHazirlik oluşmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Takip bilgisi yok. Önce takip bilgisi girin.');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.replayHazirlik).toBeUndefined();
  });

  test('D. Takip gir -> hazırlık oluştur -- başarı mesajı, UUIDv4 submissionUuid', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await takipKaydet(page, { sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Korkuluk sabitlendi' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.replayHazirlik).toBeTruthy();
    expect(kayit.replayHazirlik.submissionUuid).toMatch(UUID_V4_DESENI);
  });

  test('E. Aynı taslakta hazırlık idempotent -- aynı submissionUuid, "zaten güncel"', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await takipKaydet(page, { sorumlu: 'Ahmet' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const ilkKayit = await dofKaydiGetir(page, dofUuid);

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı zaten güncel.');
    const ikinciKayit = await dofKaydiGetir(page, dofUuid);
    expect(ikinciKayit.replayHazirlik).toEqual(ilkKayit.replayHazirlik);
  });

  test('F. ZIP hazırlık yokken reddedilir -- indirme oluşmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet' });   // hazırlık OLUŞTURULMADI

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.locator('#dof-replay-zip-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı yok. Önce hazırlık oluşturun.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('G. ZIP indirme başarılı -- tek entry dof_donus.json, JSON takip+submissionUuid doğru', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Korkuluk sabitlendi' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const kayit = await dofKaydiGetir(page, dofUuid);

    const zipYolu = await zipIndirTikla(page);
    await expect(page.locator('#dof-replay-durum')).toHaveText('ZIP indirildi.');

    const zip = new AdmZip(zipYolu);
    const girdiler = zip.getEntries();
    expect(girdiler.map((e) => e.entryName)).toEqual(['dof_donus.json']);

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(belge.paketUuid).toBe(paket.paketUuid);
    const k = belge.dofKontrolleri[0];
    expect(k.dofUuid).toBe(dofUuid);
    expect(k.submissionUuid).toBe(kayit.replayHazirlik.submissionUuid);
    expect(k.sorumlu).toBe('Ahmet Yilmaz');
    expect(k.gerceklesen_faaliyet).toBe('Korkuluk sabitlendi');
    expect(Object.prototype.hasOwnProperty.call(k, 'dofId')).toBe(false);
  });

  test('H. Takip değişince eski hazırlıkla ZIP reddi -- indirme oluşmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    await takipKaydet(page, { sorumlu: 'Mehmet' });   // hazırlıktan SONRA değişti

    let indirmeOldu = false;
    page.once('download', () => { indirmeOldu = true; });
    await page.locator('#dof-replay-zip-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Takip bilgileri değişmiş. Hazırlığı yeniden oluşturun.');
    await page.waitForTimeout(300);
    expect(indirmeOldu).toBe(false);
  });

  test('I. Yeniden hazırlık sonrası ZIP başarılı -- yeni submissionUuid, yeni takip JSON\'da', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const eskiKayit = await dofKaydiGetir(page, dofUuid);

    await takipKaydet(page, { sorumlu: 'Mehmet' });
    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');
    const yeniKayit = await dofKaydiGetir(page, dofUuid);
    expect(yeniKayit.replayHazirlik.submissionUuid).not.toBe(eskiKayit.replayHazirlik.submissionUuid);

    const zipYolu = await zipIndirTikla(page);
    const zip = new AdmZip(zipYolu);
    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    const k = belge.dofKontrolleri[0];
    expect(k.sorumlu).toBe('Mehmet');
    expect(k.submissionUuid).toBe(yeniKayit.replayHazirlik.submissionUuid);
  });

  test('J. Explicit null ZIP UI akışı -- boşaltılan alan ZIP JSON\'da own-property + null', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet', gerceklesen_faaliyet: 'X' });

    await page.locator('#dof-takip-sorumlu').fill('');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    await page.locator('#dof-replay-hazirlik-btn').click();
    await expect(page.locator('#dof-replay-durum')).toHaveText('Replay hazırlığı oluşturuldu.');

    const zipYolu = await zipIndirTikla(page);
    const zip = new AdmZip(zipYolu);
    const k = JSON.parse(zip.readAsText('dof_donus.json', 'utf8')).dofKontrolleri[0];
    expect(Object.prototype.hasOwnProperty.call(k, 'sorumlu')).toBe(true);
    expect(k.sorumlu).toBe(null);
    expect(k.gerceklesen_faaliyet).toBe('X');
  });

  test('K. Çift tıklama koruması -- eşzamanlı iki hazırlık çağrısında yalnız biri işlenir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);
    await takipKaydet(page, { sorumlu: 'Ahmet' });

    const sonuc = await page.evaluate(async () => {
      const btnOncesi = document.getElementById('dof-replay-hazirlik-btn').disabled;
      const p1 = window._dofReplayHazirlikTikla();
      const btnEsSirasinda = document.getElementById('dof-replay-hazirlik-btn').disabled;
      const zipBtnEsSirasinda = document.getElementById('dof-replay-zip-btn').disabled;
      const p2 = window._dofReplayHazirlikTikla();   // eşzamanlı ikinci çağrı -- guard ANINDA reddetmeli
      await Promise.all([p1, p2]);
      const btnSonra = document.getElementById('dof-replay-hazirlik-btn').disabled;
      return { btnOncesi, btnEsSirasinda, zipBtnEsSirasinda, btnSonra };
    });

    expect(sonuc.btnOncesi).toBe(false);
    expect(sonuc.btnEsSirasinda).toBe(true);
    expect(sonuc.zipBtnEsSirasinda).toBe(true);   // ZIP butonu da işlem sırasında kilitli
    expect(sonuc.btnSonra).toBe(false);

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.replayHazirlik).toBeTruthy();   // tek, tutarlı bir hazırlık oluştu (çift/bozuk değil)
  });

  test('L. Legacy görünmez/güvenli -- UI\'da yok, servis çağrıları KANONIK_DOF_DEGIL, legacy değişmez', async ({ page }) => {
    // `dofReplayZipOlustur`/`dofReplayHazirlikHazirla` girdi doğrulaması
    // dofUuid'in UUID BİÇİMİNDE olmasını şart koştuğundan (Commit 3B/4B
    // sözleşmesi), WIP fixture'ı burada UUID-şekilli ama `dofUuid` alanı
    // hiç OLMAYAN (dolayısıyla `id===dofUuid` asla sağlanamayan) gerçekçi
    // bir legacy kayıt olarak kurgulanır -- girdi doğrulamasını geçip
    // gerçek kanoniklik reddine ulaşabilmesi için (bkz. Commit 4C/4E'deki
    // aynı düzeltme).
    const uuidBenzeriId = await page.evaluate(() => crypto.randomUUID());
    const wipKayit = {
      id: uuidBenzeriId, dofId: 701, bulguKodu: 'B-WIP', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
    await expect(page.locator('#dof-replay-kart')).toBeHidden();

    const servisSonucu = await page.evaluate(async (id) => {
      const denemeler = {};
      try {
        await window._dofImport.dofReplayHazirlikHazirla(id);
        denemeler.hazirlik = { basarili: true };
      } catch (e) {
        denemeler.hazirlik = { basarili: false, kod: e && e.kod };
      }
      try {
        await window._dofImport.dofReplayZipOlustur([id]);
        denemeler.zip = { basarili: true };
      } catch (e) {
        denemeler.zip = { basarili: false, kod: e && e.kod };
      }
      return denemeler;
    }, uuidBenzeriId);
    expect(servisSonucu.hazirlik.basarili).toBe(false);
    expect(servisSonucu.hazirlik.kod).toBe('KANONIK_DOF_DEGIL');
    expect(servisSonucu.zip.basarili).toBe(false);
    expect(servisSonucu.zip.kod).toBe('KANONIK_DOF_DEGIL');

    const wipSonra = await dofKaydiGetir(page, uuidBenzeriId);
    expect(wipSonra).toEqual(wipKayit);
  });

  test('M. Normal saha regresyonu -- kurulum formu, import/liste/takip/replay UI\'ları birlikte çalışır', async ({ page }) => {
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeVisible();
    await expect(page.locator('h2', { hasText: "İçe Aktarılan DÖF'ler" })).toBeVisible();
    await expect(page.locator('#setup-kurum')).toBeEnabled();
  });
});
