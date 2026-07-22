// PWA Commit 4N -- DÖF inceleme durumu (reviewStatus) UI'ı ("İnceleme
// Durumu" kartı). Ayrı, bağımsız bir kart -- `#dof-detay-kart`'ın İÇİNDE
// DEĞİL (mevcut salt-okunur `#dof-detay` sözleşmesi bozulmaz). Gerçek
// servisler (`dofReviewStatusGetir/Guncelle`, Commit 4N servis katmanı)
// DEĞİŞTİRİLMEDİ -- bu dosya yalnız UI/DOM etkileşimini test eder.
const AdmZip = require('adm-zip');
const { test, expect } = require('@playwright/test');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi,
    mimeType: 'application/json',
    buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

test.describe('AF. DÖF inceleme durumu (reviewStatus) UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test('A. DÖF seçilmeden kart gizli, kanonik DÖF seçilince görünür', async ({ page }) => {
    await expect(page.locator('#dof-review-durum-kart')).toBeHidden();

    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await page.locator('.dof-liste-karti').first().click();

    await expect(page.locator('#dof-review-durum-kart')).toBeVisible();
  });

  test('B. Varsayılan seçenek "Dokunulmadı" -- DB\'ye yazma yok, açıklama boş', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    await expect(page.locator('#dof-review-durum-secici')).toHaveValue('dokunulmadi');
    await expect(page.locator('#dof-review-durum-aciklama')).toHaveText('');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')).toBe(false);
  });

  test('C. Seçim değişince kalıcılaşır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    await page.locator('#dof-review-durum-secici').selectOption('goruldu');

    await expect.poll(async () => {
      const kayit = await dofKaydiGetir(page, dofUuid);
      return kayit.reviewStatus;
    }).toBe('goruldu');
  });

  test('D. Sayfa yenileme sonrası değer korunur', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    await page.locator('#dof-review-durum-secici').selectOption('inceledi_degisiklik_yok');
    await expect.poll(async () => (await dofKaydiGetir(page, dofUuid)).reviewStatus)
      .toBe('inceledi_degisiklik_yok');

    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.locator('.dof-liste-karti').first().click();

    await expect(page.locator('#dof-review-durum-secici')).toHaveValue('inceledi_degisiklik_yok');
  });

  test('E. "Kapatma önerisi" açıklaması doğru gösterilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await page.locator('.dof-liste-karti').first().click();

    await page.locator('#dof-review-durum-secici').selectOption('kapatma_onerisi');
    await expect(page.locator('#dof-review-durum-aciklama'))
      .toHaveText("Kapatma önerisi — final karar Desktop'ta verilir.");
  });

  test('F. "Kapatılamaz" açıklaması doğru gösterilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await page.locator('.dof-liste-karti').first().click();

    await page.locator('#dof-review-durum-secici').selectOption('kapatilamaz');
    await expect(page.locator('#dof-review-durum-aciklama'))
      .toHaveText('Kapatılamaz — uygunsuzluk devam ediyor.');
  });

  test('G. "Kapatma önerisi"/"Kapatılamaz" hiçbir kapanış alanı üretmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    for (const deger of ['kapatma_onerisi', 'kapatilamaz']) {
      await page.locator('#dof-review-durum-secici').selectOption(deger);
      await expect.poll(async () => (await dofKaydiGetir(page, dofUuid)).reviewStatus).toBe(deger);

      const kayit = await dofKaydiGetir(page, dofUuid);
      for (const yasakAlan of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto', 'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici']) {
        expect(Object.prototype.hasOwnProperty.call(kayit, yasakAlan), `${deger} -> ${yasakAlan}`).toBe(false);
      }
    }
  });

  test('H. #dof-detay içinde input/textarea/select hâlâ 0 (salt-okunur sözleşme bozulmadı)', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await page.locator('.dof-liste-karti').first().click();
    await expect(page.locator('#dof-review-durum-kart')).toBeVisible();

    await expect(page.locator('#dof-detay input')).toHaveCount(0);
    await expect(page.locator('#dof-detay textarea')).toHaveCount(0);
    await expect(page.locator('#dof-detay select')).toHaveCount(0);
  });

  test('I. Mevcut Takip Bilgileri formu bozulmaz -- reviewStatus kartıyla karışmaz', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    await page.locator('#dof-review-durum-secici').selectOption('goruldu');
    await expect.poll(async () => (await dofKaydiGetir(page, dofUuid)).reviewStatus).toBe('goruldu');

    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi).toEqual({ sorumlu: 'Ahmet Yilmaz' });
    expect(kayit.reviewStatus).toBe('goruldu');   // birbirini etkilemedi
  });

  // NOT (PWA Commit 4O): Bu test 4N'de, reviewStatus export sözleşmesi
  // henüz TASARLANMADAN önce yazılmıştı ve o zamanki doğru/savunmacı
  // varsayımla "reviewStatus asla sızmaz" diye kilitlemişti. 4O bu
  // sözleşmeyi KASITLI olarak ekledi (bkz. tests/ag-dof-review-status-export.spec.js,
  // dof_donus.json sözleşmesi artık incelenmiş DÖF'ler için reviewStatus
  // taşıyor) -- bu yüzden aşağıdaki assertion, ESKİMİŞ varsayımdan YENİ,
  // kasıtlı davranışa güncellendi. ZIP'in tek-entry/üst-şema/medyasızlık
  // sözleşmesi DEĞİŞMEDİ, yalnız bu tek satır güncellendi.
  test('J. Replay ZIP -- reviewStatus set edilmiş DÖF için dof_donus.json artık reviewStatus taşır (4O), şema aksi halde değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await page.locator('.dof-liste-karti').first().click();

    // Gerçek UI etkileşimiyle reviewStatus set edilir.
    await page.locator('#dof-review-durum-secici').selectOption('kapatma_onerisi');
    await expect.poll(async () => (await dofKaydiGetir(page, dofUuid)).reviewStatus).toBe('kapatma_onerisi');

    // Hazırlık boş taslakla çalışmıyor (BOS_TAKIP_TASLAGI) -- q-dof-replay-zip.spec.js
    // ile aynı ön koşul: en az bir takip alanına dokunulmuş olmalı.
    await page.evaluate((u) => window._dofImport.dofTakipTaslagiGuncelle(u, { sorumlu: 'Ahmet Yilmaz' }), dofUuid);

    // Hazırlık + ZIP -- mevcut, DEĞİŞMEMİŞ servisler (q-dof-replay-zip.spec.js
    // ile aynı desen).
    const hazirlikSonucu = await page.evaluate(async (u) => {
      try {
        const s = await window._dofImport.dofReplayHazirlikHazirla(u);
        return { basarili: true, s };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    }, dofUuid);
    expect(hazirlikSonucu.basarili).toBe(true);

    const zipSonucu = await page.evaluate(async (liste) => {
      const sonuc = await window._dofImport.dofReplayZipOlustur(liste);
      const buf = new Uint8Array(await sonuc.zipBlob.arrayBuffer());
      let ikili = '';
      const PARCA = 0x8000;
      for (let i = 0; i < buf.length; i += PARCA) {
        ikili += String.fromCharCode.apply(null, buf.subarray(i, i + PARCA));
      }
      return { zipB64: btoa(ikili) };
    }, [dofUuid]);

    const zip = new AdmZip(Buffer.from(zipSonucu.zipB64, 'base64'));
    expect(zip.getEntries().map((e) => e.entryName)).toEqual(['dof_donus.json']);   // şema DEĞİŞMEDİ -- tek entry

    const belge = JSON.parse(zip.readAsText('dof_donus.json', 'utf8'));
    expect(Object.keys(belge)).toEqual(['paketUuid', 'dofKontrolleri']);   // üst şema DEĞİŞMEDİ
    // 4O: reviewStatus artık KASITLI olarak belgeye giriyor (incelenmiş DÖF).
    expect(belge.dofKontrolleri[0].reviewStatus).toBe('kapatma_onerisi');
    // Ama hiçbir kapanış alanı ÜRETİLMEDİ -- Human-in-Control korunuyor.
    for (const yasakAlan of ['durum', 'kapanma_tarihi', 'kapanma_notu', 'kapanma_foto', 'kapanis_turu', 'kapanis_gerekcesi', 'kapatan_kullanici']) {
      expect(belge.dofKontrolleri[0]).not.toHaveProperty(yasakAlan);
    }
    // Medya hâlâ yok -- ZIP tek entry, `fotolar`/`sesNotlari` gibi alan yok.
    for (const medyaAlani of ['fotolar', 'sesNotlari', 'medya']) {
      expect(belge.dofKontrolleri[0]).not.toHaveProperty(medyaAlani);
    }
  });
});
