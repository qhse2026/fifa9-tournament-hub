# Match Engine 4.0 — Phase 6 Teknik Rapor

## 1. Amaç

Phase 6'nın amacı savunmayı yalnızca topa en yakın oyuncunun koştuğu bir sistem olmaktan çıkararak takım hâlinde karar veren, açıklanabilir ve risk–ödül dengesi bulunan bir savunma motoruna dönüştürmektir.

Phase 6, Phase 5'in pas, şut, kaleci, gol ve duran top sistemlerini içerir ve bunların üzerine savunma zekâsı ekler.

## 2. Pres durum zinciri

```text
Rakip topu alır
→ Pres tetikleyicisi değerlendirilir
→ Ana presçi seçilir
→ İkinci presçi / kademe belirlenir
→ Pas gölgesi oluşturulur
→ Savunma çizgisi ayarlanır
→ Top kazanımı / pres kırılması / blok savunması
```

## 3. Pres tetikleyicileri

Motor şu bağlamları değerlendirir:

- Kötü ilk kontrol
- Geri pas veya oyuncunun kendi kalesine dönük olması
- Taç çizgisine yakın top alma
- Kalecinin veya stoperin baskı altında top alması
- İzole kalan top sahibi
- Top kaybından sonraki counter-press penceresi
- Savunma takımının pressing yoğunluğu ve yorgunluğu

Pres, sürekli açık bir bonus değildir. Tetik skoru eşik altında kaldığında takım blok savunmasına döner.

## 4. Üçlü pres rolü

Her aktif baskı sekansında üç farklı görev üretilebilir:

1. **Primary Presser:** Top sahibini karşılar.
2. **Secondary Presser:** Kaçış yönünü kapatır veya touchline trap oluşturur.
3. **Cover Shadow:** En tehlikeli pas seçeneğini gölgeler.

Oyuncuların aynı noktaya koşması yerine baskı açısı ve pas yolları paylaşılır.

## 5. Touchline trap ve çift sıkıştırma

Top çizgiye yakın olduğunda saha sınırı ek savunmacı gibi kullanılır. Ana presçi oyuncuyu içeri veya çizgiye yönlendirirken ikinci oyuncu kaçış koridorunu kapatır.

Çift sıkıştırma yalnızca:

- Pres tetik skoru yeterliyse,
- İkinci savunmacı zamanında yetişebiliyorsa,
- Arkada yeterli savunma güvencesi varsa

oluşturulur.

## 6. Pas gölgesi

Savunmacı yalnızca topa koşmaz. Top sahibi ile muhtemel pas alıcısı arasındaki hatta konumlanabilir.

Pas gölgesi:

- Pas seçeneğinin Utility AI puanını düşürür,
- Pas hattı riskini yükseltir,
- Gerçek geometrik interception ihtimalini etkiler,
- `passingLanesBlocked` istatistiğine aktarılır.

## 7. Savunma çizgisi ve ofsayt

Takım savunma çizgisi şu verilerle hesaplanır:

- Taktik savunma çizgisi
- Stoper ve beklerin gerçek koordinatları
- Savunma liderinin positioning, concentration, decisions ve teamwork değerleri
- Topun konumu
- Presin aktif olup olmaması

Ofsayt, pas anındaki gerçek oyuncu konumuna göre değerlendirilir. Hedef pas noktasına göre yanlış ofsayt verilmez.

Yeni niyetler:

- `LEAD_DEFENSIVE_LINE`
- `HOLD_OFFSIDE_LINE`
- `OFFSIDE_TRAP_WON`

## 8. Geçiş savunması

Top kaybının ilk saniyelerinde en yakın savunmacı her zaman kayarak müdahale etmez. Motor gerektiğinde rakibi geciktirir ve takım arkadaşlarının geri dönmesini bekler.

Yeni davranışlar:

- `CONTAIN_TRANSITION`
- Counter-press regain
- Transition delay
- Rest-defence koruması

Yüksek pres kırıldığında hücum takımı hızlanma ve alan avantajı kazanır. Böylece yüksek pres güçlü fakat risksiz değildir.

## 9. Ceza sahası ve cutback savunması

Rakip gerçekten byline'a indiğinde görevler yeniden dağıtılır:

- Bek: `STOP_CROSS`
- Ön libero: `CUTBACK_SCREEN`
- Yakın stoper: `PROTECT_NEAR_POST`
- Uzak stoper: `MARK_CENTRE`

Bu alarm yalnızca gerçek byline koşullarında tetiklenir; her geniş hücum cutback kabul edilmez.

## 10. Yeni resmî istatistikler

- pressures
- successfulPressures
- pressureRegains
- forcedTurnovers
- forcedErrors
- doubleTeams
- passingLanesBlocked
- counterPressRegains
- transitionDelays
- offsideTraps
- offsidesWon
- cutbacksDefended
- boxEntriesDenied
- defensiveLineBreaks

## 11. Debug ve açıklanabilirlik

Snapshot içine `defensiveAI.home` ve `defensiveAI.away` eklenmiştir:

```text
active
ownerId
primaryPresserId
secondaryPresserId
shadowMarkerId
shadowTargetId
leaderId
triggerScore
trap
lineX
cutbackThreat
boxThreat
counterDelay
doubleTeam
```

Laboratuvar ve test amaçlı debug fonksiyonları:

- debugSetPlayerPosition
- debugSetBallOwner
- debugChangePossession
- debugSetBallReason
- debugRefreshDefence

## 12. Geriye uyumluluk

- Supabase migration gerektirmez.
- Phase 5'in duran top sistemi korunur.
- Phase 4'ün şut, kaleci ve resmî skor sözleşmesi korunur.
- Eski taktiklerde yeni defence alanları yoksa güvenli varsayılanlar kullanılır.
