// Three.js chase-camera/world steering polarity for this vehicle model.
// -1 converts physical left/right controls into the visual direction expected
// by the deployed chase camera. Keep keyboard and touch on the same convention.
export const STEERING_POLARITY = -1;

export class InputController {
  constructor(root = document) {
    this.root = root;
    this.state = {
      throttle: 0,
      brake: 0,
      steering: 0,
      reset: false,
      camera: false,
      pause: false
    };
    this.keys = new Set();
    this.pointerState = new Map();
    this.onKeyDown = event => this.handleKey(event, true);
    this.onKeyUp = event => this.handleKey(event, false);
    this.onVisibility = () => {
      if (document.hidden) this.state.pause = true;
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp, { passive: false });
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  handleKey(event, pressed) {
    const key = String(event.key || "").toLowerCase();
    const blocked = ["w","a","s","d","c","r","escape","arrowup","arrowdown","arrowleft","arrowright"];
    if (blocked.includes(key)) event.preventDefault();
    if (pressed) this.keys.add(key);
    else this.keys.delete(key);

    if (pressed && key === "c") this.state.camera = true;
    if (pressed && key === "r") this.state.reset = true;
    if (pressed && key === "escape") this.state.pause = true;
    this.updateAxes();
  }

  updateAxes() {
    const throttle = this.keys.has("w") || this.keys.has("arrowup");
    const brake = this.keys.has("s") || this.keys.has("arrowdown");
    const left = this.keys.has("a") || this.keys.has("arrowleft");
    const right = this.keys.has("d") || this.keys.has("arrowright");
    this.state.throttle = throttle ? 1 : 0;
    this.state.brake = brake ? 1 : 0;
    this.state.steering = ((right ? 1 : 0) - (left ? 1 : 0)) * STEERING_POLARITY;
  }

  bindTouchControls(container) {
    if (!container) return;
    container.querySelectorAll("[data-fr45-control]").forEach(button => {
      const control = button.dataset.fr45Control;
      const activate = event => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        this.pointerState.set(event.pointerId, control);
        this.setControl(control, true);
      };
      const deactivate = event => {
        event.preventDefault();
        this.pointerState.delete(event.pointerId);
        this.setControl(control, false);
      };
      button.addEventListener("pointerdown", activate);
      button.addEventListener("pointerup", deactivate);
      button.addEventListener("pointercancel", deactivate);
      button.addEventListener("pointerleave", deactivate);
    });
  }

  setControl(control, active) {
    if (control === "throttle") this.state.throttle = active ? 1 : 0;
    if (control === "brake") this.state.brake = active ? 1 : 0;
    if (control === "left") {
      const value = -1 * STEERING_POLARITY;
      this.state.steering = active ? value : (this.state.steering === value ? 0 : this.state.steering);
    }
    if (control === "right") {
      const value = 1 * STEERING_POLARITY;
      this.state.steering = active ? value : (this.state.steering === value ? 0 : this.state.steering);
    }
    if (control === "camera" && active) this.state.camera = true;
    if (control === "pause" && active) this.state.pause = true;
    if (control === "reset" && active) this.state.reset = true;
  }

  consumeOneShot(name) {
    const value = Boolean(this.state[name]);
    this.state[name] = false;
    return value;
  }

  snapshot() {
    return {
      throttle: this.state.throttle,
      brake: this.state.brake,
      steering: this.state.steering,
      reset: this.consumeOneShot("reset"),
      camera: this.consumeOneShot("camera"),
      pause: this.consumeOneShot("pause")
    };
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.keys.clear();
    this.pointerState.clear();
  }
}
