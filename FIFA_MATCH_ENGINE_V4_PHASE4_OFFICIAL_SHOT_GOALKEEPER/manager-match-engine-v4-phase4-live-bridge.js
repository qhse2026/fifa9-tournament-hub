(() => {
  "use strict";

  const VERSION = "4.0.0-phase4-live.1";
  const STORAGE_KEY = "fifa-me4-phase4-full-authority";
  const PITCH_WIDTH = 68;
  const runtime = {
    enabled: true,
    raf: null,
    observer: null,
    lastAppliedAt: 0,
    lastFixtureId: null,
    appliedFrames: 0
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const adapter = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE4 || globalThis.FIFA_MATCH_ENGINE_V4_SHADOW;
  const room = () => globalThis.FIFA_MANAGER_ROOM;

  function readPreference() {
    try {
      const value = globalThis.localStorage?.getItem?.(STORAGE_KEY);
      return value !== "0";
    } catch (_) {
      return true;
    }
  }

  function savePreference(value) {
    try { globalThis.localStorage?.setItem?.(STORAGE_KEY, value ? "1" : "0"); } catch (_) {}
  }

  function activeContext() {
    const career = room()?.getActiveCareer?.();
    if (!career) return null;
    const fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    const fixture = (career.activeMatchFixtureId ? fixtures.find(item => item.id === career.activeMatchFixtureId) : null) ||
      fixtures.find(item => ["live", "decision", "paused"].includes(item.matchEngine?.status));
    if (!fixture?.matchEngine) return null;
    return { career, fixture, engine: fixture.matchEngine };
  }

  function toPercentPoint(point = {}) {
    return {
      x: clamp(point.x, 1.2, 98.8),
      y: clamp(Number(point.y || 0) / PITCH_WIDTH * 100, 2.5, 97.5)
    };
  }

  function safeIntent(intent) {
    return String(intent || "hold-shape").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  }

  function intentLabel(intent) {
    const labels = {
      "hold-shape": "ŞEKLİ KORU",
      "support": "DESTEK",
      "support-run": "DESTEK KOŞUSU",
      "overlap": "BİNDİRME",
      "underlap": "İÇ KORİDOR",
      "invert": "MERKEZE GİR",
      "run-behind": "SAVUNMA ARKASI",
      "attack-box": "CEZA SAHASI",
      "press": "PRES",
      "cover": "KADEME",
      "mark": "MARKAJ",
      "recover": "GERİ DÖNÜŞ",
      "carry": "TOP TAŞI",
      "receive": "PAS İSTASYONU",
      "goalkeeper-position": "KALECİ POZİSYONU",
      "sweep": "SÜPÜRÜCÜ ÇIKIŞ",
      "pass": "PAS",
      "cross": "ORTA",
      "waiting-terminal": "ŞUT HAZIRLIĞI",
      "shoot": "ŞUT", "set-save": "KALECİ SET", "full-stretch": "TAM UZANIŞ", "high-dive": "YÜKSEK UZANIŞ", "foot-save": "AYAKLA KURTARIŞ"
    };
    return labels[safeIntent(intent)] || String(intent || "POZİSYON").replace(/-/g, " ").toLocaleUpperCase("tr-TR");
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("me4LiveBridgeStyles")) return;
    const style = document.createElement("style");
    style.id = "me4LiveBridgeStyles";
    style.textContent = `
      .manager-2d-pitch.me4-visual-active .match-player{transition:left .16s linear,top .16s linear,transform .16s ease,box-shadow .16s ease;will-change:left,top;}
      .manager-2d-pitch.me4-visual-active .match-player.v4-has-ball{transform:translate(-50%,-50%) scale(1.14);box-shadow:0 0 0 4px rgba(246,202,91,.24),0 7px 17px rgba(0,0,0,.52);}
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="press"]{box-shadow:0 0 0 3px rgba(255,94,94,.18),0 6px 15px rgba(0,0,0,.48);}
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="overlap"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="underlap"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="run-behind"]{box-shadow:0 0 0 3px rgba(93,213,255,.18),0 6px 15px rgba(0,0,0,.48);}
      .match-player .me4-intent-label{display:none;position:absolute;z-index:12;left:50%;bottom:31px;transform:translateX(-50%);min-width:max-content;padding:3px 5px;border:1px solid rgba(255,255,255,.16);border-radius:5px;background:rgba(2,11,18,.88);color:#d9edf5;font-size:5px;font-style:normal;font-weight:900;letter-spacing:.04em;pointer-events:none;}
      .match-player.v4-has-ball .me4-intent-label,.match-player:hover .me4-intent-label{display:block;}
      .me4-live-hud{display:flex!important;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:5px;margin-left:auto;text-align:right;}
      .me4-live-hud span,.me4-live-hud button{display:inline-flex!important;align-items:center;gap:4px;margin:0!important;padding:5px 7px;border:1px solid rgba(92,195,235,.18);border-radius:8px;background:rgba(6,25,38,.74);color:#83ccec;font-size:6px!important;font-weight:950;letter-spacing:.07em;line-height:1;}
      .me4-live-hud span b{display:inline!important;margin:0;color:#f0c968;font-size:7px!important;}
      .me4-live-hud button{cursor:pointer;color:#dfeaf0;}
      .me4-live-hud button.active{border-color:rgba(240,201,104,.42);background:rgba(177,126,35,.22);color:#f5d98e;}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-in-flight{transition:left .08s linear,top .08s linear,transform .08s linear;transform:translate(-50%,-50%) scale(1.12);filter:drop-shadow(0 0 7px rgba(240,201,104,.72));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-loose{animation:me4LoosePulse .45s ease-in-out infinite alternate;filter:drop-shadow(0 0 8px rgba(255,107,107,.75));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-external{filter:drop-shadow(0 0 7px rgba(113,189,255,.65));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-shot{transition:left .045s linear,top .045s linear,transform .045s linear;transform:translate(-50%,-50%) scale(1.24);filter:drop-shadow(0 0 9px rgba(255,244,181,.92));}
      .manager-2d-pitch.me4-goal-flash{animation:me4GoalFlash .7s ease-out;}
      .me4-pass-line{position:absolute;z-index:7;height:1px;transform-origin:0 50%;border-top:1px dashed rgba(240,201,104,.48);pointer-events:none;opacity:.8;}
      .me4-pass-line.me4-shot-line{border-top:2px solid rgba(255,238,158,.78);box-shadow:0 0 8px rgba(255,221,108,.36);opacity:1;}
      .me4-ball-state{color:#f4d782!important}.me4-authority-v4{color:#70e6ac!important}.me4-authority-legacy{color:#82bfff!important}
      @keyframes me4LoosePulse{from{transform:translate(-50%,-50%) scale(.94)}to{transform:translate(-50%,-50%) scale(1.2)}}
      @keyframes me4GoalFlash{0%{box-shadow:inset 0 0 0 rgba(255,226,112,0)}35%{box-shadow:inset 0 0 70px rgba(255,226,112,.48)}100%{box-shadow:inset 0 0 0 rgba(255,226,112,0)}}
      @media(max-width:760px){.me4-live-hud{width:100%;justify-content:flex-start;margin-top:7px}.me4-live-hud span:nth-child(n+3){display:none!important}.match-player .me4-intent-label{bottom:25px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHud(pitch, simulation, phase4Snapshot) {
    const view = pitch?.closest?.(".manager-2d-view");
    const header = view?.querySelector?.(":scope > header") || view?.querySelector?.("header");
    if (!header) return;
    let hud = header.querySelector(".me4-live-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "me4-live-hud";
      hud.innerHTML = `<span>ME4 <b>SHOT · GOALKEEPER AI</b></span><span data-me4-phase>—</span><span data-me4-ball class="me4-ball-state">BALL —</span><span data-me4-authority>AUTH —</span><span data-me4-pass>PASS —</span><span data-me4-rest>REST DEF —</span><button type="button" data-me4-toggle class="active">V4 PHASE 4</button>`;
      header.appendChild(hud);
      hud.querySelector("[data-me4-toggle]")?.addEventListener("click", toggle);
    }
    const phase = hud.querySelector("[data-me4-phase]");
    if (phase) phase.textContent = String(simulation?.phase || "AKAN OYUN").replace(/_/g, " ");
    const ballState = simulation?.ballControl?.state || simulation?.ball?.state || "CONTROLLED";
    const ball = hud.querySelector("[data-me4-ball]");
    if (ball) ball.textContent = `BALL ${String(ballState).replace(/_/g, " ")}`;
    const authorityValue = phase4Snapshot?.authority || simulation?.ballAuthority || "V4_FULL_AUTHORITY";
    const authority = hud.querySelector("[data-me4-authority]");
    if (authority) {
      authority.textContent = "V4 TAM MAÇ YETKİSİ";
      authority.className = "me4-authority-v4";
    }
    const pass = hud.querySelector("[data-me4-pass]");
    const action = simulation?.ballControl?.activeAction;
    const shot = simulation?.ballControl?.activeShot;
    if (pass) pass.textContent = shot ? `${shot.shotType} ${Math.round((shot.progress || 0) * 100)}% · xG ${Number(shot.xg || 0).toFixed(2)} · ${shot.goalkeeperAction || "GK"}` : action ? `${action.type} ${Math.round(action.progress * 100)}% · Q${Math.round(action.passQuality || 0)}` : simulation?.ballControl?.loose ? "İKİNCİ TOP MÜCADELESİ" : "TOP KONTROLDE";
    const rest = hud.querySelector("[data-me4-rest]");
    if (rest) rest.textContent = `REST DEF ${Math.round(simulation?.restDefence?.home || 0)} · ${Math.round(simulation?.restDefence?.away || 0)}`;
    const toggleButton = hud.querySelector("[data-me4-toggle]");
    if (toggleButton) {
      toggleButton.classList.toggle("active", runtime.enabled);
      toggleButton.textContent = runtime.enabled ? "V4 PHASE 4" : "LEGACY GÖRÜNTÜ";
    }
  }

  function ensureIntentNode(node) {
    let label = node.querySelector?.(".me4-intent-label");
    if (!label && typeof document !== "undefined") {
      label = document.createElement("em");
      label.className = "me4-intent-label";
      node.appendChild(label);
    }
    return label;
  }

  function applyTeam(nodes, teamSnapshot) {
    const players = teamSnapshot?.players || [];
    nodes.forEach(node => {
      const player = players[Number(node.dataset.index)];
      if (!player?.point) return;
      const point = toPercentPoint(player.point);
      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      const intent = safeIntent(player.intent);
      node.dataset.v4Intent = intent;
      node.classList.toggle("v4-has-ball", Boolean(player.hasBall));
      node.setAttribute("aria-label", `${player.name} · ${player.role} · ${intentLabel(intent)}`);
      node.title = `${player.name} · ${player.position} · ${player.role} · ${intentLabel(intent)} · Enerji ${Math.round(player.energy)}`;
      const label = ensureIntentNode(node);
      if (label) label.textContent = intentLabel(intent);
    });
  }


  function clearPassLine(pitch) {
    pitch?.querySelector?.(".me4-pass-line")?.remove?.();
  }


  function drawLine(pitch, from, to, shot = false) {
    let line = pitch.querySelector(".me4-pass-line");
    if (!line) {
      line = document.createElement("i");
      line.className = "me4-pass-line";
      pitch.appendChild(line);
    }
    line.classList.toggle("me4-shot-line", shot);
    const dx = to.x - from.x, dy = to.y - from.y;
    line.style.left = `${from.x}%`;
    line.style.top = `${from.y}%`;
    line.style.width = `${Math.hypot(dx, dy)}%`;
    line.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  }

  function applyBall(pitch, simulation) {
    const node = pitch?.querySelector?.("[data-live-ball]");
    if (!node || !simulation?.ball?.position) return;
    const point = toPercentPoint(simulation.ball.position);
    node.style.left = `${point.x}%`;
    node.style.top = `${point.y}%`;
    const state = String(simulation.ballControl?.state || simulation.ball.state || "CONTROLLED");
    const shot = simulation.ballControl?.activeShot;
    node.classList.toggle("me4-ball-in-flight", state === "IN_FLIGHT");
    node.classList.toggle("me4-ball-shot", state === "SHOT_FLIGHT");
    node.classList.toggle("me4-ball-loose", state === "LOOSE");
    node.classList.remove("me4-ball-external");
    node.dataset.me4BallState = state.toLowerCase();
    node.title = `${state.replace(/_/g, " ")} · ${simulation.ball.reason || "V4 BALL"} · h${Number(simulation.ball.height || 0).toFixed(1)}`;
    if (state === "GOAL") {
      pitch.classList.remove("me4-goal-flash");
      void pitch.offsetWidth;
      pitch.classList.add("me4-goal-flash");
    }
    if (shot) {
      const players = [simulation.teams?.home, simulation.teams?.away].flatMap(team => team?.players || []);
      const shooter = players.find(player => player.id === shot.shooterId);
      if (shooter?.point) {
        const from = toPercentPoint(shooter.point);
        const to = { x: shot.side === "home" ? 99.2 : 0.8, y: clamp(Number(shot.target?.y || 34) / PITCH_WIDTH * 100, 1, 99) };
        drawLine(pitch, from, to, true);
      }
      return;
    }
    const action = simulation.ballControl?.activeAction;
    if (!action) {
      clearPassLine(pitch);
      return;
    }
    const players = [simulation.teams?.home, simulation.teams?.away].flatMap(team => team?.players || []);
    const owner = players.find(player => player.id === action.ownerId);
    const receiver = players.find(player => player.id === action.receiverId);
    if (owner?.point && receiver?.point) drawLine(pitch, toPercentPoint(owner.point), toPercentPoint(receiver.point), false);
  }

  function restoreLegacy(context) {
    if (typeof document === "undefined") return;
    const mount = document.getElementById("managerMatchMount");
    const state = context?.engine?.visual2D;
    if (!mount || !state) return;
    mount.querySelectorAll("[data-motion-player]").forEach(node => {
      const player = state[node.dataset.side]?.[Number(node.dataset.index)];
      if (!player) return;
      node.style.left = `${player.x}%`;
      node.style.top = `${player.y}%`;
      node.classList.remove("v4-has-ball");
      delete node.dataset.v4Intent;
    });
    const ball = mount.querySelector("[data-live-ball]");
    if (ball && state.ball) {
      ball.style.left = `${state.ball.x}%`;
      ball.style.top = `${state.ball.y}%`;
      ball.classList.remove("me4-ball-in-flight", "me4-ball-loose", "me4-ball-external");
    }
    const pitch = mount.querySelector(".manager-2d-pitch");
    clearPassLine(pitch);
    pitch?.classList.remove("me4-visual-active");
  }

  function applyFrame(force = false) {
    if (typeof document === "undefined") return false;
    const now = globalThis.performance?.now?.() || Date.now();
    if (!force && now - runtime.lastAppliedAt < 35) return false;
    runtime.lastAppliedAt = now;
    const context = activeContext();
    if (!context) return false;
    const phase4Snapshot = adapter()?.getSnapshot?.();
    const simulation = phase4Snapshot?.simulation;
    const mount = document.getElementById("managerMatchMount");
    const pitch = mount?.querySelector?.(".manager-2d-pitch");
    if (!pitch) return false;
    ensureStyles();
    ensureHud(pitch, simulation, phase4Snapshot);
    if (!runtime.enabled || !simulation?.teams) {
      restoreLegacy(context);
      return false;
    }
    pitch.classList.add("me4-visual-active");
    applyTeam(Array.from(pitch.querySelectorAll('[data-motion-player][data-side="home"]')), simulation.teams.home);
    applyTeam(Array.from(pitch.querySelectorAll('[data-motion-player][data-side="away"]')), simulation.teams.away);
    applyBall(pitch, simulation);
    runtime.lastFixtureId = context.fixture.id;
    runtime.appliedFrames += 1;
    return true;
  }

  function loop() {
    applyFrame(false);
    runtime.raf = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(loop)
      : globalThis.setTimeout(loop, 50);
  }

  function startObserver() {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined" || runtime.observer) return;
    runtime.observer = new MutationObserver(() => applyFrame(true));
    runtime.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function startLoop() {
    if (runtime.raf) return;
    loop();
  }

  function stopLoop() {
    if (!runtime.raf) return;
    if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(runtime.raf);
    else globalThis.clearTimeout(runtime.raf);
    runtime.raf = null;
  }

  function enable() {
    runtime.enabled = true;
    savePreference(true);
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    startLoop();
    applyFrame(true);
    return getStatus();
  }

  function disable() {
    runtime.enabled = false;
    savePreference(false);
    restoreLegacy(activeContext());
    applyFrame(true);
    return getStatus();
  }

  function toggle() {
    return runtime.enabled ? disable() : enable();
  }

  function getStatus() {
    const phase4 = adapter()?.getSnapshot?.() || null;
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.lastFixtureId,
      appliedFrames: runtime.appliedFrames,
      phase4,
      contract: {
        playerPositions: "V4",
        passingBall: "V4_OFFICIAL",
        firstTouch: "V4_OFFICIAL",
        interceptions: "V4_OFFICIAL",
        secondBalls: "V4_OFFICIAL",
        terminalActions: "V4_OFFICIAL",
        shots: "V4_OFFICIAL",
        goalkeeper: "V4_OFFICIAL",
        score: "V4_OFFICIAL",
        passStatistics: "V4_OFFICIAL",
        persistence: "LEGACY_CAREER_PLUS_V4_OFFICIAL_MATCH_STATE"
      }
    };
  }

  function boot() {
    runtime.enabled = readPreference();
    ensureStyles();
    startObserver();
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    startLoop();
    applyFrame(true);
    console.info(`[Match Engine V4] Phase 4 full visual authority ready · ${VERSION}`);
  }

  const API = Object.freeze({
    VERSION,
    enable,
    disable,
    toggle,
    applyFrame,
    getStatus,
    __diagnostics: { activeContext, toPercentPoint, safeIntent, intentLabel, applyTeam, applyBall, restoreLegacy }
  });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE4_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_LIVE = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();
