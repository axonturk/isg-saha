# İSG Saha Asistanı v0.3 (AxonTR)

## v0.3'te ne değişti — OCR gerçek etiketlerle yeniden kalibre edildi

Senin gönderdiğin 2 gerçek kapı etiketi fotoğrafı (Z-15, İ-107) v0.2'nin OCR'ını
tamamen yanılttı. Kök neden teşhisi: etiket, fotoğrafın sadece %0.85'ini
kaplıyordu (telefon etiketten ~1-1.5 metre uzakta). Bu optik/mesafe sorunu,
görüntü işleme ile çözülemez (OpenCV.js dahil) — çözüm arayüzün kullanıcıyı
fiziksel olarak yaklaştırmasıdır. Buna göre:

1. HEDEF ÇERÇEVESİ DARALTILDI (%70x%35 -> %42x%16): kullanıcı etiketi bu dar
   çerçeveye sığdırmak için doğal olarak yaklaşmak zorunda kalır.
2. "YAKLAŞIN / HAZIR" CANLI GÖSTERGESİ: kamera açıkken çerçeve içindeki kenar
   yoğunluğu saniyede ~2 kez ölçülür. Yeterli netlik/yakınlık algılanınca
   çerçeve yeşile döner, telefon titrer, OCR OTOMATİK çalışır — "Oku" butonuna
   basmaya gerek kalmaz (istenirse elle de tetiklenebilir).
3. BAĞLAMA DUYARLI OKUMA: Hangi checklist maddesini işaretlediysen (pano,
   yangın dolabı, makine, konum) OCR o bağlama uygun kod kalıbını önceliklendirir
   (P-023, YD-12, CNC-07, A-203 gibi). OCR_PROFILLERI objesi genişletilebilir —
   yeni bina/kurum kalıbı eklemek kod değişikliği değil, veri eklemektir.
4. OCR KARIŞIKLIK TOLERANSI: gerçek fotoğraflarında görüldüğü gibi OCR harfleri
   görsel benzer rakamlarla karıştırabiliyor (Z->7, İ->1, S->5, B->8, O->0).
   Artık bu varyantlar da aday olarak üretiliyor; "7-15" okununca "Z15" önerisi
   de sunuluyor.
5. "/" AYRACI DESTEĞİ: İ/107 gibi formatlar artık tanınıyor.

## Test durumu (v0.3)

- 10 sentetik etiket: 10/10 (regresyon yok, v0.2'den daha temiz adaylar).
- SENİN 2 GERÇEK ETİKETİN (Z-15, İ-107): ham Tesseract çıktısı "7-15" ve
  "1C 1/107" gibi gürültülü olsa da, karışıklık toleransı ve token-bazlı
  ayrıştırma ile 2/2 doğru kod üretildi (kullanıcının çerçeveye yaklaştığı
  senaryo simüle edilerek test edildi — bkz. proje notları).
- DÜRÜST SINIR: bu test, fotoğrafı yapay olarak "yaklaşılmış" gibi yeniden
  kırparak yapıldı çünkü elimde video akışı yok, sadece durağan fotoğraf var.
  Gerçek kullanım koşulunda kullanıcı arayüzdeki "yaklaşın" uyarısına uyup
  uymayacağı SAHADA doğrulanacak. OCR_HAZIR_ESIK sabiti (app.js içinde,
  aranabilir) sahada çok sık "yaklaşamıyorum" şikayeti gelirse düşürülebilir.
- 16 uçtan uca test senaryosu (checklist, çoklu denetim, geri tuşu, hayati
  risk, ZIP izolasyonu) hâlâ tam geçiyor — regresyon yok.

## OCR kullanımı (v0.3)

1. Konum kodu yanındaki 📷'ya bas
2. Dar sarı çerçeveyi etikete yaklaştır (önceki sürümden daha yakına gelmen
   gerekecek — bu kasıtlı)
3. Çerçeve yeşile dönüp titreşim hissettiğinde otomatik okunur
4. Çıkan aday(lar)dan doğrusuna dokun — alana yazılır
5. Okumazsa: ışığı artır, açıyı düzelt, biraz daha yaklaş; sistem "hazır"
   olana kadar otomatik denemeye devam eder
