import { PHYSICS_VERSION } from "../engine/vehicle-physics.js";

const TRACK_VERSIONS = Object.freeze({
  "oruc-reis-coastal": "45.0.0-orc-1",
  "filyos-harbour": "45.0.0-fhy-1",
  "dragon-mountain": "45.0.0-dmp-1"
});

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) return "";
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export function createSessionEnvelope({ track, settings, playerName, startToken = null }) {
  return {
    sessionVersion: "45.0.0",
    physicsVersion: PHYSICS_VERSION,
    trackId: track.id,
    trackVersion: track.version,
    playerName: String(playerName || "Guest Driver").trim().slice(0, 40),
    startedAtIso: new Date().toISOString(),
    startToken,
    settings: {
      abs: Boolean(settings.abs),
      tractionControl: settings.tractionControl,
      steeringAssist: settings.steeringAssist,
      brakeAssist: settings.brakeAssist,
      camera: settings.camera,
      quality: settings.quality
    },
    visibilityPauses: 0,
    resetCount: 0,
    trackLimitEvents: 0,
    maxSpeedKph: 0,
    inputSamples: []
  };
}

export function recordInputSample(envelope, elapsedMs, input, telemetry) {
  if (!envelope || elapsedMs % 250 > 17) return;
  envelope.inputSamples.push([
    Math.round(elapsedMs),
    Math.round(Number(input.throttle || 0) * 100),
    Math.round(Number(input.brake || 0) * 100),
    Math.round(Number(input.steering || 0) * 100),
    Math.round(Number(telemetry.progress || 0) * 10000),
    Math.round(Number(telemetry.speedKph || 0))
  ]);
  if (envelope.inputSamples.length > 6000) {
    envelope.inputSamples.splice(0, envelope.inputSamples.length - 6000);
  }
}

export async function finalizeSessionEnvelope(envelope, result, telemetry) {
  const payload = {
    ...envelope,
    completedAtIso: new Date().toISOString(),
    completed: Boolean(result.completed),
    laps: result.laps.map(lap => ({
      lap: lap.lap,
      timeMs: lap.timeMs,
      valid: lap.valid,
      sectors: lap.sectors
    })),
    bestLapMs: result.bestLapMs,
    fiveLapTotalMs: result.fiveLapTotalMs,
    validLapCount: result.validLapCount,
    sectorBests: result.sectorBests,
    resetCount: Number(telemetry.resetCount || 0),
    trackLimitEvents: Number(telemetry.trackLimitEvents || 0),
    maxSpeedKph: Math.round(Number(telemetry.maxSpeedKph || 0))
  };
  payload.inputChecksum = await sha256(stableStringify(payload.inputSamples));
  payload.sessionHash = await sha256(stableStringify({
    sessionVersion: payload.sessionVersion,
    physicsVersion: payload.physicsVersion,
    trackId: payload.trackId,
    trackVersion: payload.trackVersion,
    laps: payload.laps,
    inputChecksum: payload.inputChecksum,
    resetCount: payload.resetCount,
    trackLimitEvents: payload.trackLimitEvents,
    maxSpeedKph: payload.maxSpeedKph
  }));
  return payload;
}

export function validateSessionLocally(payload) {
  const issues = [];
  if (!payload?.completed) issues.push("Session is incomplete.");
  if (payload?.sessionVersion !== "45.0.0") issues.push("Session version mismatch.");
  if (payload?.physicsVersion !== PHYSICS_VERSION) issues.push("Physics version mismatch.");
  if (TRACK_VERSIONS[payload?.trackId] !== payload?.trackVersion) issues.push("Track version mismatch.");
  if (!Array.isArray(payload?.laps) || payload.laps.length !== 5) issues.push("Exactly five laps are required.");
  if (!Number.isFinite(payload?.fiveLapTotalMs) || payload.fiveLapTotalMs < 90000 || payload.fiveLapTotalMs > 3600000) {
    issues.push("Five-lap total is outside plausible limits.");
  }
  if (payload?.bestLapMs !== null && (!Number.isFinite(payload.bestLapMs) || payload.bestLapMs < 15000 || payload.bestLapMs > 600000)) {
    issues.push("Fastest lap is outside plausible limits.");
  }
  if (Number(payload?.maxSpeedKph || 0) > 345) issues.push("Maximum speed is implausible.");
  if (!payload?.inputChecksum || !payload?.sessionHash) issues.push("Session integrity hashes are missing.");
  return {
    valid: issues.length === 0,
    status: issues.length ? "under-review" : "accepted",
    issues
  };
}
