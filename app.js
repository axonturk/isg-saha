'use strict';
/* İSG Saha Asistanı v0.1 — AxonTR
   Saf yardımcı fonksiyonlar üstte (Node'da test edilebilir), DOM/uygulama altta. */

// ---------- ZIP WRITER (store, sıkıştırmasız, bağımlılıksız) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function buildZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const now = dosDateTime(new Date());
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, data);
    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) { parts.push(c); cdSize += c.length; }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  parts.push(eocd);
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

// ---------- ALAN TİPLERİ ----------
const ORTAK_ALANLAR = [
  'Ofis / idari oda', 'Toplantı salonu', 'Koridor / merdiven / kaçış yolu',
  'Islak hacim (WC/lavabo)', 'Çay ocağı / ofis mutfağı', 'Arşiv / depo',
  'Kazan dairesi', 'Elektrik pano odası', 'Jeneratör / UPS', 'Asansör makine dairesi',
  'Çatı / bodrum', 'Otopark / açık alan', 'Güvenlik / danışma', 'Diğer'
];
const EGITIM_ALANLAR = [
  'Derslik / amfi', 'Kimya laboratuvarı', 'Biyoloji/mikrobiyoloji lab.',
  'Fizik/elektrik lab.', 'Bilgisayar lab.', 'Atölye (makine/kaynak/vb.)',
  'Kütüphane / okuma salonu', 'Konferans salonu', 'Kantin / yemekhane',
  'Spor salonu / soyunma'
];
const HASTANE_ALANLAR = [
  'Poliklinik / muayene', 'Servis / hasta odası', 'Ameliyathane', 'Yoğun bakım',
  'Acil servis', 'Görüntüleme (radyasyon)', 'Tıbbi laboratuvar', 'Eczane / ilaç deposu',
  'Sterilizasyon ünitesi', 'Tıbbi atık deposu', 'Endüstriyel mutfak', 'Çamaşırhane', 'Morg'
];
const PROFILLER = {
  idari:   { ad: 'İdari bina (rektörlük, daire bşk.)', alanlar: ORTAK_ALANLAR },
  egitim:  { ad: 'Eğitim binası (fakülte)',            alanlar: [...EGITIM_ALANLAR, ...ORTAK_ALANLAR] },
  myo:     { ad: 'MYO (atölyeli)',                     alanlar: [...EGITIM_ALANLAR, ...ORTAK_ALANLAR] },
  hastane: { ad: 'Hastane',                            alanlar: [...HASTANE_ALANLAR, ...ORTAK_ALANLAR] }
};

// ---------- SAF YARDIMCILAR ----------
function slug(s) {
  const map = { 'ç':'c','ğ':'g','ı':'i','ö':'o','ş':'s','ü':'u','Ç':'C','Ğ':'G','İ':'I','Ö':'O','Ş':'S','Ü':'U' };
  return String(s).replace(/[çğıöşüÇĞİÖŞÜ]/g, ch => map[ch])
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase().slice(0, 30) || 'alan';
}

function fotoDosyaAdi(alanTipi, konumKodu, sira) {
  const k = konumKodu ? '_' + slug(konumKodu) : '';
  return slug(alanTipi) + k + '_' + String(sira).padStart(3, '0') + '.jpg';
}

function konumNormalize(k) {
  return String(k || '').trim().toUpperCase().replace(/\s+/g, '');
}

