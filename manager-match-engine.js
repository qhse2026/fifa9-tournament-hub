(() => {
  "use strict";

  const VERSION = "42.6.0";
  const TICK_MS = 850;
  const MAX_EVENTS = 180;
  const MAX_DECISIONS = 10;
  const MIN_DECISIONS = 5;
  const runtime = { timer: null, fixtureId: null, busy: false };

  const MOTIVATION_TALKS = [
    { id: "belief", label: "Kendinize İnanın", note: "Özgüven ve cesur başlangıç", tags: ["balanced", "underdog"] },
    { id: "intensity", label: "İlk Düdükten İtibaren Baskı", note: "Yüksek enerji, yüksek fizik maliyeti", tags: ["press", "favorite"] },
    { id: "calm", label: "Sakin Kalın, Planımıza Güvenin", note: "Kontrol ve karar kalitesi", tags: ["control", "favorite"] },
    { id: "prove", label: "Onlara Kim Olduğumuzu Gösterin", note: "Duygusal ve yüksek varyanslı", tags: ["attack", "underdog"] },
    { id: "pressure-off", label: "Baskı Yok, Oyunun Keyfini Çıkarın", note: "Rahatlık sağlayabilir veya odağı düşürebilir", tags: ["balanced"] }
  ];
  const FORMATIONS = ["4-3-3","4-2-3-1","4-4-2","3-5-2","3-4-3","5-3-2"];
  const ROLE_OPTIONS = ["Dengeli","Oyun Kurucu","Sahte Dokuz","Kanat İçeri Kat","Çizgi Oyuncusu","Box-to-Box","Ön Libero","Bindiren Bek","Geride Kalan Bek"];

  const room = () => window.FIFA_MANAGER_ROOM;
  const app = () => window.FIFA_APP_CONTEXT;
  const esc = value => app()?.escapeHTML
    ? app().escapeHTML(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round1 = value => Math.round(Number(value || 0) * 10) / 10;
  const now = () => new Date().toISOString();

  const PLAN_GROUPS = {
    mentality: [
      { id: "controlled", label: "Kontrollü", note: "Oyunu sakinleştir, boşluğu bekle", attack: -2, control: 8, defence: 4, fatigue: 0.7, risk: -5, tags: ["control"] },
      { id: "balanced", label: "Dengeli", note: "Hatlar arası dengeyi koru", attack: 2, control: 2, defence: 2, fatigue: 1, risk: 0, tags: ["balance"] },
      { id: "aggressive", label: "Agresif", note: "Rakibi sürekli geriye zorla", attack: 9, control: -1, defence: -5, fatigue: 1.5, risk: 8, tags: ["attack"] },
      { id: "counter", label: "Kontratak", note: "Alan bırak, geçiş anını cezalandır", attack: 4, control: -4, defence: 6, fatigue: 0.9, risk: 2, tags: ["counter"] },
      { id: "possession", label: "Topa Sahip Ol", note: "Tempo ve konum üstünlüğü kur", attack: 1, control: 10, defence: 1, fatigue: 1.1, risk: -2, tags: ["control", "patient"] }
    ],
    pressing: [
      { id: "low", label: "Derin Blok", note: "Alan daralt, arkayı koru", attack: -4, control: -4, defence: 10, fatigue: 0.65, risk: -5, tags: ["protect"] },
      { id: "mid", label: "Orta Blok", note: "Merkezde temas ve denge", attack: 0, control: 3, defence: 5, fatigue: 0.9, risk: -1, tags: ["balance"] },
      { id: "high", label: "Yüksek Pres", note: "Rakibi çıkışta boğ", attack: 6, control: 5, defence: -5, fatigue: 1.65, risk: 7, tags: ["press"] },
      { id: "counterpress", label: "Karşı Pres", note: "Top kaybında kısa ve sert baskı", attack: 5, control: 7, defence: -2, fatigue: 1.45, risk: 4, tags: ["press", "tempo"] }
    ],
    buildUp: [
      { id: "patient", label: "Sabırlı Kurulum", note: "Pas açılarını çoğalt", attack: 0, control: 8, defence: 2, fatigue: 1, risk: -3, tags: ["patient", "control"] },
      { id: "direct", label: "Direkt Oyun", note: "Az pasla son bölgeye git", attack: 7, control: -6, defence: -1, fatigue: 1.1, risk: 6, tags: ["direct"] },
      { id: "wings", label: "Kanatları Kullan", note: "Sahayı genişlet ve çizgiyi zorla", attack: 5, control: 1, defence: -1, fatigue: 1.15, risk: 2, tags: ["wide"] },
      { id: "central", label: "Merkezden Oyna", note: "Dar alanda kombinasyon ara", attack: 4, control: 5, defence: -2, fatigue: 1.1, risk: 3, tags: ["central"] },
      { id: "transition", label: "Hızlı Geçiş", note: "Top kazanır kazanmaz ileri çık", attack: 8, control: -4, defence: 1, fatigue: 1.25, risk: 6, tags: ["counter", "tempo"] }
    ],
    tempo: [
      { id: "low", label: "Düşük Tempo", note: "Maçı kontrol altında tut", attack: -3, control: 6, defence: 2, fatigue: 0.65, risk: -4, tags: ["control"] },
      { id: "normal", label: "Dengeli Tempo", note: "Duruma göre hızlan", attack: 1, control: 2, defence: 1, fatigue: 1, risk: 0, tags: ["balance"] },
      { id: "high", label: "Yüksek Tempo", note: "Rakibe düşünme süresi verme", attack: 7, control: 1, defence: -3, fatigue: 1.55, risk: 6, tags: ["tempo", "attack"] }
    ],
    risk: [
      { id: "safe", label: "Güvenli", note: "Top kaybını ve açık alanı azalt", attack: -4, control: 4, defence: 6, fatigue: 0.9, risk: -8, tags: ["protect"] },
      { id: "measured", label: "Ölçülü", note: "Fırsat oluştuğunda risk al", attack: 2, control: 2, defence: 1, fatigue: 1, risk: 0, tags: ["balance"] },
      { id: "bold", label: "Cesur", note: "Daha fazla oyuncuyla hücuma çık", attack: 9, control: -2, defence: -7, fatigue: 1.3, risk: 10, tags: ["attack"] }
    ]
  };

  const DECISION_FAMILIES = [
    {
      id: "momentum-against",
      title: "Momentum Rakibe Geçti",
      score: c => c.humanMomentum < -22 ? 70 + Math.abs(c.humanMomentum) : 0,
      prompt: c => `${c.minute}. dakikada rakip oyunun merkezini ele geçirdi. ${c.scoreText} Saha hâkimiyetini nasıl geri almaya çalışacaksın?`,
      options: [
        option("control-reset", "Topa sahip olarak ritmi kır", "Pas hızını düşür ve rakibin baskı serisini kes.", { momentum: 12, control: 10, attack: -2, defence: 2, fatigue: -1, duration: 13 }, ["control"]),
        option("press-shock", "Kısa süreli yüksek pres uygula", "Topu rakip yarı alanda geri kazanmayı dene.", { momentum: 15, control: 5, attack: 6, defence: -6, fatigue: -6, duration: 10 }, ["press"]),
        option("counter-trap", "Rakibi üzerine çekip kontraya çık", "Kontrolü bırak ama açık alanı hedefle.", { momentum: 8, control: -7, attack: 11, defence: 3, fatigue: -2, duration: 14 }, ["counter"]),
        option("hold-shape", "Dizilişi bozma", "Panik yapmadan savunma bütünlüğünü koru.", { momentum: 5, control: 1, attack: -3, defence: 9, fatigue: 1, duration: 12 }, ["protect"])
      ]
    },
    {
      id: "trailing",
      title: "Skoru Çevirme Zamanı",
      score: c => c.humanGoals < c.aiGoals && c.minute >= 43 ? 85 + c.minute / 2 : 0,
      prompt: c => `${c.minute}. dakika, ${c.scoreText}. Rakip skoru korumaya hazırlanıyor. Hangi risk profilini seçiyorsun?`,
      options: [
        option("wide-overload", "Bir kanatta sayısal üstünlük kur", "Savunmayı yana çekip ters koridoru aç.", { momentum: 10, attack: 10, control: 2, defence: -4, fatigue: -4, duration: 15 }, ["wide", "attack"]),
        option("central-surge", "Merkezde dikine oyna", "Daha az pasla ceza sahasına yaklaş.", { momentum: 8, attack: 12, control: -2, defence: -5, fatigue: -3, duration: 12 }, ["central", "direct"]),
        option("sustained-pressure", "Baskıyı kademeli artır", "Kontrolü kaybetmeden rakibi geriye it.", { momentum: 12, attack: 7, control: 7, defence: -2, fatigue: -5, duration: 18 }, ["control", "press"]),
        option("all-in", "Tam risk al", "Maçı eşitlemek için bütün hatları öne çıkar.", { momentum: 16, attack: 16, control: -5, defence: -12, fatigue: -8, duration: 11 }, ["attack", "tempo"])
      ]
    },
    {
      id: "leading-late",
      title: "Üstünlüğü Yönet",
      score: c => c.humanGoals > c.aiGoals && c.minute >= 66 ? 95 + c.minute : 0,
      prompt: c => `${c.minute}. dakikada öndesin. Rakip risk seviyesini artırıyor. Maçın son bölümünü nasıl yöneteceksin?`,
      options: [
        option("protect-box", "Ceza sahası çevresini kapat", "Merkezi daralt ve rakibi düşük kaliteli şutlara zorla.", { momentum: -2, attack: -7, control: 1, defence: 14, fatigue: -1, duration: 20 }, ["protect"]),
        option("keep-ball", "Topu sakla", "Rakibin hücum süresini azalt.", { momentum: 8, attack: -2, control: 13, defence: 4, fatigue: -2, duration: 17 }, ["control"]),
        option("second-goal", "İkinci golü ara", "Rakip açılırken boşlukları değerlendir.", { momentum: 11, attack: 12, control: -2, defence: -7, fatigue: -5, duration: 13 }, ["counter", "attack"]),
        option("mid-block", "Orta blokta dengede kal", "Ne tamamen çekil ne de kontrolsüz öne çık.", { momentum: 4, attack: 1, control: 5, defence: 8, fatigue: 0, duration: 18 }, ["balance"])
      ]
    },
    {
      id: "fatigue",
      title: "Kondisyon Alarmı",
      score: c => c.humanFatigue < 67 && c.minute > 45 ? 90 + (67 - c.humanFatigue) * 3 : 0,
      prompt: c => `Takımın fizik seviyesi %${Math.round(c.humanFatigue)}'e düştü. Mevcut plan aynı yoğunlukta sürdürülemeyebilir.`,
      options: [
        option("lower-tempo", "Tempoyu düşür", "Enerjiyi son bölüme sakla.", { momentum: -3, attack: -4, control: 9, defence: 4, fatigue: 6, duration: 16 }, ["control"]),
        option("compact", "Hatları birbirine yaklaştır", "Koşu mesafesini azalt ve merkezi kapat.", { momentum: 1, attack: -5, control: 5, defence: 11, fatigue: 4, duration: 17 }, ["protect"]),
        option("one-final-push", "Kısa bir son baskı yap", "Kondisyon bitmeden maçı değiştirmeye çalış.", { momentum: 14, attack: 13, control: 2, defence: -8, fatigue: -10, duration: 9 }, ["press", "attack"]),
        option("counter-only", "Sadece geçiş anlarını kullan", "Koşu sayısını azalt, fırsat kalitesini yükselt.", { momentum: 5, attack: 8, control: -5, defence: 6, fatigue: 2, duration: 15 }, ["counter"])
      ]
    },
    {
      id: "opponent-high-press",
      title: "Rakip Çıkışı Kilitledi",
      score: c => c.aiStyle.pressing > 63 && c.minute < 68 ? 70 + c.aiStyle.pressing : 0,
      prompt: c => `Rakip önde ve yoğun basıyor. İlk pas hattında kayıplar artmaya başladı. Baskıyı nasıl aşacaksın?`,
      options: [
        option("play-through", "Kısa pasla presin içinden çık", "Teknik kaliteye güven ve merkezi kullan.", { momentum: 10, attack: 7, control: 10, defence: -5, fatigue: -2, duration: 13 }, ["control", "central"]),
        option("go-long", "Direkt uzun oyna", "İlk baskı hattını tek pasla geç.", { momentum: 5, attack: 10, control: -8, defence: 1, fatigue: 0, duration: 12 }, ["direct"]),
        option("switch-wide", "Oyunu ters kanada çevir", "Pres yoğunluğunun uzağında alan bul.", { momentum: 9, attack: 8, control: 5, defence: -1, fatigue: -2, duration: 14 }, ["wide"]),
        option("invite-counter", "Rakibi çekip boşluğa çık", "Daha riskli ama daha büyük alan yaratır.", { momentum: 8, attack: 12, control: -6, defence: -4, fatigue: -3, duration: 11 }, ["counter"])
      ]
    },
    {
      id: "wide-threat",
      title: "Kanat Koridoru Tehdit Altında",
      score: c => c.aiStyle.width > 62 && c.aiThreat > 45 ? 72 + c.aiStyle.width : 0,
      prompt: c => `Rakip genişliği iyi kullanıyor ve ${c.dangerSide} koridorunda tekrar tekrar üstünlük kuruyor.`,
      options: [
        option("double-wide", "Kanatta ikili sıkıştırma yap", "Çizgiyi kapat ama merkezde alan bırakabilirsin.", { momentum: 7, attack: -3, control: 1, defence: 12, fatigue: -4, duration: 15 }, ["wide", "protect"]),
        option("narrow-box", "Ceza sahasını dar savun", "Ortaya izin ver ama içeride sayıyı artır.", { momentum: 2, attack: -4, control: 3, defence: 11, fatigue: -1, duration: 17 }, ["protect", "central"]),
        option("attack-the-space", "Boşalan kanada kontratak yap", "Rakibin ileri çıkan oyuncularını geriye koştur.", { momentum: 11, attack: 12, control: -5, defence: -4, fatigue: -3, duration: 13 }, ["counter", "wide"]),
        option("press-source", "Topu kanada taşıyan oyuncuya pres yap", "Servis kanalını daha başlamadan kes.", { momentum: 10, attack: 3, control: 6, defence: 5, fatigue: -6, duration: 11 }, ["press"])
      ]
    },
    {
      id: "central-threat",
      title: "Merkezde Sayısal Eksiklik",
      score: c => c.aiStyle.width < 42 && c.aiThreat > 42 ? 70 + (42 - c.aiStyle.width) * 2 : 0,
      prompt: c => `Rakip merkezde kısa kombinasyonlarla savunma çizgine yaklaşıyor. İkinci toplar da rakipte kalıyor.`,
      options: [
        option("screen-center", "Merkez önüne koruma koy", "Dikine pas kanalını kapat.", { momentum: 4, attack: -4, control: 5, defence: 13, fatigue: -2, duration: 16 }, ["central", "protect"]),
        option("press-midfield", "Orta sahada agresif bas", "Pas bağlantılarını daha erken boz.", { momentum: 11, attack: 4, control: 8, defence: 2, fatigue: -6, duration: 12 }, ["press", "central"]),
        option("force-wide", "Rakibi çizgiye yönlendir", "Merkezi kapat, ortaları savunmayı kabul et.", { momentum: 5, attack: 0, control: 4, defence: 9, fatigue: -1, duration: 15 }, ["wide", "protect"]),
        option("quick-outlet", "Top kazanıldığında hızlı çık", "Merkezdeki kalabalığı ters yönde cezalandır.", { momentum: 10, attack: 11, control: -4, defence: -2, fatigue: -2, duration: 12 }, ["counter"])
      ]
    },
    {
      id: "deadlock",
      title: "Maç Kilitlendi",
      score: c => c.humanGoals === c.aiGoals && c.minute >= 54 && Math.abs(c.humanMomentum) < 25 ? 75 + c.minute : 0,
      prompt: c => `${c.minute}. dakika, skor dengede ve iki takım da net üstünlük kuramıyor. Kilidi hangi yöntemle açacaksın?`,
      options: [
        option("increase-width", "Sahayı daha geniş kullan", "Savunma blokları arasındaki mesafeyi artır.", { momentum: 7, attack: 8, control: 2, defence: -2, fatigue: -2, duration: 15 }, ["wide"]),
        option("tempo-burst", "Tempolu beş dakikalık bölüm oyna", "Rakibin yerleşmeden karar vermesini zorla.", { momentum: 12, attack: 10, control: 1, defence: -4, fatigue: -6, duration: 9 }, ["tempo"]),
        option("patient-probe", "Sabırlı biçimde zayıf noktayı ara", "Risk almadan pozisyon kalitesini artır.", { momentum: 5, attack: 3, control: 12, defence: 3, fatigue: -1, duration: 18 }, ["patient", "control"]),
        option("direct-challenge", "Direkt oyuna dön", "İkinci topları ve fizik mücadeleyi hedefle.", { momentum: 8, attack: 11, control: -7, defence: -2, fatigue: -2, duration: 12 }, ["direct"])
      ]
    },
    {
      id: "strength-underdog",
      title: "Güç Farkını Yönet",
      score: c => c.teamOverallDiff <= -4 && c.minute < 55 ? 80 + Math.abs(c.teamOverallDiff) * 4 : 0,
      prompt: c => `Kurada çıkan rakip takım kâğıt üzerinde ${Math.abs(c.teamOverallDiff)} puan daha güçlü. Maçı hangi zemine çekmek istiyorsun?`,
      options: [
        option("slow-game", "Oyunu yavaşlat", "Maçın olay sayısını ve açık alanı azalt.", { momentum: 3, attack: -5, control: 8, defence: 9, fatigue: 2, duration: 20 }, ["control", "protect"]),
        option("chaos", "Maçı kaosa çevir", "Kalite farkını yüksek varyansla dengele.", { momentum: 10, attack: 13, control: -10, defence: -8, fatigue: -5, duration: 14 }, ["tempo", "attack"]),
        option("counter-focus", "Savunma ve kontratak", "Rakibin ileri çıkmasını bekle.", { momentum: 5, attack: 9, control: -5, defence: 10, fatigue: 0, duration: 18 }, ["counter", "protect"]),
        option("press-weak-link", "Rakibin zayıf birimini hedefle", "Takımın en güçlü yönünü tek bölgeye yükle.", { momentum: 9, attack: 9, control: 4, defence: -2, fatigue: -4, duration: 15 }, ["press"])
      ]
    },
    {
      id: "strength-favorite",
      title: "Favori Baskısı",
      score: c => c.teamOverallDiff >= 4 && c.minute > 24 && c.humanGoals <= c.aiGoals ? 78 + c.teamOverallDiff * 3 : 0,
      prompt: c => `Takım kaliten daha yüksek fakat skor üstünlüğü gelmedi. Sabırsızlaşmadan avantajı nasıl kullanacaksın?`,
      options: [
        option("sustain-control", "Kontrolü sürdür", "Kalite farkının zamanla sonuç üretmesini bekle.", { momentum: 7, attack: 5, control: 12, defence: 3, fatigue: -2, duration: 18 }, ["control", "patient"]),
        option("increase-risk", "Risk seviyesini yükselt", "Daha çok oyuncuyu son bölgeye gönder.", { momentum: 11, attack: 13, control: -2, defence: -8, fatigue: -5, duration: 13 }, ["attack"]),
        option("target-weak-unit", "Rakibin zayıf hattını tekrar tekrar hedefle", "Tek yönlü ama yoğun baskı kur.", { momentum: 9, attack: 11, control: 2, defence: -3, fatigue: -3, duration: 15 }, ["direct"]),
        option("counterpress", "Top kaybında karşı pres", "Rakibin nefes almasını engelle.", { momentum: 12, attack: 8, control: 8, defence: -4, fatigue: -7, duration: 12 }, ["press"])
      ]
    },
    {
      id: "momentum-with",
      title: "Rakip Sallanıyor",
      score: c => c.humanMomentum > 28 && c.minute > 20 ? 60 + c.humanMomentum : 0,
      prompt: c => `Momentum belirgin biçimde sende. Rakip savunma yerleşimini kaybetmeye başladı. Bu dalgayı nasıl kullanacaksın?`,
      options: [
        option("finish-now", "Baskıyı artır ve golü şimdi ara", "Kısa süreli maksimum hücum yoğunluğu.", { momentum: 13, attack: 14, control: -2, defence: -8, fatigue: -6, duration: 10 }, ["attack", "tempo"]),
        option("pin-back", "Rakibi kendi sahasına sabitle", "Kontrolü ve ikinci topları koru.", { momentum: 10, attack: 8, control: 10, defence: 1, fatigue: -4, duration: 16 }, ["press", "control"]),
        option("change-side", "Hücum yönünü değiştir", "Rakibin yoğunlaştığı bölgenin tersini kullan.", { momentum: 8, attack: 9, control: 4, defence: -1, fatigue: -2, duration: 13 }, ["wide"]),
        option("manage-energy", "Dalgayı kontrollü sürdür", "Momentum sende kalırken kondisyonu koru.", { momentum: 7, attack: 5, control: 8, defence: 3, fatigue: 2, duration: 15 }, ["control"])
      ]
    },
    {
      id: "final-ten",
      title: "Son On Dakika",
      score: c => c.minute >= 80 ? 150 + c.minute : 0,
      prompt: c => `${c.minute}. dakika, ${c.scoreText}. Artık her kararın maç sonucuna doğrudan etkisi var. Son planın nedir?`,
      options: [
        option("protect-result", "Mevcut sonucu koru", "Risk ve alanı minimuma indir.", { momentum: -2, attack: -9, control: 5, defence: 16, fatigue: 1, duration: 12 }, ["protect"]),
        option("balanced-finish", "Dengeli kal", "Rakibin hamlesine göre tepki ver.", { momentum: 4, attack: 3, control: 5, defence: 5, fatigue: -1, duration: 12 }, ["balance"]),
        option("late-winner", "Galibiyet golünü ara", "Son bölümde hücum sayısını artır.", { momentum: 12, attack: 15, control: -3, defence: -10, fatigue: -8, duration: 12 }, ["attack"]),
        option("counter-last", "Rakibin son riskini kontrayla cezalandır", "Topu bırak ama en büyük boşluğu hedefle.", { momentum: 8, attack: 13, control: -7, defence: 5, fatigue: -3, duration: 12 }, ["counter"])
      ]
    },
    {
      id: "after-concede",
      title: "Golün Ardından",
      score: c => c.lastAgainstGoalAgo <= 4 ? 180 : 0,
      prompt: c => `Golü yeni yedin. Rakip enerji kazandı ve oyun yeniden başladı. İlk tepkin ne olacak?`,
      options: [
        option("instant-response", "Hemen cevap vermeye çalış", "Başlama vuruşuyla öne yüklen.", { momentum: 15, attack: 13, control: -3, defence: -8, fatigue: -5, duration: 9 }, ["attack", "tempo"]),
        option("reset-emotion", "Önce oyunu sakinleştir", "İkinci bir darbe yemeden dengeyi kur.", { momentum: 8, attack: -2, control: 11, defence: 7, fatigue: 1, duration: 13 }, ["control"]),
        option("change-route", "Hücum yönünü değiştir", "Rakibin son savunma alışkanlığını boz.", { momentum: 9, attack: 9, control: 3, defence: -2, fatigue: -2, duration: 12 }, ["wide"]),
        option("press-kickoff", "Başlangıçta pres tuzağı kur", "Rakibin rahat çıkmasını engelle.", { momentum: 13, attack: 8, control: 7, defence: -4, fatigue: -6, duration: 8 }, ["press"])
      ]
    },
    {
      id: "after-score",
      title: "Gol Sonrası Kontrol",
      score: c => c.lastHumanGoalAgo <= 4 ? 170 : 0,
      prompt: c => `Golü buldun. Rakibin ilk tepkisi agresif olabilir. Bir sonraki beş dakikayı nasıl oynayacaksın?`,
      options: [
        option("hunt-second", "İkinci golü hemen ara", "Rakip dağınıkken baskıyı sürdür.", { momentum: 14, attack: 13, control: 0, defence: -7, fatigue: -5, duration: 9 }, ["attack"]),
        option("cool-match", "Maçı soğut", "Rakibin duygusal tepkisini boşa çıkar.", { momentum: 8, attack: -4, control: 13, defence: 6, fatigue: 2, duration: 13 }, ["control"]),
        option("mid-block", "Orta blokta karşıla", "Rakibin öne çıkmasını bekle.", { momentum: 6, attack: 5, control: 0, defence: 9, fatigue: 0, duration: 14 }, ["counter", "protect"]),
        option("same-plan", "Planı değiştirme", "İşe yarayan düzeni koru.", { momentum: 6, attack: 5, control: 5, defence: 4, fatigue: -1, duration: 12 }, ["balance"])
      ]
    },
    {
      id: "control-loss",
      title: "Orta Saha Kontrolü Kayboluyor",
      score: c => c.aiPossession > 58 && c.minute > 25 ? 74 + c.aiPossession : 0,
      prompt: c => `Rakip topa sahip olma oranını %${Math.round(c.aiPossession)} seviyesine çıkardı. Maç senin istediğin ritimden uzaklaşıyor.`,
      options: [
        option("extra-control", "Pas güvenliğini artır", "Top kayıplarını azalt ve ritmi geri al.", { momentum: 8, attack: -1, control: 13, defence: 4, fatigue: -1, duration: 16 }, ["control"]),
        option("press-mid", "Orta sahada baskıyı artır", "Rakibin rahat pas serisini kes.", { momentum: 12, attack: 4, control: 8, defence: 1, fatigue: -6, duration: 12 }, ["press"]),
        option("direct-bypass", "Orta sahayı hızlı geç", "Topa daha az sahip ol ama daha dikine oyna.", { momentum: 7, attack: 11, control: -8, defence: -1, fatigue: -2, duration: 13 }, ["direct"]),
        option("deep-counter", "Kontrolü bırak, alanı savun", "Rakibin pas üstünlüğünü tehlikesiz bölgelerde kabul et.", { momentum: 2, attack: 7, control: -8, defence: 11, fatigue: 2, duration: 16 }, ["counter", "protect"])
      ]
    },
    {
      id: "generic-read",
      title: "Taktik Okuma Anı",
      score: c => 35 + c.minute / 3,
      prompt: c => `${c.minute}. dakikada maç yeni bir dengeye oturdu. Rakibin gerçek oyun tarzı hâlâ tam çözülmüş değil. Hangi sinyali test edeceksin?`,
      options: [
        option("test-press", "Pres altında nasıl çıktığını test et", "Kısa süreli ön alan baskısı uygula.", { momentum: 8, attack: 5, control: 5, defence: -3, fatigue: -4, duration: 10 }, ["press"]),
        option("test-width", "Savunma genişliğini test et", "Oyunu hızlıca iki kanada taşı.", { momentum: 6, attack: 7, control: 3, defence: -1, fatigue: -2, duration: 11 }, ["wide"]),
        option("test-center", "Merkez direncini test et", "Dar alanda dikine pas kombinasyonu dene.", { momentum: 6, attack: 8, control: 5, defence: -2, fatigue: -2, duration: 11 }, ["central"]),
        option("observe", "Düzeni koruyup gözlemle", "Rakibin bir sonraki hamlesini gör.", { momentum: 3, attack: 0, control: 7, defence: 5, fatigue: 2, duration: 12 }, ["control"])
      ]
    }
  ];

  function option(id, label, note, effects, tags) {
    return { id, label, note, effects, tags };
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < String(value).length; index += 1) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function random(engine) {
    let t = engine.rngState += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function randomRange(engine, min, max) {
    return min + (max - min) * random(engine);
  }

  function normal(engine) {
    const u = Math.max(1e-9, random(engine));
    const v = Math.max(1e-9, random(engine));
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function selectedPlan(formData) {
    const plan = {};
    Object.keys(PLAN_GROUPS).forEach(group => {
      const id = String(formData.get(group) || "");
      plan[group] = PLAN_GROUPS[group].find(item => item.id === id)?.id || PLAN_GROUPS[group][0].id;
    });
    return plan;
  }

  function planItem(group, id) {
    return PLAN_GROUPS[group].find(item => item.id === id) || PLAN_GROUPS[group][0];
  }

  function aggregatePlan(plan) {
    const aggregate = { attack: 0, control: 0, defence: 0, fatigue: 1, risk: 0, tags: [] };
    Object.entries(plan || {}).filter(([group]) => Object.prototype.hasOwnProperty.call(PLAN_GROUPS, group)).forEach(([group, id]) => {
      const item = planItem(group, id);
      aggregate.attack += item.attack || 0;
      aggregate.control += item.control || 0;
      aggregate.defence += item.defence || 0;
      aggregate.risk += item.risk || 0;
      aggregate.fatigue *= item.fatigue || 1;
      aggregate.tags.push(...(item.tags || []));
    });
    return aggregate;
  }

  function aiPlanFromStyle(style = {}) {
    return {
      mentality: Number(style.risk || 50) > 66 ? "aggressive" : Number(style.risk || 50) < 37 ? "counter" : Number(style.control || 50) > 62 ? "possession" : "balanced",
      pressing: Number(style.pressing || 50) > 68 ? "high" : Number(style.pressing || 50) > 55 ? "counterpress" : Number(style.pressing || 50) < 35 ? "low" : "mid",
      buildUp: Number(style.directness || 50) > 65 ? "direct" : Number(style.width || 50) > 62 ? "wings" : Number(style.width || 50) < 40 ? "central" : Number(style.tempo || 50) > 64 ? "transition" : "patient",
      tempo: Number(style.tempo || 50) > 66 ? "high" : Number(style.tempo || 50) < 38 ? "low" : "normal",
      risk: Number(style.risk || 50) > 68 ? "bold" : Number(style.risk || 50) < 38 ? "safe" : "measured"
    };
  }

  function matchTeam(fixture, actorId) {
    return room()?.getTeamForActor?.(fixture, actorId) || null;
  }

  function actor(career, id) {
    return room()?.getActor?.(career, id) || career.actors.find(item => item.id === id);
  }

  function getSides(career, fixture) {
    const homeActor = actor(career, fixture.homeId);
    const awayActor = actor(career, fixture.awayId);
    const humanIsHome = fixture.homeId === career.humanActorId;
    return {
      homeActor,
      awayActor,
      humanActor: humanIsHome ? homeActor : awayActor,
      aiActor: humanIsHome ? awayActor : homeActor,
      humanIsHome,
      homeTeam: matchTeam(fixture, fixture.homeId),
      awayTeam: matchTeam(fixture, fixture.awayId),
      humanTeam: matchTeam(fixture, career.humanActorId),
      aiTeam: matchTeam(fixture, humanIsHome ? fixture.awayId : fixture.homeId)
    };
  }

  function effectiveBase(team, actorRow, planAggregate) {
    const powerFactor = clamp((Number(actorRow?.power || 1000) - 1000) / 55, -5, 16);
    return {
      attack: Number(team?.attack || 75) + powerFactor + planAggregate.attack,
      control: Number(team?.midfield || 75) + powerFactor * 0.85 + planAggregate.control,
      defence: Number(team?.defence || 75) + powerFactor * 0.8 + planAggregate.defence,
      risk: clamp(50 + planAggregate.risk, 20, 85),
      fatigueRate: clamp(planAggregate.fatigue, 0.55, 2.4),
      chanceCreation: Number(team?.attributes?.chanceCreation || team?.attack || 75),
      pressResistance: Number(team?.attributes?.pressResistance || team?.midfield || 75),
      counterThreat: Number(team?.attributes?.counterThreat || team?.attack || 75),
      defensiveShape: Number(team?.attributes?.defensiveShape || team?.defence || 75),
      tempo: Number(team?.attributes?.tempo || 70),
      variance: Number(team?.attributes?.variance || 30)
    };
  }

  function resolveMotivation(engine, talkId, sides, plan) {
    const talk = MOTIVATION_TALKS.find(item => item.id === talkId) || MOTIVATION_TALKS[0];
    const overallDiff = Number(sides.humanTeam?.overall || 75) - Number(sides.aiTeam?.overall || 75);
    const planTags = aggregatePlan(plan).tags;
    let fit = 0;
    if (talk.tags.includes("underdog") && overallDiff < 0) fit += 0.08;
    if (talk.tags.includes("favorite") && overallDiff >= 0) fit += 0.06;
    if (talk.tags.some(tag => planTags.includes(tag))) fit += 0.07;
    const roll = random(engine);
    const positiveLimit = clamp(0.47 + fit, 0.38, 0.64);
    const neutralLimit = positiveLimit + 0.31;
    const outcome = roll < positiveLimit ? "positive" : roll < neutralLimit ? "neutral" : "negative";
    const strength = outcome === "positive" ? randomRange(engine, 5, 12) : outcome === "negative" ? -randomRange(engine, 4, 9) : randomRange(engine, -1.5, 1.5);
    return {
      talkId: talk.id, label: talk.label, outcome, strength: round1(strength),
      text: outcome === "positive" ? "Konuşma takımı ateşledi; başlangıç enerjisi yükseldi." : outcome === "negative" ? "Konuşma oyuncularda baskı yarattı; başlangıç planı ters tepebilir." : "Takım konuşmayı dinledi ancak belirgin bir psikolojik değişim oluşmadı."
    };
  }

  function planSignature(plan={}) {
    const parts=[plan.mentality,plan.buildUp,plan.pressing,plan.tempo,plan.risk].filter(Boolean);
    return parts.length?parts.join(" · "):"balanced";
  }

  function counterPlanFromMemory(basePlan, memory={}) {
    const plan={...basePlan};
    const seen=Object.entries(memory.plans||{}).sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
    if (/aggressive|high|bold/i.test(seen)) { plan.mentality="counter"; plan.pressing="mid"; plan.risk="measured"; plan.buildUp="transition"; }
    else if (/controlled|patient|safe/i.test(seen)) { plan.mentality="aggressive"; plan.pressing="high"; plan.tempo="high"; }
    else if (/wings/i.test(seen)) { plan.buildUp="central"; plan.pressing="counterpress"; }
    else if (/central/i.test(seen)) { plan.buildUp="wings"; plan.pressing="high"; }
    return plan;
  }

  function initializeMatch(career, fixture, plan, motivationId) {
    const sides = getSides(career, fixture);
    if (!sides.homeTeam || !sides.awayTeam) throw new Error("Maç başlamadan önce takım kurası tamamlanmalıdır.");
    const aiStyle = sides.aiActor.styleSeed || {};
    const aiMemory=sides.aiActor.managerMemory||{};
    const aiPlan = counterPlanFromMemory(aiPlanFromStyle(aiStyle),aiMemory);
    const seed = hashString(`${fixture.id}|${fixture.teamDraw?.id || "draw"}|${Date.now()}`);
    fixture.status = "in-progress";
    fixture.matchPlan = plan;
    fixture.decisions = [];
    fixture.matchEngine = {
      version: VERSION,
      status: "live",
      seed,
      rngState: seed,
      startedAt: now(),
      finishedAt: null,
      minute: 0,
      scoreHome: 0,
      scoreAway: 0,
      zone: 0,
      momentum: 0,
      possessionHome: 50,
      homeFatigue: 100,
      awayFatigue: 100,
      homeThreat: 0,
      awayThreat: 0,
      homeModifiers: [],
      awayModifiers: [],
      userPlan: plan,
      aiPlan,
      aiStyle,
      aiMemoryUsed: Number(aiMemory.meetings||0)>0,
      aiMemorySnapshot: { meetings:Number(aiMemory.meetings||0), lastPlan:aiMemory.lastPlan||null, confidence:Number(aiMemory.confidence||50) },
      aiAdaptations: 0,
      nextDecisionMinute: 9 + Math.floor((seed % 7)),
      decisionCooldownUntil: 0,
      decisionCount: 0,
      currentDecision: null,
      lastGoal: null,
      lastChanceSide: null,
      lastChanceMinute: -5,
      matchVolatility: clamp(0.82 + random(enginePlaceholder(seed)) * 0.52, 0.82, 1.34),
      broadcastEvent: null,
      pulse: [],
      possessionChains: [],
      shotMap: [],
      zoneEntries: { home:{left:0,centre:0,right:0},away:{left:0,centre:0,right:0} },
      tacticalSnapshots: [],
      events: [{ minute: 0, type: "kickoff", side: "neutral", text: "Hakem düdüğü çaldı. Taktik planlar sahada." }],
      stats: {
        home: { shots: 0, onTarget: 0, offTarget: 0, blocked: 0, xg: 0, attacks: 0, dangerous: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, passAccuracy: 0, penalties: 0, penaltiesScored: 0, penaltiesMissed: 0 },
        away: { shots: 0, onTarget: 0, offTarget: 0, blocked: 0, xg: 0, attacks: 0, dangerous: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, passAccuracy: 0, penalties: 0, penaltiesScored: 0, penaltiesMissed: 0 }
      },
      report: null
    };
    fixture.matchEngine.motivation = resolveMotivation(fixture.matchEngine, motivationId, sides, plan);
    fixture.matchEngine.squads = { home: buildVirtualSquad(fixture.matchEngine, sides.homeTeam, plan.formation), away: buildVirtualSquad(fixture.matchEngine, sides.awayTeam, "4-3-3") };
    fixture.matchEngine.substitutions = [];
    const humanMods = sides.humanIsHome ? "homeModifiers" : "awayModifiers";
    const motivation = fixture.matchEngine.motivation;
    fixture.matchEngine[humanMods].push({ until: 22, attack: motivation.strength, control: motivation.strength * .55, defence: motivation.strength * .35, risk: motivation.outcome === "negative" ? 4 : 0, source: "motivation" });
    fixture.matchEngine.events.unshift({ minute: 0, type: `motivation-${motivation.outcome}`, side: sides.humanIsHome ? "home" : "away", text: `${motivation.label}: ${motivation.text}` });
    if (fixture.matchEngine.aiMemoryUsed) fixture.matchEngine.events.unshift({ minute:0,type:"intelligence",side:sides.humanIsHome?"away":"home",text:`Rakip teknik ekip önceki ${aiMemory.meetings} karşılaşmadan ürettiği karşı planla başladı.` });
    career.activeMatchFixtureId = fixture.id;
    career.status = "match-live";
    room()?.saveLocal?.();
    return fixture.matchEngine;
  }

  function enginePlaceholder(seed) { return { rngState: seed }; }

  function buildVirtualSquad(engine, team, formation) {
    const positions = ["GK","RB","CB","CB","LB","CDM","CM","CAM","RW","ST","LW","SUB","SUB","SUB","SUB","SUB"];
    return positions.map((position,index)=>({ id:`${team.id}-p${index+1}`, name:`${team.clubName.split(" ")[0]} ${index+1}`, position, rating:clamp(Number(team.overall||75)+Math.round(randomRange(engine,-4,4)),65,94), form:Math.round(randomRange(engine,45,85)), fatigue:100, status:index<11?"XI":"BENCH", formation }));
  }

  function modifierTotals(modifiers, minute) {
    const active = (modifiers || []).filter(item => item.until > minute);
    const totals = { attack: 0, control: 0, defence: 0, risk: 0 };
    active.forEach(item => {
      totals.attack += Number(item.attack || 0);
      totals.control += Number(item.control || 0);
      totals.defence += Number(item.defence || 0);
      totals.risk += Number(item.risk || 0);
    });
    return { active, totals };
  }

  function sideMetrics(career, fixture, side) {
    const engine = fixture.matchEngine;
    const sides = getSides(career, fixture);
    const isHome = side === "home";
    const actorRow = isHome ? sides.homeActor : sides.awayActor;
    const team = isHome ? sides.homeTeam : sides.awayTeam;
    const isHuman = actorRow.id === career.humanActorId;
    const plan = isHuman ? engine.userPlan : engine.aiPlan;
    const aggregate = aggregatePlan(plan);
    const base = effectiveBase(team, actorRow, aggregate);
    const fatigue = isHome ? engine.homeFatigue : engine.awayFatigue;
    const modsKey = isHome ? "homeModifiers" : "awayModifiers";
    const { active, totals } = modifierTotals(engine[modsKey], engine.minute);
    engine[modsKey] = active;
    const fatiguePenalty = Math.max(0, 75 - fatigue) * 0.22;
    const sideMomentum = isHome ? engine.momentum : -engine.momentum;
    return {
      ...base,
      attack: base.attack + totals.attack + sideMomentum * 0.06 - fatiguePenalty,
      control: base.control + totals.control + sideMomentum * 0.05 - fatiguePenalty * 0.75,
      defence: base.defence + totals.defence + sideMomentum * 0.03 - fatiguePenalty * 0.8,
      risk: clamp(base.risk + totals.risk, 15, 95),
      fatigue,
      team,
      actor: actorRow,
      isHuman,
      plan
    };
  }

  function addEvent(engine, event) {
    const row = { minute: Math.max(0, Math.round(engine.minute)), ...event };
    engine.events.unshift(row);
    engine.events = engine.events.slice(0, MAX_EVENTS);
    return row;
  }

  function setBroadcast(engine, type, side, title, subtitle) {
    engine.broadcastEvent = { id: `${type}-${engine.minute}-${Date.now()}`, minute: Math.round(engine.minute), type, side, title, subtitle };
    if (room()?.getActiveCareer?.()?.managerIdentity?.sound !== false) playAtmosphere(type);
  }

  function playAtmosphere(type){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=type.includes("goal")?523:type.includes("penalty")?330:type==="red"?180:260;g.gain.setValueAtTime(.045,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.32);o.start();o.stop(c.currentTime+.34);}catch(_){}}

  function setMomentum(engine, delta) {
    engine.momentum = clamp(engine.momentum + delta, -100, 100);
  }

  function buildPossessionChain(career, fixture, side) {
    const engine=fixture.matchEngine, attack=sideMetrics(career,fixture,side);
    const laneRoll=random(engine), lane=laneRoll<.31?"left":laneRoll<.68?"centre":"right";
    const build=attack.plan?.buildUp||"balanced";
    const steps=["Top kazanma",build==="direct"?"Dikey çıkış":build==="wings"?"Kanada aktarım":build==="central"?"Merkez bağlantısı":"Pas çıkışı"];
    if(random(engine)<clamp(.58+(attack.control-75)/130,.38,.82))steps.push("Rakip yarı alan");
    if(random(engine)<clamp(.43+(attack.chanceCreation-75)/130,.24,.72))steps.push("Kilit pas");
    const quality=clamp(36+steps.length*10+(attack.attack-75)*.8+randomRange(engine,-9,9),25,96);
    const chain={id:`chain-${engine.minute}-${engine.possessionChains.length+1}`,minute:Math.round(engine.minute),side,lane,buildUp:build,steps,quality:Math.round(quality),outcome:"progression"};
    engine.possessionChains.push(chain); engine.possessionChains=engine.possessionChains.slice(-80);
    engine.zoneEntries[side][lane]+=1;
    return chain;
  }

  function createChance(career, fixture, attackingSide, suppliedChain=null) {
    const engine = fixture.matchEngine;
    const defendingSide = attackingSide === "home" ? "away" : "home";
    const attack = sideMetrics(career, fixture, attackingSide);
    const defence = sideMetrics(career, fixture, defendingSide);
    const stats = engine.stats[attackingSide];
    const momentum = attackingSide === "home" ? engine.momentum : -engine.momentum;
    const chain=suppliedChain||buildPossessionChain(career,fixture,attackingSide);
    chain.outcome="shot";
    const rawXg = 0.075
      + (attack.attack - defence.defence) / 210
      + (attack.chanceCreation - 75) / 420
      + attack.risk / 900
      + momentum / 1300
      + (chain.quality-55)/650
      + (chain.steps.includes("Kilit pas") ? 0.035 : 0)
      + randomRange(engine, -0.035, 0.12);
    const xg = clamp(rawXg, 0.035, 0.48);
    const bigChance = xg >= 0.28;
    stats.shots += 1;
    stats.xg = round1(stats.xg + xg);
    stats.dangerous += bigChance ? 1 : 0;
    engine.lastChanceSide = attackingSide;
    const onTargetChance = clamp(0.34 + xg * 0.8 + (attack.attack - 75) / 220, 0.26, 0.78);
    const onTarget = random(engine) < onTargetChance;
    const blocked = !onTarget && random(engine) < 0.31;
    if (onTarget) stats.onTarget += 1;
    else if (blocked) stats.blocked += 1;
    else stats.offTarget += 1;
    if (random(engine) < xg * .42) stats.corners += 1;
    const finishFactor = clamp(0.72 + (attack.attack - defence.defence) / 180 + randomRange(engine, -0.08, 0.08), 0.48, 1.08);
    const conditionalFinishChance = clamp((xg * finishFactor) / Math.max(.26, onTargetChance), .06, .62);
    const goal = onTarget && random(engine) < conditionalFinishChance;
    engine.shotMap.push({minute:Math.round(engine.minute),side:attackingSide,lane:chain.lane,xg:round1(xg),onTarget,blocked,goal,chainId:chain.id});
    engine.shotMap=engine.shotMap.slice(-60);
    const attackingActor = attack.actor;
    if (goal) {
      if (attackingSide === "home") engine.scoreHome += 1;
      else engine.scoreAway += 1;
      engine.lastGoal = { side: attackingSide, minute: engine.minute };
      setMomentum(engine, attackingSide === "home" ? 22 : -22);
      engine.zone = attackingSide === "home" ? 0.25 : -0.25;
      addEvent(engine, { type: "goal", side: attackingSide, text: `GOL! ${attackingActor.clubName} baskıyı skora çevirdi.` });
      setBroadcast(engine, "goal", attackingSide, "GOOOL!", `${attackingActor.clubName} · ${Math.round(engine.minute)}'`);
      chain.outcome="goal";
      return;
    }
    const narratives = bigChance
      ? ["Net fırsat! Son vuruş kaleyi bulmadı.", "Savunma son anda araya girdi.", "Kaleci büyük bir kurtarış yaptı."]
      : onTarget
        ? ["Şut kalecide kaldı.", "Kaleci kontrollü biçimde kurtardı.", "Zor açıdan gelen şut çıkarıldı."]
        : ["Şut savunmadan döndü.", "Son pasın şiddeti ayarlanamadı.", "Atak tehlikeli bölgeye ulaşsa da sonuç çıkmadı."];
    addEvent(engine, { type: bigChance ? "big-chance" : "chance", side: attackingSide, text: narratives[Math.floor(random(engine) * narratives.length)] });
    setMomentum(engine, attackingSide === "home" ? (bigChance ? 7 : 3) : (bigChance ? -7 : -3));
    engine.zone = attackingSide === "home" ? -0.15 : 0.15;
  }

  function createPenalty(career, fixture, attackingSide) {
    const engine = fixture.matchEngine;
    const stats = engine.stats[attackingSide];
    const attack = sideMetrics(career, fixture, attackingSide);
    stats.penalties += 1;
    stats.shots += 1;
    stats.xg = round1(stats.xg + .76);
    addEvent(engine, { type: "penalty", side: attackingSide, text: `PENALTI! ${attack.actor.clubName} için kritik karar.` });
    const scored = random(engine) < clamp(.73 + (attack.attack - 75) / 240, .62, .86);
    if (scored) {
      stats.penaltiesScored += 1;
      stats.onTarget += 1;
      if (attackingSide === "home") engine.scoreHome += 1; else engine.scoreAway += 1;
      engine.lastGoal = { side: attackingSide, minute: engine.minute, penalty: true };
      setMomentum(engine, attackingSide === "home" ? 20 : -20);
      addEvent(engine, { type: "penalty-goal", side: attackingSide, text: `PENALTI GOLÜ! ${attack.actor.clubName} hata yapmadı.` });
      setBroadcast(engine, "penalty-goal", attackingSide, "PENALTI GOLÜ", `${attack.actor.clubName} · ${Math.round(engine.minute)}'`);
    } else {
      stats.penaltiesMissed += 1;
      if (random(engine) < .72) stats.onTarget += 1; else stats.offTarget += 1;
      setMomentum(engine, attackingSide === "home" ? -11 : 11);
      addEvent(engine, { type: "penalty-miss", side: attackingSide, text: `PENALTI KAÇTI! Maçın kırılma anı olabilir.` });
      setBroadcast(engine, "penalty-miss", attackingSide, "PENALTI KAÇTI!", `${attack.actor.clubName} fırsatı değerlendiremedi`);
    }
    engine.lastChanceMinute = engine.minute;
  }

  function maybeAiAdapt(career, fixture) {
    const engine = fixture.matchEngine;
    if (engine.aiAdaptations >= 4) return;
    const sides = getSides(career, fixture);
    const humanGoals = sides.humanIsHome ? engine.scoreHome : engine.scoreAway;
    const aiGoals = sides.humanIsHome ? engine.scoreAway : engine.scoreHome;
    const style = engine.aiStyle || {};
    const adaptation = Number(style.adaptation || 50);
    const thresholds = [24, 45, 67, 80];
    if (engine.minute < thresholds[engine.aiAdaptations]) return;
    const urgent = aiGoals < humanGoals || (engine.minute >= 45 && Math.abs(engine.momentum) > 22);
    if (!urgent && random(engine) > 0.52 + adaptation / 180) return;
    const plan = { ...engine.aiPlan };
    if (aiGoals < humanGoals) {
      plan.mentality = Number(style.risk || 50) > 55 ? "aggressive" : "balanced";
      plan.tempo = "high";
      plan.risk = engine.minute > 72 ? "bold" : "measured";
      plan.buildUp = Number(style.directness || 50) > 52 ? "direct" : "transition";
    } else if (aiGoals > humanGoals) {
      plan.mentality = Number(style.control || 50) > 55 ? "controlled" : "counter";
      plan.pressing = Number(style.pressing || 50) > 65 ? "counterpress" : "mid";
      plan.risk = "safe";
    } else {
      plan.buildUp = Number(style.width || 50) > 55 ? "wings" : "central";
      plan.tempo = Number(style.tempo || 50) > 55 ? "high" : "normal";
    }
    engine.aiPlan = plan;
    engine.aiAdaptations += 1;
    addEvent(engine, { type: "adapt", side: sides.humanIsHome ? "away" : "home", text: "Rakip teknik alanından yeni talimatlar geldi. Oyun davranışı değişiyor." });
  }

  function contextFor(career, fixture) {
    const engine = fixture.matchEngine;
    const sides = getSides(career, fixture);
    const humanGoals = sides.humanIsHome ? engine.scoreHome : engine.scoreAway;
    const aiGoals = sides.humanIsHome ? engine.scoreAway : engine.scoreHome;
    const humanMomentum = sides.humanIsHome ? engine.momentum : -engine.momentum;
    const humanFatigue = sides.humanIsHome ? engine.homeFatigue : engine.awayFatigue;
    const aiThreat = sides.humanIsHome ? engine.awayThreat : engine.homeThreat;
    const aiPossession = sides.humanIsHome ? 100 - engine.possessionHome : engine.possessionHome;
    const humanOverall = Number(sides.humanTeam?.overall || 75);
    const aiOverall = Number(sides.aiTeam?.overall || 75);
    const lastGoal = engine.lastGoal;
    return {
      minute: Math.round(engine.minute),
      humanGoals,
      aiGoals,
      scoreText: `${humanGoals}-${aiGoals}`,
      humanMomentum,
      humanFatigue,
      aiThreat,
      aiPossession,
      aiStyle: engine.aiStyle || {},
      teamOverallDiff: humanOverall - aiOverall,
      lastAgainstGoalAgo: lastGoal && ((sides.humanIsHome && lastGoal.side === "away") || (!sides.humanIsHome && lastGoal.side === "home")) ? engine.minute - lastGoal.minute : 999,
      lastHumanGoalAgo: lastGoal && ((sides.humanIsHome && lastGoal.side === "home") || (!sides.humanIsHome && lastGoal.side === "away")) ? engine.minute - lastGoal.minute : 999,
      dangerSide: Number(engine.aiStyle?.width || 50) > 68 ? "sağ" : "sol"
    };
  }

  function chooseDecisionFamily(career, fixture) {
    const engine = fixture.matchEngine;
    const context = contextFor(career, fixture);
    const used = new Set((fixture.decisions || []).map(item => item.familyId));
    const ranked = DECISION_FAMILIES
      .map(family => ({ family, score: Number(family.score(context) || 0) + randomRange(engine, 0, 18) - (used.has(family.id) ? 38 : 0) }))
      .sort((a, b) => b.score - a.score);
    const selected = ranked[0]?.family || DECISION_FAMILIES[DECISION_FAMILIES.length - 1];
    return { selected, context };
  }

  function maybeDecision(career, fixture) {
    const engine = fixture.matchEngine;
    if (engine.status !== "live" || engine.currentDecision || engine.minute < engine.nextDecisionMinute || engine.minute < engine.decisionCooldownUntil) return false;
    const remaining = 90 - engine.minute;
    const mustReachMinimum = engine.decisionCount < MIN_DECISIONS && remaining < (MIN_DECISIONS - engine.decisionCount) * 18;
    if (!mustReachMinimum && engine.decisionCount >= MAX_DECISIONS) return false;
    const { selected, context } = chooseDecisionFamily(career, fixture);
    const decision = {
      id: `decision-${Date.now()}-${engine.decisionCount + 1}`,
      familyId: selected.id,
      title: selected.title,
      prompt: selected.prompt(context),
      minute: Math.round(engine.minute),
      context,
      options: selected.options,
      chosenId: null,
      quality: null,
      outcome: null
    };
    engine.currentDecision = decision;
    engine.status = "decision";
    engine.decisionCount += 1;
    engine.nextDecisionMinute = Math.min(87, engine.minute + 7 + Math.floor(randomRange(engine, 0, 7)));
    stopTimer();
    room()?.saveLocal?.();
    refreshMount(career, fixture);
    return true;
  }

  function tick(career, fixture) {
    const engine = fixture.matchEngine;
    if (!engine || engine.status !== "live") return;
    engine.minute = Math.min(90, engine.minute + 1);
    const home = sideMetrics(career, fixture, "home");
    const away = sideMetrics(career, fixture, "away");

    const homeFatigueCost = 0.08 * home.fatigueRate + Math.max(0, home.risk - 55) / 1600;
    const awayFatigueCost = 0.08 * away.fatigueRate + Math.max(0, away.risk - 55) / 1600;
    engine.homeFatigue = clamp(engine.homeFatigue - homeFatigueCost, 38, 100);
    engine.awayFatigue = clamp(engine.awayFatigue - awayFatigueCost, 38, 100);

    const controlDelta = (home.control - away.control) / 20 + engine.momentum / 65 + normal(engine) * 0.42;
    engine.zone = clamp(engine.zone + controlDelta * 0.16 + normal(engine) * 0.24, -2.4, 2.4);
    const possessionTarget = clamp(50 + (home.control - away.control) * 0.85 + engine.momentum * 0.12, 28, 72);
    engine.possessionHome = engine.possessionHome * 0.92 + possessionTarget * 0.08;
    engine.stats.home.possession = Math.round(engine.possessionHome);
    engine.stats.away.possession = 100 - Math.round(engine.possessionHome);

    const homeThreatTarget = clamp(25 + engine.zone * 22 + Math.max(0, engine.momentum) * 0.35 + home.attack - away.defence, 0, 100);
    const awayThreatTarget = clamp(25 - engine.zone * 22 + Math.max(0, -engine.momentum) * 0.35 + away.attack - home.defence, 0, 100);
    engine.homeThreat = engine.homeThreat * 0.78 + homeThreatTarget * 0.22;
    engine.awayThreat = engine.awayThreat * 0.78 + awayThreatTarget * 0.22;
    engine.stats.home.attacks += engine.zone > 0.45 ? 1 : 0;
    engine.stats.away.attacks += engine.zone < -0.45 ? 1 : 0;

    const homePoss = engine.possessionHome / 100;
    const passVolume = clamp(8.2 + ((home.tempo + away.tempo) / 2 - 70) * .055 + randomRange(engine, -.7, .7), 6.4, 11.2);
    engine.stats.home.passes += Math.max(1, Math.round(passVolume * homePoss));
    engine.stats.away.passes += Math.max(1, Math.round(passVolume * (1 - homePoss)));
    engine.stats.home.passAccuracy = Math.round(clamp(74 + (home.control - 72) * .35 + homePoss * 9, 66, 94));
    engine.stats.away.passAccuracy = Math.round(clamp(74 + (away.control - 72) * .35 + (1 - homePoss) * 9, 66, 94));
    if (random(engine) < .14) {
      const foulSide = random(engine) < homePoss ? "away" : "home";
      engine.stats[foulSide].fouls += 1;
      if (random(engine) < .18) {
        engine.stats[foulSide].yellow += 1;
        addEvent(engine, { type: "yellow", side: foulSide, text: "Sert müdahalenin ardından sarı kart çıktı." });
      } else if (random(engine) < .012) {
        engine.stats[foulSide].red += 1;
        const punished = foulSide === "home" ? home : away;
        const modsKey = foulSide === "home" ? "homeModifiers" : "awayModifiers";
        engine[modsKey].push({ until: 91, attack: -7, control: -9, defence: -6, risk: 4, source: "red-card" });
        addEvent(engine, { type: "red", side: foulSide, text: `${punished.actor.clubName} on kişi kaldı!` });
        setBroadcast(engine, "red", foulSide, "KIRMIZI KART", `${punished.actor.clubName} · ${Math.round(engine.minute)}'`);
      }
    }

    const totalShots = engine.stats.home.shots + engine.stats.away.shots;
    const projectedShots = totalShots / Math.max(1, engine.minute) * 90;
    const scoreNeed = engine.minute > 55 && engine.scoreHome === engine.scoreAway ? .025 : engine.minute > 65 ? .018 : 0;
    const catchup = projectedShots < 13 ? .045 : projectedShots < 17 ? .018 : projectedShots > 25 ? -.035 : 0;
    const tempoFactor = ((home.tempo + away.tempo) / 2 - 70) / 900;
    const riskFactor = (Math.max(home.risk, away.risk) - 50) / 850;
    const chanceProbability = clamp((.155 + scoreNeed + catchup + tempoFactor + riskFactor) * engine.matchVolatility, .075, .34);
    const canShoot = engine.minute - engine.lastChanceMinute >= (totalShots > 24 ? 2 : 1);
    if (canShoot && random(engine) < chanceProbability) {
      const homeWeight = clamp(.5 + engine.zone * .13 + (home.attack - away.attack) / 170 + engine.momentum / 500, .18, .82);
      createChance(career, fixture, random(engine) < homeWeight ? "home" : "away");
      engine.lastChanceMinute = engine.minute;
    }
    if (!engine.broadcastEvent && engine.minute - engine.lastChanceMinute > 1 && random(engine) < .0048) {
      const penaltyHomeWeight = clamp(.5 + engine.zone * .12 + (home.attack - away.attack) / 190, .22, .78);
      createPenalty(career, fixture, random(engine) < penaltyHomeWeight ? "home" : "away");
    }
    else if (engine.minute % 8 === 0) {
      const side = controlDelta >= 0 ? "home" : "away";
      const actorRow = side === "home" ? home.actor : away.actor;
      const messages = [
        `${actorRow.clubName} orta sahada pas açısı arıyor.`,
        `${actorRow.clubName} oyunu rakip yarı alana taşıdı.`,
        "İki takım da bir sonraki boşluğu bekliyor.",
        "Tempo kısa süreliğine düştü; taktik mücadele öne çıkıyor."
      ];
      addEvent(engine, { type: "flow", side, text: messages[Math.floor(random(engine) * messages.length)] });
    }

    const naturalMomentumDecay = engine.momentum > 0 ? -0.7 : engine.momentum < 0 ? 0.7 : 0;
    setMomentum(engine, naturalMomentumDecay + controlDelta * 0.65);
    maybeAiAdapt(career, fixture);

    engine.pulse.push({
      minute: Math.round(engine.minute),
      home: Math.round(clamp(engine.homeThreat * .68 + Math.max(0, engine.momentum) * .32, 0, 100)),
      away: Math.round(clamp(engine.awayThreat * .68 + Math.max(0, -engine.momentum) * .32, 0, 100)),
      momentum: Math.round(engine.momentum),
      tempo: Math.round(clamp((home.tempo + away.tempo) / 2 + Math.abs(engine.momentum) * .12, 35, 100)),
      zone: round1(engine.zone),
      scoreHome: engine.scoreHome,
      scoreAway: engine.scoreAway
    });
    engine.pulse = engine.pulse.slice(-90);

    if (engine.minute === 45) {
      setBroadcast(engine, "half-time", "neutral", "İLK YARI", `${engine.scoreHome} — ${engine.scoreAway} · Devre arası taktik değerlendirmesi`);
    }

    if (engine.minute % 5 === 0) room()?.saveLocal?.();
    if (engine.minute >= 90) {
      engine.status = "full-time";
      setBroadcast(engine, "full-time", "neutral", "MAÇ SONU", `${engine.scoreHome} — ${engine.scoreAway}`);
      stopTimer();
      refreshMount(career, fixture);
      window.setTimeout(() => { engine.broadcastEvent = null; finishMatch(career, fixture); }, 2400);
      return;
    }
    if (engine.broadcastEvent) {
      stopTimer();
      room()?.saveLocal?.();
      refreshMount(career, fixture);
      window.setTimeout(() => {
        const activeCareer = room()?.getActiveCareer?.();
        const activeFixture = activeCareer?.fixtures?.find(item => item.id === fixture.id);
        if (!activeFixture?.matchEngine || activeFixture.matchEngine.status !== "live") return;
        activeFixture.matchEngine.broadcastEvent = null;
        refreshMount(activeCareer, activeFixture);
        startTimer(activeCareer, activeFixture);
      }, 2200);
      return;
    }
    if (!maybeDecision(career, fixture)) refreshMount(career, fixture);
  }

  function startTimer(career, fixture) {
    stopTimer();
    if (!fixture?.matchEngine || fixture.matchEngine.status !== "live") return;
    runtime.fixtureId = fixture.id;
    runtime.timer = window.setInterval(() => {
      const activeCareer = room()?.getActiveCareer?.();
      const activeFixture = activeCareer?.fixtures?.find(item => item.id === runtime.fixtureId);
      if (!activeCareer || !activeFixture || activeFixture.matchEngine?.status !== "live") {
        stopTimer();
        return;
      }
      tick(activeCareer, activeFixture);
    }, TICK_MS);
  }

  function stopTimer() {
    if (runtime.timer) window.clearInterval(runtime.timer);
    runtime.timer = null;
    runtime.fixtureId = null;
  }

  function optionCompatibility(optionRow, context, sides) {
    const style = context.aiStyle || {};
    const team = sides.humanTeam || {};
    const tags = optionRow.tags || [];
    let score = 0;
    if (tags.includes("press")) score += (100 - Number(sides.aiTeam?.attributes?.pressResistance || 75)) * 0.14 - Math.max(0, 62 - context.humanFatigue) * 0.35;
    if (tags.includes("counter")) score += Number(style.risk || 50) * 0.12 + Number(sides.humanTeam?.attributes?.counterThreat || 75) * 0.08;
    if (tags.includes("control")) score += Number(team.attributes?.control || team.midfield || 75) * 0.08 + (context.humanMomentum < 0 ? 5 : 0);
    if (tags.includes("wide")) score += (58 - Number(style.width || 50)) * 0.16 + Math.max(0, Number(team.attack || 75) - Number(sides.aiTeam?.defence || 75)) * 0.15;
    if (tags.includes("central")) score += (Number(style.width || 50) - 48) * 0.13 + Number(team.midfield || 75) * 0.06;
    if (tags.includes("protect")) score += context.humanGoals > context.aiGoals ? 8 : context.minute > 78 ? 5 : -2;
    if (tags.includes("attack")) score += context.humanGoals < context.aiGoals ? 9 : context.minute > 78 && context.humanGoals === context.aiGoals ? 6 : 0;
    if (tags.includes("tempo")) score += Number(team.attributes?.tempo || 70) * 0.06 - Math.max(0, 68 - context.humanFatigue) * 0.22;
    if (tags.includes("direct")) score += Number(style.pressing || 50) * 0.08;
    if (tags.includes("patient")) score += Number(team.attributes?.control || team.midfield || 75) * 0.08;
    return score;
  }

  function resolveDecision(career, fixture, optionId) {
    const engine = fixture.matchEngine;
    const decision = engine.currentDecision;
    if (!decision) return;
    const optionRow = decision.options.find(item => item.id === optionId);
    if (!optionRow) return;
    const sides = getSides(career, fixture);
    const context = decision.context;
    const compatibility = optionCompatibility(optionRow, context, sides);
    const variance = randomRange(engine, -7, 7);
    const quality = clamp(52 + compatibility + variance, 22, 94);
    const qualityFactor = 0.65 + quality / 160;
    const effects = optionRow.effects;
    const humanSide = sides.humanIsHome ? "home" : "away";
    const modifiersKey = sides.humanIsHome ? "homeModifiers" : "awayModifiers";
    const momentumDelta = Number(effects.momentum || 0) * qualityFactor * (sides.humanIsHome ? 1 : -1);
    setMomentum(engine, momentumDelta);
    engine[modifiersKey].push({
      until: engine.minute + Number(effects.duration || 12),
      attack: Number(effects.attack || 0) * qualityFactor,
      control: Number(effects.control || 0) * qualityFactor,
      defence: Number(effects.defence || 0) * qualityFactor,
      risk: (optionRow.tags || []).includes("attack") ? 5 : (optionRow.tags || []).includes("protect") ? -5 : 0,
      source: optionRow.id
    });
    const fatigueDelta = Number(effects.fatigue || 0);
    if (sides.humanIsHome) engine.homeFatigue = clamp(engine.homeFatigue + fatigueDelta, 35, 100);
    else engine.awayFatigue = clamp(engine.awayFatigue + fatigueDelta, 35, 100);
    const impact = quality >= 78 ? "Hamle güçlü bir taktik uyum üretti." : quality >= 60 ? "Hamle dengeli bir etki oluşturdu." : quality >= 43 ? "Hamle risk ve faydayı birlikte getirdi." : "Hamle beklenenden daha yüksek risk oluşturdu.";
    decision.chosenId = optionRow.id;
    decision.chosenLabel = optionRow.label;
    decision.quality = Math.round(quality);
    decision.outcome = impact;
    decision.resolvedAt = now();
    fixture.decisions.push({ ...decision, options: undefined });
    engine.currentDecision = null;
    engine.status = "live";
    engine.decisionCooldownUntil = engine.minute + 7;
    addEvent(engine, { type: "decision", side: humanSide, text: `${optionRow.label}: ${impact}` });
    room()?.saveLocal?.();
    refreshMount(career, fixture);
    window.setTimeout(() => startTimer(career, fixture), 1050);
  }

  function ensureTableRow(career, division, actorId) {
    career.tables ||= {};
    career.tables[division] ||= [];
    let row = career.tables[division].find(item => item.actorId === actorId);
    if (!row) {
      row = { actorId, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      career.tables[division].push(row);
    }
    return row;
  }

  function applyTableResult(career, fixture, homeScore, awayScore) {
    if (fixture.tableApplied || fixture.competition === "oruc") return;
    const home = ensureTableRow(career, fixture.division, fixture.homeId);
    const away = ensureTableRow(career, fixture.division, fixture.awayId);
    home.mp += 1; away.mp += 1;
    home.gf += homeScore; home.ga += awayScore;
    away.gf += awayScore; away.ga += homeScore;
    home.gd = home.gf - home.ga; away.gd = away.gf - away.ga;
    if (homeScore > awayScore) { home.w += 1; away.l += 1; home.pts += 3; }
    else if (awayScore > homeScore) { away.w += 1; home.l += 1; away.pts += 3; }
    else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
    fixture.tableApplied = true;
  }

  function poisson(engine, lambda) {
    const limit = Math.exp(-lambda);
    let product = 1;
    let count = 0;
    do { count += 1; product *= random(engine); } while (product > limit && count < 10);
    return count - 1;
  }

  function drawAiFixtureTeams(fixture, engine) {
    const catalog = room()?.getTeamCatalog?.();
    const pool = (catalog?.teams || []).filter(team => team.active !== false && Number(team.stars) === Number(fixture.stars));
    if (pool.length < 2) return;
    const first = pool[Math.floor(random(engine) * pool.length)];
    let second = pool[Math.floor(random(engine) * pool.length)];
    let guard = 0;
    while (second.id === first.id && guard < 30) { second = pool[Math.floor(random(engine) * pool.length)]; guard += 1; }
    fixture.homeTeam = first.id;
    fixture.awayTeam = second.id;
    fixture.teamDraw ||= { id: `ai-draw-${fixture.id}`, version: VERSION, stars: fixture.stars, drawnAt: now(), locked: true, method: "seeded-ai-random" };
  }

  function simulateAiFixture(career, fixture, engine) {
    drawAiFixtureTeams(fixture, engine);
    const homeActor = actor(career, fixture.homeId);
    const awayActor = actor(career, fixture.awayId);
    const homeTeam = matchTeam(fixture, fixture.homeId);
    const awayTeam = matchTeam(fixture, fixture.awayId);
    const homeRating = Number(homeActor.power || 1000) + Number(homeTeam?.overall || 75) * 13 + 36;
    const awayRating = Number(awayActor.power || 1000) + Number(awayTeam?.overall || 75) * 13;
    const diff = (homeRating - awayRating) / 400;
    const homeLambda = clamp(1.28 + diff + randomRange(engine, -0.14, 0.14), 0.35, 3.4);
    const awayLambda = clamp(1.08 - diff + randomRange(engine, -0.14, 0.14), 0.3, 3.2);
    const homeScore = poisson(engine, homeLambda);
    const awayScore = poisson(engine, awayLambda);
    fixture.homeScore = homeScore;
    fixture.awayScore = awayScore;
    fixture.winnerId = homeScore === awayScore ? null : homeScore > awayScore ? fixture.homeId : fixture.awayId;
    fixture.status = "played";
    fixture.updatedAt = now();
    fixture.simulated = true;
    fixture.stats = { simulation: "manager-v42.5", homeXg: round1(homeLambda), awayXg: round1(awayLambda) };
    applyTableResult(career, fixture, homeScore, awayScore);
    applyActorElo(career, fixture, homeScore, awayScore);
  }

  function applyActorElo(career, fixture, homeScore, awayScore) {
    if (fixture.eloApplied) return;
    const home = actor(career, fixture.homeId);
    const away = actor(career, fixture.awayId);
    const homeBefore = Number(home.power || 1000);
    const awayBefore = Number(away.power || 1000);
    const expectedHome = 1 / (1 + Math.pow(10, (awayBefore - homeBefore) / 400));
    const actualHome = homeScore > awayScore ? 1 : homeScore === awayScore ? .5 : 0;
    const stageK = fixture.division === "premier" ? 30 : 26;
    const goalFactor = Math.min(1.45, 1 + Math.max(0, Math.abs(homeScore - awayScore) - 1) * .1);
    const delta = Math.round(stageK * goalFactor * (actualHome - expectedHome));
    home.power = clamp(homeBefore + delta, 700, 2200);
    away.power = clamp(awayBefore - delta, 700, 2200);
    home.tacticalIQ = clamp(Number(home.tacticalIQ||50)+(actualHome===1?1:actualHome===0?-1:0),20,99);
    away.tacticalIQ = clamp(Number(away.tacticalIQ||50)+(actualHome===0?1:actualHome===1?-1:0),20,99);
    home.reputation = clamp(Number(home.reputation||50)+(actualHome===1?1:0),20,100);
    away.reputation = clamp(Number(away.reputation||50)+(actualHome===0?1:0),20,100);
    home.formRating = clamp(Number(home.formRating||50)+(actualHome===1?5:actualHome===0?-4:1),0,100);
    away.formRating = clamp(Number(away.formRating||50)+(actualHome===0?5:actualHome===1?-4:1),0,100);
    home.powerClass = room()?.powerLabel?.(home.power) || home.powerClass;
    away.powerClass = room()?.powerLabel?.(away.power) || away.powerClass;
    fixture.eloChange = { homeBefore, awayBefore, homeAfter: home.power, awayAfter: away.power, homeDelta: delta, awayDelta: -delta };
    fixture.eloApplied = true;
  }

  function simulateMatchday(career, completedFixture) {
    const engine = completedFixture.matchEngine;
    const matchday = completedFixture.matchday;
    career.fixtures
      .filter(item => item.id !== completedFixture.id && item.status === "scheduled" && Number(item.matchday) === Number(matchday) && ![item.homeId,item.awayId].includes(career.humanActorId))
      .forEach(item => simulateAiFixture(career, item, engine));
  }

  function reportLines(career, fixture) {
    const engine = fixture.matchEngine;
    const sides = getSides(career, fixture);
    const qualities = (fixture.decisions || []).map(item => Number(item.quality || 50));
    const avgQuality = qualities.length ? qualities.reduce((sum, value) => sum + value, 0) / qualities.length : 50;
    const humanStats = sides.humanIsHome ? engine.stats.home : engine.stats.away;
    const aiStats = sides.humanIsHome ? engine.stats.away : engine.stats.home;
    const lines = [];
    if (avgQuality >= 72) lines.push("Maç içi hamlelerin genel olarak takım ve maç bağlamıyla yüksek uyum gösterdi.");
    else if (avgQuality >= 56) lines.push("Kararların dengeli etki üretti; bazı hamleler ek risk yarattı.");
    else lines.push("Kararların oyunu değiştirdi ancak yüksek varyans ve kondisyon maliyeti oluşturdu.");
    if (humanStats.possession >= 56) lines.push("Orta saha kontrolünü uzun bölümlerde elinde tuttun.");
    else if (humanStats.possession <= 44) lines.push("Top kontrolü rakipteydi; geçiş hücumları ana üretim yolun oldu.");
    if (humanStats.xg > aiStats.xg + 0.45) lines.push("Pozisyon kalitesi bakımından rakibin üzerinde üretim yaptın.");
    else if (aiStats.xg > humanStats.xg + 0.45) lines.push("Rakip daha yüksek kaliteli fırsatlar üretti; savunma planı geliştirilmelidir.");
    if ((sides.humanIsHome ? engine.homeFatigue : engine.awayFatigue) < 58) lines.push("Son bölümde fizik seviyesi kritik eşiğe düştü.");
    if (engine.aiAdaptations >= 2) lines.push("Rakip maç içinde birden fazla taktik değişiklik yaptı; profilinin adaptasyon seviyesi yüksek olabilir.");
    return { lines, avgQuality: Math.round(avgQuality) };
  }

  async function finishMatch(career, fixture) {
    if (runtime.busy || fixture.matchEngine?.status === "finished") return;
    runtime.busy = true;
    stopTimer();
    const engine = fixture.matchEngine;
    engine.minute = 90;
    engine.status = "finished";
    engine.finishedAt = now();
    Object.values(engine.squads||{}).flat().forEach(player=>{ player.form=clamp(Math.round(player.form+randomRange(engine,-4,6)+(player.status==="XI"?2:0)),20,99); player.development=round1((player.development||0)+(player.form-50)/100); });
    (engine.tacticalSnapshots || []).forEach(item => {
      const current = sideDisplay(career, fixture);
      const minutes = Math.max(1, 90 - item.minute);
      item.after = { shots: current.humanStats.shots, xg: current.humanStats.xg, possession: Math.round(current.humanPossession), threat: Math.round(current.humanThreat), fatigue: Math.round(current.humanFatigue), minutes };
    });
    fixture.status = "played";
    fixture.homeScore = engine.scoreHome;
    fixture.awayScore = engine.scoreAway;
    fixture.winnerId = engine.scoreHome === engine.scoreAway ? null : engine.scoreHome > engine.scoreAway ? fixture.homeId : fixture.awayId;
    fixture.stats = engine.stats;
    fixture.updatedAt = now();
    applyTableResult(career, fixture, engine.scoreHome, engine.scoreAway);
    applyActorElo(career, fixture, engine.scoreHome, engine.scoreAway);
    simulateMatchday(career, fixture);
    room()?.advanceOrucCup?.(career);

    const sides = getSides(career, fixture);
    const humanGoals = sides.humanIsHome ? engine.scoreHome : engine.scoreAway;
    const aiGoals = sides.humanIsHome ? engine.scoreAway : engine.scoreHome;
    const result = humanGoals > aiGoals ? 1 : humanGoals === aiGoals ? 0.5 : 0;
    const eloSnapshot = fixture.eloChange || {};
    const humanRating = Number(career.managerElo || 1000) + Number(sides.humanTeam?.overall || 75) * 8;
    const aiPreMatchPower = sides.humanIsHome ? eloSnapshot.awayBefore : eloSnapshot.homeBefore;
    const aiRating = Number(aiPreMatchPower || sides.aiActor.power || 1000) + Number(sides.aiTeam?.overall || 75) * 8;
    const expected = 1 / (1 + Math.pow(10, (aiRating - humanRating) / 400));
    const eloDelta = Math.round(28 * (result - expected));
    const analysis = reportLines(career, fixture);
    const tacticalDelta = Math.round((analysis.avgQuality - 55) / 10);
    career.managerElo = clamp(Number(career.managerElo || 1000) + eloDelta, 700, 2200);
    const humanActor = actor(career, career.humanActorId);
    humanActor.power = career.managerElo;
    humanActor.powerClass = room()?.powerLabel?.(career.managerElo) || "COMPETITIVE";
    career.tacticalIQ = clamp(Number(career.tacticalIQ || 50) + tacticalDelta, 20, 99);
    const basePoints = result === 1 ? 110 : result === 0.5 ? 55 : 24;
    const tacticalBonus = Math.max(0, Math.round((analysis.avgQuality - 45) * 1.2));
    career.careerPoints = Number(career.careerPoints || 0) + basePoints + tacticalBonus;
    career.prestige = clamp(Number(career.prestige || 0) + (result === 1 ? 2 : result === 0.5 ? 1 : 0), 0, 100);
    const humanFixtures = career.fixtures.filter(item => [item.homeId, item.awayId].includes(career.humanActorId));
    const playedHuman = humanFixtures.filter(item => item.status === "played");
    career.completionRate = Math.round(playedHuman.length / Math.max(1, humanFixtures.length) * 100);
    career.matchEngineStats ||= { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, decisions: 0 };
    career.matchEngineStats.matches += 1;
    if (result === 1) career.matchEngineStats.wins += 1;
    else if (result === 0.5) career.matchEngineStats.draws += 1;
    else career.matchEngineStats.losses += 1;
    career.matchEngineStats.goalsFor += humanGoals;
    career.matchEngineStats.goalsAgainst += aiGoals;
    career.matchEngineStats.decisions += fixture.decisions.length;
    career.matchHistory ||= [];
    const planSummary=planSignature(engine.userPlan);
    career.matchHistory.unshift({
      fixtureId: fixture.id,
      playedAt: now(),
      opponentId: sides.aiActor.id,
      opponentName: sides.aiActor.managerName,
      humanTeamId: sides.humanTeam.id,
      aiTeamId: sides.aiTeam.id,
      humanGoals,
      aiGoals,
      result: result === 1 ? "W" : result === 0.5 ? "D" : "L",
      eloDelta,
      tacticalQuality: analysis.avgQuality,
      planSummary,
      aiAdaptations: engine.aiAdaptations,
      chanceChains: engine.possessionChains?.length||0
    });
    const memory=sides.aiActor.managerMemory||{meetings:0,wins:0,draws:0,losses:0,plans:{},confidence:50,notes:[]};
    memory.meetings=Number(memory.meetings||0)+1;
    if(result===0)memory.wins=Number(memory.wins||0)+1; else if(result===.5)memory.draws=Number(memory.draws||0)+1; else memory.losses=Number(memory.losses||0)+1;
    memory.plans ||= {}; memory.plans[planSummary]=Number(memory.plans[planSummary]||0)+1; memory.lastPlan=planSummary;
    memory.confidence=clamp(Number(memory.confidence||50)+(result===0?6:result===1?-4:1),20,95);
    memory.notes ||= []; memory.notes.unshift(`${new Date().toLocaleDateString("tr-TR")} · ${humanGoals}-${aiGoals} · ${planSummary}`); memory.notes=memory.notes.slice(0,8);
    sides.aiActor.managerMemory=memory;
    engine.report = {
      humanGoals,
      aiGoals,
      result: result === 1 ? "WIN" : result === 0.5 ? "DRAW" : "LOSS",
      eloDelta,
      tacticalDelta,
      tacticalQuality: analysis.avgQuality,
      careerPointsEarned: basePoints + tacticalBonus,
      lines: analysis.lines,
      motivation: engine.motivation,
      totalShots: engine.stats.home.shots + engine.stats.away.shots,
      totalXg: round1(engine.stats.home.xg + engine.stats.away.xg),
      revealedStyleHint: revealStyleHint(engine.aiStyle)
    };
    const next = career.fixtures
      .filter(item => item.status === "scheduled" && [item.homeId, item.awayId].includes(career.humanActorId))
      .sort((a, b) => a.matchday - b.matchday)[0];
    career.matchday = next?.matchday || fixture.matchday + 1;
    career.status = "match-report";
    try {
      await room()?.persistCareer?.(career, { silent: true });
    } catch (error) {
      app()?.toast?.(`${error.message} Maç cihazda kaydedildi.`, "warning");
    }
    runtime.busy = false;
    refreshMount(career, fixture);
  }

  function revealStyleHint(style = {}) {
    const dimensions = [
      ["pres yoğunluğu", Number(style.pressing || 50)],
      ["tempo eğilimi", Number(style.tempo || 50)],
      ["risk profili", Number(style.risk || 50)],
      ["adaptasyon", Number(style.adaptation || 50)],
      ["genişlik kullanımı", Number(style.width || 50)],
      ["doğrudan oyun", Number(style.directness || 50)]
    ].sort((a, b) => Math.abs(b[1] - 50) - Math.abs(a[1] - 50));
    const [name, value] = dimensions[0];
    return `Yeni scouting notu: Rakibin ${name} seviyesi ${value >= 65 ? "yüksek" : value <= 35 ? "düşük" : "dengeli"} görünüyor.`;
  }

  function renderPlanSelector(group, selectedId) {
    const labels = { mentality: "Ana Yaklaşım", pressing: "Pres Yapısı", buildUp: "Hücum Kurulumu", tempo: "Tempo", risk: "Risk Profili" };
    return `<fieldset class="manager-plan-group"><legend>${labels[group]}</legend><div>${PLAN_GROUPS[group].map((item, index) => `<label class="${item.id === selectedId ? "selected" : ""}"><input type="radio" name="${group}" value="${item.id}" ${item.id === selectedId ? "checked" : ""} required><span><b>${item.label}</b><small>${item.note}</small></span></label>`).join("")}</div></fieldset>`;
  }

  function renderSetup(career, human, rival, fixture) {
    const sides = getSides(career, fixture);
    if (!sides.humanTeam || !sides.aiTeam) {
      return `<section id="managerMatchMount" class="manager-match-shell"><div class="manager-match-empty"><span>TEAM DRAW REQUIRED</span><h2>Önce iki takımın kurasını tamamla</h2><p>Canlı maç motoru takım OVR/ATK/MID/DEF değerlerini, Manager ELO ve gizli rakip stilini aynı state içinde kullanır.</p><button class="btn btn-gold" data-manager-action="set-tab" data-tab="draw">Team Draw Theatre</button></div></section>`;
    }
    const defaults = fixture.matchPlan || { mentality: "balanced", pressing: "mid", buildUp: "patient", tempo: "normal", risk: "measured" };
    return `<section id="managerMatchMount" class="manager-match-shell">
      <div class="manager-war-room-head"><div><span>PRE-MATCH WAR ROOM · MATCHDAY ${fixture.matchday}</span><h2>Maç Planını Kur</h2><p>Rakibin Manager gücü görünür; oyun tarzı gizlidir. Seçtiğin yaklaşım takım özellikleriyle birleşir ve maç içinde değişen durumlara göre sınanır.</p></div><div class="manager-match-clock"><strong>≈ 3–5 DK</strong><span>2X LIVE ENGINE</span></div></div>
      <div class="manager-war-room-versus">
        ${compactTeamCard(sides.humanTeam, human, "SEN", career.managerElo)}
        <div class="manager-war-room-core"><span>TACTICAL</span><b>VS</b><small>${room()?.starText?.(fixture.stars) || `${fixture.stars}★`}</small></div>
        ${compactTeamCard(sides.aiTeam, rival, "RAKİP", rival.power, true)}
      </div>
      <form id="managerMatchPlanForm" class="manager-plan-form" data-fixture-id="${esc(fixture.id)}">
        <section class="manager-formation-room"><label>DİZİLİŞ<select name="formation">${FORMATIONS.map(value=>`<option ${defaults.formation===value?"selected":""}>${value}</option>`).join("")}</select></label><label>HÜCUM ROLÜ<select name="attackRole">${ROLE_OPTIONS.map(value=>`<option ${defaults.attackRole===value?"selected":""}>${value}</option>`).join("")}</select></label><label>ORTA SAHA ROLÜ<select name="midfieldRole">${ROLE_OPTIONS.map(value=>`<option ${defaults.midfieldRole===value?"selected":""}>${value}</option>`).join("")}</select></label><label>SAVUNMA ROLÜ<select name="defenceRole">${ROLE_OPTIONS.map(value=>`<option ${defaults.defenceRole===value?"selected":""}>${value}</option>`).join("")}</select></label></section>
        <div class="manager-plan-grid">
          ${renderPlanSelector("mentality", defaults.mentality)}
          ${renderPlanSelector("pressing", defaults.pressing)}
          ${renderPlanSelector("buildUp", defaults.buildUp)}
          ${renderPlanSelector("tempo", defaults.tempo)}
          ${renderPlanSelector("risk", defaults.risk)}
        </div>
        <fieldset class="manager-motivation-group"><legend>MAÇ ÖNCESİ MOTİVASYON KONUŞMASI</legend><div>${MOTIVATION_TALKS.map((item, index) => `<label><input type="radio" name="motivation" value="${item.id}" ${index === 0 ? "checked" : ""}><span><b>${item.label}</b><small>${item.note}</small></span></label>`).join("")}</div><small>Konuşma doğru bağlamda pozitif etki yaratabilir; etkisiz kalabilir veya ters tepebilir. Sonuç maç başladığında açıklanır.</small></fieldset>
        <fieldset class="manager-press-conference"><legend>BASIN TOPLANTISI</legend><label><input type="radio" name="pressAnswer" value="confident" checked><span>“Hazırız ve kazanmak için buradayız.”</span></label><label><input type="radio" name="pressAnswer" value="respect"><span>“Rakibimize saygı duyuyoruz.”</span></label><label><input type="radio" name="pressAnswer" value="protect"><span>“Baskıyı oyuncularımdan uzak tutuyorum.”</span></label></fieldset>
        <div class="manager-plan-footer"><div><span>RAKİP PROFİLİ</span><strong>GÜÇ ${rival.power} · STİL GİZLİ</strong><small>Rakibin davranışı maç içindeki sinyallerden okunmalıdır.</small></div><button class="btn btn-gold manager-kickoff-btn" type="submit">Maçı Başlat</button></div>
      </form>
    </section>`;
  }

  function compactTeamCard(team, actorRow, label, power, hiddenStyle = false) {
    return `<article class="manager-war-team ${label === "RAKİP" ? "rival" : "human"}"><header><span>${label}</span><b>${team.stars}★</b></header><div class="manager-war-team-id"><div>${esc(initials(team.clubName, 3))}</div><section><small>${esc(team.country)} · ${esc(team.league)}</small><h3>${esc(team.clubName)}</h3><p>${esc(actorRow.clubName)} · ${esc(actorRow.managerName)}</p></section><strong>${team.overall}</strong></div><footer><span>ATK <b>${team.attack}</b></span><span>MID <b>${team.midfield}</b></span><span>DEF <b>${team.defence}</b></span><span>MANAGER <b>${power}</b></span></footer>${hiddenStyle ? `<div class="manager-hidden-style"><span>PRESS ???</span><span>RISK ???</span><span>ADAPT ???</span></div>` : ""}</article>`;
  }

  function initials(value, max = 3) {
    return String(value || "FC").split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, max).toUpperCase();
  }

  function sideDisplay(career, fixture) {
    const engine = fixture.matchEngine;
    const sides = getSides(career, fixture);
    return {
      humanGoals: sides.humanIsHome ? engine.scoreHome : engine.scoreAway,
      aiGoals: sides.humanIsHome ? engine.scoreAway : engine.scoreHome,
      humanStats: sides.humanIsHome ? engine.stats.home : engine.stats.away,
      aiStats: sides.humanIsHome ? engine.stats.away : engine.stats.home,
      humanFatigue: sides.humanIsHome ? engine.homeFatigue : engine.awayFatigue,
      aiFatigue: sides.humanIsHome ? engine.awayFatigue : engine.homeFatigue,
      humanThreat: sides.humanIsHome ? engine.homeThreat : engine.awayThreat,
      aiThreat: sides.humanIsHome ? engine.awayThreat : engine.homeThreat,
      humanMomentum: sides.humanIsHome ? engine.momentum : -engine.momentum,
      humanPossession: sides.humanIsHome ? engine.possessionHome : 100 - engine.possessionHome,
      ...sides
    };
  }

  function renderLive(career, human, rival, fixture) {
    const engine = fixture.matchEngine;
    const d = sideDisplay(career, fixture);
    const momentumPos = clamp((d.humanMomentum + 100) / 2, 0, 100);
    const zoneHuman = d.humanIsHome ? engine.zone : -engine.zone;
    const pitchMarker = clamp(50 + zoneHuman * 18, 7, 93);
    const isRunning = runtime.fixtureId === fixture.id && Boolean(runtime.timer);
    return `<section id="managerMatchMount" class="manager-live-match level-${career.managerIdentity?.level||"manager"} ${engine.status === "decision" ? "decision-active" : ""}">
      <header class="manager-live-header"><div><span>LIVE MATCH ENGINE · 2X</span><strong>${Math.min(90, Math.round(engine.minute))}'</strong></div><div class="manager-live-score"><article><span>${esc(d.humanTeam.clubName)}</span><b>${d.humanGoals}</b><small>${esc(career.clubName)}</small></article><i>—</i><article><b>${d.aiGoals}</b><span>${esc(d.aiTeam.clubName)}</span><small>${esc(rival.clubName)}</small></article></div><div class="manager-live-controls"><span>${engine.status === "decision" ? "TACTICAL PAUSE" : isRunning ? "LIVE" : "PAUSED"}</span>${engine.status === "live" ? `<button data-match-action="${isRunning ? "pause" : "resume"}">${isRunning ? "Duraklat" : "Devam Et"}</button>${!isRunning ? `<button data-match-action="change-tactics">Taktik Değiştir</button>` : ""}` : ""}</div></header>
      ${renderPulseChart(engine, d.humanIsHome)}
      ${renderChainIntelligence(engine,d.humanIsHome,false)}
      <div class="manager-match-main-grid">
        <article class="manager-pitch-theatre">
          <div class="manager-pitch-top"><span>SAHA HÂKİMİYETİ</span><strong>${Math.round(d.humanPossession)}% — ${100 - Math.round(d.humanPossession)}%</strong></div>
          <div class="manager-digital-pitch"><div class="pitch-lines"></div><div class="pitch-control home" style="width:${pitchMarker}%"></div><div class="pitch-ball" style="left:${pitchMarker}%">⚽</div><div class="pitch-label left">${esc(career.shortName)}</div><div class="pitch-label right">${esc(rival.shortName)}</div></div>
          <div class="manager-momentum-bar"><span>SEN</span><i><b style="width:${momentumPos}%"></b><em style="left:${momentumPos}%"></em></i><span>RAKİP</span></div>
          <div class="manager-live-metrics">
            ${metric("xG", d.humanStats.xg, d.aiStats.xg)}
            ${metric("Şut", d.humanStats.shots, d.aiStats.shots)}
            ${metric("İsabet", d.humanStats.onTarget, d.aiStats.onTarget)}
            ${metric("Tehdit", Math.round(d.humanThreat), Math.round(d.aiThreat))}
            ${metric("Fizik", Math.round(d.humanFatigue), Math.round(d.aiFatigue))}
            ${metric("Pas", d.humanStats.passes, d.aiStats.passes)}
            ${metric("Pas %", d.humanStats.passAccuracy, d.aiStats.passAccuracy)}
            ${metric("Korner", d.humanStats.corners, d.aiStats.corners)}
            ${metric("Faul", d.humanStats.fouls, d.aiStats.fouls)}
          </div>
        </article>
        <aside class="manager-event-feed"><div class="manager-feed-head"><span>LIVE EVENT STREAM</span><b>${engine.events.length}</b></div><div>${engine.events.map(event => `<article class="${event.type} ${event.side}"><time>${event.minute}'</time><p>${esc(event.text)}</p></article>`).join("")}</div></aside>
      </div>
      <footer class="manager-live-footer"><div><span>PLAN</span><strong>${esc(planItem("mentality", engine.userPlan.mentality).label)} · ${esc(planItem("pressing", engine.userPlan.pressing).label)}</strong></div><div><span>DECISIONS</span><strong>${fixture.decisions.length}/${MAX_DECISIONS}</strong></div><div><span>AI ADAPTATION</span><strong>${engine.aiAdaptations ? "DETECTED" : "HIDDEN"}</strong></div><div><span>SEED</span><strong>${engine.seed.toString(16).toUpperCase()}</strong></div></footer>
      ${engine.currentDecision ? renderDecision(engine.currentDecision) : ""}
      ${engine.tacticalEditing ? renderTacticalEditor(engine.userPlan, engine) : ""}
      ${engine.broadcastEvent ? renderBroadcastEvent(engine.broadcastEvent, d) : ""}
    </section>`;
  }

  function renderPulseChart(engine, humanIsHome) {
    const pulse = engine.pulse || [];
    const points = Array.from({ length: 90 }, (_, index) => pulse.find(item => item.minute === index + 1) || null);
    const markerTypes = { goal: "⚽", "penalty-goal": "●", "penalty-miss": "⊘", red: "■", tactics: "◆", decision: "◇" };
    return `<section class="manager-pulse"><header><div><span>MATCH PULSE</span><strong>Oyun Temposu & Attack Momentum</strong></div><div><b>${Math.round(pulse.at(-1)?.tempo || 0)}</b><small>TEMPO</small></div></header><div class="manager-pulse-chart"><div class="pulse-half-line"><span>İY</span></div>${points.map((point, index) => { const minute=index+1; const human=point?(humanIsHome?point.home:point.away):0; const rival=point?(humanIsHome?point.away:point.home):0; const events=engine.events.filter(event=>event.minute===minute&&markerTypes[event.type]); const marker=events[0]?markerTypes[events[0].type]:""; return `<i class="pulse-minute ${point?"active":""}" title="${minute}' · Sen ${human} · Rakip ${rival}${point?` · Tempo ${point.tempo}`:""}"><b style="height:${human}%"></b><em style="height:${rival}%"></em>${marker?`<span>${marker}</span>`:""}</i>`; }).join("")}</div><footer><span>${humanIsHome?"HOME":"AWAY"} · SEN</span><small>45' İLK YARI</small><span>RAKİP · ${humanIsHome?"AWAY":"HOME"}</span></footer></section>`;
  }

  function renderChainIntelligence(engine,humanIsHome,reportMode=false){
    const chains=engine.possessionChains||[], humanSide=humanIsHome?"home":"away", human=chains.filter(x=>x.side===humanSide),ai=chains.filter(x=>x.side!==humanSide),last=chains.at(-1);
    const zones=engine.zoneEntries||{home:{left:0,centre:0,right:0},away:{left:0,centre:0,right:0}},hz=zones[humanSide]||{},az=zones[humanIsHome?"away":"home"]||{};
    return `<section class="manager-chain-intel ${reportMode?"report":""}"><header><div><span>MATCH ENGINE 2.0</span><strong>Pozisyon Zinciri & Hücum Yolları</strong></div><small>${chains.length} işlenen hücum sekansı</small></header><div class="manager-chain-kpis"><article><span>SEN</span><b>${human.length}</b><small>${human.filter(x=>x.outcome==="shot"||x.outcome==="goal").length} şuta ulaştı</small></article><article><span>RAKİP</span><b>${ai.length}</b><small>${ai.filter(x=>x.outcome==="shot"||x.outcome==="goal").length} şuta ulaştı</small></article><article><span>HÜCUM YOLUN</span><b>${Number(hz.left||0)>Number(hz.centre||0)&&Number(hz.left||0)>Number(hz.right||0)?"SOL":Number(hz.right||0)>Number(hz.centre||0)?"SAĞ":"MERKEZ"}</b><small>${hz.left||0} · ${hz.centre||0} · ${hz.right||0}</small></article><article><span>RAKİP YOLU</span><b>${Number(az.left||0)>Number(az.centre||0)&&Number(az.left||0)>Number(az.right||0)?"SOL":Number(az.right||0)>Number(az.centre||0)?"SAĞ":"MERKEZ"}</b><small>${az.left||0} · ${az.centre||0} · ${az.right||0}</small></article></div>${last?`<div class="manager-last-chain"><time>${last.minute}'</time>${last.steps.map((s,i)=>`<span>${esc(s)}${i<last.steps.length-1?" → ":""}</span>`).join("")}<b>${last.outcome.toUpperCase()} · Q${last.quality}</b></div>`:""}</section>`;
  }

  function renderBroadcastEvent(event, d) {
    const isHuman = (d.humanIsHome && event.side === "home") || (!d.humanIsHome && event.side === "away");
    const tone = event.type.includes("miss") || event.type === "red" ? "miss" : event.type.includes("penalty") ? "penalty" : "goal";
    return `<div class="manager-broadcast-overlay ${tone} ${isHuman?"human":"rival"}"><div class="broadcast-rings"></div><article><span>${event.minute}' · LIVE EVENT</span><h2>${esc(event.title)}</h2><p>${esc(event.subtitle)}</p><div><strong>${d.humanGoals}</strong><i>—</i><strong>${d.aiGoals}</strong></div><small>${isHuman?"SENİN TAKIMIN":"RAKİP TAKIM"}</small></article></div>`;
  }

  function renderTacticalEditor(plan, engine) {
    return `<div class="manager-decision-overlay"><form id="managerTacticalAdjustForm" class="manager-decision-card manager-tactical-editor"><header><div><span>MANUAL TACTICAL PAUSE</span><h2>Manager Tablet</h2></div><b>SAAT DURDU</b></header><div class="manager-assistant-tip"><b>SMART ASSISTANT</b><span>${engine.momentum<-25?"Momentum rakipte; orta saha kontrolünü veya savunma direncini artır.":engine.homeFatigue<65||engine.awayFatigue<65?"Fizik seviyesi düşüyor; taze oyuncu öneriliyor.":"Maç dengede. Müdahalenin risk ve fizik maliyetini değerlendir."}</span></div><div class="manager-sub-presets"><button type="button" data-match-action="substitution" data-sub-type="pace">⚡ Hızlı Hücumcu</button><button type="button" data-match-action="substitution" data-sub-type="control">◎ Orta Saha Kontrolü</button><button type="button" data-match-action="substitution" data-sub-type="defence">▣ Savunma Takviyesi</button><small>${engine.substitutions?.length||0}/5 değişiklik</small></div><div class="manager-plan-grid">${Object.keys(PLAN_GROUPS).map(group => renderPlanSelector(group, plan[group])).join("")}</div><div class="manager-tactical-actions"><button type="button" data-match-action="cancel-tactics">Vazgeç</button><button class="btn btn-gold" type="submit">Değişiklikleri Uygula</button></div></form></div>`;
  }

  function metric(label, home, away) {
    return `<div><span>${label}</span><b>${round1(home)}</b><i></i><b>${round1(away)}</b></div>`;
  }

  function renderDecision(decision) {
    return `<div class="manager-decision-overlay"><div class="manager-decision-card"><header><div><span>TACTICAL DECISION · ${decision.minute}'</span><h2>${esc(decision.title)}</h2></div><b>MAÇ DURDU</b></header><p>${esc(decision.prompt)}</p><div class="manager-decision-options">${decision.options.map(item => `<button data-match-action="decision" data-option-id="${esc(item.id)}"><strong>${esc(item.label)}</strong><span>${esc(item.note)}</span><small>Mutlak doğru cevap yoktur; etki mevcut maç state’ine göre çözülür.</small></button>`).join("")}</div></div></div>`;
  }

  function renderReport(career, human, rival, fixture, archiveMode = false) {
    const engine = fixture.matchEngine;
    const report = engine.report || {};
    const d = sideDisplay(career, fixture);
    const resultClass = report.result === "WIN" ? "win" : report.result === "LOSS" ? "loss" : "draw";
    return `<section id="managerMatchMount" class="manager-match-report ${resultClass}">
      <div class="manager-report-hero"><div><span>FULL TIME · MATCHDAY ${fixture.matchday}</span><h2>${report.result === "WIN" ? "GALİBİYET" : report.result === "LOSS" ? "MAĞLUBİYET" : "BERABERLİK"}</h2><p>${esc(d.humanTeam.clubName)} ile ${esc(d.aiTeam.clubName)} arasındaki maç tamamlandı.</p></div><div class="manager-report-score"><span>${esc(career.shortName)}</span><b>${report.humanGoals ?? d.humanGoals}</b><i>—</i><b>${report.aiGoals ?? d.aiGoals}</b><span>${esc(rival.shortName)}</span></div></div>
      ${renderPulseChart(engine, d.humanIsHome)}
      ${renderChainIntelligence(engine,d.humanIsHome,true)}
      ${renderMatchDna(engine, d)}
      ${renderFormationAnalysis(engine, d)}
      <div class="manager-report-grid">
        <article class="manager-report-rating"><span>TAKTİK PERFORMANS</span><strong>${report.tacticalQuality || 50}</strong><small>/ 100</small><div><b>ELO ${report.eloDelta >= 0 ? "+" : ""}${report.eloDelta || 0}</b><b>IQ ${report.tacticalDelta >= 0 ? "+" : ""}${report.tacticalDelta || 0}</b><b>+${report.careerPointsEarned || 0} CP</b></div></article>
        <article class="manager-report-stats"><h3>Gelişmiş Maç Verisi</h3>${metric("xG", d.humanStats.xg, d.aiStats.xg)}${metric("Şut", d.humanStats.shots, d.aiStats.shots)}${metric("İsabet", d.humanStats.onTarget, d.aiStats.onTarget)}${metric("İsabetsiz", d.humanStats.offTarget, d.aiStats.offTarget)}${metric("Blok", d.humanStats.blocked, d.aiStats.blocked)}${metric("Top %", Math.round(d.humanPossession), 100 - Math.round(d.humanPossession))}${metric("Pas", d.humanStats.passes, d.aiStats.passes)}${metric("Pas %", d.humanStats.passAccuracy, d.aiStats.passAccuracy)}${metric("Korner", d.humanStats.corners, d.aiStats.corners)}${metric("Faul", d.humanStats.fouls, d.aiStats.fouls)}${metric("Sarı", d.humanStats.yellow, d.aiStats.yellow)}${metric("Kırmızı", d.humanStats.red, d.aiStats.red)}${metric("Penaltı", d.humanStats.penalties, d.aiStats.penalties)}${metric("Pen. Kaçtı", d.humanStats.penaltiesMissed, d.aiStats.penaltiesMissed)}</article>
        <article class="manager-report-analysis"><h3>Taktik Rapor</h3><ul>${(report.lines || []).map(line => `<li>${esc(line)}</li>`).join("")}</ul><div>${esc(report.revealedStyleHint || "Rakip profili hakkında yeni veri oluşmadı.")}</div></article>
        <article class="manager-report-decisions"><h3>Kritik Kararlar</h3>${report.motivation ? `<div><time>0'</time><section><strong>${esc(report.motivation.label)}</strong><small>${esc(report.motivation.text)}</small></section><b>${report.motivation.outcome === "positive" ? "+" : report.motivation.outcome === "negative" ? "−" : "="}</b></div>` : ""}${fixture.decisions.length ? fixture.decisions.map(item => `<div><time>${item.minute}'</time><section><strong>${esc(item.chosenLabel)}</strong><small>${esc(item.outcome)}</small></section><b>${item.quality}</b></div>`).join("") : `<p>Bu maçta kritik karar oluşmadı.</p>`}</article>
      </div>
      ${renderTacticalImpact(engine)}
      <section class="manager-full-timeline"><h3>Tam Olay Akışı</h3>${[...engine.events].reverse().map(event=>`<article class="${event.type}"><time>${event.minute}'</time><b>${esc(event.type.replaceAll("-"," ").toUpperCase())}</b><span>${esc(event.text)}</span></article>`).join("")}</section>
      <div class="manager-report-actions"><button class="btn btn-ghost" data-match-action="share-card" data-fixture-id="${esc(fixture.id)}">Maç Kartını Paylaş</button><button class="btn btn-ghost" data-manager-action="set-tab" data-tab="${archiveMode?"fixtures":"universe"}">${archiveMode?"Fikstürlere Dön":"Puan Tablosunu Gör"}</button>${archiveMode?"":`<button class="btn btn-gold" data-match-action="continue-career">Sonraki Matchday</button>`}</div>
    </section>`;
  }

  function renderMatchDna(engine, d) {
    const pulse = engine.pulse || [];
    const avg = key => pulse.length ? Math.round(pulse.reduce((sum,row)=>sum+Number(row[key]||0),0)/pulse.length) : 0;
    const tempo = avg("tempo");
    const drama = clamp(Math.round((engine.events.filter(x=>["goal","penalty","penalty-goal","penalty-miss","red"].includes(x.type)).length*17)+(Math.abs(d.humanGoals-d.aiGoals)<=1?18:4)),0,100);
    const chaos = clamp(Math.round((d.humanStats.shots+d.aiStats.shots)*2.6+Math.abs(avg("momentum"))*.25),0,100);
    const tactical = clamp(45+(engine.aiAdaptations||0)*8+(engine.tacticalSnapshots?.length||0)*9,0,100);
    const quality = clamp(Math.round((d.humanStats.xg+d.aiStats.xg)*18),0,100);
    return `<section class="manager-match-dna"><header><span>MATCH DNA</span><strong>${tempo>75?"YÜKSEK TEMPO":chaos>68?"KAOTİK MÜCADELE":tactical>68?"TAKTİK SAVAŞ":drama>65?"DRAMATİK MAÇ":"DENGELİ MÜCADELE"}</strong></header><div>${[["Tempo",tempo],["Drama",drama],["Kaos",chaos],["Taktik",tactical],["Pozisyon",quality]].map(([label,value])=>`<article><span>${label}</span><i><b style="width:${value}%"></b></i><strong>${value}</strong></article>`).join("")}</div></section>`;
  }

  function renderFormationAnalysis(engine, d) {
    const coords=[[8,50],[24,16],[23,38],[23,62],[24,84],[45,28],[46,50],[45,72],[70,18],[78,50],[70,82]];
    const humanSquad=(d.humanIsHome?engine.squads?.home:engine.squads?.away)||[]; const rivalSquad=(d.humanIsHome?engine.squads?.away:engine.squads?.home)||[];
    const pitch=(squad,label,shift)=>`<article><header><b>${label}</b><span>${shift}</span></header><div class="manager-position-pitch"><i class="heat-zone" style="left:${shift.includes("3-")?48:38}%"></i>${coords.map((point,index)=>`<span style="left:${point[0]}%;top:${point[1]}%" title="${esc(squad[index]?.name||"")}">${index+1}<small>${squad[index]?.position||""}</small></span>`).join("")}</div></article>`;
    return `<section class="manager-formation-analysis"><div class="manager-section-head"><div><span>POSITIONAL INTELLIGENCE</span><h3>Isı Haritası & Ortalama Pozisyonlar</h3></div><small>Formasyon, saha hâkimiyeti ve maç temposundan üretilir.</small></div><div>${pitch(humanSquad,"SEN",engine.userPlan?.formation||"4-3-3")}${pitch(rivalSquad,"RAKİP",engine.aiPlan?.formation||"4-3-3")}</div></section>`;
  }

  function renderTacticalImpact(engine) {
    const rows = engine.tacticalSnapshots || [];
    if (!rows.length) return "";
    return `<section class="manager-tactical-impact"><h3>Taktik Değişikliği Etki Analizi</h3>${rows.map(item=>`<article><header><b>${item.minute}'</b><span>${esc(planItem("mentality",item.oldPlan.mentality).label)} → ${esc(planItem("mentality",item.newPlan.mentality).label)}</span></header><div>${[["Şut",item.before.shots,item.after?.shots],["xG",item.before.xg,item.after?.xg],["Top %",item.before.possession,item.after?.possession],["Tehdit",item.before.threat,item.after?.threat],["Fizik",item.before.fatigue,item.after?.fatigue]].map(([label,a,b])=>`<span><small>${label}</small><b>${round1(a)} → ${round1(b)}</b></span>`).join("")}</div></article>`).join("")}</section>`;
  }

  function render(career, human, rival, fixture) {
    if (!fixture || !rival) return `<section id="managerMatchMount" class="manager-match-shell"><div class="manager-match-empty"><h2>Oynanacak maç bulunamadı.</h2><p>Sezon ilerleme motoru sonraki build’de yeni sezon oluşturacaktır.</p></div></section>`;
    const engine = fixture.matchEngine;
    if (!engine) return renderSetup(career, human, rival, fixture);
    if (engine.status === "finished") return renderReport(career, human, rival, fixture);
    return renderLive(career, human, rival, fixture);
  }

  function refreshMount(career, fixture) {
    const mount = document.getElementById("managerMatchMount");
    if (!mount) return;
    const opponentId = fixture.homeId === career.humanActorId ? fixture.awayId : fixture.homeId;
    const human = actor(career, career.humanActorId);
    const rival = actor(career, opponentId);
    const html = fixture.matchEngine?.status === "finished" ? renderReport(career, human, rival, fixture) : renderLive(career, human, rival, fixture);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = html.trim();
    mount.replaceWith(wrapper.firstElementChild);
  }

  async function handleSubmit(event) {
    if (event.target.id !== "managerMatchPlanForm") return;
    event.preventDefault();
    const career = room()?.getActiveCareer?.();
    const fixtureId = event.target.dataset.fixtureId;
    const fixture = career?.fixtures?.find(item => item.id === fixtureId);
    if (!career || !fixture) return;
    const button = event.target.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Maç motoru hazırlanıyor...";
    try {
      const data = new FormData(event.target);
      const plan = selectedPlan(data);
      plan.formation = String(data.get("formation") || "4-3-3");
      plan.attackRole = String(data.get("attackRole") || "Dengeli");
      plan.midfieldRole = String(data.get("midfieldRole") || "Dengeli");
      plan.defenceRole = String(data.get("defenceRole") || "Dengeli");
      plan.pressAnswer = String(data.get("pressAnswer") || "confident");
      const engine = initializeMatch(career, fixture, plan, String(data.get("motivation") || "belief"));
      setBroadcast(engine, "kickoff", "neutral", "MAÇ BAŞLIYOR", `${getSides(career, fixture).homeTeam.clubName} — ${getSides(career, fixture).awayTeam.clubName}`);
      await room()?.persistCareer?.(career, { silent: true });
      refreshMount(career, fixture);
      window.setTimeout(() => { engine.broadcastEvent = null; refreshMount(career, fixture); startTimer(career, fixture); }, 2200);
      app()?.toast?.("Maç başladı. Kritik anlarda motor oyunu otomatik durduracak.", "success");
    } catch (error) {
      app()?.toast?.(error.message, "error");
      button.disabled = false;
      button.textContent = "Maçı Başlat";
    }
  }

  async function handleTacticalSubmit(event) {
    if (event.target.id !== "managerTacticalAdjustForm") return;
    event.preventDefault();
    const career = room()?.getActiveCareer?.();
    const fixture = career?.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
    if (!career || !fixture?.matchEngine) return;
    const engine = fixture.matchEngine;
    const oldPlan = JSON.stringify(engine.userPlan);
    const before = sideDisplay(career, fixture);
    engine.userPlan = selectedPlan(new FormData(event.target));
    engine.tacticalEditing = false;
    if (JSON.stringify(engine.userPlan) !== oldPlan) {
      engine.tacticalSnapshots ||= [];
      engine.tacticalSnapshots.push({ minute: Math.round(engine.minute), oldPlan: JSON.parse(oldPlan), newPlan: { ...engine.userPlan }, before: { shots: before.humanStats.shots, xg: before.humanStats.xg, possession: Math.round(before.humanPossession), threat: Math.round(before.humanThreat), fatigue: Math.round(before.humanFatigue) } });
      engine.decisionCooldownUntil = Math.max(engine.decisionCooldownUntil, engine.minute + 4);
      addEvent(engine, { type: "tactics", side: getSides(career, fixture).humanIsHome ? "home" : "away", text: "Teknik alan oyunu durdurdu ve yeni taktik planı sahaya iletti." });
    }
    room()?.saveLocal?.();
    refreshMount(career, fixture);
  }

  async function handleClick(event) {
    const target = event.target.closest("[data-match-action]");
    if (!target) return;
    const career = room()?.getActiveCareer?.();
    const fixture = target.dataset.fixtureId ? career?.fixtures?.find(item=>item.id===target.dataset.fixtureId) : career?.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : room()?.getNextHumanFixture?.(career);
    if (!career || !fixture) return;
    const action = target.dataset.matchAction;
    if (action === "pause") {
      stopTimer();
      refreshMount(career, fixture);
    }
    if (action === "resume") {
      if (fixture.matchEngine?.status === "live") startTimer(career, fixture);
      refreshMount(career, fixture);
    }
    if (action === "change-tactics") { fixture.matchEngine.tacticalEditing = true; refreshMount(career, fixture); }
    if (action === "cancel-tactics") { fixture.matchEngine.tacticalEditing = false; refreshMount(career, fixture); }
    if (action === "substitution") {
      const engine=fixture.matchEngine; engine.substitutions ||= []; if(engine.substitutions.length>=5){app()?.toast?.("Değişiklik hakkı doldu.","warning");return;}
      const type=target.dataset.subType; const effects=type==="pace"?{attack:9,control:0,defence:-2}:type==="control"?{attack:2,control:10,defence:2}:{attack:-2,control:2,defence:10}; const humanHome=getSides(career,fixture).humanIsHome; const key=humanHome?"homeModifiers":"awayModifiers";
      engine[key].push({until:91,...effects,risk:0,source:`sub-${type}`}); engine.substitutions.push({minute:Math.round(engine.minute),type}); addEvent(engine,{type:"substitution",side:humanHome?"home":"away",text:`Oyuncu değişikliği: ${type==="pace"?"hız ve hücum":type==="control"?"orta saha kontrolü":"savunma direnci"} güçlendirildi.`}); room()?.saveLocal?.(); refreshMount(career,fixture);
    }
    if (action === "decision") {
      if (runtime.busy) return;
      runtime.busy = true;
      resolveDecision(career, fixture, target.dataset.optionId);
      runtime.busy = false;
    }
    if (action === "continue-career") {
      stopTimer();
      career.activeMatchFixtureId = null;
      career.status = "team-draw-ready";
      await room()?.persistCareer?.(career, { silent: true }).catch(() => {});
      room()?.setActiveTab?.("overview");
    }
    if (action === "share-card") { const e=fixture.matchEngine,s=getSides(career,fixture),text=`FIFA 9 · ${s.homeTeam.clubName} ${e.scoreHome}-${e.scoreAway} ${s.awayTeam.clubName}\nMatchday ${fixture.matchday} · ${round1(e.stats.home.xg)}-${round1(e.stats.away.xg)} xG · ${e.stats.home.shots}-${e.stats.away.shots} şut`; if(navigator.share)navigator.share({title:"FIFA 9 Maç Kartı",text}).catch(()=>{});else navigator.clipboard?.writeText(text).then(()=>app()?.toast?.("Maç kartı panoya kopyalandı.","success")); }
  }

  document.addEventListener("submit", handleSubmit);
  document.addEventListener("submit", handleTacticalSubmit);
  document.addEventListener("click", handleClick);
  window.addEventListener("beforeunload", stopTimer);

  window.FIFA_MANAGER_MATCH = {
    version: VERSION,
    render,
    renderArchive: (career, fixture) => {
      if (!career || !fixture?.matchEngine) return `<section class="manager-match-empty"><h2>Bu maç için ayrıntılı telemetri bulunmuyor.</h2></section>`;
      const opponentId = fixture.homeId === career.humanActorId ? fixture.awayId : fixture.homeId;
      return renderReport(career, actor(career, career.humanActorId), actor(career, opponentId), fixture, true);
    },
    stop: stopTimer,
    resume: () => {
      const career = room()?.getActiveCareer?.();
      const fixture = career?.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
      if (career && fixture?.matchEngine?.status === "live") startTimer(career, fixture);
    }
  };
})();
