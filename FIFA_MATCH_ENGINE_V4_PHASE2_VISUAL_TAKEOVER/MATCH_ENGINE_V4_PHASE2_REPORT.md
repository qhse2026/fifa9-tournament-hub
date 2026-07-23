# Match Engine V4 — Phase 2 Live Visual Takeover

## Teslim edilen entegrasyon

Bu aşamada Match Engine V4, mevcut Manager Room maç ekranındaki 22 oyuncunun koordinat katmanını devralır. Entegrasyon resmî maç motorunu değiştirmeden yapılmıştır.

### Yetki sözleşmesi

| Sistem | Yetkili motor |
|---|---|
| Oyuncu hedef pozisyonları | Match Engine V4 |
| Bek bindirmesi / underlap / rest-defence | Match Engine V4 |
| Pres, kompakt blok ve forvet koşuları | Match Engine V4 |
| Kaleci başlangıç konumu ve arka alan kontrolü | Match Engine V4 |
| Top koordinatı ve top animasyonu | Mevcut resmî motor |
| Skor ve gol kaydı | Mevcut resmî motor |
| UEFA istatistikleri | Mevcut resmî motor |
| ELO, fikstür, kupa ve kariyer persistence | Mevcut resmî motor |

Bu ayrım, V4 bağımsız simülasyonunda oluşabilecek bir şutun resmî ekranda görünmez bir gole dönüşmesini engeller.

## Resmî topa kilitlenme

Shadow adapter her güncellemede mevcut maçtan şunları okur:

- `clockSeconds`
- `visual2D.ball`
- `visual2D.possession`
- `scoreHome / scoreAway`
- `userPlan / aiPlan`

V4 çekirdeği `syncExternalState()` üzerinden resmî top konumunu ve possession tarafını alır. Oyuncu hedefleri bu konuma göre yeniden hesaplanır.

## Güncel veri modeli uyumluluğu

Adapter artık doğrudan şunları destekler:

- `positionRoles`
- `phaseBehaviors`
- `userPlan`
- `aiPlan`
- `humanSide`
- Manager Room `getTeamForActor()` takım reytingleri

Plan imzası değiştiğinde V4 yeniden oluşturulur ve mevcut maç saniyesine deterministik şekilde yetiştirilir.

## Canlı arayüz

Canlı maç ekranına eklenen küçük HUD:

- ME4 Player AI durumu
- V4 maç fazı
- İki takımın rest-defence güvenlik değeri
- V4 / Legacy hareket geçiş düğmesi

Oyuncu üzerine gelindiğinde:

- rol
- intent
- enerji
- pozisyon

görülebilir. Topa en yakın resmî possession oyuncusu ayrıca vurgulanır.

## Geriye uyumluluk

- V44.5 / V44.6 kariyer JSON yapısına yeni kalıcı alan yazılmaz.
- Resmî kariyer snapshot şeması değiştirilmez.
- Fikstür, Oruç Reis Cup, ELO ve tablo akışı değiştirilmez.
- Bundle script satırı kaldırıldığında sistem mevcut legacy hareket sistemine döner.

## Sonraki aşama

Phase 3'te resmî aksiyon çözücüsü kademeli olarak V4 event sözleşmesine geçirilecektir:

1. Pas ve top kontrolü
2. Interception ve second-ball
3. Orta ve ceza sahası koşuları
4. Şut, blok ve kaleci çözümü
5. Korner / duran top organizasyonları
6. V4 eventlerinden UEFA istatistik üretimi

Bu geçiş feature flag altında yapılmalı; her alt sistem ayrı ayrı resmî sahipliğe geçirilmelidir.
