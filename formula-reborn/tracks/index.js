import { ORUC_REIS_COASTAL } from "./oruc-reis-coastal.js";
import { FILYOS_HARBOUR } from "./filyos-harbour.js";
import { DRAGON_MOUNTAIN } from "./dragon-mountain.js";
import { validateTrackDefinition } from "./track-schema.js";

export const TRACKS = Object.freeze([
  ORUC_REIS_COASTAL,
  FILYOS_HARBOUR,
  DRAGON_MOUNTAIN
]);

for (const track of TRACKS) {
  const result = validateTrackDefinition(track);
  if (!result.valid) {
    throw new Error(`Invalid Formula Reborn track ${track.id}: ${result.errors.join(" ")}`);
  }
}

export function getTrack(trackId) {
  return TRACKS.find(track => track.id === trackId) || TRACKS[0];
}
