# İSG Saha Asistanı v0.1 (AxonTR)

Çevrimdışı çalışan saha denetim PWA'sı. Foto + not + alan tipi + konum kodu toplar,
denetim sonunda tek ZIP (fotolar + denetim.json) olarak dışa aktarır.

## Kurulum (5 dakika, GitHub Pages)

1. github.com'da yeni repo aç (örn: `isg-saha`, Public)
2. Bu klasördeki 6 dosyayı repoya yükle:
   index.html, app.js, sw.js, manifest.json, icon-192.png, icon-512.png
3. Repo > Settings > Pages > Source: "Deploy from a branch" > main > Save
4. 1-2 dk sonra adres: https://KULLANICIADI.github.io/isg-saha/
5. Bu adresi telefonda Chrome/Safari ile aç
6. Menü > "Ana ekrana ekle" — artık uygulama gibi açılır
7. İLK AÇILIŞI internetliyken yap (service worker kendini önbelleğe alsın),
   sonrası tamamen çevrimdışı çalışır.

Not: PWA'nın service worker'ı HTTPS ister; GitHub Pages bunu otomatik sağlar.
Dosyayı doğrudan telefona atıp açmak ÇALIŞMAZ (file:// altında SW ve kamera kısıtlı).

## Saha akışı

1. Denetim türü + işyeri adı + bina profili seç > Başlat
2. Alan tipi seç, istersen konum kodu gir (yapışkan; son 5 kod hızlı buton)
3. "Foto Çek" ile arka kamera açılır; birden çok foto eklenebilir
4. Fotoğraf yasak alanlarda (ameliyathane, arşiv): foto çekme, sadece not yaz
   > "fotoğrafsız bulgu" olarak işaretlenir
5. HAYATİ RİSK kutusu işaretlenirse kayıtta paylaş menüsü açılır (SMS/WhatsApp taslağı)
6. Her ~15 fotoda ara yedek hatırlatması çıkar > "Ara Yedek Al"
7. Gün sonunda "Denetimi Bitir ve ZIP İndir" > ZIP'i bilgisayara aktar
   (WhatsApp/kablo/Drive) > masaüstü uygulamaya verilecek

## ZIP içeriği

- denetim.json: denetim bilgisi + tespit listesi + manifest (dosya sayısı doğrulaması)
- fotolar/: alanTipi_konumKodu_sıra.jpg

## Test durumu

- ZIP oluşturucu: unzip -t ile doğrulandı (Türkçe karakterler dahil)
- Birim testleri: slug, dosya adı, konum normalizasyonu, JSON şema, bina profilleri
- Uçtan uca test (jsdom + fake-indexeddb): kurulum > denetim başlatma >
  fotoğraflı tespit > fotoğrafsız bulgu > hayati risk bildirimi > ZIP export >
  ZIP içerik/manifest doğrulaması — tümü geçti
