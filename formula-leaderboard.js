(() => {
  "use strict";

  const VERSION = "44.10.0";
  const NAME_KEY = "fifa9_horizon25_driver_name_v1";
  const DEVICE_KEY = "fifa9_horizon25_device_v1";
  const LOCAL_KEY = "fifa9_horizon25_local_records_v1";
  const TRACK_KEY = "fifa9_horizon25_selected_track_v1";
  const METRIC_KEY = "fifa9_horizon25_metric_v1";
  const ALLOWED_TRACKS = new Set(window.F1_TRACKS.TRACKS.map(track => track.id));

  let selectedTrackId = localStorage.getItem(TRACK_KEY) || window.F1_TRACKS.TRACKS[0].id;
  let selectedMetric = localStorage.getItem(METRIC_KEY) || "lap";
  let rows = [];
  let status = "idle";
  let errorMessage = "";
  let loading = false;
  let lastLoadedAt = 0;
  let lastLoadedKey = "";

  const esc = value => String(value ?? "").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));

  function formatTime(ms) {
    return window.F1_RACE_ENGINE.formatTime(ms);
  }

  function cloudClient() {
    return window.FIFA_CLOUD?.getClient?.() || null;
  }

  function deviceKey() {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `h25-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY,value);
    }
    return value;
  }

  function cloudName() {
    return window.FIFA_CLOUD?.getPlayerProfile?.()?.player_name || "";
  }

  function managerName() {
    return window.FIFA_MANAGER_ROOM?.getActiveCareer?.()?.playerName || "";
  }

  function getPlayerName() {
    return String(cloudName() || localStorage.getItem(NAME_KEY) || managerName() || "Guest Driver").trim().slice(0,40);
  }

  function setPlayerName(value) {
    const name = String(value || "").replace(/\s+/g," ").trim().slice(0,40);
    if (name.length >= 2) localStorage.setItem(NAME_KEY,name);
    return name;
  }

  function localState() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  function saveLocal(payload) {
    const state = localState();
    const current = state[payload.trackId] || {};
    const improvedLap = Number.isFinite(payload.bestLapMs) && (!current.bestLapMs || payload.bestLapMs < current.bestLapMs);
    const improvedTotal = Number.isFinite(payload.fiveLapMs) && (!current.fiveLapMs || payload.fiveLapMs < current.fiveLapMs);
    state[payload.trackId] = {
      playerName:payload.playerName,
      bestLapMs:improvedLap ? payload.bestLapMs : current.bestLapMs || null,
      fiveLapMs:improvedTotal ? payload.fiveLapMs : current.fiveLapMs || null,
      cleanLapCount:Math.max(Number(current.cleanLapCount || 0),Number(payload.cleanLapCount || 0)),
      updatedAt:new Date().toISOString()
    };
    localStorage.setItem(LOCAL_KEY,JSON.stringify(state));
    return {
      improvedLap,
      improvedTotal,
      bestLapMs:state[payload.trackId].bestLapMs,
      fiveLapMs:state[payload.trackId].fiveLapMs
    };
  }

  function getLocalRecord(trackId) {
    return localState()[trackId] || null;
  }

  function setTrack(trackId) {
    if (!ALLOWED_TRACKS.has(trackId)) return;
    selectedTrackId = trackId;
    localStorage.setItem(TRACK_KEY,trackId);
  }

  function setMetric(metric) {
    selectedMetric = metric === "total" ? "total" : "lap";
    localStorage.setItem(METRIC_KEY,selectedMetric);
  }

  function localRows(trackId,metric) {
    const record = getLocalRecord(trackId);
    if (!record) return [];
    const timeMs = metric === "total" ? record.fiveLapMs : record.bestLapMs;
    if (!timeMs) return [];
    return [{
      rank:1,
      player_name:record.playerName || getPlayerName(),
      time_ms:Number(timeMs),
      platform:"local",
      control_mode:"device",
      verified:false,
      updated_at:record.updatedAt,
      local:true
    }];
  }

  async function refresh(trackId = selectedTrackId,metric = selectedMetric,force = false) {
    setTrack(trackId);
    setMetric(metric);
    const cacheKey = `${selectedTrackId}|${selectedMetric}`;
    if (loading) return rows;
    if (!force && lastLoadedKey === cacheKey && Date.now() - lastLoadedAt < 30000) return rows;
    loading = true;
    status = "loading";
    errorMessage = "";
    window.dispatchEvent(new CustomEvent("f1-leaderboard-updated"));
    try {
      const client = cloudClient();
      if (!client) {
        rows = localRows(selectedTrackId,selectedMetric);
        status = "local";
        return rows;
      }
      const {data,error} = await client.rpc("formula_sprint_get_leaderboard",{
        p_track_id:selectedTrackId,
        p_metric:selectedMetric,
        p_limit:50
      });
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      status = "online";
      lastLoadedKey = cacheKey;
      lastLoadedAt = Date.now();
      return rows;
    } catch (error) {
      console.warn("Formula Horizon leaderboard unavailable",error);
      rows = localRows(selectedTrackId,selectedMetric);
      const missing = ["42883","PGRST202","42P01"].includes(String(error?.code || "")) || /formula_sprint_get_leaderboard|does not exist|schema cache/i.test(String(error?.message || ""));
      status = missing ? "setup-required" : "error";
      errorMessage = missing ? "Supabase Formula Horizon 25 SQL dosyası henüz çalıştırılmadı." : String(error?.message || "Global sıralama yüklenemedi.");
      lastLoadedKey = cacheKey;
      lastLoadedAt = Date.now();
      return rows;
    } finally {
      loading = false;
      window.dispatchEvent(new CustomEvent("f1-leaderboard-updated"));
    }
  }

  function platform() {
    return typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches ? "mobile" : "pc";
  }

  function controlMode() {
    return typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches ? "touch" : "keyboard";
  }

  async function submitResult(input) {
    const trackId = String(input?.trackId || "");
    const playerName = setPlayerName(input?.playerName || getPlayerName());
    const bestLapMs = input?.bestLapMs == null ? null : (Number.isFinite(Number(input.bestLapMs)) ? Math.round(Number(input.bestLapMs)) : null);
    const fiveLapMs = Math.round(Number(input?.fiveLapMs || 0));
    const cleanLapCount = clampClean(input?.cleanLapCount);

    if (!ALLOWED_TRACKS.has(trackId)) throw new Error("Geçersiz pist.");
    if (playerName.length < 2) throw new Error("Sürücü adı en az iki karakter olmalı.");
    if (!input?.official || !input?.completed) throw new Error("Yalnızca tamamlanmış resmi 5 tur sonuçları gönderilir.");
    if (!Number.isFinite(fiveLapMs) || fiveLapMs < 60000 || fiveLapMs > 2400000) throw new Error("Geçersiz 5 tur süresi.");
    if (bestLapMs !== null && (bestLapMs < 10000 || bestLapMs > 360000)) throw new Error("Geçersiz en hızlı tur.");

    const payload = {trackId,playerName,bestLapMs,fiveLapMs,cleanLapCount};
    const local = saveLocal(payload);
    const client = cloudClient();
    if (!client) return {...local,status:"local",lapRank:1,totalRank:1};

    try {
      const {data,error} = await client.rpc("formula_sprint_submit_result",{
        p_track_id:trackId,
        p_player_name:playerName,
        p_best_lap_ms:bestLapMs,
        p_five_lap_ms:fiveLapMs,
        p_clean_laps:cleanLapCount,
        p_platform:platform(),
        p_control_mode:controlMode(),
        p_device_key:deviceKey(),
        p_session_version:VERSION,
        p_completed:true
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      return {
        status:"online",
        improvedLap:Boolean(result?.improved_lap),
        improvedTotal:Boolean(result?.improved_total),
        bestLapMs:Number(result?.best_lap_ms || bestLapMs || 0) || null,
        fiveLapMs:Number(result?.five_lap_ms || fiveLapMs),
        lapRank:Number(result?.lap_rank || 0),
        totalRank:Number(result?.total_rank || 0),
        verified:Boolean(result?.verified)
      };
    } catch (error) {
      console.warn("Formula Horizon result upload failed",error);
      return {...local,status:"local",error:String(error?.message || "Bulut kaydı başarısız.")};
    }
  }

  function clampClean(value) {
    return Math.max(0,Math.min(5,Math.round(Number(value || 0))));
  }

  function renderTable() {
    if (status === "loading") return '<div class="fh25-record-message">Global sıralama yükleniyor…</div>';
    if (status === "setup-required") return `<div class="fh25-record-message warning"><strong>Bulut kurulumu gerekli</strong><span>${esc(errorMessage)}</span></div>`;
    if (!rows.length) return '<div class="fh25-record-message"><strong>Henüz derece yok</strong><span>Bu pistte global listeye giren ilk sürücü ol.</span></div>';

    return `<div class="fh25-leaderboard-table">
      <header><span>POS</span><b>DRIVER</b><em>${selectedMetric === "lap" ? "FASTEST LAP" : "5 LAP TOTAL"}</em><small>DEVICE</small></header>
      ${rows.map(row=>`<div class="${row.local?"local":""}">
        <span>${Number(row.rank || 0) || "—"}</span>
        <b>${esc(row.player_name)}${row.verified?'<i>VERIFIED</i>':""}</b>
        <em>${formatTime(row.time_ms)}</em>
        <small>${esc(row.platform || "—")} · ${esc(row.control_mode || "—")}</small>
      </div>`).join("")}
    </div>`;
  }

  window.F1_LEADERBOARD = Object.freeze({
    refresh,
    submitResult,
    renderTable,
    setTrack,
    setMetric,
    setPlayerName,
    getPlayerName,
    getSelectedTrack:()=>selectedTrackId,
    getSelectedMetric:()=>selectedMetric,
    getLocalRecord,
    getStatus:()=>status,
    getRows:()=>rows.slice()
  });
})();
