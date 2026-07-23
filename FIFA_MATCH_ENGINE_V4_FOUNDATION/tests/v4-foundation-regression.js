const assert = require("assert");
const path = require("path");
const core = require(path.join(__dirname, "..", "manager-match-engine-v4-core.js"));

function runOne(seed, overrides = {}) {
  const engine = core.createEngine(core.createDefaultConfig({ seed, ...overrides }));
  engine.runFullMatch();
  return engine.getReport();
}

const deterministicA = runOne("deterministic-seed");
const deterministicB = runOne("deterministic-seed");
assert.deepStrictEqual(deterministicA.score, deterministicB.score, "Same seed must produce same score");
assert.strictEqual(deterministicA.home.stats.shots, deterministicB.home.stats.shots, "Same seed must produce same home shots");
assert.strictEqual(deterministicA.away.stats.shots, deterministicB.away.stats.shots, "Same seed must produce same away shots");

const snapshotEngine = core.createEngine(core.createDefaultConfig({ seed: "snapshot-test" }));
const observedIntents = new Set();
let snapshot = snapshotEngine.getSnapshot();
for (let second = 60; second <= 1800; second += 60) {
  snapshotEngine.runTo(second);
  snapshot = snapshotEngine.getSnapshot();
  snapshot.teams.home.players.filter(player => ["FB", "WB"].includes(player.group)).forEach(player => observedIntents.add(player.intent));
}
assert.strictEqual(snapshot.teams.home.players.length, 11, "Home must have 11 players");
assert.strictEqual(snapshot.teams.away.players.length, 11, "Away must have 11 players");
assert.ok(["OVERLAP", "UNDERLAP_SUPPORT", "REST_DEFENCE", "TRACK_CHANNEL", "COMPACT_BLOCK"].some(intent => observedIntents.has(intent)), "Fullback tactical intent must be observed");
assert.ok(Number.isFinite(snapshot.restDefence.home), "Rest defence metric must exist");
assert.ok(snapshot.teams.home.players.find(player => player.group === "GK").goalkeeperArchetype, "Goalkeeper archetype must exist");

const reports = [];
for (let index = 0; index < 40; index += 1) reports.push(runOne(`balance-${index}`));
const averages = reports.reduce((memo, report) => {
  memo.goals += report.score.home + report.score.away;
  memo.shots += report.home.stats.shots + report.away.stats.shots;
  memo.corners += report.home.stats.corners + report.away.stats.corners;
  memo.passes += report.home.stats.passesAttempted + report.away.stats.passesAttempted;
  memo.completedPasses += report.home.stats.passesCompleted + report.away.stats.passesCompleted;
  memo.crosses += report.home.stats.crossesAttempted + report.away.stats.crossesAttempted;
  memo.carries += report.home.stats.carries + report.away.stats.carries;
  return memo;
}, { goals: 0, shots: 0, corners: 0, passes: 0, completedPasses: 0, crosses: 0, carries: 0 });
Object.keys(averages).forEach(key => averages[key] = Math.round(averages[key] / reports.length * 100) / 100);

assert.ok(averages.goals >= 1.1 && averages.goals <= 4.2, `Goals average out of broad foundation range: ${averages.goals}`);
assert.ok(averages.shots >= 14 && averages.shots <= 38, `Shots average out of broad foundation range: ${averages.shots}`);
assert.ok(averages.passes >= 700 && averages.passes <= 1450, `Pass volume outside foundation range: ${averages.passes}`);
assert.ok(averages.crosses >= 5 && averages.crosses <= 50, `Cross volume outside foundation range: ${averages.crosses}`);

const cornerEvents = reports.flatMap(report => report.events).filter(event => event.type === "CORNER_TAKEN");
assert.ok(cornerEvents.length > 0, "Corner routines must occur in calibration set");
assert.ok(cornerEvents.some(event => event.assignments?.primary && Array.isArray(event.assignments?.rest)), "Corner assignment data must include primary target and rest defence players");

console.log("MATCH ENGINE V4 FOUNDATION REGRESSION: PASS");
console.log(JSON.stringify({ matches: reports.length, averages, deterministicScore: deterministicA.score, cornerEvents: cornerEvents.length }, null, 2));
