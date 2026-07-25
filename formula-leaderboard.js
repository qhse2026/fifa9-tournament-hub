(() => {
  "use strict";

  const NAME_KEY = "fifa9_formula_leaderboard_name_v1";
  const DEVICE_KEY = "fifa9_formula_leaderboard_device_v1";
  const LOCAL_KEY = "fifa9_formula_leaderboard_local_v1";
  const CACHE_MS = 30000;
  const OFFICIAL_VERSION = "44.9.9";
  const ALLOWED_TRACKS = new Set(["oruc-reis","dragon-ring","filyos-street","champion-arena","bosphorus","anatolian","black-sea","med-night"]);

  let selectedTrackId = localStorage.getItem("fifa9_formula_leaderboard_track_v1") || "oruc-reis";
  let rows = [];
  let loading = false;
  let status = "idle";
  let errorMessage = "";
  let lastLoadedAt = 0;
  let lastSubmitted = null;

  const esc = value => String(value ?? "").replace(/[&<>'\"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':"&quot;"}[char]));
  const formatTime = milliseconds => {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value <= 0) return "—";
    const seconds = value / 1000;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${(seconds - minutes * 60).toFixed(3).padStart(6,"0")}`;
  };

  function dispatch() {
    window.dispatchEvent(new CustomEvent("f1-leaderboard-updated", { detail:{ status, trackId:selectedTrackId } }));
  }

  function cloudClient() {
    return window.FIFA_CLOUD?.getClient?.() || null;
  }

  function cloudConfigured() {
    return Boolean(window.FIFA_CLOUD?.isConfigured?.() && cloudClient());
  }

  function deviceKey() {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
  }

  function managerName() {
    return window.FIFA_MANAGER_ROOM?.getActiveCareer?.()?.playerName || "";
  }

  function cloudName() {
    return window.FIFA_CLOUD?.getPlayerProfile?.()?.player_name || "";
  }

  function getPlayerName() {
    return String(cloudName() || localStorage.getItem(NAME_KEY) || managerName() || "Guest Driver").trim().slice(0,40);
  }

  function setPlayerName(value) {
    const clean = String(value || "").replace(/\s+/g," ").trim().slice(0,40);
    if (clean.length >= 2) localStorage.setItem(NAME_KEY, clean);
    dispatch();
    return clean;
  }

  function setTrack(trackId) {
    if (!ALLOWED_TRACKS.has(trackId)) return false;
    selectedTrackId = trackId;
    localStorage.setItem("fifa9_formula_leaderboard_track_v1", trackId);
    rows = [];
    lastLoadedAt = 0;
    status = "idle";
    dispatch();
    return true;
  }

  function localState() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") || {}; }
    catch { return {}; }
  }

  function localRows(trackId) {
    const record = localState()[trackId];
    if (!record) return [];
    return [{
      rank:1,
      player_name:record.playerName,
      best_lap_ms:record.bestLapMs,
      platform:record.platform,
      control_mode:record.controlMode,
      verified:false,
      updated_at:record.updatedAt,
      isLocal:true
    }];
  }

  function saveLocal(payload) {
    const data = localState();
    const current = data[payload.trackId];
    const improved = !current || payload.bestLapMs < Number(current.bestLapMs || Infinity);
    if (improved) {
      data[payload.trackId] = {
        playerName:payload.playerName,
        bestLapMs:payload.bestLapMs,
        platform:payload.platform,
        controlMode:payload.controlMode,
        updatedAt:new Date().toISOString()
      };
      localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
    }
    return { improved, rank:1, bestLapMs:Number(data[payload.trackId]?.bestLapMs || payload.bestLapMs), local:true };
  }

  function platform() {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
    return coarse ? "mobile" : "pc";
  }

  function controlMode() {
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
    return coarse ? "touch" : "keyboard";
  }

  async function refresh(trackId = selectedTrackId, force = false) {
    if (!ALLOWED_TRACKS.has(trackId)) trackId = "oruc-reis";
    selectedTrackId = trackId;
    if (loading) return rows;
    if (!force && lastLoadedAt && Date.now() - lastLoadedAt < CACHE_MS) return rows;
    loading = true;
    status = "loading";
    errorMessage = "";
    dispatch();
    try {
      const client = cloudClient();
      if (!client) {
        rows = localRows(trackId);
        status = window.FIFA_CLOUD?.isConfigured?.() ? "connecting" : "local";
        lastLoadedAt = Date.now();
        return rows;
      }
      const { data, error } = await client.rpc("formula_get_track_leaderboard", { p_track_id:trackId, p_limit:50 });
      if (error) throw error;
      rows = Array.isArray(data) ? data : [];
      status = "online";
      lastLoadedAt = Date.now();
      return rows;
    } catch (error) {
      console.warn("Formula leaderboard could not be loaded", error);
      rows = localRows(trackId);
      const missing = ["42883","PGRST202","42P01"].includes(String(error?.code || "")) || /formula_get_track_leaderboard|does not exist|schema cache/i.test(String(error?.message || ""));
      status = missing ? "setup-required" : "error";
      errorMessage = missing ? "Supabase Track Records SQL dosyası henüz çalıştırılmadı." : (error?.message || "Leaderboard bağlantısı kurulamadı.");
      lastLoadedAt = Date.now();
      return rows;
    } finally {
      loading = false;
      dispatch();
    }
  }

  async function submitOfficialLap(input) {
    const trackId = String(input?.trackId || selectedTrackId);
    const bestLapMs = Math.round(Number(input?.bestLapMs || 0));
    const playerName = String(input?.playerName || getPlayerName()).replace(/\s+/g," ").trim().slice(0,40);
    if (!ALLOWED_TRACKS.has(trackId)) throw new Error("Geçersiz pist.");
    if (playerName.length < 2) throw new Error("Sürücü adı en az 2 karakter olmalı.");
    if (!Number.isFinite(bestLapMs) || bestLapMs < 12000 || bestLapMs > 300000) throw new Error("Geçersiz tur süresi.");
    if (!input?.clean || !input?.official) throw new Error("Yalnızca geçerli Official Time Attack turları sıralamaya gönderilir.");

    setPlayerName(playerName);
    const payload = { trackId, bestLapMs, playerName, platform:platform(), controlMode:controlMode() };
    const client = cloudClient();
    if (!client) {
      const local = saveLocal(payload);
      lastSubmitted = { ...local, trackId, playerName, bestLapMs, status:"local" };
      rows = localRows(trackId);
      status = window.FIFA_CLOUD?.isConfigured?.() ? "connecting" : "local";
      dispatch();
      return lastSubmitted;
    }

    status = "submitting";
    dispatch();
    try {
      const { data, error } = await client.rpc("formula_submit_lap", {
        p_track_id:trackId,
        p_player_name:playerName,
        p_lap_ms:bestLapMs,
        p_platform:payload.platform,
        p_control_mode:payload.controlMode,
        p_device_key:deviceKey(),
        p_session_version:OFFICIAL_VERSION,
        p_clean:true
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      lastSubmitted = {
        trackId,
        playerName,
        bestLapMs:Number(result?.best_lap_ms || bestLapMs),
        rank:Number(result?.rank || 0),
        improved:Boolean(result?.improved),
        status:"online"
      };
      lastLoadedAt = 0;
      await refresh(trackId, true);
      return lastSubmitted;
    } catch (error) {
      console.warn("Official lap upload failed", error);
      const local = saveLocal(payload);
      lastSubmitted = { ...local, trackId, playerName, bestLapMs, status:"local", error:error?.message || "Upload failed" };
      rows = localRows(trackId);
      status = ["42883","PGRST202","42P01"].includes(String(error?.code || "")) ? "setup-required" : "error";
      errorMessage = error?.message || "Tur buluta gönderilemedi; cihaz kaydı korundu.";
      dispatch();
      return lastSubmitted;
    }
  }

  function statusLabel() {
    if (loading || status === "loading") return "DERECELER YÜKLENİYOR";
    if (status === "submitting") return "TUR BULUTA GÖNDERİLİYOR";
    if (status === "online") return "GLOBAL · CANLI";
    if (status === "setup-required") return "SQL KURULUMU GEREKLİ";
    if (status === "connecting") return "BULUT BAĞLANTISI BEKLENİYOR";
    if (status === "error") return "BAĞLANTI HATASI · YEREL KAYIT";
    return "BU CİHAZDAKİ DERECE";
  }

  function renderPanel() {
    const tracks = window.F1_TRACKS?.TRACKS || [];
    const track = window.F1_TRACKS?.getTrack?.(selectedTrackId) || tracks[0];
    const name = getPlayerName();
    const local = localState()[selectedTrackId];
    const myCloudRow = rows.find(row => String(row.player_name || "").toLocaleLowerCase("tr") === name.toLocaleLowerCase("tr"));
    const myBest = myCloudRow?.best_lap_ms || local?.bestLapMs || null;
    const top = rows.slice(0,50);
    const statusClass = ["online","submitting"].includes(status) ? "online" : status === "setup-required" ? "warning" : "local";
    return `<section class="f1-records-hero"><div><span>GLOBAL TRACK RECORDS</span><h2>One circuit. One specification. One fastest lap.</h2><p>Her oyuncu aynı araçla, kuru pistte ve üç flying lap üzerinden yarışır. Yalnızca Official Time Attack oturumundaki geçerli turlar global sıralamaya gönderilir.</p></div><aside class="${statusClass}"><small>CLOUD STATUS</small><strong>${statusLabel()}</strong><span>${top.length} kayıt · ${esc(track?.name || selectedTrackId)}</span></aside></section>
    <section class="f1-record-controls"><label><span>SÜRÜCÜ ADI</span><input id="f1LeaderboardName" maxlength="40" value="${esc(name)}" placeholder="Sürücü adın"></label><div><button class="btn btn-gold" data-f1-action="start-time-attack">Official Time Attack</button><button class="btn btn-ghost" data-f1-action="leaderboard-refresh">Dereceleri Yenile</button></div><small>Cloud oyuncu hesabın varsa isim otomatik olarak doğrulanır. Misafirler cihaz kimliğiyle katılabilir.</small></section>
    <section class="f1-record-track-grid">${tracks.map(item=>`<button class="${item.id===selectedTrackId?"active":""}" data-f1-action="leaderboard-track" data-track="${item.id}"><span>${String(item.layoutCode||"GP").toUpperCase()}</span><strong>${esc(item.name)}</strong><small>${item.country} · ${item.difficulty}</small><b>${item.id===selectedTrackId?formatTime(myBest):"VIEW"}</b></button>`).join("")}</section>
    <section class="f1-record-layout"><article class="f1-panel f1-world-records"><header><div><span>OFFICIAL CLASSIFICATION</span><h3>${esc(track?.name || selectedTrackId)} — Top 50</h3></div><b>${loading?"SYNC":"LIVE"}</b></header>${top.length?`<div class="f1-record-table"><div class="head"><span>POS</span><strong>DRIVER</strong><small>PLATFORM</small><b>BEST LAP</b><em>STATUS</em></div>${top.map((row,index)=>`<div class="${String(row.player_name||"").toLocaleLowerCase("tr")===name.toLocaleLowerCase("tr")?"mine":""}"><span>${Number(row.rank||index+1)}</span><strong>${esc(row.player_name)}</strong><small>${String(row.platform||"pc").toUpperCase()} · ${String(row.control_mode||"keyboard").toUpperCase()}</small><b>${formatTime(row.best_lap_ms)}</b><em>${row.verified?"✓ VERIFIED":"COMMUNITY"}</em></div>`).join("")}</div>`:`<div class="f1-record-empty"><strong>Henüz global derece yok</strong><p>${esc(errorMessage || "İlk Official Time Attack derecesini sen kaydet.")}</p></div>`}</article>
    <aside class="f1-record-sidebar"><article class="f1-panel f1-personal-record"><span>YOUR OFFICIAL BEST</span><strong>${formatTime(myBest)}</strong><small>${myCloudRow?`GLOBAL P${Number(myCloudRow.rank||0)}`:local?"LOCAL RECORD":"NO VALID LAP"}</small>${lastSubmitted?.trackId===selectedTrackId?`<p class="${lastSubmitted.improved?"gain":""}">${lastSubmitted.improved?"NEW PERSONAL BEST":"Previous best remains"}${lastSubmitted.rank?` · Global P${lastSubmitted.rank}`:""}</p>`:""}</article><article class="f1-panel f1-record-rules"><header><span>OFFICIAL RULESET</span><b>V44.9.9</b></header><div><strong>1</strong><p>Out lap + üç flying lap</p></div><div><strong>2</strong><p>Eşit araç: sabit motor, aero ve lastik</p></div><div><strong>3</strong><p>Kuru pist, Soft lastik, tam ERS başlangıcı</p></div><div><strong>4</strong><p>Pist dışı veya reset kullanılan tur geçersiz</p></div><div><strong>5</strong><p>En hızlı geçerli tur otomatik gönderilir</p></div></article></aside></section>`;
  }

  window.addEventListener("fifa-cloud-ready", () => refresh(selectedTrackId, true));

  window.F1_LEADERBOARD = Object.freeze({
    renderPanel,
    refresh,
    submitOfficialLap,
    setTrack,
    getSelectedTrack:() => selectedTrackId,
    getPlayerName,
    setPlayerName,
    getRows:() => rows.map(row=>({...row})),
    getStatus:() => status,
    formatTime,
    cloudConfigured
  });
})();
