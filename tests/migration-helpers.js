// PWA Commit 3A -- yalnız test yardımcıları. Gerçek (raw) `indexedDB` API'si
// kullanılır -- hiçbir mock/polyfill yok. Bu dosya, gerçek uygulamanın
// KENDİ `openDB()`/upgrade akışı devreye girmeden ÖNCE, eski (v2/v3) taban
// veritabanı durumlarını ELLE hazırlamak için kullanılır.
const DB_NAME = 'isgSahaDB';

/** Açık bağlantıları kapatır, veritabanını SİLER, tamamlanmasını bekler.
 * `blocked` olayı YOK SAYILMAZ -- gerçek bir sorunsa test AÇIKÇA başarısız
 * olur (sessizce devam ETMEZ). */
async function dbTemizle(page) {
  await page.evaluate(async (dbAdi) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(dbAdi);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('deleteDatabase basarisiz'));
      req.onblocked = () => {
        reject(new Error('deleteDatabase BLOKLANDI -- kapatilmamis bir baglanti var (test setup hatasi).'));
      };
    });
  }, DB_NAME);
}

/** Verilen sürümde, verilen store/index/kayıt kurulumuyla RAW bir veritabanı
 * oluşturur; işlem bitince bağlantıyı KAPATIR (gerçek uygulamanın v4 open()
 * çağrısının bloklanmaması için zorunlu). `kurulumFn` tarayıcı bağlamında
 * çalışır, `(db) => {...}` imzasıyla store/index/kayıt oluşturur. */
async function rawDbOlustur(page, versiyon, kurulumFnMetni) {
  await page.evaluate(async ({ dbAdi, versiyon, kurulumFnMetni }) => {
    const kurulumFn = new Function('db', kurulumFnMetni);
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbAdi, versiyon);
      req.onupgradeneeded = (e) => {
        kurulumFn(e.target.result);
      };
      req.onsuccess = (e) => { e.target.result.close(); resolve(); };
      req.onerror = () => reject(req.error || new Error('raw DB kurulumu basarisiz'));
    });
  }, { dbAdi: DB_NAME, versiyon, kurulumFnMetni });
}

/** Committed baseline (852764c) v2 şemasının BİREBİR aynısı -- app.js:225-242
 * (temiz worktree) satırlarından çıkarıldı. */
const V2_KURULUM_JS = `
  if (!db.objectStoreNames.contains('kurumlar')) {
    db.createObjectStore('kurumlar', { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains('birimler')) {
    const s = db.createObjectStore('birimler', { keyPath: 'id' });
    s.createIndex('kurumId', 'kurumId');
  }
  if (!db.objectStoreNames.contains('denetimler')) {
    const s = db.createObjectStore('denetimler', { keyPath: 'id' });
    s.createIndex('birimId', 'birimId');
  }
  if (!db.objectStoreNames.contains('bulgular')) {
    const s = db.createObjectStore('bulgular', { keyPath: 'id' });
    s.createIndex('denetimId', 'denetimId');
  }
  if (!db.objectStoreNames.contains('ayarlar')) {
    db.createObjectStore('ayarlar', { keyPath: 'id' });
  }
`;

/** Dirty WIP'in GERÇEK v3 şeması -- orijinal (committed OLMAYAN) çalışma
 * ağacındaki app.js satır 239-243'ten salt-okunur incelenerek çıkarıldı:
 * yalnız `birimId` index'i var, `dofUuid` index'i YOK. */
const V3_WIP_KURULUM_JS = V2_KURULUM_JS + `
  if (!db.objectStoreNames.contains('dofler')) {
    const s = db.createObjectStore('dofler', { keyPath: 'id' });
    s.createIndex('birimId', 'birimId');
  }
`;

/** IndexedDB'de bir store'un tüm kayıtlarını okur (raw API, app.js'e
 * bağımlı DEĞİL -- migration testleri app.js yüklenmeden ÖNCE de
 * çalışabilmeli). */
async function rawStoreTumu(page, store) {
  return page.evaluate(async ({ dbAdi, store }) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbAdi);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(store, 'readonly');
        const getAllReq = tx.objectStore(store).getAll();
        getAllReq.onsuccess = () => { db.close(); resolve(getAllReq.result); };
        getAllReq.onerror = () => { db.close(); reject(getAllReq.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }, { dbAdi: DB_NAME, store });
}

/** IndexedDB veritabanının meta bilgisini (versiyon, store adları) ve
 * `dofler` store'unun keyPath/index/unique bilgisini raw API ile okur. */
async function rawDbBilgisi(page) {
  return page.evaluate(async (dbAdi) => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbAdi);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const storeAdlari = Array.from(db.objectStoreNames).sort();
        let doflerBilgisi = null;
        if (db.objectStoreNames.contains('dofler')) {
          const tx = db.transaction('dofler', 'readonly');
          const store = tx.objectStore('dofler');
          doflerBilgisi = {
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            indexNames: Array.from(store.indexNames).sort(),
            birimIdUnique: store.indexNames.contains('birimId') ? store.index('birimId').unique : null,
            dofUuidUnique: store.indexNames.contains('dofUuid') ? store.index('dofUuid').unique : null,
          };
        }
        const versiyon = db.version;
        db.close();
        resolve({ versiyon, storeAdlari, doflerBilgisi });
      };
      req.onerror = () => reject(req.error);
    });
  }, DB_NAME);
}

/** Belirtilen store'a TEK bir kaydı raw API ile ekler (bağlantıyı kendi açıp
 * kapatır). `icerirBlob: true` ise kayıtta `_blobAlani`'nda küçük, gerçek
 * bir JPEG Blob'u oluşturulup gömülür (medya korunumu testi için). */
async function rawKayitEkle(page, store, obj, { icerirBlob = false, blobAlani = null } = {}) {
  await page.evaluate(async ({ dbAdi, store, obj, icerirBlob, blobAlani }) => {
    const kayit = { ...obj };
    if (icerirBlob && blobAlani) {
      // 1x1 piksel gerçek bir JPEG (minimal ama geçerli).
      const b64 = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      kayit[blobAlani] = new Blob([bytes], { type: 'image/jpeg' });
    }
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbAdi);
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(kayit);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      req.onerror = () => reject(req.error);
    });
  }, { dbAdi: DB_NAME, store, obj, icerirBlob, blobAlani });
}

module.exports = {
  dbTemizle, rawDbOlustur, rawStoreTumu, rawDbBilgisi, rawKayitEkle,
  V2_KURULUM_JS, V3_WIP_KURULUM_JS,
};
