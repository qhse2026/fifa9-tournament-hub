(() => {
  "use strict";

  const VERSION = "47.15.0";
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
  let activeTab = sessionStorage.getItem("fifa10-draw-active-tab") || "draw";
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
  let quickPlayerFilter = sessionStorage.getItem("fifa10-quick-player") || "";
  let tvModeOpen = false;
  let tvClockTimer = null;

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
    return next;
  }

  function getDraft(source = payload) {
    return ensurePayloadShape(source).seasonSystem.fifa10Draft;
  }

  function getDraw(source = payload) {
    return getDraft(source).draw || null;
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

  async function savePayload(nextPayload, message = "") {
    const next = ensurePayloadShape(nextPayload);
    payload = next;
    // Always commit locally first. The tournament can continue even if the network momentarily fails.
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
      window.FIFA_APP_CONTEXT?.refreshView?.();
    }
    // Reflect operational changes immediately. Cloud latency must never freeze
    // manual group assignment or result entry on the tournament device.
    scheduleRender();
    if (manualEntryOverlayOpen) syncManualGroupOverlay();
    let cloudSaved = false;
    let cloudError = null;
    if (cloudConfigured() && isAdmin()) {
      try {
        await window.FIFA_CLOUD.save(next);
        cloudSaved = true;
        recordSyncEvent(
          "cloud",
          message ? `${message} Canlı siteye kaydedildi.` : "Canlı siteye kaydedildi.",
          message ? "The operation was saved to the live site." : "Saved to the live site."
        );
      } catch (error) {
        cloudError = error;
        recordSyncEvent(
          "error",
          `Cihaz kaydı güvende; bulut bekliyor: ${error?.message || error}`,
          `The device save is safe; cloud sync is pending: ${error?.message || error}`
        );
        console.error("FIFA 10 cloud save failed; local operation was preserved.", error);
      }
    }
    if (message) {
      if (cloudError) {
        operationNotice = { type: "warning", text: `${message} Bu cihazda kaydedildi; canlı senkronizasyon başarısız: ${cloudError?.message || cloudError}` };
        notify("İşlem bu cihazda kaydedildi. Bulut senkronizasyonu bekliyor.", "error");
      } else {
        operationNotice = { type: "success", text: `${message}${cloudSaved ? " Canlı siteye kaydedildi." : " Bu cihazda kaydedildi."}` };
        notify(message, "success");
      }
    }
    scheduleRender();
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
    return (draw.fixtures || []).some(match => {
      if (match.id === excludeMatchId || !match.completed) return false;
      if (match.homeId === playerId && normalize(match.homeTeam) === target) return true;
      if (match.awayId === playerId && normalize(match.awayTeam) === target) return true;
      return false;
    });
  }

  function usedTeamsForPlayer(draw, playerId, stars = null, excludeMatchId = "") {
    const used = new Set();
    (draw?.fixtures || []).forEach(match => {
      if (match.id === excludeMatchId || !match.completed) return;
      if (stars !== null && Number(match.stars) !== Number(stars)) return;
      if (match.homeId === playerId && match.homeTeam) used.add(normalize(match.homeTeam));
      if (match.awayId === playerId && match.awayTeam) used.add(normalize(match.awayTeam));
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
    return `<div class="f10-draw-pots">${pots.map((rows, index) => `<article class="pot-${index + 1}"><header><span>TORBA</span><b>${index + 1}</b><small>${rows.length}/3</small></header><div>${rows.map(row => `<div><strong>${escapeHTML(row.name)}</strong><span>${row.elo} ELO</span>${draw?.assignments?.find(item => item.playerId === row.id) ? `<em>GRUP ${draw.assignments.find(item => item.playerId === row.id).group}</em>` : ""}</div>`).join("") || "<p>Boş</p>"}</div></article>`).join("")}</div>`;
  }

  function renderGroupMini(group, rows, draw) {
    const isFive = rows.length === 5;
    return `<article class="f10-draw-group-card group-${group} ${isFive ? "is-five" : ""}"><header><div><span>GROUP</span><strong>${group}</strong></div><b>${rows.length} OYUNCU</b></header><div>${rows.map((row, index) => `<div><i>${index + 1}</i><span><strong>${escapeHTML(row.name)}</strong><small>Torba ${row.pot} · ${row.elo} ELO</small></span></div>`).join("") || `<p>Kura bekleniyor</p>`}</div>${isFive ? `<footer>★ 5 OYUNCULU GRUP · KURA SONUCU</footer>` : ""}</article>`;
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
        return `<article><div><small>TORBA ${player.pot} · ${player.elo} ELO</small><strong>${escapeHTML(player.name)}</strong></div><div class="f10-group-choice">${GROUPS.map(group=>`<button type="button" class="${selected===group?"active":""}" data-f10draw-action="manual-assign" data-player-id="${escapeHTML(player.id)}" data-group="${group}">${group}</button>`).join("")}</div></article>`;
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
      body.innerHTML = `<div class="f10-manual-loading"><i></i><strong>Grup giriş ekranı hazırlanıyor…</strong><span>Kayıtlı oyuncular ve ELO torbaları kontrol ediliyor.</span></div>`;
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
      return `<div class="f10-draw-ready-panel"><div><span>${count} PARTICIPANTS · 5 ELO POTS</span><h4>Turnuvayı şimdi başlat.</h4><p>Kura dışarıda çekildiyse sonuçları elle gir. Henüz çekilmediyse sistem üzerinden otomatik kura yap. ${groupCopy}</p></div>${canManage ? `<div class="f10-start-actions"><button type="button" class="f10-draw-primary" data-f10draw-action="manual-start">Çekilen Grupları Elle Gir ↗</button><button type="button" data-f10draw-action="prepare-draw">Sistem Üzerinden Kura Başlat</button></div>` : `<strong class="f10-public-wait">Yönetici grup sonuçlarını sisteme işleyecek.</strong>`}</div>${renderPots(null)}`;
    }
    if (draw.status === "manual-entry") {
      const assigned = new Set(GROUPS.flatMap(group => draw.groups?.[group] || [])).size;
      return `<section class="f10-manual-resume"><div><span>MANUAL DRAW RESULT ENTRY</span><h4>Grup girişi devam ediyor.</h4><p>${assigned}/${draw.participants.length} oyuncu yerleştirildi. Tam ekran operasyon panelini açarak kaldığınız yerden devam edin.</p></div><button type="button" class="f10-draw-primary" data-f10draw-action="open-manual-overlay">Grup Giriş Ekranını Aç ↗</button></section>`;
    }
    return `<div class="f10-draw-stage">
      <div class="f10-live-reveal ${last ? "has-reveal" : ""}"><span>${draw.status === "completed" ? "FINAL DRAW RESULT" : "LIVE DRAW REVEAL"}</span>${last ? `<small>TORBA ${last.pot}</small><h4>${escapeHTML(last.playerName)}</h4><div>GRUP <b>${last.group}</b></div><em>${last.elo} ELO</em>` : `<h4>Kura başlamaya hazır</h4><p>İlk oyuncu ve grubu güvenli rastgele seçimle belirlenecek.</p>`}<footer><strong>${draw.assignments.length}/${draw.participants.length}</strong><span>${remaining} oyuncu kaldı</span><code>${escapeHTML(draw.drawId)}</code></footer></div>
      <div class="f10-draw-controls">${canManage && draw.entryMode !== "official-fixed-groups" && draw.status !== "completed" ? `<button type="button" class="f10-draw-primary" data-f10draw-action="draw-next" ${moduleBusy || autoDrawing ? "disabled" : ""}>Sıradaki Oyuncuyu Çek</button><button type="button" data-f10draw-action="auto-draw" ${moduleBusy ? "disabled" : ""}>${autoDrawing ? "Otomatik Kurayı Durdur" : "Otomatik Kura"}</button><button type="button" data-f10draw-action="switch-manual">Çekilen Grupları Elle Gir</button>` : ""}${canManage && draw.entryMode !== "official-fixed-groups" ? `${draw.status === "completed" && !(draw.fixtures || []).some(match => match.completed) ? `<button type="button" data-f10draw-action="switch-manual">Grupları Düzenle</button>` : ""}<button type="button" data-f10draw-action="reset-draw">Kurayı Sıfırla</button><button type="button" class="danger" data-f10draw-action="reopen-registration">Kayıtlara Dön</button>` : ""}</div>
      <div class="f10-draw-group-grid">${GROUPS.map(group => renderGroupMini(group, groups[group], draw)).join("")}</div>
      <div class="f10-draw-log"><header><span>KURA KAYDI</span><strong>${draw.assignments.length} işlem</strong></header><div>${[...(draw.assignments || [])].reverse().slice(0, draw.participants.length).map(item => `<div><i>${String(item.sequence).padStart(2, "0")}</i><span><strong>${escapeHTML(item.playerName)}</strong><small>Torba ${item.pot}</small></span><b>GRUP ${item.group}</b></div>`).join("") || `<p>Henüz çekim yapılmadı.</p>`}</div></div>
    </div>`;
  }

  function renderGroupTables(draw) {
    const groups = currentGroups(draw);
    return `<section><div class="f10-groups-rule"><span>OFFICIAL DRAW RESULT</span><strong>Grup içi puan tablosu kullanılmaz.</strong><p>Bütün oyuncular maç başına puan ortalamasıyla tek Genel Puan tablosunda sıralanır.</p></div><div class="f10-groups-full">${GROUPS.map(group => `<article class="f10-group-full group-${group}"><header><div><span>GROUP</span><strong>${group}</strong></div><b>${groups[group].length} OYUNCU</b></header><div class="f10-group-members">${groups[group].map(row => `<div><strong>${escapeHTML(row.name)}</strong><span>Torba ${row.pot} · ${row.elo} ELO</span></div>`).join("")}</div></article>`).join("")}</div></section>`;
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
      <div class="f10-player-identity"><div><span>${uiCopy("GRUP", "GROUP")} ${group}</span><h5>${escapeHTML(selected.name)}</h5><small>${selected.elo} ELO</small></div><dl><div><dt>${uiCopy("Sıra", "Rank")}</dt><dd>#${tableRow?.rank || "–"}</dd></div><div><dt>PPG</dt><dd>${(tableRow?.ppg || 0).toFixed(3)}</dd></div><div><dt>${uiCopy("AV/M", "GD/M")}</dt><dd>${(tableRow?.gdPerMatch || 0) > 0 ? "+" : ""}${(tableRow?.gdPerMatch || 0).toFixed(3)}</dd></div><div><dt>${uiCopy("Yol", "Path")}</dt><dd class="path-${qualification.key}">${uiCopy(qualification.label, qualification.key === "direct" ? "DIRECT QF" : qualification.key === "playin" ? "CHAMPIONSHIP PLAY-IN" : "ELIMINATED")}</dd></div></dl></div>
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
    (draw.fixtures || [])
      .filter(match => match.completed && (match.homeId === player.id || match.awayId === player.id))
      .sort((a, b) => a.leg - b.leg || a.matchday - b.matchday || a.sequence - b.sequence)
      .forEach(match => {
        const isHome = match.homeId === player.id;
        const team = String(isHome ? match.homeTeam || "" : match.awayTeam || "").trim();
        if (!team) {
          missing += 1;
          return;
        }
        selections.push({
          team,
          stars: Number(match.stars),
          opponent: playerName(isHome ? match.awayId : match.homeId, draw)
        });
      });
    return { ...player, selections, missing };
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
        const entries = player.selections.filter(item => item.stars === stars);
        return `<section><header><b>${stars}★</b><small>${entries.length} kullanıldı · ${Math.max(0, teamPool(stars).length - entries.length)} uygun takım kaldı</small></header><div>${entries.length ? entries.map(item => `<span title="${escapeHTML(item.opponent)}">${escapeHTML(item.team)}</span>`).join("") : `<em>Henüz takım kullanılmadı</em>`}</div></section>`;
      }).join("");
      return `<article class="f10-passport-card"><header><div><span>GRUP ${escapeHTML(player.group || "–")}</span><strong>${escapeHTML(player.name)}</strong></div><b>${player.selections.length} TAKIM</b></header>${byStars}${player.missing ? `<p>${player.missing} sonuçta takım bilgisi eksik; fikstürden maçı açıp tamamlayabilirsiniz.</p>` : ""}</article>`;
    }).join("");
    return `<section class="f10-team-centre"><header><div><span>FIFA 10 TEAM PASSPORT</span><h4>Oyuncu Takım Listeleri</h4><p>Her oyuncunun kullandığı takım burada devre bazında izlenir. Kullanılmış takım aynı oyuncunun açılır listesinde otomatik kilitlenir.</p></div><b>${players.reduce((sum, player) => sum + player.selections.length, 0)} SEÇİM</b></header>
      <div class="f10-passport-grid">${passportCards}</div>
      <header class="pool-heading"><div><span>LOCKED CLUB CATALOGUE</span><h4>Sabit Takım Havuzu</h4><p>Fikstür sonucu girerken sadece maçın yıldız seviyesine ait bu kulüpler seçilebilir; havuz dışı serbest takım girişi kapatılmıştır.</p></div><b>${LEG_STARS.reduce((sum, stars) => sum + teamPool(stars).length, 0)} TAKIM</b></header>
      <div class="f10-pool-grid">${poolCards}</div>
    </section>`;
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
    if (draw?.status === "completed" && activeTab === "draw" && sessionStorage.getItem("fifa10-draw-tab-autoset") !== draw.drawId) {
      activeTab = (draw.fixtures || []).some(match => match.completed) ? "fixtures" : "groups";
      sessionStorage.setItem("fifa10-draw-tab-autoset", draw.drawId);
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
      ["draw", "KURA"],
      ["groups", "GRUPLAR"],
      ["standings", "GENEL PUAN"],
      ["fixtures", "FİKSTÜR"],
      ["teams", "TAKIMLAR"],
      ["players", uiCopy("OYUNCU MERKEZİ", "PLAYER CENTRE")]
    ];
    const participantCount = draw?.participants?.length || registrationRows().length;
    const sizeText = projectedGroupSizes(participantCount).join("-");
    const fixedGroups = draw?.entryMode === "official-fixed-groups";
    const completedCount = draw?.fixtures?.filter(match => match.completed).length || 0;
    const html = `<header class="f10-draw-hero"><div><span>FIFA 10 · TOURNAMENT OPERATIONS</span><h3>${fixedGroups ? "Resmî fikstür." : "Kura çekimi."}<br><em>Üç grup, tek sıralama.</em></h3><p>${fixedGroups ? `A, B ve C grupları kesinleşti. ${draw.fixtures?.length || 78} maçlık 4★, 4.5★ ve 5★ devreleri bu merkezden yönetilir; her sonuç bütün FIFA evrenine aynı anda işlenir.` : `${participantCount} katılımcı ELO torbalarından canlı kurayla A, B ve C gruplarına dağıtılır. Beklenen grup dağılımı ${sizeText}; hangi grupların büyük olacağı yalnızca kura sırasında belirlenir.`}</p></div><aside class="status-${status.key}"><i></i><strong>${status.label}</strong><small>${fixedGroups ? `${completedCount}/${draw.fixtures?.length || 78} sonuç işlendi` : status.note}</small>${draw?.fivePlayerGroups?.length ? `<b>5 OYUNCULU GRUP${draw.fivePlayerGroups.length > 1 ? "LAR" : ""} · ${draw.fivePlayerGroups.join(" / ")}</b>` : `<b>GRUP BÜYÜKLÜKLERİ · KURADA</b>`}</aside></header>
      <nav class="f10-draw-tabs">${tabs.map(([id, label]) => `<button type="button" class="${activeTab === id ? "active" : ""}" data-f10draw-action="tab" data-tab="${id}" ${!draw && id !== "draw" ? "disabled" : ""}>${label}</button>`).join("")}${draw?.status === "completed" ? `<button type="button" class="f10-tv-launch" data-f10draw-action="open-tv">${uiCopy("TV MODU", "TV MODE")} ↗</button><button type="button" class="f10-print-launch" data-f10draw-action="print-centre">${uiCopy("YAZDIRMA MERKEZİ", "PRINT CENTRE")} ↗</button>` : ""}</nav>
      <div class="f10-operation-notice ${operationNotice.type || "info"}"><strong>${operationNotice.type === "success" ? "✓" : operationNotice.type === "warning" ? "!" : "i"}</strong><span>${escapeHTML(operationNotice.text || "")}</span></div>
      ${draw?.status === "completed" ? renderSyncStatus() : ""}
      ${draw?.status === "completed" ? `<section class="f10-connected-universe"><div><span>ONE SOURCE · CONNECTED UNIVERSE</span><strong>Bir sonucu gir; bütün merkezler birlikte güncellensin.</strong><small>Form, oran, Zekâ, canlı maç, takımlar ve tüm zamanlar aynı resmî FIFA 10 maç kaydını okur.</small></div><nav><button type="button" data-f10draw-action="universe-nav" data-target="livestats">Canlı İstatistik</button><button type="button" data-f10draw-action="universe-nav" data-target="form">Form</button><button type="button" data-f10draw-action="universe-nav" data-target="odds">Oranlar</button><button type="button" data-f10draw-action="universe-nav" data-target="intelligence">Zekâ</button><button type="button" data-f10draw-action="universe-nav" data-target="teams">Takımlar</button><button type="button" data-f10draw-action="universe-nav" data-target="alltime">Tüm Zamanlar</button></nav></section>` : ""}
      <div class="f10-draw-content">${activeTab === "draw" ? renderDrawArena(draw) : activeTab === "groups" ? (draw ? renderGroupTables(draw) : renderDrawArena(null)) : activeTab === "standings" ? (draw?.status === "completed" ? renderStandings(draw) : renderDrawArena(draw)) : activeTab === "teams" ? (draw?.status === "completed" ? renderTeamPassports(draw) : renderDrawArena(draw)) : activeTab === "players" ? (draw?.status === "completed" ? renderPlayerMatchCentre(draw) : renderDrawArena(draw)) : (draw?.status === "completed" ? renderFixtures(draw) : renderDrawArena(draw))}</div>
      <footer class="f10-draw-footer"><span>GENEL SIRALAMA: PPG → MAÇ BAŞINA AVERAJ → TOPLAM ATILAN GOL → GALİBİYET ORANI → KURA SIRASI</span><b>RATE-BASED FAIR TABLE · NO VOLUME ADVANTAGE</b></footer>`;
    const renderSignature = JSON.stringify({
      tab: activeTab,
      groupFilter: fixtureGroupFilter,
      legFilter: fixtureLegFilter,
      admin: isAdmin(),
      busy: moduleBusy,
      auto: autoDrawing,
      notice: `${operationNotice.type || "info"}:${operationNotice.text || ""}`,
      selectedPlayer: selectedPlayerRef,
      quickPlayer: quickPlayerFilter,
      sync: readSyncHistory()[0]?.id || "",
      registrations: registrationRows().map(row => `${row.id}:${row.elo}`).join("|"),
      draw: draw ? `${draw.drawId}:${draw.status}:${draw.updatedAt}:${draw.assignments?.length || 0}:${draw.fixtures?.filter(item => item.completed).length || 0}` : "none"
    });
    // Keep the signature on the actual centre node. Comparing serialized
    // innerHTML is unstable because browsers normalize the markup; the old
    // comparison fed this module's own MutationObserver forever, blocking
    // clicks on desktop and destroying newly opened sheets on mobile.
    if (section.dataset.f10RenderSignature !== renderSignature) {
      section.innerHTML = html;
      section.dataset.f10RenderSignature = renderSignature;
      lastRenderSignature = renderSignature;
    }
    patchRegistrationLock(draw);
    syncManualGroupOverlay();
    renderTvOverlay(draw);
  }

  function patchExistingInterface() {
    const navLabel = document.querySelector('.os-primary-nav [data-nav="seasonhub"] span');
    if (navLabel && navLabel.textContent !== "Format & Kura") navLabel.textContent = "Format & Kura";
    const version = document.querySelector(".sidebar-version");
    const versionText = `Football Universe · V${VERSION} · Championship Play-in`;
    if (version && version.textContent !== versionText) version.textContent = versionText;
    const meta = document.querySelector('meta[name="fifa9-build"]');
    const metaValue = `${VERSION}-fifa10-tournament-experience-suite`;
    if (meta && meta.content !== metaValue) meta.content = metaValue;
    const url = new URL(location.href);
    if (url.searchParams.get("fifa9build") !== "471500") {
      url.searchParams.set("fifa9build", "471500");
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
    const footerText = "Torbalar ELO sırasıyla 3'er oyuncu olarak doldu. Dört tam torbadan her gruba birer oyuncu gidecek; Torba 5 oyuncusunun çekildiği grup 5 kişilik olacak.";
    if (footer && footer.textContent !== footerText) footer.textContent = footerText;
    document.querySelectorAll(".f10-elo-explainer article").forEach(article => {
      const value = article.querySelector(":scope > span");
      const copy = article.querySelector("p");
      if (value?.textContent?.trim() === "1500" || copy?.textContent?.includes("1500 ELO")) {
        if (value) value.textContent = String(NEW_PLAYER_ELO);
        if (copy) copy.textContent = `Yeni oyuncular sisteme ${NEW_PLAYER_ELO} ELO ile girer.`;
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
    sessionStorage.setItem("fifa10-quick-player", quickPlayerFilter);
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      try { renderModule(); } catch (error) { console.warn("FIFA 10 draw render failed", error); }
    });
  }

  async function reloadAll() {
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
        window.open("fifa10-print-centre.html?fifa9build=471500", "_blank", "noopener,noreferrer");
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
    if (event.target?.id !== "f10QuickPlayerFilter") return;
    quickPlayerFilter = String(event.target.value || "");
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
    notify(`${name} FIFA 10'a ${NEW_PLAYER_ELO} ELO ile kaydedildi.`, "success");
    setTimeout(() => location.reload(), 450);
  }

  async function handleSubmit(event) {
    if (event.target?.id !== "f10DrawResultForm") return;
    event.preventDefault();
    try { await saveResult(event.target); } catch (error) { notify(String(error?.message || error), "error"); }
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
    installStyles();
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
      openPrintCentre: () => window.open("fifa10-print-centre.html?fifa9build=471500", "_blank", "noopener,noreferrer")
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
