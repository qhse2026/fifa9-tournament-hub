(() => {
  "use strict";

  const VERSION = "3.0.0";
  const MODULE_ID = "player-standing-universe-v300";
  const ui = {
    tab: sessionStorage.getItem("psu-tab") || "overview",
    player: sessionStorage.getItem("psu-player") || "",
    rivalA: sessionStorage.getItem("psu-rival-a") || "",
    rivalB: sessionStorage.getItem("psu-rival-b") || "",
    impactA: sessionStorage.getItem("psu-impact-a") || "",
    impactB: sessionStorage.getItem("psu-impact-b") || "",
    impactStage: sessionStorage.getItem("psu-impact-stage") || "standard",
    impactMargin: Number(sessionStorage.getItem("psu-impact-margin") || 1),
    impactOutcome: sessionStorage.getItem("psu-impact-outcome") || "home"
  };

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const avg = values => {
    const clean = values.map(Number).filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
  };
  const deviation = values => {
    const clean = values.map(Number).filter(Number.isFinite);
    if (clean.length < 2) return 0;
    const mean = avg(clean);
    return Math.sqrt(avg(clean.map(value => (value - mean) ** 2)));
  };
  const signed = value => `${Number(value) >= 0 ? "+" : ""}${Math.round(Number(value) || 0)}`;
  const pct = value => `${Math.round(clamp(value, 0, 1) * 100)}%`;
  const logistic = value => 1 / (1 + Math.exp(-value));
  const norm = value => String(value || "").toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const pairKey = (a, b) => [norm(a), norm(b)].sort().join("::");
  const tr = (trText, enText) => document.documentElement.lang === "en" ? enText : trText;

  function context() {
    return window.FIFA_APP_CONTEXT || null;
  }

  function baseAnalytics() {
    const ctx = context();
    if (!ctx?.buildFpiAnalytics) return null;
    try { return ctx.buildFpiAnalytics(); } catch (error) { console.error("Standing Universe analytics error", error); return null; }
  }

  function unifiedMatches() {
    const ctx = context();
    try { return ctx?.buildUnifiedAllTimeMatches?.() || []; } catch { return []; }
  }

  function currentMatches() {
    const ctx = context();
    try { return ctx?.getCurrentMatches?.() || []; } catch { return []; }
  }

  function playerSide(record, name) {
    const home = record.home === name;
    const actual = record.winner ? (record.winner === name ? 1 : 0) : 0.5;
    return {
      id: record.id,
      opponent: home ? record.away : record.home,
      before: home ? record.beforeHome : record.beforeAway,
      after: home ? record.afterHome : record.afterAway,
      opponentBefore: home ? record.beforeAway : record.beforeHome,
      change: home ? record.deltaHome : record.deltaAway,
      expected: home ? record.expectedHome : 1 - record.expectedHome,
      actual,
      won: actual === 1,
      draw: actual === 0.5,
      lost: actual === 0,
      stageKey: record.stageKey,
      stageLabel: record.stageLabel,
      stageMultiplier: record.stageMultiplier,
      marginMultiplier: record.marginMultiplier,
      margin: record.margin,
      score: home ? `${record.match?.homeScore ?? 0}-${record.match?.awayScore ?? 0}` : `${record.match?.awayScore ?? 0}-${record.match?.homeScore ?? 0}`,
      edition: Number(record.match?.edition) || 0,
      editionLabel: record.match?.editionLabel || `FIFA ${record.match?.edition || "–"}`,
      pressure: Number(record.stageMultiplier) > 1,
      upset: actual === 1 && (home ? record.beforeAway - record.beforeHome : record.beforeHome - record.beforeAway) >= 90,
      upsetGap: actual === 1 ? Math.max(0, (home ? record.beforeAway - record.beforeHome : record.beforeHome - record.beforeAway)) : 0
    };
  }

  function buildReigns(base) {
    const allNames = base.players.map(player => player.name);
    const ratings = new Map(allNames.map(name => [name, 1500]));
    const seen = new Set();
    const segments = [];
    let active = null;
    base.records.forEach((record, index) => {
      ratings.set(record.home, record.afterHome);
      ratings.set(record.away, record.afterAway);
      seen.add(record.home); seen.add(record.away);
      const ranked = [...seen].map(name => ({ name, rating: ratings.get(name) || 1500 }))
        .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, "tr"));
      const leader = ranked[0];
      if (!leader) return;
      if (!active || active.name !== leader.name) {
        if (active) segments.push(active);
        active = { name: leader.name, startIndex: index, endIndex: index, matches: 1, startRating: leader.rating, endRating: leader.rating, tookFrom: segments.at(-1)?.name || "", recordId: record.id };
      } else {
        active.endIndex = index;
        active.matches += 1;
        active.endRating = leader.rating;
      }
    });
    if (active) segments.push(active);
    const byPlayer = new Map();
    segments.forEach(segment => {
      if (!byPlayer.has(segment.name)) byPlayer.set(segment.name, { name: segment.name, total: 0, longest: 0, entries: 0, current: 0, segments: [] });
      const row = byPlayer.get(segment.name);
      row.total += segment.matches;
      row.longest = Math.max(row.longest, segment.matches);
      row.entries += 1;
      row.segments.push(segment);
    });
    const currentSegment = segments.at(-1) || null;
    if (currentSegment && byPlayer.has(currentSegment.name)) byPlayer.get(currentSegment.name).current = currentSegment.matches;
    return {
      segments,
      byPlayer,
      current: currentSegment,
      leaders: [...byPlayer.values()].sort((a, b) => b.total - a.total || b.longest - a.longest || a.name.localeCompare(b.name, "tr"))
    };
  }

  function buildRivalries(base) {
    const pairs = new Map();
    base.records.forEach(record => {
      const key = pairKey(record.home, record.away);
      if (!pairs.has(key)) pairs.set(key, { key, a: record.home, b: record.away, records: [] });
      pairs.get(key).records.push(record);
    });
    const rows = [...pairs.values()].map(pair => {
      const names = [pair.a, pair.b];
      const stats = Object.fromEntries(names.map(name => [name, { name, wins: 0, draws: 0, losses: 0, ratingNet: 0, goalsFor: 0, goalsAgainst: 0, pressureWins: 0, upsets: 0 }]));
      pair.records.forEach(record => {
        names.forEach(name => {
          const side = playerSide(record, name);
          const row = stats[name];
          row.ratingNet += side.change;
          row.goalsFor += Number(side.score.split("-")[0]) || 0;
          row.goalsAgainst += Number(side.score.split("-")[1]) || 0;
          if (side.won) row.wins += 1;
          else if (side.draw) row.draws += 1;
          else row.losses += 1;
          if (side.won && side.pressure) row.pressureWins += 1;
          if (side.upset) row.upsets += 1;
        });
      });
      const meetings = pair.records.length;
      const aStats = stats[pair.a], bStats = stats[pair.b];
      const resultCloseness = meetings ? 1 - Math.min(1, Math.abs(aStats.wins - bStats.wins) / meetings) : 0;
      const pressureMatches = pair.records.filter(record => record.stageMultiplier > 1).length;
      const finals = pair.records.filter(record => record.stageKey === "final").length;
      const avgShift = avg(pair.records.map(record => Math.abs(record.deltaHome)));
      const heat = Math.round(clamp(meetings * 6 + resultCloseness * 25 + pressureMatches * 5 + finals * 9 + avgShift * 0.7, 0, 100));
      return { ...pair, meetings, stats, heat, pressureMatches, finals, avgShift, latest: pair.records.slice(-5).reverse() };
    }).sort((a, b) => b.heat - a.heat || b.meetings - a.meetings);
    return { rows, map: new Map(rows.map(row => [row.key, row])) };
  }

  function streaksFor(player) {
    let unbeaten = 0, longestUnbeaten = 0, wins = 0, longestWins = 0, recovery = 0;
    let previousLoss = false;
    player.fpi.ledger.forEach(item => {
      if (item.actual > 0) { unbeaten += 1; longestUnbeaten = Math.max(longestUnbeaten, unbeaten); } else unbeaten = 0;
      if (item.actual === 1) { wins += 1; longestWins = Math.max(longestWins, wins); } else wins = 0;
      if (previousLoss && item.actual === 1) recovery += 1;
      previousLoss = item.actual === 0;
    });
    return { longestUnbeaten, longestWins, recovery };
  }

  function archetypeFor(player) {
    const dna = Object.fromEntries((player.fpi.dna || []).map(item => [item.key, Number(item.value) || 50]));
    const volatility = 100 - (dna.consistency || 50);
    const candidates = [
      { key:"pressure-specialist", label:"PRESSURE SPECIALIST", score:(dna.pressure || 50) * 1.2 + (dna.efficiency || 50) * 0.35, copy:tr("Büyük maçlarda beklentinin üzerine çıkan oyuncu.", "Performs above expectation in high-pressure matches.") },
      { key:"underdog-hunter", label:"UNDERDOG HUNTER", score:(dna.opposition || 50) * 0.9 + (dna.efficiency || 50) * 0.8, copy:tr("Güçlü rakiplere karşı ekstra değer üreten sürpriz avcısı.", "Creates exceptional value against stronger opponents.") },
      { key:"dominant-controller", label:"DOMINANT CONTROLLER", score:(dna.dominance || 50) * 1.25 + (dna.consistency || 50) * 0.35, copy:tr("Skor ve oyun üstünlüğünü düzenli biçimde kuran oyuncu.", "Builds sustained score and match control.") },
      { key:"consistency-machine", label:"CONSISTENCY MACHINE", score:(dna.consistency || 50) * 1.35 + (dna.efficiency || 50) * 0.25, copy:tr("Düşük dalgalanmayla güvenilir sonuç üretir.", "Produces reliable results with low volatility.") },
      { key:"momentum-player", label:"MOMENTUM PLAYER", score:(dna.momentum || 50) * 1.25 + (dna.dominance || 50) * 0.25, copy:tr("Seri yakaladığında hızla yukarı hareket eder.", "Moves rapidly upward when a streak takes hold.") },
      { key:"volatile-threat", label:"VOLATILE THREAT", score:volatility * 1.25 + (dna.dominance || 50) * 0.35, copy:tr("Yüksek varyanslı, her sonucu üretebilen tehlikeli profil.", "A high-variance threat capable of producing any result.") },
      { key:"elite-gatekeeper", label:"ELITE GATEKEEPER", score:(player.rating >= 1550 ? 70 : 35) + (dna.consistency || 50) * 0.55, copy:tr("Üst sınıfa geçmek isteyenlerin aşması gereken eşik.", "The threshold challengers must cross to reach the elite.") }
    ].sort((a, b) => b.score - a.score);
    return { primary: candidates[0], secondary: candidates[1] };
  }

  function milestonesFor(player) {
    const items = [];
    const timeline = player.timeline || [];
    const thresholds = [1400, 1450, 1500, 1550, 1600, 1650, 1700, 1750, 1800];
    thresholds.forEach(threshold => {
      const hit = timeline.find(point => Number(point.rating) >= threshold);
      if (hit) items.push({ key:`rating-${threshold}`, title:`${threshold} RATING`, detail:hit.label || tr("Kariyer kilometre taşı", "Career milestone"), index:hit.index || 0 });
    });
    const firstWin = player.fpi.ledger.find(item => item.actual === 1);
    if (firstWin) items.push({ key:"first-win", title:tr("İLK RESMÎ GALİBİYET", "FIRST OFFICIAL WIN"), detail:`${firstWin.edition ? `FIFA ${firstWin.edition}` : "FIFA"} · vs ${firstWin.opponent}`, index:1 });
    if (player.peak > 1500) items.push({ key:"peak", title:tr("KARİYER ZİRVESİ", "CAREER PEAK"), detail:`${player.peak} Standing Rating`, index:9998 });
    if (player.games >= 10) items.push({ key:"10-matches", title:"10 MATCH CLUB", detail:`${player.games} ${tr("resmî maç", "official matches")}`, index:10 });
    if (player.games >= 25) items.push({ key:"25-matches", title:"25 MATCH VETERAN", detail:`${player.games} ${tr("resmî maç", "official matches")}`, index:25 });
    return items.sort((a, b) => a.index - b.index).slice(-12);
  }

  function rankingModes(base) {
    const editions = base.records.map(record => Number(record.match?.edition) || 0).filter(Boolean);
    const currentEdition = editions.length ? Math.max(10, ...editions) : 10;
    const official = base.players.map(player => ({ name: player.name, value: player.rating, extra: `${player.tier.label} · ${player.standing.index}/100` }));
    const season = base.players.map(player => {
      const ledger = base.records.filter(record => Number(record.match?.edition) === currentEdition && (record.home === player.name || record.away === player.name)).map(record => playerSide(record, player.name));
      const seasonBase = player.games ? 1500 : (Number(base.model?.newPlayerRating) || 1350);
      const value = Math.round(seasonBase + ledger.reduce((sum, item) => sum + item.change, 0));
      return { name: player.name, value, extra: `${ledger.length} MP · ${signed(value - 1500)}` };
    }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "tr"));
    const form = base.players.map(player => {
      const recent = player.fpi.ledger.slice(-10);
      const actual = avg(recent.map(item => item.actual));
      const expectedDelta = avg(recent.map(item => item.actual - item.expected));
      const shift = recent.reduce((sum, item) => sum + item.change, 0);
      const value = Math.round(1500 + shift + (actual - 0.5) * 55 + expectedDelta * 80);
      return { name: player.name, value, extra: `${recent.length} MP · ${Math.round(actual * 100)}% result` };
    }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "tr"));
    return { official, season, form, currentEdition };
  }

  function forecastFor(player, base) {
    const leader = base.players[0] || player;
    const third = base.players[2] || leader;
    const momentum = Number(player.last5Change) || 0;
    const no1 = clamp(logistic((player.rating - leader.rating) / 42 + momentum / 24 - Math.max(0, player.rank - 1) * 0.18), 0.01, player.rank === 1 ? 0.82 : 0.72);
    const top3 = clamp(logistic((player.rating - third.rating) / 34 + momentum / 28 + (4 - player.rank) * 0.18), 0.03, 0.96);
    const elite = clamp(logistic((player.rating - 1650) / 32 + momentum / 32), 0.02, 0.94);
    const peakGap = Math.max(0, player.peak - player.rating);
    const newPeak = clamp(logistic((20 - peakGap) / 18 + momentum / 26), 0.05, 0.93);
    const downside = clamp(logistic((-momentum - 8) / 20 + (100 - player.fpi.stabilityScore) / 45), 0.03, 0.85);
    return { no1, top3, elite, newPeak, downside };
  }

  function buildTitles(base, rivalries) {
    const streakRows = base.players.map(player => ({ player, streak: streaksFor(player) }));
    const giant = base.players.map(player => {
      const wins = player.fpi.ledger.filter(item => item.actual === 1 && item.expected < 0.40);
      return { player, count:wins.length, value:wins.reduce((sum, item) => sum + item.change, 0) };
    }).sort((a, b) => b.count - a.count || b.value - a.value)[0];
    const chaos = base.players.map(player => ({ player, score:deviation(player.fpi.ledger.map(item => item.change)) + player.fpi.ledger.filter(item => item.actual === 1 && item.expected < 0.4).length * 4 })).sort((a, b) => b.score - a.score)[0];
    const recovery = streakRows.sort((a, b) => b.streak.recovery - a.streak.recovery)[0];
    const hunter = base.players[1] || base.players[0];
    return [
      { key:"no1", title:"THE No.1", holder:base.players[0], metric:base.players[0] ? `${base.players[0].rating} Rating` : "–", icon:"♛" },
      { key:"hunter", title:"THE HUNTER", holder:hunter, metric:hunter ? `${hunter.standing.gapToLeader} pts to No.1` : "–", icon:"⌖" },
      { key:"giant", title:"GIANT KILLER", holder:giant?.player, metric:giant ? `${giant.count} upset wins` : "–", icon:"⚔" },
      { key:"pressure", title:"BIG MATCH PLAYER", holder:base.summary.pressureLeader, metric:base.summary.pressureLeader ? `${base.summary.pressureLeader.fpi.pressureScore}/100 pressure` : "–", icon:"◆" },
      { key:"climber", title:"THE CLIMBER", holder:base.summary.mover, metric:base.summary.mover ? `${signed(base.summary.mover.last5Change)} last 5` : "–", icon:"▲" },
      { key:"fortress", title:"THE FORTRESS", holder:[...base.players].sort((a, b) => b.fpi.stabilityScore - a.fpi.stabilityScore)[0], metric:[...base.players].sort((a, b) => b.fpi.stabilityScore - a.fpi.stabilityScore)[0] ? `${[...base.players].sort((a, b) => b.fpi.stabilityScore - a.fpi.stabilityScore)[0].fpi.stabilityScore}/100 consistency` : "–", icon:"⬡" },
      { key:"chaos", title:"CHAOS AGENT", holder:chaos?.player, metric:chaos ? `${chaos.score.toFixed(1)} volatility` : "–", icon:"✦" },
      { key:"untouchable", title:"THE UNTOUCHABLE", holder:[...streakRows].sort((a, b) => b.streak.longestUnbeaten - a.streak.longestUnbeaten)[0]?.player, metric:`${[...streakRows].sort((a, b) => b.streak.longestUnbeaten - a.streak.longestUnbeaten)[0]?.streak.longestUnbeaten || 0} unbeaten`, icon:"∞" },
      { key:"recovery", title:"COMEBACK KING", holder:recovery?.player, metric:`${recovery?.streak.recovery || 0} recovery wins`, icon:"↺" },
      { key:"rivalry", title:"HOTTEST RIVALRY", holder:null, metric:rivalries.rows[0] ? `${rivalries.rows[0].a} vs ${rivalries.rows[0].b} · ${rivalries.rows[0].heat}/100` : "–", icon:"☄" }
    ];
  }

  function buildMovement(base) {
    const latest = base.records.slice(-12).reverse().map(record => {
      const winner = record.winner;
      const delta = winner === record.home ? record.deltaHome : winner === record.away ? record.deltaAway : record.deltaHome;
      const loser = winner === record.home ? record.away : winner === record.away ? record.home : "";
      const kind = record.stageKey === "final" ? "FINAL IMPACT" : record.surprise ? "UPSET" : Math.abs(delta) >= 20 ? "MAJOR SHIFT" : "RATING MOVE";
      const text = winner ? `${winner}, ${loser} karşısında ${Math.abs(delta)} Standing Rating üretti.` : `${record.home} ve ${record.away} beraberlikle hiyerarşiyi dengeledi.`;
      return { kind, text, record, delta };
    });
    const currentLeader = base.summary.leader;
    if (currentLeader) latest.unshift({ kind:"CURRENT REIGN", text:`${currentLeader.name}, ${currentLeader.rating} Rating ile Player Standing lideri.`, record:null, delta:0 });
    return latest.slice(0, 12);
  }

  function buildIntegrity(base) {
    const checks = [];
    const ids = new Set();
    let duplicates = 0, zeroSumErrors = 0, chainErrors = 0, placeholder = 0, unknownStage = 0;
    const lastAfter = new Map();
    base.records.forEach(record => {
      if (ids.has(record.id)) duplicates += 1; else ids.add(record.id);
      if ((Number(record.deltaHome) || 0) + (Number(record.deltaAway) || 0) !== 0) zeroSumErrors += 1;
      for (const [name, before, after] of [[record.home, record.beforeHome, record.afterHome], [record.away, record.beforeAway, record.afterAway]]) {
        if (/^P\d+$/i.test(name) || !name.trim()) placeholder += 1;
        if (lastAfter.has(name) && Number(lastAfter.get(name)) !== Number(before)) chainErrors += 1;
        lastAfter.set(name, after);
      }
      if (!/standard|group|league|play|knock|quarter|semi|final|third|bronze|grup|lig|eleme|çeyrek|ceyrek|yarı|yari|üçün|ucun/i.test(String(record.match?.stage || "standard"))) unknownStage += 1;
    });
    const ratingTotal = base.players.reduce((sum, player) => sum + player.rating, 0);
    const expectedTotal = base.players.reduce((sum, player) => sum + (player.games ? 1500 : (Number(base.model?.newPlayerRating) || 1350)), 0);
    checks.push({ key:"zero-sum", label:tr("Sıfır toplam doğrulaması", "Zero-sum validation"), ok:zeroSumErrors === 0, value:zeroSumErrors ? `${zeroSumErrors} error` : "PASS" });
    checks.push({ key:"chain", label:tr("Rating zinciri sürekliliği", "Rating chain continuity"), ok:chainErrors === 0, value:chainErrors ? `${chainErrors} break` : "PASS" });
    checks.push({ key:"duplicates", label:tr("Mükerrer maç kimliği", "Duplicate match IDs"), ok:duplicates === 0, value:duplicates ? `${duplicates} duplicate` : "PASS" });
    checks.push({ key:"placeholders", label:tr("Geçersiz oyuncu adı", "Invalid player names"), ok:placeholder === 0, value:placeholder ? `${placeholder} record` : "PASS" });
    checks.push({ key:"stages", label:tr("Tanımlanamayan aşama", "Unmapped stages"), ok:unknownStage === 0, value:unknownStage ? `${unknownStage} stage` : "PASS" });
    checks.push({ key:"conservation", label:tr("Toplam Rating korunumu", "Total Rating conservation"), ok:ratingTotal === expectedTotal, value:`${ratingTotal}/${expectedTotal}` });
    const score = Math.round(checks.filter(check => check.ok).length / checks.length * 100);
    return { checks, score, records:base.records.length, players:base.players.length, ratingTotal, expectedTotal };
  }

  function tierForRating(rating) {
    if (rating >= 1750) return { key:"icon", label:"ICON" };
    if (rating >= 1650) return { key:"elite", label:"ELITE" };
    if (rating >= 1550) return { key:"contender", label:"TITLE CONTENDER" };
    if (rating >= 1450) return { key:"challenger", label:"CHALLENGER" };
    if (rating >= 1350) return { key:"rising", label:"RISING" };
    return { key:"outsider", label:"OUTSIDER" };
  }

  function augmentWithRegisteredPlayers(base) {
    const state = context()?.getState?.();
    const registered = (state?.current?.participants || []).map(player => String(player?.name || "").trim()).filter(Boolean);
    const existing = new Set(base.players.map(player => norm(player.name)));
    const newcomers = registered.filter(name => !existing.has(norm(name))).map(name => {
      const rating = Number(base.model?.newPlayerRating) || 1350;
      const tier = tierForRating(rating);
      const dna = ["efficiency","opposition","dominance","pressure","consistency","momentum"].map(key => ({ key, label:key, value:50 }));
      return {
        name, rating, peak:rating, floor:rating, games:0, wins:0, draws:0, losses:0, lastChange:0, last5Change:0, winRate:0, tier, previousRank:0, rankMovement:0,
        timeline:[{ index:0, rating, label:tr("Provisional giriş", "Provisional entry") }],
        fpi:{ score:35, confidence:20, confidenceBand:"PROVISIONAL", scheduleRating:1500, expectationDelta:0, pressureGames:0, pressureScore:50, formScore:50, teamIndependenceScore:50, stabilityScore:50, dominanceScore:50, momentumScore:50, components:[], dna, strongest:{label:"PROVISIONAL",value:50}, development:{label:"EVIDENCE",value:50}, recentLedger:[], ledger:[], biggestWin:null, biggestLoss:null, form:"", signal:"PROVISIONAL" },
        standing:{ rating, index:35, class:tier, latestShift:0, momentumShift:0, form:"", confidence:20, confidenceBand:"PROVISIONAL", dna, timeline:[{ index:0, rating, label:tr("Provisional giriş", "Provisional entry") }], provisional:true, rankMovement:0, signal:"PROVISIONAL" }
      };
    });
    if (!newcomers.length) return base;
    let players = [...base.players, ...newcomers].sort((a,b)=>b.rating-a.rating||b.peak-a.peak||a.name.localeCompare(b.name,"tr"));
    const leader = players[0] || null;
    players = players.map((player,index)=>{
      const next = index > 0 ? players[index-1] : null;
      const rank = index+1;
      const gapToLeader = leader ? leader.rating-player.rating : 0;
      const gapToNext = next ? next.rating-player.rating : 0;
      const pointsToPass = next ? gapToNext+1 : 0;
      return { ...player, rank, standing:{ ...player.standing, rank, gapToLeader, gapToNext, pointsToPass, nextTarget:next?{name:next.name,rating:next.rating,gap:gapToNext,pointsToPass}:null, targetText:next?tr(`${next.name} oyuncusunu geçmek için ${pointsToPass} Rating gerekiyor.`,`${pointsToPass} Rating points are required to pass ${next.name}.`):tr("Player Standing liderliğini koruyor.","Holds the Player Standing lead."), why:player.games?player.standing.why:tr(`${player.name}, 1350 provisional Rating ile veri kalibrasyonunu bekliyor.`,`${player.name} is awaiting evidence calibration with a 1350 provisional Rating.`) } };
    });
    return { ...base, players, playerMap:new Map(players.map(player=>[player.name,player])), summary:{ ...base.summary, leader:players[0]||null, mover:[...players].sort((a,b)=>b.last5Change-a.last5Change)[0]||null } };
  }

  function buildUniverse() {
    const rawBase = baseAnalytics();
    if (!rawBase) return null;
    const base = augmentWithRegisteredPlayers(rawBase);
    const rivalries = buildRivalries(base);
    const reigns = buildReigns(base);
    const modes = rankingModes(base);
    const players = base.players.map(player => ({
      ...player,
      archetype:archetypeFor(player),
      milestones:milestonesFor(player),
      streaks:streaksFor(player),
      forecast:forecastFor(player, base),
      reign:reigns.byPlayer.get(player.name) || { total:0, longest:0, entries:0, current:0 }
    }));
    const playerMap = new Map(players.map(player => [player.name, player]));
    const extendedBase = { ...base, players, playerMap };
    const titles = buildTitles(extendedBase, rivalries);
    const movement = buildMovement(extendedBase);
    const integrity = buildIntegrity(extendedBase);
    return { ...extendedBase, rivalries, reigns, modes, titles, movement, integrity };
  }

  function className(value) { return Number(value) > 0 ? "positive" : Number(value) < 0 ? "negative" : "steady"; }
  function initials(name) { return String(name || "").split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join("").toUpperCase(); }
  function formStrip(player) {
    const form = String(player?.fpi?.form || "").slice(-5);
    return `<span class="psu-form">${[...form].map(letter => `<i class="${letter === "W" ? "win" : letter === "D" ? "draw" : "loss"}">${letter}</i>`).join("") || "–"}</span>`;
  }

  function playerSelect(data, value, id, extra = "") {
    return `<select id="${id}" ${extra}>${data.players.map(player => `<option value="${esc(player.name)}" ${player.name === value ? "selected" : ""}>#${player.rank} · ${esc(player.name)} · ${player.rating}</option>`).join("")}</select>`;
  }

  function miniRanking(title, rows, note) {
    return `<article class="psu-ranking-card"><header><span>${esc(title)}</span><small>${esc(note)}</small></header><div>${rows.slice(0, 8).map((row, index) => `<div><b>${index + 1}</b><strong>${esc(row.name)}</strong><span>${row.value}</span><small>${esc(row.extra || "")}</small></div>`).join("")}</div></article>`;
  }

  function titleCards(data) {
    return `<div class="psu-title-grid">${data.titles.map(title => `<article class="psu-title-card"><span>${title.icon}</span><div><small>${esc(title.title)}</small><strong>${esc(title.holder?.name || title.metric.split(" · ")[0] || "–")}</strong><p>${esc(title.holder ? title.metric : title.metric)}</p></div></article>`).join("")}</div>`;
  }

  function overviewTab(data, selected) {
    const leader = data.players[0];
    const hotRivalry = data.rivalries.rows[0];
    return `<div class="psu-tab-page">
      <section class="psu-command-grid">
        <article class="psu-command-card crown"><span>WORLD No.1</span><strong>${esc(leader?.name || "–")}</strong><b>${leader?.rating || 1500}</b><small>${leader?.reign.current || 0} ${tr("maçlık aktif saltanat", "match active reign")}</small></article>
        <article class="psu-command-card"><span>TOP MOVER</span><strong>${esc(data.summary.mover?.name || "–")}</strong><b class="${className(data.summary.mover?.last5Change)}">${signed(data.summary.mover?.last5Change)}</b><small>${tr("son 5 maç", "last 5 matches")}</small></article>
        <article class="psu-command-card"><span>HOTTEST RIVALRY</span><strong>${hotRivalry ? `${esc(hotRivalry.a)} vs ${esc(hotRivalry.b)}` : "–"}</strong><b>${hotRivalry?.heat || 0}/100</b><small>${hotRivalry?.meetings || 0} ${tr("karşılaşma", "meetings")}</small></article>
        <article class="psu-command-card"><span>INTEGRITY SCORE</span><strong>${data.integrity.score >= 100 ? "VERIFIED" : "REVIEW"}</strong><b>${data.integrity.score}/100</b><small>${data.integrity.records} ${tr("işlenmiş maç", "processed matches")}</small></article>
      </section>
      <section class="psu-selected-identity">
        <div class="psu-player-mark">${esc(initials(selected.name))}</div>
        <div class="psu-selected-copy"><span>STANDING UNIVERSE IDENTITY · WORLD #${selected.rank}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.archetype.primary.label)} · ${esc(selected.tier.label)} · ${selected.fpi.confidence}% confidence</p></div>
        <div class="psu-selected-numbers"><article><span>RATING</span><strong>${selected.rating}</strong><small>Peak ${selected.peak}</small></article><article><span>INDEX</span><strong>${selected.standing.index}</strong><small>/100</small></article><article><span>SHIFT</span><strong class="${className(selected.last5Change)}">${signed(selected.last5Change)}</strong><small>Last 5</small></article><article><span>REIGN</span><strong>${selected.reign.total}</strong><small>Total lead matches</small></article></div>
      </section>
      <section class="psu-section"><header><div><span>THREE LENSES</span><h3>${tr("Üç farklı gerçeklik", "Three competitive realities")}</h3></div><p>${tr("Official kariyer gücünü, Season aktif edisyonu, Form ise son 10 maçı gösterir.", "Official shows career strength, Season the active edition, and Form the latest ten matches.")}</p></header><div class="psu-ranking-grid">${miniRanking("OFFICIAL STANDING", data.modes.official, "Career Rating")}${miniRanking(`SEASON STANDING · FIFA ${data.modes.currentEdition}`, data.modes.season, "Current edition")}${miniRanking("ACTIVE FORM STANDING", data.modes.form, "Last 10 matches")}</div></section>
      <section class="psu-section"><header><div><span>LIVE TITLES</span><h3>${tr("Performansla el değiştiren unvanlar", "Performance-driven live titles")}</h3></div><p>${tr("Bu unvanlar kupa değildir; her resmî sonuçtan sonra yeniden hesaplanır.", "These are not trophies; they are recalculated after every official result.")}</p></header>${titleCards(data)}</section>
      <section class="psu-section psu-forecast-section"><header><div><span>STANDING FORECAST</span><h3>${esc(selected.name)}</h3></div><p>${tr("Güncel Rating, momentum, lider farkı ve oynaklığa dayalı olasılık görünümü.", "Probability outlook based on current Rating, momentum, leader gap and volatility.")}</p></header><div class="psu-forecast-grid">${[["Top 3",selected.forecast.top3],["Become No.1",selected.forecast.no1],["Reach Elite",selected.forecast.elite],["New Career Peak",selected.forecast.newPeak],["Downside Risk",selected.forecast.downside]].map(([label,value])=>`<article><span>${label}</span><strong>${pct(value)}</strong><i><em style="width:${clamp(value,0,1)*100}%"></em></i></article>`).join("")}</div><small class="psu-model-note">${tr("Tahminler kesin sonuç değildir; mevcut veri koşullarının olasılık yorumudur.", "Forecasts are not certainties; they are probability interpretations of current evidence.")}</small></section>
    </div>`;
  }

  function roadToNo1(data, selected) {
    const path = data.players.slice(0, selected.rank).reverse();
    return `<div class="psu-road">${path.map(player => `<article class="${player.name === selected.name ? "current" : player.rank === 1 ? "leader" : ""}"><span>#${player.rank}</span><div><strong>${esc(player.name)}</strong><small>${esc(player.tier.label)}</small></div><b>${player.rating}</b><em>${player.name === selected.name ? "YOU" : selected.rating < player.rating ? `-${player.rating-selected.rating}` : "TARGET"}</em></article>`).join("")}</div>`;
  }

  function raceTab(data, selected) {
    const recentReigns = data.reigns.segments.slice(-10).reverse();
    return `<div class="psu-tab-page">
      <section class="psu-section"><header><div><span>ROAD TO No.1</span><h3>${esc(selected.name)}</h3></div><p>${selected.standing.nextTarget ? tr(`${selected.standing.nextTarget.name} için ${selected.standing.pointsToPass} Rating gerekiyor.`, `${selected.standing.pointsToPass} Rating points are required to pass ${selected.standing.nextTarget.name}.`) : tr("Liderlik savunması aktif.", "The title defence is active.")}</p></header>${roadToNo1(data, selected)}<div class="psu-race-insights"><article><span>${tr("Sıradaki hedef", "Next target")}</span><strong>${selected.standing.nextTarget ? `#${selected.rank-1} ${esc(selected.standing.nextTarget.name)}` : "DEFEND No.1"}</strong><small>${selected.standing.nextTarget ? `${selected.standing.pointsToPass} pts` : `${selected.reign.current} match reign`}</small></article><article><span>${tr("Tahmini galibiyet yolu", "Estimated win path")}</span><strong>${selected.rank === 1 ? "0" : Math.max(1, Math.ceil(selected.standing.gapToLeader / Math.max(10, 14 + selected.last5Change / 5)))}</strong><small>${tr("ortalama değerli galibiyet", "average valuable wins")}</small></article><article><span>${tr("En riskli kayıp", "Risk exposure")}</span><strong>${Math.round(10 + (100-selected.fpi.stabilityScore)*0.22)}</strong><small>${tr("yaklaşık Rating", "approx. Rating")}</small></article></div></section>
      <section class="psu-section"><header><div><span>STANDING REIGN</span><h3>${tr("Liderlik saltanatları", "Leadership reigns")}</h3></div><p>${tr("Birinci olmak ve birinci kalmak ayrı ölçülür.", "Reaching No.1 and staying there are measured separately.")}</p></header><div class="psu-reign-grid">${data.reigns.leaders.slice(0,8).map((row,index)=>`<article><span>#${index+1}</span><strong>${esc(row.name)}</strong><b>${row.total}</b><small>${tr("toplam liderlik maçı", "total lead matches")}</small><div><em>${row.longest} longest</em><em>${row.entries} reigns</em><em>${row.current ? `${row.current} active` : "inactive"}</em></div></article>`).join("")}</div><div class="psu-reign-timeline">${recentReigns.map(row=>`<article class="${data.reigns.current===row?"active":""}"><span>${esc(row.name)}</span><strong>${row.matches}</strong><small>${tr("maç", "matches")} · ${row.endRating}</small></article>`).join("")}</div></section>
      <section class="psu-section"><header><div><span>THE MOVEMENT</span><h3>Every match leaves a mark.</h3></div><p>${tr("Sıralama hareketlerinin canlı hikâye akışı.", "A live narrative feed of ranking movements.")}</p></header><div class="psu-movement-feed">${data.movement.map(item=>`<article><span>${esc(item.kind)}</span><p>${esc(item.text)}</p><b class="${className(item.delta)}">${item.delta ? signed(item.delta) : "◆"}</b></article>`).join("")}</div></section>
    </div>`;
  }

  function stageMeta(key) {
    return {
      standard:{ label:tr("Standart Maç", "Standard Match"), multiplier:1 },
      knockout:{ label:tr("Play-in / Eleme", "Play-in / Knockout"), multiplier:1.10 },
      quarter:{ label:tr("Çeyrek Final", "Quarter-final"), multiplier:1.15 },
      semi:{ label:tr("Yarı Final", "Semi-final"), multiplier:1.25 },
      third:{ label:tr("Üçüncülük", "Third-place"), multiplier:1.05 },
      final:{ label:tr("Final", "Final"), multiplier:1.35 }
    }[key] || { label:key, multiplier:1 };
  }

  function kFactor(games) { return games < 6 ? 36 : games < 13 ? 30 : games < 30 ? 24 : 20; }
  function marginFactor(margin) { return margin <= 1 ? 1 : margin === 2 ? 1.08 : margin === 3 ? 1.15 : margin === 4 ? 1.21 : 1.28; }
  function impactScenario(home, away, outcome, margin, stageKey) {
    const expectedHome = 1 / (1 + 10 ** ((away.rating - home.rating) / 400));
    const actualHome = outcome === "home" ? 1 : outcome === "away" ? 0 : 0.5;
    const K = Math.round((kFactor(home.games) + kFactor(away.games)) / 2);
    const stage = stageMeta(stageKey);
    const marginMultiplier = marginFactor(Number(margin) || 1);
    const raw = K * stage.multiplier * marginMultiplier * (actualHome - expectedHome);
    const delta = Math.max(-48, Math.min(48, Math.round(raw)));
    return { expectedHome, actualHome, K, stage, marginMultiplier, delta, homeAfter:home.rating+delta, awayAfter:away.rating-delta };
  }

  function participantName(id) {
    const state = context()?.getState?.();
    const participants = state?.current?.participants || [];
    return participants.find(player => String(player.id) === String(id))?.name || "";
  }

  function matchPlayerName(match, side) {
    const cap = side === "home" ? "Home" : "Away";
    return String(match?.[`${side}Name`] || match?.[side] || participantName(match?.[`${side}Id`]) || match?.[`player${cap}Name`] || "").trim();
  }

  function upcomingCards(data) {
    const names = new Set(data.players.map(player => player.name));
    return currentMatches().filter(match => {
      const home = matchPlayerName(match, "home");
      const away = matchPlayerName(match, "away");
      const homeScoreSet = match.homeScore !== null && match.homeScore !== undefined && match.homeScore !== "";
      const awayScoreSet = match.awayScore !== null && match.awayScore !== undefined && match.awayScore !== "";
      return names.has(home) && names.has(away) && !(homeScoreSet && awayScoreSet);
    }).slice(0,6).map(match => {
      const homeName = matchPlayerName(match, "home");
      const awayName = matchPlayerName(match, "away");
      return { match, home:data.playerMap.get(homeName), away:data.playerMap.get(awayName) };
    }).filter(row => row.home && row.away);
  }

  function postMatchCards(data) {
    return data.records.slice(-6).reverse().map(record => {
      const home = data.playerMap.get(record.home), away = data.playerMap.get(record.away);
      return { record, home, away };
    });
  }

  function impactTab(data) {
    const home = data.playerMap.get(ui.impactA) || data.players[0];
    const away = data.playerMap.get(ui.impactB) || data.players.find(player => player.name !== home?.name) || data.players[1];
    ui.impactA = home?.name || ""; ui.impactB = away?.name || "";
    const scenario = home && away ? impactScenario(home, away, ui.impactOutcome, ui.impactMargin, ui.impactStage) : null;
    const upcomings = upcomingCards(data);
    const recent = postMatchCards(data);
    return `<div class="psu-tab-page">
      <section class="psu-impact-lab"><header><div><span>STANDING IMPACT LAB</span><h3>${tr("Maç oynanmadan hiyerarşiyi test et", "Test the hierarchy before the match")}</h3><p>${tr("Rakip gücü, deneyim, aşama ve skor farkına göre olası Rating hareketi.", "Projected Rating movement based on opponent strength, experience, stage and score margin.")}</p></div><b>LIVE CALCULATOR</b></header><div class="psu-impact-controls"><label><span>PLAYER A</span>${playerSelect(data, ui.impactA, "psuImpactA")}</label><label><span>PLAYER B</span>${playerSelect(data, ui.impactB, "psuImpactB")}</label><label><span>STAGE</span><select id="psuImpactStage">${["standard","knockout","quarter","semi","third","final"].map(key=>`<option value="${key}" ${ui.impactStage===key?"selected":""}>${esc(stageMeta(key).label)} · ×${stageMeta(key).multiplier.toFixed(2)}</option>`).join("")}</select></label><label><span>MARGIN</span><select id="psuImpactMargin">${[1,2,3,4,5].map(value=>`<option value="${value}" ${ui.impactMargin===value?"selected":""}>${value}${value===5?"+":""} goal · ×${marginFactor(value).toFixed(2)}</option>`).join("")}</select></label></div><div class="psu-outcome-buttons">${[["home",`${esc(home?.name)} wins`],["draw","Draw"],["away",`${esc(away?.name)} wins`]].map(([key,label])=>`<button class="${ui.impactOutcome===key?"active":""}" data-psu-outcome="${key}">${label}</button>`).join("")}</div>${scenario?`<div class="psu-impact-result"><article><span>${esc(home.name)}</span><strong>${home.rating} <em>→</em> ${scenario.homeAfter}</strong><b class="${className(scenario.delta)}">${signed(scenario.delta)}</b><small>${Math.round(scenario.expectedHome*100)}% pre-match expectation</small></article><div><span>ZERO-SUM</span><strong>${scenario.K}</strong><small>K · ×${scenario.stage.multiplier.toFixed(2)} stage · ×${scenario.marginMultiplier.toFixed(2)} margin</small></div><article><span>${esc(away.name)}</span><strong>${away.rating} <em>→</em> ${scenario.awayAfter}</strong><b class="${className(-scenario.delta)}">${signed(-scenario.delta)}</b><small>${Math.round((1-scenario.expectedHome)*100)}% pre-match expectation</small></article></div>`:""}</section>
      <section class="psu-section"><header><div><span>MATCHDAY STANDING CARDS</span><h3>${tr("Sıradaki maçta ne tehlikede?", "What is at stake in the next match?")}</h3></div><p>${tr("Yaklaşan fikstürler için otomatik Standing etkisi.", "Automatic Standing impact for upcoming fixtures.")}</p></header>${upcomings.length?`<div class="psu-matchday-grid">${upcomings.map(row=>{const sim=impactScenario(row.home,row.away,"home",1,"standard");return `<article><span>${esc(row.match.stage||"MATCHDAY")}</span><div><strong>#${row.home.rank} ${esc(row.home.name)}</strong><b>VS</b><strong>#${row.away.rank} ${esc(row.away.name)}</strong></div><p>${esc(row.home.name)} win: ${signed(sim.delta)} · ${esc(row.away.name)} win: ${signed(impactScenario(row.home,row.away,"away",1,"standard").delta*-1)}</p><small>${row.home.standing.gapToNext?`${row.home.standing.pointsToPass} pts to next rank`:"Leader defence"}</small></article>`}).join("")}</div>`:`<div class="psu-empty">${tr("Oynanmamış fikstür bulunamadı. Impact Lab manuel senaryolar için aktif.", "No upcoming fixture found. Impact Lab remains active for manual scenarios.")}</div>`}</section>
      <section class="psu-section"><header><div><span>POST-MATCH STANDING REPORT</span><h3>${tr("Sonuçların kalıcı etkisi", "The permanent impact of results")}</h3></div><p>${tr("En yeni resmî maçların Rating ve kariyer etkisi.", "Rating and career impact of the latest official matches.")}</p></header><div class="psu-postmatch-grid">${recent.map(({record,home,away})=>`<article><header><span>${esc(record.stageLabel)}</span><b>${record.match?.homeScore ?? 0}-${record.match?.awayScore ?? 0}</b></header><h4>${esc(record.home)} vs ${esc(record.away)}</h4><div><strong class="${className(record.deltaHome)}">${esc(record.home)} ${signed(record.deltaHome)}</strong><strong class="${className(record.deltaAway)}">${esc(record.away)} ${signed(record.deltaAway)}</strong></div><p>${record.surprise?"UPSET VICTORY · ":""}${record.stageMultiplier>1?"PRESSURE WEIGHT · ":""}×${record.marginMultiplier.toFixed(2)} score impact</p><small>${home?.peak===record.afterHome||away?.peak===record.afterAway?tr("Kariyer zirvesi etkisi tespit edildi.","Career-peak impact detected."):tr("Standing zincirine işlendi.","Recorded in the Standing chain.")}</small></article>`).join("")}</div></section>
    </div>`;
  }

  function rivalryTab(data) {
    let a = data.playerMap.get(ui.rivalA) || data.players[0];
    let b = data.playerMap.get(ui.rivalB) || data.players.find(player => player.name !== a?.name) || data.players[1];
    if (a?.name === b?.name) b = data.players.find(player => player.name !== a.name);
    ui.rivalA = a?.name || ""; ui.rivalB = b?.name || "";
    const rivalry = data.rivalries.map.get(pairKey(a?.name,b?.name));
    const aStats = rivalry?.stats?.[a?.name] || { wins:0,draws:0,losses:0,ratingNet:0,goalsFor:0,goalsAgainst:0,pressureWins:0,upsets:0 };
    const bStats = rivalry?.stats?.[b?.name] || { wins:0,draws:0,losses:0,ratingNet:0,goalsFor:0,goalsAgainst:0,pressureWins:0,upsets:0 };
    const profileFor = player => {
      const all = data.rivalries.rows.filter(row => row.a===player.name || row.b===player.name).map(row => {
        const other = row.a===player.name?row.b:row.a;
        const stats = row.stats[player.name];
        return { other,row,stats };
      });
      const nemesis = [...all].sort((x,y)=>x.stats.ratingNet-y.stats.ratingNet)[0];
      const favourite = [...all].sort((x,y)=>y.stats.ratingNet-x.stats.ratingNet)[0];
      const blocker = [...all].sort((x,y)=>y.row.heat-x.row.heat||x.stats.ratingNet-y.stats.ratingNet)[0];
      return { nemesis,favourite,blocker };
    };
    const aProfile = profileFor(a), bProfile = profileFor(b);
    return `<div class="psu-tab-page"><section class="psu-rivalry-hero"><div><span>RIVALRY INTELLIGENCE</span><h3>${tr("Rekabet artık yalnızca H2H değil", "Rivalry is more than H2H")}</h3><p>${tr("Rating transferi, baskı maçları, sürprizler ve tarihsel denge tek Rivalry Heat değerinde birleşir.", "Rating transfer, pressure matches, upsets and historical balance combine into one Rivalry Heat value.")}</p></div><div><label>${playerSelect(data,ui.rivalA,"psuRivalA")}</label><b>VS</b><label>${playerSelect(data,ui.rivalB,"psuRivalB")}</label></div></section>${rivalry?`<section class="psu-rivalry-score"><article><span>${esc(a.name)}</span><strong>${aStats.wins}</strong><small>${aStats.goalsFor} goals · ${signed(aStats.ratingNet)} Rating</small></article><div><span>RIVALRY HEAT</span><strong>${rivalry.heat}</strong><small>${rivalry.meetings} matches · ${rivalry.pressureMatches} pressure</small></div><article><span>${esc(b.name)}</span><strong>${bStats.wins}</strong><small>${bStats.goalsFor} goals · ${signed(bStats.ratingNet)} Rating</small></article></section><section class="psu-rivalry-metrics"><article><span>DRAWS</span><strong>${aStats.draws}</strong></article><article><span>AVG SHIFT</span><strong>${rivalry.avgShift.toFixed(1)}</strong></article><article><span>FINALS</span><strong>${rivalry.finals}</strong></article><article><span>UPSETS</span><strong>${aStats.upsets+bStats.upsets}</strong></article><article><span>PRESSURE WINS</span><strong>${aStats.pressureWins}-${bStats.pressureWins}</strong></article></section><div class="psu-rivalry-grid"><section><header><span>${esc(a.name)} PROFILE</span></header><article><span>NEMESIS</span><strong>${esc(aProfile.nemesis?.other||"–")}</strong><small>${signed(aProfile.nemesis?.stats.ratingNet||0)} Rating</small></article><article><span>FAVOURITE OPPONENT</span><strong>${esc(aProfile.favourite?.other||"–")}</strong><small>${signed(aProfile.favourite?.stats.ratingNet||0)} Rating</small></article><article><span>RANKING BLOCKER</span><strong>${esc(aProfile.blocker?.other||"–")}</strong><small>${aProfile.blocker?.row.heat||0}/100 heat</small></article></section><section><header><span>${esc(b.name)} PROFILE</span></header><article><span>NEMESIS</span><strong>${esc(bProfile.nemesis?.other||"–")}</strong><small>${signed(bProfile.nemesis?.stats.ratingNet||0)} Rating</small></article><article><span>FAVOURITE OPPONENT</span><strong>${esc(bProfile.favourite?.other||"–")}</strong><small>${signed(bProfile.favourite?.stats.ratingNet||0)} Rating</small></article><article><span>RANKING BLOCKER</span><strong>${esc(bProfile.blocker?.other||"–")}</strong><small>${bProfile.blocker?.row.heat||0}/100 heat</small></article></section></div><section class="psu-section"><header><div><span>RIVALRY TIMELINE</span><h3>${esc(a.name)} vs ${esc(b.name)}</h3></div></header><div class="psu-rivalry-timeline">${rivalry.latest.map(record=>{const side=playerSide(record,a.name);return `<article><span>${esc(side.editionLabel)} · ${esc(record.stageLabel)}</span><strong>${esc(a.name)} ${esc(side.score)} ${esc(b.name)}</strong><b class="${className(side.change)}">${signed(side.change)}</b><small>${Math.round(side.expected*100)}% expectation</small></article>`}).join("")}</div></section>`:`<div class="psu-empty">${tr("Bu iki oyuncu arasında resmî karşılaşma bulunmuyor.", "No official meeting exists between these players.")}</div>`}</div>`;
  }

  function legacyTab(data, selected) {
    return `<div class="psu-tab-page"><section class="psu-legacy-identity"><div class="psu-player-mark large">${esc(initials(selected.name))}</div><div><span>PLAYER ARCHETYPE ENGINE</span><h3>${esc(selected.archetype.primary.label)}</h3><p>${esc(selected.archetype.primary.copy)}</p><small>SECONDARY · ${esc(selected.archetype.secondary.label)}</small></div><aside><article><span>LONGEST UNBEATEN</span><strong>${selected.streaks.longestUnbeaten}</strong></article><article><span>WIN STREAK</span><strong>${selected.streaks.longestWins}</strong></article><article><span>RECOVERY WINS</span><strong>${selected.streaks.recovery}</strong></article></aside></section><section class="psu-section"><header><div><span>STANDING MILESTONES</span><h3>${tr("Kariyer yol haritası", "Career path")}</h3></div><p>${tr("Rating eşikleri, ilkler ve kalıcı kariyer anları.", "Rating thresholds, firsts and permanent career moments.")}</p></header><div class="psu-milestone-track">${selected.milestones.map((item,index)=>`<article><span>${String(index+1).padStart(2,"0")}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></div></article>`).join("")||`<div class="psu-empty">${tr("Kilometre taşı için daha fazla resmî maç gerekiyor.","More official matches are required for milestones.")}</div>`}</div></section><section class="psu-section"><header><div><span>HISTORICAL No.1</span><h3>${tr("Liderliğin el değiştirme tarihi", "History of leadership changes")}</h3></div></header><div class="psu-leadership-history">${data.reigns.segments.slice().reverse().map((segment,index)=>`<article class="${index===0?"active":""}"><span>${index===0?"CURRENT":"REIGN"}</span><strong>${esc(segment.name)}</strong><b>${segment.matches} matches</b><small>${segment.startRating} → ${segment.endRating}${segment.tookFrom?` · took from ${esc(segment.tookFrom)}`:""}</small></article>`).join("")}</div></section><section class="psu-section"><header><div><span>LEGACY COMPARISON</span><h3>Official · Season · Form</h3></div></header><div class="psu-ranking-grid">${miniRanking("OFFICIAL",data.modes.official,"Career")}${miniRanking(`FIFA ${data.modes.currentEdition}`,data.modes.season,"Season")}${miniRanking("FORM",data.modes.form,"Last 10")}</div></section></div>`;
  }

  function integrityTab(data) {
    return `<div class="psu-tab-page"><section class="psu-integrity-hero"><div><span>STANDING INTEGRITY CENTRE</span><h3>${data.integrity.score === 100 ? "VERIFIED CHAIN" : "REVIEW REQUIRED"}</h3><p>${tr("Rating motoru, veri zinciri ve sıfır toplam sözleşmesinin denetim merkezi.", "Audit centre for the Rating engine, data chain and zero-sum contract.")}</p></div><strong>${data.integrity.score}<small>/100</small></strong></section><section class="psu-integrity-grid">${data.integrity.checks.map(check=>`<article class="${check.ok?"pass":"fail"}"><span>${check.ok?"✓":"!"}</span><div><strong>${esc(check.label)}</strong><small>${esc(check.value)}</small></div></article>`).join("")}</section><section class="psu-section"><header><div><span>MODEL CONTRACT</span><h3>Standing Intelligence Engine ${esc(data.model.version)}</h3></div><button type="button" data-psu-export="integrity">EXPORT AUDIT JSON</button></header><div class="psu-contract-grid"><article><span>STARTING RATING</span><strong>${data.model.startingRating}</strong></article><article><span>NEW PLAYER</span><strong>${data.model.newPlayerRating}</strong></article><article><span>MAX MATCH SHIFT</span><strong>±${data.model.maxMatchShift}</strong></article><article><span>ZERO-SUM</span><strong>${data.model.zeroSum?"TRUE":"FALSE"}</strong></article><article><span>PLAYERS</span><strong>${data.integrity.players}</strong></article><article><span>RECORDS</span><strong>${data.integrity.records}</strong></article></div><div class="psu-weight-table">${Object.entries(data.model.weights||{}).map(([key,value])=>`<div><span>${esc(key)}</span><b>${value}%</b><i><em style="width:${value}%"></em></i></div>`).join("")}</div></section><section class="psu-section"><header><div><span>RATING REPLAY</span><h3>${tr("Son işlemlerin denetlenebilir zinciri", "Auditable chain of latest operations")}</h3></div></header><div class="psu-replay">${data.records.slice(-15).reverse().map((record,index)=>`<article><span>${String(data.records.length-index).padStart(3,"0")}</span><strong>${esc(record.home)} ${record.match?.homeScore ?? 0}-${record.match?.awayScore ?? 0} ${esc(record.away)}</strong><b>${record.beforeHome}→${record.afterHome}</b><b>${record.beforeAway}→${record.afterAway}</b><small>${esc(record.stageLabel)} · K${record.kFactor} · ×${record.marginMultiplier.toFixed(2)}</small></article>`).join("")}</div></section></div>`;
  }

  function renderUniverse(data) {
    if (!data?.players?.length) return `<div class="psu-empty">Standing data unavailable.</div>`;
    if (!data.playerMap.has(ui.player)) ui.player = data.players[0].name;
    const selected = data.playerMap.get(ui.player) || data.players[0];
    if (!ui.rivalA) ui.rivalA = selected.name;
    if (!ui.rivalB || ui.rivalB === ui.rivalA) ui.rivalB = data.players.find(player => player.name !== ui.rivalA)?.name || "";
    if (!ui.impactA) ui.impactA = selected.name;
    if (!ui.impactB || ui.impactB === ui.impactA) ui.impactB = data.players.find(player => player.name !== ui.impactA)?.name || "";
    const tabs = [
      ["overview","UNIVERSE","⌂"], ["race","STANDING RACE","▲"], ["impact","IMPACT LAB","◈"],
      ["rivalry","RIVALRY","∞"], ["legacy","LEGACY","♛"], ["integrity","INTEGRITY","✓"]
    ];
    const pages = { overview:overviewTab, race:raceTab, impact:impactTab, rivalry:rivalryTab, legacy:legacyTab, integrity:integrityTab };
    const content = pages[ui.tab] ? pages[ui.tab](data, selected) : overviewTab(data, selected);
    return `<section id="${MODULE_ID}" class="psu-shell"><header class="psu-shell-head"><div><span>FIFA UNIVERSE V${VERSION}</span><h2>PLAYER STANDING UNIVERSE</h2><p>${tr("Sıralama, yarış, rekabet, tahmin, miras ve veri güvenilirliği tek yaşayan sistemde.", "Ranking, race, rivalry, forecast, legacy and data integrity in one living system.")}</p></div><label><span>ACTIVE PLAYER</span>${playerSelect(data,selected.name,"psuPlayer")}</label></header><nav class="psu-tabs">${tabs.map(([key,label,icon])=>`<button class="${ui.tab===key?"active":""}" data-psu-tab="${key}"><span>${icon}</span><strong>${label}</strong></button>`).join("")}</nav>${content}<footer class="psu-footer"><span>STANDING UNIVERSE ENGINE · V${VERSION}</span><small>Official Rating remains zero-sum. Forecast and Index layers are explanatory models.</small></footer></section>`;
  }

  function renderHomePulse(data) {
    const leader = data.players[0];
    const mover = data.summary.mover;
    const rivalry = data.rivalries.rows[0];
    return `<section id="psuHomePulse" class="psu-home-pulse"><div><span><i></i> STANDING UNIVERSE LIVE</span><strong>#1 ${esc(leader?.name||"–")} · ${leader?.rating||1500}</strong></div><div class="psu-home-pulse-track"><p><b>TOP MOVER</b> ${esc(mover?.name||"–")} ${signed(mover?.last5Change)} <i>◆</i> <b>ACTIVE REIGN</b> ${esc(data.reigns.current?.name||"–")} ${data.reigns.current?.matches||0} MATCHES <i>◆</i> <b>HOTTEST RIVALRY</b> ${rivalry?`${esc(rivalry.a)} vs ${esc(rivalry.b)} · ${rivalry.heat}/100`:"–"} <i>◆</i> <b>INTEGRITY</b> ${data.integrity.score}/100 VERIFIED</p></div><button type="button" data-action="open-fpi-centre">OPEN ↗</button></section>`;
  }

  function persist() {
    sessionStorage.setItem("psu-tab", ui.tab);
    sessionStorage.setItem("psu-player", ui.player);
    sessionStorage.setItem("psu-rival-a", ui.rivalA);
    sessionStorage.setItem("psu-rival-b", ui.rivalB);
    sessionStorage.setItem("psu-impact-a", ui.impactA);
    sessionStorage.setItem("psu-impact-b", ui.impactB);
    sessionStorage.setItem("psu-impact-stage", ui.impactStage);
    sessionStorage.setItem("psu-impact-margin", String(ui.impactMargin));
    sessionStorage.setItem("psu-impact-outcome", ui.impactOutcome);
  }

  function inject() {
    const ctx = context();
    const view = document.getElementById("view");
    if (!ctx || !view) return;
    const data = buildUniverse();
    if (!data) return;
    if (ctx.getActiveView?.() === "intelligence") {
      const centre = view.querySelector(".player-standing-centre");
      if (centre && !document.getElementById(MODULE_ID)) {
        centre.insertAdjacentHTML("beforeend", renderUniverse(data));
      }
    }
    if (ctx.getActiveView?.() === "dashboard" && !document.getElementById("psuHomePulse")) {
      const anchor = view.firstElementChild;
      if (anchor) anchor.insertAdjacentHTML("afterend", renderHomePulse(data));
    }
  }

  function rerenderModule() {
    persist();
    const old = document.getElementById(MODULE_ID);
    const data = buildUniverse();
    if (!old || !data) { inject(); return; }
    old.outerHTML = renderUniverse(data);
  }

  function exportIntegrity() {
    const data = buildUniverse();
    if (!data) return;
    const payload = {
      generatedAt:new Date().toISOString(),
      version:VERSION,
      model:data.model,
      integrity:data.integrity,
      currentStanding:data.players.map(player => ({ rank:player.rank,name:player.name,rating:player.rating,index:player.standing.index,class:player.tier.label,confidence:player.fpi.confidence })),
      latestRecords:data.records.slice(-50).map(record => ({ id:record.id,home:record.home,away:record.away,beforeHome:record.beforeHome,beforeAway:record.beforeAway,afterHome:record.afterHome,afterAway:record.afterAway,deltaHome:record.deltaHome,deltaAway:record.deltaAway,stage:record.stageLabel }))
    };
    const blob = new Blob([JSON.stringify(payload,null,2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `standing-integrity-${new Date().toISOString().slice(0,10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-psu-tab]");
    if (tab) { ui.tab = tab.dataset.psuTab || "overview"; rerenderModule(); return; }
    const outcome = event.target.closest("[data-psu-outcome]");
    if (outcome) { ui.impactOutcome = outcome.dataset.psuOutcome || "home"; rerenderModule(); return; }
    const exportButton = event.target.closest("[data-psu-export]");
    if (exportButton) { exportIntegrity(); return; }
  }, true);

  document.addEventListener("change", event => {
    const id = event.target.id;
    if (id === "psuPlayer") { ui.player = event.target.value; rerenderModule(); }
    if (id === "psuRivalA") { ui.rivalA = event.target.value; if (ui.rivalA === ui.rivalB) ui.rivalB = ""; rerenderModule(); }
    if (id === "psuRivalB") { ui.rivalB = event.target.value; rerenderModule(); }
    if (id === "psuImpactA") { ui.impactA = event.target.value; if (ui.impactA === ui.impactB) ui.impactB = ""; rerenderModule(); }
    if (id === "psuImpactB") { ui.impactB = event.target.value; rerenderModule(); }
    if (id === "psuImpactStage") { ui.impactStage = event.target.value; rerenderModule(); }
    if (id === "psuImpactMargin") { ui.impactMargin = Number(event.target.value)||1; rerenderModule(); }
  }, true);

  let injectQueued = false;
  function scheduleInject() {
    if (injectQueued) return;
    injectQueued = true;
    requestAnimationFrame(() => { injectQueued = false; inject(); });
  }
  const observer = new MutationObserver(scheduleInject);
  function boot() {
    const view = document.getElementById("view");
    if (view) observer.observe(view, { childList:true, subtree:true });
    scheduleInject();
    window.setInterval(scheduleInject, 10000);
    window.FIFA_STANDING_UNIVERSE = { version:VERSION, build:buildUniverse, render:rerenderModule, audit:() => buildUniverse()?.integrity || null };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once:true }); else boot();
})();
