// PWA Commit 4H -- DÖF takip alanları düzenleme UI ("Takip Bilgileri"
// kartı). Yalnız izinli sekiz alan düzenlenir. Gerçek servisler
// (`dofTakipTaslagiGetir/Guncelle/Temizle`, Commit 4A/4A-1/4A-2)
// DEĞİŞTİRİLMEDİ -- bu dosya yalnız UI/DOM etkileşimini test eder.
const { test, expect } = require('@playwright/test');
const { storeTumu } = require('./helpers');
const { gecerliDofKaydi, gecerliDofPaketi, sentetikUuidV4 } = require('./dof-import-fixtures');

/** 4R-PKG-3F: import sonrası ana ekranda kalınır -- bu yardımcı (başarılı)
 * importtan hemen sonra o paketi otomatik açar (bkz. t-dof-list-detail-ui
 * için aynı desen). Reddedilen/çakışan importlarda paket kartı hiç
 * oluşmaz, sessizce atlanır. */
async function dosyaSec(page, jsonMetni, dosyaAdi = 'dof_paketi.json') {
  await page.setInputFiles('#dof-import-input', {
    name: dosyaAdi,
    mimeType: 'application/json',
    buffer: Buffer.from(jsonMetni, 'utf-8'),
  });
  let paketUuid;
  try { paketUuid = JSON.parse(jsonMetni).paketUuid; } catch (e) { paketUuid = null; }
  if (paketUuid) {
    try {
      // Yalnız GERÇEKTEN yeni/başarılı bir import'ta otomatik aç -- aksi
      // halde duplicate/çakışma reddi (ki zaten hiçbir şeyi DEĞİŞTİRMEZ)
      // mevcut work/paket ekranından yanlışlıkla UZAKLAŞTIRIRDI.
      await page.waitForFunction(() => (document.getElementById('dof-import-durum') || {}).textContent, { timeout: 3000 });
      const durumMetni = (await page.locator('#dof-import-durum').innerText()).trim();
      if (durumMetni === 'İçe aktarma tamamlandı') {
        await page.locator(`[data-paket-uuid="${paketUuid}"]`).first().waitFor({ state: 'attached', timeout: 3000 });
        await page.evaluate((u) => { location.hash = `#dof-package/${u}`; }, paketUuid);
      }
    } catch (e) { /* import reddedildi/çakıştı -- paket kartı hiç oluşmadı, atla */ }
  }
}

async function dofSecVeFormBekle(page, index = 0) {
  await page.locator('.dof-liste-karti').nth(index).click();
  await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
}

async function dofKaydiGetir(page, dofUuid) {
  return page.evaluate(async (u) => window._idb.dbGetir('dofler', u), dofUuid);
}

