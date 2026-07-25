import assert from "node:assert/strict";
import { VehiclePhysics, createSyntheticTrackModel } from "../engine/vehicle-physics.js";

function normalize(angle) {
  let value = angle;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function runCircle(mode) {
  const model = createSyntheticTrackModel({ radius: 24, width: 11, sampleCount: 480 });
  const car = new VehiclePhysics(model, {
    abs: true,
    tractionControl: "medium",
    steeringAssist: "off",
    brakeAssist: "off"
  });
  let offTrackFrames = 0;
  let maxOffset = 0;

  for (let step = 0; step < 60 * 45; step += 1) {
    const sample = model.samples[car.trackIndex];
    const desiredYaw = Math.atan2(sample.tangent.x, sample.tangent.z);
    const headingError = normalize(desiredYaw - car.yaw);
    const centreCorrection = -car.lateralOffset / 5.5;
    const steering = Math.max(-1, Math.min(1, headingError * 2.4 + centreCorrection * 0.75));
    const safeKph = Math.sqrt(1.08 * 9.81 / Math.max(sample.curvature, 0.0001)) * 3.6;
    const speedKph = car.speed * 3.6;
    const brake = mode === "proper" && speedKph > safeKph * 0.94
      ? Math.min(1, (speedKph - safeKph * 0.84) / 80)
      : 0;
    const throttle = mode === "full" ? 1 : (brake > 0 ? 0.05 : 1);
    const telemetry = car.update(1 / 60, { throttle, brake, steering });
    maxOffset = Math.max(maxOffset, Math.abs(telemetry.lateralOffset));
    if (telemetry.trackLimitActive) offTrackFrames += 1;
  }

  return {
    offTrackFrames,
    maxOffset,
    progress: car.unwrappedProgress,
    events: car.trackLimitEvents,
    speedKph: car.speed * 3.6
  };
}

const fullThrottle = runCircle("full");
const properBraking = runCircle("proper");

assert.ok(fullThrottle.events > 0, "Full-throttle hairpin test must create track-limit events.");
assert.equal(properBraking.events, 0, "Proper braking test must remain valid.");
assert.ok(
  properBraking.progress > fullThrottle.progress * 1.35,
  "Proper braking must cover significantly more competitive distance."
);

// Stationary steering must not rotate the car unrealistically.
{
  const model = createSyntheticTrackModel({ radius: 50, width: 12 });
  const car = new VehiclePhysics(model, { steeringAssist: "off" });
  const initialYaw = car.yaw;
  for (let index = 0; index < 180; index += 1) {
    car.update(1 / 60, { throttle: 0, brake: 0, steering: 1 });
  }
  assert.ok(Math.abs(normalize(car.yaw - initialYaw)) < 0.01, "Stationary steering rotated the vehicle.");
}

// Grass must create meaningful speed loss.
{
  const model = createSyntheticTrackModel({ radius: 70, width: 10 });
  const car = new VehiclePhysics(model, { steeringAssist: "off" });
  car.speed = 55;
  car.position.x += 12;
  const before = car.speed;
  for (let index = 0; index < 120; index += 1) {
    car.update(1 / 60, { throttle: 0.3, brake: 0, steering: 0 });
  }
  assert.ok(car.speed < before * 0.55, "Grass did not reduce speed enough.");
}

// Barrier collision must damage the car and remove speed.
{
  const model = createSyntheticTrackModel({ radius: 70, width: 10 });
  const car = new VehiclePhysics(model, { steeringAssist: "off" });
  car.speed = 48;
  const sample = model.samples[0];
  car.position.x = sample.point.x + sample.normal.x * 11;
  car.position.z = sample.point.z + sample.normal.z * 11;
  const before = car.speed;
  car.update(1 / 60, { throttle: 0, brake: 0, steering: 0 });
  assert.ok(car.speed < before * 0.6, "Barrier collision did not remove enough speed.");
  assert.ok(car.damage.frontWing > 0, "Barrier collision did not create front-wing damage.");
}

console.log(JSON.stringify({
  status: "PASS",
  fullThrottle,
  properBraking,
  checks: [
    "full-throttle failure",
    "proper-braking validity",
    "stationary steering",
    "grass grip loss",
    "barrier damage"
  ]
}, null, 2));
