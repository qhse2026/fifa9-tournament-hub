'use strict';
const fs=require('node:fs');
const path=require('node:path');
require(path.resolve(__dirname,'..','manager-match-engine-v4-phase6.bundle.js'));
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const start=Number(process.argv[2]||0), count=Number(process.argv[3]||5), out=process.argv[4];
const keys=['goals','shots','onTarget','blocked','xg','passesAttempted','passesCompleted','offsides','pressures','successfulPressures','pressureRegains','forcedTurnovers','forcedErrors','doubleTeams','passingLanesBlocked','counterPressRegains','transitionDelays','offsideTraps','offsidesWon','cutbacksDefended','boxEntriesDenied','defensiveLineBreaks','tacklesAttempted','tacklesWon','interceptions','corners','setPieceGoals'];
const total={matches:0,homeGoals:0,awayGoals:0}; for(const k of keys) total[k]=0;
const scores=[];
for(let i=start;i<start+count;i++){
  const e=core.createEngine(core.createDefaultConfig({seed:`phase6-parallel-${i}`}));
  e.runFullMatch(); const r=e.getReport(); total.matches++; total.homeGoals+=r.score.home; total.awayGoals+=r.score.away; scores.push(`${r.score.home}-${r.score.away}`);
  for(const side of ['home','away']){const s=r[side].stats; for(const k of keys) total[k]+=Number(s[k]||0);}
}
fs.writeFileSync(out,JSON.stringify({total,scores}));
