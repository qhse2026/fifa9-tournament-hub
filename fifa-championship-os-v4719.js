(() => {
  "use strict";

  const VERSION = "2.3.0";
  const BUILD = '572000';
  const ROUND_ORDER = ["playin", "quarterfinal", "semifinal", "bronze", "final"];
  const SERIES_STARS = Object.freeze([4, 4.5, 5]);
  const STORAGE_KEY = "fifa-tournament-hub-v1";

  let activePanel = sessionStorage.getItem("fifa-championship-panel") || "command";
  let selectedPassPlayer = sessionStorage.getItem("fifa-championship-pass-player") || new URL(location.href).searchParams.get("fifa10pass") || "";
  let selectedRatingPlayer = sessionStorage.getItem("fifa-championship-rating-player") || "";
  let selectedCounterfactualMatch = sessionStorage.getItem("fifa-championship-counterfactual-match") || "";
  let selectedCounterfactualOutcome = sessionStorage.getItem("fifa-championship-counterfactual-outcome") || "reverse";
  let lastMount = null;
  let lastPayload = null;
  let lastDraw = null;
  let notice = { type: "info", text: "" };
  let listenersInstalled = false;
  let autoLockInProgress = false;

  const ui = (tr, en) => window.FIFA_I18N?.language === "en" ? en : tr;
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const mean = values => {
    const clean = values.map(Number).filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
  };
  const stdDev = values => {
    const clean = values.map(Number).filter(Number.isFinite);
    if (clean.length < 2) return 0;
    const average = mean(clean);
    return Math.sqrt(mean(clean.map(value => Math.pow(value - average, 2))));
  };
  const deepClone = value => {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  };
  const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const normalize = value => String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const hash = value => {
    let result = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  };
  const seededRandom = seedValue => {
    let seed = Number(seedValue) >>> 0;
    return () => {
      seed += 0x6D2B79F5;
      let value = seed;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  };
  const logistic = difference => 1 / (1 + Math.pow(10, -Number(difference || 0) / 400));
  const nowISO = () => new Date().toISOString();
  const app = () => window.FIFA_APP_CONTEXT || null;
  const engine = () => window.FIFA10_DRAW_ENGINE || null;
  const universe = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const draft = payload => (payload || app()?.getState?.())?.seasonSystem?.fifa10Draft || {};
  const currentDraw = draw => draw || engine()?.drawState?.() || app()?.getFifa10Draw?.() || null;
  const playerMap = draw => new Map((draw?.participants || []).map(player => [String(player.id), player]));
  const resultPoints = (homeScore, awayScore, side) => {
    if (Number(homeScore) > Number(awayScore)) return side === "home" ? 3 : 0;
    if (Number(awayScore) > Number(homeScore)) return side === "away" ? 3 : 0;
    return 1;
  };
  const pathForRank = rank => rank <= 4 ? "direct" : rank <= 12 ? "playin" : "eliminated";
  const pathLabel = rank => rank <= 4
    ? ui("Doğrudan Çeyrek Final", "Direct Quarter-final")
    : rank <= 12 ? "Championship Play-in" : ui("Doğrudan Elendi", "Eliminated");

  function drawStandings(draw) {
    if (!draw) return [];
    const groups = new Map();
    Object.entries(draw.groups || {}).forEach(([group, ids]) => (ids || []).forEach(id => groups.set(String(id), group)));
    const rows = new Map((draw.participants || []).map((player, index) => [String(player.id), {
      id: String(player.id),
      name: player.name,
      group: groups.get(String(player.id)) || "–",
      elo: Number(player.elo || 1500),
      tieBreakOrder: Number(player.tieBreakOrder || index + 1),
      mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0
    }]));
    (draw.fixtures || []).filter(match => match.completed).forEach(match => {
      const home = rows.get(String(match.homeId));
      const away = rows.get(String(match.awayId));
      if (!home || !away) return;
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      home.mp += 1; away.mp += 1;
      home.gf += homeScore; home.ga += awayScore;
      away.gf += awayScore; away.ga += homeScore;
      const homePoints = resultPoints(homeScore, awayScore, "home");
      const awayPoints = resultPoints(homeScore, awayScore, "away");
      home.pts += homePoints; away.pts += awayPoints;
      if (homePoints === 3) { home.w += 1; away.l += 1; }
      else if (awayPoints === 3) { away.w += 1; home.l += 1; }
      else { home.d += 1; away.d += 1; }
    });
    return [...rows.values()].map(row => ({
      ...row,
      ppg: row.mp ? row.pts / row.mp : 0,
      gd: row.gf - row.ga,
      gdPerMatch: row.mp ? (row.gf - row.ga) / row.mp : 0,
      winRate: row.mp ? row.w / row.mp : 0
    })).sort((a, b) =>
      b.ppg - a.ppg
      || b.gdPerMatch - a.gdPerMatch
      || b.gf - a.gf
      || b.winRate - a.winRate
      || a.tieBreakOrder - b.tieBreakOrder
    ).map((row, index) => ({ ...row, rank: index + 1, path: pathForRank(index + 1) }));
  }

  function seriesTemplate(id, round, label, bestOf, homeSource, awaySource) {
    const stars = bestOf === 1 ? [round === "bronze" ? 4.5 : 5] : SERIES_STARS;
    return {
      id, round, label, bestOf, homeSource, awaySource,
      homeId: null, awayId: null, winnerId: null, loserId: null,
      status: "waiting",
      matches: stars.map((tier, index) => ({
        id: `${id}-M${index + 1}`,
        number: index + 1,
        stars: tier,
        completed: false,
        homeScore: null,
        awayScore: null,
        homeTeam: "",
        awayTeam: "",
        confirmation: { home: false, away: false, admin: false },
        updatedAt: null
      }))
    };
  }

  function createJourney(draw, locked = false) {
    const table = drawStandings(draw);
    const seedIds = Object.fromEntries(table.map(row => [String(row.rank), row.id]));
    return {
      version: 1,
      build: BUILD,
      status: locked ? "official" : "preview",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      lockedAt: locked ? nowISO() : null,
      basedOnDrawId: draw?.drawId || "",
      basedOnDrawUpdatedAt: draw?.updatedAt || "",
      seedSnapshot: table.map(row => ({
        rank: row.rank, id: row.id, name: row.name, ppg: row.ppg, gdPerMatch: row.gdPerMatch, gf: row.gf
      })),
      seedIds,
      rounds: {
        playin: [
          seriesTemplate("F10-PI-1", "playin", "5–12", 3, { type: "seed", rank: 5 }, { type: "seed", rank: 12 }),
          seriesTemplate("F10-PI-2", "playin", "6–11", 3, { type: "seed", rank: 6 }, { type: "seed", rank: 11 }),
          seriesTemplate("F10-PI-3", "playin", "7–10", 3, { type: "seed", rank: 7 }, { type: "seed", rank: 10 }),
          seriesTemplate("F10-PI-4", "playin", "8–9", 3, { type: "seed", rank: 8 }, { type: "seed", rank: 9 })
        ],
        quarterfinal: [
          seriesTemplate("F10-QF-1", "quarterfinal", "QF 1", 3, { type: "seed", rank: 1 }, { type: "winner", seriesId: "F10-PI-4" }),
          seriesTemplate("F10-QF-2", "quarterfinal", "QF 2", 3, { type: "seed", rank: 4 }, { type: "winner", seriesId: "F10-PI-1" }),
          seriesTemplate("F10-QF-3", "quarterfinal", "QF 3", 3, { type: "seed", rank: 2 }, { type: "winner", seriesId: "F10-PI-3" }),
          seriesTemplate("F10-QF-4", "quarterfinal", "QF 4", 3, { type: "seed", rank: 3 }, { type: "winner", seriesId: "F10-PI-2" })
        ],
        semifinal: [
          seriesTemplate("F10-SF-1", "semifinal", "SF 1", 3, { type: "winner", seriesId: "F10-QF-1" }, { type: "winner", seriesId: "F10-QF-2" }),
          seriesTemplate("F10-SF-2", "semifinal", "SF 2", 3, { type: "winner", seriesId: "F10-QF-3" }, { type: "winner", seriesId: "F10-QF-4" })
        ],
        bronze: [
          seriesTemplate("F10-BR-1", "bronze", "THIRD PLACE", 1, { type: "loser", seriesId: "F10-SF-1" }, { type: "loser", seriesId: "F10-SF-2" })
        ],
        final: [
          seriesTemplate("F10-FINAL-1", "final", "GRAND FINAL", 1, { type: "winner", seriesId: "F10-SF-1" }, { type: "winner", seriesId: "F10-SF-2" })
        ]
      }
    };
  }

  function allSeries(state) {
    return ROUND_ORDER.flatMap(round => state?.rounds?.[round] || []);
  }

  function recalculateSeries(series) {
    if (!series.homeId || !series.awayId) {
      series.status = "waiting";
      series.winnerId = null;
      series.loserId = null;
      return series;
    }
    let homeWins = 0;
    let awayWins = 0;
    let decided = false;
    const target = series.bestOf === 1 ? 1 : 2;
    series.matches.forEach(match => {
      if (decided) {
        match.notRequired = true;
        return;
      }
      match.notRequired = false;
      if (!match.completed) return;
      if (Number(match.homeScore) > Number(match.awayScore)) homeWins += 1;
      else awayWins += 1;
      if (homeWins >= target || awayWins >= target) decided = true;
    });
    series.homeWins = homeWins;
    series.awayWins = awayWins;
    if (homeWins >= target || awayWins >= target) {
      series.winnerId = homeWins > awayWins ? series.homeId : series.awayId;
      series.loserId = homeWins > awayWins ? series.awayId : series.homeId;
      series.status = "completed";
      series.completedAt ||= nowISO();
    } else {
      series.winnerId = null;
      series.loserId = null;
      series.status = series.matches.some(match => match.completed) ? "live" : "ready";
      series.completedAt = null;
    }
    return series;
  }

  function resolveJourney(input) {
    const state = deepClone(input);
    const seriesMap = new Map(allSeries(state).map(series => [series.id, series]));
    const resolveSource = source => {
      if (!source) return null;
      if (source.type === "seed") return state.seedIds?.[String(source.rank)] || null;
      const parent = seriesMap.get(source.seriesId);
      return source.type === "loser" ? parent?.loserId || null : parent?.winnerId || null;
    };
    ROUND_ORDER.forEach(round => {
      (state.rounds?.[round] || []).forEach(series => {
        series.homeId = resolveSource(series.homeSource);
        series.awayId = resolveSource(series.awaySource);
        recalculateSeries(series);
      });
    });
    state.championId = state.rounds?.final?.[0]?.winnerId || null;
    state.runnerUpId = state.rounds?.final?.[0]?.loserId || null;
    state.thirdId = state.rounds?.bronze?.[0]?.winnerId || null;
    state.status = state.championId ? "completed" : state.status;
    return state;
  }

  function journeyState(payload, draw) {
    const stored = draft(payload).championshipOS;
    if (stored?.version === 1 && stored.basedOnDrawId === draw?.drawId) return resolveJourney(stored);
    return resolveJourney(createJourney(draw, false));
  }

  function usedTeamsForPlayer(draw, state, playerId, excludedMatchId = "") {
    const used = new Set();
    (draw?.fixtures || []).filter(match => match.completed && (String(match.homeId) === String(playerId) || String(match.awayId) === String(playerId)))
      .forEach(match => {
        const team = String(match.homeId) === String(playerId) ? match.homeTeam : match.awayTeam;
        if (team) used.add(normalize(team));
      });
    allSeries(state).forEach(series => (series.matches || []).filter(match => match.completed && match.id !== excludedMatchId).forEach(match => {
      if (String(series.homeId) === String(playerId) && match.homeTeam) used.add(normalize(match.homeTeam));
      if (String(series.awayId) === String(playerId) && match.awayTeam) used.add(normalize(match.awayTeam));
    }));
    return used;
  }

  function teamPool(stars) {
    const pools = app()?.getFifa10TeamPools?.() || window.FIFA10_TEAM_POOLS || {};
    return pools[String(Number(stars))] || [];
  }

  function findSeries(state, seriesId) {
    return allSeries(state).find(series => series.id === seriesId) || null;
  }

  function downstreamSeries(state, sourceId) {
    const output = [];
    const visit = id => {
      allSeries(state).forEach(series => {
        if (output.some(item => item.id === series.id)) return;
        const depends = [series.homeSource, series.awaySource].some(source => source?.seriesId === id);
        if (depends) {
          output.push(series);
          visit(series.id);
        }
      });
    };
    visit(sourceId);
    return output;
  }

  async function lockJourney() {
    const draw = currentDraw(lastDraw);
    if (!draw?.fixtures?.length || !draw.fixtures.every(match => match.completed)) {
      throw new Error(ui("Championship omurgası yalnızca 78 grup maçı tamamlandıktan sonra resmîleştirilebilir.", "The Championship journey can be made official only after all 78 group matches are complete."));
    }
    const state = resolveJourney(createJourney(draw, true));
    await engine()?.saveChampionshipState?.(state, ui("Championship Journey resmîleştirildi.", "Championship Journey made official."));
  }

  async function saveSeriesMatch(seriesId, matchId, form) {
    const draw = currentDraw(lastDraw);
    const persisted = draft(app()?.getState?.()).championshipOS;
    if (!persisted || persisted.status === "preview") throw new Error(ui("Önce Championship Journey'yi resmîleştirin.", "Make the Championship Journey official first."));
    const state = resolveJourney(persisted);
    const series = findSeries(state, seriesId);
    const match = series?.matches?.find(item => item.id === matchId);
    if (!series || !match || !series.homeId || !series.awayId || match.notRequired) {
      throw new Error(ui("Bu maç henüz sonuç girişine hazır değil.", "This match is not ready for result entry."));
    }
    if (match.completed && downstreamSeries(state, seriesId).some(item => item.matches.some(game => game.completed))) {
      throw new Error(ui("Bu sonucu değiştirmek sonraki tamamlanmış serileri etkiler. Önce sonraki sonuçları temizleyin.", "Changing this result would affect completed downstream series. Clear the later results first."));
    }
    const homeScore = Number(form.homeScore);
    const awayScore = Number(form.awayScore);
    const homeTeam = String(form.homeTeam || "").trim();
    const awayTeam = String(form.awayTeam || "").trim();
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore === awayScore) {
      throw new Error(ui("Eleme maçında eşit olmayan geçerli skor girin.", "Enter a valid non-tied knockout score."));
    }
    const pool = teamPool(match.stars);
    if (!pool.includes(homeTeam) || !pool.includes(awayTeam)) {
      throw new Error(ui(`${match.stars}★ resmî takım havuzundan iki takım seçin.`, `Select both teams from the official ${match.stars}★ pool.`));
    }
    const homeUsed = usedTeamsForPlayer(draw, state, series.homeId, match.id);
    const awayUsed = usedTeamsForPlayer(draw, state, series.awayId, match.id);
    if (homeUsed.has(normalize(homeTeam)) || awayUsed.has(normalize(awayTeam))) {
      throw new Error(ui("Aynı takım bir oyuncu tarafından turnuva boyunca yalnızca bir kez kullanılabilir.", "A player may use the same team only once during the tournament."));
    }
    Object.assign(match, {
      completed: true, homeScore, awayScore, homeTeam, awayTeam,
      confirmation: { home: false, away: false, admin: true },
      updatedAt: nowISO()
    });
    const resolved = resolveJourney(state);
    resolved.updatedAt = nowISO();
    await engine()?.saveChampionshipState?.(resolved, ui(`${series.label} · Maç ${match.number} sonucu kaydedildi.`, `${series.label} · Match ${match.number} result saved.`));
  }

  async function clearSeriesMatch(seriesId, matchId) {
    const persisted = draft(app()?.getState?.()).championshipOS;
    const state = resolveJourney(persisted);
    const series = findSeries(state, seriesId);
    const match = series?.matches?.find(item => item.id === matchId);
    if (!match?.completed) return;
    if (downstreamSeries(state, seriesId).some(item => item.matches.some(game => game.completed))) {
      throw new Error(ui("Önce bu seriye bağlı sonraki tur sonuçlarını temizleyin.", "Clear the dependent later-round results first."));
    }
    Object.assign(match, {
      completed: false, homeScore: null, awayScore: null, homeTeam: "", awayTeam: "",
      confirmation: { home: false, away: false, admin: false }, updatedAt: nowISO()
    });
    const resolved = resolveJourney(state);
    resolved.updatedAt = nowISO();
    await engine()?.saveChampionshipState?.(resolved, ui("Championship maç sonucu temizlendi.", "Championship match result cleared."));
  }

  async function acknowledgeResult(seriesId, matchId, side) {
    const persisted = draft(app()?.getState?.()).championshipOS;
    const state = resolveJourney(persisted);
    const series = findSeries(state, seriesId);
    const match = series?.matches?.find(item => item.id === matchId);
    if (!match?.completed || !["home", "away"].includes(side)) return;
    match.confirmation ||= { home: false, away: false, admin: true };
    match.confirmation[side] = !match.confirmation[side];
    await engine()?.saveChampionshipState?.(state, ui("Oyuncu sonuç teyidi güncellendi.", "Player result acknowledgement updated."));
  }

  function pendingCountForPlayer(draw, playerId) {
    return (draw?.fixtures || []).filter(match => !match.completed && (String(match.homeId) === String(playerId) || String(match.awayId) === String(playerId))).length;
  }

  function clinchEngine(draw) {
    const table = drawStandings(draw);
    const bounds = table.map(row => {
      const remaining = pendingCountForPlayer(draw, row.id);
      const finalMatches = row.mp + remaining;
      return {
        ...row,
        remaining,
        finalMatches,
        minPpg: finalMatches ? row.pts / finalMatches : row.ppg,
        maxPpg: finalMatches ? (row.pts + remaining * 3) / finalMatches : row.ppg
      };
    });
    return bounds.map(row => {
      const bestRank = 1 + bounds.filter(other => other.id !== row.id && other.minPpg > row.maxPpg + 1e-9).length;
      const worstRank = 1 + bounds.filter(other => other.id !== row.id && other.maxPpg >= row.minPpg - 1e-9).length;
      let status = "alive";
      let label = ui("Bütün yollar açık", "All paths open");
      if (worstRank <= 4) { status = "direct"; label = ui("Doğrudan QF matematiksel garanti", "Direct QF mathematically clinched"); }
      else if (bestRank > 12) { status = "eliminated"; label = ui("Matematiksel olarak elendi", "Mathematically eliminated"); }
      else if (worstRank <= 12) { status = "playin"; label = ui("En az Play-in matematiksel garanti", "At least Play-in mathematically clinched"); }
      else if (bestRank > 4) { status = "no-direct"; label = ui("Doğrudan QF artık mümkün değil", "Direct QF no longer possible"); }
      return { ...row, bestRank, worstRank, status, label };
    });
  }

  function requiredResultRows(draw) {
    const table = drawStandings(draw);
    const target = table[3]?.ppg || 0;
    return table.map(row => {
      const remaining = pendingCountForPlayer(draw, row.id);
      const finalMatches = row.mp + remaining;
      const requiredAdditional = Math.max(0, Math.ceil((target + 0.001) * finalMatches - row.pts - 1e-9));
      const combinations = [];
      for (let wins = 0; wins <= remaining; wins += 1) {
        for (let draws = 0; draws <= remaining - wins; draws += 1) {
          if (wins * 3 + draws >= requiredAdditional) combinations.push({ wins, draws, losses: remaining - wins - draws, points: wins * 3 + draws });
        }
      }
      combinations.sort((a, b) => a.wins - b.wins || a.draws - b.draws || a.points - b.points);
      return {
        ...row, remaining, finalMatches, targetPpg: target,
        requiredAdditional, reachable: requiredAdditional <= remaining * 3,
        minimumRoute: combinations[0] || null
      };
    });
  }

  function simulateFixtureOutcome(draw, fixture, outcome) {
    const clone = deepClone(draw);
    const target = clone.fixtures.find(match => match.id === fixture.id);
    if (!target) return drawStandings(clone);
    target.completed = true;
    target.homeScore = outcome === "home" ? 2 : outcome === "away" ? 0 : 1;
    target.awayScore = outcome === "away" ? 2 : outcome === "home" ? 0 : 1;
    return drawStandings(clone);
  }

  function dependencyNetwork(draw) {
    const base = drawStandings(draw);
    const baseMap = new Map(base.map(row => [row.id, row]));
    return (draw?.fixtures || []).filter(match => !match.completed).map(match => {
      const outcomes = ["home", "draw", "away"].map(outcome => simulateFixtureOutcome(draw, match, outcome));
      const affected = new Set();
      let pathSwings = 0;
      let rankSwing = 0;
      base.forEach(row => {
        const ranks = outcomes.map(rows => rows.find(item => item.id === row.id)?.rank || row.rank);
        const paths = outcomes.map(rows => pathForRank(rows.find(item => item.id === row.id)?.rank || row.rank));
        const spread = Math.max(...ranks) - Math.min(...ranks);
        if (spread || new Set(paths).size > 1) affected.add(row.id);
        rankSwing += spread;
        if (new Set(paths).size > 1) pathSwings += 1;
      });
      const players = playerMap(draw);
      const rivalry = universe()?.buildUniverse?.()?.rivalries?.find(item => {
        const first = normalize(players.get(String(match.homeId))?.name);
        const second = normalize(players.get(String(match.awayId))?.name);
        return [normalize(item.playerA), normalize(item.playerB)].includes(first)
          && [normalize(item.playerA), normalize(item.playerB)].includes(second);
      });
      const importance = clamp(affected.size * 5 + pathSwings * 13 + rankSwing * 2 + (rivalry?.heat || 0) * 0.16);
      return {
        ...match,
        homeName: players.get(String(match.homeId))?.name || "–",
        awayName: players.get(String(match.awayId))?.name || "–",
        affected: affected.size,
        pathSwings,
        rankSwing,
        importance,
        baseHomeRank: baseMap.get(String(match.homeId))?.rank || 0,
        baseAwayRank: baseMap.get(String(match.awayId))?.rank || 0
      };
    }).sort((a, b) => b.importance - a.importance || a.sequence - b.sequence);
  }

  function lightweightForecast(draw, iterations = 240) {
    if (!draw?.participants?.length) return [];
    const baseTable = drawStandings(draw);
    const base = new Map(baseTable.map(row => [row.id, row]));
    const pending = (draw.fixtures || []).filter(match => !match.completed);
    const counts = new Map((draw.participants || []).map(player => [String(player.id), { direct: 0, top12: 0 }]));
    const random = seededRandom(hash(`${draw.drawId}:${draw.updatedAt}:${pending.length}:${iterations}`));
    for (let run = 0; run < iterations; run += 1) {
      const simulated = deepClone(draw);
      simulated.fixtures.filter(match => !match.completed).forEach(match => {
        const homeElo = Number(simulated.participants.find(player => String(player.id) === String(match.homeId))?.elo || 1500);
        const awayElo = Number(simulated.participants.find(player => String(player.id) === String(match.awayId))?.elo || 1500);
        const chance = logistic(homeElo - awayElo);
        const drawChance = 0.18;
        const roll = random();
        match.completed = true;
        if (roll < chance * (1 - drawChance)) { match.homeScore = 2; match.awayScore = random() < .28 ? 1 : 0; }
        else if (roll < chance * (1 - drawChance) + drawChance) { match.homeScore = 1; match.awayScore = 1; }
        else { match.homeScore = random() < .28 ? 1 : 0; match.awayScore = 2; }
      });
      drawStandings(simulated).forEach(row => {
        const count = counts.get(row.id);
        if (row.rank <= 4) count.direct += 1;
        if (row.rank <= 12) count.top12 += 1;
      });
    }
    return [...counts.entries()].map(([id, count]) => ({
      id,
      name: base.get(id)?.name || id,
      directPct: count.direct / iterations * 100,
      top12Pct: count.top12 / iterations * 100
    }));
  }

  function captureForecastSnapshot(nextPayload, previousPayload) {
    const nextDraft = draft(nextPayload);
    const nextDraw = nextDraft.draw;
    if (!nextDraw?.fixtures?.length) return;
    nextDraft.forecastLedger = Array.isArray(nextDraft.forecastLedger) ? nextDraft.forecastLedger : [];
    const completed = nextDraw.fixtures.filter(match => match.completed).length;
    const previousCompleted = draft(previousPayload).draw?.fixtures?.filter(match => match.completed).length ?? -1;
    const latest = nextDraft.forecastLedger[nextDraft.forecastLedger.length - 1];
    if (completed === previousCompleted || latest?.completed === completed) return;
    nextDraft.forecastLedger.push({
      id: `F10-FC-${Date.now().toString(36).toUpperCase()}`,
      at: nowISO(),
      completed,
      total: nextDraw.fixtures.length,
      predictions: lightweightForecast(nextDraw, 240)
    });
    if (nextDraft.forecastLedger.length > 90) nextDraft.forecastLedger.splice(0, nextDraft.forecastLedger.length - 90);
  }

  function calibration(payload, draw) {
    const ledger = draft(payload).forecastLedger || [];
    const actual = new Set(drawStandings(draw).slice(0, 4).map(row => row.id));
    const scores = [];
    ledger.forEach(snapshot => (snapshot.predictions || []).forEach(prediction => {
      const probability = Number(prediction.directPct || 0) / 100;
      const outcome = actual.has(String(prediction.id)) ? 1 : 0;
      scores.push(Math.pow(probability - outcome, 2));
    }));
    const brier = scores.length ? mean(scores) : null;
    return {
      snapshots: ledger.length,
      observations: scores.length,
      brier,
      quality: brier == null ? null : clamp((1 - brier) * 100),
      final: Boolean(draw?.fixtures?.every(match => match.completed)),
      latest: ledger[ledger.length - 1] || null
    };
  }

  function passUrl(playerId) {
    const url = new URL(location.href);
    url.searchParams.set("fifa9build", BUILD);
    url.searchParams.set("fifa10pass", String(playerId || ""));
    url.hash = "";
    return url.toString();
  }

  function qrSvg(value, title) {
    if (typeof window.qrcode !== "function") return "";
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(value, "Byte");
      qr.make();
      return qr.createSvgTag(3, 2, undefined, title);
    } catch (_) {
      return "";
    }
  }

  function playerPassData(payload, draw, playerRef = selectedPassPlayer) {
    const players = draw?.participants || [];
    const player = players.find(item => String(item.id) === String(playerRef) || normalize(item.name) === normalize(playerRef)) || players[0];
    if (!player) return null;
    selectedPassPlayer = String(player.id);
    const table = drawStandings(draw);
    const standing = table.find(row => row.id === String(player.id));
    const clinch = clinchEngine(draw).find(row => row.id === String(player.id));
    const pending = (draw.fixtures || []).filter(match => !match.completed && (String(match.homeId) === String(player.id) || String(match.awayId) === String(player.id)));
    const used = usedTeamsForPlayer(draw, journeyState(payload, draw), player.id);
    const next = pending[0] || null;
    const opponentId = next ? (String(next.homeId) === String(player.id) ? next.awayId : next.homeId) : null;
    const opponent = players.find(item => String(item.id) === String(opponentId));
    const qualification = universe()?.qualificationProbability?.(draw, universe()?.buildUniverse?.(payload, draw), 360)?.rows
      ?.find(row => String(row.id) === String(player.id));
    return {
      player, standing, clinch, pending, next, opponent, used,
      qualification,
      url: passUrl(player.id),
      qr: qrSvg(passUrl(player.id), `${player.name} · FIFA 10 Match Pass`)
    };
  }

  function universalRatings(data) {
    return (data?.players || []).map(player => {
      const components = {
        ppr: (player.ppr - 50) * .44,
        pressure: (player.pressureScore - 50) * .18,
        prime: (player.prime.score - 50) * .15,
        versatility: (player.versatility - 50) * .10,
        pae: clamp(player.pae, -25, 25) * .16,
        legacy: (player.legacy - 50) * .05
      };
      const rating = clamp(50 + Object.values(components).reduce((sum, value) => sum + value, 0));
      const uncertainty = clamp(22 / Math.sqrt(player.games + 3), 2.2, 10);
      return {
        ...player,
        universalRating: rating,
        lower: clamp(rating - uncertainty),
        upper: clamp(rating + uncertainty),
        uncertainty,
        evidence: player.games / (player.games + 12) * 100,
        components
      };
    }).sort((a, b) => b.universalRating - a.universalRating || b.games - a.games);
  }

  function ratingExplanation(rating) {
    if (!rating) return [];
    const names = {
      ppr: "PPR", pressure: "Pressure DNA", prime: "Prime Finder",
      versatility: ui("Çok Yönlülük", "Versatility"), pae: "PAE", legacy: "Legacy"
    };
    return Object.entries(rating.components).map(([key, value]) => ({
      key, label: names[key], value,
      copy: value >= 0
        ? ui("rating değerini yükseltiyor", "raises the rating")
        : ui("rating değerini aşağı çekiyor", "reduces the rating")
    })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  }

  function chemistryMatrix(data, playerName) {
    const player = data?.playerMap?.get(normalize(playerName)) || data?.players?.find(item => normalize(item.name) === normalize(playerName));
    if (!player) return [];
    const rows = new Map();
    (data.matches || []).forEach(match => {
      const home = normalize(match.homeName) === player.key;
      const away = normalize(match.awayName) === player.key;
      if (!home && !away) return;
      const team = String(home ? match.homeTeam : match.awayTeam).trim();
      if (!team) return;
      const stars = Number(match.stars || 0);
      const key = `${stars}:${normalize(team)}`;
      if (!rows.has(key)) rows.set(key, { key, team, stars, games: 0, points: 0, gf: 0, ga: 0 });
      const row = rows.get(key);
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      row.games += 1;
      row.points += resultPoints(homeScore, awayScore, home ? "home" : "away");
      row.gf += home ? homeScore : awayScore;
      row.ga += home ? awayScore : homeScore;
    });
    const globalTeams = new Map((data.teams || []).map(team => [team.key, team]));
    return [...rows.values()].map(row => {
      const adjustedPpg = (row.points + 1.5 * 5) / (row.games + 5);
      const teamEvidence = globalTeams.get(row.key);
      const expected = player.ppg * .55 + (teamEvidence?.bayesianPPG || 1.5) * .45;
      const synergy = clamp(50 + (adjustedPpg - expected) * 25);
      return {
        ...row,
        ppg: row.points / row.games,
        adjustedPpg,
        gdPerMatch: (row.gf - row.ga) / row.games,
        synergy,
        confidence: row.games / (row.games + 5) * 100
      };
    }).sort((a, b) => b.synergy - a.synergy || b.games - a.games);
  }

  function eraNormalization(data) {
    const difficulty = new Map((data?.editions || []).map(edition => [edition.edition, edition.difficulty]));
    const baseline = mean([...difficulty.values()]) || 50;
    return (data?.players || []).map(player => {
      const totalGames = player.editions.reduce((sum, edition) => sum + edition.games, 0);
      const playerDifficulty = totalGames
        ? player.editions.reduce((sum, edition) => sum + (difficulty.get(edition.edition) || baseline) * edition.games, 0) / totalGames
        : baseline;
      const factor = clamp(baseline / Math.max(20, playerDifficulty), .82, 1.18);
      const normalizedLegacy = clamp(player.legacy * factor);
      return { ...player, playerDifficulty, eraFactor: factor, normalizedLegacy };
    }).sort((a, b) => b.normalizedLegacy - a.normalizedLegacy || b.legacy - a.legacy);
  }

  function dynastyEngine(data) {
    const honours = (data?.honours || []).filter(item => item.competition === "oruc" && item.winner).sort((a, b) => a.edition - b.edition);
    const streaks = [];
    honours.forEach(record => {
      const previous = streaks[streaks.length - 1];
      if (previous && normalize(previous.player) === normalize(record.winner) && record.edition === previous.endEdition + 1) {
        previous.endEdition = record.edition;
        previous.titles += 1;
      } else {
        streaks.push({ player: record.winner, startEdition: record.edition, endEdition: record.edition, titles: 1 });
      }
    });
    const leaders = (data?.editions || []).map(edition => {
      const time = universe()?.timeMachine?.(data, edition.edition);
      return { edition: edition.edition, leader: time?.players?.[0]?.name || "", score: time?.players?.[0]?.legacy || 0 };
    }).filter(item => item.leader);
    const transitions = leaders.filter((item, index) => index > 0 && normalize(item.leader) !== normalize(leaders[index - 1].leader))
      .map((item, index) => {
        const prior = leaders.find(row => row.edition < item.edition && normalize(row.leader) !== normalize(item.leader));
        return { edition: item.edition, from: prior?.leader || "–", to: item.leader, score: item.score, index };
      });
    return { streaks: streaks.sort((a, b) => b.titles - a.titles || a.startEdition - b.startEdition), leaders, transitions };
  }

  function hallOfFame(data) {
    const rivalryKeys = new Set((data?.rivalries || []).filter(row => row.heat >= 65).flatMap(row => [normalize(row.playerA), normalize(row.playerB)]));
    return (data?.players || []).map(player => {
      let tier = "";
      let reason = "";
      if (player.titles >= 3 || player.legacy >= 86) { tier = "IMMORTAL"; reason = ui("Üç şampiyonluk veya 86+ Legacy", "Three titles or 86+ Legacy"); }
      else if (player.titles >= 2 || player.legacy >= 75) { tier = "LEGEND"; reason = ui("İki şampiyonluk veya 75+ Legacy", "Two titles or 75+ Legacy"); }
      else if (player.titles >= 1 && (player.legacy >= 60 || player.prime.score >= 70)) { tier = "ICON"; reason = ui("Şampiyonluk ve elit kariyer kanıtı", "A title plus elite career evidence"); }
      else if (player.legacy >= 62 || player.prime.score >= 78) { tier = "ELITE"; reason = ui("62+ Legacy veya 78+ Prime", "62+ Legacy or 78+ Prime"); }
      else if (rivalryKeys.has(player.key) || player.pressureScore >= 68) { tier = "CULT HERO"; reason = ui("Büyük rekabet veya baskı mirası", "Major rivalry or pressure legacy"); }
      return tier ? { ...player, tier, reason } : null;
    }).filter(Boolean).sort((a, b) => {
      const order = ["IMMORTAL", "LEGEND", "ICON", "ELITE", "CULT HERO"];
      return order.indexOf(a.tier) - order.indexOf(b.tier) || b.legacy - a.legacy;
    });
  }

  function counterfactual(draw, matchId = selectedCounterfactualMatch, outcome = selectedCounterfactualOutcome) {
    const completed = (draw?.fixtures || []).filter(match => match.completed);
    const match = completed.find(item => item.id === matchId) || completed[0];
    if (!match) return { match: null, official: [], simulated: [], impact: [] };
    selectedCounterfactualMatch = match.id;
    selectedCounterfactualOutcome = ["reverse", "home", "draw", "away"].includes(outcome) ? outcome : "reverse";
    const clone = deepClone(draw);
    const target = clone.fixtures.find(item => item.id === match.id);
    if (selectedCounterfactualOutcome === "reverse") {
      if (Number(match.homeScore) === Number(match.awayScore)) { target.homeScore = 2; target.awayScore = 1; }
      else { target.homeScore = match.awayScore; target.awayScore = match.homeScore; }
    } else if (selectedCounterfactualOutcome === "home") { target.homeScore = 2; target.awayScore = 0; }
    else if (selectedCounterfactualOutcome === "away") { target.homeScore = 0; target.awayScore = 2; }
    else { target.homeScore = 1; target.awayScore = 1; }
    const official = drawStandings(draw);
    const simulated = drawStandings(clone);
    const simulatedMap = new Map(simulated.map(row => [row.id, row]));
    const impact = official.map(row => {
      const next = simulatedMap.get(row.id);
      return {
        id: row.id, name: row.name,
        fromRank: row.rank, toRank: next?.rank || row.rank,
        fromPath: row.path, toPath: next?.path || row.path,
        ppgDelta: (next?.ppg || row.ppg) - row.ppg,
        changed: row.rank !== next?.rank || row.path !== next?.path
      };
    }).filter(row => row.changed).sort((a, b) => Math.abs(b.fromRank - b.toRank) - Math.abs(a.fromRank - a.toRank));
    return { match, official, simulated, impact, outcome: selectedCounterfactualOutcome };
  }

  function seasonBookHtml(payload, draw, journey, data) {
    const players = playerMap(draw);
    const table = drawStandings(draw);
    const completed = (draw?.fixtures || []).filter(match => match.completed);
    const championshipMatches = allSeries(journey).flatMap(series => series.matches.map(match => ({ ...match, series }))).filter(match => match.completed);
    const champion = players.get(String(journey.championId))?.name || ui("Henüz belirlenmedi", "Not decided yet");
    return `<!doctype html><html lang="${window.FIFA_I18N?.language === "en" ? "en" : "tr"}"><head><meta charset="utf-8"><title>FIFA 10 · Season Chronicle</title><style>body{font-family:Arial;margin:40px;color:#10182d}h1{font-size:42px}h2{margin-top:36px;border-bottom:3px solid #182a5b;padding-bottom:8px}.hero{padding:28px;background:#07132f;color:white}.hero b{color:#e1b94e}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #ccd3e2;text-align:left}.badge{display:inline-block;padding:6px 9px;margin:3px;background:#e8eefb}small{color:#61708c}@media print{body{margin:15mm}}</style></head><body><section class="hero"><small>ORUÇ REİS FOOTBALL UNIVERSE · OFFICIAL SEASON CHRONICLE</small><h1>FIFA 10</h1><h2>${ui("Şampiyon", "Champion")}: <b>${esc(champion)}</b></h2><p>${completed.length}/${draw?.fixtures?.length || 78} ${ui("grup maçı", "group matches")} · ${championshipMatches.length} ${ui("eleme maçı", "knockout matches")}</p></section><h2>${ui("Genel Sıralama", "Overall Standings")}</h2><table><thead><tr><th>#</th><th>${ui("Oyuncu", "Player")}</th><th>MP</th><th>PPG</th><th>GD/M</th><th>${ui("Yol", "Path")}</th></tr></thead><tbody>${table.map(row => `<tr><td>${row.rank}</td><td>${esc(row.name)}</td><td>${row.mp}</td><td>${row.ppg.toFixed(3)}</td><td>${row.gdPerMatch.toFixed(3)}</td><td>${esc(pathLabel(row.rank))}</td></tr>`).join("")}</tbody></table><h2>Championship Journey</h2>${ROUND_ORDER.map(round => `<h3>${round.toUpperCase()}</h3><div>${(journey.rounds?.[round] || []).map(series => `<span class="badge">${esc(players.get(String(series.homeId))?.name || "TBD")} ${series.homeWins || 0}–${series.awayWins || 0} ${esc(players.get(String(series.awayId))?.name || "TBD")}</span>`).join("")}</div>`).join("")}<h2>Football Universe Intelligence</h2><p>${data?.matches?.length || 0} ${ui("tüm zamanlar maçı", "all-time matches")} · ${data?.players?.length || 0} ${ui("oyuncu", "players")} · ${data?.editions?.length || 0} ${ui("edisyon", "editions")}</p><footer><small>Generated by FIFA Championship OS V${VERSION} · ${new Date().toLocaleString()}</small></footer></body></html>`;
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function playerName(draw, id) {
    return playerMap(draw).get(String(id))?.name || ui("Bekleniyor", "TBD");
  }

  function moduleBadge(title, text) {
    return `<article><span>${esc(title)}</span><small>${esc(text)}</small></article>`;
  }

  function renderBracketSeries(draw, series) {
    const home = playerName(draw, series.homeId);
    const away = playerName(draw, series.awayId);
    const waiting = !series.homeId || !series.awayId;
    const completedMatches = (series.matches || []).filter(match => match.completed && !match.notRequired);
    const nextMatch = (series.matches || []).find(match => !match.completed && !match.notRequired);
    return `<article class="fco-bracket-series status-${series.status}">
      <header><span>${esc(series.label)}</span><b>${series.bestOf === 3 ? "BO3" : "1 MATCH"}</b></header>
      <div><strong>${esc(home)}</strong><b>${series.homeWins || 0}<i>–</i>${series.awayWins || 0}</b><strong>${esc(away)}</strong></div>
      <footer>${waiting ? `<span>${ui("Önceki tur bekleniyor", "Waiting for prior round")}</span>` : series.winnerId ? `<span>${ui("Kazanan", "Winner")}: <b>${esc(playerName(draw, series.winnerId))}</b></span>` : nextMatch ? `<span>${nextMatch.stars}★ · M${nextMatch.number} · ${ui("Sonuç bekleniyor", "Result pending")}</span>` : `<span>${completedMatches.length} ${ui("maç işlendi", "matches recorded")}</span>`}</footer>
    </article>`;
  }

  function officialStandings(state, draw) {
    const live = drawStandings(draw);
    if (!Array.isArray(state?.seedSnapshot) || !state.seedSnapshot.length) return live;
    const liveById = new Map(live.map(row => [String(row.id), row]));
    return state.seedSnapshot.map(seed => ({ ...liveById.get(String(seed.id)), ...seed, rank: Number(seed.rank) })).filter(row => row.id);
  }

  function activeOperationalSeries(state) {
    for (const round of ROUND_ORDER) {
      const ready = (state.rounds?.[round] || []).filter(series => series.homeId && series.awayId && series.status !== "completed");
      if (ready.length) return ready;
    }
    return [];
  }

  function renderOfficialStandings(state, draw) {
    const rows = officialStandings(state, draw);
    return `<section class="fco-official-standings" id="championshipOfficialStandings"><header><div><span>FIFA 10 · OFFICIAL GROUP LEAGUE TABLE</span><h4>${ui("Resmî Puan Tablosu", "Official Standings")}</h4><p>${ui("Eleme seribaşları bu mühürlenmiş sıralamaya göre belirlenmiştir.", "Knockout seeds are based on this sealed table.")}</p></div><b>${rows.length} ${ui("OYUNCU", "PLAYERS")}</b></header><div class="fco-table-wrap"><table><thead><tr><th>#</th><th>${ui("Oyuncu", "Player")}</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>PPG</th><th>${ui("Yol", "Path")}</th></tr></thead><tbody>${rows.map(row => `<tr class="path-${pathForRank(row.rank)}"><td><b>${row.rank}</b></td><td><strong>${esc(row.name)}</strong></td><td>${row.mp ?? "–"}</td><td>${row.w ?? "–"}</td><td>${row.d ?? "–"}</td><td>${row.l ?? "–"}</td><td>${row.gf ?? "–"}</td><td>${row.ga ?? "–"}</td><td>${Number(row.gd ?? ((row.gf || 0)-(row.ga || 0))) > 0 ? "+" : ""}${row.gd ?? ((row.gf || 0)-(row.ga || 0))}</td><td>${row.pts ?? "–"}</td><td>${Number(row.ppg || 0).toFixed(3)}</td><td><span>${esc(pathLabel(row.rank))}</span></td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function renderJourney(payload, draw) {
    const state = journeyState(payload, draw);
    const locked = state.status !== "preview";
    const groupComplete = Boolean(draw?.fixtures?.length && draw.fixtures.every(match => match.completed));
    const admin = Boolean(app()?.isAdmin?.() || app()?.canEdit?.());
    const roundTitle = {
      playin: "CHAMPIONSHIP PLAY-IN · BEST OF 3",
      quarterfinal: ui("ÇEYREK FİNAL · BEST OF 3", "QUARTER-FINAL · BEST OF 3"),
      semifinal: ui("YARI FİNAL · BEST OF 3", "SEMI-FINAL · BEST OF 3"),
      bronze: ui("ÜÇÜNCÜLÜK · 4.5★", "THIRD PLACE · 4.5★"),
      final: ui("BÜYÜK FİNAL · 5★", "GRAND FINAL · 5★")
    };
    const operational = activeOperationalSeries(state);
    const completedKnockout = allSeries(state).flatMap(series => series.matches || []).filter(match => match.completed).length;
    return `<section class="fco-panel championship-frontline" data-fco-panel="command">
      <section class="fco-frontline-status"><div><span>FIFA 10 · CHAMPIONSHIP FRONTLINE</span><h3>${ui("Elemeler başladı.", "Knockouts are live.")} <em>${ui("Maçlar burada yönetilir.", "Matches are operated here.")}</em></h3><p>${locked ? ui("Resmî eleme ağacı mühürlendi. Sonuç girildikçe kazananlar otomatik sonraki tura taşınır.", "The official bracket is sealed. Winners advance automatically as results are entered.") : ui("Grup ligi tamamlandı. Resmî eleme ağacını başlatmak için Championship'i mühürleyin.", "The group league is complete. Seal the Championship to start the official bracket.")}</p></div><aside><b>${completedKnockout}</b><small>${ui("ELEME MAÇI İŞLENDİ", "KNOCKOUT MATCHES RECORDED")}</small><button type="button" data-fco-action="open-player-result-desk">${ui("OYUNCU SONUÇ MASASI", "PLAYER RESULT DESK")} ↗</button></aside></section>

      <section class="fco-match-operations" id="championshipMatchOperations"><header><div><span>01 · MATCH OPERATIONS</span><h4>${ui("Maçlar ve Sonuç Girişi", "Matches & Result Entry")}</h4><p>${ui("Aktif turdaki oynanabilir seriler en önde. Yönetici burada doğrudan kaydeder; oyuncular Çıktı Merkezi'nden karşılıklı teyitle gönderebilir.", "Playable series in the active round come first. Admins record here; players submit with mutual confirmation from the Print Centre.")}</p></div><b>${operational.length} ${ui("AKTİF SERİ", "ACTIVE SERIES")}</b></header>
        ${!locked ? `<div class="fco-frontline-lock"><strong>${ui("Resmî eleme ağacı henüz oluşturulmadı.", "The official bracket has not been created yet.")}</strong>${admin ? `<button type="button" data-fco-action="lock-journey" ${groupComplete ? "" : "disabled"}>${ui("ELEMELERİ RESMÎLEŞTİR", "MAKE KNOCKOUTS OFFICIAL")}</button>` : `<span>${ui("Yönetici girişi bekleniyor.", "Waiting for administrator.")}</span>`}</div>` : operational.length ? `<div class="fco-operation-grid">${operational.map(series => renderSeries(draw, state, series, admin)).join("")}</div>` : state.championId ? `<div class="fco-operation-complete"><strong>${ui("Turnuva tamamlandı.", "Tournament complete.")}</strong><span>FIFA 10 Champion · ${esc(playerName(draw, state.championId))}</span></div>` : `<div class="fco-operation-complete"><strong>${ui("Aktif tur tamamlandı.", "The active round is complete.")}</strong><span>${ui("Sonraki eşleşmeler otomatik çözülüyor.", "The next pairings are being resolved automatically.")}</span></div>`}
      </section>

      <section class="fco-live-bracket" id="championshipLiveBracket"><header><div><span>02 · LIVE TOURNAMENT TREE</span><h4>${ui("Canlı Turnuva Ağacı", "Live Tournament Bracket")}</h4><p>${ui("Play-In'den Büyük Final'e bütün yol tek ekranda.", "The complete route from Play-In to the Grand Final.")}</p></div><b>${locked ? ui("RESMÎ", "OFFICIAL") : ui("ÖNİZLEME", "PREVIEW")}</b></header><div class="fco-bracket compact">${ROUND_ORDER.map(round => `<section class="round-${round}"><header><span>${roundTitle[round]}</span><b>${(state.rounds?.[round] || []).length}</b></header><div>${(state.rounds?.[round] || []).map(series => renderBracketSeries(draw, series)).join("")}</div></section>`).join("")}</div></section>

      ${renderOfficialStandings(state, draw)}

      <div class="fco-module-strip frontline-secondary">
        ${moduleBadge("CHAMPIONSHIP JOURNEY OS", ui("Play-in'den kupaya otomatik omurga", "Automatic journey from Play-in to the trophy"))}
        ${moduleBadge("BEST-OF-3 SERIES ENGINE", "4★ → 4.5★ → 5★")}
        ${moduleBadge("TEAM PASSPORT GUARD", ui("Turnuva boyunca takım tekrarı yok", "No player team repeats across the tournament"))}
        ${moduleBadge("PLAYER RESULT DESK", ui("İki oyuncu teyidiyle güvenli sonuç", "Secure result with two-player confirmation"))}
      </div>
      ${state.championId ? `<section class="fco-champion"><span>FIFA 10 CHAMPION</span><strong>${esc(playerName(draw, state.championId))}</strong><small>${ui("Şampiyonluk omurgası tamamlandı", "Championship journey complete")}</small></section>` : ""}
    </section>`;
  }

  function renderTeamOptions(draw, state, series, match, side) {
    const playerId = side === "home" ? series.homeId : series.awayId;
    const current = side === "home" ? match.homeTeam : match.awayTeam;
    const used = usedTeamsForPlayer(draw, state, playerId, match.id);
    const options = teamPool(match.stars).filter(team => !used.has(normalize(team)) || normalize(team) === normalize(current));
    return `<option value="">${ui("Takım seç", "Select team")}</option>${options.map(team => `<option value="${esc(team)}" ${team === current ? "selected" : ""}>${esc(team)}</option>`).join("")}`;
  }

  function renderSeries(draw, state, series, editable) {
    const home = playerName(draw, series.homeId);
    const away = playerName(draw, series.awayId);
    const waiting = !series.homeId || !series.awayId;
    return `<article class="fco-series status-${series.status}"><header><span>${esc(series.label)}</span><b>${series.bestOf === 3 ? "BO3" : "1 MATCH"}</b></header><div class="fco-series-score"><strong>${esc(home)}</strong><b>${series.homeWins || 0}<i>–</i>${series.awayWins || 0}</b><strong>${esc(away)}</strong></div><div class="fco-series-matches">${series.matches.map(match => {
      if (match.notRequired) return `<div class="not-required"><span>${match.stars}★</span><small>${ui("Gerekmedi", "Not required")}</small></div>`;
      return `<div class="${match.completed ? "completed" : ""}" data-series-id="${series.id}" data-match-id="${match.id}"><span>${match.stars}★ · M${match.number}</span>${waiting ? `<small>${ui("Önceki tur bekleniyor", "Waiting for prior round")}</small>` : editable ? `<div class="fco-match-entry"><select name="homeTeam">${renderTeamOptions(draw, state, series, match, "home")}</select><input name="homeScore" type="number" min="0" inputmode="numeric" value="${match.completed ? match.homeScore : ""}" aria-label="${esc(home)} score"><b>–</b><input name="awayScore" type="number" min="0" inputmode="numeric" value="${match.completed ? match.awayScore : ""}" aria-label="${esc(away)} score"><select name="awayTeam">${renderTeamOptions(draw, state, series, match, "away")}</select><button type="button" data-fco-action="save-series-match">${match.completed ? ui("GÜNCELLE", "UPDATE") : ui("KAYDET", "SAVE")}</button>${match.completed ? `<button type="button" class="danger" data-fco-action="clear-series-match">${ui("SİL", "CLEAR")}</button>` : ""}</div>${match.completed ? `<div class="fco-confirmations"><button type="button" class="${match.confirmation?.home ? "confirmed" : ""}" data-fco-action="ack-result" data-side="home">✓ ${esc(home)}</button><button type="button" class="${match.confirmation?.away ? "confirmed" : ""}" data-fco-action="ack-result" data-side="away">✓ ${esc(away)}</button><b>${match.confirmation?.home && match.confirmation?.away ? ui("İKİ OYUNCU TEYİT ETTİ", "BOTH PLAYERS ACKNOWLEDGED") : ui("TEYİT BEKLENİYOR", "ACKNOWLEDGEMENT PENDING")}</b></div>` : ""}` : match.completed ? `<strong>${match.homeScore}–${match.awayScore}</strong>` : `<small>${ui("Sonuç bekleniyor", "Result pending")}</small>`}</div>`;
    }).join("")}</div>${series.winnerId ? `<footer><span>${ui("KAZANAN", "WINNER")}</span><strong>${esc(playerName(draw, series.winnerId))}</strong></footer>` : ""}</article>`;
  }

  function renderStakes(draw) {
    const clinch = clinchEngine(draw);
    const required = new Map(requiredResultRows(draw).map(row => [row.id, row]));
    const dependencies = dependencyNetwork(draw);
    return `<section class="fco-panel" data-fco-panel="stakes">
      <div class="fco-module-strip">
        ${moduleBadge("MATHEMATICAL CLINCH ENGINE", ui("Olasılık değil, güvenli matematiksel sertifika", "Safe mathematical certification, not probability"))}
        ${moduleBadge("REQUIRED RESULT CALCULATOR", ui("Gerekli minimum sonuç yolu", "Minimum required result route"))}
        ${moduleBadge("RESULT DEPENDENCY NETWORK", ui("Bir maçın tüm tabloya zincir etkisi", "Chain impact of one match on the table"))}
        ${moduleBadge("MATCH IMPORTANCE RADAR", ui("Sıradaki en değerli maç", "The most valuable next match"))}
      </div>
      <section class="fco-clinch"><header><div><span>MATHEMATICAL CLINCH ENGINE</span><h4>${ui("Kesin Yol Sertifikaları", "Definitive Path Certificates")}</h4><p>${ui("Muhafazakâr alt/üst PPG sınırları kullanılır; sistem kesin olmayan durumu garanti olarak göstermez.", "Conservative lower/upper PPG bounds are used; uncertain states are never shown as clinched.")}</p></div><b>PPG BOUNDS</b></header><div class="fco-table-wrap"><table><thead><tr><th>#</th><th>${ui("Oyuncu", "Player")}</th><th>PPG</th><th>${ui("Kalan", "Left")}</th><th>MIN</th><th>MAX</th><th>${ui("En İyi", "Best")}</th><th>${ui("En Kötü", "Worst")}</th><th>${ui("Sertifika", "Certificate")}</th></tr></thead><tbody>${clinch.map(row => `<tr class="status-${row.status}"><td>${row.rank}</td><td><strong>${esc(row.name)}</strong></td><td>${row.ppg.toFixed(3)}</td><td>${row.remaining}</td><td>${row.minPpg.toFixed(3)}</td><td>${row.maxPpg.toFixed(3)}</td><td>#${row.bestRank}</td><td>#${row.worstRank}</td><td><b>${esc(row.label)}</b></td></tr>`).join("")}</tbody></table></div></section>
      <div class="fco-stakes-grid"><section><header><div><span>REQUIRED RESULT CALCULATOR</span><h4>${ui("Canlı İlk 4 Hedefi", "Live Top-4 Target")}</h4></div><b>${drawStandings(draw)[3]?.ppg.toFixed(3) || "0.000"} PPG</b></header><div>${clinch.map(row => {
        const route = required.get(row.id);
        return `<article><strong>${esc(row.name)}</strong><span>${route.remaining} ${ui("maç kaldı", "matches left")}</span><b>${route.reachable ? route.minimumRoute ? `${route.minimumRoute.wins}W · ${route.minimumRoute.draws}D · ${route.minimumRoute.losses}L` : ui("Hedefte", "On target") : ui("Bu hedefe ulaşamaz", "Target unreachable")}</b><small>+${route.requiredAdditional} ${ui("puan gerekir", "points required")}</small></article>`;
      }).join("")}</div></section><section><header><div><span>MATCH IMPORTANCE RADAR</span><h4>${ui("Turnuvayı En Çok Değiştiren Maçlar", "Matches That Can Change the Tournament Most")}</h4></div><b>TOP 12</b></header><div>${dependencies.slice(0, 12).map((match, index) => `<article><i>${index + 1}</i><div><strong>${esc(match.homeName)} <span>VS</span> ${esc(match.awayName)}</strong><small>${match.stars}★ · ${ui("Grup", "Group")} ${match.group} · ${match.affected} ${ui("oyuncu etkileniyor", "players affected")} · ${match.pathSwings} ${ui("yol değişimi", "path swings")}</small></div><b>${match.importance.toFixed(0)}</b></article>`).join("") || `<p>${ui("Bekleyen grup maçı yok.", "No pending group fixtures.")}</p>`}</div></section></div>
    </section>`;
  }

  function renderTrust(payload, draw) {
    const blackBox = [...(draft(payload).blackBox || [])].reverse();
    const calibrationData = calibration(payload, draw);
    return `<section class="fco-panel" data-fco-panel="trust">
      <div class="fco-module-strip">
        ${moduleBadge("TOURNAMENT BLACK BOX", ui("Hash zincirli geri yükleme noktaları", "Hash-chained recovery points"))}
        ${moduleBadge("ANALYTICS TRUST LAYER", ui("Kaynak, örneklem ve formül sürümü", "Source, sample and formula version"))}
        ${moduleBadge("FORECAST CALIBRATION CENTRE", ui("Model kendi doğruluğunu ölçer", "The model measures its own accuracy"))}
      </div>
      <section class="fco-trust-hero"><div><span>TOURNAMENT BLACK BOX</span><h4>${ui("Turnuvanın Hash Zincirli Operasyon Günlüğü", "The Tournament's Hash-Chained Flight Recorder")}</h4><p>${ui("Her resmî güncelleme cihaz, zaman, önceki hash ve geri yüklenebilir anlık görüntüyle saklanır.", "Every official update is stored with device, time, previous hash and a recoverable snapshot.")}</p></div><article><span>${ui("Kayıt", "Events")}</span><b>${blackBox.length}</b></article><article><span>${ui("Son Hash", "Latest Hash")}</span><b>${blackBox[0]?.hash || "–"}</b></article><button type="button" data-fco-action="export-black-box">${ui("BLACK BOX YEDEĞİNİ İNDİR", "DOWNLOAD BLACK BOX BACKUP")}</button></section>
      <div class="fco-trust-grid"><section class="fco-black-box"><header><div><span>RECOVERY LEDGER</span><h4>${ui("Geri Yükleme Noktaları", "Recovery Points")}</h4></div><b>${ui("SON 40", "LATEST 40")}</b></header><div>${blackBox.slice(0, 40).map((event, index) => `<article><i>${index + 1}</i><div><strong>${esc(event.reason)}</strong><small>${new Date(event.at).toLocaleString()} · ${esc(event.deviceId)} · ${event.groupResults} GROUP · ${event.championshipResults} KO</small><code>${event.previousHash || "ORIGIN"} → ${event.hash}</code></div>${app()?.isAdmin?.() ? `<button type="button" data-fco-action="restore-black-box" data-event-id="${event.id}">${ui("GERİ YÜKLE", "RESTORE")}</button>` : ""}</article>`).join("") || `<p>${ui("İlk resmî değişiklikten sonra kayıt oluşacak.", "The first event will appear after an official change.")}</p>`}</div></section><section class="fco-calibration"><header><div><span>FORECAST CALIBRATION CENTRE</span><h4>${ui("Tahmin Motorunun Sağlığı", "Forecast Engine Health")}</h4></div><b>${calibrationData.final ? "FINAL" : "PROVISIONAL"}</b></header><div class="fco-calibration-score"><strong>${calibrationData.quality == null ? "–" : calibrationData.quality.toFixed(1)}</strong><span>${ui("KALİBRASYON SAĞLIĞI", "CALIBRATION HEALTH")}</span><small>${calibrationData.brier == null ? ui("Yeni sonuçlarla ölçüm başlayacak.", "Measurement begins with new results.") : `Brier ${calibrationData.brier.toFixed(4)}`}</small></div><div class="fco-trust-metrics"><article><span>${ui("Tahmin Anı", "Snapshots")}</span><b>${calibrationData.snapshots}</b></article><article><span>${ui("Gözlem", "Observations")}</span><b>${calibrationData.observations}</b></article><article><span>${ui("Durum", "Status")}</span><b>${calibrationData.final ? ui("Nihai", "Final") : ui("Canlı", "Live")}</b></article></div><p>${ui("Kalibrasyon FIFA 10 sonuçları geldikçe oluşur. Grup aşaması bitmeden ölçüm geçicidir.", "Calibration grows as FIFA 10 results arrive. It remains provisional until the group stage ends.")}</p></section></div>
    </section>`;
  }

  function renderPass(payload, draw) {
    const pass = playerPassData(payload, draw);
    if (!pass) return `<section class="fco-panel"><p>${ui("Oyuncu bulunamadı.", "Player not found.")}</p></section>`;
    const options = (draw.participants || []).map(player => `<option value="${esc(player.id)}" ${String(player.id) === String(pass.player.id) ? "selected" : ""}>${esc(player.name)}</option>`).join("");
    return `<section class="fco-panel" data-fco-panel="pass">
      <div class="fco-module-strip">${moduleBadge("PLAYER MATCH PASS", ui("Her oyuncu için kişisel, salt okunur mobil merkez", "A personal read-only mobile centre for every player"))}${moduleBadge("QR ACCESS", ui("Masadan doğrudan oyuncu sayfasına", "Directly from the table to the player page"))}${moduleBadge("LEGAL TEAM WINDOW", ui("Sıradaki maçta kullanılabilecek takımlar", "Teams legal for the next fixture"))}</div>
      <label class="fco-select">${ui("Oyuncu Match Pass", "Player Match Pass")}<select id="fcoPassPlayer">${options}</select></label>
      <section class="fco-pass-card"><header><div><span>FIFA 10 · OFFICIAL PLAYER MATCH PASS</span><h3>${esc(pass.player.name)}</h3><p>${ui("Bu ekran resmî veriyi değiştiremez.", "This screen cannot change official data.")}</p></div><div class="fco-qr">${pass.qr || `<b>QR</b>`}</div></header><div class="fco-pass-kpis"><article><span>${ui("Genel Sıra", "Overall Rank")}</span><b>#${pass.standing?.rank || "–"}</b></article><article><span>PPG</span><b>${pass.standing?.ppg.toFixed(3) || "0.000"}</b></article><article><span>GD/M</span><b>${pass.standing?.gdPerMatch.toFixed(3) || "0.000"}</b></article><article><span>${ui("Yol", "Path")}</span><b>${esc(pathLabel(pass.standing?.rank || 14))}</b></article><article><span>${ui("Kalan Maç", "Matches Left")}</span><b>${pass.pending.length}</b></article><article><span>${ui("Kullanılmış Takım", "Teams Used")}</span><b>${pass.used.size}</b></article></div>
      <div class="fco-pass-next"><div><span>${ui("SIRADAKİ MAÇ", "UP NEXT")}</span><strong>${pass.next ? `${pass.next.stars}★ · ${ui("GRUP", "GROUP")} ${pass.next.group} · MD ${pass.next.matchday}` : ui("Bekleyen maç yok", "No pending match")}</strong><h4>${pass.next ? `${esc(pass.player.name)} <i>VS</i> ${esc(pass.opponent?.name || "–")}` : ui("Grup fikstürü tamamlandı", "Group fixtures complete")}</h4></div><aside><span>${ui("MATEMATİKSEL DURUM", "MATHEMATICAL STATUS")}</span><b>${esc(pass.clinch?.label || "–")}</b><small>${pass.qualification ? `${pass.qualification.directPct.toFixed(1)}% QF · ${pass.qualification.playinPct.toFixed(1)}% PLAY-IN` : ""}</small></aside></div>
      ${pass.next ? `<section class="fco-legal-teams"><header><div><span>LEGAL TEAM WINDOW</span><h4>${pass.next.stars}★ ${ui("Kullanılabilir Takımlar", "Available Teams")}</h4></div><b>${teamPool(pass.next.stars).filter(team => !pass.used.has(normalize(team))).length}</b></header><div>${teamPool(pass.next.stars).filter(team => !pass.used.has(normalize(team))).map(team => `<span>${esc(team)}</span>`).join("")}</div></section>` : ""}
      <footer><code>${esc(pass.url)}</code><button type="button" data-fco-action="copy-pass-url" data-pass-url="${esc(pass.url)}">${ui("BAĞLANTIYI KOPYALA", "COPY LINK")}</button><button type="button" data-fco-action="print-pass">${ui("YAZDIR", "PRINT")}</button></footer></section>
    </section>`;
  }

  function renderRating(payload, draw) {
    const data = universe()?.buildUniverse?.(payload, draw);
    const ratings = universalRatings(data);
    const selected = ratings.find(player => player.key === normalize(selectedRatingPlayer)) || ratings[0];
    if (selected) selectedRatingPlayer = selected.name;
    const explanation = ratingExplanation(selected);
    const chemistry = chemistryMatrix(data, selected?.name);
    return `<section class="fco-panel" data-fco-panel="rating">
      <div class="fco-module-strip">${moduleBadge("UNIVERSAL SKILL RATING", ui("Belirsizlik ve güven aralıklı oyuncu gücü", "Player strength with uncertainty intervals"))}${moduleBadge("EXPLAIN MY RATING", ui("Her puanın açık bileşenleri", "Transparent components behind every score"))}${moduleBadge("PLAYER–TEAM CHEMISTRY MATRIX", ui("Oyuncuya özel takım uyumu", "Player-specific team fit"))}</div>
      <label class="fco-select">${ui("Oyuncu Bilim Merkezi", "Player Science Centre")}<select id="fcoRatingPlayer">${ratings.map(player => `<option value="${esc(player.name)}" ${player.key === selected?.key ? "selected" : ""}>${esc(player.name)}</option>`).join("")}</select></label>
      ${selected ? `<section class="fco-rating-hero"><div><span>UNIVERSAL SKILL RATING</span><h3>${esc(selected.name)}</h3><strong>${selected.universalRating.toFixed(1)}</strong><small>${selected.lower.toFixed(1)}–${selected.upper.toFixed(1)} · ${ui("Kanıt", "Evidence")} ${selected.evidence.toFixed(0)}% · ${selected.games} MP</small></div><aside>${explanation.map(item => `<article class="${item.value >= 0 ? "positive" : "negative"}"><span>${esc(item.label)}</span><b>${item.value >= 0 ? "+" : ""}${item.value.toFixed(2)}</b><small>${esc(item.copy)}</small></article>`).join("")}</aside></section>` : ""}
      <section class="fco-chemistry"><header><div><span>PLAYER–TEAM CHEMISTRY MATRIX</span><h4>${esc(selected?.name || "")}</h4><p>${ui("Oyuncu ve takım etkisi Bayes daraltmasıyla ayrılır; düşük örneklem açıkça gösterilir.", "Player and team effects are separated with Bayesian shrinkage; low samples remain visible.")}</p></div><b>${chemistry.length} ${ui("TAKIM", "TEAMS")}</b></header><div class="fco-table-wrap"><table><thead><tr><th>#</th><th>${ui("Takım", "Team")}</th><th>★</th><th>MP</th><th>PPG</th><th>ADJ PPG</th><th>GD/M</th><th>${ui("Uyum", "Chemistry")}</th><th>${ui("Güven", "Confidence")}</th></tr></thead><tbody>${chemistry.map((row, index) => `<tr><td>${index + 1}</td><td><strong>${esc(row.team)}</strong></td><td>${row.stars || "–"}</td><td>${row.games}</td><td>${row.ppg.toFixed(2)}</td><td>${row.adjustedPpg.toFixed(2)}</td><td>${row.gdPerMatch.toFixed(2)}</td><td><b>${row.synergy.toFixed(1)}</b></td><td>${row.confidence.toFixed(0)}%</td></tr>`).join("")}</tbody></table></div></section>
    </section>`;
  }

  function renderHistoryScience(payload, draw) {
    const data = universe()?.buildUniverse?.(payload, draw);
    const normalized = eraNormalization(data);
    const dynasty = dynastyEngine(data);
    const hall = hallOfFame(data);
    const counter = counterfactual(draw);
    const players = playerMap(draw);
    return `<section class="fco-panel" data-fco-panel="history">
      <div class="fco-module-strip">${moduleBadge("COUNTERFACTUAL UNIVERSE", ui("Resmî tarihi değiştirmeden alternatif sonuç", "Alternative result without changing official history"))}${moduleBadge("ERA NORMALIZATION ENGINE", ui("Format ve dönem zorluğu düzeltmesi", "Format and era difficulty adjustment"))}${moduleBadge("DYNASTY & POWER SHIFT", ui("Hanedanlıklar ve güç devirleri", "Dynasties and power transitions"))}${moduleBadge("HALL OF FAME CONSTITUTION", ui("Şeffaf kabul kuralları", "Transparent induction rules"))}</div>
      <section class="fco-counterfactual"><header><div><span>COUNTERFACTUAL UNIVERSE</span><h4>${ui("Bir Sonucu Değiştir, Etkiyi Gör", "Change One Result, See the Impact")}</h4><p>${ui("Simülasyon ayrı katmandadır; resmî skor ve tarih değişmez.", "The simulation is isolated; official scores and history never change.")}</p></div><b>SIMULATION · NOT OFFICIAL</b></header><div class="fco-counter-controls"><select id="fcoCounterMatch">${(draw?.fixtures || []).filter(match => match.completed).map(match => `<option value="${match.id}" ${match.id === counter.match?.id ? "selected" : ""}>${esc(players.get(String(match.homeId))?.name || "–")} ${match.homeScore}–${match.awayScore} ${esc(players.get(String(match.awayId))?.name || "–")}</option>`).join("")}</select><select id="fcoCounterOutcome"><option value="reverse" ${counter.outcome === "reverse" ? "selected" : ""}>${ui("Sonucu ters çevir", "Reverse result")}</option><option value="home" ${counter.outcome === "home" ? "selected" : ""}>${ui("Ev sahibi kazansın", "Home win")}</option><option value="draw" ${counter.outcome === "draw" ? "selected" : ""}>${ui("Beraberlik", "Draw")}</option><option value="away" ${counter.outcome === "away" ? "selected" : ""}>${ui("Deplasman kazansın", "Away win")}</option></select></div><div class="fco-counter-impact">${counter.impact.map(row => `<article><strong>${esc(row.name)}</strong><span>#${row.fromRank} <i>→</i> #${row.toRank}</span><b>${row.fromPath !== row.toPath ? `${row.fromPath.toUpperCase()} → ${row.toPath.toUpperCase()}` : `${row.ppgDelta >= 0 ? "+" : ""}${row.ppgDelta.toFixed(3)} PPG`}</b></article>`).join("") || `<p>${ui("Bu senaryoda sıralama değişmiyor.", "This scenario does not change the ranking.")}</p>`}</div></section>
      <div class="fco-history-grid"><section><header><div><span>ERA NORMALIZATION ENGINE</span><h4>${ui("Dönemden Arındırılmış Büyüklük", "Era-Adjusted Greatness")}</h4></div><b>TOP 15</b></header><div>${normalized.slice(0, 15).map((player, index) => `<article><i>${index + 1}</i><div><strong>${esc(player.name)}</strong><small>${player.legacy.toFixed(1)} RAW · ${player.playerDifficulty.toFixed(1)} ${ui("dönem zorluğu", "era difficulty")}</small></div><b>${player.normalizedLegacy.toFixed(1)}</b><span>×${player.eraFactor.toFixed(3)}</span></article>`).join("")}</div></section><section><header><div><span>DYNASTY & POWER SHIFT ENGINE</span><h4>${ui("Hanedanlık ve Taht Devirleri", "Dynasties & Power Transfers")}</h4></div><b>${dynasty.transitions.length}</b></header><div class="fco-dynasty">${dynasty.streaks.slice(0, 8).map(row => `<article><span>FIFA ${row.startEdition}${row.endEdition !== row.startEdition ? `–${row.endEdition}` : ""}</span><strong>${esc(row.player)}</strong><b>${row.titles} 🏆</b></article>`).join("")}${dynasty.transitions.map(row => `<article class="transition"><span>FIFA ${row.edition}</span><strong>${esc(row.from)} <i>→</i> ${esc(row.to)}</strong><b>${row.score.toFixed(1)}</b></article>`).join("")}</div></section></div>
      <section class="fco-hall"><header><div><span>HALL OF FAME CONSTITUTION</span><h4>${ui("Kanıta Dayalı Onur Salonu", "Evidence-Based Hall of Fame")}</h4></div><b>${hall.length} ${ui("ÜYE", "INDUCTEES")}</b></header><div>${hall.map(player => `<article class="tier-${player.tier.toLowerCase().replace(/\s/g, "-")}"><span>${player.tier}</span><strong>${esc(player.name)}</strong><b>${player.legacy.toFixed(1)} Legacy · ${player.titles} 🏆</b><small>${esc(player.reason)}</small></article>`).join("")}</div><footer><span>IMMORTAL: 3 🏆 / 86 Legacy</span><span>LEGEND: 2 🏆 / 75 Legacy</span><span>ICON: 🏆 + ${ui("elit kanıt", "elite evidence")}</span><span>ELITE: 62 Legacy / 78 Prime</span><span>CULT HERO: ${ui("rekabet veya baskı mirası", "rivalry or pressure legacy")}</span></footer></section>
    </section>`;
  }

  function finalScenes(journey, draw) {
    const latestChampionship = allSeries(journey).flatMap(series => series.matches.map(match => ({ ...match, series }))).filter(match => match.completed).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""))[0];
    const nextSeries = allSeries(journey).find(series => series.homeId && series.awayId && series.status !== "completed");
    return [
      { id: "journey", label: ui("Canlı Bracket", "Live Bracket"), ready: true },
      { id: "series", label: ui("Canlı Seri", "Live Series"), ready: Boolean(nextSeries) },
      { id: "latest", label: ui("Son Sonuç", "Latest Result"), ready: Boolean(latestChampionship || draw?.fixtures?.some(match => match.completed)) },
      { id: "next", label: ui("Sıradaki Maç", "Up Next"), ready: Boolean(nextSeries) },
      { id: "champion", label: ui("Şampiyonluk", "Champion"), ready: Boolean(journey.championId) },
      { id: "lowerthird", label: ui("Alt Bant", "Lower Third"), ready: true }
    ];
  }

  function renderFinalNight(payload, draw) {
    const journey = journeyState(payload, draw);
    const data = universe()?.buildUniverse?.(payload, draw);
    const scenes = finalScenes(journey, draw);
    return `<section class="fco-panel" data-fco-panel="final">
      <div class="fco-module-strip">${moduleBadge("FINAL NIGHT DIRECTOR", ui("OBS sahne ve anlatı kumandası", "OBS scene and narrative controller"))}${moduleBadge("AUTOMATIC SEASON CHRONICLE", ui("Yazdırılabilir dijital sezon kitabı", "Printable digital season book"))}${moduleBadge("LIVE CHAMPIONSHIP WALL", ui("Bracket, seri ve şampiyonluk ekranları", "Bracket, series and championship screens"))}</div>
      <section class="fco-final-hero"><div><span>FINAL NIGHT DIRECTOR</span><h3>${ui("Şampiyonluk gecesini tek merkezden yönet.", "Run championship night from one command centre.")}</h3><p>${ui("Her sahne şeffaf arka planlı yayın görünümünde yeni sekmede açılır ve aynı resmî Championship kaydını okur.", "Every scene opens in a broadcast-ready tab and reads the same official Championship record.")}</p></div><aside><span>${ui("ŞAMPİYON", "CHAMPION")}</span><strong>${esc(playerName(draw, journey.championId))}</strong><small>${journey.championId ? "FIFA 10" : ui("Henüz belirlenmedi", "Not decided yet")}</small></aside></section>
      <div class="fco-scene-grid">${scenes.map(scene => `<article class="${scene.ready ? "ready" : "waiting"}"><span>${scene.id.toUpperCase()}</span><strong>${esc(scene.label)}</strong><small>${scene.ready ? ui("Sahne hazır", "Scene ready") : ui("Veri bekleniyor", "Waiting for data")}</small><button type="button" data-fco-action="open-final-scene" data-scene="${scene.id}" ${scene.ready ? "" : "disabled"}>${ui("YENİ SEKMEDE AÇ", "OPEN IN NEW TAB")} ↗</button></article>`).join("")}</div>
      <section class="fco-season-book"><div><span>AUTOMATIC SEASON CHRONICLE</span><h4>${ui("FIFA 10 Dijital Yıllığı", "FIFA 10 Digital Yearbook")}</h4><p>${ui("Genel tablo, Championship yolu, tüm zamanlar kapsamı ve şampiyonluk kaydı tek yazdırılabilir HTML dosyasında.", "Overall standings, Championship journey, all-time coverage and the championship record in one printable HTML file.")}</p></div><button type="button" data-fco-action="download-season-book">${ui("SEZON KİTABINI İNDİR", "DOWNLOAD SEASON BOOK")}</button></section>
    </section>`;
  }

  function renderPanel(payload, draw) {
    if (activePanel === "stakes") return renderStakes(draw);
    if (activePanel === "trust") return renderTrust(payload, draw);
    if (activePanel === "pass") return renderPass(payload, draw);
    if (activePanel === "rating") return renderRating(payload, draw);
    if (activePanel === "history") return renderHistoryScience(payload, draw);
    if (activePanel === "final") return renderFinalNight(payload, draw);
    return renderJourney(payload, draw);
  }

  function render(payload, draw, options = {}) {
    const mount = options.mount || document.getElementById("f10ChampionshipOSRoot");
    if (!mount) return "";
    lastMount = mount;
    lastPayload = payload || app()?.getState?.();
    lastDraw = currentDraw(draw);
    if (new URL(location.href).searchParams.get("fifa10pass")) activePanel = "pass";
    const journey = journeyState(lastPayload, lastDraw);
    const groupComplete = Boolean(lastDraw?.fixtures?.length && lastDraw.fixtures.every(match => match.completed));
    const admin = Boolean(app()?.isAdmin?.() || app()?.canEdit?.());
    if (groupComplete && journey.status === "preview" && admin && !autoLockInProgress && !sessionStorage.getItem(`fco-autolock:${lastDraw?.drawId}:${BUILD}`)) {
      autoLockInProgress = true;
      sessionStorage.setItem(`fco-autolock:${lastDraw?.drawId}:${BUILD}`, "attempted");
      setTimeout(() => perform(async () => {
        await lockJourney();
        sessionStorage.setItem(`fco-autolock:${lastDraw?.drawId}:${BUILD}`, "done");
      }).finally(() => { autoLockInProgress = false; rerender(); }), 120);
    }
    const completedGroup = lastDraw?.fixtures?.filter(match => match.completed).length || 0;
    mount.innerHTML = `<section class="fco-root"><header class="fco-hero"><div><span>FIFA CHAMPIONSHIP OPERATING SYSTEM · V${VERSION}</span><h3>${ui("Elemeleri yönet.", "Operate the tournament.")}<br><em>${ui("Kupaya giden yolu işlet.", "Prove the universe.")}</em></h3><p>${ui("Play-in'den kupaya resmî operasyon, matematiksel yol sertifikaları, veri kara kutusu, oyuncu Match Pass, rating bilimi ve Final Night Director.", "Official operations from Play-in to the trophy, mathematical path certificates, tournament black box, Player Match Pass, rating science and Final Night Director.")}</p></div><aside><article><span>${ui("Grup Aşaması", "Group Stage")}</span><b>${completedGroup}/${lastDraw?.fixtures?.length || 78}</b></article><article><span>Championship</span><b>${journey.status === "preview" ? ui("ÖNİZLEME", "PREVIEW") : journey.status === "completed" ? ui("TAMAMLANDI", "COMPLETE") : ui("RESMÎ", "OFFICIAL")}</b></article><article><span>${ui("Black Box", "Black Box")}</span><b>${draft(lastPayload).blackBox?.length || 0}</b></article><article><span>${ui("Tahmin Anı", "Forecasts")}</span><b>${draft(lastPayload).forecastLedger?.length || 0}</b></article></aside></header>
      <nav class="fco-nav">${[
        ["command", ui("MAÇLAR · AĞAÇ · PUAN", "MATCHES · BRACKET · TABLE")],
        ["stakes", ui("YOL & MAÇ DEĞERİ", "STAKES & MATCH VALUE")],
        ["trust", ui("BLACK BOX & GÜVEN", "BLACK BOX & TRUST")],
        ["pass", "PLAYER MATCH PASS"],
        ["rating", ui("OYUNCU BİLİMİ", "PLAYER SCIENCE")],
        ["history", ui("ALTERNATİF TARİH", "ALTERNATE HISTORY")],
        ["final", "FINAL NIGHT DIRECTOR"]
      ].map(([id, label]) => `<button type="button" class="${activePanel === id ? "active" : ""}" data-fco-action="panel" data-panel="${id}">${label}</button>`).join("")}</nav>
      ${notice.text ? `<div class="fco-notice ${notice.type}"><b>${notice.type === "error" ? "!" : "✓"}</b><span>${esc(notice.text)}</span></div>` : ""}
      <main>${renderPanel(lastPayload, lastDraw)}</main>
      <footer><span>${ui("RESMÎ", "OFFICIAL")}: ${ui("skor · seri · bracket · onay", "score · series · bracket · acknowledgement")}</span><span>${ui("ANALİTİK", "ANALYTICAL")}: ${ui("clinch · UR · kimya · dönem normalizasyonu", "clinch · UR · chemistry · era normalization")}</span><span>${ui("SİMÜLASYON", "SIMULATION")}: ${ui("counterfactual · tahmin · açıkça işaretli", "counterfactual · forecasts · clearly labelled")}</span></footer></section>`;
    persist();
    installListeners();
    return mount.innerHTML;
  }

  function persist() {
    sessionStorage.setItem("fifa-championship-panel", activePanel);
    sessionStorage.setItem("fifa-championship-pass-player", selectedPassPlayer);
    sessionStorage.setItem("fifa-championship-rating-player", selectedRatingPlayer);
    sessionStorage.setItem("fifa-championship-counterfactual-match", selectedCounterfactualMatch);
    sessionStorage.setItem("fifa-championship-counterfactual-outcome", selectedCounterfactualOutcome);
  }

  function rerender() {
    const current = document.getElementById("f10ChampionshipOSRoot") || lastMount;
    if (current) render(app()?.getState?.() || lastPayload, currentDraw(), { mount: current });
  }

  async function perform(action) {
    try {
      notice = { type: "info", text: "" };
      await action();
      notice = { type: "success", text: ui("İşlem tamamlandı.", "Operation completed.") };
    } catch (error) {
      console.error("FIFA Championship OS operation failed", error);
      notice = { type: "error", text: String(error?.message || error) };
    }
    setTimeout(rerender, 30);
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-fco-action]");
      if (!button || button.disabled) return;
      const action = button.dataset.fcoAction;
      if (action === "open-player-result-desk") {
        window.open(`fifa10-print-centre.html?fifa9build=${BUILD}`, "_blank", "noopener,noreferrer");
        return;
      }
      if (action === "panel") {
        activePanel = button.dataset.panel || "command";
        notice = { type: "info", text: "" };
        rerender();
      } else if (action === "lock-journey") {
        if (confirm(ui("78 grup maçı tamamlandı. Championship eşleşmeleri bu sıralamayla resmîleştirilsin mi?", "All 78 group matches are complete. Lock the Championship pairings from this table?"))) perform(lockJourney);
      } else if (action === "save-series-match") {
        const row = button.closest("[data-series-id][data-match-id]");
        perform(() => saveSeriesMatch(row.dataset.seriesId, row.dataset.matchId, {
          homeTeam: row.querySelector('[name="homeTeam"]')?.value,
          homeScore: row.querySelector('[name="homeScore"]')?.value,
          awayScore: row.querySelector('[name="awayScore"]')?.value,
          awayTeam: row.querySelector('[name="awayTeam"]')?.value
        }));
      } else if (action === "clear-series-match") {
        const row = button.closest("[data-series-id][data-match-id]");
        if (confirm(ui("Bu Championship sonucu temizlensin mi?", "Clear this Championship result?"))) perform(() => clearSeriesMatch(row.dataset.seriesId, row.dataset.matchId));
      } else if (action === "ack-result") {
        const row = button.closest("[data-series-id][data-match-id]");
        perform(() => acknowledgeResult(row.dataset.seriesId, row.dataset.matchId, button.dataset.side));
      } else if (action === "export-black-box") {
        downloadFile(`FIFA10_TOURNAMENT_BLACK_BOX_${Date.now()}.json`, JSON.stringify({
          version: VERSION, exportedAt: nowISO(), drawId: currentDraw()?.drawId,
          blackBox: draft(app()?.getState?.()).blackBox || [],
          forecastLedger: draft(app()?.getState?.()).forecastLedger || []
        }, null, 2), "application/json");
      } else if (action === "restore-black-box") {
        if (confirm(ui("Bu işlem resmî turnuva verisini seçilen geri yükleme noktasına döndürür. Devam edilsin mi?", "This restores official tournament data to the selected recovery point. Continue?"))) {
          perform(() => engine()?.restoreBlackBoxEvent?.(button.dataset.eventId));
        }
      } else if (action === "copy-pass-url") {
        navigator.clipboard?.writeText?.(button.dataset.passUrl).then(() => {
          notice = { type: "success", text: ui("Match Pass bağlantısı kopyalandı.", "Match Pass link copied.") };
          rerender();
        }).catch(() => {});
      } else if (action === "print-pass") {
        window.print();
      } else if (action === "open-final-scene") {
        window.open(`fifa10-final-night.html?fifa9build=${BUILD}&mode=${encodeURIComponent(button.dataset.scene || "journey")}`, "_blank", "noopener,noreferrer");
      } else if (action === "download-season-book") {
        const payload = app()?.getState?.();
        const draw = currentDraw();
        const journey = journeyState(payload, draw);
        const data = universe()?.buildUniverse?.(payload, draw);
        downloadFile("FIFA10_OFFICIAL_SEASON_CHRONICLE.html", seasonBookHtml(payload, draw, journey, data), "text/html;charset=utf-8");
      }
    });
    document.addEventListener("change", event => {
      if (event.target?.id === "fcoPassPlayer") {
        selectedPassPlayer = event.target.value;
        const url = new URL(location.href);
        url.searchParams.set("fifa10pass", selectedPassPlayer);
        history.replaceState(history.state, "", url);
        rerender();
      } else if (event.target?.id === "fcoRatingPlayer") {
        selectedRatingPlayer = event.target.value;
        rerender();
      } else if (event.target?.id === "fcoCounterMatch") {
        selectedCounterfactualMatch = event.target.value;
        rerender();
      } else if (event.target?.id === "fcoCounterOutcome") {
        selectedCounterfactualOutcome = event.target.value;
        rerender();
      }
    });
  }

  window.FIFA_CHAMPIONSHIP_OS = {
    version: VERSION,
    build: BUILD,
    render,
    createJourney: draw => resolveJourney(createJourney(currentDraw(draw), false)),
    resolveJourney,
    standings: draw => drawStandings(currentDraw(draw)),
    clinch: draw => clinchEngine(currentDraw(draw)),
    requiredResults: draw => requiredResultRows(currentDraw(draw)),
    dependencies: draw => dependencyNetwork(currentDraw(draw)),
    captureForecastSnapshot,
    lightweightForecast: draw => lightweightForecast(currentDraw(draw)),
    universalRatings: data => universalRatings(data || universe()?.buildUniverse?.()),
    chemistry: (data, player) => chemistryMatrix(data || universe()?.buildUniverse?.(), player),
    eraNormalization: data => eraNormalization(data || universe()?.buildUniverse?.()),
    dynasty: data => dynastyEngine(data || universe()?.buildUniverse?.()),
    hallOfFame: data => hallOfFame(data || universe()?.buildUniverse?.()),
    counterfactual: (draw, matchId, outcome) => counterfactual(currentDraw(draw), matchId, outcome),
    calibration: (payload, draw) => calibration(payload || app()?.getState?.(), currentDraw(draw)),
    playerPass: (payload, draw, player) => playerPassData(payload || app()?.getState?.(), currentDraw(draw), player),
    seasonBook: (payload, draw) => {
      const currentPayload = payload || app()?.getState?.();
      const current = currentDraw(draw);
      return seasonBookHtml(currentPayload, current, journeyState(currentPayload, current), universe()?.buildUniverse?.(currentPayload, current));
    }
  };
})();
