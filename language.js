(() => {
  "use strict";

  const STORAGE_KEY = "fifa9-ui-language";
  const supported = new Set(["tr", "en"]);
  const initial = supported.has(localStorage.getItem(STORAGE_KEY))
    ? localStorage.getItem(STORAGE_KEY)
    : ((navigator.language || "tr").toLowerCase().startsWith("en") ? "en" : "tr");

  const dictionary = {
    "Ana menü": "Main menu",
    "Dil seçimi": "Language selection",
    "Türkçe": "Turkish",
    "Menüyü aç": "Open menu",
    "Kapat": "Close",
    "Dashboard": "Dashboard",
    "Kura & Oyuncular": "Draw & Players",
    "UEFA League Phase": "UEFA League Phase",
    "Altın Grup": "Gold Group",
    "Gümüş Grup": "Silver Group",
    "Eleme Aşaması": "Knockout Stage",
    "Turnuva Arşivi": "Tournament Archive",
    "Tüm Zamanlar": "All-Time Records",
    "Veri & Yedek": "Data & Backup",
    "Canlı bağlantı hazırlanıyor": "Preparing live connection",
    "Bağlanıyor": "Connecting",
    "Bağlanıyor...": "Connecting...",
    "Yerel mod": "Local mode",
    "Bulut kurulumu bekleniyor": "Cloud setup pending",
    "Veri yükleniyor": "Loading data",
    "Kaydediliyor": "Saving",
    "Canlı · kaydedildi": "Live · saved",
    "Canlı · yönetici": "Live · administrator",
    "Canlı · izleyici": "Live · viewer",
    "Yeniden bağlanıyor": "Reconnecting",
    "Bağlantı hatası": "Connection error",
    "Canlı bağlantı": "Live connection",
    "Yedek Al": "Create Backup",
    "Yönetici Girişi": "Admin Login",
    "Yönetici · Çıkış": "Admin · Sign Out",
    "Bulut Kurulumu": "Cloud Setup",
    "Sonuç girişi yalnızca yöneticiye açıktır": "Result entry is restricted to the administrator",
    "Son güncelleme:": "Last update:",
    "Turnuva Merkezi": "Tournament Hub",
    "16 oyunculu League Phase, Altın ve Gümüş ligleri, üç maçlık eleme serileri ve sekiz turnuvalık tarihçe tek bir merkezde. Sonuçlar yönetici tarafından girilir; puan tabloları, sıralamalar ve eşleşmeler bütün cihazlarda otomatik güncellenir.": "A 16-player League Phase, Gold and Silver leagues, best-of-three knockout series and the history of eight tournaments in one hub. Results are entered by the administrator; standings, rankings and brackets update automatically on every device.",
    "Canlı Turnuvaya Git": "Open Live Tournament",
    "Oyuncuları Kaydet & Kura Çek": "Save Players & Run Draw",
    "8 Turnuvalık Arşivi Aç": "Open 8-Tournament Archive",
    "WhatsApp'ta Paylaş": "Share on WhatsApp",
    "Turnuva Durumu": "Tournament Status",
    "Tamamlanan lig maçı": "League matches completed",
    "Altın + Gümüş": "Gold + Silver",
    "İkinci aşama maçı": "Second-stage matches",
    "Şampiyon": "Champion",
    "Henüz Belirlenmedi": "Not Yet Decided",
    "FIFA 9 Şampiyonu": "FIFA 9 Champion",
    "Final yolu devam ediyor": "The road to the final continues",
    "Turnuva Yol Haritası": "Tournament Roadmap",
    "Kura çekiminden kupaya kadar otomatik aşama kontrolü.": "Automatic stage control from the draw to the trophy.",
    "Canlı League Phase Tablosu": "Live League Phase Table",
    "İlk 6 Altın Gruba, 7–12 Gümüş Gruba yükselir.": "Positions 1–6 advance to the Gold Group; 7–12 advance to the Silver Group.",
    "Tümünü Gör": "View All",
    "Henüz kura çekilmedi": "The draw has not been made yet",
    "16 oyuncuyu kaydedip League Phase fikstürünü oluşturduğunda canlı puan tablosu burada görünecek.": "The live standings will appear here after you register 16 players and generate the League Phase schedule.",
    "Kura Sayfasına Git": "Go to Draw Page",
    "Turnuva İstatistiği": "Tournament Statistics",
    "Geçmiş sekiz turnuvanın kalıcı kayıtları.": "Permanent records from the previous eight tournaments.",
    "Sıralamayı Aç": "Open Rankings",
    "Tamamlanan turnuva": "Completed tournaments",
    "FIFA 1’den FIFA 8’e kadar arşivlendi.": "Archived from FIFA 1 through FIFA 8.",
    "Kayıtlı tarihî maç": "Recorded historical matches",
    "Takımlar, skorlar ve final aşamaları dahil.": "Including teams, scores and final stages.",
    "Tarihî gol": "Historical goals",
    "Tüm turnuvaların birleşik gol arşivi.": "Combined goal archive for all tournaments.",
    "Tüm zamanlar lideri": "All-time leader",
    "Arşiv yükleniyor": "Loading archive",
    "FIFA 9 mevcut lideri": "Current FIFA 9 leader",
    "Şampiyonlar Kulübü": "Champions Club",
    "Şampiyonluk": "Titles",
    "podyum": "podiums",
    "Kura": "Draw",
    "16 oyuncu ve 6 maçlık fikstür": "16 players and a 6-match schedule",
    "48 maç · tek lig tablosu": "48 matches · one league table",
    "Altın / Gümüş": "Gold / Silver",
    "İki ligde toplam 30 maç": "30 matches across two leagues",
    "Eleme Serileri": "Knockout Series",
    "Çeyrek final ve yarı final": "Quarter-finals and semi-finals",
    "Büyük Final": "Grand Final",
    "Tek maç · tek şampiyon": "Single match · one champion",
    "Kura Bekleniyor": "Awaiting Draw",
    "League Phase Devam Ediyor": "League Phase in Progress",
    "Altın/Gümüş Aşaması Hazır": "Gold/Silver Stage Ready",
    "Altın/Gümüş Grupları": "Gold/Silver Groups",
    "Eleme Kurası Hazır": "Knockout Draw Ready",
    "Turnuva Tamamlandı": "Tournament Completed",
    "16 Oyuncu Kadrosu": "16-Player Roster",
    "İsimler tamamlandığında sistem altı turluk, tekrarsız League Phase fikstürünü üretir.": "Once all names are entered, the system generates a six-round League Phase schedule with no repeat opponents.",
    "oyuncu": "players",
    "Oyuncu": "Player",
    "İsimleri Toplu Yapıştır": "Paste Names in Bulk",
    "Kura Çek & 6 Turluk Fikstürü Oluştur": "Run Draw & Generate 6-Round Schedule",
    "Canlı izleyici modundasın. Oyuncu ve kura yönetimi yalnızca turnuva yöneticisine açıktır.": "You are in live viewer mode. Player and draw management is restricted to the tournament administrator.",
    "Fikstür oluşturuldu.": "The schedule has been generated.",
    "İsimleri değiştirebilirsin; ancak oyuncu sıraları ve maç kimlikleri korunur. Tamamen yeni bir kura için “FIFA 9 Verisini Sıfırla” işlemini kullan.": "You may change the names, but player slots and match IDs will remain unchanged. Use “Reset FIFA 9 Data” for a completely new draw.",
    "Kura ve oyuncu listesi canlı olarak yayımlanıyor.": "The draw and player list are being published live.",
    "Nihai Format": "Final Format",
    "FIFA 9 · UEFA League Phase sistemi": "FIFA 9 · UEFA League Phase system",
    "16 oyuncu, tek tablo, oyuncu başına 6 maç; toplam 48 maç.": "16 players, one table, 6 matches per player; 48 matches in total.",
    "İlk 6 Altın, sonraki 6 Gümüş; son 4 elenir. Puanlar taşınır.": "The top 6 enter Gold, the next 6 enter Silver; the bottom 4 are eliminated. Points carry over.",
    "İkinci Lig Aşaması": "Second League Stage",
    "Her grupta 6 oyuncu ve kişi başı 5 maç; toplam 30 maç.": "Six players in each group and five matches per player; 30 matches in total.",
    "Altın 1 doğrudan yarı final; diğer eşleşmeler üç maçta iki galibiyet.": "Gold 1 advances directly to the semi-final; the other ties are best-of-three series.",
    "Tek maç; eşitlikte uzatma ve penaltılar.": "Single match; extra time and penalties apply if level.",
    "Puan eşitliğinde sırasıyla genel averaj, atılan gol, galibiyet sayısı ve alfabetik sıra uygulanır.": "Ties on points are resolved by goal difference, goals scored, wins and then alphabetical order.",
    "Oluşturulan Kura": "Generated Draw",
    "League Phase Fikstürü": "League Phase Schedule",
    "Her oyuncu altı farklı rakiple karşılaşır.": "Each player faces six different opponents.",
    "Sonuç Girişine Git": "Go to Result Entry",
    "League Phase henüz oluşturulmadı": "The League Phase has not been generated yet",
    "Önce 16 oyuncuyu kaydet ve kura çek. Sistem her oyuncuya altı farklı rakip atayacak.": "Register 16 players and run the draw first. The system will assign six different opponents to each player.",
    "League Phase'e Git": "Go to League Phase",
    "ROUND 1": "ROUND 1",
    "16 oyuncu · 6 tur · tek puan tablosu · ilk 12 bir sonraki aşamaya yükselir.": "16 players · 6 rounds · one table · the top 12 advance to the next stage.",
    "Tamamlanan Maç": "Completed Matches",
    "Puan Tablosu": "Standings",
    "Puan · averaj · atılan gol · galibiyet sıralaması.": "Ranked by points, goal difference, goals scored and wins.",
    "Altın / Gümüş Gruplarını Oluştur": "Generate Gold / Silver Groups",
    "Maç Merkezi": "Match Centre",
    "Bir maça tıklayarak skor ve takım bilgilerini gir.": "Click a match to enter the score and team details.",
    "Gümüş Bölgesi": "Silver Qualification Zone",
    "Gümüş Gruba yükselir": "Advances to the Silver Group",
    "Altın Bölgesi": "Gold Qualification Zone",
    "Altın Gruba yükselir": "Advances to the Gold Group",
    "Elenecek Bölge": "Elimination Zone",
    "Turnuvaya veda eder": "Eliminated from the tournament",
    "Grup henüz oluşmadı": "Group not generated yet",
    "League Phase’in 48 maçı tamamlandıktan sonra ilk 12 oyuncu iki gruba ayrılır.": "After all 48 League Phase matches are completed, the top 12 players are divided into two groups.",
    "ROUND 2": "ROUND 2",
    "League Phase puanları ve averajları taşındı. Her oyuncu bu aşamada 5 ek maç yapar.": "League Phase points and goal differences carry over. Each player plays five additional matches in this stage.",
    "Grup Maçı": "Group Matches",
    "Tamamlanan ikinci aşama maçı": "Second-stage matches completed",
    "Kişi Başı Ek Maç": "Additional Matches per Player",
    "Puanlara ve averaja eklenir": "Added to points and goal difference",
    "Kümülatif Puan Durumu": "Cumulative Standings",
    "sonuçları birlikte hesaplanır.": "results are calculated together.",
    "Eleme Eşleşmelerini Oluştur": "Generate Knockout Ties",
    "Grup Fikstürü": "Group Schedule",
    "Beş turluk tek lig usulü.": "Five-round single round-robin format.",
    "Diğer grubun tamamlanması bekleniyor.": "Waiting for the other group to be completed.",
    "ROAD TO GLORY": "ROAD TO GLORY",
    "Çeyrek final ve yarı final: üç maçta iki galibiyet. Büyük final: tek maç.": "Quarter-finals and semi-finals: best of three. Grand Final: single match.",
    "Şampiyonluk Yolu": "Road to the Championship",
    "Seri maçlarına sırayla tıkla; iki galibiyet alan oyuncu otomatik olarak sonraki tura taşınır.": "Open the series matches in order; the first player to two wins advances automatically.",
    "Çeyrek Final 1": "Quarter-final 1",
    "Çeyrek Final 2": "Quarter-final 2",
    "Çeyrek Final 3": "Quarter-final 3",
    "Yarı Final 1": "Semi-final 1",
    "Yarı Final 2": "Semi-final 2",
    "Kazanan Yarı Final 2’ye yükselir.": "The winner advances to Semi-final 2.",
    "Kazanan, Altın Grup lideriyle Yarı Final 1’de oynar.": "The winner faces the Gold Group leader in Semi-final 1.",
    "Seri Kuralları": "Series Rules",
    "Uygulanan eleme mantığı.": "Knockout format in use.",
    "Lig liderliğinin ödülü.": "Reward for winning the league.",
    "Üç maçlık seri; iki galibiyet alan tur atlar.": "Best-of-three series; the first to two wins advances.",
    "Önceki eşleşme sonucu bekleniyor.": "Waiting for the previous tie to be completed.",
    "BÜYÜK FİNAL · TEK MAÇ": "GRAND FINAL · SINGLE MATCH",
    "Yarı final galipleri bekleniyor.": "Waiting for the semi-final winners.",
    "Final sonucunu girmek için tıkla": "Click to enter the final result",
    "Final sonucu bekleniyor": "Awaiting final result",
    "ŞAMPİYON": "CHAMPION",
    "Tur atlayan:": "Advanced:",
    "Maç": "Match",
    "TUR": "ROUND",
    "SKOR GİR": "ENTER SCORE",
    "BEKLENİYOR": "PENDING",
    "Takım seçilmedi": "Team not selected",
    "Penaltı galibi:": "Penalty winner:",
    "Sonuç girişi için tıkla": "Click to enter result",
    "Canlı sonuç bekleniyor": "Awaiting live result",
    "Oyuncu": "Player",
    "Form": "Form",
    "TURNUVA": "TOURNAMENT",
    "Maç ·": "Matches ·",
    "Gol": "Goals",
    "farklı oyuncu": "different players",
    "karşısında final galibiyeti": "won the final against",
    "Finalist": "Runner-up",
    "Sıra": "Place",
    "maç": "matches",
    "gol": "goals",
    "LEGACY": "LEGACY",
    "FIFA 1–8 Turnuva Arşivi": "FIFA 1–8 Tournament Archive",
    "Yüklediğin Excel arşivinden alınan 382 maç, sekiz final ve tüm zamanlar kayıtları.": "382 matches, eight finals and all-time records imported from the uploaded Excel archive.",
    "Arşivlenen Maç": "Archived Matches",
    "Takım ve skor detayları": "Team and score details",
    "Turnuvalar": "Tournaments",
    "Şampiyonlar": "Champions",
    "Tüm Maçlar": "All Matches",
    "Aşama": "Stage",
    "Ev Sahibi": "Home Player",
    "Deplasman": "Away Player",
    "Skor": "Score",
    "Tüm zamanlar puan liderleri.": "All-time points leaders.",
    "Yedekleme İşlemleri": "Backup Operations",
    "Yedeği İndir": "Download Backup",
    "Maç Sonuçlarını İndir": "Download Match Results",
    "Oyuncuları İndir": "Download Players",
    "Yedeği Geri Yükle": "Restore Backup",
    "JSON Dosyası Seç": "Select JSON File",
    "FIFA 9 Verisini Sıfırla": "Reset FIFA 9 Data",
    "Geçmiş FIFA 1–8 arşivine dokunmadan yalnızca güncel turnuvayı siler.": "Deletes only the current tournament without changing the FIFA 1–8 archive.",
    "Güncel Turnuvayı Sıfırla": "Reset Current Tournament",
    "Kaynak Arşiv": "Source Archive",
    "FIFA 1–8 verileri “All Time Tournament Results.xlsx” dosyasından siteye işlendi.": "FIFA 1–8 data was imported into the site from “All Time Tournament Results.xlsx”.",
    "Arşivi Görüntüle": "View Archive",
    "Teknik Durum": "Technical Status",
    "Canlı site bağlantısı ve erişim modeli.": "Live-site connection and access model.",
    "Ortak canlı veri": "Shared live data",
    "Supabase veritabanı ve Realtime bağlantısı aktif.": "Supabase database and Realtime connection are active.",
    "Supabase bağlantı bilgileri bekleniyor.": "Waiting for Supabase connection details.",
    "Erişim seviyesi": "Access level",
    "Yönetici: sonuç, oyuncu ve aşama yönetimi açık.": "Administrator: results, players and stages can be managed.",
    "İzleyici: bütün veriler görünür, değişiklik kapalı.": "Viewer: all data is visible; editing is disabled.",
    "Telefona eklenebilir": "Can be installed on a phone",
    "HTTPS üzerinden yayınlandığında ana ekrana uygulama gibi eklenebilir.": "When published over HTTPS, it can be added to the home screen like an app.",
    "Maç Sonucu": "Match Result",
    "Ev Sahibi Takımı": "Home Team",
    "Deplasman Takımı": "Away Team",
    "Ev Sahibi Skoru": "Home Score",
    "Deplasman Skoru": "Away Score",
    "Uzatma / Penaltı Galibi": "Extra-time / Penalty Winner",
    "Skor eşit değil / seçilmedi": "Score not level / not selected",
    "Maç Notu": "Match Note",
    "İsteğe bağlı kısa not": "Optional short note",
    "Sonucu Temizle": "Clear Result",
    "İptal": "Cancel",
    "Sonucu Kaydet": "Save Result",
    "Geçerli bir skor gir.": "Enter a valid score.",
    "Berabere biten eleme maçında uzatma/penaltı galibini seç.": "Select the extra-time/penalty winner for a tied knockout match.",
    "Sonuç kaydedildi.": "Result saved.",
    "Sonuç temizlendi.": "Result cleared.",
    "League Phase kurası oluşturuldu: 6 tur, 48 maç.": "League Phase draw generated: 6 rounds, 48 matches.",
    "League Phase tamamlanmadan ikinci aşama oluşturulamaz.": "The second stage cannot be generated before the League Phase is complete.",
    "Altın ve Gümüş grupları oluşturuldu. League Phase puanları taşındı.": "Gold and Silver groups generated. League Phase points were carried over.",
    "İkinci aşama tamamlanmadan eleme serileri oluşturulamaz.": "Knockout series cannot be generated before the second stage is complete.",
    "Eleme serileri oluşturuldu.": "Knockout series generated.",
    "16 oyuncunun tamamını benzersiz isimlerle doldur.": "Enter unique names for all 16 players.",
    "İsimleri Toplu Ekle": "Add Names in Bulk",
    "Her satıra bir oyuncu adı yaz veya yapıştır.": "Enter or paste one player name per line.",
    "İlk 16 dolu satır alınır. Mevcut isimler değiştirilir.": "The first 16 non-empty lines are used. Existing names will be replaced.",
    "İsimleri Uygula": "Apply Names",
    "oyuncu adı uygulandı.": "player names applied.",
    "Değişiklikler bu cihazda kaydedildi.": "Changes were saved on this device.",
    "Değişiklikler canlı siteye kaydedildi.": "Changes were saved to the live site.",
    "Bulut kaydı başarısız. İnternet bağlantısını ve yetkini kontrol et.": "Cloud save failed. Check your internet connection and permissions.",
    "Canlı turnuva verisi güncellendi.": "Live tournament data updated.",
    "Canlı veriye bağlanılamadı. Son kayıtlı görünüm gösteriliyor.": "Could not connect to live data. Showing the most recently saved view.",
    "Bu işlem yalnızca turnuva yöneticisine açıktır.": "This action is restricted to the tournament administrator.",
    "Yönetici oturumu kapatıldı.": "Administrator signed out.",
    "Maç sonuçları CSV olarak indirildi.": "Match results downloaded as CSV.",
    "Yedek yükleme yalnızca yöneticiye açıktır.": "Backup restore is restricted to the administrator.",
    "Geçersiz yedek": "Invalid backup",
    "Yedek başarıyla geri yüklendi.": "Backup restored successfully.",
    "JSON yedeği okunamadı.": "The JSON backup could not be read.",
    "Katılımcılar giriş yapmadan canlı turnuvayı izler. Bu giriş yalnızca sonuç ve fikstür yönetimi içindir.": "Participants can follow the live tournament without signing in. This login is only for result and fixture management.",
    "E-posta": "Email",
    "Parola": "Password",
    "Giriş Yap": "Sign In",
    "Yönetici girişi başarılı.": "Administrator login successful.",
    "Giriş başarısız.": "Login failed.",
    "Bu hesap turnuva yöneticisi olarak yetkilendirilmemiş.": "This account is not authorised as a tournament administrator.",
    "Canlı Site Kurulumu": "Live Site Setup",
    "Bu paket canlı kullanıma hazırdır. Supabase proje URL'si ve anon/public key'i cloud-config.js dosyasına girilmelidir.": "This package is ready for live use. Enter the Supabase Project URL and anon/public key in cloud-config.js.",
    "Supabase projesi oluştur": "Create a Supabase project",
    "SQL Editor'da supabase/schema.sql dosyasını çalıştır.": "Run supabase/schema.sql in the SQL Editor.",
    "Yönetici kullanıcısını ekle": "Add the administrator user",
    "Authentication > Users bölümünden kullanıcı oluştur, UUID'sini tournament_admins tablosuna ekle.": "Create a user under Authentication > Users and add the UUID to the tournament_admins table.",
    "Bağlantı bilgilerini gir": "Enter connection details",
    "Project URL ve anon/public key'i cloud-config.js içine yapıştır.": "Paste the Project URL and anon/public key into cloud-config.js.",
    "Vercel'e yükle": "Deploy to Vercel",
    "Klasörü veya ZIP'i Vercel Drop'a sürükleyip yayınla.": "Drag the folder or ZIP into Vercel Drop and deploy it.",
    "Tamam": "Done",
    "Bu işlem güncel turnuvadaki oyuncuları, fikstürleri ve sonuçları siler. FIFA 1–8 arşivi etkilenmez.": "This deletes the players, fixtures and results in the current tournament. The FIFA 1–8 archive is not affected.",
    "Vazgeç": "Cancel",
    "Evet, Sıfırla": "Yes, Reset",
    "Güncel turnuva sıfırlandı.": "Current tournament reset.",
    "Tüm hakları saklıdır.": "All rights reserved."
  };

  const reverse = Object.fromEntries(Object.entries(dictionary).map(([tr, en]) => [en, tr]));

  function currentLanguage() {
    return supported.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : initial;
  }

  function translateExact(value, lang = currentLanguage()) {
    if (lang === "tr") return reverse[value] || value;
    return dictionary[value] || value;
  }

  function translateDynamic(value, lang = currentLanguage()) {
    if (lang !== "en") return value;
    let text = value;
    const patterns = [
      [/^Genel ilerleme %(\d+)$/, "Overall progress $1%"],
      [/^(\d+) \/ 16 oyuncu$/, "$1 / 16 players"],
      [/^Oyuncu (\d+)$/, "Player $1"],
      [/^(\d+)\. TUR$/, "ROUND $1"],
      [/^Maç (\d+)$/, "Match $1"],
      [/^(\d+) maç$/, "$1 matches"],
      [/^(\d+) gol$/, "$1 goals"],
      [/^(\d+) oyuncu$/, "$1 players"],
      [/^(\d+) farklı oyuncu$/, "$1 different players"],
      [/^(\d+)× Şampiyon$/, "$1× Champion"],
      [/^Şampiyonluk · (\d+) final · (\d+) podyum$/, "Titles · $1 finals · $2 podiums"],
      [/^(.+) · (\d+) puan$/, "$1 · $2 points"],
      [/^(.+) · (\d+) puan · ([+\-]?\d+) averaj$/, "$1 · $2 points · $3 goal difference"],
      [/^Penaltı galibi: (.+)$/, "Penalty winner: $1"],
      [/^Tur atlayan: (.+)$/, "Advanced: $1"],
      [/^(.+) · ŞAMPİYON$/, "$1 · CHAMPION"],
      [/^ŞAMPİYON: (.+)$/, "CHAMPION: $1"],
      [/^(\d+) oyuncu adı uygulandı\.$/, "$1 player names applied."],
      [/^(.+) Grup henüz oluşmadı$/, "$1 Group has not been generated yet"],
      [/^League Phase \+ (Altın|Gümüş) Grup sonuçları birlikte hesaplanır\.$/, (_, g) => `League Phase + ${g === "Altın" ? "Gold" : "Silver"} Group results are calculated together.`],
      [/^(Altın|Gümüş) Grup Fikstürü$/, (_, g) => `${g === "Altın" ? "Gold" : "Silver"} Group Schedule`],
      [/^(Altın|Gümüş) Grup$/, (_, g) => `${g === "Altın" ? "Gold" : "Silver"} Group`],
      [/^(\d+) Maç · (\d+) Gol$/, "$1 Matches · $2 Goals"],
      [/^(.+) karşısında final galibiyeti$/, "won the final against $1"],
      [/^Son güncelleme: (.+)$/, "Last update: $1"]
    ];
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(text)) {
        text = text.replace(pattern, replacement);
        break;
      }
    }
    return text;
  }

  function translateString(value, lang = currentLanguage()) {
    if (value == null) return value;
    const raw = String(value);
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    const core = raw.trim();
    if (!core) return raw;
    const exact = translateExact(core, lang);
    const dynamic = exact === core ? translateDynamic(core, lang) : exact;
    return leading + dynamic + trailing;
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    if (!parent) return false;
    return Boolean(parent.closest("script, style, noscript, [data-no-translate]"));
  }

  function translateNode(root = document.body) {
    const lang = currentLanguage();
    document.documentElement.lang = lang;
    document.documentElement.dataset.language = lang;
    document.title = lang === "en" ? "FIFA 9 Tournament Hub" : "FIFA Turnuva Merkezi";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = lang === "en"
      ? "FIFA Tournament Hub — FIFA 9 UEFA League Phase, live standings, fixtures, knockout series and an eight-tournament archive."
      : "FIFA Turnuva Merkezi — FIFA 9 UEFA League Phase, canlı puan tabloları, fikstür, eleme serileri ve 8 turnuvalık arşiv.";

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      if (shouldSkip(node)) continue;
      const translated = translateString(node.nodeValue, lang);
      if (translated !== node.nodeValue) node.nodeValue = translated;
    }

    if (lang === "en") {
      const headerMap = { "O": "MP", "G": "W", "B": "D", "M": "L", "AG": "GF", "YG": "GA", "AV": "GD", "P": "Pts" };
      const headers = root.querySelectorAll?.("th") || [];
      for (const header of headers) {
        const key = header.textContent.trim();
        if (headerMap[key]) header.textContent = headerMap[key];
      }
    }

    const elements = root.querySelectorAll?.("[placeholder], [title], [aria-label]") || [];
    for (const element of elements) {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        if (!element.hasAttribute(attr)) continue;
        const current = element.getAttribute(attr);
        const translated = translateString(current, lang);
        if (translated !== current) element.setAttribute(attr, translated);
      }
    }
    updateSwitcher();
  }

  let translating = false;
  function guardedTranslate(root) {
    if (translating) return;
    translating = true;
    try { translateNode(root); } finally { translating = false; }
  }

  function setLanguage(lang) {
    if (!supported.has(lang)) return;
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    location.reload();
  }

  function updateSwitcher() {
    const lang = currentLanguage();
    document.querySelectorAll("[data-language-option]").forEach(button => {
      const active = button.dataset.languageOption === lang;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-language-option]");
    if (button) setLanguage(button.dataset.languageOption);
  });

  const observer = new MutationObserver(mutations => {
    if (translating) return;
    const roots = new Set();
    for (const mutation of mutations) {
      if (mutation.type === "characterData") roots.add(mutation.target.parentElement || document.body);
      mutation.addedNodes?.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
        else if (node.parentElement) roots.add(node.parentElement);
      });
    }
    roots.forEach(root => guardedTranslate(root));
  });

  window.FIFA_I18N = {
    get language() { return currentLanguage(); },
    setLanguage,
    t: translateString,
    translate: guardedTranslate
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      guardedTranslate(document.body);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  } else {
    guardedTranslate(document.body);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
})();
