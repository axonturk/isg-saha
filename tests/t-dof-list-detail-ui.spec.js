// PWA Commit 4G -- DÖF liste ve detay UI ("İçe Aktarılan DÖF'ler" +
// "DÖF Detayı" kartları). Yalnız OKUNUR görünüm -- düzenleme/replay
// hazırlık/ZIP/medya UI'ı YOKTUR. Gerçek servisler (`dofPaketiIceriAktar`,
// `dofTakipTaslagiGuncelle`) DEĞİŞTİRİLMEDİ -- bu dosya yalnız
// liste/detay render'ını test eder.
const { test, expect } = require('@playwright/test');
const { storeTumu } = require('./helpers');
const { gecerliDofKaydi, gecerliDofPaketi, sentetikUuidV4 } = require('./dof-import-fixtures');

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi,
    mimeType: 'application/json',
    buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function taslakGuncelleDene(page, dofUuid, degisiklikler) {
  return page.evaluate(async ({ u, d }) => {
    try {
      const sonuc = await window._dofImport.dofTakipTaslagiGuncelle(u, d);
      return { basarili: true, sonuc };
    } catch (e) {
      return { basarili: false, kod: e && e.kod, mesaj: e && e.message };
    }
  }, { u: dofUuid, d: degisiklikler });
}

