(() => {
  "use strict";

  const VERSION = "2.2.0";
  const BUILD = "402000";
  const PANELS = ["equity", "twin", "operations", "legacy"];
  const MILESTONE_THRESHOLDS = Object.freeze({
    games: [25, 50, 75, 100, 150, 200],
    wins: [10, 25, 50, 75, 100],
    gf: [50, 100, 150, 200, 300, 400],
    titles: [1, 2, 3, 4, 5],
    finals: [1, 3, 5, 10]
  });

  let activePanel = sessionStorage.getItem("fifa-evolution-panel") || "equity";
  let selectedEquityPlayer = sessionStorage.getItem("fifa-evolution-equity-player") || "";
  let selectedTwinA = sessionStorage.getItem("fifa-evolution-twin-a") || "";
  let selectedTwinB = sessionStorage.getItem("fifa-evolution-twin-b") || "";
  let selectedTwinStars = Number(sessionStorage.getItem("fifa-evolution-twin-stars") || 4.5);
  let lastMount = null;
  let lastPayload = null;
  let lastDraw = null;
  let listenersInstalled = false;

  const ui = (tr, en) => window.FIFA_I18N?.language === "en" ? en : tr;
  const app = () => window.FIFA_APP_CONTEXT || null;
  const engine = () => window.FIFA10_DRAW_ENGINE || null;
  const universe = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const championship = () => window.FIFA_CHAMPIONSHIP_OS || null;
  const draft = payload => (payload || app()?.getState?.())?.seasonSystem?.fifa10Draft || {};
  const currentDraw = draw => draw || engine()?.drawState?.() || app()?.getFifa10Draw?.() || null;
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
  const logistic = difference => 1 / (1 + Math.pow(10, -Number(difference || 0) / 400));
  const nowISO = () => new Date().toISOString();
  const playerMap = draw => new Map((draw?.participants || []).map(player => [String(player.id), player]));
  const resultPoints = (homeScore, awayScore, side) => {
    if (Number(homeScore) > Number(awayScore)) return side === "home" ? 3 : 0;
    if (Number(awayScore) > Number(homeScore)) return side === "away" ? 3 : 0;
    return 1;
  };
  const resultValue = points => points === 3 ? 1 : points === 1 ? .5 : 0;

  function universeData(payload, draw) {
    return universe()?.buildUniverse?.(payload || app()?.getState?.(), currentDraw(draw)) || {
      matches: [], players: [], teams: [], honours: [], editions: [], playerMap: new Map()
    };
  }

  function currentStandings(draw) {
    return championship()?.standings?.(currentDraw(draw)) || engine()?.standings?.(currentDraw(draw)) || [];
  }

  function predictionWithTitles(predictions, data) {
    const playerByName = new Map((data?.players || []).map(player => [normalize(player.name), player]));
    const enriched = (predictions || []).map(prediction => {
      const player = playerByName.get(normalize(prediction.name));
      const directPct = clamp(prediction.directPct);
      const top12Pct = clamp(prediction.top12Pct);
      const playinPct = clamp(top12Pct - directPct);
      const skill = clamp(45 + (Number(player?.ppr || 50) - 50) * .75 + (Number(player?.pressureScore || 50) - 50) * .25, 18, 86);
      const rawTitle = (directPct * .19 + playinPct * .075) * (skill / 50);
      return { ...prediction, directPct, top12Pct, playinPct, eliminatedPct: clamp(100 - top12Pct), skill, rawTitle };
    });
    const total = enriched.reduce((sum, row) => sum + row.rawTitle, 0) || 1;
    return enriched.map(row => ({ ...row, titlePct: row.rawTitle / total * 100 }));
  }

  function baselineDraw(draw) {
    const clone = deepClone(draw);
    (clone.fixtures || []).forEach(match => {
      match.completed = false;
      match.homeScore = null;
      match.awayScore = null;
    });
    clone.updatedAt = `${clone.drawId || "F10"}-BASELINE`;
    return clone;
  }

  function equityTimeline(payload, draw) {
    const current = currentDraw(draw);
    if (!current?.participants?.length) return { moments: [], players: [], selected: null };
    const data = universeData(payload, current);
    const ledger = [...(draft(payload).forecastLedger || [])]
      .filter(snapshot => Array.isArray(snapshot.predictions))
      .sort((a, b) => Number(a.completed) - Number(b.completed));
    const moments = [];
    const addMoment = (completed, at, predictions, source) => {
      if (moments.some(moment => moment.completed === Number(completed))) return;
      moments.push({
        completed: Number(completed),
        at: at || null,
        source,
        rows: predictionWithTitles(predictions, data)
      });
    };
    if (!ledger.some(snapshot => Number(snapshot.completed) === 0)) {
      addMoment(0, current.createdAt, championship()?.lightweightForecast?.(baselineDraw(current), 220) || [], "baseline");
    }
    ledger.forEach(snapshot => addMoment(snapshot.completed, snapshot.at, snapshot.predictions, "official-ledger"));
    const completed = (current.fixtures || []).filter(match => match.completed).length;
    if (!moments.some(moment => moment.completed === completed)) {
      addMoment(completed, current.updatedAt, championship()?.lightweightForecast?.(current, 320) || [], "current");
    }
    moments.sort((a, b) => a.completed - b.completed);
    const players = current.participants.map(player => ({
      id: String(player.id),
      name: player.name,
      points: moments.map(moment => {
        const row = moment.rows.find(item => String(item.id) === String(player.id) || normalize(item.name) === normalize(player.name));
        return {
          completed: moment.completed,
          directPct: Number(row?.directPct || 0),
          top12Pct: Number(row?.top12Pct || 0),
          titlePct: Number(row?.titlePct || 0),
          at: moment.at,
          source: moment.source
        };
      })
    }));
    const selected = players.find(player => String(player.id) === String(selectedEquityPlayer) || normalize(player.name) === normalize(selectedEquityPlayer))
      || players[0] || null;
    if (selected) selectedEquityPlayer = selected.id;
    return { moments, players, selected, capturedMoments: ledger.length, completed };
  }

  function betaInterval(alpha, beta) {
    const total = alpha + beta;
    const value = alpha / total;
    const variance = alpha * beta / (total * total * (total + 1));
    const deviation = Math.sqrt(Math.max(0, variance));
    return { value, lower: clamp(value - 1.96 * deviation, .03, .97), upper: clamp(value + 1.96 * deviation, .03, .97) };
  }

  function ratingFromProbability(probability) {
    const safe = clamp(probability, .03, .97);
    return 1500 + 400 * Math.log10(safe / (1 - safe));
  }

  function digitalTwins(data) {
    return (data?.players || []).map(player => {
      let alpha = 7;
      let beta = 7;
      const adjusted = [];
      (player.entries || []).forEach(entry => {
        const actual = resultValue(entry.points);
        const expected = Number(entry.expected ?? .5);
        const opponentAdjustment = (Number(entry.opponentElo || 1500) - 1500) / 900;
        const performance = clamp(.5 + (actual - expected) * .78 + opponentAdjustment * .12, .02, .98);
        const weight = clamp(Number(entry.stageWeight || 1), .8, 1.65);
        alpha += performance * weight;
        beta += (1 - performance) * weight;
        adjusted.push(performance);
      });
      const posterior = betaInterval(alpha, beta);
      const posteriorRating = ratingFromProbability(posterior.value);
      const lowerRating = ratingFromProbability(posterior.lower);
      const upperRating = ratingFromProbability(posterior.upper);
      const tiers = [4, 4.5, 5].map(stars => {
        const tier = (player.tiers || []).find(item => Number(item.stars) === stars);
        const games = Number(tier?.games || 0);
        const ppg = games ? Number(tier.ppg || 0) : 1.5;
        const shrunkPpg = (ppg * games + 1.5 * 5) / (games + 5);
        return {
          stars, games, ppg, shrunkPpg,
          rating: posteriorRating + (shrunkPpg - 1.5) * 95,
          confidence: games / (games + 5) * 100
        };
      });
      const volatility = clamp(stdDev(adjusted) * 210);
      const evidence = (alpha + beta - 14) / (alpha + beta - 14 + 14) * 100;
      const dominantTier = [...tiers].sort((a, b) => b.rating - a.rating)[0];
      const floor = clamp(50 + (lowerRating - 1500) / 10);
      const ceiling = clamp(50 + (upperRating - 1500) / 10);
      return {
        ...player,
        posteriorRating,
        lowerRating,
        upperRating,
        floor,
        ceiling,
        evidence,
        volatility,
        tiers,
        dominantTier,
        pressureTwin: clamp(50 + (Number(player.pressureScore || 50) - 50) * .75 + (posteriorRating - 1500) / 14),
        teamIndependence: clamp(100 - Math.abs(Number(player.teamDependency || 50) - 50) * 1.35)
      };
    }).sort((a, b) => b.posteriorRating - a.posteriorRating || b.games - a.games);
  }

  function twinMatchup(data, firstRef, secondRef, stars = 4.5) {
    const twins = digitalTwins(data);
    const first = twins.find(player => player.key === normalize(firstRef) || player.name === firstRef) || twins[0];
    const second = twins.find(player => player.key === normalize(secondRef) || player.name === secondRef) || twins.find(player => player.key !== first?.key);
    if (!first || !second) return { first, second, stars, firstWin: 0, draw: 0, secondWin: 0 };
    const firstTier = first.tiers.find(tier => Number(tier.stars) === Number(stars));
    const secondTier = second.tiers.find(tier => Number(tier.stars) === Number(stars));
    const firstRating = first.posteriorRating * .72 + Number(firstTier?.rating || first.posteriorRating) * .28;
    const secondRating = second.posteriorRating * .72 + Number(secondTier?.rating || second.posteriorRating) * .28;
    const rivalry = (data.rivalries || []).find(row => {
      const pair = [normalize(row.playerA), normalize(row.playerB)];
      return pair.includes(first.key) && pair.includes(second.key);
    });
    const h2hGames = Number(rivalry?.matches || 0);
    const firstH2h = rivalry
      ? normalize(rivalry.playerA) === first.key
        ? Number(rivalry.winsA || 0) / Math.max(1, h2hGames)
        : Number(rivalry.winsB || 0) / Math.max(1, h2hGames)
      : .5;
    const h2hAdjustment = (firstH2h - .5) * Math.min(70, h2hGames * 7);
    const raw = logistic(firstRating - secondRating + h2hAdjustment);
    const draw = clamp(19 - Math.abs(firstRating - secondRating) / 80, 9, 22);
    const decisive = 100 - draw;
    return {
      first, second, stars: Number(stars),
      firstRating, secondRating,
      firstWin: raw * decisive,
      draw,
      secondWin: (1 - raw) * decisive,
      h2hGames,
      confidence: mean([first.evidence, second.evidence])
    };
  }

  function teamPool(stars) {
    const pools = app()?.getFifa10TeamPools?.() || window.FIFA10_TEAM_POOLS || {};
    return pools[String(Number(stars))] || [];
  }

  function allChampionshipMatches(state, draw) {
    const players = playerMap(draw);
    return Object.values(state?.rounds || {}).flat().flatMap(series => (series.matches || []).map(match => ({
      ...match,
      seriesId: series.id,
      round: series.round,
      homeId: series.homeId,
      awayId: series.awayId,
      homeName: players.get(String(series.homeId))?.name || "",
      awayName: players.get(String(series.awayId))?.name || ""
    })));
  }

  function integritySentinel(payload, draw) {
    const current = currentDraw(draw);
    const state = draft(payload).championshipOS;
    const issues = [];
    const add = (severity, code, titleTr, titleEn, detailTr, detailEn, playerIds = []) => issues.push({
      id: `${code}-${issues.length + 1}`,
      severity, code,
      title: ui(titleTr, titleEn),
      detail: ui(detailTr, detailEn),
      playerIds: playerIds.map(String)
    });
    const participants = new Set((current?.participants || []).map(player => String(player.id)));
    const ids = new Set();
    (current?.fixtures || []).forEach(match => {
      if (ids.has(match.id)) add("critical", "DUPLICATE_FIXTURE", "Tekrarlanan fikstür kimliği", "Duplicate fixture ID", `${match.id} birden fazla kez kullanılmış.`, `${match.id} is used more than once.`);
      ids.add(match.id);
      const unknown = [match.homeId, match.awayId].filter(id => !participants.has(String(id)));
      if (unknown.length) add("critical", "UNKNOWN_PLAYER", "Fikstürde bilinmeyen oyuncu", "Unknown player in fixture", `${match.id} geçersiz oyuncu kimliği içeriyor.`, `${match.id} contains an invalid player ID.`, unknown);
      if (![4, 4.5, 5].includes(Number(match.stars))) add("error", "INVALID_TIER", "Geçersiz yıldız seviyesi", "Invalid star tier", `${match.id}: ${match.stars}★`, `${match.id}: ${match.stars}★`, [match.homeId, match.awayId]);
      if (!match.completed) return;
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
        add("critical", "INVALID_SCORE", "Geçersiz grup skoru", "Invalid group score", `${match.id} geçerli bir skor taşımıyor.`, `${match.id} does not contain a valid score.`, [match.homeId, match.awayId]);
      }
      if (!match.homeTeam || !match.awayTeam) {
        add("warning", "MISSING_TEAM", "Kullanılan takım eksik", "Used team missing", `${match.id} sonucunda takım alanı eksik.`, `${match.id} has a missing team field.`, [match.homeId, match.awayId]);
      }
      const pool = teamPool(match.stars);
      if (match.homeTeam && !pool.includes(match.homeTeam)) add("error", "POOL_VIOLATION", "Takım havuzu ihlali", "Team-pool violation", `${match.homeTeam}, ${match.stars}★ havuzunda değil.`, `${match.homeTeam} is not in the ${match.stars}★ pool.`, [match.homeId]);
      if (match.awayTeam && !pool.includes(match.awayTeam)) add("error", "POOL_VIOLATION", "Takım havuzu ihlali", "Team-pool violation", `${match.awayTeam}, ${match.stars}★ havuzunda değil.`, `${match.awayTeam} is not in the ${match.stars}★ pool.`, [match.awayId]);
    });
    const knockout = allChampionshipMatches(state, current);
    knockout.filter(match => match.completed).forEach(match => {
      const homeScore = Number(match.homeScore);
      const awayScore = Number(match.awayScore);
      if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore === awayScore) {
        add("critical", "INVALID_KNOCKOUT_SCORE", "Geçersiz eleme skoru", "Invalid knockout score", `${match.id} eşit olmayan geçerli skor gerektiriyor.`, `${match.id} requires a valid non-tied score.`, [match.homeId, match.awayId]);
      }
      if (!match.confirmation?.admin) add("error", "ADMIN_CONFIRMATION", "Yönetici kaydı eksik", "Admin record missing", `${match.id} yönetici kaydı taşımıyor.`, `${match.id} has no administrator record.`, [match.homeId, match.awayId]);
      if (!match.confirmation?.home || !match.confirmation?.away) add("info", "PLAYER_ACK", "Oyuncu teyidi bekleniyor", "Player acknowledgement pending", `${match.id} için iki oyuncu teyidi tamamlanmadı.`, `Both player acknowledgements are not complete for ${match.id}.`, [match.homeId, match.awayId]);
    });
    const used = new Map();
    const registerTeam = (playerId, team, matchId) => {
      if (!team || !playerId) return;
      const key = `${String(playerId)}::${normalize(team)}`;
      if (used.has(key)) {
        add("error", "TEAM_REPEAT", "Aynı takım tekrar kullanılmış", "Team used more than once", `${team}, aynı oyuncu tarafından ${used.get(key)} ve ${matchId} maçlarında kullanılmış.`, `${team} was used by the same player in ${used.get(key)} and ${matchId}.`, [playerId]);
      } else used.set(key, matchId);
    };
    (current?.fixtures || []).filter(match => match.completed).forEach(match => {
      registerTeam(match.homeId, match.homeTeam, match.id);
      registerTeam(match.awayId, match.awayTeam, match.id);
    });
    knockout.filter(match => match.completed).forEach(match => {
      registerTeam(match.homeId, match.homeTeam, match.id);
      registerTeam(match.awayId, match.awayTeam, match.id);
    });
    const blackBox = draft(payload).blackBox || [];
    blackBox.forEach((event, index) => {
      if (!event.hash || !event.snapshot || !event.deviceId) add("error", "BLACK_BOX_FIELDS", "Black Box bütünlüğü eksik", "Black Box integrity fields missing", `${event.id || index + 1} olayında zorunlu alan eksik.`, `Required fields are missing from event ${event.id || index + 1}.`);
      if (index > 0 && event.previousHash !== blackBox[index - 1].hash) add("critical", "HASH_CHAIN", "Black Box hash zinciri kopuk", "Black Box hash chain broken", `${event.id || index + 1} önceki hash ile eşleşmiyor.`, `${event.id || index + 1} does not match the previous hash.`);
    });
    if (state && championship()?.resolveJourney) {
      const resolved = championship().resolveJourney(state);
      Object.values(state.rounds || {}).flat().forEach(series => {
        const expected = Object.values(resolved.rounds || {}).flat().find(item => item.id === series.id);
        if (series.winnerId && expected?.winnerId !== series.winnerId) add("critical", "BRACKET_MISMATCH", "Eleme ağacı uyuşmazlığı", "Bracket mismatch", `${series.label} kazananı sonuçlarla uyuşmuyor.`, `${series.label} winner does not match its results.`, [series.homeId, series.awayId]);
      });
    }
    const counts = {
      critical: issues.filter(issue => issue.severity === "critical").length,
      error: issues.filter(issue => issue.severity === "error").length,
      warning: issues.filter(issue => issue.severity === "warning").length,
      info: issues.filter(issue => issue.severity === "info").length
    };
    const score = clamp(100 - counts.critical * 24 - counts.error * 10 - counts.warning * 4);
    return {
      score,
      status: counts.critical ? "blocked" : counts.error ? "action" : counts.warning ? "review" : "healthy",
      counts,
      issues,
      checkedFixtures: current?.fixtures?.length || 0,
      checkedKnockoutMatches: knockout.length,
      checkedBlackBoxEvents: blackBox.length,
      checkedAt: nowISO()
    };
  }

  function optimizedSchedule(draw, payload) {
    const current = currentDraw(draw);
    const pending = (current?.fixtures || []).filter(match => !match.completed);
    if (!pending.length) return [];
    const completed = (current.fixtures || []).filter(match => match.completed)
      .sort((a, b) => Date.parse(a.updatedAt || "") - Date.parse(b.updatedAt || "") || Number(a.sequence || 0) - Number(b.sequence || 0));
    const loads = new Map((current.participants || []).map(player => [String(player.id), 0]));
    completed.forEach(match => {
      loads.set(String(match.homeId), (loads.get(String(match.homeId)) || 0) + 1);
      loads.set(String(match.awayId), (loads.get(String(match.awayId)) || 0) + 1);
    });
    const groupLoads = new Map(["A", "B", "C"].map(group => [group, completed.filter(match => match.group === group).length]));
    const importance = new Map((championship()?.dependencies?.(current) || []).map(match => [match.id, Number(match.importance || 0)]));
    let recentPlayers = new Set(completed.slice(-1).flatMap(match => [String(match.homeId), String(match.awayId)]));
    const remaining = [...pending];
    const ordered = [];
    while (remaining.length) {
      const minLoad = Math.min(...loads.values());
      const minGroup = Math.min(...groupLoads.values());
      const evaluated = remaining.map(match => {
        const homeLoad = loads.get(String(match.homeId)) || 0;
        const awayLoad = loads.get(String(match.awayId)) || 0;
        const fairness = clamp(100 - ((homeLoad - minLoad) + (awayLoad - minLoad)) * 18);
        const rest = recentPlayers.has(String(match.homeId)) || recentPlayers.has(String(match.awayId)) ? 10 : 100;
        const groupBalance = clamp(100 - ((groupLoads.get(match.group) || 0) - minGroup) * 14);
        const impact = clamp(importance.get(match.id) || 0);
        const progression = clamp(100 - (Number(match.leg || 1) - 1) * 18 - (Number(match.matchday || 1) - 1) * 1.5);
        const priority = fairness * .31 + rest * .27 + groupBalance * .18 + impact * .16 + progression * .08;
        const why = rest < 50
          ? ui("Ardışık oyuncu riski", "Consecutive-player risk")
          : fairness >= 82 && groupBalance >= 82
            ? ui("Maç yükü ve grup dengesi", "Player-load and group balance")
            : impact >= 55 ? ui("Yüksek turnuva etkisi", "High tournament impact") : ui("Adil operasyon sırası", "Fair operating order");
        return { match, evolution: { priority, fairness, rest, groupBalance, impact, progression, why } };
      }).sort((a, b) => b.evolution.priority - a.evolution.priority || Number(a.match.sequence || 0) - Number(b.match.sequence || 0));
      const selected = evaluated[0];
      const index = remaining.findIndex(match => match.id === selected.match.id);
      remaining.splice(index, 1);
      const output = { ...selected.match, evolution: selected.evolution };
      ordered.push(output);
      loads.set(String(output.homeId), (loads.get(String(output.homeId)) || 0) + 1);
      loads.set(String(output.awayId), (loads.get(String(output.awayId)) || 0) + 1);
      groupLoads.set(output.group, (groupLoads.get(output.group) || 0) + 1);
      recentPlayers = new Set([String(output.homeId), String(output.awayId)]);
    }
    return ordered;
  }

  function recordChases(data, draw) {
    const byName = new Map((data?.players || []).map(player => [player.key, player]));
    const players = (draw?.participants || []).map(participant => {
      const key = normalize(participant.name);
      return byName.get(key) || {
        id: String(participant.id),
        key,
        name: participant.name,
        games: 0,
        wins: 0,
        gf: 0,
        titles: 0,
        finals: 0,
        legacy: 0
      };
    });
    const metrics = {
      games: { label: ui("Maç", "Matches"), values: MILESTONE_THRESHOLDS.games },
      wins: { label: ui("Galibiyet", "Wins"), values: MILESTONE_THRESHOLDS.wins },
      gf: { label: ui("Gol", "Goals"), values: MILESTONE_THRESHOLDS.gf },
      titles: { label: ui("Şampiyonluk", "Titles"), values: MILESTONE_THRESHOLDS.titles },
      finals: { label: ui("Final", "Finals"), values: MILESTONE_THRESHOLDS.finals }
    };
    const records = Object.fromEntries(Object.keys(metrics).map(key => {
      const leader = [...(data?.players || [])].sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || b.games - a.games)[0];
      return [key, { value: Number(leader?.[key] || 0), player: leader?.name || "–" }];
    }));
    return players.map(player => {
      const milestoneRows = Object.entries(metrics).map(([key, meta]) => {
        const current = Number(player[key] || 0);
        const target = meta.values.find(value => value > current) || null;
        return target ? { type: "milestone", metric: key, label: meta.label, current, target, distance: target - current, progress: current / target * 100 } : null;
      }).filter(Boolean);
      const recordRows = Object.entries(records).map(([key, record]) => {
        const current = Number(player[key] || 0);
        const target = record.value + (normalize(record.player) === player.key ? 0 : 1);
        return {
          type: "record", metric: key, label: metrics[key].label,
          current, target, distance: Math.max(0, target - current),
          leader: record.player, leaderValue: record.value,
          progress: target ? current / target * 100 : 100
        };
      });
      const nearest = [...milestoneRows, ...recordRows]
        .sort((a, b) => a.distance - b.distance || b.progress - a.progress)
        .slice(0, 4);
      return { player, milestones: milestoneRows, records: recordRows, nearest };
    }).sort((a, b) => a.nearest[0]?.distance - b.nearest[0]?.distance || b.player.legacy - a.player.legacy);
  }

  function careerStateLabel(key) {
    const labels = {
      introduction: ["Başlangıç", "Introduction"],
      breakthrough: ["Çıkış", "Breakthrough"],
      ascendancy: ["Yükseliş", "Ascendancy"],
      prime: ["Zirve", "Prime"],
      dominance: ["Hâkimiyet", "Dominance"],
      decline: ["Düşüş", "Decline"],
      renaissance: ["Yeniden Doğuş", "Renaissance"],
      established: ["Yerleşik Güç", "Established"],
      legacy: ["Miras Dönemi", "Legacy Phase"]
    };
    return ui(...(labels[key] || labels.established));
  }

  function classifyCareer(player, activeEdition) {
    const editions = [...(player.editions || [])].sort((a, b) => a.edition - b.edition);
    if (!editions.length) return { key: "introduction", label: careerStateLabel("introduction"), trend: 0, peak: null, segments: [] };
    const scores = editions.map(edition => Number(edition.dnaScore || 50));
    const peakValue = Math.max(...scores);
    const peakIndex = scores.indexOf(peakValue);
    const current = scores[scores.length - 1];
    const previous = scores[scores.length - 2] ?? current;
    const prior = scores[scores.length - 3] ?? previous;
    const trend = current - previous;
    const lastEdition = editions[editions.length - 1].edition;
    let key = "established";
    if (lastEdition < Number(activeEdition || lastEdition) - 1) key = "legacy";
    else if (player.games < 8 || editions.length === 1 && player.games < 12) key = "introduction";
    else if (player.titles >= 2 && current >= 76 && current >= peakValue - 5) key = "dominance";
    else if (current >= 72 && current >= peakValue - 4) key = "prime";
    else if (trend >= 9 && previous <= peakValue - 8 && prior > previous) key = "renaissance";
    else if (trend >= 7) key = editions.length <= 2 ? "breakthrough" : "ascendancy";
    else if (trend <= -10 && current < peakValue - 10) key = "decline";
    else if (editions.length <= 2 && current >= 60) key = "breakthrough";
    const segments = editions.map((edition, index) => {
      const score = scores[index];
      const slope = index ? score - scores[index - 1] : 0;
      let state = "established";
      if (index === 0) state = "introduction";
      else if (score >= peakValue - 3 && score >= 70) state = player.titles >= 2 ? "dominance" : "prime";
      else if (slope >= 8) state = index > 1 && scores[index - 1] < peakValue - 10 ? "renaissance" : "ascendancy";
      else if (slope <= -10) state = "decline";
      else if (index === 1 && slope > 2) state = "breakthrough";
      return { edition: edition.edition, score, state, label: careerStateLabel(state), games: edition.games, ppg: edition.ppg };
    });
    return {
      key,
      label: careerStateLabel(key),
      trend,
      current,
      peak: { edition: editions[peakIndex].edition, score: peakValue },
      segments
    };
  }

  function careerStates(data, activeEdition = 10) {
    return (data?.players || []).map(player => ({ player, career: classifyCareer(player, activeEdition) }))
      .sort((a, b) => b.player.legacy - a.player.legacy || b.player.games - a.player.games);
  }

  function linealCrown(data, draw) {
    const honours = (data?.honours || []).filter(record => record.competition === "oruc" && record.winner).sort((a, b) => a.edition - b.edition);
    const first = honours[0];
    if (!first) return { holder: "", reigns: [], transfers: [], nextDefense: null, longest: null, mostReigns: null };
    let holder = first.winner;
    const reigns = [{ holder, startEdition: first.edition, acquiredFrom: "", acquiredMatch: null, defenses: 0, challenged: 0, active: true }];
    const transfers = [];
    const orderedMatches = [...(data.matches || [])].filter(match => match.edition >= first.edition);
    orderedMatches.forEach(match => {
      const holderHome = normalize(match.homeName) === normalize(holder);
      const holderAway = normalize(match.awayName) === normalize(holder);
      if (!holderHome && !holderAway) return;
      const reign = reigns[reigns.length - 1];
      reign.challenged += 1;
      const opponent = holderHome ? match.awayName : match.homeName;
      const winner = match.winnerName || (match.homeScore > match.awayScore ? match.homeName : match.awayScore > match.homeScore ? match.awayName : "");
      if (winner && normalize(winner) === normalize(opponent)) {
        reign.active = false;
        reign.endEdition = match.edition;
        reign.lostMatch = match;
        transfers.push({ edition: match.edition, from: holder, to: opponent, match });
        const previous = holder;
        holder = opponent;
        reigns.push({ holder, startEdition: match.edition, acquiredFrom: previous, acquiredMatch: match, defenses: 0, challenged: 0, active: true });
      } else {
        reign.defenses += 1;
      }
    });
    const counts = new Map();
    reigns.forEach(reign => counts.set(normalize(reign.holder), {
      player: reign.holder,
      reigns: (counts.get(normalize(reign.holder))?.reigns || 0) + 1,
      defenses: (counts.get(normalize(reign.holder))?.defenses || 0) + reign.defenses
    }));
    const longest = [...reigns].sort((a, b) => b.defenses - a.defenses || b.challenged - a.challenged)[0] || null;
    const mostReigns = [...counts.values()].sort((a, b) => b.reigns - a.reigns || b.defenses - a.defenses)[0] || null;
    const holderPlayer = (draw?.participants || []).find(player => normalize(player.name) === normalize(holder));
    const nextDefense = holderPlayer
      ? (draw.fixtures || []).find(match => !match.completed && [String(match.homeId), String(match.awayId)].includes(String(holderPlayer.id))) || null
      : null;
    return { holder, startedEdition: first.edition, reigns, transfers, longest, mostReigns, nextDefense, holderPlayer };
  }

  function reliabilityIndex(payload, draw, data, integrity = integritySentinel(payload, draw)) {
    const current = currentDraw(draw);
    const active = current?.participants || [];
    const byName = new Map((data?.players || []).map(player => [player.key, player]));
    const knockout = allChampionshipMatches(draft(payload).championshipOS, current).filter(match => match.completed);
    return active.map(participant => {
      const player = byName.get(normalize(participant.name));
      const groupMatches = (current.fixtures || []).filter(match => match.completed && [String(match.homeId), String(match.awayId)].includes(String(participant.id)));
      const groupWithTeams = groupMatches.filter(match => {
        const team = String(match.homeId) === String(participant.id) ? match.homeTeam : match.awayTeam;
        return Boolean(team);
      }).length;
      const playerKnockout = knockout.filter(match => [String(match.homeId), String(match.awayId)].includes(String(participant.id)));
      const confirmations = playerKnockout.filter(match => {
        const side = String(match.homeId) === String(participant.id) ? "home" : "away";
        return Boolean(match.confirmation?.[side]);
      }).length;
      const relatedIssues = integrity.issues.filter(issue => issue.playerIds.includes(String(participant.id)) && issue.severity !== "info");
      const editions = (player?.editions || []).map(edition => edition.edition);
      const span = editions.length ? Math.max(...editions) - Math.min(...editions) + 1 : 1;
      const completeness = groupMatches.length ? groupWithTeams / groupMatches.length * 100 : 100;
      const confirmation = playerKnockout.length ? confirmations / playerKnockout.length * 100 : null;
      const integrityScore = clamp(100 - relatedIssues.filter(issue => issue.severity === "critical").length * 35 - relatedIssues.filter(issue => issue.severity === "error").length * 16 - relatedIssues.filter(issue => issue.severity === "warning").length * 7);
      const continuity = editions.length ? editions.length / span * 100 : 50;
      const evidence = clamp((Number(player?.games || 0)) / (Number(player?.games || 0) + 12) * 100);
      const metrics = [
        { key: "completeness", value: completeness, weight: 36 },
        { key: "integrity", value: integrityScore, weight: 32 },
        { key: "continuity", value: continuity, weight: 16 },
        { key: "evidence", value: evidence, weight: 16 }
      ];
      if (confirmation != null) {
        metrics.find(metric => metric.key === "completeness").weight = 28;
        metrics.find(metric => metric.key === "integrity").weight = 28;
        metrics.find(metric => metric.key === "continuity").weight = 12;
        metrics.find(metric => metric.key === "evidence").weight = 12;
        metrics.push({ key: "confirmation", value: confirmation, weight: 20 });
      }
      const score = metrics.reduce((sum, metric) => sum + metric.value * metric.weight, 0) / metrics.reduce((sum, metric) => sum + metric.weight, 0);
      const grade = score >= 92 ? "A+" : score >= 84 ? "A" : score >= 74 ? "B" : score >= 62 ? "C" : "REVIEW";
      return {
        id: String(participant.id), name: participant.name, score, grade,
        completeness, confirmation, integrityScore, continuity, evidence,
        relatedIssues: relatedIssues.length,
        note: ui("Oyunculuk gücünden bağımsız operasyonel veri göstergesi.", "Operational data indicator, separate from playing strength.")
      };
    }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "tr"));
  }

  function milestoneTitle(kind, value) {
    const labels = {
      games: [`${value}. Resmî Maç`, `${value} Official Matches`],
      wins: [`${value}. Galibiyet`, `${value} Wins`],
      gf: [`${value}. Kariyer Golü`, `${value} Career Goals`],
      titles: [`${value}. Şampiyonluk`, `${value} Championships`],
      finals: [`${value}. Final`, `${value} Finals`]
    };
    return ui(...(labels[kind] || [`${value} ${kind}`, `${value} ${kind}`]));
  }

  function milestoneCentre(payload, draw, data, crown) {
    const ledger = [...(draft(payload).milestoneLedger || [])].reverse();
    const activeNames = new Set((draw?.participants || []).map(player => normalize(player.name)));
    const imminent = (data?.players || []).filter(player => activeNames.has(player.key)).flatMap(player => {
      return Object.entries(MILESTONE_THRESHOLDS).map(([kind, thresholds]) => {
        const current = Number(player[kind] || 0);
        const target = thresholds.find(value => value > current);
        if (!target) return null;
        const distance = target - current;
        const close = kind === "gf" ? distance <= 12 : kind === "titles" || kind === "finals" ? distance <= 1 : distance <= 4;
        return close ? { player: player.name, kind, current, target, distance, title: milestoneTitle(kind, target) } : null;
      }).filter(Boolean);
    }).sort((a, b) => a.distance - b.distance);
    const crownHolder = (data?.players || []).find(player => normalize(player.name) === normalize(crown?.holder));
    if (crownHolder && crown?.reigns?.at(-1)?.defenses != null) {
      const defenses = crown.reigns.at(-1).defenses;
      const target = [5, 10, 20, 30].find(value => value > defenses);
      if (target && target - defenses <= 3) imminent.push({
        player: crown.holder,
        kind: "crown",
        current: defenses,
        target,
        distance: target - defenses,
        title: ui(`${target} Lineal Crown Savunması`, `${target} Lineal Crown Defences`)
      });
    }
    return { ledger, imminent: imminent.slice(0, 20) };
  }

  function extractNewOfficialMatches(nextPayload, previousPayload) {
    const nextDraft = draft(nextPayload);
    const previousDraft = draft(previousPayload);
    const nextDraw = nextDraft.draw;
    const previousDraw = previousDraft.draw;
    const previousIds = new Set((previousDraw?.fixtures || []).filter(match => match.completed).map(match => match.id));
    const players = playerMap(nextDraw);
    const added = (nextDraw?.fixtures || []).filter(match => match.completed && !previousIds.has(match.id)).map(match => ({
      id: match.id,
      homeName: players.get(String(match.homeId))?.name || "",
      awayName: players.get(String(match.awayId))?.name || "",
      homeScore: Number(match.homeScore),
      awayScore: Number(match.awayScore)
    }));
    const previousKnockout = new Set(allChampionshipMatches(previousDraft.championshipOS, previousDraw).filter(match => match.completed).map(match => match.id));
    allChampionshipMatches(nextDraft.championshipOS, nextDraw).filter(match => match.completed && !previousKnockout.has(match.id)).forEach(match => added.push({
      id: match.id,
      homeName: match.homeName,
      awayName: match.awayName,
      homeScore: Number(match.homeScore),
      awayScore: Number(match.awayScore)
    }));
    return added;
  }

  function captureMilestoneEvents(nextPayload, previousPayload) {
    if (!previousPayload) return;
    const nextDraft = draft(nextPayload);
    nextDraft.milestoneLedger = Array.isArray(nextDraft.milestoneLedger) ? nextDraft.milestoneLedger : [];
    const previousData = universeData(previousPayload, draft(previousPayload).draw);
    const totals = new Map((previousData.players || []).map(player => [player.key, {
      name: player.name,
      games: Number(player.games || 0),
      wins: Number(player.wins || 0),
      gf: Number(player.gf || 0),
      titles: Number(player.titles || 0),
      finals: Number(player.finals || 0)
    }]));
    const before = new Map([...totals.entries()].map(([key, value]) => [key, { ...value }]));
    const ensure = name => {
      const key = normalize(name);
      if (!totals.has(key)) totals.set(key, { name, games: 0, wins: 0, gf: 0, titles: 0, finals: 0 });
      return totals.get(key);
    };
    extractNewOfficialMatches(nextPayload, previousPayload).forEach(match => {
      const home = ensure(match.homeName);
      const away = ensure(match.awayName);
      home.games += 1; away.games += 1;
      home.gf += match.homeScore; away.gf += match.awayScore;
      if (match.homeScore > match.awayScore) home.wins += 1;
      if (match.awayScore > match.homeScore) away.wins += 1;
    });
    const nextChampion = nextDraft.championshipOS?.championId;
    const previousChampion = draft(previousPayload).championshipOS?.championId;
    if (nextChampion && String(nextChampion) !== String(previousChampion || "")) {
      const player = playerMap(nextDraft.draw).get(String(nextChampion));
      if (player) {
        const row = ensure(player.name);
        row.titles += 1;
        row.finals += 1;
      }
    }
    const existingKeys = new Set(nextDraft.milestoneLedger.map(event => event.key));
    totals.forEach((after, key) => {
      const prior = before.get(key) || { games: 0, wins: 0, gf: 0, titles: 0, finals: 0 };
      Object.entries(MILESTONE_THRESHOLDS).forEach(([kind, thresholds]) => thresholds.forEach(value => {
        if (Number(prior[kind] || 0) < value && Number(after[kind] || 0) >= value) {
          const eventKey = `${key}:${kind}:${value}`;
          if (existingKeys.has(eventKey)) return;
          nextDraft.milestoneLedger.push({
            id: `F10-MS-${Date.now().toString(36).toUpperCase()}-${nextDraft.milestoneLedger.length + 1}`,
            key: eventKey,
            at: nowISO(),
            player: after.name,
            kind,
            value,
            source: "official-transition"
          });
          existingKeys.add(eventKey);
        }
      }));
    });
    if (nextDraft.milestoneLedger.length > 160) nextDraft.milestoneLedger.splice(0, nextDraft.milestoneLedger.length - 160);
  }

  function svgTimeline(points) {
    const width = 760;
    const height = 250;
    if (!points?.length) return "";
    const maxCompleted = Math.max(1, ...points.map(point => point.completed));
    const x = completed => 42 + completed / maxCompleted * (width - 72);
    const y = value => 20 + (100 - clamp(value)) / 100 * (height - 52);
    const line = key => points.map(point => `${x(point.completed).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
    return `<svg class="evo-equity-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ui("Oyuncu ihtimal zaman çizgisi", "Player probability timeline")}">
      ${[0,25,50,75,100].map(value => `<line x1="42" y1="${y(value)}" x2="${width - 20}" y2="${y(value)}"/><text x="5" y="${y(value) + 4}">${value}%</text>`).join("")}
      <polyline class="direct" points="${line("directPct")}"/><polyline class="title" points="${line("titlePct")}"/>
      ${points.map(point => `<circle class="direct" cx="${x(point.completed)}" cy="${y(point.directPct)}" r="4"><title>${point.completed} · QF ${point.directPct.toFixed(1)}%</title></circle><circle class="title" cx="${x(point.completed)}" cy="${y(point.titlePct)}" r="4"><title>${point.completed} · TITLE ${point.titlePct.toFixed(1)}%</title></circle>`).join("")}
    </svg>`;
  }

  function moduleBadge(title, copy) {
    return `<article><span>${esc(title)}</span><small>${esc(copy)}</small></article>`;
  }

  function renderEquity(payload, draw) {
    const equity = equityTimeline(payload, draw);
    const selected = equity.selected;
    const latest = selected?.points?.at(-1);
    const first = selected?.points?.[0];
    const directDelta = latest && first ? latest.directPct - first.directPct : 0;
    const titleDelta = latest && first ? latest.titlePct - first.titlePct : 0;
    return `<section class="evo-panel" data-evo-panel="equity">
      <div class="evo-module-strip">${moduleBadge("CHAMPIONSHIP EQUITY TIMELINE", ui("Her resmî kayıt anında yol ihtimalleri", "Path probabilities at every official save moment"))}${moduleBadge("TURNING POINT DETECTOR", ui("En büyük olasılık sıçramaları", "Largest probability swings"))}${moduleBadge("FORECAST MEMORY", ui("Tahminin sonradan değil, o anda kaydı", "Predictions recorded at the time, not rewritten later"))}</div>
      <section class="evo-equity-hero"><div><span>CHAMPIONSHIP EQUITY TIMELINE</span><h3>${ui("Turnuvanın olasılık hafızası.", "The tournament's probability memory.")}</h3><p>${ui("Her resmî sonuç anındaki Direct QF ve şampiyonluk ihtimali saklanır. Geçmiş tahminler yeni sonuçlarla geriye dönük değiştirilmez.", "Direct-QF and title probability are preserved at each official result moment. Past forecasts are not rewritten by later results.")}</p></div><aside><article><span>${ui("YAKALANAN AN", "CAPTURED MOMENTS")}</span><b>${equity.moments.length}</b></article><article><span>${ui("İŞLENEN MAÇ", "MATCHES RECORDED")}</span><b>${equity.completed}/${draw?.fixtures?.length || 78}</b></article></aside></section>
      <label class="evo-selector">${ui("Oyuncu", "Player")}<select id="evoEquityPlayer">${equity.players.map(player => `<option value="${esc(player.id)}" ${player.id === selected?.id ? "selected" : ""}>${esc(player.name)}</option>`).join("")}</select></label>
      ${selected ? `<section class="evo-equity-chart"><header><div><span>${esc(selected.name)}</span><h4>${ui("Şampiyonluk Değer Eğrisi", "Championship Equity Curve")}</h4></div><div><b class="${directDelta >= 0 ? "up" : "down"}">${directDelta >= 0 ? "+" : ""}${directDelta.toFixed(1)} QF</b><b class="${titleDelta >= 0 ? "up" : "down"}">${titleDelta >= 0 ? "+" : ""}${titleDelta.toFixed(1)} TITLE</b></div></header>${svgTimeline(selected.points)}<footer><span><i class="direct"></i> DIRECT QF</span><span><i class="title"></i> CHAMPIONSHIP</span><small>${ui("X ekseni: tamamlanan grup maçı sayısı", "X-axis: completed group matches")}</small></footer></section>` : ""}
      <div class="evo-equity-table">${equity.players.map(player => {
        const current = player.points.at(-1) || {};
        const start = player.points[0] || {};
        const swing = Number(current.titlePct || 0) - Number(start.titlePct || 0);
        return `<article><strong>${esc(player.name)}</strong><span>QF <b>${Number(current.directPct || 0).toFixed(1)}%</b></span><span>PLAY-IN <b>${Math.max(0, Number(current.top12Pct || 0) - Number(current.directPct || 0)).toFixed(1)}%</b></span><span>TITLE <b>${Number(current.titlePct || 0).toFixed(1)}%</b></span><em class="${swing >= 0 ? "up" : "down"}">${swing >= 0 ? "+" : ""}${swing.toFixed(1)}</em></article>`;
      }).join("")}</div>
    </section>`;
  }

  function renderTwin(payload, draw) {
    const data = universeData(payload, draw);
    const twins = digitalTwins(data);
    const first = twins.find(player => player.key === normalize(selectedTwinA)) || twins[0];
    const second = twins.find(player => player.key === normalize(selectedTwinB) && player.key !== first?.key) || twins.find(player => player.key !== first?.key);
    if (first) selectedTwinA = first.name;
    if (second) selectedTwinB = second.name;
    const matchup = twinMatchup(data, first?.name, second?.name, selectedTwinStars);
    const options = selected => twins.map(player => `<option value="${esc(player.name)}" ${player.key === selected?.key ? "selected" : ""}>${esc(player.name)}</option>`).join("");
    return `<section class="evo-panel" data-evo-panel="twin">
      <div class="evo-module-strip">${moduleBadge("BAYESIAN PLAYER DIGITAL TWIN", ui("Rakip, takım, seviye ve baskı düzeltilmiş güç", "Strength adjusted for opposition, team, tier and pressure"))}${moduleBadge("CREDIBLE RANGE", ui("Tek sayı yerine taban–tavan aralığı", "Floor-to-ceiling range instead of one number"))}${moduleBadge("MATCHUP LAB", ui("Oyuncuya ve yıldız seviyesine özel eşleşme", "Player- and tier-specific matchup"))}</div>
      <section class="evo-twin-hero"><div><span>BAYESIAN PLAYER DIGITAL TWIN</span><h3>${ui("Oyuncunun yaşayan matematiksel ikizi.", "A living mathematical twin of the player.")}</h3><p>${ui("Model sonuçtan rakip beklentisini çıkarır, düşük örneklemi merkeze doğru daraltır ve belirsizliği açıkça gösterir.", "The model removes opponent expectation, shrinks small samples toward the prior and displays uncertainty explicitly.")}</p></div><b>BETA POSTERIOR · OPPONENT ADJUSTED</b></section>
      <div class="evo-matchup-controls"><label>PLAYER A<select id="evoTwinA">${options(first)}</select></label><label>${ui("SEVİYE", "TIER")}<select id="evoTwinStars">${[4,4.5,5].map(stars => `<option value="${stars}" ${Number(stars) === Number(selectedTwinStars) ? "selected" : ""}>${stars}★</option>`).join("")}</select></label><label>PLAYER B<select id="evoTwinB">${options(second)}</select></label></div>
      ${first && second ? `<section class="evo-matchup"><article><span>${first.dominantTier.stars}★ ${ui("baskın seviye", "dominant tier")}</span><h4>${esc(first.name)}</h4><b>${first.posteriorRating.toFixed(0)}</b><small>${first.lowerRating.toFixed(0)}–${first.upperRating.toFixed(0)}</small></article><div><span>${selectedTwinStars}★ MATCHUP</span><div><b>${matchup.firstWin.toFixed(1)}%</b><i>${matchup.draw.toFixed(1)}%</i><b>${matchup.secondWin.toFixed(1)}%</b></div><small>${ui("Model güveni", "Model confidence")} ${matchup.confidence.toFixed(0)}% · ${matchup.h2hGames} H2H</small></div><article><span>${second.dominantTier.stars}★ ${ui("baskın seviye", "dominant tier")}</span><h4>${esc(second.name)}</h4><b>${second.posteriorRating.toFixed(0)}</b><small>${second.lowerRating.toFixed(0)}–${second.upperRating.toFixed(0)}</small></article></section>` : ""}
      <div class="evo-twin-grid">${twins.slice(0, 15).map((player, index) => `<article><i>${index + 1}</i><div><strong>${esc(player.name)}</strong><small>${player.games} MP · ${ui("kanıt", "evidence")} ${player.evidence.toFixed(0)}% · ${ui("oynaklık", "volatility")} ${player.volatility.toFixed(0)}</small></div><b>${player.posteriorRating.toFixed(0)}</b><span>${player.lowerRating.toFixed(0)}–${player.upperRating.toFixed(0)}</span><em>${player.dominantTier.stars}★</em></article>`).join("")}</div>
      <p class="evo-model-note">${ui("Digital Twin bir resmî sıralama değildir; tahmin ve karşılaştırma modelidir. Güven aralığı geniş oyuncularda belirsizlik daha yüksektir.", "Digital Twin is not an official ranking; it is a prediction and comparison model. A wider credible range means greater uncertainty.")}</p>
    </section>`;
  }

  function renderOperations(payload, draw) {
    const integrity = integritySentinel(payload, draw);
    const schedule = optimizedSchedule(draw, payload);
    const players = playerMap(draw);
    return `<section class="evo-panel" data-evo-panel="operations">
      <div class="evo-module-strip">${moduleBadge("TOURNAMENT INTEGRITY SENTINEL", ui("Skor, takım, bracket ve hash denetimi", "Score, team, bracket and hash audit"))}${moduleBadge("DYNAMIC SCHEDULER 2.0", ui("Dinlenme, yük, grup dengesi ve maç etkisi", "Rest, load, group balance and match impact"))}${moduleBadge("NON-BLOCKING CONTROL", ui("Uyarılar sonuç girişini gizlice durdurmaz", "Warnings never silently block result entry"))}</div>
      <section class="evo-integrity-hero status-${integrity.status}"><div><span>TOURNAMENT INTEGRITY SENTINEL</span><h3>${ui("Resmî veri sağlık kontrolü.", "Official data health check.")}</h3><p>${ui("Sentinel veriyi değiştirmez; tutarsızlıkları kanıtıyla gösterir ve yöneticinin karar vermesini sağlar.", "Sentinel does not change data; it shows inconsistencies with evidence and leaves decisions to the administrator.")}</p></div><strong>${integrity.score.toFixed(0)}</strong><aside><span>${integrity.counts.critical} CRITICAL</span><span>${integrity.counts.error} ERROR</span><span>${integrity.counts.warning} WARNING</span><span>${integrity.counts.info} INFO</span></aside></section>
      <section class="evo-issues"><header><div><span>INTEGRITY FINDINGS</span><h4>${ui("Denetim Bulguları", "Audit Findings")}</h4></div><b>${integrity.issues.length}</b></header><div>${integrity.issues.slice(0, 30).map(issue => `<article class="severity-${issue.severity}"><i>${issue.severity.toUpperCase()}</i><div><strong>${esc(issue.title)}</strong><small>${esc(issue.detail)}</small></div><code>${issue.code}</code></article>`).join("") || `<p>✓ ${ui("Kritik veri tutarsızlığı bulunmadı.", "No critical data inconsistency found.")}</p>`}</div></section>
      <section class="evo-scheduler"><header><div><span>DYNAMIC SCHEDULING OPTIMIZER 2.0</span><h4>${ui("Adalet ve Dinlenme Odaklı Operasyon Sırası", "Fairness- and Rest-Aware Operating Order")}</h4><p>${ui("Öneri; oyuncu yükü, ardışık maç riski, grup ilerlemesi ve turnuva etkisini birlikte değerlendirir.", "The recommendation combines player load, consecutive-match risk, group progress and tournament impact.")}</p></div><b>${schedule.length} ${ui("BEKLEYEN", "PENDING")}</b></header><div>${schedule.slice(0, 20).map((match, index) => `<button type="button" data-f10draw-action="open-result" data-fixture-id="${esc(match.id)}" ${app()?.isAdmin?.() ? "" : "disabled"}><i>${String(index + 1).padStart(2, "0")}</i><div><span>${ui("GRUP", "GROUP")} ${match.group} · ${match.stars}★ · MD ${match.matchday}</span><strong>${esc(players.get(String(match.homeId))?.name || "–")} <em>VS</em> ${esc(players.get(String(match.awayId))?.name || "–")}</strong><small>${esc(match.evolution?.why || "")}</small></div><b>${Number(match.evolution?.priority || 0).toFixed(0)}</b><aside><span>REST ${Number(match.evolution?.rest || 0).toFixed(0)}</span><span>FAIR ${Number(match.evolution?.fairness || 0).toFixed(0)}</span><span>IMPACT ${Number(match.evolution?.impact || 0).toFixed(0)}</span></aside></button>`).join("") || `<p>${ui("Bütün grup maçları tamamlandı.", "All group matches are complete.")}</p>`}</div></section>
    </section>`;
  }

  function renderLegacy(payload, draw) {
    const data = universeData(payload, draw);
    const chases = recordChases(data, draw);
    const careers = careerStates(data, payload?.seasonSystem?.activeEdition || 10);
    const activeNames = new Set((draw?.participants || []).map(player => normalize(player.name)));
    const activeCareers = careers.filter(row => activeNames.has(row.player.key));
    const crown = linealCrown(data, draw);
    const integrity = integritySentinel(payload, draw);
    const reliability = reliabilityIndex(payload, draw, data, integrity);
    const milestones = milestoneCentre(payload, draw, data, crown);
    const currentReign = crown.reigns.at(-1);
    return `<section class="evo-panel" data-evo-panel="legacy">
      <div class="evo-module-strip">${moduleBadge("RECORD CHASE CENTRE", ui("Canlı rekor ve eşik takibi", "Live records and milestone pursuit"))}${moduleBadge("CAREER STATE ENGINE", ui("Çıkış, zirve, düşüş ve yeniden doğuş", "Breakthrough, prime, decline and renaissance"))}${moduleBadge("LINEAL FIFA CROWN", ui("Maçtan maça devreden yaşayan unvan", "A living title transferred match by match"))}${moduleBadge("TOURNAMENT RELIABILITY INDEX", ui("Güçten bağımsız operasyonel kanıt", "Operational evidence separate from playing strength"))}${moduleBadge("LIVING MILESTONE CEREMONY", ui("Eşik geçildiği anda otomatik tören", "Automatic ceremony when a threshold is crossed"))}</div>
      <section class="evo-crown"><div><span>LINEAL FIFA CROWN</span><h3>${esc(crown.holder || "–")}</h3><p>${ui("Taç sahibi resmî bir maç kaybettiğinde unvan doğrudan rakibine geçer. Beraberlikte taç korunur.", "The Crown transfers directly to the opponent when the holder loses an official match. A draw retains the Crown.")}</p></div><article><span>${ui("MEVCUT SAVUNMA", "CURRENT DEFENCES")}</span><b>${currentReign?.defenses || 0}</b></article><article><span>${ui("TAÇ DEĞİŞİMİ", "TRANSFERS")}</span><b>${crown.transfers.length}</b></article><article><span>${ui("EN UZUN SALTANAT", "LONGEST REIGN")}</span><b>${esc(crown.longest?.holder || "–")}</b><small>${crown.longest?.defenses || 0} ${ui("savunma", "defences")}</small></article><aside><span>${ui("SIRADAKİ SAVUNMA", "NEXT DEFENCE")}</span><strong>${crown.nextDefense ? `${esc(playerMap(draw).get(String(crown.nextDefense.homeId))?.name || "–")} vs ${esc(playerMap(draw).get(String(crown.nextDefense.awayId))?.name || "–")}` : ui("Bekleyen maç bulunmuyor", "No pending defence")}</strong></aside></section>
      <div class="evo-legacy-grid"><section class="evo-records"><header><div><span>RECORD CHASE CENTRE</span><h4>${ui("Rekora En Yakın Oyuncular", "Players Closest to History")}</h4></div><b>${chases.length}</b></header><div>${chases.map(row => `<article><strong>${esc(row.player.name)}</strong>${row.nearest.slice(0, 3).map(chase => `<span><small>${chase.type === "record" ? "RECORD" : "MILESTONE"} · ${esc(chase.label)}</small><b>${chase.current}/${chase.target}</b><i style="width:${clamp(chase.progress)}%"></i></span>`).join("")}</article>`).join("")}</div></section>
      <section class="evo-careers"><header><div><span>CAREER STATE ENGINE</span><h4>${ui("Yaşayan Kariyer Evreleri", "Living Career States")}</h4></div><b>${activeCareers.length}</b></header><div>${activeCareers.map(row => `<article class="state-${row.career.key}"><div><strong>${esc(row.player.name)}</strong><span>${esc(row.career.label)}</span></div><b>${row.career.current?.toFixed(1) || "–"}</b><small>${ui("Zirve", "Peak")} FIFA ${row.career.peak?.edition || "–"} · ${row.career.peak?.score.toFixed(1) || "–"}</small><div class="evo-career-track">${row.career.segments.map(segment => `<i class="${segment.state}" title="FIFA ${segment.edition} · ${esc(segment.label)} · ${segment.score.toFixed(1)}"></i>`).join("")}</div></article>`).join("")}</div></section></div>
      <section class="evo-reliability"><header><div><span>TOURNAMENT RELIABILITY INDEX</span><h4>${ui("Operasyonel Veri Güvenilirliği", "Operational Data Reliability")}</h4><p>${ui("Bu tablo oyunculuk gücü, sıralama veya ödül değildir.", "This table is not playing strength, ranking or an award.")}</p></div><b>NOT A SKILL RATING</b></header><div>${reliability.map((row, index) => `<article><i>${index + 1}</i><strong>${esc(row.name)}</strong><b>${row.score.toFixed(1)}</b><em>${row.grade}</em><span>DATA ${row.completeness.toFixed(0)}</span><span>INTEGRITY ${row.integrityScore.toFixed(0)}</span><span>CONTINUITY ${row.continuity.toFixed(0)}</span><span>ACK ${row.confirmation == null ? "N/A" : row.confirmation.toFixed(0)}</span></article>`).join("")}</div></section>
      <section class="evo-milestones"><header><div><span>LIVING MILESTONE CEREMONY</span><h4>${ui("Yaşayan Kilometre Taşları", "Living Milestones")}</h4></div><b>${milestones.ledger.length} ${ui("TÖREN", "CEREMONIES")}</b></header><div class="evo-milestone-now">${milestones.ledger.slice(0, 8).map(event => `<article><span>OFFICIAL MILESTONE</span><strong>${esc(event.player)}</strong><h5>${esc(milestoneTitle(event.kind, event.value))}</h5><small>${new Date(event.at).toLocaleString()}</small></article>`).join("") || `<p>${ui("Yeni resmî eşik geçildiğinde tören kartı burada otomatik oluşacak.", "A ceremony card will appear automatically when a new official threshold is crossed.")}</p>`}</div><div class="evo-milestone-next">${milestones.imminent.map(item => `<article><strong>${esc(item.player)}</strong><span>${esc(item.title)}</span><b>${item.current}/${item.target}</b><small>${item.distance} ${ui("kaldı", "to go")}</small></article>`).join("")}</div></section>
    </section>`;
  }

  function renderPanel(payload, draw) {
    if (activePanel === "twin") return renderTwin(payload, draw);
    if (activePanel === "operations") return renderOperations(payload, draw);
    if (activePanel === "legacy") return renderLegacy(payload, draw);
    return renderEquity(payload, draw);
  }

  function render(payload, draw, options = {}) {
    const mount = options.mount || document.getElementById("f10EvolutionOSRoot");
    if (!mount) return "";
    lastMount = mount;
    lastPayload = payload || app()?.getState?.();
    lastDraw = currentDraw(draw);
    if (!PANELS.includes(activePanel)) activePanel = "equity";
    mount.innerHTML = `<section class="evo-root"><header class="evo-hero"><div><span>FIFA EVOLUTION OPERATING SYSTEM · V${VERSION}</span><h3>${ui("Her sonucu hatırla.", "Remember every result.")}<br><em>${ui("Her kariyeri anlamlandır.", "Make sense of every career.")}</em></h3><p>${ui("Olasılık hafızası, yaşayan oyuncu ikizleri, veri bütünlüğü, adil takvim, rekor yarışı, kariyer evreleri, Lineal Crown ve otomatik kilometre taşı törenleri.", "Probability memory, living player twins, data integrity, fair scheduling, record pursuits, career states, the Lineal Crown and automatic milestone ceremonies.")}</p></div><aside><article><span>${ui("SİSTEM", "SYSTEMS")}</span><b>9</b></article><article><span>${ui("VERİ KATMANI", "DATA LAYER")}</span><b>READ-ONLY</b></article><article><span>${ui("RESMÎ OLAY", "OFFICIAL EVENTS")}</span><b>${draft(lastPayload).milestoneLedger?.length || 0}</b></article></aside></header>
      <nav class="evo-nav">${[
        ["equity", ui("EQUITY TIMELINE", "EQUITY TIMELINE")],
        ["twin", ui("PLAYER DIGITAL TWIN", "PLAYER DIGITAL TWIN")],
        ["operations", ui("INTEGRITY & TAKVİM", "INTEGRITY & SCHEDULE")],
        ["legacy", ui("REKORLAR & MİRAS", "RECORDS & LEGACY")]
      ].map(([id, label]) => `<button type="button" class="${activePanel === id ? "active" : ""}" data-evo-action="panel" data-panel="${id}">${label}</button>`).join("")}</nav>
      <main>${renderPanel(lastPayload, lastDraw)}</main>
      <footer><span>${ui("RESMÎ SIRALAMA DEĞİŞMEZ", "OFFICIAL RANKING UNCHANGED")}</span><span>${ui("MODEL BELİRSİZLİĞİ GÖSTERİLİR", "MODEL UNCERTAINTY DISCLOSED")}</span><span>${ui("RELIABILITY ≠ OYUNCU GÜCÜ", "RELIABILITY ≠ PLAYING STRENGTH")}</span></footer></section>`;
    persist();
    installListeners();
    return mount.innerHTML;
  }

  function persist() {
    sessionStorage.setItem("fifa-evolution-panel", activePanel);
    sessionStorage.setItem("fifa-evolution-equity-player", selectedEquityPlayer);
    sessionStorage.setItem("fifa-evolution-twin-a", selectedTwinA);
    sessionStorage.setItem("fifa-evolution-twin-b", selectedTwinB);
    sessionStorage.setItem("fifa-evolution-twin-stars", String(selectedTwinStars));
  }

  function rerender() {
    const mount = document.getElementById("f10EvolutionOSRoot") || lastMount;
    if (mount) render(app()?.getState?.() || lastPayload, currentDraw(), { mount });
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-evo-action]");
      if (!button) return;
      if (button.dataset.evoAction === "panel") {
        activePanel = PANELS.includes(button.dataset.panel) ? button.dataset.panel : "equity";
        rerender();
      }
    });
    document.addEventListener("change", event => {
      if (event.target?.id === "evoEquityPlayer") selectedEquityPlayer = event.target.value;
      else if (event.target?.id === "evoTwinA") selectedTwinA = event.target.value;
      else if (event.target?.id === "evoTwinB") selectedTwinB = event.target.value;
      else if (event.target?.id === "evoTwinStars") selectedTwinStars = Number(event.target.value || 4.5);
      else return;
      rerender();
    });
  }

  window.FIFA_EVOLUTION_OS = {
    version: VERSION,
    build: BUILD,
    render,
    equityTimeline: (payload, draw) => equityTimeline(payload || app()?.getState?.(), currentDraw(draw)),
    digitalTwins: data => digitalTwins(data || universeData()),
    twinMatchup: (data, first, second, stars) => twinMatchup(data || universeData(), first, second, stars),
    integrity: (payload, draw) => integritySentinel(payload || app()?.getState?.(), currentDraw(draw)),
    optimizedSchedule: (draw, payload) => optimizedSchedule(currentDraw(draw), payload || app()?.getState?.()),
    recordChases: (data, draw) => recordChases(data || universeData(), currentDraw(draw)),
    careerStates: (data, edition) => careerStates(data || universeData(), edition || app()?.getState?.()?.seasonSystem?.activeEdition || 10),
    linealCrown: (data, draw) => linealCrown(data || universeData(), currentDraw(draw)),
    reliability: (payload, draw, data) => {
      const currentPayload = payload || app()?.getState?.();
      const current = currentDraw(draw);
      return reliabilityIndex(currentPayload, current, data || universeData(currentPayload, current));
    },
    milestones: (payload, draw, data) => {
      const currentPayload = payload || app()?.getState?.();
      const current = currentDraw(draw);
      const currentData = data || universeData(currentPayload, current);
      return milestoneCentre(currentPayload, current, currentData, linealCrown(currentData, current));
    },
    captureMilestoneEvents
  };
})();
