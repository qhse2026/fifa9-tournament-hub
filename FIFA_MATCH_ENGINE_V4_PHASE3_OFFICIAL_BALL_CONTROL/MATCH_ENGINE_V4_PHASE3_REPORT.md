# Match Engine V4 — Phase 3
## Official Pass & Ball Control

**Core:** `4.0.0-phase3.1`  
**Authority adapter:** `4.0.0-phase3-authority.1`  
**Live bridge:** `4.0.0-phase3-live.1`

## 1. Fazın amacı

Phase 2, 22 oyuncunun taktiksel saha hareketlerini V4'e devretmiş; resmî top, skor ve istatistikleri legacy motorda bırakmıştı. Phase 3'ün amacı, akan oyundaki topu yalnızca görsel bir işaret olmaktan çıkararak pas, ilk kontrol, interception ve ikinci-top zincirinin fiziksel sonucu hâline getirmektir.

Bu fazda skor güvenliği için hibrit yetki modeli kullanılır:

```text
Akan oyun / paslaşma        → V4_PASSING
Şut / gol / duran top anı   → LEGACY_TERMINAL
Terminal olay tamamlanınca  → V4_PASSING
```

## 2. Top durum makinesi

```text
RESTART
CONTROLLED
IN_FLIGHT
LOOSE
EXTERNAL
WAITING_TERMINAL
```

- **CONTROLLED:** Bir oyuncu topu fiziksel olarak kontrol eder.
- **IN_FLIGHT:** Pas veya orta, başlangıç ve hedef noktası arasında süreye bağlı hareket eder.
- **LOOSE:** Top hiçbir oyuncunun kontrolünde değildir; ikinci-top yarışı çözülür.
- **EXTERNAL:** Legacy motor resmî terminal olayı yönetmektedir.
- **WAITING_TERMINAL:** V4 şut penceresi tespit etmiş ve resmî terminal motora yetki istemiştir.

## 3. Pas yörüngesi

Her pas aşağıdaki bağlamla üretilir:

- Verici ve alıcının konumu
- Alıcının koşu hızı ve tahmini buluşma noktası
- Pas mesafesi
- Kısa / orta / uzun pas sınıfı
- Pasörün teknik ve karar kalitesi
- Baskı seviyesi
- Risk ve dikine ilerleme değeri
- Topun uçuş süresi
- Kontrollü eğri ve yükseklik

Top, doğrudan alıcının ayağına taşınmaz. Simülasyon tick'lerinde yörünge üzerinde ilerler; bu nedenle rakipler pas hattına fiziksel olarak girebilir.

## 4. Geometrik pas arası

Pas arası yalnızca rastgele yüzdeyle oluşmaz. Her savunmacı için:

1. Oyuncunun pas segmentine en yakın izdüşüm noktası bulunur.
2. Topun bu noktaya ulaşma süresi hesaplanır.
3. Oyuncunun dönüş, reaksiyon ve koşu süresi hesaplanır.
4. Oyuncu topa yeterince erken erişebiliyorsa interception adayı olur.
5. Anticipation, concentration, positioning ve pace değerleri sonuç kalitesini etkiler.

Başarılı pas arası, topu savunmacının kontrolüne verebilir veya yeni bir boşta-top sekansı başlatabilir.

## 5. İlk kontrol çözümü

Alıcıya gelen top üç ana sonuçtan birini üretir:

### Temiz kontrol
- Top oyuncunun kontrolüne geçer.
- Bir sonraki karar daha kısa sürede alınabilir.
- Hücum ritmi korunur.

### Ağır kontrol
- Top oyuncudan belirli bir mesafeye açılır.
- Baskı yapan rakip topa müdahale fırsatı bulur.
- İkinci-top sekansı başlar.

### Kontrol kaybı
- Top tamamen boşta kalır.
- Kaynak takım turnover kaydeder.
- Yakındaki oyuncular için recovery yarışı oluşturulur.

Sonuç; first touch, technique, composure, baskı, pas hızı, vücut yönü ve yorgunlukla hesaplanır.

## 6. Boşta top ve ikinci top

Boşta top çözümünde her aday için ulaşma skoru hesaplanır:

```text
ulaşma süresi
+ reaksiyon gecikmesi
+ yön değiştirme maliyeti
- anticipation avantajı
- aggression avantajı
- concentration avantajı
```

Kazanan oyuncu topu kontrol eder. Sistem aşağıdaki olayları ayrı kaydeder:

- `BALL_LOOSE`
- `LOOSE_BALL_WON`
- `SECOND_BALL_WON`
- `RECOVERY`
- `TURNOVER`

Bu yapı, pas arası veya ağır kontrolden sonra pozisyonun aniden kesilmesini engeller.

