# FIFA Tournament Hub V44.3.0

## Physical Load 2.0
- İnsan ve AI tarafında aynı temel maç yorgunluğu uygulanır.
- Normal 90 dakika sonunda dengeli planlar yaklaşık 82–89 fizik aralığını hedefler.
- Yüksek pres, yüksek tempo ve agresif risk ekstra maliyet üretir; ancak karar seçenekleri artık doğrudan 5–10 fizik puanı silmez.
- Eski devam eden maçlarda oluşmuş 40–50 / 94–95 gibi yapay farklar güvenli biçimde normalize edilir.

## Compact Full-Time Report
- Maç sonu ekranı skor, dört ana KPI, üç sonuç ve gelişim ödülleriyle sınırlı özet görünümde açılır.
- Ayrıntılı taktik ve olay analizi kapalı bir panel içindedir.
- Tam olay akışı yerine en fazla sekiz önemli olay gösterilir.
- Mobil ekranda rapor uzunluğu büyük ölçüde azaltılmıştır.

## Cross-Device Career Sync
- Resmî kariyer canlı maç state'i Supabase'e otomatik gönderilir.
- Maç sırasında her 2 simülasyon dakikasında, karar/taktik/değişiklik/duraklatma anlarında kayıt yapılır.
- Telefon arka plana alındığında bulut kaydı tetiklenir.
- Bilgisayarda aynı oyuncu adı ve PIN ile Kariyerimi Aç seçildiğinde en güncel bulut snapshot'ı yüklenir.
- Devam eden maç varsa Canlı Maç sekmesi doğrudan açılır.
- Üst kariyer çubuğuna manuel SENKRONİZE düğmesi ve durum göstergesi eklendi.

## Storage Safety
- Tamamlanmış maçlardaki ağır hareket/telemetri verileri yerel kayıt sırasında küçültülür.
- Eski recovery kopyasının localStorage alanını iki kat doldurması engellenir.
- QuotaExceededError çıkışı, kaydı ve senkronizasyonu durdurmaz.
