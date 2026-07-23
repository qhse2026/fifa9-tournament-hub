'use strict';
const assert = require('node:assert/strict');
const bundle = require('node:path').resolve(__dirname, '..', 'manager-match-engine-v4-phase5.bundle.js');
require(bundle);
const core = globalThis.FIFA_MATCH_ENGINE_V4;

function engine(seed, overrides={}) {
  return core.createEngine(core.createDefaultConfig({ seed, ...overrides }));
}
function events(e, type) { return e.getReport().events.filter(row => row.type === type); }
function advanceUntil(e, predicate, maxSeconds=12) {
  for (let i=0;i<maxSeconds*10;i++) { if (predicate()) return true; e.step(.1); }
  return predicate();
}

assert.equal(core.VERSION, '4.0.0-phase5.1');
assert.equal(core.SET_PIECE_AERIAL_VERSION, 5);
assert.ok(Array.isArray(core.SET_PIECE_ROUTINES.corner));

// Determinism.
const a = engine('determinism-5'); a.runFullMatch();
const b = engine('determinism-5'); b.runFullMatch();
assert.deepEqual(a.getReport().score, b.getReport().score);
assert.deepEqual(a.getReport().home.stats, b.getReport().home.stats);
assert.deepEqual(a.getReport().away.stats, b.getReport().away.stats);

// Near-post corner staging and physical flight.
const corner = engine('corner-near'); corner.runTo(10);
corner.debugStartSetPiece('CORNER', 'home', { routine:'near-post', y:0 });
let snap = corner.getSnapshot();
assert.equal(snap.ballControl.state, 'SET_PIECE_FLIGHT');
assert.equal(snap.ballControl.activeSetPiece.type, 'CORNER');
assert.equal(snap.ballControl.setPiece.routine, 'near-post');
assert.equal(snap.phase, 'SET_PIECE');
assert.ok(Object.keys(snap.ballControl.setPiece.assignments).length >= 6);

// Short corner becomes a real pass, not a direct event jump.
const shortCorner = engine('corner-short'); shortCorner.runTo(10);
shortCorner.debugStartSetPiece('CORNER', 'home', { routine:'short', y:68 });
snap = shortCorner.getSnapshot();
assert.equal(snap.ballControl.state, 'IN_FLIGHT');
assert.ok(events(shortCorner, 'SHORT_CORNER_TAKEN').length === 1);

// Direct free kick starts official shot flight and updates set-piece shot stats.
const dfk = engine('direct-fk'); dfk.runTo(10);
dfk.debugStartSetPiece('DIRECT_FREE_KICK', 'home', { distance:22, y:34 });
snap = dfk.getSnapshot();
assert.equal(snap.ballControl.state, 'SHOT_FLIGHT');
assert.equal(snap.ballControl.activeShot.source, 'DIRECT_FREE_KICK');
assert.equal(dfk.getReport().home.stats.directFreeKicks, 1);
assert.equal(dfk.getReport().home.stats.setPieceShots, 1);

// Indirect free kick creates organized aerial delivery.
const ifk = engine('indirect-fk'); ifk.runTo(10);
ifk.debugStartSetPiece('INDIRECT_FREE_KICK', 'home', { routine:'far-post', distance:27, y:20 });
snap = ifk.getSnapshot();
assert.equal(snap.ballControl.state, 'SET_PIECE_FLIGHT');
assert.equal(snap.ballControl.activeSetPiece.type, 'INDIRECT_FREE_KICK');
assert.equal(snap.ballControl.setPiece.routine, 'far-post');

// Long throw uses the set-piece aerial engine.
const longThrow = engine('long-throw'); longThrow.runTo(10);
longThrow.debugStartSetPiece('THROW_IN', 'home', { routine:'long-throw', x:78, y:.5 });
snap = longThrow.getSnapshot();
assert.equal(snap.ballControl.state, 'SET_PIECE_FLIGHT');
assert.equal(snap.ballControl.activeSetPiece.type, 'THROW_IN');
assert.equal(longThrow.getReport().home.stats.throwIns, 1);

// Penalty is an official high-xG shot without a wall blocker.
const penalty = engine('penalty'); penalty.runTo(10);
penalty.debugStartSetPiece('PENALTY', 'home', {});
snap = penalty.getSnapshot();
assert.equal(snap.ballControl.state, 'SHOT_FLIGHT');
assert.equal(snap.ballControl.activeShot.source, 'PENALTY');
assert.ok(snap.ballControl.activeShot.xg >= .74);
assert.equal(snap.ballControl.activeShot.blockerId, null);
assert.equal(penalty.getReport().home.stats.penaltiesTaken, 1);

// Forced set-piece goal updates official set-piece scoring counters.
const forced = engine('forced-set-piece-goal'); forced.runTo(10);
const striker = forced.getSnapshot().teams.home.players.find(p => p.group === 'ST');
forced.debugStartShot(striker.id, { source:'PENALTY', forceOutcome:'GOAL', targetY:34, targetZ:1, shotType:'PLACED' });
advanceUntil(forced, () => events(forced, 'GOAL').length > 0, 3);
assert.equal(forced.getReport().home.stats.setPieceGoals, 1);
assert.equal(forced.getReport().home.stats.penaltiesScored, 1);

// Across deterministic corner samples, at least three distinct defensive/attacking outcomes occur.
const outcomes = new Set();
for (let i=0;i<32;i++) {
  const e = engine(`corner-outcome-${i}`); e.runTo(10);
  e.debugStartSetPiece('CORNER', 'home', { routine:['near-post','far-post','crowd-keeper','edge'][i%4], y:i%2?68:0 });
  e.step(4);
  const final = e.getReport().events.findLast(row => ['AERIAL_DUEL_WON','SET_PIECE_CLEARED','GOALKEEPER_CLAIM','GOALKEEPER_PUNCH','SET_PIECE_SCRAMBLE'].includes(row.type));
  if (final) outcomes.add(final.type);
}
assert.ok(outcomes.size >= 3, `Expected at least 3 corner outcomes, got ${[...outcomes].join(', ')}`);

// Cross-commanding goalkeeper must show a proactive intervention in a deterministic sample set.
let proactive = false;
for (let i=0;i<30 && !proactive;i++) {
  const cfg = core.createDefaultConfig({ seed:`cross-commander-${i}` });
  cfg.away.goalkeeperArchetype = 'cross-commander';
  const e = core.createEngine(cfg); e.runTo(10); e.debugStartSetPiece('CORNER','home',{routine:'crowd-keeper'}); e.step(4);
  proactive = events(e,'GOALKEEPER_CLAIM').length + events(e,'GOALKEEPER_PUNCH').length > 0;
}
assert.equal(proactive, true);

console.log(JSON.stringify({
  status:'PASS',
  version:core.VERSION,
  tests:11,
  sampledCornerOutcomes:[...outcomes].sort()
}, null, 2));
