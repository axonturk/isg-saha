# PWA DÖF Replay — Medyasız Round-Trip MVP Handoff

**Branch:** `feature/dof-replay-v2`
**Bu doküman anındaki PWA HEAD:** `e7e4cd60422c50ffe38cc11324cec973501220d3`
**Bu doküman anındaki Desktop (isg_denetim) HEAD:** `5946612`
**Durum:** Medyasız DÖF round-trip MVP, gerçek Desktop ↔ PWA QA ile doğrulanmış test uygulaması seviyesindedir.

**2026-07-22 güncellemesi:** Bu doküman, Desktop tarafındaki roadmap görüşmeleriyle (Madde 4.0 sözleşme fazı + Madde 4A doğrulaması) hizalanmak üzere aşağıya **H-M bölümleri eklenerek** güncellendi. Bu güncelleme **yalnız dokümantasyondur — hiçbir kod, test veya üretim davranışı değişmedi.** Yukarıdaki A-G bölümleri (orijinal 4J QA kaydı) aynen korunmuştur, hiçbir cümlesi silinmemiş/değiştirilmemiştir.

**2026-07-23 güncellemesi:** Aşağıya **N-Q bölümleri eklendi** — 4N-4Q'nun kapanışı, Sesle Yaz özelliği, GitHub push + Pages durumu, gerçek Android 4R bulguları (kısmi/BLOCKED_BY_ENVIRONMENT) ve önerilen 4S (Mobile UX Alignment) planı. Bu doküman anındaki gerçek PWA HEAD artık `cc81c08` — üstteki "Bu doküman anındaki PWA HEAD" alanı (§A-G'nin orijinal anını gösterir) **kasıtlı olarak değiştirilmedi**, tarihsel kayıt olarak korunuyor; güncel HEAD için §O'ya bakın. Yine **yalnız dokümantasyon** — hiçbir kod/test/üretim davranışı bu güncellemeyle değişmedi.

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

> **2026-07-22 notu:** 4K/4L/4M bu tarihte git geçmişinde TAMAMLANMIŞ durumda (bkz. `7985f52`, `102645d`, `19d696a`/`12ff577`). Bu bölümdeki eski "4N — Medya replay bağlantısı" ve "4O — Saha test paketi / final handoff" slotları, aşağıdaki **§K**'de reviewStatus işini de kapsayacak şekilde **4N-4R** olarak genişletilip yeniden numaralandırıldı — bu paragraf tarihsel kayıt olarak korunuyor, güncel sıra için §K'ye bakın.

---

## H. Madde 4A kanonik kapanış notu (2026-07-22)

Desktop tarafındaki roadmap görüşmesinde "Madde 4A — PWA DÖF Detay Ekranı, salt-okunur temel" adıyla planlanan iş, bu repodaki **mevcut "4G" (§B tablosu) koduyla zaten karşılanıyor**:

- `_dofDetaySec()` → `_dofDetayGoster()` mevcut.
- Detay ayrı `#dof-detay-kart` / `#dof-detay` alanında render ediliyor.
- Detay salt-okunur; `input`/`textarea`/`select` yok.
- Takip Bilgileri formu ayrı `#dof-takip-form-kart` içinde (4H, karışmıyor).
- Replay Paketi / ZIP kartı ayrı `#dof-replay-kart` içinde (4I, karışmıyor).
- Detay mevcut kanonik DÖF kaydından besleniyor; eksik değerlerde "Bilgi yok" fallback var.
- `reviewStatus`, `kapatma_onerisi`, `kapatilamaz` yok (henüz eklenmedi — bkz. §I, §K).
- Medya capture yok, yeni medya sözleşmesi yok.
- PWA→Desktop dönüş ZIP formatı değişmedi.
- Desktop repo'ya dokunulmadı.

**Hedef test:** `tests/t-dof-list-detail-ui.spec.js` → **10 passed, 0 failed, 0 skipped**.
**Son tam doğrulama (Codex bağımsız QA):** **232 passed, 0 failed, 0 skipped.**

**Sonuç: Madde 4A KAPANDI.** Yeni kod yazılmadı, yeni commit oluşturulmadı — mevcut PWA "4G" kodu 4A kriterlerini olduğu gibi karşılıyor. Codex bağımsız doğrulama kararı: `READY_TO_MARK_4A_CANONICAL`.

---

## I. Madde 4.0 sözleşme kararları (Desktop tarafında alınmış, PWA'yı bağlar)

