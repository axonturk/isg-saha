// ============================================================
// İSG SAHA ASİSTANI - app.js
// Versiyon: v0.5.0
// Güncelleme: IndexedDB'ye tam geçiş (Kurum > Birim > Denetim > Bulgu),
//             foto artık bulguya kalıcı bağlanıyor, bulgu silme onayı,
//             hayati risk etiketi, birim/kurum bazlı ZIP dışa aktarma
//             (harici kütüphane yok — dahili store-only ZIP yazıcı).
// ============================================================

// Yakalanmamış bir hata (örn. silinen bir fonksiyona kalan referans) script'in
// TAMAMINI sessizce durdurabilir — butonlar tıklanır ama hiçbir şey olmaz,
// hiçbir konsol hatası kullanıcıya görünmez. Bu banner en azından "bir şeyler
// ters gitti" bilgisini verir, "neden çalışmıyor" diye saatlerce debug
// edilmesini önler. (v0.11.0'daki form-action-btn/modal-action-btn'in hiç
// çalışmaması sorunu tam olarak buydu — window._turSec = _turSec satırı
// silinen bir fonksiyonu referans alıyordu.)
window.addEventListener('error', (e) => {
  console.error('[Yakalanmamış hata]', e.message, 'satır:', e.lineno);
  const mevcut = document.getElementById('hata-banner');
  if (mevcut) return;
  const banner = document.createElement('div');
  banner.id = 'hata-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#e74c3c;color:white;padding:10px;text-align:center;font-size:0.85rem;z-index:9999;';
  banner.textContent = '⚠ Bir hata oluştu, bazı butonlar çalışmayabilir. Sayfayı yenileyin.';
  document.body.prepend(banner);
});

const APP_VERSION = 'v0.11.2';
const DB_NAME = 'isgSahaDB';
const DB_VERSION = 4;   // v2: 'ayarlar' deposu; v3 atlandı (yereldeki
                        // committed-olmayan bir denemede kullanılmıştı,
                        // kanonik değildi); v4: 'dofler' deposu + birimId/
                        // dofUuid index'leri (PWA Commit 3A, replay-v2
                        // temeli -- bkz. AI/knowledge veya commit mesajı)

// ─── STATE ───────────────────────────────────────────────────
let currentSession    = null;   // aktif denetim kaydı (IndexedDB 'denetimler' satırı)
let sessionBulgular   = [];     // aktif denetimin bulgu listesi (cache)
let sessionTimer      = null;
let modalCallback     = null;
let formConfirmCallback = null;
let ocrStream         = null;
let kameraModu        = 'kanit';  // 'kanit' (bulgu fotoğrafı) | 'etiket' (oda etiketi okuma)
let aktifFotolarTaslak = [];    // capturePhoto()'dan gelen, kayda hazır sıkıştırılmış fotolar (sınırsız)
let aktifSeslerTaslak  = [];    // ses kayıtlarından gelen [{blob, sure}, ...] (sınırsız)
let hayatiRiskAktif   = false;
let sesRecorder       = null;
let sesChunks         = [];
let secilenKat        = null;   // Ekran B'de seçili kat
let secilenAlanTipi   = null;   // Ekran B'de seçili alan tipi (chip veya dropdown)
let secilenMevcutOdaId = null;  // "Bu kattaki mevcut odalar"dan seçilirse dolu — yeni oda oluşturulmaz
let secilenTur        = 'saha'; // 'saha' (Saha Denetimi) | 'risk' (Risk Analizi) — masaüstü bu etikete göre yönlendirir

