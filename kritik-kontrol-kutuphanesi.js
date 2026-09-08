/**
 * kritik-kontrol-kutuphanesi.js -- Hizli Kritik Kontrol veri kutuphanesi
 * (Faz 11, PWA plani madde 2, 2026-09-08; sektor_kaynaklari/genel_kritik_
 * maddeler 2026-09-08 dis inceleme B06 duzeltmesiyle eklendi).
 *
 * Desktop'un tools/kritik_json_disa_aktar.py scripti ile URETILDI --
 * checklist-kutuphanesi.js'nin (30 kaynak, TUM maddeler, chip sistemi
 * icin) AKSINE bu dosya YALNIZ kritik-etiketli maddeleri tasir + her
 * maddenin alan_tipleri/tesis_geneli etiketini. Chip sistemi KALDIRILDI
 * (plan madde 1) -- bu kutuphane onun yerini alan 2-buton (Sorun Yok /
 * Sorun Var) ekraninin veri kaynagidir.
 *
 * SEKTOR_KAYNAKLARI: kurumun sektorune (veya sektor bilinmiyorsa
 * "_evrensel"e) gore hangi kaynaklarin (COKLU, sirali) kullanilacagini
 * belirler -- Desktop'un kritik_kontrol.tum_kaynaklar_sektor_icin() ile
 * AYNI birlestirme, JS'te YENIDEN YAZILMADI.
 * GENEL_KRITIK_MADDELER: kurumun kendi kaynaklari bir alan tipini HIC
 * kapsamiyorsa devreye giren sektorler-arasi-paylasimli fallback havuzu.
 *
 * GUNCELLEME: bu dosya ELLE DUZENLENMEZ -- masaustunde
 *   python tools/kritik_json_disa_aktar.py
 * calistirilip ciktisi bu dosyaya (const atamalari olarak) YENIDEN
 * yapistirilir. surumTarihi asagida, uretim aninin damgasidir --
 * ileride kullaniciya "kritik kontrol listesi X tarihinden kalma"
 * gibi bir uyari icin kullanilabilir.
 */
