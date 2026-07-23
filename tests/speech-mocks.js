// PWA "Sesle Yaz" (Oda/Mahal/Konum Kodu) -- yalnız test yardımcıları.
// `SpeechRecognition`/`webkitSpeechRecognition` GERÇEK bir tarayıcı motoru
// (çoğunlukla buluta bağlı) gerektirir -- headless Chromium'da gerçek
// mikrofon/STT KULLANILMAZ (media-mocks.js'teki sentetik-ama-canlı
// MediaStream tekniğinin STT için bir eşdeğeri yok, sonuç bir kara kutu).
// Bu yüzden burada üretim kodunun (`window.SpeechRecognition`/
// `window.webkitSpeechRecognition`) beklediği ARAYÜZÜ (start/abort/stop +
// onstart/onresult/onerror/onend) birebir taklit eden bir STUB sınıf
// kullanılıyor -- testler `window.__sonSesTanimaOrnegi` (en son örnek) veya
// `window.__tumSesTanimaOrnekleri[i]` (indeksle, ESKİ bir örneğe erişmek
// için -- Codex P2 stale-callback senaryoları) üzerinden bu örneklerin
// callback'lerini elle tetikleyerek senaryo kurar.
//
// Codex NEEDS_FIX (P2) sonrası eklendi: `abort()` VARSAYILAN olarak hâlâ
// SENKRON `onend` tetikler (geriye dönük uyumlu -- mevcut 12 test ve genel
// "hemen durur" davranışı bunu varsayıyor). Bir örneği `_gecikmeliOnEndAc()`
// ile "gecikmeli" moda almak, `abort()`'un `onend`'i OTOMATİK tetiklemesini
// durdurur -- test daha sonra `_onEndTetikle()`'yi ELLE çağırarak gerçek
// dünyadaki "abort edildi ama motorun onend'i geç geldi" durumunu taklit
// edebilir (bu sırada YENİ bir recognition zaten başlamış olabilir).

/** Sayfa yüklenmeden ÖNCE sahte bir SpeechRecognition sınıfı kurar.
 * Her `new` çağrısı `window.__sonSesTanimaOrnegi`'ye atanır VE
 * `window.__tumSesTanimaOrnekleri` dizisine eklenir (oluşturulma sırasıyla,
 * index 0 = ilk örnek). `start()` çağrı sayısı
 * `window.__sesTanimaBaslatildiSayaci`'da tutulur -- üçüncü/gereksiz bir
 * örneğin YANLIŞLIKLA başlatılmadığını doğrulamak için kullanılır. */
async function sahteSesTanimaKur(page) {
  await page.addInitScript(() => {
    class SahteSpeechRecognition {
      constructor() {
        this.lang = '';
        this.interimResults = null;
        this.maxAlternatives = null;
        this.onstart = null;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this._durduruldu = false;
        this._gecikmeliOnEnd = false;
        window.__tumSesTanimaOrnekleri = window.__tumSesTanimaOrnekleri || [];
        window.__tumSesTanimaOrnekleri.push(this);
        window.__sonSesTanimaOrnegi = this;
      }
      start() {
        this._durduruldu = false;
        window.__sesTanimaBaslatildiSayaci = (window.__sesTanimaBaslatildiSayaci || 0) + 1;
        if (this.onstart) this.onstart();
      }
      abort() {
        if (this._durduruldu) return;
        this._durduruldu = true;
        if (this._gecikmeliOnEnd) return;   // testin _onEndTetikle() ile elle tetiklemesi bekleniyor
        if (this.onend) this.onend();
      }
      stop() {
        this.abort();
      }
      // Gerçek dünyada "abort edildi ama motorun onend'i GEÇ geldi" --
      // testin elle çağırdığı, gecikmiş/stale callback simülasyonu.
      _onEndTetikle() {
        if (this.onend) this.onend();
      }
      _onErrorTetikle(hataKodu) {
        if (this.onerror) this.onerror({ error: hataKodu });
      }
    }
    window.SpeechRecognition = SahteSpeechRecognition;
    window.webkitSpeechRecognition = SahteSpeechRecognition;
  });
}

