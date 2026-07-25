const SAMPLE_INTERVAL_MS = 100;

function interpolate(a, b, amount) {
  const t = Math.max(0, Math.min(1, amount));
  let yawDelta = b.yaw - a.yaw;
  while (yawDelta > Math.PI) yawDelta -= Math.PI * 2;
  while (yawDelta < -Math.PI) yawDelta += Math.PI * 2;
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + yawDelta * t,
    speedKph: a.speedKph + (b.speedKph - a.speedKph) * t,
    progress: a.progress + (b.progress - a.progress) * t
  };
}

export class GhostSystem {
  constructor(storageKey = "fifa9_formula_reborn_v45_ghosts") {
    this.storageKey = storageKey;
    this.trackId = null;
    this.recording = [];
    this.lastRecordedAt = -Infinity;
    this.playback = null;
    this.playbackTimeMs = 0;
  }

  loadState() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey) || "{}") || {};
    } catch {
      return {};
    }
  }

  saveState(state) {
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }

  beginLap(trackId) {
    this.trackId = trackId;
    this.recording = [];
    this.lastRecordedAt = -Infinity;
  }

  record(timeMs, physics, telemetry) {
    if (timeMs - this.lastRecordedAt < SAMPLE_INTERVAL_MS) return;
    this.lastRecordedAt = timeMs;
    this.recording.push({
      t: Math.round(timeMs),
      x: Number(physics.position.x.toFixed(3)),
      y: Number(physics.position.y.toFixed(3)),
      z: Number(physics.position.z.toFixed(3)),
      yaw: Number(physics.yaw.toFixed(5)),
      speedKph: Number((telemetry.speedKph || 0).toFixed(1)),
      progress: Number((telemetry.progress || 0).toFixed(5))
    });
  }

  finishLap({ trackId, lapTimeMs, valid }) {
    if (!valid || !trackId || this.recording.length < 10) {
      this.recording = [];
      return { saved: false };
    }
    const state = this.loadState();
    const current = state[trackId];
    if (!current || lapTimeMs < current.lapTimeMs) {
      state[trackId] = {
        trackId,
        lapTimeMs: Math.round(lapTimeMs),
        samples: this.recording.slice(),
        updatedAt: new Date().toISOString(),
        physicsVersion: "45.0.0-physics-1"
      };
      this.saveState(state);
      this.recording = [];
      return { saved: true, ghost: state[trackId] };
    }
    this.recording = [];
    return { saved: false, ghost: current };
  }

  loadPersonalGhost(trackId) {
    const state = this.loadState();
    this.playback = state[trackId] || null;
    this.playbackTimeMs = 0;
    return this.playback;
  }

  clearPlayback() {
    this.playback = null;
    this.playbackTimeMs = 0;
  }

  sample(timeMs) {
    if (!this.playback?.samples?.length) return null;
    const samples = this.playback.samples;
    if (timeMs <= samples[0].t) return samples[0];
    if (timeMs >= samples[samples.length - 1].t) return samples[samples.length - 1];

    let low = 0;
    let high = samples.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (samples[middle].t < timeMs) low = middle + 1;
      else high = middle - 1;
    }
    const next = samples[Math.min(samples.length - 1, low)];
    const previous = samples[Math.max(0, low - 1)];
    const span = Math.max(1, next.t - previous.t);
    return interpolate(previous, next, (timeMs - previous.t) / span);
  }

  deltaAtProgress(progress, currentTimeMs) {
    if (!this.playback?.samples?.length) return null;
    let closest = this.playback.samples[0];
    let difference = Infinity;
    for (const sample of this.playback.samples) {
      const value = Math.abs(Number(sample.progress || 0) - progress);
      if (value < difference) {
        difference = value;
        closest = sample;
      }
    }
    return currentTimeMs - closest.t;
  }

  getPersonalBest(trackId) {
    return this.loadState()[trackId] || null;
  }
}
