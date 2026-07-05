// ============================================================
// İSG SAHA ASİSTANI - app.js
// Versiyon: v0.5.0
// Güncelleme: IndexedDB'ye tam geçiş (Kurum > Birim > Denetim > Bulgu),
//             foto artık bulguya kalıcı bağlanıyor, bulgu silme onayı,
//             hayati risk etiketi, birim/kurum bazlı ZIP dışa aktarma
//             (harici kütüphane yok — dahili store-only ZIP yazıcı).
// ============================================================

const APP_VERSION = 'v0.5.0';
const DB_NAME = 'isgSahaDB';
const DB_VERSION = 1;

// ─── STATE ───────────────────────────────────────────────────
let currentSession   = null;   // aktif denetim kaydı (IndexedDB 'denetimler' satırı)
let sessionBulgular  = [];     // aktif denetimin bulgu listesi (cache)
let sessionTimer     = null;
let modalCallback    = null;
let ocrStream        = null;
let aktifFotoTaslak  = null;   // capturePhoto()'dan gelen, kayda hazır sıkıştırılmış foto
let hayatiRiskAktif  = false;

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
});

// ─── EKRAN YÖNETİMİ ──────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add('active');
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
    await updateFloorChipsOrOdaInput();
    return;
  }
  sel.disabled = false;
  const secili = sel.value;
  const birimler = await dbIndexTumu('birimler', 'kurumId', kurumId);
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    birimler.map(b => `<option value="${b.id}">${_esc(b.ad)}</option>`).join('');
  if (secili && birimler.some(b => b.id === secili)) sel.value = secili;
  await updateFloorChipsOrOdaInput();
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
  const ad = prompt('Birim adı (örn: KMYO, Kütüphane, Veteriner Hastanesi, Daire Başkanlığı):');
  if (!ad || !ad.trim()) return;
  const katSayisiStr = prompt('Kaç katlı? (boş bırakırsanız tek kat "Zemin" olur)', '1');
  let katlar = ['Zemin'];
  const katSayisi = parseInt(katSayisiStr);
  if (!isNaN(katSayisi) && katSayisi > 1) {
    katlar = ['Zemin', ...Array.from({ length: katSayisi - 1 }, (_, i) => `${i + 1}.Kat`)];
  }
  const birim = { id: uuid(), kurumId, ad: ad.trim(), tip: 'genel', katlar, odalar: [], olusturma: new Date().toISOString() };
  await dbEkle('birimler', birim);
  await birimleriYukle();
  document.getElementById('setup-birim').value = birim.id;
  await updateFloorChipsOrOdaInput();
}

// ─── KAT ÇİPLERİ + ODA LİSTESİ (birim altında kalıcı) ────────
async function updateFloorChipsOrOdaInput() {
  const birimId = document.getElementById('setup-birim').value;
  const wrap  = document.getElementById('kat-secimi');
  const chips = document.getElementById('floor-chips');

  if (!birimId) {
    wrap.style.display = 'none';
    document.getElementById('setup-oda').innerHTML = '<option value="">Önce birim seçin</option>';
    return;
  }

  const birim = await dbGetir('birimler', birimId);
  const katlar = (birim && birim.katlar && birim.katlar.length) ? birim.katlar : ['Zemin'];

  chips.innerHTML = '';
  katlar.forEach((kat, i) => {
    const c = document.createElement('div');
    c.className = 'chip' + (i === 0 ? ' active' : '');
    c.textContent = kat;
    c.onclick = () => {
      chips.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      odalariYukle();
    };
    chips.appendChild(c);
  });
  wrap.style.display = 'block';
  await odalariYukle();
}

function getSelectedKat() {
  const active = document.querySelector('#floor-chips .chip.active');
  return active ? active.textContent : 'Zemin';
}

function _birimOdalari(birim, kat) {
  return (birim && Array.isArray(birim.odalar)) ? birim.odalar.filter(o => o.kat === kat) : [];
}

async function odalariYukle() {
  const birimId = document.getElementById('setup-birim').value;
  const sel = document.getElementById('setup-oda');
  if (!birimId) { sel.innerHTML = '<option value="">Önce birim seçin</option>'; return; }

  const birim = await dbGetir('birimler', birimId);
  const kat = getSelectedKat();
  const odalar = _birimOdalari(birim, kat);
  const secili = sel.value;

  if (odalar.length === 0) {
    sel.innerHTML = '<option value="">Bu katta oda yok — + ile ekleyin</option>';
    return;
  }
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    odalar.map(o => `<option value="${o.id}">${_esc(o.ad)}</option>`).join('');
  if (secili && odalar.some(o => o.id === secili)) sel.value = secili;
}