Desktop roadmap'inde "Madde 4.0 — DÖF replay sözleşme fazı" kodsuz olarak kapatıldı; PWA tarafını doğrudan ilgilendiren kararlar:

1. **Yeni medya sözleşmesi icat edilmeyecek.** Desktop zaten foto/ses için tam bir alım hattına sahip: SHA-256 doğrulama, staging → Apply çift hash, `dof_fotolar/<dof_id>/` kalıcılaştırma, idempotency, ZIP tip tespiti, partial apply. PWA ileride bu **mevcut** Desktop sözleşmesini üretmeye başlayacak (§K, 4P/4Q).
2. **`reviewStatus` gerçekten yeni bir alan** — bugün ne Desktop'ta ne PWA'da (bu repoda grep ile doğrulandı: sıfır referans) karşılığı yok. Değerler: `dokunulmadi`, `goruldu`, `inceledi_degisiklik_yok`, `kapatma_onerisi`, `kapatilamaz`.
3. **`reviewStatus`, `dof_takip_contract` allowlist'ine GİRMEYECEK** — ayrı, bağımsız bir audit/review alanı olarak kalacak; mevcut 8 izinli takip alanıyla (planlanan_tarih, sorumlu, gerceklesen_faaliyet, etkinlik_kontrol_tarihi, gozlem_degerlendirme, yeni_o/f/s) karışmayacak.
4. **Kapatma alanları PWA'dan gelmeyecek.** Human-in-Control ilkesi değişmiyor: PWA yalnız `kapatma_onerisi` (bir öneri/rozet) üretebilir, **final kapatma her zaman Desktop'ta kalır.**
5. **ZIP tip tespiti ve partial apply davranışına dokunulmayacak** — bu ikisi zaten sağlam/mevcut (§A-E'de doğrulandı), yeniden tartışılmıyor.

---

## J. Roadmap remap kararı ve "roadmap karmaşası" notu

Desktop tarafındaki roadmap görüşmelerinde (ChatGPT süpervizörlüğünde) "Madde 4 — DÖF Replay Yeniden Tasarımı" **"henüz yapılmamış, en riskli madde"** varsayımıyla planlanmıştı. Gerçekte bu `feature/dof-replay-v2` dalı, **main'e merge edilmemiş** olsa da, o maddenin büyük kısmını (3B, 4A-4M) zaten içeriyordu — ama bu bilgi Desktop roadmap görüşmesine hiç yansımamıştı.

**Karar:** Bu dalın kendi kanonik numaralandırması (3B, 4A-4M — bu doküman + `app.js` yorum blokları) **korunacak**, Desktop roadmap'inin bağımsız önerdiği yeni "4A-4G" etiketleri **kullanılmayacak** (çakışma yaratırdı — örn. Desktop'ın önerdiği "4C" = reviewStatus, ama bu repoda "4C" zaten = replay hazırlık kimliği, tamamlanmış iş). Açık slotlar **4N-4R** olarak kullanılacak (§K).

**Merge kararı bu güncellemenin kapsamı DEĞİLDİR** — yalnız doküman hizalaması yapılıyor, dal durumu/merge zamanlaması ayrı bir karar konusu olarak açık bırakılıyor.

---

## K. Yeni 4N-4R sırası (§G'nin eski 4N/4O slotlarının yerini alır)

```text
4A         → KAPANDI (§H) — Readonly DÖF detail, mevcut 4G koduyla karşılandı

4N — reviewStatus local model + UI
     PWA DÖF detay/takip bağlamında reviewStatus alanı: dokunulmadi /
     goruldu / inceledi_degisiklik_yok / kapatma_onerisi / kapatilamaz.
     Local persistence + UI seçimi. Export YOK. Medya YOK. Kapanış alanı
     YOK. dof_takip_contract allowlist'ine karışmaz.

4O — reviewStatus export contract   [4N'e bağımlı]
     PWA→Desktop dönüş ZIP'inde reviewStatus ayrı audit/review alanı
     olarak yer alır. "Sadece incelenenleri" export filtresi eklenir
     (dokunulmadi filtre dışında kalır). kapatma_onerisi final kapatma
     üretmez. Human-in-Control korunur — final kapatma her zaman
     Desktop'ta kalır.

4P — DÖF replay media capture (PWA)
     DÖF detay/takip bağlamında foto+ses ekleme — normal saha bulgusu
     medya akışından AYRI ama UI tutarlı. Mevcut Desktop medya
     sözleşmesine (fotolar/sesNotlari) uygun hazırlık. Yeni medya
     formatı icat edilmez.

4Q — Media export + contract tests   [4P'ye bağımlı]
     PWA→Desktop dönüş ZIP'ine DÖF replay medya dosyaları eklenir; alan
     adları Desktop sözleşmesiyle birebir uyumlu; foto/ses hash'leri
     SHA-256 hex64; Desktop'ın mevcut staging→Apply çift hash,
     dof_fotolar/<dof_id>/, idempotency hattıyla uyumluluk fixture'ları.

4R — E2E QA / Android / Desktop handoff
     reviewStatus + medya ile gerçek uçtan uca QA (4J presedentini
     takip ederek — gerçek Desktop kodu, mock yok). PWA ZIP üretir,
     Desktop mevcut import doğrular, kapatma_onerisi yalnız rozet/audit
     kalır, final kapanış Desktop'ta kalır. Android gerçek cihaz
     regresyonu. Handoff dokümante edilir.
```

