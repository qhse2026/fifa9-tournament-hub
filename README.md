# FIFA 9 Tournament Hub — Canlı Sürüm

Bu paket, WhatsApp grubunda paylaşılabilecek tek bir web adresi üzerinden çalışan FIFA 9 turnuva yönetim sistemidir.

## Canlı sistemde neler var?

- 16 oyunculu League Phase: kişi başı 6 maç, toplam 48 maç
- İlk 6 Altın Grup, 7–12 Gümüş Grup, 13–16 elenir
- League Phase puan ve averajlarının ikinci aşamaya taşınması
- Altın ve Gümüş gruplarında kişi başı 5 ek maç
- Altın Grup liderinin doğrudan yarı finale yükselmesi
- Altın 2–Gümüş 3, Altın 3–Gümüş 2, Altın 4–Gümüş 1 eşleşmeleri
- Çeyrek final ve yarı finalde üç maçta iki galibiyet
- Tek maçlık büyük final
- Otomatik puan, averaj, form ve eleme eşleşmesi hesaplama
- FIFA 1–8 için 382 maçlık arşiv ve tüm zamanlar tablosu
- Herkese açık salt okunur canlı ekran
- Yalnızca yönetici hesabına açık skor, kura ve oyuncu yönetimi
- Supabase Realtime ile açık telefon ve bilgisayarlarda anlık güncelleme
- JSON yedek, CSV ve oyuncu listesi dışa aktarma
- WhatsApp paylaşım düğmesi ve PWA desteği

---

# 1. Supabase projesini oluştur

1. Supabase hesabında yeni bir proje oluştur.
2. Proje açıldıktan sonra **SQL Editor** bölümüne gir.
3. `supabase/schema.sql` dosyasının tamamını kopyala ve çalıştır.

Bu işlem:

- `tournament_state` tablosunu,
- `tournament_admins` tablosunu,
- herkese açık okuma politikasını,
- yalnızca yöneticiye açık yazma politikasını,
- Realtime yayınını,
- boş FIFA 9 turnuva kaydını oluşturur.

# 2. Yönetici hesabını oluştur

1. Supabase Dashboard > **Authentication > Users** bölümüne gir.
2. E-posta ve parola ile bir kullanıcı oluştur.
3. `supabase/add_admin_by_email.sql` dosyasını aç.
4. Dosyadaki örnek e-posta adresini yönetici hesabının gerçek e-postasıyla değiştir ve SQL Editor’da çalıştır.
5. Sorgunun sonunda yönetici kaydının listelendiğini doğrula.

Katılımcılar hesap açmayacak. Yalnızca yönetici hesabı sonuç girecek.

# 3. Siteyi Supabase’e bağla

Supabase Dashboard > Project Settings > API bölümünden:

- Project URL
- Publishable key (veya legacy publishable key)

bilgilerini al ve `cloud-config.js` dosyasına gir:

```js
window.FIFA_CLOUD_CONFIG = {
  supabaseUrl: "https://PROJE.supabase.co",
  supabaseAnonKey: "ANON_PUBLIC_KEY",
  tournamentRowId: "fifa-9",
  edition: 9
};
```

**Önemli:** Tarayıcı koduna yalnızca publishable key yazılır. `service_role` key kesinlikle kullanılmaz.

# 4. Siteyi Vercel ile yayınla

En kolay yöntem:

1. `fifa9_tournament_hub_live` klasörünü ZIP hâline getir veya verilen ZIP paketini kullan.
2. Vercel Drop sayfasını aç.
3. ZIP dosyasını veya klasörü sürükleyip bırak.
4. Proje adını belirle ve Deploy seçeneğini kullan.
5. Vercel sana `proje-adi.vercel.app` biçiminde paylaşılabilir bir adres verir.

Bu adres WhatsApp grubunda paylaşılabilir.

# 5. Kullanım

## Katılımcılar

- Site bağlantısını açar.
- Giriş yapmadan fikstür, skor, puan durumu, Altın/Gümüş grup, eleme ve arşivi izler.
- Değişiklik yapamaz.

## Yönetici

1. Sağ üstte **Yönetici Girişi** düğmesini seçer.
2. Supabase Authentication bölümünde oluşturulan e-posta/parolayı girer.
3. Oyuncu isimlerini ekler ve kura çeker.
4. Maça tıklayıp takım ve skor bilgilerini kaydeder.
5. Kaydedilen sonuçlar bütün açık cihazlarda anlık güncellenir.

# 6. Dosya yapısı

- `index.html` — ana uygulama
- `app.js` — turnuva motoru ve arayüz
- `cloud.js` — Supabase Auth, Database ve Realtime bağlantısı
- `cloud-config.js` — proje bağlantı ayarları
- `styles.css` — tasarım
- `data/historical-data.js` — FIFA 1–8 tarihî arşivi
- `supabase/schema.sql` — veritabanı, RLS ve Realtime kurulumu
- `vercel.json` — Vercel yayın ayarları
- `service-worker.js` — PWA ve yerel önbellek

# 7. Güvenlik modeli