// ─── UUID ────────────────────────────────────────────────────
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function _esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function _escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── ALAN TİPLERİ (v0.2'den taşındı) — bina profiline göre hazır listeler ──
const ORTAK_ALANLAR = [
  'Ofis / idari oda', 'Toplantı salonu', 'Koridor / merdiven / kaçış yolu',
  'Islak hacim (WC/lavabo)', 'Çay ocağı / ofis mutfağı', 'Arşiv / depo',
  'Cami / mescit', 'Kazan dairesi', 'Elektrik pano odası', 'Jeneratör / UPS',
  'Asansör makine dairesi', 'Çatı / bodrum', 'Otopark / açık alan',
  'Güvenlik / danışma', 'Diğer'
];
const EGITIM_ALANLAR = [
  'Derslik / amfi', 'Kimya laboratuvarı', 'Biyoloji/mikrobiyoloji lab.',
  'Fizik/elektrik lab.', 'Bilgisayar lab.', 'Atölye (makine/kaynak/vb.)',
  'Kütüphane / okuma salonu', 'Konferans salonu', 'Kantin / yemekhane',
  'Spor salonu / soyunma'
];
const MYO_EK_ALANLAR = ['Yemekhane / mutfak'];
const HASTANE_ALANLAR = [
  'Poliklinik / muayene', 'Servis / hasta odası', 'Ameliyathane', 'Yoğun bakım',
  'Acil servis', 'Görüntüleme (radyasyon)', 'Tıbbi laboratuvar',
  'Eczane / ilaç deposu', 'Sterilizasyon ünitesi', 'Tıbbi atık deposu',
  'Endüstriyel mutfak', 'Çamaşırhane', 'Morg'
];
const KUTUPHANE_ALANLAR = [
  'Raf alanı / kitap deposu', 'Okuma salonu', 'Nadir eser / arşiv deposu',
  'Kompakt (raylı) arşiv rafları', 'Fotokopi / sayısallaştırma', 'Ödünç verme bankosu'
];
const HAVUZ_ALANLAR = [
  'Havuz çevresi / ıslak zemin', 'Klor / kimyasal deposu', 'Makine dairesi (pompa/filtre)',
  'Denge deposu / teknik galeri', 'Cankurtaran istasyonu / ilk yardım',
  'Soyunma / duşlar', 'Seyirci alanı'
];
const SPOR_ALANLAR = [
  'Kapalı spor salonu', 'Futbol sahası / açık saha', 'Fitness / kondisyon salonu',
  'Minder sporları alanı', 'Tribün / seyirci alanı', 'Soyunma / duşlar', 'Malzeme deposu'
];
const KRES_ALANLAR = [
  'Oyun odası / etkinlik alanı', 'Uyku odası', 'Çocuk mutfağı / mama hazırlama',
  'Çocuk WC / alt değiştirme', 'Bahçe / oyun parkı', 'Giriş güvenliği'
];
const YEMEKHANE_ALANLAR = [
  'Pişirme alanı (fritöz/kazan/davlumbaz)', 'Soğuk oda / depo', 'Kuru gıda deposu',
  'Bulaşıkhane', 'Servis / yemek salonu', 'LPG/doğalgaz hattı', 'Personel soyunma'
];
const PROFILLER = {
  rektorluk: { ad: 'Rektörlük',                          alanlar: ORTAK_ALANLAR, konteyner: true },
  enstitu:   { ad: 'Enstitü',                            alanlar: [...EGITIM_ALANLAR, ...ORTAK_ALANLAR], konteyner: true },
  idari:     { ad: 'Daire Başkanlığı / İdari Ofis',      alanlar: ORTAK_ALANLAR },
  egitim:    { ad: 'Eğitim binası (fakülte)',            alanlar: [...EGITIM_ALANLAR, ...ORTAK_ALANLAR] },
  myo:       { ad: 'MYO',                                alanlar: [...EGITIM_ALANLAR, ...MYO_EK_ALANLAR, ...ORTAK_ALANLAR] },
  hastane:   { ad: 'Hastane',                            alanlar: [...HASTANE_ALANLAR, ...ORTAK_ALANLAR] },
  kutuphane: { ad: 'Kütüphane (merkez)',                 alanlar: [...KUTUPHANE_ALANLAR, ...ORTAK_ALANLAR] },
  havuz:     { ad: 'Yüzme havuzu',                       alanlar: [...HAVUZ_ALANLAR, ...ORTAK_ALANLAR] },
  spor:      { ad: 'Spor kompleksi',                     alanlar: [...SPOR_ALANLAR, ...ORTAK_ALANLAR] },
  kres:      { ad: 'Kreş',                               alanlar: [...KRES_ALANLAR, ...ORTAK_ALANLAR] },
  yemekhane: { ad: 'Merkezi yemekhane',                  alanlar: [...YEMEKHANE_ALANLAR, ...ORTAK_ALANLAR] }
};

// Konteyner tiplerde (Rektörlük, Enstitü) hazır alt-birim önerileri — HER
// TİP KENDİ LİSTESİNİ KULLANIR (ilk sürümde ikisi de aynı Daire Başkanlığı
// listesini paylaşıyordu, Enstitü için anlamsızdı — düzeltildi).
// "+ Özel" ile listede olmayanlar her zaman eklenebilir.
const ALT_BIRIM_LISTELERI = {
  rektorluk: [
    'Strateji Geliştirme Daire Başkanlığı', 'Bilgi İşlem Daire Başkanlığı',
    'Yapı İşleri ve Teknik Daire Başkanlığı', 'Personel Daire Başkanlığı',
    'Öğrenci İşleri Daire Başkanlığı', 'İdari ve Mali İşler Daire Başkanlığı',
    'Sağlık Kültür ve Spor Daire Başkanlığı', 'Kütüphane ve Dokümantasyon Daire Başkanlığı',
    'Hukuk Müşavirliği', 'Genel Sekreterlik'
  ],
  enstitu: [
    'Fen Bilimleri Enstitüsü', 'Sosyal Bilimler Enstitüsü', 'Sağlık Bilimleri Enstitüsü',
    'Eğitim Bilimleri Enstitüsü'
  ]
};
const ALT_BIRIM_ETIKETI = {
  rektorluk: 'Alt Birim (Daire Başkanlığı)',
  enstitu: 'Alt Birim (Enstitü)'
};
const KONTEYNER_TIPLER = new Set(Object.entries(PROFILLER).filter(([, v]) => v.konteyner).map(([k]) => k));

function _birimAlanTipleri(birim) {
  const profil = PROFILLER[birim && birim.tip];
  const temel = profil ? profil.alanlar : ORTAK_ALANLAR;
  const ozel = (birim && birim.ozelAlanlar) || [];
  return [...temel, ...ozel];
}

// En sık kullanılan 6 alan tipi — profile göre (Oda ekleme formunda önce bunlar gösterilir).
const HIZLI_ALANLAR = {
  genel:     ['Ofis / idari oda', 'Toplantı salonu', 'Islak hacim (WC/lavabo)',
              'Koridor / merdiven / kaçış yolu', 'Arşiv / depo', 'Diğer'],
  idari:     ['Ofis / idari oda', 'Toplantı salonu', 'Islak hacim (WC/lavabo)',
              'Koridor / merdiven / kaçış yolu', 'Arşiv / depo', 'Çay ocağı / ofis mutfağı'],
  egitim:    ['Derslik / amfi', 'Ofis / idari oda', 'Bilgisayar lab.',
              'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu', 'Kantin / yemekhane'],
  myo:       ['Derslik / amfi', 'Atölye (makine/kaynak/vb.)', 'Ofis / idari oda',
              'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu', 'Yemekhane / mutfak'],
  hastane:   ['Poliklinik / muayene', 'Servis / hasta odası', 'Acil servis',
              'Eczane / ilaç deposu', 'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu'],
  kutuphane: ['Raf alanı / kitap deposu', 'Okuma salonu', 'Ödünç verme bankosu',
              'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu', 'Arşiv / depo'],
  havuz:     ['Havuz çevresi / ıslak zemin', 'Soyunma / duşlar', 'Makine dairesi (pompa/filtre)',
              'Cankurtaran istasyonu / ilk yardım', 'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu'],
  spor:      ['Kapalı spor salonu', 'Soyunma / duşlar', 'Fitness / kondisyon salonu',
              'Malzeme deposu', 'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu'],
  kres:      ['Oyun odası / etkinlik alanı', 'Uyku odası', 'Çocuk WC / alt değiştirme',
              'Bahçe / oyun parkı', 'Giriş güvenliği', 'Çocuk mutfağı / mama hazırlama'],
  yemekhane: ['Pişirme alanı (fritöz/kazan/davlumbaz)', 'Servis / yemek salonu', 'Bulaşıkhane',
              'Soğuk oda / depo', 'Islak hacim (WC/lavabo)', 'Personel soyunma']
};

function _birimHizliAlanlar(birim) {
  return HIZLI_ALANLAR[birim && birim.tip] || HIZLI_ALANLAR.genel;
}

// ─── OCR KOD OKUMA (v0.3'ten taşındı) — kapı/pano etiketi aday üretimi ────
// Benchmark: 10/10 sentetik + 2/2 gerçek etiket (bkz. BENIOKU.md).
const OCR_KOD_DESENI = /\b([A-Z]{1,4})[-–\s]?(\d{1,4})([A-Z]?)\b/g;

function ocrAdaylarUret(metin) {
  const m0 = String(metin || '').toUpperCase().replace(/İ/g, 'I');
  const adaylar = [];
  const bicim = (h, s, ek) => (h.length === 1 ? h + s + ek : h + '-' + s + ek);
  let m;
  OCR_KOD_DESENI.lastIndex = 0;
  while ((m = OCR_KOD_DESENI.exec(m0)) !== null) {
    const [, harf, sayi, ek] = m;
    adaylar.push({ skor: harf.length + sayi.length, kod: bicim(harf, sayi, ek) });
    const t = harf.match(/^(.*?)(O+)$/);
    if (t && t[1]) {
      const s2 = t[2].replace(/O/g, '0') + sayi;
      adaylar.push({ skor: t[1].length + s2.length, kod: bicim(t[1], s2, ek) });
    }
  }
  adaylar.sort((a, b) => b.skor - a.skor);
  const gorulen = new Set(), sonuc = [];
  for (const a of adaylar) {
    if (!gorulen.has(a.kod)) { gorulen.add(a.kod); sonuc.push(a.kod); }
  }
  return sonuc.slice(0, 3);
}

// ─── INDEXEDDB KATMANI ───────────────────────────────────────
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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

      // v4 (PWA Commit 3A): 'dofler' deposu -- masaüstü DÖF replay-v2
      // round-trip temeli. Store ZATEN VARSA (ör. yereldeki committed
      // olmayan bir denemenin bıraktığı v3 veritabanı) SİLİNMEZ/yeniden
      // OLUŞTURULMAZ -- mevcut kayıtlar korunur, yalnız eksik index'ler
      // tamamlanır. Sürüm numarasına körlemesine güvenilmez (`if (oldVersion
      // < 3)` gibi) -- gerçek object store/index varlığı kontrol edilir.
      let dofStore;
      if (!db.objectStoreNames.contains('dofler')) {
        dofStore = db.createObjectStore('dofler', { keyPath: 'id' });
      } else {
        dofStore = e.target.transaction.objectStore('dofler');
      }
      if (!dofStore.indexNames.contains('birimId')) {
        dofStore.createIndex('birimId', 'birimId', { unique: false });
      }
      // Bilerek unique:false -- yerel/eski kayıtlarda dofUuid hiç
      // olmayabilir veya eksik olabilir; tekilleştirme/upsert politikası
      // Commit 3B'nin kapsamıdır, bu migration veri korumayı önceliklendirir.
      if (!dofStore.indexNames.contains('dofUuid')) {
        dofStore.createIndex('dofUuid', 'dofUuid', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

async function _tx(storeName, mode) {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

async function dbEkle(store, obj) {
  const s = await _tx(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.add(obj);
    r.onsuccess = () => res(obj);
    r.onerror = () => rej(r.error);
  });
}
async function dbGuncelle(store, obj) {
  const s = await _tx(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.put(obj);
    r.onsuccess = () => res(obj);
    r.onerror = () => rej(r.error);
  });
}
async function dbSil(store, id) {
  const s = await _tx(store, 'readwrite');
  return new Promise((res, rej) => {
    const r = s.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function dbGetir(store, id) {
  const s = await _tx(store, 'readonly');
  return new Promise((res, rej) => {
    const r = s.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbTumu(store) {
  const s = await _tx(store, 'readonly');
  return new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbIndexTumu(store, indexName, key) {
  const s = await _tx(store, 'readonly');
  return new Promise((res, rej) => {
    const r = s.index(indexName).getAll(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

// Test/kullanım için global erişim.
if (typeof window !== 'undefined') {
  window._idb = { dbEkle, dbGuncelle, dbSil, dbGetir, dbTumu, dbIndexTumu, openDB };
}

// ─── DÖF REPLAY-V2 İÇE AKTARMA (PWA Commit 3B) ─────────────────
// Masaüstü (isg_denetim) `dof_disa_aktar()` çıktısını ("isg_dof_paketi")
// doğrulayıp `dofler` store'una atomik + idempotent biçimde yazar. Bu
// commit'te UI YOKTUR -- yalnız sonraki bir UI commit'inin çağıracağı
// production servis fonksiyonudur. Sözleşme isg_denetim reposundaki
// dof_islemleri.py (`dof_disa_aktar`) ve dof_replay_state.py (`baseStateHash`
// üretimi) salt-okunur incelenerek doğrulanmıştır -- tahmin edilmemiştir.

class DofImportHatasi extends Error {
  constructor(kod, mesaj) {
    super(mesaj);
    this.name = 'DofImportHatasi';
    this.kod = kod;
  }
}

const _DOF_UUID_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _DOF_UUID_V4_DESENI = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const _DOF_HEX64_DESENI = /^[0-9a-f]{64}$/;

function _dofGecerliUuidMi(v) { return typeof v === 'string' && _DOF_UUID_DESENI.test(v); }
function _dofGecerliUuidV4Mu(v) { return typeof v === 'string' && _DOF_UUID_V4_DESENI.test(v); }
function _dofPozitifTamsayiMi(v) { return typeof v === 'number' && Number.isInteger(v) && v >= 1; }

/** Paketin/kayıtların YAPISINI doğrular -- IndexedDB'ye hiç dokunmaz.
 * Geçersizse `DofImportHatasi` fırlatır (`.kod` ile ayırt edilebilir).
 * Geçerliyse `{ paketUuid, kayitlar }` döner (`kayitlar` henüz yerel
 * şemaya eşlenmemiş, ham ama doğrulanmış export kayıtlarıdır). */
function _dofPaketiYapisalDogrula(paket) {
  if (paket === null || typeof paket !== 'object' || Array.isArray(paket)) {
    throw new DofImportHatasi('GECERSIZ_PAKET', 'Paket bir JSON nesnesi olmalı.');
  }
  // Yanlış paket aileleri -- kesin ret. `dofKontrolleri` PWA→Desktop DÖF
  // DÖNÜŞ paketinin (veya legacy denetim ZIP'inin) imzasıdır, Desktop
  // EXPORT paketinde asla bulunmaz (bkz. dof_islemleri.py:992-996).
  if (Object.prototype.hasOwnProperty.call(paket, 'dofKontrolleri')) {
    throw new DofImportHatasi('GECERSIZ_PAKET', 'Bu paket bir DÖF DÖNÜŞ paketi (dofKontrolleri) -- masaüstü EXPORT paketi bekleniyor.');
  }
  if (['denetim', 'tespitler', 'manifest'].some((k) => Object.prototype.hasOwnProperty.call(paket, k))) {
    throw new DofImportHatasi('GECERSIZ_PAKET', 'Bu paket normal saha denetim ZIP zarfına benziyor -- DÖF export paketi bekleniyor.');
  }
  if (paket.tur !== 'isg_dof_paketi') {
    throw new DofImportHatasi('GECERSIZ_PAKET', `Beklenmeyen paket türü: ${JSON.stringify(paket.tur)}`);
  }
  if (paket.surum !== 1) {
    throw new DofImportHatasi('DESTEKLENMEYEN_SURUM', `Desteklenmeyen paket sürümü: ${JSON.stringify(paket.surum)}`);
  }
  if (typeof paket.paketUuid !== 'string' || paket.paketUuid.length === 0) {
    throw new DofImportHatasi('GECERSIZ_PAKET', 'paketUuid boş olmayan bir kimlik olmalı.');
  }
  if (!Array.isArray(paket.tehlikeler)) {
    throw new DofImportHatasi('GECERSIZ_PAKET', 'tehlikeler bir dizi olmalı.');
  }

  const gorulenDofUuid = new Set();
  const kayitlar = paket.tehlikeler.map((kayit, i) => {
    if (kayit === null || typeof kayit !== 'object' || Array.isArray(kayit)) {
      throw new DofImportHatasi('GECERSIZ_PAKET', `tehlikeler[${i}] bir JSON nesnesi olmalı.`);
    }
    if (!_dofGecerliUuidMi(kayit.dofUuid)) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].dofUuid eksik veya geçersiz.`);
    }
    if (!_dofGecerliUuidV4Mu(kayit.exportUuid)) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].exportUuid eksik veya v4 biçiminde değil.`);
    }
    if (typeof kayit.baseStateHash !== 'string' || !_DOF_HEX64_DESENI.test(kayit.baseStateHash)) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].baseStateHash eksik veya 64 haneli hex biçiminde değil.`);
    }
    if (!_dofPozitifTamsayiMi(kayit.aktifTurSirasi)) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].aktifTurSirasi eksik veya pozitif tam sayı değil.`);
    }
    if (kayit.dofId === undefined || kayit.dofId === null) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].dofId eksik.`);
    }
    if (kayit.replayVersion === undefined || kayit.replayVersion === null) {
      throw new DofImportHatasi('EKSIK_KIMLIK', `tehlikeler[${i}].replayVersion eksik.`);
    }
    if (kayit.replayVersion !== 2) {
      throw new DofImportHatasi('DESTEKLENMEYEN_REPLAY_VERSION', `tehlikeler[${i}].replayVersion desteklenmiyor: ${JSON.stringify(kayit.replayVersion)}`);
    }
    if (gorulenDofUuid.has(kayit.dofUuid)) {
      throw new DofImportHatasi('PAKET_ICI_DUPLICATE', `tehlikeler[${i}].dofUuid paket içinde birden fazla kez görülüyor: ${kayit.dofUuid}`);
    }
    gorulenDofUuid.add(kayit.dofUuid);
    return kayit;
  });

  return { paketUuid: paket.paketUuid, kayitlar };
}

/** Ham (doğrulanmış) export kaydını yerel `dofler` şemasına EXPLICIT
 * allowlist ile eşler -- kaynak nesne asla `{...kayit}` ile yayılmaz, bu
 * yüzden `durum`/`sonuc`/`kontrolNotu`/`fotolar`/`dofKontrolleri` veya
 * başka bilinmeyen/yetkisiz bir alan asla yerel kayda taşınmaz. Yerel
 * kimlik `id = dofUuid` -- bir ana DÖF için tek kanonik yerel kayıt,
 * idempotent import ve doğrudan `store.get(dofUuid)` sağlar. */
function _dofYerelKayitOlustur(kayit, paketUuid) {
  return {
    id: kayit.dofUuid,
    dofUuid: kayit.dofUuid,
    exportUuid: kayit.exportUuid,
    paketUuid,
    replayVersion: kayit.replayVersion,
    baseStateHash: kayit.baseStateHash,
    aktifTurSirasi: kayit.aktifTurSirasi,
    dofId: kayit.dofId,
    kurumId: kayit.pwaKurumId ?? null,
    birimId: kayit.pwaBirimId ?? null,
    odaId: kayit.pwaOdaId ?? null,
    kat: kayit.kat ?? '',
    oda: kayit.oda ?? '',
    alanTipi: kayit.alanTipi ?? '',
    bulguKodu: kayit.bulguKodu ?? '',
    riskKodu: kayit.riskKodu ?? null,
    tehlikeNo: kayit.tehlikeNo ?? null,
    tehlikeTanimi: kayit.tehlikeTanimi ?? '',
    riskDuzeyi: kayit.riskDuzeyi ?? null,
    r: kayit.r ?? null,
    duzelticiFaaliyet: kayit.duzelticiFaaliyet ?? '',
    aksiyonSuresi: kayit.aksiyonSuresi ?? '',
    iceAktarilmaZamani: new Date().toISOString(),
  };
}

/** Masaüstü DÖF replay-v2 export paketini (`isg_dof_paketi`) doğrular ve
 * `dofler` store'una ATOMİK + IDEMPOTENT biçimde kaydeder.
 *
 * - DOM'a bağımlı DEĞİLDİR, UI render ETMEZ, prompt/alert/modal AÇMAZ.
 * - `paketVeyaJsonMetni`: JS nesnesi veya JSON metni (string) kabul eder.
 * - Başarıda `{ toplam, eklenen, degismeyen }` döner.
 * - Geçersiz/çelişkili pakette `DofImportHatasi` fırlatır (`.kod`):
 *   GECERSIZ_JSON, GECERSIZ_PAKET, DESTEKLENMEYEN_SURUM,
 *   DESTEKLENMEYEN_REPLAY_VERSION, EKSIK_KIMLIK, PAKET_ICI_DUPLICATE,
 *   IMPORT_CONFLICT, VERITABANI_HATASI. Hata durumunda IndexedDB'ye
 *   HİÇBİR kayıt yazılmaz (paket bazında atomik -- readwrite transaction
 *   içinde tüm conflict kontrolleri tamamlanmadan hiçbir `put` çağrılmaz,
 *   herhangi bir conflict tüm transaction'ı `abort()` eder).
 */
async function dofPaketiIceriAktar(paketVeyaJsonMetni) {
  let paket = paketVeyaJsonMetni;
  if (typeof paketVeyaJsonMetni === 'string') {
    try {
      paket = JSON.parse(paketVeyaJsonMetni);
    } catch (e) {
      throw new DofImportHatasi('GECERSIZ_JSON', `Paket geçerli bir JSON metni değil: ${e.message}`);
    }
  }

  const { paketUuid, kayitlar } = _dofPaketiYapisalDogrula(paket);
  const yereller = kayitlar.map((k) => _dofYerelKayitOlustur(k, paketUuid));

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const sonuclar = new Array(yereller.length);
    let hata = null;
    let bekleyen = yereller.length;

    const hepsiOkunduMu = () => {
      if (bekleyen > 0) return;
      if (hata) {
        tx.abort();
        return;
      }
      sonuclar.forEach(({ kayit, aksiyon }) => {
        if (aksiyon === 'ekle') store.put(kayit);
      });
    };

    yereller.forEach((kayit, i) => {
      const getReq = store.get(kayit.id);
      getReq.onsuccess = () => {
        const mevcut = getReq.result;
        if (!mevcut) {
          sonuclar[i] = { kayit, aksiyon: 'ekle' };
        } else {
          const ayniMi = mevcut.exportUuid === kayit.exportUuid
            && mevcut.baseStateHash === kayit.baseStateHash
            && mevcut.aktifTurSirasi === kayit.aktifTurSirasi
            && mevcut.replayVersion === kayit.replayVersion;
          if (ayniMi) {
            sonuclar[i] = { kayit, aksiyon: 'degismeyen' };
          } else {
            sonuclar[i] = { kayit, aksiyon: 'conflict' };
            if (!hata) {
              hata = new DofImportHatasi('IMPORT_CONFLICT', `dofUuid ${kayit.dofUuid} için mevcut kayıtla çelişki (exportUuid/baseStateHash/aktifTurSirasi/replayVersion farklı).`);
            }
          }
        }
        bekleyen--;
        hepsiOkunduMu();
      };
      getReq.onerror = () => {
        if (!hata) {
          hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
        }
        bekleyen--;
        hepsiOkunduMu();
      };
    });

    // Boş `tehlikeler` dizisi: gerçek Desktop kaynağında bunu açıkça
    // yasaklayan bir kural bulunamadı (bkz. commit raporu) -- zararsız
    // no-op olarak kabul edilir. `yereller.length === 0` ise yukarıdaki
    // forEach hiç request issue etmez, transaction otomatik `oncomplete`
    // ile tamamlanır.

    tx.oncomplete = () => {
      if (hata) return; // abort edilmiş olmalı -- onabort reddedecek
      const eklenen = sonuclar.filter((s) => s.aksiyon === 'ekle').length;
      const degismeyen = sonuclar.filter((s) => s.aksiyon === 'degismeyen').length;
      resolve({ toplam: sonuclar.length, eklenen, degismeyen });
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

// ─── DÖF TAKİP TASLAĞI (PWA Commit 4A) ──────────────────────────
// İzinli sekiz public takip alanı (isg_denetim/dof_takip_contract.py +
// dof_islemleri.py::_dof_takip_guncelle_core salt-okunur doğrulanmıştır)
// için yerel taslak katmanı. Kanonik imported DÖF kaydından mantıksal
// olarak AYRI, nested `takipTaslagi` alanında saklanır -- import
// kimlikleri/snapshot alanları hiçbir zaman bu katman tarafından
// değiştirilmez. Bu commit'te UI/replay ZIP/medya YOKTUR.

const _DOF_TARIH_ALANLARI = ['planlanan_tarih', 'etkinlik_kontrol_tarihi'];
const _DOF_METIN_ALANLARI = ['sorumlu', 'gerceklesen_faaliyet', 'gozlem_degerlendirme'];
const _DOF_OFS_ALANLARI = ['yeni_o', 'yeni_f', 'yeni_s'];
const _DOF_TAKIP_ALANLARI = [..._DOF_TARIH_ALANLARI, ..._DOF_METIN_ALANLARI, ..._DOF_OFS_ALANLARI];

// Fine-Kinney kanonik değer kümeleri -- isg_denetim/fine_kinney.py'den
// salt-okunur doğrulandı (OLASILIK/FREKANS/SIDDET).
const _DOF_FINE_KINNEY_KUMELERI = {
  yeni_o: new Set([10, 6, 3, 1, 0.5, 0.2]),
  yeni_f: new Set([10, 6, 3, 2, 1, 0.5]),
  yeni_s: new Set([100, 40, 15, 7, 3, 1]),
};

const _DOF_TARIH_DESENI = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `date.fromisoformat` (Python) ile aynı katılıkta: sıkı `YYYY-MM-DD`,
 * gerçek takvim geçerliliği (ay/gün sınırları, artık yıl dahil). */
function _dofGecerliTarihMi(v) {
  const eslesme = typeof v === 'string' && v.match(_DOF_TARIH_DESENI);
  if (!eslesme) return false;
  const y = Number(eslesme[1]);
  const m = Number(eslesme[2]);
  const d = Number(eslesme[3]);
  if (m < 1 || m > 12) return false;
  const ayGunSayisi = new Date(y, m, 0).getDate();
  return d >= 1 && d <= ayGunSayisi;
}

function _dofBosTaslak() {
  return {
    planlanan_tarih: null, sorumlu: null, gerceklesen_faaliyet: null,
    etkinlik_kontrol_tarihi: null, gozlem_degerlendirme: null,
    yeni_o: null, yeni_f: null, yeni_s: null,
  };
}

/** Kayıt kanonik replay-v2 mi? (`dofPaketiIceriAktar`'ın ürettiği şekil).
 * Yalnız bu şekildeki kayıtlar taslak düzenlemesine AÇIKTIR -- WIP/legacy
 * kayıtlar (random id, replay-v2 kimlik seti eksik) reddedilir. */
function _dofKanonikMi(kayit) {
  return !!kayit
    && kayit.id === kayit.dofUuid
    && kayit.replayVersion === 2
    && _dofGecerliUuidV4Mu(kayit.exportUuid)
    && typeof kayit.baseStateHash === 'string' && _DOF_HEX64_DESENI.test(kayit.baseStateHash)
    && _dofPozitifTamsayiMi(kayit.aktifTurSirasi)
    && typeof kayit.paketUuid === 'string' && kayit.paketUuid.length > 0;
}

/** Tek bir takip alanının DEĞERİNİ, gerçek Desktop sözleşmesine göre
 * doğrular/normalize eder ve normalize edilmiş değeri döner. Geçersizse
 * `DofImportHatasi('GECERSIZ_TAKIP_DEGERI', ...)` fırlatır. Bu fonksiyon
 * yalnız DEĞER doğrular -- alan adının allowlist'te olup olmadığını
 * ÇAĞIRAN taraf önceden kontrol etmiş olmalıdır. */
function _dofTakipAlanDogrula(alan, deger) {
  if (_DOF_TARIH_ALANLARI.includes(alan)) {
    if (deger === null) return null;
    if (typeof deger !== 'string') {
      throw new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', `${alan} bir metin (YYYY-MM-DD) veya null olmalı.`);
    }
    // Desktop ile aynı: baş/son boşluk kırpılır, kırpma sonrası boş ->
    // null (dof_islemleri.py::_tarih_normalize ile aynı davranış).
    const kirpilmis = deger.trim();
    if (kirpilmis === '') return null;
    if (!_dofGecerliTarihMi(kirpilmis)) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', `${alan} geçerli bir YYYY-MM-DD tarihi değil: ${JSON.stringify(deger)}`);
    }
    return kirpilmis;
  }
  if (_DOF_METIN_ALANLARI.includes(alan)) {
    if (deger === null) return null;
    // Desktop kaynağında bu metin alanları için isinstance(str) reddi
    // KANITLANMADI (bkz. commit raporu) -- ancak ticket'in kendi §10/
    // Test-G talimatı, kanıtlanmamış iş kuralları için PWA tarafında
    // "kanıtlanabilen temel tip" doğrulaması uygulanmasını İSTİYOR. Bu
    // yüzden object/array/number/boolean burada BİLİNÇLİ olarak, Desktop'ın
    // kendisinden DAHA SIKI biçimde reddedilir (rapora not düşülmüştür).
    if (typeof deger !== 'string') {
      throw new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', `${alan} bir metin veya null olmalı.`);
    }
    const kirpilmis = deger.trim();
    return kirpilmis === '' ? null : kirpilmis;
  }
  if (_DOF_OFS_ALANLARI.includes(alan)) {
    if (deger === null) return null;
    // `typeof deger !== 'number'` boolean'ı DA reddeder (typeof true ===
    // 'boolean'), ayrıca NaN/Infinity/-Infinity Number.isFinite ile reddedilir.
    if (typeof deger !== 'number' || !Number.isFinite(deger)) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', `${alan} sonlu bir sayı veya null olmalı.`);
    }
    if (!_DOF_FINE_KINNEY_KUMELERI[alan].has(deger)) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', `${alan} Fine-Kinney kanonik değer kümesinde değil: ${deger}`);
    }
    return deger;
  }
  // Buraya asla ulaşılmamalı -- çağıran taraf allowlist kontrolünü
  // önceden yapar. Savunma amaçlı.
  throw new DofImportHatasi('IZINSIZ_TAKIP_ALANI', `Bilinmeyen takip alanı: ${alan}`);
}

/** `yeni_o`/`yeni_f`/`yeni_s` ÜÇLÜSÜ birlikte değerlendirilir (Desktop
 * `_artik_risk_dogrula` ile aynı kural): ya üçü de null (henüz
 * değerlendirilmemiş), ya da üçü de dolu -- kısmi (1 veya 2 dolu) durum
 * GEÇERSİZ. */
function _dofOfsUclusuGecerliMi(o, f, s) {
  const hepsiNull = o === null && f === null && s === null;
  const hepsiDolu = o !== null && f !== null && s !== null;
  return hepsiNull || hepsiDolu;
}

/** Kanonik bir DÖF kaydının mevcut yerel takip taslağını okur. Dönen
 * nesne HER ZAMAN yeni bir kopyadır (yalnız primitive değerler içerir) --
 * çağıran taraf üzerinde mutasyon yapsa bile IndexedDB'deki gerçek kayıt
 * ETKİLENMEZ. Kayıt yoksa `DofImportHatasi('DOF_BULUNAMADI', ...)`. Kayıt
 * varsa ama kanonik replay-v2 şeklinde DEĞİLSE (legacy/WIP -- bkz.
 * `_dofKanonikMi`) `DofImportHatasi('KANONIK_DOF_DEGIL', ...)` -- legacy
 * kaydın içeriği veya varsa kendi taslağı HİÇBİR biçimde dışarı sızmaz. */
async function dofTakipTaslagiGetir(dofUuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readonly');
    const getReq = tx.objectStore('dofler').get(dofUuid);
    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        reject(new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`));
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        reject(new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`));
        return;
      }
      const taslak = { ..._dofBosTaslak(), ...(kayit.takipTaslagi || {}) };
      resolve({ dofUuid, takipTaslagi: taslak, taslakGuncellenmeZamani: kayit.taslakGuncellenmeZamani ?? null });
    };
    getReq.onerror = () => {
      reject(new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`));
    };
  });
}

/** Kanonik bir DÖF kaydının yerel takip taslağını PARTIAL biçimde
 * günceller. Yalnız sekiz allowlist alanına izin verilir (bilinmeyen/
 * yetkisiz herhangi bir anahtar -- `__proto__`/`constructor`/`prototype`
 * dahil -- `IZINSIZ_TAKIP_ALANI` ile REDDEDİLİR, sessizce düşürülmez).
 * Kaynak nesne asla `{...kayit, ...degisiklikler}` ile yayılmaz -- her
 * izinli alan tek tek, doğrulanmış biçimde işlenir. Tek `readwrite`
 * transaction içinde get→doğrula→(gerekiyorsa) put yapılır; herhangi bir
 * doğrulama hatasında transaction `abort()` edilir, kısmi yazma OLMAZ.
 *
 * PWA Commit 4A-2 (kök düzeltme): `takipTaslagi` artık SPARSE/PARTIAL bir
 * nesnedir -- yalnız kullanıcının GERÇEKTEN dokunduğu (bu veya önceki bir
 * çağrıda anahtar olarak geçirdiği) alanlar own-property olarak saklanır.
 * Önceki tasarım (`_dofBosTaslak()` ile tüm 8 alanı ön-doldurup birleştirme)
 * "hiç dokunulmamış" ile "dokunulup null'a temizlenmiş" alanı storage'da
 * AYNI (own-property + null) hâle getiriyordu -- bu ayrım artık
 * `Object.prototype.hasOwnProperty` ile güvenle korunur (bkz. commit
 * raporu). `dofTakipTaslagiGetir` bu sparse veriyi KENDİ `_dofBosTaslak()`
 * birleştirmesiyle (değişmedi) hâlâ dolu 8-alanlı biçimde GÖSTERİR --
 * yalnız iç storage formatı değişti, Getir/Temizle'nin dış sözleşmesi
 * AYNI kaldı (ikisi de değişmedi). */
async function dofTakipTaslagiGuncelle(dofUuid, degisiklikler) {
  if (degisiklikler === null || typeof degisiklikler !== 'object' || Array.isArray(degisiklikler)) {
    throw new DofImportHatasi('GECERSIZ_DEGISIKLIK', 'degisiklikler bir düz (plain) nesne olmalı.');
  }
  const anahtarlar = Object.keys(degisiklikler);
  for (const anahtar of anahtarlar) {
    if (!_DOF_TAKIP_ALANLARI.includes(anahtar)) {
      throw new DofImportHatasi('IZINSIZ_TAKIP_ALANI', `İzinsiz/bilinmeyen takip alanı: ${anahtar}`);
    }
  }
  // Değer doğrulama/normalizasyon -- DB durumundan bağımsız, bu yüzden
  // transaction AÇILMADAN ÖNCE yapılabilir (yalnız yeni_o/f/s ÜÇLÜ
  // tamlık kuralı mevcut kayda bağlıdır, o kontrol transaction içinde).
  const dogrulanmisDegisiklikler = {};
  for (const anahtar of anahtarlar) {
    dogrulanmisDegisiklikler[anahtar] = _dofTakipAlanDogrula(anahtar, degisiklikler[anahtar]);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const getReq = store.get(dofUuid);
    let sonucDegeri = null;
    let hata = null;

    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        hata = new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
        tx.abort();
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        hata = new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
        tx.abort();
        return;
      }

      // SPARSE birleştirme -- `_dofBosTaslak()` ile ön-doldurma YOK. Yalnız
      // daha önce GERÇEKTEN dokunulmuş alanlar (mevcutTaslak'ın own-
      // property'leri) + bu çağrıda dokunulan alanlar own-property olarak
      // kalır; hiç dokunulmamış alanlar own-property OLMAZ.
      const mevcutTaslak = kayit.takipTaslagi || {};
      const yeniTaslak = { ...mevcutTaslak };
      for (const anahtar of anahtarlar) {
        yeniTaslak[anahtar] = dogrulanmisDegisiklikler[anahtar];
      }

      // O/F/S üçlü own-property kuralı: biri own-property ise üçü de
      // own-property olmalı (değeri null olsa bile) -- yalnız BİRİ
      // dokunulmuşsa (diğer ikisi hiç dokunulmamışsa) reddedilir.
      const ofsOwnAlanlar = _DOF_OFS_ALANLARI.filter((a) => Object.prototype.hasOwnProperty.call(yeniTaslak, a));
      if (ofsOwnAlanlar.length > 0 && ofsOwnAlanlar.length < 3) {
        hata = new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', 'yeni_o/yeni_f/yeni_s üçü de dokunulmuş (own property) olmalı veya hiçbiri dokunulmamış olmalı.');
        tx.abort();
        return;
      }
      if (ofsOwnAlanlar.length === 3 && !_dofOfsUclusuGecerliMi(yeniTaslak.yeni_o, yeniTaslak.yeni_f, yeniTaslak.yeni_s)) {
        hata = new DofImportHatasi('GECERSIZ_TAKIP_DEGERI', 'yeni_o/yeni_f/yeni_s üçlü olarak (hepsi dolu veya hepsi boş) girilmelidir.');
        tx.abort();
        return;
      }

      // Dönen değer (`sonucDegeri.takipTaslagi`) -- Getir'in kendi
      // `_dofBosTaslak()` birleştirmesiyle AYNI, dolu 8-alanlı GÖSTERİM
      // biçimi (dış sözleşme/geriye uyumluluk için). STORAGE'a yazılan
      // (`store.put`) ise SPARSE `yeniTaslak`'ın kendisidir -- bu ikisi
      // kasıtlı olarak farklıdır.
      const gosterimTaslak = { ..._dofBosTaslak(), ...yeniTaslak };

      const degisti = JSON.stringify(yeniTaslak) !== JSON.stringify(mevcutTaslak);
      if (!degisti) {
        // No-op: hiçbir put YOK, taslakGuncellenmeZamani DEĞİŞMEZ.
        sonucDegeri = { durum: 'degismedi', dofUuid, takipTaslagi: gosterimTaslak, taslakGuncellenmeZamani: kayit.taslakGuncellenmeZamani ?? null };
        return;
      }

      const yeniZaman = new Date().toISOString();
      // Güvenli spread: `kayit` GÜVENİLİR (az önce DB'den okunan, kendi
      // ürettiğimiz kanonik kayıt) -- kullanıcı girdisi `degisiklikler`
      // buraya asla doğrudan yayılmaz, yalnız doğrulanmış (sparse)
      // `yeniTaslak` nested alanı eklenir.
      store.put({ ...kayit, takipTaslagi: yeniTaslak, taslakGuncellenmeZamani: yeniZaman });
      sonucDegeri = { durum: 'guncellendi', dofUuid, takipTaslagi: gosterimTaslak, taslakGuncellenmeZamani: yeniZaman };
    };
    getReq.onerror = () => {
      hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
      tx.abort();
    };

    tx.oncomplete = () => {
      if (hata) return; // abort edilmiş olmalı -- onabort reddedecek
      resolve(sonucDegeri);
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

/** Yerel takip taslağını (ve taslak zaman bilgisini) kaldırır. İmport
 * edilmiş DÖF kaydını SİLMEZ, kimlik/snapshot alanlarına DOKUNMAZ. Taslak
 * zaten yoksa idempotent no-op'tur (`put` çağrılmaz). */
async function dofTakipTaslagiTemizle(dofUuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const getReq = store.get(dofUuid);
    let sonucDegeri = null;
    let hata = null;

    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        hata = new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
        tx.abort();
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        // Legacy/WIP kayıt -- kanoniklik kontrolü ÖNCE yapılır, bu yüzden
        // legacy kayıtta `takipTaslagi`/`taslakGuncellenmeZamani` bulunsa
        // BİLE (normalde Guncelle bunları hiç yazmaz, ama savunma amaçlı)
        // silinmez, kayıt tamamen dokunulmadan kalır.
        hata = new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
        tx.abort();
        return;
      }
      const taslakVarMi = kayit.takipTaslagi !== undefined || kayit.taslakGuncellenmeZamani !== undefined;
      if (!taslakVarMi) {
        sonucDegeri = { durum: 'degismedi', dofUuid };
        return; // idempotent no-op -- put yok
      }
      // Yalnız iki nested taslak alanını KALDIRIR -- diğer tüm alanlar
      // (kimlik/snapshot dahil) birebir korunur.
      const { takipTaslagi, taslakGuncellenmeZamani, ...kalanKayit } = kayit;
      store.put(kalanKayit);
      sonucDegeri = { durum: 'temizlendi', dofUuid };
    };
    getReq.onerror = () => {
      hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
      tx.abort();
    };

    tx.oncomplete = () => {
      if (hata) return;
      resolve(sonucDegeri);
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

// ─── DÖF İNCELEME DURUMU / reviewStatus (PWA Commit 4N) ─────────
// Sahada bir DÖF'ün "görüldü mü/incelendi mi/kapatma önerilir mi"
// bilgisini tutan, `takipTaslagi`'ndan TAMAMEN BAĞIMSIZ, ayrı bir
// top-level sibling alan (`reviewStatus`). `_DOF_TAKIP_ALANLARI`
// allowlist'ine KESİNLİKLE eklenmez -- `dofTakipTaslagiGuncelle` bu
// alana hiç dokunmaz/bilmez, `dofReviewStatusGuncelle` de `takipTaslagi`
// alanına hiç dokunmaz (bkz. izolasyon testleri).
//
// Bu commit'te EXPORT YOKTUR -- `_DOF_DONUS_GIRDI_ALANLARI` (§DÖF DÖNÜŞ
// BELGESİ) bu alanı okumaz, `dofDonusBelgesiOlustur`/`dofReplayZipOlustur`
// hiç değişmedi. Medya/kapanış alanı üretimi YOKTUR -- Human-in-Control
// ilkesi gereği `kapatma_onerisi` yalnız yerel bir işarettir, final
// kapatma her zaman Desktop'ta kalır (bkz. dof_takip_contract.py'de
// kapanış alanlarının hiç olmadığı, salt-okunur doğrulanmış allowlist).
const _DOF_REVIEW_STATUS_DEGERLERI = new Set([
  'dokunulmadi', 'goruldu', 'inceledi_degisiklik_yok', 'kapatma_onerisi', 'kapatilamaz',
]);
const _DOF_REVIEW_STATUS_VARSAYILAN = 'dokunulmadi';

/** Bir DÖF'ün mevcut reviewStatus'unu okur -- salt-okunur, HİÇBİR
 * DB yazması yapmaz. Alan own-property olarak yoksa (hiç dokunulmamış
 * -- yeni import edilen veya eski kayıt fark etmez) varsayılan
 * `'dokunulmadi'` döner; bu, ekranın sadece açılmasıyla DB'ye bir şey
 * yazılmadığının garantisidir (yalnız `dofReviewStatusGuncelle`
 * kullanıcının GERÇEKTEN seçim yaptığı anda yazar). `dofTakipTaslagiGetir`
 * ile AYNI güvenli desen: kayıt yoksa `DOF_BULUNAMADI`, kanonik değilse
 * `KANONIK_DOF_DEGIL`. */
async function dofReviewStatusGetir(dofUuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readonly');
    const getReq = tx.objectStore('dofler').get(dofUuid);
    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        reject(new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`));
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        reject(new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`));
        return;
      }
      const reviewStatus = Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')
        ? kayit.reviewStatus : _DOF_REVIEW_STATUS_VARSAYILAN;
      resolve({ dofUuid, reviewStatus, reviewStatusGuncellenmeZamani: kayit.reviewStatusGuncellenmeZamani ?? null });
    };
    getReq.onerror = () => {
      reject(new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`));
    };
  });
}

/** Bir DÖF'ün reviewStatus'unu kalıcı yazar -- `dofTakipTaslagiGuncelle`
 * ile AYNI transaction deseni (get→kanoniklik→doğrulama→put), ama
 * TAMAMEN AYRI bir alan/fonksiyon: `takipTaslagi` nesnesine (own-
 * property olarak bile) hiç dokunmaz, yalnız `reviewStatus` +
 * `reviewStatusGuncellenmeZamani` top-level alanlarını günceller. Geçersiz
 * enum değeri `GECERSIZ_REVIEW_STATUS` ile reddedilir. */
async function dofReviewStatusGuncelle(dofUuid, reviewStatus) {
  if (!_DOF_REVIEW_STATUS_DEGERLERI.has(reviewStatus)) {
    throw new DofImportHatasi('GECERSIZ_REVIEW_STATUS', `Geçersiz reviewStatus değeri: ${JSON.stringify(reviewStatus)}`);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const getReq = store.get(dofUuid);
    let sonucDegeri = null;
    let hata = null;

    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        hata = new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
        tx.abort();
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        hata = new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
        tx.abort();
        return;
      }

      const mevcutReviewStatus = Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')
        ? kayit.reviewStatus : _DOF_REVIEW_STATUS_VARSAYILAN;
      if (mevcutReviewStatus === reviewStatus) {
        // No-op: hiçbir put YOK, reviewStatusGuncellenmeZamani DEĞİŞMEZ.
        sonucDegeri = { durum: 'degismedi', dofUuid, reviewStatus, reviewStatusGuncellenmeZamani: kayit.reviewStatusGuncellenmeZamani ?? null };
        return;
      }

      const yeniZaman = new Date().toISOString();
      // Güvenli spread: `kayit` GÜVENİLİR (az önce DB'den okunan kanonik
      // kayıt) -- `takipTaslagi` dahil TÜM diğer alanlar birebir korunur,
      // yalnız reviewStatus + reviewStatusGuncellenmeZamani eklenir/güncellenir.
      store.put({ ...kayit, reviewStatus, reviewStatusGuncellenmeZamani: yeniZaman });
      sonucDegeri = { durum: 'guncellendi', dofUuid, reviewStatus, reviewStatusGuncellenmeZamani: yeniZaman };
    };
    getReq.onerror = () => {
      hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
      tx.abort();
    };

    tx.oncomplete = () => {
      if (hata) return;
      resolve(sonucDegeri);
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

// ─── DÖF DÖNÜŞ BELGESİ ÜRETİMİ (PWA Commit 4B) ──────────────────
// Kanonik imported DÖF kayıtları + izinli `takipTaslagi`'ndan, masaüstünün
// gerçek replay-v2 dönüş sözleşmesine (`dof_donus.json` -- isg_denetim/
// dof_replay_import.py salt-okunur doğrulandı) uygun belge/JSON üretir.
// SALT-OKUNUR'dur -- IndexedDB'ye hiçbir yazma yapmaz, ZIP/medya/submission
// UUID üretmez/saklamaz, UI kullanmaz.
//
// Desktop sözleşmesinden doğrulanan kritik noktalar (bkz. commit raporu):
// - Üst zarf: yalnız `paketUuid` (string) + `dofKontrolleri` (array).
//   `surum`/`replayVersion` üst seviyede YOKTUR, yalnız kayıt bazında.
// - Kayıt kimlik alanları: dofUuid (herhangi geçerli UUID), exportUuid
//   (UUID v4), submissionUuid (UUID v4), baseStateHash (64 hex),
//   aktifTurSirasi (pozitif int), replayVersion (tam olarak 2).
// - `sonuc`/`not` YOK SAYILIR (v2 Apply'de hiç okunmaz) -- bu yüzden
//   belgeye taşınmaz.
// - Takip alanları kayıt içinde DÜZ (flat) kardeş alanlardır, nested değil.
// - Medya alanları (fotolar/sesNotlari) yoksa TAMAMEN atlanabilir (boş
//   dizi vermeye eşdeğer okunuyor) -- bu commit medya üretmiyor zaten.
// - Desktop, tek belgede FARKLI export paketlerinden gelen kayıtları
//   BATCH seviyesinde reddetmiyor (yalnız kayıt bazında üst paketUuid'in
//   O kaydın kendi export'uyla eşleşmesini istiyor). Ancak belge şeması
//   yapısal olarak TEK bir üst paketUuid taşıdığından, farklı paketten
//   gelen bir kaydı aynı belgeye koymak o kaydın Desktop tarafında
//   SESSİZCE "hata" statüsüne düşmesine yol açar. Bu risk yüzünden PWA
//   İSTEMCİ tarafında KARISIK_EXPORT_PAKETI ile ERKEN ve AÇIK reddediliyor
//   (Desktop'ın kendisi zorunlu kılmasa da, kullanışsız/yanıltıcı belge
//   üretimini önlemek için bilinçli, dokümante edilmiş bir karar).
//
// NULL SEMANTİĞİ (PWA Commit 4B-1, 4A-2 sparse storage üzerine): storage
// artık own-property tabanlı sparse/partial olduğundan "hiç dokunulmamış"
// ile "dokunulup explicit null'a temizlenmiş" alan güvenle ayırt edilir:
//   Anahtar own-property olarak YOK   -> belgeye HİÇ eklenmez
//     (Desktop dict-diff semantiği: anahtar yok = mevcut değer korunur).
//   Anahtar VAR ve değeri null        -> belgeye alan:null olarak eklenir
//     (Desktop: anahtar mevcut + null = alanı temizle; dof_islemleri.py
//     :136-138 dict-diff, salt-okunur doğrulandı).
//   Anahtar VAR ve non-null değer     -> aynı tip/içerikle eklenir
//     (yeniden trim/format/dönüşüm YOK).
// `dofId` belgeye TAŞINMAZ: dof_replay_import.py:255 payload hash'inden
// açıkça HARİÇ tutuyor, :578-580/:939 authoritative dof_id'nin HER ZAMAN
// exportUuid'den çözüldüğünü ve payload'daki numeric dofId ile hiçbir
// eşleştirme yapılmadığını, :1139-1141 alanın otorite olmadığını belirtir
// -- Desktop importer bu alanı hiç okumaz/doğrulamaz/beklemez. Imported
// yerel IndexedDB kaydında kalmaya devam eder.

const _DOF_DONUS_GIRDI_ALANLARI = ['dofUuid', 'submissionUuid'];

/** `girdiler` dizisini yapısal olarak doğrular -- IndexedDB'ye HİÇ
 * dokunmaz. Yalnız `dofUuid`/`submissionUuid` alanlarına izin verilir
 * (bilinmeyen alan -- `__proto__` dahil -- reddedilir). Geçerliyse
 * `{dofUuid, submissionUuid}` şeklinde doğrulanmış bir dizi döner. */
function _dofDonusGirdiDogrula(girdiler) {
  if (!Array.isArray(girdiler)) {
    throw new DofImportHatasi('GECERSIZ_GIRDI', 'girdiler bir dizi olmalı.');
  }
  if (girdiler.length === 0) {
    throw new DofImportHatasi('GECERSIZ_GIRDI', 'girdiler boş olamaz.');
  }
  const gorulenDofUuid = new Set();
  const gorulenSubmissionUuid = new Set();
  return girdiler.map((girdi, i) => {
    if (girdi === null || typeof girdi !== 'object' || Array.isArray(girdi)) {
      throw new DofImportHatasi('GECERSIZ_GIRDI', `girdiler[${i}] bir JSON nesnesi olmalı.`);
    }
    for (const anahtar of Object.keys(girdi)) {
      if (!_DOF_DONUS_GIRDI_ALANLARI.includes(anahtar)) {
        throw new DofImportHatasi('GECERSIZ_GIRDI', `girdiler[${i}] izinsiz/bilinmeyen alan taşıyor: ${anahtar}`);
      }
    }
    if (!_dofGecerliUuidMi(girdi.dofUuid)) {
      throw new DofImportHatasi('GECERSIZ_GIRDI', `girdiler[${i}].dofUuid eksik veya geçersiz.`);
    }
    if (!_dofGecerliUuidV4Mu(girdi.submissionUuid)) {
      throw new DofImportHatasi('GECERSIZ_SUBMISSION_UUID', `girdiler[${i}].submissionUuid eksik veya v4 biçiminde değil.`);
    }
    if (gorulenDofUuid.has(girdi.dofUuid)) {
      throw new DofImportHatasi('PAKET_ICI_DUPLICATE', `girdiler[${i}].dofUuid paket içinde birden fazla kez görülüyor: ${girdi.dofUuid}`);
    }
    gorulenDofUuid.add(girdi.dofUuid);
    if (gorulenSubmissionUuid.has(girdi.submissionUuid)) {
      throw new DofImportHatasi('SUBMISSION_UUID_DUPLICATE', `girdiler[${i}].submissionUuid paket içinde birden fazla kez görülüyor: ${girdi.submissionUuid}`);
    }
    gorulenSubmissionUuid.add(girdi.submissionUuid);
    return { dofUuid: girdi.dofUuid, submissionUuid: girdi.submissionUuid };
  });
}

/** Verilen `dofUuid` listesini TEK bir readonly transaction içinde okur
 * (Desktop veya başka bir kaynak DB'yi eşzamanlı değiştirmiyor olsa da,
 * belge üretiminin tamamının tutarlı bir DB anlık görüntüsü üzerinden
 * çalışmasını sağlar). Bulunamayan kayıtlar için `undefined` döner --
 * hata fırlatmaz, DOF_BULUNAMADI kararı çağıran tarafa bırakılır. */
async function _dofKanonikKayitlariOku(dofUuidler) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readonly');
    const store = tx.objectStore('dofler');
    const sonuclar = new Array(dofUuidler.length);
    let bekleyen = dofUuidler.length;
    let hata = null;

    const tamamlandiMi = () => {
      if (bekleyen > 0) return;
      if (hata) reject(hata); else resolve(sonuclar);
    };

    dofUuidler.forEach((dofUuid, i) => {
      const getReq = store.get(dofUuid);
      getReq.onsuccess = () => { sonuclar[i] = getReq.result; bekleyen--; tamamlandiMi(); };
      getReq.onerror = () => {
        if (!hata) hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
        bekleyen--; tamamlandiMi();
      };
    });
  });
}

/** Ham (DB'den okunan, doğrudan manipülasyona açık olabilecek)
 * `takipTaslagi` nesnesini SAVUNMACI biçimde yeniden doğrular -- taslak
 * servisinin (`dofTakipTaslagiGuncelle`) daha önce doğrulamış olmasına
 * körü körüne güvenmez. Mevcut `_dofTakipAlanDogrula`/`_dofOfsUclusuGecerliMi`
 * yardımcılarını (tekrar yazmadan) reuse eder. Geçersizse
 * `DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', ...)` fırlatır.
 *
 * PWA Commit 4B-1: 4A-2'nin SPARSE own-property semantiğini KORUR --
 * eksik alanları null ile DOLDURMAZ, yalnız gerçekten own-property olan
 * izinli alanları doğrular ve aynı sparse yapıyla döner. Değerin, kanonik
 * taslak servisinin üreteceği normalize biçimle BİREBİR aynı olması da
 * istenir (ör. trim edilmemiş " x " veya "" -- servis bunları asla
 * yazmaz) -- sapma, doğrudan DB manipülasyonu demektir ve sessizce
 * düzeltilmek yerine reddedilir. */
function _dofTaslakSavunmaciDogrula(taslak) {
  if (taslak === null || typeof taslak !== 'object' || Array.isArray(taslak)) {
    throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', 'takipTaslagi bir nesne olmalı.');
  }
  for (const anahtar of Object.keys(taslak)) {
    if (!_DOF_TAKIP_ALANLARI.includes(anahtar)) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', `takipTaslagi izinsiz/bilinmeyen alan taşıyor: ${anahtar}`);
    }
  }
  const dogrulanmis = {};
  for (const alan of _DOF_TAKIP_ALANLARI) {
    if (!Object.prototype.hasOwnProperty.call(taslak, alan)) continue;   // absent = absent kalır
    const deger = taslak[alan];
    let normalize;
    try {
      normalize = _dofTakipAlanDogrula(alan, deger);
    } catch (e) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', `takipTaslagi.${alan} geçersiz: ${e.message}`);
    }
    if (normalize !== deger) {
      throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', `takipTaslagi.${alan} kanonik normalize biçimde değil (doğrudan DB manipülasyonu olabilir).`);
    }
    dogrulanmis[alan] = deger;
  }
  // O/F/S üçlü own-property kuralı (4A-2 storage kuralıyla aynı): biri
  // own-property ise üçü de own-property olmalı; üçü de own ise değerler
  // ya hep null ya hep geçerli Fine-Kinney olmalı.
  const ofsOwnAlanlar = _DOF_OFS_ALANLARI.filter((a) => Object.prototype.hasOwnProperty.call(dogrulanmis, a));
  if (ofsOwnAlanlar.length > 0 && ofsOwnAlanlar.length < 3) {
    throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', 'yeni_o/yeni_f/yeni_s üçü de dokunulmuş (own property) olmalı veya hiçbiri dokunulmamış olmalı.');
  }
  if (ofsOwnAlanlar.length === 3 && !_dofOfsUclusuGecerliMi(dogrulanmis.yeni_o, dogrulanmis.yeni_f, dogrulanmis.yeni_s)) {
    throw new DofImportHatasi('GECERSIZ_TAKIP_TASLAGI', 'yeni_o/yeni_f/yeni_s üçlü olarak (hepsi dolu veya hepsi boş) olmalı.');
  }
  return dogrulanmis;
}

/** Kanonik replay-v2 DÖF kayıtları + izinli takip taslaklarından Desktop'ın
 * gerçek replay-v2 dönüş belgesini (`{paketUuid, dofKontrolleri:[...]}`)
 * üretir. SALT-OKUNUR -- IndexedDB'ye hiçbir `put/add/delete/clear` çağrısı
 * yapmaz, `submissionUuid` ÜRETMEZ (yalnız `girdiler`'den alır), ZIP/Blob/
 * dosya indirme/UI kullanmaz. Aynı DB durumu + aynı `girdiler` için
 * deterministik sonuç üretir (rastgele/zaman-bağımlı değer yoktur --
 * `submissionUuid` dışında hiçbir yeni kimlik üretilmez). Kayıt sırası
 * `girdiler` sırasıyla birebir aynıdır. Herhangi bir girdi/kayıt geçersizse
 * TÜM çağrı reddedilir (atomik) -- kısmi belge asla dönmez. */
async function dofDonusBelgesiOlustur(girdiler) {
  const dogrulanmisGirdiler = _dofDonusGirdiDogrula(girdiler);
  const kayitlar = await _dofKanonikKayitlariOku(dogrulanmisGirdiler.map((g) => g.dofUuid));

  const dofKontrolleri = [];
  let ortakPaketUuid = null;

  for (let i = 0; i < dogrulanmisGirdiler.length; i++) {
    const { dofUuid, submissionUuid } = dogrulanmisGirdiler[i];
    const kayit = kayitlar[i];
    if (!kayit) {
      throw new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
    }
    if (!_dofKanonikMi(kayit)) {
      throw new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
    }
    if (ortakPaketUuid === null) {
      ortakPaketUuid = kayit.paketUuid;
    } else if (kayit.paketUuid !== ortakPaketUuid) {
      throw new DofImportHatasi('KARISIK_EXPORT_PAKETI', `Farklı export paketlerinden gelen DÖF kayıtları tek dönüş belgesinde birleştirilemez: ${dofUuid}`);
    }

    if (!kayit.takipTaslagi || typeof kayit.takipTaslagi !== 'object') {
      throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı yok: ${dofUuid}`);
    }
    const taslak = _dofTaslakSavunmaciDogrula(kayit.takipTaslagi);
    // Sparse own-property mapping (4B-1): yalnız kullanıcının gerçekten
    // dokunduğu alanlar belgeye girer -- explicit null (temizleme talebi)
    // DAHİL. Hiç dokunulmamış alan (own-property değil) belgeye GİRMEZ.
    const dokunulanAlanlar = _DOF_TAKIP_ALANLARI.filter((alan) => Object.prototype.hasOwnProperty.call(taslak, alan));
    if (dokunulanAlanlar.length === 0) {
      throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı boş (hiçbir alana dokunulmamış): ${dofUuid}`);
    }

    // `dofId` bilerek YOK -- Desktop importer okumaz/doğrulamaz/beklemez
    // (bkz. bölüm başındaki sözleşme notu).
    const kayitBelgesi = {
      dofUuid: kayit.dofUuid,
      exportUuid: kayit.exportUuid,
      baseStateHash: kayit.baseStateHash,
      aktifTurSirasi: kayit.aktifTurSirasi,
      replayVersion: kayit.replayVersion,
      submissionUuid,
    };
    for (const alan of dokunulanAlanlar) {
      kayitBelgesi[alan] = taslak[alan];
    }
    dofKontrolleri.push(kayitBelgesi);
  }

  return { paketUuid: ortakPaketUuid, dofKontrolleri };
}

