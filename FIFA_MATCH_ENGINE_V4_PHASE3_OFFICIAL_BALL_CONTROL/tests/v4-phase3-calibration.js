"use strict";

const assert = require("assert");
const core = require("../manager-match-engine-v4-core.js");

const count = Math.max(4, Math.min(100, Number(process.argv[2] || 20)));
const totals = {
  goals: 0, shots: 0, corners: 0, passesAttempted: 0, passesCompleted: 0,
  badTouches: 0, looseBalls: 0, secondBallsWon: 0, interceptions: 0,
  recoveries: 0, turnovers: 0, crosses: 0
};
const samples = [];

for (let index = 0; index < count; index += 1) {
  const engine = core.createEngine(core.createDefaultConfig({ seed: `phase3-calibration-${index}` }));
  engine.runFullMatch();
  const report = engine.getReport();
  const home = report.home.stats;
  const away = report.away.stats;
  const add = key => Number(home[key] || 0) + Number(away[key] || 0);
  totals.goals += report.score.home + report.score.away;
  totals.shots += add("shots");
  totals.corners += add("corners");
  totals.passesAttempted += add("passesAttempted");
  totals.passesCompleted += add("passesCompleted");
  totals.badTouches += add("badTouches");
  totals.looseBalls += add("looseBalls");
  totals.secondBallsWon += add("secondBallsWon");
  totals.interceptions += add("interceptions");
  totals.recoveries += add("recoveries");
  totals.turnovers += add("turnovers");
  totals.crosses += add("crossesAttempted");
  if (samples.length < 5) samples.push({ score: report.score, shots: add("shots"), passes: add("passesAttempted"), accuracy: add("passesAttempted") ? Math.round(add("passesCompleted") / add("passesAttempted") * 100) : 0 });
}

const averages = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value / count * 100) / 100]));
averages.passAccuracy = Math.round(totals.passesCompleted / totals.passesAttempted * 10000) / 100;

assert(averages.goals >= 1.4 && averages.goals <= 3.8, `goal average out of range: ${averages.goals}`);
assert(averages.shots >= 20 && averages.shots <= 38, `shot average out of range: ${averages.shots}`);
assert(averages.passesAttempted >= 780 && averages.passesAttempted <= 1200, `pass volume out of range: ${averages.passesAttempted}`);
assert(averages.passAccuracy >= 76 && averages.passAccuracy <= 90, `pass accuracy out of range: ${averages.passAccuracy}`);
assert(averages.badTouches >= 20 && averages.badTouches <= 100, `bad-touch average out of range: ${averages.badTouches}`);
assert(averages.interceptions >= 20 && averages.interceptions <= 90, `interception average out of range: ${averages.interceptions}`);

const first = core.createEngine(core.createDefaultConfig({ seed: "phase3-determinism" }));
const second = core.createEngine(core.createDefaultConfig({ seed: "phase3-determinism" }));
first.runFullMatch();
second.runFullMatch();
const firstReport = first.getReport();
const secondReport = second.getReport();
assert.deepStrictEqual(firstReport.score, secondReport.score, "same seed produced different score");
assert.deepStrictEqual(firstReport.home.stats, secondReport.home.stats, "same seed produced different home stats");
assert.deepStrictEqual(firstReport.away.stats, secondReport.away.stats, "same seed produced different away stats");

console.log("V4 PHASE 3 CALIBRATION: PASS");
console.log(JSON.stringify({ matches: count, averages, deterministic: true, samples }, null, 2));
