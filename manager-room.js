(() => {
  "use strict";

  const VERSION = "42.3";
  const STORAGE_KEY = "fifa-manager-room-v42";
  const CATALOG_URL = "data/manager-team-catalog-fc25.json";
  const BOOTSTRAP_URL = "data/manager-bootstrap-v42.json";
  const PIN_SESSION_PREFIX = "fifa-manager-pin:";
  const LEGS = [
    { id: 1, label: "1. Devre", stars: 4 },
    { id: 2, label: "2. Devre", stars: 4.5 },
    { id: 3, label: "3. Devre", stars: 5 }
  ];

  let bootstrap = null;
  let teamCatalog = null;
  let resourcesLoading = false;
  let activeTab = "overview";
  let poolFilter = "all";
  let drawAnimating = false;
  let remoteLeaderboard = [];
  let remoteLoading = false;
  let remoteLoadedAt = 0;

  const ctx = () => window.FIFA_APP_CONTEXT;
  const cloud = () => window.FIFA_CLOUD;
  const esc = value => ctx()?.escapeHTML
    ? ctx().escapeHTML(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : { version: VERSION, careers: [], activeCareerId: null };
    } catch (_) {
      return { version: VERSION, careers: [], activeCareerId: null };
    }
  }

  let managerState = loadLocal();

  function migrateCareer(career) {
    if (!career || typeof career !== "object") return career;
    career.teamCatalogVersion ||= null;
    career.teamDrawHistory ||= [];
    career.development ||= {};
    career.development.foundation = true;
    career.development.teamDraw = true;
    career.development.matchEngine = true;
    career.development.decisionEngine = true;
    career.development.matchCentre = true;
    career.development.dynamicElo = true;
    career.development.competitionProgression = Boolean(career.development.competitionProgression);
    career.fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    career.matchHistory = Array.isArray(career.matchHistory) ? career.matchHistory : [];
    career.matchEngineStats ||= { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, decisions: 0 };
    career.fixtures.forEach(fixture => {
      fixture.status ||= "scheduled";
      if (fixture.homeTeam === "") fixture.homeTeam = null;
      if (fixture.awayTeam === "") fixture.awayTeam = null;
      fixture.teamDraw ||= null;
      fixture.matchPlan ||= null;
      fixture.matchEngine ||= null;
      fixture.stats ||= null;
      fixture.decisions = Array.isArray(fixture.decisions) ? fixture.decisions : [];
      if (fixture.matchEngine) {
        fixture.matchEngine.version = VERSION;
        fixture.matchEngine.matchVolatility ||= 1;
        fixture.matchEngine.lastChanceMinute = Number.isFinite(fixture.matchEngine.lastChanceMinute) ? fixture.matchEngine.lastChanceMinute : -5;
        ["home", "away"].forEach(side => {
          const stats = fixture.matchEngine.stats?.[side];
          if (!stats) return;
          ["shots","onTarget","offTarget","blocked","xg","attacks","dangerous","corners","fouls","yellow","passes","passAccuracy"].forEach(key => stats[key] = Number(stats[key] || 0));
        });
      }
    });
    return career;
  }

  managerState.careers = Array.isArray(managerState.careers) ? managerState.careers.map(migrateCareer) : [];
  managerState.version = VERSION;

  function saveLocal() {
    managerState.version = VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(managerState));
  }

  function activeCareer() {
    return managerState.careers.find(item => item.id === managerState.activeCareerId) || managerState.careers[0] || null;
  }

  function setSessionPin(career, pin) {
    if (!career?.id || !/^\d{6}$/.test(String(pin || ""))) return;
    sessionStorage.setItem(`${PIN_SESSION_PREFIX}${career.id}`, String(pin));
  }

  function getSessionPin(career) {
    if (!career?.id) return "";
    return sessionStorage.getItem(`${PIN_SESSION_PREFIX}${career.id}`) || "";
  }

  async function ensureResources() {
    if ((bootstrap && teamCatalog) || resourcesLoading) return;
    resourcesLoading = true;
    try {
      const [bootstrapResponse, catalogResponse] = await Promise.all([
        fetch(BOOTSTRAP_URL, { cache: "no-store" }),
        fetch(CATALOG_URL, { cache: "no-store" })
      ]);
      if (!bootstrapResponse.ok) throw new Error("Manager başlangıç verisi yüklenemedi.");
      if (!catalogResponse.ok) throw new Error("FC 25 takım kataloğu yüklenemedi.");
      bootstrap = await bootstrapResponse.json();
      teamCatalog = await catalogResponse.json();
    } catch (error) {
      console.warn("Manager resource fallback", error);
      bootstrap ||= buildRuntimeBootstrap();
      teamCatalog ||= buildCatalogFallback();
    } finally {
      resourcesLoading = false;
      managerState.careers.forEach(career => {
        career.teamCatalogVersion ||= teamCatalog?.version || VERSION;
      });
      saveLocal();
      if (["managerroom", "managerhall"].includes(ctx()?.getActiveView?.())) ctx()?.refreshView?.();
    }
  }

  function buildRuntimeBootstrap() {
    const historical = ctx()?.getHistorical?.() || { allTime: [], champions: [], summary: {} };
    const currentNames = (ctx()?.getParticipants?.() || []).map(item => String(item.name || "").trim()).filter(Boolean);
    const names = [];
    (historical.allTime || []).forEach(item => { if (item.name && !names.includes(item.name)) names.push(item.name); });
    currentNames.forEach(name => { if (!names.includes(name)) names.push(name); });
    const top = (historical.allTime || []).slice(0, 10).map(item => item.name);
    const champions = new Map((historical.champions || []).map(item => [item.name, item]));
    const profiles = names.map((name, index) => {
      const row = (historical.allTime || []).find(item => item.name === name) || {};
      const honours = champions.get(name) || { titles: 0, finals: 0, podiums: 0 };
      const powerSeed = Math.max(900, Math.min(1900, Math.round(1000 + (Number(row.ppg) || 0) * 230 + (Number(row.winRate) || 0) * 1.7 + honours.titles * 65 - (Number(row.rank) || 25) * 4)));
      return {
        id: `AI-${String(index + 1).padStart(2, "0")}`,
        name,
        historicalRank: row.rank || null,
        historical: row,
        honours,
        powerSeed,
        powerClass: powerSeed >= 1550 ? "Elite" : powerSeed >= 1350 ? "Strong" : powerSeed >= 1150 ? "Competitive" : "Challenger",
        hiddenStyle: { tempo: 50, pressing: 50, directness: 50, width: 50, risk: 50, control: 50, resilience: 50, adaptation: 50, clutch: 50, volatility: 50 }
      };
    });
    return {
      version: 42,
      readiness: {
        combinedAiPlayers: profiles.length,
        premierAiTeams: top.length,
        championshipAiTeams: Math.max(0, profiles.length - top.length),
        championshipWithHumanClub: Math.max(1, profiles.length - top.length + 1)
      },
      competitionRules: {
        premier: { aiTeams: 10, relegation: 2, legs: [4, 4.5, 5] },
        championship: { directPromotion: 1, playoffRanks: [2, 3, 4, 5], playoffBestOf: 3, playoffStars: 4.5, legs: [4, 4.5, 5] },
        orucReisCup: { premierQualifiers: 5, championshipQualifiers: 3, allRoundsBestOf: 3, stars: 4.5 },
        superCup: { enabled: true }
      },
      premierPlayerNames: top,
      championshipPlayerNames: names.filter(name => !top.includes(name)),
      aiProfiles: profiles
    };
  }

  function buildCatalogFallback() {
    const teams = [
      ["real-madrid", "Real Madrid", 5, 85, 88, 86, 81],
      ["manchester-city", "Manchester City", 5, 85, 86, 83, 79],
      ["inter", "Inter", 5, 84, 86, 84, 83],
      ["fc-barcelona", "FC Barcelona", 5, 84, 85, 85, 83],
      ["newcastle-united", "Newcastle United", 4.5, 81, 81, 80, 80],
      ["aston-villa", "Aston Villa", 4.5, 81, 84, 80, 80],
      ["galatasaray", "Galatasaray", 4.5, 79, 85, 78, 77],
      ["stuttgart", "VfB Stuttgart", 4, 77, 77, 77, 75],
      ["ajax", "Ajax", 4, 76, 76, 77, 74],
      ["besiktas", "Beşiktaş", 4, 76, 82, 76, 75]
    ].map(row => ({ id: row[0], clubName: row[1], country: "Europe", league: "FC 25", stars: row[2], overall: row[3], attack: row[4], midfield: row[5], defence: row[6], active: true, attributes: {} }));
    return { version: VERSION, counts: { total: teams.length }, teams };
  }

  function slug(value) {
    return String(value || "club").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function initials(value, max = 3) {
    return String(value || "FC").split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, max).toUpperCase();
  }

  function managerClubName(name) {
    const pieces = String(name || "AI").trim().split(/\s+/);
    const base = pieces.length > 1 ? pieces[pieces.length - 1] : pieces[0];
    const suffixes = ["Athletic", "United", "City", "Sporting", "Rovers", "FC"];
    let score = 0;
    for (const char of String(name)) score += char.charCodeAt(0);
    return `${base} ${suffixes[score % suffixes.length]}`;
  }

  function createActors(profileNames, division) {
    return profileNames.map(name => {
      const profile = bootstrap.aiProfiles.find(item => item.name === name) || { id: `AI-${slug(name)}`, name, powerSeed: 1100, powerClass: "Competitive", hiddenStyle: {} };
      const clubName = managerClubName(profile.name);
      return {
        id: profile.id,
        type: "ai",
        managerName: profile.name,
        clubName,
        shortName: initials(clubName, 4),
        division,
        power: profile.powerSeed,
        powerClass: profile.powerClass,
        styleVisible: false,
        styleSeed: profile.hiddenStyle || {},
        historicalRank: profile.historicalRank
      };
    });
  }

  function roundRobin(ids, division, leg) {
    const list = [...ids];
    if (list.length % 2) list.push(null);
    const matches = [];
    let rotation = [...list];
    for (let round = 0; round < rotation.length - 1; round += 1) {
      for (let index = 0; index < rotation.length / 2; index += 1) {
        let homeId = rotation[index];
        let awayId = rotation[rotation.length - 1 - index];
        if (!homeId || !awayId) continue;
        if ((round + index) % 2) [homeId, awayId] = [awayId, homeId];
        if (leg === 2) [homeId, awayId] = [awayId, homeId];
        matches.push({
          id: `MR-${division}-L${leg}-R${round + 1}-${homeId}-${awayId}`,
          division,
          competition: "league",
          leg,
          stars: LEGS.find(item => item.id === leg)?.stars || 4,
          matchday: round + 1 + (leg - 1) * (rotation.length - 1),
          homeId,
          awayId,
          status: "scheduled",
          homeTeam: null,
          awayTeam: null,
          teamDraw: null,
          homeScore: null,
          awayScore: null,
          decisions: []
        });
      }
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, rotation.length - 1)];
    }
    return matches;
  }

  function initialTable(actors) {
    return actors.map(actor => ({ actorId: actor.id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
  }

  function createCareerPayload(formData) {
    const playerName = String(formData.get("playerName") || "").trim();
    const clubName = String(formData.get("clubName") || "").trim();
    const shortName = String(formData.get("shortName") || "").trim().toUpperCase().slice(0, 5);
    const primaryColor = String(formData.get("primaryColor") || "#0b2440");
    const secondaryColor = String(formData.get("secondaryColor") || "#d5a84e");
    const pin = String(formData.get("pin") || "").trim();
    if (!playerName || !clubName || shortName.length < 2) throw new Error("Oyuncu, kulüp adı ve kısa ad zorunludur.");
    if (!/^\d{6}$/.test(pin)) throw new Error("Manager PIN tam olarak 6 rakam olmalıdır.");
    if (managerState.careers.some(item => item.playerName === playerName)) throw new Error("Bu oyuncu için bu cihazda zaten bir kariyer bulunuyor.");

    const premierActors = createActors(bootstrap.premierPlayerNames, "premier");
    const championshipActors = createActors(bootstrap.championshipPlayerNames, "championship");
    const human = {
      id: `HUMAN-${slug(playerName)}-${Date.now()}`,
      type: "human",
      managerName: playerName,
      clubName,
      shortName,
      division: "championship",
      power: 1000,
      powerClass: "New Club",
      primaryColor,
      secondaryColor,
      styleVisible: true
    };
    championshipActors.push(human);
    const premierIds = premierActors.map(item => item.id);
    const championshipIds = championshipActors.map(item => item.id);
    const fixtures = [1, 2, 3].flatMap(leg => [
      ...roundRobin(premierIds, "premier", leg),
      ...roundRobin(championshipIds, "championship", leg)
    ]);

    return {
      id: uid("career"),
      playerName,
      clubName,
      shortName,
      primaryColor,
      secondaryColor,
      mode: formData.get("mode") === "official" ? "official" : "test",
      createdAt: now(),
      updatedAt: now(),
      status: "match-engine-ready",
      seasonNo: 1,
      matchday: 1,
      division: "championship",
      managerElo: 1000,
      careerPoints: 0,
      prestige: 0,
      tacticalIQ: 50,
      completionRate: 0,
      trophies: { premier: 0, championship: 0, oruc: 0, super: 0 },
      humanActorId: human.id,
      actors: [...premierActors, ...championshipActors],
      tables: { premier: initialTable(premierActors), championship: initialTable(championshipActors) },
      fixtures,
      rules: bootstrap.competitionRules,
      teamCatalogVersion: teamCatalog?.version || VERSION,
      teamDrawHistory: [],
      matchHistory: [],
      matchEngineStats: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, decisions: 0 },
      development: { foundation: true, teamDraw: true, matchEngine: true, decisionEngine: true, competitionProgression: false },
      cloudCareerId: null
    };
  }

  function client() {
    return cloud()?.getClient?.() || null;
  }

  function trophyCount(career) {
    return Object.values(career?.trophies || {}).reduce((total, value) => total + Number(value || 0), 0);
  }

  async function createRemoteCareer(career, pin) {
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
    const { data, error } = await supabase.rpc("manager_create_career", {
      p_player_name: career.playerName,
      p_club_name: career.clubName,
      p_club_short_name: career.shortName,
      p_primary_color: career.primaryColor,
      p_secondary_color: career.secondaryColor,
      p_pin: pin,
      p_snapshot: career
    });
    if (error) throw error;
    return data;
  }

  async function saveRemoteCareer(career, pin = getSessionPin(career)) {
    if (career.mode !== "official" || !career.cloudCareerId) return true;
    if (!/^\d{6}$/.test(pin)) throw new Error("Bulut kaydı için kariyeri PIN ile yeniden açman gerekiyor.");
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
    const { data, error } = await supabase.rpc("manager_save_career_snapshot", {
      p_career_id: career.cloudCareerId,
      p_pin: pin,
      p_snapshot: career,
      p_division: career.division,
      p_season_no: career.seasonNo,
      p_matchday: career.matchday,
      p_manager_elo: career.managerElo,
      p_tactical_iq: career.tacticalIQ,
      p_career_points: career.careerPoints,
      p_prestige: career.prestige,
      p_completion_rate: career.completionRate,
      p_trophy_count: trophyCount(career)
    });
    if (error) throw error;
    if (!data) throw new Error("Manager PIN doğrulanamadı; bulut kaydı yapılmadı.");
    return true;
  }

  async function persistCareer(career, { silent = false } = {}) {
    career.updatedAt = now();
    migrateCareer(career);
    saveLocal();
    if (career.mode === "official" && career.cloudCareerId) {
      try {
        await saveRemoteCareer(career);
        if (!silent) ctx()?.toast?.("Kariyer yerel ve bulut kaydına işlendi.", "success");
      } catch (error) {
        if (!silent) ctx()?.toast?.(`${error.message} Değişiklik cihazda korundu.`, "warning");
        throw error;
      }
    }
    return true;
  }

  async function unlockRemoteCareer(playerName, pin) {
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
    const { data, error } = await supabase.rpc("manager_unlock_career", { p_player_name: playerName, p_pin: pin });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.career_id || !row?.snapshot) throw new Error("Oyuncu adı veya Manager PIN doğrulanamadı.");
    const career = migrateCareer({ ...row.snapshot, cloudCareerId: row.career_id, mode: "official" });
    career.id ||= uid("career");
    const existingIndex = managerState.careers.findIndex(item => item.playerName.toLocaleLowerCase("tr-TR") === career.playerName.toLocaleLowerCase("tr-TR"));
    if (existingIndex >= 0) managerState.careers[existingIndex] = career;
    else managerState.careers.push(career);
    managerState.activeCareerId = career.id;
    setSessionPin(career, pin);
    saveLocal();
    return career;
  }

  async function refreshLeaderboard(force = false) {
    if (remoteLoading || (!force && Date.now() - remoteLoadedAt < 15000)) return;
    const supabase = client();
    if (!supabase) return;
    remoteLoading = true;
    try {
      const { data, error } = await supabase.from("manager_leaderboard_public").select("*").order("career_points", { ascending: false }).order("manager_elo", { ascending: false }).limit(100);
      if (error) throw error;
      remoteLeaderboard = Array.isArray(data) ? data : [];
      remoteLoadedAt = Date.now();
    } catch (error) {
      console.warn("Manager leaderboard unavailable", error);
      remoteLeaderboard = [];
    } finally {
      remoteLoading = false;
      if (ctx()?.getActiveView?.() === "managerhall") ctx()?.refreshView?.();
    }
  }

  function openCareerModal() {
    if (!bootstrap) return;
    const options = bootstrap.aiProfiles.map(profile => `<option value="${esc(profile.name)}">${esc(profile.name)}</option>`).join("");
    ctx()?.openModal?.("Yeni Manager Kariyeri", `
      <form id="managerCareerForm" class="manager-career-form">
        <div class="manager-form-intro"><div class="eyebrow">THE MANAGER'S ROOM · V42.3</div><h3>Championship'ten kendi hikâyeni başlat</h3><p>Gerçek oyuncu evrenine ilave kulüp olarak katılacaksın. Maç öncesi Avrupa kulüpleri, devrenin yıldız havuzundan kilitli kura ile belirlenecek.</p></div>
        <div class="manager-form-grid">
          <label>Oyuncu kimliğin<select name="playerName" required><option value="">Oyuncu seç</option>${options}</select></label>
          <label>Kulüp adı<input name="clubName" maxlength="34" placeholder="Örn. CCT Athletic" required></label>
          <label>Kısa ad<input name="shortName" maxlength="5" placeholder="CCTA" required></label>
          <label>6 haneli Manager PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required></label>
          <label>Ana renk<input name="primaryColor" type="color" value="#0b2440"></label>
          <label>İkinci renk<input name="secondaryColor" type="color" value="#d5a84e"></label>
        </div>
        <div class="manager-mode-picker">
          <label><input type="radio" name="mode" value="test" checked><span><b>Test Kariyeri</b><small>Takım kurasını tekrar deneyebilirsin.</small></span></label>
          <label><input type="radio" name="mode" value="official"><span><b>Resmî Kariyer</b><small>Kura kilitlenir ve Manager Hall'a bağlanır.</small></span></label>
        </div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Kulübü Kur ve Evreni Oluştur</button></div>
      </form>
    `, "CAREER + TEAM DRAW FOUNDATION");
  }

  function openUnlockModal() {
    const options = (bootstrap?.aiProfiles || []).map(profile => `<option value="${esc(profile.name)}">${esc(profile.name)}</option>`).join("");
    ctx()?.openModal?.("Manager Kariyerini Aç", `
      <form id="managerUnlockForm" class="manager-career-form">
        <div class="manager-form-intro"><div class="eyebrow">CLOUD CAREER ACCESS</div><h3>Başka cihazdaki kariyerine dön</h3><p>Oyuncu adını ve altı haneli Manager PIN'ini kullan. Bulut snapshot'ı bu cihaza güvenli şekilde yüklenir.</p></div>
        <div class="manager-form-grid manager-form-grid-single">
          <label>Oyuncu<select name="playerName" required><option value="">Oyuncu seç</option>${options}</select></label>
          <label>Manager PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required></label>
        </div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Kariyeri Aç</button></div>
      </form>
    `, "SUPABASE CAREER SYNC");
  }

  function actor(career, id) {
    return career.actors.find(item => item.id === id) || { id, managerName: "—", clubName: "—", power: 0 };
  }

  function nextHumanFixture(career) {
    const active = career.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
    if (active && active.status !== "played") return active;
    return career.fixtures
      .filter(item => item.status === "scheduled" && [item.homeId, item.awayId].includes(career.humanActorId))
      .sort((a, b) => a.matchday - b.matchday || a.leg - b.leg)[0] || null;
  }

  function powerLabel(power) {
    if (power >= 1550) return "ELITE";
    if (power >= 1350) return "STRONG";
    if (power >= 1150) return "COMPETITIVE";
    return "CHALLENGER";
  }

  function starText(stars) {
    return `${Number(stars).toFixed(stars % 1 ? 1 : 0)}★`;
  }

  function poolFor(stars) {
    return (teamCatalog?.teams || []).filter(team => team.active !== false && Number(team.stars) === Number(stars));
  }

  function secureRandomIndex(length) {
    if (!Number.isInteger(length) || length <= 0) throw new Error("Takım havuzu boş.");
    if (window.crypto?.getRandomValues) {
      const max = Math.floor(0xffffffff / length) * length;
      const array = new Uint32Array(1);
      do window.crypto.getRandomValues(array); while (array[0] >= max);
      return array[0] % length;
    }
    return Math.floor(Math.random() * length);
  }

  function pickTeam(pool, excludedId = null) {
    const eligible = pool.filter(team => team.id !== excludedId);
    if (!eligible.length) throw new Error("Bu kura için yeterli takım bulunmuyor.");
    return eligible[secureRandomIndex(eligible.length)];
  }

  function teamById(id) {
    return (teamCatalog?.teams || []).find(team => team.id === id) || null;
  }

  function fixtureTeams(fixture) {
    return {
      home: teamById(fixture?.homeTeam?.id || fixture?.homeTeam),
      away: teamById(fixture?.awayTeam?.id || fixture?.awayTeam)
    };
  }

  function teamForActor(fixture, actorId) {
    if (!fixture) return null;
    const teams = fixtureTeams(fixture);
    return fixture.homeId === actorId ? teams.home : teams.away;
  }

  function teamFit(team, actorRow) {
    if (!team || !actorRow) return 0;
    const base = Number(team.overall || 0) * 0.62 + Number(actorRow.power || 1000) / 100 * 1.7;
    const style = actorRow.styleSeed || {};
    const styleFit = (
      (Number(style.tempo || 50) / 100) * Number(team.attributes?.tempo || team.attack || 75) * 0.12 +
      (Number(style.control || 50) / 100) * Number(team.attributes?.control || team.midfield || 75) * 0.12 +
      (Number(style.resilience || 50) / 100) * Number(team.attributes?.defensiveShape || team.defence || 75) * 0.12
    );
    return Math.round(Math.max(0, Math.min(99, base * 0.72 + styleFit)));
  }

  async function executeTeamDraw(career, fixture) {
    if (!career || !fixture) throw new Error("Sıradaki maç bulunamadı.");
    const alreadyDrawn = Boolean(fixture.homeTeam && fixture.awayTeam);
    if (alreadyDrawn && career.mode === "official") throw new Error("Resmî kariyerde bu maçın kurası kilitli.");
    const pool = poolFor(fixture.stars);
    if (pool.length < 2) throw new Error(`${starText(fixture.stars)} takım havuzu hazır değil.`);
    const homeTeam = pickTeam(pool);
    const awayTeam = pickTeam(pool, homeTeam.id);
    const drawId = uid("draw");
    fixture.homeTeam = homeTeam.id;
    fixture.awayTeam = awayTeam.id;
    fixture.teamDraw = {
      id: drawId,
      version: VERSION,
      catalogVersion: teamCatalog?.version || VERSION,
      stars: fixture.stars,
      drawnAt: now(),
      locked: career.mode === "official",
      method: "crypto-random-without-replacement"
    };
    career.teamDrawHistory.push({
      drawId,
      fixtureId: fixture.id,
      matchday: fixture.matchday,
      stars: fixture.stars,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      drawnAt: fixture.teamDraw.drawnAt,
      official: career.mode === "official"
    });
    career.status = "team-draw-ready";
    career.teamCatalogVersion = teamCatalog?.version || VERSION;
    await persistCareer(career);
    return { homeTeam, awayTeam };
  }

  function renderLanding(view) {
    const ready = bootstrap?.readiness || {};
    const catalogCounts = teamCatalog?.counts || {};
    view.innerHTML = `
      <section class="manager-hero">
        <div class="manager-hero-copy">
          <div class="eyebrow">V42.3 · MASTERPIECE MATCH ENGINE</div>
          <h2>The Manager's Room</h2>
          <p>Kendi kulübünü kur, Championship'ten başla ve gerçek Oruç Reis turnuva tarihinden üretilen AI menajerlere karşı kalıcı bir kariyer oluştur. Her maçın Avrupa kulüpleri kura ile belirlenir; ardından canlı momentum, saha hâkimiyeti ve bağlamsal taktik kararlarıyla yaklaşık beş dakikalık maç oynanır.</p>
          <div class="manager-hero-actions"><button class="btn btn-gold" data-manager-action="open-career">Yeni Kariyer</button><button class="btn btn-ghost" data-manager-action="open-unlock">Kariyerimi Aç</button></div>
          <div class="manager-foundation-tags"><span>65 Avrupa Kulübü</span><span>Canlı Maç Motoru</span><span>Dinamik Karar Anları</span><span>Supabase Kariyer Senkronu</span></div>
        </div>
        <div class="manager-hero-visual"><div class="manager-orbit manager-orbit-one"></div><div class="manager-orbit manager-orbit-two"></div><div class="manager-emblem"><span>MR</span><strong>ORUÇ REİS</strong><small>FOOTBALL UNIVERSE</small></div></div>
      </section>
      <section class="manager-readiness-grid">
        <article><span>AI MENAJER EVRENİ</span><strong>${ready.combinedAiPlayers ?? "—"}</strong><small>Tarihî + FIFA09 aktif oyuncular</small></article>
        <article><span>FC 25 KULÜP HAVUZU</span><strong>${catalogCounts.total ?? "—"}</strong><small>${catalogCounts["4"] || 0} × 4★ · ${catalogCounts["4.5"] || 0} × 4.5★ · ${catalogCounts["5"] || 0} × 5★</small></article>
        <article><span>CHAMPIONSHIP</span><strong>${ready.championshipWithHumanClub ?? "—"}</strong><small>AI kulüpleri + senin kulübün</small></article>
        <article><span>ALTYAPI DURUMU</span><strong>V42.3</strong><small>Masterpiece Match Build aktif</small></article>
      </section>
      ${renderRulesStrip()}
      ${renderBuildRoadmap()}
    `;
  }

  function renderRulesStrip() {
    return `<section class="manager-rules-strip">
      <div><b>1. DEVRE</b><span>4★ Avrupa kulüpleri</span></div>
      <div><b>2. DEVRE</b><span>4.5★ Avrupa kulüpleri</span></div>
      <div><b>3. DEVRE</b><span>5★ Avrupa kulüpleri</span></div>
      <div><b>RESMÎ KURA</b><span>Tek çekim · maç bazında kilitli</span></div>
    </section>`;
  }

  function renderBuildRoadmap() {
    const items = [
      ["01", "Foundation", "Kariyer, lig evreni, AI seed ve veri katmanı", true],
      ["02", "Team Draw", "FC 25 kulüp kataloğu, kura sahnesi ve bulut senkronu", true],
      ["03", "Match Engine Alpha", "Canlı dakika, momentum, skor ve saha state motoru", true],
      ["04", "Decision Intelligence", "İlk bağlamsal taktik aileleri ve AI adaptasyonu", true],
      ["05", "Competition Universe", "Yükselme, kupalar ve sezon geçişi", false]
    ];
    return `<section class="manager-roadmap"><div class="manager-section-head"><div><span>DEVELOPMENT ROADMAP</span><h3>İlk oynanabilir maç motoru oyuna bağlandı</h3></div><small>Takım kurası, Manager ELO, gizli AI stili, canlı momentum ve taktik kararları artık aynı maç state’inde çalışır.</small></div><div class="manager-roadmap-grid">${items.map(item => `<article class="${item[3] ? "active" : ""}"><b>${item[0]}</b><strong>${item[1]}</strong><p>${item[2]}</p><span>${item[3] ? "BUILD COMPLETE" : "NEXT BUILD"}</span></article>`).join("")}</div></section>`;
  }

  function renderCareer(view, career) {
    const next = nextHumanFixture(career);
    const opponentId = next ? (next.homeId === career.humanActorId ? next.awayId : next.homeId) : null;
    const rival = opponentId ? actor(career, opponentId) : null;
    const reportFixture = career.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
    const matchFixture = reportFixture || next;
    const matchOpponentId = matchFixture ? (matchFixture.homeId === career.humanActorId ? matchFixture.awayId : matchFixture.homeId) : null;
    const matchRival = matchOpponentId ? actor(career, matchOpponentId) : rival;
    const human = actor(career, career.humanActorId);
    const premierCount = career.actors.filter(item => item.division === "premier").length;
    const championshipCount = career.actors.filter(item => item.division === "championship").length;
    const legInfo = LEGS.find(item => item.id === Number(next?.leg || 1)) || LEGS[0];
    const tabs = [["overview", "Kulüp Merkezi"], ["fixtures", "Fikstür & Sonuçlar"], ["draw", "Team Draw Theatre"], ["match", "Live Match"], ["universe", "Lig Evreni"], ["scouting", "AI Rakipler"], ["engine", "Motor Laboratuvarı"]];
    view.innerHTML = `
      <section class="manager-club-hero" style="--club-primary:${esc(career.primaryColor)};--club-secondary:${esc(career.secondaryColor)}">
        <div class="manager-club-badge"><span>${esc(career.shortName)}</span></div>
        <div class="manager-club-copy"><div class="eyebrow">SEASON ${career.seasonNo} · ${career.division.toUpperCase()}</div><h2>${esc(career.clubName)}</h2><p>${esc(career.playerName)} yönetiminde bağımsız kariyer. FC 25 kulüp kurası, rakip ELO gücü ve gizli oyun tarzı aynı maç state'inde birleşecek.</p><div class="manager-club-meta"><span>Manager ELO <b>${career.managerElo}</b></span><span>Taktik IQ <b>${career.tacticalIQ}</b></span><span>Kariyer Puanı <b>${career.careerPoints}</b></span><span>${career.mode === "official" ? "RESMÎ · CLOUD" : "TEST · LOCAL"}</span></div></div>
        <div class="manager-season-ring"><strong>${career.matchday}</strong><span>MATCHDAY</span><small>${esc(legInfo.label)} · ${starText(legInfo.stars)}</small></div>
      </section>
      <nav class="manager-tabs">${tabs.map(([id, label]) => `<button class="${activeTab === id ? "active" : ""}" data-manager-action="set-tab" data-tab="${id}">${label}</button>`).join("")}</nav>
      ${activeTab === "overview" ? renderOverview(career, human, rival, next) : activeTab === "fixtures" ? renderFixtures(career) : activeTab === "draw" ? renderTeamDraw(career, human, rival, next) : activeTab === "match" ? (window.FIFA_MANAGER_MATCH?.render?.(career, human, matchRival, matchFixture) || `<section class="manager-loading"><h2>Maç motoru yükleniyor</h2></section>`) : activeTab === "universe" ? renderUniverse(career, premierCount, championshipCount) : activeTab === "scouting" ? renderScouting(career) : renderEngineLab(career)}
    `;
  }

  function renderOverview(career, human, rival, next) {
    const userTeam = teamForActor(next, career.humanActorId);
    const rivalTeam = rival ? teamForActor(next, rival.id) : null;
    const drawReady = Boolean(userTeam && rivalTeam);
    return `<section class="manager-dashboard-grid">
      <article class="manager-next-match">
        <div class="manager-panel-head"><div><span>NEXT MATCHDAY</span><h3>${next ? `Matchday ${next.matchday}` : "Fikstür tamamlandı"}</h3></div><em>${next ? starText(next.stars) : "—"}</em></div>
        ${next ? `<div class="manager-versus"><div><b>${esc(human.shortName)}</b><strong>${esc(human.clubName)}</strong><small>${esc(career.playerName)}</small></div><span>VS</span><div><b>${esc(rival?.shortName || "AI")}</b><strong>${esc(rival?.clubName || "—")}</strong><small>${esc(rival?.managerName || "—")} · ${rival?.power || 0}</small></div></div>
        <div class="manager-match-lock"><span>TEAM DRAW STATUS</span><strong>${drawReady ? `${esc(userTeam.clubName)} vs ${esc(rivalTeam.clubName)}` : "Takım kurası bekleniyor"}</strong><small>${drawReady ? `Kura ${next.teamDraw?.locked ? "resmî olarak kilitli" : "test modunda açık"}.` : `${starText(next.stars)} havuzundan iki farklı Avrupa kulübü çekilecek.`}</small></div>
        <button class="btn btn-gold btn-wide" data-manager-action="set-tab" data-tab="${drawReady ? "match" : "draw"}">${drawReady ? (next.matchEngine?.status === "finished" ? "Maç Raporunu Aç" : next.matchEngine ? "Canlı Maça Dön" : "Taktik Odasına Geç") : "Takım Kurasına Geç"}</button>` : `<div class="empty-state">Yeni sezon oluşturulması gerekiyor.</div>`}
      </article>
      <article class="manager-progress-panel"><div class="manager-panel-head"><div><span>CLUB DEVELOPMENT</span><h3>Performance Lab</h3></div><em>V42.3</em></div>${[["Manager Gücü", human.power, 1900], ["Taktik IQ", career.tacticalIQ, 100], ["Sezon Tamamlama", career.completionRate, 100], ["Kulüp Prestiji", career.prestige, 100]].map(row => `<div class="manager-meter"><span>${row[0]}</span><i><b style="width:${Math.max(3, Math.min(100, row[1] / row[2] * 100))}%"></b></i><strong>${row[1]}</strong></div>`).join("")}<div class="manager-dev-kpis"><div><span>FORM</span><b>${(career.matchHistory || []).slice(0,5).map(item => item.result).join(" · ") || "—"}</b></div><div><span>MAÇ BAŞI CP</span><b>${career.matchEngineStats?.matches ? Math.round(career.careerPoints / career.matchEngineStats.matches) : 0}</b></div><div><span>KARAR / MAÇ</span><b>${career.matchEngineStats?.matches ? (career.matchEngineStats.decisions / career.matchEngineStats.matches).toFixed(1) : "0.0"}</b></div><div><span>GOL FARKI</span><b>${(career.matchEngineStats?.goalsFor || 0) - (career.matchEngineStats?.goalsAgainst || 0)}</b></div></div><div class="manager-baseline-note">Kulüp gelişimi; sonuç, rakip gücü, karar kalitesi, taktik IQ ve uzun vadeli performans üzerinden canlı güncellenir.</div></article>
      <article class="manager-trophy-panel"><div class="manager-panel-head"><div><span>CLUB MUSEUM</span><h3>Kupa Kabini</h3></div></div><div class="manager-mini-trophies">${[["Premier", career.trophies.premier], ["Championship", career.trophies.championship], ["Oruç Reis", career.trophies.oruc], ["Süper Kupa", career.trophies.super]].map(row => `<div><span>♜</span><strong>${row[1]}</strong><small>${row[0]}</small></div>`).join("")}</div></article>
      <article class="manager-status-panel"><div class="manager-panel-head"><div><span>ENGINE STATUS</span><h3>Masterpiece Match Build</h3></div><em>V42.3</em></div><ul><li class="done">Gerçekçi ve değişken şut hacmi</li><li class="done">Maç öncesi motivasyon konuşması</li><li class="done">Manuel taktik duraklatma</li><li class="done">5–10 bağlamsal karar anı</li><li class="done">Dinamik rakip ELO sistemi</li><li class="done">Gelişmiş maç raporu ve canlı istatistik</li></ul></article>
    </section>`;
  }

  function teamCard(team, side, actorRow, hidden = false) {
    if (!team || hidden) {
      return `<article class="manager-team-card sealed ${side}"><div class="manager-seal-orbit"></div><div class="manager-team-crest"><span>?</span></div><div class="manager-team-copy"><span>${side === "human" ? "SENİN TAKIMIN" : "RAKİP TAKIM"}</span><h3>KART KAPALI</h3><p>Kura başladığında ${starText(activeCareer()?.fixtures?.find(item => item.id === nextHumanFixture(activeCareer())?.id)?.stars || 4)} havuzundan açılacak.</p></div></article>`;
    }
    const fit = teamFit(team, actorRow);
    const metrics = [["ATK", team.attack], ["MID", team.midfield], ["DEF", team.defence]];
    return `<article class="manager-team-card revealed ${side}">
      <div class="manager-team-glow"></div>
      <header><span>${side === "human" ? "SENİN TAKIMIN" : "RAKİP TAKIM"}</span><b>${starText(team.stars)}</b></header>
      <div class="manager-team-identity"><div class="manager-team-crest"><span>${esc(initials(team.clubName, 3))}</span></div><div><small>${esc(team.country)} · ${esc(team.league)}</small><h3>${esc(team.clubName)}</h3><p>Güçlü birim: ${esc(team.strongestUnit || "Balanced")}</p></div><strong>${team.overall}</strong></div>
      <div class="manager-team-bars">${metrics.map(row => `<div><span>${row[0]}</span><i><b style="width:${row[1]}%"></b></i><strong>${row[1]}</strong></div>`).join("")}</div>
      <footer><span>UYUM SKORU</span><strong>${fit}</strong><small>Takım gücü + Manager ELO + gizli stil uyumu</small></footer>
    </article>`;
  }

  function renderTeamDraw(career, human, rival, next) {
    if (!next || !rival) return `<section class="manager-draw-empty"><h3>Kura için sıradaki maç bulunamadı.</h3></section>`;
    const userTeam = teamForActor(next, career.humanActorId);
    const rivalTeam = teamForActor(next, rival.id);
    const hasDraw = Boolean(userTeam && rivalTeam);
    const officialLocked = hasDraw && career.mode === "official";
    const pool = poolFor(next.stars);
    return `<section class="manager-draw-theatre ${drawAnimating ? "is-drawing" : ""}">
      <div class="manager-draw-head"><div><span>TEAM DRAW THEATRE · MATCHDAY ${next.matchday}</span><h2>${starText(next.stars)} Avrupa Kulüp Kurası</h2><p>${esc(human.clubName)} ve ${esc(rival.clubName)} için aynı güç bandından iki farklı takım çekilir. Rakibin ELO gücü görünür; oyun tarzı maç başlayana kadar gizlidir.</p></div><div class="manager-draw-security"><b>${career.mode === "official" ? "OFFICIAL LOCK" : "TEST MODE"}</b><span>${pool.length} takım uygun</span><small>Crypto random · without replacement</small></div></div>
      <div class="manager-draw-stage">
        ${teamCard(userTeam, "human", human, drawAnimating || !hasDraw)}
        <div class="manager-draw-core"><div class="manager-draw-spinner"><span>MR</span></div><small>${drawAnimating ? "KULÜPLER KARIŞTIRILIYOR" : hasDraw ? "KURA TAMAMLANDI" : "KURA HAZIR"}</small><strong>${esc(human.shortName)} <i>VS</i> ${esc(rival.shortName)}</strong></div>
        ${teamCard(rivalTeam, "rival", rival, drawAnimating || !hasDraw)}
      </div>
      <div class="manager-draw-actions">
        <div><span>RAKİP MANAGER POWER</span><strong>${rival.power}</strong><small>${powerLabel(rival.power)} · Stil profili gizli</small></div>
        <button class="btn btn-gold manager-draw-button" data-manager-action="draw-teams" ${drawAnimating || officialLocked ? "disabled" : ""}>${drawAnimating ? "Kura çekiliyor..." : hasDraw ? "Test Kurasını Yenile" : "Takım Kurasını Başlat"}</button>
        <div><span>KURA DURUMU</span><strong>${officialLocked ? "KİLİTLİ" : hasDraw ? "AÇIK" : "BEKLİYOR"}</strong><small>${officialLocked ? "Bu maç için yeniden çekilemez" : career.mode === "test" ? "Test modunda tekrar çekilebilir" : "İlk çekim kalıcıdır"}</small></div>
      </div>
      ${hasDraw ? `<div class="manager-draw-receipt"><span>DRAW ID</span><b>${esc(next.teamDraw?.id || "—")}</b><span>CATALOG</span><b>${esc(next.teamDraw?.catalogVersion || teamCatalog?.version || "—")}</b><span>TIME</span><b>${esc(new Date(next.teamDraw?.drawnAt || now()).toLocaleString("tr-TR"))}</b></div><button class="btn btn-gold btn-wide manager-to-match" data-manager-action="open-match">${next.matchEngine ? "Canlı Maça Dön" : "Taktik Odasına Geç"}</button>` : ""}
      ${renderTeamPoolExplorer(next.stars)}
    </section>`;
  }

  function renderTeamPoolExplorer(activeStars) {
    const filters = [["all", "Tüm Havuz"], ["4", "4★"], ["4.5", "4.5★"], ["5", "5★"]];
    const visible = (teamCatalog?.teams || []).filter(team => poolFilter === "all" || String(team.stars) === poolFilter);
    return `<section class="manager-pool-explorer"><div class="manager-section-head"><div><span>FC 25 CLUB CATALOG</span><h3>Avrupa Kulüp Havuzları</h3></div><small>Aktif maç havuzu: <b>${starText(activeStars)}</b>. OVR/ATK/MID/DEF değerleri takım kartlarına ve sonraki maç motoruna taşınır.</small></div><div class="manager-pool-filters">${filters.map(([id, label]) => `<button class="${poolFilter === id ? "active" : ""}" data-manager-action="pool-filter" data-pool="${id}">${label}</button>`).join("")}</div><div class="manager-pool-grid">${visible.map(team => `<article class="${Number(team.stars) === Number(activeStars) ? "match-pool" : ""}"><div class="manager-pool-crest">${esc(initials(team.clubName, 3))}</div><div><span>${esc(team.country)}</span><strong>${esc(team.clubName)}</strong><small>${esc(team.league)}</small></div><b>${team.overall}</b><footer><span>${starText(team.stars)}</span><span>A ${team.attack}</span><span>M ${team.midfield}</span><span>D ${team.defence}</span></footer></article>`).join("")}</div></section>`;
  }

  function sortedLeagueRows(career, division) {
    const table = Array.isArray(career.tables?.[division]) ? career.tables[division] : [];
    return [...table].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || actor(career, b.actorId).power - actor(career, a.actorId).power);
  }

  function renderFixtures(career) {
    const rows = [...career.fixtures].sort((a, b) => Number(a.matchday) - Number(b.matchday) || String(a.division).localeCompare(String(b.division)));
    const played = rows.filter(item => item.status === "played").length;
    const humanPlayed = rows.filter(item => item.status === "played" && [item.homeId, item.awayId].includes(career.humanActorId));
    return `<section class="manager-fixture-centre"><div class="manager-section-head"><div><span>SEASON COMMAND CENTRE</span><h3>Fikstür ve Tüm Maç Sonuçları</h3></div><small>${played}/${rows.length} maç tamamlandı · Her sonuç puan tablosunu ve iki rakibin ELO değerini günceller.</small></div><div class="manager-fixture-kpis"><article><span>TAMAMLANAN</span><strong>${played}</strong></article><article><span>SENİN MAÇLARIN</span><strong>${humanPlayed.length}</strong></article><article><span>GOL</span><strong>${rows.filter(x=>x.status==="played").reduce((s,x)=>s+Number(x.homeScore||0)+Number(x.awayScore||0),0)}</strong></article><article><span>SON FORM</span><strong>${(career.matchHistory||[]).slice(0,5).map(x=>x.result).join(" ")||"—"}</strong></article></div><div class="manager-fixture-list">${rows.map(item => { const home=actor(career,item.homeId); const away=actor(career,item.awayId); const played=item.status==="played"; const elo=item.eloChange; return `<article class="${played?"played":"scheduled"} ${[item.homeId,item.awayId].includes(career.humanActorId)?"human":""}"><time>MD ${item.matchday}</time><div><small>${item.division === "premier" ? "PREMIER LEAGUE" : "CHAMPIONSHIP"} · ${starText(item.stars)}</small><strong>${esc(home.clubName)} <b>${played?item.homeScore:"–"} : ${played?item.awayScore:"–"}</b> ${esc(away.clubName)}</strong><span>${esc(home.managerName)} · ${esc(away.managerName)}</span></div><aside><b>${played?"FT":"SCHEDULED"}</b>${elo?`<small>${elo.homeDelta>=0?"+":""}${elo.homeDelta} / ${elo.awayDelta>=0?"+":""}${elo.awayDelta} ELO</small>`:`<small>${home.power} / ${away.power} ELO</small>`}</aside></article>`; }).join("")}</div></section>`;
  }

  function renderUniverse(career, premierCount, championshipCount) {
    const renderTable = division => sortedLeagueRows(career, division).map((row, index) => {
      const item = actor(career, row.actorId);
      const marker = division === "premier" ? (index >= Math.max(0, premierCount - 2) ? "danger" : "") : (index === 0 ? "promote" : index >= 1 && index <= 4 ? "playoff" : "");
      return `<tr class="${item.type === "human" ? "human-row" : ""} ${marker}"><td>${index + 1}</td><td><strong>${esc(item.clubName)}</strong><small>${esc(item.managerName)}${item.type === "human" ? " · SEN" : " AI"}</small></td><td>${row.mp}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gd}</td><td><b>${row.pts}</b></td></tr>`;
    }).join("");
    return `<section class="manager-universe-grid"><article class="manager-league-card premier"><div class="manager-panel-head"><div><span>PREMIER LEAGUE</span><h3>${premierCount} AI Kulüp</h3></div><em>Son 2 düşer</em></div><table><thead><tr><th>#</th><th>Kulüp / Manager</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th>P</th></tr></thead><tbody>${renderTable("premier")}</tbody></table></article><article class="manager-league-card championship"><div class="manager-panel-head"><div><span>CHAMPIONSHIP</span><h3>${championshipCount} Kulüp</h3></div><em>1 direkt · 2–5 PO</em></div><table><thead><tr><th>#</th><th>Kulüp / Manager</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th>P</th></tr></thead><tbody>${renderTable("championship")}</tbody></table></article><article class="manager-cup-route"><div><span>ORUÇ REİS KUPASI</span><strong>8</strong><small>Premier ilk 5 + Championship ilk 3</small></div><div>ÇEYREK FİNAL<b>Best of 3 · 4.5★</b></div><i>→</i><div>YARI FİNAL<b>Best of 3 · 4.5★</b></div><i>→</i><div>FİNAL<b>Best of 3 · 4.5★</b></div></article></section>`;
  }

  function renderScouting(career) {
    const rivals = career.actors.filter(item => item.type === "ai").sort((a, b) => b.power - a.power);
    return `<section class="manager-scouting"><div class="manager-section-head"><div><span>AI OPPONENT DATABASE</span><h3>Güç görünür, oyun tarzı gizli</h3></div><small>Takım uyum skoru hesaplanır; ancak rakibin gizli stil vektörü doğrudan gösterilmez.</small></div><div class="manager-scout-grid">${rivals.map((item, index) => `<article><div class="manager-ai-rank">${String(index + 1).padStart(2, "0")}</div><div class="manager-ai-avatar">${esc(initials(item.managerName, 2))}</div><div><span>${esc(item.clubName)}</span><h4>${esc(item.managerName)}</h4><small>${item.division === "premier" ? "Premier League" : "Championship"} · ${item.powerClass}</small></div><div class="manager-ai-power"><strong>${item.power}</strong><small>POWER</small></div><footer><span>PRESS: ???</span><span>RISK: ???</span><span>ADAPT: ???</span></footer></article>`).join("")}</div></section>`;
  }

  function renderEngineLab() {
    const modules = [
      ["Career Engine", 100, "Kulüp, sezon ve kalıcı kariyer state"],
      ["Competition Engine", 70, "Üç devreli fikstür ve canlı puan tabloları"],
      ["Opponent Engine", 75, "AI power seed, gizli stil ve adaptasyon"],
      ["Team Draw Engine", 100, "65 Avrupa kulübü ve resmî kura kilidi"],
      ["Live Match Simulation", 72, "90 dakikalık hızlandırılmış saha state motoru"],
      ["Momentum Engine", 70, "Saha hâkimiyeti, yorgunluk ve skor baskısı"],
      ["Decision Intelligence", 45, "Bağlamsal karar aileleri ve outcome resolver"],
      ["Balance Telemetry", 15, "Deterministik seed ve maç raporu verisi"]
    ];
    return `<section class="manager-engine-lab"><div class="manager-engine-core"><div class="manager-core-ring"><span>V42.3</span><strong>LIVE CORE</strong></div><div><span>MASTERPIECE MATCH ENGINE</span><h3>90 dakikalık görünmeyen maç; şut, ELO, motivasyon ve kullanıcı kararlarıyla yaşayan state içinde</h3><p>Maç hızlandırılmış gösterilir. Şut sayısı sabit değildir; çoğunlukla 15–20 toplam şut çevresinde, taktik ve maç varyansına göre daha düşük veya 30+ seviyesinde oluşabilir.</p></div></div><div class="manager-module-grid">${modules.map(row => `<article><div><span>${row[0]}</span><strong>${row[1]}%</strong></div><i><b style="width:${row[1]}%"></b></i><p>${row[2]}</p></article>`).join("")}</div><div class="manager-engine-contract"><strong>V42.3 MASTERPIECE BUILD</strong><span>Motivasyon etkisi, manuel taktik değişimi, gelişmiş raporlar, fikstür merkezi ve dinamik ELO aktif.</span></div></section>`;
  }

  function render(view) {
    ensureResources();
    if (!bootstrap || !teamCatalog) {
      view.innerHTML = `<section class="manager-loading"><div class="manager-loading-ball">⚽</div><h2>Manager evreni hazırlanıyor</h2><p>AI profilleri ve FC 25 Avrupa kulüp kataloğu yükleniyor.</p></section>`;
      return;
    }
    const career = activeCareer();
    if (!career) renderLanding(view); else renderCareer(view, career);
  }

  function localLeaderboard() {
    return [...managerState.careers]
      .sort((a, b) => b.careerPoints - a.careerPoints || b.managerElo - a.managerElo)
      .map((item, index) => ({ rank: index + 1, player_name: item.playerName, club_name: item.clubName, division: item.division, season_no: item.seasonNo, career_points: item.careerPoints, manager_elo: item.managerElo, tactical_iq: item.tacticalIQ, trophy_count: trophyCount(item), source: "local" }));
  }

  function renderHall(view) {
    ensureResources();
    refreshLeaderboard();
    const rows = remoteLeaderboard.length ? remoteLeaderboard : localLeaderboard();
    view.innerHTML = `<section class="manager-hall-hero"><div><div class="eyebrow">GLOBAL CAREER RANKING</div><h2>Manager Hall</h2><p>Bütün bağımsız kariyerlerin ortak prestij, güç ve taktik zekâ sıralaması. Resmî kariyerler farklı cihazlardan aynı tabloda görünür.</p></div><div class="manager-hall-stat"><strong>${rows.length}</strong><span>AKTİF KARİYER</span></div></section><section class="manager-hall-table"><div class="manager-panel-head"><div><span>ALL MANAGERS</span><h3>Kariyer Liderlik Tablosu</h3></div><em>${remoteLeaderboard.length ? "SUPABASE LIVE" : "LOCAL TEST"}</em></div>${rows.length ? `<table><thead><tr><th>#</th><th>Manager / Kulüp</th><th>Lig</th><th>Sezon</th><th>Taktik IQ</th><th>ELO</th><th>Kupa</th><th>Kariyer Puanı</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td><b>${index + 1}</b></td><td><strong>${esc(row.player_name)}</strong><small>${esc(row.club_name)}</small></td><td>${esc(row.division || "Championship")}</td><td>${row.season_no || 1}</td><td>${row.tactical_iq || 50}</td><td>${row.manager_elo || 1000}</td><td>${row.trophy_count || 0}</td><td><strong>${row.career_points || 0}</strong></td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">İlk Manager kariyeri henüz kurulmadı.</div>`}</section>`;
  }

  async function handleSubmit(event) {
    if (!["managerCareerForm", "managerUnlockForm"].includes(event.target.id)) return;
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const original = button.textContent;
    try {
      const data = new FormData(form);
      const pin = String(data.get("pin") || "");
      if (form.id === "managerCareerForm") {
        button.textContent = "Evren oluşturuluyor...";
        const career = createCareerPayload(data);
        if (career.mode === "official") {
          const remoteId = await createRemoteCareer(career, pin);
          career.cloudCareerId = remoteId || null;
        }
        managerState.careers.push(career);
        managerState.activeCareerId = career.id;
        setSessionPin(career, pin);
        saveLocal();
        ctx()?.closeModal?.();
        ctx()?.toast?.(`${career.clubName} Championship evrenine katıldı.`, "success");
        activeTab = "draw";
      } else {
        button.textContent = "Kariyer doğrulanıyor...";
        const career = await unlockRemoteCareer(String(data.get("playerName") || ""), pin);
        ctx()?.closeModal?.();
        ctx()?.toast?.(`${career.clubName} buluttan açıldı.`, "success");
        activeTab = "overview";
      }
      ctx()?.refreshView?.();
    } catch (error) {
      ctx()?.toast?.(error.message, "error");
      button.disabled = false;
      button.textContent = original;
    }
  }

  async function handleClick(event) {
    const action = event.target.closest("[data-manager-action]");
    if (!action) return;
    const type = action.dataset.managerAction;
    if (type === "open-career") openCareerModal();
    if (type === "open-unlock") openUnlockModal();
    if (type === "open-match") { activeTab = "match"; ctx()?.refreshView?.(); }
    if (type === "set-tab") {
      activeTab = action.dataset.tab || "overview";
      ctx()?.refreshView?.();
    }
    if (type === "pool-filter") {
      poolFilter = action.dataset.pool || "all";
      ctx()?.refreshView?.();
    }
    if (type === "draw-teams") {
      const career = activeCareer();
      const fixture = career ? nextHumanFixture(career) : null;
      if (!career || !fixture || drawAnimating) return;
      if (career.mode === "official" && !getSessionPin(career)) {
        ctx()?.toast?.("Resmî kura için kariyerini Manager PIN ile açmalısın.", "warning");
        openUnlockModal();
        return;
      }
      drawAnimating = true;
      ctx()?.refreshView?.();
      await new Promise(resolve => setTimeout(resolve, 1150));
      try {
        await executeTeamDraw(career, fixture);
        ctx()?.toast?.("Takım kurası tamamlandı ve maç kartına işlendi.", "success");
      } catch (error) {
        ctx()?.toast?.(error.message, "error");
      } finally {
        drawAnimating = false;
        ctx()?.refreshView?.();
      }
    }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);

  window.FIFA_MANAGER_ROOM = {
    render,
    renderHall,
    refreshLeaderboard,
    ensureResources,
    version: VERSION,
    getActiveCareer: activeCareer,
    getActor: actor,
    getNextHumanFixture: nextHumanFixture,
    getTeamCatalog: () => teamCatalog,
    getTeamById: teamById,
    getTeamForActor: teamForActor,
    getBootstrap: () => bootstrap,
    persistCareer,
    saveLocal,
    setActiveTab: tab => { activeTab = tab || "overview"; ctx()?.refreshView?.(); },
    refresh: () => ctx()?.refreshView?.(),
    starText,
    powerLabel
  };
})();
