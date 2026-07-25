const DEG = Math.PI / 180;
const G = 9.81;

export const PHYSICS_VERSION = "45.0.0-physics-1";
export const OFFICIAL_CAR_SPEC = Object.freeze({
  massKg: 798,
  wheelbaseM: 3.55,
  maxSpeedMps: 92.0,
  engineAcceleration: 13.2,
  brakeDeceleration: 18.5,
  rollingResistance: 0.58,
  aeroDrag: 0.00152,
  carHalfWidth: 0.93,
  carHalfLength: 2.7,
  barrierRestitution: 0.08
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapIndex = (value, count) => ((value % count) + count) % count;
const normalizeAngle = angle => {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
};

function assistValue(settings, key, fallback) {
  return settings?.[key] ?? fallback;
}

function surfaceProfile(surface) {
  switch (surface) {
    case "kerb":
      return { grip: 0.88, rolling: 1.25, acceleration: 0.94 };
    case "runoff":
      return { grip: 0.72, rolling: 2.6, acceleration: 0.62 };
    case "grass":
      return { grip: 0.44, rolling: 4.8, acceleration: 0.28 };
    default:
      return { grip: 1.0, rolling: 1.0, acceleration: 1.0 };
  }
}

export class VehiclePhysics {
  constructor(trackModel, settings = {}) {
    this.trackModel = trackModel;
    this.settings = {
      abs: assistValue(settings, "abs", true),
      tractionControl: assistValue(settings, "tractionControl", "medium"),
      steeringAssist: assistValue(settings, "steeringAssist", "low"),
      brakeAssist: assistValue(settings, "brakeAssist", "off")
    };
    this.spec = OFFICIAL_CAR_SPEC;
    this.reset();
  }

  reset() {
    const start = this.trackModel.samples[0];
    this.position = {
      x: start.point.x,
      y: start.point.y + 0.36,
      z: start.point.z
    };
    this.yaw = Math.atan2(start.tangent.x, start.tangent.z);
    this.speed = 0;
    this.steerInput = 0;
    this.steerAngle = 0;
    this.yawRate = 0;
    this.trackIndex = 0;
    this.lastTrackIndex = 0;
    this.unwrappedProgress = 0;
    this.lateralOffset = 0;
    this.surface = "asphalt";
    this.trackLimitActive = false;
    this.trackLimitTime = 0;
    this.trackLimitEvents = 0;
    this.resetCount = 0;
    this.damage = {
      frontWing: 0,
      steering: 0,
      suspension: 0
    };
    this.collisionCooldown = 0;
    this.maxSpeedMps = 0;
    this.lastTelemetry = null;
  }

  setSettings(settings = {}) {
    Object.assign(this.settings, settings);
  }

  worldForward() {
    return {
      x: Math.sin(this.yaw),
      z: Math.cos(this.yaw)
    };
  }

  classifySurface(absOffset) {
    const track = this.trackModel.track;
    const asphaltEdge = track.width / 2;
    if (absOffset <= asphaltEdge - 0.15) return "asphalt";
    if (absOffset <= asphaltEdge + 0.95) return "kerb";
    if (absOffset <= asphaltEdge + track.runoff) return "runoff";
    return "grass";
  }

  findNearestSample(radius = 54) {
    const samples = this.trackModel.samples;
    const count = samples.length;
    let bestIndex = this.trackIndex;
    let bestDistanceSq = Infinity;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = wrapIndex(this.trackIndex + offset, count);
      const sample = samples[index];
      const dx = this.position.x - sample.point.x;
      const dz = this.position.z - sample.point.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        bestIndex = index;
      }
    }

    return { index: bestIndex, sample: samples[bestIndex], distanceSq: bestDistanceSq };
  }

  updateProgress(nearestIndex) {
    const count = this.trackModel.samples.length;
    let delta = nearestIndex - this.lastTrackIndex;
    if (delta < -count / 2) delta += count;
    if (delta > count / 2) delta -= count;

    // Ignore implausible teleport-like changes.
    if (Math.abs(delta) < count * 0.1) {
      this.unwrappedProgress += delta;
    }
    this.lastTrackIndex = nearestIndex;
    this.trackIndex = nearestIndex;
  }

  applyReset() {
    const sample = this.trackModel.samples[this.trackIndex];
    this.position.x = sample.point.x;
    this.position.y = sample.point.y + 0.36;
    this.position.z = sample.point.z;
    this.yaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.speed = Math.min(this.speed, 8);
    this.yawRate = 0;
    this.steerAngle = 0;
    this.resetCount += 1;
    this.trackLimitEvents += 1;
  }

  update(dt, input) {
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    const nearestBefore = this.findNearestSample();
    const sample = nearestBefore.sample;
    this.updateProgress(nearestBefore.index);

    const dx = this.position.x - sample.point.x;
    const dz = this.position.z - sample.point.z;
    this.lateralOffset = dx * sample.normal.x + dz * sample.normal.z;
    const absOffset = Math.abs(this.lateralOffset);
    this.surface = this.classifySurface(absOffset);
    const surface = surfaceProfile(this.surface);

    const throttle = clamp(Number(input.throttle || 0), 0, 1);
    let brake = clamp(Number(input.brake || 0), 0, 1);
    let steering = clamp(Number(input.steering || 0), -1, 1);
    const speedRatio = clamp(this.speed / this.spec.maxSpeedMps, 0, 1);

    const curveAhead = this.trackModel.samples[wrapIndex(this.trackIndex + 14, this.trackModel.samples.length)].curvature;
    if (this.settings.brakeAssist === "low" && curveAhead > 0.012 && this.speed > 45) {
      brake = Math.max(brake, clamp((curveAhead * this.speed * this.speed - 18) / 22, 0, 0.36));
    }

    if (this.settings.steeringAssist === "low") {
      const lookAhead = Math.max(5, Math.min(22, Math.round(6 + this.speed * 0.18)));
      const targetSample = this.trackModel.samples[wrapIndex(this.trackIndex + lookAhead, this.trackModel.samples.length)];
      const desiredYaw = Math.atan2(targetSample.point.x - this.position.x, targetSample.point.z - this.position.z);
      const headingError = normalizeAngle(desiredYaw - this.yaw);
      const centreCorrection = clamp(-this.lateralOffset / Math.max(4, this.trackModel.track.width), -0.24, 0.24);
      steering = clamp(
        steering + headingError * 0.34 + centreCorrection * (1 - speedRatio * 0.48),
        -1,
        1
      );
    }

    const steeringDamageFactor = 1 - this.damage.steering * 0.55;
    const maxSteerAngle = (30 - speedRatio * 18) * DEG * steeringDamageFactor;
    const targetSteer = steering * maxSteerAngle;
    const steerResponse = 1 - Math.exp(-dt * (7.2 - speedRatio * 2.3));
    this.steerAngle += (targetSteer - this.steerAngle) * steerResponse;
    this.steerInput = steering;

    const tractionMode = this.settings.tractionControl;
    let throttleFactor = 1;
    if (tractionMode === "full") throttleFactor = 0.90;
    else if (tractionMode === "medium") throttleFactor = 0.96;

    const damageSpeedFactor = 1 - this.damage.frontWing * 0.12 - this.damage.suspension * 0.16;
    const engineAcceleration =
      throttle *
      this.spec.engineAcceleration *
      (1 - speedRatio * 0.72) *
      surface.acceleration *
      throttleFactor *
      damageSpeedFactor;

    let brakeEfficiency = this.spec.brakeDeceleration;
    let gripUnderBraking = 1;
    const absEnabled = Boolean(this.settings.abs);
    if (!absEnabled && brake > 0.72 && this.speed > 18) {
      brakeEfficiency *= 0.78;
      gripUnderBraking = 0.56;
    }

    const braking = brake * brakeEfficiency;
    const drag = this.spec.aeroDrag * this.speed * this.speed;
    const rolling = this.spec.rollingResistance * surface.rolling;
    this.speed += (engineAcceleration - braking - drag - rolling) * dt;
    this.speed = clamp(this.speed, 0, this.spec.maxSpeedMps * damageSpeedFactor);
    this.maxSpeedMps = Math.max(this.maxSpeedMps, this.speed);

    const baseGrip = this.trackModel.track.surfaceGrip * surface.grip * gripUnderBraking;
    const kerbInstability = this.surface === "kerb" ? 0.84 : 1;
    const effectiveGrip = baseGrip * kerbInstability * (1 - this.damage.suspension * 0.24);

    const desiredYawRate =
      this.speed > 0.5
        ? (this.speed / this.spec.wheelbaseM) * Math.tan(this.steerAngle)
        : 0;

    // Lateral acceleration cannot exceed tyre grip. This is what makes
    // high-speed hairpins impossible without braking.
    const maxGripYawRate = (effectiveGrip * 9.81) / Math.max(this.speed, 4.5);
    const actualTargetYawRate = clamp(desiredYawRate, -maxGripYawRate, maxGripYawRate);
    const yawResponse = 1 - Math.exp(-dt * (5.8 * effectiveGrip + 0.6));
    this.yawRate += (actualTargetYawRate - this.yawRate) * yawResponse;

    const overDemand = Math.max(0, Math.abs(desiredYawRate) - maxGripYawRate);
    const mildOversteer =
      tractionMode === "off" &&
      throttle > 0.72 &&
      Math.abs(steering) > 0.52 &&
      this.speed > 18
        ? Math.sign(steering) * throttle * 0.12
        : 0;

    this.yaw += (this.yawRate + mildOversteer * overDemand) * dt;

    const forward = this.worldForward();
    this.position.x += forward.x * this.speed * dt;
    this.position.z += forward.z * this.speed * dt;

    // Follow track elevation without magnetically correcting lateral position.
    const nearestAfter = this.findNearestSample();
    this.position.y += ((nearestAfter.sample.point.y + 0.36) - this.position.y) * (1 - Math.exp(-dt * 8));
    this.updateProgress(nearestAfter.index);

    const afterDx = this.position.x - nearestAfter.sample.point.x;
    const afterDz = this.position.z - nearestAfter.sample.point.z;
    this.lateralOffset = afterDx * nearestAfter.sample.normal.x + afterDz * nearestAfter.sample.normal.z;
    const afterAbsOffset = Math.abs(this.lateralOffset);
    this.surface = this.classifySurface(afterAbsOffset);

    const track = this.trackModel.track;
    const trackLimitThreshold = track.width / 2 + 0.75;
    if (afterAbsOffset > trackLimitThreshold) {
      this.trackLimitTime += dt;
      if (!this.trackLimitActive && this.trackLimitTime > 0.11) {
        this.trackLimitActive = true;
        this.trackLimitEvents += 1;
      }
    } else if (afterAbsOffset < track.width / 2 + 0.25) {
      this.trackLimitTime = 0;
      this.trackLimitActive = false;
    }

    // Barrier collision.
    const barrierOffset = track.width / 2 + track.runoff + 0.55;
    if (afterAbsOffset > barrierOffset && this.collisionCooldown <= 0) {
      const side = Math.sign(this.lateralOffset) || 1;
      this.position.x = nearestAfter.sample.point.x + nearestAfter.sample.normal.x * side * barrierOffset;
      this.position.z = nearestAfter.sample.point.z + nearestAfter.sample.normal.z * side * barrierOffset;
      const impact = this.speed;
      this.speed *= impact > 35 ? 0.22 : 0.45;
      this.yaw = Math.atan2(nearestAfter.sample.tangent.x, nearestAfter.sample.tangent.z) + side * 0.14;
      this.damage.frontWing = clamp(this.damage.frontWing + impact / 230, 0, 1);
      this.damage.steering = clamp(this.damage.steering + impact / 380, 0, 1);
      this.damage.suspension = clamp(this.damage.suspension + impact / 520, 0, 1);
      this.collisionCooldown = 0.9;
    }

    this.lastTelemetry = {
      speedMps: this.speed,
      speedKph: this.speed * 3.6,
      throttle,
      brake,
      steering,
      steerAngle: this.steerAngle,
      yawRate: this.yawRate,
      desiredYawRate,
      maxGripYawRate,
      understeer: Math.abs(desiredYawRate) > Math.abs(maxGripYawRate) * 1.02,
      surface: this.surface,
      lateralOffset: this.lateralOffset,
      trackIndex: this.trackIndex,
      unwrappedProgress: this.unwrappedProgress,
      progress: wrapIndex(this.trackIndex, this.trackModel.samples.length) / this.trackModel.samples.length,
      trackLimitActive: this.trackLimitActive,
      trackLimitEvents: this.trackLimitEvents,
      resetCount: this.resetCount,
      damage: { ...this.damage },
      maxSpeedKph: this.maxSpeedMps * 3.6
    };

    return this.lastTelemetry;
  }
}

export function createSyntheticTrackModel({ radius = 45, width = 12, sampleCount = 480 } = {}) {
  const samples = [];
  let distance = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const angle = (index / sampleCount) * Math.PI * 2;
    const nextAngle = ((index + 1) / sampleCount) * Math.PI * 2;
    const point = { x: Math.sin(angle) * radius, y: 0, z: Math.cos(angle) * radius };
    const next = { x: Math.sin(nextAngle) * radius, y: 0, z: Math.cos(nextAngle) * radius };
    const tangentLength = Math.hypot(next.x - point.x, next.z - point.z) || 1;
    const tangent = { x: (next.x - point.x) / tangentLength, y: 0, z: (next.z - point.z) / tangentLength };
    const normal = { x: tangent.z, y: 0, z: -tangent.x };
    samples.push({
      index,
      point,
      tangent,
      normal,
      curvature: 1 / radius,
      distance,
      progress: index / sampleCount
    });
    distance += tangentLength;
  }
  return {
    track: {
      id: "synthetic",
      width,
      runoff: 3,
      surfaceGrip: 1.12
    },
    samples,
    totalDistance: distance
  };
}
