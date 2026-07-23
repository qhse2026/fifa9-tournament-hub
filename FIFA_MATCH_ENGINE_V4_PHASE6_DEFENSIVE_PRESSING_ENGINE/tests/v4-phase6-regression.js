'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const bundle = path.resolve(__dirname, '..', 'manager-match-engine-v4-phase6.bundle.js');
require(bundle);
const core = globalThis.FIFA_MATCH_ENGINE_V4;

function make(seed, overrides = {}) {
  return core.createEngine(core.createDefaultConfig({ seed, ...overrides }));
}
function byGroup(snapshot, side, group, index = 0) {
  return snapshot.teams[side].players.filter(p => p.group === group)[index];
}
function events(engine, type) { return engine.getReport().events.filter(e => e.type === type); }
function advance(engine, seconds = 4) { for (let i = 0; i < seconds * 10; i++) engine.step(.1); }

assert.equal(core.VERSION, '4.0.0-phase6.1');
assert.equal(core.DEFENSIVE_PRESSING_VERSION, 6);
assert.ok(core.PRESSING_TRIGGERS.includes('TOUCHLINE'));

// Determinism.
const detA = make('phase6-determinism'); detA.runFullMatch();
const detB = make('phase6-determinism'); detB.runFullMatch();
assert.deepEqual(detA.getReport().score, detB.getReport().score);
assert.deepEqual(detA.getReport().home.stats, detB.getReport().home.stats);
assert.deepEqual(detA.getReport().away.stats, detB.getReport().away.stats);

// Touchline trap and double-team staging.
const press = make('phase6-touchline', {
  home: { tactics: { outPossession: 'high-press', pressing: 88, lossTransition: 'counterpress' } }
});
let snap = press.getSnapshot();
const awayWing = byGroup(snap, 'away', 'WING', 0);
const homeFb = byGroup(snap, 'home', 'FB', 0);
const homeCm = byGroup(snap, 'home', 'CM', 0);
press.debugSetPlayerPosition(awayWing.id, { x: 58, y: 3 });
press.debugSetPlayerPosition(homeFb.id, { x: 55, y: 5 });
press.debugSetPlayerPosition(homeCm.id, { x: 58, y: 9 });
press.debugSetBallOwner(awayWing.id, 'HEAVY_FIRST_TOUCH');
snap = press.debugRefreshDefence();
assert.equal(snap.defensiveAI.home.active, true);
assert.equal(snap.defensiveAI.home.trap, 'TOUCHLINE');
assert.ok(snap.defensiveAI.home.primaryPresserId);
assert.equal(snap.defensiveAI.home.doubleTeam, true);
assert.ok(snap.teams.home.players.some(p => ['PRESS_BALL','DOUBLE_TEAM','COVER_PRESS'].includes(p.intent)));

// Passing shadow is exposed and affects a real pass action.
const shadowTargetId = snap.defensiveAI.home.shadowTargetId;
assert.ok(shadowTargetId);
const shadowTarget = snap.teams.away.players.find(p => p.id === shadowTargetId);
press.debugStartPass(awayWing.id, shadowTarget.id, { outcome: 'TEAMMATE', ignoreOffside: true });
snap = press.getSnapshot();
assert.equal(snap.ballControl.state, 'IN_FLIGHT');
assert.ok(snap.ballControl.activeAction.shadowPenalty >= 0);

// Forced offside increments both attacking and defending official counters.
const offside = make('phase6-offside');
snap = offside.getSnapshot();
const homeCm2 = byGroup(snap, 'home', 'CM', 0);
const homeSt = byGroup(snap, 'home', 'ST', 0);
offside.debugSetBallOwner(homeCm2.id);
offside.debugStartPass(homeCm2.id, homeSt.id, { forceOffside: true });
assert.equal(events(offside, 'OFFSIDE').length, 1);
assert.equal(offside.getReport().home.stats.offsides, 1);
assert.equal(offside.getReport().away.stats.offsidesWon, 1);

