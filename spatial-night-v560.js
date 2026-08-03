(() => {
  'use strict';

  const VERSION = '5.6.0';
  const BUILD = '572000';
  const STATE_KEY = 'fifa-spatial-night-v560';
  const SCENES = ['controlroom','warroom','corridor','walkout','championship'];
  let syncTimer = null;
  let maintenanceTimer = null;

  const isTR = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();
  const num = value => Number(value || 0);
  const clamp = (value,min=0,max=100) => Math.max(min,Math.min(max,Number(value)||0));
  const fmt = (value,digits=1) => Number(value||0).toLocaleString(isTR()?'tr-TR':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const initials = name => String(name||'?').split(/\s+/).filter(Boolean).map(p=>p[0]).slice(0,2).join('').toLocaleUpperCase('tr-TR');
  const hash = text => { let h=2166136261; for(const c of String(text||'')){h^=c.charCodeAt(0);h=Math.imul(h,16777619);} return h>>>0; };

  const persisted = (()=>{try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')||{};}catch(_){return{};}})();
  const state = {
    scene: '',
    corridorA: persisted.corridorA || '',
    corridorB: persisted.corridorB || '',
    fixtureId: persisted.fixtureId || '',
    ceremonyEdition: num(persisted.ceremonyEdition) || 10,
    atmosphere: persisted.atmosphere !== false,
    director: false,
    directorTimer: null,
    directorIndex: 0
  };

  function save(){
    try{localStorage.setItem(STATE_KEY,JSON.stringify({corridorA:state.corridorA,corridorB:state.corridorB,fixtureId:state.fixtureId,ceremonyEdition:state.ceremonyEdition,atmosphere:state.atmosphere}));}catch(_){}
  }

  function visual(){return window.INFANTINO_VISUAL||null;}
  function rivalry(){return window.INFANTINO_RIVALRY||null;}
  function stadium(){return window.INFANTINO_STADIUM||null;}
  function data(){try{return visual()?.data?.()||{};}catch(_){return{};}}

  function playerNames(d=data()){
    const names=new Set();
    (d?.universe?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.allTime?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.fpi?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.standings||[]).forEach(p=>p?.name&&names.add(p.name));
    return [...names].sort((a,b)=>a.localeCompare(b,'tr'));
  }

  function playerInfo(name,d=data()){
    const key=normalize(name); if(!key)return null;
    const u=(d?.universe?.players||[]).find(p=>normalize(p.name)===key)||null;
    const a=(d?.allTime?.players||[]).find(p=>normalize(p.name)===key)||null;
    const f=(d?.fpi?.players||[]).find(p=>normalize(p.name)===key)||null;
    const s=(d?.standings||[]).find(p=>normalize(p.name)===key)||null;
    if(!u&&!a&&!f&&!s)return null;
    return {name:u?.name||a?.name||f?.name||s?.name||name,u,a,f,s};
  }

  function standings(d=data()){
    return [...(d?.standings||[])].sort((a,b)=>(num(a.rank)||999)-(num(b.rank)||999)||num(b.ppg)-num(a.ppg));
  }

  function hasScore(m){
    return m && m.homeScore !== null && m.homeScore !== undefined && m.homeScore !== '' && m.awayScore !== null && m.awayScore !== undefined && m.awayScore !== '' && Number.isFinite(Number(m.homeScore)) && Number.isFinite(Number(m.awayScore));
  }

  function pendingFixtures(d=data()){
    const draw=d?.draw||{};
    const namesById=new Map(standings(d).map(r=>[String(r.id),r.name]));
    const snapshot=draw?.playerSnapshot||draw?.players||draw?.participants||[];
    (Array.isArray(snapshot)?snapshot:[]).forEach(p=>p?.id&&p?.name&&namesById.set(String(p.id),p.name));
    return (draw?.fixtures||[]).filter(m=>!m.completed&&!hasScore(m)).map(m=>({
      ...m,
      homeName:m.homeName||namesById.get(String(m.homeId))||'—',
      awayName:m.awayName||namesById.get(String(m.awayId))||'—'
    })).sort((a,b)=>num(a.matchday)-num(b.matchday)||String(a.id).localeCompare(String(b.id)));
  }

  function completedMatches(d=data()){
    const rows=d?.universe?.matches?.length?d.universe.matches:(d?.matches||[]);
    return [...rows].filter(m=>m&&hasScore(m));
  }

  function matchesBetween(a,b,d=data()){
    const ak=normalize(a),bk=normalize(b);
    return completedMatches(d).filter(m=>{
      const h=normalize(m.homeName),w=normalize(m.awayName);
      return (h===ak&&w===bk)||(h===bk&&w===ak);
    }).sort((x,y)=>num(x.edition)-num(y.edition)||String(x.id).localeCompare(String(y.id)));
  }

  function zone(rank){
    rank=num(rank)||999;
    if(rank<=4)return {id:'qf',label:'DIRECT QF',short:'QF'};
    if(rank<=12)return {id:'playin',label:'PLAY-IN',short:'PI'};
    return {id:'out',label:isTR()?'ELEME HATTI':'ELIMINATION',short:'OUT'};
  }

  function remainingFor(name,d=data()){
    const key=normalize(name);return pendingFixtures(d).filter(f=>normalize(f.homeName)===key||normalize(f.awayName)===key).length;
  }

  function fixturePressure(f,d=data()){
    const table=standings(d);
    const h=table.find(r=>normalize(r.name)===normalize(f.homeName));
    const a=table.find(r=>normalize(r.name)===normalize(f.awayName));
    let score=28;
    const ranks=[num(h?.rank)||99,num(a?.rank)||99];
    if(ranks.some(r=>r<=4))score+=24;
    if(ranks.some(r=>r>=4&&r<=6))score+=18;
    if(ranks.some(r=>r>=11&&r<=13))score+=20;
    if(num(f.matchday)>=6)score+=10;
    if(num(f.stars)>=5)score+=6;
    return clamp(score,12,100);
  }

  function cutlineDelta(row,table){
    const rank=num(row?.rank)||999,ppg=num(row?.ppg);
    if(rank<=4){const cut=num(table[4]?.ppg);return {label:isTR()?'QF tamponu':'QF buffer',value:ppg-cut};}
    if(rank<=12){const qf=num(table[3]?.ppg);const out=num(table[12]?.ppg);return rank<=8?{label:isTR()?'QF farkı':'QF gap',value:ppg-qf}:{label:isTR()?'Eleme tamponu':'Safety buffer',value:ppg-out};}
    const cut=num(table[11]?.ppg);return {label:isTR()?'Play-In farkı':'Play-In gap',value:ppg-cut};
  }

  function pressureForRow(row,d=data()){
    const r=num(row?.rank)||99,rem=remainingFor(row?.name,d),delta=cutlineDelta(row,standings(d)).value;
    let p=35+Math.min(30,rem*5);
    if([4,5,11,12,13].includes(r))p+=25;
    else if([3,6,10].includes(r))p+=15;
    p+=Math.max(0,18-Math.abs(delta)*20);
    return clamp(p,18,100);
  }

  function progress(d=data()){
    const fixtures=d?.draw?.fixtures||[];
    const done=fixtures.filter(m=>m.completed||hasScore(m)).length;
    return {done,total:fixtures.length,pct:fixtures.length?done/fixtures.length*100:0};
  }

  function officialHonours(d=data()){
    return [...(d?.universe?.honours||[])].filter(h=>h?.competition==='oruc'&&h?.winner).sort((a,b)=>num(a.edition)-num(b.edition));
  }

  function editionHonour(edition,d=data()){
    return officialHonours(d).find(h=>num(h.edition)===num(edition))||null;
  }

  function metric(info,key){
    const u=info?.u||{},a=info?.a||{},f=info?.f||{},s=info?.s||{};
    const map={
      legacy:num(u.legacy??u.legacyScore??a.legacyRating??f.legacy),
      form:num(u.momentumScore??u.momentum??f.momentumScore??f.momentum),
      big:num(u.bigMatchScore??u.bigMatch??f.bigMatchScore??f.bigMatch),
      attack:num(u.attackScore??u.attack??f.attackScore??f.attack),
      defence:num(u.defenceScore??u.defence??f.defenceScore??f.defence),
      titles:num(a.titles??u.titles),
      ppg:num(s.ppg??a.ppg??u.ppg),
      rank:num(s.rank??f.rank),
      rating:num(s.rating??s.elo??f.rating)
    };
    return map[key]||0;
  }

  function walkoutIdentity(info){
    const titles=metric(info,'titles'),legacy=metric(info,'legacy'),big=metric(info,'big'),form=metric(info,'form'),rank=metric(info,'rank');
    let archetype='CONTENDER',tag=isTR()?'Meydan Okuyan':'Contender';
    if(titles>=3||legacy>=88){archetype='DYNASTY ICON';tag=isTR()?'Hanedan İkonu':'Dynasty Icon';}
    else if(titles>=1&&big>=78){archetype='BIG NIGHT KING';tag=isTR()?'Büyük Gece Oyuncusu':'Big-Night Player';}
    else if(rank&&rank<=3&&form>=65){archetype='TITLE HUNTER';tag=isTR()?'Şampiyonluk Avcısı':'Title Hunter';}
    else if(form>=78){archetype='MOMENTUM SURGE';tag=isTR()?'Form Patlaması':'Momentum Surge';}
    else if(metric(info,'defence')>=80){archetype='IRON WALL';tag=isTR()?'Demir Duvar':'Iron Wall';}
    const hue=hash(info?.name||'player')%360;
    const intensity=clamp(40+titles*9+legacy*.25+form*.18,35,100);
    return {archetype,tag,hue,intensity};
  }

  function ensureScenes(){
    const shell=document.querySelector('#suShell');if(!shell)return false;
    const brandSmall=shell.querySelector('.su-brand small');if(brandSmall)brandSmall.textContent='FIFA UNIVERSE V5.7 · BROADCAST COMMAND DECK';
    const tabs=shell.querySelector('.su-scene-tabs');
    if(tabs&&!tabs.querySelector('[data-tn-tab="controlroom"]')){
      tabs.insertAdjacentHTML('beforeend','<button type="button" data-tn-tab="controlroom">◉ NIGHT OPS</button><button type="button" data-tn-tab="warroom">⌬ QUALIFY</button><button type="button" data-tn-tab="corridor">∞ H2H</button><button type="button" data-tn-tab="walkout">▰ WALKOUT</button>');
    }
    const body=shell.querySelector('.su-body');
    if(body&&!body.querySelector('#tnSceneControlroom')){
      body.insertAdjacentHTML('beforeend',SCENES.map(id=>`<section class="su-scene tn-scene" data-scene="tn-${id}" id="tnScene${id[0].toUpperCase()+id.slice(1)}"></section>`).join(''));
    }
    const actions=shell.querySelector('.su-top-actions');
    if(actions&&!actions.querySelector('[data-tn-control]'))actions.insertAdjacentHTML('afterbegin','<button type="button" data-tn-control>◉ NIGHT CONTROL</button>');
    return true;
  }

  function activate(id){
    ensureScenes();
    document.body.classList.add('ss-extension-scene-open','tn-extension-open');
    document.querySelectorAll('#suShell .su-scene').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('#suShell [data-su-tab],[data-ss-tab],[data-rf-tab],[data-tn-tab]').forEach(el=>el.classList.remove('active'));
    document.querySelector(`#tnScene${id[0].toUpperCase()+id.slice(1)}`)?.classList.add('active');
    document.querySelector(`[data-tn-tab="${id}"]`)?.classList.add('active');
    state.scene=id;
  }

  function closeScene(){state.scene='';document.body.classList.remove('tn-extension-open','ss-extension-scene-open');}
  function openShell(){visual()?.open?.();setTimeout(ensureScenes,50);}

  function sceneHeader(kicker,title,text,stat,statLabel){
    return `<header class="tn-heading"><div><span>${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div><aside><b>${esc(stat)}</b><small>${esc(statLabel)}</small></aside></header>`;
  }

  function rowCard(row,d=data()){
    const z=zone(row.rank),p=pressureForRow(row,d),rem=remainingFor(row.name,d),delta=cutlineDelta(row,standings(d));
    return `<article class="tn-table-row zone-${z.id}"><b>#${num(row.rank)||'—'}</b><div><strong>${esc(row.name)}</strong><small>${z.label} · ${rem} ${isTR()?'maç kaldı':'left'}</small></div><span>${fmt(row.ppg,3)} PPG</span><em>${delta.value>=0?'+':''}${fmt(delta.value,3)}<small>${esc(delta.label)}</small></em><i title="Pressure ${Math.round(p)}"><u style="width:${p}%"></u></i></article>`;
  }

  function renderControlRoom(){
    const d=data(),table=standings(d),pending=pendingFixtures(d),done=completedMatches(d).slice(-6).reverse(),prog=progress(d);
    activate('controlroom');
    const root=document.querySelector('#tnSceneControlroom');if(!root)return;
    const next=[...pending].sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];
    const bubble=table.filter(r=>[3,4,5,6,10,11,12,13].includes(num(r.rank))).slice(0,8);
    root.innerHTML=`<div class="su-scene-inner tn-night-shell">
      ${sceneHeader('FIFA 10 · TOURNAMENT NIGHT CONTROL ROOM',isTR()?'Turnuva Gecesi Komuta Merkezi':'Tournament Night Control Room',isTR()?'Fikstür, canlı tablo, son sonuçlar ve uzaysal sahne kuyruğu tek TV yüzeyinde. Bu merkez yalnız okur ve yönlendirir; sonuç kaydetmez.':'Fixtures, live table, latest results and the spatial scene queue on one TV-oriented surface. This centre reads and navigates only; it never writes results.',`${prog.done}/${prog.total||0}`,isTR()?'TAMAMLANAN FİKSTÜR':'FIXTURES COMPLETE')}
      <section class="tn-night-hero"><div class="tn-night-progress"><span>TOURNAMENT COMPLETION</span><strong>${Math.round(prog.pct)}%</strong><i><b style="width:${prog.pct}%"></b></i></div><div class="tn-night-next"><span>NEXT HIGH-PRESSURE MATCH</span>${next?`<h3>${esc(next.homeName)} <em>VS</em> ${esc(next.awayName)}</h3><p>MD ${num(next.matchday)||'—'} · ${num(next.stars)||'—'}★ · PRESSURE ${Math.round(fixturePressure(next,d))}</p><button data-tn-prematch="${esc(next.id)}">PRE-MATCH ARENA ↗</button>`:`<h3>${isTR()?'Bekleyen maç yok':'No pending fixture'}</h3>`}</div></section>
      <div class="tn-control-grid">
        <section class="tn-control-panel tn-live-table"><header><span>LIVE QUALIFICATION TABLE</span><b>${table.length} PLAYERS</b></header><div>${table.slice(0,13).map(r=>rowCard(r,d)).join('')}</div><footer><button data-tn-warroom>⌬ ${isTR()?'QUALIFICATION WAR ROOM':'QUALIFICATION WAR ROOM'}</button></footer></section>
        <section class="tn-control-panel tn-bubble"><header><span>PRESSURE BUBBLE</span><b>CUTLINES</b></header><div>${bubble.map(r=>{const p=pressureForRow(r,d),z=zone(r.rank);return `<article><div><b>#${r.rank}</b><strong>${esc(r.name)}</strong><small>${z.label}</small></div><span>${Math.round(p)}<small>PRESSURE</small></span><i><b style="width:${p}%"></b></i></article>`;}).join('')||'<p class="tn-empty">—</p>'}</div></section>
        <section class="tn-control-panel tn-fixtures"><header><span>UPCOMING FIXTURES</span><b>${pending.length} OPEN</b></header><div>${pending.slice(0,8).map(f=>`<button data-tn-prematch="${esc(f.id)}"><span>MD ${num(f.matchday)||'—'} · ${num(f.stars)||'—'}★</span><strong>${esc(f.homeName)} <em>VS</em> ${esc(f.awayName)}</strong><small>PRESSURE ${Math.round(fixturePressure(f,d))}</small></button>`).join('')||`<p class="tn-empty">${isTR()?'Bekleyen fikstür yok.':'No pending fixture.'}</p>`}</div></section>
        <section class="tn-control-panel tn-results"><header><span>LATEST OFFICIAL RESULTS</span><b>LAST 6</b></header><div>${done.map(m=>`<button data-tn-stadium="${esc(m.id)}"><span>FIFA ${String(num(m.edition)).padStart(2,'0')} · ${esc(m.stage||'')}</span><strong>${esc(m.homeName)} <em>${m.homeScore}–${m.awayScore}</em> ${esc(m.awayName)}</strong></button>`).join('')||`<p class="tn-empty">${isTR()?'Sonuç yok.':'No results.'}</p>`}</div></section>
      </div>
      <section class="tn-scene-queue"><span>SPATIAL SCENE QUEUE</span><button data-tn-warroom>⌬ QUALIFICATION</button><button data-tn-walkout>▰ WALKOUT</button><button data-tn-corridor>∞ RIVALRY HISTORY</button><button data-tn-championship>♛ CEREMONY 2.0</button><button data-tn-director>✦ NIGHT DIRECTOR</button></section>
    </div>`;
  }

  function pairingHtml(table){
    const pairs=[[5,12],[6,11],[7,10],[8,9]];
    return pairs.map(([a,b],idx)=>{const x=table[a-1],y=table[b-1];return `<article><span>PLAY-IN ${idx+1}</span><strong>${x?`#${a} ${esc(x.name)}`:'—'} <em>VS</em> ${y?`#${b} ${esc(y.name)}`:'—'}</strong><small>${isTR()?'Sezon şimdi bitse':'If the season ended now'}</small></article>`;}).join('');
  }

  function renderWarRoom(){
    const d=data(),table=standings(d),prog=progress(d);
    activate('warroom');
    const root=document.querySelector('#tnSceneWarroom');if(!root)return;
    const direct=table.filter(r=>num(r.rank)<=4),playin=table.filter(r=>num(r.rank)>=5&&num(r.rank)<=12),out=table.filter(r=>num(r.rank)>=13);
    root.innerHTML=`<div class="su-scene-inner tn-war-shell">
      ${sceneHeader('SPATIAL QUALIFICATION WAR ROOM',isTR()?'Her sıra bir yol, her kesme çizgisi bir savaş':'Every rank is a path, every cutline is a battle',isTR()?'Burada olasılık uydurulmuyor. Güncel sıra, gerçek PPG, kalan maç sayısı ve QF / Play-In kesme çizgileri görselleştiriliyor.':'No fabricated qualification probabilities. This room visualises current rank, actual PPG, remaining fixtures and QF / Play-In cutlines.',`${Math.round(prog.pct)}%`,'TOURNAMENT COMPLETE')}
      <section class="tn-war-map"><div class="tn-zone qf"><header><span>DIRECT QUARTER-FINAL</span><b>#1–#4</b></header>${direct.map(r=>rowCard(r,d)).join('')}</div><div class="tn-zone playin"><header><span>PLAY-IN ZONE</span><b>#5–#12</b></header>${playin.map(r=>rowCard(r,d)).join('')}</div><div class="tn-zone out"><header><span>ELIMINATION LINE</span><b>#13+</b></header>${out.map(r=>rowCard(r,d)).join('')||`<p>${isTR()?'Şu anda eleme hattında oyuncu yok.':'No player is currently below the line.'}</p>`}</div></section>
      <section class="tn-provisional-bracket"><header><span>PROVISIONAL PLAY-IN BRACKET</span><b>${isTR()?'SEZON ŞİMDİ BİTSE':'IF SEASON ENDED NOW'}</b></header><div>${pairingHtml(table)}</div></section>
      <section class="tn-cutline-intel"><article><span>QF CUTLINE</span><b>${table[3]?`#4 ${esc(table[3].name)} · ${fmt(table[3].ppg,3)} PPG`:'—'}</b><small>${table[4]?`${isTR()?'İlk takipçi':'First chaser'}: #5 ${esc(table[4].name)} · ${fmt(table[4].ppg,3)} PPG`:''}</small></article><article><span>PLAY-IN CUTLINE</span><b>${table[11]?`#12 ${esc(table[11].name)} · ${fmt(table[11].ppg,3)} PPG`:'—'}</b><small>${table[12]?`${isTR()?'Kesme altı':'Below line'}: #13 ${esc(table[12].name)} · ${fmt(table[12].ppg,3)} PPG`:''}</small></article><article><span>FIXTURES OPEN</span><b>${pendingFixtures(d).length}</b><small>${isTR()?'Sonuçlar geldikçe savaş odası anında güncellenir.':'War Room updates as official results arrive.'}</small></article></section>
    </div>`;
  }

  function corridorDefaultPair(d=data()){
    const rivalries=d?.universe?.rivalries||d?.allTime?.rivalries||[];
    const r=rivalries[0]||{};let a=r.playerA||r.a||'',b=r.playerB||r.b||'';
    const names=playerNames(d);if(!a)a=names[0]||'';if(!b||normalize(a)===normalize(b))b=names.find(n=>normalize(n)!==normalize(a))||'';
    return [a,b];
  }

  function renderCorridor(a=state.corridorA,b=state.corridorB){
    const d=data(),names=playerNames(d);if(names.length<2)return;
    if(!a||!names.some(n=>normalize(n)===normalize(a))){[a,b]=corridorDefaultPair(d);}
    if(!b||normalize(a)===normalize(b)||!names.some(n=>normalize(n)===normalize(b)))b=names.find(n=>normalize(n)!==normalize(a))||names[1];
    state.corridorA=a;state.corridorB=b;save();activate('corridor');
    const rows=matchesBetween(a,b,d);
    let aw=0,bw=0,draws=0;rows.forEach(m=>{const homeA=normalize(m.homeName)===normalize(a),as=homeA?num(m.homeScore):num(m.awayScore),bs=homeA?num(m.awayScore):num(m.homeScore);if(as>bs)aw++;else if(bs>as)bw++;else draws++;});
    const root=document.querySelector('#tnSceneCorridor');if(!root)return;
    root.innerHTML=`<div class="su-scene-inner tn-corridor-shell">
      ${sceneHeader('RIVALRY HISTORY CORRIDOR',`${a} × ${b}`,isTR()?'Her resmî karşılaşma kronolojik bir kapı. Bir maça dokun ve doğrudan Spatial Stadium’a gir.':'Every official meeting becomes a chronological portal. Touch a match and enter Spatial Stadium directly.',`${rows.length}`,isTR()?'RESMÎ KARŞILAŞMA':'OFFICIAL MEETINGS')}
      <div class="tn-corridor-controls"><select id="tnCorridorA">${names.map(n=>`<option value="${esc(n)}" ${normalize(n)===normalize(a)?'selected':''}>${esc(n)}</option>`).join('')}</select><span>VS</span><select id="tnCorridorB">${names.map(n=>`<option value="${esc(n)}" ${normalize(n)===normalize(b)?'selected':''}>${esc(n)}</option>`).join('')}</select><button data-tn-arena="${esc(a)}|${esc(b)}">⚔ RIVALRY ARENA</button></div>
      <section class="tn-corridor-score"><article><span>${esc(a)}</span><b>${aw}</b><small>WINS</small></article><article><span>DRAW</span><b>${draws}</b><small>${rows.length} MP</small></article><article><span>${esc(b)}</span><b>${bw}</b><small>WINS</small></article></section>
      <div class="tn-history-track">${rows.length?rows.map((m,index)=>{const homeA=normalize(m.homeName)===normalize(a),as=homeA?m.homeScore:m.awayScore,bs=homeA?m.awayScore:m.homeScore;const winner=num(as)>num(bs)?'a':num(bs)>num(as)?'b':'draw';return `<button class="tn-history-node ${winner}" data-tn-stadium="${esc(m.id)}" style="--i:${index}"><i></i><span>FIFA ${String(num(m.edition)).padStart(2,'0')}</span><strong>${esc(a)} <em>${as}–${bs}</em> ${esc(b)}</strong><small>${esc(m.stage||'Official Match')}</small></button>`;}).join(''):`<div class="tn-empty-history"><b>∞</b><span>${isTR()?'Bu iki oyuncu arasında resmî maç bulunamadı.':'No official meeting found between these players.'}</span></div>`}</div>
    </div>`;
  }

  function walkoutCard(name,side,d=data()){
    const info=playerInfo(name,d),id=walkoutIdentity(info),z=zone(metric(info,'rank'));
    return `<article class="tn-walkout-player ${side}" style="--tn-hue:${id.hue};--tn-intensity:${id.intensity}%"><div class="tn-walkout-aura"></div><div class="tn-walkout-avatar">${esc(initials(name))}</div><span>${esc(id.archetype)}</span><h3>${esc(name)}</h3><p>${esc(id.tag)}</p><div class="tn-walkout-stats"><b>#${metric(info,'rank')||'—'}<small>STANDING</small></b><b>${fmt(metric(info,'ppg'),3)}<small>PPG</small></b><b>${Math.round(metric(info,'legacy'))}<small>LEGACY</small></b><b>${metric(info,'titles')}<small>TITLES</small></b></div><footer><i style="width:${clamp(metric(info,'form'))}%"></i><small>${Math.round(metric(info,'form'))} MOMENTUM · ${z.label}</small></footer></article>`;
  }

  function renderWalkout(fixtureId=state.fixtureId){
    const d=data(),fixtures=pendingFixtures(d);activate('walkout');
    const root=document.querySelector('#tnSceneWalkout');if(!root)return;
    if(!fixtures.length){root.innerHTML=`<div class="su-scene-inner tn-empty-screen"><span>PLAYER WALKOUT IDENTITY</span><h2>${isTR()?'Bekleyen FIFA 10 maçı yok.':'No pending FIFA 10 fixture.'}</h2><p>${isTR()?'Yeni fikstür geldiğinde walkout sahnesi otomatik hazırlanır.':'The walkout scene will be ready when a new fixture appears.'}</p></div>`;return;}
    const f=fixtures.find(x=>String(x.id)===String(fixtureId))||[...fixtures].sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];state.fixtureId=String(f.id);save();
    const pressure=fixturePressure(f,d);
    root.innerHTML=`<div class="su-scene-inner tn-walkout-shell">
      ${sceneHeader('DYNAMIC WALKOUT IDENTITY',isTR()?'Tünel ışıkları artık oyuncunun kariyerini taşıyor':'The tunnel now carries each player’s career identity',isTR()?'Aura, kimlik ve ışık yoğunluğu Standing, Legacy, momentum ve resmî şampiyonluk geçmişinden türetilir.':'Aura, identity and light intensity are derived from Standing, Legacy, momentum and official championship history.',`${Math.round(pressure)}`,'MATCH PRESSURE')}
      <section class="tn-walkout-stage"><div class="tn-tunnel-lines"></div>${walkoutCard(f.homeName,'home',d)}<div class="tn-walkout-seal"><span>FIFA 10</span><strong>VS</strong><b>MD ${num(f.matchday)||'—'}</b><small>${num(f.stars)||'—'}★</small></div>${walkoutCard(f.awayName,'away',d)}</section>
      <div class="tn-walkout-fixtures">${fixtures.slice(0,10).map(x=>`<button class="${String(x.id)===String(f.id)?'active':''}" data-tn-walkout-fixture="${esc(x.id)}"><span>MD ${num(x.matchday)||'—'}</span><strong>${esc(x.homeName)} <em>VS</em> ${esc(x.awayName)}</strong></button>`).join('')}</div>
      <footer class="tn-action-row"><button data-tn-prematch="${esc(f.id)}">◈ PRE-MATCH ARENA</button><button data-tn-arena="${esc(f.homeName)}|${esc(f.awayName)}">⚔ RIVALRY ARENA</button></footer>
    </div>`;
  }

  function trophyMarkup(edition){const label=String(num(edition)).padStart(2,'0');return `<div class="tn-ceremony-trophy"><i></i><i></i><b>${label}</b><span></span></div>`;}

  function renderChampionship(edition=state.ceremonyEdition){
    const d=data(),honours=officialHonours(d),f10=honours.find(h=>num(h.edition)===10),selected=honours.find(h=>num(h.edition)===num(edition))||f10||honours.at(-1)||null;
    state.ceremonyEdition=selected?num(selected.edition):10;save();activate('championship');
    const root=document.querySelector('#tnSceneChampionship');if(!root)return;
    if(!selected){
      const table=standings(d);
      root.innerHTML=`<div class="su-scene-inner tn-champ-wait">${sceneHeader('CHAMPIONSHIP CEREMONY 2.0','FIFA 10 · CEREMONY STANDBY',isTR()?'Resmî FIFA 10 honours kaydı mühürlenene kadar podyum oluşturulmaz.':'No podium is generated until the official FIFA 10 honours record is sealed.','LIVE',isTR()?'ŞAMPİYONLUK YARIŞI':'TITLE RACE')}<div class="tn-title-race">${table.slice(0,4).map(r=>`<article><b>#${r.rank}</b><strong>${esc(r.name)}</strong><span>${fmt(r.ppg,3)} PPG</span></article>`).join('')}</div><p>${isTR()?'Bu ekran resmî sonuç üretmez; yalnız mevcut yarış durumunu gösterir.':'This screen never creates an official result; it only shows the current race.'}</p></div>`;return;
    }
    const isF10=num(selected.edition)===10;
    root.innerHTML=`<div class="su-scene-inner tn-champ-shell">
      ${sceneHeader('CHAMPIONSHIP CEREMONY 2.0',`FIFA ${String(num(selected.edition)).padStart(2,'0')} · ${isTR()?'MÜHÜRLENMİŞ PODYUM':'SEALED PODIUM'}`,isTR()?'Yalnız resmî honours verisi. Podyum, ışık ve kupa sekansı veriyi değiştirmeden sinematik olarak canlandırılır.':'Official honours data only. Podium, lighting and trophy sequence are cinematic and never alter the record.',isF10?'FIFA 10':'HISTORY','OFFICIAL HONOURS')}
      <section class="tn-ceremony-2"><div class="tn-ceremony-beams"></div><div class="tn-crowd-glow"></div><article class="third"><span>3</span><strong>${esc(selected.third||'—')}</strong><small>THIRD PLACE</small></article><article class="champion">${trophyMarkup(selected.edition)}<span>♛ CHAMPION</span><h3>${esc(selected.winner)}</h3><small>FIFA ${String(num(selected.edition)).padStart(2,'0')}</small></article><article class="second"><span>2</span><strong>${esc(selected.runnerUp||'—')}</strong><small>RUNNER-UP</small></article></section>
      <div class="tn-ceremony-sequence"><i class="active">01 <b>LIGHTS</b></i><i>02 <b>PODIUM</b></i><i>03 <b>TROPHY</b></i><i>04 <b>LEGACY SEAL</b></i></div>
      <div class="tn-edition-strip">${honours.map(h=>`<button class="${num(h.edition)===num(selected.edition)?'active':''}" data-tn-champ-edition="${num(h.edition)}">FIFA ${String(num(h.edition)).padStart(2,'0')}</button>`).join('')}</div>
      <footer class="tn-action-row"><button data-su-open-passport="${esc(selected.winner)}">♛ ${isTR()?'ŞAMPİYON PASAPORTU':'CHAMPION PASSPORT'}</button><button data-tn-corridor-from="${esc(selected.winner)}|${esc(selected.runnerUp||'')}">∞ ${isTR()?'FİNAL REKABET TARİHİ':'FINAL RIVALRY HISTORY'}</button></footer>
    </div>`;
  }

  function stadiumAtmosphere(){
    if(!state.atmosphere)return;
    const scene=document.querySelector('#ssSceneStadium');if(!scene?.classList.contains('active'))return;
    const d=data(),matchId=stadium()?.data?.()?.matchId||'';
    let m=null;
    if(matchId)m=completedMatches(d).find(x=>String(x.id)===String(matchId));
    if(!m){const text=scene.textContent||'';m=completedMatches(d).find(x=>text.includes(x.homeName)&&text.includes(x.awayName));}
    const shell=scene.querySelector('.ss-stadium-shell');if(!shell||!m)return;
    const stage=normalize(m.stage);let level=38;
    if(/final/.test(stage))level=100;else if(/semi|yari/.test(stage))level=82;else if(/quarter|ceyrek/.test(stage))level=68;else if(/play|eleme/.test(stage))level=58;
    level=clamp(level+(num(m.homeScore)+num(m.awayScore))*2,35,100);
    shell.style.setProperty('--tn-atmosphere',`${level}%`);
    shell.classList.toggle('tn-atmosphere-max',level>=85);
    shell.classList.toggle('tn-atmosphere-high',level>=65&&level<85);
    if(!shell.querySelector('.tn-stadium-atmosphere'))shell.insertAdjacentHTML('afterbegin',`<div class="tn-stadium-atmosphere"><i></i><i></i><i></i><span>ATMOSPHERE <b>${Math.round(level)}</b></span></div>`);
    else shell.querySelector('.tn-stadium-atmosphere span b').textContent=Math.round(level);
  }

  function renderGpuBadge(){
    const shell=document.querySelector('#suShell');if(!shell)return;
    const actions=shell.querySelector('.su-top-actions');if(!actions||actions.querySelector('.tn-perf-badge'))return;
    const gpu=Boolean(navigator.gpu),cores=num(navigator.hardwareConcurrency)||0;
    const tier=gpu&&cores>=8?'SPATIAL BOOST':cores>=6?'HIGH':'SAFE';
    const badge=document.createElement('span');badge.className='tn-perf-badge';badge.textContent=`${gpu?'GPU READY':'CSS/SVG'} · ${tier}`;actions.prepend(badge);
    document.documentElement.dataset.tnPerf=gpu&&cores>=8?'boost':cores>=6?'high':'safe';
  }

  function nightDirectorSequence(){
    const d=data(),pending=pendingFixtures(d),latest=completedMatches(d).at(-1),pairs=corridorDefaultPair(d),h10=editionHonour(10,d);
    const high=[...pending].sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];
    const seq=[()=>renderControlRoom(),()=>renderWarRoom()];
    if(high){seq.push(()=>renderWalkout(high.id));seq.push(()=>rivalry()?.prematch?.(high.id));}
    if(pairs[0]&&pairs[1])seq.push(()=>renderCorridor(pairs[0],pairs[1]));
    if(latest&&stadium()?.open)seq.push(()=>{closeScene();stadium().open(latest.id);setTimeout(stadiumAtmosphere,180);});
    if(h10)seq.push(()=>renderChampionship(10));
    else seq.push(()=>renderChampionship());
    return seq;
  }

  function stopDirector(){state.director=false;if(state.directorTimer){clearInterval(state.directorTimer);state.directorTimer=null;}document.body.classList.remove('tn-night-director');document.querySelector('[data-tn-director]')?.classList.remove('active');}
  function startDirector(){
    stopDirector();const seq=nightDirectorSequence();if(!seq.length)return;state.director=true;document.body.classList.add('tn-night-director');state.directorIndex=0;seq[0]();state.directorTimer=setInterval(()=>{if(!state.director)return;state.directorIndex=(state.directorIndex+1)%seq.length;seq[state.directorIndex]?.();},9000);
  }

  function openControl(){openShell();setTimeout(renderControlRoom,90);}
  function openWarRoom(){openShell();setTimeout(renderWarRoom,90);}
  function openCorridor(a,b){openShell();setTimeout(()=>renderCorridor(a,b),90);}
  function openWalkout(id){openShell();setTimeout(()=>renderWalkout(id),90);}
  function openChampionship(ed){openShell();setTimeout(()=>renderChampionship(ed),90);}

  function addHomePortal(){
    const ctx=window.FIFA_APP_CONTEXT;if(ctx?.getActiveView?.()!=='dashboard')return;
    const portal=document.querySelector('.su-home-portal-copy > div');if(!portal||portal.querySelector('[data-tn-home-control]'))return;
    const b=document.createElement('button');b.type='button';b.dataset.tnHomeControl='';b.textContent='◉ NIGHT CONTROL';portal.prepend(b);
  }

  function bind(){
    document.addEventListener('click',event=>{
      const base=event.target.closest('[data-su-tab],[data-ss-tab],[data-rf-tab],[data-su-scene],[data-su-route],[data-su-close],[data-su-normal-site]');if(base)closeScene();
      const tab=event.target.closest('[data-tn-tab]');if(tab){event.preventDefault();event.stopPropagation();const id=tab.dataset.tnTab;if(id==='controlroom')renderControlRoom();if(id==='warroom')renderWarRoom();if(id==='corridor')renderCorridor();if(id==='walkout')renderWalkout();return;}
      if(event.target.closest('[data-tn-control],[data-tn-home-control]')){event.preventDefault();openControl();return;}
      if(event.target.closest('[data-tn-warroom]')){renderWarRoom();return;}
      if(event.target.closest('[data-tn-walkout]')){renderWalkout();return;}
      if(event.target.closest('[data-tn-corridor]')){renderCorridor();return;}
      if(event.target.closest('[data-tn-championship]')){renderChampionship();return;}
      const pre=event.target.closest('[data-tn-prematch]');if(pre){closeScene();rivalry()?.prematch?.(pre.dataset.tnPrematch);return;}
      const walk=event.target.closest('[data-tn-walkout-fixture]');if(walk){renderWalkout(walk.dataset.tnWalkoutFixture);return;}
      const stad=event.target.closest('[data-tn-stadium]');if(stad){closeScene();stadium()?.open?.(stad.dataset.tnStadium);setTimeout(stadiumAtmosphere,180);return;}
      const arena=event.target.closest('[data-tn-arena]');if(arena){const [a,b]=String(arena.dataset.tnArena||'').split('|');closeScene();rivalry()?.arena?.(a,b);return;}
      const from=event.target.closest('[data-tn-corridor-from]');if(from){const [a,b]=String(from.dataset.tnCorridorFrom||'').split('|');renderCorridor(a,b);return;}
      const ed=event.target.closest('[data-tn-champ-edition]');if(ed){renderChampionship(ed.dataset.tnChampEdition);return;}
      const dir=event.target.closest('[data-tn-director]');if(dir){state.director?stopDirector():startDirector();return;}
      const stadiumOpen=event.target.closest('[data-ss-open-stadium],[data-ss-match],[data-rf-camera]');if(stadiumOpen)setTimeout(stadiumAtmosphere,180);
    },true);

    document.addEventListener('change',event=>{
      if(event.target.id==='tnCorridorA'){state.corridorA=event.target.value;if(normalize(state.corridorA)===normalize(state.corridorB))state.corridorB=playerNames().find(n=>normalize(n)!==normalize(state.corridorA))||state.corridorB;renderCorridor(state.corridorA,state.corridorB);}
      if(event.target.id==='tnCorridorB'){state.corridorB=event.target.value;if(normalize(state.corridorA)===normalize(state.corridorB))state.corridorA=playerNames().find(n=>normalize(n)!==normalize(state.corridorB))||state.corridorA;renderCorridor(state.corridorA,state.corridorB);}
    });

    document.addEventListener('keydown',event=>{
      if(!document.body.classList.contains('su-open')||/input|select|textarea/i.test(document.activeElement?.tagName||''))return;
      if(event.key==='0'){event.preventDefault();renderControlRoom();}
      if(event.key==='q'||event.key==='Q'){event.preventDefault();renderWarRoom();}
      if(event.key==='h'||event.key==='H'){event.preventDefault();renderCorridor();}
      if(event.key==='w'||event.key==='W'){event.preventDefault();renderWalkout();}
      if(event.key==='n'||event.key==='N'){event.preventDefault();renderChampionship();}
      if(event.key==='z'||event.key==='Z'){event.preventDefault();state.director?stopDirector():startDirector();}
    });

    const sync=()=>{clearTimeout(syncTimer);syncTimer=setTimeout(()=>{
      if(!document.body.classList.contains('su-open')){addHomePortal();return;}
      if(state.scene==='controlroom')renderControlRoom();
      else if(state.scene==='warroom')renderWarRoom();
      else if(state.scene==='corridor')renderCorridor(state.corridorA,state.corridorB);
      else if(state.scene==='walkout')renderWalkout(state.fixtureId);
      else if(state.scene==='championship')renderChampionship(state.ceremonyEdition);
      stadiumAtmosphere();addHomePortal();
    },900);};
    window.addEventListener('fifa10:draw-updated',sync);window.addEventListener('fifa:state-updated',sync);window.addEventListener('focus',()=>setTimeout(addHomePortal,250));
  }

  function boot(){
    if(window.__FIFA_SPATIAL_NIGHT_V560__)return;window.__FIFA_SPATIAL_NIGHT_V560__=true;
    const wait=()=>{
      if(!visual()||!rivalry()||!stadium()){setTimeout(wait,140);return;}
      ensureScenes();renderGpuBadge();bind();setTimeout(addHomePortal,800);
      maintenanceTimer=setInterval(()=>{if(document.body.classList.contains('su-open')){ensureScenes();renderGpuBadge();stadiumAtmosphere();}},3000);
      window.INFANTINO_NIGHT={version:VERSION,build:BUILD,control:openControl,warroom:openWarRoom,corridor:openCorridor,walkout:openWalkout,championship:openChampionship,director:startDirector,stop:stopDirector,atmosphere:stadiumAtmosphere,data};
    };wait();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
