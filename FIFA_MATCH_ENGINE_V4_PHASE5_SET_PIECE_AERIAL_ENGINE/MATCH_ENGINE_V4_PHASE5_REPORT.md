# Match Engine 4.0 — Phase 5 Teknik Rapor

## 1. Amaç

Phase 5'in amacı duran topları sonuç üreten ayrı bir olay jeneratörü olmaktan çıkarıp 22 oyuncunun gerçek koordinat, görev ve kararlarıyla yürütülen saha sekanslarına dönüştürmektir.

## 2. Duran top durum zinciri

```text
AWARDED
→ ORGANIZED
→ PLAYER STAGING
→ DELIVERY
→ GOALKEEPER DECISION / AERIAL DUEL
→ SHOT / CLEARANCE / SCRAMBLE
→ SECOND BALL / COUNTER
→ OPEN PLAY
```

## 3. Hücum görevleri

Her organizasyon, uygun oyuncu özelliklerine göre otomatik görev dağıtır:

- Taker
- Primary aerial target
- Secondary aerial target
- Near-post runner
- Far-post runner
- Goalkeeper screen / blocker
- Edge-of-box shooter
- Rebound attacker
- Rest-defence players

Kullanıcı tercihi görevlerin başlangıç şablonunu belirler; oyuncu seçimi heading, jumping, strength, off-ball, crossing, technique, composure ve anticipation kombinasyonuyla yapılır.

## 4. Savunma görevleri

Savunma üç modelden birini uygular:

- **Zonal:** Ön direk, merkez ve arka direk bölgeleri korunur.
- **Man:** Ana hava hedefleri bire bir eşleştirilir.
- **Hybrid:** En tehlikeli hedefler adam adama, kalan bölgeler alan savunmasıyla korunur.

Savunma ayrıca hızlı bir counter outlet bırakabilir.

## 5. Kaleci orta kararı

Kaleci her havadan serviste üç karar üretir:

```text
CLAIM
PUNCH
STAY
```

Kararı etkileyenler:

- Kaleci arketipi
- Cross command
- Handling
- Jumping
- Decisions
- Bravery
- Positioning
- Kalabalık seviyesi
- Servis kalitesi

Cross-commander kaleciler daha proaktif; line-keeper profilleri daha temkinlidir.

## 6. Hava topu çözümü

Hava topu sonucu yalnızca heading değerine bağlı değildir:

```text
Heading / Marking
+ Jumping
+ Strength
+ Anticipation
+ Bravery
+ Concentration
+ Positioning
+ Run momentum
+ Delivery quality
+ Controlled variance
```

Sonuçlar:

- Attacking header
- Defensive clearance
- Goalkeeper claim
- Goalkeeper punch
- Missed claim
- Scramble / second ball

## 7. Korner rutinleri

### Near Post
Ana hedef ön direğe hızlanır; ikinci oyuncu arkaya devrilen topu takip eder.

### Far Post
En güçlü hava oyuncusu arka direkte hedeflenir.

### Crowd Keeper
Servis kaleci alanına gönderilir; kalecinin çıkış kararı daha kritik hâle gelir.

### Short Corner
Top gerçek pas uçuşuyla yakın oyuncuya aktarılır ve açık oyun karar motoruna bağlanır.

### Edge
Top ceza yayı veya ikinci faz şutçusuna yönlendirilir.

## 8. Serbest vuruşlar

- Direkt serbest vuruşlar Phase 4 şut ve kaleci motoruna bağlanır.
- Endirekt serbest vuruşlar organize havadan servis ve hava topu düellosu üretir.
- Duvar ve blok hattı mevcut şut hattı geometrisi içinde değerlendirilir.

## 9. Penaltı

Penaltı şutu:

- Sabit yüksek xG tabanı
- Duvar/blok olmaması
- Kaleci refleksi ve anticipation
- Plase veya power seçimi
- Gol, kurtarış, direk veya dışarı sonucu

üzerinden çözülür.

## 10. İkinci top ve kontra

Kaleci yumruklaması, savunma uzaklaştırması veya karambol sonucu top fiziksel loose-ball durumuna geçer. Yakındaki oyuncular geliş süresine göre ikinci topa saldırır. Savunma temiz kazanırsa counter outlet üzerinden hızlı geçiş başlayabilir.

## 11. Resmî istatistikler

Phase 5 aşağıdaki alanları resmî maç istatistiklerine yazar:

- corners, cornerShots, cornerGoals
- freeKicks, directFreeKicks, indirectFreeKicks
- freeKickShots, freeKickGoals
- throwIns
- penaltiesTaken, penaltiesScored, penaltiesSaved, penaltiesMissed
- setPieceShots, setPieceGoals, setPieceSecondBalls
- aerialDuels, aerialDuelsWon
- defensiveAerialDuels, defensiveAerialDuelsWon
- goalkeeperClaims, goalkeeperPunches, goalkeeperMissedClaims
- clearances

## 12. Geriye uyumluluk

- Supabase migration gerektirmez.
- Eski kariyerler setPieces alanı olmadan açılabilir.
- Eksik taktik alanları güvenli varsayılanlarla tamamlanır.
- Phase 4'ün resmî skor ve istatistik sözleşmesi korunur.
