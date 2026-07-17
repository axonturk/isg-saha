# PWA DÖF Replay — Medyasız Round-Trip MVP Handoff

**Branch:** `feature/dof-replay-v2`
**Bu doküman anındaki PWA HEAD:** `e7e4cd60422c50ffe38cc11324cec973501220d3`
**Bu doküman anındaki Desktop (isg_denetim) HEAD:** `5946612`
**Durum:** Medyasız DÖF round-trip MVP, gerçek Desktop ↔ PWA QA ile doğrulanmış test uygulaması seviyesindedir.

---

## A. PWA DÖF medyasız round-trip MVP durumu

Aşağıdaki zincir **gerçek** Desktop çıktısı ve **gerçek** PWA (Chromium, gerçek IndexedDB, mock yok) ile uçtan uca doğrulandı:

```text
Desktop gerçek DÖF export (dof_islemleri.dof_disa_aktar)
→ PWA JSON import UI
→ PWA DÖF liste/detay
→ PWA takip düzenleme (yalnız izinli 8 alan)
→ PWA replay hazırlık (submissionUuid üretimi)
→ PWA medyasız replay ZIP download
→ Desktop replay ZIP kabul (dof_replay_zip_kabul_et)
→ Desktop replay apply (dof_replay_import_uygula)
→ takip alanları Desktop dofler tablosunda doğru uygulandı
```

Bu aşamada **medyasız DÖF round-trip MVP gerçek test uygulaması seviyesine gelmiştir.**

---

## B. Kanonik commit zinciri

| Commit | Hash | Başlık |
|---|---|---|
| 4A-1 | `0fd5e67259a39aeceeb50781fd5f95cbda878e77` | fix(dof): takip taslagi servislerini kanonik kayitla sinirla |
| 4A-2 | `eee8330b7abc68f30b5a7125881ed1b7a9879161` | fix(dof): takip taslaginda absent null ayrimini koru |
| 4B-1 | `c8ed0c649dd733e236899ed27b333bad224e2c99` | fix(dof): replay donusunde null semantigini koru |
| 4C | `0d208a04e5b5f369d2fa50e113ac4e7672d8f5d8` | feat(dof): replay hazirlik kimligini yonet |
| 4D | `7f3acef929905d74ac5a44f4a416832349740cf9` | feat(dof): medyasiz replay zip paketini olustur |
| 4E | `d74a24deee5eaaae767f234b269a5b182c7e6ce5` | test(dof): replay servis zincirini uctan uca dogrula |
| 4F | `b9103abafbcb695796733f0e3ee76a8f7fec67f6` | feat(dof): paket import arayuzunu ekle |
| 4G | `895b7456ed0f9fe71d365dab3af301a71fedd569` | feat(dof): ice aktarilan dofleri listele |
| 4H | `23fc55ed5b05f1aa638d633a32a2cca3de9e7b1e` | feat(dof): takip alanlari duzenleme arayuzunu ekle |
| 4I | `e7e4cd60422c50ffe38cc11324cec973501220d3` | feat(dof): replay zip indirme arayuzunu ekle |
| 4J | *(commit yok)* | QA-only: gerçek Desktop ↔ PWA medyasız round-trip QA başarılı |

