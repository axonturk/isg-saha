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
// 4R-PKG-3E-0: Android canlıda hangi build/cache'in çalıştığını görünür
// kılmak için minimum, düşük riskli build rozeti -- kod içinde commit
// hash'i otomatik OKUNAMIYOR (build adımı yok, statik dosyalar doğrudan
// GitHub Pages'ten sunuluyor), bu yüzden her gerçek release'te elle
// güncellenen sabitler. `APP_BUILD` kasıtlı olarak commit hash'i DEĞİL --
// bir commit hash'i, o commit'ten SONRA yapılan bu değişiklikle birlikte
// zaten yanlış/eski olurdu; bunun yerine değişmeyen bir FAZ etiketi
// kullanılıyor. `APP_CACHE`, `sw.js`'teki `CACHE` sabitiyle AYNI
// TUTULMALI (bkz. tests/z-service-worker-cache-upgrade.spec.js) --
// aksi halde rozet yanlış/eski sürüm gösterir.
const APP_BUILD = '4R-PKG-3K';
const APP_CACHE = 'isg-saha-v31';
const DB_NAME = 'isgSahaDB';
const DB_VERSION = 5;   // v2: 'ayarlar' deposu; v3 atlandı (yereldeki
                        // committed-olmayan bir denemede kullanılmıştı,
                        // kanonik değildi); v4: 'dofler' deposu + birimId/
                        // dofUuid index'leri (PWA Commit 3A, replay-v2
                        // temeli -- bkz. AI/knowledge veya commit mesajı);
                        // v5: 'dofKanitlari' deposu (PWA Commit 4P, DÖF
                        // yerel kanıt medyası -- bkz. openDB upgrade bloğu)

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
let checklistTaslak   = [];     // SUPV-22 -- tıklanan checklist chip metinleri (audit izi, Evet/Hayır YOK)
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
// Kurum/Birim Hiyerarşisi + Tür (2026-08-02, Faz 2) -- fabrika/kamu/şantiye
// kurum türleri için yeni birim tipleri + kendi alanlar listeleri. Hastane/
// eğitim/myo BİLEREK yeniden kullanılıyor -- üniversiteye özgü değiller,
// bağımsız bir hastane/okul kurumunun birimi de aynı tip'i kullanabilir.
const FABRIKA_ALANLAR = [
  'Üretim hattı / atölye', 'Bakım-onarım atölyesi', 'Kalite kontrol laboratuvarı',
  'Hammadde/ürün deposu', 'Kompresör dairesi', 'Trafo / elektrik dağıtım odası',
  'Forklift şarj istasyonu', 'Kimyasal depolama alanı',
  // (2026-08-02, genişletme) -- sahada karşılaşılan yaygın üretim alanları
  'Boyahane / kaplama atölyesi', 'Kaynak atölyesi', 'Montaj hattı',
  'Ambalajlama / paketleme alanı', 'Numune / Ar-Ge odası', 'İSG / güvenlik ofisi',
  'Basınçlı hava/gaz tesisatı odası', 'Atık toplama/ayrıştırma alanı'
];
const KAMU_ALANLAR = [
  'Müdürlük / şube odası', 'Evrak kayıt / arşiv', 'Halkla ilişkiler / başvuru bankosu',
  'Sunucu / sistem odası',
  // (2026-08-02, genişletme) -- belediye/kaymakamlık/müdürlük ortak alanları
  'Meclis / encümen salonu', 'Vezne / tahsilat gişesi', 'Personel yemekhanesi',
  'Bilgi işlem birimi', 'İnsan kaynakları / personel birimi', 'Arşiv deposu (kapalı)'
];
const SANTIYE_ALANLAR = [
  'Şantiye şefliği konteyneri', 'İş güvenliği kabini', 'Vinç / iskele alanı',
  'Malzeme deposu sahası', 'Şantiye yemekhanesi / barınma', 'Elektrik panosu / jeneratör alanı',
  // (2026-08-02, genişletme) -- inşaat sahasında yaygın alanlar
  'Beton santrali / karışım alanı', 'Kalıp / demir atölyesi',
  'Tuvalet / duş konteyneri', 'Sağlık / ilk yardım konteyneri', 'Araç park / manevra sahası'
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
  yemekhane: { ad: 'Merkezi yemekhane',                  alanlar: [...YEMEKHANE_ALANLAR, ...ORTAK_ALANLAR] },
  fabrika:   { ad: 'Fabrika / üretim tesisi',            alanlar: [...FABRIKA_ALANLAR, ...ORTAK_ALANLAR] },
  kamu:      { ad: 'Kamu kurumu / idari bina',           alanlar: [...KAMU_ALANLAR, ...ORTAK_ALANLAR] },
  santiye:   { ad: 'Şantiye / inşaat sahası',            alanlar: [...SANTIYE_ALANLAR, ...ORTAK_ALANLAR] }
};

// Kurum türü -> isimlendirme şablonu (SADECE ÖNERİ, zorunlu değil, serbest
// metin her zaman kalır). "birimTipleri" o kurum türünde tipik olarak
// karşılaşılacak birim.tip anahtarları -- yeniBirimEkle formunda önce bunlar
// gösterilir. Üniversite mevcut PROFİLLER'in tamamını referans alıyor
// (zaten hazır, yeni içerik gerekmedi); hastane/eğitim kurumu bağımsız
// kullanımda da AYNI hastane/egitim tip'ini kullanır (üniversiteye özgü
// değiller). tür seviyesinde bir "tip" alanı YOK -- checklist içeriğini
// belirleyen birim.tip (PROFİLLER) ayrı bir eksen, kurum.tur'dan bağımsız.
const KURUM_TUR_SABLONLARI = {
  universite: {
    ad: 'Üniversite',
    birimTipleri: ['rektorluk', 'enstitu', 'idari', 'egitim', 'myo', 'hastane',
                   'kutuphane', 'havuz', 'spor', 'kres', 'yemekhane']
  },
  hastane:       { ad: 'Hastane',        birimTipleri: ['hastane'] },
  egitim_kurumu: { ad: 'Eğitim Kurumu',  birimTipleri: ['egitim'] },
  fabrika:       { ad: 'Fabrika',        birimTipleri: ['fabrika'] },
  kamu_kurumu:   { ad: 'Kamu Kurumu',    birimTipleri: ['kamu'] },
  santiye:       { ad: 'Şantiye',        birimTipleri: ['santiye'] }
};

