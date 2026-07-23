'use strict';
const path=require('node:path');
require(path.resolve(__dirname,'..','manager-match-engine-v4-phase8.bundle.js'));
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const matches=12;
const totals={goals:0,shots:0,onTarget:0,xg:0,passes:0,completed:0,corners:0,managerReviews:0,tacticalChanges:0,subs:0,fatigueSubs:0,cardSubs:0,tacticalSubs:0,emergencyMoves:0,timeWasting:0,recommendations:0};
const planCounts={};
const samples=[];
for(let i=0;i<matches;i++){
 const e=core.createEngine(core.createDefaultConfig({seed:`phase8-cal-${i}`,home:{managerControl:'AI'},away:{managerControl:'AI'}}));
 e.runFullMatch(); const r=e.getReport();
 const sides=[r.home.stats,r.away.stats];
 totals.goals+=r.score.home+r.score.away;
 for(const s of sides){ totals.shots+=s.shots; totals.onTarget+=s.onTarget; totals.xg+=s.xg; totals.passes+=s.passesAttempted; totals.completed+=s.passesCompleted; totals.corners+=s.corners; totals.managerReviews+=s.managerReviews; totals.tacticalChanges+=s.tacticalChanges; totals.subs+=s.substitutions; totals.fatigueSubs+=s.fatigueSubstitutions; totals.cardSubs+=s.cardRiskSubstitutions; totals.tacticalSubs+=s.tacticalSubstitutions; totals.emergencyMoves+=s.emergencyMoves; totals.timeWasting+=s.timeWastingSeconds; totals.recommendations+=s.aiRecommendations; }
 for(const side of ['home','away']) { const p=r.managerAI[side].currentPlan; planCounts[p]=(planCounts[p]||0)+1; }
 if(i<5) samples.push({score:r.score,homePlan:r.managerAI.home.currentPlan,awayPlan:r.managerAI.away.currentPlan,homeSubs:r.home.stats.substitutions,awaySubs:r.away.stats.substitutions});
}
const avg={}; for(const [k,v] of Object.entries(totals)) avg[k]=Math.round(v/matches*100)/100;
avg.passAccuracy=Math.round(totals.completed/Math.max(1,totals.passes)*10000)/100;
console.log(JSON.stringify({version:core.VERSION,matches,averages:avg,finalPlanCounts:planCounts,samples},null,2));
