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
    setup: "Kura & Oyuncular",
    league: "UEFA League Phase",
    gold: "Altın Grup",
    silver: "Gümüş Grup",
    knockout: "Eleme Aşaması",
    archive: "Turnuva Arşivi",
    alltime: "Tüm Zamanlar",
    backup: "Veri & Yedek"
  };

  let activeView = "dashboard";
  let state = loadState();
  let allTimeSelectedPlayerName = "";
  let allTimeRivalryA = "";
  let allTimeRivalryB = "";

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
        }
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
        knockout: { ...fresh.current.knockout, ...(raw.current?.knockout || {}) }
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
    activeView = target;
    pageTitle.textContent = titleMap[target] || "FIFA 9";
    $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.nav === target));
    $("#sidebar").classList.remove("open");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    refreshKnockout();
    switch (activeView) {
      case "setup": renderSetup(); break;
      case "league": renderLeague(); break;
      case "gold": renderGroup("gold"); break;
      case "silver": renderGroup("silver"); break;
      case "knockout": renderKnockout(); break;
      case "archive": renderArchive(); break;
      case "alltime": renderAllTime(); break;
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
          <div class="hero-kicker">✦ UEFA LEAGUE PHASE FORMAT</div>
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
          <div class="panel-header"><div><h3 class="panel-title">Nihai Format</h3><div class="panel-subtitle">FIFA 9 · UEFA League Phase sistemi</div></div></div>
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
        <div><div class="eyebrow">ROUND 1</div><h2>UEFA League Phase</h2><p>16 oyuncu · 6 tur · tek puan tablosu · ilk 12 bir sonraki aşamaya yükselir.</p></div>
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
    match.homeScore = homeScore;
    match.awayScore = awayScore;
    match.homeTeam = String(data.get("homeTeam") || "").trim();
    match.awayTeam = String(data.get("awayTeam") || "").trim();
    match.tiebreakWinnerId = homeScore === awayScore ? tieWinner : null;
    match.note = String(data.get("note") || "").trim();
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
    match.homeScore = null; match.awayScore = null; match.tiebreakWinnerId = null; match.note = "";
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

  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav) { navTo(nav.dataset.nav); return; }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const type = action.dataset.action;
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
    if (["generate-draw","generate-phase2","generate-knockout","edit-match","clear-match","open-name-import","apply-bulk-names","confirm-reset","reset-current"].includes(type) && !canEdit()) {
      toast("Bu işlem yalnızca turnuva yöneticisine açıktır.", "error");
      return;
    }
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
    const id = event.target.dataset.playerInput;
    if (!id || !canEdit()) return;
    const p = participant(id);
    p.name = event.target.value;
    saveState();
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "matchForm") {
      event.preventDefault();
      saveMatch(event.target);
    }
    if (event.target.id === "adminLoginForm") {
      event.preventDefault();
      handleAdminLogin(event.target);
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "importFile" && event.target.files?.[0]) importBackup(event.target.files[0]);
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
  });

  $("#modalClose").addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", event => { if (event.target === modalBackdrop) closeModal(); });
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#quickBackupBtn").addEventListener("click", exportJSON);
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }

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
  }

  initializeCloud();
})();
