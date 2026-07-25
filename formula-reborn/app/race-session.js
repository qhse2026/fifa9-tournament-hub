import { FormulaRenderer } from "../engine/renderer.js";
import { FixedGameLoop } from "../engine/game-loop.js";
import { VehiclePhysics } from "../engine/vehicle-physics.js";
import { InputController } from "../engine/input-controller.js";
import { LapTiming } from "../engine/lap-timing.js";
import { GhostSystem } from "../engine/ghost-system.js";
import { AudioSystem } from "../engine/audio-system.js";
import {
  createSessionEnvelope,
  recordInputSample,
  finalizeSessionEnvelope,
  validateSessionLocally
} from "../cloud/session-validator.js";
import {
  startCloudSession,
  submitSession
} from "../cloud/leaderboard-service.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function formatTime(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value < 0) return "—";
  const minutes = Math.floor(value / 60000);
  const seconds = (value - minutes * 60000) / 1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatDelta(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value)) return "—";
  const sign = value <= 0 ? "−" : "+";
  return `${sign}${Math.abs(value / 1000).toFixed(3)}`;
}

export class RaceSession {
  constructor({ root, track, settings, playerName, onExit, onComplete }) {
    this.root = root;
    this.track = track;
    this.settings = settings;
    this.playerName = playerName;
    this.onExit = onExit;
    this.onComplete = onComplete;
    this.renderer = null;
    this.physics = null;
    this.input = null;
    this.loop = null;
    this.timing = null;
    this.ghost = new GhostSystem();
    this.audio = new AudioSystem({ muted: settings.audioMuted });
    this.envelope = null;
    this.countdownMs = 3000;
    this.countdownStartedAt = performance.now();
    this.started = false;
    this.finished = false;
    this.lastLapNumber = 1;
    this.lastTrackLimitEvents = 0;
    this.lastTelemetry = null;
    this.lastHudAt = 0;
    this.lastInputSampleBucket = -1;
    this.pendingSubmission = null;
  }

  async mount() {
    this.root.innerHTML = this.markup();
    const stage = this.root.querySelector("[data-fr45-stage]");
    this.renderer = new FormulaRenderer(stage, this.track, this.settings);
    this.physics = new VehiclePhysics(this.renderer.trackModel, this.settings);
    this.timing = new LapTiming(this.renderer.trackModel, { laps: 5 });
    this.input = new InputController(document);
    this.input.bindTouchControls(this.root);

    const personalGhost = this.settings.ghost === "personal"
      ? this.ghost.loadPersonalGhost(this.track.id)
      : null;
    if (!personalGhost) this.ghost.clearPlayback();

    const cloudStart = await startCloudSession(this.track.id);
    this.envelope = createSessionEnvelope({
      track: this.track,
      settings: this.settings,
      playerName: this.playerName,
      startToken: cloudStart.token
    });

    this.bindActions();
    await this.audio.unlock();

    this.loop = new FixedGameLoop({
      fixedStep: 1 / 120,
      update: (dt, now) => this.update(dt, now),
      render: (alpha, now) => this.render(alpha, now)
    });
    this.loop.start();
  }

