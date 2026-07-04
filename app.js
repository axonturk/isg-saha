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

  const imageData = canvas.toDataURL('image/jpeg', 0.8);
  document.getElementById('finding-manual').value = 'OCR işleniyor...';

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
