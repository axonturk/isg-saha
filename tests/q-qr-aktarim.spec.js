// PWA Kurum/Birim QR Aktarımı (2026-08-02, Faz 2 Commit 5) testleri.
// Gerçek kamera görüntüsünden gerçek bir QR deseni okumak Playwright'ta
// pratik değil (jsQR görüntü-işleme algoritması, sentetik canvas deseni
// üretmek kırılgan olurdu) -- bunun yerine ÇEKİRDEK mantık (parça
// birleştirme + ham-deflate açma + IndexedDB upsert) doğrudan, jsQR/kamera
// katmanını atlayarak test edilir (window._qrKareyiIsle/_qrPayloadCoz/
// kurumAgaciUpsertEt -- app.js'in KENDİ fonksiyonları, mock değil). Kamera
// açılış/izin akışı ayrı, sığ bir testle (media-mocks.js) doğrulanır.
const { test, expect } = require('@playwright/test');
const { benzersizAd, storeTumu } = require('./helpers');
const { sahteKameraKur } = require('./media-mocks');

/** Desktop'un kurum_qr_aktarim.py'siyle BİREBİR AYNI wire-format'ı
 * tarayıcı içinde üretir: JSON -> UTF-8 -> ham deflate -> base64 ->
 * "SIRA|TOPLAM|<parça>" dizisi. */
async function sahteQrKareleriUret(page, payload, parcaBoyutu = 500) {
  return page.evaluate(async ({ payload, parcaBoyutu }) => {
    const json = JSON.stringify(payload);
    const veri = new TextEncoder().encode(json);
    const cs = new CompressionStream('deflate-raw');
    const yazici = cs.writable.getWriter();
    yazici.write(veri);
    yazici.close();
    const sikistirilmisBuffer = await new Response(cs.readable).arrayBuffer();
    const bayt = new Uint8Array(sikistirilmisBuffer);
    let ikili = '';
    for (const b of bayt) ikili += String.fromCharCode(b);
    const b64 = btoa(ikili);
    const parcalarHam = [];
    for (let i = 0; i < b64.length; i += parcaBoyutu) parcalarHam.push(b64.slice(i, i + parcaBoyutu));
    const toplam = parcalarHam.length || 1;
    if (parcalarHam.length === 0) parcalarHam.push('');
    return parcalarHam.map((p, i) => `${i + 1}|${toplam}|${p}`);
  }, { payload, parcaBoyutu });
}