  markup() {
    return `<section class="fr45-race-shell" data-no-translate>
      <div class="fr45-stage" data-fr45-stage></div>

      <header class="fr45-hud-top">
        <div class="fr45-hud-brand">
          <span>FORMULA HORIZON REBORN</span>
          <strong>${this.track.name}</strong>
        </div>
        <div class="fr45-hud-primary">
          <article><small>LAP</small><b data-fr45-lap>1 / 5</b></article>
          <article><small>CURRENT</small><b data-fr45-current>0:00.000</b></article>
          <article><small>BEST</small><b data-fr45-best>—</b></article>
          <article><small>DELTA</small><b data-fr45-delta>—</b></article>
          <article><small>SPEED</small><b><i data-fr45-speed>0</i> km/h</b></article>
        </div>
        <div class="fr45-hud-actions">
          <button type="button" data-fr45-action="camera" title="Change camera">C</button>
          <button type="button" data-fr45-action="pause" title="Pause">Ⅱ</button>
          <button type="button" data-fr45-action="exit" title="Exit">×</button>
        </div>
      </header>

      <aside class="fr45-sector-panel">
        <header><span>LIVE SECTORS</span><b data-fr45-valid>CLEAN LAP</b></header>
        <article><small>S1</small><b data-fr45-sector="0">—</b></article>
        <article><small>S2</small><b data-fr45-sector="1">—</b></article>
        <article><small>S3</small><b data-fr45-sector="2">—</b></article>
        <footer><span>CAMERA</span><b data-fr45-camera>${this.settings.camera.toUpperCase()}</b></footer>
      </aside>

      <aside class="fr45-telemetry-panel">
        <article><span>THROTTLE</span><i><b data-fr45-throttle></b></i></article>
        <article><span>BRAKE</span><i><b data-fr45-brake></b></i></article>
        <article><span>SURFACE</span><strong data-fr45-surface>ASPHALT</strong></article>
        <article><span>CAR</span><strong data-fr45-health>100%</strong></article>
      </aside>

      <div class="fr45-countdown" data-fr45-countdown><strong>3</strong><span>5 LAP OFFICIAL SESSION</span></div>
      <div class="fr45-alert hidden" data-fr45-alert><strong>TRACK LIMITS</strong><span>LAP INVALIDATED</span></div>

      <div class="fr45-mobile-controls">
        <div class="fr45-steer-controls">
          <button type="button" data-fr45-control="left">◀</button>
          <button type="button" data-fr45-control="right">▶</button>
        </div>
        <div class="fr45-pedal-controls">
          <button type="button" class="fr45-brake" data-fr45-control="brake">BRAKE</button>
          <button type="button" class="fr45-throttle" data-fr45-control="throttle">THROTTLE</button>
        </div>
        <div class="fr45-mobile-actions">
          <button type="button" data-fr45-control="camera">CAM</button>
          <button type="button" data-fr45-control="pause">Ⅱ</button>
        </div>
      </div>

      <div class="fr45-pause-overlay hidden" data-fr45-pause-overlay>
        <section>
          <span>SESSION PAUSED</span>
          <h2>Formula Horizon Reborn</h2>
          <button type="button" data-fr45-action="resume">Continue</button>
          <button type="button" data-fr45-action="restart">Restart Session</button>
          <button type="button" data-fr45-action="exit">Return to Hub</button>
        </section>
      </div>

      <div class="fr45-result-overlay hidden" data-fr45-result></div>
    </section>`;
  }

  bindActions() {
    this.handleActionClick = event => {
      const action = event.target.closest("[data-fr45-action]")?.dataset.fr45Action;
      if (!action) return;
      if (action === "camera") this.cycleCamera();
      if (action === "pause") this.setPaused(true);
      if (action === "resume") this.setPaused(false);
      if (action === "restart") this.restart();
      if (action === "exit") this.exit();
      if (action === "retry") this.restart();
      if (action === "hub") this.exit();
    };
    this.root.addEventListener("click", this.handleActionClick);
  }

  startTiming(now) {
    this.started = true;
    this.timing.start(now, this.lastTelemetry || {});
    this.ghost.beginLap(this.track.id);
  }

