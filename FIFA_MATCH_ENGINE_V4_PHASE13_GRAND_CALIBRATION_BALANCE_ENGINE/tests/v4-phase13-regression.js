const assert=require('node:assert/strict');
require('../manager-match-engine-v4-phase13.bundle.js');
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const tests=[]; const test=(n,f)=>tests.push({n,f});

test('Phase 13 API contract',()=>{assert.equal(core.VERSION,'4.0.0-phase13.1');assert.equal(core.GRAND_CALIBRATION_VERSION,13);assert.equal(typeof core.runCalibration,'function');assert.equal(typeof core.compareBalanceBaseline,'function');});

test('Balance profile is attached to engine snapshot and report',()=>{const e=core.createEngine(core.createDefaultConfig({seed:'p13-profile'}));e.runTo(60);assert.equal(e.getSnapshot().balance.profile.id,'masterpiece');assert.equal(e.getReport().balance.manifest,core.BALANCE_MANIFEST_VERSION);});

test('Neutral profile preserves Phase 12 outcome',()=>{const cfg=core.__phase13Base.createDefaultConfig({seed:'p13-neutral'});const a=core.__phase13Base.createEngine(cfg);const b=core.createEngine({...cfg,balanceProfile:'neutral'});a.runFullMatch();b.runFullMatch();assert.deepEqual(a.getReport().score,b.getReport().score);assert.equal(a.getReport().home.stats.shots,b.getReport().home.stats.shots);});

test('Determinism audit passes',()=>{const r=core.runDeterminismAudit({matches:1,seedPrefix:'p13-det'});assert.equal(r.pass,true);});

test('Batch calibration produces required metrics',()=>{const r=core.runCalibration({matches:2,seedPrefix:'p13-batch'});assert.equal(r.metrics.matches,2);assert.ok(Number.isFinite(r.metrics.goalsPerMatch));assert.ok(r.evaluation.score>=0&&r.evaluation.score<=100);assert.equal(typeof r.fingerprint,'string');});

test('Evaluation distinguishes pass and fail ranges',()=>{const good={};for(const [k,t] of Object.entries(core.BALANCE_TARGETS))good[k]=(t.min+t.max)/2;const pass=core.evaluateBalance(good);assert.equal(pass.status,'PASS');good.goalsPerMatch=20;assert.notEqual(core.evaluateBalance(good).status,'PASS');});

test('Recommendations identify scoring excess',()=>{const metrics={};for(const [k,t] of Object.entries(core.BALANCE_TARGETS))metrics[k]=(t.min+t.max)/2;metrics.goalsPerMatch=9;const rec=core.recommendTuning(core.evaluateBalance(metrics));assert.ok(rec.some(x=>x.area==='SCORING'&&x.direction==='DOWN'));});

test('Baseline comparison detects regression',()=>{const cal=core.runCalibration({matches:1,seedPrefix:'p13-base'});const base=core.createBalanceBaseline(cal,'test');const same=core.compareBalanceBaseline(cal,base);assert.equal(same.pass,true);const changed=JSON.parse(JSON.stringify(cal));changed.metrics.goalsPerMatch+=4;assert.equal(core.compareBalanceBaseline(changed,base).pass,false);});

test('Masterpiece profile preserves team identity',()=>{const c=core.createDefaultConfig({seed:'identity',home:{id:'AAA',name:'Alpha',rating:84},away:{id:'BBB',name:'Beta',rating:78}});assert.equal(c.home.id,'AAA');assert.equal(c.away.name,'Beta');assert.ok(c.home.rating>84);});

let passed=0;for(const t of tests){try{t.f();passed++;console.log('PASS '+t.n)}catch(e){console.error('FAIL '+t.n);console.error(e.stack||e);process.exitCode=1}finally{core.getAnalyticsRegistry?.().clear?.();}}console.log(JSON.stringify({tests:tests.length,passed,failed:tests.length-passed},null,2));
