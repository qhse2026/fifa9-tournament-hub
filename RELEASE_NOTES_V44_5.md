# FIFA 9 Tournament Hub V44.5.0 — Unified Career & Final Chapter Fix

## Gerçek kök neden

Tam repository incelemesinde önceki güncelleme dosyalarının GitHub Pages’in çalıştırdığı repository köküne değil, alt paket klasörlerine yüklendiği belirlendi. Bu sürümde çalışan root dosyaları doğrudan birleştirildi ve paket yapısı alt `github` klasörü olmadan hazırlandı.

## Kritik runtime düzeltmesi

Final Chapter sabitleri `loadState()` çalıştıktan sonra tanımlandığı için yeni Final Chapter kodu tarayıcı açılışında `ReferenceError` üretebiliyordu. Sabitler state yüklemesinden önceye taşındı. Bu hata yalnızca sözdizimi kontrolüyle görünmiyor; V44.5 runtime VM testinde tespit edilip düzeltildi.

## Kariyer çıkışı

- İlk kayıtlı kariyere otomatik geri dönüş kaldırıldı.
- Çıkış aktif maçı durdurur, aktif kariyer seçimini kaldırır ve Manager giriş ekranını hemen çizer.
- `QuotaExceededError` çıkışı engellemez.
- Büyük bitmiş maç telemetrileri yerel kayıt kotasını korumak için küçültülür.
- Kariyer verisinin kendisi silinmez.

## Cihazlar arası senkronizasyon

- Resmî kariyer snapshot’ına aktif maç, dakika/saniye, skor, istatistik, fizik, taktik, karar ve sezon ilerlemesi dahildir.
- Cihaz kimliği, revision ve güncelleme zamanı karşılaştırılır.
- Bulut daha yeniyse otomatik indirme yapılır.
- Hem cihaz hem bulut değişmişse sessiz üzerine yazma yerine conflict durumu oluşturulur.
- Kullanıcı `Buluttan Al` veya `Bu Cihazı Gönder` seçebilir.
- Arka plana geçme, duraklatma, karar, taktik değişimi ve maç merkezinden çıkış senkronizasyon noktalarıdır.

## Fizik/yorgunluk dengesi

- İnsan ve AI aynı temel fizik tüketim modelini kullanır.
- Taktik kararlarının doğrudan fizik cezası azaltıldı.
- Dengeli 90 dakika testinde kullanıcı 87.09, AI 86.87 fizik ile bitirdi.
- Çok yüksek pres/tempo/risk testinde iki taraf da 79.75 fizik ile bitirdi.

## Kısa maç sonu raporu

Varsayılan rapor yalnızca skor, xG, şut, topa sahip olma, fizik, üç ana sonuç, ELO/IQ/kariyer kazanımı ve son kritik kararları gösterir. Detaylı analiz DOM’a ancak kullanıcı paneli açtığında eklenir.

## FIFA 9 Final Chapter — Son Bilet

- Format onaylıdır.
- Sultan Atasaral çekilmiştir.
- Şanslı çeyrek finalist kaldırılmıştır.
- Doğrudan çeyrek finalistler: Oğuzhan Dindar, Aziz Sarıoğlu, Ercan Köseoğlu.
- Kalan 8 oyuncu dört BO3 ana eleme oynar.
- Dört kaybeden iki BO3 Son Bilet yarı finaline girer.
- Yarı final galipleri BO3 Son Bilet finali oynar.
- Final galibi sekizinci çeyrek finalist olur.
- Çeyrek final havuzu matematiği: 3 doğrudan + 4 ana eleme galibi + 1 Son Bilet galibi = 8 farklı oyuncu.

## Cache/deploy

- Sürüm: V44.5.0
- Service Worker cache: `fifa-tournament-hub-v44-5-0-unified-career`
- Ana JS/CSS çağrılarına `?v=44.5.0` cache bust parametresi eklendi.
- Service Worker `updateViaCache: none` ile kaydedilir ve deploy sonrası update ister.
