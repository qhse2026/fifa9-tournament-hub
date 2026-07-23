'use strict';
const fs=require('node:fs');
const path=require('node:path');
require(path.resolve(__dirname,'..','manager-match-engine-v4-phase5.bundle.js'));
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const start=Number(process.argv[2]||0), count=Number(process.argv[3]||10), out=process.argv[4];
const total={matches:0,goals:0,shots:0,onTarget:0,xg:0,passesAttempted:0,passesCompleted:0,corners:0,cornerShots:0,cornerGoals:0,freeKicks:0,directFreeKicks:0,indirectFreeKicks:0,freeKickGoals:0,throwIns:0,penalties:0,penaltiesScored:0,setPieceShots:0,setPieceGoals:0,setPieceSecondBalls:0,aerialDuels:0,aerialDuelsWon:0,goalkeeperClaims:0,goalkeeperPunches:0,goalkeeperMissedClaims:0,clearances:0};
const scores=[];
for(let i=start;i<start+count;i++){
 const e=core.createEngine(core.createDefaultConfig({seed:`phase5-parallel-${i}`})); e.runFullMatch(); const r=e.getReport(); total.matches++; scores.push(`${r.score.home}-${r.score.away}`);
 for(const side of ['home','away']){const s=r[side].stats; total.goals+=s.goals;total.shots+=s.shots;total.onTarget+=s.onTarget;total.xg+=s.xg;total.passesAttempted+=s.passesAttempted;total.passesCompleted+=s.passesCompleted;total.corners+=s.corners;total.cornerShots+=s.cornerShots;total.cornerGoals+=s.cornerGoals;total.freeKicks+=s.freeKicks;total.directFreeKicks+=s.directFreeKicks;total.indirectFreeKicks+=s.indirectFreeKicks;total.freeKickGoals+=s.freeKickGoals;total.throwIns+=s.throwIns;total.penalties+=s.penaltiesTaken;total.penaltiesScored+=s.penaltiesScored;total.setPieceShots+=s.setPieceShots;total.setPieceGoals+=s.setPieceGoals;total.setPieceSecondBalls+=s.setPieceSecondBalls;total.aerialDuels+=s.aerialDuels;total.aerialDuelsWon+=s.aerialDuelsWon;total.goalkeeperClaims+=s.goalkeeperClaims;total.goalkeeperPunches+=s.goalkeeperPunches;total.goalkeeperMissedClaims+=s.goalkeeperMissedClaims;total.clearances+=s.clearances;}
}
fs.writeFileSync(out,JSON.stringify({total,scores}));
