"use strict";

const assert = require("assert");
const core = require("../manager-match-engine-v4-core.js");

function teammates(snapshot, side = "home") {
  return snapshot.teams[side].players;
}

(function run() {
  assert.equal(core.VERSION, "4.0.0-phase3.1");
  assert.equal(core.FIXED_STEP, 0.1);

  const engine = core.createEngine(core.createDefaultConfig({ seed: "phase3-flight", mode: "PASS_AUTHORITY" }));
  let snapshot = engine.getSnapshot();
  const home = teammates(snapshot);
  const passer = home.find(player => player.group === "CM") || home[6];
  const receiver = home.find(player => player.group === "WING") || home[8];

  engine.debugStartPass(passer.id, receiver.id, { outcome: "TEAMMATE", touchOutcome: "CLEAN" });
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballControl.state, "IN_FLIGHT");
  assert(snapshot.ballControl.activeAction, "pass action missing");
  assert.equal(snapshot.ball.ownerId, null, "ball must not remain attached during flight");
  const startX = snapshot.ball.position.x;
  engine.step(0.2);
  snapshot = engine.getSnapshot();
  assert.notEqual(snapshot.ball.position.x, startX, "ball did not move along pass trajectory");
  assert(snapshot.ballControl.activeAction.progress > 0, "pass progress not updated");
  engine.step(3);
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballControl.state, "CONTROLLED");
  assert.equal(snapshot.ball.ownerId, receiver.id, "receiver did not control completed pass");

  const heavyAction = engine.debugStartPass(receiver.id, passer.id, { outcome: "TEAMMATE", touchOutcome: "HEAVY" });
  engine.step(heavyAction.duration + 0.05);
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballControl.state, "LOOSE", "heavy touch did not create loose ball");
  assert(snapshot.ballControl.loose?.secondBall, "heavy touch must create second-ball contest");
  engine.step(3);
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballControl.state, "CONTROLLED", "second ball was not resolved");

  const away = teammates(snapshot, "away");
  const interceptor = away.find(player => player.group === "DM") || away[5];
  const interceptionAction = engine.debugStartPass(passer.id, receiver.id, { outcome: "INTERCEPTION", interceptorId: interceptor.id });
  engine.step(interceptionAction.duration + 0.15);
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ball.ownerId, interceptor.id, "forced interception did not transfer possession");
  assert.equal(snapshot.possessionSide, "away");

  engine.setBallAuthority(true, {
    ball: { x: 88, y: 34 },
    possessionSide: "home",
    score: { home: 1, away: 0 }
  });
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballAuthority, "LEGACY_TERMINAL");
  assert.equal(snapshot.ball.position.x, 88);
  engine.step(1);
  assert.equal(engine.getSnapshot().ball.position.x, 88, "suspended authority should preserve external ball state");

  engine.setBallAuthority(false, {
    ball: { x: 30, y: 28 },
    possessionSide: "away",
    score: { home: 1, away: 0 },
    nextDecisionIn: 0.5
  });
  snapshot = engine.getSnapshot();
  assert.equal(snapshot.ballAuthority, "V4_PASSING");
  assert.equal(snapshot.possessionSide, "away");

  const report = engine.getReport();
  const totalBadTouches = report.home.stats.badTouches + report.away.stats.badTouches;
  const totalSecondBalls = report.home.stats.secondBallsWon + report.away.stats.secondBallsWon;
  assert(totalBadTouches >= 1, "bad touch telemetry missing");
  assert(totalSecondBalls >= 1, "second-ball telemetry missing");

  console.log("V4 PHASE 3 BALL CONTROL REGRESSION: PASS");
  console.log(JSON.stringify({
    version: core.VERSION,
    finalAuthority: snapshot.ballAuthority,
    passStats: {
      attempted: report.home.stats.passesAttempted + report.away.stats.passesAttempted,
      completed: report.home.stats.passesCompleted + report.away.stats.passesCompleted
    },
    badTouches: totalBadTouches,
    secondBallsWon: totalSecondBalls
  }, null, 2));
})();
