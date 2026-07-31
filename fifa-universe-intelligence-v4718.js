(() => {
  "use strict";

  const VERSION = "47.18.0";
  const BUILD = "471800";
  const MIN_SAMPLE = 8;
  const PRIME_WINDOW = 10;
  const PANELS = Object.freeze([
    ["overview", "EVREN", "UNIVERSE"],
    ["players", "OYUNCULAR", "PLAYERS"],
    ["tournament", "TURNUVA LAB", "TOURNAMENT LAB"],
    ["rivalries", "REKABETLER", "RIVALRIES"],
    ["history", "ZAMAN MAKİNESİ", "TIME MACHINE"],
    ["teams", "TAKIM ZEKÂSI", "TEAM INTELLIGENCE"],
    ["media", "HİKÂYE & MEDYA", "STORY & MEDIA"]
  ]);

  let activePanel = sessionStorage.getItem("fifa-universe-panel") || "overview";
  let selectedPlayer = sessionStorage.getItem("fifa-universe-player") || "";
  let selectedRivalA = sessionStorage.getItem("fifa-universe-rival-a") || "";
  let selectedRivalB = sessionStorage.getItem("fifa-universe-rival-b") || "";
  let selectedEdition = Number(sessionStorage.getItem("fifa-universe-edition") || 0);
  let selectedAdvisorPlayer = sessionStorage.getItem("fifa-universe-advisor-player") || "";
  let selectedMediaStory = Number(sessionStorage.getItem("fifa-universe-media-story") || 0);
  let lastPayload = null;
  let lastDraw = null;
  let lastMount = null;
  let lastData = null;
  let lastSignature = "";
  let listenersInstalled = false;
  const qualificationCache = new Map();

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
  const round = (value, digits = 2) => Number((Number(value) || 0).toFixed(digits));
  const escapeHTML = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  const escapeXML = escapeHTML;
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
  const confidence = games => Number(games || 0) / (Number(games || 0) + 10);
  const canonicalPair = (first, second) => [String(first || ""), String(second || "")].sort((a, b) => normalize(a).localeCompare(normalize(b))).join("|||");
  const resultPoints = (match, side) => {
    const homeScore = Number(match.homeScore);
    const awayScore = Number(match.awayScore);
    if (homeScore > awayScore) return side === "home" ? 3 : 0;
    if (awayScore > homeScore) return side === "away" ? 3 : 0;
    if (match.winnerName) return normalize(match.winnerName) === normalize(side === "home" ? match.homeName : match.awayName) ? 3 : 0;
    return 1;
  };
  const stageWeight = stage => {
    const value = normalize(stage);
    if (/grand final|buyuk final/.test(value)) return 1.65;
    if (/\bfinal\b/.test(value) && !/chapter/.test(value)) return 1.55;
    if (/semi|yari/.test(value)) return 1.40;
    if (/quarter|ceyrek/.test(value)) return 1.28;
    if (/play in|play off|knockout|eleme|last ticket|son bilet/.test(value)) return 1.20;
    if (/gold|silver|altin|gumus/.test(value)) return 1.08;
    return 1;
  };
  const pressureBand = stage => {
    const weight = stageWeight(stage);
    if (weight >= 1.55) return "maximum";
    if (weight >= 1.35) return "high";
    if (weight >= 1.18) return "elevated";
    return "standard";
  };
  const starFromMatch = match => {
    const direct = Number(match?.stars);
    if ([4, 4.5, 5].includes(direct)) return direct;
    const found = String(match?.stage || "").match(/(4(?:\.5)?|5)\s*★/);
    return found ? Number(found[1]) : null;
  };

  function appContext() {
    return window.FIFA_APP_CONTEXT || null;
  }

  function officialMatches(payload, draw) {
    let source = [];
    try {
      source = appContext()?.buildUnifiedAllTimeMatches?.() || [];
    } catch (_) {
      source = [];
    }
    if (!source.length) {
      const system = payload?.seasonSystem || {};
      source = (system.seasons || []).flatMap(season => (season.matches || []).map(match => ({
        ...match,
        edition: Number(match.edition || season.edition),
        editionLabel: `FIFA ${Number(match.edition || season.edition)}`,
        stage: match.stage || "Match"
      })));
      const players = new Map((draw?.participants || []).map(player => [player.id, player.name]));
      source.push(...(draw?.fixtures || []).filter(match => match.completed).map(match => ({
        ...match,
        edition: 10,
        editionLabel: "FIFA 10",
        stage: `FIFA 10 · Group ${match.group || "–"} · ${match.leg || 1}. Circuit · ${match.stars || "–"}★`,
        homeName: players.get(match.homeId) || "",
        awayName: players.get(match.awayId) || ""
      })));
    }
    const seen = new Set();
    return source.map((match, index) => {
      const homeName = String(match.homeName || match.p1 || "").trim();
      const awayName = String(match.awayName || match.p2 || "").trim();
      const homeScore = Number(match.homeScore ?? match.s1);
      const awayScore = Number(match.awayScore ?? match.s2);
      const edition = Number(match.edition || 0);
      const id = String(match.id || `match-${edition}-${index + 1}`);
      return {
        ...match,
        id,
        edition,
        editionLabel: match.editionLabel || `FIFA ${edition}`,
        stage: String(match.stage || "Match"),
        homeName,
        awayName,
        homeTeam: String(match.homeTeam || match.t1 || "").trim(),
        awayTeam: String(match.awayTeam || match.t2 || "").trim(),
        homeScore,
        awayScore,
        stars: starFromMatch(match),
        sourceIndex: index
      };
    }).filter(match => {
      if (!match.homeName || !match.awayName || /^P\d+$/i.test(match.homeName) || /^P\d+$/i.test(match.awayName)) return false;
      if (!Number.isFinite(match.homeScore) || !Number.isFinite(match.awayScore)) return false;
      const key = `${match.edition}:${match.id}:${normalize(match.homeName)}:${normalize(match.awayName)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.edition - b.edition || a.sourceIndex - b.sourceIndex);
  }

  function honours(payload) {
    const map = new Map();
    const add = (record, priority = 0) => {
      const edition = Number(record?.edition || 0);
      const competition = String(record?.competition || "oruc");
      if (!edition) return;
      const key = `${edition}:${competition}`;
      if ((map.get(key)?.priority || -1) > priority) return;
      map.set(key, {
        edition,
        competition,
        winner: String(record.winner || record.champion || "").trim(),
        runnerUp: String(record.runnerUp || "").trim(),
        third: String(record.third || "").trim(),
        priority
      });
    };
    try {
      (appContext()?.getHistorical?.()?.editions || []).forEach(record => add(record, 1));
    } catch (_) {}
    const system = payload?.seasonSystem || {};
    (system.seasons || []).forEach(record => add(record, 2));
    (system.customHonours || []).forEach(record => add(record, 3));
    return [...map.values()].sort((a, b) => a.edition - b.edition);
  }

  function annotateRatings(matches) {
    const ratings = new Map();
    const ensure = name => {
      const key = normalize(name);
      if (!ratings.has(key)) ratings.set(key, 1500);
      return key;
    };
    return matches.map(match => {
      const homeKey = ensure(match.homeName);
      const awayKey = ensure(match.awayName);
      const homePreElo = ratings.get(homeKey);
      const awayPreElo = ratings.get(awayKey);
      const expectedHome = logistic(homePreElo - awayPreElo);
      const homePoints = resultPoints(match, "home");
      const actualHome = homePoints === 3 ? 1 : homePoints === 1 ? 0.5 : 0;
      const weight = stageWeight(match.stage);
      const k = 22 * Math.min(1.5, weight);
      const delta = k * (actualHome - expectedHome);
      ratings.set(homeKey, homePreElo + delta);
      ratings.set(awayKey, awayPreElo - delta);
      return {
        ...match,
        homePreElo,
        awayPreElo,
        expectedHome,
        expectedAway: 1 - expectedHome,
        homePostElo: homePreElo + delta,
        awayPostElo: awayPreElo - delta,
        stageWeight: weight,
        pressureBand: pressureBand(match.stage),
        winnerName: match.winnerName || (match.homeScore > match.awayScore ? match.homeName : match.awayScore > match.homeScore ? match.awayName : "")
      };
    });
  }

  function teamAnalytics(matches) {
    const map = new Map();
    const ensure = (team, stars) => {
      const teamName = String(team || "").trim();
      if (!teamName) return null;
      const key = `${Number(stars || 0)}:${normalize(teamName)}`;
      if (!map.has(key)) map.set(key, {
        key, team: teamName, stars: Number(stars || 0) || null,
        games: 0, points: 0, gf: 0, ga: 0, wins: 0, draws: 0, losses: 0, players: new Set()
      });
      return map.get(key);
    };
    matches.forEach(match => {
      [["home", match.homeName, match.homeTeam, match.homeScore, match.awayScore], ["away", match.awayName, match.awayTeam, match.awayScore, match.homeScore]]
        .forEach(([side, player, team, gf, ga]) => {
          const row = ensure(team, match.stars);
          if (!row) return;
          const points = resultPoints(match, side);
          row.games += 1; row.points += points; row.gf += Number(gf); row.ga += Number(ga); row.players.add(normalize(player));
          if (points === 3) row.wins += 1;
          else if (points === 1) row.draws += 1;
          else row.losses += 1;
        });
    });
    return [...map.values()].map(row => {
      const ppg = row.games ? row.points / row.games : 0;
      const bayesianPPG = (row.points + 1.5 * 5) / (row.games + 5);
      return {
        ...row,
        playerCount: row.players.size,
        ppg,
        bayesianPPG,
        gfPerMatch: row.games ? row.gf / row.games : 0,
        gaPerMatch: row.games ? row.ga / row.games : 0,
        gdPerMatch: row.games ? (row.gf - row.ga) / row.games : 0
      };
    });
  }

  function peakWindow(entries, size = PRIME_WINDOW) {
    if (!entries.length) return { score: 0, ppg: 0, gdPerMatch: 0, startEdition: 0, endEdition: 0, games: 0 };
    const windowSize = Math.min(size, entries.length);
    let best = null;
    for (let start = 0; start <= entries.length - windowSize; start += 1) {
      const rows = entries.slice(start, start + windowSize);
      const games = rows.length;
      const points = rows.reduce((sum, row) => sum + row.points, 0);
      const gf = rows.reduce((sum, row) => sum + row.gf, 0);
      const ga = rows.reduce((sum, row) => sum + row.ga, 0);
      const ppg = points / games;
      const gdPerMatch = (gf - ga) / games;
      const opponent = mean(rows.map(row => row.opponentElo));
      const pressure = mean(rows.map(row => row.stageWeight));
      const score = clamp(50 + (ppg - 1.5) * 23 + gdPerMatch * 5 + (opponent - 1500) / 18 + (pressure - 1) * 12);
      const record = {
        score, ppg, gdPerMatch, games,
        startEdition: rows[0].edition,
        endEdition: rows[rows.length - 1].edition,
        opponentElo: opponent
      };
      if (!best || record.score > best.score || (record.score === best.score && record.ppg > best.ppg)) best = record;
    }
    return best;
  }

  function buildPlayers(matches, honourRows, teams) {
    const map = new Map();
    const ensure = name => {
      const key = normalize(name);
      if (!map.has(key)) map.set(key, {
        key, name: String(name || "").trim(), games: 0, wins: 0, draws: 0, losses: 0,
        points: 0, gf: 0, ga: 0, entries: [], opponents: new Map(), editions: new Map(),
        tiers: new Map(), teamKeys: [], expectedTotal: 0, actualProbabilityTotal: 0,
        leverage: 0, pressureGames: 0, pressurePoints: 0, maximumGames: 0, maximumPoints: 0,
        titles: 0, finals: 0, runnerUps: 0, thirds: 0, podiums: 0
      });
      return map.get(key);
    };
    const teamMap = new Map(teams.map(team => [team.key, team]));
    matches.forEach(match => {
      const sides = [
        { side: "home", name: match.homeName, opponent: match.awayName, gf: match.homeScore, ga: match.awayScore, team: match.homeTeam, opponentTeam: match.awayTeam, expected: match.expectedHome, opponentElo: match.awayPreElo },
        { side: "away", name: match.awayName, opponent: match.homeName, gf: match.awayScore, ga: match.homeScore, team: match.awayTeam, opponentTeam: match.homeTeam, expected: match.expectedAway, opponentElo: match.homePreElo }
      ];
      sides.forEach(side => {
        const row = ensure(side.name);
        const points = resultPoints(match, side.side);
        const actualProbability = points === 3 ? 1 : points === 1 ? 0.5 : 0;
        const entry = {
          matchId: match.id, edition: match.edition, stage: match.stage, stageWeight: match.stageWeight,
          pressureBand: match.pressureBand, opponent: side.opponent, opponentElo: side.opponentElo,
          points, gf: Number(side.gf), ga: Number(side.ga), expected: side.expected,
          residual: actualProbability - side.expected, stars: match.stars, team: side.team, opponentTeam: side.opponentTeam
        };
        row.games += 1; row.points += points; row.gf += entry.gf; row.ga += entry.ga; row.entries.push(entry);
        row.expectedTotal += side.expected; row.actualProbabilityTotal += actualProbability;
        row.leverage += entry.residual * entry.stageWeight * 100;
        if (points === 3) row.wins += 1;
        else if (points === 1) row.draws += 1;
        else row.losses += 1;
        if (entry.stageWeight >= 1.18) { row.pressureGames += 1; row.pressurePoints += points; }
        if (entry.stageWeight >= 1.50) { row.maximumGames += 1; row.maximumPoints += points; }
        const opponentKey = normalize(side.opponent);
        if (!row.opponents.has(opponentKey)) row.opponents.set(opponentKey, { name: side.opponent, games: 0, points: 0, gf: 0, ga: 0 });
        const opponent = row.opponents.get(opponentKey);
        opponent.games += 1; opponent.points += points; opponent.gf += entry.gf; opponent.ga += entry.ga;
        if (!row.editions.has(match.edition)) row.editions.set(match.edition, { edition: match.edition, games: 0, points: 0, gf: 0, ga: 0, entries: [] });
        const edition = row.editions.get(match.edition);
        edition.games += 1; edition.points += points; edition.gf += entry.gf; edition.ga += entry.ga; edition.entries.push(entry);
        if (match.stars) {
          if (!row.tiers.has(match.stars)) row.tiers.set(match.stars, { stars: match.stars, games: 0, points: 0, gf: 0, ga: 0 });
          const tier = row.tiers.get(match.stars);
          tier.games += 1; tier.points += points; tier.gf += entry.gf; tier.ga += entry.ga;
        }
        if (side.team) row.teamKeys.push(`${Number(match.stars || 0)}:${normalize(side.team)}`);
      });
    });
    honourRows.filter(record => record.competition === "oruc").forEach(record => {
      const winner = record.winner ? ensure(record.winner) : null;
      const runner = record.runnerUp ? ensure(record.runnerUp) : null;
      const third = record.third ? ensure(record.third) : null;
      if (winner) { winner.titles += 1; winner.finals += 1; winner.podiums += 1; }
      if (runner) { runner.runnerUps += 1; runner.finals += 1; runner.podiums += 1; }
      if (third) { third.thirds += 1; third.podiums += 1; }
    });
    const players = [...map.values()].map(row => {
      const ppg = row.games ? row.points / row.games : 0;
      const gd = row.gf - row.ga;
      const gdPerMatch = row.games ? gd / row.games : 0;
      const winRate = row.games ? row.wins / row.games * 100 : 0;
      const opponentElo = mean(row.entries.map(entry => entry.opponentElo));
      const pae = row.games ? (row.actualProbabilityTotal - row.expectedTotal) / row.games * 100 : 0;
      const usedTeams = row.teamKeys.map(key => teamMap.get(key)).filter(Boolean);
      const averageTeamPPG = usedTeams.length ? mean(usedTeams.map(team => team.bayesianPPG)) : 1.5;
      const purePpg = clamp(ppg - 0.25 * (averageTeamPPG - 1.5) + 0.20 * ((opponentElo - 1500) / 400), 0, 3);
      const rawPpr = clamp(50 + (purePpg - 1.5) * 24 + gdPerMatch * 4.5 + pae * 0.28);
      const ppr = 50 + (rawPpr - 50) * confidence(row.games);
      const pressurePPG = row.pressureGames ? row.pressurePoints / row.pressureGames : ppg;
      const maximumPPG = row.maximumGames ? row.maximumPoints / row.maximumGames : pressurePPG;
      const pressureRaw = clamp(50 + (pressurePPG - 1.5) * 23 + (maximumPPG - 1.5) * 8);
      const pressureScore = 50 + (pressureRaw - 50) * (row.pressureGames / (row.pressureGames + 5));
      const tiers = [...row.tiers.values()].map(tier => ({
        ...tier,
        ppg: tier.games ? tier.points / tier.games : 0,
        gdPerMatch: tier.games ? (tier.gf - tier.ga) / tier.games : 0
      })).sort((a, b) => a.stars - b.stars);
      const tierPpg = tiers.filter(tier => tier.games).map(tier => tier.ppg);
      const versatility = tierPpg.length
        ? clamp(tierPpg.length / 3 * 55 + (1 - Math.min(1, stdDev(tierPpg) / 1.1)) * 45)
        : 45;
      const prime = peakWindow(row.entries);
      const longevity = clamp(Math.log2(row.games + 1) / Math.log2(151) * 100);
      const achievement = clamp(row.titles * 38 + row.runnerUps * 15 + row.thirds * 9);
      const legacy = clamp(
        achievement * 0.28
        + ppr * 0.24
        + prime.score * 0.16
        + pressureScore * 0.12
        + longevity * 0.08
        + versatility * 0.07
        + clamp(50 + pae * 2) * 0.05
      );
      const editions = [...row.editions.values()].map(edition => {
        const editionPpg = edition.games ? edition.points / edition.games : 0;
        const editionGd = edition.games ? (edition.gf - edition.ga) / edition.games : 0;
        return {
          ...edition,
          ppg: editionPpg,
          gdPerMatch: editionGd,
          dnaScore: clamp(50 + (editionPpg - 1.5) * 24 + editionGd * 5)
        };
      }).sort((a, b) => a.edition - b.edition);
      return {
        ...row, ppg, gd, gdPerMatch, winRate, opponentElo, pae, averageTeamPPG,
        purePpg, rawPpr, ppr, pressurePPG, maximumPPG, pressureScore, tiers,
        versatility, prime, longevity, achievement, legacy, editions,
        ratingConfidence: confidence(row.games) * 100,
        teamDependency: clamp(50 + (averageTeamPPG - 1.5) * 34)
      };
    }).sort((a, b) => b.legacy - a.legacy || b.ppr - a.ppr || b.games - a.games || a.name.localeCompare(b.name, "tr"));
    return players;
  }

  function buildRivalries(matches) {
    const map = new Map();
    matches.forEach(match => {
      const key = canonicalPair(match.homeName, match.awayName);
      if (!map.has(key)) {
        const names = [match.homeName, match.awayName].sort((a, b) => normalize(a).localeCompare(normalize(b)));
        map.set(key, { key, playerA: names[0], playerB: names[1], matches: 0, winsA: 0, winsB: 0, draws: 0, gfA: 0, gfB: 0, knockout: 0, finals: 0, upsets: 0, records: [] });
      }
      const row = map.get(key);
      const aHome = normalize(match.homeName) === normalize(row.playerA);
      const scoreA = Number(aHome ? match.homeScore : match.awayScore);
      const scoreB = Number(aHome ? match.awayScore : match.homeScore);
      const expectedA = aHome ? match.expectedHome : match.expectedAway;
      const winner = match.winnerName || (scoreA > scoreB ? row.playerA : scoreB > scoreA ? row.playerB : "");
      row.matches += 1; row.gfA += scoreA; row.gfB += scoreB;
      if (!winner) row.draws += 1;
      else if (normalize(winner) === normalize(row.playerA)) {
        row.winsA += 1;
        if (expectedA < 0.35) row.upsets += 1;
      } else {
        row.winsB += 1;
        if (expectedA > 0.65) row.upsets += 1;
      }
      if (match.stageWeight >= 1.18) row.knockout += 1;
      if (match.stageWeight >= 1.50) row.finals += 1;
      row.records.push(match);
    });
    return [...map.values()].map(row => {
      const balance = row.matches ? 100 - Math.abs(row.winsA - row.winsB) / row.matches * 100 : 0;
      const heat = clamp(row.matches * 3.3 + row.knockout * 8 + row.finals * 14 + row.upsets * 6 + balance * 0.23);
      return { ...row, balance, heat, gdA: row.gfA - row.gfB };
    }).sort((a, b) => b.heat - a.heat || b.matches - a.matches);
  }

  function tournamentEditions(matches, players, honourRows) {
    const playerByKey = new Map(players.map(player => [player.key, player]));
    const map = new Map();
    matches.forEach(match => {
      if (!map.has(match.edition)) map.set(match.edition, { edition: match.edition, matches: [], playerKeys: new Set(), teams: new Set() });
      const edition = map.get(match.edition);
      edition.matches.push(match);
      edition.playerKeys.add(normalize(match.homeName)); edition.playerKeys.add(normalize(match.awayName));
      if (match.homeTeam) edition.teams.add(normalize(match.homeTeam));
      if (match.awayTeam) edition.teams.add(normalize(match.awayTeam));
    });
    return [...map.values()].map(edition => {
      const rows = [...edition.playerKeys].map(key => {
        const player = playerByKey.get(key);
        const record = player?.editions.find(item => item.edition === edition.edition);
        return record ? { ...record, name: player.name, careerPpr: player.ppr } : null;
      }).filter(Boolean);
      const ppgValues = rows.map(row => row.ppg);
      const eloValues = edition.matches.flatMap(match => [match.homePreElo, match.awayPreElo]);
      const averageGoals = mean(edition.matches.map(match => match.homeScore + match.awayScore));
      const averageMargin = mean(edition.matches.map(match => Math.abs(match.homeScore - match.awayScore)));
      const closeRate = edition.matches.length ? edition.matches.filter(match => Math.abs(match.homeScore - match.awayScore) <= 1).length / edition.matches.length * 100 : 0;
      const drawRate = edition.matches.length ? edition.matches.filter(match => !match.winnerName && match.homeScore === match.awayScore).length / edition.matches.length * 100 : 0;
      const upsetRate = edition.matches.length ? edition.matches.filter(match => {
        const favouriteHome = match.expectedHome >= 0.65;
        const favouriteAway = match.expectedAway >= 0.65;
        return (favouriteHome && match.awayScore > match.homeScore) || (favouriteAway && match.homeScore > match.awayScore);
      }).length / edition.matches.length * 100 : 0;
      const balance = clamp(100 - stdDev(ppgValues) / 1.25 * 100);
      const fieldStrength = mean(eloValues);
      const knockoutShare = edition.matches.length ? edition.matches.filter(match => match.stageWeight >= 1.18).length / edition.matches.length * 100 : 0;
      const difficulty = clamp(48 + (fieldStrength - 1450) / 8 + edition.playerKeys.size * 1.1 + knockoutShare * 0.12 + balance * 0.14);
      const honour = honourRows.find(record => record.edition === edition.edition && record.competition === "oruc");
      return {
        ...edition,
        playerCount: edition.playerKeys.size,
        teamCount: edition.teams.size,
        averageGoals, averageMargin, closeRate, drawRate, upsetRate, balance, fieldStrength,
        knockoutShare, difficulty, champion: honour?.winner || "",
        fingerprint: {
          attack: clamp(averageGoals / 8 * 100),
          parity: balance,
          drama: clamp(closeRate * 0.65 + upsetRate * 1.2),
          pressure: clamp(35 + knockoutShare * 1.4),
          variety: clamp(edition.teams.size / Math.max(1, edition.matches.length) * 160)
        }
      };
    }).sort((a, b) => a.edition - b.edition);
  }

  function iconicMatches(matches) {
    return matches.map(match => {
      const expectedWinner = match.expectedHome >= 0.5 ? "home" : "away";
      const actualWinner = match.homeScore > match.awayScore ? "home" : match.awayScore > match.homeScore ? "away" : "draw";
      const upset = actualWinner !== "draw" && actualWinner !== expectedWinner ? Math.abs(match.homePreElo - match.awayPreElo) : 0;
      const margin = Math.abs(match.homeScore - match.awayScore);
      const closeness = margin <= 1 ? 22 : margin === 2 ? 10 : 0;
      const scoring = clamp((match.homeScore + match.awayScore - 4) * 2.2, 0, 18);
      const score = clamp((match.stageWeight - 1) * 52 + closeness + scoring + upset / 18 + (match.winnerName ? 4 : 0));
      return { ...match, iconicScore: score, upsetElo: upset, totalGoals: match.homeScore + match.awayScore, margin };
    }).sort((a, b) => b.iconicScore - a.iconicScore || b.edition - a.edition);
  }

  function championshipLineage(matches, honourRows) {
    const first = honourRows.filter(record => record.competition === "oruc" && record.winner).sort((a, b) => a.edition - b.edition)[0];
    if (!first) return { holder: "", changes: [], reignMatches: 0, startedEdition: 0 };
    let holder = first.winner;
    let reignMatches = 0;
    const changes = [{ edition: first.edition, from: "", to: holder, match: null, reason: ui("İlk resmî şampiyon", "First official champion") }];
    matches.filter(match => match.edition >= first.edition).forEach(match => {
      const holderHome = normalize(match.homeName) === normalize(holder);
      const holderAway = normalize(match.awayName) === normalize(holder);
      if (!holderHome && !holderAway) return;
      reignMatches += 1;
      const opponent = holderHome ? match.awayName : match.homeName;
      const winner = match.winnerName || (match.homeScore > match.awayScore ? match.homeName : match.awayScore > match.homeScore ? match.awayName : "");
      if (winner && normalize(winner) === normalize(opponent)) {
        changes.push({ edition: match.edition, from: holder, to: opponent, match, reason: ui("Kemer devri", "Belt transfer") });
        holder = opponent;
        reignMatches = 0;
      }
    });
    return { holder, changes, reignMatches, startedEdition: first.edition };
  }

  function livingRecords(data) {
    const eligible = data.players.filter(player => player.games >= MIN_SAMPLE);
    const max = (label, rows, metric, format) => {
      const row = [...rows].sort((a, b) => Number(metric(b)) - Number(metric(a)) || b.games - a.games)[0];
      return row ? { label, player: row.name, value: format(row) } : null;
    };
    return [
      max(ui("En Yüksek PPR", "Highest PPR"), eligible, row => row.ppr, row => row.ppr.toFixed(1)),
      max(ui("En Büyük Legacy", "Greatest Legacy"), eligible, row => row.legacy, row => row.legacy.toFixed(1)),
      max(ui("En Yüksek Zirve", "Highest Prime"), eligible, row => row.prime.score, row => row.prime.score.toFixed(1)),
      max(ui("En İyi Baskı DNA", "Best Pressure DNA"), eligible, row => row.pressureScore, row => row.pressureScore.toFixed(1)),
      max(ui("En Fazla Şampiyonluk", "Most Titles"), data.players, row => row.titles, row => `${row.titles}`),
      max(ui("En Fazla Maç", "Most Matches"), data.players, row => row.games, row => `${row.games}`),
      max(ui("En Yüksek PAE", "Highest PAE"), eligible, row => row.pae, row => `${row.pae > 0 ? "+" : ""}${row.pae.toFixed(1)}`),
      max(ui("En Çok Yönlü", "Most Versatile"), eligible, row => row.versatility, row => row.versatility.toFixed(1))
    ].filter(Boolean);
  }

  function storylines(data, draw) {
    const stories = [];
    const legacy = data.players[0];
    const ppr = [...data.players].filter(player => player.games >= MIN_SAMPLE).sort((a, b) => b.ppr - a.ppr)[0];
    const prime = [...data.players].sort((a, b) => b.prime.score - a.prime.score)[0];
    const rivalry = data.rivalries[0];
    const edition = data.editions[data.editions.length - 1];
    const iconic = data.iconic[0];
    if (legacy) stories.push({ type: "legacy", eyebrow: "LEGACY WATCH", title: legacy.name, subtitle: ui(`${legacy.legacy.toFixed(1)} Legacy puanıyla tarihsel lider.`, `Historical leader with a ${legacy.legacy.toFixed(1)} Legacy score.`), accent: "#e7bd63" });
    if (ppr) stories.push({ type: "ppr", eyebrow: "PURE PLAYER RATING", title: ppr.name, subtitle: ui(`Takım etkisi ve rakip gücü düzeltmesi sonrası ${ppr.ppr.toFixed(1)} PPR.`, `${ppr.ppr.toFixed(1)} PPR after team-effect and opposition adjustments.`), accent: "#64c6ff" });
    if (prime) stories.push({ type: "prime", eyebrow: "PRIME FINDER", title: `${prime.name} · FIFA${prime.prime.startEdition}–${prime.prime.endEdition}`, subtitle: ui(`${prime.prime.games} maçlık zirve penceresinde ${prime.prime.ppg.toFixed(2)} PPG.`, `${prime.prime.ppg.toFixed(2)} PPG across the ${prime.prime.games}-match peak window.`), accent: "#ad70ff" });
    if (rivalry) stories.push({ type: "rivalry", eyebrow: "RIVALRY INTELLIGENCE", title: `${rivalry.playerA} vs ${rivalry.playerB}`, subtitle: ui(`${rivalry.matches} maç · ${rivalry.heat.toFixed(0)}/100 rekabet ısısı.`, `${rivalry.matches} matches · ${rivalry.heat.toFixed(0)}/100 rivalry heat.`), accent: "#ff718e" });
    if (edition) stories.push({ type: "tournament", eyebrow: `FIFA ${edition.edition} FINGERPRINT`, title: ui(`${edition.difficulty.toFixed(0)}/100 Zorluk`, `${edition.difficulty.toFixed(0)}/100 Difficulty`), subtitle: ui(`Denge ${edition.balance.toFixed(0)} · Yakın maç %${edition.closeRate.toFixed(0)} · Sürpriz %${edition.upsetRate.toFixed(0)}`, `Parity ${edition.balance.toFixed(0)} · Close matches ${edition.closeRate.toFixed(0)}% · Upsets ${edition.upsetRate.toFixed(0)}%`), accent: "#52dfa0" });
    if (iconic) stories.push({ type: "iconic", eyebrow: "ICONIC MATCH INDEX", title: `${iconic.homeName} ${iconic.homeScore}–${iconic.awayScore} ${iconic.awayName}`, subtitle: `FIFA ${iconic.edition} · ${iconic.stage} · ${iconic.iconicScore.toFixed(0)}/100`, accent: "#ff9d5c" });
    if (data.lineage.holder) stories.push({ type: "lineage", eyebrow: "LINEAL CHAMPIONSHIP", title: data.lineage.holder, subtitle: ui(`${data.lineage.changes.length - 1} devir sonrası güncel kemer sahibi.`, `Current belt holder after ${data.lineage.changes.length - 1} transfers.`), accent: "#f0c95d" });
    if (draw) {
      const completed = (draw.fixtures || []).filter(match => match.completed).length;
      stories.push({ type: "live", eyebrow: "FIFA 10 LIVE", title: `${completed}/${draw.fixtures?.length || 78}`, subtitle: ui("Resmî grup maçı tamamlandı.", "Official group matches completed."), accent: "#5ca9ff" });
    }
    return stories;
  }

  function universalGraph(data) {
    const nodes = [...data.players].sort((a, b) => b.games - a.games).slice(0, 18);
    const allowed = new Set(nodes.map(node => node.key));
    const edges = data.rivalries.filter(edge => allowed.has(normalize(edge.playerA)) && allowed.has(normalize(edge.playerB))).slice(0, 28);
    const width = 980;
    const height = 560;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.37;
    const positions = new Map(nodes.map((node, index) => {
      const angle = Math.PI * 2 * index / Math.max(1, nodes.length) - Math.PI / 2;
      return [node.key, { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius }];
    }));
    return `<svg class="fui-network-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${ui("Tüm zamanlar oyuncu ve rekabet ağı", "All-time player and rivalry network")}">
      <defs><filter id="fuiGlow"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      ${edges.map(edge => {
        const first = positions.get(normalize(edge.playerA));
        const second = positions.get(normalize(edge.playerB));
        return `<line x1="${first.x}" y1="${first.y}" x2="${second.x}" y2="${second.y}" stroke="rgba(107,158,255,.35)" stroke-width="${1 + edge.heat / 28}"><title>${escapeXML(edge.playerA)} vs ${escapeXML(edge.playerB)} · ${edge.matches}</title></line>`;
      }).join("")}
      ${nodes.map(node => {
        const point = positions.get(node.key);
        const size = 25 + node.legacy / 8;
        return `<g transform="translate(${point.x} ${point.y})"><circle r="${size}" fill="rgba(8,20,51,.96)" stroke="${node.titles ? "#e7bd63" : "#62bfff"}" stroke-width="${node.titles ? 4 : 2}" filter="url(#fuiGlow)"/><text y="4" text-anchor="middle" fill="#fff" font-size="11" font-weight="800">${escapeXML(node.name.split(/\s+/).slice(0, 2).join(" "))}</text><text y="19" text-anchor="middle" fill="#7fcaff" font-size="8">${node.games} MP · ${node.legacy.toFixed(0)} L</text></g>`;
      }).join("")}
    </svg>`;
  }

  function buildUniverse(payload, draw) {
    const rawMatches = officialMatches(payload, draw);
    const signature = rawMatches.map(match => `${match.edition}:${match.id}:${match.homeScore}:${match.awayScore}`).join("|")
      + `::${honours(payload).map(item => `${item.edition}:${item.winner}:${item.runnerUp}:${item.third}`).join("|")}`;
    if (lastData && signature === lastSignature) return lastData;
    const matchRows = annotateRatings(rawMatches);
    const honourRows = honours(payload);
    const teams = teamAnalytics(matchRows);
    const players = buildPlayers(matchRows, honourRows, teams);
    const rivalries = buildRivalries(matchRows);
    const editions = tournamentEditions(matchRows, players, honourRows);
    const iconic = iconicMatches(matchRows);
    const lineage = championshipLineage(matchRows, honourRows);
    const data = {
      version: VERSION,
      build: BUILD,
      matches: matchRows,
      honours: honourRows,
      teams,
      players,
      playerMap: new Map(players.map(player => [player.key, player])),
      rivalries,
      editions,
      iconic,
      lineage
    };
    data.records = livingRecords(data);
    data.stories = storylines(data, draw);
    data.graph = universalGraph(data);
    lastData = data;
    lastSignature = signature;
    return data;
  }

  function currentDrawStats(draw) {
    const map = new Map((draw?.participants || []).map((player, index) => [player.id, {
      id: player.id, name: player.name, tieBreakOrder: Number(player.tieBreakOrder || index + 1),
      mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0
    }]));
    (draw?.fixtures || []).filter(match => match.completed).forEach(match => {
      const home = map.get(match.homeId);
      const away = map.get(match.awayId);
      if (!home || !away) return;
      const hs = Number(match.homeScore); const as = Number(match.awayScore);
      home.mp += 1; away.mp += 1; home.gf += hs; home.ga += as; away.gf += as; away.ga += hs;
      if (hs > as) { home.w += 1; away.l += 1; home.pts += 3; }
      else if (hs < as) { away.w += 1; home.l += 1; away.pts += 3; }
      else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
    });
    return map;
  }

  function compareFifa10Rows(a, b) {
    const metrics = [
      [a.mp ? a.pts / a.mp : 0, b.mp ? b.pts / b.mp : 0],
      [a.mp ? (a.gf - a.ga) / a.mp : 0, b.mp ? (b.gf - b.ga) / b.mp : 0],
      [a.gf, b.gf],
      [a.mp ? a.w / a.mp : 0, b.mp ? b.w / b.mp : 0]
    ];
    for (const [av, bv] of metrics) if (Math.abs(bv - av) > 1e-9) return bv - av;
    return a.tieBreakOrder - b.tieBreakOrder;
  }

  function poisson(lambda, random) {
    const limit = Math.exp(-Math.max(0.1, lambda));
    let product = 1;
    let count = 0;
    do { count += 1; product *= random(); } while (product > limit && count < 16);
    return count - 1;
  }

  function qualificationProbability(draw, data, iterations = 1800) {
    if (!draw?.fixtures?.length) return { rows: [], pairings: [], iterations: 0 };
    const key = `${draw.updatedAt || ""}:${draw.fixtures.filter(match => match.completed).length}:${iterations}`;
    if (qualificationCache.has(key)) return qualificationCache.get(key);
    const base = currentDrawStats(draw);
    const pending = draw.fixtures.filter(match => !match.completed);
    const participantNames = new Map((draw.participants || []).map(player => [player.id, player.name]));
    const strength = new Map((draw.participants || []).map(player => {
      const analytics = data.playerMap.get(normalize(player.name));
      return [player.id, analytics?.ppr || clamp(50 + (Number(player.elo || 1500) - 1500) / 9)];
    }));
    const counts = new Map((draw.participants || []).map(player => [player.id, {
      id: player.id, name: player.name, direct: 0, playin: 0, eliminated: 0, rankTotal: 0, top12: 0
    }]));
    const pairMap = new Map();
    const random = seededRandom(hash(key));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const table = new Map([...base.entries()].map(([id, row]) => [id, { ...row }]));
      pending.forEach(match => {
        const home = table.get(match.homeId); const away = table.get(match.awayId);
        if (!home || !away) return;
        const difference = (strength.get(match.homeId) || 50) - (strength.get(match.awayId) || 50);
        const homeWin = logistic(difference * 8.5);
        const drawChance = clamp(0.20 - Math.abs(difference) / 500, 0.10, 0.22);
        const roll = random();
        let outcome = "draw";
        if (roll < homeWin * (1 - drawChance)) outcome = "home";
        else if (roll > homeWin * (1 - drawChance) + drawChance) outcome = "away";
        const baseGoals = 2.7;
        let hs = poisson(clamp(baseGoals + difference / 45, 0.7, 5.5), random);
        let as = poisson(clamp(baseGoals - difference / 45, 0.7, 5.5), random);
        if (outcome === "draw") as = hs;
        else if (outcome === "home" && hs <= as) hs = as + 1;
        else if (outcome === "away" && as <= hs) as = hs + 1;
        home.mp += 1; away.mp += 1; home.gf += hs; home.ga += as; away.gf += as; away.ga += hs;
        if (hs > as) { home.w += 1; away.l += 1; home.pts += 3; }
        else if (as > hs) { away.w += 1; home.l += 1; away.pts += 3; }
        else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
      });
      const ranked = [...table.values()].sort(compareFifa10Rows);
      ranked.forEach((row, index) => {
        const count = counts.get(row.id);
        const rank = index + 1;
        count.rankTotal += rank;
        if (rank <= 4) count.direct += 1;
        else if (rank <= 12) count.playin += 1;
        else count.eliminated += 1;
        if (rank <= 12) count.top12 += 1;
      });
      [[4, 11], [5, 10], [6, 9], [7, 8]].forEach(([high, low]) => {
        const first = ranked[high]?.id;
        const second = ranked[low]?.id;
        if (!first || !second) return;
        const pairKey = canonicalPair(first, second);
        pairMap.set(pairKey, (pairMap.get(pairKey) || 0) + 1);
      });
    }
    const rows = [...counts.values()].map(row => ({
      ...row,
      directPct: row.direct / iterations * 100,
      playinPct: row.playin / iterations * 100,
      eliminatedPct: row.eliminated / iterations * 100,
      expectedRank: row.rankTotal / iterations
    })).sort((a, b) => a.expectedRank - b.expectedRank);
    const pairings = [...pairMap.entries()].map(([key, count]) => {
      const [firstId, secondId] = key.split("|||");
      return {
        first: participantNames.get(firstId) || firstId,
        second: participantNames.get(secondId) || secondId,
        probability: count / iterations * 100
      };
    }).sort((a, b) => b.probability - a.probability).slice(0, 8);
    const result = { rows, pairings, iterations };
    qualificationCache.clear();
    qualificationCache.set(key, result);
    return result;
  }

  function teamAdvisor(draw, data, playerReference = selectedAdvisorPlayer) {
    const players = draw?.participants || [];
    const player = players.find(item => item.id === playerReference || normalize(item.name) === normalize(playerReference)) || players[0];
    if (!player) return { player: null, fixture: null, choices: [], note: "" };
    selectedAdvisorPlayer = player.id;
    const fixture = (draw.fixtures || []).find(match => !match.completed && (match.homeId === player.id || match.awayId === player.id));
    if (!fixture) return { player, fixture: null, choices: [], note: ui("Bekleyen maç bulunmuyor.", "No pending match.") };
    const pools = appContext()?.getFifa10TeamPools?.() || window.FIFA10_TEAM_POOLS || {};
    const pool = pools[String(Number(fixture.stars))] || [];
    const used = new Set((draw.fixtures || []).filter(match => match.completed && (match.homeId === player.id || match.awayId === player.id))
      .map(match => normalize(match.homeId === player.id ? match.homeTeam : match.awayTeam)).filter(Boolean));
    const eligible = pool.filter(team => !used.has(normalize(team)));
    const globalTeam = new Map(data.teams.filter(team => Number(team.stars) === Number(fixture.stars)).map(team => [normalize(team.team), team]));
    const rows = eligible.map(team => {
      const evidence = globalTeam.get(normalize(team));
      return {
        team,
        games: evidence?.games || 0,
        ppg: evidence?.bayesianPPG || 1.5,
        gf: evidence?.gfPerMatch || 0,
        ga: evidence?.gaPerMatch || 0,
        gd: evidence?.gdPerMatch || 0,
        fresh: !evidence?.games
      };
    });
    const evidencePick = [...rows].filter(row => row.games).sort((a, b) => b.ppg - a.ppg || b.games - a.games)[0];
    const defensivePick = [...rows].filter(row => row.games).sort((a, b) => a.ga - b.ga || b.games - a.games)[0];
    const freshPick = [...rows].filter(row => row.fresh).sort((a, b) => hash(`${player.id}:${a.team}`) - hash(`${player.id}:${b.team}`))[0];
    const fallback = [...rows].sort((a, b) => hash(`${fixture.id}:${a.team}`) - hash(`${fixture.id}:${b.team}`));
    const choices = [
      evidencePick ? { ...evidencePick, role: ui("Kanıt Seçimi", "Evidence Pick"), reason: ui(`${evidencePick.games} resmî kullanımda ${evidencePick.ppg.toFixed(2)} PPG.`, `${evidencePick.ppg.toFixed(2)} PPG across ${evidencePick.games} official uses.`) } : null,
      defensivePick && defensivePick.team !== evidencePick?.team ? { ...defensivePick, role: ui("Denge Seçimi", "Balance Pick"), reason: ui(`${defensivePick.ga.toFixed(2)} maç başına gol yeme profili.`, `${defensivePick.ga.toFixed(2)} goals conceded per match profile.`) } : null,
      freshPick ? { ...freshPick, role: ui("Keşif Seçimi", "Discovery Pick"), reason: ui("Turnuvada henüz kullanılmadı; veri avantajı veya dezavantajı varsayılmaz.", "Not used in the tournament yet; no data advantage or disadvantage is assumed.") } : null
    ].filter(Boolean);
    fallback.forEach(row => {
      if (choices.length >= 3 || choices.some(item => item.team === row.team)) return;
      choices.push({ ...row, role: ui("Uygun Alternatif", "Eligible Alternative"), reason: ui("Oyuncunun pasaportunda kullanılmamış uygun takım.", "Eligible unused team in the player passport.") });
    });
    const opponentId = fixture.homeId === player.id ? fixture.awayId : fixture.homeId;
    const opponent = players.find(item => item.id === opponentId);
    return {
      player,
      opponent,
      fixture,
      choices: choices.slice(0, 3),
      eligibleCount: eligible.length,
      note: ui("Öneriler karar desteğidir; resmî takım havuzu ve tekrar yasağı değişmez.", "Recommendations are decision support; the official pool and no-repeat rule remain unchanged.")
    };
  }

  function timeMachine(data, editionValue = selectedEdition) {
    const editions = data.editions.map(item => item.edition);
    const edition = editions.includes(Number(editionValue)) ? Number(editionValue) : editions[editions.length - 1] || 0;
    selectedEdition = edition;
    const matches = data.matches.filter(match => match.edition <= edition);
    const honourRows = data.honours.filter(record => record.edition <= edition);
    const teams = teamAnalytics(matches);
    const players = buildPlayers(matches, honourRows, teams);
    return { edition, players, honours: honourRows, matches };
  }

  function eraSimulation(data, firstReference = selectedRivalA, secondReference = selectedRivalB) {
    const eligible = data.players.filter(player => player.games >= Math.min(5, MIN_SAMPLE));
    let first = eligible.find(player => player.key === normalize(firstReference)) || eligible[0];
    let second = eligible.find(player => player.key === normalize(secondReference) && player.key !== first?.key) || eligible.find(player => player.key !== first?.key);
    if (!first || !second) return { first, second, firstPct: 0, drawPct: 0, secondPct: 0 };
    selectedRivalA = first.name;
    selectedRivalB = second.name;
    const firstStrength = first.ppr * 0.48 + first.prime.score * 0.36 + first.pressureScore * 0.16;
    const secondStrength = second.ppr * 0.48 + second.prime.score * 0.36 + second.pressureScore * 0.16;
    const decisive = logistic((firstStrength - secondStrength) * 10);
    const drawPct = clamp(16 - Math.abs(firstStrength - secondStrength) * 0.18, 9, 17);
    const firstPct = decisive * (100 - drawPct);
    const secondPct = 100 - drawPct - firstPct;
    return { first, second, firstStrength, secondStrength, firstPct, drawPct, secondPct, simulations: 10000 };
  }

  function balanceAudit(draw, data) {
    if (!draw) return { score: 0, groupRows: [], ppgDispersion: 0, scheduleVariance: 0, groupGap: 0, notes: [] };
    const playerStrength = new Map((draw.participants || []).map(player => [player.id, data.playerMap.get(normalize(player.name))?.ppr || 50]));
    const groupRows = ["A", "B", "C"].map(group => {
      const ids = draw.groups?.[group] || [];
      const strengths = ids.map(id => playerStrength.get(id) || 50);
      const fixtures = (draw.fixtures || []).filter(match => match.group === group);
      const completed = fixtures.filter(match => match.completed).length;
      return { group, players: ids.length, strength: mean(strengths), spread: stdDev(strengths), completed, total: fixtures.length };
    });
    const table = [...currentDrawStats(draw).values()].map(row => ({ ...row, ppg: row.mp ? row.pts / row.mp : 0 }));
    const ppgDispersion = stdDev(table.filter(row => row.mp).map(row => row.ppg));
    const matchCounts = table.map(row => row.mp);
    const scheduleVariance = stdDev(matchCounts);
    const groupGap = Math.max(...groupRows.map(row => row.strength)) - Math.min(...groupRows.map(row => row.strength));
    const score = clamp(100 - groupGap * 2.4 - scheduleVariance * 7 - ppgDispersion * 8);
    const notes = [
      groupGap > 5 ? ui("Gruplar arasında ölçülebilir güç farkı var; PPG ve AV/M bunu kısmen dengeler.", "There is a measurable group-strength gap; PPG and GD/M partially compensate for it.") : ui("Grup güçleri birbirine yakın.", "Group strengths are closely matched."),
      scheduleVariance > 1 ? ui("Oynanan maç sayısı farkı yüksek; oran bazlı sıralama kritik.", "The games-played gap is high; rate-based ranking is essential.") : ui("Maç hacmi dağılımı kontrol altında.", "Match-volume distribution is under control.")
    ];
    return { score, groupRows, ppgDispersion, scheduleVariance, groupGap, notes };
  }

  function formatLaboratory(draw, data) {
    const participantCount = draw?.participants?.length || 14;
    const audit = balanceAudit(draw, data);
    const formats = [
      { id: "triple", name: "Triple Circuit · 3 Groups", matches: draw?.fixtures?.length || Math.round(participantCount * 5.5), fairness: audit.score, engagement: 92, deadRisk: 8, duration: 100 },
      { id: "swiss", name: "Swiss · 6 Rounds", matches: Math.ceil(participantCount * 6 / 2), fairness: clamp(83 + (audit.score - 75) * 0.12), engagement: 85, deadRisk: 13, duration: 58 },
      { id: "league", name: "Single League", matches: participantCount * (participantCount - 1) / 2, fairness: 95, engagement: 78, deadRisk: 18, duration: 128 },
      { id: "two-groups", name: "Two Groups · Double Circuit", matches: Math.round(participantCount / 2 * (participantCount / 2 - 1) * 2), fairness: clamp(78 + audit.score * 0.1), engagement: 88, deadRisk: 12, duration: 112 }
    ].map(format => ({
      ...format,
      qualificationVolatility: clamp(100 - format.fairness * 0.55 + format.engagement * 0.35),
      overall: format.fairness * 0.42 + format.engagement * 0.30 + (100 - format.deadRisk) * 0.18 + clamp(130 - format.duration) * 0.10
    })).sort((a, b) => b.overall - a.overall);
    return { formats, participantCount, note: ui("Model; mevcut oyuncu gücü dağılımı, maç hacmi ve tarihsel denge göstergelerini kullanır. Resmî format kararı değildir.", "The model uses current player-strength distribution, match volume and historical balance indicators. It is not an official format decision.") };
  }

  function mediaSvg(story, data) {
    const safe = story || data.stories[0] || { eyebrow: "FIFA UNIVERSE", title: "ORUÇ REİS", subtitle: "FOOTBALL UNIVERSE", accent: "#63bdff" };
    const title = escapeXML(safe.title);
    const subtitle = escapeXML(safe.subtitle);
    const eyebrow = escapeXML(safe.eyebrow);
    const accent = safe.accent || "#63bdff";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
      <defs>
        <radialGradient id="bg" cx="20%" cy="0%"><stop offset="0" stop-color="${accent}" stop-opacity=".35"/><stop offset=".55" stop-color="#101535"/><stop offset="1" stop-color="#040916"/></radialGradient>
        <linearGradient id="line" x1="0" x2="1"><stop stop-color="#4ea8ff"/><stop offset=".52" stop-color="#a65cff"/><stop offset="1" stop-color="${accent}"/></linearGradient>
      </defs>
      <rect width="1080" height="1350" fill="url(#bg)"/>
      <circle cx="925" cy="180" r="230" fill="none" stroke="${accent}" stroke-opacity=".22" stroke-width="42"/>
      <circle cx="925" cy="180" r="140" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3"/>
      <rect x="66" y="64" width="948" height="1222" rx="34" fill="none" stroke="#8ba8ff" stroke-opacity=".25" stroke-width="2"/>
      <text x="82" y="115" fill="#8ecbff" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="5">ORUÇ REİS FOOTBALL UNIVERSE</text>
      <text x="82" y="300" fill="${accent}" font-family="Arial,sans-serif" font-size="24" font-weight="800" letter-spacing="6">${eyebrow}</text>
      <foreignObject x="80" y="340" width="900" height="420"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:white;font-size:82px;font-weight:900;line-height:1.02;text-transform:uppercase;word-break:break-word">${title}</div></foreignObject>
      <rect x="82" y="805" width="720" height="10" rx="5" fill="url(#line)"/>
      <foreignObject x="82" y="855" width="860" height="260"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#bac8e3;font-size:36px;font-weight:600;line-height:1.35">${subtitle}</div></foreignObject>
      <text x="82" y="1215" fill="#edc866" font-family="Arial,sans-serif" font-size="25" font-weight="800">FIFA UNIVERSE INTELLIGENCE · V${VERSION}</text>
      <text x="998" y="1215" fill="#fff" font-family="Arial,sans-serif" font-size="56" font-weight="900" text-anchor="end">10</text>
    </svg>`;
  }

  function moduleCard(id, title, description) {
    return `<article data-module="${id}"><span>${id.replace(/-/g, " ").toUpperCase()}</span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(description)}</small></article>`;
  }

  function scoreBar(label, value, suffix = "") {
    return `<label><span>${escapeHTML(label)}</span><b>${Number(value).toFixed(1)}${suffix}</b><i><em style="width:${clamp(value)}%"></em></i></label>`;
  }

  function renderOverview(data) {
    const legacy = data.players.slice(0, 5);
    return `<section class="fui-section" data-panel="overview">
      <div class="fui-module-catalogue">
        ${moduleCard("universal-match-graph", ui("Universal Match Graph", "Universal Match Graph"), ui("Oyuncu, rakip, takım, aşama ve edisyon ilişkilerinin yaşayan ağı.", "A living network of player, rival, team, stage and edition relationships."))}
        ${moduleCard("pure-player-rating", ui("Pure Player Rating", "Pure Player Rating"), ui("Rakip ve takım etkisi düzeltilmiş oyuncu gücü.", "Player strength adjusted for opposition and team effects."))}
        ${moduleCard("legacy-index", ui("Legacy Index", "Legacy Index"), ui("Başarı, zirve, baskı, süreklilik ve çok yönlülük bileşimi.", "Achievement, peak, pressure, longevity and versatility combined."))}
        ${moduleCard("storyline-engine", ui("Storyline Engine", "Storyline Engine"), ui("Resmî veriden otomatik turnuva ve tarih hikâyeleri.", "Automatic tournament and historical stories from official data."))}
      </div>
      <div class="fui-overview-grid"><article class="fui-graph-card"><header><div><span>UNIVERSAL MATCH GRAPH</span><h4>${ui("Futbol Evreni İlişki Haritası", "Football Universe Relationship Map")}</h4></div><b>${data.players.length} ${ui("OYUNCU", "PLAYERS")} · ${data.rivalries.length} ${ui("BAĞ", "EDGES")}</b></header>${data.graph}</article>
      <aside class="fui-legacy-board"><header><span>LEGACY INDEX</span><h4>${ui("Tarihsel Büyüklük", "Historical Greatness")}</h4></header>${legacy.map((player, index) => `<article><i>${index + 1}</i><div><strong>${escapeHTML(player.name)}</strong><small>${player.titles} 🏆 · ${player.games} MP · ${player.ppr.toFixed(1)} PPR</small></div><b>${player.legacy.toFixed(1)}</b></article>`).join("")}</aside></div>
      <section class="fui-story-strip" data-module="tournament-storyline-engine"><header><div><span>TOURNAMENT STORYLINE ENGINE</span><h4>${ui("Evrenin Şu An Anlattığı Hikâyeler", "Stories the Universe Is Telling Now")}</h4></div><b>${data.stories.length} LIVE STORIES</b></header><div>${data.stories.slice(0, 7).map(story => `<article style="--story-accent:${story.accent}"><span>${escapeHTML(story.eyebrow)}</span><strong>${escapeHTML(story.title)}</strong><small>${escapeHTML(story.subtitle)}</small></article>`).join("")}</div></section>
    </section>`;
  }

  function renderPlayers(data) {
    const eligible = data.players.filter(player => player.games >= Math.min(5, MIN_SAMPLE));
    const selected = eligible.find(player => player.key === normalize(selectedPlayer)) || eligible[0] || data.players[0];
    if (selected) selectedPlayer = selected.name;
    return `<section class="fui-section" data-panel="players">
      <div class="fui-module-catalogue">
        ${moduleCard("prime-finder", ui("Prime Finder", "Prime Finder"), ui("Her kariyerin en güçlü 10 maçlık penceresi.", "The strongest 10-match window in every career."))}
        ${moduleCard("championship-leverage-added", ui("Championship Leverage Added", "Championship Leverage Added"), ui("Beklenen performansın aşama önemine göre ağırlığı.", "Performance above expectation weighted by stage importance."))}
        ${moduleCard("pressure-dna", ui("Pressure DNA", "Pressure DNA"), ui("Eleme, yarı final ve final baskısındaki performans.", "Performance under knockout, semi-final and final pressure."))}
        ${moduleCard("career-dna-evolution", ui("Career DNA Evolution", "Career DNA Evolution"), ui("Oyuncu profilinin edisyonlar boyunca değişimi.", "How a player profile changes across editions."))}
      </div>
      <label class="fui-select">${ui("Oyuncu analizi", "Player analysis")}<select id="fuiPlayerSelect">${data.players.map(player => `<option value="${escapeHTML(player.name)}" ${player.key === selected?.key ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></label>
      ${selected ? `<div class="fui-player-hero"><article><span>PURE PLAYER RATING</span><h3>${escapeHTML(selected.name)}</h3><strong>${selected.ppr.toFixed(1)}</strong><small>${ui("Güven", "Confidence")} ${selected.ratingConfidence.toFixed(0)}% · ${selected.games} MP</small></article><div>${scoreBar("PPR", selected.ppr)}${scoreBar(ui("Legacy", "Legacy"), selected.legacy)}${scoreBar(ui("Pressure DNA", "Pressure DNA"), selected.pressureScore)}${scoreBar(ui("Çok Yönlülük", "Versatility"), selected.versatility)}${scoreBar("PAE", clamp(50 + selected.pae * 2))}</div><aside><span>PRIME FINDER</span><b>${selected.prime.score.toFixed(1)}</b><strong>FIFA${selected.prime.startEdition}–FIFA${selected.prime.endEdition}</strong><small>${selected.prime.games} MP · ${selected.prime.ppg.toFixed(2)} PPG · ${selected.prime.gdPerMatch > 0 ? "+" : ""}${selected.prime.gdPerMatch.toFixed(2)} GD/M</small></aside></div>
      <div class="fui-evolution" data-module="career-dna-evolution"><header><div><span>CAREER DNA EVOLUTION</span><h4>${ui("Edisyon Bazlı Kariyer Eğrisi", "Edition-by-Edition Career Curve")}</h4></div><b>${selected.editions.length} ${ui("EDİSYON", "EDITIONS")}</b></header><div>${selected.editions.map(edition => `<article><span>FIFA ${edition.edition}</span><i><em style="height:${clamp(edition.dnaScore)}%"></em></i><strong>${edition.dnaScore.toFixed(0)}</strong><small>${edition.ppg.toFixed(2)} PPG</small></article>`).join("")}</div></div>` : ""}
      <div class="fui-table-wrap"><table class="fui-table"><thead><tr><th>#</th><th>${ui("Oyuncu", "Player")}</th><th>PPR</th><th>Legacy</th><th>Prime</th><th>PAE</th><th>CLA</th><th>${ui("Baskı", "Pressure")}</th><th>${ui("Takım Bağımlılığı", "Team Dependency")}</th><th>MP</th></tr></thead><tbody>${eligible.map((player, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(player.name)}</strong></td><td>${player.ppr.toFixed(1)}</td><td>${player.legacy.toFixed(1)}</td><td>${player.prime.score.toFixed(1)}</td><td class="${player.pae >= 0 ? "positive" : "negative"}">${player.pae >= 0 ? "+" : ""}${player.pae.toFixed(1)}</td><td class="${player.leverage >= 0 ? "positive" : "negative"}">${player.leverage >= 0 ? "+" : ""}${player.leverage.toFixed(0)}</td><td>${player.pressureScore.toFixed(1)}</td><td>${player.teamDependency.toFixed(1)}</td><td>${player.games}</td></tr>`).join("")}</tbody></table></div>
      <p class="fui-method">${ui("PPR resmî ELO’nun yerine geçmez. Rakip gücü, takımın Bayes-düzeltilmiş performansı, GD/M ve beklenen sonuca göre performansı birleştiren analitik göstergedir. Küçük örneklemler 50 merkezine daraltılır.", "PPR does not replace official ELO. It is an analytical indicator combining opposition strength, Bayesian-adjusted team performance, GD/M and performance versus expectation. Small samples are shrunk toward 50.")}</p>
    </section>`;
  }

  function renderTournament(data, draw) {
    const probability = qualificationProbability(draw, data);
    const currentEdition = data.editions[data.editions.length - 1];
    const audit = balanceAudit(draw, data);
    const formats = formatLaboratory(draw, data);
    return `<section class="fui-section" data-panel="tournament">
      <div class="fui-module-catalogue">
        ${moduleCard("qualification-probability-lab", ui("Qualification Probability Lab", "Qualification Probability Lab"), ui("Kalan maçların tekrarlanabilir Monte Carlo simülasyonu.", "Reproducible Monte Carlo simulation of remaining matches."))}
        ${moduleCard("tournament-difficulty-coefficient", ui("Tournament Difficulty Coefficient", "Tournament Difficulty Coefficient"), ui("Saha gücü, denge, oyuncu sayısı ve eleme yoğunluğu.", "Field strength, parity, player count and knockout density."))}
        ${moduleCard("tournament-fingerprint", ui("Tournament Fingerprint", "Tournament Fingerprint"), ui("Her edisyonun hücum, denge, drama, baskı ve çeşitlilik DNA’sı.", "Attack, parity, drama, pressure and variety DNA for every edition."))}
        ${moduleCard("format-laboratory", ui("Format Laboratory", "Format Laboratory"), ui("Gelecek sezon formatlarını adalet ve katılım açısından karşılaştırır.", "Compares future formats for fairness and engagement."))}
        ${moduleCard("competitive-balance-observatory", ui("Competitive Balance Observatory", "Competitive Balance Observatory"), ui("Grup gücü ve maç hacmi adalet denetimi.", "Group-strength and match-volume fairness audit."))}
      </div>
      <section class="fui-qualification-probability"><header><div><span>QUALIFICATION PROBABILITY LAB</span><h4>${ui("FIFA 10 Yol Olasılıkları", "FIFA 10 Path Probabilities")}</h4><p>${ui(`${probability.iterations.toLocaleString("tr-TR")} tekrarlanabilir simülasyon · PPR, mevcut sonuçlar ve kalan fikstür`, `${probability.iterations.toLocaleString("en-GB")} reproducible simulations · PPR, current results and remaining fixtures`)}</p></div><b>MODEL · NOT OFFICIAL</b></header><div class="fui-probability-table">${probability.rows.map((row, index) => `<article><i>${index + 1}</i><strong>${escapeHTML(row.name)}</strong><span><b style="width:${row.directPct}%"></b></span><em>${row.directPct.toFixed(1)}% QF</em><span class="playin"><b style="width:${row.playinPct}%"></b></span><em>${row.playinPct.toFixed(1)}% P-I</em><small>#${row.expectedRank.toFixed(1)}</small></article>`).join("") || `<p>${ui("FIFA 10 kura verisi bekleniyor.", "Waiting for FIFA 10 draw data.")}</p>`}</div>${probability.pairings.length ? `<div class="fui-pairing-probability">${probability.pairings.map(pair => `<span><strong>${escapeHTML(pair.first)}</strong><i>VS</i><strong>${escapeHTML(pair.second)}</strong><b>${pair.probability.toFixed(1)}%</b></span>`).join("")}</div>` : ""}<p>${ui("Bu yüzdeler tahmindir; resmî sıralama yalnızca oynanmış maçlardan oluşur.", "These percentages are projections; the official table is based only on completed matches.")}</p></section>
      ${currentEdition ? `<div class="fui-tournament-grid"><article class="fui-difficulty"><span>TOURNAMENT DIFFICULTY COEFFICIENT</span><strong>${currentEdition.difficulty.toFixed(0)}</strong><h4>FIFA ${currentEdition.edition}</h4><small>${currentEdition.playerCount} ${ui("oyuncu", "players")} · ${currentEdition.matches.length} ${ui("maç", "matches")} · ${currentEdition.fieldStrength.toFixed(0)} ${ui("saha ELO", "field ELO")}</small></article><article class="fui-fingerprint"><header><span>TOURNAMENT FINGERPRINT</span><h4>FIFA ${currentEdition.edition}</h4></header>${Object.entries(currentEdition.fingerprint).map(([key, value]) => scoreBar(key.toUpperCase(), value)).join("")}</article><article class="fui-balance"><span>COMPETITIVE BALANCE OBSERVATORY</span><strong>${audit.score.toFixed(0)}</strong><h4>${ui("Adalet Sağlık Skoru", "Fairness Health Score")}</h4><small>${audit.notes.map(escapeHTML).join(" · ")}</small></article></div>` : ""}
      <section class="fui-format-lab"><header><div><span>FORMAT LABORATORY</span><h4>${ui("FIFA 11 Format Karşılaştırması", "FIFA 11 Format Comparison")}</h4></div><b>${formats.participantCount} ${ui("OYUNCU MODELİ", "PLAYER MODEL")}</b></header><div class="fui-table-wrap"><table class="fui-table"><thead><tr><th>#</th><th>${ui("Format", "Format")}</th><th>${ui("Maç", "Matches")}</th><th>${ui("Adalet", "Fairness")}</th><th>${ui("Katılım", "Engagement")}</th><th>${ui("Ölü Maç Riski", "Dead Match Risk")}</th><th>${ui("Süre", "Duration")}</th><th>${ui("Genel", "Overall")}</th></tr></thead><tbody>${formats.formats.map((format, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(format.name)}</strong></td><td>${Math.round(format.matches)}</td><td>${format.fairness.toFixed(1)}</td><td>${format.engagement.toFixed(1)}</td><td>${format.deadRisk.toFixed(1)}%</td><td>${format.duration.toFixed(0)}</td><td><b>${format.overall.toFixed(1)}</b></td></tr>`).join("")}</tbody></table></div><p>${escapeHTML(formats.note)}</p></section>
    </section>`;
  }

  function renderRivalries(data) {
    const simulation = eraSimulation(data);
    const options = data.players.filter(player => player.games >= Math.min(5, MIN_SAMPLE));
    return `<section class="fui-section" data-panel="rivalries">
      <div class="fui-module-catalogue">
        ${moduleCard("rivalry-intelligence-network", ui("Rivalry Intelligence Network", "Rivalry Intelligence Network"), ui("Rekabet ısısı, denge, eleme yoğunluğu ve sürprizler.", "Rivalry heat, balance, knockout density and upsets."))}
        ${moduleCard("era-vs-era-prime-simulation", ui("Era vs Era — Prime Simulation", "Era vs Era — Prime Simulation"), ui("Farklı kariyer zirvelerinin 10.000 maçlık analitik karşılaştırması.", "A 10,000-match analytical comparison of career peaks."))}
        ${moduleCard("iconic-match-index", ui("Iconic Match Index", "Iconic Match Index"), ui("Aşama, sürpriz, yakınlık ve skor ortamıyla maç önemi.", "Match significance from stage, upset, closeness and scoring environment."))}
        ${moduleCard("championship-lineage", ui("Championship Lineage", "Championship Lineage"), ui("İlk şampiyondan bugüne yaşayan lineal kemer.", "The living lineal belt from the first champion to today."))}
      </div>
      <div class="fui-rivalry-grid"><section><header><div><span>RIVALRY INTELLIGENCE NETWORK</span><h4>${ui("En Sıcak Rekabetler", "Hottest Rivalries")}</h4></div><b>TOP 12</b></header>${data.rivalries.slice(0, 12).map((row, index) => `<article><i>${index + 1}</i><div><strong>${escapeHTML(row.playerA)} <span>VS</span> ${escapeHTML(row.playerB)}</strong><small>${row.matches} MP · ${row.winsA}-${row.draws}-${row.winsB} · ${row.knockout} KO</small></div><b>${row.heat.toFixed(0)}</b></article>`).join("")}</section>
      <section class="fui-era-sim"><header><span>ERA VS ERA · PRIME SIMULATION</span><h4>${ui("Zirvelerin Karşılaşması", "Clash of Primes")}</h4></header><div class="fui-dual-select"><select id="fuiEraA">${options.map(player => `<option value="${escapeHTML(player.name)}" ${player.key === simulation.first?.key ? "selected" : ""}>${escapeHTML(player.name)} · FIFA${player.prime.startEdition}–${player.prime.endEdition}</option>`).join("")}</select><b>VS</b><select id="fuiEraB">${options.map(player => `<option value="${escapeHTML(player.name)}" ${player.key === simulation.second?.key ? "selected" : ""}>${escapeHTML(player.name)} · FIFA${player.prime.startEdition}–${player.prime.endEdition}</option>`).join("")}</select></div>${simulation.first && simulation.second ? `<div class="fui-sim-result"><article><strong>${escapeHTML(simulation.first.name)}</strong><b>${simulation.firstPct.toFixed(1)}%</b><small>Prime ${simulation.first.prime.score.toFixed(1)}</small></article><div><span style="width:${simulation.firstPct}%"></span><i style="width:${simulation.drawPct}%"></i><em style="width:${simulation.secondPct}%"></em><b>${simulation.drawPct.toFixed(1)}% DRAW</b></div><article><strong>${escapeHTML(simulation.second.name)}</strong><b>${simulation.secondPct.toFixed(1)}%</b><small>Prime ${simulation.second.prime.score.toFixed(1)}</small></article></div><p>10,000 ${ui("analitik simülasyon · resmî sonuç değildir", "analytical simulations · not an official result")}</p>` : ""}</section></div>
      <section class="fui-iconic"><header><div><span>ICONIC MATCH INDEX</span><h4>${ui("Tarihin En Önemli Maçları", "Most Significant Matches in History")}</h4></div><b>TOP 15</b></header><div class="fui-table-wrap"><table class="fui-table"><thead><tr><th>#</th><th>${ui("Maç", "Match")}</th><th>${ui("Skor", "Score")}</th><th>FIFA</th><th>${ui("Aşama", "Stage")}</th><th>${ui("İkonik Puan", "Iconic Score")}</th></tr></thead><tbody>${data.iconic.slice(0, 15).map((match, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(match.homeName)} – ${escapeHTML(match.awayName)}</strong></td><td>${match.homeScore}–${match.awayScore}</td><td>${match.edition}</td><td>${escapeHTML(match.stage)}</td><td><b>${match.iconicScore.toFixed(0)}</b></td></tr>`).join("")}</tbody></table></div></section>
      <section class="fui-lineage"><header><div><span>CHAMPIONSHIP LINEAGE</span><h4>${ui("Yaşayan Şampiyonluk Kemeri", "Living Championship Belt")}</h4></div><b>${escapeHTML(data.lineage.holder || "–")}</b></header><div>${data.lineage.changes.slice(-12).map(change => `<article><span>FIFA ${change.edition}</span><strong>${escapeHTML(change.from || ui("Başlangıç", "Origin"))}</strong><i>→</i><strong>${escapeHTML(change.to)}</strong><small>${change.match ? `${escapeHTML(change.match.homeName)} ${change.match.homeScore}–${change.match.awayScore} ${escapeHTML(change.match.awayName)}` : escapeHTML(change.reason)}</small></article>`).join("")}</div></section>
    </section>`;
  }

  function renderHistory(data) {
    const time = timeMachine(data);
    return `<section class="fui-section" data-panel="history">
      <div class="fui-module-catalogue">
        ${moduleCard("fifa-universe-time-machine", ui("FIFA Universe Time Machine", "FIFA Universe Time Machine"), ui("Seçilen edisyon tamamlandığı andaki tarihsel evren.", "The historical universe as it stood at the selected edition."))}
        ${moduleCard("living-records-book", ui("Living Records Book", "Living Records Book"), ui("Yeni sonuçlarla otomatik değişen resmî rekor sahipleri.", "Record holders that update automatically with new results."))}
        ${moduleCard("prime-finder-history", ui("Prime Archive", "Prime Archive"), ui("Zirve dönemlerinin kalıcı tarihsel kataloğu.", "Permanent historical catalogue of peak periods."))}
      </div>
      <section class="fui-time-machine"><header><div><span>FIFA UNIVERSE TIME MACHINE</span><h4>${ui("Tarihi Geri Sar", "Rewind History")}</h4><p>${ui("Gelecekteki başarılar gizlenir; tablo yalnızca seçilen edisyona kadar oynanan maçlardan oluşur.", "Future achievements are hidden; the table uses only matches played up to the selected edition.")}</p></div><select id="fuiTimeEdition">${data.editions.map(edition => `<option value="${edition.edition}" ${edition.edition === time.edition ? "selected" : ""}>FIFA ${edition.edition}</option>`).join("")}</select></header><div class="fui-time-summary"><article><span>${ui("O tarihteki lider", "Leader at that time")}</span><strong>${escapeHTML(time.players[0]?.name || "–")}</strong><b>${time.players[0]?.legacy.toFixed(1) || "0.0"} Legacy</b></article><article><span>${ui("Oynanmış maç", "Matches played")}</span><strong>${time.matches.length}</strong><b>FIFA01–FIFA${time.edition}</b></article><article><span>${ui("Kayıtlı şampiyonluk", "Recorded titles")}</span><strong>${time.honours.filter(item => item.competition === "oruc" && item.winner).length}</strong><b>${ui("Resmî tarih", "Official history")}</b></article></div><div class="fui-table-wrap"><table class="fui-table"><thead><tr><th>#</th><th>${ui("Oyuncu", "Player")}</th><th>Legacy</th><th>PPR</th><th>Prime</th><th>PPG</th><th>MP</th><th>🏆</th></tr></thead><tbody>${time.players.slice(0, 20).map((player, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(player.name)}</strong></td><td>${player.legacy.toFixed(1)}</td><td>${player.ppr.toFixed(1)}</td><td>${player.prime.score.toFixed(1)}</td><td>${player.ppg.toFixed(2)}</td><td>${player.games}</td><td>${player.titles}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="fui-records"><header><div><span>LIVING RECORDS BOOK</span><h4>${ui("Yaşayan Rekorlar Kitabı", "Living Records Book")}</h4></div><b>${data.records.length} ${ui("ANA REKOR", "CORE RECORDS")}</b></header><div>${data.records.map((record, index) => `<article><i>${index + 1}</i><span>${escapeHTML(record.label)}</span><strong>${escapeHTML(record.player)}</strong><b>${escapeHTML(record.value)}</b></article>`).join("")}</div></section>
    </section>`;
  }

  function renderTeams(data, draw) {
    const advisor = teamAdvisor(draw, data);
    return `<section class="fui-section" data-panel="teams">
      <div class="fui-module-catalogue">${moduleCard("smart-team-advisor", ui("Smart Team Advisor", "Smart Team Advisor"), ui("Takım pasaportu, havuz kullanımı ve kanıt seviyesine göre üç karar desteği.", "Three decision-support choices based on the team passport, pool usage and evidence level."))}</div>
      <section class="fui-advisor"><header><div><span>SMART TEAM ADVISOR</span><h4>${ui("Sıradaki Maç İçin Takım Karar Desteği", "Team Decision Support for the Next Match")}</h4><p>${escapeHTML(advisor.note)}</p></div><label>${ui("Oyuncu", "Player")}<select id="fuiAdvisorPlayer">${(draw?.participants || []).map(player => `<option value="${escapeHTML(player.id)}" ${player.id === advisor.player?.id ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></label></header>${advisor.fixture ? `<div class="fui-advisor-fixture"><span>${advisor.fixture.stars}★ · ${ui("GRUP", "GROUP")} ${advisor.fixture.group} · MD ${advisor.fixture.matchday}</span><strong>${escapeHTML(advisor.player.name)} <i>VS</i> ${escapeHTML(advisor.opponent?.name || "–")}</strong><b>${advisor.eligibleCount} ${ui("uygun takım", "eligible teams")}</b></div><div class="fui-advisor-choices">${advisor.choices.map((choice, index) => `<article><i>${index + 1}</i><span>${escapeHTML(choice.role)}</span><strong>${escapeHTML(choice.team)}</strong><small>${escapeHTML(choice.reason)}</small><b>${choice.games ? `${choice.games} MP · ${choice.ppg.toFixed(2)} PPG` : ui("YENİ VERİ", "FRESH DATA")}</b></article>`).join("")}</div>` : `<div class="fui-empty">${escapeHTML(advisor.note)}</div>`}</section>
      <section class="fui-team-evidence"><header><div><span>ALL-TIME TEAM EVIDENCE</span><h4>${ui("Takım Performans Kanıt Tablosu", "Team Performance Evidence Table")}</h4></div><b>${data.teams.length} ${ui("TAKIM KAYDI", "TEAM RECORDS")}</b></header><div class="fui-table-wrap"><table class="fui-table"><thead><tr><th>#</th><th>${ui("Takım", "Team")}</th><th>★</th><th>MP</th><th>PPG</th><th>GD/M</th><th>GF/M</th><th>GA/M</th><th>${ui("Oyuncu", "Players")}</th></tr></thead><tbody>${[...data.teams].sort((a, b) => b.bayesianPPG - a.bayesianPPG || b.games - a.games).slice(0, 40).map((team, index) => `<tr><td>${index + 1}</td><td><strong>${escapeHTML(team.team)}</strong></td><td>${team.stars || "–"}</td><td>${team.games}</td><td>${team.bayesianPPG.toFixed(2)}</td><td>${team.gdPerMatch > 0 ? "+" : ""}${team.gdPerMatch.toFixed(2)}</td><td>${team.gfPerMatch.toFixed(2)}</td><td>${team.gaPerMatch.toFixed(2)}</td><td>${team.playerCount}</td></tr>`).join("")}</tbody></table></div></section>
    </section>`;
  }

  function renderMedia(data) {
    const story = data.stories[selectedMediaStory] || data.stories[0];
    const svg = mediaSvg(story, data);
    const preview = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return `<section class="fui-section" data-panel="media">
      <div class="fui-module-catalogue">
        ${moduleCard("tournament-storyline-engine", ui("Tournament Storyline Engine", "Tournament Storyline Engine"), ui("Resmî veriden paylaşılabilir anlatılar üretir.", "Creates shareable narratives from official data."))}
        ${moduleCard("automatic-media-factory", ui("Otomatik Medya Fabrikası", "Automatic Media Factory"), ui("Story veya WhatsApp için 1080×1350 SVG medya kartı.", "A 1080×1350 SVG media card for Stories or WhatsApp."))}
      </div>
      <div class="fui-media-layout"><section><header><div><span>TOURNAMENT STORYLINE ENGINE</span><h4>${ui("Hikâye Seç", "Select a Story")}</h4></div><b>${data.stories.length}</b></header><div class="fui-story-selector">${data.stories.map((item, index) => `<button type="button" class="${index === selectedMediaStory ? "active" : ""}" data-f10intel-action="select-story" data-story-index="${index}" style="--story-accent:${item.accent}"><span>${escapeHTML(item.eyebrow)}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></button>`).join("")}</div></section><aside class="fui-media-preview"><header><span>AUTOMATIC MEDIA FACTORY</span><h4>1080 × 1350</h4></header><img src="${preview}" alt="${ui("Otomatik oluşturulan turnuva medya kartı", "Automatically generated tournament media card")}"><button type="button" data-f10intel-action="download-media">${ui("SVG MEDYA KARTINI İNDİR", "DOWNLOAD SVG MEDIA CARD")} ↗</button><small>${ui("Kart yalnızca resmî istatistik ve seçilen hikâye metnini kullanır.", "The card uses only official statistics and the selected storyline copy.")}</small></aside></div>
    </section>`;
  }

  function renderPanel(data, draw) {
    if (activePanel === "players") return renderPlayers(data);
    if (activePanel === "tournament") return renderTournament(data, draw);
    if (activePanel === "rivalries") return renderRivalries(data);
    if (activePanel === "history") return renderHistory(data);
    if (activePanel === "teams") return renderTeams(data, draw);
    if (activePanel === "media") return renderMedia(data);
    return renderOverview(data);
  }

  function render(payload, draw, options = {}) {
    const mount = options.mount || document.getElementById("f10UniverseIntelligenceRoot");
    if (!mount) return "";
    lastPayload = payload;
    lastDraw = draw;
    lastMount = mount;
    const data = buildUniverse(payload, draw);
    const latestEdition = data.editions[data.editions.length - 1];
    mount.innerHTML = `<section class="fui-root"><header class="fui-hero"><div><span>FOOTBALL UNIVERSE INTELLIGENCE · V${VERSION}</span><h3>${ui("Geçmişi ölç. Bugünü anla.", "Measure history. Understand the present.")}<br><em>${ui("Geleceği tasarla.", "Design the future.")}</em></h3><p>${ui("Resmî maç kaydı değişmeden; takımdan arındırılmış güç, kariyer zirveleri, rekabet ağı, turnuva DNA’sı ve gelecek format modelleri.", "Without changing the official match record: team-adjusted strength, career peaks, rivalry networks, tournament DNA and future-format models.")}</p></div><aside><article><span>${ui("Tüm Zamanlar Maçı", "All-Time Matches")}</span><b>${data.matches.length}</b></article><article><span>${ui("Oyuncu", "Players")}</span><b>${data.players.length}</b></article><article><span>${ui("Edisyon", "Editions")}</span><b>${data.editions.length}</b></article><article><span>${ui("Güncel Zorluk", "Current Difficulty")}</span><b>${latestEdition?.difficulty.toFixed(0) || "–"}</b></article></aside></header>
      <nav class="fui-nav">${PANELS.map(([id, tr, en]) => `<button type="button" class="${activePanel === id ? "active" : ""}" data-f10intel-action="panel" data-panel="${id}">${ui(tr, en)}</button>`).join("")}</nav>
      <main>${renderPanel(data, draw)}</main>
      <footer><span>${ui("RESMÎ KATMAN", "OFFICIAL LAYER")}: ${ui("skorlar · sıralamalar · kupalar", "scores · standings · honours")}</span><span>${ui("ANALİTİK KATMAN", "ANALYTICAL LAYER")}: PPR · PAE · PRIME · LEGACY · CLA</span><span>${ui("SİMÜLASYON KATMANI", "SIMULATION LAYER")}: ${ui("açıkça işaretlenmiş, resmî olmayan modeller", "clearly labelled non-official models")}</span></footer>
    </section>`;
    persist();
    installListeners();
    return mount.innerHTML;
  }

  function persist() {
    sessionStorage.setItem("fifa-universe-panel", activePanel);
    sessionStorage.setItem("fifa-universe-player", selectedPlayer);
    sessionStorage.setItem("fifa-universe-rival-a", selectedRivalA);
    sessionStorage.setItem("fifa-universe-rival-b", selectedRivalB);
    sessionStorage.setItem("fifa-universe-edition", String(selectedEdition || ""));
    sessionStorage.setItem("fifa-universe-advisor-player", selectedAdvisorPlayer);
    sessionStorage.setItem("fifa-universe-media-story", String(selectedMediaStory));
  }

  function rerender() {
    if (lastMount && lastPayload) render(lastPayload, lastDraw, { mount: lastMount });
  }

  function downloadMedia() {
    if (!lastData) return;
    const story = lastData.stories[selectedMediaStory] || lastData.stories[0];
    const svg = mediaSvg(story, lastData);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `FIFA_UNIVERSE_${String(story?.type || "MEDIA").toUpperCase()}_V4717.svg`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("click", event => {
      const button = event.target.closest?.("[data-f10intel-action]");
      if (!button) return;
      const action = button.dataset.f10intelAction;
      if (action === "panel") {
        activePanel = PANELS.some(([id]) => id === button.dataset.panel) ? button.dataset.panel : "overview";
        rerender();
      } else if (action === "select-story") {
        selectedMediaStory = Math.max(0, Number(button.dataset.storyIndex || 0));
        rerender();
      } else if (action === "download-media") downloadMedia();
    });
    document.addEventListener("change", event => {
      const id = event.target?.id;
      if (id === "fuiPlayerSelect") selectedPlayer = event.target.value;
      else if (id === "fuiEraA") selectedRivalA = event.target.value;
      else if (id === "fuiEraB") selectedRivalB = event.target.value;
      else if (id === "fuiTimeEdition") selectedEdition = Number(event.target.value || 0);
      else if (id === "fuiAdvisorPlayer") selectedAdvisorPlayer = event.target.value;
      else return;
      rerender();
    });
  }

  window.FIFA_UNIVERSE_INTELLIGENCE = {
    version: VERSION,
    build: BUILD,
    render,
    buildUniverse: (payload = appContext()?.getState?.(), draw = appContext()?.getFifa10Draw?.()) => buildUniverse(payload, draw),
    qualificationProbability: (draw = appContext()?.getFifa10Draw?.(), data = lastData || buildUniverse(appContext()?.getState?.(), draw), iterations = 1800) => qualificationProbability(draw, data, iterations),
    teamAdvisor: (draw = appContext()?.getFifa10Draw?.(), data = lastData || buildUniverse(appContext()?.getState?.(), draw), player = selectedAdvisorPlayer) => teamAdvisor(draw, data, player),
    eraSimulation: (data = lastData || buildUniverse(appContext()?.getState?.(), appContext()?.getFifa10Draw?.()), first = selectedRivalA, second = selectedRivalB) => eraSimulation(data, first, second),
    timeMachine: (data = lastData || buildUniverse(appContext()?.getState?.(), appContext()?.getFifa10Draw?.()), edition = selectedEdition) => timeMachine(data, edition),
    formatLaboratory: (draw = appContext()?.getFifa10Draw?.(), data = lastData || buildUniverse(appContext()?.getState?.(), draw)) => formatLaboratory(draw, data),
    balanceAudit: (draw = appContext()?.getFifa10Draw?.(), data = lastData || buildUniverse(appContext()?.getState?.(), draw)) => balanceAudit(draw, data),
    mediaSvg: (story, data = lastData || buildUniverse(appContext()?.getState?.(), appContext()?.getFifa10Draw?.())) => mediaSvg(story, data)
  };
})();
