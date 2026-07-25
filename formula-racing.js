(() => {
  "use strict";

  const STORAGE_KEY = "fifa9_formula_horizon25_state_v1";
  const formatTime = milliseconds => window.F1_RACE_ENGINE.formatTime(milliseconds);
  const tracks = window.F1_TRACKS.TRACKS;

  let host = null;
  let engine = null;
  let selectedTab = "challenge";
  let selectedTrackId = localStorage.getItem("fifa9_horizon25_selected_track_v1") || tracks[0].id;
  let lastResult = null;
  let submitting = false;
  const miniMapCache = new Map();
  let lastMiniMapDrawAt = 0;

  function loadState() {
    try {
      return {
        sessions:0,
        completions:0,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      };
    } catch {
      return {sessions:0,completions:0};
    }
  }

  const state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  }

  function difficultyStars(value) {
    return "★".repeat(Number(value || 1)) + "☆".repeat(Math.max(0,5-Number(value || 1)));
  }

  function selectedTrack() {
    return window.F1_TRACKS.getTrack(selectedTrackId);
  }

  function dashboardCard() {
    const record = window.F1_LEADERBOARD?.getLocalRecord?.(selectedTrackId);
    return `<article class="experience-mode-card formula-mode-card" data-nav="formula1">
      <div class="experience-mode-icon">FR</div>
      <div>
        <span>FORMULA HORIZON 25</span>
        <h3>25 Pist · Tek Araç</h3>
        <p>Arkadan perspektif yarış, sabit 5 tur ve global en hızlı tur / toplam süre sıralamaları.</p>
      </div>
      <footer><b>${record?.bestLapMs ? formatTime(record.bestLapMs) : "NO RECORD"}</b><small>LOCAL FASTEST LAP</small></footer>
    </article>`;
  }

  function trackCards() {
    return tracks.map(track => {
      const record = window.F1_LEADERBOARD?.getLocalRecord?.(track.id);
      return `<button class="fh25-track-card ${track.id===selectedTrackId?"active":""}" data-f1-action="select-track" data-track="${track.id}" style="--track-accent:${window.F1_TRACKS.THEMES[track.theme].accent}">
        <span>${String(tracks.indexOf(track)+1).padStart(2,"0")}</span>
        <div><strong>${esc(track.name)}</strong><small>${esc(track.location)}</small></div>
        <em>${difficultyStars(track.difficulty)}</em>
        <footer><b>${track.lengthKm.toFixed(1)} KM</b><small>${record?.bestLapMs?formatTime(record.bestLapMs):"No local lap"}</small></footer>
      </button>`;
    }).join("");
  }

  function selectedTrackPanel() {
    const track = selectedTrack();
    const theme = window.F1_TRACKS.THEMES[track.theme];
    const record = window.F1_LEADERBOARD?.getLocalRecord?.(track.id);
    return `<section class="fh25-selected-track" style="--track-accent:${theme.accent};--track-sky:${theme.skyBottom}">
      <div>
        <span>SELECTED CIRCUIT · ${String(tracks.indexOf(track)+1).padStart(2,"0")}/25</span>
        <h2>${esc(track.name)}</h2>
        <p>${esc(track.tagline)}</p>
        <div class="fh25-track-meta">
          <article><small>LOCATION</small><b>${esc(track.location)}</b></article>
          <article><small>LENGTH</small><b>${track.lengthKm.toFixed(1)} KM</b></article>
          <article><small>CHALLENGE</small><b>5 LAPS</b></article>
          <article><small>DIFFICULTY</small><b>${difficultyStars(track.difficulty)}</b></article>
        </div>
      </div>
      <aside>
        <article><small>LOCAL FASTEST LAP</small><strong>${record?.bestLapMs?formatTime(record.bestLapMs):"—"}</strong></article>
        <article><small>LOCAL 5-LAP TOTAL</small><strong>${record?.fiveLapMs?formatTime(record.fiveLapMs):"—"}</strong></article>
      </aside>
    </section>`;
  }

  function challengeView() {
    return `<section class="fh25-page">
      ${selectedTrackPanel()}
      <section class="fh25-start-panel">
        <div>
          <span>OFFICIAL GLOBAL SESSION</span>
          <h3>5 Lap Track Challenge</h3>
          <p>Tek araç, eşit performans, kuru pist. Beş turun toplamı ve en hızlı temiz turun ayrı ayrı global sıralamaya gönderilir.</p>
        </div>
        <label><span>SÜRÜCÜ ADI</span><input id="fh25DriverName" maxlength="40" value="${esc(window.F1_LEADERBOARD.getPlayerName())}" /></label>
        <button class="fh25-primary" data-f1-action="start-race">5 TURU BAŞLAT</button>
      </section>
      <section class="fh25-control-strip">
        <article><b>W / ↑</b><span>GAZ</span></article>
        <article><b>S / ↓</b><span>FREN</span></article>
        <article><b>A D / ← →</b><span>DİREKSİYON</span></article>
        <article><b>ESC</b><span>DURAKLAT</span></article>
        <article><b>MOBILE</b><span>YATAY DOKUNMATİK</span></article>
      </section>
      <header class="fh25-section-heading"><div><span>25 CIRCUITS</span><h3>Pist Seçimi</h3></div><small>Her pistin ayrı global listesi bulunur.</small></header>
      <div class="fh25-track-grid">${trackCards()}</div>
    </section>`;
  }

  function recordsView() {
    const track = selectedTrack();
    const metric = window.F1_LEADERBOARD.getSelectedMetric();
    return `<section class="fh25-page">
      ${selectedTrackPanel()}
      <section class="fh25-records-toolbar">
        <div>
          <span>GLOBAL TRACK RECORDS</span>
          <h3>${esc(track.name)}</h3>
        </div>
        <div class="fh25-metric-switch">
          <button class="${metric==="lap"?"active":""}" data-f1-action="metric" data-metric="lap">FASTEST LAP</button>
          <button class="${metric==="total"?"active":""}" data-f1-action="metric" data-metric="total">5-LAP TOTAL</button>
        </div>
        <button data-f1-action="refresh-records">↻ REFRESH</button>
      </section>
      <div id="fh25Leaderboard">${window.F1_LEADERBOARD.renderTable()}</div>
      <header class="fh25-section-heading"><div><span>CHANGE CIRCUIT</span><h3>25 Pist</h3></div></header>
      <div class="fh25-track-grid compact">${trackCards()}</div>
    </section>`;
  }

  function render(target = host) {
    if (!target) return;
    host = target;
    document.body.classList.remove("fh25-race-active");
    const track = selectedTrack();
    window.F1_LEADERBOARD.setTrack(track.id);

    target.innerHTML = `<section class="fh25-hub">
      <header class="fh25-hero">
        <div><span>FORMULA RACING REBUILT</span><h1>FORMULA HORIZON <b>25</b></h1><p>Tek araç · arkadan perspektif · 25 pist · 5 turluk global challenge</p></div>
        <aside><strong>25</strong><span>UNIQUE CIRCUITS</span></aside>
      </header>
      <nav class="fh25-tabs">
        <button class="${selectedTab==="challenge"?"active":""}" data-f1-action="tab" data-tab="challenge">5 LAP CHALLENGE</button>
        <button class="${selectedTab==="records"?"active":""}" data-f1-action="tab" data-tab="records">GLOBAL RECORDS</button>
      </nav>
      ${selectedTab === "records" ? recordsView() : challengeView()}
    </section>`;

    if (selectedTab === "records") {
      window.F1_LEADERBOARD.refresh(track.id,window.F1_LEADERBOARD.getSelectedMetric());
    }
  }


  function buildMiniMapPoints(track) {
    if (miniMapCache.has(track.id)) return miniMapCache.get(track.id);

    const segments = window.F1_TRACKS.buildSegments(track);
    const raw = [{x:0,y:0}];
    let heading = 0;
    let x = 0;
    let y = 0;

    segments.forEach(segment => {
      heading += Number(segment.curve || 0) * .021;
      x += Math.sin(heading);
      y -= Math.cos(heading);
      raw.push({x,y});
    });

    // Close the generated route gradually so the map reads as a circuit.
    const end = raw[raw.length - 1];
    const corrected = raw.map((point,index) => {
      const t = index / Math.max(1,raw.length - 1);
      return {
        x:point.x - end.x * t,
        y:point.y - end.y * t
      };
    });

    const xs = corrected.map(point=>point.x);
    const ys = corrected.map(point=>point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(.001,maxX-minX);
    const spanY = Math.max(.001,maxY-minY);

    const normalized = corrected.map(point=>({
      x:(point.x-minX)/spanX,
      y:(point.y-minY)/spanY
    }));
    miniMapCache.set(track.id,normalized);
    return normalized;
  }

  function drawMiniMap(snapshot,force=false) {
    const now = performance.now();
    if (!force && now-lastMiniMapDrawAt<100) return;
    lastMiniMapDrawAt = now;

    const canvas = document.getElementById("fh25MiniMap");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(150,Math.round(rect.width || 240));
    const height = Math.max(100,Math.round(rect.height || 155));
    const dpr = Math.min(1.5,window.devicePixelRatio || 1);

    if (canvas.width !== Math.round(width*dpr) || canvas.height !== Math.round(height*dpr)) {
      canvas.width = Math.round(width*dpr);
      canvas.height = Math.round(height*dpr);
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const points = buildMiniMapPoints(snapshot.track);
    const padding = 17;
    const plot = point => ({
      x:padding+point.x*(width-padding*2),
      y:padding+point.y*(height-padding*2)
    });

    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(255,255,255,.16)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    points.forEach((point,index)=>{
      const p=plot(point);
      if(index===0) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.strokeStyle = window.F1_TRACKS.THEMES[snapshot.track.theme].accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((point,index)=>{
      const p=plot(point);
      if(index===0) ctx.moveTo(p.x,p.y);
      else ctx.lineTo(p.x,p.y);
    });
    ctx.closePath();
    ctx.stroke();

    const start=plot(points[0]);
    ctx.strokeStyle="#f5f5f2";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(start.x-5,start.y-5);
    ctx.lineTo(start.x+5,start.y+5);
    ctx.stroke();

    const progress = Math.max(0,Math.min(.999999,Number(snapshot.progress || 0)));
    const pointIndex = Math.min(points.length-1,Math.floor(progress*(points.length-1)));
    const car=plot(points[pointIndex]);

    ctx.fillStyle="rgba(0,0,0,.65)";
    ctx.beginPath();
    ctx.arc(car.x,car.y,8,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#f2c55b";
    ctx.beginPath();
    ctx.arc(car.x,car.y,5,0,Math.PI*2);
    ctx.fill();

    const progressNode=document.getElementById("fh25MapProgress");
    if(progressNode) progressNode.textContent=`${Math.round(progress*100)}%`;
    const locationNode=document.getElementById("fh25MapLocation");
    if(locationNode) locationNode.textContent=`LAP ${snapshot.lap}/5 · YOU`;
  }

  function raceMarkup(track) {
    return `<section class="fh25-race-view">
      <canvas id="fh25Canvas"></canvas>
      <header class="fh25-race-top">
        <div><span>FORMULA HORIZON 25</span><strong>${esc(track.name)}</strong></div>
        <section>
          <article><small>LAP</small><b id="fh25Lap">1 / 5</b></article>
          <article><small>CURRENT</small><b id="fh25Current">0:00.000</b></article>
          <article><small>BEST</small><b id="fh25Best">—</b></article>
          <article><small>TOTAL</small><b id="fh25Total">0:00.000</b></article>
          <article><small>SPEED</small><b><i id="fh25Speed">0</i> KM/H</b></article>
        </section>
        <div class="fh25-race-actions"><button data-f1-action="pause">Ⅱ</button><button data-f1-action="exit-race">×</button></div>
      </header>
      <aside class="fh25-lap-board">
        <header><span>5 LAP RESULT</span><b id="fh25CleanState">CLEAN LAP</b></header>
        <div id="fh25LapRows">${[1,2,3,4,5].map(lap=>`<article><span>LAP ${lap}</span><b id="fh25Lap${lap}">—</b></article>`).join("")}</div>
        <footer><span>PENALTY</span><b id="fh25Penalty">0.000</b></footer>
      </aside>
      <aside class="fh25-minimap">
        <header><span>LIVE TRACK MAP</span><b id="fh25MapProgress">0%</b></header>
        <canvas id="fh25MiniMap" width="260" height="170"></canvas>
        <footer><i></i><span id="fh25MapLocation">LAP 1/5 · YOU</span></footer>
      </aside>
      <div class="fh25-track-limit hidden" id="fh25TrackLimit"><strong>TRACK LIMITS</strong><span>+1.500 SEC</span></div>
      <div class="fh25-mobile-controls">
        <div><button data-control="left">◀</button><button data-control="right">▶</button></div>
        <div><button class="brake" data-control="brake">FREN</button><button class="throttle" data-control="throttle">GAZ</button></div>
      </div>
      <div class="fh25-pause hidden" id="fh25Pause"><span>RACE PAUSED</span><h2>Yarış duraklatıldı</h2><button data-f1-action="resume">Devam Et</button><button data-f1-action="exit-race">Ana Merkeze Dön</button></div>
      <div class="fh25-result hidden" id="fh25Result"></div>
    </section>`;
  }

  function startRace() {
    const driverInput = document.getElementById("fh25DriverName");
    const playerName = window.F1_LEADERBOARD.setPlayerName(driverInput?.value || window.F1_LEADERBOARD.getPlayerName());
    if (playerName.length < 2) {
      toast("Sürücü adı en az iki karakter olmalı.","error");
      return;
    }

    stopRace();
    state.sessions += 1;
    saveState();
    const track = selectedTrack();
    document.body.classList.add("fh25-race-active");
    host.innerHTML = raceMarkup(track);

    lastMiniMapDrawAt = 0;
    const canvas = document.getElementById("fh25Canvas");
    engine = new window.F1_RACE_ENGINE.FormulaHorizonEngine(canvas,{
      trackId:track.id,
      onTick:updateRaceHud,
      onLap:updateLapRow,
      onTrackLimit:showTrackLimit,
      onPause:paused=>document.getElementById("fh25Pause")?.classList.toggle("hidden",!paused),
      onFinish:result=>finishRace(result,playerName)
    });
    bindMobileControls();
    engine.start();
  }

  function updateRaceHud(snapshot) {
    const set = (id,value) => { const node=document.getElementById(id); if(node) node.textContent=value; };
    set("fh25Lap",`${snapshot.lap} / 5`);
    set("fh25Current",formatTime(snapshot.currentLapTime));
    set("fh25Best",formatTime(snapshot.bestLapMs));
    set("fh25Total",formatTime(snapshot.elapsed));
    set("fh25Speed",String(snapshot.speed));
    set("fh25Penalty",(snapshot.totalPenaltyMs/1000).toFixed(3));
    drawMiniMap(snapshot);
    const clean = document.getElementById("fh25CleanState");
    if (clean) {
      clean.textContent = snapshot.clean ? "CLEAN LAP" : "LAP INVALID";
      clean.classList.toggle("invalid",!snapshot.clean);
    }
  }

  function updateLapRow(lap) {
    const node = document.getElementById(`fh25Lap${lap.lap}`);
    if (!node) return;
    node.textContent = `${formatTime(lap.timeMs)}${lap.clean ? "" : " · INVALID"}`;
    node.classList.toggle("invalid",!lap.clean);
  }

  function showTrackLimit() {
    const node = document.getElementById("fh25TrackLimit");
    if (!node) return;
    node.classList.remove("hidden");
    window.clearTimeout(showTrackLimit.timer);
    showTrackLimit.timer = window.setTimeout(()=>node.classList.add("hidden"),1600);
  }

  async function finishRace(result,playerName) {
    state.completions += 1;
    saveState();
    lastResult = result;
    const panel = document.getElementById("fh25Result");
    if (!panel) return;
    panel.classList.remove("hidden");
    panel.innerHTML = resultMarkup(result,null,true);
    submitting = true;
    const submission = await window.F1_LEADERBOARD.submitResult({...result,playerName});
    submitting = false;
    panel.innerHTML = resultMarkup(result,submission,false);
  }

  function resultMarkup(result,submission,loading) {
    const laps = result.laps.map(item=>`<article class="${item.clean?"":"invalid"}"><span>LAP ${item.lap}</span><b>${formatTime(item.timeMs)}</b><small>${item.clean?"VALID":`+${(item.penaltyMs/1000).toFixed(3)} SEC`}</small></article>`).join("");
    const cloud = loading
      ? '<div class="fh25-uploading">Global sıralamaya gönderiliyor…</div>'
      : submission?.status === "online"
        ? `<div class="fh25-global-ranks"><article><small>FASTEST LAP RANK</small><b>${submission.lapRank?`#${submission.lapRank}`:"—"}</b></article><article><small>5-LAP TOTAL RANK</small><b>${submission.totalRank?`#${submission.totalRank}`:"—"}</b></article></div>`
        : '<div class="fh25-uploading warning">Bulut bağlantısı yok. Sonuç cihazda saklandı.</div>';

    return `<section>
      <span>OFFICIAL SESSION COMPLETE</span>
      <h2>${esc(result.trackName)}</h2>
      <div class="fh25-result-summary">
        <article><small>FASTEST CLEAN LAP</small><strong>${formatTime(result.bestLapMs)}</strong></article>
        <article><small>5-LAP TOTAL</small><strong>${formatTime(result.fiveLapMs)}</strong></article>
        <article><small>CLEAN LAPS</small><strong>${result.cleanLapCount} / 5</strong></article>
      </div>
      <div class="fh25-result-laps">${laps}</div>
      ${cloud}
      <footer><button data-f1-action="race-again">Tekrar Yarış</button><button data-f1-action="show-result-records">Global Listeyi Aç</button><button data-f1-action="exit-race">Ana Merkez</button></footer>
    </section>`;
  }

  function bindMobileControls() {
    document.querySelectorAll("[data-control]").forEach(button=>{
      const control = button.dataset.control;
      const down = event => { event.preventDefault(); engine?.setControl(control,true); };
      const up = event => { event.preventDefault(); engine?.setControl(control,false); };
      button.addEventListener("pointerdown",down);
      button.addEventListener("pointerup",up);
      button.addEventListener("pointercancel",up);
      button.addEventListener("pointerleave",up);
    });
  }

  function stopRace() {
    engine?.destroy();
    engine = null;
    document.body.classList.remove("fh25-race-active");
  }

  function exitRace() {
    stopRace();
    render(host);
  }

  function toast(message,type="info") {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    stack.appendChild(node);
    setTimeout(()=>node.remove(),3200);
  }

  function onClick(event) {
    const target = event.target.closest("[data-f1-action]");
    if (!target) return;
    const action = target.dataset.f1Action;

    if (action === "tab") {
      selectedTab = target.dataset.tab || "challenge";
      render(host);
    }
    if (action === "select-track") {
      selectedTrackId = target.dataset.track;
      localStorage.setItem("fifa9_horizon25_selected_track_v1",selectedTrackId);
      window.F1_LEADERBOARD.setTrack(selectedTrackId);
      render(host);
    }
    if (action === "start-race") startRace();
    if (action === "pause") engine?.togglePause();
    if (action === "resume") engine?.togglePause(false);
    if (action === "exit-race") exitRace();
    if (action === "race-again") startRace();
    if (action === "show-result-records") {
      stopRace();
      selectedTab = "records";
      render(host);
    }
    if (action === "metric") {
      window.F1_LEADERBOARD.setMetric(target.dataset.metric);
      window.F1_LEADERBOARD.refresh(selectedTrackId,target.dataset.metric);
      render(host);
    }
    if (action === "refresh-records") {
      window.F1_LEADERBOARD.refresh(selectedTrackId,window.F1_LEADERBOARD.getSelectedMetric(),true);
    }
  }

  function onChange(event) {
    if (event.target.id === "fh25DriverName") window.F1_LEADERBOARD.setPlayerName(event.target.value);
  }

  document.addEventListener("click",onClick);
  document.addEventListener("change",onChange);
  document.addEventListener("visibilitychange",()=>{
    if (document.hidden && engine?.running) engine.togglePause(true);
  });
  document.addEventListener("click",event=>{
    const nav = event.target.closest("[data-nav]");
    if (nav && nav.dataset.nav !== "formula1") stopRace();
  },true);
  window.addEventListener("f1-leaderboard-updated",()=>{
    if (selectedTab === "records" && host && !document.body.classList.contains("fh25-race-active")) render(host);
  });

  window.F1_RACING = Object.freeze({
    render,
    dashboardCard,
    stopRace,
    getState:()=>({...state}),
    getSelectedTrack:()=>selectedTrackId,
    buildMiniMapPoints
  });
})();
