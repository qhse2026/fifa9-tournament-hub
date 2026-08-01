(() => {
  "use strict";

  const VERSION = "3.1.2";
  const BUILD = "404000";
  const POLL_MS = 2000;
  let lastSignature = "";
  let watcher = 0;

  const app = () => window.FIFA_APP_CONTEXT || null;
  const engine = () => window.FIFA10_DRAW_ENGINE || null;
  const championship = () => window.FIFA_CHAMPIONSHIP_OS || null;
  const tr = (trText, enText) => window.FIFA_I18N?.language === "en" ? enText : trText;
  const esc = value => String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

  function participantMap(draw) {
    return new Map((draw?.participants || []).map(row => [String(row.id), row.name]));
  }

  function playerName(draw, id) {
    if (!id) return "";
    return participantMap(draw).get(String(id)) || "";
  }

  function ppg(value) {
    return Number(value || 0).toFixed(3);
  }

  function sourceLabel(source) {
    if (!source) return tr("Bekleniyor", "Pending");
    if (source.type === "seed") return `#${source.rank}`;
    const short = String(source.seriesId || "").replace("F10-", "");
    return source.type === "loser" ? `${tr("Kaybeden", "Loser")} ${short}` : `${tr("Kazanan", "Winner")} ${short}`;
  }

  function currentJourney(draw) {
    const stored = engine()?.championshipState?.();
    const os = championship();
    if (stored && stored.status && stored.status !== "preview" && os?.resolveJourney) {
      try { return os.resolveJourney(stored); } catch (_) {}
    }
    if (os?.createJourney) {
      try { return os.createJourney(draw); } catch (_) {}
    }
    return null;
  }

  function currentOutlook(draw) {
    try { return engine()?.qualificationOutlook?.(draw) || []; }
    catch (_) { return []; }
  }

  function renderPointsPulse(rows = [], draw = null) {
    if (!rows.length) return "";
    const items = rows.map((row, index) => {
      const rank = Number(row.rank || index + 1);
      return `<span class="ltm-points-item"><i>#${rank}</i><strong>${esc(row.name)}</strong><b>${ppg(row.ppg)} PPG</b></span>`;
    }).join("");
    const completed = (draw?.fixtures || []).filter(match => match.completed).length;
    const total = draw?.fixtures?.length || 78;
    return `<section class="ltm-points-pulse" aria-label="${tr("Mevcut turnuva puan ortalaması", "Current tournament points per game")}">
      <header><span><i></i> POINTS PULSE</span><strong>${tr("CURRENT TOURNAMENT TABLE", "CURRENT TOURNAMENT TABLE")}</strong><small>${completed}/${total} MP</small></header>
      <div class="ltm-points-viewport"><div class="ltm-points-track">${items}<div class="ltm-points-repeat" aria-hidden="true">${items}</div></div></div>
    </section>`;
  }

  function recentOfficialResults(draw = null, limit = 10) {
    if (!draw) return [];
    return (draw.fixtures || [])
      .filter(match => match.completed && Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)))
      .sort((a, b) => {
        const timeA = Date.parse(a.updatedAt || a.completedAt || a.playedAt || "") || 0;
        const timeB = Date.parse(b.updatedAt || b.completedAt || b.playedAt || "") || 0;
        if (timeB !== timeA) return timeB - timeA;
        return Number(b.sequence || b.round || 0) - Number(a.sequence || a.round || 0);
      })
      .slice(0, limit);
  }

  function renderResultsPulse(draw = null) {
    const matches = recentOfficialResults(draw, 10);
    if (!matches.length) return "";
    const items = matches.map((match, index) => {
      const home = playerName(draw, match.homeId) || match.homeName || tr("Oyuncu", "Player");
      const away = playerName(draw, match.awayId) || match.awayName || tr("Oyuncu", "Player");
      const number = Number(match.sequence || match.matchNo || match.round || 0);
      const label = number ? `#${number}` : `#${index + 1}`;
      return `<span class="ltm-results-item"><i>${label}</i><strong>${esc(home)}</strong><b>${Number(match.homeScore)}–${Number(match.awayScore)}</b><strong>${esc(away)}</strong></span>`;
    }).join("");
    return `<section class="ltm-results-pulse" aria-label="${tr("Oynanan son on resmî maç sonucu", "Last ten official match results")}">
      <header><span><i></i> RESULTS PULSE</span><strong>${tr("LAST 10 OFFICIAL RESULTS", "LAST 10 OFFICIAL RESULTS")}</strong><small>${matches.length}/10</small></header>
      <div class="ltm-results-viewport"><div class="ltm-results-track">${items}<div class="ltm-results-repeat" aria-hidden="true">${items}</div></div></div>
    </section>`;
  }

  function seriesSide(draw, series, side) {
    const id = side === "home" ? series?.homeId : series?.awayId;
    const source = side === "home" ? series?.homeSource : series?.awaySource;
    const name = playerName(draw, id);
    if (name) return `<strong>${esc(name)}</strong>`;
    return `<span>${esc(sourceLabel(source))}</span>`;
  }

  function seriesCard(draw, series, compact = false) {
    if (!series) return "";
    const status = series.status || "waiting";
    const score = series.bestOf === 1
      ? (series.matches?.[0]?.completed ? `${series.matches[0].homeScore}–${series.matches[0].awayScore}` : "")
      : ((series.homeWins || series.awayWins) ? `${series.homeWins || 0}–${series.awayWins || 0}` : "");
    return `<article class="ltm-series status-${esc(status)} ${compact ? "compact" : ""}" data-series="${esc(series.id)}">
      <header><span>${esc(series.label || series.id)}</span><em>${series.bestOf === 1 ? "ONE MATCH" : "BO3"}</em></header>
      <div>${seriesSide(draw, series, "home")}<b>${score || "VS"}</b>${seriesSide(draw, series, "away")}</div>
      <footer>${status === "completed" ? tr("TAMAMLANDI", "COMPLETE") : status === "live" ? tr("CANLI SERİ", "LIVE SERIES") : status === "ready" ? tr("HAZIR", "READY") : tr("BEKLİYOR", "WAITING")}</footer>
    </article>`;
  }

  function watchCard(row, outlook) {
    const state = outlook?.outlookState || (row.rank <= 4 ? "direct" : row.rank <= 12 ? "playin" : "eliminated");
    const label = outlook?.outlookLabel || (row.rank <= 4 ? "DIRECT QF" : row.rank <= 12 ? "PLAY-IN" : "OUT");
    return `<article class="ltm-watch-row path-${esc(state)}"><i>${row.rank}</i><strong>${esc(row.name)}</strong><b>${ppg(row.ppg)}</b><span>${esc(label)}</span></article>`;
  }

  function renderTournamentTree(rows = [], draw = null) {
    if (!rows.length || !draw) return "";
    const journey = currentJourney(draw);
    if (!journey?.rounds) return "";
    const outlook = currentOutlook(draw);
    const outlookMap = new Map(outlook.map(row => [String(row.id), row]));
    const completed = (draw.fixtures || []).filter(match => match.completed).length;
    const total = draw.fixtures?.length || 78;
    const official = journey.status === "official" || journey.status === "completed";
    const direct = rows.slice(0, 4);
    const playin = rows.slice(4, 12);
    const now = new Date().toLocaleTimeString(window.FIFA_I18N?.language === "en" ? "en-GB" : "tr-TR", { hour: "2-digit", minute: "2-digit" });

    return `<section class="ltm-tree-shell" data-live-table-tree>
      <header class="ltm-tree-head"><div><span><i></i> LIVE TOURNAMENT TREE</span><h3>${official ? tr("Resmî Championship Yolu", "Official Championship Path") : tr("Sezon şimdi bitse", "If the season ended now")}</h3><p>${official ? tr("Eşleşmeler kilitlendi. Sonuçlar geldikçe bracket otomatik ilerler.", "Seeds are locked. The bracket advances automatically as results arrive.") : tr("Mevcut sıralamaya göre Play-In ve çeyrek final yolu. Her puan tablosu değişiminde otomatik yeniden hesaplanır.", "Play-In and quarter-final path from the live table. It recalculates automatically whenever the standings change.")}</p></div><aside><b>${official ? tr("RESMÎ", "OFFICIAL") : tr("CANLI · GEÇİCİ", "LIVE · PROVISIONAL")}</b><span>${completed}/${total} MP</span><small>${tr("Son yenileme", "Last refresh")} ${now}</small><button type="button" data-nav="seasonhub">${tr("Turnuva Merkezi", "Tournament Centre")} ↗</button></aside></header>
      <div class="ltm-tree-layout">
        <div class="ltm-bracket" role="group" aria-label="${tr("Canlı turnuva ağacı", "Live tournament bracket")}">
          <section class="ltm-round playin"><header><span>01</span><div><strong>PLAY-IN</strong><small>5–12 · 6–11 · 7–10 · 8–9</small></div></header><div>${(journey.rounds.playin || []).map(series => seriesCard(draw, series)).join("")}</div></section>
          <section class="ltm-round qf"><header><span>02</span><div><strong>QUARTER FINAL</strong><small>${tr("İlk 4 doğrudan", "Top 4 direct")}</small></div></header><div>${(journey.rounds.quarterfinal || []).map(series => seriesCard(draw, series)).join("")}</div></section>
          <section class="ltm-round sf"><header><span>03</span><div><strong>SEMI FINAL</strong><small>BO3</small></div></header><div>${(journey.rounds.semifinal || []).map(series => seriesCard(draw, series, true)).join("")}</div></section>
          <section class="ltm-round final"><header><span>04</span><div><strong>GRAND FINAL</strong><small>5★</small></div></header><div>${(journey.rounds.final || []).map(series => seriesCard(draw, series, true)).join("")}${(journey.rounds.bronze || []).map(series => seriesCard(draw, series, true)).join("")}</div></section>
        </div>
        <aside class="ltm-qualification-watch"><header><span>QUALIFICATION WATCH</span><strong>${tr("Şu anki yol", "Current path")}</strong></header><div class="ltm-watch-block"><h4>DIRECT QF</h4>${direct.map(row => watchCard(row, outlookMap.get(String(row.id)))).join("")}</div><div class="ltm-watch-block"><h4>PLAY-IN</h4>${playin.map(row => watchCard(row, outlookMap.get(String(row.id)))).join("")}</div></aside>
      </div>
    </section>`;
  }

  function signature() {
    const draw = engine()?.drawState?.();
    const rows = engine()?.standings?.(draw) || [];
    if (!draw || !rows.length) return "";
    const standingsSig = rows.map(row => [row.id, row.rank, row.mp, row.pts, Number(row.ppg || 0).toFixed(6), Number(row.gdPerMatch || 0).toFixed(6)].join(":" )).join("|");
    const ko = engine()?.championshipState?.();
    return `${draw.updatedAt || ""}#${standingsSig}#${ko?.updatedAt || ko?.status || "preview"}`;
  }

  function requestRefresh() {
    const context = app();
    if (!context || context.getActiveView?.() !== "dashboard") return;
    const next = signature();
    if (!next) return;
    if (lastSignature && next !== lastSignature) context.refreshView?.();
    lastSignature = next;
  }

  function startWatcher() {
    if (watcher) return;
    const prime = () => { lastSignature = signature() || lastSignature; };
    setTimeout(prime, 800);
    watcher = window.setInterval(requestRefresh, POLL_MS);
    window.addEventListener("storage", requestRefresh);
    window.addEventListener("focus", requestRefresh);
    window.addEventListener("fifa-cloud-ready", requestRefresh);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) requestRefresh(); });
  }

  window.FIFA_LIVE_TABLE_MOTION = {
    version: VERSION,
    build: BUILD,
    renderPointsPulse,
    renderResultsPulse,
    renderTournamentTree,
    refresh: requestRefresh,
    startWatcher
  };

  startWatcher();
})();
