# FIFA League System V39 — Feature Model

## Devre Sonu Ödülleri

Her lig ve her devre bağımsız değerlendirilir.

### Devrenin Oyuncusu
Sıralama ölçütleri:
1. Puan
2. Gol averajı
3. Atılan gol
4. Galibiyet

### Gol Kralı
Sıralama ölçütleri:
1. Atılan gol
2. Gol averajı
3. Puan

### Defans Ödülü
Sıralama ölçütleri:
1. En az yenilen gol
2. En fazla gol yemeden tamamlanan maç
3. Gol averajı
4. Puan

Ödüller yalnızca ilgili devredeki bütün maçlar tamamlandıktan sonra kesinleştirilebilir.

## Rekorlar Kitabı

Rekorlar resmî moddaki ve iptal edilmemiş sezonlardan hesaplanır.

Filtreler:
- Tüm ligler
- Premier League
- Championship
- Genel
- 4 yıldız
- 4,5 yıldız
- 5 yıldız

Sezon veya devre toplamı gerektiren rekorlarda yalnızca tamamlanmış bölüm değerlendirilir. Maç ve seri rekorlarında tamamlanmış resmî maçlar değerlendirilir.

## Oyuncu Üyeliği

Roller:
- Ziyaretçi: siteyi ve uygunluk panosunu görüntüler.
- Oyuncu: kendi uygunluğunu günceller.
- Yönetici: turnuvayı yönetir, oyuncu hesaplarını bağlar ve bütün yönetim araçlarını kullanır.

Veri tabloları:
- player_profiles
- player_availability

RLS, oyuncunun başka bir oyuncunun durumunu değiştirmesini engeller.
