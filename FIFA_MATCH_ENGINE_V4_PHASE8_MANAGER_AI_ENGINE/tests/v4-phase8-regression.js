'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
require(path.resolve(__dirname, '..', 'manager-match-engine-v4-phase8.bundle.js'));
const core = globalThis.FIFA_MATCH_ENGINE_V4;
function make(seed, overrides={}) { return core.createEngine(core.createDefaultConfig({ seed, ...overrides })); }
function firstOutfield(snapshot, side='home') { return snapshot.teams[side].players.find(p=>p.group!=='GK' && !p.hasBall); }

assert.equal(core.VERSION, '4.0.0-phase8.1');
assert.equal(core.MANAGER_AI_VERSION, 8);
assert.ok(core.MANAGER_PLANS.ALL_OUT);

// Determinism includes manager decisions and substitutions.
const a = make('p8-deterministic', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
a.runFullMatch();
const b = make('p8-deterministic', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
b.runFullMatch();
assert.deepEqual(a.getReport().score, b.getReport().score);
assert.deepEqual(a.getReport().managerAI, b.getReport().managerAI);
assert.deepEqual(a.getReport().home.stats, b.getReport().home.stats);

// Human-controlled side gets recommendation only.
let e = make('p8-human', { home:{managerControl:'HUMAN'}, away:{managerControl:'AI'} });
e.debugSetScore(0, 1);
e.runTo(80*60);
let human = e.reviewManager('home', true);
assert.equal(human.control, 'HUMAN');
assert.ok(human.recommendations.length >= 1);
assert.equal(e.getReport().home.stats.tacticalChanges, 0);
assert.ok(e.getReport().home.stats.aiRecommendations >= 1);

// AI chases a late deficit.
e = make('p8-chase', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
e.runTo(79*60);
e.debugSetScore(0, 1);
let decision = e.reviewManager('home', true);
assert.equal(decision.currentPlan, 'DIRECT_ATTACK');
assert.ok(decision.tactics.risk >= 70);
assert.ok(decision.tactics.passingDirectness >= 75);

// AI protects a late lead.
e = make('p8-protect', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
e.runTo(83*60);
e.debugSetScore(2, 1);
decision = e.reviewManager('home', true);
assert.equal(decision.currentPlan, 'PROTECT_LEAD');
assert.equal(decision.tactics.outPossession, 'low-block');
assert.ok(decision.timeWasting >= 60);

// Fatigue substitution uses a compatible bench player.
e = make('p8-fatigue', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
e.runTo(56*60);
let snap = e.getSnapshot();
let tired = firstOutfield(snap, 'home');
e.debugSetPlayerEnergy(tired.id, 42);
const beforeName = e.getSnapshot().teams.home.players.find(p=>p.id===tired.id).name;
e.reviewManager('home', true);
const afterName = e.getSnapshot().teams.home.players.find(p=>p.id===tired.id).name;
assert.notEqual(afterName, beforeName);
assert.ok(e.getReport().home.stats.substitutions >= 1);
assert.ok(e.getReport().home.stats.fatigueSubstitutions >= 1);

// Card-risk substitution prioritizes a booked defender.
e = make('p8-card', { home:{managerControl:'HUMAN'}, away:{managerControl:'AI'} });
e.runTo(61*60);
e.setManagerControl('home','AI');
snap = e.getSnapshot();
const defender = snap.teams.home.players.find(p=>['CB','FB','WB','DM'].includes(p.group) && !p.hasBall);
e.debugSetPlayerYellow(defender.id, true);
e.debugSetPlayerEnergy(defender.id, 70);
e.reviewManager('home', true);
assert.ok(e.getReport().home.stats.cardRiskSubstitutions >= 1);

// Emergency mode sends an aerial defender forward.
e = make('p8-emergency', { home:{managerControl:'AI'}, away:{managerControl:'AI'} });
e.runTo(87*60);
e.debugSetScore(0, 1);
decision = e.reviewManager('home', true);
assert.equal(decision.currentPlan, 'ALL_OUT');
assert.equal(decision.emergencyMode, true);
assert.ok(e.getSnapshot().teams.home.emergencyTargetId);
assert.ok(e.getReport().home.stats.emergencyMoves >= 1);

// Manual API applies a plan and a substitution safely.
e = make('p8-manual', { home:{managerControl:'HUMAN'}, away:{managerControl:'AI'} });
const plan = e.applyTacticalPlan('home', 'HIGH_PRESS', 'USER_TEST');
assert.equal(plan.currentPlan, 'HIGH_PRESS');
snap = e.getSnapshot();
const out = firstOutfield(snap, 'home');
const inc = snap.managerAI.home.bench.find(row=>row.group===out.group) || snap.managerAI.home.bench[0];
const sub = e.makeSubstitution('home', out.id, inc.id, 'MANUAL_SUBSTITUTION');
assert.ok(sub);
assert.equal(e.getReport().home.stats.substitutions, 1);

// Snapshot/report contracts expose manager state.
e.runTo(900);
snap = e.getSnapshot();
const report = e.getReport();
assert.ok(snap.managerAI.home && snap.managerAI.away);
assert.ok(Array.isArray(report.managerAI.home.history));
assert.ok('managerReviews' in report.home.stats);

console.log(JSON.stringify({ status:'PASS', version:core.VERSION, tests:9, plans:Object.keys(core.MANAGER_PLANS).length }, null, 2));
