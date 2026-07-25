export class AudioSystem {
  constructor({ muted = false } = {}) {
    this.muted = Boolean(muted);
    this.context = null;
    this.engineOscillator = null;
    this.engineGain = null;
    this.filter = null;
  }

  async unlock() {
    if (this.muted) return;
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.engineOscillator = this.context.createOscillator();
      this.engineGain = this.context.createGain();
      this.filter = this.context.createBiquadFilter();
      this.engineOscillator.type = "sawtooth";
      this.engineOscillator.frequency.value = 70;
      this.engineGain.gain.value = 0.0001;
      this.filter.type = "lowpass";
      this.filter.frequency.value = 850;
      this.engineOscillator.connect(this.filter).connect(this.engineGain).connect(this.context.destination);
      this.engineOscillator.start();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  update(telemetry = {}) {
    if (!this.context || this.muted) return;
    const now = this.context.currentTime;
    const speed = Math.max(0, Number(telemetry.speedKph || 0));
    const throttle = Math.max(0, Math.min(1, Number(telemetry.throttle || 0)));
    const frequency = 65 + speed * 2.3 + throttle * 70;
    this.engineOscillator.frequency.setTargetAtTime(frequency, now, 0.035);
    this.filter.frequency.setTargetAtTime(650 + speed * 6, now, 0.05);
    this.engineGain.gain.setTargetAtTime(0.012 + throttle * 0.025 + speed / 18000, now, 0.04);
  }

  cue(type) {
    if (!this.context || this.muted) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type === "invalid" ? "square" : "sine";
    oscillator.frequency.value = type === "best" ? 880 : type === "sector" ? 660 : 180;
    gain.gain.setValueAtTime(0.08, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + 0.32);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start();
    oscillator.stop(this.context.currentTime + 0.34);
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.engineGain && this.context) {
      this.engineGain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.015, this.context.currentTime, 0.03);
    }
  }

  dispose() {
    try { this.engineOscillator?.stop(); } catch {}
    this.engineOscillator?.disconnect();
    this.filter?.disconnect();
    this.engineGain?.disconnect();
    this.context?.close?.();
    this.context = null;
  }
}
