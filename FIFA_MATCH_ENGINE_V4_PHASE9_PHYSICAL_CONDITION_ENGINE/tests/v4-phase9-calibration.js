require("../manager-match-engine-v4-phase9.bundle.js");
const core = globalThis.FIFA_MATCH_ENGINE_V4;
const rows = [];
for (let i = 0; i < 30; i++) {
  const engine = core.createEngine(core.createDefaultConfig({ seed: `phase9-cal-${i}` }));
  engine.runFullMatch();
  const s = engine.getSnapshot();
  rows.push({
    score: s.score,
    home: s.teams.home,
    away: s.teams.away
  });
}
const avg = fn => rows.reduce((sum, row) => sum + fn(row), 0) / rows.length;
const result = {
  matches: rows.length,
  averages: {
    goals: avg(r => r.score.home + r.score.away),
    shots: avg(r => r.home.stats.shots + r.away.stats.shots),
    passAccuracy: avg(r => {
      const attempted = r.home.stats.passesAttempted + r.away.stats.passesAttempted;
      const completed = r.home.stats.passesCompleted + r.away.stats.passesCompleted;
      return attempted ? completed / attempted * 100 : 0;
    }),
    finalEnergy: avg(r => (r.home.physical.averageEnergy + r.away.physical.averageEnergy) / 2),
    finalFatigue: avg(r => (r.home.physical.averageFatigue + r.away.physical.averageFatigue) / 2),
    distanceKm: avg(r => (r.home.stats.totalDistance + r.away.stats.totalDistance) / 1000),
    sprintKm: avg(r => (r.home.stats.sprintDistance + r.away.stats.sprintDistance) / 1000),
    highIntensityRuns: avg(r => r.home.stats.highIntensityRuns + r.away.stats.highIntensityRuns),
    fatigueWarnings: avg(r => r.home.stats.fatigueWarnings + r.away.stats.fatigueWarnings),
    cramps: avg(r => r.home.stats.cramps + r.away.stats.cramps),
    knocks: avg(r => r.home.stats.knocks + r.away.stats.knocks),
    muscleTightness: avg(r => r.home.stats.muscleTightness + r.away.stats.muscleTightness),
    seriousInjuries: avg(r =>
      r.home.stats.muscleInjuries + r.away.stats.muscleInjuries +
      r.home.stats.contactInjuries + r.away.stats.contactInjuries
    ),
    injurySubstitutions: avg(r => r.home.stats.injurySubstitutions + r.away.stats.injurySubstitutions)
  },
  samples: rows.slice(0, 5).map(r => ({
    score: r.score,
    homeEnergy: r.home.physical.averageEnergy,
    awayEnergy: r.away.physical.averageEnergy,
    homeFatigue: r.home.physical.averageFatigue,
    awayFatigue: r.away.physical.averageFatigue
  }))
};
console.log(JSON.stringify(result, null, 2));
