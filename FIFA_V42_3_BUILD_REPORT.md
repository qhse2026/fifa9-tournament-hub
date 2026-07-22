# FIFA Tournament Hub V42.3 — Masterpiece Match Engine

## Ana değişiklikler

- 90 dakikalık simülasyon için yeni pozisyon üretim modeli
- Sabit şut kotası yok; hedef dağılım çoğunlukla maç başına 15–20 toplam şut
- Taktik, tempo, risk, skor ihtiyacı ve maç varyansına bağlı 8–14, 21–30+ şutlu maç ihtimali
- Düzeltilmiş bitiricilik hesabı; `xG` iki kez cezalandırılmıyor
- Maç öncesi motivasyon konuşması: pozitif, etkisiz veya negatif sonuç
- Karar sıklığı maç başına yaklaşık 5–10 aralığına çıkarıldı
- Kullanıcı duraklatınca manuel taktik değişikliği
- Canlı istatistiklere isabetsiz/bloklanan şut, pas, pas yüzdesi, korner, faul ve kart eklendi
- Gelişmiş maç sonu raporu ve motivasyon değerlendirmesi
- Fikstür ve tüm maç sonuçları merkezi
- Her resmî sonuçtan sonra iki takım için dinamik ELO değişimi
- Club Development alanında form, maç başı kariyer puanı, karar ortalaması ve gol farkı
- V42.2 kayıtları için geriye uyumlu state migration

## Denge hedefi

Şut sayısı zorunlu bir rakama sabitlenmez. Motor, gerçek 90 dakikayı hızlandırılmış biçimde işler. Ortalama hedef 15–20 toplam şuttur; kapalı taktikler daha düşük, yüksek tempo ve riskli oyunlar daha yüksek hacim üretebilir.

## Entegrasyon

`github` klasörünün içeriğini mevcut GitHub depo köküne yükleyin ve aynı adlı dosyaları değiştirin. `data` klasörünü koruyun. Supabase tarafında V42.2 şemasıyla uyumludur; yeni SQL çalıştırılması gerekmez.

Tarayıcı eski sürümü gösterirse bir kez sert yenileme yapın. Service Worker cache anahtarı V42.3 için yenilenmiştir.
