"use strict";

const assert = require("assert");
const path = require("path");
const core = require(path.resolve(__dirname, "..", "manager-match-engine-v4-core.js"));

function engineFor(seed) {
  const engine = core.createEngine(core.createDefaultConfig({ seed }));
  engine.runTo(4);
  return engine;
}

function striker(engine, side = "home") {
  return engine.getSnapshot().teams[side].players.find(player => player.group === "ST");
}

function runForced(outcome, options = {}) {
  const engine = engineFor(`phase4-${outcome}`);
  const shooter = striker(engine, options.side || "home");
  const before = engine.getSnapshot();
  const shot = engine.debugStartShot(shooter.id, {
    forceOutcome: outcome,
    shotType: options.shotType || "PLACED",
    targetY: options.targetY ?? 34,
    targetZ: options.targetZ ?? 1,
    source: options.source || "OPEN_PLAY"
  });
  assert(shot, `${outcome}: shot was not started`);
  let flight = engine.getSnapshot();
  assert.equal(flight.ballControl.state, "SHOT_FLIGHT", `${outcome}: ball not in shot flight`);
  assert(flight.ballControl.activeShot, `${outcome}: active shot missing`);
  engine.step(Math.max(2, shot.duration + 0.5));
  return { engine, before, report: engine.getReport(), snapshot: engine.getSnapshot() };
}

(function run() {
  const goal = runForced("GOAL");
  assert.equal(goal.report.score.home, 1, "goal did not update score");
  assert(goal.report.events.some(event => event.type === "GOAL_LINE_CROSSED"), "goal line crossing event missing");
  assert(goal.report.events.some(event => event.type === "GOAL"), "goal event missing");

  const held = runForced("SAVE_HOLD");
  assert.equal(held.report.away.stats.saves, 1, "held save not counted");
  assert.equal(held.report.away.stats.savesHeld, 1, "held-save detail not counted");
  assert.equal(held.snapshot.ballControl.state, "CONTROLLED", "keeper did not retain held save");
  assert.equal(held.snapshot.possessionSide, "away", "held save did not transfer possession");

  const parry = runForced("SAVE_PARRY_DANGER");
  assert.equal(parry.report.away.stats.savesParried, 1, "parried save not counted");
  assert(parry.report.events.some(event => event.type === "REBOUND"), "dangerous rebound event missing");

  const wideParry = runForced("SAVE_PARRY_WIDE");
  assert.equal(wideParry.report.away.stats.savesParried, 1, "wide parry not counted");
  assert(["RESTART", "CONTROLLED"].includes(wideParry.snapshot.ballControl.state), "wide parry did not create restart/control state");

  const post = runForced("POST", { targetY: 30.34, targetZ: 1.1 });
  assert.equal(post.report.home.stats.woodwork, 1, "woodwork not counted");
  assert(post.report.events.some(event => event.type === "WOODWORK"), "woodwork event missing");

  const block = runForced("BLOCK");
  assert.equal(block.report.home.stats.blocked, 1, "blocked shot not counted");
  assert(block.report.events.some(event => event.type === "SHOT_BLOCKED"), "block event missing");

  const miss = runForced("OFF_TARGET", { targetY: 25, targetZ: 3 });
  assert(miss.report.events.some(event => event.type === "SHOT_OFF_TARGET"), "off-target event missing");

  const deterministicA = core.createEngine(core.createDefaultConfig({ seed: "phase4-deterministic" }));
  const deterministicB = core.createEngine(core.createDefaultConfig({ seed: "phase4-deterministic" }));
  deterministicA.runFullMatch();
  deterministicB.runFullMatch();
  assert.deepStrictEqual(deterministicA.getReport().score, deterministicB.getReport().score, "same seed produced different score");
  assert.deepStrictEqual(deterministicA.getReport().home.stats, deterministicB.getReport().home.stats, "same seed produced different home stats");
  assert.deepStrictEqual(deterministicA.getReport().away.stats, deterministicB.getReport().away.stats, "same seed produced different away stats");

  const ids = deterministicA.getReport().events.map(event => event.id);
  assert.equal(new Set(ids).size, ids.length, "event IDs are not unique");

  console.log("V4 PHASE 4 SHOT + GOALKEEPER REGRESSION: PASS");
  console.log(JSON.stringify({
    goalScore: goal.report.score,
    heldSaveState: held.snapshot.ballControl.state,
    parryEvent: parry.report.events.find(event => event.type === "REBOUND")?.type,
    woodwork: post.report.home.stats.woodwork,
    blocked: block.report.home.stats.blocked,
    deterministicScore: deterministicA.getReport().score
  }, null, 2));
})();
