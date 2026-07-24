/* Match Engine V4 Worker Bridge — W2 Final Stable */
(() => {
  "use strict";

  const VERSION = "4.0.0-worker-bridge-w2.1-final.1";
  const WORKER_URL = "./me4-match-worker.js?v=4.0.0-worker-w2-final.1";
  const SUPPORTED_FORMATIONS = new Set(["4-3-3", "4-2-3-1", "4-4-2", "3-5-2"]);

  const state = {
    enabled: true,
    status: "IDLE",
    worker: null,
    workerReady: false,
    fixtureId: null,
    signature: null,
    snapshot: null,
    lastMessageAt: 0,
    lastSyncAt: 0,
    lastError: null,
    framesApplied: 0,
    syncCount: 0,
    fallbackReason: null,
    ballTrail: [],
    lastTrailAt: 0,
    lastBallKey: null,
    authority: {
      players: "ME4_WEB_WORKER",
      ball: "ME4_WEB_WORKER",
      passing: "ME4_WEB_WORKER",
      shotsVisual: "ME4_WEB_WORKER",
      officialScore: "LEGACY_STABLE"
    }
  };

  let pollTimer = null;
  let animationFrame = null;
  let watchdogTimer = null;

  const room = () => globalThis.FIFA_MANAGER_ROOM;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function actor(career, id) {
    return career?.actors?.find?.(row => row.id === id) || null;
  }

  function activeContext() {
    const career = room()?.getActiveCareer?.() || room()?.getCareer?.();
    if (!career?.activeMatchFixtureId) return null;
    const fixture = career.fixtures?.find?.(row => row.id === career.activeMatchFixtureId);
    if (!fixture?.matchEngine || fixture.matchEngine.status !== "live") return null;
    if (fixture.matchEngine.quickSimulation || fixture.matchEngine.simulationMode === "instant") return null;
    return { career, fixture, engine: fixture.matchEngine };
  }

  function numericTactic(value, fallback) {
    if (Number.isFinite(Number(value))) return clamp(value, 0, 100);
    const map = {
      veryLow: 25, low: 35, cautious: 38, balanced: 50,
      medium: 50, high: 68, veryHigh: 82,
      slow: 35, normal: 50, fast: 68,
      narrow: 38, wide: 68,
      short: 35, mixed: 50, direct: 70
    };
    return map[String(value || "")] ?? fallback;
  }

  function formation(value) {
    const raw = String(value || "4-3-3");
    return SUPPORTED_FORMATIONS.has(raw) ? raw : "4-3-3";
  }

  function phaseId(plan, key, fallback) {
    return String(plan?.phaseBehaviors?.[key] || plan?.[key] || fallback);
  }

  function fullbackDuty(plan) {
    const roles = Object.values(plan?.positionRoles || {}).map(String);
    if (roles.some(role => /attacking-wingback|overlap|bindir/i.test(role))) return "attack";
    if (roles.some(role => /stay-back|defensive-wingback|geride/i.test(role))) return "defend";
    return "balanced";
  }

  function tacticsFromPlan(plan = {}) {
    return {
      mentality: String(plan.mentality || "balanced"),
      inPossession: phaseId(plan, "inPossession", "positional"),
      outPossession: phaseId(plan, "outPossession", "mid-block"),
      winTransition: phaseId(plan, "winTransition", "secure"),
      lossTransition: phaseId(plan, "lossTransition", "regroup"),
      tempo: numericTactic(plan.tempo, 50),
      width: numericTactic(plan.width, 52),
      passingDirectness: numericTactic(plan.passingDirectness ?? plan.directness, 48),
      defensiveLine: numericTactic(plan.defensiveLine, 52),
      pressing: numericTactic(plan.pressing, 50),
      risk: numericTactic(plan.risk, 50),
      fullbackDuty: fullbackDuty(plan),
      offsideTrap: plan.offsideTrap !== false,
      positionRoles: plan.positionRoles || {}
    };
  }

  function externalState(engine) {
    const visual = engine.visual2D || {};
    const possession = ["home", "away"].includes(visual.possession)
      ? visual.possession
      : ["home", "away"].includes(engine.phaseState?.possession)
        ? engine.phaseState.possession
        : "home";

    return {
      ball: {
        x: clamp(number(visual.ball?.x, 50), 1, 99),
        y: clamp(number(visual.ball?.y, 50) / 100 * 68, 2, 66),
        height: 0
      },
      possessionSide: possession,
      score: {
        home: number(engine.scoreHome, 0),
        away: number(engine.scoreAway, 0)
      }
    };
  }

  function configFor(context) {
    const { career, fixture, engine } = context;
    const homeActor = actor(career, fixture.homeId) || {};
    const awayActor = actor(career, fixture.awayId) || {};
    const humanSide = engine.humanSide || (fixture.homeId === career.humanActorId ? "home" : "away");
    const homePlan = humanSide === "home" ? engine.userPlan || {} : engine.aiPlan || {};
    const awayPlan = humanSide === "away" ? engine.userPlan || {} : engine.aiPlan || {};

    return {
      matchId: fixture.id,
      mode: "WORKER_FULL_VISUAL_AUTHORITY",
      seed: `ME4W2-${fixture.id}-${engine.seed || engine.rngState || 1}`,
      balanceProfile: "masterpiece",
      refereeProfile: "balanced",
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || homeActor.shortName || "Home",
        rating: clamp(number(homeActor.overall ?? homeActor.rating ?? homeActor.power / 16, 80), 60, 95),
        formation: formation(homePlan.formation),
        managerControl: "HUMAN",
        tactics: tacticsFromPlan(homePlan),
        roles: homePlan.positionRoles || {}
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || awayActor.shortName || "Away",
        rating: clamp(number(awayActor.overall ?? awayActor.rating ?? awayActor.power / 16, 80), 60, 95),
        formation: formation(awayPlan.formation),
        managerControl: "HUMAN",
        tactics: tacticsFromPlan(awayPlan),
        roles: awayPlan.positionRoles || {}
      }
    };
  }

  function signatureFor(context) {
    const config = configFor(context);
    return JSON.stringify({
      fixtureId: context.fixture.id,
      home: { formation: config.home.formation, tactics: config.home.tactics, roles: config.home.roles },
      away: { formation: config.away.formation, tactics: config.away.tactics, roles: config.away.roles }
    });
  }

  function ensureWorker() {
    if (state.worker) return state.worker;
    if (!("Worker" in globalThis)) {
      fallback("Browser Web Worker desteklemiyor.");
      return null;
    }

    state.status = "LOADING";
    updateBadge();

    const worker = new Worker(WORKER_URL);
    state.worker = worker;
    worker.onmessage = onWorkerMessage;
    worker.onerror = event => {
      state.lastError = event.message || "Worker error";
      fallback("Worker başlatılamadı; stabil motor devam ediyor.");
      console.error("[ME4W2]", event);
    };
    return worker;
  }

  function rememberBall(snapshot) {
    const ball = snapshot?.ball;
    if (!ball) return;
    const now = Date.now();
    const key = `${ball.x.toFixed(2)}|${ball.y.toFixed(2)}|${ball.height.toFixed(2)}`;
    if (key === state.lastBallKey || now - state.lastTrailAt < 45) return;
    state.lastBallKey = key;
    state.lastTrailAt = now;
    state.ballTrail.push({ x: ball.x, y: ball.y, height: ball.height, at: now });
    state.ballTrail = state.ballTrail.slice(-9);
  }

  function onWorkerMessage(event) {
    const message = event.data || {};
    state.lastMessageAt = Date.now();

    if (message.type === "READY") {
      state.workerReady = true;
      state.status = "READY";
      state.lastError = null;
      updateBadge();
      synchronize(true);
      return;
    }

    if (["INITIALIZED", "SNAPSHOT"].includes(message.type)) {
      state.snapshot = message.snapshot || null;
      rememberBall(state.snapshot);
      state.status = "ACTIVE";
      state.lastError = null;
      state.fallbackReason = null;
      updateBadge();
      ensureAnimationLoop();
      return;
    }

    if (message.type === "ERROR") {
      state.lastError = message.message || "Worker engine error";
      fallback("ME4 Worker hata verdi; stabil motor otomatik devraldı.");
      console.error("[ME4W2 Worker]", message);
    }
  }

  function fallback(reason) {
    state.status = "FALLBACK";
    state.fallbackReason = reason;
    state.snapshot = null;
    state.ballTrail = [];
    document.documentElement.classList.remove("me4w2-active");
    updateBadge();
    try { state.worker?.terminate?.(); } catch (_) {}
    state.worker = null;
    state.workerReady = false;
  }

  function terminateWorker(clearSnapshot = true) {
    try { state.worker?.terminate?.(); } catch (_) {}
    state.worker = null;
    state.workerReady = false;
    state.fixtureId = null;
    state.signature = null;
    if (clearSnapshot) {
      state.snapshot = null;
      state.ballTrail = [];
    }
    document.documentElement.classList.remove("me4w2-active");
  }

  function synchronize(force = false) {
    if (!state.enabled) return;

    const context = activeContext();
    if (!context) {
      if (state.worker) {
        state.worker.postMessage({ type: "STOP" });
        terminateWorker();
      }
      state.status = "IDLE";
      updateBadge();
      return;
    }

    const worker = ensureWorker();
    if (!worker || !state.workerReady) return;

    const signature = signatureFor(context);
    const payload = {
      matchId: context.fixture.id,
      signature,
      targetSecond: number(context.engine.clockSeconds, 0),
      external: externalState(context.engine),
      forceSnapshot: force
    };

    if (state.fixtureId !== context.fixture.id || state.signature !== signature) {
      state.fixtureId = context.fixture.id;
      state.signature = signature;
      state.ballTrail = [];
      worker.postMessage({ type: "INIT", config: configFor(context), ...payload });
    } else {
      worker.postMessage({ type: "SYNC", ...payload });
    }

    state.lastSyncAt = Date.now();
    state.syncCount += 1;
  }

  function intentShort(intent) {
    const map = {
      OVERLAP: "BİNDİR", UNDERLAP: "İÇ KOŞU", RUN_BEHIND: "ARKAYA",
      BLIND_SIDE_RUN: "KÖR KOŞU", PRESS: "PRES", JOCKEY: "KARŞILA",
      COVER: "KADEME", HOLD_SHAPE: "DÜZEN", SUPPORT: "DESTEK",
      SUPPORT_RUN: "DESTEK", BOX_RUN: "CEZA SAHASI",
      DROP_BETWEEN_LINES: "GERİ GEL", RECOVERY_RUN: "GERİ KOŞ",
      CARRY: "TOP SÜR", RECEIVE: "TOP AL", SHOOT: "ŞUT"
    };
    return map[String(intent || "").toUpperCase()] ||
      String(intent || "").replaceAll("_", " ").slice(0, 12);
  }

  function actionLabel(snapshot) {
    const action = snapshot?.action;
    if (!action) return "AKAN OYUN";
    const type = String(action.type || "").toUpperCase();
    if (type.includes("SHOT")) return action.outcome ? `ŞUT · ${action.outcome}` : "ŞUT";
    if (type.includes("CROSS")) return "ORTA";
    if (type.includes("PASS")) return action.band ? `PAS · ${action.band}` : "PAS";
    if (type.includes("SET")) return "DURAN TOP";
    return type.replaceAll("_", " ") || "AKAN OYUN";
  }

  function ensureHud(mount) {
    let hud = mount.querySelector("[data-me4w2-hud]");
    if (hud) return hud;
    const header = mount.querySelector(".manager-2d-view>header");
    if (!header) return null;
    hud = document.createElement("div");
    hud.dataset.me4w2Hud = "";
    hud.className = "me4w2-hud";
    header.appendChild(hud);
    return hud;
  }

  function ensureTrailNodes(pitch) {
    let layer = pitch.querySelector("[data-me4w2-trail]");
    if (!layer) {
      layer = document.createElement("div");
      layer.dataset.me4w2Trail = "";
      layer.className = "me4w2-trail-layer";
      pitch.appendChild(layer);
    }
    return layer;
  }

  function applySnapshot() {
    const snapshot = state.snapshot;
    const mount = document.getElementById("managerMatchMount");
    if (!snapshot || !mount || state.status !== "ACTIVE") return;

    const pitch = mount.querySelector(".manager-2d-pitch");
    if (!pitch) return;

    document.documentElement.classList.add("me4w2-active");

    ["home", "away"].forEach(side => {
      const players = snapshot[side]?.players || [];
      mount.querySelectorAll(`[data-motion-player][data-side="${side}"]`).forEach(node => {
        const player = players[Number(node.dataset.index)];
        if (!player) return;
        node.style.left = `${clamp(player.x, 1, 99)}%`;
        node.style.top = `${clamp(player.y / 68 * 100, 2, 98)}%`;
        node.dataset.me4Intent = intentShort(player.intent);
        node.dataset.me4Status = player.status;
        node.classList.toggle("me4w2-sprint", /SPRINT|RUN_BEHIND|OVERLAP|UNDERLAP/i.test(player.intent));
        node.classList.toggle("me4w2-press", /PRESS|JOCKEY/i.test(player.intent));
        node.classList.toggle("me4w2-carrier", Boolean(player.hasBall));
        node.classList.toggle("me4w2-fatigued", number(player.energy, 100) < 55);
        node.title = `${player.position} · ${player.role} · ${intentShort(player.intent)} · Enerji ${Math.round(player.energy)}`;
      });
    });

    const ball = snapshot.ball;
    const ballNode = mount.querySelector("[data-live-ball]");
    if (ballNode && ball) {
      ballNode.style.left = `${clamp(ball.x, 1, 99)}%`;
      ballNode.style.top = `${clamp(ball.y / 68 * 100, 2, 98)}%`;
      const scale = clamp(1 + number(ball.height, 0) * 0.035, 1, 1.6);
      ballNode.style.transform = `translate(-50%,-50%) scale(${scale})`;
      ballNode.className = `match-ball ${snapshot.possessionSide || ball.teamSide || "neutral"} me4w2-ball`;
      ballNode.dataset.me4BallState = ball.state;
      ballNode.title = `ME4 Worker Ball · ${ball.state} · Yükseklik ${number(ball.height, 0).toFixed(1)}`;
    }

    const trailLayer = ensureTrailNodes(pitch);
    trailLayer.innerHTML = state.ballTrail.map((point, index, rows) => {
      const opacity = ((index + 1) / Math.max(1, rows.length)) * 0.46;
      const size = 3 + ((index + 1) / Math.max(1, rows.length)) * 3;
      return `<i style="left:${clamp(point.x,1,99)}%;top:${clamp(point.y/68*100,2,98)}%;opacity:${opacity};width:${size}px;height:${size}px"></i>`;
    }).join("");

    const hud = ensureHud(mount);
    if (hud) {
      const latency = state.lastMessageAt ? Date.now() - state.lastMessageAt : 0;
      hud.innerHTML = `
        <b>ME4W2 · OYUNCU + TOP + PAS AKTİF</b>
        <span>${actionLabel(snapshot)} · ${String(snapshot.phase || "AKAN OYUN").replaceAll("_", " ")}</span>
        <small>WORKER ${latency} ms · TOP ${snapshot.ball?.state || "CONTROLLED"} · ENERJİ ${Math.round(snapshot.home.averageEnergy)} / ${Math.round(snapshot.away.averageEnergy)}</small>
      `;
    }

    state.framesApplied += 1;
  }

  function ensureAnimationLoop() {
    if (animationFrame) return;
    const draw = () => {
      animationFrame = requestAnimationFrame(draw);
      applySnapshot();
    };
    animationFrame = requestAnimationFrame(draw);
  }

  function ensureStyles() {
    if (document.getElementById("me4w2Styles")) return;
    const style = document.createElement("style");
    style.id = "me4w2Styles";
    style.textContent = `
      .me4w2-hud{margin-left:auto;display:grid;gap:2px;min-width:220px;padding:7px 9px;border:1px solid rgba(97,218,251,.26);border-radius:10px;background:rgba(5,31,43,.9);text-align:right}
      .me4w2-hud b{color:#74dcff!important;font-size:8px!important;letter-spacing:.08em}
      .me4w2-hud span{color:#e9f8fc!important;font-size:8px!important}
      .me4w2-hud small{color:#7d9eab!important;font-size:6px!important}
      .me4w2-active .match-player{transition:left .16s linear,top .16s linear,box-shadow .15s ease;will-change:left,top}
      .me4w2-active .match-player::after{content:attr(data-me4-intent);position:absolute;left:50%;top:-13px;transform:translateX(-50%);padding:1px 3px;border-radius:4px;background:rgba(3,18,25,.84);color:#aeeeff;font-size:5px;font-weight:900;white-space:nowrap;opacity:.82;pointer-events:none}
      .me4w2-active .match-player.me4w2-sprint{box-shadow:0 0 0 4px rgba(87,211,255,.14),0 5px 14px rgba(0,0,0,.5)}
      .me4w2-active .match-player.me4w2-press{box-shadow:0 0 0 4px rgba(255,203,77,.2),0 5px 14px rgba(0,0,0,.5)}
      .me4w2-active .match-player.me4w2-carrier{box-shadow:0 0 0 5px rgba(117,255,174,.26),0 5px 14px rgba(0,0,0,.55)}
      .me4w2-active .match-player.me4w2-fatigued{filter:saturate(.55);opacity:.78}
      .me4w2-active .ball-trail{display:none!important}
      .me4w2-ball{z-index:16!important;transition:left .09s linear,top .09s linear,transform .08s linear!important;will-change:left,top,transform;filter:drop-shadow(0 3px 5px rgba(0,0,0,.7))}
      .me4w2-trail-layer{position:absolute;inset:0;pointer-events:none;z-index:12}
      .me4w2-trail-layer i{position:absolute;display:block;transform:translate(-50%,-50%);border-radius:999px;background:#fff;box-shadow:0 0 7px rgba(116,220,255,.8)}
      #me4w2StatusBadge{position:fixed;right:12px;bottom:12px;z-index:2147483647;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:7px 10px;color:#fff;font:900 10px/1.2 Inter,system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    let badge = document.getElementById("me4w2StatusBadge");
    if (badge) return badge;
    badge = document.createElement("button");
    badge.id = "me4w2StatusBadge";
    badge.type = "button";
    badge.onclick = () => alert([
      `Durum: ${state.status}`,
      `Worker: ${state.workerReady ? "HAZIR" : "BEKLENİYOR"}`,
      `Maç: ${state.fixtureId || "yok"}`,
      `Frame: ${state.framesApplied}`,
      `Sync: ${state.syncCount}`,
      `Oyuncular: ME4 Worker`,
      `Top/Pas/Şut Görseli: ME4 Worker`,
      `Resmî Skor: Stabil motor`,
      state.lastError ? `Hata: ${state.lastError}` : "",
      state.fallbackReason ? `Fallback: ${state.fallbackReason}` : ""
    ].filter(Boolean).join("\n"));
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge() {
    if (!document.body) return;
    const badge = ensureBadge();
    const settings = {
      IDLE: ["ME4W2 · MAÇ BEKLENİYOR", "#143342"],
      LOADING: ["ME4W2 · WORKER YÜKLENİYOR", "#765716"],
      READY: ["ME4W2 · WORKER HAZIR", "#23506a"],
      ACTIVE: ["ME4W2 · TAM GÖRSEL MOTOR AKTİF", "#17633c"],
      FALLBACK: ["ME4W2 · STABİL FALLBACK", "#7c2e2e"]
    }[state.status] || [`ME4W2 · ${state.status}`, "#143342"];
    badge.textContent = settings[0];
    badge.style.background = settings[1];
  }

  function watchdog() {
    if (state.status !== "ACTIVE" || !activeContext()) return;
    if (state.lastMessageAt && Date.now() - state.lastMessageAt > 6000) {
      fallback("Worker 6 saniye yanıt vermedi; stabil motor otomatik devraldı.");
    }
  }

  function enable() {
    state.enabled = true;
    synchronize(true);
    return getStatus();
  }

  function disable() {
    state.enabled = false;
    terminateWorker();
    state.status = "IDLE";
    updateBadge();
    return getStatus();
  }

  function getStatus() {
    return {
      version: VERSION,
      enabled: state.enabled,
      status: state.status,
      workerReady: state.workerReady,
      fixtureId: state.fixtureId,
      lastError: state.lastError,
      framesApplied: state.framesApplied,
      syncCount: state.syncCount,
      fallbackReason: state.fallbackReason,
      authority: { ...state.authority },
      snapshot: state.snapshot ? {
        phase: state.snapshot.phase,
        possessionSide: state.snapshot.possessionSide,
        ballState: state.snapshot.ball?.state,
        action: actionLabel(state.snapshot)
      } : null
    };
  }

  function boot() {
    ensureStyles();
    ensureBadge();
    updateBadge();
    pollTimer = setInterval(() => synchronize(false), 180);
    watchdogTimer = setInterval(watchdog, 2000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") synchronize(true);
    });
  }

  globalThis.ME4WorkerBridge = Object.freeze({
    VERSION,
    enable,
    disable,
    synchronize,
    getStatus
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
