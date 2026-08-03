# FIFA Universe V5.7.1 — All-Time Recent Form Ranking

## New
- Tüm Zamanlar Elit Merkezi'ne **Son 10 / Son 20 / Son 50 Maç Sıralaması** eklendi.
- Her pencere oyuncunun kariyerindeki en son tam N resmî maçını kullanır.
- Adil kıyas için yalnızca seçilen pencere kadar resmî maça ulaşmış oyuncular sıralanır.
- Sıralama tie-break sırası: **Puan → Averaj → Atılan Gol → Galibiyet → Daha Az Yenilen Gol**.
- Tablo kolonları: O, G, B, M, AG, YG, AV, P, PPG, G%, Son 5 Form.
- Her oyuncuda kullanılan pencerenin FIFA edisyon aralığı gösterilir.
- Baraj altında kalan oyuncular açılır Coverage bölümünde mevcut maç sayılarıyla gösterilir.
- `FIFA_APP_CONTEXT.buildAllTimeRecentRanking(windowSize)` API'si eklendi.

## Stability
- MutationObserver eklenmedi.
- Sonuç girişi, cloud save, standings ve Spatial motorları değiştirilmedi.
- Build zinciri 571000 olarak eşitlendi.