/** Sayfa yüklenmeden ÖNCE ses tanıma DESTEĞİNİ kaldırır (gerçek Chromium
 * `webkitSpeechRecognition`'ı siler) -- "desteklenmiyor" yolunu test etmek
 * için. */
async function sesTanimaDesteginiKaldir(page) {
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
}

/** En son oluşturulan sahte recognition örneğinde `onresult`'u verilen
 * transcript ile tetikler (gerçek `SpeechRecognitionEvent` şeklini taklit
 * eder: `results[0][0].transcript`). Boş transcript (P1 testi) için
 * `transcript: ''` verilebilir. */
async function sesTanimaSonucVer(page, transcript) {
  await page.evaluate((t) => {
    const r = window.__sonSesTanimaOrnegi;
    if (!r || !r.onresult) throw new Error('Aktif sahte SpeechRecognition örneği/onresult yok.');
    r.onresult({ results: [[{ transcript: t }]] });
  }, transcript);
}

/** En son oluşturulan sahte recognition örneğinde `onerror`'u tetikler. */
async function sesTanimaHataVer(page, hataKodu = 'network') {
  await page.evaluate((kod) => {
    const r = window.__sonSesTanimaOrnegi;
    if (!r || !r.onerror) throw new Error('Aktif sahte SpeechRecognition örneği/onerror yok.');
    r.onerror({ error: kod });
  }, hataKodu);
}

/** Belirtilen indeksteki (0 = ilk oluşturulan) örneği "gecikmeli onend"
 * moduna alır -- bu örnekte `abort()`/`stop()` artık `onend`'i OTOMATİK
 * tetiklemez, `sesTanimaOrnekOnEndTetikle` ile elle tetiklenmesi gerekir. */
async function sesTanimaOrnekGecikmeliYap(page, index) {
  await page.evaluate((i) => {
    const orn = window.__tumSesTanimaOrnekleri && window.__tumSesTanimaOrnekleri[i];
    if (!orn) throw new Error(`SpeechRecognition örneği bulunamadı: index ${i}`);
    orn._gecikmeliOnEnd = true;
  }, index);
}

/** Belirtilen indeksteki örneğin `onend`'ini ELLE tetikler (gecikmeli/stale
 * callback simülasyonu). */
async function sesTanimaOrnekOnEndTetikle(page, index) {
  await page.evaluate((i) => {
    const orn = window.__tumSesTanimaOrnekleri && window.__tumSesTanimaOrnekleri[i];
    if (!orn) throw new Error(`SpeechRecognition örneği bulunamadı: index ${i}`);
    orn._onEndTetikle();
  }, index);
}

/** Belirtilen indeksteki örneğin `onerror`'ünü ELLE tetikler (stale
 * callback simülasyonu). */
async function sesTanimaOrnekOnErrorTetikle(page, index, hataKodu = 'network') {
  await page.evaluate(({ i, kod }) => {
    const orn = window.__tumSesTanimaOrnekleri && window.__tumSesTanimaOrnekleri[i];
    if (!orn) throw new Error(`SpeechRecognition örneği bulunamadı: index ${i}`);
    orn._onErrorTetikle(kod);
  }, { i: index, kod: hataKodu });
}

/** Şu ana kadar oluşturulan TOPLAM SpeechRecognition örneği sayısı --
 * "gereksiz üçüncü örnek oluşmadı" gibi kontroller için. */
async function sesTanimaOrnekSayisi(page) {
  return page.evaluate(() => (window.__tumSesTanimaOrnekleri || []).length);
}

module.exports = {
  sahteSesTanimaKur, sesTanimaDesteginiKaldir, sesTanimaSonucVer, sesTanimaHataVer,
  sesTanimaOrnekGecikmeliYap, sesTanimaOrnekOnEndTetikle, sesTanimaOrnekOnErrorTetikle, sesTanimaOrnekSayisi,
};
