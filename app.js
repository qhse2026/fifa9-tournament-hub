(() => {
  "use strict";

  const STORAGE_KEY = "fifa-tournament-hub-v1";
  const PLAYER_COUNT = 16;
  const LEAGUE_ROUNDS = 6;
  const historical = window.HISTORICAL_DATA || { editions: [], allTime: [], champions: [], summary: {} };
  const cloud = window.FIFA_CLOUD || null;
  let cloudConfigured = Boolean(cloud?.isConfigured?.());
  let cloudAdmin = !cloudConfigured;
  let cloudUser = null;
  let cloudState = cloudConfigured ? "connecting" : "local";
  let cloudUpdatedAt = null;
  let cloudSaveTimer = null;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const view = $("#view");
  const pageTitle = $("#pageTitle");
  const modalBackdrop = $("#modalBackdrop");
  const modalBody = $("#modalBody");
  const modalTitle = $("#modalTitle");
  const modalEyebrow = $("#modalEyebrow");
  const toastStack = $("#toastStack");

  const titleMap = {
    dashboard: "Dashboard",
    livematch: "Canlı Maç Merkezi",
    livestats: "Canlı İstatistikler",
    form: "Form Merkezi",
    odds: "Maç Oranları",
    intelligence: "Turnuva Zekâ Merkezi",
    chat: "Turnuva Sohbeti",
    setup: "Kura & Oyuncular",
    league: "League Phase",
    gold: "Altın Grup",
    silver: "Gümüş Grup",
    knockout: "Eleme Aşaması",
    print: "Çıktı Merkezi",
    archive: "Turnuva Arşivi",
    alltime: "Tüm Zamanlar",
    teams: "Takım İstatistikleri",
    backup: "Veri & Yedek"
  };

  let activeView = "dashboard";
  let state = loadState();
  let allTimeSelectedPlayerName = "";
  let allTimeRivalryA = "";
  let allTimeRivalryB = "";
  let selectedTeamStatName = "";
  let selectedTeamPlayerName = "";
  let formWindowSize = 20;
  let formScope = "current";
  let selectedFormPlayerName = "";
  let oddsPhaseFilter = "all";
  let intelligenceSection = "matchday";
  let intelligenceRivalA = "";
  let intelligenceRivalB = "";
  let intelligencePlayerCard = "";
  let intelligenceDestinyPlayer = "";
  let intelligenceSimulatorGroup = "gold";
  let directorTone = "analyst";
  let directorNonce = 0;
  let qualificationScenario = {};
  let tournamentSimulationRuns = 1000;
  let tournamentSimulationNonce = 0;
  const tournamentSimulationCache = { key: "", data: null };
  const predictionCache = { rows: [], loading: false, error: "", loadedAt: 0 };
  let livePresentationMode = sessionStorage.getItem("fifa9-live-presentation-mode") || "standard";
  let liveGoalAnnouncementTimer = null;

  function defaultState() {
    return {
      schemaVersion: 1,
      current: {
        edition: 9,
        createdAt: new Date().toISOString(),
        participants: Array.from({ length: PLAYER_COUNT }, (_, index) => ({
          id: `P${String(index + 1).padStart(2, "0")}`,
          name: ""
        })),
        league: { generated: false, drawSeed: null, rounds: [] },
        phase2: {
          generated: false,
          goldIds: [],
          silverIds: [],
          eliminatedIds: [],
          goldRounds: [],
          silverRounds: []
        },
        knockout: {
          generated: false,
          seeds: null,
          qf1: null,
          qf2: null,
          qf3: null,
          sf1: null,
          sf2: null,
          final: null,
          championId: null
        },
        live: {
          active: null,
          archive: {}
        },
        matchArchive: {}
      }
    };
  }

  function mergeState(raw) {
    const fresh = defaultState();
    if (!raw || typeof raw !== "object") return fresh;
    const merged = {
      ...fresh,
      ...raw,
      current: {
        ...fresh.current,
        ...(raw.current || {}),
        league: { ...fresh.current.league, ...(raw.current?.league || {}) },
        phase2: { ...fresh.current.phase2, ...(raw.current?.phase2 || {}) },
        knockout: { ...fresh.current.knockout, ...(raw.current?.knockout || {}) },
        live: { ...fresh.current.live, ...(raw.current?.live || {}), archive: { ...fresh.current.live.archive, ...(raw.current?.live?.archive || {}) } },
        matchArchive: { ...fresh.current.matchArchive, ...(raw.current?.matchArchive || {}) }
      }
    };
    if (!Array.isArray(merged.current.participants) || merged.current.participants.length !== PLAYER_COUNT) {
      merged.current.participants = fresh.current.participants;
    }
    return merged;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return mergeState(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.warn("State could not be loaded", error);
      return defaultState();
    }
  }

  function canEdit() {
    return !cloudConfigured || cloudAdmin;
  }

  function cacheState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveState(showIndicator = false, immediate = false) {
    cacheState();
    if (!cloudConfigured || !cloud?.save || !cloudAdmin) {
      if (showIndicator && !cloudConfigured) toast("Değişiklikler bu cihazda kaydedildi.", "success");
      return Promise.resolve();
    }

    clearTimeout(cloudSaveTimer);
    const commit = async () => {
      setCloudState("syncing");
      try {
        const result = await cloud.save(state);
        cloudUpdatedAt = result?.updated_at || new Date().toISOString();
        if (showIndicator) toast("Değişiklikler canlı siteye kaydedildi.", "success");
      } catch (error) {
        console.error("Cloud save failed", error);
        setCloudState("error", error.message);
        toast("Bulut kaydı başarısız. İnternet bağlantısını ve yetkini kontrol et.", "error");
      }
    };
    if (immediate || showIndicator) return commit();
    cloudSaveTimer = setTimeout(commit, 550);
    return Promise.resolve();
  }

  function cloudStatusLabel() {
    const labels = {
      local: "Yerel mod",
      "not-configured": "Bulut kurulumu bekleniyor",
      connecting: "Bağlanıyor",
      loading: "Veri yükleniyor",
      syncing: "Kaydediliyor",
      saved: "Canlı · kaydedildi",
      "admin-online": "Canlı · yönetici",
      "viewer-online": "Canlı · izleyici",
      reconnecting: "Yeniden bağlanıyor",
      error: "Bağlantı hatası"
    };
    return labels[cloudState] || "Canlı bağlantı";
  }

  function setCloudState(status, detail = "") {
    cloudState = status || cloudState;
    const chip = $("#cloudChip");
    const label = $("#cloudStatusText");
    const sidebar = $("#sidebarCloudStatus");
    if (label) label.textContent = cloudStatusLabel();
    if (chip) {
      chip.dataset.status = cloudState;
      chip.title = detail || (cloudUpdatedAt ? `Son güncelleme: ${new Date(cloudUpdatedAt).toLocaleString("tr-TR")}` : cloudStatusLabel());
    }
    if (sidebar) sidebar.innerHTML = `<span class="status-dot"></span> ${escapeHTML(cloudStatusLabel())}`;
  }

  function updateAuthUI() {
    document.body.classList.toggle("viewer-mode", cloudConfigured && !cloudAdmin);
    const button = $("#adminAuthBtn");
    if (!button) return;
    if (!cloudConfigured) {
      button.textContent = "Bulut Kurulumu";
      button.dataset.action = "open-cloud-help";
      button.className = "btn btn-blue";
    } else if (cloudAdmin) {
      button.textContent = "Yönetici · Çıkış";
      button.dataset.action = "admin-signout";
      button.className = "btn btn-gold";
      button.title = cloudUser?.email || "Yönetici";
    } else {
      button.textContent = "Yönetici Girişi";
      button.dataset.action = "open-admin-login";
      button.className = "btn btn-gold";
      button.title = "Sonuç girişi yalnızca yöneticiye açıktır";
    }
    setCloudState(cloudState);
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sanitizeFilename(value) {
    return String(value).replace(/[^a-z0-9-_]+/gi, "_");
  }

  function participant(id) {
    return state.current.participants.find(p => p.id === id) || { id, name: id || "TBD" };
  }

  function playerName(id) {
    const p = participant(id);
    return p.name?.trim() || id || "TBD";
  }

  function displayName(id) {
    return escapeHTML(playerName(id));
  }

  function filledParticipants() {
    return state.current.participants.filter(p => p.name.trim());
  }

  function allPlayersReady() {
    const names = state.current.participants.map(p => p.name.trim()).filter(Boolean);
    return names.length === PLAYER_COUNT && new Set(names.map(n => n.toLocaleLowerCase("tr-TR"))).size === PLAYER_COUNT;
  }

  function randomSeed() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function seededRandom(seedText) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedText.length; i++) {
      h ^= seedText.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return () => {
      h += h << 13; h ^= h >>> 7;
      h += h << 3; h ^= h >>> 17;
      h += h << 5;
      return (h >>> 0) / 4294967296;
    };
  }

  function shuffled(array, seed = randomSeed()) {
    const rand = seededRandom(seed);
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function createMatch(phase, round, homeId, awayId, options = {}) {
    return {
      id: `${phase}-${round}-${homeId}-${awayId}-${Math.random().toString(36).slice(2, 7)}`,
      phase,
      round,
      homeId,
      awayId,
      homeTeam: "",
      awayTeam: "",
      homeScore: null,
      awayScore: null,
      tiebreakWinnerId: null,
      allowDraw: options.allowDraw !== false,
      seriesKey: options.seriesKey || null,
      note: ""
    };
  }

  function roundRobin(ids, phase, allowDraw = true) {
    const list = [...ids];
    if (list.length % 2) list.push(null);
    const rounds = [];
    const count = list.length;
    let rotation = [...list];
    for (let r = 0; r < count - 1; r++) {
      const matches = [];
      for (let i = 0; i < count / 2; i++) {
        let home = rotation[i];
        let away = rotation[count - 1 - i];
        if (home && away) {
          if ((r + i) % 2 === 1) [home, away] = [away, home];
          matches.push(createMatch(phase, r + 1, home, away, { allowDraw }));
        }
      }
      rounds.push({ number: r + 1, matches });
      rotation = [rotation[0], rotation[count - 1], ...rotation.slice(1, count - 1)];
    }
    return rounds;
  }

  function allRoundMatches(rounds = []) {
    return rounds.flatMap(round => round.matches || []);
  }

  function leagueMatches() {
    return allRoundMatches(state.current.league.rounds);
  }

  function goldMatches() {
    return allRoundMatches(state.current.phase2.goldRounds);
  }

  function silverMatches() {
    return allRoundMatches(state.current.phase2.silverRounds);
  }

  function matchComplete(match) {
    if (!match) return false;
    const scoresEntered = Number.isFinite(match.homeScore) && Number.isFinite(match.awayScore);
    if (!scoresEntered) return false;
    if (!match.allowDraw && match.homeScore === match.awayScore) {
      return match.tiebreakWinnerId === match.homeId || match.tiebreakWinnerId === match.awayId;
    }
    return true;
  }

  function matchWinnerId(match) {
    if (!matchComplete(match)) return null;
    if (match.homeScore > match.awayScore) return match.homeId;
    if (match.awayScore > match.homeScore) return match.awayId;
    return match.tiebreakWinnerId || null;
  }

  function matchOutcome(match, playerId) {
    if (!matchComplete(match)) return null;
    const winner = matchWinnerId(match);
    if (!winner) return "D";
    return winner === playerId ? "W" : "L";
  }

  function blankStat(id) {
    return { id, p: playerName(id), mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] };
  }

  function standings(ids, matches) {
    const map = new Map(ids.map(id => [id, blankStat(id)]));
    const sortedMatches = [...matches].sort((a, b) => (a.round || 0) - (b.round || 0));
    for (const match of sortedMatches) {
      if (!matchComplete(match)) continue;
      const h = map.get(match.homeId);
      const a = map.get(match.awayId);
      if (h) {
        h.mp++; h.gf += match.homeScore; h.ga += match.awayScore;
        const outcome = matchOutcome(match, h.id);
        if (outcome === "W") { h.w++; h.pts += 3; }
        else if (outcome === "D") { h.d++; h.pts += 1; }
        else h.l++;
        h.form.push(outcome);
      }
      if (a) {
        a.mp++; a.gf += match.awayScore; a.ga += match.homeScore;
        const outcome = matchOutcome(match, a.id);
        if (outcome === "W") { a.w++; a.pts += 3; }
        else if (outcome === "D") { a.d++; a.pts += 1; }
        else a.l++;
        a.form.push(outcome);
      }
    }
    const table = [...map.values()];
    table.forEach(row => { row.gd = row.gf - row.ga; row.form = row.form.slice(-5); });
    table.sort((a, b) =>
      b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.w - a.w || a.p.localeCompare(b.p, "tr")
    );
    return table;
  }

  function leagueStandings() {
    return standings(state.current.participants.map(p => p.id), leagueMatches());
  }

  function phase2Standings(group) {
    const ids = group === "gold" ? state.current.phase2.goldIds : state.current.phase2.silverIds;
    const stageMatches = group === "gold" ? goldMatches() : silverMatches();
    return standings(ids, [...leagueMatches(), ...stageMatches]);
  }

  function leagueFinished() {
    const matches = leagueMatches();
    return matches.length === 48 && matches.every(matchComplete);
  }

  function phase2Finished() {
    const matches = [...goldMatches(), ...silverMatches()];
    return state.current.phase2.generated && matches.length === 30 && matches.every(matchComplete);
  }

  function seriesWins(series) {
    const result = { a: 0, b: 0 };
    if (!series) return result;
    for (const game of series.games || []) {
      const winner = matchWinnerId(game);
      if (winner === series.playerAId) result.a++;
      if (winner === series.playerBId) result.b++;
    }
    return result;
  }

  function seriesWinner(series) {
    if (!series) return null;
    const wins = seriesWins(series);
    if (wins.a >= 2) return series.playerAId;
    if (wins.b >= 2) return series.playerBId;
    return null;
  }

  function createSeries(key, label, playerAId, playerBId) {
    return {
      key, label, playerAId, playerBId,
      games: [1, 2, 3].map(number => createMatch("knockout", number, playerAId, playerBId, { allowDraw: false, seriesKey: key }))
    };
  }

  function sameSeriesPlayers(series, a, b) {
    return series && series.playerAId === a && series.playerBId === b;
  }

  function ensureSeries(existing, key, label, a, b) {
    if (!a || !b) return null;
    return sameSeriesPlayers(existing, a, b) ? existing : createSeries(key, label, a, b);
  }

  function refreshKnockout() {
    const ko = state.current.knockout;
    if (!ko.generated || !ko.seeds) return;

    const qf1Winner = seriesWinner(ko.qf1);
    const qf2Winner = seriesWinner(ko.qf2);
    const qf3Winner = seriesWinner(ko.qf3);

    ko.sf1 = ensureSeries(ko.sf1, "sf1", "Yarı Final 1", ko.seeds.gold1, qf2Winner);
    ko.sf2 = ensureSeries(ko.sf2, "sf2", "Yarı Final 2", qf1Winner, qf3Winner);

    const sf1Winner = seriesWinner(ko.sf1);
    const sf2Winner = seriesWinner(ko.sf2);

    if (sf1Winner && sf2Winner) {
      if (!ko.final || ko.final.homeId !== sf1Winner || ko.final.awayId !== sf2Winner) {
        ko.final = createMatch("final", 1, sf1Winner, sf2Winner, { allowDraw: false });
      }
    } else {
      ko.final = null;
    }
    ko.championId = ko.final ? matchWinnerId(ko.final) : null;
  }

  function allKnockoutGames() {
    const ko = state.current.knockout;
    const series = [ko.qf1, ko.qf2, ko.qf3, ko.sf1, ko.sf2].filter(Boolean);
    return [...series.flatMap(s => s.games || []), ...(ko.final ? [ko.final] : [])];
  }

  function findMatch(id) {
    const pools = [...leagueMatches(), ...goldMatches(), ...silverMatches(), ...allKnockoutGames()];
    return pools.find(match => match.id === id) || null;
  }

  function currentStage() {
    if (!state.current.league.generated) return "setup";
    if (!leagueFinished()) return "league";
    if (!state.current.phase2.generated) return "phase2-ready";
    if (!phase2Finished()) return "phase2";
    if (!state.current.knockout.generated) return "knockout-ready";
    if (!state.current.knockout.championId) return "knockout";
    return "completed";
  }

  function statusLabel() {
    return {
      setup: "Kura Bekleniyor",
      league: "League Phase Devam Ediyor",
      "phase2-ready": "Altın/Gümüş Aşaması Hazır",
      phase2: "Altın/Gümüş Grupları",
      "knockout-ready": "Eleme Kurası Hazır",
      knockout: "Eleme Aşaması",
      completed: "Turnuva Tamamlandı"
    }[currentStage()];
  }

  function progressPercent() {
    const leagueDone = leagueMatches().filter(matchComplete).length;
    const groupDone = [...goldMatches(), ...silverMatches()].filter(matchComplete).length;
    const koDone = allKnockoutGames().filter(matchComplete).length;
    const score = leagueDone + groupDone + koDone;
    const estimated = 48 + 30 + 11;
    return Math.min(100, Math.round((score / estimated) * 100));
  }

  function trophySVG() {
    return `<svg class="trophy" viewBox="0 0 180 230" aria-hidden="true">
      <defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b7"/><stop offset=".45" stop-color="#d5a84e"/><stop offset="1" stop-color="#774811"/></linearGradient></defs>
      <path fill="url(#tg)" d="M49 20h82v25h25v17c0 39-23 61-55 67v25h27v23H52v-23h27v-25C47 123 24 101 24 62V45h25V20Zm0 44V53H35v9c0 25 12 41 31 49-11-14-17-29-17-47Zm82 0c0 18-6 33-17 47 19-8 31-24 31-49v-9h-14v11ZM65 39v24c0 31 11 50 25 50s25-19 25-50V39H65Z"/>
      <path fill="#091421" d="M39 177h102v28H39z"/><path fill="url(#tg)" d="M28 201h124v18H28z"/>
      <text x="90" y="197" text-anchor="middle" fill="#f4d58c" font-size="15" font-weight="900" font-family="Arial">FIFA 9</text>
    </svg>`;
  }

  function navTo(target) {
    if (target !== "livematch" && livePresentationMode !== "standard") exitLivePresentation(false);
    activeView = target;
    pageTitle.textContent = titleMap[target] || "FIFA 9";
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.nav === target));
    $("#sidebar").classList.remove("open");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    refreshKnockout();
    const liveNav = document.querySelector('[data-nav="livematch"]');
    if (liveNav) liveNav.classList.toggle("has-live", Boolean(state.current.live?.active));
    switch (activeView) {
      case "livematch": renderLiveMatchCentre(); break;
      case "livestats": renderLiveStatistics(); break;
      case "form": renderFormCentre(); break;
      case "odds": renderOddsCentre(); break;
      case "intelligence": renderIntelligenceCentre(); break;
      case "chat": window.FIFA_CHAT_UI?.render?.(view); break;
      case "setup": renderSetup(); break;
      case "league": renderLeague(); break;
      case "gold": renderGroup("gold"); break;
      case "silver": renderGroup("silver"); break;
      case "knockout": renderKnockout(); break;
      case "print": renderPrintCenter(); break;
      case "archive": renderArchive(); break;
      case "alltime": renderAllTime(); break;
      case "teams": renderTeamStatistics(); break;
      case "backup": renderBackup(); break;
      default: renderDashboard();
    }
  }

  function kpiCard(label, value, note, progress = null) {
    return `<article class="kpi-card">
      <div class="kpi-label">${escapeHTML(label)}</div>
      <div class="kpi-value">${escapeHTML(value)}</div>
      <div class="kpi-note">${escapeHTML(note)}</div>
      ${progress !== null ? `<div class="kpi-progress"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>` : ""}
    </article>`;
  }

  function progressRail() {
    const stage = currentStage();
    const order = ["league", "phase2", "knockout", "completed"];
    const indexMap = { setup: -1, league: 0, "phase2-ready": 0, phase2: 1, "knockout-ready": 1, knockout: 2, completed: 3 };
    const currentIndex = indexMap[stage];
    const steps = [
      ["Kura", "16 oyuncu ve 6 maçlık fikstür"],
      ["League Phase", "48 maç · tek lig tablosu"],
      ["Altın / Gümüş", "İki ligde toplam 30 maç"],
      ["Eleme Serileri", "Çeyrek final ve yarı final"],
      ["Büyük Final", "Tek maç · tek şampiyon"]
    ];
    return `<div class="progress-rail">${steps.map((step, i) => {
      const done = i === 0 ? state.current.league.generated : i <= currentIndex;
      const active = (i === 0 && stage === "setup") || (i === 1 && ["league","phase2-ready"].includes(stage)) || (i === 2 && ["phase2","knockout-ready"].includes(stage)) || (i === 3 && stage === "knockout") || (i === 4 && stage === "completed");
      return `<div class="progress-step ${done ? "done" : ""} ${active ? "active" : ""}">
        <div class="progress-number">${done && !active ? "✓" : i + 1}</div>
        <div class="progress-name">${step[0]}</div>
        <div class="progress-note">${step[1]}</div>
      </div>`;
    }).join("")}</div>`;
  }

  function renderDashboard() {
    const leagueDone = leagueMatches().filter(matchComplete).length;
    const groupDone = [...goldMatches(), ...silverMatches()].filter(matchComplete).length;
    const champ = state.current.knockout.championId;
    const leagueTable = state.current.league.generated ? leagueStandings() : [];
    const top = leagueTable[0];
    const historyTop = combinedAllTime()[0];

    view.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <div class="hero-kicker">✦ LEAGUE PHASE FORMAT</div>
          <h2><span>FIFA 9</span><br>Turnuva Merkezi</h2>
          <p>16 oyunculu League Phase, Altın ve Gümüş ligleri, üç maçlık eleme serileri ve sekiz turnuvalık tarihçe tek bir merkezde. Sonuçlar yönetici tarafından girilir; puan tabloları, sıralamalar ve eşleşmeler bütün cihazlarda otomatik güncellenir.</p>
          <div class="hero-actions">
            <button class="btn btn-gold" data-nav="${state.current.league.generated ? "league" : "setup"}">${state.current.league.generated ? "Canlı Turnuvaya Git" : "Oyuncuları Kaydet & Kura Çek"}</button>
            <button class="btn btn-ghost" data-nav="archive">8 Turnuvalık Arşivi Aç</button>
            <button class="btn btn-blue" data-action="share-site">WhatsApp'ta Paylaş</button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="trophy-orbit">
            ${trophySVG()}
            <span class="orbit-badge orbit-one">16 PLAYERS</span>
            <span class="orbit-badge orbit-two">ROAD TO GLORY</span>
          </div>
        </div>
      </section>

      ${renderDashboardLiveMatch()}

      <div class="kpi-grid">
        ${kpiCard("Turnuva Durumu", statusLabel(), `Genel ilerleme %${progressPercent()}`, progressPercent())}
        ${kpiCard("League Phase", `${leagueDone} / 48`, "Tamamlanan lig maçı", Math.round(leagueDone / 48 * 100))}
        ${kpiCard("Altın + Gümüş", `${groupDone} / 30`, "İkinci aşama maçı", Math.round(groupDone / 30 * 100))}
        ${kpiCard("Şampiyon", champ ? playerName(champ) : "Henüz Belirlenmedi", champ ? "FIFA 9 Şampiyonu" : "Final yolu devam ediyor")}
      </div>

      <section class="panel mt-16">
        <div class="panel-header">
          <div><h3 class="panel-title">Turnuva Yol Haritası</h3><div class="panel-subtitle">Kura çekiminden kupaya kadar otomatik aşama kontrolü.</div></div>
          <span class="badge ${currentStage() === "completed" ? "badge-green" : "badge-gold"}">${statusLabel()}</span>
        </div>
        ${progressRail()}
      </section>

      <div class="grid-2">
        <section class="panel">
          <div class="panel-header">
            <div><h3 class="panel-title">Canlı League Phase Tablosu</h3><div class="panel-subtitle">İlk 6 Altın Gruba, 7–12 Gümüş Gruba yükselir.</div></div>
            <button class="btn btn-ghost btn-small" data-nav="league">Tümünü Gör</button>
          </div>
          ${state.current.league.generated ? standingsTable(leagueTable.slice(0, 8), "league-preview") : emptyState("◎", "Henüz kura çekilmedi", "16 oyuncuyu kaydedip League Phase fikstürünü oluşturduğunda canlı puan tablosu burada görünecek.", `<button class="btn btn-gold" data-nav="setup">Kura Sayfasına Git</button>`) }
        </section>

        <section class="panel">
          <div class="panel-header">
            <div><h3 class="panel-title">Turnuva İstatistiği</h3><div class="panel-subtitle">Geçmiş sekiz turnuvanın kalıcı kayıtları.</div></div>
            <button class="btn btn-ghost btn-small" data-nav="alltime">Sıralamayı Aç</button>
          </div>
          <div class="format-list">
            <div class="format-row"><div class="format-icon">8</div><div><div class="format-title">Tamamlanan turnuva</div><div class="format-desc">FIFA 1’den FIFA 8’e kadar arşivlendi.</div></div></div>
            <div class="format-row"><div class="format-icon">${historical.summary?.matches || 382}</div><div><div class="format-title">Kayıtlı tarihî maç</div><div class="format-desc">Takımlar, skorlar ve final aşamaları dahil.</div></div></div>
            <div class="format-row"><div class="format-icon">${historical.summary?.goals || "–"}</div><div><div class="format-title">Tarihî gol</div><div class="format-desc">Tüm turnuvaların birleşik gol arşivi.</div></div></div>
            <div class="format-row"><div class="format-icon">♛</div><div><div class="format-title">Tüm zamanlar lideri</div><div class="format-desc">${historyTop ? `${escapeHTML(historyTop.name)} · ${historyTop.points} puan` : "Arşiv yükleniyor"}</div></div></div>
            ${top ? `<div class="format-row"><div class="format-icon">1</div><div><div class="format-title">FIFA 9 mevcut lideri</div><div class="format-desc">${displayName(top.id)} · ${top.pts} puan · ${formatGD(top.gd)} averaj</div></div></div>` : ""}
          </div>
        </section>
      </div>

      <h3 class="section-title">Şampiyonlar Kulübü</h3>
      <div class="champion-strip">
        ${combinedChampions().map(c => `<div class="champion-chip"><div class="name">${escapeHTML(c.name)}</div><div class="titles">${c.titles}×</div><div class="small">Şampiyonluk · ${c.finals} final · ${c.podiums} podyum</div></div>`).join("")}
      </div>`;
  }


  function getLiveState() {
    if (!state.current.live || typeof state.current.live !== "object") state.current.live = { active: null, archive: {} };
    if (!state.current.live.archive || typeof state.current.live.archive !== "object") state.current.live.archive = {};
    return state.current.live;
  }


  function getMatchArchiveState() {
    if (!state.current.matchArchive || typeof state.current.matchArchive !== "object") state.current.matchArchive = {};
    return state.current.matchArchive;
  }

  function matchArchiveSnapshot(match, source = "pre-match") {
    if (!match?.id) return null;
    const existing = getMatchArchiveState()[match.id];
    if (existing?.odds?.capturedAt) return existing;
    let item = null;
    try { item = buildMatchOdds(match, oddsBuildContext()); } catch (error) { console.warn("Odds snapshot could not be built", error); }
    const snapshot = {
      matchId: match.id,
      edition: Number(state.current.edition || 9),
      phase: match.phase || "league",
      stage: currentMatchStageLabel(match),
      homeId: match.homeId,
      awayId: match.awayId,
      homeName: playerName(match.homeId),
      awayName: playerName(match.awayId),
      homeTeam: match.homeTeam || "",
      awayTeam: match.awayTeam || "",
      odds: item ? {
        homeProbability: item.market.home.probability,
        drawProbability: item.market.draw.probability,
        awayProbability: item.market.away.probability,
        homeOdds: item.market.home.odds,
        drawOdds: item.market.draw.odds,
        awayOdds: item.market.away.odds,
        predictedHome: item.predictedHome,
        predictedAway: item.predictedAway,
        favoriteSide: item.favoriteSide,
        favoriteName: item.favorite?.name || "",
        confidence: item.confidence,
        reason: item.reason,
        capturedAt: new Date().toISOString(),
        source
      } : {
        capturedAt: new Date().toISOString(),
        source,
        unavailable: true
      },
      result: null,
      live: null,
      updatedAt: new Date().toISOString()
    };
    getMatchArchiveState()[match.id] = snapshot;
    Promise.resolve(window.FIFA_V22?.syncSnapshot?.(snapshot)).catch(error => console.warn("Snapshot sync failed", error));
    return snapshot;
  }

  function finalizeMatchArchive(match, liveData = null) {
    if (!match?.id) return null;
    const archive = getMatchArchiveState();
    const entry = archive[match.id] || {
      matchId: match.id,
      edition: Number(state.current.edition || 9),
      phase: match.phase || "league",
      stage: currentMatchStageLabel(match),
      homeId: match.homeId,
      awayId: match.awayId,
      homeName: playerName(match.homeId),
      awayName: playerName(match.awayId),
      odds: { capturedAt: null, source: "legacy-result", unavailable: true },
      result: null,
      live: null
    };
    entry.homeTeam = match.homeTeam || entry.homeTeam || "";
    entry.awayTeam = match.awayTeam || entry.awayTeam || "";
    entry.result = {
      homeScore: Number(match.homeScore),
      awayScore: Number(match.awayScore),
      tiebreakWinnerId: match.tiebreakWinnerId || null,
      winnerId: matchWinnerId(match),
      winnerName: matchWinnerId(match) ? playerName(matchWinnerId(match)) : "",
      completedAt: match.updatedAt || new Date().toISOString(),
      note: match.note || ""
    };
    if (liveData) {
      entry.live = {
        status: "fulltime",
        startedAt: liveData.startedAt || null,
        finishedAt: new Date().toISOString(),
        events: Array.isArray(liveData.events) ? liveData.events.map(event => ({ ...event })) : [],
        homeScore: Number(liveData.homeScore) || 0,
        awayScore: Number(liveData.awayScore) || 0,
        minute: Number(liveData.minute) || 0,
        addedTime: Number(liveData.addedTime) || 0
      };
    } else if (getLiveState().archive?.[match.id]) {
      const archived = getLiveState().archive[match.id];
      entry.live = {
        status: archived.status || "fulltime",
        startedAt: archived.startedAt || null,
        finishedAt: archived.finishedAt || match.updatedAt || null,
        events: Array.isArray(archived.events) ? archived.events.map(event => ({ ...event })) : [],
        homeScore: Number(archived.homeScore) || Number(match.homeScore) || 0,
        awayScore: Number(archived.awayScore) || Number(match.awayScore) || 0,
        minute: Number(archived.minute) || 0,
        addedTime: Number(archived.addedTime) || 0
      };
    }
    entry.updatedAt = new Date().toISOString();
    getMatchArchiveState()[match.id] = entry;
    Promise.resolve(window.FIFA_V22?.lockPoll?.(match.id)).catch(error => console.warn("Poll lock failed", error));
    Promise.resolve(window.FIFA_V22?.syncSnapshot?.(entry)).catch(error => console.warn("Archive sync failed", error));
    return entry;
  }

  function clearMatchArchiveResult(matchId) {
    const entry = getMatchArchiveState()[matchId];
    if (!entry) return;
    entry.result = null;
    entry.live = null;
    entry.updatedAt = new Date().toISOString();
    Promise.resolve(window.FIFA_V22?.unlockPoll?.(matchId)).catch(error => console.warn("Poll unlock failed", error));
    Promise.resolve(window.FIFA_V22?.syncSnapshot?.(entry)).catch(error => console.warn("Archive sync failed", error));
  }

  function hydrateV22Community(root = document) {
    setTimeout(() => window.FIFA_V22?.hydrate?.(root), 0);
  }

  function getActiveLive() {
    const live = getLiveState().active;
    if (!live?.matchId) return null;
    const match = findMatch(live.matchId);
    return match ? { live, match } : null;
  }

  function liveStatusText(live) {
    const labels = {
      live: "CANLI",
      paused: "DURAKLATILDI",
      halftime: "DEVRE ARASI",
      secondhalf: "İKİNCİ YARI",
      extra: "UZATMA",
      penalties: "PENALTILAR",
      fulltime: "MAÇ SONU"
    };
    return labels[live?.status] || "CANLI";
  }

  function liveMinuteText(live) {
    if (!live) return "–";
    if (live.status === "halftime") return "HT";
    if (live.status === "fulltime") return "FT";
    if (live.status === "penalties") return "PEN";
    const minute = Math.max(0, Number(live.minute) || 0);
    const added = Math.max(0, Number(live.addedTime) || 0);
    return `${minute}${added ? `+${added}` : ""}'`;
  }

  function liveStageLabel(match) {
    return currentMatchStageLabel(match).replace(/ · Match \d+$/, "");
  }

  function liveEligibleMatches() {
    return allCurrentMatches()
      .filter(match => match?.homeId && match?.awayId && !matchComplete(match))
      .sort((a, b) => {
        const phaseOrder = { league: 1, gold: 2, silver: 3, knockout: 4, final: 5 };
        return (phaseOrder[a.phase] || 99) - (phaseOrder[b.phase] || 99) || (a.round || 0) - (b.round || 0);
      });
  }

  function renderDashboardLiveMatch() {
    const active = getActiveLive();
    if (!active) return "";
    const { live, match } = active;
    return `<section class="dashboard-live-match" data-nav="livematch">
      <div class="dashboard-live-status"><span class="live-pulse-dot"></span><strong>${liveStatusText(live)}</strong><span>${escapeHTML(liveStageLabel(match))}</span></div>
      <div class="dashboard-live-score"><span>${displayName(match.homeId)}</span><strong>${live.homeScore} – ${live.awayScore}</strong><span>${displayName(match.awayId)}</span></div>
      <div class="dashboard-live-minute">${liveMinuteText(live)}</div>
      <div class="dashboard-live-open">Canlı Maçı Aç →</div>
    </section>`;
  }



  function liveHeatProfile(value) {
    const heat = Math.round(intelligenceClamp(Number(value) || 0, 0, 100));
    if (heat >= 88) return { value: heat, key: "red-zone", label: intelligenceCopy("KIRMIZI BÖLGE", "RED ZONE") };
    if (heat >= 74) return { value: heat, key: "on-fire", label: intelligenceCopy("ALEV ALDI", "ON FIRE") };
    if (heat >= 58) return { value: heat, key: "hot", label: intelligenceCopy("ÇOK SICAK", "VERY HOT") };
    if (heat >= 40) return { value: heat, key: "warm", label: intelligenceCopy("ISINIYOR", "WARMING UP") };
    return { value: heat, key: "cool", label: intelligenceCopy("SAKİN", "COOL") };
  }

  function liveEventThreatValue(event) {
    const weights = { goal: .72, bigchance: .42, attack: .15, note: .07, yellow: .03, red: .09 };
    return weights[event?.type] || 0;
  }

  function renderLiveHeatBadge(profile, name) {
    return `<div class="live-heat-badge heat-${profile.key}" title="${escapeHTML(name)} live heat"><span class="heat-flame">◆</span><div><small>${intelligenceCopy("LIVE HEAT", "LIVE HEAT")}</small><strong>${escapeHTML(profile.label)}</strong></div><b>${profile.value}</b></div>`;
  }

  function renderLivePresentationControls() {
    const standard = livePresentationMode === "standard";
    return `<div class="live-presentation-controls ${standard ? "standard" : "active"}">
      ${standard ? `<div><span>${intelligenceCopy("YAYIN GÖRÜNÜMÜ", "BROADCAST VIEW")}</span><strong>${intelligenceCopy("İzleyici ekranını büyüt", "Enlarge the viewer experience")}</strong></div><div class="live-presentation-buttons"><button class="btn btn-ghost" data-action="enter-broadcast-mode">${intelligenceCopy("Broadcast Mode", "Broadcast Mode")}</button><button class="btn btn-gold" data-action="enter-tv-mode">${intelligenceCopy("TV / Projektör", "TV / Projector")}</button></div>` : `<div class="presentation-live-label"><span class="live-pulse-dot"></span><strong>${livePresentationMode === "tv" ? "TV / PROJECTOR MODE" : "BROADCAST MODE"}</strong></div><button class="btn btn-gold" data-action="exit-live-presentation">${intelligenceCopy("Standart Görünüme Dön", "Exit Presentation")}</button>`}
    </div>`;
  }

  function applyLivePresentationMode() {
    document.body.classList.toggle("live-broadcast-mode", livePresentationMode === "broadcast");
    document.body.classList.toggle("live-tv-mode", livePresentationMode === "tv");
    document.body.classList.toggle("live-presentation-active", livePresentationMode !== "standard");
  }

  async function enterLivePresentation(mode) {
    if (!getActiveLive()) { toast(intelligenceCopy("Önce canlı maç başlatılmalı.", "A live match must be started first."), "error"); return; }
    livePresentationMode = mode === "tv" ? "tv" : "broadcast";
    sessionStorage.setItem("fifa9-live-presentation-mode", livePresentationMode);
    applyLivePresentationMode();
    renderLiveMatchCentre();
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch (_) {}
  }

  async function exitLivePresentation(exitFullscreen = true) {
    livePresentationMode = "standard";
    sessionStorage.removeItem("fifa9-live-presentation-mode");
    applyLivePresentationMode();
    if (exitFullscreen && document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch (_) {}
    }
    if (activeView === "livematch") renderLiveMatchCentre();
  }

  function maybeShowGoalAnnouncement(live, match) {
    const goals = [...(live?.events || [])].filter(event => event.type === "goal").sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    const goal = goals[0];
    if (!goal?.id) return;
    const key = `fifa9-goal-seen-${match.id}`;
    if (sessionStorage.getItem(key) === goal.id) return;
    const age = Date.now() - new Date(goal.createdAt || 0).getTime();
    if (Number.isFinite(age) && age > 18000 && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, goal.id);
      return;
    }
    sessionStorage.setItem(key, goal.id);
    const sideName = goal.side === "home" ? playerName(match.homeId) : playerName(match.awayId);
    const teamName = goal.side === "home" ? (live.homeTeam || match.homeTeam || "") : (live.awayTeam || match.awayTeam || "");
    const minute = `${Number(goal.minute) || 0}${Number(goal.addedTime) ? `+${Number(goal.addedTime)}` : ""}'`;
    document.querySelector(".live-goal-announcement")?.remove();
    const node = document.createElement("div");
    node.className = `live-goal-announcement side-${goal.side}`;
    node.innerHTML = `<div class="goal-announcement-core"><span class="goal-announcement-kicker">${intelligenceCopy("CANLI ANONS", "LIVE ANNOUNCEMENT")}</span><div class="goal-announcement-word">GOOOOL!</div><strong>${escapeHTML(sideName)}</strong><small>${escapeHTML(teamName)} · ${minute}</small><div class="goal-announcement-score">${live.homeScore}<i>–</i>${live.awayScore}</div></div>`;
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
    clearTimeout(liveGoalAnnouncementTimer);
    liveGoalAnnouncementTimer = setTimeout(() => { node.classList.remove("show"); setTimeout(() => node.remove(), 500); }, 4800);
  }

  function buildLiveStudioData() {
    const pulse = buildLiveMatchPulse();
    if (!pulse) return null;
    const { live, match } = pulse;
    const homeName = playerName(match.homeId);
    const awayName = playerName(match.awayId);
    const minuteNow = Math.max(0, Math.min(120, Number(live.minute) || 0));
    const scoreDiff = (Number(live.homeScore) || 0) - (Number(live.awayScore) || 0);
    const binSize = 5;
    const binCount = 18;
    const bins = Array.from({ length: binCount }, (_, index) => ({
      start: index * binSize,
      end: Math.min(90, (index + 1) * binSize),
      swing: 0,
      home: 0,
      away: 0,
      eventCount: 0,
      events: []
    }));
    const events = [...(live.events || [])].sort((a, b) => (Number(a.minute) || 0) - (Number(b.minute) || 0) || (Number(a.addedTime) || 0) - (Number(b.addedTime) || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let baseMomentum = Math.round(((pulse.base?.market?.home?.probability || .34) - (pulse.base?.market?.away?.probability || .34)) * 54);
    events.forEach(event => {
      const minute = Math.max(0, Math.min(89, Number(event.minute) || 0));
      const idx = Math.min(binCount - 1, Math.floor(minute / binSize));
      let delta = 0;
      if (event.type === 'goal') delta = event.side === 'home' ? 28 : event.side === 'away' ? -28 : 0;
      else if (event.type === 'bigchance') delta = event.side === 'home' ? 20 : event.side === 'away' ? -20 : 0;
      else if (event.type === 'attack') delta = event.side === 'home' ? 10 : event.side === 'away' ? -10 : 0;
      else if (event.type === 'yellow') delta = event.side === 'home' ? -6 : event.side === 'away' ? 6 : 0;
      else if (event.type === 'red') delta = event.side === 'home' ? -18 : event.side === 'away' ? 18 : 0;
      else if (event.type === 'note') delta = event.side === 'home' ? 8 : event.side === 'away' ? -8 : 0;
      bins[idx].swing += delta;
      bins[idx].eventCount += 1;
      bins[idx].events.push(event);
      if (delta > 0) bins[idx].home += Math.abs(delta) + 8;
      if (delta < 0) bins[idx].away += Math.abs(delta) + 8;
    });

    const points = [];
    let running = baseMomentum;
    for (let index = 0; index < binCount; index += 1) {
      const bin = bins[index];
      const progress = (index + 1) / binCount;
      const activeWeight = minuteNow >= bin.start ? 1 : .4;
      const scoreBias = scoreDiff * (8 + progress * 10) * activeWeight;
      const momentumBias = pulse.momentum.side === 'home' ? 4 : pulse.momentum.side === 'away' ? -4 : 0;
      running = intelligenceClamp(running * .74 + bin.swing + scoreBias + momentumBias, -100, 100);
      const closenessBoost = Math.max(0, 24 - Math.abs(scoreDiff) * 7);
      const urgencyBoost = progress * 34 + (minuteNow >= 75 ? 8 : 0);
      const importanceBonus = pulse.importance.level === 'legendary' ? 10 : pulse.importance.level === 'critical' ? 7 : pulse.importance.level === 'high' ? 4 : 0;
      const pressure = Math.round(intelligenceClamp(Math.abs(running) * .4 + closenessBoost + urgencyBoost + bin.eventCount * 10 + importanceBonus, 6, 100));
      const homePressure = Math.round(intelligenceClamp((running > 0 ? running : 0) * .72 + pressure * .32 + bin.home, 0, 100));
      const awayPressure = Math.round(intelligenceClamp((running < 0 ? Math.abs(running) : 0) * .72 + pressure * .32 + bin.away, 0, 100));
      points.push({
        minute: bin.end,
        start: bin.start,
        end: bin.end,
        value: Math.round(running),
        pressure,
        homePressure,
        awayPressure,
        events: bin.events,
        active: minuteNow >= bin.start && minuteNow < bin.end
      });
    }

    const currentIndex = Math.min(binCount - 1, Math.floor(Math.min(89, minuteNow) / binSize));
    const currentSegment = points[currentIndex] || points[0];
    const maxAbs = Math.max(40, ...points.map(point => Math.abs(point.value)));
    const eventSummary = [];
    if (pulse.momentum.side !== 'draw') eventSummary.push(pulse.momentum.label);
    if (pulse.pressure >= 72) eventSummary.push(intelligenceCopy('baskı seviyesi zirveye çıktı', 'pressure level has reached its peak'));
    if (pulse.chaos >= 70) eventSummary.push(intelligenceCopy('maç tam bir kaos bölgesine girdi', 'the match has entered a chaos zone'));
    if (pulse.leadChanges >= 1) eventSummary.push(intelligenceCopy(`${pulse.leadChanges} liderlik değişimi yaşandı`, `${pulse.leadChanges} lead changes have already occurred`));
    if (scoreDiff === 0) eventSummary.push(intelligenceCopy('bir sonraki gol dengeyi tamamen kırabilir', 'the next goal could completely break the balance'));
    const topWave = [...points].sort((a, b) => (b.homePressure + b.awayPressure) - (a.homePressure + a.awayPressure))[0] || currentSegment;
    const momentumOwner = currentSegment.value > 10 ? homeName : currentSegment.value < -10 ? awayName : intelligenceCopy('denge', 'balance');
    const controlOwner = pulse.leaderSide === 'home' ? homeName : pulse.leaderSide === 'away' ? awayName : intelligenceCopy('Denge', 'Balanced');
    const phaseProgress = Math.max(.08, Math.min(1.15, minuteNow / 90));
    const homeEventThreat = events.filter(event => event.side === 'home').reduce((sum, event) => sum + liveEventThreatValue(event), 0);
    const awayEventThreat = events.filter(event => event.side === 'away').reduce((sum, event) => sum + liveEventThreatValue(event), 0);
    const expectedHome = intelligenceClamp(((pulse.base.home.avgGoals + pulse.base.away.gaPerGame) / 2) * (.24 + phaseProgress * .58), .05, 4.4);
    const expectedAway = intelligenceClamp(((pulse.base.away.avgGoals + pulse.base.home.gaPerGame) / 2) * (.24 + phaseProgress * .58), .05, 4.4);
    const homeThreat = Number(intelligenceClamp(expectedHome + homeEventThreat + currentSegment.homePressure / 260, .05, 6.5).toFixed(2));
    const awayThreat = Number(intelligenceClamp(expectedAway + awayEventThreat + currentSegment.awayPressure / 260, .05, 6.5).toFixed(2));
    const threatTotal = homeThreat + awayThreat || 1;
    const homeThreatShare = Math.round(homeThreat / threatTotal * 100);
    const awayThreatShare = 100 - homeThreatShare;
    const recentWindow = events.filter(event => minuteNow - (Number(event.minute) || 0) <= 12);
    const homeRecentHeat = recentWindow.filter(event => event.side === 'home').reduce((sum, event) => sum + liveEventThreatValue(event) * 24, 0);
    const awayRecentHeat = recentWindow.filter(event => event.side === 'away').reduce((sum, event) => sum + liveEventThreatValue(event) * 24, 0);
    const homeHeat = liveHeatProfile(currentSegment.homePressure * .72 + homeRecentHeat + (pulse.momentum.side === 'home' ? 12 : 0));
    const awayHeat = liveHeatProfile(currentSegment.awayPressure * .72 + awayRecentHeat + (pulse.momentum.side === 'away' ? 12 : 0));
    return {
      ...pulse,
      homeName,
      awayName,
      currentSegment,
      points,
      maxAbs,
      eventSummary,
      topWave,
      momentumOwner,
      controlOwner,
      homeThreat,
      awayThreat,
      homeThreatShare,
      awayThreatShare,
      homeHeat,
      awayHeat,
      scoreboardLabel: scoreDiff === 0 ? intelligenceCopy('Her şey açık', 'Everything is open') : scoreDiff > 0 ? `${homeName} ${intelligenceCopy('öne geçti', 'in front')}` : `${awayName} ${intelligenceCopy('öne geçti', 'in front')}`
    };
  }

  function renderLiveStudioMetrics(data) {
    const nextGoalName = data.nextGoalSide === 'home' ? data.homeName : data.nextGoalSide === 'away' ? data.awayName : intelligenceCopy('Eşit', 'Even');
    return `<div class="live-studio-metric-grid">
      <article class="live-studio-metric emphasis"><span>${intelligenceCopy('Momentum', 'Momentum')}</span><strong>${escapeHTML(data.momentumOwner)}</strong><small>${escapeHTML(data.momentum.label)}</small><div class="metric-bar"><i style="width:${data.momentum.strength}%"></i></div></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('Maç Kontrolü', 'Match Control')}</span><strong>${escapeHTML(data.controlOwner)}</strong><small>${simulationPct(Math.max(data.probability.home, data.probability.draw, data.probability.away), 1)}</small></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('Baskı', 'Pressure')}</span><strong>${data.pressure}/100</strong><small>${intelligenceCopy('Canlı yoğunluk seviyesi', 'Live intensity level')}</small><div class="metric-ring" style="--metric:${data.pressure}%"></div></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('Kaos', 'Chaos')}</span><strong>${data.chaos}/100</strong><small>${intelligenceCopy('Skor ve olay hareketliliği', 'Score and event volatility')}</small></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('Geri Dönüş Şansı', 'Comeback Chance')}</span><strong>${simulationPct(data.comebackProbability, 1)}</strong><small>${data.trailingSide === 'draw' ? intelligenceCopy('Skor dengede', 'Score level') : escapeHTML(data.trailingSide === 'home' ? data.homeName : data.awayName)}</small></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('Sonraki Gol', 'Next Goal')}</span><strong>${escapeHTML(nextGoalName)}</strong><small>${intelligenceCopy('Model sinyali', 'Model signal')}</small></article>
      <article class="live-studio-metric accent"><span>${intelligenceCopy('Maç Nabzı', 'Match Pulse')}</span><strong>${data.pulse} BPM</strong><small>${escapeHTML(data.scoreboardLabel)}</small></article>
      <article class="live-studio-metric"><span>${intelligenceCopy('En Sıcak Dilim', 'Hottest Wave')}</span><strong>${data.topWave.start}–${data.topWave.end}'</strong><small>${intelligenceCopy('En yüksek baskı bloğu', 'Highest pressure block')}</small></article>
    </div>`;
  }


  function renderLiveStudioThreatPanel(data) {
    return `<div class="live-studio-panel-stack">
      <div class="panel-header compact"><div><h3 class="panel-title">${intelligenceCopy('Atak Tehdidi ve Oyuncu Isısı', 'Attack Threat & Player Heat')}</h3><div class="panel-subtitle">${intelligenceCopy('Gerçek xG değildir; oyuncu geçmişi, gol, büyük şans, tehlikeli atak ve anlık baskıdan üretilen canlı xT göstergesidir.', 'This is not official xG; it is a live xT indicator generated from player history, goals, big chances, dangerous attacks and current pressure.')}</div></div><span class="badge badge-gold">LIVE xT</span></div>
      <div class="live-threat-duel">
        <article class="live-threat-card home"><div class="live-threat-head"><span>${escapeHTML(data.homeName)}</span>${renderLiveHeatBadge(data.homeHeat, data.homeName)}</div><div class="live-threat-value"><small>xT</small><strong>${data.homeThreat.toFixed(2)}</strong></div><div class="live-threat-track"><i style="width:${data.homeThreatShare}%"></i></div><footer><span>${data.homeThreatShare}% ${intelligenceCopy('tehdit payı', 'threat share')}</span><b>${data.currentSegment.homePressure}/100 ${intelligenceCopy('baskı', 'pressure')}</b></footer></article>
        <div class="live-threat-centre"><span>VS</span><strong>${Math.abs(data.homeThreat - data.awayThreat).toFixed(2)}</strong><small>${intelligenceCopy('tehdit farkı', 'threat gap')}</small></div>
        <article class="live-threat-card away"><div class="live-threat-head"><span>${escapeHTML(data.awayName)}</span>${renderLiveHeatBadge(data.awayHeat, data.awayName)}</div><div class="live-threat-value"><small>xT</small><strong>${data.awayThreat.toFixed(2)}</strong></div><div class="live-threat-track"><i style="width:${data.awayThreatShare}%"></i></div><footer><span>${data.awayThreatShare}% ${intelligenceCopy('tehdit payı', 'threat share')}</span><b>${data.currentSegment.awayPressure}/100 ${intelligenceCopy('baskı', 'pressure')}</b></footer></article>
      </div>
      <div class="live-threat-note"><strong>${intelligenceCopy('Nasıl okunur?', 'How to read it?')}</strong> ${intelligenceCopy('xT yükseldikçe oyuncunun gol üretme tehdidi büyür. Büyük şans ve tehlikeli atak girişleri modeli doğrudan etkiler.', 'A higher xT means a stronger scoring threat. Big-chance and dangerous-attack entries directly affect the model.')}</div>
    </div>`;
  }

  function renderLiveStudioMomentumPanel(data) {
    const width = 1000, height = 280, baseline = 140;
    const coords = data.points.map((point, index) => {
      const x = 40 + (index / (data.points.length - 1 || 1)) * 920;
      const y = baseline - (point.value / data.maxAbs) * 96;
      return { ...point, x, y };
    });
    const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const area = `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} L ${coords[0].x.toFixed(1)} ${baseline} Z`;
    const currentMinuteX = 40 + ((Math.min(90, Math.max(0, Number(data.live.minute) || 0)) / 90) * 920);
    return `<div class="live-studio-panel-stack">
      <div class="panel-header compact"><div><h3 class="panel-title">${intelligenceCopy('Momentum Akışı', 'Momentum Flow')}</h3><div class="panel-subtitle">${intelligenceCopy('Dakika ilerledikçe hangi taraf oyunu itti, baskı nerede yükseldi?', 'Which side pushed the game and where did the pressure rise as the minutes advanced?')}</div></div><span class="badge badge-gold">${intelligenceCopy('CANLI', 'LIVE')}</span></div>
      <div class="live-studio-chart-wrap">
        <svg class="live-studio-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Live momentum chart">
          <defs>
            <linearGradient id="liveStudioArea" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="rgba(68,160,255,.12)"></stop><stop offset="50%" stop-color="rgba(232,196,92,.26)"></stop><stop offset="100%" stop-color="rgba(255,95,131,.12)"></stop></linearGradient>
            <linearGradient id="liveStudioLine" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="#59b4ff"></stop><stop offset="50%" stop-color="#f0d28a"></stop><stop offset="100%" stop-color="#ff718b"></stop></linearGradient>
          </defs>
          ${[0,25,50,75,100].map(level => `<line x1="40" x2="960" y1="${baseline - level / 100 * 96}" y2="${baseline - level / 100 * 96}" class="studio-grid-line"></line><line x1="40" x2="960" y1="${baseline + level / 100 * 96}" y2="${baseline + level / 100 * 96}" class="studio-grid-line"></line>`).join('')}
          ${[0,15,30,45,60,75,90].map(minute => `<line x1="${40 + minute / 90 * 920}" x2="${40 + minute / 90 * 920}" y1="34" y2="246" class="studio-grid-vertical"></line><text x="${40 + minute / 90 * 920}" y="262" text-anchor="middle" class="studio-minute-label">${minute}'</text>`).join('')}
          <line x1="40" x2="960" y1="${baseline}" y2="${baseline}" class="studio-baseline"></line>
          <path d="${area}" fill="url(#liveStudioArea)"></path>
          <path d="${line}" class="studio-momentum-line"></path>
          <line x1="${currentMinuteX}" x2="${currentMinuteX}" y1="26" y2="252" class="studio-current-minute"></line>
          ${coords.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4.5" class="studio-point ${point.value >= 0 ? 'home' : 'away'}"></circle>`).join('')}
          ${coords.flatMap(point => (point.events || []).map(event => {
            const markerY = event.side === 'home' ? baseline - 112 : event.side === 'away' ? baseline + 112 : baseline;
            const markerClass = event.type === 'goal' ? 'goal' : event.type === 'bigchance' ? 'bigchance' : event.type === 'attack' ? 'attack' : event.type === 'red' ? 'red' : event.type === 'yellow' ? 'yellow' : 'note';
            const markerText = event.type === 'goal' ? 'G' : event.type === 'bigchance' ? '!' : event.type === 'attack' ? 'A' : event.type === 'red' ? 'R' : event.type === 'yellow' ? 'Y' : '•';
            return `<g class="studio-event-marker ${markerClass}"><circle cx="${point.x.toFixed(1)}" cy="${markerY.toFixed(1)}" r="8"></circle><text x="${point.x.toFixed(1)}" y="${(markerY + 3).toFixed(1)}" text-anchor="middle">${markerText}</text></g>`;
          })).join('')}
        </svg>
      </div>
      <div class="live-studio-chart-legend"><span class="home">${escapeHTML(data.homeName)} ${intelligenceCopy('baskı üst bölge', 'pressure upper zone')}</span><span class="draw">${intelligenceCopy('denge çizgisi', 'balance line')}</span><span class="away">${escapeHTML(data.awayName)} ${intelligenceCopy('baskı alt bölge', 'pressure lower zone')}</span></div>
    </div>`;
  }

  function renderLiveStudioPressurePanel(data) {
    return `<div class="live-studio-panel-stack">
      <div class="panel-header compact"><div><h3 class="panel-title">${intelligenceCopy('Dakika Bazlı Baskı Dalgası', 'Minute-by-Minute Pressure Wave')}</h3><div class="panel-subtitle">${intelligenceCopy('Her 5 dakikalık blokta baskı şiddeti ve yön değişimi.', 'Pressure intensity and direction in every 5-minute block.')}</div></div><span class="badge badge-blue">${data.points.length} BLOCKS</span></div>
      <div class="live-pressure-wave-list">${data.points.map(point => `<div class="live-pressure-wave ${point.active ? 'active' : ''}"><div class="live-pressure-minute">${point.start}–${point.end}'</div><div class="live-pressure-bars"><span class="home" style="width:${point.homePressure}%"></span><span class="away" style="width:${point.awayPressure}%"></span></div><div class="live-pressure-meta"><strong>${point.pressure}</strong><small>${point.events.length ? point.events.map(event => event.type === 'goal' ? '⚽' : event.type === 'bigchance' ? '◎' : event.type === 'attack' ? '↗' : event.type === 'red' ? '🟥' : event.type === 'yellow' ? '🟨' : '◆').join(' ') : '—'}</small></div></div>`).join('')}</div>
      <div class="live-pressure-footnote">${intelligenceCopy('Mavi bloklar ev sahibi baskısını, kırmızı bloklar deplasman baskısını gösterir. Sarı parlama, şu anda canlı oynanan zaman aralığını işaretler.', 'Blue bars show home pressure, red bars show away pressure. The gold glow marks the currently active live time block.')}</div>
    </div>`;
  }

  function renderLiveStudioProbabilityPanel(data) {
    return `<div class="live-studio-panel-stack">
      <div class="panel-header compact"><div><h3 class="panel-title">${intelligenceCopy('Canlı Olasılık ve Maç Kontrolü', 'Live Probability & Match Control')}</h3><div class="panel-subtitle">${intelligenceCopy('Skor ve dakikaya göre sürekli güncellenen kazanma eğrisi.', 'Continuously updated win curve based on score and minute.')}</div></div><span class="badge badge-gold">1 X 2</span></div>
      ${renderProbabilityRail(data.probability, { home: data.homeName, away: data.awayName })}
      <div class="live-studio-probability-cards"><article><span>${escapeHTML(data.homeName)}</span><strong>${simulationPct(data.probability.home, 1)}</strong><small>${intelligenceCopy('kazanma', 'win')}</small></article><article><span>X</span><strong>${simulationPct(data.probability.draw, 1)}</strong><small>${intelligenceCopy('beraberlik', 'draw')}</small></article><article><span>${escapeHTML(data.awayName)}</span><strong>${simulationPct(data.probability.away, 1)}</strong><small>${intelligenceCopy('kazanma', 'win')}</small></article></div>
      <div class="live-studio-mini-kpis"><div><span>${intelligenceCopy('Kritiklik', 'Importance')}</span><strong>${escapeHTML(data.importance.label)}</strong></div><div><span>${intelligenceCopy('Liderlik Değişimi', 'Lead Changes')}</span><strong>${data.leadChanges}</strong></div><div><span>${intelligenceCopy('Canlı Dakika', 'Live Minute')}</span><strong>${liveMinuteText(data.live)}</strong></div></div>
    </div>`;
  }

  function renderLiveStudioStoryPanel(data) {
    const bulletLines = [
      `${intelligenceCopy('Baskı merkezi', 'Pressure focus')}: ${data.currentSegment.start}–${data.currentSegment.end}'`,
      `${intelligenceCopy('Kontrol sinyali', 'Control signal')}: ${data.controlOwner}`,
      `${intelligenceCopy('Canlı nabız', 'Live pulse')}: ${data.pulse} BPM`,
      ...data.eventSummary.slice(0, 4)
    ];
    return `<div class="live-studio-panel-stack">
      <div class="panel-header compact"><div><h3 class="panel-title">${intelligenceCopy('Maç Hikâyesi ve AI Yorum', 'Match Story & AI Commentary')}</h3><div class="panel-subtitle">${intelligenceCopy('İzleyicilerin sadece skoru değil, maçın resmini de anlaması için kısa canlı anlatım.', 'A short live narrative so viewers can understand the match picture beyond the scoreline.')}</div></div><span class="badge badge-blue">LIVE AI</span></div>
      <div class="live-studio-story-box"><p>${data.chaos >= 80 ? intelligenceCopy('Karşınızda tam anlamıyla kontrolden çıkmaya aday bir maç var. Her hücum, bütün olasılık haritasını yeniden yazabilecek güçte.', 'This match is on the verge of spiralling out of control. Every attack has the power to rewrite the probability map.') : data.pressure >= 72 ? intelligenceCopy('Tempoyu belirleyen unsur artık yalnızca skor değil, zaman baskısı. Son bölüm yaklaşırken risk alma seviyesi yükseliyor.', 'The score is no longer the only force shaping the match — time pressure is now taking over. Risk levels are rising as the closing phase approaches.') : data.momentum.side !== 'draw' ? `${escapeHTML(data.momentum.label)}. ${intelligenceCopy('Skor tabelası kadar saha akışı da bu üstünlüğü destekliyor.', 'The flow of the game is supporting that advantage as much as the scoreboard does.')}` : intelligenceCopy('Maç halen dengede. Bir sonraki kırılma anı, kimliğini belirleyecek ilk büyük baskı serisini yaratabilir.', 'The match remains balanced. The next turning point could create the first major pressure sequence that defines it.')}</p><div class="live-story-bullets">${bulletLines.map(line => `<div><span>•</span><small>${escapeHTML(line)}</small></div>`).join('')}</div></div>
    </div>`;
  }

  function renderLiveMatchCentre() {
    const active = getActiveLive();
    const eligible = liveEligibleMatches();
    const archive = Object.values(getLiveState().archive || {}).sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || ''))).slice(0, 6);

    if (!active) {
      if (livePresentationMode !== "standard") {
        livePresentationMode = "standard";
        sessionStorage.removeItem("fifa9-live-presentation-mode");
        applyLivePresentationMode();
      }
      view.innerHTML = `
        <div class="group-banner live-match-banner">
          <div><div class="eyebrow">LIVE MATCH STUDIO v21</div><h2>Canlı Maç Merkezi</h2><p>Yönetici için güçlü kontrol masası, izleyici için ise yayın kalitesinde skor, grafik ve maç akışı. Tam ekran yayın, TV/projektör modu, canlı xT atak tehdidi, oyuncu ısı rozetleri ve otomatik gol anonslarıyla zenginleştirilmiş yayın merkezi.</p></div>
          <div class="group-emblem live-ball">●</div>
        </div>
        <div class="live-match-empty-strip"><span class="live-offline-dot"></span><strong>Şu anda canlı maç yok</strong><span>${eligible.length} oynanmamış fikstür canlı yayına hazır.</span></div>
        <div class="grid-2 mt-24">
          <section class="panel">
            <div class="panel-header"><div><h3 class="panel-title">Canlı Yayına Hazır Maçlar</h3><div class="panel-subtitle">Yönetici olarak bir maçı seçip canlı skoru, baskıyı ve maç hikâyesini başlat.</div></div><span class="badge badge-gold">${eligible.length} MAÇ</span></div>
            ${eligible.length ? `<div class="live-match-selector">${eligible.slice(0, 24).map(match => renderLiveMatchOption(match)).join('')}</div>` : emptyState('✓', 'Bekleyen maç bulunmuyor', 'Yeni fikstür oluştuğunda burada görünecek.')}
          </section>
          <section class="panel">
            <div class="panel-header"><div><h3 class="panel-title">Live Match Studio nasıl çalışır?</h3><div class="panel-subtitle">Yeni yayın akışı.</div></div></div>
            <div class="format-list">
              <div class="format-row"><div class="format-icon">1</div><div><div class="format-title">Maçı seç ve canlı yayını başlat</div><div class="format-desc">Takım adlarını gir; skor 0–0, dakika 0 olarak başlar ve yayın paneli aktive olur.</div></div></div>
              <div class="format-row"><div class="format-icon">2</div><div><div class="format-title">Skor, dakika ve olayları güncelle</div><div class="format-desc">Her gol ve olay; momentum grafiği, baskı dalgası ve olasılık motorunu anında etkiler.</div></div></div>
              <div class="format-row"><div class="format-icon">3</div><div><div class="format-title">İzleyiciler görsel yayını takip etsin</div><div class="format-desc">Baskı grafiği, canlı olasılıklar ve maç hikâyesi herkes için otomatik güncellenir.</div></div></div>
              <div class="format-row"><div class="format-icon">4</div><div><div class="format-title">Maç sonunda resmî sonuca işle</div><div class="format-desc">Tek tuşla fikstüre kaydet, puan tablosunu ve bütün merkezleri güncelle.</div></div></div>
            </div>
            ${!canEdit() ? `<div class="info-box live-viewer-box mt-16">İzleyici modundasın. Canlı maç başlatma ve yönetim kontrolleri yalnızca turnuva yöneticisine açıktır.</div>` : ''}
          </section>
        </div>
        ${archive.length ? `<section class="panel mt-24"><div class="panel-header"><div><h3 class="panel-title">Son Canlı Yayınlar</h3><div class="panel-subtitle">Canlı takip üzerinden tamamlanan son maçlar.</div></div></div><div class="live-archive-grid">${archive.map(renderLiveArchiveCard).join('')}</div></section>` : ''}`;
      return;
    }

    const { live, match } = active;
    if (canEdit() && !getMatchArchiveState()[match.id]?.odds?.capturedAt) {
      matchArchiveSnapshot(match, "live-v22-upgrade");
      saveState(false, true);
    }
    const studio = buildLiveStudioData();
    const events = [...(live.events || [])].sort((a, b) => (Number(b.minute) || 0) - (Number(a.minute) || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    view.innerHTML = `
      <div class="group-banner live-match-banner active-live-banner studio-banner">
        <div><div class="eyebrow"><span class="live-pulse-dot"></span> LIVE MATCH STUDIO v21</div><h2>${displayName(match.homeId)} vs ${displayName(match.awayId)}</h2><p>${escapeHTML(liveStageLabel(match))} · Son güncelleme ${escapeHTML(formatLiveUpdatedAt(live.updatedAt))} · ${escapeHTML(studio.importance.note || '')}</p></div>
        <div class="live-progress-orb"><strong>${liveMinuteText(live)}</strong><span>${liveStatusText(live)}</span></div>
      </div>
      ${renderLivePresentationControls()}

      <section class="live-studio-scoreboard">
        <div class="studio-team-card home"><span class="studio-side-tag">EV SAHİBİ</span><strong>${displayName(match.homeId)}</strong><small>${escapeHTML(live.homeTeam || match.homeTeam || 'Takım bekleniyor')}</small>${renderLiveHeatBadge(studio.homeHeat, studio.homeName)}${canEdit() ? `<div class="live-score-controls"><button data-action="live-score-minus" data-side="home">−</button><strong>${live.homeScore}</strong><button data-action="live-goal" data-side="home">+</button></div>` : `<div class="live-view-score">${live.homeScore}</div>`}</div>
        <div class="studio-centre-stage"><div class="studio-live-chip"><span class="live-pulse-dot"></span>${liveStatusText(live)}</div><div class="studio-big-score">${live.homeScore}<span>–</span>${live.awayScore}</div><div class="studio-minute-chip">${liveMinuteText(live)}</div><div class="studio-stage-copy">${escapeHTML(studio.scoreboardLabel)}</div><div class="studio-stage-name">${escapeHTML(liveStageLabel(match))}</div></div>
        <div class="studio-team-card away"><span class="studio-side-tag">DEPLASMAN</span><strong>${displayName(match.awayId)}</strong><small>${escapeHTML(live.awayTeam || match.awayTeam || 'Takım bekleniyor')}</small>${renderLiveHeatBadge(studio.awayHeat, studio.awayName)}${canEdit() ? `<div class="live-score-controls"><button data-action="live-score-minus" data-side="away">−</button><strong>${live.awayScore}</strong><button data-action="live-goal" data-side="away">+</button></div>` : `<div class="live-view-score">${live.awayScore}</div>`}</div>
      </section>

      ${renderLiveStudioMetrics(studio)}

      <div class="grid-2 mt-24 live-studio-primary-grid">
        <section class="panel live-studio-panel live-momentum-panel">${renderLiveStudioMomentumPanel(studio)}</section>
        <section class="panel live-studio-panel live-pressure-panel">${renderLiveStudioPressurePanel(studio)}</section>
      </div>
      <div class="grid-2 mt-24 live-studio-secondary-grid">
        <section class="panel live-studio-panel live-threat-panel">${renderLiveStudioThreatPanel(studio)}</section>
        <section class="panel live-studio-panel live-probability-panel">${renderLiveStudioProbabilityPanel(studio)}</section>
      </div>
      <section class="panel live-studio-panel mt-24 live-story-wide">${renderLiveStudioStoryPanel(studio)}</section>

      ${canEdit() ? `<div class="grid-2 mt-24 live-admin-grid">
        <section class="panel live-control-panel">
          <div class="panel-header"><div><h3 class="panel-title">Canlı Kontrol Masası</h3><div class="panel-subtitle">Dakika, maç durumu, takım ve skor yönetimi.</div></div><span class="badge badge-red">YÖNETİCİ</span></div>
          <div class="live-minute-console">
            <div class="live-minute-display">${liveMinuteText(live)}</div>
            <div class="live-minute-buttons">
              <button class="btn btn-ghost" data-action="live-minute-change" data-delta="-5">−5</button>
              <button class="btn btn-ghost" data-action="live-minute-change" data-delta="-1">−1</button>
              <button class="btn btn-blue" data-action="live-minute-change" data-delta="1">+1</button>
              <button class="btn btn-blue" data-action="live-minute-change" data-delta="5">+5</button>
            </div>
            <div class="live-minute-inputs">
              <label><span>Dakika</span><input type="number" min="0" max="130" value="${Number(live.minute) || 0}" data-live-number="minute"></label>
              <label><span>Uzatma</span><input type="number" min="0" max="20" value="${Number(live.addedTime) || 0}" data-live-number="addedTime"></label>
            </div>
          </div>
          <div class="live-status-controls">
            <button class="btn btn-gold" data-action="live-set-status" data-status="live">Canlı</button>
            <button class="btn btn-ghost" data-action="live-set-status" data-status="paused">Duraklat</button>
            <button class="btn btn-ghost" data-action="live-set-status" data-status="halftime">Devre Arası</button>
            <button class="btn btn-ghost" data-action="live-set-status" data-status="secondhalf">2. Yarı</button>
            <button class="btn btn-ghost" data-action="live-set-status" data-status="extra">Uzatma</button>
            <button class="btn btn-ghost" data-action="live-set-status" data-status="penalties">Penaltılar</button>
          </div>
          <div class="modal-form-grid mt-16">
            <div class="field"><label>${displayName(match.homeId)} Takımı</label><input type="text" value="${escapeHTML(live.homeTeam || '')}" data-live-field="homeTeam" placeholder="Takım adı"></div>
            <div class="field"><label>${displayName(match.awayId)} Takımı</label><input type="text" value="${escapeHTML(live.awayTeam || '')}" data-live-field="awayTeam" placeholder="Takım adı"></div>
          </div>
          <div class="live-admin-actions mt-16">
            <button class="btn btn-blue" data-action="share-live-match">Canlı Skoru Paylaş</button>
            <button class="btn btn-ghost" data-action="open-live-pulse">Canlı Nabzı Aç</button>
            <button class="btn btn-danger" data-action="open-cancel-live">Yayını İptal Et</button>
            <button class="btn btn-gold" data-action="open-finish-live">Maçı Bitir ve Kaydet</button>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Maç Olayı Ekle</h3><div class="panel-subtitle">Gol, kart veya önemli notu dakika bilgisiyle kaydet.</div></div></div>
          <form id="liveEventForm" class="live-event-form">
            <div class="modal-form-grid">
              <div class="field"><label>Olay</label><select name="type"><option value="goal">Gol</option><option value="bigchance">Büyük Şans</option><option value="attack">Tehlikeli Atak</option><option value="yellow">Sarı Kart</option><option value="red">Kırmızı Kart</option><option value="note">Maç Notu</option></select></div>
              <div class="field"><label>Taraf</label><select name="side"><option value="home">${displayName(match.homeId)}</option><option value="away">${displayName(match.awayId)}</option><option value="neutral">Genel</option></select></div>
              <div class="field"><label>Dakika</label><input type="number" name="minute" min="0" max="130" value="${Number(live.minute) || 0}"></div>
              <div class="field"><label>Ek Süre</label><input type="number" name="addedTime" min="0" max="20" value="${Number(live.addedTime) || 0}"></div>
            </div>
            <div class="field mt-16"><label>Açıklama</label><input type="text" name="text" placeholder="Örn. Hızlı hücum / büyük şans / kritik müdahale"></div>
            <div class="live-quick-event-grid mt-16">
              <button type="button" data-action="live-quick-event" data-event-type="attack" data-side="home">${displayName(match.homeId)} · + Atak</button>
              <button type="button" data-action="live-quick-event" data-event-type="attack" data-side="away">${displayName(match.awayId)} · + Atak</button>
              <button type="button" data-action="live-quick-event" data-event-type="bigchance" data-side="home">${displayName(match.homeId)} · Büyük Şans</button>
              <button type="button" data-action="live-quick-event" data-event-type="bigchance" data-side="away">${displayName(match.awayId)} · Büyük Şans</button>
            </div>
            <button class="btn btn-gold btn-wide mt-16" type="submit">Olayı Canlı Yayına Ekle</button>
          </form>
        </section>
      </div>` : `<div class="live-viewer-message mt-24"><span class="live-pulse-dot"></span><div><strong>Canlı yayın aktif</strong><p>Skor, dakika, baskı grafikleri ve maç olayları yönetici tarafından güncellendikçe bu ekran otomatik yenilenir.</p></div><button class="btn btn-ghost" data-action="open-live-pulse">Canlı Nabzı Aç</button></div>`}

      <section class="panel mt-24 live-timeline-panel">
        <div class="panel-header"><div><h3 class="panel-title">Canlı Maç Zaman Çizelgesi</h3><div class="panel-subtitle">En yeni olay üstte gösterilir.</div></div><span class="badge badge-gold">${events.length} OLAY</span></div>
        ${events.length ? `<div class="live-event-timeline">${events.map(event => renderLiveEvent(event, match)).join('')}</div>` : `<div class="info-box">Henüz maç olayı eklenmedi. Skor, dakika ve grafikler canlı olarak takip ediliyor.</div>`}
      </section>`;
    applyLivePresentationMode();
    maybeShowGoalAnnouncement(live, match);
  }

  function renderLiveMatchOption(match) {
    return `<article class="live-match-option">
      <div class="live-option-stage">${escapeHTML(liveStageLabel(match))}</div>
      <div class="live-option-players"><span>${displayName(match.homeId)}</span><strong>VS</strong><span>${displayName(match.awayId)}</span></div>
      <div class="live-option-teams"><span>${escapeHTML(match.homeTeam || "Takım seçilmedi")}</span><span>${escapeHTML(match.awayTeam || "Takım seçilmedi")}</span></div>
      ${canEdit() ? `<button class="btn btn-gold btn-wide" data-action="start-live-match" data-match-id="${match.id}">Canlı Yayını Başlat</button>` : `<span class="badge">YÖNETİCİ BEKLENİYOR</span>`}
    </article>`;
  }

  function renderLiveArchiveCard(item) {
    return `<article class="live-archive-card"><div class="live-option-stage">${escapeHTML(item.stage || "FIFA 9")}</div><div class="live-archive-score"><span>${escapeHTML(item.homeName || "–")}</span><strong>${item.homeScore} – ${item.awayScore}</strong><span>${escapeHTML(item.awayName || "–")}</span></div><div class="live-archive-meta">${escapeHTML(item.homeTeam || "")} · ${escapeHTML(item.awayTeam || "")} · ${escapeHTML(formatLiveUpdatedAt(item.finishedAt))}</div>${item.matchId ? `<button class="btn btn-ghost btn-wide mt-16" data-action="open-match-archive-details" data-match-id="${escapeHTML(item.matchId)}">Canlı Yayın Detayları</button>` : ""}</article>`;
  }

  function renderLiveEvent(event, match) {
    const iconMap = { goal: "⚽", bigchance: "◎", attack: "↗", yellow: "▰", red: "■", note: "◆" };
    const labelMap = { goal: "GOL", bigchance: "BÜYÜK ŞANS", attack: "TEHLİKELİ ATAK", yellow: "SARI KART", red: "KIRMIZI KART", note: "MAÇ NOTU" };
    const sideName = event.side === "home" ? playerName(match.homeId) : event.side === "away" ? playerName(match.awayId) : "Maç Merkezi";
    const minute = `${Number(event.minute) || 0}${Number(event.addedTime) ? `+${Number(event.addedTime)}` : ""}'`;
    return `<div class="live-event-row type-${escapeHTML(event.type)}"><div class="live-event-minute">${minute}</div><div class="live-event-icon">${iconMap[event.type] || "◆"}</div><div class="live-event-copy"><strong>${labelMap[event.type] || "OLAY"} · ${escapeHTML(sideName)}</strong><span>${escapeHTML(event.text || (event.type === "goal" ? "Skor güncellendi" : "Canlı maç olayı"))}</span></div>${canEdit() ? `<button class="live-event-delete" data-action="delete-live-event" data-event-id="${event.id}" title="Olayı sil">×</button>` : ""}</div>`;
  }

  function formatLiveUpdatedAt(value) {
    if (!value) return "henüz";
    try { return new Date(value).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }); } catch { return "henüz"; }
  }

  function startLiveMatch(matchId) {
    if (!canEdit()) return;
    const liveState = getLiveState();
    if (liveState.active) { toast("Önce aktif canlı maçı bitir veya iptal et.", "error"); return; }
    const match = findMatch(matchId);
    if (!match || matchComplete(match)) { toast("Bu maç canlı yayına uygun değil.", "error"); return; }
    matchArchiveSnapshot(match, "live-start");
    Promise.resolve(window.FIFA_V22?.lockPoll?.(match.id)).catch(error => console.warn("Poll lock failed", error));
    liveState.active = {
      matchId,
      status: "live",
      minute: 0,
      addedTime: 0,
      homeScore: 0,
      awayScore: 0,
      homeTeam: match.homeTeam || "",
      awayTeam: match.awayTeam || "",
      events: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveState(true, true);
    render();
    toast("Canlı maç yayını başlatıldı.", "success");
  }

  function touchLive() {
    const active = getLiveState().active;
    if (!active) return;
    active.updatedAt = new Date().toISOString();
    saveState(false, true);
  }

  function addLiveGoal(side) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active || !["home", "away"].includes(side)) return;
    const scoreKey = side === "home" ? "homeScore" : "awayScore";
    active[scoreKey] = Math.max(0, Number(active[scoreKey]) || 0) + 1;
    active.events = Array.isArray(active.events) ? active.events : [];
    active.events.push({ id: `live-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type: "goal", side, minute: Number(active.minute) || 0, addedTime: Number(active.addedTime) || 0, text: "Gol", createdAt: new Date().toISOString() });
    touchLive();
    render();
  }

  function reduceLiveScore(side) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active || !["home", "away"].includes(side)) return;
    const scoreKey = side === "home" ? "homeScore" : "awayScore";
    if ((Number(active[scoreKey]) || 0) <= 0) return;
    active[scoreKey] = Math.max(0, Number(active[scoreKey]) - 1);
    const events = Array.isArray(active.events) ? active.events : [];
    const lastGoalIndex = [...events].map((event, index) => ({ event, index })).reverse().find(item => item.event.type === "goal" && item.event.side === side)?.index;
    if (Number.isInteger(lastGoalIndex)) events.splice(lastGoalIndex, 1);
    touchLive();
    render();
  }

  function changeLiveMinute(delta) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active) return;
    active.minute = Math.min(130, Math.max(0, (Number(active.minute) || 0) + Number(delta || 0)));
    active.addedTime = 0;
    touchLive();
    render();
  }

  function setLiveStatus(status) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active) return;
    active.status = status;
    if (status === "halftime") active.minute = Math.max(45, Number(active.minute) || 0);
    if (status === "secondhalf") active.minute = Math.max(46, Number(active.minute) || 0);
    if (status === "extra") active.minute = Math.max(91, Number(active.minute) || 0);
    touchLive();
    render();
  }

  function addLiveEvent(form) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active) return;
    const data = new FormData(form);
    const type = String(data.get("type") || "note");
    const side = String(data.get("side") || "neutral");
    const minute = Math.max(0, Number(data.get("minute")) || 0);
    const addedTime = Math.max(0, Number(data.get("addedTime")) || 0);
    const text = String(data.get("text") || "").trim();
    if (type === "goal" && ["home", "away"].includes(side)) {
      const scoreKey = side === "home" ? "homeScore" : "awayScore";
      active[scoreKey] = Math.max(0, Number(active[scoreKey]) || 0) + 1;
    }
    active.minute = minute;
    active.addedTime = addedTime;
    active.events = Array.isArray(active.events) ? active.events : [];
    const defaultText = type === "goal" ? "Gol" : type === "bigchance" ? "Büyük gol fırsatı" : type === "attack" ? "Tehlikeli atak" : "Canlı maç olayı";
    active.events.push({ id: `live-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type, side, minute, addedTime, text: text || defaultText, createdAt: new Date().toISOString() });
    touchLive();
    render();
    toast("Maç olayı canlı yayına eklendi.", "success");
  }

  function addLiveQuickEvent(type, side) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active || !["home", "away"].includes(side) || !["attack", "bigchance"].includes(type)) return;
    active.events = Array.isArray(active.events) ? active.events : [];
    const text = type === "bigchance" ? "Büyük gol fırsatı" : "Tehlikeli atak";
    active.events.push({ id: `live-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, type, side, minute: Number(active.minute) || 0, addedTime: Number(active.addedTime) || 0, text, createdAt: new Date().toISOString() });
    touchLive();
    render();
    toast(type === "bigchance" ? "Büyük şans canlı modele eklendi." : "Tehlikeli atak canlı modele eklendi.", "success");
  }

  function deleteLiveEvent(eventId) {
    if (!canEdit()) return;
    const active = getLiveState().active;
    if (!active) return;
    const events = Array.isArray(active.events) ? active.events : [];
    const index = events.findIndex(event => event.id === eventId);
    if (index < 0) return;
    const [removed] = events.splice(index, 1);
    if (removed.type === "goal" && ["home", "away"].includes(removed.side)) {
      const scoreKey = removed.side === "home" ? "homeScore" : "awayScore";
      active[scoreKey] = Math.max(0, Number(active[scoreKey]) - 1);
    }
    touchLive();
    render();
  }

  function openFinishLiveMatch() {
    if (!canEdit()) return;
    const activePair = getActiveLive();
    if (!activePair) return;
    const { live, match } = activePair;
    openModal("Canlı Maçı Bitir", `<form id="finishLiveMatchForm">
      <div class="live-finish-score"><span>${displayName(match.homeId)}</span><strong>${live.homeScore} – ${live.awayScore}</strong><span>${displayName(match.awayId)}</span></div>
      <div class="info-box mt-16">Canlı skor fikstüre resmî maç sonucu olarak işlenecek. Bu işlem puan tablolarını ve tüm istatistikleri otomatik günceller.</div>
      ${!match.allowDraw && Number(live.homeScore) === Number(live.awayScore) ? `<div class="field mt-16"><label>Uzatma / Penaltı Galibi</label><select name="tiebreakWinnerId" required><option value="">Kazananı seç</option><option value="${match.homeId}">${displayName(match.homeId)}</option><option value="${match.awayId}">${displayName(match.awayId)}</option></select></div>` : ""}
      <div class="field mt-16"><label>Maç Sonu Notu</label><input type="text" name="note" value="Canlı Maç Merkezi üzerinden tamamlandı" placeholder="Opsiyonel not"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button type="submit" class="btn btn-gold">Skoru Kaydet ve Yayını Bitir</button></div>
    </form>`, "FULL TIME");
  }

  function finishLiveMatch(form) {
    if (!canEdit()) return;
    const activePair = getActiveLive();
    if (!activePair) return;
    const { live, match } = activePair;
    const data = new FormData(form);
    const tieWinner = String(data.get("tiebreakWinnerId") || "") || null;
    if (!match.allowDraw && Number(live.homeScore) === Number(live.awayScore) && ![match.homeId, match.awayId].includes(tieWinner)) {
      toast("Eleme maçında kazanan oyuncuyu seç.", "error"); return;
    }
    match.homeScore = Number(live.homeScore) || 0;
    match.awayScore = Number(live.awayScore) || 0;
    match.homeTeam = String(live.homeTeam || "").trim();
    match.awayTeam = String(live.awayTeam || "").trim();
    match.tiebreakWinnerId = match.homeScore === match.awayScore ? tieWinner : null;
    match.note = String(data.get("note") || "").trim();
    match.updatedAt = new Date().toISOString();
    const liveState = getLiveState();
    liveState.archive[match.id] = {
      ...live,
      status: "fulltime",
      homeName: playerName(match.homeId),
      awayName: playerName(match.awayId),
      stage: liveStageLabel(match),
      finishedAt: new Date().toISOString()
    };
    finalizeMatchArchive(match, live);
    liveState.active = null;
    livePresentationMode = "standard";
    sessionStorage.removeItem("fifa9-live-presentation-mode");
    applyLivePresentationMode();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    const warning = reconcileAfterStageEdit(match.phase);
    refreshKnockout();
    closeModal();
    saveState(true, true);
    render();
    toast(warning || "Canlı maç tamamlandı ve fikstüre işlendi.", warning ? "" : "success");
  }

  function openCancelLiveMatch() {
    if (!canEdit()) return;
    openModal("Canlı Yayını İptal Et", `<div class="info-box warning-box">Canlı skor ve zaman çizelgesi silinecek; fikstürde resmî sonuç oluşmayacak.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-danger" data-action="cancel-live-match">Yayını İptal Et</button></div>`, "LIVE CONTROL");
  }

  function cancelLiveMatch() {
    if (!canEdit()) return;
    const cancelledMatchId = getLiveState().active?.matchId || "";
    getLiveState().active = null;
    if (cancelledMatchId) Promise.resolve(window.FIFA_V22?.unlockPoll?.(cancelledMatchId)).catch(error => console.warn("Poll unlock failed", error));
    livePresentationMode = "standard";
    sessionStorage.removeItem("fifa9-live-presentation-mode");
    applyLivePresentationMode();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    closeModal();
    saveState(true, true);
    render();
    toast("Canlı yayın iptal edildi.");
  }

  async function shareLiveMatch() {
    const activePair = getActiveLive();
    if (!activePair) return;
    const { live, match } = activePair;
    const text = `🔴 FIFA 9 CANLI\n${playerName(match.homeId)} ${live.homeScore}-${live.awayScore} ${playerName(match.awayId)}\n⏱ ${liveMinuteText(live)} · ${liveStatusText(live)}\n${live.homeTeam || ""} vs ${live.awayTeam || ""}\n${window.location.href}`;
    if (navigator.share) {
      try { await navigator.share({ title: "FIFA 9 Canlı Maç", text, url: window.location.href }); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function renderSetup() {
    const generated = state.current.league.generated;
    view.innerHTML = `
      <div class="setup-grid">
        <section class="panel">
          <div class="panel-header">
            <div><h2 class="panel-title">16 Oyuncu Kadrosu</h2><div class="panel-subtitle">İsimler tamamlandığında sistem altı turluk, tekrarsız League Phase fikstürünü üretir.</div></div>
            <span class="badge ${allPlayersReady() ? "badge-green" : "badge-gold"}">${filledParticipants().length} / 16 oyuncu</span>
          </div>
          <div class="player-input-grid">
            ${state.current.participants.map((p, index) => `<div class="input-row"><div class="slot-number">${String(index + 1).padStart(2, "0")}</div><input type="text" data-player-input="${p.id}" value="${escapeHTML(p.name)}" placeholder="Oyuncu ${index + 1}" ${canEdit() ? "" : "disabled"}></div>`).join("")}
          </div>
          ${canEdit() ? `<div class="panel-actions mt-24">
            <button class="btn btn-ghost" data-action="open-name-import">İsimleri Toplu Yapıştır</button>
            <button class="btn btn-gold" data-action="generate-draw" ${generated ? "disabled" : ""}>Kura Çek & 6 Turluk Fikstürü Oluştur</button>
          </div>` : `<div class="info-box live-viewer-box mt-24">Canlı izleyici modundasın. Oyuncu ve kura yönetimi yalnızca turnuva yöneticisine açıktır.</div>`}
          ${generated ? `<div class="info-box warning-box mt-16">Fikstür oluşturuldu. ${canEdit() ? "İsimleri değiştirebilirsin; ancak oyuncu sıraları ve maç kimlikleri korunur. Tamamen yeni bir kura için “FIFA 9 Verisini Sıfırla” işlemini kullan." : "Kura ve oyuncu listesi canlı olarak yayımlanıyor."}</div>` : ""}
        </section>

        <aside class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Nihai Format</h3><div class="panel-subtitle">FIFA 9 · League Phase sistemi</div></div></div>
          <div class="format-list">
            <div class="format-row"><div class="format-icon">1</div><div><div class="format-title">League Phase</div><div class="format-desc">16 oyuncu, tek tablo, oyuncu başına 6 maç; toplam 48 maç.</div></div></div>
            <div class="format-row"><div class="format-icon">2</div><div><div class="format-title">Altın / Gümüş</div><div class="format-desc">İlk 6 Altın, sonraki 6 Gümüş; son 4 elenir. Puanlar taşınır.</div></div></div>
            <div class="format-row"><div class="format-icon">3</div><div><div class="format-title">İkinci Lig Aşaması</div><div class="format-desc">Her grupta 6 oyuncu ve kişi başı 5 maç; toplam 30 maç.</div></div></div>
            <div class="format-row"><div class="format-icon">4</div><div><div class="format-title">Eleme Serileri</div><div class="format-desc">Altın 1 doğrudan yarı final; diğer eşleşmeler üç maçta iki galibiyet.</div></div></div>
            <div class="format-row"><div class="format-icon">5</div><div><div class="format-title">Büyük Final</div><div class="format-desc">Tek maç; eşitlikte uzatma ve penaltılar.</div></div></div>
          </div>
          <div class="info-box mt-16">Puan eşitliğinde sırasıyla genel averaj, atılan gol, galibiyet sayısı ve alfabetik sıra uygulanır.</div>
        </aside>
      </div>

      ${generated ? `<h3 class="section-title">Oluşturulan Kura</h3><section class="panel"><div class="panel-header"><div><h3 class="panel-title">League Phase Fikstürü</h3><div class="panel-subtitle">Her oyuncu altı farklı rakiple karşılaşır.</div></div><button class="btn btn-blue btn-small" data-nav="league">Sonuç Girişine Git</button></div>${scheduleGrid(state.current.league.rounds, false)}</section>` : ""}`;
  }

  function renderLeague() {
    if (!state.current.league.generated) {
      view.innerHTML = emptyState("▦", "League Phase henüz oluşturulmadı", "Önce 16 oyuncuyu kaydet ve kura çek. Sistem her oyuncuya altı farklı rakip atayacak.", `<button class="btn btn-gold" data-nav="setup">Kura & Oyuncular</button>`);
      return;
    }
    const table = leagueStandings();
    const completed = leagueMatches().filter(matchComplete).length;
    view.innerHTML = `
      <div class="group-banner gold">
        <div><div class="eyebrow">ROUND 1</div><h2>League Phase</h2><p>16 oyuncu · 6 tur · tek puan tablosu · ilk 12 bir sonraki aşamaya yükselir.</p></div>
        <div class="group-emblem">◉</div>
      </div>
      <div class="kpi-grid">
        ${kpiCard("Tamamlanan Maç", `${completed} / 48`, "Sonuç girilen League Phase maçı", Math.round(completed/48*100))}
        ${kpiCard("Altın Bölgesi", "1–6", "Doğrudan Altın Gruba yükselir")}
        ${kpiCard("Gümüş Bölgesi", "7–12", "Gümüş Gruba yükselir")}
        ${kpiCard("Elenecek Bölge", "13–16", "League Phase sonunda turnuvaya veda")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Canlı Puan Durumu</h3><div class="panel-subtitle">Puan · averaj · atılan gol · galibiyet sıralaması.</div></div>${leagueFinished() && !state.current.phase2.generated && canEdit() ? `<button class="btn btn-gold" data-action="generate-phase2">Altın & Gümüş Grupları Oluştur</button>` : ""}</div>
          ${standingsTable(table, "league")}
          ${leagueFinished() && !state.current.phase2.generated ? `<div class="info-box success-box mt-16">48 maç tamamlandı. İlk 6 Altın Gruba, 7–12 Gümüş Gruba taşınmaya hazır.</div>` : ""}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Maç Merkezi</h3><div class="panel-subtitle">Bir maça tıklayarak skor ve takım bilgilerini gir.</div></div><span class="badge badge-gold">6 TUR</span></div>
          ${scheduleGrid(state.current.league.rounds, true)}
        </section>
      </div>`;
  }

  function renderGroup(group) {
    const isGold = group === "gold";
    if (!state.current.phase2.generated) {
      view.innerHTML = emptyState(isGold ? "●" : "○", `${isGold ? "Altın" : "Gümüş"} Grup henüz oluşmadı`, "League Phase’in 48 maçı tamamlandıktan sonra ilk 12 oyuncu iki gruba ayrılır.", `<button class="btn btn-gold" data-nav="league">League Phase'e Git</button>`);
      return;
    }
    const ids = isGold ? state.current.phase2.goldIds : state.current.phase2.silverIds;
    const rounds = isGold ? state.current.phase2.goldRounds : state.current.phase2.silverRounds;
    const matches = isGold ? goldMatches() : silverMatches();
    const table = phase2Standings(group);
    const completed = matches.filter(matchComplete).length;
    const otherComplete = isGold ? silverMatches().every(matchComplete) : goldMatches().every(matchComplete);
    view.innerHTML = `
      <div class="group-banner ${isGold ? "gold" : "silver"}">
        <div><div class="eyebrow">ROUND 2</div><h2>${isGold ? "Altın Grup" : "Gümüş Grup"}</h2><p>League Phase puanları ve averajları taşındı. Her oyuncu bu aşamada 5 ek maç yapar.</p></div>
        <div class="group-emblem">${isGold ? "★" : "✦"}</div>
      </div>
      <div class="kpi-grid">
        ${kpiCard("Grup Oyuncusu", "6", `${isGold ? "League Phase 1–6" : "League Phase 7–12"}`)}
        ${kpiCard("Grup Maçı", `${completed} / 15`, "Tamamlanan ikinci aşama maçı", Math.round(completed/15*100))}
        ${kpiCard("Kişi Başı Ek Maç", "5", "Puanlara ve averaja eklenir")}
        ${kpiCard(isGold ? "Doğrudan Yarı Final" : "Eleme Kontenjanı", isGold ? "1." : "1–3", isGold ? "Altın Grup lideri" : "İlk üç oyuncu")}
      </div>
      <div class="grid-2">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Kümülatif Puan Durumu</h3><div class="panel-subtitle">League Phase + ${isGold ? "Altın" : "Gümüş"} Grup sonuçları birlikte hesaplanır.</div></div>${phase2Finished() && !state.current.knockout.generated && canEdit() ? `<button class="btn btn-gold" data-action="generate-knockout">Eleme Eşleşmelerini Oluştur</button>` : ""}</div>
          ${standingsTable(table, group)}
          ${matches.every(matchComplete) && !otherComplete ? `<div class="info-box mt-16">Bu grup tamamlandı. Diğer grubun kalan maçları bekleniyor.</div>` : ""}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">${isGold ? "Altın" : "Gümüş"} Grup Fikstürü</h3><div class="panel-subtitle">Beş turluk tek lig usulü.</div></div><span class="badge ${isGold ? "badge-gold" : "badge-silver"}">5 TUR</span></div>
          ${scheduleGrid(rounds, true)}
        </section>
      </div>`;
  }

  function renderKnockout() {
    const ko = state.current.knockout;
    if (!ko.generated) {
      view.innerHTML = emptyState("⌁", "Eleme aşaması henüz oluşmadı", "Altın ve Gümüş gruplarındaki 30 maç tamamlandığında sıralamalara göre eşleşmeler otomatik üretilecek.", `<button class="btn btn-gold" data-nav="gold">Altın Gruba Git</button>`);
      return;
    }
    refreshKnockout();
    view.innerHTML = `
      <div class="group-banner gold">
        <div><div class="eyebrow">ROAD TO GLORY</div><h2>Eleme Aşaması</h2><p>Çeyrek final ve yarı final: üç maçta iki galibiyet. Büyük final: tek maç.</p></div>
        <div class="group-emblem">🏆</div>
      </div>
      <section class="panel">
        <div class="panel-header"><div><h3 class="panel-title">Şampiyonluk Yolu</h3><div class="panel-subtitle">Seri maçlarına sırayla tıkla; iki galibiyet alan oyuncu otomatik olarak sonraki tura taşınır.</div></div>${ko.championId ? `<span class="badge badge-green">ŞAMPİYON: ${displayName(ko.championId)}</span>` : `<span class="badge badge-gold">ELEME DEVAM EDİYOR</span>`}</div>
        <div class="bracket-scroll"><div class="bracket">
          <div class="bracket-column">
            ${seriesCard(ko.qf1, "Çeyrek Final 1")}
            ${seriesCard(ko.qf2, "Çeyrek Final 2")}
            ${seriesCard(ko.qf3, "Çeyrek Final 3")}
          </div>
          <div class="bracket-column">
            ${seriesCard(ko.sf1, "Yarı Final 1", !ko.sf1)}
            ${seriesCard(ko.sf2, "Yarı Final 2", !ko.sf2)}
          </div>
          <div class="bracket-column">
            ${finalCard(ko.final, ko.championId)}
          </div>
        </div></div>
      </section>
      <div class="grid-even mt-16">
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Seri Kuralları</h3><div class="panel-subtitle">Uygulanan eleme mantığı.</div></div></div><div class="format-list">
          <div class="format-row"><div class="format-icon">QF</div><div><div class="format-title">Altın 2 – Gümüş 3</div><div class="format-desc">Kazanan Yarı Final 2’ye yükselir.</div></div></div>
          <div class="format-row"><div class="format-icon">QF</div><div><div class="format-title">Altın 3 – Gümüş 2</div><div class="format-desc">Kazanan, Altın Grup lideriyle Yarı Final 1’de oynar.</div></div></div>
          <div class="format-row"><div class="format-icon">QF</div><div><div class="format-title">Altın 4 – Gümüş 1</div><div class="format-desc">Kazanan Yarı Final 2’ye yükselir.</div></div></div>
        </div></section>
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Altın Grup Avantajı</h3><div class="panel-subtitle">Lig liderliğinin ödülü.</div></div></div><div class="info-box success-box"><strong>${displayName(ko.seeds?.gold1)}</strong>, Altın Grubu birinci bitirdiği için doğrudan yarı finale yükseldi ve Çeyrek Final 2 galibini bekliyor.</div></section>
      </div>`;
  }

  function renderPrintCenter() {
    const leagueReady = state.current.league.generated && leagueMatches().length === 48;
    const goldReady = state.current.phase2.generated && goldMatches().length === 15;
    const silverReady = state.current.phase2.generated && silverMatches().length === 15;
    const knockoutReady = state.current.knockout.generated;
    const availableSections = [leagueReady, goldReady, silverReady, knockoutReady].filter(Boolean).length;
    const currentUrl = location.protocol.startsWith("http") ? location.href : "Yerel önizleme";

    view.innerHTML = `
      <div class="group-banner gold">
        <div><div class="eyebrow">PRINT CONTROL</div><h2>Çıktı Merkezi</h2><p>Kura ve fikstür verilerini otomatik olarak baskıya hazır maç föylerine dönüştür. Oyun masasına asılacak A3 panodan tur bazlı skor kâğıtlarına kadar bütün dokümanlar mevcut canlı veriden üretilir.</p></div>
        <div class="group-emblem">▤</div>
      </div>
      <div class="kpi-grid">
        ${kpiCard("League Phase", leagueReady ? "48 Maç" : "Bekliyor", leagueReady ? "6 tur · oyuncu başına 6 maç" : "Önce kura çekilmelidir")}
        ${kpiCard("İkinci Aşama", goldReady && silverReady ? "30 Maç" : "Bekliyor", goldReady && silverReady ? "Altın + Gümüş grupları" : "League Phase tamamlanmalıdır")}
        ${kpiCard("Eleme Serileri", knockoutReady ? "Hazır" : "Bekliyor", knockoutReady ? "Çeyrek final, yarı final ve final" : "İkinci aşama tamamlanmalıdır")}
        ${kpiCard("Hazır Paket", `${availableSections}/4`, "Baskıya hazır turnuva bölümü")}
      </div>

      <div class="info-box mt-24">Çıktılar yeni bir sekmede açılır. Tarayıcı yazdırma ekranından <strong>Yazdır</strong> veya <strong>PDF olarak kaydet</strong> seçebilirsin. A3 pano için kâğıt boyutunu A3 ve yönü yatay seç.</div>

      <h3 class="section-title">League Phase Çıktıları</h3>
      <div class="print-card-grid">
        ${printCenterCard("A3", "Oyun Masası Duvar Panosu", "16 oyuncu, altı tur ve 48 maçın tamamını tek, geniş turnuva panosunda gösterir.", "print-a3-board", leagueReady, "A3 · Yatay")}
        ${printCenterCard("48", "League Phase Ana Skor Föyü", "Bütün maçları; oynandı, siteye girildi ve doğrulandı kutularıyla kompakt kontrol tablosunda toplar.", "print-league-master", leagueReady, "A4 · Yatay")}
        ${printCenterCard("R6", "Tur Bazlı Maç Föyleri", "Her tur için ayrı sayfa. Büyük skor kutuları, takım alanları, tarih ve sonucu yazan kişi bölümü içerir.", "print-round-sheets", leagueReady, "6 Sayfa · A4")}
        ${printCenterCard("PTS", "Manuel Puan Tablosu", "Oyuncu isimleri önceden yazılı, elle güncellenebilir O-G-B-M-AG-YG-AV-P çalışma tablosu.", "print-standings-sheet", leagueReady, "A4 · Dikey")}
      </div>

      <h3 class="section-title">İkinci Aşama ve Eleme Çıktıları</h3>
      <div class="print-card-grid">
        ${printCenterCard("G", "Altın Grup Maç Paketi", "Beş turun 15 maçı, skor alanları ve kümülatif puan tablosu tek sayfada.", "print-gold-pack", goldReady, "Tek Sayfa · A4 Yatay")}
        ${printCenterCard("S", "Gümüş Grup Maç Paketi", "Beş turun 15 maçı, skor alanları ve kümülatif puan tablosu tek sayfada.", "print-silver-pack", silverReady, "Tek Sayfa · A4 Yatay")}
        ${printCenterCard("KO", "Eleme Serileri Panosu", "Üç çeyrek final serisi, iki yarı final ve tek maçlık final için skor kayıt alanları.", "print-knockout-board", knockoutReady, "A3 · Yatay")}
        ${printCenterCard("ALL", "Mevcut Tam Turnuva Paketi", "Şu anda oluşturulmuş bütün aşamaları tek baskı dokümanında birleştirir.", "print-full-pack", leagueReady, "Çok Sayfalı PDF")}
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Fiziksel Skor Kontrol Sistemi</h3><div class="panel-subtitle">Sen gemide veya oyun alanında olmadığında kullanılacak standart.</div></div></div>
          <div class="format-list">
            <div class="format-row"><div class="format-icon">1</div><div><div class="format-title">Maç oynandıktan sonra skor yazılır</div><div class="format-desc">Her iki oyuncu skoru kontrol eder; beraberlik veya penaltı bilgisi not alanına eklenir.</div></div></div>
            <div class="format-row"><div class="format-icon">2</div><div><div class="format-title">“Oynandı” kutusu işaretlenir</div><div class="format-desc">Maçın fiziksel kaydı tamamlanır ve sonuç kâğıdı oyun masasında bırakılır.</div></div></div>
            <div class="format-row"><div class="format-icon">3</div><div><div class="format-title">Sonuç website'e girilir</div><div class="format-desc">Yönetici sonucu sisteme kaydettikten sonra “Site” kutusunu işaretler.</div></div></div>
            <div class="format-row"><div class="format-icon">4</div><div><div class="format-title">Doğrulama tamamlanır</div><div class="format-desc">Fiziksel kâğıt ile canlı site aynıysa “Doğrulandı” kutusu işaretlenir.</div></div></div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Canlı Bağlantı</h3><div class="panel-subtitle">Baskı başlığında yer alacak web adresi.</div></div></div>
          <div class="print-url-box">${escapeHTML(currentUrl)}</div>
          <div class="info-box mt-16">Kâğıdın üst kısmında turnuva adı, baskı tarihi, edisyon, canlı site adresi ve sonuç sorumlusu alanı otomatik yer alır.</div>
        </section>
      </div>`;
  }

  function printCenterCard(icon, title, description, action, ready, format) {
    return `<article class="print-action-card ${ready ? "ready" : "locked"}">
      <div class="print-action-icon">${escapeHTML(icon)}</div>
      <div class="print-action-body">
        <div class="print-action-format">${escapeHTML(format)}</div>
        <h3>${escapeHTML(title)}</h3>
        <p>${escapeHTML(description)}</p>
      </div>
      <button class="btn ${ready ? "btn-gold" : "btn-ghost"} btn-wide" data-action="${action}" ${ready ? "" : "disabled"}>${ready ? "Çıktıyı Aç" : "Aşama Bekleniyor"}</button>
    </article>`;
  }

  function printLanguage() {
    return document.documentElement.dataset.language === "en" ? "en" : "tr";
  }

  function printLabel(tr, en) {
    return printLanguage() === "en" ? en : tr;
  }

  function printTournamentTitle() {
    return printLanguage() === "en" ? "FIFA 9 TOURNAMENT HUB" : "FIFA 9 TURNUVA MERKEZİ";
  }

  function printDateLabel() {
    return new Date().toLocaleString(printLanguage() === "en" ? "en-GB" : "tr-TR", { dateStyle: "medium", timeStyle: "short" });
  }

  function printMatchScore(match) {
    if (!matchComplete(match)) return "";
    return `${match.homeScore} - ${match.awayScore}${match.tiebreakWinnerId ? " (P)" : ""}`;
  }

  function printableMatchRows(rounds, startIndex = 1, options = {}) {
    let counter = startIndex;
    return (rounds || []).map(round => {
      const rows = (round.matches || []).map(match => {
        const index = counter++;
        return `<tr>
          <td class="print-index">${index}</td>
          <td>${round.number}</td>
          <td class="print-player">${displayName(match.homeId)}</td>
          <td class="print-team-cell">${escapeHTML(match.homeTeam || "")}</td>
          <td class="print-score-cell">${escapeHTML(printMatchScore(match))}</td>
          <td class="print-team-cell">${escapeHTML(match.awayTeam || "")}</td>
          <td class="print-player">${displayName(match.awayId)}</td>
          ${options.checks === false ? "" : `<td class="check-cell">□</td><td class="check-cell">□</td><td class="check-cell">□</td>`}
          <td class="notes-cell">${escapeHTML(match.note || "")}</td>
        </tr>`;
      }).join("");
      return { number: round.number, rows, nextIndex: counter };
    });
  }

  function printTableHeader(includeChecks = true) {
    return `<thead><tr>
      <th>#</th><th>${printLabel("Tur", "Round")}</th><th>${printLabel("Oyuncu", "Player")}</th><th>${printLabel("Takım", "Team")}</th><th>${printLabel("Skor", "Score")}</th><th>${printLabel("Takım", "Team")}</th><th>${printLabel("Oyuncu", "Player")}</th>
      ${includeChecks ? `<th>${printLabel("Oynandı", "Played")}</th><th>${printLabel("Site", "Site")}</th><th>${printLabel("Doğrulandı", "Verified")}</th>` : ""}
      <th>${printLabel("Not", "Notes")}</th>
    </tr></thead>`;
  }

  function printDocumentHeader(title, subtitle = "") {
    const siteUrl = location.protocol.startsWith("http") ? location.href : "";
    return `<header class="doc-header">
      <div class="doc-brand"><div class="doc-mark">F9</div><div><div class="doc-brand-title">${printTournamentTitle()}</div><div class="doc-brand-sub">LEAGUE PHASE · EDITION 09</div></div></div>
      <div class="doc-heading"><h1>${escapeHTML(title)}</h1>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}</div>
      <div class="doc-meta"><div><strong>${printLabel("Baskı", "Printed")}</strong><span>${escapeHTML(printDateLabel())}</span></div><div><strong>${printLabel("Canlı Site", "Live Site")}</strong><span>${escapeHTML(siteUrl || "-")}</span></div></div>
    </header>`;
  }

  function printControlFooter() {
    return `<div class="control-footer"><div>${printLabel("Sonuçları yazan", "Recorded by")}: __________________________</div><div>${printLabel("Tarih / Saat", "Date / Time")}: __________________________</div><div>${printLabel("Kontrol eden", "Verified by")}: __________________________</div></div>`;
  }

  function printRoundSection(round, phaseLabel, globalStart = 1) {
    const rows = printableMatchRows([round], globalStart)[0];
    return `<section class="print-page round-page">
      ${printDocumentHeader(`${phaseLabel} · ${printLabel("Tur", "Round")} ${round.number}`, printLabel("Maç sonuçlarını okunaklı şekilde yazın ve her iki oyuncuya doğrulatın.", "Write match results clearly and have both players verify them."))}
      <table class="print-table roomy">${printTableHeader()}<tbody>${rows.rows}</tbody></table>
      ${printControlFooter()}
    </section>`;
  }

  function printStandingsSection(title, ids, rows = null) {
    const order = rows?.length ? rows : ids.map(id => blankStat(id));
    return `<section class="print-page portrait-page">
      ${printDocumentHeader(title, printLabel("Manuel yedek puan tablosu", "Manual backup standings worksheet"))}
      <table class="print-table standings-print"><thead><tr><th>#</th><th>${printLabel("Oyuncu", "Player")}</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>${printLabel("İmza / Kontrol", "Signature / Check")}</th></tr></thead><tbody>
        ${order.map((row, index) => `<tr><td>${index + 1}</td><td class="print-player">${displayName(row.id)}</td><td>${row.mp || ""}</td><td>${row.w || ""}</td><td>${row.d || ""}</td><td>${row.l || ""}</td><td>${row.gf || ""}</td><td>${row.ga || ""}</td><td>${row.gd ? formatGD(row.gd) : ""}</td><td>${row.pts || ""}</td><td></td></tr>`).join("")}
      </tbody></table>
      <div class="standings-note">${printLabel("Sıralama kriterleri: Puan · Genel averaj · Atılan gol · Galibiyet sayısı · Alfabetik sıra", "Ranking criteria: Points · Goal difference · Goals scored · Wins · Alphabetical order")}</div>
      ${printControlFooter()}
    </section>`;
  }

  function buildLeagueMasterSection() {
    const roundRows = printableMatchRows(state.current.league.rounds);
    return `<section class="print-page landscape-page">
      ${printDocumentHeader(printLabel("League Phase Ana Skor Föyü", "League Phase Master Score Sheet"), printLabel("48 maç · 6 tur · fiziksel ve dijital sonuç kontrolü", "48 matches · 6 rounds · physical and digital result control"))}
      <table class="print-table compact">${printTableHeader()}<tbody>${roundRows.map(group => group.rows).join("")}</tbody></table>
      ${printControlFooter()}
    </section>`;
  }

  function buildA3BoardSection() {
    const rounds = state.current.league.rounds || [];
    const participants = state.current.participants.filter(p => p.name.trim());
    return `<section class="print-page a3-page">
      ${printDocumentHeader(printLabel("League Phase Oyun Masası Panosu", "League Phase Match Table Board"), printLabel("Skorları yazın · Oynandı / Site / Doğrulandı kontrolünü tamamlayın", "Record scores · Complete Played / Site / Verified checks"))}
      <div class="a3-layout">
        <div class="a3-roster"><h3>${printLabel("16 Oyuncu", "16 Players")}</h3>${participants.map((player, index) => `<div class="roster-line"><span>${index + 1}</span><strong>${escapeHTML(player.name)}</strong></div>`).join("")}</div>
        <div class="a3-rounds">${rounds.map((round, roundIndex) => `<div class="a3-round"><h3>${printLabel("Tur", "Round")} ${round.number}</h3>${round.matches.map((match, matchIndex) => `<div class="a3-match"><span class="a3-no">${roundIndex * 8 + matchIndex + 1}</span><span class="a3-player">${displayName(match.homeId)}</span><span class="a3-score">${escapeHTML(printMatchScore(match)) || "____ - ____"}</span><span class="a3-player right">${displayName(match.awayId)}</span><span class="a3-checks">□ O &nbsp; □ S &nbsp; □ V</span></div>`).join("")}</div>`).join("")}</div>
      </div>
      ${printControlFooter()}
    </section>`;
  }


  function groupOnePageScore(match) {
    if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) {
      return `<span class="group-score-box"></span><i>–</i><span class="group-score-box"></span>`;
    }
    return `<span class="group-score-box filled">${match.homeScore}</span><i>–</i><span class="group-score-box filled">${match.awayScore}</span>`;
  }

  function groupOnePageMatchRow(match, matchNumber) {
    return `<div class="group-one-match">
      <span class="group-match-no">${matchNumber}</span>
      <div class="group-match-side home"><strong>${displayName(match.homeId)}</strong><small>${escapeHTML(match.homeTeam || printLabel("Takım", "Team"))}</small></div>
      <div class="group-one-score">${groupOnePageScore(match)}</div>
      <div class="group-match-side away"><strong>${displayName(match.awayId)}</strong><small>${escapeHTML(match.awayTeam || printLabel("Takım", "Team"))}</small></div>
      <div class="group-match-checks"><span>□ ${printLabel("O", "P")}</span><span>□ S</span><span>□ ${printLabel("D", "V")}</span></div>
    </div>`;
  }

  function groupOnePageRoundCard(round, globalStart) {
    return `<article class="group-round-card">
      <header><span>${printLabel("TUR", "ROUND")} ${round.number}</span><small>${printLabel("3 maç", "3 matches")}</small></header>
      <div>${(round.matches || []).map((match,index)=>groupOnePageMatchRow(match,globalStart+index)).join("")}</div>
    </article>`;
  }

  function buildGroupOnePageSection(group) {
    const isGold = group === "gold";
    const rounds = isGold ? state.current.phase2.goldRounds : state.current.phase2.silverRounds;
    const ids = isGold ? state.current.phase2.goldIds : state.current.phase2.silverIds;
    const standingsRows = phase2Standings(group);
    const title = printLabel(isGold ? "Altın Grup Maç Paketi" : "Gümüş Grup Maç Paketi", isGold ? "Gold Group Match Pack" : "Silver Group Match Pack");
    const groupLabel = printLabel(isGold ? "Altın Grup" : "Gümüş Grup", isGold ? "Gold Group" : "Silver Group");
    const completed = allRoundMatches(rounds).filter(matchComplete).length;
    const total = allRoundMatches(rounds).length;
    let counter = 1;
    const roundCards = (rounds || []).map(round => {
      const card = groupOnePageRoundCard(round,counter);
      counter += (round.matches || []).length;
      return card;
    });
    const leftRounds = [roundCards[0],roundCards[2],roundCards[4]].filter(Boolean).join("");
    const rightRounds = [roundCards[1],roundCards[3]].filter(Boolean).join("");

    return `<section class="print-page group-one-page ${isGold ? "group-one-gold" : "group-one-silver"}">
      ${printDocumentHeader(title, printLabel("5 tur · 15 maç · skor föyü ve kümülatif puan tablosu tek sayfada", "5 rounds · 15 matches · score sheet and cumulative standings on one page"))}
      <div class="group-one-summary">
        <div><span>${printLabel("Grup", "Group")}</span><strong>${groupLabel}</strong></div>
        <div><span>${printLabel("Oyuncu", "Players")}</span><strong>${ids.length}</strong></div>
        <div><span>${printLabel("Tamamlanan", "Completed")}</span><strong>${completed}/${total}</strong></div>
        <div><span>${printLabel("Puan Taşıma", "Points Carry")}</span><strong>${printLabel("League Phase dahil", "Includes League Phase")}</strong></div>
      </div>
      <div class="group-one-layout">
        <div class="group-one-fixtures">
          <div class="group-one-section-title"><strong>${printLabel("Beş Turluk Maç Föyü", "Five-Round Match Sheet")}</strong><span>${printLabel("Skorları kutulara yazın; O / S / D kontrollerini tamamlayın.", "Enter scores in the boxes and complete P / S / V checks.")}</span></div>
          <div class="group-round-columns">
            <div class="group-round-column">${leftRounds}</div>
            <div class="group-round-column">${rightRounds}<article class="group-quick-note"><header>${printLabel("Hızlı Not / Kontrol", "Quick Notes / Checks")}</header><div><p>${printLabel("Eksik skor, takım seçimi veya doğrulama notlarını buraya yazın.", "Record missing scores, team selections or verification notes here.")}</p><span>1. __________________________________________</span><span>2. __________________________________________</span><span>3. __________________________________________</span><small>O/P: ${printLabel("Oynandı", "Played")} · S: Site · D/V: ${printLabel("Doğrulandı", "Verified")}</small></div></article></div>
          </div>
        </div>
        <aside class="group-one-standings">
          <div class="group-one-section-title"><strong>${printLabel("Kümülatif Puan Tablosu", "Cumulative Standings")}</strong><span>${printLabel("League Phase + grup maçları", "League Phase + group matches")}</span></div>
          <table class="group-one-standings-table">
            <thead><tr><th>#</th><th>${printLabel("Oyuncu", "Player")}</th><th>O</th><th>AV</th><th>P</th></tr></thead>
            <tbody>${standingsRows.map((row,index)=>`<tr><td>${index+1}</td><td>${displayName(row.id)}</td><td>${row.mp || ""}</td><td>${row.gd ? formatGD(row.gd) : "0"}</td><td>${row.pts || "0"}</td></tr>`).join("")}</tbody>
          </table>
          <div class="group-one-roster">
            <strong>${printLabel("Grup Kadrosu", "Group Roster")}</strong>
            ${ids.map((id,index)=>`<div><span>${index+1}</span><b>${displayName(id)}</b></div>`).join("")}
          </div>
          <div class="group-one-ranking-note">${printLabel("Sıralama: Puan · Averaj · Atılan gol · Galibiyet · Alfabetik sıra", "Ranking: Points · Goal difference · Goals scored · Wins · Alphabetical order")}</div>
        </aside>
      </div>
      <div class="group-one-footer">
        <div>${printLabel("Sonuçları yazan", "Recorded by")}: ____________________</div>
        <div>${printLabel("Tarih / Saat", "Date / Time")}: ____________________</div>
        <div>${printLabel("Kontrol eden", "Verified by")}: ____________________</div>
        <div>${printLabel("Not", "Notes")}: __________________________________________</div>
      </div>
    </section>`;
  }

  function buildGroupPackSections(group) {
    return [buildGroupOnePageSection(group)];
  }

  function seriesPrintBlock(series, title, fallbackA, fallbackB) {
    const playerA = series ? displayName(series.playerAId) : escapeHTML(fallbackA);
    const playerB = series ? displayName(series.playerBId) : escapeHTML(fallbackB);
    const games = series?.games || [1,2,3].map(number => ({ homeScore: null, awayScore: null, tiebreakWinnerId: null, note: "", round: number }));
    return `<div class="ko-series-block"><div class="ko-series-title">${escapeHTML(title)}</div><div class="ko-series-players"><strong>${playerA}</strong><span>VS</span><strong>${playerB}</strong></div><table class="ko-series-table"><thead><tr><th>${printLabel("Maç", "Match")}</th><th>${playerA}</th><th>${playerB}</th><th>${printLabel("Kazanan", "Winner")}</th><th>${printLabel("Not", "Notes")}</th></tr></thead><tbody>${games.map((game, index) => `<tr><td>${index + 1}</td><td>${Number.isFinite(game.homeScore) ? game.homeScore : ""}</td><td>${Number.isFinite(game.awayScore) ? game.awayScore : ""}</td><td>${game.tiebreakWinnerId ? displayName(game.tiebreakWinnerId) : ""}</td><td>${escapeHTML(game.note || "")}</td></tr>`).join("")}</tbody></table><div class="series-winner-line">${printLabel("Seri Galibi", "Series Winner")}: ______________________________</div></div>`;
  }

  function buildKnockoutBoardSection() {
    const ko = state.current.knockout;
    const final = ko.final;
    return `<section class="print-page a3-page knockout-print-page">
      ${printDocumentHeader(printLabel("Eleme Serileri ve Büyük Final Panosu", "Knockout Series and Grand Final Board"), printLabel("Çeyrek final ve yarı final: 3 maçta 2 galibiyet · Final: tek maç", "Quarter-finals and semi-finals: best of three · Final: single match"))}
      <div class="ko-print-grid">
        ${seriesPrintBlock(ko.qf1, printLabel("Çeyrek Final 1", "Quarter-final 1"), printLabel("Altın 2", "Gold 2"), printLabel("Gümüş 3", "Silver 3"))}
        ${seriesPrintBlock(ko.qf2, printLabel("Çeyrek Final 2", "Quarter-final 2"), printLabel("Altın 3", "Gold 3"), printLabel("Gümüş 2", "Silver 2"))}
        ${seriesPrintBlock(ko.qf3, printLabel("Çeyrek Final 3", "Quarter-final 3"), printLabel("Altın 4", "Gold 4"), printLabel("Gümüş 1", "Silver 1"))}
        ${seriesPrintBlock(ko.sf1, printLabel("Yarı Final 1", "Semi-final 1"), printLabel("Altın 1", "Gold 1"), printLabel("Çeyrek Final 2 Galibi", "Winner of Quarter-final 2"))}
        ${seriesPrintBlock(ko.sf2, printLabel("Yarı Final 2", "Semi-final 2"), printLabel("Çeyrek Final 1 Galibi", "Winner of Quarter-final 1"), printLabel("Çeyrek Final 3 Galibi", "Winner of Quarter-final 3"))}
        <div class="ko-series-block final-print-block"><div class="ko-series-title">${printLabel("Büyük Final", "Grand Final")}</div><div class="ko-series-players"><strong>${final ? displayName(final.homeId) : printLabel("Yarı Final 1 Galibi", "Winner of Semi-final 1")}</strong><span>VS</span><strong>${final ? displayName(final.awayId) : printLabel("Yarı Final 2 Galibi", "Winner of Semi-final 2")}</strong></div><div class="final-score-line">${printLabel("Final Skoru", "Final Score")}: ________ - ________</div><div class="series-winner-line">${printLabel("Şampiyon", "Champion")}: __________________________________________</div></div>
      </div>
      ${printControlFooter()}
    </section>`;
  }

  function openPrintDocument(title, sections, options = {}) {
    const popup = window.open("", "_blank");
    if (!popup) { toast("Tarayıcı açılır pencereyi engelledi. Bu site için pop-up izni ver.", "error"); return; }
    const pageSize = options.pageSize || "A4 landscape";
    const html = `<!DOCTYPE html><html lang="${printLanguage()}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>${printDocumentCSS(pageSize)}</style></head><body>
      <div class="screen-toolbar"><button onclick="window.print()">${printLabel("Yazdır / PDF Kaydet", "Print / Save PDF")}</button><button onclick="window.close()">${printLabel("Kapat", "Close")}</button><span>${printLabel("Yazdırma ekranında kenar boşluklarını minimum, ölçeği sayfaya sığdır seç.", "In the print dialog, use minimum margins and fit to page.")}</span></div>
      <main>${sections.join("")}</main>
      <script>setTimeout(()=>window.print(),500)<\/script>
    </body></html>`;
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
  }

  function printDocumentCSS(pageSize) {
    return `
      :root{--ink:#101722;--muted:#5f6b78;--gold:#a87322;--line:#b8c1ca;--soft:#eef1f4;--dark:#08131f}
      *{box-sizing:border-box}body{margin:0;background:#dfe4e8;color:var(--ink);font-family:Arial,Helvetica,sans-serif;font-size:10px}main{max-width:1500px;margin:70px auto 30px}.screen-toolbar{position:fixed;z-index:20;top:0;left:0;right:0;height:56px;display:flex;align-items:center;gap:10px;padding:10px 18px;background:#07131f;color:white;box-shadow:0 4px 18px rgba(0,0,0,.22)}.screen-toolbar button{border:0;border-radius:8px;padding:9px 14px;font-weight:800;cursor:pointer;background:#d6a84e;color:#151006}.screen-toolbar button+button{background:#fff;color:#111}.screen-toolbar span{margin-left:auto;color:#aeb9c4;font-size:11px}
      .print-page{width:297mm;min-height:210mm;margin:0 auto 16px;background:white;padding:9mm;box-shadow:0 8px 30px rgba(0,0,0,.18);page-break-after:always;overflow:hidden}.portrait-page{width:210mm;min-height:297mm}.a3-page{width:420mm;min-height:297mm}.doc-header{display:grid;grid-template-columns:1.1fr 1.5fr 1fr;gap:8mm;align-items:center;border-bottom:2px solid var(--gold);padding-bottom:5mm;margin-bottom:5mm}.doc-brand{display:flex;align-items:center;gap:4mm}.doc-mark{width:14mm;height:14mm;border-radius:50%;display:grid;place-items:center;background:var(--dark);color:#e6bd6a;font-size:15px;font-weight:900}.doc-brand-title{font-weight:900;font-size:13px}.doc-brand-sub{margin-top:1mm;color:var(--gold);font-size:8px;font-weight:800;letter-spacing:.12em}.doc-heading{text-align:center}.doc-heading h1{margin:0;font-size:21px}.doc-heading p{margin:2mm 0 0;color:var(--muted);font-size:9px}.doc-meta{display:grid;gap:2mm;font-size:8px}.doc-meta div{display:grid;grid-template-columns:22mm 1fr;gap:2mm}.doc-meta strong{color:var(--gold)}.doc-meta span{word-break:break-all}
      table{border-collapse:collapse;width:100%}.print-table th,.print-table td{border:1px solid var(--line);padding:2.1mm 1.5mm;text-align:center;height:8mm}.print-table th{background:var(--dark);color:white;font-size:7px;text-transform:uppercase;letter-spacing:.04em}.print-table .print-player{text-align:left;font-weight:800;min-width:28mm}.print-table .print-team-cell{min-width:22mm}.print-table .print-score-cell{min-width:18mm;font-size:14px;font-weight:900}.print-table .check-cell{font-size:15px;width:10mm}.print-table .notes-cell{min-width:25mm;text-align:left}.print-table.compact th,.print-table.compact td{padding:1mm;height:4.6mm;font-size:6.5px}.print-table.compact .print-score-cell{font-size:9px}.print-table.roomy th,.print-table.roomy td{height:15mm;font-size:9px}.print-table.roomy .print-score-cell{font-size:18px}.standings-print th,.standings-print td{height:13mm;font-size:10px}.standings-print .print-player{min-width:55mm}.standings-note{margin-top:4mm;color:var(--muted);font-size:9px}.control-footer{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin-top:7mm;padding-top:4mm;border-top:1px solid var(--line);font-size:9px}
      .a3-layout{display:grid;grid-template-columns:64mm 1fr;gap:6mm}.a3-roster{border:1px solid var(--line);padding:4mm}.a3-roster h3,.a3-round h3{margin:0 0 3mm;color:var(--gold);font-size:12px}.roster-line{display:grid;grid-template-columns:8mm 1fr;gap:2mm;border-bottom:1px solid #d9dee3;padding:2.1mm 0;font-size:9px}.roster-line span{color:var(--gold);font-weight:900}.a3-rounds{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}.a3-round{border:1px solid var(--line);padding:3mm;break-inside:avoid}.a3-match{display:grid;grid-template-columns:7mm 1fr 23mm 1fr 31mm;align-items:center;gap:2mm;border-top:1px solid #dfe3e7;padding:2.3mm 0;font-size:8px}.a3-no{font-weight:900;color:var(--gold)}.a3-player{font-weight:800}.a3-player.right{text-align:right}.a3-score{text-align:center;border:1px solid #909aa4;border-radius:3px;padding:1.5mm;font-weight:900;font-size:10px}.a3-checks{font-size:7px;color:var(--muted)}
      .ko-print-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5mm}.ko-series-block{border:1px solid var(--line);padding:4mm;break-inside:avoid}.ko-series-title{font-size:13px;font-weight:900;color:var(--gold);text-transform:uppercase}.ko-series-players{display:grid;grid-template-columns:1fr 10mm 1fr;align-items:center;gap:2mm;margin:3mm 0;text-align:center;font-size:10px}.ko-series-players span{color:var(--gold);font-weight:900}.ko-series-table th,.ko-series-table td{border:1px solid var(--line);padding:2mm;text-align:center;height:8mm}.ko-series-table th{background:var(--dark);color:white;font-size:7px}.series-winner-line,.final-score-line{margin-top:4mm;padding-top:3mm;border-top:1px solid var(--line);font-weight:800}.final-print-block{display:flex;flex-direction:column;justify-content:center;background:#fbf7ed;border:2px solid var(--gold)}

      .group-one-page{height:210mm;min-height:210mm;padding:6mm 7mm;page-break-after:always;--group-accent:#a87322}.group-one-page.group-one-silver{--group-accent:#667582}.group-one-page .doc-header{grid-template-columns:1fr 1.35fr .95fr;gap:5mm;padding-bottom:3mm;margin-bottom:3mm;border-color:var(--group-accent)}.group-one-page .doc-mark{width:12mm;height:12mm;font-size:13px}.group-one-page .doc-brand-title{font-size:11px}.group-one-page .doc-brand-sub{font-size:7px}.group-one-page .doc-heading h1{font-size:18px}.group-one-page .doc-heading p{font-size:7.5px;margin-top:1mm}.group-one-page .doc-meta{font-size:6.5px}.group-one-page .doc-meta div{grid-template-columns:18mm 1fr}.group-one-summary{display:grid;grid-template-columns:1.1fr .65fr .8fr 1.45fr;gap:2mm;margin-bottom:3mm}.group-one-summary>div{display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:2mm 2.5mm;border:1px solid #cbd2d9;border-radius:2mm;background:#f7f8fa}.group-one-summary span{font-size:6.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}.group-one-summary strong{font-size:8px;color:var(--group-accent)}.group-one-layout{display:grid;grid-template-columns:minmax(0,2.25fr) minmax(62mm,.85fr);gap:3mm;height:137mm}.group-one-fixtures,.group-one-standings{min-width:0;border:1px solid #c4ccd4;border-radius:2mm;padding:2.5mm;background:#fff}.group-one-section-title{display:flex;align-items:end;justify-content:space-between;gap:3mm;padding-bottom:1.5mm;margin-bottom:2mm;border-bottom:1px solid #d4dae0}.group-one-section-title strong{font-size:9px;color:var(--group-accent)}.group-one-section-title span{font-size:6.5px;color:var(--muted);text-align:right}.group-round-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm;height:119mm}.group-round-column{display:flex;flex-direction:column;gap:2mm;min-width:0}.group-round-card{height:37.6mm;flex:0 0 37.6mm;border:1px solid #c8d0d7;border-radius:1.5mm;overflow:hidden;break-inside:avoid;background:#fff}.group-quick-note{height:37.6mm;flex:0 0 37.6mm;border:1px dashed #aeb8c1;border-radius:1.5mm;overflow:hidden;background:#fafbfc}.group-quick-note>header{padding:1.5mm 2mm;background:#eef1f4;color:var(--group-accent);font-size:7px;font-weight:900;letter-spacing:.06em}.group-quick-note>div{padding:1.5mm 2mm}.group-quick-note p{margin:0 0 1.2mm;color:#697580;font-size:6px}.group-quick-note span{display:block;padding:1mm 0;border-bottom:1px dotted #aeb7c0;font-size:6px}.group-quick-note small{display:block;margin-top:1.4mm;color:#697580;font-size:5.8px}.group-round-card>header{display:flex;align-items:center;justify-content:space-between;padding:1.5mm 2mm;background:var(--dark);color:#fff}.group-round-card>header span{font-size:7px;font-weight:900;letter-spacing:.08em}.group-round-card>header small{font-size:6px;color:#d8e0e6}.group-one-match{display:grid;grid-template-columns:4.5mm minmax(21mm,1fr) 22mm minmax(21mm,1fr) 15mm;gap:1mm;align-items:center;min-height:9.8mm;padding:.85mm 1.5mm;border-top:1px solid #e0e4e8}.group-one-match:first-child{border-top:0}.group-match-no{width:4mm;height:4mm;border-radius:50%;display:grid;place-items:center;background:var(--group-accent);color:#fff;font-size:6px;font-weight:900}.group-match-side{min-width:0}.group-match-side.home{text-align:right}.group-match-side.away{text-align:left}.group-match-side strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:7px}.group-match-side small{display:block;margin-top:.6mm;color:#6d7781;font-size:5.8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px dotted #aeb7c0;min-height:2.7mm}.group-one-score{display:flex;align-items:center;justify-content:center;gap:1.2mm}.group-one-score i{font-style:normal;font-weight:900;color:#6c7680}.group-score-box{width:7.5mm;height:6.4mm;border:1.2px solid #6f7983;border-radius:1.4mm;display:grid;place-items:center;background:#fff;font-size:10px;font-weight:900}.group-score-box.filled{background:#f4f0e6;color:#111}.group-match-checks{display:grid;grid-template-columns:repeat(3,1fr);gap:.8mm;color:#606b75;font-size:4.8px}.group-match-checks span{text-align:center;white-space:nowrap}.group-one-standings{display:flex;flex-direction:column}.group-one-standings-table{font-size:7px}.group-one-standings-table th,.group-one-standings-table td{border:1px solid #c5cdd4;padding:1.6mm 1mm;text-align:center;height:7.2mm}.group-one-standings-table th{background:var(--dark);color:white;font-size:6px}.group-one-standings-table td:nth-child(2){text-align:left;font-weight:800;max-width:38mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-one-standings-table tbody tr:nth-child(-n+4) td:first-child{color:var(--group-accent);font-weight:900}.group-one-roster{margin-top:3mm;padding:2.5mm;border:1px solid #d2d8de;border-radius:1.5mm;background:#f8f9fa}.group-one-roster>strong{display:block;margin-bottom:1.5mm;color:var(--group-accent);font-size:7px;text-transform:uppercase;letter-spacing:.06em}.group-one-roster>div{display:grid;grid-template-columns:6mm 1fr;gap:1.5mm;padding:1.15mm 0;border-top:1px solid #e1e5e9;font-size:6.8px}.group-one-roster>div:first-of-type{border-top:0}.group-one-roster span{color:var(--group-accent);font-weight:900}.group-one-roster b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-one-ranking-note{margin-top:auto;padding-top:2mm;color:#697581;font-size:6.2px;line-height:1.45}.group-one-footer{display:grid;grid-template-columns:1fr 1fr 1fr 1.35fr;gap:3mm;margin-top:3mm;padding-top:2.5mm;border-top:1px solid #bfc7ce;font-size:7px}

      @media print{body{background:white}.screen-toolbar{display:none}main{margin:0;max-width:none}.print-page{box-shadow:none;margin:0;page-break-after:always}@page{size:${pageSize};margin:0}}
    `;
  }

  function printLeagueMaster() {
    openPrintDocument(printLabel("League Phase Ana Skor Föyü", "League Phase Master Score Sheet"), [buildLeagueMasterSection()], { pageSize: "A4 landscape" });
  }

  function printRoundSheets() {
    const sections = state.current.league.rounds.map((round, index) => printRoundSection(round, printLabel("League Phase", "League Phase"), index * 8 + 1));
    openPrintDocument(printLabel("League Phase Tur Föyleri", "League Phase Round Sheets"), sections, { pageSize: "A4 landscape" });
  }

  function printStandingsSheet() {
    openPrintDocument(printLabel("League Phase Manuel Puan Tablosu", "League Phase Manual Standings"), [printStandingsSection(printLabel("League Phase Manuel Puan Tablosu", "League Phase Manual Standings"), state.current.participants.map(p => p.id), leagueStandings())], { pageSize: "A4 portrait" });
  }

  function printA3Board() {
    openPrintDocument(printLabel("League Phase Oyun Masası Panosu", "League Phase Match Table Board"), [buildA3BoardSection()], { pageSize: "A3 landscape" });
  }

  function printGroupPack(group) {
    const title = group === "gold" ? printLabel("Altın Grup Maç Paketi", "Gold Group Match Pack") : printLabel("Gümüş Grup Maç Paketi", "Silver Group Match Pack");
    openPrintDocument(title, buildGroupPackSections(group), { pageSize: "A4 landscape" });
  }

  function printKnockoutBoard() {
    openPrintDocument(printLabel("Eleme Serileri Panosu", "Knockout Series Board"), [buildKnockoutBoardSection()], { pageSize: "A3 landscape" });
  }

  function printFullPack() {
    const sections = [buildA3BoardSection(), buildLeagueMasterSection(), ...state.current.league.rounds.map((round, index) => printRoundSection(round, printLabel("League Phase", "League Phase"), index * 8 + 1)), printStandingsSection(printLabel("League Phase Manuel Puan Tablosu", "League Phase Manual Standings"), state.current.participants.map(p => p.id), leagueStandings())];
    if (state.current.phase2.generated) sections.push(...buildGroupPackSections("gold"), ...buildGroupPackSections("silver"));
    if (state.current.knockout.generated) sections.push(buildKnockoutBoardSection());
    openPrintDocument(printLabel("FIFA 9 Mevcut Tam Turnuva Paketi", "FIFA 9 Current Full Tournament Pack"), sections, { pageSize: "A4 landscape" });
  }

  function renderArchive() {
    view.innerHTML = `
      <div class="group-banner silver">
        <div><div class="eyebrow">LEGACY</div><h2>FIFA 1–8 Turnuva Arşivi</h2><p>Yüklediğin Excel arşivinden alınan 382 maç, sekiz final ve tüm zamanlar kayıtları.</p></div>
        <div class="group-emblem">◇</div>
      </div>
      <div class="kpi-grid">
        ${kpiCard("Tamamlanan Turnuva", historical.summary?.editions || 8, "FIFA 1–8")}
        ${kpiCard("Arşivlenen Maç", historical.summary?.matches || 382, "Takım ve skor detayları")}
        ${kpiCard("Toplam Gol", historical.summary?.goals || "–", "Sekiz turnuva toplamı")}
        ${kpiCard("Tarihî Oyuncu", historical.summary?.players || 20, "Tüm zamanlar listesi")}
      </div>
      <h3 class="section-title">Turnuvalar</h3>
      <div class="archive-grid">
        ${(historical.editions || []).map(editionCard).join("")}
      </div>`;
  }

  function renderAllTime() {
    const analytics = buildAllTimeAnalytics();
    if (!analytics.players.length) {
      view.innerHTML = emptyState("♛", "Tüm Zamanlar Verisi Hazır Değil", "Arşiv ve güncel turnuva maçları yüklendiğinde burada detaylı istatistikler görünecek.");
      return;
    }
    ensureAllTimeSelections(analytics);
    const selectedPlayer = analytics.playerMap.get(allTimeSelectedPlayerName) || analytics.players[0];
    const selectedRivalry = analytics.pairMap.get(rivalryKey(allTimeRivalryA, allTimeRivalryB)) || analytics.rivalries[0] || null;
    const maxPoints = Math.max(...analytics.players.map(row => row.points), 1);
    view.innerHTML = `
      <div class="group-banner gold">
        <div><div class="eyebrow">HALL OF FAME</div><h2>Tüm Zamanlar Merkezi</h2><p>FIFA 1–8 arşivi ile FIFA 9’da tamamlanan maçların canlı birleşik performans, rekor ve rekabet merkezi. Oyuncu kartları, efsanevi eşleşmeler ve derinlemesine istatistikler tek ekranda.</p></div>
        <div class="group-emblem">♛</div>
      </div>
      <div class="kpi-grid">
        ${kpiCard("Kayıtlı Oyuncu", analytics.summary.players, "Tüm turnuvalarda yer alan oyuncular")}
        ${kpiCard("Arşivlenen Maç", analytics.summary.matches, "FIFA 1–9 birleşik maç verisi")}
        ${kpiCard("Toplam Gol", analytics.summary.goals, "Tarihî ve canlı turnuva golleri")}
        ${kpiCard("Aktif Rekabet", analytics.summary.rivalries, "En az bir kez karşılaşmış eşleşme")}
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Oyuncu Kartları</h3><div class="panel-subtitle">Tüm zamanlar yıldızları. Bir karta tıklayarak oyuncu panelini anında değiştir.</div></div><span class="badge badge-gold">${analytics.players.length} OYUNCU</span></div>
        <div class="player-card-grid">${analytics.players.map(renderPlayerCard).join("")}</div>
      </section>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Rekorlar Odası</h3><div class="panel-subtitle">Kupalar, üretkenlik ve üstünlük kayıtları.</div></div></div>
          <div class="records-grid">
            ${renderRecordTile("En Çok Şampiyonluk", analytics.records.titles, row => `${row.titles} şampiyonluk · ${row.finals} final`)}
            ${renderRecordTile("En Çok Final", analytics.records.finals, row => `${row.finals} final · ${row.podiums} podyum`)}
            ${renderRecordTile("En Çok Galibiyet", analytics.records.wins, row => `${row.wins} galibiyet · ${row.points} puan`)}
            ${renderRecordTile("En Çok Gol", analytics.records.goals, row => `${row.gf} gol · maç başı ${row.avgGoals.toFixed(2)}`)}
            ${renderRecordTile("En İyi PPG", analytics.records.ppg, row => `${row.ppg.toFixed(2)} PPG · ${row.games} maç`)}
            ${renderRecordTile("En Sağlam Savunma", analytics.records.defense, row => `Maç başı ${row.gaPerGame.toFixed(2)} gol yedi`)}
            ${renderMatchRecordTile("En Farklı Galibiyet", analytics.records.biggestWin)}
            ${renderRivalryRecordTile("En Çok Oynanan Rekabet", analytics.records.topRivalry)}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Şampiyonlar Kulübü</h3><div class="panel-subtitle">Kupaya uzanan oyuncuların özeti.</div></div></div>
          <div class="champion-strip">${analytics.champions.map(c => `<div class="champion-chip"><div class="name">${escapeHTML(c.name)}</div><div class="titles">${c.titles}× Şampiyon</div><div class="small">${c.finals} final · ${c.podiums} podyum</div></div>`).join("")}</div>
          <div class="info-box mt-24">En yüksek maç başı puan: <strong>${escapeHTML(analytics.records.ppg?.name || "–")}</strong> · ${analytics.records.ppg?.ppg?.toFixed?.(2) || "–"} PPG</div>
          <div class="info-box mt-16">En çok oynanan rekabet: <strong>${analytics.records.topRivalry ? `${escapeHTML(analytics.records.topRivalry.playerA)} – ${escapeHTML(analytics.records.topRivalry.playerB)}` : "–"}</strong>${analytics.records.topRivalry ? ` · ${analytics.records.topRivalry.meetings} maç` : ""}</div>
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">All-Time League Table</h3><div class="panel-subtitle">Galibiyet 3, beraberlik 1 puan esas alınarak hesaplandı.</div></div><span class="badge badge-gold">${analytics.players.length} OYUNCU</span></div>
          ${allTimeTable(analytics.players)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Puan Gücü</h3><div class="panel-subtitle">Tüm zamanlar puan liderleri ve güç eğrisi.</div></div></div>
          <div class="stat-bars">${analytics.players.slice(0,10).map(row => `<div class="stat-bar-row"><div class="stat-bar-name">${escapeHTML(row.name)}</div><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${row.points/maxPoints*100}%"></div></div><div class="stat-bar-value">${row.points}</div></div>`).join("")}</div>
          <div class="mini-stats-grid mt-24">
            <div class="mini-stat"><span>En Çok Maç</span><strong>${escapeHTML(analytics.records.matches?.name || "–")}</strong><small>${analytics.records.matches?.games || 0} maç</small></div>
            <div class="mini-stat"><span>En Çok Gol Farkı</span><strong>${escapeHTML(analytics.records.goalDifference?.name || "–")}</strong><small>${formatGD(analytics.records.goalDifference?.gd || 0)} averaj</small></div>
            <div class="mini-stat"><span>En Yüksek Galibiyet Oranı</span><strong>${escapeHTML(analytics.records.winRate?.name || "–")}</strong><small>${analytics.records.winRate?.winRate?.toFixed?.(1) || analytics.records.winRate?.winRate || 0}%</small></div>
            <div class="mini-stat"><span>En Çok Clean Sheet</span><strong>${escapeHTML(analytics.records.cleanSheets?.name || "–")}</strong><small>${analytics.records.cleanSheets?.cleanSheets || 0} maç</small></div>
          </div>
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Oyuncu Derin Analizi</h3><div class="panel-subtitle">Seçtiğin oyuncunun tüm zamanlar karnesi ve rakip bazlı üstünlükleri.</div></div></div>
          <div class="explorer-toolbar">
            <label class="field inline-field"><span>Oyuncu Seç</span><select id="allTimePlayerSelect">${analytics.players.map(row => `<option value="${escapeHTML(row.name)}" ${row.name === selectedPlayer.name ? "selected" : ""}>${escapeHTML(row.name)}</option>`).join("")}</select></label>
          </div>
          ${renderSelectedPlayerPanel(selectedPlayer)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Rekabet Merkezi</h3><div class="panel-subtitle">Kimin kime karşı ne kadar üstün olduğunu canlı karşılaştır.</div></div></div>
          <div class="explorer-toolbar rivalry-toolbar">
            <label class="field inline-field"><span>Oyuncu A</span><select id="rivalrySelectA">${analytics.players.map(row => `<option value="${escapeHTML(row.name)}" ${row.name === allTimeRivalryA ? "selected" : ""}>${escapeHTML(row.name)}</option>`).join("")}</select></label>
            <label class="field inline-field"><span>Oyuncu B</span><select id="rivalrySelectB">${analytics.players.map(row => `<option value="${escapeHTML(row.name)}" ${row.name === allTimeRivalryB ? "selected" : ""}>${escapeHTML(row.name)}</option>`).join("")}</select></label>
          </div>
          ${renderRivalryPanel(selectedRivalry)}
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">En Farklı Galibiyetler</h3><div class="panel-subtitle">Turnuva tarihinin en ağır skorları.</div></div></div>
          ${renderBiggestWinsTable(analytics.biggestWins.slice(0, 12))}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">En Çok Karşılaşılan Eşleşmeler</h3><div class="panel-subtitle">İzleyiciler için hızlı rekabet özeti. Bir satıra tıklayarak rekabet panelini doldur.</div></div></div>
          ${renderRivalryTable(analytics.rivalries.slice(0, 12))}
        </section>
      </div>`;
  }

  function ensureAllTimeSelections(analytics) {
    if (!analytics.players.length) return;
    const first = analytics.players[0]?.name || "";
    const second = analytics.players.find(player => player.name !== first)?.name || first;
    if (!allTimeSelectedPlayerName || !analytics.playerMap.has(allTimeSelectedPlayerName)) allTimeSelectedPlayerName = first;
    if (!allTimeRivalryA || !analytics.playerMap.has(allTimeRivalryA)) allTimeRivalryA = first;
    if (!allTimeRivalryB || !analytics.playerMap.has(allTimeRivalryB) || allTimeRivalryB === allTimeRivalryA) {
      const alternative = analytics.players.find(player => player.name !== allTimeRivalryA)?.name || second;
      allTimeRivalryB = alternative;
    }
    if (allTimeRivalryA === allTimeRivalryB) allTimeRivalryB = second;
  }

  function renderPlayerCard(row) {
    return `<article class="player-stat-card ${row.name === allTimeSelectedPlayerName ? "active" : ""}" data-action="select-alltime-player" data-player-name="${escapeHTML(row.name)}">
      <div class="player-stat-head">
        <div>
          <div class="player-stat-rank">#${row.rank}</div>
          <div class="player-stat-name">${escapeHTML(row.name)}</div>
          <div class="player-stat-meta">${row.titles}× şampiyonluk · ${row.finals} final · ${row.podiums} podyum</div>
        </div>
        <div class="player-medal">${row.titles ? "★" : row.rank <= 8 ? "◆" : "•"}</div>
      </div>
      <div class="player-stat-grid">
        <div><span>Puan</span><strong>${row.points}</strong></div>
        <div><span>PPG</span><strong>${row.ppg.toFixed(2)}</strong></div>
        <div><span>G%</span><strong>${row.winRate.toFixed(1)}%</strong></div>
        <div><span>Gol</span><strong>${row.gf}</strong></div>
      </div>
      <div class="player-stat-footer"><span>${row.games} maç · ${formatGD(row.gd)} averaj</span><span>${row.cleanSheets} clean sheet</span></div>
    </article>`;
  }

  function renderRecordTile(label, row, metaFn) {
    if (!row) return `<div class="record-tile"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">–</div><div class="record-note">Kayıt oluşmadı.</div></div>`;
    return `<div class="record-tile"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">${escapeHTML(row.name)}</div><div class="record-note">${escapeHTML(metaFn(row))}</div></div>`;
  }

  function renderMatchRecordTile(label, record) {
    if (!record) return `<div class="record-tile"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">–</div><div class="record-note">Kayıt oluşmadı.</div></div>`;
    return `<div class="record-tile accent-gold"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">${escapeHTML(record.winner)}</div><div class="record-note">${escapeHTML(record.loser)} karşısında ${record.score} · ${record.margin} fark · ${record.editionLabel}</div></div>`;
  }

  function renderRivalryRecordTile(label, record) {
    if (!record) return `<div class="record-tile"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">–</div><div class="record-note">Kayıt oluşmadı.</div></div>`;
    return `<div class="record-tile accent-blue"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">${escapeHTML(record.playerA)} – ${escapeHTML(record.playerB)}</div><div class="record-note">${record.meetings} maç · ${record.winsA}-${record.draws}-${record.winsB} rekabet özeti</div></div>`;
  }

  function renderSelectedPlayerPanel(player) {
    const topOpponents = (player.opponents || []).slice(0, 10);
    return `<div class="selected-player-shell">
      <div class="selected-player-card">
        <div class="selected-player-main">
          <div class="selected-player-rank">#${player.rank}</div>
          <div>
            <h3>${escapeHTML(player.name)}</h3>
            <p>${player.titles}× şampiyonluk · ${player.finals} final · ${player.podiums} podyum · ${player.editionsPlayed} turnuva</p>
          </div>
        </div>
        <div class="selected-player-kpis">
          <div><span>Maç</span><strong>${player.games}</strong></div>
          <div><span>Galibiyet</span><strong>${player.wins}</strong></div>
          <div><span>Beraberlik</span><strong>${player.draws}</strong></div>
          <div><span>Mağlubiyet</span><strong>${player.losses}</strong></div>
          <div><span>Gol</span><strong>${player.gf}</strong></div>
          <div><span>Yenilen</span><strong>${player.ga}</strong></div>
          <div><span>Averaj</span><strong>${formatGD(player.gd)}</strong></div>
          <div><span>Puan</span><strong>${player.points}</strong></div>
          <div><span>PPG</span><strong>${player.ppg.toFixed(2)}</strong></div>
          <div><span>Galibiyet %</span><strong>${player.winRate.toFixed(1)}%</strong></div>
          <div><span>Clean Sheet</span><strong>${player.cleanSheets}</strong></div>
          <div><span>Gol / Maç</span><strong>${player.avgGoals.toFixed(2)}</strong></div>
        </div>
        <div class="selected-player-insights">
          <div class="insight-pill"><span>En iyi rakip</span><strong>${player.bestOpponent ? `${escapeHTML(player.bestOpponent.name)} · ${player.bestOpponent.pointsPerGame.toFixed(2)} PPG` : "–"}</strong></div>
          <div class="insight-pill"><span>Zorlandığı rakip</span><strong>${player.nemesis ? `${escapeHTML(player.nemesis.name)} · ${player.nemesis.pointsPerGame.toFixed(2)} PPG` : "–"}</strong></div>
          <div class="insight-pill"><span>En farklı galibiyet</span><strong>${player.bestVictory ? `${player.bestVictory.score} · ${escapeHTML(player.bestVictory.loser)}` : "–"}</strong></div>
          <div class="insight-pill"><span>Turnuva katılımı</span><strong>${player.editionsPlayed} edisyon</strong></div>
        </div>
      </div>
      <div class="opponent-panel mt-24">
        <div class="panel-subtitle" style="margin-bottom:12px">Rakip Karnesi</div>
        ${topOpponents.length ? `<div class="table-wrap compact-table"><table><thead><tr><th>Rakip</th><th>Maç</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>PPG</th><th>Üstünlük</th></tr></thead><tbody>${topOpponents.map(opp => `<tr><td class="player-col"><span class="player-name">${escapeHTML(opp.name)}</span></td><td>${opp.meetings}</td><td>${opp.wins}</td><td>${opp.draws}</td><td>${opp.losses}</td><td>${opp.gf}</td><td>${opp.ga}</td><td>${opp.pointsPerGame.toFixed(2)}</td><td class="${opp.lead > 0 ? "gd-positive" : opp.lead < 0 ? "gd-negative" : ""}">${opp.lead > 0 ? `+${opp.lead}` : opp.lead}</td></tr>`).join("")}</tbody></table></div>` : `<div class="info-box">Henüz rakip verisi oluşmadı.</div>`}
      </div>
    </div>`;
  }

  function renderRivalryPanel(rivalry) {
    if (!rivalry) return `<div class="info-box">Seçilen oyuncular arasında henüz maç bulunmuyor.</div>`;
    return `<div class="rivalry-shell">
      <div class="rivalry-hero">
        <div class="rivalry-side ${rivalry.leader === rivalry.playerA ? "leader" : ""}"><div class="rivalry-name">${escapeHTML(rivalry.playerA)}</div><div class="rivalry-score">${rivalry.winsA}</div><small>galibiyet</small></div>
        <div class="rivalry-centre"><div class="rivalry-meetings">${rivalry.meetings} maç</div><div class="rivalry-draws">${rivalry.draws} beraberlik</div><div class="rivalry-balance">${escapeHTML(rivalry.summary)}</div></div>
        <div class="rivalry-side ${rivalry.leader === rivalry.playerB ? "leader" : ""}"><div class="rivalry-name">${escapeHTML(rivalry.playerB)}</div><div class="rivalry-score">${rivalry.winsB}</div><small>galibiyet</small></div>
      </div>
      <div class="selected-player-insights mt-16">
        <div class="insight-pill"><span>Gol Dengesi</span><strong>${rivalry.goalsA} – ${rivalry.goalsB}</strong></div>
        <div class="insight-pill"><span>Üstünlük</span><strong>${escapeHTML(rivalry.leader ? `${rivalry.leader} önde` : "Denge" )}</strong></div>
        <div class="insight-pill"><span>En farklı maç</span><strong>${rivalry.biggestResult ? `${rivalry.biggestResult.score} · ${escapeHTML(rivalry.biggestResult.winner)}` : "–"}</strong></div>
      </div>
      <div class="panel-subtitle" style="margin:18px 0 12px">Maç Geçmişi</div>
      <div class="table-wrap compact-table"><table><thead><tr><th>Edisyon</th><th>Aşama</th><th>${escapeHTML(rivalry.playerA)}</th><th>${escapeHTML(rivalry.playerB)}</th><th>Kazanan</th></tr></thead><tbody>${rivalry.matches.slice(0, 12).map(item => `<tr><td>${escapeHTML(item.editionLabel)}</td><td>${escapeHTML(item.stage)}</td><td>${item.scoreA}</td><td>${item.scoreB}</td><td>${escapeHTML(item.winner || "Berabere")}</td></tr>`).join("")}</tbody></table></div>
    </div>`;
  }

  function renderBiggestWinsTable(rows) {
    if (!rows.length) return `<div class="info-box">Henüz farklı skor verisi oluşmadı.</div>`;
    return `<div class="table-wrap compact-table"><table><thead><tr><th>#</th><th>Kazanan</th><th>Kaybeden</th><th>Skor</th><th>Fark</th><th>Edisyon</th><th>Aşama</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td class="player-col"><span class="player-name">${escapeHTML(row.winner)}</span></td><td class="player-col">${escapeHTML(row.loser)}</td><td>${row.score}</td><td class="gd-positive">+${row.margin}</td><td>${escapeHTML(row.editionLabel)}</td><td>${escapeHTML(row.stage)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderRivalryTable(rows) {
    if (!rows.length) return `<div class="info-box">Henüz rekabet verisi oluşmadı.</div>`;
    return `<div class="table-wrap compact-table"><table><thead><tr><th>Eşleşme</th><th>Maç</th><th>${escapeHTML("Oyuncu A")}</th><th>B</th><th>Oyuncu B</th><th>Gol</th></tr></thead><tbody>${rows.map(row => `<tr data-action="set-rivalry" data-rival-a="${escapeHTML(row.playerA)}" data-rival-b="${escapeHTML(row.playerB)}"><td class="player-col"><span class="player-name">${escapeHTML(row.playerA)} – ${escapeHTML(row.playerB)}</span></td><td>${row.meetings}</td><td>${row.winsA}</td><td>${row.draws}</td><td>${row.winsB}</td><td>${row.goalsA}-${row.goalsB}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function rivalryKey(a, b) {
    return [a, b].filter(Boolean).sort((left, right) => left.localeCompare(right, "tr")).join("||");
  }

  function buildAllTimeAnalytics() {
    const combinedTable = combinedAllTime();
    const championRows = combinedChampions();
    const championMap = new Map(championRows.map(row => [row.name, row]));
    const statsMap = new Map();
    const rivalryMap = new Map();
    const unifiedMatches = buildUnifiedAllTimeMatches();

    function ensurePlayer(name) {
      if (!statsMap.has(name)) {
        statsMap.set(name, { name, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, cleanSheets: 0, editions: new Set(), bestVictory: null, opponents: [] });
      }
      return statsMap.get(name);
    }

    function noteBestVictory(player, winner, loser, homeScore, awayScore, editionLabel, stage) {
      const margin = Math.abs(homeScore - awayScore);
      const score = `${homeScore}-${awayScore}`;
      if (!player.bestVictory || margin > player.bestVictory.margin || (margin === player.bestVictory.margin && (homeScore + awayScore) > player.bestVictory.totalGoals)) {
        player.bestVictory = { winner, loser, margin, score, editionLabel, stage, totalGoals: homeScore + awayScore };
      }
    }

    for (const match of unifiedMatches) {
      const home = match.homeName?.trim();
      const away = match.awayName?.trim();
      if (!home || !away || /^P\d+$/i.test(home) || /^P\d+$/i.test(away)) continue;
      const homeRow = ensurePlayer(home);
      const awayRow = ensurePlayer(away);
      homeRow.games += 1; awayRow.games += 1;
      homeRow.gf += match.homeScore; homeRow.ga += match.awayScore;
      awayRow.gf += match.awayScore; awayRow.ga += match.homeScore;
      if (match.awayScore === 0) homeRow.cleanSheets += 1;
      if (match.homeScore === 0) awayRow.cleanSheets += 1;
      homeRow.editions.add(match.edition);
      awayRow.editions.add(match.edition);

      let winner = null;
      if (match.homeScore > match.awayScore) winner = home;
      else if (match.awayScore > match.homeScore) winner = away;
      else if (!match.allowDraw && match.winnerName) winner = match.winnerName;

      if (!winner) {
        homeRow.draws += 1; awayRow.draws += 1;
        homeRow.points += 1; awayRow.points += 1;
      } else if (winner === home) {
        homeRow.wins += 1; homeRow.points += 3; awayRow.losses += 1;
        noteBestVictory(homeRow, home, away, match.homeScore, match.awayScore, match.editionLabel, match.stage);
      } else {
        awayRow.wins += 1; awayRow.points += 3; homeRow.losses += 1;
        noteBestVictory(awayRow, away, home, match.awayScore, match.homeScore, match.editionLabel, match.stage);
      }

      const key = rivalryKey(home, away);
      if (!rivalryMap.has(key)) {
        const [playerA, playerB] = [home, away].sort((left, right) => left.localeCompare(right, "tr"));
        rivalryMap.set(key, { key, playerA, playerB, meetings: 0, wins: new Map([[playerA, 0], [playerB, 0]]), draws: 0, goals: new Map([[playerA, 0], [playerB, 0]]), matches: [], biggestResult: null });
      }
      const rivalry = rivalryMap.get(key);
      rivalry.meetings += 1;
      rivalry.goals.set(home, (rivalry.goals.get(home) || 0) + match.homeScore);
      rivalry.goals.set(away, (rivalry.goals.get(away) || 0) + match.awayScore);
      if (!winner) rivalry.draws += 1;
      else rivalry.wins.set(winner, (rivalry.wins.get(winner) || 0) + 1);
      const scoreA = rivalry.playerA === home ? match.homeScore : match.awayScore;
      const scoreB = rivalry.playerB === away ? match.awayScore : match.homeScore;
      rivalry.matches.push({ edition: match.edition, editionLabel: match.editionLabel, stage: match.stage, scoreA, scoreB, winner });
      const margin = Math.abs(match.homeScore - match.awayScore);
      if (margin > 0) {
        const winName = match.homeScore > match.awayScore ? home : match.awayScore > match.homeScore ? away : winner;
        const loseName = winName === home ? away : home;
        const score = `${Math.max(match.homeScore, match.awayScore)}-${Math.min(match.homeScore, match.awayScore)}`;
        if (!rivalry.biggestResult || margin > rivalry.biggestResult.margin) rivalry.biggestResult = { winner: winName, loser: loseName, margin, score };
      }
    }

    for (const row of statsMap.values()) {
      row.gd = row.gf - row.ga;
    }

    const baseByName = new Map(combinedTable.map(row => [row.name, row]));
    const playerRows = combinedTable.map(base => {
      const computed = statsMap.get(base.name) || { cleanSheets: 0, editions: new Set(), bestVictory: null, opponents: [] };
      const champion = championMap.get(base.name) || { titles: 0, finals: 0, podiums: 0 };
      return {
        ...base,
        titles: champion.titles || 0,
        finals: champion.finals || 0,
        podiums: champion.podiums || 0,
        cleanSheets: computed.cleanSheets || 0,
        editionsPlayed: computed.editions?.size || 0,
        bestVictory: computed.bestVictory || null,
        avgGoals: base.games ? base.gf / base.games : 0,
        gaPerGame: base.games ? base.ga / base.games : 0,
        opponents: []
      };
    });

    const playerMap = new Map(playerRows.map(row => [row.name, row]));

    for (const rivalry of rivalryMap.values()) {
      const winsA = rivalry.wins.get(rivalry.playerA) || 0;
      const winsB = rivalry.wins.get(rivalry.playerB) || 0;
      const draws = rivalry.draws || 0;
      const goalsA = rivalry.goals.get(rivalry.playerA) || 0;
      const goalsB = rivalry.goals.get(rivalry.playerB) || 0;
      const rowA = playerMap.get(rivalry.playerA);
      const rowB = playerMap.get(rivalry.playerB);
      if (rowA) rowA.opponents.push({ name: rivalry.playerB, meetings: rivalry.meetings, wins: winsA, draws, losses: winsB, gf: goalsA, ga: goalsB, lead: winsA - winsB, pointsPerGame: rivalry.meetings ? ((winsA * 3 + draws) / rivalry.meetings) : 0 });
      if (rowB) rowB.opponents.push({ name: rivalry.playerA, meetings: rivalry.meetings, wins: winsB, draws, losses: winsA, gf: goalsB, ga: goalsA, lead: winsB - winsA, pointsPerGame: rivalry.meetings ? ((winsB * 3 + draws) / rivalry.meetings) : 0 });
    }

    for (const row of playerRows) {
      row.opponents.sort((a, b) => b.meetings - a.meetings || b.pointsPerGame - a.pointsPerGame || a.name.localeCompare(b.name, "tr"));
      const meaningful = row.opponents.filter(opp => opp.meetings >= 2);
      const pool = meaningful.length ? meaningful : row.opponents;
      row.bestOpponent = pool.length ? [...pool].sort((a, b) => b.pointsPerGame - a.pointsPerGame || b.lead - a.lead || a.name.localeCompare(b.name, "tr"))[0] : null;
      row.nemesis = pool.length ? [...pool].sort((a, b) => a.pointsPerGame - b.pointsPerGame || a.lead - b.lead || a.name.localeCompare(b.name, "tr"))[0] : null;
      row.avgGoals = row.games ? row.gf / row.games : 0;
      row.gaPerGame = row.games ? row.ga / row.games : 0;
    }

    const rivalries = [...rivalryMap.values()].map(rivalry => {
      const winsA = rivalry.wins.get(rivalry.playerA) || 0;
      const winsB = rivalry.wins.get(rivalry.playerB) || 0;
      const goalsA = rivalry.goals.get(rivalry.playerA) || 0;
      const goalsB = rivalry.goals.get(rivalry.playerB) || 0;
      const leader = winsA === winsB ? "" : winsA > winsB ? rivalry.playerA : rivalry.playerB;
      const summary = winsA === winsB ? "Rekabet dengede" : `${leader} ${Math.abs(winsA - winsB)} maç farkla önde`;
      return {
        key: rivalry.key,
        playerA: rivalry.playerA,
        playerB: rivalry.playerB,
        meetings: rivalry.meetings,
        winsA,
        winsB,
        draws: rivalry.draws,
        goalsA,
        goalsB,
        leader,
        summary,
        biggestResult: rivalry.biggestResult,
        matches: rivalry.matches.sort((a, b) => a.edition - b.edition)
      };
    }).sort((a, b) => b.meetings - a.meetings || (b.goalsA + b.goalsB) - (a.goalsA + a.goalsB) || a.playerA.localeCompare(b.playerA, "tr"));

    const biggestWins = unifiedMatches.map(match => {
      const home = match.homeName?.trim();
      const away = match.awayName?.trim();
      const margin = Math.abs(match.homeScore - match.awayScore);
      if (!home || !away || margin === 0) return null;
      const winner = match.homeScore > match.awayScore ? home : away;
      const loser = winner === home ? away : home;
      return { winner, loser, score: `${Math.max(match.homeScore, match.awayScore)}-${Math.min(match.homeScore, match.awayScore)}`, margin, edition: match.edition, editionLabel: match.editionLabel, stage: match.stage, totalGoals: match.homeScore + match.awayScore };
    }).filter(Boolean).sort((a, b) => b.margin - a.margin || b.totalGoals - a.totalGoals || a.edition - b.edition);

    function bestBy(selector, filter = () => true, sorter = (a, b) => 0) {
      const list = playerRows.filter(filter);
      return list.length ? [...list].sort((a, b) => selector(b) - selector(a) || sorter(a, b))[0] : null;
    }

    const records = {
      titles: bestBy(row => row.titles, row => row.titles > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      finals: bestBy(row => row.finals, row => row.finals > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      wins: bestBy(row => row.wins, row => row.games > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      goals: bestBy(row => row.gf, row => row.games > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      ppg: bestBy(row => row.ppg, row => row.games >= 10, (a, b) => a.name.localeCompare(b.name, "tr")),
      defense: playerRows.filter(row => row.games >= 15).sort((a, b) => a.gaPerGame - b.gaPerGame || b.games - a.games || a.name.localeCompare(b.name, "tr"))[0] || null,
      matches: bestBy(row => row.games, row => row.games > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      goalDifference: bestBy(row => row.gd, row => row.games > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      winRate: bestBy(row => row.winRate, row => row.games >= 10, (a, b) => a.name.localeCompare(b.name, "tr")),
      cleanSheets: bestBy(row => row.cleanSheets, row => row.games > 0, (a, b) => a.name.localeCompare(b.name, "tr")),
      biggestWin: biggestWins[0] || null,
      topRivalry: rivalries[0] || null
    };

    return {
      players: playerRows,
      playerMap,
      champions: championRows,
      rivalries,
      pairMap: new Map(rivalries.map(row => [rivalryKey(row.playerA, row.playerB), row])),
      biggestWins,
      records,
      summary: {
        players: playerRows.length,
        matches: unifiedMatches.length,
        goals: unifiedMatches.reduce((sum, match) => sum + match.homeScore + match.awayScore, 0),
        rivalries: rivalries.length,
        editions: (historical.summary?.editions || 8) + 1
      }
    };
  }

  function buildUnifiedAllTimeMatches() {
    const historicalMatches = (historical.editions || []).flatMap(edition => (edition.matches || []).map((match, index) => ({
      id: `historical-${edition.edition}-${index + 1}`,
      edition: edition.edition,
      editionLabel: `FIFA ${edition.edition}`,
      stage: historicalStageLabel(match.stage),
      homeName: match.p1,
      awayName: match.p2,
      homeTeam: match.t1 || "",
      awayTeam: match.t2 || "",
      homeScore: Number(match.s1),
      awayScore: Number(match.s2),
      allowDraw: true,
      winnerName: Number(match.s1) === Number(match.s2) ? "" : Number(match.s1) > Number(match.s2) ? match.p1 : match.p2
    })));
    const currentMatches = allCurrentMatches().filter(matchComplete).map(match => ({
      id: match.id,
      edition: state.current.edition || 9,
      editionLabel: `FIFA ${state.current.edition || 9}`,
      stage: currentMatchStageLabel(match),
      homeName: playerName(match.homeId),
      awayName: playerName(match.awayId),
      homeTeam: match.homeTeam || "",
      awayTeam: match.awayTeam || "",
      homeScore: Number(match.homeScore),
      awayScore: Number(match.awayScore),
      allowDraw: match.allowDraw,
      winnerName: matchWinnerId(match) ? playerName(matchWinnerId(match)) : ""
    }));
    return [...historicalMatches, ...currentMatches];
  }

  function historicalStageLabel(stage) {
    if (!stage) return "League Match";
    const map = { "Semi Final": "Semi Final", "FINAL": "Final", "3rd Place": "3rd Place" };
    return map[stage] || stage;
  }

  function currentMatchStageLabel(match) {
    const seriesMap = { qf1: "Quarter-final 1", qf2: "Quarter-final 2", qf3: "Quarter-final 3", sf1: "Semi-final 1", sf2: "Semi-final 2" };
    if (match.phase === "league") return `League Phase · Round ${match.round}`;
    if (match.phase === "gold") return `Gold Group · Round ${match.round}`;
    if (match.phase === "silver") return `Silver Group · Round ${match.round}`;
    if (match.phase === "knockout") return `${seriesMap[match.seriesKey] || "Knockout Series"} · Match ${match.round}`;
    if (match.phase === "final") return "Grand Final";
    return "FIFA 9";
  }

  function renderLiveStatistics() {
    const analytics = buildLiveTournamentAnalytics();
    if (!state.current.league.generated) {
      view.innerHTML = emptyState("⌁", "Canlı İstatistikler Kura Sonrası Başlar", "16 oyuncu kaydedilip League Phase fikstürü oluşturulduğunda FIFA 9 canlı istatistik merkezi otomatik devreye girecek.", canEdit() ? `<button class="btn btn-gold" data-nav="setup">Kura Sayfasına Git</button>` : "");
      return;
    }

    const progress = analytics.summary.totalFixtures ? analytics.summary.completed / analytics.summary.totalFixtures * 100 : 0;
    const leader = analytics.records.pointsLeader;
    const topScorer = analytics.records.goalLeader;
    const lastUpdate = analytics.summary.lastUpdated ? new Date(analytics.summary.lastUpdated).toLocaleString("tr-TR") : "Henüz sonuç girilmedi";

    view.innerHTML = `
      <div class="group-banner live-stats-banner">
        <div>
          <div class="eyebrow">FIFA 9 · LIVE DATA</div>
          <h2>Canlı Turnuva İstatistikleri</h2>
          <p>FIFA 9 oynanırken girilen her skorla anında yenilenen oyuncu performansları, rekorlar, takım tercihleri, form grafikleri ve rekabet verileri.</p>
          <div class="live-banner-actions"><button class="btn btn-gold" data-action="share-live-stats">Canlı Statsı Paylaş</button><button class="btn btn-ghost" data-nav="league">Puan Durumuna Git</button></div>
        </div>
        <div class="live-progress-orb"><strong>${Math.round(progress)}%</strong><span>Turnuva Verisi</span></div>
      </div>

      <div class="live-update-strip"><span class="live-pulse-dot"></span><strong>Canlı Güncelleme Aktif</strong><span>Son veri: ${escapeHTML(lastUpdate)}</span><span>${analytics.summary.completed}/${analytics.summary.totalFixtures} kayıtlı fikstür</span></div>

      <div class="kpi-grid">
        ${kpiCard("Tamamlanan Maç", analytics.summary.completed, `${analytics.summary.totalFixtures} aktif fikstür`, progress)}
        ${kpiCard("Toplam Gol", analytics.summary.goals, `Maç başı ${analytics.summary.avgGoals.toFixed(2)}`)}
        ${kpiCard("Performans Lideri", leader?.name || "–", leader ? `${leader.points} performans puanı · ${leader.wins} galibiyet` : "Sonuç bekleniyor")}
        ${kpiCard("Gol Lideri", topScorer?.name || "–", topScorer ? `${topScorer.gf} gol · maç başı ${topScorer.avgGoals.toFixed(2)}` : "Sonuç bekleniyor")}
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Canlı Rekor Panosu</h3><div class="panel-subtitle">Yalnızca FIFA 9’da tamamlanan maçlardan hesaplanır ve her skor girişinde değişebilir.</div></div><span class="badge badge-gold">EDITION 09</span></div>
        <div class="live-record-grid">
          ${renderLiveRecordCard("En Çok Galibiyet", analytics.records.winsLeader, row => `${row.wins} galibiyet · ${row.games} maç`, "W")}
          ${renderLiveRecordCard("En İyi Hücum", analytics.records.goalLeader, row => `${row.gf} gol · ${row.avgGoals.toFixed(2)} gol/maç`, "GF")}
          ${renderLiveRecordCard("En Sağlam Savunma", analytics.records.defenseLeader, row => `${row.gaPerGame.toFixed(2)} yenilen gol/maç`, "DEF")}
          ${renderLiveRecordCard("En Formda Oyuncu", analytics.records.formLeader, row => `${row.formPoints} form puanı · ${row.form.join("-") || "–"}`, "FORM")}
          ${renderLiveRecordCard("Galibiyet Serisi", analytics.records.winStreakLeader, row => `${row.currentWinStreak} maç üst üste`, "STREAK")}
          ${renderLiveMatchRecordCard("En Farklı Galibiyet", analytics.records.biggestWin)}
          ${renderLiveMatchRecordCard("En Gollü Maç", analytics.records.highestScoringMatch, true)}
          ${renderLiveTeamRecordCard("En Çok Seçilen Takım", analytics.records.mostUsedTeam)}
        </div>
      </section>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Turnuva Nabzı</h3><div class="panel-subtitle">Her aşamanın maç, gol ve tamamlanma durumu.</div></div></div>
        <div class="stage-pulse-grid">${analytics.stages.map(renderStagePulseCard).join("")}</div>
      </section>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">FIFA 9 Oyuncu Performans Kartları</h3><div class="panel-subtitle">Lig, Altın/Gümüş ve eleme maçlarının canlı birleşik performansı. Bu tablo resmî grup sıralamasından ayrı bir istatistik görünümüdür.</div></div><span class="badge badge-blue">${analytics.players.length} OYUNCU</span></div>
        <div class="live-player-grid">${analytics.players.map(renderLivePlayerCard).join("")}</div>
      </section>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Canlı Performans Tablosu</h3><div class="panel-subtitle">Bütün FIFA 9 maçları üzerinden W/D/L, gol, performans puanı ve form.</div></div></div>
          ${livePerformanceTable(analytics.players)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Form ve Seri Merkezi</h3><div class="panel-subtitle">Son beş maç, güncel galibiyet ve yenilmezlik serileri.</div></div></div>
          <div class="live-form-list">${analytics.players.slice().sort((a,b)=>b.formPoints-a.formPoints || b.currentUnbeatenStreak-a.currentUnbeatenStreak || b.points-a.points).map(renderLiveFormRow).join("")}</div>
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Son Tamamlanan Maçlar</h3><div class="panel-subtitle">Skor giriş zamanına göre en güncel sonuçlar.</div></div><span class="badge badge-silver">LIVE RESULTS</span></div>
          ${renderLiveMatchFeed(analytics.recentMatches, true)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Sıradaki Maçlar</h3><div class="panel-subtitle">Henüz sonucu girilmemiş yaklaşan fikstürler.</div></div><span class="badge badge-blue">NEXT UP</span></div>
          ${renderLiveMatchFeed(analytics.upcomingMatches, false)}
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">FIFA 9 Rekabetleri</h3><div class="panel-subtitle">Bu turnuvada en çok karşılaşan oyuncular ve güncel üstünlük dengesi.</div></div></div>
          ${liveRivalryTable(analytics.rivalries.slice(0, 12))}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Canlı Takım Tercihleri</h3><div class="panel-subtitle">Yalnızca FIFA 9’da seçilen takımların kullanım ve başarı özeti.</div></div></div>
          ${liveTeamTable(analytics.teams.slice(0, 12))}
        </section>
      </div>`;
  }

  function renderLiveRecordCard(label, row, metaFn, icon) {
    return `<article class="live-record-card"><div class="live-record-icon">${escapeHTML(icon)}</div><div><div class="live-record-label">${escapeHTML(label)}</div><div class="live-record-name">${escapeHTML(row?.name || "–")}</div><div class="live-record-meta">${row ? escapeHTML(metaFn(row)) : "Sonuç bekleniyor"}</div></div></article>`;
  }

  function renderLiveMatchRecordCard(label, record, totalGoalsMode = false) {
    if (!record) return `<article class="live-record-card"><div class="live-record-icon">⚡</div><div><div class="live-record-label">${escapeHTML(label)}</div><div class="live-record-name">–</div><div class="live-record-meta">Sonuç bekleniyor</div></div></article>`;
    const metric = totalGoalsMode ? `${record.totalGoals} toplam gol` : `${record.margin} gol farkı`;
    return `<article class="live-record-card accent"><div class="live-record-icon">⚡</div><div><div class="live-record-label">${escapeHTML(label)}</div><div class="live-record-name">${escapeHTML(record.homeName)} ${record.homeScore}-${record.awayScore} ${escapeHTML(record.awayName)}</div><div class="live-record-meta">${escapeHTML(record.stage)} · ${metric}</div></div></article>`;
  }

  function renderLiveTeamRecordCard(label, team) {
    return `<article class="live-record-card team"><div class="live-record-icon">◉</div><div><div class="live-record-label">${escapeHTML(label)}</div><div class="live-record-name">${escapeHTML(team?.name || "–")}</div><div class="live-record-meta">${team ? `${team.games} seçim · ${team.points} puan · ${team.ppg.toFixed(2)} PPG` : "Takım verisi bekleniyor"}</div></div></article>`;
  }

  function renderStagePulseCard(stage) {
    const progress = stage.total ? stage.completed / stage.total * 100 : 0;
    return `<article class="stage-pulse-card ${stage.key}"><div class="stage-pulse-top"><span>${escapeHTML(stage.label)}</span><strong>${stage.completed}/${stage.total}</strong></div><div class="stage-pulse-track"><i style="width:${Math.min(100, progress)}%"></i></div><div class="stage-pulse-meta"><span>${stage.goals} gol</span><span>${stage.completed ? (stage.goals / stage.completed).toFixed(2) : "0.00"} gol/maç</span></div></article>`;
  }

  function renderLivePlayerCard(row) {
    return `<article class="live-player-card rank-${Math.min(row.rank, 4)}">
      <div class="live-player-head"><div><span class="live-player-rank">#${row.rank}</span><h4>${escapeHTML(row.name)}</h4><small>${escapeHTML(row.officialPosition || "FIFA 9")}</small></div><div class="live-player-points">${row.points}<span>PERF P</span></div></div>
      <div class="live-player-numbers"><div><span>O</span><strong>${row.games}</strong></div><div><span>G</span><strong>${row.wins}</strong></div><div><span>AG</span><strong>${row.gf}</strong></div><div><span>AV</span><strong>${formatGD(row.gd)}</strong></div></div>
      <div class="live-player-form">${formHTML(row.form)}<span>${row.currentStreakLabel}</span></div>
    </article>`;
  }

  function livePerformanceTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="player-col">Oyuncu</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>Perf P</th><th>PPG</th><th>Form</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.rank}</td><td class="player-col"><span class="player-name">${escapeHTML(row.name)}</span><small class="table-subline">${escapeHTML(row.officialPosition || "")}</small></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td class="points-cell">${row.points}</td><td>${row.ppg.toFixed(2)}</td><td>${formHTML(row.form)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderLiveFormRow(row) {
    return `<div class="live-form-row"><div class="live-form-player"><strong>${escapeHTML(row.name)}</strong><span>${row.games} maç · ${row.winRate.toFixed(1)}% galibiyet</span></div><div>${formHTML(row.form)}</div><div class="live-streak-box"><strong>${row.currentWinStreak}</strong><span>Galibiyet Serisi</span></div><div class="live-streak-box"><strong>${row.currentUnbeatenStreak}</strong><span>Yenilmezlik</span></div></div>`;
  }

  function renderLiveMatchFeed(matches, completed) {
    if (!matches.length) return `<div class="info-box">${completed ? "Henüz tamamlanan maç yok." : "Şu anda bekleyen fikstür yok."}</div>`;
    return `<div class="live-match-feed">${matches.map(match => `<article class="live-feed-match"><div class="live-feed-stage">${escapeHTML(match.stage)}</div><div class="live-feed-main"><span>${escapeHTML(match.homeName)}</span><strong>${completed ? `${match.homeScore} – ${match.awayScore}` : "VS"}</strong><span>${escapeHTML(match.awayName)}</span></div><div class="live-feed-teams"><span>${escapeHTML(match.homeTeam || "Takım bekleniyor")}</span><span>${completed && match.winnerName ? `Kazanan: ${escapeHTML(match.winnerName)}` : ""}</span><span>${escapeHTML(match.awayTeam || "Takım bekleniyor")}</span></div></article>`).join("")}</div>`;
  }

  function liveRivalryTable(rows) {
    if (!rows.length) return `<div class="info-box">Bu turnuvada henüz tekrar eden bir eşleşme oluşmadı.</div>`;
    return `<div class="table-wrap compact-table"><table><thead><tr><th>Eşleşme</th><th>Maç</th><th>G</th><th>B</th><th>G</th><th>Gol</th><th>Üstünlük</th></tr></thead><tbody>${rows.map(row => `<tr><td class="player-col"><span class="player-name">${escapeHTML(row.playerA)} – ${escapeHTML(row.playerB)}</span></td><td>${row.meetings}</td><td>${row.winsA}</td><td>${row.draws}</td><td>${row.winsB}</td><td>${row.goalsA}-${row.goalsB}</td><td>${escapeHTML(row.leader || "Denge")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function liveTeamTable(rows) {
    if (!rows.length) return `<div class="info-box">Takım isimleri maç sonuçlarına girildiğinde canlı takım istatistikleri burada oluşacak.</div>`;
    return `<div class="table-wrap compact-table"><table><thead><tr><th>#</th><th class="player-col">Takım</th><th>Seçim</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>AV</th><th>P</th><th>PPG</th></tr></thead><tbody>${rows.map((row,index) => `<tr><td>${index+1}</td><td class="player-col"><span class="player-name">${escapeHTML(row.name)}</span></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td>${row.points}</td><td>${row.ppg.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function buildLiveTournamentAnalytics() {
    const allMatches = allCurrentMatches();
    const completed = allMatches.filter(matchComplete);
    const playerRows = new Map();
    const teamRows = new Map();
    const rivalryRows = new Map();
    const phaseOrder = { league: 1, gold: 2, silver: 3, knockout: 4, final: 5 };

    for (const p of filledParticipants()) {
      playerRows.set(p.id, { id: p.id, name: p.name.trim(), games:0,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0,cleanSheets:0,results:[],bestWin:null });
    }

    function ensurePlayer(id) {
      if (!playerRows.has(id)) playerRows.set(id, { id, name: playerName(id), games:0,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0,cleanSheets:0,results:[],bestWin:null });
      return playerRows.get(id);
    }

    function matchOrder(match, index = 0) {
      const timestamp = match.updatedAt ? Date.parse(match.updatedAt) : 0;
      const structural = (phaseOrder[match.phase] || 9) * 100000 + (Number(match.round) || 0) * 100 + index;
      return timestamp ? 1000000000000 + timestamp : structural;
    }

    completed.forEach((match, index) => {
      const home = ensurePlayer(match.homeId);
      const away = ensurePlayer(match.awayId);
      const winnerId = matchWinnerId(match);
      const isDraw = match.homeScore === match.awayScore && match.allowDraw;
      const order = matchOrder(match, index);
      const sides = [
        { row: home, id: match.homeId, gf: match.homeScore, ga: match.awayScore, opponent: away.name },
        { row: away, id: match.awayId, gf: match.awayScore, ga: match.homeScore, opponent: home.name }
      ];
      for (const side of sides) {
        side.row.games += 1; side.row.gf += side.gf; side.row.ga += side.ga;
        if (side.ga === 0) side.row.cleanSheets += 1;
        let result = "L";
        if (isDraw) { result = "D"; side.row.draws += 1; side.row.points += 1; }
        else if (winnerId === side.id) { result = "W"; side.row.wins += 1; side.row.points += 3; }
        else side.row.losses += 1;
        side.row.results.push({ result, gf:side.gf, ga:side.ga, opponent:side.opponent, stage:currentMatchStageLabel(match), order, updatedAt:match.updatedAt || null });
        if (result === "W") {
          const margin = side.gf - side.ga;
          if (!side.row.bestWin || margin > side.row.bestWin.margin || (margin === side.row.bestWin.margin && side.gf > side.row.bestWin.gf)) side.row.bestWin = { margin, gf:side.gf, ga:side.ga, opponent:side.opponent };
        }
      }

      const homeName = home.name; const awayName = away.name;
      const pairKey = rivalryKey(homeName, awayName);
      if (!rivalryRows.has(pairKey)) {
        const [playerA, playerB] = [homeName, awayName].sort((a,b)=>a.localeCompare(b,"tr"));
        rivalryRows.set(pairKey, { playerA, playerB, meetings:0,winsA:0,winsB:0,draws:0,goalsA:0,goalsB:0 });
      }
      const rivalry = rivalryRows.get(pairKey);
      rivalry.meetings += 1;
      rivalry.goalsA += rivalry.playerA === homeName ? match.homeScore : match.awayScore;
      rivalry.goalsB += rivalry.playerB === awayName ? match.awayScore : match.homeScore;
      if (isDraw) rivalry.draws += 1;
      else if (playerName(winnerId) === rivalry.playerA) rivalry.winsA += 1;
      else rivalry.winsB += 1;

      const teamSides = [
        { name:normalizeTeamName(match.homeTeam), player:homeName, gf:match.homeScore, ga:match.awayScore, id:match.homeId },
        { name:normalizeTeamName(match.awayTeam), player:awayName, gf:match.awayScore, ga:match.homeScore, id:match.awayId }
      ];
      for (const side of teamSides) {
        if (!side.name) continue;
        if (!teamRows.has(side.name)) teamRows.set(side.name, { name:side.name,games:0,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0,players:new Set() });
        const team = teamRows.get(side.name);
        team.games += 1; team.gf += side.gf; team.ga += side.ga; team.players.add(side.player);
        if (isDraw) { team.draws += 1; team.points += 1; }
        else if (winnerId === side.id) { team.wins += 1; team.points += 3; }
        else team.losses += 1;
      }
    });

    const officialMap = new Map();
    if (state.current.phase2.generated) {
      phase2Standings("gold").forEach((row,index)=>officialMap.set(row.id, `Altın Grup #${index+1}`));
      phase2Standings("silver").forEach((row,index)=>officialMap.set(row.id, `Gümüş Grup #${index+1}`));
      state.current.phase2.eliminatedIds.forEach((id,index)=>officialMap.set(id, `League Phase #${13+index}`));
    } else {
      leagueStandings().forEach((row,index)=>officialMap.set(row.id, `League Phase #${index+1}`));
    }

    const players = [...playerRows.values()].map(row => {
      row.gd = row.gf - row.ga;
      row.ppg = row.games ? row.points / row.games : 0;
      row.winRate = row.games ? row.wins / row.games * 100 : 0;
      row.avgGoals = row.games ? row.gf / row.games : 0;
      row.gaPerGame = row.games ? row.ga / row.games : 0;
      row.results.sort((a,b)=>a.order-b.order);
      row.form = row.results.slice(-5).map(item=>item.result);
      row.formPoints = row.form.reduce((sum,result)=>sum + (result === "W" ? 3 : result === "D" ? 1 : 0), 0);
      const reverse = [...row.results].reverse();
      row.currentWinStreak = reverse.findIndex(item=>item.result !== "W");
      if (row.currentWinStreak === -1) row.currentWinStreak = reverse.length;
      row.currentUnbeatenStreak = reverse.findIndex(item=>item.result === "L");
      if (row.currentUnbeatenStreak === -1) row.currentUnbeatenStreak = reverse.length;
      const latest = reverse[0]?.result || "–";
      const streakCount = latest === "W" ? row.currentWinStreak : latest === "L" ? (()=>{ const i=reverse.findIndex(item=>item.result!=="L"); return i===-1?reverse.length:i; })() : (()=>{ const i=reverse.findIndex(item=>item.result!=="D"); return i===-1?reverse.length:i; })();
      row.currentStreakLabel = latest === "W" ? `${streakCount}G seri` : latest === "L" ? `${streakCount}M seri` : latest === "D" ? `${streakCount}B seri` : "Maç bekleniyor";
      row.officialPosition = officialMap.get(row.id) || "FIFA 9";
      return row;
    }).sort((a,b)=>b.points-a.points || b.gd-a.gd || b.gf-a.gf || b.wins-a.wins || a.name.localeCompare(b.name,"tr")).map((row,index)=>({ ...row, rank:index+1 }));

    const teams = [...teamRows.values()].map(team => ({ ...team, gd:team.gf-team.ga, ppg:team.games?team.points/team.games:0, winRate:team.games?team.wins/team.games*100:0, playersCount:team.players.size })).sort((a,b)=>b.games-a.games || b.points-a.points || b.gd-a.gd || a.name.localeCompare(b.name,"tr"));
    const rivalries = [...rivalryRows.values()].map(row => ({ ...row, leader:row.winsA===row.winsB?"":row.winsA>row.winsB?row.playerA:row.playerB })).sort((a,b)=>b.meetings-a.meetings || Math.abs(b.winsA-b.winsB)-Math.abs(a.winsA-a.winsB));

    const decoratedMatches = allMatches.map((match,index)=>({
      match,
      order:matchOrder(match,index),
      stage:currentMatchStageLabel(match),
      homeName:playerName(match.homeId), awayName:playerName(match.awayId), homeTeam:match.homeTeam||"", awayTeam:match.awayTeam||"",
      homeScore:match.homeScore, awayScore:match.awayScore, winnerName:matchComplete(match)&&matchWinnerId(match)?playerName(matchWinnerId(match)):"",
      totalGoals:matchComplete(match)?match.homeScore+match.awayScore:0, margin:matchComplete(match)?Math.abs(match.homeScore-match.awayScore):0
    }));
    const completedDecorated = decoratedMatches.filter(item=>matchComplete(item.match));

    function seriesEndedUnused(match) {
      if (!match.seriesKey) return false;
      const series = state.current.knockout[match.seriesKey];
      return Boolean(seriesWinner(series) && !matchComplete(match));
    }
    const activeFixtures = decoratedMatches.filter(item=>!seriesEndedUnused(item.match));
    const upcomingMatches = activeFixtures.filter(item=>!matchComplete(item.match) && item.match.homeId && item.match.awayId).sort((a,b)=>a.order-b.order).slice(0,10);
    const recentMatches = completedDecorated.sort((a,b)=>b.order-a.order).slice(0,10);

    const stages = [
      { key:"league", label:"League Phase", matches:leagueMatches() },
      { key:"gold", label:"Altın Grup", matches:goldMatches() },
      { key:"silver", label:"Gümüş Grup", matches:silverMatches() },
      { key:"knockout", label:"Eleme Serileri", matches:allKnockoutGames().filter(m=>m.phase==="knockout") },
      { key:"final", label:"Büyük Final", matches:allKnockoutGames().filter(m=>m.phase==="final") }
    ].map(stage => {
      const valid = stage.matches.filter(match=>!seriesEndedUnused(match));
      const done = valid.filter(matchComplete);
      return { ...stage, total:valid.length, completed:done.length, goals:done.reduce((sum,m)=>sum+m.homeScore+m.awayScore,0) };
    });

    const maxBy = (rows, selector, filter=()=>true) => {
      const list = rows.filter(filter);
      return list.length ? [...list].sort((a,b)=>selector(b)-selector(a) || b.games-a.games || a.name.localeCompare(b.name,"tr"))[0] : null;
    };
    const biggestWin = completedDecorated.filter(item=>item.margin>0).sort((a,b)=>b.margin-a.margin || b.totalGoals-a.totalGoals)[0] || null;
    const highestScoringMatch = completedDecorated.sort((a,b)=>b.totalGoals-a.totalGoals || b.margin-a.margin)[0] || null;
    const lastUpdated = completedDecorated.map(item=>item.match.updatedAt).filter(Boolean).sort().at(-1) || cloudUpdatedAt || null;

    return {
      players, teams, rivalries, recentMatches, upcomingMatches, stages,
      records: {
        pointsLeader:maxBy(players,row=>row.points,row=>row.games>0),
        winsLeader:maxBy(players,row=>row.wins,row=>row.games>0),
        goalLeader:maxBy(players,row=>row.gf,row=>row.games>0),
        defenseLeader:[...players].filter(row=>row.games>=3).sort((a,b)=>a.gaPerGame-b.gaPerGame || b.games-a.games)[0] || null,
        formLeader:maxBy(players,row=>row.formPoints,row=>row.games>0),
        winStreakLeader:maxBy(players,row=>row.currentWinStreak,row=>row.games>0),
        unbeatenLeader:maxBy(players,row=>row.currentUnbeatenStreak,row=>row.games>0),
        biggestWin, highestScoringMatch,
        mostUsedTeam:teams[0] || null,
        topRivalry:rivalries[0] || null
      },
      summary: {
        completed:completedDecorated.length,
        totalFixtures:activeFixtures.length,
        goals:completedDecorated.reduce((sum,item)=>sum+item.totalGoals,0),
        avgGoals:completedDecorated.length?completedDecorated.reduce((sum,item)=>sum+item.totalGoals,0)/completedDecorated.length:0,
        draws:completed.filter(match=>match.homeScore===match.awayScore&&match.allowDraw).length,
        lastUpdated
      }
    };
  }

  async function shareLiveStatistics() {
    const analytics = buildLiveTournamentAnalytics();
    const leader = analytics.records.pointsLeader;
    const scorer = analytics.records.goalLeader;
    const team = analytics.records.mostUsedTeam;
    const biggest = analytics.records.biggestWin;
    const lines = [
      "FIFA 9 · CANLI TURNUVA STATS",
      `${analytics.summary.completed}/${analytics.summary.totalFixtures} maç · ${analytics.summary.goals} gol · ${analytics.summary.avgGoals.toFixed(2)} gol/maç`,
      leader ? `Performans lideri: ${leader.name} (${leader.points} puan)` : "Performans lideri: henüz belirlenmedi",
      scorer ? `Gol lideri: ${scorer.name} (${scorer.gf} gol)` : "Gol lideri: henüz belirlenmedi",
      team ? `En çok seçilen takım: ${team.name} (${team.games} seçim)` : "Takım verisi: bekleniyor",
      biggest ? `En farklı skor: ${biggest.homeName} ${biggest.homeScore}-${biggest.awayScore} ${biggest.awayName}` : "En farklı skor: bekleniyor",
      window.location.href
    ];
    const shareData = { title:"FIFA 9 Live Stats", text:lines.join("\n"), url:window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }

  function renderFormCentre() {
    const analytics = buildFormAnalytics(formWindowSize, formScope);
    if (!analytics.players.length) {
      view.innerHTML = emptyState("↗", "Form Verisi Hazır Değil", "Oyuncuların maç geçmişi oluştuğunda Son 20 Maç Form Merkezi otomatik olarak çalışacak.", canEdit() ? `<button class="btn btn-gold" data-nav="setup">Oyuncuları Aç</button>` : "");
      return;
    }
    ensureFormSelection(analytics);
    const selected = analytics.playerMap.get(selectedFormPlayerName) || analytics.players[0];
    const leader = analytics.records.leader;
    const hottest = analytics.records.hottest;
    const unbeaten = analytics.records.unbeaten;
    const momentum = analytics.records.momentum;

    view.innerHTML = `
      <div class="group-banner form-banner">
        <div>
          <div class="eyebrow">FORM & MOMENTUM LAB</div>
          <h2>Son ${formWindowSize} Maç Form Merkezi</h2>
          <p>Oyuncuların en güncel ${formWindowSize} maçına göre hesaplanan bağımsız form puan durumu, performans endeksi, seri analizi ve maç maç form çizgisi. FIFA 9 sonuçları girildikçe otomatik yenilenir.</p>
          <div class="live-banner-actions"><button class="btn btn-gold" data-action="share-form-stats">Form Tablosunu Paylaş</button><button class="btn btn-ghost" data-nav="livestats">Canlı İstatistiklere Git</button></div>
        </div>
        <div class="form-orb"><strong>${leader?.formIndex || 0}</strong><span>Form Gücü</span><small>${escapeHTML(leader?.name || "–")}</small></div>
      </div>

      <section class="panel form-control-panel">
        <div class="form-control-row">
          <div><div class="panel-title">Analiz Penceresi</div><div class="panel-subtitle">Son 5, 10 veya 20 maçlık güncel görünüm.</div></div>
          <div class="segmented-control" role="group" aria-label="Form analiz penceresi">
            ${[5,10,20].map(size => `<button class="segment-btn ${formWindowSize === size ? "active" : ""}" data-action="set-form-window" data-form-window="${size}">Son ${size}</button>`).join("")}
          </div>
        </div>
        <div class="form-control-row second">
          <div><div class="panel-title">Oyuncu Havuzu</div><div class="panel-subtitle">FIFA 9 kadrosunu veya arşivdeki bütün oyuncuları karşılaştır.</div></div>
          <div class="segmented-control" role="group" aria-label="Oyuncu havuzu">
            <button class="segment-btn ${formScope === "current" ? "active" : ""}" data-action="set-form-scope" data-form-scope="current">FIFA 9 Kadrosu</button>
            <button class="segment-btn ${formScope === "all" ? "active" : ""}" data-action="set-form-scope" data-form-scope="all">Tüm Oyuncular</button>
          </div>
        </div>
      </section>

      <div class="kpi-grid">
        ${kpiCard(`Son ${formWindowSize} Lideri`, leader?.name || "–", leader ? `${leader.points} puan · ${leader.ppg.toFixed(2)} PPG · ${leader.formIndex}/100 form` : "Maç verisi bekleniyor")}
        ${kpiCard("Son 5'in En İyisi", hottest?.name || "–", hottest ? `${hottest.last5Points}/15 puan · ${hottest.last5Label}` : "Maç verisi bekleniyor")}
        ${kpiCard("Aktif Yenilmezlik", unbeaten?.name || "–", unbeaten ? `${unbeaten.currentUnbeatenStreak} maç · ${unbeaten.currentStreakLabel}` : "Maç verisi bekleniyor")}
        ${kpiCard("En Büyük Yükseliş", momentum?.name || "–", momentum ? `${momentum.momentum > 0 ? "+" : ""}${momentum.momentum} puan trendi · ${momentum.trendLabel}` : "Maç verisi bekleniyor")}
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Form Güç Kartları</h3><div class="panel-subtitle">Son ${formWindowSize} maç performansı. Kart seçerek detay panelini aç.</div></div><span class="badge badge-gold">${analytics.players.length} OYUNCU</span></div>
        <div class="form-card-grid">${analytics.players.map(renderFormPlayerCard).join("")}</div>
      </section>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Son ${formWindowSize} Maç Puan Durumu</h3><div class="panel-subtitle">Sadece seçilen form penceresindeki maçlar: galibiyet 3, beraberlik 1 puan.</div></div><span class="badge badge-blue">FORM TABLE</span></div>
          ${formStandingsTable(analytics.players)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Momentum Sıralaması</h3><div class="panel-subtitle">Son 5 maç ile önceki 5 maç arasındaki puan farkı.</div></div></div>
          <div class="momentum-list">${analytics.players.slice().sort((a,b)=>b.momentum-a.momentum || b.last5Points-a.last5Points || b.formIndex-a.formIndex).map(renderMomentumRow).join("")}</div>
          <div class="info-box mt-24"><strong>Form Gücü:</strong> PPG %70, son 5 maç %20 ve maç başı averaj %10 ağırlıkla 100 üzerinden hesaplanır.</div>
        </section>
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Oyuncu Form Dosyası</h3><div class="panel-subtitle">Seçilen oyuncunun maç maç form şeridi, seri durumu ve rakip detayları.</div></div>
          <label class="field inline-field form-player-select"><span>Oyuncu Seç</span><select id="formPlayerSelect">${analytics.players.map(row => `<option value="${escapeHTML(row.name)}" ${row.name === selected.name ? "selected" : ""}>${escapeHTML(row.name)}</option>`).join("")}</select></label>
        </div>
        ${renderFormPlayerDetail(selected, formWindowSize)}
      </section>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Form Rekorları</h3><div class="panel-subtitle">Seçili maç penceresinin öne çıkan performansları.</div></div></div>
          <div class="records-grid">
            ${renderFormRecordTile("En Çok Puan", analytics.records.leader, row => `${row.points} puan · ${row.games} maç`)}
            ${renderFormRecordTile("En İyi Hücum", analytics.records.attack, row => `${row.gf} gol · ${row.avgGoals.toFixed(2)} gol/maç`)}
            ${renderFormRecordTile("En İyi Averaj", analytics.records.goalDifference, row => `${formatGD(row.gd)} averaj · ${row.gf}-${row.ga}`)}
            ${renderFormRecordTile("En Sağlam Savunma", analytics.records.defense, row => `${row.gaPerGame.toFixed(2)} gol/maç · ${row.cleanSheets} clean sheet`)}
            ${renderFormRecordTile("Galibiyet Serisi", analytics.records.winStreak, row => `${row.currentWinStreak} maç üst üste`)}
            ${renderFormRecordTile("En Yüksek G%", analytics.records.winRate, row => `${row.winRate.toFixed(1)}% · ${row.wins}/${row.games}`)}
          </div>
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Form Haritası</h3><div class="panel-subtitle">Her satırda en eski maç solda, en güncel maç sağda.</div></div></div>
          <div class="form-heatmap">${analytics.players.map(renderFormHeatmapRow).join("")}</div>
        </section>
      </div>`;
  }

  function ensureFormSelection(analytics) {
    if (!selectedFormPlayerName || !analytics.playerMap.has(selectedFormPlayerName)) selectedFormPlayerName = analytics.players[0]?.name || "";
  }

  function renderFormPlayerCard(row) {
    const trendClass = row.trend === "up" ? "up" : row.trend === "down" ? "down" : "steady";
    return `<article class="form-player-card ${row.name === selectedFormPlayerName ? "active" : ""}" data-action="select-form-player" data-player-name="${escapeHTML(row.name)}">
      <div class="form-card-top"><div><span class="form-rank">#${row.rank}</span><h4>${escapeHTML(row.name)}</h4><small>${row.games}/${row.windowSize} maç kapsama</small></div><div class="form-index-ring" style="--form-value:${row.formIndex}"><strong>${row.formIndex}</strong><span>FORM</span></div></div>
      <div class="form-card-strip">${renderResultSquares(row.results, row.windowSize, false)}</div>
      <div class="form-card-stats"><div><span>P</span><strong>${row.points}</strong></div><div><span>PPG</span><strong>${row.ppg.toFixed(2)}</strong></div><div><span>AV</span><strong>${formatGD(row.gd)}</strong></div><div><span>G%</span><strong>${row.winRate.toFixed(0)}%</strong></div></div>
      <div class="form-card-footer"><span class="trend-pill ${trendClass}">${row.trendIcon} ${escapeHTML(row.trendLabel)}</span><span>${escapeHTML(row.currentStreakLabel)}</span></div>
    </article>`;
  }

  function formStandingsTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="player-col">Oyuncu</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>Form</th><th>Güç</th></tr></thead><tbody>${rows.map(row => `<tr data-action="select-form-player" data-player-name="${escapeHTML(row.name)}"><td>${row.rank}</td><td class="player-col"><span class="player-name">${escapeHTML(row.name)}</span><small class="table-subline">${row.games}/${row.windowSize} maç · ${escapeHTML(row.trendLabel)}</small></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td class="points-cell">${row.points}</td><td>${row.ppg.toFixed(2)}</td><td>${formHTML(row.results.slice(-5).map(item=>item.result))}</td><td><strong>${row.formIndex}</strong></td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderMomentumRow(row) {
    const maxWidth = 15;
    const recentWidth = Math.max(3, row.last5Points / maxWidth * 100);
    const previousWidth = Math.max(3, row.previous5Points / maxWidth * 100);
    const trendClass = row.trend === "up" ? "up" : row.trend === "down" ? "down" : "steady";
    return `<button class="momentum-row" data-action="select-form-player" data-player-name="${escapeHTML(row.name)}"><div class="momentum-player"><strong>${escapeHTML(row.name)}</strong><span>${row.last5Label}</span></div><div class="momentum-bars"><div><span>Önceki 5</span><i class="previous" style="width:${previousWidth}%"></i><b>${row.previous5Points}</b></div><div><span>Son 5</span><i class="recent" style="width:${recentWidth}%"></i><b>${row.last5Points}</b></div></div><div class="momentum-change ${trendClass}">${row.momentum > 0 ? "+" : ""}${row.momentum}</div></button>`;
  }

  function renderFormPlayerDetail(row, windowSize) {
    const favoriteTeam = row.favoriteTeam ? `${escapeHTML(row.favoriteTeam.name)} · ${row.favoriteTeam.games} kullanım` : "Takım verisi yok";
    return `<div class="form-detail-shell">
      <div class="form-detail-hero">
        <div class="form-detail-person"><span>#${row.rank}</span><h3>${escapeHTML(row.name)}</h3><p>Son ${windowSize} maç · ${row.points} puan · ${row.ppg.toFixed(2)} PPG · ${row.formIndex}/100 form gücü</p></div>
        <div class="form-detail-kpis"><div><span>Galibiyet</span><strong>${row.wins}</strong></div><div><span>Beraberlik</span><strong>${row.draws}</strong></div><div><span>Mağlubiyet</span><strong>${row.losses}</strong></div><div><span>Gol</span><strong>${row.gf}</strong></div><div><span>Averaj</span><strong>${formatGD(row.gd)}</strong></div><div><span>G%</span><strong>${row.winRate.toFixed(1)}%</strong></div></div>
      </div>
      <div class="form-detail-insights"><div><span>Trend</span><strong>${row.trendIcon} ${escapeHTML(row.trendLabel)}</strong></div><div><span>Aktif Seri</span><strong>${escapeHTML(row.currentStreakLabel)}</strong></div><div><span>Yenilmezlik</span><strong>${row.currentUnbeatenStreak} maç</strong></div><div><span>En Çok Kullanılan Takım</span><strong>${favoriteTeam}</strong></div><div><span>En Farklı Galibiyet</span><strong>${row.bestWin ? `${row.bestWin.gf}-${row.bestWin.ga} · ${escapeHTML(row.bestWin.opponent)}` : "–"}</strong></div><div><span>Son 5</span><strong>${row.last5Points}/15 puan</strong></div></div>
      <div class="form-timeline-wrap"><div class="panel-subtitle">Maç Maç Form Çizgisi</div><div class="form-timeline">${renderResultSquares(row.results, windowSize, true)}</div></div>
      ${formMatchesTable(row.results)}
    </div>`;
  }

  function renderResultSquares(results, windowSize, detailed) {
    const emptyCount = Math.max(0, windowSize - results.length);
    const empty = Array.from({length: emptyCount}, () => `<span class="result-square empty" title="Maç yok">–</span>`).join("");
    return empty + results.map(item => `<span class="result-square ${item.result.toLowerCase()}" title="${escapeHTML(`${item.stage} · ${item.opponent} · ${item.gf}-${item.ga}`)}">${detailed ? `<b>${item.result}</b><small>${item.gf}-${item.ga}</small>` : item.result}</span>`).join("");
  }

  function formMatchesTable(results) {
    if (!results.length) return `<div class="info-box mt-24">Henüz maç geçmişi yok.</div>`;
    return `<div class="table-wrap compact-table mt-24"><table><thead><tr><th>#</th><th>Edisyon</th><th>Aşama</th><th>Rakip</th><th>Takım</th><th>Skor</th><th>Sonuç</th></tr></thead><tbody>${[...results].reverse().map((item,index) => `<tr><td>${index+1}</td><td>${escapeHTML(item.editionLabel)}</td><td>${escapeHTML(item.stage)}</td><td class="player-col"><span class="player-name">${escapeHTML(item.opponent)}</span></td><td>${escapeHTML(item.team || "–")}</td><td>${item.gf}-${item.ga}</td><td><span class="form-result-badge ${item.result.toLowerCase()}">${item.result}</span></td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderFormRecordTile(label, row, metaFn) {
    if (!row) return `<div class="record-tile"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">–</div><div class="record-note">Kayıt oluşmadı.</div></div>`;
    return `<button class="record-tile form-record-tile" data-action="select-form-player" data-player-name="${escapeHTML(row.name)}"><div class="record-label">${escapeHTML(label)}</div><div class="record-value">${escapeHTML(row.name)}</div><div class="record-note">${escapeHTML(metaFn(row))}</div></button>`;
  }

  function renderFormHeatmapRow(row) {
    return `<button class="form-heatmap-row" data-action="select-form-player" data-player-name="${escapeHTML(row.name)}"><span class="form-heatmap-name">${escapeHTML(row.name)}</span><span class="form-heatmap-squares">${renderResultSquares(row.results, row.windowSize, false)}</span><strong>${row.points}</strong></button>`;
  }

  function buildFormAnalytics(windowSize = 20, scope = "current") {
    const history = buildFormMatchHistory();
    const allNames = new Set();
    history.forEach(match => { if (match.homeName) allNames.add(match.homeName); if (match.awayName) allNames.add(match.awayName); });
    const currentNames = filledParticipants().map(player => player.name.trim()).filter(Boolean);
    let names = scope === "current" && currentNames.length ? currentNames : [...allNames];
    names = [...new Set(names)].filter(name => name && !/^P\d+$/i.test(name));

    const players = names.map(name => {
      const matches = history.filter(match => match.homeName === name || match.awayName === name).sort((a,b)=>a.order-b.order).slice(-windowSize);
      const results = matches.map(match => {
        const isHome = match.homeName === name;
        const gf = isHome ? match.homeScore : match.awayScore;
        const ga = isHome ? match.awayScore : match.homeScore;
        const opponent = isHome ? match.awayName : match.homeName;
        const team = isHome ? match.homeTeam : match.awayTeam;
        let result = "D";
        if (match.winnerName) result = match.winnerName === name ? "W" : "L";
        else if (gf > ga) result = "W";
        else if (gf < ga) result = "L";
        return { result, gf, ga, opponent, team, stage:match.stage, edition:match.edition, editionLabel:match.editionLabel, order:match.order };
      });
      const row = { name, windowSize, results, games:results.length, wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0,cleanSheets:0,bestWin:null };
      const teamUse = new Map();
      for (const item of results) {
        row.gf += item.gf; row.ga += item.ga;
        if (item.ga === 0) row.cleanSheets += 1;
        if (item.result === "W") { row.wins += 1; row.points += 3; }
        else if (item.result === "D") { row.draws += 1; row.points += 1; }
        else row.losses += 1;
        if (item.result === "W") {
          const margin = item.gf - item.ga;
          if (!row.bestWin || margin > row.bestWin.margin || (margin === row.bestWin.margin && item.gf > row.bestWin.gf)) row.bestWin = { ...item, margin };
        }
        const normalized = normalizeTeamName(item.team);
        if (normalized) teamUse.set(normalized, (teamUse.get(normalized) || 0) + 1);
      }
      row.gd = row.gf - row.ga;
      row.ppg = row.games ? row.points / row.games : 0;
      row.winRate = row.games ? row.wins / row.games * 100 : 0;
      row.avgGoals = row.games ? row.gf / row.games : 0;
      row.gaPerGame = row.games ? row.ga / row.games : 0;
      const last5 = results.slice(-5);
      const previous5 = results.slice(-10,-5);
      const pointsOf = list => list.reduce((sum,item)=>sum+(item.result === "W" ? 3 : item.result === "D" ? 1 : 0),0);
      row.last5Points = pointsOf(last5);
      row.previous5Points = pointsOf(previous5);
      row.momentum = row.last5Points - row.previous5Points;
      row.trend = row.momentum >= 3 ? "up" : row.momentum <= -3 ? "down" : "steady";
      row.trendIcon = row.trend === "up" ? "▲" : row.trend === "down" ? "▼" : "◆";
      row.trendLabel = row.trend === "up" ? "Yükselişte" : row.trend === "down" ? "Düşüşte" : "Dengeli";
      row.last5Label = last5.length ? last5.map(item=>item.result).join("-") : "Maç bekleniyor";
      const reverse = [...results].reverse();
      const streak = (predicate) => { const index = reverse.findIndex(item=>!predicate(item)); return index === -1 ? reverse.length : index; };
      row.currentWinStreak = streak(item=>item.result === "W");
      row.currentUnbeatenStreak = streak(item=>item.result !== "L");
      const latest = reverse[0]?.result || "";
      const activeCount = latest ? streak(item=>item.result === latest) : 0;
      row.currentStreakLabel = latest === "W" ? `${activeCount} galibiyet` : latest === "D" ? `${activeCount} beraberlik` : latest === "L" ? `${activeCount} mağlubiyet` : "Maç bekleniyor";
      const gdPerGame = row.games ? row.gd / row.games : 0;
      const ppgScore = Math.min(70, Math.max(0, row.ppg / 3 * 70));
      const recentScore = Math.min(20, Math.max(0, row.last5Points / 15 * 20));
      const gdScore = Math.min(10, Math.max(0, ((gdPerGame + 1) / 2) * 10));
      row.formIndex = Math.round(ppgScore + recentScore + gdScore);
      const favorite = [...teamUse.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"tr"))[0];
      row.favoriteTeam = favorite ? { name:favorite[0], games:favorite[1] } : null;
      return row;
    }).filter(row => row.games > 0 || scope === "current")
      .sort((a,b)=>b.points-a.points || b.gd-a.gd || b.gf-a.gf || b.wins-a.wins || b.formIndex-a.formIndex || a.name.localeCompare(b.name,"tr"))
      .map((row,index)=>({ ...row, rank:index+1 }));

    const playerMap = new Map(players.map(row=>[row.name,row]));
    const maxBy = (selector, filter=()=>true) => {
      const list = players.filter(filter);
      return list.length ? [...list].sort((a,b)=>selector(b)-selector(a) || b.games-a.games || a.name.localeCompare(b.name,"tr"))[0] : null;
    };
    return {
      players,
      playerMap,
      records: {
        leader:maxBy(row=>row.points,row=>row.games>0),
        hottest:maxBy(row=>row.last5Points,row=>row.games>0),
        unbeaten:maxBy(row=>row.currentUnbeatenStreak,row=>row.games>0),
        momentum:maxBy(row=>row.momentum,row=>row.games>0),
        attack:maxBy(row=>row.gf,row=>row.games>0),
        goalDifference:maxBy(row=>row.gd,row=>row.games>0),
        defense:[...players].filter(row=>row.games>=Math.min(5,windowSize)).sort((a,b)=>a.gaPerGame-b.gaPerGame || b.games-a.games || a.name.localeCompare(b.name,"tr"))[0] || null,
        winStreak:maxBy(row=>row.currentWinStreak,row=>row.games>0),
        winRate:maxBy(row=>row.winRate,row=>row.games>=Math.min(5,windowSize))
      },
      summary:{ windowSize, scope, matches:history.length }
    };
  }

  function buildFormMatchHistory() {
    const historicalMatches = (historical.editions || []).flatMap(edition => (edition.matches || []).map((match,index) => ({
      id:`historical-${edition.edition}-${index+1}`,
      edition:edition.edition,
      editionLabel:`FIFA ${edition.edition}`,
      stage:historicalStageLabel(match.stage),
      homeName:String(match.p1 || "").trim(),
      awayName:String(match.p2 || "").trim(),
      homeTeam:match.t1 || "",
      awayTeam:match.t2 || "",
      homeScore:Number(match.s1),
      awayScore:Number(match.s2),
      winnerName:Number(match.s1) === Number(match.s2) ? "" : Number(match.s1) > Number(match.s2) ? match.p1 : match.p2,
      order:edition.edition * 1000000 + index + 1
    })));
    const currentCompleted = allCurrentMatches().filter(matchComplete);
    const phaseOrder = { league:1,gold:2,silver:3,knockout:4,final:5 };
    const currentMatches = currentCompleted.map((match,index) => {
      const time = match.updatedAt ? Date.parse(match.updatedAt) : 0;
      const structural = (phaseOrder[match.phase] || 9) * 100000 + (Number(match.round)||0) * 100 + index;
      return {
        id:match.id,
        edition:state.current.edition || 9,
        editionLabel:`FIFA ${state.current.edition || 9}`,
        stage:currentMatchStageLabel(match),
        homeName:playerName(match.homeId), awayName:playerName(match.awayId),
        homeTeam:match.homeTeam || "", awayTeam:match.awayTeam || "",
        homeScore:Number(match.homeScore), awayScore:Number(match.awayScore),
        winnerName:matchWinnerId(match) ? playerName(matchWinnerId(match)) : "",
        order:9000000 + (time ? time / 10000000000000 : structural)
      };
    }).sort((a,b)=>a.order-b.order).map((match,index)=>({ ...match, order:9000000+index+1 }));
    return [...historicalMatches, ...currentMatches];
  }

  async function shareFormStatistics() {
    const analytics = buildFormAnalytics(formWindowSize, formScope);
    const top = analytics.players.slice(0,5);
    const lines = [
      `FIFA 9 · SON ${formWindowSize} MAÇ FORM DURUMU`,
      ...top.map(row=>`#${row.rank} ${row.name} · ${row.points} puan · ${row.ppg.toFixed(2)} PPG · Form ${row.formIndex}/100 · ${row.last5Label}`),
      analytics.records.unbeaten ? `Yenilmezlik lideri: ${analytics.records.unbeaten.name} (${analytics.records.unbeaten.currentUnbeatenStreak} maç)` : "",
      window.location.href
    ].filter(Boolean);
    const shareData = { title:`FIFA 9 Son ${formWindowSize} Form`, text:lines.join("\n"), url:window.location.href };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
  }


  function oddsClamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function oddsSigmoid(value) {
    return 1 / (1 + Math.exp(-value));
  }

  function oddsStageKey(match) {
    if (match.phase === "final" || match.phase === "knockout") return "knockout";
    return match.phase || "league";
  }

  function oddsStageLabel(match) {
    if (match.phase === "league") return `League Phase · Tur ${match.round}`;
    if (match.phase === "gold") return `Altın Grup · Tur ${match.round}`;
    if (match.phase === "silver") return `Gümüş Grup · Tur ${match.round}`;
    if (match.phase === "final") return "Büyük Final";
    if (match.phase === "knockout") return currentMatchStageLabel(match);
    return currentMatchStageLabel(match);
  }

  function oddsSeriesEndedUnused(match) {
    if (!match?.seriesKey) return false;
    const series = state.current.knockout?.[match.seriesKey];
    return Boolean(seriesWinner(series) && !matchComplete(match));
  }

  function oddsAvailableFixtures() {
    const phaseOrder = { league: 1, gold: 2, silver: 3, knockout: 4, final: 5 };
    return allCurrentMatches()
      .filter(match => match?.homeId && match?.awayId && !matchComplete(match) && !oddsSeriesEndedUnused(match))
      .sort((a, b) => (phaseOrder[a.phase] || 99) - (phaseOrder[b.phase] || 99) || (Number(a.round) || 0) - (Number(b.round) || 0) || String(a.id).localeCompare(String(b.id)));
  }

  function oddsBlankForm(name) {
    return { name, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, ppg: 0, winRate: 0, avgGoals: 0, gaPerGame: 0, formIndex: 50, last5Points: 0, previous5Points: 0, momentum: 0, results: [], currentUnbeatenStreak: 0, currentWinStreak: 0 };
  }

  function oddsBuildContext() {
    const formAnalytics = buildFormAnalytics(20, "all");
    const careerRows = combinedAllTime();
    const currentAnalytics = buildLiveTournamentAnalytics();
    const unifiedMatches = buildUnifiedAllTimeMatches();
    return {
      formMap: formAnalytics.playerMap,
      careerMap: new Map(careerRows.map(row => [row.name, row])),
      currentMap: new Map(currentAnalytics.players.map(row => [row.name, row])),
      unifiedMatches
    };
  }

  function oddsRegression(value, coverage, neutral = 50) {
    const weight = oddsClamp(coverage, 0, 1);
    return neutral * (1 - weight) + value * weight;
  }

  function oddsPlayerProfile(name, context) {
    const form = context.formMap.get(name) || oddsBlankForm(name);
    const career = context.careerMap.get(name) || null;
    const current = context.currentMap.get(name) || null;

    const formCoverage = oddsClamp(form.games / 20, 0, 1);
    const careerGames = Number(career?.games) || 0;
    const careerCoverage = oddsClamp(careerGames / 30, 0, 1);
    const currentGames = Number(current?.games) || 0;
    const currentCoverage = oddsClamp(currentGames / 6, 0, 1);

    const formStrength = oddsRegression(Number(form.formIndex) || 0, formCoverage);
    const recentStrength = oddsRegression((Number(form.last5Points) || 0) / 15 * 100, oddsClamp(form.games / 5, 0, 1));
    const careerPpg = careerGames ? Number(career.points || 0) / careerGames : 1.5;
    const careerWinRate = careerGames ? Number(career.wins || 0) / careerGames * 100 : 50;
    const careerRaw = oddsClamp((careerPpg / 3 * 72) + (careerWinRate / 100 * 28), 0, 100);
    const careerStrength = oddsRegression(careerRaw, careerCoverage);
    const currentRaw = currentGames
      ? oddsClamp((Number(current.ppg || 0) / 3 * 70) + (Number(current.winRate || 0) / 100 * 20) + (50 + Math.tanh((Number(current.gd || 0) / currentGames) / 2) * 50) * .10, 0, 100)
      : 50;
    const currentStrength = oddsRegression(currentRaw, currentCoverage);

    const recentGdPerGame = form.games ? Number(form.gd || 0) / form.games : 0;
    const careerGdPerGame = careerGames ? Number(career.gd || 0) / careerGames : 0;
    const goalRaw = oddsClamp(50 + Math.tanh((recentGdPerGame * .7 + careerGdPerGame * .3) / 2) * 48, 0, 100);
    const goalCoverage = oddsClamp((form.games + Math.min(careerGames, 20)) / 35, 0, 1);
    const goalStrength = oddsRegression(goalRaw, goalCoverage);
    const momentumRaw = oddsClamp(50 + (Number(form.momentum) || 0) / 15 * 50, 0, 100);
    const momentumStrength = oddsRegression(momentumRaw, oddsClamp(form.games / 10, 0, 1));

    const strength = oddsClamp(
      formStrength * .36 +
      recentStrength * .14 +
      careerStrength * .20 +
      currentStrength * .14 +
      goalStrength * .10 +
      momentumStrength * .06,
      5,
      95
    );

    const recentDrawRate = form.games ? Number(form.draws || 0) / form.games : .15;
    const avgGoals = form.games ? Number(form.avgGoals || 0) : careerGames ? Number(career.gf || 0) / careerGames : 3;
    const gaPerGame = form.games ? Number(form.gaPerGame || 0) : careerGames ? Number(career.ga || 0) / careerGames : 3;
    const sampleScore = oddsClamp((Math.min(form.games, 20) / 20 * .48) + (Math.min(careerGames, 30) / 30 * .37) + (Math.min(currentGames, 6) / 6 * .15), 0, 1);

    return {
      name,
      form,
      career,
      current,
      strength,
      formStrength,
      recentStrength,
      careerStrength,
      currentStrength,
      goalStrength,
      momentumStrength,
      recentDrawRate,
      avgGoals,
      gaPerGame,
      sampleScore,
      formCoverage,
      careerCoverage,
      currentCoverage
    };
  }

  function oddsHeadToHead(nameA, nameB, matches) {
    const relevant = matches.filter(match =>
      (match.homeName === nameA && match.awayName === nameB) ||
      (match.homeName === nameB && match.awayName === nameA)
    );
    const row = { meetings: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0, edgeA: 0, latest: [] };
    for (const match of relevant) {
      row.meetings += 1;
      const isAHome = match.homeName === nameA;
      const gfA = isAHome ? Number(match.homeScore) : Number(match.awayScore);
      const gfB = isAHome ? Number(match.awayScore) : Number(match.homeScore);
      row.goalsA += gfA;
      row.goalsB += gfB;
      if (gfA > gfB) row.winsA += 1;
      else if (gfB > gfA) row.winsB += 1;
      else row.draws += 1;
      row.latest.push({ ...match, gfA, gfB });
    }
    row.latest = row.latest.slice(-5).reverse();
    if (row.meetings) {
      const resultEdge = (row.winsA - row.winsB) / Math.max(4, row.meetings) * 5;
      const goalEdge = (row.goalsA - row.goalsB) / Math.max(12, row.meetings * 3) * 2;
      row.edgeA = oddsClamp(resultEdge + goalEdge, -6, 6);
    }
    return row;
  }

  function oddsDecimal(probability, overround = 1.06) {
    return oddsClamp(1 / Math.max(.01, probability * overround), 1.12, 14.50);
  }

  function oddsConfidenceLabel(value) {
    if (value >= 78) return "Yüksek veri güveni";
    if (value >= 62) return "Orta veri güveni";
    return "Sınırlı veri güveni";
  }

  function oddsBuildReason(profileA, profileB, h2h, favoriteSide) {
    const fav = favoriteSide === "home" ? profileA : profileB;
    const dog = favoriteSide === "home" ? profileB : profileA;
    const h2hEdge = favoriteSide === "home" ? h2h.edgeA : -h2h.edgeA;
    const candidates = [
      { delta: fav.formStrength - dog.formStrength, text: "son 20 maç form gücü" },
      { delta: fav.recentStrength - dog.recentStrength, text: "son 5 maç performansı" },
      { delta: fav.careerStrength - dog.careerStrength, text: "tüm zamanlar verimliliği" },
      { delta: fav.currentStrength - dog.currentStrength, text: "FIFA 9 güncel performansı" },
      { delta: fav.goalStrength - dog.goalStrength, text: "gol ve averaj profili" },
      { delta: fav.momentumStrength - dog.momentumStrength, text: "momentum trendi" },
      { delta: h2hEdge * 3, text: "ikili rekabet üstünlüğü" }
    ].filter(item => item.delta > 2.5).sort((a, b) => b.delta - a.delta);
    if (!candidates.length) return "Model iki oyuncuyu birbirine yakın görüyor; küçük fark genel veri dengesiyle oluşuyor.";
    const reasons = candidates.slice(0, 2).map(item => item.text);
    return `${fav.name}, ${reasons.join(" ve ")} sayesinde model favorisi.`;
  }


  function advancedGlobalScoringEnvironment(context) {
    const matches = (context?.unifiedMatches || []).filter(match => Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)));
    const recent = matches.slice(-160);
    const sample = recent.length ? recent : matches;
    if (!sample.length) return { meanPerSide:3, meanTotal:6, varianceTotal:7, drawRate:.14, sample:0 };
    const totals = sample.map(match => Number(match.homeScore) + Number(match.awayScore));
    const meanTotal = totals.reduce((sum,value)=>sum+value,0) / totals.length;
    const varianceTotal = totals.reduce((sum,value)=>sum+Math.pow(value-meanTotal,2),0) / totals.length;
    const drawRate = sample.filter(match=>Number(match.homeScore)===Number(match.awayScore)).length / sample.length;
    return {
      meanPerSide:oddsClamp(meanTotal/2,1.6,5.8),
      meanTotal:oddsClamp(meanTotal,3.2,11.6),
      varianceTotal:oddsClamp(varianceTotal,2,28),
      drawRate:oddsClamp(drawRate,.04,.34),
      sample:sample.length
    };
  }

  function advancedWeightedRate(recentValue, recentGames, currentValue, currentGames, careerValue, careerGames, neutral) {
    const recentWeight = Math.min(1, Number(recentGames||0)/20) * .46;
    const currentWeight = Math.min(1, Number(currentGames||0)/6) * .24;
    const careerWeight = Math.min(1, Number(careerGames||0)/40) * .30;
    const used = recentWeight + currentWeight + careerWeight;
    const observed = used
      ? ((Number(recentValue)||neutral)*recentWeight + (Number(currentValue)||neutral)*currentWeight + (Number(careerValue)||neutral)*careerWeight) / used
      : neutral;
    const credibility = oddsClamp((Number(recentGames||0)+Math.min(18,Number(currentGames||0)*2)+Math.min(30,Number(careerGames||0))) / 60,0,1);
    return neutral*(1-credibility)+observed*credibility;
  }

  function advancedMatchGoalModel(home, away, h2h, match, context) {
    const env = advancedGlobalScoringEnvironment(context);
    const homeCareerGames = Number(home.career?.games)||0;
    const awayCareerGames = Number(away.career?.games)||0;
    const homeCurrentGames = Number(home.current?.games)||0;
    const awayCurrentGames = Number(away.current?.games)||0;
    const homeCareerGF = homeCareerGames ? Number(home.career?.gf||0)/homeCareerGames : env.meanPerSide;
    const awayCareerGF = awayCareerGames ? Number(away.career?.gf||0)/awayCareerGames : env.meanPerSide;
    const homeCareerGA = homeCareerGames ? Number(home.career?.ga||0)/homeCareerGames : env.meanPerSide;
    const awayCareerGA = awayCareerGames ? Number(away.career?.ga||0)/awayCareerGames : env.meanPerSide;
    const homeCurrentGF = homeCurrentGames ? Number(home.current?.gf||0)/homeCurrentGames : env.meanPerSide;
    const awayCurrentGF = awayCurrentGames ? Number(away.current?.gf||0)/awayCurrentGames : env.meanPerSide;
    const homeCurrentGA = homeCurrentGames ? Number(home.current?.ga||0)/homeCurrentGames : env.meanPerSide;
    const awayCurrentGA = awayCurrentGames ? Number(away.current?.ga||0)/awayCurrentGames : env.meanPerSide;

    const homeAttack = advancedWeightedRate(home.avgGoals,home.form?.games,homeCurrentGF,homeCurrentGames,homeCareerGF,homeCareerGames,env.meanPerSide);
    const awayAttack = advancedWeightedRate(away.avgGoals,away.form?.games,awayCurrentGF,awayCurrentGames,awayCareerGF,awayCareerGames,env.meanPerSide);
    const homeWeakness = advancedWeightedRate(home.gaPerGame,home.form?.games,homeCurrentGA,homeCurrentGames,homeCareerGA,homeCareerGames,env.meanPerSide);
    const awayWeakness = advancedWeightedRate(away.gaPerGame,away.form?.games,awayCurrentGA,awayCurrentGames,awayCareerGA,awayCareerGames,env.meanPerSide);

    const homeBase = Math.sqrt(Math.max(.12,homeAttack)*Math.max(.12,awayWeakness));
    const awayBase = Math.sqrt(Math.max(.12,awayAttack)*Math.max(.12,homeWeakness));
    const playerTempo = (homeAttack+homeWeakness+awayAttack+awayWeakness)/2;
    const h2hTempo = h2h.meetings ? (h2h.goalsA+h2h.goalsB)/h2h.meetings : env.meanTotal;
    const h2hWeight = oddsClamp(h2h.meetings/8,0,.38);
    let targetTotal = env.meanTotal*.35 + playerTempo*.47 + h2hTempo*h2hWeight*.18 + env.meanTotal*(1-h2hWeight)*.18;
    const phaseFactor = match?.phase === 'final' ? .91 : match?.phase === 'knockout' ? .95 : match?.phase === 'gold' || match?.phase === 'silver' ? .99 : 1.03;
    const averageMomentum = ((Number(home.form?.momentum)||0)+(Number(away.form?.momentum)||0))/30;
    const momentumTempo = 1 + oddsClamp(Math.abs(averageMomentum)*.055,0,.075);
    targetTotal = oddsClamp(targetTotal*phaseFactor*momentumTempo,2.6,11.8);

    const rawShare = homeBase/(homeBase+awayBase || 1);
    const strengthShare = oddsSigmoid((home.strength-away.strength+h2h.edgeA*1.2)/12.5);
    const share = oddsClamp(rawShare*.64+strengthShare*.36,.16,.84);
    let expectedHome = oddsClamp(targetTotal*share,.35,9.2);
    let expectedAway = oddsClamp(targetTotal*(1-share),.35,9.2);

    const observedVarianceRatio = env.varianceTotal / Math.max(1,env.meanTotal);
    const styleSpread = Math.abs((home.avgGoals+home.gaPerGame)-(away.avgGoals+away.gaPerGame));
    const dispersion = oddsClamp(5.5-observedVarianceRatio*.72-styleSpread*.10+(home.sampleScore+away.sampleScore)*.7,1.65,6.2);
    const tempoLabel = targetTotal >= 8.3 ? intelligenceCopy('Gol Fırtınası','Goal Storm') : targetTotal >= 6.7 ? intelligenceCopy('Açık Oyun','Open Game') : targetTotal <= 4.4 ? intelligenceCopy('Taktik Savaş','Tactical Battle') : intelligenceCopy('Dengeli Tempo','Balanced Tempo');
    const volatility = oddsClamp((1/dispersion)*100+Math.abs(home.form?.momentum||0)*1.3+Math.abs(away.form?.momentum||0)*1.3,18,88);
    return { expectedHome, expectedAway, expectedTotal:expectedHome+expectedAway, dispersion, tempoLabel, volatility, environment:env, homeAttack,awayAttack,homeWeakness,awayWeakness };
  }

  function simulationLogGamma(z) {
    const coefficients=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-0.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
    if (z<.5) return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-simulationLogGamma(1-z);
    z-=1;
    let x=.99999999999980993;
    for(let i=0;i<coefficients.length;i++) x+=coefficients[i]/(z+i+1);
    const t=z+coefficients.length-.5;
    return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }

  function simulationNegativeBinomialPmf(score, mean, dispersion) {
    const x=Math.max(0,Math.floor(Number(score)||0));
    const mu=Math.max(.02,Number(mean)||0);
    const k=Math.max(.45,Number(dispersion)||2.5);
    const p=k/(k+mu);
    const logP=simulationLogGamma(x+k)-simulationLogGamma(k)-simulationLogGamma(x+1)+k*Math.log(p)+x*Math.log(1-p);
    return Math.exp(logP);
  }

  function simulationOutcomeOfScore(homeScore,awayScore) {
    return homeScore>awayScore?'home':awayScore>homeScore?'away':'draw';
  }

  function simulationBuildScoreDistribution(model, allowDraw=true, phase='league') {
    const maxScore=Math.max(10,Math.min(15,Math.ceil(Math.max(model.expectedHome||3,model.expectedAway||3)+6)));
    const homePmf=[],awayPmf=[];
    for(let score=0;score<=maxScore;score++) {
      homePmf.push(simulationNegativeBinomialPmf(score,model.expectedHome,model.dispersion));
      awayPmf.push(simulationNegativeBinomialPmf(score,model.expectedAway,model.dispersion));
    }
    const rows=[];
    const rawMass={home:0,draw:0,away:0};
    for(let h=0;h<=maxScore;h++) for(let a=0;a<=maxScore;a++) {
      const outcome=simulationOutcomeOfScore(h,a);
      if(!allowDraw && outcome==='draw') continue;
      let correlation=1;
      if(h===0&&a===0) correlation=.82;
      else if(h===1&&a===1) correlation=1.08;
      else if((h===1&&a===0)||(h===0&&a===1)) correlation=.92;
      if(phase==='final' && h+a<=3) correlation*=1.08;
      const raw=homePmf[h]*awayPmf[a]*correlation;
      rows.push({homeScore:h,awayScore:a,outcome,raw});
      rawMass[outcome]+=raw;
    }
    const targets={
      home:Number(model.market?.home?.probability)||.34,
      draw:allowDraw?(Number(model.market?.draw?.probability)||.32):0,
      away:Number(model.market?.away?.probability)||.34
    };
    if(!allowDraw) {
      const total=targets.home+targets.away||1;
      targets.home/=total; targets.away/=total;
    }
    const factors={home:targets.home/Math.max(1e-9,rawMass.home),draw:allowDraw?targets.draw/Math.max(1e-9,rawMass.draw):0,away:targets.away/Math.max(1e-9,rawMass.away)};
    let total=0;
    rows.forEach(row=>{ row.probability=row.raw*factors[row.outcome]; total+=row.probability; });
    rows.forEach(row=>{ row.probability/=total||1; });
    rows.sort((a,b)=>b.probability-a.probability || Math.abs((a.homeScore+a.awayScore)-(model.expectedHome+model.expectedAway))-Math.abs((b.homeScore+b.awayScore)-(model.expectedHome+model.expectedAway)));
    return rows;
  }

  function simulationMostLikelyScore(distribution, preferredOutcome='') {
    const pool=preferredOutcome?distribution.filter(row=>row.outcome===preferredOutcome):distribution;
    return pool[0]||distribution[0]||{homeScore:0,awayScore:0,probability:0,outcome:'draw'};
  }

  function buildMatchOdds(match, context) {
    const homeName = playerName(match.homeId);
    const awayName = playerName(match.awayId);
    const home = oddsPlayerProfile(homeName, context);
    const away = oddsPlayerProfile(awayName, context);
    const h2h = oddsHeadToHead(homeName, awayName, context.unifiedMatches);

    const adjustedHomeStrength = oddsClamp(home.strength + h2h.edgeA, 1, 99);
    const adjustedAwayStrength = oddsClamp(away.strength - h2h.edgeA, 1, 99);
    const difference = adjustedHomeStrength - adjustedAwayStrength;
    const closeness = 1 - oddsClamp(Math.abs(difference) / 32, 0, 1);
    const empiricalDraw = (home.recentDrawRate + away.recentDrawRate) / 2;
    const h2hDrawRate = h2h.meetings ? h2h.draws / h2h.meetings : .15;
    let drawProbability = oddsClamp(.105 + closeness * .105 + empiricalDraw * .20 + h2hDrawRate * .045, .10, .30);
    const homeShare = oddsSigmoid(difference / 10.5);
    let homeProbability = (1 - drawProbability) * homeShare;
    let awayProbability = (1 - drawProbability) * (1 - homeShare);

    homeProbability = Math.max(.065, homeProbability);
    awayProbability = Math.max(.065, awayProbability);
    drawProbability = Math.max(.09, drawProbability);
    const total = homeProbability + drawProbability + awayProbability;
    homeProbability /= total;
    drawProbability /= total;
    awayProbability /= total;

    const favoriteSide = homeProbability >= awayProbability ? "home" : "away";
    const favorite = favoriteSide === "home" ? home : away;
    const underdog = favoriteSide === "home" ? away : home;
    const favoriteProbability = Math.max(homeProbability, awayProbability);
    const underdogProbability = Math.min(homeProbability, awayProbability);
    const sample = (home.sampleScore + away.sampleScore) / 2;
    const confidence = Math.round(oddsClamp(46 + sample * 30 + Math.min(Math.abs(difference), 22) * .75 - closeness * 4, 45, 92));

    const goalModel = advancedMatchGoalModel(home, away, h2h, match, context);
    const expectedHome = goalModel.expectedHome;
    const expectedAway = goalModel.expectedAway;

    const market = {
      home: { probability: homeProbability, odds: oddsDecimal(homeProbability) },
      draw: { probability: drawProbability, odds: oddsDecimal(drawProbability) },
      away: { probability: awayProbability, odds: oddsDecimal(awayProbability) }
    };
    const scoreDistribution = simulationBuildScoreDistribution({ market, expectedHome, expectedAway, dispersion:goalModel.dispersion }, match.allowDraw !== false, match.phase);
    const marketOutcome = homeProbability >= drawProbability && homeProbability >= awayProbability ? "home" : awayProbability >= homeProbability && awayProbability >= drawProbability ? "away" : "draw";
    const modalScore = simulationMostLikelyScore(scoreDistribution, marketOutcome);
    const predictedHome = modalScore.homeScore;
    const predictedAway = modalScore.awayScore;
    const isBalanced = Math.abs(homeProbability - awayProbability) <= .08;
    const strongFavorite = favoriteProbability >= .62;
    const surprisePotential = favoriteProbability >= .54 && underdogProbability >= .25;
    const reason = oddsBuildReason(home, away, h2h, favoriteSide);
    const activeLive = getActiveLive();

    return {
      match,
      id: match.id,
      stage: oddsStageLabel(match),
      phaseKey: oddsStageKey(match),
      home,
      away,
      h2h,
      difference,
      market,
      favoriteSide,
      favorite,
      underdog,
      favoriteProbability,
      underdogProbability,
      confidence,
      confidenceLabel: oddsConfidenceLabel(confidence),
      predictedHome,
      predictedAway,
      expectedHome,
      expectedAway,
      expectedTotal:goalModel.expectedTotal,
      dispersion:goalModel.dispersion,
      tempoLabel:goalModel.tempoLabel,
      volatility:goalModel.volatility,
      scoreDistribution,
      scorelineProbability:modalScore.probability,
      reason,
      isBalanced,
      strongFavorite,
      surprisePotential,
      isLive: activeLive?.match?.id === match.id,
      overround: 1.06
    };
  }

  function buildOddsAnalytics() {
    const context = oddsBuildContext();
    const fixtures = oddsAvailableFixtures().map(match => buildMatchOdds(match, context));
    const strongest = fixtures.length ? [...fixtures].sort((a, b) => b.favoriteProbability - a.favoriteProbability)[0] : null;
    const balanced = fixtures.length ? [...fixtures].sort((a, b) => Math.abs(a.market.home.probability - a.market.away.probability) - Math.abs(b.market.home.probability - b.market.away.probability))[0] : null;
    const drawMatch = fixtures.length ? [...fixtures].sort((a, b) => b.market.draw.probability - a.market.draw.probability)[0] : null;
    const surprise = fixtures.filter(item => item.surprisePotential).sort((a, b) => b.underdogProbability - a.underdogProbability || b.favoriteProbability - a.favoriteProbability)[0] || balanced;
    return { context, fixtures, strongest, balanced, drawMatch, surprise };
  }

  function oddsPercent(value) {
    return `${Math.round(Number(value || 0) * 100)}%`;
  }

  function oddsFormStrip(profile) {
    const results = profile.form?.results || [];
    if (!results.length) return `<span class="odds-no-form">Veri bekleniyor</span>`;
    return renderResultSquares(results.slice(-5), 5, false);
  }

  function renderOddsMarketBox(code, item, active = false) {
    return `<div class="odds-market-box ${active ? "favorite" : ""}"><span>${escapeHTML(code)}</span><strong>${item.odds.toFixed(2)}</strong><small>${oddsPercent(item.probability)}</small></div>`;
  }


  function renderCommunityPollShell(matchId, homeName, awayName, isOpen = true, compact = false, modelFavorite = "") {
    return `<section class="community-poll ${compact ? "compact" : ""}" data-community-poll data-match-id="${escapeHTML(matchId)}" data-home-name="${escapeHTML(homeName)}" data-away-name="${escapeHTML(awayName)}" data-community-open="${isOpen ? "true" : "false"}" data-model-favorite="${escapeHTML(modelFavorite)}">
      <div class="community-poll-head"><div><span>${isOpen ? "TOPLULUK TAHMİNİ" : "KAPANIŞ OYLAMASI"}</span><strong>${isOpen ? "Sence kim kazanır?" : "Maç öncesi topluluk ne dedi?"}</strong></div><div class="community-vote-total" data-vote-total>0 OY</div></div>
      <div class="community-vote-buttons">
        <button type="button" data-community-vote="home" ${isOpen ? "" : "disabled"}><span>1</span><strong>${escapeHTML(homeName)}</strong><small data-vote-pct="home">0%</small></button>
        <button type="button" data-community-vote="draw" ${isOpen ? "" : "disabled"}><span>X</span><strong>Beraberlik</strong><small data-vote-pct="draw">0%</small></button>
        <button type="button" data-community-vote="away" ${isOpen ? "" : "disabled"}><span>2</span><strong>${escapeHTML(awayName)}</strong><small data-vote-pct="away">0%</small></button>
      </div>
      <div class="community-vote-rail"><i class="home" data-vote-bar="home" style="width:0%"></i><i class="draw" data-vote-bar="draw" style="width:0%"></i><i class="away" data-vote-bar="away" style="width:0%"></i></div>
      <div class="community-poll-foot"><span data-community-verdict>${isOpen ? "Oylar canlı olarak güncellenir." : "Oylama maç başladığında kapandı."}</span><small data-community-status>${isOpen ? "Cihaz başına bir oy; maç başlayana kadar değiştirilebilir." : "Kapanış dağılımı"}</small></div>
    </section>`;
  }

  function archivedMatchRows() {
    const archive = getMatchArchiveState();
    return allCurrentMatches().filter(matchComplete).map(match => {
      const saved = archive[match.id] || null;
      return {
        match,
        saved,
        homeName: playerName(match.homeId),
        awayName: playerName(match.awayId),
        completedAt: saved?.result?.completedAt || match.updatedAt || "",
        hasOdds: Boolean(saved?.odds?.capturedAt && !saved?.odds?.unavailable),
        hasLive: Boolean(saved?.live?.events || getLiveState().archive?.[match.id]?.events)
      };
    }).sort((a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")));
  }

  function archivedPredictionOutcome(row) {
    const { match, saved } = row;
    if (!saved?.odds || saved.odds.unavailable) return { label: "ORAN SNAPSHOT YOK", className: "missing" };
    const actual = Number(match.homeScore) > Number(match.awayScore) ? "home" : Number(match.awayScore) > Number(match.homeScore) ? "away" : "draw";
    const favorite = saved.odds.favoriteSide || (saved.odds.homeProbability >= saved.odds.awayProbability ? "home" : "away");
    if (actual === favorite) return { label: "MODEL DOĞRU", className: "correct" };
    if (actual === "draw") return { label: "BERABERLİK", className: "draw" };
    return { label: "SÜRPRİZ SONUÇ", className: "upset" };
  }

  function renderArchivedOddsCard(row) {
    const { match, saved, homeName, awayName } = row;
    const outcome = archivedPredictionOutcome(row);
    const odds = saved?.odds;
    const liveEvents = saved?.live?.events || getLiveState().archive?.[match.id]?.events || [];
    const actualOutcome = Number(match.homeScore) > Number(match.awayScore) ? "home" : Number(match.awayScore) > Number(match.homeScore) ? "away" : "draw";
    const modelOutcome = saved?.odds?.favoriteSide || "";
    return `<article class="match-archive-card" data-archive-match data-match-id="${escapeHTML(match.id)}" data-actual-outcome="${actualOutcome}" data-model-outcome="${escapeHTML(modelOutcome)}" data-match-label="${escapeHTML(`${homeName} vs ${awayName}`)}">
      <header><div><span>${escapeHTML(currentMatchStageLabel(match))}</span><small>${row.completedAt ? new Date(row.completedAt).toLocaleString("tr-TR", { dateStyle:"short", timeStyle:"short" }) : ""}</small></div><b class="archive-outcome ${outcome.className}">${outcome.label}</b></header>
      <div class="archive-result-line"><strong>${escapeHTML(homeName)}</strong><b>${match.homeScore}–${match.awayScore}</b><strong>${escapeHTML(awayName)}</strong></div>
      ${odds && !odds.unavailable ? `<div class="archive-odds-strip"><div><span>1</span><strong>${Number(odds.homeOdds).toFixed(2)}</strong><small>${oddsPercent(odds.homeProbability)}</small></div><div><span>X</span><strong>${Number(odds.drawOdds).toFixed(2)}</strong><small>${oddsPercent(odds.drawProbability)}</small></div><div><span>2</span><strong>${Number(odds.awayOdds).toFixed(2)}</strong><small>${oddsPercent(odds.awayProbability)}</small></div></div>` : `<div class="archive-missing-odds">Bu maç v22 oran snapshot sistemi devreye alınmadan önce tamamlandı.</div>`}
      <div class="archive-meta-grid"><div><span>Model skoru</span><strong>${odds && !odds.unavailable ? `${odds.predictedHome}-${odds.predictedAway}` : "—"}</strong></div><div><span>Model favorisi</span><strong>${escapeHTML(odds?.favoriteName || "—")}</strong></div><div><span>Canlı yayın</span><strong>${liveEvents.length ? `${liveEvents.length} olay` : "Yok"}</strong></div></div>
      ${renderCommunityPollShell(match.id, homeName, awayName, false, true, odds?.favoriteSide || "")}
      <button class="btn btn-ghost btn-wide" data-action="open-match-archive-details" data-match-id="${escapeHTML(match.id)}">Maç Detaylarını Aç</button>
    </article>`;
  }

  function renderMatchArchiveSection() {
    const rows = archivedMatchRows();
    if (!rows.length) return `<section class="panel mt-24"><div class="panel-header"><div><h3 class="panel-title">Maç Oranı ve Canlı Yayın Arşivi</h3><div class="panel-subtitle">Tamamlanan maçların oran snapshot'ları ve canlı yayın kayıtları burada tutulur.</div></div><span class="badge">0 MAÇ</span></div><div class="info-box">Henüz tamamlanmış maç bulunmuyor.</div></section>`;
    const withOdds = rows.filter(row => row.hasOdds).length;
    const liveCount = rows.filter(row => row.hasLive).length;
    return `<section class="match-archive-section mt-24">
      <div class="match-archive-hero"><div><div class="eyebrow">FIFA 9 · MATCH ARCHIVE v22</div><h3>Oran, Topluluk ve Canlı Yayın Arşivi</h3><p>Maç başlamadan önceki oranlar sabitlenir; gerçek sonuç, kapanış oylaması ve canlı yayın zaman çizelgesiyle aynı kayıtta saklanır.</p></div><div class="archive-kpis"><div><strong>${rows.length}</strong><span>Tamamlanan</span></div><div><strong>${withOdds}</strong><span>Oran Snapshot</span></div><div><strong>${liveCount}</strong><span>Canlı Yayın</span></div></div></div>
      <div class="community-global-summary" data-v22-global-summary><article><span>Toplam Topluluk Oyu</span><strong>—</strong><small>Yükleniyor</small></article><article><span>Model Doğruluğu</span><strong>—</strong><small>Snapshot maçları</small></article><article><span>Topluluk Doğruluğu</span><strong>—</strong><small>Kapanan oylamalar</small></article><article><span>En Çok Oy Alan Maç</span><strong>—</strong><small>Topluluk ilgisi</small></article></div>
      <div class="match-archive-grid">${rows.slice(0, 24).map(renderArchivedOddsCard).join("")}</div>
    </section>`;
  }

  function openMatchArchiveDetails(matchId) {
    const match = findMatch(matchId);
    if (!match || !matchComplete(match)) { toast("Maç arşiv kaydı bulunamadı.", "error"); return; }
    const saved = getMatchArchiveState()[matchId] || null;
    const archivedLive = saved?.live || getLiveState().archive?.[matchId] || null;
    const odds = saved?.odds || null;
    const homeName = playerName(match.homeId), awayName = playerName(match.awayId);
    const events = [...(archivedLive?.events || [])].sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0)||String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
    const outcome = archivedPredictionOutcome({ match, saved });
    openModal(`${homeName} ${match.homeScore}–${match.awayScore} ${awayName}`, `
      <div class="archive-detail-hero"><div><span>${escapeHTML(currentMatchStageLabel(match))}</span><h3>${escapeHTML(homeName)} <b>${match.homeScore}–${match.awayScore}</b> ${escapeHTML(awayName)}</h3><p>${escapeHTML(match.note || "FIFA 9 resmî maç sonucu")}</p></div><div class="archive-detail-stamp ${outcome.className}"><small>MODEL SONUCU</small><strong>${outcome.label}</strong></div></div>
      ${odds && !odds.unavailable ? `<section class="archive-detail-market"><div><span>1 · ${escapeHTML(homeName)}</span><strong>${Number(odds.homeOdds).toFixed(2)}</strong><small>${oddsPercent(odds.homeProbability)}</small></div><div><span>X · Beraberlik</span><strong>${Number(odds.drawOdds).toFixed(2)}</strong><small>${oddsPercent(odds.drawProbability)}</small></div><div><span>2 · ${escapeHTML(awayName)}</span><strong>${Number(odds.awayOdds).toFixed(2)}</strong><small>${oddsPercent(odds.awayProbability)}</small></div></section><div class="info-box mt-16"><strong>Maç öncesi model:</strong> ${escapeHTML(odds.favoriteName || "—")} favori · tahmini skor ${odds.predictedHome}-${odds.predictedAway} · snapshot ${odds.capturedAt ? new Date(odds.capturedAt).toLocaleString("tr-TR") : "—"}</div>` : `<div class="info-box warning-box">Bu maç için maç öncesi oran snapshot'ı bulunmuyor. v22 sonrasında başlayan maçlar otomatik arşivlenir.</div>`}
      <div class="mt-16">${renderCommunityPollShell(match.id, homeName, awayName, false, false, odds?.favoriteSide || "")}</div>
      <section class="panel mt-24"><div class="panel-header"><div><h3 class="panel-title">Canlı Yayın Zaman Çizelgesi</h3><div class="panel-subtitle">Gol, kart, büyük şans, tehlikeli atak ve yayın notları.</div></div><span class="badge badge-gold">${events.length} OLAY</span></div>${events.length ? `<div class="live-event-timeline archive-timeline">${events.map(event => renderLiveEvent(event, match).replace(/<button class="live-event-delete"[\s\S]*?<\/button>/, "")).join("")}</div>` : `<div class="info-box">Bu maç canlı yayınlanmadı veya olay kaydı bulunmuyor.</div>`}</section>
      <div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">Kapat</button></div>
    `, "MATCH ARCHIVE v22");
    hydrateV22Community(modalBody);
  }

  function renderOddsCard(item) {
    const favoriteName = item.favorite.name;
    const flag = item.isLive ? `<span class="odds-live-badge"><i></i> CANLI</span>` : item.strongFavorite ? `<span class="odds-signal strong">NET FAVORİ</span>` : item.isBalanced ? `<span class="odds-signal balanced">DENGE MAÇI</span>` : item.surprisePotential ? `<span class="odds-signal upset">SÜRPRİZ ADAYI</span>` : `<span class="odds-signal">MODEL AÇIK</span>`;
    return `<article class="odds-card">
      <div class="odds-card-head"><div><span class="odds-stage">${escapeHTML(item.stage)}</span>${flag}</div><button class="odds-analysis-link" data-action="open-odds-analysis" data-match-id="${escapeHTML(item.id)}">Detaylı Analiz →</button></div>
      <div class="odds-player-line">
        <div class="odds-player home"><strong>${escapeHTML(item.home.name)}</strong><span>${item.home.strength.toFixed(0)} güç · ${item.home.form.games}/20 veri</span><div class="odds-mini-form">${oddsFormStrip(item.home)}</div></div>
        <div class="odds-versus"><span>VS</span><strong>${item.predictedHome}-${item.predictedAway}</strong><small>model skoru</small></div>
        <div class="odds-player away"><strong>${escapeHTML(item.away.name)}</strong><span>${item.away.strength.toFixed(0)} güç · ${item.away.form.games}/20 veri</span><div class="odds-mini-form">${oddsFormStrip(item.away)}</div></div>
      </div>
      <div class="odds-market-row">
        ${renderOddsMarketBox(`1 · ${item.home.name}`, item.market.home, item.favoriteSide === "home")}
        ${renderOddsMarketBox("X · Beraberlik", item.market.draw, false)}
        ${renderOddsMarketBox(`2 · ${item.away.name}`, item.market.away, item.favoriteSide === "away")}
      </div>
      <div class="odds-probability-rail" aria-label="Olasılık dağılımı"><i class="home" style="width:${item.market.home.probability * 100}%"></i><i class="draw" style="width:${item.market.draw.probability * 100}%"></i><i class="away" style="width:${item.market.away.probability * 100}%"></i></div>
      <div class="odds-card-insight"><div><span>Model favorisi</span><strong>${escapeHTML(favoriteName)} · ${oddsPercent(item.favoriteProbability)}</strong></div><div><span>İkili rekabet</span><strong>${item.h2h.meetings ? `${item.h2h.winsA}-${item.h2h.draws}-${item.h2h.winsB} · ${item.h2h.meetings} maç` : "İlk karşılaşma"}</strong></div><div><span>Güven</span><strong>${item.confidence}%</strong></div></div>
      <p class="odds-reason">${escapeHTML(item.reason)}</p>
      ${renderCommunityPollShell(item.id, item.home.name, item.away.name, !item.isLive, false, item.favoriteSide)}
    </article>`;
  }

  function oddsRecordCard(label, item, note) {
    if (!item) return `<article class="odds-record-card"><span>${escapeHTML(label)}</span><strong>–</strong><small>Fikstür bekleniyor</small></article>`;
    return `<article class="odds-record-card"><span>${escapeHTML(label)}</span><strong>${escapeHTML(item.home.name)} – ${escapeHTML(item.away.name)}</strong><small>${escapeHTML(note(item))}</small></article>`;
  }

  function renderOddsCentre() {
    if (!state.current.league.generated || filledParticipants().length < 2) {
      view.innerHTML = emptyState("1X2", "Maç Oranları Kura Sonrası Başlar", "Oyuncular kaydedilip fikstür oluşturulduğunda geçmiş sonuçlara dayalı dinamik oran motoru otomatik çalışacak.", canEdit() ? `<button class="btn btn-gold" data-nav="setup">Kura Sayfasına Git</button>` : "");
      return;
    }

    const analytics = buildOddsAnalytics();
    const allowed = new Set(["all", "league", "gold", "silver", "knockout"]);
    if (!allowed.has(oddsPhaseFilter)) oddsPhaseFilter = "all";
    const filtered = analytics.fixtures.filter(item => oddsPhaseFilter === "all" || item.phaseKey === oddsPhaseFilter);
    const filterLabels = { all: "Tüm Maçlar", league: "League Phase", gold: "Altın Grup", silver: "Gümüş Grup", knockout: "Eleme & Final" };

    view.innerHTML = `
      <div class="group-banner odds-banner">
        <div>
          <div class="eyebrow">FIFA 9 · PREDICTION ENGINE</div>
          <h2>Tahmin & Oran Merkezi</h2>
          <p>Geçmiş turnuvalar, son 20 maç formu, FIFA 9 güncel performansı ve ikili rekabet verileriyle hesaplanan dinamik 1–X–2 oranları. Her yeni sonuçtan sonra oynanmamış maçlar otomatik yeniden değerlendirilir.</p>
          <div class="live-banner-actions"><button class="btn btn-gold" data-action="share-odds">Oranları Paylaş</button><button class="btn btn-ghost" data-nav="form">Form Merkezine Git</button></div>
        </div>
        <div class="odds-hero-mark"><span>1</span><span>X</span><span>2</span><small>DİNAMİK MODEL</small></div>
      </div>

      <div class="odds-disclaimer"><strong>Özel turnuva tahmini:</strong> Bu oranlar yalnızca eğlence ve istatistiksel karşılaştırma amacıyla üretilir. Gerçek bahis, para yatırma veya ödeme özelliği içermez.</div>

      <div class="odds-record-grid">
        ${oddsRecordCard("En Güçlü Favori", analytics.strongest, item => `${item.favorite.name} · ${oddsPercent(item.favoriteProbability)} · ${item.favoriteSide === "home" ? item.market.home.odds.toFixed(2) : item.market.away.odds.toFixed(2)} oran`)}
        ${oddsRecordCard("En Dengeli Maç", analytics.balanced, item => `${oddsPercent(item.market.home.probability)} / ${oddsPercent(item.market.draw.probability)} / ${oddsPercent(item.market.away.probability)}`)}
        ${oddsRecordCard("Beraberlik Sinyali", analytics.drawMatch, item => `X olasılığı ${oddsPercent(item.market.draw.probability)} · ${item.market.draw.odds.toFixed(2)} oran`)}
        ${oddsRecordCard("Sürpriz Potansiyeli", analytics.surprise, item => `${item.underdog.name} · ${oddsPercent(item.underdogProbability)} kazanma ihtimali`)}
      </div>

      <section class="panel odds-filter-panel">
        <div><div class="panel-title">Yaklaşan Maçlar</div><div class="panel-subtitle">${analytics.fixtures.length} oynanmamış fikstür · oranlar resmî sonuç girildiğinde otomatik değişir.</div></div>
        <div class="segmented-control odds-filter-control" role="group" aria-label="Oran fikstürü filtresi">
          ${Object.entries(filterLabels).map(([key, label]) => `<button class="segment-btn ${oddsPhaseFilter === key ? "active" : ""}" data-action="set-odds-filter" data-odds-filter="${key}">${label}</button>`).join("")}
        </div>
      </section>

      ${filtered.length ? `<div class="odds-card-grid">${filtered.map(renderOddsCard).join("")}</div>` : `<div class="info-box mt-24">${escapeHTML(filterLabels[oddsPhaseFilter])} için oynanmamış fikstür bulunmuyor.</div>`}

      ${renderMatchArchiveSection()}

      <section class="panel mt-24 odds-method-panel">
        <div class="panel-header"><div><h3 class="panel-title">Oran Motoru Nasıl Çalışır?</h3><div class="panel-subtitle">Model şeffaf, deterministik ve her cihazda aynı sonucu üretir.</div></div><span class="badge badge-blue">MODEL v14</span></div>
        <div class="odds-weight-grid">
          <div><strong>36%</strong><span>Son 20 maç form gücü</span></div>
          <div><strong>14%</strong><span>Son 5 maç performansı</span></div>
          <div><strong>20%</strong><span>Tüm zamanlar verimliliği</span></div>
          <div><strong>14%</strong><span>FIFA 9 güncel performansı</span></div>
          <div><strong>10%</strong><span>Gol ve averaj profili</span></div>
          <div><strong>6%</strong><span>Momentum trendi</span></div>
        </div>
        <div class="odds-method-notes">
          <div><span>H2H düzeltmesi</span><strong>İkili rekabet sonucuna göre en fazla ±6 güç puanı</strong></div>
          <div><span>Model marjı</span><strong>%6 gösterim marjı; gerçek bahis marjı değildir</strong></div>
          <div><span>Yeni oyuncu koruması</span><strong>Az maçlı oyuncular nötr değere yaklaştırılır; tek sonuç oranı aşırı değiştirmez</strong></div>
          <div><span>Eleme maçlarında X</span><strong>Normal süre beraberlik olasılığını ifade eder</strong></div>
        </div>
      </section>`;
    hydrateV22Community(view);
  }

  function openOddsAnalysis(matchId) {
    const analytics = buildOddsAnalytics();
    const item = analytics.fixtures.find(row => row.id === matchId);
    if (!item) { toast("Bu maç için güncel oran bulunamadı.", "error"); return; }
    const rows = [
      ["Son 20 form gücü", item.home.formStrength, item.away.formStrength],
      ["Son 5 performansı", item.home.recentStrength, item.away.recentStrength],
      ["Tüm zamanlar", item.home.careerStrength, item.away.careerStrength],
      ["FIFA 9 güncel", item.home.currentStrength, item.away.currentStrength],
      ["Gol profili", item.home.goalStrength, item.away.goalStrength],
      ["Momentum", item.home.momentumStrength, item.away.momentumStrength]
    ];
    const h2hRows = item.h2h.latest.length ? item.h2h.latest.map(match => `<div class="odds-h2h-match"><span>${escapeHTML(match.editionLabel || "FIFA")}</span><strong>${escapeHTML(item.home.name)} ${match.gfA}-${match.gfB} ${escapeHTML(item.away.name)}</strong><small>${escapeHTML(match.stage || "")}</small></div>`).join("") : `<div class="info-box">Bu iki oyuncu arasında kayıtlı geçmiş maç bulunmuyor.</div>`;
    openModal(`${item.home.name} vs ${item.away.name}`, `
      <div class="odds-modal-summary">
        <div><span>${escapeHTML(item.stage)}</span><h3>${escapeHTML(item.home.name)} <b>vs</b> ${escapeHTML(item.away.name)}</h3><p>${escapeHTML(item.reason)}</p></div>
        <div class="odds-modal-score"><span>MODEL SKORU</span><strong>${item.predictedHome}-${item.predictedAway}</strong><small>${item.confidenceLabel} · ${item.confidence}%</small></div>
      </div>
      <div class="odds-market-row odds-modal-market">
        ${renderOddsMarketBox(`1 · ${item.home.name}`, item.market.home, item.favoriteSide === "home")}
        ${renderOddsMarketBox("X · Beraberlik", item.market.draw, false)}
        ${renderOddsMarketBox(`2 · ${item.away.name}`, item.market.away, item.favoriteSide === "away")}
      </div>
      <div class="table-wrap compact-table mt-24"><table><thead><tr><th>Model Bileşeni</th><th>${escapeHTML(item.home.name)}</th><th>${escapeHTML(item.away.name)}</th><th>Üstünlük</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escapeHTML(row[0])}</td><td>${row[1].toFixed(0)}</td><td>${row[2].toFixed(0)}</td><td class="${row[1] > row[2] ? "gd-positive" : row[2] > row[1] ? "gd-negative" : ""}">${row[1] === row[2] ? "Denge" : escapeHTML(row[1] > row[2] ? item.home.name : item.away.name)}</td></tr>`).join("")}</tbody></table></div>
      <div class="grid-2 mt-24">
        <div class="odds-modal-profile"><h4>${escapeHTML(item.home.name)}</h4><div>${oddsFormStrip(item.home)}</div><p>${item.home.form.games} form maçı · ${item.home.form.ppg.toFixed(2)} PPG · ${item.home.form.gf}-${item.home.form.ga} gol</p><strong>${item.home.strength.toFixed(1)} ham güç</strong></div>
        <div class="odds-modal-profile"><h4>${escapeHTML(item.away.name)}</h4><div>${oddsFormStrip(item.away)}</div><p>${item.away.form.games} form maçı · ${item.away.form.ppg.toFixed(2)} PPG · ${item.away.form.gf}-${item.away.form.ga} gol</p><strong>${item.away.strength.toFixed(1)} ham güç</strong></div>
      </div>
      <section class="odds-h2h-section mt-24"><div class="panel-title">Son İkili Karşılaşmalar</div><div class="panel-subtitle">Genel H2H: ${item.h2h.meetings ? `${item.h2h.winsA}-${item.h2h.draws}-${item.h2h.winsB} · Goller ${item.h2h.goalsA}-${item.h2h.goalsB}` : "İlk karşılaşma"}</div><div class="odds-h2h-list">${h2hRows}</div></section>
      <div class="info-box mt-24"><strong>Not:</strong> Gösterilen oranlar, model olasılıklarına %6 sunum marjı uygulanarak oluşturulur. Gerçek para veya bahis işlevi yoktur.</div>
      <div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Kapat</button><button class="btn btn-gold" data-action="share-single-odds" data-match-id="${escapeHTML(item.id)}">Bu Maçı Paylaş</button></div>
    `, "MATCH ODDS ANALYSIS");
  }

  async function shareOdds(matchId = "") {
    const analytics = buildOddsAnalytics();
    const list = matchId ? analytics.fixtures.filter(item => item.id === matchId) : analytics.fixtures.slice(0, 6);
    if (!list.length) { toast("Paylaşılacak oynanmamış maç bulunmuyor.", "error"); return; }
    const lines = [
      "FIFA 9 · DİNAMİK MAÇ ORANLARI",
      ...list.map(item => `${item.home.name} vs ${item.away.name} | 1: ${item.market.home.odds.toFixed(2)} · X: ${item.market.draw.odds.toFixed(2)} · 2: ${item.market.away.odds.toFixed(2)} | Favori: ${item.favorite.name} ${oddsPercent(item.favoriteProbability)}`),
      "Yalnızca eğlence ve istatistiksel tahmin amaçlıdır; gerçek bahis içermez.",
      window.location.href
    ];
    const text = lines.join("\n");
    if (navigator.share) {
      try { await navigator.share({ title: "FIFA 9 Maç Oranları", text, url: window.location.href }); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FIFA 9 INTELLIGENCE SUITE · ADVANCED SCORE ENGINE v25
  // Matchday intelligence, Elo, Rivalry DNA, prediction league, achievements,
  // qualification simulator and dynamic player identity cards.
  // ──────────────────────────────────────────────────────────────────────────

  function intelligenceClamp(value, min = 0, max = 100) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function intelligenceNames() {
    const roster = filledParticipants().map(player => player.name.trim()).filter(Boolean);
    if (roster.length) return [...new Set(roster)];
    return combinedAllTime().map(row => row.name);
  }

  function intelligenceOutcome(homeScore, awayScore) {
    if (Number(homeScore) > Number(awayScore)) return "home";
    if (Number(awayScore) > Number(homeScore)) return "away";
    return "draw";
  }

  function intelligenceTier(rating) {
    if (rating >= 1825) return { key: "icon", label: "ICON", note: "Tarihî elit seviye" };
    if (rating >= 1725) return { key: "elite", label: "ELITE", note: "Şampiyonluk seviyesi" };
    if (rating >= 1625) return { key: "contender", label: "CONTENDER", note: "Ciddi şampiyonluk adayı" };
    if (rating >= 1525) return { key: "challenger", label: "CHALLENGER", note: "Tehlikeli rakip" };
    if (rating >= 1425) return { key: "rising", label: "RISING", note: "Yükseliş potansiyeli" };
    return { key: "outsider", label: "OUTSIDER", note: "Sürpriz arayan oyuncu" };
  }

  function buildEloAnalytics() {
    const ratings = new Map();
    const rows = new Map();
    const records = [];
    const matches = buildUnifiedAllTimeMatches();

    function ensure(name) {
      if (!ratings.has(name)) ratings.set(name, 1500);
      if (!rows.has(name)) rows.set(name, {
        name, rating: 1500, peak: 1500, floor: 1500, games: 0,
        wins: 0, draws: 0, losses: 0, lastChange: 0, last5Change: 0,
        timeline: [{ index: 0, rating: 1500, label: "Başlangıç" }]
      });
      return rows.get(name);
    }

    matches.forEach((match, index) => {
      const home = String(match.homeName || "").trim();
      const away = String(match.awayName || "").trim();
      if (!home || !away || /^P\d+$/i.test(home) || /^P\d+$/i.test(away)) return;
      const homeRow = ensure(home);
      const awayRow = ensure(away);
      const beforeHome = ratings.get(home) || 1500;
      const beforeAway = ratings.get(away) || 1500;
      const expectedHome = 1 / (1 + Math.pow(10, (beforeAway - beforeHome) / 400));
      const winner = match.winnerName || (match.homeScore > match.awayScore ? home : match.awayScore > match.homeScore ? away : "");
      const scoreHome = !winner ? 0.5 : winner === home ? 1 : 0;
      const stage = String(match.stage || "").toLowerCase();
      const stageMultiplier = stage.includes("final") ? 1.35 : stage.includes("semi") ? 1.22 : stage.includes("quarter") || stage.includes("knockout") ? 1.14 : 1;
      const editionMultiplier = Number(match.edition) === Number(state.current.edition || 9) ? 1.08 : 1;
      const margin = Math.abs(Number(match.homeScore) - Number(match.awayScore));
      const marginMultiplier = margin <= 1 ? 1 : Math.min(1.65, 1 + Math.log1p(margin - 1) * 0.24);
      const k = 24 * stageMultiplier * editionMultiplier;
      const delta = Math.round(k * marginMultiplier * (scoreHome - expectedHome));
      const afterHome = beforeHome + delta;
      const afterAway = beforeAway - delta;
      ratings.set(home, afterHome);
      ratings.set(away, afterAway);

      homeRow.rating = afterHome; awayRow.rating = afterAway;
      homeRow.games += 1; awayRow.games += 1;
      if (!winner) { homeRow.draws += 1; awayRow.draws += 1; }
      else if (winner === home) { homeRow.wins += 1; awayRow.losses += 1; }
      else { awayRow.wins += 1; homeRow.losses += 1; }
      homeRow.lastChange = delta; awayRow.lastChange = -delta;
      homeRow.peak = Math.max(homeRow.peak, afterHome); awayRow.peak = Math.max(awayRow.peak, afterAway);
      homeRow.floor = Math.min(homeRow.floor, afterHome); awayRow.floor = Math.min(awayRow.floor, afterAway);
      homeRow.timeline.push({ index: index + 1, rating: afterHome, label: `${match.editionLabel} · ${match.stage}` });
      awayRow.timeline.push({ index: index + 1, rating: afterAway, label: `${match.editionLabel} · ${match.stage}` });
      records.push({
        id: match.id, match, home, away, winner,
        beforeHome, beforeAway, afterHome, afterAway,
        deltaHome: delta, deltaAway: -delta,
        expectedHome, surprise: winner === home ? beforeHome < beforeAway - 90 : winner === away ? beforeAway < beforeHome - 90 : false
      });
    });

    const recordByPlayer = new Map();
    records.forEach(record => {
      for (const name of [record.home, record.away]) {
        if (!recordByPlayer.has(name)) recordByPlayer.set(name, []);
        recordByPlayer.get(name).push(record);
      }
    });

    const players = [...rows.values()].map(row => {
      const playerRecords = recordByPlayer.get(row.name) || [];
      row.last5Change = playerRecords.slice(-5).reduce((sum, record) => sum + (record.home === row.name ? record.deltaHome : record.deltaAway), 0);
      row.rating = Math.round(row.rating);
      row.peak = Math.round(row.peak);
      row.floor = Math.round(row.floor);
      row.tier = intelligenceTier(row.rating);
      row.winRate = row.games ? row.wins / row.games * 100 : 0;
      return row;
    }).sort((a, b) => b.rating - a.rating || b.peak - a.peak || a.name.localeCompare(b.name, "tr"))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      players,
      playerMap: new Map(players.map(row => [row.name, row])),
      records,
      recordMap: new Map(records.map(row => [row.id, row])),
      summary: {
        leader: players[0] || null,
        mover: [...players].sort((a, b) => b.last5Change - a.last5Change)[0] || null,
        faller: [...players].sort((a, b) => a.last5Change - b.last5Change)[0] || null,
        average: players.length ? Math.round(players.reduce((sum, row) => sum + row.rating, 0) / players.length) : 1500
      }
    };
  }

  function matchImportance(match) {
    if (!match) return { level: "standard", label: "Standart Maç", note: "Turnuva fikstürü" };
    if (match.phase === "final") return { level: "legendary", label: "Şampiyonluk Maçı", note: "Tek maç, tek kupa, tek şampiyon" };
    if (match.phase === "knockout") return { level: "critical", label: "Eleme Serisi", note: "Serinin ve tur biletinin kaderini belirleyebilir" };
    if (match.phase === "gold") return { level: "critical", label: "Altın Grup Mücadelesi", note: "Yarı final ve eleme sıralamasını doğrudan etkiler" };
    if (match.phase === "silver") return { level: "high", label: "Gümüş Grup Mücadelesi", note: "Eleme aşaması biletini doğrudan etkiler" };
    const table = leagueStandings();
    const homeRank = table.findIndex(row => row.id === match.homeId) + 1;
    const awayRank = table.findIndex(row => row.id === match.awayId) + 1;
    const nearCut = [homeRank, awayRank].some(rank => rank >= 4 && rank <= 14);
    if (nearCut) return { level: "high", label: "Kritik Sıralama Maçı", note: "Altın, Gümüş veya elenme çizgisini etkileyebilir" };
    return { level: "standard", label: "League Phase", note: "Tek lig tablosunda değerli üç puan" };
  }

  function liveProbabilityModel(oddsItem, live) {
    const base = oddsItem?.market || { home: { probability: .34 }, draw: { probability: .32 }, away: { probability: .34 } };
    const minute = intelligenceClamp(Number(live?.minute) || 0, 0, 120);
    const progress = Math.min(1, minute / 90);
    const scoreDiff = (Number(live?.homeScore) || 0) - (Number(live?.awayScore) || 0);
    const leverage = 1.05 + progress * 2.65;
    let home = base.home.probability * Math.exp(scoreDiff * leverage);
    let away = base.away.probability * Math.exp(-scoreDiff * leverage);
    let draw = base.draw.probability * (scoreDiff === 0 ? 1 + progress * 1.2 : Math.max(.08, 1 - progress * .92));
    if (minute >= 89 && scoreDiff !== 0) {
      if (scoreDiff > 0) home *= 2.2;
      else away *= 2.2;
    }
    const total = home + draw + away || 1;
    return { home: home / total, draw: draw / total, away: away / total };
  }

  function liveMomentumLabel(live, match) {
    const goals = [...(live?.events || [])].filter(event => event.type === "goal").sort((a, b) => Number(a.minute) - Number(b.minute));
    const recent = goals.slice(-3);
    const homeCount = recent.filter(event => event.side === "home").length;
    const awayCount = recent.filter(event => event.side === "away").length;
    if (homeCount >= 2 && homeCount > awayCount) return { side: "home", label: `${playerName(match.homeId)} momentumu ele aldı`, strength: Math.min(100, 58 + homeCount * 12) };
    if (awayCount >= 2 && awayCount > homeCount) return { side: "away", label: `${playerName(match.awayId)} momentumu ele aldı`, strength: Math.min(100, 58 + awayCount * 12) };
    if ((Number(live?.homeScore) || 0) === (Number(live?.awayScore) || 0)) return { side: "draw", label: "Maç dengede", strength: 50 };
    const leader = Number(live?.homeScore) > Number(live?.awayScore) ? playerName(match.homeId) : playerName(match.awayId);
    return { side: Number(live?.homeScore) > Number(live?.awayScore) ? "home" : "away", label: `${leader} oyun kontrolünü koruyor`, strength: 62 };
  }

  function analyzeLiveArchive(match) {
    const archive = state.current.live?.archive?.[match.id];
    if (!archive) return { comeback: false, maxDeficit: 0, lateWinner: false, turningPoint: "Canlı olay kaydı bulunmuyor" };
    const events = [...(archive.events || [])].filter(event => event.type === "goal").sort((a, b) => Number(a.minute) - Number(b.minute) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    let home = 0; let away = 0; let maxHomeDeficit = 0; let maxAwayDeficit = 0; let lastLeadChange = null;
    let previousLeader = "draw";
    events.forEach(event => {
      if (event.side === "home") home += 1;
      if (event.side === "away") away += 1;
      maxHomeDeficit = Math.max(maxHomeDeficit, away - home);
      maxAwayDeficit = Math.max(maxAwayDeficit, home - away);
      const leader = home === away ? "draw" : home > away ? "home" : "away";
      if (leader !== previousLeader) lastLeadChange = event;
      previousLeader = leader;
    });
    const winnerId = matchWinnerId(match);
    const winnerSide = winnerId === match.homeId ? "home" : winnerId === match.awayId ? "away" : "draw";
    const maxDeficit = winnerSide === "home" ? maxHomeDeficit : winnerSide === "away" ? maxAwayDeficit : 0;
    const winningGoals = events.filter(event => event.side === winnerSide);
    const finalWinnerGoal = winningGoals.at(-1);
    return {
      comeback: maxDeficit >= 2,
      maxDeficit,
      lateWinner: Boolean(finalWinnerGoal && Number(finalWinnerGoal.minute) >= 85 && Math.abs(Number(match.homeScore) - Number(match.awayScore)) === 1),
      turningPoint: lastLeadChange ? `${Number(lastLeadChange.minute) || 0}' · ${lastLeadChange.side === "home" ? playerName(match.homeId) : playerName(match.awayId)} skorda üstünlüğü değiştirdi` : "Skor üstünlüğü değişmedi"
    };
  }

  function postMatchStory(item, eloAnalytics) {
    const match = item.match;
    const winnerId = matchWinnerId(match);
    const winner = winnerId ? playerName(winnerId) : "";
    const loser = winnerId === match.homeId ? playerName(match.awayId) : winnerId === match.awayId ? playerName(match.homeId) : "";
    const margin = Math.abs(Number(match.homeScore) - Number(match.awayScore));
    const total = Number(match.homeScore) + Number(match.awayScore);
    const liveInsight = analyzeLiveArchive(match);
    const eloRecord = eloAnalytics.recordMap.get(match.id);
    let lead = `${item.homeName} ile ${item.awayName} arasındaki karşılaşma ${match.homeScore}-${match.awayScore} tamamlandı.`;
    if (winner) {
      if (liveInsight.comeback) lead = `${winner}, ${liveInsight.maxDeficit} farklı geriden gelerek ${loser} karşısında ${match.homeScore}-${match.awayScore} kazandı.`;
      else if (margin >= 4) lead = `${winner}, ${loser} karşısında ${margin} farklı dominant bir galibiyet aldı.`;
      else if (total >= 10) lead = `${winner}, gol düellosuna dönüşen karşılaşmayı ${match.homeScore}-${match.awayScore} kazandı.`;
      else lead = `${winner}, dengeli mücadelede ${loser} karşısında ${match.homeScore}-${match.awayScore} kazandı.`;
    } else lead = `${item.homeName} ve ${item.awayName}, ${match.homeScore}-${match.awayScore} beraberlikle puanları paylaştı.`;
    const eloText = eloRecord ? `${eloRecord.deltaHome >= 0 ? item.homeName : item.awayName} Elo sıralamasında ${Math.abs(eloRecord.deltaHome)} puanlık değişim yarattı.` : "";
    return { lead, eloText, ...liveInsight };
  }

  function buildMatchdayIntelligence() {
    const odds = buildOddsAnalytics();
    const elo = buildEloAnalytics();
    const livePair = getActiveLive();
    const liveItem = livePair ? (() => {
      const base = odds.fixtures.find(item => item.id === livePair.match.id) || buildMatchOdds(livePair.match, oddsBuildContext());
      const probability = liveProbabilityModel(base, livePair.live);
      return { ...base, match: livePair.match, live: livePair.live, probability, momentum: liveMomentumLabel(livePair.live, livePair.match), importance: matchImportance(livePair.match) };
    })() : null;
    const upcoming = odds.fixtures.map(item => ({ ...item, match: findMatch(item.id), importance: matchImportance(findMatch(item.id)) }));
    const recent = buildLiveTournamentAnalytics().recentMatches.slice(0, 8).map(item => ({ ...item, story: postMatchStory(item, elo), importance: matchImportance(item.match) }));
    return { live: liveItem, upcoming, recent, elo };
  }

  function renderProbabilityRail(probability, labels) {
    return `<div class="intel-probability">
      <div class="intel-probability-labels"><span>${escapeHTML(labels.home)} <strong>${Math.round(probability.home * 100)}%</strong></span><span>X <strong>${Math.round(probability.draw * 100)}%</strong></span><span>${escapeHTML(labels.away)} <strong>${Math.round(probability.away * 100)}%</strong></span></div>
      <div class="intel-probability-track"><i class="home" style="width:${probability.home * 100}%"></i><i class="draw" style="width:${probability.draw * 100}%"></i><i class="away" style="width:${probability.away * 100}%"></i></div>
    </div>`;
  }

  function renderMatchdaySection() {
    const data = buildMatchdayIntelligence();
    const featured = data.live || data.upcoming[0] || null;
    const liveBlock = data.live ? `<section class="intel-live-command">
      <div class="intel-live-head"><div><span class="intel-live-badge"><i></i> CANLI INTELLIGENCE</span><h3>${escapeHTML(data.live.home.name)} <b>${data.live.live.homeScore}-${data.live.live.awayScore}</b> ${escapeHTML(data.live.away.name)}</h3><p>${escapeHTML(data.live.importance.label)} · ${Number(data.live.live.minute) || 0}' · ${escapeHTML(data.live.momentum.label)}</p></div><div class="intel-momentum-gauge"><strong>${data.live.momentum.strength}</strong><span>MOMENTUM</span></div></div>
      ${renderProbabilityRail(data.live.probability, { home: data.live.home.name, away: data.live.away.name })}
      <div class="intel-live-insights"><div><span>Anlık favori</span><strong>${escapeHTML(data.live.probability.home > data.live.probability.away ? data.live.home.name : data.live.away.name)}</strong></div><div><span>Maç öncesi tahmin</span><strong>${data.live.predictedHome}-${data.live.predictedAway}</strong></div><div><span>Kritiklik</span><strong>${escapeHTML(data.live.importance.label)}</strong></div></div>
      <button class="btn btn-gold" data-nav="livematch">Canlı Maç Merkezini Aç</button>
    </section>` : `<div class="intel-no-live"><span>○</span><div><strong>Şu anda canlı maç yok</strong><p>Bir maç canlı yayına alındığında momentum ve anlık kazanma ihtimali burada otomatik açılır.</p></div></div>`;

    return `<div class="intel-section-stack">
      ${liveBlock}
      <section class="panel intel-featured-match">
        <div class="panel-header"><div><h3 class="panel-title">Matchday Intelligence</h3><div class="panel-subtitle">Maç öncesi analiz, canlı hikâye ve maç sonrası otomatik rapor tek akışta.</div></div><span class="badge badge-gold">AI MATCHDAY</span></div>
        ${featured ? `<div class="intel-feature-grid">
          <div class="intel-feature-copy"><span class="intel-importance ${featured.importance?.level || "standard"}">${escapeHTML(featured.importance?.label || featured.stage)}</span><h2>${escapeHTML(featured.home.name)} <b>vs</b> ${escapeHTML(featured.away.name)}</h2><p>${escapeHTML(featured.reason || featured.importance?.note || "İstatistiksel maç analizi")}</p><div class="intel-feature-actions"><button class="btn btn-gold" data-action="open-matchday-analysis" data-match-id="${escapeHTML(featured.id)}">Tam Maç Dosyasını Aç</button><button class="btn btn-ghost" data-nav="odds">Oran Merkezine Git</button></div></div>
          <div class="intel-score-prediction"><span>MODEL SKORU</span><strong>${featured.predictedHome}-${featured.predictedAway}</strong><small>${featured.confidence || 0}% güven · ${escapeHTML(featured.confidenceLabel || "Model açık")}</small></div>
        </div>` : `<div class="info-box">Henüz analiz edilecek fikstür bulunmuyor.</div>`}
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3 class="panel-title">Yaklaşan Maç Dosyaları</h3><div class="panel-subtitle">Form, Elo, H2H ve turnuva önemine göre otomatik hazırlanır.</div></div><span class="badge badge-blue">${data.upcoming.length} MATCH FILES</span></div>
        ${data.upcoming.length ? `<div class="intel-match-list">${data.upcoming.slice(0, 10).map(item => `<button class="intel-match-row" data-action="open-matchday-analysis" data-match-id="${escapeHTML(item.id)}"><span class="intel-match-stage">${escapeHTML(item.stage)}</span><strong>${escapeHTML(item.home.name)} <b>vs</b> ${escapeHTML(item.away.name)}</strong><span>${item.predictedHome}-${item.predictedAway}</span><small class="${item.importance.level}">${escapeHTML(item.importance.label)}</small></button>`).join("")}</div>` : `<div class="info-box">Oynanmamış maç bulunmuyor.</div>`}
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3 class="panel-title">Otomatik Maç Sonu Hikâyeleri</h3><div class="panel-subtitle">Canlı zaman çizelgesi, skor, Elo ve rekor etkisinden oluşturulur.</div></div><span class="badge badge-silver">POST MATCH</span></div>
        ${data.recent.length ? `<div class="intel-story-grid">${data.recent.map(item => `<article class="intel-story-card"><span>${escapeHTML(item.stage)}</span><h4>${escapeHTML(item.homeName)} ${item.homeScore}-${item.awayScore} ${escapeHTML(item.awayName)}</h4><p>${escapeHTML(item.story.lead)}</p><small>${escapeHTML(item.story.turningPoint)}${item.story.eloText ? ` · ${escapeHTML(item.story.eloText)}` : ""}</small></article>`).join("")}</div>` : `<div class="info-box">İlk sonuç girildiğinde otomatik maç hikâyeleri burada görünür.</div>`}
      </section>
    </div>`;
  }

  function openMatchdayAnalysis(matchId) {
    const match = findMatch(matchId);
    if (!match) { toast("Maç dosyası bulunamadı.", "error"); return; }
    const context = oddsBuildContext();
    const item = buildMatchOdds(match, context);
    const elo = buildEloAnalytics();
    const homeElo = elo.playerMap.get(item.home.name);
    const awayElo = elo.playerMap.get(item.away.name);
    const importance = matchImportance(match);
    const live = getActiveLive()?.match?.id === match.id ? getActiveLive().live : null;
    const liveProbability = live ? liveProbabilityModel(item, live) : null;
    const h2hLatest = item.h2h.latest.length ? item.h2h.latest.map(row => `<div class="intel-dossier-h2h"><span>${escapeHTML(row.editionLabel)}</span><strong>${escapeHTML(item.home.name)} ${row.gfA}-${row.gfB} ${escapeHTML(item.away.name)}</strong><small>${escapeHTML(row.stage)}</small></div>`).join("") : `<div class="info-box">İlk karşılaşma.</div>`;
    openModal(`${item.home.name} vs ${item.away.name}`, `
      <div class="intel-dossier-hero"><div><span class="intel-importance ${importance.level}">${escapeHTML(importance.label)}</span><h3>${escapeHTML(item.home.name)} <b>vs</b> ${escapeHTML(item.away.name)}</h3><p>${escapeHTML(item.reason)}</p></div><div class="intel-score-prediction"><span>MODEL SKORU</span><strong>${item.predictedHome}-${item.predictedAway}</strong><small>${item.confidence}% güven</small></div></div>
      ${renderProbabilityRail(liveProbability || { home: item.market.home.probability, draw: item.market.draw.probability, away: item.market.away.probability }, { home: item.home.name, away: item.away.name })}
      <div class="intel-dossier-kpis"><div><span>Elo</span><strong>${homeElo?.rating || 1500} – ${awayElo?.rating || 1500}</strong></div><div><span>Son 20 PPG</span><strong>${item.home.form.ppg.toFixed(2)} – ${item.away.form.ppg.toFixed(2)}</strong></div><div><span>H2H</span><strong>${item.h2h.meetings ? `${item.h2h.winsA}-${item.h2h.draws}-${item.h2h.winsB}` : "İlk maç"}</strong></div><div><span>Kritiklik</span><strong>${escapeHTML(importance.label)}</strong></div></div>
      <div class="grid-2 mt-24"><div class="intel-dossier-player"><h4>${escapeHTML(item.home.name)}</h4><strong>${item.home.strength.toFixed(0)} güç</strong><p>${item.home.form.games} maç · ${item.home.form.wins}G ${item.home.form.draws}B ${item.home.form.losses}M · ${item.home.form.gf}-${item.home.form.ga}</p>${oddsFormStrip(item.home)}</div><div class="intel-dossier-player"><h4>${escapeHTML(item.away.name)}</h4><strong>${item.away.strength.toFixed(0)} güç</strong><p>${item.away.form.games} maç · ${item.away.form.wins}G ${item.away.form.draws}B ${item.away.form.losses}M · ${item.away.form.gf}-${item.away.form.ga}</p>${oddsFormStrip(item.away)}</div></div>
      <section class="mt-24"><div class="panel-title">Rivalry Timeline</div><div class="intel-dossier-h2h-list">${h2hLatest}</div></section>
      <div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Kapat</button><button class="btn btn-gold" data-action="share-single-odds" data-match-id="${escapeHTML(match.id)}">Maçı Paylaş</button></div>
    `, "MATCHDAY INTELLIGENCE");
  }

  function renderEloSection() {
    const data = buildEloAnalytics();
    return `<div class="intel-section-stack">
      <section class="intel-elo-hero"><div><div class="eyebrow">FIFA POWER INDEX</div><h2>Elo Güç Sıralaması</h2><p>Rakibin gücü, maç sonucu, skor farkı ve turnuva aşamasını dikkate alan uzun vadeli performans modeli.</p></div><div class="intel-elo-crown"><span>#1</span><strong>${escapeHTML(data.summary.leader?.name || "–")}</strong><b>${data.summary.leader?.rating || 1500}</b></div></section>
      <div class="kpi-grid">
        ${kpiCard("Elo Lideri", data.summary.leader?.name || "–", data.summary.leader ? `${data.summary.leader.rating} Elo · ${data.summary.leader.tier.label}` : "Veri bekleniyor")}
        ${kpiCard("En Hızlı Yükselen", data.summary.mover?.name || "–", data.summary.mover ? `Son 5 maç ${data.summary.mover.last5Change >= 0 ? "+" : ""}${data.summary.mover.last5Change}` : "Veri bekleniyor")}
        ${kpiCard("Ortalama Güç", data.summary.average, `${data.players.length} oyuncu`)}
        ${kpiCard("İşlenen Maç", data.records.length, "FIFA 1–9 birleşik Elo akışı")}
      </div>
      <section class="panel">
        <div class="panel-header"><div><h3 class="panel-title">Canlı Elo Sıralaması</h3><div class="panel-subtitle">Güçlü rakibe karşı alınan sonuç daha yüksek değer taşır.</div></div><span class="badge badge-gold">DYNAMIC</span></div>
        <div class="intel-elo-table"><div class="intel-elo-head"><span>#</span><span>Oyuncu</span><span>Elo</span><span>Son Maç</span><span>Son 5</span><span>Peak</span><span>Seviye</span></div>${data.players.map(row => `<div class="intel-elo-row tier-${row.tier.key}"><span>${row.rank}</span><strong>${escapeHTML(row.name)}</strong><b>${row.rating}</b><em class="${row.lastChange >= 0 ? "positive" : "negative"}">${row.lastChange >= 0 ? "+" : ""}${row.lastChange}</em><em class="${row.last5Change >= 0 ? "positive" : "negative"}">${row.last5Change >= 0 ? "+" : ""}${row.last5Change}</em><span>${row.peak}</span><small>${row.tier.label}</small></div>`).join("")}</div>
      </section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Seviye Sistemi</h3><div class="panel-subtitle">Oyuncu kartları ve tahmin modeli aynı Elo omurgasını kullanır.</div></div></div><div class="intel-tier-grid">${["ICON · 1825+","ELITE · 1725+","CONTENDER · 1625+","CHALLENGER · 1525+","RISING · 1425+","OUTSIDER · <1425"].map((label, index) => `<div class="tier-${["icon","elite","contender","challenger","rising","outsider"][index]}"><strong>${label.split(" · ")[0]}</strong><span>${label.split(" · ")[1]}</span></div>`).join("")}</div></section>
    </div>`;
  }

  function rivalryDNAData(playerA, playerB) {
    const analytics = buildAllTimeAnalytics();
    const names = intelligenceNames();
    const defaultRivalry = analytics.rivalries[0];
    const a = names.includes(playerA) ? playerA : defaultRivalry?.playerA || names[0] || "";
    const bCandidate = names.includes(playerB) && playerB !== a ? playerB : defaultRivalry && defaultRivalry.playerA === a ? defaultRivalry.playerB : names.find(name => name !== a) || "";
    const rivalry = analytics.pairMap.get(rivalryKey(a, bCandidate)) || {
      playerA: a, playerB: bCandidate, meetings: 0, winsA: 0, winsB: 0, draws: 0, goalsA: 0, goalsB: 0, matches: [], summary: "İlk karşılaşma"
    };
    const oriented = rivalry.playerA === a ? rivalry : {
      ...rivalry, playerA: a, playerB: bCandidate,
      winsA: rivalry.winsB, winsB: rivalry.winsA,
      goalsA: rivalry.goalsB, goalsB: rivalry.goalsA,
      matches: (rivalry.matches || []).map(match => ({ ...match, scoreA: match.scoreB, scoreB: match.scoreA }))
    };
    const totalGoals = oriented.goalsA + oriented.goalsB;
    const avgGoals = oriented.meetings ? totalGoals / oriented.meetings : 0;
    const balance = oriented.meetings ? 100 - Math.min(100, Math.abs(oriented.winsA - oriented.winsB) / oriented.meetings * 100) : 100;
    const drawRate = oriented.meetings ? oriented.draws / oriented.meetings * 100 : 0;
    const tags = [];
    if (oriented.meetings >= 8) tags.push("CLASSIC RIVALRY");
    if (avgGoals >= 7) tags.push("GOAL FESTIVAL");
    if (drawRate >= 25) tags.push("TACTICAL DEADLOCK");
    if (balance >= 80 && oriented.meetings >= 3) tags.push("50/50 BATTLE");
    if (Math.abs(oriented.winsA - oriented.winsB) >= 4) tags.push("MENTAL EDGE");
    if (!tags.length) tags.push(oriented.meetings ? "RIVALRY BUILDING" : "FIRST CONTACT");
    return { analytics, names, a, b: bCandidate, rivalry: oriented, avgGoals, balance, drawRate, tags };
  }

  function renderRivalrySection() {
    const data = rivalryDNAData(intelligenceRivalA, intelligenceRivalB);
    intelligenceRivalA = data.a; intelligenceRivalB = data.b;
    const r = data.rivalry;
    const timeline = [...(r.matches || [])].slice(-10).reverse();
    const aPlayer = data.analytics.playerMap.get(data.a);
    const bPlayer = data.analytics.playerMap.get(data.b);
    return `<div class="intel-section-stack">
      <section class="intel-rivalry-hero"><div><div class="eyebrow">RIVALRY DNA</div><h2>Rekabet Kimliği</h2><p>Her eşleşmenin tarihini, psikolojik üstünlüğünü, gol karakterini ve kader anlarını tek kartta çözümler.</p></div><div class="intel-rivalry-selectors"><select id="intelRivalA">${data.names.map(name => `<option value="${escapeHTML(name)}" ${name === data.a ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}</select><span>VS</span><select id="intelRivalB">${data.names.filter(name => name !== data.a).map(name => `<option value="${escapeHTML(name)}" ${name === data.b ? "selected" : ""}>${escapeHTML(name)}</option>`).join("")}</select></div></section>
      <section class="intel-rivalry-scoreboard"><div><span>${escapeHTML(data.a)}</span><strong>${r.winsA}</strong><small>${r.goalsA} gol</small></div><div class="intel-rivalry-centre"><b>${r.meetings}</b><span>MAÇ</span><em>${r.draws} beraberlik</em></div><div><span>${escapeHTML(data.b)}</span><strong>${r.winsB}</strong><small>${r.goalsB} gol</small></div></section>
      <div class="intel-dna-grid"><article><span>Denge Endeksi</span><strong>${Math.round(data.balance)}</strong><div><i style="width:${data.balance}%"></i></div></article><article><span>Gol Yoğunluğu</span><strong>${data.avgGoals.toFixed(2)}</strong><small>maç başına</small></article><article><span>Beraberlik Oranı</span><strong>${data.drawRate.toFixed(0)}%</strong><small>taktik kilit sinyali</small></article><article><span>Psikolojik Üstünlük</span><strong>${r.winsA === r.winsB ? "DENGE" : escapeHTML(r.winsA > r.winsB ? data.a : data.b)}</strong><small>${Math.abs(r.winsA-r.winsB)} galibiyet farkı</small></article></div>
      <div class="intel-tag-row">${data.tags.map(tag => `<span>${tag}</span>`).join("")}</div>
      <div class="grid-2">
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Rekabet Zaman Çizelgesi</h3><div class="panel-subtitle">En yeni karşılaşmadan geriye doğru.</div></div></div>${timeline.length ? `<div class="intel-rivalry-timeline">${timeline.map(match => `<div><span>${escapeHTML(match.editionLabel || `FIFA ${match.edition}`)}</span><strong>${escapeHTML(data.a)} ${match.scoreA}-${match.scoreB} ${escapeHTML(data.b)}</strong><small>${escapeHTML(match.stage || "")}</small></div>`).join("")}</div>` : `<div class="info-box">Henüz karşılaşma yok.</div>`}</section>
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Oyuncu Üzerindeki Etki</h3><div class="panel-subtitle">Rakibe özel başarı profili.</div></div></div><div class="intel-opponent-impact"><div><strong>${escapeHTML(data.a)}</strong><span>${aPlayer?.nemesis?.name === data.b ? "Nemesis rakibi" : aPlayer?.bestOpponent?.name === data.b ? "Favori rakibi" : "Özel rekabet"}</span><b>${r.meetings ? ((r.winsA*3+r.draws)/r.meetings).toFixed(2) : "0.00"} PPG</b></div><div><strong>${escapeHTML(data.b)}</strong><span>${bPlayer?.nemesis?.name === data.a ? "Nemesis rakibi" : bPlayer?.bestOpponent?.name === data.a ? "Favori rakibi" : "Özel rekabet"}</span><b>${r.meetings ? ((r.winsB*3+r.draws)/r.meetings).toFixed(2) : "0.00"} PPG</b></div></div></section>
      </div>
    </div>`;
  }

  function predictionProfile() {
    return window.FIFA_CHAT_UI?.getProfile?.() || null;
  }

  async function loadPredictionRows(force = false) {
    const client = cloud?.getClient?.();
    if (!client || predictionCache.loading) return;
    if (!force && predictionCache.loadedAt && Date.now() - predictionCache.loadedAt < 12000) return;
    predictionCache.loading = true;
    predictionCache.error = "";
    try {
      const { data, error } = await client.rpc("list_match_predictions_v15", { p_tournament_id: window.FIFA_CLOUD_CONFIG?.tournamentRowId || "fifa-9" });
      if (error) throw error;
      predictionCache.rows = Array.isArray(data) ? data : [];
      predictionCache.loadedAt = Date.now();
    } catch (error) {
      predictionCache.error = String(error?.message || error || "Tahmin verisi yüklenemedi");
    } finally {
      predictionCache.loading = false;
      if (activeView === "intelligence" && intelligenceSection === "predictions") renderIntelligenceCentre();
    }
  }

  function predictionScore(row, match, oddsItem) {
    if (!match || !matchComplete(match)) return { points: 0, status: "pending", exact: false, outcome: false, goalDifference: false, upset: false };
    const predictedOutcome = intelligenceOutcome(row.home_score, row.away_score);
    const actualOutcome = intelligenceOutcome(match.homeScore, match.awayScore);
    const exact = Number(row.home_score) === Number(match.homeScore) && Number(row.away_score) === Number(match.awayScore);
    const outcome = predictedOutcome === actualOutcome;
    const goalDifference = Number(row.home_score) - Number(row.away_score) === Number(match.homeScore) - Number(match.awayScore);
    let points = exact ? 5 : outcome ? 3 : 0;
    if (goalDifference) points += 1;
    const probabilities = {
      home: Number(row.model_home_probability) || oddsItem?.market.home.probability || .34,
      draw: Number(row.model_draw_probability) || oddsItem?.market.draw.probability || .32,
      away: Number(row.model_away_probability) || oddsItem?.market.away.probability || .34
    };
    const upset = outcome && probabilities[actualOutcome] <= .30;
    if (upset) points += 1;
    return { points, status: "scored", exact, outcome, goalDifference, upset };
  }

  function buildPredictionAnalytics() {
    const oddsContext = oddsBuildContext();
    const oddsMap = new Map(allCurrentMatches().filter(match => match.homeId && match.awayId).map(match => [match.id, buildMatchOdds(match, oddsContext)]));
    const leaderboard = new Map();
    const rows = predictionCache.rows.map(row => {
      const match = findMatch(row.match_id);
      const score = predictionScore(row, match, oddsMap.get(row.match_id));
      const enriched = { ...row, match, score };
      if (!leaderboard.has(row.player_id)) leaderboard.set(row.player_id, { playerId: row.player_id, name: row.display_name, predictions: 0, scored: 0, points: 0, exact: 0, outcomes: 0, upset: 0 });
      const player = leaderboard.get(row.player_id);
      player.predictions += 1;
      if (score.status === "scored") {
        player.scored += 1; player.points += score.points;
        if (score.exact) player.exact += 1;
        if (score.outcome) player.outcomes += 1;
        if (score.upset) player.upset += 1;
      }
      return enriched;
    });
    const table = [...leaderboard.values()].map(row => ({ ...row, ppg: row.scored ? row.points / row.scored : 0 }))
      .sort((a, b) => b.points - a.points || b.exact - a.exact || b.outcomes - a.outcomes || a.name.localeCompare(b.name, "tr"))
      .map((row, index) => ({ ...row, rank: index + 1 }));
    const profile = predictionProfile();
    const myRows = profile ? rows.filter(row => row.player_id === profile.player_id) : [];
    return { rows, table, myRows, oddsMap };
  }

  function renderPredictionSection() {
    const profile = predictionProfile();
    const fixtures = oddsAvailableFixtures().filter(match => getActiveLive()?.match?.id !== match.id);
    const data = buildPredictionAnalytics();
    if (!predictionCache.loadedAt && !predictionCache.loading && !predictionCache.error) setTimeout(() => loadPredictionRows(), 0);
    return `<div class="intel-section-stack">
      <section class="intel-prediction-hero"><div><div class="eyebrow">COMMUNITY PREDICTION LEAGUE</div><h2>Tahmin Şampiyonası</h2><p>Oyuncular maç başlamadan skor tahmini yapar. Tam skor, doğru sonuç, gol farkı ve sürpriz tahmin bonuslarıyla ayrı bir şampiyonluk yarışı oluşur.</p></div><div class="intel-prediction-score"><strong>${data.table[0]?.points || 0}</strong><span>LİDER PUANI</span><small>${escapeHTML(data.table[0]?.name || "Tahmin bekleniyor")}</small></div></section>
      ${predictionCache.error ? `<div class="info-box warning-box"><strong>Tahmin sistemi kurulumu gerekli:</strong> ${escapeHTML(predictionCache.error)}<br><small>Supabase SQL Editor’da <b>intelligence_feature_v15.sql</b> dosyasını çalıştır.</small></div>` : ""}
      <div class="grid-2">
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Tahminini Gönder</h3><div class="panel-subtitle">Sohbet için oluşturduğun oyuncu adı ve PIN oturumu kullanılır.</div></div><span class="badge badge-gold">LOCK BEFORE LIVE</span></div>
          ${profile ? fixtures.length ? `<form id="predictionForm" class="intel-prediction-form"><div class="field"><label>Oyuncu</label><div class="intel-identity-chip"><span>${escapeHTML(profile.display_name?.charAt(0) || "P")}</span><strong>${escapeHTML(profile.display_name)}</strong></div></div><div class="field"><label>Maç</label><select name="matchId" required>${fixtures.map(match => `<option value="${escapeHTML(match.id)}">${escapeHTML(playerName(match.homeId))} vs ${escapeHTML(playerName(match.awayId))} · ${escapeHTML(currentMatchStageLabel(match))}</option>`).join("")}</select></div><div class="intel-score-inputs"><label><span>Ev Skoru</span><input type="number" min="0" max="30" name="homeScore" required value="2"></label><b>–</b><label><span>Dep. Skoru</span><input type="number" min="0" max="30" name="awayScore" required value="1"></label></div><button class="btn btn-gold" type="submit">Tahmini Kaydet / Güncelle</button></form>` : `<div class="info-box">Tahmine açık oynanmamış maç bulunmuyor.</div>` : `<div class="intel-login-required"><span>🔐</span><h4>Oyuncu oturumu gerekli</h4><p>İsmini yazmadan, kayıtlı oyuncu adını seçip PIN ile Sohbet bölümüne giriş yap. Aynı oturum tahmin liginde otomatik tanınır.</p><button class="btn btn-gold" data-nav="chat">Sohbetten Oyuncu Girişi Yap</button></div>`}
        </section>
        <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Puanlama</h3><div class="panel-subtitle">Gerçek bahis yoktur; yalnızca turnuva içi eğlence yarışmasıdır.</div></div></div><div class="intel-points-rules"><div><strong>5</strong><span>Tam skor</span></div><div><strong>3</strong><span>Doğru sonuç</span></div><div><strong>+1</strong><span>Doğru gol farkı</span></div><div><strong>+1</strong><span>Sürpriz sonucu bilme</span></div></div><button class="btn btn-ghost mt-16" data-action="refresh-predictions">Tahminleri Yenile</button></section>
      </div>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Tahmin Ligi Puan Durumu</h3><div class="panel-subtitle">Tamamlanan maçlardan otomatik hesaplanır.</div></div><span class="badge badge-blue">${predictionCache.rows.length} PREDICTIONS</span></div>${data.table.length ? `<div class="intel-prediction-table"><div class="head"><span>#</span><span>Oyuncu</span><span>Puan</span><span>Tam Skor</span><span>Doğru Sonuç</span><span>Sürpriz</span><span>Ort.</span></div>${data.table.map(row => `<div><span>${row.rank}</span><strong>${escapeHTML(row.name)}</strong><b>${row.points}</b><span>${row.exact}</span><span>${row.outcomes}</span><span>${row.upset}</span><span>${row.ppg.toFixed(2)}</span></div>`).join("")}</div>` : `<div class="info-box">Henüz tahmin girilmedi.</div>`}</section>
      ${profile ? `<section class="panel"><div class="panel-header"><div><h3 class="panel-title">Tahminlerim</h3><div class="panel-subtitle">${escapeHTML(profile.display_name)} adına kayıtlı tahminler.</div></div></div>${data.myRows.length ? `<div class="intel-my-predictions">${data.myRows.slice().sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at))).map(row => `<div><span>${escapeHTML(row.match ? `${playerName(row.match.homeId)} vs ${playerName(row.match.awayId)}` : row.match_id)}</span><strong>${row.home_score}-${row.away_score}</strong><small>${row.score.status === "scored" ? `${row.score.points} puan` : "Maç bekleniyor"}</small></div>`).join("")}</div>` : `<div class="info-box">Henüz tahminin yok.</div>`}</section>` : ""}
    </div>`;
  }

  async function submitPrediction(form) {
    const profile = predictionProfile();
    const token = window.FIFA_CHAT_UI?.getSessionToken?.() || "";
    if (!profile || !token) { toast("Önce Sohbet bölümünden oyuncu PIN oturumu aç.", "error"); return; }
    const data = new FormData(form);
    const matchId = String(data.get("matchId") || "");
    const match = findMatch(matchId);
    if (!match || matchComplete(match) || getActiveLive()?.match?.id === matchId) { toast("Bu maç tahmine kapalı.", "error"); return; }
    const oddsItem = buildMatchOdds(match, oddsBuildContext());
    const client = cloud?.getClient?.();
    if (!client) { toast("Canlı bağlantı hazır değil.", "error"); return; }
    const button = form.querySelector("button[type=submit]");
    if (button) { button.disabled = true; button.textContent = "Kaydediliyor..."; }
    try {
      const { error } = await client.rpc("submit_match_prediction_v15", {
        p_tournament_id: window.FIFA_CLOUD_CONFIG?.tournamentRowId || "fifa-9",
        p_token: token,
        p_match_id: matchId,
        p_home_score: Math.max(0, Number(data.get("homeScore")) || 0),
        p_away_score: Math.max(0, Number(data.get("awayScore")) || 0),
        p_model_home_probability: oddsItem.market.home.probability,
        p_model_draw_probability: oddsItem.market.draw.probability,
        p_model_away_probability: oddsItem.market.away.probability
      });
      if (error) throw error;
      toast("Tahminin kaydedildi.", "success");
      predictionCache.loadedAt = 0;
      await loadPredictionRows(true);
    } catch (error) {
      toast(String(error?.message || error || "Tahmin kaydedilemedi"), "error");
      if (button) { button.disabled = false; button.textContent = "Tahmini Kaydet / Güncelle"; }
    }
  }


  function achievementPrestigeLevels() {
    return [
      { key:"rookie", name:"ROOKIE", min:0, icon:"Ⅰ", model:"Bronze Core" },
      { key:"competitor", name:"COMPETITOR", min:250, icon:"Ⅱ", model:"Steel Edge" },
      { key:"challenger", name:"CHALLENGER", min:750, icon:"Ⅲ", model:"Sapphire Drive" },
      { key:"contender", name:"CONTENDER", min:1500, icon:"Ⅳ", model:"Crimson Force" },
      { key:"elite", name:"ELITE", min:3000, icon:"Ⅴ", model:"Platinum Pulse" },
      { key:"master", name:"MASTER", min:5000, icon:"Ⅵ", model:"Royal Amethyst" },
      { key:"legend", name:"LEGEND", min:8000, icon:"Ⅶ", model:"Cosmic Gold" },
      { key:"icon", name:"ICON", min:12000, icon:"Ⅷ", model:"Obsidian Prism" },
      { key:"immortal", name:"IMMORTAL", min:18000, icon:"∞", model:"Aurora Diamond" }
    ];
  }

  function achievementPrestigeLevel(xp) {
    const levels = achievementPrestigeLevels();
    let current = levels[0];
    for (const level of levels) if (Number(xp) >= level.min) current = level;
    const index = levels.findIndex(level => level.key === current.key);
    const next = levels[index + 1] || null;
    const span = next ? Math.max(1, next.min - current.min) : 1;
    const progress = next ? intelligenceClamp((Number(xp) - current.min) / span * 100, 0, 100) : 100;
    return { ...current, next, progress };
  }

  function achievementRarityMeta(key) {
    const map = {
      starter:{ key:"starter", label:intelligenceCopy("Başlangıç","Starter"), difficulty:1, xp:100, symbol:"B", tone:"bronze" },
      advanced:{ key:"advanced", label:intelligenceCopy("Gelişmiş","Advanced"), difficulty:2, xp:225, symbol:"G", tone:"silver" },
      rare:{ key:"rare", label:intelligenceCopy("Nadir","Rare"), difficulty:3, xp:450, symbol:"N", tone:"gold" },
      elite:{ key:"elite", label:"Elite", difficulty:4, xp:850, symbol:"E", tone:"platinum" },
      legendary:{ key:"legendary", label:intelligenceCopy("Efsanevi","Legendary"), difficulty:5, xp:1450, symbol:"L", tone:"legendary" },
      mythic:{ key:"mythic", label:intelligenceCopy("Mitik","Mythic"), difficulty:6, xp:2600, symbol:"M", tone:"mythic" },
      secret:{ key:"secret", label:intelligenceCopy("Gizli Mitik","Secret Mythic"), difficulty:7, xp:3800, symbol:"?", tone:"secret" }
    };
    return map[key] || map.starter;
  }

  function achievementLocalizedDescription(key, fallback) {
    const en = {
      "first-blood":"Record the first official win of your career.",
      "goal-hunter":"Score at least 4 goals in a single match.",
      "five-star-fury":"Score at least 5 goals in a single match.",
      "seven-heaven":"Score at least 7 goals in a single match.",
      "ten-heaven":"Score at least 10 goals in a single match.",
      "beyond-heaven":"Go beyond normal scoring limits with 12+ goals in one match.",
      "winning-habit":"Win 3 official matches in a row.",
      "hot-streak":"Win 5 official matches in a row.",
      "royal-run":"Win 7 official matches in a row.",
      "winning-king":"Win 10 official matches in a row and claim the winning throne.",
      "eternal-crown":"Turn the streak into a dynasty with 15 consecutive wins.",
      "still-standing":"Remain unbeaten for 5 matches.",
      "unbroken-ten":"Build a 10-match unbeaten run.",
      "iron-reign":"Rule without defeat for 15 matches.",
      "untouchable":"Go 20 matches without a defeat.",
      "immortal-run":"Build a historic 25-match unbeaten run.",
      "giant-killer":"Defeat an opponent rated stronger by the Elo model.",
      "king-slayer":"Beat an opponent while starting at least 150 Elo points behind.",
      "elo-emperor":"Raise your career peak Elo to 1800.",
      "comeback-king":"Come from at least two goals behind and win.",
      "phoenix-rising":"Come from three or more goals behind and win.",
      "last-minute-hero":"Score the winning goal after the 85th minute.",
      "pressure-king":"Reach a Mental Index above 85 across at least 10 high-pressure matches.",
      "final-boss":"Combine at least two titles with an 85+ Mental Index.",
      "team-explorer":"Play with 5 different teams during your career.",
      "world-traveller":"Take the field with 10 different teams.",
      "ultimate-chameleon":"Win at least once with 15 different teams.",
      "team-specialist":"Record 5 wins with the same team.",
      "club-legend":"Reach 10 wins with the same team.",
      "iron-veteran":"Play 40 official matches.",
      "century-club":"Cross the 100-match career milestone.",
      "dynasty":"Win at least two FIFA tournament titles.",
      "triple-crown":"Lift the trophy in three different tournaments.",
      "perfect-campaign":"Complete the active tournament by winning every match you play.",
      "invincible-champion":"Win the tournament without losing a match.",
      "heavens-chosen":"Combine Seven Heaven, Ten Heaven, Winning King and a title in one career.",
      "immortal-king":"Combine Winning King, The Untouchable, a title and a 90+ Mental Index."
    };
    return intelligenceLanguage()==="en" ? (en[key] || fallback) : fallback;
  }

  function achievementPlayerCareer(matches, name) {
    const list = matches.filter(match => match.homeName === name || match.awayName === name);
    let currentWins = 0, currentUnbeaten = 0, maxWins = 0, maxUnbeaten = 0;
    let totalWins = 0, totalDraws = 0, totalLosses = 0, goals = 0, conceded = 0;
    let maxGoals = 0, maxMargin = 0, closeWins = 0, differentOpponents = new Set();
    const teams = new Map();
    const teamWins = new Map();
    const results = [];
    for (const match of list) {
      const isHome = match.homeName === name;
      const gf = Number(isHome ? match.homeScore : match.awayScore) || 0;
      const ga = Number(isHome ? match.awayScore : match.homeScore) || 0;
      const opponent = isHome ? match.awayName : match.homeName;
      const team = normalizeTeamName(isHome ? match.homeTeam : match.awayTeam);
      const winner = match.winnerName || (match.homeScore > match.awayScore ? match.homeName : match.awayScore > match.homeScore ? match.awayName : "");
      const result = !winner ? "D" : winner === name ? "W" : "L";
      results.push({ result, gf, ga, opponent, team, match });
      goals += gf; conceded += ga; maxGoals = Math.max(maxGoals, gf); maxMargin = Math.max(maxMargin, gf - ga);
      if (opponent) differentOpponents.add(opponent);
      if (team) teams.set(team, (teams.get(team) || 0) + 1);
      if (result === "W") {
        totalWins += 1;
        currentWins += 1;
        currentUnbeaten += 1;
        maxWins = Math.max(maxWins, currentWins);
        maxUnbeaten = Math.max(maxUnbeaten, currentUnbeaten);
        if (team) teamWins.set(team, (teamWins.get(team) || 0) + 1);
        if (Math.abs(gf - ga) <= 1) closeWins += 1;
      } else if (result === "D") {
        totalDraws += 1;
        currentWins = 0;
        currentUnbeaten += 1;
        maxUnbeaten = Math.max(maxUnbeaten, currentUnbeaten);
      } else {
        totalLosses += 1;
        currentWins = 0;
        currentUnbeaten = 0;
      }
    }
    const uniqueWinningTeams = [...teamWins.values()].filter(value => value > 0).length;
    const bestTeamWins = [...teamWins.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],"tr"))[0] || ["",0];
    return {
      games:list.length, wins:totalWins, draws:totalDraws, losses:totalLosses, goals, conceded,
      currentWins, currentUnbeaten, maxWins, maxUnbeaten, maxGoals, maxMargin, closeWins,
      opponents:differentOpponents.size, teams:teams.size, winningTeams:uniqueWinningTeams,
      bestTeam:bestTeamWins[0], bestTeamWins:bestTeamWins[1], results
    };
  }

  function buildAchievements() {
    const names = intelligenceNames();
    const matches = buildUnifiedAllTimeMatches();
    const allTime = buildAllTimeAnalytics();
    const form = buildFormAnalytics(20,"all");
    const elo = buildEloAnalytics();
    const pressure = buildPressureChamber();
    const teamAnalytics = buildTeamAnalytics();
    const currentCompleted = allCurrentMatches().filter(matchComplete);
    const currentChampionId = state.current.knockout?.final && matchComplete(state.current.knockout.final) ? matchWinnerId(state.current.knockout.final) : null;
    const currentChampionName = currentChampionId ? playerName(currentChampionId) : "";
    const currentResultsByName = new Map(names.map(name => [name, { games:0,wins:0,draws:0,losses:0 }]));
    currentCompleted.forEach(match => {
      const winnerId = matchWinnerId(match);
      for (const side of ["home","away"]) {
        const id = side === "home" ? match.homeId : match.awayId;
        const name = playerName(id);
        if (!currentResultsByName.has(name)) currentResultsByName.set(name,{games:0,wins:0,draws:0,losses:0});
        const row = currentResultsByName.get(name);
        row.games += 1;
        if (!winnerId) row.draws += 1;
        else if (winnerId === id) row.wins += 1;
        else row.losses += 1;
      }
    });

    const definitions = [
      { key:"first-blood", title:"First Blood", icon:"Ⅰ", rarity:"starter", target:1, metric:"wins", desc:"Kariyerindeki ilk resmî galibiyetini al." },
      { key:"goal-hunter", title:"Goal Hunter", icon:"4", rarity:"starter", target:4, metric:"maxGoals", desc:"Tek maçta en az 4 gol at." },
      { key:"five-star-fury", title:"Five-Star Fury", icon:"5★", rarity:"advanced", target:5, metric:"maxGoals", desc:"Tek maçta en az 5 gol at." },
      { key:"seven-heaven", title:"Seven Heaven", icon:"7H", rarity:"rare", target:7, metric:"maxGoals", desc:"Tek maçta en az 7 gol at." },
      { key:"ten-heaven", title:"Ten Heaven", icon:"10H", rarity:"legendary", target:10, metric:"maxGoals", desc:"Tek maçta en az 10 gol at." },
      { key:"beyond-heaven", title:"Beyond Heaven", icon:"∞H", rarity:"secret", target:12, metric:"maxGoals", desc:"Gol sınırlarının ötesine geç: bir maçta 12+ gol.", hidden:true },
      { key:"winning-habit", title:"Winning Habit", icon:"W3", rarity:"advanced", target:3, metric:"maxWins", desc:"Üst üste 3 resmî maç kazan." },
      { key:"hot-streak", title:"Hot Streak", icon:"W5", rarity:"rare", target:5, metric:"maxWins", desc:"Üst üste 5 resmî maç kazan." },
      { key:"royal-run", title:"Royal Run", icon:"W7", rarity:"elite", target:7, metric:"maxWins", desc:"Üst üste 7 resmî maç kazan." },
      { key:"winning-king", title:"Winning King", icon:"♛", rarity:"legendary", target:10, metric:"maxWins", desc:"Üst üste 10 resmî maç kazan ve galibiyet tahtını ele geçir.", titleUnlock:"WINNING KING" },
      { key:"eternal-crown", title:"Eternal Crown", icon:"♛15", rarity:"mythic", target:15, metric:"maxWins", desc:"Üst üste 15 maç kazanarak seriyi bir hanedana dönüştür.", titleUnlock:"ETERNAL CROWN" },
      { key:"still-standing", title:"Still Standing", icon:"U5", rarity:"advanced", target:5, metric:"maxUnbeaten", desc:"5 maç boyunca mağlup olma." },
      { key:"unbroken-ten", title:"Unbroken Ten", icon:"U10", rarity:"rare", target:10, metric:"maxUnbeaten", desc:"10 maçlık yenilmezlik serisi yakala." },
      { key:"iron-reign", title:"Iron Reign", icon:"U15", rarity:"legendary", target:15, metric:"maxUnbeaten", desc:"15 maç boyunca yenilmeden hükmet." },
      { key:"untouchable", title:"The Untouchable", icon:"U20", rarity:"mythic", target:20, metric:"maxUnbeaten", desc:"20 maç boyunca mağlubiyet yüzü görme.", titleUnlock:"THE UNTOUCHABLE" },
      { key:"immortal-run", title:"Immortal Run", icon:"U25", rarity:"secret", target:25, metric:"maxUnbeaten", desc:"25 maçlık tarihî yenilmezlik serisi.", hidden:true, titleUnlock:"IMMORTAL RUN" },
      { key:"giant-killer", title:"Giant Killer", icon:"♜", rarity:"rare", target:1, metric:"giantWins", desc:"Elo modelinde senden güçlü bir rakibi sürpriz şekilde mağlup et." },
      { key:"king-slayer", title:"King Slayer", icon:"⚔", rarity:"elite", target:1, metric:"majorUpsets", desc:"Maç öncesinde en az 150 Elo geride olduğun rakibi mağlup et." },
      { key:"elo-emperor", title:"Elo Emperor", icon:"1800", rarity:"legendary", target:1800, metric:"eloPeak", desc:"Kariyer Elo zirveni 1800 seviyesine çıkar.", titleUnlock:"ELO EMPEROR" },
      { key:"comeback-king", title:"Comeback King", icon:"↺2", rarity:"rare", target:1, metric:"comeback2", desc:"En az iki fark geriden gelerek maçı kazan." },
      { key:"phoenix-rising", title:"Phoenix Rising", icon:"↺3", rarity:"legendary", target:1, metric:"comeback3", desc:"Üç veya daha fazla farktan geri dönerek kazan.", titleUnlock:"PHOENIX RISING" },
      { key:"last-minute-hero", title:"Last-Minute Hero", icon:"90+", rarity:"elite", target:1, metric:"lateWins", desc:"85. dakikadan sonra gelen golle maçı kazan." },
      { key:"pressure-king", title:"Pressure King", icon:"P85", rarity:"legendary", target:85, metric:"mentalIndex", desc:"En az 10 yüksek baskı maçıyla Mental Index değerini 85 üzerine çıkar.", condition:metric=>metric.highPressureGames>=10, titleUnlock:"PRESSURE KING" },
      { key:"final-boss", title:"Final Boss", icon:"FB", rarity:"mythic", target:2, metric:"titles", desc:"En az iki şampiyonluk ve 85+ Mental Index ile büyük maçların son patronu ol.", condition:metric=>metric.mentalIndex>=85, titleUnlock:"THE FINAL BOSS" },
      { key:"team-explorer", title:"Team Explorer", icon:"T5", rarity:"advanced", target:5, metric:"teams", desc:"Kariyerinde 5 farklı takımla oyna." },
      { key:"world-traveller", title:"World Traveller", icon:"T10", rarity:"rare", target:10, metric:"teams", desc:"10 farklı takımla sahaya çık." },
      { key:"ultimate-chameleon", title:"Ultimate Chameleon", icon:"T15", rarity:"legendary", target:15, metric:"winningTeams", desc:"15 farklı takımla en az bir galibiyet al." },
      { key:"team-specialist", title:"Team Specialist", icon:"TS5", rarity:"advanced", target:5, metric:"bestTeamWins", desc:"Aynı takımla 5 galibiyet al." },
      { key:"club-legend", title:"Club Legend", icon:"CL10", rarity:"elite", target:10, metric:"bestTeamWins", desc:"Aynı takımla 10 galibiyete ulaş." },
      { key:"iron-veteran", title:"Iron Veteran", icon:"40", rarity:"advanced", target:40, metric:"games", desc:"40 resmî karşılaşmaya çık." },
      { key:"century-club", title:"Century Club", icon:"100", rarity:"legendary", target:100, metric:"games", desc:"100 resmî maçlık kariyer barajını aş." },
      { key:"dynasty", title:"Dynasty", icon:"♛2", rarity:"legendary", target:2, metric:"titles", desc:"En az iki FIFA turnuvasında şampiyon ol.", titleUnlock:"DYNASTY" },
      { key:"triple-crown", title:"Triple Crown", icon:"♛3", rarity:"mythic", target:3, metric:"titles", desc:"Üç farklı turnuvada şampiyonluk kupasını kaldır.", titleUnlock:"TRIPLE CROWN" },
      { key:"perfect-campaign", title:"Perfect Campaign", icon:"100%", rarity:"mythic", target:1, metric:"perfectCurrent", desc:"Aktif turnuvayı oynadığın bütün maçları kazanarak tamamla." },
      { key:"invincible-champion", title:"Invincible Champion", icon:"∞♛", rarity:"mythic", target:1, metric:"invincibleChampion", desc:"Turnuvayı yenilgisiz şampiyon tamamla.", titleUnlock:"INVINCIBLE CHAMPION" },
      { key:"heavens-chosen", title:"Heaven's Chosen", icon:"HC", rarity:"mythic", target:1, metric:"heavensChosen", desc:"Seven Heaven, Ten Heaven, Winning King ve şampiyonluğu aynı kariyerde birleştir.", titleUnlock:"HEAVEN'S CHOSEN" },
      { key:"immortal-king", title:"Immortal King", icon:"IK", rarity:"secret", target:1, metric:"immortalKing", desc:"Winning King, The Untouchable, şampiyonluk ve 90+ Mental Index birleşimi.", hidden:true, titleUnlock:"IMMORTAL KING" }
    ];

    const playerRows = names.map(name => {
      const career = achievementPlayerCareer(matches, name);
      const allTimeRow = allTime.playerMap.get(name) || {};
      const eloRow = elo.playerMap.get(name) || {};
      const pressureRow = pressure.playerMap.get(name) || {};
      const currentRow = currentResultsByName.get(name) || {games:0,wins:0,draws:0,losses:0};
      const eloRecords = elo.records.filter(record => record.winner === name);
      const giantWins = eloRecords.filter(record => record.surprise).length;
      const majorUpsets = eloRecords.filter(record => {
        if (record.winner !== name) return false;
        return record.home === name ? record.beforeAway-record.beforeHome >= 150 : record.beforeHome-record.beforeAway >= 150;
      }).length;
      let comeback2 = 0, comeback3 = 0, lateWins = 0;
      currentCompleted.forEach(match => {
        if (playerName(matchWinnerId(match)) !== name) return;
        const insight = analyzeLiveArchive(match);
        if (insight.comeback && insight.maxDeficit >= 2) comeback2 += 1;
        if (insight.comeback && insight.maxDeficit >= 3) comeback3 += 1;
        if (insight.lateWinner) lateWins += 1;
      });
      const currentComplete = Boolean(currentChampionName);
      const perfectCurrent = currentComplete && currentChampionName === name && currentRow.games > 0 && currentRow.wins === currentRow.games ? 1 : 0;
      const invincibleChampion = currentComplete && currentChampionName === name && currentRow.losses === 0 ? 1 : 0;
      const baseMetric = {
        ...career,
        giantWins, majorUpsets, comeback2, comeback3, lateWins,
        eloPeak:Number(eloRow.peak)||1500,
        elo:Number(eloRow.rating)||1500,
        titles:Number(allTimeRow.titles)||0,
        finals:Number(allTimeRow.finals)||0,
        mentalIndex:Number(pressureRow.mentalIndex)||50,
        highPressureGames:Number(pressureRow.highPressureGames)||0,
        perfectCurrent, invincibleChampion
      };
      baseMetric.heavensChosen = career.maxGoals>=10 && career.maxWins>=10 && baseMetric.titles>=1 ? 1 : 0;
      baseMetric.immortalKing = career.maxWins>=10 && career.maxUnbeaten>=20 && baseMetric.titles>=1 && baseMetric.mentalIndex>=90 ? 1 : 0;

      const achievements = definitions.map(def => {
        const current = Number(baseMetric[def.metric]) || 0;
        const conditionOk = typeof def.condition === "function" ? Boolean(def.condition(baseMetric)) : true;
        const unlocked = current >= def.target && conditionOk;
        const rarity = achievementRarityMeta(def.rarity);
        return {
          ...def, current, unlocked, rarity,
          xp: unlocked ? rarity.xp : 0,
          progress: intelligenceClamp(current / Math.max(1,def.target) * 100, 0, 100),
          progressLabel:def.metric==="eloPeak" ? `${Math.round(current)} / ${def.target}` : `${Math.min(current,def.target)} / ${def.target}`
        };
      });
      const unlocked = achievements.filter(item=>item.unlocked);
      const xp = unlocked.reduce((sum,item)=>sum+item.xp,0);
      const prestige = achievementPrestigeLevel(xp);
      const activeTitle = unlocked.filter(item=>item.titleUnlock).sort((a,b)=>b.rarity.difficulty-a.rarity.difficulty || b.xp-a.xp)[0]?.titleUnlock || prestige.name;
      const rarityCounts = unlocked.reduce((map,item)=>{ map[item.rarity.key]=(map[item.rarity.key]||0)+1; return map; },{});
      const closest = achievements.filter(item=>!item.unlocked && !item.hidden).sort((a,b)=>b.progress-a.progress || a.rarity.difficulty-b.rarity.difficulty).slice(0,3);
      const rarest = [...unlocked].sort((a,b)=>b.rarity.difficulty-a.rarity.difficulty || b.xp-a.xp).slice(0,4);
      return {
        name, metrics:baseMetric, achievements, unlocked, badges:unlocked, xp, prestige, activeTitle, rarityCounts, closest, rarest,
        elo:baseMetric.elo, form:form.playerMap.get(name)?.formIndex || 50
      };
    }).sort((a,b)=>b.xp-a.xp || b.unlocked.length-a.unlocked.length || b.elo-a.elo || a.name.localeCompare(b.name,"tr"))
      .map((row,index)=>({...row,rank:index+1}));

    const catalog = definitions.map(def=>({
      ...def,
      rarity:achievementRarityMeta(def.rarity),
      unlockedCount:playerRows.filter(row=>row.achievements.find(item=>item.key===def.key)?.unlocked).length
    }));
    return {
      players:playerRows,
      playerMap:new Map(playerRows.map(row=>[row.name,row])),
      catalog,
      totalUnlocked:playerRows.reduce((sum,row)=>sum+row.unlocked.length,0),
      totalXP:playerRows.reduce((sum,row)=>sum+row.xp,0),
      leader:playerRows[0]||null,
      rarestUnlocked:[...catalog].filter(item=>item.unlockedCount>0).sort((a,b)=>a.unlockedCount-b.unlockedCount || b.rarity.difficulty-a.rarity.difficulty)[0]||null
    };
  }


  function renderAchievementProgress(item) {
    const hiddenLocked = item.hidden && !item.unlocked;
    const title = hiddenLocked ? intelligenceCopy("Gizli Başarım","Hidden Achievement") : item.title;
    const description = hiddenLocked
      ? intelligenceCopy("Koşul keşfedilene kadar gizli kalır.","The condition remains hidden until it is discovered.")
      : achievementLocalizedDescription(item.key,item.desc);
    const status = item.unlocked ? intelligenceCopy("TAMAMLANDI","COMPLETED") : item.progressLabel;
    return `<article class="achievement-universe-badge rarity-${item.rarity.key} ${item.unlocked?"unlocked":"locked"} ${hiddenLocked?"hidden-achievement":""}">
      <div class="achievement-badge-top"><span class="achievement-badge-icon">${hiddenLocked?"?":escapeHTML(item.icon)}</span><div><small>${item.rarity.label} · ${"◆".repeat(Math.min(6,item.rarity.difficulty))}</small><strong>${escapeHTML(title)}</strong></div><b>${item.unlocked?`+${item.xp} XP`:intelligenceCopy("KİLİTLİ","LOCKED")}</b></div>
      <p>${escapeHTML(description)}</p>
      <div class="achievement-progress-track"><i style="width:${item.progress}%"></i></div>
      <footer><span>${escapeHTML(status)}</span><em>${intelligenceCopy("Zorluk","Difficulty")} ${item.rarity.difficulty}/7</em></footer>
    </article>`;
  }

  function renderPrestigeCard(player, compact=false) {
    const level = player.prestige;
    const locale = intelligenceLanguage()==="en" ? "en-GB" : "tr-TR";
    const nextText = level.next
      ? intelligenceCopy(`${level.next.name} için ${Math.max(0,level.next.min-player.xp)} XP`,`${Math.max(0,level.next.min-player.xp)} XP to ${level.next.name}`)
      : intelligenceCopy("Maksimum Prestige seviyesi","Maximum Prestige level");
    return `<article class="prestige-card prestige-${level.key} ${compact?"compact":""}">
      <div class="prestige-card-orbit"><span>${escapeHTML(level.icon)}</span><i></i><b></b></div>
      <div class="prestige-card-copy"><small>${escapeHTML(level.model)}</small><h3>${escapeHTML(player.name)}</h3><strong>${escapeHTML(player.activeTitle)}</strong><div class="prestige-rank-line"><span>#${player.rank}</span><b>${level.name}</b><em>${player.xp.toLocaleString(locale)} XP</em></div><div class="prestige-progress"><i style="width:${level.progress}%"></i></div><p>${escapeHTML(nextText)} · ${player.unlocked.length}/${player.achievements.length} ${intelligenceCopy("rozet","badges")}</p></div>
    </article>`;
  }

  function renderAchievementsSection() {
    const data = buildAchievements();
    const rarityOrder = ["starter","advanced","rare","elite","legendary","mythic","secret"];
    const levels = achievementPrestigeLevels();
    const locale = intelligenceLanguage()==="en" ? "en-GB" : "tr-TR";
    return `<div class="intel-section-stack">
      <section class="achievement-universe-hero"><div><div class="eyebrow">FIFA 9 · ACHIEVEMENT UNIVERSE v24</div><h2>${intelligenceCopy("Rozetler, Ünvanlar & Prestige","Badges, Titles & Prestige")}</h2><p>${intelligenceCopy("Kolay başlangıç başarılarından tarihî Mitik ünvanlara uzanan, zorluk derecesi ve nadirliğe göre sınıflandırılmış yaşayan kariyer sistemi.","A living career system ranging from accessible starter achievements to historic Mythic titles, classified by difficulty and rarity.")}</p><div class="achievement-hero-actions"><span>${data.totalUnlocked} ${intelligenceCopy("AÇILAN ROZET","BADGES UNLOCKED")}</span><span>${data.totalXP.toLocaleString(locale)} ${intelligenceCopy("TOPLAM XP","TOTAL XP")}</span><span>${data.catalog.length} ${intelligenceCopy("KARİYER HEDEFİ","CAREER TARGETS")}</span></div></div><div class="achievement-hero-crown"><span>PRESTIGE LEADER</span><strong>${escapeHTML(data.leader?.name||"—")}</strong><b>${data.leader?.xp.toLocaleString(locale)||0} XP</b><small>${escapeHTML(data.leader?.activeTitle||"")}</small></div></section>

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Prestige Level Kartları","Prestige Level Cards")}</h3><div class="panel-subtitle">${intelligenceCopy("Her seviye ayrı renk, ışık modeli ve kart kimliği kullanır.","Every level uses a distinct colour, lighting model and card identity.")}</div></div><span class="badge badge-gold">9 LEVELS</span></div>
        <div class="prestige-level-legend">${levels.map(level=>`<div class="prestige-level-chip prestige-${level.key}"><span>${escapeHTML(level.icon)}</span><div><strong>${level.name}</strong><small>${level.model} · ${level.min.toLocaleString(locale)} XP</small></div></div>`).join("")}</div>
      </section>

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Kariyer Prestige Sıralaması","Career Prestige Ranking")}</h3><div class="panel-subtitle">${intelligenceCopy("Elo güncel gücü, Prestige ise kariyer mirası ve başarı çeşitliliğini temsil eder.","Elo represents current strength, while Prestige represents career legacy and achievement diversity.")}</div></div><span class="badge badge-blue">LIVE CAREER</span></div>
        <div class="prestige-card-grid">${data.players.map(player=>renderPrestigeCard(player,true)).join("")}</div>
      </section>

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Oyuncu Rozet Vitrinleri","Player Badge Cabinets")}</h3><div class="panel-subtitle">${intelligenceCopy("En nadir başarımlar, aktif ünvan ve bir sonraki hedefler.","The rarest achievements, active title and next targets.")}</div></div><span class="badge badge-gold">AUTO UNLOCK</span></div>
        <div class="achievement-player-showcase">${data.players.map(player=>`<article class="achievement-player-cabinet">
          <header><div class="achievement-avatar prestige-${player.prestige.key}">${escapeHTML(player.name.charAt(0).toUpperCase())}</div><div><span>#${player.rank} · ${player.prestige.name}</span><h3>${escapeHTML(player.name)}</h3><strong>${escapeHTML(player.activeTitle)}</strong></div><b>${player.xp.toLocaleString(locale)} XP</b></header>
          <div class="achievement-cabinet-rarest">${player.rarest.length?player.rarest.map(item=>`<div class="mini-achievement rarity-${item.rarity.key}"><span>${escapeHTML(item.icon)}</span><strong>${escapeHTML(item.title)}</strong><small>${item.rarity.label}</small></div>`).join(""):`<div class="intel-no-badge">${intelligenceCopy("İlk rozet için mücadele devam ediyor.","The chase for the first badge continues.")}</div>`}</div>
          <div class="achievement-next-goals"><span>${intelligenceCopy("SONRAKİ HEDEFLER","NEXT TARGETS")}</span>${player.closest.length?player.closest.map(item=>`<div><strong>${escapeHTML(item.title)}</strong><i><b style="width:${item.progress}%"></b></i><small>${escapeHTML(item.progressLabel)}</small></div>`).join(""):`<p>${intelligenceCopy("Bütün açık hedefler tamamlandı.","All visible targets have been completed.")}</p>`}</div>
          <footer><span>${player.unlocked.length}/${player.achievements.length} ${intelligenceCopy("tamamlandı","completed")}</span><span>${intelligenceCopy("En yüksek seri","Peak runs")}: ${player.metrics.maxWins}W · ${player.metrics.maxUnbeaten}U</span></footer>
        </article>`).join("")}</div>
      </section>

      ${rarityOrder.map(rarityKey=>{
        const meta=achievementRarityMeta(rarityKey);
        const items=data.catalog.filter(item=>item.rarity.key===rarityKey);
        return `<section class="panel achievement-rarity-section rarity-${rarityKey}"><div class="panel-header"><div><h3 class="panel-title">${meta.label} ${intelligenceCopy("Başarımlar","Achievements")}</h3><div class="panel-subtitle">${intelligenceCopy("Zorluk","Difficulty")} ${meta.difficulty}/7 · ${intelligenceCopy("Temel ödül","Base reward")} ${meta.xp.toLocaleString(locale)} Prestige XP</div></div><span class="badge">${items.length} ${intelligenceCopy("ROZET","BADGES")}</span></div><div class="achievement-catalog-v24">${items.map(item=>`<article class="${item.hidden?"hidden-catalog":""}"><span>${item.hidden?"?":escapeHTML(item.icon)}</span><div><small>${item.rarity.label} · ${item.unlockedCount}/${data.players.length} ${intelligenceCopy("oyuncu","players")}</small><strong>${item.hidden?intelligenceCopy("Gizli Mitik Başarım","Secret Mythic Achievement"):escapeHTML(item.title)}</strong><p>${item.hidden?intelligenceCopy("Koşulu açılana kadar görünmez.","The condition remains hidden until unlocked."):escapeHTML(achievementLocalizedDescription(item.key,item.desc))}</p></div><b>+${item.rarity.xp} XP</b></article>`).join("")}</div></section>`;
      }).join("")}

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Canlı İlerleme Merkezi","Live Progress Centre")}</h3><div class="panel-subtitle">${intelligenceCopy("Her oyuncunun tamamlanmış ve kilitli rozetleri gerçek zamanlı ilerleme ile izlenir.","Every player’s completed and locked badges are tracked with real-time progress.")}</div></div><span class="badge badge-blue">PROGRESS TRACKING</span></div>
        <div class="achievement-progress-player-tabs">${data.players.map(player=>`<details ${player.rank===1?"open":""}><summary><span>#${player.rank}</span><strong>${escapeHTML(player.name)}</strong><b>${player.unlocked.length} ${intelligenceCopy("rozet","badges")} · ${player.xp.toLocaleString(locale)} XP</b></summary><div class="achievement-progress-grid">${player.achievements.map(renderAchievementProgress).join("")}</div></details>`).join("")}</div>
      </section>
    </div>`;
  }


  function simulatorContext() {
    if (!state.current.league.generated) return { key: "none", label: "Kura bekleniyor", ids: [], baseMatches: [], remaining: [] };
    if (!leagueFinished()) return { key: "league", label: "League Phase", ids: state.current.participants.map(p=>p.id), baseMatches: leagueMatches(), remaining: leagueMatches().filter(match=>!matchComplete(match)) };
    if (state.current.phase2.generated && !phase2Finished()) {
      const group = intelligenceSimulatorGroup === "silver" ? "silver" : "gold";
      return { key: group, label: group === "gold" ? "Altın Grup" : "Gümüş Grup", ids: group === "gold" ? state.current.phase2.goldIds : state.current.phase2.silverIds, baseMatches: [...leagueMatches(), ...(group === "gold" ? goldMatches() : silverMatches())], remaining: (group === "gold" ? goldMatches() : silverMatches()).filter(match=>!matchComplete(match)) };
    }
    return { key: "completed", label: "Aktif lig aşaması tamamlandı", ids: [], baseMatches: [], remaining: [] };
  }

  function simulatedMatch(match) {
    const scenario = qualificationScenario[match.id];
    if (!scenario || scenario.home === "" || scenario.away === "") return match;
    return { ...match, homeScore: Number(scenario.home), awayScore: Number(scenario.away), tiebreakWinnerId: null };
  }

  function simulatorStatus(row, context) {
    if (context.key === "league") {
      if (row.rank <= 6) return { key: "gold", label: "ALTIN" };
      if (row.rank <= 12) return { key: "silver", label: "GÜMÜŞ" };
      return { key: "out", label: "ELENİR" };
    }
    if (context.key === "gold") {
      if (row.rank === 1) return { key: "direct", label: "DİREKT YF" };
      if (row.rank <= 4) return { key: "playoff", label: "ELEME" };
      return { key: "out", label: "ELENİR" };
    }
    if (context.key === "silver") {
      if (row.rank <= 3) return { key: "playoff", label: "ELEME" };
      return { key: "out", label: "ELENİR" };
    }
    return { key: "standard", label: "–" };
  }

  function simulationFingerprint() {
    const compactMatches = allCurrentMatches().map(match => [
      match.id, match.phase, Number(match.round) || 0, match.homeId, match.awayId,
      Number.isFinite(match.homeScore) ? Number(match.homeScore) : null,
      Number.isFinite(match.awayScore) ? Number(match.awayScore) : null,
      match.tiebreakWinnerId || ""
    ]);
    return JSON.stringify({
      edition: state.current.edition,
      players: state.current.participants.map(player => [player.id, player.name]),
      leagueGenerated: state.current.league.generated,
      phase2Generated: state.current.phase2.generated,
      goldIds: state.current.phase2.goldIds,
      silverIds: state.current.phase2.silverIds,
      knockoutGenerated: state.current.knockout.generated,
      matches: compactMatches
    });
  }

  function simulationRoundRobin(ids, phase) {
    const list = [...ids];
    if (list.length % 2) list.push(null);
    const rounds = [];
    let rotation = [...list];
    for (let round = 0; round < rotation.length - 1; round++) {
      for (let index = 0; index < rotation.length / 2; index++) {
        let homeId = rotation[index];
        let awayId = rotation[rotation.length - 1 - index];
        if (!homeId || !awayId) continue;
        if ((round + index) % 2 === 1) [homeId, awayId] = [awayId, homeId];
        rounds.push({
          id: `simulation-${phase}-${round + 1}-${homeId}-${awayId}`,
          phase,
          round: round + 1,
          homeId,
          awayId,
          homeScore: null,
          awayScore: null,
          tiebreakWinnerId: null,
          allowDraw: true,
          seriesKey: null
        });
      }
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, rotation.length - 1)];
    }
    return rounds;
  }

  function simulationStandings(ids, matches) {
    const map = new Map(ids.map(id => [id, { id, mp:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 }]));
    for (const match of matches) {
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) continue;
      const home = map.get(match.homeId);
      const away = map.get(match.awayId);
      const winnerId = match.homeScore > match.awayScore ? match.homeId : match.awayScore > match.homeScore ? match.awayId : match.tiebreakWinnerId || null;
      if (home) {
        home.mp += 1; home.gf += Number(match.homeScore); home.ga += Number(match.awayScore);
        if (winnerId === home.id) { home.w += 1; home.pts += 3; }
        else if (!winnerId) { home.d += 1; home.pts += 1; }
        else home.l += 1;
      }
      if (away) {
        away.mp += 1; away.gf += Number(match.awayScore); away.ga += Number(match.homeScore);
        if (winnerId === away.id) { away.w += 1; away.pts += 3; }
        else if (!winnerId) { away.d += 1; away.pts += 1; }
        else away.l += 1;
      }
    }
    const rows = [...map.values()];
    rows.forEach(row => { row.gd = row.gf - row.ga; });
    rows.sort((a,b) => b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || b.w-a.w || playerName(a.id).localeCompare(playerName(b.id), "tr"));
    rows.forEach((row,index) => { row.rank = index + 1; });
    return rows;
  }

  function simulationNormal(rand) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }


  function simulationPoisson(lambda, rand) {
    const safe = Math.max(.05, Math.min(12, Number(lambda) || 0));
    if (safe > 7) return Math.max(0, Math.round(safe + Math.sqrt(safe) * simulationNormal(rand)));
    const threshold = Math.exp(-safe);
    let product = 1;
    let value = 0;
    do { value += 1; product *= rand(); } while (product > threshold && value < 34);
    return Math.max(0, value - 1);
  }

  function simulationWeightedScoreChoice(distribution, rand, outcome = "", representative = false) {
    let pool = outcome ? distribution.filter(row => row.outcome === outcome) : distribution;
    if (!pool.length) pool = distribution;
    if (representative) {
      const top = pool.slice(0, Math.min(18, pool.length));
      const total = top.reduce((sum,row)=>sum+Math.pow(Math.max(1e-12,row.probability),.72),0);
      let roll = rand() * (total || 1);
      for (const row of top) {
        roll -= Math.pow(Math.max(1e-12,row.probability),.72);
        if (roll <= 0) return row;
      }
      return top[0];
    }
    let roll = rand();
    for (const row of pool) {
      roll -= row.probability;
      if (roll <= 0) return row;
    }
    return pool[pool.length-1] || {homeScore:0,awayScore:0,outcome:"draw",probability:0};
  }

  function simulationRepresentativeOutcome(model, allowDraw, rand) {
    const source = {
      home:Number(model.market.home.probability)||.34,
      draw:allowDraw?(Number(model.market.draw.probability)||.32):0,
      away:Number(model.market.away.probability)||.34
    };
    const favorite = Math.max(source.home,source.draw,source.away);
    const power = favorite >= .62 ? 1.30 : favorite >= .52 ? 1.16 : 1.04;
    const weights={home:Math.pow(source.home,power),draw:allowDraw?Math.pow(source.draw,power):0,away:Math.pow(source.away,power)};
    const total=weights.home+weights.draw+weights.away||1;
    let roll=rand()*total;
    for(const key of ["home","draw","away"]) { roll-=weights[key]; if(roll<=0) return key; }
    return source.home>=source.away?"home":"away";
  }

  function simulationScenarioLabel(model, score) {
    const total=score.homeScore+score.awayScore;
    const margin=Math.abs(score.homeScore-score.awayScore);
    const favoriteOutcome=model.favoriteSide;
    const upset=score.outcome!=="draw" && score.outcome!==favoriteOutcome && model.favoriteProbability>=.54;
    if(upset) return intelligenceCopy("Sürpriz Senaryo","Upset Scenario");
    if(total>=10) return intelligenceCopy("Skor Patlaması","Score Explosion");
    if(total>=8&&margin<=2) return intelligenceCopy("Gol Düellosu","Goal Duel");
    if(margin>=4) return intelligenceCopy("Dominant Sonuç","Dominant Result");
    if(score.outcome==="draw") return intelligenceCopy("Denge Senaryosu","Balanced Scenario");
    if(margin===1) return intelligenceCopy("İnce Marj","Fine Margin");
    return model.tempoLabel||intelligenceCopy("Model Senaryosu","Model Scenario");
  }

  function buildTournamentSimulationEngine() {
    const context = oddsBuildContext();
    const matchupCache = new Map();
    function matchup(homeId, awayId, allowDraw = true, phase = "league", round = 1) {
      const key = `${homeId}|${awayId}|${allowDraw ? 1 : 0}|${phase}`;
      if (!matchupCache.has(key)) {
        const match = { id:`sim-model-${key}`, phase, round, homeId, awayId, allowDraw, homeScore:null, awayScore:null, tiebreakWinnerId:null };
        const odds = buildMatchOdds(match, context);
        const scoreDistribution = odds.scoreDistribution || simulationBuildScoreDistribution(odds, allowDraw, phase);
        matchupCache.set(key, { ...odds, scoreDistribution });
      }
      return matchupCache.get(key);
    }
    return { context, matchup };
  }

  function simulationStageLabel(match, custom = "") {
    if (custom) return custom;
    if (match.phase === "league") return `League Phase · Tur ${match.round}`;
    if (match.phase === "gold") return `Altın Grup · Tur ${match.round}`;
    if (match.phase === "silver") return `Gümüş Grup · Tur ${match.round}`;
    if (match.phase === "final") return "Büyük Final";
    return currentMatchStageLabel(match);
  }

  function resolveSimulationMatch(match, engine, rand, deterministic = false, customLabel = "") {
    if (matchComplete(match)) return { ...match, simulated:false, stageLabel:simulationStageLabel(match, customLabel) };
    const allowDraw = match.allowDraw !== false;
    const model = engine.matchup(match.homeId, match.awayId, allowDraw, match.phase, match.round);
    let score;
    if (deterministic) {
      const outcome = simulationRepresentativeOutcome(model, allowDraw, rand);
      score = simulationWeightedScoreChoice(model.scoreDistribution, rand, outcome, true);
    } else {
      score = simulationWeightedScoreChoice(model.scoreDistribution, rand, "", false);
    }
    const scenarioLabel = simulationScenarioLabel(model, score);
    return {
      ...match,
      homeScore:score.homeScore,
      awayScore:score.awayScore,
      tiebreakWinnerId:null,
      simulated:true,
      stageLabel:simulationStageLabel(match, customLabel),
      scenarioLabel,
      scorelineProbability:score.probability,
      model
    };
  }

  function simulationSeries(key, label, playerAId, playerBId, existing, engine, rand, deterministic, predictedMatches) {
    const usable = existing && existing.playerAId === playerAId && existing.playerBId === playerBId ? existing : null;
    const games = [];
    let winsA = 0;
    let winsB = 0;
    for (let index = 0; index < 3 && winsA < 2 && winsB < 2; index++) {
      const base = usable?.games?.[index] || {
        id:`simulation-${key}-${index + 1}-${playerAId}-${playerBId}`,
        phase:"knockout", round:index + 1, homeId:playerAId, awayId:playerBId,
        homeScore:null, awayScore:null, tiebreakWinnerId:null, allowDraw:false, seriesKey:key
      };
      const resolved = resolveSimulationMatch(base, engine, rand, deterministic, `${label} · Maç ${index + 1}`);
      games.push(resolved);
      const winner = resolved.homeScore > resolved.awayScore ? resolved.homeId : resolved.awayScore > resolved.homeScore ? resolved.awayId : resolved.tiebreakWinnerId;
      if (winner === playerAId) winsA += 1;
      if (winner === playerBId) winsB += 1;
      if (deterministic && resolved.simulated) predictedMatches.push(resolved);
    }
    return { key, label, playerAId, playerBId, winsA, winsB, games, winnerId:winsA >= 2 ? playerAId : playerBId };
  }

  function simulateTournamentOnce(engine, rand, deterministic = false) {
    const predictedMatches = [];
    const allIds = state.current.participants.map(player => player.id);
    const leagueResults = leagueMatches().map(match => {
      const resolved = resolveSimulationMatch(match, engine, rand, deterministic);
      if (deterministic && resolved.simulated) predictedMatches.push(resolved);
      return resolved;
    });
    const leagueTable = simulationStandings(allIds, leagueResults);
    const goldIds = state.current.phase2.generated ? [...state.current.phase2.goldIds] : leagueTable.slice(0,6).map(row => row.id);
    const silverIds = state.current.phase2.generated ? [...state.current.phase2.silverIds] : leagueTable.slice(6,12).map(row => row.id);
    const eliminatedIds = leagueTable.slice(12).map(row => row.id);

    const goldSource = state.current.phase2.generated ? goldMatches() : simulationRoundRobin(goldIds, "gold");
    const silverSource = state.current.phase2.generated ? silverMatches() : simulationRoundRobin(silverIds, "silver");
    const goldResults = goldSource.map(match => {
      const resolved = resolveSimulationMatch(match, engine, rand, deterministic);
      if (deterministic && resolved.simulated) predictedMatches.push(resolved);
      return resolved;
    });
    const silverResults = silverSource.map(match => {
      const resolved = resolveSimulationMatch(match, engine, rand, deterministic);
      if (deterministic && resolved.simulated) predictedMatches.push(resolved);
      return resolved;
    });
    const goldTable = simulationStandings(goldIds, [...leagueResults, ...goldResults]);
    const silverTable = simulationStandings(silverIds, [...leagueResults, ...silverResults]);
    const seeds = {
      gold1:goldTable[0]?.id, gold2:goldTable[1]?.id, gold3:goldTable[2]?.id, gold4:goldTable[3]?.id,
      silver1:silverTable[0]?.id, silver2:silverTable[1]?.id, silver3:silverTable[2]?.id
    };

    const ko = state.current.knockout.generated ? state.current.knockout : {};
    const qf1 = simulationSeries("qf1", "Eleme Eşleşmesi 1", seeds.gold2, seeds.silver3, ko.qf1, engine, rand, deterministic, predictedMatches);
    const qf2 = simulationSeries("qf2", "Eleme Eşleşmesi 2", seeds.gold3, seeds.silver2, ko.qf2, engine, rand, deterministic, predictedMatches);
    const qf3 = simulationSeries("qf3", "Eleme Eşleşmesi 3", seeds.gold4, seeds.silver1, ko.qf3, engine, rand, deterministic, predictedMatches);
    const sf1 = simulationSeries("sf1", "Yarı Final 1", seeds.gold1, qf2.winnerId, ko.sf1, engine, rand, deterministic, predictedMatches);
    const sf2 = simulationSeries("sf2", "Yarı Final 2", qf1.winnerId, qf3.winnerId, ko.sf2, engine, rand, deterministic, predictedMatches);

    let finalMatch;
    if (ko.final && ko.final.homeId === sf1.winnerId && ko.final.awayId === sf2.winnerId) finalMatch = ko.final;
    else finalMatch = { id:`simulation-final-${sf1.winnerId}-${sf2.winnerId}`, phase:"final", round:1, homeId:sf1.winnerId, awayId:sf2.winnerId, homeScore:null, awayScore:null, tiebreakWinnerId:null, allowDraw:false };
    const final = resolveSimulationMatch(finalMatch, engine, rand, deterministic, "Büyük Final");
    if (deterministic && final.simulated) predictedMatches.push(final);
    const championId = final.homeScore > final.awayScore ? final.homeId : final.awayScore > final.homeScore ? final.awayId : final.tiebreakWinnerId;

    return {
      leagueResults, leagueTable, goldIds, silverIds, eliminatedIds,
      goldResults, silverResults, goldTable, silverTable, seeds,
      qf:[qf1,qf2,qf3], semifinals:[sf1,sf2], final, championId,
      playoffIds:[seeds.gold2,seeds.gold3,seeds.gold4,seeds.silver1,seeds.silver2,seeds.silver3].filter(Boolean),
      semifinalIds:[seeds.gold1,qf2.winnerId,qf1.winnerId,qf3.winnerId].filter(Boolean),
      finalistIds:[sf1.winnerId,sf2.winnerId].filter(Boolean),
      predictedMatches
    };
  }

  function buildTournamentSimulation() {
    if (!state.current.league.generated || filledParticipants().length < 2) return null;
    const runs = [1000,5000,10000].includes(Number(tournamentSimulationRuns)) ? Number(tournamentSimulationRuns) : 1000;
    const fingerprint = simulationFingerprint();
    const cacheKey = `${fingerprint}|${runs}|${tournamentSimulationNonce}`;
    if (tournamentSimulationCache.key === cacheKey && tournamentSimulationCache.data) return tournamentSimulationCache.data;

    const engine = buildTournamentSimulationEngine();
    const ids = state.current.participants.map(player => player.id);
    const aggregates = new Map(ids.map(id => [id, {
      id, gold:0, silver:0, eliminated:0, playoff:0, directSemi:0, semi:0, final:0, champion:0,
      leagueRankTotal:0, leaguePointsTotal:0
    }]));
    const finalPairs = new Map();
    const seed = `fifa9-tournament-simulation-v25-${fingerprint}-${runs}-${tournamentSimulationNonce}`;
    const rand = seededRandom(seed);
    for (let index = 0; index < runs; index++) {
      const result = simulateTournamentOnce(engine, rand, false);
      result.leagueTable.forEach(row => {
        const agg = aggregates.get(row.id);
        if (!agg) return;
        agg.leagueRankTotal += row.rank;
        agg.leaguePointsTotal += row.pts;
      });
      result.goldIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).gold += 1; });
      result.silverIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).silver += 1; });
      result.eliminatedIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).eliminated += 1; });
      result.playoffIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).playoff += 1; });
      if (result.seeds.gold1 && aggregates.has(result.seeds.gold1)) aggregates.get(result.seeds.gold1).directSemi += 1;
      result.semifinalIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).semi += 1; });
      result.finalistIds.forEach(id => { if (aggregates.has(id)) aggregates.get(id).final += 1; });
      if (result.championId && aggregates.has(result.championId)) aggregates.get(result.championId).champion += 1;
      const pair = [...result.finalistIds].sort().join("|");
      if (pair) finalPairs.set(pair, (finalPairs.get(pair) || 0) + 1);
    }

    const elo = buildEloAnalytics();
    const eloRows = [...elo.players];
    const eloRank = new Map(eloRows.map((row,index) => [row.name,index + 1]));
    const rows = [...aggregates.values()].map(agg => {
      const name = playerName(agg.id);
      const eloRow = elo.playerMap.get(name) || { rating:1500, tier:intelligenceTier(1500) };
      return {
        ...agg,
        name,
        elo:eloRow.rating,
        eloTier:eloRow.tier,
        eloRank:eloRank.get(name) || 99,
        goldProbability:agg.gold / runs,
        silverProbability:agg.silver / runs,
        eliminatedProbability:agg.eliminated / runs,
        playoffProbability:agg.playoff / runs,
        directSemiProbability:agg.directSemi / runs,
        semiProbability:agg.semi / runs,
        finalProbability:agg.final / runs,
        championProbability:agg.champion / runs,
        expectedLeagueRank:agg.leagueRankTotal / runs,
        expectedLeaguePoints:agg.leaguePointsTotal / runs
      };
    }).sort((a,b) => b.championProbability-a.championProbability || b.finalProbability-a.finalProbability || b.elo-a.elo || a.name.localeCompare(b.name,"tr"));

    const mostLikely = simulateTournamentOnce(engine, seededRandom(`${seed}-path`), true);
    const finalPair = [...finalPairs.entries()].sort((a,b) => b[1]-a[1])[0] || null;
    const mostLikelyFinalIds = finalPair ? finalPair[0].split("|") : mostLikely.finalistIds;
    const favorite = rows[0] || null;
    const surprise = rows.filter(row => row.eloRank >= 7 && row.championProbability > 0).sort((a,b) => b.championProbability-a.championProbability || b.finalProbability-a.finalProbability)[0] || rows[1] || favorite;
    const completed = allCurrentMatches().filter(matchComplete).length;
    const totalKnown = allCurrentMatches().length;
    const data = {
      runs,
      rows,
      favorite,
      surprise,
      mostLikely,
      mostLikelyFinalIds,
      mostLikelyFinalProbability:finalPair ? finalPair[1] / runs : 1,
      completed,
      totalKnown,
      recalculatedAt:new Date().toISOString(),
      fingerprint
    };
    tournamentSimulationCache.key = cacheKey;
    tournamentSimulationCache.data = data;
    return data;
  }

  function simulationPct(value, decimals = 0) {
    const amount = Number(value || 0) * 100;
    return `${amount.toFixed(decimals)}%`;
  }

  function simulationSeriesCard(series) {
    if (!series) return "";
    return `<article class="sim-bracket-card"><span>${escapeHTML(series.label)}</span><strong>${escapeHTML(playerName(series.playerAId))}</strong><b>${series.winsA}–${series.winsB}</b><strong>${escapeHTML(playerName(series.playerBId))}</strong><small>Kazanan: ${escapeHTML(playerName(series.winnerId))}</small></article>`;
  }

  function simulationProjectedTable(rows, type = "league") {
    if (!rows?.length) return `<div class="info-box">Tahmini tablo oluşmadı.</div>`;
    return `<div class="sim-projected-table"><div class="head"><span>#</span><span>Oyuncu</span><span>O</span><span>P</span><span>AV</span><span>Hat</span></div>${rows.map(row => {
      let status = "";
      if (type === "league") status = row.rank <= 6 ? "ALTIN" : row.rank <= 12 ? "GÜMÜŞ" : "ELENİR";
      if (type === "gold") status = row.rank === 1 ? "DİREKT YF" : row.rank <= 4 ? "ELEME" : "ELENİR";
      if (type === "silver") status = row.rank <= 3 ? "ELEME" : "ELENİR";
      const key = status === "ALTIN" || status === "DİREKT YF" ? "gold" : status === "GÜMÜŞ" ? "silver" : status === "ELEME" ? "playoff" : "out";
      return `<div class="line-${key}"><span>${row.rank}</span><strong>${escapeHTML(playerName(row.id))}</strong><span>${row.mp}</span><b>${row.pts}</b><span>${formatGD(row.gd)}</span><small>${status}</small></div>`;
    }).join("")}</div>`;
  }


  function simulationPredictionCard(match, index) {
    const model=match.model;
    const homeName=playerName(match.homeId),awayName=playerName(match.awayId);
    if(!model) return `<article class="advanced-prediction-card actual"><header><span>${index+1}</span><small>${escapeHTML(match.stageLabel)}</small><b>${intelligenceCopy("GERÇEK","ACTUAL")}</b></header><div class="advanced-prediction-score"><strong>${escapeHTML(homeName)}</strong><span>${match.homeScore}–${match.awayScore}</span><strong>${escapeHTML(awayName)}</strong></div></article>`;
    const alternatives=(model.scoreDistribution||[]).filter(row=>!(row.homeScore===match.homeScore&&row.awayScore===match.awayScore)).slice(0,3);
    const scoreProbability=Number(match.scorelineProbability||0);
    const scenario=match.scenarioLabel||model.tempoLabel||intelligenceCopy("Model Senaryosu","Model Scenario");
    const outcome=match.homeScore>match.awayScore?"home":match.awayScore>match.homeScore?"away":"draw";
    const resultLabel=outcome==="home"?homeName:outcome==="away"?awayName:intelligenceCopy("Beraberlik","Draw");
    return `<article class="advanced-prediction-card outcome-${outcome}">
      <header><span>${index+1}</span><small>${escapeHTML(match.stageLabel)}</small><b>${escapeHTML(scenario)}</b></header>
      <div class="advanced-prediction-main"><div class="advanced-prediction-player home"><strong>${escapeHTML(homeName)}</strong><small>${model.home?.form?.last5Label||"–"}</small></div><div class="advanced-prediction-score"><span>${match.homeScore}<i>–</i>${match.awayScore}</span><small>${escapeHTML(resultLabel)} · ${intelligenceCopy("temsilî ana yol","representative main path")}</small></div><div class="advanced-prediction-player away"><strong>${escapeHTML(awayName)}</strong><small>${model.away?.form?.last5Label||"–"}</small></div></div>
      <div class="advanced-model-grid"><div><span>${intelligenceCopy("xG-benzeri beklenen skor","xG-like expected score")}</span><strong>${Number(model.expectedHome||0).toFixed(2)} – ${Number(model.expectedAway||0).toFixed(2)}</strong></div><div><span>${intelligenceCopy("Skor olasılığı","Score probability")}</span><strong>${(scoreProbability*100).toFixed(1)}%</strong></div><div><span>${intelligenceCopy("Model güveni","Model confidence")}</span><strong>${model.confidence||0}%</strong></div><div><span>${intelligenceCopy("Volatilite","Volatility")}</span><strong>${Math.round(model.volatility||0)}/100</strong></div></div>
      <div class="advanced-outcome-rail"><i class="home" style="width:${model.market.home.probability*100}%"></i><i class="draw" style="width:${model.market.draw.probability*100}%"></i><i class="away" style="width:${model.market.away.probability*100}%"></i></div>
      <div class="advanced-outcome-labels"><span>1 · ${simulationPct(model.market.home.probability)}</span><span>X · ${simulationPct(model.market.draw.probability)}</span><span>2 · ${simulationPct(model.market.away.probability)}</span></div>
      <footer><div><span>${intelligenceCopy("Alternatif skorlar","Alternative scorelines")}</span><strong>${alternatives.map(row=>`${row.homeScore}-${row.awayScore} (${(row.probability*100).toFixed(1)}%)`).join(" · ")||"—"}</strong></div><em>${escapeHTML(model.tempoLabel||intelligenceCopy("Dengeli Tempo","Balanced Tempo"))}</em></footer>
    </article>`;
  }

  function renderManualQualificationPanel() {
    const context = simulatorContext();
    if (context.key === "none" || context.key === "completed") return "";
    const roundValues = context.remaining.map(match => Number(match.round) || 0);
    const minRound = roundValues.length ? Math.min(...roundValues) : 0;
    const shown = context.remaining.filter(match => Number(match.round) <= minRound + 1).slice(0,12);
    const tableMatches = context.baseMatches.map(simulatedMatch);
    const rows = standings(context.ids, tableMatches).map((row,index) => ({ ...row, rank:index + 1 }));
    const entered = Object.values(qualificationScenario).filter(item => item?.home !== "" && item?.away !== "").length;
    return `<details class="panel sim-whatif-panel"><summary><div><span class="eyebrow">MANUEL WHAT-IF</span><strong>Skor Senaryosu Testi</strong><small>Resmî veriyi değiştirmeden kendi skor kombinasyonunu dene.</small></div><b>${entered} skor</b></summary><div class="sim-whatif-content">
      ${state.current.phase2.generated && !phase2Finished() ? `<div class="segmented-control intel-sim-group"><button class="segment-btn ${context.key === "gold" ? "active" : ""}" data-action="set-simulator-group" data-group="gold">Altın Grup</button><button class="segment-btn ${context.key === "silver" ? "active" : ""}" data-action="set-simulator-group" data-group="silver">Gümüş Grup</button></div>` : ""}
      <div class="grid-2"><section><div class="panel-header"><div><h3 class="panel-title">Skor Senaryoları</h3><div class="panel-subtitle">Sıradaki iki turun maçları.</div></div><button class="btn btn-ghost" data-action="clear-simulator">Temizle</button></div><div class="intel-sim-fixtures">${shown.map(match => { const scenario=qualificationScenario[match.id] || {home:"",away:""}; return `<div class="intel-sim-match"><span>${escapeHTML(currentMatchStageLabel(match))}</span><strong>${escapeHTML(playerName(match.homeId))}</strong><input type="number" min="0" max="30" value="${escapeHTML(scenario.home)}" data-sim-match="${escapeHTML(match.id)}" data-sim-side="home" placeholder="–"><b>:</b><input type="number" min="0" max="30" value="${escapeHTML(scenario.away)}" data-sim-match="${escapeHTML(match.id)}" data-sim-side="away" placeholder="–"><strong>${escapeHTML(playerName(match.awayId))}</strong></div>`; }).join("")}</div><button class="btn btn-gold mt-16" data-action="run-simulator">Sıralamayı Yeniden Hesapla</button></section>
      <section><div class="panel-header"><div><h3 class="panel-title">Simüle Puan Durumu</h3><div class="panel-subtitle">Yalnızca girilen senaryonun anlık sonucu.</div></div><span class="badge badge-blue">WHAT IF</span></div><div class="intel-sim-table"><div class="head"><span>#</span><span>Oyuncu</span><span>O</span><span>P</span><span>AV</span><span>Durum</span></div>${rows.map(row => { const status=simulatorStatus(row,context); return `<div class="status-${status.key}"><span>${row.rank}</span><strong>${escapeHTML(row.p)}</strong><span>${row.mp}</span><b>${row.pts}</b><span>${formatGD(row.gd)}</span><small>${status.label}</small></div>`; }).join("")}</div></section></div></div></details>`;
  }

  async function shareTournamentSimulation() {
    const data = buildTournamentSimulation();
    if (!data?.favorite) { toast("Paylaşılacak simülasyon bulunmuyor.", "error"); return; }
    const top = data.rows.slice(0,5);
    const finalNames = data.mostLikelyFinalIds.map(playerName).join(" vs ");
    const lines = [
      `FIFA 9 · CANLI TURNUVA SİMÜLASYONU (${data.runs.toLocaleString("tr-TR")} koşu)`,
      `Model favorisi: ${data.favorite.name} · Şampiyonluk ${simulationPct(data.favorite.championProbability,1)}`,
      `En olası final: ${finalNames} · ${simulationPct(data.mostLikelyFinalProbability,1)}`,
      ...top.map((row,index) => `${index + 1}. ${row.name} · Şampiyon ${simulationPct(row.championProbability,1)} · Final ${simulationPct(row.finalProbability,1)}`),
      "Gerçek sonuçlar sabitlenir; kalan turnuva güncel Elo, form ve performansa göre yeniden simüle edilir.",
      window.location.href
    ];
    const text = lines.join("\n");
    if (navigator.share) {
      try { await navigator.share({ title:"FIFA 9 Turnuva Simülasyonu", text, url:window.location.href }); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  function renderSimulatorSection() {
    if (!state.current.league.generated || filledParticipants().length < 2) return emptyState("◇", "Turnuva Simülasyonu Kura Sonrası Açılır", "League Phase fikstürü oluşturulduğunda kalan bütün turnuva güncel performanslara göre binlerce kez otomatik oynatılır.", `<button class="btn btn-gold" data-nav="setup">Kura Sayfasına Git</button>`);
    const data = buildTournamentSimulation();
    if (!data) return `<div class="info-box">Simülasyon verisi oluşturulamadı.</div>`;
    const path = data.mostLikely;
    const finalNames = data.mostLikelyFinalIds.map(playerName);
    const topRows = data.rows.slice(0,8);
    const allPredictions = path.predictedMatches;
    const uniqueScorelines = new Set(allPredictions.map(match=>`${match.homeScore}-${match.awayScore}`)).size;
    const averagePredictedGoals = allPredictions.length ? allPredictions.reduce((sum,match)=>sum+Number(match.homeScore||0)+Number(match.awayScore||0),0)/allPredictions.length : 0;
    const upsetScenarios = allPredictions.filter(match=>match.scenarioLabel==="Sürpriz Senaryo").length;
    const closeScenarios = allPredictions.filter(match=>Math.abs(Number(match.homeScore||0)-Number(match.awayScore||0))<=1).length;
    const progress = data.totalKnown ? data.completed / data.totalKnown * 100 : 0;
    return `<div class="intel-section-stack tournament-simulation-centre">
      <section class="simulation-hero"><div><div class="eyebrow">ADVANCED SCORE ENGINE · v25</div><h2>Dinamik Turnuva Simülasyonu</h2><p>Girilen gerçek sonuçları sabitler; kalan turnuvayı Bayesçi hücum-savunma profili, aşırı dağılımlı skor matrisi, güncel Elo, form, tempo, volatilite ve ikili rekabetle binlerce kez yeniden oynatır.</p><div class="simulation-actions"><button class="btn btn-gold" data-action="rerun-tournament-simulation">Simülasyonu Yenile</button><button class="btn btn-ghost" data-action="share-tournament-simulation">WhatsApp’ta Paylaş</button></div></div><div class="simulation-orb"><strong>${data.runs.toLocaleString("tr-TR")}</strong><span>SANAL TURNUVA</span><small>${data.completed} gerçek sonuç sabitlendi</small><i style="--progress:${Math.round(progress * 3.6)}deg"></i></div></section>

      <section class="simulation-control-strip"><div><span>Simülasyon Hassasiyeti</span><strong>Her skor girişinden sonra otomatik yeniden hesaplanır.</strong></div><div class="segmented-control">${[1000,5000,10000].map(value => `<button class="segment-btn ${data.runs === value ? "active" : ""}" data-action="set-simulation-runs" data-simulation-runs="${value}">${value/1000}K</button>`).join("")}</div><small>Son hesaplama: ${new Date(data.recalculatedAt).toLocaleTimeString("tr-TR", {hour:"2-digit",minute:"2-digit",second:"2-digit"})}</small></section>

      <div class="simulation-kpi-grid">
        <article><span>Şampiyonluk Favorisi</span><strong>${escapeHTML(data.favorite?.name || "–")}</strong><b>${simulationPct(data.favorite?.championProbability,1)}</b><small>${data.favorite?.elo || 1500} Elo · ${data.favorite?.eloTier?.label || ""}</small></article>
        <article><span>En Olası Final</span><strong>${escapeHTML(finalNames.join(" vs ") || "–")}</strong><b>${simulationPct(data.mostLikelyFinalProbability,1)}</b><small>${data.runs.toLocaleString("tr-TR")} turnuvadaki en sık eşleşme</small></article>
        <article><span>Sürpriz Şampiyon Adayı</span><strong>${escapeHTML(data.surprise?.name || "–")}</strong><b>${simulationPct(data.surprise?.championProbability,1)}</b><small>Elo sırası ${data.surprise?.eloRank || "–"} · Final ${simulationPct(data.surprise?.finalProbability,1)}</small></article>
        <article><span>En Olası Şampiyon</span><strong>${escapeHTML(playerName(path.championId))}</strong><b>${path.final.homeScore}–${path.final.awayScore}</b><small>${escapeHTML(playerName(path.final.homeId))} vs ${escapeHTML(playerName(path.final.awayId))}</small></article>
      </div>

      <section class="panel simulation-title-race"><div class="panel-header"><div><h3 class="panel-title">Şampiyonluk Olasılığı</h3><div class="panel-subtitle">Model tek bir sonuç söylemez; kalan turnuvayı binlerce farklı olasılıkla oynatır.</div></div><span class="badge badge-gold">${data.runs.toLocaleString("tr-TR")} RUNS</span></div><div class="simulation-title-bars">${data.rows.slice(0,8).map((row,index) => `<div><span>${index + 1}</span><strong>${escapeHTML(row.name)}</strong><div><i style="width:${Math.max(1,row.championProbability*100)}%"></i></div><b>${simulationPct(row.championProbability,1)}</b><small>${row.elo} Elo</small></div>`).join("")}</div></section>

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Tur Atlama Olasılık Matrisi</h3><div class="panel-subtitle">Altın/Gümüş Grup, yarı final, final ve şampiyonluk ihtimalleri aynı anda izlenir.</div></div><span class="badge badge-blue">AUTO UPDATE</span></div><div class="simulation-probability-table"><div class="head"><span>#</span><span>Oyuncu</span><span>Elo</span><span>Altın</span><span>Gümüş</span><span>Yarı Final</span><span>Final</span><span>Şampiyon</span><span>Tahmini Lig</span></div>${data.rows.map((row,index) => `<div><span>${index + 1}</span><strong>${escapeHTML(row.name)}</strong><b>${row.elo}</b><span>${simulationPct(row.goldProbability)}</span><span>${simulationPct(row.silverProbability)}</span><span>${simulationPct(row.semiProbability)}</span><span>${simulationPct(row.finalProbability)}</span><strong class="champ-prob">${simulationPct(row.championProbability,1)}</strong><small>${row.expectedLeagueRank.toFixed(1)}. · ${row.expectedLeaguePoints.toFixed(1)} P</small></div>`).join("")}</div></section>

      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">En Olası Turnuva Akışı</h3><div class="panel-subtitle">Modelin mevcut veriden ürettiği tek ana senaryo. Kesin sonuç değil, en yüksek olasılıklı yol haritasıdır.</div></div><span class="badge badge-gold">MOST LIKELY PATH</span></div><div class="simulation-flow-grid"><div><h4>League Phase</h4>${simulationProjectedTable(path.leagueTable,"league")}</div><div><h4>Altın Grup</h4>${simulationProjectedTable(path.goldTable,"gold")}</div><div><h4>Gümüş Grup</h4>${simulationProjectedTable(path.silverTable,"silver")}</div></div></section>

      <section class="panel simulation-bracket"><div class="panel-header"><div><h3 class="panel-title">Simüle Eleme Ağacı</h3><div class="panel-subtitle">Üç maçlık serilerde iki galibiyete ulaşan oyuncu tur atlar; final tek maçtır.</div></div></div><div class="simulation-bracket-columns"><div><h4>Eleme Serileri</h4>${path.qf.map(simulationSeriesCard).join("")}</div><div><h4>Yarı Finaller</h4>${path.semifinals.map(simulationSeriesCard).join("")}</div><div><h4>Büyük Final</h4><article class="sim-final-card"><span>TAHMİNİ FİNAL</span><strong>${escapeHTML(playerName(path.final.homeId))}</strong><b>${path.final.homeScore}–${path.final.awayScore}</b><strong>${escapeHTML(playerName(path.final.awayId))}</strong><small>Şampiyon: ${escapeHTML(playerName(path.championId))}</small></article></div></div></section>

      <section class="panel advanced-prediction-centre"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Kalan Tüm Maçların Gelişmiş Model Tahmini","Advanced Model Predictions for All Remaining Matches")}</h3><div class="panel-subtitle">${intelligenceCopy("Tekrarlayan yuvarlak skorlar yerine her eşleşmeye özel tempo, xG-benzeri beklenen skor, volatilite ve kalibre edilmiş skor dağılımı.","Instead of repetitive rounded scores, each matchup receives its own tempo, xG-like expected score, volatility and calibrated score distribution.")}</div></div><span class="badge badge-blue">REALISTIC SCORE ENGINE</span></div>
        <div class="advanced-prediction-summary"><div><span>${intelligenceCopy("Tahmini Maç","Predicted Matches")}</span><strong>${allPredictions.length}</strong></div><div><span>${intelligenceCopy("Farklı Skor","Unique Scorelines")}</span><strong>${uniqueScorelines}</strong></div><div><span>${intelligenceCopy("Ortalama Gol","Average Goals")}</span><strong>${averagePredictedGoals.toFixed(2)}</strong></div><div><span>${intelligenceCopy("Yakın Maç","Close Matches")}</span><strong>${closeScenarios}</strong></div><div><span>${intelligenceCopy("Sürpriz Yol","Upset Paths")}</span><strong>${upsetScenarios}</strong></div></div>
        <div class="advanced-prediction-scroll"><div class="advanced-prediction-grid">${allPredictions.map(simulationPredictionCard).join("") || `<div class="info-box">${intelligenceCopy("Kalan maç bulunmuyor; turnuva tamamlandı.","No remaining matches; the tournament is complete.")}</div>`}</div></div>
      </section>

      <section class="panel simulation-method advanced-engine-method"><div class="panel-header"><div><h3 class="panel-title">Advanced Score Engine v25</h3><div class="panel-subtitle">${intelligenceCopy("Skoru yalnızca ortalamayı yuvarlayarak değil, bütün olası skorları olasılık matrisi içinde hesaplayarak üretir.","Generates scores by evaluating the full score-probability matrix rather than simply rounding an average.")}</div></div><span class="badge badge-blue">BAYES + NEGATIVE BINOMIAL</span></div><div class="simulation-method-grid"><div><strong>BAYES</strong><span>${intelligenceCopy("Az veriyi lig ortalamasına yaklaştıran güvenilirlik düzeltmesi","Reliability adjustment that shrinks limited data toward the league average")}</span></div><div><strong>A/D</strong><span>${intelligenceCopy("Oyuncu hücumu × rakip savunma zayıflığı","Player attack × opponent defensive vulnerability")}</span></div><div><strong>NB</strong><span>${intelligenceCopy("Poisson’dan daha gerçekçi aşırı dağılımlı gol modeli","Overdispersed goal model that is more realistic than Poisson")}</span></div><div><strong>1-X-2</strong><span>${intelligenceCopy("Skor matrisi dinamik oran olasılıklarına kalibre edilir","The score matrix is calibrated to dynamic 1-X-2 probabilities")}</span></div><div><strong>TEMPO</strong><span>${intelligenceCopy("Lig, eleme ve final aşamasına özel maç ritmi","Stage-specific match rhythm for league, knockout and final rounds")}</span></div><div><strong>SEEDED</strong><span>${intelligenceCopy("Sonuç değişmedikçe sabit, veri değişince tamamen yenilenen ana yol","A stable main path until real data changes, then fully recalculated")}</span></div></div><div class="info-box mt-16"><strong>${intelligenceCopy("Neden daha gerçekçi?","Why is it more realistic?")}</strong> ${intelligenceCopy("Model her maç için 0-0’dan 15-15’e kadar yüzlerce skor ihtimalini değerlendirir; yakın maç, dominant sonuç, beraberlik, sürpriz ve yüksek skorlu düello senaryolarını ayrı ayrı ağırlıklandırır. Yeni resmî sonuç geldiğinde bütün hücum, savunma, tempo ve skor dağılımları yeniden hesaplanır.","For every match, the model evaluates hundreds of scorelines from 0-0 to 15-15, weighting close contests, dominant outcomes, draws, upsets and high-scoring duels separately. Every new official result recalculates attack, defence, tempo and score distributions.")}</div></section>
      ${renderManualQualificationPanel()}
    </div>`;
  }


  function playerCardStyleLabel(key) {
    const labels = {
      aggressive:intelligenceCopy("Agresif Kontrolör", "Aggressive Controller"),
      wall:intelligenceCopy("Taktik Duvar", "Tactical Wall"),
      momentum:intelligenceCopy("Momentum Avcısı", "Momentum Hunter"),
      clutch:intelligenceCopy("Kritik An Uzmanı", "Clutch Specialist"),
      general:intelligenceCopy("Turnuva Generali", "Tournament General"),
      creator:intelligenceCopy("Skor Mimarı", "Score Architect"),
      survivor:intelligenceCopy("Kaos Kurtulanı", "Chaos Survivor"),
      balanced:intelligenceCopy("Dengeli Rakip", "Balanced Competitor")
    };
    return labels[key] || labels.balanced;
  }

  function playerCardModelLabel(prestigeKey) {
    const models = {
      rookie:intelligenceCopy("Bronz Çekirdek", "Bronze Core"),
      competitor:intelligenceCopy("Çelik Hat", "Steel Edge"),
      challenger:intelligenceCopy("Safir Akış", "Sapphire Drive"),
      contender:intelligenceCopy("Kızıl Güç", "Crimson Force"),
      elite:intelligenceCopy("Platin Nabız", "Platinum Pulse"),
      master:intelligenceCopy("Kraliyet Ametisti", "Royal Amethyst"),
      legend:intelligenceCopy("Kozmik Altın", "Cosmic Gold"),
      icon:intelligenceCopy("Obsidyen Prizma", "Obsidian Prism"),
      immortal:intelligenceCopy("Aurora Elması", "Aurora Diamond")
    };
    return models[prestigeKey] || models.rookie;
  }


  function playerCardMetricLabel(key) {
    const labels = {
      attack:intelligenceCopy("Hücum", "Attack"),
      defense:intelligenceCopy("Savunma", "Defence"),
      form:intelligenceCopy("Form", "Form"),
      mental:intelligenceCopy("Mental", "Mental"),
      legacy:intelligenceCopy("Miras", "Legacy"),
      identity:intelligenceCopy("Oyun Kimliği", "Game Identity"),
      finishing:intelligenceCopy("Bitiricilik", "Finishing"),
      shotVolume:intelligenceCopy("Üretim Hacmi", "Shot Volume"),
      efficiency:intelligenceCopy("Verimlilik", "Efficiency"),
      bigMatchAttack:intelligenceCopy("Büyük Maç Hücumu", "Big Match Attack"),
      goalShield:intelligenceCopy("Gol Kalkanı", "Goal Shield"),
      lockdown:intelligenceCopy("Kilitleme", "Lockdown"),
      control:intelligenceCopy("Maç Kontrolü", "Game Control"),
      recovery:intelligenceCopy("Hasar Yönetimi", "Damage Control"),
      last5:intelligenceCopy("Son 5 Maç", "Last 5 Matches"),
      last10:intelligenceCopy("Son 10 Maç", "Last 10 Matches"),
      trend:intelligenceCopy("Trend", "Trend"),
      rhythm:intelligenceCopy("Ritim", "Rhythm"),
      clutch:intelligenceCopy("Kritik An", "Clutch"),
      pressure:intelligenceCopy("Baskı Oyunu", "Pressure Handling"),
      resilience:intelligenceCopy("Dayanıklılık", "Resilience"),
      comeback:intelligenceCopy("Geri Dönüş", "Comeback"),
      trophies:intelligenceCopy("Kupa Dolabı", "Trophy Cabinet"),
      careerEfficiency:intelligenceCopy("Kariyer Verimi", "Career Efficiency"),
      longevity:intelligenceCopy("Süreklilik", "Longevity"),
      authority:intelligenceCopy("Otorite", "Authority"),
      adaptability:intelligenceCopy("Uyarlanabilirlik", "Adaptability"),
      favouriteMastery:intelligenceCopy("Favori Takım Ustalığı", "Favourite Team Mastery"),
      diversity:intelligenceCopy("Takım Çeşitliliği", "Team Diversity"),
      tacticalFlex:intelligenceCopy("Taktik Esneklik", "Tactical Flexibility")
    };
    return labels[key] || key;
  }

  function playerCardGroupBlurb(key) {
    const blurbs = {
      attack:intelligenceCopy("Gol üretimi, skor hacmi ve güçlü rakiplere karşı tehdit seviyesi.", "Goal creation, scoring volume and threat level against stronger opposition."),
      defense:intelligenceCopy("Yenilen gol kalitesi, clean-sheet potansiyeli ve maç kontrolü.", "Goals-against profile, clean-sheet potential and match control."),
      form:intelligenceCopy("Kısa dönem sıcaklık, güncel ivme ve puan ritmi.", "Short-term heat, current momentum and points rhythm."),
      mental:intelligenceCopy("Baskı altında karar kalitesi, clutch performans ve geri dönüş gücü.", "Decision quality under pressure, clutch output and comeback power."),
      legacy:intelligenceCopy("Kariyer verimi, kupa üretimi ve rekabet otoritesi.", "Career efficiency, trophy production and rivalry authority."),
      identity:intelligenceCopy("Takım havuzu kullanımı, esneklik ve tercih edilen takımla verim.", "Use of the team pool, flexibility and efficiency with favourite teams.")
    };
    return blurbs[key] || "";
  }

  function playerCardRadar(values) {
    const keys = ["attack","defense","form","mental","legacy","identity"];
    const centre = 120;
    const radius = 84;
    const points = keys.map((key,index)=>{
      const angle = -Math.PI/2 + index*(Math.PI*2/keys.length);
      const value = intelligenceClamp(Number(values[key])||0,0,100)/100;
      return `${(centre + Math.cos(angle)*radius*value).toFixed(1)},${(centre + Math.sin(angle)*radius*value).toFixed(1)}`;
    }).join(" ");
    const grid = [1,.75,.5,.25].map(scale=>{
      const polygon = keys.map((key,index)=>{
        const angle = -Math.PI/2 + index*(Math.PI*2/keys.length);
        return `${(centre + Math.cos(angle)*radius*scale).toFixed(1)},${(centre + Math.sin(angle)*radius*scale).toFixed(1)}`;
      }).join(" ");
      return `<polygon points="${polygon}" class="player-card-radar-grid"></polygon>`;
    }).join("");
    const axes = keys.map((key,index)=>{
      const angle = -Math.PI/2 + index*(Math.PI*2/keys.length);
      const x = centre + Math.cos(angle)*radius;
      const y = centre + Math.sin(angle)*radius;
      const lx = centre + Math.cos(angle)*(radius+24);
      const ly = centre + Math.sin(angle)*(radius+24);
      return `<line x1="${centre}" y1="${centre}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle">${escapeHTML(playerCardMetricLabel(key).toUpperCase())}</text>`;
    }).join("");
    return `<svg class="player-card-radar" viewBox="0 0 240 240" role="img" aria-label="${escapeHTML(intelligenceCopy("Oyuncu performans radar grafiği", "Player performance radar chart"))}"><g>${grid}${axes}</g><polygon points="${points}" class="player-card-radar-value"></polygon>${keys.map((key,index)=>{
      const angle=-Math.PI/2+index*(Math.PI*2/keys.length);
      const value=intelligenceClamp(Number(values[key])||0,0,100)/100;
      return `<circle cx="${(centre+Math.cos(angle)*radius*value).toFixed(1)}" cy="${(centre+Math.sin(angle)*radius*value).toFixed(1)}" r="4"></circle>`;
    }).join("")}</svg>`;
  }

  function playerCardFormRibbon(results) {
    const list = (results || []).slice(-10);
    if (!list.length) return `<span class="player-card-form-empty">${intelligenceCopy("Maç bekleniyor", "Awaiting matches")}</span>`;
    return list.map(item=>`<span class="form-${String(item.result||"D").toLowerCase()}" title="${escapeHTML(item.opponent||"")}">${escapeHTML(item.result||"D")}</span>`).join("");
  }


  function buildPlayerIdentityCards() {
    const names = intelligenceNames();
    const form = buildFormAnalytics(20, "all");
    const allTime = buildAllTimeAnalytics();
    const elo = buildEloAnalytics();
    const achievements = buildAchievements();
    const pressure = buildPressureChamber();
    const powerExchange = buildPowerExchange();
    const teamAnalytics = buildTeamAnalytics();
    const achievementMap = new Map(achievements.players.map(row=>[row.name,row]));
    const pressureMap = pressure.playerMap || new Map();
    const powerMap = new Map((powerExchange.players || []).map(row=>[row.name,row]));
    const teamMap = new Map((teamAnalytics.players || []).map(row=>[row.name,row]));
    const matches = buildUnifiedAllTimeMatches();
    const eloMap = new Map(names.map(name => [name, (elo.playerMap.get(name) || {}).rating || 1500]));
    const allRatings = Array.from(eloMap.values()).sort((a,b)=>a-b);
    const topCut = allRatings[Math.max(0,Math.floor(allRatings.length*0.65)-1)] || 1500;

    const clamp = value => intelligenceClamp(Number(value)||0,0,100);
    const ratio = (a,b, fallback = 0) => b ? a / b : fallback;
    const average = values => values.length ? values.reduce((sum,value)=>sum + value,0) / values.length : 0;
    const pointsFrom = result => result === "W" ? 3 : result === "D" ? 1 : 0;
    const pointsPerMatchToScore = (ppm, scale = 2.2) => clamp(25 + ppm * scale * 25);
    const shrink = (raw, sample, anchor = 50, cap = 18) => {
      const weight = Math.max(0, Math.min(1, (sample || 0) / cap));
      return clamp(anchor + (raw - anchor) * weight);
    };

    return names.map(name => {
      const f = form.playerMap.get(name) || { games:0,avgGoals:0,gaPerGame:0,formIndex:50,winRate:0,results:[],momentum:0,currentUnbeatenStreak:0,currentWinStreak:0 };
      const career = allTime.playerMap.get(name) || { games:0,wins:0,draws:0,losses:0,winRate:0,ppg:0,avgGoals:0,gaPerGame:0,titles:0,finals:0,podiums:0 };
      const e = elo.playerMap.get(name) || { rating:1500,peak:1500,tier:intelligenceTier(1500),last5Change:0,timeline:[] };
      const ach = achievementMap.get(name) || { badges:[],unlocked:[],prestige:achievementPrestigeLevel(0),activeTitle:"ROOKIE",xp:0 };
      const p = pressureMap.get(name) || { mentalIndex:50,clutchRate:50,pressurePerformance:50,resilience:50,comebackWins:0,lateWins:0,highPressureGames:0,knockoutRate:50 };
      const exchange = powerMap.get(name) || { powerIndex:100,change:0,volatility:50,championProbability:0,finalProbability:0,valuationLabel:intelligenceCopy("DENGELİ","FAIR VALUE") };
      const teams = teamMap.get(name) || { teams:[],totalAppearances:0 };
      const playerMatches = matches.filter(match=>match.homeName===name||match.awayName===name);
      const recent = playerMatches.slice(-20);
      const last10 = recent.slice(-10);
      const last5 = recent.slice(-5);
      const prev5 = recent.slice(-10,-5);
      const mapped = recent.map(match => {
        const isHome = match.homeName===name;
        const gf = Number(isHome ? match.homeScore : match.awayScore) || 0;
        const ga = Number(isHome ? match.awayScore : match.homeScore) || 0;
        const opponent = isHome ? match.awayName : match.homeName;
        const result = gf > ga ? "W" : gf === ga ? "D" : "L";
        return {
          match,
          gf, ga, opponent, result,
          opponentElo: eloMap.get(opponent) || 1500,
          isTopOpponent: (eloMap.get(opponent) || 1500) >= topCut
        };
      });

      const resultSeries = (f.results || []).slice(-20);
      const consistencyPoints = resultSeries.map(item=>pointsFrom(item.result || "L"));
      const mean = average(consistencyPoints);
      const variance = consistencyPoints.length ? consistencyPoints.reduce((sum,value)=>sum+Math.pow(value-mean,2),0)/consistencyPoints.length : 1.5;

      const scoredMatches = mapped.filter(row=>row.gf > 0);
      const twoPlusMatches = mapped.filter(row=>row.gf >= 2);
      const threePlusMatches = mapped.filter(row=>row.gf >= 3);
      const cleanSheets = mapped.filter(row=>row.ga === 0);
      const lowConcede = mapped.filter(row=>row.ga <= 1);
      const wins = mapped.filter(row=>row.result === "W");
      const nonLosses = mapped.filter(row=>row.result !== "L");
      const oneGoalLosses = mapped.filter(row=>row.result === "L" && row.ga - row.gf <= 1);
      const topOppMatches = mapped.filter(row=>row.isTopOpponent);
      const topOppWins = topOppMatches.filter(row=>row.result === "W");
      const topOppGoals = average(topOppMatches.map(row=>row.gf));
      const closeMatches = mapped.filter(row=>Math.abs(row.gf-row.ga) <= 1);
      const closeWins = closeMatches.filter(row=>row.result === "W").length;

      const playerRivalries = (allTime.rivalries || []).filter(row=>row.playerA===name||row.playerB===name);
      const rivalryScore = playerRivalries.length ? playerRivalries.reduce((sum,row)=>{
        const wins = row.playerA===name ? row.winsA : row.winsB;
        return sum + (row.meetings ? wins/row.meetings*100 : 50);
      },0)/playerRivalries.length : 50;

      const uniqueTeams = (teams.teams || []).length;
      const winningTeams = (teams.teams || []).filter(row=>(row.wins||0) > 0).length;
      const favoriteTeamRow = (teams.teams || []).slice().sort((a,b)=>(b.games||0)-(a.games||0)||(b.wins||0)-(a.wins||0))[0] || null;
      const teamWinRates = (teams.teams || []).filter(row=>(row.games||0) >= 2).map(row=>row.winRate || 0);
      const teamSpread = teamWinRates.length ? Math.max(...teamWinRates)-Math.min(...teamWinRates) : 18;
      const favoriteTeamWinRate = favoriteTeamRow ? (favoriteTeamRow.winRate || 0) : 0;
      const favoriteTeamGames = favoriteTeamRow ? (favoriteTeamRow.games || 0) : 0;
      const favoriteTeam = favoriteTeamRow?.team || f.favoriteTeam?.name || "–";
      const maxScored = mapped.reduce((max,row)=>Math.max(max,row.gf),0);

      // Macro + sub attributes with confidence shrinkage
      const finishing = shrink(28 + average(mapped.map(row=>Math.min(100,row.gf*26 + (row.result==="W"?9:0)))) * 0.62 + ratio(scoredMatches.length,mapped.length,0)*26 + ratio(threePlusMatches.length,mapped.length,0)*18, mapped.length, 50, 16);
      const shotVolume = shrink(24 + (average(mapped.map(row=>row.gf))*17) + ratio(twoPlusMatches.length,mapped.length,0)*34 + Math.max(0,f.momentum||0)*2.4, mapped.length, 50, 16);
      const efficiency = shrink(26 + (f.winRate||0)*0.34 + ratio(scoredMatches.length,mapped.length,0)*28 + pointsPerMatchToScore(average(mapped.filter(r=>r.gf>0).map(r=>pointsFrom(r.result))), 1.7), mapped.length, 50, 16);
      const bigMatchAttack = shrink(28 + topOppGoals*16 + ratio(topOppWins.length,topOppMatches.length,0)*38 + (p.clutchRate||50)*0.22, topOppMatches.length || mapped.length, 50, 10);
      const attack = Math.round(clamp(finishing*.31 + shotVolume*.27 + efficiency*.22 + bigMatchAttack*.20));

      const goalShield = shrink(108 - average(mapped.map(row=>row.ga))*18 - (career.gaPerGame||0)*6, mapped.length, 50, 16);
      const lockdown = shrink(26 + ratio(cleanSheets.length,mapped.length,0)*58 + ratio(lowConcede.length,mapped.length,0)*18 + (p.resilience||50)*0.10, mapped.length, 50, 16);
      const control = shrink(28 + ratio(nonLosses.length,mapped.length,0)*42 + ratio(wins.length,mapped.length,0)*18 + (e.rating-1500)/8, mapped.length, 50, 16);
      const recovery = shrink(30 + ratio(oneGoalLosses.length,Math.max(1,mapped.filter(row=>row.result==="L").length),0)*22 + (p.resilience||50)*0.44 + Math.min(12,(f.currentUnbeatenStreak||0)*2), mapped.length, 50, 16);
      const defense = Math.round(clamp(goalShield*.33 + lockdown*.25 + control*.24 + recovery*.18));

      const last5Score = shrink(pointsPerMatchToScore(average(last5.map(row=>pointsFrom(row.result))), 2.0) + Math.max(-10, Math.min(10, average(last5.map(row=>row.gf-row.ga))*6)), last5.length, 50, 5);
      const last10Score = shrink(pointsPerMatchToScore(average(last10.map(row=>pointsFrom(row.result))), 2.0) + Math.max(-12, Math.min(12, average(last10.map(row=>row.gf-row.ga))*4.5)), last10.length, 50, 10);
      const trend = clamp(50 + (average(last5.map(row=>pointsFrom(row.result))) - average(prev5.map(row=>pointsFrom(row.result))))*20 + (f.momentum||0)*3.5);
      const rhythm = shrink(94 - variance*24 + Math.min(10,(f.currentUnbeatenStreak||0)*2.1), consistencyPoints.length, 50, 14);
      const formScore = Math.round(clamp(last5Score*.29 + last10Score*.31 + trend*.18 + rhythm*.22));

      const clutch = clamp((p.clutchRate||50)*0.72 + ratio(closeWins,closeMatches.length,0)*18 + (p.knockoutRate||50)*0.10);
      const pressureScore = clamp((p.pressurePerformance||50)*0.68 + Math.min(18,(p.highPressureGames||0)*2.2) + (e.rating-1500)/10);
      const resilience = clamp((p.resilience||50)*0.74 + ratio(nonLosses.length,mapped.length,0)*18 + Math.min(10,(f.currentUnbeatenStreak||0)*1.8));
      const comeback = clamp(34 + Math.min(28,(p.comebackWins||0)*8) + Math.min(18,(p.lateWins||0)*4.5) + ratio(oneGoalLosses.length,Math.max(1,mapped.filter(row=>row.result==="L").length),0)*12);
      const mental = Math.round(clamp(clutch*.28 + pressureScore*.26 + resilience*.24 + comeback*.22));

      const trophies = clamp(20 + Math.min(40,(career.titles||0)*14) + Math.min(18,(career.finals||0)*4) + Math.min(10,(career.podiums||0)*2));
      const careerEfficiency = clamp(26 + (career.winRate||0)*0.36 + (career.ppg||0)*17 + Math.min(10,(career.avgGoals||0)*3));
      const longevity = clamp(20 + Math.min(34,(career.games||0)*0.9) + Math.min(14,(career.wins||0)*0.38));
      const authority = clamp(rivalryScore*0.48 + (e.rating-1350)*0.055 + Math.min(12,topOppMatches.length*1.3));
      const legacy = Math.round(clamp(trophies*.32 + careerEfficiency*.26 + longevity*.19 + authority*.23));

      const adaptability = clamp(30 + Math.min(26,uniqueTeams*3.8) + Math.min(16,winningTeams*2.8) + Math.max(0,12-teamSpread*0.22));
      const favouriteMastery = shrink(26 + favoriteTeamWinRate*0.54 + Math.min(16,favoriteTeamGames*1.1), favoriteTeamGames, 50, 12);
      const diversity = clamp(28 + Math.min(28,uniqueTeams*4.4) + Math.min(16,winningTeams*2.5));
      const tacticalFlex = clamp(32 + adaptability*0.34 + (100-Math.min(100,teamSpread))*0.22 + (exchange.volatility||50)*0.12);
      const identity = Math.round(clamp(adaptability*.30 + favouriteMastery*.22 + diversity*.23 + tacticalFlex*.25));

      const confidence = Math.round(clamp(38 + Math.min(26,mapped.length*1.2) + Math.min(18,(career.games||0)*0.45) + Math.min(12,topOppMatches.length*1.8)));
      const overallRaw = attack*.20 + defense*.17 + formScore*.17 + mental*.17 + legacy*.16 + identity*.13;
      const overall = Math.round(clamp(overallRaw*0.82 + confidence*0.18));

      let styleKey = "balanced";
      if (attack>=82 && bigMatchAttack>=78) styleKey="aggressive";
      else if (defense>=82 && goalShield>=80) styleKey="wall";
      else if (formScore>=80 && trend>=75) styleKey="momentum";
      else if (mental>=82 && clutch>=80) styleKey="clutch";
      else if (legacy>=82 || (career.titles||0)>=2) styleKey="general";
      else if (identity>=80 && adaptability>=78) styleKey="creator";
      else if (recovery>=80 || comeback>=80) styleKey="survivor";

      const attributeGroups = [
        { key:"attack", score:attack, blurb:playerCardGroupBlurb("attack"), attributes:[
          { key:"finishing", value:Math.round(finishing) },
          { key:"shotVolume", value:Math.round(shotVolume) },
          { key:"efficiency", value:Math.round(efficiency) },
          { key:"bigMatchAttack", value:Math.round(bigMatchAttack) }
        ]},
        { key:"defense", score:defense, blurb:playerCardGroupBlurb("defense"), attributes:[
          { key:"goalShield", value:Math.round(goalShield) },
          { key:"lockdown", value:Math.round(lockdown) },
          { key:"control", value:Math.round(control) },
          { key:"recovery", value:Math.round(recovery) }
        ]},
        { key:"form", score:formScore, blurb:playerCardGroupBlurb("form"), attributes:[
          { key:"last5", value:Math.round(last5Score) },
          { key:"last10", value:Math.round(last10Score) },
          { key:"trend", value:Math.round(trend) },
          { key:"rhythm", value:Math.round(rhythm) }
        ]},
        { key:"mental", score:mental, blurb:playerCardGroupBlurb("mental"), attributes:[
          { key:"clutch", value:Math.round(clutch) },
          { key:"pressure", value:Math.round(pressureScore) },
          { key:"resilience", value:Math.round(resilience) },
          { key:"comeback", value:Math.round(comeback) }
        ]},
        { key:"legacy", score:legacy, blurb:playerCardGroupBlurb("legacy"), attributes:[
          { key:"trophies", value:Math.round(trophies) },
          { key:"careerEfficiency", value:Math.round(careerEfficiency) },
          { key:"longevity", value:Math.round(longevity) },
          { key:"authority", value:Math.round(authority) }
        ]},
        { key:"identity", score:identity, blurb:playerCardGroupBlurb("identity"), attributes:[
          { key:"adaptability", value:Math.round(adaptability) },
          { key:"favouriteMastery", value:Math.round(favouriteMastery) },
          { key:"diversity", value:Math.round(diversity) },
          { key:"tacticalFlex", value:Math.round(tacticalFlex) }
        ]}
      ].map(group=>({
        ...group,
        label:playerCardMetricLabel(group.key),
        topAttribute:group.attributes.slice().sort((a,b)=>b.value-a.value)[0],
        weakAttribute:group.attributes.slice().sort((a,b)=>a.value-b.value)[0]
      }));

      const categoryScores = Object.fromEntries(attributeGroups.map(group=>[group.key, group.score]));
      const topMetrics = attributeGroups.slice().sort((a,b)=>b.score-a.score).slice(0,3).map(group=>({ key:group.key, label:group.label, value:group.score }));
      const weakMetrics = attributeGroups.slice().sort((a,b)=>a.score-b.score).slice(0,2).map(group=>({ key:group.key, label:group.label, value:group.score }));
      const allSubAttributes = attributeGroups.flatMap(group=>group.attributes.map(item=>({ ...item, label:playerCardMetricLabel(item.key), groupKey:group.key, groupLabel:group.label })));
      const bestSubAttribute = allSubAttributes.slice().sort((a,b)=>b.value-a.value)[0] || null;
      const weakestSubAttribute = allSubAttributes.slice().sort((a,b)=>a.value-b.value)[0] || null;

      const prestige = ach.prestige || achievementPrestigeLevel(ach.xp||0);
      const modelKey = prestige.key || "rookie";
      const cardTier = overall>=92?"immortal":overall>=88?"icon":overall>=84?"legend":overall>=80?"elite":overall>=75?"gold":overall>=68?"silver":"bronze";
      const initials = name.split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join("").toUpperCase();
      const activeTitle = ach.activeTitle || prestige.name || "ROOKIE";
      const badgeList = ach.unlocked || ach.badges || [];
      const nextPrestige = prestige.next ? { name:prestige.next.name, remaining:Math.max(0,prestige.next.min-(ach.xp||0)) } : null;

      return {
        name, initials, overall, cardTier, prestige, modelKey, modelLabel:playerCardModelLabel(modelKey),
        activeTitle, xp:ach.xp||0, nextPrestige, styleKey, style:playerCardStyleLabel(styleKey),
        metrics:categoryScores, attributeGroups, topMetrics, weakMetrics, bestSubAttribute, weakestSubAttribute,
        elo:e.rating, eloPeak:e.peak, eloTier:e.tier, eloChange:e.last5Change||0, eloTimeline:(e.timeline||[]).slice(-18).map(item=>item.rating),
        powerIndex:exchange.powerIndex, powerChange:exchange.change, volatility:exchange.volatility,
        championProbability:exchange.championProbability||0, finalProbability:exchange.finalProbability||0,
        valuationLabel:exchange.valuationLabel, confidence,
        formResults:(f.results||[]).slice(-10), momentum:f.momentum||0,
        currentWinStreak:f.currentWinStreak||0, currentUnbeatenStreak:f.currentUnbeatenStreak||0,
        favoriteTeam, badges:badgeList, career,
        closeMatches:closeMatches.length, closeWins, uniqueTeams, winningTeams,
        topOpponentGames:topOppMatches.length, favoriteTeamWinRate, maxScored,
        scoutingFocus:topMetrics[0]?.label || "—", developmentFocus:weakMetrics[0]?.label || "—"
      };
    }).sort((a,b)=>b.overall-a.overall||b.xp-a.xp||b.elo-a.elo||a.name.localeCompare(b.name,"tr"));
  }


  function renderPlayerCardSection() {
    const cards = buildPlayerIdentityCards();
    const selected = cards.find(row=>row.name===intelligencePlayerCard) || cards[0];
    intelligencePlayerCard = selected?.name || "";
    if (!selected) return `<div class="info-box">${intelligenceCopy("Oyuncu verisi bulunmuyor.","No player data is available.")}</div>`;

    const prestigeProgress = selected.prestige?.progress ?? 100;
    const nextPrestigeText = selected.nextPrestige
      ? intelligenceCopy(`${selected.nextPrestige.name} için ${selected.nextPrestige.remaining} XP`, `${selected.nextPrestige.remaining} XP to ${selected.nextPrestige.name}`)
      : intelligenceCopy("Maksimum Prestige seviyesi","Maximum Prestige level");
    const titleBadges = selected.badges.slice(0,5);
    const titleProbability = simulationPct(selected.championProbability,1);

    const renderAttributeCard = group => `<article class="player-card-attribute-card group-${group.key}">
      <header class="player-card-attribute-header"><div><span>${escapeHTML(group.label.toUpperCase())}</span><strong>${group.score}</strong></div><small>${escapeHTML(group.blurb)}</small></header>
      <div class="player-card-attribute-list">${group.attributes.map(item=>`<div class="player-card-attribute-row"><label>${escapeHTML(playerCardMetricLabel(item.key))}</label><i><b style="width:${item.value}%"></b></i><strong>${item.value}</strong></div>`).join("")}</div>
      <footer class="player-card-attribute-foot"><span>${intelligenceCopy("Öne çıkan","Best")} · <b>${escapeHTML(playerCardMetricLabel(group.topAttribute.key))}</b></span><small>${group.topAttribute.value}</small></footer>
    </article>`;

    return `<div class="intel-section-stack player-card-universe">
      <section class="player-card-universe-hero">
        <div>
          <div class="eyebrow">FIFA 9 · PLAYER CARD UNIVERSE v28</div>
          <h2>${intelligenceCopy("FM Esintili Oyuncu Kimlik Kartları","FM-Inspired Player Identity Cards")}</h2>
          <p>${intelligenceCopy("Yeni kart motoru artık tek katmanlı 12 metrik yerine 6 ana performans sütununu ve her sütunun altında 4 alt parametreyi ayrı ayrı değerlendiriyor. Kart puanı; güncel form, büyük maç etkisi, clean-sheet profili, baskı dayanıklılığı, kariyer mirası ve takım havuzu verimliliğini birlikte okur.","The new card engine now evaluates six core performance pillars with four sub-parameters under each one instead of a flat 12-metric layer. Card value now reads current form, big-match impact, clean-sheet profile, pressure resilience, career legacy and team-pool efficiency together.")}</p>
          <div class="player-card-hero-tags">
            <span>${intelligenceCopy("6 ana sütun","6 core pillars")}</span>
            <span>${intelligenceCopy("24 alt parametre","24 sub-attributes")}</span>
            <span>${intelligenceCopy("FM tarzı scouting mantığı","FM-style scouting logic")}</span>
          </div>
        </div>
        <div class="player-card-selector-shell">
          <span>${intelligenceCopy("OYUNCU SEÇ","SELECT PLAYER")}</span>
          <select id="intelPlayerCardSelect">${cards.map(row=>`<option value="${escapeHTML(row.name)}" ${row.name===selected.name?"selected":""}>${escapeHTML(row.name)} · ${row.overall} OVR · ${escapeHTML(row.prestige.name)}</option>`).join("")}</select>
          <small>${cards.length} ${intelligenceCopy("aktif kart","active cards")}</small>
        </div>
      </section>

      <section class="player-card-showcase model-${selected.modelKey} archetype-${selected.styleKey}">
        <article class="player-card-premium prestige-${selected.modelKey} tier-${selected.cardTier}">
          <div class="player-card-foil"></div><div class="player-card-grid-pattern"></div><div class="player-card-energy"></div>
          <header class="player-card-premium-top">
            <div class="player-card-rating"><strong>${selected.overall}</strong><span>OVR</span></div>
            <div class="player-card-edition"><span>FIFA 9</span><strong>${escapeHTML(selected.modelLabel)}</strong></div>
            <div class="player-card-prestige-mark"><span>${escapeHTML(selected.prestige.icon||"Ⅰ")}</span><small>${escapeHTML(selected.prestige.name)}</small></div>
          </header>
          <div class="player-card-portrait-shell"><div class="player-card-portrait">${escapeHTML(selected.initials)}</div><div class="player-card-portrait-ring"></div></div>
          <div class="player-card-identity">
            <span>${escapeHTML(selected.activeTitle)}</span>
            <h3>${escapeHTML(selected.name)}</h3>
            <strong>${escapeHTML(selected.style)}</strong>
          </div>
          <div class="player-card-live-strip">
            <div><span>${intelligenceCopy("ELO","ELO")}</span><strong>${selected.elo}</strong></div>
            <div><span>${intelligenceCopy("POWER","POWER")}</span><strong>${selected.powerIndex.toFixed(1)}</strong></div>
            <div><span>${intelligenceCopy("GÜVEN","CONFIDENCE")}</span><strong>${selected.confidence}</strong></div>
            <div><span>${intelligenceCopy("ŞAMPİYON","CHAMPION")}</span><strong>${titleProbability}</strong></div>
          </div>
          <div class="player-card-form-ribbon"><span>${intelligenceCopy("SON 10","LAST 10")}</span><div>${playerCardFormRibbon(selected.formResults)}</div></div>
          <div class="player-card-top-badges">${titleBadges.length ? titleBadges.map(item=>`<span class="rarity-${item.rarity?.key||"starter"}" title="${escapeHTML(item.title)}">${escapeHTML(item.icon||"◆")}</span>`).join("") : `<span>◇</span>`}</div>
          <footer class="player-card-prestige-progress">
            <div><span>${selected.xp.toLocaleString(intelligenceLanguage()==="en"?"en-GB":"tr-TR")} XP</span><small>${escapeHTML(nextPrestigeText)}</small></div>
            <i><b style="width:${prestigeProgress}%"></b></i>
          </footer>
        </article>

        <div class="player-card-intelligence">
          <div class="player-card-intelligence-head">
            <div><div class="eyebrow">CARD INTELLIGENCE · SCOUTING MATRIX</div><h3>${intelligenceCopy("Performans DNA’sı 2.0","Performance DNA 2.0")}</h3><p>${intelligenceCopy("Bu kart artık tek bir genel puana değil; Hücum, Savunma, Form, Mental, Miras ve Oyun Kimliği sütunlarının altında çalışan 24 alt parametreye dayanır. Algoritma az örneklemli verileri dengelemek için güven katsayısı uygular; böylece kart hem gerçekçi hem de daha kararlı olur.","This card is no longer driven by a single general score; it now stands on 24 sub-attributes grouped under Attack, Defence, Form, Mental, Legacy and Game Identity. The algorithm applies a confidence coefficient to stabilise low-sample data, making the card both more realistic and more reliable.")}</p></div>
            <div class="player-card-overall-chip"><span>${intelligenceCopy("GENEL","OVERALL")}</span><strong>${selected.overall}</strong><small>${escapeHTML(selected.cardTier.toUpperCase())}</small></div>
          </div>

          <div class="player-card-analysis-grid">
            <section class="player-card-radar-panel">
              ${playerCardRadar(selected.metrics)}
              <div class="player-card-strength-tags">${selected.topMetrics.map(item=>`<span>${escapeHTML(item.label)} <strong>${item.value}</strong></span>`).join("")}</div>
              <div class="player-card-confidence-panel">
                <div><span>${intelligenceCopy("MODEL GÜVENİ","MODEL CONFIDENCE")}</span><strong>${selected.confidence}/100</strong></div>
                <div><span>${intelligenceCopy("BÜYÜK MAÇ ÖRNEĞİ","TOP-MATCH SAMPLE")}</span><strong>${selected.topOpponentGames}</strong></div>
                <div><span>${intelligenceCopy("MAKS GOL","MAX GOALS")}</span><strong>${selected.maxScored}</strong></div>
              </div>
            </section>
            <section class="player-card-attribute-panel">${selected.attributeGroups.map(renderAttributeCard).join("")}</section>
          </div>

          <div class="player-card-live-intelligence-grid">
            <article><span>POWER EXCHANGE</span><strong>${selected.powerIndex.toFixed(1)}</strong><small class="${selected.powerChange>=0?"positive":"negative"}">${selected.powerChange>=0?"+":""}${selected.powerChange.toFixed(1)} · ${escapeHTML(selected.valuationLabel)}</small></article>
            <article><span>${intelligenceCopy("ELO GÜCÜ","ELO POWER")}</span><strong>${selected.elo}</strong><small>${intelligenceCopy("Zirve","Peak")} ${selected.eloPeak} · ${selected.eloChange>=0?"+":""}${selected.eloChange}</small></article>
            <article><span>${intelligenceCopy("ŞAMPİYONLUK YOLU","TITLE PATH")}</span><strong>${titleProbability}</strong><small>${intelligenceCopy("Final","Final")} ${simulationPct(selected.finalProbability,1)}</small></article>
            <article><span>${intelligenceCopy("AKTİF SERİ","ACTIVE RUN")}</span><strong>${selected.currentWinStreak}W</strong><small>${selected.currentUnbeatenStreak} ${intelligenceCopy("maç yenilmez","matches unbeaten")}</small></article>
          </div>

          <div class="player-card-career-row">
            <div><span>${intelligenceCopy("KARİYER MAÇI","CAREER MATCHES")}</span><strong>${selected.career.games||0}</strong></div>
            <div><span>${intelligenceCopy("GALİBİYET","WINS")}</span><strong>${selected.career.wins||0}</strong></div>
            <div><span>${intelligenceCopy("ŞAMPİYONLUK","TITLES")}</span><strong>${selected.career.titles||0}</strong></div>
            <div><span>${intelligenceCopy("FİNAL","FINALS")}</span><strong>${selected.career.finals||0}</strong></div>
            <div><span>${intelligenceCopy("FAVORİ TAKIM","FAVOURITE TEAM")}</span><strong>${escapeHTML(selected.favoriteTeam)}</strong></div>
            <div><span>${intelligenceCopy("TAKIM ÇEŞİTLİLİĞİ","TEAM VARIETY")}</span><strong>${selected.uniqueTeams}</strong></div>
          </div>

          <div class="player-card-explanation-grid player-card-scout-grid">
            <article><span>${intelligenceCopy("KARTIN EN GÜÇLÜ TARAFI","CARD SIGNATURE")}</span><strong>${escapeHTML(selected.topMetrics[0]?.label||"—")} · ${selected.topMetrics[0]?.value||0}</strong><p>${intelligenceCopy("Kartın genel puanına en çok güç veren ana sütun.","The pillar contributing the most strength to the overall card.")}</p></article>
            <article><span>${intelligenceCopy("EN İYİ ALT PARAMETRE","BEST SUB-ATTRIBUTE")}</span><strong>${escapeHTML(selected.bestSubAttribute?.label||"—")} · ${selected.bestSubAttribute?.value||0}</strong><p>${intelligenceCopy("Oyuncunun bu kartta en belirgin uzmanlık alanı.","The player’s clearest specialist area on this card.")}</p></article>
            <article><span>${intelligenceCopy("GELİŞİM ALANI","DEVELOPMENT AREA")}</span><strong>${escapeHTML(selected.weakMetrics[0]?.label||"—")} · ${selected.weakMetrics[0]?.value||0}</strong><p>${intelligenceCopy("Bir üst seviyeye çıkmak için en fazla geliştirilmesi gereken ana sütun.","The pillar that needs the most improvement to reach the next tier.")}</p></article>
            <article><span>${intelligenceCopy("ZAYIF ALT PARAMETRE","WEAKEST SUB-ATTRIBUTE")}</span><strong>${escapeHTML(selected.weakestSubAttribute?.label||"—")} · ${selected.weakestSubAttribute?.value||0}</strong><p>${intelligenceCopy("Algoritmanın en kırılgan gördüğü detay parametre.","The most fragile detailed parameter according to the model.")}</p></article>
            <article><span>${intelligenceCopy("KART MODELİ","CARD MODEL")}</span><strong>${escapeHTML(selected.modelLabel)}</strong><p>${intelligenceCopy("Tasarım, Prestige seviyesi ve oyun arketipine göre otomatik seçilir.","The design is selected automatically from the player’s Prestige level and playing archetype.")}</p></article>
            <article><span>${intelligenceCopy("SCOUT ÖZETİ","SCOUT SUMMARY")}</span><strong>${escapeHTML(selected.scoutingFocus)}</strong><p>${intelligenceCopy(`Kartın omurgası ${selected.scoutingFocus}; bir sonraki seviye için odak alanı ${selected.developmentFocus}.`,`The backbone of this card is ${selected.scoutingFocus}; the key focus for the next tier is ${selected.developmentFocus}.`)}</p></article>
          </div>
        </div>
      </section>

      <section class="panel player-card-elo-panel">
        <div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Elo ve Kariyer Hareketi","Elo & Career Movement")}</h3><div class="panel-subtitle">${intelligenceCopy("Son Elo değişimleri, güncel form ve Prestige ilerlemesi aynı çizgide.","Recent Elo movement, current form and Prestige progress on one line.")}</div></div><span class="badge badge-gold">${selected.elo} ELO</span></div>
        <div class="player-card-history-layout">
          <div class="player-card-history-chart">${intelligenceSparkline(selected.eloTimeline,"player-card-elo-spark")}</div>
          <div class="player-card-history-stats">
            <div><span>${intelligenceCopy("SON 5 ELO","LAST 5 ELO")}</span><strong class="${selected.eloChange>=0?"positive":"negative"}">${selected.eloChange>=0?"+":""}${selected.eloChange}</strong></div>
            <div><span>${intelligenceCopy("MOMENTUM","MOMENTUM")}</span><strong>${selected.momentum>=0?"+":""}${selected.momentum}</strong></div>
            <div><span>${intelligenceCopy("VOLATİLİTE","VOLATILITY")}</span><strong>${selected.volatility}/100</strong></div>
            <div><span>${intelligenceCopy("ROZETLER","BADGES")}</span><strong>${selected.badges.length}</strong></div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Premium Kart Koleksiyonu","Premium Card Collection")}</h3><div class="panel-subtitle">${intelligenceCopy("Bütün oyuncular Overall, Prestige ve Elo değerine göre canlı sıralanır.","All players are ranked live by Overall, Prestige and Elo.")}</div></div><span class="badge badge-blue">${cards.length} CARDS</span></div>
        <div class="player-card-collection-v26">${cards.map((row,index)=>`<button class="player-card-mini-v26 prestige-${row.modelKey} archetype-${row.styleKey} ${row.name===selected.name?"active":""}" data-action="select-player-card" data-player-name="${escapeHTML(row.name)}">
          <div class="mini-card-shine"></div><header><strong>${row.overall}</strong><span>${escapeHTML(row.prestige.name)}</span><b>#${index+1}</b></header>
          <div class="mini-card-avatar">${escapeHTML(row.initials)}</div>
          <h4>${escapeHTML(row.name)}</h4><p>${escapeHTML(row.activeTitle)}</p>
          <div class="mini-card-data"><span>${row.elo} ELO</span><span>${row.powerIndex.toFixed(1)} PWR</span></div>
          <footer><span>${escapeHTML(row.style)}</span><b>${row.xp.toLocaleString(intelligenceLanguage()==="en"?"en-GB":"tr-TR")} XP</b></footer>
        </button>`).join("")}</div>
      </section>
    </div>`;
  }


  // ──────────────────────────────────────────────────────────────────────────
  // FIFA 9 LIVING INTELLIGENCE · PHASE I · v19
  // Power Exchange, Pressure Chamber, Destiny Path, Live Match Pulse and
  // the data-driven AI Tournament Director.
  // ──────────────────────────────────────────────────────────────────────────

  function intelligenceLanguage() {
    return window.FIFA_I18N?.language === "en" ? "en" : "tr";
  }

  function intelligenceCopy(tr, en) {
    return intelligenceLanguage() === "en" ? en : tr;
  }

  function intelligenceSigned(value, digits = 1) {
    const number = Number(value) || 0;
    return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`;
  }

  function intelligencePlayerId(name) {
    return state.current.participants.find(player => player.name.trim() === String(name || "").trim())?.id || "";
  }

  function intelligenceStageWeight(stage) {
    const value = String(stage || "").toLocaleLowerCase("tr");
    if (value.includes("yarı") || value.includes("semi")) return 1.85;
    if ((value.includes("final") || value.includes("şampiyon")) && !value.includes("yarı") && !value.includes("semi")) return 2.25;
    if (value.includes("eleme") || value.includes("knockout") || value.includes("quarter") || value.includes("çeyrek")) return 1.65;
    if (value.includes("altın") || value.includes("gold") || value.includes("gümüş") || value.includes("silver")) return 1.3;
    return 1;
  }

  function intelligenceSparkline(values, className = "") {
    const data = (values || []).map(Number).filter(Number.isFinite);
    if (data.length < 2) return `<span class="intel-spark-empty">—</span>`;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const points = data.map((value, index) => {
      const x = data.length === 1 ? 50 : index / (data.length - 1) * 100;
      const y = 28 - ((value - min) / range * 24);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="intel-sparkline ${className}" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="${points}"></polyline></svg>`;
  }

  function buildPressureChamber() {
    const names = intelligenceNames();
    const elo = buildEloAnalytics();
    const form = buildFormAnalytics(20, "all");
    const currentCompleted = allCurrentMatches().filter(matchComplete);

    const players = names.map(name => {
      const records = elo.records.filter(record => record.home === name || record.away === name);
      let weightedResult = 0;
      let weightedTotal = 0;
      let clutchGames = 0;
      let clutchWins = 0;
      let knockoutGames = 0;
      let knockoutWins = 0;
      let favouriteGames = 0;
      let favouriteWins = 0;
      let underdogGames = 0;
      let underdogWins = 0;
      let highPressureGames = 0;
      const pressureSequence = [];

      records.forEach(record => {
        const isHome = record.home === name;
        const expected = isHome ? record.expectedHome : 1 - record.expectedHome;
        const actual = !record.winner ? .5 : record.winner === name ? 1 : 0;
        const margin = Math.abs(Number(record.match.homeScore) - Number(record.match.awayScore));
        const stageWeight = intelligenceStageWeight(record.match.stage);
        const closeWeight = margin <= 1 ? .4 : margin === 2 ? .18 : 0;
        const underdogWeight = expected < .42 ? .35 : 0;
        const currentWeight = Number(record.match.edition) === Number(state.current.edition || 9) ? .18 : 0;
        const weight = stageWeight + closeWeight + underdogWeight + currentWeight;
        weightedResult += actual * weight;
        weightedTotal += weight;
        pressureSequence.push({ actual, weight, expected, margin, stageWeight });

        if (margin <= 1) { clutchGames += 1; if (actual === 1) clutchWins += 1; }
        if (stageWeight >= 1.6) { knockoutGames += 1; if (actual === 1) knockoutWins += 1; }
        if (expected >= .58) { favouriteGames += 1; if (actual === 1) favouriteWins += 1; }
        if (expected <= .42) { underdogGames += 1; if (actual === 1) underdogWins += 1; }
        if (stageWeight >= 1.3 || margin <= 1 || expected <= .42) highPressureGames += 1;
      });

      const currentPlayerMatches = currentCompleted.filter(match => [match.homeId, match.awayId].includes(intelligencePlayerId(name)));
      const comebackWins = currentPlayerMatches.filter(match => matchWinnerId(match) && playerName(matchWinnerId(match)) === name && analyzeLiveArchive(match).comeback).length;
      const lateWins = currentPlayerMatches.filter(match => matchWinnerId(match) && playerName(matchWinnerId(match)) === name && analyzeLiveArchive(match).lateWinner).length;
      const pressurePerformance = weightedTotal ? weightedResult / weightedTotal * 100 : 50;
      const clutchRate = clutchGames ? clutchWins / clutchGames * 100 : 50;
      const knockoutRate = knockoutGames ? knockoutWins / knockoutGames * 100 : 50;
      const protectionRate = favouriteGames ? favouriteWins / favouriteGames * 100 : 55;
      const upsetRate = underdogGames ? underdogWins / underdogGames * 100 : 35;
      const resilience = intelligenceClamp(48 + comebackWins * 11 + lateWins * 8 + (form.playerMap.get(name)?.currentUnbeatenStreak || 0) * 2.5);
      const mentalIndex = Math.round(intelligenceClamp(
        pressurePerformance * .34 + clutchRate * .2 + knockoutRate * .16 + protectionRate * .11 + upsetRate * .09 + resilience * .1
      ));
      const last5Pressure = pressureSequence.slice(-5);
      const previous5Pressure = pressureSequence.slice(-10, -5);
      const weightedRate = list => {
        const total = list.reduce((sum, item) => sum + item.weight, 0);
        return total ? list.reduce((sum, item) => sum + item.actual * item.weight, 0) / total * 100 : 50;
      };
      const trend = weightedRate(last5Pressure) - weightedRate(previous5Pressure);
      let archetype = "pressure-ready";
      let archetypeLabel = intelligenceCopy("Baskıya Hazır", "Pressure Ready");
      if (mentalIndex >= 88) { archetype = "final-boss"; archetypeLabel = "FINAL BOSS"; }
      else if (mentalIndex >= 80) { archetype = "ice-cold"; archetypeLabel = "ICE COLD"; }
      else if (mentalIndex >= 72) { archetype = "clutch"; archetypeLabel = "CLUTCH PLAYER"; }
      else if (mentalIndex < 52) { archetype = "volatile"; archetypeLabel = intelligenceCopy("Kırılgan Baskı", "Pressure Fragile"); }

      return {
        name,
        mentalIndex,
        pressurePerformance,
        clutchRate,
        knockoutRate,
        protectionRate,
        upsetRate,
        resilience,
        clutchGames,
        knockoutGames,
        favouriteGames,
        underdogGames,
        underdogWins,
        comebackWins,
        lateWins,
        highPressureGames,
        trend,
        archetype,
        archetypeLabel,
        confidence: intelligenceClamp(25 + Math.min(75, highPressureGames * 4.2)),
        elo: elo.playerMap.get(name)?.rating || 1500
      };
    }).sort((a, b) => b.mentalIndex - a.mentalIndex || b.pressurePerformance - a.pressurePerformance || b.elo - a.elo || a.name.localeCompare(b.name, "tr"))
      .map((row, index) => ({ ...row, rank: index + 1 }));

    return {
      players,
      playerMap: new Map(players.map(row => [row.name, row])),
      leader: players[0] || null,
      clutchLeader: [...players].sort((a, b) => b.clutchRate - a.clutchRate || b.clutchGames - a.clutchGames)[0] || null,
      giantKiller: [...players].sort((a, b) => b.underdogWins - a.underdogWins || b.upsetRate - a.upsetRate)[0] || null,
      riser: [...players].sort((a, b) => b.trend - a.trend)[0] || null
    };
  }

  function renderPressureChamberSection() {
    const data = buildPressureChamber();
    if (!data.players.length) return `<div class="info-box">${intelligenceCopy("Baskı analizi için maç verisi bekleniyor.", "Match data is required for pressure analysis.")}</div>`;
    return `<div class="intel-section-stack">
      <section class="pressure-hero"><div><div class="eyebrow">PRESSURE CHAMBER</div><h2>${intelligenceCopy("Baskı ve Mental Güç Merkezi", "Pressure & Mental Strength Centre")}</h2><p>${intelligenceCopy("Oyuncuların yakın maç, eleme, final, favori koruma ve sürpriz performanslarını tek bir mental güç modelinde birleştirir.", "Combines close-match, knockout, final, favourite-protection and upset performance in one mental-strength model.")}</p></div><div class="pressure-crown"><span>#1 MENTAL</span><strong>${escapeHTML(data.leader?.name || "—")}</strong><b>${data.leader?.mentalIndex || 0}</b><small>${escapeHTML(data.leader?.archetypeLabel || "")}</small></div></section>
      <div class="intel-record-grid pressure-records">
        ${kpiCard(intelligenceCopy("Mental Lider", "Mental Leader"), data.leader?.name || "—", data.leader ? `${data.leader.mentalIndex}/100 · ${data.leader.archetypeLabel}` : "—")}
        ${kpiCard(intelligenceCopy("Clutch Lideri", "Clutch Leader"), data.clutchLeader?.name || "—", data.clutchLeader ? `${data.clutchLeader.clutchRate.toFixed(0)}% · ${data.clutchLeader.clutchGames} ${intelligenceCopy("yakın maç", "close matches")}` : "—")}
        ${kpiCard(intelligenceCopy("Dev Avcısı", "Giant Killer"), data.giantKiller?.name || "—", data.giantKiller ? `${data.giantKiller.underdogWins} ${intelligenceCopy("sürpriz galibiyet", "upset wins")}` : "—")}
        ${kpiCard(intelligenceCopy("Baskıda Yükselen", "Pressure Riser"), data.riser?.name || "—", data.riser ? `${intelligenceSigned(data.riser.trend)} ${intelligenceCopy("trend", "trend")}` : "—")}
      </div>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Mental Güç Sıralaması", "Mental Strength Ranking")}</h3><div class="panel-subtitle">${intelligenceCopy("Her sonuçtan sonra baskı profili otomatik yeniden hesaplanır.", "The pressure profile is recalculated automatically after every result.")}</div></div><span class="badge badge-gold">LIVE MENTAL INDEX</span></div>
        <div class="pressure-table"><div class="head"><span>#</span><span>${intelligenceCopy("Oyuncu", "Player")}</span><span>MENTAL</span><span>CLUTCH</span><span>${intelligenceCopy("ELEME", "KNOCKOUT")}</span><span>${intelligenceCopy("FAVORİ KORUMA", "FAVOURITE HOLD")}</span><span>${intelligenceCopy("DİRENÇ", "RESILIENCE")}</span><span>${intelligenceCopy("KİMLİK", "IDENTITY")}</span></div>${data.players.map(row => `<div class="pressure-row archetype-${row.archetype}"><span>${row.rank}</span><strong>${escapeHTML(row.name)}</strong><b>${row.mentalIndex}</b><span>${row.clutchRate.toFixed(0)}%</span><span>${row.knockoutRate.toFixed(0)}%</span><span>${row.protectionRate.toFixed(0)}%</span><span>${row.resilience.toFixed(0)}</span><small>${escapeHTML(row.archetypeLabel)}</small></div>`).join("")}</div>
      </section>
      <section class="pressure-card-grid">${data.players.slice(0, 6).map(row => `<article class="pressure-player-card archetype-${row.archetype}"><div class="pressure-player-head"><span>${row.rank}</span><div><strong>${escapeHTML(row.name)}</strong><small>${row.elo} Elo · ${row.highPressureGames} ${intelligenceCopy("baskı maçı", "pressure matches")}</small></div><b>${row.mentalIndex}</b></div><div class="pressure-radar-bars"><div><span>CLUTCH</span><i style="width:${row.clutchRate}%"></i><strong>${row.clutchRate.toFixed(0)}</strong></div><div><span>KNOCKOUT</span><i style="width:${row.knockoutRate}%"></i><strong>${row.knockoutRate.toFixed(0)}</strong></div><div><span>RESILIENCE</span><i style="width:${row.resilience}%"></i><strong>${row.resilience.toFixed(0)}</strong></div></div><footer><span>${escapeHTML(row.archetypeLabel)}</span><em class="${row.trend >= 0 ? "positive" : "negative"}">${intelligenceSigned(row.trend)}</em></footer></article>`).join("")}</section>
      <div class="info-box"><strong>${intelligenceCopy("Model notu:", "Model note:")}</strong> ${intelligenceCopy("Mental puan; yakın maç başarısı, eleme/final performansı, favoriyken skor koruma, güçlü rakibe karşı sürpriz ve canlı kayıtlardaki geri dönüşlerden hesaplanır. Bu bir psikolojik teşhis değil, turnuva içi performans göstergesidir.", "The mental score is calculated from close-match success, knockout/final performance, favourite protection, upsets against stronger opponents and comebacks recorded live. It is a tournament performance indicator, not a psychological diagnosis.")}</div>
    </div>`;
  }

  function buildPowerExchange() {
    const elo = buildEloAnalytics();
    const form = buildFormAnalytics(20, "all");
    const pressure = buildPressureChamber();
    const simulation = buildTournamentSimulation();
    const simMap = new Map((simulation?.rows || []).map(row => [row.name, row]));
    const formRank = new Map(form.players.map((row, index) => [row.name, index + 1]));
    const simRank = new Map((simulation?.rows || []).map((row, index) => [row.name, index + 1]));

    const players = intelligenceNames().map(name => {
      const e = elo.playerMap.get(name) || { rating:1500, rank:99, last5Change:0, timeline:[] };
      const f = form.playerMap.get(name) || { formIndex:50, momentum:0, results:[], last5Points:0, previous5Points:0, games:0 };
      const p = pressure.playerMap.get(name) || { mentalIndex:50 };
      const s = simMap.get(name) || { championProbability:0, finalProbability:0 };
      const titleSignal = Math.sqrt(Math.max(0, s.championProbability || 0)) * 100;
      const raw = 100 + (e.rating - 1500) * .23 + (f.formIndex - 50) * .46 + f.momentum * 1.45 + (p.mentalIndex - 50) * .2 + titleSignal * .22;
      const powerIndex = Math.round(Math.max(55, Math.min(235, raw)) * 10) / 10;
      const change = e.last5Change * .12 + f.momentum * 1.35 + (f.last5Points - f.previous5Points) * .38;
      const points = (f.results || []).slice(-10).map(item => item.result === "W" ? 3 : item.result === "D" ? 1 : 0);
      const mean = points.length ? points.reduce((sum, value) => sum + value, 0) / points.length : 1.5;
      const variance = points.length ? points.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / points.length : 0;
      const goalDiffs = (f.results || []).slice(-10).map(item => item.gf - item.ga);
      const gdMean = goalDiffs.length ? goalDiffs.reduce((sum, value) => sum + value, 0) / goalDiffs.length : 0;
      const gdVariance = goalDiffs.length ? goalDiffs.reduce((sum, value) => sum + Math.pow(value - gdMean, 2), 0) / goalDiffs.length : 0;
      const volatility = Math.round(intelligenceClamp(18 + Math.sqrt(variance) * 24 + Math.sqrt(gdVariance) * 8 + Math.abs(f.momentum) * 2));
      const fRank = formRank.get(name) || 99;
      const sRank = simRank.get(name) || 99;
      let valuation = "fair";
      let valuationLabel = intelligenceCopy("DENGELİ", "FAIR VALUE");
      if ((fRank + 3 <= e.rank || sRank + 4 <= e.rank) && change >= 0) { valuation = "undervalued"; valuationLabel = intelligenceCopy("GİZLİ DEĞER", "UNDERVALUED"); }
      else if (e.rank + 4 <= fRank && change < 0) { valuation = "overheated"; valuationLabel = intelligenceCopy("AŞIRI ISINMIŞ", "OVERHEATED"); }
      else if (change >= 5) { valuation = "rally"; valuationLabel = intelligenceCopy("GÜÇLÜ RALLİ", "STRONG RALLY"); }
      else if (change <= -5) { valuation = "selloff"; valuationLabel = intelligenceCopy("SERT DÜŞÜŞ", "SELL-OFF"); }
      return {
        name,
        powerIndex,
        change,
        volatility,
        valuation,
        valuationLabel,
        elo:e.rating,
        eloRank:e.rank || 99,
        form:f.formIndex || 50,
        formRank:fRank,
        mental:p.mentalIndex || 50,
        championProbability:s.championProbability || 0,
        finalProbability:s.finalProbability || 0,
        spark:(e.timeline || []).slice(-14).map(item => item.rating)
      };
    }).sort((a, b) => b.powerIndex - a.powerIndex || b.elo - a.elo || a.name.localeCompare(b.name, "tr"))
      .map((row, index) => ({ ...row, rank:index + 1 }));

    return {
      players,
      leader:players[0] || null,
      riser:[...players].sort((a,b)=>b.change-a.change)[0] || null,
      faller:[...players].sort((a,b)=>a.change-b.change)[0] || null,
      hidden:[...players].filter(row=>row.valuation==="undervalued").sort((a,b)=>b.change-a.change||b.powerIndex-a.powerIndex)[0] || null,
      volatile:[...players].sort((a,b)=>b.volatility-a.volatility)[0] || null
    };
  }

  function renderPowerExchangeSection() {
    const data = buildPowerExchange();
    if (!data.players.length) return `<div class="info-box">${intelligenceCopy("Power Exchange için oyuncu verisi bekleniyor.", "Player data is required for Power Exchange.")}</div>`;
    return `<div class="intel-section-stack">
      <section class="exchange-hero"><div><div class="eyebrow">FIFA 9 POWER EXCHANGE</div><h2>${intelligenceCopy("Turnuva Güç Piyasası", "Tournament Power Market")}</h2><p>${intelligenceCopy("Elo, güncel form, mental güç ve şampiyonluk ihtimalini tek bir canlı Power Index içinde birleştirir. Her resmî sonuçtan sonra piyasa yeniden fiyatlanır.", "Combines Elo, current form, mental strength and title probability into one live Power Index. The market is repriced after every official result.")}</p></div><div class="exchange-ticker"><span>F9PX</span><strong>${data.leader?.powerIndex.toFixed(1) || "—"}</strong><b class="${(data.leader?.change || 0) >= 0 ? "positive" : "negative"}">${intelligenceSigned(data.leader?.change || 0)}</b><small>${escapeHTML(data.leader?.name || "")}</small></div></section>
      <div class="exchange-summary-grid">
        <article><span>${intelligenceCopy("Piyasa Lideri", "Market Leader")}</span><strong>${escapeHTML(data.leader?.name || "—")}</strong><b>${data.leader?.powerIndex.toFixed(1) || "—"}</b></article>
        <article><span>${intelligenceCopy("En Güçlü Yükseliş", "Top Gainer")}</span><strong>${escapeHTML(data.riser?.name || "—")}</strong><b class="positive">${intelligenceSigned(data.riser?.change || 0)}</b></article>
        <article><span>${intelligenceCopy("En Sert Düşüş", "Top Decliner")}</span><strong>${escapeHTML(data.faller?.name || "—")}</strong><b class="negative">${intelligenceSigned(data.faller?.change || 0)}</b></article>
        <article><span>${intelligenceCopy("Gizli Değer", "Hidden Value")}</span><strong>${escapeHTML(data.hidden?.name || "—")}</strong><b>${data.hidden?.valuationLabel || intelligenceCopy("Veri bekleniyor", "Waiting for data")}</b></article>
        <article><span>${intelligenceCopy("En Volatil", "Most Volatile")}</span><strong>${escapeHTML(data.volatile?.name || "—")}</strong><b>${data.volatile?.volatility || 0}/100</b></article>
      </div>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Power Exchange Board</h3><div class="panel-subtitle">${intelligenceCopy("Endeks değeri para veya bahis değeri değildir; oyuncunun turnuva içindeki birleşik rekabet gücünü temsil eder.", "The index is not money or a betting value; it represents the player's combined competitive strength within the tournament.")}</div></div><span class="badge badge-gold">AUTO REPRICE</span></div>
        <div class="exchange-board"><div class="head"><span>#</span><span>${intelligenceCopy("Oyuncu", "Player")}</span><span>POWER INDEX</span><span>${intelligenceCopy("DEĞİŞİM", "CHANGE")}</span><span>${intelligenceCopy("TREND", "TREND")}</span><span>ELO</span><span>FORM</span><span>MENTAL</span><span>${intelligenceCopy("ŞAMPİYON", "CHAMPION")}</span><span>${intelligenceCopy("SİNYAL", "SIGNAL")}</span></div>${data.players.map(row => `<div class="exchange-row value-${row.valuation}"><span>${row.rank}</span><strong>${escapeHTML(row.name)}</strong><b>${row.powerIndex.toFixed(1)}</b><em class="${row.change >= 0 ? "positive" : "negative"}">${intelligenceSigned(row.change)}</em><span>${intelligenceSparkline(row.spark, row.change >= 0 ? "up" : "down")}</span><span>${row.elo}</span><span>${row.form}</span><span>${row.mental}</span><span>${simulationPct(row.championProbability,1)}</span><small>${escapeHTML(row.valuationLabel)}</small></div>`).join("")}</div>
      </section>
      <section class="exchange-card-grid">${data.players.slice(0,8).map(row => `<article class="exchange-player-card value-${row.valuation}"><header><span>#${row.rank}</span><small>${escapeHTML(row.valuationLabel)}</small></header><h3>${escapeHTML(row.name)}</h3><div class="exchange-index"><strong>${row.powerIndex.toFixed(1)}</strong><em class="${row.change >= 0 ? "positive" : "negative"}">${intelligenceSigned(row.change)}</em></div>${intelligenceSparkline(row.spark, row.change >= 0 ? "up" : "down")}<footer><span>${row.elo} ELO</span><span>${row.volatility} VOL</span><span>${simulationPct(row.championProbability,1)} TITLE</span></footer></article>`).join("")}</section>
    </div>`;
  }

  function buildDestinyPath(name) {
    const simulation = buildTournamentSimulation();
    if (!simulation) return null;
    const selected = simulation.rows.find(row => row.name === name) || simulation.rows[0];
    if (!selected) return null;
    const id = intelligencePlayerId(selected.name);
    const nextMatch = liveEligibleMatches().find(match => [match.homeId, match.awayId].includes(id)) || null;
    const odds = nextMatch ? buildMatchOdds(nextMatch, oddsBuildContext()) : null;
    const playerSide = nextMatch?.homeId === id ? "home" : "away";
    const winProbability = odds ? odds.market[playerSide].probability : 0;
    const stageFactors = { league:8, gold:11, silver:11, knockout:15, final:18 };
    const leverage = nextMatch ? stageFactors[nextMatch.phase] || 8 : 0;
    const winSwing = nextMatch ? Math.min(18, (1 - winProbability) * leverage) : 0;
    const lossSwing = nextMatch ? Math.min(18, winProbability * leverage) : 0;
    const deterministic = simulation.mostLikely;
    const projectedLeague = deterministic.leagueTable.find(row => row.id === id);
    const projectedGroup = deterministic.goldIds.includes(id) ? "gold" : deterministic.silverIds.includes(id) ? "silver" : "out";
    const projectedGroupRow = projectedGroup === "gold" ? deterministic.goldTable.find(row=>row.id===id) : projectedGroup === "silver" ? deterministic.silverTable.find(row=>row.id===id) : null;
    const series = [...(deterministic.qf || []), ...(deterministic.semifinals || [])].filter(item => [item.playerAId,item.playerBId].includes(id));
    const finalInvolvement = [deterministic.final?.homeId, deterministic.final?.awayId].includes(id) ? deterministic.final : null;
    const routeOpponents = series.map(item => playerName(item.playerAId === id ? item.playerBId : item.playerAId));
    if (finalInvolvement) routeOpponents.push(playerName(finalInvolvement.homeId === id ? finalInvolvement.awayId : finalInvolvement.homeId));
    const groupProbability = projectedGroup === "gold" ? selected.goldProbability : projectedGroup === "silver" ? selected.silverProbability : selected.eliminatedProbability;
    const currentLeague = leagueStandings().find(row=>row.id===id);
    const actualGroup = state.current.phase2.generated ? (state.current.phase2.goldIds.includes(id) ? "gold" : state.current.phase2.silverIds.includes(id) ? "silver" : "out") : "";
    return {
      selected,
      id,
      simulation,
      nextMatch,
      odds,
      winProbability,
      winSwing,
      lossSwing,
      projectedLeague,
      projectedGroup,
      projectedGroupRow,
      groupProbability,
      routeOpponents,
      currentLeague,
      actualGroup,
      nodes:[
        { key:"league", label:intelligenceCopy("League Phase", "League Phase"), value:projectedLeague ? `${projectedLeague.rank}. · ${projectedLeague.pts} P` : "—", probability:1 },
        { key:projectedGroup, label:projectedGroup === "gold" ? intelligenceCopy("Altın Grup", "Gold Group") : projectedGroup === "silver" ? intelligenceCopy("Gümüş Grup", "Silver Group") : intelligenceCopy("Elenme Hattı", "Elimination Line"), value:simulationPct(groupProbability,1), probability:groupProbability },
        { key:"semi", label:intelligenceCopy("Yarı Final", "Semi-final"), value:simulationPct(selected.semiProbability,1), probability:selected.semiProbability },
        { key:"final", label:intelligenceCopy("Final", "Final"), value:simulationPct(selected.finalProbability,1), probability:selected.finalProbability },
        { key:"champion", label:intelligenceCopy("Şampiyon", "Champion"), value:simulationPct(selected.championProbability,1), probability:selected.championProbability }
      ]
    };
  }

  function renderDestinyPathSection() {
    const simulation = buildTournamentSimulation();
    if (!simulation) return emptyState("◇", intelligenceCopy("Kader Yolu Kura Sonrası Açılır", "Destiny Path Opens After the Draw"), intelligenceCopy("League Phase fikstürü oluşturulduğunda her oyuncunun olası turnuva rotası canlı simülasyondan hesaplanır.", "Once the League Phase schedule is generated, every player's possible tournament route is calculated from the live simulation."));
    if (!intelligenceDestinyPlayer || !simulation.rows.some(row=>row.name===intelligenceDestinyPlayer)) intelligenceDestinyPlayer = simulation.rows[0]?.name || "";
    const data = buildDestinyPath(intelligenceDestinyPlayer);
    if (!data) return `<div class="info-box">${intelligenceCopy("Kader yolu oluşturulamadı.", "The destiny path could not be generated.")}</div>`;
    const row = data.selected;
    const nextOpponent = data.nextMatch ? playerName(data.nextMatch.homeId === data.id ? data.nextMatch.awayId : data.nextMatch.homeId) : "—";
    return `<div class="intel-section-stack">
      <section class="destiny-hero"><div><div class="eyebrow">DESTINY PATH</div><h2>${intelligenceCopy("Oyuncunun Kader Yolu", "Player Destiny Path")}</h2><p>${intelligenceCopy("Monte Carlo simülasyonu, güncel Elo ve kalan fikstürü kullanarak her oyuncunun kupaya giden olası rotasını sürekli yeniden çizer.", "Monte Carlo simulation continuously redraws every player's possible route to the trophy using current Elo and the remaining schedule.")}</p></div><select id="intelDestinyPlayerSelect">${simulation.rows.map(item=>`<option value="${escapeHTML(item.name)}" ${item.name===row.name?"selected":""}>${escapeHTML(item.name)} · ${simulationPct(item.championProbability,1)}</option>`).join("")}</select></section>
      <section class="destiny-profile"><div class="destiny-player"><span>${escapeHTML(row.name.split(" ").map(part=>part[0]).slice(0,2).join("").toUpperCase())}</span><div><h3>${escapeHTML(row.name)}</h3><p>${row.elo} Elo · ${row.eloTier?.label || ""}</p></div><strong>${simulationPct(row.championProbability,1)}<small>${intelligenceCopy("ŞAMPİYONLUK", "TITLE")}</small></strong></div><div class="destiny-current-grid"><div><span>${intelligenceCopy("Tahmini Lig Sırası", "Projected League Rank")}</span><strong>${row.expectedLeagueRank.toFixed(1)}.</strong></div><div><span>${intelligenceCopy("Tahmini Puan", "Projected Points")}</span><strong>${row.expectedLeaguePoints.toFixed(1)}</strong></div><div><span>${intelligenceCopy("Yarı Final", "Semi-final")}</span><strong>${simulationPct(row.semiProbability,1)}</strong></div><div><span>${intelligenceCopy("Final", "Final")}</span><strong>${simulationPct(row.finalProbability,1)}</strong></div></div></section>
      <section class="destiny-path-track">${data.nodes.map((node,index)=>`<article class="destiny-node node-${node.key}"><div class="destiny-node-ring" style="--destiny:${Math.round(node.probability*360)}deg"><span>${index+1}</span></div><strong>${escapeHTML(node.label)}</strong><b>${escapeHTML(node.value)}</b>${index<data.nodes.length-1?`<i>→</i>`:""}</article>`).join("")}</section>
      <div class="grid-2 destiny-grids"><section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Sıradaki Kader Maçı", "Next Destiny Match")}</h3><div class="panel-subtitle">${intelligenceCopy("Bir sonraki resmî maçın model üzerindeki tahmini etkisi.", "Estimated model impact of the next official match.")}</div></div><span class="badge badge-gold">LEVERAGE</span></div>${data.nextMatch ? `<div class="destiny-next-match"><span>${escapeHTML(currentMatchStageLabel(data.nextMatch))}</span><div><strong>${escapeHTML(row.name)}</strong><b>VS</b><strong>${escapeHTML(nextOpponent)}</strong></div><p>${intelligenceCopy("Kazanma ihtimali", "Win probability")}: <b>${simulationPct(data.winProbability,1)}</b></p><div class="destiny-swing"><div class="win"><span>${intelligenceCopy("Kazanırsa tahmini sıçrama", "Estimated upside with a win")}</span><strong>+${data.winSwing.toFixed(1)} pp</strong></div><div class="loss"><span>${intelligenceCopy("Kaybederse tahmini risk", "Estimated downside with a loss")}</span><strong>−${data.lossSwing.toFixed(1)} pp</strong></div></div></div>` : `<div class="info-box">${intelligenceCopy("Bekleyen maç bulunmuyor; kader yolu tamamlandı.", "No pending match remains; the destiny path is complete.")}</div>`}</section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("En Olası Yolculuk", "Most Likely Journey")}</h3><div class="panel-subtitle">${intelligenceCopy("Ana simülasyon senaryosundaki rakip ve aşamalar.", "Opponents and stages in the primary simulation scenario.")}</div></div><span class="badge badge-blue">PATH MAP</span></div><div class="destiny-route-list"><div><span>${intelligenceCopy("League Phase", "League Phase")}</span><strong>${data.projectedLeague ? `${data.projectedLeague.rank}. ${intelligenceCopy("sıra", "place")} · ${data.projectedLeague.pts} P` : "—"}</strong></div><div><span>${intelligenceCopy("İkinci Aşama", "Second Stage")}</span><strong>${data.projectedGroup === "gold" ? intelligenceCopy("Altın Grup", "Gold Group") : data.projectedGroup === "silver" ? intelligenceCopy("Gümüş Grup", "Silver Group") : intelligenceCopy("Elendi", "Eliminated")}${data.projectedGroupRow ? ` · ${data.projectedGroupRow.rank}.` : ""}</strong></div><div><span>${intelligenceCopy("Olası Rakipler", "Likely Opponents")}</span><strong>${escapeHTML(data.routeOpponents.join(" → ") || intelligenceCopy("Henüz oluşmadı", "Not formed yet"))}</strong></div><div><span>${intelligenceCopy("Model Kararı", "Model Verdict")}</span><strong>${row.championProbability >= .2 ? intelligenceCopy("Kupaya gerçek aday", "Genuine title contender") : row.finalProbability >= .25 ? intelligenceCopy("Final yolu açık", "Final route is open") : row.semiProbability >= .35 ? intelligenceCopy("Tehlikeli yarışmacı", "Dangerous challenger") : intelligenceCopy("Sürpriz yol arıyor", "Seeking an upset route")}</strong></div></div></section></div>
      <div class="info-box"><strong>${intelligenceCopy("Kader sabit değildir:", "Destiny is not fixed:")}</strong> ${intelligenceCopy("Yeni bir gerçek skor girildiğinde bütün yol, rakip ihtimalleri ve şampiyonluk yüzdesi otomatik yeniden hesaplanır. Sıçrama/risk değerleri modelin yaklaşık kaldıraç tahminidir.", "Whenever a new official score is recorded, the whole route, opponent probabilities and championship percentage are recalculated automatically. Upside/downside values are approximate model leverage estimates.")}</div>
    </div>`;
  }

  function buildLiveMatchPulse() {
    const active = getActiveLive();
    if (!active) return null;
    const { live, match } = active;
    const base = buildMatchOdds(match, oddsBuildContext());
    const probability = liveProbabilityModel(base, live);
    const momentum = liveMomentumLabel(live, match);
    const goals = [...(live.events || [])].filter(event=>event.type==="goal").sort((a,b)=>Number(a.minute)-Number(b.minute)||String(a.createdAt||"").localeCompare(String(b.createdAt||"")));
    let home = 0, away = 0, previousLeader = "draw", leadChanges = 0;
    const timeline = goals.map(event => {
      if (event.side === "home") home += 1;
      if (event.side === "away") away += 1;
      const leader = home === away ? "draw" : home > away ? "home" : "away";
      if (leader !== previousLeader && previousLeader !== "draw") leadChanges += 1;
      previousLeader = leader;
      const snapshot = { ...live, minute:Number(event.minute)||0, addedTime:Number(event.addedTime)||0, homeScore:home, awayScore:away };
      const probs = liveProbabilityModel(base, snapshot);
      return { minute:Number(event.minute)||0, home, away, probs, side:event.side };
    });
    const minute = Math.min(120, Math.max(0, Number(live.minute)||0));
    const scoreDiff = Math.abs((Number(live.homeScore)||0)-(Number(live.awayScore)||0));
    const totalGoals = (Number(live.homeScore)||0)+(Number(live.awayScore)||0);
    const recentGoals = goals.filter(event=>minute-(Number(event.minute)||0)<=15).length;
    const importance = matchImportance(match);
    const importanceScore = { standard:8, high:16, critical:24, legendary:30 }[importance.level] || 8;
    const chaos = Math.round(intelligenceClamp(totalGoals*7 + leadChanges*15 + (scoreDiff<=1?20:5) + recentGoals*8 + importanceScore*.45));
    const pressure = Math.round(intelligenceClamp(minute/90*35 + (scoreDiff<=1?28:10) + importanceScore + (minute>=80?12:0)));
    const pulse = Math.round(Math.min(152, 60 + chaos*.52 + pressure*.34));
    const expectedHome = oddsClamp((base.home.avgGoals + base.away.gaPerGame) / 2 + base.difference / 38, .5, 7.5);
    const expectedAway = oddsClamp((base.away.avgGoals + base.home.gaPerGame) / 2 - base.difference / 38, .5, 7.5);
    const homeAttack = expectedHome * (momentum.side === "home" ? 1.16 : momentum.side === "away" ? .91 : 1);
    const awayAttack = expectedAway * (momentum.side === "away" ? 1.16 : momentum.side === "home" ? .91 : 1);
    const nextGoalSide = homeAttack === awayAttack ? "draw" : homeAttack > awayAttack ? "home" : "away";
    const leaderSide = probability.home >= probability.away && probability.home >= probability.draw ? "home" : probability.away >= probability.home && probability.away >= probability.draw ? "away" : "draw";
    const trailingSide = Number(live.homeScore) < Number(live.awayScore) ? "home" : Number(live.awayScore) < Number(live.homeScore) ? "away" : "draw";
    const comebackProbability = trailingSide === "home" ? probability.home : trailingSide === "away" ? probability.away : Math.min(probability.home, probability.away);
    return { live, match, base, probability, momentum, timeline, leadChanges, chaos, pressure, pulse, nextGoalSide, leaderSide, trailingSide, comebackProbability, importance };
  }

  function renderLiveMatchPulseSection() {
    const data = buildLiveMatchPulse();
    if (!data) {
      const archive = Object.values(getLiveState().archive || {}).sort((a,b)=>String(b.finishedAt||"").localeCompare(String(a.finishedAt||""))).slice(0,4);
      return `<div class="intel-section-stack"><section class="pulse-hero idle"><div><div class="eyebrow">LIVE MATCH PULSE</div><h2>${intelligenceCopy("Canlı Maç Nabzı", "Live Match Pulse")}</h2><p>${intelligenceCopy("Canlı maç başladığında skor, dakika, gol akışı ve oyuncu gücünden maçın psikolojik ritmini gerçek zamanlı hesaplar.", "When a live match begins, it calculates the psychological rhythm of the match in real time from score, minute, goal flow and player strength.")}</p></div><div class="pulse-idle-orb"><span>—</span><small>OFF AIR</small></div></section><div class="info-box"><strong>${intelligenceCopy("Şu anda canlı maç yok.", "There is no live match right now.")}</strong> ${intelligenceCopy("Canlı Maç Merkezi'nden bir fikstür başlatıldığında bu ekran otomatik aktif olur.", "This screen activates automatically when a fixture is started from Live Match Centre.")}</div>${archive.length?`<section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Son Canlı Yayınlar", "Recent Live Broadcasts")}</h3></div></div><div class="live-archive-grid">${archive.map(renderLiveArchiveCard).join("")}</div></section>`:""}</div>`;
    }
    const { live, match } = data;
    const homeName = playerName(match.homeId), awayName = playerName(match.awayId);
    const controlName = data.leaderSide === "home" ? homeName : data.leaderSide === "away" ? awayName : intelligenceCopy("Denge", "Balanced");
    const nextGoalName = data.nextGoalSide === "home" ? homeName : data.nextGoalSide === "away" ? awayName : intelligenceCopy("Eşit", "Even");
    const timelineValues = data.timeline.length ? data.timeline.map(item=>item.probs.home*100) : [data.base.market.home.probability*100,data.probability.home*100];
    return `<div class="intel-section-stack">
      <section class="pulse-hero active"><div><div class="eyebrow"><span class="live-pulse-dot"></span> LIVE MATCH PULSE</div><h2>${escapeHTML(homeName)} <b>${live.homeScore}–${live.awayScore}</b> ${escapeHTML(awayName)}</h2><p>${escapeHTML(currentMatchStageLabel(match))} · ${liveMinuteText(live)} · ${escapeHTML(liveStatusText(live))}</p></div><div class="pulse-orb" style="--pulse-speed:${Math.max(.48,1.35-data.pulse/170).toFixed(2)}s;--pulse-level:${data.pulse}"><strong>${data.pulse}</strong><span>BPM</span><small>${intelligenceCopy("MAÇ NABZI", "MATCH PULSE")}</small></div></section>
      <section class="pulse-scoreboard"><div class="pulse-player home"><span>${escapeHTML(match.homeTeam||"")}</span><strong>${escapeHTML(homeName)}</strong><b>${simulationPct(data.probability.home,1)}</b><small>${intelligenceCopy("kazanma", "win")}</small></div><div class="pulse-centre"><span>${liveMinuteText(live)}</span><strong>${live.homeScore} – ${live.awayScore}</strong><small>${escapeHTML(data.momentum.label)}</small></div><div class="pulse-player away"><span>${escapeHTML(match.awayTeam||"")}</span><strong>${escapeHTML(awayName)}</strong><b>${simulationPct(data.probability.away,1)}</b><small>${intelligenceCopy("kazanma", "win")}</small></div></section>
      <div class="pulse-metric-grid"><article><span>${intelligenceCopy("Momentum", "Momentum")}</span><strong>${escapeHTML(data.momentum.label)}</strong><div><i style="width:${data.momentum.strength}%"></i></div></article><article><span>${intelligenceCopy("Maç Kontrolü", "Match Control")}</span><strong>${escapeHTML(controlName)}</strong><b>${simulationPct(Math.max(data.probability.home,data.probability.away,data.probability.draw),1)}</b></article><article><span>${intelligenceCopy("Baskı Seviyesi", "Pressure Level")}</span><strong>${data.pressure}/100</strong><div><i style="width:${data.pressure}%"></i></div></article><article><span>${intelligenceCopy("Kaos Endeksi", "Chaos Index")}</span><strong>${data.chaos}/100</strong><div><i style="width:${data.chaos}%"></i></div></article><article><span>${intelligenceCopy("Geri Dönüş İhtimali", "Comeback Probability")}</span><strong>${simulationPct(data.comebackProbability,1)}</strong><small>${data.trailingSide==="draw"?intelligenceCopy("Skor dengede", "Score is level"):escapeHTML(data.trailingSide==="home"?homeName:awayName)}</small></article><article><span>${intelligenceCopy("Sonraki Gol Sinyali", "Next Goal Signal")}</span><strong>${escapeHTML(nextGoalName)}</strong><small>${intelligenceCopy("Model tahmini", "Model estimate")}</small></article></div>
      <div class="grid-2"><section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Canlı Olasılık Akışı", "Live Probability Flow")}</h3><div class="panel-subtitle">${intelligenceCopy("Her gol sonrası ev sahibi kazanma ihtimalinin değişimi.", "Change in home win probability after each goal.")}</div></div><span class="badge badge-gold">${data.timeline.length} EVENTS</span></div><div class="pulse-flow-chart">${intelligenceSparkline(timelineValues,"pulse-flow")}</div><div class="pulse-probability-bar"><i class="home" style="width:${data.probability.home*100}%"></i><i class="draw" style="width:${data.probability.draw*100}%"></i><i class="away" style="width:${data.probability.away*100}%"></i></div><div class="pulse-probability-legend"><span>${escapeHTML(homeName)} ${simulationPct(data.probability.home,1)}</span><span>X ${simulationPct(data.probability.draw,1)}</span><span>${escapeHTML(awayName)} ${simulationPct(data.probability.away,1)}</span></div></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Nabız Yorumu", "Pulse Commentary")}</h3><div class="panel-subtitle">${intelligenceCopy("Skor, dakika ve olay ritminden üretilen anlık maç resmi.", "A live match picture generated from score, minute and event rhythm.")}</div></div><span class="badge badge-blue">LIVE AI</span></div><div class="pulse-commentary"><p>${data.chaos>=75?intelligenceCopy("Maç tam bir kaos bölgesinde; tek gol bütün olasılık haritasını değiştirebilir.","The match is in a full chaos zone; one goal can transform the entire probability map."):data.pressure>=75?intelligenceCopy("Baskı zirvede. Skor farkı dar ve zaman hızla tükeniyor.","Pressure is peaking. The margin is narrow and time is running out quickly."):data.momentum.side!=="draw"?`${escapeHTML(data.momentum.label)}. ${intelligenceCopy("Sonraki beş dakika kritik.","The next five minutes are critical.")}`:intelligenceCopy("Maç dengeli ilerliyor; kontrolü alacak ilk güçlü seri belirleyici olabilir.","The match remains balanced; the first strong sequence to seize control may be decisive.")}</p><div><span>${intelligenceCopy("Kritiklik", "Importance")}</span><strong>${escapeHTML(data.importance.label)}</strong></div><div><span>${intelligenceCopy("Liderlik Değişimi", "Lead Changes")}</span><strong>${data.leadChanges}</strong></div><div><span>${intelligenceCopy("Beraberlik", "Draw")}</span><strong>${simulationPct(data.probability.draw,1)}</strong></div></div></section></div>
    </div>`;
  }

  function directorImportanceScore(match) {
    const level = matchImportance(match).level;
    return { legendary:4, critical:3, high:2, standard:1 }[level] || 1;
  }

  function buildTournamentDirectorBriefing() {
    const lang = intelligenceLanguage();
    const elo = buildEloAnalytics();
    const form = buildFormAnalytics(20,"all");
    const simulation = buildTournamentSimulation();
    const odds = state.current.league.generated ? buildOddsAnalytics() : { fixtures:[] };
    const active = getActiveLive();
    const league = state.current.league.generated ? leagueStandings() : [];
    const recent = buildLiveTournamentAnalytics().recentMatches?.[0] || null;
    const next = [...(odds.fixtures || [])].sort((a,b)=>directorImportanceScore(findMatch(b.id))-directorImportanceScore(findMatch(a.id))||b.confidence-a.confidence)[0] || null;
    const seed = `${simulationFingerprint()}|${directorTone}|${directorNonce}|${lang}`;
    const rand = seededRandom(seed);
    const choose = list => list[Math.floor(rand()*list.length)] || list[0] || "";
    const leaderName = league[0] ? playerName(league[0].id) : elo.summary.leader?.name || "—";
    const titleFavourite = simulation?.favorite?.name || elo.summary.leader?.name || "—";
    const titlePct = simulation ? simulationPct(simulation.favorite?.championProbability,1) : "—";
    const mover = elo.summary.mover?.name || form.records.momentum?.name || "—";
    const nextLabel = next ? `${next.home.name} – ${next.away.name}` : intelligenceCopy("Fikstür bekleniyor", "Waiting for fixtures");
    const recentLine = recent ? `${recent.homeName} ${recent.match.homeScore}–${recent.match.awayScore} ${recent.awayName}` : intelligenceCopy("Henüz güncel sonuç yok", "No current result yet");

    const packs = {
      analyst: {
        title: lang === "en" ? choose(["The model has recalibrated", "Competitive balance update", "The numbers have moved"]) : choose(["Model yeniden kalibre oldu", "Rekabet dengesi güncellendi", "Rakamlar yeniden hareket etti"]),
        opening: lang === "en" ? `Current leader: ${leaderName}. The simulation lists ${titleFavourite} as title favourite at ${titlePct}.` : `Güncel lider ${leaderName}. Simülasyon, ${titleFavourite} için şampiyonluk ihtimalini ${titlePct} olarak hesaplıyor.`,
        verdict: lang === "en" ? `${nextLabel} is the most influential upcoming matchup in the current model.` : `${nextLabel}, mevcut modelde sıradaki en yüksek etkili karşılaşma.`
      },
      dramatic: {
        title: lang === "en" ? choose(["The road to the throne is changing", "A storm is building in FIFA 9", "The tournament has entered a new chapter"]) : choose(["Tahta giden yol değişiyor", "FIFA 9'da fırtına yaklaşıyor", "Turnuva yeni bir bölüme girdi"]),
        opening: lang === "en" ? `${leaderName} holds the line, but ${titleFavourite} owns the strongest championship signal at ${titlePct}.` : `${leaderName} liderlik çizgisini tutuyor; ancak en güçlü şampiyonluk sinyali ${titlePct} ile ${titleFavourite}'den geliyor.`,
        verdict: lang === "en" ? `All eyes now turn to ${nextLabel}. One result can rewrite the path.` : `Şimdi bütün gözler ${nextLabel} maçında. Tek bir sonuç bütün yolu yeniden yazabilir.`
      },
      ruthless: {
        title: lang === "en" ? choose(["No reputation survives the data", "The table does not care about excuses", "Only current power matters"]) : choose(["Veri karşısında ünvanların hükmü yok", "Puan tablosu mazeret dinlemez", "Yalnızca güncel güç önemlidir"]),
        opening: lang === "en" ? `${leaderName} leads. ${titleFavourite} remains the model favourite at ${titlePct}. Everyone else must prove the numbers wrong.` : `${leaderName} lider. Model favorisi ${titlePct} ile ${titleFavourite}. Geri kalan herkes rakamların yanıldığını sahada kanıtlamak zorunda.`,
        verdict: lang === "en" ? `${nextLabel} is not another fixture; it is a ranking test.` : `${nextLabel} sıradan bir fikstür değil; doğrudan bir güç testi.`
      },
      captain: {
        title: lang === "en" ? choose(["Matchday orders are ready", "Stay sharp, the route is open", "The next mission begins"]) : choose(["Maç günü emirleri hazır", "Hazır olun, rota açık", "Sıradaki görev başlıyor"]),
        opening: lang === "en" ? `Leader ${leaderName}; title favourite ${titleFavourite} at ${titlePct}. Focus remains on the next ninety minutes.` : `Lider ${leaderName}; şampiyonluk favorisi ${titlePct} ile ${titleFavourite}. Odak yalnızca sıradaki doksan dakikada.`,
        verdict: lang === "en" ? `Priority fixture: ${nextLabel}. Discipline first, result second.` : `Öncelikli maç: ${nextLabel}. Önce disiplin, sonra sonuç.`
      }
    };
    const voice = packs[directorTone] || packs.analyst;
    const alerts = [];
    if (active) alerts.push(lang === "en" ? `LIVE: ${playerName(active.match.homeId)} ${active.live.homeScore}–${active.live.awayScore} ${playerName(active.match.awayId)} at ${liveMinuteText(active.live)}.` : `CANLI: ${playerName(active.match.homeId)} ${active.live.homeScore}–${active.live.awayScore} ${playerName(active.match.awayId)} · ${liveMinuteText(active.live)}.`);
    if (elo.summary.mover) alerts.push(lang === "en" ? `${mover} is the fastest Elo riser over the latest five matches (${intelligenceSigned(elo.summary.mover.last5Change,0)}).` : `${mover}, son beş maçın en hızlı Elo yükseleni (${intelligenceSigned(elo.summary.mover.last5Change,0)}).`);
    if (form.records.unbeaten) alerts.push(lang === "en" ? `${form.records.unbeaten.name} owns the longest active unbeaten run: ${form.records.unbeaten.currentUnbeatenStreak} matches.` : `${form.records.unbeaten.name}, ${form.records.unbeaten.currentUnbeatenStreak} maçla en uzun aktif yenilmezlik serisine sahip.`);
    if (simulation?.surprise) alerts.push(lang === "en" ? `Dark-horse watch: ${simulation.surprise.name} reaches the final in ${simulationPct(simulation.surprise.finalProbability,1)} of simulations.` : `Sürpriz alarmı: ${simulation.surprise.name}, simülasyonların ${simulationPct(simulation.surprise.finalProbability,1)} bölümünde finale çıkıyor.`);
    alerts.push(lang === "en" ? `Latest official result: ${recentLine}.` : `Son resmî sonuç: ${recentLine}.`);
    return { ...voice, alerts, leaderName, titleFavourite, titlePct, mover, next, nextLabel, recentLine, tone:directorTone, generatedAt:new Date().toISOString() };
  }

  function directorToneLabel(tone) {
    const labels = {
      analyst:intelligenceCopy("Spor Analisti", "Sports Analyst"),
      dramatic:intelligenceCopy("Dramatik Spiker", "Dramatic Commentator"),
      ruthless:intelligenceCopy("Acımasız İstatistikçi", "Ruthless Statistician"),
      captain:intelligenceCopy("Turnuva Kaptanı", "Tournament Captain")
    };
    return labels[tone] || labels.analyst;
  }

  function renderTournamentDirectorSection() {
    const briefing = buildTournamentDirectorBriefing();
    const toneButtons = ["analyst","dramatic","ruthless","captain"];
    return `<div class="intel-section-stack">
      <section class="director-hero"><div><div class="eyebrow">AI TOURNAMENT DIRECTOR</div><h2>${intelligenceCopy("Turnuvanın Dijital Sesi", "The Digital Voice of the Tournament")}</h2><p>${intelligenceCopy("Sonuçları, Elo hareketlerini, canlı maçı ve simülasyonu okuyarak otomatik maç günü bülteni, uyarı ve gündem üretir.", "Reads results, Elo movement, the live match and simulation to generate an automatic matchday briefing, alerts and agenda.")}</p><div class="director-actions"><button class="btn btn-gold" data-action="refresh-director-briefing">${intelligenceCopy("Yeni Bülten Oluştur", "Generate New Briefing")}</button><button class="btn btn-ghost" data-action="share-director-briefing">${intelligenceCopy("WhatsApp'ta Paylaş", "Share on WhatsApp")}</button></div></div><div class="director-avatar"><span>AI</span><i>F9</i><b>DIRECTOR</b></div></section>
      <section class="panel director-console"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Direktör Sesi", "Director Voice")}</h3><div class="panel-subtitle">${intelligenceCopy("Aynı veriyi farklı anlatım karakterleriyle sunar.", "Presents the same data through different narrative personalities.")}</div></div><span class="badge badge-gold">${escapeHTML(directorToneLabel(directorTone))}</span></div><div class="director-tone-tabs">${toneButtons.map(tone=>`<button class="${tone===directorTone?"active":""}" data-action="set-director-tone" data-director-tone="${tone}">${escapeHTML(directorToneLabel(tone))}</button>`).join("")}</div></section>
      <section class="director-briefing"><header><span>${intelligenceCopy("GÜNLÜK DİREKTÖR BÜLTENİ", "DAILY DIRECTOR BRIEFING")}</span><small>${new Date(briefing.generatedAt).toLocaleString(intelligenceLanguage()==="en"?"en-GB":"tr-TR",{dateStyle:"medium",timeStyle:"short"})}</small></header><h3>${escapeHTML(briefing.title)}</h3><p class="director-opening">${escapeHTML(briefing.opening)}</p><div class="director-alert-feed">${briefing.alerts.map((item,index)=>`<div><span>${String(index+1).padStart(2,"0")}</span><p>${escapeHTML(item)}</p></div>`).join("")}</div><blockquote>${escapeHTML(briefing.verdict)}</blockquote><footer><span>AI TOURNAMENT DIRECTOR</span><strong>${escapeHTML(directorToneLabel(directorTone))}</strong></footer></section>
      <div class="grid-2"><section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Bugünün Kontrol Paneli", "Today's Control Panel")}</h3></div><span class="badge badge-blue">AUTO BRIEF</span></div><div class="director-control-grid"><div><span>${intelligenceCopy("Güncel Lider", "Current Leader")}</span><strong>${escapeHTML(briefing.leaderName)}</strong></div><div><span>${intelligenceCopy("Şampiyonluk Favorisi", "Title Favourite")}</span><strong>${escapeHTML(briefing.titleFavourite)} · ${briefing.titlePct}</strong></div><div><span>${intelligenceCopy("Elo Yükseleni", "Elo Riser")}</span><strong>${escapeHTML(briefing.mover)}</strong></div><div><span>${intelligenceCopy("Öncelikli Maç", "Priority Match")}</span><strong>${escapeHTML(briefing.nextLabel)}</strong></div></div></section><section class="panel"><div class="panel-header"><div><h3 class="panel-title">${intelligenceCopy("Direktör Protokolü", "Director Protocol")}</h3></div></div><div class="format-list"><div class="format-row"><div class="format-icon">1</div><div><div class="format-title">${intelligenceCopy("Gerçek sonuçları oku", "Read official results")}</div><div class="format-desc">${intelligenceCopy("Puan tablosu, Elo ve form değişimini tarar.", "Scans standings, Elo and form movement.")}</div></div></div><div class="format-row"><div class="format-icon">2</div><div><div class="format-title">${intelligenceCopy("Kritik gelişmeyi seç", "Select critical development")}</div><div class="format-desc">${intelligenceCopy("Canlı maç, seri, simülasyon ve sürpriz sinyallerini önceliklendirir.", "Prioritises live matches, streaks, simulation and upset signals.")}</div></div></div><div class="format-row"><div class="format-icon">3</div><div><div class="format-title">${intelligenceCopy("Bülteni yeniden yaz", "Rewrite the briefing")}</div><div class="format-desc">${intelligenceCopy("Seçilen anlatım karakterine göre dinamik metin üretir.", "Generates dynamic copy in the selected narrative voice.")}</div></div></div></div></section></div>
      <div class="info-box"><strong>${intelligenceCopy("Şeffaflık:", "Transparency:")}</strong> ${intelligenceCopy("Direktör metinleri sitenin kayıtlı verilerinden çalışan kurallı bir anlatım motoruyla üretilir; dışarıya veri göndermez ve kesin sonuç iddiasında bulunmaz.", "Director copy is generated by a rules-based narrative engine using data stored on the site; it sends no data externally and makes no claim of certainty.")}</div>
    </div>`;
  }

  async function shareDirectorBriefing() {
    const briefing = buildTournamentDirectorBriefing();
    const lines = [
      `🧠 FIFA 9 · AI TOURNAMENT DIRECTOR`,
      `*${briefing.title}*`,
      briefing.opening,
      ...briefing.alerts.slice(0,4).map(item=>`• ${item}`),
      `🎯 ${briefing.verdict}`,
      window.location.href
    ];
    const text = lines.join("\n");
    if (navigator.share) {
      try { await navigator.share({ title:"FIFA 9 Director Briefing", text, url:window.location.href }); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,"_blank","noopener,noreferrer");
  }

  function renderIntelligenceCentre() {
    const sections = [
      ["matchday", "Matchday", "◈"], ["elo", "Elo", "↗"], ["exchange", "Power Exchange", "⌁"],
      ["pressure", intelligenceCopy("Baskı", "Pressure"), "◆"], ["destiny", intelligenceCopy("Kader Yolu", "Destiny Path"), "◇"],
      ["pulse", intelligenceCopy("Live Pulse", "Live Pulse"), "♥"], ["director", "AI Director", "AI"],
      ["rivalry", "Rivalry DNA", "∞"], ["predictions", intelligenceCopy("Tahmin Ligi", "Prediction League"), "1X2"],
      ["achievements", intelligenceCopy("Rozetler", "Achievements"), "♛"], ["simulator", intelligenceCopy("Simülatör", "Simulator"), "◌"],
      ["cards", intelligenceCopy("Oyuncu Kartları", "Player Cards"), "▣"]
    ];
    const renderers = {
      matchday:renderMatchdaySection,
      elo:renderEloSection,
      exchange:renderPowerExchangeSection,
      pressure:renderPressureChamberSection,
      destiny:renderDestinyPathSection,
      pulse:renderLiveMatchPulseSection,
      director:renderTournamentDirectorSection,
      rivalry:renderRivalrySection,
      predictions:renderPredictionSection,
      achievements:renderAchievementsSection,
      simulator:renderSimulatorSection,
      cards:renderPlayerCardSection
    };
    if (!renderers[intelligenceSection]) intelligenceSection = "matchday";
    view.innerHTML = `<div class="group-banner intelligence-banner"><div><div class="eyebrow">FIFA 9 · LIVING INTELLIGENCE v19</div><h2>${intelligenceCopy("Turnuva Zekâ Merkezi", "Tournament Intelligence Centre")}</h2><p>${intelligenceCopy("Power Exchange, mental baskı analizi, kişisel kader yolları, canlı maç nabzı ve AI Tournament Director ile turnuva artık yalnızca izlenmez; yaşayan bir veri evreni olarak yorumlanır.", "With Power Exchange, pressure analytics, personal destiny paths, Live Match Pulse and the AI Tournament Director, the tournament is no longer merely followed; it is interpreted as a living data universe.")}</p></div><div class="intelligence-orbit v19"><span>AI</span><i>LIVE</i><b>F9PX</b></div></div>
      <nav class="intel-tabs intel-tabs-v19" aria-label="Intelligence modules">${sections.map(([key,label,icon])=>`<button class="${intelligenceSection===key?"active":""}" data-action="set-intelligence-section" data-intelligence-section="${key}"><span>${icon}</span><strong>${escapeHTML(label)}</strong></button>`).join("")}</nav>
      ${renderers[intelligenceSection]()}`;
  }

  function renderTeamStatistics() {
    const analytics = buildTeamAnalytics();
    if (!analytics.teams.length) {
      view.innerHTML = emptyState("◉", "Takım Verisi Hazır Değil", "Maç sonuçlarında takım adları kaydedildiğinde takım istatistikleri burada otomatik oluşacak.");
      return;
    }
    ensureTeamSelections(analytics);
    const selectedTeam = analytics.teamMap.get(selectedTeamStatName) || analytics.teams[0];
    const selectedPlayer = analytics.playerMap.get(selectedTeamPlayerName) || analytics.players[0];
    const maxSelections = Math.max(...analytics.teams.map(row => row.games), 1);

    view.innerHTML = `
      <div class="group-banner team-banner">
        <div><div class="eyebrow">CLUB INTELLIGENCE</div><h2>Takım İstatistikleri Merkezi</h2><p>Hangi takımın kaç kez seçildiği, takım bazlı puan durumu ve her oyuncunun kullandığı takımlardaki performansı. FIFA 1–8 arşivi ile FIFA 9 canlı sonuçları birlikte hesaplanır.</p></div>
        <div class="group-emblem">◉</div>
      </div>

      <div class="kpi-grid">
        ${kpiCard("En Çok Seçilen Takım", analytics.records.mostSelected?.name || "–", analytics.records.mostSelected ? `${analytics.records.mostSelected.games} seçim · ${analytics.records.mostSelected.playersCount} oyuncu` : "Takım verisi bekleniyor")}
        ${kpiCard("Takım Puan Lideri", analytics.records.pointsLeader?.name || "–", analytics.records.pointsLeader ? `${analytics.records.pointsLeader.points} puan · ${analytics.records.pointsLeader.wins} galibiyet` : "Takım verisi bekleniyor")}
        ${kpiCard("En İyi Takım PPG", analytics.records.ppgLeader?.name || "–", analytics.records.ppgLeader ? `${analytics.records.ppgLeader.ppg.toFixed(2)} PPG · minimum 10 seçim` : "Takım verisi bekleniyor")}
        ${kpiCard("En Çok Gol Atan Takım", analytics.records.goalLeader?.name || "–", analytics.records.goalLeader ? `${analytics.records.goalLeader.gf} gol · maç başı ${analytics.records.goalLeader.goalsPerGame.toFixed(2)}` : "Takım verisi bekleniyor")}
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">En Çok Tercih Edilen Takımlar</h3><div class="panel-subtitle">Takım seçimi bir maçtaki her oyuncu tarafı için bir kullanım olarak sayılır. Yazım varyasyonları standardize edilmiştir.</div></div><span class="badge badge-blue">${analytics.summary.teamAppearances} TAKIM SEÇİMİ</span></div>
        <div class="team-card-grid">${analytics.teams.slice(0, 16).map((team, index) => renderTeamCard(team, index, maxSelections)).join("")}</div>
      </section>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Takım Bazlı Puan Durumu</h3><div class="panel-subtitle">Bütün oyuncuların aynı takımla aldığı sonuçlar birleştirilir: galibiyet 3, beraberlik 1 puan.</div></div><span class="badge badge-gold">${analytics.teams.length} TAKIM</span></div>
          ${teamStandingsTable(analytics.teams)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Takım Güç Endeksi</h3><div class="panel-subtitle">Seçim sayısı, puan ve maç başı performans dengesi.</div></div></div>
          <div class="team-power-list">${analytics.teams.slice(0, 12).map(team => `
            <button class="team-power-row" data-action="select-team-stat" data-team-name="${escapeHTML(team.name)}">
              <span class="team-power-rank">#${team.rank}</span>
              <span class="team-power-name">${escapeHTML(team.name)}</span>
              <span class="team-power-track"><i style="width:${team.games / maxSelections * 100}%"></i></span>
              <span class="team-power-number">${team.games}</span>
              <span class="team-power-ppg">${team.ppg.toFixed(2)} PPG</span>
            </button>`).join("")}</div>
          <div class="mini-stats-grid mt-24">
            <div class="mini-stat"><span>En İyi Galibiyet Oranı</span><strong>${escapeHTML(analytics.records.winRateLeader?.name || "–")}</strong><small>${analytics.records.winRateLeader ? `${analytics.records.winRateLeader.winRate.toFixed(1)}% · minimum 10 seçim` : "–"}</small></div>
            <div class="mini-stat"><span>En İyi Averaj</span><strong>${escapeHTML(analytics.records.gdLeader?.name || "–")}</strong><small>${analytics.records.gdLeader ? `${formatGD(analytics.records.gdLeader.gd)} toplam averaj` : "–"}</small></div>
            <div class="mini-stat"><span>En Sağlam Savunma</span><strong>${escapeHTML(analytics.records.defenseLeader?.name || "–")}</strong><small>${analytics.records.defenseLeader ? `Maç başı ${analytics.records.defenseLeader.gaPerGame.toFixed(2)} gol` : "–"}</small></div>
            <div class="mini-stat"><span>En Geniş Oyuncu Kitlesi</span><strong>${escapeHTML(analytics.records.playerReachLeader?.name || "–")}</strong><small>${analytics.records.playerReachLeader ? `${analytics.records.playerReachLeader.playersCount} farklı oyuncu` : "–"}</small></div>
          </div>
        </section>
      </div>

      <div class="grid-2 mt-24">
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Takım Derin Analizi</h3><div class="panel-subtitle">Seçilen takımın toplam karnesi ve oyunculara göre katkı dağılımı.</div></div></div>
          <div class="explorer-toolbar"><label class="field inline-field"><span>Takım Seç</span><select id="teamStatisticsSelect">${analytics.teams.map(team => `<option value="${escapeHTML(team.name)}" ${team.name === selectedTeam.name ? "selected" : ""}>${escapeHTML(team.name)}</option>`).join("")}</select></label></div>
          ${renderSelectedTeamPanel(selectedTeam)}
        </section>
        <section class="panel">
          <div class="panel-header"><div><h3 class="panel-title">Oyuncu–Takım Performansı</h3><div class="panel-subtitle">Bir oyuncunun hangi takımlarla oynadığını ve her takımla elde ettiği sonuçları incele.</div></div></div>
          <div class="explorer-toolbar"><label class="field inline-field"><span>Oyuncu Seç</span><select id="teamPlayerSelect">${analytics.players.map(player => `<option value="${escapeHTML(player.name)}" ${player.name === selectedPlayer.name ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></label></div>
          ${renderPlayerTeamPanel(selectedPlayer)}
        </section>
      </div>

      <section class="panel mt-24">
        <div class="panel-header"><div><h3 class="panel-title">Oyuncuların Takım Tercihleri</h3><div class="panel-subtitle">Her oyuncunun en çok kullandığı takım ve en verimli takım tercihi.</div></div><span class="badge badge-silver">${analytics.players.length} OYUNCU</span></div>
        ${playerTeamSummaryTable(analytics.players)}
      </section>`;
  }

  function ensureTeamSelections(analytics) {
    const firstTeam = analytics.teams[0]?.name || "";
    const firstPlayer = analytics.players[0]?.name || "";
    if (!selectedTeamStatName || !analytics.teamMap.has(selectedTeamStatName)) selectedTeamStatName = firstTeam;
    if (!selectedTeamPlayerName || !analytics.playerMap.has(selectedTeamPlayerName)) selectedTeamPlayerName = firstPlayer;
  }

  function renderTeamCard(team, index, maxSelections) {
    return `<article class="team-stat-card ${team.name === selectedTeamStatName ? "active" : ""}" data-action="select-team-stat" data-team-name="${escapeHTML(team.name)}">
      <div class="team-card-top"><div><div class="team-card-rank">#${index + 1} · ${team.games} SEÇİM</div><div class="team-card-name">${escapeHTML(team.name)}</div></div><div class="team-card-mark">${String(team.name).slice(0, 2).toUpperCase()}</div></div>
      <div class="team-card-progress"><i style="width:${team.games / maxSelections * 100}%"></i></div>
      <div class="team-card-stats"><div><span>Puan</span><strong>${team.points}</strong></div><div><span>PPG</span><strong>${team.ppg.toFixed(2)}</strong></div><div><span>G%</span><strong>${team.winRate.toFixed(1)}%</strong></div><div><span>AV</span><strong>${formatGD(team.gd)}</strong></div></div>
      <div class="team-card-footer">${team.playersCount} oyuncu · ${team.editionsPlayed} turnuva · ${team.gf} gol</div>
    </article>`;
  }

  function teamStandingsTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="player-col">Takım</th><th>Seçim</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>G%</th><th>Oyuncu</th></tr></thead><tbody>${rows.map(team => `<tr data-action="select-team-stat" data-team-name="${escapeHTML(team.name)}"><td>${team.rank}</td><td class="player-col"><span class="player-name">${escapeHTML(team.name)}</span></td><td>${team.games}</td><td>${team.wins}</td><td>${team.draws}</td><td>${team.losses}</td><td>${team.gf}</td><td>${team.ga}</td><td class="${team.gd > 0 ? "gd-positive" : team.gd < 0 ? "gd-negative" : ""}">${formatGD(team.gd)}</td><td class="points-cell">${team.points}</td><td>${team.ppg.toFixed(2)}</td><td>${team.winRate.toFixed(1)}%</td><td>${team.playersCount}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderSelectedTeamPanel(team) {
    const contributors = team.contributors || [];
    return `<div class="selected-team-shell">
      <div class="selected-team-hero">
        <div class="selected-team-logo">${String(team.name).slice(0, 2).toUpperCase()}</div>
        <div><div class="eyebrow">TEAM PROFILE · #${team.rank}</div><h3>${escapeHTML(team.name)}</h3><p>${team.games} seçim · ${team.playersCount} farklı oyuncu · ${team.editionsPlayed} turnuva</p></div>
      </div>
      <div class="selected-player-kpis mt-16">
        <div><span>Galibiyet</span><strong>${team.wins}</strong></div><div><span>Beraberlik</span><strong>${team.draws}</strong></div><div><span>Mağlubiyet</span><strong>${team.losses}</strong></div><div><span>Puan</span><strong>${team.points}</strong></div>
        <div><span>Atılan Gol</span><strong>${team.gf}</strong></div><div><span>Yenilen Gol</span><strong>${team.ga}</strong></div><div><span>Averaj</span><strong>${formatGD(team.gd)}</strong></div><div><span>PPG</span><strong>${team.ppg.toFixed(2)}</strong></div>
        <div><span>Galibiyet %</span><strong>${team.winRate.toFixed(1)}%</strong></div><div><span>Gol / Maç</span><strong>${team.goalsPerGame.toFixed(2)}</strong></div><div><span>Yenilen / Maç</span><strong>${team.gaPerGame.toFixed(2)}</strong></div><div><span>Clean Sheet</span><strong>${team.cleanSheets}</strong></div>
      </div>
      <div class="selected-player-insights mt-16">
        <div class="insight-pill"><span>En Çok Kullanan</span><strong>${team.mostFrequentPlayer ? `${escapeHTML(team.mostFrequentPlayer.name)} · ${team.mostFrequentPlayer.games} maç` : "–"}</strong></div>
        <div class="insight-pill"><span>En Çok Puan Kazandıran</span><strong>${team.topPointsPlayer ? `${escapeHTML(team.topPointsPlayer.name)} · ${team.topPointsPlayer.points} puan` : "–"}</strong></div>
        <div class="insight-pill"><span>En Verimli Oyuncu</span><strong>${team.bestPPGPlayer ? `${escapeHTML(team.bestPPGPlayer.name)} · ${team.bestPPGPlayer.ppg.toFixed(2)} PPG` : "–"}</strong></div>
        <div class="insight-pill"><span>En Farklı Galibiyet</span><strong>${team.biggestWin ? `${team.biggestWin.score} · ${escapeHTML(team.biggestWin.player)}` : "–"}</strong></div>
      </div>
      <div class="panel-subtitle" style="margin:18px 0 12px">Oyuncu Katkısı</div>
      ${contributors.length ? `<div class="table-wrap compact-table"><table><thead><tr><th>Oyuncu</th><th>Maç</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>G%</th></tr></thead><tbody>${contributors.map(row => `<tr><td class="player-col"><span class="player-name">${escapeHTML(row.name)}</span></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td>${row.points}</td><td>${row.ppg.toFixed(2)}</td><td>${row.winRate.toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>` : `<div class="info-box">Oyuncu katkı verisi bulunmuyor.</div>`}
    </div>`;
  }

  function renderPlayerTeamPanel(player) {
    const rows = player.teams || [];
    return `<div class="player-team-shell">
      <div class="selected-player-main"><div class="selected-player-rank">${player.uniqueTeams}</div><div><h3>${escapeHTML(player.name)}</h3><p>${player.totalAppearances} takım seçimi · ${player.uniqueTeams} farklı takım</p></div></div>
      <div class="selected-player-insights mt-16">
        <div class="insight-pill"><span>En Çok Kullandığı Takım</span><strong>${player.mostUsed ? `${escapeHTML(player.mostUsed.team)} · ${player.mostUsed.games} maç` : "–"}</strong></div>
        <div class="insight-pill"><span>En Verimli Takımı</span><strong>${player.bestTeam ? `${escapeHTML(player.bestTeam.team)} · ${player.bestTeam.ppg.toFixed(2)} PPG` : "–"}</strong></div>
        <div class="insight-pill"><span>En Çok Galibiyet Aldığı</span><strong>${player.mostWinsTeam ? `${escapeHTML(player.mostWinsTeam.team)} · ${player.mostWinsTeam.wins} galibiyet` : "–"}</strong></div>
        <div class="insight-pill"><span>En Çok Gol Attığı</span><strong>${player.topScoringTeam ? `${escapeHTML(player.topScoringTeam.team)} · ${player.topScoringTeam.gf} gol` : "–"}</strong></div>
      </div>
      <div class="panel-subtitle" style="margin:18px 0 12px">Takım Bazlı Kariyer Karnesi</div>
      ${rows.length ? `<div class="table-wrap compact-table"><table><thead><tr><th>Takım</th><th>Maç</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>G%</th></tr></thead><tbody>${rows.map(row => `<tr data-action="select-team-stat" data-team-name="${escapeHTML(row.team)}"><td class="player-col"><span class="player-name">${escapeHTML(row.team)}</span></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td>${row.points}</td><td>${row.ppg.toFixed(2)}</td><td>${row.winRate.toFixed(1)}%</td></tr>`).join("")}</tbody></table></div>` : `<div class="info-box">Bu oyuncu için takım verisi bulunmuyor.</div>`}
    </div>`;
  }

  function playerTeamSummaryTable(players) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="player-col">Oyuncu</th><th>Takım Seçimi</th><th>Farklı Takım</th><th>En Çok Kullandığı</th><th>Maç</th><th>En Verimli Takımı</th><th>PPG</th><th>G%</th></tr></thead><tbody>${players.map((player, index) => `<tr><td>${index + 1}</td><td class="player-col"><span class="player-name">${escapeHTML(player.name)}</span></td><td>${player.totalAppearances}</td><td>${player.uniqueTeams}</td><td>${escapeHTML(player.mostUsed?.team || "–")}</td><td>${player.mostUsed?.games || 0}</td><td>${escapeHTML(player.bestTeam?.team || "–")}</td><td>${player.bestTeam ? player.bestTeam.ppg.toFixed(2) : "–"}</td><td>${player.bestTeam ? `${player.bestTeam.winRate.toFixed(1)}%` : "–"}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function normalizeTeamName(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const key = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
    if (["noteam", "takimsecilmedi", "teamnotselected", "tbd", "none"].includes(key)) return "";
    const aliases = {
      bdortmund: "Borussia Dortmund", dortmund: "Borussia Dortmund",
      intermilan: "Inter Milan", ntermilan: "Inter Milan",
      rbleipzip: "RB Leipzig", rbleipzig: "RB Leipzig",
      abilbao: "Athletic Bilbao", athleticbilbao: "Athletic Bilbao",
      amadrid: "Atlético Madrid", atleticomadrid: "Atlético Madrid",
      alhilal: "Al Hilal", alnassr: "Al Nassr", alahli: "Al Ahli",
      alittahad: "Al-Ittihad", alittihad: "Al-Ittihad",
      villereal: "Villarreal", villarreal: "Villarreal",
      rsociedad: "Real Sociedad", realsociedad: "Real Sociedad", realsocidead: "Real Sociedad",
      nottforest: "Nottingham Forest", nottinghamforest: "Nottingham Forest",
      brigton: "Brighton", brighton: "Brighton",
      frankurt: "Eintracht Frankfurt", eintrachtfrankfurt: "Eintracht Frankfurt",
      milan: "AC Milan", acmilan: "AC Milan",
      bmg: "Borussia Mönchengladbach", borussiamonchengladbach: "Borussia Mönchengladbach",
      olyon: "Olympique Lyon", olympiquelyon: "Olympique Lyon",
      brasil: "Brazil", brazil: "Brazil",
      island: "Iceland", iceland: "Iceland",
      mancity: "Manchester City", manchestercity: "Manchester City",
      manunited: "Manchester United", manchesterunited: "Manchester United",
      bayernmunih: "Bayern Munich", bayernmunich: "Bayern Munich",
      galatasaray: "Galatasaray", fenerbahce: "Fenerbahçe", besiktas: "Beşiktaş",
      psg: "Paris Saint-Germain", parissaintgermain: "Paris Saint-Germain"
    };
    return aliases[key] || raw.replace(/\s+/g, " ");
  }

  function buildTeamAnalytics() {
    const matches = buildUnifiedAllTimeMatches();
    const teamMapRaw = new Map();
    const playerTeamMap = new Map();

    function ensureTeam(name) {
      if (!teamMapRaw.has(name)) teamMapRaw.set(name, { name, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, cleanSheets: 0, players: new Set(), editions: new Set(), biggestWin: null });
      return teamMapRaw.get(name);
    }

    function ensurePlayerTeam(player, team) {
      const key = `${player}||${team}`;
      if (!playerTeamMap.has(key)) playerTeamMap.set(key, { player, team, games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, points: 0, cleanSheets: 0, editions: new Set() });
      return playerTeamMap.get(key);
    }

    for (const match of matches) {
      const sides = [
        { player: match.homeName, team: normalizeTeamName(match.homeTeam), gf: match.homeScore, ga: match.awayScore, isHome: true },
        { player: match.awayName, team: normalizeTeamName(match.awayTeam), gf: match.awayScore, ga: match.homeScore, isHome: false }
      ];
      for (const side of sides) {
        if (!side.team || !side.player || /^P\d+$/i.test(side.player)) continue;
        const team = ensureTeam(side.team);
        const playerTeam = ensurePlayerTeam(side.player, side.team);
        const rows = [team, playerTeam];
        rows.forEach(row => { row.games += 1; row.gf += side.gf; row.ga += side.ga; row.editions.add(match.edition); if (side.ga === 0) row.cleanSheets += 1; });
        team.players.add(side.player);

        let sideWon = false;
        let sideLost = false;
        if (side.gf > side.ga) sideWon = true;
        else if (side.gf < side.ga) sideLost = true;
        else if (!match.allowDraw && match.winnerName) {
          sideWon = match.winnerName === side.player;
          sideLost = !sideWon;
        }
        if (sideWon) {
          rows.forEach(row => { row.wins += 1; row.points += 3; });
          const margin = side.gf - side.ga;
          if (!team.biggestWin || margin > team.biggestWin.margin || (margin === team.biggestWin.margin && side.gf > team.biggestWin.gf)) {
            team.biggestWin = { player: side.player, score: `${side.gf}-${side.ga}`, margin, gf: side.gf, opponent: side.isHome ? match.awayName : match.homeName, editionLabel: match.editionLabel };
          }
        } else if (sideLost) rows.forEach(row => { row.losses += 1; });
        else rows.forEach(row => { row.draws += 1; row.points += 1; });
      }
    }

    for (const row of playerTeamMap.values()) {
      row.gd = row.gf - row.ga;
      row.ppg = row.games ? row.points / row.games : 0;
      row.winRate = row.games ? row.wins / row.games * 100 : 0;
    }

    const teams = [...teamMapRaw.values()].map(team => {
      const contributors = [...playerTeamMap.values()].filter(row => row.team === team.name).map(row => ({ name: row.player, games: row.games, wins: row.wins, draws: row.draws, losses: row.losses, gf: row.gf, ga: row.ga, gd: row.gd, points: row.points, ppg: row.ppg, winRate: row.winRate })).sort((a, b) => b.games - a.games || b.points - a.points || b.gd - a.gd || a.name.localeCompare(b.name, "tr"));
      team.gd = team.gf - team.ga;
      team.ppg = team.games ? team.points / team.games : 0;
      team.winRate = team.games ? team.wins / team.games * 100 : 0;
      team.goalsPerGame = team.games ? team.gf / team.games : 0;
      team.gaPerGame = team.games ? team.ga / team.games : 0;
      team.playersCount = team.players.size;
      team.editionsPlayed = team.editions.size;
      team.contributors = contributors;
      team.mostFrequentPlayer = contributors[0] || null;
      team.topPointsPlayer = [...contributors].sort((a, b) => b.points - a.points || b.games - a.games || a.name.localeCompare(b.name, "tr"))[0] || null;
      const eligible = contributors.filter(row => row.games >= 3);
      team.bestPPGPlayer = [...(eligible.length ? eligible : contributors)].sort((a, b) => b.ppg - a.ppg || b.games - a.games || a.name.localeCompare(b.name, "tr"))[0] || null;
      return team;
    }).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || b.games - a.games || a.name.localeCompare(b.name, "tr"))
      .map((team, index) => ({ ...team, rank: index + 1 }));

    const playerNames = [...new Set([...playerTeamMap.values()].map(row => row.player))];
    const players = playerNames.map(name => {
      const rows = [...playerTeamMap.values()].filter(row => row.player === name).map(row => ({ team: row.team, games: row.games, wins: row.wins, draws: row.draws, losses: row.losses, gf: row.gf, ga: row.ga, gd: row.gd, points: row.points, ppg: row.ppg, winRate: row.winRate, cleanSheets: row.cleanSheets, editionsPlayed: row.editions.size })).sort((a, b) => b.games - a.games || b.points - a.points || b.gd - a.gd || a.team.localeCompare(b.team, "tr"));
      const eligible = rows.filter(row => row.games >= 3);
      return {
        name,
        teams: rows,
        totalAppearances: rows.reduce((sum, row) => sum + row.games, 0),
        uniqueTeams: rows.length,
        mostUsed: rows[0] || null,
        bestTeam: [...(eligible.length ? eligible : rows)].sort((a, b) => b.ppg - a.ppg || b.games - a.games || b.gd - a.gd || a.team.localeCompare(b.team, "tr"))[0] || null,
        mostWinsTeam: [...rows].sort((a, b) => b.wins - a.wins || b.games - a.games || a.team.localeCompare(b.team, "tr"))[0] || null,
        topScoringTeam: [...rows].sort((a, b) => b.gf - a.gf || b.games - a.games || a.team.localeCompare(b.team, "tr"))[0] || null
      };
    }).sort((a, b) => b.totalAppearances - a.totalAppearances || a.name.localeCompare(b.name, "tr"));

    const maxBy = (rows, selector, filter = () => true) => {
      const eligible = rows.filter(filter);
      return eligible.length ? [...eligible].sort((a, b) => selector(b) - selector(a) || b.games - a.games || a.name.localeCompare(b.name, "tr"))[0] : null;
    };
    const records = {
      mostSelected: maxBy(teams, row => row.games),
      pointsLeader: maxBy(teams, row => row.points),
      ppgLeader: maxBy(teams, row => row.ppg, row => row.games >= 10),
      goalLeader: maxBy(teams, row => row.gf),
      winRateLeader: maxBy(teams, row => row.winRate, row => row.games >= 10),
      gdLeader: maxBy(teams, row => row.gd),
      playerReachLeader: maxBy(teams, row => row.playersCount),
      defenseLeader: teams.filter(row => row.games >= 10).sort((a, b) => a.gaPerGame - b.gaPerGame || b.games - a.games || a.name.localeCompare(b.name, "tr"))[0] || null
    };

    return {
      teams,
      teamMap: new Map(teams.map(row => [row.name, row])),
      players,
      playerMap: new Map(players.map(row => [row.name, row])),
      records,
      summary: {
        teamAppearances: teams.reduce((sum, row) => sum + row.games, 0),
        teams: teams.length,
        players: players.length
      }
    };
  }

  function renderBackup() {
    const remoteMode = cloudConfigured;
    view.innerHTML = `
      <div class="group-banner silver">
        <div><div class="eyebrow">DATA CONTROL</div><h2>Canlı Veri ve Yedekleme</h2><p>Turnuva verisi ${remoteMode ? "Supabase üzerinden tüm cihazlarda ortak tutulur ve anlık güncellenir." : "şimdilik bu tarayıcıda saklanır; canlı kullanım için bulut kurulumu gerekir."}</p></div>
        <div class="group-emblem">⇩</div>
      </div>
      <div class="info-box ${remoteMode ? "success-box" : "warning-box"}">${remoteMode ? `<strong>${cloudStatusLabel()}</strong> · WhatsApp grubundaki herkes aynı fikstürü, sonuçları ve tabloları görür. ${cloudAdmin ? "Yönetici hesabınla değişiklik yapabilirsin." : "Bu cihaz salt okunur izleyici modundadır."}` : `Bulut bağlantısı henüz yapılandırılmadı. <button class="inline-action" data-action="open-cloud-help">Kurulum adımlarını aç</button>`}</div>
      <h3 class="section-title">Yedekleme İşlemleri</h3>
      <div class="data-actions">
        <div class="action-card"><h3>FIFA 9 JSON Yedeği</h3><p>Oyuncular, fikstürler, tüm skorlar ve eleme serileri tek dosyada.</p><button class="btn btn-gold btn-wide" data-action="export-json">Yedeği İndir</button></div>
        ${canEdit() ? `<div class="action-card"><h3>Yedeği Geri Yükle</h3><p>Bir JSON dosyasını yükle ve canlı veritabanına aktar.</p><label class="btn btn-blue btn-wide" for="importFile">JSON Dosyası Seç</label><input class="file-input" id="importFile" type="file" accept="application/json,.json"></div>` : ""}
        <div class="action-card"><h3>Maçları CSV Olarak Al</h3><p>FIFA 9’daki girilmiş tüm maçları Excel’e uygun tablo biçiminde indir.</p><button class="btn btn-ghost btn-wide" data-action="export-csv">CSV İndir</button></div>
        <div class="action-card"><h3>Oyuncu Listesi</h3><p>Mevcut 16 oyuncuyu sade metin dosyası olarak dışa aktar.</p><button class="btn btn-ghost btn-wide" data-action="export-players">Oyuncuları İndir</button></div>
        ${canEdit() ? `<div class="action-card"><h3>FIFA 9 Verisini Sıfırla</h3><p>Geçmiş FIFA 1–8 arşivine dokunmadan yalnızca güncel turnuvayı siler.</p><button class="btn btn-danger btn-wide" data-action="confirm-reset">Güncel Turnuvayı Sıfırla</button></div>` : ""}
        <div class="action-card"><h3>Kaynak Arşiv</h3><p>FIFA 1–8 verileri “All Time Tournament Results.xlsx” dosyasından siteye işlendi.</p><button class="btn btn-ghost btn-wide" data-nav="archive">Arşivi Görüntüle</button></div>
      </div>
      <section class="panel mt-24"><div class="panel-header"><div><h3 class="panel-title">Teknik Durum</h3><div class="panel-subtitle">Canlı site bağlantısı ve erişim modeli.</div></div></div><div class="format-list">
        <div class="format-row"><div class="format-icon">LIVE</div><div><div class="format-title">Ortak canlı veri</div><div class="format-desc">${remoteMode ? "Supabase veritabanı ve Realtime bağlantısı aktif." : "Supabase bağlantı bilgileri bekleniyor."}</div></div></div>
        <div class="format-row"><div class="format-icon">${cloudAdmin ? "ADM" : "RO"}</div><div><div class="format-title">Erişim seviyesi</div><div class="format-desc">${cloudAdmin ? "Yönetici: sonuç, oyuncu ve aşama yönetimi açık." : "İzleyici: bütün veriler görünür, değişiklik kapalı."}</div></div></div>
        <div class="format-row"><div class="format-icon">PWA</div><div><div class="format-title">Telefona eklenebilir</div><div class="format-desc">HTTPS üzerinden yayınlandığında ana ekrana uygulama gibi eklenebilir.</div></div></div>
      </div></section>`;
  }

  function standingsTable(rows, context) {
    const fullLeague = context === "league" || context === "league-preview";
    return `<div class="table-wrap"><table>
      <thead><tr><th>#</th><th class="player-col">Oyuncu</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>Form</th></tr></thead>
      <tbody>${rows.map((row, index) => {
        let rankClass = "rank-cell";
        let badge = `${index + 1}`;
        if (fullLeague && index < 6) badge = `<span class="rank-qualify">${index + 1}</span>`;
        else if (fullLeague && index < 12) badge = `<span class="rank-silver">${index + 1}</span>`;
        else if (fullLeague && index >= 12) rankClass += " rank-out";
        if (context === "gold" && index === 0) badge = `<span class="rank-qualify">1</span>`;
        if (context === "silver" && index < 3) badge = `<span class="rank-silver">${index + 1}</span>`;
        return `<tr><td class="${rankClass}">${badge}</td><td class="player-col"><span class="player-name">${displayName(row.id)}</span></td><td>${row.mp}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td class="points-cell">${row.pts}</td><td>${formHTML(row.form)}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }

  function allTimeTable(rows) {
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="player-col">Oyuncu</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>G%</th></tr></thead><tbody>
      ${rows.map(row => `<tr><td>${row.rank}</td><td class="player-col"><span class="player-name">${escapeHTML(row.name)}</span></td><td>${row.games}</td><td>${row.wins}</td><td>${row.draws}</td><td>${row.losses}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "gd-positive" : row.gd < 0 ? "gd-negative" : ""}">${formatGD(row.gd)}</td><td class="points-cell">${row.points}</td><td>${Number(row.ppg).toFixed(2)}</td><td>${row.winRate}%</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function formHTML(form) {
    if (!form?.length) return `<span class="muted">–</span>`;
    return `<div class="form-dots">${form.map(value => `<span class="form-dot form-${value.toLowerCase()}">${value}</span>`).join("")}</div>`;
  }

  function formatGD(value) {
    return value > 0 ? `+${value}` : String(value);
  }

  function scheduleGrid(rounds, editable) {
    return `<div>${(rounds || []).map(round => `<div class="match-round"><div class="round-title"><span>${round.number}. TUR</span><span>${round.matches.filter(matchComplete).length}/${round.matches.length}</span></div><div class="round-grid">${round.matches.map(match => matchCard(match, editable)).join("")}</div></div>`).join("")}</div>`;
  }

  function matchCard(match, editable = true) {
    const effectiveEditable = editable && canEdit();
    const complete = matchComplete(match);
    const score = complete ? `${match.homeScore} – ${match.awayScore}${match.tiebreakWinnerId ? " (P)" : ""}` : effectiveEditable ? "SKOR GİR" : "BEKLENİYOR";
    return `<article class="match-card ${complete ? "complete" : ""} ${effectiveEditable ? "editable" : "viewer"}" ${effectiveEditable ? `data-action="edit-match" data-match-id="${match.id}"` : ""}>
      <div class="match-player"><div class="match-player-name">${displayName(match.homeId)}</div><div class="match-team">${escapeHTML(match.homeTeam || "Takım seçilmedi")}</div></div>
      <div class="match-score ${complete ? "" : "pending"}">${score}</div>
      <div class="match-player right"><div class="match-player-name">${displayName(match.awayId)}</div><div class="match-team">${escapeHTML(match.awayTeam || "Takım seçilmedi")}</div></div>
      <div class="match-meta">${complete && match.tiebreakWinnerId ? `Penaltı galibi: ${displayName(match.tiebreakWinnerId)}` : effectiveEditable ? "Sonuç girişi için tıkla" : "Canlı sonuç bekleniyor"}</div>
    </article>`;
  }

  function seriesCard(series, fallbackLabel, locked = false) {
    if (!series) return `<div class="series-card locked"><div class="series-label">${escapeHTML(fallbackLabel)}</div><div class="empty-state" style="padding:20px 10px"><div class="empty-icon" style="font-size:24px">⌛</div><p>Önceki eşleşme sonucu bekleniyor.</p></div></div>`;
    const wins = seriesWins(series);
    const winner = seriesWinner(series);
    return `<div class="series-card ${winner ? "complete" : ""} ${locked ? "locked" : ""}">
      <div class="series-label">${escapeHTML(series.label || fallbackLabel)} · BEST OF 3</div>
      <div class="series-player ${winner === series.playerAId ? "winner" : ""}"><span class="series-player-name">${displayName(series.playerAId)}</span><span class="series-wins">${wins.a}</span></div>
      <div class="series-player ${winner === series.playerBId ? "winner" : ""}"><span class="series-player-name">${displayName(series.playerBId)}</span><span class="series-wins">${wins.b}</span></div>
      <div class="series-games">${series.games.map((game, index) => {
        const previousComplete = index === 0 || matchComplete(series.games[index - 1]);
        const disabled = !canEdit() || locked || !previousComplete || (!!winner && !matchComplete(game));
        const label = matchComplete(game) ? `${game.homeScore}-${game.awayScore}${game.tiebreakWinnerId ? "P" : ""}` : `Maç ${index + 1}`;
        return `<button class="series-game ${matchComplete(game) ? "done" : ""}" data-action="edit-match" data-match-id="${game.id}" ${disabled ? "disabled" : ""}>${label}</button>`;
      }).join("")}</div>
      ${winner ? `<div class="info-box success-box mt-16" style="padding:8px 10px;font-size:10px">Tur atlayan: <strong>${displayName(winner)}</strong></div>` : ""}
    </div>`;
  }

  function finalCard(match, championId) {
    if (!match) return `<div class="series-card final-card locked"><div class="final-trophy">🏆</div><div class="series-label">BÜYÜK FİNAL · TEK MAÇ</div><div class="muted">Yarı final galipleri bekleniyor.</div></div>`;
    return `<div class="series-card final-card ${championId ? "complete" : ""} ${canEdit() ? "editable" : "viewer"}" ${canEdit() ? `data-action="edit-match" data-match-id="${match.id}"` : ""}>
      <div class="final-trophy">🏆</div><div class="series-label">BÜYÜK FİNAL · TEK MAÇ</div>
      <div class="series-player ${championId === match.homeId ? "winner" : ""}"><span class="series-player-name">${displayName(match.homeId)}</span><span class="series-wins">${matchComplete(match) ? match.homeScore : "–"}</span></div>
      <div class="series-player ${championId === match.awayId ? "winner" : ""}"><span class="series-player-name">${displayName(match.awayId)}</span><span class="series-wins">${matchComplete(match) ? match.awayScore : "–"}</span></div>
      <div class="champion-name">${championId ? `${displayName(championId)} · ŞAMPİYON` : canEdit() ? "Final sonucunu girmek için tıkla" : "Final sonucu bekleniyor"}</div>
    </div>`;
  }

  function editionCard(edition) {
    return `<article class="edition-card" data-action="open-edition" data-edition="${edition.edition}">
      <div class="edition-trophy">🏆</div><div class="edition-number">FIFA TOURNAMENT ${String(edition.edition).padStart(2, "0")}</div>
      <div class="edition-champion">${escapeHTML(edition.champion)}</div><span class="badge badge-gold mt-16">ŞAMPİYON</span>
      <div class="edition-meta"><span>${edition.matchCount} maç</span><span>•</span><span>${edition.totalGoals} gol</span><span>•</span><span>${edition.participants.length} oyuncu</span></div>
      <div class="podium"><div class="podium-row"><span>2. Finalist</span><strong>${escapeHTML(edition.runnerUp)}</strong></div><div class="podium-row"><span>3. Sıra</span><strong>${escapeHTML(edition.third)}</strong></div><div class="podium-row"><span>4. Sıra</span><strong>${escapeHTML(edition.fourth)}</strong></div></div>
    </article>`;
  }

  function emptyState(icon, title, text, actionHTML = "") {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${title}</h3><p>${text}</p>${actionHTML}</div>`;
  }

  function toast(message, type = "") {
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    toastStack.appendChild(item);
    setTimeout(() => item.remove(), 3400);
  }

  function openModal(title, body, eyebrow = "MATCH CENTRE") {
    modalTitle.textContent = title;
    modalEyebrow.textContent = eyebrow;
    modalBody.innerHTML = body;
    modalBackdrop.classList.remove("hidden");
  }

  function closeModal() {
    modalBackdrop.classList.add("hidden");
    modalBody.innerHTML = "";
  }

  function openMatchEditor(matchId) {
    if (!canEdit()) { toast("Sonuç girişi yalnızca turnuva yöneticisine açıktır.", "error"); return; }
    const match = findMatch(matchId);
    if (!match) return;
    const tied = Number.isFinite(match.homeScore) && match.homeScore === match.awayScore;
    openModal("Maç Sonucu", `
      <form id="matchForm" data-match-id="${match.id}">
        <div class="score-editor">
          <div class="score-side"><div class="score-side-name">${displayName(match.homeId)}</div></div>
          <input class="score-input" name="homeScore" type="number" min="0" max="99" value="${Number.isFinite(match.homeScore) ? match.homeScore : ""}" required>
          <div class="score-dash">–</div>
          <input class="score-input" name="awayScore" type="number" min="0" max="99" value="${Number.isFinite(match.awayScore) ? match.awayScore : ""}" required>
          <div class="score-side"><div class="score-side-name">${displayName(match.awayId)}</div></div>
        </div>
        <div class="modal-form-grid">
          <div class="field"><label>${displayName(match.homeId)} Takımı</label><input name="homeTeam" type="text" value="${escapeHTML(match.homeTeam)}" placeholder="Örn. Real Madrid"></div>
          <div class="field"><label>${displayName(match.awayId)} Takımı</label><input name="awayTeam" type="text" value="${escapeHTML(match.awayTeam)}" placeholder="Örn. Manchester City"></div>
        </div>
        ${!match.allowDraw ? `<div class="field mt-16"><label>Eşitlik durumunda kazanan</label><select name="tiebreakWinnerId"><option value="">Skor eşit değil / seçilmedi</option><option value="${match.homeId}" ${match.tiebreakWinnerId === match.homeId ? "selected" : ""}>${displayName(match.homeId)} (Uzatma/Penaltı)</option><option value="${match.awayId}" ${match.tiebreakWinnerId === match.awayId ? "selected" : ""}>${displayName(match.awayId)} (Uzatma/Penaltı)</option></select></div>` : ""}
        <div class="field mt-16"><label>Maç Notu</label><input name="note" type="text" value="${escapeHTML(match.note || "")}" placeholder="Opsiyonel not"></div>
        <div class="modal-actions"><button type="button" class="btn btn-danger" data-action="clear-match" data-match-id="${match.id}">Sonucu Temizle</button><button type="button" class="btn btn-ghost" data-action="close-modal">İptal</button><button type="submit" class="btn btn-gold">Sonucu Kaydet</button></div>
      </form>`, match.phase === "final" ? "BÜYÜK FİNAL" : match.seriesKey ? "ELEME SERİSİ" : "MATCH CENTRE");
  }

  function openNameImport() {
    openModal("Oyuncu İsimlerini Toplu Ekle", `<div class="field"><label>Her satıra bir oyuncu adı</label><textarea id="bulkNames" placeholder="Oyuncu 1\nOyuncu 2\n...\nOyuncu 16"></textarea></div><div class="info-box mt-16">İlk 16 dolu satır alınır. Mevcut isimler değiştirilir.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">İptal</button><button class="btn btn-gold" data-action="apply-bulk-names">İsimleri Uygula</button></div>`, "SQUAD REGISTRATION");
  }

  function openEdition(editionNo) {
    const edition = historical.editions.find(e => e.edition === Number(editionNo));
    if (!edition) return;
    openModal(`FIFA ${edition.edition} Turnuvası`, `
      <div class="grid-even">
        <div class="info-box success-box"><div class="eyebrow">ŞAMPİYON</div><h3>${escapeHTML(edition.champion)}</h3><div>${escapeHTML(edition.runnerUp)} karşısında final galibiyeti</div></div>
        <div class="info-box"><div class="eyebrow">TURNUVA</div><h3>${edition.matchCount} Maç · ${edition.totalGoals} Gol</h3><div>${edition.participants.length} farklı oyuncu</div></div>
      </div>
      <div class="podium mt-16"><div class="podium-row"><span>1. Şampiyon</span><strong>${escapeHTML(edition.champion)}</strong></div><div class="podium-row"><span>2. Finalist</span><strong>${escapeHTML(edition.runnerUp)}</strong></div><div class="podium-row"><span>3. Sıra</span><strong>${escapeHTML(edition.third)}</strong></div><div class="podium-row"><span>4. Sıra</span><strong>${escapeHTML(edition.fourth)}</strong></div></div>
      <h3 class="section-title">Tüm Maçlar</h3>
      <div class="table-wrap" style="max-height:430px"><table><thead><tr><th>#</th><th>Oyuncu</th><th>Takım</th><th>Skor</th><th>Takım</th><th>Oyuncu</th><th>Aşama</th></tr></thead><tbody>${edition.matches.map(m => `<tr><td>${m.idx}</td><td>${escapeHTML(m.p1)}</td><td>${escapeHTML(m.t1 || "–")}</td><td class="points-cell">${m.s1}–${m.s2}</td><td>${escapeHTML(m.t2 || "–")}</td><td>${escapeHTML(m.p2)}</td><td>${escapeHTML(m.stage || "Turnuva Maçı")}</td></tr>`).join("")}</tbody></table></div>
      <div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">Kapat</button></div>`, "TOURNAMENT ARCHIVE");
  }

  function generateDraw() {
    if (!allPlayersReady()) {
      toast("16 benzersiz oyuncu adı girilmelidir.", "error");
      return;
    }
    const seed = randomSeed();
    const ids = shuffled(state.current.participants.map(p => p.id), seed);
    const fullRounds = roundRobin(ids, "league", true);
    state.current.league = { generated: true, drawSeed: seed, rounds: fullRounds.slice(0, LEAGUE_ROUNDS) };
    state.current.phase2 = defaultState().current.phase2;
    state.current.knockout = defaultState().current.knockout;
    saveState();
    toast("League Phase kurası oluşturuldu: 6 tur, 48 maç.", "success");
    navTo("league");
  }

  function generatePhase2() {
    if (!leagueFinished()) {
      toast("Önce 48 League Phase maçını tamamla.", "error");
      return;
    }
    const table = leagueStandings();
    const goldIds = table.slice(0, 6).map(row => row.id);
    const silverIds = table.slice(6, 12).map(row => row.id);
    const eliminatedIds = table.slice(12).map(row => row.id);
    state.current.phase2 = {
      generated: true,
      goldIds,
      silverIds,
      eliminatedIds,
      goldRounds: roundRobin(goldIds, "gold", true),
      silverRounds: roundRobin(silverIds, "silver", true)
    };
    state.current.knockout = defaultState().current.knockout;
    saveState();
    toast("Altın ve Gümüş grupları oluşturuldu. Puanlar taşındı.", "success");
    navTo("gold");
  }

  function generateKnockout() {
    if (!phase2Finished()) {
      toast("Altın ve Gümüş gruplarındaki 30 maç tamamlanmalıdır.", "error");
      return;
    }
    const gold = phase2Standings("gold");
    const silver = phase2Standings("silver");
    const seeds = {
      gold1: gold[0].id, gold2: gold[1].id, gold3: gold[2].id, gold4: gold[3].id,
      silver1: silver[0].id, silver2: silver[1].id, silver3: silver[2].id
    };
    state.current.knockout = {
      generated: true,
      seeds,
      qf1: createSeries("qf1", "Çeyrek Final 1", seeds.gold2, seeds.silver3),
      qf2: createSeries("qf2", "Çeyrek Final 2", seeds.gold3, seeds.silver2),
      qf3: createSeries("qf3", "Çeyrek Final 3", seeds.gold4, seeds.silver1),
      sf1: null, sf2: null, final: null, championId: null
    };
    saveState();
    toast("Eleme serileri oluşturuldu.", "success");
    navTo("knockout");
  }

  function arraySame(a = [], b = []) {
    return a.length === b.length && a.every((value,index)=>value === b[index]);
  }

  function expectedKnockoutSeeds() {
    if (!phase2Finished()) return null;
    const gold = phase2Standings("gold");
    const silver = phase2Standings("silver");
    return { gold1:gold[0].id,gold2:gold[1].id,gold3:gold[2].id,gold4:gold[3].id,silver1:silver[0].id,silver2:silver[1].id,silver3:silver[2].id };
  }

  function seedsSame(a, b) {
    if (!a || !b) return false;
    return Object.keys(a).every(key => a[key] === b[key]);
  }

  function reconcileAfterStageEdit(phase) {
    let warning = "";
    if (phase === "league" && state.current.phase2.generated) {
      const table = leagueStandings();
      const gold = table.slice(0,6).map(row=>row.id);
      const silver = table.slice(6,12).map(row=>row.id);
      if (!arraySame(gold,state.current.phase2.goldIds) || !arraySame(silver,state.current.phase2.silverIds)) {
        state.current.phase2 = defaultState().current.phase2;
        state.current.knockout = defaultState().current.knockout;
        return "League Phase sıralaması değiştiği için Altın/Gümüş ve eleme aşamaları sıfırlandı.";
      }
    }
    if (["league","gold","silver"].includes(phase) && state.current.knockout.generated) {
      const expected = expectedKnockoutSeeds();
      if (!expected || !seedsSame(expected,state.current.knockout.seeds)) {
        state.current.knockout = defaultState().current.knockout;
        warning = "Sıralama değiştiği için eleme eşleşmeleri sıfırlandı.";
      }
    }
    return warning;
  }

  function saveMatch(form) {
    if (!canEdit()) return;
    const match = findMatch(form.dataset.matchId);
    if (!match) return;
    const data = new FormData(form);
    const homeScore = Number(data.get("homeScore"));
    const awayScore = Number(data.get("awayScore"));
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      toast("Geçerli bir skor gir.", "error"); return;
    }
    const tieWinner = data.get("tiebreakWinnerId") || null;
    if (!match.allowDraw && homeScore === awayScore && ![match.homeId, match.awayId].includes(tieWinner)) {
      toast("Eleme maçında eşitlik varsa uzatma/penaltı galibini seç.", "error"); return;
    }
    if (!matchComplete(match)) matchArchiveSnapshot(match, "manual-entry");
    match.homeScore = homeScore;
    match.awayScore = awayScore;
    match.homeTeam = String(data.get("homeTeam") || "").trim();
    match.awayTeam = String(data.get("awayTeam") || "").trim();
    match.tiebreakWinnerId = homeScore === awayScore ? tieWinner : null;
    match.note = String(data.get("note") || "").trim();
    match.updatedAt = new Date().toISOString();
    finalizeMatchArchive(match);
    const warning = reconcileAfterStageEdit(match.phase);
    refreshKnockout();
    saveState();
    closeModal();
    toast(warning || "Maç sonucu kaydedildi.", warning ? "" : "success");
    render();
  }

  function clearMatch(matchId) {
    if (!canEdit()) return;
    const match = findMatch(matchId);
    if (!match) return;
    match.homeScore = null; match.awayScore = null; match.tiebreakWinnerId = null; match.note = ""; match.updatedAt = null;
    clearMatchArchiveResult(matchId);
    const warning = reconcileAfterStageEdit(match.phase);
    refreshKnockout();
    saveState(); closeModal(); render();
    toast(warning || "Maç sonucu temizlendi.");
  }

  async function shareSite() {
    const shareData = {
      title: "FIFA 9 Tournament Hub",
      text: "FIFA 9 canlı fikstür, sonuçlar ve puan durumları",
      url: window.location.href
    };
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (error) { if (error?.name === "AbortError") return; }
    }
    const url = `https://wa.me/?text=${encodeURIComponent(`${shareData.text}
${shareData.url}`)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function download(filename, content, type = "application/octet-stream") {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    const payload = { app: "FIFA Tournament Hub", exportedAt: new Date().toISOString(), state };
    download(`FIFA_9_Backup_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    toast("FIFA 9 yedeği indirildi.", "success");
  }

  function allCurrentMatches() {
    return [...leagueMatches(), ...goldMatches(), ...silverMatches(), ...allKnockoutGames()];
  }

  function combinedAllTime() {
    const map = new Map();
    for (const row of historical.allTime || []) {
      map.set(row.name, {
        name: row.name, games: row.games, wins: row.wins, draws: row.draws, losses: row.losses,
        gf: row.gf, ga: row.ga, gd: row.gd, points: row.points
      });
    }
    for (const match of allCurrentMatches().filter(matchComplete)) {
      const sides = [
        [playerName(match.homeId), match.homeScore, match.awayScore],
        [playerName(match.awayId), match.awayScore, match.homeScore]
      ];
      for (const [name, gf, ga] of sides) {
        if (!name || /^P\d+$/.test(name)) continue;
        if (!map.has(name)) map.set(name, { name, games:0,wins:0,draws:0,losses:0,gf:0,ga:0,gd:0,points:0 });
        const row = map.get(name);
        row.games++; row.gf += gf; row.ga += ga;
        if (gf > ga) { row.wins++; row.points += 3; }
        else if (gf === ga && match.allowDraw) { row.draws++; row.points += 1; }
        else if (gf === ga && !match.allowDraw) {
          if (matchWinnerId(match) === (name === playerName(match.homeId) ? match.homeId : match.awayId)) { row.wins++; row.points += 3; }
          else row.losses++;
        } else row.losses++;
        row.gd = row.gf - row.ga;
      }
    }
    const rows = [...map.values()].sort((a,b)=>b.points-a.points || b.gd-a.gd || b.gf-a.gf || a.name.localeCompare(b.name,'tr'));
    return rows.map((row,index)=>({
      ...row, rank:index+1, ppg: row.games ? Number((row.points/row.games).toFixed(2)) : 0,
      winRate: row.games ? Number((row.wins/row.games*100).toFixed(1)) : 0
    }));
  }

  function combinedChampions() {
    const map = new Map((historical.champions || []).map(row => [row.name, { ...row }]));
    const championId = state.current.knockout.championId;
    if (championId) {
      const name = playerName(championId);
      const row = map.get(name) || { name, titles:0, finals:0, podiums:0 };
      row.titles += 1; row.finals += 1; row.podiums += 1; map.set(name,row);
      const final = state.current.knockout.final;
      const runnerId = final ? (championId === final.homeId ? final.awayId : final.homeId) : null;
      if (runnerId) {
        const runner = playerName(runnerId);
        const rr = map.get(runner) || { name:runner,titles:0,finals:0,podiums:0 };
        rr.finals += 1; rr.podiums += 1; map.set(runner,rr);
      }
    }
    return [...map.values()].sort((a,b)=>b.titles-a.titles || b.finals-a.finals || a.name.localeCompare(b.name,'tr'));
  }

  function exportCSV() {
    const header = ["Phase","Round","Home Player","Home Team","Home Score","Away Score","Away Team","Away Player","Tiebreak Winner","Note"];
    const lines = [header, ...allCurrentMatches().filter(matchComplete).map(m => [m.phase,m.round,playerName(m.homeId),m.homeTeam,m.homeScore,m.awayScore,m.awayTeam,playerName(m.awayId),m.tiebreakWinnerId ? playerName(m.tiebreakWinnerId) : "",m.note || ""])];
    const csv = "\ufeff" + lines.map(row => row.map(value => `"${String(value ?? "").replaceAll('"','""')}"`).join(";")).join("\r\n");
    download("FIFA_9_Mac_Sonuclari.csv", csv, "text/csv;charset=utf-8");
    toast("Maç sonuçları CSV olarak indirildi.", "success");
  }

  function exportPlayers() {
    download("FIFA_9_Oyuncular.txt", state.current.participants.map((p,i)=>`${i+1}. ${p.name || ""}`).join("\n"), "text/plain;charset=utf-8");
  }

  function importBackup(file) {
    if (!canEdit()) { toast("Yedek yükleme yalnızca yöneticiye açıktır.", "error"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const candidate = parsed.state || parsed;
        if (!candidate.current?.participants) throw new Error("Geçersiz yedek");
        state = mergeState(candidate);
        saveState();
        toast("Yedek başarıyla geri yüklendi.", "success");
        navTo("dashboard");
      } catch (error) {
        toast("JSON yedeği okunamadı.", "error");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function openAdminLogin() {
    if (!cloudConfigured) { openCloudHelp(); return; }
    openModal("Yönetici Girişi", `<form id="adminLoginForm">
      <div class="info-box">Katılımcılar giriş yapmadan canlı turnuvayı izler. Bu giriş yalnızca sonuç ve fikstür yönetimi içindir.</div>
      <div class="field mt-16"><label>E-posta</label><input type="email" name="email" autocomplete="username" required placeholder="yonetici@example.com"></div>
      <div class="field"><label>Parola</label><input type="password" name="password" autocomplete="current-password" required placeholder="••••••••"></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">İptal</button><button type="submit" class="btn btn-gold">Giriş Yap</button></div>
    </form>`, "SECURE ADMIN ACCESS");
  }

  function openCloudHelp() {
    openModal("Canlı Site Kurulumu", `<div class="info-box warning-box">Bu paket canlı kullanıma hazırdır. Supabase proje URL'si ve anon/public key'i <strong>cloud-config.js</strong> dosyasına girilmelidir.</div>
      <div class="format-list mt-16">
        <div class="format-row"><div class="format-icon">1</div><div><div class="format-title">Supabase projesi oluştur</div><div class="format-desc">SQL Editor'da supabase/schema.sql dosyasını çalıştır.</div></div></div>
        <div class="format-row"><div class="format-icon">2</div><div><div class="format-title">Yönetici kullanıcısını ekle</div><div class="format-desc">Authentication > Users bölümünden kullanıcı oluştur, UUID'sini tournament_admins tablosuna ekle.</div></div></div>
        <div class="format-row"><div class="format-icon">3</div><div><div class="format-title">Bağlantı bilgilerini gir</div><div class="format-desc">Project URL ve anon/public key'i cloud-config.js içine yapıştır.</div></div></div>
        <div class="format-row"><div class="format-icon">4</div><div><div class="format-title">Vercel'e yükle</div><div class="format-desc">Klasörü veya ZIP'i Vercel Drop'a sürükleyip yayınla.</div></div></div>
      </div><div class="modal-actions"><button class="btn btn-gold" data-action="close-modal">Tamam</button></div>`, "GO LIVE");
  }

  async function handleAdminLogin(form) {
    const data = new FormData(form);
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Bağlanıyor...";
    try {
      const result = await cloud.signIn(String(data.get("email") || "").trim(), String(data.get("password") || ""));
      if (!result.isAdmin) {
        await cloud.signOut();
        throw new Error("Bu hesap turnuva yöneticisi olarak yetkilendirilmemiş.");
      }
      closeModal();
      toast("Yönetici girişi başarılı.", "success");
      updateAuthUI();
      render();
    } catch (error) {
      toast(error.message || "Giriş başarısız.", "error");
      button.disabled = false;
      button.textContent = "Giriş Yap";
    }
  }

  function confirmReset() {
    if (!canEdit()) return;
    openModal("FIFA 9 Verisini Sıfırla", `<div class="info-box warning-box">Bu işlem güncel turnuvadaki oyuncuları, fikstürleri ve sonuçları siler. FIFA 1–8 arşivi etkilenmez.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-danger" data-action="reset-current">Evet, Sıfırla</button></div>`, "DANGER ZONE");
  }

  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && livePresentationMode !== "standard") {
      livePresentationMode = "standard";
      sessionStorage.removeItem("fifa9-live-presentation-mode");
      applyLivePresentationMode();
      if (activeView === "livematch") renderLiveMatchCentre();
    }
  });

  document.addEventListener("click", event => {
    if (window.FIFA_CHAT_UI?.handleClick?.(event)) return;
    const nav = event.target.closest("[data-nav]");
    if (nav) { navTo(nav.dataset.nav); return; }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const type = action.dataset.action;
    if (type === "set-intelligence-section") {
      intelligenceSection = action.dataset.intelligenceSection || "matchday";
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "open-live-pulse") {
      intelligenceSection = "pulse";
      navTo("intelligence");
      return;
    }
    if (type === "enter-broadcast-mode") { enterLivePresentation("broadcast"); return; }
    if (type === "enter-tv-mode") { enterLivePresentation("tv"); return; }
    if (type === "exit-live-presentation") { exitLivePresentation(true); return; }
    if (type === "open-matchday-analysis") { openMatchdayAnalysis(action.dataset.matchId); return; }
    if (type === "refresh-predictions") { predictionCache.loadedAt = 0; loadPredictionRows(true); return; }
    if (type === "set-simulation-runs") {
      const runs = Number(action.dataset.simulationRuns);
      if ([1000, 5000, 10000].includes(runs)) tournamentSimulationRuns = runs;
      tournamentSimulationNonce += 1;
      tournamentSimulationCache.key = ""; tournamentSimulationCache.data = null;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "rerun-tournament-simulation") {
      tournamentSimulationNonce += 1;
      tournamentSimulationCache.key = ""; tournamentSimulationCache.data = null;
      if (activeView === "intelligence") renderIntelligenceCentre();
      toast("Turnuva simülasyonu güncel verilerle yeniden çalıştırıldı.", "success");
      return;
    }
    if (type === "share-tournament-simulation") {
      shareTournamentSimulation();
      return;
    }
    if (type === "set-simulator-group") {
      intelligenceSimulatorGroup = action.dataset.group === "silver" ? "silver" : "gold";
      qualificationScenario = {};
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "clear-simulator") {
      qualificationScenario = {};
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "run-simulator") {
      if (activeView === "intelligence") renderIntelligenceCentre();
      toast("Senaryo sıralaması yeniden hesaplandı.", "success");
      return;
    }
    if (type === "select-player-card") {
      intelligencePlayerCard = action.dataset.playerName || intelligencePlayerCard;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "set-director-tone") {
      directorTone = ["analyst","dramatic","ruthless","captain"].includes(action.dataset.directorTone) ? action.dataset.directorTone : "analyst";
      directorNonce += 1;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (type === "refresh-director-briefing") {
      directorNonce += 1;
      if (activeView === "intelligence") renderIntelligenceCentre();
      toast(intelligenceCopy("Direktör bülteni güncel verilerle yenilendi.", "Director briefing refreshed with current data."), "success");
      return;
    }
    if (type === "share-director-briefing") {
      shareDirectorBriefing();
      return;
    }
    if (type === "set-odds-filter") {
      oddsPhaseFilter = action.dataset.oddsFilter || "all";
      if (activeView === "odds") renderOddsCentre();
      return;
    }
    if (type === "open-odds-analysis") { openOddsAnalysis(action.dataset.matchId); return; }
    if (type === "open-match-archive-details") { openMatchArchiveDetails(action.dataset.matchId); return; }
    if (type === "share-odds") { shareOdds(); return; }
    if (type === "share-single-odds") { shareOdds(action.dataset.matchId); return; }
    if (type === "set-form-window") {
      formWindowSize = Math.max(5, Math.min(20, Number(action.dataset.formWindow) || 20));
      if (activeView === "form") renderFormCentre();
      return;
    }
    if (type === "set-form-scope") {
      formScope = action.dataset.formScope === "all" ? "all" : "current";
      selectedFormPlayerName = "";
      if (activeView === "form") renderFormCentre();
      return;
    }
    if (type === "select-form-player") {
      selectedFormPlayerName = action.dataset.playerName || selectedFormPlayerName;
      if (activeView === "form") renderFormCentre();
      return;
    }
    if (type === "share-live-match") { shareLiveMatch(); return; }
    if (type === "share-live-stats") { shareLiveStatistics(); return; }
    if (type === "share-form-stats") { shareFormStatistics(); return; }
    if (type === "print-a3-board") { printA3Board(); return; }
    if (type === "print-league-master") { printLeagueMaster(); return; }
    if (type === "print-round-sheets") { printRoundSheets(); return; }
    if (type === "print-standings-sheet") { printStandingsSheet(); return; }
    if (type === "print-gold-pack") { printGroupPack("gold"); return; }
    if (type === "print-silver-pack") { printGroupPack("silver"); return; }
    if (type === "print-knockout-board") { printKnockoutBoard(); return; }
    if (type === "print-full-pack") { printFullPack(); return; }
    if (type === "select-team-stat") {
      selectedTeamStatName = action.dataset.teamName || selectedTeamStatName;
      if (activeView === "teams") renderTeamStatistics();
      return;
    }
    if (type === "select-alltime-player") {
      allTimeSelectedPlayerName = action.dataset.playerName || allTimeSelectedPlayerName;
      if (activeView === "alltime") renderAllTime();
      return;
    }
    if (type === "set-rivalry") {
      allTimeRivalryA = action.dataset.rivalA || allTimeRivalryA;
      allTimeRivalryB = action.dataset.rivalB || allTimeRivalryB;
      if (activeView === "alltime") renderAllTime();
      return;
    }
    if (["generate-draw","generate-phase2","generate-knockout","edit-match","clear-match","open-name-import","apply-bulk-names","confirm-reset","reset-current","start-live-match","live-goal","live-score-minus","live-minute-change","live-set-status","live-quick-event","delete-live-event","open-finish-live","open-cancel-live","cancel-live-match"].includes(type) && !canEdit()) {
      toast("Bu işlem yalnızca turnuva yöneticisine açıktır.", "error");
      return;
    }
    if (type === "start-live-match") startLiveMatch(action.dataset.matchId);
    if (type === "live-goal") addLiveGoal(action.dataset.side);
    if (type === "live-score-minus") reduceLiveScore(action.dataset.side);
    if (type === "live-minute-change") changeLiveMinute(action.dataset.delta);
    if (type === "live-set-status") setLiveStatus(action.dataset.status);
    if (type === "live-quick-event") addLiveQuickEvent(action.dataset.eventType, action.dataset.side);
    if (type === "delete-live-event") deleteLiveEvent(action.dataset.eventId);
    if (type === "open-finish-live") openFinishLiveMatch();
    if (type === "open-cancel-live") openCancelLiveMatch();
    if (type === "cancel-live-match") cancelLiveMatch();
    if (type === "generate-draw") generateDraw();
    if (type === "generate-phase2") generatePhase2();
    if (type === "generate-knockout") generateKnockout();
    if (type === "edit-match") openMatchEditor(action.dataset.matchId);
    if (type === "clear-match") clearMatch(action.dataset.matchId);
    if (type === "open-name-import") openNameImport();
    if (type === "apply-bulk-names") {
      const lines = ($("#bulkNames")?.value || "").split(/\r?\n/).map(v=>v.trim()).filter(Boolean).slice(0, PLAYER_COUNT);
      lines.forEach((name,index)=>state.current.participants[index].name=name);
      saveState(); closeModal(); render(); toast(`${lines.length} oyuncu adı uygulandı.`, "success");
    }
    if (type === "open-edition") openEdition(action.dataset.edition);
    if (type === "open-admin-login") openAdminLogin();
    if (type === "open-cloud-help") openCloudHelp();
    if (type === "admin-signout") cloud?.signOut?.().then(() => { toast("Yönetici oturumu kapatıldı."); updateAuthUI(); render(); });
    if (type === "close-modal") closeModal();
    if (type === "export-json") exportJSON();
    if (type === "export-csv") exportCSV();
    if (type === "export-players") exportPlayers();
    if (type === "share-site") shareSite();
    if (type === "confirm-reset") confirmReset();
    if (type === "reset-current") { state = defaultState(); saveState(); closeModal(); toast("Güncel turnuva sıfırlandı.", "success"); navTo("setup"); }
  });

  document.addEventListener("input", event => {
    if (event.target.dataset.liveField && canEdit()) {
      const active = getLiveState().active;
      if (active) { active[event.target.dataset.liveField] = event.target.value; active.updatedAt = new Date().toISOString(); saveState(); }
      return;
    }
    if (event.target.dataset.liveNumber && canEdit()) {
      const active = getLiveState().active;
      if (active) { active[event.target.dataset.liveNumber] = Math.max(0, Number(event.target.value) || 0); active.updatedAt = new Date().toISOString(); saveState(); }
      return;
    }
    if (event.target.dataset.simMatch) {
      const matchId = event.target.dataset.simMatch;
      const side = event.target.dataset.simSide === "away" ? "away" : "home";
      if (!qualificationScenario[matchId]) qualificationScenario[matchId] = { home: "", away: "" };
      qualificationScenario[matchId][side] = event.target.value;
      return;
    }
    const id = event.target.dataset.playerInput;
    if (!id || !canEdit()) return;
    const p = participant(id);
    p.name = event.target.value;
    saveState();
  });

  document.addEventListener("submit", event => {
    if (window.FIFA_CHAT_UI?.handleSubmit?.(event)) return;
    if (event.target.id === "matchForm") {
      event.preventDefault();
      saveMatch(event.target);
    }
    if (event.target.id === "adminLoginForm") {
      event.preventDefault();
      handleAdminLogin(event.target);
    }
    if (event.target.id === "liveEventForm") {
      event.preventDefault();
      addLiveEvent(event.target);
    }
    if (event.target.id === "finishLiveMatchForm") {
      event.preventDefault();
      finishLiveMatch(event.target);
    }
    if (event.target.id === "predictionForm") {
      event.preventDefault();
      submitPrediction(event.target);
    }
  });

  document.addEventListener("change", event => {
    if ((event.target.dataset.liveField || event.target.dataset.liveNumber) && canEdit()) {
      const active = getLiveState().active;
      if (active) {
        if (event.target.dataset.liveField) active[event.target.dataset.liveField] = event.target.value;
        if (event.target.dataset.liveNumber) active[event.target.dataset.liveNumber] = Math.max(0, Number(event.target.value) || 0);
        active.updatedAt = new Date().toISOString();
        saveState(false, true);
        if (activeView === "livematch") renderLiveMatchCentre();
      }
      return;
    }
    if (event.target.id === "intelRivalA") {
      intelligenceRivalA = event.target.value;
      if (intelligenceRivalA === intelligenceRivalB) intelligenceRivalB = intelligenceNames().find(name => name !== intelligenceRivalA) || "";
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (event.target.id === "intelRivalB") {
      intelligenceRivalB = event.target.value;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (event.target.id === "intelPlayerCardSelect") {
      intelligencePlayerCard = event.target.value;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (event.target.id === "intelDestinyPlayerSelect") {
      intelligenceDestinyPlayer = event.target.value;
      if (activeView === "intelligence") renderIntelligenceCentre();
      return;
    }
    if (event.target.id === "importFile" && event.target.files?.[0]) importBackup(event.target.files[0]);
    if (event.target.id === "formPlayerSelect") { selectedFormPlayerName = event.target.value; if (activeView === "form") renderFormCentre(); }
    if (event.target.id === "allTimePlayerSelect") { allTimeSelectedPlayerName = event.target.value; if (activeView === "alltime") renderAllTime(); }
    if (event.target.id === "rivalrySelectA") {
      allTimeRivalryA = event.target.value;
      if (allTimeRivalryA === allTimeRivalryB) {
        const other = combinedAllTime().find(row => row.name !== allTimeRivalryA)?.name || "";
        allTimeRivalryB = other;
      }
      if (activeView === "alltime") renderAllTime();
    }
    if (event.target.id === "rivalrySelectB") {
      allTimeRivalryB = event.target.value;
      if (allTimeRivalryA === allTimeRivalryB) {
        const other = combinedAllTime().find(row => row.name !== allTimeRivalryB)?.name || "";
        allTimeRivalryA = other;
      }
      if (activeView === "alltime") renderAllTime();
    }
    if (event.target.id === "teamStatisticsSelect") { selectedTeamStatName = event.target.value; if (activeView === "teams") renderTeamStatistics(); }
    if (event.target.id === "teamPlayerSelect") { selectedTeamPlayerName = event.target.value; if (activeView === "teams") renderTeamStatistics(); }
  });

  $("#modalClose").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", event => { if (event.target === modalBackdrop) closeModal(); });
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#quickBackupBtn").addEventListener("click", exportJSON);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

  window.FIFA_APP_CONTEXT = {
    getState: () => state,
    getParticipants: () => state.current.participants,
    getActiveView: () => activeView,
    canEdit,
    isAdmin: () => cloudAdmin,
    toast,
    refreshView: () => render(),
    navigate: target => navTo(target)
  };

  async function initializeCloud() {
    updateAuthUI();
    if (!cloudConfigured || !cloud?.init) {
      setCloudState(cloudConfigured ? "error" : "not-configured");
      render();
      return;
    }
    try {
      await cloud.init({
        onState: (remoteState, meta = {}) => {
          state = mergeState(remoteState);
          cloudUpdatedAt = meta.updatedAt || cloudUpdatedAt;
          cacheState();
          if (meta.source === "realtime") toast("Canlı turnuva verisi güncellendi.", "success");
          render();
        },
        onAuth: ({ user, isAdmin }) => {
          cloudUser = user || null;
          cloudAdmin = Boolean(isAdmin);
          updateAuthUI();
          render();
        },
        onStatus: ({ status, detail }) => setCloudState(status, detail)
      });
    } catch (error) {
      console.error("Cloud initialization failed", error);
      setCloudState("error", error.message);
      toast("Canlı veriye bağlanılamadı. Son kayıtlı görünüm gösteriliyor.", "error");
    }
    updateAuthUI();
    render();
    window.FIFA_CHAT_UI?.onCloudReady?.();
    window.dispatchEvent(new Event("fifa-cloud-ready"));
  }

  initializeCloud();
})();