// Kurum türü -> tipik BİRİM (blok/departman) adı önerileri (2026-08-02,
// kullanıcı talebiyle eklendi). ALT_BIRIM_LISTELERI ile aynı fikir ama
// birim.tip yerine kurum.tur'a bağlı -- üniversite hariç (o zaten PROFİLLER
// + ALT_BIRIM_LISTELERI ile kapsanıyor, PROFİLLER'in "ad" alanları zaten
// tipik üst-seviye birim adları). SADECE ÖNERİ: tıklanınca "Birim Adı"
// alanına yazılır (mevcut _birimFormDaireSec ile aynı davranış -- placeholder
// değil, doğrudan değer -- çünkü kullanıcı somut, adlandırılmış bir
// seçenek arasından AÇIKÇA seçim yapıyor), serbestçe değiştirilebilir/
// silinebilir. Fabrika/kamu kurumu/şantiye için resmi bir isimlendirme
// standardı yok (üniversitenin YÖK-tipi standardının aksine) -- bu yüzden
// bu üç liste "hastane/eğitim kurumu"na göre daha düşük isabetli bir
// başlangıç taslağı, sahada kullanılıp genişletilmesi beklenir.
const KURUM_TUR_BIRIM_ONERILERI = {
  hastane: [
    'Acil Servis Bloğu', 'Poliklinikler Bloğu', 'Ameliyathane ve Yoğun Bakım Bloğu',
    'Yataklı Servisler Bloğu', 'Laboratuvar ve Görüntüleme Bloğu', 'Eczane',
    'İdari Birim', 'Teknik Servis / Tesis Yönetimi'
  ],
  egitim_kurumu: [
    'İdare Binası', 'Derslik Bloğu', 'Fen/Bilgisayar Laboratuvarları',
    'Spor Salonu', 'Kütüphane', 'Yemekhane / Kantin', 'Atölye', 'Pansiyon'
  ],
  fabrika: [
    'Üretim Bölümü', 'Bakım-Onarım Atölyesi', 'Kalite Kontrol Laboratuvarı',
    'Depo / Lojistik', 'İdari Bina', 'Sosyal Tesisler', 'Enerji / Kazan Dairesi',
    // (2026-08-02, genişletme)
    'Ar-Ge Merkezi', 'Sevkiyat / Lojistik Bölümü', 'Boyahane / Kaplama Bölümü'
  ],
  kamu_kurumu: [
    'Müdürlük / Başkanlık Binası', 'Şube Müdürlüğü', 'Halkla İlişkiler / Başvuru Birimi',
    'Arşiv Birimi', 'Saha / Teknik Birim', 'Bağlı Kurum (ayrı adres)',
    // (2026-08-02, genişletme) -- ağırlıklı olarak belediye bağlamında, diğer
    // kamu kurumu tiplerinde (kaymakamlık/müdürlük) hepsi geçerli olmayabilir
    'Meclis / Encümen Salonu', 'Basın ve Halkla İlişkiler Birimi',
    'Bilgi İşlem Birimi', 'İnsan Kaynakları / Personel Birimi'
  ],
  santiye: [
    'Şantiye Şefliği', 'İş Güvenliği Birimi', 'Malzeme / Depo Sahası',
    'Sosyal Tesisler (Yemekhane/Barınma)', 'Şantiye İdari Ofisi', 'Teknik Ofis / Proje Birimi',
    // (2026-08-02, genişletme)
    'Beton Santrali / Karışım Alanı', 'Araç Park / Bakım Sahası'
  ]
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
              'Soğuk oda / depo', 'Islak hacim (WC/lavabo)', 'Personel soyunma'],
  fabrika:   ['Üretim hattı / atölye', 'Bakım-onarım atölyesi', 'Kalite kontrol laboratuvarı',
              'Hammadde/ürün deposu', 'Islak hacim (WC/lavabo)', 'Elektrik pano odası'],
  kamu:      ['Müdürlük / şube odası', 'Toplantı salonu', 'Evrak kayıt / arşiv',
              'Islak hacim (WC/lavabo)', 'Koridor / merdiven / kaçış yolu', 'Arşiv / depo'],
  santiye:   ['Şantiye şefliği konteyneri', 'İş güvenliği kabini', 'Vinç / iskele alanı',
              'Malzeme deposu sahası', 'Elektrik panosu / jeneratör alanı', 'Şantiye yemekhanesi / barınma']
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

      // v5 (PWA Commit 4P): 'dofKanitlari' deposu -- DÖF replay bağlamında
      // yerel foto/ses kanıt medyası. `dofler` kaydına HİÇBİR alan
      // eklenmez (Blob'ları gömmek her küçük takip/reviewStatus güncellemesinde
      // tüm kaydın yeniden serileştirilmesine yol açardı) -- tamamen ayrı,
      // `dofUuid` index'li bir store. Aynı idempotent desen: store zaten
      // varsa silinmez/yeniden oluşturulmaz.
      let dofKanitStore;
      if (!db.objectStoreNames.contains('dofKanitlari')) {
        dofKanitStore = db.createObjectStore('dofKanitlari', { keyPath: 'localMediaUuid' });
      } else {
        dofKanitStore = e.target.transaction.objectStore('dofKanitlari');
      }
      if (!dofKanitStore.indexNames.contains('dofUuid')) {
        dofKanitStore.createIndex('dofUuid', 'dofUuid', { unique: false });
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

/** Bir DÖF'ün reviewStatus'u dönüş belgesine (dof_donus.json) GİRECEK mi?
 * (PWA Commit 4O). Yalnız own-property VE varsayılandan farklıysa true --
 * absent/'dokunulmadi' hiçbir zaman export'a girmez (mevcut sparse takip
 * alanı felsefesiyle birebir tutarlı, bkz. dofDonusBelgesiOlustur). */
function _dofReviewStatusExportEdilebilirMi(kayit) {
  return Object.prototype.hasOwnProperty.call(kayit, 'reviewStatus')
    && kayit.reviewStatus !== _DOF_REVIEW_STATUS_VARSAYILAN;
}

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

// ─── DÖF KANIT MEDYALARI (PWA Commit 4P) ─────────────────────────
// Yerel foto/ses kanıt yakalama -- normal saha bulgu medyasından
// (aktifFotolarTaslak/aktifSeslerTaslak/sesRecorder/sesChunks, bulgular
// kaydının içine gömülü fotolar/sesler) TAMAMEN AYRI, kendi IndexedDB
// store'unda (`dofKanitlari`, ayrı bir 'dofUuid' index'i, PK
// `localMediaUuid`). `dofler` kaydına HİÇBİR yeni alan eklenmez --
// `_dofYerelKayitOlustur`'un mevcut açık allowlist'i zaten medya
// alanlarını hiç taşımıyor (bkz. commit raporu), bu bölüm o sınırı
// KORUR, genişletmez. `takipTaslagi`/`reviewStatus`'a hiç dokunmaz.
// Export (`dofDonusBelgesiOlustur`), hazırlık fingerprint
// (`_dofHazirlikKanonikJson`) ve replay ZIP (`dofReplayZipOlustur`) bu
// store'u OKUR (PWA Commit 4Q ile eklendi -- bkz. o bölümdeki notlar).
// Medya immutable kabul edilir -- düzeltme "sil + yeniden ekle" iledir,
// güncelleme servisi YOKTUR.

/** Ortak ön kontrol: DÖF var mı + kanonik mi. Legacy/WIP DÖF'e medya
 * okuma/ekleme reddedilir (diğer DÖF servisleriyle -- reviewStatus/
 * takipTaslagi -- AYNI güvenli desen). */
async function _dofKanitDofKaydiDogrula(dofUuid) {
  const kayit = await dbGetir('dofler', dofUuid);
  if (!kayit) {
    throw new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
  }
  if (!_dofKanonikMi(kayit)) {
    throw new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
  }
  return kayit;
}

/** Bir DÖF'e bağlı tüm kanıt medyalarını salt-okunur döner -- oluşturma
 * zamanına göre ARTAN (eskiden yeniye) sırayla, deterministik. */
async function dofKanitMedyalariGetir(dofUuid) {
  await _dofKanitDofKaydiDogrula(dofUuid);
  const kayitlar = await dbIndexTumu('dofKanitlari', 'dofUuid', dofUuid);
  return kayitlar.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}

/** Kanonik bir DÖF'e yeni bir kanıt medyası ekler. `medyaGirdisi`:
 * `{mediaType:'photo'|'audio', source:'camera'|'gallery'|'audio', blob,
 * mimeType, size, displayName?, durationMs?, width?, height?, note?}`.
 * Legacy/WIP DÖF için reddedilir. `dofler` kaydına, `takipTaslagi`'na,
 * `reviewStatus`'a HİÇ dokunmaz -- tamamen ayrı bir yazma işlemidir. */
async function dofKanitMedyasiEkle(dofUuid, medyaGirdisi) {
  await _dofKanitDofKaydiDogrula(dofUuid);
  const kayit = {
    localMediaUuid: uuid(),
    dofUuid,
    mediaType: medyaGirdisi.mediaType,
    source: medyaGirdisi.source,
    blob: medyaGirdisi.blob,
    mimeType: medyaGirdisi.mimeType || null,
    size: typeof medyaGirdisi.size === 'number' ? medyaGirdisi.size : null,
    createdAt: new Date().toISOString(),
    displayName: medyaGirdisi.displayName || null,
    durationMs: typeof medyaGirdisi.durationMs === 'number' ? medyaGirdisi.durationMs : null,
    width: typeof medyaGirdisi.width === 'number' ? medyaGirdisi.width : null,
    height: typeof medyaGirdisi.height === 'number' ? medyaGirdisi.height : null,
    note: medyaGirdisi.note || null,
  };
  await dbEkle('dofKanitlari', kayit);
  return kayit;
}

/** Bir kanıt medyasını kalıcı olarak (local-only hard delete) kaldırır --
 * export henüz yok (4Q'ya kadar), bu yüzden "silme sonrası dış sözleşme
 * etkilenir mi" endişesi bu commit'te geçerli değil. `dofler`/
 * `takipTaslagi`/`reviewStatus`'a dokunmaz.
 *
 * GÜVENLİK (Codex bağımsız QA bulgusu, 929dc96 sonrası düzeltme):
 * Getir/Ekle ile AYNI güvenli desen zorunludur -- yalnız `localMediaUuid`
 * alıp doğrudan silmek, `window._dofImport` üzerinden dışarı açık bir
 * servisin, ÇAĞIRANIN belirttiği `dofUuid` ile hiç doğrulama yapmadan
 * HERHANGİ bir DÖF'ün medyasını (hatta legacy/WIP bağlamdan bile)
 * silebilmesi anlamına geliyordu. Artık:
 * 1) `dofUuid` önce `_dofKanitDofKaydiDogrula` ile kanonik olarak
 *    doğrulanır (legacy/WIP -> KANONIK_DOF_DEGIL, bulunamayan -> DOF_BULUNAMADI),
 * 2) medya kaydı okunur -- yoksa DOF_KANIT_MEDYA_BULUNAMADI,
 * 3) medyanın GERÇEK `dofUuid`'si çağıranın verdiğiyle birebir
 *    eşleşmiyorsa DOF_KANIT_MEDYA_DOF_UYUSMAZLIGI (başka bir DÖF'ün
 *    medyası silinemez). Yalnız üçü de geçerse hard delete yapılır. */
async function dofKanitMedyasiSil(dofUuid, localMediaUuid) {
  await _dofKanitDofKaydiDogrula(dofUuid);
  const medya = await dbGetir('dofKanitlari', localMediaUuid);
  if (!medya) {
    throw new DofImportHatasi('DOF_KANIT_MEDYA_BULUNAMADI', `localMediaUuid bulunamadı: ${localMediaUuid}`);
  }
  if (medya.dofUuid !== dofUuid) {
    throw new DofImportHatasi('DOF_KANIT_MEDYA_DOF_UYUSMAZLIGI', `Medya (${localMediaUuid}) verilen dofUuid'ye ait değil.`);
  }
  await dbSil('dofKanitlari', localMediaUuid);
}

// ─── DÖF YEREL PAKET / KAYIT SİLME (PWA 4R-PKG-3A) ──────────────
// Yalnız PWA'nın KENDİ IndexedDB'sini (dofler + dofKanitlari) temizler.
// Desktop DB'ye HİÇ dokunmaz, gerçek DÖF/faaliyet turu/audit geçmişini
// SİLMEZ (bunlara bu fonksiyonların hiç erişimi yok) -- silinen yalnız
// PWA'nın yerel import/taslak/medya/replayHazırlık kopyasıdır. Aynı
// JSON/ZIP daha sonra tekrar içe aktarılabilir (idempotent import
// sözleşmesi bu fonksiyonlardan etkilenmez).

/** Tek bir yerel DÖF kaydını (kanonik VEYA legacy/WIP/hatalı -- `id` her
 * ikisinde de birincil anahtar) ve varsa (yalnız `dofUuid` string ise)
 * bağlı kanıt medyalarını siler. Kayıt zaten yoksa idempotent no-op
 * (hata fırlatmaz -- "zaten silinmiş" durumu normaldir). */
async function dofYerelKaydiSil(dofId) {
  const kayit = await dbGetir('dofler', dofId);
  if (!kayit) return { silindi: false };
  if (typeof kayit.dofUuid === 'string') {
    const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', kayit.dofUuid);
    for (const m of medyalar) await dbSil('dofKanitlari', m.localMediaUuid);
  }
  await dbSil('dofler', dofId);
  return { silindi: true };
}

/** Aynı `paketUuid`'e ait TÜM kanonik yerel DÖF kayıtlarını (+ bağlı kanıt
 * medyalarını) `dofYerelKaydiSil` ile tek tek siler. Yalnız KANONİK
 * kayıtları hedefler -- legacy/WIP kayıtların `paketUuid`'i olmadığından
 * zaten eşleşmezler, etkilenmezler. Başka paketUuid'e ait kayıtlara hiç
 * dokunmaz. */
async function dofPaketiSil(paketUuid) {
  const tumKayitlar = await dbTumu('dofler');
  const hedefler = tumKayitlar.filter((k) => _dofKanonikMi(k) && k.paketUuid === paketUuid);
  for (const k of hedefler) await dofYerelKaydiSil(k.id);
  return { silinenSayisi: hedefler.length };
}

/** Bir kanıt medyası için Desktop sözleşmesine uygun ZIP dosya adı ve tam
 * ZIP-içi yol üretir (PWA Commit 4Q). Desktop `dof_replay_import.py`
 * `_MEDYA_ALANLARI` eşlemesi -- `fotolar`/`sesNotlari` alanları SIRASIYLA
 * `fotolar/`/`sesler/` ZIP klasörlerine karşılık gelir; manifestteki
 * alanlar YALNIZ ÇIPLAK dosya adı taşır (klasör Desktop tarafında
 * kendisi ekler), ZIP entry'sinin kendisi ise TAM yolu (`fotolar/<ad>`)
 * kullanır. Uzantı sabit: foto -> `.jpg`, ses -> `.webm` (yakalama
 * tarafında zaten bu formatlarla üretiliyor). */
function _dofKanitMedyaAdVeYol(medya) {
  const fotoMu = medya.mediaType === 'photo';
  const uzanti = fotoMu ? 'jpg' : 'webm';
  const klasor = fotoMu ? 'fotolar' : 'sesler';
  const ad = `${medya.localMediaUuid}.${uzanti}`;
  return { ad, relativePath: `${klasor}/${ad}` };
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

    // Yalnız takipTaslagi tamamen ABSENT (undefined -- hiç oluşturulmamış)
    // ise {} varsayılır; null/yanlış tip eski davranışla (BOS_TAKIP_TASLAGI)
    // reddedilmeye devam eder -- yalnız "hiç dokunulmamış" gevşetildi.
    if (kayit.takipTaslagi !== undefined && (!kayit.takipTaslagi || typeof kayit.takipTaslagi !== 'object')) {
      throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı yok: ${dofUuid}`);
    }
    const taslak = _dofTaslakSavunmaciDogrula(kayit.takipTaslagi || {});
    // Sparse own-property mapping (4B-1): yalnız kullanıcının gerçekten
    // dokunduğu alanlar belgeye girer -- explicit null (temizleme talebi)
    // DAHİL. Hiç dokunulmamış alan (own-property değil) belgeye GİRMEZ.
    const dokunulanAlanlar = _DOF_TAKIP_ALANLARI.filter((alan) => Object.prototype.hasOwnProperty.call(taslak, alan));
    // PWA Commit 4O: reviewStatus, takip alanlarından TAMAMEN BAĞIMSIZ
    // ikinci bir "boş değil" kaynağıdır -- yalnız İKİSİ DE boşsa reddedilir
    // (reviewStatus-only export mümkün olmalı).
    const reviewStatusExportEdilebilir = _dofReviewStatusExportEdilebilirMi(kayit);
    // PWA Commit 4Q: kanıt medyası, takip alanlarından VE reviewStatus'tan
    // TAMAMEN BAĞIMSIZ üçüncü bir "boş değil" kaynağıdır -- yalnız ÜÇÜ DE
    // boşsa reddedilir (medya-only export mümkün olmalı, tıpkı
    // reviewStatus-only gibi).
    const medyalar = (await dbIndexTumu('dofKanitlari', 'dofUuid', dofUuid))
      .slice()
      .sort((a, b) => (a.localMediaUuid < b.localMediaUuid ? -1 : a.localMediaUuid > b.localMediaUuid ? 1 : 0));
    if (dokunulanAlanlar.length === 0 && !reviewStatusExportEdilebilir && medyalar.length === 0) {
      throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı boş, inceleme durumu yok ve kanıt medyası yok: ${dofUuid}`);
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
    // reviewStatus, takip alanlarından AYRI bir audit alanı olarak eklenir --
    // _DOF_TAKIP_ALANLARI/dokunulanAlanlar mekanizmasından hiç geçmez, hiçbir
    // kapanış alanı (durum/kapanma_*/kapatan_kullanici) ÜRETİLMEZ.
    if (reviewStatusExportEdilebilir) {
      kayitBelgesi.reviewStatus = kayit.reviewStatus;
      if (Object.prototype.hasOwnProperty.call(kayit, 'reviewStatusGuncellenmeZamani')) {
        kayitBelgesi.reviewStatusGuncellenmeZamani = kayit.reviewStatusGuncellenmeZamani;
      }
    }
    // PWA Commit 4Q: `fotolar`/`sesNotlari` Desktop'ın DÜZ (bare) dosya adı
    // beklediği zorunlu alanlar (`_MEDYA_ALANLARI` -- Desktop klasör önekini
    // kendisi ekler). `kanitMedyalari` PWA'nın kendi katma (additive) audit
    // alanıdır -- Desktop Apply'de okunmaz, `payload_snapshot_json`'da
    // olduğu gibi saklanır. Medyasız kayıtta HİÇBİRİ eklenmez (boş dizi
    // DEĞİL, tamamen absent).
    if (medyalar.length > 0) {
      const fotolar = [];
      const sesNotlari = [];
      const kanitMedyalari = [];
      for (const m of medyalar) {
        const { ad, relativePath } = _dofKanitMedyaAdVeYol(m);
        if (m.mediaType === 'photo') fotolar.push(ad); else sesNotlari.push(ad);
        const sha256 = await _dofBlobSha256Hex(m.blob);
        kanitMedyalari.push({
          localMediaUuid: m.localMediaUuid,
          mediaType: m.mediaType,
          source: m.source,
          relativePath,
          sha256,
          mimeType: m.mimeType,
          size: m.size,
          createdAt: m.createdAt,
          displayName: m.displayName,
          durationMs: m.durationMs,
          width: m.width,
          height: m.height,
        });
      }
      if (fotolar.length > 0) kayitBelgesi.fotolar = fotolar;
      if (sesNotlari.length > 0) kayitBelgesi.sesNotlari = sesNotlari;
      kayitBelgesi.kanitMedyalari = kanitMedyalari;
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

/** Bir Blob'un SHA-256 (lowercase hex) özeti (PWA Commit 4Q). Desktop bu
 * alanı okumaz/beklemez -- yalnız PWA'nın kendi audit/doğrulama alanı
 * (`kanitMedyalari[].sha256`) için üretilir. */
async function _dofBlobSha256Hex(blob) {
  const ozet = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(ozet)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Hazırlık/staleness fingerprint girdisi (PWA Commit 4O, medya 4Q'da
 * eklendi): dof_donus.json'a GERÇEKTEN girecek her şeyin kanonik özeti --
 * taslak (değişmedi) + (yalnız export-edilebilirse) reviewStatus +
 * (yalnız varsa) kanıt medya seti özeti. reviewStatus absent/'dokunulmadi'
 * VE medya listesi boşken fingerprint `_dofTaslakKanonikJson`'un ürettiği
 * METİNLE BİREBİR AYNIDIR (byte-for-byte) -- reviewStatus'a hiç
 * dokunmamış/medyasız eski kayıtlar/testler için fingerprint davranışı
 * SIFIR değişir. Medya özeti yalnız kimlik alanlarını (localMediaUuid/
 * mediaType/relativePath) içerir -- blob içeriği hash'lenmez (immutable
 * kabul edilir, ekleme/silme zaten UUID setini değiştirir), deterministik
 * sırayla (localMediaUuid). `medyalar` parametresi çağıran tarafından
 * (transaction-güvenliği için) önceden okunmuş bir kopya olarak verilir. */
function _dofHazirlikKanonikJson(kayit, taslak, medyalar) {
  const taslakJson = _dofTaslakKanonikJson(taslak);
  const reviewStatusVar = _dofReviewStatusExportEdilebilirMi(kayit);
  const medyaListesi = (medyalar || [])
    .slice()
    .sort((a, b) => (a.localMediaUuid < b.localMediaUuid ? -1 : a.localMediaUuid > b.localMediaUuid ? 1 : 0))
    .map((m) => ({
      localMediaUuid: m.localMediaUuid,
      mediaType: m.mediaType,
      relativePath: _dofKanitMedyaAdVeYol(m).relativePath,
    }));
  if (!reviewStatusVar && medyaListesi.length === 0) {
    return taslakJson;
  }
  const parca = { taslak: taslakJson };
  if (reviewStatusVar) parca.reviewStatus = kayit.reviewStatus;
  if (medyaListesi.length > 0) parca.medya = medyaListesi;
  return JSON.stringify(parca);
}

/** Kaydı okuyup kanoniklik + taslak doğrulaması yapar (ortak ön kontrol).
 * `medyalar` (PWA Commit 4Q): çağıranın önceden okuduğu kanıt medya
 * listesi -- IndexedDB transaction-güvenliği gereği burada YENİDEN
 * okunmaz (bkz. `dofReplayHazirlikHazirla` üstündeki not). Geçerliyse
 * `{ kayit, taslak, kanonikJson }` döner. */
function _dofHazirlikKayitDogrula(kayit, dofUuid, medyalar) {
  if (!kayit) {
    throw new DofImportHatasi('DOF_BULUNAMADI', `dofUuid bulunamadı: ${dofUuid}`);
  }
  if (!_dofKanonikMi(kayit)) {
    throw new DofImportHatasi('KANONIK_DOF_DEGIL', `dofUuid kanonik replay-v2 kaydı değil (WIP/legacy olabilir): ${dofUuid}`);
  }
  // Yalnız takipTaslagi tamamen ABSENT ise {} varsayılır (dofDonusBelgesiOlustur
  // ile aynı gevşetme) -- null/yanlış tip eski davranışla reddedilmeye devam eder.
  if (kayit.takipTaslagi !== undefined && (!kayit.takipTaslagi || typeof kayit.takipTaslagi !== 'object')) {
    throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı yok: ${dofUuid}`);
  }
  const taslak = _dofTaslakSavunmaciDogrula(kayit.takipTaslagi || {});
  const dokunulan = _DOF_TAKIP_ALANLARI.some((alan) => Object.prototype.hasOwnProperty.call(taslak, alan));
  const reviewStatusExportEdilebilir = _dofReviewStatusExportEdilebilirMi(kayit);
  const medyaVar = (medyalar || []).length > 0;
  if (!dokunulan && !reviewStatusExportEdilebilir && !medyaVar) {
    throw new DofImportHatasi('BOS_TAKIP_TASLAGI', `dofUuid için takip taslağı boş, inceleme durumu yok ve kanıt medyası yok: ${dofUuid}`);
  }
  return { kayit, taslak, kanonikJson: _dofHazirlikKanonikJson(kayit, taslak, medyalar) };
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
 * read-modify-write tek transaction içindedir, kısmi yazma olamaz.
 *
 * Kanıt medya listesi (PWA Commit 4Q) AYNI nedenle -- `dofKanitlari` ayrı
 * bir store olduğundan, `dofler` `readwrite` transaction'ı içinde ona
 * awaitli bir okuma açmak transaction'ın erken kapanması riskini taşır --
 * yalnız ÖN aşamada BİR KEZ okunur, in-tx senkron re-doğrulamada da AYNI
 * pre-fetch edilmiş kopya kullanılır (tek kullanıcılı uygulamada
 * pre-tx/in-tx arası medya değişimi pratikte imkânsız; olsa bile en kötü
 * ihtimalle bir sonraki `dofReplayZipOlustur` kendi taze pre-check'inde
 * yakalar -- SHA-256 parmak izi için zaten kurulu risk toleransıyla aynı). */
async function dofReplayHazirlikHazirla(dofUuid) {
  // Ön aşama (tx dışı): oku + doğrula + parmak izini hesapla.
  const onKayit = await new Promise((resolve, reject) => {
    openDB().then((db) => {
      const getReq = db.transaction('dofler', 'readonly').objectStore('dofler').get(dofUuid);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(new DofImportHatasi('VERITABANI_HATASI', `dofler okuma hatası: ${getReq.error && getReq.error.message}`));
    }, reject);
  });
  const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', dofUuid);
  const onDogrulama = _dofHazirlikKayitDogrula(onKayit, dofUuid, medyalar);   // DOF_BULUNAMADI/KANONIK_DOF_DEGIL/taslak hataları burada
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
        dogrulama = _dofHazirlikKayitDogrula(getReq.result, dofUuid, medyalar);
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

// ─── DÖF REPLAY ZIP ÜRETİMİ (PWA Commit 4D, medya 4Q'da eklendi) ─
// Kanonik zincir: dofler kaydı -> takipTaslagi -> replayHazirlik.
// submissionUuid -> dof_donus.json -> ZIP. Mevcut `zipYaz` (store-only,
// harici kütüphanesiz) DEĞİŞTİRİLMEDEN kullanılır. ZIP'te en az bir entry
// vardır: `dof_donus.json` (Desktop `_replay_json_adaylari` öncelik-0
// adı); kanıt medyası varsa `fotolar/<uuid>.jpg`/`sesler/<uuid>.webm`
// entry'leri de eklenir (PWA Commit 4Q, `dofDonusBelgesiOlustur`'un
// ürettiği `kanitMedyalari[].relativePath` ile birebir eşleşir).
// Otomatik indirme/UI YOKTUR; fonksiyon test edilebilir bir Blob döndürür.
// IndexedDB'ye HİÇBİR yazma yapılmaz, submission UUID ÜRETİLMEZ (hazırlık
// üretimi Commit 4C'nin sorumluluğudur -- hazırlık yoksa/eskiyse ZIP
// reddedilir, otomatik oluşturma/yenileme YAPILMAZ).
// Not: `zipYaz` DOS zaman damgası yazdığından ZIP BYTE çıktısı çağrılar
// arasında farklı olabilir -- deterministik olan, içindeki
// `dof_donus.json` METNİDİR (testle kilitlendi).

/** "Sadece incelenenleri export et" filtre yardımcısı (PWA Commit 4O).
 * Verilen `dofUuid` listesindeki her kayıt için reviewStatus'u okur,
 * yalnız incelenmiş (`reviewStatus !== 'dokunulmadi'`, absent DAHİL
 * dokunulmadi sayılır) olanların `dofUuid`'lerini SIRAYLA döner.
 * `takipTaslagi` doluluğuna hiç bakmaz (kasıtlı -- reviewStatus tek
 * ölçüttür). SALT-OKUNUR, `dofReplayZipOlustur`'un imzasını/davranışını
 * DEĞİŞTİRMEZ -- ondan ÖNCE, isteğe bağlı bir adım olarak çağrılır. */
async function dofIncelenenDofUuidleriniFiltrele(dofUuidListesi) {
  const sonuclar = [];
  for (const dofUuid of dofUuidListesi) {
    const { reviewStatus } = await dofReviewStatusGetir(dofUuid);
    if (reviewStatus !== _DOF_REVIEW_STATUS_VARSAYILAN) {
      sonuclar.push(dofUuid);
    }
  }
  return sonuclar;
}

/** Replay ZIP paketi üretir (medya dahil, PWA Commit 4Q). Her seçili DÖF
 * için:
 * 1) mevcut `replayHazirlik.submissionUuid` kullanılır (yoksa
 *    `REPLAY_HAZIRLIK_YOK`),
 * 2) güncel `takipTaslagi`/reviewStatus/kanıt-medya parmak izi
 *    hazırlıktakiyle karşılaştırılır -- farklıysa `REPLAY_HAZIRLIK_ESKI`
 *    (eski submission kimliği eski içeriğe aittir; önce
 *    `dofReplayHazirlikHazirla` yeniden çalışmalı),
 * 3) `dofDonusBelgesiOlustur` zinciriyle kanonik belge üretilir
 *    (duplicate/karışık paket/bozuk taslak retleri orada),
 * 4) `zipYaz` ile `dof_donus.json` + (varsa) kanıt medya Blob'ları tek
 *    ZIP'e yazılır (imza/opt-out YOK -- otomatik dahil edilir).
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
    const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', dofUuid);
    const dogrulama = _dofHazirlikKayitDogrula(kayit, dofUuid, medyalar);
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

  // PWA Commit 4Q: `dof_donus.json`'dan SONRA, manifestteki
  // `kanitMedyalari[].relativePath` ile BİREBİR aynı ZIP entry adlarıyla
  // medya Blob'ları eklenir (Desktop `fotolar/`/`sesler/` klasör
  // eşlemesiyle uyumlu). Medyasız kayıtlarda hiçbir entry eklenmez --
  // mevcut tek-entry davranışı DEĞİŞMEDEN korunur.
  const zipGirdileri = [{ ad: 'dof_donus.json', veri: jsonMetni }];
  for (const kontrol of belge.dofKontrolleri) {
    if (!kontrol.kanitMedyalari) continue;
    for (const m of kontrol.kanitMedyalari) {
      const medyaKaydi = await dbGetir('dofKanitlari', m.localMediaUuid);
      if (!medyaKaydi) continue;   // savunma amaçlı -- normal akışta hiç oluşmaz
      zipGirdileri.push({ ad: m.relativePath, veri: medyaKaydi.blob });
    }
  }

  let zipBlob;
  try {
    zipBlob = await zipYaz(zipGirdileri);
  } catch (e) {
    throw new DofImportHatasi('ZIP_URETIM_HATASI', `ZIP üretimi başarısız: ${e && e.message}`);
  }

  return {
    zipBlob,
    dosyaAdi: _dofReplayZipDosyaAdiUret(belge.paketUuid, belge.dofKontrolleri.length),
    dofSayisi: belge.dofKontrolleri.length,
    paketUuid: belge.paketUuid,
  };
}

// ─── DÖF REPLAY ZAMAN DAMGALI DOSYA ADI (4R-PKG-2) ───────────────
// paketUuid TEK BAŞINA dosya adı için yetersizdir: aynı import partisinden
// (paketUuid import PARTİSİNİN kimliğidir, replay'in değil -- bkz.
// _dofYerelKayitOlustur/dofDonusBelgesiOlustur yorumları) art arda alınan
// replay ZIP'leri hep AYNI dosya adını üretir, tarayıcı bunu "(2)", "(7)"
// gibi çoğaltır. Çözüm: dosya adına yerel zaman damgası + kısa paket id +
// DÖF adedi eklemek -- paketUuid'in KENDİSİ/anlamı DEĞİŞMEZ, yalnız dosya
// adı üretimi merkezi hale getirildi.

/** İki haneli sıfır dolgulu metin. */
function _dofIkiHaneli(n) {
  return String(n).padStart(2, '0');
}

/** Yerel cihaz saatine göre `YYYYMMDD_HHMMSS` biçiminde, dosya adında
 * güvenle kullanılabilir (Türkçe karakter/boşluk/ayraç YOK) bir zaman
 * damgası üretir. */
function _dofZamanDamgasiDosyaAdiIcin(tarih = new Date()) {
  return `${tarih.getFullYear()}${_dofIkiHaneli(tarih.getMonth() + 1)}${_dofIkiHaneli(tarih.getDate())}`
    + `_${_dofIkiHaneli(tarih.getHours())}${_dofIkiHaneli(tarih.getMinutes())}${_dofIkiHaneli(tarih.getSeconds())}`;
}

/** DÖF replay ZIP dosya adını üretir: `dof_replay_<zaman>_<kisaPaket>_<n>dof.zip`.
 * `paketUuid` zaten kanonik import doğrulamasından geçmiş bir UUID metnidir
 * (kullanıcı girdisi değildir); ilk 8 karakteri (UUID'nin ilk segmenti,
 * tire İÇERMEZ) kısa kimlik olarak kullanılır. Aynı paketten art arda
 * indirilen ZIP'ler zaman damgası nedeniyle FARKLI ad taşır. */
function _dofReplayZipDosyaAdiUret(paketUuid, dofSayisi, tarih = new Date()) {
  const kisaPaket = String(paketUuid).slice(0, 8);
  return `dof_replay_${_dofZamanDamgasiDosyaAdiIcin(tarih)}_${kisaPaket}_${dofSayisi}dof.zip`;
}

// ─── DÖF REPLAY ÇOKLU EXPORT TOPLAMA (4R-PKG-2) ──────────────────
// Saha kullanımında kullanıcı aynı import partisi içinde birden çok DÖF
// üzerinde (farklı DÖF'lere geçip dönerek) takip/medya değişikliği
// yapabilir. Tek "ZIP İndir" eylemi artık yalnız o an açık DÖF'ü değil,
// AYNI paketUuid'e ait TÜM "değişmiş" (takip alanı dokunulmuş VEYA
// reviewStatus incelenmiş VEYA kanıt medyası eklenmiş) kanonik DÖF'leri
// toplar -- her birinin kendi taslağı (başka DÖF'e geçilse bile IndexedDB
// kaydında kalıcı olduğundan) KAYBOLMAZ. `dofReplayZipOlustur`'un kendisi
// DEĞİŞTİRİLMEDİ (zaten çoklu `dofUuidListesi` kabul ediyordu) -- yalnız
// hangi listenin verileceğini belirleyen bu toplama katmanı YENİDİR.

/** Bir kanonik DÖF kaydının replay export'a "dahil edilecek kadar
 * değişmiş" sayılıp sayılmayacağını, `_dofHazirlikKayitDogrula`/
 * `dofDonusBelgesiOlustur`'daki AYNI "boş değil" ölçütüyle (taslak
 * dokunulmuş VEYA reviewStatus incelenmiş VEYA kanıt medyası var) --
 * ama fırlatmadan, salt-okunur bir boolean olarak -- değerlendirir. */
async function _dofKayitDegismisMi(kayit) {
  const taslak = (kayit.takipTaslagi && typeof kayit.takipTaslagi === 'object') ? kayit.takipTaslagi : {};
  const dokunulan = _DOF_TAKIP_ALANLARI.some((alan) => Object.prototype.hasOwnProperty.call(taslak, alan));
  if (dokunulan) return true;
  if (_dofReviewStatusExportEdilebilirMi(kayit)) return true;
  const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', kayit.dofUuid);
  return medyalar.length > 0;
}

/** Aynı import paketindeki (`paketUuid`) TÜM kanonik ve "değişmiş"
 * DÖF'lerin `dofUuid` listesini döner -- SALT-OKUNUR, DB'ye yazmaz.
 * Sıra `dofler` store'undan okunan doğal sırayla tutarlıdır (deterministik
 * değildir ama testler yalnız KÜME/uzunluk doğrular, sıra değil). Hiç
 * değişmiş DÖF yoksa boş dizi döner (hata fırlatmaz -- çağıran taraf
 * kullanıcıya uygun mesajı gösterir). */
async function dofPaketiDegismisDofUuidleri(paketUuid) {
  const tumKayitlar = await dbTumu('dofler');
  const sonuc = [];
  for (const kayit of tumKayitlar) {
    if (!_dofKanonikMi(kayit) || kayit.paketUuid !== paketUuid) continue;
    if (await _dofKayitDegismisMi(kayit)) sonuc.push(kayit.dofUuid);
  }
  return sonuc;
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
    dofIncelenenDofUuidleriniFiltrele,
    dofKanitMedyalariGetir, dofKanitMedyasiEkle, dofKanitMedyasiSil,
    dofPaketiDegismisDofUuidleri, _dofReplayZipDosyaAdiUret,
    dofYerelKaydiSil, dofPaketiSil,
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
// 4R-PKG-3F: hash route tabanlı ÜÇ ekran -- gerçek Android canlı testte
// kullanıcı önce "DÖF kartına basınca hâlâ liste altında inline detay
// açılıyor" (3E-FINAL'de çözüldü: work modu), sonra "çalışma ekranındayken
// hâlâ Yeni Denetim/Kurum/Yedekle/DÖF Paketi Al görünüyor" diye şikayet
// etti. Artık üç AYRI ekran var: `#home` (ana ekran + paket kartları),
// `#dof-package/<paketUuid>` (seçili paketin grup/liste'i), `#dof-work/<dofUuid>`
// (yalnız aktif DÖF). Route DEĞİŞTİRME TEK noktadan (`_dofRotaGuncelle`,
// `hashchange` + navigasyon fonksiyonlarınca çağrılır) -- `_dofKartTiklandi`/
// `_dofPaketKartiAcTikla`/`_dofPaketeDon`/`_dofAnaSayfayaDon` yalnız
// `location.hash`'i günceller, gerçek DOM güncellemesi/render zinciri hep
// `_dofRotaGuncelle` içinde olur.
let _dofRotaModu = 'home';   // 'home' | 'package' | 'work'
let _dofAktifPaketUuid = null;   // 'package'/'work' modunda aktif paketUuid
// PWA 4R-PKG-3A -- grup/chip filtresi. VARSAYILAN 'tumu': mevcut ~100
// DÖF list/detay/takip/replay testi hiçbir filtreleme beklemeden yazıldı
// (tek/iki kayıtlık senkron fixture'larla `.dof-liste-karti` sayısını
// DOĞRUDAN toplam kayıt sayısına eşit varsayıyorlar) -- "İşlenen"/ilk
// alan-grubu OTOMATİK aktif olacak şekilde varsayılanı değiştirmek bu
// testlerin BÜYÜK kısmını (mevcut, önceden yeşil) kırardı. Görev
// talimatındaki "bu davranış mevcut kod yapısına EN AZ RİSKLE
// uygulanmalı" ölçütü gereği, kasıtlı ve raporda açıkça belirtilen bir
// karar: varsayılan HER ZAMAN 'tumu' (tam liste, mevcut davranışla
// birebir), chip'ler kullanıcının ELİYLE seçmesi için sunulur.
let _dofAktifGrupAnahtari = 'tumu';
let _dofGrupListesi = [];   // en son hesaplanan {key, etiket, kayitlar} dizisi

/** Kanonik DÖF kayıtlarından grup listesini hesaplar -- SALT-OKUNUR.
 * Sabit gruplar: Tümü/İşlenen/Bekleyen ("değişmiş" ölçütü
 * `_dofKayitDegismisMi` ile BİREBİR aynı, 4R-PKG-2'de tanımlandı).
 * Dinamik gruplar: dolu `alanTipi` ve dolu `riskDuzeyi` değerlerine göre
 * (boş/null değerler grup ÜRETMEZ, "Tümü" altında kalırlar). Bir kayıt
 * hem bir alanTipi hem bir riskDuzeyi grubuna aynı anda üye olabilir --
 * gruplar birbirini dışlamaz, yalnız kompakt listeyi FİLTRELEMEK için
 * kullanılır. */
async function _dofGruplariHesapla(kayitlar, durumHaritasi = null) {
  const gruplar = [{ key: 'tumu', etiket: 'Tümü', kayitlar: kayitlar.slice() }];

  // 4R-PKG-3F performans: `durumHaritasi` verilmişse (bkz. `_dofListesiYukle`/
  // `_dofPaketSec`, `_dofDurumHaritasiHesapla`'dan ÖNCEDEN hesaplanmış) her
  // kayıt için TEKRAR IndexedDB taraması (`_dofKayitDegismisMi`) YAPILMAZ --
  // 59 kayıtlık gerçek pakette bu tekrar tarama yavaş ortamlarda test zaman
  // aşımına yol açacak kadar gecikmeye neden oluyordu.
  const islenenler = [];
  const bekleyenler = [];
  for (const k of kayitlar) {
    const degisti = durumHaritasi ? !!(durumHaritasi.get(k.id) && durumHaritasi.get(k.id).degisti) : await _dofKayitDegismisMi(k);
    if (degisti) islenenler.push(k); else bekleyenler.push(k);
  }
  gruplar.push({ key: 'islenen', etiket: 'İşlenen', kayitlar: islenenler });
  gruplar.push({ key: 'bekleyen', etiket: 'Bekleyen', kayitlar: bekleyenler });

  const alanMap = new Map();
  for (const k of kayitlar) {
    const alan = (k.alanTipi || '').trim();
    if (!alan) continue;
    if (!alanMap.has(alan)) alanMap.set(alan, []);
    alanMap.get(alan).push(k);
  }
  for (const [alan, liste] of alanMap) gruplar.push({ key: `alan:${alan}`, etiket: alan, kayitlar: liste });

  const riskMap = new Map();
  for (const k of kayitlar) {
    const risk = (k.riskDuzeyi || '').trim();
    if (!risk) continue;
    if (!riskMap.has(risk)) riskMap.set(risk, []);
    riskMap.get(risk).push(k);
  }
  for (const [risk, liste] of riskMap) gruplar.push({ key: `risk:${risk}`, etiket: risk, kayitlar: liste });

  return gruplar;
}

/** Aktif chip'in gerçekten mevcut gruplarda olduğunu doğrular -- silinmiş/
 * artık boş bir grup seçiliyse (ör. son "İşlenen" kaydı silindiyse)
 * sessizce 'tumu'ya döner, hata FIRLATMAZ. */
function _dofAktifGrupGetir(gruplar) {
  return gruplar.find((g) => g.key === _dofAktifGrupAnahtari) || gruplar.find((g) => g.key === 'tumu') || gruplar[0];
}

/** Uzun grup etiketini (ör. uzun alanTipi metni) mobilde tek satırda
 * kalacak şekilde kısaltır -- yalnız GÖRÜNTÜLEME, gruplama anahtarı
 * (`g.key`) ve filtreleme mantığı DEĞİŞMEZ. */
function _dofGrupEtiketKisalt(etiket, maxUzunluk = 14) {
  if (etiket.length <= maxUzunluk) return etiket;
  return `${etiket.slice(0, maxUzunluk - 1)}…`;
}

/** 4R-PKG-3C: kompakt pill/chip tasarımı -- büyük blok görünümü YERİNE
 * küçük, tek satır yatay kaydırılabilir pill'ler ("Tümü 7" gibi, parantez
 * YOK). Ayrı `.dof-grup-chip` sınıfı kullanılır -- genel `.chip` sınıfı
 * (normal saha kat/oda seçiminde kullanılıyor) DEĞİŞTİRİLMEDİ. */
function _dofGrupChipleriCiz(gruplar) {
  const kart = document.getElementById('dof-grup-kart');
  const el = document.getElementById('dof-grup-chipleri');
  if (!kart || !el) return;
  if (gruplar.length === 0) { kart.style.display = 'none'; return; }
  kart.style.display = 'block';
  el.innerHTML = gruplar.map((g) => {
    const aktif = g.key === _dofAktifGrupAnahtari;
    return `<div class="chip dof-grup-chip${aktif ? ' active' : ''}" data-grup-anahtari="${_escAttr(g.key)}"
      title="${_escAttr(g.etiket)}"
      onclick="_dofGrupSecTikla('${_escAttr(g.key)}')">${_esc(_dofGrupEtiketKisalt(g.etiket))} ${g.kayitlar.length}</div>`;
  }).join('');
}

/** Bir chip'e tıklanınca aktif grubu değiştirir ve yalnız kompakt listeyi
 * (chip'lerin sayılarını DEĞİL, onlar zaten güncel) yeniden çizer --
 * seçili DÖF yeni grupta yoksa seçim TEMİZLENİR (yanlış bağlamda açık
 * kalmaz), detay/takip/replay/medya panelleri buna göre kapanır. */
function _dofGrupSecTikla(anahtar) {
  _dofAktifGrupAnahtari = anahtar;
  const grup = _dofAktifGrupGetir(_dofGrupListesi);
  document.querySelectorAll('#dof-grup-chipleri .chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.grupAnahtari === grup.key);
  });
  if (_dofListeSeciliId && !grup.kayitlar.some((k) => k.id === _dofListeSeciliId)) {
    _dofListeSeciliId = null;
  }
  const listeEl = document.getElementById('dof-liste');
  if (listeEl) listeEl.innerHTML = grup.kayitlar.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(_dofListeSeciliId);
  _dofReviewDurumYukle(_dofListeSeciliId);
  _dofTakipFormYukle(_dofListeSeciliId);
  _dofReplayBolumYukle(_dofListeSeciliId);
  _dofKanitMedyaYukle(_dofListeSeciliId);
}
if (typeof window !== 'undefined') window._dofGrupSecTikla = _dofGrupSecTikla;

/** 4R-PKG-3G: Paket kayıtlarından güvenilir bir GÖRÜNEN AD çözmeye çalışır --
 * aday alan adlarını sırayla dener (Desktop export şeması bugün (bkz.
 * `tests/dof-import-fixtures.js`) yalnız OPAK `pwaKurumId`/`pwaBirimId`
 * içerir, isim alanı YOK -- bu fonksiyon Desktop'un ileride bu alanlardan
 * birini eklemesi ihtimaline karşı yazılır, ama ASLA UYDURMAZ). Bir aday
 * alan paketteki (o alanı dolu olan) kayıtların HEPSİNDE AYNIYSA güvenilir
 * sayılır ve döner; alan hiç yoksa veya ÇELİŞKİLİYSE (aynı pakette farklı
 * değerler) bir sonraki adaya geçilir. Hiçbiri güvenilir değilse `null`
 * döner -- çağıran taraf "Kurum adı belirlenmedi" fallback'ini gösterir. */
const _DOF_PAKET_AD_ALAN_ADAYLARI = [
  'kurumAdi', 'kurum', 'isyeriAdi', 'isyeri',
  'birimAdi', 'birim', 'denetimAdi', 'denetimBasligi', 'paketAdi',
];
function _dofPaketGorunenAdCoz(paketKayitlari) {
  for (const alan of _DOF_PAKET_AD_ALAN_ADAYLARI) {
    const degerler = paketKayitlari
      .map((k) => (typeof k[alan] === 'string' ? k[alan].trim() : ''))
      .filter((v) => v !== '');
    if (degerler.length === 0) continue;
    const ilk = degerler[0];
    if (degerler.every((v) => v === ilk)) return ilk;
  }
  return null;
}

/** 4R-PKG-3F/3G: Paket özet kartını (paket ekranında, `#dof-package-mod-blok`
 * içinde) çizer -- ARTIK yalnız TEK, açıkça belirtilen `paketUuid`'e ait
 * `kayitlar` (paket-scoped alt küme, bkz. `_dofListesiYukle`) kullanılır.
 * Başlık `_dofPaketGorunenAdCoz` ile güvenilir bulunursa gösterilir, yoksa
 * İCAT EDİLMEZ -- "Kurum adı belirlenmedi" + teknik alt bilgi olarak kısa
 * paketUuid gösterilir. */
function _dofPaketOzetiCiz(kayitlar, paketUuid, durumHaritasi) {
  const kart = document.getElementById('dof-paket-ozet-kart');
  const metinEl = document.getElementById('dof-paket-ozet-metin');
  if (!kart || !metinEl) return;
  if (!paketUuid || kayitlar.length === 0) { kart.style.display = 'none'; return; }
  kart.style.display = 'block';

  const { islenen, foto, ses } = _dofPaketSayaclariHesapla(kayitlar, durumHaritasi);
  const bekleyen = kayitlar.length - islenen;
  const gorunenAd = _dofPaketGorunenAdCoz(kayitlar);
  metinEl.innerHTML = `
    <div style="font-weight:700;">${_esc(gorunenAd || 'Kurum adı belirlenmedi')}</div>
    <div style="font-size:0.8rem; color:#999;">Paket: ${_esc(_dofKisaUuid(paketUuid))} · ${kayitlar.length} DÖF</div>
    <div>İşlenen: ${islenen} · Bekleyen: ${bekleyen} · Foto: ${foto} · Ses: ${ses}</div>`;
  kart.dataset.paketUuid = paketUuid;
}

/** Bir kayıt kümesinin işlenen/foto/ses toplamlarını, ÖNCEDEN hesaplanmış
 * `_dofDurumHaritasiHesapla` sonucundan (`durumHaritasi`, kayıt id'sine
 * göre) SALT-OKUNUR toplar -- hem ana ekran paket kartlarında
 * (`_dofPaketKartlariCiz`) hem paket ekranı özetinde (`_dofPaketOzetiCiz`)
 * AYNI mantık kullanılır. 4R-PKG-3F performans notu: önceden her ikisi de
 * KENDİ IndexedDB taramasını (kayıt başına `_dofKayitDegismisMi` +
 * `dbIndexTumu`) yeniden yapıyordu -- 59 kayıtlık gerçek pakette bu
 * TEKRARLANAN tarama (`_dofDurumHaritasiHesapla` zaten `_dofListesiYukle`'de
 * bir kez yapılıyor) yavaş ortamlarda test zaman aşımına yol açacak kadar
 * gecikmeye neden oluyordu -- artık salt-DOM, senkron bir toplama. */
function _dofPaketSayaclariHesapla(kayitlar, durumHaritasi) {
  let islenen = 0;
  let foto = 0;
  let ses = 0;
  for (const k of kayitlar) {
    const d = durumHaritasi.get(k.id);
    if (!d) continue;
    if (d.degisti) islenen++;
    foto += d.fotoSayisi;
    ses += d.sesSayisi;
  }
  return { islenen, foto, ses };
}

/** 4R-PKG-3F/3G: Ana ekrandaki (`#home-mod-blok`) paket/kurum kartları --
 * içe aktarılmış HER FARKLI paketUuid için ayrı bir kompakt kart (toplam/
 * işlenen/bekleyen/foto/ses özeti + Aç/Sil). Başlık `_dofPaketGorunenAdCoz`
 * ile güvenilir bulunursa gösterilir; kurum/birim adı kaynak veride YOKSA
 * (veya kayıtlar arasında çelişkiliyse) İCAT EDİLMEZ (ör. yanlış "Kütüphane"
 * gibi varsayılan üretilmez) -- "Kurum adı belirlenmedi" ana başlık, kısa
 * paketUuid teknik alt bilgi olarak gösterilir. "Aç" -- `#dof-package/
 * <paketUuid>` rotasına geçer. */
function _dofPaketKartlariCiz(kayitlar, durumHaritasi) {
  const kart = document.getElementById('dof-paket-listesi-kart');
  const el = document.getElementById('dof-paket-listesi');
  if (!kart || !el) return;
  kart.style.display = 'block';
  if (kayitlar.length === 0) {
    el.innerHTML = '<p style="color:#999; font-size:0.9rem;">Henüz içe aktarılmış DÖF yok.</p>';
    return;
  }

  const paketUuidler = [...new Set(kayitlar.map((k) => k.paketUuid))];
  const kartlarHtml = [];
  for (const paketUuid of paketUuidler) {
    const paketKayitlari = kayitlar.filter((k) => k.paketUuid === paketUuid);
    const { islenen, foto, ses } = _dofPaketSayaclariHesapla(paketKayitlari, durumHaritasi);
    const bekleyen = paketKayitlari.length - islenen;
    const gorunenAd = _dofPaketGorunenAdCoz(paketKayitlari);
    kartlarHtml.push(`
      <div class="finding-item" data-paket-uuid="${_escAttr(paketUuid)}">
        <div style="font-weight:700;">${_esc(gorunenAd || 'Kurum adı belirlenmedi')}</div>
        <div style="font-size:0.75rem; color:#999;">Paket: ${_esc(_dofKisaUuid(paketUuid))}</div>
        <div style="font-size:0.85rem; color:#666; margin-top:4px;">${paketKayitlari.length} DÖF · İşlenen ${islenen} · Bekleyen ${bekleyen}</div>
        <div style="font-size:0.85rem; color:#666;">Foto ${foto} · Ses ${ses}</div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-outline" style="width:auto; padding:8px 14px; font-size:0.85rem;" onclick="_dofPaketKartiAcTikla('${_escAttr(paketUuid)}')">Aç</button>
          <button class="btn btn-outline" style="width:auto; padding:8px 14px; font-size:0.85rem; color:#c0392b; border-color:#c0392b;" onclick="_dofPaketKartiSilTikla('${_escAttr(paketUuid)}')">Sil / Kaldır</button>
        </div>
      </div>`);
  }
  kart.style.display = 'block';
  el.innerHTML = kartlarHtml.join('');
}

/** "Paketi Sil / Kaldır" -- onay ister, onaylanırsa bu paketUuid'e ait
 * TÜM kanonik dofler kayıtlarını + bağlı dofKanitlari medyalarını
 * (servis `dofPaketiSil`) yerel IndexedDB'den siler. Desktop'a HİÇ
 * dokunmaz. Hem ana ekran paket kartından hem paket ekranındaki "Paketi
 * Sil / Kaldır" butonundan (bkz. `_dofPaketSilTikla`) çağrılır. */
function _dofPaketKartiSilTikla(paketUuid) {
  if (!paketUuid) return;
  showModal(
    'Paketi Sil',
    'Bu yerel DÖF paketini ve buna bağlı taslak/medya kayıtlarını kaldırmak istiyor musunuz?',
    async () => {
      const silinenAktifMi = paketUuid === _dofAktifPaketUuid;
      // 4R-PKG-3H: silinen paketin paylaşım cache'i artık GEÇERSİZ.
      if (_dofPaylasimZipCache.paketUuid === paketUuid) _dofPaylasimCacheSifirla();
      await dofPaketiSil(paketUuid);
      if (silinenAktifMi) location.hash = '#home';   // açık olduğun paket silindiyse ana sayfaya dön
      await _dofListesiYukle();
    },
    'Evet, Sil',
    'btn-danger',
  );
}
if (typeof window !== 'undefined') {
  window._dofPaketKartiSilTikla = _dofPaketKartiSilTikla;
  window._dofPaketGorunenAdCoz = _dofPaketGorunenAdCoz;
}

/** Paket ekranındaki "Paketi Sil / Kaldır" butonu -- aktif paketi hedefler. */
function _dofPaketSilTikla() {
  if (_dofAktifPaketUuid) _dofPaketKartiSilTikla(_dofAktifPaketUuid);
}
if (typeof window !== 'undefined') window._dofPaketSilTikla = _dofPaketSilTikla;

/** Tek bir yerel DÖF kaydını (kanonik VEYA legacy/WIP/hatalı -- `id` her
 * ikisinde de birincil anahtar) siler -- onay ister. Kanonik kayıtsa
 * bağlı kanıt medyaları da `dofPaketiSil`/`dofYerelKaydiSil` servisi
 * içinde birlikte temizlenir. */
function _dofYerelKaydiSilTikla(dofId) {
  showModal(
    'Kaydı Sil',
    'Bu yerel DÖF kaydını ve buna bağlı taslak/medya kayıtlarını kaldırmak istiyor musunuz?',
    async () => {
      await dofYerelKaydiSil(dofId);
      await _dofListesiYukle();
    },
    'Evet, Sil',
    'btn-danger',
  );
}
if (typeof window !== 'undefined') window._dofYerelKaydiSilTikla = _dofYerelKaydiSilTikla;

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
let _dofDurumHaritasi = new Map();   // dofUuid -> {degisti, fotoSayisi, sesSayisi} -- kart rozetleri + gruplama için önceden hesaplanır

async function _dofDurumHaritasiHesapla(kayitlar) {
  const harita = new Map();
  for (const k of kayitlar) {
    const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', k.dofUuid);
    const { fotoSayisi, sesSayisi } = _dofMedyaSayaclariHesapla(medyalar);
    harita.set(k.id, { degisti: await _dofKayitDegismisMi(k), fotoSayisi, sesSayisi });
  }
  return harita;
}

/** 4R-PKG-3B: "Sorunlu Yerel Kayıtlar" bölümü -- kanonik OLMAYAN
 * (legacy/WIP/hatalı/yarım) `dofler` kayıtlarını AYRI bir bölümde,
 * yalnız Sil/Kaldır aksiyonuyla listeler. Bu kayıtlar ANA listeye
 * (`.dof-liste-karti`) HİÇ girmez, tıklanamaz/açılamaz, takip/replay/
 * medya UI'larına bağlanmaz (mevcut "legacy görünmez" servis
 * sözleşmesi -- KANONIK_DOF_DEGIL -- DEĞİŞMEDİ). Yalnız yeni bir
 * gözlemlenebilirlik + silme yolu eklendi: kullanıcı artık bu bozuk
 * kayıtları GÖREBİLİR ve kaldırabilir (önceden hiçbir arayüzü yoktu). */
async function _dofSorunluKayitlariYukle(tumKayitlar) {
  const kart = document.getElementById('dof-sorunlu-kart');
  const listeEl = document.getElementById('dof-sorunlu-liste');
  if (!kart || !listeEl) return;
  const sorunlular = tumKayitlar.filter((k) => !_dofKanonikMi(k));
  if (sorunlular.length === 0) {
    kart.style.display = 'none';
    listeEl.innerHTML = '';
    return;
  }
  kart.style.display = 'block';
  listeEl.innerHTML = sorunlular.map((k) => `
    <div class="dof-liste-satir" style="position:relative; margin-bottom:8px;">
      <div style="padding:10px 40px 10px 12px; border-radius:8px; border:2px solid #f0d9b5; background:#fdf6ea;">
        <div style="font-weight:700;">${_esc(_dofDeger(k.bulguKodu, 'Eksik/bozuk kayıt'))}</div>
        <div style="font-size:0.8rem; color:#8a6d3b;">Tamamlanmamış veya hatalı içe aktarma -- açılamaz, yalnız kaldırılabilir.</div>
      </div>
      <button type="button" class="dof-liste-sil-btn" title="Kaydı sil"
        onclick="_dofYerelKaydiSilTikla('${_escAttr(k.id)}')"
        style="position:absolute; top:8px; right:8px; background:none; border:none; color:#c0392b; font-size:1rem; cursor:pointer; padding:4px 8px;">✕</button>
    </div>`).join('');
}

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
  await _dofSorunluKayitlariYukle(tumKayitlar);

  // 4R-PKG-3F: TEK geçişte hesaplanır -- hem liste rozetleri hem ana ekran
  // paket kartları hem paket özeti AYNI haritayı (kayıt id'sine göre foto/
  // ses/işlenme durumu) kullanır (performans: 59 kayıtlık gerçek pakette
  // her biri kendi IndexedDB taramasını YAPARSA -- yavaş cihaz/CI'de test
  // zaman aşımına yol açabilecek gereksiz tekrar sorgular önlenir).
  _dofDurumHaritasi = await _dofDurumHaritasiHesapla(_dofListeKayitlari);

  // 4R-PKG-3F: ana ekran paket kartları HER ZAMAN (aktif route ne olursa
  // olsun) güncel tutulur -- ucuz, salt-DOM; home dışındaki route'larda
  // görünmez ama içerik yine de tutarlı kalır (ör. work modundan home'a
  // dönüldüğünde eski/yanlış sayı görünmez).
  _dofPaketKartlariCiz(_dofListeKayitlari, _dofDurumHaritasi);

  if (_dofListeKayitlari.length === 0) {
    durumEl.textContent = 'Henüz içe aktarılmış DÖF yok.';
    listeEl.innerHTML = '';
    _dofListeSeciliId = null;
    _dofAktifPaketUuid = null;
    _dofGrupListesi = [];
    _dofDurumHaritasi = new Map();
    _dofGrupChipleriCiz([]);
    await _dofPaketOzetiCiz([], null);
    _dofDetayGoster(null);
    await _dofReviewDurumYukle(null);
    await _dofTakipFormYukle(null);
    await _dofReplayBolumYukle(null);
    await _dofKanitMedyaYukle(null);
    _dofRotaDogrula();
    return;
  }

  durumEl.textContent = '';
  // 4R-PKG-3E-FINAL/3F: sayfa yenilenince (veya ilk yüklemede) `_dofListeSeciliId`/
  // `_dofAktifPaketUuid` JS state'i sıfırdan başlar (null) -- ama hash hâlâ
  // `#dof-work/<uuid>` veya `#dof-package/<uuid>` olabilir (kullanıcı o
  // ekranı çalışırken yeniledi). Hash geçerli bir kanonik kayda/pakete
  // işaret ediyorsa render'dan ÖNCE seçimi hash'ten türetiriz, aksi halde
  // reload sonrası ekran GÖRÜNÜR ama İÇİ BOŞ kalırdı (3E-FINAL'de
  // keşfedilen gerçek regresyonla AYNI desen -- burada da önlendi).
  const hashDofUuid = _dofRotaHashDofUuid();
  if (hashDofUuid && _dofListeKayitlari.some((k) => k.id === hashDofUuid)) {
    _dofListeSeciliId = hashDofUuid;
  }
  if (_dofListeSeciliId && !_dofListeKayitlari.some((k) => k.id === _dofListeSeciliId)) {
    _dofListeSeciliId = null;   // seçili kayıt artık listede yok (ör. legacy'e dönüşmedi ama olası durum)
  }

  const hashPaketUuid = _dofRotaHashPaketUuid();
  if (hashPaketUuid && _dofListeKayitlari.some((k) => k.paketUuid === hashPaketUuid)) {
    _dofAktifPaketUuid = hashPaketUuid;
  } else if (_dofListeSeciliId) {
    // Çalışma modundaysa aktif paket, seçili DÖF'ün kendi paketidir
    // ("Listeye Dön" doğru pakete dönebilsin diye).
    const seciliKayit = _dofListeKayitlari.find((k) => k.id === _dofListeSeciliId);
    if (seciliKayit) _dofAktifPaketUuid = seciliKayit.paketUuid;
  }
  if (_dofAktifPaketUuid && !_dofListeKayitlari.some((k) => k.paketUuid === _dofAktifPaketUuid)) {
    _dofAktifPaketUuid = null;   // paket silinmiş
  }

  // Grup/liste/paket özeti ARTIK paket-scoped -- yalnız `_dofAktifPaketUuid`e
  // ait kayıtlar (paket ekranı dışında boş dizi, o kartlar zaten gizli).
  const paketKayitlari = _dofAktifPaketUuid
    ? _dofListeKayitlari.filter((k) => k.paketUuid === _dofAktifPaketUuid)
    : [];
  // `_dofDurumHaritasi` bu fonksiyonun BAŞINDA zaten hesaplandı (bkz.
  // yukarıdaki yorum) -- burada TEKRAR hesaplanmaz.
  _dofGrupListesi = await _dofGruplariHesapla(paketKayitlari, _dofDurumHaritasi);
  _dofGrupChipleriCiz(_dofGrupListesi);
  _dofPaketOzetiCiz(paketKayitlari, _dofAktifPaketUuid, _dofDurumHaritasi);
  const aktifGrup = _dofAktifGrupGetir(_dofGrupListesi);
  listeEl.innerHTML = aktifGrup.kayitlar.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(_dofListeSeciliId);
  await _dofReviewDurumYukle(_dofListeSeciliId);
  await _dofTakipFormYukle(_dofListeSeciliId);
  await _dofReplayBolumYukle(_dofListeSeciliId);
  await _dofKanitMedyaYukle(_dofListeSeciliId);
  _dofRotaDogrula();
}

/** Kompakt satır: bulgu/risk kodu + konum + rozetler (taslak/foto/ses).
 * `.dof-liste-karti` sınıfı/`data-dof-id` özniteliği/`onclick` çağrısı
 * DEĞİŞMEDİ (mevcut m/s/t/u/v/ah/ai/ak/al testleri bu sözleşmeye
 * dayanıyor). 4R-PKG-3C: canonical satırdaki tekil Sil (✕) düğmesi
 * KALDIRILDI -- gerçek Android testinde kullanıcı bunu "DÖF'ü/paketten
 * kaydı sil" gibi tehlikeli algıladı. Tekil canonical silme ayrı bir
 * ürün kararı olmadan sunulmayacak; paket bazlı silme hâlâ paket özeti
 * kartındaki "Paketi Sil / Kaldır" ile, sorunlu/tamamlanmamış (kanonik
 * OLMAYAN) kayıtlar hâlâ "Tamamlanmamış Kayıtlar" bölümünde Sil ile
 * yapılabiliyor (`dofYerelKaydiSil`/`dofPaketiSil` servisleri DEĞİŞMEDİ,
 * yalnız bu satırdan çağıran UI kaldırıldı). */
function _dofListeKartHtml(k) {
  const secili = k.id === _dofListeSeciliId;
  const konum = _dofDeger([k.kat, k.oda, k.alanTipi].filter((v) => v).join(' / ') || null);
  const risk = k.riskDuzeyi ? `${k.riskDuzeyi}${k.r !== null && k.r !== undefined ? ` (R=${k.r})` : ''}` : 'Bilgi yok';
  const d = _dofDurumHaritasi.get(k.id) || { degisti: false, fotoSayisi: 0, sesSayisi: 0 };
  const rozetler = [];
  rozetler.push(d.degisti
    ? '<span style="background:#e8f6ee; color:#1e8449; padding:1px 6px; border-radius:10px;">taslak var</span>'
    : '<span style="background:#f3f3f3; color:#888; padding:1px 6px; border-radius:10px;">işlem yok</span>');
  if (d.fotoSayisi > 0) rozetler.push(`<span style="background:#eaf2fd; color:var(--accent); padding:1px 6px; border-radius:10px;">foto ${d.fotoSayisi}</span>`);
  if (d.sesSayisi > 0) rozetler.push(`<span style="background:#eaf2fd; color:var(--accent); padding:1px 6px; border-radius:10px;">ses ${d.sesSayisi}</span>`);
  if (d.degisti) rozetler.push('<span style="background:#fdf0e3; color:#b9770e; padding:1px 6px; border-radius:10px;">replay\'e dahil</span>');

  // 4R-PKG-3D: seçili kart daha belirgin -- ince mavi çerçeve/arka plana ek
  // olarak gölge + açık "✓ Seçili" rozeti, kullanıcı hangi DÖF üzerinde
  // çalıştığını listede de tereddütsüz görsün.
  return `
    <div class="dof-liste-satir" style="margin-bottom:8px;">
      <button type="button" class="dof-liste-karti" data-dof-id="${_escAttr(k.id)}"
        onclick="_dofKartTiklandi('${_escAttr(k.id)}')"
        style="display:block; width:100%; text-align:left; padding:10px 12px; border-radius:8px; cursor:pointer;
               border:2px solid ${secili ? 'var(--accent)' : '#eee'}; background:${secili ? '#eaf4fc' : 'white'};
               ${secili ? 'box-shadow:0 0 0 3px rgba(52,152,219,0.18);' : ''}">
        <div style="font-weight:700; display:flex; align-items:center; gap:6px;">
          ${_esc(_dofDeger(k.bulguKodu))} <span style="font-weight:400; color:#666;">(Tehlike No: ${_esc(_dofDeger(k.tehlikeNo))})</span>
          ${secili ? '<span style="margin-left:auto; font-size:0.7rem; font-weight:700; color:var(--accent);">✓ Seçili</span>' : ''}
        </div>
        <div style="font-size:0.85rem; color:#666; margin-top:4px;">${_esc(risk)} · ${_esc(konum)}</div>
        <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap; font-size:0.72rem;">${rozetler.join('')}</div>
      </button>
    </div>`;
}

/** Liste kartına tıklanınca/klavyeyle etkinleştirilince çağrılır --
 * seçimi günceller, AKTİF GRUBUN listesini (tam listeyi DEĞİL --
 * filtrelenmiş görünüm korunur) ve detayı yeniden çizer. */
function _dofDetaySec(dofId) {
  _dofListeSeciliId = dofId;
  const aktifGrup = _dofAktifGrupGetir(_dofGrupListesi);
  const listeEl = document.getElementById('dof-liste');
  if (listeEl) listeEl.innerHTML = aktifGrup.kayitlar.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(dofId);
  _dofReviewDurumYukle(dofId);
  _dofTakipFormYukle(dofId);
  _dofReplayBolumYukle(dofId);
  _dofKanitMedyaYukle(dofId);
}

/** 4R-PKG-3F: `#dof-package/<paketUuid>` rotasına girerken (`_dofRotaGuncelle`)
 * çağrılır -- SEÇİLİ paketUuid'e ait grup/liste/paket özetini YENİDEN
 * hesaplar ve çizer. `_dofListesiYukle`'nin bir önceki çalıştırmasında
 * hesaplanan `_dofGrupListesi` BAŞKA (veya boş) bir paket bağlamına ait
 * olabilir -- `_dofDetaySec`'in DÖF seçimi için yaptığı tazelemeyle AYNI
 * desen, yalnız paket seviyesinde. Hiçbir DÖF seçili değildir (work
 * render'ları null ile temizlenir). */
async function _dofPaketSec(paketUuid) {
  // 4R-PKG-3H: farklı bir pakete geçiliyorsa önceki paketin paylaşım
  // cache'i artık İLGİSİZ -- hemen boşalt (yalnız UX netliği için, güvenlik
  // zaten `_dofReplayPaylasTikla`'nın `paketUuid` eşleşme kontrolüyle sağlanır).
  if (_dofPaylasimZipCache.paketUuid !== paketUuid) _dofPaylasimCacheSifirla();
  _dofAktifPaketUuid = paketUuid;
  _dofListeSeciliId = null;
  const paketKayitlari = _dofListeKayitlari.filter((k) => k.paketUuid === paketUuid);
  // `_dofDurumHaritasi` en son `_dofListesiYukle` çalıştığında hesaplandı --
  // navigasyon veri DEĞİŞTİRMEZ, o yüzden burada güvenle TEKRAR KULLANILIR
  // (59 kayıtlık gerçek pakette tekrar IndexedDB taraması yavaş ortamlarda
  // gecikmeye/test zaman aşımına yol açıyordu).
  _dofGrupListesi = await _dofGruplariHesapla(paketKayitlari, _dofDurumHaritasi);
  _dofGrupChipleriCiz(_dofGrupListesi);
  _dofPaketOzetiCiz(paketKayitlari, paketUuid, _dofDurumHaritasi);
  const aktifGrup = _dofAktifGrupGetir(_dofGrupListesi);
  const listeEl = document.getElementById('dof-liste');
  if (listeEl) listeEl.innerHTML = aktifGrup.kayitlar.map((k) => _dofListeKartHtml(k)).join('');
  _dofDetayGoster(null);
  await _dofReviewDurumYukle(null);
  await _dofTakipFormYukle(null);
  await _dofReplayBolumYukle(null);
  await _dofKanitMedyaYukle(null);
}

/** Mevcut hash `#dof-work/<dofUuid>` biçimindeyse dofUuid'i döner, değilse
 * `null` -- route fonksiyonlarının hepsi bu TEK ayrıştırmayı paylaşır. */
function _dofRotaHashDofUuid() {
  const hash = (typeof location !== 'undefined' && location.hash) || '';
  const eslesme = hash.match(/^#dof-work\/(.+)$/);
  return eslesme ? decodeURIComponent(eslesme[1]) : null;
}

/** Mevcut hash `#dof-package/<paketUuid>` biçimindeyse paketUuid'i döner,
 * değilse `null`. */
function _dofRotaHashPaketUuid() {
  const hash = (typeof location !== 'undefined' && location.hash) || '';
  const eslesme = hash.match(/^#dof-package\/(.+)$/);
  return eslesme ? decodeURIComponent(eslesme[1]) : null;
}

/** Üç route bloğunun (`#home-mod-blok`/`#dof-package-mod-blok`/
 * `#dof-work-mod-blok`) DOM görünürlüğünü `_dofRotaModu`'a göre ayarlar --
 * SALT DOM, hiçbir veri okumaz/yazmaz. 4R-PKG-3F: gerçek Android canlı
 * testte "DÖF çalışma ekranındayken üstte hâlâ Yeni Denetim/Kurum/Yedekle/
 * DÖF Paketi Al görünüyor" şikayeti buradan çözüldü -- ana ekran artık
 * AYRI bir wrapper (`#home-mod-blok`), yalnız 'home' modunda görünür. */
function _dofRotaUygula() {
  const homeBlok = document.getElementById('home-mod-blok');
  const paketBlok = document.getElementById('dof-package-mod-blok');
  const calismaBlok = document.getElementById('dof-work-mod-blok');
  if (homeBlok) homeBlok.style.display = _dofRotaModu === 'home' ? '' : 'none';
  if (paketBlok) paketBlok.style.display = _dofRotaModu === 'package' ? 'block' : 'none';
  if (calismaBlok) calismaBlok.style.display = _dofRotaModu === 'work' ? 'block' : 'none';
}

/** `_dofListesiYukle` SONUNDA çağrılan HAFİF sürüm -- `_dofRotaGuncelle`
 * ile AYNI hash/kayıt doğrulamasını yapar ama render zincirini (`_dofDetaySec`)
 * TEKRAR ÇAĞIRMAZ (o render zaten `_dofListesiYukle`'nin kendi gövdesinde,
 * AWAIT'lenmiş olarak yapıldı -- tekrar çağırmak 3E-FINAL'de "Kaydedildi"
 * mesajının anlık boşalan bir alanla YARIŞA girip üzerine yazması gibi
 * gerçek bir regresyona yol açmıştı). Burada YALNIZ görünürlük/route modu
 * güncellenir -- `_dofAktifPaketUuid`/`_dofListeSeciliId` zaten
 * `_dofListesiYukle` tarafından hash'ten ÖNCEDEN türetilmiş olmalı. */
function _dofRotaDogrula() {
  const hash = (typeof location !== 'undefined' && location.hash) || '';
  const workUuid = _dofRotaHashDofUuid();
  const paketUuid = _dofRotaHashPaketUuid();
  if (workUuid) {
    _dofRotaModu = _dofListeKayitlari.some((k) => k.id === workUuid) ? 'work' : 'home';
  } else if (paketUuid) {
    _dofRotaModu = _dofListeKayitlari.some((k) => k.paketUuid === paketUuid) ? 'package' : 'home';
  } else {
    _dofRotaModu = 'home';
  }
  _dofRotaUygula();
  // Home modunun kanonik URL'i `#home` -- ilk yükleme/import sonrası boş/
  // normalize edilmemiş hash'i sessizce düzeltir (render zinciri TETİKLEMEZ,
  // yalnız URL yazar).
  if (_dofRotaModu === 'home' && hash !== '#home' && typeof history !== 'undefined' && history.replaceState) {
    history.replaceState(history.state, '', '#home');
  }
}

/** Hash route'un TEK doğruluk kaynağı -- `hashchange` ve navigasyon
 * fonksiyonlarınca çağrılır. Üç rota:
 * - `#dof-work/<dofUuid>` -- kanonik listede varsa çalışma moduna geçer
 *   (yalnız o DÖF render edilir); YOKSA güvenli şekilde `#home`'a döner
 *   (hangi pakete ait olduğu bilinemediği için package'a dönülemez).
 * - `#dof-package/<paketUuid>` -- o paketUuid'e ait en az bir kanonik kayıt
 *   varsa paket moduna geçer (yalnız o paketin grup/liste'i görünür);
 *   YOKSA güvenli şekilde `#home`'a döner.
 * - Diğer her hash (`#home`, boş, ilgisiz) home modudur.
 * Hiçbir zaman boş/kırık bir çalışma veya paket ekranında kalınmaz. */
function _dofRotaGuncelle() {
  const workUuid = _dofRotaHashDofUuid();
  const paketUuidHash = _dofRotaHashPaketUuid();

  if (workUuid) {
    const kayit = _dofListeKayitlari.find((k) => k.id === workUuid);
    if (kayit) {
      _dofRotaModu = 'work';
      _dofAktifPaketUuid = kayit.paketUuid;
      _dofRotaUygula();
      _dofDetaySec(workUuid);
      return;
    }
    _dofRotaGeriDon('DÖF bulunamadı, ana sayfaya dönüldü.');
    return;
  }

  if (paketUuidHash) {
    const paketVarMi = _dofListeKayitlari.some((k) => k.paketUuid === paketUuidHash);
    if (paketVarMi) {
      _dofRotaModu = 'package';
      _dofRotaUygula();
      _dofPaketSec(paketUuidHash);
      return;
    }
    _dofRotaGeriDon('DÖF paketi bulunamadı, ana sayfaya dönüldü.');
    return;
  }

  _dofRotaModu = 'home';
  _dofAktifPaketUuid = null;
  _dofListeSeciliId = null;
  _dofRotaUygula();
  // Home modunun kendi kanonik URL'i `#home` -- boş/ilgisiz hash'ler (ör.
  // ilk yükleme) sessizce normalize edilir, `replaceState` yeni history
  // seviyesi EKLEMEZ/hashchange TETİKLEMEZ (döngü riski yok).
  const hash = (typeof location !== 'undefined' && location.hash) || '';
  if (hash !== '#home' && typeof history !== 'undefined' && history.replaceState) {
    history.replaceState(history.state, '', '#home');
  }
}

/** Geçersiz/bulunamayan dofUuid veya paketUuid -- kırık ekranda bırakmadan
 * güvenli şekilde `#home`'a döner, kullanıcıya açık mesaj gösterir. */
function _dofRotaGeriDon(mesaj) {
  _dofRotaModu = 'home';
  _dofAktifPaketUuid = null;
  _dofListeSeciliId = null;
  _dofRotaUygula();
  _dofDetaySec(null);
  const durumEl = document.getElementById('dof-liste-durum');
  if (durumEl && _dofListeKayitlari.length > 0) durumEl.textContent = mesaj;
  if (typeof history !== 'undefined' && history.replaceState) {
    history.replaceState(history.state, '', '#home');
  }
}
if (typeof window !== 'undefined') window.addEventListener('hashchange', _dofRotaGuncelle);

/** Liste kartına tıklanınca çağrılır (onclick) -- hash'i günceller VE
 * rotayı DOĞRUDAN uygular (hashchange olayının asenkron gelmesini
 * BEKLEMEZ -- render anında olur). `hashchange` olayı da (hash gerçekten
 * değiştiyse) ayrıca tetiklenir ve `_dofRotaGuncelle`'i tekrar çağırır --
 * idempotent olduğu için zararsızdır, yalnız güvenlik amaçlı (ör. tarayıcı
 * geri/ileri tuşu). */
function _dofKartTiklandi(dofId) {
  location.hash = `#dof-work/${encodeURIComponent(dofId)}`;
  _dofRotaGuncelle();
}
if (typeof window !== 'undefined') window._dofKartTiklandi = _dofKartTiklandi;

/** Ana ekrandaki paket kartında "Aç" -- `#dof-package/<paketUuid>` rotasına geçer. */
function _dofPaketKartiAcTikla(paketUuid) {
  location.hash = `#dof-package/${encodeURIComponent(paketUuid)}`;
  _dofRotaGuncelle();
}
if (typeof window !== 'undefined') window._dofPaketKartiAcTikla = _dofPaketKartiAcTikla;

/** Çalışma ekranındaki "Listeye Dön" -- aktif DÖF'ün paketine
 * (`_dofAktifPaketUuid`, `_dofRotaGuncelle` work moduna girerken zaten
 * ayarladı) döner. Paket artık bilinmiyorsa (olağan akışta oluşmaz,
 * savunma amaçlı) `#home`'a düşer. */
function _dofPaketeDon() {
  location.hash = _dofAktifPaketUuid ? `#dof-package/${encodeURIComponent(_dofAktifPaketUuid)}` : '#home';
  _dofRotaGuncelle();
}
if (typeof window !== 'undefined') window._dofPaketeDon = _dofPaketeDon;

/** Paket ekranındaki "Ana Sayfaya Dön" -- `#home`'a döner. */
function _dofAnaSayfayaDon() {
  location.hash = '#home';
  _dofRotaGuncelle();
}
if (typeof window !== 'undefined') window._dofAnaSayfayaDon = _dofAnaSayfayaDon;

/** 4R-PKG-3C: aktif DÖF çalışma alanının üstünde -- normal saha
 * denetimindeki "aktif konum" başlığına benzer -- kompakt, salt-okunur
 * bir "Aktif DÖF" özeti gösterir. Kullanıcı her yerde hangi DÖF üzerinde
 * çalıştığını görebilsin diye takip/kanıt bölümlerinin de üstünde durur.
 * Yalnız görüntüleme -- düzenlenebilir alan YOK. */
function _dofAktifBaslikGoster(k) {
  const kart = document.getElementById('dof-aktif-baslik-kart');
  const el = document.getElementById('dof-aktif-baslik-metin');
  if (!kart || !el) return;
  if (!k) {
    kart.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  kart.style.display = 'block';
  const konum = _dofDeger([k.kat, k.oda, k.alanTipi].filter((v) => v).join(' / ') || null, '');
  const risk = k.riskDuzeyi ? `${k.riskDuzeyi}${k.r !== null && k.r !== undefined ? ` · R=${k.r}` : ''}` : '';
  el.innerHTML = `
    <div style="font-size:0.75rem; color:#666; text-transform:uppercase; letter-spacing:0.03em;">Aktif DÖF</div>
    <div style="font-weight:700; font-size:1.05rem;">${_esc(_dofDeger(k.bulguKodu))}${k.riskKodu ? ` · ${_esc(k.riskKodu)}` : ''}</div>
    <div style="font-size:0.85rem; color:#666;">${[risk, konum].filter(Boolean).map(_esc).join(' · ')}</div>`;
}

function _dofDetayGoster(dofId) {
  const kart = document.getElementById('dof-detay-kart');
  const el = document.getElementById('dof-detay');
  if (!kart || !el) return;
  if (!dofId) {
    kart.style.display = 'none';
    el.innerHTML = '';
    _dofAktifBaslikGoster(null);
    return;
  }
  const k = _dofListeKayitlari.find((x) => x.id === dofId);
  if (!k) {
    kart.style.display = 'block';
    el.innerHTML = '<p>DÖF detayı yüklenemedi.</p>';
    _dofAktifBaslikGoster(null);
    return;
  }
  kart.style.display = 'block';
  _dofAktifBaslikGoster(k);

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
    <div><strong>Bulgu Kodu:</strong> ${_esc(_dofDeger(k.bulguKodu))}</div>
    <div><strong>Risk Kodu:</strong> ${_esc(_dofDeger(k.riskKodu))}</div>
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

  // PWA Commit 4O: pasif, ENGELLEMEYEN bilgilendirme -- hiçbir kontrolü
  // devre dışı bırakmaz, yalnız "sadece incelenenleri export et" filtresinin
  // (dofIncelenenDofUuidleriniFiltrele) bu DÖF'ü nasıl değerlendireceğini gösterir.
  const filtreNotuEl = document.getElementById('dof-review-durum-filtre-notu');
  if (filtreNotuEl) {
    filtreNotuEl.textContent = reviewStatus === _DOF_REVIEW_STATUS_VARSAYILAN
      ? "Bu DÖF 'sadece incelenenler' seçiminde yer almayacak." : '';
  }
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
    // Replay Paketi kartının "yalnız inceleme durumu" notu reviewStatus'a
    // bağlı olduğundan, tam liste yenilemeden (ağır) yalnız bu kartı tazele.
    await _dofReplayBolumYukle(dofUuid);
  } catch (e) {
    if (hataEl) hataEl.textContent = (e && e.message) || 'İnceleme durumu kaydedilemedi.';
  }
}

if (typeof window !== 'undefined') {
  window._dofReviewDurumDegisti = _dofReviewDurumDegisti;
}

// ─── 4R-PKG-3I: GERÇEK ANDROID CİHAZ TEŞHİS DURUMU ───────────────
// Neden var: 3G (Kaydet) ve 3H (Paylaş) düzeltmelerinden sonra Playwright
// suite'i 424/424 yeşil geçtiği HÂLDE gerçek Android cihazda iki sorun da
// sürdü. Bu, testlerin gerçek cihaz koşullarını (dokunma olay sırası,
// Chrome'un Web Share dosya-tipi allowlist'i, transient user activation
// penceresi, güneş altında görsel algı) YAKALAYAMADIĞINI gösterir.
//
// Bu modül HİÇBİR iş kuralını değiştirmez -- yalnız "hangi dal çalıştı"
// sorusunu tek ekran görüntüsüyle yanıtlanabilir kılmak için salt-okunur
// gözlem kaydeder. Panel varsayılan olarak GİZLİDİR.
const _dofDebug = {
  // Kaydet tarafı
  sonEventTuru: null,
  sonEventAlani: null,
  sonKaydetSonucu: null,        // blocked_disabled_true | blocked_dirty_false | saved_ok | save_error:<kod>
  sonDbYazmaZamani: null,
  sonButonGuncellemeZamani: null,
  // Paylaş tarafı
  canShareZip: null,
  canShareOctet: null,
  kullanilanMime: null,
  shareVarMi: null,
  canShareVarMi: null,
  shareHataAdi: null,
  shareHataMesaji: null,
  tiklamaZamani: null,
  shareCagriGecikmesiMs: null,  // tıklama -> navigator.share çağrısı arası
  // 4R-PKG-3I-SHARE: aktivasyon share'in HEMEN ÖNCESİ ve HEMEN SONRASI
  // olarak AYRI ölçülür -- "gesture zincirinden çıkıldı mı" sorusunu tek
  // ekran görüntüsünden yanıtlamak için (canlı cihazda önce=false
  // görülmüştü; düzeltmeden sonra önce=true beklenir).
  uaOnceIsActive: null,
  uaOnceHasBeenActive: null,
  uaSonraIsActive: null,
  uaSonraHasBeenActive: null,
};

function _dofDebugZaman() {
  return new Date().toLocaleTimeString('tr-TR', { hour12: false }) + '.' + String(Date.now() % 1000).padStart(3, '0');
}

/** 4R-PKG-3J: Debug paneli artık ayrı bir link+localStorage çiftiyle değil,
 * tek bir native `<details id="dof-gelistirici-detay">` ("Geliştirici"
 * başlığı) ile açılıp kapanıyor -- varsayılan KAPALI (collapsed), açılınca
 * `#dof-debug-panel` içeriğinin TAMAMI aynen görünür (ayrıca bir tıklama
 * gerekmez). Açık/kapalı tercihi yine `localStorage.DEBUG_DOF`'ta saklanır
 * (sayfa yenilenince korunur) -- `<details>`'ın kendi `toggle` olayına
 * bağlanır. */
function _dofDebugToggleDegisti(detayEl) {
  if (detayEl.open) localStorage.setItem('DEBUG_DOF', '1');
  else localStorage.removeItem('DEBUG_DOF');
  _dofDebugPanelCiz();
}
if (typeof window !== 'undefined') window._dofDebugToggleDegisti = _dofDebugToggleDegisti;

/** Paneli o anki GERÇEK DOM/state değerleriyle yeniden çizer. Buton
 * durumunu DOM'dan OKUR (kod içi değişkenden değil) -- "görsel pasif ama
 * native disabled false" ayrımını kesin göstermek için. Görünürlük artık
 * SALT `<details>` tarafından yönetilir -- bu fonksiyon yalnız İÇERİĞİ
 * yazar (kapalıyken de yazması zararsızdır, kapalı `<details>` içeriği
 * zaten render etmez). */
function _dofDebugPanelCiz() {
  const panel = document.getElementById('dof-debug-panel');
  if (!panel) return;

  const kaydetBtn = document.getElementById('dof-takip-kaydet-btn');
  const paylasBtn = document.getElementById('dof-replay-paylas-btn');
  const c = _dofPaylasimZipCache;
  const ua = (typeof navigator !== 'undefined' && navigator.userActivation) || null;
  const s = (deger) => (deger === null || deger === undefined ? '-' : String(deger));

  panel.textContent = [
    `== KAYDET ==`,
    `aktif DÖF        : ${s(_dofTakipSecliDofUuid && _dofKisaUuid(_dofTakipSecliDofUuid))}`,
    `btn.disabled     : ${kaydetBtn ? kaydetBtn.disabled : '-'}   (DOM'dan okundu)`,
    `btn aria-disabled: ${kaydetBtn ? s(kaydetBtn.getAttribute('aria-disabled')) : '-'}`,
    `dirty alan sayısı: ${_dofTakipDokunulanAlanlar.size}`,
    `dirty alanlar    : ${[..._dofTakipDokunulanAlanlar].join(', ') || '-'}`,
    `son event        : ${s(_dofDebug.sonEventTuru)} / ${s(_dofDebug.sonEventAlani)}`,
    `son Kaydet sonucu: ${s(_dofDebug.sonKaydetSonucu)}`,
    `son DB yazma     : ${s(_dofDebug.sonDbYazmaZamani)}`,
    `son btn güncelle : ${s(_dofDebug.sonButonGuncellemeZamani)}`,
    ``,
    `== PAYLAŞ ==`,
    `aktif paket      : ${s(_dofReplayAktifPaketUuid && _dofKisaUuid(_dofReplayAktifPaketUuid))}`,
    `paylaş btn.disabl: ${paylasBtn ? paylasBtn.disabled : '-'}`,
    `cache.hazir      : ${c.hazir}`,
    `cache.hazirlaniyor: ${c.hazirlaniyor}`,
    `cache.hata       : ${c.hata ? ((c.hata.kod || c.hata.name || '') + ' ' + (c.hata.message || '')) : '-'}`,
    `cache.imza(kısa) : ${c.imza ? String(c.imza).slice(0, 40) + '…' : '-'}`,
    `cache.zipBlob    : ${c.zipBlob ? c.zipBlob.size + ' bayt' : '-'}`,
    `cache.dosyaAdi   : ${s(c.dosyaAdi)}`,
    `navigator.share  : ${s(_dofDebug.shareVarMi)}`,
    `navigator.canShare: ${s(_dofDebug.canShareVarMi)}`,
    `canShare(zip)    : ${s(_dofDebug.canShareZip)}`,
    `canShare(octet)  : ${s(_dofDebug.canShareOctet)}`,
    `kullanılan MIME  : ${s(_dofDebug.kullanilanMime)}`,
    `share hata adı   : ${s(_dofDebug.shareHataAdi)}`,
    `share hata mesajı: ${s(_dofDebug.shareHataMesaji)}`,
    `tıklama zamanı   : ${s(_dofDebug.tiklamaZamani)}`,
    `tıklama->share ms: ${s(_dofDebug.shareCagriGecikmesiMs)}`,
    `userActivation ÖNCE : isActive=${s(_dofDebug.uaOnceIsActive)} hasBeenActive=${s(_dofDebug.uaOnceHasBeenActive)}`,
    `userActivation SONRA: isActive=${s(_dofDebug.uaSonraIsActive)} hasBeenActive=${s(_dofDebug.uaSonraHasBeenActive)}`,
    `userActivation ŞİMDİ: isActive=${ua ? ua.isActive : '-'} hasBeenActive=${ua ? ua.hasBeenActive : '-'}`,
  ].join('\n');
}
if (typeof window !== 'undefined') {
  window._dofDebugDurumOku = () => ({ ..._dofDebug });
  window._dofDebugPanelCiz = _dofDebugPanelCiz;
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
 * sayılır). `korunacakAlanlar` (4R-PKG-3G) verilirse, o alanların DEĞERİ
 * yazılmaz -- `_dofTakipFormYukle`'nin DB fetch'i sürerken kullanıcının
 * dokunduğu (henüz kaydedilmemiş) alanları ezmemek için kullanılır. */
function _dofTakipFormaYaz(taslak, korunacakAlanlar = null) {
  const yaz = (alan, elId, deger) => {
    if (korunacakAlanlar && korunacakAlanlar.has(alan)) return;
    document.getElementById(elId).value = deger;
  };
  yaz('planlanan_tarih', 'dof-takip-planlanan-tarih', taslak.planlanan_tarih || '');
  yaz('sorumlu', 'dof-takip-sorumlu', taslak.sorumlu || '');
  yaz('gerceklesen_faaliyet', 'dof-takip-gerceklesen-faaliyet', taslak.gerceklesen_faaliyet || '');
  yaz('etkinlik_kontrol_tarihi', 'dof-takip-etkinlik-kontrol-tarihi', taslak.etkinlik_kontrol_tarihi || '');
  yaz('gozlem_degerlendirme', 'dof-takip-gozlem-degerlendirme', taslak.gozlem_degerlendirme || '');
  yaz('yeni_o', 'dof-takip-yeni-o', (taslak.yeni_o ?? '') === '' ? '' : String(taslak.yeni_o));
  yaz('yeni_f', 'dof-takip-yeni-f', (taslak.yeni_f ?? '') === '' ? '' : String(taslak.yeni_f));
  yaz('yeni_s', 'dof-takip-yeni-s', (taslak.yeni_s ?? '') === '' ? '' : String(taslak.yeni_s));
}

/** Bir form alanının GÜNCEL değerini, servisin beklediği tipe (tarih/metin
 * string veya sayı) çevirerek okur. Boş değer -> `null` (temizleme talebi). */
function _dofTakipFormDegerOku(alan) {
  const ham = document.getElementById(_DOF_TAKIP_ALAN_ELEMENT_ID[alan]).value;
  if (ham === '') return null;
  return _DOF_TAKIP_OFS_ALANLARI_UI.includes(alan) ? Number(ham) : ham;
}

// ─── 4R-PKG-3J: DÖF ÇALIŞMA EKRANI TEK DURUM METNİ ───────────────
// Canlı kullanıcı bulgusu: foto/ses eklendikten sonra Kaydet gri kaldığı
// için kullanıcı "kaydedilmedi" sanıyor -- oysa medya zaten IndexedDB'ye
// yazılmış durumda (bilinçli ürün kararı: medya Kaydet'e bağlı DEĞİL).
// Sorun buton davranışı değil, hiçbir yerde "kaydedildi" geri bildirimi
// verilmemesiydi. Bu tek alan (`#dof-durum-metni`, Kaydet/Temizle buton
// satırının HEMEN ALTINDA) hem Kaydet hem medya olaylarını KAPSAR --
// `_dofDurumMetniGuncelle` bu alana yazan YEGANE fonksiyondur.
const _DOF_DURUM_METIN_TEXT = {
  bos: '',
  dirty: 'Kaydedilmemiş değişiklik var',
  kaydedildi: 'Kaydedildi',
  foto: 'Fotoğraf eklendi',
  gorsel: 'Görsel eklendi',
  ses: 'Ses notu eklendi',
  silindi: 'Silindi',
  hata: 'Kaydedilemedi — tekrar deneyin',
};
// Saat damgası yalnız GERÇEKTEN bir IndexedDB yazması sonrası eklenir.
const _DOF_DURUM_METIN_SAATLI = new Set(['kaydedildi', 'foto', 'gorsel', 'ses', 'silindi']);
const _DOF_DURUM_METIN_ONAY = new Set(['kaydedildi', 'foto', 'gorsel', 'ses', 'silindi']);
const _DOF_DURUM_METIN_RENK = {
  bos: '#888', dirty: '#b9770e', hata: '#c0392b',
  kaydedildi: '#1e8449', foto: '#1e8449', gorsel: '#1e8449', ses: '#1e8449', silindi: '#1e8449',
};

function _dofDurumSaatFormatla(tarih) {
  const iki = (n) => String(n).padStart(2, '0');
  return `${iki(tarih.getHours())}:${iki(tarih.getMinutes())}`;
}

/** `#dof-durum-metni`'ye yazan TEK fonksiyon (4R-PKG-3J sözleşmesi) --
 * Kaydet/medya-ekleme/medya-silme olaylarının HİÇBİRİ bu alana DOĞRUDAN
 * yazmaz, hepsi buradan geçer. Çağıran taraf yalnız İLGİLİ IndexedDB
 * yazması BAŞARIYLA tamamlandıktan SONRA çağırır -- yazma başarısızsa
 * (catch bloklarında) bu fonksiyon hiç çağrılmaz, başarı metni gösterilmez.
 * Kaydedilmemiş takip değişikliği (dirty) varsa -- `hata`/`dirty` DIŞINDA
 * hiçbir mesaj bunu EZEMEZ (kullanıcı önce mevcut değişikliği görmeli). */
function _dofDurumMetniGuncelle(tip, zaman = new Date()) {
  const el = document.getElementById('dof-durum-metni');
  if (!el) return;
  const dirtyAktif = _dofTakipDokunulanAlanlar.size > 0;
  if (dirtyAktif && tip !== 'dirty' && tip !== 'hata') return;
  const saat = _DOF_DURUM_METIN_SAATLI.has(tip) ? ` · ${_dofDurumSaatFormatla(zaman)}` : '';
  const onay = _DOF_DURUM_METIN_ONAY.has(tip) ? '✓ ' : '';
  el.textContent = tip === 'bos' ? '' : `${onay}${_DOF_DURUM_METIN_TEXT[tip]}${saat}`;
  el.style.color = _DOF_DURUM_METIN_RENK[tip] || '#666';
}
if (typeof window !== 'undefined') window._dofDurumMetniGuncelle = _dofDurumMetniGuncelle;

/** Kaydet butonunun aktiflik durumunu günceller -- hiçbir alana
 * dokunulmadıysa disabled (gereksiz/no-op kaydı önlemenin ilk katmanı;
 * asıl güvence `_dofTakipKaydet` içindeki boş-küme kontrolüdür). */
function _dofTakipButonDurumGuncelle() {
  const btn = document.getElementById('dof-takip-kaydet-btn');
  const dolu = _dofTakipDokunulanAlanlar.size > 0;
  if (btn) {
    btn.disabled = !dolu;
    // 4R-PKG-3I: native `disabled` ile aria-disabled HER ZAMAN birlikte
    // güncellenir -- ekran okuyucu/erişilebilirlik katmanının "pasif
    // görünüyor ama aslında aktif" gibi bir ara duruma düşmesi imkansız.
    btn.setAttribute('aria-disabled', dolu ? 'false' : 'true');
  }
  // 4R-PKG-3D: mobilde ince opaklık geçişi tek başına yeterince belirgin
  // değil (kullanıcı raporu) -- açık metin ipucu ekler, buton kendi
  // enable/disable mantığını DEĞİŞTİRMEZ.
  const ipucu = document.getElementById('dof-takip-ipucu');
  if (ipucu) ipucu.textContent = dolu ? 'Değişiklik var -- Kaydet aktif.' : 'Takip bilgisi girince aktif olur.';
  _dofDurumMetniGuncelle(dolu ? 'dirty' : 'bos');
  _dofDebug.sonButonGuncellemeZamani = _dofDebugZaman();
  _dofDebugPanelCiz();
}

/** Bir form alanı kullanıcı tarafından değiştirildiğinde çağrılır
 * (oninput/onchange). Yalnız BU alanı dokunulmuş işaretler -- diğer
 * alanların absent/value durumunu ETKİLEMEZ. */
function _dofTakipAlanDegisti(alan, olay) {
  _dofTakipDokunulanAlanlar.add(alan);
  // 4R-PKG-3I: gerçek cihazda hangi olay türünün (input/change) tetiklendiğini
  // ekran görüntüsünden görebilmek için -- Android tarih/select alanlarının
  // olay davranışı masaüstü Chromium'dan farklı olabiliyor.
  _dofDebug.sonEventTuru = (olay && olay.type) || 'bilinmiyor';
  _dofDebug.sonEventAlani = alan;
  _dofTakipButonDurumGuncelle();
}

/** Seçili DÖF değiştiğinde (veya liste yenilendiğinde) çağrılır -- formu
 * `dofTakipTaslagiGetir`'den TAZE değerlerle doldurur, dirty izlemeyi
 * sıfırlar. `dofUuid` yoksa (seçim yok/liste boş) formu gizler. Kanonik
 * olmayan/bulunamayan DÖF için form AÇILMAZ (legacy güvenliği).
 *
 * 4R-PKG-3G yarış-durumu notu: Kaydet sonrası `_dofListesiYukle()` bu
 * fonksiyonu AYNI dofUuid ile tekrar çağırır (özet/liste tazeleme). Bu
 * çağrının `await dofTakipTaslagiGetir(...)` süresi (özellikle Android'de
 * yavaş cihaz/gerçek IndexedDB) kullanıcının YENİ bir alanı değiştirmesine
 * yetecek kadar uzayabilir. O yüzden: (a) dirty küme yalnız GERÇEK bir DÖF
 * değişiminde hemen sıfırlanır -- aynı DÖF'ün yeniden yüklenmesinde
 * sıfırlanmaz; (b) fetch dönünce, bu çağrı BAŞLARKEN zaten dokunulmuş
 * alanlar "kaydedilmiş" sayılıp temizlenir, ama fetch SÜRERKEN yeni
 * dokunulan alanlar hem değer hem dirty-iz olarak KORUNUR (DB'den gelen
 * eski değerle ezilmez, buton pasifleşmez). */
async function _dofTakipFormYukle(dofUuid) {
  const kart = document.getElementById('dof-takip-form-kart');
  if (!kart) return;
  const dofDegisti = dofUuid !== _dofTakipSecliDofUuid;
  _dofTakipSecliDofUuid = dofUuid;

  if (!dofUuid) {
    _dofTakipDokunulanAlanlar = new Set();
    kart.style.display = 'none';
    return;
  }

  if (dofDegisti) _dofTakipDokunulanAlanlar = new Set();
  const cagriBaslangicDokunulanlar = new Set(_dofTakipDokunulanAlanlar);

  const durum = document.getElementById('dof-takip-durum');
  try {
    const sonuc = await dofTakipTaslagiGetir(dofUuid);
    // Bu await sürerken kullanıcı başka bir DÖF'e geçmiş olabilir -- öyleyse
    // bu (artık eski) sonuç geçerli DÖF'ün formunu GÜNCELLEMEMELİ.
    if (_dofTakipSecliDofUuid !== dofUuid) return;
    kart.style.display = 'block';
    durum.textContent = '';
    const yeniDokunulanlar = new Set();
    for (const alan of _dofTakipDokunulanAlanlar) {
      if (!cagriBaslangicDokunulanlar.has(alan)) yeniDokunulanlar.add(alan);
    }
    _dofTakipFormaYaz(sonuc.takipTaslagi, yeniDokunulanlar);
    _dofTakipDokunulanAlanlar = yeniDokunulanlar;
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

  // 4R-PKG-3E-FINAL: savunma guard -- buton native `disabled` iken VEYA
  // hiçbir alana dokunulmamışken kayıt YAPILMAZ. İkisi normalde AYNI anda
  // doğrudur (_dofTakipButonDurumGuncelle disabled'ı dirty-set boyutundan
  // türetir), ama guard programatik çağrılara (ör. `window._dofTakipKaydet()`
  // ile disabled buton üzerinden doğrudan tetikleme) karşı da korur.
  const kaydetBtnOn = document.getElementById('dof-takip-kaydet-btn');
  if (kaydetBtnOn && kaydetBtnOn.disabled) {
    _dofDebug.sonKaydetSonucu = 'blocked_disabled_true';
    durum.textContent = 'Değişiklik yok.';
    _dofDebugPanelCiz();
    return;
  }
  if (_dofTakipDokunulanAlanlar.size === 0) {
    _dofDebug.sonKaydetSonucu = 'blocked_dirty_false';
    durum.textContent = 'Değişiklik yok.';
    _dofDebugPanelCiz();
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
  kaydetBtn.setAttribute('aria-disabled', 'true');
  durum.textContent = 'Kaydediliyor...';
  try {
    await dofTakipTaslagiGuncelle(_dofTakipSecliDofUuid, payload);
    _dofDebug.sonKaydetSonucu = 'saved_ok';
    _dofDebug.sonDbYazmaZamani = _dofDebugZaman();
    await _dofListesiYukle();   // liste + okunur özet + bu form (dirty sıfırlanmış) tazelenir
    document.getElementById('dof-takip-durum').textContent = 'Takip bilgileri kaydedildi';
    // 4R-PKG-3J: `_dofListesiYukle()` -> `_dofTakipFormYukle` zaten dirty'yi
    // sıfırlayıp durum metnini 'bos' yaptı (ara adım) -- bu SON yazma
    // 'kaydedildi' ile onu bilerek EZER (en güncel/doğru mesaj budur).
    _dofDurumMetniGuncelle('kaydedildi');
  } catch (e) {
    const kod = e && e.kod;
    _dofDebug.sonKaydetSonucu = 'save_error:' + (kod || (e && e.name) || 'bilinmiyor');
    let mesaj = (kod && _DOF_TAKIP_HATA_METINLERI[kod]) || (e && e.message) || 'Bilinmeyen hata';
    // 4R-PKG-3I: gerçek sahada EN SIK karşılaşılan reddedilme nedeni, O/F/S
    // üçlüsünden yalnız birini/ikisini doldurmaktır (servis kuralı: ya üçü
    // de dolu ya da üçü de boş -- Desktop `_artik_risk_dogrula` ile aynı).
    // Kural BURADA TEKRARLANMAZ (tek kaynak hâlâ servis); yalnız servis
    // zaten reddettiyse kullanıcıya sebep AÇIKÇA söylenir -- öncesinde
    // "Takip alanlarında geçersiz değer var." denip bırakılıyordu ve saha
    // kullanıcısı bunu "Kaydet güvenilmez" olarak deneyimliyordu.
    if (kod === 'GECERSIZ_TAKIP_DEGERI' || kod === 'GECERSIZ_DEGISIKLIK') {
      const ofsDegerleri = _DOF_TAKIP_OFS_ALANLARI_UI.map((a) => _dofTakipFormDegerOku(a));
      const doluSayisi = ofsDegerleri.filter((v) => v !== null).length;
      if (doluSayisi > 0 && doluSayisi < 3) {
        mesaj = 'Yeni O, Yeni F ve Yeni S birlikte doldurulmalı (ya üçü de dolu ya üçü de boş).';
      }
    }
    durum.textContent = mesaj;
    kaydetBtn.disabled = false;
    kaydetBtn.setAttribute('aria-disabled', 'false');
    _dofDurumMetniGuncelle('hata');
  }
  _dofDebugPanelCiz();
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
// "Hazırlık Oluştur" ve "ZIP İndir" AYNI alttaki kaynağı (hazırlık kaydı)
// yazdığı için bu bayrağı PAYLAŞIR (bkz. tests/v-dof-replay-actions-ui.spec.js
// Test K -- hazırlık sürerken ZIP butonu da kilitli olmalı, bu KASITLI).
// "Paylaşmayı Dene" KENDİ ayrı bayrağını kullanır (`_dofReplayPaylasIslemDevamEdiyor`,
// aşağıda) -- yalnız önceden üretilmiş cache'i okur, bu ikisiyle DB
// yazması paylaşmaz, bu yüzden buton loading/disabled durumu da ayrı
// kalmalı (4R-PKG-3K kök neden: "ZIP İndir"e basınca "Paylaşmayı Dene"
// butonunun görsel olarak da tetikleniyor GİBİ görünmesi -- aslında
// `navigator.share` hiç çağrılmıyordu, yalnız iki butonun disabled
// durumu yanlışlıkla BİRBİRİNE bağlıydı).
let _dofReplayIslemDevamEdiyor = false;
let _dofReplayPaylasIslemDevamEdiyor = false;
// 4R-PKG-3H: `_dofReplayBolumYukle` içinde çözülen, o an açık DÖF'ün ait
// olduğu paketUuid -- `_dofReplayPaylasTikla`'nın tıklama ANINDA DB'ye
// gitmeden hangi cache girdisinin geçerli olduğunu bilmesi için.
let _dofReplayAktifPaketUuid = null;

// ─── 4R-PKG-3H: PAYLAŞIM İÇİN ÖN-ÜRETİLMİŞ ZIP CACHE'İ ───────────
// Kök neden (bkz. BilDesk Saha referans analizi): "Paylaşmayı Dene" AYNI
// ağır zinciri (hazırlık+SHA-256 doğrulama+medya DB okumaları+zip yazımı)
// tıklama ANINDA `await` ediyordu -- büyük/çok-DÖF'lü paketlerde bu süre
// Android Chrome'un `navigator.share()` için gerektirdiği transient user
// activation penceresini aşabiliyor, `share()` gerçek bir hata olarak
// reddediyordu ("Paylaşım başarısız oldu"). Çözüm: aynı üretim işini
// kullanıcı DÖF ekranını AÇARKEN (tıklamadan ÖNCE) arka planda yap ve
// cache'le -- tıklama anında yalnız `new File(...)` + `navigator.share(...)`
// kalsın (senkron/hafif).
//
// 4R-PKG-3K: "ZIP İndir" AYRI bir aksiyon olarak kalmakla birlikte, artık
// bu cache'i (imza GÜNCELse) OKUYABİLİR (bkz. `_dofReplayZipIcinHazirVeyaTazeUret`).
// Kök neden aynı sınıftan: tıklama ile gerçek dosya indirmesi arasında
// `await` edilen ağır üretim zinciri uzadıkça bazı Android/Chrome
// sürümlerinde indirme güvenilirliği düşüyordu (saha bulgusu: "3-5 kez
// tıklandı, ZIP güvenilir gelmedi"). Cache eşleşmiyorsa/hazır değilse ZIP
// İndir MEVCUT davranışıyla (taze üretim) aynen devam eder -- bu yalnız
// bir HIZ optimizasyonudur, çıktı baytları/JSON alanları/dosya adı
// DEĞİŞMEZ (aynı `_dofReplayZipHazirlaVeUret` yolundan gelir).
const _DOF_PAYLASIM_ON_HAZIRLIK_GECIKME_MS = 400;
let _dofPaylasimZipCache = {
  paketUuid: null,
  imza: null,
  zipBlob: null,
  dosyaAdi: null,
  hazir: false,
  hazirlaniyor: false,
  hata: null,
};

function _dofPaylasimCacheSifirla() {
  _dofPaylasimZipCache = {
    paketUuid: null, imza: null, zipBlob: null, dosyaAdi: null,
    hazir: false, hazirlaniyor: false, hata: null,
  };
}
if (typeof window !== 'undefined') {
  window._dofPaylasimZipCacheOku = () => ({ ..._dofPaylasimZipCache });
}

/** Bir paketin GEÇERLİ (henüz kaydedilmemiş DEĞİL) içeriğinden UCUZ bir
 * imza üretir -- SHA-256 YENİDEN hesaplamaz (bu zaten ağır iş, prebuild'in
 * kendisi `dofReplayHazirlikHazirla` ile ayrıca yapıyor); yalnız bellekte
 * zaten duran (`_dofListeKayitlari`/`_dofDurumHaritasi`) state'i JSON'a
 * çevirir -- "cache hâlâ geçerli mi" sorusunu DB/hash'e gitmeden hızlıca
 * yanıtlamak için. Takip taslağı/reviewStatus/foto-ses sayısı DEĞİŞİRSE
 * imza değişir -- mevcut `REPLAY_HAZIRLIK_ESKI` parmak izi kontrolü
 * (asıl ZIP üretiminde, DEĞİŞTİRİLMEDEN) hâlâ SON güvence olarak durur. */
function _dofPaylasimImzaHesapla(dofUuidListesi) {
  const parcalar = [...dofUuidListesi].sort().map((u) => {
    const k = _dofListeKayitlari.find((x) => x.id === u);
    const d = _dofDurumHaritasi.get(u);
    return {
      u,
      taslak: (k && k.takipTaslagi) || null,
      review: (k && k.reviewStatus) || null,
      foto: (d && d.fotoSayisi) || 0,
      ses: (d && d.sesSayisi) || 0,
    };
  });
  return JSON.stringify(parcalar);
}

/** Paylaşım ZIP'ini ARKA PLANDA üretip cache'ler -- `_dofReplayBolumYukle`
 * (DÖF ekranı açılışı/route giriş/medya-sonrası tazeleme) tarafından
 * `await` EDİLMEDEN çağrılır, ekranı yavaşlatmaz. Kaydedilmemiş takip
 * değişikliği varsa (dirty) ÇALIŞMAZ -- öyle bir taslaktan üretilen ZIP
 * güncel taslağı YANSITMAZ, bu yüzden hiç üretilmez (cache boşaltılır,
 * paylaş tıklaması kullanıcıya "önce kaydedin" der). Eşzamanlı/yarışan
 * çağrılar `paketUuid`+`imza` karşılaştırmasıyla (tıpkı `_dofTakipFormYukle`
 * DÖF-değişimi guard'ı gibi) birbirini EZMEZ -- await sürerken daha yeni
 * bir çağrı başladıysa veya taze bir dirty durumu oluştuysa, bu (artık
 * eski) sonuç cache'e yazılmaz.
 *
 * `gecikmeMs`: ekran açılışı/Kaydet sonrası otomatik tetiklemede küçük bir
 * gecikme uygulanır -- kullanıcı ekrandan HEMEN ayrılırsa (ör. başka bir
 * DÖF'e geçerse) gereksiz üretimi engeller, gerçek kullanıcı için tamamen
 * algılanamaz (paylaş tuşuna basmak saniyeler alır). "Paylaşmayı Dene"
 * tıklamasında cache hazır DEĞİLSE yeniden tetiklenen çağrı bu gecikmeyi
 * KULLANMAZ (kullanıcı zaten bekliyor, hemen başlamalı). */
async function _dofPaylasimZipOnHazirla(dofUuid, { gecikmeMs = 0 } = {}) {
  if (!dofUuid) return;
  if (gecikmeMs > 0) await new Promise((r) => setTimeout(r, gecikmeMs));
  if (_dofReplaySecliDofUuid !== dofUuid) return;   // gecikme sürerken kullanıcı başka DÖF'e geçti
  const kayit = await dbGetir('dofler', dofUuid);
  if (!kayit) return;
  const paketUuid = kayit.paketUuid;

  if (_dofTakipSecliDofUuid && _dofTakipDokunulanAlanlar.size > 0) {
    if (_dofPaylasimZipCache.paketUuid === paketUuid) _dofPaylasimCacheSifirla();
    return;
  }

  const dofUuidListesi = await dofPaketiDegismisDofUuidleri(paketUuid);
  if (dofUuidListesi.length === 0) {
    if (_dofPaylasimZipCache.paketUuid === paketUuid) _dofPaylasimCacheSifirla();
    return;
  }

  const imza = _dofPaylasimImzaHesapla(dofUuidListesi);
  if (_dofPaylasimZipCache.paketUuid === paketUuid && _dofPaylasimZipCache.imza === imza
      && (_dofPaylasimZipCache.hazir || _dofPaylasimZipCache.hazirlaniyor)) {
    return;   // zaten hazır veya hazırlanıyor -- tekrar üretme
  }

  _dofPaylasimZipCache = { paketUuid, imza, zipBlob: null, dosyaAdi: null, hazir: false, hazirlaniyor: true, hata: null };
  try {
    const sonuc = await _dofReplayZipHazirlaVeUret();
    // Üretim SÜRERKEN kullanıcı başka bir pakete geçmiş VEYA taze bir dirty
    // değişikliği/medya güncellemesi başlatmış olabilir -- öyleyse bu
    // (artık eski) sonuç cache'e YAZILMAZ.
    if (_dofPaylasimZipCache.paketUuid !== paketUuid || _dofPaylasimZipCache.imza !== imza) return;
    if (!sonuc) {
      _dofPaylasimCacheSifirla();
      return;
    }
    _dofPaylasimZipCache = { paketUuid, imza, zipBlob: sonuc.zipBlob, dosyaAdi: sonuc.dosyaAdi, hazir: true, hazirlaniyor: false, hata: null };
  } catch (e) {
    if (_dofPaylasimZipCache.paketUuid === paketUuid && _dofPaylasimZipCache.imza === imza) {
      _dofPaylasimZipCache = { paketUuid, imza, zipBlob: null, dosyaAdi: null, hazir: false, hazirlaniyor: false, hata: e };
    }
  }
}

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
/** Sabit/fixed alt bar görünürken içerik alanına (`#screen-setup`) yeterli
 * bottom padding verir -- bar hiçbir zaman form alanlarını/"Tüm Veriyi
 * Sıfırla" butonunu ÖRTMEZ. Bar gizliyken padding de kaldırılır (gereksiz
 * boşluk kalmaz). */
function _dofReplayBarPaddingAyarla(gorunur) {
  const ekran = document.getElementById('screen-setup');
  if (ekran) ekran.classList.toggle('dof-replay-bar-aktif', gorunur);
}

async function _dofReplayBolumYukle(dofUuid) {
  const kart = document.getElementById('dof-replay-kart');
  if (!kart) return;
  _dofReplaySecliDofUuid = dofUuid;
  if (!dofUuid) {
    kart.style.display = 'none';
    _dofReplayBarPaddingAyarla(false);
    _dofReplayAktifPaketUuid = null;
    return;
  }
  const durum = document.getElementById('dof-replay-durum');
  try {
    // 4R-PKG-3D: teknik "Hazırlık hazır/yok" ilk-yükleme metni kaldırıldı --
    // `durum` yalnız aksiyon SONUCU mesajları için kullanılır (bkz.
    // _dofReplayHazirlikTikla/_dofReplayZipIndirTikla/_dofReplayPaylasTikla,
    // DEĞİŞMEDİ). Kanonik durumu servis hâlâ döndürüyor (`dofReplayHazirlikGetir`)
    // -- yalnız kullanıcıya HAM teknik metin olarak gösterilmiyor.
    await dofReplayHazirlikGetir(dofUuid);
    kart.style.display = 'block';
    _dofReplayBarPaddingAyarla(true);
    durum.textContent = '';

    // 4R-PKG-3H: `_dofReplayPaylasTikla`'nın tıklama anında DB'ye gitmeden
    // hangi paketi paylaşacağını bilebilmesi için burada bir kez çözülür
    // (paket özeti zaten aynı sorguyu yapıyordu, tekrar yazılmadı).
    const kayit = await dbGetir('dofler', dofUuid);
    const paketUuid = kayit && kayit.paketUuid;
    _dofReplayAktifPaketUuid = paketUuid || null;

    // PWA 4R-PKG-3D: sticky ZIP alanının üst kısmında PAKET GENELİ, kompakt
    // özet -- "1 DÖF · 2 Foto · 1 Ses" biçiminde. "DÖF" sayısı =
    // `dofPaketiDegismisDofUuidleri` ile ZIP'e GERÇEKTEN dahil edilecek
    // sayı (aynı ölçüt, tekrar yazılmadı); yalnız bilgi amaçlı, hiçbir
    // butonu etkilemez.
    const paketOzetEl = document.getElementById('dof-replay-paket-ozet');
    if (paketOzetEl) {
      if (paketUuid) {
        const degisenler = await dofPaketiDegismisDofUuidleri(paketUuid);
        let paketFoto = 0;
        let paketSes = 0;
        for (const u of degisenler) {
          const m = await dofKanitMedyalariGetir(u);
          const sayac = _dofMedyaSayaclariHesapla(m);
          paketFoto += sayac.fotoSayisi;
          paketSes += sayac.sesSayisi;
        }
        // 4R-PKG-3J: "Paket:" öneki eklendi -- bu sayaç DÖF içindeki
        // "N fotoğraf eklendi." kanıt özetiyle yan yana görününce (aynı
        // ekranda, biri paket geneli biri tek DÖF) etiketsiz hâli
        // çelişkili algılanıyordu. Sayılar zaten doğruydu, yalnız etiket
        // eksikti.
        paketOzetEl.textContent = `Paket: ${degisenler.length} DÖF · ${paketFoto} Foto · ${paketSes} Ses`;
      } else {
        paketOzetEl.textContent = '';
      }
    }

    // 4R-PKG-3H: paylaşım ZIP'ini ARKA PLANDA (kullanıcı "Paylaşmayı Dene"ye
    // basmadan ÖNCE) üretip cache'ler -- kasıtlı olarak `await` EDİLMEZ,
    // ekranın açılışını yavaşlatmaz (bkz. `_dofPaylasimZipOnHazirla`). Küçük
    // bir gecikmeyle (`_DOF_PAYLASIM_ON_HAZIRLIK_GECIKME_MS`) başlar --
    // kullanıcı ekrandan hemen ayrılırsa gereksiz üretimi engeller.
    _dofPaylasimZipOnHazirla(dofUuid, { gecikmeMs: _DOF_PAYLASIM_ON_HAZIRLIK_GECIKME_MS });
  } catch (e) {
    kart.style.display = 'none';   // legacy/bulunamayan -- normal akışta oluşmaz, savunma amaçlı
    _dofReplayBarPaddingAyarla(false);
    _dofReplayAktifPaketUuid = null;
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

/** "ZIP İndir" -- (4R-PKG-2) artık yalnız seçili DÖF'ü DEĞİL, aynı import
 * paketindeki (`paketUuid`) TÜM "değişmiş" kanonik DÖF'leri toplar
 * (`dofPaketiDegismisDofUuidleri`), her biri için hazırlığı otomatik
 * güncel tutar (`dofReplayHazirlikHazirla` -- idempotent, ayrı "Hazırlık
 * Oluştur" adımı zorunlu değildir), sonra TEK bir `dofReplayZipOlustur`
 * çağrısıyla hepsini tek ZIP'e yazar. Seçili DÖF'te değişiklik yoksa ama
 * pakette başka değişmiş DÖF varsa onlar yine dahil edilir; hiç değişmiş
 * DÖF yoksa (paket genelinde) kullanıcıya açık mesaj gösterilir, ZIP
 * üretilmez. `dofReplayZipOlustur`'un kendi iç kuralları (hazırlık eski/
 * yok, karışık paket, yasak alan üretmeme) DEĞİŞMEDEN korunur. */
/** ZIP İndir + Paylaş/Gönder'in ORTAK üretim adımı -- aynı import
 * paketindeki tüm değişmiş DÖF'leri toplar, hazırlıklarını günceller,
 * `dofReplayZipOlustur`'u (DEĞİŞTİRİLMEDEN) çağırır. Hiç değişmiş DÖF
 * yoksa `null` döner (hata fırlatmaz) -- çağıran uygun mesajı gösterir. */
async function _dofReplayZipHazirlaVeUret() {
  const secliKayit = await dbGetir('dofler', _dofReplaySecliDofUuid);
  const dofUuidListesi = await dofPaketiDegismisDofUuidleri(secliKayit.paketUuid);
  if (dofUuidListesi.length === 0) return null;
  for (const dofUuid of dofUuidListesi) {
    await dofReplayHazirlikHazirla(dofUuid);   // otomatik hazırlık -- idempotent, ayrı adım zorunlu değil
  }
  return dofReplayZipOlustur(dofUuidListesi);
}

/** 4R-PKG-3K: "ZIP İndir" için -- paylaşım cache'i (`_dofPaylasimZipCache`)
 * GEÇERLİ imzayla eşleşiyorsa (yani arka planda üretileni bu an itibariyle
 * GÜNCEL) o hazır Blob'u tıklama anında YENİDEN üretmeden döner -- tıklama
 * ile gerçek dosya indirmesi arasındaki süreyi kısaltmak için (Android'de
 * bazı sürümlerde görülen indirme güvenilirlik sorununu azaltır, bkz. dosya
 * başındaki 4R-PKG-3H yorum bloğu). İmza eşleşmiyorsa/cache hazır değilse
 * -- ör. Kaydet'ten hemen sonra arka plan üretimi henüz YETİŞEMEDİYSE (bkz.
 * tests/v-dof-replay-actions-ui.spec.js Test H) -- sessizce MEVCUT davranışa
 * (`_dofReplayZipHazirlaVeUret`, taze üretim) düşer; asla eski/yanlış bir
 * ZIP döndürmez. Çıktı biçimi (zipBlob/dosyaAdi) ikisinde de AYNIDIR. */
async function _dofReplayZipIcinHazirVeyaTazeUret() {
  const secliKayit = await dbGetir('dofler', _dofReplaySecliDofUuid);
  const paketUuid = secliKayit && secliKayit.paketUuid;
  if (paketUuid) {
    const dofUuidListesi = await dofPaketiDegismisDofUuidleri(paketUuid);
    if (dofUuidListesi.length > 0) {
      const imza = _dofPaylasimImzaHesapla(dofUuidListesi);
      const cache = _dofPaylasimZipCache;
      if (cache.paketUuid === paketUuid && cache.imza === imza && cache.hazir && cache.zipBlob) {
        return { zipBlob: cache.zipBlob, dosyaAdi: cache.dosyaAdi };
      }
    }
  }
  return _dofReplayZipHazirlaVeUret();
}

/** "ZIP İndir" -- Paylaşmayı Dene'den TAMAMEN BAĞIMSIZ bir aksiyondur:
 * yalnız ZIP Blob'u üretir/indirir, `navigator.share` HİÇ ÇAĞIRMAZ ve
 * "Paylaşmayı Dene" butonuna DOKUNMAZ (4R-PKG-3K -- önceki sürümde bu
 * buton burada `disabled=true/false` ile GEREKSİZ YERE görsel olarak
 * "tetikleniyor gibi" görünüyordu, saha bulgusu). Yalnız KENDİ ile "Hazırlık
 * Oluştur"un paylaştığı ortak kaynağı (hazırlık kaydı) temsil eden
 * `hazirlikBtn`/`zipBtn` kilitlenir -- bu ikisi ARASINDAKİ kilitlenme
 * KASITLI ve DEĞİŞMEDİ (bkz. Test K). */
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
    const sonuc = await _dofReplayZipIcinHazirVeyaTazeUret();
    if (!sonuc) {
      durum.textContent = 'Önce en az bir DÖF için takip bilgisi veya kanıt medyası ekleyin.';
      return;
    }
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

/** "Paylaşmayı Dene" (4R-PKG-3H) -- artık kendi ZIP'ini tıklama ANINDA
 * ÜRETMEZ; `_dofReplayBolumYukle` tarafından ARKA PLANDA önceden üretilmiş
 * `_dofPaylasimZipCache`'i kullanır (içerik `_dofReplayZipHazirlaVeUret` ile
 * BİREBİR aynı yoldan geldiği için `dof_donus.json`/`fotolar/`/`sesler/`
 * kökte kalır, hiçbir şey değişmez). Kök neden (BilDesk Saha referans
 * analizi): tıklama anında `await`lenen ağır hazırlık+hash+medya-DB+zip
 * zinciri, Android Chrome'un `navigator.share()` için gerektirdiği
 * transient user activation penceresini aşabiliyordu -- bu sürüm tıklama
 * anında yalnız `new File(...)` + `navigator.share(...)` çağırır.
 *
 * Kaydedilmemiş takip değişikliği varsa (dirty) -- cache TAZE olsa bile
 * PAYLAŞILMAZ, kullanıcıya önce Kaydet'e basması söylenir (stale-ZIP
 * paylaşma riskine karşı SON güvence, cache invalidation'dan bağımsız).
 * Cache henüz hazır değilse (ilk açılış/üretim sürüyor/geçersiz) kullanıcı
 * bilgilendirilir ve arka plan üretimi (yoksa) yeniden tetiklenir. Bu buton
 * HİÇBİR DURUMDA otomatik ZIP indirmesi YAPMAZ (3E-FINAL kararı korunur):
 * destek yok/AbortError/gerçek hata/hazır değil -- HİÇBİRİNDE otomatik
 * `_dofBlobIndir` çağrılmaz, yalnız açık mesaj gösterilir. */
function _dofReplayPaylasTikla() {
  // ── BÖLÜM 1: yalnız SALT-OKUNUR guard'lar ───────────────────────
  // Buradaki erken dönüşler `navigator.share`'e HİÇ ulaşmaz, o yüzden
  // DOM'a yazmaları serbesttir (aktivasyon tüketilecek bir çağrı yok).
  // 4R-PKG-3K: KENDİ bayrağı -- "Hazırlık Oluştur"/"ZIP İndir" ile PAYLAŞMAZ,
  // bu yüzden o ikisi çalışırken bu buton (ve tersi) etkilenmez.
  if (!_dofReplaySecliDofUuid || _dofReplayPaylasIslemDevamEdiyor) return;
  // Yalnız bir sayı okuma -- DOM'a dokunmaz, aktivasyonu etkilemez.
  const tTiklama = Date.now();
  const durum = document.getElementById('dof-replay-durum');

  // Kaydedilmemiş takip değişikliği -- cache taze olsa BİLE paylaşılmaz.
  if (_dofTakipSecliDofUuid === _dofReplaySecliDofUuid && _dofTakipDokunulanAlanlar.size > 0) {
    durum.textContent = 'Önce takip değişikliklerini kaydedin.';
    _dofDebugPanelCiz();
    return;
  }

  const paketUuid = _dofReplayAktifPaketUuid;
  const cache = _dofPaylasimZipCache;
  if (!paketUuid || cache.paketUuid !== paketUuid || !cache.hazir || !cache.zipBlob) {
    durum.textContent = 'Paylaşım hazırlanıyor, lütfen birkaç saniye sonra tekrar deneyin.';
    _dofPaylasimZipOnHazirla(_dofReplaySecliDofUuid);   // henüz başlamadıysa/bittiyse yeniden dene
    _dofDebugPanelCiz();
    return;
  }

  const canShareVar = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';
  const shareVar = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (!canShareVar || !shareVar) {
    _dofDebug.canShareVarMi = canShareVar;
    _dofDebug.shareVarMi = shareVar;
    _dofDebug.canShareZip = null;
    _dofDebug.canShareOctet = null;
    durum.textContent = 'Bu cihaz/tarayıcı ZIP dosyası paylaşımını desteklemiyor'
      + ' (Web Share API yok). ZIP indirmek için ZIP İndir düğmesini kullanın.';
    _dofDebugPanelCiz();
    return;
  }

  // ── BÖLÜM 2: share'e kadar SADECE bellek işlemleri ──────────────
  // DOM'a YAZMA YOK, `await` YOK, render YOK, panel çizimi YOK.
  // Yalnız cache'ten yerel okuma + File kurma + canShare sorgusu.
  const zipBlob = cache.zipBlob;
  const dosyaAdi = cache.dosyaAdi;
  const zipDosya = new File([zipBlob], dosyaAdi, { type: 'application/zip' });
  const zipOlur = navigator.canShare({ files: [zipDosya] });
  let dosya = zipDosya;
  let kullanilanMime = 'application/zip';
  let octetOlur = null;
  if (!zipOlur) {
    // MIME geri düşüşü: AYNI baytlar, AYNI `.zip` dosya adı -- yalnız
    // paylaşım katmanına verilen etiket farklı (ZIP sözleşmesi DEĞİŞMEZ).
    const octetDosya = new File([zipBlob], dosyaAdi, { type: 'application/octet-stream' });
    octetOlur = navigator.canShare({ files: [octetDosya] });
    if (!octetOlur) {
      _dofDebug.canShareVarMi = true; _dofDebug.shareVarMi = true;
      _dofDebug.canShareZip = false; _dofDebug.canShareOctet = false;
      _dofDebug.kullanilanMime = null;
      durum.textContent = 'Bu cihaz/tarayıcı ZIP dosyası paylaşımını desteklemiyor'
        + ' (zip:false octet:false). ZIP indirmek için ZIP İndir düğmesini kullanın.';
      _dofDebugPanelCiz();
      return;
    }
    dosya = octetDosya;
    kullanilanMime = 'application/octet-stream';
  }

  const uaOnce = navigator.userActivation || null;
  const uaOnceAktif = uaOnce ? uaOnce.isActive : null;
  const uaOnceOlmus = uaOnce ? uaOnce.hasBeenActive : null;
  const tShareOncesi = Date.now();

  // ── BÖLÜM 3: SHARE -- handler'ın EN ERKEN senkron noktası ───────
  // Buraya kadar hiçbir DOM düğümü değiştirilmedi; özellikle TIKLANAN
  // BUTON devre dışı bırakılmadı (eski sürümde `paylasBtn.disabled = true`
  // tam burada, share'den ÖNCE çalışıyordu -- gerçek Android cihazda
  // `userActivation.isActive` share anında false'a düşüyor ve çağrı
  // `NotAllowedError: Permission denied` ile reddediliyordu; tıklamadan
  // share'e yalnız 7ms geçmesine rağmen. Aktivasyon SÜREYE değil,
  // tıklanan elemanın dispatch sırasında bozulmamasına bağlı.)
  let sharePromise = null;
  let senkronHata = null;
  try {
    sharePromise = navigator.share({ files: [dosya], title: dosyaAdi });
  } catch (e) {
    senkronHata = e;   // TypeError vb. -- share senkron da fırlatabilir
  }

  // ── BÖLÜM 4: BUNDAN SONRASI serbest (share çağrısı çoktan yapıldı) ──
  const uaSonra = navigator.userActivation || null;
  _dofDebug.canShareVarMi = true;
  _dofDebug.shareVarMi = true;
  _dofDebug.canShareZip = zipOlur;
  _dofDebug.canShareOctet = octetOlur;
  _dofDebug.kullanilanMime = kullanilanMime;
  _dofDebug.tiklamaZamani = _dofDebugZaman();
  _dofDebug.shareCagriGecikmesiMs = tShareOncesi - tTiklama;
  _dofDebug.uaOnceIsActive = uaOnceAktif;
  _dofDebug.uaOnceHasBeenActive = uaOnceOlmus;
  _dofDebug.uaSonraIsActive = uaSonra ? uaSonra.isActive : null;
  _dofDebug.uaSonraHasBeenActive = uaSonra ? uaSonra.hasBeenActive : null;
  _dofDebug.shareHataAdi = null;
  _dofDebug.shareHataMesaji = null;

  // 4R-PKG-3K: yalnız KENDİ butonu -- "Hazırlık Oluştur"/"ZIP İndir"
  // butonlarına burada ARTIK dokunulmuyor (önceki sürümde share açılırken
  // bu ikisi de görsel olarak kilitleniyordu, saha bulgusundaki "diğer
  // buton da tetikleniyor gibi görünüyor" algısının kaynaklarından biriydi).
  const paylasBtn = document.getElementById('dof-replay-paylas-btn');
  const butonlariCoz = () => {
    _dofReplayPaylasIslemDevamEdiyor = false;
    if (paylasBtn) paylasBtn.disabled = false;
    _dofDebugPanelCiz();
  };
  const hataYaz = (hata) => {
    _dofDebug.shareHataAdi = (hata && hata.name) || 'bilinmiyor';
    _dofDebug.shareHataMesaji = (hata && hata.message) || '';
    if (hata && hata.name === 'AbortError') {
      durum.textContent = 'Paylaşım iptal edildi.';
      return;
    }
    // Gerçek paylaşım hatası (iptal DEĞİL) -- otomatik indirme YOK, yalnız mesaj.
    durum.textContent = `Paylaşım başarısız oldu (${_dofDebug.shareHataAdi}). ZIP indirmek için ZIP İndir düğmesini kullanın.`;
  };

  if (senkronHata) {
    hataYaz(senkronHata);
    butonlariCoz();
    return;
  }

  _dofReplayPaylasIslemDevamEdiyor = true;
  if (paylasBtn) paylasBtn.disabled = true;
  durum.textContent = 'Paylaşım penceresi açılıyor...';

  Promise.resolve(sharePromise)
    .then(() => { durum.textContent = 'Paylaşıma gönderildi.'; })
    .catch(hataYaz)
    .then(butonlariCoz);
}

if (typeof window !== 'undefined') {
  window._dofReplayHazirlikTikla = _dofReplayHazirlikTikla;
  window._dofReplayZipIndirTikla = _dofReplayZipIndirTikla;
  window._dofReplayPaylasTikla = _dofReplayPaylasTikla;
}

// ─── DÖF KANIT MEDYALARI UI (PWA Commit 4P) ─────────────────────
// Kamera/galeri/ses akışları normal sahanın `aktifFotolarTaslak`/
// `aktifSeslerTaslak`/`sesRecorder`/`sesChunks` state'ini HİÇ paylaşmaz --
// tamamen ayrı, `dofKanit`/`dofSes` önekli global state. Kamera YAKALAMA
// ARAYÜZÜ (video/canvas/#camera-ui) fiziksel olarak TEKTİR ve mevcut
// `openOCR`/`capturePhoto` ile paylaşılır (yeni bir kamera overlay'i
// icat edilmedi) -- yalnız `kameraModu==='dof-kanit'` dalı `capturePhoto()`
// içine eklendi, sonucu `aktifFotolarTaslak`'a DEĞİL doğrudan
// `dofKanitMedyasiEkle`'ye yönlendirir.

let _dofKanitAktifDofUuid = null;
let _dofKanitAktifObjectUrller = [];   // önizleme için üretilen ObjectURL'ler -- her render öncesi/kart kapanırken revoke edilir
let dofSesRecorder = null;
let dofSesChunks = [];
let dofSesKayitAktifDofUuid = null;   // kayıt hangi DÖF için başladı -- DÖF değişip kayıt zorla durdurulursa yanlış DÖF'e YAZILMAZ

function _dofKanitObjectUrlleriTemizle() {
  for (const url of _dofKanitAktifObjectUrller) {
    try { URL.revokeObjectURL(url); } catch (e) { /* zaten geçersizse yok say */ }
  }
  _dofKanitAktifObjectUrller = [];
}

/** 4R-PKG-3E-FINAL — TEK ortak sayaç hesaplama: ZIP alt barı, liste kartı
 * rozetleri, kanıt medya özeti ve ZIP üretim öncesi özet HEPSİ bu
 * fonksiyondan beslenir (3E-0 teşhis raporunun D.5 maddesinde işaretlenen
 * "aynı filtre 3 ayrı yerde bağımsız tekrar yazılmış" riski burada
 * kapatıldı). Girdi her zaman `dofKanitMedyalariGetir`/`dbIndexTumu(
 * 'dofKanitlari', 'dofUuid', ...)` sonucu -- ham `medyalar` dizisi. */
function _dofMedyaSayaclariHesapla(medyalar) {
  const fotoSayisi = medyalar.filter((m) => m.mediaType === 'photo').length;
  const sesSayisi = medyalar.filter((m) => m.mediaType === 'audio').length;
  return { fotoSayisi, sesSayisi };
}

/** Kanıt medyaları özet metnini TEK bir yerden, aynı `medyalar` dizisinden
 * hesaplar -- ZIP alt barındaki foto/ses sayaçlarıyla (bkz.
 * `_dofReplayBolumYukle`, `_dofMedyaSayaclariHesapla`) aynı ölçütü
 * kullanır. Transient aksiyon mesajından (`#dof-kanit-medya-durum`,
 * "Fotoğraf eklendi."/"Ses notu eklendi.") TAMAMEN AYRI -- o mesajlar
 * DEĞİŞMEDİ. */
function _dofKanitMedyaOzetMetni(medyalar) {
  const { fotoSayisi, sesSayisi } = _dofMedyaSayaclariHesapla(medyalar);
  if (fotoSayisi === 0 && sesSayisi === 0) return 'Henüz kanıt eklenmedi.';
  if (fotoSayisi === 0) return `${sesSayisi} ses notu eklendi.`;
  if (sesSayisi === 0) return `${fotoSayisi} fotoğraf eklendi.`;
  return `${fotoSayisi} fotoğraf · ${sesSayisi} ses notu`;
}

function _dofKanitMedyaListesiRenderEt(medyalar) {
  _dofKanitObjectUrlleriTemizle();   // önceki render'ın URL'lerini serbest bırak
  const ozetEl = document.getElementById('dof-kanit-medya-ozet');
  if (ozetEl) ozetEl.textContent = _dofKanitMedyaOzetMetni(medyalar);
  const liste = document.getElementById('dof-kanit-medya-liste');
  if (!liste) return;
  if (medyalar.length === 0) {
    liste.innerHTML = '<p style="color:#999; font-size:0.85rem;">Henüz kanıt eklenmedi.</p>';
    return;
  }
  liste.innerHTML = medyalar.map((m) => {
    const url = URL.createObjectURL(m.blob);
    _dofKanitAktifObjectUrller.push(url);
    const onizleme = m.mediaType === 'photo'
      ? `<img src="${url}" style="width:64px; height:64px; object-fit:cover; border-radius:6px;">`
      : `<audio src="${url}" controls style="height:32px; max-width:180px;"></audio>`;
    return `
      <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #eee;">
        ${onizleme}
        <span style="font-size:0.8rem; color:#666; flex:1;">${_esc(m.source)} · ${_esc(new Date(m.createdAt).toLocaleString('tr-TR'))}</span>
        <button class="btn btn-outline" style="padding:2px 10px; font-size:0.8rem;"
          onclick="_dofKanitMedyaSilTikla('${_escAttr(m.localMediaUuid)}')">Sil</button>
      </div>`;
  }).join('');
}

/** DÖF seçim zincirine bağlanır (`_dofListesiYukle`/`_dofDetaySec`). Başka
 * bir DÖF için aktif ses kaydı varsa güvenle durdurur (kayıt ATILIR,
 * yanlış DÖF'e yazılmaz -- bkz. `toggleDofSesKaydi.onstop`). Legacy/WIP
 * DÖF için kart açılmaz (diğer DÖF kartlarıyla aynı desen). */
async function _dofKanitMedyaYukle(dofUuid) {
  if (dofSesRecorder && dofSesRecorder.state === 'recording' && dofSesKayitAktifDofUuid !== dofUuid) {
    dofSesRecorder.stop();   // onstop, kayıt anındaki DÖF ile YENİ _dofKanitAktifDofUuid'i karşılaştırıp atacak
  }
  _dofKanitAktifDofUuid = dofUuid;
  const kart = document.getElementById('dof-kanit-medya-kart');
  if (!kart) return;
  if (!dofUuid) {
    kart.style.display = 'none';
    _dofKanitObjectUrlleriTemizle();
    return;
  }
  let medyalar;
  try {
    medyalar = await dofKanitMedyalariGetir(dofUuid);
  } catch (e) {
    kart.style.display = 'none';   // legacy/WIP -- capture engellenir
    _dofKanitObjectUrlleriTemizle();
    return;
  }
  kart.style.display = 'block';
  _dofKanitMedyaListesiRenderEt(medyalar);
}

/** 4R-PKG-3E-FINAL: medya ekleme/silme sonrası TEK çağrı noktası --
 * kanıt liste/özet, alt fixed ZIP bar (paket özeti dahil) ve liste kartı
 * rozetini AYNI ANDA tazeler (canlı Android şikayeti: "alt bar/liste/kanıt
 * sayaçları bazen eski veya sıfır kalıyor"). Takip formuna/reviewStatus'a
 * DOKUNMAZ -- `_dofListesiYukle()`'nin tam yeniden yüklemesini kasıtlı
 * KULLANMIYORUZ, çünkü o `_dofTakipFormYukle` üzerinden kullanıcının
 * KAYDEDİLMEMİŞ takip taslağı düzenlemesini/dirty-state'ini sıfırlardı. */
async function _dofMedyaSonrasiYenile(dofUuid) {
  await _dofKanitMedyaYukle(dofUuid);
  await _dofReplayBolumYukle(dofUuid);
  const kayit = _dofListeKayitlari.find((k) => k.id === dofUuid);
  if (!kayit) return;   // legacy/silinmiş -- liste rozeti güncellenecek bir şey yok
  const medyalar = await dbIndexTumu('dofKanitlari', 'dofUuid', dofUuid);
  const { fotoSayisi, sesSayisi } = _dofMedyaSayaclariHesapla(medyalar);
  const degisti = await _dofKayitDegismisMi(kayit);
  _dofDurumHaritasi.set(dofUuid, { degisti, fotoSayisi, sesSayisi });
  const aktifGrup = _dofAktifGrupGetir(_dofGrupListesi);
  const listeEl = document.getElementById('dof-liste');
  if (listeEl) listeEl.innerHTML = aktifGrup.kayitlar.map((k) => _dofListeKartHtml(k)).join('');
}

async function _dofKanitFotoKaydet(sonuc, source) {
  const dofUuid = _dofKanitAktifDofUuid;
  const durum = document.getElementById('dof-kanit-medya-durum');
  if (!dofUuid) return;
  try {
    await dofKanitMedyasiEkle(dofUuid, {
      mediaType: 'photo', source,
      blob: sonuc.blob, mimeType: sonuc.blob ? sonuc.blob.type : 'image/jpeg',
      size: sonuc.blob ? sonuc.blob.size : sonuc.sikistirilmisBoyut,
      width: sonuc.genislik || null, height: sonuc.yukseklik || null,
    });
    if (durum) durum.textContent = 'Fotoğraf eklendi.';
    // 4R-PKG-3J: IndexedDB yazması BAŞARIYLA bitti -- tek durum metnine
    // (Kaydet satırının altına) da yansıt. Kamera/galeri ayrımı `source`.
    _dofDurumMetniGuncelle(source === 'camera' ? 'foto' : 'gorsel');
    await _dofMedyaSonrasiYenile(dofUuid);
  } catch (e) {
    if (durum) durum.textContent = (e && e.message) || 'Fotoğraf eklenemedi.';
  }
}

/** Galeri/dosya seçici -- normal sahanın `_galeriDosyaSecildi`/
 * `fotoAlVeSikistir` HATTINA hiç girmez, yalnız aynı SAF yardımcıları
 * (`_resmiYukle`/`compressImage`) reuse eder. */
async function _dofKanitGaleriDosyaSecildi(input) {
  const dosya = input.files && input.files[0];
  const durum = document.getElementById('dof-kanit-medya-durum');
  const dofUuid = _dofKanitAktifDofUuid;
  if (!dosya) return;
  input.value = '';
  if (!dofUuid) return;
  if (!dosya.type || !dosya.type.startsWith('image/')) {
    if (durum) durum.textContent = 'Yalnız görsel dosyası yüklenebilir.';
    return;
  }
  try {
    await _resmiYukle(dosya);
    const sonuc = await compressImage(dosya);
    await _dofKanitFotoKaydet(sonuc, 'gallery');
  } catch (e) {
    if (durum) durum.textContent = 'Görsel okunamadı.';
  }
}
if (typeof window !== 'undefined') window._dofKanitGaleriDosyaSecildi = _dofKanitGaleriDosyaSecildi;

function _dofKanitSesButonSifirla() {
  const btn = document.getElementById('dof-kanit-ses-btn');
  if (!btn) return;
  btn.classList.remove('aktif');
  const etiket = document.getElementById('dof-kanit-ses-etiket');
  if (etiket) etiket.textContent = 'Ses Notu';
  const ikon = btn.querySelector('i');
  if (ikon) { ikon.classList.remove('fa-stop'); ikon.classList.add('fa-microphone'); }
}

/** Normal sahanın `sesRecorder`/`sesChunks`/`aktifSeslerTaslak` state'ini
 * HİÇ kullanmaz -- ayrı `dofSesRecorder`/`dofSesChunks`. DÖF değişirken
 * (`_dofKanitMedyaYukle`) zorla durdurulursa, `onstop` anındaki
 * `_dofKanitAktifDofUuid` artık kayıt başlangıcındaki DÖF'le eşleşmez --
 * bu durumda kayıt SESSİZCE ATILIR, yanlış DÖF'e yazılmaz. */
async function toggleDofSesKaydi() {
  const btn = document.getElementById('dof-kanit-ses-btn');
  if (dofSesRecorder && dofSesRecorder.state === 'recording') {
    dofSesRecorder.stop();
    return;
  }
  const dofUuid = _dofKanitAktifDofUuid;
  if (!dofUuid) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    dofSesChunks = [];
    dofSesKayitAktifDofUuid = dofUuid;
    dofSesRecorder = new MediaRecorder(stream);
    const baslangic = Date.now();
    dofSesRecorder.ondataavailable = (e) => { if (e.data.size > 0) dofSesChunks.push(e.data); };
    dofSesRecorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const kaydedilecekDofUuid = dofSesKayitAktifDofUuid;
      const sureMs = Date.now() - baslangic;
      const blob = new Blob(dofSesChunks, { type: 'audio/webm' });
      dofSesRecorder = null;
      dofSesKayitAktifDofUuid = null;
      _dofKanitSesButonSifirla();
      if (!kaydedilecekDofUuid || kaydedilecekDofUuid !== _dofKanitAktifDofUuid) {
        return;   // DÖF değişti -- kayıt bilerek ATILDI, yanlış DÖF'e yazılmadı
      }
      const durum = document.getElementById('dof-kanit-medya-durum');
      try {
        await dofKanitMedyasiEkle(kaydedilecekDofUuid, {
          mediaType: 'audio', source: 'audio',
          blob, mimeType: 'audio/webm', size: blob.size, durationMs: sureMs,
        });
        if (durum) durum.textContent = 'Ses notu eklendi.';
        _dofDurumMetniGuncelle('ses');
        await _dofMedyaSonrasiYenile(kaydedilecekDofUuid);
      } catch (e) {
        if (durum) durum.textContent = (e && e.message) || 'Ses notu eklenemedi.';
      }
    };
    dofSesRecorder.start();
    if (btn) {
      btn.classList.add('aktif');
      const etiket = document.getElementById('dof-kanit-ses-etiket');
      if (etiket) etiket.textContent = 'Durdur';
      const ikon = btn.querySelector('i');
      if (ikon) { ikon.classList.remove('fa-microphone'); ikon.classList.add('fa-stop'); }
    }
  } catch (e) {
    alert('Mikrofon erişimi reddedildi: ' + e.message);
  }
}
if (typeof window !== 'undefined') window.toggleDofSesKaydi = toggleDofSesKaydi;

/** Yalnız listedeki `localMediaUuid`'e güvenmez -- aktif DÖF bağlamını
 * (`_dofKanitAktifDofUuid`) da servise gönderir. DÖF arada değiştiyse
 * veya medya aidiyeti uyuşmuyorsa `dofKanitMedyasiSil` reddeder, hata
 * kullanıcıya görünür durum mesajıyla yansıtılır (sessizce yutulmaz). */
async function _dofKanitMedyaSilTikla(localMediaUuid) {
  const dofUuid = _dofKanitAktifDofUuid;
  const durum = document.getElementById('dof-kanit-medya-durum');
  if (!dofUuid) return;
  try {
    await dofKanitMedyasiSil(dofUuid, localMediaUuid);
    if (durum) durum.textContent = '';
    _dofDurumMetniGuncelle('silindi');
    await _dofMedyaSonrasiYenile(dofUuid);
  } catch (e) {
    if (durum) durum.textContent = (e && e.message) || 'Kanıt silinemedi.';
  }
}
if (typeof window !== 'undefined') window._dofKanitMedyaSilTikla = _dofKanitMedyaSilTikla;

// ─── BAŞLANGIÇ ───────────────────────────────────────────────
window.addEventListener('load', () => {
  console.log(`İSG Saha Asistanı ${APP_VERSION} başlatıldı`);
  showScreen('setup');
  kurumlariYukle();
  loadInspectionsList();
  _turListesiYukle();
  _dofListesiYukle();
  const buildRozetEl = document.getElementById('build-info');
  if (buildRozetEl) buildRozetEl.textContent = `V1 Pilot · PWA ${APP_CACHE} · ${APP_BUILD}`;
  // 4R-PKG-3J: "Geliştirici" <details>'ı önceki oturumda açık bırakıldıysa
  // geri getir (varsayılan KAPALI -- localStorage'da DEBUG_DOF="1" yoksa
  // kapalı kalır, kullanıcı hiç görmez).
  const gelistiriciDetay = document.getElementById('dof-gelistirici-detay');
  if (gelistiriciDetay) gelistiriciDetay.open = localStorage.getItem('DEBUG_DOF') === '1';
  _dofDebugPanelCiz();
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
  // Oda/Mahal/Konum Kodu "Sesle Yaz" (bkz. aşağıdaki bölüm): TÜM ekran
  // geçişleri buradan geçiyor -- aktif bir ses tanıma varsa akış/sayfa
  // değişince güvenli biçimde durdurulur (yarım kalmış dinleme kalmaz).
  if (typeof _sesleYazDurdur === 'function') _sesleYazDurdur();
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
// Kararlılık notu (2026-07-22): 250ms yedek zamanlayıcı, uzun/otomatikleştirilmiş
// test koşularında (ör. onlarca dakikalık tam paket, sistem yükü altında) gerçek
// `popstate` olayı GEÇ gelirse (yok DEĞİL, yalnız GECİKMİŞ) erken tetiklenip
// kullanıcıyı yanlışlıkla kurulum ekranına fırlatabiliyordu -- jeton'un çözdüğü
// "stale çağrı" senaryosundan FARKLI, TEK ve geçerli bir çağrının kendi
// zamanlayıcısının gerçek olaydan önce ateşlenmesi. Süre 250ms -> 600ms
// büyütüldü: normal/hızlı popstate akışını hiç etkilemez (zamanlayıcı, ekran
// gerçekten değiştiğinde no-op olarak kalır -- aşağıdaki DOM kontrolü aynen
// korunuyor), yalnız gerçekten popstate hiç gelmeyen (bazı gömülü tarayıcılar)
// veya GEÇİKEN durumlar için daha geniş, güvenli bir bekleme payı sağlıyor.
let _geriTiklaJetonu = 0;
function _geriTikla(oncekiEkranId) {
  const jeton = ++_geriTiklaJetonu;
  const oncekiAktifMi = document.getElementById(oncekiEkranId).classList.contains('active');
  if (typeof history !== 'undefined' && history.back) history.back();
  setTimeout(() => {
    if (jeton !== _geriTiklaJetonu) return;   // aradan yeni bir geri-tıklama geçti -- bu zamanlayıcı geçersiz
    // popstate 600ms içinde gelmediyse (bazı gömülü tarayıcılar veya sistem
    // yükü altında gecikme) manuel düş.
    if (oncekiAktifMi && document.getElementById(oncekiEkranId).classList.contains('active')) {
      _setupEkraninaGec();
    }
  }, 600);
}

function _modalAcikMi() {
  return document.getElementById('modal-confirm').style.display === 'flex' ||
         document.getElementById('modal-form').style.display === 'flex' ||
         document.getElementById('modal-qr-tarama').style.display === 'flex';
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
    qrTaramayiKapat();
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
  // Güvenlik (2026-08-02) -- id de escape edilir: QR aktarımı sayesinde
  // artık kurum/birim id'si yerel uuid() dışında (taranan bir QR koddan)
  // da gelebiliyor -- escape edilmeden value="${id}" içine yazmak saklı
  // XSS'e açık olurdu (bkz. kurumAgaciUpsertEt'teki doğrulama, aynı zincir).
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    kurumlar.map(k => `<option value="${_esc(k.id)}">${_esc(k.ad)}</option>`).join('');
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

  // SUPV-22 (2026-08-10) -- ESKİDEN Object.entries(PROFILLER) üzerinden
  // HER profil için ayrı bir "+Yeni: X" kısayolı üretilirdi (onlarca
  // seçenek, kuruma bağlı birim sayısından bağımsız olarak SABİT ve
  // GEREKSİZ büyük bir liste). yeniBirimEkle()'nin kendi formunda ZATEN
  // TAM bir "Bina Tipi" seçici var (bkz. form-birim-profil) -- dropdown
  // seviyesinde tip'i ÖNCEDEN seçtirmek gereksiz TEKRARdı. Artık TEK bir
  // genel "+ Yeni Birim Ekle" seçeneği var, tip formun İÇİNDE seçilir.
  sel.innerHTML = '<option value="">Seçiniz...</option>' +
    (birimler.length
      ? `<optgroup label="Mevcut Birimler">${birimler.map(b => `<option value="${_esc(b.id)}">${_esc(b.ad)}</option>`).join('')}</optgroup>`
      : '') +
    '<option value="YENI">+ Yeni Birim Ekle</option>';
  if (secili && birimler.some(b => b.id === secili)) sel.value = secili;
}

async function _birimSecimDegisti() {
  const sel = document.getElementById('setup-birim');
  const deger = sel.value;
  if (deger === 'YENI') {
    sel.value = '';
    await yeniBirimEkle();
  }
}
if (typeof window !== 'undefined') window._birimSecimDegisti = _birimSecimDegisti;

async function yeniKurumEkle() {
  // Kurum/Birim Hiyerarşisi + Tür (2026-08-02, Faz 2 Commit 3) -- tek
  // prompt() yerine küçük bir form: ad + tür seçimi. Tür SADECE ÖNERİ
  // amaçlı (birim/oda öneri şablonlarını tetikler), zorunlu değil.
  const turSecenekleri = '<option value="">— Belirtilmemiş —</option>' +
    Object.entries(KURUM_TUR_SABLONLARI).map(([k, v]) =>
      `<option value="${k}">${_esc(v.ad)}</option>`).join('');

  showFormModal('Yeni Kurum', `
    <div class="input-group">
      <label>Kurum Adı</label>
      <input type="text" id="form-kurum-ad" placeholder="Örn: KMÜ Rektörlüğü, Veterinerlik Fakültesi">
    </div>
    <div class="input-group" style="margin-top:15px;">
      <label>Kurum Türü (öneri şablonları için, zorunlu değil)</label>
      <select id="form-kurum-tur">${turSecenekleri}</select>
    </div>
  `, async () => {
    const ad = document.getElementById('form-kurum-ad').value.trim();
    if (!ad) { alert('Kurum adı gerekli.'); return; }
    const tur = document.getElementById('form-kurum-tur').value || null;
    const kurum = { id: uuid(), ad, tur, olusturma: new Date().toISOString() };
    await dbEkle('kurumlar', kurum);
    closeFormModal();
    await kurumlariYukle();
    document.getElementById('setup-kurum').value = kurum.id;
    await birimleriYukle();
  }, 'Kurumu Oluştur');
}

async function yeniBirimEkle(onceTip) {
  const kurumId = document.getElementById('setup-kurum').value;
  if (!kurumId) { alert('Önce bir kurum seçin.'); return; }

  const profilSecenekleri = '<option value="">Seçiniz...</option>' +
    Object.entries(PROFILLER).map(([k, v]) => `<option value="${k}">${_esc(v.ad)}</option>`).join('') +
    '<option value="genel">Genel / Diğer</option>';

  // Kurum/Birim Hiyerarşisi (2026-08-02, Faz 2 Commit 3) -- "Üst Birim"
  // seçimi mevcut konteyner/daire öneri akışının YANINDA, ayrı ve genel bir
  // alan: sabit "alt_birim" seviyesi yerine keyfi derinlik kurar
  // (parentBirimId). Mevcut chip akışı (ad ÖNERİSİ) hiç değişmedi --
  // placeholder-only davranış (Kütüphane bulgusu regresyonu) korunuyor.
  const mevcutBirimler = await dbIndexTumu('birimler', 'kurumId', kurumId);
  const ustSecenekleri = mevcutBirimler.map(b =>
    `<option value="${_esc(b.id)}">${_esc(b.ad)}</option>`).join('');

  // Kurum türüne göre BİRİM adı önerisi (2026-08-02) -- KURUM_TUR_BIRIM_
  // ONERILERI'nden, kurum.tur ayarlıysa gösterilir. Üniversite hariç
  // (zaten PROFİLLER/ALT_BIRIM_LISTELERI kapsıyor). Sadece öneri: tıklanınca
  // Ad alanına yazılır, serbestçe değiştirilebilir.
  const kurum = await dbGetir('kurumlar', kurumId);
  const birimAdOnerileri = (kurum && KURUM_TUR_BIRIM_ONERILERI[kurum.tur]) || null;
  const birimAdOnerisiHtml = birimAdOnerileri ? `
    <div class="input-group" id="form-birim-ad-onerisi-wrap" style="margin-top:10px;">
      <label>Birim Adı Önerisi (${_esc(KURUM_TUR_SABLONLARI[kurum.tur].ad)} için tipik, opsiyonel)</label>
      <div class="chip-group" id="form-birim-ad-onerisi-chips">
        ${birimAdOnerileri.map((ad) => `<div class="chip" onclick="_birimFormAdOnerisiSec(this)">${_esc(ad)}</div>`).join('')}
      </div>
    </div>` : '';

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
    ${birimAdOnerisiHtml}
    <div class="input-group" id="form-birim-ad-wrap" style="margin-top:15px;">
      <label>Birim Adı</label>
      <input type="text" id="form-birim-ad" placeholder="Örn: Veteriner Hastanesi">
    </div>
    <div class="input-group">
      <label>Kaç Katlı?</label>
      <input type="number" id="form-birim-kat" value="1" min="1">
    </div>
    <div class="input-group" style="margin-top:15px;">
      <label>Üst Birim (opsiyonel -- hiyerarşi kurmak için)</label>
      <select id="form-birim-ust">
        <option value="">— Yok (üst seviye) —</option>
        ${ustSecenekleri}
      </select>
    </div>
  `, async () => {
    const ad = document.getElementById('form-birim-ad').value.trim();
    if (!ad) { alert('Birim adı gerekli.'); return; }
    const profil = document.getElementById('form-birim-profil').value;
    if (!profil) { alert('Bina tipi seçin.'); return; }
    const katSayisi = parseInt(document.getElementById('form-birim-kat').value) || 1;
    let katlar = ['Zemin'];
    if (katSayisi > 1) katlar = ['Zemin', ...Array.from({ length: katSayisi - 1 }, (_, i) => `${i + 1}.Kat`)];
    const parentBirimId = document.getElementById('form-birim-ust').value || null;

    const birim = { id: uuid(), kurumId, ad, tip: profil, katlar, odalar: [], ozelAlanlar: [],
                     parentBirimId, olusturma: new Date().toISOString() };
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
    // 4R-PKG-3B (Kütüphane bulgusu): profil adı artık DEĞER olarak
    // OTOMATİK yazılmıyor -- yalnız PLACEHOLDER/öneri olarak gösteriliyor.
    // Kullanıcı alanı BOŞ bırakıp "Birimi Oluştur"a basarsa mevcut
    // doğrulama ("Birim adı gerekli.") zaten reddeder -- profil adının
    // SESSİZCE gerçek birim adı olması artık mümkün değil, kullanıcı
    // görüp AÇIKÇA yazmalı/kabul etmeli.
    const adInput = document.getElementById('form-birim-ad');
    adInput.value = '';
    adInput.placeholder = `Öneri: ${profilAdi} (kabul etmek için aynen yazın, farklıysa kendi adınızı girin)`;
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

/** Kurum türüne göre birim-adı önerisi chip'i tıklanınca Ad alanına yazar
 * (2026-08-02) -- _birimFormDaireSec ile aynı davranış: placeholder değil
 * doğrudan değer, çünkü kullanıcı somut bir seçenek arasından açıkça
 * seçim yapıyor; serbestçe değiştirilebilir/silinebilir. */
function _birimFormAdOnerisiSec(el) {
  document.querySelectorAll('#form-birim-ad-onerisi-chips .chip').forEach((c) => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('form-birim-ad').value = el.textContent;
}
if (typeof window !== 'undefined') window._birimFormAdOnerisiSec = _birimFormAdOnerisiSec;

// ─── KURUM/BİRİM QR AKTARIMI (2026-08-02, Faz 2 Commit 5) ──────────────
// Desktop'un ürettiği QR kare(ler)ini tarar, kurum/birim ağacını yerel
// IndexedDB'ye upsert eder. Wire-format Desktop'un kurum_qr_aktarim.py'si
// ile birebir: her kare "SIRA|TOPLAM|<base64>" biçiminde bir metin, base64
// içeriği ham (header'sız) deflate (zlib wbits=-15 ile bit-uyumlu,
// DecompressionStream('deflate-raw') ile açılır) sıkıştırılmış JSON.
let _qrParcalar = {};
let _qrToplam = null;
let _qrStream = null;
let _qrKareId = null;

/** Bir QR karesinden çözülen metni işler -- Desktop formatına uymayan
 * (üç parçadan az) metinleri sessizce yoksayar (yabancı bir QR/barkod
 * okunmuş olabilir). Test edilebilirlik için ayrı, saf bir fonksiyon. */
function _qrKareyiIsle(metin) {
  if (typeof metin !== 'string') return null;
  const ilkIki = metin.split('|', 2);
  if (ilkIki.length < 2) return null;
  const sira = parseInt(ilkIki[0], 10);
  const toplam = parseInt(ilkIki[1], 10);
  if (!Number.isInteger(sira) || !Number.isInteger(toplam) || sira < 1 || toplam < 1 || sira > toplam) return null;
  const b64 = metin.slice(ilkIki[0].length + ilkIki[1].length + 2);
  _qrToplam = toplam;
  _qrParcalar[sira] = b64;
  return { toplananSayi: Object.keys(_qrParcalar).length, toplam };
}
if (typeof window !== 'undefined') window._qrKareyiIsle = _qrKareyiIsle;

/** Toplanan parçaları birleştirip base64 -> ham deflate açma -> JSON.parse
 * zincirini uygular. Eksik parça varsa hata fırlatır. */
async function _qrPayloadCoz() {
  if (!_qrToplam) throw new Error('Henüz hiçbir kare okunmadı.');
  const eksik = [];
  for (let i = 1; i <= _qrToplam; i++) if (!_qrParcalar[i]) eksik.push(i);
  if (eksik.length) throw new Error(`Eksik parça(lar): ${eksik.join(', ')}`);
  const b64 = Array.from({ length: _qrToplam }, (_, i) => _qrParcalar[i + 1]).join('');
  const ikili = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const acici = new DecompressionStream('deflate-raw');
  const yazici = acici.writable.getWriter();
  yazici.write(ikili);
  yazici.close();
  const acilmisBuffer = await new Response(acici.readable).arrayBuffer();
  return JSON.parse(new TextDecoder('utf-8').decode(acilmisBuffer));
}
if (typeof window !== 'undefined') window._qrPayloadCoz = _qrPayloadCoz;

function _qrDurumSifirla() {
  _qrParcalar = {};
  _qrToplam = null;
}

/** Güvenlik (2026-08-02) -- QR taraması GÜVEN SINIRIDIR: payload dışarıdan
 * (taranan bir görüntüden) geliyor, hiçbir alan tipi/formatı garanti değil.
 * `id`/`ad` gibi alanlar doğrulanmadan hem IndexedDB'ye hem (kurumlariYukle/
 * birimleriYukle/ustSecenekleri üzerinden) HTML `value="..."` attribute'una
 * yazılıyordu -- kötü niyetli bir QR, `id` alanına `"><script>...` gibi bir
 * değer koyup saklı XSS tetikleyebilirdi (render tarafında _esc() ile de
 * kapatıldı, ama giriş noktasında da reddetmek savunma-derinliği sağlar).
 * Ayrıca aşırı derin bir ağaç (kötü niyetli veya bozuk) sonsuz olmayan ama
 * gereksiz derin bir özyinelemeye yol açmasın diye derinlik sınırı var. */
function _qrPayloadDogrula(payload) {
  const gecerliMetin = (v, maxUzunluk) =>
    typeof v === 'string' && v.length > 0 && v.length <= maxUzunluk;

  if (!payload || typeof payload !== 'object') {
    throw new Error('QR verisi geçersiz (payload nesne değil).');
  }
  if (!payload.kurum || !gecerliMetin(payload.kurum.id, 200) || !gecerliMetin(payload.kurum.ad, 300)) {
    throw new Error('QR verisinde kurum bilgisi geçersiz (id/ad).');
  }
  if (payload.kurum.tur != null && typeof payload.kurum.tur !== 'string') {
    throw new Error('QR verisinde kurum türü geçersiz.');
  }

  function dugumuDogrula(dugum, derinlik) {
    if (derinlik > 20) throw new Error('QR verisinde birim ağacı çok derin.');
    if (!dugum || !gecerliMetin(dugum.id, 200) || !gecerliMetin(dugum.ad, 300)) {
      throw new Error('QR verisinde birim bilgisi geçersiz (id/ad).');
    }
    if (dugum.children !== undefined && !Array.isArray(dugum.children)) {
      throw new Error('QR verisinde birim alt-ağacı geçersiz.');
    }
    for (const cocuk of (dugum.children || [])) dugumuDogrula(cocuk, derinlik + 1);
  }
  if (payload.birimler !== undefined && !Array.isArray(payload.birimler)) {
    throw new Error('QR verisinde birimler listesi geçersiz.');
  }
  for (const dugum of (payload.birimler || [])) dugumuDogrula(dugum, 0);
}
if (typeof window !== 'undefined') window._qrPayloadDogrula = _qrPayloadDogrula;

/** QR'dan gelen kurum/birim ağacını yerel IndexedDB'ye upsert eder --
 * "gerçek veri şablonun önüne geçer" ilkesi: mevcut bir birimin sahada
 * gerçekten doldurulmuş tip/katlar/odalar/ozelAlanlar alanları KORUNUR,
 * yalnız ad/sgkNo/adres/parentBirimId Desktop'tan gelen değerle güncellenir.
 * Yeni (daha önce bu cihazda hiç görülmemiş) birimler tip='genel' ile
 * oluşturulur -- Desktop'ta birim.tip kavramı yok, PWA'nın kendi checklist
 * ekseni, kurum.tur'dan bağımsız. */
async function kurumAgaciUpsertEt(payload) {
  _qrPayloadDogrula(payload);
  const mevcutKurum = await dbGetir('kurumlar', payload.kurum.id);
  const kurum = {
    id: payload.kurum.id,
    ad: payload.kurum.ad,
    tur: payload.kurum.tur || null,
    olusturma: (mevcutKurum && mevcutKurum.olusturma) || new Date().toISOString()
  };
  if (mevcutKurum) await dbGuncelle('kurumlar', kurum); else await dbEkle('kurumlar', kurum);

  async function _dugumuIsle(dugum, parentBirimId) {
    const mevcutBirim = await dbGetir('birimler', dugum.id);
    const birim = {
      id: dugum.id,
      kurumId: payload.kurum.id,
      ad: dugum.ad,
      tip: (mevcutBirim && mevcutBirim.tip) || 'genel',
      katlar: (mevcutBirim && mevcutBirim.katlar) || ['Zemin'],
      odalar: (mevcutBirim && mevcutBirim.odalar) || [],
      ozelAlanlar: (mevcutBirim && mevcutBirim.ozelAlanlar) || [],
      parentBirimId,
      sgkNo: dugum.sgkNo || null,
      adres: dugum.adres || null,
      olusturma: (mevcutBirim && mevcutBirim.olusturma) || new Date().toISOString()
    };
    if (mevcutBirim) await dbGuncelle('birimler', birim); else await dbEkle('birimler', birim);
    for (const cocuk of (dugum.children || [])) await _dugumuIsle(cocuk, dugum.id);
  }
  for (const dugum of (payload.birimler || [])) await _dugumuIsle(dugum, null);

  await kurumlariYukle();
  document.getElementById('setup-kurum').value = payload.kurum.id;
  await birimleriYukle();
  return { kurumAdi: payload.kurum.ad, birimSayisi: _agacDugumSayisi(payload.birimler || []) };
}
if (typeof window !== 'undefined') window.kurumAgaciUpsertEt = kurumAgaciUpsertEt;

function _agacDugumSayisi(dugumler) {
  let sayi = 0;
  for (const d of dugumler) sayi += 1 + _agacDugumSayisi(d.children || []);
  return sayi;
}

async function qrTaramayiAc() {
  _qrDurumSifirla();
  document.getElementById('qr-durum').textContent = "Kamerayı Desktop'taki QR koda doğrultun...";
  document.getElementById('modal-qr-tarama').style.display = 'flex';
  _modalHistoryAc();
  try {
    _qrStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) {
    document.getElementById('qr-durum').textContent = 'Kamera erişimi reddedildi veya kullanılamıyor.';
    return;
  }
  const video = document.getElementById('qr-video');
  video.srcObject = _qrStream;
  await video.play();
  _qrTaramaDongusu();
}
if (typeof window !== 'undefined') window.qrTaramayiAc = qrTaramayiAc;

function _qrTaramaDongusu() {
  if (!_qrStream) return;  // taranırken kapatıldıysa döngüyü durdur
  const video = document.getElementById('qr-video');
  const canvas = document.getElementById('qr-canvas');
  if (video.readyState === video.HAVE_ENOUGH_DATA && typeof jsQR === 'function') {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const goruntu = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const kod = jsQR(goruntu.data, goruntu.width, goruntu.height);
    if (kod && kod.data) {
      const durum = _qrKareyiIsle(kod.data);
      if (durum) {
        document.getElementById('qr-durum').textContent =
          `Kare ${durum.toplananSayi}/${durum.toplam} okundu...`;
        if (durum.toplananSayi === durum.toplam) {
          _qrTamamlandi();
          return;
        }
      }
    }
  }
  _qrKareId = requestAnimationFrame(_qrTaramaDongusu);
}

async function _qrTamamlandi() {
  try {
    const payload = await _qrPayloadCoz();
    const sonuc = await kurumAgaciUpsertEt(payload);
    qrTaramayiKapat();
    alert(`"${sonuc.kurumAdi}" kurumu ve ${sonuc.birimSayisi} birim aktarıldı.`);
  } catch (e) {
    document.getElementById('qr-durum').textContent = `Hata: ${e.message}`;
    _qrDurumSifirla();
    _qrKareId = requestAnimationFrame(_qrTaramaDongusu);
  }
}

function qrTaramayiKapat() {
  if (_qrKareId) { cancelAnimationFrame(_qrKareId); _qrKareId = null; }
  if (_qrStream) { _qrStream.getTracks().forEach((t) => t.stop()); _qrStream = null; }
  const modal = document.getElementById('modal-qr-tarama');
  if (modal && modal.style.display === 'flex') {
    modal.style.display = 'none';
    _modalHistoryKapat();
  }
  _qrDurumSifirla();
}
if (typeof window !== 'undefined') window.qrTaramayiKapat = qrTaramayiKapat;

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
      // SUPV-22 -- tıklanan checklist chip metinleri (audit izi -- Evet/
      // Hayır durumu TUTULMAZ, yalnız hangi hatırlatmaların kullanıldığı).
      checklist: checklistTaslak.length ? checklistTaslak.slice() : null,
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
  checklistTaslak = [];
  _hayatiRiskButonGuncelle();
  _sesButonSifirla();
  _fotoOnizlemeGoster();
  _sesOnizlemeGoster();
  const metin = document.getElementById('finding-manual');
  if (metin) metin.value = '';
  // SUPV-22 -- her yeni oda/oturuma girişte (startInspection/resumeSession,
  // bu fonksiyonun kendi "HER giriş noktasında çağrılmalı" ilkesiyle AYNI)
  // checklist chip'leri currentSession.alanTipi'ne göre yeniden kurulur.
  _checklistChipleriGoster();
}

// ─── CHECKLIST KÜTÜPHANESİ CHIP'LERİ (SUPV-22, 2026-08-10) ──────────────
// Desktop'un TAM yapılandırılmış formunun (Evet/Hayır/Gerekli Değil)
// AKSİNE burada HAFİF chip UI -- dokununca metin nota EKLENİR, zorunlu
// tamamlama/Evet-Hayır durumu TUTULMAZ (plan §7 "pasif hatırlatma"
// kararı, 2026-08-10). checklistKaynagiBul (checklist-kutuphanesi.js)
// yalnız basit anahtar-kelime eşleşmesi yapar -- eşleşme yoksa satır HİÇ
// gösterilmez (zorunlu değil).
function _checklistChipleriGoster() {
  const baslik = document.getElementById('checklist-chip-baslik');
  const grup = document.getElementById('checklist-chip-grup');
  if (!baslik || !grup) return;
  grup.innerHTML = '';
  const alanTipi = currentSession && currentSession.alanTipi;
  if (!alanTipi || typeof checklistKaynagiBul !== 'function') {
    baslik.style.display = 'none';
    return;
  }
  const kod = checklistKaynagiBul(alanTipi, null);
  const kaynak = kod && CHECKLIST_KUTUPHANESI[kod];
  if (!kaynak) {
    baslik.style.display = 'none';
    return;
  }
  baslik.style.display = '';
  for (const madde of kaynak.maddeler) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.textContent = madde;
    // SUPV-25 (2026-08-11) -- daha önce tıklanmış maddeler (checklistTaslak'a
    // zaten girmiş) YENİDEN oluşturulan chip listesinde "active" (mavi)
    // görünür -- yeni oda/oturuma geçince taslak sıfırlandığı için burada
    // her zaman GÜNCEL durumu yansıtır.
    if (checklistTaslak.includes(madde)) chip.classList.add('active');
    chip.onclick = () => _checklistChipTiklandi(madde, chip);
    grup.appendChild(chip);
  }
}

// SUPV-25 (2026-08-11) -- GERÇEK kullanımda kullanıcı chip'e dokununca
// hiçbir görünür değişiklik FARK ETMEDİĞİNİ bildirdi (chip'in kendisi
// hiç görsel durum değiştirmiyordu VE 3 satırlık textarea, 2. satırdan
// itibaren TAŞIYOR ama otomatik aşağı kaymıyordu -- kullanıcı textarea'yı
// elle kaydırmadıkça eklenen metni HİÇ GÖRMÜYORDU, 58 maddelik chip
// listesi ekranda hareketsiz durduğu için "ayrı bir liste" izlenimi
// yaratıyordu). Kod/veri KATMANI baştan beri doğruydu (bkz. e-bulgu-not.
// spec.js testleri) -- eksik olan yalnız görsel GERİ BİLDİRİMDİ. Bu
// fonksiyon artık: (a) textarea'yı yeni eklenen satırın görünür olacağı
// şekilde aşağı kaydırır, (b) tıklanan chip'i kalıcı olarak "active"
// (mavi) işaretler -- kullanıcı hangi maddelere zaten dokunduğunu tek
// bakışta görür, (c) AYNI chip'e ikinci kez dokununca metni TEKRAR
// EKLEMEZ (önceden sessizce yinelenen bir satır bug'ıydı -- checklistTaslak
// zaten dedup ediyordu ama textarea metni ETMİYORDU).
function _checklistChipTiklandi(metin, chipEl) {
  const kutu = document.getElementById('finding-manual');
  if (!kutu) return;
  if (checklistTaslak.includes(metin)) return;  // zaten eklendi -- yinelenmez
  const mevcut = kutu.value.trim();
  kutu.value = mevcut ? mevcut + '\n' + metin : metin;
  kutu.scrollTop = kutu.scrollHeight;
  checklistTaslak.push(metin);
  if (chipEl) chipEl.classList.add('active');
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

  // PWA Commit 4P: DÖF kanıt medyası modu -- aktifFotolarTaslak'a HİÇ
  // dokunmaz, doğrudan dofKanitMedyasiEkle'ye (ayrı store) yönlendirir.
  // Kamera overlay'i (video/canvas/#camera-ui) fiziksel olarak paylaşılır,
  // ama SONUÇ/STATE tamamen ayrıdır.
  if (kameraModu === 'dof-kanit') {
    await _dofKanitFotoKaydet(sonuc, 'camera');
    return;
  }

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

// ─── ODA/MAHAL/KONUM KODU — "SESLE YAZ" (Kamera/OCR'a alternatif) ──
// Kamera/OCR (📷/_etiketOku) saha koşullarında her zaman güvenilir değil --
// bu bölüm AYNI #kat-alan-oda-no inputuna yazan ÜÇÜNCÜ bir alternatiftir
// (elle giriş + kamera/OCR + sesle yaz). Hiçbiri kaldırılmaz/bozulmaz.
//
// ÖNEMLİ (dürüst sınır): Web Speech API (`SpeechRecognition`/
// `webkitSpeechRecognition`) tarayıcı yerleşik bir servistir -- TAM
// OFFLINE ÇALIŞMA GARANTİSİ YOKTUR (çoğu tarayıcıda motor bulut
// tabanlıdır). Bu yüzden "tam offline ses tanıma" iddia EDİLMEZ; yalnız
// "destek varsa kullanılabilir hızlı giriş yardımcısı" olarak sunulur.
// Destek yoksa kullanıcıya açık, kısa bir mesaj gösterilir; elle giriş ve
// kamera/OCR hiç etkilenmeden çalışmaya devam eder.
//
// Aynı anda birden fazla recognition çalışmaması ve ekran/akış değişince
// güvenli durdurma için TEK bir modül-seviyesi örnek (`_sesTanimaOrnegi`)
// tutulur; `showScreen()` her çağrıldığında (TÜM navigasyon oradan geçiyor)
// `_sesleYazDurdur()` çağrılır.
let _sesTanimaOrnegi = null;

function _sesTanimaDesteginiKontrolEt() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function _sesleYazButonDurumGuncelle(dinliyorMu) {
  const btn = document.getElementById('kat-alan-sesle-yaz-btn');
  if (!btn) return;
  btn.textContent = dinliyorMu ? '⏹' : '🎤';
  btn.classList.toggle('active', dinliyorMu);
}

function _sesleYazDurumGoster(metin) {
  const el = document.getElementById('kat-alan-sesle-yaz-durum');
  if (el) el.textContent = metin || '';
}

/** Aktif dinlemeyi (varsa) güvenli biçimde durdurur -- ekran/akış
 * değişiminde (`showScreen`) ve kullanıcı butona tekrar bastığında
 * çağrılır. `abort()` sonrası tarayıcı zaten `onend`'i tetikler; buradaki
 * `_sesTanimaOrnegi = null` erken temizlik -- `onend` ikinci kez null
 * atamayı no-op yapar. */
function _sesleYazDurdur() {
  if (_sesTanimaOrnegi) {
    try { _sesTanimaOrnegi.abort(); } catch (e) { /* zaten durmuş olabilir -- yut */ }
    _sesTanimaOrnegi = null;
  }
  _sesleYazButonDurumGuncelle(false);
}
if (typeof window !== 'undefined') window._sesleYazDurdur = _sesleYazDurdur;

const _TR_SAYI_BIRLER = { bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9 };
const _TR_SAYI_ONLAR = { on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90 };
// Yalnız İLK kelime + hemen ardından sayı geldiğinde harfe çevrilir --
// aşırı agresif olmamak için ("zemin"/"el" başka bağlamda serbest kelime
// olarak KALIR, yalnızca oda kodu deseninde -- harf+sayı -- dönüştürülür).
const _TR_HARF_KELIME = { el: 'L', zemin: 'Z' };

/** Ardışık Türkçe sayı kelimelerinden (bir..dokuz, on..doksan, yüz) tek bir
 * tamsayı üretir. Örn: ["üç","yüz","yedi"] -> 307, ["on","beş"] -> 15. */
function _trSayiKelimeGrubunuCevir(kelimeler) {
  let deger = 0;
  let i = 0;
  while (i < kelimeler.length) {
    const k = kelimeler[i];
    if (k === 'yüz') { deger += 100; i += 1; continue; }
    if (Object.prototype.hasOwnProperty.call(_TR_SAYI_BIRLER, k)) {
      if (kelimeler[i + 1] === 'yüz') { deger += _TR_SAYI_BIRLER[k] * 100; i += 2; continue; }
      deger += _TR_SAYI_BIRLER[k]; i += 1; continue;
    }
    if (Object.prototype.hasOwnProperty.call(_TR_SAYI_ONLAR, k)) { deger += _TR_SAYI_ONLAR[k]; i += 1; continue; }
    i += 1;   // buraya asla düşmemeli (çağıran yalnız sayı-kelimesi run'ı verir) -- savunma amaçlı
  }
  return deger;
}

/** Ses tanımadan gelen ham metni oda/mahal/konum koduna göre BASİT ve
 * TEMKİNLİ normalize eder -- yanlış düzeltme riski varsa ham kelime
 * KORUNUR (aşırı agresif dönüşüm yapılmaz). Adımlar:
 * 1) ardışık sayı-kelimesi grupları tek sayıya çevrilir ("üç yüz yedi" -> "307"),
 * 2) yalnız İLK kelime "el"/"zemin" ise VE hemen ardından (artık sayıya
 *    çevrilmiş) bir sayı geliyorsa harfe çevrilir ("el 307" -> "L 307"),
 * 3) tek harfli bağımsız kelimeler büyütülür ("l" -> "L", "a" -> "A"),
 * 4) kalan alfabetik kelimelerin ilk harfi büyütülür ("ofis" -> "Ofis").
 * Boş/anlamsız girdi ham (trim'lenmiş) metni değişmeden döner. */
function _sesMetniOdaKoduNormallestir(hamMetin) {
  const ham = (hamMetin || '').trim();
  if (!ham) return ham;

  const kelimeler = ham.toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
  const cikti = [];
  let i = 0;
  while (i < kelimeler.length) {
    const k = kelimeler[i];
    const sayiKelimesiMi = k === 'yüz' ||
      Object.prototype.hasOwnProperty.call(_TR_SAYI_BIRLER, k) ||
      Object.prototype.hasOwnProperty.call(_TR_SAYI_ONLAR, k);
    if (sayiKelimesiMi) {
      const run = [];
      let j = i;
      while (j < kelimeler.length) {
        const kj = kelimeler[j];
        const sayiMi = kj === 'yüz' ||
          Object.prototype.hasOwnProperty.call(_TR_SAYI_BIRLER, kj) ||
          Object.prototype.hasOwnProperty.call(_TR_SAYI_ONLAR, kj);
        if (!sayiMi) break;
        run.push(kj); j += 1;
      }
      cikti.push(String(_trSayiKelimeGrubunuCevir(run)));
      i = j;
      continue;
    }
    cikti.push(k);
    i += 1;
  }

  // Adım 2: yalnız İLK kelime harf-kelimesiyse VE ardından sayı geldiyse.
  if (cikti.length >= 2 && Object.prototype.hasOwnProperty.call(_TR_HARF_KELIME, cikti[0]) && /^\d+$/.test(cikti[1])) {
    cikti[0] = _TR_HARF_KELIME[cikti[0]];
  }

  const sonuc = cikti.map((kelime) => {
    if (/^\d+$/.test(kelime)) return kelime;
    if (kelime.length === 1) return kelime.toLocaleUpperCase('tr');
    return kelime.charAt(0).toLocaleUpperCase('tr') + kelime.slice(1);
  });
  return sonuc.join(' ');
}

/** "🎤 Sesle Yaz" butonu -- destek varsa dinlemeyi başlatır/durdurur,
 * sonucu (normalize edilmiş) doğrudan #kat-alan-oda-no'ya yazar. Otomatik
 * kayıt/ileri geçiş YAPMAZ -- yalnız inputu doldurur, kullanıcı elle
 * düzeltebilir/Devam edebilir (mevcut startInspection akışı DEĞİŞMEDEN). */
function _odaSesleYazTikla() {
  if (_sesTanimaOrnegi) {
    // Zaten dinliyor -- kullanıcı tekrar bastı, güvenli durdur (toggle).
    _sesleYazDurdur();
    _sesleYazDurumGoster('');
    return;
  }
  if (!_sesTanimaDesteginiKontrolEt()) {
    _sesleYazDurumGoster('Bu cihaz/tarayıcı sesle yazmayı desteklemiyor. Elle giriş yapabilirsiniz.');
    return;
  }

  const SpeechRecognitionSinifi = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognitionSinifi();
  recognition.lang = 'tr-TR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    _sesleYazButonDurumGuncelle(true);
    _sesleYazDurumGoster('Dinleniyor…');
  };
  recognition.onresult = (e) => {
    const alternatif = e && e.results && e.results[0] && e.results[0][0];
    const hamMetin = alternatif ? alternatif.transcript : '';
    const normalize = _sesMetniOdaKoduNormallestir(hamMetin);
    // Codex NEEDS_FIX / P1: ham transcript boşsa veya normalize sonucu
    // boşsa mevcut input DEĞİŞTİRİLMEZ (kullanıcının önceden elle girdiği
    // değer korunur) -- `_katAlanOdaNoDegisti()` de ÇAĞRILMAZ (eşleşme
    // state'i, hiçbir şey yazılmadığı için bozulmamalı). Yalnız anlamlı
    // (boş olmayan) normalize sonucu varsa input güncellenir.
    if (!normalize) {
      _sesleYazDurumGoster('Sesle yazma sonucu boş geldi. Mevcut değer korunuyor.');
      return;
    }
    const input = document.getElementById('kat-alan-oda-no');
    if (input) {
      input.value = normalize;
      _katAlanOdaNoDegisti();   // OCR aday-chip seçimiyle AYNI davranış -- eşleşme state'i günceller
    }
    _sesleYazDurumGoster(`Algılandı: "${normalize}"`);
  };
  // Codex NEEDS_FIX / P2: `onerror`/`onend` YALNIZ bu callback'in ait
  // olduğu `recognition` HÂLÂ güncel aktif örnekse (`_sesTanimaOrnegi ===
  // recognition`) global state'i temizler. Abort edilmiş/durmuş ESKİ bir
  // örneğin GECİKMELİ gelen onend/onerror'ı, o sırada başlamış YENİ bir
  // recognition'ın state'ini (referansını/buton durumunu) SİLEMEZ --
  // aksi halde bir sonraki tıklama, ikinci örneği durdurmak yerine
  // yanlışlıkla üçüncü bir recognition başlatırdı. Stale (kendi örneği
  // artık aktif olmayan) çağrılarda kullanıcıya mesaj da BASILMAZ --
  // eski bir hatayı/yeni bir dinlemenin üstüne yazıp yanıltmamak için.
  recognition.onerror = (e) => {
    if (_sesTanimaOrnegi !== recognition) return;   // stale -- yeni bir örnek zaten aktif
    _sesleYazDurumGoster('Ses tanıma hatası: ' + ((e && e.error) || 'bilinmeyen') + '. Elle giriş yapabilirsiniz.');
    // Spesifikasyona göre `error`'dan sonra `end` de tetiklenir, ama buna
    // GÜVENMİYORUZ (bazı motor/tarayıcı kombinasyonlarında sıralama garanti
    // değil) -- burada da doğrudan sıfırlanır, aksi halde buton "⏹" durumunda
    // asılı kalabilir. `onend` sonradan da çağrılırsa (muhtemel) bu adımlar
    // zaten idempotent (aynı guard sayesinde no-op).
    _sesTanimaOrnegi = null;
    _sesleYazButonDurumGuncelle(false);
  };
  recognition.onend = () => {
    if (_sesTanimaOrnegi !== recognition) return;   // stale -- yeni bir örnek zaten aktif
    _sesTanimaOrnegi = null;
    _sesleYazButonDurumGuncelle(false);
  };

  _sesTanimaOrnegi = recognition;
  try {
    recognition.start();
  } catch (e) {
    if (_sesTanimaOrnegi === recognition) _sesTanimaOrnegi = null;
    _sesleYazButonDurumGuncelle(false);
    _sesleYazDurumGoster('Ses tanıma başlatılamadı: ' + e.message);
  }
}
if (typeof window !== 'undefined') window._odaSesleYazTikla = _odaSesleYazTikla;

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
      // SUPV-22 -- daha önce HER ZAMAN null'dı (checklist UI yoktu);
      // artık bulgunun kendi checklist alanına (varsa) yazılır.
      checklist: b.checklist || null,
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
