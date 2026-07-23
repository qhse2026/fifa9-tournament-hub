require('../manager-match-engine-v4-phase12.bundle.js');
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const rows=[];
for(let i=0;i<8;i++){
  const e=core.createEngine(core.createDefaultConfig({seed:`phase12-cal-${i}`,matchId:`phase12-cal-${i}`}));
  e.runFullMatch();
  const r=e.getReport(),a=r.analysis;
  rows.push({
    score:r.score,
    goals:r.score.home+r.score.away,
    shots:a.shotMap.length,
    xg:a.teams.home.xg+a.teams.away.xg,
    xgot:a.teams.home.xgot+a.teams.away.xgot,
    xt:a.teams.home.xt+a.teams.away.xt,
    passes:a.passMap.length,
    completed:a.passMap.filter(x=>x.completed).length,
    progressive:a.passMap.filter(x=>x.completed&&x.progressive).length,
    keyPasses:a.teams.home.keyPasses+a.teams.away.keyPasses,
    carries:a.carryMap.length,
    chains:a.possessionChains.length,
    timeline:a.timeline.length,
    replayFrames:a.replayArchive.frameCount,
    replayClips:a.replayArchive.clips.length,
    topRating:a.players[0]?.rating||0,
    averageRating:a.players.reduce((s,p)=>s+p.rating,0)/a.players.length,
    homeXt:a.teams.home.xt,
    awayXt:a.teams.away.xt
  });
  core.getAnalyticsRegistry().clear();
}
const avg=key=>rows.reduce((s,r)=>s+Number(r[key]||0),0)/rows.length;
const result={
  matches:rows.length,
  averages:{
    goals:avg('goals'),shots:avg('shots'),xg:avg('xg'),xgot:avg('xgot'),xt:avg('xt'),
    passes:avg('passes'),passAccuracy:avg('passes')?avg('completed')/avg('passes')*100:0,
    progressivePasses:avg('progressive'),keyPasses:avg('keyPasses'),carries:avg('carries'),
    possessionChains:avg('chains'),timelineEvents:avg('timeline'),replayFrames:avg('replayFrames'),
    replayClips:avg('replayClips'),topRating:avg('topRating'),averagePlayerRating:avg('averageRating')
  },
  samples:rows.map(r=>({score:r.score,shots:r.shots,xg:r.xg,xt:r.xt,frames:r.replayFrames,clips:r.replayClips}))
};
console.log(JSON.stringify(result,null,2));
