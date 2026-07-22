# FIFA Tournament Hub V40.0 — Player Access & Continuation Poll

## Temel yaklaşım

V40, çalışan V39 kaynak dosyalarının içine entegre edilmiştir. Haricî `final-chapter-v40.js` veya `fifa-player-access-v40-1.js` eklentisi kullanılmaz.

## Kullanıcı rolleri

### Misafir / normal izleyici

- Siteyi giriş yapmadan kullanır.
- Herkese açık turnuva sayfalarını görüntüler.
- Oyuncu üyeliği zorunlu değildir.
- Devam anketinde oy kullanamaz.

### Oyuncu

- E-posta ve parola ile hesap oluşturur.
- Mevcut FIFA09 katılımcı listesinden kendi adını seçmek zorundadır.
- Bir oyuncu adı yalnızca tek hesaba bağlanır.
- Kendi uygunluk durumunu yönetir.
- FIFA09 devam anketinde tek oy kullanır ve oylama açıkken tercihini değiştirebilir.
- Turnuva sonuçlarını düzenleyemez.

### Yönetici

- Mevcut `tournament_admins` yetkilendirmesini kullanır.
- Turnuva state verisini yönetir.
- Devam anketini açar, kapatır, yayımlar, gizler, sıfırlar veya iptal eder.

## Oyuncu kimlik kaynağı

Oyuncu dropdown listesi doğrudan `tournament_state.payload.current.participants` içindeki FIFA09 oyuncularından üretilir. Ayrı ve zamanla eskiyebilecek bir manuel oyuncu tablosu kullanılmaz.

## Oylama

**Soru:** FIFA09 turnuvası mevcut formatıyla devam etsin mi?

Seçenekler:

- `yes`: Evet, devam etsin
- `no`: Hayır, devam etmesin
- `abstain`: Çekimserim

Her oyuncu/poll kombinasyonu için tek kayıt tutulur. Tercih değiştirildiğinde aynı satır güncellenir.

## Veritabanı nesneleri

- `player_profiles` — V39 tablosu, V40 metadata alanları eklenir
- `player_availability` — V39 tablosu korunur
- `fifa_v40_polls`
- `fifa_v40_poll_votes`

Başlıca RPC fonksiyonları:

- `get_fifa09_registration_players`
- `claim_player_identity`
- `get_fifa_poll_status`
- `get_my_fifa_poll_vote`
- `submit_fifa_poll_vote`
- `admin_manage_fifa_poll`

## İptal duyurusu

V35.2–V35.4 döneminde eklenen tam ekran iptal/kapanış duyurusu `index.html` ve `styles.css` içinden kaldırılmıştır. Service Worker cache anahtarı da değiştirilmiştir.