test.describe('T. DÖF liste ve detay UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test('A. Boş liste -- DÖF yokken bölüm görünür, boş durum mesajı', async ({ page }) => {
    await expect(page.locator('h2', { hasText: "İçe Aktarılan DÖF'ler" })).toBeVisible();
    await expect(page.locator('#dof-liste-durum')).toHaveText('Henüz içe aktarılmış DÖF yok.');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
    await expect(page.locator('#dof-detay-kart')).toBeHidden();
  });

  test('B. Import sonrası liste yenilenir -- kayıt görünür, temel bilgiler doğru', async ({ page }) => {
    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-7', tehlikeNo: 3, kat: '2', oda: '210', riskDuzeyi: 'Yüksek Risk', r: 100 });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });

    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');

    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    const kart = page.locator('.dof-liste-karti').first();
    await expect(kart).toContainText('B-7');
    await expect(kart).toContainText('Yüksek Risk');
    await expect(kart).toContainText('R=100');
    await expect(kart).toContainText('2 / 210');
    await expect(kart).toContainText('Tehlike No: 3');
  });

  test('C. Sayfa yenileme sonrası liste kalır -- IndexedDB\'den tekrar yüklenir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-9' })] });
    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('.dof-liste-karti').first()).toContainText('B-9');
  });

  test('D. Detay açılır -- imported kimlikler ve risk/tehlike bilgileri görünür', async ({ page }) => {
    const kayit = gecerliDofKaydi({
      dofId: 42, bulguKodu: 'B-1', tehlikeTanimi: 'Açık pano tehlikesi',
      duzelticiFaaliyet: 'Kapak kapatılmalı', aksiyonSuresi: 'derhal',
    });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await dosyaSec(page, JSON.stringify(paket));

    await page.locator('.dof-liste-karti').first().click();
    await expect(page.locator('#dof-detay-kart')).toBeVisible();
    const detay = page.locator('#dof-detay');
    await expect(detay).toContainText(kayit.dofUuid.slice(0, 8));
    await expect(detay).toContainText(kayit.exportUuid.slice(0, 8));
    await expect(detay).toContainText(paket.paketUuid.slice(0, 8));
    await expect(detay).toContainText('Açık pano tehlikesi');
    await expect(detay).toContainText('Kapak kapatılmalı');
    await expect(detay).toContainText('derhal');

    // dofId artık replay belgesinde kullanılmıyor (Commit 4B-1) -- detayda
    // kritik bir KİMLİK gibi (örn. "DÖF Kimliği: 42" veya "dofId" etiketiyle) sunulmamalı.
    await expect(detay).not.toContainText('dofId');
    await expect(detay).not.toContainText('DÖF Kimliği');
  });

  test('E. İki DÖF seçimi -- seçili kart değişir, doğru detay gösterilir', async ({ page }) => {
    const paket = gecerliDofPaketi({
      tehlikelerOverride: [
        gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-BIRINCI', tehlikeTanimi: 'Birinci tehlike' }),
        gecerliDofKaydi({ dofId: 2, bulguKodu: 'B-IKINCI', tehlikeTanimi: 'Ikinci tehlike' }),
      ],
    });
    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(2);

    const kartlar = page.locator('.dof-liste-karti');
    await kartlar.nth(0).click();
    await expect(page.locator('#dof-detay')).toContainText('Birinci tehlike');

    await kartlar.nth(1).click();
    await expect(page.locator('#dof-detay')).toContainText('Ikinci tehlike');
    await expect(page.locator('#dof-detay')).not.toContainText('Birinci tehlike');
  });

  test('F. Duplicate import duplicate liste üretmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-DUP' })] });
    const jsonMetni = JSON.stringify(paket);

    await dosyaSec(page, jsonMetni);
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);

    await dosyaSec(page, jsonMetni);   // AYNI dosya ikinci kez
    await expect(page.locator('#dof-import-durum')).toHaveText('Paket zaten içe aktarılmış');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);   // duplicate satır OLUŞMADI
  });

  test('G. Conflict listeyi bozmaz -- mevcut kanonik kayıt gösterilmeye devam eder', async ({ page }) => {
    const dofUuid = sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid, bulguKodu: 'B-CAKISMA' })] });
    await dosyaSec(page, JSON.stringify(ilkPaket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);

    const celisenPaket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid, bulguKodu: 'B-CAKISMA', exportUuid: sentetikUuidV4() })],
    });
    await dosyaSec(page, JSON.stringify(celisenPaket), 'celisen.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Çakışma var');

    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);   // liste bozulmadı
    await page.locator('.dof-liste-karti').first().click();
    await expect(page.locator('#dof-detay')).toContainText(ilkPaket.tehlikeler[0].exportUuid.slice(0, 8));   // ORİJİNAL kimlik
  });

  test('H. Legacy WIP görünmez -- yalnız kanonik kayıt listelenir, legacy değişmez', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_t1', dofId: 999, bulguKodu: 'B-WIP', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);
    await page.reload();   // listeyi yeniden tetikle
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    // Yalnız legacy varken liste BOŞ görünmeli.
    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
    await expect(page.locator('#dof-liste-durum')).toHaveText('Henüz içe aktarılmış DÖF yok.');

    // Kanonik + legacy birlikte -- yalnız kanonik görünmeli.
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-KANONIK' })] });
    await dosyaSec(page, JSON.stringify(paket));
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('.dof-liste-karti').first()).toContainText('B-KANONIK');
    await expect(page.locator('.dof-liste-karti')).not.toContainText('B-WIP');

    const wipSonra = await page.evaluate(async () => window._idb.dbGetir('dofler', 'dof_wip_t1'));
    expect(wipSonra).toEqual(wipKayit);   // legacy DEĞİŞMEDİ
  });

  test('I. Takip taslağı okunur özet -- input/textarea/select yok, sızıntı olmadan görünür', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, bulguKodu: 'B-TASLAK' })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;

    await taslakGuncelleDene(page, dofUuid, { sorumlu: 'Ahmet Yilmaz', gerceklesen_faaliyet: 'Pano kapatildi' });
    await page.reload();   // listeyi/detayı DB'den taze yükle
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    await page.locator('.dof-liste-karti').first().click();
    const detay = page.locator('#dof-detay');
    await expect(detay).toContainText('Sorumlu');
    await expect(detay).toContainText('Ahmet Yilmaz');
    await expect(detay).toContainText('Pano kapatildi');

    // Düzenlenebilir hiçbir form elemanı YOK -- yalnızca okunur özet.
    await expect(detay.locator('input')).toHaveCount(0);
    await expect(detay.locator('textarea')).toHaveCount(0);
    await expect(detay.locator('select')).toHaveCount(0);
  });

  test('J. Normal saha akışı regresyonu -- DÖF liste/detay eklendikten sonra kurulum formu çalışır', async ({ page }) => {
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('#setup-birim')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Yeni Denetim' }).or(page.locator('h2', { hasText: 'Yeni Denetim' }))).toBeVisible();
    await expect(page.locator('#setup-kurum')).toBeEnabled();
  });
});
