/**
 * Formula Horizon Reborn V45 track data contract.
 *
 * A circuit is authored as a closed list of world-space control points.
 * TrackBuilder converts it to a Catmull-Rom centerline and sampled track model.
 */
export const TRACK_SCHEMA_VERSION = 1;

export function validateTrackDefinition(track) {
  const errors = [];
  if (!track || typeof track !== "object") errors.push("Track definition must be an object.");
  if (!track?.id || !/^[a-z0-9-]+$/.test(track.id)) errors.push("Track id is invalid.");
  if (!Array.isArray(track?.controlPoints) || track.controlPoints.length < 12) {
    errors.push("At least 12 control points are required.");
  }
  if (!Number.isFinite(track?.width) || track.width < 8 || track.width > 20) {
    errors.push("Track width must be between 8 and 20 metres.");
  }
  if (!Array.isArray(track?.sectors) || track.sectors.length !== 3) {
    errors.push("Exactly three sector end fractions are required.");
  }
  if (track?.sectors?.some((value, index, values) =>
    !Number.isFinite(value) || value <= 0 || value > 1 || (index > 0 && value <= values[index - 1])
  )) {
    errors.push("Sector fractions must be strictly increasing between 0 and 1.");
  }
  if (!Array.isArray(track?.signatureSections) || track.signatureSections.length < 3) {
    errors.push("Signature sections are required.");
  }
  return { valid: errors.length === 0, errors };
}

export function point(x, y, z) {
  return Object.freeze({ x: Number(x), y: Number(y), z: Number(z) });
}
