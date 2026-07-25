(() => {
  "use strict";

  const STORAGE_KEY = "fifa9_formula_racing_v4490";
  const VERSION = 3;
  const POINTS = [25,18,15,12,10,8,6,4,2,1,0,0];
  const DRIVER_IDS = ["player", ...Array.from({length:11}, (_, index) => `ai-${index + 1}`)];
  const TEAM_DEFINITIONS = [
    { id:"dragon", name:"Dragon Racing", color:"#ef4444", drivers:["player","ai-1"] },
    { id:"iron", name:"Iron Motorsport", color:"#94a3b8", drivers:["ai-2","ai-3"] },
    { id:"oruc", name:"Oruç Performance", color:"#f4c75e", drivers:["ai-4","ai-5"] },
    { id:"storm", name:"Storm GP", color:"#38bdf8", drivers:["ai-6","ai-7"] },
    { id:"blacksea", name:"Black Sea Racing", color:"#14b8a6", drivers:["ai-8","ai-9"] },
    { id:"champion", name:"Champion Works", color:"#a78bfa", drivers:["ai-10","ai-11"] }
  ];

  const DEFAULT_STATE = {
    version:VERSION,
    driver:{
      xp:0, level:1, skillPoints:0, races:0, wins:0, podiums:0, dnfs:0, penalties:0, safetyCars:0, rating:60,
      attributes:{ pace:60, qualifying:60, racecraft:60, tyreManagement:60, wetSkill:60, consistency:60 }
    },
    car:{ rdPoints:0, power:60, aero:60, tyre:60, pitCrew:60, reliability:60 },
    settings:{
      trackId:"oruc-reis", difficulty:"standard", laps:5, mode:"race",
      startingCompound:"medium", pitCompound:"hard", weather:"dynamic",
      practiceProgram:"race-pace", incidentLevel:"realistic", drivingMode:"balanced"
    },
    mastery:{},
    records:{},
    championship:{
      season:1, roundIndex:0, calendar:[], driverPoints:{}, results:[],
      weekend:null, completed:false, championId:null, lastResult:null
    }
  };

  let state = loadState();
  let host = null;
  let engine = null;
  let lastSnapshot = null;
  let result = null;
  let selectedTab = "weekend";
  let currentRaceContext = null;
  let eventFeed = [];

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const formatTime = seconds => {
    if (!Number.isFinite(seconds)) return "—";
    const minutes = Math.floor(seconds / 60);
    const remain = seconds - minutes * 60;
    return `${minutes}:${remain.toFixed(2).padStart(5,"0")}`;
  };

  function merge(base, candidate) {
    return {
      ...base,
      ...(candidate || {}),
      driver:{
        ...base.driver,
        ...(candidate?.driver || {}),
        attributes:{ ...base.driver.attributes, ...(candidate?.driver?.attributes || {}) }
      },
      car:{ ...base.car, ...(candidate?.car || {}) },
      settings:{ ...base.settings, ...(candidate?.settings || {}) },
      mastery:{ ...base.mastery, ...(candidate?.mastery || {}) },
      records:{ ...base.records, ...(candidate?.records || {}) },
      championship:{ ...base.championship, ...(candidate?.championship || {}) }
    };
  }

  function loadState() {
    try {
      const loaded = merge(DEFAULT_STATE, JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"));
      loaded.version = VERSION;
      return loaded;
    } catch {
      return merge(DEFAULT_STATE, null);
    }
  }

  function saveState() {
    state.version = VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function playerName() {
    return window.FIFA_MANAGER_ROOM?.getActiveCareer?.()?.playerName || "Çağlar Can Tatar";
  }

  function aiNames() {
    return window.F1_RACE_ENGINE?.AI_NAMES || ["Kerim","Oğuzhan","Ercan","Aziz","Sultan","Ersin","Asen","Affan","Sergei","Emre","Denar"];
  }

  function driverName(id) {
    if (id === "player") return playerName();
    const index = Number(String(id).split("-")[1] || 1) - 1;
    return aiNames()[index] || `AI ${index + 1}`;
  }

  function teamForDriver(id) {
    return TEAM_DEFINITIONS.find(team => team.drivers.includes(id)) || TEAM_DEFINITIONS[0];
  }

  function seededNumber(seed) {
    let value = 2166136261;
    const text = String(seed || "F1");
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ result >>> 15, result | 1);
      result ^= result + Math.imul(result ^ result >>> 7, result | 61);
      return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
  }

  function xpForNext(level) { return 500 + (level - 1) * 240; }
  function levelProgress() { return Math.min(100, state.driver.xp / xpForNext(state.driver.level) * 100); }

  function addXp(amount) {
    state.driver.xp += Math.max(0, Math.round(amount));
    let levels = 0;
    while (state.driver.xp >= xpForNext(state.driver.level)) {
      state.driver.xp -= xpForNext(state.driver.level);
      state.driver.level += 1;
      state.driver.skillPoints += 1;
      state.driver.rating = Math.min(99, state.driver.rating + 1);
      levels += 1;
    }
    return levels;
  }

  function trackMastery(trackId) { return Number(state.mastery[trackId] || 0); }
  function compounds() { return window.F1_RACE_ENGINE?.COMPOUNDS || {}; }
  function compound(id) { return compounds()[id] || {label:String(id).toUpperCase(),color:"#fff"}; }

  function ensureChampionship() {
    const championship = state.championship;
    const tracks = window.F1_TRACKS.TRACKS.map(track => track.id);
    if (!Array.isArray(championship.calendar) || championship.calendar.length !== tracks.length) championship.calendar = [...tracks];
    if (!championship.driverPoints || typeof championship.driverPoints !== "object") championship.driverPoints = {};
    DRIVER_IDS.forEach(id => { if (!Number.isFinite(Number(championship.driverPoints[id]))) championship.driverPoints[id] = 0; });
    if (!Array.isArray(championship.results)) championship.results = [];
    championship.roundIndex = clamp(Number(championship.roundIndex || 0), 0, championship.calendar.length);
    championship.completed = Boolean(championship.completed || championship.roundIndex >= championship.calendar.length);
    if (championship.completed && !championship.championId) {
      championship.championId = [...DRIVER_IDS].sort((a,b) =>
        Number(championship.driverPoints[b] || 0) - Number(championship.driverPoints[a] || 0)
      )[0] || null;
    }
  }

  function currentRound() {
    ensureChampionship();
    if (state.championship.completed) return null;
    const trackId = state.championship.calendar[state.championship.roundIndex];
    return {
      number:state.championship.roundIndex + 1,
      total:state.championship.calendar.length,
      track:window.F1_TRACKS.getTrack(trackId)
    };
  }

  function championshipStandings() {
    ensureChampionship();
    return DRIVER_IDS.map(id => ({
      id,
      name:driverName(id),
      team:teamForDriver(id),
      points:Number(state.championship.driverPoints[id] || 0),
      wins:state.championship.results.filter(result => result.order?.[0] === id).length,
      podiums:state.championship.results.reduce((sum, result) => sum + (result.order?.slice(0,3).includes(id) ? 1 : 0), 0)
    })).sort((a,b) => b.points - a.points || b.wins - a.wins || b.podiums - a.podiums || a.name.localeCompare(b.name,"tr"));
  }

  function constructorStandings() {
    return TEAM_DEFINITIONS.map(team => ({
      ...team,
      points:team.drivers.reduce((sum, id) => sum + Number(state.championship.driverPoints[id] || 0), 0),
      wins:state.championship.results.reduce((sum, result) => sum + (team.drivers.includes(result.order?.[0]) ? 1 : 0), 0)
    })).sort((a,b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name,"tr"));
  }

  function championshipRank() {
    return championshipStandings().findIndex(row => row.id === "player") + 1;
  }

  function weekendWeather(track, season, round) {
    const random = seededNumber(`${track.id}|S${season}|R${round}|WEATHER`);
    const roll = random() * 100;
    if (roll < Number(track.rainChance || 20) * .34) return "wet";
    if (roll < Number(track.rainChance || 20)) return "mixed";
    return "dry";
  }

  function ensureWeekend() {
    const round = currentRound();
    if (!round) return null;
    const existing = state.championship.weekend;
    if (existing && existing.roundIndex === state.championship.roundIndex && existing.trackId === round.track.id) return existing;
    const weather = weekendWeather(round.track, state.championship.season, round.number);
    state.championship.weekend = {
      roundIndex:state.championship.roundIndex,
      trackId:round.track.id,
      practiceProgram:state.settings.practiceProgram || "race-pace",
      practiceComplete:false,
      qualifyingComplete:false,
      qualifying:[],
      gridOrder:[],
      weather,
      startingCompound:weather === "wet" ? "wet" : "medium",
      pitCompound:weather === "wet" ? "intermediate" : "hard",
      setupBonus:{ pace:0, qualifying:0, tyre:0, mastery:0 },
      createdAt:new Date().toISOString()
    };
    saveState();
    return state.championship.weekend;
  }

  function practicePrograms() {
    return [
      { id:"race-pace", title:"Race Pace", text:"Yarış temposu ve fren noktaları", bonus:"Racecraft + setup", icon:"RP" },
      { id:"qualifying", title:"Qualifying Simulation", text:"Tek tur performansı ve grid avantajı", bonus:"Qualifying + setup", icon:"Q" },
      { id:"tyre", title:"Tyre Management", text:"Aşınma ve pit penceresi analizi", bonus:"Lastik ömrü", icon:"TY" },
      { id:"track", title:"Track Acclimatisation", text:"Pist ritmi ve istikrar", bonus:"Track Mastery", icon:"TM" }
    ];
  }

  function completePractice() {
    const weekend = ensureWeekend();
    if (!weekend || weekend.practiceComplete) return;
    const program = weekend.practiceProgram || "race-pace";
    weekend.setupBonus = { pace:0, qualifying:0, tyre:0, mastery:0 };
    if (program === "race-pace") weekend.setupBonus.pace = 3;
    if (program === "qualifying") weekend.setupBonus.qualifying = 4;
    if (program === "tyre") weekend.setupBonus.tyre = 5;
    if (program === "track") weekend.setupBonus.mastery = 6;
    weekend.practiceComplete = true;
    addXp(45);
    state.mastery[weekend.trackId] = Math.min(100, trackMastery(weekend.trackId) + 2 + weekend.setupBonus.mastery);
    saveState();
    toast("Antrenman programı tamamlandı. Setup verileri sıralamaya aktarıldı.", "success");
    render(host);
  }

  function qualifyingPerformance(id, weekend, track) {
    const random = seededNumber(`${state.championship.season}|${weekend.roundIndex}|${track.id}|${id}`);
    if (id === "player") {
      const attributes = state.driver.attributes;
      const car = state.car;
      const mastery = trackMastery(track.id);
      const score =
        Number(attributes.qualifying || 60) * .42 +
        Number(attributes.pace || 60) * .20 +
        Number(car.power || 60) * .16 +
        Number(car.aero || 60) * .15 +
        mastery * .07 +
        Number(weekend.setupBonus?.qualifying || 0) * 1.3;
      return score + (random() - .5) * (8 - Number(attributes.consistency || 60) * .045);
    }
    const index = DRIVER_IDS.indexOf(id);
    const base = 59 + ((index * 13) % 23);
    return base + (random() - .5) * 6;
  }

  function simulateQualifying() {
    const weekend = ensureWeekend();
    if (!weekend || !weekend.practiceComplete || weekend.qualifyingComplete) return;
    const track = window.F1_TRACKS.getTrack(weekend.trackId);
    const baseTime = 70 + Number(track.difficulty || 3) * 4.2 + track.points.length * .42;
    const rows = DRIVER_IDS.map(id => {
      const performance = qualifyingPerformance(id, weekend, track);
      const wetPenalty = weekend.weather === "wet"
        ? (id === "player" ? (100 - Number(state.driver.attributes.wetSkill || 60)) * .018 : ((DRIVER_IDS.indexOf(id) * 7) % 9) * .025)
        : 0;
      const time = baseTime - performance * .145 + wetPenalty;
      return { id, name:driverName(id), time:Math.max(45, time), team:teamForDriver(id) };
    }).sort((a,b) => a.time - b.time);
    weekend.qualifying = rows;
    weekend.gridOrder = rows.map(row => row.id);
    weekend.qualifyingComplete = true;
    saveState();
    toast(`Sıralama tamamlandı: ${rows.findIndex(row => row.id === "player") + 1}. sıra.`, "success");
    render(host);
  }

  function attributeUpgradeCost(value) {
    if (value < 70) return 1;
    if (value < 85) return 2;
    return 3;
  }

  function upgradeDriverAttribute(key) {
    const current = Number(state.driver.attributes[key] || 60);
    if (current >= 95) return;
    const cost = attributeUpgradeCost(current);
    if (state.driver.skillPoints < cost) {
      toast(`${cost} skill point gerekiyor.`, "error");
      return;
    }
    state.driver.skillPoints -= cost;
    state.driver.attributes[key] = current + 1;
    state.driver.rating = Math.min(99, Math.round(Object.values(state.driver.attributes).reduce((sum, value) => sum + Number(value), 0) / Object.keys(state.driver.attributes).length));
    saveState();
    render(host);
  }

  function carUpgradeCost(value) { return 100 + Math.max(0, Number(value || 60) - 60) * 14; }

  function upgradeCar(key) {
    const current = Number(state.car[key] || 60);
    if (current >= 95) return;
    const cost = carUpgradeCost(current);
    if (state.car.rdPoints < cost) {
      toast(`${cost} R&D puanı gerekiyor.`, "error");
      return;
    }
    state.car.rdPoints -= cost;
    state.car[key] = current + 1;
    saveState();
    render(host);
  }

  function calculateRewards(data) {
    let xp = data.retired ? 35 : 90;
    if (!data.retired) {
      if (data.rank === 1) xp += 230;
      else if (data.rank <= 3) xp += 150;
      else if (data.rank <= 6) xp += 75;
    }
    xp += Math.min(88, data.stats.overtakes * 8);
    if (data.stats.clean && !data.retired) xp += 60;
    if (data.stats.pitStops > 0) xp += 20;
    if (data.weather?.mode !== "dry") xp += 30;
    if (data.drivingMode === "attack" && !data.retired) xp += 20;
    if (state.settings.difficulty === "elite") xp += 55;
    if (state.settings.difficulty === "standard") xp += 20;
    xp = Math.max(20, xp - Number(data.penaltySeconds || 0) * 3);
    const mastery = data.retired ? 3 : Math.max(4, 17 - data.rank + (data.stats.clean ? 5 : 0) + (data.weather?.mode !== "dry" ? 2 : 0));
    const rd = data.retired ? 35 : 65 + Math.max(0, 13 - data.rank) * 8 + (data.stats.clean ? 25 : 0);
    return { xp, mastery, rd };
  }

  function recordChampionshipResult(data) {
    if (currentRaceContext?.mode !== "championship") return;
    const weekend = state.championship.weekend;
    if (!weekend || weekend.resultRecorded) return;
    const order = data.standings.map(car => car.id);
    order.forEach((id, index) => {
      const earned = data.retired && id === "player" ? 0 : Number(POINTS[index] || 0);
      state.championship.driverPoints[id] = Number(state.championship.driverPoints[id] || 0) + earned;
    });
    const resultRow = {
      season:state.championship.season,
      round:state.championship.roundIndex + 1,
      trackId:currentRaceContext.trackId,
      order,
      playerRank:data.rank,
      weather:data.weather?.mode || currentRaceContext.weather,
      bestLap:data.bestLap,
      retired:Boolean(data.retired),
      retirementReason:data.retirementReason || "",
      penaltySeconds:Number(data.penaltySeconds || 0),
      safetyCars:Number(data.stats?.safetyCars || 0),
      createdAt:new Date().toISOString()
    };
    state.championship.results.push(resultRow);
    state.championship.lastResult = resultRow;
    weekend.resultRecorded = true;
    state.championship.roundIndex += 1;
    state.championship.weekend = null;
    if (state.championship.roundIndex >= state.championship.calendar.length) {
      state.championship.completed = true;
      state.championship.championId = championshipStandings()[0]?.id || null;
    }
  }

  function showResult(data) {
    result = data;
    const rewards = calculateRewards(data);
    state.driver.races += 1;
    if (data.retired) state.driver.dnfs += 1;
    if (!data.retired && data.rank === 1) state.driver.wins += 1;
    if (!data.retired && data.rank <= 3) state.driver.podiums += 1;
    state.driver.penalties += Number(data.penaltySeconds || 0);
    state.driver.safetyCars += Number(data.stats?.safetyCars || 0);
    const levels = addXp(rewards.xp);
    state.car.rdPoints += rewards.rd;
    const trackId = currentRaceContext?.trackId || state.settings.trackId;
    state.mastery[trackId] = Math.min(100, trackMastery(trackId) + rewards.mastery);
    const record = state.records[trackId] || {};
    if (!data.retired && (!record.bestLap || (data.bestLap && data.bestLap < record.bestLap))) record.bestLap = data.bestLap;
    if (!data.retired) record.bestFinish = Math.min(record.bestFinish || 99, data.rank);
    record.races = Number(record.races || 0) + 1;
    record.dnfs = Number(record.dnfs || 0) + (data.retired ? 1 : 0);
    record.pitStops = Number(record.pitStops || 0) + Number(data.stats.pitStops || 0);
    record.penaltySeconds = Number(record.penaltySeconds || 0) + Number(data.penaltySeconds || 0);
    record.safetyCars = Number(record.safetyCars || 0) + Number(data.stats.safetyCars || 0);
    state.records[trackId] = record;
    recordChampionshipResult(data);
    saveState();

    const panel = document.getElementById("f1ResultPanel");
    if (!panel) return;
    const championshipText = currentRaceContext?.mode === "championship"
      ? state.championship.completed
        ? `Şampiyona tamamlandı · ${driverName(state.championship.championId)} şampiyon`
        : `Şampiyona sırası: P${championshipRank()} · Sonraki yarış hazır`
      : "Serbest yarış sonucu";
    const damageAverage = data.damage
      ? Math.round((Number(data.damage.frontWing || 0) + Number(data.damage.floor || 0) + Number(data.damage.engine || 0)) / 3)
      : 100;
    const resultTitle = data.retired ? `DNF · ${data.track.name}` : `P${data.rank} · ${data.track.name}`;
    const resultText = data.retired
      ? `${data.retirementReason || "Mechanical retirement"}. Deneyim kaydedildi.`
      : data.rank === 1
        ? "Dominant victory. Championship pace."
        : data.rank <= 3
          ? "Podium secured. Elite performance."
          : "Race completed. Experience earned.";
    panel.innerHTML = `<span>${data.retired?"RACE RETIREMENT":"GRAND PRIX COMPLETE"}</span><h2>${esc(resultTitle)}</h2><p>${esc(resultText)}</p><div class="f1-result-kpis"><div><b>+${rewards.xp}</b><small>DRIVER XP</small></div><div><b>+${rewards.rd}</b><small>TEAM R&D</small></div><div><b>+${rewards.mastery}</b><small>TRACK MASTERY</small></div><div><b>${formatTime(data.bestLap)}</b><small>BEST LAP</small></div><div><b>${Number(data.penaltySeconds||0)}s</b><small>PENALTY</small></div><div><b>${damageAverage}%</b><small>CAR HEALTH</small></div><div><b>${Number(data.stats?.safetyCars||0)}</b><small>SAFETY CAR</small></div><div><b>${String(data.drivingMode||"balanced").toUpperCase()}</b><small>FINAL MODE</small></div></div><div class="f1-result-championship">${esc(championshipText)}</div>${levels?`<div class="f1-level-up">LEVEL UP · DRIVER LEVEL ${state.driver.level}</div>`:""}<div class="f1-result-actions">${currentRaceContext?.mode === "quick"?`<button class="btn btn-gold" data-f1-action="restart">Tekrar Yarış</button>`:""}<button class="btn btn-gold" data-f1-action="exit">Formula Merkezine Dön</button></div>`;
    panel.classList.remove("hidden");
  }

  function dashboardCard() {
    ensureChampionship();
    const round = currentRound();
    return `<section class="f1-dashboard-promo"><div class="f1-dashboard-copy"><span>PLAYABLE GRAND PRIX EXPERIENCE</span><h3>Formula Racing</h3><p>PC klavyesi veya mobil dokunmatik kontrollerle yarış; hasar, Safety Car, VSC, pist limitleri, cezalar, pit onarımı ve 8 yarışlık şampiyona.</p><div><button class="btn btn-gold" data-nav="formula1">Formula Racing'i Aç</button><b>${round?`NEXT · ${esc(round.track.name)}`:"SEASON COMPLETE"}</b></div></div><div class="f1-dashboard-car"><i></i><strong>${championshipRank()}</strong><span>CHAMPIONSHIP POSITION</span></div></section>`;
  }

  function heroMarkup() {
    ensureChampionship();
    const round = currentRound();
    return `<section class="f1-hero f1-gp-hero"><div class="f1-hero-copy"><span>FORMULA RACING · RACE CONTROL & SURVIVAL</span><h2>Drive.<br><em>Survive. Dominate.</em></h2><p>PC ve mobilde gerçek sürüş; Safety Car, VSC, araç hasarı, lastik patlaması, pist limitleri, cezalar, pit onarımı ve dinamik yarış modları.</p><div class="f1-hero-actions">${round?`<button class="btn btn-gold" data-f1-action="tab" data-tab="weekend">Grand Prix Weekend</button>`:`<button class="btn btn-gold" data-f1-action="new-championship">Yeni Sezonu Başlat</button>`}<button class="btn btn-ghost" data-f1-action="quick-start">Hızlı Yarış</button><button class="btn btn-ghost" data-f1-action="open-controls">Kontroller</button></div></div><aside class="f1-driver-card"><span>DRIVER PROFILE</span><h3>${esc(playerName())}</h3><div class="f1-driver-level"><strong>${state.driver.level}</strong><small>LEVEL</small></div><div class="f1-xp"><i><b style="width:${levelProgress()}%"></b></i><span>${state.driver.xp} / ${xpForNext(state.driver.level)} XP</span></div><div class="f1-driver-kpis"><div><b>${state.driver.rating}</b><small>RATING</small></div><div><b>P${championshipRank()}</b><small>CHAMPIONSHIP</small></div><div><b>${state.driver.dnfs || 0}</b><small>DNF</small></div></div></aside></section>`;
  }

  function navigationMarkup() {
    return `<nav class="f1-mode-tabs"><button class="${selectedTab==="weekend"?"active":""}" data-f1-action="tab" data-tab="weekend"><span>01</span><strong>Grand Prix Weekend</strong><small>Practice · Qualifying · Race</small></button><button class="${selectedTab==="championship"?"active":""}" data-f1-action="tab" data-tab="championship"><span>02</span><strong>Championship</strong><small>Pilotlar · Takımlar · Takvim</small></button><button class="${selectedTab==="development"?"active":""}" data-f1-action="tab" data-tab="development"><span>03</span><strong>Driver Lab</strong><small>XP · Skills · Car R&D</small></button></nav>`;
  }

  function practiceMarkup(weekend) {
    const programs = practicePrograms();
    return `<section class="f1-weekend-step ${weekend.practiceComplete?"complete":"active"}"><header><div><span>SESSION 1</span><h3>Practice Programme</h3><p>Bir program seç. Kazanılan setup verisi sıralama ve yarış performansını etkiler.</p></div><b>${weekend.practiceComplete?"✓ COMPLETE":"ACTIVE"}</b></header><div class="f1-practice-grid">${programs.map(program => `<button class="${weekend.practiceProgram===program.id?"active":""}" data-f1-action="practice-program" data-program="${program.id}" ${weekend.practiceComplete?"disabled":""}><span>${program.icon}</span><strong>${program.title}</strong><small>${program.text}</small><em>${program.bonus}</em></button>`).join("")}</div>${!weekend.practiceComplete?`<button class="btn btn-gold" data-f1-action="complete-practice">Antrenmanı Tamamla</button>`:`<div class="f1-session-complete">Setup bonusu hazır · Track Mastery güncellendi</div>`}</section>`;
  }

  function qualifyingMarkup(weekend) {
    const playerPosition = weekend.qualifyingComplete ? weekend.gridOrder.indexOf("player") + 1 : null;
    return `<section class="f1-weekend-step ${weekend.qualifyingComplete?"complete":weekend.practiceComplete?"active":"locked"}"><header><div><span>SESSION 2</span><h3>Qualifying</h3><p>Driver Qualifying, araç performansı, pist uzmanlığı ve hava tahminiyle grid oluşturulur.</p></div><b>${weekend.qualifyingComplete?`P${playerPosition}`:weekend.practiceComplete?"READY":"LOCKED"}</b></header>${weekend.qualifyingComplete?`<div class="f1-qualifying-table">${weekend.qualifying.slice(0,12).map((row,index)=>`<div class="${row.id==="player"?"player":""}"><span>${index+1}</span><i style="background:${row.team.color}"></i><strong>${esc(row.name)}</strong><small>${esc(row.team.name)}</small><b>${formatTime(row.time)}</b></div>`).join("")}</div>`:`<div class="f1-session-placeholder"><strong>${weekend.practiceComplete?"Sıralama simülasyonu hazır":"Önce practice programını tamamla"}</strong><small>${weekend.weather.toUpperCase()} hava tahmini</small></div>`}${weekend.practiceComplete&&!weekend.qualifyingComplete?`<button class="btn btn-gold" data-f1-action="qualifying">Sıralamayı Başlat</button>`:""}</section>`;
  }

  function strategyMarkup(weekend) {
    const forecast = weekend.weather === "wet" ? "Yoğun yağmur" : weekend.weather === "mixed" ? "Değişken · yağmur ihtimali" : "Kuru pist";
    return `<section class="f1-weekend-step ${weekend.qualifyingComplete?"active":"locked"}"><header><div><span>SESSION 3</span><h3>Race Strategy</h3><p>Başlangıç lastiğini, pit lastiğini ve ilk sürüş modunu belirle. Yarış içinde 1/2/3 ile modu değiştirebilirsin.</p></div><b>${weekend.qualifyingComplete?"RACE READY":"LOCKED"}</b></header><div class="f1-strategy-grid"><label><span>Hava Tahmini</span><strong>${forecast}</strong><small>Track rain probability %${window.F1_TRACKS.getTrack(weekend.trackId).rainChance}</small></label><label><span>Başlangıç Lastiği</span><select id="f1WeekendStartTyre">${Object.values(compounds()).map(item=>`<option value="${item.id}" ${weekend.startingCompound===item.id?"selected":""}>${item.label}</option>`).join("")}</select></label><label><span>Pit Lastiği</span><select id="f1WeekendPitTyre">${Object.values(compounds()).map(item=>`<option value="${item.id}" ${weekend.pitCompound===item.id?"selected":""}>${item.label}</option>`).join("")}</select></label><label><span>İlk Sürüş Modu</span><select id="f1WeekendDriveMode"><option value="conserve" ${state.settings.drivingMode==="conserve"?"selected":""}>Conserve</option><option value="balanced" ${state.settings.drivingMode==="balanced"?"selected":""}>Balanced</option><option value="attack" ${state.settings.drivingMode==="attack"?"selected":""}>Attack</option></select><small>1 / 2 / 3 tuşlarıyla yarışta değiştir</small></label><label><span>Race Control</span><strong>Realistic</strong><small>Safety Car · VSC · track limits</small></label><label><span>Yarış Uzunluğu</span><strong>${window.F1_TRACKS.getTrack(weekend.trackId).laps} Tur</strong><small>Şampiyona formatı</small></label></div>${weekend.qualifyingComplete?`<button class="btn btn-gold btn-wide" data-f1-action="start-championship-race">Grand Prix'yi Başlat</button>`:""}</section>`;
  }

  function quickRaceMarkup() {
    const tracks = window.F1_TRACKS.TRACKS;
    const selected = window.F1_TRACKS.getTrack(state.settings.trackId);
    return `<section class="f1-panel f1-quick-race"><header><div><span>QUICK RACE</span><h3>Serbest Yarış</h3><p>Şampiyonadan bağımsız pist, hava, incident yoğunluğu ve sürüş modunu seçerek hemen sür.</p></div><b>PC + MOBILE</b></header><div class="f1-track-grid">${tracks.map(track=>`<button class="f1-track-card ${track.id===selected.id?"active":""} ${track.accent}" data-f1-action="track" data-track="${track.id}"><span>${track.country}</span><strong>${track.name}</strong><small>${track.character}</small><i>${trackMastery(track.id)} / 100 MASTERY</i></button>`).join("")}</div><div class="f1-quick-config f1-quick-config-v3"><label><span>Zorluk</span><select id="f1Difficulty"><option value="rookie" ${state.settings.difficulty==="rookie"?"selected":""}>Rookie</option><option value="standard" ${state.settings.difficulty==="standard"?"selected":""}>Standard</option><option value="elite" ${state.settings.difficulty==="elite"?"selected":""}>Elite</option></select></label><label><span>Tur</span><select id="f1Laps"><option value="3" ${state.settings.laps===3?"selected":""}>3 Tur</option><option value="5" ${state.settings.laps===5?"selected":""}>5 Tur</option><option value="7" ${state.settings.laps===7?"selected":""}>7 Tur</option></select></label><label><span>Hava</span><select id="f1Weather"><option value="dynamic" ${state.settings.weather==="dynamic"?"selected":""}>Dinamik</option><option value="dry" ${state.settings.weather==="dry"?"selected":""}>Kuru</option><option value="mixed" ${state.settings.weather==="mixed"?"selected":""}>Değişken</option><option value="wet" ${state.settings.weather==="wet"?"selected":""}>Yağmurlu</option></select></label><label><span>Incident Seviyesi</span><select id="f1IncidentLevel"><option value="low" ${state.settings.incidentLevel==="low"?"selected":""}>Low</option><option value="realistic" ${state.settings.incidentLevel==="realistic"?"selected":""}>Realistic</option><option value="high" ${state.settings.incidentLevel==="high"?"selected":""}>Chaos</option></select></label><label><span>Sürüş Modu</span><select id="f1DriveMode"><option value="conserve" ${state.settings.drivingMode==="conserve"?"selected":""}>Conserve</option><option value="balanced" ${state.settings.drivingMode==="balanced"?"selected":""}>Balanced</option><option value="attack" ${state.settings.drivingMode==="attack"?"selected":""}>Attack</option></select></label><label><span>Başlangıç</span><select id="f1StartTyre">${Object.values(compounds()).map(item=>`<option value="${item.id}" ${state.settings.startingCompound===item.id?"selected":""}>${item.label}</option>`).join("")}</select></label><label><span>Pit Lastiği</span><select id="f1PitTyre">${Object.values(compounds()).map(item=>`<option value="${item.id}" ${state.settings.pitCompound===item.id?"selected":""}>${item.label}</option>`).join("")}</select></label><button class="btn btn-gold" data-f1-action="quick-start">Hızlı Yarışı Başlat</button></div></section>`;
  }

  function weekendMarkup() {
    const round = currentRound();
    if (!round) return `<section class="f1-season-champion"><span>SEASON ${state.championship.season} COMPLETE</span><h2>${esc(driverName(state.championship.championId))}</h2><p>Formula Racing Dünya Şampiyonu</p><button class="btn btn-gold" data-f1-action="new-championship">Yeni Sezonu Başlat</button></section>${quickRaceMarkup()}`;
    const weekend = ensureWeekend();
    return `<section class="f1-next-gp"><div><span>ROUND ${round.number} / ${round.total}</span><h2>${esc(round.track.name)}</h2><p>${esc(round.track.country)} · ${esc(round.track.character)} · ${round.track.laps} tur</p></div><aside><strong>P${championshipRank()}</strong><span>CHAMPIONSHIP</span><small>${championshipStandings().find(row=>row.id==="player")?.points||0} PTS</small></aside></section><div class="f1-weekend-grid">${practiceMarkup(weekend)}${qualifyingMarkup(weekend)}${strategyMarkup(weekend)}</div>${quickRaceMarkup()}`;
  }

  function championshipMarkup() {
    const drivers = championshipStandings();
    const teams = constructorStandings();
    const tracks = state.championship.calendar.map((id,index)=>({track:window.F1_TRACKS.getTrack(id),index,result:state.championship.results.find(row=>row.round===index+1)}));
    return `<section class="f1-championship-head"><div><span>SEASON ${state.championship.season}</span><h2>Formula Racing Championship</h2><p>8 Grand Prix · 12 pilot · 6 takım</p></div><aside><strong>${state.championship.completed?"FINAL":`${state.championship.roundIndex}/${state.championship.calendar.length}`}</strong><small>SEASON PROGRESS</small></aside></section><section class="f1-championship-grid"><article class="f1-panel"><header><div><span>DRIVERS</span><h3>Pilotlar Şampiyonası</h3></div></header><div class="f1-champ-table">${drivers.map((row,index)=>`<div class="${row.id==="player"?"player":""}"><span>${index+1}</span><i style="background:${row.team.color}"></i><strong>${esc(row.name)}</strong><small>${esc(row.team.name)} · ${row.wins} W</small><b>${row.points}</b></div>`).join("")}</div></article><article class="f1-panel"><header><div><span>CONSTRUCTORS</span><h3>Takımlar Şampiyonası</h3></div></header><div class="f1-team-table">${teams.map((team,index)=>`<div><span>${index+1}</span><i style="background:${team.color}"></i><strong>${esc(team.name)}</strong><small>${team.drivers.map(driverName).join(" · ")}</small><b>${team.points}</b></div>`).join("")}</div></article></section><section class="f1-panel f1-calendar"><header><div><span>CALENDAR</span><h3>Sezon Takvimi</h3></div></header><div>${tracks.map(row=>`<article class="${row.result?"complete":row.index===state.championship.roundIndex?"active":""}"><span>R${row.index+1}</span><strong>${esc(row.track.name)}</strong><small>${row.result?`${row.result.retired?"DNF":`P${row.result.playerRank}`} · ${row.result.weather.toUpperCase()}${row.result.penaltySeconds?` · +${row.result.penaltySeconds}s`:""}`:row.index===state.championship.roundIndex?"NEXT GRAND PRIX":"UPCOMING"}</small><b>${row.result?`${row.result.retired?0:(POINTS[row.result.playerRank-1]||0)} PTS`:row.track.country}</b></article>`).join("")}</div></section>`;
  }

  function developmentMarkup() {
    const attributeLabels = { pace:"Pace", qualifying:"Qualifying", racecraft:"Racecraft", tyreManagement:"Tyre Management", wetSkill:"Wet Skill", consistency:"Consistency" };
    const carLabels = { power:"Engine Power", aero:"Aerodynamics", tyre:"Tyre Efficiency", pitCrew:"Pit Crew", reliability:"Reliability" };
    return `<section class="f1-development-head"><div><span>DRIVER DEVELOPMENT</span><h2>Experience becomes performance.</h2><p>Skill point ve R&D yatırımlarını dengeli kullan. Yüksek seviyeler daha pahalıdır.</p></div><div><strong>${state.driver.skillPoints}</strong><small>SKILL POINTS</small></div><div><strong>${state.car.rdPoints}</strong><small>TEAM R&D</small></div></section><section class="f1-development-grid"><article class="f1-panel"><header><div><span>DRIVER ATTRIBUTES</span><h3>Pilot Gelişimi</h3></div><b>RATING ${state.driver.rating}</b></header><div class="f1-upgrade-list">${Object.entries(attributeLabels).map(([key,label])=>{const value=Number(state.driver.attributes[key]||60),cost=attributeUpgradeCost(value);return `<div><span>${label}</span><i><b style="width:${value}%"></b></i><strong>${value}</strong><button data-f1-action="upgrade-driver" data-key="${key}" ${value>=95||state.driver.skillPoints<cost?"disabled":""}>+1 · ${cost} SP</button></div>`;}).join("")}</div></article><article class="f1-panel"><header><div><span>CAR DEVELOPMENT</span><h3>Dragon Racing R&D</h3></div><b>${state.car.rdPoints} R&D</b></header><div class="f1-upgrade-list car">${Object.entries(carLabels).map(([key,label])=>{const value=Number(state.car[key]||60),cost=carUpgradeCost(value);return `<div><span>${label}</span><i><b style="width:${value}%"></b></i><strong>${value}</strong><button data-f1-action="upgrade-car" data-key="${key}" ${value>=95||state.car.rdPoints<cost?"disabled":""}>+1 · ${cost}</button></div>`;}).join("")}</div></article></section><section class="f1-panel f1-mastery-board"><header><div><span>TRACK MASTERY</span><h3>Pist Uzmanlığı</h3></div></header><div>${window.F1_TRACKS.TRACKS.map(track=>`<article><span>${track.country}</span><strong>${track.name}</strong><i><b style="width:${trackMastery(track.id)}%"></b></i><small>${trackMastery(track.id)} / 100 · ${track.mastery}</small></article>`).join("")}</div></section>`;
  }

  function render(container) {
    host = container;
    stopRace();
    document.body.classList.remove("f1-race-active");
    result = null;
    ensureChampionship();
    host.innerHTML = `<section class="f1-hub f1-grand-prix-hub">${heroMarkup()}${navigationMarkup()}${selectedTab==="weekend"?weekendMarkup():selectedTab==="championship"?championshipMarkup():developmentMarkup()}</section>`;
  }

  function controlsModal() {
    const modal = document.getElementById("modalBackdrop");
    const title = document.getElementById("modalTitle");
    const eyebrow = document.getElementById("modalEyebrow");
    const body = document.getElementById("modalBody");
    if (!modal || !body) return;
    title.textContent = "Formula Racing Kontrolleri";
    eyebrow.textContent = "PC + MOBILE · RACE CONTROL";
    body.innerHTML = `<div class="f1-controls-modal"><h3>PC</h3><p><b>W / ↑</b> gaz · <b>S / ↓</b> fren · <b>A D / ← →</b> yön · <b>Space</b> ERS · <b>Shift</b> DRS · <b>P</b> pit-stop · <b>R</b> reset · <b>Esc</b> pause.</p><p><b>1</b> Conserve · <b>2</b> Balanced · <b>3</b> Attack.</p><h3>Mobil</h3><p>Telefonu yatay çevir. Sol tarafta direksiyon; sağ tarafta gaz, fren, ERS, DRS ve PIT kontrolleri bulunur. Alt bölümde sürüş modu seçilir.</p><div class="info-box">Safety Car veya VSC sırasında hız otomatik sınırlandırılır ve DRS kapanır. Temaslar ön kanat, taban ve motor hasarına yol açabilir. Pit-stop sırasında lastik değişimiyle birlikte gerekli onarımlar yapılır.</div></div>`;
    modal.classList.remove("hidden");
  }

  function raceMarkup(context) {
    const startTyre = compound(context.startingCompound);
    const pitTyre = compound(context.pitCompound);
    return `<section class="f1-race-view"><canvas id="f1RaceCanvas" aria-label="Formula Racing oyun alanı"></canvas><div class="f1-race-topbar"><div class="f1-race-brand"><span>FR</span><div><strong>FORMULA RACING</strong><small id="f1TrackName">—</small></div></div><div class="f1-race-session"><b id="f1Lap">LAP 1 / ${context.laps}</b><strong id="f1Position">P12</strong><span id="f1Time">0:00.00</span></div><div class="f1-race-actions"><button data-f1-action="pause">Ⅱ</button><button data-f1-action="fullscreen">⛶</button><button data-f1-action="exit">×</button></div></div><div class="f1-race-control-status green" id="f1RaceControlStatus"><strong id="f1Flag">GREEN FLAG</strong><small id="f1ControlReason">TRACK CLEAR</small></div><aside class="f1-live-standings" id="f1Standings"></aside><aside class="f1-event-feed" id="f1EventFeed"><header>RACE CONTROL</header></aside><div class="f1-telemetry f1-telemetry-v3"><div><span>SPEED</span><strong id="f1Speed">0</strong><small>KM/H</small></div><div><span>TYRE</span><strong id="f1Tyre" style="color:${startTyre.color}">${startTyre.label}</strong><small id="f1TyreWear">0% WEAR</small></div><div><span>CAR HEALTH</span><i><b id="f1CarHealthBar" style="width:100%"></b></i><strong id="f1Damage">100%</strong></div><div><span>RACE CONTROL</span><strong id="f1FlagMini">GREEN</strong><small id="f1Penalty">0s PENALTY</small></div><div><span>ERS</span><i><b id="f1ErsBar" style="width:100%"></b></i><strong id="f1Ers">100%</strong></div><div><span>WEATHER</span><strong id="f1Weather">${context.weather.toUpperCase()}</strong><small id="f1Wetness">0% WET</small></div><div><span>DRS</span><strong id="f1Drs">LOCKED</strong><small>SHIFT / DRS</small></div><div><span>BEST LAP</span><strong id="f1BestLap">—</strong><small id="f1PitStatus">PIT: ${pitTyre.label}</small></div></div><div class="f1-drive-mode-selector"><span>DRIVE MODE</span><button class="${context.drivingMode==="conserve"?"active":""}" data-f1-action="drive-mode" data-mode="conserve">1 · CONSERVE</button><button class="${context.drivingMode==="balanced"?"active":""}" data-f1-action="drive-mode" data-mode="balanced">2 · BALANCED</button><button class="${context.drivingMode==="attack"?"active":""}" data-f1-action="drive-mode" data-mode="attack">3 · ATTACK</button></div><div class="f1-pit-selector"><span>NEXT PIT TYRE</span>${Object.values(compounds()).map(item=>`<button class="${context.pitCompound===item.id?"active":""}" data-f1-action="pit-compound" data-compound="${item.id}" style="--compound:${item.color}">${item.label}</button>`).join("")}</div><div class="f1-mobile-controls" aria-label="Mobil yarış kontrolleri"><div class="f1-steer-controls"><button data-f1-control="left">◀</button><button data-f1-control="right">▶</button></div><div class="f1-pedal-controls"><button class="pit" data-f1-control="pit">PIT</button><button class="brake" data-f1-control="brake">FREN</button><button class="throttle" data-f1-control="throttle">GAZ</button><button class="boost" data-f1-control="boost">ERS</button><button class="drs" data-f1-control="drs">DRS</button></div></div><div class="f1-rotate-hint"><span>↻</span><strong>Telefonu yatay çevir</strong><small>Daha iyi sürüş alanı için</small></div><div class="f1-pause-panel hidden" id="f1PausePanel"><span>RACE PAUSED</span><h2>Yarış duraklatıldı</h2><button class="btn btn-gold" data-f1-action="resume">Devam Et</button><button class="btn btn-ghost" data-f1-action="exit">Ana Merkeze Dön</button></div><div class="f1-result-panel hidden" id="f1ResultPanel"></div></section>`;
  }

  function startRace(context) {
    stopRace();
    result = null;
    currentRaceContext = context;
    eventFeed = [];
    document.body.classList.add("f1-race-active");
    host.innerHTML = raceMarkup(context);
    const canvas = document.getElementById("f1RaceCanvas");
    const Engine = window.F1_RACE_ENGINE.FormulaRaceEngine;
    engine = new Engine(canvas, {
      trackId:context.trackId,
      laps:context.laps,
      difficulty:state.settings.difficulty,
      playerName:playerName(),
      mode:context.mode,
      gridOrder:context.gridOrder || [],
      startingCompound:context.startingCompound,
      pitCompound:context.pitCompound,
      weather:context.weather,
      incidentLevel:context.incidentLevel || "realistic",
      drivingMode:context.drivingMode || state.settings.drivingMode || "balanced",
      weatherSeed:`S${state.championship.season}|R${context.roundIndex ?? "Q"}|${context.trackId}`,
      mastery:trackMastery(context.trackId),
      driverAttributes:{
        ...state.driver.attributes,
        racecraft:Number(state.driver.attributes.racecraft||60) + Number(context.setupBonus?.pace||0),
        tyreManagement:Number(state.driver.attributes.tyreManagement||60) + Number(context.setupBonus?.tyre||0)
      },
      carDevelopment:state.car,
      onTick:updateHud,
      onPause:paused => document.getElementById("f1PausePanel")?.classList.toggle("hidden", !paused),
      onEvent:addRaceEvent,
      onFinish:showResult
    });
    document.getElementById("f1TrackName").textContent = window.F1_TRACKS.getTrack(context.trackId).name;
    bindMobileControls();
    addRaceEvent({title:"GRID READY",text:`${compound(context.startingCompound).label} · ${context.weather.toUpperCase()} · ${String(context.drivingMode||"balanced").toUpperCase()} · P${(context.gridOrder||[]).indexOf("player")+1||12}`});
    engine.start();
  }

  function startQuickRace() {
    startRace({
      mode:"quick",
      trackId:state.settings.trackId,
      laps:Number(state.settings.laps || 5),
      weather:state.settings.weather || "dynamic",
      incidentLevel:state.settings.incidentLevel || "realistic",
      drivingMode:state.settings.drivingMode || "balanced",
      startingCompound:state.settings.startingCompound || "medium",
      pitCompound:state.settings.pitCompound || "hard",
      gridOrder:DRIVER_IDS,
      setupBonus:{},
      roundIndex:null
    });
  }

  function startChampionshipRace() {
    const weekend = ensureWeekend();
    if (!weekend?.qualifyingComplete) {
      toast("Önce sıralamayı tamamla.", "error");
      return;
    }
    const track = window.F1_TRACKS.getTrack(weekend.trackId);
    startRace({
      mode:"championship",
      trackId:weekend.trackId,
      laps:Number(track.laps || 5),
      weather:weekend.weather,
      incidentLevel:"realistic",
      drivingMode:state.settings.drivingMode || "balanced",
      startingCompound:weekend.startingCompound,
      pitCompound:weekend.pitCompound,
      gridOrder:weekend.gridOrder,
      setupBonus:weekend.setupBonus,
      roundIndex:weekend.roundIndex
    });
  }

  function addRaceEvent(event) {
    eventFeed.unshift({ ...event, time:new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit",second:"2-digit"}) });
    eventFeed = eventFeed.slice(0,5);
    const node = document.getElementById("f1EventFeed");
    if (node) node.innerHTML = `<header>RACE CONTROL</header>${eventFeed.map(item=>`<div><span>${esc(item.title)}</span><p>${esc(item.text)}</p><small>${item.time}</small></div>`).join("")}`;
  }

  function updateHud(snapshot) {
    lastSnapshot = snapshot;
    const player = snapshot.player;
    const speed = Math.max(0, Math.round(player.speed * .82));
    const set = (id, text) => { const node=document.getElementById(id); if(node) node.textContent=text; };
    const health = snapshot.damage
      ? Math.round((Number(snapshot.damage.frontWing||0)+Number(snapshot.damage.floor||0)+Number(snapshot.damage.engine||0))/3)
      : 100;
    const flag = snapshot.raceControl?.status || "GREEN";
    set("f1Lap", `LAP ${snapshot.lap} / ${snapshot.lapsTarget}`);
    set("f1Position", player.retired ? "DNF" : `P${snapshot.rank}`);
    set("f1Time", formatTime(snapshot.elapsed));
    set("f1Speed", speed);
    set("f1Ers", `${Math.round(player.ers)}%`);
    set("f1BestLap", formatTime(player.bestLap));
    set("f1Tyre", player.puncture ? "PUNCTURE" : compound(player.tyreCompound).label);
    set("f1TyreWear", `${Math.round(player.tyreWear)}% WEAR`);
    set("f1Weather", snapshot.weather.label);
    set("f1Wetness", `${Math.round(snapshot.weather.wetness*100)}% WET`);
    set("f1Drs", player.drs ? "OPEN" : player.drsAvailable ? "AVAILABLE" : "LOCKED");
    set("f1Damage", `${health}%`);
    set("f1Penalty", `${Number(snapshot.stats.penaltySeconds||0)}s · ${Number(snapshot.stats.trackLimitWarnings||0)} WARN`);
    set("f1Flag", flag === "GREEN" ? "GREEN FLAG" : flag);
    set("f1FlagMini", flag);
    set("f1ControlReason", String(snapshot.raceControl?.reason || "Track clear").toUpperCase());
    set("f1PitStatus", player.pitTimer>0?`PIT ${player.pitTimer.toFixed(1)}s`:player.pitRequested?`PIT REQUESTED · ${compound(player.nextCompound).label}`:`PIT: ${compound(snapshot.pitCompound).label}`);
    const tyreNode=document.getElementById("f1Tyre");
    if(tyreNode) tyreNode.style.color=player.puncture?"#ff6b63":compound(player.tyreCompound).color;
    const ersBar=document.getElementById("f1ErsBar"); if(ersBar) ersBar.style.width=`${player.ers}%`;
    const healthBar=document.getElementById("f1CarHealthBar");
    if(healthBar){
      healthBar.style.width=`${health}%`;
      healthBar.style.background=health>72?"#55e29d":health>42?"#f4c75e":"#ef4444";
    }
    const statusNode=document.getElementById("f1RaceControlStatus");
    if(statusNode){
      statusNode.className=`f1-race-control-status ${flag.toLowerCase().replaceAll(" ","-")}`;
    }
    document.querySelectorAll("[data-f1-action=drive-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode===snapshot.drivingMode));
    const standings=document.getElementById("f1Standings");
    if(standings) standings.innerHTML=`<header><span>${flag}</span><b>RACE ORDER</b></header>${snapshot.standings.slice(0,8).map((car,index)=>`<div class="${car.isPlayer?"player":""} ${car.retired?"retired":""}"><span>${index+1}</span><i style="background:${car.color}"></i><strong>${esc(car.name)}</strong><small style="color:${compound(car.tyreCompound).color}">${car.retired?"DNF":car.pitTimer>0?"PIT":car.finished?"FIN":car.puncture?"P":compound(car.tyreCompound).label.slice(0,1)}</small></div>`).join("")}`;
  }

  function bindMobileControls() {
    document.querySelectorAll("[data-f1-control]").forEach(button => {
      const control = button.dataset.f1Control;
      const activate = event => { event.preventDefault(); button.classList.add("pressed"); engine?.setMobileControl(control,true); };
      const release = event => { event.preventDefault(); button.classList.remove("pressed"); engine?.setMobileControl(control,false); };
      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    });
  }

  function stopRace() {
    engine?.destroy?.();
    engine = null;
    lastSnapshot = null;
    document.body.classList.remove("f1-race-active");
  }

  function exitRace() {
    stopRace();
    selectedTab = currentRaceContext?.mode === "championship" ? "weekend" : selectedTab;
    currentRaceContext = null;
    render(host || document.getElementById("view"));
  }

  async function fullscreen() {
    const race = document.querySelector(".f1-race-view");
    try {
      if (!document.fullscreenElement) await race?.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {}
  }

  function newChampionship() {
    state.championship = clone(DEFAULT_STATE.championship);
    state.championship.season = Number(state.championship?.season || 0) + 1;
    state.championship.season = Math.max(1, Number(state.championship.season));
    ensureChampionship();
    saveState();
    selectedTab = "weekend";
    render(host);
  }

  function toast(message, type="info") {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    window.setTimeout(() => node.remove(), 3600);
  }

  function onClick(event) {
    const target = event.target.closest("[data-f1-action]");
    if (!target) return;
    const action = target.dataset.f1Action;
    if (action === "tab") { selectedTab = target.dataset.tab || "weekend"; render(host); }
    if (action === "track") { state.settings.trackId = target.dataset.track; saveState(); render(host); }
    if (action === "practice-program") { const weekend=ensureWeekend(); if(weekend&&!weekend.practiceComplete){weekend.practiceProgram=target.dataset.program;state.settings.practiceProgram=target.dataset.program;saveState();render(host);} }
    if (action === "complete-practice") completePractice();
    if (action === "qualifying") simulateQualifying();
    if (action === "start-championship-race") startChampionshipRace();
    if (action === "quick-start") startQuickRace();
    if (action === "open-controls") controlsModal();
    if (action === "pause") engine?.togglePause();
    if (action === "resume") engine?.togglePause(false);
    if (action === "fullscreen") fullscreen();
    if (action === "exit") exitRace();
    if (action === "restart") startQuickRace();
    if (action === "pit-compound") {
      const id=target.dataset.compound;
      engine?.setPitCompound(id);
      if (currentRaceContext) currentRaceContext.pitCompound=id;
      document.querySelectorAll("[data-f1-action=pit-compound]").forEach(button=>button.classList.toggle("active",button.dataset.compound===id));
      addRaceEvent({title:"STRATEGY",text:`Pit lastiği ${compound(id).label} olarak ayarlandı.`});
    }
    if (action === "drive-mode") {
      const mode=target.dataset.mode || "balanced";
      engine?.setDrivingMode(mode);
      state.settings.drivingMode=mode;
      if (currentRaceContext) currentRaceContext.drivingMode=mode;
      saveState();
      document.querySelectorAll("[data-f1-action=drive-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode===mode));
    }
    if (action === "upgrade-driver") upgradeDriverAttribute(target.dataset.key);
    if (action === "upgrade-car") upgradeCar(target.dataset.key);
    if (action === "new-championship") {
      const previousSeason=Number(state.championship.season||1);
      state.championship=clone(DEFAULT_STATE.championship);
      state.championship.season=previousSeason+1;
      ensureChampionship();saveState();selectedTab="weekend";render(host);
    }
  }

  function onChange(event) {
    if (event.target.id === "f1Difficulty") state.settings.difficulty = event.target.value;
    if (event.target.id === "f1Laps") state.settings.laps = Number(event.target.value);
    if (event.target.id === "f1Weather") state.settings.weather = event.target.value;
    if (event.target.id === "f1IncidentLevel") state.settings.incidentLevel = event.target.value;
    if (event.target.id === "f1DriveMode") state.settings.drivingMode = event.target.value;
    if (event.target.id === "f1StartTyre") state.settings.startingCompound = event.target.value;
    if (event.target.id === "f1PitTyre") state.settings.pitCompound = event.target.value;
    if (event.target.id === "f1WeekendStartTyre") { const weekend=ensureWeekend(); if(weekend) weekend.startingCompound=event.target.value; }
    if (event.target.id === "f1WeekendPitTyre") { const weekend=ensureWeekend(); if(weekend) weekend.pitCompound=event.target.value; }
    if (event.target.id === "f1WeekendDriveMode") state.settings.drivingMode = event.target.value;
    saveState();
  }

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav && nav.dataset.nav !== "formula1") stopRace();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && engine?.running) engine.togglePause(true);
  });

  ensureChampionship();
  saveState();

  window.F1_RACING = Object.freeze({
    render,
    dashboardCard,
    stopRace,
    getState:() => clone(state),
    __diagnostics:Object.freeze({
      calculateRewards,
      xpForNext,
      getTrackMastery:trackMastery,
      ensureChampionship,
      championshipStandings,
      constructorStandings,
      qualifyingPerformance,
      attributeUpgradeCost,
      carUpgradeCost,
      points:POINTS
    })
  });
})();
