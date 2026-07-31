(() => {
  "use strict";

  const VERSION = "2.2.0";
  const BUILD = "202000";
  const ROUTES = new Set(["dashboard", "livehub", "tournaments", "playershub", "recordshub", "mediahub", "adminhub"]);
  let mode = localStorage.getItem("fifa-universe-v2-mode") || "spectator";
  let selectedPlayer = localStorage.getItem("fifa-universe-v2-player") || "";
  let notificationsOpen = false;
  let listenersInstalled = false;

  const app = () => window.FIFA_APP_CONTEXT || null;
  const engine = () => window.FIFA10_DRAW_ENGINE || null;
  const universe = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const evolution = () => window.FIFA_EVOLUTION_OS || null;
  const championship = () => window.FIFA_CHAMPIONSHIP_OS || null;
  const ui = (tr, en) => window.FIFA_I18N?.language === "en" ? en : tr;
  const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  const normalize = value => String(value || "").trim().toLocaleLowerCase("tr-TR")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const pct = value => `${Number(value || 0).toFixed(1)}%`;
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

  function currentPayload() { return app()?.getState?.() || {}; }
  function currentDraw() { return engine()?.drawState?.() || app()?.getFifa10Draw?.() || null; }
  function universeData() {
    return universe()?.buildUniverse?.(currentPayload(), currentDraw()) || {
      matches: [], players: [], editions: [], records: [], stories: [], rivalries: [], honours: []
    };
  }
  function playerMap(draw = currentDraw()) {
    return new Map((draw?.participants || []).map(player => [String(player.id), player]));
  }
  function playerName(id, draw = currentDraw()) { return playerMap(draw).get(String(id))?.name || "–"; }
  function completedMatches(draw = currentDraw()) { return (draw?.fixtures || []).filter(match => match.completed); }
  function pendingMatches(draw = currentDraw()) { return (draw?.fixtures || []).filter(match => !match.completed); }
  function standings(draw = currentDraw()) {
    if (!draw) return [];
    return engine()?.standings?.(draw) || championship()?.standings?.(draw) || [];
  }
  function latestMatches(draw = currentDraw()) {
    return completedMatches(draw).sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "") || Number(b.sequence || 0) - Number(a.sequence || 0));
  }
  function schedule(draw = currentDraw()) {
    return evolution()?.optimizedSchedule?.(draw, currentPayload()) || pendingMatches(draw);
  }
  function stageInfo(draw = currentDraw()) {
    const total = draw?.fixtures?.length || 78;
    const completed = completedMatches(draw).length;
    const championshipState = currentPayload()?.seasonSystem?.fifa10Draft?.championshipOS;
    const knockoutCompleted = Object.values(championshipState?.rounds || {}).flat()
      .flatMap(series => series.matches || []).filter(match => match.completed && !match.notRequired).length;
    if (!draw?.participants?.length) return { key: "registration", label: ui("Kayıt ve kura", "Registration and draw"), completed, total, progress: 0 };
    if (completed < total) return { key: "groups", label: ui("Grup aşaması canlı", "Group stage live"), completed, total, progress: completed / total * 100 };
    if (championshipState?.championId) return { key: "complete", label: ui("Turnuva tamamlandı", "Tournament complete"), completed, total, knockoutCompleted, progress: 100 };
    return { key: "championship", label: ui("Championship aşaması", "Championship stage"), completed, total, knockoutCompleted, progress: 100 };
  }
  function selectedUniversePlayer(data = universeData(), draw = currentDraw()) {
    const active = new Set((draw?.participants || []).map(player => normalize(player.name)));
    let player = (data.players || []).find(row => row.key === normalize(selectedPlayer) || normalize(row.name) === normalize(selectedPlayer));
    if (!player) player = (data.players || []).find(row => active.has(row.key)) || data.players?.[0] || null;
    if (player) selectedPlayer = player.name;
    return player;
  }
  function safeMode() {
    if (mode === "admin" && !app()?.isAdmin?.()) mode = "spectator";
    return mode;
  }

  function notificationItems() {
    let rows = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("fifa10-sync-history-v1") || "[]");
      rows = Array.isArray(parsed) ? parsed : [];
    } catch (_) { rows = []; }
    const seen = new Set();
    return rows.filter(item => {
      const key = `${item.status || "idle"}|${item.message || ""}|${item.messageEn || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
  }

  function notificationLabel(item) {
    if (item?.status === "cloud") return ui("Bulut güncel", "Cloud up to date");
    if (item?.status === "error") return ui("Bulut bekliyor", "Cloud pending");
    if (item?.status === "device") return ui("Cihaza kaydedildi", "Saved on device");
    return ui("Sistem bilgisi", "System information");
  }

  function notificationTime(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) return "–";
    return date.toLocaleString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  }

  function notificationCentre() {
    const items = notificationItems();
    const errors = items.filter(item => item.status === "error").length;
    return `<div class="v2-notification-wrap">
      <button class="v2-notification-button ${errors ? "has-alert" : ""}" type="button" data-v2-notifications aria-expanded="${notificationsOpen}" aria-label="${ui("Bildirim merkezini aç", "Open notification centre")}"><i>◇</i><span>${ui("Bildirimler", "Notifications")}</span>${errors ? `<b>${errors}</b>` : ""}</button>
      ${notificationsOpen ? `<aside class="v2-notification-centre" role="dialog" aria-label="${ui("Bildirim Merkezi", "Notification Centre")}"><header><div><span>UNIVERSE SIGNALS</span><strong>${ui("Bildirim Merkezi", "Notification Centre")}</strong></div><button type="button" data-v2-notifications aria-label="${ui("Kapat", "Close")}">×</button></header><div>${items.length ? items.map(item => `<article class="status-${esc(item.status || "idle")}"><i></i><div><strong>${notificationLabel(item)}</strong><p>${esc(ui(item.message || "Kayıt bilgisi hazır.", item.messageEn || "Save information is ready."))}</p><small>${notificationTime(item.at)}</small></div></article>`).join("") : `<p class="v2-notification-empty">${ui("Henüz yeni bildirim yok. Önemli kayıt ve bağlantı olayları burada sessizce toplanacak.", "No new notifications yet. Important save and connection events will be collected quietly here.")}</p>`}</div></aside>` : ""}
    </div>`;
  }

  function routeNav(active) {
    const routes = [
      ["dashboard", ui("Ana Sayfa", "Home"), "⌂"],
      ["livehub", ui("Canlı", "Live"), "●"],
      ["tournaments", ui("Turnuvalar", "Tournaments"), "10"],
      ["playershub", ui("Oyuncular", "Players"), "◎"],
      ["recordshub", ui("Tüm Zamanlar", "All-Time"), "♛"],
      ["mediahub", ui("Medya", "Media"), "▤"]
    ];
    return `<nav class="v2-route-nav" aria-label="${ui("Universe 2.0 ana navigasyonu", "Universe 2.0 primary navigation")}">${routes.map(([id, label, icon]) => `<button type="button" data-nav="${id}" class="${active === id ? "active" : ""}"><i>${icon}</i><span>${label}</span></button>`).join("")}</nav>`;
  }

  function modeBar(data, activeRoute) {
    const current = safeMode();
    const players = [...(data.players || [])].sort((a, b) => a.name.localeCompare(b.name, "tr"));
    const selected = selectedUniversePlayer(data);
    return `<section class="v2-modebar">
      <div class="v2-mode-copy"><span>FIFA UNIVERSE 2.0</span><strong>${current === "admin" ? ui("Bugünün Operasyonu", "Today's Operation") : current === "player" ? ui("Oyuncu Deneyimi", "Player Experience") : ui("İzleyici Deneyimi", "Spectator Experience")}</strong></div>
      <div class="v2-mode-switch" role="group" aria-label="${ui("Deneyim modu", "Experience mode")}">
        <button type="button" data-v2-mode="spectator" class="${current === "spectator" ? "active" : ""}">${ui("İzleyici", "Spectator")}</button>
        <button type="button" data-v2-mode="player" class="${current === "player" ? "active" : ""}">${ui("Oyuncu", "Player")}</button>
        <button type="button" data-v2-mode="admin" class="${current === "admin" ? "active" : ""}" ${app()?.isAdmin?.() ? "" : "aria-disabled=\"true\""}>${ui("Yönetici", "Admin")}</button>
      </div>
      ${current === "player" ? `<label class="v2-player-picker"><span>${ui("OYUNCU", "PLAYER")}</span><select id="v2PlayerSelect">${players.map(player => `<option value="${esc(player.name)}" ${player.key === selected?.key ? "selected" : ""}>${esc(player.name)}</option>`).join("")}</select></label>` : ""}
      ${notificationCentre()}
      ${app()?.isAdmin?.() ? `<button class="v2-admin-shortcut ${activeRoute === "adminhub" ? "active" : ""}" type="button" data-nav="adminhub"><span>COMMAND</span><strong>${ui("Bugün", "Today")}</strong><i>↗</i></button>` : ""}
    </section>`;
  }


function fpiTicker() {
  const analytics = app()?.buildFpiAnalytics?.() || {};
  const rows = analytics.players || [];
  if (!rows.length) return "";
  const signed = value => `${Number(value) >= 0 ? "+" : ""}${Number(value) || 0}`;
  const rankMove = row => row.rankMovement > 0 ? `▲${row.rankMovement}` : row.rankMovement < 0 ? `▼${Math.abs(row.rankMovement)}` : "◆";
  const items = rows.map(row => `<button type="button" data-v2-player-open="${esc(row.name)}"><i>${row.rank}</i><strong>${esc(row.name)}</strong><b>${row.rating}</b><span>${rankMove(row)} POS</span><em class="${row.last5Change >= 0 ? "up" : "down"}">${signed(row.last5Change)}</em><small>${esc(row.tier?.label || "STANDING")}</small></button>`).join("");
  const mover = analytics.summary?.mover;
  const upset = analytics.summary?.biggestUpset;
  const gap = analytics.summary?.smallestGap;
  return `<section class="v2-fpi-ticker v2-standing-pulse" aria-label="${ui("FIFA Player Standing canlı sıralaması", "FIFA Player Standing live ranking")}"><header><span><i></i> STANDING PULSE</span><strong>FIFA PLAYER STANDING</strong><button type="button" data-action="open-fpi-centre" data-v2-fpi-centre>${ui("STANDING CENTRE", "STANDING CENTRE")} ↗</button></header><div class="v2-fpi-viewport"><div class="v2-fpi-track">${items}<div class="v2-fpi-repeat" aria-hidden="true">${items}</div></div></div><footer><span>TOP MOVER: <b>${esc(mover?.name || "–")} ${mover ? signed(mover.last5Change) : ""}</b></span><i></i><span>BIGGEST UPSET: <b>${upset ? `${esc(upset.winner)} +${upset.upsetGap}` : "–"}</b></span><i></i><span>SMALLEST GAP: <b>${gap ? `${gap.gap} PTS · #${gap.upper.rank}/#${gap.lower.rank}` : "–"}</b></span></footer></section>`;
}

  function pageIntro(eyebrow, title, copy, aside = "") {
    return `<header class="v2-page-intro"><div><span>${eyebrow}</span><h2>${title}</h2><p>${copy}</p></div>${aside}</header>`;
  }

  function matchCard(match, draw = currentDraw(), type = "upcoming") {
    if (!match) return "";
    const completed = Boolean(match.completed);
    return `<article class="v2-match-card ${completed ? "completed" : type}">
      <header><span>${ui("GRUP", "GROUP")} ${esc(match.group || "–")} · ${Number(match.stars || 0)}★</span><small>${completed ? ui("RESMÎ SONUÇ", "OFFICIAL RESULT") : `MD ${match.matchday || "–"}`}</small></header>
      <div><strong>${esc(playerName(match.homeId, draw))}</strong><b>${completed ? `${match.homeScore}–${match.awayScore}` : "VS"}</b><strong>${esc(playerName(match.awayId, draw))}</strong></div>
      <footer><span>${esc(match.homeTeam || ui("Takım bekleniyor", "Team pending"))}</span><i>${esc(match.evolution?.why || "")}</i><span>${esc(match.awayTeam || ui("Takım bekleniyor", "Team pending"))}</span></footer>
    </article>`;
  }

  function compactTable(rows, limit = 8) {
    return `<div class="v2-table"><div class="head"><span>#</span><span>${ui("Oyuncu", "Player")}</span><span>MP</span><span>GD/M</span><span>PPG</span><span>${ui("Yol", "Path")}</span></div>${rows.slice(0, limit).map(row => `<button type="button" data-v2-player-open="${esc(row.name)}"><i>${row.rank}</i><strong>${esc(row.name)}</strong><span>${row.mp}</span><span>${Number(row.gdPerMatch || 0) >= 0 ? "+" : ""}${Number(row.gdPerMatch || 0).toFixed(2)}</span><b>${Number(row.ppg || 0).toFixed(3)}</b><em class="path-${row.qualification || "pending"}">${row.rank <= 4 ? "DIRECT QF" : row.rank <= 12 ? "PLAY-IN" : ui("ELENDİ", "OUT")}</em></button>`).join("")}</div>`;
  }

  function playerCockpit(data, draw) {
    const player = selectedUniversePlayer(data, draw);
    if (!player) return "";
    const twin = evolution()?.digitalTwins?.(data)?.find(row => row.key === player.key);
    const career = evolution()?.careerStates?.(data, 10)?.find(row => row.player.key === player.key)?.career;
    const currentRow = standings(draw).find(row => normalize(row.name) === player.key);
    const next = schedule(draw).find(match => [String(match.homeId), String(match.awayId)].some(id => normalize(playerName(id, draw)) === player.key));
    return `<section class="v2-player-cockpit"><header><div><span>${ui("OYUNCU MODU", "PLAYER MODE")}</span><h3>${esc(player.name)}</h3><p>${career?.label || ui("Kariyer profili", "Career profile")} · ${player.games} MP · ${player.titles} ${ui("şampiyonluk", "titles")}</p></div><button type="button" data-nav="playershub">${ui("Tam pasaportu aç", "Open full passport")} ↗</button></header><div>
      <article><span>${ui("CANLI SIRA", "LIVE RANK")}</span><b>${currentRow?.rank ? `#${currentRow.rank}` : "–"}</b><small>${currentRow ? `${Number(currentRow.ppg).toFixed(3)} PPG` : ui("Maç bekleniyor", "Awaiting match")}</small></article>
      <article><span>DIGITAL TWIN</span><b>${twin?.posteriorRating?.toFixed(0) || "–"}</b><small>${twin ? `${twin.lowerRating.toFixed(0)}–${twin.upperRating.toFixed(0)}` : ui("Kanıt bekleniyor", "Awaiting evidence")}</small></article>
      <article class="next"><span>${ui("SIRADAKİ MAÇ", "NEXT MATCH")}</span><b>${next ? esc(next.homeId && normalize(playerName(next.homeId, draw)) === player.key ? playerName(next.awayId, draw) : playerName(next.homeId, draw)) : "–"}</b><small>${next ? `${next.stars}★ · ${ui("Grup", "Group")} ${next.group}` : ui("Bekleyen maç yok", "No pending match")}</small></article>
    </div></section>`;
  }

  function adminToday(data, draw, compact = false) {
    if (!app()?.isAdmin?.()) return "";
    const audit = evolution()?.integrity?.(currentPayload(), draw) || { score: 100, issues: [], counts: {} };
    const ordered = schedule(draw);
    const missingTeams = completedMatches(draw).filter(match => !match.homeTeam || !match.awayTeam).length;
    return `<section class="v2-admin-today ${compact ? "compact" : ""}"><header><div><span>ADMIN · TODAY</span><h3>${ui("Şimdi ne yapmalıyım?", "What should I do now?")}</h3></div><button type="button" data-nav="adminhub">${ui("Operasyon merkezini aç", "Open operations centre")} ↗</button></header><div>
      <article class="priority"><span>${ui("ÖNERİLEN SIRADAKİ MAÇ", "RECOMMENDED NEXT MATCH")}</span><strong>${ordered[0] ? `${esc(playerName(ordered[0].homeId, draw))} vs ${esc(playerName(ordered[0].awayId, draw))}` : ui("Grup aşaması tamamlandı", "Group stage complete")}</strong><small>${ordered[0]?.evolution?.why || ui("Championship operasyonuna geç", "Continue to Championship operations")}</small></article>
      <article><span>INTEGRITY</span><b>${Number(audit.score || 0).toFixed(0)}</b><small>${audit.issues?.length || 0} ${ui("bulgu", "findings")}</small></article>
      <article><span>${ui("EKSİK TAKIM", "MISSING TEAMS")}</span><b>${missingTeams}</b><small>${ui("tamamlanan maçlarda", "in completed matches")}</small></article>
    </div></section>`;
  }

  function renderHome(mount) {
    const data = universeData();
    const draw = currentDraw();
    const stage = stageInfo(draw);
    const rows = standings(draw);
    const latest = latestMatches(draw)[0];
    const next = schedule(draw)[0];
    const crown = evolution()?.linealCrown?.(data, draw) || { holder: "–" };
    const equity = evolution()?.equityTimeline?.(currentPayload(), draw);
    const favorite = (equity?.players || []).map(player => ({ ...player, current: player.points?.at(-1)?.titlePct || 0 })).sort((a, b) => b.current - a.current)[0];
    const currentMode = safeMode();
    mount.innerHTML = `<div class="v2-page v2-home">${routeNav("dashboard")}${modeBar(data, "dashboard")}${fpiTicker()}
      <section class="v2-home-hero stage-${stage.key}"><div class="copy"><span><i></i>${esc(stage.label)}</span><h2>${currentMode === "admin" ? ui("Turnuvayı yönet.\nOyunu durdurma.", "Run the tournament.\nNever stop play.") : currentMode === "player" ? ui("Sıradaki maçını bil.\nKariyerini gör.", "Know your next match.\nSee your career.") : ui("Şu anda ne oluyor?", "What is happening now?")}</h2><p>${ui("FIFA 01'den canlı FIFA 10'a kadar bütün sonuçlar, oyuncular ve hikâyeler tek ve anlaşılır bir evrende.", "Every result, player and story from FIFA 01 to live FIFA 10 in one clear universe.")}</p><div class="actions"><button type="button" data-nav="livehub">${ui("Canlı merkezi aç", "Open Live Centre")}</button><button type="button" data-nav="tournaments">${ui("Turnuvaya git", "Go to Tournament")}</button></div></div>
      <aside><div class="v2-progress-orbit" style="--progress:${clamp(stage.progress)}"><strong>${stage.completed}</strong><span>/${stage.total}</span><small>${ui("GRUP MAÇI", "GROUP MATCHES")}</small></div><div><article><span>LINEAL CROWN</span><b>${esc(crown.holder || "–")}</b></article><article><span>${ui("ŞAMPİYONLUK FAVORİSİ", "TITLE FAVOURITE")}</span><b>${esc(favorite?.name || "–")}</b><small>${favorite ? pct(favorite.current) : "–"}</small></article></div></aside></section>
      ${currentMode === "admin" ? adminToday(data, draw, true) : currentMode === "player" ? playerCockpit(data, draw) : ""}
      <section class="v2-now-grid"><div class="v2-live-table"><header><div><span>LIVE TABLE</span><h3>${ui("Şampiyonluk yarışı", "Championship race")}</h3></div><button type="button" data-nav="seasonhub">${ui("Tam tablo", "Full table")} ↗</button></header>${compactTable(rows, 8)}</div><div class="v2-match-stack"><header><span>NOW</span><h3>${ui("Sonuç ve sıradaki maç", "Latest and next")}</h3></header>${latest ? matchCard(latest, draw, "latest") : `<p>${ui("Henüz sonuç girilmedi.", "No result recorded yet.")}</p>`}${next ? matchCard(next, draw, "upcoming") : `<p>${ui("Bekleyen grup maçı yok.", "No group fixture pending.")}</p>`}</div></section>
      <section class="v2-universe-snapshot"><header><div><span>ONE UNIVERSE</span><h3>${ui("Geçmiş ayrı bir arşiv değil; bugünün temelidir.", "History is not a separate archive; it powers today.")}</h3></div><button type="button" data-nav="recordshub">${ui("Tüm zamanları aç", "Open all-time")} ↗</button></header><div><article><b>${data.editions?.length || 10}</b><span>${ui("EDİSYON", "EDITIONS")}</span></article><article><b>${data.matches?.length || 0}</b><span>${ui("RESMÎ MAÇ", "OFFICIAL MATCHES")}</span></article><article><b>${data.players?.length || 0}</b><span>${ui("OYUNCU", "PLAYERS")}</span></article><article><b>${data.rivalries?.length || 0}</b><span>${ui("REKABET", "RIVALRIES")}</span></article></div></section>
    </div>`;
  }

  function renderLive(mount) {
    const data = universeData(); const draw = currentDraw(); const stage = stageInfo(draw);
    const latest = latestMatches(draw).slice(0, 6); const upcoming = schedule(draw).slice(0, 6);
    mount.innerHTML = `<div class="v2-page">${routeNav("livehub")}${modeBar(data, "livehub")}${pageIntro("LIVE UNIVERSE", ui("Turnuvanın tek canlı ekranı.", "One live screen for the tournament."), ui("Skor, sıralama, sıradaki maç ve kritik gelişmeler farklı sayfalara dağılmadan burada birleşir.", "Score, standings, next match and critical developments meet here without being scattered across separate pages."), `<aside><strong>${stage.completed}/${stage.total}</strong><span>${esc(stage.label)}</span></aside>`)}
      <section class="v2-live-command"><button type="button" data-nav="livematch"><i>●</i><div><span>LIVE MATCH STUDIO</span><strong>${ui("Canlı anlatımı aç", "Open live coverage")}</strong></div><b>↗</b></button><button type="button" data-nav="seasonhub"><i>10</i><div><span>TOURNAMENT</span><strong>${ui("Puan tablosu ve fikstür", "Standings and fixtures")}</strong></div><b>↗</b></button><button type="button" data-nav="odds"><i>1X2</i><div><span>MODEL</span><strong>${ui("Oranlar ve tahmin", "Odds and prediction")}</strong></div><b>↗</b></button></section>
      <section class="v2-dual-feed"><div><header><span>${ui("SON SONUÇLAR", "LATEST RESULTS")}</span><b>${latest.length}</b></header>${latest.map(match => matchCard(match, draw, "latest")).join("") || `<p>${ui("Sonuç bekleniyor.", "Awaiting results.")}</p>`}</div><div><header><span>${ui("SIRADAKİ MAÇLAR", "UP NEXT")}</span><b>${upcoming.length}</b></header>${upcoming.map(match => matchCard(match, draw, "upcoming")).join("") || `<p>${ui("Bekleyen grup maçı yok.", "No group match pending.")}</p>`}</div></section>
    </div>`;
  }

  function renderTournaments(mount) {
    const data = universeData(); const draw = currentDraw(); const stage = stageInfo(draw);
    const honours = new Map((data.honours || []).filter(row => row.competition === "oruc").map(row => [Number(row.edition), row]));
    const editionMap = new Map((data.editions || []).map(row => [Number(row.edition), row]));
    mount.innerHTML = `<div class="v2-page">${routeNav("tournaments")}${modeBar(data, "tournaments")}${pageIntro("TOURNAMENTS", ui("On edisyon. Tek standart.", "Ten editions. One standard."), ui("Her turnuva aynı kullanıcı mantığıyla açılır; format değişir, yön bulma değişmez.", "Every tournament opens with the same user logic; the format changes, navigation does not."))}
      <section class="v2-active-tournament"><div><span>ACTIVE · FIFA 10</span><h3>Triple Circuit</h3><p>${esc(stage.label)} · ${stage.completed}/${stage.total} ${ui("grup maçı", "group matches")}</p><div class="v2-progress"><i style="width:${clamp(stage.progress)}%"></i></div></div><aside><button type="button" data-nav="seasonhub">${ui("Turnuva merkezini aç", "Open tournament centre")} ↗</button><button type="button" data-nav="print">${ui("Çıktılar", "Print Centre")}</button></aside></section>
      <section class="v2-edition-grid">${Array.from({ length: 10 }, (_, index) => index + 1).reverse().map(edition => { const item = editionMap.get(edition); const honour = honours.get(edition); return `<article class="${edition === 10 ? "active" : ""}"><header><span>FIFA</span><b>${String(edition).padStart(2, "0")}</b><em>${edition === 10 ? ui("CANLI", "LIVE") : ui("TAMAMLANDI", "COMPLETE")}</em></header><div><span>${ui("ŞAMPİYON", "CHAMPION")}</span><strong>${esc(honour?.winner || (edition === 10 ? ui("Belirlenecek", "To be decided") : "–"))}</strong><small>${item ? `${item.matches || 0} MP · ${Number(item.difficulty || 0).toFixed(0)} DIFF` : ui("Tarihsel kayıt", "Historical record")}</small></div>${edition === 10 ? `<button type="button" data-nav="seasonhub">${ui("Aç", "Open")} ↗</button>` : edition === 9 ? `<button type="button" data-nav="knockout">${ui("Final Chapter", "Final Chapter")} ↗</button>` : `<button type="button" data-nav="archive">${ui("Arşiv", "Archive")} ↗</button>`}</article>`; }).join("")}</section>
    </div>`;
  }


function renderPlayers(mount) {
  const data = universeData(); const draw = currentDraw(); const player = selectedUniversePlayer(data, draw);
  if (!player) { mount.innerHTML = `<div class="v2-page">${routeNav("playershub")}<p>${ui("Oyuncu verisi bulunamadı.", "No player data available.")}</p></div>`; return; }
  const twin = evolution()?.digitalTwins?.(data)?.find(row => row.key === player.key);
  const career = evolution()?.careerStates?.(data, 10)?.find(row => row.player.key === player.key)?.career;
  const current = standings(draw).find(row => normalize(row.name) === player.key);
  const rivals = (data.rivalries || []).filter(row => [normalize(row.playerA), normalize(row.playerB)].includes(player.key)).slice(0, 5);
  const recent = [...(player.entries || [])].slice(-8).reverse();
  const teams = [...new Set((player.entries || []).map(entry => entry.team).filter(Boolean))];
  const standingAnalytics = app()?.buildFpiAnalytics?.() || {};
  const standing = (standingAnalytics.players || []).find(row => normalize(row.name) === player.key);
  const standingDna = standing?.fpi?.dna || [];
  const signed = value => `${Number(value) >= 0 ? "+" : ""}${Number(value) || 0}`;
  mount.innerHTML = `<div class="v2-page">${routeNav("playershub")}${modeBar(data, "playershub")}${pageIntro("UNIVERSAL PLAYER PASSPORT", ui("Bir oyuncu. Bütün kariyer.", "One player. The whole career."), ui("Aktif turnuva, Player Standing, tüm zamanlar, kariyer evresi, takım kullanımı ve rekabet geçmişi tek kalıcı profilde.", "Live tournament, Player Standing, all-time history, career state, team usage and rivalry history in one permanent profile."), `<label class="v2-page-player-select"><span>${ui("OYUNCU SEÇ", "SELECT PLAYER")}</span><select id="v2PlayerSelect">${data.players.map(row => `<option value="${esc(row.name)}" ${row.key === player.key ? "selected" : ""}>${esc(row.name)}</option>`).join("")}</select></label>`)}
    <section class="v2-passport-hero"><div class="identity"><i>${esc(player.name.split(/\s+/).map(part => part[0]).slice(0, 2).join(""))}</i><div><span>${career?.label || ui("Kariyer profili", "Career profile")}</span><h3>${esc(player.name)}</h3><p>${player.editions?.length || 0} ${ui("edisyon", "editions")} · ${player.games} MP · ${teams.length} ${ui("takım", "teams")}</p></div></div><div class="metrics"><article><span>LIVE</span><b>${current?.rank ? `#${current.rank}` : "–"}</b><small>${current ? `${Number(current.ppg).toFixed(3)} PPG` : "FIFA 10"}</small></article><article><span>STANDING</span><b>${standing ? `#${standing.rank}` : "–"}</b><small>${standing ? `${standing.rating} · ${standing.tier.label}` : "–"}</small></article><article><span>LEGACY</span><b>${Number(player.legacy || 0).toFixed(1)}</b><small>${player.titles} TITLES</small></article><article><span>PRIME</span><b>${Number(player.prime?.score || 0).toFixed(1)}</b><small>FIFA ${player.prime?.startEdition || "–"}–${player.prime?.endEdition || "–"}</small></article></div></section>
    ${standing ? `<section class="v2-standing-identity"><header><div><span>STANDING IDENTITY</span><h3>${esc(standing.name)} · World #${standing.rank}</h3><p>${esc(standing.standing.why)}</p></div><button type="button" data-action="open-fpi-centre">${ui("Tam Standing dosyasını aç", "Open full Standing dossier")} ↗</button></header><div class="v2-standing-identity-metrics"><article><span>STANDING RATING</span><b>${standing.rating}</b><small>PEAK ${standing.peak} · FLOOR ${standing.floor}</small></article><article><span>STANDING INDEX</span><b>${standing.standing.index}</b><small>${standing.fpi.confidence}% ${standing.fpi.confidenceBand}</small></article><article><span>MOMENTUM SHIFT</span><b class="${standing.last5Change>=0?"positive":"negative"}">${signed(standing.last5Change)}</b><small>${standing.fpi.signal}</small></article><article><span>NEXT TARGET</span><b>${standing.standing.nextTarget ? `#${standing.rank-1}` : "LEADER"}</b><small>${esc(standing.standing.nextTarget?.name || ui("Liderliği koru", "Defend the lead"))}</small></article></div><div class="v2-standing-dna">${standingDna.map(component=>`<article><span>${esc(component.label)}</span><b>${Number(component.value).toFixed(0)}</b><i><em style="width:${component.value}%"></em></i></article>`).join("")}</div></section>` : ""}
    <section class="v2-player-detail-grid"><div><header><span>CAREER TIMELINE</span><h3>${ui("Kariyer evreleri", "Career states")}</h3></header><div class="v2-career-line">${(career?.segments || []).map(segment => `<article class="${segment.state}"><i></i><b>FIFA ${segment.edition}</b><span>${esc(segment.label)}</span><small>${Number(segment.score).toFixed(1)}</small></article>`).join("") || `<p>${ui("Kariyer evresi için daha fazla veri gerekiyor.", "More data is required for career states.")}</p>`}</div></div><div><header><span>RIVALRY</span><h3>${ui("En güçlü rekabetler", "Strongest rivalries")}</h3></header><div class="v2-rival-list">${rivals.map(row => { const opponent = normalize(row.playerA) === player.key ? row.playerB : row.playerA; return `<article><strong>${esc(opponent)}</strong><span>${row.matches} MP</span><b>${Number(row.heat || 0).toFixed(0)}</b></article>`; }).join("") || `<p>${ui("Rekabet verisi bekleniyor.", "Awaiting rivalry data.")}</p>`}</div></div></section>
    <section class="v2-player-history"><div><header><span>${ui("SON MAÇLAR", "RECENT MATCHES")}</span></header>${recent.map(entry => `<article><span>FIFA ${entry.edition} · ${Number(entry.stars || 0) || "–"}★</span><strong>${esc(entry.opponent)}</strong><b class="p${entry.points}">${entry.points === 3 ? "W" : entry.points === 1 ? "D" : "L"}</b><small>${entry.gf}–${entry.ga} · ${esc(entry.team || "–")}</small></article>`).join("")}</div><div><header><span>${ui("KULLANILAN TAKIMLAR", "USED TEAMS")}</span><b>${teams.length}</b></header><div>${teams.slice(0, 24).map(team => `<span>${esc(team)}</span>`).join("") || `<p>${ui("Takım kaydı bulunmuyor.", "No team records.")}</p>`}</div></div></section>
  </div>`;
}

  function renderRecords(mount) {
    const data = universeData(); const draw = currentDraw();
    const crown = evolution()?.linealCrown?.(data, draw) || {};
    const milestones = evolution()?.milestones?.(currentPayload(), draw, data) || { ledger: [], imminent: [] };
    const chases = evolution()?.recordChases?.(data, draw) || [];
    const leaders = [...(data.players || [])].sort((a, b) => b.legacy - a.legacy).slice(0, 10);
    mount.innerHTML = `<div class="v2-page">${routeNav("recordshub")}${modeBar(data, "recordshub")}${pageIntro("ALL-TIME UNIVERSE", ui("Rekorlar yalnız sayılmaz. Yaşar.", "Records are not just counted. They live."), ui("Şampiyonluklar, Lineal Crown, kilometre taşları ve tarihsel büyüklük aynı merkezde.", "Championships, the Lineal Crown, milestones and historical greatness in one centre."))}
      <section class="v2-crown-hero"><div><span>LINEAL FIFA CROWN</span><h3>${esc(crown.holder || "–")}</h3><p>${ui("Taç, sahibi resmî bir maç kaybettiğinde doğrudan rakibine geçer.", "The Crown transfers directly when its holder loses an official match.")}</p></div><article><span>${ui("SALTANAT", "REIGNS")}</span><b>${crown.reigns?.length || 0}</b></article><article><span>${ui("DEVİR", "TRANSFERS")}</span><b>${crown.transfers?.length || 0}</b></article><article><span>${ui("SAVUNMA", "DEFENCES")}</span><b>${crown.reigns?.at(-1)?.defenses || 0}</b></article></section>
      <section class="v2-record-layout"><div class="v2-legacy-board"><header><span>LEGACY INDEX</span><h3>${ui("Tarihsel ilk 10", "All-time top 10")}</h3></header>${leaders.map((player, index) => `<button type="button" data-v2-player-open="${esc(player.name)}"><i>${index + 1}</i><strong>${esc(player.name)}</strong><span>${player.titles} T</span><span>${player.games} MP</span><b>${Number(player.legacy || 0).toFixed(1)}</b></button>`).join("")}</div><div class="v2-record-cards"><header><span>LIVING RECORDS</span><h3>${ui("Aktif rekorlar", "Living records")}</h3></header>${(data.records || []).map(record => `<article><span>${esc(record.label)}</span><strong>${esc(record.player)}</strong><b>${esc(record.value)}</b></article>`).join("")}</div></section>
      <section class="v2-milestone-section"><header><div><span>LIVING MILESTONE CEREMONY</span><h3>${ui("Yaklaşan eşikler", "Milestones approaching")}</h3></div><b>${milestones.ledger.length} ${ui("tören", "ceremonies")}</b></header><div>${milestones.imminent.slice(0, 12).map(item => `<article><strong>${esc(item.player)}</strong><span>${esc(item.title)}</span><b>${item.current}/${item.target}</b><small>${item.distance} ${ui("kaldı", "to go")}</small></article>`).join("") || chases.slice(0, 6).map(row => `<article><strong>${esc(row.player.name)}</strong><span>${esc(row.nearest?.[0]?.label || "Record")}</span><b>${row.nearest?.[0]?.current || 0}/${row.nearest?.[0]?.target || 0}</b></article>`).join("")}</div></section>
    </div>`;
  }

  function renderMedia(mount) {
    const data = universeData();
    mount.innerHTML = `<div class="v2-page">${routeNav("mediahub")}${modeBar(data, "mediahub")}${pageIntro("MEDIA & BROADCAST", ui("Turnuvanın dış dünyaya açılan yüzü.", "The tournament's window to the world."), ui("Canlı yayın, Final Night, otomatik hikâyeler ve resmî çıktılar tek üretim merkezinde.", "Live broadcast, Final Night, automatic stories and official printouts in one production centre."))}
      <section class="v2-media-launcher"><button type="button" data-v2-open="broadcast"><i>OBS</i><div><span>LIVE BROADCAST</span><strong>${ui("Yayın sahneleri", "Broadcast scenes")}</strong><p>${ui("Puan tablosu, son sonuç, sıradaki maç ve alt bant.", "Standings, latest result, up next and lower third.")}</p></div><b>↗</b></button><button type="button" data-v2-open="finalnight"><i>FN</i><div><span>FINAL NIGHT</span><strong>${ui("Şampiyonluk gecesi", "Championship night")}</strong><p>${ui("Canlı seri, yolculuk ve şampiyon ekranları.", "Live series, journey and champion scenes.")}</p></div><b>↗</b></button><button type="button" data-v2-open="print"><i>PDF</i><div><span>PRINT CENTRE</span><strong>${ui("Resmî çıktılar", "Official printouts")}</strong><p>${ui("Fikstür, takım kuralları ve oyuncu pasaportları.", "Fixtures, team rules and player passports.")}</p></div><b>↗</b></button></section>
      <section class="v2-story-grid"><header><div><span>STORYLINE ENGINE</span><h3>${ui("Bugünün hikâyeleri", "Stories of the day")}</h3></div><button type="button" data-nav="intelligence">${ui("Medya fabrikasını aç", "Open Media Factory")} ↗</button></header><div>${(data.stories || []).slice(0, 8).map(story => `<article style="--accent:${esc(story.accent || "#67b8ff")}"><span>${esc(story.eyebrow)}</span><h4>${esc(story.title)}</h4><p>${esc(story.subtitle)}</p></article>`).join("")}</div></section>
    </div>`;
  }

  function renderAdmin(mount) {
    const data = universeData(); const draw = currentDraw();
    if (!app()?.isAdmin?.()) {
      mount.innerHTML = `<div class="v2-page">${routeNav("adminhub")}${modeBar(data, "adminhub")}<section class="v2-admin-gate"><i>◇</i><span>ADMIN COMMAND</span><h2>${ui("Yönetici yetkisi gerekli.", "Administrator access required.")}</h2><p>${ui("Sonuç girişi, veri denetimi ve turnuva kapatma işlemleri yalnız yetkili yöneticiye açıktır.", "Result entry, data audit and tournament closure are available only to an authorised administrator.")}</p><button type="button" data-action="open-admin-login">${ui("Yönetici girişi", "Administrator sign in")}</button></section></div>`;
      return;
    }
    const audit = evolution()?.integrity?.(currentPayload(), draw) || { score: 100, issues: [], counts: {} };
    const ordered = schedule(draw); const stage = stageInfo(draw);
    const missingTeams = completedMatches(draw).filter(match => !match.homeTeam || !match.awayTeam);
    mount.innerHTML = `<div class="v2-page">${routeNav("adminhub")}${modeBar(data, "adminhub")}${pageIntro("ADMIN · TODAY", ui("Bir bakışta bugünün işi.", "Today's work at a glance."), ui("Yalnız işlem gerektiren konular gösterilir. Analizler ve arşivler operasyon ekranını işgal etmez.", "Only actionable items are shown. Analytics and archives do not occupy the operating screen."), `<aside><strong>${stage.completed}/${stage.total}</strong><span>${esc(stage.label)}</span></aside>`)}
      ${adminToday(data, draw)}
      <section class="v2-admin-grid"><div class="v2-admin-queue"><header><span>${ui("ÖNERİLEN MAÇ SIRASI", "RECOMMENDED MATCH ORDER")}</span><b>${ordered.length}</b></header>${ordered.slice(0, 10).map((match, index) => `<button type="button" data-nav="seasonhub"><i>${String(index + 1).padStart(2, "0")}</i><div><strong>${esc(playerName(match.homeId, draw))} <em>VS</em> ${esc(playerName(match.awayId, draw))}</strong><span>${ui("Grup", "Group")} ${match.group} · ${match.stars}★ · ${esc(match.evolution?.why || "")}</span></div><b>${Number(match.evolution?.priority || 0).toFixed(0)}</b></button>`).join("") || `<p>${ui("Bekleyen grup maçı yok.", "No group match pending.")}</p>`}</div><div class="v2-admin-findings"><header><span>INTEGRITY SENTINEL</span><b>${Number(audit.score || 0).toFixed(0)}</b></header>${audit.issues.slice(0, 10).map(issue => `<article class="${issue.severity}"><i>${issue.severity.toUpperCase()}</i><div><strong>${esc(issue.title)}</strong><small>${esc(issue.detail)}</small></div></article>`).join("") || `<p>✓ ${ui("İşlem gerektiren veri sorunu bulunmuyor.", "No actionable data issue found.")}</p>`}${missingTeams.length ? `<footer>${missingTeams.length} ${ui("sonuçta kullanılan takım eksik.", "results have missing used teams.")}</footer>` : ""}</div></section>
      <section class="v2-admin-actions"><button type="button" data-nav="seasonhub"><i>10</i><strong>${ui("Sonuç ve fikstür", "Results and fixtures")}</strong><span>↗</span></button><button type="button" data-nav="backup"><i>⇩</i><strong>${ui("Veri ve yedek", "Data and backup")}</strong><span>↗</span></button><button type="button" data-nav="print"><i>▤</i><strong>${ui("Çıktı merkezi", "Print Centre")}</strong><span>↗</span></button><button type="button" data-v2-open="broadcast"><i>OBS</i><strong>${ui("Yayın merkezi", "Broadcast Hub")}</strong><span>↗</span></button></section>
    </div>`;
  }

  function renderView(route, mount) {
    if (!mount || !ROUTES.has(route)) return false;
    if (route === "dashboard") renderHome(mount);
    else if (route === "livehub") renderLive(mount);
    else if (route === "tournaments") renderTournaments(mount);
    else if (route === "playershub") renderPlayers(mount);
    else if (route === "recordshub") renderRecords(mount);
    else if (route === "mediahub") renderMedia(mount);
    else if (route === "adminhub") renderAdmin(mount);
    installListeners();
    document.body.dataset.v2Route = route;
    return true;
  }

  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    document.addEventListener("click", event => {
      const notificationsButton = event.target.closest?.("[data-v2-notifications]");
      if (notificationsButton) {
        notificationsOpen = !notificationsOpen;
        app()?.refreshView?.();
        return;
      }
      const modeButton = event.target.closest?.("[data-v2-mode]");
      if (modeButton) {
        const requested = modeButton.dataset.v2Mode;
        if (requested === "admin" && !app()?.isAdmin?.()) {
          app()?.toast?.(ui("Yönetici modu için yetkilendirme gerekli.", "Authorisation is required for Admin mode."), "info");
          document.querySelector('[data-action="open-admin-login"]')?.click();
          return;
        }
        mode = requested;
        localStorage.setItem("fifa-universe-v2-mode", mode);
        app()?.refreshView?.();
        return;
      }
      const playerButton = event.target.closest?.("[data-v2-player-open]");
      if (playerButton) {
        selectedPlayer = playerButton.dataset.v2PlayerOpen;
        mode = "player";
        localStorage.setItem("fifa-universe-v2-player", selectedPlayer);
        localStorage.setItem("fifa-universe-v2-mode", mode);
        app()?.navigate?.("playershub");
        return;
      }
      const external = event.target.closest?.("[data-v2-open]");
      if (external) {
        const targets = {
          broadcast: `fifa10-broadcast.html?fifa9build=${BUILD}&mode=standings&controls=1`,
          finalnight: `fifa10-final-night.html?fifa9build=${BUILD}&mode=journey&controls=1`,
          print: `fifa10-print-centre.html?fifa9build=${BUILD}`
        };
        const target = targets[external.dataset.v2Open];
        if (target) window.open(target, "_blank", "noopener,noreferrer");
      }
    });
    document.addEventListener("change", event => {
      if (event.target?.id !== "v2PlayerSelect") return;
      selectedPlayer = event.target.value;
      localStorage.setItem("fifa-universe-v2-player", selectedPlayer);
      app()?.refreshView?.();
    });
  }

  window.FIFA_UNIVERSE_V2 = {
    version: VERSION,
    build: BUILD,
    routes: [...ROUTES],
    renderView,
    getMode: () => safeMode(),
    setMode: next => {
      mode = next;
      localStorage.setItem("fifa-universe-v2-mode", mode);
      app()?.refreshView?.();
    }
  };
})();
