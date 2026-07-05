// ============================================================
// İSG SAHA ASİSTANI - app.js
// Versiyon: v0.5.0
// Güncelleme: IndexedDB'ye tam geçiş (Kurum > Birim > Denetim > Bulgu),
//             foto artık bulguya kalıcı bağlanıyor, bulgu silme onayı,
//             hayati risk etiketi, birim/kurum bazlı ZIP dışa aktarma
//             (harici kütüphane yok — dahili store-only ZIP yazıcı).
// ============================================================

const APP_VERSION = 'v0.9.0';
const DB_NAME = 'isgSahaDB';
const DB_VERSION = 1;

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
  idari:     { ad: 'İdari bina (rektörlük, daire bşk.)', alanlar: ORTAK_ALANLAR },
  egitim:    { ad: 'Eğitim binası (fakülte)',            alanlar: [...EGITIM_ALANLAR, ...ORTAK_ALANLAR] },
  myo:       { ad: 'MYO',                                alanlar: [...EGITIM_ALANLAR, ...MYO_EK_ALANLAR, ...ORTAK_ALANLAR] },
  hastane:   { ad: 'Hastane',                            alanlar: [...HASTANE_ALANLAR, ...ORTAK_ALANLAR] },
  kutuphane: { ad: 'Kütüphane (merkez)',                 alanlar: [...KUTUPHANE_ALANLAR, ...ORTAK_ALANLAR] },
  havuz:     { ad: 'Yüzme havuzu',                       alanlar: [...HAVUZ_ALANLAR, ...ORTAK_ALANLAR] },
  spor:      { ad: 'Spor kompleksi',                     alanlar: [...SPOR_ALANLAR, ...ORTAK_ALANLAR] },
  kres:      { ad: 'Kreş',                               alanlar: [...KRES_ALANLAR, ...ORTAK_ALANLAR] },
  yemekhane: { ad: 'Merkezi yemekhane',                  alanlar: [...YEMEKHANE_ALANLAR, ...ORTAK_ALANLAR] }
};

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

// ─── BAŞLANGIÇ ───────────────────────────────────────────────
window.addEventListener('load', () => {
  console.log(`İSG Saha Asistanı ${APP_VERSION} başlatıldı`);
  showScreen('setup');
  kurumlariYukle();
  loadInspectionsList();
  if (typeof history !== 'undefined' && history.replaceState) {
    history.replaceState({ ekran: 'kurulum' }, '');
  }
});

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