*(Bu zincirden önceki temel taşlar: `bafb06a` dönüş belgesi üretimi, `e335fc4`/`0fd5e67` takip taslağı temelleri, `feature/dof-replay-v2` dalının kökü olan `7586f68`/`4fb9951` altyapı+karakterizasyon commit'leri.)*

---

## C. Test ve QA kanıtı

```text
4I sonrası PWA baseline:  162 passed, 0 failed, 0 skipped
4J QA öncesi:              162 passed, 0 failed, 0 skipped
4J QA sonrası:              162 passed, 0 failed, 0 skipped
```

Gerçek QA kanıtları:

- PWA HEAD, QA boyunca değişmedi: `e7e4cd60422c50ffe38cc11324cec973501220d3`
- Desktop HEAD, QA boyunca değişmedi: `5946612`
- Production kodu (PWA veya Desktop) değişmedi.
- QA sırasında commit oluşturulmadı.
- Push/deploy yapılmadı.
- Desktop export gerçek `dof_islemleri.dof_disa_aktar()` çağrısıyla, izole bir temp DB üzerinde üretildi (gerçek kullanıcı verisine dokunulmadı).
- PWA import, takip düzenleme, hazırlık, ZIP download ve Desktop replay apply adımlarının hepsi gerçek UI/dosya akışında (Playwright ile gerçek dosya seçimi, gerçek `download` event'i, gerçek Desktop Python modülleri) doğrulandı — hiçbir adım mock'lanmadı.

---

## D. 4J gerçek round-trip bulguları

**1. PWA import**
- Desktop'un ürettiği gerçek DÖF export JSON'u, PWA import UI (dosya seçici) ile içe alındı.
- Liste/detay UI, gerçek Desktop verisini (bulgu kodu, risk düzeyi, R değeri, konum, aktif tur) doğru gösterdi.

**2. Takip taslağı**
- Sparse/partial semantik (Commit 4A-2) korundu — yalnız kullanıcının dokunduğu alanlar own-property olarak saklandı.
- Explicit `null` transmisyonu (own-property + null) korundu.
- `yeni_o`/`yeni_f`/`yeni_s` numeric tiplerle (string değil) taşındı.

**3. Replay hazırlık**
- `submissionUuid` geçerli UUIDv4 olarak üretildi.
- Aynı taslakta ikinci "Hazırlık Oluştur" idempotent davrandı (aynı `submissionUuid`, DB'ye yazma yok).
- Taslak değiştikten sonra ZIP denemesi, hazırlığı otomatik olarak eski saydı (`REPLAY_HAZIRLIK_ESKI`).

**4. ZIP**
- İndirilen ZIP içinde yalnız `dof_donus.json` entry'si var.
- `dofId` alanı yok (Commit 4B-1 sözleşmesiyle uyumlu).
- `submissionUuid`, hazırlıktan gelen değerle birebir eşleşiyor.
- `baseStateHash`, `exportUuid`, `aktifTurSirasi`, `replayVersion` Desktop'un gerçek export'uyla birebir uyumlu.

**5. Desktop apply**
- `dof_replay_zip_kabul_et` başarılı (`bekliyor:1, hata:0`).
- `dof_replay_import_uygula` başarılı (`uygulandi:true`).
- Takip alanları (`sorumlu`, `gerceklesen_faaliyet`, `yeni_o/f/s`, `etkinlik_kontrol_tarihi`) `dofler` tablosunda doğru uygulandı; `durum`/`kapanma_*` alanlarına hiç dokunulmadı.
- Medya yokluğu hiçbir hata üretmedi.

---

## E. BASE_STATE_DEGISTI keşfi (önemli, kayda değer)

QA sırasında, aynı `dofUuid` üzerinde bir değer Desktop'a uygulandıktan **sonra**, PWA'nın hâlâ **eski** `baseStateHash`'i taşıyan ikinci bir replay paketi Desktop tarafına verildiğinde, Desktop bunu:

```text
BASE_STATE_DEGISTI
```

conflict koduyla **reddetti** (`uygulandi:false`).

**Bu bir hata değildir — staleness korumasının uçtan uca doğru çalıştığının pozitif kanıtıdır.**

Anlamı: Desktop'ta bir DÖF'ün state'i (Desktop UI üzerinden veya önceki bir replay apply ile) değişmişse, PWA'nın elinde tuttuğu ESKİ export'a dayalı bir replay paketi artık uygulanamaz — kullanıcı önce Desktop'tan DÖF'ü **yeniden export etmeli**, PWA da bu yeni export'u içe almalıdır.

**Bilinen sınır:** PWA'nın kendi `dofPaketiIceriAktar` import sözleşmesi (Commit 3B), aynı `dofUuid` için farklı `exportUuid`/`baseStateHash` taşıyan bir re-export'u şu an **`IMPORT_CONFLICT`** ile reddediyor — yani PWA tarafında "zaten içe aktarılmış bir DÖF'ü Desktop'un yeni export'uyla yenile" akışı **henüz yok**. Bu, medyasız MVP'nin bilinen bir sonraki-faz ihtiyacıdır (bkz. §F/§G) — MVP'nin doğruluğunu bozan bir kusur değil, kapsamı henüz genişletilmemiş bir alan.

Bu koruma (hem PWA'nın `REPLAY_HAZIRLIK_ESKI`'si hem Desktop'un `BASE_STATE_DEGISTI`'si) **korunmalı, gevşetilmemelidir.**

---

## F. Şu an hâlâ olmayanlar (açık riskler / sonraki işler)

- Medya replay bağlantısı yok (fotoğraf/ses replay paketine hiç bağlanmıyor).
- Galeri / "Resim Yükle" yok.
- Service Worker registration hâlâ **P1** açık (uygulama SW'yi hiç register etmiyor).
- Normal saha "aynı konuma geri dönüş / mevcut denetime ekleme" davranışı hâlâ açık (her zaman yeni denetim oluşturuyor).
- ZIP import UI yalnız JSON dosya import destekliyor; Desktop'un kendi ürettiği ZIP paketini PWA'nın doğrudan okuyabileceği bir ZIP-okuyucu yok.
- `workers:4` altında tam serial suite'te ara sıra gözlenen, DÖF-dışı testlerde (`j-yeniden-giris.spec.js` gibi) CPU-rekabeti kaynaklı kararsızlık **P2** olarak izlenmeli.
- Aynı DÖF'ü Desktop'ta güncelledikten sonra PWA'nın tekrar export alıp "yenileme" (mevcut kanonik kaydı yeni export kimliğiyle güncelleme) akışı yok — §E'de detaylandırıldı.
- Push/deploy yapılmadı (bu dal hâlâ yalnız yerel/branch üzerinde).

---

## G. Sonraki önerilen sıra

```text
4K — Service Worker registration (P1)
4L — Galeriden Resim Yükle
4M — Aynı konuma geri dönüş / mevcut denetime ekleme
4N — Medya replay bağlantısı
4O — Saha test paketi / final handoff
```

**Ancak açıkça belirtilmelidir:** medyasız DÖF round-trip MVP, gerçek test uygulaması seviyesine ulaşmıştır. Yukarıdaki sıradaki işler MVP'yi tamamlamak için değil, **kapsamı genişletmek** içindir.
