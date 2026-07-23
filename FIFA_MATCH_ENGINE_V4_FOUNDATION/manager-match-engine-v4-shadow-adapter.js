(() => {
  "use strict";

  const VERSION = "4.0.0-shadow.1";
  const runtime = {
    enabled: false,
    timer: null,
    fixtureId: null,
    engine: null,
    lastLegacySecond: 0,
    diagnostics: null
  };

  const room = () => globalThis.FIFA_MANAGER_ROOM;
  const core = () => globalThis.FIFA_MATCH_ENGINE_V4;

  function activeContext() {
    const career = room()?.getActiveCareer?.();
    if (!career) return null;
    const fixture = (career.fixtures || []).find(item => item.matchEngine?.status === "live") ||
      (career.fixtures || []).find(item => item.id === runtime.fixtureId);
    if (!fixture) return null;
    return { career, fixture };
  }

  function actor(career, id) {
    return (career.actors || []).find(item => item.id === id) || {};
  }

  function mapMentality(plan = {}) {
    return plan.mentality || plan.base?.mentality || "balanced";
  }

  function mapTactics(plan = {}, actorRow = {}) {
    const style = actorRow.styleSeed || {};
    return {
      mentality: mapMentality(plan),
      inPossession: plan.phases?.inPossession || plan.inPossession || "positional",
      outPossession: plan.phases?.outPossession || plan.outPossession || "mid-block",
      winTransition: plan.phases?.winTransition || plan.winTransition || "secure",
      lossTransition: plan.phases?.lossTransition || plan.lossTransition || "regroup",
      tempo: Number(style.tempo || 50),
      width: Number(style.width || 50),
      pressing: Number(style.pressing || 50),
      risk: Number(style.risk || 50),
      passingDirectness: Number(style.directness || 50),
      defensiveLine: plan.phases?.outPossession === "high-press" ? 68 : plan.phases?.outPossession === "low-block" ? 38 : 52,
      fullbackDuty: inferFullbackDuty(plan),
      cornerRoutine: "mixed"
    };
  }

  function inferFullbackDuty(plan = {}) {
    const roles = Object.values(plan.roles || {});
    if (roles.some(value => /attacking-wingback|overlap/i.test(String(value)))) return "attack";
    if (roles.some(value => /stay-back|defensive-wingback/i.test(String(value)))) return "defend";
    return "balanced";
  }

  function buildConfig(career, fixture) {
    const homeActor = actor(career, fixture.homeId);
    const awayActor = actor(career, fixture.awayId);
    const legacy = fixture.matchEngine || {};
    const plan = fixture.matchPlan || legacy.matchPlan || {};
    const humanSide = legacy.humanSide || (homeActor.type === "human" ? "home" : awayActor.type === "human" ? "away" : null);
    const humanPlan = plan.human || plan;
    const aiPlan = plan.ai || {};
    const homePlan = humanSide === "home" ? humanPlan : humanSide === "away" ? aiPlan : plan.home || {};
    const awayPlan = humanSide === "away" ? humanPlan : humanSide === "home" ? aiPlan : plan.away || {};
    const homeTeam = fixture.homeTeamData || {};
    const awayTeam = fixture.awayTeamData || {};

    return {
      matchId: fixture.id,
      seed: `${career.id}|${fixture.id}|ME4`,
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || fixture.homeTeam || "Home",
        rating: Number(homeTeam.overall || homeTeam.ovr || 80),
        formation: homePlan.formation || "4-3-3",
        roles: homePlan.roles || {},
        goalkeeperArchetype: inferGoalkeeper(homePlan),
        tactics: mapTactics(homePlan, homeActor)
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || fixture.awayTeam || "Away",
        rating: Number(awayTeam.overall || awayTeam.ovr || 80),
        formation: awayPlan.formation || "4-2-3-1",
        roles: awayPlan.roles || {},
        goalkeeperArchetype: inferGoalkeeper(awayPlan),
        tactics: mapTactics(awayPlan, awayActor)
      }
    };
  }

  function inferGoalkeeper(plan = {}) {
    const roles = Object.values(plan.roles || {}).map(String);
    if (roles.some(value => value.includes("distributor"))) return "playmaker-keeper";
    if (roles.some(value => value.includes("sweeper"))) return "sweeper-keeper";
    if (roles.some(value => value.includes("shot-stopper"))) return "line-keeper";
    return "sweeper-keeper";
  }

  function attach(career, fixture) {
    if (!core()) throw new Error("manager-match-engine-v4-core.js yüklenmedi.");
    runtime.engine = core().createEngine(buildConfig(career, fixture));
    runtime.fixtureId = fixture.id;
    runtime.lastLegacySecond = 0;
    runtime.diagnostics = null;
    return runtime.engine;
  }

  function poll() {
    if (!runtime.enabled) return;
    const context = activeContext();
    if (!context) return;
    const { career, fixture } = context;
    if (!runtime.engine || runtime.fixtureId !== fixture.id) attach(career, fixture);
    const legacySecond = Math.max(0, Number(fixture.matchEngine?.clockSeconds || fixture.matchEngine?.minute * 60 || 0));
    if (legacySecond < runtime.lastLegacySecond) attach(career, fixture);
    if (legacySecond > runtime.engine.clockSeconds) runtime.engine.runTo(legacySecond);
    runtime.lastLegacySecond = legacySecond;
    runtime.diagnostics = compare(fixture, runtime.engine.getReport());
    globalThis.dispatchEvent?.(new CustomEvent("fifa-match-engine-v4-shadow", { detail: getSnapshot() }));
  }

  function compare(fixture, report) {
    const legacy = fixture.matchEngine || {};
    const legacyStats = legacy.stats || {};
    return {
      fixtureId: fixture.id,
      legacySecond: Number(legacy.clockSeconds || legacy.minute * 60 || 0),
      v4Second: report.status === "fulltime" ? 5400 : runtime.engine.clockSeconds,
      legacyScore: { home: Number(legacy.homeGoals || legacy.homeScore || 0), away: Number(legacy.aiGoals || legacy.awayScore || 0) },
      v4Score: report.score,
      legacyShots: { home: Number(legacyStats.home?.shots || 0), away: Number(legacyStats.away?.shots || 0) },
      v4Shots: { home: report.home.stats.shots, away: report.away.stats.shots },
      v4RestDefence: runtime.engine.getSnapshot().restDefence,
      v4LastEvent: report.events.at(-1) || null,
      generatedAt: new Date().toISOString()
    };
  }

  function enable() {
    if (runtime.enabled) return getSnapshot();
    runtime.enabled = true;
    runtime.timer = globalThis.setInterval(poll, 500);
    poll();
    console.info(`[Match Engine V4] Shadow mode enabled · ${VERSION}`);
    return getSnapshot();
  }

  function disable() {
    runtime.enabled = false;
    if (runtime.timer) globalThis.clearInterval(runtime.timer);
    runtime.timer = null;
    runtime.fixtureId = null;
    runtime.engine = null;
    return getSnapshot();
  }

  function getSnapshot() {
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.fixtureId,
      simulation: runtime.engine?.getSnapshot?.() || null,
      diagnostics: runtime.diagnostics
    };
  }

  function runCalibration(count = 100, seedPrefix = "calibration") {
    if (!core()) throw new Error("V4 core unavailable");
    const rows = [];
    for (let index = 0; index < count; index += 1) {
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
      matches: count,
      averages: Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value / count * 100) / 100])),
      samples: rows.slice(0, 5).map(row => ({ score: row.score, homeShots: row.home.stats.shots, awayShots: row.away.stats.shots }))
    };
  }

  const API = Object.freeze({ VERSION, enable, disable, attach, poll, getSnapshot, runCalibration, buildConfig });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_SHADOW = API;
})();
