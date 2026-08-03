(() => {
  'use strict';

  const VERSION = '5.7.1';
  const BUILD = '571000';
  const STATE_KEY = 'fifa-spatial-broadcast-v570';
  const SNAPSHOT_KEY = 'fifa-spatial-broadcast-snapshot-v570';
  const EVENT_KEY = 'fifa-spatial-story-events-v570';
  const SCENES = ['broadcast', 'bracket', 'stories'];
  let maintenanceTimer = null;
  let directorTimer = null;
  let directorIndex = 0;

  const isTR = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const norm = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();
  const num = value => Number(value || 0);
  const clamp = (value,min=0,max=100) => Math.max(min,Math.min(max,Number(value)||0));
  const fmt = (value,digits=3) => Number(value||0).toLocaleString(isTR()?'tr-TR':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const hash = text => { let h=2166136261; for(const c of String(text||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; };

  const persisted = (()=>{try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')||{};}catch(_){return{};}})();
  const state = {
    scene: '',
    selectedStory: persisted.selectedStory || '',
    autoBroadcast: false,
    performance: persisted.performance || '',
    lastDataKey: ''
  };

  function save(){
    try{localStorage.setItem(STATE_KEY,JSON.stringify({selectedStory:state.selectedStory,performance:state.performance}));}catch(_){}
  }

  function visual(){ return window.INFANTINO_VISUAL || null; }
  function night(){ return window.INFANTINO_NIGHT || null; }
  function rivalry(){ return window.INFANTINO_RIVALRY || null; }
  function stadium(){ return window.INFANTINO_STADIUM || null; }
  function data(){ try{return visual()?.data?.() || night()?.data?.() || {};}catch(_){return{};} }

  function table(d=data()){
    return [...(d?.standings||[])].sort((a,b)=>(num(a.rank)||999)-(num(b.rank)||999)||num(b.ppg)-num(a.ppg));
  }

  function hasScore(m){
    return !!(m && m.homeScore !== null && m.homeScore !== undefined && m.homeScore !== '' && m.awayScore !== null && m.awayScore !== undefined && m.awayScore !== '' && Number.isFinite(Number(m.homeScore)) && Number.isFinite(Number(m.awayScore)));
  }

  function completedMatches(d=data()){
    const rows=d?.universe?.matches?.length ? d.universe.matches : (d?.matches||[]);
    return [...rows].filter(hasScore).sort((a,b)=>{
      const at=Date.parse(a.completedAt||a.updatedAt||a.date||'')||0;
      const bt=Date.parse(b.completedAt||b.updatedAt||b.date||'')||0;
      if(at!==bt)return at-bt;
      return num(a.edition)-num(b.edition)||String(a.id||'').localeCompare(String(b.id||''));
    });
  }

  function pendingFixtures(d=data()){
    const draw=d?.draw||{};
    const namesById=new Map(table(d).map(r=>[String(r.id),r.name]));
    const snapshot=draw?.playerSnapshot||draw?.players||draw?.participants||[];
    (Array.isArray(snapshot)?snapshot:[]).forEach(p=>p?.id&&p?.name&&namesById.set(String(p.id),p.name));
    return (draw?.fixtures||[]).filter(m=>!m.completed&&!hasScore(m)).map(m=>({
      ...m,
      homeName:m.homeName||namesById.get(String(m.homeId))||'—',
      awayName:m.awayName||namesById.get(String(m.awayId))||'—'
    })).sort((a,b)=>num(a.matchday)-num(b.matchday)||String(a.id||'').localeCompare(String(b.id||'')));
  }

  function progress(d=data()){
    const fixtures=d?.draw?.fixtures||[];
    const done=fixtures.filter(m=>m.completed||hasScore(m)).length;
    return {done,total:fixtures.length,pct:fixtures.length?done/fixtures.length*100:0,pending:Math.max(0,fixtures.length-done)};
  }

  function signature(name){
    const h=hash(name||'PLAYER');
    const hue=h%360;
    const hue2=(hue+38+(h%47))%360;
    const tilt=((h%9)-4)*.35;
    const pulse=3.2+(h%17)/10;
    const mark=String(name||'?').split(/\s+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toLocaleUpperCase('tr-TR');
    return {name,hue,hue2,tilt,pulse,mark};
  }

  function playerInfo(name,d=data()){
    const key=norm(name);if(!key)return null;
    const find=rows=>(rows||[]).find(p=>norm(p?.name)===key)||null;
    const u=find(d?.universe?.players),a=find(d?.allTime?.players),f=find(d?.fpi?.players),s=find(d?.standings);
    return (u||a||f||s)?{name:u?.name||a?.name||f?.name||s?.name||name,u,a,f,s}:null;
  }

  function metric(info,key){
    const u=info?.u||{},a=info?.a||{},f=info?.f||{},s=info?.s||{};
    const map={
      legacy:num(u.legacy??u.legacyScore??a.legacyRating??f.legacy),
      big:num(u.bigMatchScore??u.bigMatch??f.bigMatchScore??f.bigMatch),
      momentum:num(u.momentumScore??u.momentum??f.momentumScore??f.momentum),
      titles:num(a.titles??u.titles),
      ppg:num(s.ppg??a.ppg??u.ppg),
      rank:num(s.rank??f.rank),
      rating:num(s.rating??s.elo??f.rating)
    };
    return map[key]||0;
  }

  function matchNames(m,d=data()){
    const byId=new Map(table(d).map(r=>[String(r.id),r.name]));
    const snap=d?.draw?.playerSnapshot||d?.draw?.players||d?.draw?.participants||[];
    (Array.isArray(snap)?snap:[]).forEach(p=>p?.id&&p?.name&&byId.set(String(p.id),p.name));
    return {
      home:m?.homeName||byId.get(String(m?.homeId))||'—',
      away:m?.awayName||byId.get(String(m?.awayId))||'—'
    };
  }

  function fixturePressure(f,d=data()){
    const t=table(d),h=t.find(r=>norm(r.name)===norm(f.homeName)),a=t.find(r=>norm(r.name)===norm(f.awayName));
    let p=25;
    const ranks=[num(h?.rank)||99,num(a?.rank)||99];
    if(ranks.some(r=>r<=4))p+=23;
    if(ranks.some(r=>r>=4&&r<=6))p+=17;
    if(ranks.some(r=>r>=11&&r<=13))p+=18;
    if(num(f.matchday)>=6)p+=9;
    if(num(f.stars)>=5)p+=6;
    return clamp(p,15,100);
  }

  function latestResult(d=data()){
    const rows=completedMatches(d);return rows[rows.length-1]||null;
  }

  function officialHonours(d=data()){
    return [...(d?.universe?.honours||[])].filter(h=>h?.competition==='oruc'&&h?.winner).sort((a,b)=>num(a.edition)-num(b.edition));
  }

  function fifa10Honour(d=data()){
    return officialHonours(d).find(h=>num(h.edition)===10)||null;
  }

  function readSnapshot(){try{return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');}catch(_){return null;}}
  function writeSnapshot(value){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(value));}catch(_){}}
  function readEvents(){try{return JSON.parse(localStorage.getItem(EVENT_KEY)||'[]')||[];}catch(_){return[];}}
  function writeEvents(rows){try{localStorage.setItem(EVENT_KEY,JSON.stringify((rows||[]).slice(-30)));}catch(_){}}
  function rememberEvent(event){
    const rows=readEvents();
    if(rows.some(x=>x?.key===event.key))return;
    rows.push({...event,time:new Date().toISOString()});writeEvents(rows);
  }

  function currentSnapshot(d=data()){
    const t=table(d),last=latestResult(d),h=fifa10Honour(d);
    return {
      time:new Date().toISOString(),
      leader:t[0]?.name||'',
      leaderPpg:num(t[0]?.ppg),
      qf4:t[3]?.name||'', qf4Ppg:num(t[3]?.ppg),
      qf5:t[4]?.name||'', qf5Ppg:num(t[4]?.ppg),
      pi12:t[11]?.name||'', pi12Ppg:num(t[11]?.ppg),
      pi13:t[12]?.name||'', pi13Ppg:num(t[12]?.ppg),
      lastMatch:last?.id||'',
      champion:h?.winner||''
    };
  }

  function recentForm(name,d=data(),n=5){
    const key=norm(name),rows=completedMatches(d).filter(m=>norm(m.homeName)===key||norm(m.awayName)===key).slice(-n);
    let w=0,draws=0,l=0,gf=0,ga=0;
    rows.forEach(m=>{const home=norm(m.homeName)===key,forG=home?num(m.homeScore):num(m.awayScore),against=home?num(m.awayScore):num(m.homeScore);gf+=forG;ga+=against;if(forG>against)w++;else if(forG<against)l++;else draws++;});
    return {played:rows.length,w,draws,l,gf,ga,points:w*3+draws};
  }

  function h2hCount(a,b,d=data()){
    const ak=norm(a),bk=norm(b);return completedMatches(d).filter(m=>{const h=norm(m.homeName),w=norm(m.awayName);return (h===ak&&w===bk)||(h===bk&&w===ak);}).length;
  }

  function storyEngine(d=data()){
    const t=table(d),p=progress(d),pending=pendingFixtures(d),last=latestResult(d),stories=[];
    const prev=readSnapshot(),cur=currentSnapshot(d);
    if(prev?.leader && cur.leader && norm(prev.leader)!==norm(cur.leader)){
      rememberEvent({key:`leader:${prev.leader}>${cur.leader}:${cur.lastMatch}`,type:'leader',from:prev.leader,to:cur.leader,ppg:cur.leaderPpg});
    }
    if(prev?.champion!==undefined && !prev.champion && cur.champion){
      rememberEvent({key:`champion:${cur.champion}`,type:'champion',winner:cur.champion});
    }
    readEvents().slice(-6).reverse().forEach((evt,idx)=>{
      if(evt.type==='leader')stories.push({id:`event-leader-${idx}`,priority:100-idx,kind:'crown',kicker:'STANDING SHIFT',title:isTR()?'Liderlik el değiştirdi':'The lead changed hands',body:`${evt.to} · #1${evt.ppg?` · ${fmt(evt.ppg)} PPG`:''}`,evidence:isTR()?`Bu tarayıcının önceki kayıtlı lideri: ${evt.from}`:`Previous leader observed by this browser: ${evt.from}`,action:'standing'});
      if(evt.type==='champion')stories.push({id:`event-champion-${idx}`,priority:110-idx,kind:'gold',kicker:'FINAL NIGHT PROTOCOL',title:isTR()?'FIFA 10 şampiyonu resmen mühürlendi':'FIFA 10 champion officially sealed',body:evt.winner,evidence:isTR()?'Resmî honours kaydı aktif.':'Official honours record is active.',action:'final'});
    });
    if(t[0]){
      const leadGap=t[1]?num(t[0].ppg)-num(t[1].ppg):0;
      stories.push({id:'leader-now',priority:72,kind:'crown',kicker:'TITLE RACE',title:`#1 ${t[0].name}`,body:`${fmt(t[0].ppg)} PPG${t[1]?` · ${leadGap>=0?'+':''}${fmt(leadGap)} ${isTR()?'liderlik farkı':'lead gap'}`:''}`,evidence:isTR()?'Güncel resmî sıralama':'Current official standings',action:'standing'});
    }
    if(t[3]&&t[4]){
      const gap=num(t[3].ppg)-num(t[4].ppg);
      stories.push({id:'qf-cutline',priority:gap<=.25?93:66,kind:gap<=.25?'alert':'blue',kicker:'DIRECT QF CUTLINE',title:`#4 ${t[3].name} ↔ #5 ${t[4].name}`,body:`${fmt(t[3].ppg)} / ${fmt(t[4].ppg)} PPG · Δ ${fmt(Math.abs(gap))}`,evidence:isTR()?'İlk dört doğrudan çeyrek finale gider.':'Top four advance directly to the quarter-finals.',action:'warroom'});
    }
    if(t[11]&&t[12]){
      const gap=num(t[11].ppg)-num(t[12].ppg);
      stories.push({id:'playin-cutline',priority:gap<=.25?91:62,kind:gap<=.25?'alert':'violet',kicker:'PLAY-IN CUTLINE',title:`#12 ${t[11].name} ↔ #13 ${t[12].name}`,body:`${fmt(t[11].ppg)} / ${fmt(t[12].ppg)} PPG · Δ ${fmt(Math.abs(gap))}`,evidence:isTR()?'#12 çizginin üstünde, #13 çizginin altında.':'#12 is above the line, #13 below it.',action:'bracket'});
    }
    if(last){
      const n=matchNames(last,d),total=num(last.homeScore)+num(last.awayScore),margin=Math.abs(num(last.homeScore)-num(last.awayScore)),rivalryCount=h2hCount(n.home,n.away,d);
      stories.push({id:'latest-result',priority:74+(total>=7?7:0)+(margin>=4?5:0),kind:'result',kicker:'LATEST OFFICIAL RESULT',title:`${n.home} ${last.homeScore}–${last.awayScore} ${n.away}`,body:`FIFA ${String(num(last.edition)||10).padStart(2,'0')} · ${last.stage||'Official Match'}`,evidence:`${total} ${isTR()?'gol':'goals'} · ${isTR()?'fark':'margin'} ${margin}`,action:'stadium',meta:last.id});
      if(rivalryCount>=3){
        stories.push({id:'rivalry-escalation',priority:77,kind:'rivalry',kicker:'RIVALRY SIGNAL',title:`${n.home} × ${n.away}`,body:isTR()?`${rivalryCount} resmî karşılaşmaya ulaşan rekabet.`:`Rivalry now spans ${rivalryCount} official meetings.`,evidence:isTR()?'Yalnız resmî H2H kayıtları sayıldı.':'Official H2H records only.',action:'rivalry',meta:[n.home,n.away]});
      }
    }
    if(t.length>=3){
      const top=t.slice(0,3),gap=num(top[0]?.ppg)-num(top[2]?.ppg);
      if(gap<=.45)stories.push({id:'title-compression',priority:86,kind:'gold',kicker:'TITLE RACE COMPRESSION',title:top.map(r=>`#${r.rank} ${r.name}`).join(' · '),body:isTR()?`İlk üç yalnız ${fmt(gap)} PPG aralığında.`:`Top three are separated by only ${fmt(gap)} PPG.`,evidence:top.map(r=>`${r.name} ${fmt(r.ppg)}`).join(' · '),action:'broadcast'});
    }
    const formRows=t.map(r=>({row:r,form:recentForm(r.name,d,5)})).filter(x=>x.form.played>=3).sort((a,b)=>b.form.points-a.form.points||b.form.gf-a.form.gf);
    if(formRows[0]){
      const x=formRows[0];stories.push({id:'form-signal',priority:64,kind:'cyan',kicker:'RECENT FORM SIGNAL',title:x.row.name,body:`${x.form.w}W · ${x.form.draws}D · ${x.form.l}L · ${x.form.gf}-${x.form.ga}`,evidence:isTR()?'Son en fazla 5 resmî maç.':'Last up to 5 official matches.',action:'player',meta:x.row.name});
    }
    if(p.pending===0 && !cur.champion){
      stories.push({id:'group-sealed',priority:96,kind:'gold',kicker:'GROUP STAGE SEALED',title:isTR()?'Grup aşaması tamamlandı':'Group stage complete',body:isTR()?'Direct QF ve Play-In katılımcıları güncel sıralamadan kilitlenebilir.':'Direct QF and Play-In participants can now be locked from the final table.',evidence:`${p.done}/${p.total}`,action:'bracket'});
    } else if(p.total){
      stories.push({id:'tournament-progress',priority:38,kind:'blue',kicker:'TOURNAMENT PROGRESS',title:`${Math.round(p.pct)}%`,body:`${p.done}/${p.total} ${isTR()?'grup maçı tamamlandı':'group fixtures complete'}`,evidence:`${pending.length} ${isTR()?'maç kaldı':'fixtures remain'}`,action:'broadcast'});
    }
    writeSnapshot(cur);
    return stories.sort((a,b)=>b.priority-a.priority).slice(0,12);
  }

  function bracketState(d=data()){
    const t=table(d),p=progress(d),draw=d?.draw||{};
    const locked=p.total>0&&p.pending===0;
    const direct=[1,2,3,4].map(rank=>t[rank-1]||null);
    const pairs=[[5,12],[6,11],[7,10],[8,9]].map(([a,b],i)=>({id:i+1,aRank:a,bRank:b,a:t[a-1]||null,b:t[b-1]||null}));
    return {locked,direct,pairs,status:draw.status||'',completed:p.done,total:p.total,pct:p.pct};
  }

  function ensureScenes(){
    const shell=document.querySelector('#suShell');if(!shell)return false;
    const small=shell.querySelector('.su-brand small');if(small)small.textContent='FIFA UNIVERSE V5.7 · BROADCAST COMMAND DECK';
    const tabs=shell.querySelector('.su-scene-tabs');
    if(tabs&&!tabs.querySelector('[data-bc-tab="broadcast"]')){
      tabs.insertAdjacentHTML('beforeend','<button type="button" data-bc-tab="broadcast">▣ BROADCAST</button><button type="button" data-bc-tab="bracket">⌘ BRACKET</button><button type="button" data-bc-tab="stories">✦ STORIES</button>');
    }
    const body=shell.querySelector('.su-body');
    if(body&&!body.querySelector('#bcSceneBroadcast')){
      body.insertAdjacentHTML('beforeend',SCENES.map(id=>`<section class="su-scene bc-scene" data-scene="bc-${id}" id="bcScene${id[0].toUpperCase()+id.slice(1)}"></section>`).join(''));
    }
    const actions=shell.querySelector('.su-top-actions');
    if(actions&&!actions.querySelector('[data-bc-command]'))actions.insertAdjacentHTML('afterbegin','<button type="button" data-bc-command>▣ COMMAND DECK</button>');
    return true;
  }

  function activate(id){
    ensureScenes();
    stopAutoBroadcast(false);
    document.body.classList.add('ss-extension-scene-open','bc-extension-open');
    document.querySelectorAll('#suShell .su-scene').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('#suShell [data-su-tab],[data-ss-tab],[data-rf-tab],[data-tn-tab],[data-bc-tab]').forEach(el=>el.classList.remove('active'));
    document.querySelector(`#bcScene${id[0].toUpperCase()+id.slice(1)}`)?.classList.add('active');
    document.querySelector(`[data-bc-tab="${id}"]`)?.classList.add('active');
    state.scene=id;
    const shell=document.querySelector('#suShell');if(shell)shell.dataset.extensionScene=`bc-${id}`;
  }

  function openShell(){visual()?.open?.();setTimeout(ensureScenes,55);}

  function topBar(title,kicker,stat,small){
    return `<header class="bc-heading"><div><span>${esc(kicker)}</span><h2>${esc(title)}</h2></div><aside><b>${esc(stat)}</b><small>${esc(small)}</small></aside></header>`;
  }

  function miniPlayer(row){
    if(!row)return '<div class="bc-mini-player empty">—</div>';
    const sig=signature(row.name);
    return `<div class="bc-mini-player" style="--bc-h:${sig.hue};--bc-h2:${sig.hue2}"><i>${esc(sig.mark)}</i><div><strong>#${num(row.rank)||'—'} ${esc(row.name)}</strong><span>${fmt(row.ppg)} PPG</span></div></div>`;
  }

  function renderBroadcast(){
    const d=data(),t=table(d),p=progress(d),pending=pendingFixtures(d),last=latestResult(d),stories=storyEngine(d),honour=fifa10Honour(d);
    activate('broadcast');
    const root=document.querySelector('#bcSceneBroadcast');if(!root)return;
    const high=[...pending].sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];
    const latestNames=last?matchNames(last,d):null;
    root.innerHTML=`<div class="su-scene-inner bc-shell">
      ${topBar(isTR()?'Broadcast Komuta Güvertesi':'Broadcast Command Deck','FIFA 10 · LIVE COMPOSITION',`${Math.round(p.pct)}%`,isTR()?'TURNUVA TAMAMLANMA':'TOURNAMENT COMPLETE')}
      <section class="bc-master-grid">
        <article class="bc-master-card bc-leader"><span>LIVE LEADER</span>${miniPlayer(t[0])}<div class="bc-chasers">${t.slice(1,4).map(miniPlayer).join('')}</div></article>
        <article class="bc-master-card bc-next"><span>NEXT PRESSURE MATCH</span>${high?`<h3>${esc(high.homeName)} <em>VS</em> ${esc(high.awayName)}</h3><p>MD ${num(high.matchday)||'—'} · ${num(high.stars)||'—'}★ · PRESSURE ${Math.round(fixturePressure(high,d))}</p><button data-bc-prematch="${esc(high.id)}">PRE-MATCH ARENA ↗</button>`:`<h3>${isTR()?'Bekleyen maç yok':'No pending fixture'}</h3>`}</article>
        <article class="bc-master-card bc-latest"><span>LATEST RESULT</span>${last?`<h3>${esc(latestNames.home)} <em>${last.homeScore}–${last.awayScore}</em> ${esc(latestNames.away)}</h3><p>FIFA ${String(num(last.edition)||10).padStart(2,'0')} · ${esc(last.stage||'Official Match')}</p><button data-bc-stadium="${esc(last.id)}">SPATIAL STADIUM ↗</button>`:`<h3>${isTR()?'Henüz sonuç yok':'No result yet'}</h3>`}</article>
        <article class="bc-master-card bc-final"><span>FINAL NIGHT STATUS</span>${honour?`<h3>♛ ${esc(honour.winner)}</h3><p>${isTR()?'FIFA 10 resmî şampiyonu mühürlendi.':'FIFA 10 official champion is sealed.'}</p><button data-bc-final>FINAL NIGHT PROTOCOL ↗</button>`:`<h3>${p.pending?`${p.pending} ${isTR()?'GRUP MAÇI KALDI':'GROUP FIXTURES LEFT'}`:(isTR()?'PODYUM MÜHRÜ BEKLENİYOR':'AWAITING PODIUM SEAL')}</h3><p>${isTR()?'Resmî honours kaydı olmadan şampiyon ilan edilmez.':'No champion is declared without an official honours record.'}</p>`}</article>
      </section>
      <section class="bc-broadcast-wall">
        <div class="bc-wall-table"><header><span>QUALIFICATION CUTLINES</span><button data-bc-warroom>WAR ROOM ↗</button></header><div class="bc-cutline qf"><b>#4</b><strong>${esc(t[3]?.name||'—')}</strong><span>${t[3]?fmt(t[3].ppg):'—'} PPG</span></div><div class="bc-cutline playin"><b>#5</b><strong>${esc(t[4]?.name||'—')}</strong><span>${t[4]?fmt(t[4].ppg):'—'} PPG</span></div><i></i><div class="bc-cutline safe"><b>#12</b><strong>${esc(t[11]?.name||'—')}</strong><span>${t[11]?fmt(t[11].ppg):'—'} PPG</span></div><div class="bc-cutline out"><b>#13</b><strong>${esc(t[12]?.name||'—')}</strong><span>${t[12]?fmt(t[12].ppg):'—'} PPG</span></div></div>
        <div class="bc-wall-stories"><header><span>TOP STORY SIGNALS</span><button data-bc-stories>ALL STORIES ↗</button></header>${stories.slice(0,4).map(s=>`<button class="kind-${esc(s.kind)}" data-bc-story="${esc(s.id)}"><small>${esc(s.kicker)}</small><strong>${esc(s.title)}</strong><span>${esc(s.body)}</span></button>`).join('')}</div>
      </section>
      <section class="bc-command-ribbon"><button data-bc-bracket>⌘ BRACKET CHAMBER</button><button data-bc-stories>✦ STORY ENGINE</button><button data-bc-night>◉ NIGHT OPS</button><button data-bc-autobroadcast>▶ AUTO BROADCAST</button><span>V5.7 · READ-ONLY SPATIAL LAYER</span></section>
    </div>`;
  }

  function bracketPlayer(row,label){
    if(!row)return `<div class="bc-bracket-player empty"><small>${esc(label)}</small><strong>—</strong></div>`;
    const sig=signature(row.name);
    return `<button class="bc-bracket-player" data-bc-player="${esc(row.name)}" style="--bc-h:${sig.hue};--bc-h2:${sig.hue2}"><small>${esc(label)}</small><strong>${esc(row.name)}</strong><span>#${num(row.rank)} · ${fmt(row.ppg)} PPG</span></button>`;
  }

  function renderBracket(){
    const d=data(),b=bracketState(d),honour=fifa10Honour(d);
    activate('bracket');
    const root=document.querySelector('#bcSceneBracket');if(!root)return;
    const stateLabel=b.locked?(isTR()?'GRUP AŞAMASI MÜHÜRLÜ':'GROUP STAGE SEALED'):(isTR()?'CANLI PROVİZYONEL AĞAÇ':'LIVE PROVISIONAL TREE');
    root.innerHTML=`<div class="su-scene-inner bc-bracket-shell">
      ${topBar(isTR()?'Spatial Bracket Chamber':'Spatial Bracket Chamber','FIFA 10 · CHAMPIONSHIP PATH',stateLabel,b.locked?(isTR()?'RESMÎ GRUP SIRALAMASI':'FINAL GROUP TABLE'):(isTR()?'SEZON ŞİMDİ BİTSE':'IF GROUP STAGE ENDED NOW'))}
      <section class="bc-bracket-stage ${b.locked?'locked':'provisional'}">
        <div class="bc-bracket-column playin"><header><span>CHAMPIONSHIP PLAY-IN</span><b>BEST OF 3</b></header>${b.pairs.map(pair=>`<article><em>PI-${pair.id}</em>${bracketPlayer(pair.a,`#${pair.aRank}`)}<i>VS</i>${bracketPlayer(pair.b,`#${pair.bRank}`)}<footer>${b.locked?(isTR()?'Katılımcılar final grup tablosundan kilitlendi.':'Participants locked from final group table.'):(isTR()?'Canlı sıralamaya göre provizyonel.':'Provisional from live standings.')}</footer></article>`).join('')}</div>
        <div class="bc-bracket-flow"><i></i><i></i><i></i><i></i></div>
        <div class="bc-bracket-column qf"><header><span>DIRECT QUARTER-FINALISTS</span><b>#1–#4</b></header>${b.direct.map((row,i)=>`<article>${bracketPlayer(row,`#${i+1} DIRECT QF`)}<div class="bc-open-slot"><small>${isTR()?'RAKİP':'OPPONENT'}</small><strong>${isTR()?'Resmî QF eşleşmesi bekleniyor':'Awaiting official QF pairing'}</strong><span>${isTR()?'Play-In kazananı burada resmî bracket mühürlenince yer alacak.':'A Play-In winner will appear only when the official bracket is sealed.'}</span></div></article>`).join('')}</div>
        <div class="bc-bracket-final-vault"><span>FINAL PATH</span>${honour?`<div class="bc-final-seal"><b>♛</b><strong>${esc(honour.winner)}</strong><small>FIFA 10 CHAMPION · OFFICIAL</small><button data-bc-final>OPEN FINAL NIGHT</button></div>`:`<div class="bc-final-seal pending"><b>◇</b><strong>${isTR()?'SONUÇ BEKLENİYOR':'OUTCOME PENDING'}</strong><small>${isTR()?'Knockout sonuçları resmî olarak girilmeden finalist/şampiyon üretilmez.':'No finalist or champion is generated before official knockout outcomes exist.'}</small></div>`}</div>
      </section>
      <footer class="bc-bracket-disclaimer"><b>${b.completed}/${b.total||0}</b><span>${isTR()?'grup fikstürü tamamlandı':'group fixtures completed'}</span><i>•</i><span>${isTR()?'Play-In eşleşmeleri 5–12, 6–11, 7–10, 8–9 kuralından gelir. QF bağlantısı resmî veri yoksa uydurulmaz.':'Play-In pairings follow 5–12, 6–11, 7–10, 8–9. QF links are never invented without official data.'}</span></footer>
    </div>`;
  }

  function renderStories(selected=state.selectedStory){
    const d=data(),stories=storyEngine(d);activate('stories');
    const root=document.querySelector('#bcSceneStories');if(!root)return;
    let active=stories.find(s=>s.id===selected)||stories[0]||null;if(active){state.selectedStory=active.id;save();}
    root.innerHTML=`<div class="su-scene-inner bc-stories-shell">
      ${topBar(isTR()?'Tournament Story Engine':'Tournament Story Engine','DATA-GROUNDED NARRATIVE',`${stories.length}`,isTR()?'AKTİF HİKÂYE SİNYALİ':'ACTIVE STORY SIGNALS')}
      <div class="bc-story-layout"><section class="bc-story-list">${stories.map((s,i)=>`<button data-bc-story="${esc(s.id)}" class="kind-${esc(s.kind)} ${active?.id===s.id?'active':''}"><em>${String(i+1).padStart(2,'0')}</em><div><small>${esc(s.kicker)}</small><strong>${esc(s.title)}</strong><span>${esc(s.body)}</span></div><b>${s.priority}</b></button>`).join('')||`<div class="bc-story-empty">${isTR()?'Henüz anlatılacak resmî veri sinyali yok.':'No official data signal to narrate yet.'}</div>`}</section><section class="bc-story-stage">${active?storyStage(active):'<div class="bc-story-empty">—</div>'}</section></div>
      <footer class="bc-story-rule"><b>TRUTH LAYER</b><span>${isTR()?'Story Engine maç dakikası, sonuç, şampiyon veya geçmiş liderlik değişimi uydurmaz. Değişim hikâyeleri yalnız bu tarayıcıda gerçekten önceki snapshot görüldüyse oluşturulur.':'The Story Engine never invents match minutes, outcomes, champions or historical leader changes. Change stories appear only when this browser actually observed the previous snapshot.'}</span></footer>
    </div>`;
  }

  function storyStage(s){
    return `<article class="bc-feature-story kind-${esc(s.kind)}"><header><span>${esc(s.kicker)}</span><b>PRIORITY ${Math.round(s.priority)}</b></header><h2>${esc(s.title)}</h2><p>${esc(s.body)}</p><div class="bc-evidence"><small>EVIDENCE</small><strong>${esc(s.evidence||'Official FIFA Universe data')}</strong></div><footer>${storyActionButton(s)}</footer></article>`;
  }

  function storyActionButton(s){
    if(s.action==='stadium')return `<button data-bc-stadium="${esc(s.meta||'')}">◉ SPATIAL STADIUM</button>`;
    if(s.action==='rivalry'&&Array.isArray(s.meta))return `<button data-bc-rivalry-a="${esc(s.meta[0])}" data-bc-rivalry-b="${esc(s.meta[1])}">∞ RIVALRY ARENA</button>`;
    if(s.action==='warroom')return '<button data-bc-warroom>⌬ QUALIFICATION WAR ROOM</button>';
    if(s.action==='bracket')return '<button data-bc-bracket>⌘ BRACKET CHAMBER</button>';
    if(s.action==='final')return '<button data-bc-final>♛ FINAL NIGHT PROTOCOL</button>';
    if(s.action==='player')return `<button data-bc-player="${esc(s.meta||'')}">◎ PLAYER PASSPORT</button>`;
    if(s.action==='broadcast')return '<button data-bc-command>▣ BROADCAST COMMAND</button>';
    return '<button data-bc-warroom>LIVE STANDINGS ↗</button>';
  }

  function performanceTier(){
    const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const cores=num(navigator.hardwareConcurrency)||4;
    const mem=num(navigator.deviceMemory)||4;
    const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent||'')||num(navigator.maxTouchPoints)>2;
    if(reduce||cores<=4||mem<=3)return 'safe';
    if(mobile||cores<=6||mem<=6)return 'balanced';
    return 'boost';
  }

  function applyPerformance(){
    const tier=performanceTier();state.performance=tier;save();
    document.documentElement.dataset.spatialPerformance=tier;
    const shell=document.querySelector('#suShell');if(shell)shell.dataset.performance=tier;
    return tier;
  }

  function finalNightProtocol(){
    const d=data(),honour=fifa10Honour(d);
    if(!honour){renderBracket();return;}
    rivalry()?.ceremony?.(10);
    setTimeout(()=>night()?.championship?.(10),7000);
    setTimeout(()=>visual()?.open?.('dynasty'),14000);
    setTimeout(()=>visual()?.open?.('records'),21000);
  }

  function directorSequence(){
    const d=data(),last=latestResult(d),stories=storyEngine(d),honour=fifa10Honour(d),seq=[];
    seq.push(()=>renderBroadcast());
    if(stories.length)seq.push(()=>renderStories(stories[0].id));
    seq.push(()=>renderBracket());
    if(last)seq.push(()=>stadium()?.stadium?.(last.id));
    if(honour)seq.push(()=>rivalry()?.ceremony?.(10));
    return seq;
  }

  function startAutoBroadcast(){
    stopAutoBroadcast(false);
    const seq=directorSequence();if(!seq.length)return;
    state.autoBroadcast=true;directorIndex=0;document.body.classList.add('bc-auto-broadcast');seq[0]();
    directorTimer=setInterval(()=>{if(!state.autoBroadcast)return;directorIndex=(directorIndex+1)%seq.length;seq[directorIndex]?.();},11000);
  }

  function stopAutoBroadcast(clearClass=true){
    state.autoBroadcast=false;if(directorTimer){clearInterval(directorTimer);directorTimer=null;}if(clearClass)document.body.classList.remove('bc-auto-broadcast');
  }

  function openBroadcast(){openShell();setTimeout(renderBroadcast,90);}
  function openBracket(){openShell();setTimeout(renderBracket,90);}
  function openStories(){openShell();setTimeout(()=>renderStories(),90);}

  function bind(){
    if(window.__FIFA_SPATIAL_BROADCAST_BOUND__)return;window.__FIFA_SPATIAL_BROADCAST_BOUND__=true;
    document.addEventListener('click',event=>{
      const tab=event.target.closest('[data-bc-tab]');if(tab){event.preventDefault();event.stopPropagation();const id=tab.dataset.bcTab;if(id==='broadcast')renderBroadcast();if(id==='bracket')renderBracket();if(id==='stories')renderStories();return;}
      if(event.target.closest('[data-bc-command]')){event.preventDefault();openBroadcast();return;}
      if(event.target.closest('[data-bc-bracket]')){event.preventDefault();openBracket();return;}
      if(event.target.closest('[data-bc-stories]')){event.preventDefault();openStories();return;}
      if(event.target.closest('[data-bc-warroom]')){event.preventDefault();night()?.warroom?.();return;}
      if(event.target.closest('[data-bc-night]')){event.preventDefault();night()?.control?.();return;}
      const pre=event.target.closest('[data-bc-prematch]');if(pre){event.preventDefault();rivalry()?.prematch?.(pre.dataset.bcPrematch);return;}
      const st=event.target.closest('[data-bc-stadium]');if(st){event.preventDefault();stadium()?.stadium?.(st.dataset.bcStadium);return;}
      const pl=event.target.closest('[data-bc-player]');if(pl){event.preventDefault();visual()?.museum?.(pl.dataset.bcPlayer);return;}
      const ra=event.target.closest('[data-bc-rivalry-a]');if(ra){event.preventDefault();rivalry()?.arena?.(ra.dataset.bcRivalryA,ra.dataset.bcRivalryB);return;}
      const story=event.target.closest('[data-bc-story]');if(story){event.preventDefault();renderStories(story.dataset.bcStory);return;}
      if(event.target.closest('[data-bc-final]')){event.preventDefault();finalNightProtocol();return;}
      if(event.target.closest('[data-bc-autobroadcast]')){event.preventDefault();startAutoBroadcast();return;}
    },true);

    document.addEventListener('keydown',event=>{
      if(/input|select|textarea/i.test(document.activeElement?.tagName||''))return;
      if(event.key==='b'||event.key==='B'){event.preventDefault();openBroadcast();}
      if(event.key==='j'||event.key==='J'){event.preventDefault();openBracket();}
      if(event.key==='y'||event.key==='Y'){event.preventDefault();openStories();}
      if(event.key==='a'||event.key==='A'){event.preventDefault();startAutoBroadcast();}
      if(event.key==='Escape'&&state.autoBroadcast)stopAutoBroadcast();
    });
  }

  function syncBuildLabels(){
    const version=document.querySelector('.sidebar-version');if(version)version.textContent='FIFA Universe · V5.7 · Broadcast Command';
    const crumb=document.querySelector('#hubBreadcrumb b');if(crumb)crumb.textContent='VERSION 5.7';
    const title=document.querySelector('#pageTitle');if(title&&/^FIFA Universe/i.test(title.textContent||''))title.textContent='FIFA Universe 5.7';
  }

  function dataKey(d=data()){
    const t=table(d),p=progress(d),last=latestResult(d),honour=fifa10Honour(d);
    return [p.done,p.total,t[0]?.name,t[0]?.ppg,t[3]?.name,t[3]?.ppg,t[11]?.name,t[11]?.ppg,last?.id,honour?.winner].join('|');
  }

  function maintenance(){
    syncBuildLabels();applyPerformance();
    if(!document.body.classList.contains('su-open'))return;
    ensureScenes();
    const key=dataKey();
    if(key===state.lastDataKey)return;state.lastDataKey=key;
    if(state.scene==='broadcast')renderBroadcast();
    else if(state.scene==='bracket')renderBracket();
    else if(state.scene==='stories')renderStories(state.selectedStory);
  }

  function init(){
    const wait=()=>{
      if(!visual()||!night()||!rivalry()||!stadium()){setTimeout(wait,140);return;}
      ensureScenes();bind();syncBuildLabels();applyPerformance();
      maintenanceTimer=setInterval(maintenance,4500);
      window.INFANTINO_SIGNATURE={version:VERSION,signature};
      window.INFANTINO_BROADCAST={version:VERSION,build:BUILD,open:openBroadcast,broadcast:openBroadcast,bracket:openBracket,stories:openStories,auto:startAutoBroadcast,stop:stopAutoBroadcast,final:finalNightProtocol,storyEngine,data,signature};
      window.__FIFA_SPATIAL_BROADCAST_V570__=true;
    };
    wait();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