  update(dt, now) {
    const input = this.input.snapshot();

    if (input.pause) {
      this.setPaused(!this.loop.paused);
      return;
    }
    if (input.camera) this.cycleCamera();

    if (this.countdownMs > 0) {
      this.countdownMs = Math.max(0, 3000 - (now - this.countdownStartedAt));
      if (this.countdownMs === 0 && !this.started) this.startTiming(now);
      return;
    }
    if (this.finished) return;

    if (input.reset) {
      if (this.physics.speed < 4 || Math.abs(this.physics.lateralOffset) > this.track.width / 2 + this.track.runoff * 0.7) {
        this.physics.applyReset();
        this.timing.invalidate("RESET USED");
        this.audio.cue("invalid");
      }
    }

    const telemetry = this.physics.update(dt, input);
    this.lastTelemetry = telemetry;
    this.renderer.syncVehicle(this.physics);

    if (telemetry.trackLimitEvents > this.lastTrackLimitEvents) {
      this.lastTrackLimitEvents = telemetry.trackLimitEvents;
      this.showAlert("TRACK LIMITS", "LAP INVALIDATED");
      this.audio.cue("invalid");
    }

    const timingEvent = this.timing.update(telemetry, now);
    const timingSnapshot = this.timing.snapshot(now);
    this.ghost.record(timingSnapshot.currentLapTimeMs, this.physics, telemetry);

    if (timingEvent?.type === "lap-complete" || timingEvent?.type === "session-complete") {
      const lap = timingEvent.lap;
      const ghostSave = this.ghost.finishLap({
        trackId: this.track.id,
        lapTimeMs: lap.timeMs,
        valid: lap.valid
      });
      if (ghostSave.saved) this.audio.cue("best");

      if (timingEvent.type === "session-complete") {
        this.finish(timingEvent.result);
      } else {
        this.ghost.beginLap(this.track.id);
      }
    }

    const bucket = Math.floor(timingSnapshot.sessionTimeMs / 250);
    if (bucket !== this.lastInputSampleBucket) {
      this.lastInputSampleBucket = bucket;
      recordInputSample(this.envelope, timingSnapshot.sessionTimeMs, input, telemetry);
    }

    const ghostSample = this.ghost.sample(timingSnapshot.currentLapTimeMs);
    this.renderer.syncGhost(ghostSample);
    const delta = this.ghost.deltaAtProgress(telemetry.progress, timingSnapshot.currentLapTimeMs);
    this.currentDelta = delta;

    this.audio.update(telemetry);
    this.renderer.updateCamera(telemetry, dt, input);
  }

  render(alpha, now) {
    this.renderer?.render();
    if (now - this.lastHudAt > 80) {
      this.lastHudAt = now;
      this.updateHud(now);
    }
  }

  updateHud(now) {
    const set = (selector, value) => {
      const node = this.root.querySelector(selector);
      if (node) node.textContent = value;
    };

    if (this.countdownMs > 0) {
      const countdown = this.root.querySelector("[data-fr45-countdown]");
      if (countdown) {
        countdown.classList.remove("hidden");
        countdown.querySelector("strong").textContent = String(Math.max(1, Math.ceil(this.countdownMs / 1000)));
      }
    } else {
      this.root.querySelector("[data-fr45-countdown]")?.classList.add("hidden");
    }

    const timing = this.timing?.snapshot(now) || {
      currentLap: 1,
      lapsTarget: 5,
      currentLapTimeMs: 0,
      currentLapValid: true,
      currentSectors: [null, null, null],
      bestLapMs: null
    };
    const telemetry = this.lastTelemetry || {
      speedKph: 0,
      throttle: 0,
      brake: 0,
      surface: "asphalt",
      damage: { frontWing: 0, steering: 0, suspension: 0 }
    };

    set("[data-fr45-lap]", `${timing.currentLap} / ${timing.lapsTarget}`);
    set("[data-fr45-current]", formatTime(timing.currentLapTimeMs));
    set("[data-fr45-best]", formatTime(timing.bestLapMs));
    set("[data-fr45-delta]", formatDelta(this.currentDelta));
    set("[data-fr45-speed]", String(Math.round(telemetry.speedKph || 0)));
    set("[data-fr45-surface]", String(telemetry.surface || "asphalt").toUpperCase());

    timing.currentSectors.forEach((value, index) => {
      set(`[data-fr45-sector="${index}"]`, formatTime(value));
    });

    const validity = this.root.querySelector("[data-fr45-valid]");
    if (validity) {
      validity.textContent = timing.currentLapValid ? "CLEAN LAP" : (timing.invalidReason || "LAP INVALID");
      validity.classList.toggle("invalid", !timing.currentLapValid);
    }

    const throttleBar = this.root.querySelector("[data-fr45-throttle]");
    const brakeBar = this.root.querySelector("[data-fr45-brake]");
    if (throttleBar) throttleBar.style.width = `${clamp(telemetry.throttle * 100, 0, 100)}%`;
    if (brakeBar) brakeBar.style.width = `${clamp(telemetry.brake * 100, 0, 100)}%`;

    const damage = telemetry.damage || {};
    const health = Math.max(0, 100 - ((damage.frontWing || 0) * 32 + (damage.steering || 0) * 38 + (damage.suspension || 0) * 30));
    set("[data-fr45-health]", `${Math.round(health)}%`);
  }

