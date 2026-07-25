import assert from "node:assert/strict";
import { TRACKS } from "../tracks/index.js";

assert.equal(TRACKS.length, 3);
assert.equal(new Set(TRACKS.map(track => track.id)).size, 3);
for (const track of TRACKS) {
  assert.equal(track.laps, 5);
  assert.equal(track.sectors.length, 3);
  assert.ok(track.controlPoints.length >= 20);
  assert.ok(track.signatureSections.length >= 5);
  assert.ok(track.brakeMarkers.length >= 3);
}
const filyos = TRACKS.find(track => track.id === "filyos-harbour");
const dragon = TRACKS.find(track => track.id === "dragon-mountain");
const oruc = TRACKS.find(track => track.id === "oruc-reis-coastal");
assert.ok(filyos.width < oruc.width);
assert.ok(dragon.controlPoints.some(point => point.y > 100));
assert.ok(oruc.signatureSections.some(section => section.type === "hairpin"));
assert.ok(filyos.signatureSections.filter(section => ["hairpin","right-angle","chicane"].includes(section.type)).length >= 3);

console.log(JSON.stringify({
  status: "PASS",
  tracks: TRACKS.map(track => ({
    id: track.id,
    controlPoints: track.controlPoints.length,
    signatureSections: track.signatureSections.map(section => section.name)
  }))
}, null, 2));