// Counter-press regain inside the configured recovery window.
const counter = make('phase6-counterpress', {
  home: { tactics: { lossTransition: 'counterpress', counterPressWindow: 6, pressing: 78, outPossession: 'high-press' } }
});
snap = counter.getSnapshot();
const homeDm = byGroup(snap, 'home', 'DM', 0);
const awayDm = byGroup(snap, 'away', 'DM', 0);
counter.debugSetBallOwner(homeDm.id);
counter.debugChangePossession(awayDm.id, 'TEST_LOSS');
advance(counter, 1.5);
counter.debugChangePossession(homeDm.id, 'TEST_REGAIN');
assert.equal(counter.getReport().home.stats.counterPressRegains, 1);
assert.equal(events(counter, 'COUNTER_PRESS_REGAIN').length, 1);

// Cutback defence shape: stop cross, protect near post, screen cutback lane.
const cutback = make('phase6-cutback', {
  home: { tactics: { outPossession: 'mid-block', pressing: 72, boxDefence: 'hybrid' } }
});
snap = cutback.getSnapshot();
const awayWide = byGroup(snap, 'away', 'WING', 0);
cutback.debugSetPlayerPosition(awayWide.id, { x: 9, y: 3 }); // away attacks toward x=0
cutback.debugSetBallOwner(awayWide.id, 'CARRY');
snap = cutback.debugRefreshDefence();
assert.equal(snap.defensiveAI.home.cutbackThreat, true);
const intents = new Set(snap.teams.home.players.map(p => p.intent));
assert.ok(intents.has('STOP_CROSS'));
assert.ok(intents.has('CUTBACK_SCREEN'));
assert.ok(intents.has('PROTECT_NEAR_POST') || intents.has('MARK_CENTRE'));

// Structured press regain through a forced interception by the primary presser.
const regain = make('phase6-regain', {
  home: { tactics: { outPossession: 'high-press', pressing: 90, lossTransition: 'counterpress' } }
});
snap = regain.getSnapshot();
const owner = byGroup(snap, 'away', 'WING', 0);
const receiver = byGroup(snap, 'away', 'CM', 0) || byGroup(snap, 'away', 'DM', 0);
regain.debugSetPlayerPosition(owner.id, { x: 60, y: 3 });
regain.debugSetBallOwner(owner.id, 'HEAVY_FIRST_TOUCH');
snap = regain.debugRefreshDefence();
const primaryId = snap.defensiveAI.home.primaryPresserId;
assert.ok(primaryId);
regain.debugStartPass(owner.id, receiver.id, { outcome: 'INTERCEPTION', interceptorId: primaryId, ignoreOffside: true });
advance(regain, 4);
assert.ok(regain.getReport().home.stats.pressureRegains >= 1);
assert.ok(regain.getReport().home.stats.successfulPressures >= 1);
assert.ok(events(regain, 'PASS_INTERCEPTED').length >= 1);

// Defensive line leadership is present in the snapshot.
const line = make('phase6-line', {
  home: { tactics: { outPossession: 'high-press', pressing: 90, offsideTrap: true } }
});
snap = line.getSnapshot();
const awayCb = byGroup(snap, 'away', 'CB', 0);
line.debugSetBallOwner(awayCb.id, 'HEAVY_FIRST_TOUCH');
snap = line.debugRefreshDefence();
assert.ok(snap.defensiveAI.home.leaderId);
assert.ok(Number.isFinite(snap.defensiveAI.home.lineX));
assert.ok(snap.teams.home.players.some(p => ['LEAD_DEFENSIVE_LINE','HOLD_OFFSIDE_LINE','PRESS_BALL'].includes(p.intent)));

console.log(JSON.stringify({
  status: 'PASS',
  version: core.VERSION,
  tests: 8,
  touchlineTrap: 'TOUCHLINE',
  pressingTriggers: core.PRESSING_TRIGGERS
}, null, 2));
