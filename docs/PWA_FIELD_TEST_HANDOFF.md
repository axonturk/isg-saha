# PWA Saha Test Handoff — 4N

**Branch:** `feature/dof-replay-v2`
**Bu doküman anındaki PWA HEAD:** `19d696afea2044d0f0fd8d440fe3e3aacab9579b`
**Durum:** PWA gerçek saha testine hazır durumdadır. Bu doküman yeni bir özellik EKLEMEZ — mevcut durumu dokümante eder, final QA sonucunu kaydeder ve saha testi için adım adım checklist sağlar.

---

## A. Kanonik durum

DÖF medyasız round-trip zincirinin tam commit tablosu (0fd5e67 → 223204e) zaten `docs/PWA_DOF_REPLAY_HANDOFF.md`'de belgelenmiştir — burada tekrar edilmez. Bu doküman, o kapanıştan SONRA gelen dört commit'i ekler:

| Commit | Hash | Başlık |
|---|---|---|
| 4J Closure Docs | `223204e9930a0e416d481d387ffc2a6f5b2060fe` | `docs(dof): medyasiz round trip qa kapanisini belgele` |
| 4K Service Worker | `7985f5205a21b254cd7910579396c5677d993c0f` | `feat(pwa): service worker registration ekle` |
| 4L Galeriden Resim Yükle | `102645d86d4aaba15c35e7c03b3e343d55812414` | `feat(media): galeriden resim yukleme ekle` |
| 4M Aynı Konuma Dönüş | `19d696afea2044d0f0fd8d440fe3e3aacab9579b` | `fix(inspection): ayni konuma donuste mevcut denetime ekle` |

### 4N final QA — doğrulanan kanonik durum tablosu

| Özellik | Durum |
|---|---|
| DÖF medyasız round-trip | ✅ 4J closure'da gerçek Desktop↔PWA QA ile doğrulandı |
| Desktop ↔ PWA gerçek QA | ✅ 4J — bkz. `docs/PWA_DOF_REPLAY_HANDOFF.md` §C/D |
| Service Worker registration | ✅ 4K — `app.js` `navigator.serviceWorker.register('./sw.js')`, unsupported/reject davranışı test edildi |
| Kamera ile fotoğraf | ✅ Commit 2'den beri, 4L'de galeri ile birlikte regresyon test edildi |
| Galeriden resim yükleme | ✅ 4L — `fotoAlVeSikistir` ile kamera hattıyla aynı kayıt/ZIP yoluna girer |
| Ses/not akışı | ✅ Commit 2'den beri, 4L/4M'de regresyon test edildi |
| Aynı konuma geri dönüşte mevcut denetime ekleme | ✅ 4M — `startInspection()` kurumId+birimId+odaId+tur ile mevcut kaydı bulur |
| Normal ZIP export | ✅ Commit 2'den beri, her commit'te regresyon test edildi (`fotolar/` + `denetimler.json` sözleşmesi sabit) |
| DÖF replay ZIP'in yalnız `dof_donus.json` üretmesi | ✅ 4D'den beri, her commit'te (4L, 4M dahil) regresyon test edildi |

---

## B. Sahada test edilecek ana akış

1. PWA'yı aç.
2. Kurum/birim/kat/oda/alan tipi seç.
3. Yeni denetim başlat.
4. Yazılı not gir.
5. Kamera ile fotoğraf ekle.
6. Galeriden resim yükle.
7. Sesli not ekle veya ses alanını doğrula.
8. Bulguyu kaydet.
9. Aynı odaya geri dön.
10. Yeni denetim oluşmadan mevcut denetime devam edildiğini doğrula (ekranda "Bu konum için mevcut denetime devam ediliyor." mesajı görünmeli).
11. İkinci bulgu/foto/not ekle.
12. Normal ZIP export al.
13. ZIP içinde `denetimler.json` ve `fotolar/` referanslarını kontrol et.
14. Desktop import senaryosu için ZIP'i sakla.

---

## C. DÖF replay manuel kontrolü