test.describe('Q. Kurum/Birim QR Aktarımı', () => {
  test('tek parcali payload dogru birlesir ve cozulur', async ({ page }) => {
    await page.goto('/index.html');
    const payload = {
      surum: 1,
      kurum: { id: 'pwa-test-kurum-1', ad: 'MKÜ', tur: 'universite', sgkNo: 'K-1', adres: 'Antakya' },
      birimler: [{ id: 'pwa-test-birim-1', ad: 'Rektörlük', sgkNo: null, adres: null, children: [] }]
    };
    const kareler = await sahteQrKareleriUret(page, payload);
    expect(kareler.length).toBe(1);

    const sonuc = await page.evaluate(async (kareler) => {
      for (const k of kareler) window._qrKareyiIsle(k);
      return await window._qrPayloadCoz();
    }, kareler);

    expect(sonuc.kurum.ad).toBe('MKÜ');
    expect(sonuc.kurum.tur).toBe('universite');
    expect(sonuc.birimler[0].ad).toBe('Rektörlük');
  });

  test('coklu parcali payload sirasiz gelse de dogru birlesir', async ({ page }) => {
    await page.goto('/index.html');
    const birimler = Array.from({ length: 15 }, (_, i) => ({
      id: `pwa-test-birim-${i}`, ad: `Birim ${i} -- uzunca bir isim doldurmak için`,
      sgkNo: null, adres: null, children: []
    }));
    const payload = { surum: 1, kurum: { id: 'pwa-test-kurum-2', ad: 'Büyük Kurum', tur: null, sgkNo: null, adres: null }, birimler };
    const kareler = await sahteQrKareleriUret(page, payload, 40);
    expect(kareler.length).toBeGreaterThan(1);
    const karisik = [...kareler].reverse();

    const sonuc = await page.evaluate(async (kareler) => {
      for (const k of kareler) window._qrKareyiIsle(k);
      return await window._qrPayloadCoz();
    }, karisik);

    expect(sonuc.birimler.length).toBe(15);
  });

  test('eksik parca varken _qrPayloadCoz hata firlatir', async ({ page }) => {
    await page.goto('/index.html');
    const payload = { surum: 1, kurum: { id: 'k', ad: 'K', tur: null }, birimler: Array.from({ length: 10 }, (_, i) => ({ id: `b${i}`, ad: `Birim ${i}`, children: [] })) };
    const kareler = await sahteQrKareleriUret(page, payload, 30);
    expect(kareler.length).toBeGreaterThan(2);

    const hataMesaji = await page.evaluate(async (kareler) => {
      for (const k of kareler.slice(0, -1)) window._qrKareyiIsle(k);
      try {
        await window._qrPayloadCoz();
        return null;
      } catch (e) {
        return e.message;
      }
    }, kareler);

    expect(hataMesaji).toContain('Eksik parça');
  });

  test('gecersiz/yabanci bir metin sessizce yoksayilir', async ({ page }) => {
    await page.goto('/index.html');
    const sonuc = await page.evaluate(() => window._qrKareyiIsle('bu-bir-QR-formati-degil'));
    expect(sonuc).toBeNull();
  });

  test('kurumAgaciUpsertEt yeni kurum/birim agacini olusturur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumId = benzersizAd('qr-kurum');
    const rektorlukId = benzersizAd('qr-rektorluk');
    const sgdbId = benzersizAd('qr-sgdb');
    const payload = {
      kurum: { id: kurumId, ad: 'QR Kurumu', tur: 'universite' },
      birimler: [{
        id: rektorlukId, ad: 'Rektörlük', sgkNo: null, adres: null,
        children: [{ id: sgdbId, ad: 'SGDB', sgkNo: 'SGDB-1', adres: 'X Adres', children: [] }]
      }]
    };
    await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);

    const kurumlar = await storeTumu(page, 'kurumlar');
    const kurum = kurumlar.find((k) => k.id === kurumId);
    expect(kurum).toMatchObject({ ad: 'QR Kurumu', tur: 'universite' });

    const birimler = await storeTumu(page, 'birimler');
    const rektorluk = birimler.find((b) => b.id === rektorlukId);
    const sgdb = birimler.find((b) => b.id === sgdbId);
    expect(rektorluk.parentBirimId).toBeNull();
    expect(sgdb.parentBirimId).toBe(rektorlukId);
    expect(sgdb.sgkNo).toBe('SGDB-1');
  });

  test('kurumAgaciUpsertEt mevcut birimin gercek saha verisini (tip/odalar) korur', async ({ page }) => {
    await page.goto('/index.html');
    const kurumId = benzersizAd('qr-kurum2');
    const birimId = benzersizAd('qr-birim2');

    // Önce yerelde GERÇEK saha verisiyle bir birim var (tip=hastane, gerçek oda).
    await page.evaluate(async ({ kurumId, birimId }) => {
      await window._idb.dbEkle('kurumlar', { id: kurumId, ad: 'Eski Ad', tur: null, olusturma: new Date().toISOString() });
      await window._idb.dbEkle('birimler', {
        id: birimId, kurumId, ad: 'Eski Birim Ad', tip: 'hastane', katlar: ['Zemin', '1.Kat'],
        odalar: [{ id: 'oda-1', kat: 'Zemin', alanTipi: 'Poliklinik / muayene', no: '101', ad: 'Poliklinik / muayene 101' }],
        ozelAlanlar: ['Özel Alan X'], parentBirimId: null, olusturma: new Date().toISOString()
      });
    }, { kurumId, birimId });

    // QR ile gelen güncelleme SADECE ad/sgkNo/adres taşıyor -- Desktop'ta tip/oda kavramı yok.
    const payload = {
      kurum: { id: kurumId, ad: 'Yeni Ad (Desktop)', tur: 'hastane' },
      birimler: [{ id: birimId, ad: 'Yeni Birim Ad (Desktop)', sgkNo: 'YENI-SGK', adres: null, children: [] }]
    };
    await page.evaluate((p) => window.kurumAgaciUpsertEt(p), payload);

    const kurumlar = await storeTumu(page, 'kurumlar');
    expect(kurumlar.find((k) => k.id === kurumId).ad).toBe('Yeni Ad (Desktop)');

    const birimler = await storeTumu(page, 'birimler');
    const birim = birimler.find((b) => b.id === birimId);
    expect(birim.ad).toBe('Yeni Birim Ad (Desktop)');
    expect(birim.sgkNo).toBe('YENI-SGK');
    // Gerçek saha verisi KORUNDU -- şablon/import bunları ezmedi.
    expect(birim.tip).toBe('hastane');
    expect(birim.katlar).toEqual(['Zemin', '1.Kat']);
    expect(birim.odalar).toEqual([{ id: 'oda-1', kat: 'Zemin', alanTipi: 'Poliklinik / muayene', no: '101', ad: 'Poliklinik / muayene 101' }]);
    expect(birim.ozelAlanlar).toEqual(['Özel Alan X']);
  });

  test('QR butonu tiklaninca kamera acilir (getUserMedia cagrilir)', async ({ page }) => {
    await sahteKameraKur(page);
    await page.goto('/index.html');

    await page.click('button[onclick="qrTaramayiAc()"]');
    await expect(page.locator('#modal-qr-tarama')).toHaveClass(/modal/);
    await expect(page.locator('#modal-qr-tarama')).toHaveCSS('display', 'flex');
    await expect(page.locator('#qr-video')).toBeVisible();

    await page.click('#modal-qr-tarama button:has-text("İptal")');
    await expect(page.locator('#modal-qr-tarama')).toHaveCSS('display', 'none');
  });
});
