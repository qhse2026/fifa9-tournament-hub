require("../manager-match-engine-v4-phase11.bundle.js");
const d=globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE.__diagnostics;
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const engine=core.createEngine(core.createDefaultConfig({seed:"phase11-benchmark"}));
engine.runTo(1200);
const s=engine.getSnapshot();
const players=[...s.teams.home.players,...s.teams.away.players];
const start=process.hrtime.bigint();
let checksum=0;
for(let i=0;i<10000;i++){
  const alpha=(i%100)/100;
  for(const p of players){ const q=d.interpolatePoint(p.previousPoint,p.point,alpha); checksum+=q.x+q.y; d.inferAnimation(p,s,s.lastEvent,Math.hypot(p.velocity.x,p.velocity.y)); }
  const offsets=d.computeCollisionOffsets(players);
  checksum+=offsets.size;
  d.cameraPreset(i%2?"BROADCAST":"FOLLOW_BALL",s);
}
const ms=Number(process.hrtime.bigint()-start)/1e6;
console.log(JSON.stringify({iterations:10000,players:players.length,totalMs:Number(ms.toFixed(2)),averageMsPerVisualEvaluation:Number((ms/10000).toFixed(5)),checksum:Number(checksum.toFixed(2))},null,2));
