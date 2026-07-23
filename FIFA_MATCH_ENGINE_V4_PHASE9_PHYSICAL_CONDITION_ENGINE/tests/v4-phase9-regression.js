
const assert = require("assert");
require("../manager-match-engine-v4-phase9.bundle.js");
const core = globalThis.FIFA_MATCH_ENGINE_V4;
const adapter = globalThis.FIFA_MATCH_ENGINE_V4_PHASE9;

function match(seed, overrides={}) {
  const cfg = core.createDefaultConfig({
    seed,
    home: { managerControl:"HUMAN", ...(overrides.home||{}) },
    away: { managerControl:"HUMAN", ...(overrides.away||{}) }
  });
  const engine = core.createEngine(cfg);
  return engine;
}

const results=[];
function test(name, fn){
  try { fn(); results.push({name,status:"PASS"}); }
  catch(error){ results.push({name,status:"FAIL",error:error.stack||String(error)}); }
}

test("Phase 9 API and snapshot contract", ()=>{
  assert.strictEqual(core.PHYSICAL_CONDITION_VERSION,9);
  const e=match("p9-contract");
  e.runTo(60);
  const s=e.getSnapshot();
  assert.ok(s.teams.home.physical);
  const p=s.teams.home.players[0];
  ["condition","shortTermEnergy","accumulatedFatigue","physicalStatus","performanceModifier","totalDistance","sprintDistance","highIntensityRuns"].forEach(k=>assert.ok(Object.prototype.hasOwnProperty.call(p,k),k));
});

test("Deterministic score and physical output", ()=>{
  const a=match("p9-deterministic"); const b=match("p9-deterministic");
  a.runFullMatch(); b.runFullMatch();
  const sa=a.getSnapshot(), sb=b.getSnapshot();
  assert.deepStrictEqual(sa.score,sb.score);
  assert.deepStrictEqual(sa.teams.home.physical,sb.teams.home.physical);
  assert.deepStrictEqual(sa.teams.away.physical,sb.teams.away.physical);
  assert.deepStrictEqual(sa.teams.home.stats,sb.teams.home.stats);
});

test("High press carries greater physical cost", ()=>{
  let highLoad=0, lowLoad=0, highEnergy=0, lowEnergy=0;
  for(let i=0;i<3;i++){
    const high=match(`p9-high-${i}`,{home:{tactics:{outPossession:"high-press",pressing:82}},away:{tactics:{outPossession:"low-block",pressing:28}}});
    high.runFullMatch();
    const s=high.getSnapshot();
    highLoad += s.teams.home.stats.physicalLoad;
    lowLoad += s.teams.away.stats.physicalLoad;
    highEnergy += s.teams.home.physical.averageEnergy;
    lowEnergy += s.teams.away.physical.averageEnergy;
  }
  assert.ok(highLoad>lowLoad,`${highLoad} <= ${lowLoad}`);
  assert.ok(highEnergy<lowEnergy,`${highEnergy} >= ${lowEnergy}`);
});

test("Low energy reduces performance modifier", ()=>{
  const e=match("p9-modifier");
  const id=e.getSnapshot().teams.home.players.find(p=>p.group==="ST").id;
  e.debugSetPlayerEnergy(id,92);
  const fresh=e.getSnapshot().teams.home.players.find(p=>p.id===id).performanceModifier;
  e.debugSetPlayerEnergy(id,32);
  const tired=e.getSnapshot().teams.home.players.find(p=>p.id===id).performanceModifier;
  assert.ok(tired<fresh,`${tired} !< ${fresh}`);
});

test("Fatigue warning is emitted", ()=>{
  const e=match("p9-warning");
  const id=e.getSnapshot().teams.home.players.find(p=>p.group==="CM").id;
  e.debugSetPlayerEnergy(id,38);
  e.step(.2);
  assert.ok(e.events.some(event=>event.type==="FATIGUE_WARNING" && event.playerId===id));
});

test("AI replaces an injured player", ()=>{
  const e=core.createEngine(core.createDefaultConfig({seed:"p9-ai-injury",home:{managerControl:"AI"},away:{managerControl:"AI"}}));
  const snapshot=e.getSnapshot();
  const candidate=snapshot.teams.home.players.find(p=>p.group!=="GK" && !p.hasBall);
  e.debugInjurePlayer(candidate.id,"INJURED","DEBUG_CONTACT");
  e.step(.2);
  const after=e.getSnapshot();
  assert.ok(after.teams.home.stats.injurySubstitutions>=1);
  assert.ok(e.events.some(event=>event.type==="INJURY_SUBSTITUTION"));
});

test("Human manager receives recommendation without automatic substitution", ()=>{
  const e=match("p9-human-injury");
  const candidate=e.getSnapshot().teams.home.players.find(p=>p.group!=="GK" && !p.hasBall);
  e.debugInjurePlayer(candidate.id,"INJURED","DEBUG_CONTACT");
  e.step(.2);
  const s=e.getSnapshot();
  assert.strictEqual(s.teams.home.stats.injurySubstitutions,0);
  assert.ok(s.teams.home.stats.aiRecommendations>=1);
});

test("Supplied condition and injury proneness are preserved", ()=>{
  const cfg=core.createDefaultConfig({seed:"p9-input",home:{players:Array.from({length:11},(_,i)=>({id:`h${i}`,name:`H${i}`,condition:i===0?74:96,naturalFitness:80,injuryProneness:22}))}});
  const e=core.createEngine(cfg);
  const p=e.getSnapshot().teams.home.players[0];
  assert.strictEqual(p.condition,74);
});

test("Official stats bridge includes physical metrics", ()=>{
  const target={};
  adapter.__diagnostics.applyOfficialStats(target,{totalDistance:101234,sprintDistance:8750,highIntensityRuns:420,fatigueWarnings:3,cramps:1,injurySubstitutions:1});
  assert.strictEqual(target.totalDistance,101234);
  assert.strictEqual(target.sprintDistance,8750);
  assert.strictEqual(target.cramps,1);
  assert.strictEqual(target.injurySubstitutions,1);
});

const failed=results.filter(r=>r.status==="FAIL");
console.log(JSON.stringify({tests:results.length,passed:results.length-failed.length,failed:failed.length,results},null,2));
if(failed.length) process.exit(1);
