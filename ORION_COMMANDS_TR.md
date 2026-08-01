# ORION — Komut Rehberi

## Ses / metin komutları
- “Puan durumunu göster.”
- “Son 10 maçı göster.”
- “Kim lider?”
- “Player Standing’i aç.”
- “Turnuva ağacını göster.”
- “Canlı Maç Studio’yu aç.”
- “Tüm Zamanlar’ı aç.”
- “En farklı galibiyet kimde?”
- “En gollü maç hangisi?”
- “En gollü beraberlik hangisi?”
- “En uzun yenilmezlik serisi kimde?”
- “En fazla şampiyonluk kimde?”
- “En çok gol kimde?”
- “Kerim’in müzesini aç.”
- “Çağlar’ın pasaportunu aç.”
- “Oğuzhan’ın hücum grafiğini göster.”
- “Kerim ile Çağlar’ı karşılaştır.”
- “Turnuvanın durumunu özetle.”
- “Sinematik mod.”
- “Sessiz mod.” / “Sesli mod.”

## Kontroller
- Sağ alt ORION küresi: Spatial AI evrenini açar.
- Ctrl + Shift + Space: ORION aç / kapat.
- Spatial evrende sürükleme: kamerayı döndürür.
- Mouse wheel: zoom.
- Mikrofon düğmesi: tek komutluk sesli dinleme.
- Ctrl/Cmd + K: Spatial AI açıkken komut kutusuna odaklanır.

## Ses desteği
SpeechRecognition desteği olan Chrome/Edge sürümlerinde mikrofon komutları çalışır. Tarayıcı ilk kullanımda mikrofon izni ister. Sesli yanıtlar Web Speech Synthesis üzerinden cihazın yüklü Türkçe/İngilizce seslerinden üretilir.

## Mimari not
V5.0.0’da ORION veriyi DOM metinlerinden tahmin etmez. FIFA_APP_CONTEXT, Player Standing ve All-Time analytics motorlarından okur. Bu sürümde uzak LLM/API kullanılmaz; API anahtarı tarayıcıya gömülmez. LLM katmanı daha sonra güvenli sunucu endpoint’i üzerinden eklenebilir.
