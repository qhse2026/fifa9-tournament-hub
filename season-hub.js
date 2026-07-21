(() => {
  "use strict";

  const VERSION = 39;
  const DEFAULT_SETTINGS = Object.freeze({
    premierSize: 7,
    promotion: 2,
    relegation: 2,
    pointsWin: 3,
    pointsDraw: 1,
    pointsLoss: 0,
    legs: [
      { id: "leg-1", label: "1. Devre", stars: 4 },
      { id: "leg-2", label: "2. Devre", stars: 4.5 },
      { id: "leg-3", label: "3. Devre", stars: 5 }
    ],
    cupStars: 4.5,
    playoffBestOf: 3,
    semifinalBestOf: 3,
    finalBestOf: 1,
    superCupBestOf: 1
  });

  const DEFAULT_TEAM_POOLS = Object.freeze({
    "4": { label: "1. Devre · 4★", stars: 4, teams: [] },
    "4.5": { label: "2. Devre · 4.5★", stars: 4.5, teams: [] },
    "5": { label: "3. Devre · 5★", stars: 5, teams: [] },
    "cup": { label: "Oruç Reis & Süper Kupa · 4.5★", stars: 4.5, teams: [] }
  });

  let selectedEdition = 10;
  let selectedTab = "overview";
  let leagueLegFilter = "all";
  let selectedCareerPlayerName = "";
  let wizardStep = 1;

  const ctx = () => window.FIFA_APP_CONTEXT;
  const esc = value => ctx()?.escapeHTML ? ctx().escapeHTML(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;
  const seasonLabel = edition => `FIFA${String(Number(edition) || 0).padStart(2, "0")}`;
  const now = () => new Date().toISOString();

  function appState() {
    return ctx()?.getState?.() || {};
  }

  function system() {
    const state = appState();
    if (!state.seasonSystem || typeof state.seasonSystem !== "object") state.seasonSystem = {};
    const ss = state.seasonSystem;
    if (!Array.isArray(ss.seasons)) ss.seasons = [];
    if (!Array.isArray(ss.customHonours)) ss.customHonours = [];
    ss.infrastructureVersion = VERSION;
    ss.activeEdition = Number(ss.activeEdition) || 10;
    migrateFifa10Draft(ss);
    if (!ss.seasons.some(item => Number(item.edition) === 10)) ss.seasons.push(createSeason(10));
    ss.seasons.forEach(normalizeSeason);
    ss.seasons.sort((a, b) => Number(a.edition) - Number(b.edition));
    if (!ss.seasons.some(item => Number(item.edition) === selectedEdition)) selectedEdition = Number(ss.activeEdition) || 10;
    return ss;
  }

  function migrateFifa10Draft(ss) {
    if (ss.seasons?.some(item => Number(item.edition) === 10)) return;
    const draft = ss.fifa10Draft;
    const draftPlayers = Array.isArray(draft?.players) ? draft.players.filter(item => String(item.name || "").trim()) : [];
    if (!draftPlayers.length) return;
    const season = createSeason(10, draftPlayers.map((item, index) => ({
      id: `S10-P${String(index + 1).padStart(2, "0")}`,
      name: String(item.name || "").trim(),
      league: item.league === "premier" ? "premier" : "championship",
      seedPriority: allTimeRank(String(item.name || "").trim()),
      source: "FIFA 10 hazırlık listesinden aktarıldı"
    })));
    season.migratedFromDraft = true;
    ss.seasons.push(season);
  }

  function createSeason(edition, playerSeeds = [], sourceEdition = null) {
    const e = Number(edition);
    const players = playerSeeds.map((item, index) => ({
      id: item.id || `S${e}-P${String(index + 1).padStart(2, "0")}-${Math.random().toString(16).slice(2, 6)}`,
      name: String(item.name || "").trim(),
      league: item.league === "premier" ? "premier" : "championship",
      seedPriority: Number.isFinite(Number(item.seedPriority)) ? Number(item.seedPriority) : 9999,
      source: item.source || (e === 10 ? "Tüm Zamanlar sıralaması" : "Önceki sezon"),
      participating: item.participating !== false
    }));
    return {
      id: `season-${e}`,
      edition: e,
      label: seasonLabel(e),
      status: "setup",
      mode: "official",
      phase: "setup",
      sourceEdition: sourceEdition ? Number(sourceEdition) : null,
      createdAt: now(),
      updatedAt: now(),
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
      players,
      leagues: {
        premier: { generated: false, playerIds: [], fixtures: [] },
        championship: { generated: false, playerIds: [], fixtures: [] }
      },
      cups: {
        oruc: emptyOrucCup(),
        super: emptySuperCup()
      },
      teamPools: JSON.parse(JSON.stringify(DEFAULT_TEAM_POOLS)),
      teamPoolLocked: false,
      enforceTeamPool: true,
      preventTeamReuse: true,
      wizardCompleted: false,
      wizardCompletedAt: null
    };
  }

  function emptyOrucCup() {
    return { status: "locked", generatedAt: null, seeds: null, series: {}, semifinalDraw: [], final: null, championId: null, runnerUpId: null };
  }

  function emptySuperCup() {
    return { status: "locked", generatedAt: null, match: null, championId: null, runnerUpId: null };
  }

  function normalizeSeason(season) {
    season.edition = Number(season.edition) || 10;
    season.label = season.label || seasonLabel(season.edition);
    season.status = ["setup", "scheduled", "active", "completed", "cancelled"].includes(season.status) ? season.status : "setup";
    season.mode = season.mode === "test" ? "test" : "official";
    season.phase = season.phase || "setup";
    season.settings = { ...JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), ...(season.settings || {}) };
    season.settings.legs = Array.isArray(season.settings.legs) && season.settings.legs.length === 3 ? season.settings.legs : JSON.parse(JSON.stringify(DEFAULT_SETTINGS.legs));
    season.players = Array.isArray(season.players) ? season.players : [];
    season.players.forEach((player, index) => {
      player.id = player.id || `S${season.edition}-P${index + 1}-${Math.random().toString(16).slice(2, 6)}`;
      player.name = String(player.name || "").trim();
      player.league = player.league === "premier" ? "premier" : "championship";
      player.participating = player.participating !== false;
      player.seedPriority = Number.isFinite(Number(player.seedPriority)) ? Number(player.seedPriority) : 9999;
      player.source = player.source || "Manuel katılım";
    });
    season.leagues = season.leagues || {};
    for (const leagueId of ["premier", "championship"]) {
      season.leagues[leagueId] = season.leagues[leagueId] || {};
      season.leagues[leagueId].generated = Boolean(season.leagues[leagueId].generated);
      season.leagues[leagueId].playerIds = Array.isArray(season.leagues[leagueId].playerIds) ? season.leagues[leagueId].playerIds : [];
      season.leagues[leagueId].fixtures = Array.isArray(season.leagues[leagueId].fixtures) ? season.leagues[leagueId].fixtures : [];
    }
    season.cups = season.cups || {};
    season.cups.oruc = { ...emptyOrucCup(), ...(season.cups.oruc || {}) };
    season.cups.oruc.series = season.cups.oruc.series || {};
    season.cups.super = { ...emptySuperCup(), ...(season.cups.super || {}) };
    const pools = season.teamPools && typeof season.teamPools === "object" ? season.teamPools : {};
    season.teamPools = {};
    Object.entries(DEFAULT_TEAM_POOLS).forEach(([key, value]) => {
      const source = pools[key] || {};
      season.teamPools[key] = {
        label: source.label || value.label,
        stars: Number(source.stars) || value.stars,
        teams: Array.isArray(source.teams) ? [...new Set(source.teams.map(item => String(item || "").trim()).filter(Boolean))] : []
      };
    });
    season.teamPoolLocked = Boolean(season.teamPoolLocked);
    season.enforceTeamPool = season.enforceTeamPool !== false;
    season.preventTeamReuse = season.preventTeamReuse !== false;
    season.wizardCompleted = Boolean(season.wizardCompleted);
    season.wizardCompletedAt = season.wizardCompletedAt || null;
    season.individualAwards = season.individualAwards && typeof season.individualAwards === "object" ? season.individualAwards : {};
    return season;
  }

  function seasons() {
    return system().seasons;
  }

  function currentSeason() {
    return seasons().find(item => Number(item.edition) === Number(selectedEdition)) || seasons()[0];
  }

  function player(season, id) {
    return season?.players?.find(item => item.id === id) || null;
  }

  function playerName(season, id) {
    return player(season, id)?.name || "—";
  }

  function allTimeRank(name) {
    const normalized = String(name || "").trim().toLocaleLowerCase("tr-TR");
    const list = ctx()?.getHistorical?.()?.allTime || [];
    const row = list.find(item => String(item.name || "").trim().toLocaleLowerCase("tr-TR") === normalized);
    return Number(row?.rank) || 9999;
  }

  function save(show = false) {
    const ss = system();
    ss.activeEdition = Number(selectedEdition) || ss.activeEdition;
    const season = currentSeason();
    if (season) season.updatedAt = now();
    return ctx()?.saveState?.(show, show) || Promise.resolve();
  }

  function toast(message, type = "success") {
    ctx()?.toast?.(message, type);
  }

  function canEdit() {
    return Boolean(ctx()?.canEdit?.());
  }

  function openModal(title, body, eyebrow = "FIFA LEAGUE SYSTEM") {
    ctx()?.openModal?.(title, body, eyebrow);
  }

  function closeModal() {
    ctx()?.closeModal?.();
  }

  function statusText(season) {
    if (season.status === "cancelled") return "İptal edildi";
    if (season.status === "completed") return "Sezon tamamlandı";
    if (season.status === "active") return season.mode === "test" ? "Test sezonu aktif" : "Resmî sezon aktif";
    if (season.status === "scheduled") return "Fikstür hazır";
    return "Oyuncu kayıtları hazırlanıyor";
  }

  function statusClass(season) {
    return `season-status-${season.status}${season.mode === "test" ? " test" : ""}`;
  }

  function activePlayers(season) {
    return season.players.filter(item => item.participating !== false && item.name.trim());
  }

  function normalizeText(value) {
    return String(value || "").trim().toLocaleLowerCase("tr-TR");
  }

  function teamPoolKeyForMatch(match) {
    if (match?.competition === "oruc" || match?.competition === "super" || match?.stage === "super-final") return "cup";
    const stars = Number(match?.stars);
    if (stars === 4) return "4";
    if (stars === 5) return "5";
    return "4.5";
  }

  function teamPoolTeams(season, matchOrKey) {
    const key = typeof matchOrKey === "string" ? matchOrKey : teamPoolKeyForMatch(matchOrKey);
    const direct = season.teamPools?.[key]?.teams || [];
    if (key === "cup" && !direct.length) return season.teamPools?.["4.5"]?.teams || [];
    return direct;
  }

  function teamPoolLabel(season, matchOrKey) {
    const key = typeof matchOrKey === "string" ? matchOrKey : teamPoolKeyForMatch(matchOrKey);
    return season.teamPools?.[key]?.label || DEFAULT_TEAM_POOLS[key]?.label || "Takım Havuzu";
  }

  function teamNameForPlayer(match, playerId) {
    if (!match || !playerId) return "";
    if (match.sameTeam) return String(match.sharedTeam || "").trim();
    if (match.homeId === playerId) return String(match.homeTeam || "").trim();
    if (match.awayId === playerId) return String(match.awayTeam || "").trim();
    return "";
  }

  function playerUsedTeams(season, playerId, filters = {}) {
    return allSeasonMatches(season).filter(match => match.id !== filters.excludeMatchId && matchComplete(match) && (match.homeId === playerId || match.awayId === playerId))
      .filter(match => filters.leg == null || Number(match.leg) === Number(filters.leg))
      .filter(match => filters.competition == null || match.competition === filters.competition)
      .map(match => teamNameForPlayer(match, playerId)).filter(Boolean);
  }

  function validateTeamForMatch(season, match, playerId, teamName) {
    const team = String(teamName || "").trim();
    const pool = teamPoolTeams(season, match);
    if (!team) return season.teamPoolLocked && pool.length ? `${teamPoolLabel(season, match)} için takım seçimi zorunludur.` : null;
    if (season.teamPoolLocked && season.enforceTeamPool && pool.length && !pool.some(item => normalizeText(item) === normalizeText(team))) {
      return `${team}, ${teamPoolLabel(season, match)} listesinde bulunmuyor.`;
    }
    if (season.preventTeamReuse && match.stage === "league" && match.leg) {
      const used = playerUsedTeams(season, playerId, { leg: match.leg, excludeMatchId: match.id });
      if (used.some(item => normalizeText(item) === normalizeText(team))) {
        return `${playerName(season, playerId)} bu takımı ${match.leg}. devrede daha önce kullandı.`;
      }
    }
    return null;
  }

  function matchTeamDatalist(season, match) {
    const id = `season-team-pool-${String(match.id || "match").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    const teams = teamPoolTeams(season, match);
    return { id, html: `<datalist id="${id}">${teams.map(team => `<option value="${esc(team)}"></option>`).join("")}</datalist>` };
  }

  function leaguePlayers(season, leagueId) {
    return activePlayers(season).filter(item => item.league === leagueId);
  }

  function hasAnySeasonResults(season) {
    return allSeasonMatches(season).some(matchComplete);
  }

  function leagueMatches(season, leagueId) {
    return season.leagues?.[leagueId]?.fixtures || [];
  }

  function cupMatches(season) {
    const cup = season.cups?.oruc;
    const seriesMatches = Object.values(cup?.series || {}).flatMap(series => {
      if (!series) return [];
      return seriesWinner(series) ? (series.matches || []).filter(matchComplete) : (series.matches || []);
    });
    return [...seriesMatches, ...(cup?.final ? [cup.final] : []), ...(season.cups?.super?.match ? [season.cups.super.match] : [])];
  }

  function allSeasonMatches(season) {
    return [...leagueMatches(season, "premier"), ...leagueMatches(season, "championship"), ...cupMatches(season)];
  }

  function matchComplete(match) {
    return Number.isFinite(Number(match?.homeScore)) && Number.isFinite(Number(match?.awayScore));
  }

  function matchWinnerId(match) {
    if (!matchComplete(match)) return null;
    if (match.winnerId && [match.homeId, match.awayId].includes(match.winnerId)) return match.winnerId;
    if (Number(match.homeScore) > Number(match.awayScore)) return match.homeId;
    if (Number(match.awayScore) > Number(match.homeScore)) return match.awayId;
    return null;
  }

  function leagueComplete(season, leagueId) {
    const matches = leagueMatches(season, leagueId);
    return matches.length > 0 && matches.every(matchComplete);
  }

  function bothLeaguesComplete(season) {
    return leagueComplete(season, "premier") && leagueComplete(season, "championship");
  }

  function standings(season, leagueId) {
    const ids = season.leagues?.[leagueId]?.playerIds?.length ? season.leagues[leagueId].playerIds : leaguePlayers(season, leagueId).map(item => item.id);
    const rows = ids.map(id => ({ id, name: playerName(season, id), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
    const map = new Map(rows.map(row => [row.id, row]));
    for (const match of leagueMatches(season, leagueId)) {
      if (!matchComplete(match)) continue;
      const home = map.get(match.homeId);
      const away = map.get(match.awayId);
      if (!home || !away) continue;
      const hs = Number(match.homeScore);
      const as = Number(match.awayScore);
      home.p += 1; away.p += 1;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      if (hs > as) { home.w += 1; away.l += 1; home.pts += season.settings.pointsWin; away.pts += season.settings.pointsLoss; }
      else if (as > hs) { away.w += 1; home.l += 1; away.pts += season.settings.pointsWin; home.pts += season.settings.pointsLoss; }
      else { home.d += 1; away.d += 1; home.pts += season.settings.pointsDraw; away.pts += season.settings.pointsDraw; }
    }
    rows.forEach(row => row.gd = row.gf - row.ga);
    rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.w - a.w || a.name.localeCompare(b.name, "tr"));
    return rows.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function createRoundRobin(playerIds, leagueId, leg, stars, edition) {
    const ids = [...playerIds];
    if (ids.length % 2 === 1) ids.push(null);
    const count = ids.length;
    const rounds = [];
    let rotation = ids.slice();
    for (let round = 0; round < count - 1; round += 1) {
      const matches = [];
      for (let i = 0; i < count / 2; i += 1) {
        let a = rotation[i];
        let b = rotation[count - 1 - i];
        if (!a || !b) continue;
        const swap = (round + i + leg) % 2 === 1;
        if (swap) [a, b] = [b, a];
        matches.push({
          id: `S${edition}-${leagueId}-L${leg}-R${round + 1}-M${i + 1}`,
          competition: leagueId,
          stage: "league",
          leg,
          round: round + 1,
          stars,
          homeId: a,
          awayId: b,
          homeScore: null,
          awayScore: null,
          homeTeam: "",
          awayTeam: "",
          winnerId: null,
          updatedAt: null
        });
      }
      rounds.push(matches);
      rotation = [rotation[0], rotation[count - 1], ...rotation.slice(1, count - 1)];
    }
    return rounds.flat();
  }

  function populateLeagueFixtures(season) {
    for (const leagueId of ["premier", "championship"]) {
      const ids = leaguePlayers(season, leagueId).map(item => item.id);
      season.leagues[leagueId].playerIds = ids;
      season.leagues[leagueId].fixtures = season.settings.legs.flatMap((leg, index) => createRoundRobin(ids, leagueId, index + 1, Number(leg.stars), season.edition));
      season.leagues[leagueId].generated = true;
    }
    season.status = "scheduled";
    season.phase = "league";
    season.cups.oruc = emptyOrucCup();
    season.cups.super = emptySuperCup();
  }

  function validateRosterForFixtures(season) {
    const premier = leaguePlayers(season, "premier");
    const championship = leaguePlayers(season, "championship");
    if (premier.length !== Number(season.settings.premierSize || 7)) return `Premier League tam olarak ${season.settings.premierSize || 7} oyuncudan oluşmalıdır.`;
    if (championship.length < 2) return "Championship için en az 2 oyuncu gereklidir.";
    if (hasAnySeasonResults(season)) return "Sonuç girilmiş bir sezonda fikstür yeniden oluşturulamaz. Önce sezon sonuçlarını sıfırla.";
    return null;
  }

  function generateLeagueFixtures(season) {
    if (!canEdit()) return;
    const error = validateRosterForFixtures(season);
    if (error) { toast(error, "error"); return; }
    populateLeagueFixtures(season);
    save(true);
    rerender();
    toast(`${seasonLabel(season.edition)} üç devreli lig fikstürü oluşturuldu.`, "success");
  }

  function autoAssignPlayers(season) {
    if (!canEdit()) return;
    if (hasAnySeasonResults(season)) {
      toast("Sonuç girildikten sonra lig dağılımı değiştirilemez.", "error");
      return;
    }
    const players = activePlayers(season);
    if (season.edition === 10 || !season.sourceEdition) {
      players.forEach(item => item.seedPriority = allTimeRank(item.name));
    }
    const sorted = [...players].sort((a, b) => Number(a.seedPriority) - Number(b.seedPriority) || allTimeRank(a.name) - allTimeRank(b.name) || a.name.localeCompare(b.name, "tr"));
    const premierIds = new Set(sorted.slice(0, Number(season.settings.premierSize || 7)).map(item => item.id));
    players.forEach(item => item.league = premierIds.has(item.id) ? "premier" : "championship");
    season.status = "setup";
    season.phase = "setup";
    save(true);
    rerender();
    toast(season.edition === 10 ? "Tüm Zamanlar sıralamasına göre Premier League ilk 7 belirlendi." : "Yükselme, düşme ve yedek sırası politikası uygulandı.", "success");
  }

  function fifa9Completed() {
    const state = appState();
    return Boolean(state.current?.knockout?.championId);
  }

  function activateSeason(season) {
    if (!canEdit()) return;
    if (!season.leagues.premier.generated || !season.leagues.championship.generated) {
      toast("Önce Premier League ve Championship fikstürlerini oluştur.", "error");
      return;
    }
    if (season.mode === "official" && season.edition === 10 && !fifa9Completed()) {
      toast("FIFA 09 tamamlanmadan FIFA 10 resmî olarak başlatılamaz. Test modunu kullanabilirsin.", "error");
      return;
    }
    if (season.mode === "official" && season.edition > 10) {
      const previous = seasons().find(item => item.edition === season.edition - 1);
      if (previous && previous.cups?.super?.status !== "completed") {
        toast(`${seasonLabel(previous.edition)} Süper Kupası tamamlanmadan yeni resmî sezon başlatılamaz.`, "error");
        return;
      }
    }
    season.status = "active";
    season.phase = "league";
    season.startedAt = season.startedAt || now();
    system().activeEdition = season.edition;
    save(true);
    rerender();
    toast(`${seasonLabel(season.edition)} ${season.mode === "test" ? "test" : "resmî"} sezonu başlatıldı.`, "success");
  }

  function toggleTestMode(season) {
    if (!canEdit()) return;
    if (hasAnySeasonResults(season)) {
      toast("Sonuç girilmiş sezonda mod değiştirilemez. Önce sonuçları sıfırla.", "error");
      return;
    }
    season.mode = season.mode === "test" ? "official" : "test";
    save(true);
    rerender();
    toast(season.mode === "test" ? "Test modu açıldı. Bu sonuçlar resmî kabul edilmez." : "Resmî sezon modu seçildi.", "success");
  }

  function openBulkPlayers(season) {
    openModal(`${seasonLabel(season.edition)} Oyuncu Listesi`, `<form id="seasonPlayerBulkForm" class="season-modal-form">
      <input type="hidden" name="edition" value="${season.edition}">
      <div class="season-modal-note">Her satıra bir oyuncu yaz. Mevcut isimlerle eşleşen kayıtlar korunur; yeni oyuncular Championship'e eklenir.</div>
      <label>Oyuncular<textarea name="names" rows="14" required>${esc(activePlayers(season).map(item => item.name).join("\n"))}</textarea></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Listeyi Uygula</button></div>
    </form>`, "SEASON ROSTER");
  }

  function applyBulkPlayers(form) {
    if (!canEdit()) return;
    const data = new FormData(form);
    const season = seasons().find(item => item.edition === Number(data.get("edition")));
    if (!season || hasAnySeasonResults(season)) {
      toast("Sonuç girilmiş sezonda oyuncu listesi toplu değiştirilemez.", "error");
      return;
    }
    const names = [...new Set(String(data.get("names") || "").split(/\r?\n/).map(name => name.trim()).filter(Boolean))];
    const oldByName = new Map(season.players.map(item => [item.name.toLocaleLowerCase("tr-TR"), item]));
    season.players = names.map((name, index) => {
      const existing = oldByName.get(name.toLocaleLowerCase("tr-TR"));
      if (existing) return existing;
      return {
        id: `S${season.edition}-P${String(index + 1).padStart(2, "0")}-${Math.random().toString(16).slice(2, 6)}`,
        name,
        league: "championship",
        seedPriority: season.edition === 10 ? allTimeRank(name) : 9999,
        source: season.edition === 10 ? "FIFA 10 katılım listesi" : "Yeni / geri dönen oyuncu",
        participating: true
      };
    });
    season.leagues.premier = { generated: false, playerIds: [], fixtures: [] };
    season.leagues.championship = { generated: false, playerIds: [], fixtures: [] };
    season.status = "setup";
    season.phase = "setup";
    closeModal();
    save(true);
    rerender();
    toast(`${names.length} oyuncu sezon listesine kaydedildi.`, "success");
  }

  function removePlayer(season, playerId) {
    if (!canEdit()) return;
    if (hasAnySeasonResults(season)) {
      toast("Sonuç girilmiş sezondan oyuncu çıkarılamaz.", "error");
      return;
    }
    season.players = season.players.filter(item => item.id !== playerId);
    season.leagues.premier = { generated: false, playerIds: [], fixtures: [] };
    season.leagues.championship = { generated: false, playerIds: [], fixtures: [] };
    season.status = "setup";
    save(true);
    rerender();
  }

  function changePlayerLeague(season, playerId, league) {
    if (!canEdit() || hasAnySeasonResults(season)) return;
    const row = player(season, playerId);
    if (!row) return;
    row.league = league === "premier" ? "premier" : "championship";
    season.leagues.premier = { generated: false, playerIds: [], fixtures: [] };
    season.leagues.championship = { generated: false, playerIds: [], fixtures: [] };
    season.status = "setup";
    save(false);
    rerender();
  }

  function findSeasonMatch(season, matchId) {
    return allSeasonMatches(season).find(item => item.id === matchId) || null;
  }

  function openMatchEditor(season, matchId) {
    if (!canEdit()) return;
    const match = findSeasonMatch(season, matchId);
    if (!match) return;
    const knockout = match.stage !== "league";
    const sameTeam = Boolean(match.sameTeam);
    const currentWinner = match.winnerId || "";
    const datalist = matchTeamDatalist(season, match);
    const poolTeams = teamPoolTeams(season, match);
    const homeUsed = match.stage === "league" ? playerUsedTeams(season, match.homeId, { leg: match.leg, excludeMatchId: match.id }) : [];
    const awayUsed = match.stage === "league" ? playerUsedTeams(season, match.awayId, { leg: match.leg, excludeMatchId: match.id }) : [];
    openModal(`${playerName(season, match.homeId)} – ${playerName(season, match.awayId)}`, `<form id="seasonMatchForm" class="season-modal-form">
      <input type="hidden" name="edition" value="${season.edition}"><input type="hidden" name="matchId" value="${esc(match.id)}">
      <div class="season-match-meta"><span>${match.stage === "league" ? `${match.leg}. Devre · ${match.round}. Hafta` : esc(match.label || "Kupa Maçı")}</span><strong>${match.stars}★</strong></div>
      <div class="season-team-pool-note"><b>${esc(teamPoolLabel(season, match))}</b><span>${poolTeams.length ? `${poolTeams.length} takım tanımlı${season.teamPoolLocked ? " · havuz kilitli" : ""}` : "Takım havuzu henüz tanımlanmadı; manuel giriş kullanılabilir."}</span></div>
      <div class="season-score-editor"><label><span>${esc(playerName(season, match.homeId))}</span><input name="homeScore" type="number" min="0" max="99" value="${matchComplete(match) ? Number(match.homeScore) : ""}" required></label><b>–</b><label><span>${esc(playerName(season, match.awayId))}</span><input name="awayScore" type="number" min="0" max="99" value="${matchComplete(match) ? Number(match.awayScore) : ""}" required></label></div>
      ${sameTeam ? `<label>Ortak takım<input list="${datalist.id}" name="sharedTeam" value="${esc(match.sharedTeam || "")}" placeholder="İki oyuncunun kullanacağı aynı takım"></label>` : `<div class="season-modal-grid"><label>Ev sahibi takımı<input list="${datalist.id}" name="homeTeam" value="${esc(match.homeTeam || "")}" placeholder="Takım seç veya yaz"><small>Bu devrede kullanılanlar: ${esc(homeUsed.join(", ") || "Yok")}</small></label><label>Deplasman takımı<input list="${datalist.id}" name="awayTeam" value="${esc(match.awayTeam || "")}" placeholder="Takım seç veya yaz"><small>Bu devrede kullanılanlar: ${esc(awayUsed.join(", ") || "Yok")}</small></label></div>`}
      ${datalist.html}
      ${knockout ? `<label>Beraberlik / penaltı halinde kazanan<select name="winnerId"><option value="">Skora göre belirle</option><option value="${match.homeId}" ${currentWinner === match.homeId ? "selected" : ""}>${esc(playerName(season, match.homeId))}</option><option value="${match.awayId}" ${currentWinner === match.awayId ? "selected" : ""}>${esc(playerName(season, match.awayId))}</option></select></label>` : ""}
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button>${matchComplete(match) ? `<button type="button" class="btn btn-danger" data-season-action="clear-match" data-edition="${season.edition}" data-match-id="${esc(match.id)}">Sonucu Sil</button>` : ""}<button class="btn btn-gold" type="submit">Sonucu Kaydet</button></div>
    </form>`, match.stage === "league" ? "LEAGUE MATCH" : "CUP MATCH");
  }

  function saveMatchResult(form) {
    if (!canEdit()) return;
    const data = new FormData(form);
    const season = seasons().find(item => item.edition === Number(data.get("edition")));
    const match = season ? findSeasonMatch(season, String(data.get("matchId"))) : null;
    if (!season || !match) return;
    const homeScore = Number(data.get("homeScore"));
    const awayScore = Number(data.get("awayScore"));
    if (!Number.isInteger(homeScore) || !Number.isInteger(awayScore) || homeScore < 0 || awayScore < 0) {
      toast("Geçerli bir skor gir.", "error");
      return;
    }
    const selectedWinner = String(data.get("winnerId") || "");
    if (match.stage !== "league" && homeScore === awayScore && ![match.homeId, match.awayId].includes(selectedWinner)) {
      toast("Eleme maçındaki beraberlik için penaltılar sonrası kazananı seç.", "error");
      return;
    }
    const homeTeam = String(data.get("homeTeam") || "").trim();
    const awayTeam = String(data.get("awayTeam") || "").trim();
    const sharedTeam = String(data.get("sharedTeam") || "").trim();
    const teamError = match.sameTeam
      ? validateTeamForMatch(season, match, match.homeId, sharedTeam)
      : validateTeamForMatch(season, match, match.homeId, homeTeam) || validateTeamForMatch(season, match, match.awayId, awayTeam);
    if (teamError) { toast(teamError, "error"); return; }
    match.homeScore = homeScore;
    match.awayScore = awayScore;
    match.winnerId = [match.homeId, match.awayId].includes(selectedWinner) ? selectedWinner : null;
    match.homeTeam = homeTeam;
    match.awayTeam = awayTeam;
    match.sharedTeam = sharedTeam;
    match.playedAt = match.playedAt || now();
    match.updatedAt = now();
    if (season.status === "scheduled") season.status = "active";
    refreshSeasonProgress(season);
    closeModal();
    save(true);
    rerender();
    toast("Maç sonucu kaydedildi.", "success");
  }

  function clearMatch(season, matchId) {
    if (!canEdit()) return;
    const match = findSeasonMatch(season, matchId);
    if (!match) return;
    match.homeScore = null;
    match.awayScore = null;
    match.winnerId = null;
    match.playedAt = null;
    match.updatedAt = now();
    closeModal();
    refreshSeasonProgress(season);
    save(true);
    rerender();
    toast("Maç sonucu silindi.", "success");
  }

  function createSeries(season, id, label, homeId, awayId, stage) {
    return {
      id,
      label,
      homeId,
      awayId,
      bestOf: 3,
      stage,
      matches: Array.from({ length: 3 }, (_, index) => ({
        id: `S${season.edition}-ORUC-${id.toUpperCase()}-G${index + 1}`,
        competition: "oruc",
        stage,
        label: `${label} · Maç ${index + 1}`,
        game: index + 1,
        stars: Number(season.settings.cupStars || 4.5),
        homeId: index % 2 === 0 ? homeId : awayId,
        awayId: index % 2 === 0 ? awayId : homeId,
        homeScore: null,
        awayScore: null,
        homeTeam: "",
        awayTeam: "",
        winnerId: null,
        updatedAt: null
      }))
    };
  }

  function seriesScore(series) {
    const score = { home: 0, away: 0 };
    if (!series) return score;
    for (const match of series.matches || []) {
      const winner = matchWinnerId(match);
      if (!winner) continue;
      if (winner === series.homeId) score.home += 1;
      if (winner === series.awayId) score.away += 1;
    }
    return score;
  }

  function seriesWinner(series) {
    const score = seriesScore(series);
    if (score.home >= 2) return series.homeId;
    if (score.away >= 2) return series.awayId;
    return null;
  }

  function seriesComplete(series) {
    return Boolean(seriesWinner(series));
  }

  function generateOrucPlayoffs(season) {
    if (!canEdit()) return;
    if (!bothLeaguesComplete(season)) {
      toast("Oruç Reis Kupası eşleşmeleri için iki ligin de tamamlanması gerekir.", "error");
      return;
    }
    const premier = standings(season, "premier");
    const championship = standings(season, "championship");
    if (premier.length < 5 || championship.length < 1) return;
    const cup = season.cups.oruc = emptyOrucCup();
    cup.status = "playoffs";
    cup.generatedAt = now();
    cup.seeds = {
      premier1: premier[0].id,
      premier2: premier[1].id,
      premier3: premier[2].id,
      premier4: premier[3].id,
      premier5: premier[4].id,
      championship1: championship[0].id
    };
    cup.series.po1 = createSeries(season, "po1", "Play-off 1", cup.seeds.premier3, cup.seeds.championship1, "playoff");
    cup.series.po2 = createSeries(season, "po2", "Play-off 2", cup.seeds.premier4, cup.seeds.premier5, "playoff");
    season.phase = "oruc-playoffs";
    syncLeagueHonours(season);
    save(true);
    selectedTab = "oruc";
    rerender();
    toast("Oruç Reis Kupası play-off eşleşmeleri oluşturuldu.", "success");
  }

  function shuffle(values) {
    const arr = [...values];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function drawOrucSemifinals(season) {
    if (!canEdit()) return;
    const cup = season.cups.oruc;
    const po1 = seriesWinner(cup.series.po1);
    const po2 = seriesWinner(cup.series.po2);
    if (!po1 || !po2) {
      toast("Önce iki play-off serisini tamamla.", "error");
      return;
    }
    const draw = shuffle([cup.seeds.premier1, cup.seeds.premier2, po1, po2]);
    cup.semifinalDraw = draw;
    cup.series.sf1 = createSeries(season, "sf1", "Yarı Final 1", draw[0], draw[1], "semifinal");
    cup.series.sf2 = createSeries(season, "sf2", "Yarı Final 2", draw[2], draw[3], "semifinal");
    cup.status = "semifinals";
    season.phase = "oruc-semifinals";
    save(true);
    rerender();
    toast("Yarı final kurası çekildi.", "success");
  }

  function createOrucFinal(season) {
    if (!canEdit()) return;
    const cup = season.cups.oruc;
    const sf1 = seriesWinner(cup.series.sf1);
    const sf2 = seriesWinner(cup.series.sf2);
    if (!sf1 || !sf2) {
      toast("Önce iki yarı final serisini tamamla.", "error");
      return;
    }
    cup.final = {
      id: `S${season.edition}-ORUC-FINAL`,
      competition: "oruc",
      stage: "final",
      label: "Oruç Reis Kupası Finali",
      stars: Number(season.settings.cupStars || 4.5),
      homeId: sf1,
      awayId: sf2,
      homeScore: null,
      awayScore: null,
      sameTeam: true,
      sharedTeam: "",
      winnerId: null,
      updatedAt: null
    };
    cup.status = "final";
    season.phase = "oruc-final";
    save(true);
    rerender();
    toast("Oruç Reis Kupası finali oluşturuldu.", "success");
  }

  function finalizeOrucCup(season) {
    const cup = season.cups.oruc;
    if (!cup.final || !matchWinnerId(cup.final)) return;
    cup.championId = matchWinnerId(cup.final);
    cup.runnerUpId = cup.final.homeId === cup.championId ? cup.final.awayId : cup.final.homeId;
    cup.status = "completed";
    season.phase = "super-cup-ready";
    syncAllHonours(season);
  }

  function generateSuperCup(season) {
    if (!canEdit()) return;
    finalizeOrucCup(season);
    const premier = standings(season, "premier");
    const cup = season.cups.oruc;
    if (!premier.length || cup.status !== "completed") {
      toast("Süper Kupa için Premier League ve Oruç Reis Kupası şampiyonları belirlenmelidir.", "error");
      return;
    }
    const leagueChampion = premier[0].id;
    const opponent = cup.championId === leagueChampion ? cup.runnerUpId : cup.championId;
    season.cups.super = {
      status: "ready",
      generatedAt: now(),
      championId: null,
      runnerUpId: null,
      match: {
        id: `S${season.edition}-SUPER-FINAL`,
        competition: "super",
        stage: "super-final",
        label: `${seasonLabel(season.edition)} Süper Kupası`,
        stars: 4.5,
        homeId: leagueChampion,
        awayId: opponent,
        homeScore: null,
        awayScore: null,
        sameTeam: true,
        sharedTeam: "",
        winnerId: null,
        updatedAt: null
      }
    };
    season.phase = "super-cup";
    save(true);
    selectedTab = "super";
    rerender();
    toast("Süper Kupa eşleşmesi oluşturuldu.", "success");
  }

  function finalizeSuperCup(season) {
    const superCup = season.cups.super;
    if (!superCup.match || !matchWinnerId(superCup.match)) return;
    superCup.championId = matchWinnerId(superCup.match);
    superCup.runnerUpId = superCup.match.homeId === superCup.championId ? superCup.match.awayId : superCup.match.homeId;
    superCup.status = "completed";
    season.phase = "completed";
    season.status = "completed";
    season.completedAt = now();
    syncAllHonours(season);
  }

  function refreshSeasonProgress(season) {
    const cup = season.cups.oruc;
    if (cup.status === "playoffs" && seriesComplete(cup.series.po1) && seriesComplete(cup.series.po2)) season.phase = "oruc-semifinal-draw";
    if (cup.status === "semifinals" && seriesComplete(cup.series.sf1) && seriesComplete(cup.series.sf2)) season.phase = "oruc-final-ready";
    if (cup.status === "final" && cup.final && matchWinnerId(cup.final)) finalizeOrucCup(season);
    if (season.cups.super.status === "ready" && season.cups.super.match && matchWinnerId(season.cups.super.match)) finalizeSuperCup(season);
    if (bothLeaguesComplete(season) && cup.status === "locked") {
      season.phase = "oruc-ready";
      syncLeagueHonours(season);
    }
  }

  function upsertHonour(season, competition, winner, runnerUp, third = "") {
    if (season.mode === "test") return;
    const ss = system();
    const id = `season-${season.edition}-${competition}`;
    const record = { id, edition: season.edition, competition, winner: winner || "", runnerUp: runnerUp || "", third: third || "" };
    const index = ss.customHonours.findIndex(item => item.id === id || (Number(item.edition) === season.edition && item.competition === competition));
    if (index >= 0) ss.customHonours[index] = record;
    else ss.customHonours.push(record);
  }

  function syncLeagueHonours(season) {
    if (!bothLeaguesComplete(season)) return;
    const p = standings(season, "premier");
    const c = standings(season, "championship");
    upsertHonour(season, "premier", p[0]?.name, p[1]?.name, p[2]?.name);
    upsertHonour(season, "championship", c[0]?.name, c[1]?.name, c[2]?.name);
  }

  function syncAllHonours(season) {
    syncLeagueHonours(season);
    const cup = season.cups.oruc;
    if (cup.status === "completed") upsertHonour(season, "oruc", playerName(season, cup.championId), playerName(season, cup.runnerUpId), "");
    const superCup = season.cups.super;
    if (superCup.status === "completed") upsertHonour(season, "super", playerName(season, superCup.championId), playerName(season, superCup.runnerUpId), "");
  }

  function removeSeasonHonours(edition) {
    const competitions = new Set(["premier", "championship", "oruc", "super"]);
    system().customHonours = system().customHonours.filter(item => !(Number(item.edition) === Number(edition) && competitions.has(item.competition)));
  }

  function resetSeasonResults(season) {
    if (!canEdit()) return;
    allSeasonMatches(season).forEach(match => {
      match.homeScore = null; match.awayScore = null; match.winnerId = null; match.updatedAt = null;
    });
    season.cups.oruc = emptyOrucCup();
    season.cups.super = emptySuperCup();
    season.status = season.leagues.premier.generated && season.leagues.championship.generated ? "scheduled" : "setup";
    season.phase = season.status === "scheduled" ? "league" : "setup";
    season.startedAt = null;
    season.completedAt = null;
    removeSeasonHonours(season.edition);
    closeModal();
    save(true);
    rerender();
    toast("Sezon sonuçları sıfırlandı; oyuncular ve fikstür yapısı korundu.", "success");
  }

  function cancelSeason(season) {
    if (!canEdit()) return;
    season.status = "cancelled";
    season.cancelledAt = now();
    season.phase = "cancelled";
    removeSeasonHonours(season.edition);
    closeModal();
    save(true);
    rerender();
    toast(`${seasonLabel(season.edition)} iptal edildi. Diğer sezon verileri korunuyor.`, "success");
  }

  function restoreSeason(season) {
    if (!canEdit()) return;
    season.status = season.leagues.premier.generated ? "scheduled" : "setup";
    season.phase = season.leagues.premier.generated ? "league" : "setup";
    season.cancelledAt = null;
    save(true);
    rerender();
  }

  function deleteSeason(season) {
    if (!canEdit()) return;
    if (hasAnySeasonResults(season)) {
      toast("Sonuç bulunan sezon silinemez; önce sonuçları sıfırla.", "error");
      return;
    }
    if (season.edition === 10) {
      toast("FIFA 10 ana sezon altyapısı silinemez; iptal edilebilir veya sıfırlanabilir.", "error");
      return;
    }
    const ss = system();
    ss.seasons = ss.seasons.filter(item => item.id !== season.id);
    removeSeasonHonours(season.edition);
    selectedEdition = ss.seasons.at(-1)?.edition || 10;
    closeModal();
    save(true);
    rerender();
  }

  function nextSeasonSeeds(previous) {
    if (!bothLeaguesComplete(previous)) return [];
    const p = standings(previous, "premier");
    const c = standings(previous, "championship");
    const result = [];
    const seen = new Set();
    function add(row, league, priority, source) {
      if (!row || seen.has(row.name.toLocaleLowerCase("tr-TR"))) return;
      seen.add(row.name.toLocaleLowerCase("tr-TR"));
      result.push({ name: row.name, league, seedPriority: priority, source, participating: true });
    }
    p.slice(0, 5).forEach((row, index) => add(row, "premier", index + 1, `${seasonLabel(previous.edition)} Premier ${row.rank}.`));
    c.slice(0, 2).forEach((row, index) => add(row, "premier", 6 + index, `${seasonLabel(previous.edition)} Championship yükselen`));
    c.slice(2).forEach((row, index) => add(row, "championship", 8 + index, `${seasonLabel(previous.edition)} Championship yedek sırası ${row.rank}.`));
    p.slice(5).forEach((row, index) => add(row, "championship", 500 + index, `${seasonLabel(previous.edition)} Premier küme düşen`));
    return result;
  }

  function openCreateNextSeason() {
    if (!canEdit()) return;
    const ss = system();
    const maxEdition = Math.max(9, ...ss.seasons.map(item => Number(item.edition) || 0));
    const nextEdition = maxEdition + 1;
    const previous = ss.seasons.find(item => item.edition === nextEdition - 1);
    const canSeed = previous && bothLeaguesComplete(previous);
    openModal(`${seasonLabel(nextEdition)} Sezonunu Oluştur`, `<form id="createNextSeasonForm" class="season-modal-form">
      <input type="hidden" name="edition" value="${nextEdition}">
      <div class="season-modal-note">${canSeed ? `${seasonLabel(previous.edition)} sonuçlarından ilk 5 Premier oyuncusu, Championship ilk 2'si ve yedek sırası otomatik aktarılacak.` : "Önceki sezon tamamlanmadığı için boş sezon oluşturulacak; oyuncuları manuel ekleyebilirsin."}</div>
      <label>Yeni veya geri dönen oyuncular<textarea name="newPlayers" rows="7" placeholder="Her satıra bir oyuncu. Yeni ve geri dönen oyuncular Championship'ten başlar."></textarea></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">${seasonLabel(nextEdition)} Oluştur</button></div>
    </form>`, "NEW SEASON");
  }

  function createNextSeason(form) {
    if (!canEdit()) return;
    const data = new FormData(form);
    const edition = Number(data.get("edition"));
    if (seasons().some(item => item.edition === edition)) {
      toast("Bu sezon zaten mevcut.", "error");
      return;
    }
    const previous = seasons().find(item => item.edition === edition - 1);
    const seeds = previous ? nextSeasonSeeds(previous) : [];
    const names = [...new Set(String(data.get("newPlayers") || "").split(/\r?\n/).map(name => name.trim()).filter(Boolean))];
    const existingNames = new Set(seeds.map(item => item.name.toLocaleLowerCase("tr-TR")));
    names.forEach(name => {
      if (!existingNames.has(name.toLocaleLowerCase("tr-TR"))) seeds.push({ name, league: "championship", seedPriority: 9999, source: "Yeni / geri dönen oyuncu", participating: true });
    });
    const season = createSeason(edition, seeds, previous?.edition || null);
    system().seasons.push(season);
    system().activeEdition = edition;
    selectedEdition = edition;
    selectedTab = "admin";
    closeModal();
    save(true);
    rerender();
    toast(`${seasonLabel(edition)} sezon altyapısı oluşturuldu.`, "success");
  }

  function exportSeason(season) {
    const blob = new Blob([JSON.stringify(season, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${seasonLabel(season.edition)}_season_export.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openTeamPoolEditor(season, poolKey) {
    const pool = season.teamPools?.[poolKey];
    if (!pool) return;
    openModal(`${pool.label} Takım Havuzu`, `<form id="seasonTeamPoolForm" class="season-modal-form">
      <input type="hidden" name="edition" value="${season.edition}"><input type="hidden" name="poolKey" value="${esc(poolKey)}">
      <div class="season-modal-note">Her satıra bir takım yaz. Havuz kilitliyken maç sonucunda yalnızca listedeki takımlar kabul edilir.</div>
      <label>Takımlar<textarea name="teams" rows="14" placeholder="Her satıra bir takım">${esc((pool.teams || []).join("\n"))}</textarea></label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Havuzu Kaydet</button></div>
    </form>`, "TEAM POOL MANAGER");
  }

  function saveTeamPool(form) {
    if (!canEdit()) return;
    const data = new FormData(form);
    const season = seasons().find(item => item.edition === Number(data.get("edition")));
    const key = String(data.get("poolKey") || "");
    if (!season?.teamPools?.[key]) return;
    if (hasAnySeasonResults(season)) { toast("Sonuç girildikten sonra takım havuzu değiştirilemez.", "error"); return; }
    const teams = [...new Set(String(data.get("teams") || "").split(/\r?\n/).map(item => item.trim()).filter(Boolean))];
    season.teamPools[key].teams = teams;
    closeModal();
    save(true);
    rerender();
    toast(`${season.teamPools[key].label} güncellendi.`, "success");
  }

  function toggleTeamPoolLock(season) {
    if (hasAnySeasonResults(season)) { toast("Sonuç girildikten sonra takım havuzu kilidi değiştirilemez.", "error"); return; }
    season.teamPoolLocked = !season.teamPoolLocked;
    save(true);
    rerender();
    toast(season.teamPoolLocked ? "Takım havuzları kilitlendi." : "Takım havuzlarının kilidi açıldı.", "success");
  }

  function toggleTeamRule(season, key) {
    if (hasAnySeasonResults(season)) { toast("Sonuç girildikten sonra takım kullanım kuralları değiştirilemez.", "error"); return; }
    if (key === "enforce") season.enforceTeamPool = !season.enforceTeamPool;
    if (key === "reuse") season.preventTeamReuse = !season.preventTeamReuse;
    save(true);
    rerender();
  }

  function teamUsageSummary(season) {
    const rows = new Map();
    allSeasonMatches(season).filter(matchComplete).forEach(match => {
      [[match.homeId, teamNameForPlayer(match, match.homeId)], [match.awayId, teamNameForPlayer(match, match.awayId)]].forEach(([playerId, team]) => {
        if (!team) return;
        const key = normalizeText(team);
        if (!rows.has(key)) rows.set(key, { team, uses: 0, wins: 0, draws: 0, losses: 0 });
        const row = rows.get(key);
        row.uses += 1;
        const winner = matchWinnerId(match);
        if (!winner) row.draws += 1;
        else if (winner === playerId) row.wins += 1;
        else row.losses += 1;
      });
    });
    return [...rows.values()].sort((a, b) => b.uses - a.uses || b.wins - a.wins || a.team.localeCompare(b.team, "tr"));
  }

  function playerUsageByLevel(season, playerId) {
    const data = { "4": new Set(), "4.5": new Set(), "5": new Set(), cup: new Set(), total: new Set() };
    allSeasonMatches(season).filter(match => matchComplete(match) && (match.homeId === playerId || match.awayId === playerId)).forEach(match => {
      const team = teamNameForPlayer(match, playerId);
      if (!team) return;
      const key = teamPoolKeyForMatch(match);
      data[key]?.add(team);
      data.total.add(team);
    });
    return data;
  }

  function renderTeamCenter(season) {
    const usage = teamUsageSummary(season);
    const poolKeys = ["4", "4.5", "5", "cup"];
    return `<div class="season-team-center">
      <section class="season-team-hero"><div><div class="eyebrow">TEAM POOL & USAGE CENTRE</div><h2>Takım Havuzu ve Kullanım Merkezi</h2><p>Takım yıldız listelerini sezon başında tanımla, dondur ve oyuncuların takım kullanım geçmişini otomatik takip et.</p></div><div class="season-team-lock ${season.teamPoolLocked ? "locked" : ""}"><strong>${season.teamPoolLocked ? "HAVUZLAR KİLİTLİ" : "HAVUZLAR AÇIK"}</strong><span>${season.preventTeamReuse ? "Devre içi tekrar yasak" : "Takım tekrarı serbest"}</span>${canEdit() ? `<button class="btn ${season.teamPoolLocked ? "btn-ghost" : "btn-gold"} btn-small" data-season-action="toggle-team-pool-lock">${season.teamPoolLocked ? "Kilidi Aç" : "Havuzları Kilitle"}</button>` : ""}</div></section>
      <section class="season-team-pool-grid">${poolKeys.map(key => { const pool = season.teamPools[key]; const effective = teamPoolTeams(season, key); return `<article class="season-team-pool-card ${key === "cup" ? "cup" : ""}"><div class="season-team-pool-stars">${key === "cup" ? "🏆" : `${pool.stars}★`}</div><h3>${esc(pool.label)}</h3><strong>${effective.length} takım</strong><div class="season-team-chip-list">${effective.length ? effective.slice(0, 8).map(team => `<span>${esc(team)}</span>`).join("") : `<em>Takım listesi bekleniyor</em>`}${effective.length > 8 ? `<small>+${effective.length - 8} takım</small>` : ""}</div>${canEdit() ? `<button class="btn btn-ghost btn-small" data-season-action="edit-team-pool" data-pool-key="${key}" ${hasAnySeasonResults(season) ? "disabled" : ""}>Havuzu Düzenle</button>` : ""}</article>`; }).join("")}</section>
      <section class="panel season-team-rules"><div><h3>Takım Kullanım Kuralları</h3><p>Kilitli havuz doğrulaması ve aynı devrede aynı takımı tekrar kullanmama kontrolü maç sonucu kaydedilirken uygulanır.</p></div><div class="season-team-rule-buttons">${canEdit() ? `<button class="season-rule-toggle ${season.enforceTeamPool ? "active" : ""}" data-season-action="toggle-team-rule" data-rule="enforce"><b>${season.enforceTeamPool ? "AÇIK" : "KAPALI"}</b><span>Havuz dışı takımı engelle</span></button><button class="season-rule-toggle ${season.preventTeamReuse ? "active" : ""}" data-season-action="toggle-team-rule" data-rule="reuse"><b>${season.preventTeamReuse ? "AÇIK" : "KAPALI"}</b><span>Devre içi takım tekrarını engelle</span></button>` : ""}</div></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Oyuncu Takım Kullanım Matrisi</h3><div class="panel-subtitle">Her yıldız seviyesinde kullanılan benzersiz takım sayısı.</div></div></div><div class="season-team-usage-table"><div class="head"><span>Oyuncu</span><span>4★</span><span>4.5★</span><span>5★</span><span>Kupa</span><span>Toplam</span></div>${activePlayers(season).map(item => { const row = playerUsageByLevel(season, item.id); return `<div><button data-season-action="open-career" data-player-name="${esc(item.name)}">${esc(item.name)}</button><span>${row["4"].size}</span><span>${row["4.5"].size}</span><span>${row["5"].size}</span><span>${row.cup.size}</span><strong>${row.total.size}</strong></div>`; }).join("") || `<div class="season-empty">Oyuncu bulunmuyor.</div>`}</div></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">En Çok Kullanılan Takımlar</h3><div class="panel-subtitle">Tamamlanan FIFA Lig Sistemi maçlarından hesaplanır.</div></div></div><div class="season-top-team-grid">${usage.slice(0, 12).map((row, index) => `<article><b>${index + 1}</b><div><strong>${esc(row.team)}</strong><span>${row.uses} kullanım · ${row.wins}G ${row.draws}B ${row.losses}M</span></div></article>`).join("") || `<div class="season-empty"><strong>Henüz takım kullanımı yok</strong><p>Maç sonuçlarında takımlar girildiğinde bu alan otomatik dolacak.</p></div>`}</div></section>
    </div>`;
  }

  function allCareerNames() {
    const values = new Set();
    (ctx()?.getHistorical?.()?.allTime || []).forEach(item => values.add(item.name));
    (ctx()?.getHistorical?.()?.editions || []).forEach(edition => (edition.participants || []).forEach(name => values.add(name)));
    seasons().forEach(season => season.players.forEach(item => item.name && values.add(item.name)));
    (appState().current?.participants || []).forEach(item => item.name && values.add(item.name));
    (system().customHonours || []).forEach(item => [item.winner, item.runnerUp, item.third].forEach(name => name && values.add(name)));
    return [...values].filter(Boolean).sort((a, b) => a.localeCompare(b, "tr"));
  }

  function buildCareerPassport(name) {
    const key = normalizeText(name);
    const stats = { games: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
    const teams = new Map();
    const rivals = new Map();
    const honours = [];
    const timeline = [];
    const seenHonours = new Set();
    const addHonour = (edition, competition, medal) => {
      const id = `${edition}-${competition}-${medal}`;
      if (seenHonours.has(id)) return;
      seenHonours.add(id);
      honours.push({ edition: Number(edition), competition, medal });
    };
    const recordMatch = (p1, p2, s1, s2, t1, t2) => {
      const isHome = normalizeText(p1) === key;
      const isAway = normalizeText(p2) === key;
      if (!isHome && !isAway) return;
      const gf = Number(isHome ? s1 : s2) || 0;
      const ga = Number(isHome ? s2 : s1) || 0;
      stats.games += 1; stats.gf += gf; stats.ga += ga;
      if (gf > ga) stats.wins += 1; else if (gf < ga) stats.losses += 1; else stats.draws += 1;
      const team = String(isHome ? t1 : t2 || "").trim();
      const rival = String(isHome ? p2 : p1 || "").trim();
      if (team) teams.set(team, (teams.get(team) || 0) + 1);
      if (rival) rivals.set(rival, (rivals.get(rival) || 0) + 1);
    };
    const historical = ctx()?.getHistorical?.() || {};
    (historical.editions || []).forEach(edition => {
      const participating = (edition.participants || []).some(item => normalizeText(item) === key);
      if (!participating) return;
      (edition.matches || []).forEach(match => recordMatch(match.p1, match.p2, match.s1, match.s2, match.t1, match.t2));
      let result = "Katıldı";
      if (normalizeText(edition.champion) === key) { result = "Şampiyon"; addHonour(edition.edition, "oruc", "winner"); }
      else if (normalizeText(edition.runnerUp) === key) { result = "İkinci"; addHonour(edition.edition, "oruc", "runner-up"); }
      else if (normalizeText(edition.third) === key) { result = "Üçüncü"; addHonour(edition.edition, "oruc", "third"); }
      timeline.push({ edition: edition.edition, league: "Oruç Reis Turnuvası", rank: "—", result });
    });
    seasons().forEach(season => {
      const row = season.players.find(item => normalizeText(item.name) === key);
      if (!row) return;
      allSeasonMatches(season).filter(matchComplete).forEach(match => {
        if (match.homeId !== row.id && match.awayId !== row.id) return;
        const isHome = match.homeId === row.id;
        recordMatch(row.name, playerName(season, isHome ? match.awayId : match.homeId), isHome ? match.homeScore : match.awayScore, isHome ? match.awayScore : match.homeScore, teamNameForPlayer(match, row.id), teamNameForPlayer(match, isHome ? match.awayId : match.homeId));
      });
      const table = standings(season, row.league);
      const position = table.find(item => item.id === row.id)?.rank || "—";
      let result = season.status === "completed" ? "Sezon tamamlandı" : statusText(season);
      if (season.status === "completed" && row.league === "premier" && position === 1) result = "Lig Şampiyonu";
      else if (season.status === "completed" && row.league === "premier" && Number(position) >= table.length - 1) result = "Küme düştü";
      else if (season.status === "completed" && row.league === "championship" && Number(position) <= 2) result = "Premier'e yükseldi";
      timeline.push({ edition: season.edition, league: row.league === "premier" ? "Premier League" : "Championship", rank: position, result });
    });
    const current = appState().current || {};
    const currentKo = current.knockout || {};
    if (currentKo.championId && currentKo.final && Number.isFinite(Number(currentKo.final.homeScore)) && Number.isFinite(Number(currentKo.final.awayScore))) {
      const currentName = id => (current.participants || []).find(item => item.id === id)?.name || "";
      const winnerName = currentName(currentKo.championId);
      const runnerId = currentKo.final.homeId === currentKo.championId ? currentKo.final.awayId : currentKo.final.homeId;
      const runnerName = currentName(runnerId);
      if (normalizeText(winnerName) === key) addHonour(9, "oruc", "winner");
      if (normalizeText(runnerName) === key) addHonour(9, "oruc", "runner-up");
    }
    (system().customHonours || []).forEach(item => {
      if (normalizeText(item.winner) === key) addHonour(item.edition, item.competition, "winner");
      if (normalizeText(item.runnerUp) === key) addHonour(item.edition, item.competition, "runner-up");
      if (normalizeText(item.third) === key) addHonour(item.edition, item.competition, "third");
    });
    const wins = honours.filter(item => item.medal === "winner").length;
    const runnerUps = honours.filter(item => item.medal === "runner-up").length;
    const thirds = honours.filter(item => item.medal === "third").length;
    const favouriteTeams = [...teams.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
    const rival = [...rivals.entries()].sort((a, b) => b[1] - a[1])[0] || null;
    const allTime = (historical.allTime || []).find(item => normalizeText(item.name) === key);
    return { name, stats, honours: honours.sort((a, b) => a.edition - b.edition), timeline: timeline.sort((a, b) => a.edition - b.edition), wins, runnerUps, thirds, favouriteTeams, rival, allTime, winRate: stats.games ? Math.round(stats.wins / stats.games * 1000) / 10 : 0 };
  }

  function competitionName(id) {
    return ({ premier: "Premier League", championship: "Championship", oruc: "Oruç Reis Kupası", super: "Süper Kupa" })[id] || id;
  }

  function renderCareerPassport(season) {
    const names = allCareerNames();
    if (!selectedCareerPlayerName || !names.includes(selectedCareerPlayerName)) selectedCareerPlayerName = activePlayers(season)[0]?.name || names[0] || "";
    const data = buildCareerPassport(selectedCareerPlayerName);
    const individualAwards = window.FIFA_SEASON_EXPERIENCE?.playerAwards?.(data.name) || [];
    const initials = data.name.split(/\s+/).map(item => item[0]).slice(0, 2).join("");
    return `<div class="season-career-passport">
      <section class="season-career-hero"><div class="season-career-avatar">${esc(initials)}</div><div class="season-career-identity"><div class="eyebrow">PLAYER CAREER PASSPORT</div><h2>${esc(data.name || "Oyuncu seç")}</h2><p>${data.allTime ? `Tüm Zamanlar #${data.allTime.rank} · ${data.allTime.points} puan` : "FIFA Lig Sistemi kariyer profili"}</p><select data-season-career-player>${names.map(name => `<option value="${esc(name)}" ${name === data.name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select></div><div class="season-career-legacy"><span>LEGACY</span><strong>${data.wins * 100 + data.runnerUps * 35 + data.thirds * 15}</strong><small>${data.wins} kupa · ${data.runnerUps} final</small></div></section>
      <section class="season-career-stat-grid"><article><span>MAÇ</span><strong>${data.stats.games}</strong></article><article><span>GALİBİYET</span><strong>${data.stats.wins}</strong></article><article><span>GALİBİYET %</span><strong>%${data.winRate}</strong></article><article><span>GOL</span><strong>${data.stats.gf}</strong></article><article><span>AVERJ</span><strong class="${data.stats.gf - data.stats.ga >= 0 ? "positive" : "negative"}">${data.stats.gf - data.stats.ga > 0 ? "+" : ""}${data.stats.gf - data.stats.ga}</strong></article><article><span>ANA RAKİP</span><strong>${esc(data.rival?.[0] || "—")}</strong></article></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Kupa ve Madalya Koleksiyonu</h3><div class="panel-subtitle">FIFA01'den güncel sezona kadar resmî başarılar.</div></div><div class="season-medal-summary"><span>🏆 ${data.wins}</span><span>🥈 ${data.runnerUps}</span><span>🥉 ${data.thirds}</span></div></div><div class="season-career-honours">${data.honours.map(item => `<article class="${item.medal}"><div>${item.medal === "winner" ? "🏆" : item.medal === "runner-up" ? "🥈" : "🥉"}</div><strong>${esc(competitionName(item.competition))}</strong><span>${seasonLabel(item.edition)}</span><small>${item.medal === "winner" ? "Şampiyon" : item.medal === "runner-up" ? "İkinci" : "Üçüncü"}</small></article>`).join("") || `<div class="season-empty"><strong>Henüz madalya kaydı yok</strong><p>Resmî sezon başarıları burada görünecek.</p></div>`}</div></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Bireysel Ödül Kabini</h3><div class="panel-subtitle">Devrenin Oyuncusu, Gol Kralı ve Defans Ödülü kayıtları.</div></div><span class="badge">${individualAwards.length} ÖDÜL</span></div>${individualAwards.length ? `<div class="award-history-grid">${individualAwards.map(item => `<article><span>${seasonLabel(item.edition)} · ${esc(competitionName(item.leagueId))} · ${item.leg}. Devre · ${item.stars}★</span><strong>${esc(item.label)}</strong><small>${item.type === "goals" ? `${item.stats.gf} gol` : item.type === "defense" ? `${item.stats.ga} gol yedi · ${item.stats.cleanSheets} clean sheet` : `${item.stats.pts} puan · ${item.stats.w} galibiyet`}</small></article>`).join("")}</div>` : `<div class="season-empty"><strong>Henüz bireysel ödül yok</strong><p>Devre sonu ödülleri kesinleştirildiğinde burada görünecek.</p></div>`}</section>
      <section class="season-career-columns"><article class="panel"><div class="panel-header"><div><h3 class="panel-title">Sezon Yolculuğu</h3><div class="panel-subtitle">Lig, sıralama ve sezon sonucu.</div></div></div><div class="season-career-timeline">${data.timeline.map(item => `<div><b>${seasonLabel(item.edition)}</b><span>${esc(item.league)}</span><strong>${item.rank === "—" ? "—" : `${item.rank}.`}</strong><em>${esc(item.result)}</em></div>`).join("") || `<div class="season-empty">Sezon kaydı bulunmuyor.</div>`}</div></article><article class="panel"><div class="panel-header"><div><h3 class="panel-title">Takım Kimliği</h3><div class="panel-subtitle">Kariyerde en sık kullanılan takımlar.</div></div></div><div class="season-career-teams">${data.favouriteTeams.slice(0, 10).map(([team, uses], index) => `<div><b>${index + 1}</b><span>${esc(team)}</span><strong>${uses} maç</strong></div>`).join("") || `<div class="season-empty">Takım kullanım verisi yok.</div>`}</div></article></section>
    </div>`;
  }

  function openSeasonWizard(season) {
    if (hasAnySeasonResults(season)) { toast("Sonuç girilmiş sezonda başlangıç sihirbazı kullanılamaz.", "error"); return; }
    wizardStep = 1;
    const rows = season.players.filter(item => item.name.trim());
    openModal(`${seasonLabel(season.edition)} Sezon Başlatma Sihirbazı`, `<form id="seasonStartWizardForm" class="season-wizard-form">
      <input type="hidden" name="edition" value="${season.edition}">
      <div class="season-wizard-progress">${[1,2,3,4].map((step, index) => `<div class="${step === 1 ? "active" : ""}" data-wizard-indicator="${step}"><b>${step}</b><span>${["Katılım", "Lig Dağılımı", "Takım Havuzları", "Başlatma"][index]}</span></div>`).join("")}</div>
      <section class="season-wizard-step active" data-wizard-step="1"><h3>Katılım Teyidi</h3><p>Sezona katılacak oyuncuları seç. Katılmayan oyuncuların kaydı silinmez.</p><div class="season-wizard-roster">${rows.map(item => `<label><input type="checkbox" name="participating_${item.id}" ${item.participating !== false ? "checked" : ""}><span><strong>${esc(item.name)}</strong><small>${esc(item.source)}</small></span></label>`).join("")}</div></section>
      <section class="season-wizard-step" data-wizard-step="2"><div class="season-wizard-title"><div><h3>Premier League ve Championship</h3><p>Premier League tam 7 oyuncu olmalıdır.</p></div><button type="button" class="btn btn-ghost btn-small" data-season-action="wizard-auto-assign">İlk 7'yi Otomatik Seç</button></div><div class="season-wizard-leagues">${rows.map(item => `<label data-wizard-player-row="${item.id}"><span>${esc(item.name)}</span><select name="league_${item.id}"><option value="premier" ${item.league === "premier" ? "selected" : ""}>Premier League</option><option value="championship" ${item.league === "championship" ? "selected" : ""}>Championship</option></select></label>`).join("")}</div></section>
      <section class="season-wizard-step" data-wizard-step="3"><h3>Takım Havuzlarını Doğrula</h3><p>Takım listelerini Takım Merkezi'nden ayrıntılı düzenleyebilirsin.</p><div class="season-wizard-pools">${Object.entries(season.teamPools).map(([key, pool]) => `<div><b>${key === "cup" ? "🏆" : `${pool.stars}★`}</b><span>${esc(pool.label)}</span><strong>${teamPoolTeams(season, key).length} takım</strong></div>`).join("")}</div><label class="season-wizard-check"><input type="checkbox" name="lockPools" ${season.teamPoolLocked ? "checked" : ""}><span>Fikstür oluşturulduğunda takım havuzlarını kilitle</span></label><label class="season-wizard-check"><input type="checkbox" name="preventReuse" ${season.preventTeamReuse ? "checked" : ""}><span>Aynı devrede aynı takımın tekrar kullanımını engelle</span></label></section>
      <section class="season-wizard-step" data-wizard-step="4"><h3>Sezon Modu ve Onay</h3><div class="season-wizard-mode"><label><input type="radio" name="mode" value="test" ${season.mode === "test" ? "checked" : ""}><span><b>Test Modu</b><small>Sonuçlar resmî müzeye yazılmaz.</small></span></label><label><input type="radio" name="mode" value="official" ${season.mode !== "test" ? "checked" : ""}><span><b>Resmî Sezon</b><small>FIFA09 tamamlandıktan sonra aktive edilir.</small></span></label></div><label class="season-wizard-check"><input type="checkbox" name="generateFixtures" checked><span>Üç devreli gerçek fikstürü oluştur</span></label><label class="season-wizard-check"><input type="checkbox" name="activateNow"><span>Kontroller uygunsa sezonu hemen başlat</span></label><div class="season-wizard-final-note">Bu işlem mevcut FIFA09 verilerini değiştirmez. FIFA10 ve sonraki sezonlar ayrı sezon kayıtları olarak saklanır.</div></section>
      <div class="season-wizard-actions"><button type="button" class="btn btn-ghost" data-season-action="wizard-prev" disabled>Geri</button><button type="button" class="btn btn-gold" data-season-action="wizard-next">Devam Et</button><button class="btn btn-gold hidden" type="submit" data-wizard-submit>Sezonu Hazırla</button></div>
    </form>`, "SEASON LAUNCH WIZARD");
  }

  function setWizardStep(step) {
    wizardStep = Math.max(1, Math.min(4, Number(step) || 1));
    document.querySelectorAll("[data-wizard-step]").forEach(item => item.classList.toggle("active", Number(item.dataset.wizardStep) === wizardStep));
    document.querySelectorAll("[data-wizard-indicator]").forEach(item => { const n = Number(item.dataset.wizardIndicator); item.classList.toggle("active", n === wizardStep); item.classList.toggle("done", n < wizardStep); });
    const prev = document.querySelector('[data-season-action="wizard-prev"]');
    const next = document.querySelector('[data-season-action="wizard-next"]');
    const submit = document.querySelector("[data-wizard-submit]");
    if (prev) prev.disabled = wizardStep === 1;
    if (next) next.classList.toggle("hidden", wizardStep === 4);
    if (submit) submit.classList.toggle("hidden", wizardStep !== 4);
  }

  function wizardAutoAssign() {
    const form = document.querySelector("#seasonStartWizardForm");
    if (!form) return;
    const season = currentSeason();
    const eligible = season.players.filter(item => form.elements[`participating_${item.id}`]?.checked).sort((a, b) => Number(a.seedPriority) - Number(b.seedPriority) || allTimeRank(a.name) - allTimeRank(b.name) || a.name.localeCompare(b.name, "tr"));
    const premier = new Set(eligible.slice(0, Number(season.settings.premierSize || 7)).map(item => item.id));
    season.players.forEach(item => { const select = form.elements[`league_${item.id}`]; if (select) select.value = premier.has(item.id) ? "premier" : "championship"; });
    toast("Katılım teyidine göre Premier League ilk 7 ön izlemeye uygulandı.", "success");
  }

  function applySeasonWizard(form) {
    if (!canEdit()) return;
    const data = new FormData(form);
    const season = seasons().find(item => item.edition === Number(data.get("edition")));
    if (!season || hasAnySeasonResults(season)) { toast("Sihirbaz bu sezon için kullanılamıyor.", "error"); return; }
    const participating = season.players.filter(item => data.has(`participating_${item.id}`));
    const premierCount = participating.filter(item => data.get(`league_${item.id}`) === "premier").length;
    const championshipCount = participating.length - premierCount;
    if (premierCount !== Number(season.settings.premierSize || 7)) { toast(`Premier League tam olarak ${season.settings.premierSize || 7} oyuncudan oluşmalıdır.`, "error"); setWizardStep(2); return; }
    if (championshipCount < 2) { toast("Championship için en az 2 katılımcı gereklidir.", "error"); setWizardStep(2); return; }
    const requestedMode = data.get("mode") === "test" ? "test" : "official";
    if (data.has("activateNow") && requestedMode === "official" && season.edition === 10 && !fifa9Completed()) { toast("FIFA09 tamamlanmadığı için resmî sezon hemen başlatılamaz. Test modunu seç veya yalnızca fikstürü oluştur.", "error"); setWizardStep(4); return; }
    season.players.forEach(item => {
      item.participating = data.has(`participating_${item.id}`);
      item.league = data.get(`league_${item.id}`) === "premier" ? "premier" : "championship";
    });
    season.mode = requestedMode;
    season.teamPoolLocked = data.has("lockPools");
    season.preventTeamReuse = data.has("preventReuse");
    season.leagues.premier = { generated: false, playerIds: [], fixtures: [] };
    season.leagues.championship = { generated: false, playerIds: [], fixtures: [] };
    if (data.has("generateFixtures")) populateLeagueFixtures(season);
    else { season.status = "setup"; season.phase = "setup"; }
    if (data.has("activateNow") && data.has("generateFixtures")) { season.status = "active"; season.phase = "league"; season.startedAt = season.startedAt || now(); }
    season.wizardCompleted = true;
    season.wizardCompletedAt = now();
    closeModal();
    save(true);
    selectedTab = "overview";
    rerender();
    toast(`${seasonLabel(season.edition)} sezon hazırlığı tamamlandı.`, "success");
  }

  function progressStats(season) {
    const league = [...leagueMatches(season, "premier"), ...leagueMatches(season, "championship")];
    const leagueDone = league.filter(matchComplete).length;
    const cup = cupMatches(season);
    const cupDone = cup.filter(matchComplete).length;
    return { leagueDone, leagueTotal: league.length, cupDone, cupTotal: cup.length, totalDone: leagueDone + cupDone, total: league.length + cup.length };
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("tr-TR").format(Number(value) || 0);
  }

  function renderStatusHero(season) {
    const stats = progressStats(season);
    const pct = stats.total ? Math.round(stats.totalDone / stats.total * 100) : 0;
    return `<section class="season-hub-hero">
      <div><div class="eyebrow">ORUÇ REİS FIFA LEAGUE SYSTEM</div><h2>${seasonLabel(season.edition)} Sezon Merkezi</h2><p>Premier League, Championship, Oruç Reis Kupası ve Süper Kupa tek kalıcı sezon motorunda.</p></div>
      <div class="season-hero-right"><span class="season-status-chip ${statusClass(season)}">${esc(statusText(season))}</span><div class="season-progress-ring" style="--progress:${pct * 3.6}deg"><strong>${pct}%</strong><small>${stats.totalDone}/${stats.total || 0} maç</small></div></div>
    </section>`;
  }

  function renderSeasonSelector(season) {
    const list = seasons();
    return `<section class="season-toolbar">
      <div class="season-edition-tabs">${list.map(item => `<button class="${item.edition === season.edition ? "active" : ""} ${item.status === "cancelled" ? "cancelled" : ""}" data-season-action="select-edition" data-edition="${item.edition}">${seasonLabel(item.edition)}<small>${item.status === "cancelled" ? "İPTAL" : item.mode === "test" ? "TEST" : item.status.toLocaleUpperCase("tr-TR")}</small></button>`).join("")}</div>
      ${canEdit() ? `<button class="btn btn-gold btn-small" data-season-action="create-next-season">+ Yeni Sezon</button>` : ""}
    </section>`;
  }

  function renderTabs() {
    const tabs = [
      ["overview", "Sezon Özeti"], ["premier", "Premier League"], ["championship", "Championship"], ["teams", "Takım Merkezi"], ["awards", "Bireysel Ödüller"], ["records", "Rekorlar Kitabı"], ["availability", "Oyuncu Uygunluğu"], ["oruc", "Oruç Reis Kupası"], ["super", "Süper Kupa"], ["career", "Kariyer Pasaportu"], ["admin", "Yönetim"]
    ];
    return `<nav class="season-subnav">${tabs.map(([id, label]) => `<button class="${selectedTab === id ? "active" : ""}" data-season-action="set-tab" data-tab="${id}">${label}</button>`).join("")}</nav>`;
  }

  function renderOverview(season) {
    const premier = leaguePlayers(season, "premier");
    const championship = leaguePlayers(season, "championship");
    const pMatches = leagueMatches(season, "premier");
    const cMatches = leagueMatches(season, "championship");
    const pTable = standings(season, "premier");
    const cTable = standings(season, "championship");
    const leagueChampion = bothLeaguesComplete(season) ? pTable[0]?.name : "Henüz belirlenmedi";
    return `<div class="season-overview-grid">
      <section class="season-format-card premier"><div class="season-format-icon">♛</div><div><span>PREMIER LEAGUE</span><strong>${premier.length} oyuncu</strong><small>${pMatches.length ? `${pMatches.length} toplam maç · kişi başı 18 maç` : "3 devreli fikstür bekleniyor"}</small></div></section>
      <section class="season-format-card championship"><div class="season-format-icon">♜</div><div><span>CHAMPIONSHIP</span><strong>${championship.length} oyuncu</strong><small>${cMatches.length ? `${cMatches.length} toplam maç · 3 devre` : "Yeni ve kalan oyuncular"}</small></div></section>
      <section class="season-format-card legs"><div class="season-format-icon">★★★</div><div><span>3 DEVRE SİSTEMİ</span><strong>4★ · 4.5★ · 5★</strong><small>Her devrede tüm rakiplerle bir maç</small></div></section>
      <section class="season-format-card movement"><div class="season-format-icon">⇅</div><div><span>YÜKSELME / DÜŞME</span><strong>2 yükselir · 2 düşer</strong><small>Yeni oyuncular Championship'ten başlar</small></div></section>
      <section class="panel season-champion-panel"><div><div class="eyebrow">SEZONUN ANA UNVANI</div><h3>Premier League Şampiyonu</h3><strong>${esc(leagueChampion)}</strong><p>Lig şampiyonluğu ve Oruç Reis Kupası sezonun en prestijli iki başarısıdır.</p></div><img src="assets/trophies/premier-league.svg" alt="Premier League kupası"></section>
      <section class="panel season-roadmap"><div class="panel-header"><div><h3 class="panel-title">Sezon Akışı</h3><div class="panel-subtitle">Kalıcı ve her sezon tekrarlanabilir yapı.</div></div></div>
        <div class="season-roadmap-steps"><div class="${season.phase !== "setup" ? "done" : "active"}"><b>1</b><span>Oyuncu Kaydı</span><small>Premier 7 + Championship</small></div><div class="${bothLeaguesComplete(season) ? "done" : season.phase === "league" ? "active" : ""}"><b>2</b><span>Üç Devreli Ligler</span><small>4★ / 4.5★ / 5★</small></div><div class="${season.cups.oruc.status === "completed" ? "done" : season.phase.startsWith("oruc") ? "active" : ""}"><b>3</b><span>Oruç Reis Kupası</span><small>Play-off, kura, final</small></div><div class="${season.cups.super.status === "completed" ? "done" : season.phase === "super-cup" ? "active" : ""}"><b>4</b><span>Süper Kupa</span><small>Yeni sezon öncesi tek maç</small></div></div>
      </section>
      <section class="panel season-policy"><h3>Sonraki Sezon Politikası</h3><p>Premier League ilk 5 oyuncusu ligde kalır. Championship ilk 2 oyuncusu yükselir. Bir hak sahibi katılmazsa kontenjan Championship 3.'sünden başlayarak sıradaki hak sahibine geçer. Yeni ve geri dönen oyuncular doğrudan Championship'ten başlar.</p></section>
      ${renderQuickActions(season)}
    </div>`;
  }

  function renderQuickActions(season) {
    if (!canEdit()) return "";
    let action = "";
    if (!activePlayers(season).length) action = `<button class="btn btn-gold" data-season-action="bulk-players">Oyuncu Listesini Gir</button>`;
    else if (!season.leagues.premier.generated) action = `<button class="btn btn-gold" data-season-action="open-wizard">Sezon Başlatma Sihirbazı</button>`;
    else if (season.status === "scheduled") action = `<button class="btn btn-gold" data-season-action="activate-season">Sezonu Başlat</button>`;
    else if (bothLeaguesComplete(season) && season.cups.oruc.status === "locked") action = `<button class="btn btn-gold" data-season-action="generate-oruc">Oruç Reis Kupasını Başlat</button>`;
    else if (season.phase === "oruc-semifinal-draw") action = `<button class="btn btn-gold" data-season-action="draw-semifinals">Yarı Final Kurasını Çek</button>`;
    else if (season.phase === "oruc-final-ready") action = `<button class="btn btn-gold" data-season-action="create-oruc-final">Finali Oluştur</button>`;
    else if (season.cups.oruc.status === "completed" && season.cups.super.status === "locked") action = `<button class="btn btn-gold" data-season-action="generate-super">Süper Kupayı Oluştur</button>`;
    if (!action) return "";
    return `<section class="panel season-next-action"><div><span>SIRADAKİ ADIM</span><strong>${esc(statusText(season))}</strong></div>${action}</section>`;
  }

  function renderStandingsTable(season, leagueId) {
    const rows = standings(season, leagueId);
    const isPremier = leagueId === "premier";
    return `<div class="season-table-wrap"><table class="season-standings"><thead><tr><th>#</th><th>Oyuncu</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th></tr></thead><tbody>${rows.map((row, index) => {
      const movement = isPremier ? (index >= rows.length - 2 ? "relegation" : index === 0 ? "champion" : "") : (index < 2 ? "promotion" : index === 2 ? "replacement" : "");
      return `<tr class="${movement}"><td><b>${row.rank}</b></td><td><button class="season-player-link" data-season-action="open-career" data-player-name="${esc(row.name)}">${esc(row.name)}</button>${movement === "champion" ? `<small>Lig Şampiyonu</small>` : movement === "promotion" ? `<small>Premier'e yükselir</small>` : movement === "relegation" ? `<small>Championship'e düşer</small>` : movement === "replacement" ? `<small>İlk yedek hak sahibi</small>` : ""}</td><td>${row.p}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td class="${row.gd > 0 ? "positive" : row.gd < 0 ? "negative" : ""}">${row.gd > 0 ? "+" : ""}${row.gd}</td><td><strong>${row.pts}</strong></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderMatchCard(season, match) {
    const played = matchComplete(match);
    return `<article class="season-match-card ${played ? "played" : ""}">
      <div class="season-match-card-head"><span>${match.stage === "league" ? `${match.round}. Hafta` : esc(match.label || "Kupa")}</span><b>${match.stars}★</b></div>
      <div class="season-match-side"><span>${esc(playerName(season, match.homeId))}<small>${esc(match.sameTeam ? match.sharedTeam : match.homeTeam || "")}</small></span><strong>${played ? match.homeScore : "–"}</strong></div>
      <div class="season-match-side"><span>${esc(playerName(season, match.awayId))}<small>${esc(match.sameTeam ? match.sharedTeam : match.awayTeam || "")}</small></span><strong>${played ? match.awayScore : "–"}</strong></div>
      ${canEdit() ? `<button data-season-action="edit-match" data-match-id="${esc(match.id)}">${played ? "Sonucu Düzenle" : "Sonuç Gir"}</button>` : ""}
    </article>`;
  }

  function renderLeague(season, leagueId) {
    const label = leagueId === "premier" ? "Premier League" : "Championship";
    const matches = leagueMatches(season, leagueId);
    const filtered = leagueLegFilter === "all" ? matches : matches.filter(match => String(match.leg) === String(leagueLegFilter));
    const rounds = [...new Set(filtered.map(match => `${match.leg}-${match.round}`))];
    return `<div class="season-league-page">
      <section class="panel season-league-header"><div><div class="eyebrow">${seasonLabel(season.edition)}</div><h2>${label}</h2><p>${leagueId === "premier" ? "7 oyuncu · kişi başı 18 maç · son 2 küme düşer" : "3 devre · ilk 2 Premier League'e yükselir · 3. sıradaki ilk yedektir"}</p></div><div class="season-leg-filter"><button class="${leagueLegFilter === "all" ? "active" : ""}" data-season-action="leg-filter" data-leg="all">Tümü</button>${season.settings.legs.map((leg, index) => `<button class="${String(leagueLegFilter) === String(index + 1) ? "active" : ""}" data-season-action="leg-filter" data-leg="${index + 1}">${leg.label}<small>${leg.stars}★</small></button>`).join("")}</div></section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Puan Durumu</h3><div class="panel-subtitle">3 puanlı standart lig sistemi.</div></div><span class="badge">${matches.filter(matchComplete).length}/${matches.length} maç</span></div>${renderStandingsTable(season, leagueId)}</section>
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Fikstür ve Sonuçlar</h3><div class="panel-subtitle">Her devrede tüm rakiplerle bir maç.</div></div></div>${matches.length ? rounds.map(key => { const [leg, round] = key.split("-"); const roundMatches = filtered.filter(match => String(match.leg) === leg && String(match.round) === round); return `<div class="season-round-block"><div class="season-round-title"><strong>${leg}. Devre · ${round}. Hafta</strong><span>${roundMatches[0]?.stars || ""}★ takım seviyesi</span></div><div class="season-match-grid">${roundMatches.map(match => renderMatchCard(season, match)).join("")}</div></div>`; }).join("") : `<div class="season-empty"><strong>Fikstür henüz oluşturulmadı</strong><p>Yönetim sekmesinden oyuncuları dağıtıp üç devreli fikstürü oluştur.</p></div>`}</section>
    </div>`;
  }

  function renderSeries(season, series) {
    if (!series) return "";
    const score = seriesScore(series);
    const winner = seriesWinner(series);
    const neededMatches = winner ? series.matches.filter(matchComplete) : series.matches;
    return `<section class="season-series-card ${winner ? "completed" : ""}"><div class="season-series-head"><div><span>${esc(series.label)}</span><strong>${esc(playerName(season, series.homeId))} <b>${score.home}–${score.away}</b> ${esc(playerName(season, series.awayId))}</strong></div><small>BEST OF 3 · 4.5★</small></div><div class="season-match-grid">${neededMatches.map(match => renderMatchCard(season, match)).join("")}</div>${winner ? `<div class="season-series-winner">✓ Seri galibi: <strong>${esc(playerName(season, winner))}</strong></div>` : ""}</section>`;
  }

  function renderOrucCup(season) {
    const cup = season.cups.oruc;
    if (cup.status === "locked") return `<section class="season-cup-hero oruc"><img src="assets/trophies/oruc-reis-cup.svg" alt=""><div><div class="eyebrow">ORUÇ REİS KUPASI</div><h2>Sezonun büyük eleme kupası</h2><p>Premier ilk 2 doğrudan yarı finalde. Premier 3 – Championship 1 ve Premier 4 – Premier 5 play-off oynar. Play-off ve yarı final Best of 3, final tek maç ve aynı takım formatındadır.</p>${canEdit() && bothLeaguesComplete(season) ? `<button class="btn btn-gold" data-season-action="generate-oruc">Kupayı Başlat</button>` : `<span class="badge">Liglerin tamamlanması bekleniyor</span>`}</div></section>`;
    const seeds = cup.seeds || {};
    return `<div class="season-cup-page">
      <section class="season-cup-hero oruc"><img src="assets/trophies/oruc-reis-cup.svg" alt=""><div><div class="eyebrow">${seasonLabel(season.edition)}</div><h2>Oruç Reis Kupası</h2><p>4.5 yıldızlı takım havuzu · serilerde farklı takım · finalde aynı takım.</p>${cup.status === "completed" ? `<div class="season-cup-champion"><span>ŞAMPİYON</span><strong>${esc(playerName(season, cup.championId))}</strong></div>` : ""}</div></section>
      <section class="panel season-seed-board"><div><span>Doğrudan Yarı Final</span><strong>${esc(playerName(season, seeds.premier1))}</strong><strong>${esc(playerName(season, seeds.premier2))}</strong></div><div><span>Play-off 1</span><strong>${esc(playerName(season, seeds.premier3))}</strong><b>vs</b><strong>${esc(playerName(season, seeds.championship1))}</strong></div><div><span>Play-off 2</span><strong>${esc(playerName(season, seeds.premier4))}</strong><b>vs</b><strong>${esc(playerName(season, seeds.premier5))}</strong></div></section>
      <div class="season-series-grid">${renderSeries(season, cup.series.po1)}${renderSeries(season, cup.series.po2)}</div>
      ${season.phase === "oruc-semifinal-draw" && canEdit() ? `<section class="panel season-cup-action"><div><h3>Play-off tamamlandı</h3><p>Dört yarı finalist arasında kura çekimi hazır.</p></div><button class="btn btn-gold" data-season-action="draw-semifinals">Yarı Final Kurasını Çek</button></section>` : ""}
      ${cup.series.sf1 || cup.series.sf2 ? `<div class="season-series-grid">${renderSeries(season, cup.series.sf1)}${renderSeries(season, cup.series.sf2)}</div>` : ""}
      ${season.phase === "oruc-final-ready" && canEdit() ? `<section class="panel season-cup-action"><div><h3>Finalistler belirlendi</h3><p>Tek maçlık aynı takım finalini oluştur.</p></div><button class="btn btn-gold" data-season-action="create-oruc-final">Finali Oluştur</button></section>` : ""}
      ${cup.final ? `<section class="season-final-card"><img src="assets/trophies/oruc-reis-cup.svg" alt=""><div><span>BÜYÜK FİNAL · TEK MAÇ · AYNI TAKIM</span><h3>${esc(playerName(season, cup.final.homeId))} <b>vs</b> ${esc(playerName(season, cup.final.awayId))}</h3><p>${cup.final.sharedTeam ? `Ortak takım: ${esc(cup.final.sharedTeam)}` : "Ortak takım henüz belirlenmedi"}</p>${matchComplete(cup.final) ? `<strong class="season-final-score">${cup.final.homeScore} – ${cup.final.awayScore}</strong>` : ""}${canEdit() ? `<button class="btn btn-gold" data-season-action="edit-match" data-match-id="${esc(cup.final.id)}">${matchComplete(cup.final) ? "Final Sonucunu Düzenle" : "Final Sonucu Gir"}</button>` : ""}</div></section>` : ""}
      ${cup.status === "completed" && season.cups.super.status === "locked" && canEdit() ? `<section class="panel season-cup-action"><div><h3>Oruç Reis Kupası tamamlandı</h3><p>Lig şampiyonu ile kupa şampiyonu arasında Süper Kupa oluşturulabilir.</p></div><button class="btn btn-gold" data-season-action="generate-super">Süper Kupayı Oluştur</button></section>` : ""}
    </div>`;
  }

  function renderSuperCup(season) {
    const superCup = season.cups.super;
    if (!superCup.match) return `<section class="season-cup-hero super"><img src="assets/trophies/super-cup.svg" alt=""><div><div class="eyebrow">${seasonLabel(season.edition)} SÜPER KUPASI</div><h2>Yeni sezon öncesi şampiyonlar maçı</h2><p>Premier League şampiyonu ile Oruç Reis Kupası şampiyonu tek maç ve aynı takım formatında karşılaşır. Aynı oyuncu iki kupayı da kazanırsa rakip Oruç Reis Kupası finalistidir.</p><span class="badge">Oruç Reis Kupasının tamamlanması bekleniyor</span></div></section>`;
    return `<section class="season-super-stage"><div class="season-super-glow"></div><img src="assets/trophies/super-cup.svg" alt="Süper Kupa"><div class="eyebrow">${seasonLabel(season.edition)} SÜPER KUPASI</div><h2>${esc(playerName(season, superCup.match.homeId))} <span>vs</span> ${esc(playerName(season, superCup.match.awayId))}</h2><p>Tek maç · aynı takım · normal süre, uzatma ve penaltılar</p><div class="season-shared-team">${superCup.match.sharedTeam ? `Ortak takım: ${esc(superCup.match.sharedTeam)}` : "Ortak takım henüz belirlenmedi"}</div>${matchComplete(superCup.match) ? `<div class="season-super-score">${superCup.match.homeScore} – ${superCup.match.awayScore}</div><div class="season-super-winner">Şampiyon: ${esc(playerName(season, matchWinnerId(superCup.match)))}</div>` : ""}${canEdit() ? `<button class="btn btn-gold" data-season-action="edit-match" data-match-id="${esc(superCup.match.id)}">${matchComplete(superCup.match) ? "Sonucu Düzenle" : "Süper Kupa Sonucu Gir"}</button>` : ""}</section>`;
  }

  function renderAdmin(season) {
    const locked = hasAnySeasonResults(season);
    const premierCount = leaguePlayers(season, "premier").length;
    const championshipCount = leaguePlayers(season, "championship").length;
    return `<div class="season-admin-page">
      <section class="panel season-admin-summary"><div><div class="eyebrow">SEZON YÖNETİMİ</div><h2>${seasonLabel(season.edition)} Yapılandırması</h2><p>Bu sezon gerçek lig motorunu kullanır. Test modu yalnızca deneme sonuçlarının müzeye resmî kayıt olarak geçmesini engeller.</p></div><div class="season-admin-counts"><span><b>${premierCount}</b> Premier</span><span><b>${championshipCount}</b> Championship</span><span><b>${activePlayers(season).length}</b> Toplam</span></div></section>
      ${season.status === "cancelled" ? `<section class="panel season-cancelled-box"><h3>Bu sezon iptal edildi</h3><p>Veri geçmişi korunuyor. Yönetici sezonu yeniden açabilir.</p>${canEdit() ? `<button class="btn btn-gold" data-season-action="restore-season">Sezonu Yeniden Aç</button>` : ""}</section>` : ""}
      <section class="panel"><div class="panel-header"><div><h3 class="panel-title">Oyuncu Listesi ve Lig Dağılımı</h3><div class="panel-subtitle">FIFA 10'da Tüm Zamanlar ilk 7; sonraki sezonlarda yükselme, düşme ve yedek sırası.</div></div>${canEdit() && !locked ? `<div class="season-admin-actions"><button class="btn btn-ghost btn-small" data-season-action="bulk-players">Toplu Liste</button><button class="btn btn-ghost btn-small" data-season-action="auto-assign">Otomatik Dağıt</button><button class="btn btn-gold btn-small" data-season-action="open-wizard">Sezon Sihirbazı</button></div>` : ""}</div>
        <div class="season-player-admin-list">${activePlayers(season).length ? activePlayers(season).sort((a, b) => a.league.localeCompare(b.league) || a.seedPriority - b.seedPriority).map((item, index) => `<div class="season-player-admin-row"><span>${String(index + 1).padStart(2, "0")}</span><div><strong>${esc(item.name)}</strong><small>${esc(item.source)}${item.seedPriority < 9999 ? ` · öncelik ${item.seedPriority}` : ""}</small></div><select data-season-player-league="${item.id}" ${!canEdit() || locked ? "disabled" : ""}><option value="premier" ${item.league === "premier" ? "selected" : ""}>Premier League</option><option value="championship" ${item.league === "championship" ? "selected" : ""}>Championship</option></select>${canEdit() && !locked ? `<button class="season-remove-player" data-season-action="remove-player" data-player-id="${item.id}" title="Oyuncuyu çıkar">×</button>` : ""}</div>`).join("") : `<div class="season-empty"><strong>Oyuncu listesi boş</strong><p>Toplu Liste düğmesiyle FIFA 10 katılımcılarını ekle.</p></div>`}</div>
      </section>
      <section class="season-admin-control-grid">
        <article class="panel"><h3>1. Ligleri Hazırla</h3><p>Premier League'in 7 oyuncu olduğunu kontrol et ve iki ligin üç devreli fikstürünü oluştur.</p>${canEdit() ? `<button class="btn btn-gold" data-season-action="generate-fixtures" ${locked ? "disabled" : ""}>Fikstürü Oluştur</button>` : ""}</article>
        <article class="panel"><h3>2. Sezon Modu</h3><p>${season.mode === "test" ? "Test sonuçları kupa müzesine resmî başarı olarak işlenmez." : "Resmî moddaki tamamlanan başarılar kupa müzesine otomatik kaydedilir."}</p>${canEdit() ? `<button class="btn btn-ghost" data-season-action="toggle-test">${season.mode === "test" ? "Resmî Moda Geç" : "Test Modunu Aç"}</button>` : ""}</article>
        <article class="panel"><h3>3. Sezonu Başlat</h3><p>Fikstür hazırlandıktan sonra sezonu aktive et. FIFA 10 resmî başlangıcı için FIFA 09 tamamlanmalıdır.</p>${canEdit() ? `<button class="btn btn-gold" data-season-action="activate-season" ${season.status === "active" || season.status === "completed" || season.status === "cancelled" ? "disabled" : ""}>Sezonu Başlat</button>` : ""}</article>
        <article class="panel"><h3>Veri Araçları</h3><p>Sezonu JSON olarak indir, deneme sonuçlarını sıfırla veya sezonu diğer turnuvalara zarar vermeden iptal et.</p><div class="season-tool-buttons"><button class="btn btn-ghost btn-small" data-season-action="export-season">JSON İndir</button>${canEdit() ? `<button class="btn btn-ghost btn-small" data-season-action="confirm-reset">Sonuçları Sıfırla</button><button class="btn btn-danger btn-small" data-season-action="confirm-cancel">Sezonu İptal Et</button>${season.edition > 10 ? `<button class="btn btn-danger btn-small" data-season-action="confirm-delete">Sezonu Sil</button>` : ""}` : ""}</div></article>
      </section>
      <section class="panel season-rules-box"><h3>Kalıcı Sezon Anayasası</h3><div class="season-rules-grid"><div><b>Premier League</b><span>7 oyuncu · 3 devre · kişi başı 18 maç</span></div><div><b>Championship</b><span>Kalan oyuncular · ilk 2 yükselir</span></div><div><b>Oruç Reis Kupası</b><span>P1/P2 yarı final · P3-C1 ve P4-P5 play-off</span></div><div><b>Süper Kupa</b><span>Lig şampiyonu – kupa şampiyonu/finalisti</span></div><div><b>Yeni Oyuncu</b><span>Her zaman Championship'ten başlar</span></div><div><b>Eksik Katılım</b><span>Championship 3.'den başlayan yedek sırası</span></div></div></section>
    </div>`;
  }

  function render(target) {
    const season = currentSeason();
    if (!target || !season) return;
    refreshSeasonProgress(season);
    const experienceTabs = ["awards", "records", "availability"];
    const content = selectedTab === "overview" ? renderOverview(season)
      : selectedTab === "premier" ? renderLeague(season, "premier")
      : selectedTab === "championship" ? renderLeague(season, "championship")
      : selectedTab === "teams" ? renderTeamCenter(season)
      : experienceTabs.includes(selectedTab) ? (window.FIFA_SEASON_EXPERIENCE?.render?.(selectedTab, season) || `<section class="panel season-empty"><strong>V39 modülü yükleniyor</strong></section>`)
      : selectedTab === "oruc" ? renderOrucCup(season)
      : selectedTab === "super" ? renderSuperCup(season)
      : selectedTab === "career" ? renderCareerPassport(season)
      : renderAdmin(season);
    target.innerHTML = `${renderStatusHero(season)}${renderSeasonSelector(season)}${renderTabs()}<div class="season-hub-content">${content}</div>`;
  }

  function rerender() {
    if (ctx()?.getActiveView?.() === "seasonhub") render(document.querySelector("#view"));
  }

  function handleClick(event) {
    const action = event.target.closest("[data-season-action]");
    if (!action) return false;
    event.preventDefault();
    const season = currentSeason();
    const type = action.dataset.seasonAction;
    if (["select-edition", "set-tab", "leg-filter", "edit-match", "export-season", "open-career"].includes(type) === false && !canEdit()) {
      toast("Bu işlem yalnızca turnuva yöneticisine açıktır.", "error");
      return true;
    }
    if (type === "select-edition") { selectedEdition = Number(action.dataset.edition) || 10; system().activeEdition = selectedEdition; selectedTab = "overview"; leagueLegFilter = "all"; save(false); rerender(); return true; }
    if (type === "set-tab") { selectedTab = action.dataset.tab || "overview"; leagueLegFilter = "all"; rerender(); return true; }
    if (type === "leg-filter") { leagueLegFilter = action.dataset.leg || "all"; rerender(); return true; }
    if (type === "open-wizard") { openSeasonWizard(season); return true; }
    if (type === "wizard-next") { setWizardStep(wizardStep + 1); return true; }
    if (type === "wizard-prev") { setWizardStep(wizardStep - 1); return true; }
    if (type === "wizard-auto-assign") { wizardAutoAssign(); return true; }
    if (type === "edit-team-pool") { openTeamPoolEditor(season, action.dataset.poolKey); return true; }
    if (type === "toggle-team-pool-lock") { toggleTeamPoolLock(season); return true; }
    if (type === "toggle-team-rule") { toggleTeamRule(season, action.dataset.rule); return true; }
    if (type === "open-career") { selectedCareerPlayerName = action.dataset.playerName || selectedCareerPlayerName; selectedTab = "career"; rerender(); return true; }
    if (type === "bulk-players") { openBulkPlayers(season); return true; }
    if (type === "auto-assign") { autoAssignPlayers(season); return true; }
    if (type === "remove-player") { removePlayer(season, action.dataset.playerId); return true; }
    if (type === "generate-fixtures") { generateLeagueFixtures(season); return true; }
    if (type === "activate-season") { activateSeason(season); return true; }
    if (type === "toggle-test") { toggleTestMode(season); return true; }
    if (type === "edit-match") { openMatchEditor(season, action.dataset.matchId); return true; }
    if (type === "clear-match") { clearMatch(seasons().find(item => item.edition === Number(action.dataset.edition)) || season, action.dataset.matchId); return true; }
    if (type === "generate-oruc") { generateOrucPlayoffs(season); return true; }
    if (type === "draw-semifinals") { drawOrucSemifinals(season); return true; }
    if (type === "create-oruc-final") { createOrucFinal(season); return true; }
    if (type === "generate-super") { generateSuperCup(season); return true; }
    if (type === "create-next-season") { openCreateNextSeason(); return true; }
    if (type === "export-season") { exportSeason(season); return true; }
    if (type === "restore-season") { restoreSeason(season); return true; }
    if (type === "confirm-reset") { openModal("Sezon Sonuçlarını Sıfırla", `<div class="info-box warning-box">${seasonLabel(season.edition)} içindeki tüm lig ve kupa skorları silinecek. Oyuncu listesi ve oluşturulmuş lig fikstürü korunacak.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-danger" data-season-action="reset-season">Sonuçları Sıfırla</button></div>`, "DANGER ZONE"); return true; }
    if (type === "reset-season") { resetSeasonResults(season); return true; }
    if (type === "confirm-cancel") { openModal("Sezonu İptal Et", `<div class="info-box warning-box">${seasonLabel(season.edition)} iptal edilmiş olarak işaretlenecek. FIFA 09 ve diğer sezonlar etkilenmeyecek. Sezon daha sonra yeniden açılabilir.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-danger" data-season-action="cancel-season">Sezonu İptal Et</button></div>`, "SEASON CONTROL"); return true; }
    if (type === "cancel-season") { cancelSeason(season); return true; }
    if (type === "confirm-delete") { openModal("Sezonu Kalıcı Sil", `<div class="info-box warning-box">${seasonLabel(season.edition)} sonuç bulunmuyorsa altyapıdan tamamen silinecek. Bu işlem geri alınamaz.</div><div class="modal-actions"><button class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-danger" data-season-action="delete-season">Kalıcı Sil</button></div>`, "DANGER ZONE"); return true; }
    if (type === "delete-season") { deleteSeason(season); return true; }
    return true;
  }

  function handleSubmit(event) {
    if (event.target.id === "seasonPlayerBulkForm") { event.preventDefault(); applyBulkPlayers(event.target); return true; }
    if (event.target.id === "seasonMatchForm") { event.preventDefault(); saveMatchResult(event.target); return true; }
    if (event.target.id === "createNextSeasonForm") { event.preventDefault(); createNextSeason(event.target); return true; }
    if (event.target.id === "seasonTeamPoolForm") { event.preventDefault(); saveTeamPool(event.target); return true; }
    if (event.target.id === "seasonStartWizardForm") { event.preventDefault(); applySeasonWizard(event.target); return true; }
    return false;
  }

  function handleChange(event) {
    if (event.target.dataset.seasonCareerPlayer !== undefined) {
      selectedCareerPlayerName = event.target.value;
      rerender();
      return true;
    }
    const playerId = event.target.dataset.seasonPlayerLeague;
    if (!playerId) return false;
    changePlayerLeague(currentSeason(), playerId, event.target.value);
    return true;
  }

  function handleInput() {
    return false;
  }

  window.FIFA_SEASON_HUB = { render, handleClick, handleSubmit, handleChange, handleInput, version: VERSION };
})();