test.describe('U. DÖF takip alanları düzenleme UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
  });

  test('A. DÖF seçilmeden form pasif -- görünmüyor, Kaydet/Temizle aktif değil', async ({ page }) => {
    await expect(page.locator('#dof-takip-form-kart')).toBeHidden();
  });

  test('B. DÖF seçilince form yüklenir -- 8 alan görünür, imported kimlikler editable değil', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);

    for (const id of [
      'dof-takip-planlanan-tarih', 'dof-takip-sorumlu', 'dof-takip-gerceklesen-faaliyet',
      'dof-takip-etkinlik-kontrol-tarihi', 'dof-takip-gozlem-degerlendirme',
      'dof-takip-yeni-o', 'dof-takip-yeni-f', 'dof-takip-yeni-s',
    ]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    // Imported kimlik/risk alanları (DÖF Detayı kartında) form elemanı DEĞİL -- düz metin.
    await expect(page.locator('#dof-detay input')).toHaveCount(0);
    await expect(page.locator('#dof-detay select')).toHaveCount(0);
  });

  test('C. Tek metin alanı partial kaydet -- yalnız sorumlu own-property, diğer 7 yok', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi).toEqual({ sorumlu: 'Ahmet Yilmaz' });
  });

  test('D. Explicit null temizleme -- boşaltılan alan own-property + null olarak kaydedilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-sorumlu').fill('Ahmet');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    await page.locator('#dof-takip-sorumlu').fill('');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, 'sorumlu')).toBe(true);
    expect(kayit.takipTaslagi.sorumlu).toBe(null);
  });

  test('E. Tarih alanı -- YYYY-MM-DD kaydedilir, sonra explicit null temizlenir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-planlanan-tarih').fill('2026-07-15');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    let kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi.planlanan_tarih).toBe('2026-07-15');

    await page.locator('#dof-takip-planlanan-tarih').fill('');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    kayit = await dofKaydiGetir(page, dofUuid);
    expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, 'planlanan_tarih')).toBe(true);
    expect(kayit.takipTaslagi.planlanan_tarih).toBe(null);
  });

  test('F. O/F/S geçerli üçlü -- numeric değer olarak kaydedilir (string değil)', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-yeni-o').selectOption('0.2');
    await page.locator('#dof-takip-yeni-f').selectOption('3');
    await page.locator('#dof-takip-yeni-s').selectOption('1');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayit = await dofKaydiGetir(page, dofUuid);
    expect(kayit.takipTaslagi).toEqual({ yeni_o: 0.2, yeni_f: 3, yeni_s: 1 });
    expect(typeof kayit.takipTaslagi.yeni_o).toBe('number');
    expect(typeof kayit.takipTaslagi.yeni_f).toBe('number');
    expect(typeof kayit.takipTaslagi.yeni_s).toBe('number');
  });

  test('G. O/F/S kısmi hata -- yalnız O seçilirse hata gösterilir, DB değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    await page.locator('#dof-takip-yeni-o').selectOption('0.2');
    await page.locator('#dof-takip-kaydet-btn').click();
    // 4R-PKG-3I: reddin SEBEBİ artık açıkça yazılıyor. Önceden yalnız genel
    // "Takip alanlarında geçersiz değer var." deniyordu ve saha kullanıcısı
    // bunu "Kaydet güvenilmez" olarak deneyimliyordu (gerçek Android geri
    // bildirimi). Servis kuralı ve reddin KENDİSİ DEĞİŞMEDİ -- yalnız mesaj.
    // SUPV-28: mesaj artık BU DÖF'ün yöntemine göre dinamik etiketlerden
    // kurulur (bu DÖF varsayılan fine_kinney -- Olasılık/Frekans/Şiddet).
    await expect(page.locator('#dof-takip-durum')).toHaveText(
      'Olasılık (O), Frekans (F), Şiddet (Ş) birlikte doldurulmalı (ya hepsi dolu ya hepsi boş).'
    );

    const sonrakiKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonrakiKayit).toEqual(oncekiKayit);   // DB DEĞİŞMEDİ
  });

  test('H. O/F/S üçlü temizleme -- üçü de own-property + null olarak kaydedilir', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-yeni-o').selectOption('0.2');
    await page.locator('#dof-takip-yeni-f').selectOption('3');
    await page.locator('#dof-takip-yeni-s').selectOption('1');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    await page.locator('#dof-takip-yeni-o').selectOption('');
    await page.locator('#dof-takip-yeni-f').selectOption('');
    await page.locator('#dof-takip-yeni-s').selectOption('');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const kayit = await dofKaydiGetir(page, dofUuid);
    for (const alan of ['yeni_o', 'yeni_f', 'yeni_s']) {
      expect(Object.prototype.hasOwnProperty.call(kayit.takipTaslagi, alan), alan).toBe(true);
      expect(kayit.takipTaslagi[alan], alan).toBe(null);
    }
  });

  test('I. Dirty state korunur -- dokunulmadan Kaydet no-op, DB değişmez', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await expect(page.locator('#dof-takip-kaydet-btn')).toBeDisabled();
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);

    // Buton disabled olsa da servis çağrısının kendisi de no-op'u garanti eder --
    // JS köprüsüyle doğrudan çağırarak bu ikinci katmanı da doğrula.
    const sonuc = await page.evaluate(async () => {
      const durumOnce = document.getElementById('dof-takip-durum').textContent;
      await window._dofTakipKaydet();
      return { durumSonra: document.getElementById('dof-takip-durum').textContent };
    });
    expect(sonuc.durumSonra).toBe('Değişiklik yok.');

    const sonrakiKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonrakiKayit).toEqual(oncekiKayit);
  });

  test('J. Temizle butonu -- takipTaslagi kaldırılır, imported kimlikler ve liste/detay kalır', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    const dofUuid = paket.tehlikeler[0].dofUuid;
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-sorumlu').fill('Ahmet');
    await page.locator('#dof-takip-gerceklesen-faaliyet').fill('Pano kapatildi');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');
    const oncekiKayit = await dofKaydiGetir(page, dofUuid);
    expect(oncekiKayit.takipTaslagi).toBeTruthy();

    await page.locator('#dof-takip-temizle-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri temizlendi');

    const sonrakiKayit = await dofKaydiGetir(page, dofUuid);
    expect(sonrakiKayit.takipTaslagi).toBeUndefined();
    for (const alan of ['id', 'dofUuid', 'exportUuid', 'paketUuid', 'baseStateHash', 'aktifTurSirasi', 'replayVersion', 'iceAktarilmaZamani']) {
      expect(sonrakiKayit[alan], alan).toEqual(oncekiKayit[alan]);
    }
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('#dof-detay-kart')).toBeVisible();
  });

  test('K. Duplicate/conflict sonrası form bozulmaz -- seçili DÖF ve form değişmeden kalır', async ({ page }) => {
    const dofUuid = sentetikUuidV4();
    const ilkPaket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid })] });
    await dosyaSec(page, JSON.stringify(ilkPaket));
    await dofSecVeFormBekle(page);
    await page.locator('#dof-takip-sorumlu').fill('Ahmet');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    // Duplicate import -- aynı paket tekrar.
    await dosyaSec(page, JSON.stringify(ilkPaket), 'tekrar.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Paket zaten içe aktarılmış');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await expect(page.locator('#dof-takip-sorumlu')).toHaveValue('Ahmet');

    // Conflict import.
    const celisenPaket = gecerliDofPaketi({
      tehlikelerOverride: [gecerliDofKaydi({ dofId: 1, dofUuid, exportUuid: sentetikUuidV4() })],
    });
    await dosyaSec(page, JSON.stringify(celisenPaket), 'celisen.json');
    await expect(page.locator('#dof-import-durum')).toHaveText('Çakışma var');
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await expect(page.locator('#dof-takip-sorumlu')).toHaveValue('Ahmet');   // form bozulmadı
  });

  test('L. Legacy görünmez/güncellenemez -- UI\'da yok, servis KANONIK_DOF_DEGIL korunur', async ({ page }) => {
    const wipKayit = {
      id: 'dof_wip_u1', dofId: 501, bulguKodu: 'B-WIP', durum: 'bekliyor', birimId: 'birim-wip',
    };
    await page.evaluate(async (k) => window._idb.dbEkle('dofler', k), wipKayit);
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    await expect(page.locator('.dof-liste-karti')).toHaveCount(0);
    await expect(page.locator('#dof-takip-form-kart')).toBeHidden();

    const servisSonucu = await page.evaluate(async () => {
      try {
        await window._dofImport.dofTakipTaslagiGuncelle('dof_wip_u1', { sorumlu: 'X' });
        return { basarili: true };
      } catch (e) {
        return { basarili: false, kod: e && e.kod };
      }
    });
    expect(servisSonucu.basarili).toBe(false);
    expect(servisSonucu.kod).toBe('KANONIK_DOF_DEGIL');

    const wipSonra = await dofKaydiGetir(page, 'dof_wip_u1');
    expect(wipSonra).toEqual(wipKayit);
  });

  test('M. Okunur özet güncellenir -- Kaydet sonrası detaydaki takip özeti yeni değerleri gösterir, editable değil', async ({ page }) => {
    const paket = gecerliDofPaketi({ tehlikelerOverride: [gecerliDofKaydi({ dofId: 1 })] });
    await dosyaSec(page, JSON.stringify(paket));
    await dofSecVeFormBekle(page);

    await page.locator('#dof-takip-sorumlu').fill('Ahmet Yilmaz');
    await page.locator('#dof-takip-kaydet-btn').click();
    await expect(page.locator('#dof-takip-durum')).toHaveText('Takip bilgileri kaydedildi');

    const detay = page.locator('#dof-detay');
    await expect(detay).toContainText('Sorumlu');
    await expect(detay).toContainText('Ahmet Yilmaz');
    await expect(detay.locator('input')).toHaveCount(0);
    await expect(detay.locator('textarea')).toHaveCount(0);
    await expect(detay.locator('select')).toHaveCount(0);
  });

  test('N. Normal saha akışı regresyonu -- kurulum formu ve DÖF UI\'ları birlikte çalışır', async ({ page }) => {
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeVisible();
    await expect(page.locator('h2', { hasText: 'DÖF Paketi Al' })).toBeVisible();
    // 4R-PKG-3F: "İçe Aktarılan DÖF'ler" listesi artık yalnız
    // #dof-package/<paketUuid> rotasında görünür -- ana ekranda onun
    // yerine (boş durumda) "Yüklü DÖF Paketleri" kartı görünür.
    await expect(page.locator('#dof-paket-listesi-kart')).toBeVisible();
    await expect(page.locator('#setup-kurum')).toBeEnabled();
  });
});
