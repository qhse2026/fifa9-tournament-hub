const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class LapTiming {
  constructor(trackModel, { laps = 5 } = {}) {
    this.trackModel = trackModel;
    this.lapsTarget = laps;
    this.reset();
  }

  reset() {
    this.started = false;
    this.finished = false;
    this.sessionStartedAt = 0;
    this.lapStartedAt = 0;
    this.currentLap = 1;
    this.currentLapWarnings = 0;
    this.lastTrackLimitEvents = 0;
    this.lastResetCount = 0;
    this.lastProgress = 0;
    this.lastUnwrappedProgress = 0;
    this.completedLaps = [];
    this.currentSectors = [null, null, null];
    this.bestSectors = [null, null, null];
    this.sectorCursor = 0;
    this.currentSection = "";
  }

  start(now = performance.now(), telemetry = {}) {
    this.started = true;
    this.finished = false;
    this.sessionStartedAt = now;
    this.lapStartedAt = now;
    this.currentLap = 1;
    this.currentLapWarnings = 0;
    this.lastTrackLimitEvents = Number(telemetry.trackLimitEvents || 0);
    this.lastResetCount = Number(telemetry.resetCount || 0);
    this.lastProgress = Number(telemetry.progress || 0);
    this.lastUnwrappedProgress = Number(telemetry.unwrappedProgress || 0);
    this.currentSectors = [null, null, null];
    this.sectorCursor = 0;
  }

  invalidate() {
    // V45.0.3: kept as a compatibility no-op.
    // Off-track driving is punished only by physical grip and speed loss.
    return false;
  }

  update(telemetry, now = performance.now()) {
    if (!this.started || this.finished) return null;
    const progress = clamp(Number(telemetry.progress || 0), 0, 0.999999);
    const unwrapped = Number(telemetry.unwrappedProgress || 0);

    if (Number(telemetry.trackLimitEvents || 0) > this.lastTrackLimitEvents) {
      this.currentLapWarnings += 1;
      this.lastTrackLimitEvents = Number(telemetry.trackLimitEvents || 0);
    }
    if (Number(telemetry.resetCount || 0) > this.lastResetCount) {
      this.lastResetCount = Number(telemetry.resetCount || 0);
    }

    const sectors = this.trackModel.track.sectors;
    while (this.sectorCursor < 2 && progress >= sectors[this.sectorCursor]) {
      const sectorTime = now - this.lapStartedAt -
        this.currentSectors.slice(0, this.sectorCursor).reduce((sum, value) => sum + Number(value || 0), 0);
      this.currentSectors[this.sectorCursor] = sectorTime;
      const best = this.bestSectors[this.sectorCursor];
      if (best === null || sectorTime < best) this.bestSectors[this.sectorCursor] = sectorTime;
      this.sectorCursor += 1;
    }

    const crossedLine =
      this.lastProgress > 0.82 &&
      progress < 0.18 &&
      unwrapped > this.lastUnwrappedProgress;

    let event = null;
    if (crossedLine && now - this.lapStartedAt > 8000) {
      const totalLapTime = now - this.lapStartedAt;
      const used = this.currentSectors[0] || 0;
      const used2 = this.currentSectors[1] || 0;
      this.currentSectors[2] = Math.max(0, totalLapTime - used - used2);
      if (
        this.bestSectors[2] === null ||
        this.currentSectors[2] < this.bestSectors[2]
      ) {
        this.bestSectors[2] = this.currentSectors[2];
      }

      const lap = {
        lap: this.currentLap,
        timeMs: Math.round(totalLapTime),
        valid: true,
        invalidReason: null,
        warnings: this.currentLapWarnings,
        sectors: this.currentSectors.map(value => Math.round(Number(value || 0)))
      };
      this.completedLaps.push(lap);
      event = { type: "lap-complete", lap };

      if (this.currentLap >= this.lapsTarget) {
        this.finished = true;
        event = { type: "session-complete", lap, result: this.result(now) };
      } else {
        this.currentLap += 1;
        this.lapStartedAt = now;
            this.currentLapWarnings = 0;
        this.currentSectors = [null, null, null];
        this.sectorCursor = 0;
      }
    }

    this.lastProgress = progress;
    this.lastUnwrappedProgress = unwrapped;
    return event;
  }

  result(now = performance.now()) {
    const timedLaps = this.completedLaps;
    const bestLap = timedLaps.length
      ? timedLaps.reduce((best, lap) => lap.timeMs < best.timeMs ? lap : best)
      : null;
    return {
      completed: this.completedLaps.length === this.lapsTarget,
      laps: this.completedLaps.slice(),
      bestLapMs: bestLap?.timeMs || null,
      bestLapNumber: bestLap?.lap || null,
      fiveLapTotalMs: this.completedLaps.reduce((sum, lap) => sum + lap.timeMs, 0),
      validLapCount: this.completedLaps.length,
      sectorBests: this.bestSectors.map(value => value === null ? null : Math.round(value)),
      elapsedMs: Math.round(now - this.sessionStartedAt)
    };
  }

  snapshot(now = performance.now()) {
    return {
      currentLap: this.currentLap,
      lapsTarget: this.lapsTarget,
      currentLapTimeMs: this.started ? Math.max(0, now - this.lapStartedAt) : 0,
      currentLapValid: true,
      invalidReason: null,
      currentSectors: this.currentSectors.slice(),
      bestSectors: this.bestSectors.slice(),
      completedLaps: this.completedLaps.slice(),
      bestLapMs: this.completedLaps.length ? Math.min(...this.completedLaps.map(lap => lap.timeMs)) : null,
      sessionTimeMs: this.started ? Math.max(0, now - this.sessionStartedAt) : 0,
      finished: this.finished
    };
  }
}
