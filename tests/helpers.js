// PWA Commit 2 -- yalnız test yardımcıları. Production kodunu (app.js/
// index.html/sw.js) HİÇ değiştirmez, yalnız gerçek UI/DOM/IndexedDB
// üzerinden etkileşim kurar.

/** Her çağrıda benzersiz, insan-okunabilir bir ad üretir (kurum/birim/oda
 * çakışmasını önlemek için) -- worker index + zaman damgası + rastgele. */
function benzersizAd(onEk) {
  const rastgele = Math.random().toString(36).slice(2, 8);
  return `${onEk}_${Date.now()}_${rastgele}`;
}

/** Native `prompt()` diyaloğunu TEK SEFERLİK karşılar (yeniKurumEkle/_katEkle
 * gibi native prompt kullanan akışlar için) -- dialog tetiklenmeden ÖNCE
 * kaydedilmelidir. */
function promptKarsila(page, deger) {
  page.once('dialog', (dialog) => dialog.accept(deger));
}

/** IndexedDB'deki bir object store'un TÜM kayıtlarını, sayfa içi gerçek
 * `window._idb` köprüsüyle (app.js'in KENDİ dbTumu fonksiyonu, test için
 * mock/polyfill DEĞİL) okur. */
async function storeTumu(page, store) {
  return page.evaluate(async (s) => {
    return await window._idb.dbTumu(s);
  }, store);
}

/** IndexedDB veritabanının object store adlarını gerçek `indexedDB.open` ile
 * (app.js'in DB_NAME/DB_VERSION sabitleri üzerinden) okur. */
async function storeAdlari(page) {
  return page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('isgSahaDB');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const adlar = Array.from(db.objectStoreNames);
        const versiyon = db.version;
        db.close();
        resolve({ adlar, versiyon });
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/** Kurulum ekranındaki "Kurum" seçicisine yeni bir kurum ekler (gerçek UI:
 * native prompt() akışı) ve eklenen kurumun adını döner. */
async function gercekKurumEkle(page, ad) {
  promptKarsila(page, ad);
  await page.click('button[onclick="yeniKurumEkle()"]');
  await page.locator('#setup-kurum').locator(`option[value]`, { hasText: ad }).waitFor({ state: 'attached' });
  return ad;
}

/** Seçili kuruma yeni bir birim ekler (gerçek UI: form modalı). `profil`
 * PROFILLER anahtarlarından biri olmalı (ör. 'genel' → "Genel / Diğer"). */
async function gercekBirimEkle(page, { ad, profil = 'genel', katSayisi = null }) {
  await page.click('button[onclick="yeniBirimEkle()"]');
  await page.locator('#form-birim-profil').selectOption(profil);
  await page.locator('#form-birim-ad').fill(ad);
  if (katSayisi !== null) {
    await page.locator('#form-birim-kat').fill(String(katSayisi));
  }
  await page.click('#form-action-btn');
  await page.locator('#setup-birim').locator(`option[value]`, { hasText: ad }).waitFor({ state: 'attached' });
}

module.exports = { benzersizAd, promptKarsila, storeTumu, storeAdlari, gercekKurumEkle, gercekBirimEkle };