/** `dofDonusBelgesiOlustur`'un ürettiği belgeyi UTF-8 JSON metnine
 * dönüştürür (mevcut proje stiliyle uyumlu, `zipYaz`'daki `denetimler.json`
 * ile aynı pretty-print biçimi: `JSON.stringify(belge, null, 2)`). BOM
 * eklemez. Aynı girdiler + aynı DB durumu için birebir aynı metni üretir. */
async function dofDonusJsonOlustur(girdiler) {
  const belge = await dofDonusBelgesiOlustur(girdiler);
  return JSON.stringify(belge, null, 2);
}

// ─── DÖF REPLAY HAZIRLIK KİMLİĞİ (PWA Commit 4C) ────────────────
// `submissionUuid` yaşam döngüsü: aynı takip taslağı için AYNI submission
// kimliği korunur (Desktop `submission_uuid` global-unique idempotency
// koruması bozulmaz -- aynı taslağın tekrar denenen ZIP hazırlığı yeni
// submission ÜRETMEZ), taslak anlamlı biçimde değişirse YENİ UUIDv4
// üretilir. Kimlik, kanonik `dofler` kaydında `replayHazirlik` nested
// metadata alanında saklanır -- imported kimlikler / `takipTaslagi` /
// `taslakGuncellenmeZamani` / `iceAktarilmaZamani` / snapshot alanlarına
// asla dokunulmaz. ZIP/medya/UI bu commit'te YOKTUR.
//
// Taslak parmak izi: sparse `takipTaslagi`'nın KANONİK JSON'unun (izinli
// alanlar alfabetik sırada, yalnız own-property olanlar -- absent ile
// explicit null bu sayede FARKLI serileşir) SHA-256 hex özeti. Girdisinde
// zaman/rastgelelik/locale yoktur -- aynı semantik taslak her zaman aynı
// parmak izini üretir, anahtar sırasından etkilenmez.

/** Sparse (doğrulanmış) taslağın kanonik JSON metni: yalnız own-property
 * izinli alanlar, alfabetik anahtar sırası. `{}` !== `{"sorumlu":null}` --
 * absent/null ayrımı korunur. */
function _dofTaslakKanonikJson(taslak) {
  const sirali = {};
  for (const alan of [..._DOF_TAKIP_ALANLARI].sort()) {
    if (Object.prototype.hasOwnProperty.call(taslak, alan)) sirali[alan] = taslak[alan];
  }
  return JSON.stringify(sirali);
}

/** Web Crypto ile SHA-256 (lowercase hex). Deterministik. */
async function _dofSha256Hex(metin) {
  const ozet = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(metin));
  return Array.from(new Uint8Array(ozet)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kaydı okuyup kanoniklik + taslak doğrulaması yapar (ortak ön kontrol).
 * Geçerliyse `{ kayit, taslak, kanonikJson }` döner. */
function _dofHazirlikKayitDogrula(kayit, dofUuid) {
  if (!kayit) {
    throw new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
  }
  if (!_dofKanonikMi(kayit)) {
    throw new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
  }
  if (!kayit.takipTaslagi || typeof kayit.takipTaslagi !== 'object') {
    throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı yok: ${dofUuid}`);
  }
  const taslak = _dofTaslakSavunmaciDogrula(kayit.takipTaslagi);
  const dokunulan = _DOF_TAKIP_ALANLARI.some((alan) => Object.prototype.hasOwnProperty.call(taslak, alan));
  if (!dokunulan) {
    throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı boş (hiçbir alana dokunulmamış): ${dofUuid}`);
  }
  return { kayit, taslak, kanonikJson: _dofTaslakKanonikJson(taslak) };
}

/** Kanonik bir DÖF kaydının replay hazırlık metadata'sını okur (salt-
 * okunur). Hazırlık yoksa `replayHazirlik: null` döner; varsa bağımsız
 * kopya döner (mutasyonu DB'yi etkilemez). */
