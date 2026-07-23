/* Match Engine V4 Worker Bridge — Phase W1 Visual Takeover */
(() => {
  "use strict";

  const VERSION = "4.0.0-worker-bridge-w1.1";
  const WORKER_URL = "./me4-match-worker.js?v=4.0.0-worker-w1.1";
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
    fallbackReason: null
  };

  let pollTimer = null;
  let animationFrame = null;

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
    return String(
      plan?.phaseBehaviors?.[key] ||
      plan?.[key] ||
      fallback
    );
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
    const homeFormation = formation(homePlan.formation);
    const awayFormation = formation(awayPlan.formation);
    return {
      matchId: fixture.id,
      mode: "WORKER_EXTERNAL_BALL_VISUAL",
      seed: `ME4W-${fixture.id}-${engine.seed || engine.rngState || 1}`,
      balanceProfile: "masterpiece",
      refereeProfile: "balanced",
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || homeActor.shortName || "Home",
        rating: clamp(number(homeActor.overall ?? homeActor.rating ?? homeActor.power / 16, 80), 60, 95),
        formation: homeFormation,
        managerControl: "HUMAN",
        tactics: tacticsFromPlan(homePlan),
        roles: homePlan.positionRoles || {}
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || awayActor.shortName || "Away",
        rating: clamp(number(awayActor.overall ?? awayActor.rating ?? awayActor.power / 16, 80), 60, 95),
        formation: awayFormation,
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
      state.status = "FALLBACK";
      state.fallbackReason = "Browser Web Worker desteklemiyor.";
      updateBadge();
      return null;
    }
    state.status = "LOADING";
    updateBadge();
    const worker = new Worker(WORKER_URL);
    state.worker = worker;
    worker.onmessage = onWorkerMessage;
    worker.onerror = event => {
      state.status = "FALLBACK";
      state.lastError = event.message || "Worker error";
      state.fallbackReason = "Worker başlatılamadı; legacy görsel motor devam ediyor.";
      updateBadge();
      console.error("[ME4W]", event);
      terminateWorker(false);
    };
    return worker;
  }

  function onWorkerMessage(event) {
    const message = event.data || {};
    state.lastMessageAt = Date.now();
    if (message.type === "READY") {
      state.workerReady = true;
      state.status = "READY";
      updateBadge();
      synchronize(true);
      return;
    }
    if (["INITIALIZED", "SNAPSHOT"].includes(message.type)) {
      state.snapshot = message.snapshot || null;
      state.status = "ACTIVE";
      state.lastError = null;
      updateBadge();
      ensureAnimationLoop();
      return;
    }
    if (message.type === "ERROR") {
      state.status = "FALLBACK";
      state.lastError = message.message || "Worker engine error";
      state.fallbackReason = "Worker motoru hata verdi; legacy motor etkilenmeden devam ediyor.";
      updateBadge();
      console.error("[ME4W Worker]", message);
    }
  }

  function terminateWorker(clearSnapshot = true) {
    try { state.worker?.terminate?.(); } catch (_) {}
    state.worker = null;
    state.workerReady = false;
    state.fixtureId = null;
    state.signature = null;
    if (clearSnapshot) state.snapshot = null;
    document.documentElement.classList.remove("me4w-active");
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
    const second = number(context.engine.clockSeconds, 0);
    const payload = {
      matchId: context.fixture.id,
      signature,
      targetSecond: second,
      external: externalState(context.engine),
      settleSeconds: 0.18,
      forceSnapshot: force
    };
    if (state.fixtureId !== context.fixture.id || state.signature !== signature) {
      state.fixtureId = context.fixture.id;
      state.signature = signature;
      worker.postMessage({ type: "INIT", config: configFor(context), ...payload });
    } else {
      worker.postMessage({ type: "SYNC", ...payload });
    }
    state.lastSyncAt = Date.now();
    state.syncCount += 1;
  }

  function intentShort(intent) {
    const map = {
      OVERLAP: "BİNDİR",
      UNDERLAP: "İÇ KOŞU",
      RUN_BEHIND: "ARKAYA",
      BLIND_SIDE_RUN: "KÖR KOŞU",
      PRESS: "PRES",
      JOCKEY: "KARŞILA",
      COVER: "KADEME",
      HOLD_SHAPE: "DÜZEN",
      SUPPORT: "DESTEK",
      SUPPORT_RUN: "DESTEK",
      BOX_RUN: "CEZA SAHASI",
      DROP_BETWEEN_LINES: "GERİ GEL",
      RECOVERY_RUN: "GERİ KOŞ"
    };
    return map[String(intent || "").toUpperCase()] || String(intent || "").replaceAll("_", " ").slice(0, 12);
  }

  function ensureHud(mount) {
    let hud = mount.querySelector("[data-me4w-hud]");
    if (hud) return hud;
    const header = mount.querySelector(".manager-2d-view>header");
    if (!header) return null;
    hud = document.createElement("div");
    hud.dataset.me4wHud = "";
    hud.className = "me4w-hud";
    header.appendChild(hud);
    return hud;
  }

  function applySnapshot() {
    const snapshot = state.snapshot;
    const mount = document.getElementById("managerMatchMount");
    if (!snapshot || !mount || state.status !== "ACTIVE") return;
    const pitch = mount.querySelector(".manager-2d-pitch");
    if (!pitch) return;
    document.documentElement.classList.add("me4w-active");
    ["home", "away"].forEach(side => {
      const players = snapshot[side]?.players || [];
      mount.querySelectorAll(`[data-motion-player][data-side="${side}"]`).forEach(node => {
        const player = players[Number(node.dataset.index)];
        if (!player) return;
        node.style.left = `${clamp(player.x, 1, 99)}%`;
        node.style.top = `${clamp(player.y / 68 * 100, 2, 98)}%`;
        node.dataset.me4Intent = intentShort(player.intent);
        node.dataset.me4Status = player.status;
        node.classList.toggle("me4w-sprint", /SPRINT|RUN_BEHIND|OVERLAP/i.test(player.intent));
        node.classList.toggle("me4w-press", /PRESS|JOCKEY/i.test(player.intent));
        node.classList.toggle("me4w-fatigued", number(player.energy, 100) < 55);
        node.title = `${player.position} · ${player.role} · ${intentShort(player.intent)} · Enerji ${Math.round(player.energy)}`;
      });
    });
    const hud = ensureHud(mount);
    if (hud) {
      const latency = state.lastMessageAt ? Date.now() - state.lastMessageAt : 0;
      hud.innerHTML = `<b>ME4W · WEB WORKER AKTİF</b><span>${String(snapshot.phase || "AKAN OYUN").replaceAll("_", " ")}</span><small>UI GECİKME ${latency} ms · ENERJİ ${Math.round(snapshot.home.averageEnergy)} / ${Math.round(snapshot.away.averageEnergy)}</small>`;
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
    if (document.getElementById("me4wStyles")) return;
    const style = document.createElement("style");
    style.id = "me4wStyles";
    style.textContent = `
      .me4w-hud{margin-left:auto;display:grid;gap:2px;min-width:180px;padding:7px 9px;border:1px solid rgba(97,218,251,.24);border-radius:10px;background:rgba(5,31,43,.88);text-align:right}
      .me4w-hud b{color:#74dcff!important;font-size:8px!important;letter-spacing:.08em}.me4w-hud span{color:#e9f8fc!important;font-size:8px!important}.me4w-hud small{color:#7d9eab!important;font-size:6px!important}
      .me4w-active .match-player{transition:left .22s linear,top .22s linear,box-shadow .18s ease;will-change:left,top}
      .me4w-active .match-player::after{content:attr(data-me4-intent);position:absolute;left:50%;top:-13px;transform:translateX(-50%);padding:1px 3px;border-radius:4px;background:rgba(3,18,25,.82);color:#aeeeff;font-size:5px;font-weight:900;white-space:nowrap;opacity:.82;pointer-events:none}
      .me4w-active .match-player.me4w-sprint{box-shadow:0 0 0 4px rgba(87,211,255,.13),0 5px 14px rgba(0,0,0,.5)}
      .me4w-active .match-player.me4w-press{box-shadow:0 0 0 4px rgba(255,203,77,.18),0 5px 14px rgba(0,0,0,.5)}
      .me4w-active .match-player.me4w-fatigued{filter:saturate(.55);opacity:.78}
      #me4wStatusBadge{position:fixed;right:12px;bottom:12px;z-index:2147483647;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:7px 10px;color:#fff;font:900 10px/1.2 Inter,system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer}
    `;
    document.head.appendChild(style);
  }

  function ensureBadge() {
    let badge = document.getElementById("me4wStatusBadge");
    if (badge) return badge;
    badge = document.createElement("button");
    badge.id = "me4wStatusBadge";
    badge.type = "button";
    badge.onclick = () => alert([
      `Durum: ${state.status}`,
      `Worker: ${state.workerReady ? "HAZIR" : "BEKLENİYOR"}`,
      `Fixture: ${state.fixtureId || "yok"}`,
      `Snapshot: ${state.snapshot ? "VAR" : "YOK"}`,
      `Uygulanan frame: ${state.framesApplied}`,
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
      IDLE: ["ME4W · MAÇ BEKLENİYOR", "#143342"],
      LOADING: ["ME4W · WORKER YÜKLENİYOR", "#765716"],
      READY: ["ME4W · WORKER HAZIR", "#23506a"],
      ACTIVE: ["ME4W · GÖRSEL MOTOR AKTİF", "#17633c"],
      FALLBACK: ["ME4W · LEGACY FALLBACK", "#7c2e2e"]
    }[state.status] || ["ME4W · ${state.status}", "#143342"];
    badge.textContent = settings[0];
    badge.style.background = settings[1];
  }

  function enable() {
    state.enabled = true;
    ensureWorker();
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
      fallbackReason: state.fallbackReason
    };
  }

  function boot() {
    ensureStyles();
    ensureBadge();
    updateBadge();
    pollTimer = setInterval(() => synchronize(false), 250);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") synchronize(true);
    });
  }

  globalThis.ME4WorkerBridge = Object.freeze({ VERSION, enable, disable, synchronize, getStatus });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
