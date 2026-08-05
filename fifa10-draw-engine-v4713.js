(() => {
  "use strict";

  const VERSION = "3.2.0";
  const BUILD = '576000';
  const STORAGE_KEY = "fifa-tournament-hub-v1";
  const SYNC_HISTORY_KEY = "fifa10-sync-history-v1";
  const GROUPS = Object.freeze(["A", "B", "C"]);
  const LEG_STARS = Object.freeze([4, 4.5, 5]);
  const MIN_PLAYERS = 12;
  const MAX_PLAYERS = 15;
  const NEW_PLAYER_ELO = 1350;
  const REFRESH_MS = 15000;

  let payload = null;
  let registrations = [];
  let realtimeChannel = null;
  let renderQueued = false;
  let moduleBusy = false;
  let autoDrawing = false;
  let activeTab = sessionStorage.getItem("fifa10-draw-active-tab") || "championship";
  let fixtureGroupFilter = sessionStorage.getItem("fifa10-fixture-group") || "A";
  let fixtureLegFilter = Number(sessionStorage.getItem("fifa10-fixture-leg") || 0);
  let lastLoadAt = 0;
  let observer = null;
  let lastRenderSignature = "";
  let operationNotice = { type: "info", text: "Kura sonuçlarını elle girebilir veya otomatik kura başlatabilirsiniz." };
  let manualEntryOverlayOpen = false;
  let manualEntryLoading = false;
  let manualEntryOverlayError = "";
  let selectedPlayerRef = new URL(location.href).searchParams.get("fifa10player") || sessionStorage.getItem("fifa10-selected-player") || "";
  let rivalPlayerRef = sessionStorage.getItem("fifa10-rival-player") || "";
  let quickPlayerFilter = sessionStorage.getItem("fifa10-quick-player") || "";
  let scheduleMatchMinutes = Math.max(8, Math.min(30, Number(localStorage.getItem("fifa10-schedule-minutes") || 15)));
  let tvModeOpen = false;
  let tvClockTimer = null;
  let renderDeferredWhileModal = false;
  let cloudSyncTail = Promise.resolve();

  const escapeHTML = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const normalize = value => String(value || "")
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const uiCopy = (tr, en) => window.FIFA_I18N?.language === "en" ? en : tr;

  const teamPoolKey = stars => String(Number(stars));
  const teamPool = stars => {
    const source = window.FIFA10_TEAM_POOLS?.[teamPoolKey(stars)];
    return Array.isArray(source) ? [...source] : [];
  };
  const allowedTeamName = (stars, team) => {
    const target = normalize(team);
    return Boolean(target) && teamPool(stars).some(name => normalize(name) === target);
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const nowISO = () => new Date().toISOString();
  const rowId = () => window.FIFA_CLOUD_CONFIG?.tournamentRowId || "fifa-9";
  const cloudConfigured = () => Boolean(window.FIFA_CLOUD?.isConfigured?.());
  const isAdmin = () => !cloudConfigured() || Boolean(window.FIFA_CLOUD?.isAdmin?.());
  const cloudClient = () => window.FIFA_CLOUD?.getClient?.() || null;

  function readSyncHistory() {
    try {
      const rows = JSON.parse(localStorage.getItem(SYNC_HISTORY_KEY) || "[]");
      return Array.isArray(rows) ? rows.slice(0, 30) : [];
    } catch (_) {
      return [];
    }
  }

  function recordSyncEvent(status, message = "", messageEn = "") {
    const rows = readSyncHistory();
    rows.unshift({
      id: `F10-SYNC-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      status,
      message,
      messageEn,
      at: nowISO()
    });
    localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(rows.slice(0, 30)));
  }

  function syncStatusMeta(event = readSyncHistory()[0]) {
    if (!event) return {
      key: "idle",
      label: uiCopy("CİHAZ HAZIR", "DEVICE READY"),
      detail: uiCopy("Henüz bu cihazda yeni kayıt yapılmadı.", "No new save has been made on this device yet.")
    };
    if (event.status === "cloud") return {
      key: "cloud",
      label: uiCopy("BULUT GÜNCEL", "CLOUD UP TO DATE"),
      detail: uiCopy(event.message || "Canlı siteye kaydedildi.", event.messageEn || "Saved to the live site.")
    };
    if (event.status === "error") return {
      key: "error",
      label: uiCopy("BULUT BEKLİYOR", "CLOUD PENDING"),
      detail: uiCopy(event.message || "Cihaz kaydı güvende; bulut yeniden denenebilir.", event.messageEn || "The device save is safe; cloud sync can be retried.")
    };
    return {
      key: "local",
      label: uiCopy("CİHAZDA KAYITLI", "SAVED ON DEVICE"),
      detail: uiCopy(event.message || "Cihaz kaydı tamamlandı.", event.messageEn || "Device save completed.")
    };
  }

  function secureRandomInt(max) {
    const size = Number(max) || 0;
    if (size <= 1) return 0;
    const range = 0x100000000;
    const limit = Math.floor(range / size) * size;
    const values = new Uint32Array(1);
    let value = 0;
    do {
      crypto.getRandomValues(values);
      value = values[0];
    } while (value >= limit);
    return value % size;
  }

  function secureShuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const swapIndex = secureRandomInt(index + 1);
      [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
    }
    return output;
  }

  function randomToken(length = 6) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length }, () => alphabet[secureRandomInt(alphabet.length)]).join("");
  }

  function projectedGroupSizes(total) {
    const safeTotal = Math.max(0, Number(total) || 0);
    const completePots = Math.floor(safeTotal / GROUPS.length);
    const partial = safeTotal % GROUPS.length;
    return GROUPS.map((_, index) => completePots + (index < partial ? 1 : 0)).sort((a, b) => b - a);
  }

  function groupDistributionCopy(total) {
    const sizes = projectedGroupSizes(total);
    const fiveCount = sizes.filter(size => size === 5).length;
    if (fiveCount === 0) return "Üç grup da 4 oyunculu olur.";
    if (fiveCount === 1) return "Son torbadaki oyuncunun çekildiği grup 5 oyunculu olur.";
    if (fiveCount === 2) return "Son torbadaki iki oyuncunun çekildiği iki grup 5 oyunculu olur.";
    return "Üç grup da 5 oyunculu olur.";
  }

  function deepClone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function stableHash(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    let result = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      result ^= text.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  }

  function ensurePayloadShape(source) {
    const next = source && typeof source === "object" ? source : {};
    next.seasonSystem ||= {};
    next.seasonSystem.fifa10Draft ||= {};
    const draft = next.seasonSystem.fifa10Draft;
    draft.players = Array.isArray(draft.players) ? draft.players : [];
    draft.settings ||= {};
    draft.settings.formatId = "triple-circuit-v2-live-draw";
    draft.settings.formatName = "FIFA 10 Triple Circuit · Live Draw";
    draft.settings.potCount = 5;
    draft.settings.groupCount = 3;
    draft.settings.newPlayerBaseElo = NEW_PLAYER_ELO;
    draft.settings.rankingPrimary = "ppg";
    draft.settings.rankingTieBreakers = ["goalDifferencePerMatch", "goalsForTotal", "winRate", "drawLot"];
    draft.settings.goalDifferenceCap = null;
    draft.settings.goalDifferenceMode = "per-match-uncapped";
    draft.settings.groupRounds = [
      { id: "round-1", label: "1. Devre", stars: 4 },
      { id: "round-2", label: "2. Devre", stars: 4.5 },
      { id: "round-3", label: "3. Devre", stars: 5 }
    ];
    draft.settings.teamPoolVersion = window.FIFA10_TEAM_POOL_VERSION || "FC26-2026.07-MEN-ONLY";
    draft.settings.fixedTeamPools = true;
    draft.settings.preventTeamRepeat = true;
    draft.blackBox = Array.isArray(draft.blackBox) ? draft.blackBox : [];
    draft.forecastLedger = Array.isArray(draft.forecastLedger) ? draft.forecastLedger : [];
    draft.milestoneLedger = Array.isArray(draft.milestoneLedger) ? draft.milestoneLedger : [];
    return next;
  }

  function getDraft(source = payload) {
    return ensurePayloadShape(source).seasonSystem.fifa10Draft;
  }

  function getDraw(source = payload) {
    return getDraft(source).draw || null;
  }

  function officialSnapshot(source) {
    const draft = getDraft(source);
    return {
      capturedAt: nowISO(),
      draw: draft.draw ? deepClone(draft.draw) : null,
      championshipOS: draft.championshipOS ? deepClone(draft.championshipOS) : null,
      officialAwards: draft.officialAwards ? deepClone(draft.officialAwards) : null
    };
  }

  function blackBoxDeviceId() {
    const key = "fifa10-black-box-device-id";
    let value = localStorage.getItem(key);
    if (!value) {
      value = `DEVICE-${Date.now().toString(36).toUpperCase()}-${randomToken(4)}`;
      localStorage.setItem(key, value);
    }
    return value;
  }

  function championshipCompletedCount(state) {
    return Object.values(state?.rounds || {}).flat()
      .flatMap(series => series.matches || [])
      .filter(match => match.completed).length;
  }

  function officialSnapshotHash(snapshot) {
    return stableHash({
      draw: snapshot?.draw || null,
      championshipOS: snapshot?.championshipOS || null,
      officialAwards: snapshot?.officialAwards || null
    });
  }

  function recordBlackBoxTransition(nextPayload, previousPayload, reason = "") {
    const draft = getDraft(nextPayload);
    const snapshot = officialSnapshot(nextPayload);
    const previousSnapshot = previousPayload ? officialSnapshot(previousPayload) : null;
    const hash = officialSnapshotHash(snapshot);
    const previousHash = previousSnapshot ? officialSnapshotHash(previousSnapshot) : "";
    const latest = draft.blackBox[draft.blackBox.length - 1];
    if (hash === previousHash || latest?.hash === hash) return;
    draft.blackBox.push({
      id: `F10-BB-${Date.now().toString(36).toUpperCase()}-${randomToken(4)}`,
      at: nowISO(),
      reason: String(reason || uiCopy("Resmî turnuva verisi güncellendi.", "Official tournament data updated.")),
      actor: isAdmin() ? "admin" : "operator",
      deviceId: blackBoxDeviceId(),
      hash,
      previousHash,
      groupResults: snapshot.draw?.fixtures?.filter(match => match.completed).length || 0,
      championshipResults: championshipCompletedCount(snapshot.championshipOS),
      snapshot
    });
    if (draft.blackBox.length > 120) draft.blackBox.splice(0, draft.blackBox.length - 120);
  }

  function syncPayloadFromApplication() {
    const applicationState = window.FIFA_APP_CONTEXT?.getState?.();
    if (!applicationState || typeof applicationState !== "object") return;
    const applicationUpdatedAt = drawUpdatedAt(applicationState);
    const engineUpdatedAt = drawUpdatedAt(payload);
    if (!payload || applicationUpdatedAt > engineUpdatedAt) {
      payload = ensurePayloadShape(deepClone(applicationState));
      lastLoadAt = Date.now();
    }
  }

  function localPayload() {
    try {
      return ensurePayloadShape(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch (_) {
      return ensurePayloadShape({});
    }
  }

  function drawUpdatedAt(source) {
    const value = getDraw(source)?.updatedAt || getDraft(source)?.updatedAt || "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : 0;
  }

  async function fetchPayload() {
    const local = localPayload();
    const client = cloudClient();
    if (client && cloudConfigured()) {
      try {
        const { data, error } = await client
          .from("tournament_state")
          .select("payload, updated_at")
          .eq("id", rowId())
          .maybeSingle();
        if (error) throw error;
        const remote = ensurePayloadShape(data?.payload || {});
        // A newer local tournament operation must never be erased by a stale cloud response.
        payload = drawUpdatedAt(local) > drawUpdatedAt(remote) ? local : remote;
      } catch (error) {
        console.warn("FIFA 10 cloud payload could not be loaded; local operations remain active.", error);
        payload = local;
        operationNotice = { type: "warning", text: `Bulut verisi okunamadı. Bu cihazdaki turnuva kaydı kullanılacak: ${error?.message || error}` };
      }
    } else {
      payload = local;
    }
    lastLoadAt = Date.now();
    return payload;
  }

  function resolvedRegistrationElo(item) {
    const stored = Number(item?.elo);
    if (Number.isFinite(stored) && stored > 0) return stored;
    return (item?.source || "existing") === "new" ? NEW_PLAYER_ELO : 1500;
  }

  async function fetchRegistrations() {
    try {
      if (window.FIFA10_REGISTRATION_CLOUD?.isConfigured?.()) {
        registrations = await window.FIFA10_REGISTRATION_CLOUD.list();
      } else {
        registrations = (getDraft().players || []).map(item => ({
          id: item.id,
          playerName: item.playerName || item.name,
          elo: resolvedRegistrationElo(item),
          source: item.source || "existing",
          registeredAt: item.registeredAt || null
        }));
      }
    } catch (error) {
      console.warn("FIFA 10 draw engine could not load registrations", error);
      registrations = (getDraft().players || []).map(item => ({
        id: item.id,
        playerName: item.playerName || item.name,
        elo: resolvedRegistrationElo(item),
        source: item.source || "existing",
        registeredAt: item.registeredAt || null
      }));
    }
    return registrations;
  }

  function registrationRows() {
    return registrations
      .map((item, index) => ({
        id: String(item.id || `F10-REG-${index + 1}`),
        name: String(item.playerName || item.player_name || item.name || "").replace(/\s+/g, " ").trim(),
        elo: resolvedRegistrationElo(item),
        source: item.source || "existing",
        registeredAt: item.registeredAt || item.registered_at || null
      }))
      .filter(item => item.name)
      .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, "tr"))
      .map((item, index) => ({ ...item, pot: Math.floor(index / GROUPS.length) + 1 }));
  }

  function snapshotPlayers(draw = getDraw()) {
    const rows = Array.isArray(draw?.participants) && draw.participants.length
      ? draw.participants
      : registrationRows();
    return rows.map((item, index) => ({
      id: String(item.id || `F10-P-${index + 1}`),
      name: String(item.name || item.playerName || "").trim(),
      elo: resolvedRegistrationElo(item),
      pot: Number(item.pot) || Math.floor(index / GROUPS.length) + 1,
      tieBreakOrder: Number(item.tieBreakOrder) || index + 1
    })).filter(item => item.name);
  }

  function playerMap(draw = getDraw()) {
    return new Map(snapshotPlayers(draw).map(item => [item.id, item]));
  }

  function potRows(draw = getDraw()) {
    const rows = snapshotPlayers(draw);
    return Array.from({ length: 5 }, (_, index) => rows.filter(item => item.pot === index + 1));
  }

  function currentGroups(draw = getDraw()) {
    const map = playerMap(draw);
    const groups = {};
    GROUPS.forEach(group => {
      groups[group] = (draw?.groups?.[group] || [])
        .map(id => map.get(id))
        .filter(Boolean);
    });
    return groups;
  }

  function createDrawState(rows) {
    const tieOrder = secureShuffle(rows.map(item => item.id));
    const tieIndex = new Map(tieOrder.map((id, index) => [id, index + 1]));
    const participants = rows.map((item, index) => ({
      ...item,
      pot: Math.floor(index / GROUPS.length) + 1,
      tieBreakOrder: tieIndex.get(item.id) || index + 1
    }));
    return {
      version: 1,
      drawId: `F10-${Date.now().toString(36).toUpperCase()}-${randomToken(5)}`,
      status: "ready",
      createdAt: nowISO(),
      updatedAt: nowISO(),
      completedAt: null,
      groupStageCompletedAt: null,
      participants,
      groups: { A: [], B: [], C: [] },
      assignments: [],
      fixtures: [],
      lastReveal: null,
      fivePlayerGroup: null,
      rankingRule: {
        primary: "PPG",
        tieBreakers: ["Goal Difference Per Match", "Goals For Per Match", "Win Rate", "Draw Lot"],
        goalDifferenceCap: null
      }
    };
  }

  function resultModalOpen() {
    return Boolean(document.getElementById("f10DrawModal"));
  }

  function cloudSyncWithTimeout(snapshot, message = "") {
    if (!cloudConfigured() || !isAdmin() || !window.FIFA_CLOUD?.save) return Promise.resolve(false);
    const run = async () => {
      let timer = null;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Bulut senkronizasyonu zaman aşımına uğradı; cihaz kaydı güvende.")), 7000);
        });
        await Promise.race([window.FIFA_CLOUD.save(deepClone(snapshot)), timeout]);
        recordSyncEvent(
          "cloud",
          message ? `${message} Canlı siteye kaydedildi.` : "Canlı siteye kaydedildi.",
          message ? "The operation was saved to the live site." : "Saved to the live site."
        );
        operationNotice = { type: "success", text: `${message || "İşlem"} Canlı siteye kaydedildi.` };
        scheduleRender();
        return true;
      } catch (error) {
        recordSyncEvent(
          "error",
          `Cihaz kaydı güvende; bulut bekliyor: ${error?.message || error}`,
          `The device save is safe; cloud sync is pending: ${error?.message || error}`
        );
        operationNotice = { type: "warning", text: `${message || "İşlem"} Bu cihazda kaydedildi; bulut senkronizasyonu arka planda bekliyor.` };
        console.warn("FIFA 10 background cloud sync deferred; local save remains authoritative.", error);
        scheduleRender();
        return false;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };
    cloudSyncTail = cloudSyncTail.then(run, run);
    return cloudSyncTail;
  }

  async function savePayload(nextPayload, message = "") {
    const next = ensurePayloadShape(nextPayload);
    const previous = payload ? deepClone(payload) : null;
    try {
      window.FIFA_EVOLUTION_OS?.captureMilestoneEvents?.(next, previous);
    } catch (error) {
      console.warn("Milestone transition capture was skipped; official save continues.", error);
    }
    try {
      window.FIFA_CHAMPIONSHIP_OS?.captureForecastSnapshot?.(next, previous);
    } catch (error) {
      console.warn("Forecast ledger snapshot was skipped; official save continues.", error);
    }
    recordBlackBoxTransition(next, previous, message);
    payload = next;
    // Operational rule: device commit is authoritative and must never wait for the network.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    recordSyncEvent(
      "local",
      message ? `${message} Cihaz kaydı tamamlandı.` : "Cihaz kaydı tamamlandı.",
      message ? "The operation was saved on this device." : "Device save completed."
    );
    const applicationState = window.FIFA_APP_CONTEXT?.getState?.();
    if (applicationState && typeof applicationState === "object" && applicationState !== next) {
      Object.keys(applicationState).forEach(key => delete applicationState[key]);
      Object.assign(applicationState, deepClone(next));
      window.FIFA_APP_CONTEXT?.cacheState?.();
      // Do not repaint the whole page underneath an open result modal.
      if (!resultModalOpen()) window.FIFA_APP_CONTEXT?.refreshView?.();
      else renderDeferredWhileModal = true;
    }
    if (!resultModalOpen()) scheduleRender();
    else renderDeferredWhileModal = true;
    if (manualEntryOverlayOpen) syncManualGroupOverlay();

    if (message) {
      operationNotice = cloudConfigured() && isAdmin()
        ? { type: "info", text: `${message} Bu cihazda kaydedildi; bulut senkronizasyonu arka planda sürüyor.` }
        : { type: "success", text: `${message} Bu cihazda kaydedildi.` };
      notify("Sonuç cihazda kaydedildi.", "success");
    }

    // Cloud is intentionally fire-and-forget. It has its own serial queue and timeout.
    void cloudSyncWithTimeout(next, message);
    return next;
  }

  async function mutatePayload(mutator, message = "") {
    if (moduleBusy) throw new Error("Önceki işlem hâlâ devam ediyor. Lütfen birkaç saniye bekleyin.");
    moduleBusy = true;
    try {
      if (!payload || Date.now() - lastLoadAt > REFRESH_MS) await fetchPayload();
      const next = deepClone(payload);
      ensurePayloadShape(next);
      await mutator(next);
      await savePayload(next, message);
    } catch (error) {
      console.error("FIFA 10 draw engine mutation failed", error);
      notify(String(error?.message || error || "İşlem tamamlanamadı."), "error");
      throw error;
    } finally {
      moduleBusy = false;
      scheduleRender();
    }
  }

  function validateChampionshipState(state, draw = getDraw()) {
    const schemaVersion = Number(state?.version);
    if (!state || typeof state !== "object" || ![1, 2].includes(schemaVersion)) {
      throw new Error(uiCopy("Championship verisi geçerli değil.", "The Championship state is invalid."));
    }
    const serialized = JSON.stringify(state);
    if (serialized.length > 650000) {
      throw new Error(uiCopy("Championship verisi güvenli boyut sınırını aşıyor.", "The Championship state exceeds the safe size limit."));
    }
    const participantIds = new Set((draw?.participants || []).map(player => String(player.id)));
    const rounds = Object.values(state.rounds || {}).flat();
    rounds.forEach(series => {
      [series.homeId, series.awayId].filter(Boolean).forEach(id => {
        if (!participantIds.has(String(id))) {
          throw new Error(uiCopy("Championship eşleşmesinde bilinmeyen oyuncu bulundu.", "An unknown player was found in a Championship pairing."));
        }
      });
      (series.matches || []).forEach(match => {
        if (![4, 4.5, 5].includes(Number(match.stars))) {
          throw new Error(uiCopy("Championship maçında geçersiz yıldız seviyesi bulundu.", "An invalid star tier was found in a Championship match."));
        }
        if (match.completed) {
          const homeScore = Number(match.homeScore);
          const awayScore = Number(match.awayScore);
          if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore === awayScore) {
            throw new Error(uiCopy("Eleme maçlarında geçerli ve eşit olmayan skor gerekir.", "Knockout matches require valid, non-tied scores."));
          }
        }
      });
    });
    return true;
  }

  async function saveChampionshipState(state, reason = "") {
    if (!isAdmin()) throw new Error(uiCopy("Bu işlem için yönetici yetkisi gerekir.", "Administrator access is required for this operation."));
    validateChampionshipState(state);
    await mutatePayload(next => {
      const draft = getDraft(next);
      validateChampionshipState(state, draft.draw);
      draft.championshipOS = deepClone(state);
      draft.championshipOS.updatedAt = nowISO();
      draft.updatedAt = nowISO();
      if (draft.draw) draft.draw.updatedAt = nowISO();
    }, reason || uiCopy("Championship operasyonu kaydedildi.", "Championship operation saved."));
    return deepClone(getDraft().championshipOS);
  }

  async function restoreBlackBoxEvent(eventId) {
    if (!isAdmin()) throw new Error(uiCopy("Bu işlem için yönetici yetkisi gerekir.", "Administrator access is required for this operation."));
    await mutatePayload(next => {
      const draft = getDraft(next);
      const event = draft.blackBox.find(item => item.id === eventId);
      if (!event?.snapshot) throw new Error(uiCopy("Geri yükleme noktası bulunamadı.", "The recovery point could not be found."));
      const snapshot = deepClone(event.snapshot);
      draft.draw = snapshot.draw || null;
      if (snapshot.championshipOS) draft.championshipOS = snapshot.championshipOS;
      else delete draft.championshipOS;
      if (snapshot.officialAwards) draft.officialAwards = snapshot.officialAwards;
      else delete draft.officialAwards;
      draft.updatedAt = nowISO();
      if (draft.draw) draft.draw.updatedAt = nowISO();
    }, uiCopy("Tournament Black Box geri yükleme noktası uygulandı.", "Tournament Black Box recovery point restored."));
    return deepClone(getDraft());
  }

  async function prepareDraw() {
    await fetchRegistrations();
    const rows = registrationRows();
    if (rows.length < MIN_PLAYERS || rows.length > MAX_PLAYERS) {
      throw new Error(`Kura için ${MIN_PLAYERS}–${MAX_PLAYERS} oyuncu gerekir. Mevcut kayıt: ${rows.length}.`);
    }
    await mutatePayload(next => {
      const draft = getDraft(next);
      draft.players = rows.map(item => ({
        id: item.id,
        name: item.name,
        elo: item.elo,
        source: item.source,
        registeredAt: item.registeredAt
      }));
      draft.settings.registrationOpen = false;
      draft.settings.potsLocked = true;
      draft.status = "draw-ready";
      draft.draw = createDrawState(rows);
      draft.updatedAt = nowISO();
    }, "Kayıtlar kilitlendi. FIFA 10 grup kurası hazır.");
    activeTab = "draw";
    persistViewState();
  }

  function startManualGroupEntry() {
    manualEntryOverlayOpen = true;
    manualEntryLoading = false;
    manualEntryOverlayError = "";
    try {
      const rows = registrationRows();
      if (rows.length < MIN_PLAYERS || rows.length > MAX_PLAYERS) {
        throw new Error(`Grup girişi için ${MIN_PLAYERS}–${MAX_PLAYERS} oyuncu gerekir. Mevcut kayıt: ${rows.length}.`);
      }
      const next = deepClone(payload || localPayload());
      ensurePayloadShape(next);
      const draft = getDraft(next);
      draft.players = rows.map(item => ({ id:item.id, name:item.name, elo:item.elo, source:item.source, registeredAt:item.registeredAt }));
      draft.settings.registrationOpen = false;
      draft.settings.potsLocked = true;
      draft.status = "manual-groups";
      const draw = createDrawState(rows);
      draw.status = "manual-entry";
      draw.entryMode = "manual";
      draft.draw = draw;
      draft.updatedAt = nowISO();
      payload = next;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      activeTab = "draw";
      persistViewState();
      syncManualGroupOverlay();
      scheduleRender();
      savePayload(next, "Manuel grup giriş ekranı açıldı.").catch(error => {
        console.error("Manual group entry cloud sync failed; local entry remains active.", error);
      });
    } catch (error) {
      manualEntryOverlayError = String(error?.message || error || "Grup giriş ekranı açılamadı.");
      syncManualGroupOverlay();
      throw error;
    }
  }

  function expectedGroupSizePattern(total) {
    return projectedGroupSizes(total).sort((a,b)=>a-b).join("-");
  }

  function currentGroupSizePattern(draw) {
    return GROUPS.map(group => (draw?.groups?.[group] || []).length).sort((a,b)=>a-b).join("-");
  }

  async function assignManualGroup(playerId, group) {
    if (!GROUPS.includes(group)) throw new Error("Geçerli bir grup seçin.");
    await mutatePayload(next => {
      const draft = getDraft(next);
      const draw = draft.draw;
      if (!draw || draw.status !== "manual-entry") throw new Error("Manuel grup giriş modu açık değil.");
      const player = snapshotPlayers(draw).find(item => item.id === playerId);
      if (!player) throw new Error("Oyuncu bulunamadı.");
      const occupiedSamePot = (draw.groups[group] || []).map(id => snapshotPlayers(draw).find(item => item.id === id)).find(item => item && item.id !== playerId && item.pot === player.pot);
      if (occupiedSamePot) throw new Error(`Grup ${group} içinde Torba ${player.pot} oyuncusu zaten var: ${occupiedSamePot.name}.`);
      GROUPS.forEach(key => { draw.groups[key] = (draw.groups[key] || []).filter(id => id !== playerId); });
      draw.groups[group].push(playerId);
      const old = (draw.assignments || []).filter(item => item.playerId !== playerId);
      old.push({ sequence: old.length + 1, pot: player.pot, playerId, playerName: player.name, elo: player.elo, group, eligibleGroups: GROUPS, revealedAt: nowISO(), manual: true });
      draw.assignments = old.map((item,index)=>({ ...item, sequence:index+1 }));
      draw.lastReveal = draw.assignments.at(-1) || null;
      draw.updatedAt = nowISO();
      draft.updatedAt = nowISO();
    }, `${playerName(playerId)} Grup ${group} olarak kaydedildi.`);
  }

  async function finalizeManualGroups() {
    await mutatePayload(next => {
      const draft = getDraft(next);
      const draw = draft.draw;
      if (!draw || draw.status !== "manual-entry") throw new Error("Manuel grup giriş modu açık değil.");
      const players = snapshotPlayers(draw);
      const assigned = GROUPS.flatMap(group => draw.groups[group] || []);
      if (assigned.length !== players.length || new Set(assigned).size !== players.length) {
        throw new Error(`Bütün oyuncuları bir gruba yerleştirin. Yerleşen: ${new Set(assigned).size}/${players.length}.`);
      }
      const expected = expectedGroupSizePattern(players.length);
      const actual = currentGroupSizePattern(draw);
      if (expected !== actual) {
        throw new Error(`Grup büyüklükleri dengeli değil. Beklenen dağılım ${projectedGroupSizes(players.length).join("-")}; mevcut ${GROUPS.map(group => draw.groups[group].length).join("-")}.`);
      }
      finalizeDrawState(draw);
      draw.entryMode = "manual";
      draft.status = "groups-ready";
      draft.updatedAt = nowISO();
    }, "Gruplar kesinleştirildi ve üç devreli fikstür oluşturuldu.");
    activeTab = "groups";
    persistViewState();
    closeManualGroupOverlay();
  }

  async function switchToManualEntry() {
    const existing = getDraw();
    if (existing?.fixtures?.some(match => match.completed)) throw new Error("Sonuç girilmiş fikstürde grup düzenleme açılamaz.");
    if (existing?.assignments?.length && !window.confirm("Mevcut kura taslağı silinip çekilen gruplar elle girilecek. Devam edilsin mi?")) return;
    manualEntryOverlayOpen = true;
    manualEntryLoading = true;
    manualEntryOverlayError = "";
    syncManualGroupOverlay();
    try {
      await mutatePayload(next => {
        const draft = getDraft(next);
        const rows = snapshotPlayers(draft.draw);
        const draw = createDrawState(rows);
        draw.status = "manual-entry";
        draw.entryMode = "manual";
        draft.draw = draw;
        draft.status = "manual-groups";
        draft.settings.registrationOpen = false;
        draft.settings.potsLocked = true;
        draft.updatedAt = nowISO();
      }, "Manuel grup giriş ekranına geçildi.");
      activeTab = "draw";
      persistViewState();
    } catch (error) {
      manualEntryOverlayError = String(error?.message || error || "Grup giriş ekranı açılamadı.");
      throw error;
    } finally {
      manualEntryLoading = false;
      syncManualGroupOverlay();
    }
  }

  function unassignedPlayers(draw) {
    const used = new Set((draw.assignments || []).map(item => item.playerId));
    return snapshotPlayers(draw).filter(item => !used.has(item.id));
  }

  function finalizeDrawState(draw) {
    draw.status = "completed";
    draw.completedAt = nowISO();
    draw.updatedAt = nowISO();
    const groups = currentGroups(draw);
    draw.fivePlayerGroups = GROUPS.filter(group => groups[group].length === 5);
    draw.fivePlayerGroup = draw.fivePlayerGroups[0] || null;
    draw.fixtures = generateFixtures(draw);
    draw.lastReveal = draw.assignments.at(-1) || null;
    return draw;
  }

  async function drawNext({ silent = false } = {}) {
    if (!isAdmin()) throw new Error("Kura çekimini yalnızca turnuva yöneticisi yapabilir.");
    await mutatePayload(next => {
      const draft = getDraft(next);
      const draw = draft.draw;
      if (!draw) throw new Error("Önce kura hazırlığını başlatın.");
      if (draw.status === "completed") throw new Error("Kura zaten tamamlandı.");
      const remaining = unassignedPlayers(draw);
      if (!remaining.length) {
        finalizeDrawState(draw);
        draft.status = "groups-ready";
        draft.updatedAt = nowISO();
        return;
      }
      const currentPot = Math.min(...remaining.map(item => item.pot));
      const potPlayers = remaining.filter(item => item.pot === currentPot);
      const selectedPlayer = potPlayers[secureRandomInt(potPlayers.length)];
      const usedGroups = new Set((draw.assignments || []).filter(item => item.pot === currentPot).map(item => item.group));
      const eligibleGroups = GROUPS.filter(group => !usedGroups.has(group));
      if (!eligibleGroups.length) throw new Error(`Torba ${currentPot} için uygun grup kalmadı.`);
      const selectedGroup = eligibleGroups[secureRandomInt(eligibleGroups.length)];
      const assignment = {
        sequence: (draw.assignments?.length || 0) + 1,
        pot: currentPot,
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.name,
        elo: selectedPlayer.elo,
        group: selectedGroup,
        eligibleGroups,
        revealedAt: nowISO()
      };
      draw.assignments ||= [];
      draw.groups ||= { A: [], B: [], C: [] };
      draw.assignments.push(assignment);
      draw.groups[selectedGroup].push(selectedPlayer.id);
      draw.lastReveal = assignment;
      draw.status = "drawing";
      draw.updatedAt = nowISO();
      const after = unassignedPlayers(draw);
      if (!after.length) {
        finalizeDrawState(draw);
        draft.status = "groups-ready";
      } else {
        draft.status = "drawing";
      }
      draft.updatedAt = nowISO();
    }, silent ? "" : "Kura sonucu canlı sisteme işlendi.");
  }

  async function startAutoDraw() {
    if (autoDrawing) {
      autoDrawing = false;
      notify("Otomatik kura durduruldu.", "info");
      scheduleRender();
      return;
    }
    autoDrawing = true;
    scheduleRender();
    try {
      while (autoDrawing) {
        const draw = getDraw();
        if (!draw || draw.status === "completed") break;
        await drawNext({ silent: true });
        await sleep(950);
      }
      if (getDraw()?.status === "completed") notify("FIFA 10 grup kurası tamamlandı ve fikstür oluşturuldu.", "success");
    } catch (_) {
      autoDrawing = false;
    } finally {
      autoDrawing = false;
      scheduleRender();
    }
  }

  async function resetDraw({ reopenRegistration = false } = {}) {
    const draw = getDraw();
    const hasResults = Boolean(draw?.fixtures?.some(match => match.completed));
    if (hasResults) throw new Error("Sonuç girilmiş bir kura sıfırlanamaz. Önce sonuçları temizleyin.");
    const message = reopenRegistration
      ? "Kura silinecek ve kayıtlar yeniden açılacak. Devam edilsin mi?"
      : "Kura aynı katılımcılarla baştan çekilecek. Devam edilsin mi?";
    if (!window.confirm(message)) return;
    await mutatePayload(next => {
      const draft = getDraft(next);
      if (reopenRegistration) {
        delete draft.draw;
        draft.settings.registrationOpen = true;
        draft.settings.potsLocked = false;
        draft.status = "registration";
      } else {
        const rows = snapshotPlayers(draft.draw);
        draft.draw = createDrawState(rows);
        draft.settings.registrationOpen = false;
        draft.settings.potsLocked = true;
        draft.status = "draw-ready";
      }
      draft.updatedAt = nowISO();
    }, reopenRegistration ? "Kura silindi; kayıt merkezi yeniden açıldı." : "Kura sıfırlandı; yeni çekim hazır.");
  }

  function roundRobinRounds(playerIds) {
    const list = [...playerIds];
    if (list.length % 2 === 1) list.push(null);
    const size = list.length;
    const rounds = [];
    let rotation = [...list];
    for (let round = 0; round < size - 1; round += 1) {
      const pairs = [];
      for (let index = 0; index < size / 2; index += 1) {
        const first = rotation[index];
        const second = rotation[size - 1 - index];
        if (first && second) pairs.push([first, second]);
      }
      rounds.push(pairs);
      rotation = [rotation[0], rotation[size - 1], ...rotation.slice(1, size - 1)];
    }
    return rounds;
  }

  function generateFixtures(draw) {
    const fixtures = [];
    let globalSequence = 0;
    GROUPS.forEach(group => {
      const ids = [...(draw.groups?.[group] || [])];
      const baseRounds = roundRobinRounds(ids);
      LEG_STARS.forEach((stars, legIndex) => {
        baseRounds.forEach((pairs, roundIndex) => {
          pairs.forEach((pair, pairIndex) => {
            let [home, away] = pair;
            if (legIndex === 1 || (legIndex === 2 && (roundIndex + pairIndex) % 2 === 1)) [home, away] = [away, home];
            globalSequence += 1;
            fixtures.push({
              id: `F10-G${group}-L${legIndex + 1}-R${roundIndex + 1}-M${pairIndex + 1}`,
              sequence: globalSequence,
              group,
              leg: legIndex + 1,
              legLabel: `${legIndex + 1}. Devre`,
              stars,
              matchday: roundIndex + 1,
              homeId: home,
              awayId: away,
              homeScore: null,
              awayScore: null,
              homeTeam: "",
              awayTeam: "",
              completed: false,
              updatedAt: null
            });
          });
        });
      });
    });
    return fixtures;
  }

  function completedFixtures(draw = getDraw()) {
    return (draw?.fixtures || []).filter(match => match.completed && Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)));
  }

  function championshipStatFixtures(draw = getDraw()) {
    const state = getDraft()?.championshipOS || null;
    if (!state?.rounds) return [];
    const roundOrder = { playin: 1, quarterfinal: 2, semifinal: 3, bronze: 4, final: 5 };
    const output = [];
    Object.entries(state.rounds).forEach(([roundKey, seriesRows]) => {
      (Array.isArray(seriesRows) ? seriesRows : []).forEach((series, seriesIndex) => {
        (series?.matches || []).forEach((match, matchIndex) => {
          const completed = Boolean(match?.completed)
            && !match?.notRequired
            && Number.isFinite(Number(match?.homeScore))
            && Number.isFinite(Number(match?.awayScore));
          if (!completed || !series?.homeId || !series?.awayId) return;
          output.push({
            ...match,
            id: match.id || `F10-KO-${series.id || roundKey}-${matchIndex + 1}`,
            phase: "fifa10-championship",
            championshipRound: series.round || roundKey,
            seriesId: series.id || "",
            seriesLabel: series.label || series.id || roundKey,
            seriesGame: Number(match.number || matchIndex + 1),
            sequence: 1000 + (roundOrder[series.round || roundKey] || 9) * 100 + seriesIndex * 10 + Number(match.number || matchIndex + 1),
            homeId: series.homeId,
            awayId: series.awayId,
            homeScore: Number(match.homeScore),
            awayScore: Number(match.awayScore),
            homeTeam: String(match.homeTeam || "").trim(),
            awayTeam: String(match.awayTeam || "").trim(),
            stars: Number(match.stars) || null,
            bestOf: Number(series.bestOf || 3),
            completed: true,
            updatedAt: match.updatedAt || series.updatedAt || state.updatedAt || null
          });
        });
      });
    });
    return output;
  }

  function officialStatFixtures(draw = getDraw()) {
    const output = [];
    const seen = new Set();
    [...completedFixtures(draw), ...championshipStatFixtures(draw)].forEach(match => {
      const key = String(match?.id || `${match?.phase || "match"}-${match?.homeId}-${match?.awayId}-${match?.sequence || output.length}`);
      if (seen.has(key)) return;
      seen.add(key);
      output.push(match);
    });
    return output.sort((a, b) => {
      const ta = Date.parse(a?.updatedAt || "");
      const tb = Date.parse(b?.updatedAt || "");
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      return Number(a?.sequence || 0) - Number(b?.sequence || 0);
    });
  }

  function teamPassportStageLabel(match) {
    if (match?.phase === "fifa10-championship") {
      const labels = {
        playin: "PLAY-IN",
        quarterfinal: "ÇEYREK FİNAL",
        semifinal: "YARI FİNAL",
        bronze: "3. LÜK",
        final: "FİNAL"
      };
      const round = match.championshipRound || "championship";
      const game = Number(match.seriesGame || match.number || 1);
      const singleMatch = Number(match.bestOf) === 1 || round === "bronze" || round === "final";
      return `${labels[round] || "CHAMPIONSHIP"}${match.seriesLabel ? ` · ${match.seriesLabel}` : ""}${singleMatch ? "" : ` · M${game}`}`;
    }
    return `GRUP ${match?.group || "–"} · ${match?.legLabel || `${match?.leg || "–"}. DEVRE`}`;
  }

  function standings(draw = getDraw()) {
    if (!draw) return [];
    const players = snapshotPlayers(draw);
    const groupByPlayer = new Map();
    GROUPS.forEach(group => (draw.groups?.[group] || []).forEach(id => groupByPlayer.set(id, group)));
    const table = new Map(players.map(player => [player.id, {
      id: player.id,
      name: player.name,
      elo: player.elo,
      group: groupByPlayer.get(player.id) || "–",
      tieBreakOrder: player.tieBreakOrder || 999,
      mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, ppg: 0
    }]));
    completedFixtures(draw).forEach(match => {
      const home = table.get(match.homeId);
      const away = table.get(match.awayId);
      if (!home || !away) return;
      const hs = Number(match.homeScore);
      const as = Number(match.awayScore);
      home.mp += 1; away.mp += 1;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      if (hs > as) { home.w += 1; away.l += 1; home.pts += 3; }
      else if (hs < as) { away.w += 1; home.l += 1; away.pts += 3; }
      else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
    });
    const rows = [...table.values()].map(row => {
      const gd = row.gf - row.ga;
      return {
        ...row,
        gd,
        ppg: row.mp ? row.pts / row.mp : 0,
        gdPerMatch: row.mp ? gd / row.mp : 0,
        gfPerMatch: row.mp ? row.gf / row.mp : 0,
        gaPerMatch: row.mp ? row.ga / row.mp : 0,
        winRate: row.mp ? row.w / row.mp : 0
      };
    });
    rows.sort(compareStandingsRows);
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function compareStandingsRows(a, b) {
    for (const metric of ["ppg", "gdPerMatch", "gf", "winRate"]) {
      const difference = Number(b?.[metric] || 0) - Number(a?.[metric] || 0);
      if (Math.abs(difference) > 1e-9) return difference;
    }
    return Number(a?.tieBreakOrder || 999) - Number(b?.tieBreakOrder || 999);
  }

  function groupStandings(group, draw = getDraw()) {
    const ids = new Set(draw?.groups?.[group] || []);
    return standings(draw)
      .filter(row => ids.has(row.id))
      .sort(compareStandingsRows)
      .map((row, index) => ({ ...row, groupRank: index + 1 }));
  }

  function qualificationLabel(rank) {
    if (rank <= 4) return { key: "direct", label: "DOĞRUDAN QF" };
    if (rank <= 12) return { key: "playin", label: "CHAMPIONSHIP PLAY-IN" };
    return { key: "eliminated", label: "DOĞRUDAN ELENDİ" };
  }

  function teamUsedBy(draw, playerId, team, excludeMatchId = "") {
    const target = normalize(team);
    if (!target) return false;
    return officialStatFixtures(draw).some(match => {
      if (match.id === excludeMatchId) return false;
      if (String(match.homeId) === String(playerId) && normalize(match.homeTeam) === target) return true;
      if (String(match.awayId) === String(playerId) && normalize(match.awayTeam) === target) return true;
      return false;
    });
  }

  function usedTeamsForPlayer(draw, playerId, stars = null, excludeMatchId = "") {
    const used = new Set();
    officialStatFixtures(draw).forEach(match => {
      if (match.id === excludeMatchId) return;
      if (stars !== null && Number(match.stars) !== Number(stars)) return;
      if (String(match.homeId) === String(playerId) && match.homeTeam) used.add(normalize(match.homeTeam));
      if (String(match.awayId) === String(playerId) && match.awayTeam) used.add(normalize(match.awayTeam));
    });
    return used;
  }

  function teamSelectOptions(draw, fixture, playerId, selectedTeam) {
    const selectedKey = normalize(selectedTeam);
    const used = usedTeamsForPlayer(draw, playerId, fixture.stars, fixture.id);
    const options = teamPool(fixture.stars).map(team => {
      const key = normalize(team);
      const selected = key === selectedKey;
      const blocked = used.has(key) && !selected;
      return `<option value="${escapeHTML(team)}" ${selected ? "selected" : ""} ${blocked ? "disabled data-player-blocked=\"1\"" : ""}>${escapeHTML(team)}${blocked ? " · KULLANILDI" : ""}</option>`;
    });
    if (selectedTeam && !allowedTeamName(fixture.stars, selectedTeam)) {
      options.unshift(`<option value="${escapeHTML(selectedTeam)}" selected>${escapeHTML(selectedTeam)} · HAVUZ DIŞI ESKİ KAYIT</option>`);
    }
    return `<option value="">${fixture.stars}★ takım seçin</option>${options.join("")}`;
  }

  async function saveResult(form) {
    const data = new FormData(form);
    const fixtureId = String(data.get("fixtureId") || "");
    const homeScore = Number(data.get("homeScore"));
    const awayScore = Number(data.get("awayScore"));
    const homeTeam = String(data.get("homeTeam") || "").replace(/\s+/g, " ").trim();
    const awayTeam = String(data.get("awayTeam") || "").replace(/\s+/g, " ").trim();
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0 || homeScore > 99 || awayScore > 99) {
      throw new Error("Skorlar 0–99 arasında tam sayı olmalıdır.");
    }
    await mutatePayload(next => {
      const draft = getDraft(next);
      const draw = draft.draw;
      if (!draw?.fixtures) throw new Error("Fikstür bulunamadı.");
      const fixture = draw.fixtures.find(item => item.id === fixtureId);
      if (!fixture) throw new Error("Maç bulunamadı.");
      if (!homeTeam || !awayTeam) throw new Error("İki oyuncunun takımı da sabit havuzdan seçilmelidir.");
      if (!allowedTeamName(fixture.stars, homeTeam) || !allowedTeamName(fixture.stars, awayTeam)) {
        throw new Error(`Bu maçta yalnızca ${fixture.stars}★ takım havuzundaki kulüpler kullanılabilir.`);
      }
      if (normalize(homeTeam) === normalize(awayTeam)) throw new Error("Aynı maçta iki oyuncu aynı kulübü kullanamaz.");
      if (homeTeam && teamUsedBy(draw, fixture.homeId, homeTeam, fixture.id)) throw new Error("Ev sahibi bu takımı turnuvada daha önce kullandı.");
      if (awayTeam && teamUsedBy(draw, fixture.awayId, awayTeam, fixture.id)) throw new Error("Deplasman oyuncusu bu takımı turnuvada daha önce kullandı.");
      fixture.homeScore = homeScore;
      fixture.awayScore = awayScore;
      fixture.homeTeam = homeTeam;
      fixture.awayTeam = awayTeam;
      fixture.completed = true;
      fixture.updatedAt = nowISO();
      draw.updatedAt = nowISO();
      if (draw.fixtures.every(item => item.completed)) draw.groupStageCompletedAt = nowISO();
      draft.status = draw.fixtures.every(item => item.completed) ? "group-stage-completed" : "group-stage-active";
      draft.updatedAt = nowISO();
    }, "Maç sonucu canlı genel puan tablosuna işlendi.");
    closeModal();
  }

  async function clearResult(fixtureId) {
    if (!window.confirm("Bu maçın skor ve takım bilgileri silinsin mi?")) return;
    await mutatePayload(next => {
      const draft = getDraft(next);
      const draw = draft.draw;
      const fixture = draw?.fixtures?.find(item => item.id === fixtureId);
      if (!fixture) throw new Error("Maç bulunamadı.");
      fixture.homeScore = null;
      fixture.awayScore = null;
      fixture.homeTeam = "";
      fixture.awayTeam = "";
      fixture.completed = false;
      fixture.updatedAt = nowISO();
      draw.groupStageCompletedAt = null;
      draw.updatedAt = nowISO();
      draft.status = "group-stage-active";
      draft.updatedAt = nowISO();
    }, "Maç sonucu temizlendi.");
    closeModal();
  }

  function playerName(id, draw = getDraw()) {
    return playerMap(draw).get(id)?.name || "–";
  }

  function openResultModal(fixtureId) {
    const draw = getDraw();
    const fixture = draw?.fixtures?.find(item => item.id === fixtureId);
    if (!fixture) return;
    const homeName = playerName(fixture.homeId, draw);
    const awayName = playerName(fixture.awayId, draw);
    const overlay = document.createElement("div");
    overlay.id = "f10DrawModal";
    overlay.className = "f10-draw-modal-backdrop";
    overlay.innerHTML = `<section class="f10-draw-modal" role="dialog" aria-modal="true" aria-labelledby="f10DrawModalTitle">
      <header><div><span>GROUP ${fixture.group} · ${fixture.legLabel} · ${fixture.stars}★</span><h3 id="f10DrawModalTitle">Maç Sonucu</h3></div><button type="button" data-f10draw-action="close-modal" aria-label="Kapat">×</button></header>
      <form id="f10DrawResultForm">
        <input type="hidden" name="fixtureId" value="${escapeHTML(fixture.id)}">
        <div class="f10-result-versus">
          <label><strong>${escapeHTML(homeName)}</strong><span>${fixture.stars}★ Takım Havuzu</span><select name="homeTeam" required>${teamSelectOptions(draw, fixture, fixture.homeId, fixture.homeTeam || "")}</select><span>Skor</span><input name="homeScore" type="number" min="0" max="99" inputmode="numeric" value="${fixture.completed ? fixture.homeScore : ""}" required></label>
          <b>VS</b>
          <label><strong>${escapeHTML(awayName)}</strong><span>${fixture.stars}★ Takım Havuzu</span><select name="awayTeam" required>${teamSelectOptions(draw, fixture, fixture.awayId, fixture.awayTeam || "")}</select><span>Skor</span><input name="awayScore" type="number" min="0" max="99" inputmode="numeric" value="${fixture.completed ? fixture.awayScore : ""}" required></label>
        </div>
        <p class="f10-modal-rule"><strong>Takım pasaportu:</strong> Yalnızca bu devrenin ${fixture.stars}★ havuzu seçilebilir. Aynı oyuncu aynı takımı FIFA 10 boyunca ikinci kez, iki rakip ise aynı maçta aynı kulübü kullanamaz. Grup aşamasında beraberlik geçerlidir.</p>
        <footer>${fixture.completed ? `<button type="button" class="danger" data-f10draw-action="clear-result" data-fixture-id="${escapeHTML(fixture.id)}">Sonucu Sil</button>` : ""}<button type="button" data-f10draw-action="close-modal">Vazgeç</button><button type="submit" class="primary">Sonucu Kaydet</button></footer>
      </form>
    </section>`;
    document.body.appendChild(overlay);
    document.body.classList.add("f10-result-entry-open");
    overlay.addEventListener("click", event => {
      if (event.target === overlay) closeModal();
    });
    const homeSelect = overlay.querySelector("select[name='homeTeam']");
    const awaySelect = overlay.querySelector("select[name='awayTeam']");
    const syncOpponentOptions = (changed, other) => {
      if (!changed || !other) return;
      const selected = normalize(changed.value);
      [...other.options].forEach(option => {
        if (!option.value) return;
        const playerBlocked = option.dataset.playerBlocked === "1";
        option.disabled = playerBlocked || Boolean(selected && normalize(option.value) === selected);
      });
      if (selected && normalize(other.value) === selected) other.value = "";
    };
    homeSelect?.addEventListener("change", () => syncOpponentOptions(homeSelect, awaySelect));
    awaySelect?.addEventListener("change", () => syncOpponentOptions(awaySelect, homeSelect));
    syncOpponentOptions(homeSelect, awaySelect);
    syncOpponentOptions(awaySelect, homeSelect);
    overlay.querySelector("input[name='homeScore']")?.focus();
  }

  function closeModal() {
    document.getElementById("f10DrawModal")?.remove();
    document.body.classList.remove("f10-result-entry-open");
    if (renderDeferredWhileModal) {
      renderDeferredWhileModal = false;
      window.FIFA_APP_CONTEXT?.refreshView?.();
      scheduleRender();
    }
  }

  function notify(message, type = "info") {
    let stack = document.getElementById("f10DrawToastStack");
    if (!stack) {
      stack = document.createElement("div");
      stack.id = "f10DrawToastStack";
      stack.className = "f10-draw-toast-stack";
      document.body.appendChild(stack);
    }
    const toast = document.createElement("div");
    toast.className = `f10-draw-toast ${type}`;
    toast.innerHTML = `<span>${type === "success" ? "✓" : type === "error" ? "!" : "i"}</span><strong>${escapeHTML(message)}</strong>`;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 300);
    }, 4200);
  }

  function statusMeta(draw) {
    if (!draw) return { key: "registration", label: "KAYIT TAMAMLANDI", note: `${registrationRows().length} oyuncu` };
    if (draw.status === "ready") return { key: "ready", label: "KURA HAZIR", note: "Torbalar kilitli" };
    if (draw.status === "manual-entry") return { key: "ready", label: "GRUP GİRİŞİ", note: `${new Set(GROUPS.flatMap(group => draw.groups?.[group] || [])).size}/${draw.participants.length} oyuncu` };
    if (draw.status === "drawing") return { key: "live", label: "KURA CANLI", note: `${draw.assignments.length}/${draw.participants.length} oyuncu` };
    return { key: "complete", label: "GRUPLAR KİLİTLİ", note: `${draw.participants.length} oyuncu` };
  }

  function renderPots(draw) {
    const pots = potRows(draw);
    return `<div class="f10-draw-pots">${pots.map((rows, index) => `<article class="pot-${index + 1}"><header><span>TORBA</span><b>${index + 1}</b><small>${rows.length}/3</small></header><div>${rows.map(row => `<div><strong>${escapeHTML(row.name)}</strong><span>${row.elo} Standing</span>${draw?.assignments?.find(item => item.playerId === row.id) ? `<em>GRUP ${draw.assignments.find(item => item.playerId === row.id).group}</em>` : ""}</div>`).join("") || "<p>Boş</p>"}</div></article>`).join("")}</div>`;
  }

  function renderGroupMini(group, rows, draw) {
    const isFive = rows.length === 5;
    return `<article class="f10-draw-group-card group-${group} ${isFive ? "is-five" : ""}"><header><div><span>GROUP</span><strong>${group}</strong></div><b>${rows.length} OYUNCU</b></header><div>${rows.map((row, index) => `<div><i>${index + 1}</i><span><strong>${escapeHTML(row.name)}</strong><small>Torba ${row.pot} · ${row.elo} Standing</small></span></div>`).join("") || `<p>Kura bekleniyor</p>`}</div>${isFive ? `<footer>★ 5 OYUNCULU GRUP · KURA SONUCU</footer>` : ""}</article>`;
  }

  function renderManualGroupEntry(draw) {
    const players = snapshotPlayers(draw);
    const groups = currentGroups(draw);
    const assigned = new Set(GROUPS.flatMap(group => draw.groups?.[group] || []));
    const canFinish = assigned.size === players.length && expectedGroupSizePattern(players.length) === currentGroupSizePattern(draw);
    return `<section class="f10-manual-groups">
      <header><div><span>MANUAL DRAW RESULT ENTRY</span><h4>Çekilen grupları sisteme işle.</h4><p>Her oyuncunun karşısından kura sonucundaki A, B veya C grubunu seç. Bütün oyuncular yerleşince fikstürü tek tuşla oluştur.</p></div><div><strong>${assigned.size}/${players.length}</strong><small>OYUNCU YERLEŞTİ</small></div></header>
      <div class="f10-manual-summary">${GROUPS.map(group=>`<b>GRUP ${group}<span>${groups[group].length} oyuncu</span></b>`).join("")}<em>Beklenen: ${projectedGroupSizes(players.length).join("-")}</em></div>
      <div class="f10-manual-player-list">${players.map(player=>{
        const selected = GROUPS.find(group => (draw.groups?.[group] || []).includes(player.id)) || "";
        return `<article><div><small>TORBA ${player.pot} · ${player.elo} Standing</small><strong>${escapeHTML(player.name)}</strong></div><div class="f10-group-choice">${GROUPS.map(group=>`<button type="button" class="${selected===group?"active":""}" data-f10draw-action="manual-assign" data-player-id="${escapeHTML(player.id)}" data-group="${group}">${group}</button>`).join("")}</div></article>`;
      }).join("")}</div>
      <footer><button type="button" data-f10draw-action="reset-draw">Grup Girişini Sıfırla</button><button type="button" class="f10-draw-primary" data-f10draw-action="finalize-manual" ${canFinish?"":"disabled"}>Grupları Kaydet ve Fikstürü Oluştur ↗</button></footer>
    </section>`;
  }

  function ensureManualGroupOverlay() {
    let overlay = document.getElementById("f10ManualGroupsOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "f10ManualGroupsOverlay";
    overlay.className = "f10-manual-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "f10ManualGroupsTitle");
    overlay.innerHTML = `<section class="f10-manual-sheet">
      <header>
        <div><span>FIFA 10 · TOURNAMENT OPERATIONS</span><h3 id="f10ManualGroupsTitle">Çekilen Grupları Elle Gir</h3></div>
        <button type="button" data-f10draw-action="close-manual-overlay" aria-label="Grup giriş ekranını kapat">×</button>
      </header>
      <div class="f10-manual-sheet-body" id="f10ManualGroupsBody"></div>
    </section>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function syncManualGroupOverlay() {
    if (!manualEntryOverlayOpen) return;
    const overlay = ensureManualGroupOverlay();
    const body = overlay.querySelector("#f10ManualGroupsBody");
    const previousScrollTop = body?.scrollTop || 0;
    overlay.classList.add("is-open");
    document.body.classList.add("f10-manual-overlay-open");
    if (!body) return;
    if (manualEntryLoading) {
      body.innerHTML = `<div class="f10-manual-loading"><i></i><strong>Grup giriş ekranı hazırlanıyor…</strong><span>Kayıtlı oyuncular ve Standing torbaları kontrol ediliyor.</span></div>`;
      return;
    }
    const draw = getDraw();
    if (draw?.status === "manual-entry") {
      body.innerHTML = renderManualGroupEntry(draw);
      body.scrollTop = previousScrollTop;
      return;
    }
    if (manualEntryOverlayError) {
      body.innerHTML = `<div class="f10-manual-loading error"><strong>Grup giriş ekranı açılamadı.</strong><span>${escapeHTML(manualEntryOverlayError)}</span><button type="button" data-f10draw-action="close-manual-overlay">Kapat</button></div>`;
      return;
    }
    closeManualGroupOverlay();
  }

  function openManualGroupOverlay() {
    const draw = getDraw();
    if (!draw || draw.status !== "manual-entry") {
      notify("Önce manuel grup girişini başlatın.", "error");
      return;
    }
    manualEntryOverlayOpen = true;
    manualEntryLoading = false;
    manualEntryOverlayError = "";
    syncManualGroupOverlay();
  }

  function closeManualGroupOverlay() {
    manualEntryOverlayOpen = false;
    manualEntryLoading = false;
    manualEntryOverlayError = "";
    document.body.classList.remove("f10-manual-overlay-open");
    document.getElementById("f10ManualGroupsOverlay")?.remove();
  }

  function renderDrawArena(draw) {
    const groups = currentGroups(draw);
    const last = draw?.lastReveal;
    const remaining = draw ? unassignedPlayers(draw).length : registrationRows().length;
    const canManage = isAdmin();
    if (!draw) {
      const count = registrationRows().length;
      const groupCopy = groupDistributionCopy(count);
      return `<div class="f10-draw-ready-panel"><div><span>${count} PARTICIPANTS · 5 Standing POTS</span><h4>Turnuvayı şimdi başlat.</h4><p>Kura dışarıda çekildiyse sonuçları elle gir. Henüz çekilmediyse sistem üzerinden otomatik kura yap. ${groupCopy}</p></div>${canManage ? `<div class="f10-start-actions"><button type="button" class="f10-draw-primary" data-f10draw-action="manual-start">Çekilen Grupları Elle Gir ↗</button><button type="button" data-f10draw-action="prepare-draw">Sistem Üzerinden Kura Başlat</button></div>` : `<strong class="f10-public-wait">Yönetici grup sonuçlarını sisteme işleyecek.</strong>`}</div>${renderPots(null)}`;
    }
    if (draw.status === "manual-entry") {
      const assigned = new Set(GROUPS.flatMap(group => draw.groups?.[group] || [])).size;
      return `<section class="f10-manual-resume"><div><span>MANUAL DRAW RESULT ENTRY</span><h4>Grup girişi devam ediyor.</h4><p>${assigned}/${draw.participants.length} oyuncu yerleştirildi. Tam ekran operasyon panelini açarak kaldığınız yerden devam edin.</p></div><button type="button" class="f10-draw-primary" data-f10draw-action="open-manual-overlay">Grup Giriş Ekranını Aç ↗</button></section>`;
    }
    return `<div class="f10-draw-stage">
      <div class="f10-live-reveal ${last ? "has-reveal" : ""}"><span>${draw.status === "completed" ? "FINAL DRAW RESULT" : "LIVE DRAW REVEAL"}</span>${last ? `<small>TORBA ${last.pot}</small><h4>${escapeHTML(last.playerName)}</h4><div>GRUP <b>${last.group}</b></div><em>${last.elo} Standing</em>` : `<h4>Kura başlamaya hazır</h4><p>İlk oyuncu ve grubu güvenli rastgele seçimle belirlenecek.</p>`}<footer><strong>${draw.assignments.length}/${draw.participants.length}</strong><span>${remaining} oyuncu kaldı</span><code>${escapeHTML(draw.drawId)}</code></footer></div>
      <div class="f10-draw-controls">${canManage && draw.entryMode !== "official-fixed-groups" && draw.status !== "completed" ? `<button type="button" class="f10-draw-primary" data-f10draw-action="draw-next" ${moduleBusy || autoDrawing ? "disabled" : ""}>Sıradaki Oyuncuyu Çek</button><button type="button" data-f10draw-action="auto-draw" ${moduleBusy ? "disabled" : ""}>${autoDrawing ? "Otomatik Kurayı Durdur" : "Otomatik Kura"}</button><button type="button" data-f10draw-action="switch-manual">Çekilen Grupları Elle Gir</button>` : ""}${canManage && draw.entryMode !== "official-fixed-groups" ? `${draw.status === "completed" && !(draw.fixtures || []).some(match => match.completed) ? `<button type="button" data-f10draw-action="switch-manual">Grupları Düzenle</button>` : ""}<button type="button" data-f10draw-action="reset-draw">Kurayı Sıfırla</button><button type="button" class="danger" data-f10draw-action="reopen-registration">Kayıtlara Dön</button>` : ""}</div>
      <div class="f10-draw-group-grid">${GROUPS.map(group => renderGroupMini(group, groups[group], draw)).join("")}</div>
      <div class="f10-draw-log"><header><span>KURA KAYDI</span><strong>${draw.assignments.length} işlem</strong></header><div>${[...(draw.assignments || [])].reverse().slice(0, draw.participants.length).map(item => `<div><i>${String(item.sequence).padStart(2, "0")}</i><span><strong>${escapeHTML(item.playerName)}</strong><small>Torba ${item.pot}</small></span><b>GRUP ${item.group}</b></div>`).join("") || `<p>Henüz çekim yapılmadı.</p>`}</div></div>
    </div>`;
  }

  function renderGroupTables(draw) {
    const groups = currentGroups(draw);
    return `<section><div class="f10-groups-rule"><span>OFFICIAL DRAW RESULT</span><strong>Grup içi puan tablosu kullanılmaz.</strong><p>Bütün oyuncular maç başına puan ortalamasıyla tek Genel Puan tablosunda sıralanır.</p></div><div class="f10-groups-full">${GROUPS.map(group => `<article class="f10-group-full group-${group}"><header><div><span>GROUP</span><strong>${group}</strong></div><b>${groups[group].length} OYUNCU</b></header><div class="f10-group-members">${groups[group].map(row => `<div><strong>${escapeHTML(row.name)}</strong><span>Torba ${row.pot} · ${row.elo} Standing</span></div>`).join("")}</div></article>`).join("")}</div></section>`;
  }

  function resolvePlayer(draw, reference = selectedPlayerRef) {
    const players = snapshotPlayers(draw);
    const target = normalize(reference);
    return players.find(player => player.id === reference || normalize(player.name) === target) || players[0] || null;
  }

  function playerFixtures(draw, playerId) {
    return (draw?.fixtures || [])
      .filter(match => match.homeId === playerId || match.awayId === playerId)
      .sort((a, b) => a.leg - b.leg || a.matchday - b.matchday || a.sequence - b.sequence);
  }

  function fixtureOpponent(draw, fixture, playerId) {
    return playerName(fixture.homeId === playerId ? fixture.awayId : fixture.homeId, draw);
  }

  function localizedLegLabel(fixture) {
    return uiCopy(fixture?.legLabel || `${fixture?.leg || ""}. Devre`, `Circuit ${fixture?.leg || ""}`);
  }

  function renderPlayerMatchCentre(draw) {
    const players = snapshotPlayers(draw);
    const selected = resolvePlayer(draw);
    if (!selected) return `<p class="f10-empty-fixtures">${uiCopy("Oyuncu bulunamadı.", "No player was found.")}</p>`;
    selectedPlayerRef = selected.id;
    const tableRow = standings(draw).find(row => row.id === selected.id);
    const qualification = qualificationLabel(tableRow?.rank || players.length);
    const matches = playerFixtures(draw, selected.id);
    const pending = matches.filter(match => !match.completed);
    const completed = matches.filter(match => match.completed);
    const next = pending[0] || null;
    const group = GROUPS.find(item => (draw.groups?.[item] || []).includes(selected.id)) || "–";
    const tierCards = LEG_STARS.map(stars => {
      const usedKeys = usedTeamsForPlayer(draw, selected.id, stars);
      const usedNames = completed
        .filter(match => Number(match.stars) === Number(stars))
        .map(match => match.homeId === selected.id ? match.homeTeam : match.awayTeam)
        .filter(Boolean);
      return `<article><header><b>${stars}★</b><strong>${usedNames.length}/${matches.filter(match => Number(match.stars) === Number(stars)).length}</strong></header><p>${uiCopy("Kullanılan", "Used")}: ${usedNames.length ? usedNames.map(escapeHTML).join(" · ") : uiCopy("Henüz yok", "None yet")}</p><small>${Math.max(0, teamPool(stars).length - usedKeys.size)} ${uiCopy("uygun takım kaldı", "eligible teams remaining")}</small></article>`;
    }).join("");
    const matchCard = match => {
      const isHome = match.homeId === selected.id;
      const selectedScore = isHome ? match.homeScore : match.awayScore;
      const opponentScore = isHome ? match.awayScore : match.homeScore;
      const selectedTeam = isHome ? match.homeTeam : match.awayTeam;
      const opponentTeam = isHome ? match.awayTeam : match.homeTeam;
      return `<button type="button" class="f10-player-match ${match.completed ? "completed" : "pending"}" data-f10draw-action="open-result" data-fixture-id="${escapeHTML(match.id)}" ${isAdmin() ? "" : "disabled"}><span><b>${match.stars}★</b><small>${escapeHTML(localizedLegLabel(match))} · MD ${match.matchday}</small></span><div><strong>${escapeHTML(selected.name)}</strong><i>${match.completed ? `${selectedScore} – ${opponentScore}` : "VS"}</i><strong>${escapeHTML(fixtureOpponent(draw, match, selected.id))}</strong></div><small>${escapeHTML(selectedTeam || uiCopy("Takım bekleniyor", "Team pending"))} · ${escapeHTML(opponentTeam || uiCopy("Takım bekleniyor", "Team pending"))}</small></button>`;
    };
    return `<section class="f10-player-centre">
      <header><div><span>PLAYER MATCH CENTRE</span><h4>${uiCopy("Oyuncu Maç Merkezi", "Player Match Centre")}</h4><p>${uiCopy("Kişisel fikstür, kullanılan takımlar ve genel sıralamadaki yol tek ekranda.", "Personal fixtures, used teams and the overall-table path in one screen.")}</p></div><b>${completed.length}/${matches.length} ${uiCopy("MAÇ", "MATCHES")}</b></header>
      <nav class="f10-player-selector">${players.map(player => `<button type="button" class="${player.id === selected.id ? "active" : ""}" data-f10draw-action="select-player" data-player-id="${escapeHTML(player.id)}">${escapeHTML(player.name)}</button>`).join("")}</nav>
      <div class="f10-player-identity"><div><span>${uiCopy("GRUP", "GROUP")} ${group}</span><h5>${escapeHTML(selected.name)}</h5><small>${selected.elo} Standing</small></div><dl><div><dt>${uiCopy("Sıra", "Rank")}</dt><dd>#${tableRow?.rank || "–"}</dd></div><div><dt>PPG</dt><dd>${(tableRow?.ppg || 0).toFixed(3)}</dd></div><div><dt>${uiCopy("AV/M", "GD/M")}</dt><dd>${(tableRow?.gdPerMatch || 0) > 0 ? "+" : ""}${(tableRow?.gdPerMatch || 0).toFixed(3)}</dd></div><div><dt>${uiCopy("Yol", "Path")}</dt><dd class="path-${qualification.key}">${uiCopy(qualification.label, qualification.key === "direct" ? "DIRECT QF" : qualification.key === "playin" ? "CHAMPIONSHIP PLAY-IN" : "ELIMINATED")}</dd></div></dl></div>
      ${next ? `<section class="f10-next-match"><div><span>${uiCopy("SIRADAKİ MAÇ", "NEXT MATCH")}</span><strong>${next.stars}★ · ${escapeHTML(localizedLegLabel(next))} · MD ${next.matchday}</strong><h5>${escapeHTML(selected.name)} <i>VS</i> ${escapeHTML(fixtureOpponent(draw, next, selected.id))}</h5></div>${isAdmin() ? `<button type="button" data-f10draw-action="open-result" data-fixture-id="${escapeHTML(next.id)}">${uiCopy("SONUÇ GİR ↗", "ENTER RESULT ↗")}</button>` : ""}</section>` : `<section class="f10-next-match complete"><strong>${uiCopy("Bütün grup maçları tamamlandı.", "All group matches are complete.")}</strong></section>`}
      <div class="f10-player-tier-grid">${tierCards}</div>
      <div class="f10-player-match-columns"><section><header><strong>${uiCopy("Kalan Maçlar", "Remaining Matches")}</strong><span>${pending.length}</span></header><div>${pending.map(matchCard).join("") || `<p>${uiCopy("Kalan maç yok.", "No matches remaining.")}</p>`}</div></section><section><header><strong>${uiCopy("Tamamlanan Maçlar", "Completed Matches")}</strong><span>${completed.length}</span></header><div>${[...completed].reverse().map(matchCard).join("") || `<p>${uiCopy("Henüz tamamlanan maç yok.", "No completed matches yet.")}</p>`}</div></section></div>
    </section>`;
  }

  function renderQuickResultEntry(draw) {
    if (!isAdmin()) return "";
    const players = snapshotPlayers(draw);
    const pending = (draw.fixtures || [])
      .filter(match => !match.completed && (!quickPlayerFilter || match.homeId === quickPlayerFilter || match.awayId === quickPlayerFilter))
      .sort((a, b) => a.leg - b.leg || a.group.localeCompare(b.group) || a.matchday - b.matchday)
      .slice(0, 6);
    return `<section class="f10-quick-entry"><header><div><span>ADMIN QUICK ENTRY</span><strong>${uiCopy("Hızlı Sonuç Girişi", "Quick Result Entry")}</strong><small>${uiCopy("Oyuncuyu seç; sıradaki bekleyen maçı tek dokunuşla aç.", "Choose a player and open the next pending match with one tap.")}</small></div><select id="f10QuickPlayerFilter" aria-label="${uiCopy("Hızlı giriş oyuncu filtresi", "Quick-entry player filter")}"><option value="">${uiCopy("Tüm oyuncular", "All players")}</option>${players.map(player => `<option value="${escapeHTML(player.id)}" ${player.id === quickPlayerFilter ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></header><div>${pending.map(match => `<button type="button" data-f10draw-action="open-result" data-fixture-id="${escapeHTML(match.id)}"><span>${uiCopy("GRUP", "GROUP")} ${match.group} · ${match.stars}★</span><strong>${escapeHTML(playerName(match.homeId, draw))} <i>VS</i> ${escapeHTML(playerName(match.awayId, draw))}</strong><small>${escapeHTML(localizedLegLabel(match))} · MD ${match.matchday}</small></button>`).join("") || `<p>${uiCopy("Bu filtrede bekleyen maç yok.", "No pending match for this filter.")}</p>`}</div></section>`;
  }

  function projectedStanding(draw, fixture, playerId, outcome) {
    const clone = deepClone(draw);
    const target = clone.fixtures.find(match => match.id === fixture.id);
    const isHome = target.homeId === playerId;
    const scores = outcome === "draw" ? [1, 1] : outcome === "win" ? (isHome ? [1, 0] : [0, 1]) : (isHome ? [0, 1] : [1, 0]);
    target.homeScore = scores[0];
    target.awayScore = scores[1];
    target.completed = true;
    return standings(clone).find(row => row.id === playerId);
  }

  function openScenarioModal(playerId) {
    const draw = getDraw();
    const player = snapshotPlayers(draw).find(item => item.id === playerId);
    if (!player) return;
    const current = standings(draw).find(row => row.id === playerId);
    const fixture = playerFixtures(draw, playerId).find(match => !match.completed);
    const overlay = document.createElement("div");
    overlay.id = "f10DrawModal";
    overlay.className = "f10-draw-modal-backdrop";
    const outcomes = fixture ? [
      ["win", uiCopy("Galibiyet", "Win")],
      ["draw", uiCopy("Beraberlik", "Draw")],
      ["loss", uiCopy("Mağlubiyet", "Loss")]
    ].map(([key, label]) => [key, label, projectedStanding(draw, fixture, playerId, key)]) : [];
    overlay.innerHTML = `<section class="f10-draw-modal f10-scenario-modal" role="dialog" aria-modal="true"><header><div><span>PPG · ${uiCopy("MAÇ BAŞINA AVERAJ", "GOAL DIFFERENCE PER MATCH")}</span><h3>${uiCopy("Sıralama Senaryosu", "Standings Scenario")}</h3></div><button type="button" data-f10draw-action="close-modal" aria-label="${uiCopy("Kapat", "Close")}">×</button></header><div class="f10-scenario-body"><h4>${escapeHTML(player.name)}</h4>${fixture ? `<p>${uiCopy("Yalnızca sıradaki maç simüle edilir; diğer sonuçlar değişmeden kalır.", "Only the next match is simulated; every other result remains unchanged.")}</p><div class="f10-scenario-fixture"><b>${fixture.stars}★ · ${escapeHTML(localizedLegLabel(fixture))}</b><strong>${escapeHTML(player.name)} <i>VS</i> ${escapeHTML(fixtureOpponent(draw, fixture, playerId))}</strong></div><div class="f10-scenario-grid"><article><span>${uiCopy("Şimdi", "Current")}</span><b>#${current.rank}</b><small>PPG ${current.ppg.toFixed(3)} · ${uiCopy("AV/M", "GD/M")} ${current.gdPerMatch > 0 ? "+" : ""}${current.gdPerMatch.toFixed(3)}</small><em>${uiCopy(qualificationLabel(current.rank).label, qualificationLabel(current.rank).key === "direct" ? "DIRECT QF" : qualificationLabel(current.rank).key === "playin" ? "CHAMPIONSHIP PLAY-IN" : "ELIMINATED")}</em></article>${outcomes.map(([key, label, row]) => { const path = qualificationLabel(row.rank); return `<article class="${key}"><span>${label}</span><b>#${row.rank}</b><small>PPG ${row.ppg.toFixed(3)} · ${uiCopy("AV/M", "GD/M")} ${row.gdPerMatch > 0 ? "+" : ""}${row.gdPerMatch.toFixed(3)}</small><em>${uiCopy(path.label, path.key === "direct" ? "DIRECT QF" : path.key === "playin" ? "CHAMPIONSHIP PLAY-IN" : "ELIMINATED")}</em></article>`; }).join("")}</div>` : `<p>${uiCopy("Bu oyuncunun bekleyen grup maçı yok.", "This player has no pending group match.")}</p>`}</div></section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); });
  }

  function qualificationOutlook(draw) {
    const rows = standings(draw);
    const totalByPlayer = new Map(snapshotPlayers(draw).map(player => [player.id, playerFixtures(draw, player.id).length]));
    const bounds = rows.map(row => {
      const total = totalByPlayer.get(row.id) || row.mp;
      const remaining = Math.max(0, total - row.mp);
      const finalMatches = Math.max(1, row.mp + remaining);
      return {
        ...row,
        remaining,
        minPpg: row.pts / finalMatches,
        maxPpg: (row.pts + remaining * 3) / finalMatches
      };
    });
    const byId = new Map(bounds.map(row => [row.id, row]));
    return bounds.map(row => {
      const others = bounds.filter(item => item.id !== row.id);
      const bestRank = Math.min(bounds.length, 1 + others.filter(item => item.minPpg > row.maxPpg + 1e-9).length);
      const worstRank = Math.min(bounds.length, 1 + others.filter(item => item.maxPpg >= row.minPpg - 1e-9).length);
      let state = "open";
      let label = uiCopy("YOL AÇIK", "PATH OPEN");
      if (!row.remaining) {
        const path = qualificationLabel(row.rank);
        state = path.key;
        label = uiCopy(path.label, path.key === "direct" ? "DIRECT QF" : path.key === "playin" ? "CHAMPIONSHIP PLAY-IN" : "ELIMINATED");
      } else if (worstRank <= 4) {
        state = "direct";
        label = uiCopy("DOĞRUDAN QF GARANTİ", "DIRECT QF CLINCHED");
      } else if (bestRank > 4 && worstRank <= 12) {
        state = "playin";
        label = uiCopy("PLAY-IN GARANTİ", "PLAY-IN CLINCHED");
      } else if (bestRank > 12) {
        state = "eliminated";
        label = uiCopy("İLK 12 MATEMATİKSEL OLARAK İMKÂNSIZ", "TOP 12 MATHEMATICALLY IMPOSSIBLE");
      } else if (bestRank <= 4) {
        label = uiCopy("DOĞRUDAN QF ŞANSI VAR", "DIRECT QF STILL POSSIBLE");
      } else if (bestRank <= 12) {
        label = uiCopy("PLAY-IN ŞANSI VAR", "PLAY-IN STILL POSSIBLE");
      }
      return { ...byId.get(row.id), bestRank, worstRank, outlookState: state, outlookLabel: label };
    });
  }

  function pointsToBeatBenchmark(row, benchmark) {
    if (!row.remaining) return null;
    const required = Math.ceil(((benchmark + 0.0005) * (row.mp + row.remaining)) - row.pts);
    return Math.max(0, required);
  }

  function renderQualificationCentre(draw) {
    const rows = qualificationOutlook(draw);
    const fourth = standings(draw)[3]?.ppg || 0;
    const twelfth = standings(draw)[11]?.ppg || 0;
    const clinched = rows.filter(row => row.outlookState === "direct").length;
    const completed = completedFixtures(draw).length;
    return `<section class="f10-qualification-centre"><header><div><span>MATHEMATICAL QUALIFICATION CENTRE</span><h4>${uiCopy("Matematiksel Qualification Centre", "Mathematical Qualification Centre")}</h4><p>${uiCopy("Olası en düşük ve en yüksek final PPG değerlerinden güvenli sıra aralığı hesaplanır. Eşitliklerde AV/M nedeniyle ihtiyatlı sınır kullanılır.", "A safe rank range is calculated from minimum and maximum possible final PPG. Ties use a conservative boundary because GD/M can decide them.")}</p></div><b>${completed}/${draw.fixtures.length} ${uiCopy("MAÇ", "MATCHES")}</b></header>
      <div class="f10-qualification-kpis"><article><span>${uiCopy("Güncel QF Kesimi", "Current QF Cutoff")}</span><b>${fourth.toFixed(3)}</b><small>PPG · #4</small></article><article><span>${uiCopy("Güncel Play-in Kesimi", "Current Play-in Cutoff")}</span><b>${twelfth.toFixed(3)}</b><small>PPG · #12</small></article><article><span>${uiCopy("Garantilenen Doğrudan QF", "Direct QF Clinched")}</span><b>${clinched}/4</b><small>${uiCopy("matematiksel", "mathematical")}</small></article><article><span>${uiCopy("Kalan Maç", "Matches Remaining")}</span><b>${draw.fixtures.length - completed}</b><small>${uiCopy("grup aşaması", "group stage")}</small></article></div>
      <div class="f10-qualification-scroll"><div class="f10-qualification-table"><div class="head"><span>#</span><span>${uiCopy("Oyuncu", "Player")}</span><span>PPG</span><span>${uiCopy("Kalan", "Left")}</span><span>${uiCopy("Final PPG Aralığı", "Final PPG Range")}</span><span>${uiCopy("Olası Sıra", "Possible Rank")}</span><span>${uiCopy("Güncel #4 Hedefi", "Current #4 Target")}</span><span>${uiCopy("Matematiksel Durum", "Mathematical Status")}</span></div>${rows.map(row => {
        const target = pointsToBeatBenchmark(row, fourth);
        return `<div class="status-${row.outlookState}"><b>${row.rank}</b><strong>${escapeHTML(row.name)}</strong><span>${row.ppg.toFixed(3)}</span><span>${row.remaining}</span><span>${row.minPpg.toFixed(3)}–${row.maxPpg.toFixed(3)}</span><b>#${row.bestRank}–#${row.worstRank}</b><span>${target === null ? "—" : target > row.remaining * 3 ? uiCopy("Ulaşılamaz", "Unreachable") : `${target}/${row.remaining * 3} ${uiCopy("puan", "pts")}`}</span><em>${row.outlookLabel}</em></div>`;
      }).join("")}</div></div>
      <p class="f10-math-note">${uiCopy("Bu merkez tahmindir; resmî sıralama yalnızca oynanmış maçlardan PPG → AV/M → toplam AG → galibiyet oranı → kura sırası ile oluşur.", "This centre is a projection; the official table is based only on completed matches using PPG → GD/M → total GF → win rate → draw order.")}</p>
    </section>`;
  }

  function buildDynamicSchedule(draw) {
    const evolutionSchedule = window.FIFA_EVOLUTION_OS?.optimizedSchedule?.(draw, payload);
    if (Array.isArray(evolutionSchedule) && evolutionSchedule.length === (draw.fixtures || []).filter(match => !match.completed).length) {
      return evolutionSchedule;
    }
    const pending = (draw.fixtures || []).filter(match => !match.completed);
    const completed = completedFixtures(draw).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "") || b.sequence - a.sequence);
    let lastPlayers = new Set(completed[0] ? [completed[0].homeId, completed[0].awayId] : []);
    const groupLoads = new Map(GROUPS.map(group => [group, completed.filter(match => match.group === group).length]));
    const playerLoads = new Map();
    const remaining = [...pending];
    const ordered = [];
    while (remaining.length) {
      remaining.sort((a, b) => {
        const score = match => (groupLoads.get(match.group) || 0) * 12
          + (playerLoads.get(match.homeId) || 0) * 6
          + (playerLoads.get(match.awayId) || 0) * 6
          + (lastPlayers.has(match.homeId) || lastPlayers.has(match.awayId) ? 45 : 0)
          + (Number(match.leg) || 0) * 2
          + (Number(match.matchday) || 0) / 100;
        return score(a) - score(b) || a.group.localeCompare(b.group) || a.leg - b.leg || a.matchday - b.matchday;
      });
      const next = remaining.shift();
      ordered.push(next);
      groupLoads.set(next.group, (groupLoads.get(next.group) || 0) + 1);
      playerLoads.set(next.homeId, (playerLoads.get(next.homeId) || 0) + 1);
      playerLoads.set(next.awayId, (playerLoads.get(next.awayId) || 0) + 1);
      lastPlayers = new Set([next.homeId, next.awayId]);
    }
    return ordered;
  }

  function renderDynamicSchedule(draw) {
    const schedule = buildDynamicSchedule(draw);
    const now = Date.now();
    const players = playerMap(draw);
    const progress = GROUPS.map(group => {
      const all = (draw.fixtures || []).filter(match => match.group === group);
      const done = all.filter(match => match.completed).length;
      return { group, done, total: all.length, pct: all.length ? Math.round(done / all.length * 100) : 0 };
    });
    const finish = new Date(now + schedule.length * scheduleMatchMinutes * 60000);
    return `<section class="f10-schedule-centre"><header><div><span>DYNAMIC TOURNAMENT SCHEDULER</span><h4>${uiCopy("Dinamik Turnuva Takvimi", "Dynamic Tournament Schedule")}</h4><p>${uiCopy("Sistem grupları dengeler, aynı oyuncuya art arda maç vermemeye çalışır ve bekleyen fikstürlerden canlı operasyon sırası üretir.", "The system balances groups, avoids consecutive matches for the same player and builds a live operating order from pending fixtures.")}</p></div><b>${schedule.length} ${uiCopy("BEKLEYEN", "PENDING")}</b></header>
      <div class="f10-schedule-toolbar"><label>${uiCopy("Ortalama maç süresi", "Average match duration")}<select id="f10ScheduleDuration">${[10,12,15,18,20,25].map(minutes => `<option value="${minutes}" ${minutes === scheduleMatchMinutes ? "selected" : ""}>${minutes} ${uiCopy("dk", "min")}</option>`).join("")}</select></label><div><span>${uiCopy("Tahmini tamamlanma", "Estimated completion")}</span><strong>${finish.toLocaleTimeString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", {hour:"2-digit",minute:"2-digit"})}</strong></div><small>${uiCopy("Tek oyun istasyonu varsayımı", "Assumes one gaming station")}</small></div>
      <div class="f10-schedule-progress">${progress.map(item => `<article><header><strong>${uiCopy("GRUP", "GROUP")} ${item.group}</strong><span>${item.done}/${item.total}</span></header><div><i style="width:${item.pct}%"></i></div><small>%${item.pct}</small></article>`).join("")}</div>
      <div class="f10-schedule-list">${schedule.slice(0, 18).map((match, index) => {
        const start = new Date(now + index * scheduleMatchMinutes * 60000);
        return `<button type="button" data-f10draw-action="open-result" data-fixture-id="${escapeHTML(match.id)}" ${isAdmin() ? "" : "disabled"}><b>${String(index + 1).padStart(2, "0")}</b><time>${start.toLocaleTimeString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", {hour:"2-digit",minute:"2-digit"})}</time><span>${uiCopy("GRUP", "GROUP")} ${match.group} · ${match.stars}★ · MD ${match.matchday}</span><strong>${escapeHTML(players.get(match.homeId)?.name || "–")} <i>VS</i> ${escapeHTML(players.get(match.awayId)?.name || "–")}</strong><em>${index === 0 ? uiCopy("SIRADAKİ", "NEXT") : escapeHTML(match.evolution?.why || uiCopy("DİNLENME DENGELİ", "REST-BALANCED"))}</em></button>`;
      }).join("") || `<p>${uiCopy("Bütün grup maçları tamamlandı.", "All group matches are complete.")}</p>`}</div>
    </section>`;
  }

  function renderStandings(draw) {
    const rows = standings(draw);
    const played = completedFixtures(draw).length;
    const total = draw.fixtures?.length || 0;
    return `<section class="f10-general-standings"><header><div><span>ONE TABLE · RATE-BASED RANKING</span><h4>FIFA 10 Genel Puan Sıralaması</h4><p>Farklı maç sayıları PPG ve maç başına averaj ile eşitlenir. Toplam puan yalnızca parantez içinde bilgi amaçlı gösterilir; sıralamayı etkilemez.</p></div><div><strong>${played}/${total}</strong><small>GRUP MAÇI</small></div></header>
      <div class="f10-ranking-rules"><span>1 · PPG</span><span>2 · AV/M</span><span>3 · TOPLAM AG</span><span>4 · GALİBİYET ORANI</span><span>5 · KURA SIRASI</span></div>
      <div class="f10-standings-scroll"><div class="f10-standings-table"><div class="head"><span>#</span><span>${uiCopy("Oyuncu", "Player")}</span><span>${uiCopy("Grup", "Group")}</span><span>${uiCopy("O", "MP")}</span><span>${uiCopy("G", "W")}</span><span>${uiCopy("B", "D")}</span><span>${uiCopy("M", "L")}</span><span>${uiCopy("AG", "GF")}</span><span>${uiCopy("YG", "GA")}</span><span>${uiCopy("AV/M (AV)", "GD/M (GD)")}</span><span>${uiCopy("PPG (P)", "PPG (Pts)")}</span><span>${uiCopy("Yol", "Path")}</span></div>${rows.map(row => {
        const qualification = qualificationLabel(row.rank);
        return `<div class="rank-${row.rank} qualification-${qualification.key}"><span>${row.rank}</span><button type="button" class="f10-scenario-player" data-f10draw-action="open-scenario" data-player-id="${escapeHTML(row.id)}" title="${uiCopy("Sıralama senaryosunu aç", "Open standings scenario")}">${escapeHTML(row.name)}</button><span>${row.group}</span><span>${row.mp}</span><span>${row.w}</span><span>${row.d}</span><span>${row.l}</span><span>${row.gf}</span><span>${row.ga}</span><b>${row.gdPerMatch > 0 ? "+" : ""}${row.gdPerMatch.toFixed(3)} <small>(${row.gd > 0 ? "+" : ""}${row.gd})</small></b><strong>${row.ppg.toFixed(3)} <small>(${row.pts})</small></strong><em>${qualification.label}</em></div>`;
      }).join("")}</div></div>
      ${renderQualificationPath(rows)}
    </section>`;
  }

  function renderQualificationPath(rows) {
    if (!rows.length) return "";
    const name = rank => escapeHTML(rows.find(row => row.rank === rank)?.name || `${rank}. Sıra`);
    return `<div class="f10-qualification-path"><article class="direct"><span>DIRECT QUARTER-FINALISTS</span><div>${[1, 2, 3, 4].map(rank => `<b>${rank}<small>${name(rank)}</small></b>`).join("")}</div><small>İlk dört oyuncu doğrudan çeyrek finalde.</small></article><article class="playin"><span>CHAMPIONSHIP PLAY-IN · BEST OF 3</span><div class="path-pairs"><b>5 <small>${name(5)}</small><i>VS</i> 12 <small>${name(12)}</small></b><b>6 <small>${name(6)}</small><i>VS</i> 11 <small>${name(11)}</small></b><b>7 <small>${name(7)}</small><i>VS</i> 10 <small>${name(10)}</small></b><b>8 <small>${name(8)}</small><i>VS</i> 9 <small>${name(9)}</small></b></div><small>Her seride iki galibiyet alan çeyrek finale çıkar.</small></article><article class="eliminated"><span>DOĞRUDAN ELENENLER</span><div>${[13, 14].map(rank => `<b>${rank}<small>${name(rank)}</small></b>`).join("")}</div><small>13. ve 14. sırada turnuva sona erer.</small></article></div>`;
  }

  function renderFixtures(draw) {
    const players = playerMap(draw);
    const group = GROUPS.includes(fixtureGroupFilter) ? fixtureGroupFilter : "A";
    const leg = [0, 1, 2, 3].includes(fixtureLegFilter) ? fixtureLegFilter : 0;
    const fixtures = (draw.fixtures || [])
      .filter(match => match.group === group && (!leg || match.leg === leg))
      .sort((a, b) => a.leg - b.leg || a.matchday - b.matchday || a.sequence - b.sequence);
    return `<section class="f10-fixtures"><header><div><span>TRIPLE CIRCUIT FIXTURES</span><h4>Grup Fikstürü ve Sonuç Merkezi</h4><p>Her rakiplik üç kez oynanır: 4★, 4.5★ ve 5★. Sonuçlar kaydedildiği anda genel PPG tablosu güncellenir.</p></div><b>${draw.fixtures.length} MAÇ</b></header>
      ${renderQuickResultEntry(draw)}
      <div class="f10-fixture-filters"><div>${GROUPS.map(item => `<button type="button" class="${group === item ? "active" : ""}" data-f10draw-action="fixture-group" data-group="${item}">GRUP ${item}</button>`).join("")}</div><div>${[0, 1, 2, 3].map(item => `<button type="button" class="${leg === item ? "active" : ""}" data-f10draw-action="fixture-leg" data-leg="${item}">${item ? `${item}. DEVRE` : "TÜMÜ"}</button>`).join("")}</div></div>
      <div class="f10-fixture-list">${fixtures.map(match => `<button type="button" class="f10-fixture-row ${match.completed ? "completed" : "pending"}" data-f10draw-action="open-result" data-fixture-id="${escapeHTML(match.id)}" ${isAdmin() ? "" : "disabled"}><span><small>${match.legLabel} · MD ${match.matchday}</small><b>${match.stars}★</b></span><strong>${escapeHTML(players.get(match.homeId)?.name || "–")}</strong><div>${match.completed ? `<b>${match.homeScore}</b><i>–</i><b>${match.awayScore}</b>` : `<em>VS</em>`}</div><strong>${escapeHTML(players.get(match.awayId)?.name || "–")}</strong><span class="teams"><small>${escapeHTML(match.homeTeam || "Takım bekleniyor")}</small><small>${escapeHTML(match.awayTeam || "Takım bekleniyor")}</small></span></button>`).join("") || `<p class="f10-empty-fixtures">Bu filtrede maç bulunamadı.</p>`}</div>
    </section>`;
  }

  function playerTeamPassport(draw, player) {
    const selections = [];
    let missing = 0;
    officialStatFixtures(draw)
      .filter(match => String(match.homeId) === String(player.id) || String(match.awayId) === String(player.id))
      .forEach(match => {
        const isHome = String(match.homeId) === String(player.id);
        const team = String(isHome ? match.homeTeam || "" : match.awayTeam || "").trim();
        if (!team) {
          missing += 1;
          return;
        }
        selections.push({
          team,
          teamKey: normalize(team),
          stars: Number(match.stars),
          opponent: playerName(isHome ? match.awayId : match.homeId, draw),
          stage: teamPassportStageLabel(match),
          source: match.phase === "fifa10-championship" ? "championship" : "group",
          matchId: match.id || "",
          updatedAt: match.updatedAt || null
        });
      });
    return { ...player, selections, missing };
  }

  function teamPoolIntelligence(draw) {
    const records = new Map();
    const ensure = (stars, team) => {
      const key = `${Number(stars)}:${normalize(team)}`;
      if (!records.has(key)) records.set(key, {
        key, stars: Number(stars), team, mp: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, pts: 0, gd: 0, ppg: 0, gdPerMatch: 0, players: new Set()
      });
      return records.get(key);
    };
    officialStatFixtures(draw).forEach(match => {
      const homeTeam = String(match.homeTeam || "").trim();
      const awayTeam = String(match.awayTeam || "").trim();
      if (!homeTeam || !awayTeam) return;
      const home = ensure(match.stars, homeTeam);
      const away = ensure(match.stars, awayTeam);
      const hs = Number(match.homeScore);
      const as = Number(match.awayScore);
      home.mp += 1; away.mp += 1;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      home.players.add(match.homeId); away.players.add(match.awayId);
      if (hs > as) { home.w += 1; away.l += 1; home.pts += 3; }
      else if (hs < as) { away.w += 1; home.l += 1; away.pts += 3; }
      else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
    });
    return [...records.values()].map(record => ({
      ...record,
      playerCount: record.players.size,
      gd: record.gf - record.ga,
      ppg: record.mp ? record.pts / record.mp : 0,
      gdPerMatch: record.mp ? (record.gf - record.ga) / record.mp : 0
    })).sort((a, b) => b.ppg - a.ppg || b.gdPerMatch - a.gdPerMatch || b.mp - a.mp || a.team.localeCompare(b.team, "tr"));
  }

  function playerTierStats(draw, playerId, stars = null) {
    const fixtures = officialStatFixtures(draw).filter(match =>
      (String(match.homeId) === String(playerId) || String(match.awayId) === String(playerId))
      && (stars === null || Number(match.stars) === Number(stars))
    );
    const stats = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, gd: 0, ppg: 0, gdPerMatch: 0, gfPerMatch: 0, gaPerMatch: 0, closeMatches: 0, closeWins: 0 };
    fixtures.forEach(match => {
      const home = match.homeId === playerId;
      const gf = Number(home ? match.homeScore : match.awayScore);
      const ga = Number(home ? match.awayScore : match.homeScore);
      stats.mp += 1; stats.gf += gf; stats.ga += ga;
      if (Math.abs(gf - ga) <= 1) stats.closeMatches += 1;
      if (gf > ga) {
        stats.w += 1; stats.pts += 3;
        if (gf - ga === 1) stats.closeWins += 1;
      } else if (gf < ga) stats.l += 1;
      else { stats.d += 1; stats.pts += 1; }
    });
    stats.gd = stats.gf - stats.ga;
    stats.ppg = stats.mp ? stats.pts / stats.mp : 0;
    stats.gdPerMatch = stats.mp ? stats.gd / stats.mp : 0;
    stats.gfPerMatch = stats.mp ? stats.gf / stats.mp : 0;
    stats.gaPerMatch = stats.mp ? stats.ga / stats.mp : 0;
    return stats;
  }

  function playerDna(draw, playerId) {
    const overall = playerTierStats(draw, playerId);
    const tiers = LEG_STARS.map(stars => ({ stars, ...playerTierStats(draw, playerId, stars) }));
    const playedTiers = tiers.filter(row => row.mp);
    const metrics = overall.mp ? {
      performance: Math.round(Math.max(0, Math.min(100, overall.ppg / 3 * 100))),
      attack: Math.round(Math.max(0, Math.min(100, overall.gfPerMatch / 6 * 100))),
      defence: Math.round(Math.max(0, Math.min(100, 100 - overall.gaPerMatch / 6 * 100))),
      clutch: Math.round(overall.closeMatches ? overall.closeWins / overall.closeMatches * 100 : 50),
      versatility: Math.round(playedTiers.length / LEG_STARS.length * 100)
    } : { performance: 0, attack: 0, defence: 0, clutch: 0, versatility: 0 };
    const bestTier = [...playedTiers].sort((a, b) => b.ppg - a.ppg || b.gdPerMatch - a.gdPerMatch || b.mp - a.mp)[0] || null;
    return {
      playerId,
      overall,
      tiers,
      metrics,
      trait: bestTier ? uiCopy(`${bestTier.stars}★ Uzmanı`, `${bestTier.stars}★ Specialist`) : uiCopy("Veri Bekleniyor", "Awaiting Data")
    };
  }

  function headToHead(draw, playerId, rivalId) {
    const fixtures = officialStatFixtures(draw).filter(match =>
      (String(match.homeId) === String(playerId) && String(match.awayId) === String(rivalId))
      || (String(match.homeId) === String(rivalId) && String(match.awayId) === String(playerId))
    );
    const row = { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, ppg: 0, gd: 0, fixtures };
    fixtures.forEach(match => {
      const home = match.homeId === playerId;
      const gf = Number(home ? match.homeScore : match.awayScore);
      const ga = Number(home ? match.awayScore : match.homeScore);
      row.mp += 1; row.gf += gf; row.ga += ga;
      if (gf > ga) { row.w += 1; row.pts += 3; }
      else if (gf < ga) row.l += 1;
      else { row.d += 1; row.pts += 1; }
    });
    row.gd = row.gf - row.ga;
    row.ppg = row.mp ? row.pts / row.mp : 0;
    return row;
  }

  function renderTeamPoolIntelligence(draw, players) {
    const intelligence = teamPoolIntelligence(draw);
    const selected = resolvePlayer(draw);
    const passport = selected ? playerTeamPassport(draw, selected) : null;
    const next = selected ? playerFixtures(draw, selected.id).find(match => !match.completed) : null;
    const nextRemaining = next && passport
      ? Math.max(0, teamPool(next.stars).length - new Set(passport.selections.filter(item => Number(item.stars) === Number(next.stars)).map(item => item.teamKey || normalize(item.team))).size)
      : 0;
    const topByTier = LEG_STARS.map(stars => {
      const rows = intelligence.filter(row => Number(row.stars) === Number(stars)).slice(0, 5);
      const totalUses = intelligence.filter(row => Number(row.stars) === Number(stars)).reduce((sum, row) => sum + row.mp, 0);
      return `<article><header><b>${stars}★</b><span>${totalUses} ${uiCopy("kullanım", "uses")}</span></header><div>${rows.map((row, index) => `<div><i>${index + 1}</i><strong>${escapeHTML(row.team)}</strong><span>${row.ppg.toFixed(3)} PPG</span><small>${row.mp} ${uiCopy("maç", "MP")} · ${row.gdPerMatch > 0 ? "+" : ""}${row.gdPerMatch.toFixed(2)} ${uiCopy("AV/M", "GD/M")}</small></div>`).join("") || `<p>${uiCopy("Henüz yeterli maç verisi yok.", "There is no match data yet.")}</p>`}</div></article>`;
    }).join("");
    return `<section class="f10-team-intelligence"><header><div><span>TEAM POOL INTELLIGENCE</span><h4>${uiCopy("Takım Havuzu Zekâsı", "Team Pool Intelligence")}</h4><p>${uiCopy("Kulüplerin resmî FIFA 10 sonuçlarından kullanım ve performans eğilimleri. Küçük örneklemler özellikle işaretlenir; bu bölüm kural değil karar desteğidir.", "Usage and performance trends from official FIFA 10 results. Small samples remain visible; this is decision support, not a rule.")}</p></div><b>${intelligence.length} ${uiCopy("AKTİF KULÜP", "ACTIVE CLUBS")}</b></header>
      ${selected && passport ? `<div class="f10-team-scarcity"><div><span>${uiCopy("SEÇİLİ OYUNCU", "SELECTED PLAYER")}</span><strong>${escapeHTML(selected.name)}</strong><small>${new Set(passport.selections.map(item => item.teamKey || normalize(item.team))).size} ${uiCopy("farklı takım kullanıldı", "different teams used")}</small></div>${LEG_STARS.map(stars => {
        const used = new Set(passport.selections.filter(item => Number(item.stars) === Number(stars)).map(item => item.teamKey || normalize(item.team))).size;
        return `<article><b>${stars}★</b><strong>${Math.max(0, teamPool(stars).length - used)}</strong><small>${uiCopy("uygun kaldı", "eligible left")}</small></article>`;
      }).join("")}<div class="next"><span>${uiCopy("SIRADAKİ HAVUZ", "NEXT POOL")}</span><strong>${next ? `${next.stars}★ · ${nextRemaining} ${uiCopy("seçenek", "options")}` : uiCopy("Maçlar tamamlandı", "Matches complete")}</strong></div></div>` : ""}
      <div class="f10-team-intel-grid">${topByTier}</div>
      <nav class="f10-player-selector">${players.map(player => `<button type="button" class="${selected?.id === player.id ? "active" : ""}" data-f10draw-action="select-team-player" data-player-id="${escapeHTML(player.id)}">${escapeHTML(player.name)}</button>`).join("")}</nav>
    </section>`;
  }

  function renderPlayerDnaCentre(draw) {
    const players = snapshotPlayers(draw);
    const selected = resolvePlayer(draw);
    if (!selected) return "";
    selectedPlayerRef = selected.id;
    let rival = resolvePlayer(draw, rivalPlayerRef);
    if (!rival || rival.id === selected.id) rival = players.find(player => player.id !== selected.id) || null;
    if (rival) rivalPlayerRef = rival.id;
    const dna = playerDna(draw, selected.id);
    const h2h = rival ? headToHead(draw, selected.id, rival.id) : null;
    const metricCopy = {
      performance: uiCopy("Performans", "Performance"),
      attack: uiCopy("Hücum", "Attack"),
      defence: uiCopy("Savunma", "Defence"),
      clutch: uiCopy("Kritik Maç", "Clutch"),
      versatility: uiCopy("Çok Yönlülük", "Versatility")
    };
    return `<section class="f10-dna-centre"><header><div><span>PLAYER DNA · RIVAL INTELLIGENCE</span><h4>${uiCopy("Oyuncu DNA ve Rakip Analizi", "Player DNA & Rival Analysis")}</h4><p>${uiCopy("Tamamlanan resmî maçlardan oyun profili, yıldız seviyesi performansı ve bire bir rekabet özeti.", "Playing profile, star-tier performance and head-to-head rivalry from completed official matches.")}</p></div><b>${dna.trait}</b></header>
      <div class="f10-dna-selectors"><label>${uiCopy("Oyuncu", "Player")}<select id="f10DnaPlayer">${players.map(player => `<option value="${escapeHTML(player.id)}" ${player.id === selected.id ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></label><label>${uiCopy("Rakip", "Rival")}<select id="f10DnaRival">${players.filter(player => player.id !== selected.id).map(player => `<option value="${escapeHTML(player.id)}" ${player.id === rival?.id ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}</select></label></div>
      <div class="f10-dna-profile"><article><span>${uiCopy("DNA PROFİLİ", "DNA PROFILE")}</span><h5>${escapeHTML(selected.name)}</h5><strong>${dna.trait}</strong><small>${dna.overall.mp} ${uiCopy("resmî maçtan üretildi", "official matches analysed")}</small></article><div>${Object.entries(dna.metrics).map(([key, value]) => `<label><span>${metricCopy[key]}</span><b>${value}</b><i><em style="width:${value}%"></em></i></label>`).join("")}</div></div>
      <div class="f10-dna-tiers">${dna.tiers.map(row => `<article><header><b>${row.stars}★</b><strong>${row.ppg.toFixed(3)} PPG</strong></header><div><span>${row.mp} ${uiCopy("maç", "MP")}</span><span>${row.w}-${row.d}-${row.l}</span><span>${row.gdPerMatch > 0 ? "+" : ""}${row.gdPerMatch.toFixed(3)} ${uiCopy("AV/M", "GD/M")}</span></div></article>`).join("")}</div>
      ${rival && h2h ? `<section class="f10-h2h"><header><div><span>HEAD TO HEAD</span><h5>${escapeHTML(selected.name)} <i>VS</i> ${escapeHTML(rival.name)}</h5></div><b>${h2h.mp} ${uiCopy("MAÇ", "MATCHES")}</b></header><div class="summary"><article><span>${uiCopy("Galibiyet", "Wins")}</span><b>${h2h.w}</b></article><article><span>${uiCopy("Beraberlik", "Draws")}</span><b>${h2h.d}</b></article><article><span>${uiCopy("Mağlubiyet", "Losses")}</span><b>${h2h.l}</b></article><article><span>PPG</span><b>${h2h.ppg.toFixed(3)}</b></article><article><span>${uiCopy("Averaj", "Goal Difference")}</span><b>${h2h.gd > 0 ? "+" : ""}${h2h.gd}</b></article></div><div class="matches">${h2h.fixtures.map(match => {
        const home = match.homeId === selected.id;
        return `<article><span>${match.stars}★ · ${escapeHTML(teamPassportStageLabel(match))}</span><strong>${escapeHTML(selected.name)} <b>${home ? match.homeScore : match.awayScore}–${home ? match.awayScore : match.homeScore}</b> ${escapeHTML(rival.name)}</strong><small>${escapeHTML(home ? match.homeTeam : match.awayTeam)} · ${escapeHTML(home ? match.awayTeam : match.homeTeam)}</small></article>`;
      }).join("") || `<p>${uiCopy("Bu iki oyuncu henüz karşılaşmadı.", "These players have not met yet.")}</p>`}</div></section>` : ""}
    </section>`;
  }

  function renderTeamPassports(draw) {
    const players = [...playerMap(draw).values()]
      .map(player => playerTeamPassport(draw, {
        ...player,
        group: GROUPS.find(group => (draw.groups?.[group] || []).includes(player.id)) || ""
      }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.tieBreakOrder - b.tieBreakOrder);
    const poolCards = LEG_STARS.map(stars => {
      const pool = teamPool(stars);
      return `<article class="f10-pool-card pool-${String(stars).replace(".", "-")}"><header><div><span>${stars}★ OFFICIAL POOL</span><strong>${stars}★ Takım Havuzu</strong></div><b>${pool.length} TAKIM</b></header><div>${pool.map(team => `<span>${escapeHTML(team)}</span>`).join("")}</div></article>`;
    }).join("");
    const passportCards = players.map(player => {
      const byStars = LEG_STARS.map(stars => {
        const entries = player.selections.filter(item => Number(item.stars) === Number(stars));
        const usedKeys = new Set(entries.map(item => item.teamKey || normalize(item.team)));
        const remaining = teamPool(stars).filter(team => !usedKeys.has(normalize(team)));
        const groupUses = entries.filter(item => item.source === "group").length;
        const knockoutUses = entries.filter(item => item.source === "championship").length;
        const usedMarkup = entries.length ? entries.map(item => `<span class="f10-passport-team ${item.source === "championship" ? "is-knockout" : "is-group"}" title="${escapeHTML(`${item.stage} · ${item.opponent}`)}"><b>${escapeHTML(item.team)}</b><small>${escapeHTML(item.stage)}</small></span>`).join("") : `<em>${uiCopy("Henüz takım kullanılmadı", "No team used yet")}</em>`;
        const remainingMarkup = remaining.length
          ? `<details class="f10-passport-eligible"><summary><span>${remaining.length} ${uiCopy("uygun takımın tamamını göster", "show all eligible teams")}</span><b>＋</b></summary><div>${remaining.map(team => `<span>${escapeHTML(team)}</span>`).join("")}</div></details>`
          : `<div class="f10-passport-none">${uiCopy("Bu yıldız seviyesinde uygun takım kalmadı.", "No eligible team remains at this star tier.")}</div>`;
        return `<section class="f10-passport-tier"><header><b>${stars}★</b><small>${usedKeys.size} ${uiCopy("kullanıldı", "used")} · ${remaining.length} ${uiCopy("uygun takım kaldı", "eligible teams remaining")}</small></header><div class="f10-passport-source-counts"><span>${uiCopy("Grup", "Group")}: ${groupUses}</span><span>${uiCopy("Eleme", "Knockout")}: ${knockoutUses}</span></div><div class="f10-passport-used">${usedMarkup}</div>${remainingMarkup}</section>`;
      }).join("");
      const distinctTeams = new Set(player.selections.map(item => item.teamKey || normalize(item.team))).size;
      const knockoutTotal = player.selections.filter(item => item.source === "championship").length;
      return `<article class="f10-passport-card"><header><div><span>GRUP ${escapeHTML(player.group || "–")}</span><strong>${escapeHTML(player.name)}</strong><small>${knockoutTotal ? `${knockoutTotal} ${uiCopy("eleme seçimi dahil", "knockout selections included")}` : uiCopy("Grup aşaması", "Group stage")}</small></div><b>${distinctTeams} TAKIM</b></header>${byStars}${player.missing ? `<p>${player.missing} ${uiCopy("resmî sonuçta takım bilgisi eksik; ilgili maçı açıp tamamlayın.", "official results have missing team data; open and complete the relevant match.")}</p>` : ""}</article>`;
    }).join("");
    const totalSelections = players.reduce((sum, player) => sum + player.selections.length, 0);
    const knockoutSelections = players.reduce((sum, player) => sum + player.selections.filter(item => item.source === "championship").length, 0);
    return `<section class="f10-team-centre">${renderTeamPoolIntelligence(draw, players)}<header><div><span>FIFA 10 TEAM PASSPORT · UNIFIED</span><h4>${uiCopy("Oyuncu Takım Listeleri", "Player Team Lists")}</h4><p>${uiCopy("Grup ve eleme maçlarında kullanılan bütün takımlar tek pasaportta izlenir. Kullanılmış kulüpler otomatik kilitlenir; her yıldız seviyesinde kalan uygun kulüpler aynı karttan açılabilir.", "Every team used in group and knockout matches is tracked in one passport. Used clubs are locked automatically, and remaining eligible clubs can be opened from the same card.")}</p></div><b>${totalSelections} ${uiCopy("SEÇİM", "SELECTIONS")} · ${knockoutSelections} KO</b></header>
      <div class="f10-passport-grid">${passportCards}</div>
      <header class="pool-heading"><div><span>LOCKED CLUB CATALOGUE</span><h4>Sabit Takım Havuzu</h4><p>Fikstür sonucu girerken sadece maçın yıldız seviyesine ait bu kulüpler seçilebilir; havuz dışı serbest takım girişi kapatılmıştır.</p></div><b>${LEG_STARS.reduce((sum, stars) => sum + teamPool(stars).length, 0)} TAKIM</b></header>
      <div class="f10-pool-grid">${poolCards}</div>
    </section>`;
  }

  function officialAwardCandidates(draw) {
    const players = snapshotPlayers(draw);
    const rows = standings(draw).filter(row => row.mp > 0);
    const allDna = players.map(player => ({ player, dna: playerDna(draw, player.id) }));
    const best = (list, compare) => [...list].sort(compare)[0] || null;
    const result = [];
    const add = (id, labelTr, labelEn, entry, metricTr, metricEn) => {
      result.push({
        id,
        label: uiCopy(labelTr, labelEn),
        playerId: entry?.id || entry?.player?.id || "",
        playerName: entry?.name || entry?.player?.name || uiCopy("Veri bekleniyor", "Awaiting data"),
        metric: uiCopy(metricTr, metricEn) || uiCopy("İlgili maçlar oynandığında hesaplanır", "Calculated when relevant matches are played")
      });
    };
    const mvp = best(rows, compareStandingsRows);
    add("mvp", "Turnuva MVP Adayı", "Tournament MVP Candidate", mvp, mvp ? `${mvp.ppg.toFixed(3)} PPG · ${mvp.gdPerMatch > 0 ? "+" : ""}${mvp.gdPerMatch.toFixed(3)} AV/M` : "", mvp ? `${mvp.ppg.toFixed(3)} PPG · ${mvp.gdPerMatch > 0 ? "+" : ""}${mvp.gdPerMatch.toFixed(3)} GD/M` : "");
    const bestAverage = best(rows, (a, b) => b.gdPerMatch - a.gdPerMatch || compareStandingsRows(a, b));
    add("average", "Averaj Ustası", "Goal Difference Master", bestAverage, bestAverage ? `${bestAverage.gdPerMatch > 0 ? "+" : ""}${bestAverage.gdPerMatch.toFixed(3)} AV/M` : "", bestAverage ? `${bestAverage.gdPerMatch > 0 ? "+" : ""}${bestAverage.gdPerMatch.toFixed(3)} GD/M` : "");
    const topAttack = best(rows, (a, b) => b.gfPerMatch - a.gfPerMatch || compareStandingsRows(a, b));
    add("attack", "Hücum Ödülü", "Attack Award", topAttack, topAttack ? `${topAttack.gfPerMatch.toFixed(2)} gol/maç` : "", topAttack ? `${topAttack.gfPerMatch.toFixed(2)} goals/match` : "");
    LEG_STARS.forEach(stars => {
      const tierRows = allDna
        .map(item => ({ ...item.dna.tiers.find(row => Number(row.stars) === Number(stars)), player: item.player }))
        .filter(row => row.mp > 0);
      const specialist = best(tierRows, (a, b) => b.ppg - a.ppg || b.gdPerMatch - a.gdPerMatch || b.mp - a.mp);
      add(`specialist-${stars}`, `${stars}★ Uzmanı`, `${stars}★ Specialist`, specialist, specialist ? `${specialist.ppg.toFixed(3)} PPG` : "", specialist ? `${specialist.ppg.toFixed(3)} PPG` : "");
    });
    const explorer = best(players.map(player => ({
      player,
      count: new Set(playerTeamPassport(draw, player).selections.map(item => normalize(item.team))).size
    })), (a, b) => b.count - a.count || a.player.name.localeCompare(b.player.name, "tr"));
    add("explorer", "Takım Kâşifi", "Team Explorer", explorer, explorer ? `${explorer.count} farklı takım` : "", explorer ? `${explorer.count} different teams` : "");
    const playerLookup = playerMap(draw);
    const upsets = [];
    completedFixtures(draw).forEach(match => {
      if (Number(match.homeScore) === Number(match.awayScore)) return;
      const winnerId = Number(match.homeScore) > Number(match.awayScore) ? match.homeId : match.awayId;
      const loserId = winnerId === match.homeId ? match.awayId : match.homeId;
      const winner = playerLookup.get(winnerId);
      const loser = playerLookup.get(loserId);
      if (!winner || !loser) return;
      upsets.push({ player: winner, eloGap: Number(loser.elo || 0) - Number(winner.elo || 0), match });
    });
    const giantKiller = best(upsets.filter(item => item.eloGap > 0), (a, b) => b.eloGap - a.eloGap || b.match.stars - a.match.stars);
    add("giant-killer", "Dev Avcısı", "Giant Killer", giantKiller, giantKiller ? `+${giantKiller.eloGap} Standing sürprizi` : "", giantKiller ? `+${giantKiller.eloGap} Standing upset` : "");
    return result;
  }

  function renderBroadcastHub(draw) {
    const latest = completedFixtures(draw).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "") || b.sequence - a.sequence)[0];
    const next = buildDynamicSchedule(draw)[0];
    const players = playerMap(draw);
    const scene = (mode, tr, en, noteTr, noteEn) => `<article><span>${uiCopy(tr, en)}</span><strong>${mode.toUpperCase()}</strong><small>${uiCopy(noteTr, noteEn)}</small><button type="button" data-f10draw-action="open-broadcast" data-mode="${mode}">${uiCopy("YAYIN EKRANINI AÇ ↗", "OPEN BROADCAST VIEW ↗")}</button></article>`;
    return `<section class="f10-broadcast-hub"><header><div><span>LIVE BROADCAST · OBS PACKAGE</span><h4>${uiCopy("Canlı Broadcast ve OBS Paketi", "Live Broadcast & OBS Package")}</h4><p>${uiCopy("Şeffaf arka planlı sahneler OBS Browser Source olarak açılır. Puan tablosu, son sonuç, sıradaki maç ve qualification grafiği aynı resmî kaydı okur.", "Transparent scenes open as OBS Browser Sources. Standings, latest result, next match and qualification graphics read the same official state.")}</p></div><b>OBS · 1920×1080</b></header>
      <div class="f10-broadcast-now"><article><span>${uiCopy("SON SONUÇ", "LATEST RESULT")}</span><strong>${latest ? `${escapeHTML(players.get(latest.homeId)?.name || "–")} ${latest.homeScore}–${latest.awayScore} ${escapeHTML(players.get(latest.awayId)?.name || "–")}` : uiCopy("Henüz sonuç yok", "No result yet")}</strong></article><article><span>${uiCopy("SIRADAKİ", "UP NEXT")}</span><strong>${next ? `${escapeHTML(players.get(next.homeId)?.name || "–")} vs ${escapeHTML(players.get(next.awayId)?.name || "–")}` : uiCopy("Grup aşaması tamamlandı", "Group stage complete")}</strong></article></div>
      <div class="f10-broadcast-scenes">
        ${scene("standings", "Genel Puan", "Standings", "PPG ve AV/M odaklı tam tablo", "Full table focused on PPG and GD/M")}
        ${scene("latest", "Son Sonuç", "Latest Result", "Skor, takımlar ve yıldız seviyesi", "Score, teams and star tier")}
        ${scene("next", "Sıradaki Maç", "Up Next", "Dinamik takvimdeki ilk maç", "First match in the dynamic schedule")}
        ${scene("qualification", "Qualification", "Qualification", "1–4 / 5–12 / 13–14 yolları", "Paths for 1–4 / 5–12 / 13–14")}
        ${scene("lowerthird", "Alt Bant", "Lower Third", "Canlı yayın için kompakt bilgi bandı", "Compact live-broadcast ticker")}
      </div>
      <p class="f10-math-note">${uiCopy("OBS kurulumu: Açılan sayfanın adresini Browser Source alanına ekleyin; genişlik 1920, yükseklik 1080 ve özel FPS 30 önerilir.", "OBS setup: add the opened page URL as a Browser Source; 1920×1080 at 30 FPS is recommended.")}</p>
    </section>`;
  }

  function renderAwardsUniverse(draw) {
    const draft = getDraft();
    const candidates = officialAwardCandidates(draw);
    const saved = draft.officialAwards || {};
    const sealed = Boolean(saved.sealedAt);
    const players = snapshotPlayers(draw);
    const options = selected => `<option value="">${uiCopy("Seçilmedi", "Not selected")}</option>${players.map(player => `<option value="${escapeHTML(player.name)}" ${player.name === selected ? "selected" : ""}>${escapeHTML(player.name)}</option>`).join("")}`;
    const completed = completedFixtures(draw).length;
    const archiveReady = completed === draw.fixtures.length;
    const system = payload?.seasonSystem || {};
    const archived = (system.seasons || []).find(item => Number(item.edition) === 10);
    return `<section class="f10-awards-universe"><header><div><span>OFFICIAL AWARDS · PERSISTENT UNIVERSE</span><h4>${uiCopy("Resmî Ödül Motoru ve Sezonlar Arası Evren", "Official Awards Engine & Persistent Universe")}</h4><p>${uiCopy("Canlı adaylar resmî maçlardan otomatik hesaplanır. Yönetici podyumu kaydeder; sezon tamamlandığında FIFA 10, kupa müzesi ve gelecek sezon altyapısıyla birlikte mühürlenir.", "Live candidates are calculated automatically from official matches. The administrator records the podium; once the season is complete, FIFA 10 is sealed with the trophy museum and next-season foundation.")}</p></div><b class="${sealed ? "sealed" : ""}">${sealed ? uiCopy("SEZON MÜHÜRLENDİ", "SEASON SEALED") : `${completed}/${draw.fixtures.length} ${uiCopy("MAÇ", "MATCHES")}`}</b></header>
      <div class="f10-award-grid">${candidates.map(item => `<article><span>${escapeHTML(item.label)}</span><strong>${escapeHTML(item.playerName)}</strong><small>${escapeHTML(item.metric)}</small><em>${sealed ? uiCopy("ARŞİV ADAYI", "ARCHIVE CANDIDATE") : uiCopy("CANLI ADAY", "LIVE CANDIDATE")}</em></article>`).join("")}</div>
      <div class="f10-universe-grid"><form id="f10AwardsUniverseForm"><header><div><span>${uiCopy("RESMÎ PODYUM", "OFFICIAL PODIUM")}</span><strong>FIFA 10</strong></div><small>${archiveReady ? uiCopy("Arşiv mühürlemeye hazır", "Ready to seal archive") : uiCopy("Grup aşaması devam ediyor", "Group stage in progress")}</small></header><label>${uiCopy("Şampiyon", "Champion")}<select name="champion" ${sealed ? "disabled" : ""}>${options(saved.champion)}</select></label><label>${uiCopy("İkinci", "Runner-up")}<select name="runnerUp" ${sealed ? "disabled" : ""}>${options(saved.runnerUp)}</select></label><label>${uiCopy("Üçüncü", "Third place")}<select name="third" ${sealed ? "disabled" : ""}>${options(saved.third)}</select></label><label>${uiCopy("Fair Play", "Fair Play")}<select name="fairPlay" ${sealed ? "disabled" : ""}>${options(saved.fairPlay)}</select></label>${isAdmin() && !sealed ? `<footer><button type="submit" name="intent" value="save">${uiCopy("PODYUM TASLAĞINI KAYDET", "SAVE PODIUM DRAFT")}</button><button type="submit" class="primary" name="intent" value="seal" ${archiveReady ? "" : "disabled"}>${uiCopy("FIFA 10 SEZONUNU MÜHÜRLE", "SEAL FIFA 10 SEASON")}</button></footer>` : ""}</form>
        <article class="f10-universe-archive"><span>CROSS-SEASON UNIVERSE</span><h5>${archived ? uiCopy("FIFA 10 kalıcı arşivde", "FIFA 10 is in the permanent archive") : uiCopy("Kalıcı sezon köprüsü hazır", "Persistent season bridge is ready")}</h5><div><b>FIFA 09</b><i>→</i><b>FIFA 10</b><i>→</i><b>FIFA 11+</b></div><p>${archived ? uiCopy(`${archived.matches?.length || 0} grup maçı, podyum ve ödül adayları kupa müzesine bağlandı.`, `${archived.matches?.length || 0} group matches, podium and award candidates are linked to the trophy museum.`) : uiCopy("Mühürleme; oyuncuları, grupları, 78 resmî grup maçını, genel sıralamayı, takım pasaportlarını ve ödül anlık görüntüsünü saklar.", "Sealing preserves players, groups, all 78 official group matches, the overall table, team passports and the awards snapshot.")}</p><small>${uiCopy("FIFA 09 verisi değişmez; FIFA 11 taslağı yalnızca bir sonraki sezon başlangıç noktası olarak oluşur.", "FIFA 09 data remains unchanged; the FIFA 11 blueprint is created only as the next-season starting point.")}</small></article></div>
    </section>`;
  }

  async function saveAwardsUniverse(form, requestedIntent = "save") {
    if (!isAdmin()) throw new Error(uiCopy("Bu işlem için yönetici yetkisi gerekir.", "Administrator access is required."));
    const data = new FormData(form);
    const intent = String(requestedIntent || data.get("intent") || "save");
    const podium = {
      champion: String(data.get("champion") || "").trim(),
      runnerUp: String(data.get("runnerUp") || "").trim(),
      third: String(data.get("third") || "").trim(),
      fairPlay: String(data.get("fairPlay") || "").trim()
    };
    const podiumNames = [podium.champion, podium.runnerUp, podium.third];
    if (intent === "seal") {
      if (completedFixtures(getDraw()).length !== getDraw().fixtures.length) throw new Error(uiCopy("Sezon, 78 grup maçının tamamı bitmeden mühürlenemez.", "The season cannot be sealed before all 78 group matches are complete."));
      if (podiumNames.some(name => !name) || new Set(podiumNames).size !== 3) throw new Error(uiCopy("Şampiyon, ikinci ve üçüncü için üç farklı oyuncu seçin.", "Select three different players for champion, runner-up and third place."));
      if (!window.confirm(uiCopy("FIFA 10 sezonu kalıcı arşive mühürlenecek. Devam edilsin mi?", "FIFA 10 will be sealed into the permanent archive. Continue?"))) return;
    }
    await mutatePayload(next => {
      const draft = getDraft(next);
      if (draft.officialAwards?.sealedAt) throw new Error(uiCopy("FIFA 10 sezonu zaten mühürlenmiş.", "The FIFA 10 season has already been sealed."));
      const draw = draft.draw;
      const awardSnapshot = officialAwardCandidates(draw).map(item => ({ ...item }));
      draft.officialAwards = {
        ...podium,
        candidates: awardSnapshot,
        updatedAt: nowISO(),
        ...(intent === "seal" ? { sealedAt: nowISO() } : {})
      };
      if (intent !== "seal") return;
      const system = next.seasonSystem;
      system.customHonours = Array.isArray(system.customHonours) ? system.customHonours : [];
      system.seasons = Array.isArray(system.seasons) ? system.seasons : [];
      const honour = { id: "honour-fifa-10-official", edition: 10, competition: "oruc", winner: podium.champion, runnerUp: podium.runnerUp, third: podium.third };
      const honourIndex = system.customHonours.findIndex(item => Number(item.edition) === 10 && normalize(item.competition) === "oruc");
      if (honourIndex >= 0) system.customHonours[honourIndex] = honour;
      else system.customHonours.push(honour);
      const players = snapshotPlayers(draw);
      const names = playerMap(draw);
      const archive = {
        id: "season-fifa-10-triple-circuit",
        edition: 10,
        status: "completed",
        format: "FIFA 10 Triple Circuit",
        champion: podium.champion,
        runnerUp: podium.runnerUp,
        third: podium.third,
        fairPlay: podium.fairPlay,
        participants: players,
        groups: deepClone(draw.groups || {}),
        matches: completedFixtures(draw).map(match => ({
          id: match.id, edition: 10, stage: "Group Stage", group: match.group,
          stars: Number(match.stars), homeId: match.homeId, awayId: match.awayId,
          homeName: names.get(match.homeId)?.name || "", awayName: names.get(match.awayId)?.name || "",
          homeTeam: match.homeTeam || "", awayTeam: match.awayTeam || "",
          homeScore: Number(match.homeScore), awayScore: Number(match.awayScore),
          updatedAt: match.updatedAt || null
        })),
        standings: standings(draw),
        awards: deepClone(draft.officialAwards),
        teamPassports: players.map(player => playerTeamPassport(draw, player)),
        completedAt: nowISO(),
        archivedAt: nowISO(),
        source: "fifa10-official-universe-seal"
      };
      const seasonIndex = system.seasons.findIndex(item => Number(item.edition) === 10);
      if (seasonIndex >= 0) system.seasons[seasonIndex] = archive;
      else system.seasons.push(archive);
      system.nextSeasonBlueprint = {
        edition: 11,
        status: "draft",
        sourceEdition: 10,
        createdAt: nowISO(),
        players: players.map(player => ({ id: player.id, name: player.name, elo: player.elo }))
      };
      draft.universeArchive = { edition: 10, sealedAt: nowISO(), seasonId: archive.id, nextEdition: 11 };
    }, intent === "seal" ? uiCopy("FIFA 10 kalıcı evrene mühürlendi.", "FIFA 10 was sealed into the persistent universe.") : uiCopy("Podyum taslağı kaydedildi.", "Podium draft saved."));
  }

  function formatSyncTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "–";
    return date.toLocaleString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function renderSyncStatus() {
    const history = readSyncHistory();
    const latest = history[0];
    const status = syncStatusMeta(latest);
    const pending = latest?.status === "error" ? 1 : 0;
    return `<section class="f10-sync-strip status-${status.key}"><i></i><div><span>${status.label}</span><strong>${escapeHTML(status.detail)}</strong><small>${latest ? formatSyncTime(latest.at) : uiCopy("Kayıt bekleniyor", "Waiting for a save")}${pending ? ` · ${pending} ${uiCopy("bekleyen kayıt", "pending save")}` : ""}</small></div><button type="button" data-f10draw-action="sync-history">${uiCopy("SENKRON GEÇMİŞİ", "SYNC HISTORY")} ↗</button></section>`;
  }

  function openSyncHistoryModal() {
    const history = readSyncHistory();
    const overlay = document.createElement("div");
    overlay.id = "f10DrawModal";
    overlay.className = "f10-draw-modal-backdrop";
    overlay.innerHTML = `<section class="f10-draw-modal f10-sync-modal" role="dialog" aria-modal="true"><header><div><span>DEVICE · CLOUD · LIVE SITE</span><h3>${uiCopy("Senkron Geçmişi", "Sync History")}</h3></div><button type="button" data-f10draw-action="close-modal" aria-label="${uiCopy("Kapat", "Close")}">×</button></header><div class="f10-sync-history">${history.length ? history.map(item => {
      const status = syncStatusMeta(item);
      return `<article class="status-${status.key}"><i></i><div><strong>${status.label}</strong><span>${escapeHTML(status.detail)}</span><small>${formatSyncTime(item.at)}</small></div></article>`;
    }).join("") : `<p>${uiCopy("Henüz kayıt geçmişi yok. İlk sonuç kaydından sonra cihaz ve bulut adımları burada görünecek.", "There is no save history yet. Device and cloud steps will appear here after the first result is saved.")}</p>`}</div>${history[0]?.status === "error" && isAdmin() ? `<footer><button type="button" class="primary" data-f10draw-action="retry-sync">${uiCopy("BULUT SENKRONUNU YENİDEN DENE", "RETRY CLOUD SYNC")}</button></footer>` : ""}</section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", event => { if (event.target === overlay) closeModal(); });
  }

  function renderTvOverlay(draw) {
    if (!tvModeOpen || !draw) return;
    let overlay = document.getElementById("f10TvOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "f10TvOverlay";
      overlay.className = "f10-tv-overlay";
      document.body.appendChild(overlay);
    }
    const players = playerMap(draw);
    const rows = standings(draw);
    const completed = completedFixtures(draw)
      .sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "") || b.sequence - a.sequence)
      .slice(0, 5);
    const pending = (draw.fixtures || [])
      .filter(match => !match.completed)
      .sort((a, b) => a.leg - b.leg || a.group.localeCompare(b.group) || a.matchday - b.matchday)
      .slice(0, 6);
    const played = completedFixtures(draw).length;
    overlay.innerHTML = `<header><div><span>ORUÇ REİS FOOTBALL UNIVERSE · FIFA 10</span><h2>${uiCopy("CANLI TURNUVA DUVARI", "LIVE TOURNAMENT WALL")}</h2></div><div><strong>${played}/${draw.fixtures.length}</strong><small>${uiCopy("GRUP MAÇI", "GROUP MATCHES")}</small></div><time id="f10TvClock">${new Date().toLocaleTimeString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", { hour:"2-digit", minute:"2-digit" })}</time><button type="button" data-f10draw-action="close-tv" aria-label="${uiCopy("TV modunu kapat", "Close TV mode")}">×</button></header><main><section class="f10-tv-table"><header><strong>${uiCopy("GENEL PUAN", "OVERALL TABLE")}</strong><span>PPG · ${uiCopy("AV/M", "GD/M")}</span></header><div>${rows.map(row => { const path = qualificationLabel(row.rank); return `<article class="path-${path.key}"><b>${row.rank}</b><strong>${escapeHTML(row.name)}</strong><span>${row.group}</span><em>${row.ppg.toFixed(3)}</em><small>${row.gdPerMatch > 0 ? "+" : ""}${row.gdPerMatch.toFixed(3)}</small></article>`; }).join("")}</div></section><div class="f10-tv-side"><section><header><strong>${uiCopy("SON SONUÇLAR", "LATEST RESULTS")}</strong></header><div>${completed.map(match => `<article><span>${match.group} · ${match.stars}★</span><strong>${escapeHTML(players.get(match.homeId)?.name || "–")} <b>${match.homeScore}–${match.awayScore}</b> ${escapeHTML(players.get(match.awayId)?.name || "–")}</strong></article>`).join("") || `<p>${uiCopy("Henüz sonuç yok.", "No results yet.")}</p>`}</div></section><section><header><strong>${uiCopy("SIRADAKİ MAÇLAR", "UP NEXT")}</strong></header><div>${pending.map(match => `<article><span>${match.group} · ${match.stars}★ · MD ${match.matchday}</span><strong>${escapeHTML(players.get(match.homeId)?.name || "–")} <b>VS</b> ${escapeHTML(players.get(match.awayId)?.name || "–")}</strong></article>`).join("") || `<p>${uiCopy("Bütün maçlar tamamlandı.", "All matches are complete.")}</p>`}</div></section></div></main><footer><span>${uiCopy("1–4 DOĞRUDAN QF", "1–4 DIRECT QF")}</span><span>5–12 CHAMPIONSHIP PLAY-IN · BEST OF 3</span><span>${uiCopy("13–14 DOĞRUDAN ELENDİ", "13–14 ELIMINATED")}</span></footer>`;
  }

  function openTvMode() {
    const draw = getDraw();
    if (!draw) return;
    tvModeOpen = true;
    document.body.classList.add("f10-tv-open");
    renderTvOverlay(draw);
    const overlay = document.getElementById("f10TvOverlay");
    if (overlay?.requestFullscreen) overlay.requestFullscreen().catch(() => {});
    clearInterval(tvClockTimer);
    tvClockTimer = setInterval(() => {
      const clock = document.getElementById("f10TvClock");
      if (clock) clock.textContent = new Date().toLocaleTimeString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", { hour:"2-digit", minute:"2-digit" });
    }, 1000);
  }

  function closeTvMode() {
    tvModeOpen = false;
    clearInterval(tvClockTimer);
    tvClockTimer = null;
    document.body.classList.remove("f10-tv-open");
    document.getElementById("f10TvOverlay")?.remove();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  function renderModule() {
    const view = document.getElementById("view");
    if (!view) return;
    syncPayloadFromApplication();
    patchExistingInterface();
    const pageTitle = document.getElementById("pageTitle")?.textContent || "";
    const relevant = Boolean(view.querySelector("#fifa10Registration, .f10-triple-page, .fifa10-era-dashboard")) || /FIFA 10/.test(pageTitle);
    const existing = document.getElementById("fifa10DrawCentre");
    if (!relevant) {
      existing?.remove();
      return;
    }
    const draft = getDraft();
    const draw = draft.draw || null;
    const status = statusMeta(draw);
    if (draw?.status === "completed" && sessionStorage.getItem("fifa10-draw-tab-autoset") !== `${draw.drawId}:${BUILD}`) {
      const groupLeagueSealed = Boolean((draw.fixtures || []).length) && (draw.fixtures || []).every(match => match.completed);
      activeTab = groupLeagueSealed ? "championship" : ((draw.fixtures || []).some(match => match.completed) ? "fixtures" : "groups");
      sessionStorage.setItem("fifa10-draw-tab-autoset", `${draw.drawId}:${BUILD}`);
      persistViewState();
    }
    let section = existing;
    const operationsMount = view.querySelector("#fifa10OperationsMount");
    if (!section) {
      section = document.createElement("section");
      section.id = "fifa10DrawCentre";
      section.className = "f10-draw-centre";
      const registration = view.querySelector("#fifa10Registration");
      if (operationsMount) operationsMount.append(section);
      else if (registration) registration.insertAdjacentElement("afterend", section);
      else view.insertAdjacentElement("afterbegin", section);
    } else if (operationsMount && section.parentElement !== operationsMount) {
      operationsMount.append(section);
    }
    const tabs = [
      ["championship", uiCopy("MAÇLAR · AĞAÇ · PUAN", "MATCHES · BRACKET · TABLE")],
      ["fixtures", uiCopy("MAÇLAR & SONUÇLAR", "MATCHES & RESULTS")],
      ["standings", uiCopy("RESMÎ PUAN TABLOSU", "OFFICIAL STANDINGS")],
      ["qualification", uiCopy("ELEME YOLU", "QUALIFICATION PATH")],
      ["draw", uiCopy("KURA", "DRAW")],
      ["groups", uiCopy("GRUPLAR", "GROUPS")],
      ["schedule", uiCopy("TAKVİM", "SCHEDULE")],
      ["teams", uiCopy("TAKIMLAR", "TEAMS")],
      ["players", uiCopy("OYUNCU MERKEZİ", "PLAYER CENTRE")],
      ["dna", "DNA & H2H"],
      ["broadcast", uiCopy("YAYIN", "BROADCAST")],
      ["awards", uiCopy("ÖDÜLLER & EVREN", "AWARDS & UNIVERSE")],
      ["evolution", "EVOLUTION OS"],
      ["universe", uiCopy("EVREN ZEKÂSI", "UNIVERSE INTELLIGENCE")]
    ];
    const participantCount = draw?.participants?.length || registrationRows().length;
    const sizeText = projectedGroupSizes(participantCount).join("-");
    const fixedGroups = draw?.entryMode === "official-fixed-groups";
    const completedCount = draw?.fixtures?.filter(match => match.completed).length || 0;
    const html = `<header class="f10-draw-hero"><div><span>FIFA 10 · TOURNAMENT OPERATIONS</span><h3>${fixedGroups ? uiCopy("Resmî fikstür.", "Official fixtures.") : uiCopy("Kura çekimi.", "Group draw.")}<br><em>${uiCopy("Üç grup, tek sıralama.", "Three groups, one table.")}</em></h3><p>${fixedGroups ? uiCopy(`A, B ve C grupları kesinleşti. ${draw.fixtures?.length || 78} maçlık 4★, 4.5★ ve 5★ devreleri bu merkezden yönetilir; her sonuç bütün FIFA evrenine aynı anda işlenir.`, `Groups A, B and C are confirmed. The ${draw.fixtures?.length || 78}-match 4★, 4.5★ and 5★ circuits are managed here; every result updates the entire FIFA universe at once.`) : uiCopy(`${participantCount} katılımcı Standing torbalarından canlı kurayla A, B ve C gruplarına dağıtılır. Beklenen grup dağılımı ${sizeText}; hangi grupların büyük olacağı yalnızca kura sırasında belirlenir.`, `${participantCount} participants are assigned from Standing pots to Groups A, B and C in the live draw. The projected group distribution is ${sizeText}; the larger groups are determined only by the draw.`)}</p></div><aside class="status-${status.key}"><i></i><strong>${status.label}</strong><small>${fixedGroups ? uiCopy(`${completedCount}/${draw.fixtures?.length || 78} sonuç işlendi`, `${completedCount}/${draw.fixtures?.length || 78} results recorded`) : status.note}</small>${draw?.fivePlayerGroups?.length ? `<b>${uiCopy(`5 OYUNCULU GRUP${draw.fivePlayerGroups.length > 1 ? "LAR" : ""}`, `5-PLAYER GROUP${draw.fivePlayerGroups.length > 1 ? "S" : ""}`)} · ${draw.fivePlayerGroups.join(" / ")}</b>` : `<b>${uiCopy("GRUP BÜYÜKLÜKLERİ · KURADA", "GROUP SIZES · DECIDED IN DRAW")}</b>`}</aside></header>
      <nav class="f10-draw-tabs">${tabs.map(([id, label]) => `<button type="button" class="${activeTab === id ? "active" : ""} ${id === "championship" ? "championship-primary-tab" : ""}" data-f10draw-action="tab" data-tab="${id}" ${!draw && id !== "draw" ? "disabled" : ""}>${label}</button>`).join("")}${draw?.status === "completed" ? `<button type="button" class="f10-tv-launch" data-f10draw-action="open-tv">${uiCopy("TV MODU", "TV MODE")} ↗</button><button type="button" class="f10-print-launch" data-f10draw-action="print-centre">${uiCopy("YAZDIRMA MERKEZİ", "PRINT CENTRE")} ↗</button>` : ""}</nav>
      <div class="f10-operation-notice ${operationNotice.type || "info"}"><strong>${operationNotice.type === "success" ? "✓" : operationNotice.type === "warning" ? "!" : "i"}</strong><span>${escapeHTML(operationNotice.text || "")}</span></div>
      ${draw?.status === "completed" ? renderSyncStatus() : ""}
      ${draw?.status === "completed" ? `<section class="f10-connected-universe"><div><span>ONE SOURCE · CONNECTED UNIVERSE</span><strong>${uiCopy("Bir sonucu gir; bütün merkezler birlikte güncellensin.", "Enter one result; update every centre together.")}</strong><small>${uiCopy("Form, oran, Zekâ, canlı maç, takımlar ve tüm zamanlar aynı resmî FIFA 10 maç kaydını okur.", "Form, odds, Intelligence, live matches, teams and all-time records read the same official FIFA 10 match record.")}</small></div><nav><button type="button" data-f10draw-action="universe-nav" data-target="livestats">${uiCopy("Canlı İstatistik", "Live Stats")}</button><button type="button" data-f10draw-action="universe-nav" data-target="form">${uiCopy("Form", "Form")}</button><button type="button" data-f10draw-action="universe-nav" data-target="odds">${uiCopy("Oranlar", "Odds")}</button><button type="button" data-f10draw-action="universe-nav" data-target="intelligence">${uiCopy("Zekâ", "Intelligence")}</button><button type="button" data-f10draw-action="universe-nav" data-target="teams">${uiCopy("Takımlar", "Teams")}</button><button type="button" data-f10draw-action="universe-nav" data-target="alltime">${uiCopy("Tüm Zamanlar", "All-Time")}</button></nav></section>` : ""}
      <div class="f10-draw-content">${
        activeTab === "draw" ? renderDrawArena(draw)
          : activeTab === "groups" ? (draw ? renderGroupTables(draw) : renderDrawArena(null))
            : activeTab === "standings" ? (draw?.status === "completed" ? renderStandings(draw) : renderDrawArena(draw))
              : activeTab === "qualification" ? (draw?.status === "completed" ? renderQualificationCentre(draw) : renderDrawArena(draw))
                : activeTab === "fixtures" ? (draw?.status === "completed" ? renderFixtures(draw) : renderDrawArena(draw))
                  : activeTab === "schedule" ? (draw?.status === "completed" ? renderDynamicSchedule(draw) : renderDrawArena(draw))
                    : activeTab === "teams" ? (draw?.status === "completed" ? renderTeamPassports(draw) : renderDrawArena(draw))
                      : activeTab === "players" ? (draw?.status === "completed" ? renderPlayerMatchCentre(draw) : renderDrawArena(draw))
                        : activeTab === "dna" ? (draw?.status === "completed" ? renderPlayerDnaCentre(draw) : renderDrawArena(draw))
                          : activeTab === "broadcast" ? (draw?.status === "completed" ? renderBroadcastHub(draw) : renderDrawArena(draw))
                            : activeTab === "awards" ? (draw?.status === "completed" ? renderAwardsUniverse(draw) : renderDrawArena(draw))
                              : activeTab === "championship" ? (draw?.status === "completed" ? `<div id="f10ChampionshipOSRoot"></div>` : renderDrawArena(draw))
                                : activeTab === "evolution" ? (draw?.status === "completed" ? `<div id="f10EvolutionOSRoot"></div>` : renderDrawArena(draw))
                                  : activeTab === "universe" ? (draw?.status === "completed" ? `<div id="f10UniverseIntelligenceRoot"></div>` : renderDrawArena(draw))
                                    : renderDrawArena(draw)
      }</div>
      <footer class="f10-draw-footer"><span>${uiCopy("GENEL SIRALAMA: PPG → MAÇ BAŞINA AVERAJ → TOPLAM ATILAN GOL → GALİBİYET ORANI → KURA SIRASI", "OVERALL RANKING: PPG → GOAL DIFFERENCE PER MATCH → TOTAL GOALS FOR → WIN RATE → DRAW ORDER")}</span><b>RATE-BASED FAIR TABLE · NO VOLUME ADVANTAGE</b></footer>`;
    const renderSignature = JSON.stringify({
      tab: activeTab,
      groupFilter: fixtureGroupFilter,
      legFilter: fixtureLegFilter,
      admin: isAdmin(),
      busy: moduleBusy,
      auto: autoDrawing,
      notice: `${operationNotice.type || "info"}:${operationNotice.text || ""}`,
      selectedPlayer: selectedPlayerRef,
      rivalPlayer: rivalPlayerRef,
      scheduleMinutes: scheduleMatchMinutes,
      quickPlayer: quickPlayerFilter,
      sync: readSyncHistory()[0]?.id || "",
      registrations: registrationRows().map(row => `${row.id}:${row.elo}`).join("|"),
      draw: draw ? `${draw.drawId}:${draw.status}:${draw.updatedAt}:${draw.assignments?.length || 0}:${draw.fixtures?.filter(item => item.completed).length || 0}` : "none"
    });
    // Keep the signature on the actual centre node. Comparing serialized
    // innerHTML is unstable because browsers normalize the markup; the old
    // comparison fed this module's own MutationObserver forever, blocking
    // clicks on desktop and destroying newly opened sheets on mobile.
    let replaced = false;
    if (section.dataset.f10RenderSignature !== renderSignature) {
      section.innerHTML = html;
      section.dataset.f10RenderSignature = renderSignature;
      lastRenderSignature = renderSignature;
      replaced = true;
    }
    const universeMount = section.querySelector("#f10UniverseIntelligenceRoot");
    if (activeTab === "universe" && draw?.status === "completed" && universeMount && (replaced || !universeMount.dataset.fuiReady)) {
      try {
        window.FIFA_UNIVERSE_INTELLIGENCE?.render(payload, draw, { mount: universeMount });
        universeMount.dataset.fuiReady = "true";
      } catch (error) {
        console.error("Universe Intelligence render failed", error);
        universeMount.innerHTML = `<div class="f10-empty">${uiCopy("Evren Zekâsı geçici olarak yüklenemedi. Resmî sonuç girişi etkilenmedi.", "Universe Intelligence could not load temporarily. Official result entry remains unaffected.")}</div>`;
        universeMount.dataset.fuiReady = "error";
      }
    }
    const championshipMount = section.querySelector("#f10ChampionshipOSRoot");
    if (activeTab === "championship" && draw?.status === "completed" && championshipMount && (replaced || !championshipMount.dataset.fcoReady)) {
      try {
        window.FIFA_CHAMPIONSHIP_OS?.render(payload, draw, { mount: championshipMount });
        championshipMount.dataset.fcoReady = "true";
      } catch (error) {
        console.error("Championship OS render failed", error);
        championshipMount.innerHTML = `<div class="f10-empty">${uiCopy("Championship OS geçici olarak yüklenemedi. Resmî sonuç girişi etkilenmedi.", "Championship OS could not load temporarily. Official result entry remains unaffected.")}</div>`;
        championshipMount.dataset.fcoReady = "error";
      }
    }
    const evolutionMount = section.querySelector("#f10EvolutionOSRoot");
    if (activeTab === "evolution" && draw?.status === "completed" && evolutionMount && (replaced || !evolutionMount.dataset.evoReady)) {
      try {
        window.FIFA_EVOLUTION_OS?.render(payload, draw, { mount: evolutionMount });
        evolutionMount.dataset.evoReady = "true";
      } catch (error) {
        console.error("Evolution OS render failed", error);
        evolutionMount.innerHTML = `<div class="f10-empty">${uiCopy("Evolution OS geçici olarak yüklenemedi. Resmî sonuç girişi etkilenmedi.", "Evolution OS could not load temporarily. Official result entry remains unaffected.")}</div>`;
        evolutionMount.dataset.evoReady = "error";
      }
    }
    patchRegistrationLock(draw);
    syncManualGroupOverlay();
    renderTvOverlay(draw);
  }

  function patchExistingInterface() {
    const navLabel = document.querySelector('.os-primary-nav [data-nav="seasonhub"] span');
    if (navLabel && navLabel.textContent !== "FIFA 10 Elemeler") navLabel.textContent = "FIFA 10 Elemeler";
    const version = document.querySelector(".sidebar-version");
    const versionText = `Football Universe · V${VERSION} · Championship Frontline`;
    if (version && version.textContent !== versionText) version.textContent = versionText;
    const meta = document.querySelector('meta[name="fifa9-build"]');
    const metaValue = `${VERSION}-championship-frontline`;
    if (meta && meta.content !== metaValue) meta.content = metaValue;
    const url = new URL(location.href);
    if (url.searchParams.get("fifa9build") !== BUILD) {
      url.searchParams.set("fifa9build", BUILD);
      history.replaceState(history.state, "", url);
    }
    document.querySelectorAll(".f10-format-spine article").forEach(article => {
      const tag = article.querySelector("small")?.textContent?.trim();
      if (tag === "GROUP DRAW") {
        const metaNode = article.querySelector("strong");
        const count = registrationRows().length;
        const sizes = projectedGroupSizes(count).join("-");
        const copy = `${count} oyuncu · ${sizes} · grup büyüklükleri kurada belirlenir`;
        if (metaNode && metaNode.textContent !== copy) metaNode.textContent = copy;
      }
      if (tag === "ONE TABLE") {
        const desc = article.querySelector("p");
        const metaNode = article.querySelector("strong");
        if (desc && desc.textContent !== "Bütün oyuncular tek tabloda PPG ve maç başına averajla adil biçimde sıralanır.") desc.textContent = "Bütün oyuncular tek tabloda PPG ve maç başına averajla adil biçimde sıralanır.";
        if (metaNode && metaNode.textContent !== "PPG · AV/M · toplam AG · galibiyet oranı") metaNode.textContent = "PPG · AV/M · toplam AG · galibiyet oranı";
      }
    });
    const footer = document.querySelector("#fifa10Registration > footer span");
    const footerText = "Torbalar Standing Rating sırasıyla 3'er oyuncu olarak doldu. Dört tam torbadan her gruba birer oyuncu gidecek; Torba 5 oyuncusunun çekildiği grup 5 kişilik olacak.";
    if (footer && footer.textContent !== footerText) footer.textContent = footerText;
    document.querySelectorAll(".f10-elo-explainer article").forEach(article => {
      const value = article.querySelector(":scope > span");
      const copy = article.querySelector("p");
      if (value?.textContent?.trim() === "1500" || copy?.textContent?.includes("1500 ELO") || copy?.textContent?.includes("1500 Standing")) {
        if (value) value.textContent = String(NEW_PLAYER_ELO);
        if (copy) copy.textContent = `Yeni oyuncular sisteme ${NEW_PLAYER_ELO} geçici Standing Rating ile girer.`;
      }
    });
  }

  function patchRegistrationLock(draw) {
    const locked = Boolean(draw);
    const section = document.getElementById("fifa10Registration");
    if (!section) return;
    section.classList.toggle("f10-registration-draw-locked", locked);
    if (locked) {
      section.querySelectorAll('[data-action="remove-fifa10-registration"]').forEach(button => {
        button.disabled = true;
        button.hidden = true;
      });
      const submit = section.querySelector(".f10-registration-submit");
      if (submit) submit.disabled = true;
    }
  }

  function persistViewState() {
    sessionStorage.setItem("fifa10-draw-active-tab", activeTab);
    sessionStorage.setItem("fifa10-fixture-group", fixtureGroupFilter);
    sessionStorage.setItem("fifa10-fixture-leg", String(fixtureLegFilter));
    sessionStorage.setItem("fifa10-selected-player", selectedPlayerRef);
    sessionStorage.setItem("fifa10-rival-player", rivalPlayerRef);
    sessionStorage.setItem("fifa10-quick-player", quickPlayerFilter);
  }

  function scheduleRender() {
    if (resultModalOpen()) {
      renderDeferredWhileModal = true;
      return;
    }
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      try { renderModule(); } catch (error) { console.warn("FIFA 10 draw render failed", error); }
    });
  }

  async function reloadAll() {
    // Never refresh payload/registration state underneath active result entry.
    if (resultModalOpen() || moduleBusy) return;
    await Promise.all([fetchPayload(), fetchRegistrations()]);
    subscribeRealtime();
    scheduleRender();
  }

  function subscribeRealtime() {
    // The primary application already owns the tournament-state Realtime channel.
    // Reuse that state instead of opening a second channel that can duplicate
    // updates, render passes and user notifications.
    if (window.FIFA_APP_CONTEXT?.getState) return;
    const client = cloudClient();
    if (!client || realtimeChannel) return;
    realtimeChannel = client
      .channel(`fifa10-draw-engine-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "tournament_state",
        filter: `id=eq.${rowId()}`
      }, event => {
        if (event.new?.payload) {
          payload = ensurePayloadShape(event.new.payload);
          lastLoadAt = Date.now();
          scheduleRender();
        }
      })
      .subscribe();
  }

  async function waitForApplication() {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const appReady = document.getElementById("view") && window.FIFA10_REGISTRATION_CLOUD && window.FIFA_CLOUD;
      const cloudReady = !cloudConfigured() || Boolean(cloudClient());
      if (appReady && cloudReady) return true;
      await sleep(100);
    }
    return false;
  }

  function installStyles() {
    if (document.getElementById("fifa10DrawStyles")) return;
    const style = document.createElement("style");
    style.id = "fifa10DrawStyles";
    style.textContent = `
      :root{--f10d-bg:#050b1d;--f10d-panel:#0b1433;--f10d-panel2:#11183d;--f10d-line:rgba(125,151,255,.22);--f10d-blue:#45a7ff;--f10d-purple:#9d67ff;--f10d-magenta:#df52f4;--f10d-ice:#f4f7ff;--f10d-muted:#9aa7c9;--f10d-gold:#e5bd63;--f10d-green:#52e4a0;--f10d-red:#ff657b}
      .f10-draw-centre{position:relative;margin:28px 0;border:1px solid var(--f10d-line);border-radius:30px;overflow:hidden;background:linear-gradient(145deg,rgba(7,16,43,.98),rgba(24,16,58,.96));box-shadow:0 34px 90px rgba(0,0,0,.3)}
      .f10-draw-centre:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 0%,rgba(69,167,255,.14),transparent 33%),radial-gradient(circle at 90% 10%,rgba(223,82,244,.12),transparent 30%)}
      .f10-draw-hero{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:24px;padding:38px 42px;border-bottom:1px solid var(--f10d-line)}
      .f10-draw-hero>div>span,.f10-draw-hero aside b,.f10-draw-footer,.f10-draw-tabs button{font-size:10px;letter-spacing:.17em;font-weight:900;text-transform:uppercase}
      .f10-draw-hero>div>span{color:#82bfff}.f10-draw-hero h3{margin:12px 0 14px;font-size:clamp(34px,5vw,68px);line-height:.94;color:var(--f10d-ice);letter-spacing:-.05em}.f10-draw-hero h3 em{font-style:normal;background:linear-gradient(90deg,#77c7ff,#b78cff,#ef77db);-webkit-background-clip:text;color:transparent}.f10-draw-hero p{max-width:790px;margin:0;color:var(--f10d-muted);font-size:15px;line-height:1.75}
      .f10-draw-hero aside{align-self:start;display:grid;gap:8px;padding:19px 20px;border:1px solid var(--f10d-line);border-radius:18px;background:rgba(10,18,46,.78)}.f10-draw-hero aside i{width:9px;height:9px;border-radius:50%;background:var(--f10d-blue);box-shadow:0 0 15px currentColor}.f10-draw-hero aside strong{color:var(--f10d-ice);font-size:13px}.f10-draw-hero aside small{color:var(--f10d-muted)}.f10-draw-hero aside b{color:var(--f10d-gold);margin-top:6px}.f10-draw-hero aside.status-live i{background:var(--f10d-green)}.f10-draw-hero aside.status-complete i{background:var(--f10d-gold)}
      .f10-draw-tabs{position:relative;display:flex;gap:8px;padding:15px 28px;border-bottom:1px solid var(--f10d-line);background:rgba(3,8,24,.48);overflow:auto}.f10-draw-tabs button{border:1px solid transparent;border-radius:12px;padding:12px 18px;color:#8e9abd;background:transparent;cursor:pointer;white-space:nowrap}.f10-draw-tabs button.active{color:white;border-color:rgba(116,153,255,.4);background:linear-gradient(90deg,rgba(69,167,255,.18),rgba(157,103,255,.2))}.f10-draw-tabs button:disabled{opacity:.35;cursor:not-allowed}.f10-draw-tabs .f10-print-launch{margin-left:auto;border-color:rgba(229,189,99,.34);color:var(--f10d-gold);background:rgba(229,189,99,.08)}
      .f10-draw-content{position:relative;padding:30px}.f10-draw-footer{position:relative;display:flex;justify-content:space-between;gap:20px;padding:17px 30px;border-top:1px solid var(--f10d-line);color:#94a4c8}.f10-draw-footer b{color:#78c8ff}
      .f10-draw-ready-panel{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:26px;border:1px solid var(--f10d-line);border-radius:22px;background:linear-gradient(120deg,rgba(30,53,103,.38),rgba(80,36,107,.2));margin-bottom:22px}.f10-draw-ready-panel span{font-size:10px;letter-spacing:.18em;color:#7cc5ff;font-weight:900}.f10-draw-ready-panel h4{font-size:30px;color:white;margin:8px 0}.f10-draw-ready-panel p{max-width:760px;color:var(--f10d-muted);line-height:1.65}.f10-draw-primary,.f10-draw-controls button{border:1px solid var(--f10d-line);border-radius:13px;padding:13px 18px;font-weight:900;color:white;background:rgba(28,40,81,.75);cursor:pointer}.f10-draw-primary{background:linear-gradient(90deg,#347fff,#a84df3)!important;border:0!important;box-shadow:0 12px 30px rgba(74,82,255,.24)}.f10-draw-controls button.danger{color:#ff95a5;border-color:rgba(255,101,123,.3)}.f10-draw-controls button:disabled{opacity:.45;cursor:wait}.f10-public-wait{color:var(--f10d-gold)}
      .f10-draw-pots{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.f10-draw-pots article{border:1px solid var(--f10d-line);border-radius:18px;overflow:hidden;background:rgba(7,14,37,.7)}.f10-draw-pots article>header{display:grid;grid-template-columns:1fr auto;gap:4px;padding:15px;border-bottom:1px solid var(--f10d-line)}.f10-draw-pots header span{font-size:9px;letter-spacing:.16em;color:#8492b7}.f10-draw-pots header b{font-size:27px;color:var(--f10d-gold)}.f10-draw-pots header small{grid-column:1/3;color:#7ec8ff}.f10-draw-pots article>div{padding:10px;display:grid;gap:8px}.f10-draw-pots article>div>div{display:grid;gap:4px;padding:11px;border-radius:11px;background:rgba(255,255,255,.045)}.f10-draw-pots strong{font-size:12px;color:white}.f10-draw-pots span{font-size:10px;color:#7dc7ff}.f10-draw-pots em{font-style:normal;color:#d699ff;font-size:9px;font-weight:900;letter-spacing:.12em}.f10-draw-pots p{color:#7f8caf;font-size:11px}
      .f10-draw-stage{display:grid;grid-template-columns:310px minmax(0,1fr);gap:18px}.f10-live-reveal{grid-row:span 2;display:flex;flex-direction:column;justify-content:center;min-height:390px;padding:28px;border:1px solid rgba(117,159,255,.34);border-radius:24px;background:radial-gradient(circle at 50% 35%,rgba(88,145,255,.25),transparent 38%),linear-gradient(160deg,#0c193b,#171036);text-align:center;overflow:hidden}.f10-live-reveal>span{font-size:9px;letter-spacing:.2em;color:#83c9ff;font-weight:900}.f10-live-reveal small{margin-top:30px;color:var(--f10d-gold);letter-spacing:.15em}.f10-live-reveal h4{font-size:31px;color:white;margin:12px 0;line-height:1.05}.f10-live-reveal>div{font-size:16px;color:#aab6d7}.f10-live-reveal>div b{display:block;font-size:96px;line-height:1;color:var(--f10d-gold);text-shadow:0 0 38px rgba(229,189,99,.32)}.f10-live-reveal em{color:#70c7ff;font-style:normal}.f10-live-reveal footer{display:grid;grid-template-columns:auto 1fr;margin-top:auto;padding-top:24px;border-top:1px solid var(--f10d-line);text-align:left}.f10-live-reveal footer strong{color:white}.f10-live-reveal footer span{color:#8593b7;text-align:right}.f10-live-reveal footer code{grid-column:1/3;margin-top:9px;color:#6c7898;font-size:9px}.f10-live-reveal.has-reveal{animation:f10Reveal .55s ease both}@keyframes f10Reveal{from{transform:scale(.97);filter:brightness(1.6)}to{transform:scale(1);filter:brightness(1)}}
      .f10-draw-controls{display:flex;flex-wrap:wrap;gap:9px}.f10-draw-group-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.f10-draw-group-card{border:1px solid var(--f10d-line);border-radius:19px;background:rgba(8,16,40,.76);overflow:hidden}.f10-draw-group-card>header{display:flex;justify-content:space-between;align-items:center;padding:15px;border-bottom:1px solid var(--f10d-line)}.f10-draw-group-card>header div{display:flex;align-items:end;gap:8px}.f10-draw-group-card header span{font-size:9px;color:#7a8aac;letter-spacing:.14em}.f10-draw-group-card header strong{font-size:30px;color:var(--f10d-gold)}.f10-draw-group-card header b{font-size:9px;color:#76c9ff;letter-spacing:.12em}.f10-draw-group-card>div{display:grid;gap:6px;padding:10px}.f10-draw-group-card>div>div{display:flex;align-items:center;gap:9px;padding:9px;border-radius:10px;background:rgba(255,255,255,.04)}.f10-draw-group-card i{font-style:normal;width:22px;color:#7382a9}.f10-draw-group-card span strong{display:block;color:white;font-size:11px}.f10-draw-group-card span small{color:#7f8eb3;font-size:9px}.f10-draw-group-card>p{padding:22px;color:#7785aa}.f10-draw-group-card footer{padding:9px 13px;color:var(--f10d-gold);font-size:8px;font-weight:900;letter-spacing:.12em;background:rgba(229,189,99,.07)}.f10-draw-group-card.is-five{border-color:rgba(229,189,99,.48)}
      .f10-draw-log{grid-column:1/3;border:1px solid var(--f10d-line);border-radius:18px;background:rgba(5,12,31,.65);overflow:hidden}.f10-draw-log>header{display:flex;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--f10d-line);font-size:9px;letter-spacing:.14em;color:#8090b5}.f10-draw-log>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--f10d-line)}.f10-draw-log>div>div{display:flex;gap:10px;align-items:center;padding:11px;background:#09122d}.f10-draw-log i{font-style:normal;color:#647295}.f10-draw-log span{flex:1}.f10-draw-log strong{display:block;color:white;font-size:11px}.f10-draw-log small{color:#7483a8}.f10-draw-log b{color:var(--f10d-gold);font-size:9px}.f10-draw-log p{padding:20px;background:#09122d;color:#7685aa}
      .f10-groups-full{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.f10-group-full{border:1px solid var(--f10d-line);border-radius:22px;overflow:hidden;background:rgba(7,14,36,.72)}.f10-group-full>header{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid var(--f10d-line)}.f10-group-full>header div{display:flex;align-items:end;gap:10px}.f10-group-full>header span{font-size:9px;color:#7d8cb1}.f10-group-full>header strong{font-size:42px;color:var(--f10d-gold)}.f10-group-full>header b{color:#79c9ff;font-size:10px}.f10-group-members{padding:12px;display:grid;gap:7px}.f10-group-members>div{padding:11px;border-radius:11px;background:rgba(255,255,255,.04)}.f10-group-members strong{display:block;color:white}.f10-group-members span{color:#7f8db0;font-size:10px}.f10-mini-table{border-top:1px solid var(--f10d-line)}.f10-mini-table>div{display:grid;grid-template-columns:26px 1fr repeat(3,38px);align-items:center;padding:9px 12px;border-bottom:1px solid rgba(125,151,255,.1);font-size:10px;color:#a6b2d0}.f10-mini-table .head{font-size:8px;letter-spacing:.12em;color:#6e7ca1}.f10-mini-table strong{color:white}.f10-mini-table b{color:var(--f10d-gold)}
      .f10-general-standings>header,.f10-fixtures>header{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.f10-general-standings>header span,.f10-fixtures>header span{font-size:9px;letter-spacing:.18em;color:#7ec8ff;font-weight:900}.f10-general-standings h4,.f10-fixtures h4{font-size:28px;color:white;margin:7px 0}.f10-general-standings p,.f10-fixtures p{max-width:850px;color:#8e9bbb;line-height:1.6}.f10-general-standings>header>div:last-child{display:grid;text-align:right}.f10-general-standings>header>div:last-child strong{font-size:30px;color:var(--f10d-gold)}.f10-general-standings>header>div:last-child small{color:#7e8daf;font-size:9px}.f10-ranking-rules{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.f10-ranking-rules span{padding:8px 10px;border:1px solid var(--f10d-line);border-radius:8px;color:#95a5c8;font-size:8px;font-weight:900;letter-spacing:.1em}.f10-standings-scroll{overflow:auto;border:1px solid var(--f10d-line);border-radius:18px}.f10-standings-table{min-width:1130px}.f10-standings-table>div{display:grid;grid-template-columns:35px minmax(170px,1fr) 45px repeat(9,48px) 105px;align-items:center;min-height:46px;padding:0 12px;border-bottom:1px solid rgba(125,151,255,.1);color:#9ca9c8;font-size:11px}.f10-standings-table .head{position:sticky;top:0;background:#0b1433;color:#7180a4;font-size:8px;letter-spacing:.1em;z-index:2}.f10-standings-table strong{color:white}.f10-standings-table b{color:#d6ddf2}.f10-standings-table em{font-style:normal;font-size:8px;font-weight:900;color:#76c9ff;letter-spacing:.08em}.f10-standings-table .rank-1,.f10-standings-table .rank-2,.f10-standings-table .rank-3,.f10-standings-table .rank-4{background:linear-gradient(90deg,rgba(69,167,255,.09),rgba(157,103,255,.07))}.f10-standings-table .qualification-direct em{color:var(--f10d-gold)}.f10-standings-table .qualification-eliminated em{color:#ff9aa9}
      .f10-qualification-path{display:grid;grid-template-columns:1fr 1.45fr .72fr;gap:12px;margin-top:15px}.f10-qualification-path article{padding:16px;border:1px solid var(--f10d-line);border-radius:15px;background:rgba(8,16,40,.65)}.f10-qualification-path article>span{display:block;margin-bottom:10px;color:#7cc8ff;font-size:8px;font-weight:900;letter-spacing:.14em}.f10-qualification-path .direct>div{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.f10-qualification-path .eliminated>div{display:grid;grid-template-columns:1fr 1fr;gap:7px}.f10-qualification-path .eliminated{border-color:rgba(255,126,145,.25)}.f10-qualification-path .eliminated>span,.f10-qualification-path .eliminated b{color:#ff9aa9}.f10-qualification-path b{display:block;color:var(--f10d-gold);font-size:18px}.f10-qualification-path b small{display:block;color:#a5b0cc;font-size:9px;font-weight:500;margin-top:4px}.f10-qualification-path i{font-style:normal;color:#7583a7;margin:0 5px}.f10-qualification-path article>small{display:block;margin-top:10px;color:#7584a8}.f10-draw-primary:disabled{opacity:.72;cursor:wait}.path-pairs{display:grid;grid-template-columns:1fr 1fr;gap:7px}.path-pairs b{padding:8px;border-radius:9px;background:rgba(255,255,255,.04);font-size:11px;color:white}
      .f10-fixtures>header>b{color:var(--f10d-gold)}.f10-fixture-filters{display:flex;justify-content:space-between;gap:12px;margin-bottom:13px}.f10-fixture-filters>div{display:flex;gap:6px;overflow:auto}.f10-fixture-filters button{padding:9px 12px;border:1px solid var(--f10d-line);border-radius:9px;background:transparent;color:#8795b8;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.f10-fixture-filters button.active{background:linear-gradient(90deg,rgba(69,167,255,.18),rgba(157,103,255,.2));color:white}.f10-fixture-list{display:grid;gap:7px}.f10-fixture-row{display:grid;grid-template-columns:115px minmax(150px,1fr) 90px minmax(150px,1fr) 170px;align-items:center;gap:12px;width:100%;padding:13px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(7,14,36,.7);color:white;text-align:left}.f10-fixture-row:not(:disabled){cursor:pointer}.f10-fixture-row:disabled{opacity:.85}.f10-fixture-row>span:first-child{display:flex;justify-content:space-between;align-items:center}.f10-fixture-row small{color:#7f8db1}.f10-fixture-row>div{display:flex;justify-content:center;gap:8px;font-size:17px}.f10-fixture-row>div b{color:var(--f10d-gold)}.f10-fixture-row em{font-style:normal;color:#7fc9ff;font-size:10px}.f10-fixture-row .teams{display:grid;gap:2px;text-align:right}.f10-fixture-row.completed{border-color:rgba(82,228,160,.22)}.f10-empty-fixtures{padding:28px;text-align:center;border:1px dashed var(--f10d-line);border-radius:15px;color:#8391b5}
      .f10-team-centre>header{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:16px}.f10-team-centre>header span{color:#7ec8ff;font-size:8px;font-weight:900;letter-spacing:.16em}.f10-team-centre>header h4{margin:6px 0;color:white;font-size:28px}.f10-team-centre>header p{max-width:820px;margin:0;color:#8e9bbb;line-height:1.55}.f10-team-centre>header>b{color:var(--f10d-gold)}.f10-passport-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.f10-passport-card{padding:16px;border:1px solid var(--f10d-line);border-radius:16px;background:rgba(7,14,36,.72)}.f10-passport-card>header,.f10-pool-card>header{display:flex;justify-content:space-between;gap:12px;align-items:start}.f10-passport-card>header span,.f10-pool-card>header span{display:block;color:#75c8ff;font-size:8px;font-weight:900;letter-spacing:.13em}.f10-passport-card>header strong,.f10-pool-card>header strong{display:block;margin-top:5px;color:#fff;font-size:16px}.f10-passport-card>header>b,.f10-pool-card>header>b{color:var(--f10d-gold);font-size:9px}.f10-passport-card section{margin-top:12px;padding-top:10px;border-top:1px solid rgba(125,151,255,.13)}.f10-passport-card section header{display:flex;justify-content:space-between;gap:8px;align-items:center}.f10-passport-card section header b{color:var(--f10d-gold)}.f10-passport-card section header small{color:#7e8cae;font-size:8px}.f10-passport-card section>div,.f10-pool-card>div{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.f10-passport-card section span,.f10-pool-card>div span{padding:6px 8px;border:1px solid rgba(125,151,255,.17);border-radius:8px;background:rgba(255,255,255,.035);color:#dce6ff;font-size:9px}.f10-passport-card section em{color:#6f7d9f;font-size:9px}.f10-passport-card>p{margin:12px 0 0;padding:9px;border-radius:9px;background:rgba(229,189,99,.08);color:#d6ba7d;font-size:9px}.f10-team-centre .pool-heading{margin-top:30px}.f10-pool-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.f10-pool-card{padding:16px;border:1px solid var(--f10d-line);border-radius:16px;background:rgba(8,16,40,.68)}.f10-pool-card.pool-4-5{border-color:rgba(157,103,255,.3)}.f10-pool-card.pool-5{border-color:rgba(229,189,99,.3)}
      .f10-draw-modal-backdrop{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px;background:rgba(1,5,17,.82);backdrop-filter:blur(12px)}.f10-draw-modal{width:min(720px,100%);border:1px solid var(--f10d-line);border-radius:23px;background:linear-gradient(145deg,#0a1432,#18103b);box-shadow:0 30px 90px rgba(0,0,0,.55);overflow:hidden}.f10-draw-modal>header{display:flex;justify-content:space-between;align-items:center;padding:20px 23px;border-bottom:1px solid var(--f10d-line)}.f10-draw-modal header span{font-size:9px;letter-spacing:.16em;color:#7dc8ff}.f10-draw-modal h3{color:white;font-size:25px;margin:5px 0 0}.f10-draw-modal header button{border:0;background:transparent;color:white;font-size:25px;cursor:pointer}.f10-draw-modal form{padding:22px}.f10-result-versus{display:grid;grid-template-columns:1fr 50px 1fr;gap:14px;align-items:center}.f10-result-versus label{display:grid;gap:7px}.f10-result-versus label strong{color:white;font-size:16px}.f10-result-versus label span{color:#8290b3;font-size:9px}.f10-result-versus input{width:100%;padding:12px;border:1px solid var(--f10d-line);border-radius:10px;background:#07122e;color:white}.f10-result-versus>b{text-align:center;color:var(--f10d-gold)}.f10-modal-rule{margin:18px 0;color:#8795b7;font-size:11px;line-height:1.55}.f10-draw-modal footer{display:flex;justify-content:flex-end;gap:8px}.f10-draw-modal footer button{padding:11px 15px;border:1px solid var(--f10d-line);border-radius:10px;background:transparent;color:white;font-weight:800;cursor:pointer}.f10-draw-modal footer button.primary{background:linear-gradient(90deg,#347fff,#a84df3);border:0}.f10-draw-modal footer button.danger{margin-right:auto;color:#ff8d9d;border-color:rgba(255,101,123,.3)}
      .f10-result-versus select{width:100%;min-width:0;padding:12px;border:1px solid var(--f10d-line);border-radius:10px;background:#07122e;color:white}.f10-result-versus option:disabled{color:#7884a3}.f10-modal-rule strong{color:var(--f10d-gold)}
      .master-player-control select[data-fifa10-live-team-select]{width:100%;min-width:0;padding:10px 11px;border:1px solid rgba(125,151,255,.28);border-radius:9px;background:#07122e;color:#fff;font:inherit}.master-player-control select[data-fifa10-live-team-select] option:disabled{color:#7783a2}
      .f10-draw-toast-stack{position:fixed;right:20px;bottom:22px;z-index:11000;display:grid;gap:8px;width:min(390px,calc(100vw - 40px))}.f10-draw-toast{display:flex;gap:10px;align-items:center;padding:13px 15px;border:1px solid var(--f10d-line);border-radius:13px;background:#0a1432;color:white;box-shadow:0 16px 40px rgba(0,0,0,.35);opacity:0;transform:translateY(12px);transition:.25s}.f10-draw-toast.show{opacity:1;transform:none}.f10-draw-toast span{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:rgba(69,167,255,.14);color:#7dc9ff}.f10-draw-toast.success span{color:var(--f10d-green)}.f10-draw-toast.error span{color:var(--f10d-red)}
      .f10-operation-notice{position:relative;display:flex;align-items:center;gap:10px;margin:18px 28px 0;padding:12px 14px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(7,14,36,.74);color:#b6c2df;font-size:12px}.f10-operation-notice strong{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:rgba(69,167,255,.13);color:#78c8ff}.f10-operation-notice.success{border-color:rgba(82,228,160,.28)}.f10-operation-notice.success strong{color:var(--f10d-green)}.f10-operation-notice.warning{border-color:rgba(229,189,99,.32)}.f10-operation-notice.warning strong{color:var(--f10d-gold)}
      .f10-connected-universe{position:relative;display:grid;grid-template-columns:minmax(260px,.9fr) minmax(420px,1.4fr);gap:18px;align-items:center;margin:14px 28px 0;padding:17px 18px;border:1px solid rgba(82,228,160,.24);border-radius:16px;background:linear-gradient(110deg,rgba(82,228,160,.08),rgba(69,167,255,.07),rgba(157,103,255,.07))}.f10-connected-universe>div{display:grid;gap:4px}.f10-connected-universe>div span{color:var(--f10d-green);font-size:8px;font-weight:900;letter-spacing:.16em}.f10-connected-universe>div strong{color:white;font-size:15px}.f10-connected-universe>div small{color:#8f9fc1;line-height:1.45}.f10-connected-universe nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.f10-connected-universe button{padding:10px 8px;border:1px solid var(--f10d-line);border-radius:9px;background:rgba(6,14,35,.72);color:#dbe7ff;font-size:9px;font-weight:900;cursor:pointer}.f10-connected-universe button:hover{border-color:rgba(82,228,160,.45);color:white}
      body.f10-manual-overlay-open{overflow:hidden!important;touch-action:none}.f10-manual-overlay{position:fixed;inset:0;z-index:12050;display:grid;place-items:center;padding:18px;background:rgba(1,5,17,.9);backdrop-filter:blur(14px) saturate(115%)}.f10-manual-sheet{display:grid;grid-template-rows:auto minmax(0,1fr);width:min(1120px,100%);height:min(900px,calc(100dvh - 36px));overflow:hidden;border:1px solid rgba(125,151,255,.32);border-radius:26px;background:linear-gradient(145deg,#07122d,#18103b);box-shadow:0 40px 120px rgba(0,0,0,.68)}.f10-manual-sheet>header{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 22px;border-bottom:1px solid var(--f10d-line);background:rgba(5,12,31,.88)}.f10-manual-sheet>header span{color:#78c9ff;font-size:9px;font-weight:900;letter-spacing:.17em}.f10-manual-sheet>header h3{margin:5px 0 0;color:#fff;font-size:clamp(21px,3vw,31px)}.f10-manual-sheet>header button{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border:1px solid var(--f10d-line);border-radius:13px;background:#091633;color:#fff;font-size:26px;cursor:pointer}.f10-manual-sheet-body{min-height:0;overflow:auto;overscroll-behavior:contain;padding:20px;scrollbar-width:thin;scrollbar-color:rgba(125,151,255,.35) transparent}.f10-manual-loading{display:grid;place-items:center;align-content:center;gap:10px;min-height:360px;text-align:center;color:#eef5ff}.f10-manual-loading i{width:38px;height:38px;border:3px solid rgba(125,151,255,.2);border-top-color:#61baff;border-radius:50%;animation:f10ManualSpin .8s linear infinite}.f10-manual-loading strong{font-size:20px}.f10-manual-loading span{max-width:560px;color:#95a5c8;line-height:1.6}.f10-manual-loading.error strong{color:#ff94a5}.f10-manual-loading button{margin-top:10px;padding:12px 18px;border:1px solid var(--f10d-line);border-radius:11px;background:#0a1737;color:#fff;font-weight:900}.f10-manual-resume{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:26px;border:1px solid rgba(82,228,160,.24);border-radius:20px;background:linear-gradient(120deg,rgba(82,228,160,.08),rgba(69,167,255,.08))}.f10-manual-resume span{color:#65e6aa;font-size:9px;font-weight:900;letter-spacing:.15em}.f10-manual-resume h4{margin:7px 0;color:#fff;font-size:27px}.f10-manual-resume p{margin:0;color:#95a5c7;line-height:1.55}.f10-manual-resume button{flex:0 0 auto;padding:14px 18px;border:0;border-radius:12px;color:#fff;font-weight:900;cursor:pointer;background:linear-gradient(90deg,#347fff,#a84df3)}@keyframes f10ManualSpin{to{transform:rotate(360deg)}}
      .f10-start-actions{display:flex;gap:10px;flex-wrap:wrap}.f10-start-actions button{padding:14px 18px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(8,18,46,.78);color:white;font-weight:900;cursor:pointer}
      .f10-manual-groups{display:grid;gap:18px}.f10-manual-groups>header{display:flex;justify-content:space-between;gap:20px;align-items:end;padding:24px;border:1px solid var(--f10d-line);border-radius:19px;background:rgba(7,15,39,.72)}.f10-manual-groups>header span{font-size:9px;letter-spacing:.15em;color:#7fc9ff}.f10-manual-groups>header h4{margin:7px 0;font-size:30px;color:white}.f10-manual-groups>header p{margin:0;max-width:750px;color:#93a1c2;line-height:1.6}.f10-manual-groups>header>div:last-child{text-align:right}.f10-manual-groups>header>div:last-child strong{display:block;font-size:32px;color:var(--f10d-gold)}.f10-manual-groups>header>div:last-child small{font-size:8px;color:#8290b4;letter-spacing:.13em}.f10-manual-summary{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.f10-manual-summary b{display:flex;gap:10px;padding:10px 13px;border:1px solid var(--f10d-line);border-radius:10px;color:white}.f10-manual-summary b span{color:#7fc9ff}.f10-manual-summary em{margin-left:auto;color:#a7b4d2;font-style:normal}.f10-manual-player-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.f10-manual-player-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(7,14,36,.74)}.f10-manual-player-list article small{display:block;color:#7584aa;font-size:8px}.f10-manual-player-list article strong{display:block;margin-top:4px;color:white}.f10-group-choice{display:flex;gap:5px}.f10-group-choice button{width:36px;height:36px;border:1px solid var(--f10d-line);border-radius:9px;background:#08132f;color:#91a0c1;font-weight:900;cursor:pointer}.f10-group-choice button.active{background:linear-gradient(135deg,#337eff,#a34ff2);border-color:transparent;color:white;box-shadow:0 6px 18px rgba(74,95,255,.25)}.f10-manual-groups>footer{display:flex;justify-content:flex-end;gap:10px}.f10-manual-groups>footer button{padding:13px 17px;border:1px solid var(--f10d-line);border-radius:11px;background:#09142f;color:white;font-weight:900;cursor:pointer}.f10-manual-groups>footer button:disabled{opacity:.4;cursor:not-allowed}
      .f10-registration-draw-locked{position:relative}.f10-registration-draw-locked:after{content:"KURA İÇİN KİLİTLENDİ";position:absolute;top:18px;right:180px;padding:7px 10px;border:1px solid rgba(229,189,99,.3);border-radius:8px;background:rgba(229,189,99,.08);color:var(--f10d-gold);font-size:8px;font-weight:900;letter-spacing:.13em}
      @media(max-width:1100px){.f10-draw-hero{grid-template-columns:1fr}.f10-draw-hero aside{width:100%}.f10-draw-pots{grid-template-columns:repeat(3,1fr)}.f10-draw-stage{grid-template-columns:1fr}.f10-live-reveal{grid-row:auto;min-height:310px}.f10-draw-log{grid-column:auto}.f10-groups-full{grid-template-columns:1fr}.f10-qualification-path{grid-template-columns:1fr}.f10-fixture-row{grid-template-columns:95px 1fr 70px 1fr}.f10-fixture-row .teams{grid-column:2/5;grid-template-columns:1fr 1fr;text-align:left}.f10-draw-group-grid{grid-template-columns:repeat(3,1fr)}.f10-pool-grid{grid-template-columns:1fr}.f10-passport-grid{grid-template-columns:1fr}}
      @media(max-width:720px){.f10-manual-overlay{place-items:end center;padding:0}.f10-manual-sheet{width:100%;height:96dvh;border-radius:24px 24px 0 0}.f10-manual-sheet>header{padding:14px 15px}.f10-manual-sheet>header button{width:42px;height:42px}.f10-manual-sheet-body{padding:13px 11px max(18px,env(safe-area-inset-bottom))}.f10-manual-resume{display:grid;padding:20px}.f10-manual-resume button{width:100%}.f10-manual-player-list{grid-template-columns:1fr}.f10-manual-groups>header{display:grid;padding:18px 16px}.f10-manual-groups>header h4{font-size:25px}.f10-manual-summary em{width:100%;margin-left:0}.f10-manual-groups>footer{display:grid;position:sticky;bottom:-13px;z-index:2;padding:12px 0;background:linear-gradient(180deg,transparent,#0b1230 24%)}.f10-manual-groups>footer button{min-height:48px}.f10-group-choice button{width:42px;height:42px}.f10-start-actions{display:grid}.f10-draw-centre{border-radius:20px;margin:18px 0}.f10-draw-hero{padding:27px 20px}.f10-draw-hero h3{font-size:39px}.f10-connected-universe{grid-template-columns:1fr;margin:12px}.f10-connected-universe nav{grid-template-columns:repeat(2,minmax(0,1fr))}.f10-draw-content{padding:18px 12px}.f10-draw-footer{display:grid;padding:15px 18px;font-size:8px}.f10-draw-ready-panel{display:grid;align-items:start}.f10-draw-pots{grid-template-columns:1fr}.f10-draw-group-grid{grid-template-columns:1fr}.f10-draw-log>div{grid-template-columns:1fr}.f10-live-reveal>div b{font-size:75px}.f10-fixture-filters{display:grid}.f10-fixture-row{grid-template-columns:80px 1fr 50px 1fr;padding:11px 8px;gap:6px}.f10-fixture-row>span:first-child{display:grid}.f10-fixture-row>strong{font-size:10px}.f10-fixture-row .teams{grid-column:1/5}.f10-result-versus{grid-template-columns:1fr}.f10-result-versus>b{padding:4px}.f10-draw-modal footer{flex-wrap:wrap}.f10-registration-draw-locked:after{position:static;display:inline-block;margin:10px 18px}.f10-draw-tabs{padding:12px}.f10-standings-table>div{font-size:10px}}
    `;
    style.textContent += `
      .f10-groups-rule{margin-bottom:15px;padding:17px 19px;border:1px solid rgba(82,228,160,.24);border-radius:16px;background:linear-gradient(90deg,rgba(82,228,160,.07),rgba(69,167,255,.07))}
      .f10-groups-rule span{display:block;color:var(--f10d-green);font-size:8px;font-weight:900;letter-spacing:.15em}
      .f10-groups-rule strong{display:block;margin-top:6px;color:white;font-size:18px}
      .f10-groups-rule p{margin:5px 0 0;color:#92a1c3}
      .f10-operations-mount{position:relative}
      .f10-standings-table{width:100%;min-width:1240px}
      .f10-standings-table>div{grid-template-columns:48px minmax(250px,270px) minmax(62px,.65fr) repeat(4,minmax(58px,.62fr)) repeat(2,minmax(62px,.68fr)) minmax(118px,1.16fr) minmax(104px,1fr) minmax(165px,1.48fr);min-height:52px;padding:0 14px;font-size:13px}
      .f10-standings-table>div>*{min-width:0}
      .f10-standings-table>div>*:not(:nth-child(2)){justify-self:center;text-align:center}
      .f10-standings-table>div>:nth-child(2){justify-self:stretch;text-align:left}
      .f10-standings-table>div>strong:nth-child(2),.f10-scenario-player{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;letter-spacing:-.015em}
      .f10-standings-table .head{font-size:9px}
      .f10-standings-table em{font-size:9px;line-height:1.25}
      .f10-standings-table strong small,.f10-standings-table b small{color:var(--f10d-gold);font-size:10px}
      .f10-scenario-player{width:100%;padding:0;border:0;background:transparent;color:#fff;text-align:left;font-weight:800;cursor:pointer}.f10-scenario-player:hover{color:#7fc9ff;text-decoration:underline}
      .f10-draw-tabs .f10-tv-launch{margin-left:auto;border-color:rgba(82,228,160,.34);color:var(--f10d-green);background:rgba(82,228,160,.08)}.f10-draw-tabs .f10-tv-launch+.f10-print-launch{margin-left:0}
      .f10-sync-strip{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;margin:12px 28px 0;padding:12px 14px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(7,14,36,.74)}.f10-sync-strip>i,.f10-sync-history article>i{width:10px;height:10px;border-radius:50%;background:#7dc9ff;box-shadow:0 0 14px currentColor}.f10-sync-strip>div{display:grid;gap:2px}.f10-sync-strip span{color:#7dc9ff;font-size:8px;font-weight:900;letter-spacing:.14em}.f10-sync-strip strong{color:#e8efff;font-size:11px}.f10-sync-strip small{color:#7888ad;font-size:8px}.f10-sync-strip button{padding:9px 11px;border:1px solid var(--f10d-line);border-radius:9px;background:#091633;color:#fff;font-size:8px;font-weight:900}.f10-sync-strip.status-cloud>i,.f10-sync-history .status-cloud>i{background:var(--f10d-green)}.f10-sync-strip.status-error>i,.f10-sync-history .status-error>i{background:var(--f10d-red)}.f10-sync-history{display:grid;gap:7px;max-height:58vh;overflow:auto;padding:18px}.f10-sync-history article{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:start;padding:12px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(5,12,31,.65)}.f10-sync-history article>div{display:grid;gap:4px}.f10-sync-history strong{color:#fff}.f10-sync-history span{color:#aab7d4;font-size:10px}.f10-sync-history small{color:#7786a8;font-size:8px}.f10-sync-modal>footer{padding:0 18px 18px}
      .f10-quick-entry{margin-bottom:17px;padding:15px;border:1px solid rgba(82,228,160,.24);border-radius:16px;background:linear-gradient(110deg,rgba(82,228,160,.07),rgba(69,167,255,.06))}.f10-quick-entry>header{display:flex;align-items:end;justify-content:space-between;gap:15px;margin-bottom:11px}.f10-quick-entry>header>div{display:grid;gap:3px}.f10-quick-entry>header span{color:var(--f10d-green);font-size:8px;font-weight:900;letter-spacing:.14em}.f10-quick-entry>header strong{color:#fff;font-size:18px}.f10-quick-entry>header small{color:#8e9fc0}.f10-quick-entry select{min-width:230px;padding:10px;border:1px solid var(--f10d-line);border-radius:9px;background:#07122e;color:#fff}.f10-quick-entry>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.f10-quick-entry>div>button{display:grid;gap:4px;padding:11px;border:1px solid var(--f10d-line);border-radius:11px;background:rgba(7,14,36,.72);color:#fff;text-align:left;cursor:pointer}.f10-quick-entry button span{color:#7dc9ff;font-size:8px;font-weight:900}.f10-quick-entry button strong{font-size:10px}.f10-quick-entry button i{color:var(--f10d-gold);font-style:normal}.f10-quick-entry button small{color:#7e8db0}
      .f10-player-centre>header{display:flex;justify-content:space-between;align-items:end;gap:20px}.f10-player-centre>header span{color:#7ec8ff;font-size:8px;font-weight:900;letter-spacing:.16em}.f10-player-centre>header h4{margin:6px 0;color:#fff;font-size:28px}.f10-player-centre>header p{margin:0;color:#8e9bbb}.f10-player-centre>header>b{color:var(--f10d-gold)}.f10-player-selector{display:flex;gap:6px;margin:15px 0;overflow:auto;padding-bottom:4px}.f10-player-selector button{flex:0 0 auto;padding:9px 11px;border:1px solid var(--f10d-line);border-radius:9px;background:#08132f;color:#92a1c2;font-size:9px;font-weight:800;cursor:pointer}.f10-player-selector button.active{border-color:transparent;background:linear-gradient(90deg,#347fff,#8d55e6);color:#fff}.f10-player-identity{display:grid;grid-template-columns:minmax(240px,.85fr) 1.6fr;gap:16px;padding:18px;border:1px solid var(--f10d-line);border-radius:17px;background:rgba(7,14,36,.72)}.f10-player-identity>div span{color:#78c9ff;font-size:8px;font-weight:900;letter-spacing:.14em}.f10-player-identity h5{margin:7px 0;color:#fff;font-size:24px}.f10-player-identity>div small{color:#7e8eb1}.f10-player-identity dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:0}.f10-player-identity dl>div{padding:10px;border-radius:10px;background:rgba(255,255,255,.04)}.f10-player-identity dt{color:#7f8eb2;font-size:8px}.f10-player-identity dd{margin:5px 0 0;color:#fff;font-size:16px;font-weight:900}.f10-player-identity dd.path-direct{color:var(--f10d-gold)}.f10-player-identity dd.path-playin{color:#7dc9ff}.f10-player-identity dd.path-eliminated{color:#ff93a4}.f10-next-match{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:10px;padding:17px;border:1px solid rgba(229,189,99,.28);border-radius:16px;background:linear-gradient(100deg,rgba(229,189,99,.08),rgba(157,103,255,.07))}.f10-next-match span{color:var(--f10d-gold);font-size:8px;font-weight:900;letter-spacing:.15em}.f10-next-match strong{display:block;margin-top:5px;color:#9baaca}.f10-next-match h5{margin:5px 0 0;color:#fff;font-size:19px}.f10-next-match h5 i{margin:0 8px;color:#7dc9ff;font-style:normal}.f10-next-match button{padding:12px 15px;border:0;border-radius:10px;background:linear-gradient(90deg,#347fff,#a84df3);color:#fff;font-weight:900;cursor:pointer}.f10-player-tier-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.f10-player-tier-grid article{padding:13px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(8,16,40,.65)}.f10-player-tier-grid header{display:flex;justify-content:space-between}.f10-player-tier-grid b{color:var(--f10d-gold)}.f10-player-tier-grid strong{color:#fff}.f10-player-tier-grid p{min-height:30px;margin:8px 0;color:#a3b0ce;font-size:9px;line-height:1.5}.f10-player-tier-grid small{color:#75c8ff}.f10-player-match-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.f10-player-match-columns>section{border:1px solid var(--f10d-line);border-radius:15px;overflow:hidden}.f10-player-match-columns>section>header{display:flex;justify-content:space-between;padding:12px 14px;background:rgba(8,16,40,.82);color:#fff}.f10-player-match-columns>section>header span{color:var(--f10d-gold)}.f10-player-match-columns>section>div{display:grid;gap:6px;max-height:500px;overflow:auto;padding:8px}.f10-player-match-columns p{padding:15px;color:#8190b3}.f10-player-match{display:grid;grid-template-columns:75px 1fr;gap:7px;padding:10px;border:1px solid var(--f10d-line);border-radius:10px;background:rgba(7,14,36,.72);color:#fff;text-align:left}.f10-player-match:not(:disabled){cursor:pointer}.f10-player-match>span{display:grid}.f10-player-match>span b{color:var(--f10d-gold)}.f10-player-match>span small,.f10-player-match>small{color:#7d8cb0;font-size:8px}.f10-player-match>div{display:grid;grid-template-columns:1fr auto 1fr;gap:7px;align-items:center}.f10-player-match>div strong:last-child{text-align:right}.f10-player-match>div i{color:#7dc9ff;font-style:normal}.f10-player-match>small{grid-column:2}.f10-player-match.completed{border-color:rgba(82,228,160,.2)}
      .f10-scenario-body{padding:20px}.f10-scenario-body>h4{margin:0;color:#fff;font-size:22px}.f10-scenario-body>p{color:#91a0c1}.f10-scenario-fixture{display:flex;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--f10d-line);border-radius:11px;background:rgba(7,14,36,.72)}.f10-scenario-fixture b{color:var(--f10d-gold)}.f10-scenario-fixture strong{color:#fff}.f10-scenario-fixture i{color:#7dc9ff;font-style:normal}.f10-scenario-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.f10-scenario-grid article{display:grid;gap:5px;padding:12px;border:1px solid var(--f10d-line);border-radius:11px;background:rgba(255,255,255,.035)}.f10-scenario-grid article span{color:#7ec9ff;font-size:8px;font-weight:900;letter-spacing:.1em}.f10-scenario-grid article b{color:#fff;font-size:25px}.f10-scenario-grid article small{color:#a0adca}.f10-scenario-grid article em{color:var(--f10d-gold);font-size:8px;font-style:normal;font-weight:900}
      body.f10-tv-open{overflow:hidden!important}.f10-tv-overlay{position:fixed;inset:0;z-index:13000;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:radial-gradient(circle at 10% 0%,#17356c 0,transparent 30%),radial-gradient(circle at 95% 10%,#401b66 0,transparent 30%),#030817;color:#fff}.f10-tv-overlay>header{display:grid;grid-template-columns:1fr auto auto auto;gap:25px;align-items:center;padding:22px 28px;border-bottom:1px solid rgba(125,151,255,.3)}.f10-tv-overlay>header span{color:#7fc9ff;font-size:10px;font-weight:900;letter-spacing:.18em}.f10-tv-overlay h2{margin:5px 0 0;font-size:28px}.f10-tv-overlay>header>div:nth-child(2){display:grid;text-align:right}.f10-tv-overlay>header>div:nth-child(2) strong{color:var(--f10d-gold);font-size:26px}.f10-tv-overlay>header small{color:#8292b6}.f10-tv-overlay time{font-size:27px;font-weight:900}.f10-tv-overlay>header button{width:46px;height:46px;border:1px solid var(--f10d-line);border-radius:12px;background:#0a1533;color:#fff;font-size:25px}.f10-tv-overlay>main{display:grid;grid-template-columns:1.2fr .8fr;gap:15px;min-height:0;padding:16px 22px}.f10-tv-table,.f10-tv-side>section{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;border:1px solid var(--f10d-line);border-radius:17px;overflow:hidden;background:rgba(7,14,36,.76)}.f10-tv-table>header,.f10-tv-side section>header{display:flex;justify-content:space-between;padding:12px 15px;background:rgba(11,23,55,.95)}.f10-tv-table>header span{color:#7ec9ff}.f10-tv-table>div{display:grid;min-height:0}.f10-tv-table article{display:grid;grid-template-columns:34px minmax(0,1fr) 45px 90px 85px;align-items:center;padding:7px 14px;border-top:1px solid rgba(125,151,255,.12)}.f10-tv-table article>b{color:#7f8eb2}.f10-tv-table article>strong{font-size:13px}.f10-tv-table article>span{text-align:center;color:#7ec9ff}.f10-tv-table article>em{color:#fff;font-size:14px;font-style:normal;font-weight:900;text-align:right}.f10-tv-table article>small{color:#c7d2ea;text-align:right}.f10-tv-table article.path-direct{background:linear-gradient(90deg,rgba(69,167,255,.1),rgba(157,103,255,.07))}.f10-tv-table article.path-direct>em{color:var(--f10d-gold)}.f10-tv-table article.path-eliminated{opacity:.72}.f10-tv-side{display:grid;grid-template-rows:1fr 1fr;gap:15px;min-height:0}.f10-tv-side section>div{display:grid;align-content:start;overflow:hidden}.f10-tv-side article{display:grid;gap:4px;padding:10px 13px;border-top:1px solid rgba(125,151,255,.12)}.f10-tv-side article span{color:#7dc9ff;font-size:9px}.f10-tv-side article strong{font-size:12px}.f10-tv-side article b{margin:0 6px;color:var(--f10d-gold)}.f10-tv-side p{padding:15px;color:#8190b3}.f10-tv-overlay>footer{display:flex;justify-content:space-around;gap:15px;padding:13px;border-top:1px solid rgba(125,151,255,.3);color:#9fadd0;font-size:10px;font-weight:900;letter-spacing:.1em}.f10-tv-overlay>footer span:first-child{color:var(--f10d-gold)}.f10-tv-overlay>footer span:last-child{color:#ff91a3}
      @media(max-width:1000px){.f10-quick-entry>div{grid-template-columns:repeat(2,minmax(0,1fr))}.f10-player-identity{grid-template-columns:1fr}.f10-player-match-columns{grid-template-columns:1fr}.f10-tv-overlay>main{grid-template-columns:1fr}.f10-tv-side{grid-template-columns:1fr 1fr;grid-template-rows:1fr}.f10-tv-table article{padding:5px 10px}}
      @media(max-width:720px){.f10-standings-table>div{font-size:12px}.f10-sync-strip{grid-template-columns:auto 1fr;margin:10px 12px}.f10-sync-strip button{grid-column:1/3;width:100%}.f10-quick-entry>header{display:grid}.f10-quick-entry select{width:100%;min-width:0}.f10-quick-entry>div{grid-template-columns:1fr}.f10-player-identity dl{grid-template-columns:1fr 1fr}.f10-next-match{display:grid}.f10-next-match button{width:100%}.f10-player-tier-grid{grid-template-columns:1fr}.f10-player-match{grid-template-columns:62px 1fr}.f10-scenario-grid{grid-template-columns:1fr 1fr}.f10-scenario-fixture{display:grid}.f10-tv-overlay>header{grid-template-columns:1fr auto auto;gap:10px;padding:12px}.f10-tv-overlay>header>div:nth-child(2){display:none}.f10-tv-overlay h2{font-size:18px}.f10-tv-overlay>header span{font-size:7px}.f10-tv-overlay time{font-size:18px}.f10-tv-overlay>main{padding:8px}.f10-tv-side{display:none}.f10-tv-table article{grid-template-columns:25px minmax(0,1fr) 28px 65px 60px;padding:5px 7px}.f10-tv-table article>strong{font-size:10px}.f10-tv-overlay>footer{display:none}}
      html[data-language="en"] .f10-registration-draw-locked:after{content:"LOCKED FOR THE DRAW"}
    `;
    document.head.appendChild(style);
  }

  function installAdvancedStyles() {
    if (document.getElementById("f10AdvancedIntelligenceStyles")) return;
    const style = document.createElement("style");
    style.id = "f10AdvancedIntelligenceStyles";
    style.textContent = `
      .f10-draw-tabs{overflow-x:auto;scrollbar-width:thin}.f10-draw-tabs>button{flex:0 0 auto;white-space:nowrap}
      .f10-qualification-centre>header,.f10-schedule-centre>header,.f10-team-intelligence>header,.f10-dna-centre>header,.f10-broadcast-hub>header,.f10-awards-universe>header{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:16px}
      .f10-qualification-centre>header span,.f10-schedule-centre>header span,.f10-team-intelligence>header span,.f10-dna-centre>header span,.f10-broadcast-hub>header span,.f10-awards-universe>header span{color:#75c8ff;font-size:8px;font-weight:900;letter-spacing:.15em}
      .f10-qualification-centre>header h4,.f10-schedule-centre>header h4,.f10-team-intelligence>header h4,.f10-dna-centre>header h4,.f10-broadcast-hub>header h4,.f10-awards-universe>header h4{margin:6px 0;color:#fff;font-size:27px}
      .f10-qualification-centre>header p,.f10-schedule-centre>header p,.f10-team-intelligence>header p,.f10-dna-centre>header p,.f10-broadcast-hub>header p,.f10-awards-universe>header p{max-width:880px;margin:0;color:#8f9ebe;line-height:1.55}
      .f10-qualification-centre>header>b,.f10-schedule-centre>header>b,.f10-team-intelligence>header>b,.f10-dna-centre>header>b,.f10-broadcast-hub>header>b,.f10-awards-universe>header>b{color:var(--f10d-gold);white-space:nowrap}.f10-awards-universe>header>b.sealed{color:var(--f10d-green)}
      .f10-qualification-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.f10-qualification-kpis article{display:grid;gap:5px;padding:14px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(8,16,40,.7)}.f10-qualification-kpis span{color:#8392b4;font-size:8px;font-weight:800}.f10-qualification-kpis b{color:#fff;font-size:22px}.f10-qualification-kpis small{color:#75c8ff}
      .f10-qualification-scroll{overflow:auto;border:1px solid var(--f10d-line);border-radius:15px}.f10-qualification-table{min-width:1080px}.f10-qualification-table>div{display:grid;grid-template-columns:40px minmax(230px,1.4fr) 70px 55px 150px 105px 135px minmax(190px,1fr);align-items:center;min-height:47px;padding:0 12px;border-top:1px solid rgba(125,151,255,.12);color:#aab7d3;font-size:10px}.f10-qualification-table>.head{min-height:38px;border:0;background:#08152f;color:#7384a9;font-size:8px;font-weight:900;letter-spacing:.08em}.f10-qualification-table strong{color:#fff}.f10-qualification-table b{color:#dfe7fb}.f10-qualification-table em{color:#78c9ff;font-size:8px;font-style:normal;font-weight:900}.f10-qualification-table .status-direct{background:rgba(229,189,99,.06)}.f10-qualification-table .status-direct em{color:var(--f10d-gold)}.f10-qualification-table .status-eliminated em{color:#ff8da2}.f10-math-note{margin:10px 0 0;padding:10px 12px;border-left:3px solid #5eaefc;background:rgba(69,167,255,.06);color:#8d9cbc;font-size:9px;line-height:1.5}
      .f10-schedule-toolbar{display:grid;grid-template-columns:minmax(220px,.6fr) 1fr auto;align-items:center;gap:12px;padding:13px;border:1px solid var(--f10d-line);border-radius:13px;background:rgba(8,16,40,.7)}.f10-schedule-toolbar label{display:grid;gap:5px;color:#8392b4;font-size:8px}.f10-schedule-toolbar select,.f10-dna-selectors select,.f10-awards-universe select{padding:10px;border:1px solid var(--f10d-line);border-radius:9px;background:#07122e;color:#fff}.f10-schedule-toolbar>div{display:grid}.f10-schedule-toolbar span{color:#8291b3;font-size:8px}.f10-schedule-toolbar strong{color:#fff;font-size:18px}.f10-schedule-toolbar small{color:var(--f10d-gold)}.f10-schedule-progress{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.f10-schedule-progress article{padding:12px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(8,16,40,.62)}.f10-schedule-progress header{display:flex;justify-content:space-between;color:#fff}.f10-schedule-progress header span{color:#78c9ff}.f10-schedule-progress article>div{height:6px;margin:8px 0;border-radius:8px;background:#111e43;overflow:hidden}.f10-schedule-progress i{display:block;height:100%;background:linear-gradient(90deg,#347fff,#a74df3)}.f10-schedule-progress small{color:#7e8db0}.f10-schedule-list{display:grid;gap:6px}.f10-schedule-list>button{display:grid;grid-template-columns:40px 65px 165px minmax(280px,1fr) 120px;align-items:center;gap:9px;padding:12px;border:1px solid var(--f10d-line);border-radius:11px;background:rgba(7,14,36,.72);color:#fff;text-align:left}.f10-schedule-list>button:not(:disabled){cursor:pointer}.f10-schedule-list>button>b{color:var(--f10d-gold)}.f10-schedule-list time{color:#75c8ff}.f10-schedule-list>button>span{color:#8b9abb;font-size:9px}.f10-schedule-list strong{font-size:11px}.f10-schedule-list strong i{margin:0 8px;color:#78c9ff;font-style:normal}.f10-schedule-list em{color:#6dd9a4;font-size:8px;font-style:normal;font-weight:900}
      .f10-team-intelligence{margin-bottom:28px;padding-bottom:22px;border-bottom:1px solid var(--f10d-line)}.f10-team-scarcity{display:grid;grid-template-columns:minmax(210px,1.2fr) repeat(3,minmax(90px,.5fr)) minmax(170px,.8fr);gap:8px;margin-bottom:10px}.f10-team-scarcity>div,.f10-team-scarcity>article{display:grid;gap:4px;padding:12px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(8,16,40,.68)}.f10-team-scarcity span{color:#7fc9ff;font-size:8px;font-weight:900}.f10-team-scarcity strong{color:#fff}.f10-team-scarcity article b{color:var(--f10d-gold)}.f10-team-scarcity article strong{font-size:21px}.f10-team-scarcity small{color:#8191b4}.f10-team-intel-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.f10-team-intel-grid>article{border:1px solid var(--f10d-line);border-radius:13px;overflow:hidden;background:rgba(7,14,36,.65)}.f10-team-intel-grid>article>header{display:flex;justify-content:space-between;padding:11px 13px;background:#091531}.f10-team-intel-grid header b{color:var(--f10d-gold)}.f10-team-intel-grid header span{color:#7e8db0}.f10-team-intel-grid article>div{display:grid}.f10-team-intel-grid article>div>div{display:grid;grid-template-columns:25px minmax(0,1fr) 72px 110px;align-items:center;gap:6px;padding:9px 11px;border-top:1px solid rgba(125,151,255,.1)}.f10-team-intel-grid i{color:#7182a6;font-style:normal}.f10-team-intel-grid strong{color:#fff;font-size:10px}.f10-team-intel-grid div span{color:#79caff;font-size:9px}.f10-team-intel-grid small{color:#8493b4;font-size:8px}
      .f10-dna-selectors{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:10px}.f10-dna-selectors label{display:grid;gap:5px;color:#8392b4;font-size:8px;font-weight:900}.f10-dna-profile{display:grid;grid-template-columns:minmax(220px,.65fr) 1.35fr;gap:10px;padding:15px;border:1px solid var(--f10d-line);border-radius:15px;background:rgba(7,14,36,.7)}.f10-dna-profile>article{display:grid;align-content:center;gap:5px}.f10-dna-profile>article span{color:#78c9ff;font-size:8px;font-weight:900}.f10-dna-profile h5{margin:0;color:#fff;font-size:24px}.f10-dna-profile>article strong{color:var(--f10d-gold)}.f10-dna-profile>article small{color:#8191b4}.f10-dna-profile>div{display:grid;gap:8px}.f10-dna-profile label{display:grid;grid-template-columns:100px 35px 1fr;align-items:center;gap:8px;color:#aab7d3;font-size:9px}.f10-dna-profile label b{color:#fff;text-align:right}.f10-dna-profile label i{height:7px;border-radius:8px;background:#111f43;overflow:hidden}.f10-dna-profile label em{display:block;height:100%;background:linear-gradient(90deg,#347fff,#a74df3)}.f10-dna-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.f10-dna-tiers article{padding:12px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(8,16,40,.68)}.f10-dna-tiers header,.f10-dna-tiers div{display:flex;justify-content:space-between;gap:8px}.f10-dna-tiers b{color:var(--f10d-gold)}.f10-dna-tiers strong{color:#fff}.f10-dna-tiers div{margin-top:8px;color:#8696b8;font-size:9px}.f10-h2h{border:1px solid var(--f10d-line);border-radius:15px;overflow:hidden}.f10-h2h>header{display:flex;justify-content:space-between;padding:14px;background:#091531}.f10-h2h>header span{color:#78c9ff;font-size:8px;font-weight:900}.f10-h2h h5{margin:4px 0 0;color:#fff;font-size:17px}.f10-h2h h5 i{color:var(--f10d-gold);font-style:normal}.f10-h2h>header>b{color:var(--f10d-gold)}.f10-h2h .summary{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;padding:8px}.f10-h2h .summary article{display:grid;gap:5px;padding:9px;background:rgba(255,255,255,.035);border-radius:8px}.f10-h2h .summary span{color:#8191b3;font-size:8px}.f10-h2h .summary b{color:#fff;font-size:17px}.f10-h2h .matches{display:grid;gap:5px;padding:8px}.f10-h2h .matches article{display:grid;grid-template-columns:115px minmax(0,1fr) 220px;gap:8px;padding:9px;border:1px solid rgba(125,151,255,.12);border-radius:8px}.f10-h2h .matches span{color:#7fc9ff;font-size:8px}.f10-h2h .matches strong{color:#fff}.f10-h2h .matches strong b{color:var(--f10d-gold)}.f10-h2h .matches small{color:#8493b4;text-align:right}
      .f10-broadcast-now{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}.f10-broadcast-now article{display:grid;gap:5px;padding:13px;border:1px solid var(--f10d-line);border-radius:12px;background:rgba(8,16,40,.68)}.f10-broadcast-now span{color:#78c9ff;font-size:8px;font-weight:900}.f10-broadcast-now strong{color:#fff}.f10-broadcast-scenes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.f10-broadcast-scenes article{display:grid;align-content:start;gap:7px;min-height:155px;padding:13px;border:1px solid var(--f10d-line);border-radius:13px;background:linear-gradient(150deg,rgba(52,127,255,.09),rgba(167,77,243,.06))}.f10-broadcast-scenes span{color:#7fc9ff;font-size:8px;font-weight:900}.f10-broadcast-scenes strong{color:#fff}.f10-broadcast-scenes small{color:#8594b5;line-height:1.5}.f10-broadcast-scenes button{align-self:end;margin-top:auto;padding:9px;border:1px solid rgba(125,151,255,.28);border-radius:8px;background:#0b1837;color:#fff;font-size:8px;font-weight:900;cursor:pointer}
      .f10-award-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}.f10-award-grid article{display:grid;gap:5px;padding:13px;border:1px solid var(--f10d-line);border-radius:12px;background:linear-gradient(145deg,rgba(229,189,99,.07),rgba(157,103,255,.05))}.f10-award-grid span{color:var(--f10d-gold);font-size:8px;font-weight:900}.f10-award-grid strong{color:#fff}.f10-award-grid small{color:#8191b4}.f10-award-grid em{color:#78c9ff;font-size:7px;font-style:normal;font-weight:900}.f10-universe-grid{display:grid;grid-template-columns:.9fr 1.1fr;gap:10px}.f10-universe-grid>form,.f10-universe-archive{padding:15px;border:1px solid var(--f10d-line);border-radius:15px;background:rgba(7,14,36,.7)}.f10-universe-grid form>header{display:flex;justify-content:space-between;margin-bottom:10px}.f10-universe-grid form>header span,.f10-universe-archive>span{color:#78c9ff;font-size:8px;font-weight:900}.f10-universe-grid form>header strong{display:block;color:#fff;font-size:19px}.f10-universe-grid form>header small{color:var(--f10d-gold)}.f10-universe-grid form>label{display:grid;grid-template-columns:95px 1fr;align-items:center;gap:8px;margin:7px 0;color:#8998ba;font-size:9px}.f10-universe-grid form>footer{display:flex;gap:7px;margin-top:11px}.f10-universe-grid button{flex:1;padding:10px;border:1px solid var(--f10d-line);border-radius:9px;background:#0a1735;color:#fff;font-size:8px;font-weight:900}.f10-universe-grid button.primary{border:0;background:linear-gradient(90deg,#347fff,#a74df3)}.f10-universe-grid button:disabled{opacity:.4}.f10-universe-archive{display:grid;align-content:center;gap:9px}.f10-universe-archive h5{margin:0;color:#fff;font-size:22px}.f10-universe-archive>div{display:flex;align-items:center;gap:12px}.f10-universe-archive b{padding:10px;border:1px solid var(--f10d-line);border-radius:9px;color:var(--f10d-gold)}.f10-universe-archive i{color:#78c9ff}.f10-universe-archive p{margin:0;color:#a1aec9;line-height:1.55}.f10-universe-archive small{color:#7f8fb0}
      @media(max-width:1100px){.f10-broadcast-scenes{grid-template-columns:repeat(3,1fr)}.f10-award-grid{grid-template-columns:repeat(2,1fr)}.f10-team-scarcity{grid-template-columns:repeat(3,1fr)}.f10-team-scarcity>div:first-child,.f10-team-scarcity>.next{grid-column:auto/span 3}}
      @media(max-width:760px){.f10-qualification-centre>header,.f10-schedule-centre>header,.f10-team-intelligence>header,.f10-dna-centre>header,.f10-broadcast-hub>header,.f10-awards-universe>header{display:grid}.f10-qualification-kpis{grid-template-columns:1fr 1fr}.f10-schedule-toolbar{grid-template-columns:1fr}.f10-schedule-progress,.f10-team-intel-grid,.f10-dna-tiers,.f10-broadcast-now,.f10-universe-grid{grid-template-columns:1fr}.f10-schedule-list>button{grid-template-columns:32px 55px 1fr}.f10-schedule-list>button>strong,.f10-schedule-list>button>em{grid-column:1/4}.f10-team-scarcity{grid-template-columns:repeat(3,1fr)}.f10-team-scarcity>div:first-child,.f10-team-scarcity>.next{grid-column:1/4}.f10-dna-selectors,.f10-dna-profile{grid-template-columns:1fr}.f10-h2h .summary{grid-template-columns:repeat(3,1fr)}.f10-h2h .matches article{grid-template-columns:1fr}.f10-h2h .matches small{text-align:left}.f10-broadcast-scenes,.f10-award-grid{grid-template-columns:1fr 1fr}.f10-universe-grid form>label{grid-template-columns:1fr}.f10-universe-grid form>footer{display:grid}.f10-team-intel-grid article>div>div{grid-template-columns:20px minmax(0,1fr) 65px}.f10-team-intel-grid article>div>div small{grid-column:2/4}}
      @media(max-width:480px){.f10-qualification-kpis,.f10-broadcast-scenes,.f10-award-grid{grid-template-columns:1fr}.f10-dna-profile label{grid-template-columns:85px 30px 1fr}.f10-h2h .summary{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  async function handleClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const button = target?.closest?.("[data-f10draw-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.f10drawAction;
    event.preventDefault();
    event.stopPropagation();
    const originalText = button.textContent;
    if (action === "prepare-draw") {
      button.disabled = true;
      button.textContent = "Kura hazırlanıyor…";
    }
    try {
      if (action === "tab") {
        activeTab = button.dataset.tab || "draw";
        persistViewState();
        scheduleRender();
      } else if (action === "print-centre") {
        window.open(`fifa10-print-centre.html?fifa9build=${BUILD}`, "_blank", "noopener,noreferrer");
      } else if (action === "open-broadcast") {
        const mode = ["standings", "latest", "next", "qualification", "lowerthird"].includes(button.dataset.mode) ? button.dataset.mode : "standings";
        window.open(`fifa10-broadcast.html?fifa9build=${BUILD}&mode=${encodeURIComponent(mode)}`, "_blank", "noopener,noreferrer");
      } else if (action === "open-tv") {
        openTvMode();
      } else if (action === "close-tv") {
        closeTvMode();
      } else if (action === "sync-history") {
        openSyncHistoryModal();
      } else if (action === "retry-sync") {
        closeModal();
        await savePayload(deepClone(payload), "Bulut senkronizasyonu yeniden denendi.");
      } else if (action === "select-player") {
        selectedPlayerRef = button.dataset.playerId || "";
        activeTab = "players";
        const url = new URL(location.href);
        const selected = resolvePlayer(getDraw(), selectedPlayerRef);
        if (selected) url.searchParams.set("fifa10player", selected.name);
        history.replaceState(history.state, "", url);
        persistViewState();
        scheduleRender();
      } else if (action === "select-team-player") {
        selectedPlayerRef = button.dataset.playerId || "";
        activeTab = "teams";
        persistViewState();
        scheduleRender();
      } else if (action === "open-scenario") {
        openScenarioModal(button.dataset.playerId);
      } else if (action === "universe-nav") {
        window.FIFA_APP_CONTEXT?.navigate?.(button.dataset.target || "seasonhub");
      } else if (action === "manual-start") await startManualGroupEntry();
      else if (action === "prepare-draw") await prepareDraw();
      else if (action === "switch-manual") await switchToManualEntry();
      else if (action === "open-manual-overlay") openManualGroupOverlay();
      else if (action === "close-manual-overlay") closeManualGroupOverlay();
      else if (action === "manual-assign") await assignManualGroup(button.dataset.playerId, button.dataset.group);
      else if (action === "finalize-manual") await finalizeManualGroups();
      else if (action === "draw-next") await drawNext();
      else if (action === "auto-draw") await startAutoDraw();
      else if (action === "reset-draw") await resetDraw({ reopenRegistration: false });
      else if (action === "reopen-registration") await resetDraw({ reopenRegistration: true });
      else if (action === "fixture-group") {
        fixtureGroupFilter = button.dataset.group || "A";
        persistViewState(); scheduleRender();
      } else if (action === "fixture-leg") {
        fixtureLegFilter = Number(button.dataset.leg || 0);
        persistViewState(); scheduleRender();
      } else if (action === "open-result") {
        if (!isAdmin()) return;
        openResultModal(button.dataset.fixtureId);
      } else if (action === "close-modal") closeModal();
      else if (action === "clear-result") await clearResult(button.dataset.fixtureId);
    } catch (error) {
      notify(String(error?.message || error || "İşlem tamamlanamadı."), "error");
    } finally {
      if (action === "prepare-draw" && button.isConnected && !getDraw()) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function handleChange(event) {
    const id = event.target?.id;
    if (id === "f10QuickPlayerFilter") quickPlayerFilter = String(event.target.value || "");
    else if (id === "f10DnaPlayer") {
      selectedPlayerRef = String(event.target.value || "");
      if (selectedPlayerRef === rivalPlayerRef) rivalPlayerRef = "";
    } else if (id === "f10DnaRival") rivalPlayerRef = String(event.target.value || "");
    else if (id === "f10ScheduleDuration") {
      scheduleMatchMinutes = Math.max(8, Math.min(30, Number(event.target.value || 15)));
      localStorage.setItem("fifa10-schedule-minutes", String(scheduleMatchMinutes));
    } else return;
    persistViewState();
    scheduleRender();
  }

  function handleLocalNewPlayerRegistration(event) {
    if (event.target?.id !== "fifa10RegistrationForm" || cloudConfigured()) return;
    const form = event.target;
    const selection = String(new FormData(form).get("playerName") || "").trim();
    if (selection !== "__new__") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const name = String(new FormData(form).get("newPlayerName") || "").replace(/\s+/g, " ").trim();
    if (name.length < 3) { notify("Lütfen geçerli bir ad ve soyad girin.", "error"); return; }
    const next = localPayload();
    const draft = getDraft(next);
    const existing = (draft.players || []).some(item => normalize(item.name || item.playerName) === normalize(name));
    if (existing) { notify("Bu oyuncu FIFA 10'a zaten kayıtlı.", "error"); return; }
    draft.settings.newPlayerBaseElo = NEW_PLAYER_ELO;
    draft.players.push({ id:`F10-${Date.now().toString(36)}`, name, elo:NEW_PLAYER_ELO, source:"new", registeredAt:nowISO() });
    draft.status = "registration";
    draft.updatedAt = nowISO();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    notify(`${name} FIFA 10'a ${NEW_PLAYER_ELO} geçici Standing Rating ile kaydedildi.`, "success");
    setTimeout(() => location.reload(), 450);
  }

  async function handleSubmit(event) {
    if (!["f10DrawResultForm", "f10AwardsUniverseForm"].includes(event.target?.id)) return;
    event.preventDefault();
    const form = event.target;
    if (form.dataset.f10Submitting === "1") return;
    form.dataset.f10Submitting = "1";
    const submitter = event.submitter || form.querySelector('button[type="submit"]');
    const originalText = submitter?.textContent || "";
    if (submitter) {
      submitter.disabled = true;
      submitter.textContent = form.id === "f10DrawResultForm" ? "Kaydediliyor…" : originalText;
    }
    try {
      if (form.id === "f10AwardsUniverseForm") await saveAwardsUniverse(form, event.submitter?.value || "save");
      else await saveResult(form);
    } catch (error) {
      notify(String(error?.message || error), "error");
      if (form.isConnected) form.dataset.f10Submitting = "0";
      if (submitter?.isConnected) {
        submitter.disabled = false;
        submitter.textContent = originalText;
      }
    }
  }

  function handleKeydown(event) {
    if (event.key === "Escape" && tvModeOpen) {
      event.preventDefault();
      closeTvMode();
      return;
    }
    if (event.key === "Escape" && document.getElementById("f10DrawModal")) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key === "Escape" && manualEntryOverlayOpen) {
      event.preventDefault();
      closeManualGroupOverlay();
    }
  }

  async function boot() {
    const ready = await waitForApplication();
    if (!ready) return;
    if (new URL(location.href).searchParams.get("fifa10player")) activeTab = "players";
    if (new URL(location.href).searchParams.get("fifa10pass")) activeTab = "championship";
    installStyles();
    installAdvancedStyles();
    document.addEventListener("click", handleClick, true);
    document.addEventListener("change", handleChange, true);
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("submit", handleLocalNewPlayerRegistration, true);
    document.addEventListener("submit", handleSubmit);
    observer = new MutationObserver(scheduleRender);
    const view = document.getElementById("view");
    if (view) observer.observe(view, { childList: true, subtree: true });
    await reloadAll();
    subscribeRealtime();
    setInterval(() => reloadAll().catch(() => {}), REFRESH_MS);
    window.FIFA10_DRAW_ENGINE = {
      version: VERSION,
      newPlayerElo: NEW_PLAYER_ELO,
      standings: drawOverride => standings(drawOverride || getDraw()),
      drawState: () => deepClone(getDraw()),
      isBusy: () => moduleBusy,
      refresh: reloadAll,
      generateFixtures,
      secureShuffle,
      startManualGroupEntry,
      switchToManualEntry,
      assignManualGroup,
      finalizeManualGroups,
      prepareDraw,
      openPlayerCentre: player => {
        selectedPlayerRef = String(player || "");
        activeTab = "players";
        persistViewState();
        scheduleRender();
      },
      openTvMode,
      qualificationOutlook: drawOverride => qualificationOutlook(drawOverride || getDraw()),
      dynamicSchedule: drawOverride => buildDynamicSchedule(drawOverride || getDraw()),
      teamPoolIntelligence: drawOverride => teamPoolIntelligence(drawOverride || getDraw()),
      playerDna: (playerId, drawOverride) => playerDna(drawOverride || getDraw(), playerId),
      headToHead: (playerId, rivalId, drawOverride) => headToHead(drawOverride || getDraw(), playerId, rivalId),
      officialAwardCandidates: drawOverride => officialAwardCandidates(drawOverride || getDraw()),
      saveChampionshipState,
      restoreBlackBoxEvent,
      blackBox: () => deepClone(getDraft().blackBox || []),
      championshipState: () => deepClone(getDraft().championshipOS || null),
      championshipOS: () => window.FIFA_CHAMPIONSHIP_OS || null,
      evolutionOS: () => window.FIFA_EVOLUTION_OS || null,
      universeIntelligence: () => window.FIFA_UNIVERSE_INTELLIGENCE || null,
      openPrintCentre: () => window.open(`fifa10-print-centre.html?fifa9build=${BUILD}`, "_blank", "noopener,noreferrer"),
      openBroadcast: mode => window.open(`fifa10-broadcast.html?fifa9build=${BUILD}&mode=${encodeURIComponent(mode || "standings")}`, "_blank", "noopener,noreferrer"),
      openFinalNight: mode => window.open(`fifa10-final-night.html?fifa9build=${BUILD}&mode=${encodeURIComponent(mode || "journey")}`, "_blank", "noopener,noreferrer")
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