- Turnuva verisi internette herkese açık okunabilir.
- Yazma yetkisi yalnızca `tournament_admins` tablosunda kayıtlı Auth kullanıcısına verilir.
- Yetki yalnızca arayüzde değil, Supabase Row Level Security seviyesinde uygulanır.
- Katılımcılar yönetici parolasını bilmeden veri değiştiremez.

# 8. Yedekleme

Yönetici panelindeki **Veri & Yedek** bölümünden düzenli JSON yedeği alınmalıdır. Ayrıca tamamlanan maçlar CSV olarak dışa aktarılabilir.

---

FIFA 9 Tournament Hub bağımsız ve özel bir oyun turnuvasıdır; UEFA, FIFA veya EA Sports ile bağlantılı değildir.

## Simple PIN Player Chat v12/v13

The site includes roster-based player identity selection, a personal 4–8 digit PIN, General and Live Match rooms, unread badges and administrator moderation. It does not require Supabase Anonymous Sign-In. v13 preserves the message draft while live chat polling runs.

Required one-time setup:

1. Run `supabase/chat_feature_v12.sql` in Supabase SQL Editor.
2. Deploy `chat.js` together with the updated website files.
3. Do not enable Anonymous Sign-In; it is not used by this version.

See `CHAT_V12_FIX_INSTALL_TR.txt` and `CHAT_V13_DRAFT_FIX_TR.txt` for details.

## Dynamic Match Odds v14

The Match Odds centre calculates entertainment-only 1-X-2 probabilities and decimal odds for every unplayed FIFA 9 fixture. The model combines last-20 form, last-five performance, all-time efficiency, current FIFA 9 results, goal profile, momentum and a limited head-to-head adjustment. It recalculates automatically after every official result. No database migration is required and no real-money wagering functionality is included.

## Intelligence Suite v15

The v15 release adds one integrated Tournament Intelligence Centre with seven modules:

- Matchday Intelligence: pre-match dossier, live momentum/win probability and automatic post-match narratives
- Elo Power Ranking: long-term opponent-adjusted strength ratings and tier system
- Rivalry DNA: head-to-head identity, balance, scoring intensity and rivalry tags
- Community Prediction League: score predictions using the existing roster/PIN chat identity
- Achievements & Badges: automatic performance, streak, upset, comeback and team-specialist awards
- Qualification Simulator: non-destructive what-if score scenarios and simulated qualification lines
- Dynamic Player Identity Cards: overall rating, play style, attributes, Elo and badge showcase

Run `supabase/intelligence_feature_v15.sql` once to activate the Prediction League database functions. The other six modules are calculated directly from the existing tournament and historical match data.

See `INTELLIGENCE_SUITE_INSTALL_TR.txt` for installation steps.

---

## Dynamic Tournament Simulator v18

The v18 release upgrades **Intelligence Centre → Simulator** into a complete Monte Carlo tournament engine.

- Locks all recorded official results.
- Predicts every remaining League Phase match.
- Builds projected Gold and Silver Groups.
- Simulates all second-stage fixtures, knockout series, semi-finals and the final.
- Calculates Gold/Silver qualification, semi-final, final and championship probabilities.
- Shows the most likely tournament path, projected tables, knockout bracket and every remaining predicted match.
- Uses Elo, last-20 form, last-five momentum, current FIFA 9 performance, goal profile and head-to-head data.
- Automatically invalidates and recalculates after every new official result.
- Supports 1,000, 5,000 and 10,000 simulation runs.

No additional Supabase SQL is required for v18.

---

## Living Intelligence Phase I v19

The v19 release adds five connected real-time intelligence modules inside the Intelligence Centre:

- **FIFA 9 Power Exchange:** A live Power Index combining Elo, last-20 form, momentum, mental strength and championship probability. It identifies market leaders, risers, fallers, hidden value and volatility. The index is an entertainment-only competitive metric, not money or betting value.
- **Pressure Chamber:** Measures close-match, knockout/final, favourite-protection, underdog and recorded comeback performance to create a Mental Index and player archetypes such as FINAL BOSS, ICE COLD and CLUTCH PLAYER.
- **Destiny Path:** Uses the current Monte Carlo simulation to show each player's projected League Phase position, probable Gold/Silver route, likely opponents, semi-final/final/title chances and estimated leverage of the next match.
- **Live Match Pulse:** Activates automatically during a live match and calculates live win probabilities, momentum, match control, pressure, chaos, comeback probability, next-goal signal and a goal-by-goal probability flow.
- **AI Tournament Director:** Generates a data-driven tournament briefing from current results, Elo movement, active streaks, live matches and simulation signals. Four narrative voices are included, with WhatsApp sharing.

All five modules recalculate from the existing tournament state. No new Supabase SQL or database table is required for v19.

## Live Match Studio v21 — Broadcast Experience

The v21 release upgrades the live match experience with a presentation-grade broadcast layer:

- Fullscreen Broadcast Mode
- TV / projector presentation mode
- Live xT attack-threat indicators derived from form, match events and pressure
- Player heat and pressure badges
- Dangerous attack and big-chance quick event inputs
- Automatic animated goal announcement overlay
- Viewer-focused layouts that hide administrative controls during presentation

No new Supabase SQL or database table is required. The new event types are stored inside the existing live match state.