  cycleCamera() {
    const mode = this.renderer.cycleCamera();
    const node = this.root.querySelector("[data-fr45-camera]");
    if (node) node.textContent = mode.label.toUpperCase();
  }

  showAlert(title, message) {
    const alert = this.root.querySelector("[data-fr45-alert]");
    if (!alert) return;
    alert.querySelector("strong").textContent = title;
    alert.querySelector("span").textContent = message;
    alert.classList.remove("hidden");
    clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => alert.classList.add("hidden"), 1700);
  }

  setPaused(paused) {
    this.loop?.setPaused(paused);
    this.root.querySelector("[data-fr45-pause-overlay]")?.classList.toggle("hidden", !paused);
  }

  async finish(result) {
    if (this.finished) return;
    this.finished = true;
    this.loop.setPaused(true);
    const payload = await finalizeSessionEnvelope(this.envelope, result, this.lastTelemetry || {});
    const validation = validateSessionLocally(payload);
    this.pendingSubmission = submitSession(payload, validation);
    const submission = await this.pendingSubmission;
    this.showResult(payload, validation, submission);
    this.onComplete?.({ payload, validation, submission });
  }

  showResult(payload, validation, submission) {
    const panel = this.root.querySelector("[data-fr45-result]");
    if (!panel) return;
    panel.classList.remove("hidden");
    const lapRows = payload.laps.map(lap => `<article class="${lap.valid ? "" : "invalid"}">
      <span>LAP ${lap.lap}</span>
      <b>${formatTime(lap.timeMs)}</b>
      <small>${lap.valid ? "VALID" : lap.invalidReason || "INVALID"}</small>
    </article>`).join("");

    panel.innerHTML = `<section class="fr45-result-card">
      <span>OFFICIAL FIVE-LAP SESSION COMPLETE</span>
      <h2>${this.track.name}</h2>
      <div class="fr45-result-summary">
        <article><small>FASTEST CLEAN LAP</small><strong>${formatTime(payload.bestLapMs)}</strong></article>
        <article><small>FIVE-LAP TOTAL</small><strong>${formatTime(payload.fiveLapTotalMs)}</strong></article>
        <article><small>VALID LAPS</small><strong>${payload.validLapCount} / 5</strong></article>
        <article><small>REVIEW STATUS</small><strong>${String(submission.reviewStatus || validation.status).toUpperCase()}</strong></article>
      </div>
      <div class="fr45-result-laps">${lapRows}</div>
      <div class="fr45-result-ranking">
        <article><small>FASTEST LAP RANK</small><b>${submission.lapRank ? `#${submission.lapRank}` : "LOCAL"}</b></article>
        <article><small>FIVE-LAP RANK</small><b>${submission.totalRank ? `#${submission.totalRank}` : "LOCAL"}</b></article>
      </div>
      <footer>
        <button type="button" data-fr45-action="retry">Retry Circuit</button>
        <button type="button" data-fr45-action="hub">Return to Hub</button>
      </footer>
    </section>`;
  }

  async restart() {
    this.dispose();
    const replacement = new RaceSession({
      root: this.root,
      track: this.track,
      settings: this.settings,
      playerName: this.playerName,
      onExit: this.onExit,
      onComplete: this.onComplete
    });
    replacement.onReplacement = this.onReplacement;
    await replacement.mount();
    this.onReplacement?.(replacement);
  }

  exit() {
    this.dispose();
    this.onExit?.();
  }

  dispose() {
    clearTimeout(this.alertTimer);
    if (this.handleActionClick) this.root.removeEventListener("click", this.handleActionClick);
    this.handleActionClick = null;
    this.loop?.stop();
    this.input?.dispose();
    this.audio?.dispose();
    this.renderer?.dispose();
    this.loop = null;
    this.input = null;
    this.renderer = null;
  }
}

export { formatTime };
