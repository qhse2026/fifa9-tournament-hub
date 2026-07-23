'use strict';
const path = require('node:path');
require(path.resolve(__dirname, '..', 'manager-match-engine-v4-phase5.bundle.js'));
const core = globalThis.FIFA_MATCH_ENGINE_V4;
const matches = Number(process.argv[2] || 20);
const total = {
  goals:0, shots:0, onTarget:0, xg:0, passesAttempted:0, passesCompleted:0,
  corners:0, cornerShots:0, cornerGoals:0,
  freeKicks:0, directFreeKicks:0, indirectFreeKicks:0, freeKickGoals:0,
  throwIns:0, penalties:0, penaltiesScored:0,
  setPieceShots:0, setPieceGoals:0, setPieceSecondBalls:0,
  aerialDuels:0, aerialDuelsWon:0, goalkeeperClaims:0, goalkeeperPunches:0,
  goalkeeperMissedClaims:0, clearances:0
};
const scorelines=[];
for(let i=0;i<matches;i++){
  const e=core.createEngine(core.createDefaultConfig({seed:`phase5-calibration-${i}`}));
  e.runFullMatch();
  const r=e.getReport(); scorelines.push(`${r.score.home}-${r.score.away}`);
  for(const side of ['home','away']){
    const s=r[side].stats;
    total.goals+=s.goals; total.shots+=s.shots; total.onTarget+=s.onTarget; total.xg+=s.xg;
    total.passesAttempted+=s.passesAttempted; total.passesCompleted+=s.passesCompleted;
    total.corners+=s.corners; total.cornerShots+=s.cornerShots; total.cornerGoals+=s.cornerGoals;
    total.freeKicks+=s.freeKicks; total.directFreeKicks+=s.directFreeKicks; total.indirectFreeKicks+=s.indirectFreeKicks; total.freeKickGoals+=s.freeKickGoals;
    total.throwIns+=s.throwIns; total.penalties+=s.penaltiesTaken; total.penaltiesScored+=s.penaltiesScored;
    total.setPieceShots+=s.setPieceShots; total.setPieceGoals+=s.setPieceGoals; total.setPieceSecondBalls+=s.setPieceSecondBalls;
    total.aerialDuels+=s.aerialDuels; total.aerialDuelsWon+=s.aerialDuelsWon;
    total.goalkeeperClaims+=s.goalkeeperClaims; total.goalkeeperPunches+=s.goalkeeperPunches; total.goalkeeperMissedClaims+=s.goalkeeperMissedClaims; total.clearances+=s.clearances;
  }
}
const average={};
for(const [key,value] of Object.entries(total)) average[key]=Math.round(value/matches*100)/100;
average.passAccuracy = Math.round(total.passesCompleted/Math.max(1,total.passesAttempted)*10000)/100;
average.setPieceGoalShare = Math.round(total.setPieceGoals/Math.max(1,total.goals)*10000)/100;
average.aerialWinRate = Math.round(total.aerialDuelsWon/Math.max(1,total.aerialDuels)*10000)/100;
console.log(JSON.stringify({version:core.VERSION,matches,average,sampleScorelines:scorelines.slice(0,10)},null,2));
