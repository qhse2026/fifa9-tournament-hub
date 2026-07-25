const LOCAL_KEY = "fifa9_formula_reborn_v45_records";
const DEVICE_KEY = "fifa9_formula_reborn_v45_device";

function client() {
  return window.FIFA_CLOUD?.getClient?.() || null;
}

function user() {
  return window.FIFA_CLOUD?.getUser?.() || null;
}

function profile() {
  return window.FIFA_CLOUD?.getPlayerProfile?.() || null;
}

function deviceKey() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `fr45-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function localState() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveLocalState(state) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}

export function getDriverName(fallback = "") {
  return String(profile()?.player_name || fallback || localStorage.getItem("fifa9_formula_reborn_v45_driver") || "Guest Driver")
    .trim()
    .slice(0, 40);
}

export function setDriverName(name) {
  const value = String(name || "").replace(/\s+/g, " ").trim().slice(0, 40);
  if (value.length >= 2) localStorage.setItem("fifa9_formula_reborn_v45_driver", value);
  return value;
}

export function saveLocalRecord(trackId, payload) {
  const state = localState();
  const current = state[trackId] || {};
  const improvedLap = Number.isFinite(payload.bestLapMs) &&
    (!Number.isFinite(current.bestLapMs) || payload.bestLapMs < current.bestLapMs);
  const improvedTotal = Number.isFinite(payload.fiveLapTotalMs) &&
    (!Number.isFinite(current.fiveLapTotalMs) || payload.fiveLapTotalMs < current.fiveLapTotalMs);

  state[trackId] = {
    ...current,
    trackId,
    playerName: payload.playerName,
    bestLapMs: improvedLap ? payload.bestLapMs : current.bestLapMs ?? null,
    fiveLapTotalMs: improvedTotal ? payload.fiveLapTotalMs : current.fiveLapTotalMs ?? null,
    attempts: Number(current.attempts || 0) + 1,
    validLapCount: Math.max(Number(current.validLapCount || 0), Number(payload.validLapCount || 0)),
    updatedAt: new Date().toISOString()
  };
  saveLocalState(state);
  return { improvedLap, improvedTotal, record: state[trackId] };
}

export function getLocalRecord(trackId) {
  return localState()[trackId] || null;
}

export async function startCloudSession(trackId) {
  const supabase = client();
  if (!supabase) return { token: null, cloud: false };
  try {
    const { data, error } = await supabase.rpc("formula_v45_start_session", {
      p_track_id: trackId,
      p_device_key: deviceKey()
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { token: row?.session_token || null, cloud: true };
  } catch (error) {
    console.warn("Formula V45 session token unavailable", error);
    return { token: null, cloud: false, error: String(error?.message || error) };
  }
}

export async function submitSession(payload, validation) {
  const local = saveLocalRecord(payload.trackId, {
    playerName: payload.playerName,
    bestLapMs: payload.bestLapMs,
    fiveLapTotalMs: payload.fiveLapTotalMs,
    validLapCount: payload.validLapCount
  });

  const supabase = client();
  if (!supabase) return { status: "local", ...local, reviewStatus: validation.status };

  try {
    const { data, error } = await supabase.rpc("formula_v45_submit_session", {
      p_session_token: payload.startToken,
      p_track_id: payload.trackId,
      p_player_name: payload.playerName,
      p_best_lap_ms: payload.bestLapMs,
      p_five_lap_total_ms: payload.fiveLapTotalMs,
      p_sector_bests: payload.sectorBests,
      p_valid_lap_count: payload.validLapCount,
      p_platform: matchMedia("(pointer:coarse)").matches ? "mobile" : "pc",
      p_control_type: matchMedia("(pointer:coarse)").matches ? "touch" : "keyboard",
      p_assists: payload.settings,
      p_physics_version: payload.physicsVersion,
      p_track_version: payload.trackVersion,
      p_session_version: payload.sessionVersion,
      p_reset_count: payload.resetCount,
      p_track_limit_events: payload.trackLimitEvents,
      p_max_speed_kph: payload.maxSpeedKph,
      p_input_checksum: payload.inputChecksum,
      p_session_hash: payload.sessionHash,
      p_local_validation_status: validation.status,
      p_device_key: deviceKey()
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      status: "online",
      ...local,
      lapRank: Number(row?.lap_rank || 0),
      totalRank: Number(row?.total_rank || 0),
      reviewStatus: row?.review_status || validation.status,
      verified: Boolean(row?.verified)
    };
  } catch (error) {
    console.warn("Formula V45 cloud submission failed", error);
    return {
      status: "local",
      ...local,
      reviewStatus: validation.status,
      error: String(error?.message || error)
    };
  }
}

export async function fetchLeaderboard(trackId, metric = "lap", filters = {}) {
  const supabase = client();
  if (!supabase) {
    const record = getLocalRecord(trackId);
    if (!record) return { status: "local", rows: [] };
    const time = metric === "total" ? record.fiveLapTotalMs : record.bestLapMs;
    return {
      status: "local",
      rows: time ? [{
        rank: 1,
        player_name: record.playerName || "Local Driver",
        time_ms: time,
        platform: "local",
        control_type: "device",
        verified: false,
        review_status: "local",
        attempts: record.attempts || 1,
        updated_at: record.updatedAt
      }] : []
    };
  }

  try {
    const { data, error } = await supabase.rpc("formula_v45_get_leaderboard", {
      p_track_id: trackId,
      p_metric: metric,
      p_platform: filters.platform || null,
      p_control_type: filters.controlType || null,
      p_verified_only: Boolean(filters.verifiedOnly),
      p_limit: 50
    });
    if (error) throw error;
    return { status: "online", rows: Array.isArray(data) ? data : [] };
  } catch (error) {
    console.warn("Formula V45 leaderboard unavailable", error);
    return { status: "error", rows: [], error: String(error?.message || error) };
  }
}
