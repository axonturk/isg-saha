// PWA Commit 2 -- yalnız test yardımcıları. `getUserMedia`/`MediaRecorder`
// GERÇEK tarayıcı API'leridir (mock/stub üretim koduna EKLENMEZ) -- burada
// yalnız fiziksel kamera/mikrofon donanımı yerine SENTETİK ama GERÇEK
// (canlı) bir MediaStream üretilir (kanvas -> video track, AudioContext ->
// ses track'i). Bu, gerçek getUserMedia() sözleşmesini (Promise<MediaStream>)
// birebir taklit eden, headless Chromium'da standart bir test tekniğidir.

/** Sayfa yüklenmeden ÖNCE `navigator.mediaDevices.getUserMedia`'yı GERÇEK,
 * canlı bir video MediaStream'e (kanvas kaynaklı) yönlendirir. */
async function sahteKameraKur(page) {
  await page.addInitScript(() => {
    const orijinalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (kisitlar) => {
      if (kisitlar && kisitlar.video) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        let renk = 0;
        const cizimAraligi = setInterval(() => {
          renk = (renk + 5) % 255;
          ctx.fillStyle = `rgb(${renk},80,150)`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }, 100);
        const stream = canvas.captureStream(10);
        stream.getTracks().forEach((t) => {
          const orijinalStop = t.stop.bind(t);
          t.stop = () => { clearInterval(cizimAraligi); orijinalStop(); };
        });
        return stream;
      }
      return orijinalGetUserMedia(kisitlar);
    };
  });
}

/** Sayfa yüklenmeden ÖNCE `navigator.mediaDevices.getUserMedia`'yı GERÇEK,
 * canlı bir ses MediaStream'ine (AudioContext osilatör kaynaklı) yönlendirir
 * -- `MediaRecorder` bu track'ten GERÇEK WebM Blob üretir. */
async function sahteMikrofonKur(page) {
  await page.addInitScript(() => {
    const orijinalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (kisitlar) => {
      if (kisitlar && kisitlar.audio) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const kazanc = ctx.createGain();
        kazanc.gain.value = 0.0001;   // duyulamaz ama GERÇEK, canlı sinyal
        const hedef = ctx.createMediaStreamDestination();
        osc.connect(kazanc).connect(hedef);
        osc.start();
        const stream = hedef.stream;
        stream.getTracks().forEach((t) => {
          const orijinalStop = t.stop.bind(t);
          t.stop = () => { osc.stop(); orijinalStop(); };
        });
        return stream;
      }
      return orijinalGetUserMedia(kisitlar);
    };
  });
}

module.exports = { sahteKameraKur, sahteMikrofonKur };
