// v32 (2026-09-08 dis inceleme B08 duzeltmesi): checklist-kutuphanesi.js/
// kritik-kontrol-kutuphanesi.js/vendor/jsqr.min.js index.html'den <script
// src> ile yukleniyordu ama DOSYALAR'da YOKTU -- cevrimdisi ilk/yeniden
// acilista bu dosyalar `undefined` kaliyor, Hizli Kritik Kontrol ve QR
// tarama tamamen devre disi kaliyordu. Surum artirimi ZORUNLU: mevcut
// kurulumlarin yeni service worker'i alip onbellegi yenilemesi icin.
const CACHE = 'isg-saha-v32';
const RUNTIME = 'isg-saha-runtime-v1';
const DOSYALAR = ['./index.html', './app.js', './manifest.json', './icon-192.png',
  './icon-512.png', './checklist-kutuphanesi.js', './kritik-kontrol-kutuphanesi.js',
  './vendor/jsqr.min.js'];
// OCR bağımlılıkları (tesseract.js) + ikon fontu ilk kullanımda buradan iner, sonra offline çalışır
const RUNTIME_HOSTLAR = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com', 'unpkg.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DOSYALAR)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k.startsWith('isg-saha-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (RUNTIME_HOSTLAR.some(h => url.hostname.includes(h))) {
    // cache-first + dinamik ekleme: OCR dosyaları bir kez iner, hep önbellekten okunur
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(cevap => {
        if (cevap && cevap.status === 200) {
          const kopya = cevap.clone();
          caches.open(RUNTIME).then(c => c.put(e.request, kopya));
        }
        return cevap;
      }))
    );
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
