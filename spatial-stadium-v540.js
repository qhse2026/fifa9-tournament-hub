(() => {
  'use strict';

  const VERSION = '5.4.1';
  const BUILD = '571000';
  const STATE_KEY = 'fifa-spatial-stadium-v540';
  const HISTORY_KEY = 'fifa-living-history-v540';
  const SNAPSHOT_KEY = 'fifa-living-history-snapshot-v540';
  const MAX_HISTORY = 60;
  let syncTimer = null;
  let maintenanceTimer = null;
  let lastStadiumSignature = '';

  const state = (() => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; } catch (_) {}
    return {
      matchId: saved.matchId || '',
      breadcrumbs: Array.isArray(saved.breadcrumbs) ? saved.breadcrumbs.slice(-6) : [],
      director: false,
      directorTimer: null,
      directorIndex: 0,
      lastClickedMatchId: '',
      lastEdition: 0,
      scene: 'stadium'
    };
  })();

  const isTR = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');
  const esc = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,' ').trim();
  const num = value => Number(value || 0);
  const clamp = (value, min=0, max=100) => Math.max(min, Math.min(max, Number(value) || 0));
  const fmt = (value, digits=1) => Number(value || 0).toLocaleString(isTR()?'tr-TR':'en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});
  const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(p=>p[0]).slice(0,2).join('').toLocaleUpperCase('tr-TR');

  function saveState(){
    try { localStorage.setItem(STATE_KEY, JSON.stringify({matchId:state.matchId,breadcrumbs:state.breadcrumbs.slice(-6)})); } catch (_) {}
  }

  function visual(){ return window.INFANTINO_VISUAL || null; }
  function getData(){
    try { return visual()?.data?.() || {}; }
    catch (_) { return {}; }
  }

  function matches(data=getData()){
    const rows = data?.universe?.matches?.length ? data.universe.matches : (data?.matches || []);
    return [...rows].filter(m => m && m.id && Number.isFinite(Number(m.homeScore)) && Number.isFinite(Number(m.awayScore)));
  }

  function latestMatches(data=getData(), limit=10){ return matches(data).slice(-limit).reverse(); }
  function findMatch(id, data=getData()){ return matches(data).find(m => String(m.id) === String(id)) || null; }
  function finalMatchForEdition(edition, data=getData()){
    const rows = matches(data).filter(m => Number(m.edition) === Number(edition));
    return [...rows].reverse().find(m => /grand final|\bfinal\b|buyuk final/i.test(normalize(m.stage))) || rows.at(-1) || null;
  }

  function stageWeight(match){
    if (Number.isFinite(num(match?.stageWeight)) && num(match.stageWeight) > 0) return num(match.stageWeight);
    const s = normalize(match?.stage);
    if (/grand final|buyuk final/.test(s)) return 1.65;
    if (/final/.test(s)) return 1.55;
    if (/semi|yari/.test(s)) return 1.4;
    if (/quarter|ceyrek/.test(s)) return 1.28;
    if (/play|knockout|eleme/.test(s)) return 1.2;
    return 1;
  }

  function seeded(seed){
    let h = 2166136261;
    for (const ch of String(seed || 'stadium')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return () => { h += 0x6D2B79F5; let t=h; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }

  function actualEvents(match){
    const source = match?.events || match?.timeline || match?.eventLog || match?.commentaryEvents;
    if (!Array.isArray(source) || !source.length) return [];
    return source.map((event,index)=>({
      minute: Math.max(0, Math.min(120, Number(event.minute ?? event.time ?? event.min ?? index*10) || 0)),
      side: normalize(event.side || event.team || event.player) === normalize(match.awayName) || normalize(event.side)==='away' ? 'away' : 'home',
      type: String(event.type || event.event || 'event'),
      label: String(event.label || event.text || event.description || event.type || 'Match event')
    })).sort((a,b)=>a.minute-b.minute);
  }

  function reconstructedStory(match){
    const rand = seeded(`${match.id}:${match.homeScore}:${match.awayScore}`);
    const homeGoals = Math.max(0, num(match.homeScore));
    const awayGoals = Math.max(0, num(match.awayScore));
    const total = homeGoals + awayGoals;
    const events = [];
    const goalSides = [];
    for(let i=0;i<homeGoals;i++) goalSides.push('home');
    for(let i=0;i<awayGoals;i++) goalSides.push('away');
    // Deterministic shuffle. It is explicitly a reconstruction, never labelled official minute data.
    for(let i=goalSides.length-1;i>0;i--){ const j=Math.floor(rand()*(i+1)); [goalSides[i],goalSides[j]]=[goalSides[j],goalSides[i]]; }
    const minutes = [];
    for(let i=0;i<total;i++) minutes.push(Math.round(7 + ((i+1)/(total+1))*79 + (rand()-.5)*10));
    minutes.sort((a,b)=>a-b);
    let hs=0, as=0;
    goalSides.forEach((side,index)=>{
      if(side==='home')hs++; else as++;
      const scorer = side==='home' ? match.homeName : match.awayName;
      events.push({minute:Math.max(3,Math.min(89,minutes[index])),side,type:'goal',label:`${scorer} · ${hs}-${as}`});
    });
    if (!events.length) events.push({minute:45,side:'neutral',type:'tension',label:isTR()?'Dengeli baskı fazı':'Balanced pressure phase'});
    return events;
  }

  function story(match){
    const actual = actualEvents(match);
    return { events: actual.length ? actual : reconstructedStory(match), officialTimeline: Boolean(actual.length) };
  }

  function momentum(match){
    const rand = seeded(`momentum:${match.id}`);
    const points = [];
    const expected = Number.isFinite(Number(match.expectedHome)) ? Number(match.expectedHome) : .5;
    const goalBias = (num(match.homeScore)-num(match.awayScore))*7;
    const pressure = stageWeight(match);
    for(let i=0;i<13;i++){
      const t=i/12;
      const wave=Math.sin(t*Math.PI*3 + rand()*1.2)*13 + Math.cos(t*Math.PI*1.35)*7;
      const drift=(expected-.5)*34 + goalBias*(t-.1) + (rand()-.5)*10;
      points.push(clamp(50 + wave + drift*pressure, 8, 92));
    }
    const finalHome = num(match.homeScore)>num(match.awayScore) ? 72 : num(match.homeScore)<num(match.awayScore) ? 28 : 50;
    points[points.length-1] = finalHome;
    return points;
  }

  function polyline(points, width=720, height=180){
    return points.map((v,i)=>`${(i/(points.length-1))*width},${height-(v/100)*height}`).join(' ');
  }

  function editionHue(edition){ return (Number(edition || 1)*37 + 178) % 360; }
  function pressureLabel(match){
    const w=stageWeight(match);
    if(w>=1.55)return isTR()?'MAKSİMUM':'MAXIMUM';
    if(w>=1.35)return isTR()?'YÜKSEK':'HIGH';
    if(w>=1.18)return isTR()?'YÜKSELTİLMİŞ':'ELEVATED';
    return isTR()?'STANDART':'STANDARD';
  }

  function matchImportance(match){
    const total=num(match.homeScore)+num(match.awayScore), margin=Math.abs(num(match.homeScore)-num(match.awayScore));
    const upset=Math.abs(.5-Math.min(num(match.expectedHome || .5),num(match.expectedAway || .5)))*100;
    return stageWeight(match)*45 + total*4 + Math.min(20,upset) + (margin>=4?8:0);
  }

  function importantCurrentStory(data=getData()){
    const rows=latestMatches(data,20).sort((a,b)=>matchImportance(b)-matchImportance(a));
    return rows[0] || latestMatches(data,1)[0] || null;
  }

  function pushCrumb(label, scene, meta=''){
    if(!label)return;
    const next={label:String(label),scene:String(scene||''),meta:String(meta||''),time:Date.now()};
    const prev=state.breadcrumbs.at(-1);
    if(!prev || prev.label!==next.label || prev.scene!==next.scene) state.breadcrumbs.push(next);
    state.breadcrumbs=state.breadcrumbs.slice(-6); saveState(); renderBreadcrumbs();
  }

  function renderBreadcrumbs(){
    const top=document.querySelector('#suShell .su-topbar'); if(!top)return;
    let root=top.querySelector('#ssBreadcrumbs');
    if(!root){root=document.createElement('div');root.id='ssBreadcrumbs';root.className='ss-breadcrumbs';top.appendChild(root);}
    const html=state.breadcrumbs.length ? `<span>${isTR()?'YOL':'PATH'}</span>${state.breadcrumbs.map((c,i)=>`<button type="button" data-ss-crumb="${i}">${esc(c.label)}</button>`).join('<i>›</i>')}` : '';
    if(root.innerHTML!==html) root.innerHTML=html;
  }

  function ensureScenes(){
    const shell=document.querySelector('#suShell'); if(!shell)return false;
    const tabs=shell.querySelector('.su-scene-tabs');
    if(tabs && !tabs.querySelector('[data-ss-tab="stadium"]')){
      tabs.insertAdjacentHTML('beforeend','<button type="button" data-ss-tab="stadium">◉ STADIUM</button><button type="button" data-ss-tab="history">⌁ HISTORY</button>');
    }
    const body=shell.querySelector('.su-body');
    if(body && !body.querySelector('#ssSceneStadium')) body.insertAdjacentHTML('beforeend','<section class="su-scene ss-scene" data-scene="stadium" id="ssSceneStadium"></section><section class="su-scene ss-scene" data-scene="history" id="ssSceneHistory"></section>');
    const actions=shell.querySelector('.su-top-actions');
    if(actions && !actions.querySelector('[data-ss-director]')) actions.insertAdjacentHTML('afterbegin',`<button type="button" data-ss-director>◉ DIRECTOR 2.0</button><button type="button" data-ss-ambient>${isTR()?'TV MODU':'TV MODE'}</button>`);
    renderBreadcrumbs();
    return true;
  }

  function setExtensionScene(id=''){
    const shell=document.querySelector('#suShell');
    if(id){
      document.body.classList.add('ss-extension-scene-open');
      if(shell) shell.dataset.extensionScene=id;
    } else {
      document.body.classList.remove('ss-extension-scene-open');
      if(shell) delete shell.dataset.extensionScene;
    }
  }

  function stadiumSignature(match){
    if(!match)return '';
    return [match.id,match.homeScore,match.awayScore,match.stage,match.edition].join('|');
  }

  function activateScene(id){
    if(!ensureScenes())return;
    document.querySelectorAll('#suShell .su-scene').forEach(el=>el.classList.remove('active'));
    const target=document.querySelector(id==='stadium'?'#ssSceneStadium':'#ssSceneHistory'); target?.classList.add('active');
    document.querySelectorAll('#suShell [data-su-tab],#suShell [data-ss-tab]').forEach(btn=>btn.classList.remove('active'));
    document.querySelector(`#suShell [data-ss-tab="${id}"]`)?.classList.add('active');
    state.scene=id;
    setExtensionScene(id);
    const label=document.querySelector('#suCinematicLabel');if(label)label.textContent=id.toUpperCase();
  }

  function stadiumEventMarkup(event, official){
    const left=(event.minute/90)*100;
    return `<button type="button" class="ss-timeline-event ${esc(event.side)} ${esc(event.type)}" style="left:${clamp(left,1,99)}%" title="${esc(event.label)}"><i></i><span>${event.minute}'</span><b>${esc(event.label)}</b>${official?'<em>OFFICIAL</em>':'<em>AI RECON</em>'}</button>`;
  }

  function renderStadium(matchId=state.matchId){
    const data=getData(), rows=latestMatches(data,14);
    let match=findMatch(matchId,data) || rows[0] || importantCurrentStory(data);
    if(!match){
      activateScene('stadium');
      document.querySelector('#ssSceneStadium').innerHTML=`<div class="su-scene-inner"><div class="ss-empty"><span>◉ SPATIAL STADIUM</span><h2>${isTR()?'Henüz oynanmış maç bulunmuyor.':'No completed match yet.'}</h2></div></div>`;return;
    }
    state.matchId=String(match.id); lastStadiumSignature=stadiumSignature(match); saveState(); activateScene('stadium'); pushCrumb(`FIFA ${String(num(match.edition)).padStart(2,'0')} · ${match.homeName} ${match.homeScore}-${match.awayScore} ${match.awayName}`,'stadium',match.id);
    const root=document.querySelector('#ssSceneStadium'); if(!root)return;
    const narrative=story(match), momentumData=momentum(match), hue=editionHue(match.edition);
    const homeMomentum=Math.round(momentumData.reduce((s,v)=>s+v,0)/momentumData.length), awayMomentum=100-homeMomentum;
    const total=num(match.homeScore)+num(match.awayScore), margin=Math.abs(num(match.homeScore)-num(match.awayScore));
    const winner=num(match.homeScore)>num(match.awayScore)?match.homeName:num(match.homeScore)<num(match.awayScore)?match.awayName:(isTR()?'Beraberlik':'Draw');
    root.style.setProperty('--ss-era-hue',hue);
    root.innerHTML=`<div class="su-scene-inner ss-stadium-inner">
      <header class="ss-stadium-header"><div><span>FIFA UNIVERSE V5.4 · SPATIAL STADIUM</span><h2>${esc(match.homeName)} <em>${match.homeScore} – ${match.awayScore}</em> ${esc(match.awayName)}</h2><p>${esc(match.stage||'')} · FIFA ${String(num(match.edition)).padStart(2,'0')}</p></div><div class="ss-recon-badge ${narrative.officialTimeline?'official':'recon'}"><b>${narrative.officialTimeline?'OFFICIAL EVENT LOG':'AI RECONSTRUCTION'}</b><small>${narrative.officialTimeline?(isTR()?'Kayıtlı olay zaman çizelgesi':'Recorded event timeline'):(isTR()?'Resmî final skorundan görsel rekonstrüksiyon':'Visual reconstruction from official final score')}</small></div></header>
      <div class="ss-match-switcher">${rows.map((m,i)=>`<button type="button" data-ss-match="${esc(m.id)}" class="${String(m.id)===String(match.id)?'active':''}"><span>${i===0?'●':'○'} FIFA ${String(num(m.edition)).padStart(2,'0')}</span><b>${esc(m.homeName)} ${m.homeScore}-${m.awayScore} ${esc(m.awayName)}</b></button>`).join('')}</div>
      <section class="ss-stadium-shell">
        <div class="ss-stadium-sky"><i></i><i></i><i></i><i></i></div>
        <div class="ss-stadium-bowl"><div class="ss-stand ss-stand-a"></div><div class="ss-stand ss-stand-b"></div><div class="ss-stand ss-stand-c"></div><div class="ss-stand ss-stand-d"></div><div class="ss-pitch"><div class="ss-centre-circle"></div><div class="ss-box left"></div><div class="ss-box right"></div><div class="ss-ball"></div></div></div>
        <div class="ss-score-tower"><small>FIFA ${String(num(match.edition)).padStart(2,'0')} · ${esc(match.stage||'MATCH')}</small><div><span>${esc(match.homeName)}</span><b>${match.homeScore}<i>–</i>${match.awayScore}</b><span>${esc(match.awayName)}</span></div><em>${esc(winner)} · ${pressureLabel(match)} PRESSURE</em></div>
        <div class="ss-atmosphere"><span>ATTENDANCE SIGNAL</span><b>${Math.round(58+stageWeight(match)*21+Math.min(16,total*1.3))}%</b><i style="--p:${Math.round(58+stageWeight(match)*21+Math.min(16,total*1.3))}%"></i></div>
      </section>
      <section class="ss-analysis-grid">
        <article class="ss-momentum-card"><header><div><span>SPATIAL MOMENTUM</span><h3>${homeMomentum}% · ${awayMomentum}%</h3></div><div class="ss-team-keys"><b>${esc(initials(match.homeName))}</b><i></i><b>${esc(initials(match.awayName))}</b></div></header><svg viewBox="0 0 720 180" preserveAspectRatio="none"><line x1="0" y1="90" x2="720" y2="90"/><polygon points="0,90 ${polyline(momentumData)} 720,90"/><polyline points="${polyline(momentumData)}"/></svg><footer><span>0'</span><span>45'</span><span>90'</span></footer></article>
        <article class="ss-intelligence-card"><span>LIVING MATCH DNA</span><div class="ss-dna-metrics"><div><small>TOTAL GOALS</small><b>${total}</b></div><div><small>MARGIN</small><b>${margin}</b></div><div><small>STAGE WEIGHT</small><b>${fmt(stageWeight(match),2)}</b></div><div><small>UPSET SIGNAL</small><b>${Math.round(Math.abs(.5-Math.min(num(match.expectedHome||.5),num(match.expectedAway||.5)))*200)}</b></div></div><p>${isTR()?'Momentum eğrisi resmî skoru, rakip güç farkını ve maçın baskı katsayısını kullanır. Gerçek dakika verisi yoksa olay dakikaları tarihsel kayıt olarak sunulmaz.':'Momentum uses the official score, opponent-strength gap and stage pressure. Reconstructed event minutes are never presented as historical fact.'}</p></article>
      </section>
      <section class="ss-timeline"><header><span>LIVING HISTORY TIMELINE</span><b>${narrative.officialTimeline?(isTR()?'RESMÎ OLAY AKIŞI':'OFFICIAL EVENT FLOW'):(isTR()?'SİNEMATİK REKONSTRÜKSİYON':'CINEMATIC RECONSTRUCTION')}</b></header><div class="ss-timeline-rail"><i class="half"></i>${narrative.events.map(e=>stadiumEventMarkup(e,narrative.officialTimeline)).join('')}</div><footer><span>0'</span><span>15'</span><span>30'</span><span>45'</span><span>60'</span><span>75'</span><span>90'</span></footer></section>
      <section class="ss-stadium-actions"><button data-su-open-passport="${esc(match.homeName)}">${esc(match.homeName)} · PASSPORT</button><button data-ss-edition="${num(match.edition)}">FIFA ${String(num(match.edition)).padStart(2,'0')} · ARCHIVE</button><button data-su-open-passport="${esc(match.awayName)}">${esc(match.awayName)} · PASSPORT</button></section>
    </div>`;
  }

  function historyRows(){
    try { const rows=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]'); return Array.isArray(rows)?rows:[]; }
    catch(_){return[];}
  }
  function writeHistory(rows){try{localStorage.setItem(HISTORY_KEY,JSON.stringify(rows.slice(0,MAX_HISTORY)));}catch(_){}}
  function addHistory(type,title,detail,meta={}){
    const rows=historyRows(); const signature=`${type}:${title}:${detail}`;
    if(rows[0]?.signature===signature)return;
    rows.unshift({id:`lh-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,signature,type,title,detail,meta,time:Date.now()}); writeHistory(rows);
  }

  function recordSnapshot(data=getData()){
    const latest=latestMatches(data,1)[0];
    const leader=[...(data?.fpi?.players||[])].sort((a,b)=>num(a.rank)-num(b.rank))[0];
    const records=data?.allTime?.records||{};
    const recordSig=Object.entries(records).map(([k,v])=>`${k}:${v?.name||v?.winner||v?.player||''}:${v?.score||v?.titles||v?.wins||v?.gf||v?.games||''}`).join('|');
    return {latestId:latest?.id||'',latestLabel:latest?`${latest.homeName} ${latest.homeScore}-${latest.awayScore} ${latest.awayName}`:'',leader:leader?.name||'',recordSig,time:Date.now()};
  }

  function updateLivingHistory(){
    const data=getData(), next=recordSnapshot(data); let prev={};
    try{prev=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'{}')||{};}catch(_){}
    if(prev.latestId && next.latestId && prev.latestId!==next.latestId) addHistory('result',isTR()?'Yeni Resmî Sonuç':'New Official Result',next.latestLabel,{matchId:next.latestId});
    if(prev.leader && next.leader && normalize(prev.leader)!==normalize(next.leader)) addHistory('standing',isTR()?'Standing Lideri Değişti':'Standing Leader Changed',`${prev.leader} → ${next.leader}`,{});
    if(prev.recordSig && next.recordSig && prev.recordSig!==next.recordSig) addHistory('record',isTR()?'Record Vault Güncellendi':'Record Vault Updated',isTR()?'Tüm-zamanlar kayıtlarından en az biri el değiştirdi.':'At least one all-time record changed holder.',{});
    try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(next));}catch(_){}
  }

  function renderHistory(){
    activateScene('history'); pushCrumb(isTR()?'Yaşayan Tarih':'Living History','history');
    const root=document.querySelector('#ssSceneHistory'); if(!root)return;
    const rows=historyRows();
    root.innerHTML=`<div class="su-scene-inner ss-history-inner"><header class="ss-history-hero"><div><span>VISUAL EVENT HISTORY CENTRE</span><h2>${isTR()?'Evren ne zaman değişti?':'When did the universe change?'}</h2><p>${isTR()?'Yeni sonuçlar, Standing lider değişimleri ve Record Vault hareketleri artık kaybolmuyor; yaşayan tarih akışında arşivleniyor.':'New results, Standing leader changes and Record Vault movements are archived instead of disappearing.'}</p></div><div><strong>${rows.length}</strong><small>${isTR()?'ARŞİVLENMİŞ OLAY':'ARCHIVED EVENTS'}</small></div></header>
      <div class="ss-history-stream">${rows.length?rows.map((row,i)=>`<article class="${esc(row.type)}"><div class="ss-history-axis"><i></i><b>${new Date(row.time).toLocaleString(isTR()?'tr-TR':'en-US',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</b></div><div><span>${row.type==='result'?'●':row.type==='standing'?'♛':'◆'} ${esc(row.title)}</span><h3>${esc(row.detail)}</h3>${row.meta?.matchId?`<button data-ss-open-stadium="${esc(row.meta.matchId)}">◉ ${isTR()?'Stadyumda Aç':'Open in Stadium'}</button>`:''}</div></article>`).join(''):`<div class="ss-empty"><span>⌁ LIVING HISTORY</span><h3>${isTR()?'Yeni değişiklikler burada arşivlenecek.':'New changes will be archived here.'}</h3></div>`}</div>
      <footer class="ss-history-footer"><button type="button" data-ss-clear-history>${isTR()?'Yerel Olay Arşivini Temizle':'Clear Local Event Archive'}</button><small>${isTR()?'Bu arşiv yalnızca bu tarayıcıda tutulur; resmî maç kayıtlarını değiştirmez.':'This archive is local to this browser and never changes official match data.'}</small></footer></div>`;
  }

  function applyLivingTrophyLighting(){
    document.querySelectorAll('#suShell [data-su-trophy-edition]').forEach(el=>{
      const edition=Number(el.dataset.suTrophyEdition||1);
      const hue=String(editionHue(edition));
      if(el.style.getPropertyValue('--ss-era-hue')!==hue) el.style.setProperty('--ss-era-hue',hue);
      if(!el.classList.contains('ss-era-lit')) el.classList.add('ss-era-lit');
    });
  }

  function augmentHologram(){
    const holo=document.querySelector('#suHoloLayer .su-holo-card'); if(!holo)return;
    if(holo.querySelector('[data-ss-open-stadium]'))return;
    let matchId=state.lastClickedMatchId;
    if(!matchId && state.lastEdition){ matchId=finalMatchForEdition(state.lastEdition)?.id || ''; }
    if(!matchId)return;
    const actions=holo.querySelector('.su-holo-actions') || holo;
    actions.insertAdjacentHTML('beforeend',`<button type="button" class="ss-stadium-gate" data-ss-open-stadium="${esc(matchId)}">◉ ${isTR()?'SPATIAL STADIUM’DA AÇ':'OPEN IN SPATIAL STADIUM'}</button>`);
  }

  function augmentHomePortal(){
    const portal=document.querySelector('.su-home-portal-copy'); if(!portal)return;
    const actions=portal.querySelector('div'); if(!actions || actions.querySelector('[data-ss-open-stadium]'))return;
    const latest=latestMatches(getData(),1)[0]; if(!latest)return;
    actions.insertAdjacentHTML('beforeend',`<button data-ss-open-stadium="${esc(latest.id)}">◉ STADIUM</button>`);
  }

  function showScene(id){
    if(id==='stadium')return renderStadium();
    if(id==='history')return renderHistory();
  }

  function openStadium(matchId=''){
    const v=visual();
    if(v?.open) v.open('theatre'); else document.querySelector('.su-launcher')?.click();
    setTimeout(()=>{ensureScenes();renderStadium(matchId||state.matchId);},30);
  }

  function goEdition(edition){
    state.lastEdition=Number(edition)||0;
    const v=visual(); if(v?.edition) v.edition(edition);
  }

  function directorSequence(){
    const data=getData(); const keyMatch=importantCurrentStory(data);
    return [
      ()=>keyMatch && openStadium(keyMatch.id),
      ()=>{visual()?.open?.('galaxy');pushCrumb('Player Galaxy','galaxy');},
      ()=>{visual()?.open?.('records');pushCrumb('Record Vault','records');},
      ()=>renderHistory(),
      ()=>{visual()?.open?.('dynasty');pushCrumb('Dynasty Corridor','dynasty');},
      ()=>latestMatches(data,1)[0] && openStadium(latestMatches(data,1)[0].id)
    ].filter(Boolean);
  }

  function stopDirector(){
    state.director=false; if(state.directorTimer){clearInterval(state.directorTimer);state.directorTimer=null;}
    document.querySelector('[data-ss-director]')?.classList.remove('active'); document.body.classList.remove('ss-director-mode');
  }

  function startDirector(ambient=false){
    if(state.director){stopDirector();return;}
    state.director=true;state.directorIndex=0;document.body.classList.add('ss-director-mode');document.querySelector('[data-ss-director]')?.classList.add('active');
    const sequence=directorSequence(); if(!sequence.length)return;
    sequence[0]?.();
    state.directorTimer=setInterval(()=>{if(!state.director)return;state.directorIndex=(state.directorIndex+1)%sequence.length;sequence[state.directorIndex]?.();},ambient?8500:7200);
  }

  async function startAmbient(){
    try{await document.documentElement.requestFullscreen?.();}catch(_){}
    startDirector(true);
  }

  function bind(){
    document.addEventListener('click',event=>{
      const baseNav=event.target.closest('[data-su-tab],[data-su-scene],[data-su-route],[data-su-close],[data-su-normal-site],[data-su-cinematic]');
      if(baseNav) setExtensionScene('');
      const stadiumTab=event.target.closest('[data-ss-tab="stadium"]'); if(stadiumTab){event.preventDefault();event.stopPropagation();renderStadium();return;}
      const historyTab=event.target.closest('[data-ss-tab="history"]'); if(historyTab){event.preventDefault();event.stopPropagation();renderHistory();return;}
      const match=event.target.closest('[data-ss-match]'); if(match){renderStadium(match.dataset.ssMatch);return;}
      const openMatch=event.target.closest('[data-ss-open-stadium]'); if(openMatch){event.preventDefault();openStadium(openMatch.dataset.ssOpenStadium);return;}
      const edition=event.target.closest('[data-ss-edition]'); if(edition){goEdition(edition.dataset.ssEdition);return;}
      const director=event.target.closest('[data-ss-director]'); if(director){startDirector(false);return;}
      const ambient=event.target.closest('[data-ss-ambient]'); if(ambient){startAmbient();return;}
      const clear=event.target.closest('[data-ss-clear-history]'); if(clear){writeHistory([]);renderHistory();return;}
      const crumb=event.target.closest('[data-ss-crumb]'); if(crumb){const c=state.breadcrumbs[Number(crumb.dataset.ssCrumb)];if(!c)return;if(c.scene==='stadium')openStadium(c.meta);else if(c.scene==='history')renderHistory();else visual()?.open?.(c.scene);return;}
      const baseMatch=event.target.closest('[data-su-match-id]'); if(baseMatch){state.lastClickedMatchId=baseMatch.dataset.suMatchId;setTimeout(augmentHologram,30);}
      const trophy=event.target.closest('[data-su-trophy-edition]'); if(trophy){state.lastEdition=Number(trophy.dataset.suTrophyEdition)||0;setTimeout(augmentHologram,30);}
      const star=event.target.closest('[data-su-galaxy-player]'); if(star)pushCrumb(star.dataset.suGalaxyPlayer,'galaxy');
      const rivalry=event.target.closest('[data-su-rivalry-a]'); if(rivalry)pushCrumb(`${rivalry.dataset.suRivalryA} vs ${rivalry.dataset.suRivalryB}`,'compare');
      const tab=event.target.closest('[data-su-tab]'); if(tab)pushCrumb(tab.textContent.trim(),tab.dataset.suTab);
    }, true);

    document.addEventListener('keydown',event=>{
      if(!document.body.classList.contains('su-open'))return;
      if(event.key==='8' && !/input|select|textarea/i.test(document.activeElement?.tagName||'')){event.preventDefault();renderStadium();}
      if(event.key==='9' && !/input|select|textarea/i.test(document.activeElement?.tagName||'')){event.preventDefault();renderHistory();}
      if((event.key==='d'||event.key==='D') && !window.__FIFA_SPATIAL_RIVALRY_V550__ && !/input|select|textarea/i.test(document.activeElement?.tagName||'')){event.preventDefault();startDirector(false);}
    });

    const sync=()=>{
      if(syncTimer) clearTimeout(syncTimer);
      syncTimer=setTimeout(()=>{
        updateLivingHistory();
        augmentHomePortal();
        if(document.body.classList.contains('su-open')){
          ensureScenes();
          applyLivingTrophyLighting();
          renderBreadcrumbs();
        }
        if(state.scene==='stadium'&&document.body.classList.contains('su-open')){
          const current=findMatch(state.matchId,getData());
          const sig=stadiumSignature(current);
          if(current && sig!==lastStadiumSignature) renderStadium(state.matchId);
        }
      },650);
    };
    window.addEventListener('fifa10:draw-updated',sync);window.addEventListener('fifa:state-updated',sync);
    window.addEventListener('storage',event=>{if(event.key&&/fifa/i.test(event.key))sync();});
    window.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&state.director)stopDirector();});

    // IMPORTANT: No global MutationObserver here. V5.4.0 observed its own DOM writes
    // and created a render feedback loop. Maintenance is low-frequency and idempotent.
    if(!maintenanceTimer){
      maintenanceTimer=setInterval(()=>{
        augmentHomePortal();
        if(document.body.classList.contains('su-open')){
          ensureScenes();
          applyLivingTrophyLighting();
          renderBreadcrumbs();
        }
      },3200);
    }
  }

  function boot(){
    if(window.__FIFA_SPATIAL_STADIUM_V540__)return; window.__FIFA_SPATIAL_STADIUM_V540__=true;
    const wait=()=>{
      if(!window.INFANTINO_VISUAL){setTimeout(wait,120);return;}
      ensureScenes();bind();updateLivingHistory();augmentHomePortal();applyLivingTrophyLighting();
      setTimeout(augmentHomePortal,900); setTimeout(augmentHomePortal,2400);
      window.INFANTINO_STADIUM={version:VERSION,build:BUILD,open:openStadium,history:renderHistory,director:startDirector,ambient:startAmbient,stop:stopDirector,data:getData};
    };
    wait();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
