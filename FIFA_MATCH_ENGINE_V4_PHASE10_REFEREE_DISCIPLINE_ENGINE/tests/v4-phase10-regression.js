const assert = require('assert');
require('../manager-match-engine-v4-phase10.bundle.js');
const core = globalThis.FIFA_MATCH_ENGINE_V4;
function engine(seed='p10', profile='balanced'){ return core.createEngine(core.createDefaultConfig({seed, refereeProfile:profile})); }
function pair(e){ const s=e.getSnapshot(); return {h:s.teams.home.players.find(p=>p.group!=='GK'), a:s.teams.away.players.find(p=>p.group!=='GK')}; }
const results=[];
function test(name, fn){ try{ fn(); results.push({name,status:'PASS'}); } catch(err){ results.push({name,status:'FAIL',error:err.stack||String(err)}); } }

test('Phase 10 API and referee profiles',()=>{ assert.equal(core.REFEREE_DISCIPLINE_VERSION,10); assert.deepEqual(Object.keys(core.REFEREE_PROFILES),['lenient','balanced','strict','disciplinarian']); });

test('Strict referee cards same challenge; lenient referee does not',()=>{
  const es=engine('strict-card','strict'), el=engine('lenient-card','lenient');
  const ps=pair(es), pl=pair(el);
  es.debugAwardFoul(ps.a.id,ps.h.id,{severity:60,reason:'SAME_CHALLENGE'});
  el.debugAwardFoul(pl.a.id,pl.h.id,{severity:60,reason:'SAME_CHALLENGE'});
  assert.equal(es.getSnapshot().teams.away.stats.yellowCards,1);
  assert.equal(el.getSnapshot().teams.away.stats.yellowCards,0);
});

test('Second yellow removes player and records dismissal',()=>{
  const e=engine('second-yellow','strict'), p=pair(e);
  e.debugAwardFoul(p.a.id,p.h.id,{severity:72});
  e.debugAwardFoul(p.a.id,p.h.id,{severity:74});
  const s=e.getSnapshot();
  assert.equal(s.teams.away.players.length,10); assert.equal(s.teams.away.dismissedPlayers.length,1);
  assert.equal(s.teams.away.stats.redCards,1); assert.equal(s.teams.away.stats.secondYellowCards,1);
});

test('Direct red removes player',()=>{
  const e=engine('direct-red'), p=pair(e); e.debugIssueCard(p.a.id,'RED','VIOLENT_CONDUCT');
  const s=e.getSnapshot(); assert.equal(s.teams.away.players.length,10); assert.equal(s.teams.away.stats.redCards,1);
});

test('Advantage is realized when attack progresses',()=>{
  const e=engine('adv-realized'), p=pair(e); e.debugSetPlayerPosition(p.h.id,{x:70,y:34}); e.debugSetBallOwner(p.h.id);
  e.debugAwardFoul(p.a.id,p.h.id,{severity:64,advantage:true,spot:{x:70,y:34}});
  e.debugSetPlayerPosition(p.h.id,{x:88,y:34}); e.step(.2);
  const s=e.getSnapshot(); assert.equal(s.teams.home.stats.advantagesPlayed,1); assert.equal(s.teams.home.stats.advantagesRealized,1); assert.equal(s.referee.advantage,null);
});

test('Advantage is recalled after immediate possession loss',()=>{
  const e=engine('adv-recall'), p=pair(e); e.debugSetPlayerPosition(p.h.id,{x:65,y:34}); e.debugSetBallOwner(p.h.id);
  e.debugAwardFoul(p.a.id,p.h.id,{severity:58,advantage:true,spot:{x:65,y:34}});
  e.debugChangePossession(p.a.id); e.step(.2);
  const s=e.getSnapshot(); assert.equal(s.teams.home.stats.advantagesRecalled,1); assert(s.lastEvent.type==='INDIRECT_FREE_KICK_AWARDED'||s.lastEvent.type==='DIRECT_FREE_KICK_AWARDED');
});

test('Penalty foul records penalty conceded and restart',()=>{
  const e=engine('penalty'), p=pair(e); e.debugSetPlayerPosition(p.h.id,{x:90,y:34});
  e.debugAwardFoul(p.a.id,p.h.id,{severity:66,penalty:true,spot:{x:90,y:34}});
  const r=e.getReport(); assert.equal(r.away.stats.penaltiesConceded,1); assert(r.events.some(x=>x.type==='PENALTY_AWARDED'));
});

test('Added time is calculated and announced',()=>{
  const e=engine('added'); e.debugAddRefereeDelay(210,'second'); e.debugSetClock(88*60);
  let s=e.getSnapshot(); assert.equal(s.referee.secondHalfAdded,210); assert.equal(s.referee.matchEndSeconds,5610);
  e.debugSetClock(89.8*60); s=e.getSnapshot(); assert.equal(s.lastEvent.type,'ADDED_TIME_ANNOUNCED');
});

test('Dismissed goalkeeper triggers emergency outfield goalkeeper',()=>{
  const e=engine('gk-red'), s=e.getSnapshot(); const g=s.teams.away.players.find(p=>p.group==='GK');
  e.debugIssueCard(g.id,'RED','DOGSO'); const after=e.getSnapshot();
  assert.equal(after.teams.away.players.length,10); assert(after.teams.away.players.some(p=>p.group==='GK'));
  assert(after.lastEvent.type==='OUTFIELD_GOALKEEPER'||e.getReport().events.some(x=>x.type==='OUTFIELD_GOALKEEPER'));
});

test('Same seed and scripted decisions remain deterministic',()=>{
  function sequence(){ const e=engine('det-seed','strict'), p=pair(e); e.debugAwardFoul(p.a.id,p.h.id,{severity:60}); e.debugAddRefereeDelay(150,'second'); e.debugSetClock(88*60); const r=e.getReport(),s=e.getSnapshot(); return JSON.stringify({stats:r.away.stats,ref:s.referee,dismissed:s.teams.away.dismissedPlayers,events:r.events}); }
  assert.equal(sequence(),sequence());
});

const failed=results.filter(r=>r.status==='FAIL');
console.log(JSON.stringify({tests:results.length,passed:results.length-failed.length,failed:failed.length,results},null,2));
if(failed.length) process.exit(1);
