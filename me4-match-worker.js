/* Match Engine V4 Web Worker — W2 Final Stable Visual Authority */
"use strict";

const WORKER_VERSION = "4.0.0-worker-w2-final.1";
const CORE_URL = "./manager-match-engine-v4-phase13-safe.bundle.js?v=4.0.0-phase13-safe.1";

let core = null;
let engine = null;
let currentMatchId = null;
let currentSignature = null;
let lastSnapshotAt = 0;
let status = "BOOTING";

function post(type, payload = {}) {
  self.postMessage({ type, workerVersion: WORKER_VERSION, ...payload });
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function compactPlayer(player) {
  return {
    id: player.id,
    number: player.number,
    position: player.position,
    group: player.group,
    role: player.role,
    x: number(player.point?.x ?? player.positionNow?.x, 50),
    y: number(player.point?.y ?? player.positionNow?.y, 34),
    targetX: number(player.targetPoint?.x ?? player.targetPosition?.x, number(player.point?.x ?? player.positionNow?.x, 50)),
    targetY: number(player.targetPoint?.y ?? player.targetPosition?.y, number(player.point?.y ?? player.positionNow?.y, 34)),
    facing: number(player.facing, 0),
    intent: String(player.intent || player.currentIntent || "HOLD_SHAPE"),
    energy: number(player.shortTermEnergy ?? player.energy ?? player.physical?.shortEnergy, 100),
    fatigue: number(player.accumulatedFatigue ?? player.fatigue ?? player.physical?.accumulatedFatigue, 0),
    status: String(player.physicalStatus || player.physical?.status || "FIT"),
    hasBall: Boolean(player.hasBall)
  };
}

function compactTeam(team) {
  return {
    id: team.id,
    name: team.name,
    formation: team.formation,
    phase: team.phase,
    averageEnergy: number(team.physical?.averageEnergy ?? team.averageEnergy, 100),
    averageFatigue: number(team.physical?.averageFatigue ?? team.averageFatigue, 0),
    players: (team.players || []).map(compactPlayer)
  };
}

function compactAction(snapshot) {
  const control = snapshot.ballControl || {};
  const action = control.activeShot || control.activeSetPiece || control.activeAction || null;
  if (!action) return null;
  return {
    id: action.id || null,
    type: String(action.type || action.shotType || "ACTION"),
    side: action.side || snapshot.possessionSide || null,
    ownerId: action.ownerId || action.shooterId || action.takerId || null,
    receiverId: action.receiverId || action.targetId || null,
    outcome: action.outcome || null,
    progress: number(action.progress, 0),
    duration: number(action.duration, 0),
    xg: number(action.xg, 0),
    goalkeeperAction: action.goalkeeperAction || null,
    band: action.band || null
  };
}

function compactSnapshot(snapshot, source = "SYNC") {
  return {
    source,
    status: snapshot.status,
    simulationTime: number(snapshot.simulationTime, 0),
    minute: number(snapshot.minute, 0),
    phase: snapshot.phase,
    possessionSide: snapshot.possessionSide,
    ballAuthority: snapshot.ballAuthority,
    officialScore: snapshot.officialScore || snapshot.score,
    workerScore: snapshot.score,
    ball: {
      x: number(snapshot.ball?.position?.x, 50),
      y: number(snapshot.ball?.position?.y, 34),
      vx: number(snapshot.ball?.velocity?.x, 0),
      vy: number(snapshot.ball?.velocity?.y, 0),
      height: number(snapshot.ball?.height, 0),
      state: String(snapshot.ball?.state || snapshot.ballControl?.state || "CONTROLLED"),
      ownerId: snapshot.ball?.ownerId || null,
      teamSide: snapshot.ball?.teamSide || snapshot.possessionSide
    },
    action: compactAction(snapshot),
    lastEvent: snapshot.lastEvent || null,
    restDefence: snapshot.restDefence || null,
    home: compactTeam(snapshot.teams.home),
    away: compactTeam(snapshot.teams.away)
  };
}

function loadCore() {
  if (core) return core;
  importScripts(CORE_URL);
  core = self.FIFA_MATCH_ENGINE_V4;
  if (!core?.createEngine || !core?.createDefaultConfig) {
    throw new Error("ME4 core Worker içinde yüklenemedi.");
  }
  status = "READY";
  post("READY", { coreVersion: core.VERSION, status });
  return core;
}

function seedVisualState(payload) {
  const external = payload.external || {};
  engine.debugSetClock?.(Math.max(0, number(payload.targetSecond, 0)));
  engine.setBallAuthority?.(false, {
    ball: external.ball || { x: 50, y: 34, height: 0 },
    possessionSide: external.possessionSide || "home",
    score: external.score || { home: 0, away: 0 },
    source: "ME4_WORKER_W2_VISUAL_SEED",
    nextDecisionIn: 0.35
  });
}

function initialize(payload) {
  loadCore();
  const config = core.createDefaultConfig(payload.config || {});
  engine = core.createEngine(config);
  currentMatchId = String(payload.matchId || config.matchId || "unknown");
  currentSignature = String(payload.signature || "");
  seedVisualState(payload);
  status = "ACTIVE";
  post("INITIALIZED", {
    matchId: currentMatchId,
    signature: currentSignature,
    status,
    snapshot: compactSnapshot(engine.getSnapshot(), "INIT")
  });
}

function advanceTo(targetSecond) {
  if (!engine) return;
  const target = Math.max(0, number(targetSecond, engine.clockSeconds || 0));
  const current = number(engine.clockSeconds, 0);
  const delta = target - current;

  // Refresh/resume: jump clock without expensive historical replay.
  if (delta > 8 || delta < -0.75) {
    engine.debugSetClock?.(target);
    return;
  }

  if (delta <= 0.01) return;

  let remaining = Math.min(delta, 8);
  let guard = 0;
  while (remaining > 0.001 && guard++ < 16) {
    const slice = Math.min(0.5, remaining);
    engine.step?.(slice);
    remaining -= slice;
  }
}

function synchronize(payload) {
  if (!engine || String(payload.matchId || "") !== currentMatchId) {
    initialize(payload);
    return;
  }

  if (String(payload.signature || "") !== currentSignature) {
    initialize(payload);
    return;
  }

  advanceTo(payload.targetSecond);

  // Keep the public/official score synchronized without taking score authority.
  const external = payload.external || {};
  engine.syncExternalState?.({
    score: external.score || { home: 0, away: 0 },
    source: "LEGACY_OFFICIAL_SCORE_ONLY",
    preserveAction: true
  });

  const now = Date.now();
  if (now - lastSnapshotAt >= 70 || payload.forceSnapshot) {
    lastSnapshotAt = now;
    post("SNAPSHOT", {
      matchId: currentMatchId,
      signature: currentSignature,
      status,
      snapshot: compactSnapshot(engine.getSnapshot())
    });
  }
}

function stop() {
  engine = null;
  currentMatchId = null;
  currentSignature = null;
  status = "READY";
  post("STOPPED", { status });
}

self.onmessage = event => {
  const message = event.data || {};
  try {
    if (message.type === "INIT") initialize(message);
    else if (message.type === "SYNC") synchronize(message);
    else if (message.type === "STOP") stop();
    else if (message.type === "PING") {
      post("PONG", {
        status,
        matchId: currentMatchId,
        coreVersion: core?.VERSION || null,
        clock: number(engine?.clockSeconds, 0)
      });
    }
  } catch (error) {
    status = "ERROR";
    post("ERROR", {
      status,
      matchId: currentMatchId,
      message: error?.message || String(error),
      stack: error?.stack || null
    });
  }
};

try {
  loadCore();
} catch (error) {
  status = "ERROR";
  post("ERROR", {
    status,
    message: error?.message || String(error),
    stack: error?.stack || null
  });
}