const KRITIK_KONTROL_SURUM_TARIHI = "2026-09-08T21:55:15+03:00";
const KRITIK_KONTROL_KUTUPHANESI = {
  "csgb_eczaneler": {
    "ad": "Eczaneler için Kontrol Listesi",
    "sektor_kod": "eczane",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış ve iç ve dış zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Kimyasal maddeler ve ilaçlar, yetkisiz kişilerin erişemeyeceği ve uygun yerlerde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Reçete/Majistral Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 36
      },
      {
        "soru": "Kimyasal içerikleri nedeniyle alevlenebilir ürünler;  ısı, ışık ve diğer malzemelerden uzakta ve malzeme güvenlik formuna/ talimatlara uygun şekilde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Reçete/Majistral Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 37
      },
      {
        "soru": "Çalışanlar, kimyasal maddeler ile çalışma veya majistral ilaç hazırlama sırasında cilt, göz, solunum vb. temasını önleyecek şekilde uygun nitelikte kişisel koruyucu donanımları (eldiven, maske vb.) kullanıyor mu?",
        "alan_tipleri": [
          "Reçete/Majistral Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Raflar veya benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Satış Alanı",
          "Depo/Arşiv",
          "Reçete/Majistral Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 50
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 56
      },
      {
        "soru": "Elektrik kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 58
      },
      {
        "soru": "Açıkta kablo bulunması engelleniyor, prizlerin sağlamlığı düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 59
      },
      {
        "soru": "Acil durumlar (yangın, deprem, ilk yardım gerektiren durumlar vb.) konusunda çalışanlara gerekli eğitim verilmiş mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 65
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 68
      },
      {
        "soru": "Yangın söndürücüleri mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 73
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 81
      }
    ]
  },
  "csgb_ofisler": {
    "ad": "Ofisler için Kontrol Listesi",
    "sektor_kod": "ofis",
    "kritik_maddeler": [
      {
        "soru": "Ofis içerisinde duvarlara monte edilmiş raflar, TV üniteleri veya diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Ofis",
          "Açık Ofis Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 18
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 21
      },
      {
        "soru": "Açıkta kablo bulunmamakta, prizlerin sağlamlığı düzenli olarak kontrol edilmekte mi?",
        "alan_tipleri": [
          "Ofis",
          "Açık Ofis Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Asansörler düzenli olarak kontrol ediliyor ve periyodik bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Merdiven/Asansör"
        ],
        "tesis_geneli": true,
        "madde_sira": 27
      },
      {
        "soru": "Yangın merdiveni kapıları/apartman kapısı/acil çıkışlar kilitli olmayıp her an açılabilir durumda mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 31
      },
      {
        "soru": "Yangın söndürücüleri mevcut ve son kullanma tarihleri kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 35
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 51
      }
    ]
  },
  "csgb_mutfak_lokanta": {
    "ad": "Mutfak, Lokanta ve Pastaneler için Kontrol Listesi",
    "sektor_kod": "mutfak_lokanta",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplı olup ve iç ve dış zeminler (mekân girişi, merdivenler vs.)düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Mutfak",
          "Servis/Salon Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlı mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 30
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlendi mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Mutfak"
        ],
        "tesis_geneli": false,
        "madde_sira": 32
      },
      {
        "soru": "Makinaların hareketli parçaları koruma altına alındı mı?",
        "alan_tipleri": [
          "Mutfak"
        ],
        "tesis_geneli": false,
        "madde_sira": 35
      },
      {
        "soru": "Gaz kaçağına karşı gerekli önlemler alındı mı?",
        "alan_tipleri": [
          "Mutfak",
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 43
      },
      {
        "soru": "Kimyasal içerikleri nedeniyle alevlenebilir ürünler ya da basınçlı kaplar (gaz tüpleri, basınçlı pişirme kapları gibi); ısı, ışık ve diğer malzemelerden uzakta ve malzeme güvenlik formuna/ talimatlara uygun şekilde muhafaza ediliyor ve kullanılıyor mu?",
        "alan_tipleri": [
          "Mutfak",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 45
      },
      {
        "soru": "Kapı ve kaçış yollarını gösteren acil durum levhaları uygun yerlere yerleştirildi mi?",
        "alan_tipleri": [
          "Koridor",
          "Servis/Salon Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 46
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut mu? Son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 48
      },
      {
        "soru": "Tutuşma ya da dumanın geri tepmesi tehlikesi barındıran aspiratör ve bacalar (is, kurum vb. birikmeler için) düzenli olarak temizlenmektedir.",
        "alan_tipleri": [
          "Mutfak"
        ],
        "tesis_geneli": false,
        "madde_sira": 49
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 64
      }
    ]
  },
  "csgb_dis_klinik": {
    "ad": "Diş Klinik ve Muayeneleri için Kontrol Listesi",
    "sektor_kod": "dis_klinik",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış ve iç ve dış zeminler (salon girişi, merdivenler vs.)düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Röntgen cihazları sadece özel eğitim almış çalışanlar tarafından ve gerekli önlemler alınarak kullanılıyor mu?",
        "alan_tipleri": [
          "Röntgen Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 23
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 24
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 25
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 43
      },
      {
        "soru": "Yangın merdivenine açılan acil çıkış kapıları kilitli değil ve dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 44
      },
      {
        "soru": "Kompresörün güvenli çalışmasını sağlayacak tedbirler alınmış ve patlamalara karşı dayanıklı yerde ve çalışanlardan yeterince uzakta mı?",
        "alan_tipleri": [
          "Muayene/Tedavi Odası",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 47
      },
      {
        "soru": "Tıbbi ve biyolojik atıkların gerektiğinde uygun işlemlerden geçirildikten sonra çalışanlar tarafından güvenli bir biçimde toplanması, depolanması ve işyerinden uzaklaştırılması, güvenli ve özel kapların kullanılması da dâhil uygun yöntemlerle yapılıyor mu?",
        "alan_tipleri": [
          "Muayene/Tedavi Odası",
          "Sterilizasyon Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 53
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 56
      }
    ]
  },
  "csgb_tekstil": {
    "ad": "Tekstil Ürünleri İmalatı için Kontrol Listesi",
    "sektor_kod": "tekstil",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde tasarlanmış ve iç ve dış zeminler (işyeri girişi, merdivenler vs.) düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Makina, araç ve gereç tedariğinde CE işaretli olanların alınması sağlanıyor mu?",
        "alan_tipleri": [
          "Dokuma/Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 27
      },
      {
        "soru": "Kesici veya delici nitelikteki alet veya ekipmanların açıkta bulundurulması engelleniyor ve koruyucu içerisinde muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Dokuma/Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Dokuma/Üretim Hattı",
          "Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 45
      },
      {
        "soru": "Tüm prizlere topraklama yapılmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 46
      },
      {
        "soru": "Çalışanların kas-iskelet sistemlerini zorlayan pozisyonlarda çalışması engelleniyor mu?",
        "alan_tipleri": [
          "Dokuma/Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 60
      },
      {
        "soru": "Elle taşınamayacak kadar ağır yüklerin çalışanlarca kaldırılması engelleniyor mu?",
        "alan_tipleri": [
          "Dokuma/Üretim Hattı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 66
      },
      {
        "soru": "Tehlikeli kimyasallar yerine tehlikeli olmayan veya daha az tehlikeli olanların kullanılması sağlanıyor mu?",
        "alan_tipleri": [
          "Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 73
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 91
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 92
      },
      {
        "soru": "Yanıcı ve oksitleyici maddelerin havalandırması bulunmayan odalarda depolanması engellenmiş mi?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 99
      },
      {
        "soru": "Atıkların gerektiğinde uygun işlemlerden geçirildikten sonra çalışanlar tarafından güvenli bir biçimde toplanması, depolanması ve işyerinden uzaklaştırılması, güvenli ve özel kapların kullanılması da dâhil uygun yöntemlerle yapılması sağlanıyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 100
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 105
      },
      {
        "soru": "İş kazaları ve meslek hastalıkları vakaları Sosyal Güvenlik Kurumuna rapor ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 106
      }
    ]
  },
  "csgb_ahsap_mobilya": {
    "ad": "Ahşap ve Mobilya İmalat Sektörü için Kontrol Listesi",
    "sektor_kod": "ahsap_mobilya",
    "kritik_maddeler": [
      {
        "soru": "Tahta kesilirken, şekillendirilirken, baskılanırken, zımparalanırken veya cilalanırken ortaya çıkan tahta tozunun ortamdan uzaklaştırılması veya kullanılan kimyasalların gaz veya buharlarının havaya yayılmasını önlemek amacıyla havalandırma sistemi kurulmuş ve düzenli olarak kontrolleri yapılıyor mu?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi",
          "Talaş Toplama Alanı",
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Zemine su, yağ, talaş, yağlı üstüpü, paçavra vb. katı/sıvıların dökülmesi/atılması durumunda kayıp düşmenin veya yanmanın önlenmesi için zemin düzenli olarak temizleniyor mu?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi",
          "Talaş Toplama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 13
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 20
      },
      {
        "soru": "Elektrik/sigorta kutuları/panoları kilitlenmiş ve yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Kesim/İşleme Atölyesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 23
      },
      {
        "soru": "Elektrikle çalışan tüm makinelerin gövde koruma topraklaması yapılmış mı?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi",
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 27
      },
      {
        "soru": "Kullanılan kesici, düzeltici, inceltici ve koparıcı dişliler, testereler, bıçaklar ve dönen parçalara sahip makine/ekipmanlar üreticisinin talimatları doğrultusunda koruma panelleri vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Hava tankı, kompresör vb. patlamaya neden olabilecek donanımlar da dahil imalatçının talimatları doğrultusunda tüm makinelerin günlük bakımları ve periyodik kontrolleri yapılıyor mu?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi",
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 42
      },
      {
        "soru": "Tüm makinelerin acil durdurma sistemleri mevcut mu?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 43
      },
      {
        "soru": "Kimyasal madde kullanılan ve depolanan baskı, kırma ve öğütme gibi kolay yanıcı veya parlayıcı gaz, toz ve buharların bulunduğu ortamlarda yangına neden olabilecek her türlü etken değerlendirilerek önlem alınıyor mu?",
        "alan_tipleri": [
          "Boyahane",
          "Talaş Toplama Alanı",
          "Kesim/İşleme Atölyesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 58
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 59
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 64
      },
      {
        "soru": "Avuç taşlama, zımpara taşı vb. el aletleri veya makinalar ile çalışılırken savrulan parçalar veya çıkan kıvılcımlardan korunulması amacıyla çalışanların kullanımı için uygun göz/yüz koruyucular bulunduruluyor ve çalışanlarca kullanımı sağlanıyor mu?",
        "alan_tipleri": [
          "Kesim/İşleme Atölyesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 79
      },
      {
        "soru": "Yapıştırıcılar, vernikler, pigmentler, boyalar, tinerler ve çözücüler gibi solunduğu zaman ciddi rahatsızlıklara neden olabilen kimyasallar ile yapılan çalışmalarda, çalışanların zararlı kimyasalları teneffüs etmelerini önleyen solunum koruyucular, çalışanların kullanımı için bulunduruluyor ve çalışanlarca kullanımı sağlanıyor mu?",
        "alan_tipleri": [
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 82
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 91
      }
    ]
  },
  "csgb_arac_tamirhaneleri": {
    "ad": "Araç Tamirhaneleri için Kontrol Listesi",
    "sektor_kod": "arac_tamirhane",
    "kritik_maddeler": [
      {
        "soru": "Kaçak akım rölesi elektrik hattına bağlanmıştır.",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 16
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiştir.",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Tamirat Bölmesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 20
      },
      {
        "soru": "Tüm makinelerin acil durdurma tertibatı bulunmaktadır.",
        "alan_tipleri": [
          "Tamirat Bölmesi",
          "Lastik Değişim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 30
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli değildir ve her an açılabilir durumdadır.",
        "alan_tipleri": [
          "Koridor",
          "Tamirat Bölmesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 47
      },
      {
        "soru": "Yangın söndürücüleri mevcuttur ve son kullanma tarihleri kontrol edilmektedir.",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 52
      },
      {
        "soru": "Acil durum planı hazırlanmış ve görünür bir yere asılmıştır.",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 55
      },
      {
        "soru": "Dökülen ya da sıçrayan yakıt derhal temizlenmektedir",
        "alan_tipleri": [
          "Tamirat Bölmesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 58
      },
      {
        "soru": "LPG yakıtlı araçlar güvenli ortamlarda bulundurulmaktadır.",
        "alan_tipleri": [
          "Tamirat Bölmesi",
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 59
      },
      {
        "soru": "Araba motorunun kapalı alanlarda çalıştırılması durumunda arabanın egzozu aspiratör sistemine bağlanmaktadır.",
        "alan_tipleri": [
          "Tamirat Bölmesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 65
      },
      {
        "soru": "Araç kaldırma ekipmanının bakım ve onarımı düzenli şekilde yapılmaktadır.",
        "alan_tipleri": [
          "Tamirat Bölmesi",
          "Lastik Değişim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 78
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 79
      }
    ]
  },
  "csgb_kucuk_insaatlar": {
    "ad": "Küçük İnşaatlarda İSG için Kontrol Listesi",
    "sektor_kod": "santiye_insaat",
    "kritik_maddeler": [
      {
        "soru": "İnşaat alanında bulunan herkes uygun baş ve ayak koruyucusu kullanıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası",
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Çalışanlar dışındaki kişilerin inşaat alanına girmesini engellemeye yönelik korkuluk veya benzeri önlemler var mı?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": true,
        "madde_sira": 6
      },
      {
        "soru": "Yangına karşı uygun önlem alınmış mı? (yangın söndürücü ve acil çıkış yolları gibi)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 12
      },
      {
        "soru": "Güç kabloları (yer altı ve yer üstü) işaretli mi? Sorumluları belirlemiş mi?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": true,
        "madde_sira": 14
      },
      {
        "soru": "Yük ve insan asansörleri, gırgır vinçler uygun şekilde kurulmuş mu ve yetkili kişilerce düzenli kontrol ediliyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 20
      },
      {
        "soru": "Çalışanların ve cisimlerin yüksekten düşmesini engelleyici önlemler alınmış mı?",
        "alan_tipleri": [
          "Şantiye Sahası",
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Düşmeleri engellemek amacıyla, boşluklar açıkça işaretlenmiş ve sabitlenmiş kapaklarla korunuyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 33
      },
      {
        "soru": "Kazılar uygun şekilde destekleniyor veya göçme riskini en aza indirecek şekilde yapılıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 35
      }
    ]
  },
  "csgb_kanal_kazisi": {
    "ad": "Kanal Kazısı Çalışmalarında İSG Kontrol Listesi",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Yer altı hizmetleri gerçekleştiren diğer kurumlarla irtibata geçilerek kazı yapılacak alanda başka yer altı hizmetlerinin olmadığı ya da mevcut hizmetlerin sınırları hakkında bilgi alınmış mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Kazı çevresinde çalışanların kazı içerisine düşmesine karşı tedbir alınmış mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 11
      },
      {
        "soru": "Elektrik tehlikesi dikkate alınarak üstten geçen enerji hatları varsa, kazı aracının çalışma sırasında bu hatlara yeterli mesafede olup olmayacağı incelenmiş midir?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 18
      },
      {
        "soru": "Kazı yakınında çöp sahası olması, kazının tehlikeli madde depolanan yerlere yakın olması vb. sebeplerden dolayı kazı içerisinde tehlike atmosfer varlığına dair inceleme yapılmış mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 19
      },
      {
        "soru": "Kazı çevresinde yaya ve araç trafiği söz konusu ise kazı alanı bariyer ve işaretlemeler ile ayrılmış mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 21
      },
      {
        "soru": "Kazı çalışması için uygulanacak eğim verme ve iksa yöntemleri, uygulama esaslarının belli olduğu kurallara (malzeme ölçü ve kapasiteleri, yerleştirme aralıkları vb.) göre yapılmakta mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 35
      },
      {
        "soru": "Göçük veya malzeme altında kalma durumuna karşı uygulanacak kurtarma işlemi sırasında alınacak önlemler acil durum planında belirtilmiş midir?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 40
      }
    ]
  },
  "meb_kl01_okul_ortak_alanlar": {
    "ad": "Okul Ortak Kullanım Alanları Kontrol Listesi (MEB KL-01)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Pencere açıklığı yaralanma ve düşme riski olan gruplarda 100 mm ile sınırlandırıldı mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Çatıya izinsiz çıkış önlemi alındı mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 5
      },
      {
        "soru": "Koridorlar, geçiş yolları gibi insan trafiğinin yoğun olduğu yerlerde geçişi engelleyecek malzemeler ortadan kaldırılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 14
      },
      {
        "soru": "Kayma ve düşmeye karşı zeminler uygun malzemelerden yapılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 16
      },
      {
        "soru": "Elektrik kesintilerinde aydınlatma sağlanabiliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 17
      },
      {
        "soru": "Trabzanlar tam ve devamlı mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 18
      }
    ]
  },
  "meb_kl02_acil_plan": {
    "ad": "Acil Plan Kontrol Listesi (MEB KL-02)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Okulun yangın, sel, kundaklama, sivil kargaşa, araç kazası, davetsiz misafir vb. olağandışı durumlar için kapsamlı bir acil durum planı mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "Acil durum tatbikatları gerektiği şekilde yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 2
      },
      {
        "soru": "Acil çıkışları açıkça belli mi ve acil çıkış yazıları ışıklandırılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 3
      },
      {
        "soru": "Acil ışıklandırması gerekli yerlerde mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 4
      },
      {
        "soru": "Acil çıkışlarında herhangi bir engel var mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 5
      },
      {
        "soru": "Acil çıkışları her an açık mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 6
      }
    ]
  },
  "meb_kl03_atolyeler": {
    "ad": "Atölyeler Kontrol Listesi (MEB KL-03)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Havalandırma ve baca tesisatı standartlara uygun mu?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Zeminler kaymaya, düşmeye karşı uygun malzemelerden yapılmış mı?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Elektrik panolarında gerekli önlemler alınmış mı?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Çalışanlar için gerekli KKD var mı?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 12
      },
      {
        "soru": "Zarar verici maddeler kilit altında mı?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Gaz, elektrik, sıhhi tesisat ve pis su tesisatları standartlara uygun mu?",
        "alan_tipleri": [
          "Atölye"
        ],
        "tesis_geneli": false,
        "madde_sira": 16
      }
    ]
  },
  "meb_kl04_laboratuar": {
    "ad": "Laboratuar Kontrol Listesi (MEB KL-04)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Tehlikeli maddeler kilit altına alınmış mı?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "Laboratuvarda yangın için özel önlem alınmış mı?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Laboratuvar elektrik panolarında gerekli önlemler alınmış mı?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Laboratuvardaki gaz, elektrik, sıhhi tesisat ve pis su tesisatları standartlara uygun mu?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Yangın söndürücü uygun mu ya da başka söndürücüye ihtiyaç var mı? (Kağıt ve tahta \"A\", çözücü \"B\", elektrik \"C\")",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Siper veya maske gibi maruziyeti engellemeye ve cihazları korumaya yönelik araçlar kullanılıyor mu?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Öğrencilerin tehlikeli buhar ve gazlara maruz kalmaması için gerekli tedbirler alınıyor mu?",
        "alan_tipleri": [
          "Laboratuvar"
        ],
        "tesis_geneli": false,
        "madde_sira": 29
      }
    ]
  },
  "meb_kl05_kantin_kafeterya": {
    "ad": "Kantin ve Kafeterya Kontrol Listesi (MEB KL-05)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Havalandırma ve baca her türlü kokuyu önleyecek şekilde mi?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Çalışan personel için tüberküloz, portör muayenesi yapıldı mı?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Yangın için özel önlemler alınmış mı?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Zemin kaymaya, düşmeye karşı uygun malzemelerden yapılmış mı?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Satışa sunulan gıda maddelerinin ilgili mevzuat uyarınca Tarım Ve Köy İşleri Bakanlığından Üretim/İthalat izinleri var mı?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "WC'ler gıda üretim, satış ve tüketim yapılan yerlerden uygun uzaklıkta mı?",
        "alan_tipleri": [
          "Kantin/Yemekhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      }
    ]
  },
  "meb_kl06_genel_temizlik": {
    "ad": "Genel Temizlik Kontrol Listesi (MEB KL-06)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Okulda gerekli uyarı levhaları asılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "WC'lerde hijyen sağlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Temizlik malzemeleri sağlığa uygun mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 2
      },
      {
        "soru": "Zeminin kaymaya, düşmeye karşı uygun malzemeden yapılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 4
      },
      {
        "soru": "Okulda elle temasın bulunduğu sıralar, kapı kolları, dolap, masa gibi yüzeyler su ve sabun ile periyodik temizliği yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 5
      }
    ]
  },
  "meb_kl07_siniflar": {
    "ad": "Sınıflar Kontrol Listesi (MEB KL-07)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Zemin kaymaya, düşmeye karşı uygun malzemeden yapılmış mı?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Aydınlatma ve ısıtma sistemi yeterli mi?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Acil durum alarmı ve acil çıkış levhaları asılmış mı?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Elektrik prizleri korumalı mı?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "TV, bilgisayar ve projeksiyon gibi elektrikli cihazlar için güvenlik önlemleri alınmış mı?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Havalandırma yeterli mi?",
        "alan_tipleri": [
          "Sınıf"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      }
    ]
  },
  "meb_kl08_koridorlar": {
    "ad": "Koridorlar Kontrol Listesi (MEB KL-08)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Zemin kaymaya veya düşmeye karşı uygun malzemeden yapılmış mı?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Aydınlatma ve ısıtma sistemi yeterli mi?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Acil durum alarmı var mı?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Acil çıkış levhaları asılmış mı?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "Koridorlarda yangın için özel önlemler alınmış mı?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Uyarı levhaları asılmış mı?",
        "alan_tipleri": [
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      }
    ]
  },
  "meb_kl09_okul_araclari_servisler": {
    "ad": "Okul Araçları ve Servisler Kontrol Listesi (MEB KL-09)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Servis araçları ve araç kullanıcıları yasal mevzuatlara uygun mu?",
        "alan_tipleri": [
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Araçların okul içindeki güzergahları ve güvenlik kuralları belirlenmiş mi?",
        "alan_tipleri": [
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Servis işletmesi ve/veya araç şoförleri ile öğrenciler okul güvenlik politikasını biliyor mu?",
        "alan_tipleri": [
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Yağışlı havalarda araca biniş ve iniş merdivenlerinde kayma ve düşmeleri engellemek için önlem düşünülmüş mü?",
        "alan_tipleri": [
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Servis aracı sürücüleri ile öğrencilere okul güvenlik politikasına uygun olarak araçlara iniş ve binişler ile güvenli davranışlar konusunda bilgi veriyor mu?",
        "alan_tipleri": [
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      }
    ]
  },
  "meb_kl10_toplanti_salonu": {
    "ad": "Toplantı Salonu Kontrol Listesi (MEB KL-10)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Uzatma kablosu kullanımını gerektirmeyecek kadar sabit tesisat var mı?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Tüm elektrik anahtarları ve prizleri düzgün çalışıyor mu?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Zemin, kaymaya ve düşmeye karşı uygun malzemeden yapılmış mı?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Acil durum alarmı var mı?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      },
      {
        "soru": "Mevzuata uygun olarak acil çıkış kapısı var mı?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Acil çıkış yönlendirme levhaları asılmış mı?",
        "alan_tipleri": [
          "Amfi",
          "Toplantı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      }
    ]
  },
  "meb_kl11_okul_disi_aktiviteler": {
    "ad": "Okul Dışı Aktiviteler Kontrol Listesi (MEB KL-11)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Okul dışında gerçekleştirilen faaliyetlerde ortaya çıkabilecek riskler ve güvenlik tedbirleri konusunda öğrencilere bilgi veriliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "Okul dışı aktivitelerde kullanılan ulaşım aracı mevzuatlara uygun mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Ulaşım sırasında ve okul dışında yürütülecek faaliyetlerde tüm öğrenciler ve personel sigorta kapsamında mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 2
      },
      {
        "soru": "Okul dışı faaliyetlerden önce ön inceleme yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 3
      }
    ]
  },
  "meb_kl12_muzik_odasi": {
    "ad": "Müzik Odası Kontrol Listesi (MEB KL-12)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Isıtma, havalandırma ve iklimlendirme şartları yeterli mi?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Zeminde kayma ve düşmeleri engelleyecek döşeme sistemi mevcut mu?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "Elektronik müzik aletleri için gerekli elektrik tesisatı ve bunlara uygun standart elektrik panoları mevcut mu?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 7
      },
      {
        "soru": "Aletler güvenliği etkilemeyecek şekilde muhafaza ediliyormu?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      },
      {
        "soru": "Acil durumlar için acil çıkış yön levhaları var mı?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Yangın tesisatı ve gerekli alarm sistemi var mı?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      }
    ]
  },
  "meb_kl13_sanat_odasi": {
    "ad": "Sanat Odası Kontrol Listesi (MEB KL-13)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Zeminde kayma ve düşmeleri engelleyecek döşeme sistemi mevcut mu?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Elektrik tesisatına kaçak akım rölesi konulmuş mu?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Kimyasal malzemeler kullanılan kısımlarda kimyasallar kilit altında mı?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Yangın tesisatı ve gerekli alarm sistemi var mı?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Acil durumlar için acil çıkış yön levhaları var mı?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Fırınlar düzgün biçimde havalandırılıyor ve izole edilmiş mi?",
        "alan_tipleri": [
          "Müzik/Sanat Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 11
      }
    ]
  },
  "meb_kl14_islak_hacimler": {
    "ad": "Islak Hacimler (WC ve Duşlar) Kontrol Listesi (MEB KL-14)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Saç ve el kurutucusu, elektrikli ısıtıcısı gibi elektrikli aletlerin kullanım talimatı uygun yerlere asılmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Zeminlerde kaymaya engel olmak için gerekli tedbir alınmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Duş içinde herhangi bir düşme sırasında tutunabilecek sağlam bir tutunma aparatı takılmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "Islak hacim kapıları, herhangi bir düşme sırasında, tehlike yaratmaması için uygun bir malzemeden yapılmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Islak zeminden dolayı, elektrik tesisatı ile ilgili kaçak akım rölesi vs gibi önlemler alınmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Islak hacimler engellilerin kullanımına uygun olarak tasarlanmış mı?",
        "alan_tipleri": [
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      }
    ]
  },
  "meb_kl15_spor_salonlari": {
    "ad": "Spor Salonları Kontrol Listesi (MEB KL-15)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Zemin döşeme malzemesi standartlara uygun mu?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Yangın tesisatı ve gerekli alarm sistemi var mı?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Acil çıkış kapıları yeterli sayıda ve mevzuata uygun mu?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Acil çıkış yön levhaları var mı?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 7
      },
      {
        "soru": "Spor salonlarında sporculara zarar verebilecek (Kolon köşeleri, radyatör, metal direkler vb.) nesneler darbe emici izolasyon malzemeleri ile kaplanmış mı?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      },
      {
        "soru": "İlkyardım dolabı var mı?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      }
    ]
  },
  "meb_kl16_yuzme_havuzu": {
    "ad": "Yüzme Havuzu Kontrol Listesi (MEB KL-16)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Islak yerlerdeki elektrik tesisatı kaçak akım rölesi ile korunuyor mu?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Havuzun kullanımda olmadığı zamanlarda koruma var mı?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Havuz kullanımı sırasında güvenliği sağlayacak bir personel var mı?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 4
      },
      {
        "soru": "Havuzda kullanılan kimyasallar standartlara uygun mu?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Havuz etrafı kaymaz malzeme ile donatılmış mı?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Havuz derinliği görünür bir şekilde işaretlenmiş mi?",
        "alan_tipleri": [
          "Havuz"
        ],
        "tesis_geneli": false,
        "madde_sira": 7
      }
    ]
  },
  "meb_kl17_kazan_daireleri": {
    "ad": "Kazan Daireleri Kontrol Listesi (MEB KL-17)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Sorumlu haricindeki kişilerin girmesini engelleyici tedbirler alınıyor mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Periyodik bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 8
      },
      {
        "soru": "Duman kanalları ve baca çekişi kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Yangın algılama ve bildirme tesisatı yapılmış mı?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Sıvı yakıtlı ve doğalgazlı sistemlerde yangın, deprem ve statik elektrik ile ilgili güvenlik sistemleri var mı?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 12
      },
      {
        "soru": "Elektrik panoları, aydınlatma ve diğer kablo tesisatları exproof malzemelerden yapılmış mı?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Sıvı yakıtlı kazan dairelerinde yakıt tankları ve yakıt tesisatlarından kaynaklanan kaçaklar var mı?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      }
    ]
  },
  "meb_kl18_ergonomi_bedensel": {
    "ad": "Ergonomi-Bedensel İşler Kontrol Listesi (MEB KL-18)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Malzemelerin taşınması için yeterli ekipman veya araç (mekanik aletler veya kutu, kap vs.) mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "Ağır malzemeler, bel sorunlarına yol açmaması için bel ile diz arasında bir hizada teçhiz edilmiş olan raflarda mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 5
      },
      {
        "soru": "Yüksek noktalara erişim için ayaklı merdiven mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 6
      },
      {
        "soru": "Ağır yüklerin taşınması, mümkün olduğunda parçalar halinde veya küçük iş paketleri haline getirilerek taşınıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 7
      },
      {
        "soru": "Malzemelerin taşınması konusunda dikkat edilmesi gereken hususlar hakkında kişiler bilgi sahibi mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 11
      },
      {
        "soru": "Malzemeleri tutmak ve taşımak için gerekli aparatlardan/araçlardan faydalanılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 13
      }
    ]
  },
  "meb_kl19_ergonomi_buro": {
    "ad": "Ergonomi-Büro İşleri Kontrol Listesi (MEB KL-19)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Otururarak yapılan çalışmalarda çalışma yüksekliği uygun mu?",
        "alan_tipleri": [
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Çalışma alanı/boşluğu uygun mu?",
        "alan_tipleri": [
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 1
      },
      {
        "soru": "Ekranlı araçlar yükseklik, mesafe, parlaklık olarak rahat çalışmaya imkan verecek uygunlukta mı?",
        "alan_tipleri": [
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Çalışma pozisyonu yeterli sıklıkta değişim gösteriyor mu? (ayağa kalkma/oturma/etrafta dolaşma)",
        "alan_tipleri": [
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      }
    ]
  },
  "csgb_cephe_iskeleleri": {
    "ad": "Cephe İskeleleri Kontrol Listesi",
    "sektor_kod": "santiye_insaat",
    "kritik_maddeler": [
      {
        "soru": "Aşağıdaki kriterleri dikkate alarak bozulmaya uğramış ve kusurlu malzemeleri kurulumda kullanılacak malzemelerden ayırdınız mı? (Boruların ezik, çatlak, bükülmüş ve paslı olmaması; bağlantı elemanlarının ezik, çatlak, bükülmüş ve paslı olmaması; ahşap malzemelerin normal ağırlığına göre hafif olmaması (kuru çürüklük); çatlak, kesik, yontuk, kurt yeniği vb. ahşap kusurlarının bulunmaması; yamulmuş ahşap veya metal kalasların olmaması; kaplama malzemesinin zarar görmüş (yırtılmış, kesilmiş vb.) olmaması)",
        "alan_tipleri": [
          "İskele Alanı",
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 11
      },
      {
        "soru": "İskele işinde çalışacakların mesleki eğitimi var mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 13
      },
      {
        "soru": "İskele kurulacak yerin yakınından enerji hattı geçiyorsa, elektrik tehlikesinden kaynaklanabilecek risklere karşı ilgili enerji dağıtım firması ile irtibatı geçtiniz mi ya da başka bir korunma yöntemine başvurdunuz mu?",
        "alan_tipleri": [
          "İskele Alanı",
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 21
      },
      {
        "soru": "Taban plakasını yerleştirdiğiniz zemin stabil mi?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 30
      },
      {
        "soru": "İskele platformu boşluk kalmayacak şekilde kapatıldı mı?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 39
      },
      {
        "soru": "Platform kenarlarında malzeme düşmesine karşı önlem aldınız mı?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 44
      },
      {
        "soru": "İskelenin takviye edilmesi için çapraz bağlantılar kullandınız mı?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 50
      },
      {
        "soru": "Bağlamalar plana uygun noktalara, yatay ve düşey doğrultuda yeterli aralıklarda olacak şekilde yapıldı mı? İskelede çalışmaya başlamadan önce kontrol ettiniz mi?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 57
      },
      {
        "soru": "İskele kısa kenarları (iskele eni) da dâhil olmak üzere bütün kenarları düşme riskine karşı yan koruma ile kapattınız mı?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 61
      },
      {
        "soru": "Merdivenlerin kayma ihtimaline karşı sabitlenmesine dikkat edildi mi?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 72
      },
      {
        "soru": "Emniyet kemerleri önceden belirlenen güvenli noktalara (yaşam hattı vb.) takılıyor mu?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 82
      },
      {
        "soru": "Yaya trafiğinin güvenliği için kapalı geçit yapılacaksa, aşağıdaki bazı hususlar da dikkate alınarak güvenli bir geçit yapılmış mıdır? (Geçidin yeterli yükseklikte olması; üstünün çarpmaya karşı sağlam şekilde, tamamen kapatılmış olması; yeterli genişlikte olması)",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 89
      },
      {
        "soru": "Çalışma aletlerinin, iş malzemelerinin ve artık parçaların doğrudan aşağıya veya alt katlara atılmaması hususunda çalışanlar uyarıldı mı?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 102
      },
      {
        "soru": "Sökümden önce, iskelenin stabil olması açısından kritik olan iskele elemanlarını (bağlama, çapraz, payanda vb.) kontrol ederek bu elemanların sağlam olduğundan emin oldunuz mu?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 121
      },
      {
        "soru": "Yüksekten düşme riskine karşı koruma sistemleri kuruldu mu?",
        "alan_tipleri": [
          "İskele Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 125
      }
    ]
  },
  "csgb_seracilik": {
    "ad": "Seracılık (Örtü Altı Yetiştiriciliği) İşleri için Kontrol Listesi",
    "sektor_kod": "seracilik",
    "kritik_maddeler": [
      {
        "soru": "Yetkisiz kişilerin seraya girişleri engelleniyor mu?",
        "alan_tipleri": [
          "Sera Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 20
      },
      {
        "soru": "Makinelerin kazara/istemeden çalıştırılması engelleniyor ve makinelerin acil durdurma düğmeleri bulunuyor mu?",
        "alan_tipleri": [
          "Sera Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 36
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Sera Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 41
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 43
      },
      {
        "soru": "Kimyasal maddelere yetkisiz kişilerin erişimi engelleniyor mu?",
        "alan_tipleri": [
          "Gübre/İlaç Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 57
      },
      {
        "soru": "Pestisit spreyleme sırasında gerekli önlemler alınıyor mu?",
        "alan_tipleri": [
          "Sera Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 65
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Gübre/İlaç Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 68
      },
      {
        "soru": "Birbirleri ile tepkimeye girerek tehlikeli salımlar oluşturabilecek kimyasal maddelerin ayrı yerlerde muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Gübre/İlaç Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 69
      },
      {
        "soru": "İşyerinde, acil durum planı (güneş çarpması, böcek sokması, ilaç zehirlenmesi, kesici alet kazası vb. için) hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 72
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 73
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 91
      },
      {
        "soru": "Eski traktör kabinleri güvenlik kafesi (roll-bar) ile donatılmış mı?",
        "alan_tipleri": [
          "Bahçe/Dış Alan",
          "Sera Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 104
      },
      {
        "soru": "Çalışma sahası çiftlik içerisindeki elektrik ve yüksek gerilim hatlarına kabul edilebilir uzaklıkta mı?",
        "alan_tipleri": [
          "Sera Alanı",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 112
      },
      {
        "soru": "Çocukların tehlikeli alanlara (çalışma alanları, hareket eden makinelerin civarı, yükseklik, depolama alanları, hayvanların bulunduğu bölmeler vb.) girişleri engelleniyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 113
      },
      {
        "soru": "Kimyasal maruziyetine karşı uygun KKD kullanılıyor mu?",
        "alan_tipleri": [
          "Sera Alanı",
          "Gübre/İlaç Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 115
      }
    ]
  },
  "isg_fiziksel_altyapi_mevzuat_ek": {
    "ad": "Fiziksel Altyapı Ek Kontrol Maddeleri (Yangın Dolabı, Acil Aydınlatma, Gebe/Emziren Dinlenme, Göz Duşu)",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Yangın dolabı mevcut ve içeriği (hortum, lans vb.) eksiksiz, erişilebilir durumda mı? (BYKHY md.94)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "Acil durum aydınlatması ve yönlendirme (kaçış işaretleri) sistemi çalışır durumda mı? (BYKHY md.72-73; 28710 Ek-1 md.10/f, md.24)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Gebe veya emziren çalışanlar için ara sıra uzanıp dinlenebilecekleri uygun bir alan bulunuyor mu? (28710 sayılı Yönetmelik Ek-1 md.49)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 2
      },
      {
        "soru": "Kimyasal madde kullanılan/depolanan alanlarda göz duşu veya acil vücut duşu bulunuyor mu? (28710 Ek-1 md.52; TS EN 15154)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 3
      }
    ]
  },
  "ziyaretci_oryantasyon": {
    "ad": "Ziyaretçi Güvenlik Oryantasyonu",
    "sektor_kod": null,
    "kritik_maddeler": [
      {
        "soru": "Kimlik kontrolü yapıldı mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 0
      },
      {
        "soru": "Gerekli KKD (kişisel koruyucu donanım) verildi mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 1
      },
      {
        "soru": "Acil durum planı/toplanma alanı anlatıldı mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 2
      }
    ]
  },
  "csgb_bakkal_market": {
    "ad": "Bakkal, Market ve Süpermarketler için Kontrol Listesi",
    "sektor_kod": "bakkal_market",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış ve iç ve dış zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Satış/Reyon Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Raflar veya benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Satış/Reyon Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Yük platformu, trans palet, forklift gibi ekipmanların periyodik kontrol ve bakımları düzenli olarak yaptırılıyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Kimyasal maddeler ve haşere ilaçları, yetkisiz kişilerin erişemeyeceği uygun yerlerde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 41
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 44
      },
      {
        "soru": "Elektrik kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 46
      },
      {
        "soru": "Asansörlerin (mevcut ise) periyodik bakımları ve kontrolleri düzenli olarak yapılıyor mu?",
        "alan_tipleri": [
          "Merdiven/Asansör"
        ],
        "tesis_geneli": true,
        "madde_sira": 48
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör",
          "Satış/Reyon Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 55
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışların önünde ve tüm yol boyunca kaçışı engelleyecek bir malzeme bulunmaması sağlanıyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Satış/Reyon Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 56
      },
      {
        "soru": "Yangın söndürücüleri mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 59
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 64
      }
    ]
  },
  "csgb_kasaplar": {
    "ad": "Kasaplar için Kontrol Listesi",
    "sektor_kod": "kasap",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplı ve iç zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Çalışanlar, soğuk hava deposunda buzlanmaya dikkat etmeleri ve buzlanma görüldüğünde giderilmesi konusunda bilgilendirilmiş mi?",
        "alan_tipleri": [
          "Soğuk Hava Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 17
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Çalışanların kesici ve/veya delici nitelikteki alet ve ekipmanlardan zarar görmemeleri için uygun nitelikte eldiven ve önlükler temin edilmekte mi?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "İçerisinde dönen aksamları bulunan elektrikli aletler ile yapılan çalışmalar sırasında gerekli önlemler alınıyor mu?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 29
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 39
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 49
      }
    ]
  },
  "csgb_sebze_meyve": {
    "ad": "Sebze ve Meyvelerin İşlenmesi ve Saklanması Sektörü için Kontrol Listesi",
    "sektor_kod": "sebze_meyve",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde tasarlanıyor ve iç ve dış zeminler (laboratuvar girişi, merdivenler vs.) düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Ayıklama/İşleme Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Raflar; duvarlara ve birbirlerine monte edilmiş, uygun bağlantı elemanlarıyla devrilmeleri engelleniyor ve tüm dolaplar duvarlara uygun şekilde sabitleniyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Makinelerin emniyet kilitleri mevcut ve çalışır durumda mı?",
        "alan_tipleri": [
          "Ayıklama/İşleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 43
      },
      {
        "soru": "Taşıyıcı bantların hareketli kısımlarına uzuv sıkışmasını önleyecek tedbirler alınıyor mu?",
        "alan_tipleri": [
          "Ayıklama/İşleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 52
      },
      {
        "soru": "Konservecilikte kullanılan basınçlı sterilizasyon kaplarının (otoklav vb.) periyodik kontrol ve bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Ayıklama/İşleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 64
      },
      {
        "soru": "Soğuk hava depolarının kapıları her iki taraftan da açılabilmekte mi?",
        "alan_tipleri": [
          "Soğuk Hava Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 74
      },
      {
        "soru": "Çalışanların forklift çatalında yüksek noktalara kaldırılması engelleniyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 76
      },
      {
        "soru": "Forklift sürücüleri, eğitim almışlar ve gerekli belgeleri bulunuyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 106
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 152
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Ayıklama/İşleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 154
      },
      {
        "soru": "Elektrik tesisatında uygun topraklama yapılmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 167
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 175
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 176
      },
      {
        "soru": "Yangın merdivenine açılan acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 177
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 197
      }
    ]
  },
  "csgb_kirmizi_et_kanatli": {
    "ad": "Kırmızı Et ve Kanatlı Hayvan İşleme Tesisleri için Kontrol Listesi",
    "sektor_kod": "kirmizi_et_kanatli",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde tasarlanıyor ve iç ve dış zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kesim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Özellikle hareketli parçaları olan makineler/aletler, üreticisinin talimatları doğrultusunda koruma panelleri veya ışık ızgarası vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Kesim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 37
      },
      {
        "soru": "Makinaların kazara/istemeden çalıştırılması engelleniyor ve makinaların acil durdurma mekanizmaları bulunuyor mu?",
        "alan_tipleri": [
          "Kesim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Kapalı makinelerin, tankların ya da siloların bakımı yapılırken bakımı yapan kişi için dışarıda bir gözlemci beklemesi sağlanıyor mu?",
        "alan_tipleri": [
          "Kesim Hattı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 44
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 83
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Kesim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 85
      },
      {
        "soru": "Forklift sürücülerinin, gerekli belgeleri bulunuyor ve kullandığı forklift modeline uygun olarak işe başlama eğitim almışlar mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 115
      },
      {
        "soru": "Gerektiğinde çalışanların toplanabileceği ve sığınabileceği kaçış alanları var mı?",
        "alan_tipleri": [
          "Kesim Hattı",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 128
      },
      {
        "soru": "Hayvanların asılması ve transferinde kullanılan zincirler ve kancalar düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kesim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 134
      },
      {
        "soru": "Soğuk hava depolarının kapıları arkadan açılabilmekte mi?",
        "alan_tipleri": [
          "Soğuk Hava Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 155
      },
      {
        "soru": "Gaz tüpleri bina içinde muhafaza ediliyorsa bu tüpler güvenli bağlantı parçaları ile sabitlenmiş mi?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 159
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 160
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 161
      },
      {
        "soru": "Amonyak sızıntısı tespiti için uygun dedektörler bulunuyor ve bu dedektörler uygun sayıda uygun yerlere yerleştiriliyor mu?",
        "alan_tipleri": [
          "Soğuk Hava Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 168
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 198
      }
    ]
  },
  "csgb_sut_urunleri": {
    "ad": "Süt Ürünleri İmalat Tesisleri için Kontrol Listesi",
    "sektor_kod": "sut_urunleri",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde tasarlanıyor ve iç ve dış zeminler (işyeri girişi, merdivenler vs.) düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Üretim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Raflar; duvarlara ve birbirlerine monte edilmiş, uygun bağlantı elemanlarıyla devrilmeleri engelleniyor ve tüm dolaplar duvarlara uygun şekilde sabitleniyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 20
      },
      {
        "soru": "Soğuk hava depolarının kapıları her iki taraftan da açılabilmekte mi?",
        "alan_tipleri": [
          "Soğuk Hava Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 45
      },
      {
        "soru": "Forklift sürücüleri, eğitim almışlar ve gerekli belgeleri bulunuyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 69
      },
      {
        "soru": "Özellikle hareketli parçaları olan makineler/aletler, üreticisinin talimatları doğrultusunda koruma panelleri veya ışık ızgarası vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Üretim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 102
      },
      {
        "soru": "Makinaların kazara/istemeden çalıştırılması engelleniyor ve makinaların acil durdurma mekanizmaları bulunuyor mu?",
        "alan_tipleri": [
          "Üretim Hattı",
          "Paketleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 105
      },
      {
        "soru": "Kapalı makinelerin, tankların ya da siloların bakımı yapılırken bakımı yapan kişi için dışarıda bir gözlemci beklemesi sağlanıyor mu?",
        "alan_tipleri": [
          "Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 110
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 145
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 147
      },
      {
        "soru": "Elektrik tesisatında uygun topraklama yapılmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 160
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 168
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 169
      },
      {
        "soru": "Yangın merdivenine açılan acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 170
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 190
      },
      {
        "soru": "Çalışanların sıcak yüzeyle ya da püsküren buharla temas edip yanması gibi tehlikelere karşı önlemler alınıyor mu?",
        "alan_tipleri": [
          "Üretim Hattı"
        ],
        "tesis_geneli": false,
        "madde_sira": 193
      }
    ]
  },
  "csgb_deri_tabaklama": {
    "ad": "Deri ve Tabaklama İşleri için Kontrol Listesi",
    "sektor_kod": "deri_tabaklama",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde tasarlanmış ve iç ve dış zeminler (işyeri girişi, merdivenler vs.) düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Tabaklama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Özellikle hareketli parçaları olan makineler/aletler, üreticisinin talimatları doğrultusunda koruma panelleri vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Tabaklama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 32
      },
      {
        "soru": "Makinaların kazara/istemeden çalıştırılması engelleniyor ve makinaların acil durdurma mekanizmaları bulunuyor mu?",
        "alan_tipleri": [
          "Tabaklama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Tabaklama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 38
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 39
      },
      {
        "soru": "Gaz veya toz gibi zarar verici emisyona sebep olabilecek kimyasal maddelerin açıkta bulunduğu işlemin yapıldığı yerde zararlı emisyona maruz kalmamak için vakum özelliği olan davlumbaz tesisatı veya benzeri bir sistem kurulmuş mu?",
        "alan_tipleri": [
          "Tabaklama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 53
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Kimyasal Depolama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 55
      },
      {
        "soru": "Birbirleri ile tepkimeye girerek tehlikeli salımlar oluşturabilecek kimyasal maddelerin ayrı yerlerde muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Kimyasal Depolama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 56
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 59
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 60
      },
      {
        "soru": "Yangın merdivenine açılan acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 61
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 75
      }
    ]
  },
  "csgb_basim_matbaa": {
    "ad": "Basım Sanayii ve Matbaalar için Kontrol Listesi",
    "sektor_kod": "basim_matbaa",
    "kritik_maddeler": [
      {
        "soru": "İşyeri içerisinde duvarlara monte edilmiş raflar, askılıklar ve benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Baskı Salonu",
          "Depo/Arşiv",
          "Mürekkep/Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Çalışma ortamında kullanılan kimyasalların gaz/buharlarının havaya yayılmasından veya süreçlerden kaynaklanan tozların yayılmasını önlemek için havalandırma sistemi kurulmuş ve düzenli olarak kontrolleri yapılıyor mu?",
        "alan_tipleri": [
          "Baskı Salonu",
          "Mürekkep/Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 16
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş ve yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Baskı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 19
      },
      {
        "soru": "Mürekkepleme, sıkıştırma, delme, ciltleme vb. süreçlerde kullanılan ve dönen parçalara sahip makine/ekipmanlar üreticisinin talimatları doğrultusunda koruma panelleri vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Baskı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 23
      },
      {
        "soru": "Tüm makinelerin acil durdurma sistemleri mevcut mu?",
        "alan_tipleri": [
          "Baskı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 29
      },
      {
        "soru": "Kimyasal maddelerin saklama koşullarına uyuluyor mu?",
        "alan_tipleri": [
          "Mürekkep/Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 41
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 44
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 49
      },
      {
        "soru": "Taşıyıcı bantların (konveyörlerin) kullanıldığı yerlerde özellikle bantların kesim, birleşim ve dönme noktalarında el, saç vb. sıkışması veya giysi yakalamasını engelleyecek koruyucu muhafazalar sağlanmış mı?",
        "alan_tipleri": [
          "Baskı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 60
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 71
      }
    ]
  },
  "csgb_boya_isleri": {
    "ad": "Boya İşleri için Kontrol Listesi",
    "sektor_kod": "boya_isleri",
    "kritik_maddeler": [
      {
        "soru": "Çalışma sırasında, çalışanların kullanımı için uygun yüz ve göz koruyucular ile uygun iş eldivenleri temin ediliyor ve çalışanların bunları kullanımları denetleniyor mu?",
        "alan_tipleri": [
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Çalışma alanında olası bir yangın riskine karşı yangın söndürücü ekipman bulunduruluyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 16
      },
      {
        "soru": "Çalışanların iskele, merdiven, kaldırma platformları gibi yüksek yerlerde çalışırken düşme riskine karşı gerekli tedbirler alınıyor mu?",
        "alan_tipleri": [
          "Boyahane",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      },
      {
        "soru": "Yüksek yerlerde boya yapan çalışanlar için emniyet kemerleri sağlanıyor ve çalışanların bu kemerleri kullanma durumları izleniyor mu?",
        "alan_tipleri": [
          "Boyahane",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 19
      },
      {
        "soru": "Boya yapılacak kapalı ortamda, gaz veya gaza sebep olabilecek bir kaynak bulunup bulunmadığı kontrol ediliyor mu?",
        "alan_tipleri": [
          "Boyahane"
        ],
        "tesis_geneli": false,
        "madde_sira": 23
      },
      {
        "soru": "Kapalı alanda yapılan çalışmalar sırasında yeterli havalandırma sağlanıyor mu?",
        "alan_tipleri": [
          "Boyahane",
          "Kurutma Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Çalışılan ortamda ortaya çıkabilecek patlama, yangın, ya da zehirlenme tehlikesi bulunan durumlara karşı tedbir alınıyor mu?",
        "alan_tipleri": [
          "Boyahane",
          "Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 44
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 49
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 59
      }
    ]
  },
  "csgb_duvarcilik_siva": {
    "ad": "Duvarcılık, Tuğla Örme ve Sıva İşleri için Kontrol Listesi",
    "sektor_kod": "duvarcilik_siva",
    "kritik_maddeler": [
      {
        "soru": "Çalışanların büyük araçların veya hareketli cihazların arkasında/arasında sıkışmalarını engelleyecek tedbirler alınmış mı?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "Çalışanların iskele, merdiven, kafes gibi yüksek yerlerde çalışırken düşme riskine karşı tüm tedbirler alınıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Güvenli olmayan zeminlerin / döşemelerin arasından/içinden düşme riski bulunmaması için açıklıklar kapatılıyor veya uygun şekilde çevreleniyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 12
      },
      {
        "soru": "Çatıda yapılan çalışmalar sırasında çalışanlar, yüksekten düşmeye karşı gerekli önleyici ve koruyucu (emniyet kemeri vb.) tedbirleri almaları konusunda uyarılıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 13
      },
      {
        "soru": "Yüksek bölümler sabit korkuluklar ve tırabzanlar ile çevrilmiş mi?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      },
      {
        "soru": "Tüm makinelerin acil durumda durdurma mekanizmaları mevcut mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 26
      },
      {
        "soru": "Çalışma ortamındaki elektrik tesisatı ve kabloların bakımları düzenli olarak yapılıyor ve açıkta bulunmaları engellenerek çalışanların elektrik ile temasına karşı tedbir alınıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası",
          "Malzeme Depo Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Malzeme Depo Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 50
      },
      {
        "soru": "Çalışanlar, acil durumlarda (yangın, deprem, ilk yardım gerektiren durumlar vb.) ne yapması gerektiği konusunda bilgilendirilmiş mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 58
      },
      {
        "soru": "Çalışanların, yüksekten düşen cisimler nedeniyle yaralanmasını önlemek için baş ve ayak koruyucular temin edilmiş ve çalışanlarca kullanımı sağlanıyor mu?",
        "alan_tipleri": [
          "Şantiye Sahası"
        ],
        "tesis_geneli": false,
        "madde_sira": 76
      },
      {
        "soru": "Çalışanların tetanoz aşıları tamamlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 85
      }
    ]
  },
  "csgb_kule_vincler": {
    "ad": "Kule Vinçler için Kontrol Listesi (Kurulum / İle Çalışma / Söküm)",
    "sektor_kod": "kule_vinc",
    "kritik_maddeler": [
      {
        "soru": "Kule vincin kurulacağı yerin zemin etüdü yapılmıştır ve betonarme altyapısı teknik gerekliliklere uygun hazırlanmıştır.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Kule vinç kurulum ekibinde çalışacak personel emniyet kemeri, baret, reflektörlü yelek, iş tulumu, iş eldiveni ve iş ayakkabısı vb. kişisel koruyucu donanım kullanmaktadır.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Kule vincin montaj sırasında devrilmesini engellemek için moment kuvvetleri göz önünde bulundurularak kuyruk denge ağırlıkları ve bom sırasına uygun şekilde ağırlıkların bir kısmı bomun montajından önce, kalan kısmı ise sonra yerleştirilmektedir.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Kule vinç kurulumu yapılan sahada havai elektrik, gaz, buhar vb. hatların tespiti yapılarak vinç çalışma alanı düzenlenmektedir. Çalışanlar hatların riskleri konusunda bilgilendirilmektedir.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 68
      },
      {
        "soru": "Elektrik panolarında kaçak akım rölesi mevcuttur ve periyodik kontrolleri yapılmaktadır.",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Operatör Kabini"
        ],
        "tesis_geneli": false,
        "madde_sira": 72
      },
      {
        "soru": "Kule vincin yetkisi olmayan kişilerce kullanılması engellenmektedir.",
        "alan_tipleri": [
          "Operatör Kabini"
        ],
        "tesis_geneli": false,
        "madde_sira": 111
      },
      {
        "soru": "Kule vinç ile malzeme taşınacak alandan çalışanların geçmesi engellenmekte, taşınan yük çalışanlar üzerinden ve şantiye sahası dışından geçirilmemektedir.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 115
      },
      {
        "soru": "Kule vinç ile beraber kullanılacak taşıma aksesuarlarının (sepet, halat, kanca, bez sapan, kilit-mapa vb.) periyodik kontrolleri ve bakımları yapılmaktadır. Kaldırma kapasiteleri işe uygun seçilmektedir.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 116
      },
      {
        "soru": "Operatörün kontrol ekranında anlık rüzgâr hızı okunmaktadır. Rüzgâr hızı saatte 50 km’yi geçtiğinde kule vinç ile çalışma yapılmamakta, 72 km’yi geçtiği zaman rüzgar freni açılarak vinç emniyetli şekilde terk edilmektedir.",
        "alan_tipleri": [
          "Operatör Kabini"
        ],
        "tesis_geneli": false,
        "madde_sira": 122
      },
      {
        "soru": "Vinç-bina bağlantı kolları gerekli yüksekliklerde ve sıklıkta yapılmaktadır ve düzenli kontrollerinin yapılması sağlanmaktadır.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 126
      },
      {
        "soru": "Kule vincin limit şalterlerinin periyodik kontrollerinin ve bakımlarının yapılması sağlanmaktadır ve devre dışı bırakılmasına izin verilmemektedir.",
        "alan_tipleri": [
          "Operatör Kabini",
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 133
      },
      {
        "soru": "Fren sistemlerinin periyodik kontrollerinin ve bakımlarının yapılması sağlanmaktadır, arızalı durumda çalıştırılmamaktadır.",
        "alan_tipleri": [
          "Operatör Kabini",
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 134
      },
      {
        "soru": "İnsan taşınmasına uygun olmayan ekipmanlar ile çalışanların taşınmasına engel olunmaktadır.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 136
      },
      {
        "soru": "Ayrıca görevlendirilmiş sapancı ve işaretçi bulunmaktadır.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 147
      },
      {
        "soru": "Kule vincin söküm sırasında devrilmesini engellemek için moment kuvvetleri göz önünde bulundurularak kuyruk denge ağırlıkları ve bom sırasına uygun şekilde ağırlıkların bir kısmı bomun sökümünden önce, kalan kısmı ise sonra sökülmektedir.",
        "alan_tipleri": [
          "Vinç Kurulum Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 248
      }
    ]
  },
  "csgb_ayakkabi_tamirhaneleri": {
    "ad": "Ayakkabı Tamirhaneleri için Kontrol Listesi",
    "sektor_kod": "ayakkabi_tamirhane",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış/kaymaz hale getirilmiş ve iç ve dış zeminler (işyeri girişi, merdivenler vs.) düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Özellikle hareketli parçaları olan makineler/aletler, üreticisinin talimatları doğrultusunda koruma panelleri vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 31
      },
      {
        "soru": "Makinaların kazara/istemeden çalıştırılması engelleniyor ve makinaların acil durdurma mekanizmaları bulunuyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 33
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 42
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 68
      },
      {
        "soru": "Kimyasalların kullanıldığı ve bulunduğu alanlarda yeterli havalandırma sağlanıyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 70
      },
      {
        "soru": "Çalışmalar sırasında parlayıcı ve yanıcı maddelerin kullanılması engelleniyor veya kullanımın zorunlu olduğu yerlerde çalışanların sağlık ve güvenliğine ilişkin önlemler alınıyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 73
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 78
      },
      {
        "soru": "İşyerinde yangın veya patlamaya sebep olabilecek tutuşturucu kaynakların (açık alev vb.) bulunması engelleniyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 79
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut mu ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 80
      },
      {
        "soru": "Yangın merdiveni kapıları/apartman kapısı/acil çıkışlar kilitli olmayıp her an açılabilir durumda mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 81
      },
      {
        "soru": "Yapıştırıcılar, boyalar gibi solunduğu zaman ciddi rahatsızlıklara neden olabilen kimyasallar ile yapılan çalışmalarda, çalışanların zararlı kimyasalları teneffüs etmelerini önleyen solunum koruyucular, çalışanların kullanımı için bulunduruluyor ve çalışanlarca kullanımı sağlanıyor mu?",
        "alan_tipleri": [
          "Tamirat Tezgahı"
        ],
        "tesis_geneli": false,
        "madde_sira": 94
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 96
      }
    ]
  },
  "csgb_kuaforler": {
    "ad": "Kuaförler için Kontrol Listesi",
    "sektor_kod": "kuafor",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplı ve iç ve dış zeminler (salon girişi, merdivenler vs.)düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kesim/Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 13
      },
      {
        "soru": "Elektrikli ekipmanlar ıslak ortam, su ve kimyasal içerikli ürünlerden uzak mı?",
        "alan_tipleri": [
          "Kesim/Boyama Alanı",
          "Manikür-Pedikür Alanı",
          "WC/Islak Hacim"
        ],
        "tesis_geneli": false,
        "madde_sira": 19
      },
      {
        "soru": "Kimyasal içerikleri nedeniyle alevlenebilir ürünler; ısı, ışık ve diğer malzemelerden uzakta ve malzeme güvenlik formuna/ talimatlara uygun şekilde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Kesim/Boyama Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 21
      },
      {
        "soru": "Yangın söndürücüleri mevcut ve son kullanma tarihleri kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 23
      },
      {
        "soru": "Çalışanlar, kimyasal maddeler ile çalışma sırasında cilt, göz, solunum vb. temasını önleyecek şekilde uygun nitelikte kişisel koruyucu donanımları (eldiven, maske vb.) kullanıyor mu?",
        "alan_tipleri": [
          "Kesim/Boyama Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Çalışma esnasında kullanılan aletlerin (makas, tarak, manikür araçları vb.) kullanım sonunda sterilizasyonu yapılıyor mu?",
        "alan_tipleri": [
          "Kesim/Boyama Alanı",
          "Manikür-Pedikür Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 42
      }
    ]
  },
  "csgb_kuru_temizlemeciler": {
    "ad": "Kuru Temizlemeciler için Kontrol Listesi",
    "sektor_kod": "kuru_temizleme",
    "kritik_maddeler": [
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 14
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Kimyasal Temizleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      },
      {
        "soru": "Buhar kazanlarının düzenli olarak bakımı ve periyodik kontrolleri yapılıyor mu?",
        "alan_tipleri": [
          "Kazan Dairesi",
          "Ütü/Presleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Makinelerin tüm hareketli parçaları uygun makine koruyucuları ile kapatılmış mı?",
        "alan_tipleri": [
          "Kimyasal Temizleme Alanı",
          "Ütü/Presleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "Özellikle klorlu çözücülerin (perkloroetilen vb.) kullanıldığı makinelerin düzenli kontrolü yapılıyor ve makineler, sızıntılara karşı devamlı olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Kimyasal Temizleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 31
      },
      {
        "soru": "Klorlu çözücülerin (perkloroetilen vb.) kullanıldığı çalışma ortamı uygun sistemlerle havalandırılıyor mu?",
        "alan_tipleri": [
          "Kimyasal Temizleme Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 32
      },
      {
        "soru": "Yangın merdiveni kapıları/apartman kapısı/acil çıkışlar kilitli olmayıp her an açılabilir durumda mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 37
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 52
      }
    ]
  },
  "csgb_gozlukcu_optisyen": {
    "ad": "Gözlükçüler ve Optisyenler için Kontrol Listesi",
    "sektor_kod": "gozlukcu_optisyen",
    "kritik_maddeler": [
      {
        "soru": "Zemin kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış/kaymaz hale getirilmiş mi ve iç zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Satış Alanı",
          "Muayene/Ölçüm Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "İşyeri içerisinde duvarlara monte edilmiş raflar, cam yüzeyler, dolaplar, askılıklar ve benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Satış Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 6
      },
      {
        "soru": "Var ise asma katın sağlamlığı ile asma kattan düşebilecek her türlü eşyanın kontrolü sağlanıyor ve gerekiyorsa buralar sağlamlaştırılıyor mu?",
        "alan_tipleri": [
          "Satış Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Makinelerin hareketli parçalarına karşı koruma önlemleri alınmış mı?",
        "alan_tipleri": [
          "Muayene/Ölçüm Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 38
      },
      {
        "soru": "Makinelerin kazara/istemeden çalıştırılması engelleniyor ve makinelerin acil durdurma düğmeleri bulunuyor mu?",
        "alan_tipleri": [
          "Muayene/Ölçüm Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 43
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 49
      },
      {
        "soru": "Tüm prizlere topraklama yapılmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Muayene/Ölçüm Alanı",
          "Satış Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 50
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 51
      },
      {
        "soru": "Kimyasal maddelerin (özellikle içerikleri nedeniyle alevlenebilir olanların) saklama koşullarına uyuluyor, bu malzemeler ısı, ışık ve diğer malzemelerden uzakta muhafaza edilmesi sağlanıyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Muayene/Ölçüm Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 85
      },
      {
        "soru": "Kimyasalların kullanıldığı ve bulunduğu alanlarda yeterli havalandırma sağlanıyor mu?",
        "alan_tipleri": [
          "Muayene/Ölçüm Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 87
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 95
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 97
      },
      {
        "soru": "Yangın merdiveni kapıları ve acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 99
      },
      {
        "soru": "Plastik akşamlara şekil vermede kullanılan ısıtıcı ve üfleyici cihazların kullanılmadığı durumlarda kapalı tutulmasına ve yakınlarda kimyasal madde bulunmamasına özen gösteriliyor mu?",
        "alan_tipleri": [
          "Muayene/Ölçüm Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 105
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 140
      }
    ]
  },
  "csgb_ozel_guvenlik": {
    "ad": "Özel Güvenlik Faaliyetleri için Kontrol Listesi",
    "sektor_kod": "ozel_guvenlik",
    "kritik_maddeler": [
      {
        "soru": "Özellikle hastaneler, alışveriş merkezleri gibi özel güvenlik hizmeti verilen çok hareketli yerlerde özel güvenlik görevlisinin can güvenliğini sağlayacak güvenlik tedbirleri (şifreli kapılar, girişler vb.) alınmış mıdır?",
        "alan_tipleri": [
          "Nöbet Kulübesi",
          "Kontrol Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 9
      },
      {
        "soru": "Özel güvenlik görevlisinin diğer kişilerle (meslektaşı, genel kolluk kuvveti, işvereni vb.) anında ve hızlı haberleşme imkanı (telefon, telsiz, alarm sistemi gibi) sağlanmış mıdır?",
        "alan_tipleri": [
          "Nöbet Kulübesi",
          "Kontrol Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 10
      },
      {
        "soru": "Silahlı korumanın sağlandığı yerlerde bulundurulan silahlar uygun ortamlarda muhafaza edilmekte midir ve bakımları uzman personel tarafından düzenli olarak yapılmakta mıdır?",
        "alan_tipleri": [
          "Kontrol Odası",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Tarayıcılar veya X-ray cihazları özel eğitim almış çalışanlar tarafından ve gerekli önlemler alınarak kullanılmakta mıdır?",
        "alan_tipleri": [
          "Kontrol Odası",
          "Nöbet Kulübesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 26
      },
      {
        "soru": "Özel güvenlik büroları ve hizmet verilen alanlarda elektrik/sigorta kutuları kilitlenmiş midir ve bu kutulara yetkisiz kişilerin erişimleri önlenmiş midir?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Nöbet Kulübesi",
          "Kontrol Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 39
      },
      {
        "soru": "Özel güvenlik büroları ve hizmet verilen alanlarda belirli yerlerde yangın söndürücüleri mevcut mudur, son kullanma tarihleri ve basınçları kontrol edilmekte midir?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 43
      },
      {
        "soru": "Özel güvenlik büroları ve hizmet verilen alanlarda yangın merdivenine açılan acil çıkış kapıları kilitli midir ve bu kapılar dışa doğru açılacak şekilde tasarlanmış mıdır?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 45
      },
      {
        "soru": "Silahlı koruma sağlayan özel güvenlik görevlileri için psikolojik testler yaptırılmakta mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 49
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri zamanında yaptırılmakta mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 53
      }
    ]
  },
  "csgb_konaklama": {
    "ad": "Konaklama Hizmetleri için Kontrol Listesi",
    "sektor_kod": "konaklama",
    "kritik_maddeler": [
      {
        "soru": "Binanın iç ve dış zeminleri (bina girişi, katlar, merdivenler vs.) kayma veya düşmeyi önleyecek şekilde uygun malzeme ile kaplanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlı mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 20
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş ve yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Tüm asansörler, düzenli olarak kontrol ediliyor ve bu asansörlerin periyodik bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Merdiven/Asansör"
        ],
        "tesis_geneli": true,
        "madde_sira": 33
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an dışarı doğru açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 42
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ile basınçları periyodik olarak kontrol edilerek bakımları yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 45
      },
      {
        "soru": "Otomatik yangın algılama ve uyarı sistemi (sesli ve ışıklı uyarı) çalışır durumda ve bakımları yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 46
      },
      {
        "soru": "Çatıda yapılan çalışmalar sırasında çalışanların, yüksekten düşmeye karşı gerekli önleyici ve koruyucu (emniyet kemeri vb.) tedbirleri almaları sağlanıyor mu?",
        "alan_tipleri": [
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 49
      },
      {
        "soru": "Kimyasal maddeler ve haşere ilaçları, yetkisiz kişilerin erişemeyeceği ve satıcıların talimatlarına uygun yerlerde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Çamaşırhane"
        ],
        "tesis_geneli": false,
        "madde_sira": 53
      },
      {
        "soru": "Kazanın bakımı ile bacaların temizliği ve kontrolü yetkili kişi/kuruluşlara periyodik olarak yaptırılıyor mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 72
      },
      {
        "soru": "Doğal gazlı yakıtın kullanıldığı kazan dairesinde, gaz kaçağına karşı dedektör ve alarm gibi sinyal vericiler mevcut mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 76
      },
      {
        "soru": "Fuel-oil, doğal gaz, LPG vb. yakıtlı kazan dairesinde ve dışında acil yakıt kesme vanası mevcut mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 77
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik sağlık muayeneleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 82
      }
    ]
  },
  "csgb_havuz_spor": {
    "ad": "Havuz ve Spor Merkezleri için Kontrol Listesi",
    "sektor_kod": "havuz_spor",
    "kritik_maddeler": [
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 18
      },
      {
        "soru": "Acil durumlar için kapsamlı ilk yardım çantası, sedye ve kurtarma araçları mevcut mu?",
        "alan_tipleri": [
          "Havuz Alanı",
          "İlkyardım Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Havuzlarda sertifikalı cankurtaran görev yapıyor mu?",
        "alan_tipleri": [
          "Havuz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 23
      },
      {
        "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an dışarı doğru açılabilir durumda tutuluyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 26
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ile basınçları periyodik olarak kontrol edilerek bakımları yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 27
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 29
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 31
      },
      {
        "soru": "Elektrik tesisatında topraklama mevcut mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 34
      },
      {
        "soru": "Prizler ve elektrikli aletler ıslanma ihtimali olmayan yerlerde mi bulunuyor?",
        "alan_tipleri": [
          "Havuz Alanı",
          "WC/Islak Hacim",
          "Soyunma Yeri"
        ],
        "tesis_geneli": false,
        "madde_sira": 35
      },
      {
        "soru": "Havuz tabanı, merdiven basamakları ve havuz kenarındaki gezinti alanları kir tutmayan, kolay temizlenebilen, hijyenik ve kaygan olmayan bir malzemeyle kaplı mı?",
        "alan_tipleri": [
          "Havuz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 38
      },
      {
        "soru": "Havuz suyunda serbest klor miktarı “Yüzme Havuzlarının Tabi Olacağı Sağlık Esasları Ve Şartları Hakkında Yönetmelik” ’te belirtilen sınır değerleri geçmemekte mi?",
        "alan_tipleri": [
          "Havuz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 50
      },
      {
        "soru": "Yeterli sayıda ve görülebilir yerlerde havuzun derinliğini gösterir yazılar var mı?",
        "alan_tipleri": [
          "Havuz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 57
      },
      {
        "soru": "Halter ve ağırlık makinelerinde kullanılan bağlantı elemanları uygun ve doğru şekilde kullanılmakta mı?",
        "alan_tipleri": [
          "Spor Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 62
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılmakta mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 90
      }
    ]
  },
  "csgb_genel_yolcu_tasimaciligi": {
    "ad": "Kara Yolu ile Yapılan Yolcu Taşımacılığı İşleri için Kontrol Listesi",
    "sektor_kod": "genel_yolcu_tasimaciligi",
    "kritik_maddeler": [
      {
        "soru": "Araçların servis ve bakımları periyodik olarak yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 12
      },
      {
        "soru": "Yükler, acil çıkış yollarını veya kapıları kapatıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Araçlarda yangın söndürücüler mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 16
      },
      {
        "soru": "Lipit Petrol Gazı (LPG) ile çalışan araçların LPG tanklarının kontrolleri düzenli olarak yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Araçların güvenlik donanımları çalışır durumda mıdır?",
        "alan_tipleri": [],
        "tesis_geneli": false,
        "madde_sira": 26
      },
      {
        "soru": "Çalışanlara, sürüş sırasında emniyet kemerlerinin takılması konusunda talimat veriliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 29
      },
      {
        "soru": "Çalışanların işe giriş muayenesi yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 42
      }
    ]
  },
  "csgb_taksi": {
    "ad": "Taksi ile Yolcu Taşımacılığı için Kontrol Listesi",
    "sektor_kod": "taksi",
    "kritik_maddeler": [
      {
        "soru": "Duraktaki elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 11
      },
      {
        "soru": "Durak ofisi ve taksilerde yangın söndürücüleri mevcut ve son kullanma tarihleri ve basınçları kontrol edilmekte mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 13
      },
      {
        "soru": "Elektrikli ısıtıcı vb. cihazlar kullanılıyorsa, devrilme ihtimaline karşı gerekli tedbirler alınmış ve yanıcı malzemelerle temas etmeyecek şekilde yerleştirilmiş mi?",
        "alan_tipleri": [
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Lipit Petrol Gazı (LPG) ile çalışan taksilerin LPG tanklarının kontrolleri düzenli olarak yapılmakta mı?",
        "alan_tipleri": [
          "Araç Park Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 16
      },
      {
        "soru": "Araçların güvenlik donanımları sağlam ve çalışır durumda mı?",
        "alan_tipleri": [
          "Araç Park Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 20
      },
      {
        "soru": "Çalışanlar, sürüş sırasında emniyet kemerlerinin takılması konusunda talimatlandırılmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 23
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılmakta mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 30
      }
    ]
  },
  "csgb_kargo_transfer": {
    "ad": "Kargo Transfer Merkezleri için Kontrol Listesi",
    "sektor_kod": "kargo_transfer",
    "kritik_maddeler": [
      {
        "soru": "Kayma-takılma-düşmeye neden olabilecek herhangi bir etmen veya gelişi güzel yerleştirilmiş kargolar var mı?",
        "alan_tipleri": [
          "Ayrıştırma Alanı",
          "Yükleme/Boşaltma Rampası"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "İşyeri içerisinde duvarlara monte edilmiş raflar, askılıklar ve benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Ayrıştırma Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 18
      },
      {
        "soru": "Makinelerin kazara/istemeden çalıştırılması engelleniyor ve makinelerin acil durdurma düğmeleri bulunuyor mu?",
        "alan_tipleri": [
          "Ayrıştırma Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 41
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş ve yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Ayrıştırma Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 46
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 52
      },
      {
        "soru": "Birbirleri ile tepkimeye girerek tehlikeli salımlar oluşturabilecek maddeleri içeren kargoların ayrı yerlerde muhafaza edilmesi ve taşınması sağlanıyor mu?",
        "alan_tipleri": [
          "Ayrıştırma Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 86
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 88
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 89
      },
      {
        "soru": "Yangın merdiveni kapıları ve acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 91
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 103
      },
      {
        "soru": "Yüksek istifleme yapılan bölümlerdeki yükler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Ayrıştırma Alanı",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 111
      },
      {
        "soru": "Genel trafik ve yaya yolu birbirinden ayrılmış mı?",
        "alan_tipleri": [
          "Yükleme/Boşaltma Rampası",
          "Bahçe/Dış Alan",
          "Otopark"
        ],
        "tesis_geneli": false,
        "madde_sira": 112
      },
      {
        "soru": "Sürücülerin araç kullanma eğitim ve yetkinliği, gerekli sürücü sertifikaları mevcut mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 118
      },
      {
        "soru": "Yükleme boşaltma alanları çalışanların düşmesini engelleyecek şekilde korkuluklarla çevrilmiş mi?",
        "alan_tipleri": [
          "Yükleme/Boşaltma Rampası"
        ],
        "tesis_geneli": false,
        "madde_sira": 130
      },
      {
        "soru": "Çalışanların büyük araçlar arkasında sıkışmalarını engelleyecek tedbirler alınmış mı?",
        "alan_tipleri": [
          "Yükleme/Boşaltma Rampası"
        ],
        "tesis_geneli": false,
        "madde_sira": 131
      }
    ]
  },
  "csgb_havalimani_hangar": {
    "ad": "Havaalanı/Limanı Hangar Faaliyetleri için Kontrol Listesi",
    "sektor_kod": "havalimani_hangar",
    "kritik_maddeler": [
      {
        "soru": "Merdiven ve yükseltilebilen seyyar iş platformları çalışmalar esnasında yere sabitlenmektedir.",
        "alan_tipleri": [
          "Yükseltilmiş Platform Alanı",
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 5
      },
      {
        "soru": "Çalışanlar, platformlarda yüksekten düşmeye karşı emniyet kemeri, kanatlarda yada uçağın üst yüzeyinde yapılan çalışmalarda ise vakumlu kit gibi kişisel koruyucu donanımlar kullanmaktadır.",
        "alan_tipleri": [
          "Yükseltilmiş Platform Alanı",
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 13
      },
      {
        "soru": "Hangar zemini kaymayı önleyici uygun malzeme ile kaplanmıştır ve düzenli olarak kontrol edilmektedir.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 24
      },
      {
        "soru": "Makine ve iş ekipmanlarının acil durdurma düğmeleri çalışanların uzanabileceği konumda ve çalışır durumdadır.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 38
      },
      {
        "soru": "Yakıt tankına, içerisindeki hava miktarı ölçülerek girilmektedir. Oksijen miktarı düzeyi ve duman, gaz vb. tehlikeler sürekli izlenmektedir.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 77
      },
      {
        "soru": "Hangara alınan uçak bakıma alınmadan topraklanmaktadır.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 91
      },
      {
        "soru": "Elektrik panolarına yetkisiz kişilerin erişimi engellenmiştir.",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 95
      },
      {
        "soru": "Elektrik panolarında kaçak akım rölesi mevcuttur ve periyodik kontrolleri yapılmaktadır.",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 98
      },
      {
        "soru": "Kimyasalların bulunduğu ortamlarda aydınlatma ve havalandırma tertibatı alev sızdırmaz (exproof) özelliktedir.",
        "alan_tipleri": [
          "Hangar",
          "Depo/Arşiv"
        ],
        "tesis_geneli": false,
        "madde_sira": 104
      },
      {
        "soru": "Yangın söndürücüler yeterli sayıdadır, çalışır durumdadır ve periyodik kontrolleri yapılmaktadır.",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 108
      },
      {
        "soru": "Yangın ve patlama tehlikesinin erken fark edilmesini sağlayacak yangın ve gaz dedektörleri gibi algılama sistemleri bulunmaktadır ve çalışır durumdadır.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 109
      },
      {
        "soru": "Hangarda bakıma girmeden önce uçakta bulunan yakıt tankları boşaltılmaktadır.",
        "alan_tipleri": [
          "Hangar"
        ],
        "tesis_geneli": false,
        "madde_sira": 116
      },
      {
        "soru": "Acil çıkış yolları ve kapıları doğrudan dışarıya veya güvenli bir alana açılmaktadır ve çıkışı önleyecek hiçbir engel bulunmamaktadır.",
        "alan_tipleri": [
          "Hangar",
          "Koridor"
        ],
        "tesis_geneli": false,
        "madde_sira": 121
      },
      {
        "soru": "Acil eylem planı mevcuttur.",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 147
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yaptırılmaktadır.",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 154
      }
    ]
  },
  "csgb_tarim": {
    "ad": "Tarım İşleri için Kontrol Listesi",
    "sektor_kod": "tarim",
    "kritik_maddeler": [
      {
        "soru": "Kimyasal maddelere yetkisiz kişilerin erişimi engelleniyor mu?",
        "alan_tipleri": [
          "İlaç-Gübre Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 24
      },
      {
        "soru": "Çalışma alanında biyogaz birikme tehlikesine karşın atık depolama bölümleri var mı? (Tezek depolama alanı, hayvan atık alanı vb.)",
        "alan_tipleri": [
          "Ahır/Ağıl",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 27
      },
      {
        "soru": "Güvenlik ekipmanı pestisitleri kullanan, uygulayan, taşıyan veya pestisitlerle uğraşan kişilere tahsis ediliyor mu ve ekipman çalışır durumda mı? (Uygun KKD)",
        "alan_tipleri": [
          "Tarla/Arazi",
          "İlaç-Gübre Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 39
      },
      {
        "soru": "Pestisit ve kimyasal gübrelerin (bitki besleme kimyasalları) depolama alanları, birinci katla sınırlı veya dışarıya direk erişimi bulunan alanlar mı?",
        "alan_tipleri": [
          "İlaç-Gübre Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Kuyruk milleri (PTO) için koruyucu kullanılıyor mu ve kullanılan koruyucular uygun mu?",
        "alan_tipleri": [
          "Tarla/Arazi",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 62
      },
      {
        "soru": "Makinelerin kazara/istemeden çalıştırılması engelleniyor ve makinelerin acil durdurma düğmeleri bulunuyor mu?",
        "alan_tipleri": [
          "Tarla/Arazi",
          "Ahır/Ağıl"
        ],
        "tesis_geneli": false,
        "madde_sira": 63
      },
      {
        "soru": "Tarım, alet makinalarını kullanan operatörlerin ilgili belgeleri var mı? (traktör, biçerdöver ehliyeti vs.)",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 69
      },
      {
        "soru": "Eski traktör kabinleri güvenlik kafesi (roll-bar) ile donatılmış mı?",
        "alan_tipleri": [
          "Tarla/Arazi",
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 75
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Ahır/Ağıl"
        ],
        "tesis_geneli": false,
        "madde_sira": 95
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 97
      },
      {
        "soru": "Çalışma alanlarında özellikle riskli bölgelere (kimyasal depoları, çamurlu çukurlar ve su birikintileri, rezervuarlar, tahıl alım yerleri ve tahıl ambarları gibi) çocukların erişiminin engellenmesi için önlemler alınıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 101
      },
      {
        "soru": "Çalışma sahası tarla içerisindeki elektrik ve yüksek gerilim hatlarına kabul edilebilir uzaklıkta mı?",
        "alan_tipleri": [
          "Tarla/Arazi"
        ],
        "tesis_geneli": false,
        "madde_sira": 108
      },
      {
        "soru": "İşletmenin acil durum planı var mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 129
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 136
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yapılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 140
      }
    ]
  },
  "csgb_hayvansal_uretim": {
    "ad": "Hayvansal Üretim Faaliyetleri için Kontrol Listesi",
    "sektor_kod": "hayvansal_uretim",
    "kritik_maddeler": [
      {
        "soru": "Zemin, kayma veya düşmeyi mümkün olduğunca önleyecek şekilde tasarlanmış ve iç ve dış zeminler düzenli olarak kontrol ediliyor mu?",
        "alan_tipleri": [
          "Ahır/Ağıl",
          "Sağım Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 0
      },
      {
        "soru": "Tahıl, yem ve silaj depolama alanlarına girişler kapalı ve kilitli tutuluyor mu?",
        "alan_tipleri": [
          "Yem Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 19
      },
      {
        "soru": "Silo gibi kapalı alanların bakım ve temizliği yapılırken dışarıda bir gözlemci bulunduruluyor mu?",
        "alan_tipleri": [
          "Yem Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 22
      },
      {
        "soru": "Özellikle hareketli parçaları olan makineler/aletler, üreticisinin talimatları doğrultusunda koruma panelleri vb. önlemler ile koruma altına alınmış mı?",
        "alan_tipleri": [
          "Sağım Alanı",
          "Yem Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 34
      },
      {
        "soru": "Makinelerin kazara/istemeden çalıştırılması engelleniyor ve makinelerin acil durdurma düğmeleri bulunuyor mu?",
        "alan_tipleri": [
          "Sağım Alanı",
          "Yem Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 37
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano",
          "Ahır/Ağıl"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 41
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 69
      },
      {
        "soru": "Yeterli sayıda yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 70
      },
      {
        "soru": "Çalışanların işe giriş muayeneleri ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 86
      },
      {
        "soru": "Eski traktör kabinleri güvenlik kafesi (roll-bar) ile donatılmış mı?",
        "alan_tipleri": [
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 100
      },
      {
        "soru": "Hayvanlarla çalışırken en az iki yolu olan çıkış planlanmış mı?",
        "alan_tipleri": [
          "Ahır/Ağıl",
          "Sağım Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 104
      },
      {
        "soru": "Tüm kafes, kapı, yükleme oluğu ve çitler iyi durumda ve sağlam mı?",
        "alan_tipleri": [
          "Ahır/Ağıl"
        ],
        "tesis_geneli": false,
        "madde_sira": 113
      },
      {
        "soru": "Çalışma sahası çiftlik içerisindeki elektrik ve yüksek gerilim hatlarına kabul edilebilir uzaklıkta mı?",
        "alan_tipleri": [
          "Bahçe/Dış Alan"
        ],
        "tesis_geneli": false,
        "madde_sira": 116
      },
      {
        "soru": "Çocukların tehlikeli alanlara (çalışma alanları, hareket eden makinelerin civarı, yükseklik, depolama alanları, hayvanların bulunduğu bölmeler vb.) girişleri engelleniyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 117
      }
    ]
  },
  "csgb_odun_uretimi": {
    "ad": "Odun Üretim İşlerinde Risk Değerlendirme Kontrol Listesi",
    "sektor_kod": "odun_uretimi",
    "kritik_maddeler": [
      {
        "soru": "Alanda özel durumlar (enerji nakil hattı, su isale hattı, yol trafiği vb.) biliniyor mu?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 2
      },
      {
        "soru": "İstiflerin yapısı ve yüksekliği güvenlik kurallarına uygun mu?",
        "alan_tipleri": [
          "Kurutma/Depo Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 11
      },
      {
        "soru": "Çalışan gerekli kişisel koruyuculara sahip midir? -Baret -Güvenli ayakkabı -Kulak koruyucu (kesmede) -Göz ve yüz koruyucu (kesmede) -Testere korumalı pantolon (kesmede) -Reflektörlü yelek -Eldiven",
        "alan_tipleri": [
          "Kesim Alanı",
          "Kurutma/Depo Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 12
      },
      {
        "soru": "Motorlu testere aşağıdaki güvenlik donanımlarına sahip mi? -Vibrasyon azaltıcı sistem -Zincir yakalayıcı -Gaz kilidi -Ön el koruyucu zincir freni -Arka (sağ) el koruyucu -Emniyetli zincir -Zincir kılıfı -Durdurma (stop) düğmesi -Susturucu",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      },
      {
        "soru": "Problemli/tehlikeli ağaçlar (aşırı eğik, çürük, çok gövdeli, çatal, kökünden sökülmüş devrik vb)değerlendirilmiş mi?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 24
      },
      {
        "soru": "Kesime başlanmadan önce kaçış yolu engellerden(taş, diri örtü, ölü örtü vs.) temizlenmiş mi?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 26
      },
      {
        "soru": "Çalışanlar ağaç devrilmeye başladığında kaçış yolunda güvenli bir mesafeye uzaklaşıyor mu? (ağaç dibinden minimum 6 metre)",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 27
      },
      {
        "soru": "Diğer çalışanlarla güvenlik mesafesi (en az iki ağaç boyu) korunuyor mu?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "Sürütücü ve tarım traktörleri gerekli güvenlik donanımlarına sahip mi? -Güvenli bir kabin ve arka camda koruyucu çelik kafes -Radyatör koruyucusu (delinmeye karşı korunmak için) -Lastik sübap koruyucuları (sübap gövdelerinin kırılmasını önlemek için) - Ön ağırlık ya da dozer bıçağı (denge sağlamak için) -Ön lamba korumaları -On iki katlı lastik (delinmeyi önlemek için) -Motor koruyucuları -Kartel koruyucu (kolayca arızalanabilecek parçaları korumak için) -Egzoz borusu üzerindeki kıvılcım tutucu (alev almayı önlemek için) -Kaymaz yüzeye sahip basamaklar -Güç mili koruyucusu -İlk yardım çantası -Yangın söndürme tüpleri -Zincir/ halat -Takoz",
        "alan_tipleri": [
          "Kurutma/Depo Alanı",
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 54
      },
      {
        "soru": "Emniyet kemeri takılıyor mu?",
        "alan_tipleri": [
          "Kesim Alanı",
          "Kurutma/Depo Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 57
      },
      {
        "soru": "Makine kullanan çalışanların ehliyeti ve iş makinesi belgesi var mı?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 77
      },
      {
        "soru": "Fırtına ve yıldırım tehlikesine karşı koruyucu tedbirler biliniyor mu?",
        "alan_tipleri": [
          "Kesim Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 88
      },
      {
        "soru": "Yangın söndürücüler mevcut ve son kullanma tarihleri ile basınçları periyodik olarak kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 92
      },
      {
        "soru": "Çalışanın sağlık gözetimi periyodik olarak yapılıyor ve kayıt altına alınıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 108
      }
    ]
  },
  "csgb_laboratuvarlar": {
    "ad": "Laboratuvarlar için Kontrol Listesi",
    "sektor_kod": "laboratuvar",
    "kritik_maddeler": [
      {
        "soru": "Bütün laboratuvarlarda göz duşu ve güvenlik duşu bulunuyor mu?",
        "alan_tipleri": [
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Çeker ocakların periyodik bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 52
      },
      {
        "soru": "Laboratuvarda uygun şekilde yerleştirilmiş ve yeterli sayıda gaz dedektörleri bulunuyor mu?",
        "alan_tipleri": [
          "Deney/Analiz Alanı",
          "Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 68
      },
      {
        "soru": "İşyerinde, acil durum planı hazırlanmış ve laboratuvar için muhtemel tüm acil durumlar (yangın, patlama, tehlikeli kimyasal madde yayılımı, doğal afet, sabotaj ihtimali vb.) belirlenmiş mi?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 107
      },
      {
        "soru": "Yeterli sayıda ve uygun tipte yangın söndürücü mevcut ve son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 112
      },
      {
        "soru": "Yangın merdivenine açılan acil çıkış kapıları kilitli olmayıp dışa doğru açılacak şekilde tasarlanmış mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 114
      },
      {
        "soru": "Kimyasal içerikleri nedeniyle alevlenebilir ürünler; ısı, ışık ve diğer malzemelerden uzakta ve güvenlik bilgi formuna/ talimatlara uygun şekilde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Kimyasal Deposu",
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 126
      },
      {
        "soru": "Gaz silindirlerinin bulunduğu odalarda ve çalışıldığı cihazlarda herhangi bir tehlike anında gazı kesecek olan ana kapama vanası ile elektrik akımını kesecek ana devre kesici ve ana elektrik panosu, gaz silindirlerinin bulunduğu ve kullanıldığı ortamlar dışında kolayca ulaşılabilecek bir yerde bulunmakta mı?",
        "alan_tipleri": [
          "Deney/Analiz Alanı",
          "Kimyasal Deposu"
        ],
        "tesis_geneli": false,
        "madde_sira": 129
      },
      {
        "soru": "Raflar; duvarlara ve birbirlerine monte edilmiş, uygun bağlantı elemanlarıyla devrilmeleri engellenmiş mi?",
        "alan_tipleri": [
          "Kimyasal Deposu",
          "Numune Deposu",
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 151
      },
      {
        "soru": "Yanıcı malzemeler ateşleme kaynağından uzakta depolanıyor ve kullanılıyor mu?",
        "alan_tipleri": [
          "Kimyasal Deposu",
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 166
      },
      {
        "soru": "Gaz silindirleri depolama alanının sabit bir noktasına standartlarda belirtilen yüksekliğinden zincirlerle bağlanarak depolanıyor mu?",
        "alan_tipleri": [
          "Kimyasal Deposu",
          "Deney/Analiz Alanı"
        ],
        "tesis_geneli": false,
        "madde_sira": 172
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 177
      },
      {
        "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 179
      },
      {
        "soru": "Elektrik sisteminde uygun topraklama yapılmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 192
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 223
      }
    ]
  },
  "csgb_apartmanlar": {
    "ad": "Apartmanlar için Kontrol Listesi",
    "sektor_kod": "apartman_bina_site",
    "kritik_maddeler": [
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 12
      },
      {
        "soru": "Elektrik kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 14
      },
      {
        "soru": "Asansörler düzenli olarak kontrol ediliyor ve periyodik bakımları yapılıyor mu?",
        "alan_tipleri": [
          "Merdiven/Asansör"
        ],
        "tesis_geneli": true,
        "madde_sira": 23
      },
      {
        "soru": "Yangın merdiveni kapıları/apartman kapısı/acil çıkışlar kilitli olmayıp her an açılabilir durumda mı?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 28
      },
      {
        "soru": "Yangın söndürücüleri mevcut ve son kullanma tarihleri kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 33
      },
      {
        "soru": "Çatıda yapılan çalışmalar sırasında çalışanlar, yüksekten düşmeye karşı gerekli önleyici ve koruyucu (emniyet kemeri vb.) tedbirleri almaları konusunda uyarılıyor mu?",
        "alan_tipleri": [
          "Çatı Katı"
        ],
        "tesis_geneli": false,
        "madde_sira": 36
      },
      {
        "soru": "Kimyasal maddeler ve haşere ilaçları, yetkisiz kişilerin erişemeyeceği ve satıcıların talimatlarına uygun yerlerde muhafaza ediliyor mu?",
        "alan_tipleri": [
          "Depo/Arşiv",
          "Su Deposu/Hidrofor Odası"
        ],
        "tesis_geneli": false,
        "madde_sira": 40
      },
      {
        "soru": "Kaloriferci “Yetkili Kaloriferci Ateşçi Belgesine sahip mi?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": true,
        "madde_sira": 55
      },
      {
        "soru": "Doğal gazlı yakıtın kullanıldığı kazan dairesinde, gaz kaçağına karşı dedektör ve alarm mevcut mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 61
      },
      {
        "soru": "Fuel-oil, doğal gaz, LPG vb. yakıtlı kazan dairesinde ve dışında acil yakıt kesme vanası mevcut mu?",
        "alan_tipleri": [
          "Kazan Dairesi"
        ],
        "tesis_geneli": false,
        "madde_sira": 62
      },
      {
        "soru": "Çalışanların işe giriş ve periyodik muayeneleri zamanında yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 70
      }
    ]
  },
  "csgb_cagri_merkezleri": {
    "ad": "Çağrı Merkezleri için Kontrol Listesi",
    "sektor_kod": "cagri_merkezi",
    "kritik_maddeler": [
      {
        "soru": "Duvarlara monte edilmiş raflar veya benzeri diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
        "alan_tipleri": [
          "Çağrı Salonu",
          "Ofis"
        ],
        "tesis_geneli": false,
        "madde_sira": 3
      },
      {
        "soru": "Kaçak akım rölesi ana elektrik hattına bağlı mı?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": true,
        "madde_sira": 16
      },
      {
        "soru": "Elektrik ve sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önleniyor mu?",
        "alan_tipleri": [
          "Elektrik Odası/Pano"
        ],
        "tesis_geneli": false,
        "madde_sira": 17
      },
      {
        "soru": "Yangın söndürücüler mevcut mu? Son kullanma tarihleri ve basınçları kontrol ediliyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 20
      },
      {
        "soru": "Yangın merdiveni kapıları ve acil çıkışlar kilitli değil ve her an açılabilir durumda mı? Acil çıkış için kullanılacak tüm kapılar dışarıya doğru açılıyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör"
        ],
        "tesis_geneli": false,
        "madde_sira": 24
      },
      {
        "soru": "Acil çıkışların önünde ve tüm yol boyunca kaçışı engelleyecek bir malzeme bulunmaması sağlanıyor mu?",
        "alan_tipleri": [
          "Koridor",
          "Merdiven/Asansör",
          "Çağrı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 25
      },
      {
        "soru": "Çalışanlara temin edilen kulaklıkların ses seviyeleri ayarlanabilir düzeydedir. Kulaklıklarda ani yükselmeleri engelleyecek sistem bulunuyor mu?",
        "alan_tipleri": [
          "Çağrı Salonu"
        ],
        "tesis_geneli": false,
        "madde_sira": 39
      },
      {
        "soru": "Çalışanların işe giriş raporları ve periyodik kontrolleri yaptırılıyor mu?",
        "alan_tipleri": [],
        "tesis_geneli": true,
        "madde_sira": 41
      }
    ]
  }
};
const SEKTOR_KAYNAKLARI = {
  "_evrensel": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "eczane": [
    "csgb_eczaneler",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "dis_klinik": [
    "csgb_dis_klinik",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "ofis": [
    "csgb_ofisler",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "cagri_merkezi": [
    "csgb_cagri_merkezleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "bakkal_market": [
    "csgb_bakkal_market",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kasap": [
    "csgb_kasaplar",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "sebze_meyve": [
    "csgb_sebze_meyve",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kirmizi_et_kanatli": [
    "csgb_kirmizi_et_kanatli",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "sut_urunleri": [
    "csgb_sut_urunleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "mutfak_lokanta": [
    "csgb_mutfak_lokanta",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "tekstil": [
    "csgb_tekstil",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "deri_tabaklama": [
    "csgb_deri_tabaklama",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "ahsap_mobilya": [
    "csgb_ahsap_mobilya",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "basim_matbaa": [
    "csgb_basim_matbaa",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "boya_isleri": [
    "csgb_boya_isleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "genel_imalat": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "santiye_insaat": [
    "csgb_kucuk_insaatlar",
    "csgb_cephe_iskeleleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "duvarcilik_siva": [
    "csgb_duvarcilik_siva",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kule_vinc": [
    "csgb_kule_vincler",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "arac_tamirhane": [
    "csgb_arac_tamirhaneleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "ayakkabi_tamirhane": [
    "csgb_ayakkabi_tamirhaneleri",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kuafor": [
    "csgb_kuaforler",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kuru_temizleme": [
    "csgb_kuru_temizlemeciler",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "gozlukcu_optisyen": [
    "csgb_gozlukcu_optisyen",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "ozel_guvenlik": [
    "csgb_ozel_guvenlik",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "konaklama": [
    "csgb_konaklama",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "havuz_spor": [
    "csgb_havuz_spor",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "genel_yolcu_tasimaciligi": [
    "csgb_genel_yolcu_tasimaciligi",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "taksi": [
    "csgb_taksi",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kargo_transfer": [
    "csgb_kargo_transfer",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "havalimani_hangar": [
    "csgb_havalimani_hangar",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "tarim": [
    "csgb_tarim",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "seracilik": [
    "csgb_seracilik",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "hayvansal_uretim": [
    "csgb_hayvansal_uretim",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "odun_uretimi": [
    "csgb_odun_uretimi",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "laboratuvar": [
    "csgb_laboratuvarlar",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "apartman_bina_site": [
    "csgb_apartmanlar",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "egitim_kurumu": [
    "meb_kl01_okul_ortak_alanlar",
    "meb_kl02_acil_plan",
    "meb_kl03_atolyeler",
    "meb_kl04_laboratuar",
    "meb_kl05_kantin_kafeterya",
    "meb_kl06_genel_temizlik",
    "meb_kl07_siniflar",
    "meb_kl08_koridorlar",
    "meb_kl09_okul_araclari_servisler",
    "meb_kl10_toplanti_salonu",
    "meb_kl11_okul_disi_aktiviteler",
    "meb_kl12_muzik_odasi",
    "meb_kl13_sanat_odasi",
    "meb_kl14_islak_hacimler",
    "meb_kl15_spor_salonlari",
    "meb_kl16_yuzme_havuzu",
    "meb_kl17_kazan_daireleri",
    "meb_kl18_ergonomi_bedensel",
    "meb_kl19_ergonomi_buro",
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "hastane": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "kamu_idare": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "itfaiye": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "cezaevi": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "adliye_mahkeme": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ],
  "diger": [
    "csgb_kanal_kazisi",
    "isg_fiziksel_altyapi_mevzuat_ek",
    "ziyaretci_oryantasyon"
  ]
};
const GENEL_KRITIK_MADDELER = {
  "Koridor": [
    {
      "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an dışarı doğru açılabilir durumda tutuluyor mu?",
      "madde_sira": 0
    },
    {
      "soru": "Yangın merdiveni kapıları/acil çıkışların önünde ve tüm yol boyunca kaçışı engelleyecek bir malzeme bulunmaması sağlanıyor mu?",
      "madde_sira": 1
    },
    {
      "soru": "Kapı ve kaçış yollarını gösteren acil durum levhaları uygun yerlere yerleştirildi mi?",
      "madde_sira": 2
    },
    {
      "soru": "Acil durum alarmı var mı?",
      "madde_sira": 3
    },
    {
      "soru": "Zemin kaymaya veya düşmeye karşı uygun malzemeden yapılmış mı?",
      "madde_sira": 4
    },
    {
      "soru": "Aydınlatma ve ısıtma sistemi yeterli mi?",
      "madde_sira": 5
    },
    {
      "soru": "Koridorlarda yangın için özel önlemler alınmış mı?",
      "madde_sira": 6
    }
  ],
  "WC/Islak Hacim": [
    {
      "soru": "Zeminlerde kaymaya engel olmak için gerekli tedbir alınmış mı?",
      "madde_sira": 0
    },
    {
      "soru": "Islak zeminden dolayı, elektrik tesisatı ile ilgili kaçak akım rölesi vs gibi önlemler alınmış mı?",
      "madde_sira": 1
    },
    {
      "soru": "Prizler ve elektrikli aletler ıslanma ihtimali olmayan yerlerde mi bulunuyor?",
      "madde_sira": 2
    },
    {
      "soru": "Duş içinde herhangi bir düşme sırasında tutunabilecek sağlam bir tutunma aparatı takılmış mı?",
      "madde_sira": 3
    },
    {
      "soru": "Islak hacim kapıları, herhangi bir düşme sırasında, tehlike yaratmaması için uygun bir malzemeden yapılmış mı?",
      "madde_sira": 4
    },
    {
      "soru": "Saç ve el kurutucusu, elektrikli ısıtıcısı gibi elektrikli aletlerin kullanım talimatı uygun yerlere asılmış mı?",
      "madde_sira": 5
    },
    {
      "soru": "Islak hacimler engellilerin kullanımına uygun olarak tasarlanmış mı?",
      "madde_sira": 6
    }
  ],
  "Merdiven/Asansör": [
    {
      "soru": "Yangın merdiveni kapıları/acil çıkışlar kilitli olmayıp her an dışarı doğru açılabilir durumda tutuluyor mu?",
      "madde_sira": 0
    },
    {
      "soru": "Acil çıkışların önünde ve tüm yol boyunca kaçışı engelleyecek bir malzeme bulunmaması sağlanıyor mu?",
      "madde_sira": 1
    },
    {
      "soru": "Asansörler düzenli olarak kontrol ediliyor ve periyodik bakımları yapılıyor mu?",
      "madde_sira": 2
    }
  ],
  "Kantin/Yemekhane": [
    {
      "soru": "Yangın için özel önlemler alınmış mı?",
      "madde_sira": 0
    },
    {
      "soru": "Havalandırma ve baca her türlü kokuyu önleyecek şekilde mi?",
      "madde_sira": 1
    },
    {
      "soru": "Zemin kaymaya, düşmeye karşı uygun malzemelerden yapılmış mı?",
      "madde_sira": 2
    },
    {
      "soru": "WC'ler gıda üretim, satış ve tüketim yapılan yerlerden uygun uzaklıkta mı?",
      "madde_sira": 3
    },
    {
      "soru": "Çalışan personel için tüberküloz, portör muayenesi yapıldı mı?",
      "madde_sira": 4
    }
  ],
  "Mescit": [],
  "Toplantı Salonu": [
    {
      "soru": "Mevzuata uygun olarak acil çıkış kapısı var mı?",
      "madde_sira": 0
    },
    {
      "soru": "Acil çıkış yönlendirme levhaları asılmış mı?",
      "madde_sira": 1
    },
    {
      "soru": "Acil durum alarmı var mı?",
      "madde_sira": 2
    },
    {
      "soru": "Uzatma kablosu kullanımını gerektirmeyecek kadar sabit tesisat var mı?",
      "madde_sira": 3
    },
    {
      "soru": "Tüm elektrik anahtarları ve prizleri düzgün çalışıyor mu?",
      "madde_sira": 4
    },
    {
      "soru": "Zemin, kaymaya ve düşmeye karşı uygun malzemeden yapılmış mı?",
      "madde_sira": 5
    }
  ],
  "Kazan Dairesi": [
    {
      "soru": "Fuel-oil, doğal gaz, LPG vb. yakıtlı kazan dairesinde ve dışında acil yakıt kesme vanası mevcut mu?",
      "madde_sira": 0
    },
    {
      "soru": "Doğal gazlı yakıtın kullanıldığı kazan dairesinde, gaz kaçağına karşı dedektör ve alarm gibi sinyal vericiler mevcut mu?",
      "madde_sira": 1
    },
    {
      "soru": "Sıvı yakıtlı kazan dairelerinde yakıt tankları ve yakıt tesisatlarından kaynaklanan kaçaklar var mı?",
      "madde_sira": 2
    },
    {
      "soru": "Sıvı yakıtlı ve doğalgazlı sistemlerde yangın, deprem ve statik elektrik ile ilgili güvenlik sistemleri var mı?",
      "madde_sira": 3
    },
    {
      "soru": "Yangın algılama ve bildirme tesisatı yapılmış mı?",
      "madde_sira": 4
    },
    {
      "soru": "Elektrik panoları, aydınlatma ve diğer kablo tesisatları exproof malzemelerden yapılmış mı?",
      "madde_sira": 5
    },
    {
      "soru": "Kazanın bakımı ile bacaların temizliği ve kontrolü yetkili kişi/kuruluşlara periyodik olarak yaptırılıyor mu?",
      "madde_sira": 6
    },
    {
      "soru": "Sorumlu haricindeki kişilerin girmesini engelleyici tedbirler alınıyor mu?",
      "madde_sira": 7
    },
    {
      "soru": "Kaloriferci “Yetkili Kaloriferci Ateşçi Belgesine sahip mi?",
      "madde_sira": 8
    }
  ],
  "Elektrik Odası/Pano": [
    {
      "soru": "Kaçak akım rölesi ana elektrik hattına bağlanmış mı?",
      "madde_sira": 0
    },
    {
      "soru": "Elektrik/sigorta kutuları kilitlenmiş, yetkisiz kişilerin erişimleri önlenmiş mi?",
      "madde_sira": 1
    },
    {
      "soru": "Elektrik tesisatında uygun topraklama yapılmış mı?",
      "madde_sira": 2
    }
  ],
  "Depo/Arşiv": [
    {
      "soru": "Raflar; duvarlara ve birbirlerine monte edilmiş, uygun bağlantı elemanlarıyla devrilmeleri engelleniyor ve tüm dolaplar duvarlara uygun şekilde sabitleniyor mu?",
      "madde_sira": 0
    },
    {
      "soru": "Yüksek istifleme yapılan bölümlerdeki yükler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
      "madde_sira": 1
    },
    {
      "soru": "Kimyasal içerikleri nedeniyle alevlenebilir ürünler; ısı, ışık ve diğer malzemelerden uzakta ve malzeme güvenlik formuna/ talimatlara uygun şekilde muhafaza ediliyor mu?",
      "madde_sira": 2
    },
    {
      "soru": "Kimyasal maddeler ve haşere ilaçları, yetkisiz kişilerin erişemeyeceği ve satıcıların talimatlarına uygun yerlerde muhafaza ediliyor mu?",
      "madde_sira": 3
    },
    {
      "soru": "Kimyasalların kullanıldığı ve bulunduğu alanlarda yeterli havalandırma sağlanıyor mu?",
      "madde_sira": 4
    },
    {
      "soru": "Birbirleri ile tepkimeye girerek tehlikeli salımlar oluşturabilecek maddeleri içeren kargoların ayrı yerlerde muhafaza edilmesi ve taşınması sağlanıyor mu?",
      "madde_sira": 5
    },
    {
      "soru": "Gaz tüpleri bina içinde muhafaza ediliyorsa bu tüpler güvenli bağlantı parçaları ile sabitlenmiş mi?",
      "madde_sira": 6
    },
    {
      "soru": "Elle taşınamayacak kadar ağır yüklerin çalışanlarca kaldırılması engelleniyor mu?",
      "madde_sira": 7
    },
    {
      "soru": "Yük platformu, trans palet, forklift gibi ekipmanların periyodik kontrol ve bakımları düzenli olarak yaptırılıyor mu?",
      "madde_sira": 8
    },
    {
      "soru": "Yangın merdiveni kapıları/acil çıkışların önünde ve tüm yol boyunca kaçışı engelleyecek bir malzeme bulunmaması sağlanıyor mu?",
      "madde_sira": 9
    }
  ],
  "Otopark": [
    {
      "soru": "Genel trafik ve yaya yolu birbirinden ayrılmış mı?",
      "madde_sira": 0
    },
    {
      "soru": "LPG yakıtlı araçlar güvenli ortamlarda bulundurulmaktadır.",
      "madde_sira": 1
    }
  ],
  "Bahçe/Dış Alan": [
    {
      "soru": "Genel trafik ve yaya yolu birbirinden ayrılmış mı?",
      "madde_sira": 0
    },
    {
      "soru": "Gerektiğinde çalışanların toplanabileceği ve sığınabileceği kaçış alanları var mı?",
      "madde_sira": 1
    },
    {
      "soru": "Çatıda yapılan çalışmalar sırasında çalışanların, yüksekten düşmeye karşı gerekli önleyici ve koruyucu (emniyet kemeri vb.) tedbirleri almaları sağlanıyor mu?",
      "madde_sira": 2
    },
    {
      "soru": "Çalışanların iskele, merdiven, kaldırma platformları gibi yüksek yerlerde çalışırken düşme riskine karşı gerekli tedbirler alınıyor mu?",
      "madde_sira": 3
    }
  ],
  "Ofis": [
    {
      "soru": "Ofis içerisinde duvarlara monte edilmiş raflar, TV üniteleri veya diğer malzemeler çalışanların üzerine düşmeyecek şekilde sabitlenmiş mi?",
      "madde_sira": 0
    },
    {
      "soru": "Açıkta kablo bulunmamakta, prizlerin sağlamlığı düzenli olarak kontrol edilmekte mi?",
      "madde_sira": 1
    },
    {
      "soru": "Elektrikli ısıtıcı vb. cihazlar kullanılıyorsa, devrilme ihtimaline karşı gerekli tedbirler alınmış ve yanıcı malzemelerle temas etmeyecek şekilde yerleştirilmiş mi?",
      "madde_sira": 2
    },
    {
      "soru": "Ekranlı araçlar yükseklik, mesafe, parlaklık olarak rahat çalışmaya imkan verecek uygunlukta mı?",
      "madde_sira": 3
    },
    {
      "soru": "Otururarak yapılan çalışmalarda çalışma yüksekliği uygun mu?",
      "madde_sira": 4
    }
  ],
  "Soyunma Yeri": [
    {
      "soru": "Prizler ve elektrikli aletler ıslanma ihtimali olmayan yerlerde mi bulunuyor?",
      "madde_sira": 0
    }
  ],
  "İlkyardım Odası": [
    {
      "soru": "Acil durumlar için kapsamlı ilk yardım çantası, sedye ve kurtarma araçları mevcut mu?",
      "madde_sira": 0
    }
  ],
  "Dinlenme Yeri": []
};
