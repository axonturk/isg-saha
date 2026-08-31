// PWA Commit 1 -- yalnız test altyapısı. Uygulama kodunu (app.js/index.html/
// sw.js/manifest.json) HİÇ değiştirmez -- statik dosyaları Python'ın kendi
// http.server'ıyla OLDUĞU GİBİ sunar (ekstra bağımlılık eklemeden).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // PWA Commit 2: tam paralellikte (varsayılan -- CPU çekirdek sayısı kadar
  // worker, bu makinede 10+) gerçek Chromium örnekleri arasında CPU
  // rekabeti nedeniyle ARA SIRA zamanaşımı gözlendi (test mantığı DEĞİL,
  // kaynak rekabeti -- aynı testler izole/küçük gruplarda hep yeşil geçti).
  // Testleri tümüyle serial'e ZORLAMAK yerine (ticket'in kendi uyarısı),
  // kontrollü, sabit bir worker tavanı ile paralellik KORUNUR.
  workers: 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    // Faz 5g (2026-08-31): app.js artık ilk açılışta "Cihaz Eşleştirme"
    // ekranını gösterir (localStorage'da ISG_ESLESME bayrağı yoksa) --
    // bu SUITE'teki ~165 mevcut test `page.goto('/index.html')` sonrası
    // doğrudan screen-setup varsayıyor (zaten eşleşmiş bir cihazı temsil
    // ediyorlar). Her dosyayı tek tek localStorage seed etmek yerine
    // context başlangıcında (herhangi bir sayfa kodu çalışmadan ÖNCE)
    // varsayılan storageState ile bayrağı önceden yazıyoruz -- yalnız
    // ESLEŞTIRME akışını test eden dosya (tests/ba-cihaz-eslesme.spec.js)
    // kendi test.use({storageState:...}) ile bunu BOŞ localStorage'a
    // override eder.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4173',
          localStorage: [
            {
              name: 'ISG_ESLESME',
              value: JSON.stringify({
                paired: true,
                license_id: 'test-onceden-eslesmis',
                kapsam: 'test',
                cihaz_id: 'test-cihaz-varsayilan',
              }),
            },
          ],
        },
      ],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python -m http.server 4173',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  },
});
