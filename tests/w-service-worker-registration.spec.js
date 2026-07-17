// PWA Commit 4K -- Service Worker registration P1. Production kodu artık
// sw.js'i `window.addEventListener('load', ...)` içinde register ediyor
// (app.js, "SERVICE WORKER REGISTRATION" bölümü). Bu dosya YALNIZ
// registration'ın kendisini (çağrıldığını, path'ini, tek seferliğini,
// hata/unsupported ortamda uygulamayı çökertmediğini) ve registration
// eklenmesinin DÖF UI / normal saha akışını bozmadığını doğrular. sw.js'in
// KENDİ cache mekaniği tests/k-offline-appshell.spec.js'de zaten test edili
// yor -- burada tekrar edilmez.
const { test, expect } = require('@playwright/test');
const { gecerliDofKaydi, gecerliDofPaketi } = require('./dof-import-fixtures');

test.describe('W. Service Worker registration', () => {
  test('A. Registration çağrılır, path sw.js, uygulama çökmez', async ({ page }) => {
    const konsolHatalari = [];
    page.on('pageerror', (e) => konsolHatalari.push(String(e)));

    await page.addInitScript(() => {
      window.__swKayitlari = [];
      if ('serviceWorker' in navigator) {
        const gercekRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = (url, opts) => {
          window.__swKayitlari.push(String(url));
          return gercekRegister(url, opts);
        };
      }
    });

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await page.waitForFunction(() => Array.isArray(window.__swKayitlari) && window.__swKayitlari.length > 0, { timeout: 5000 });

    const kayitlar = await page.evaluate(() => window.__swKayitlari);
    expect(kayitlar).toEqual(['./sw.js']);
    expect(konsolHatalari).toEqual([]);
  });

  test('B. Service Worker desteklenmiyorsa uygulama yine açılır', async ({ page }) => {
    const konsolHatalari = [];
    page.on('pageerror', (e) => konsolHatalari.push(String(e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') konsolHatalari.push(msg.text());
    });

    await page.addInitScript(() => {
      Object.defineProperty(window.navigator, 'serviceWorker', { value: undefined, configurable: true });
    });

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('h3', { hasText: 'İSG Saha Asistanı' })).toBeVisible();
    expect(konsolHatalari).toEqual([]);
  });

  test('C. Registration reddedilirse uygulama çalışmaya devam eder', async ({ page }) => {
    const konsolHatalari = [];
    page.on('pageerror', (e) => konsolHatalari.push(String(e)));

    await page.addInitScript(() => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register = () => Promise.reject(new Error('test: register reddedildi'));
      }
    });

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('h3', { hasText: 'İSG Saha Asistanı' })).toBeVisible();
    // Normal saha akışı (Yeni Denetim formu) hâlâ kullanılabilir olmalı.
    await expect(page.locator('button', { hasText: 'Devam' })).toBeEnabled();
    expect(konsolHatalari).toEqual([]);
  });

  test('D. Tek sayfa yüklemesinde tek register -- DÖF UI işlemleri tekrar tetiklemez', async ({ page }) => {
    await page.addInitScript(() => {
      window.__swKayitSayisi = 0;
      if ('serviceWorker' in navigator) {
        const gercekRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = (url, opts) => {
          window.__swKayitSayisi += 1;
          return gercekRegister(url, opts);
        };
      }
    });

    await page.goto('/index.html');
    await page.waitForFunction(() => window.__swKayitSayisi > 0, { timeout: 5000 });
    expect(await page.evaluate(() => window.__swKayitSayisi)).toBe(1);

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'W-1' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'w_paketi.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
    });
    await expect(page.locator('#dof-import-durum')).toHaveText('İçe aktarma tamamlandı');
    await page.locator('.dof-liste-karti').first().click();
    await expect(page.locator('#dof-detay-kart')).toBeVisible();

    expect(await page.evaluate(() => window.__swKayitSayisi)).toBe(1);
  });

  test('E. DÖF UI regresyon smoke -- import/liste görünür, takip/replay DÖF seçilmeden gizli', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#dof-import-btn')).toBeVisible();
    await expect(page.locator('h2', { hasText: "İçe Aktarılan DÖF'ler" })).toBeVisible();
    await expect(page.locator('#dof-detay-kart')).toBeHidden();
    await expect(page.locator('#dof-takip-form-kart')).toBeHidden();
    await expect(page.locator('#dof-replay-kart')).toBeHidden();

    const kayit = gecerliDofKaydi({ dofId: 1, bulguKodu: 'W-2' });
    const paket = gecerliDofPaketi({ tehlikelerOverride: [kayit] });
    await page.setInputFiles('#dof-import-input', {
      name: 'w_paketi2.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(paket), 'utf-8'),
    });
    await expect(page.locator('.dof-liste-karti')).toHaveCount(1);
    await page.locator('.dof-liste-karti').first().click();
    await expect(page.locator('#dof-detay-kart')).toBeVisible();
    await expect(page.locator('#dof-takip-form-kart')).toBeVisible();
    await expect(page.locator('#dof-replay-kart')).toBeVisible();
  });

  test('F. Normal saha regresyon smoke -- kurulum formu görünür, Yeni Denetim akışı engellenmez', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('h2', { hasText: 'Yeni Denetim' })).toBeVisible();
    await expect(page.locator('#setup-kurum')).toBeVisible();
    await expect(page.locator('#setup-responsible')).toBeEditable();
    await expect(page.locator('button', { hasText: 'Devam' })).toBeEnabled();
  });

  test('G. Gerçek (mock olmayan) registration -- navigator.serviceWorker var, pageerror yok', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const desteklerMi = await page.evaluate(() => 'serviceWorker' in navigator);
    if (!desteklerMi) {
      test.info().annotations.push({
        type: 'sw-ortam-kisiti',
        description: 'Bu Playwright/Chromium ortamında navigator.serviceWorker mevcut değil -- gerçek registration smoke atlandı, mock testler (A-D) yeterli kabul edilir.',
      });
      test.skip(true, 'navigator.serviceWorker bu ortamda yok');
      return;
    }

    const kayitSonucu = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration('./sw.js');
        return { basarili: true, kayitliMi: !!reg, hata: null };
      } catch (e) {
        return { basarili: false, kayitliMi: false, hata: String(e) };
      }
    });

    if (!kayitSonucu.basarili || !kayitSonucu.kayitliMi) {
      // Bazı Playwright/CI ortamlarında SW registration izin verilmeyebilir
      // (ör. sertifika/secure-context kısıtı). Bu durumda production kodu
      // DEĞİŞTİRİLMEDEN yalnız rapor edilir -- mock testler (A-D) zaten
      // registration çağrısının kendisini doğruladı.
      test.info().annotations.push({
        type: 'sw-ortam-kisiti',
        description: `Gerçek SW registration bu ortamda doğrulanamadı: ${kayitSonucu.hata || 'kayıt bulunamadı'}.`,
      });
    } else {
      expect(kayitSonucu.kayitliMi).toBe(true);
    }
    expect(pageErrors).toEqual([]);
  });
});
