'use strict';
/* İSG Saha Asistanı v0.2 — AxonTR
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
  'Cami / mescit',
  'Kazan dairesi', 'Elektrik pano odası', 'Jeneratör / UPS', 'Asansör makine dairesi',
  'Çatı / bodrum', 'Otopark / açık alan', 'Güvenlik / danışma', 'Diğer'
];
const EGITIM_ALANLAR = [
  'Derslik / amfi', 'Kimya laboratuvarı', 'Biyoloji/mikrobiyoloji lab.',
  'Fizik/elektrik lab.', 'Bilgisayar lab.', 'Atölye (makine/kaynak/vb.)',
  'Kütüphane / okuma salonu', 'Konferans salonu', 'Kantin / yemekhane',
  'Spor salonu / soyunma'
];
const MYO_EK_ALANLAR = [
  'Yemekhane / mutfak'
];
const HASTANE_ALANLAR = [
  'Poliklinik / muayene', 'Servis / hasta odası', 'Ameliyathane', 'Yoğun bakım',
  'Acil servis', 'Görüntüleme (radyasyon)', 'Tıbbi laboratuvar', 'Eczane / ilaç deposu',
  'Sterilizasyon ünitesi', 'Tıbbi atık deposu', 'Endüstriyel mutfak', 'Çamaşırhane', 'Morg'
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

// ---------- SAF YARDIMCILAR ----------
// ---- OCR aday seçimi (benchmark: 10/10, etiket testleriyle doğrulandı) ----
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
    // sadece SONDAKI O'lar rakam 0 olabilir (Y01 -> YO-1 okunması durumu)
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

// ---- Checklist rehberi (Inspection Guidance) ----
// z: zorunlu kare. Alan tipi seçilince listelenir, tespit kaydedildikçe işaretlenir.
const CHECKLISTLER = {
  'Kimya laboratuvarı': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'kimyasal_dolap', l: 'Kimyasal dolap + etiketler (GBF)', z: 1 },
    { id: 'ceker_ocak', l: 'Çeker ocak', z: 1 },
    { id: 'goz_dus', l: 'Göz duşu / acil duş', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü (manometre okunur)', z: 1 },
    { id: 'pano', l: 'Elektrik panosu', z: 1 },
    { id: 'atik', l: 'Kimyasal atık alanı', z: 1 },
    { id: 'kkd', l: 'KKD dolabı', z: 0 }
  ],
  'Biyoloji/mikrobiyoloji lab.': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'bgk', l: 'Biyogüvenlik kabini', z: 1 },
    { id: 'tibbi_atik', l: 'Tıbbi atık kutuları', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'otoklav', l: 'Otoklav', z: 0 },
    { id: 'lavabo', l: 'Lavabo / el hijyeni', z: 0 }
  ],
  'Fizik/elektrik lab.': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'deney', l: 'Deney setleri / kablolar', z: 1 },
    { id: 'pano', l: 'Elektrik panosu', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'acil_stop', l: 'Acil durdurma', z: 0 }
  ],
  'Bilgisayar lab.': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'priz', l: 'Priz yükü / çoklu priz', z: 1 },
    { id: 'kablo', l: 'Kablo düzeni', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'kacis', l: 'Acil çıkış', z: 1 },
    { id: 'klima', l: 'Havalandırma / klima', z: 0 }
  ],
  'Atölye (makine/kaynak/vb.)': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'koruyucu', l: 'Makine koruyucuları', z: 1 },
    { id: 'acil_stop', l: 'Acil durdurma butonları', z: 1 },
    { id: 'kkd', l: 'KKD kullanımı / panosu', z: 1 },
    { id: 'pano', l: 'Elektrik panosu', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'gaz_tup', l: 'Kaynak alanı / gaz tüpleri', z: 0 },
    { id: 'isaret', l: 'Uyarı işaretlemeleri', z: 0 }
  ],
  'Derslik / amfi': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'kacis', l: 'Kaçış kapıları', z: 1 },
    { id: 'priz', l: 'Priz / kablo durumu', z: 0 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 0 }
  ],
  'Kütüphane / okuma salonu': [
    { id: 'raf', l: 'Raf sabitlemesi', z: 1 },
    { id: 'kacis', l: 'Kaçış yolları', z: 1 },
    { id: 'priz', l: 'Priz yükü', z: 0 }
  ],
  'Raf alanı / kitap deposu': [
    { id: 'raf', l: 'Raf devrilme / sabitleme', z: 1 },
    { id: 'istif', l: 'İstif yüksekliği', z: 1 },
    { id: 'yangin', l: 'Yangın yükü / söndürücü', z: 1 },
    { id: 'merdiven', l: 'Merdiven / trabzan', z: 0 }
  ],
  'Kompakt (raylı) arşiv rafları': [
    { id: 'sikisma', l: 'Sıkışma emniyeti / kilit', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'ray', l: 'Ray temizliği', z: 0 },
    { id: 'uyari', l: 'Tek kişi çalışma uyarısı', z: 0 }
  ],
  'Havuz çevresi / ıslak zemin': [
    { id: 'zemin', l: 'Kaymaz zemin', z: 1 },
    { id: 'derinlik', l: 'Derinlik işaretleri', z: 1 },
    { id: 'cankurtaran', l: 'Cankurtaran ekipmanı (simit/kanca)', z: 1 },
    { id: 'merdiven', l: 'Havuz merdiveni / tutamak', z: 0 }
  ],
  'Klor / kimyasal deposu': [
    { id: 'havalandirma', l: 'Havalandırma', z: 1 },
    { id: 'kkd', l: 'KKD', z: 1 },
    { id: 'gbf', l: 'GBF / etiketleme', z: 1 },
    { id: 'goz_dus', l: 'Göz duşu', z: 1 },
    { id: 'kilit', l: 'Yetkisiz giriş kilidi', z: 1 },
    { id: 'dokuntu', l: 'Döküntü kiti', z: 0 }
  ],
  'Makine dairesi (pompa/filtre)': [
    { id: 'genel', l: 'Genel görünüm', z: 1 },
    { id: 'koruyucu', l: 'Dönen aksam koruyucuları', z: 1 },
    { id: 'pano', l: 'Elektrik panosu', z: 1 },
    { id: 'zemin', l: 'Zemin / drenaj', z: 0 }
  ],
  'Denge deposu / teknik galeri': [
    { id: 'kapali_alan', l: 'Kapalı alan uyarı levhası', z: 1 },
    { id: 'aydinlatma', l: 'Aydınlatma', z: 1 },
    { id: 'merdiven', l: 'Merdiven / iniş güvenliği', z: 1 }
  ],
  'Kapalı spor salonu': [
    { id: 'zemin', l: 'Zemin durumu', z: 1 },
    { id: 'sabitleme', l: 'Pota / kale sabitlemesi', z: 1 },
    { id: 'kacis', l: 'Kaçış yolları', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'tribun', l: 'Tribün korkuluğu', z: 0 }
  ],
  'Futbol sahası / açık saha': [
    { id: 'kale', l: 'Kale sabitlemesi', z: 1 },
    { id: 'direk', l: 'Aydınlatma direkleri', z: 1 },
    { id: 'tel', l: 'Çevre teli', z: 0 },
    { id: 'zemin', l: 'Saha zemini', z: 0 }
  ],
  'Fitness / kondisyon salonu': [
    { id: 'bakim', l: 'Ekipman bakım etiketleri', z: 1 },
    { id: 'montaj', l: 'Halat / askı montajları', z: 1 },
    { id: 'ayna', l: 'Ayna / cam yüzeyler', z: 0 }
  ],
  'Oyun odası / etkinlik alanı': [
    { id: 'kose', l: 'Köşe koruyucular', z: 1 },
    { id: 'priz', l: 'Priz kapakları', z: 1 },
    { id: 'devrilme', l: 'Dolap/TV devrilme sabitlemesi', z: 1 },
    { id: 'parca', l: 'Küçük parça / oyuncak kontrolü', z: 0 },
    { id: 'zemin', l: 'Zemin yumuşaklığı', z: 0 }
  ],
  'Bahçe / oyun parkı': [
    { id: 'montaj', l: 'Salıncak / kaydırak montajı', z: 1 },
    { id: 'zemin', l: 'Düşme emniyetli zemin (kauçuk)', z: 1 },
    { id: 'cit', l: 'Çit / kapı güvenliği', z: 1 },
    { id: 'golge', l: 'Gölgelik', z: 0 }
  ],
  'Çocuk mutfağı / mama hazırlama': [
    { id: 'sicak', l: 'Sıcak yüzey koruması', z: 1 },
    { id: 'kimyasal', l: 'Kimyasal erişim kilidi', z: 1 },
    { id: 'hijyen', l: 'Hijyen durumu', z: 0 }
  ],
  'Pişirme alanı (fritöz/kazan/davlumbaz)': [
    { id: 'davlumbaz', l: 'Davlumbaz / filtre', z: 1 },
    { id: 'fritoz', l: 'Fritöz / kızgın yağ alanı', z: 1 },
    { id: 'gaz', l: 'Gaz hattı ve vanalar', z: 1 },
    { id: 'yangin', l: 'Yangın söndürme (K tipi)', z: 1 },
    { id: 'zemin', l: 'Zemin kaymazlığı', z: 1 },
    { id: 'kkd', l: 'KKD (önlük/eldiven)', z: 0 }
  ],
  'Soğuk oda / depo': [
    { id: 'icten_acilma', l: 'İçeriden açılma mekanizması', z: 1 },
    { id: 'alarm', l: 'Alarm butonu', z: 1 },
    { id: 'termometre', l: 'Termometre', z: 0 },
    { id: 'istif', l: 'İstif düzeni', z: 0 }
  ],
  'LPG/doğalgaz hattı': [
    { id: 'vana', l: 'Vana erişimi', z: 1 },
    { id: 'gaz_alarm', l: 'Gaz alarm cihazı', z: 1 },
    { id: 'hortum', l: 'Hortum / bağlantılar', z: 1 },
    { id: 'havalandirma', l: 'Havalandırma', z: 1 }
  ],
  'Kazan dairesi': [
    { id: 'gaz_alarm', l: 'Gaz alarm cihazı', z: 1 },
    { id: 'baca', l: 'Baca bağlantısı', z: 1 },
    { id: 'vana', l: 'Acil kapama vanası', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'pano', l: 'Elektrik panosu', z: 0 }
  ],
  'Elektrik pano odası': [
    { id: 'kapak', l: 'Pano kapağı / kilit', z: 1 },
    { id: 'paspas', l: 'Yalıtım paspası', z: 1 },
    { id: 'yangin', l: 'CO2 yangın söndürücü', z: 1 },
    { id: 'sema', l: 'Tek hat şeması', z: 0 },
    { id: 'kacak', l: 'Kaçak akım rölesi (test - ölçüm gerektirir)', z: 0 }
  ],
  'Jeneratör / UPS': [
    { id: 'yakit', l: 'Yakıt sızıntı kontrolü', z: 1 },
    { id: 'egzoz', l: 'Egzoz / havalandırma', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 },
    { id: 'aku', l: 'Akü alanı', z: 0 }
  ],
  'Asansör makine dairesi': [
    { id: 'kilit', l: 'Yetkisiz giriş kilidi', z: 1 },
    { id: 'periyodik', l: 'Periyodik kontrol etiketi', z: 1 },
    { id: 'yangin', l: 'Yangın söndürücü', z: 1 }
  ],
  'Görüntüleme (radyasyon)': [
    { id: 'uyari', l: 'Radyasyon uyarı işaretleri', z: 1 },
    { id: 'kapi', l: 'Kapı kilidi / uyarı ışığı', z: 1 },
    { id: 'dozimetre', l: 'Dozimetre kullanımı', z: 0 }
  ],
  'Tıbbi atık deposu': [
    { id: 'zemin', l: 'Sızdırmaz zemin', z: 1 },
    { id: 'etiket', l: 'Etiketleme', z: 1 },
    { id: 'kilit', l: 'Kilit', z: 1 },
    { id: 'kkd', l: 'KKD', z: 0 }
  ],
  'Arşiv / depo': [
    { id: 'istif', l: 'İstif / raf düzeni', z: 1 },
    { id: 'yangin', l: 'Yangın yükü / söndürücü', z: 1 },
    { id: 'aydinlatma', l: 'Aydınlatma', z: 0 }
  ],
  'Soyunma / duşlar': [
    { id: 'zemin', l: 'Zemin kaymazlığı', z: 1 },
    { id: 'priz', l: 'Elektrik / priz IP koruması', z: 1 },
    { id: 'havalandirma', l: 'Havalandırma', z: 0 }
  ],
  'Cami / mescit': [
    { id: 'kacis', l: 'Kaçış yolları', z: 1 },
    { id: 'isitici', l: 'Elektrikli ısıtıcılar', z: 0 },
    { id: 'hali', l: 'Halı / yangın yükü', z: 0 }
  ]
};

function checklistAl(alanTipi) {
  return CHECKLISTLER[alanTipi] || [];
}

function eksikZorunlular(tespitler) {
  // Denetimde kullanılan her alan tipi için kapsanmamış zorunlu kareler
  const kapsanan = {};
  const kullanilan = new Set();
  for (const t of tespitler) {
    kullanilan.add(t.alanTipi);
    if (t.checklist) {
      (kapsanan[t.alanTipi] = kapsanan[t.alanTipi] || new Set()).add(t.checklist);
    }
  }
  const eksikler = [];
  for (const alan of kullanilan) {
    const liste = checklistAl(alan);
    const kap = kapsanan[alan] || new Set();
    const eks = liste.filter(i => i.z && !kap.has(i.id)).map(i => i.l);
    if (eks.length) eksikler.push({ alan, eksik: eks });
  }
  return eksikler;
}

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
    uygulama: 'ISG Saha Asistani v0.2 (AxonTR)',
    olusturma: new Date().toISOString(),
    denetim,
    tespitler,
    manifest: { tespitSayisi: tespitler.length, fotoSayisi: fotoAdlari.length, dosyalar: fotoAdlari }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { buildZip, crc32, slug, fotoDosyaAdi, konumNormalize, denetimJson, PROFILLER,
    ocrAdaylarUret, CHECKLISTLER, checklistAl, eksikZorunlular };
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
    sel.onchange = () => checklistPaneliniCiz();
    checklistPaneliniCiz();
  }

  // ---- Checklist rehberi ----
  async function checklistPaneliniCiz() {
    const alan = $('alanTipi').value;
    const liste = checklistAl(alan);
    const panel = $('checklistPanel');
    const sel = $('checklistMaddesi');
    sel.innerHTML = '<option value="">— Serbest tespit —</option>';
    if (!liste.length) { panel.style.display = 'none'; return; }
    const tespitler = aktifDenetim ? await hepsiniAl('tespitler', 'denetimId', aktifDenetim.id) : [];
    const kapsanan = new Set(tespitler.filter(t => t.alanTipi === alan && t.checklist).map(t => t.checklist));
    panel.style.display = 'block';
    const ul = $('checklistListe');
    ul.innerHTML = '';
    for (const i of liste) {
      const li = document.createElement('div');
      const tamam = kapsanan.has(i.id);
      li.className = 'cl-madde' + (tamam ? ' tamam' : '');
      li.textContent = (tamam ? '✅ ' : (i.z ? '⬜ ' : '◻️ ')) + i.l + (i.z ? '' : ' (ops.)');
      li.onclick = () => { sel.value = i.id; };
      ul.appendChild(li);
      const o = document.createElement('option');
      o.value = i.id; o.textContent = i.l;
      sel.appendChild(o);
    }
  }

  // ---- Foto ----
  const MAX_KENAR = 2000;

  async function fotoKucult(blob) {
    // Desteklenmeyen ortamda orijinali koru (asla veri kaybetme)
    try {
      if (typeof createImageBitmap !== 'function') return blob;
      const bmp = await createImageBitmap(blob);
      const oran = Math.min(1, MAX_KENAR / Math.max(bmp.width, bmp.height));
      if (oran >= 1) { bmp.close && bmp.close(); return blob; }
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * oran);
      c.height = Math.round(bmp.height * oran);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close && bmp.close();
      const kucuk = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
      return (kucuk && kucuk.size > 0) ? kucuk : blob;
    } catch (e) {
      return blob;
    }
  }

  async function fotoSec(ev) {
    const dosyalar = Array.from(ev.target.files || []);
    ev.target.value = '';
    for (const f of dosyalar) {
      const kucuk = await fotoKucult(f);
      bekleyenFotolar.push({ blob: kucuk });
    }
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
      checklist: $('checklistMaddesi').value || null,
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
    $('checklistMaddesi').value = '';
    await listeyiYenile();
    await checklistPaneliniCiz();
    await yedekHatirlat();
    bildirim('Tespit kaydedildi ✓');
  }

  // ---- OCR: kapı etiketi okuma ----
  let ocrStream = null;
  let ocrWorker = null;

  function tesseractYukle() {
    return new Promise((res, rej) => {
      if (window.Tesseract) return res();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Tesseract yüklenemedi — ilk kullanım internet gerektirir'));
      document.head.appendChild(s);
    });
  }

  async function ocrAc() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      uyari('Bu cihazda kamera erişimi desteklenmiyor.');
      return;
    }
    $('ocrModal').style.display = 'flex';
    $('ocrDurum').textContent = 'Etiketi çerçeveye hizalayın';
    $('ocrAdaylar').innerHTML = '';
    try {
      ocrStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }
      });
      $('ocrVideo').srcObject = ocrStream;
      await $('ocrVideo').play();
    } catch (e) {
      uyari('Kamera açılamadı: ' + e.message);
      ocrKapat();
    }
  }

  function ocrKapat() {
    if (ocrStream) { ocrStream.getTracks().forEach(t => t.stop()); ocrStream = null; }
    $('ocrModal').style.display = 'none';
  }

  function ocrOnIsle(video) {
    // Benchmark'la kilitlenen hat: orta bant kırp -> gri -> ortalama eşik -> 2x büyüt
    const vw = video.videoWidth, vh = video.videoHeight;
    const kw = Math.round(vw * 0.7), kh = Math.round(vh * 0.35);
    const kx = Math.round((vw - kw) / 2), ky = Math.round((vh - kh) / 2);
    const c = document.createElement('canvas');
    c.width = kw * 2; c.height = kh * 2;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(video, kx, ky, kw, kh, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    let toplam = 0;
    const gri = new Uint8Array(p.length / 4);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      const g = (p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114) | 0;
      gri[j] = g; toplam += g;
    }
    const esik = toplam / gri.length;
    for (let i = 0, j = 0; i < p.length; i += 4, j++) {
      const v = gri[j] > esik ? 255 : 0;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  async function ocrOku() {
    if (!ocrStream) return;
    $('ocrDurum').textContent = 'Okunuyor…';
    $('ocrAdaylar').innerHTML = '';
    try {
      await tesseractYukle();
      if (!ocrWorker) {
        ocrWorker = await window.Tesseract.createWorker('eng');
        await ocrWorker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ',
          tessedit_pageseg_mode: '6'
        });
      }
      const kare = ocrOnIsle($('ocrVideo'));
      const { data } = await ocrWorker.recognize(kare);
      const adaylar = ocrAdaylarUret(data.text || '');
      if (!adaylar.length) {
        $('ocrDurum').textContent = 'Kod bulunamadı — yaklaşın veya ışığı artırın, tekrar deneyin';
        return;
      }
      $('ocrDurum').textContent = 'Doğru olanı seçin:';
      const kap = $('ocrAdaylar');
      for (const a of adaylar) {
        const b = document.createElement('button');
        b.className = 'cip cip-buyuk';
        b.textContent = a;
        b.onclick = () => { $('konumKodu').value = a; ocrKapat(); bildirim('Konum: ' + a + ' ✓'); };
        kap.appendChild(b);
      }
    } catch (e) {
      $('ocrDurum').textContent = 'Hata: ' + e.message;
    }
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
        alanTipi: t.alanTipi, konumKodu: t.konumKodu, checklist: t.checklist || null,
        not: t.not, hayatiRisk: t.hayatiRisk, fotografsiz: t.fotografsiz,
        zaman: t.zaman, fotolar: adlar
      });
    }
    const json = denetimJson(aktifDenetim, tespitCikti, fotoAdlari);
    dosyalar.unshift({ name: 'denetim.json', data: new TextEncoder().encode(JSON.stringify(json, null, 2)) });
    return buildZip(dosyalar);
  }

  async function zipIndir(sonMu) {
    try {
      if (sonMu) {
        const tespitler = await hepsiniAl('tespitler', 'denetimId', aktifDenetim.id);
        const eksikler = eksikZorunlular(tespitler);
        if (eksikler.length) {
          const metin = eksikler.map(e => e.alan + ': ' + e.eksik.join(', ')).join('\n');
          if (!confirm('Eksik zorunlu kareler var:\n\n' + metin + '\n\nYine de bitirilsin mi?')) return;
        }
      }
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
    $('btnOcr').onclick = ocrAc;
    $('btnOcrOku').onclick = ocrOku;
    $('btnOcrKapat').onclick = ocrKapat;
    if (navigator.serviceWorker && navigator.serviceWorker.register) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
}
