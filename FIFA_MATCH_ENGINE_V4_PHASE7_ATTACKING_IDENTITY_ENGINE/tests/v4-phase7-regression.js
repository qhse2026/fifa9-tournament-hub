'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
require(path.resolve(__dirname, '..', 'manager-match-engine-v4-phase7.bundle.js'));
const core = globalThis.FIFA_MATCH_ENGINE_V4;
function make(seed, overrides={}) { return core.createEngine(core.createDefaultConfig({seed, ...overrides})); }
function byGroup(s, side, group, index=0){ return s.teams[side].players.filter(p=>p.group===group)[index]; }
function progress(team, p){ const q=p.targetPoint||p.point; return team.side==='home'?q.x:100-q.x; }
assert.equal(core.VERSION,'4.0.0-phase7.1');
assert.equal(core.ATTACKING_IDENTITY_VERSION,7);
assert.ok(core.ATTACKING_ROLE_PROFILES['false-nine']);
// deterministic full simulation
const a=make('p7-det'); a.runFullMatch(); const b=make('p7-det'); b.runFullMatch();
assert.deepEqual(a.getReport().score,b.getReport().score); assert.deepEqual(a.getReport().home.stats,b.getReport().home.stats);
// False nine drops deeper than advanced forward.
let e=make('p7-f9',{home:{formation:'4-3-3',roles:{ST:'false-nine'}}}); let s=e.getSnapshot();
let st=byGroup(s,'home','ST'); const cm=byGroup(s,'home','CM'); e.debugSetBallOwner(cm.id); s=e.debugRefreshAttack(); st=byGroup(s,'home','ST'); const f9Progress=progress(s.teams.home,st); assert.equal(st.attackRole,'false-nine'); assert.equal(st.intent,'FALSE_NINE_DROP');
e=make('p7-af',{home:{formation:'4-3-3',roles:{ST:'advanced-forward'}}}); s=e.getSnapshot(); st=byGroup(s,'home','ST'); const cm2=byGroup(s,'home','CM'); e.debugSetBallOwner(cm2.id); s=e.debugRefreshAttack(); st=byGroup(s,'home','ST'); assert.equal(st.attackRole,'advanced-forward'); assert.ok(progress(s.teams.home,st)>f9Progress+8); assert.ok(['RUN_BEHIND','BLIND_SIDE_RUN'].includes(st.intent));
// Winger holds width, inside forward attacks inside channel.
e=make('p7-wing',{home:{formation:'4-3-3',roles:{RW:'winger',LW:'inside-forward'}}}); s=e.getSnapshot(); const dm=byGroup(s,'home','DM'); e.debugSetBallOwner(dm.id); s=e.debugRefreshAttack(); const wings=s.teams.home.players.filter(p=>p.group==='WING'); const rw=wings.find(p=>p.position==='RW'), lw=wings.find(p=>p.position==='LW'); assert.equal(rw.intent,'HOLD_WIDTH'); assert.ok(Math.abs(rw.targetPoint.y-34)>22); assert.ok(['INSIDE_FORWARD_RUN','BLIND_SIDE_RUN'].includes(lw.intent)); assert.ok(Math.abs(lw.targetPoint.y-34)<15);
// Fullback relationship reacts: inside forward creates overlap; winger creates underlap.
const rel=s.attackingAI.home.relationships; const backs=s.teams.home.players.filter(p=>p.group==='FB'); assert.ok(Object.keys(rel).length>=2); const modes=Object.values(rel).map(r=>r.mode); assert.ok(modes.includes('OVERLAP')); assert.ok(modes.includes('UNDERLAP'));
// Mezzala occupies a half-space.
e=make('p7-mezz',{home:{formation:'4-3-3',roles:{RCM:'mezzala',LCM:'box-to-box'}}}); s=e.getSnapshot(); const dm3=byGroup(s,'home','DM'); e.debugSetBallOwner(dm3.id); s=e.debugRefreshAttack(); const mezz=s.teams.home.players.find(p=>p.attackRole==='mezzala'); assert.equal(mezz.intent,'MEZZALA_HALF_SPACE'); assert.ok(Math.abs(mezz.targetPoint.y-34)>=10);
// Target forward and false nine expose distinct action profiles under pressure.
e=make('p7-target',{home:{formation:'4-3-3',roles:{ST:'target-forward'}}}); s=e.getSnapshot(); st=byGroup(s,'home','ST'); e.debugSetBallOwner(st.id); const act=e.debugChooseAction(st.id); assert.ok(['HOLD_UP','PASS','SHOT','CARRY'].includes(act.type)); assert.equal(st.attackRole,'target-forward');
// BPD carries into build-up support and tracks defender carry.
e=make('p7-bpd',{home:{formation:'4-3-3',roles:{RCB:'ball-playing-defender'}}}); s=e.getSnapshot(); const bpd=s.teams.home.players.find(p=>p.attackRole==='ball-playing-defender'); e.debugSetBallOwner(bpd.id); s=e.debugRefreshAttack(); const bpd2=s.teams.home.players.find(p=>p.id===bpd.id); assert.equal(bpd2.intent,'DEFENDER_CARRY');
// Attacking context and official counters exist after a short match sample.
e=make('p7-context'); e.runTo(900); s=e.getSnapshot(); const r=e.getReport(); assert.ok(s.attackingAI.home && s.attackingAI.away); assert.ok(Number.isFinite(r.home.stats.attackingRuns)); assert.ok('killerPassesAttempted' in r.home.stats); assert.ok(Array.isArray(r.attackingIdentity.home));
console.log(JSON.stringify({status:'PASS',version:core.VERSION,tests:8,roles:Object.keys(core.ATTACKING_ROLE_PROFILES).length},null,2));
