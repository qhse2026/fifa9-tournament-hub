# Match Engine 4.0 — Phase 5

**Set Piece, Aerial Duel & Second Ball Engine**

Phase 5, Phase 4'ün resmî pas, şut, kaleci ve skor yetkisini korur; duran top organizasyonlarını aynı deterministik maç motoruna dahil eder.

## Production dosyası

`manager-match-engine-v4-phase5.bundle.js`

## Yeni motorlar

- Korner rutinleri: near-post, far-post, crowd-keeper, short, edge ve mixed
- Direkt ve endirekt serbest vuruş
- Uzun taç ve destek taç organizasyonları
- Penaltı çözümü
- Hava topu düello motoru
- Kaleci orta kararı: claim, punch veya stay
- Alan, adam adama ve hibrit markaj
- Sahte koşu, kaleci perdesi, ceza yayı ve ikinci top görevleri
- Rest-defence ve duran top sonrası kontra
- Resmî duran top istatistikleri

## Yetki sözleşmesi

| Bileşen | Yetki |
|---|---|
| Oyuncu koordinatları | V4 |
| Pas ve top kontrolü | V4 |
| Şut ve kaleci | V4 |
| Gol ve skor | V4 |
| Duran toplar | V4 |
| Hava mücadeleleri | V4 |
| İkinci toplar | V4 |
| Kariyer saklama kabı | Mevcut kariyer modeli |

## Kurulum

Phase 4 script satırını Phase 5 ile değiştirin:

```html
<script src="manager-match-engine.js"></script>
<script src="manager-match-engine-v4-phase5.bundle.js?v=4.0.0-phase5.1"></script>
```

Eski V4 bundle dosyalarını aynı anda yüklemeyin.

## Testler

```bash
node tests/v4-phase5-regression.js
node tests/v4-phase5-calibration.js 20
```

40 maçlık paralel kalibrasyon sonucu `CALIBRATION_OUTPUT.txt` içindedir.