## 7. Hibrit resmî yetki sistemi

### V4_PASSING yetkisi

V4 şu alanlarda resmî görsel ve istatistiksel kaynaktır:

- Top konumu
- Topa sahip oyuncu ve takım
- Pas başlangıcı ve bitişi
- Pas sınıfı
- Pas tamamlanması
- Pas arası
- Ağır ilk kontrol
- Boşta top
- İkinci top
- Recoveries ve turnovers

### LEGACY_TERMINAL yetkisi

Aşağıdaki olaylarda legacy motor kısa süreli olarak top ve skoru yönetir:

- Şut
- Gol
- Kaleci kurtarışı
- Korner
- Serbest vuruş
- Penaltı
- Kale vuruşu
- Resmî yayın/broadcast terminal sekansı

V4, `TERMINAL_HANDOFF_REQUEST` olayı üretir. Adapter legacy faz ve event sinyallerini de izler. Terminal pencere bittiğinde dış top konumu V4'e aktarılır ve normal pas yetkisi devam eder.

## 8. İstatistik entegrasyonu

Phase 3 aşağıdaki alanları canlı resmî istatistik nesnesine yazar:

- `passesAttempted`
- `passesCompleted`
- `shortPassesAttempted`
- `shortPassesCompleted`
- `mediumPassesAttempted`
- `mediumPassesCompleted`
- `longPassesAttempted`
- `longPassesCompleted`
- `finalThirdPassesAttempted`
- `finalThirdPassesCompleted`
- `progressivePasses`
- `interceptions`
- `recoveries`
- `turnovers`
- `possessionSeconds`
- `passes`
- `passAccuracy`

Adapter delta tabanlı yazım kullanır; aynı V4 olayı birden fazla kez sayılmaz.

## 9. Canlı 2D arayüz

Live Bridge aşağıdaki görsel geri bildirimleri ekler:

- `ME4 PASS & BALL AI` durum rozeti
- Aktif yetki: V4 veya legacy terminal
- Top durumu: kontrollü, uçuşta, boşta, dış yetki
- Pas kalitesi ve ilerleme yüzdesi
- Verici–hedef arasında pas uçuş çizgisi
- Boşta top pulse animasyonu
- Oyuncu intent ve enerji metadata'sı
- Rest-defence güvenlik göstergesi

## 10. Uyumluluk

- Mevcut `manager-match-engine.js` korunur.
- Manager Room render sözleşmesi değiştirilmez.
- Kariyer JSON şemasında zorunlu alan eklenmez.
- Supabase SQL değişmez.
- Skor, fikstür, ELO ve maç sonucu legacy resmî akışta kalır.
- Phase 2 global API adları için uyumluluk alias'ları sağlanır.

## 11. Test kapsamı

### Ball-control regression

- Pasın süre içinde hareket etmesi
- Temiz kontrol
- Ağır kontrol ve boşta top
- İkinci top kazanımı
- Geometrik pas arası
- Terminal yetki devri

### Live-authority regression

- V4 top koordinatının `visual2D` içine yazılması
- Pas istatistiğinin legacy UEFA alanlarına aktarılması
- Terminal fazda legacy top yetkisi
- Yetkinin V4'e geri dönmesi
- Legacy resmî gol/skor senkronizasyonu

### Live-bridge regression

- DOM top koordinatı
- Uçuş sınıfı ve pas çizgisi
- Boşta top sınıfı
- External/terminal sınıfı

## 12. 20 maçlık kalibrasyon

| Ölçüm | Ortalama |
|---|---:|
| Gol | 2.50 |
| Şut | 26.75 |
| Korner | 2.40 |
| Pas denemesi | 974.20 |
| Tamamlanan pas | 796.30 |
| Pas doğruluğu | %81.74 |
| Kötü ilk kontrol | 54.35 |
| Boşta top | 182.45 |
| Kazanılan ikinci top | 120.05 |
| Pas arası | 53.70 |
| Recovery | 191.75 |
| Turnover | 191.75 |
| Orta | 28.30 |

Aynı seed ve aynı girdilerle deterministik tekrar doğrulandı.

## 13. Bilinçli sınırlar

Phase 3 henüz aşağıdaki alanların resmî sahibi değildir:

- Şut hedef koordinatı ve yörüngesi
- Savunmacı blok fiziği
- Kaleci set pozisyonu ve kurtarış çözümü
- Direk, sekme ve rebound zinciri
- Gol çizgisi doğrulaması
- Duran top servis ve hava topu motoru

Bunlar Phase 4 — Shot, Goalkeeper & Goal Resolution kapsamına bırakılmıştır. Bu sınır, Phase 3 top kontrolü devreye alınırken resmî skor ve kariyer bütünlüğünü korur.
