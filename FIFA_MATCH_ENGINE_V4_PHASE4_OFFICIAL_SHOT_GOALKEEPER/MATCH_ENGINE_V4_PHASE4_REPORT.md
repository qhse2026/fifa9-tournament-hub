# Match Engine V4 — Phase 4 Teknik Raporu

## 1. Amaç

Phase 4, Phase 3'te V4 tarafından yönetilen pas ve top kontrol zincirinin terminal bölümünü devralır. Şut artık legacy event talebi değildir; aynı fiziksel top, oyuncu koordinatı ve event stream içinde çözülür.

## 2. Yetki Sözleşmesi

| Bileşen | Yetki |
|---|---|
| Oyuncu koordinatları | V4 |
| Taktiksel hareketler | V4 |
| Pas ve orta | V4 |
| İlk kontrol / interception / ikinci top | V4 |
| Şut seçimi | V4 |
| Şut top uçuşu | V4 |
| Savunma bloğu | V4 |
| Kaleci kararı ve kurtarış | V4 |
| Direk ve rebound | V4 |
| Gol çizgisi ve skor | V4 |
| Kariyer / fixture persistence kabı | Mevcut oyun modeli |

Runtime authority değeri: `V4_FULL_AUTHORITY`.

## 3. Şut Planlama Modeli

Her şutta aşağıdaki bağlam oluşturulur:

- Şut başlangıç koordinatı
- Kaleye mesafe ve açı
- Baskı seviyesi
- Şutör finishing, technique, composure ve decisions değerleri
- İlk vuruş / kafa / açık oyun / korner kaynağı
- Hedef y ve z koordinatı
- Şut gücü ve top hızı
- xG ve xGOT
- Görüşü kapatan oyuncular
- Şut hattındaki muhtemel blocker
- Kalecinin pozisyonu, reaksiyon gecikmesi ve erişim noktası

Sonuç önceden bağımsız bir gol yüzdesiyle üretilmez. Planlanan trajectory; blok, kale geometrisi ve kaleci çözümü üzerinden terminal sonuca ulaşır.

## 4. Kaleci Karakterleri

Core aşağıdaki archetype'ları korur:

- `line-keeper`
- `sweeper-keeper`
- `cross-commander`
- `playmaker-keeper`
- `eccentric-keeper`

Kaleci şut bağlamında aşağıdaki aksiyonlardan birini seçebilir:

- `SET_SAVE`
- `FULL_STRETCH`
- `HIGH_DIVE`
- `FOOT_SAVE`

Karar; reflex, handling, positioning, decisions, sight obstruction, hedef yüksekliği ve şut gücüne göre hesaplanır.

## 5. Kurtarış Sonuçları

- `SAVE_HOLD`: Top kalecinin resmî kontrolüne geçer.
- `SAVE_PARRY_WIDE`: Top korner veya kale vuruşuna çıkar.
- `SAVE_PARRY_DANGER`: Top ceza sahasında rebound ve ikinci-top mücadelesine dönüşür.

Kalecinin parry yönü yalnızca görsel event değildir; sonraki possession zincirini değiştirir.

## 6. Gol Doğrulaması

Gol için motor:

1. Şut trajectory'sini kale çizgisine taşır.
2. Hedefin iki direk arasında ve 2,44 m altında olduğunu doğrular.
3. Blok veya kaleci müdahalesinin gerçekleşmediğini doğrular.
4. `GOAL_LINE_CROSSED` eventi üretir.
5. Takım skorunu artırır.
6. Resmî `GOAL` eventini yayınlar.
7. Rakip takım için kick-off restart oluşturur.

## 7. Legacy Entegrasyonu

Phase 4 adapter şu alanları periyodik olarak senkronize eder:

- `matchEngine.homeGoals`
- `matchEngine.aiGoals`
- `matchEngine.stats.home/away`
- `matchEngine.visual2D.ball`
- `matchEngine.visual2D.ballControl`
- `matchEngine.visual2D.shotAction`
- `fixture.homeScore/awayScore`

Önemli V4 terminal eventleri legacy broadcast alanına `source: ME4_PHASE4` ile aktarılır.

## 8. Determinizm

Aynı seed, takım, taktik ve motor sürümü aynı skor ve istatistikleri üretir. Event kimlikleri `eventSequence` ile benzersizdir; 500 eventlik ring buffer kullanılsa bile ID tekrar etmez.

## 9. Kalibrasyon Özeti

20 maçlık test seti:

| Gösterge | Ortalama |
|---|---:|
| Gol | 2,45 |
| Şut | 30,45 |
| İsabetli şut | 14,85 |
| Bloklanan şut | 6,05 |
| Kurtarış | 12,40 |
| Temiz tutuş | 5,70 |
| Çelme | 6,70 |
| Direk | 0,30 |
| xG | 4,33 |
| xGOT | 2,68 |
| Korner | 3,25 |
| Pas doğruluğu | %82,61 |

Bu örneklem regression kalibrasyonudur; lig seviyesi ve takım veri tabanı bağlandıktan sonra daha geniş Monte Carlo dengelemesi gerekir.

## 10. Sınırlamalar

- Gerçek repository'nin Service Worker cache davranışı bu izole paket içinde test edilmedi.
- Mevcut maçın ortasında Phase 3 → Phase 4 geçişi önerilmez.
- Serbest vuruş ve penaltı için mevcut shot resolver kullanılabilir; özel keeper mind-game modülü sonraki fazda derinleştirilebilir.
- Tam replay timeline ve VAR henüz bu fazın kapsamı değildir.