async function yeniOdaEkle() {
  const birimId = document.getElementById('setup-birim').value;
  if (!birimId) { alert('Önce bir birim seçin.'); return; }
  const ad = prompt('Oda/Alan adı veya no (örn: 203, Muayene Odası):');
  if (!ad || !ad.trim()) return;

  const birim = await dbGetir('birimler', birimId);
  if (!birim.odalar) birim.odalar = [];
  const oda = { id: uuid(), kat: getSelectedKat(), ad: ad.trim() };
  birim.odalar.push(oda);
  await dbGuncelle('birimler', birim);
  await odalariYukle();
  document.getElementById('setup-oda').value = oda.id;
}
if (typeof window !== 'undefined') window.yeniOdaEkle = yeniOdaEkle;

// ─── DENETİM BAŞLAT ──────────────────────────────────────────
async function startInspection() {
  const kurumId = document.getElementById('setup-kurum').value;
  const birimId = document.getElementById('setup-birim').value;
  const odaId = document.getElementById('setup-oda').value;
  const resp = document.getElementById('setup-responsible').value.trim();

  if (!kurumId) { alert('Lütfen kurum seçin.'); return; }
  if (!birimId) { alert('Lütfen birim seçin.'); return; }
  if (!odaId)  { alert('Lütfen oda/alan seçin (yoksa + ile ekleyin).'); return; }

  const birim = await dbGetir('birimler', birimId);
  const kat = getSelectedKat();
  const odaKaydi = _birimOdalari(birim, kat).find(o => o.id === odaId);

  const denetim = {
    id: uuid(),
    kurumId,
    birimId,
    bina: birim ? birim.ad : '?',
    kat,
    odaId,
    oda: odaKaydi ? odaKaydi.ad : '?',
    sorumlu: resp,
    baslangic: new Date().toISOString(),
    guncelleme: new Date().toISOString()
  };
  await dbEkle('denetimler', denetim);

  currentSession = denetim;
  sessionBulgular = [];
  updateLocationDisplay();
  showScreen('inspection');
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

// ─── BULGU KAYDET ────────────────────────────────────────────
async function saveFinding() {
  const text = document.getElementById('finding-manual').value.trim();
  if (!text) { alert('Bulgu metni boş olamaz.'); return; }

  const bulgu = {
    id: uuid(),
    denetimId: currentSession.id,
    metin: text,
    foto: aktifFotoTaslak ? aktifFotoTaslak.blob : null,
    fotoBoyut: aktifFotoTaslak ? aktifFotoTaslak.sikistirilmisBoyut : null,
    fotoGenislik: aktifFotoTaslak ? aktifFotoTaslak.genislik : null,
    fotoYukseklik: aktifFotoTaslak ? aktifFotoTaslak.yukseklik : null,
    hayatiRisk: hayatiRiskAktif,
    zaman: new Date().toISOString()
  };
  await dbEkle('bulgular', bulgu);
  currentSession.guncelleme = bulgu.zaman;
  await dbGuncelle('denetimler', currentSession);

  aktifFotoTaslak = null;
  hayatiRiskAktif = false;
  _hayatiRiskButonGuncelle();
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
  list.innerHTML = sessionBulgular.map(f => `
    <div class="finding-item"${f.hayatiRisk ? ' style="border-left-color:#e74c3c"' : ''}>
      <div class="finding-meta">${new Date(f.zaman).toLocaleTimeString('tr-TR')}
        ${f.foto ? ' 📷' : ''}${f.hayatiRisk ? ' ⚠ HAYATİ RİSK' : ''}</div>
      <div>${_esc(f.metin)}</div>
      <button onclick="askDeleteFinding('${f.id}')" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
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
  currentSession.id = uuid();
  currentSession.baslangic = new Date().toISOString();
  currentSession.guncelleme = currentSession.baslangic;
  await dbEkle('denetimler', currentSession);   // yeni oda kaydı HEMEN kalıcı yazılır

  sessionBulgular = [];
  updateLocationDisplay();
  await renderFindings();
}

// ─── GEÇMİŞ LİSTESİ ─────────────────────────────────────────
async function loadInspectionsList() {
  const denetimler = await dbTumu('denetimler');
  const list = document.getElementById('inspections-list');
  if (denetimler.length === 0) {
    list.innerHTML = '<p style="color:#999">Kayıt bulunamadı.</p>';
    return;
  }
  denetimler.sort((a, b) => b.baslangic.localeCompare(a.baslangic));
  const satirlar = await Promise.all(denetimler.map(async d => {
    const bulgular = await dbIndexTumu('bulgular', 'denetimId', d.id);
    return `
    <div class="finding-item" style="cursor:pointer" onclick="resumeSession('${d.id}')">
      <div class="finding-meta">${new Date(d.baslangic).toLocaleString('tr-TR')}</div>
      <div class="finding-loc">${_esc(d.bina)} / ${_esc(d.kat || '')} / Oda ${_esc(d.oda)}</div>
      <div style="font-size:0.85rem;color:#666">${bulgular.length} bulgu</div>
      <button onclick="event.stopPropagation(); askDeleteSession('${d.id}')"
        style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
        <i class="fas fa-trash"></i>
      </button>
    </div>`;
  }));
  list.innerHTML = satirlar.join('');
}

async function resumeSession(id) {
  const s = await dbGetir('denetimler', id);
  if (!s) return;
  currentSession = s;
  updateLocationDisplay();
  showScreen('inspection');
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
}

function closeModal() {
  document.getElementById('modal-confirm').style.display = 'none';
  modalCallback = null;
}

document.getElementById('modal-action-btn') &&
  document.getElementById('modal-action-btn').addEventListener('click', () => {
    const cb = modalCallback;
    closeModal();
    if (cb) cb();
  });

// ─── GERİ / SETUP ────────────────────────────────────────────
function goToSetup() {
  clearInterval(sessionTimer);
  showScreen('setup');
  kurumlariYukle();
  loadInspectionsList();
}

// ─── OCR ─────────────────────────────────────────────────────
async function openOCR() {
  try {
    ocrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('video').srcObject = ocrStream;
    document.getElementById('camera-ui').style.display = 'block';
  } catch (e) {
    alert('Kamera erişimi reddedildi: ' + e.message);
  }
}

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

  const imageData = canvas.toDataURL('image/jpeg', 0.95);
  document.getElementById('finding-manual').value = 'OCR işleniyor...';

  const sonuc = await compressImage(imageData);
  aktifFotoTaslak = sonuc;
  console.log('[sıkıştırma] Kayda hazır foto:', boyutBiçimle(sonuc.sikistirilmisBoyut),
    sonuc.sikistirildi ? '(sıkıştırıldı)' : '(orijinal korundu)');

  try {
    const result = await Tesseract.recognize(imageData, 'tur', {
      logger: m => console.log(m)
    });
    const text = result.data.text.trim();
    document.getElementById('finding-manual').value = text || 'Metin okunamadı, manuel girin.';
  } catch (e) {
    document.getElementById('finding-manual').value = 'OCR hatası: ' + e.message;
  }
}

// Dışarıdan bir dosya/blob/dataURL alıp kayda hazır sıkıştırılmış veri üretir
// (galeri/dosya seçme akışı için — aktif taslağa yazar).
async function fotoAlVeSikistir(kaynak) {
  const sonuc = await compressImage(kaynak);
  aktifFotoTaslak = sonuc;
  return sonuc;
}
if (typeof window !== 'undefined') window.fotoAlVeSikistir = fotoAlVeSikistir;

// ─── ZIP DIŞA AKTARMA (Birim / Kurum) ────────────────────────
// Ortak format: denetimler.json (array) + fotolar/ (düz, `${denetimId}_${bulguId}.jpg`)
// Bu format tek denetimli (birim) ve çok denetimli (kurum) ihracatta AYNIDIR.

async function _denetimPaketiOlustur(denetim, kurumAdi, birimAdi) {
  const bulgular = await dbIndexTumu('bulgular', 'denetimId', denetim.id);
  const dosyalar = [];
  const fotoGirdileri = [];

  const tespitler = bulgular.map(b => {
    let fotoAdi = null;
    if (b.foto) {
      fotoAdi = `${denetim.id}_${b.id}.jpg`;
      dosyalar.push(fotoAdi);
      fotoGirdileri.push({ ad: `fotolar/${fotoAdi}`, veri: b.foto });
    }
    return {
      alanTipi: denetim.kat || 'genel',
      konumKodu: `${denetim.bina}/${denetim.kat}/${denetim.oda}`,
      not: b.metin,
      hayatiRisk: !!b.hayatiRisk,
      fotografsiz: !b.foto,
      checklist: null,
      zaman: b.zaman,
      fotolar: fotoAdi ? [fotoAdi] : []
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
      sorumlu: denetim.sorumlu
    },
    tespitler,
    manifest: { dosyalar, fotoSayisi: dosyalar.length }
  };
  return { paket, fotoGirdileri };
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

async function exportBirimZip() {
  const birimId = document.getElementById('setup-birim').value;
  if (!birimId) { alert('Önce bir birim seçin.'); return; }
  const birim = await dbGetir('birimler', birimId);
  const denetimler = await dbIndexTumu('denetimler', 'birimId', birimId);
  await _zipVeIndir(denetimler, `birim_${(birim ? birim.ad : 'yedek').replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]+/g, '_')}`);
}

async function exportKurumZip() {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }
  const kurum = await dbGetir('kurumlar', kurumId);
  const birimler = await dbIndexTumu('birimler', 'kurumId', kurumId);
  let tumDenetimler = [];
  for (const b of birimler) {
    const d = await dbIndexTumu('denetimler', 'birimId', b.id);
    tumDenetimler = tumDenetimler.concat(d);
  }
  await _zipVeIndir(tumDenetimler, `kurum_${(kurum ? kurum.ad : 'yedek').replace(/[^a-zA-Z0-9ığüşöçİĞÜŞÖÇ]+/g, '_')}`);
}

async function tumVeriyiZipleVeIndir() {
  const denetimler = await dbTumu('denetimler');
  await _zipVeIndir(denetimler, 'isg_tam_yedek');
}

if (typeof window !== 'undefined') {
  window.exportBirimZip = exportBirimZip;
  window.exportKurumZip = exportKurumZip;
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
