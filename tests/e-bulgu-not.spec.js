// PWA Commit 2 / Bölüm E -- yazılı bulgu kaydı karakterizasyonu.
// Gerçek alanlar app.js:1179'daki `const bulgu = {...}` satırından çıkarıldı:
// id, denetimId, metin, fotolar, sesler, hayatiRisk, zaman.
const { test, expect } = require('@playwright/test');
const { benzersizAd, gercekKurumEkle, gercekBirimEkle, storeTumu } = require('./helpers');

async function _denetimBaslat(page) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip').first().click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
  const denetimler = await storeTumu(page, 'denetimler');
  return denetimler[0];
}

test.describe('E. Yazılı bulgu kaydı', () => {
  test('yalniz yazili not iceren bulgu IndexedDBde dogru denetimId ile olusur, sayfa yenilemesinde tekrar gosterilir', async ({ page }) => {
    const denetim = await _denetimBaslat(page);
    const metin = 'Yangın tüpü son kullanma tarihi geçmiş.';

    await page.locator('#finding-manual').fill(metin);
    await page.click('button[onclick="saveFinding()"]');

    await expect(page.locator('#findings-list')).toContainText(metin);

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(1);
    const bulgu = bulgular[0];

    expect(bulgu.denetimId).toBe(denetim.id);
    expect(bulgu.metin).toBe(metin);
    expect(bulgu.fotolar).toEqual([]);
    expect(bulgu.sesler).toEqual([]);
    expect(bulgu.hayatiRisk).toBe(false);
    expect(typeof bulgu.zaman).toBe('string');
    expect(typeof bulgu.id).toBe('string');

    // Sayfa yenilemesi sonrası bulgu tekrar gösterilir mi -- gerçek davranış:
    // resumeSession çağrılmadığı için setup ekranına döner, geçmiş kayıttan
    // devam edilirse (resumeSession) bulgu tekrar yüklenir.
    await page.reload();
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.locator(`[data-swipe-id="${denetim.id}"]`).click();
    await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
    await expect(page.locator('#findings-list')).toContainText(metin);
  });

  test('hayati risk isaretlenmis bulgu dogru bayrakla saklanir', async ({ page }) => {
    await _denetimBaslat(page);
    await page.locator('#finding-manual').fill('Çıplak kablo görüldü.');
    await page.click('button[onclick="toggleHayatiRisk()"]');
    await page.click('button[onclick="saveFinding()"]');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].hayatiRisk).toBe(true);
  });
});

// SUPV-22 (2026-08-10) -- Checklist Kütüphanesi HAFİF chip UI. Desktop'un
// TAM formunun (Evet/Hayır/Gerekli Değil) AKSİNE burada dokununca metin
// nota EKLENİR, zorunlu tamamlama/Evet-Hayır durumu TUTULMAZ (plan §7
// "pasif hatırlatma" kararı). checklist-kutuphanesi.js'deki
// checklistKaynagiBul basit anahtar-kelime eşleşmesi yapar.
async function _denetimBaslatAlanTipiIle(page, alanTipiChipMetni) {
  const kurumAdi = benzersizAd('Kurum');
  const birimAdi = benzersizAd('Birim');
  await page.goto('/index.html');
  await gercekKurumEkle(page, kurumAdi);
  await gercekBirimEkle(page, { ad: birimAdi, profil: 'genel', katSayisi: 1 });
  await page.click('button[onclick="ekranKatAlanaGec()"]');
  await page.locator('#kat-alan-hizli-chips .chip', { hasText: alanTipiChipMetni }).click();
  await page.locator('#kat-alan-oda-no').fill('101');
  await page.click('button[onclick="startInspection()"]');
  await expect(page.locator('#screen-inspection')).toHaveClass(/active/);
}

