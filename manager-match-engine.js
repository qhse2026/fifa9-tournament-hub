(() => {
  "use strict";

  const VERSION = "43.3.0";
  const TICK_MS = 250;
  const PLAYBACK_SPEEDS = [1, 2, 4, 8, 16];
  const MAX_EVENTS = 180;
  const MAX_DECISIONS = 10;
  const MIN_DECISIONS = 5;
  const runtime = { timer: null, fixtureId: null, busy: false };

  const MOTIVATION_TALKS = [
    { id: "belief", label: "Kendinize İnanın", note: "Özgüven ve cesur başlangıç", tags: ["balance", "underdog"] },
    { id: "intensity", label: "İlk Düdükten İtibaren Baskı", note: "Yüksek enerji; fizik ve kart maliyeti olabilir", tags: ["press", "favorite"] },
    { id: "calm", label: "Sakin Kalın, Planımıza Güvenin", note: "Kontrol, sabır ve karar kalitesi", tags: ["control", "favorite"] },
    { id: "prove", label: "Onlara Kim Olduğumuzu Gösterin", note: "Duygusal, cesur ve yüksek varyanslı", tags: ["attack", "underdog"] },
    { id: "pressure-off", label: "Baskı Yok, Oyunun Keyfini Çıkarın", note: "Rahatlatabilir; odağı da düşürebilir", tags: ["balance", "freedom"] },
    { id: "discipline", label: "Duygularınızı Kontrol Edin", note: "Derbi ve gergin maçlarda disiplin odağı", tags: ["protect", "rivalry"] },
    { id: "revenge", label: "Geçen Maçı Unutmadık", note: "Rövanş duygusu; doğru anda ateşleyici", tags: ["attack", "revenge"] },
    { id: "underdog", label: "Bütün Baskı Onlarda", note: "Güçlü rakibe karşı özgür ve kompakt oyun", tags: ["counter", "underdog"] },
    { id: "favorite", label: "Kalitemizi Sahaya Yansıtın", note: "Favori takımın sakin üstünlük kurması için", tags: ["control", "favorite"] },
    { id: "reset", label: "Sonucu Değil, Bir Sonraki Anı Oynayın", note: "Kötü seriden sonra zihinsel sıfırlama", tags: ["control", "bounceback"] },
    { id: "cup", label: "Bu Gece Bir Kupa Gecesi", note: "Oruç Reis serilerinde büyük maç enerjisi", tags: ["attack", "cup"] },
    { id: "freedom", label: "Sorumluluğu Alın ve Cesur Oynayın", note: "Yaratıcılığı artırır; yapı kaybı yaratabilir", tags: ["attack", "freedom"] }
  ];

  const PRESS_ANSWERS = [
    { id:"confident", label:"Hazırız ve kazanmak için buradayız.", note:"Özgüven mesajı; favoriyken beklenti baskısı yaratabilir.", tags:["favorite","confidence"] },
    { id:"respect", label:"Rakibimize saygı duyuyoruz; cevabı sahada vereceğiz.", note:"Dengeli ve düşük riskli kamu mesajı.", tags:["balance"] },
    { id:"protect", label:"Baskıyı oyuncularımdan uzak tutuyorum.", note:"Zor fikstürde takımı korur; favoriyken pasif algılanabilir.", tags:["underdog","protect"] },
    { id:"challenge", label:"Oyuncularımdan daha fazlasını bekliyorum.", note:"Kötü seride reaksiyon yaratabilir veya baskıyı büyütebilir.", tags:["bounceback","intensity"] },
    { id:"tactical", label:"Maçı küçük taktik ayrıntılar belirleyecek.", note:"Oyun okuma ve plana güven mesajı.", tags:["control","reading"] },
    { id:"mindgames", label:"Rakibin bizi şaşırtacağını sanmıyorum.", note:"Rakibe psikolojik baskı; yanlışsa ters teper.", tags:["rivalry","risk"] },
    { id:"humble", label:"Favori yok; her top için mücadele edeceğiz.", note:"Beklentiyi dengeler ve disiplin sağlar.", tags:["balance","protect"] },
    { id:"promise", label:"Taraftarımıza cesur bir oyun borçluyuz.", note:"Atmosferi yükseltir; hücum baskısını artırır.", tags:["attack","rivalry"] }
  ];

  const FORMATION_LAYOUTS = {
    "4-3-3": [
      ["GK","GK",7,50],["RB","FB",23,14],["RCB","CB",20,38],["LCB","CB",20,62],["LB","FB",23,86],
      ["DM","DM",39,50],["RCM","CM",52,33],["LCM","CM",52,67],["RW","WING",74,18],["ST","ST",84,50],["LW","WING",74,82]
    ],
    "4-2-3-1": [
      ["GK","GK",7,50],["RB","FB",23,14],["RCB","CB",20,38],["LCB","CB",20,62],["LB","FB",23,86],
      ["RDM","DM",39,36],["LDM","DM",39,64],["RW","WING",64,17],["CAM","AM",61,50],["LW","WING",64,83],["ST","ST",83,50]
    ],
    "4-4-2": [
      ["GK","GK",7,50],["RB","FB",23,14],["RCB","CB",20,38],["LCB","CB",20,62],["LB","FB",23,86],
      ["RM","WING",48,16],["RCM","CM",45,39],["LCM","CM",45,61],["LM","WING",48,84],["RST","ST",78,38],["LST","ST",78,62]
    ],
    "3-5-2": [
      ["GK","GK",7,50],["RCB","CB",21,28],["CB","CB",18,50],["LCB","CB",21,72],["RWB","WB",43,10],
      ["DM","DM",39,50],["RCM","CM",52,34],["LCM","CM",52,66],["LWB","WB",43,90],["RST","ST",79,39],["LST","ST",79,61]
    ],
    "3-4-3": [
      ["GK","GK",7,50],["RCB","CB",21,28],["CB","CB",18,50],["LCB","CB",21,72],["RWB","WB",44,13],
      ["RCM","CM",47,39],["LCM","CM",47,61],["LWB","WB",44,87],["RW","WING",73,19],["ST","ST",83,50],["LW","WING",73,81]
    ],
    "5-3-2": [
      ["GK","GK",7,50],["RWB","WB",31,9],["RCB","CB",20,30],["CB","CB",17,50],["LCB","CB",20,70],["LWB","WB",31,91],
      ["DM","DM",39,50],["RCM","CM",51,34],["LCM","CM",51,66],["RST","ST",79,39],["LST","ST",79,61]
    ]
  };
  const FORMATIONS = Object.keys(FORMATION_LAYOUTS);
  const POSITION_ROLES = {
    GK: [
      { id:"shot-stopper", label:"Çizgi Kalecisi", note:"Refleks ve kale savunması", attack:-1,control:-1,defence:4,risk:-2,fatigue:-.1,tags:["protect"] },
      { id:"sweeper-keeper", label:"Süpürücü Kaleci", note:"Savunma arkasındaki alanı kapatır", attack:1,control:2,defence:1,risk:3,fatigue:.1,tags:["control"] },
      { id:"distributor", label:"Pasör Kaleci", note:"İlk pas kalitesini yükseltir", attack:1,control:3,defence:0,risk:1,fatigue:0,tags:["control"] }
    ],
    CB: [
      { id:"stopper", label:"Kesici Stoper", note:"Öne çıkar ve teması erken kurar", attack:0,control:-1,defence:3,risk:2,fatigue:.2,foulRisk:1,tags:["aggression"] },
      { id:"cover", label:"Süpürücü Stoper", note:"Arkaya koşuları ve derinliği korur", attack:-1,control:1,defence:4,risk:-2,fatigue:0,tags:["protect"] },
      { id:"ball-playing", label:"Top Kullanan Stoper", note:"Geriden pasla oyun kurar", attack:1,control:4,defence:0,risk:2,fatigue:.1,tags:["control"] }
    ],
    FB: [
      { id:"stay-back", label:"Geride Kalan Bek", note:"Önce savunma güvenliği", attack:-2,control:0,defence:4,risk:-2,fatigue:-.1,tags:["protect"] },
      { id:"overlap", label:"Bindiren Bek", note:"Kanatta ekstra koşu ve genişlik", attack:4,control:1,defence:-2,risk:3,fatigue:.7,tags:["wide","attack"] },
      { id:"inverted", label:"İçe Kat Eden Bek", note:"Merkezde pas istasyonu olur", attack:1,control:4,defence:1,risk:1,fatigue:.3,tags:["central","control"] }
    ],
    WB: [
      { id:"balanced-wingback", label:"Dengeli Kanat Bek", note:"İki yönlü koridor oyunu", attack:2,control:1,defence:1,risk:1,fatigue:.4,tags:["balance"] },
      { id:"attacking-wingback", label:"Hücumcu Kanat Bek", note:"Son çizgiye sürekli koşu", attack:5,control:1,defence:-3,risk:4,fatigue:.8,tags:["wide","attack"] },
      { id:"defensive-wingback", label:"Savunmacı Kanat Bek", note:"Beşli hattı korur", attack:-2,control:0,defence:4,risk:-2,fatigue:.1,tags:["protect"] }
    ],
    DM: [
      { id:"anchor", label:"Çapa", note:"Stoperlerin önünü kapatır", attack:-2,control:1,defence:5,risk:-2,fatigue:.1,tags:["protect"] },
      { id:"deep-playmaker", label:"Derin Oyun Kurucu", note:"İlk ve ikinci pası yönetir", attack:1,control:5,defence:1,risk:1,fatigue:.2,tags:["control"] },
      { id:"ball-winner", label:"Top Kazanan", note:"Temas ve ikinci topları hedefler", attack:0,control:1,defence:4,risk:3,fatigue:.6,foulRisk:2,tags:["press","aggression"] }
    ],
    CM: [
      { id:"box-to-box", label:"Box-to-Box", note:"İki ceza sahası arasında çalışır", attack:2,control:2,defence:2,risk:1,fatigue:.7,tags:["tempo"] },
      { id:"playmaker", label:"Oyun Kurucu", note:"Pas ritmini ve yönünü belirler", attack:2,control:5,defence:-1,risk:1,fatigue:.1,tags:["control"] },
      { id:"mezzala", label:"Mezzala", note:"Yarım alanlara hücum eder", attack:4,control:2,defence:-2,risk:3,fatigue:.4,tags:["attack","central"] }
    ],
    AM: [
      { id:"classic-ten", label:"Klasik 10", note:"Hatlar arasında oyun kurar", attack:2,control:5,defence:-3,risk:2,fatigue:0,tags:["control"] },
      { id:"shadow-striker", label:"Gölge Forvet", note:"Ceza sahasına geç koşu yapar", attack:5,control:0,defence:-3,risk:4,fatigue:.4,tags:["attack"] },
      { id:"free-role", label:"Serbest Rol", note:"Konum özgürlüğü ve yaratıcılık", attack:3,control:3,defence:-2,risk:3,fatigue:.2,tags:["freedom"] }
    ],
    WING: [
      { id:"touchline", label:"Çizgi Oyuncusu", note:"Genişlik ve orta tehdidi", attack:3,control:1,defence:-1,risk:1,fatigue:.3,tags:["wide"] },
      { id:"inverted-winger", label:"İçe Kat Eden Kanat", note:"Şut ve merkez kombinasyonu", attack:5,control:1,defence:-2,risk:3,fatigue:.4,tags:["attack","central"] },
      { id:"wide-playmaker", label:"Kanat Oyun Kurucu", note:"Dış koridordan pas üretir", attack:2,control:5,defence:-1,risk:2,fatigue:.2,tags:["control","wide"] }
    ],
    ST: [
      { id:"poacher", label:"Bitirici", note:"Ceza sahasında son dokunuş", attack:5,control:-2,defence:-2,risk:2,fatigue:0,tags:["attack"] },
      { id:"target", label:"Hedef Oyuncu", note:"Top saklar ve ikinci koşuları besler", attack:3,control:3,defence:1,risk:1,fatigue:.3,tags:["direct"] },
      { id:"false-nine", label:"Sahte Dokuz", note:"Geri gelerek merkezde üstünlük kurar", attack:2,control:5,defence:-1,risk:2,fatigue:.2,tags:["control","central"] },
      { id:"complete-forward", label:"Komple Forvet", note:"Koşu, bağlantı ve bitiricilik dengesi", attack:4,control:2,defence:0,risk:2,fatigue:.4,tags:["balance"] }
    ]
  };

  const PHASE_GROUPS = {
    inPossession: {
      label:"TOP BİZDEYKEN", defaultId:"positional",
      options:[
        {id:"patient",label:"Sabırlı Dolaşım",note:"Boşluğu bekle, pas bağlantısını koru",attack:-1,control:6,defence:2,risk:-3,fatigue:.88,tags:["control","patient"]},
        {id:"positional",label:"Pozisyon Oyunu",note:"Hatlar ve koridorlar arasında dengeli yerleş",attack:2,control:4,defence:1,risk:0,fatigue:1,tags:["control","balance"]},
        {id:"vertical",label:"Dikine İlerleme",note:"İlk fırsatta hat kıran pası ara",attack:6,control:-2,defence:-1,risk:4,fatigue:1.08,tags:["direct","attack"]},
        {id:"overload",label:"Beşli Hücum Hattı",note:"Son hatta sayıyı artır; geride alan bırak",attack:7,control:1,defence:-5,risk:7,fatigue:1.18,tags:["attack","overload"]}
      ]
    },
    outPossession: {
      label:"TOP RAKİPTEYKEN", defaultId:"mid-block",
      options:[
        {id:"low-block",label:"Kompakt Derin Blok",note:"Ceza sahası çevresini ve merkezi kapat",attack:-4,control:-3,defence:7,risk:-4,fatigue:.82,tags:["protect"]},
        {id:"mid-block",label:"Orta Blok",note:"Mesafeleri koru, merkezde karşıla",attack:0,control:2,defence:4,risk:-1,fatigue:.95,tags:["balance"]},
        {id:"high-press",label:"Önde Baskı",note:"Kurulumu boz; pres kırılırsa alan bırak",attack:3,control:4,defence:-4,risk:6,fatigue:1.28,foulRisk:2,tags:["press"]},
        {id:"man-oriented",label:"Adam Odaklı Baskı",note:"Pas istasyonlarını takip et; yapı esneyebilir",attack:1,control:0,defence:3,risk:5,fatigue:1.2,foulRisk:3,tags:["press","aggression"]}
      ]
    },
    winTransition: {
      label:"TOPU KAZANINCA", defaultId:"secure",
      options:[
        {id:"secure",label:"Önce Güvence",note:"İlk pası koru ve yeniden yerleş",attack:-1,control:6,defence:2,risk:-3,fatigue:.9,tags:["control"]},
        {id:"counter",label:"Hızlı Kontra",note:"Boş alana ilk üç pasla hücum et",attack:7,control:-3,defence:0,risk:5,fatigue:1.15,tags:["counter","tempo"]},
        {id:"wide-release",label:"Kanada Çık",note:"Topu baskının uzağındaki koridora taşı",attack:5,control:2,defence:-1,risk:2,fatigue:1.08,tags:["wide"]},
        {id:"direct-release",label:"Direkt Çıkış",note:"İlk baskı hattını tek pasla geç",attack:6,control:-5,defence:1,risk:6,fatigue:1.04,tags:["direct"]}
      ]
    },
    lossTransition: {
      label:"TOPU KAYBEDİNCE", defaultId:"regroup",
      options:[
        {id:"regroup",label:"Hızla Yerleş",note:"Koşu yolunu kapat ve blok halinde geri dön",attack:-2,control:1,defence:6,risk:-3,fatigue:1,tags:["protect"]},
        {id:"counterpress",label:"Beş Saniye Baskı",note:"Yakındaki oyuncularla topu hemen geri ara",attack:3,control:5,defence:-2,risk:5,fatigue:1.3,foulRisk:2,tags:["press","tempo"]},
        {id:"screen-centre",label:"Merkezi Perdele",note:"İlk olarak dikine pas kanalını kapat",attack:-1,control:2,defence:5,risk:-1,fatigue:1.02,tags:["central","protect"]},
        {id:"tactical-foul",label:"Geçişi Faulle Kes",note:"Kontrayı durdurur; kart riskini belirgin artırır",attack:-1,control:-1,defence:4,risk:4,fatigue:.96,foulRisk:10,tags:["aggression"]}
      ]
    }
  };

  const FORMATION_SHAPES = {
    "4-3-3": {inPossession:"3-2-5",outPossession:"4-1-4-1",winTransition:"2-3-5",lossTransition:"4-3-3"},
    "4-2-3-1": {inPossession:"3-2-4-1",outPossession:"4-4-1-1",winTransition:"3-2-5",lossTransition:"4-2-3-1"},
    "4-4-2": {inPossession:"3-1-4-2",outPossession:"4-4-2",winTransition:"2-4-4",lossTransition:"4-4-2"},
    "3-5-2": {inPossession:"3-2-5",outPossession:"5-3-2",winTransition:"3-3-4",lossTransition:"5-3-2"},
    "3-4-3": {inPossession:"3-2-5",outPossession:"5-4-1",winTransition:"3-2-5",lossTransition:"5-2-3"},
    "5-3-2": {inPossession:"3-2-5",outPossession:"5-3-2",winTransition:"3-3-4",lossTransition:"5-3-2"}
  };

  const AUTO_ORDERS = [
    {id:"trailing-60",label:"60'tan sonra gerideysek yüklen",note:"Hücum ve tempo artar; geçiş güvenliği azalır",minute:60,effects:{attack:8,control:1,defence:-5,risk:7,duration:31},tags:["attack"]},
    {id:"leading-70",label:"70'ten sonra öndeysek koru",note:"Blok ve top kontrolü güçlenir",minute:70,effects:{attack:-4,control:6,defence:8,risk:-5,duration:21},tags:["protect"]},
    {id:"fatigue-60",label:"Fizik %60 altına düşerse sakinleş",note:"Tempo ve pres maliyetini otomatik azaltır",minute:45,effects:{attack:-3,control:6,defence:3,risk:-4,fatigue:7,duration:18},tags:["control"]},
    {id:"opponent-red",label:"Rakip kırmızı görürse sahayı genişlet",note:"Sayısal üstünlükte alan ve pas açısı üretir",minute:1,effects:{attack:6,control:5,defence:-1,risk:2,duration:90},tags:["wide"]},
    {id:"own-red",label:"Biz kırmızı görürsek kompaktlaş",note:"Merkezi kapatır ve risk seviyesini düşürür",minute:1,effects:{attack:-6,control:1,defence:8,risk:-6,duration:90},tags:["protect"]},
    {id:"deadlock-75",label:"75'te skor eşitse kontrollü risk al",note:"Son bölümde ölçülü bir hücum dalgası",minute:75,effects:{attack:6,control:2,defence:-3,risk:4,duration:16},tags:["attack","balance"]}
  ];
  const DEFAULT_AUTO_ORDERS = ["trailing-60","leading-70","fatigue-60","own-red"];

  const room = () => window.FIFA_MANAGER_ROOM;
  const app = () => window.FIFA_APP_CONTEXT;
  const esc = value => app()?.escapeHTML
    ? app().escapeHTML(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const round1 = value => Math.round(Number(value || 0) * 10) / 10;
  const now = () => new Date().toISOString();
  const formatMatchClock = seconds => {
    const safe = Math.max(0, Math.min(5400, Math.floor(Number(seconds || 0))));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
  };

  const PLAN_GROUPS = {
    mentality: [
      { id: "controlled", label: "Kontrollü", note: "Oyunu sakinleştir, boşluğu bekle", attack: -2, control: 8, defence: 4, fatigue: 0.7, risk: -5, tags: ["control"] },
      { id: "balanced", label: "Dengeli", note: "Hatlar arası dengeyi koru", attack: 2, control: 2, defence: 2, fatigue: 1, risk: 0, tags: ["balance"] },
      { id: "aggressive", label: "Agresif", note: "Erken baskı; fizik, kart ve geçiş riski yüksek", attack: 6, control: -3, defence: -8, fatigue: 1.72, risk: 13, tags: ["attack", "aggression"] },
      { id: "counter", label: "Kontratak", note: "Alan bırak, geçiş anını cezalandır", attack: 4, control: -4, defence: 6, fatigue: 0.9, risk: 2, tags: ["counter"] },
      { id: "possession", label: "Topa Sahip Ol", note: "Tempo ve konum üstünlüğü kur", attack: 1, control: 10, defence: 1, fatigue: 1.1, risk: -2, tags: ["control", "patient"] }
    ],
    pressing: [
      { id: "low", label: "Derin Blok", note: "Alan daralt, arkayı koru", attack: -4, control: -4, defence: 10, fatigue: 0.65, risk: -5, tags: ["protect"] },
      { id: "mid", label: "Orta Blok", note: "Merkezde temas ve denge", attack: 0, control: 3, defence: 5, fatigue: 0.9, risk: -1, tags: ["balance"] },
      { id: "high", label: "Yüksek Pres", note: "Rakibi çıkışta boğ; pres kırılırsa büyük alan bırak", attack: 5, control: 3, defence: -7, fatigue: 1.78, risk: 10, tags: ["press", "aggression"] },
      { id: "counterpress", label: "Karşı Pres", note: "Top kaybında kısa ve sert baskı", attack: 4, control: 6, defence: -3, fatigue: 1.55, risk: 6, tags: ["press", "tempo"] }
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
      { id: "high", label: "Yüksek Tempo", note: "Rakibe düşünme süresi verme; hata ve fizik maliyeti", attack: 5, control: 0, defence: -4, fatigue: 1.62, risk: 8, tags: ["tempo", "attack"] }
    ],
    risk: [
      { id: "safe", label: "Güvenli", note: "Top kaybını ve açık alanı azalt", attack: -4, control: 4, defence: 6, fatigue: 0.9, risk: -8, tags: ["protect"] },
      { id: "measured", label: "Ölçülü", note: "Fırsat oluştuğunda risk al", attack: 2, control: 2, defence: 1, fatigue: 1, risk: 0, tags: ["balance"] },
      { id: "bold", label: "Cesur", note: "Daha fazla oyuncuyla hücuma çık; arkada alan bırak", attack: 7, control: -3, defence: -9, fatigue: 1.4, risk: 12, tags: ["attack"] }
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

  function visualRandom(engine) {
    if (!Number.isFinite(engine.motionRngState)) engine.motionRngState = (Number(engine.seed || engine.rngState || 1) ^ 0x9E3779B9) >>> 0;
    let t = engine.motionRngState += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function visualNormal(engine) {
    const u = Math.max(1e-9, visualRandom(engine));
    const v = Math.max(1e-9, visualRandom(engine));
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function formationSlots(formation = "4-3-3") {
    const id = Object.prototype.hasOwnProperty.call(FORMATION_LAYOUTS, formation) ? formation : "4-3-3";
    return FORMATION_LAYOUTS[id].map(([key, group, x, y], index) => ({ key, group, x, y, number: index + 1 }));
  }

  function roleDefinition(group, roleId) {
    const rows = POSITION_ROLES[group] || POSITION_ROLES.CM;
    return rows.find(item => item.id === roleId) || rows[0];
  }

  function normalizePositionRoles(formation, roles = {}) {
    return Object.fromEntries(formationSlots(formation).map(slot => [slot.key, roleDefinition(slot.group, roles?.[slot.key]).id]));
  }

  function phaseOption(group, id) {
    const definition = PHASE_GROUPS[group] || PHASE_GROUPS.inPossession;
    return definition.options.find(item => item.id === id) || definition.options.find(item => item.id === definition.defaultId) || definition.options[0];
  }

  function normalizePhaseBehaviors(behaviors = {}) {
    return Object.fromEntries(Object.keys(PHASE_GROUPS).map(group => [group, phaseOption(group, behaviors?.[group]).id]));
  }

  function readPhaseSetup(formData, plan) {
    plan.phaseBehaviors = Object.fromEntries(Object.keys(PHASE_GROUPS).map(group => [group, phaseOption(group, String(formData.get(`phase_${group}`) || "")).id]));
    return plan;
  }

  function readAutoOrders(formData, plan) {
    const selected = formData.getAll("autoOrder").map(String).filter(id => AUTO_ORDERS.some(item => item.id === id));
    plan.autoOrders = [...new Set(selected)].slice(0, 6);
    return plan;
  }

  function shapeFor(formation, phase) {
    return FORMATION_SHAPES[formation]?.[phase] || formation || "4-3-3";
  }

  function aiPhaseBehaviors(style = {}, personality = {}) {
    const risk=Number(personality.risk||style.risk||50),control=Number(personality.control||style.control||50),press=Number(style.pressing||personality.aggression||50),width=Number(style.width||50),direct=Number(style.directness||50),aggression=Number(personality.aggression||50);
    return {
      inPossession: risk>72?"overload":direct>64?"vertical":control>63?"patient":"positional",
      outPossession: press>70?"high-press":risk<38?"low-block":aggression>68?"man-oriented":"mid-block",
      winTransition: direct>67?"direct-release":risk>62?"counter":width>64?"wide-release":"secure",
      lossTransition: press>67?"counterpress":aggression>75?"tactical-foul":risk<42?"regroup":"screen-centre"
    };
  }

  function analyzeTacticalPlan(plan = {}) {
    const formation = FORMATIONS.includes(plan.formation) ? plan.formation : "4-3-3";
    const slots = formationSlots(formation);
    const roles = normalizePositionRoles(formation, plan.positionRoles);
    const phaseBehaviors = normalizePhaseBehaviors(plan.phaseBehaviors);
    const roleByKey = key => {
      const slot=slots.find(item=>item.key===key);return slot?roleDefinition(slot.group,roles[key]):null;
    };
    const allRoles = slots.map(slot => roleDefinition(slot.group, roles[slot.key]));
    const synergies=[], contradictions=[];
    let chemistry=58, transitionSecurity=68, width=50, centralControl=50, physicalLoad=35;
    const linkFlank=(backKeys,wingKeys,label)=>{
      const back=backKeys.map(roleByKey).find(Boolean),wing=wingKeys.map(roleByKey).find(Boolean);
      if(!back||!wing)return;
      const attackingBack=["overlap","attacking-wingback"].includes(back.id);
      if(attackingBack&&wing.id==="inverted-winger"){synergies.push(`${label}: bindirme + iç koridor dengesi`);chemistry+=9;width+=7;centralControl+=4;transitionSecurity-=4;}
      if(attackingBack&&wing.id==="touchline"){contradictions.push(`${label}: iki rol aynı dış koridoru kullanıyor`);chemistry-=7;width+=10;transitionSecurity-=6;}
      if(["stay-back","defensive-wingback"].includes(back.id)&&wing.id==="touchline"){synergies.push(`${label}: geride güvenlik + çizgi genişliği`);chemistry+=5;transitionSecurity+=5;width+=6;}
    };
    linkFlank(["RB","RWB"],["RW","RM"],"Sağ kanat");
    linkFlank(["LB","LWB"],["LW","LM"],"Sol kanat");
    const ids=allRoles.map(item=>item.id),attackRoles=allRoles.filter(item=>Number(item.attack||0)>=4).length,protectRoles=allRoles.filter(item=>Number(item.defence||0)>=4).length;
    const playmakers=ids.filter(id=>["distributor","ball-playing","deep-playmaker","playmaker","classic-ten","wide-playmaker","free-role","false-nine"].includes(id)).length;
    if(ids.includes("false-nine")&&ids.includes("shadow-striker")){synergies.push("Sahte 9, gölge forvetin koşu koridorunu açıyor");chemistry+=10;centralControl+=8;}
    if(ids.includes("target")&&ids.includes("touchline")){synergies.push("Hedef oyuncu çizgi servisleri için ceza sahası referansı oluşturuyor");chemistry+=7;width+=5;}
    if(ids.filter(id=>id==="ball-playing").length>=2&&ids.includes("distributor")){synergies.push("Pasör kaleci ve top kullanan stoperler temiz ilk hat kuruyor");chemistry+=8;centralControl+=6;}
    if(["3-5-2","3-4-3","5-3-2"].includes(formation)&&ids.includes("attacking-wingback")){synergies.push("Üç stoper, hücumcu kanat bekin çıkışını dengeliyor");chemistry+=6;width+=8;transitionSecurity+=2;}
    if(playmakers>=4){contradictions.push("Fazla oyun kurucu dikine koşu sayısını azaltabilir");chemistry-=5;centralControl+=10;}
    if(attackRoles>=5){contradictions.push("Çok sayıda hücumcu rol rest-defence yapısını zayıflatıyor");transitionSecurity-=attackRoles*4;physicalLoad+=12;}
    if(protectRoles>=5&&["aggressive","possession"].includes(plan.mentality)){contradictions.push("Ana mentalite ile korumacı rol dağılımı aynı mesajı vermiyor");chemistry-=6;}
    if(ids.filter(id=>["ball-winner","stopper"].includes(id)).length>=3){contradictions.push("Temas odaklı roller kart ve pozisyon kaybı riskini büyütüyor");transitionSecurity-=5;physicalLoad+=8;}
    if(plan.pressing==="low"&&phaseBehaviors.outPossession==="high-press"){contradictions.push("Pres yapısı derin, topsuz faz emri ise önde baskı istiyor");chemistry-=9;physicalLoad+=7;}
    if(plan.pressing==="high"&&phaseBehaviors.lossTransition==="regroup"){contradictions.push("Yüksek pres ile top kaybında geri çekilme birbirini kesiyor");chemistry-=7;}
    if(phaseBehaviors.lossTransition==="counterpress"){physicalLoad+=12;transitionSecurity+=3;}
    if(phaseBehaviors.inPossession==="overload"){transitionSecurity-=10;physicalLoad+=7;width+=4;}
    if(phaseBehaviors.outPossession==="low-block")transitionSecurity+=9;
    physicalLoad += Math.round(allRoles.reduce((sum,item)=>sum+Number(item.fatigue||0),0)*4);
    chemistry=clamp(Math.round(chemistry+synergies.length*2-contradictions.length),20,96);
    transitionSecurity=clamp(Math.round(transitionSecurity+protectRoles*2-attackRoles*1.5),18,95);
    width=clamp(Math.round(width),22,94);centralControl=clamp(Math.round(centralControl+playmakers*2),25,96);physicalLoad=clamp(Math.round(physicalLoad),20,96);
    return {formation,shapeIn:shapeFor(formation,"inPossession"),shapeOut:shapeFor(formation,"outPossession"),chemistry,transitionSecurity,width,centralControl,physicalLoad,synergies:synergies.slice(0,4),contradictions:contradictions.slice(0,4),grade:chemistry>=78&&transitionSecurity>=55?"UYUMLU":chemistry<48||transitionSecurity<38?"RİSKLİ":"DENGELİ"};
  }

  function readPositionSetup(formData, plan) {
    const formation = FORMATIONS.includes(String(formData.get("formation") || "")) ? String(formData.get("formation")) : "4-3-3";
    plan.formation = formation;
    plan.positionRoles = Object.fromEntries(formationSlots(formation).map(slot => {
      const selected = String(formData.get(`role_${slot.key}`) || "");
      return [slot.key, roleDefinition(slot.group, selected).id];
    }));
    return plan;
  }

  function aggregatePositionRoles(plan = {}) {
    const totals = { attack:0, control:0, defence:0, risk:0, fatigue:0, foulRisk:0, tags:[], labels:[] };
    const roles = normalizePositionRoles(plan.formation, plan.positionRoles);
    formationSlots(plan.formation).forEach(slot => {
      const role = roleDefinition(slot.group, roles[slot.key]);
      totals.attack += Number(role.attack || 0);
      totals.control += Number(role.control || 0);
      totals.defence += Number(role.defence || 0);
      totals.risk += Number(role.risk || 0);
      totals.fatigue += Number(role.fatigue || 0);
      totals.foulRisk += Number(role.foulRisk || 0);
      totals.tags.push(...(role.tags || []));
      totals.labels.push(`${slot.key}: ${role.label}`);
    });
    const scale = .32;
    totals.attack *= scale;
    totals.control *= scale;
    totals.defence *= scale;
    totals.risk *= scale;
    totals.foulRisk *= .65;
    totals.fatigue = 1 + totals.fatigue / 30;
    return totals;
  }

  function aiFormationFromStyle(style = {}) {
    if (Number(style.width || 50) > 67 && Number(style.risk || 50) > 60) return "3-4-3";
    if (Number(style.risk || 50) < 38) return "5-3-2";
    if (Number(style.directness || 50) > 67) return "4-4-2";
    if (Number(style.control || 50) > 65) return "4-2-3-1";
    if (Number(style.width || 50) > 60) return "3-5-2";
    return "4-3-3";
  }

  function aiPositionRoles(formation, style = {}) {
    const risk = Number(style.risk || 50), press = Number(style.pressing || 50), control = Number(style.control || 50), width = Number(style.width || 50);
    return Object.fromEntries(formationSlots(formation).map(slot => {
      const rows = POSITION_ROLES[slot.group] || POSITION_ROLES.CM;
      let index = 0;
      if (["FB","WB"].includes(slot.group)) index = risk > 66 || width > 68 ? 1 : risk < 38 ? 2 : 0;
      else if (slot.group === "CB") index = control > 64 ? 2 : risk < 42 ? 1 : 0;
      else if (slot.group === "DM") index = press > 66 ? 2 : control > 60 ? 1 : 0;
      else if (slot.group === "CM") index = control > 63 ? 1 : risk > 62 ? 2 : 0;
      else if (slot.group === "AM") index = risk > 65 ? 1 : control < 42 ? 2 : 0;
      else if (slot.group === "WING") index = width > 64 ? 0 : risk > 62 ? 1 : 2;
      else if (slot.group === "ST") index = Number(style.directness || 50) > 64 ? 1 : control > 62 ? 2 : risk > 68 ? 0 : 3;
      else if (slot.group === "GK") index = control > 62 ? 2 : press > 65 ? 1 : 0;
      return [slot.key, rows[Math.min(index, rows.length - 1)].id];
    }));
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
    const aggregate = { attack: 0, control: 0, defence: 0, fatigue: 1, risk: 0, foulRisk:0, transitionExposure:0, tags: [] };
    Object.entries(plan || {}).filter(([group]) => Object.prototype.hasOwnProperty.call(PLAN_GROUPS, group)).forEach(([group, id]) => {
      const item = planItem(group, id);
      aggregate.attack += item.attack || 0;
      aggregate.control += item.control || 0;
      aggregate.defence += item.defence || 0;
      aggregate.risk += item.risk || 0;
      aggregate.fatigue *= item.fatigue || 1;
      aggregate.tags.push(...(item.tags || []));
    });
    const positional = aggregatePositionRoles(plan);
    aggregate.attack += positional.attack;
    aggregate.control += positional.control;
    aggregate.defence += positional.defence;
    aggregate.risk += positional.risk;
    aggregate.fatigue *= positional.fatigue;
    aggregate.foulRisk += positional.foulRisk;
    aggregate.tags.push(...positional.tags);
    aggregate.positionRoleLabels = positional.labels;
    const tacticalAnalysis = analyzeTacticalPlan(plan);
    aggregate.control += (tacticalAnalysis.chemistry - 58) / 14 + (tacticalAnalysis.centralControl - 50) / 28;
    aggregate.defence += (tacticalAnalysis.transitionSecurity - 60) / 12;
    aggregate.attack += (tacticalAnalysis.width - 50) / 32;
    aggregate.risk += tacticalAnalysis.contradictions.length * 1.4;
    aggregate.fatigue *= 1 + Math.max(0, tacticalAnalysis.physicalLoad - 45) / 260;
    aggregate.tacticalAnalysis = tacticalAnalysis;
    const overload=[plan?.mentality==="aggressive",plan?.pressing==="high",plan?.tempo==="high",plan?.risk==="bold"].filter(Boolean).length;
    if(overload>=2){const excess=overload-1;aggregate.attack-=excess*2.2;aggregate.control-=excess*2;aggregate.defence-=excess*3.4;aggregate.fatigue*=1+excess*.14;aggregate.risk+=excess*5;aggregate.transitionExposure=excess*8;aggregate.foulRisk+=excess*7;}
    aggregate.attack=clamp(aggregate.attack,-18,24);aggregate.control=clamp(aggregate.control,-20,25);aggregate.defence=clamp(aggregate.defence,-28,25);aggregate.risk=clamp(aggregate.risk,-20,38);
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
    const iqFactor=clamp((Number(actorRow?.tacticalIQ||50)-50)/12,-2.5,3.8);
    return {
      attack: Number(team?.attack || 75) + powerFactor + iqFactor + planAggregate.attack,
      control: Number(team?.midfield || 75) + powerFactor * 0.85 + iqFactor + planAggregate.control,
      defence: Number(team?.defence || 75) + powerFactor * 0.8 + iqFactor*.7 + planAggregate.defence,
      risk: clamp(50 + planAggregate.risk, 20, 85),
      fatigueRate: clamp(planAggregate.fatigue, 0.55, 2.4),
      chanceCreation: Number(team?.attributes?.chanceCreation || team?.attack || 75),
      pressResistance: Number(team?.attributes?.pressResistance || team?.midfield || 75),
      counterThreat: Number(team?.attributes?.counterThreat || team?.attack || 75),
      defensiveShape: Number(team?.attributes?.defensiveShape || team?.defence || 75),
      tempo: Number(team?.attributes?.tempo || 70),
      variance: Number(team?.attributes?.variance || 30)
      ,foulRisk:Number(planAggregate.foulRisk||0),transitionExposure:Number(planAggregate.transitionExposure||0)
    };
  }

  function matchContextTags(career, fixture, sides) {
    const recent = (career.matchHistory || []).slice(0, 3);
    const meetings = (career.matchHistory || []).filter(item => item.opponentId === sides.aiActor?.id).length;
    const tags = [];
    if (Number(sides.humanTeam?.overall || 75) < Number(sides.aiTeam?.overall || 75)) tags.push("underdog"); else tags.push("favorite");
    if (recent.filter(item => item.result === "L").length >= 2) tags.push("bounceback");
    if (meetings >= 2) tags.push("rivalry");
    if (fixture.competition === "oruc") tags.push("cup");
    return tags;
  }

  function resolveMotivation(engine, talkId, sides, plan, career, fixture) {
    const talk = MOTIVATION_TALKS.find(item => item.id === talkId) || MOTIVATION_TALKS[0];
    const overallDiff = Number(sides.humanTeam?.overall || 75) - Number(sides.aiTeam?.overall || 75);
    const planTags = aggregatePlan(plan).tags;
    const contextTags = matchContextTags(career, fixture, sides);
    let fit = 0;
    if (talk.tags.includes("underdog") && overallDiff < 0) fit += 0.08;
    if (talk.tags.includes("favorite") && overallDiff >= 0) fit += 0.06;
    if (talk.tags.some(tag => planTags.includes(tag))) fit += 0.07;
    fit += talk.tags.filter(tag => contextTags.includes(tag)).length * .045;
    if (talk.tags.includes("favorite") && overallDiff < -3) fit -= .07;
    if (talk.tags.includes("underdog") && overallDiff > 3) fit -= .06;
    if (talk.tags.includes("revenge") && !contextTags.includes("rivalry")) fit -= .05;
    if (talk.tags.includes("cup") && fixture.competition !== "oruc") fit -= .08;
    const roll = random(engine);
    const positiveLimit = clamp(0.45 + fit, 0.31, 0.69);
    const neutralLimit = positiveLimit + clamp(.33 - Math.max(0, fit) * .35, .23, .36);
    const outcome = roll < positiveLimit ? "positive" : roll < neutralLimit ? "neutral" : "negative";
    const strength = outcome === "positive" ? randomRange(engine, 5, 12) : outcome === "negative" ? -randomRange(engine, 4, 9) : randomRange(engine, -1.5, 1.5);
    return {
      talkId: talk.id, label: talk.label, outcome, strength: round1(strength),
      contextFit: Math.round(fit * 100),
      text: outcome === "positive" ? "Konuşma doğru bağlama oturdu; başlangıç enerjisi ve inanç yükseldi." : outcome === "negative" ? "Mesaj maçın bağlamına oturmadı; oyuncularda baskı ve tereddüt oluştu." : "Takım mesajı aldı ancak belirgin bir psikolojik değişim oluşmadı."
    };
  }

  function resolvePressConference(engine, answerId, sides, plan, career, fixture) {
    const answer = PRESS_ANSWERS.find(item => item.id === answerId) || PRESS_ANSWERS[0];
    const context = matchContextTags(career, fixture, sides);
    const planTags = aggregatePlan(plan).tags;
    let fit = answer.tags.filter(tag => context.includes(tag) || planTags.includes(tag)).length * .055;
    if (answer.tags.includes("risk")) fit += Number(career.managerAttributes?.bigMatch || 50) > 65 ? .04 : -.035;
    if (answer.tags.includes("reading")) fit += (Number(career.managerAttributes?.gameReading || 50) - 50) / 500;
    const roll = random(engine);
    const positiveLimit = clamp(.43 + fit, .31, .64);
    const outcome = roll < positiveLimit ? "positive" : roll < positiveLimit + .39 ? "neutral" : "negative";
    const strength = outcome === "positive" ? randomRange(engine, 2.5, 6.5) : outcome === "negative" ? -randomRange(engine, 2, 5) : randomRange(engine, -.8, .8);
    return {
      answerId: answer.id, label: answer.label, outcome, strength: round1(strength),
      text: outcome === "positive" ? "Mesaj soyunma odasındaki baskıyı doğru yönetti." : outcome === "negative" ? "Açıklama beklentiyi artırdı ve başlangıç baskısı yarattı." : "Açıklama maç psikolojisini belirgin biçimde değiştirmedi."
    };
  }

  function planSignature(plan={}) {
    const phases=normalizePhaseBehaviors(plan.phaseBehaviors);
    const parts=[plan.formation,plan.mentality,plan.buildUp,plan.pressing,plan.tempo,plan.risk,phases.inPossession,phases.outPossession,phases.winTransition,phases.lossTransition].filter(Boolean);
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

  function fogTarget(aiPlan,persona={}){if(aiPlan.pressing==="high"||Number(persona.aggression||0)>72)return "press";if(aiPlan.mentality==="counter")return "counter";if(["controlled","possession"].includes(aiPlan.mentality))return "control";return "chaos";}

  function initializeMatch(career, fixture, plan, motivationId) {
    const sides = getSides(career, fixture);
    if (!sides.homeTeam || !sides.awayTeam) throw new Error("Maç başlamadan önce takım kurası tamamlanmalıdır.");
    plan.formation = FORMATIONS.includes(plan.formation) ? plan.formation : "4-3-3";
    plan.positionRoles = normalizePositionRoles(plan.formation, plan.positionRoles);
    plan.phaseBehaviors = normalizePhaseBehaviors(plan.phaseBehaviors);
    plan.autoOrders = Array.isArray(plan.autoOrders) ? plan.autoOrders.filter(id=>AUTO_ORDERS.some(item=>item.id===id)).slice(0,6) : [...DEFAULT_AUTO_ORDERS];
    const aiStyle = sides.aiActor.styleSeed || {};
    const aiMemory=sides.aiActor.managerMemory||{};
    const aiPlan = counterPlanFromMemory(aiPlanFromStyle(aiStyle),aiMemory);
    const aiPersonality=sides.aiActor.personality||{attack:50,control:50,aggression:50,risk:50,adaptation:50,patience:50,bigMatch:50,unpredictability:45,traits:["DENGELİ STRATEJİST"]};
    const aiPsychology=sides.aiActor.psychology||{confidence:50,pressure:35,composure:55,streak:0,mood:"DENGELİ"};
    if(aiPersonality.aggression>72){aiPlan.pressing="high";if(aiPersonality.risk>68)aiPlan.mentality="aggressive";}
    if(aiPersonality.control>72&&aiPersonality.patience>60){aiPlan.mentality="possession";aiPlan.buildUp="patient";}
    if(aiPsychology.confidence>72&&aiPsychology.streak>=2)aiPlan.risk=aiPersonality.risk>60?"bold":"measured";
    if(aiPsychology.pressure>70&&aiPsychology.composure<52){aiPlan.tempo="high";aiPlan.mentality=aiPersonality.patience>65?"controlled":"aggressive";}
    const seed = hashString(`${fixture.id}|${fixture.teamDraw?.id || "draw"}|${Date.now()}`);
    aiPlan.formation = aiFormationFromStyle(aiStyle);
    aiPlan.positionRoles = aiPositionRoles(aiPlan.formation, aiStyle);
    aiPlan.phaseBehaviors = aiPhaseBehaviors(aiStyle, aiPersonality);
    aiPlan.autoOrders = Number(aiPersonality.risk||50)>65?["trailing-60","deadlock-75","fatigue-60","own-red"]:["leading-70","fatigue-60","opponent-red","own-red"];
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
      clockSeconds: 0,
      lastSimulatedMinute: 0,
      playbackSpeed: 8,
      motionRngState: (seed ^ 0x9E3779B9) >>> 0,
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
      humanSide: sides.humanIsHome?"home":"away",
      userPlan: plan,
      aiPlan,
      aiStyle,
      aiPersonality,
      aiPsychology:{...aiPsychology},
      aiMemoryUsed: Number(aiMemory.meetings||0)>0,
      aiMemorySnapshot: { meetings:Number(aiMemory.meetings||0), lastPlan:aiMemory.lastPlan||null, confidence:Number(aiMemory.confidence||50) },
      aiAdaptations: 0,
      tacticalDeceptions:0,
      nextDeceptionMinute:14+(seed%13),
      nextDecisionMinute: 9 + Math.floor((seed % 7)),
      decisionCooldownUntil: 0,
      decisionCount: 0,
      currentDecision: null,
      lastGoal: null,
      lastChanceSide: null,
      lastChanceMinute: -5,
      matchVolatility: clamp(0.82 + random(enginePlaceholder(seed)) * 0.52, 0.82, 1.34),
      broadcastEvent: null,
      eventStreamVisible: false,
      phaseState: {possession:"home",previousPossession:"home",transitionSide:null,transitionUntil:0,home:"inPossession",away:"outPossession"},
      phaseUsage: {home:{inPossession:0,outPossession:0,winTransition:0,lossTransition:0},away:{inPossession:0,outPossession:0,winTransition:0,lossTransition:0}},
      triggeredOrders: {human:[],ai:[]},
      tacticalIntelligenceStart: {human:analyzeTacticalPlan(plan),ai:analyzeTacticalPlan(aiPlan)},
      pulse: [],
      possessionChains: [],
      shotMap: [],
      zoneEntries: { home:{left:0,centre:0,right:0},away:{left:0,centre:0,right:0} },
      tacticalSnapshots: [],
      managerBattle: [],
      turningPoints: [],
      events: [{ minute: 0, type: "kickoff", side: "neutral", text: "Hakem düdüğü çaldı. Taktik planlar sahada." }],
      commentary: [{ second:0, minute:0, clock:"00:00", side:"neutral", type:"kickoff", text:"Hakem düdüğü çaldı; iki takım kendi oyun planıyla maça başladı." }],
      stats: {
        home: { shots: 0, onTarget: 0, offTarget: 0, blocked: 0, xg: 0, attacks: 0, dangerous: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, passAccuracy: 0, penalties: 0, penaltiesScored: 0, penaltiesMissed: 0, saves:0,offsides:0,woodwork:0,freeKicks:0,varOverturns:0 },
        away: { shots: 0, onTarget: 0, offTarget: 0, blocked: 0, xg: 0, attacks: 0, dangerous: 0, possession: 50, corners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, passAccuracy: 0, penalties: 0, penaltiesScored: 0, penaltiesMissed: 0, saves:0,offsides:0,woodwork:0,freeKicks:0,varOverturns:0 }
      },
      report: null
    };
    fixture.matchEngine.motivation = resolveMotivation(fixture.matchEngine, motivationId, sides, plan, career, fixture);
    fixture.matchEngine.pressConference = resolvePressConference(fixture.matchEngine, plan.pressAnswer, sides, plan, career, fixture);
    fixture.matchEngine.squads = {
      home: buildVirtualSquad(fixture.matchEngine, sides.homeTeam, sides.humanIsHome ? plan.formation : aiPlan.formation, sides.humanIsHome ? plan.positionRoles : aiPlan.positionRoles),
      away: buildVirtualSquad(fixture.matchEngine, sides.awayTeam, sides.humanIsHome ? aiPlan.formation : plan.formation, sides.humanIsHome ? aiPlan.positionRoles : plan.positionRoles)
    };
    initialize2DState(fixture.matchEngine);
    fixture.matchEngine.substitutions = [];
    const humanMods = sides.humanIsHome ? "homeModifiers" : "awayModifiers";
    const motivation = fixture.matchEngine.motivation;
    fixture.matchEngine[humanMods].push({ until: 22, attack: motivation.strength, control: motivation.strength * .55, defence: motivation.strength * .35, risk: motivation.outcome === "negative" ? 4 : 0, source: "motivation" });
    const press = fixture.matchEngine.pressConference;
    fixture.matchEngine[humanMods].push({ until: 16, attack: press.strength * .45, control: press.strength, defence: press.strength * .35, risk: press.outcome === "negative" ? 3 : 0, source: "press-conference" });
    const diagnosis=plan.diagnosis||"control",actual=fogTarget(aiPlan,aiPersonality),reading=Number(career.managerAttributes?.gameReading||50),signalAccuracy=clamp(.48+reading/230-(aiPersonality.unpredictability||40)/420,.42,.82),readCorrect=diagnosis===actual&&random(fixture.matchEngine)<signalAccuracy;
    fixture.matchEngine.fogOfWar={diagnosis,actual,readCorrect,signalAccuracy:Math.round(signalAccuracy*100),revealed:false};
    fixture.matchEngine[humanMods].push({until:18,attack:readCorrect?2:-1,control:readCorrect?4:-3,defence:readCorrect?3:-2,risk:readCorrect?-1:2,source:"fog-read"});
    fixture.matchEngine.events.unshift({minute:0,type:"fog",side:sides.humanIsHome?"home":"away",text:readCorrect?"İlk taktik okuma saha sinyalleriyle uyumlu görünüyor.":"Rakibin ilk sinyalleri seçilen teşhisle çelişiyor olabilir."});
    fixture.matchEngine.events.unshift({ minute: 0, type: `motivation-${motivation.outcome}`, side: sides.humanIsHome ? "home" : "away", text: `${motivation.label}: ${motivation.text}` });
    fixture.matchEngine.events.unshift({ minute: 0, type: `press-${press.outcome}`, side: sides.humanIsHome ? "home" : "away", text: `Basın: “${press.label}” ${press.text}` });
    if (fixture.matchEngine.aiMemoryUsed) fixture.matchEngine.events.unshift({ minute:0,type:"intelligence",side:sides.humanIsHome?"away":"home",text:`Rakip teknik ekip önceki ${aiMemory.meetings} karşılaşmadan ürettiği karşı planla başladı.` });
    career.activeMatchFixtureId = fixture.id;
    career.status = "match-live";
    room()?.saveLocal?.();
    return fixture.matchEngine;
  }

  function enginePlaceholder(seed) { return { rngState: seed }; }

  function buildVirtualSquad(engine, team, formation, positionRoles = {}) {
    const starters = formationSlots(formation).map((slot, index) => {
      const role = roleDefinition(slot.group, positionRoles?.[slot.key]);
      return { id:`${team.id}-p${index+1}`, name:`${team.clubName.split(" ")[0]} ${index+1}`, position:slot.key, roleGroup:slot.group, roleId:role.id, roleLabel:role.label, rating:clamp(Number(team.overall||75)+Math.round(randomRange(engine,-4,4)),65,94), form:Math.round(randomRange(engine,45,85)), fatigue:100, status:"XI", formation };
    });
    const bench = Array.from({ length:5 }, (_, index) => ({ id:`${team.id}-sub${index+1}`, name:`${team.clubName.split(" ")[0]} Y${index+1}`, position:"SUB", rating:clamp(Number(team.overall||75)+Math.round(randomRange(engine,-5,3)),64,92), form:Math.round(randomRange(engine,42,82)), fatigue:100, status:"BENCH", formation }));
    return [...starters, ...bench];
  }

  function initialize2DState(engine) {
    const build = (side, squad) => formationSlots(squad?.[0]?.formation || "4-3-3").map((slot, index) => ({
      id: squad?.[index]?.id || `${side}-${index}`,
      number: index + 1,
      key: slot.key,
      role: squad?.[index]?.roleLabel || roleDefinition(slot.group).label,
      x: side === "home" ? slot.x : 100 - slot.x,
      y: slot.y,
      baseX: side === "home" ? slot.x : 100 - slot.x,
      baseY: slot.y,
      targetX: side === "home" ? slot.x : 100 - slot.x,
      targetY: slot.y
    }));
    engine.visual2D = {
      phase:"BAŞLAMA VURUŞU",
      possession:"neutral",
      ball:{ x:50, y:50 },
      trail:[{ x:50, y:50 }],
      home:build("home", engine.squads?.home),
      away:build("away", engine.squads?.away),
      motion:{
        sequence:0,
        possession:"home",
        carrierIndex:5,
        action:"kickoff",
        actionStartSecond:Number(engine.clockSeconds||0),
        actionEndSecond:Number(engine.clockSeconds||0)+3,
        nextActionSecond:Number(engine.clockSeconds||0),
        ballFrom:{x:50,y:50},
        ballTo:{x:50,y:50}
      }
    };
    return engine.visual2D;
  }

  function pushCommentary(engine, text, side="neutral", type="flow") {
    if (!text) return null;
    const second=Math.max(0,Math.min(5400,Math.floor(Number(engine.clockSeconds ?? engine.minute*60 ?? 0))));
    engine.commentary=Array.isArray(engine.commentary)?engine.commentary:[];
    const last=engine.commentary.at(-1);
    if(last?.text===text&&second-last.second<3)return last;
    const row={second,minute:Math.floor(second/60),clock:formatMatchClock(second),side,type,text};
    engine.commentary.push(row);
    engine.commentary=engine.commentary.slice(-36);
    return row;
  }

  function motionNarration(career,fixture,side,from,to,action){
    const sides=getSides(career,fixture),team=side==="home"?sides.homeTeam:sides.awayTeam,name=team?.clubName||"Takım";
    if(action==="switch")return `${name} oyunun yönünü ${from.key} üzerinden ters kanada çevirdi.`;
    if(action==="carry")return `${from.key} topla birlikte ilerliyor; ${name} rakip bloğu üzerine çekiyor.`;
    if(action==="vertical")return `${name}, ${from.key} ile ${to.key} arasındaki dikine bağlantıyı buldu.`;
    if(action==="reset")return `${name} acele etmiyor; ${from.key} topu güvenli pasla yeniden dolaşıma soktu.`;
    return `${from.key} topu ${to.key} bölgesine aktardı; ${name} yerleşimini öne taşıyor.`;
  }

  function setNextMotionTarget(career,fixture){
    const engine=fixture.matchEngine,state=engine.visual2D||initialize2DState(engine),motion=state.motion||{},nowSecond=Number(engine.clockSeconds||0);
    const possession=engine.phaseState?.possession||motion.possession||"home",players=state[possession]||[];
    if(!players.length)return;
    const previousSide=motion.possession,currentIndex=clamp(Number(motion.carrierIndex||0),0,players.length-1),from=players[currentIndex]||players[0],direction=possession==="home"?1:-1;
    const forward=players.filter((player,index)=>index!==currentIndex&&direction*(player.x-from.x)>-7&&Math.abs(player.x-from.x)<39&&Math.abs(player.y-from.y)<48);
    const fallback=players.filter((_,index)=>index!==currentIndex),pool=forward.length?forward:fallback;
    let to=pool[Math.floor(visualRandom(engine)*pool.length)]||from;
    const progress=direction*(to.x-from.x),lateral=Math.abs(to.y-from.y);
    let action=progress>15?"vertical":progress<-7?"reset":lateral>34?"switch":visualRandom(engine)<.2?"carry":"pass";
    if(action==="carry")to=from;
    const ballFrom={x:Number(state.ball?.x||from.x),y:Number(state.ball?.y||from.y)};
    let ballTo={x:clamp(Number(to.targetX||to.x)+direction*(action==="carry"?5:0),4,96),y:clamp(Number(to.targetY||to.y)+visualNormal(engine)*1.1,5,95)};
    const distance=Math.hypot(ballTo.x-ballFrom.x,ballTo.y-ballFrom.y),duration=clamp(2.2+distance/13+visualRandom(engine)*1.4,2.2,6.2);
    motion.sequence=Number(motion.sequence||0)+1;motion.possession=possession;motion.carrierIndex=Math.max(0,players.indexOf(to));motion.action=action;motion.actionStartSecond=nowSecond;motion.actionEndSecond=nowSecond+duration;motion.nextActionSecond=motion.actionEndSecond;motion.ballFrom=ballFrom;motion.ballTo=ballTo;state.motion=motion;
    ["home","away"].forEach(side=>{
      (state[side]||[]).forEach(player=>{
        const anchor=phasePosition(engine,player,side,ballTo.x,ballTo.y),owns=side===possession,pull=owns ? .085 : .055;
        player.targetX=clamp(anchor.x+(ballTo.x-anchor.x)*pull+visualNormal(engine)*.7,4,96);
        player.targetY=clamp(anchor.y+(ballTo.y-anchor.y)*pull+visualNormal(engine)*.8,5,95);
      });
    });
    to.targetX=clamp(ballTo.x-direction*.8,4,96);to.targetY=ballTo.y;
    state.trail.push(ballFrom);state.trail=state.trail.slice(-9);
    if(previousSide&&previousSide!==possession)pushCommentary(engine,`${possession==="home"?(getSides(career,fixture).homeTeam?.clubName||"Ev sahibi"):(getSides(career,fixture).awayTeam?.clubName||"Deplasman")} topu kazandı ve hızla yerleşiyor.`,possession,"turnover");
    else pushCommentary(engine,motionNarration(career,fixture,possession,from,to,action),possession,action);
  }

  function advanceLiveMotion(career,fixture,deltaSeconds){
    const engine=fixture.matchEngine,state=engine.visual2D||initialize2DState(engine),motion=state.motion||{};
    if(!Number.isFinite(Number(motion.nextActionSecond))||Number(engine.clockSeconds||0)>=Number(motion.nextActionSecond))setNextMotionTarget(career,fixture);
    const active=state.motion||motion,start=Number(active.actionStartSecond||0),end=Math.max(start+.2,Number(active.actionEndSecond||start+3)),raw=clamp((Number(engine.clockSeconds||0)-start)/(end-start),0,1),ease=raw<.5?2*raw*raw:1-Math.pow(-2*raw+2,2)/2;
    const from=active.ballFrom||state.ball||{x:50,y:50},to=active.ballTo||from;
    state.ball={x:round1(from.x+(to.x-from.x)*ease),y:round1(from.y+(to.y-from.y)*ease)};
    const follow=clamp(.08+Number(deltaSeconds||0)*.055,.09,.48);
    ["home","away"].forEach(side=>(state[side]||[]).forEach(player=>{player.x=round1(Number(player.x)+(Number(player.targetX??player.x)-Number(player.x))*follow);player.y=round1(Number(player.y)+(Number(player.targetY??player.y)-Number(player.y))*follow);}));
    state.possession=active.possession||engine.phaseState?.possession||"home";
    const labels={inPossession:"YERLEŞİK HÜCUM",outPossession:"SAVUNMA BLOĞU",winTransition:"HIZLI GEÇİŞ",lossTransition:"TOP KAYBI REAKSİYONU"};
    state.phase=labels[engine.phaseState?.[state.possession]]||"AKAN OYUN";
    return state;
  }

  function phasePosition(engine, player, side, ballX, ballY) {
    const squad=(side==="home"?engine.squads?.home:engine.squads?.away)||[],squadPlayer=squad.find(item=>item.id===player.id)||{},group=squadPlayer.roleGroup||"CM",role=roleDefinition(group,squadPlayer.roleId),plan=side===(engine.humanSide||"home")?engine.userPlan:engine.aiPlan;
    const phase=activePhase(engine,side),behavior=phaseOption(phase,normalizePhaseBehaviors(plan?.phaseBehaviors)[phase]);
    let x=side==="home"?player.baseX:100-player.baseX,y=player.baseY;
    const shifts={inPossession:{GK:0,CB:2,FB:5,WB:8,DM:4,CM:7,AM:9,WING:7,ST:3},outPossession:{GK:0,CB:-1,FB:-3,WB:-9,DM:-4,CM:-8,AM:-11,WING:-14,ST:-8},winTransition:{GK:0,CB:2,FB:5,WB:9,DM:5,CM:10,AM:12,WING:13,ST:9},lossTransition:{GK:0,CB:-2,FB:-5,WB:-8,DM:-4,CM:-5,AM:-7,WING:-9,ST:-7}};
    x+=Number(shifts[phase]?.[group]||0);
    if(["overlap","attacking-wingback"].includes(role.id)&&["inPossession","winTransition"].includes(phase))x+=7;
    if(["stay-back","defensive-wingback"].includes(role.id))x-=4;
    if(role.id==="shadow-striker"&&phase!=="outPossession")x+=6;
    if(role.id==="false-nine")x-=7;
    if(role.id==="poacher"&&phase!=="outPossession")x+=3;
    if(["inverted","inverted-winger"].includes(role.id))y=50+(y-50)*.68;
    if(["touchline","overlap","attacking-wingback"].includes(role.id)&&phase==="inPossession")y=50+(y-50)*1.08;
    if(phase==="outPossession"){y=50+(y-50)*.82;if(behavior.id==="low-block")x-=6;if(behavior.id==="high-press")x+=7;if(behavior.id==="man-oriented")y+=(ballY-y)*.08;}
    if(phase==="inPossession"){if(behavior.id==="overload"&&["CM","AM","WING","ST","FB","WB"].includes(group))x+=4;if(behavior.id==="patient"&&["WING","ST","AM"].includes(group))x-=3;}
    if(phase==="winTransition"){if(behavior.id==="counter"||behavior.id==="direct-release")x+=4;if(behavior.id==="wide-release")y=50+(y-50)*1.08;}
    if(phase==="lossTransition"){if(behavior.id==="counterpress"){const canonicalBallX=side==="home"?ballX:100-ballX;x+=(canonicalBallX-x)*.14;y+=(ballY-y)*.14;}if(behavior.id==="screen-centre")y=50+(y-50)*.72;}
    const canonicalBallX=side==="home"?ballX:100-ballX,pull=phase==="winTransition"?.1:phase==="inPossession"?.075:.045;x+=(canonicalBallX-x)*pull;
    x=clamp(x+visualNormal(engine)*.45,4,96);y=clamp(y+visualNormal(engine)*.6,5,95);
    return {x:side==="home"?x:100-x,y,phase,shape:shapeFor(plan?.formation,phase),behavior:behavior.label};
  }

  function update2DState(career, fixture) {
    const engine = fixture.matchEngine;
    engine.humanSide ||= fixture.homeId===career.humanActorId?"home":"away";
    const state = engine.visual2D || initialize2DState(engine);
    const chance = (engine.shotMap || []).find(item => item.minute === Math.round(engine.minute));
    const recentEvent = (engine.events || []).find(item => item.minute === Math.round(engine.minute));
    const possession = chance?.side || engine.phaseState?.possession || (engine.zone>=0?"home":"away");
    let ballX = clamp(50 + engine.zone * 17 + visualNormal(engine) * 4.2, 6, 94);
    let ballY = clamp(50 + visualNormal(engine) * 21, 8, 92);
    if (chance) {
      ballX = chance.side === "home" ? clamp(Number(chance.x || 82), 72, 95) : clamp(100 - Number(chance.x || 82), 5, 28);
      ballY = clamp(Number(chance.y || 50), 12, 88);
    }
    const lastChain = (engine.possessionChains || []).at(-1);
    if (!chance && lastChain?.minute === Math.round(engine.minute)) ballY = lastChain.lane === "left" ? 76 : lastChain.lane === "right" ? 24 : 50;
    const labels={inPossession:"YERLEŞİK HÜCUM",outPossession:"SAVUNMA BLOĞU",winTransition:"TOP KAZANMA GEÇİŞİ",lossTransition:"TOP KAYBI REAKSİYONU"};
    const displayPhase = recentEvent?.type === "goal" || recentEvent?.type === "penalty-goal" ? "GOL" : chance ? "ŞUT ANI" : labels[engine.phaseState?.[possession]]||"YERLEŞİK OYUN";
    ["home","away"].forEach(side=>state[side].forEach(player=>{const next=phasePosition(engine,player,side,ballX,ballY);player.targetX=next.x;player.targetY=next.y;player.phase=next.phase;player.shape=next.shape;player.behavior=next.behavior;}));
    state.possession = possession;
    state.phase = displayPhase;
    state.shapes={home:shapeFor(engine.squads?.home?.[0]?.formation,engine.phaseState?.home),away:shapeFor(engine.squads?.away?.[0]?.formation,engine.phaseState?.away)};
    state.motion ||= {};
    if(chance){state.motion.ballFrom={...state.ball};state.motion.ballTo={x:round1(ballX),y:round1(ballY)};state.motion.actionStartSecond=Number(engine.clockSeconds||0);state.motion.actionEndSecond=Number(engine.clockSeconds||0)+2.2;state.motion.nextActionSecond=state.motion.actionEndSecond;state.motion.possession=chance.side;}
    return state;
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

  function activePhase(engine, side) {
    return engine.phaseState?.[side] || (engine.phaseState?.possession === side ? "inPossession" : "outPossession");
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
    const phase = activePhase(engine, side);
    const phaseEffect = phaseOption(phase, normalizePhaseBehaviors(plan.phaseBehaviors)[phase]);
    const fatigue = isHome ? engine.homeFatigue : engine.awayFatigue;
    const modsKey = isHome ? "homeModifiers" : "awayModifiers";
    const { active, totals } = modifierTotals(engine[modsKey], engine.minute);
    engine[modsKey] = active;
    const fatigueGap=Math.max(0,78-fatigue);
    const fatiguePenalty = fatigueGap * 0.24 + Math.max(0,60-fatigue)*.3;
    const sideMomentum = isHome ? engine.momentum : -engine.momentum;
    return {
      ...base,
      attack: base.attack + totals.attack + Number(phaseEffect.attack||0) + sideMomentum * 0.06 - fatiguePenalty,
      control: base.control + totals.control + Number(phaseEffect.control||0) + sideMomentum * 0.05 - fatiguePenalty * 0.75,
      defence: base.defence + totals.defence + Number(phaseEffect.defence||0) + sideMomentum * 0.03 - fatiguePenalty * 0.8,
      risk: clamp(base.risk + totals.risk + Number(phaseEffect.risk||0), 15, 95),
      fatigueRate: clamp(base.fatigueRate*Number(phaseEffect.fatigue||1),.45,2.8),
      foulRisk: Number(base.foulRisk||0)+Number(phaseEffect.foulRisk||0),
      fatigue,
      team,
      actor: actorRow,
      isHuman,
      plan,
      phase,
      phaseEffect,
      shape:shapeFor(plan.formation,phase)
    };
  }

  function updateMatchPhaseState(engine) {
    engine.phaseState ||= {possession:"home",previousPossession:"home",transitionSide:null,transitionUntil:0,home:"inPossession",away:"outPossession"};
    const state=engine.phaseState,current=state.possession||"home",chance=(engine.shotMap||[]).find(item=>item.minute===Math.round(engine.minute));
    let desired=current;
    if(chance?.side)desired=chance.side;
    else if(engine.zone>.22)desired="home";
    else if(engine.zone<-.22)desired="away";
    else if(engine.minute%4===0&&random(engine)<.18)desired=random(engine)<engine.possessionHome/100?"home":"away";
    if(desired!==current){state.previousPossession=current;state.possession=desired;state.transitionSide=desired;state.transitionUntil=engine.minute+3;}
    const transition=Number(state.transitionUntil||0)>=engine.minute&&engine.minute>0;
    state.home=transition?(state.transitionSide==="home"?"winTransition":"lossTransition"):(state.possession==="home"?"inPossession":"outPossession");
    state.away=transition?(state.transitionSide==="away"?"winTransition":"lossTransition"):(state.possession==="away"?"inPossession":"outPossession");
    engine.phaseUsage||={home:{},away:{}};
    ["home","away"].forEach(side=>{engine.phaseUsage[side]||={};engine.phaseUsage[side][state[side]]=Number(engine.phaseUsage[side][state[side]]||0)+1;});
    return state;
  }

  function orderTriggered(orderId, context) {
    if(orderId==="trailing-60")return context.goals<context.opponentGoals;
    if(orderId==="leading-70")return context.goals>context.opponentGoals;
    if(orderId==="fatigue-60")return context.fatigue<60;
    if(orderId==="opponent-red")return context.opponentRed>0;
    if(orderId==="own-red")return context.red>0;
    if(orderId==="deadlock-75")return context.goals===context.opponentGoals;
    return false;
  }

  function processConditionalOrders(career,fixture){
    const engine=fixture.matchEngine,sides=getSides(career,fixture),humanSide=sides.humanIsHome?"home":"away",aiSide=humanSide==="home"?"away":"home";
    engine.triggeredOrders||={human:[],ai:[]};
    const run=(owner,side,plan)=>{
      const other=side==="home"?"away":"home",goals=side==="home"?engine.scoreHome:engine.scoreAway,opponentGoals=other==="home"?engine.scoreHome:engine.scoreAway;
      const context={goals,opponentGoals,fatigue:side==="home"?engine.homeFatigue:engine.awayFatigue,red:Number(engine.stats?.[side]?.red||0),opponentRed:Number(engine.stats?.[other]?.red||0)};
      for(const id of (plan.autoOrders||[])){
        if(engine.triggeredOrders[owner].some(item=>item.id===id))continue;
        const order=AUTO_ORDERS.find(item=>item.id===id);if(!order||engine.minute<order.minute||!orderTriggered(id,context))continue;
        const effects=order.effects||{},key=side==="home"?"homeModifiers":"awayModifiers";
        engine[key].push({until:Math.min(91,engine.minute+Number(effects.duration||15)),attack:Number(effects.attack||0),control:Number(effects.control||0),defence:Number(effects.defence||0),risk:Number(effects.risk||0),source:`auto-${id}`});
        if(Number(effects.fatigue||0)){if(side==="home")engine.homeFatigue=clamp(engine.homeFatigue+Number(effects.fatigue),35,100);else engine.awayFatigue=clamp(engine.awayFatigue+Number(effects.fatigue),35,100);}
        const row={id,label:order.label,minute:Math.round(engine.minute),side,owner};engine.triggeredOrders[owner].push(row);
        if(owner==="ai")engine.aiAdaptations+=1;
        addEvent(engine,{type:"auto-order",side,text:owner==="human"?`Otomatik emir çalıştı: ${order.label}.`:`Rakip teknik direktör skor ve saha durumuna bağlı önceden hazırlanmış planını devreye aldı.`});
        engine.managerBattle||=[];engine.managerBattle.push({minute:row.minute,type:"auto-order",text:owner==="human"?`${order.label} koşulu doğru zamanda etkinleşti.`:"AI koşullu maç planını otomatik çalıştırdı."});
        break;
      }
    };
    run("human",humanSide,engine.userPlan||{});run("ai",aiSide,engine.aiPlan||{});
  }

  function applyCounterMatrix(home,away){
    const tune=(own,opp)=>{let atk=0,ctl=0,def=0,label="";if(own.plan?.mentality==="counter"&&opp.plan?.mentality==="aggressive"){atk+=6;def+=2;label="COUNTER TRAP";}if(own.plan?.pressing==="high"&&opp.plan?.buildUp==="patient"){ctl+=4;atk+=2;label="PRESS LOCK";}if(own.plan?.buildUp==="direct"&&opp.plan?.pressing==="high"){atk+=4;ctl-=2;label="PRESS BYPASS";}if(own.plan?.mentality==="possession"&&opp.plan?.pressing==="low"){ctl+=5;atk-=1;label="TERRITORY CONTROL";}if(own.plan?.mentality==="aggressive"&&opp.plan?.mentality==="counter"){def-=6;ctl-=2;label="TRANSITION EXPOSED";}own.attack+=atk;own.control+=ctl;own.defence+=def;own.counterLabel=label;};tune(home,away);tune(away,home);
  }

  function addEvent(engine, event) {
    const row = { minute: Math.max(0, Math.round(engine.minute)), ...event };
    engine.events.unshift(row);
    engine.events = engine.events.slice(0, MAX_EVENTS);
    pushCommentary(engine,row.text,row.side||"neutral",row.type||"event");
    if(["goal","penalty","penalty-goal","penalty-miss","red","var-overturn","woodwork","tactics","deception","auto-order"].includes(row.type)){engine.turningPoints||=[];engine.turningPoints.push({minute:row.minute,type:row.type,side:row.side,text:row.text,momentum:Math.round(engine.momentum||0),score:`${engine.scoreHome||0}-${engine.scoreAway||0}`});engine.turningPoints=engine.turningPoints.slice(-18);}
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
    const shotX=chain.lane==="left"?randomRange(engine,66,82):chain.lane==="right"?randomRange(engine,66,82):randomRange(engine,76,91),shotY=chain.lane==="left"?randomRange(engine,18,43):chain.lane==="right"?randomRange(engine,57,82):randomRange(engine,37,63);
    let woodwork=!goal&&!blocked&&random(engine)<clamp(.025+xg*.09,.025,.075);if(woodwork){stats.woodwork+=1;if(onTarget)stats.onTarget=Math.max(0,stats.onTarget-1);stats.offTarget+=1;}
    const shot={minute:Math.round(engine.minute),side:attackingSide,lane:chain.lane,x:round1(shotX),y:round1(shotY),xg:round1(xg),onTarget,blocked,goal,woodwork,chainId:chain.id};engine.shotMap.push(shot);
    engine.shotMap=engine.shotMap.slice(-60);
    const attackingActor = attack.actor;
    if(woodwork){addEvent(engine,{type:"woodwork",side:attackingSide,text:`DİREKTEN DÖNDÜ! ${attackingActor.clubName} gole çok yaklaştı.`});setMomentum(engine,attackingSide==="home"?8:-8);chain.outcome="woodwork";return;}
    if (goal) {
      if (attackingSide === "home") engine.scoreHome += 1;
      else engine.scoreAway += 1;
      engine.lastGoal = { side: attackingSide, minute: engine.minute };
      setMomentum(engine, attackingSide === "home" ? 22 : -22);
      engine.zone = attackingSide === "home" ? 0.25 : -0.25;
      addEvent(engine, { type: "goal", side: attackingSide, text: `GOL! ${attackingActor.clubName} baskıyı skora çevirdi.` });
      setBroadcast(engine, "goal", attackingSide, "GOOOL!", `${attackingActor.clubName} · ${Math.round(engine.minute)}'`);
      chain.outcome="goal";
      if(random(engine)<clamp(.035+(xg<.12 ? .035 : 0),.03,.085)){
        if(attackingSide==="home")engine.scoreHome-=1;else engine.scoreAway-=1;stats.varOverturns+=1;shot.goal=false;shot.varOverturned=true;engine.lastGoal=null;setMomentum(engine,attackingSide==="home"?-17:17);chain.outcome="var-overturn";addEvent(engine,{type:"var-overturn",side:attackingSide,text:"VAR incelemesi tamamlandı: Gol geçersiz! Ofsayt/ihlal tespit edildi."});setBroadcast(engine,"var-overturn",attackingSide,"GOL İPTAL",`${attackingActor.clubName} · VAR kararı`);
      }
      return;
    }
    if(onTarget)engine.stats[defendingSide].saves+=1;
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
    if (engine.aiAdaptations >= 6) return;
    const sides = getSides(career, fixture);
    const humanGoals = sides.humanIsHome ? engine.scoreHome : engine.scoreAway;
    const aiGoals = sides.humanIsHome ? engine.scoreAway : engine.scoreHome;
    const style = engine.aiStyle || {};
    const persona=engine.aiPersonality||{};
    const adaptation = (Number(style.adaptation || 50)+Number(persona.adaptation||50))/2;
    if(engine.minute>=Number(engine.nextDeceptionMinute||99)&&engine.tacticalDeceptions<2&&random(engine)<.32+Number(persona.unpredictability||40)/150){
      const plan={...engine.aiPlan,phaseBehaviors:{...engine.aiPlan.phaseBehaviors}},routes=["wings","central","direct","transition"].filter(x=>x!==plan.buildUp);plan.buildUp=routes[Math.floor(random(engine)*routes.length)];
      if(Number(persona.unpredictability||0)>70&&random(engine)<.55)plan.tempo=plan.tempo==="high"?"low":"high";
      if(random(engine)<.55)plan.phaseBehaviors.winTransition=plan.phaseBehaviors.winTransition==="wide-release"?"direct-release":"wide-release";
      engine.aiPlan=plan;engine.tacticalDeceptions+=1;engine.aiAdaptations+=1;engine.nextDeceptionMinute=engine.minute+18+Math.floor(randomRange(engine,0,13));
      addEvent(engine,{type:"deception",side:sides.humanIsHome?"away":"home",text:"Rakibin saha yerleşimi sessizce değişti; hücum çıkışları farklı bir koridora kayıyor."});
      engine.managerBattle ||= [];engine.managerBattle.push({minute:Math.round(engine.minute),type:"deception",text:"AI hücum yönünü maskeleyerek değiştirdi."});return;
    }
    const thresholds = [22, 38, 53, 67, 79, 86];
    if (engine.minute < thresholds[engine.aiAdaptations]) return;
    const urgent = aiGoals < humanGoals || (engine.minute >= 45 && Math.abs(engine.momentum) > 22);
    if (!urgent && random(engine) > 0.52 + adaptation / 180) return;
    const plan = { ...engine.aiPlan,phaseBehaviors:{...engine.aiPlan.phaseBehaviors} };
    if (aiGoals < humanGoals) {
      plan.mentality = Number(persona.risk||style.risk||50) > 64 ? "aggressive" : "balanced";
      plan.tempo = "high";
      plan.risk = engine.minute > 72 ? "bold" : "measured";
      plan.buildUp = Number(style.directness || 50) > 52 ? "direct" : Number(persona.unpredictability||0)>70&&random(engine)<.5?"wings":"transition";
      plan.phaseBehaviors.inPossession=engine.minute>70?"overload":"vertical";plan.phaseBehaviors.outPossession="high-press";plan.phaseBehaviors.winTransition="counter";plan.phaseBehaviors.lossTransition="counterpress";
    } else if (aiGoals > humanGoals) {
      plan.mentality = Number(persona.patience||style.control||50) > 62 ? "controlled" : "counter";
      plan.pressing = Number(style.pressing || 50) > 65 ? "counterpress" : "mid";
      plan.risk = "safe";
      plan.phaseBehaviors.inPossession="patient";plan.phaseBehaviors.outPossession="low-block";plan.phaseBehaviors.winTransition="secure";plan.phaseBehaviors.lossTransition="regroup";
    } else {
      plan.buildUp = Number(style.width || 50) > 55 ? "wings" : "central";
      plan.tempo = Number(style.tempo || 50) > 55 ? "high" : "normal";
      plan.phaseBehaviors.inPossession=Number(style.control||50)>60?"positional":"vertical";plan.phaseBehaviors.winTransition=Number(style.width||50)>60?"wide-release":"counter";
    }
    engine.aiPlan = plan;
    engine.aiAdaptations += 1;
    engine.managerBattle ||= [];engine.managerBattle.push({minute:Math.round(engine.minute),type:"adapt",text:`AI skor ve momentum için ${plan.mentality}/${plan.buildUp} karşı planına geçti.`});
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

  function reactToRedCard(career,fixture,redSide){const engine=fixture.matchEngine,sides=getSides(career,fixture),aiSide=sides.humanIsHome?"away":"home";if(redSide===aiSide){engine.aiPlan={...engine.aiPlan,mentality:"counter",pressing:"low",risk:"safe",tempo:"low"};engine.aiAdaptations+=1;engine.managerBattle.push({minute:Math.round(engine.minute),type:"red-reaction",text:"AI on kişi kaldı ve kompakt kontra planına geçti."});}else{engine.aiPlan={...engine.aiPlan,mentality:engine.aiPersonality?.risk>62?"aggressive":"possession",pressing:"high",risk:"measured"};engine.aiAdaptations+=1;engine.managerBattle.push({minute:Math.round(engine.minute),type:"red-reaction",text:"AI sayısal üstünlük sonrası baskı ve alan kontrolünü artırdı."});}}

  function processDiscipline(career,fixture,home,away,homePoss){
    const engine=fixture.matchEngine;
    const pressure=(side)=>clamp((side.risk-45)*.45+Number(side.foulRisk||0)+(100-side.fatigue)*.22+Number(side.actor?.personality?.aggression||50)*.08,0,38);
    const homePressure=pressure(home),awayPressure=pressure(away);
    const foulProbability=clamp(.095+(homePressure+awayPressure)/900,.075,.19);
    if(random(engine)>=foulProbability)return false;
    const foulSide=random(engine)<clamp((awayPressure+homePoss*18)/(homePressure+awayPressure+18),.24,.76)?"away":"home";
    const offender=foulSide==="home"?home:away,attackingSide=foulSide==="home"?"away":"home",stats=engine.stats[foulSide];stats.fouls+=1;engine.stats[attackingSide].freeKicks+=1;
    const threat=attackingSide==="home"?engine.homeThreat:engine.awayThreat;
    const boxRisk=clamp(.008+Math.max(0,threat-60)/620+Math.max(0,offender.risk-60)/900,.006,.075);
    if(random(engine)<boxRisk){addEvent(engine,{type:"penalty-foul",side:foulSide,text:`Ceza sahasında geç müdahale! ${offender.actor.clubName} penaltıya sebep oldu.`});createPenalty(career,fixture,attackingSide);return true;}
    if(threat>58&&random(engine)<.045){addEvent(engine,{type:"free-kick",side:attackingSide,text:"Tehlikeli noktadan serbest vuruş; savunma baraj kuruyor."});createChance(career,fixture,attackingSide);engine.lastChanceMinute=engine.minute;}
    const yellowChance=clamp(.105+homePressure/900+awayPressure/900+(100-offender.fatigue)/700,.09,.29);
    if(random(engine)<yellowChance){
      const secondYellow=stats.yellow>=1&&random(engine)<clamp(.035+stats.yellow*.018,.035,.11);stats.yellow+=1;
      if(secondYellow){stats.red+=1;const modsKey=foulSide==="home"?"homeModifiers":"awayModifiers";engine[modsKey].push({until:91,attack:-8,control:-10,defence:-7,risk:5,source:"red-card"});addEvent(engine,{type:"red",side:foulSide,text:`İkinci sarı! ${offender.actor.clubName} on kişi kaldı.`});reactToRedCard(career,fixture,foulSide);setBroadcast(engine,"red",foulSide,"KIRMIZI KART",`${offender.actor.clubName} · ${Math.round(engine.minute)}'`);}
      else addEvent(engine,{type:"yellow",side:foulSide,text:`${offender.actor.clubName} oyuncusu sert müdahale sonrası sarı kart gördü.`});
    } else if(random(engine)<clamp(.0025+Math.max(0,offender.risk-70)/2400,.0025,.014)){
      stats.red+=1;const modsKey=foulSide==="home"?"homeModifiers":"awayModifiers";engine[modsKey].push({until:91,attack:-8,control:-10,defence:-7,risk:5,source:"red-card"});addEvent(engine,{type:"red",side:foulSide,text:`Kontrolsüz müdahale! ${offender.actor.clubName} doğrudan kırmızı kart gördü.`});reactToRedCard(career,fixture,foulSide);setBroadcast(engine,"red",foulSide,"KIRMIZI KART",`${offender.actor.clubName} · ${Math.round(engine.minute)}'`);
    }
    return true;
  }

  function simulateMinute(career, fixture, simulationMinute) {
    const engine = fixture.matchEngine;
    if (!engine || engine.status !== "live") return;
    engine.minute = Math.min(90, Number(simulationMinute));
    const home = sideMetrics(career, fixture, "home");
    const away = sideMetrics(career, fixture, "away");
    applyCounterMatrix(home,away);

    const homeFatigueCost = 0.075 * home.fatigueRate + Math.max(0, home.risk - 55) / 850;
    const awayFatigueCost = 0.075 * away.fatigueRate + Math.max(0, away.risk - 55) / 850;
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
    processDiscipline(career,fixture,home,away,homePoss);

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
      const attackSide=random(engine)<homeWeight?"home":"away",attackMetrics=attackSide==="home"?home:away;
      if(["direct","transition"].includes(attackMetrics.plan?.buildUp)&&random(engine)<.065){engine.stats[attackSide].offsides+=1;const chain=buildPossessionChain(career,fixture,attackSide);chain.outcome="offside";addEvent(engine,{type:"offside",side:attackSide,text:`Savunma çizgisi yakaladı: ${attackMetrics.actor.clubName} ofsaytta.`});}
      else createChance(career, fixture, attackSide);
      engine.lastChanceMinute = engine.minute;
    }
    if (!engine.broadcastEvent && engine.minute - engine.lastChanceMinute > 1 && random(engine) < .0015) {
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
    updateMatchPhaseState(engine);
    processConditionalOrders(career,fixture);
    maybeAiAdapt(career, fixture);
    update2DState(career, fixture);

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

  function ensureLiveRuntime(engine){
    if(!Number.isFinite(Number(engine.clockSeconds)))engine.clockSeconds=clamp(Number(engine.minute||0)*60,0,5400);
    if(!Number.isFinite(Number(engine.lastSimulatedMinute)))engine.lastSimulatedMinute=Math.floor(Number(engine.clockSeconds||0)/60);
    const speed=Number(engine.playbackSpeed||8);engine.playbackSpeed=PLAYBACK_SPEEDS.includes(speed)?speed:8;
    if(!Number.isFinite(engine.motionRngState))engine.motionRngState=(Number(engine.seed||engine.rngState||1)^0x9E3779B9)>>>0;
    engine.commentary=Array.isArray(engine.commentary)?engine.commentary:[];
    if(!engine.commentary.length)pushCommentary(engine,"Maç yeniden başladı; iki takım saha yerleşimini koruyor.","neutral","resume");
    return engine;
  }

  function tick(career,fixture){
    const engine=fixture.matchEngine;
    if(!engine||engine.status!=="live")return;
    ensureLiveRuntime(engine);
    const deltaSeconds=TICK_MS/1000*Number(engine.playbackSpeed||8),previousSecond=Number(engine.clockSeconds||0);
    engine.clockSeconds=Math.min(5400,previousSecond+deltaSeconds);
    engine.minute=engine.clockSeconds/60;
    advanceLiveMotion(career,fixture,deltaSeconds);
    const currentMinute=Math.floor(engine.clockSeconds/60),lastMinute=Number(engine.lastSimulatedMinute||0);
    if(currentMinute>lastMinute){
      engine.lastSimulatedMinute=currentMinute;
      simulateMinute(career,fixture,currentMinute);
      engine.minute=engine.clockSeconds/60;
    }
    paintLiveFrame(engine);
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
    if(fixture.competition==="oruc"&&homeScore===awayScore){const homePens=3+Math.floor(random(engine)*3),awayPens=3+Math.floor(random(engine)*3);fixture.shootout={home:homePens,away:awayPens};if(homePens===awayPens)fixture.shootout[random(engine)<.5?"home":"away"]+=1;fixture.winnerId=fixture.shootout.home>fixture.shootout.away?fixture.homeId:fixture.awayId;}
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
    const psyche=(row,result)=>{row.psychology||={confidence:50,pressure:35,composure:55,streak:0,mood:"DENGELİ"};const p=row.psychology;if(result===1){p.confidence=clamp(p.confidence+6,20,95);p.pressure=clamp(p.pressure-4,10,95);p.streak=Math.max(1,Number(p.streak||0)+1);}else if(result===0){p.confidence=clamp(p.confidence-5,20,95);p.pressure=clamp(p.pressure+7,10,95);p.streak=Math.min(-1,Number(p.streak||0)-1);}else{p.confidence=clamp(p.confidence+1,20,95);p.pressure=clamp(p.pressure-1,10,95);p.streak=0;}p.mood=p.streak>=3?"YÜKSELİŞTE":p.streak<=-3?"BASKI ALTINDA":p.confidence>70?"ÖZGÜVENLİ":p.pressure>68?"GERGİN":"DENGELİ";};psyche(home,actualHome===1?1:actualHome===0?0:.5);psyche(away,actualHome===0?1:actualHome===1?0:.5);
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
    engine.clockSeconds = 5400;
    engine.lastSimulatedMinute = 90;
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
    if(fixture.competition==="oruc"&&engine.scoreHome===engine.scoreAway){const homePens=3+Math.floor(random(engine)*3),awayPens=3+Math.floor(random(engine)*3);fixture.shootout={home:homePens,away:awayPens};if(homePens===awayPens)fixture.shootout[random(engine)<.5?"home":"away"]+=1;fixture.winnerId=fixture.shootout.home>fixture.shootout.away?fixture.homeId:fixture.awayId;engine.events.unshift({minute:90,type:"shootout",side:fixture.winnerId===fixture.homeId?"home":"away",text:`Penaltı atışları ${fixture.shootout.home}-${fixture.shootout.away} tamamlandı.`});}
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
    const tacticalIntelligence=analyzeTacticalPlan(engine.userPlan||{});
    analysis.avgQuality=clamp(Math.round(analysis.avgQuality*.72+tacticalIntelligence.chemistry*.18+tacticalIntelligence.transitionSecurity*.1),20,96);
    if(tacticalIntelligence.contradictions.length)analysis.lines.push(`${tacticalIntelligence.contradictions.length} taktik çelişki plan verimliliğini ve geçiş güvenliğini etkiledi.`);
    if((engine.triggeredOrders?.human?.length||0)>0)analysis.lines.push(`${engine.triggeredOrders.human.length} koşullu taktik emri maç durumuna göre otomatik çalıştı.`);
    const humanFinalFatigue=sides.humanIsHome?engine.homeFatigue:engine.awayFatigue;
    const humanAggregate=aggregatePlan(engine.userPlan||{}),overAggressive=humanAggregate.tags.filter(x=>x==="attack"||x==="press"||x==="aggression").length>=3;
    career.managerAttributes ||= {adaptation:50,gameReading:50,riskManagement:50,bigMatch:50,consistency:50,mentality:50};
    const attrs=career.managerAttributes,blend=(old,target)=>clamp(Math.round(Number(old||50)*.82+Number(target)*.18),20,99);
    attrs.gameReading=blend(attrs.gameReading,analysis.avgQuality);
    attrs.adaptation=blend(attrs.adaptation,clamp(45+(fixture.decisions?.length||0)*4+Math.min(15,engine.tacticalSnapshots?.length*5),20,95));
    attrs.riskManagement=blend(attrs.riskManagement,clamp(78-(overAggressive?18:0)-(humanFinalFatigue<58?16:0)+(result===1?8:0),20,95));
    attrs.bigMatch=blend(attrs.bigMatch,clamp(48+(fixture.competition==="oruc"?15:0)+(Number(sides.aiActor.power||1000)>Number(career.managerElo||1000)?10:0)+(result===1?12:result===0?-8:2),20,95));
    attrs.mentality=blend(attrs.mentality,clamp(48+(result===1?14:result===.5?3:-8)+(analysis.avgQuality-50)*.3,20,95));
    const recentQualities=(career.matchHistory||[]).slice(0,5).map(x=>Number(x.tacticalQuality||50));const spread=recentQualities.length?Math.max(...recentQualities,analysis.avgQuality)-Math.min(...recentQualities,analysis.avgQuality):0;attrs.consistency=blend(attrs.consistency,clamp(88-spread,25,95));
    career.managerRating=Math.round(attrs.gameReading*.3+attrs.adaptation*.2+attrs.riskManagement*.15+attrs.bigMatch*.1+attrs.consistency*.15+attrs.mentality*.1);
    const tacticalDelta=clamp(Math.round((career.managerRating-Number(career.tacticalIQ||50))/12+(analysis.avgQuality-55)/18+(engine.fogOfWar?.readCorrect?1:-.5)),-3,4);
    career.managerElo = clamp(Number(career.managerElo || 1000) + eloDelta, 700, 2200);
    const humanActor = actor(career, career.humanActorId);
    humanActor.power = career.managerElo;
    humanActor.powerClass = room()?.powerLabel?.(career.managerElo) || "COMPETITIVE";
    career.tacticalIQ = clamp(Number(career.tacticalIQ || 50) + tacticalDelta, 20, 99);
    career.playerStyle ||= {label:"ANALİZ BEKLİYOR",tempo:50,directness:50,pressing:50,risk:50,control:50,samples:0};
    const ps=career.playerStyle,ema=(old,target)=>Math.round(Number(old||50)*.76+target*.24);ps.tempo=ema(ps.tempo,engine.userPlan?.tempo==="high"?84:engine.userPlan?.tempo==="low"?25:52);ps.directness=ema(ps.directness,["direct","transition"].includes(engine.userPlan?.buildUp)?82:engine.userPlan?.buildUp==="patient"?25:50);ps.pressing=ema(ps.pressing,["high","counterpress"].includes(engine.userPlan?.pressing)?82:engine.userPlan?.pressing==="low"?24:50);ps.risk=ema(ps.risk,["aggressive"].includes(engine.userPlan?.mentality)||engine.userPlan?.risk==="bold"?86:engine.userPlan?.risk==="safe"?22:50);ps.control=ema(ps.control,Math.round(sides.humanIsHome?engine.possessionHome:100-engine.possessionHome));ps.samples=Number(ps.samples||0)+1;ps.label=ps.risk>70?"CESUR HÜCUMCU":ps.control>58?"MAÇ KONTROLCÜSÜ":ps.directness>68?"DİREKT GEÇİŞÇİ":ps.pressing>68?"YÜKSEK PRESÇİ":"DENGELİ OYUNCU";
    const basePoints = result === 1 ? 110 : result === 0.5 ? 55 : 24;
    const tacticalBonus = Math.max(0, Math.round((analysis.avgQuality - 45) * 1.2));
    career.careerPoints = Number(career.careerPoints || 0) + basePoints + tacticalBonus;
    career.prestige = clamp(Number(career.prestige || 0) + (result === 1 ? 2 : result === 0.5 ? 1 : 0), 0, 100);
    const humanFixtures = career.fixtures.filter(item => item.status!=="cancelled"&&[item.homeId, item.awayId].includes(career.humanActorId));
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
    career.storyFeed ||= [];career.storyFeed.unshift({createdAt:now(),type:fixture.competition==="oruc"?"CUP":"LEAGUE",title:result===1?"Kritik Galibiyet":result===.5?"Denge Bozulmadı":"Derslerle Dolu Mağlubiyet",text:`${career.clubName} ${humanGoals}-${aiGoals} ${sides.aiActor.clubName} · Rating ${career.managerRating||50}`,fixtureId:fixture.id});career.storyFeed=career.storyFeed.slice(0,60);
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
      pressConference: engine.pressConference,
      tacticalIntelligence:{opening:engine.tacticalIntelligenceStart?.human||tacticalIntelligence,final:tacticalIntelligence,phaseUsage:engine.phaseUsage,orders:engine.triggeredOrders},
      totalShots: engine.stats.home.shots + engine.stats.away.shots,
      totalXg: round1(engine.stats.home.xg + engine.stats.away.xg),
      revealedStyleHint: revealStyleHint(engine.aiStyle)
    };
    const battle=[...(engine.managerBattle||[])];if(overAggressive)battle.push({minute:90,type:"risk",text:`Agresif yüklenme fizik seviyesini ${Math.round(humanFinalFatigue)}'e indirdi ve geçiş savunmasını zayıflattı.`});if(engine.tacticalDeceptions)battle.push({minute:90,type:"deception",text:`Rakip ${engine.tacticalDeceptions} kez maskeli taktik/yön değişikliği yaptı.`});if(engine.aiMemoryUsed)battle.push({minute:0,type:"memory",text:"Rakip önceki karşılaşma hafızasından karşı plan üretti."});engine.report.managerBattle=battle;engine.report.managerRating=career.managerRating;engine.report.managerAttributes={...attrs};engine.report.playerStyle={...ps};
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

  function renderPositionRoleSystem(plan = {}, compact = false) {
    const activeFormation = FORMATIONS.includes(plan.formation) ? plan.formation : "4-3-3";
    const activeRoles = normalizePositionRoles(activeFormation, plan.positionRoles);
    const panels = FORMATIONS.map(formation => {
      const active = formation === activeFormation;
      const slots = formationSlots(formation);
      const roles = active ? activeRoles : normalizePositionRoles(formation, {});
      return `<div class="manager-role-formation ${active ? "active" : ""}" data-formation-panel="${formation}" ${active ? "" : "hidden"}>
        <div class="manager-role-pitch"><div class="manager-role-pitch-lines"></div>${slots.map(slot => { const role=roleDefinition(slot.group,roles[slot.key]); return `<span class="role-node group-${slot.group.toLowerCase()}" style="left:${slot.x}%;top:${slot.y}%" title="${esc(`${slot.key} · ${role.label}`)}"><b>${slot.key}</b><small>${role.label}</small></span>`; }).join("")}</div>
        <div class="manager-position-role-grid">${slots.map(slot => {
          const selected = roles[slot.key];
          return `<label><span><b>${slot.key}</b><small>${slot.group === "GK" ? "KALECİ" : slot.group === "CB" ? "STOPER" : slot.group === "FB" ? "BEK" : slot.group === "WB" ? "KANAT BEK" : slot.group === "DM" ? "ÖN LİBERO" : slot.group === "CM" ? "MERKEZ" : slot.group === "AM" ? "10 NUMARA" : slot.group === "WING" ? "KANAT" : "SANTRFOR"}</small></span><select name="role_${slot.key}" ${active ? "" : "disabled"}>${(POSITION_ROLES[slot.group] || []).map(role => `<option value="${role.id}" ${role.id === selected ? "selected" : ""}>${role.label} — ${role.note}</option>`).join("")}</select></label>`;
        }).join("")}</div>
      </div>`;
    }).join("");
    return `<section class="manager-role-command ${compact ? "compact" : ""}" data-role-system><header><div><span>POSITIONAL ROLE COMMAND</span><h3>Mevkiye Özel Roller</h3><p>Bu bir kadro kurma ekranı değildir. 11 düğüm, FIFA maçındaki taktik pozisyonları temsil eder; her rol motorun güç, risk ve fizik hesabına girer.</p></div><label>DİZİLİŞ<select name="formation" data-role-formation>${FORMATIONS.map(value => `<option value="${value}" ${activeFormation === value ? "selected" : ""}>${value}</option>`).join("")}</select></label></header>${panels}</section>`;
  }

  function renderPhaseCommand(plan = {}, compact = false) {
    const selected=normalizePhaseBehaviors(plan.phaseBehaviors);
    return `<section class="manager-phase-command ${compact?"compact":""}"><header><div><span>FOUR PHASE GAME MODEL</span><h3>Dört Maç Fazı</h3></div><p>Takım tek bir talimatla oynamaz. Topun kimde olduğuna ve geçiş anına göre davranış, motor etkisi ve 2D yerleşim değişir.</p></header><div>${Object.entries(PHASE_GROUPS).map(([group,definition])=>`<fieldset><legend>${definition.label}</legend>${definition.options.map(item=>`<label><input type="radio" name="phase_${group}" value="${item.id}" ${selected[group]===item.id?"checked":""}><span><b>${item.label}</b><small>${item.note}</small></span></label>`).join("")}</fieldset>`).join("")}</div></section>`;
  }

  function renderConditionalOrders(plan = {}, compact = false) {
    const selected=Array.isArray(plan.autoOrders)?plan.autoOrders:DEFAULT_AUTO_ORDERS;
    return `<section class="manager-auto-orders ${compact?"compact":""}"><header><div><span>IF / THEN MATCH COMMANDS</span><h3>Koşullu Taktik Emirleri</h3></div><small>Seçilen emir, koşul ilk kez gerçekleştiğinde otomatik ve yalnızca bir kez çalışır.</small></header><div>${AUTO_ORDERS.map(order=>`<label><input type="checkbox" name="autoOrder" value="${order.id}" ${selected.includes(order.id)?"checked":""}><span><b>${order.label}</b><small>${order.note}</small></span></label>`).join("")}</div></section>`;
  }

  function renderTacticalAnalysis(plan = {}) {
    const analysis=analyzeTacticalPlan(plan),meter=(label,value)=>`<article><span>${label}</span><i><b style="width:${value}%"></b></i><strong>${value}</strong></article>`;
    return `<section class="manager-tactical-coherence grade-${analysis.grade.toLowerCase().replace("ı","i")}" data-tactical-live-analysis><header><div><span>LIVE TACTICAL DIAGNOSTIC</span><h3>${analysis.formation} → ${analysis.shapeIn} / ${analysis.shapeOut}</h3></div><b>${analysis.grade}</b></header><div class="manager-coherence-meters">${meter("Rol Uyumu",analysis.chemistry)}${meter("Geçiş Güvenliği",analysis.transitionSecurity)}${meter("Genişlik",analysis.width)}${meter("Merkez Kontrolü",analysis.centralControl)}${meter("Fizik Yükü",analysis.physicalLoad)}</div><div class="manager-coherence-notes"><section><b>UYUMLAR</b>${analysis.synergies.length?analysis.synergies.map(item=>`<p>+ ${esc(item)}</p>`).join(""):`<p>Belirgin bir rol bağlantısı oluşmadı.</p>`}</section><section><b>ÇELİŞKİLER</b>${analysis.contradictions.length?analysis.contradictions.map(item=>`<p>! ${esc(item)}</p>`).join(""):`<p>Kritik taktik çelişki bulunmadı.</p>`}</section></div></section>`;
  }

  function renderSetup(career, human, rival, fixture) {
    const sides = getSides(career, fixture);
    if (!sides.humanTeam || !sides.aiTeam) {
      return `<section id="managerMatchMount" class="manager-match-shell"><div class="manager-match-empty"><span>TEAM DRAW REQUIRED</span><h2>Önce iki takımın kurasını tamamla</h2><p>Canlı maç motoru takım OVR/ATK/MID/DEF değerlerini, Manager ELO ve gizli rakip stilini aynı state içinde kullanır.</p><button class="btn btn-gold" data-manager-action="set-tab" data-tab="draw">Team Draw Theatre</button></div></section>`;
    }
    const defaults = fixture.matchPlan || { mentality: "balanced", pressing: "mid", buildUp: "patient", tempo: "normal", risk: "measured" };
    return `<section id="managerMatchMount" class="manager-match-shell">
      <div class="manager-war-room-head"><div><span>PRE-MATCH WAR ROOM · MATCHDAY ${fixture.matchday}</span><h2>Maç Planını Kur</h2><p>Formasyon, mevki rolleri, dört oyun fazı ve koşullu emirler Tactical Intelligence tarafından tek bir yaşayan maç planına dönüştürülür.</p></div><div class="manager-match-clock"><strong>V43.3</strong><span>LIVE MOTION</span></div></div>
      <div class="manager-war-room-versus">
        ${compactTeamCard(sides.humanTeam, human, "SEN", career.managerElo)}
        <div class="manager-war-room-core"><span>TACTICAL</span><b>VS</b><small>${room()?.starText?.(fixture.stars) || `${fixture.stars}★`}</small></div>
        ${compactTeamCard(sides.aiTeam, rival, "RAKİP", rival.power, true)}
      </div>
      <section class="manager-persona-preview"><div><span>AI MANAGER CHARACTER</span><strong>${esc((rival.personality?.traits||["DENGELİ STRATEJİST"]).join(" · "))}</strong><small>Karakter ipucu görünür; gerçek plan, aldatma ve değişiklik zamanı gizlidir.</small></div><div><span>MANAGER DUEL</span><strong>ELO ${rival.power} · IQ ${rival.tacticalIQ||50}</strong><small>${rival.managerMemory?.meetings||0} geçmiş karşılaşma hafızası</small></div></section>
      <form id="managerMatchPlanForm" class="manager-plan-form" data-fixture-id="${esc(fixture.id)}">
        ${renderPositionRoleSystem(defaults)}
        ${renderPhaseCommand(defaults)}
        ${renderTacticalAnalysis(defaults)}
        ${renderConditionalOrders(defaults)}
        <div class="manager-plan-grid">
          ${renderPlanSelector("mentality", defaults.mentality)}
          ${renderPlanSelector("pressing", defaults.pressing)}
          ${renderPlanSelector("buildUp", defaults.buildUp)}
          ${renderPlanSelector("tempo", defaults.tempo)}
          ${renderPlanSelector("risk", defaults.risk)}
        </div>
        <fieldset class="manager-fog-diagnosis"><legend>TACTICAL FOG OF WAR · İLK TEŞHİSİN</legend><p>Rakibin görünen karakterinden gerçek başlangıç planını tahmin et. Bazı sinyaller aldatma olabilir.</p><div>${[["press","Yüksek baskıyla başlayacak"],["counter","Alan bırakıp kontra arayacak"],["control","Topu ve tempoyu kontrol edecek"],["chaos","Öngörülemez/kaotik başlayacak"]].map(([id,label],i)=>`<label><input type="radio" name="diagnosis" value="${id}" ${i===2?"checked":""}><span>${label}</span></label>`).join("")}</div></fieldset>
        <fieldset class="manager-motivation-group"><legend>MAÇ ÖNCESİ MOTİVASYON KONUŞMASI</legend><div>${MOTIVATION_TALKS.map((item, index) => `<label><input type="radio" name="motivation" value="${item.id}" ${index === 0 ? "checked" : ""}><span><b>${item.label}</b><small>${item.note}</small></span></label>`).join("")}</div><small>Konuşma doğru bağlamda pozitif etki yaratabilir; etkisiz kalabilir veya ters tepebilir. Sonuç maç başladığında açıklanır.</small></fieldset>
        <fieldset class="manager-press-conference"><legend>BASIN TOPLANTISI · MEDYA ETKİSİ</legend><div>${PRESS_ANSWERS.map((item,index)=>`<label><input type="radio" name="pressAnswer" value="${item.id}" ${index===0?"checked":""}><span><b>“${item.label}”</b><small>${item.note}</small></span></label>`).join("")}</div><small>Basın mesajı bağlama göre olumlu, nötr veya negatif başlangıç etkisi yaratır; sonucu maç başladığında görürsün.</small></fieldset>
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

  function render2DMatch(engine, d, career, rival) {
    const state = engine.visual2D || initialize2DState(engine);
    const humanSide = d.humanIsHome ? "home" : "away";
    const teamName = state.possession === "neutral" ? "ORTADA" : state.possession === humanSide ? "SENDE" : "RAKİPTE";
    const players = side => (state[side] || []).map((player,index) => `<span class="match-player ${side === humanSide ? "human" : "rival"}" data-motion-player data-side="${side}" data-index="${index}" style="left:${player.x}%;top:${player.y}%" title="${esc(`${player.key} · ${player.role} · ${player.behavior||""}`)}"><b>${player.number}</b><small>${player.key}</small></span>`).join("");
    const humanPhase=activePhase(engine,humanSide),aiSide=humanSide==="home"?"away":"home",humanBehavior=phaseOption(humanPhase,normalizePhaseBehaviors(engine.userPlan?.phaseBehaviors)[humanPhase]);
    return `<section class="manager-2d-view"><header><div><span>LIVE MOTION ENGINE 4.0 · 11v11</span><strong data-live-phase>${esc(state.phase || "YERLEŞİK OYUN")}</strong></div><div><small>TOP</small><b data-live-possession>${teamName}</b></div></header><div class="manager-shape-ribbon"><article><small>SEN · ${esc(PHASE_GROUPS[humanPhase]?.label||humanPhase)}</small><b data-human-live-shape>${esc(state.shapes?.[humanSide]||shapeFor(engine.userPlan?.formation,humanPhase))}</b><span>${esc(humanBehavior.label)}</span></article><i>⇄</i><article><small>RAKİP BLOK</small><b data-ai-live-shape>${esc(state.shapes?.[aiSide]||shapeFor(engine.aiPlan?.formation,activePhase(engine,aiSide)))}</b><span>Davranış saha sinyallerinden okunur</span></article></div><div class="manager-2d-pitch"><div class="manager-2d-lines"><i class="centre-circle"></i><i class="box home"></i><i class="box away"></i><i class="goal home"></i><i class="goal away"></i></div>${(state.trail || []).slice(0,-1).map((point,index,rows)=>`<i class="ball-trail" style="left:${point.x}%;top:${point.y}%;opacity:${round1((index+1)/(rows.length+1)*.42)}"></i>`).join("")}${players("home")}${players("away")}<span class="match-ball ${state.possession}" data-live-ball style="left:${state.ball.x}%;top:${state.ball.y}%">⚽</span><b class="pitch-team home">${esc(d.humanIsHome ? career.shortName : rival.shortName)}</b><b class="pitch-team away">${esc(d.humanIsHome ? rival.shortName : career.shortName)}</b></div><footer><span>22 HAREKETLİ OYUNCU</span><small>Oyuncular rol, faz, top ve takım arkadaşlarına göre saniye saniye yeni koşu yolu üretir.</small><span>${esc(d.humanTeam.clubName)} · ${esc(engine.userPlan?.formation || "4-3-3")}</span></footer></section>`;
  }

  function renderSpeedControls(engine){
    const speed=Number(engine.playbackSpeed||8);
    return `<div class="manager-speed-control"><span>OYUN HIZI</span><div>${PLAYBACK_SPEEDS.map(value=>`<button type="button" class="${speed===value?"active":""}" data-match-action="set-speed" data-speed="${value}">×${value}</button>`).join("")}</div></div>`;
  }

  function renderLiveCommentary(engine){
    const rows=Array.isArray(engine.commentary)?engine.commentary:[],latest=rows.at(-1)||{clock:formatMatchClock(engine.clockSeconds),text:"Maç akışı hazırlanıyor.",side:"neutral",type:"flow"};
    return `<section class="manager-live-commentary ${latest.side||"neutral"}"><header><div><i></i><span>CANLI MAÇ ANLATIMI</span></div><b data-commentary-clock>${esc(latest.clock||formatMatchClock(latest.second))}</b></header><div class="manager-commentary-main"><em>LIVE</em><p data-commentary-text>${esc(latest.text)}</p></div><div class="manager-commentary-history" data-commentary-history>${rows.slice(-4,-1).reverse().map(row=>`<span><time>${esc(row.clock||formatMatchClock(row.second))}</time>${esc(row.text)}</span>`).join("")}</div></section>`;
  }

  function renderLive(career, human, rival, fixture) {
    const engine = fixture.matchEngine;
    ensureLiveRuntime(engine);
    const d = sideDisplay(career, fixture);
    const momentumPos = clamp((d.humanMomentum + 100) / 2, 0, 100);
    const isRunning = runtime.fixtureId === fixture.id && Boolean(runtime.timer);
    return `<section id="managerMatchMount" class="manager-live-match level-${career.managerIdentity?.level||"manager"} ${engine.status === "decision" ? "decision-active" : ""}">
      <header class="manager-live-header"><div><span>LIVE MOTION ENGINE 4.0 · <b data-live-speed-label>×${engine.playbackSpeed}</b></span><strong data-live-clock>${formatMatchClock(engine.clockSeconds)}</strong></div><div class="manager-live-score"><article><span>${esc(d.humanTeam.clubName)}</span><b>${d.humanGoals}</b><small>${esc(career.clubName)}</small></article><i>—</i><article><b>${d.aiGoals}</b><span>${esc(d.aiTeam.clubName)}</span><small>${esc(rival.clubName)}</small></article></div><div class="manager-live-controls">${renderSpeedControls(engine)}<span>${engine.status === "decision" ? "TACTICAL PAUSE" : isRunning ? "LIVE" : "PAUSED"}</span>${engine.status === "live" ? `<button data-match-action="${isRunning ? "pause" : "resume"}">${isRunning ? "Duraklat" : "Devam Et"}</button>${!isRunning ? `<button data-match-action="change-tactics">Taktik Değiştir</button>` : ""}` : ""}</div></header>
      <div class="manager-match-main-grid ${engine.eventStreamVisible ? "events-open" : "events-closed"}">
        <article class="manager-pitch-theatre">
          ${render2DMatch(engine, d, career, rival)}
          ${renderLiveCommentary(engine)}
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
            ${metric("Sarı", d.humanStats.yellow, d.aiStats.yellow)}
            ${metric("Kırmızı", d.humanStats.red, d.aiStats.red)}
            ${metric("Penaltı", d.humanStats.penalties, d.aiStats.penalties)}
          </div>
        </article>
        ${engine.eventStreamVisible ? `<aside class="manager-event-feed"><div class="manager-feed-head"><span>LIVE EVENT STREAM</span><button data-match-action="toggle-events">KAPAT</button><b>${engine.events.length}</b></div><div>${engine.events.map(event => `<article class="${event.type} ${event.side}"><time>${event.minute}'</time><p>${esc(event.text)}</p></article>`).join("")}</div></aside>` : ""}
      </div>
      <details class="manager-live-analysis-drawer"><summary><span>GELİŞMİŞ MAÇ ANALİZİ</span><b>Momentum ve pozisyon zincirlerini aç</b></summary>${renderPulseChart(engine, d.humanIsHome)}${renderChainIntelligence(engine,d.humanIsHome,false)}</details>
      <footer class="manager-live-footer"><div><span>PLAN</span><strong>${esc(planItem("mentality", engine.userPlan.mentality).label)} · ${esc(engine.userPlan.formation||"4-3-3")}</strong></div><div><span>CANLI ŞEKİL</span><strong>${esc(shapeFor(engine.userPlan.formation,activePhase(engine,d.humanIsHome?"home":"away")))}</strong></div><div><span>OTOMATİK EMİR</span><strong>${engine.triggeredOrders?.human?.length||0}/${engine.userPlan.autoOrders?.length||0} ÇALIŞTI</strong></div><div><span>AI ADAPTATION</span><strong>${engine.aiAdaptations ? `${engine.aiAdaptations} DETECTED` : "HIDDEN"}</strong></div></footer>
      <nav class="manager-match-command-dock"><div><span data-dock-clock>${formatMatchClock(engine.clockSeconds)}</span><b>${isRunning ? "CANLI" : engine.status === "decision" ? "KARAR ANI" : "DURAKLATILDI"}</b></div>${engine.status === "live" ? `<button data-match-action="${isRunning ? "pause" : "resume"}">${isRunning ? "Ⅱ Duraklat" : "▶ Devam"}</button><button data-match-action="change-tactics">▦ Taktik</button>` : ""}<button data-match-action="toggle-events">${engine.eventStreamVisible ? "Olay Akışını Kapat" : `Olay Akışını Aç · ${engine.events.length}`}</button><button class="exit" data-match-action="exit-centre">Maç Merkezinden Çık</button></nav>
      ${engine.currentDecision ? renderDecision(engine.currentDecision) : ""}
      ${engine.tacticalEditing ? renderTacticalEditor(engine.userPlan, engine) : ""}
      ${engine.broadcastEvent ? renderBroadcastEvent(engine.broadcastEvent, d) : ""}
    </section>`;
  }

  function renderPulseChart(engine, humanIsHome) {
    const pulse = engine.pulse || [];
    const points = Array.from({ length: 90 }, (_, index) => pulse.find(item => item.minute === index + 1) || null);
    const markerTypes = { goal: "⚽", "penalty-goal": "●", "penalty-miss": "⊘", red: "■", tactics: "◆", "auto-order":"△", decision: "◇" };
    return `<section class="manager-pulse"><header><div><span>MATCH PULSE</span><strong>Oyun Temposu & Attack Momentum</strong></div><div><b>${Math.round(pulse.at(-1)?.tempo || 0)}</b><small>TEMPO</small></div></header><div class="manager-pulse-chart"><div class="pulse-half-line"><span>İY</span></div>${points.map((point, index) => { const minute=index+1; const human=point?(humanIsHome?point.home:point.away):0; const rival=point?(humanIsHome?point.away:point.home):0; const events=engine.events.filter(event=>event.minute===minute&&markerTypes[event.type]); const marker=events[0]?markerTypes[events[0].type]:""; return `<i class="pulse-minute ${point?"active":""}" title="${minute}' · Sen ${human} · Rakip ${rival}${point?` · Tempo ${point.tempo}`:""}"><b style="height:${human}%"></b><em style="height:${rival}%"></em>${marker?`<span>${marker}</span>`:""}</i>`; }).join("")}</div><footer><span>${humanIsHome?"HOME":"AWAY"} · SEN</span><small>45' İLK YARI</small><span>RAKİP · ${humanIsHome?"AWAY":"HOME"}</span></footer></section>`;
  }

  function renderChainIntelligence(engine,humanIsHome,reportMode=false){
    const chains=engine.possessionChains||[], humanSide=humanIsHome?"home":"away", human=chains.filter(x=>x.side===humanSide),ai=chains.filter(x=>x.side!==humanSide),last=chains.at(-1);
    const zones=engine.zoneEntries||{home:{left:0,centre:0,right:0},away:{left:0,centre:0,right:0}},hz=zones[humanSide]||{},az=zones[humanIsHome?"away":"home"]||{};
    return `<section class="manager-chain-intel ${reportMode?"report":""}"><header><div><span>MATCH ENGINE 4.0</span><strong>Pozisyon Zinciri & Hücum Yolları</strong></div><small>${chains.length} işlenen hücum sekansı</small></header><div class="manager-chain-kpis"><article><span>SEN</span><b>${human.length}</b><small>${human.filter(x=>x.outcome==="shot"||x.outcome==="goal").length} şuta ulaştı</small></article><article><span>RAKİP</span><b>${ai.length}</b><small>${ai.filter(x=>x.outcome==="shot"||x.outcome==="goal").length} şuta ulaştı</small></article><article><span>HÜCUM YOLUN</span><b>${Number(hz.left||0)>Number(hz.centre||0)&&Number(hz.left||0)>Number(hz.right||0)?"SOL":Number(hz.right||0)>Number(hz.centre||0)?"SAĞ":"MERKEZ"}</b><small>${hz.left||0} · ${hz.centre||0} · ${hz.right||0}</small></article><article><span>RAKİP YOLU</span><b>${Number(az.left||0)>Number(az.centre||0)&&Number(az.left||0)>Number(az.right||0)?"SOL":Number(az.right||0)>Number(az.centre||0)?"SAĞ":"MERKEZ"}</b><small>${az.left||0} · ${az.centre||0} · ${az.right||0}</small></article></div>${last?`<div class="manager-last-chain"><time>${last.minute}'</time>${last.steps.map((s,i)=>`<span>${esc(s)}${i<last.steps.length-1?" → ":""}</span>`).join("")}<b>${last.outcome.toUpperCase()} · Q${last.quality}</b></div>`:""}</section>`;
  }

  function renderManagerBattle(report={}){const attrs=report.managerAttributes||{},rows=report.managerBattle||[];return `<section class="manager-battle-report"><header><div><span>MANAGER BATTLE</span><h3>Teknik Direktör Düellosu</h3></div><strong>${report.managerRating||50}<small>MANAGER RATING</small></strong></header><div class="manager-battle-attributes">${[["Oyun Okuma",attrs.gameReading],["Adaptasyon",attrs.adaptation],["Risk Yönetimi",attrs.riskManagement],["Büyük Maç",attrs.bigMatch],["İstikrar",attrs.consistency],["Mentalite",attrs.mentality]].map(([k,v])=>`<article><span>${k}</span><b>${v||50}</b></article>`).join("")}</div><div class="manager-battle-events">${rows.length?rows.map(x=>`<div><time>${x.minute}'</time><b>${esc(String(x.type||"battle").toUpperCase())}</b><span>${esc(x.text)}</span></div>`).join(""):`<p>Bu maçta belirgin bir menajer düellosu kırılması oluşmadı.</p>`}</div></section>`;}

  function renderShotMap(engine,humanIsHome){const shots=engine.shotMap||[],humanSide=humanIsHome?"home":"away",chains=engine.possessionChains||[];const pitch=side=>`<article><header><b>${side===humanSide?"SEN":"RAKİP"}</b><span>${shots.filter(s=>s.side===side).length} şut</span></header><div class="manager-shot-pitch">${shots.filter(s=>s.side===side).map(s=>`<i class="${s.goal?"goal":s.varOverturned?"var":s.woodwork?"woodwork":s.onTarget?"target":"off"}" style="left:${s.x||75}%;top:${s.y||50}%" title="${s.minute}' · xG ${s.xg} · ${s.goal?"GOL":s.varOverturned?"VAR İPTAL":s.woodwork?"DİREK":s.onTarget?"İSABET":"İSABETSİZ"}"></i>`).join("")}</div></article>`;const goals=shots.filter(s=>s.goal||s.varOverturned);return `<section class="manager-shot-map"><div class="manager-section-head"><div><span>TACTICAL REALITY</span><h3>Gerçek Şut Haritası</h3></div><small>Konum · xG · isabet · direk · gol · VAR</small></div><div class="manager-shot-pitches">${pitch(humanSide)}${pitch(humanSide==="home"?"away":"home")}</div>${goals.length?`<div class="manager-goal-chains">${goals.map(s=>{const c=chains.find(x=>x.id===s.chainId);return `<article><time>${s.minute}'</time><b>${s.varOverturned?"İPTAL EDİLEN GOL":"GOL"} · xG ${s.xg}</b><span>${(c?.steps||[]).join(" → ")}</span></article>`}).join("")}</div>`:""}</section>`;}

  function renderTurningPoints(engine){const rows=engine.turningPoints||[];return `<section class="manager-turning-points"><div class="manager-section-head"><div><span>MATCH STORY</span><h3>Maçın Kırılma Anları</h3></div><small>${rows.length} kritik değişim</small></div>${rows.length?rows.map(r=>`<article><time>${r.minute}'</time><b>${esc(r.type.replaceAll("-"," ").toUpperCase())}</b><span>${esc(r.text)}</span><strong>${r.score}</strong></article>`).join(""):`<p>Maç dengeli bir akışta tamamlandı; belirgin kırılma anı oluşmadı.</p>`}</section>`;}

  function renderFogReveal(engine){const fog=engine.fogOfWar||{};const labels={press:"YÜKSEK BASKI",counter:"KONTRA",control:"KONTROL",chaos:"KAOS"};return `<section class="manager-fog-reveal"><div><span>TACTICAL FOG OF WAR</span><h3>Maç Sonu Teşhis Raporu</h3></div><article><small>SENİN TEŞHİSİN</small><strong>${labels[fog.diagnosis]||"—"}</strong></article><b class="${fog.readCorrect?"correct":"wrong"}">${fog.readCorrect?"DOĞRU OKUMA":"YANILTICI SİNYAL"}</b><article><small>GERÇEK BAŞLANGIÇ</small><strong>${labels[fog.actual]||"—"}</strong></article><p>Okuma güveni %${fog.signalAccuracy||50}. Rakip maç içinde ${engine.tacticalDeceptions||0} maskeli değişiklik yaptı.</p></section>`;}

  function renderBroadcastEvent(event, d) {
    const isHuman = (d.humanIsHome && event.side === "home") || (!d.humanIsHome && event.side === "away");
    const tone = event.type.includes("miss") || event.type === "red" ? "miss" : event.type.includes("penalty") ? "penalty" : "goal";
    return `<div class="manager-broadcast-overlay ${tone} ${isHuman?"human":"rival"}"><div class="broadcast-rings"></div><article><span>${event.minute}' · LIVE EVENT</span><h2>${esc(event.title)}</h2><p>${esc(event.subtitle)}</p><div><strong>${d.humanGoals}</strong><i>—</i><strong>${d.aiGoals}</strong></div><small>${isHuman?"SENİN TAKIMIN":"RAKİP TAKIM"}</small></article></div>`;
  }

  function smartAssistant(engine){const career=room()?.getActiveCareer?.(),level=career?.managerIdentity?.level||"manager",reading=Number(career?.managerAttributes?.gameReading||50),accuracy=clamp(48+reading*.42-(engine.aiPersonality?.unpredictability||40)*.16,45,88),correct=((engine.seed+Math.round(engine.minute)*17)%100)<accuracy;let signal=engine.aiPlan?.buildUp||"patient";if(!correct)signal=signal==="wings"?"central":signal==="central"?"wings":signal==="direct"?"patient":"direct";const route=signal==="wings"?"kanat":signal==="central"?"merkez":signal==="direct"?"direkt çıkış":"sabırlı pas";if(level==="casual")return {confidence:Math.round(accuracy),text:`Rakip ${route} üzerinden üretim arıyor olabilir. ${engine.momentum<-20?"Önce kontrolü ve savunma güvenliğini artır.":"Karşı koridoru ve fizik maliyetini değerlendir."}`};if(level==="analyst")return {confidence:Math.round(accuracy),text:`Sinyal: ${route} · AI adaptasyon ${engine.aiAdaptations} · aldatma ${engine.tacticalDeceptions} · momentum ${Math.round(engine.momentum)} · fizik H${Math.round(engine.homeFatigue)}/A${Math.round(engine.awayFatigue)}.`};return {confidence:Math.round(accuracy),text:`Saha davranışı ${route} ihtimalini güçlendiriyor; bunun aldatma sinyali olabileceğini unutma.`};}

  function renderTacticalEditor(plan, engine) {
    const tip=smartAssistant(engine);return `<div class="manager-decision-overlay"><form id="managerTacticalAdjustForm" class="manager-decision-card manager-tactical-editor"><header><div><span>MANUAL TACTICAL PAUSE</span><h2>Manager Tablet</h2></div><b>SAAT DURDU</b></header><div class="manager-assistant-tip"><b>SMART ASSISTANT 3.2 · %${tip.confidence}</b><span>${tip.text}</span><small>Asistanın doğruluğu Oyun Okuma seviyene bağlıdır; çıkarım kesin bilgi değildir.</small></div><div class="manager-sub-presets"><button type="button" data-match-action="substitution" data-sub-type="pace">⚡ Hücum Enerjisi</button><button type="button" data-match-action="substitution" data-sub-type="control">◎ Orta Saha Kontrolü</button><button type="button" data-match-action="substitution" data-sub-type="defence">▣ Savunma Takviyesi</button><small>${engine.substitutions?.length||0}/5 değişiklik</small></div>${renderPositionRoleSystem(plan,true)}${renderPhaseCommand(plan,true)}${renderTacticalAnalysis(plan)}${renderConditionalOrders(plan,true)}<div class="manager-plan-grid">${Object.keys(PLAN_GROUPS).map(group => renderPlanSelector(group, plan[group])).join("")}</div><div class="manager-tactical-actions"><button type="button" data-match-action="cancel-tactics">Vazgeç</button><button class="btn btn-gold" type="submit">Değişiklikleri Uygula</button></div></form></div>`;
  }

  function metric(label, home, away) {
    return `<div><span>${label}</span><b>${round1(home)}</b><i></i><b>${round1(away)}</b></div>`;
  }

  function renderDecision(decision) {
    return `<div class="manager-decision-overlay"><div class="manager-decision-card"><header><div><span>TACTICAL DECISION · ${decision.minute}'</span><h2>${esc(decision.title)}</h2></div><b>MAÇ DURDU</b></header><p>${esc(decision.prompt)}</p><div class="manager-decision-options">${decision.options.map(item => `<button data-match-action="decision" data-option-id="${esc(item.id)}"><strong>${esc(item.label)}</strong><span>${esc(item.note)}</span><small>Mutlak doğru cevap yoktur; etki mevcut maç state’ine göre çözülür.</small></button>`).join("")}</div></div></div>`;
  }

  function renderTacticalIntelligenceReport(engine,d){
    const intel=engine.report?.tacticalIntelligence||{},analysis=intel.final||analyzeTacticalPlan(engine.userPlan||{}),humanSide=d.humanIsHome?"home":"away",usage=intel.phaseUsage?.[humanSide]||engine.phaseUsage?.[humanSide]||{},total=Math.max(1,Object.values(usage).reduce((sum,value)=>sum+Number(value||0),0)),behaviors=normalizePhaseBehaviors(engine.userPlan?.phaseBehaviors),orders=intel.orders?.human||engine.triggeredOrders?.human||[];
    return `<section class="manager-tactical-intel-report"><header><div><span>TACTICAL INTELLIGENCE 3.2</span><h3>Maç Planı Otopsisi</h3><p>${analysis.formation} başlangıç yapısı, hücumda ${analysis.shapeIn}, savunmada ${analysis.shapeOut} olarak dönüştü.</p></div><strong>${analysis.chemistry}<small>ROL UYUMU</small></strong></header><div class="manager-phase-usage">${Object.keys(PHASE_GROUPS).map(group=>`<article><span>${PHASE_GROUPS[group].label}</span><b>${Math.round(Number(usage[group]||0)/total*90)}'</b><i><em style="width:${Number(usage[group]||0)/total*100}%"></em></i><small>${esc(phaseOption(group,behaviors[group]).label)}</small></article>`).join("")}</div><div class="manager-intel-report-grid"><article><span>GEÇİŞ GÜVENLİĞİ</span><b>${analysis.transitionSecurity}</b><small>Rest-defence ve rol dağılımı</small></article><article><span>MERKEZ KONTROLÜ</span><b>${analysis.centralControl}</b><small>Pas ve bağlantı kapasitesi</small></article><article><span>FİZİK YÜKÜ</span><b>${analysis.physicalLoad}</b><small>Rol ve faz yoğunluğu</small></article><article><span>OTOMATİK EMİRLER</span><b>${orders.length}</b><small>${orders.length?orders.map(item=>`${item.minute}' ${item.label}`).join(" · "):"Koşul gerçekleşmedi"}</small></article></div><div class="manager-intel-findings"><section><b>İŞLEYEN BAĞLANTILAR</b>${analysis.synergies.length?analysis.synergies.map(item=>`<p>+ ${esc(item)}</p>`).join(""):`<p>Belirgin bir rol sinerjisi oluşmadı.</p>`}</section><section><b>GELİŞTİRİLECEK NOKTALAR</b>${analysis.contradictions.length?analysis.contradictions.map(item=>`<p>! ${esc(item)}</p>`).join(""):`<p>Kritik taktik çelişki bulunmadı.</p>`}</section></div></section>`;
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
      ${renderShotMap(engine,d.humanIsHome)}
      ${renderTurningPoints(engine)}
      ${renderFogReveal(engine)}
      ${renderManagerBattle(report)}
      ${renderMatchDna(engine, d)}
      ${renderFormationAnalysis(engine, d)}
      ${renderTacticalIntelligenceReport(engine,d)}
      <div class="manager-report-grid">
        <article class="manager-report-rating"><span>TAKTİK PERFORMANS</span><strong>${report.tacticalQuality || 50}</strong><small>/ 100</small><div><b>ELO ${report.eloDelta >= 0 ? "+" : ""}${report.eloDelta || 0}</b><b>IQ ${report.tacticalDelta >= 0 ? "+" : ""}${report.tacticalDelta || 0}</b><b>+${report.careerPointsEarned || 0} CP</b></div></article>
        <article class="manager-report-stats"><h3>Gelişmiş Maç Verisi</h3>${metric("xG", d.humanStats.xg, d.aiStats.xg)}${metric("Şut", d.humanStats.shots, d.aiStats.shots)}${metric("İsabet", d.humanStats.onTarget, d.aiStats.onTarget)}${metric("Kurtarış", d.humanStats.saves, d.aiStats.saves)}${metric("Direk", d.humanStats.woodwork, d.aiStats.woodwork)}${metric("Ofsayt", d.humanStats.offsides, d.aiStats.offsides)}${metric("Serbest V.", d.humanStats.freeKicks, d.aiStats.freeKicks)}${metric("VAR İptal", d.humanStats.varOverturns, d.aiStats.varOverturns)}${metric("İsabetsiz", d.humanStats.offTarget, d.aiStats.offTarget)}${metric("Blok", d.humanStats.blocked, d.aiStats.blocked)}${metric("Top %", Math.round(d.humanPossession), 100 - Math.round(d.humanPossession))}${metric("Pas", d.humanStats.passes, d.aiStats.passes)}${metric("Pas %", d.humanStats.passAccuracy, d.aiStats.passAccuracy)}${metric("Korner", d.humanStats.corners, d.aiStats.corners)}${metric("Faul", d.humanStats.fouls, d.aiStats.fouls)}${metric("Sarı", d.humanStats.yellow, d.aiStats.yellow)}${metric("Kırmızı", d.humanStats.red, d.aiStats.red)}${metric("Penaltı", d.humanStats.penalties, d.aiStats.penalties)}${metric("Pen. Kaçtı", d.humanStats.penaltiesMissed, d.aiStats.penaltiesMissed)}</article>
        <article class="manager-report-analysis"><h3>Taktik Rapor</h3><ul>${(report.lines || []).map(line => `<li>${esc(line)}</li>`).join("")}</ul><div>${esc(report.revealedStyleHint || "Rakip profili hakkında yeni veri oluşmadı.")}</div></article>
        <article class="manager-report-decisions"><h3>Kritik Kararlar</h3>${report.motivation ? `<div><time>0'</time><section><strong>${esc(report.motivation.label)}</strong><small>${esc(report.motivation.text)}</small></section><b>${report.motivation.outcome === "positive" ? "+" : report.motivation.outcome === "negative" ? "−" : "="}</b></div>` : ""}${report.pressConference ? `<div><time>MEDYA</time><section><strong>${esc(report.pressConference.label)}</strong><small>${esc(report.pressConference.text)}</small></section><b>${report.pressConference.outcome === "positive" ? "+" : report.pressConference.outcome === "negative" ? "−" : "="}</b></div>` : ""}${fixture.decisions.length ? fixture.decisions.map(item => `<div><time>${item.minute}'</time><section><strong>${esc(item.chosenLabel)}</strong><small>${esc(item.outcome)}</small></section><b>${item.quality}</b></div>`).join("") : `<p>Maç içi kritik karar oluşmadı.</p>`}</article>
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
    const humanSquad=(d.humanIsHome?engine.squads?.home:engine.squads?.away)||[]; const rivalSquad=(d.humanIsHome?engine.squads?.away:engine.squads?.home)||[];
    const pitch=(squad,label,formation)=>`<article><header><b>${label}</b><span>${formation}</span></header><div class="manager-position-pitch"><i class="heat-zone" style="left:${formation.includes("3-")?48:38}%"></i>${formationSlots(formation).map((slot,index)=>`<span style="left:${slot.x}%;top:${slot.y}%" title="${esc(`${squad[index]?.name||""} · ${squad[index]?.roleLabel||""}`)}">${index+1}<small>${slot.key}</small></span>`).join("")}</div></article>`;
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

  function paintLiveFrame(engine){
    const mount=document.getElementById("managerMatchMount"),state=engine?.visual2D;
    if(!mount||!state)return;
    const clock=formatMatchClock(engine.clockSeconds),humanSide=engine.humanSide||"home",aiSide=humanSide==="home"?"away":"home";
    mount.querySelectorAll("[data-live-clock],[data-dock-clock]").forEach(node=>node.textContent=clock);
    const phaseNode=mount.querySelector("[data-live-phase]");if(phaseNode)phaseNode.textContent=state.phase||"AKAN OYUN";
    const possessionNode=mount.querySelector("[data-live-possession]");if(possessionNode)possessionNode.textContent=state.possession===humanSide?"SENDE":state.possession===aiSide?"RAKİPTE":"ORTADA";
    mount.querySelectorAll("[data-motion-player]").forEach(node=>{const player=state[node.dataset.side]?.[Number(node.dataset.index)];if(!player)return;node.style.left=`${player.x}%`;node.style.top=`${player.y}%`;});
    const ball=mount.querySelector("[data-live-ball]");if(ball){ball.style.left=`${state.ball?.x||50}%`;ball.style.top=`${state.ball?.y||50}%`;ball.className=`match-ball ${state.possession||"neutral"}`;}
    const humanShape=mount.querySelector("[data-human-live-shape]"),aiShape=mount.querySelector("[data-ai-live-shape]");if(humanShape)humanShape.textContent=state.shapes?.[humanSide]||shapeFor(engine.userPlan?.formation,activePhase(engine,humanSide));if(aiShape)aiShape.textContent=state.shapes?.[aiSide]||shapeFor(engine.aiPlan?.formation,activePhase(engine,aiSide));
    const latest=(engine.commentary||[]).at(-1);if(latest){const time=mount.querySelector("[data-commentary-clock]"),textNode=mount.querySelector("[data-commentary-text]"),history=mount.querySelector("[data-commentary-history]");if(time)time.textContent=latest.clock||formatMatchClock(latest.second);if(textNode)textNode.textContent=latest.text;if(history)history.innerHTML=(engine.commentary||[]).slice(-4,-1).reverse().map(row=>`<span><time>${esc(row.clock||formatMatchClock(row.second))}</time>${esc(row.text)}</span>`).join("");}
    mount.querySelectorAll('[data-match-action="set-speed"]').forEach(button=>button.classList.toggle("active",Number(button.dataset.speed)===Number(engine.playbackSpeed)));
    mount.querySelectorAll("[data-live-speed-label]").forEach(node=>node.textContent=`×${engine.playbackSpeed}`);
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
      readPositionSetup(data, plan);
      readPhaseSetup(data, plan);
      readAutoOrders(data, plan);
      plan.pressAnswer = String(data.get("pressAnswer") || "confident");
      plan.diagnosis = String(data.get("diagnosis") || "control");
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
    const tacticalData = new FormData(event.target);
    const nextPlan = readPositionSetup(tacticalData, selectedPlan(tacticalData));
    readPhaseSetup(tacticalData,nextPlan);
    readAutoOrders(tacticalData,nextPlan);
    nextPlan.pressAnswer = engine.userPlan.pressAnswer;
    nextPlan.diagnosis = engine.userPlan.diagnosis;
    engine.userPlan = nextPlan;
    const sides = getSides(career, fixture);
    const humanSquad = sides.humanIsHome ? engine.squads.home : engine.squads.away;
    const humanTeam = sides.humanIsHome ? sides.homeTeam : sides.awayTeam;
    const slots = formationSlots(engine.userPlan.formation);
    const rebuilt = slots.map((slot,index) => {
      const previous = humanSquad[index] || {};
      const role = roleDefinition(slot.group, engine.userPlan.positionRoles?.[slot.key]);
      return { ...previous, id:previous.id || `${humanTeam.id}-p${index+1}`, name:previous.name || `${humanTeam.clubName.split(" ")[0]} ${index+1}`, position:slot.key, roleGroup:slot.group, roleId:role.id, roleLabel:role.label, status:"XI", formation:engine.userPlan.formation };
    }).concat(humanSquad.filter(item => item.status === "BENCH"));
    if (sides.humanIsHome) engine.squads.home = rebuilt; else engine.squads.away = rebuilt;
    initialize2DState(engine);
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
    if(action==="set-speed"){
      const speed=Number(target.dataset.speed);
      if(PLAYBACK_SPEEDS.includes(speed)){fixture.matchEngine.playbackSpeed=speed;room()?.saveLocal?.();paintLiveFrame(fixture.matchEngine);}
      return;
    }
    if (action === "pause") {
      stopTimer();
      refreshMount(career, fixture);
    }
    if (action === "resume") {
      if (fixture.matchEngine?.status === "live") startTimer(career, fixture);
      refreshMount(career, fixture);
    }
    if (action === "change-tactics") { stopTimer(); fixture.matchEngine.tacticalEditing = true; refreshMount(career, fixture); }
    if (action === "cancel-tactics") { fixture.matchEngine.tacticalEditing = false; refreshMount(career, fixture); }
    if (action === "toggle-events") { fixture.matchEngine.eventStreamVisible = !fixture.matchEngine.eventStreamVisible; room()?.saveLocal?.(); refreshMount(career, fixture); }
    if (action === "exit-centre") { stopTimer(); fixture.matchEngine.tacticalEditing = false; room()?.saveLocal?.(); room()?.setActiveTab?.("overview"); app()?.toast?.("Maç duraklatıldı. Canlı maça istediğin zaman dönebilirsin.", "success"); }
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
  document.addEventListener("change", event => {
    const select = event.target.closest?.("[data-role-formation]");
    if(select){
      const system = select.closest("[data-role-system]");
      system?.querySelectorAll("[data-formation-panel]").forEach(panel => {
        const active = panel.dataset.formationPanel === select.value;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
        panel.querySelectorAll("select").forEach(input => { input.disabled = !active; });
      });
    }
    const form=event.target.closest?.("#managerMatchPlanForm,#managerTacticalAdjustForm"),analysis=form?.querySelector?.("[data-tactical-live-analysis]");
    if(form&&analysis){const data=new FormData(form),plan=selectedPlan(data);readPositionSetup(data,plan);readPhaseSetup(data,plan);readAutoOrders(data,plan);analysis.outerHTML=renderTacticalAnalysis(plan);}
  });
  window.addEventListener("beforeunload", stopTimer);

  function calibrate(career,iterations=10000){const sim={rngState:hashString(`V43-CALIBRATION-${career?.id||"GLOBAL"}`)},n=Math.max(1000,Math.min(20000,Number(iterations)||10000));let goals=0,shots=0,draws=0,reds=0,pens=0,strongWins=0,strongGames=0;const actors=career?.actors||[];for(let i=0;i<n;i++){const a=actors[Math.floor(random(sim)*Math.max(1,actors.length))]||{power:1000},b=actors[Math.floor(random(sim)*Math.max(1,actors.length))]||{power:1000};const diff=clamp((Number(a.power||1000)-Number(b.power||1000))/420,-1.2,1.2),aggression=random(sim);const hg=poisson(sim,clamp(1.36+diff*.72+randomRange(sim,-.18,.18),.35,3.2)),ag=poisson(sim,clamp(1.16-diff*.72+randomRange(sim,-.18,.18),.3,3));goals+=hg+ag;shots+=Math.round(clamp(15.5+(hg+ag)*1.4+randomRange(sim,-4,5),8,31));if(hg===ag)draws++;if(random(sim)<.068+aggression*.04)reds++;if(random(sim)<.17+aggression*.08)pens++;if(Math.abs(diff)>.22){strongGames++;if((diff>0&&hg>ag)||(diff<0&&ag>hg))strongWins++;}}return {iterations:n,goalsPerMatch:round1(goals/n),shotsPerMatch:round1(shots/n),drawRate:round1(draws/n*100),redEvery:round1(n/Math.max(1,reds)),penaltyEvery:round1(n/Math.max(1,pens)),strongSideWinRate:round1(strongWins/Math.max(1,strongGames)*100),seed:sim.rngState.toString(16).toUpperCase(),createdAt:now()};}

  window.FIFA_MANAGER_MATCH = {
    version: VERSION,
    render,
    renderArchive: (career, fixture) => {
      if (!career || !fixture?.matchEngine) return `<section class="manager-match-empty"><h2>Bu maç için ayrıntılı telemetri bulunmuyor.</h2></section>`;
      const opponentId = fixture.homeId === career.humanActorId ? fixture.awayId : fixture.homeId;
      return renderReport(career, actor(career, career.humanActorId), actor(career, opponentId), fixture, true);
    },
    stop: stopTimer,
    calibrate,
    resume: () => {
      const career = room()?.getActiveCareer?.();
      const fixture = career?.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
      if (career && fixture?.matchEngine?.status === "live") startTimer(career, fixture);
    }
  };
})();