**Sıra gerekçesi:** reviewStatus, medyadan bağımsız ve daha düşük risklidir (yeni ikili/dosya işleme yok, yalnız string enum + IndexedDB alanı) — önce tamamlanırsa, medya işi sırasında export şemasına nasıl oturduğu zaten netleşmiş olur.

---

## L. Tekrar yazılmayacak mevcut işler

Aşağıdakiler **zaten yapılmış ve test edilmiş** — 4N-4R çalışması sırasında yeniden yazılmayacak, değiştirilmeyecek (yalnız yeni alan/dosya eklenerek genişletilecek):

- 4A/4G salt-okunur DÖF detay ekranı (`_dofDetayGoster`)
- Takip Bilgileri formu / takip taslağı (4A/4A-1/4A-2/4H — `dofTakipTaslagiGetir/Guncelle/Temizle`, `_dofTakipKaydet`)
- Medyasız replay ZIP üretimi (4C/4D — `dofReplayHazirlikHazirla`, `dofReplayZipOlustur`, tek-entry `dof_donus.json` şeması, `_DOF_DONUS_GIRDI_ALANLARI` allowlist'i)
- DÖF import/list/detail UI (4F/4G)
- Replay hazırlık/ZIP indirme UI (4I)
- Medyasız gerçek Desktop↔PWA QA (4J — bu dokümanın §A-E'si)
- 4K/4L/4M genel saha MVP işleri (Service Worker, galeri, aynı-konum) — DÖF replay kapsamının tamamen dışında, dokunulmayacak

---

## M. Gerçek eksikler ve sıradaki adım

Grep ile doğrulanan (2026-07-22, `app.js` + `tests/` genelinde sıfır referans): `reviewStatus`, `kapatma_onerisi`, `kapatilamaz`, `dokunulmadi`. DÖF replay bağlamında foto/ses capture yok, medya export yok, "sadece incelenenler" export filtresi yok (mantıksal olarak reviewStatus'a bağımlı).

**Sıradaki önerilen adım: 4N — reviewStatus local model + UI.** Bağımsız, düşük riskli, medyaya dokunmuyor, mevcut 232 testten hiçbirini bozma ihtimali düşük. 4O/4P/4Q/4R bu sıradan sonra, her biri kendi onay/test/rapor döngüsüyle ele alınacak.

**Desktop 5B ayrımı (2026-07-22, Codex QA sonrası eklendi):** PWA 4N-4R roadmap'i yalnız PWA tarafındaki reviewStatus local model/UI, export filtresi, medya capture/export ve E2E handoff işlerini kapsar. Desktop tarafında reviewStatus'un kalıcı `review_status` kolonu, DÖF İşlemleri sekmesinde görünürlüğü, rozet/filtre/aksiyon davranışı ve Desktop final karar UI'ı **ayrı `Desktop 5B` konusudur**. Bu PWA doküman güncellemesi Desktop 5B'nin yerine geçmez; Desktop repo'ya dokunulmamıştır. Human-in-Control ilkesi gereği PWA `kapatma_onerisi` üretebilir, fakat final kapatma kararı her zaman Desktop'ta kalır.

---

## N. 4N-4Q kapanışı + Sesle Yaz (2026-07-23 güncellemesi)

**Bu güncelleme yalnız dokümantasyondur** — §A-M'nin hiçbir cümlesi silinmedi/değiştirilmedi, yalnız §N'den itibaren ekleniyor. §K'de "planlanmış" olarak listelenen 4N-4Q, bu tarih itibarıyla **hepsi kapandı**:

| Faz | Konu | Durum | Commit(ler) |
|---|---|---|---|
| 4N | reviewStatus local model + UI | ✅ KAPANDI | `d230d39` |
| 4O | reviewStatus sparse export + fingerprint/staleness | ✅ KAPANDI | `1cf4481` |
| 4P | DÖF replay local media capture | ✅ KAPANDI | `929dc96` (+ güvenlik fix `47e33d4`) |
| 4Q | DÖF replay media export + contract tests | ✅ KAPANDI | `1fbace5` |

**4Q medya export sözleşmesi (kanonik, değişmedi):**
- Foto: `fotolar/<localMediaUuid>.jpg`
- Ses: `sesler/<localMediaUuid>.webm`
- `dof_donus.json` içinde `fotolar`/`sesNotlari` — Desktop'a zorunlu, **çıplak dosya adı** `string[]`
- `kanitMedyalari` — additive audit metadata (Desktop okumaz, `payload_snapshot_json`'da korunur)
- Medyasız kayıtta bu üç alan tamamen **absent** (boş dizi değil)
- Desktop'ın mevcut sözleşmesi (staging→Apply çift hash, `dof_fotolar/<dof_id>/`, idempotency) **bozulmadı**

**Ek özellik — Sesle Yaz (Oda/Mahal/Konum Kodu UX, DÖF replay kapsamı DIŞINDA ama aynı dalda):**
- Commit zinciri: `eaa16ed` (feat, ilk implementasyon) → `cc81c08` (fix, Codex NEEDS_FIX P1/P2 sertleştirme).
- Kanonik kararlar: `#kat-alan-oda-no` yanında 🎤 mikrofon butonu (kamera/OCR'a ek ÜÇÜNCÜ alternatif, ikisi de korunuyor); `SpeechRecognition`/`webkitSpeechRecognition` feature-detect; `lang='tr-TR'`; **tam offline garanti iddiası YOK** — yalnız destek varsa kullanılabilir hızlı-giriş yardımcısı; boş transcript mevcut input değerini SİLMEZ (P1 düzeltmesi); stale `onend`/`onerror` (eski, abort edilmiş bir recognition'ın gecikmeli callback'i) yeni aktif recognition state'ini BOZMAZ (P2 düzeltmesi, closure-guard deseni).
- Codex bağımsız QA: **READY** (re-check sonrası).
- Test baseline: tam paket serial run **328 passed, 0 failed, 0 skipped**.
- DÖF replay sözleşmesine (4Q) veya export koduna **hiç dokunmuyor** — grep ile doğrulandı, sıfır kesişim.

---

## O. GitHub push + Pages durumu (2026-07-23)

- Repo: `C:\Users\fakma\OneDrive\Desktop\isg-saha-asistani-v0.1-dof-replay-v2`, branch `feature/dof-replay-v2`.
- Remote: `https://github.com/axonturk/isg-saha.git` — **push edildi** (`git push origin feature/dof-replay-v2`, fast-forward, force/tag/main/gh-pages'e dokunulmadı).
- GitHub Pages: `https://axonturk.github.io/isg-saha/index.html` — **`feature/dof-replay-v2` branch'ini kökten yayınlıyor** (Pages source zaten bu branch'e ayarlıydı, değiştirilmedi), **HTTPS enforced**.
- Son doğrulanan Pages build: commit `cc81c08d0f95afc06f7f9a08caf111816d800715` ile **birebir eşleşiyor**, `status: "built"`.
- Bu, gerçek Android cihazda güvenli bağlam (HTTPS) gerektiren mikrofon/kamera izinlerinin test edilebilmesini sağladı (bkz. §P).

---

## P. Gerçek Android 4R durumu (2026-07-23) — TEKNİK OLARAK ÇALIŞTI, QA TAM KAPANMADI

Gerçek Android cihazda, GitHub Pages HTTPS üzerinden doğrulanan zincir:

```text
GitHub Pages HTTPS açıldı
→ DÖF paketi içe aktarıldı
→ DÖF listesi göründü
→ DÖF detayı açıldı
→ reviewStatus alanı görüldü
→ takip bilgileri görüldü
→ kamera ile fotoğraf çekme çalıştı
→ dosya seçme çalıştı
→ ses notu/mikrofon kaydı çalıştı
→ ZIP indirildi
```

**Gözlemsel not (ürün iddiası DEĞİL):** Test cihazında internet bağlantısı olmadığı bir anda mikrofon/ses kaydı yine de çalıştı. **Bu, cihaz/tarayıcıya özel bir gözlemdir — "her cihazda offline STT çalışır" şeklinde genellenmeyecek**, Web Speech API'nin doğası gereği tam offline garanti yoktur (bkz. §N, Sesle Yaz kararları).

**4R'nin kapanmama nedeni:** Desktop import/staging/Apply adımı (ZIP'in Desktop'a taşınıp gerçek `dof_replay_zip_kabul_et`/`dof_replay_import_uygula` ile işlenmesi) **henüz tamamlanmadı**. AI ajanı fiziksel bir Android cihazı veya Desktop'un native (CustomTkinter) GUI'sini kendi başına süremediği için ilk otomatik yürütme denemesi **`BLOCKED_BY_ENVIRONMENT`** sonucuyla kapandı — bu bir kod/test hatası değil, araç/erişim sınırıdır. Kullanıcı Android tarafındaki adımların önemli bölümünü elle doğruladı; Desktop import/apply adımı hâlâ kullanıcının kendisi tarafından elle tamamlanmayı bekliyor.

**4R kapanış kriteri (değişmedi):** Desktop import/staging/Apply gerçek bir cihazdan gelen medyalı ZIP ile başarıyla tamamlanıp DB/dosya sistemi kanıtlarıyla (§K'deki 4R tanımına bkz.) doğrulanmadan 4R "kanonik kapandı" sayılmaz.

---

## Q. 4S — DÖF Replay Mobile UX Alignment (önerilen, henüz onaylanmadı/kodlanmadı)

Gerçek Android 4R testinde teknik zincir çalıştı ama kullanıcı, DÖF replay ekranlarının normal saha denetimi akışıyla (konum/mahal bağlamlı, ekran-ekran, sticky footer'lı) tutarsız olduğunu gözlemledi. Bu bulgular ayrı bir UX planlama turunda (kod yazılmadan) belgelendi.

**Kullanıcı tarafından gözlenen UX eksikleri (10 madde):**
1. DÖF seçilince normal saha denetimindeki gibi konum bazlı ekran gelmeli.
2. DÖF detay ekranı ayrı/düz kart gibi kalmamalı.
3. "İçe Aktarılan DÖF'ler" uzun tek liste olmamalı.
4. Önce birim/alan/konum/mahal grupları chip/düğme gibi görünmeli.
5. Kullanıcı hangi birim/alanı seçerse yalnız o gruba ait DÖF'ler görünmeli.
6. DÖF listesi orta bölümde kaydırılabilir olmalı.
7. Alt eylem düğmeleri sticky/sabit olmalı.
8. "Hazırlık Oluştur" ayrı zorunlu adım gibi görünmemeli.
9. ZIP İndir hazırlığı otomatik oluşturmalı veya güncellemeli.
10. DÖF replay akışı normal saha denetimi layout'una hizalanmalı.

**Kod okumasıyla doğrulanan teknik zemin:** `#screen-setup` içinde DÖF kartları (Paket Al/Liste/Detay/İnceleme Durumu/Takip/Kanıt Medyaları/Replay Paketi) düz sıralı `<div class="card">` olarak duruyor — ayrı ekran/`.konum-header`/sticky footer yok. Her DÖF kaydı (`k.kat`/`k.oda`/`k.alanTipi`) **zaten konum verisini taşıyor** — yeni veri gerekmez, yalnız sunum değişir. `dofReplayHazirlikHazirla` zaten tam idempotent — "ZIP İndir" onu otomatik çağıracak şekilde sadeleştirilebilir, fingerprint/staleness koruması bozulmadan.

**Desktop/PWA DÖF export filtresi kararı:** Desktop'un PWA'ya DÖF gönderirken düşük/önemsiz riskleri filtrelemesi veya PWA'nın kartları risk durumuna göre renklendirmesi — **renklendirme 4S kapsamında PWA UI'da yapılabilir**, **export filtresi ayrı bir Desktop fazı** olarak değerlendirilmeli. Mevcut export/import kontratı bozulmayacak.

**4S kapsamı (önerilen, ChatGPT onayı bekliyor):** DÖF listesi birim/alan/konum gruplama, seçili grup chip/sekme, orta kaydırılabilir DÖF listesi, DÖF seçilince konum/mahal bağlamlı ekran, sticky alt butonlar, ZIP İndir otomatik hazırlık, risk seviyesine göre kart renklendirme. **Bu bölüm bir plan kaydıdır — hiçbir kod bu güncellemeyle yazılmadı.**
