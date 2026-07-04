// ============================================================
// İSG SAHA ASİSTANI - app.js
// Versiyon: v0.4.1
// Güncelleme: Silme onayı, kat/oda mantığı, OCR revizyonu
// ============================================================

const APP_VERSION = 'v0.4.1';
const DB_KEY = 'isg_findings';
const SESSION_KEY = 'isg_session';

// Bina → Kat yapısı
const BINA_KATLAR = {
  MYO:       ['Zemin', '1.Kat', '2.Kat', '3.Kat'],
  LAB:       ['Zemin', '1.Kat'],
  IDARI:     ['Zemin', '1.Kat', '2.Kat'],
  KUTUPHANE: ['Zemin', '1.Kat']
};

// ─── STATE ───────────────────────────────────────────────────
let currentSession = null;
let sessionTimer   = null;
let modalCallback  = null;
let ocrStream      = null;

// ─── RESİM SIKIŞTIRMA (A AŞAMASI) ────────────────────────────
// Amaç: Saha fotoğraflarını IndexedDB'ye/kayda yazmadan önce küçültmek.
// Hedef: max 1920px kenar, kalite 0.80, ~200-300 KB/foto.
// NOT: EXIF verisi bu aşamada İŞLENMEZ (tarih/konum koruması = B aşaması).
//      Canvas'a çizim EXIF'i düşürür; bu bilinçli bir kısıttır.
const RESIM_SIKISTIRMA = {
  maxKenar:  1920,   // px — en uzun kenar bu değere indirilir
  kalite:    0.80,   // JPEG kalitesi (0-1)
  format:    'image/jpeg',
  // Bu boyutun altındaki dosyalara dokunma (zaten yeterince küçük):
  atlaEsigi: 300 * 1024,        // 300 KB
  // Bundan büyük girdi = güvenlik sınırı (bozuk/aşırı dosya):
  maksGirdi: 50 * 1024 * 1024   // 50 MB
};

// İnsan-okunur boyut (log ve test için).
function boyutBiçimle(bytes) {
  if (!bytes && bytes !== 0) return '?';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// SAF fonksiyon (test edilebilir): en-boy oranını koruyarak hedef ölçü hesaplar.
// Zaten küçükse aynı ölçüyü döner (büyütme yapmaz).
function hedefOlculeriHesapla(w, h, maxKenar) {
  if (!w || !h) return { w: 0, h: 0 };
  const enUzun = Math.max(w, h);
  if (enUzun <= maxKenar) return { w: Math.round(w), h: Math.round(h) };
  const oran = maxKenar / enUzun;
  return { w: Math.round(w * oran), h: Math.round(h * oran) };
}

// Girdi kaynağının yaklaşık byte boyutunu bul (File/Blob veya dataURL string).
function kaynakBoyutu(kaynak) {
  if (!kaynak) return 0;
  if (typeof kaynak.size === 'number') return kaynak.size;            // File/Blob
  if (typeof kaynak === 'string' && kaynak.startsWith('data:')) {     // dataURL
    const virgul = kaynak.indexOf(',');
    const b64 = virgul >= 0 ? kaynak.slice(virgul + 1) : kaynak;
    // base64 -> yaklaşık byte
    return Math.round(b64.length * 3 / 4);
  }
  return 0;
}

// Bir kaynağı (File | Blob | dataURL string) yüklenmiş bir Image nesnesine çevirir.
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
      img.src = kaynak;                       // dataURL / objectURL
    } else if (kaynak instanceof Blob) {
      url = URL.createObjectURL(kaynak);
      img.src = url;
    } else {
      reject(new Error('Desteklenmeyen görsel kaynağı türü.'));
    }
  });
}

/**
 * Resmi Canvas ile sıkıştırır.
 * @param {File|Blob|string} kaynak  Fotoğraf dosyası, Blob veya dataURL.
 * @param {Object} [secenek]         { maxKenar, kalite, format } — varsayılanlar RESİM_SIKIŞTIRMA'dan.
 * @returns {Promise<{blob:Blob, dataUrl:string, orijinalBoyut:number,
 *                    sikistirilmisBoyut:number, genislik:number, yukseklik:number,
 *                    sikistirildi:boolean}>}
 *
 * Hata durumunda İSTİSNA FIRLATMAZ; her zaman kullanılabilir bir sonuç döner
 * (başarısızlıkta orijinal veriyle, sikistirildi:false).
 */
async function compressImage(kaynak, secenek = {}) {
  const cfg = {
    maxKenar: secenek.maxKenar ?? RESIM_SIKISTIRMA.maxKenar,
    kalite:   secenek.kalite   ?? RESIM_SIKISTIRMA.kalite,
    format:   secenek.format   ?? RESIM_SIKISTIRMA.format
  };
  const orijinalBoyut = kaynakBoyutu(kaynak);

  // — Güvenlik: aşırı büyük girdi —
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

    // Sıkıştırma orijinalden büyük çıktıysa (küçük/zaten optimize) orijinali koru.
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
    // Sıkıştırma başarısız → orijinal dosyayı kullan (akış bozulmasın).
    console.warn('[sıkıştırma] Başarısız, orijinal kullanılıyor:', e.message);
    return _orijinaleDon(kaynak, orijinalBoyut);
  }
}