function denetimJson(denetim, tespitler, fotoAdlari) {
  return {
    surum: 1,
    uygulama: 'ISG Saha Asistani v0.1 (AxonTR)',
    olusturma: new Date().toISOString(),
    denetim,
    tespitler,
    manifest: { tespitSayisi: tespitler.length, fotoSayisi: fotoAdlari.length, dosyalar: fotoAdlari }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { buildZip, crc32, slug, fotoDosyaAdi, konumNormalize, denetimJson, PROFILLER };
}

// ---------- UYGULAMA (yalnızca tarayıcıda) ----------
if (typeof document !== 'undefined') {

  const $ = id => document.getElementById(id);
  let db = null;
  let aktifDenetim = null;
  let bekleyenFotolar = []; // {blob} kaydedilmemiş tespitin fotoları
  let sonKonumlar = [];

  // ---- IndexedDB ----
  function dbAc() {
    return new Promise((res, rej) => {
      const req = indexedDB.open('isg_saha', 1);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        d.createObjectStore('denetim', { keyPath: 'id' });
        const t = d.createObjectStore('tespitler', { keyPath: 'id', autoIncrement: true });
        t.createIndex('denetimId', 'denetimId');
        const f = d.createObjectStore('fotolar', { keyPath: 'id', autoIncrement: true });
        f.createIndex('tespitId', 'tespitId');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  function tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
      t.onerror = () => rej(t.error);
    });
  }

  function hepsiniAl(store, indexAd, deger) {
    return new Promise((res, rej) => {
      const t = db.transaction(store, 'readonly');
      const s = indexAd ? t.objectStore(store).index(indexAd) : t.objectStore(store);
      const req = deger !== undefined ? s.getAll(deger) : s.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }

  // ---- Ekran yönetimi ----
  function ekranGoster(ad) {
    document.querySelectorAll('.ekran').forEach(e => e.classList.remove('aktif'));
    $(ad).classList.add('aktif');
  }

  // ---- Kurulum ekranı ----
  function profilleriDoldur() {
    const sel = $('binaProfili');
    sel.innerHTML = '';
    for (const [k, v] of Object.entries(PROFILLER)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = v.ad;
      sel.appendChild(o);
    }
  }

  async function denetimBaslat() {
    const isyeri = $('isyeriAdi').value.trim();
    if (!isyeri) { uyari('İşyeri / bina adı girin.'); return; }
    aktifDenetim = {
      id: 'D' + Date.now(),
      tur: $('denetimTuru').value,
      isyeri,
      binaProfili: $('binaProfili').value,
      baslangic: new Date().toISOString()
    };
    await tx('denetim', 'readwrite', s => s.put(aktifDenetim));
    anaEkranaGec();
  }

  function anaEkranaGec() {
    $('baslikIsyeri').textContent = aktifDenetim.isyeri;
    $('baslikTur').textContent = aktifDenetim.tur === 'risk' ? 'Risk Analizi' : 'Saha Denetimi';
    alanTipleriniDoldur();
    ekranGoster('ekranAna');
    listeyiYenile();
  }

  function alanTipleriniDoldur() {
    const sel = $('alanTipi');
    sel.innerHTML = '';
    for (const a of PROFILLER[aktifDenetim.binaProfili].alanlar) {
      const o = document.createElement('option');
      o.value = a; o.textContent = a;
      sel.appendChild(o);
    }
  }

  // ---- Foto ----
  function fotoSec(ev) {
    const dosyalar = Array.from(ev.target.files || []);
    for (const f of dosyalar) bekleyenFotolar.push({ blob: f });
    ev.target.value = '';
    bekleyenleriCiz();
  }

  function bekleyenleriCiz() {
    const kap = $('bekleyenFotolar');
    kap.innerHTML = '';
    bekleyenFotolar.forEach((f, i) => {
      const d = document.createElement('div');
      d.className = 'thumb';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(f.blob);
      const x = document.createElement('button');
      x.textContent = '✕';
      x.onclick = () => { bekleyenFotolar.splice(i, 1); bekleyenleriCiz(); };
      d.appendChild(img); d.appendChild(x);
      kap.appendChild(d);
    });
    $('fotoSayac').textContent = bekleyenFotolar.length ? bekleyenFotolar.length + ' foto' : '';
  }

  // ---- Tespit kaydet ----
  async function tespitKaydet() {
    const notMetni = $('tespitNotu').value.trim();
    if (!notMetni && bekleyenFotolar.length === 0) {
      uyari('En az bir foto çekin veya not yazın (fotoğrafsız bulgu için not zorunlu).');
      return;
    }
    const konum = konumNormalize($('konumKodu').value);
    const tespit = {
      denetimId: aktifDenetim.id,
      alanTipi: $('alanTipi').value,
      konumKodu: konum,
      not: notMetni,
      hayatiRisk: $('hayatiRisk').checked,
      fotografsiz: bekleyenFotolar.length === 0,
      zaman: new Date().toISOString()
    };
    const tespitId = await new Promise((res, rej) => {
      const t = db.transaction('tespitler', 'readwrite');
      const req = t.objectStore('tespitler').add(tespit);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    for (const f of bekleyenFotolar) {
      await tx('fotolar', 'readwrite', s => s.add({ tespitId, blob: f.blob }));
    }
    if (konum && !sonKonumlar.includes(konum)) {
      sonKonumlar.unshift(konum);
      sonKonumlar = sonKonumlar.slice(0, 5);
      konumCiplerini_Ciz();
    }
    if (tespit.hayatiRisk) hayatiRiskPaylas(tespit);
    bekleyenFotolar = [];
    bekleyenleriCiz();
    $('tespitNotu').value = '';
    $('hayatiRisk').checked = false;
    await listeyiYenile();
    await yedekHatirlat();
    bildirim('Tespit kaydedildi ✓');
  }

  function hayatiRiskPaylas(t) {
    const metin = `⚠️ HAYATİ RİSK BİLDİRİMİ\nYer: ${aktifDenetim.isyeri}${t.konumKodu ? ' / ' + t.konumKodu : ''}\nAlan: ${t.alanTipi}\nTespit: ${t.not || '(foto ekli)'}\nZaman: ${new Date().toLocaleString('tr-TR')}\nAnında müdahale gereklidir. — İSG Uzmanı`;
    if (navigator.share) {
      navigator.share({ title: 'Hayati Risk Bildirimi', text: metin }).catch(() => {});
    } else {
      navigator.clipboard && navigator.clipboard.writeText(metin);
      uyari('Bildirim metni panoya kopyalandı — SMS/WhatsApp ile iletin.');
    }
  }

  // ---- Konum çipleri ----
  function konumCiplerini_Ciz() {
    const kap = $('sonKonumlar');
    kap.innerHTML = '';
    for (const k of sonKonumlar) {
      const b = document.createElement('button');
      b.className = 'cip';
      b.textContent = k;
      b.onclick = () => { $('konumKodu').value = k; };
      kap.appendChild(b);
    }
  }

  // ---- Liste ----
  async function listeyiYenile() {
    const tespitler = await hepsiniAl('tespitler', 'denetimId', aktifDenetim.id);
    const fotolar = await hepsiniAl('fotolar');
    const sayilar = {};
    for (const f of fotolar) sayilar[f.tespitId] = (sayilar[f.tespitId] || 0) + 1;
    $('tespitSayac').textContent = tespitler.length + ' tespit';
    const kap = $('tespitListesi');
    kap.innerHTML = '';
    for (const t of [...tespitler].reverse()) {
      const d = document.createElement('div');
      d.className = 'kart' + (t.hayatiRisk ? ' riskli' : '');
      const fs = sayilar[t.id] || 0;
      d.innerHTML = `<div class="kart-ust"><strong>${t.alanTipi}</strong>${t.konumKodu ? ' <span class="kod">' + t.konumKodu + '</span>' : ''}</div>
        <div class="kart-alt">${t.hayatiRisk ? '⚠️ HAYATİ RİSK · ' : ''}${fs} foto${t.fotografsiz ? ' · fotoğrafsız bulgu' : ''}${t.not ? ' · ' + t.not.slice(0, 60) : ''}</div>`;
      const sil = document.createElement('button');
      sil.className = 'sil';
      sil.textContent = 'Sil';
      sil.onclick = async () => {
        if (!confirm('Bu tespit silinsin mi?')) return;
        await tx('tespitler', 'readwrite', s => s.delete(t.id));
        const tf = fotolar.filter(f => f.tespitId === t.id);
        for (const f of tf) await tx('fotolar', 'readwrite', s => s.delete(f.id));
        listeyiYenile();
      };
      d.appendChild(sil);
      kap.appendChild(d);
    }
  }

  // ---- ZIP dışa aktarma ----
  async function zipOlustur() {
    const tespitler = await hepsiniAl('tespitler', 'denetimId', aktifDenetim.id);
    if (!tespitler.length) { uyari('Henüz tespit yok.'); return null; }
    const fotolar = await hepsiniAl('fotolar');
    const dosyalar = [];
    const fotoAdlari = [];
    const tespitCikti = [];
    let sira = 1;
    for (const t of tespitler) {
      const tf = fotolar.filter(f => f.tespitId === t.id);
      const adlar = [];
      for (const f of tf) {
        const ad = fotoDosyaAdi(t.alanTipi, t.konumKodu, sira++);
        const buf = new Uint8Array(await f.blob.arrayBuffer());
        dosyalar.push({ name: 'fotolar/' + ad, data: buf });
        adlar.push(ad);
        fotoAdlari.push(ad);
      }
      tespitCikti.push({
        alanTipi: t.alanTipi, konumKodu: t.konumKodu, not: t.not,
        hayatiRisk: t.hayatiRisk, fotografsiz: t.fotografsiz,
        zaman: t.zaman, fotolar: adlar
      });
    }
    const json = denetimJson(aktifDenetim, tespitCikti, fotoAdlari);
    dosyalar.unshift({ name: 'denetim.json', data: new TextEncoder().encode(JSON.stringify(json, null, 2)) });
    return buildZip(dosyalar);
  }

  async function zipIndir(sonMu) {
    try {
      const zip = await zipOlustur();
      if (!zip) return;
      const blob = new Blob([zip], { type: 'application/zip' });
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      a.href = URL.createObjectURL(blob);
      a.download = `denetim_${slug(aktifDenetim.isyeri)}_${ts}${sonMu ? '' : '_yedek'}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      bildirim(sonMu ? 'Denetim ZIP indirildi ✓' : 'Ara yedek indirildi ✓');
      if (sonMu && confirm('ZIP indirildi. Denetim kapatılıp cihazdaki veriler temizlensin mi?\n(ZIP dosyasını bilgisayara aktarmadan temizlemeyin!)')) {
        await verileriTemizle();
        ekranGoster('ekranKurulum');
      }
    } catch (e) {
      uyari('ZIP oluşturulamadı: ' + e.message);
    }
  }

  async function verileriTemizle() {
    await tx('tespitler', 'readwrite', s => s.clear());
    await tx('fotolar', 'readwrite', s => s.clear());
    await tx('denetim', 'readwrite', s => s.clear());
    aktifDenetim = null;
    sonKonumlar = [];
  }

  async function yedekHatirlat() {
    const fotolar = await hepsiniAl('fotolar');
    if (fotolar.length > 0 && fotolar.length % 15 === 0) {
      $('yedekBanner').style.display = 'block';
    }
  }

  // ---- Bildirimler ----
  function bildirim(msg) {
    const b = $('bildirim');
    b.textContent = msg;
    b.classList.add('goster');
    setTimeout(() => b.classList.remove('goster'), 1800);
  }
  function uyari(msg) { alert(msg); }

  // ---- Başlangıç ----
  async function init() {
    db = await dbAc();
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
    profilleriDoldur();
    const mevcut = await hepsiniAl('denetim');
    if (mevcut.length) {
      aktifDenetim = mevcut[0];
      anaEkranaGec();
    } else {
      ekranGoster('ekranKurulum');
    }
    $('btnBaslat').onclick = denetimBaslat;
    $('fotoInput').onchange = fotoSec;
    $('btnFoto').onclick = () => $('fotoInput').click();
    $('btnKaydet').onclick = tespitKaydet;
    $('btnAraYedek').onclick = () => zipIndir(false);
    $('btnBitir').onclick = () => zipIndir(true);
    $('btnYedekKapat').onclick = () => { $('yedekBanner').style.display = 'none'; };
    if (navigator.serviceWorker && navigator.serviceWorker.register) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}
