// PWA Commit 1 -- yalnız test altyapısı. Uygulama kodunu (app.js/index.html/
// sw.js/manifest.json) HİÇ değiştirmez -- statik dosyaları Python'ın kendi
// http.server'ıyla OLDUĞU GİBİ sunar (ekstra bağımlılık eklemeden).
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
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