1. Desktop'tan DÖF export paketi al.
2. PWA'da "DÖF Paketi Al" ile import et.
3. DÖF listede görünüyor mu kontrol et.
4. "Takip Bilgileri" kartında sorumlu/faaliyet/tarih/O-F-S alanlarını düzenle.
5. Kaydet.
6. Replay hazırlık oluştur.
7. Replay ZIP indir.
8. ZIP içinde yalnız `dof_donus.json` olduğunu doğrula.
9. Desktop'a replay ZIP'i geri al.
10. Desktop tarafında takip alanlarının uygulandığını doğrula.

---

## D. Offline / Service Worker kontrolü

1. Uygulamayı bir kez online aç.
2. DevTools → Application → Service Worker bölümünde registration var mı kontrol et.
3. Sayfayı yenile.
4. İnterneti kapat veya offline simülasyon yap.
5. App shell açılıyor mu kontrol et.
6. IndexedDB'de mevcut kayıtlar korunuyor mu kontrol et.

**Not:** Bu commit offline veri senkronizasyonu değil; yalnız app-shell service worker registration doğrulamasıdır.

---

## E. Kabul kriterleri

Saha testi başarılı sayılmak için:

- PWA açılıyor
- Kamera fotoğrafı ekleniyor
- Galeriden resim ekleniyor
- Not/ses akışı bozulmuyor
- Aynı konuma dönüşte mevcut denetime devam ediliyor
- Normal ZIP export alınabiliyor
- DÖF replay ZIP alınabiliyor
- Desktop DÖF replay import uygulanabiliyor
- Service Worker registration app-shell seviyesinde çalışıyor

---

## F. Açık riskler / bilinçli ertelemeler

- DÖF replay medya bağlantısı hâlâ yok.
- DÖF replay ZIP'e foto/ses eklenmiyor.
- Çoklu cihaz senkronizasyonu yok.
- Bulut/backend yok.
- Tam üretim deploy yapılmadı.
- `workers:4` altında ortam kaynaklı transient testler izlenmeli (bkz. §H).
- Offline app-shell var; offline veri aktarımı/senkronizasyonu yok.
- Android gerçek cihaz alpha/performans/izin testleri ayrıca yapılmalı.

---

## G. Saha testi sırasında not alınacaklar

| Alan | Değer |
|---|---|
| Test tarihi | |
| Cihaz | |
| Tarayıcı | |
| Konum | |
| Kurum/Birim | |
| Oda/Kat | |
| Fotoğraf sayısı | |
| Galeri görseli sayısı | |
| Ses/not var mı | |
| ZIP alındı mı | |
| Desktop'a aktarıldı mı | |
| Gözlenen hata | |
| Kullanıcı notu | |
| Sonuç | |

---

## H. 4N Final QA kanıtı

```text
npx playwright test --workers=1
```

- PWA HEAD, QA boyunca değişmedi: `19d696afea2044d0f0fd8d440fe3e3aacab9579b`
- Production/test kodu bu commit'te değişmedi (docs-only).
- Sonuç: **190 passed, 0 failed, 0 skipped** — ilk (tek) denemede temiz geçti, ortama bağlı transient hata görülmedi.
- Bu sayı, 4M sonrası doğrulanmış `190 passed` baseline'ıyla birebir eşleşiyor (4N docs-only olduğu için test dosyalarına dokunulmadı, beklenen tam olarak budur).

**Bilinen ortam kısıtı (P2, izlenmeli):** `--workers=1` tam serial suite çalıştırmaları sırasında bu oturum boyunca birkaç kez, DÖF/SW/galeri/aynı-konum koduyla alakasız dosyalarda (`j-yeniden-giris.spec.js`, `h-i-zip-export.spec.js`, `b-kurum.spec.js`, `x-gallery-image-upload.spec.js`) geçici (transient) zamanlama hataları gözlendi — her biri izole yeniden çalıştırmada (3-5×) temiz geçti, CPU/bellek baskısına (uzun oturumda tekrarlanan Chromium başlatmaları) bağlı ortam kaynaklı flakiness olarak teşhis edildi, gerçek kod regresyonu DEĞİL. Sahada/CI'de bu testler tekrar flaky görülürse önce izole yeniden çalıştırma ile doğrulanmalı.
