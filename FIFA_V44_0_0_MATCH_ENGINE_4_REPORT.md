# FIFA Tournament Hub V44.0.0 — Match Engine 4.0

## Ana değişim

V44.0.0'da görüntü, skor ve istatistik üreten ayrı simülasyonlar kaldırıldı. Maç artık tek bir saniye tabanlı aksiyon zincirinden ilerler. Sahada görülen pas, top kaybı, pres, ikili mücadele, faul, kart, penaltı, şut ve gol aynı olayın hem animasyonunu hem anlatımını hem de istatistiğini üretir.

Bu nedenle ekranda gol olmadan skor değişmez; tamamlanan pas sayısı görünmeyen olaylarla büyümez ve topa sahip olma oranı gerçek topa sahip olunan süre üzerinden hesaplanır.

## Match Engine 4.0

- Rol, mevki, diziliş, hücum/savunma fazı ve takım boyuna bağlı 11'e 11 hareket
- Kaleci-stoper pas döngüsünü kesen ilerleme baskısı ve alan hedefleme
- Kısa, orta, uzun, kilit ve progresif pas ayrımı
- Final üçüncü girişleri, ceza sahası girişleri, orta, top kazanımı ve yüksek top kazanımı
- Pres, ikili mücadele, müdahale, araya girme, faul, sarı/kırmızı kart ve penaltı zincirleri
- Agresif oyuna belirgin fiziksel yorgunluk ve disiplin maliyeti
- AI teknik direktör karakterine, skora, dakikaya, yorgunluğa ve rakip plana göre taktik değişiklikleri
- Maç hızından bağımsız deterministik sonuç: aynı seed, ×1 ve ×16'da aynı maç

## UEFA tarzı maç verileri

İstatistikler altı okunabilir gruba ayrıldı:

1. Anahtar veriler
2. Hücum
3. Pas
4. Savunma
5. Kalecilik
6. Disiplin

Tamamlanan/denenen pas, pas yüzdesi, kısa-orta-uzun dağılımı, progresif pas, kilit pas, şut/isabet, xG, korner, top kazanımı, müdahale, araya girme, ikili mücadele, kurtarış, faul ve kartlar tek maç olay günlüğünden hesaplanır.

## Üç ligli futbol evreni

- Premier Lig: 9 oyuncu
- Championship Lig: 9 oyuncu
- Lig A: 9 oyuncu
- Toplam 27 katılımcı
- Her yönetici için 24 lig maçı
- 27 matchday ve toplam 324 lig fikstürü

Mevcut kariyerler korunur. Oynanmış maçlara dokunulmaz; V44 fikstür sistemi kariyerin bulunduğu noktadan itibaren uygulanır. Tam V44 sezon düzeni için yeni kariyer başlatılabilir.

## Oruç Reis Kupası

- 27 katılımcının tamamı kura havuzundadır.
- Ön elemede 11 Best of 3 seri ve kura ile 5 bay oluşur.
- Son 16, çeyrek final, yarı final ve final yine Best of 3 oynanır.
- Seri 2-0 biterse gereksiz üçüncü maç otomatik iptal edilir.
- Kupa liglerle paralel takvimde devam eder.
- Tüm turlar, seri skorları ve eşleşmeler turnuva ağacında görüntülenir.

## Doğrulama özeti

24 deterministik maçlık regresyon örneği:

- Ortalama şut: 22,63
- Ortalama gol: 1,71
- Ortalama pas: 869,92
- Sarı kart görülen maç: 18/24
- Penaltı görülen maç: 2/24

Ayrıca hız bağımsızlığı, gol-şut ilişkisi, pas doğruluğu, agresif plan yorgunluğu, 9/9/9 lig dağılımı ve kupa tur ilerlemesi otomatik testlerle kontrol edildi.

