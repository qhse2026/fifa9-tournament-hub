(() => {
  "use strict";

  const VERSION = "43.4.0";
  const SETTINGS_KEY = "fifa-v43-4-official-shell";
  const TEST_BASELINE_KEY = "fifa-v43-4-test-baseline";
  const MAIN_STATE_KEY = "fifa-tournament-hub-v1";
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let translationBusy = false;
  let observer = null;

  const copy = {
    tr: {
      kicker: "FIFA TOURNAMENT HUB · LIVE MOTION ENGINE 4.0",
      title: "Oyuna Nasıl Girmek İstersin?",
      subtitle: "Resmî kariyeri güvenli biçimde aç, test araçlarını ayrı tut veya dilediğin zaman ana ekrana dön.",
      officialTag: "GERÇEK OYUN MODU",
      officialTitle: "Resmî Kariyere Gir",
      officialBody: "Kalıcı kariyer, tek çekim takım kurası, Manager ELO ve resmî sezon ilerlemesi.",
      officialOne: "Test ve yeniden kura kontrolleri kapatılır",
      officialTwo: "Kariyer sonuçları resmî kayda işlenir",
      officialThree: "Bulut kaydı ve Manager PIN yapısı korunur",
      officialButton: "GERÇEK OYUN MODUNU AÇ",
      testTag: "GELİŞTİRİCİ ALANI",
      testTitle: "Test Laboratuvarı",
      testBody: "Motor, taktik ve arayüz denemeleri için resmî kariyerden ayrılmış çalışma alanı.",
      testOne: "Yeniden kura ve test kontrolleri görünür",
      testTwo: "Resmî mod kilitleri uygulanmaz",
      testThree: "Girişte mevcut kariyerin güvenlik kopyası alınır",
      testButton: "TEST MODUNDA DEVAM ET",
      build: "V43.4.0 · OFFICIAL GAME SHELL",
      safety: "Kariyer verisi silinmez. Mod değişiminde mevcut kayıt yapısı korunur.",
      mode: "OYUN MODU",
      official: "RESMÎ KARİYER",
      test: "TEST LAB",
      exit: "Oyundan Çık",
      exitTitle: "Ana Ekrana Dön",
      officialToast: "Gerçek Oyun Modu açıldı. Resmî kariyer kilitleri etkin.",
      testToast: "Test Laboratuvarı açıldı. Resmî kariyer yapısı korunuyor.",
      savedToast: "İlerleme kaydedildi ve ana ekrana dönüldü.",
      closeHint: "Oyundan Çık, tarayıcı sekmesini zorla kapatmaz; güvenli biçimde başlangıç ekranına döner.",
      enAudit: "İngilizce kapsam denetimi"
    },
    en: {
      kicker: "FIFA TOURNAMENT HUB · LIVE MOTION ENGINE 4.0",
      title: "How Would You Like to Play?",
      subtitle: "Open your official career safely, keep testing tools separate, or return to this title screen at any time.",
      officialTag: "REAL GAME MODE",
      officialTitle: "Enter Official Career",
      officialBody: "Persistent career progression, single-draw team selection, Manager ELO and official season records.",
      officialOne: "Testing and redraw controls are disabled",
      officialTwo: "Career results count toward official records",
      officialThree: "Cloud saves and Manager PIN remain protected",
      officialButton: "START REAL GAME MODE",
      testTag: "DEVELOPER AREA",
      testTitle: "Test Laboratory",
      testBody: "A separate workspace for engine, tactics and interface testing without official-mode locks.",
      testOne: "Redraw and testing controls remain visible",
      testTwo: "Official-mode restrictions are not applied",
      testThree: "A safety snapshot is created on entry",
      testButton: "CONTINUE IN TEST MODE",
      build: "V43.4.0 · OFFICIAL GAME SHELL",
      safety: "Career data is never deleted. Existing save structures are preserved when switching modes.",
      mode: "GAME MODE",
      official: "OFFICIAL CAREER",
      test: "TEST LAB",
      exit: "Exit Game",
      exitTitle: "Return to Title Screen",
      officialToast: "Real Game Mode is active. Official career locks are enabled.",
      testToast: "Test Laboratory is active. Official career data remains protected.",
      savedToast: "Progress saved. Returned to the title screen.",
      closeHint: "Exit Game safely returns to the title screen; browsers may prevent a website from closing its own tab.",
      enAudit: "English coverage audit"
    }
  };

  const exact = new Map(Object.entries({
    "Ana menü": "Main menu",
    "Menüyü aç": "Open menu",
    "Duyuruyu kapat": "Close announcement",
    "Siteye Devam Et": "Continue to Site",
    "FIFA TURNUVA MERKEZİ": "FIFA TOURNAMENT HUB",
    "Turnuva Organizasyonu Hakkında Duyuru": "Tournament Organisation Announcement",
    "Anlayışınız için teşekkür ederim.": "Thank you for your understanding.",
    "Dashboard": "Dashboard",
    "Canlı Maç": "Live Match",
    "Canlı Maç Merkezi": "Live Match Centre",
    "Canlı İstatistikler": "Live Statistics",
    "Form Merkezi": "Form Centre",
    "Maç Oranları": "Match Odds",
    "Turnuva Zekâ Merkezi": "Tournament Intelligence Centre",
    "Zekâ Merkezi": "Intelligence Centre",
    "Turnuva Sohbeti": "Tournament Chat",
    "Sohbet": "Chat",
    "Kura & Oyuncular": "Draw & Players",
    "Altın Grup": "Gold Group",
    "Gümüş Grup": "Silver Group",
    "Eleme Aşaması": "Knockout Stage",
    "Çıktı Merkezi": "Print Centre",
    "Turnuva Arşivi": "Tournament Archive",
    "Sezonlar & Kupa Müzesi": "Seasons & Trophy Museum",
    "FIFA Lig Sistemi": "FIFA League System",
    "Tüm Zamanlar": "All-Time Records",
    "Takım İstatistikleri": "Team Statistics",
    "Veri & Yedek": "Data & Backup",
    "Canlı bağlantı hazırlanıyor": "Preparing live connection",
    "Canlı bağlantı": "Live connection",
    "Bağlanıyor": "Connecting",
    "Bağlanıyor…": "Connecting…",
    "Yerel mod": "Local mode",
    "Bulut kurulumu bekleniyor": "Cloud setup pending",
    "Veri yükleniyor": "Loading data",
    "Kaydediliyor": "Saving",
    "Canlı · kaydedildi": "Live · saved",
    "Canlı · yönetici": "Live · administrator",
    "Canlı · izleyici": "Live · viewer",
    "Canlı · oyuncu": "Live · player",
    "Yeniden bağlanıyor": "Reconnecting",
    "Bağlantı hatası": "Connection error",
    "Yedek Al": "Create Backup",
    "Yönetici Girişi": "Administrator Login",
    "Oyuncu / Yönetici Girişi": "Player / Administrator Login",
    "Bulut Kurulumu": "Cloud Setup",
    "Yönetici · Çıkış": "Administrator · Sign Out",
    "Kapat": "Close",
    "Vazgeç": "Cancel",
    "Kaydet": "Save",
    "Devam Et": "Continue",
    "Duraklat": "Pause",
    "Taktik": "Tactics",
    "Maç Merkezinden Çık": "Exit Match Centre",
    "Olay Akışını Aç": "Show Event Stream",
    "Olay Akışını Kapat": "Hide Event Stream",
    "Gelişmiş Maç Analizi": "Advanced Match Analysis",
    "Canlı Maç Anlatımı": "Live Match Commentary",
    "Oyun Hızı": "Game Speed",
    "Maç Planı": "Match Plan",
    "Maç Planı Otopsisi": "Match Plan Autopsy",
    "Top Bizdeyken": "In Possession",
    "Top Rakipteyken": "Out of Possession",
    "Topu Kazanınca": "After Winning Possession",
    "Topu Kaybedince": "After Losing Possession",
    "Koşullu Taktik Emirleri": "Conditional Tactical Orders",
    "Rol Uyumu": "Role Compatibility",
    "Geçiş Güvenliği": "Transition Security",
    "Genişlik": "Width",
    "Merkez Kontrolü": "Central Control",
    "Fizik Yükü": "Physical Load",
    "Topa Sahip Olma": "Possession",
    "Şut": "Shots",
    "İsabetli Şut": "Shots on Target",
    "Büyük Fırsat": "Big Chances",
    "Pas": "Passes",
    "Pas İsabeti": "Pass Accuracy",
    "Korner": "Corners",
    "Faul": "Fouls",
    "Sarı Kart": "Yellow Cards",
    "Kırmızı Kart": "Red Cards",
    "Gol": "Goal",
    "Penaltı": "Penalty",
    "Penaltı Kaçtı": "Penalty Missed",
    "Büyük Şans": "Big Chance",
    "Mutlak Gol Kaçtı": "Huge Chance Missed",
    "Tehlikeli Baskı": "Dangerous Pressure",
    "Atak": "Attack",
    "Not": "Note",
    "Nötr": "Neutral",
    "Maç Sonucu": "Match Result",
    "Maç sonucu kaydedildi.": "Match result saved.",
    "Maç sonucu temizlendi.": "Match result cleared.",
    "Takım": "Team",
    "Oyuncu": "Player",
    "Oyuncular": "Players",
    "Maç": "Match",
    "Maçlar": "Matches",
    "Galibiyet": "Win",
    "Galibiyetler": "Wins",
    "Beraberlik": "Draw",
    "Mağlubiyet": "Loss",
    "Puan": "Points",
    "Averaj": "Goal Difference",
    "Gol Attı": "Goals For",
    "Gol Yedi": "Goals Against",
    "Sıra": "Rank",
    "Durum": "Status",
    "Fikstür": "Fixtures",
    "Sonuçlar": "Results",
    "Puan Durumu": "Standings",
    "Liglerin tamamlanması bekleniyor": "Waiting for the leagues to be completed",
    "Kupayı Başlat": "Start the Cup",
    "ŞAMPİYON": "CHAMPION",
    "Doğrudan Yarı Final": "Direct Semi-final Qualification",
    "Yarı Final": "Semi-final",
    "Yarı Final 1": "Semi-final 1",
    "Yarı Final 2": "Semi-final 2",
    "BÜYÜK FİNAL · TEK MAÇ · AYNI TAKIM": "GRAND FINAL · SINGLE MATCH · SAME TEAM",
    "Ortak takım henüz belirlenmedi": "Shared team has not been selected yet",
    "Final Sonucunu Düzenle": "Edit Final Result",
    "Final Sonucu Gir": "Enter Final Result",
    "Oruç Reis Kupası tamamlandı": "Oruç Reis Cup completed",
    "Süper Kupayı Oluştur": "Create the Super Cup",
    "Yeni sezon öncesi şampiyonlar maçı": "Champions match before the new season",
    "Oruç Reis Kupasının tamamlanması bekleniyor": "Waiting for the Oruç Reis Cup to be completed",
    "Sezonun büyük eleme kupası": "The season's major knockout cup",
    "Resmî sezon aktif": "Official season active",
    "Test sezonu aktif": "Test season active",
    "Fikstür hazır": "Fixtures ready",
    "Oyuncu kayıtları hazırlanıyor": "Preparing player registrations",
    "İptal edildi": "Cancelled",
    "Sezon tamamlandı": "Season completed",
    "ÖDÜLLER HAZIR": "AWARDS READY",
    "KESİNLEŞTİ": "FINALIZED",
    "DEVRE DEVAM EDİYOR": "LEG IN PROGRESS",
    "Devrenin Oyuncusu": "Player of the Leg",
    "Gol Kralı": "Top Scorer",
    "Defans Ödülü": "Defensive Award",
    "Henüz belirlenmedi": "Not yet determined",
    "Devrenin tamamlanması bekleniyor": "Waiting for the leg to be completed",
    "Ödülleri Yeniden Hesapla": "Recalculate Awards",
    "Ödülleri Kesinleştir": "Finalize Awards",
    "Şimdi müsait": "Available now",
    "Bu akşam müsait": "Available this evening",
    "Bugün uygun değil": "Unavailable today",
    "Maç teklifine açık": "Open to match offers",
    "Takım Havuzu": "Team Pool",
    "Takımlar": "Teams",
    "Havuzu Kaydet": "Save Pool",
    "Takım havuzları kilitlendi.": "Team pools locked.",
    "Takım havuzlarının kilidi açıldı.": "Team pools unlocked.",
    "Yedekleme İşlemleri": "Backup Operations",
    "FIFA 9 JSON Yedeği": "FIFA 9 JSON Backup",
    "Yedeği İndir": "Download Backup",
    "Yedeği Geri Yükle": "Restore Backup",
    "JSON Dosyası Seç": "Select JSON File",
    "Maçları CSV Olarak Al": "Export Matches as CSV",
    "CSV İndir": "Download CSV",
    "Oyuncu Listesi": "Player List",
    "Oyuncuları İndir": "Download Players",
    "FIFA 9 Verisini Sıfırla": "Reset FIFA 9 Data",
    "Güncel Turnuvayı Sıfırla": "Reset Current Tournament",
    "Kaynak Arşiv": "Source Archive",
    "Simülasyonu Yenile": "Refresh Simulation",
    "WhatsApp’ta Paylaş": "Share on WhatsApp",
    "WhatsApp'ta Paylaş": "Share on WhatsApp",
    "Dinamik Turnuva Simülasyonu": "Dynamic Tournament Simulation",
    "Turnuva simülasyonu güncel verilerle yeniden çalıştırıldı.": "Tournament simulation rerun with current data.",
    "Sıralamayı Yeniden Hesapla": "Recalculate Standings",
    "Temizle": "Clear",
    "Skor Senaryoları": "Score Scenarios",
    "Simüle Puan Durumu": "Simulated Standings",
    "Sıradaki iki turun maçları.": "Matches from the next two rounds.",
    "Yalnızca girilen senaryonun anlık sonucu.": "Live outcome of the entered scenario only.",
    "Kura Sayfasına Git": "Go to Draw Page",
    "Simülasyon verisi oluşturulamadı.": "Simulation data could not be generated.",
    "Canlı Olasılık ve Maç Kontrolü": "Live Probability & Match Control",
    "Maç Hikâyesi ve AI Yorum": "Match Story & AI Commentary",
    "Momentum Özeti": "Momentum Summary",
    "Ev Sahibi Son 15 dk": "Home Last 15m",
    "Deplasman Son 15 dk": "Away Last 15m",
    "Canlı Baskı": "Live Pressure",
    "Oyun Akışı": "Flow State",
    "Kritiklik": "Importance",
    "Liderlik Değişimi": "Lead Changes",
    "Canlı Dakika": "Live Minute",
    "Kazanma ihtimali": "Win probability",
    "Kazanırsa tahmini sıçrama": "Estimated upside with a win",
    "Kaybederse tahmini risk": "Estimated downside with a loss",
    "Sıradaki Kader Maçı": "Next Destiny Match",
    "En Olası Yolculuk": "Most Likely Journey",
    "İkinci Aşama": "Second Stage",
    "Olası Rakipler": "Likely Opponents",
    "Model Kararı": "Model Verdict",
    "Katılmadı": "No appearance",
    "OYUN TARZI": "PLAY STYLE",
    "FAVORİ TAKIM": "FAVOURITE TEAM",
    "Kariyer Güçlü Yönleri": "Career Strengths",
    "Kariyer Gelişim Alanları": "Career Development Areas",
    "Hızlı Gerçekler": "Quick Facts",
    "En Skor Yaptığı Maç": "Highest-Scoring Match",
    "En Zor Rakibe Karşı Galibiyet": "Hardest Opponent Win",
    "Galibiyet Serisi": "Win Streak",
    "Yenilmezlik": "Unbeaten Run",
    "PRESTİJ": "PRESTIGE",
    "KUPA": "TITLES",
    "GALİBİYET": "WINS",
    "MAÇ": "MATCHES",
    "PERFORMANSI": "PERFORMANCE",
    "Turnuva Performans Atlası": "Tournament Performance Atlas",
    "Henüz canlı olay girilmedi.": "No live event has been entered yet.",
    "Önce canlı maç başlatılmalı.": "A live match must be started first.",
    "Standart Görünüme Dön": "Exit Presentation",
    "TV / Projektör": "TV / Projector",
    "Yayın Görünümü": "Broadcast View",
    "İzleyici ekranını büyüt": "Enlarge the viewer experience",
    "Değişiklikler bu cihazda kaydedildi.": "Changes saved on this device.",
    "Değişiklikler canlı siteye kaydedildi.": "Changes saved to the live site.",
    "Bulut kaydı başarısız. İnternet bağlantısını ve yetkini kontrol et.": "Cloud save failed. Check your internet connection and permissions.",
    "Direktör bülteni güncel verilerle yenilendi.": "Director briefing refreshed with current data.",
    "Senaryo sıralaması yeniden hesaplandı.": "Scenario standings recalculated.",
    "Paylaşılacak simülasyon bulunmuyor.": "No simulation is available to share.",
    "Form Verisi Hazır Değil": "Form Data Is Not Ready",
    "Oyuncuları Aç": "Open Players",
    "Son 20 Maç Form Merkezi": "Last 20 Matches Form Centre",
    "Kura Bekleniyor": "Waiting for Draw",
    "League Phase Devam Ediyor": "League Phase in Progress",
    "Altın/Gümüş Aşaması Hazır": "Gold/Silver Stage Ready",
    "Resmî Kariyer": "Official Career",
    "Test Kariyeri": "Test Career",
    "Gerçek Oyun Modu": "Real Game Mode",
    "Test Modu": "Test Mode",
    "Oyundan Çık": "Exit Game"
  }));

  const paragraphTranslations = new Map(Object.entries({
    "Bu organizasyon; herkesin yoğun çalışma temposu içinde keyifli vakit geçirebileceği, dostça rekabet edebileceği ve birlikte güzel anılar biriktirebileceği bir ortam oluşturmak amacıyla planlandı. Aynı anlayışla, turnuvayı keyifle takip edebileceğiniz ve sizlere yakışan kapsamlı bir platform hazırlamak için büyük bir emek ve zaman harcandı.": "This event was created to give everyone a chance to relax, enjoy friendly competition and build good memories together despite a demanding work schedule. The same care and effort went into building a comprehensive platform worthy of the community following the tournament.",
    "Ancak süreç içerisinde organizasyonun başlangıçtaki eğlence ve birliktelik amacından uzaklaşmaya başladığını; bazı arkadaşlarımızın kendisini rahatsız, huzursuz veya keyifsiz hissettiğini gözlemledim. Bir etkinliğin insanları bir araya getirmesi gerekirken aramızdaki güzel arkadaşlık ortamını olumsuz etkileme ihtimali benim için turnuvanın devamından daha önemlidir.": "During the process, however, I observed that the event was moving away from its original purpose of enjoyment and togetherness, and that some colleagues felt uncomfortable or unhappy. Protecting the positive relationships between us matters more to me than continuing an event that should bring people together.",
    "Bu nedenle, herhangi bir arkadaşımızı hedef göstermeden veya kimseyi kırmadan, turnuva organizasyonunu bu noktada sonlandırma ve bundan sonraki FIFA turnuvalarının organizasyon sorumluluğunu üstlenmeme kararı aldım.": "For that reason, without singling anyone out or causing offence, I decided to end the tournament organisation at this point and not take responsibility for organising future FIFA tournaments.",
    "Bu karar herhangi bir kişiye karşı alınmış değildir. Tek amacım, gemide birlikte geçirdiğimiz zamanı, karşılıklı saygımızı ve arkadaşlık bağlarımızı korumaktır. Bugüne kadar turnuvaya katılan, destek veren, maçları takip eden ve organizasyona renk katan herkese içtenlikle teşekkür ederim.": "This decision is not directed at any individual. My only aim is to protect the time we share onboard, our mutual respect and our friendships. I sincerely thank everyone who participated, supported the event, followed the matches and contributed to the atmosphere.",
    "Umarım geriye rekabetten çok birlikte güldüğümüz ve keyif aldığımız güzel anlar kalır.": "I hope what remains are the good memories of laughing and enjoying the experience together, rather than the competition itself."
  }));

  const patterns = [
    [/^(\d+)\/(\d+) maç tamamlandı$/i, "$1/$2 matches completed"],
    [/^(\d+) gerçek sonuç sabitlendi$/i, "$1 real results locked"],
    [/^(\d+) maç$/i, "$1 matches"],
    [/^(\d+) gol$/i, "$1 goals"],
    [/^(\d+) puan$/i, "$1 points"],
    [/^(\d+) galibiyet$/i, "$1 wins"],
    [/^(\d+) gol yedi$/i, "$1 goals conceded"],
    [/^(\d+) gol yemeden maç$/i, "$1 clean sheets"],
    [/^(\d+)\. Devre$/i, "Leg $1"],
    [/^(\d+)\. devre$/i, "Leg $1"],
    [/^Son kayıt:\s*(.+)$/i, "Last saved: $1"],
    [/^Seri galibi:\s*(.+)$/i, "Series winner: $1"],
    [/^Ortak takım:\s*(.+)$/i, "Shared team: $1"],
    [/^Performans lideri:\s*(.+)$/i, "Performance leader: $1"],
    [/^Gol lideri:\s*(.+)$/i, "Goal leader: $1"],
    [/^En çok seçilen takım:\s*(.+)$/i, "Most selected team: $1"],
    [/^En farklı skor:\s*(.+)$/i, "Biggest winning margin: $1"],
    [/^Son güncelleme:\s*(.+)$/i, "Last update: $1"],
    [/^(.+) güncellendi\.$/i, "$1 updated."],
    [/^(.+) tamamlandı\.$/i, "$1 completed."],
    [/^(.+) kesinleşti\.$/i, "$1 finalized."],
    [/^(.+) oluşturuldu\.$/i, "$1 created."],
    [/^(.+) kaydedildi\.$/i, "$1 saved."],
    [/^(.+) için takım seçimi zorunludur\.$/i, "A team selection is required for $1."],
    [/^(.+), (.+) listesinde bulunmuyor\.$/i, "$1 is not included in the $2 list."],
    [/^(.+) bu takımı (\d+)\. devrede daha önce kullandı\.$/i, "$1 already used this team in Leg $2."],
    [/^FIFA (\d+) test taslağı oluşturuldu\. FIFA (\d+) verileri etkilenmedi\.$/i, "FIFA $1 test draft created. FIFA $2 data was not affected."],
    [/^FIFA (\d+) taslağı iptal edildi\. FIFA (\d+) aynen korunuyor\.$/i, "FIFA $1 draft cancelled. FIFA $2 remains unchanged."],
    [/^(.+) (\d+)\. devre bireysel ödülleri kesinleşti\.$/i, "$1 Leg $2 individual awards finalized."],
    [/^(.+) skorda üstünlüğü değiştirdi$/i, "$1 changed the lead"],
    [/^(.+) ile (.+) arasındaki karşılaşma (.+) tamamlandı\.$/i, "The match between $1 and $2 finished $3."],
    [/^(.+), (\d+) farklı geriden gelerek (.+) karşısında (.+) kazandı\.$/i, "$1 came back from $2 goals down to beat $3 $4."],
    [/^(.+), (.+) karşısında (\d+) farklı dominant bir galibiyet aldı\.$/i, "$1 recorded a dominant $3-goal win over $2."],
    [/^(.+), gol düellosuna dönüşen karşılaşmayı (.+) kazandı\.$/i, "$1 won a high-scoring shootout $2."],
    [/^(.+), dengeli mücadelede (.+) karşısında (.+) kazandı\.$/i, "$1 beat $2 $3 in a balanced contest."],
    [/^(.+) ve (.+), (.+) beraberlikle puanları paylaştı\.$/i, "$1 and $2 shared the points in a $3 draw."],
    [/^(.+) Elo sıralamasında (\d+) puanlık değişim yarattı\.$/i, "$1 produced a $2-point change in the Elo ranking."]
  ];

  function safeParse(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }

  function getSettings() {
    const fallbackLanguage = document.documentElement.dataset.language === "en" ? "en" : "tr";
    return { language: fallbackLanguage, mode: null, ...safeParse(localStorage.getItem(SETTINGS_KEY), {}) };
  }

  function saveSettings(patch) {
    const next = { ...getSettings(), ...patch, version: VERSION, updatedAt: new Date().toISOString() };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    return next;
  }

  function t(key) {
    const lang = getSettings().language === "en" ? "en" : "tr";
    return copy[lang][key] || copy.tr[key] || key;
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  }

  function renderGate() {
    let gate = document.getElementById("v434GameGate");
    if (!gate) {
      gate = document.createElement("section");
      gate.id = "v434GameGate";
      gate.className = "v434-gate";
      gate.setAttribute("role", "dialog");
      gate.setAttribute("aria-modal", "true");
      document.body.appendChild(gate);
    }
    const lang = getSettings().language;
    gate.innerHTML = `
      <div class="v434-gate-card">
        <header class="v434-gate-head">
          <div class="v434-brand"><div class="v434-brand-mark">F9</div><div><div class="v434-kicker">${esc(t("kicker"))}</div><h1>${esc(t("title"))}</h1><p class="v434-subtitle">${esc(t("subtitle"))}</p></div></div>
          <div class="v434-lang" role="group" aria-label="Language"><button type="button" data-v434-language="tr" class="${lang === "tr" ? "active" : ""}">TR</button><button type="button" data-v434-language="en" class="${lang === "en" ? "active" : ""}">EN</button></div>
        </header>
        <div class="v434-mode-grid">
          <article class="v434-mode-card official"><span class="v434-mode-tag">${esc(t("officialTag"))}</span><h2>${esc(t("officialTitle"))}</h2><p>${esc(t("officialBody"))}</p><div class="v434-mode-list"><span>${esc(t("officialOne"))}</span><span>${esc(t("officialTwo"))}</span><span>${esc(t("officialThree"))}</span></div><button type="button" class="v434-primary" data-v434-enter="official">${esc(t("officialButton"))}</button></article>
          <article class="v434-mode-card test"><span class="v434-mode-tag">${esc(t("testTag"))}</span><h2>${esc(t("testTitle"))}</h2><p>${esc(t("testBody"))}</p><div class="v434-mode-list"><span>${esc(t("testOne"))}</span><span>${esc(t("testTwo"))}</span><span>${esc(t("testThree"))}</span></div><button type="button" class="v434-secondary" data-v434-enter="test">${esc(t("testButton"))}</button></article>
        </div>
        <footer class="v434-gate-foot"><div><strong>${esc(t("safety"))}</strong><br>${esc(t("closeHint"))}</div><div class="v434-build">${esc(t("build"))}</div></footer>
      </div>`;
  }

  function showGate({ save = true } = {}) {
    if (save) saveCurrentState();
    pauseActiveMatch();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    renderGate();
    document.body.classList.add("v434-gate-open");
    document.getElementById("v434GameGate")?.classList.add("is-open");
    saveSettings({ mode: null });
    updateModeUI();
  }

  function hideGate() {
    document.body.classList.remove("v434-gate-open");
    document.getElementById("v434GameGate")?.classList.remove("is-open");
  }

  function dismissLegacyShutdown() {
    document.body.classList.remove("shutdown-mode");
    const announcement = document.getElementById("tournamentAnnouncement");
    if (announcement) {
      announcement.classList.add("hidden");
      announcement.setAttribute("aria-hidden", "true");
    }
    try { sessionStorage.setItem("fifa-tournament-announcement-dismissed", "true"); } catch (_) {}
  }

  function getContextState() {
    try { return window.FIFA_APP_CONTEXT?.getState?.() || null; } catch (_) { return null; }
  }

  function saveCurrentState() {
    try {
      if (window.FIFA_APP_CONTEXT?.saveState) return Promise.resolve(window.FIFA_APP_CONTEXT.saveState(false, true));
    } catch (_) {}
    return Promise.resolve();
  }

  function markOfficialState() {
    const state = getContextState();
    if (!state || typeof state !== "object") return;
    const system = state.seasonSystem;
    if (system && typeof system === "object") {
      const edition = Number(system.activeEdition) || 10;
      const seasons = Array.isArray(system.seasons) ? system.seasons : [];
      const season = seasons.find(item => Number(item?.edition) === edition) || seasons.at(-1);
      if (season && typeof season === "object") season.mode = "official";
      if (system.fifa10Draft?.settings) system.fifa10Draft.settings.testMode = false;
    }
    const candidates = [state.managerCareer, state.managerRoom?.career, state.career, state.manager?.career];
    candidates.filter(Boolean).forEach(career => {
      if (typeof career === "object") { career.mode = "official"; career.testMode = false; career.official = true; }
    });
    try { window.FIFA_APP_CONTEXT?.saveState?.(true, true); } catch (_) {}
  }

  function createTestBaseline() {
    try {
      const state = getContextState() || safeParse(localStorage.getItem(MAIN_STATE_KEY), null);
      if (state) sessionStorage.setItem(TEST_BASELINE_KEY, JSON.stringify({ createdAt: new Date().toISOString(), state }));
    } catch (_) {}
  }

  function enterMode(mode) {
    const official = mode === "official";
    if (!official) createTestBaseline();
    saveSettings({ mode: official ? "official" : "test" });
    dismissLegacyShutdown();
    document.body.classList.toggle("v434-official", official);
    document.body.classList.toggle("v434-test", !official);
    if (official) markOfficialState();
    hideGate();
    updateModeUI();
    enforceModeLocks();
    translateDocument();
    try { window.FIFA_APP_CONTEXT?.refreshView?.(); } catch (_) {}
    toast(official ? t("officialToast") : t("testToast"), "success");
  }

  function pauseActiveMatch() {
    const selectors = [
      '[data-manager-action="pause-match"]', '[data-action="pause-match"]',
      '[data-manager-action="pause"]', '[data-action="pause-live"]'
    ];
    const button = selectors.map(selector => document.querySelector(selector)).find(Boolean);
    if (button && !button.disabled) {
      try { button.click(); } catch (_) {}
    }
  }

  function toast(message, type = "success") {
    try {
      if (window.FIFA_APP_CONTEXT?.toast) { window.FIFA_APP_CONTEXT.toast(message, type); return; }
    } catch (_) {}
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    stack.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  function injectPersistentControls() {
    const topbar = document.querySelector(".topbar-actions");
    if (topbar && !document.getElementById("v434ModeChip")) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.id = "v434ModeChip";
      chip.className = "v434-mode-chip";
      chip.dataset.v434OpenGate = "true";
      topbar.prepend(chip);
    }
    const sidebarFooter = document.querySelector(".sidebar-footer");
    if (sidebarFooter && !document.getElementById("v434ExitWrap")) {
      const wrap = document.createElement("div");
      wrap.id = "v434ExitWrap";
      wrap.className = "v434-exit-wrap";
      wrap.innerHTML = `<button type="button" class="v434-exit-btn" data-v434-exit="true"></button>`;
      sidebarFooter.before(wrap);
    }
    updateModeUI();
  }

  function updateModeUI() {
    const settings = getSettings();
    const mode = settings.mode === "test" ? "test" : "official";
    const chip = document.getElementById("v434ModeChip");
    if (chip) {
      chip.classList.toggle("test", mode === "test");
      const nextHTML = `<i></i><div><span>${esc(t("mode"))}</span><strong>${esc(mode === "test" ? t("test") : t("official"))}</strong></div>`;
      if (chip.innerHTML !== nextHTML) chip.innerHTML = nextHTML;
      if (chip.title !== t("exitTitle")) chip.title = t("exitTitle");
    }
    const exit = document.querySelector("[data-v434-exit]");
    if (exit) {
      if (exit.textContent !== t("exit")) exit.textContent = t("exit");
      if (exit.title !== t("exitTitle")) exit.title = t("exitTitle");
    }
  }

  function isTestAction(element) {
    const action = [element.dataset?.action, element.dataset?.managerAction, element.id, element.name].filter(Boolean).join(" ").toLowerCase();
    const label = (element.textContent || "").trim().toLocaleLowerCase("tr-TR");
    const actionHit = /(reroll|test-result|force-result|debug|simulate-goal|reset-engine|developer)/.test(action);
    const labelHit = /(yeniden kura|test sonucu|sonucu zorla|debug|geliştirici)/.test(label);
    return actionHit || labelHit || element.matches?.('[data-test-only="true"],.test-mode-only,.manager-test-control');
  }

  function enforceModeLocks(root = document) {
    const official = getSettings().mode === "official";
    document.body.classList.toggle("v434-official", official);
    document.body.classList.toggle("v434-test", !official && getSettings().mode === "test");
    root.querySelectorAll?.("button,a,input,select").forEach(element => {
      const shouldLock = official && isTestAction(element);
      const lockedByShell = element.dataset.v434Locked === "true";
      element.classList.toggle("v434-official-lock", shouldLock);
      if (shouldLock) {
        element.dataset.v434Locked = "true";
        element.setAttribute("aria-disabled", "true");
        if ("disabled" in element) element.disabled = true;
      } else if (lockedByShell) {
        delete element.dataset.v434Locked;
        element.removeAttribute("aria-disabled");
        if ("disabled" in element) element.disabled = false;
      }
    });
  }

  function translateString(input) {
    const raw = String(input ?? "");
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    const clean = raw.trim();
    if (!clean) return raw;
    if (exact.has(clean)) return `${leading}${exact.get(clean)}${trailing}`;
    if (paragraphTranslations.has(clean)) return `${leading}${paragraphTranslations.get(clean)}${trailing}`;
    for (const [pattern, replacement] of patterns) {
      if (pattern.test(clean)) return `${leading}${clean.replace(pattern, replacement)}${trailing}`;
    }
    return raw;
  }

  function translateTextNode(node, language) {
    if (!node?.parentElement || ["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","CODE","PRE"].includes(node.parentElement.tagName)) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    if (language === "tr") {
      if (node.nodeValue !== source) node.nodeValue = source;
      return;
    }
    const translated = translateString(source);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }

  function translateAttributes(element, language) {
    const names = ["aria-label", "title", "placeholder", "data-label"];
    if (!originalAttributes.has(element)) originalAttributes.set(element, {});
    const store = originalAttributes.get(element);
    names.forEach(name => {
      if (!element.hasAttribute(name)) return;
      if (!(name in store)) store[name] = element.getAttribute(name);
      const source = store[name];
      const next = language === "tr" ? source : translateString(source);
      if (element.getAttribute(name) !== next) element.setAttribute(name, next);
    });
  }

  function translateRoot(root, language) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) { translateTextNode(root, language); return; }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root.nodeType === Node.ELEMENT_NODE) translateAttributes(root, language);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
      else if (node.nodeType === Node.ELEMENT_NODE) translateAttributes(node, language);
      node = walker.nextNode();
    }
  }

  function invokeNativeLanguage(language) {
    const existing = document.querySelector(`[data-language-option="${language}"]`);
    if (existing && !existing.classList.contains("active")) {
      try { existing.click(); } catch (_) {}
    }
    const candidates = [window.FIFA_LANGUAGE, window.FIFA_I18N, window.LanguageManager];
    candidates.forEach(api => {
      try { api?.setLanguage?.(language); } catch (_) {}
    });
    try { window.setLanguage?.(language); } catch (_) {}
  }

  function setLanguage(language, { native = true } = {}) {
    const lang = language === "en" ? "en" : "tr";
    saveSettings({ language: lang });
    document.documentElement.lang = lang;
    document.documentElement.dataset.language = lang;
    if (native) invokeNativeLanguage(lang);
    renderGate();
    updateModeUI();
    translateDocument();
    document.dispatchEvent(new CustomEvent("fifa:languagechange", { detail: { language: lang, source: "v43.4" } }));
  }

  function translateDocument() {
    if (translationBusy) return;
    translationBusy = true;
    const language = getSettings().language;
    try {
      translateRoot(document.body, language);
      document.title = language === "en" ? "FIFA Tournament Hub — Official Career" : "FIFA Turnuva Merkezi — Resmî Kariyer";
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.content = language === "en"
        ? "FIFA Tournament Hub with Official Career Mode, Live Motion Engine 4.0, tactical intelligence and complete English interface support."
        : "FIFA Turnuva Merkezi; Resmî Kariyer Modu, Live Motion Engine 4.0, taktik zekâ ve tam İngilizce arayüz desteği.";
    } finally {
      translationBusy = false;
    }
  }

  function coverageAudit() {
    const issues = [];
    const turkishChars = /[çğıöşüÇĞİÖŞÜ]/;
    const turkishWords = /\b(ve|için|ile|henüz|maç|oyuncu|takım|puan|kura|sezon|devre|kaydet|başlat|bekleniyor|tamamlandı|güncellendi)\b/i;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script,style,noscript,textarea,code,pre,#v434GameGate")) continue;
      const value = node.nodeValue.trim();
      if (value.length > 2 && (turkishChars.test(value) || turkishWords.test(value))) issues.push(value);
    }
    const unique = [...new Set(issues)].slice(0, 20);
    document.querySelector(".v434-en-audit")?.remove();
    if (unique.length && getSettings().language === "en") {
      console.warn(`[V43.4] ${t("enAudit")}:`, unique);
    }
    return { count: issues.length, samples: unique };
  }

  function attachObserver() {
    observer?.disconnect();
    observer = new MutationObserver(mutations => {
      if (translationBusy) return;
      const language = getSettings().language;
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => translateRoot(node, language));
        if (mutation.type === "characterData") translateTextNode(mutation.target, language);
      });
      injectPersistentControls();
      enforceModeLocks();
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function handleClick(event) {
    const language = event.target.closest?.("[data-v434-language]")?.dataset.v434Language;
    if (language) { setLanguage(language); return; }
    const mode = event.target.closest?.("[data-v434-enter]")?.dataset.v434Enter;
    if (mode) { enterMode(mode); return; }
    if (event.target.closest?.("[data-v434-exit],[data-v434-open-gate]")) {
      showGate();
      toast(t("savedToast"), "success");
      return;
    }
    if (getSettings().mode === "official") {
      const actionable = event.target.closest?.("button,a,input,select");
      if (actionable && isTestAction(actionable)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast(getSettings().language === "en" ? "This control is disabled in Official Career Mode." : "Bu kontrol Resmî Kariyer Modunda devre dışıdır.", "error");
      }
    }
  }

  function boot() {
    const settings = getSettings();
    setLanguage(settings.language, { native: true });
    renderGate();
    injectPersistentControls();
    attachObserver();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("fifa-language-changed", event => setLanguage(event.detail?.language || event.detail || "tr", { native: false }));
    window.addEventListener("storage", event => {
      if (event.key === SETTINGS_KEY) {
        renderGate(); updateModeUI(); translateDocument(); enforceModeLocks();
      }
    });
    if (settings.mode === "official" || settings.mode === "test") {
      dismissLegacyShutdown();
      document.body.classList.toggle("v434-official", settings.mode === "official");
      document.body.classList.toggle("v434-test", settings.mode === "test");
      hideGate();
      enforceModeLocks();
    } else {
      showGate({ save: false });
    }
    window.FIFA_V43_4 = Object.freeze({
      version: VERSION,
      enterOfficial: () => enterMode("official"),
      enterTest: () => enterMode("test"),
      exitGame: () => showGate(),
      setLanguage,
      getSettings,
      auditEnglishCoverage: coverageAudit,
      restoreTestBaseline() {
        const payload = safeParse(sessionStorage.getItem(TEST_BASELINE_KEY), null);
        if (!payload?.state) return false;
        try {
          localStorage.setItem(MAIN_STATE_KEY, JSON.stringify(payload.state));
          sessionStorage.removeItem(TEST_BASELINE_KEY);
          location.reload();
          return true;
        } catch (_) { return false; }
      }
    });
    setTimeout(() => { translateDocument(); injectPersistentControls(); enforceModeLocks(); }, 250);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