test.describe('SUPV-22 -- Checklist kütüphanesi chip UI', () => {
  test('eslesen alan tipinde checklist basligi ve chip satiri gorunur', async ({ page }) => {
    // HIZLI_ALANLAR.genel[0] === 'Ofis / idari oda' -- "ofis" anahtar
    // kelimesi csgb_ofisler'e eşleşir.
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await expect(page.locator('#checklist-chip-baslik')).toBeVisible();
    const ilkMadde = await page.evaluate(
      () => window.CHECKLIST_KUTUPHANESI.csgb_ofisler.maddeler[0]);
    await expect(page.locator('#checklist-chip-grup .chip').first()).toHaveText(ilkMadde);
  });

  test('eslesmeyen alan tipinde checklist satiri gizli kalir', async ({ page }) => {
    // "Toplantı salonu" hiçbir kaynağın anahtarKelimeler listesiyle eşleşmez.
    await _denetimBaslatAlanTipiIle(page, 'Toplantı salonu');
    await expect(page.locator('#checklist-chip-baslik')).toBeHidden();
    await expect(page.locator('#checklist-chip-grup .chip')).toHaveCount(0);
  });

  test('chip tiklaninca metin NOTA EKLENIR, textarea OVERWRITE edilmez, otomatik kaydedilmez', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#finding-manual').fill('Elle yazılmış not.');

    await page.locator('#checklist-chip-grup .chip').first().click();

    const ilkMadde = await page.evaluate(
      () => window.CHECKLIST_KUTUPHANESI.csgb_ofisler.maddeler[0]);
    await expect(page.locator('#finding-manual')).toHaveValue(`Elle yazılmış not.\n${ilkMadde}`);
    // Zorunlu tamamlama YOK -- chip'e dokunmak KAYDETMEZ.
    const bulgularOnce = await storeTumu(page, 'bulgular');
    expect(bulgularOnce.length).toBe(0);
  });

  test('birden fazla chip tiklaninca hepsi alt alta eklenir ve kayitta checklist alanina yazilir', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const chipler = page.locator('#checklist-chip-grup .chip');
    await chipler.nth(0).click();
    await chipler.nth(1).click();

    const maddeler = await page.evaluate(
      () => window.CHECKLIST_KUTUPHANESI.csgb_ofisler.maddeler.slice(0, 2));
    await expect(page.locator('#finding-manual')).toHaveValue(maddeler.join('\n'));

    await page.click('button[onclick="saveFinding()"]');
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].checklist).toEqual(maddeler);
  });

  // SUPV-25 (2026-08-11) -- gerçek kullanımda kullanıcı chip'e dokununca
  // "hiçbir şey olmuyor, ayrı bir liste gibi görünüyor" bildirdi. Kod/veri
  // katmanı baştan beri doğruydu (üstteki testler) -- eksik olan GÖRSEL
  // GERİ BİLDİRİMDİ: 3 satırlık textarea 2. maddeden itibaren taşıyordu
  // ama otomatik kaymıyordu, chip'in kendisi hiç görsel durum
  // değiştirmiyordu. Bu 3 test o düzeltmeyi kalıcı regresyona bağlar.
  test('chip tiklaninca "active" sinifi kalici olarak eklenir (gorsel geri bildirim)', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const ilkChip = page.locator('#checklist-chip-grup .chip').first();
    await expect(ilkChip).not.toHaveClass(/active/);
    await ilkChip.click();
    await expect(ilkChip).toHaveClass(/active/);
  });

  test('chip tiklaninca textarea yeni eklenen satirin gorunur olacagi sekilde asagi kayar', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const chipler = page.locator('#checklist-chip-grup .chip');
    // 3 satirlik textarea'yi tasiracak kadar (2+ madde) tikla.
    await chipler.nth(0).click();
    await chipler.nth(1).click();

    const kaydiginiDogrula = await page.locator('#finding-manual').evaluate((ta) => {
      return ta.scrollTop + ta.clientHeight >= ta.scrollHeight - 2;
    });
    expect(kaydiginiDogrula).toBe(true);
  });

  test('ayni chip ikinci kez tiklaninca metin TEKRAR EKLENMEZ (yineleme onlenir)', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    const ilkChip = page.locator('#checklist-chip-grup .chip').first();
    await ilkChip.click();
    const degerBirTiklamaSonra = await page.locator('#finding-manual').inputValue();

    await ilkChip.click();  // ayni chip'e IKINCI tiklama
    const degerIkiTiklamaSonra = await page.locator('#finding-manual').inputValue();

    expect(degerIkiTiklamaSonra).toBe(degerBirTiklamaSonra);
    expect(degerIkiTiklamaSonra.split('\n').length).toBe(1);

    await page.click('button[onclick="saveFinding()"]');
    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].checklist.length).toBe(1);
  });

  test('checklist chip HIC tiklanmazsa kayitta checklist alani null kalir (eski davranisla ayni)', async ({ page }) => {
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#finding-manual').fill('Sadece elle yazıldı.');
    await page.click('button[onclick="saveFinding()"]');

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular[0].checklist).toBeNull();
  });

  test('yeni bulgu kaydedilince checklist taslak sifirlanir, bir sonraki bulguya tasinmaz', async ({ page }) => {
    // KÖK NEDEN NOTU (bu test önceden ara sıra başarısız oluyordu, teşhis
    // edildi -- bkz. debug oturumu): uygulama mantığı HER ZAMAN doğruydu
    // (checklistTaslak doğrudan __DEBUG hook'uyla 8/8 tekrarda [] olarak
    // doğrulandı). Gerçek hata BU TESTTEYDİ: `bulgular[1]` -- IndexedDB
    // `getAll()` insertion sırasına GÖRE DEĞİL, birincil anahtara (id =
    // uuid(), rastgele) göre sıralar; iki bulgunun rastgele UUID'lerinin
    // sözlük sırası hangi kaydın index 0/1'e düştüğünü belirliyordu --
    // bir yazı-turadan farksızdı. Düzeltme: kaydı METNİYLE bul, dizideki
    // KONUMUNA asla güvenme.
    await _denetimBaslatAlanTipiIle(page, 'Ofis / idari oda');
    await page.locator('#checklist-chip-grup .chip').first().click();
    await page.click('button[onclick="saveFinding()"]');
    await expect(page.locator('.finding-item')).toHaveCount(1);

    // İkinci bulgu -- hiç chip tıklanmadı, taslak önceki bulgudan miras
    // ALINMAMALI.
    await page.locator('#finding-manual').fill('İkinci bulgu, chip yok.');
    await page.click('button[onclick="saveFinding()"]');
    await expect(page.locator('.finding-item')).toHaveCount(2);

    const bulgular = await storeTumu(page, 'bulgular');
    expect(bulgular.length).toBe(2);
    const ikinciBulgu = bulgular.find((b) => b.metin === 'İkinci bulgu, chip yok.');
    expect(ikinciBulgu).toBeTruthy();
    expect(ikinciBulgu.checklist).toBeNull();
  });
});
