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
  load(context, "manager-match-engine-v4-phase4-adapter.js");

  const fixture = {
    id: "F-P4",
    homeId: "H",
    awayId: "A",
    homeTeam: "home",
    awayTeam: "away",
    matchEngine: {
      status: "live",
      clockSeconds: 0,
      humanSide: "home",
      homeGoals: 0,
      aiGoals: 0,
      events: [],
      stats: { home: {}, away: {} },
      visual2D: { ball: { x: 50, y: 50 }, possession: "home", phase: "KICK OFF" },
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
    id: "C-P4",
    activeMatchFixtureId: fixture.id,
    fixtures: [fixture],
    actors: [
      { id: "H", clubName: "Human FC", styleSeed: { tempo: 54, pressing: 60, risk: 50, width: 55 } },
      { id: "A", clubName: "AI FC", styleSeed: { tempo: 51, pressing: 48, risk: 45, width: 49 } }
    ]
  };

  const phase4 = context.FIFA_MATCH_ENGINE_V4_PHASE4;
  assert(phase4, "Phase 4 adapter API not exposed");
  phase4.enable();
  const engine = phase4.attach(activeCareer, fixture, 0);
  let snapshot = phase4.getSnapshot();
  assert.equal(snapshot.authority, "V4_FULL_AUTHORITY");
  assert.equal(snapshot.config.mode, "FULL_AUTHORITY");
  assert.equal(fixture.matchEngine.matchEngineV4.scoreOfficial, true);
  assert.equal(fixture.matchEngine.matchEngineV4.goalkeeperOfficial, true);
  assert.equal(fixture.matchEngine.visual2D.ball.source, "ME4_PHASE4");

  engine.runTo(4);
  const striker = engine.getSnapshot().teams.home.players.find(player => player.group === "ST");
  const shot = engine.debugStartShot(striker.id, { forceOutcome: "GOAL", targetY: 34, targetZ: 1, shotType: "PLACED" });
  engine.step(shot.duration + 0.6);
  fixture.matchEngine.clockSeconds = engine.getSnapshot().simulationTime;
  phase4.poll();
  snapshot = phase4.getSnapshot();

  assert.equal(fixture.matchEngine.homeGoals, 1, "V4 goal did not become official legacy-visible score");
  assert.equal(fixture.homeScore, 1, "fixture score was not synchronized");
  assert.equal(fixture.matchEngine.stats.home.goals, 1, "official goal stats not synchronized");
  assert.equal(fixture.matchEngine.matchEngineV4.contract.shots, "V4");
  assert.equal(snapshot.authority, "V4_FULL_AUTHORITY");
  assert.equal(snapshot.simulation.score.home, 1);

  console.log("V4 PHASE 4 FULL AUTHORITY REGRESSION: PASS");
  console.log(JSON.stringify({
    authority: snapshot.authority,
    officialScore: { home: fixture.matchEngine.homeGoals, away: fixture.matchEngine.aiGoals },
    shotStatsOfficial: fixture.matchEngine.matchEngineV4.shotStatsOfficial,
    visualBallSource: fixture.matchEngine.visual2D.ball.source
  }, null, 2));
})();
