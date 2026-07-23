require('../manager-match-engine-v4-phase10.bundle.js');
const core=globalThis.FIFA_MATCH_ENGINE_V4;
function rng(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296;};}
const profiles=['lenient','balanced','strict','disciplinarian'];
const fixturesPerProfile=60, foulsPerFixture=22;
const output={fixturesPerProfile,foulsPerFixture,profiles:{}};
profiles.forEach((profile,pi)=>{
  const total={fouls:0,yellow:0,red:0,secondYellow:0,tactical:0,dangerous:0,penalties:0,advantages:0,realized:0,recalled:0,warnings:0};
  for(let m=0;m<fixturesPerProfile;m++){
    const e=core.createEngine(core.createDefaultConfig({seed:`p10-cal-${profile}-${m}`,refereeProfile:profile}));
    const random=rng(1000+pi*100+m);
    for(let f=0;f<foulsPerFixture;f++){
      let s=e.getSnapshot();
      const offenderSide=f%2===0?'away':'home', victimSide=offenderSide==='away'?'home':'away';
      const offenders=s.teams[offenderSide].players.filter(p=>p.group!=='GK');
      const victims=s.teams[victimSide].players.filter(p=>p.group!=='GK');
      if(!offenders.length||!victims.length) break;
      const offender=offenders[f%offenders.length], victim=victims[(f*3)%victims.length];
      const rareSerious=random()<.012;
      const severity=rareSerious?94+random()*5:Math.max(18,Math.min(82,30+random()*38+(f%11===0?8:0)));
      const tactical=f%8===0, penalty=f===18 && random()<.22, advantage=!penalty && f%5===1;
      e.debugAwardFoul(offender.id,victim.id,{severity,tactical,penalty,advantage,denialOfGoalOpportunity:false,spot:{x:penalty?90:45+random()*35,y:10+random()*48},reason:tactical?'TACTICAL_FOUL':'CALIBRATION_FOUL'});
      if(advantage){ if(f%10===1){ e.debugSetPlayerPosition(victim.id,{x:88,y:34}); e.debugSetBallOwner(victim.id); } else { const active=e.getSnapshot().teams[offenderSide].players.find(p=>p.group!=='GK'); if(active)e.debugChangePossession(active.id); } e.step(.2); }
    }
    e.debugAddRefereeDelay(100+random()*180,'second'); e.debugSetClock(88*60);
    const r=e.getReport(),a=r.away.stats,h=r.home.stats;
    total.fouls+=a.foulsCommitted+h.foulsCommitted; total.yellow+=a.yellowCards+h.yellowCards; total.red+=a.redCards+h.redCards; total.secondYellow+=a.secondYellowCards+h.secondYellowCards;
    total.tactical+=a.tacticalFouls+h.tacticalFouls; total.dangerous+=a.dangerousFouls+h.dangerousFouls; total.penalties+=a.penaltiesConceded+h.penaltiesConceded;
    total.advantages+=a.advantagesPlayed+h.advantagesPlayed; total.realized+=a.advantagesRealized+h.advantagesRealized; total.recalled+=a.advantagesRecalled+h.advantagesRecalled; total.warnings+=a.refereeWarnings+h.refereeWarnings;
    total.added=(total.added||0)+(e.getSnapshot().referee.secondHalfAdded||0);
  }
  output.profiles[profile]={
    matches:fixturesPerProfile,
    averageFouls:+(total.fouls/fixturesPerProfile).toFixed(2),
    averageYellow:+(total.yellow/fixturesPerProfile).toFixed(2),
    averageRed:+(total.red/fixturesPerProfile).toFixed(2),
    secondYellowRate:+(total.secondYellow/fixturesPerProfile).toFixed(2),
    tacticalFouls:+(total.tactical/fixturesPerProfile).toFixed(2),
    dangerousFouls:+(total.dangerous/fixturesPerProfile).toFixed(2),
    penalties:+(total.penalties/fixturesPerProfile).toFixed(2),
    advantages:+(total.advantages/fixturesPerProfile).toFixed(2),
    advantageRealizationPct:total.advantages?+(total.realized/total.advantages*100).toFixed(1):0,
    averageAddedMinutes:+(total.added/fixturesPerProfile/60).toFixed(2)
  };
});
console.log(JSON.stringify(output,null,2));
