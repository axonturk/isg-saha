// PWA Commit 3A -- IndexedDB v2->v4 migration karakterizasyonu ve veri
// koruma kanıtı. Gerçek `indexedDB` upgrade mekanizması kullanılır (mock
// YOK). Her senaryo öncesi veritabanı tamamen silinir, izole başlangıç
// durumu raw API ile kurulur, ardından GERÇEK app.js açılıp v4 upgrade'i
// tetiklenir.
// PWA Commit 4P (bilinçli güncelleme): DB_VERSION 4->5, yeni `dofKanitlari`
// store'u eklendi -- bu dosyadaki `versiyon`/`toBe(4)` beklentileri v5'e
// güncellendi, migration senaryolarının KENDİSİ (dofler şeması/verisi)
// değişmedi.
//
// Test paralelliği aynı origin'de DB çakışması yaratabileceği için bu
// dosya SERIAL çalışır (yalnız bu dosya -- ticket'in kendi izniyle,
// `workers: 4` global tavanı DEĞİŞTİRİLMEDİ).
const { test, expect } = require('@playwright/test');
const {
  dbTemizle, rawDbOlustur, rawStoreTumu, rawDbBilgisi, rawKayitEkle,
  V2_KURULUM_JS, V3_WIP_KURULUM_JS,
} = require('./migration-helpers');

test.describe.configure({ mode: 'serial' });