function _geriTikla(oncekiEkranId) {
  const oncekiAktifMi = document.getElementById(oncekiEkranId).classList.contains('active');
  if (typeof history !== 'undefined' && history.back) history.back();
  setTimeout(() => {
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
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    birimler.map(b => `<option value="${b.id}">${_esc(b.ad)}</option>`).join('');
  if (secili && birimler.some(b => b.id === secili)) sel.value = secili;
}

async function yeniKurumEkle() {
  const ad = prompt('Kurum adı (örn: KMÜ Rektörlüğü, Veterinerlik Fakültesi):');
  if (!ad || !ad.trim()) return;
  const kurum = { id: uuid(), ad: ad.trim(), olusturma: new Date().toISOString() };
  await dbEkle('kurumlar', kurum);
  await kurumlariYukle();
  document.getElementById('setup-kurum').value = kurum.id;
  await birimleriYukle();
}

async function yeniBirimEkle() {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }

  const profilSecenekleri = '<option value="genel">Genel / Diğer</option>' +
    Object.entries(PROFILLER).map(([k, v]) => `<option value="${k}">${_esc(v.ad)}</option>`).join('');

  showFormModal('Yeni Birim', `
    <div class="input-group">
      <label>Birim Adı</label>
      <input type="text" id="form-birim-ad" placeholder="Örn: Veteriner Hastanesi">
    </div>
    <div class="input-group">
      <label>Bina Tipi (alan tipi listesini belirler)</label>
      <select id="form-birim-profil">${profilSecenekleri}</select>
    </div>
    <div class="input-group">
      <label>Kaç Katlı?</label>
      <input type="number" id="form-birim-kat" value="1" min="1">
    </div>
  `, async () => {
    const ad = document.getElementById('form-birim-ad').value.trim();
    if (!ad) { alert('Birim adı gerekli.'); return; }
    const profil = document.getElementById('form-birim-profil').value;
    const katSayisi = parseInt(document.getElementById('form-birim-kat').value) || 1;
    let katlar = ['Zemin'];
    if (katSayisi > 1) katlar = ['Zemin', ...Array.from({ length: katSayisi - 1 }, (_, i) => `${i + 1}.Kat`)];

    const birim = { id: uuid(), kurumId, ad, tip: profil, katlar, odalar: [], ozelAlanlar: [], olusturma: new Date().toISOString() };
    await dbEkle('birimler', birim);
    closeFormModal();
    await birimleriYukle();
    document.getElementById('setup-birim').value = birim.id;
  }, 'Birimi Oluştur');
}

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

// Kat çiplerini çizer + seçili katı ayarlar. Hem ilk açılışta hem "+ Kat Ekle"
// sonrası yeniden çizimde kullanılır (tek kaynak, tekrar yok).
async function _katChipleriCiz(katlar, secilecekKat) {
  const chips = document.getElementById('kat-alan-kat-chips');
  chips.innerHTML = '';
  katlar.forEach(kat => {
    const c = document.createElement('div');
    c.className = 'chip' + (kat === secilecekKat ? ' active' : '');
    c.textContent = kat;
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
    `<div class="chip" onclick="_katAlanMevcutOdaSec('${o.id}', this)">${_esc(o.ad)}</div>`
  ).join('');
}

// NOT: `el` parametresi olarak DOM elemanı doğrudan alınır — async fonksiyon
// içinde await'ten sonra global `event` nesnesine güvenmek kırılgandır
// (mikrogörev sınırından sonra window.event sıfırlanabilir).
async function _katAlanMevcutOdaSec(odaId, el) {
  const birimId = document.getElementById('setup-birim').value;
  const birim = await dbGetir('birimler', birimId);
  const oda = (birim.odalar || []).find(o => o.id === odaId);
  if (!oda) return;
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
  document.getElementById('kat-alan-hizli-chips').innerHTML =
    hizli.map(chipHtml).join('') + ozel.map(chipHtml).join('') +
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

  const denetim = {
    id: uuid(),
    kurumId,
    birimId,
    bina: birim.ad,
    kat: secilenKat,
    odaId: odaKaydi.id,
    oda: odaKaydi.ad,
    alanTipi: odaKaydi.alanTipi,
    odaNo: odaKaydi.no,
    sorumlu: resp,
    baslangic: new Date().toISOString(),
    guncelleme: new Date().toISOString()
  };
  await dbEkle('denetimler', denetim);

  currentSession = denetim;
  sessionBulgular = [];
  updateLocationDisplay();
  showScreen('inspection');
  _ekraniPushEt('inceleme');   // Kat-Alan ekranı yığında kalır — geri tuşu ORAYA döner (Kurulum'a atlamaz)
  startTimer();
  await renderFindings();
}

function updateLocationDisplay() {
  if (!currentSession) return;
  const { bina, kat, oda } = currentSession;
  document.getElementById('current-loc-display').textContent =
    `${bina} / ${kat} / Oda ${oda}`;
}

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
  btn.style.background = hayatiRiskAktif ? '#e74c3c' : '#eee';
  btn.style.color = hayatiRiskAktif ? 'white' : '#333';
  btn.textContent = hayatiRiskAktif ? '⚠ Hayati Risk: AÇIK' : '⚠ Hayati Risk İşaretle';
}

// ─── BULGU KAYDET (çoklu fotoğraf + çoklu ses, sınırsız) ─────
async function saveFinding() {
  const text = document.getElementById('finding-manual').value.trim();
  if (!text && aktifFotolarTaslak.length === 0 && aktifSeslerTaslak.length === 0) {
    alert('Bulgu için metin, fotoğraf veya ses notundan en az biri gerekli.');
    return;
  }

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

  aktifFotolarTaslak = [];
  aktifSeslerTaslak = [];
  hayatiRiskAktif = false;
  _hayatiRiskButonGuncelle();
  _sesButonSifirla();
  _fotoOnizlemeGoster();
  _sesOnizlemeGoster();
  document.getElementById('finding-manual').value = '';
  await renderFindings();
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

// ─── SONRAKI ODA (birim altındaki kalıcı oda listesinde ilerler) ─
async function nextRoom() {
  if (!currentSession) return;

  const birim = await dbGetir('birimler', currentSession.birimId);
  const odalar = _birimOdalari(birim, currentSession.kat);
  const suankiIndeks = odalar.findIndex(o => o.id === currentSession.odaId);
  const sonraki = suankiIndeks >= 0 ? odalar[suankiIndeks + 1] : null;

  if (!sonraki) {
    alert('Bu kattaki son odadasınız. Yeni oda eklemek için Kurulum ekranındaki + butonunu kullanın.');
    return;
  }

  currentSession.odaId = sonraki.id;
  currentSession.oda = sonraki.ad;
  currentSession.alanTipi = sonraki.alanTipi;
  currentSession.odaNo = sonraki.no;
  currentSession.id = uuid();
  currentSession.baslangic = new Date().toISOString();
  currentSession.guncelleme = currentSession.baslangic;
  await dbEkle('denetimler', currentSession);   // yeni oda kaydı HEMEN kalıcı yazılır

  sessionBulgular = [];
  updateLocationDisplay();
  await renderFindings();
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
      <div class="finding-item" style="cursor:pointer" onclick="resumeSession('${d.id}')">
        <div class="finding-meta">${new Date(d.baslangic).toLocaleString('tr-TR')}</div>
        <div class="finding-loc">${_esc(d.kat || '')} / Oda ${_esc(d.oda)}</div>
        <div style="font-size:0.85rem;color:#666">${bulgular.length} bulgu</div>
        <button onclick="event.stopPropagation(); askDeleteSession('${d.id}')"
          style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
          <i class="fas fa-trash"></i>
        </button>
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
}

async function resumeSession(id) {
  const s = await dbGetir('denetimler', id);
  if (!s) return;
  currentSession = s;
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
      btn.textContent = '⏺ Kaydediliyor… (durdurmak için bas)';
      btn.style.background = '#e74c3c';
      btn.style.color = 'white';
    }
  } catch (e) {
    alert('Mikrofon erişimi reddedildi: ' + e.message);
  }
}
if (typeof window !== 'undefined') window.toggleSesKaydi = toggleSesKaydi;

function _sesButonSifirla() {
  const btn = document.getElementById('btn-ses-kaydi');
  if (!btn) return;
  btn.textContent = '🎤 Ses Notu Kaydet';
  btn.style.background = '#eee';
  btn.style.color = '#333';
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
      tur: 'saha',
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

// Kurum altındaki birimleri checkbox listesiyle gösterir; istenen kaçı
// seçilirse seçilir, tek ZIP'te birleştirilir. Esnek: 1 birim, birkaçı,
// ya da hepsi seçilebilir.
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
