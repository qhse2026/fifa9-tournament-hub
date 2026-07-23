"use strict";

const path = require("path");
const core = require(path.resolve(__dirname, "..", "manager-match-engine-v4-core.js"));

const count = Math.max(1, Math.min(200, Number(process.argv[2] || 20)));
const totals = {
  goals: 0, shots: 0, onTarget: 0, blocked: 0, saves: 0, savesHeld: 0, savesParried: 0,
  woodwork: 0, xg: 0, xgot: 0, passesAttempted: 0, passesCompleted: 0, corners: 0
};
const scoreSamples = [];
for (let index = 0; index < count; index += 1) {
  const engine = core.createEngine(core.createDefaultConfig({ seed: `phase4-calibration-${index}` }));
  engine.runFullMatch();
  const report = engine.getReport();
  const pair = [report.home.stats, report.away.stats];
  totals.goals += report.score.home + report.score.away;
  for (const stats of pair) {
    for (const key of Object.keys(totals)) {
      if (key === "goals") continue;
      totals[key] += Number(stats[key] || 0);
    }
  }
  if (scoreSamples.length < 8) scoreSamples.push(`${report.score.home}-${report.score.away}`);
}
const averages = Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value / count * 100) / 100]));
averages.passAccuracy = averages.passesAttempted ? Math.round(averages.passesCompleted / averages.passesAttempted * 10000) / 100 : 0;
console.log("V4 PHASE 4 CALIBRATION");
console.log(JSON.stringify({ matches: count, averages, scoreSamples }, null, 2));
