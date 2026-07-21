# FIFA League System v37 — Teknik Model

## Kalıcı veri yapısı

Sezonlar ana uygulama state'i içinde tutulur:

```text
seasonSystem.seasons[]
```

Her sezon; oyuncu listesi, lig fikstürleri, kupa serileri, Süper Kupa, durum ve test/resmî mod bilgisini bağımsız taşır.

## Sezon durumları

- `setup`: Oyuncu kayıtları hazırlanıyor.
- `scheduled`: Fikstür oluşturuldu.
- `active`: Sezon aktif.
- `completed`: Süper Kupa dahil sezon tamamlandı.
- `cancelled`: Sezon iptal edildi.

## Yarışmalar

- `premier`
- `championship`
- `oruc`
- `super`

## Gelecek sezon politikası

Yeni sezon oluşturucu önceki sezon puan tablolarını kullanır:

1. Premier 1–5: Premier önceliği 1–5.
2. Championship 1–2: Premier önceliği 6–7.
3. Championship 3 ve sonrası: boş kontenjan yedek sırası 8+.
4. Premier 6–7: Championship'e düşer.
5. Yeni / geri dönen oyuncular: Championship.

## Müze senkronizasyonu

Resmî moddaki başarılar `seasonSystem.customHonours` içine yazılır. Mevcut Kupa Müzesi aynı kayıtları okuyarak oyuncu ve kupa geçmişini günceller.
