# FIFA Universe V2.0.0 — Modern Operating System

Build: `200000`

FIFA Universe V2.0, FIFA 10'a özel geçici bir arayüz değil; FIFA 01–10 tarihini,
canlı turnuvayı, oyuncu kariyerlerini, rekorları, yayın araçlarını ve yönetici
operasyonunu aynı ürün mimarisinde birleştiren tam site güncellemesidir.

## Yeni ürün mimarisi

Site altı ana merkeze indirildi:

1. **Universe** — Turnuvanın mevcut aşaması, canlı tablo, son sonuç, sıradaki maç
   ve tüm zamanlar özeti.
2. **Canlı** — Sonuçlar, dinamik maç sırası, canlı yayın ve oran kısayolları.
3. **Turnuvalar** — FIFA 01–10 edisyonları ve aktif FIFA 10 operasyonu.
4. **Oyuncular** — Universal Player Passport, kariyer evreleri, Digital Twin,
   Legacy, Prime, rekabetler ve kullanılan takımlar.
5. **Tüm Zamanlar** — Lineal FIFA Crown, Legacy sıralaması, yaşayan rekorlar ve
   kilometre taşları.
6. **Medya** — OBS yayını, Final Night, çıktı merkezi ve Storyline Engine.

Derin FIFA 10 araçları silinmedi. Fikstür, puan tablosu, Championship,
Qualification Lab, takım havuzları, DNA, modeller, arşiv, yazdırma ve veri
yönetimi üç düzenli yan menü kümesinde korunur.

## Kullanıcı deneyimi

- İzleyici, Oyuncu ve Yönetici deneyim modları eklendi.
- Ana sayfadan kayıt formu, uzun format anlatımı ve tam operasyon paneli
  kaldırıldı; bunlar ilgili merkezlere taşındı.
- Komuta paleti altı ana merkeze göre yenilendi.
- Mobil navigasyon beş temel hedefe indirildi.
- Bağlantı ve kayıt olayları ekrana sürekli uyarı basmak yerine, tekrarlanan
  olayları birleştiren sessiz **Bildirim Merkezi** içinde toplanır.
- Yönetici için yalnız işlem gerektiren işleri gösteren **Admin Today** eklendi:
  önerilen maç sırası, Integrity Sentinel, eksik takım kayıtları ve hızlı
  operasyon kısayolları.

## Veri ve hesaplama bütünlüğü

- Resmî FIFA 10 kura/fikstür verisi V2 merkezlerinde salt okunur kullanılır.
- Genel sıralama önce PPG, eşitlikte maç başına averaj (GD/M), ardından mevcut
  resmî eşitlik kurallarıyla çalışmaya devam eder.
- FIFA 09 geçmişi, FIFA 10 sonuçları, tüm zamanlar, Zekâ Merkezi, Form, oranlar,
  oyuncu DNA'sı, takım pasaportları ve yayın araçları aynı resmî veri kaynağını
  kullanır.
- `cloud-config.js` değiştirilmedi; mevcut proje kimliği ve yetkilendirme ayarları
  korunur.

## International Crew

- V2'nin yedi ekranı Türkçe ve İngilizce olarak ayrı ayrı doğrulandı.
- Yeni navigasyon, rol modları, bildirim merkezi, oyuncu pasaportu, tüm zamanlar,
  medya ve yönetici metinleri İngilizce pakete eklendi.
- PPG, GD/M ve total GF gibi resmî metrik etiketleri korunur.

## Uyumluluk

Mevcut V47.19 analitik motorları ve resmî turnuva kayıtları V2 yüzünün altında
çalışmaya devam eder. Eski dosya adlarının bir kısmı geriye dönük uyumluluk için
korunmuştur; ürün sürümü `2.0.0`, dağıtım build'i `200000`'dir.

