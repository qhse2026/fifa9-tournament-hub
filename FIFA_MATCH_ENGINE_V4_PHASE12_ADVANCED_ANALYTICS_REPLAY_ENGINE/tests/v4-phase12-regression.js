const assert = require('node:assert/strict');
require('../manager-match-engine-v4-phase12.bundle.js');
const core = globalThis.FIFA_MATCH_ENGINE_V4;
const tests = [];
function test(name, fn){ tests.push({name, fn}); }
function runMatch(seed){ const e=core.createEngine(core.createDefaultConfig({seed,matchId:seed})); e.runFullMatch(); return e; }

const matchA = runMatch('phase12-regression-main');
const matchB = runMatch('phase12-regression-main');
const reportA = matchA.getReport();
const analysisA = reportA.analysis;

test('Phase 12 API contract',()=>{
  assert.equal(core.VERSION,'4.0.0-phase12.1');
  assert.equal(core.ADVANCED_ANALYTICS_VERSION,12);
  assert.equal(typeof matchA.getAnalytics,'function');
  assert.equal(typeof matchA.exportReplayArchive,'function');
  assert.equal(typeof matchA.getReplayClip,'function');
});

test('Deterministic score and analytics',()=>{
  const a=analysisA, b=matchB.getAnalytics();
  assert.deepEqual(reportA.score,matchB.getReport().score);
  assert.equal(a.shotMap.length,b.shotMap.length);
  assert.equal(a.passMap.length,b.passMap.length);
  assert.equal(a.teams.home.xt,b.teams.home.xt);
  assert.equal(a.teams.away.xt,b.teams.away.xt);
  assert.deepEqual(a.momentum,b.momentum);
});

test('Shot map is sourced from official shot events',()=>{
  assert.equal(analysisA.shotMap.length,reportA.home.stats.shots+reportA.away.stats.shots);
  assert.equal(analysisA.shotMap.filter(x=>x.goal).length,reportA.score.home+reportA.score.away);
  assert.ok(analysisA.shotMap.every(x=>Number.isFinite(x.xg) && x.from));
});

test('Pass map, network and xT are populated',()=>{
  assert.ok(analysisA.passMap.length>500);
  assert.ok(analysisA.passNetwork.length>10);
  assert.ok(analysisA.teams.home.xt>0 && analysisA.teams.away.xt>0);
  assert.ok(analysisA.passMap.some(x=>x.progressive));
  assert.ok(analysisA.passMap.some(x=>x.completed));
});

test('Heatmap and average positions have correct shape',()=>{
  assert.equal(analysisA.heatmaps.home.length,8);
  assert.equal(analysisA.heatmaps.home[0].length,12);
  assert.equal(Object.keys(analysisA.averagePositions).length,22);
  assert.ok(Object.values(analysisA.averagePositions).every(x=>x.samples>0));
});

test('Player ratings remain bounded and sorted',()=>{
  const players=analysisA.players;
  assert.equal(players.length,22);
  assert.ok(players.every(p=>p.rating>=3.5 && p.rating<=10));
  assert.ok(players[0].rating>=players.at(-1).rating);
});

test('Momentum uses five-minute buckets',()=>{
  const m=analysisA.momentum;
  assert.equal(m.length,24);
  assert.equal(m[0].from,0);
  assert.equal(m[0].to,5);
  assert.ok(m.some(x=>x.home>0 || x.away>0));
});

test('Replay archive contains full frames and event clips',()=>{
  const archive=matchA.exportReplayArchive();
  assert.ok(archive.frames.length>3500);
  assert.ok(archive.clips.length>0);
  assert.ok(archive.clips.some(c=>c.frames.length>5));
  const clip=matchA.getReplayClip(archive.clips[0].id);
  assert.equal(clip.id,archive.clips[0].id);
});

test('Possession chains and key timeline are generated',()=>{
  assert.ok(analysisA.possessionChains.length>20);
  assert.ok(analysisA.timeline.length>0);
  assert.ok(analysisA.possessionChains.every(x=>Number.isFinite(x.duration)));
});

test('Analytics do not alter the first 20 minutes of simulation',()=>{
  const config=core.createDefaultConfig({seed:'phase12-no-influence',matchId:'phase12-no-influence'});
  const base=core.__phase12Base.createEngine(config);
  const wrapped=core.createEngine(config);
  base.runTo(20*60); wrapped.runTo(20*60);
  const br=base.getReport(), wr=wrapped.getReport();
  assert.deepEqual(br.score,wr.score);
  assert.equal(br.home.stats.shots,wr.home.stats.shots);
  assert.equal(br.away.stats.shots,wr.away.stats.shots);
  assert.equal(br.home.stats.passesAttempted,wr.home.stats.passesAttempted);
});

let passed=0;
for(const row of tests){
  try{ row.fn(); passed++; console.log(`PASS ${row.name}`); }
  catch(error){ console.error(`FAIL ${row.name}`); console.error(error.stack||error); process.exitCode=1; }
}
console.log(JSON.stringify({tests:tests.length,passed,failed:tests.length-passed},null,2));
