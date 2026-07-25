(() => {
  "use strict";

  const STORAGE_KEY = "fifa9_formula_racing_v4490";
  const DEFAULT_STATE = {
    version:1,
    driver:{ xp:0, level:1, skillPoints:0, races:0, wins:0, podiums:0, rating:60 },
    settings:{ trackId:"oruc-reis", difficulty:"standard", laps:3, mode:"race" },
    mastery:{},
    records:{}
  };

  let state = loadState();
  let host = null;
  let engine = null;
  let lastSnapshot = null;
  let result = null;

  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
  const formatTime = seconds => {
    if (!Number.isFinite(seconds)) return "—";
    const minutes = Math.floor(seconds / 60);
    const remain = seconds - minutes * 60;
    return `${minutes}:${remain.toFixed(2).padStart(5,"0")}`;
  };

  function merge(base, candidate) {
    return {
      ...base,
      ...(candidate || {}),
      driver:{ ...base.driver, ...(candidate?.driver || {}) },
      settings:{ ...base.settings, ...(candidate?.settings || {}) },
      mastery:{ ...base.mastery, ...(candidate?.mastery || {}) },
      records:{ ...base.records, ...(candidate?.records || {}) }
    };
  }

  function loadState() {
    try { return merge(DEFAULT_STATE, JSON.parse(localStorage.getItem(STORAGE_KEY) || "null")); }
    catch { return merge(DEFAULT_STATE, null); }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function playerName() {
    return window.FIFA_MANAGER_ROOM?.getActiveCareer?.()?.playerName || "Çağlar Can Tatar";
  }

  function xpForNext(level) { return 500 + (level - 1) * 240; }
  function levelProgress() {
    const target = xpForNext(state.driver.level);
    return Math.min(100, state.driver.xp / target * 100);
  }

  function addXp(amount) {
    state.driver.xp += amount;
    let levels = 0;
    while (state.driver.xp >= xpForNext(state.driver.level)) {
      state.driver.xp -= xpForNext(state.driver.level);
      state.driver.level += 1;
      state.driver.skillPoints += 1;
      state.driver.rating = Math.min(99, state.driver.rating + 1);
      levels += 1;
    }
    return levels;
  }

  function trackMastery(trackId) { return Number(state.mastery[trackId] || 0); }

  function dashboardCard() {
    return `<section class="f1-dashboard-promo">
      <div class="f1-dashboard-copy"><span>NEW PLAYABLE EXPERIENCE</span><h3>Formula Racing</h3><p>PC klavyesi veya mobil dokunmatik kontrollerle 12 araçlık gerçek zamanlı yarış. XP, pist uzmanlığı ve kariyer gelişimi.</p><div><button class="btn btn-gold" data-nav="formula1">Formula Racing'i Aç</button><b>PC + MOBILE</b></div></div>
      <div class="f1-dashboard-car"><i></i><strong>01</strong><span>RACE READY</span></div>
    </section>`;
  }

  function render(container) {
    host = container;
    stopRace();
    document.body.classList.remove("f1-race-active");
    result = null;
    const tracks = window.F1_TRACKS.TRACKS;
    const selected = window.F1_TRACKS.getTrack(state.settings.trackId);
    host.innerHTML = `<section class="f1-hub">
      <section class="f1-hero">
        <div class="f1-hero-copy"><span>TOURNAMENT UNIVERSE · FORMULA RACING</span><h2>Drive it.<br><em>Earn it.</em></h2><p>12 araç, 1 insan pilot ve 11 yapay zekâ rakibi. Masaüstünde klavye; telefonda dokunmatik direksiyon, gaz, fren ve ERS.</p><div class="f1-hero-actions"><button class="btn btn-gold" data-f1-action="start">Yarışı Başlat</button><button class="btn btn-ghost" data-f1-action="open-controls">Kontroller</button></div></div>
        <aside class="f1-driver-card"><span>DRIVER PROFILE</span><h3>${esc(playerName())}</h3><div class="f1-driver-level"><strong>${state.driver.level}</strong><small>LEVEL</small></div><div class="f1-xp"><i><b style="width:${levelProgress()}%"></b></i><span>${state.driver.xp} / ${xpForNext(state.driver.level)} XP</span></div><div class="f1-driver-kpis"><div><b>${state.driver.rating}</b><small>RATING</small></div><div><b>${state.driver.wins}</b><small>WINS</small></div><div><b>${state.driver.races}</b><small>RACES</small></div></div></aside>
      </section>

      <section class="f1-setup-grid">
        <article class="f1-panel f1-track-panel"><header><div><span>TRACK SELECT</span><h3>Pistini seç</h3></div><b>${tracks.length} PİST</b></header><div class="f1-track-grid">${tracks.map(track => `<button class="f1-track-card ${track.id===selected.id?"active":""} ${track.accent}" data-f1-action="track" data-track="${track.id}"><span>${track.country}</span><strong>${track.name}</strong><small>${track.character}</small><i>${trackMastery(track.id)} / 100 MASTERY</i></button>`).join("")}</div></article>
        <article class="f1-panel f1-race-config"><header><div><span>RACE CONFIG</span><h3>Yarış ayarları</h3></div></header>
          <label><span>Zorluk</span><select id="f1Difficulty"><option value="rookie" ${state.settings.difficulty==="rookie"?"selected":""}>Rookie · Yardımcı AI</option><option value="standard" ${state.settings.difficulty==="standard"?"selected":""}>Standard · Dengeli</option><option value="elite" ${state.settings.difficulty==="elite"?"selected":""}>Elite · Agresif AI</option></select></label>
          <label><span>Tur Sayısı</span><select id="f1Laps"><option value="2" ${state.settings.laps===2?"selected":""}>2 Tur · Sprint</option><option value="3" ${state.settings.laps===3?"selected":""}>3 Tur · Quick Race</option><option value="5" ${state.settings.laps===5?"selected":""}>5 Tur · Grand Prix</option></select></label>
          <div class="f1-config-summary"><div><strong>12</strong><small>ARAÇ</small></div><div><strong>1+11</strong><small>PLAYER + AI</small></div><div><strong>${selected.laps}</strong><small>PIST ÖNERİSİ</small></div></div>
        </article>
      </section>

      <section class="f1-control-grid">
        <article><span>PC MODE</span><h3>Klavye Kontrolleri</h3><div class="f1-key-map"><b>W / ↑<small>GAZ</small></b><b>S / ↓<small>FREN</small></b><b>A D / ← →<small>DİREKSİYON</small></b><b>SPACE<small>ERS BOOST</small></b><b>R<small>PISTE DÖN</small></b><b>ESC<small>DURAKLAT</small></b></div></article>
        <article><span>MOBILE MODE</span><h3>Dokunmatik Kontroller</h3><p>Sol tarafta direksiyon; sağ tarafta gaz, fren ve ERS. Yatay kullanım önerilir. Kontroller basılı tutulduğu sürece aktif kalır.</p><div class="f1-phone-demo"><i>◀</i><i>▶</i><b>GAZ</b><em>FREN</em><strong>ERS</strong></div></article>
      </section>

      <section class="f1-career-strip"><div><span>CAREER LOOP</span><h3>Yarış → XP → Pist Uzmanlığı → Driver Rating</h3></div><div><b>Galibiyet +220 XP</b><b>Podium +140 XP</b><b>Clean Race +60 XP</b><b>Overtake +8 XP</b></div></section>
    </section>`;
  }

  function controlsModal() {
    const modal = document.getElementById("modalBackdrop");
    const title = document.getElementById("modalTitle");
    const eyebrow = document.getElementById("modalEyebrow");
    const body = document.getElementById("modalBody");
    if (!modal || !body) return;
    title.textContent = "Formula Racing Kontrolleri";
    eyebrow.textContent = "PC + MOBILE";
    body.innerHTML = `<div class="f1-controls-modal"><h3>PC</h3><p><b>W / ↑</b> gaz · <b>S / ↓</b> fren · <b>A D / ← →</b> yön · <b>Space</b> ERS · <b>R</b> reset · <b>ESC</b> pause.</p><h3>Mobil</h3><p>Telefonu yatay çevir. Sol alt direksiyon tuşlarını, sağ alt gaz/fren/ERS tuşlarını basılı tut.</p><div class="info-box">İlk sürüm arcade-sim dengelidir. Pist dışı hız kaybettirir, temas temiz yarış bonusunu düşürür.</div></div>`;
    modal.classList.remove("hidden");
  }

  function raceMarkup() {
    return `<section class="f1-race-view">
      <canvas id="f1RaceCanvas" aria-label="Formula Racing oyun alanı"></canvas>
      <div class="f1-race-topbar"><div class="f1-race-brand"><span>FR</span><div><strong>FORMULA RACING</strong><small id="f1TrackName">—</small></div></div><div class="f1-race-session"><b id="f1Lap">LAP 1 / ${state.settings.laps}</b><strong id="f1Position">P12</strong><span id="f1Time">0:00.00</span></div><div class="f1-race-actions"><button data-f1-action="pause">Ⅱ</button><button data-f1-action="fullscreen">⛶</button><button data-f1-action="exit">×</button></div></div>
      <aside class="f1-live-standings" id="f1Standings"></aside>
      <div class="f1-telemetry"><div><span>SPEED</span><strong id="f1Speed">0</strong><small>KM/H</small></div><div><span>ERS</span><i><b id="f1ErsBar" style="width:100%"></b></i><strong id="f1Ers">100%</strong></div><div><span>BEST LAP</span><strong id="f1BestLap">—</strong></div><div><span>MASTERY</span><strong id="f1Mastery">${trackMastery(state.settings.trackId)}</strong></div></div>
      <div class="f1-mobile-controls" aria-label="Mobil yarış kontrolleri"><div class="f1-steer-controls"><button data-f1-control="left">◀</button><button data-f1-control="right">▶</button></div><div class="f1-pedal-controls"><button class="brake" data-f1-control="brake">FREN</button><button class="throttle" data-f1-control="throttle">GAZ</button><button class="boost" data-f1-control="boost">ERS</button></div></div>
      <div class="f1-rotate-hint"><span>↻</span><strong>Telefonu yatay çevir</strong><small>Daha iyi sürüş alanı için</small></div>
      <div class="f1-pause-panel hidden" id="f1PausePanel"><span>RACE PAUSED</span><h2>Yarış duraklatıldı</h2><button class="btn btn-gold" data-f1-action="resume">Devam Et</button><button class="btn btn-ghost" data-f1-action="exit">Ana Merkeze Dön</button></div>
      <div class="f1-result-panel hidden" id="f1ResultPanel"></div>
    </section>`;
  }

  function startRace() {
    stopRace();
    result = null;
    document.body.classList.add("f1-race-active");
    host.innerHTML = raceMarkup();
    const canvas = document.getElementById("f1RaceCanvas");
    const Engine = window.F1_RACE_ENGINE.FormulaRaceEngine;
    engine = new Engine(canvas, {
      trackId:state.settings.trackId,
      laps:state.settings.laps,
      difficulty:state.settings.difficulty,
      playerName:playerName(),
      onTick:updateHud,
      onPause:paused => document.getElementById("f1PausePanel")?.classList.toggle("hidden", !paused),
      onFinish:showResult
    });
    document.getElementById("f1TrackName").textContent = window.F1_TRACKS.getTrack(state.settings.trackId).name;
    bindMobileControls();
    engine.start();
  }

  function updateHud(snapshot) {
    lastSnapshot = snapshot;
    const player = snapshot.player;
    const speed = Math.max(0, Math.round(player.speed * .82));
    const set = (id, text) => { const node=document.getElementById(id); if(node) node.textContent=text; };
    set("f1Lap", `LAP ${snapshot.lap} / ${snapshot.lapsTarget}`);
    set("f1Position", `P${snapshot.rank}`);
    set("f1Time", formatTime(snapshot.elapsed));
    set("f1Speed", speed);
    set("f1Ers", `${Math.round(player.ers)}%`);
    set("f1BestLap", formatTime(player.bestLap));
    const bar=document.getElementById("f1ErsBar"); if(bar) bar.style.width=`${player.ers}%`;
    const standings=document.getElementById("f1Standings");
    if(standings) standings.innerHTML=`<header><span>LIVE</span><b>RACE ORDER</b></header>${snapshot.standings.slice(0,8).map((car,index)=>`<div class="${car.isPlayer?"player":""}"><span>${index+1}</span><i style="background:${car.color}"></i><strong>${esc(car.name)}</strong><small>${car.finished?"FIN":`L${Math.min(snapshot.lapsTarget,car.completedLaps+1)}`}</small></div>`).join("")}`;
  }

  function calculateRewards(data) {
    let xp = 80;
    if (data.rank === 1) xp += 220;
    else if (data.rank <= 3) xp += 140;
    else if (data.rank <= 6) xp += 70;
    xp += Math.min(80, data.stats.overtakes * 8);
    if (data.stats.clean) xp += 60;
    if (state.settings.difficulty === "elite") xp += 55;
    if (state.settings.difficulty === "standard") xp += 20;
    const mastery = Math.max(4, 16 - data.rank + (data.stats.clean ? 5 : 0));
    return { xp, mastery };
  }

  function showResult(data) {
    result = data;
    const rewards = calculateRewards(data);
    state.driver.races += 1;
    if (data.rank === 1) state.driver.wins += 1;
    if (data.rank <= 3) state.driver.podiums += 1;
    const levels = addXp(rewards.xp);
    state.mastery[state.settings.trackId] = Math.min(100, trackMastery(state.settings.trackId) + rewards.mastery);
    const record = state.records[state.settings.trackId] || {};
    if (!record.bestLap || (data.bestLap && data.bestLap < record.bestLap)) record.bestLap = data.bestLap;
    record.bestFinish = Math.min(record.bestFinish || 99, data.rank);
    record.races = Number(record.races || 0) + 1;
    state.records[state.settings.trackId] = record;
    saveState();
    const panel = document.getElementById("f1ResultPanel");
    if (!panel) return;
    panel.innerHTML = `<span>RACE COMPLETE</span><h2>P${data.rank} · ${data.track.name}</h2><p>${data.rank===1?"Dominant victory. Championship pace.":data.rank<=3?"Podium secured. Elite performance.":"Race completed. Experience earned."}</p><div class="f1-result-kpis"><div><b>+${rewards.xp}</b><small>DRIVER XP</small></div><div><b>+${rewards.mastery}</b><small>TRACK MASTERY</small></div><div><b>${formatTime(data.bestLap)}</b><small>BEST LAP</small></div><div><b>${data.stats.overtakes}</b><small>OVERTAKES</small></div></div>${levels?`<div class="f1-level-up">LEVEL UP · DRIVER LEVEL ${state.driver.level}</div>`:""}<div class="f1-result-actions"><button class="btn btn-gold" data-f1-action="restart">Tekrar Yarış</button><button class="btn btn-ghost" data-f1-action="exit">Formula Merkezine Dön</button></div>`;
    panel.classList.remove("hidden");
  }

  function bindMobileControls() {
    document.querySelectorAll("[data-f1-control]").forEach(button => {
      const control = button.dataset.f1Control;
      const activate = event => { event.preventDefault(); button.classList.add("pressed"); engine?.setMobileControl(control,true); };
      const release = event => { event.preventDefault(); button.classList.remove("pressed"); engine?.setMobileControl(control,false); };
      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("pointerleave", release);
    });
  }

  function stopRace() {
    engine?.destroy?.();
    engine = null;
    lastSnapshot = null;
    document.body.classList.remove("f1-race-active");
  }

  function exitRace() {
    stopRace();
    render(host || document.getElementById("view"));
  }

  async function fullscreen() {
    const race = document.querySelector(".f1-race-view");
    try {
      if (!document.fullscreenElement) await race?.requestFullscreen?.();
      else await document.exitFullscreen?.();
    } catch {}
  }

  function onClick(event) {
    const target = event.target.closest("[data-f1-action]");
    if (!target) return;
    const action = target.dataset.f1Action;
    if (action === "track") {
      state.settings.trackId = target.dataset.track;
      saveState();
      render(host);
    }
    if (action === "start") startRace();
    if (action === "open-controls") controlsModal();
    if (action === "pause") engine?.togglePause();
    if (action === "resume") engine?.togglePause(false);
    if (action === "fullscreen") fullscreen();
    if (action === "exit") exitRace();
    if (action === "restart") startRace();
  }

  function onChange(event) {
    if (event.target.id === "f1Difficulty") {
      state.settings.difficulty = event.target.value;
      saveState();
    }
    if (event.target.id === "f1Laps") {
      state.settings.laps = Number(event.target.value);
      saveState();
    }
  }

  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("click", event => {
    const nav = event.target.closest("[data-nav]");
    if (nav && nav.dataset.nav !== "formula1") stopRace();
  }, true);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && engine?.running) engine.togglePause(true);
  });

  window.F1_RACING = Object.freeze({
    render,
    dashboardCard,
    stopRace,
    getState:() => JSON.parse(JSON.stringify(state)),
    __diagnostics:Object.freeze({ calculateRewards, xpForNext, getTrackMastery:trackMastery })
  });
})();
