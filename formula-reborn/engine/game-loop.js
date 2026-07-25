export class FixedGameLoop {
  constructor({ fixedStep = 1 / 120, maxFrame = 0.1, update, render }) {
    this.fixedStep = fixedStep;
    this.maxFrame = maxFrame;
    this.update = update;
    this.render = render;
    this.running = false;
    this.paused = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.raf = 0;
    this.frame = time => this.tick(time);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  tick(time) {
    if (!this.running) return;
    const frameTime = Math.min(this.maxFrame, Math.max(0, (time - this.lastTime) / 1000));
    this.lastTime = time;

    if (!this.paused) {
      this.accumulator += frameTime;
      let safety = 0;
      while (this.accumulator >= this.fixedStep && safety < 12) {
        this.update(this.fixedStep, time);
        this.accumulator -= this.fixedStep;
        safety += 1;
      }
    }

    const alpha = this.fixedStep > 0 ? this.accumulator / this.fixedStep : 0;
    this.render(alpha, time);
    this.raf = requestAnimationFrame(this.frame);
  }

  setPaused(paused) {
    this.paused = Boolean(paused);
    this.accumulator = 0;
    this.lastTime = performance.now();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
