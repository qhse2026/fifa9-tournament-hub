# FIFA Tournament Hub V43.2.0 — Tactical Intelligence

## Sürüm sonucu

V43.2.0, Match Engine 3.0'ın 11v11 temelini yaşayan bir dört-faz taktik motoruna dönüştürür. Takım artık doksan dakika boyunca tek bir statik dizilişle oynamaz; topa sahip olma ve geçiş durumuna göre davranışı, saha şekli, fizik tüketimi ve risk profili değişir.

Bu sürüm kadro veya transfer yönetimi eklemez. Oyuncular, gerçek PlayStation/FIFA maçını çevreleyen taktik pozisyon düğümleridir.

## Tactical Intelligence 3.2

- Dört bağımsız oyun fazı: Top Bizdeyken, Top Rakipteyken, Topu Kazanınca ve Topu Kaybedince.
- Her faz için dört davranış; toplam 16 motor etkili seçenek.
- Altı dizilişin her biri için dört ayrı saha şekli. Örneğin 4-3-3, yerleşik hücumda 3-2-5 ve topsuz oyunda 4-1-4-1'e dönüşür.
- Canlı 2D sahadaki 22 düğüm; rol, top konumu, aktif faz ve seçilen davranışa göre yeniden konumlanır.
- Canlı şekil şeridi iki takımın o anki saha formunu ve insan takımının aktif faz emrini gösterir.

## Rol bağlantıları ve gerçek motor etkisi

- Rol Uyumu, Geçiş Güvenliği, Genişlik, Merkez Kontrolü ve Fizik Yükü canlı hesaplanır.
- Bindiren bek + içe kat eden kanat, Sahte 9 + Gölge Forvet ve Pasör Kaleci + Top Kullanan Stoper gibi bağlantılar sinerji üretir.
- Aynı koridoru kullanan roller, aşırı hücumcu görev dağılımı ve ana pres planıyla çelişen faz emirleri uyarı ve motor cezası üretir.
- Sinerji/çelişki sonucu hücum, kontrol, savunma, risk, fizik tüketimi ve geçiş güvenliğine uygulanır; yalnızca metinsel tavsiye değildir.

## Koşullu taktik emirleri

İnsan ve AI yöneticiler maçtan önce IF/THEN emirleri belirleyebilir:

- 60'tan sonra gerideysek yüklen.
- 70'ten sonra öndeysek koru.
- Fizik yüzde 60'ın altına düşerse sakinleş.
- Rakip kırmızı görürse sahayı genişlet.
- Biz kırmızı görürsek kompaktlaş.
- 75'te skor eşitse kontrollü risk al.

Her emir koşulu ilk kez gerçekleştiğinde yalnızca bir kez çalışır, olay akışına ve Manager Battle kaydına girer. AI emirleri rakibin karakterine ve risk profiline göre seçilir.

## Maç içi ve maç sonrası

- Taktik tabletinde formasyon, 11 mevki rolü, dört faz davranışı ve koşullu emirler değiştirilebilir.
- AI skor, momentum ve süreye göre faz davranışlarını değiştirerek hücum, koruma veya aldatma planına geçebilir.
- Maç raporundaki Maç Planı Otopsisi; faz kullanım sürelerini, hücum/savunma şekillerini, çalışan otomatik emirleri, rol bağlantılarını ve kritik çelişkileri saklar.
- Geçmiş maç arşivi aynı taktik zekâ raporunu yeniden açabilir.

## Uyumluluk

- V43.1 ve önceki kariyerler korunur.
- Eski maç planlarına güvenli dört-faz varsayılanları ve dört temel koşullu emir eklenir.
- Devam eden eski maçlara insan tarafı, faz durumu, faz sayaçları ve emir geçmişi alanları otomatik eklenir.
- Service Worker önbelleği `fifa-tournament-hub-v43-2-0-tactical-intelligence` anahtarıyla yenilenir.

## Doğrulama

- `manager-match-engine.js` ve `manager-room.js` JavaScript sözdizimi kontrolünden geçti.
- CSS blok dengesi doğrulandı.
- Sentetik maç testinde 16 faz seçeneği, 6 koşullu emir, 22 canlı saha düğümü ve 4-3-3 için 3-2-5 / 4-1-4-1 şekil dönüşümü doğrulandı.
- Rol analizi aynı plan içinde iki sinerji ve bir çelişkiyi algıladı; değerler ana motor agregasyonuna taşındı.
- “60'tan sonra gerideysek yüklen” emri doğru maç koşulunda otomatik tetiklendi.
- Canlı şekil şeridi, faz telemetrisi, taktik otopsi raporu ve eski-plan migrasyonu test edildi.

## Değişen ana dosyalar

- `manager-match-engine.js`
- `manager-room.js`
- `manager-v42-5-levels.css`
- `index.html`
- `service-worker.js`
