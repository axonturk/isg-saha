const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const swMetni = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test.describe('Z. Service Worker cache upgrade', () => {
  test('app-shell cache surumu v19 olarak yenilenmistir', () => {
    expect(swMetni).toContain("const CACHE = 'isg-saha-v19';");
    expect(swMetni).not.toContain("const CACHE = 'isg-saha-v18';");
  });

  test('yeni cache temel app-shell dosyalarini install asamasinda doldurur', () => {
    expect(swMetni).toContain("'./index.html'");
    expect(swMetni).toContain("'./app.js'");
    expect(swMetni).toContain("'./manifest.json'");
    expect(swMetni).toMatch(/caches\.open\(CACHE\).*addAll\(DOSYALAR\)/s);
  });

  test('activate eski app-shell cachelerini siler ve runtime cachei korur', () => {
    expect(swMetni).toMatch(/k\.startsWith\('isg-saha-'\) && k !== CACHE && k !== RUNTIME/);
    expect(swMetni).toMatch(/caches\.delete\(k\)/);
    expect(swMetni).toContain("const RUNTIME = 'isg-saha-runtime-v1';");
  });

  test('service worker IndexedDB veya ZIP akisina dokunmaz', () => {
    expect(swMetni).not.toMatch(/indexedDB|dof_donus|denetimler\.json|fotolar\//);
  });
});
