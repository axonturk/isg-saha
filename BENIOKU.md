# İSG Saha Asistanı v0.2 (AxonTR)

Çevrimdışı saha denetim PWA'sı: foto + not + alan tipi + konum kodu toplar,
ZIP olarak dışa aktarır. v0.2 ile: checklist rehberi, OCR etiket okuma, foto küçültme.

## v0.2 yenilikleri

1. CHECKLIST REHBERİ: Alan tipi seçilince "çekilmesi önerilenler" listesi görünür
   (31 alan tipi, 136 kontrol maddesi). Tespit kaydederken hangi maddeye ait
   olduğunu seçersin; madde ✅ olur. "Denetimi Bitir" eksik zorunlu kareleri uyarır.
2. OCR ETİKET OKUMA: Konum kodu yanındaki 📷 ile kamera açılır, kapı etiketine
   tutulur, "Oku" ile kod adayları çıkar, doğrusuna dokunulur.
   - İLK KULLANIM İNTERNET İSTER (~5 MB motor bir kez iner, sonra offline).
   - Okuyamazsa elle yazma yolu aynen durur; OCR sadece kısayoldur.
3. FOTO KÜÇÜLTME: Çekim anında uzun kenar 2000px'e iner (~3.7 MB -> ~0.5 MB).
   ZIP'ler ~7-10 kat küçülür. Not: küçültme EXIF verisini düşürür; çekim zamanı
   zaten denetim.json'da tutulur.

## Kurulum / güncelleme

İlk kurulum: BENIOKU önceki sürümle aynı (GitHub Pages + Ana ekrana ekle).
Güncelleme: dosyaları repoya push et; telefonda uygulamayı internetliyken
kapat-aç (service worker v3 yeni sürümü ikinci açılışta devreye alır).

## Çoklu denetim (v0.2)

Üst bardaki ← butonu (veya Android geri tuşu) denetim listesine döner.
Buradan yeni denetim başlatılabilir veya devam eden bir denetime dokunup
girilebilir. Her denetimin verisi ayrıdır; "Denetimi Bitir" yalnızca o
denetimin verisini temizler, diğerleri cihazda kalır.

## Saha akışı (v0.2)

1. Denetim türü + işyeri + bina profili (9 profil) > Başlat
2. Alan tipi seç > checklist paneli açılır ("bugün çekilecekler")
3. Konum kodu: elle yaz, son-5 çipinden seç veya 📷 OCR ile okut
4. Foto çek (otomatik küçültülür) / fotoğrafsız bulgu için sadece not
5. "Bu tespit hangi kontrol maddesine ait?" seç (isteğe bağlı) > Kaydet > madde ✅
6. HAYATİ RİSK kutusu: kayıtta anlık bildirim taslağı açılır
7. Ara yedek al; gün sonunda "Denetimi Bitir" > eksik zorunlu uyarısı > ZIP

## Test durumu (v0.2)

- OCR pipeline: 10 farklı sentetik etiket yapısı (lazer plaka, kağıt, metal,
  düşük kontrast, 6° eğik, Türkçe tabela, bulanık, iki satır, hastane tipi,
  italik) ile benchmark: 10/10. JS piksel matematiği + aday seçimi gerçek
  Tesseract'a okutularak parite testi: 10/10.
- Birim testleri: OCR aday üretimi (O/0 varyantı dahil), 31 checklist bütünlüğü,
  checklist anahtarlarının profil alanlarıyla eşleşmesi, eksik-zorunlu mantığı.
- Uçtan uca (jsdom+fake-indexeddb): 12 adım — kurulum > denetim > fotoğraflı/
  fotoğrafsız tespit > hayati risk > checklist paneli > madde kapsama (✅) >
  eksik zorunlu uyarısı > OCR kamerasız güvenli davranış > ZIP + şema doğrulama.
- SAHADA DOĞRULANACAKLAR (burada test edilemeyenler): gerçek kapı etiketlerinde
  OCR isabeti (ışık/açı/etiket kalitesi), gerçek telefonda foto küçültme çıktısı.
