import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.min.js";

const CAMERA_MODES = Object.freeze([
  { id: "chase", label: "Chase", distance: 9.2, height: 4.1, lookAhead: 10.5, fov: 58 },
  { id: "close", label: "Close Chase", distance: 6.3, height: 2.7, lookAhead: 8.0, fov: 62 },
  { id: "nose", label: "Cockpit Lite", distance: 0.9, height: 1.15, lookAhead: 15.0, fov: 66 }
]);

function expSmoothing(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export class CameraController {
  constructor(camera, settings = {}) {
    this.camera = camera;
    this.modeIndex = Math.max(0, CAMERA_MODES.findIndex(mode => mode.id === (settings.camera || "chase")));
    this.shake = settings.cameraShake || "low";
    this.positionVelocity = new THREE.Vector3();
    this.smoothedPosition = new THREE.Vector3();
    this.smoothedLook = new THREE.Vector3();
    this.initialized = false;
  }

  get mode() {
    return CAMERA_MODES[this.modeIndex];
  }

  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % CAMERA_MODES.length;
    return this.mode;
  }

  setShake(value) {
    this.shake = value || "low";
  }

  update(vehicleObject, telemetry, dt, input = {}) {
    if (!vehicleObject) return;
    const mode = this.mode;
    const speedRatio = Math.max(0, Math.min(1, Number(telemetry?.speedKph || 0) / 330));
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicleObject.quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    const brakingPitch = Number(input.brake || 0) * 0.18;
    const accelerationPull = Number(input.throttle || 0) * speedRatio * 1.15;
    const targetPosition = vehicleObject.position.clone()
      .addScaledVector(forward, -(mode.distance + accelerationPull))
      .addScaledVector(up, mode.height - brakingPitch)
      .addScaledVector(right, -Number(telemetry?.steering || 0) * 0.16);

    const targetLook = vehicleObject.position.clone()
      .addScaledVector(forward, mode.lookAhead + speedRatio * 5)
      .addScaledVector(up, mode.id === "nose" ? 0.55 : 0.9 - brakingPitch * 0.25);

    if (!this.initialized) {
      this.smoothedPosition.copy(targetPosition);
      this.smoothedLook.copy(targetLook);
      this.initialized = true;
    }

    const positionBlend = expSmoothing(mode.id === "nose" ? 14 : 7.2, dt);
    const lookBlend = expSmoothing(mode.id === "nose" ? 16 : 9.5, dt);
    this.smoothedPosition.lerp(targetPosition, positionBlend);
    this.smoothedLook.lerp(targetLook, lookBlend);

    let shakeAmount = 0;
    if (this.shake === "standard") shakeAmount = 0.027;
    else if (this.shake === "low") shakeAmount = 0.010;
    if (shakeAmount > 0 && speedRatio > 0.25) {
      const time = performance.now() * 0.001;
      this.smoothedPosition.y += Math.sin(time * 35) * shakeAmount * speedRatio;
      this.smoothedPosition.x += Math.sin(time * 23) * shakeAmount * speedRatio;
    }

    this.camera.position.copy(this.smoothedPosition);
    this.camera.lookAt(this.smoothedLook);
    const targetFov = mode.fov + speedRatio * 10;
    this.camera.fov += (targetFov - this.camera.fov) * expSmoothing(3.6, dt);
    this.camera.updateProjectionMatrix();
  }

  reset() {
    this.initialized = false;
  }
}

export { CAMERA_MODES };
