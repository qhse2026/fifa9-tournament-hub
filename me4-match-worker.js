/* Match Engine V4 Worker Core — Phase W1 */
"use strict";

const WORKER_VERSION = "4.0.0-worker-w1.1";
const CORE_URL = "./manager-match-engine-v4-phase13-safe.bundle.js?v=4.0.0-phase13-safe.1";

let core = null;
let engine = null;
let currentMatchId = null;
let currentSignature = null;
let lastSyncAt = 0;
let lastSnapshotAt = 0;
let status = "BOOTING";

function post(type, payload = {}) {
  self.postMessage({ type, workerVersion: WORKER_VERSION, ...payload });
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compactPlayer(player) {
  return {
    id: player.id,
    number: player.number,
    position: player.position,
    group: player.group,
    role: player.role,
    x: safeNumber(player.point?.x, 50),
    y: safeNumber(player.point?.y, 34),
    targetX: safeNumber(player.targetPoint?.x, safeNumber(player.point?.x, 50)),
    targetY: safeNumber(player.targetPoint?.y, safeNumber(player.point?.y, 34)),
    facing: safeNumber(player.facing, 0),
    intent: String(player.intent || "HOLD_SHAPE"),
    energy: safeNumber(player.shortTermEnergy ?? player.energy, 100),
    fatigue: safeNumber(player.accumulatedFatigue ?? player.fatigue, 0),
    status: String(player.physicalStatus || "FIT"),
    hasBall: Boolean(player.hasBall)
  };
}

function compactTeam(team) {
  return {
    id: team.id,
    name: team.name,
    formation: team.formation,
    phase: team.phase,
    averageEnergy: safeNumber(team.physical?.averageEnergy ?? team.averageEnergy, 100),
    averageFatigue: safeNumber(team.physical?.averageFatigue, 0),
    players: (team.players || []).map(compactPlayer)
  };
}

function compactSnapshot(snapshot, source = "SYNC") {
  return {
    source,
    status: snapshot.status,
    simulationTime: safeNumber(snapshot.simulationTime, 0),
    minute: safeNumber(snapshot.minute, 0),
    phase: snapshot.phase,
    possessionSide: snapshot.possessionSide,
    officialScore: snapshot.officialScore || snapshot.score,
    ball: {
      x: safeNumber(snapshot.ball?.position?.x, 50),
      y: safeNumber(snapshot.ball?.position?.y, 34),
      height: safeNumber(snapshot.ball?.height, 0),
      teamSide: snapshot.ball?.teamSide || snapshot.possessionSide
    },
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
    throw new Error("Match Engine V4 core API could not be loaded inside Worker.");
  }
  status = "READY";
  post("READY", { coreVersion: core.VERSION, status });
  return core;
}

function initialize(payload) {
  loadCore();
  const config = core.createDefaultConfig(payload.config || {});
  engine = core.createEngine(config);
  currentMatchId = String(payload.matchId || config.matchId || "unknown");
  currentSignature = String(payload.signature || "");
  const external = payload.external || {};
  const targetSecond = Math.max(0, safeNumber(payload.targetSecond, 0));
  engine.debugSetClock?.(targetSecond);
  engine.setBallAuthority?.(true, {
    ball: external.ball,
    possessionSide: external.possessionSide,
    score: external.score,
    source: "LEGACY_OFFICIAL_WORKER_INIT",
    reassignOwner: true,
    settleSeconds: 0.18
  });
  status = "ACTIVE";
  const snapshot = compactSnapshot(engine.getSnapshot(), "INIT");
  post("INITIALIZED", { matchId: currentMatchId, signature: currentSignature, status, snapshot });
}

function synchronize(payload) {
  if (!engine || String(payload.matchId || "") !== currentMatchId) {
    initialize(payload);
    return;
  }
  const targetSecond = Math.max(0, safeNumber(payload.targetSecond, engine.clockSeconds || 0));
  const currentSecond = safeNumber(engine.clockSeconds, 0);
  const delta = targetSecond - currentSecond;

  // Shadow visual mode does not need to replay historical decisions after refresh.
  if (Math.abs(delta) > 4) engine.debugSetClock?.(targetSecond);
  else if (delta > 0.01) engine.step?.(Math.min(delta, 1));
  else if (delta < -0.5) engine.debugSetClock?.(targetSecond);

  const external = payload.external || {};
  engine.syncExternalState?.({
    ball: external.ball,
    possessionSide: external.possessionSide,
    score: external.score,
    source: "LEGACY_OFFICIAL_WORKER_SYNC",
    reassignOwner: true,
    preserveAction: false,
    settleSeconds: Math.max(0.08, Math.min(0.35, safeNumber(payload.settleSeconds, 0.18)))
  });

  lastSyncAt = Date.now();
  if (lastSyncAt - lastSnapshotAt >= 100 || payload.forceSnapshot) {
    lastSnapshotAt = lastSyncAt;
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
    else if (message.type === "PING") post("PONG", { status, matchId: currentMatchId, coreVersion: core?.VERSION || null });
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

try { loadCore(); }
catch (error) {
  status = "ERROR";
  post("ERROR", { status, message: error?.message || String(error), stack: error?.stack || null });
}
