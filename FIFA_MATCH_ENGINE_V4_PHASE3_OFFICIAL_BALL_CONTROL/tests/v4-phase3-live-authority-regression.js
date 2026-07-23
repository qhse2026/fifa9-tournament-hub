"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

function load(context, filename) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), "utf8"), context, { filename });
}

(function run() {
  let activeCareer;
  const teams = {
    H: { id: "TH", clubName: "Home Team", overall: 84 },
    A: { id: "TA", clubName: "Away Team", overall: 81 }
  };
  const context = {
    console,
    Math,
    Date,
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    FIFA_MANAGER_ROOM: {
      getActiveCareer: () => activeCareer,
      getActor: (career, id) => career.actors.find(row => row.id === id),
      getTeamForActor: (_fixture, id) => teams[id]
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  load(context, "manager-match-engine-v4-core.js");
  load(context, "manager-match-engine-v4-phase3-adapter.js");

  const fixture = {
    id: "F-P3",
    homeId: "H",
    awayId: "A",
    homeTeam: "home",
    awayTeam: "away",
    matchEngine: {
      status: "live",
      clockSeconds: 40,
      humanSide: "home",
      homeGoals: 0,
      aiGoals: 0,
      events: [],
      stats: { home: { shots: 1 }, away: { shots: 1 } },
      visual2D: { ball: { x: 24, y: 52 }, possession: "home", phase: "OYUN KURULUMU" },
      userPlan: {
        formation: "4-3-3", mentality: "balanced", pressing: "high", buildUp: "patient", tempo: "normal", risk: "measured",
        positionRoles: { RB: "overlap", GK: "distributor" },
        phaseBehaviors: { inPossession: "positional", outPossession: "high-press", winTransition: "secure", lossTransition: "counterpress" }
      },
      aiPlan: {
        formation: "4-2-3-1", mentality: "controlled", pressing: "mid", buildUp: "direct", tempo: "normal", risk: "safe",
        positionRoles: { LB: "stay-back", GK: "shot-stopper" },
        phaseBehaviors: { inPossession: "patient", outPossession: "mid-block", winTransition: "counter", lossTransition: "regroup" }
      }
    }
  };
  activeCareer = {
    id: "C-P3",
    activeMatchFixtureId: fixture.id,
    fixtures: [fixture],
    actors: [
      { id: "H", clubName: "Human FC", styleSeed: { tempo: 54, pressing: 60, risk: 50, width: 55 } },
      { id: "A", clubName: "AI FC", styleSeed: { tempo: 51, pressing: 48, risk: 45, width: 49 } }
    ]
  };

  const phase3 = context.FIFA_MATCH_ENGINE_V4_PHASE3;
  phase3.enable();
  let snapshot = phase3.getSnapshot();
  assert.equal(snapshot.authority, "V4_PASSING");
  assert.equal(snapshot.config.mode, "PASS_AUTHORITY");
  assert.equal(fixture.matchEngine.visual2D.ball.source, "ME4_PHASE3", "V4 ball did not become official visual ball");
  assert.equal(fixture.matchEngine.matchEngineV4.passStatsOfficial, true);
  assert(Number.isFinite(fixture.matchEngine.stats.home.passesAttempted));

  fixture.matchEngine.clockSeconds = 41;
  fixture.matchEngine.visual2D.ball = { x: 87, y: 48 };
  fixture.matchEngine.visual2D.phase = "ŞUT POZİSYONU";
  fixture.matchEngine.broadcastEvent = { id: "shot-1", type: "SHOT", side: "home", second: 41 };
  phase3.poll();
  snapshot = phase3.getSnapshot();
  assert.equal(snapshot.authority, "LEGACY_TERMINAL", "terminal event did not return authority to legacy engine");
  assert.equal(Math.round(snapshot.simulation.ball.position.x), 87, "legacy terminal ball was not synchronized");

  fixture.matchEngine.broadcastEvent = null;
  fixture.matchEngine.visual2D.phase = "OYUN KURULUMU";
  fixture.matchEngine.clockSeconds = 46;
  phase3.poll();
  snapshot = phase3.getSnapshot();
  assert.equal(snapshot.authority, "V4_PASSING", "authority did not return to V4 after terminal window");
  assert.equal(fixture.matchEngine.matchEngineV4.authority, "V4_PASSING");

  fixture.matchEngine.events.push({ id: "goal-1", type: "GOAL", side: "home", second: 47, text: "GOAL" });
  fixture.matchEngine.homeGoals = 1;
  fixture.matchEngine.clockSeconds = 47;
  phase3.poll();
  snapshot = phase3.getSnapshot();
  assert.equal(snapshot.authority, "LEGACY_TERMINAL");
  assert.equal(snapshot.simulation.officialScore.home, 1, "official score was not mirrored into V4 context");

  console.log("V4 PHASE 3 LIVE AUTHORITY REGRESSION: PASS");
  console.log(JSON.stringify({
    authority: snapshot.authority,
    statsWrites: snapshot.statsWrites,
    officialScore: snapshot.simulation.officialScore,
    passAccuracyHome: fixture.matchEngine.stats.home.passAccuracy
  }, null, 2));
})();