// Yardımcı: sıkıştırılmamış/başarısız durumda tutarlı sonuç nesnesi üret.
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

// Test/kullanım için global erişim (IndexedDB kayıt katmanı hazır olduğunda çağrılır).
if (typeof window !== 'undefined') {
  window.compressImage = compressImage;
  window.hedefOlculeriHesapla = hedefOlculeriHesapla;
  window.boyutBiçimle = boyutBiçimle;
}

// ─── BAŞLANGIÇ ───────────────────────────────────────────────
window.addEventListener('load', () => {
  console.log(`İSG Saha Asistanı ${APP_VERSION} başlatıldı`);
  showScreen('setup');
  loadInspectionsList();
});

// ─── EKRAN YÖNETİMİ ──────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`screen-${name}`);
  if (el) el.classList.add('active');
}

// ─── KAT CHİPLERİ ────────────────────────────────────────────
function updateFloorChipsOrOdaInput() {
  const bina  = document.getElementById('setup-bina').value;
  const wrap  = document.getElementById('kat-secimi');
  const chips = document.getElementById('floor-chips');

  if (!bina || !BINA_KATLAR[bina]) { wrap.style.display = 'none'; return; }

  chips.innerHTML = '';
  BINA_KATLAR[bina].forEach((kat, i) => {
    const c = document.createElement('div');
    c.className = 'chip' + (i === 0 ? ' active' : '');
    c.textContent = kat;
    c.onclick = () => {
      chips.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
    };
    chips.appendChild(c);
  });
  wrap.style.display = 'block';
}

function getSelectedKat() {
  const active = document.querySelector('#floor-chips .chip.active');
  return active ? active.textContent : 'Zemin';
}

// ─── DENETİM BAŞLAT ──────────────────────────────────────────
function startInspection() {
  const bina = document.getElementById('setup-bina').value;
  const oda  = document.getElementById('setup-oda').value.trim();
  const resp = document.getElementById('setup-responsible').value.trim();

  if (!bina) { alert('Lütfen bina seçin.'); return; }
  if (!oda)  { alert('Lütfen oda/alan no girin.'); return; }

  currentSession = {
    id:          Date.now(),
    bina,
    kat:         getSelectedKat(),
    oda,
    responsible: resp,
    startTime:   new Date().toISOString(),
    findings:    []
  };

  updateLocationDisplay();
  showScreen('inspection');
  startTimer();
  renderFindings();
}

function updateLocationDisplay() {
  if (!currentSession) return;
  const { bina, kat, oda } = currentSession;
  document.getElementById('current-loc-display').textContent =
    `${bina} / ${kat} / Oda ${oda}`;
}

// ─── TIMER ───────────────────────────────────────────────────
function startTimer() {
  const start = Date.now();
  sessionTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    document.getElementById('session-time').textContent = `${m}:${s}`;
  }, 1000);
}

// ─── BULGU KAYDET ────────────────────────────────────────────
function saveFinding() {
  const text = document.getElementById('finding-manual').value.trim();
  if (!text) { alert('Bulgu metni boş olamaz.'); return; }

  const finding = {
    id:        Date.now(),
    text,
    timestamp: new Date().toISOString(),
    loc:       `${currentSession.bina}/${currentSession.kat}/${currentSession.oda}`
  };

  currentSession.findings.push(finding);
  saveSessionToStorage();
  document.getElementById('finding-manual').value = '';
  renderFindings();
}

function addQuickFinding(text) {
  document.getElementById('finding-manual').value = text;
  saveFinding();
}

function renderFindings() {
  const list = document.getElementById('findings-list');
  if (!currentSession || currentSession.findings.length === 0) {
    list.innerHTML = '<p style="color:#999">Henüz bulgu eklenmedi.</p>';
    return;
  }
  list.innerHTML = currentSession.findings.map(f => `
    <div class="finding-item">
      <div class="finding-meta">${new Date(f.timestamp).toLocaleTimeString('tr-TR')}</div>
      <div>${f.text}</div>
      <button onclick="deleteFinding(${f.id})" style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `).join('');
}

// ─── SONRAKI ODA (OTOMATİK ARTIR) ────────────────────────────
function nextRoom() {
  if (!currentSession) return;
  saveSessionToStorage();

  const current = currentSession.oda;
  const num = parseInt(current);
  currentSession.oda = isNaN(num) ? current : String(num + 1);
  currentSession.findings = [];
  currentSession.id = Date.now();

  updateLocationDisplay();
  renderFindings();
}

// ─── STORAGE ─────────────────────────────────────────────────
function saveSessionToStorage() {
  if (!currentSession) return;
  const all = getAllFindings();
  const idx = all.findIndex(s => s.id === currentSession.id);
  if (idx >= 0) all[idx] = currentSession;
  else all.push(currentSession);
  localStorage.setItem(DB_KEY, JSON.stringify(all));
}

function getAllFindings() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; }
  catch { return []; }
}

