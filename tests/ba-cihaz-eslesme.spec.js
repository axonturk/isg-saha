// Faz 5g (2026-08-31) -- PWA tarafi "Cihaz Eslestirme" ilk acilis ekrani.
// Ag cagrisini (page.route ile) mockluyoruz, gercek Supabase'e HIC
// baglanilmiyor. Desktop tarafinin isg_denetim/isg_supabase.py::pwa_aktive_et
// + ISG_LISANS_MESAJLARI ile ayni sozlesmeyi (RPC body sekli, hata
// mesaj metni) dogruluyor. Kamera/jsQR akisi (QR Tara butonu) bu dosyada
// TEST EDILMEDI -- gercek bir QR goruntusu uretmek pratik degil (bkz.
// tests/q-qr-aktarim.spec.js'in ayni gerekcesi); QR dali _qrTaramaDongusu
// icinde manuel akisla AYNI _eslesmeIsle/eslesmeKoduGonder fonksiyonlarini
// cagirir, bu yuzden manuel yoldaki testler o cekirdek mantigi da kapsar.
const { test, expect } = require('@playwright/test');

const RPC_URL = '**/rest/v1/rpc/isg_pwa_aktive_et';

test.describe('BA. Cihaz Eşleştirme -- eşleşmemiş cihaz', () => {
  // Proje varsayılan storageState'i (playwright.config.js) ISG_ESLESME
  // bayrağını ÖNCEDEN yazıyor (mevcut ~165 test "zaten eşleşmiş cihaz"
  // varsayımıyla yazıldığı için) -- bu describe bloğu, gerçek ilk-açılış
  // senaryosunu test etmek için localStorage'ı boş context ile başlatır.
  // `serviceWorkers: 'block'` -- sw.js'nin KENDİ fetch handler'ı (satır 30,
  // production kodu, DOKUNULMADI) TÜM istekleri kendi worker'ı üzerinden
  // ağa çıkarıyor; bu, page.route()'un yakalayamadığı AYRI bir network
  // katmanı (gerçek cihazda doğru davranış, ama page.route mock'unu
  // atlayıp gerçek bir DNS hatasına düşürüyor) -- yalnız BU testlerin
  // ağ-mock'unu güvenilir kılmak için context bazında kapatıldı.
  test.use({ storageState: { cookies: [], origins: [] }, serviceWorkers: 'block' });

  test('1. localStorage bos iken screen-cihaz-eslesme acilir, RPCye load aninda hic istek gitmez', async ({ page }) => {
    let istekGeldiMi = false;
    await page.route(RPC_URL, (route) => {
      istekGeldiMi = true;
      route.continue();
    });

    await page.goto('/index.html');

    await expect(page.locator('#screen-cihaz-eslesme')).toHaveClass(/active/);
    await expect(page.locator('#screen-setup')).not.toHaveClass(/active/);
    expect(istekGeldiMi).toBe(false);
  });

  test('2. basarili manuel kod girisi ISG_ESLESME yazar, reload sonrasi screen-setup acilir', async ({ page }) => {
    await page.route(RPC_URL, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          license_id: 'lic-test-1',
          kapsam: 'tam',
          slot_kullanilan: 1,
          slot_toplam: 3,
        }),
      });
    });

    await page.goto('/index.html');
    await expect(page.locator('#screen-cihaz-eslesme')).toHaveClass(/active/);

    await page.fill('#eslesme-kod-girdi', 'A1B2C3D4');
    await page.click('button[onclick="eslesmeManuelGonder()"]');

    // eslesmeManuelGonder basarida location.reload() cagirir -- sayfa
    // yeniden yuklenip load listener'i yeniden tetikler, bayrak artik
    // yazili oldugundan screen-setup acilir.
    await page.waitForFunction(() => {
      const el = document.getElementById('screen-setup');
      return !!(el && el.classList.contains('active'));
    }, { timeout: 10000 });

    const eslesme = await page.evaluate(() => JSON.parse(localStorage.getItem('ISG_ESLESME')));
    expect(eslesme.paired).toBe(true);
    expect(eslesme.license_id).toBe('lic-test-1');
    expect(eslesme.kapsam).toBe('tam');

    const cihazId = await page.evaluate(() => localStorage.getItem('ISG_CIHAZ_ID'));
    expect(cihazId).toBeTruthy();
  });

  test('3. kod_suresi_doldu hatasi Desktop mesaji ile BIREBIR ekrana yazilir, ekran degismez', async ({ page }) => {
    await page.route(RPC_URL, (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'kod_suresi_doldu hatasi olustu' }),
      });
    });

    await page.goto('/index.html');
    await page.fill('#eslesme-kod-girdi', 'A1B2C3D4');
    await page.click('button[onclick="eslesmeManuelGonder()"]');

    // isg_denetim/isg_supabase.py::ISG_LISANS_MESAJLARI["kod_suresi_doldu"]
    // ile BIREBIR/VERBATIM (app.js::ISG_LISANS_MESAJLARI_JS'e oradan
    // kopyalandi -- bkz. o dosyanin satir ~284).
    const beklenenMesaj = 'Kodun 10 dakikalık geçerlilik süresi doldu. Masaüstünden yeni '
      + 'bir kod üretip hemen ardından tekrar okutun.';
    await expect(page.locator('#eslesme-durum')).toHaveText(beklenenMesaj);
    await expect(page.locator('#screen-cihaz-eslesme')).toHaveClass(/active/);

    const eslesme = await page.evaluate(() => localStorage.getItem('ISG_ESLESME'));
    expect(eslesme).toBeNull();
  });

  test('5. eslesmeKoduGecerliMi 8 haneli hex kabul eder, kisaKodGecerliMi ile format cakismasi yoktur', async ({ page }) => {
    await page.goto('/index.html');
    const sonuc = await page.evaluate(() => ({
      eslesmeGecerli: window.eslesmeKoduGecerliMi('ABCD1234'),
      kisaKodGecerli: window.kisaKodGecerliMi('ABCD1234'),
    }));
    expect(sonuc.eslesmeGecerli).toBe(true);
    expect(sonuc.kisaKodGecerli).toBe(false);
  });
});

test.describe('BA. Cihaz Eşleştirme -- önceden eşleşmiş cihaz', () => {
  // Bu describe blok icin ozel bir storageState VERILMEDI -- projenin
  // varsayilan storageState'i (playwright.config.js) zaten ISG_ESLESME
  // bayragini paired:true ile yaziyor, bu da suitedeki ~165 diger testin
  // varsaydigi "zaten eslesmis cihaz" durumunu birebir temsil ediyor.
  test.use({ serviceWorkers: 'block' });

  test('4. ISG_ESLESME onceden seedliyse dogrudan screen-setup acilir, RPCye hic istek gitmez', async ({ page }) => {
    let istekGeldiMi = false;
    await page.route(RPC_URL, (route) => {
      istekGeldiMi = true;
      route.continue();
    });

    await page.goto('/index.html');

    await expect(page.locator('#screen-setup')).toHaveClass(/active/);
    await expect(page.locator('#screen-cihaz-eslesme')).not.toHaveClass(/active/);
    expect(istekGeldiMi).toBe(false);
  });
});