test.describe('L. IndexedDB v2->v4 migration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test.afterEach(async ({ page }) => {
    // app.js kendi indexedDB bağlantısını asla açıkça kapatmaz (uzun ömürlü
    // bağlantı) -- deleteDatabase() ancak sayfadan (dolayısıyla bağlantıdan)
    // AYRILDIKTAN sonra bloklanmadan tamamlanabilir.
    await page.goto('/tests/fixtures/blank.html');
    await dbTemizle(page);
  });

  test('Senaryo A -- temiz kurulum: hic veritabani yokken acilinca kanonik v4 semasi olusur', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const bilgi = await rawDbBilgisi(page);
    expect(bilgi.versiyon).toBe(5);
    expect(bilgi.storeAdlari).toEqual(['ayarlar', 'birimler', 'bulgular', 'denetimler', 'dofKanitlari', 'dofler', 'kurumlar']);
    expect(bilgi.doflerBilgisi).toMatchObject({
      keyPath: 'id',
      autoIncrement: false,
      indexNames: ['birimId', 'dofUuid'],
      birimIdUnique: false,
      dofUuidUnique: false,
    });

    const doflerKayitlari = await rawStoreTumu(page, 'dofler');
    expect(doflerKayitlari).toEqual([]);
  });

  test('Senaryo B -- gercek v2den v4e yukseltme: mevcut saha verisi kayipsiz korunur', async ({ page }) => {
    await rawDbOlustur(page, 2, V2_KURULUM_JS);

    const kurum = { id: 'kurum-1', ad: 'Test Kurumu', olusturma: '2026-01-01T00:00:00.000Z' };
    const birim = { id: 'birim-1', kurumId: 'kurum-1', ad: 'Test Birimi', tip: 'genel', katlar: ['Zemin'], odalar: [{ id: 'oda-1', kat: 'Zemin', alanTipi: 'Ofis', no: '1', ad: 'Ofis 1' }], ozelAlanlar: [], olusturma: '2026-01-01T00:00:00.000Z' };
    const denetim = { id: 'denetim-1', kurumId: 'kurum-1', birimId: 'birim-1', bina: 'Test Birimi', kat: 'Zemin', odaId: 'oda-1', oda: 'Ofis 1', alanTipi: 'Ofis', odaNo: '1', tur: 'saha', sorumlu: 'Ahmet', baslangic: '2026-01-01T00:00:00.000Z', guncelleme: '2026-01-01T00:00:00.000Z' };
    const bulgu = { id: 'bulgu-1', denetimId: 'denetim-1', metin: 'Migration öncesi bulgu.', fotolar: [], sesler: [], hayatiRisk: false, zaman: '2026-01-01T00:00:00.000Z' };
    const bulguFotolu = { id: 'bulgu-2', denetimId: 'denetim-1', metin: 'Fotoğraflı bulgu.', fotolar: [{ boyut: 123, genislik: 10, yukseklik: 10 }], sesler: [], hayatiRisk: false, zaman: '2026-01-01T00:00:01.000Z' };
    const ayar = { id: 'ozelTurler', degerler: ['ADEP'] };

    await rawKayitEkle(page, 'kurumlar', kurum);
    await rawKayitEkle(page, 'birimler', birim);
    await rawKayitEkle(page, 'denetimler', denetim);
    await rawKayitEkle(page, 'bulgular', bulgu);
    await rawKayitEkle(page, 'bulgular', bulguFotolu, { icerirBlob: true, blobAlani: '_test_fotoBlob' });
    await rawKayitEkle(page, 'ayarlar', ayar);

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const bilgi = await rawDbBilgisi(page);
    expect(bilgi.versiyon).toBe(5);
    expect(bilgi.storeAdlari).toContain('dofler');
    expect(bilgi.storeAdlari).toContain('dofKanitlari');
    expect(bilgi.doflerBilgisi.indexNames).toEqual(['birimId', 'dofUuid']);

    const kurumlarSonra = await rawStoreTumu(page, 'kurumlar');
    const birimlerSonra = await rawStoreTumu(page, 'birimler');
    const denetimlerSonra = await rawStoreTumu(page, 'denetimler');
    const bulgularSonra = await rawStoreTumu(page, 'bulgular');
    const ayarlarSonra = await rawStoreTumu(page, 'ayarlar');

    expect(kurumlarSonra).toEqual([kurum]);
    expect(birimlerSonra).toEqual([birim]);
    expect(denetimlerSonra).toEqual([denetim]);
    expect(ayarlarSonra).toEqual([ayar]);
    expect(bulgularSonra.length).toBe(2);

    // İlişkiler korunuyor.
    expect(birimlerSonra[0].kurumId).toBe(kurumlarSonra[0].id);
    expect(denetimlerSonra[0].birimId).toBe(birimlerSonra[0].id);
    expect(bulgularSonra.every((b) => b.denetimId === denetim.id)).toBe(true);

    // Blob içeren kayıt bozulmadı.
    const fotoluSonra = bulgularSonra.find((b) => b.id === 'bulgu-2');
    expect(fotoluSonra._test_fotoBlob).toBeTruthy();
    const blobBilgi = await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('isgSahaDB'); r.onsuccess = (e) => res(e.target.result); });
      const tx = db.transaction('bulgular', 'readonly');
      const kayit = await new Promise((res) => { const r = tx.objectStore('bulgular').get('bulgu-2'); r.onsuccess = () => res(r.result); });
      db.close();
      return { tur: kayit._test_fotoBlob.constructor.name, tip: kayit._test_fotoBlob.type, boyut: kayit._test_fotoBlob.size };
    });
    expect(blobBilgi.tur).toBe('Blob');
    expect(blobBilgi.tip).toBe('image/jpeg');
    expect(blobBilgi.boyut).toBeGreaterThan(0);

    // dofler başlangıçta boş.
    const doflerSonra = await rawStoreTumu(page, 'dofler');
    expect(doflerSonra).toEqual([]);
  });

  test('Senaryo C -- dirty WIP v3ten v4e yukseltme: WIP dofler kayitlari kayipsiz korunur, sahte kimlik uretilmez', async ({ page }) => {
    await rawDbOlustur(page, 3, V3_WIP_KURULUM_JS);

    // Gerçek WIP şeması (orijinal dirty worktree app.js:1769-1785'ten
    // salt-okunur incelenerek çıkarıldı) -- dofUuid/exportUuid/paketUuid/
    // baseStateHash/aktifTurSirasi HİÇBİRİ WIP'in kendi yazdığı kayıtta YOK.
    const wipKayit1 = {
      id: 'dof_101', dofId: 101, bulguKodu: 'B-1', tehlikeNo: 1,
      kurumId: 'kurum-wip', birimId: 'birim-wip', odaId: null,
      kat: 'Zemin', oda: 'Ofis', alanTipi: 'Ofis',
      tehlikeTanimi: 'Açık pano', riskDuzeyi: 'Yüksek Risk', r: 100,
      duzelticiFaaliyet: 'Kapak kapatılmalı', aksiyonSuresi: 'derhal',
      durum: 'bekliyor', sonuc: null, kontrolNotu: null,
      kontrolZamani: null, kontrolDenetimId: null, fotolar: [],
      yuklenme: '2026-07-06T10:00:00.000Z',
    };
    const wipKayit2 = {
      id: 'dof_102', dofId: 102, bulguKodu: 'B-2', tehlikeNo: 2,
      kurumId: 'kurum-wip', birimId: 'birim-wip', odaId: 'oda-wip-1',
      kat: '1.Kat', oda: 'Koridor', alanTipi: 'Koridor',
      tehlikeTanimi: 'Kablo dağınıklığı', riskDuzeyi: 'Orta Risk', r: 50,
      duzelticiFaaliyet: 'Kablo kanalı takılmalı', aksiyonSuresi: '1 hafta',
      durum: 'kontrol_edildi', sonuc: 'duzeldi', kontrolNotu: 'Düzeltildi.',
      kontrolZamani: '2026-07-06T12:00:00.000Z', kontrolDenetimId: 'denetim-wip-1',
      fotolar: [], yuklenme: '2026-07-06T10:05:00.000Z',
    };
    await rawKayitEkle(page, 'dofler', wipKayit1);
    await rawKayitEkle(page, 'dofler', wipKayit2);

    const oncekiBilgi = await rawDbBilgisi(page);
    expect(oncekiBilgi.versiyon).toBe(3);
    expect(oncekiBilgi.doflerBilgisi.indexNames).toEqual(['birimId']);   // dofUuid index'i HENÜZ yok

    await page.goto('/index.html');
    await expect(page.locator('#screen-setup')).toHaveClass(/active/);

    const bilgi = await rawDbBilgisi(page);
    expect(bilgi.versiyon).toBe(5);
    expect(bilgi.storeAdlari).toContain('dofler');
    expect(bilgi.storeAdlari).toContain('dofKanitlari');
    // birimId korunmuş, dofUuid yeni oluşturulmuş.
    expect(bilgi.doflerBilgisi.indexNames).toEqual(['birimId', 'dofUuid']);
    expect(bilgi.doflerBilgisi.dofUuidUnique).toBe(false);
    expect(bilgi.doflerBilgisi.keyPath).toBe('id');

    const doflerSonra = await rawStoreTumu(page, 'dofler');
    expect(doflerSonra.length).toBe(2);   // kayıt sayısı DEĞİŞMEDİ

    const kayit1Sonra = doflerSonra.find((d) => d.id === 'dof_101');
    const kayit2Sonra = doflerSonra.find((d) => d.id === 'dof_102');
    expect(kayit1Sonra).toBeTruthy();
    expect(kayit2Sonra).toBeTruthy();

    // Bilinen alanlar birebir aynı -- sahte kimlik ÜRETİLMEDİ.
    expect(kayit1Sonra).toEqual(wipKayit1);
    expect(kayit2Sonra).toEqual(wipKayit2);
    expect(kayit1Sonra.dofUuid).toBeUndefined();
    expect(kayit1Sonra.exportUuid).toBeUndefined();
    expect(kayit1Sonra.paketUuid).toBeUndefined();
    expect(kayit1Sonra.baseStateHash).toBeUndefined();
    expect(kayit1Sonra.aktifTurSirasi).toBeUndefined();
    expect(kayit2Sonra.dofUuid).toBeUndefined();

    // dofUuid alanı olmayan kayıtlar dofUuid index'inde HİÇ görünmez (bu
    // NORMAL -- migration'ı bozmadığının kanıtı: index sorgusu hata
    // vermeden boş döner).
    const dofUuidIndeksKayitlari = await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('isgSahaDB'); r.onsuccess = (e) => res(e.target.result); });
      const tx = db.transaction('dofler', 'readonly');
      const sonuc = await new Promise((res, rej) => {
        const r = tx.objectStore('dofler').index('dofUuid').getAll();
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      db.close();
      return sonuc;
    });
    expect(dofUuidIndeksKayitlari).toEqual([]);

    // birimId index'i üzerinden gerçek sorgu hâlâ çalışıyor (mevcut index korunmuş).
    const birimIdSorgusu = await page.evaluate(async () => {
      const db = await new Promise((res) => { const r = indexedDB.open('isgSahaDB'); r.onsuccess = (e) => res(e.target.result); });
      const tx = db.transaction('dofler', 'readonly');
      const sonuc = await new Promise((res, rej) => {
        const r = tx.objectStore('dofler').index('birimId').getAll('birim-wip');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      db.close();
      return sonuc.length;
    });
    expect(birimIdSorgusu).toBe(2);
  });
});