// ─── GEÇMİŞ LİSTESİ ─────────────────────────────────────────
function loadInspectionsList() {
  const all  = getAllFindings();
  const list = document.getElementById('inspections-list');
  if (all.length === 0) {
    list.innerHTML = '<p style="color:#999">Kayıt bulunamadı.</p>';
    return;
  }
  list.innerHTML = all.slice().reverse().map(s => `
    <div class="finding-item" style="cursor:pointer" onclick="resumeSession(${s.id})">
      <div class="finding-meta">${new Date(s.startTime).toLocaleString('tr-TR')}</div>
      <div class="finding-loc">${s.bina} / ${s.kat || ''} / Oda ${s.oda}</div>
      <div style="font-size:0.85rem;color:#666">${s.findings.length} bulgu</div>
      <button onclick="event.stopPropagation(); askDeleteSession(${s.id})"
        style="position:absolute;top:10px;right:10px;background:none;border:none;color:#e74c3c;font-size:1.2rem;cursor:pointer;">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

function resumeSession(id) {
  const all = getAllFindings();
  const s   = all.find(x => x.id === id);
  if (!s) return;
  currentSession = s;
  updateLocationDisplay();
  showScreen('inspection');
  startTimer();
  renderFindings();
}

// ─── SİLME (ONAY MEKANİZMASI) ────────────────────────────────
function askDeleteSession(id) {
  showModal(
    'Kaydı Sil',
    'Bu denetim kaydı kalıcı olarak silinecek. Emin misiniz?',
    () => {
      const all = getAllFindings().filter(s => s.id !== id);
      localStorage.setItem(DB_KEY, JSON.stringify(all));
      loadInspectionsList();
    },
    'Evet, Sil',
    'btn-danger'
  );
}

function askDeleteAll() {
  showModal(
    '⚠️ Tüm Veriyi Sıfırla',
    'Tüm denetim kayıtları silinecek. Bu işlem GERİ ALINAMAZ. Devam etmek istiyor musunuz?',
    () => {
      const backup = getAllFindings();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `isg_yedek_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      localStorage.removeItem(DB_KEY);
      loadInspectionsList();
    },
    'Yedekle ve Sil',
    'btn-danger'
  );
}

function deleteFinding(id) {
  if (!currentSession) return;
  currentSession.findings = currentSession.findings.filter(f => f.id !== id);
  saveSessionToStorage();
  renderFindings();
}

// ─── MODAL ───────────────────────────────────────────────────
function showModal(title, text, onConfirm, btnText = 'Onayla', btnClass = 'btn-primary') {
  document.getElementById('modal-title').textContent  = title;
  document.getElementById('modal-text').textContent    = text;
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
    if (modalCallback) modalCallback();
    closeModal();
  });

// ─── GERİ / SETUP ────────────────────────────────────────────
function goToSetup() {
  if (currentSession) saveSessionToStorage();
  clearInterval(sessionTimer);
  showScreen('setup');
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

  // OCR tam çözünürlükte çalışsın (tanıma başarısı için); sıkıştırma sonra.
  const imageData = canvas.toDataURL('image/jpeg', 0.95);
  document.getElementById('finding-manual').value = 'OCR işleniyor...';

  // — Sıkıştırma (kayıt/IndexedDB'ye hazır): OCR akışını bloklamadan çalıştır. —
  // Sonuç ileride tespitle birlikte saklanmak üzere hazır tutulur.
  compressImage(imageData).then(sonuc => {
    sonForKaydiSaklaHazir(sonuc);
  }).catch(e => console.warn('[sıkıştırma] capturePhoto:', e.message));

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

// Son sıkıştırılan fotoğrafı bellekte tut — kayıt/IndexedDB katmanı devreye
// girdiğinde tespitle birlikte bu (küçültülmüş) veri yazılacak.
let sonSikistirilmisFoto = null;
function sonForKaydiSaklaHazir(sonuc) {
  sonSikistirilmisFoto = sonuc;
  console.log('[sıkıştırma] Kayda hazır foto:',
    boyutBiçimle(sonuc.sikistirilmisBoyut),
    sonuc.sikistirildi ? '(sıkıştırıldı)' : '(orijinal korundu)');
}

// Dışarıdan bir dosya/blob/dataURL alıp kayda hazır sıkıştırılmış veri üretir.
// Fotoğraf yükleme (input[type=file]) veya galeri akışı eklendiğinde kullanılabilir.
async function fotoAlVeSikistir(kaynak) {
  const sonuc = await compressImage(kaynak);
  sonForKaydiSaklaHazir(sonuc);
  return sonuc; // { blob, dataUrl, orijinalBoyut, sikistirilmisBoyut, ... }
}
if (typeof window !== 'undefined') window.fotoAlVeSikistir = fotoAlVeSikistir;

// ─── YEDEK / GERİ YÜKLE ──────────────────────────────────────
function backupRestore() {
  showModal(
    'Yedek İşlemleri',
    'Mevcut verileri JSON dosyası olarak indirmek ister misiniz?',
    () => {
      const data = getAllFindings();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `isg_yedek_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
    },
    'Yedek Al',
    'btn-primary'
  );
}
