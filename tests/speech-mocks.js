// PWA "Sesle Yaz" (Oda/Mahal/Konum Kodu) -- yalnız test yardımcıları.
// `SpeechRecognition`/`webkitSpeechRecognition` GERÇEK bir tarayıcı motoru
// (çoğunlukla buluta bağlı) gerektirir -- headless Chromium'da gerçek
// mikrofon/STT KULLANILMAZ (media-mocks.js'teki sentetik-ama-canlı
// MediaStream tekniğinin STT için bir eşdeğeri yok, sonuç bir kara kutu).
// Bu yüzden burada üretim kodunun (`window.SpeechRecognition`/
// `window.webkitSpeechRecognition`) beklediği ARAYÜZÜ (start/abort/stop +
// onstart/onresult/onerror/onend) birebir taklit eden bir STUB sınıf
// kullanılıyor -- testler `window.__sonSesTanimaOrnegi` üzerinden bu
// örneğin callback'lerini elle tetikleyerek senaryo kurar.

/** Sayfa yüklenmeden ÖNCE sahte bir SpeechRecognition sınıfı kurar.
 * Her `new` çağrısı `window.__sonSesTanimaOrnegi`'ye atanır (testin en son
 * oluşturulan örneğe erişmesi için) ve `start()` çağrı sayısını
 * `window.__sesTanimaBaslatildiSayaci`'da tutar. */
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
        if (this.onend) this.onend();
      }
      stop() {
        this.abort();
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
 * eder: `results[0][0].transcript`). */
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

module.exports = { sahteSesTanimaKur, sesTanimaDesteginiKaldir, sesTanimaSonucVer, sesTanimaHataVer };