async function dofReplayHazirlikGetir(dofUuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readonly');
    const getReq = tx.objectStore('dofler').get(dofUuid);
    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        reject(new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`));
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        reject(new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`));
        return;
      }
      const h = kayit.replayHazirlik;
      resolve({ dofUuid, replayHazirlik: h ? { ...h } : null });
    };
    getReq.onerror = () => {
      reject(new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`));
    };
  });
}

/** Replay hazırlığını oluşturur/korur/yeniler:
 * - hazırlık yoksa yeni UUIDv4 `submissionUuid` üretir (`durum:'olusturuldu'`),
 * - mevcut hazırlığın parmak izi güncel taslakla AYNI ise hiçbir yazma
 *   yapmadan mevcut kimliği aynen döndürür (`durum:'degismedi'` --
 *   `guncellenmeZamani` DEĞİŞMEZ),
 * - taslak parmak izi değişmişse YENİ UUIDv4 üretir (`durum:'yenilendi'`,
 *   `olusturulmaZamani` korunur, `guncellenmeZamani` güncellenir).
 * UUIDv4 üretimi YALNIZ bu fonksiyondadır (`dofDonusBelgesiOlustur` hâlâ
 * üretmez, yalnız dışarıdan alır).
 *
 * SHA-256 (Web Crypto) async olduğundan ve IndexedDB transaction'ları
 * bekleyen istek kalmayınca otomatik kapandığından, parmak izi asıl
 * `readwrite` transaction AÇILMADAN ÖNCE hesaplanır; transaction içinde
 * kayıt yeniden okunur ve kanonik JSON'un hâlâ aynı olduğu senkron
 * doğrulanır (eşzamanlı değişiklik varsa yazmadan reddedilir) -- yetkili
 * read-modify-write tek transaction içindedir, kısmi yazma olamaz. */
async function dofReplayHazirlikHazirla(dofUuid) {
  // Ön aşama (tx dışı): oku + doğrula + parmak izini hesapla.
  const onKayit = await new Promise((resolve, reject) => {
    openDB().then((db) => {
      const getReq = db.transaction('dofler', 'readonly').objectStore('dofler').get(dofUuid);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`));
    }, reject);
  });
  const onDogrulama = _dofHazirlikKayitDogrula(onKayit, dofUuid);   // DOF_BULUNAMADI/KANONIK_DOF_DEGIL/taslak hataları burada
  const parmakIzi = await _dofSha256Hex(onDogrulama.kanonikJson);

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const getReq = store.get(dofUuid);
    let sonucDegeri = null;
    let hata = null;

    getReq.onsuccess = () => {
      let dogrulama;
      try {
        dogrulama = _dofHazirlikKayitDogrula(getReq.result, dofUuid);
      } catch (e) {
        hata = e;
        tx.abort();
        return;
      }
      const { kayit, kanonikJson } = dogrulama;
      if (kanonikJson !== onDogrulama.kanonikJson) {
        // Ön aşama ile transaction arasında taslak değişti (tek kullanıcılı
        // uygulamada pratikte imkânsız) -- kısmi/yanlış yazmaktansa reddet.
        hata = new DofImportHatasi('VERITABANI_HATASI', `Hazırlık sırasında takip taslağı eşzamanlı değişti, yeniden deneyin: ${dofUuid}`);
        tx.abort();
        return;
      }

      const mevcut = kayit.replayHazirlik;
      if (mevcut && mevcut.taslakParmakIzi === parmakIzi) {
        // Aynı taslak -> aynı submission kimliği, HİÇBİR yazma yok.
        sonucDegeri = { durum: 'degismedi', dofUuid, replayHazirlik: { ...mevcut } };
        return;
      }

      const simdi = new Date().toISOString();
      const yeniHazirlik = {
        submissionUuid: crypto.randomUUID(),   // yalnız burada üretilir
        taslakParmakIzi: parmakIzi,
        olusturulmaZamani: mevcut ? mevcut.olusturulmaZamani : simdi,
        guncellenmeZamani: simdi,
      };
      store.put({ ...kayit, replayHazirlik: yeniHazirlik });
      sonucDegeri = { durum: mevcut ? 'yenilendi' : 'olusturuldu', dofUuid, replayHazirlik: { ...yeniHazirlik } };
    };
    getReq.onerror = () => {
      hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
      tx.abort();
    };

    tx.oncomplete = () => {
      if (hata) return;
      resolve(sonucDegeri);
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

/** Yalnız `replayHazirlik` metadata'sını kaldırır -- `takipTaslagi`,
 * imported kimlikler ve diğer tüm alanlar birebir korunur. Hazırlık zaten
 * yoksa idempotent no-op'tur (`put` çağrılmaz). Kanonik olmayan kayıtları
 * reddeder. */
async function dofReplayHazirlikTemizle(dofUuid) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('dofler', 'readwrite');
    const store = tx.objectStore('dofler');
    const getReq = store.get(dofUuid);
    let sonucDegeri = null;
    let hata = null;

    getReq.onsuccess = () => {
      const kayit = getReq.result;
      if (!kayit) {
        hata = new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
        tx.abort();
        return;
      }
      if (!_dofKanonikMi(kayit)) {
        hata = new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
        tx.abort();
        return;
      }
      if (kayit.replayHazirlik === undefined) {
        sonucDegeri = { durum: 'degismedi', dofUuid };
        return; // idempotent no-op -- put yok
      }
      const { replayHazirlik, ...kalanKayit } = kayit;
      store.put(kalanKayit);
      sonucDegeri = { durum: 'temizlendi', dofUuid };
    };
    getReq.onerror = () => {
      hata = new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`);
      tx.abort();
    };

    tx.oncomplete = () => {
      if (hata) return;
      resolve(sonucDegeri);
    };
    tx.onerror = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction hatası'));
    };
    tx.onabort = () => {
      reject(hata || new DofImportHatasi('VERITABANI_HATASI', (tx.error && tx.error.message) || 'transaction abort edildi'));
    };
  });
}

/** Hazırlığı yapılmış DÖF'ler için `dofDonusBelgesiOlustur` girdi dizisini
 * (`[{dofUuid, submissionUuid}]`) üretir -- SALT-OKUNUR, DB'ye yazmaz,
 * UUID üretmez. Sıra, girdi listesi sırasıyla birebir aynıdır. Hazırlığı
 * olmayan kayıt için `REPLAY_HAZIRLIK_YOK` fırlatır. */
async function dofDonusGirdileriHazirla(dofUuidListesi) {
  if (!Array.isArray(dofUuidListesi) || dofUuidListesi.length === 0) {
    throw new DofImportHatasi('GECERSIZ_GIRDI', 'dofUuidListesi boş olmayan bir dizi olmalı.');
  }
  for (let i = 0; i < dofUuidListesi.length; i++) {
    if (!_dofGecerliUuidMi(dofUuidListesi[i])) {
      throw new DofImportHatasi('GECERSIZ_GIRDI', `dofUuidListesi[${i}] geçerli bir UUID değil.`);
    }
  }
  const kayitlar = await _dofKanonikKayitlariOku(dofUuidListesi);
  return dofUuidListesi.map((dofUuid, i) => {
    const kayit = kayitlar[i];
    if (!kayit) {
      throw new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
    }
    if (!_dofKanonikMi(kayit)) {
      throw new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
    }
    if (!kayit.replayHazirlik || typeof kayit.replayHazirlik.submissionUuid !== 'string') {
      throw new DofImportHatasi('REPLAY_HAZIRLIK_YOK', `dofUuid için replay hazırlığı yapılmamış (önce dofReplayHazirlikHazirla çağrılmalı): ${dofUuid}`);
    }
    return { dofUuid, submissionUuid: kayit.replayHazirlik.submissionUuid };
  });
}

// ─── DÖF REPLAY ZIP ÜRETİMİ (PWA Commit 4D, medyasız) ───────────
// Kanonik zincir: dofler kaydı -> takipTaslagi -> replayHazirlik.
// submissionUuid -> dof_donus.json -> ZIP. Mevcut `zipYaz` (store-only,
// harici kütüphanesiz) DEĞİŞTİRİLMEDEN kullanılır. ZIP'te tek entry
// vardır: `dof_donus.json` (Desktop `_replay_json_adaylari` öncelik-0
// adı). Otomatik indirme/UI/medya YOKTUR; fonksiyon test edilebilir bir
// Blob döndürür. IndexedDB'ye HİÇBİR yazma yapılmaz, submission UUID
// ÜRETİLMEZ (hazırlık üretimi Commit 4C'nin sorumluluğudur -- hazırlık
// yoksa/eskiyse ZIP reddedilir, otomatik oluşturma/yenileme YAPILMAZ).
// Not: `zipYaz` DOS zaman damgası yazdığından ZIP BYTE çıktısı çağrılar
// arasında farklı olabilir -- deterministik olan, içindeki
// `dof_donus.json` METNİDİR (testle kilitlendi).

/** Medyasız replay ZIP paketi üretir. Her seçili DÖF için:
 * 1) mevcut `replayHazirlik.submissionUuid` kullanılır (yoksa
 *    `REPLAY_HAZIRLIK_YOK`),
 * 2) güncel `takipTaslagi` parmak izi hazırlıktakiyle karşılaştırılır --
 *    farklıysa `REPLAY_HAZIRLIK_ESKI` (eski submission kimliği eski
 *    içeriğe aittir; önce `dofReplayHazirlikHazirla` yeniden çalışmalı),
 * 3) `dofDonusBelgesiOlustur` zinciriyle kanonik belge üretilir
 *    (duplicate/karışık paket/bozuk taslak retleri orada),
 * 4) `zipYaz` ile tek entry'li (`dof_donus.json`) ZIP Blob'u yazılır.
 * Başarıda `{ zipBlob, dosyaAdi, dofSayisi, paketUuid }` döner. */
async function dofReplayZipOlustur(dofUuidListesi) {
  // Girdi doğrulama + hazırlık varlığı (GECERSIZ_GIRDI/DOF_BULUNAMADI/
  // KANONIK_DOF_DEGIL/REPLAY_HAZIRLIK_YOK) -- salt-okunur.
  const girdiler = await dofDonusGirdileriHazirla(dofUuidListesi);

  // Eskilik kontrolü: güncel taslağın SHA-256 parmak izi, hazırlıkta
  // saklanan parmak iziyle birebir aynı olmalı. (Taslak burada savunmacı
  // olarak da doğrulanır -- bozuk taslak GECERSIZ_TAKIP_TASLAGI verir.)
  const kayitlar = await _dofKanonikKayitlariOku(dofUuidListesi);
  for (let i = 0; i < dofUuidListesi.length; i++) {
    const dofUuid = dofUuidListesi[i];
    const kayit = kayitlar[i];
    const dogrulama = _dofHazirlikKayitDogrula(kayit, dofUuid);
    if (!kayit.replayHazirlik || typeof kayit.replayHazirlik.taslakParmakIzi !== 'string') {
      throw new DofImportHatasi('REPLAY_HAZIRLIK_YOK', `dofUuid için replay hazırlığı yapılmamış: ${dofUuid}`);
    }
    const guncelParmakIzi = await _dofSha256Hex(dogrulama.kanonikJson);
    if (guncelParmakIzi !== kayit.replayHazirlik.taslakParmakIzi) {
      throw new DofImportHatasi('REPLAY_HAZIRLIK_ESKI', `Takip taslağı hazırlıktan sonra değişmiş -- önce dofReplayHazirlikHazirla yeniden çağrılmalı: ${dofUuid}`);
    }
  }

  // Kanonik belge + JSON metni (dofDonusJsonOlustur ile AYNI biçim:
  // JSON.stringify(belge, null, 2) -- aynı DB durumu için birebir aynı).
  const belge = await dofDonusBelgesiOlustur(girdiler);
  const jsonMetni = JSON.stringify(belge, null, 2);
  if (typeof belge.paketUuid !== 'string' || belge.paketUuid.length === 0) {
    throw new DofImportHatasi('ZIP_URETIM_HATASI', 'Belge paketUuid içermiyor -- dosya adı üretilemez.');
  }

  let zipBlob;
  try {
    zipBlob = await zipYaz([{ ad: 'dof_donus.json', veri: jsonMetni }]);
  } catch (e) {
    throw new DofImportHatasi('ZIP_URETIM_HATASI', `ZIP üretimi başarısız: ${e && e.message}`);
  }

  return {
    zipBlob,
    // paketUuid kanonik import doğrulamasından geçmiş bir UUID metnidir
    // (kullanıcı girdisi değildir) -- path ayracı/tehlikeli karakter içermez.
    dosyaAdi: `dof_replay_${belge.paketUuid}.zip`,
    dofSayisi: belge.dofKontrolleri.length,
    paketUuid: belge.paketUuid,
  };
}

// Test/kullanım için global erişim -- aynı sınırlı namespace genişletildi.
if (typeof window !== 'undefined') {
  window._dofImport = {
    dofPaketiIceriAktar, DofImportHatasi,
    dofTakipTaslagiGetir, dofTakipTaslagiGuncelle, dofTakipTaslagiTemizle,
    dofReviewStatusGetir, dofReviewStatusGuncelle,
    dofDonusBelgesiOlustur, dofDonusJsonOlustur,
    dofReplayHazirlikGetir, dofReplayHazirlikHazirla, dofReplayHazirlikTemizle,
    dofDonusGirdileriHazirla, dofReplayZipOlustur,
  };
}

// ─── RESİM SIKIŞTIRMA (değişmedi — v0.4'te test edilip doğrulandı) ──
const RESIM_SIKISTIRMA = {
  maxKenar:  1920,
  kalite:    0.80,
  format:    'image/jpeg',
  atlaEsigi: 300 * 1024,
  maksGirdi: 50 * 1024 * 1024
};

function boyutBiçimle(bytes) {
  if (!bytes && bytes !== 0) return '?';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function hedefOlculeriHesapla(w, h, maxKenar) {
  if (!w || !h) return { w: 0, h: 0 };
  const enUzun = Math.max(w, h);
  if (enUzun <= maxKenar) return { w: Math.round(w), h: Math.round(h) };
  const oran = maxKenar / enUzun;
  return { w: Math.round(w * oran), h: Math.round(h * oran) };
}

function kaynakBoyutu(kaynak) {
  if (!kaynak) return 0;
  if (typeof kaynak.size === 'number') return kaynak.size;
  if (typeof kaynak === 'string' && kaynak.startsWith('data:')) {
    const virgul = kaynak.indexOf(',');
    const b64 = virgul >= 0 ? kaynak.slice(virgul + 1) : kaynak;
    return Math.round(b64.length * 3 / 4);
  }
  return 0;
}

function _resmiYukle(kaynak) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url = null;
    img.onload = () => { if (url) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => {
      if (url) URL.revokeObjectURL(url);
      reject(new Error('Görsel çözümlenemedi (desteklenmeyen format olabilir).'));
    };
    if (typeof kaynak === 'string') {
      img.src = kaynak;
    } else if (kaynak instanceof Blob) {
      url = URL.createObjectURL(kaynak);
      img.src = url;
    } else {
      reject(new Error('Desteklenmeyen görsel kaynağı türü.'));
    }
  });
}

async function compressImage(kaynak, secenek = {}) {
  const cfg = {
    maxKenar: secenek.maxKenar ?? RESIM_SIKISTIRMA.maxKenar,
    kalite:   secenek.kalite   ?? RESIM_SIKISTIRMA.kalite,
    format:   secenek.format   ?? RESIM_SIKISTIRMA.format
  };
  const orijinalBoyut = kaynakBoyutu(kaynak);

  if (orijinalBoyut > RESIM_SIKISTIRMA.maksGirdi) {
    console.warn(`[sıkıştırma] Dosya çok büyük (${boyutBiçimle(orijinalBoyut)}), ` +
                 `sınır ${boyutBiçimle(RESIM_SIKISTIRMA.maksGirdi)}. Orijinal kullanılıyor.`);
    return _orijinaleDon(kaynak, orijinalBoyut);
  }

  try {
    const img = await _resmiYukle(kaynak);
    const { w, h } = hedefOlculeriHesapla(img.naturalWidth || img.width,
                                          img.naturalHeight || img.height,
                                          cfg.maxKenar);
    if (!w || !h) throw new Error('Görsel boyutları okunamadı.');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL(cfg.format, cfg.kalite);
    const blob = await new Promise(res =>
      canvas.toBlob(b => res(b), cfg.format, cfg.kalite)
    );
    const sikistirilmisBoyut = blob ? blob.size : kaynakBoyutu(dataUrl);

    console.log(`[sıkıştırma] ${img.naturalWidth}x${img.naturalHeight} → ${w}x${h} | ` +
                `${boyutBiçimle(orijinalBoyut)} → ${boyutBiçimle(sikistirilmisBoyut)} ` +
                `(kalite ${cfg.kalite})`);

    if (orijinalBoyut > 0 && sikistirilmisBoyut >= orijinalBoyut) {
      console.log('[sıkıştırma] Sonuç orijinalden küçük değil; orijinal korunuyor.');
      return _orijinaleDon(kaynak, orijinalBoyut, dataUrl, w, h);
    }

    return {
      blob: blob || null,
      dataUrl,
      orijinalBoyut,
      sikistirilmisBoyut,
      genislik: w,
      yukseklik: h,
      sikistirildi: true
    };
  } catch (e) {
    console.warn('[sıkıştırma] Başarısız, orijinal kullanılıyor:', e.message);
    return _orijinaleDon(kaynak, orijinalBoyut);
  }
}

async function _orijinaleDon(kaynak, boyut, dataUrl = null, w = 0, h = 0) {
  let blob = null;
  let url = dataUrl;
  try {
    if (kaynak instanceof Blob) {
      blob = kaynak;
      if (!url) url = await _blobToDataURL(kaynak);
    } else if (typeof kaynak === 'string') {
      url = url || kaynak;
    }
  } catch (_) { /* yok say */ }
  return {
    blob,
    dataUrl: url,
    orijinalBoyut: boyut,
    sikistirilmisBoyut: boyut,
    genislik: w,
    yukseklik: h,
    sikistirildi: false
  };
}

function _blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Blob okunamadı.'));
    fr.readAsDataURL(blob);
  });
}

if (typeof window !== 'undefined') {
  window.compressImage = compressImage;
  window.hedefOlculeriHesapla = hedefOlculeriHesapla;
  window.boyutBiçimle = boyutBiçimle;
}

// ─── DAHİLİ ZIP YAZICI (harici kütüphane YOK — store/no-compress) ───
// Gerekçe: fotoğraflar zaten JPEG (sıkıştırılmış); tekrar deflate etmek
// kazanç sağlamaz ama CDN bağımlılığı riski ekler (offline saha ortamı).
function _crc32Tablosu() {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
}
const _CRC_TABLO = _crc32Tablosu();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = _CRC_TABLO[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function _dosZamanDamgasi(date = new Date()) {
  const dosTime = ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | ((date.getSeconds() >> 1) & 0x1F);
  const dosDate = (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
  return { dosTime, dosDate };
}

// girdiler: [{ad: string, veri: Uint8Array|Blob|string}]
async function zipYaz(girdiler) {
  const parcalar = [];
  const merkezKayitlari = [];
  let ofset = 0;
  const enc = new TextEncoder();

  for (const g of girdiler) {
    let veri = g.veri;
    if (veri instanceof Blob) veri = new Uint8Array(await veri.arrayBuffer());
    else if (!(veri instanceof Uint8Array)) veri = enc.encode(String(veri));

    const adBytes = enc.encode(g.ad);
    const crc = crc32(veri);
    const { dosTime, dosDate } = _dosZamanDamgasi();

    const yerelBaslik = new DataView(new ArrayBuffer(30));
    yerelBaslik.setUint32(0, 0x04034b50, true);
    yerelBaslik.setUint16(4, 20, true);
    yerelBaslik.setUint16(6, 0, true);
    yerelBaslik.setUint16(8, 0, true);
    yerelBaslik.setUint16(10, dosTime, true);
    yerelBaslik.setUint16(12, dosDate, true);
    yerelBaslik.setUint32(14, crc, true);
    yerelBaslik.setUint32(18, veri.length, true);
    yerelBaslik.setUint32(22, veri.length, true);
    yerelBaslik.setUint16(26, adBytes.length, true);
    yerelBaslik.setUint16(28, 0, true);

    parcalar.push(new Uint8Array(yerelBaslik.buffer), adBytes, veri);
    merkezKayitlari.push({ adBytes, crc, boyut: veri.length, ofset, dosTime, dosDate });
    ofset += 30 + adBytes.length + veri.length;
  }

  const merkezBaslangic = ofset;
  for (const m of merkezKayitlari) {
    const baslik = new DataView(new ArrayBuffer(46));
    baslik.setUint32(0, 0x02014b50, true);
    baslik.setUint16(4, 20, true);
    baslik.setUint16(6, 20, true);
    baslik.setUint16(8, 0, true);
    baslik.setUint16(10, 0, true);
    baslik.setUint16(12, m.dosTime, true);
    baslik.setUint16(14, m.dosDate, true);
    baslik.setUint32(16, m.crc, true);
    baslik.setUint32(20, m.boyut, true);
    baslik.setUint32(24, m.boyut, true);
    baslik.setUint16(28, m.adBytes.length, true);
    baslik.setUint16(30, 0, true);
    baslik.setUint16(32, 0, true);
    baslik.setUint16(34, 0, true);
    baslik.setUint16(36, 0, true);
    baslik.setUint32(38, 0, true);
    baslik.setUint32(42, m.ofset, true);
    parcalar.push(new Uint8Array(baslik.buffer), m.adBytes);
    ofset += 46 + m.adBytes.length;
  }
  const merkezBoyut = ofset - merkezBaslangic;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, merkezKayitlari.length, true);
  eocd.setUint16(10, merkezKayitlari.length, true);
  eocd.setUint32(12, merkezBoyut, true);
  eocd.setUint32(16, merkezBaslangic, true);
  eocd.setUint16(20, 0, true);
  parcalar.push(new Uint8Array(eocd.buffer));

  return new Blob(parcalar, { type: 'application/zip' });
}
if (typeof window !== 'undefined') window.zipYaz = zipYaz;

// ─── DÖF PAKET IMPORT UI (PWA Commit 4F) ────────────────────────
// Yalnız JSON dosya seçimi desteklenir. ZIP OKUMA bu commit'in kapsamı
// dışında bırakıldı -- mevcut altyapıda yalnız `zipYaz` (YAZICI) var, ZIP
// OKUYUCU yok; yeni bir bağımlılık eklemek yerine kapsam JSON ile
// sınırlandı (bkz. commit raporu -- ayrı bir commit'te ele alınabilir).
// Servis katmanına (`dofPaketiIceriAktar`) HİÇBİR değişiklik yapılmadı --
// bu bölüm yalnız gerçek hata kodlarına Türkçe durum metni eşler.

let _dofImportDevamEdiyor = false;

const _DOF_IMPORT_HATA_METINLERI = {
  GECERSIZ_JSON: 'Geçersiz dosya veya JSON',
  GECERSIZ_PAKET: 'Geçersiz paket',
  DESTEKLENMEYEN_SURUM: 'Geçersiz paket (desteklenmeyen sürüm)',
  DESTEKLENMEYEN_REPLAY_VERSION: 'Geçersiz paket (desteklenmeyen sürüm)',
  EKSIK_KIMLIK: 'Geçersiz paket (eksik kimlik)',
  PAKET_ICI_DUPLICATE: 'Geçersiz paket (yinelenen kayıt)',
  IMPORT_CONFLICT: 'Çakışma var',
  VERITABANI_HATASI: 'Veritabanı hatası',
};

function _dofImportDosyaOku(dosya) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Dosya okunamadı.'));
    fr.readAsText(dosya, 'utf-8');
  });
}

/** Özet satırlarını doldurur/gösterir. `dofPaketiIceriAktar` yalnız
 * `{toplam, eklenen, degismeyen}` döner (atomik -- kısmi başarı YOK) --
 * `cakisan`/`hatali` yalnız BAŞARISIZ tüm-paket denemesini 1 olarak
 * işaretler, servis sözleşmesinde var olmayan bir per-kayıt kırılım
 * UYDURULMAZ. */
function _dofImportOzetGoster({ toplam = 0, eklenen = 0, degismeyen = 0, cakisan = 0, hatali = 0 }) {
  document.getElementById('dof-import-toplam').textContent = String(toplam);
  document.getElementById('dof-import-eklenen').textContent = String(eklenen);
  document.getElementById('dof-import-degismeyen').textContent = String(degismeyen);
  document.getElementById('dof-import-cakisan').textContent = String(cakisan);
  document.getElementById('dof-import-hatali').textContent = String(hatali);
  document.getElementById('dof-import-ozet').style.display = 'block';
}

/** Dosya seçme input'unun `onchange` işleyicisi. Dosyayı metin olarak
 * okur, gerçek `dofPaketiIceriAktar` servisine (değiştirilmeden) verir,
 * sonucu/hatayı kullanıcıya gösterir. Çift tetiklemeye karşı korumalı
 * (`_dofImportDevamEdiyor` bayrağı + buton/input geçici disable). Ham
 * JSON içeriği ekranda gösterilmez, localStorage/sessionStorage'a
 * yazılmaz. */
async function _dofPaketDosyaSecildi(input) {
  const dosya = input.files && input.files[0];
  if (!dosya) return;
  if (_dofImportDevamEdiyor) return;   // çift tetikleme koruması
  _dofImportDevamEdiyor = true;

  const btn = document.getElementById('dof-import-btn');
  const durum = document.getElementById('dof-import-durum');
  const dosyaAdiEl = document.getElementById('dof-import-dosya-adi');
  btn.disabled = true;
  input.disabled = true;
  dosyaAdiEl.textContent = dosya.name;
  durum.textContent = 'İçe aktarılıyor...';
  document.getElementById('dof-import-ozet').style.display = 'none';

  try {
    const metin = await _dofImportDosyaOku(dosya);
    const sonuc = await dofPaketiIceriAktar(metin);
    const zatenVardi = sonuc.toplam > 0 && sonuc.eklenen === 0 && sonuc.degismeyen === sonuc.toplam;
    durum.textContent = zatenVardi ? 'Paket zaten içe aktarılmış' : 'İçe aktarma tamamlandı';
    _dofImportOzetGoster(sonuc);
  } catch (e) {
    const kod = e && e.kod;
    durum.textContent = (kod && _DOF_IMPORT_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
    _dofImportOzetGoster(kod === 'IMPORT_CONFLICT' ? { cakisan: 1 } : { hatali: 1 });
  } finally {
    _dofImportDevamEdiyor = false;
    btn.disabled = false;
    input.disabled = false;
    input.value = '';   // aynı dosyanın tekrar seçilebilmesi için
    // Sonuç ne olursa olsun (başarı/duplicate/conflict/geçersiz) listeyi
    // GERÇEK DB durumundan yeniden yükle -- bu, "conflict/invalid import
    // sonrası liste bozulmaz" garantisini AYRI bir dallanma yazmadan,
    // doğrudan DB'nin kendisinden doğrular.
    _dofListesiYukle();
  }
}

if (typeof window !== 'undefined') {
  window._dofPaketDosyaSecildi = _dofPaketDosyaSecildi;
}

// ─── DÖF LİSTE / DETAY (PWA Commit 4G) ──────────────────────────
// Yalnız OKUNUR görünüm -- düzenleme/replay hazırlık/ZIP/medya UI'ı
// YOKTUR (sonraki commit'lerin kapsamı). Yalnız kanonik replay-v2
// kayıtlar (`_dofKanonikMi`) listelenir -- legacy/WIP kayıtlar hiç
// gösterilmez, değiştirilmez, silinmez.

let _dofListeKayitlari = [];
let _dofListeSeciliId = null;

/** UUID'yi sahada okunabilir kısa hale getirir (ilk 8 hane + …). */
function _dofKisaUuid(uuid) {
  return (typeof uuid === 'string' && uuid.length > 8) ? `${uuid.slice(0, 8)}…` : 'Bilgi yok';
}

/** null/undefined/boş string için tutarlı fallback -- eksik alanlarda
 * uygulama kırılmaz, kısa "Bilgi yok" gösterilir. */
function _dofDeger(deger, yerTutucu = 'Bilgi yok') {
  return (deger === null || deger === undefined || deger === '') ? yerTutucu : deger;
}

// Takip taslağı yalnız OKUNUR özet için -- input/textarea/select YOK.
const _DOF_TAKIP_ETIKETLERI = {
  planlanan_tarih: 'Planlanan Tarih',
  sorumlu: 'Sorumlu',
  gerceklesen_faaliyet: 'Gerçekleşen Faaliyet',
  etkinlik_kontrol_tarihi: 'Etkinlik Kontrol Tarihi',
  gozlem_degerlendirme: 'Gözlem/Değerlendirme',
  yeni_o: 'Yeni O',
  yeni_f: 'Yeni F',
  yeni_s: 'Yeni S',
};

/** DÖF listesini IndexedDB'den (yeniden) yükler ve render eder. Sayfa
 * açılışında ve her import denemesi (başarı/duplicate/conflict/geçersiz)
 * sonrasında çağrılır -- her seferinde GERÇEK DB durumunu yansıtır. */
async function _dofListesiYukle() {
  const durumEl = document.getElementById('dof-liste-durum');
  const listeEl = document.getElementById('dof-liste');
  if (!durumEl || !listeEl) return;   // DÖF kartı DOM'da yoksa sessizce çık
  durumEl.textContent = 'DÖF listesi yükleniyor...';

  let tumKayitlar;
  try {
    tumKayitlar = await dbTumu('dofler');
  } catch (e) {
    durumEl.textContent = 'DÖF detayı yüklenemedi.';
    listeEl.innerHTML = '';
    return;
  }

  _dofListeKayitlari = tumKayitlar
    .filter((k) => _dofKanonikMi(k))
    .sort((a, b) => (a.dofId ?? 0) - (b.dofId ?? 0));

  if (_dofListeKayitlari.length === 0) {
    durumEl.textContent = 'Henüz içe aktarılmış DÖF yok.';
    listeEl.innerHTML = '';
    _dofListeSeciliId = null;
    _dofDetayGoster(null);
    await _dofReviewDurumYukle(null);
    await _dofTakipFormYukle(null);
    await _dofReplayBolumYukle(null);
    return;
  }

  durumEl.textContent = '';
  if (_dofListeSeciliId && !_dofListeKayitlari.some((k) => k.id === _dofListeSeciliId)) {
    _dofListeSeciliId = null;   // seçili kayıt artık listede yok (ör. legacy'e dönüşmedi ama olası durum)
  }
  listeEl.innerHTML = _dofListeKayitlari.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(_dofListeSeciliId);
  await _dofReviewDurumYukle(_dofListeSeciliId);
  await _dofTakipFormYukle(_dofListeSeciliId);
  await _dofReplayBolumYukle(_dofListeSeciliId);
}

function _dofListeKartHtml(k) {
  const secili = k.id === _dofListeSeciliId;
  const konum = _dofDeger([k.kat, k.oda].filter((v) => v).join(' / ') || null);
  const risk = k.riskDuzeyi ? `${k.riskDuzeyi}${k.r !== null && k.r !== undefined ? ` (R=${k.r})` : ''}` : 'Bilgi yok';
  return `
    <button type="button" class="dof-liste-karti" data-dof-id="${_escAttr(k.id)}"
      onclick="_dofDetaySec('${_escAttr(k.id)}')"
      style="display:block; width:100%; text-align:left; margin-bottom:8px; padding:12px; border-radius:8px; cursor:pointer;
             border:2px solid ${secili ? 'var(--accent)' : '#eee'}; background:${secili ? '#eaf4fc' : 'white'};">
      <div style="font-weight:700;">${_esc(_dofDeger(k.bulguKodu))} <span style="font-weight:400; color:#666;">(Tehlike No: ${_esc(_dofDeger(k.tehlikeNo))})</span></div>
      <div style="font-size:0.85rem; color:#666; margin-top:4px;">${_esc(risk)} · ${_esc(konum)} · Tur: ${_esc(_dofDeger(k.aktifTurSirasi))}</div>
      <div style="font-size:0.85rem; margin-top:4px;">${_esc(_dofDeger(k.tehlikeTanimi))}</div>
    </button>`;
}

/** Liste kartına tıklanınca/klavyeyle etkinleştirilince çağrılır --
 * seçimi günceller, listeyi (seçili görünüm için) ve detayı yeniden çizer. */
function _dofDetaySec(dofId) {
  _dofListeSeciliId = dofId;
  const listeEl = document.getElementById('dof-liste');
  if (listeEl) listeEl.innerHTML = _dofListeKayitlari.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(dofId);
  _dofReviewDurumYukle(dofId);
  _dofTakipFormYukle(dofId);
  _dofReplayBolumYukle(dofId);
}

function _dofDetayGoster(dofId) {
  const kart = document.getElementById('dof-detay-kart');
  const el = document.getElementById('dof-detay');
  if (!kart || !el) return;
  if (!dofId) {
    kart.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const k = _dofListeKayitlari.find((x) => x.id === dofId);
  if (!k) {
    kart.style.display = 'block';
    el.innerHTML = '<p>DÖF detayı yüklenemedi.</p>';
    return;
  }
  kart.style.display = 'block';

  let taslakHtml = '';
  if (k.takipTaslagi && typeof k.takipTaslagi === 'object') {
    const dokunulanlar = Object.keys(k.takipTaslagi).filter((alan) => _DOF_TAKIP_ETIKETLERI[alan]);
    if (dokunulanlar.length > 0) {
      taslakHtml = `<h3 style="margin-top:15px; font-size:1rem;">Takip Taslağı (okunur)</h3>` +
        dokunulanlar.map((alan) => `<div><strong>${_esc(_DOF_TAKIP_ETIKETLERI[alan])}:</strong> ${_esc(_dofDeger(k.takipTaslagi[alan]))}</div>`).join('');
    }
  }

  const konum = _dofDeger([k.kat, k.oda, k.alanTipi].filter((v) => v).join(' / ') || null);
  el.innerHTML = `
    <div><strong>DÖF UUID:</strong> ${_esc(_dofKisaUuid(k.dofUuid))}</div>
    <div><strong>Export UUID:</strong> ${_esc(_dofKisaUuid(k.exportUuid))}</div>
    <div><strong>Paket UUID:</strong> ${_esc(_dofKisaUuid(k.paketUuid))}</div>
    <div><strong>Aktif Tur:</strong> ${_esc(_dofDeger(k.aktifTurSirasi))}</div>
    <div><strong>Risk Düzeyi:</strong> ${_esc(_dofDeger(k.riskDuzeyi))}</div>
    <div><strong>R Değeri:</strong> ${_esc(_dofDeger(k.r))}</div>
    <div><strong>Tehlike Tanımı:</strong> ${_esc(_dofDeger(k.tehlikeTanimi))}</div>
    <div><strong>Düzeltici Faaliyet:</strong> ${_esc(_dofDeger(k.duzelticiFaaliyet))}</div>
    <div><strong>Aksiyon Süresi:</strong> ${_esc(_dofDeger(k.aksiyonSuresi))}</div>
    <div><strong>Konum:</strong> ${_esc(konum)}</div>
    <div><strong>İçe Aktarılma Zamanı:</strong> ${_esc(_dofDeger(k.iceAktarilmaZamani))}</div>
    ${taslakHtml}`;
}

if (typeof window !== 'undefined') {
  window._dofDetaySec = _dofDetaySec;
  window._dofListesiYukle = _dofListesiYukle;
}

// ─── DÖF İNCELEME DURUMU UI (PWA Commit 4N) ─────────────────────
// `#dof-review-durum-kart` -- `#dof-detay-kart`'tan TAMAMEN AYRI bir
// kart (mevcut salt-okunur `#dof-detay` testinin -- input/textarea/
// select sayısı 0 -- bozulmaması için kasıtlı). Seçim değişince otomatik
// kaydeder, ayrı bir "Kaydet" butonu YOKTUR (tek-alanlık enum seçici
// için dirty-tracking gereksiz karmaşıklık olurdu). Yalnız `dofReviewStatusGetir`/
// `Guncelle`'yi (yukarıda tanımlı, izole) çağırır -- `dofTakipTaslagiGetir/
// Guncelle` HİÇ çağrılmaz, iki katman birbirine karışmaz.

const _DOF_REVIEW_DURUM_ACIKLAMALARI = {
  kapatma_onerisi: "Kapatma önerisi — final karar Desktop'ta verilir.",
  kapatilamaz: 'Kapatılamaz — uygunsuzluk devam ediyor.',
};

/** Seçili DÖF değiştiğinde (veya liste yenilendiğinde) çağrılır --
 * kartı `dofReviewStatusGetir`'den TAZE değerle doldurur. Yalnız OKUR --
 * ekranın açılması/DÖF seçilmesi TEK BAŞINA hiçbir DB yazması tetiklemez.
 * `dofUuid` yoksa (seçim yok/liste boş) kart gizlenir. Kanonik olmayan/
 * bulunamayan DÖF için kart AÇILMAZ (legacy güvenliği, diğer kartlarla
 * aynı desen). */
async function _dofReviewDurumYukle(dofUuid) {
  const kart = document.getElementById('dof-review-durum-kart');
  if (!kart) return;

  if (!dofUuid) {
    kart.style.display = 'none';
    return;
  }

  const hataEl = document.getElementById('dof-review-durum-hata');
  if (hataEl) hataEl.textContent = '';

  let sonuc;
  try {
    sonuc = await dofReviewStatusGetir(dofUuid);
  } catch (e) {
    kart.style.display = 'none';   // legacy/WIP/bulunamadı -- diğer kartlarla aynı davranış
    return;
  }

  kart.style.display = 'block';
  const secici = document.getElementById('dof-review-durum-secici');
  if (secici) secici.value = sonuc.reviewStatus;
  _dofReviewDurumAciklamaGuncelle(sonuc.reviewStatus);
}

function _dofReviewDurumAciklamaGuncelle(reviewStatus) {
  const aciklamaEl = document.getElementById('dof-review-durum-aciklama');
  if (aciklamaEl) aciklamaEl.textContent = _DOF_REVIEW_DURUM_ACIKLAMALARI[reviewStatus] || '';
}

/** Seçici (`<select>`) değiştiğinde çağrılır -- kullanıcının GERÇEK
 * seçimini `dofReviewStatusGuncelle` ile kalıcı yazar. Hata durumunda
 * (ör. eş zamanlı legacy'e dönüşüm) görünür bir durum mesajı gösterir,
 * seçiciyi son bilinen geçerli değere geri almaz -- tekrar seçim
 * denemesi kullanıcıya bırakılır (mevcut takip formu hata desenine
 * benzer basitlik). */
async function _dofReviewDurumDegisti() {
  const dofUuid = _dofListeSeciliId;
  const secici = document.getElementById('dof-review-durum-secici');
  const hataEl = document.getElementById('dof-review-durum-hata');
  if (!dofUuid || !secici) return;

  try {
    const sonuc = await dofReviewStatusGuncelle(dofUuid, secici.value);
    if (hataEl) hataEl.textContent = '';
    _dofReviewDurumAciklamaGuncelle(sonuc.reviewStatus);
  } catch (e) {
    if (hataEl) hataEl.textContent = (e && e.message) || 'İnceleme durumu kaydedilemedi.';
  }
}

if (typeof window !== 'undefined') {
  window._dofReviewDurumDegisti = _dofReviewDurumDegisti;
}

// ─── DÖF TAKİP DÜZENLEME (PWA Commit 4H) ─────────────────────────
// Yalnız izinli sekiz takip alanını düzenler -- gerçek servisleri
// (`dofTakipTaslagiGetir`/`Guncelle`/`Temizle`, Commit 4A/4A-1/4A-2)
// DEĞİŞTİRMEDEN çağırır. Replay hazırlık/ZIP/medya UI'ı YOKTUR.
//
// SPARSE absent/null/value semantiği UI TARAFINDA da korunur: form,
// kullanıcının BU oturumda GERÇEKTEN dokunduğu alanları kendi
// `_dofTakipDokunulanAlanlar` kümesiyle izler -- her Kaydet'te tüm 8
// alanı göndermez, yalnız dokunulanları gönderir (dokunulmayan absent
// kalır, temizlenen explicit null olarak gider). `dofTakipTaslagiGetir`
// dış sözleşme gereği HER ZAMAN dolu 8-alanlı gösterim döner (Commit
// 4A-2 notu) -- bu, formu doldururken kullanılır ama dirty-izleme BUNA
// değil, kullanıcının bu oturumdaki GERÇEK etkileşimine dayanır.
//
// O/F/S üçlü kuralı: biri dokunulursa üçü birlikte gönderilir (mevcut
// form değerleriyle) -- kısmi üçlü İSTEMCİ TARAFINDA engellenmez, servisin
// KENDİ (zaten test edilmiş) `_dofOfsUclusuGecerliMi` reddi kullanılır;
// bu, mantığı UI'da tekrarlamaz/çatallaştırmaz (bkz. commit raporu).

let _dofTakipSecliDofUuid = null;
let _dofTakipDokunulanAlanlar = new Set();

const _DOF_TAKIP_ALAN_ELEMENT_ID = {
  planlanan_tarih: 'dof-takip-planlanan-tarih',
  sorumlu: 'dof-takip-sorumlu',
  gerceklesen_faaliyet: 'dof-takip-gerceklesen-faaliyet',
  etkinlik_kontrol_tarihi: 'dof-takip-etkinlik-kontrol-tarihi',
  gozlem_degerlendirme: 'dof-takip-gozlem-degerlendirme',
  yeni_o: 'dof-takip-yeni-o',
  yeni_f: 'dof-takip-yeni-f',
  yeni_s: 'dof-takip-yeni-s',
};
const _DOF_TAKIP_OFS_ALANLARI_UI = ['yeni_o', 'yeni_f', 'yeni_s'];

const _DOF_TAKIP_HATA_METINLERI = {
  GECERSIZ_TAKIP_DEGERI: 'Takip alanlarında geçersiz değer var.',
  GECERSIZ_DEGISIKLIK: 'Takip alanlarında geçersiz değer var.',
  IZINSIZ_TAKIP_ALANI: 'Bu alan düzenlenemez.',
  KANONIK_DOF_DEGIL: 'Bu DÖF kaydı düzenlenemez.',
  DOF_BULUNAMADI: 'DÖF kaydı bulunamadı.',
  VERITABANI_HATASI: 'Veritabanı hatası.',
};

/** Formu verilen taslak değerleriyle doldurur (yalnız GÖRÜNÜM -- dirty
 * izleme burada SIFIRLANIR, bu fonksiyon "temiz" bir başlangıç noktası
 * sayılır). */
function _dofTakipFormaYaz(taslak) {
  document.getElementById('dof-takip-planlanan-tarih').value = taslak.planlanan_tarih || '';
  document.getElementById('dof-takip-sorumlu').value = taslak.sorumlu || '';
  document.getElementById('dof-takip-gerceklesen-faaliyet').value = taslak.gerceklesen_faaliyet || '';
  document.getElementById('dof-takip-etkinlik-kontrol-tarihi').value = taslak.etkinlik_kontrol_tarihi || '';
  document.getElementById('dof-takip-gozlem-degerlendirme').value = taslak.gozlem_degerlendirme || '';
  document.getElementById('dof-takip-yeni-o').value = (taslak.yeni_o ?? '') === '' ? '' : String(taslak.yeni_o);
  document.getElementById('dof-takip-yeni-f').value = (taslak.yeni_f ?? '') === '' ? '' : String(taslak.yeni_f);
  document.getElementById('dof-takip-yeni-s').value = (taslak.yeni_s ?? '') === '' ? '' : String(taslak.yeni_s);
}

/** Bir form alanının GÜNCEL değerini, servisin beklediği tipe (tarih/metin
 * string veya sayı) çevirerek okur. Boş değer -> `null` (temizleme talebi). */
function _dofTakipFormDegerOku(alan) {
  const ham = document.getElementById(_DOF_TAKIP_ALAN_ELEMENT_ID[alan]).value;
  if (ham === '') return null;
  return _DOF_TAKIP_OFS_ALANLARI_UI.includes(alan) ? Number(ham) : ham;
}

/** Kaydet butonunun aktiflik durumunu günceller -- hiçbir alana
 * dokunulmadıysa disabled (gereksiz/no-op kaydı önlemenin ilk katmanı;
 * asıl güvence `_dofTakipKaydet` içindeki boş-küme kontrolüdür). */
function _dofTakipButonDurumGuncelle() {
  const btn = document.getElementById('dof-takip-kaydet-btn');
  if (btn) btn.disabled = _dofTakipDokunulanAlanlar.size === 0;
}

/** Bir form alanı kullanıcı tarafından değiştirildiğinde çağrılır
 * (oninput/onchange). Yalnız BU alanı dokunulmuş işaretler -- diğer
 * alanların absent/value durumunu ETKİLEMEZ. */
function _dofTakipAlanDegisti(alan) {
  _dofTakipDokunulanAlanlar.add(alan);
  _dofTakipButonDurumGuncelle();
}

/** Seçili DÖF değiştiğinde (veya liste yenilendiğinde) çağrılır -- formu
 * `dofTakipTaslagiGetir`'den TAZE değerlerle doldurur, dirty izlemeyi
 * sıfırlar. `dofUuid` yoksa (seçim yok/liste boş) formu gizler. Kanonik
 * olmayan/bulunamayan DÖF için form AÇILMAZ (legacy güvenliği). */
async function _dofTakipFormYukle(dofUuid) {
  const kart = document.getElementById('dof-takip-form-kart');
  if (!kart) return;
  _dofTakipSecliDofUuid = dofUuid;
  _dofTakipDokunulanAlanlar = new Set();

  if (!dofUuid) {
    kart.style.display = 'none';
    return;
  }

  const durum = document.getElementById('dof-takip-durum');
  try {
    const sonuc = await dofTakipTaslagiGetir(dofUuid);
    kart.style.display = 'block';
    durum.textContent = '';
    _dofTakipFormaYaz(sonuc.takipTaslagi);
    _dofTakipButonDurumGuncelle();
  } catch (e) {
    // Legacy/WIP veya bulunamayan kayıt -- form AÇILMAZ (yalnız kanonik
    // DÖF'ler düzenlenebilir). Normal akışta liste zaten yalnız kanonik
    // kayıtları sunduğundan bu dal pratikte savunma amaçlıdır.
    kart.style.display = 'none';
  }
}

/** "Kaydet" -- yalnız BU oturumda dokunulan alanlardan payload kurar
 * (O/F/S'ten biri dokunulduysa üçü birlikte, mevcut form değerleriyle),
 * `dofTakipTaslagiGuncelle`'yi (değiştirilmeden) çağırır. Hiçbir alana
 * dokunulmadıysa servisi HİÇ ÇAĞIRMADAN "Değişiklik yok" gösterir --
 * DB'ye kesinlikle yazma OLMAZ. */
async function _dofTakipKaydet() {
  if (!_dofTakipSecliDofUuid) return;
  const durum = document.getElementById('dof-takip-durum');

  if (_dofTakipDokunulanAlanlar.size === 0) {
    durum.textContent = 'Değişiklik yok.';
    return;
  }

  const gonderilecekAlanlar = new Set(_dofTakipDokunulanAlanlar);
  if (_DOF_TAKIP_OFS_ALANLARI_UI.some((a) => gonderilecekAlanlar.has(a))) {
    for (const a of _DOF_TAKIP_OFS_ALANLARI_UI) gonderilecekAlanlar.add(a);
  }
  const payload = {};
  for (const alan of gonderilecekAlanlar) {
    payload[alan] = _dofTakipFormDegerOku(alan);
  }

  const kaydetBtn = document.getElementById('dof-takip-kaydet-btn');
  kaydetBtn.disabled = true;
  durum.textContent = 'Kaydediliyor...';
  try {
    await dofTakipTaslagiGuncelle(_dofTakipSecliDofUuid, payload);
    await _dofListesiYukle();   // liste + okunur özet + bu form (dirty sıfırlanmış) tazelenir
    document.getElementById('dof-takip-durum').textContent = 'Takip bilgileri kaydedildi';
  } catch (e) {
    const kod = e && e.kod;
    durum.textContent = (kod && _DOF_TAKIP_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
    kaydetBtn.disabled = false;
  }
}

/** "Temizle" -- yalnız yerel `takipTaslagi`yi kaldırır (`dofTakipTaslagiTemizle`,
 * değiştirilmeden). Imported DÖF kaydı, replay hazırlık metadata'sı vb.
 * BU commit'in kapsamı dışında/dokunulmaz -- eski hazırlık varsa Commit
 * 4D'nin ZIP üretimi zaten `REPLAY_HAZIRLIK_ESKI` ile reddeder, bu
 * davranış burada bozulmaz. */
async function _dofTakipTemizleTikla() {
  if (!_dofTakipSecliDofUuid) return;
  const durum = document.getElementById('dof-takip-durum');
  const temizleBtn = document.getElementById('dof-takip-temizle-btn');
  temizleBtn.disabled = true;
  durum.textContent = 'Temizleniyor...';
  try {
    await dofTakipTaslagiTemizle(_dofTakipSecliDofUuid);
    await _dofListesiYukle();
    document.getElementById('dof-takip-durum').textContent = 'Takip bilgileri temizlendi';
  } catch (e) {
    const kod = e && e.kod;
    durum.textContent = (kod && _DOF_TAKIP_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
  } finally {
    temizleBtn.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window._dofTakipAlanDegisti = _dofTakipAlanDegisti;
  window._dofTakipKaydet = _dofTakipKaydet;
  window._dofTakipTemizleTikla = _dofTakipTemizleTikla;
}

// ─── DÖF REPLAY HAZIRLIK / ZIP İNDİRME (PWA Commit 4I) ───────────
// Yalnız mevcut servisleri (Commit 4C `dofReplayHazirlikGetir/Hazirla`,
// Commit 4D `dofReplayZipOlustur`) DEĞİŞTİRMEDEN UI'a bağlar. Medya/galeri/
// çoklu-DÖF seçim YOKTUR -- yalnız seçili TEK DÖF için. Hazırlık/ZIP
// servisleri zaten kendi güvenceleriyle çalışır (submission UUID yalnız
// `dofReplayHazirlikHazirla` içinde üretilir, ZIP üretimi salt-okunurdur,
// hazırlık yok/eski durumları servis tarafından reddedilir) -- bu bölüm
// hiçbir iş kuralını tekrar YAZMAZ, yalnız sonucu/hatayı gösterir.

let _dofReplaySecliDofUuid = null;
let _dofReplayIslemDevamEdiyor = false;

const _DOF_REPLAY_HATA_METINLERI = {
  BOS_TAKIP_TASLAGI: 'Takip bilgisi yok. Önce takip bilgisi girin.',
  GECERSIZ_TAKIP_TASLAGI: 'Takip alanlarında geçersiz değer var.',
  KANONIK_DOF_DEGIL: 'Bu DÖF kaydı işlenemez.',
  DOF_BULUNAMADI: 'DÖF kaydı bulunamadı.',
  REPLAY_HAZIRLIK_YOK: 'Replay hazırlığı yok. Önce hazırlık oluşturun.',
  REPLAY_HAZIRLIK_ESKI: 'Takip bilgileri değişmiş. Hazırlığı yeniden oluşturun.',
  KARISIK_EXPORT_PAKETI: 'Farklı paketlerden gelen kayıtlar birlikte işlenemez.',
  PAKET_ICI_DUPLICATE: 'Geçersiz istek (yinelenen kayıt).',
  SUBMISSION_UUID_DUPLICATE: 'Geçersiz istek (yinelenen kimlik).',
  GECERSIZ_SUBMISSION_UUID: 'Geçersiz istek (kimlik hatası).',
  GECERSIZ_GIRDI: 'Geçersiz istek.',
  ZIP_URETIM_HATASI: 'Replay ZIP hazırlanamadı.',
  VERITABANI_HATASI: 'Veritabanı hatası.',
};

/** Verilen Blob'u kullanıcı tıklamasının SONUCU olarak indirir (otomatik
 * tetiklenmez) -- normal saha ZIP'inin kullandığı AYNI güvenilir örüntü
 * (`URL.createObjectURL` + geçici `<a download>` + `URL.revokeObjectURL`),
 * izole bir yardımcı olarak (mevcut normal ZIP akışına dokunulmadı). */
function _dofBlobIndir(blob, dosyaAdi) {
  const guvenliAd = String(dosyaAdi || 'dof_replay.zip').replace(/[\\/]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = guvenliAd;
  a.click();
  URL.revokeObjectURL(url);
}

/** Seçili DÖF değiştiğinde (veya liste yenilendiğinde) çağrılır -- yalnız
 * `dofReplayHazirlikGetir` (salt-okunur) ile mevcut hazırlık durumunu
 * gösterir. Kanonik olmayan/bulunamayan DÖF için bölüm AÇILMAZ. */
async function _dofReplayBolumYukle(dofUuid) {
  const kart = document.getElementById('dof-replay-kart');
  if (!kart) return;
  _dofReplaySecliDofUuid = dofUuid;
  if (!dofUuid) {
    kart.style.display = 'none';
    return;
  }
  const durum = document.getElementById('dof-replay-durum');
  try {
    const sonuc = await dofReplayHazirlikGetir(dofUuid);
    kart.style.display = 'block';
    durum.textContent = sonuc.replayHazirlik ? 'Hazırlık hazır' : 'Hazırlık yok';
  } catch (e) {
    kart.style.display = 'none';   // legacy/bulunamayan -- normal akışta oluşmaz, savunma amaçlı
  }
}

/** "Hazırlık Oluştur" -- `dofReplayHazirlikHazirla`'yı (değiştirilmeden)
 * çağırır. Servis idempotency'i kendi sağlar (aynı taslak -> aynı
 * `submissionUuid`, `durum:'degismedi'`); burada yalnız sonuca göre
 * kullanıcı mesajı seçilir. */
async function _dofReplayHazirlikTikla() {
  if (!_dofReplaySecliDofUuid || _dofReplayIslemDevamEdiyor) return;
  _dofReplayIslemDevamEdiyor = true;
  const hazirlikBtn = document.getElementById('dof-replay-hazirlik-btn');
  const zipBtn = document.getElementById('dof-replay-zip-btn');
  const durum = document.getElementById('dof-replay-durum');
  hazirlikBtn.disabled = true;
  zipBtn.disabled = true;
  durum.textContent = 'Hazırlanıyor...';
  try {
    const sonuc = await dofReplayHazirlikHazirla(_dofReplaySecliDofUuid);
    durum.textContent = sonuc.durum === 'degismedi' ? 'Replay hazırlığı zaten güncel.' : 'Replay hazırlığı oluşturuldu.';
  } catch (e) {
    const kod = e && e.kod;
    durum.textContent = (kod && _DOF_REPLAY_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
  } finally {
    _dofReplayIslemDevamEdiyor = false;
    hazirlikBtn.disabled = false;
    zipBtn.disabled = false;
  }
}

/** "ZIP İndir" -- `dofReplayZipOlustur([dofUuid])`'yi (değiştirilmeden,
 * yalnız seçili TEK DÖF ile) çağırır, dönen Blob'u indirir. Hazırlık yok/
 * eski durumlarını servis KENDİSİ reddeder (`REPLAY_HAZIRLIK_YOK`/
 * `REPLAY_HAZIRLIK_ESKI`) -- burada tekrar doğrulanmaz. */
async function _dofReplayZipIndirTikla() {
  if (!_dofReplaySecliDofUuid || _dofReplayIslemDevamEdiyor) return;
  _dofReplayIslemDevamEdiyor = true;
  const hazirlikBtn = document.getElementById('dof-replay-hazirlik-btn');
  const zipBtn = document.getElementById('dof-replay-zip-btn');
  const durum = document.getElementById('dof-replay-durum');
  hazirlikBtn.disabled = true;
  zipBtn.disabled = true;
  durum.textContent = 'ZIP hazırlanıyor...';
  try {
    const sonuc = await dofReplayZipOlustur([_dofReplaySecliDofUuid]);
    _dofBlobIndir(sonuc.zipBlob, sonuc.dosyaAdi);
    durum.textContent = 'ZIP indirildi.';
  } catch (e) {
    const kod = e && e.kod;
    durum.textContent = (kod && _DOF_REPLAY_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
  } finally {
    _dofReplayIslemDevamEdiyor = false;
    hazirlikBtn.disabled = false;
    zipBtn.disabled = false;
  }
}

if (typeof window !== 'undefined') {
  window._dofReplayHazirlikTikla = _dofReplayHazirlikTikla;
  window._dofReplayZipIndirTikla = _dofReplayZipIndirTikla;
}

// ─── BAŞLANGIÇ ───────────────────────────────────────────────
window.addEventListener('load', () => {
  console.log(`İSG Saha Asistanı ${APP_VERSION} başlatıldı`);
  showScreen('setup');
  kurumlariYukle();
  loadInspectionsList();
  _turListesiYukle();
  _dofListesiYukle();
  if (typeof history !== 'undefined' && history.replaceState) {
    history.replaceState({ ekran: 'kurulum' }, '');
  }
});

// ─── SERVICE WORKER REGISTRATION (PWA Commit 4K) ────────────
// Offline app-shell'i gerçekten aktive eder -- sw.js zaten vardı ama
// production kodu hiç register etmiyordu (bkz. tests/k-offline-appshell.spec.js
// negatif karakterizasyonu). Hata durumunda sessizce uyarır, uygulamayı
// çökertmez; desteklenmeyen ortamda hiç çalışmaz.
if (navigator.serviceWorker) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(() => {
      console.log('[PWA] Service Worker registered');
    }).catch((err) => {
      console.warn('[PWA] Service Worker registration failed', err);
    });
  });
}

// PWA Mobile Field Hotfix: yeni bir Service Worker devraldığında (yeni
// deploy sonrası cache/version güncellendiğinde) AÇIK KALMIŞ bir sekme
// eski cache'ten yüklenmiş app.js ile hâlâ çalışmaya devam edebiliyordu --
// yeni index.html'de olup eski (bellekte zaten çalışan) app.js'te olmayan
// bir fonksiyona (ör. galeri/aynı-konum işleyicileri) dokunulunca senkron
// hata fırlıyor, global hata bandını tetikliyordu (eski-yeni JS karışımı).
// `controllerchange` -- yeni SW devraldığı anı bildirir -- ile sayfa BİR
// KEZ yenilenir, böylece HTML/JS/SW her zaman aynı sürümde kalır.
// ÖNEMLİ: `clients.claim()` (sw.js'de zaten vardı) İLK KURULUMDA da
// controller'ı null'dan bir worker'a geçirip bu event'i tetikler -- o an
// sayfa zaten TAM DOĞRU (yeni) app.js ile çalışıyor, yenilemeye gerek yok.
// Yalnız sayfa DAHA ÖNCE (yüklenirken) zaten bir controller'a sahipse ve
// SONRADAN bu değişirse gerçek bir "eski sekim, yeni SW" senaryosudur.
if (navigator.serviceWorker) {
  const _swZatenKontrolluydu = !!navigator.serviceWorker.controller;
  let _swYenilemeYapildi = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_swYenilemeYapildi || !_swZatenKontrolluydu) return;
    _swYenilemeYapildi = true;
    location.reload();
  });
}

// ─── EKRAN YÖNETİMİ ──────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add('active');
}

// ─── GERİ TUŞU / HISTORY (v0.2.1'den uyarlandı — kanıtlanmış desen) ──
// Taban kayıt daima 'kurulum'; her ileri ekran kendi state'ini push eder.
// Android/tarayıcı geri tuşu -> popstate -> bir önceki ekran çizilir.
// popstate gelmeyen nadir durumlar için 250ms emniyet zamanlayıcısı.
function _ekraniPushEt(ekranAdi) {
  if (typeof history === 'undefined' || !history.pushState) return;
  if (!history.state || history.state.ekran !== ekranAdi) {
    history.pushState({ ekran: ekranAdi }, '');
  }
}

// "Bu Odayı Tamamla" gibi YANAL geçişler için: yeni bir history seviyesi
// EKLEMEZ, mevcut en üst kaydı DEĞİŞTİRİR. Aksi halde (push kullanılsaydı)
// inceleme->kat-alan geçişinden sonra "Geri" tuşu kullanıcıyı az önce
// tamamladığı odaya GERİ döndürürdü (kafa karıştırıcı döngü) -- replaceState
// ile "Geri" doğrudan kurulum ekranına döner, tıpkı normal kat-alan
// akışındaki gibi.
function _ekraniDegistir(ekranAdi) {
  if (typeof history === 'undefined' || !history.replaceState) return;
  history.replaceState({ ekran: ekranAdi }, '');
}

// PWA Commit 4M: aynı konuma hızlı geri-dönüş senaryosunda (mevcut denetime
// devam ederken) bu 250ms fallback ESKİ (stale) bir çağrıdan kalıp, ARADAN
// başka bir _geriTikla çağrısı geçtikten SONRA tetiklenip o an TAMAMEN
// alakasız bir nedenle (ör. ikinci kez ekranKatAlanaGec()/startInspection()
// ile inceleme ekranına dönülmüş olması) `oncekiEkranId`in class'ı yeniden
// "active" olduğu için YANLIŞLIKLA devreye girip kullanıcıyı kurulum
// ekranına fırlatabiliyordu. Jeton (generation) ile YALNIZ EN SON
// _geriTikla çağrısının fallback'i geçerli sayılır -- ara navigasyon
// olduysa eski zamanlayıcı sessizce iptal olur.
let _geriTiklaJetonu = 0;
function _geriTikla(oncekiEkranId) {
  const jeton = ++_geriTiklaJetonu;
  const oncekiAktifMi = document.getElementById(oncekiEkranId).classList.contains('active');
  if (typeof history !== 'undefined' && history.back) history.back();
  setTimeout(() => {
    if (jeton !== _geriTiklaJetonu) return;   // aradan yeni bir geri-tıklama geçti -- bu zamanlayıcı geçersiz
    // popstate 250ms içinde gelmediyse (bazı gömülü tarayıcılar) manuel düş.
    if (oncekiAktifMi && document.getElementById(oncekiEkranId).classList.contains('active')) {
      _setupEkraninaGec();
    }
  }, 250);
}

function _modalAcikMi() {
  return document.getElementById('modal-confirm').style.display === 'flex' ||
         document.getElementById('modal-form').style.display === 'flex';
}

// Modal açık halde geri tuşuna basılırsa: sadece modalı kapat, ekranı DEĞİŞTİRME.
// (Modal aç/kapat kendi history seviyesini kullanır — bkz. _modalHistoryAc/Kapat.)
function _modalHistoryAc() {
  if (typeof history === 'undefined' || !history.pushState) return;
  const mevcutEkran = (history.state && history.state.ekran) || 'kurulum';
  history.pushState({ ekran: mevcutEkran, modal: true }, '');
}

function _modalHistoryKapat() {
  if (typeof history !== 'undefined' && history.state && history.state.modal && history.back) {
    history.back();
  }
}

window.addEventListener('popstate', (e) => {
  if (_modalAcikMi()) {
    closeModal();
    closeFormModal();
  }
  const ekran = e.state && e.state.ekran;
  if (ekran === 'kat-alan') {
    showScreen('kat-alan');
  } else if (ekran === 'inceleme' && currentSession) {
    showScreen('inspection');
  } else {
    _setupEkraninaGec();
  }
});

function _setupEkraninaGec() {
  clearInterval(sessionTimer);
  showScreen('setup');
  kurumlariYukle();
  loadInspectionsList();
  _turListesiYukle();
}

// ─── KURUM / BİRİM ───────────────────────────────────────────
async function kurumlariYukle() {
  const kurumlar = await dbTumu('kurumlar');
  const sel = document.getElementById('setup-kurum');
  const secili = sel.value;
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    kurumlar.map(k => `<option value="${k.id}">${_esc(k.ad)}</option>`).join('');
  if (secili && kurumlar.some(k => k.id === secili)) sel.value = secili;
  await birimleriYukle();
}

async function birimleriYukle() {
  const kurumId = document.getElementById('setup-kurum').value;
  const sel = document.getElementById('setup-birim');
  if (!kurumId) {
    sel.innerHTML = '<option value="">Önce kurum seçin</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  const secili = sel.value;
  const birimler = await dbIndexTumu('birimler', 'kurumId', kurumId);

  // Ön tanımlı tip kısayolları: seçilince "Yeni Birim" formu o tiple önceden
  // doldurulmuş açılır (bkz. _birimSecimDegisti). Gerçek birim kaydı değil.
  const yeniKisayollari = Object.entries(PROFILLER)
    .map(([k, v]) => `<option value="YENI:${k}">+ Yeni: ${_esc(v.ad)}</option>`).join('');

  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    (birimler.length
      ? `<optgroup label="Mevcut Birimler">${birimler.map(b => `<option value="${b.id}">${_esc(b.ad)}</option>`).join('')}</optgroup>`
      : '') +
    `<optgroup label="Yeni Birim Ekle">${yeniKisayollari}</optgroup>`;
  if (secili && birimler.some(b => b.id === secili)) sel.value = secili;
}

async function _birimSecimDegisti() {
  const sel = document.getElementById('setup-birim');
  const deger = sel.value;
  if (deger.startsWith('YENI:')) {
    const tip = deger.slice(5);
    sel.value = '';
    await yeniBirimEkle(tip);
  }
}
if (typeof window !== 'undefined') window._birimSecimDegisti = _birimSecimDegisti;

async function yeniKurumEkle() {
  const ad = prompt('Kurum adı (örn: KMÜ Rektörlüğü, Veterinerlik Fakültesi):');
  if (!ad || !ad.trim()) return;
  const kurum = { id: uuid(), ad: ad.trim(), olusturma: new Date().toISOString() };
  await dbEkle('kurumlar', kurum);
  await kurumlariYukle();
  document.getElementById('setup-kurum').value = kurum.id;
  await birimleriYukle();
}

async function yeniBirimEkle(onceTip) {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }

  const profilSecenekleri = '<option value="">Seçiniz...</option>' +
    Object.entries(PROFILLER).map(([k, v]) => `<option value="${k}">${_esc(v.ad)}</option>`).join('') +
    '<option value="genel">Genel / Diğer</option>';

  showFormModal('Yeni Birim', `
    <div class="input-group">
      <label>Bina Tipi (alan tipi listesini belirler)</label>
      <select id="form-birim-profil" onchange="_birimFormTipDegisti()">${profilSecenekleri}</select>
    </div>
    <div id="form-birim-konteyner-secim" style="display:none; margin-top:10px;">
      <label>Bu birim nedir?</label>
      <div class="chip-group" id="form-birim-konteyner-chips">
        <div class="chip" data-secim="kendisi" onclick="_birimFormKonteynerSec(this)">Kendisi (bütün bina)</div>
        <div class="chip" data-secim="alt" id="form-birim-alt-chip" onclick="_birimFormKonteynerSec(this)">Alt Birim</div>
      </div>
      <div class="chip-group" id="form-birim-daire-chips" style="display:none; margin-top:8px;"></div>
    </div>
    <div class="input-group" id="form-birim-ad-wrap" style="margin-top:15px;">
      <label>Birim Adı</label>
      <input type="text" id="form-birim-ad" placeholder="Örn: Veteriner Hastanesi">
    </div>
    <div class="input-group">
      <label>Kaç Katlı?</label>
      <input type="number" id="form-birim-kat" value="1" min="1">
    </div>
  `, async () => {
    const ad = document.getElementById('form-birim-ad').value.trim();
    if (!ad) { alert('Birim adı gerekli.'); return; }
    const profil = document.getElementById('form-birim-profil').value;
    if (!profil) { alert('Bina tipi seçin.'); return; }
    const katSayisi = parseInt(document.getElementById('form-birim-kat').value) || 1;
    let katlar = ['Zemin'];
    if (katSayisi > 1) katlar = ['Zemin', ...Array.from({ length: katSayisi - 1 }, (_, i) => `${i + 1}.Kat`)];

    const birim = { id: uuid(), kurumId, ad, tip: profil, katlar, odalar: [], ozelAlanlar: [], olusturma: new Date().toISOString() };
    await dbEkle('birimler', birim);
    closeFormModal();
    await birimleriYukle();
    document.getElementById('setup-birim').value = birim.id;
  }, 'Birimi Oluştur');

  if (onceTip) {
    document.getElementById('form-birim-profil').value = onceTip;
    _birimFormTipDegisti();
  }
}

// Rektörlük/Enstitü gibi "konteyner" tipler seçilince Ad kutusu gizlenir,
// önce "Kendisi mi / Daire Başkanlığı mı" sorulur.
function _birimFormTipDegisti() {
  const tip = document.getElementById('form-birim-profil').value;
  const konteynerWrap = document.getElementById('form-birim-konteyner-secim');
  const adWrap = document.getElementById('form-birim-ad-wrap');
  const daireChips = document.getElementById('form-birim-daire-chips');
  daireChips.style.display = 'none';
  daireChips.innerHTML = '';
  const konteynerChips = document.getElementById('form-birim-konteyner-chips');
  if (konteynerChips) konteynerChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));

  if (KONTEYNER_TIPLER.has(tip)) {
    konteynerWrap.style.display = 'block';
    adWrap.style.display = 'none';
    document.getElementById('form-birim-ad').value = '';
    const altChip = document.getElementById('form-birim-alt-chip');
    if (altChip) altChip.textContent = ALT_BIRIM_ETIKETI[tip] || 'Alt Birim';
  } else {
    konteynerWrap.style.display = 'none';
    adWrap.style.display = 'block';
  }
}
if (typeof window !== 'undefined') window._birimFormTipDegisti = _birimFormTipDegisti;

