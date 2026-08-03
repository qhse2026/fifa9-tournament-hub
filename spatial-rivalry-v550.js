(() => {
  'use strict';

  const VERSION = '5.5.0';
  const BUILD = '571000';
  const STATE_KEY = 'fifa-spatial-rivalry-v550';
  const RECORD_SNAPSHOT_KEY = 'fifa-spatial-record-snapshot-v550';
  const isTR = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();
  const num = value => Number(value || 0);
  const clamp = (value,min=0,max=100) => Math.max(min,Math.min(max,Number(value)||0));
  const fmt = (value,digits=1) => Number(value||0).toLocaleString(isTR()?'tr-TR':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const initials = name => String(name||'?').split(/\s+/).filter(Boolean).map(p=>p[0]).slice(0,2).join('').toLocaleUpperCase('tr-TR');

  const saved = (()=>{ try{return JSON.parse(localStorage.getItem(STATE_KEY)||'{}')||{};}catch(_){return{};} })();
  const state = {
    scene: '',
    rivalryA: saved.rivalryA || '',
    rivalryB: saved.rivalryB || '',
    fixtureId: saved.fixtureId || '',
    ceremonyEdition: num(saved.ceremonyEdition) || 0,
    camera: saved.camera || 'broadcast',
    director: false,
    directorTimer: null,
    directorIndex: 0,
    recordTimer: null
  };

  function save(){
    try{localStorage.setItem(STATE_KEY,JSON.stringify({rivalryA:state.rivalryA,rivalryB:state.rivalryB,fixtureId:state.fixtureId,ceremonyEdition:state.ceremonyEdition,camera:state.camera}));}catch(_){}
  }
  function visual(){ return window.INFANTINO_VISUAL || null; }
  function stadium(){ return window.INFANTINO_STADIUM || null; }
  function data(){ try{return visual()?.data?.()||{};}catch(_){return{};} }

  function playerNames(d=data()){
    const names=new Set();
    (d?.universe?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.allTime?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.fpi?.players||[]).forEach(p=>p?.name&&names.add(p.name));
    (d?.standings||[]).forEach(p=>p?.name&&names.add(p.name));
    return [...names].sort((a,b)=>a.localeCompare(b,'tr'));
  }

  function playerInfo(name,d=data()){
    const k=normalize(name); if(!k)return null;
    const u=(d?.universe?.players||[]).find(p=>normalize(p.name)===k)||null;
    const a=(d?.allTime?.players||[]).find(p=>normalize(p.name)===k)||null;
    const f=(d?.fpi?.players||[]).find(p=>normalize(p.name)===k)||null;
    const s=(d?.standings||[]).find(p=>normalize(p.name)===k)||null;
    if(!u&&!a&&!f&&!s)return null;
    return {name:u?.name||a?.name||f?.name||s?.name||name,u,a,f,s};
  }

  function completedMatches(d=data()){
    const rows=d?.universe?.matches?.length?d.universe.matches:(d?.matches||[]);
    return [...rows].filter(m=>m&&Number.isFinite(Number(m.homeScore))&&Number.isFinite(Number(m.awayScore)));
  }

  function matchesBetween(a,b,d=data()){
    const ak=normalize(a),bk=normalize(b);
    return completedMatches(d).filter(m=>{
      const h=normalize(m.homeName),w=normalize(m.awayName);
      return (h===ak&&w===bk)||(h===bk&&w===ak);
    });
  }

  function rivalryStats(a,b,d=data()){
    const rows=matchesBetween(a,b,d);
    let aw=0,bw=0,draws=0,ag=0,bg=0;
    let biggest=null;
    rows.forEach(m=>{
      const homeA=normalize(m.homeName)===normalize(a);
      const as=homeA?num(m.homeScore):num(m.awayScore);
      const bs=homeA?num(m.awayScore):num(m.homeScore);
      ag+=as;bg+=bs;
      if(as>bs)aw++;else if(bs>as)bw++;else draws++;
      const margin=Math.abs(as-bs);
      if(!biggest||margin>biggest.margin||(margin===biggest.margin&&(as+bs)>(biggest.total||0)))biggest={match:m,as,bs,margin,total:as+bs};
    });
    const finalMeetings=rows.filter(m=>/final/.test(normalize(m.stage))&&!/semi|yari|third|ucuncu/.test(normalize(m.stage)));
    const recent=[...rows].slice(-5).reverse();
    return {rows,aw,bw,draws,ag,bg,biggest,finalMeetings,recent};
  }

  function scoreMetric(info,key){
    const u=info?.u||{},a=info?.a||{},f=info?.f||{},s=info?.s||{};
    const map={
      legacy:num(u.legacyScore??u.legacy??f.legacy??a.legacyScore),
      prime:num(u.primeScore??u.prime??f.prime),
      big:num(u.bigMatchScore??u.bigMatch??f.bigMatchScore??f.bigMatch),
      attack:num(u.attackScore??u.attack??f.attackScore??f.attack),
      defence:num(u.defenceScore??u.defence??f.defenceScore??f.defence),
      form:num(u.momentumScore??u.momentum??f.momentumScore??f.momentum),
      ppg:num(s.ppg??a.ppg),
      standing:num(s.rating??s.elo??u.standingRating??f.rating),
      titles:num(a.titles??u.titles)
    };
    return map[key]||0;
  }

  function metricPercent(info,key){
    const v=scoreMetric(info,key);
    if(key==='ppg')return clamp(v/3*100);
    if(key==='titles')return clamp(v/5*100);
    if(key==='standing')return clamp((v-1000)/7,5,100);
    return clamp(v);
  }

  function pendingFixtures(d=data()){
    const draw=d?.draw||{};
    const standings=d?.standings||[];
    const namesById=new Map(standings.map(r=>[String(r.id),r.name]));
    const snapshot=draw?.playerSnapshot||draw?.players||draw?.participants||[];
    (Array.isArray(snapshot)?snapshot:[]).forEach(p=>p?.id&&p?.name&&namesById.set(String(p.id),p.name));
    return (draw?.fixtures||[]).filter(m=>!m.completed).map(m=>({
      ...m,
      homeName:m.homeName||namesById.get(String(m.homeId))||'—',
      awayName:m.awayName||namesById.get(String(m.awayId))||'—'
    }));
  }

  function standingFor(name,d=data()){return (d?.standings||[]).find(r=>normalize(r.name)===normalize(name))||null;}
  function fixturePressure(f,d=data()){
    const h=standingFor(f.homeName,d),a=standingFor(f.awayName,d);
    const ranks=[num(h?.rank)||99,num(a?.rank)||99];
    let score=25;
    if(ranks.some(r=>r<=4))score+=25;
    if(ranks.some(r=>r>=4&&r<=6))score+=20;
    if(ranks.some(r=>r>=11&&r<=13))score+=18;
    if(num(f.stars)>=5)score+=8;
    if(num(f.matchday)>=7)score+=8;
    return clamp(score,10,100);
  }

  function routeNormal(route){
    const ctx=window.FIFA_APP_CONTEXT;
    closeScene();
    visual()?.close?.();
    if(ctx?.navigate)ctx.navigate(route);
  }

  function ensureScenes(){
    const shell=document.querySelector('#suShell'); if(!shell)return false;
    const brandSmall=shell.querySelector('.su-brand small'); if(brandSmall)brandSmall.textContent='FIFA UNIVERSE V5.7 · BROADCAST COMMAND DECK';
    const tabs=shell.querySelector('.su-scene-tabs');
    if(tabs&&!tabs.querySelector('[data-rf-tab="arena"]')){
      tabs.insertAdjacentHTML('beforeend','<button type="button" data-rf-tab="arena">⚔ RIVALRY</button><button type="button" data-rf-tab="prematch">◈ PRE-MATCH</button><button type="button" data-rf-tab="ceremony">♛ CEREMONY</button>');
    }
    const body=shell.querySelector('.su-body');
    if(body&&!body.querySelector('#rfSceneArena'))body.insertAdjacentHTML('beforeend','<section class="su-scene rf-scene" data-scene="arena" id="rfSceneArena"></section><section class="su-scene rf-scene" data-scene="prematch" id="rfScenePrematch"></section><section class="su-scene rf-scene" data-scene="ceremony" id="rfSceneCeremony"></section>');
    const actions=shell.querySelector('.su-top-actions');
    if(actions&&!actions.querySelector('[data-rf-director]'))actions.insertAdjacentHTML('afterbegin','<button type="button" data-rf-director>✦ DIRECTOR 3.0</button>');
    return true;
  }

  function activate(id){
    ensureScenes();
    document.body.classList.add('ss-extension-scene-open','rf-extension-open');
    document.querySelectorAll('#suShell .su-scene').forEach(el=>el.classList.remove('active'));
    document.querySelectorAll('#suShell [data-su-tab],[data-ss-tab],[data-rf-tab]').forEach(el=>el.classList.remove('active'));
    document.querySelector(`#rfScene${id[0].toUpperCase()+id.slice(1)}`)?.classList.add('active');
    document.querySelector(`[data-rf-tab="${id}"]`)?.classList.add('active');
    state.scene=id;
  }
  function closeScene(){state.scene='';document.body.classList.remove('rf-extension-open','ss-extension-scene-open');}

  function playerSelect(id,value,names){return `<select id="${id}">${names.map(n=>`<option value="${esc(n)}" ${normalize(n)===normalize(value)?'selected':''}>${esc(n)}</option>`).join('')}</select>`;}

  function renderArena(a=state.rivalryA,b=state.rivalryB){
    const d=data(),names=playerNames(d); if(names.length<2)return;
    if(!a||!names.some(n=>normalize(n)===normalize(a)))a=names[0];
    if(!b||normalize(a)===normalize(b)||!names.some(n=>normalize(n)===normalize(b)))b=names.find(n=>normalize(n)!==normalize(a))||names[1];
    state.rivalryA=a;state.rivalryB=b;save();activate('arena');
    const ai=playerInfo(a,d),bi=playerInfo(b,d),r=rivalryStats(a,b,d);
    const total=Math.max(1,r.rows.length),edge=(r.aw-r.bw)/total;
    const heat=clamp(35+r.rows.length*4+r.finalMeetings.length*12+Math.abs(edge)*18,20,100);
    const metrics=[['legacy','LEGACY'],['attack','ATTACK'],['defence','DEFENCE'],['big','BIG MATCH'],['form','MOMENTUM'],['ppg','PPG']];
    const recent=r.recent.map(m=>{const homeA=normalize(m.homeName)===normalize(a),as=homeA?m.homeScore:m.awayScore,bs=homeA?m.awayScore:m.homeScore;return `<article><span>FIFA ${String(num(m.edition)).padStart(2,'0')} · ${esc(m.stage||'')}</span><strong>${esc(a)} <b>${as}–${bs}</b> ${esc(b)}</strong></article>`;}).join('');
    const biggest=r.biggest?`${esc(a)} ${r.biggest.as}–${r.biggest.bs} ${esc(b)}`:'—';
    const root=document.querySelector('#rfSceneArena');
    root.innerHTML=`<div class="su-scene-inner rf-arena-inner">
      <header class="rf-arena-head"><div><span>FIFA UNIVERSE V5.5 · SPATIAL RIVALRY ARENA</span><h2>${esc(a)} <em>VS</em> ${esc(b)}</h2><p>${isTR()?'Rekabet artık karşılaştırma tablosu değil; H2H geçmişi, kariyer gücü ve büyük maç izi aynı arena içinde.':'The rivalry is no longer a comparison table; H2H history, career power and big-match imprint share one arena.'}</p></div><aside><b>${Math.round(heat)}</b><small>RIVALRY HEAT /100</small></aside></header>
      <section class="rf-arena-stage">
        <div class="rf-walkout left"><i>${initials(a)}</i><span>PLAYER ONE</span><h3>${esc(a)}</h3><small>#${ai?.s?.rank||'—'} · ${fmt(ai?.s?.ppg||ai?.a?.ppg||0,3)} PPG</small></div>
        <div class="rf-arena-core"><div class="rf-energy-ring"></div><strong>VS</strong><span>${r.rows.length} H2H</span><b>${r.aw}–${r.draws}–${r.bw}</b></div>
        <div class="rf-walkout right"><i>${initials(b)}</i><span>PLAYER TWO</span><h3>${esc(b)}</h3><small>#${bi?.s?.rank||'—'} · ${fmt(bi?.s?.ppg||bi?.a?.ppg||0,3)} PPG</small></div>
      </section>
      <section class="rf-duel-metrics">${metrics.map(([key,label])=>{const av=metricPercent(ai,key),bv=metricPercent(bi,key);return `<article><strong>${label}</strong><div class="rf-dualbar"><i style="width:${av}%"></i><i style="width:${bv}%"></i></div><span>${key==='ppg'?fmt(scoreMetric(ai,key),3):Math.round(scoreMetric(ai,key)||av)}</span><b>${key==='ppg'?fmt(scoreMetric(bi,key),3):Math.round(scoreMetric(bi,key)||bv)}</b></article>`;}).join('')}</section>
      <section class="rf-arena-bottom"><article><span>H2H SCOREBOARD</span><h3>${r.aw} <i>W</i> · ${r.draws} <i>D</i> · ${r.bw} <i>W</i></h3><small>${esc(a)} ${r.ag}–${r.bg} ${esc(b)} · ${isTR()?'toplam gol':'aggregate goals'}</small></article><article><span>BIGGEST RIVALRY RESULT</span><h3>${biggest}</h3><small>${r.finalMeetings.length} ${isTR()?'final karşılaşması':'championship meetings'}</small></article><div class="rf-recent"><span>LAST MEETINGS</span>${recent||`<p>${isTR()?'Henüz resmî H2H maçı yok.':'No official H2H match yet.'}</p>`}</div></section>
      <footer class="rf-scene-actions"><button data-su-open-passport="${esc(a)}">${esc(a)} · PASSPORT</button><button data-rf-swap>⇄ SWAP</button><button data-su-open-passport="${esc(b)}">${esc(b)} · PASSPORT</button></footer>
      <div class="rf-selector-row">${playerSelect('rfRivalryA',a,names)}<span>VS</span>${playerSelect('rfRivalryB',b,names)}</div>
    </div>`;
  }

  function renderPrematch(fixtureId=state.fixtureId){
    const d=data(),fixtures=pendingFixtures(d);activate('prematch');
    const root=document.querySelector('#rfScenePrematch');
    if(!fixtures.length){root.innerHTML=`<div class="su-scene-inner"><div class="rf-empty"><span>PRE-MATCH ARENA</span><h2>${isTR()?'Bekleyen FIFA 10 maçı yok.':'No pending FIFA 10 fixture.'}</h2><p>${isTR()?'Yeni fikstür oluştuğunda arena otomatik hazır olur.':'The arena will be ready when a new fixture exists.'}</p></div></div>`;return;}
    let f=fixtures.find(x=>String(x.id)===String(fixtureId))||fixtures.sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];
    state.fixtureId=String(f.id);save();
    const h=standingFor(f.homeName,d),a=standingFor(f.awayName,d),pressure=fixturePressure(f,d);
    const hInfo=playerInfo(f.homeName,d),aInfo=playerInfo(f.awayName,d);
    const h2h=rivalryStats(f.homeName,f.awayName,d);
    const stake = pressure>=75?(isTR()?'KRİTİK GECE':'CRITICAL NIGHT'):pressure>=55?(isTR()?'YÜKSEK BASKI':'HIGH PRESSURE'):(isTR()?'GRUP MÜCADELESİ':'GROUP BATTLE');
    root.innerHTML=`<div class="su-scene-inner rf-prematch-inner">
      <header class="rf-prematch-head"><span>FIFA 10 · PRE-MATCH SPATIAL ARENA</span><h2>${stake}</h2><p>${isTR()?'Bu sahne yalnız maç öncesi zekâ katmanıdır. Sonuç girişi mevcut stabil FIFA 10 modalında kalır.':'This is a pre-match intelligence layer only. Result entry stays in the existing stable FIFA 10 modal.'}</p></header>
      <section class="rf-tunnel-stage"><div class="rf-tunnel-lights"></div><article class="home"><i>${initials(f.homeName)}</i><span>#${h?.rank||'—'} · ${fmt(h?.ppg||0,3)} PPG</span><h3>${esc(f.homeName)}</h3><small>${Math.round(scoreMetric(hInfo,'big')||metricPercent(hInfo,'big'))} BIG MATCH</small></article><div class="rf-match-seal"><span>${esc(f.group?`GROUP ${f.group}`:'FIFA 10')}</span><strong>VS</strong><b>${num(f.stars)||'—'}★</b><small>MD ${num(f.matchday)||'—'}</small></div><article class="away"><i>${initials(f.awayName)}</i><span>#${a?.rank||'—'} · ${fmt(a?.ppg||0,3)} PPG</span><h3>${esc(f.awayName)}</h3><small>${Math.round(scoreMetric(aInfo,'big')||metricPercent(aInfo,'big'))} BIG MATCH</small></article></section>
      <section class="rf-pressure-grid"><article><span>PRESSURE INDEX</span><b>${Math.round(pressure)}</b><div><i style="width:${pressure}%"></i></div></article><article><span>H2H HISTORY</span><b>${h2h.aw}–${h2h.draws}–${h2h.bw}</b><small>${h2h.rows.length} official meetings</small></article><article><span>STANDING GAP</span><b>${Math.abs((num(h?.rank)||0)-(num(a?.rank)||0))||'—'}</b><small>${isTR()?'sıra farkı':'rank gap'}</small></article><article><span>QUALIFICATION SIGNAL</span><b>${[h?.rank,a?.rank].some(r=>num(r)<=4)?'QF':[h?.rank,a?.rank].some(r=>num(r)>=5&&num(r)<=12)?'PLAY-IN':'OPEN'}</b><small>${isTR()?'güncel tabloya göre':'based on current table'}</small></article></section>
      <div class="rf-fixture-strip">${fixtures.slice(0,10).map(x=>`<button class="${String(x.id)===String(f.id)?'active':''}" data-rf-fixture="${esc(x.id)}"><span>${esc(x.group||'')} · ${num(x.stars)||'—'}★</span><strong>${esc(x.homeName)} <i>VS</i> ${esc(x.awayName)}</strong></button>`).join('')}</div>
      <footer class="rf-scene-actions"><button data-rf-arena="${esc(f.homeName)}|${esc(f.awayName)}">⚔ RIVALRY ARENA</button><button data-rf-normal-fifa10>${isTR()?'FIFA 10 SONUÇ MERKEZİNE GİT':'OPEN FIFA 10 RESULT CENTRE'} ↗</button></footer>
    </div>`;
  }

  function latestCeremonyEdition(d=data()){
    const honours=(d?.universe?.honours||[]).filter(h=>h.competition==='oruc'&&h.winner);
    return honours.sort((a,b)=>num(b.edition)-num(a.edition))[0]?.edition||0;
  }

  function trophySvg(edition){
    const label=String(num(edition)).padStart(2,'0');
    return `<svg viewBox="0 0 220 270" aria-hidden="true"><defs><linearGradient id="rfGold${label}" x1="0" x2="1"><stop offset="0" stop-color="#8a5b0d"/><stop offset=".28" stop-color="#fff0a4"/><stop offset=".5" stop-color="#c99421"/><stop offset=".75" stop-color="#fff7c7"/><stop offset="1" stop-color="#7a4c09"/></linearGradient></defs><path fill="url(#rfGold${label})" d="M55 35h110l-10 78c-4 31-22 52-45 58-23-6-41-27-45-58z"/><path fill="none" stroke="#ffe28a" stroke-width="9" d="M56 53H35c0 38 14 60 43 66M164 53h21c0 38-14 60-43 66"/><rect x="101" y="166" width="18" height="46" rx="7" fill="url(#rfGold${label})"/><path fill="url(#rfGold${label})" d="M78 206h64l13 20H65zM55 226h110v19H55z"/><circle cx="110" cy="91" r="30" fill="#08122e" stroke="#ffe28a" stroke-width="4"/><text x="110" y="100" text-anchor="middle" fill="#fff1a8" font-size="25" font-weight="900">${label}</text></svg>`;
  }

  function renderCeremony(edition=state.ceremonyEdition){
    const d=data(),honours=(d?.universe?.honours||[]).filter(h=>h.competition==='oruc'&&h.winner).sort((a,b)=>num(a.edition)-num(b.edition));
    activate('ceremony');
    const root=document.querySelector('#rfSceneCeremony');
    if(!honours.length){root.innerHTML=`<div class="su-scene-inner"><div class="rf-empty"><span>TROPHY CEREMONY</span><h2>${isTR()?'Mühürlenmiş şampiyonluk bulunmuyor.':'No sealed championship yet.'}</h2></div></div>`;return;}
    let h=honours.find(x=>num(x.edition)===num(edition))||honours.at(-1);state.ceremonyEdition=num(h.edition);save();
    root.innerHTML=`<div class="su-scene-inner rf-ceremony-inner">
      <header class="rf-ceremony-head"><span>FIFA ${String(num(h.edition)).padStart(2,'0')} · CHAMPIONS CEREMONY</span><h2>${esc(h.winner)}</h2><p>${isTR()?'Resmî podyum verisinden üretilen sinematik kupa seremonisi.':'A cinematic trophy ceremony generated from the official podium record.'}</p></header>
      <section class="rf-ceremony-stage"><div class="rf-spotlight"></div><div class="rf-confetti">${Array.from({length:42},(_,i)=>`<i style="--i:${i};--x:${(i*37)%100};--d:${(i%9)+3}"></i>`).join('')}</div><div class="rf-podium third"><span>3</span><strong>${esc(h.third||'—')}</strong></div><div class="rf-podium champion"><div class="rf-trophy">${trophySvg(h.edition)}</div><span>♛ CHAMPION</span><strong>${esc(h.winner)}</strong><small>FIFA ${String(num(h.edition)).padStart(2,'0')}</small></div><div class="rf-podium second"><span>2</span><strong>${esc(h.runnerUp||'—')}</strong></div></section>
      <div class="rf-ceremony-editions">${honours.map(x=>`<button class="${num(x.edition)===num(h.edition)?'active':''}" data-rf-ceremony-edition="${num(x.edition)}">FIFA ${String(num(x.edition)).padStart(2,'0')}</button>`).join('')}</div>
      <footer class="rf-scene-actions"><button data-su-open-passport="${esc(h.winner)}">♛ ${isTR()?'ŞAMPİYON PASAPORTU':'CHAMPION PASSPORT'}</button><button data-rf-open-edition="${num(h.edition)}">${isTR()?'HANEDAN ARŞİVİ':'DYNASTY ARCHIVE'} ↗</button></footer>
    </div>`;
  }

  const CAMERAS=['broadcast','tactical','orbit','tunnel','trophy','wide'];
  function applyCamera(camera=state.camera){
    if(!CAMERAS.includes(camera))camera='broadcast';state.camera=camera;save();
    const shell=document.querySelector('#ssSceneStadium .ss-stadium-shell'); if(!shell)return;
    CAMERAS.forEach(c=>shell.classList.remove(`rf-cam-${c}`));shell.classList.add(`rf-cam-${camera}`);
    document.querySelectorAll('[data-rf-camera]').forEach(b=>b.classList.toggle('active',b.dataset.rfCamera===camera));
  }
  function augmentStadium(){
    const scene=document.querySelector('#ssSceneStadium'); if(!scene||!scene.innerHTML)return;
    const header=scene.querySelector('.ss-stadium-header'); if(header&&!header.querySelector('.rf-camera-console'))header.insertAdjacentHTML('beforeend',`<div class="rf-camera-console"><span>CAMERA</span>${CAMERAS.map(c=>`<button data-rf-camera="${c}" class="${state.camera===c?'active':''}">${c.toUpperCase()}</button>`).join('')}</div>`);
    applyCamera(state.camera);
  }

  function recordSignature(d=data()){
    const r=d?.allTime?.records||{};
    const vals=['titles','finals','wins','goals','ppg','defense','matches','goalDifference','winRate','cleanSheets'].map(k=>{const x=r[k]||{};return `${k}:${x.name||''}:${x.titles??x.finals??x.wins??x.gf??x.ppg??x.gaPerGame??x.games??x.gd??x.winRate??x.cleanSheets??''}`;});
    if(r.biggestWin)vals.push(`big:${r.biggestWin.winner||''}:${r.biggestWin.score||''}`);
    return vals.join('|');
  }
  function showRecordEvent(){
    if(document.querySelector('#rfRecordEvent'))return;
    const d=data(),r=d?.allTime?.records||{},leader=r.titles||r.wins||r.goals||{};
    const el=document.createElement('div');el.id='rfRecordEvent';el.className='rf-record-event';el.innerHTML=`<div><span>◆ RECORD VAULT EVENT</span><h3>${esc(leader.name||'ALL-TIME RECORD UPDATE')}</h3><p>${isTR()?'Tüm-zamanlar rekor kasasında değişiklik algılandı.':'A change was detected in the all-time Record Vault.'}</p><button data-rf-open-records>RECORD VAULT ↗</button></div>`;document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),500);},7000);
  }
  function checkRecordEvent(){
    const sig=recordSignature();let prev='';try{prev=localStorage.getItem(RECORD_SNAPSHOT_KEY)||'';}catch(_){}
    if(prev&&prev!==sig&&!document.querySelector('#modalBackdrop:not(.hidden)'))showRecordEvent();
    try{localStorage.setItem(RECORD_SNAPSHOT_KEY,sig);}catch(_){}
  }

  function directorCandidates(){
    const d=data(),fixtures=pendingFixtures(d),latest=completedMatches(d).at(-1),hon=latestCeremonyEdition(d),rivals=d?.allTime?.rivalries||d?.universe?.rivalries||[];
    const bestFixture=[...fixtures].sort((a,b)=>fixturePressure(b,d)-fixturePressure(a,d))[0];
    let ra='',rb='';
    const rr=rivals[0]||{};ra=rr.playerA||rr.a||rr.homeName||'';rb=rr.playerB||rr.b||rr.awayName||'';
    if(!ra||!rb){const names=playerNames(d);ra=names[0]||'';rb=names[1]||'';}
    const seq=[];
    if(bestFixture)seq.push(()=>renderPrematch(bestFixture.id));
    if(ra&&rb)seq.push(()=>renderArena(ra,rb));
    if(latest&&stadium()?.open)seq.push(()=>stadium().open(latest.id));
    seq.push(()=>visual()?.open?.('records'));
    if(hon)seq.push(()=>renderCeremony(hon));
    return seq.filter(Boolean);
  }
  function stopDirector(){state.director=false;if(state.directorTimer){clearInterval(state.directorTimer);state.directorTimer=null;}document.body.classList.remove('rf-director-mode');document.querySelector('[data-rf-director]')?.classList.remove('active');}
  function startDirector(){
    stopDirector();state.director=true;document.body.classList.add('rf-director-mode');document.querySelector('[data-rf-director]')?.classList.add('active');
    const seq=directorCandidates();if(!seq.length)return;state.directorIndex=0;seq[0]();state.directorTimer=setInterval(()=>{if(!state.director)return;state.directorIndex=(state.directorIndex+1)%seq.length;seq[state.directorIndex]?.();},8200);
  }

  function openShell(){visual()?.open?.();setTimeout(ensureScenes,40);}
  function openArena(a,b){openShell();setTimeout(()=>renderArena(a,b),70);}
  function openPrematch(id){openShell();setTimeout(()=>renderPrematch(id),70);}
  function openCeremony(ed){openShell();setTimeout(()=>renderCeremony(ed),70);}

  function augmentComparison(){
    const scene=document.querySelector('#suSceneCompare'); if(!scene||scene.querySelector('[data-rf-from-compare]'))return;
    const selects=scene.querySelectorAll('select');if(selects.length<2)return;
    const a=selects[0].value,b=selects[1].value;
    const btn=document.createElement('button');btn.type='button';btn.dataset.rfFromCompare=`${a}|${b}`;btn.className='rf-arena-launch';btn.textContent='⚔ SPATIAL RIVALRY ARENA';scene.querySelector('.su-scene-inner')?.appendChild(btn);
  }

  function bind(){
    document.addEventListener('click',event=>{
      const baseNav=event.target.closest('[data-su-tab],[data-ss-tab],[data-su-scene],[data-su-route],[data-su-close],[data-su-normal-site]');if(baseNav)closeScene();
      const tab=event.target.closest('[data-rf-tab]');if(tab){event.preventDefault();event.stopPropagation();const id=tab.dataset.rfTab;if(id==='arena')renderArena();if(id==='prematch')renderPrematch();if(id==='ceremony')renderCeremony();return;}
      const swap=event.target.closest('[data-rf-swap]');if(swap){[state.rivalryA,state.rivalryB]=[state.rivalryB,state.rivalryA];renderArena(state.rivalryA,state.rivalryB);return;}
      const fixture=event.target.closest('[data-rf-fixture]');if(fixture){renderPrematch(fixture.dataset.rfFixture);return;}
      const arena=event.target.closest('[data-rf-arena]');if(arena){const [a,b]=String(arena.dataset.rfArena||'').split('|');renderArena(a,b);return;}
      const fromCompare=event.target.closest('[data-rf-from-compare]');if(fromCompare){const [a,b]=String(fromCompare.dataset.rfFromCompare||'').split('|');renderArena(a,b);return;}
      const ceremony=event.target.closest('[data-rf-ceremony-edition]');if(ceremony){renderCeremony(ceremony.dataset.rfCeremonyEdition);return;}
      const edition=event.target.closest('[data-rf-open-edition]');if(edition){visual()?.edition?.(edition.dataset.rfOpenEdition);return;}
      const normal=event.target.closest('[data-rf-normal-fifa10]');if(normal){routeNormal('seasonhub');return;}
      const camera=event.target.closest('[data-rf-camera]');if(camera){applyCamera(camera.dataset.rfCamera);return;}
      const dir=event.target.closest('[data-rf-director]');if(dir){state.director?stopDirector():startDirector();return;}
      const records=event.target.closest('[data-rf-open-records]');if(records){document.querySelector('#rfRecordEvent')?.remove();openShell();setTimeout(()=>visual()?.scene?.('records'),60);return;}
      const rivalryLine=event.target.closest('[data-su-rivalry-a]');if(rivalryLine){event.preventDefault();event.stopPropagation();state.rivalryA=rivalryLine.dataset.suRivalryA;state.rivalryB=rivalryLine.dataset.suRivalryB;save();renderArena(state.rivalryA,state.rivalryB);return;}
      const compareTab=event.target.closest('[data-su-tab="compare"]');if(compareTab)setTimeout(augmentComparison,100);
      const stadiumOpen=event.target.closest('[data-ss-open-stadium],[data-ss-match]');if(stadiumOpen)setTimeout(augmentStadium,120);
    },true);

    document.addEventListener('change',event=>{
      if(event.target.id==='rfRivalryA'){state.rivalryA=event.target.value;if(normalize(state.rivalryA)===normalize(state.rivalryB))state.rivalryB=playerNames().find(n=>normalize(n)!==normalize(state.rivalryA))||state.rivalryB;renderArena(state.rivalryA,state.rivalryB);}
      if(event.target.id==='rfRivalryB'){state.rivalryB=event.target.value;if(normalize(state.rivalryA)===normalize(state.rivalryB))state.rivalryA=playerNames().find(n=>normalize(n)!==normalize(state.rivalryB))||state.rivalryA;renderArena(state.rivalryA,state.rivalryB);}
      if(event.target.id==='suCompareA'||event.target.id==='suCompareB')setTimeout(augmentComparison,120);
    });

    document.addEventListener('keydown',event=>{
      if(!document.body.classList.contains('su-open')||/input|select|textarea/i.test(document.activeElement?.tagName||''))return;
      if(event.key==='r'||event.key==='R'){event.preventDefault();renderArena();}
      if(event.key==='p'||event.key==='P'){event.preventDefault();renderPrematch();}
      if(event.key==='t'||event.key==='T'){event.preventDefault();renderCeremony();}
      if(event.key==='d'||event.key==='D'||event.key==='x'||event.key==='X'){event.preventDefault();state.director?stopDirector():startDirector();}
    });

    const sync=()=>{clearTimeout(state.recordTimer);state.recordTimer=setTimeout(()=>{checkRecordEvent();if(state.scene==='prematch'&&document.body.classList.contains('su-open'))renderPrematch(state.fixtureId);if(state.scene==='arena'&&document.body.classList.contains('su-open'))renderArena(state.rivalryA,state.rivalryB);if(state.scene==='ceremony'&&document.body.classList.contains('su-open'))renderCeremony(state.ceremonyEdition);augmentStadium();},800);};
    window.addEventListener('fifa10:draw-updated',sync);window.addEventListener('fifa:state-updated',sync);
  }

  function boot(){
    if(window.__FIFA_SPATIAL_RIVALRY_V550__)return;window.__FIFA_SPATIAL_RIVALRY_V550__=true;
    const wait=()=>{if(!visual()||!stadium()){setTimeout(wait,120);return;}ensureScenes();bind();checkRecordEvent();setTimeout(augmentComparison,800);setTimeout(augmentStadium,900);window.INFANTINO_RIVALRY={version:VERSION,build:BUILD,arena:openArena,prematch:openPrematch,ceremony:openCeremony,director:startDirector,stop:stopDirector,camera:applyCamera,data};};wait();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
