'use strict';
const fs=require('node:fs'), path=require('node:path');
require(path.resolve(__dirname,'..','manager-match-engine-v4-phase7.bundle.js'));
const core=globalThis.FIFA_MATCH_ENGINE_V4;
const start=Number(process.argv[2]||0), count=Number(process.argv[3]||5), out=process.argv[4];
const keys=['goals','shots','onTarget','xg','passesAttempted','passesCompleted','attackingRuns','blindSideRuns','overlaps','underlaps','halfSpaceRuns','widthRuns','boxRuns','falseNineDrops','linkPlayActions','targetManActions','defenderCarries','creativePasses','killerPassesAttempted','progressiveCarries','roleShots'];
const total={matches:0}; for(const k of keys) total[k]=0;
for(let i=start;i<start+count;i++){
 const cfg=core.createDefaultConfig({seed:`phase7-cal-${i}`, home:{roles:{RW:'winger',LW:'inside-forward',ST:i%2?'false-nine':'advanced-forward',RCM:'mezzala',RB:'overlap'}},away:{roles:{RW:'inverted-winger',LW:'wide-playmaker',ST:i%3?'target-forward':'poacher',LCM:'box-to-box',LB:'inverted-fullback'}}});
 const e=core.createEngine(cfg); e.runFullMatch(); const r=e.getReport(); total.matches++;
 for(const side of ['home','away']) for(const k of keys) total[k]+=Number(r[side].stats[k]||0);
}
fs.writeFileSync(out,JSON.stringify(total));
