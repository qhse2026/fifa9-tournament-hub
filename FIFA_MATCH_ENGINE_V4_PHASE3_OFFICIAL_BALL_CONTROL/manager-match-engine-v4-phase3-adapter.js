(() => {
  "use strict";

  const VERSION = "4.0.0-phase3-authority.1";
  const DEFAULT_POLL_MS = 125;
  const runtime = {
    enabled: false,
    timer: null,
    pollMs: DEFAULT_POLL_MS,
    fixtureId: null,
    engine: null,
    lastLegacySecond: 0,
    diagnostics: null,
    configSignature: null,
    lastConfig: null,
    authority: "V4_PASSING",
    terminalUntil: 0,
    lastOfficialEventSignature: null,
    lastAuthorityChangeAt: 0,
    statsWrites: 0
  };

  const room = () => globalThis.FIFA_MANAGER_ROOM;
  const core = () => globalThis.FIFA_MATCH_ENGINE_V4;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function activeContext() {
    const career = room()?.getActiveCareer?.();
    if (!career) return null;
    const fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    const activeId = career.activeMatchFixtureId;
    const fixture = (activeId ? fixtures.find(item => item.id === activeId) : null) ||
      fixtures.find(item => ["live", "decision", "paused"].includes(item.matchEngine?.status)) ||
      fixtures.find(item => item.id === runtime.fixtureId);
    if (!fixture?.matchEngine) return null;
    return { career, fixture };
  }

  function actor(career, id) {
    return room()?.getActor?.(career, id) || (career.actors || []).find(item => item.id === id) || {};
  }

  function teamFor(fixture, id) {
    return room()?.getTeamForActor?.(fixture, id) ||
      (id === fixture.homeId ? fixture.homeTeamData : fixture.awayTeamData) || {};
  }

  function numericChoice(value, choices, fallback) {
    if (Number.isFinite(Number(value))) return Number(value);
    return Object.prototype.hasOwnProperty.call(choices, value) ? choices[value] : fallback;
  }

  function phaseBehaviors(plan = {}) {
    return plan.phaseBehaviors || plan.phases || {
      inPossession: plan.inPossession,
      outPossession: plan.outPossession,
      winTransition: plan.winTransition,
      lossTransition: plan.lossTransition
    };
  }

  function roleMap(plan = {}) {
    return plan.positionRoles || plan.roles || {};
  }

  function mapMentality(plan = {}) {
    return plan.mentality || plan.base?.mentality || "balanced";
  }

  function inferFullbackDuty(plan = {}) {
    const roles = Object.values(roleMap(plan)).map(value => String(value).toLowerCase());
    if (roles.some(value => /attacking-wingback|wing-back-attack|overlap|complete-wingback/.test(value))) return "attack";
    if (roles.some(value => /stay-back|defensive-wingback|fullback-defend|no-nonsense/.test(value))) return "defend";
    const mentality = mapMentality(plan);
    if (["aggressive", "attacking", "all-out"].includes(mentality)) return "attack";
    if (["controlled", "defensive", "protect"].includes(mentality)) return "defend";
    return "balanced";
  }

  function inferGoalkeeper(plan = {}) {
    const roles = Object.values(roleMap(plan)).map(value => String(value).toLowerCase());
    if (roles.some(value => /distributor|playmaker-keeper|ball-playing-keeper/.test(value))) return "playmaker-keeper";
    if (roles.some(value => /sweeper/.test(value))) return "sweeper-keeper";
    if (roles.some(value => /shot-stopper|line-keeper/.test(value))) return "line-keeper";
    if (roles.some(value => /cross-commander|aerial/.test(value))) return "cross-commander";
    if (roles.some(value => /eccentric/.test(value))) return "eccentric-keeper";
    return "sweeper-keeper";
  }

  function mapTactics(plan = {}, actorRow = {}) {
    const style = actorRow.styleSeed || {};
    const phases = phaseBehaviors(plan);
    const mentality = mapMentality(plan);
    const tempo = numericChoice(plan.tempo, { low: 38, normal: 52, high: 70, extreme: 82 }, Number(style.tempo || 50));
    const pressing = numericChoice(plan.pressing, { low: 35, mid: 52, high: 72, extreme: 84 }, Number(style.pressing || 50));
    const risk = numericChoice(plan.risk, { safe: 35, measured: 50, bold: 70, reckless: 84 }, Number(style.risk || 50));
    const directness = numericChoice(plan.buildUp, { patient: 32, central: 48, balanced: 50, wings: 56, direct: 74, transition: 78 }, Number(style.directness || 50));
    const width = numericChoice(plan.width, { narrow: 38, balanced: 52, wide: 72 }, plan.buildUp === "wings" ? 72 : plan.buildUp === "central" ? 42 : Number(style.width || 50));
    const out = phases.outPossession || "mid-block";
    return {
      mentality,
      inPossession: phases.inPossession || "positional",
      outPossession: out,
      winTransition: phases.winTransition || "secure",
      lossTransition: phases.lossTransition || "regroup",
      tempo: clamp(tempo, 20, 90),
      width: clamp(width, 25, 85),
      pressing: clamp(pressing, 20, 90),
      risk: clamp(risk, 20, 90),
      passingDirectness: clamp(directness, 20, 90),
      defensiveLine: out === "high-press" ? 70 : out === "low-block" ? 36 : 52,
      fullbackDuty: inferFullbackDuty(plan),
      cornerRoutine: plan.setPieces?.cornerRoutine || plan.cornerRoutine || "mixed"
    };
  }

  function sidePlans(fixture) {
    const legacy = fixture.matchEngine || {};
    const humanSide = legacy.humanSide || null;
    const humanPlan = legacy.userPlan || fixture.matchPlan?.human || fixture.matchPlan || {};
    const aiPlan = legacy.aiPlan || fixture.matchPlan?.ai || {};
    return {
      humanSide,
      home: humanSide === "home" ? humanPlan : humanSide === "away" ? aiPlan : fixture.matchPlan?.home || humanPlan,
      away: humanSide === "away" ? humanPlan : humanSide === "home" ? aiPlan : fixture.matchPlan?.away || aiPlan
    };
  }

  function buildConfig(career, fixture) {
    const plans = sidePlans(fixture);
    const homeActor = actor(career, fixture.homeId);
    const awayActor = actor(career, fixture.awayId);
    const homeTeam = teamFor(fixture, fixture.homeId);
    const awayTeam = teamFor(fixture, fixture.awayId);
    return {
      matchId: fixture.id,
      mode: "PASS_AUTHORITY",
      seed: `${career.id}|${fixture.id}|ME4-PHASE3`,
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || homeTeam.clubName || fixture.homeTeam || "Home",
        rating: Number(homeTeam.overall || homeTeam.ovr || 80),
        formation: plans.home.formation || "4-3-3",
        roles: roleMap(plans.home),
        goalkeeperArchetype: inferGoalkeeper(plans.home),
        tactics: mapTactics(plans.home, homeActor)
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || awayTeam.clubName || fixture.awayTeam || "Away",
        rating: Number(awayTeam.overall || awayTeam.ovr || 80),
        formation: plans.away.formation || "4-2-3-1",
        roles: roleMap(plans.away),
        goalkeeperArchetype: inferGoalkeeper(plans.away),
        tactics: mapTactics(plans.away, awayActor)
      }
    };
  }

  function stableSignature(config) {
    return JSON.stringify({
      matchId: config.matchId,
      home: config.home,
      away: config.away
    });
  }

  function attach(career, fixture, targetSecond = 0) {
    if (!core()) throw new Error("manager-match-engine-v4-core.js yüklenmedi.");
    const config = buildConfig(career, fixture);
    runtime.engine = core().createEngine(config);
    runtime.fixtureId = fixture.id;
    runtime.lastLegacySecond = 0;
    runtime.diagnostics = null;
    runtime.configSignature = stableSignature(config);
    runtime.lastConfig = config;
    runtime.authority = "V4_PASSING";
    runtime.terminalUntil = 0;
    runtime.lastOfficialEventSignature = null;
    const second = Math.max(0, Number(targetSecond || 0));
    if (second > 0) runtime.engine.runTo(second);
    runtime.lastLegacySecond = second;
    const external = officialExternalState(fixture);
    runtime.engine.setBallAuthority(false, { ...external, source: "PHASE3_INITIAL_SYNC", nextDecisionIn: 0.8 });
    applyV4OfficialState(fixture);
    return runtime.engine;
  }


  function officialExternalState(fixture) {
    const legacy = fixture.matchEngine || {};
    const state = legacy.visual2D || {};
    const point = state.ball;
    const possession = ["home", "away"].includes(state.possession) ? state.possession :
      ["home", "away"].includes(legacy.matchFlow?.possession) ? legacy.matchFlow.possession :
      ["home", "away"].includes(legacy.phaseState?.possession) ? legacy.phaseState.possession : null;
    return {
      ball: point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y)) ? {
        x: Number(point.x),
        y: Number(point.y) / 100 * 68,
        height: Number(point.height || 0)
      } : null,
      possessionSide: possession,
      score: {
        home: Number(legacy.homeGoals ?? legacy.scoreHome ?? fixture.homeScore ?? 0),
        away: Number(legacy.aiGoals ?? legacy.scoreAway ?? fixture.awayScore ?? 0)
      },
      source: "LEGACY_OFFICIAL",
      reason: state.phase || "LEGACY_OFFICIAL_BALL",
      settleSeconds: 0.14,
      reassignOwner: true
    };
  }

  function latestOfficialEvent(fixture) {
    const legacy = fixture.matchEngine || {};
    const broadcast = legacy.broadcastEvent || legacy.currentBroadcastEvent || null;
    const latest = Array.isArray(legacy.events) ? legacy.events.at(-1) : null;
    return broadcast || latest || null;
  }

  function normalizeOfficialType(event) {
    const raw = `${event?.type || ""} ${event?.title || ""} ${event?.text || ""}`.toUpperCase();
    if (/GOAL|GOL/.test(raw)) return "GOAL";
    if (/CORNER|KORNER/.test(raw)) return "CORNER";
    if (/GOAL.?KICK|KALE VURU/.test(raw)) return "GOAL_KICK";
    if (/SAVE|KURTARI/.test(raw)) return "SAVE_HELD";
    if (/PENALTY|PENALTI|FREE.?KICK|SERBEST|SHOT|ŞUT|WOODWORK|DİREK/.test(raw)) return "TERMINAL";
    return null;
  }

  function eventSignature(event) {
    if (!event) return null;
    return [event.id, event.type, event.second, event.minute, event.text, event.title].map(value => String(value ?? "")).join("|");
  }

  function terminalSignal(fixture, simulation) {
    const legacy = fixture.matchEngine || {};
    const state = legacy.visual2D || {};
    const phase = `${state.phase || ""} ${legacy.phaseState?.phase || ""}`.toUpperCase();
    const official = latestOfficialEvent(fixture);
    const officialType = normalizeOfficialType(official);
    const requested = simulation?.lastEvent?.type === "TERMINAL_HANDOFF_REQUEST" || simulation?.ball?.state === "WAITING_TERMINAL";
    const phaseTerminal = /ŞUT|SHOT|GOL|GOAL|KORNER|CORNER|PENAL|SERBEST|FREE KICK|KALE VURU|GOAL KICK|DURAN TOP|SET PIECE|KURTARI|SAVE/.test(phase);
    return { active: Boolean(requested || phaseTerminal || officialType), requested, phaseTerminal, official, officialType };
  }

  function changeAuthority(fixture, next, reason) {
    if (!runtime.engine || runtime.authority === next) return;
    const external = officialExternalState(fixture);
    runtime.authority = next;
    runtime.lastAuthorityChangeAt = Number(fixture.matchEngine?.clockSeconds || 0);
    runtime.engine.setBallAuthority(next === "LEGACY_TERMINAL", { ...external, source: reason || next, nextDecisionIn: 0.75 });
  }

  function applyPassStats(target = {}, source = {}) {
    const keys = [
      "passesAttempted", "passesCompleted", "shortPassesAttempted", "shortPassesCompleted",
      "mediumPassesAttempted", "mediumPassesCompleted", "longPassesAttempted", "longPassesCompleted",
      "finalThirdPassesAttempted", "finalThirdPassesCompleted", "progressivePasses",
      "crossesAttempted", "crossesCompleted", "interceptions", "recoveries", "turnovers",
      "badTouches", "looseBalls", "looseBallsWon", "secondBallsWon", "entriesFinalThird", "entriesBox"
    ];
    keys.forEach(key => { target[key] = Number(source[key] || 0); });
    target.passes = target.passesCompleted;
    target.passAccuracy = target.passesAttempted ? Math.round(target.passesCompleted / target.passesAttempted * 100) : 0;
    return target;
  }

  function applyV4OfficialState(fixture) {
    if (!runtime.engine) return;
    const legacy = fixture.matchEngine || {};
    const snapshot = runtime.engine.getSnapshot();
    const report = runtime.engine.getReport();
    legacy.stats = legacy.stats || {};
    legacy.stats.home = applyPassStats(legacy.stats.home || {}, report.home.stats);
    legacy.stats.away = applyPassStats(legacy.stats.away || {}, report.away.stats);
    legacy.matchEngineV4 = {
      version: VERSION,
      coreVersion: snapshot.version,
      authority: runtime.authority,
      passStatsOfficial: true,
      updatedAtSecond: Number(legacy.clockSeconds || 0),
      ballState: snapshot.ballControl?.state || snapshot.ball?.state || "UNKNOWN",
      eventCount: snapshot.eventCount,
      contract: {
        players: "V4",
        passingBall: "V4",
        passControl: "V4",
        terminalActions: "LEGACY",
        score: "LEGACY",
        persistence: "LEGACY_WITH_V4_PASS_STATS"
      }
    };
    runtime.statsWrites += 1;
    if (runtime.authority !== "V4_PASSING") return;
    legacy.visual2D = legacy.visual2D || {};
    legacy.visual2D.ball = {
      x: clamp(snapshot.ball.position.x, 0.5, 99.5),
      y: clamp(snapshot.ball.position.y / 68 * 100, 1, 99),
      height: Number(snapshot.ball.height || 0),
      vx: Number(snapshot.ball.velocity?.x || 0),
      vy: Number(snapshot.ball.velocity?.y || 0),
      source: "ME4_PHASE3"
    };
    legacy.visual2D.possession = snapshot.possessionSide;
    legacy.visual2D.phase = phaseLabel(snapshot);
    legacy.visual2D.ballControl = snapshot.ballControl;
  }

  function phaseLabel(snapshot) {
    const state = snapshot?.ballControl?.state;
    if (state === "IN_FLIGHT") return snapshot.ballControl.activeAction?.type === "CROSS" ? "V4 ORTA UÇUŞU" : "V4 PAS UÇUŞU";
    if (state === "LOOSE") return snapshot.ballControl?.loose?.secondBall ? "V4 İKİNCİ TOP" : "V4 BOŞTA TOP";
    if (state === "CONTROLLED") return `V4 ${String(snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
    return `V4 ${String(state || snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
  }

  function synchronizeOfficialState(fixture) {
    if (!runtime.engine) return;
    const legacySecond = Number(fixture.matchEngine?.clockSeconds || fixture.matchEngine?.minute * 60 || 0);
    const before = runtime.engine.getSnapshot();
    const signal = terminalSignal(fixture, before);
    const signature = eventSignature(signal.official);
    if (signature && signature !== runtime.lastOfficialEventSignature) {
      runtime.lastOfficialEventSignature = signature;
      if (["GOAL", "CORNER", "GOAL_KICK", "SAVE_HELD"].includes(signal.officialType)) {
        runtime.engine.injectOfficialEvent({
          ...signal.official,
          type: signal.officialType,
          side: signal.official?.side || before.possessionSide,
          score: officialExternalState(fixture).score
        });
      }
    }
    if (signal.active) {
      runtime.terminalUntil = Math.max(runtime.terminalUntil, legacySecond + (signal.requested ? 3.2 : 2.4));
      changeAuthority(fixture, "LEGACY_TERMINAL", signal.requested ? "V4_TERMINAL_REQUEST" : "LEGACY_TERMINAL_EVENT");
    } else if (runtime.authority === "LEGACY_TERMINAL" && legacySecond >= runtime.terminalUntil) {
      changeAuthority(fixture, "V4_PASSING", "RETURN_TO_V4_PASSING");
    }
    const external = officialExternalState(fixture);
    if (runtime.authority === "LEGACY_TERMINAL") {
      runtime.engine.syncExternalState({ ...external, source: "LEGACY_TERMINAL", preserveAction: true });
    } else {
      runtime.engine.syncExternalState({ score: external.score, source: "LEGACY_SCORE_ONLY", preserveAction: true });
    }
    applyV4OfficialState(fixture);
  }

  function compare(fixture, report) {
    const legacy = fixture.matchEngine || {};
    const snapshot = runtime.engine.getSnapshot();
    return {
      fixtureId: fixture.id,
      authority: runtime.authority,
      legacySecond: Number(legacy.clockSeconds || legacy.minute * 60 || 0),
      v4Second: report.status === "fulltime" ? 5400 : runtime.engine.clockSeconds,
      officialScore: officialExternalState(fixture).score,
      ballState: snapshot.ballControl?.state,
      activePass: snapshot.ballControl?.activeAction || null,
      looseBall: snapshot.ballControl?.loose || null,
      passStats: {
        home: { attempted: report.home.stats.passesAttempted, completed: report.home.stats.passesCompleted, accuracy: report.home.stats.passesAttempted ? Math.round(report.home.stats.passesCompleted / report.home.stats.passesAttempted * 100) : 0 },
        away: { attempted: report.away.stats.passesAttempted, completed: report.away.stats.passesCompleted, accuracy: report.away.stats.passesAttempted ? Math.round(report.away.stats.passesCompleted / report.away.stats.passesAttempted * 100) : 0 }
      },
      v4RestDefence: snapshot.restDefence,
      v4LastEvent: report.events.at(-1) || null,
      generatedAt: new Date().toISOString()
    };
  }

  function emitSnapshot() {
    if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
    globalThis.dispatchEvent(new globalThis.CustomEvent("fifa-match-engine-v4-phase3", { detail: getSnapshot() }));
    globalThis.dispatchEvent(new globalThis.CustomEvent("fifa-match-engine-v4-shadow", { detail: getSnapshot() }));
  }

  function poll() {
    if (!runtime.enabled) return getSnapshot();
    const context = activeContext();
    if (!context) return getSnapshot();
    const { career, fixture } = context;
    const legacySecond = Math.max(0, Number(fixture.matchEngine?.clockSeconds || fixture.matchEngine?.minute * 60 || 0));
    const nextConfig = buildConfig(career, fixture);
    const nextSignature = stableSignature(nextConfig);
    if (!runtime.engine || runtime.fixtureId !== fixture.id || legacySecond < runtime.lastLegacySecond || nextSignature !== runtime.configSignature) {
      attach(career, fixture, legacySecond);
    } else if (legacySecond > runtime.engine.clockSeconds) {
      runtime.engine.runTo(legacySecond);
      runtime.lastLegacySecond = legacySecond;
    }
    synchronizeOfficialState(fixture);
    runtime.diagnostics = compare(fixture, runtime.engine.getReport());
    emitSnapshot();
    return getSnapshot();
  }

  function restartTimer() {
    if (runtime.timer) globalThis.clearInterval(runtime.timer);
    runtime.timer = runtime.enabled ? globalThis.setInterval(poll, runtime.pollMs) : null;
  }

  function enable() {
    if (!runtime.enabled) {
      runtime.enabled = true;
      restartTimer();
      console.info(`[Match Engine V4] Phase 3 ball authority enabled · ${VERSION}`);
    }
    poll();
    return getSnapshot();
  }

  function disable() {
    runtime.enabled = false;
    restartTimer();
    runtime.fixtureId = null;
    runtime.engine = null;
    runtime.configSignature = null;
    runtime.lastConfig = null;
    runtime.authority = "V4_PASSING";
    runtime.terminalUntil = 0;
    runtime.lastOfficialEventSignature = null;
    return getSnapshot();
  }

  function setPollInterval(milliseconds) {
    runtime.pollMs = clamp(milliseconds, 60, 2000);
    restartTimer();
    return runtime.pollMs;
  }

  function getSnapshot() {
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.fixtureId,
      authority: runtime.authority,
      terminalUntil: runtime.terminalUntil,
      statsWrites: runtime.statsWrites,
      configSignature: runtime.configSignature,
      config: runtime.lastConfig,
      simulation: runtime.engine?.getSnapshot?.() || null,
      diagnostics: runtime.diagnostics
    };
  }

  function runCalibration(count = 100, seedPrefix = "calibration") {
    if (!core()) throw new Error("V4 core unavailable");
    const safeCount = Math.max(1, Math.min(5000, Number(count) || 100));
    const rows = [];
    for (let index = 0; index < safeCount; index += 1) {
      const engine = core().createEngine(core().createDefaultConfig({ seed: `${seedPrefix}-${index}` }));
      engine.runFullMatch();
      rows.push(engine.getReport());
    }
    const total = rows.reduce((memo, row) => {
      memo.goals += row.score.home + row.score.away;
      memo.shots += row.home.stats.shots + row.away.stats.shots;
      memo.xg += row.home.stats.xg + row.away.stats.xg;
      memo.corners += row.home.stats.corners + row.away.stats.corners;
      memo.passes += row.home.stats.passesAttempted + row.away.stats.passesAttempted;
      return memo;
    }, { goals: 0, shots: 0, xg: 0, corners: 0, passes: 0 });
    return {
      matches: safeCount,
      averages: Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value / safeCount * 100) / 100])),
      samples: rows.slice(0, 5).map(row => ({ score: row.score, homeShots: row.home.stats.shots, awayShots: row.away.stats.shots }))
    };
  }

  const API = Object.freeze({
    VERSION,
    enable,
    disable,
    attach,
    poll,
    getSnapshot,
    runCalibration,
    buildConfig,
    setPollInterval,
    __diagnostics: { activeContext, mapTactics, roleMap, phaseBehaviors, stableSignature, synchronizeOfficialState, officialExternalState, terminalSignal, applyV4OfficialState, normalizeOfficialType }
  });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE3 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_SHADOW = API;
})();
