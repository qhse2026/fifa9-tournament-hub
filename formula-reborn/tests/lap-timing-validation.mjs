import assert from "node:assert/strict";
import { LapTiming } from "../engine/lap-timing.js";

const model = {
  track: { sectors: [0.333, 0.666, 1] },
  samples: Array.from({ length: 300 }, (_, index) => ({ index }))
};

const timing = new LapTiming(model, { laps: 5 });
let now = 1000;
timing.start(now, { progress: 0, unwrappedProgress: 0, trackLimitEvents: 0, resetCount: 0 });

for (let lap = 1; lap <= 5; lap += 1) {
  now += 20000;
  timing.update({ progress: 0.34, unwrappedProgress: lap * 300 + 102, trackLimitEvents: 0, resetCount: 0 }, now);
  now += 19000;
  timing.update({ progress: 0.67, unwrappedProgress: lap * 300 + 201, trackLimitEvents: 0, resetCount: 0 }, now);
  now += 21000;
  timing.update({ progress: 0.92, unwrappedProgress: lap * 300 + 276, trackLimitEvents: 0, resetCount: 0 }, now);
  now += 1000;
  timing.update({ progress: 0.02, unwrappedProgress: lap * 300 + 306, trackLimitEvents: 0, resetCount: 0 }, now);
}

const result = timing.result(now);
assert.equal(result.completed, true);
assert.equal(result.laps.length, 5);
assert.equal(result.validLapCount, 5);
assert.ok(result.bestLapMs > 0);
assert.equal(result.fiveLapTotalMs, result.laps.reduce((sum, lap) => sum + lap.timeMs, 0));
assert.deepEqual(result.laps.map(lap => lap.sectors.length), [3, 3, 3, 3, 3]);

console.log(JSON.stringify({ status: "PASS", result }, null, 2));
