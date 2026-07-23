# Match Engine 4.0 Foundation — İlk Entegrasyon Katmanı

## Teslim edilen çekirdek

- Deterministik, seed tabanlı 90 dakikalık maç simülasyonu
- 22 oyunculu dinamik konum ve hareket snapshot'ı
- Ayrılmış simülasyon / renderer veri sözleşmesi
- Hücum, savunma, geçiş ve duran top fazları
- Utility tabanlı pas, carry, cross ve şut kararları
- Baskı, pas hattı, receiver space ve progression değerlendirmesi
- Gerçek olaylardan üretilen temel istatistikler
- Tarayıcıda çalışan bağımsız 2D Simulation Lab

## Masterpiece davranış temelleri

### Bekler

Bek hücuma otomatik çıkmaz. Hücum lisansı şu girdilerle hesaplanır:

- Kanattaki boşluk
- Top sahibinin baskı seviyesi
- Geride kalan oyuncu sayısı
- Rakibin kontra tehdidi
- Diğer bekin konumu
- Maç skoru ve dakika
- Bekin risk karakteri ve yorgunluğu

Rest-defence güvenliği yetersizse ikinci bek ileri gönderilmez.

### Savunmacının gol araması

- Stoperler kornerde hava hâkimiyetine göre ana hedef olabilir.
- 82. dakikadan sonra geride olan takımın en güçlü hava oyuncusu acil hedef forvete dönüşebilir.
- Bu karar gerçekleşirken geride kalan yapı ayrıca korunur.

### Forvet içgüdüsü

Savunma arkası koşusu şu bileşenlerden çıkar:

- Savunma çizgisi arkasındaki kullanılabilir mesafe
- Pasörün baskı altında olup olmaması
- Forvetin off-ball, acceleration ve goal-hunger değerleri
- Şut fırsatı, açı, mesafe ve kaleci konumu

### Kaleciler

Beş arketip tanımlandı:

- Line Keeper
- Sweeper Keeper
- Cross Commander
- Playmaker Keeper
- Eccentric Keeper

Arketip; başlangıç pozisyonunu, savunma arkasına çıkışı, korner/orta hâkimiyetini, kurtarış ve pas davranışını etkiler.

### Korner organizasyonu

Korner motoru otomatik olarak:

- En iyi kullanıcının,
- Ana hava hedefinin,
- İkinci hava hedefinin,
- Ceza yayı şutçusunun,
- Kontra güvenliği için geride kalan iki oyuncunun

görevlerini belirler. İlk temas, ikinci top ve kontra başlangıcı aynı event zincirinde devam eder.

## Entegrasyon güvenliği

V4 şu aşamada shadow mode çalışır. Mevcut V44.5/V44.6:

- kariyer state'i,
- fixture sonuçları,
- ELO,
- Tactical IQ,
- Supabase snapshot,
- lig ve kupa ilerlemesi

değiştirilmez.

Bu katman yalnızca paralel simülasyon, snapshot ve karşılaştırmalı teşhis üretir.

## Public API

```js
FIFA_MATCH_ENGINE_V4.createEngine(config)
FIFA_MATCH_ENGINE_V4.createDefaultConfig(overrides)
FIFA_MATCH_ENGINE_V4_SHADOW.enable()
FIFA_MATCH_ENGINE_V4_SHADOW.disable()
FIFA_MATCH_ENGINE_V4_SHADOW.getSnapshot()
FIFA_MATCH_ENGINE_V4_SHADOW.runCalibration(100)
```

## Doğrulanan ilk denge profili

40 deterministik tam maçlık regresyon seti:

- 2,38 gol / maç
- 26,25 şut / maç
- 2,95 korner / maç
- 1.137,28 pas denemesi / maç
- 874,88 tamamlanan pas / maç
- 23,00 orta / maç

Bu değerler foundation seviyesinde geniş güvenlik aralığı içinde doğrulandı. Ayrıntı `VALIDATION_REPORT_V4_FOUNDATION.txt` dosyasındadır.

## Sonraki teknik çalışma

Güncel repository üzerinde:

1. V4 snapshot'larının mevcut 2D player node'larına bağlanması
2. Legacy `advanceLiveMotion()` hareket üretiminin feature flag ile devreden çıkarılması
3. V4 eventlerinin mevcut UEFA stats, commentary ve broadcast kartlarına bağlanması
4. Legacy skor resolver yerine V4 gol çizgisi/event sonucunun kullanılması
5. Devam eden maç migration'ı
6. Seed ve replay metadata'sının fixture kaydına eklenmesi
7. 1.000–10.000 maç denge kalibrasyonu

uygulanacaktır.
