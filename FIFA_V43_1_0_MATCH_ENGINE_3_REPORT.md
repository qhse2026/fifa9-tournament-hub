# FIFA Tournament Hub V43.1.0 — Match Engine 3.0

## Sürüm sonucu

V43.1.0, kadro/transfer yönetimi eklemeden gerçek PlayStation maçlarını çevreleyen menajer deneyimini ileri taşır. Taktik ekranındaki üç genel rol kaldırıldı; her dizilişteki 11 taktik pozisyona yalnızca o mevkiye uygun roller verildi.

## Yeni sistemler

- Altı diziliş için 11 mevkiye özel rol seçimi.
- Kaleci, stoper, bek, kanat bek, ön libero, merkez, 10 numara, kanat ve santrfor için ayrı rol havuzları.
- Roller hücum, kontrol, savunma, risk, fizik tüketimi ve faul eğilimine gerçek motor etkisi yapar.
- AI rakip diziliş ve rollerini kendi karakteri, riski, genişliği, presi ve kontrol eğilimine göre seçer.
- Canlı taktik tabletinde diziliş ve bütün mevki rolleri değiştirilebilir.
- 22 hareketli taktik düğüm, hareketli top, top izi ve oyun fazı içeren 2D 11v11 maç görünümü.
- 12 bağlamsal motivasyon konuşması; olumlu, nötr veya negatif sonuç.
- 8 bağlamsal basın toplantısı cevabı; maç başlangıcına ve rapora yansıyan etki.
- Live Event Stream varsayılan kapalıdır; sabit maç kumandasından açılıp kapatılabilir.
- Ekranın sağ altında sürekli görünen duraklat, devam, taktik, olay akışı ve maç merkezinden çıkış kumandası.
- Performance Lab artık Manager ELO, Manager Rating, Taktik IQ, Oyun Okuma, Adaptasyon ve Risk Yönetimi gösterir.

## Uyumluluk

- V43.0 kariyer kayıtları korunur.
- Eski canlı maçlar varsayılan roller ve 2D durum ile güvenli biçimde açılır.
- Service Worker önbelleği V43.1 anahtarıyla yenilenir; eksik opsiyonel varlıklar kurulumu artık tamamen durdurmaz.

## Doğrulama

- `manager-room.js`, `manager-match-engine.js` ve `app.js` JavaScript sözdizimi kontrolünden geçti.
- CSS blok dengesi doğrulandı.
- Sentetik maç açılış testinde 12 motivasyon, 8 basın cevabı, 6 diziliş paneli ve 22 canlı oyuncu düğümü doğrulandı.
- Live Event Stream'in ilk açılışta gizli, sabit maç kumandasının görünür olduğu doğrulandı.
- Rol etkisi karşılaştırmasında hücumcu rol setinin hücum/risk değerini artırıp savunma güvenliğini düşürdüğü doğrulandı.

## Değişen ana dosyalar

- `manager-match-engine.js`
- `manager-room.js`
- `manager-room.css`
- `manager-v42-5-levels.css`
- `index.html`
- `service-worker.js`

