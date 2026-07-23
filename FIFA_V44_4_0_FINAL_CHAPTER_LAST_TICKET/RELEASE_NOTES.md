# FIFA Tournament Hub V44.4.0 — Final Chapter: Son Bilet

## Onaylanan yeni format

- Sultan Atasaral Final Chapter kadrosuna dahil edilmez.
- Şanslı çeyrek finalist uygulaması tamamen kaldırıldı.
- Oğuzhan Dindar, Aziz Sarıoğlu ve Ercan Köseoğlu doğrudan çeyrek finalisttir.
- Kalan 8 oyuncu dört adet Best of 3 ana eleme serisine girer.
- Ana elemenin 4 galibi doğrudan çeyrek finale yükselir.
- Ana elemede elenen 4 oyuncu Son Bilet play-off'una girer:
  - 2 adet Best of 3 yarı final,
  - 1 adet Best of 3 final.
- Son Bilet finalinin galibi sekizinci ve son çeyrek finalist olur.
- Çeyrek final kadrosu: 3 doğrudan + 4 ana eleme galibi + 1 Son Bilet galibi = 8 oyuncu.

## Yıldız ve seri kuralları

- Ana eleme: 4★, Best of 3.
- Son Bilet play-off yarı finalleri: 4★, Best of 3.
- Son Bilet play-off finali: 4★, Best of 3.
- Çeyrek final: 4.5★, Best of 3.
- Yarı final: 5★, Best of 3.
- Büyük final: 5★, tek maç ve aynı takım.

## Teknik değişiklikler

- Final Chapter veri modeli format sürümü 42'ye yükseltildi.
- `secondChanceSemi` ve `secondChanceFinal` aşamaları eklendi.
- Ana eleme kaybedenlerini otomatik belirleyen akış eklendi.
- Eski şanslı oyuncu alanı kaldırıldı.
- Son Bilet aşamaları mevcut 4★ play-off takım havuzunu kullanır.
- Sonraki tur oluşturulduğunda önceki sonuçlar kilitlenir.
- Eski format etkin fakat henüz maç oynanmamışsa yeni formata otomatik dönüştürülür.
- Final Chapter maksimum maç hesabı 31'den 40'a güncellendi.
- Oylama/format görseli yeni akışa göre yenilendi.