function _birimFormKonteynerSec(el) {
  document.querySelectorAll('#form-birim-konteyner-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const secim = el.dataset.secim;
  const adWrap = document.getElementById('form-birim-ad-wrap');
  const daireChips = document.getElementById('form-birim-daire-chips');
  const tip = document.getElementById('form-birim-profil').value;
  const profilAdi = PROFILLER[tip] ? PROFILLER[tip].ad : tip;

  if (secim === 'kendisi') {
    daireChips.style.display = 'none';
    daireChips.innerHTML = '';
    adWrap.style.display = 'block';
    document.getElementById('form-birim-ad').value = profilAdi;
  } else {
    adWrap.style.display = 'none';
    daireChips.style.display = 'flex';
    const liste = ALT_BIRIM_LISTELERI[tip] || [];
    daireChips.innerHTML = liste.map(d =>
      `<div class="chip" onclick="_birimFormDaireSec(this)">${_esc(d)}</div>`
    ).join('') + `<div class="chip" onclick="_birimFormOzelDaireEkle()" style="border:1px dashed #999">+ Özel</div>`;
  }
}
if (typeof window !== 'undefined') window._birimFormKonteynerSec = _birimFormKonteynerSec;

function _birimFormDaireSec(el) {
  document.querySelectorAll('#form-birim-daire-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('form-birim-ad-wrap').style.display = 'block';
  document.getElementById('form-birim-ad').value = el.textContent;
}
if (typeof window !== 'undefined') window._birimFormDaireSec = _birimFormDaireSec;

function _birimFormOzelDaireEkle() {
  const ad = prompt('Daire Başkanlığı / birim adı:');
  if (!ad || !ad.trim()) return;
  document.getElementById('form-birim-ad-wrap').style.display = 'block';
  document.getElementById('form-birim-ad').value = ad.trim();
}
if (typeof window !== 'undefined') window._birimFormOzelDaireEkle = _birimFormOzelDaireEkle;

function _birimOdalari(birim, kat) {
  return (birim && Array.isArray(birim.odalar)) ? birim.odalar.filter(o => o.kat === kat) : [];
}

// ─── EKRAN B: KAT + ALAN TİPİ (Devam'a basınca açılır) ───────
async function ekranKatAlanaGec() {
  const kurumId = document.getElementById('setup-kurum').value;
  const birimId = document.getElementById('setup-birim').value;
  if (!kurumId) { alert('Lütfen kurum seçin.'); return; }
  if (!birimId) { alert('Lütfen birim seçin.'); return; }

  const kurum = await dbGetir('kurumlar', kurumId);
  const birim = await dbGetir('birimler', birimId);
  document.getElementById('kat-alan-baslik').textContent = `${kurum ? kurum.ad : ''} / ${birim ? birim.ad : ''}`;

  const katlar = (birim && birim.katlar && birim.katlar.length) ? birim.katlar : ['Zemin'];
  await _katChipleriCiz(katlar, katlar[0]);

  showScreen('kat-alan');
  _ekraniPushEt('kat-alan');
}
if (typeof window !== 'undefined') window.ekranKatAlanaGec = ekranKatAlanaGec;

// ─── DENETİM TÜRÜ (Ana ekranda — Sorumlu'nun üstünde) ────────
// Masaüstü zaten "tur" alanına göre Risk Analizi / Saha Denetimi ayırıyordu
// (main.py'de hazırdı) — PWA bugüne kadar hep sabit "saha" gönderiyordu.
// Dropdown + "+ Ekle" ile genişletilebilir (ör. ileride ADEP eklenebilir).
const TUR_HAZIR_LISTESI = [
  { deger: 'saha', ad: 'Saha Denetimi' },
  { deger: 'risk', ad: 'Risk Analizi' }
];

async function _turListesiYukle() {
  const sel = document.getElementById('setup-tur');
  if (!sel) return;
  const ayar = await dbGetir('ayarlar', 'ozelTurler');
  const ozelTurler = (ayar && ayar.degerler) || [];
  const secili = sel.value || secilenTur;

  sel.innerHTML = TUR_HAZIR_LISTESI.map(t => `<option value="${t.deger}">${_esc(t.ad)}</option>`).join('') +
    ozelTurler.map(ad => `<option value="ozel:${_escAttr(ad)}">${_esc(ad)}</option>`).join('');
  if (secili && [...sel.options].some(o => o.value === secili)) sel.value = secili;
  secilenTur = sel.value;
}

function _turDegisti() {
  secilenTur = document.getElementById('setup-tur').value;
}
if (typeof window !== 'undefined') window._turDegisti = _turDegisti;

async function turEkle() {
  const ad = prompt('Yeni denetim türü adı (örn: ADEP):');
  if (!ad || !ad.trim()) return;
  const ayar = (await dbGetir('ayarlar', 'ozelTurler')) || { id: 'ozelTurler', degerler: [] };
  if (!ayar.degerler.includes(ad.trim())) ayar.degerler.push(ad.trim());
  await dbGuncelle('ayarlar', ayar);
  await _turListesiYukle();
  document.getElementById('setup-tur').value = `ozel:${ad.trim()}`;
  secilenTur = document.getElementById('setup-tur').value;
}
if (typeof window !== 'undefined') window.turEkle = turEkle;

// Kat çiplerini çizer + seçili katı ayarlar. Hem ilk açılışta hem "+ Kat Ekle"
// sonrası yeniden çizimde kullanılır (tek kaynak, tekrar yok).
// Not: Ilk surumde bu badge 16x16px'ti — gercek telefonda parmakla isabet
// ettirmek zordu, chip'in kendisine dokunulmus gibi davraniyordu (chip'in
// onclick'i tetikleniyordu). Dokunma hedefi buyutuldu (28x28), kirmizi renkle
// ayristirildi, hem click hem touchstart'ta stopPropagation cagriliyor.
function _silBadgeHtml(onclickJs) {
  return `<span onclick="event.stopPropagation(); ${onclickJs}" ontouchstart="event.stopPropagation();" style="margin-left:6px; background:#e74c3c; color:white; border-radius:50%; width:28px; height:28px; min-width:28px; display:inline-flex; align-items:center; justify-content:center; font-size:0.85rem; cursor:pointer; flex-shrink:0;">✕</span>`;
}

async function _katChipleriCiz(katlar, secilecekKat) {
  const chips = document.getElementById('kat-alan-kat-chips');
  chips.innerHTML = '';
  katlar.forEach(kat => {
    const c = document.createElement('div');
    c.className = 'chip' + (kat === secilecekKat ? ' active' : '');
    c.innerHTML = `<span>${_esc(kat)}</span>` + _silBadgeHtml(`_katSil('${_escAttr(kat).replace(/'/g, "\\'")}')`);
    c.onclick = () => {
      chips.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      secilenKat = kat;
      secilenAlanTipi = null;
      secilenMevcutOdaId = null;
      document.getElementById('kat-alan-oda-no').value = '';
      _katAlanMevcutOdalariGoster();
      _katAlanAlanTipleriGoster();
    };
    chips.appendChild(c);
  });
  secilenKat = secilecekKat;
  secilenAlanTipi = null;
  secilenMevcutOdaId = null;
  document.getElementById('kat-alan-oda-no').value = '';
  document.getElementById('kat-alan-oda-adaylar').innerHTML = '';

  await _katAlanMevcutOdalariGoster();
  await _katAlanAlanTipleriGoster();
}

async function _katSil(kat) {
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  if ((birim.katlar || []).length <= 1) { alert('Son kat silinemez — en az bir kat olmalı.'); return; }
  const oOdalar = _birimOdalari(birim, kat);
  if (oOdalar.length > 0) {
    alert(`Bu katta ${oOdalar.length} oda tanımlı — önce onları silin.`);
    return;
  }
  if (!confirm(`"${kat}" katı silinsin mi?`)) return;
  birim.katlar = birim.katlar.filter(k => k !== kat);
  await dbGuncelle('birimler', birim);
  await _katChipleriCiz(birim.katlar, birim.katlar[0]);
}
if (typeof window !== 'undefined') window._katSil = _katSil;

async function _katEkle(e) {
  e.preventDefault();
  const ad = prompt('Yeni kat adı (örn: Bodrum, Çatı, Asma Kat):');
  if (!ad || !ad.trim()) return;
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  if (!birim.katlar) birim.katlar = ['Zemin'];
  if (birim.katlar.includes(ad.trim())) { alert('Bu kat zaten var.'); return; }
  birim.katlar.push(ad.trim());
  await dbGuncelle('birimler', birim);
  await _katChipleriCiz(birim.katlar, ad.trim());
}
if (typeof window !== 'undefined') window._katEkle = _katEkle;

async function _katAlanMevcutOdalariGoster() {
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  const odalar = _birimOdalari(birim, secilenKat);
  const wrap = document.getElementById('kat-alan-mevcut-wrap');
  const kutu = document.getElementById('kat-alan-mevcut-odalar');
  if (odalar.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  kutu.innerHTML = odalar.map(o =>
    `<div class="chip" onclick="_katAlanMevcutOdaSec('${o.id}', this)">
      <span>${_esc(o.ad)}</span>${_silBadgeHtml(`_odaSil('${o.id}')`)}
    </div>`
  ).join('');
}

async function _odaSil(odaId) {
  if (!confirm('Bu oda tanımı silinsin mi? (Geçmiş denetim kayıtları etkilenmez)')) return;
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  birim.odalar = (birim.odalar || []).filter(o => o.id !== odaId);
  await dbGuncelle('birimler', birim);
  if (secilenMevcutOdaId === odaId) {
    secilenMevcutOdaId = null;
    secilenAlanTipi = null;
    document.getElementById('kat-alan-oda-no').value = '';
  }
  await _katAlanMevcutOdalariGoster();
}
if (typeof window !== 'undefined') window._odaSil = _odaSil;

// NOT: `el` parametresi olarak DOM elemanı doğrudan alınır — async fonksiyon
// içinde await'ten sonra global `event` nesnesine güvenmek kırılgandır
// (mikrogörev sınırından sonra window.event sıfırlanabilir).
async function _katAlanMevcutOdaSec(odaId, el) {
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  const oda = (birim.odalar || []).find(o => o.id === odaId);
  if (!oda) return;

  // Kendini onarma: v0.8 öncesi odalarda alanTipi/no ayrımı yoktu, sadece
  // "ad" vardı. Şimdi kullanınca kalıcı olarak tamamlanır — bir daha sorun çıkmaz.
  if (oda.alanTipi === undefined) {
    oda.alanTipi = oda.ad;
    oda.no = oda.no || '';
    await dbGuncelle('birimler', birim);
  }

  secilenMevcutOdaId = oda.id;
  secilenAlanTipi = oda.alanTipi;
  document.getElementById('kat-alan-oda-no').value = oda.no || '';
  document.querySelectorAll('#kat-alan-mevcut-odalar .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  document.querySelectorAll('#kat-alan-hizli-chips .chip').forEach(c => c.classList.remove('active'));
  document.getElementById('kat-alan-alan-dropdown').value = oda.alanTipi;
}
if (typeof window !== 'undefined') window._katAlanMevcutOdaSec = _katAlanMevcutOdaSec;

// Alan Tipi seçimi SADECE iki yoldan olur: 6 hızlı chip (görünür) + tam liste
// dropdown (aynı verinin ikinci bir chip-grid'i YOK — fazlalıktı, kaldırıldı).
async function _katAlanAlanTipleriGoster() {
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  const hizli = _birimHizliAlanlar(birim);
  const ozel = (birim && birim.ozelAlanlar) || [];
  const tumAlanlar = _birimAlanTipleri(birim);

  const chipHtml = a => `<div class="chip" data-alan="${_escAttr(a)}" onclick="_katAlanChipSec(this)">${_esc(a)}</div>`;
  const ozelChipHtml = a => `<div class="chip" data-alan="${_escAttr(a)}" onclick="_katAlanChipSec(this)">
      <span>${_esc(a)}</span>${_silBadgeHtml(`_ozelAlanSil('${_escAttr(a).replace(/'/g, "\\'")}')`)}
    </div>`;
  document.getElementById('kat-alan-hizli-chips').innerHTML =
    hizli.map(chipHtml).join('') + ozel.map(ozelChipHtml).join('') +
    `<div class="chip" onclick="_katAlanOzelAlanEkle()" style="border:1px dashed #999">+ Özel Tip</div>`;

  const sel = document.getElementById('kat-alan-alan-dropdown');
  sel.innerHTML = '<option value="">— Açılır listeden seçin (tüm bölümler) —</option>' +
    tumAlanlar.map(a => `<option value="${_escAttr(a)}">${_esc(a)}</option>`).join('');
}

function _katAlanChipSec(el) {
  document.querySelectorAll('#kat-alan-hizli-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  secilenAlanTipi = el.dataset.alan;
  secilenMevcutOdaId = null;
  document.getElementById('kat-alan-alan-dropdown').value = secilenAlanTipi;
  document.querySelectorAll('#kat-alan-mevcut-odalar .chip').forEach(c => c.classList.remove('active'));
}
if (typeof window !== 'undefined') window._katAlanChipSec = _katAlanChipSec;

function _katAlanDropdownDegisti() {
  const deger = document.getElementById('kat-alan-alan-dropdown').value;
  if (!deger) return;
  secilenAlanTipi = deger;
  secilenMevcutOdaId = null;
  document.querySelectorAll('#kat-alan-hizli-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.alan === deger);
  });
  document.querySelectorAll('#kat-alan-mevcut-odalar .chip').forEach(c => c.classList.remove('active'));
}
if (typeof window !== 'undefined') window._katAlanDropdownDegisti = _katAlanDropdownDegisti;

async function _katAlanOzelAlanEkle() {
  const ad = prompt('Yeni alan tipi adı (örn: Sunucu Odası):');
  if (!ad || !ad.trim()) return;
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  if (!birim.ozelAlanlar) birim.ozelAlanlar = [];
  birim.ozelAlanlar.push(ad.trim());
  await dbGuncelle('birimler', birim);
  await _katAlanAlanTipleriGoster();
}
if (typeof window !== 'undefined') window._katAlanOzelAlanEkle = _katAlanOzelAlanEkle;

async function _ozelAlanSil(ad) {
  if (!confirm(`"${ad}" özel alan tipi silinsin mi?`)) return;
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  birim.ozelAlanlar = (birim.ozelAlanlar || []).filter(a => a !== ad);
  await dbGuncelle('birimler', birim);
  if (secilenAlanTipi === ad) secilenAlanTipi = null;
  await _katAlanAlanTipleriGoster();
}
if (typeof window !== 'undefined') window._ozelAlanSil = _ozelAlanSil;

function _katAlanOdaNoDegisti() {
  secilenMevcutOdaId = null;
  document.querySelectorAll('#kat-alan-mevcut-odalar .chip').forEach(c => c.classList.remove('active'));
}
if (typeof window !== 'undefined') window._katAlanOdaNoDegisti = _katAlanOdaNoDegisti;

function katAlanGeri() {
  _geriTikla('screen-setup');
}
if (typeof window !== 'undefined') window.katAlanGeri = katAlanGeri;

// ─── DENETİM BAŞLAT ──────────────────────────────────────────
async function startInspection() {
  const kurumId = document.getElementById('setup-kurum').value;
  const birimId = document.getElementById('setup-birim').value;
  const resp = document.getElementById('setup-responsible').value.trim();
  const odaNo = document.getElementById('kat-alan-oda-no').value.trim();

  if (!kurumId) { alert('Lütfen kurum seçin.'); return; }
  if (!birimId) { alert('Lütfen birim seçin.'); return; }
  if (!secilenAlanTipi) { alert('Lütfen alan tipi seçin (hızlı chip veya açılır listeden).'); return; }

  const birim = await dbGetir('birimler', birimId);
  if (!birim.odalar) birim.odalar = [];

  let odaKaydi = secilenMevcutOdaId ? birim.odalar.find(o => o.id === secilenMevcutOdaId) : null;
  if (!odaKaydi) {
    odaKaydi = birim.odalar.find(o => o.kat === secilenKat && o.alanTipi === secilenAlanTipi && (o.no || '') === odaNo);
  }
  if (!odaKaydi) {
    odaKaydi = {
      id: uuid(), kat: secilenKat, alanTipi: secilenAlanTipi, no: odaNo,
      ad: odaNo ? `${secilenAlanTipi} ${odaNo}` : secilenAlanTipi
    };
    birim.odalar.push(odaKaydi);
    await dbGuncelle('birimler', birim);
  }

  // Aynı konuma (kurum/birim/oda/denetim türü) daha önce başlanmış bir
  // denetim varsa yenisini oluşturmak yerine ona devam edilir (PWA Commit
  // 4M) -- bulgu/foto/ses/not mevcut kayda eklenir, hiçbir eski veri
  // silinmez/overwrite edilmez. odaKaydi zaten (kat, alanTipi, no) ile
  // tekilleştirildiği için burada yalnız odaId + tur eşleşmesi yeterli.
  const birimDenetimleri = await dbIndexTumu('denetimler', 'birimId', birimId);
  const eslesenler = birimDenetimleri.filter(d =>
    d.kurumId === kurumId && d.odaId === odaKaydi.id && d.tur === secilenTur);
  eslesenler.sort((a, b) => (b.guncelleme || b.baslangic || '').localeCompare(a.guncelleme || a.baslangic || ''));
  let denetim = eslesenler[0] || null;
  const mevcudaDevamEdildi = !!denetim;

  if (denetim) {
    denetim.guncelleme = new Date().toISOString();
    await dbGuncelle('denetimler', denetim);
  } else {
    denetim = {
      id: uuid(),
      kurumId,
      birimId,
      bina: birim.ad,
      kat: secilenKat,
      odaId: odaKaydi.id,
      oda: odaKaydi.ad,
      alanTipi: odaKaydi.alanTipi,
      odaNo: odaKaydi.no,
      tur: secilenTur,
      sorumlu: resp,
      baslangic: new Date().toISOString(),
      guncelleme: new Date().toISOString()
    };
    await dbEkle('denetimler', denetim);
  }

  currentSession = denetim;
  sessionBulgular = [];
  _taslakTemizle();   // önceki odadan kalan kaydedilmemiş foto/ses/not/hayati-risk taslağı yeni odaya taşınmaz
  updateLocationDisplay();
  _denetimDevamDurumGoster(mevcudaDevamEdildi);
  showScreen('inspection');
  _ekraniPushEt('inceleme');   // Kat-Alan ekranı yığında kalır — geri tuşu ORAYA döner (Kurulum'a atlamaz)
  startTimer();
  await renderFindings();
}

function _denetimDevamDurumGoster(mevcudaDevamEdildi) {
  const el = document.getElementById('denetim-devam-durum');
  if (!el) return;
  const metin = mevcudaDevamEdildi
    ? 'Bu konum için mevcut denetime devam ediliyor.'
    : 'Yeni denetim başlatıldı.';
  el.innerHTML = `<span class="konum-durum-ikon"><i class="fas fa-check"></i></span><span>${_esc(metin)}</span>`;
}

// PWA UX Commit + gerçek Android hotfix: eski düz "Bina / Kat / Oda X"
// metnini AYNI veriden kompakt, ikonlu kart-chip'lere böler -- veri modeli/
// eşleşme anahtarı değişmedi, yalnız sunum. Düz-metin yol/breadcrumb
// (.konum-yol-baslik, .header içinde) ARTIK GERİ EKLENDİ -- kart satırının
// YERİNE değil, ONUNLA BİRLİKTE gösterilir. Her ikon kendi (sade/pastel)
// rengini taşır, kart arkaplanı/metni nötr kalır. Konteyner .konum-satiri
// kendi user-select:none'una sahip (mobil hotfix'teki koruma korunur).
//
// Gerçek Android hotfix (konum chip navigasyonu): "AKTİF KONUM" etiket
// chip'i dışındaki HER chip artık tıklanabilir -- birim/kat/oda parçalarının
// hepsi AYNI güvenli hedefe (_odaSecimineDon, "Bu Odayı Tamamla" ile birebir
// aynı fonksiyon) yönlendirir. Model yalnız TEK bir birleşik kat+oda/mahal
// seçim ekranını (#screen-kat-alan) desteklediği için ayrı "yalnız birim"
// veya "yalnız kat" seçim seviyeleri YOK -- bu yüzden tüm konum chip'leri
// aynı, zaten kanıtlanmış (bulgu silmeyen/denetimi kilitlemeyen/history
// döngüsü üretmeyen) geri dönüşe yönlendirilir. "AKTİF KONUM" etiketi ve
// durum segmenti bilinçli olarak TIKLANAMAZ bırakıldı (etiket = "buradasınız"
// göstergesi, durum segmenti = salt bilgi).
const KONUM_CHIP_IKONLARI = ['fa-building', 'fa-stairs', 'fa-door-open', 'fa-tag'];
const KONUM_CHIP_RENKLERI = ['#2c3e50', '#27ae60', '#8e44ad', '#f39c12'];
function updateLocationDisplay() {
  if (!currentSession) return;
  const { bina, kat, oda } = currentSession;
  const tamYol = `${bina} / ${kat} / Oda ${oda}`;

  const baslik = document.getElementById('konum-yol-metin');
  if (baslik) baslik.textContent = tamYol;

  const el = document.getElementById('current-loc-display');
  if (!el) return;
  const parcalar = tamYol.split('/').map(p => p.trim()).filter(Boolean);
  el.innerHTML = '<div class="konum-chip konum-chip-etiket"><i class="fas fa-location-dot"></i><span>AKTİF KONUM</span></div>' +
    parcalar.map((p, i) => {
      const idx = Math.min(i, KONUM_CHIP_IKONLARI.length - 1);
      const ikon = KONUM_CHIP_IKONLARI[idx];
      const renk = KONUM_CHIP_RENKLERI[idx];
      return `<div class="konum-chip konum-chip-tiklanabilir" onclick="_odaSecimineDon()"><i class="fas ${ikon}" style="color:${renk}"></i><span>${_esc(p)}</span></div>`;
    }).join('');
}

// "Bu Odayı Tamamla" -- aktif denetimi SİLMEDEN/kilitlemeden, aynı
// kurum/birim/kat bağlamındaki oda/mahal seçim ekranına döner. Konum
// eşleşme anahtarı (kurumId+birimId+odaId+tur) ve mevcut denetime devam
// davranışı (PWA Commit 4M) değişmez -- aynı odaya tekrar girilirse hâlâ
// aynı denetim kaydı kullanılır.
async function _odaSecimineDon() {
  if (!currentSession) { goToSetup(); return; }
  const { kurumId, birimId, kat } = currentSession;

  await kurumlariYukle();
  document.getElementById('setup-kurum').value = kurumId;
  await birimleriYukle();
  document.getElementById('setup-birim').value = birimId;

  const kurum = await dbGetir('kurumlar', kurumId);
  const birim = await dbGetir('birimler', birimId);
  document.getElementById('kat-alan-baslik').textContent = `${kurum ? kurum.ad : ''} / ${birim ? birim.ad : ''}`;

  const katlar = (birim && birim.katlar && birim.katlar.length) ? birim.katlar : ['Zemin'];
  const hedefKat = katlar.includes(kat) ? kat : katlar[0];
  await _katChipleriCiz(katlar, hedefKat);

  showScreen('kat-alan');
  _ekraniDegistir('kat-alan');
}
if (typeof window !== 'undefined') window._odaSecimineDon = _odaSecimineDon;

// ─── TIMER ───────────────────────────────────────────────────
function startTimer() {
  clearInterval(sessionTimer);
  const start = Date.now();
  sessionTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('session-time').textContent = `${m}:${s}`;
  }, 1000);
}

// ─── HAYATİ RİSK ETİKETİ ─────────────────────────────────────
function toggleHayatiRisk() {
  hayatiRiskAktif = !hayatiRiskAktif;
  _hayatiRiskButonGuncelle();
}
function _hayatiRiskButonGuncelle() {
  const btn = document.getElementById('btn-hayati-risk');
  if (!btn) return;
  btn.classList.toggle('aktif', hayatiRiskAktif);
  const etiket = document.getElementById('hayati-risk-etiket');
  if (etiket) etiket.textContent = hayatiRiskAktif ? 'Hayati Risk: AÇIK' : 'Hayati Risk İşaretle';
}

// ─── BULGU KAYDET (çoklu fotoğraf + çoklu ses, sınırsız) ─────
let _bulguKaydediliyor = false;

async function saveFinding() {
  // Dokunmatik ekranlarda tek dokunuş bazen click olayını iki kez tetikler:
  // ilk çağrı kaydedip taslağı temizler, hemen ardından gelen ikinci çağrı
  // artık boş olan taslakla karşılaşıp gereksiz "en az biri gerekli" uyarısı
  // verir. Kayıt sürerken ikinci çağrıyı sessizce yok say.
  if (_bulguKaydediliyor) return;
  const text = document.getElementById('finding-manual').value.trim();
  if (!text && aktifFotolarTaslak.length === 0 && aktifSeslerTaslak.length === 0) {
    alert('Bulgu için metin, fotoğraf veya ses notundan en az biri gerekli.');
    return;
  }
  _bulguKaydediliyor = true;
  try {
    const bulgu = {
      id: uuid(),
      denetimId: currentSession.id,
      metin: text,
      fotolar: aktifFotolarTaslak.map(f => ({
        blob: f.blob, boyut: f.sikistirilmisBoyut, genislik: f.genislik, yukseklik: f.yukseklik
      })),
      sesler: aktifSeslerTaslak.map(s => ({ blob: s.blob, sure: s.sure })),
      hayatiRisk: hayatiRiskAktif,
      zaman: new Date().toISOString()
    };
    await dbEkle('bulgular', bulgu);
    currentSession.guncelleme = bulgu.zaman;
    await dbGuncelle('denetimler', currentSession);

    _taslakTemizle();
    await renderFindings();
  } finally {
    _bulguKaydediliyor = false;
  }
}

// Gerçek Android hotfix: taslak (henüz kaydedilmemiş) foto/ses/açıklama/
// hayati-risk state'i AYNI global değişkenlerde tutuluyor (aktifFotolarTaslak/
// aktifSeslerTaslak/hayatiRiskAktif) -- "Bulguyu Kaydet" sonrası temizleniyordu
// AMA "Bu Odayı Tamamla" (_odaSecimineDon) ve inceleme ekranına yeniden giriş
// (startInspection/resumeSession) bu taslağı HİÇ temizlemiyordu. Sonuç: Oda
// A'da kaydedilmemiş foto/ses/not bırakılıp "Bu Odayı Tamamla"ya basılırsa,
// Oda B ekranı açılınca aynı taslak (foto/ses önizlemesi, textarea, hayati
// risk durumu) hâlâ görünüyordu -- kaydedilirse Oda B'nin denetimId'siyle
// ama Oda A'nın içeriğiyle bir bulgu oluşuyordu. Bu fonksiyon merkezi taslak
// temizleyicidir; inceleme ekranına HER giriş noktasında (yeni/mevcut denetim
// başlatma, geçmişten devam etme) çağrılmalı.
function _taslakTemizle() {
  aktifFotolarTaslak = [];
  aktifSeslerTaslak = [];
  hayatiRiskAktif = false;
  _hayatiRiskButonGuncelle();
  _sesButonSifirla();
  _fotoOnizlemeGoster();
  _sesOnizlemeGoster();
  const metin = document.getElementById('finding-manual');
  if (metin) metin.value = '';
}

function addQuickFinding(text) {
  document.getElementById('finding-manual').value = text;
  saveFinding();
}

async function renderFindings() {
  sessionBulgular = await dbIndexTumu('bulgular', 'denetimId', currentSession.id);
  sessionBulgular.sort((a, b) => a.zaman.localeCompare(b.zaman));

  const list = document.getElementById('findings-list');
  if (sessionBulgular.length === 0) {
    list.innerHTML = '<p style="color:#999">Henüz bulgu eklenmedi.</p>';
    return;
  }
  list.innerHTML = sessionBulgular.map(f => {
    const fotolar = f.fotolar || [];
    const sesler = f.sesler || [];
    return `
    <div class="finding-item"${f.hayatiRisk ? ' style="border-left-color:#e74c3c"' : ''}>
      <div class="finding-meta">${new Date(f.zaman).toLocaleTimeString('tr-TR')}
        ${fotolar.length ? ` 📷×${fotolar.length}` : ''}${sesler.length ? ` 🎤×${sesler.length}` : ''}${f.hayatiRisk ? ' ⚠ HAYATİ RİSK' : ''}</div>
      ${f.metin ? `<div>${_esc(f.metin)}</div>` : ''}
      ${fotolar.length ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;">
        ${fotolar.map((foto, i) => `<div style="position:relative;">
          <img src="${URL.createObjectURL(foto.blob)}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;display:block">
          <span style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);color:white;font-size:0.7rem;padding:1px 5px;border-radius:8px;">${i + 1}</span>
        </div>`).join('')}
      </div>` : ''}
      ${sesler.length ? sesler.map((ses, i) => `
        <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
          <span style="font-size:0.75rem; color:#666;">🎤${i + 1}</span>
          <audio controls src="${URL.createObjectURL(ses.blob)}" style="height:32px;max-width:200px"></audio>
        </div>`).join('') : ''}
      <button onclick="askDeleteFinding('${f.id}')" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>`;
  }).join('');
}

// ─── GEÇMİŞ LİSTESİ ─────────────────────────────────────────
// Geçmiş Kayıtlar birim başlığı altında gruplanır (düz liste yerine) —
// aynı birimde çok sayıda oda ziyareti birikince okunaklı kalsın diye.
async function loadInspectionsList() {
  const denetimler = await dbTumu('denetimler');
  const list = document.getElementById('inspections-list');
  if (denetimler.length === 0) {
    list.innerHTML = '<p style="color:#999">Kayıt bulunamadı.</p>';
    return;
  }
  denetimler.sort((a, b) => b.baslangic.localeCompare(a.baslangic));

  const gruplar = new Map();   // birimId -> { birimAdi, kayitlar: [] }
  for (const d of denetimler) {
    const key = d.birimId || '?';
    if (!gruplar.has(key)) gruplar.set(key, { birimAdi: d.bina || 'Bilinmeyen Birim', kayitlar: [] });
    gruplar.get(key).kayitlar.push(d);
  }

  const gruplarHtml = await Promise.all([...gruplar.values()].map(async (grup) => {
    const satirlar = await Promise.all(grup.kayitlar.map(async d => {
      const bulgular = await dbIndexTumu('bulgular', 'denetimId', d.id);
      return `
      <div class="swipe-wrap" style="position:relative; overflow:hidden; border-radius:0 8px 8px 0; margin-bottom:10px;">
        <div style="position:absolute; inset:0; background:#e74c3c; display:flex; align-items:center; justify-content:flex-end; padding-right:20px; color:white;">
          <i class="fas fa-trash"></i>
        </div>
        <div class="finding-item swipe-content" data-swipe-id="${d.id}" style="cursor:pointer; margin-bottom:0;" onclick="resumeSession('${d.id}')">
          <div class="finding-meta">${new Date(d.baslangic).toLocaleString('tr-TR')}</div>
          <div class="finding-loc">${_esc(d.kat || '')} / Oda ${_esc(d.oda)}</div>
          <div style="font-size:0.85rem;color:#666">${bulgular.length} bulgu</div>
        </div>
      </div>`;
    }));
    return `
    <details class="card" style="margin-bottom:12px;" open>
      <summary style="cursor:pointer; font-weight:bold; color:var(--primary);">
        ${_esc(grup.birimAdi)} <span style="font-weight:normal; color:#999; font-size:0.85rem;">(${grup.kayitlar.length} kayıt)</span>
      </summary>
      <div style="margin-top:10px;">${satirlar.join('')}</div>
    </details>`;
  }));
  list.innerHTML = gruplarHtml.join('');
  list.querySelectorAll('.swipe-content[data-swipe-id]').forEach(el => {
    _swipeAyarla(el, () => askDeleteSession(el.dataset.swipeId));
  });
}

// Genel amaçlı yana-kaydırarak-silme: dar chip'lerde pratik değil ama geniş
// liste satırlarında (Geçmiş Kayıtlar, Birim Yönet) doğal ve hızlı çalışır.
// NOT: Ilk surumde `touch-action` hic ayarlanmamisti — tarayici yatay
// suruklemeyi kendi sayfa kaydirma hareketi saniyor, JS'in touchmove'u hicbir
// zaman anlamli bir deger almiyordu (parmakla kaydirinca "hicbir sey olmuyor"
// hissi buradan geliyordu). `pan-y` ile dikey kaydirma tarayiciya birakilir,
// yatay hareket JS'e ayrilir.
function _swipeAyarla(el, onSil) {
  let basX = 0, guncelX = 0, surukleniyor = false;
  const ESIK = -70;
  el.style.touchAction = 'pan-y';

  const basla = (x) => { basX = x; surukleniyor = true; el.style.transition = 'none'; };
  const tasi = (x) => {
    if (!surukleniyor) return;
    guncelX = Math.min(0, x - basX);
    el.style.transform = `translateX(${guncelX}px)`;
  };
  const bitir = () => {
    if (!surukleniyor) return;
    surukleniyor = false;
    el.style.transition = 'transform 0.2s';
    // onSil() bir onay modalı açar (askDeleteSession gibi) — silme kesin değil,
    // bu yüzden satırı önden gizlemiyoruz. Onaylanırsa liste zaten yeniden çizilip
    // satırı kaldıracak; "Vazgeç" denirse satır burada zaten yerinde duruyor olur.
    if (guncelX < ESIK) onSil();
    el.style.transform = 'translateX(0)';
    guncelX = 0;
  };

  el.addEventListener('touchstart', e => basla(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchmove', e => tasi(e.touches[0].clientX), { passive: true });
  el.addEventListener('touchend', bitir);
}

async function resumeSession(id) {
  const s = await dbGetir('denetimler', id);
  if (!s) return;
  currentSession = s;
  _taslakTemizle();   // geçmişten devam ederken de önceki oda/oturumdan kalan taslak taşınmaz
  updateLocationDisplay();
  showScreen('inspection');
  _ekraniPushEt('inceleme');
  startTimer();
  await renderFindings();
}

// ─── SİLME (ONAY MEKANİZMASI — HER SEVİYEDE) ─────────────────
function askDeleteSession(id) {
  showModal(
    'Kaydı Sil',
    'Bu denetim kaydı ve içindeki TÜM bulgular kalıcı olarak silinecek. Emin misiniz?',
    async () => {
      const bulgular = await dbIndexTumu('bulgular', 'denetimId', id);
      for (const b of bulgular) await dbSil('bulgular', b.id);
      await dbSil('denetimler', id);
      await loadInspectionsList();
    },
    'Evet, Sil',
    'btn-danger'
  );
}

function askDeleteFinding(id) {
  showModal(
    'Bulguyu Sil',
    'Bu bulgu (ve varsa fotoğrafı) kalıcı olarak silinecek. Emin misiniz?',
    async () => {
      await dbSil('bulgular', id);
      await renderFindings();
    },
    'Evet, Sil',
    'btn-danger'
  );
}

async function askDeleteAll() {
  showModal(
    '⚠️ Tüm Veriyi Sıfırla',
    'Tüm kurumlar, birimler, denetimler ve bulgular silinecek. Önce tam yedek ZIP indirilecek. ' +
    'Bu işlem GERİ ALINAMAZ. Devam etmek istiyor musunuz?',
    async () => {
      await tumVeriyiZipleVeIndir();
      for (const store of ['bulgular', 'denetimler', 'birimler', 'kurumlar']) {
        const tumu = await dbTumu(store);
        for (const kayit of tumu) await dbSil(store, kayit.id);
      }
      await kurumlariYukle();
      await loadInspectionsList();
    },
    'Yedekle ve Sil',
    'btn-danger'
  );
}

// ─── MODAL ───────────────────────────────────────────────────
function showModal(title, text, onConfirm, btnText = 'Onayla', btnClass = 'btn-primary') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').textContent   = text;
  const btn = document.getElementById('modal-action-btn');
  btn.textContent = btnText;
  btn.className   = `btn ${btnClass}`;
  modalCallback   = onConfirm;
  document.getElementById('modal-confirm').style.display = 'flex';
  _modalHistoryAc();
}

function closeModal() {
  document.getElementById('modal-confirm').style.display = 'none';
  modalCallback = null;
  _modalHistoryKapat();
}

document.getElementById('modal-action-btn') &&
  document.getElementById('modal-action-btn').addEventListener('click', () => {
    const cb = modalCallback;
    closeModal();
    if (cb) cb();
  });

// ─── FORM MODAL (veri girişli — Yeni Birim / Yeni Oda) ───────
function showFormModal(title, bodyHtml, onConfirm, btnText = 'Kaydet') {
  document.getElementById('form-title').textContent = title;
  document.getElementById('form-body').innerHTML = bodyHtml;
  const btn = document.getElementById('form-action-btn');
  btn.textContent = btnText;
  formConfirmCallback = onConfirm;
  document.getElementById('modal-form').style.display = 'flex';
  _modalHistoryAc();
}

function closeFormModal() {
  document.getElementById('modal-form').style.display = 'none';
  formConfirmCallback = null;
  _modalHistoryKapat();
}
if (typeof window !== 'undefined') window.closeFormModal = closeFormModal;

document.getElementById('form-action-btn') &&
  document.getElementById('form-action-btn').addEventListener('click', async () => {
    if (formConfirmCallback) await formConfirmCallback();
  });

// ─── GERİ / SETUP ────────────────────────────────────────────
function goToSetup() {
  _geriTikla('screen-inspection');
}

// Alt sticky aksiyon barındaki "Geri" butonu -- üst-soldaki geri okuyla
// AYNI davranış (goToSetup). Ayrı bir fonksiyon adı kullanılmasının TEK
// nedeni: `button[onclick="goToSetup()"]` seçicisi birçok mevcut testte
// TEK elemanı bulmayı varsayıyor -- aynı onclick metniyle ikinci bir buton
// eklemek o seçicileri "strict mode violation" ile kırardı.
function _altGeriTikla() {
  goToSetup();
}
if (typeof window !== 'undefined') window._altGeriTikla = _altGeriTikla;

// ─── KAMERA — İKİ AYRI GÖREV ──────────────────────────────────
// 'kanit'  : Bulgu Ekle ekranındaki Çek-Onayla — kanıt fotoğrafı, OCR YOK.
// 'etiket' : Oda ekleme formundaki 📷 — kapı/pano etiketi OKUNUR, Oda No'ya yazılır.
async function openOCR(mod = 'kanit') {
  kameraModu = mod;
  try {
    ocrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('video').srcObject = ocrStream;
    document.getElementById('camera-ui').style.display = 'block';
  } catch (e) {
    alert('Kamera erişimi reddedildi: ' + e.message);
  }
}
if (typeof window !== 'undefined') window.openOCR = openOCR;

function closeOCR() {
  if (ocrStream) ocrStream.getTracks().forEach(t => t.stop());
  document.getElementById('camera-ui').style.display = 'none';
}

async function capturePhoto() {
  const video  = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  canvas.width  = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  closeOCR();

  if (kameraModu === 'etiket') {
    await _etiketOku(canvas);
    return;
  }

  const imageData = canvas.toDataURL('image/jpeg', 0.95);
  const sonuc = await compressImage(imageData);
  aktifFotolarTaslak.push(sonuc);   // ÜZERİNE YAZMAZ — listeye eklenir, sınırsız
  console.log('[sıkıştırma] Kayda hazır foto:', boyutBiçimle(sonuc.sikistirilmisBoyut),
    sonuc.sikistirildi ? '(sıkıştırıldı)' : '(orijinal korundu)');
  _fotoOnizlemeGoster();
}

// Bekleyen (henüz kaydedilmemiş) tüm fotoğrafları numaralı gösterir;
// her birinin yanında ✕ ile kayıttan önce çıkarma imkânı var.
function _fotoOnizlemeGoster() {
  const el = document.getElementById('foto-onizleme');
  if (!el) return;
  if (aktifFotolarTaslak.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
      ${aktifFotolarTaslak.map((sonuc, i) => {
        const url = sonuc.blob ? URL.createObjectURL(sonuc.blob) : sonuc.dataUrl;
        return `<div style="position:relative;">
          <img src="${url}" style="width:70px;height:70px;object-fit:cover;border-radius:6px;display:block">
          <span style="position:absolute;bottom:2px;left:2px;background:rgba(0,0,0,0.6);color:white;font-size:0.7rem;padding:1px 5px;border-radius:8px;">${i + 1}</span>
          <button onclick="_fotoTaslakSil(${i})" style="position:absolute;top:-6px;right:-6px;background:#e74c3c;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:0.75rem;cursor:pointer;">✕</button>
        </div>`;
      }).join('')}
    </div>
    <div style="font-size:0.75rem;color:#27ae60;margin-top:4px">
      📷 ${aktifFotolarTaslak.length} fotoğraf hazır — Kaydet'e basınca bulguya eklenecek
    </div>`;
}

function _fotoTaslakSil(index) {
  aktifFotolarTaslak.splice(index, 1);
  _fotoOnizlemeGoster();
}
if (typeof window !== 'undefined') window._fotoTaslakSil = _fotoTaslakSil;

// Kapı/pano etiketi okuma: hem harf+rakam kodları (A101, Z-15) hem de
// düz yazı etiketleri ("Teknik Servis") aday olarak sunulur.
async function _etiketOku(canvas) {
  const imageData = canvas.toDataURL('image/jpeg', 0.95);
  const adayKutu = document.getElementById('kat-alan-oda-adaylar');
  if (adayKutu) adayKutu.innerHTML = 'Okunuyor…';
  try {
    const result = await Tesseract.recognize(imageData, 'tur', { logger: () => {} });
    const hamMetin = result.data.text.trim();
    const kodAdaylari = ocrAdaylarUret(hamMetin);
    const tumAdaylar = [...kodAdaylari];
    if (hamMetin && !tumAdaylar.includes(hamMetin)) tumAdaylar.push(hamMetin);

    if (!adayKutu) return;
    if (tumAdaylar.length === 0) {
      adayKutu.innerHTML = '<span style="color:#999">Okunamadı, elle yazın.</span>';
      return;
    }
    adayKutu.innerHTML = tumAdaylar.map(a =>
      `<div class="chip" onclick="document.getElementById('kat-alan-oda-no').value='${_escAttr(a).replace(/'/g, "\\'")}'; _katAlanOdaNoDegisti()">${_esc(a)}</div>`
    ).join('');
  } catch (e) {
    if (adayKutu) adayKutu.innerHTML = `<span style="color:#e74c3c">OCR hatası: ${_esc(e.message)}</span>`;
  }
}

// ─── SES KAYDI (bulgu notu — tamamen offline, MediaRecorder) ─
async function toggleSesKaydi() {
  const btn = document.getElementById('btn-ses-kaydi');
  if (sesRecorder && sesRecorder.state === 'recording') {
    sesRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    sesChunks = [];
    sesRecorder = new MediaRecorder(stream);
    const baslangic = Date.now();
    sesRecorder.ondataavailable = e => { if (e.data.size > 0) sesChunks.push(e.data); };
    sesRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(sesChunks, { type: 'audio/webm' });
      aktifSeslerTaslak.push({ blob, sure: Math.round((Date.now() - baslangic) / 1000) });  // ÜZERİNE YAZMAZ
      _sesButonSifirla();
      _sesOnizlemeGoster();
    };
    sesRecorder.start();
    if (btn) {
      btn.classList.add('aktif');
      const etiket = document.getElementById('ses-buton-etiket');
      if (etiket) etiket.textContent = 'Durdur';
      const ikon = btn.querySelector('i');
      if (ikon) { ikon.classList.remove('fa-microphone'); ikon.classList.add('fa-stop'); }
    }
  } catch (e) {
    alert('Mikrofon erişimi reddedildi: ' + e.message);
  }
}
if (typeof window !== 'undefined') window.toggleSesKaydi = toggleSesKaydi;

function _sesButonSifirla() {
  const btn = document.getElementById('btn-ses-kaydi');
  if (!btn) return;
  btn.classList.remove('aktif');
  const etiket = document.getElementById('ses-buton-etiket');
  if (etiket) etiket.textContent = 'Ses notu';
  const ikon = btn.querySelector('i');
  if (ikon) { ikon.classList.remove('fa-stop'); ikon.classList.add('fa-microphone'); }
}

// Bekleyen (henüz kaydedilmemiş) tüm ses notlarını numaralı gösterir,
// her birinin yanında ✕ ile kayıttan önce çıkarma imkânı var.
function _sesOnizlemeGoster() {
  const el = document.getElementById('ses-onizleme');
  if (!el) return;
  if (aktifSeslerTaslak.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = aktifSeslerTaslak.map((s, i) => `
    <div style="display:flex; align-items:center; gap:6px; margin-top:6px;">
      <span style="font-size:0.75rem; color:#666;">🎤${i + 1} (${s.sure}sn)</span>
      <audio controls src="${URL.createObjectURL(s.blob)}" style="height:28px;max-width:180px"></audio>
      <button onclick="_sesTaslakSil(${i})" style="background:#e74c3c;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:0.75rem;cursor:pointer;">✕</button>
    </div>`).join('');
}

function _sesTaslakSil(index) {
  aktifSeslerTaslak.splice(index, 1);
  _sesOnizlemeGoster();
}
if (typeof window !== 'undefined') window._sesTaslakSil = _sesTaslakSil;

// Dışarıdan bir dosya/blob/dataURL alıp kayda hazır sıkıştırılmış veri üretir
// (galeri/dosya seçme akışı için — aktif taslak listesine EKLENİR).
async function fotoAlVeSikistir(kaynak) {
  const sonuc = await compressImage(kaynak);
  aktifFotolarTaslak.push(sonuc);
  _fotoOnizlemeGoster();
  return sonuc;
}
if (typeof window !== 'undefined') window.fotoAlVeSikistir = fotoAlVeSikistir;

// Galeri/dosya seçici ile "Resim Yükle" butonu (PWA Commit 4L). Kamera
// akışını hiç değiştirmez -- yalnız aynı aktifFotolarTaslak/fotoAlVeSikistir
// hattına, ayrı bir dosya kaynağından besler.
async function _galeriDosyaSecildi(input) {
  const dosya = input.files && input.files[0];
  const durum = document.getElementById('galeri-foto-durum');
  if (!dosya) return;   // seçim iptal edildi -- no-op
  input.value = '';     // aynı dosya tekrar seçilebilsin

  if (!dosya.type || !dosya.type.startsWith('image/')) {
    if (durum) durum.textContent = 'Yalnız görsel dosyası yüklenebilir.';
    return;
  }
  try {
    await _resmiYukle(dosya);   // DB'ye eklemeden önce gerçekten çözümlenebildiğini doğrula
    await fotoAlVeSikistir(dosya);
    if (durum) durum.textContent = 'Resim denetime eklendi.';
  } catch (e) {
    if (durum) durum.textContent = 'Görsel okunamadı.';
  }
}
if (typeof window !== 'undefined') window._galeriDosyaSecildi = _galeriDosyaSecildi;

// ─── ZIP DIŞA AKTARMA (Birim / Kurum) ────────────────────────
// Ortak format: denetimler.json (array) + fotolar/ (düz, `${denetimId}_${bulguId}.jpg`)
// Bu format tek denetimli (birim) ve çok denetimli (kurum) ihracatta AYNIDIR.

async function _denetimPaketiOlustur(denetim, kurumAdi, birimAdi) {
  const bulgular = await dbIndexTumu('bulgular', 'denetimId', denetim.id);
  const dosyalar = [];
  const sesDosyalari = [];
  const ekGirdiler = [];

  const tespitler = bulgular.map(b => {
    const bFotolar = b.fotolar || [];
    const bSesler = b.sesler || [];
    const fotoAdlari = bFotolar.map((foto, i) => {
      const ad = `${denetim.id}_${b.id}_${i + 1}.jpg`;
      dosyalar.push(ad);
      ekGirdiler.push({ ad: `fotolar/${ad}`, veri: foto.blob });
      return ad;
    });
    const sesAdlari = bSesler.map((ses, i) => {
      const ad = `${denetim.id}_${b.id}_${i + 1}.webm`;
      sesDosyalari.push(ad);
      ekGirdiler.push({ ad: `sesler/${ad}`, veri: ses.blob });
      return ad;
    });
    return {
      alanTipi: denetim.alanTipi || denetim.kat || 'genel',
      konumKodu: `${denetim.bina}/${denetim.kat}/${denetim.oda}`,
      not: b.metin,
      hayatiRisk: !!b.hayatiRisk,
      fotografsiz: fotoAdlari.length === 0,
      sesNotlari: sesAdlari,
      checklist: null,
      zaman: b.zaman,
      fotolar: fotoAdlari
    };
  });

  const paket = {
    denetim: {
      id: denetim.id,
      baslangic: denetim.baslangic,
      isyeri: birimAdi,
      tur: denetim.tur || 'saha',
      binaProfili: denetim.bina,
      kurumId: denetim.kurumId,
      kurumAdi,
      birimId: denetim.birimId,
      birimAdi,
      kat: denetim.kat,
      oda: denetim.oda,
      odaNo: denetim.odaNo || '',
      sorumlu: denetim.sorumlu
    },
    tespitler,
    manifest: { dosyalar, fotoSayisi: dosyalar.length, sesDosyalari, sesSayisi: sesDosyalari.length }
  };
  return { paket, fotoGirdileri: ekGirdiler };
}

async function _zipVeIndir(denetimler, dosyaAdiOnEki) {
  if (denetimler.length === 0) {
    alert('Dışa aktarılacak denetim bulunamadı.');
    return;
  }
  const paketler = [];
  const tumFotoGirdileri = [];

  for (const d of denetimler) {
    const birim = await dbGetir('birimler', d.birimId);
    const kurum = birim ? await dbGetir('kurumlar', birim.kurumId) : null;
    const { paket, fotoGirdileri } = await _denetimPaketiOlustur(
      d, kurum ? kurum.ad : '?', birim ? birim.ad : '?');
    paketler.push(paket);
    tumFotoGirdileri.push(...fotoGirdileri);
  }

  const girdiler = [
    { ad: 'denetimler.json', veri: JSON.stringify(paketler, null, 2) },
    ...tumFotoGirdileri
  ];
  const blob = await zipYaz(girdiler);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${dosyaAdiOnEki}_${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function _dosyaAdiTemizle(ad) {
  return String(ad || 'yedek').replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]+/g, '_');
}

// Birim listesini yana-kaydırarak-silme ile yönetme ekranı. Not: burada
// showModal (onay modalı) yerine düz confirm() kullanılır — showFormModal
// zaten açıkken ikinci bir .modal katmanı (aynı z-index) üst üste binip
// görsel çakışma yaratabilirdi; native confirm() bu sorunu tamamen bypass eder.
async function birimleriYonetAc() {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }
  const birimler = await dbIndexTumu('birimler', 'kurumId', kurumId);
  if (birimler.length === 0) { alert('Bu kurumda henüz birim yok.'); return; }

  const satirlar = birimler.map(b => `
    <div class="swipe-wrap" style="position:relative; overflow:hidden; border-radius:0 8px 8px 0; margin-bottom:8px;">
      <div style="position:absolute; inset:0; background:#e74c3c; display:flex; align-items:center; justify-content:flex-end; padding-right:20px; color:white;">
        <i class="fas fa-trash"></i>
      </div>
      <div class="finding-item swipe-content" data-swipe-birim-id="${b.id}" style="margin-bottom:0;">
        <div class="finding-loc">${_esc(b.ad)}</div>
        <div style="font-size:0.8rem;color:#666">${PROFILLER[b.tip] ? PROFILLER[b.tip].ad : (b.tip || 'genel')}</div>
      </div>
    </div>`).join('');

  showFormModal('Birimleri Yönet', `
    <p style="font-size:0.85rem; color:#666; margin-top:0;">Silmek için sola kaydırın.</p>
    <div id="birim-yonet-liste">${satirlar}</div>
  `, async () => { closeFormModal(); }, 'Kapat');

  document.querySelectorAll('#birim-yonet-liste .swipe-content').forEach(el => {
    _swipeAyarla(el, () => _birimSilOnayla(el.dataset.swipeBirimId));
  });
}
if (typeof window !== 'undefined') window.birimleriYonetAc = birimleriYonetAc;

async function _birimSilOnayla(birimId) {
  const denetimler = await dbIndexTumu('denetimler', 'birimId', birimId);
  const mesaj = denetimler.length > 0
    ? `Bu birim silinirse ${denetimler.length} denetim kaydı ve tüm bulguları (foto/ses dahil) da silinir. Emin misiniz?`
    : 'Bu birim silinsin mi?';
  if (!confirm(mesaj)) return;

  for (const d of denetimler) {
    const bulgular = await dbIndexTumu('bulgular', 'denetimId', d.id);
    for (const b of bulgular) await dbSil('bulgular', b.id);
    await dbSil('denetimler', d.id);
  }
  await dbSil('birimler', birimId);
  closeFormModal();
  await birimleriYukle();
  await loadInspectionsList();
}
if (typeof window !== 'undefined') window._birimSilOnayla = _birimSilOnayla;

async function yedekModalAc() {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }
  const kurum = await dbGetir('kurumlar', kurumId);
  const birimler = await dbIndexTumu('birimler', 'kurumId', kurumId);
  if (birimler.length === 0) { alert('Bu kurumda henüz birim yok.'); return; }

  const suankiBirimId = document.getElementById('setup-birim').value;
  const satirlar = birimler.map(b => `
    <label style="display:flex; align-items:center; gap:8px; padding:8px 0; cursor:pointer;">
      <input type="checkbox" class="yedek-birim-cb" value="${b.id}" ${b.id === suankiBirimId ? 'checked' : ''} style="width:auto;">
      <span>${_esc(b.ad)}</span>
    </label>`).join('');

  showFormModal(`Yedekle — ${kurum ? kurum.ad : ''}`, `
    <div style="margin-bottom:10px;">
      <a href="#" onclick="_yedekTumunuSecToggle(event)" style="font-size:0.85rem; color:var(--accent);">Tümünü Seç / Kaldır</a>
    </div>
    <div>${satirlar}</div>
  `, async () => {
    const secililer = [...document.querySelectorAll('.yedek-birim-cb:checked')].map(cb => cb.value);
    if (secililer.length === 0) { alert('En az bir birim seçin.'); return; }

    let tumDenetimler = [];
    const secilenAdlar = [];
    for (const birimId of secililer) {
      const b = birimler.find(x => x.id === birimId);
      if (b) secilenAdlar.push(b.ad);
      const d = await dbIndexTumu('denetimler', 'birimId', birimId);
      tumDenetimler = tumDenetimler.concat(d);
    }
    closeFormModal();
    const dosyaOnEki = secililer.length === birimler.length
      ? `kurum_${_dosyaAdiTemizle(kurum ? kurum.ad : '')}`
      : `birimler_${_dosyaAdiTemizle(secilenAdlar.join('_'))}`;
    await _zipVeIndir(tumDenetimler, dosyaOnEki);
  }, 'ZIP İndir');
}
if (typeof window !== 'undefined') window.yedekModalAc = yedekModalAc;

function _yedekTumunuSecToggle(e) {
  e.preventDefault();
  const kutular = document.querySelectorAll('.yedek-birim-cb');
  const hepsiSecili = [...kutular].every(cb => cb.checked);
  kutular.forEach(cb => { cb.checked = !hepsiSecili; });
}
if (typeof window !== 'undefined') window._yedekTumunuSecToggle = _yedekTumunuSecToggle;

async function tumVeriyiZipleVeIndir() {
  const denetimler = await dbTumu('denetimler');
  await _zipVeIndir(denetimler, 'isg_tam_yedek');
}

// ─── YEDEK / GERİ YÜKLE (üst bar butonu) ─────────────────────
function backupRestore() {
  showModal(
    'Yedek İşlemleri',
    'Tüm kurumlar için tam yedek ZIP indirmek ister misiniz?',
    () => { tumVeriyiZipleVeIndir(); },
    'Tam Yedek İndir',
    'btn-primary'
  );
}
