(() => {
  "use strict";

  const STATUS = Object.freeze({
    now: { label: "Şimdi müsait", icon: "●", tone: "green" },
    evening: { label: "Bu akşam müsait", icon: "◷", tone: "gold" },
    unavailable: { label: "Bugün uygun değil", icon: "×", tone: "red" },
    open: { label: "Maç teklifine açık", icon: "⚡", tone: "blue" }
  });

  let recordLeague = "all";
  let recordStars = "all";
  let availabilityRows = [];
  let availabilityLoading = false;
  let availabilityLoadedAt = 0;

  const ctx = () => window.FIFA_APP_CONTEXT;
  const cloud = () => window.FIFA_CLOUD;
  const esc = value => ctx()?.escapeHTML ? ctx().escapeHTML(String(value ?? "")) : String(value ?? "");
  const seasonLabel = edition => `FIFA${String(Number(edition) || 0).padStart(2, "0")}`;
  const canEdit = () => Boolean(ctx()?.canEdit?.());
  const complete = match => Number.isFinite(Number(match?.homeScore)) && Number.isFinite(Number(match?.awayScore));
  const playerName = (season, id) => season?.players?.find(item => item.id === id)?.name || "—";
  const leagueName = id => id === "premier" ? "Premier League" : "Championship";
  const formatDate = value => value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  function fixtures(season, leagueId, leg = null) {
    const list = season?.leagues?.[leagueId]?.fixtures || [];
    return leg == null ? list : list.filter(match => Number(match.leg) === Number(leg));
  }

  function legStats(season, leagueId, leg) {
    const ids = season?.leagues?.[leagueId]?.playerIds || [];
    const rows = ids.map(id => ({ id, name: playerName(season, id), p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, cleanSheets: 0 }));
    const map = new Map(rows.map(row => [row.id, row]));
    for (const match of fixtures(season, leagueId, leg)) {
      if (!complete(match)) continue;
      const home = map.get(match.homeId);
      const away = map.get(match.awayId);
      if (!home || !away) continue;
      const hs = Number(match.homeScore);
      const as = Number(match.awayScore);
      home.p += 1; away.p += 1;
      home.gf += hs; home.ga += as;
      away.gf += as; away.ga += hs;
      if (as === 0) home.cleanSheets += 1;
      if (hs === 0) away.cleanSheets += 1;
      if (hs > as) { home.w += 1; away.l += 1; home.pts += Number(season.settings?.pointsWin ?? 3); }
      else if (as > hs) { away.w += 1; home.l += 1; away.pts += Number(season.settings?.pointsWin ?? 3); }
      else { home.d += 1; away.d += 1; home.pts += Number(season.settings?.pointsDraw ?? 1); away.pts += Number(season.settings?.pointsDraw ?? 1); }
    }
    rows.forEach(row => row.gd = row.gf - row.ga);
    return rows;
  }

  function calculateAwards(season, leagueId, leg) {
    const rows = legStats(season, leagueId, leg);
    const performance = [...rows].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || b.w - a.w || a.name.localeCompare(b.name, "tr"))[0] || null;
    const goals = [...rows].sort((a, b) => b.gf - a.gf || b.gd - a.gd || b.pts - a.pts || a.name.localeCompare(b.name, "tr"))[0] || null;
    const defense = [...rows].sort((a, b) => a.ga - b.ga || b.cleanSheets - a.cleanSheets || b.gd - a.gd || b.pts - a.pts || a.name.localeCompare(b.name, "tr"))[0] || null;
    return { performance, goals, defense };
  }

  function storedAwards(season, leagueId, leg) {
    return season?.individualAwards?.[leagueId]?.[String(leg)] || null;
  }

  function awardSnapshot(row) {
    if (!row) return null;
    return { playerId: row.id, playerName: row.name, p: row.p, w: row.w, d: row.d, l: row.l, gf: row.gf, ga: row.ga, gd: row.gd, pts: row.pts, cleanSheets: row.cleanSheets };
  }

  async function finalizeAwards(season, leagueId, leg) {
    const matches = fixtures(season, leagueId, leg);
    if (!matches.length || !matches.every(complete)) {
      ctx()?.toast?.("Bu devredeki bütün maçlar tamamlanmadan ödüller kesinleştirilemez.", "error");
      return;
    }
    const calculated = calculateAwards(season, leagueId, leg);
    season.individualAwards ||= {};
    season.individualAwards[leagueId] ||= {};
    season.individualAwards[leagueId][String(leg)] = {
      performance: awardSnapshot(calculated.performance),
      goals: awardSnapshot(calculated.goals),
      defense: awardSnapshot(calculated.defense),
      finalizedAt: new Date().toISOString(),
      stars: Number(season.settings?.legs?.[Number(leg) - 1]?.stars || 0)
    };
    await ctx()?.saveState?.(true, true);
    ctx()?.toast?.(`${leagueName(leagueId)} ${leg}. devre bireysel ödülleri kesinleşti.`, "success");
    ctx()?.refreshView?.();
  }

  function awardCard(title, icon, row, detail, tone) {
    return `<article class="leg-award-card ${tone}"><div class="leg-award-icon">${icon}</div><span>${esc(title)}</span><strong>${esc(row?.playerName || row?.name || "Henüz belirlenmedi")}</strong><small>${row ? esc(detail(row)) : "Devrenin tamamlanması bekleniyor"}</small></article>`;
  }

  function renderAwards(season) {
    const blocks = ["premier", "championship"].map(leagueId => {
      const legs = (season.settings?.legs || []).map((leg, index) => {
        const legNo = index + 1;
        const matches = fixtures(season, leagueId, legNo);
        const done = matches.filter(complete).length;
        const isComplete = matches.length > 0 && done === matches.length;
        const stored = storedAwards(season, leagueId, legNo);
        const calculated = isComplete ? calculateAwards(season, leagueId, legNo) : { performance: null, goals: null, defense: null };
        const awards = stored || calculated;
        return `<section class="panel leg-award-block">
          <div class="leg-award-head"><div><div class="eyebrow">${esc(leagueName(leagueId).toUpperCase())}</div><h3>${esc(leg.label)} · ${leg.stars}★</h3><p>${done}/${matches.length || 0} maç tamamlandı</p></div><div class="leg-award-state ${stored ? "locked" : isComplete ? "ready" : "waiting"}">${stored ? "KESİNLEŞTİ" : isComplete ? "ÖDÜLLER HAZIR" : "DEVRE DEVAM EDİYOR"}</div></div>
          <div class="leg-award-grid">
            ${awardCard("Devrenin Oyuncusu", "★", awards.performance, row => `${row.pts} puan · ${row.w} galibiyet · ${row.gd >= 0 ? "+" : ""}${row.gd} averaj`, "performance")}
            ${awardCard("Gol Kralı", "⚽", awards.goals, row => `${row.gf} gol · ${row.gd >= 0 ? "+" : ""}${row.gd} averaj`, "goals")}
            ${awardCard("Defans Ödülü", "◆", awards.defense, row => `${row.ga} gol yedi · ${row.cleanSheets} gol yemeden maç`, "defense")}
          </div>
          ${canEdit() && isComplete ? `<div class="leg-award-actions"><button class="btn ${stored ? "btn-ghost" : "btn-gold"} btn-small" data-exp-action="finalize-awards" data-league="${leagueId}" data-leg="${legNo}">${stored ? "Ödülleri Yeniden Hesapla" : "Ödülleri Kesinleştir"}</button>${stored ? `<span>Son kayıt: ${formatDate(stored.finalizedAt)}</span>` : ""}</div>` : ""}
        </section>`;
      }).join("");
      return `<div class="leg-award-league"><div class="experience-section-title"><span>${leagueId === "premier" ? "♛" : "♜"}</span><div><h2>${esc(leagueName(leagueId))}</h2><p>Her devrenin sonunda üç bireysel ödül verilir.</p></div></div>${legs}</div>`;
    }).join("");

    const history = [];
    for (const s of ctx()?.getState?.()?.seasonSystem?.seasons || []) {
      for (const leagueId of ["premier", "championship"]) {
        for (const [leg, record] of Object.entries(s.individualAwards?.[leagueId] || {})) {
          for (const [type, label] of [["performance", "Devrenin Oyuncusu"], ["goals", "Gol Kralı"], ["defense", "Defans Ödülü"]]) {
            if (record?.[type]?.playerName) history.push({ edition: s.edition, leagueId, leg, type, label, player: record[type].playerName, stars: record.stars });
          }
        }
      }
    }
    return `<div class="season-experience-page"><section class="experience-hero awards"><div><div class="eyebrow">BİREYSEL ÖDÜLLER</div><h2>Devre Sonu Ödül Merkezi</h2><p>Ödüller sabit takvime göre değil, 4★, 4.5★ ve 5★ devrelerinin tamamlanmasına göre kesinleşir.</p></div><div class="experience-hero-badge"><strong>3</strong><span>ÖDÜL / DEVRE</span></div></section>${blocks}<section class="panel"><div class="panel-header"><div><h3 class="panel-title">Bireysel Ödül Arşivi</h3><div class="panel-subtitle">Kesinleştirilen ödüller oyuncu kariyerinde kalıcı olarak saklanır.</div></div><span class="badge">${history.length} KAYIT</span></div>${history.length ? `<div class="award-history-grid">${history.slice().sort((a,b)=>b.edition-a.edition || Number(b.leg)-Number(a.leg)).map(item=>`<article><span>${seasonLabel(item.edition)} · ${esc(leagueName(item.leagueId))} · ${item.leg}. Devre · ${item.stars}★</span><strong>${esc(item.player)}</strong><small>${esc(item.label)}</small></article>`).join("")}</div>` : `<div class="season-empty"><strong>Henüz kesinleşmiş ödül yok</strong><p>İlk devre tamamlandığında üç ödül burada arşivlenecek.</p></div>`}</section></div>`;
  }

  function allOfficialSeasons() {
    return (ctx()?.getState?.()?.seasonSystem?.seasons || []).filter(season => season.mode !== "test" && season.status !== "cancelled");
  }

  function selectedLeagueIds() {
    return recordLeague === "all" ? ["premier", "championship"] : [recordLeague];
  }

  function selectedMatches() {
    const result = [];
    for (const season of allOfficialSeasons()) {
      for (const leagueId of selectedLeagueIds()) {
        for (const match of fixtures(season, leagueId)) {
          if (!complete(match)) continue;
          if (recordStars !== "all" && Number(match.stars) !== Number(recordStars)) continue;
          result.push({ ...match, edition: season.edition, leagueId, homeName: playerName(season, match.homeId), awayName: playerName(season, match.awayId) });
        }
      }
    }
    return result;
  }

  function matchTime(match) {
    const parsed = Date.parse(match.playedAt || match.updatedAt || match.createdAt || "");
    return Number.isFinite(parsed) ? parsed : Number(match.edition || 0) * 100000 + Number(match.leg || 0) * 1000 + Number(match.round || 0) * 10;
  }

  function streakRecord(matches, predicate) {
    const byPlayer = new Map();
    for (const match of matches) {
      const hs = Number(match.homeScore), as = Number(match.awayScore);
      const homeResult = hs > as ? "W" : hs < as ? "L" : "D";
      const awayResult = as > hs ? "W" : as < hs ? "L" : "D";
      const label = `${seasonLabel(match.edition)} · ${leagueName(match.leagueId)} · ${match.stars}★`;
      if (!byPlayer.has(match.homeName)) byPlayer.set(match.homeName, []);
      if (!byPlayer.has(match.awayName)) byPlayer.set(match.awayName, []);
      byPlayer.get(match.homeName).push({ result: homeResult, time: matchTime(match), label });
      byPlayer.get(match.awayName).push({ result: awayResult, time: matchTime(match), label });
    }
    let best = null;
    for (const [name, events] of byPlayer.entries()) {
      events.sort((a,b)=>a.time-b.time);
      let current = 0, start = "";
      for (const event of events) {
        if (predicate(event.result)) {
          if (current === 0) start = event.label;
          current += 1;
          if (!best || current > best.value) best = { name, value: current, detail: start === event.label ? event.label : `${start} → ${event.label}` };
        } else { current = 0; start = ""; }
      }
    }
    return best;
  }

  function completedSegments() {
    const segments = [];
    for (const season of allOfficialSeasons()) {
      for (const leagueId of selectedLeagueIds()) {
        const all = fixtures(season, leagueId);
        const segment = recordStars === "all" ? all : all.filter(match => Number(match.stars) === Number(recordStars));
        if (!segment.length || !segment.every(complete)) continue;
        const rows = new Map();
        const add = id => {
          if (!rows.has(id)) rows.set(id, { name: playerName(season, id), p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0 });
          return rows.get(id);
        };
        segment.forEach(match => {
          const h=add(match.homeId), a=add(match.awayId), hs=Number(match.homeScore), as=Number(match.awayScore);
          h.p++;a.p++;h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
          if(hs>as){h.w++;a.l++;}else if(as>hs){a.w++;h.l++;}else{h.d++;a.d++;}
        });
        rows.forEach(row=>row.gd=row.gf-row.ga);
        segments.push({ edition: season.edition, leagueId, stars: recordStars, rows:[...rows.values()] });
      }
    }
    return segments;
  }

  function aggregateRecord(segments, key, direction = "max") {
    let best = null;
    for (const segment of segments) {
      for (const row of segment.rows) {
        if (!best || (direction === "max" ? row[key] > best.value : row[key] < best.value)) {
          best = { name: row.name, value: row[key], detail: `${seasonLabel(segment.edition)} · ${leagueName(segment.leagueId)}${recordStars !== "all" ? ` · ${recordStars}★` : ""}` };
        }
      }
    }
    return best;
  }

  function matchRecord(matches, mode) {
    let best = null;
    for (const match of matches) {
      const total = Number(match.homeScore) + Number(match.awayScore);
      const margin = Math.abs(Number(match.homeScore) - Number(match.awayScore));
      const value = mode === "goals" ? total : margin;
      if (!best || value > best.value) {
        best = { name: `${match.homeName} ${match.homeScore}–${match.awayScore} ${match.awayName}`, value, detail: `${seasonLabel(match.edition)} · ${leagueName(match.leagueId)} · ${match.stars}★` };
      }
    }
    return best;
  }

  function recordCard(title, icon, record, unit) {
    return `<article class="record-book-card"><div class="record-book-icon">${icon}</div><span>${esc(title)}</span><strong>${esc(record?.name || "Henüz kayıt yok")}</strong><b>${record ? `${record.value}${unit || ""}` : "—"}</b><small>${esc(record?.detail || "Tamamlanmış resmî maç bekleniyor")}</small></article>`;
  }

  function renderRecords() {
    const matches = selectedMatches();
    const segments = completedSegments();
    const records = [
      ["En Uzun Galibiyet Serisi", "↗", streakRecord(matches, result => result === "W"), " maç"],
      ["En Uzun Yenilgi Serisi", "↘", streakRecord(matches, result => result === "L"), " maç"],
      ["En Uzun Kaybetmeme Serisi", "∞", streakRecord(matches, result => result !== "L"), " maç"],
      ["En Uzun Kazanamama Serisi", "○", streakRecord(matches, result => result !== "W"), " maç"],
      [recordStars === "all" ? "Bir Sezonda En Fazla Gol" : `${recordStars}★ Devresinde En Fazla Gol`, "⚽", aggregateRecord(segments, "gf", "max"), " gol"],
      [recordStars === "all" ? "Bir Sezonda En Az Gol Yiyen" : `${recordStars}★ Devresinde En Az Gol Yiyen`, "◆", aggregateRecord(segments, "ga", "min"), " gol"],
      [recordStars === "all" ? "Bir Sezonda En Çok Galibiyet" : `${recordStars}★ Devresinde En Çok Galibiyet`, "✓", aggregateRecord(segments, "w", "max"), ""],
      [recordStars === "all" ? "Bir Sezonda En Çok Beraberlik" : `${recordStars}★ Devresinde En Çok Beraberlik`, "＝", aggregateRecord(segments, "d", "max"), ""],
      ["En Gollü Maç", "✦", matchRecord(matches, "goals"), " gol"],
      ["En Farklı Maç", "△", matchRecord(matches, "margin"), " fark"]
    ];
    return `<div class="season-experience-page"><section class="experience-hero records"><div><div class="eyebrow">LİG REKORLAR KİTABI</div><h2>Kalıcı Rekorlar Arşivi</h2><p>Premier League ve Championship tarihindeki tüm resmî lig maçları; genel, 4★, 4.5★ ve 5★ kategorilerinde karşılaştırılır.</p></div><div class="experience-hero-badge"><strong>${matches.length}</strong><span>FİLTRELENEN MAÇ</span></div></section><section class="panel record-filter-panel"><div><span>Lig</span><div class="record-filter-buttons"><button data-exp-action="record-league" data-value="all" class="${recordLeague === "all" ? "active" : ""}">Tüm Ligler</button><button data-exp-action="record-league" data-value="premier" class="${recordLeague === "premier" ? "active" : ""}">Premier</button><button data-exp-action="record-league" data-value="championship" class="${recordLeague === "championship" ? "active" : ""}">Championship</button></div></div><div><span>Takım Seviyesi</span><div class="record-filter-buttons"><button data-exp-action="record-stars" data-value="all" class="${recordStars === "all" ? "active" : ""}">Genel</button><button data-exp-action="record-stars" data-value="4" class="${recordStars === "4" ? "active" : ""}">4★</button><button data-exp-action="record-stars" data-value="4.5" class="${recordStars === "4.5" ? "active" : ""}">4.5★</button><button data-exp-action="record-stars" data-value="5" class="${recordStars === "5" ? "active" : ""}">5★</button></div></div></section><section class="record-book-grid">${records.map(item => recordCard(...item)).join("")}</section><section class="panel record-book-note"><strong>Rekor Kuralı</strong><p>Seriler, maç sonuçlarının sisteme kaydedilme sırasına göre hesaplanır. Sezonluk gol, savunma, galibiyet ve beraberlik rekorları yalnızca ilgili lig veya devre tamamen tamamlandığında resmî rekora dönüşür.</p></section></div>`;
  }

  async function refreshAvailability(force = false) {
    if (availabilityLoading || (!force && Date.now() - availabilityLoadedAt < 30000)) return;
    if (!cloud()?.isConfigured?.()) return;
    availabilityLoading = true;
    try {
      availabilityRows = await cloud().fetchAvailability();
      availabilityLoadedAt = Date.now();
    } catch (error) {
      ctx()?.toast?.(`Uygunluk panosu yüklenemedi: ${error.message}`, "error");
    } finally {
      availabilityLoading = false;
      if (ctx()?.getActiveView?.() === "seasonhub") ctx()?.refreshView?.();
    }
  }

  function availabilityStatusCard(row) {
    const meta = STATUS[row.status] || STATUS.unavailable;
    return `<article class="availability-player-card ${meta.tone}"><div class="availability-status-icon">${meta.icon}</div><div><strong>${esc(row.playerName)}</strong><span>${esc(meta.label)}</span>${row.note ? `<small>${esc(row.note)}</small>` : ""}</div><time>${formatDate(row.updatedAt)}</time></article>`;
  }

  function renderAvailability(season) {
    const configured = Boolean(cloud()?.isConfigured?.());
    const user = cloud()?.getUser?.();
    const profile = cloud()?.getPlayerProfile?.();
    if (configured && (!availabilityLoadedAt || Date.now() - availabilityLoadedAt > 30000) && !availabilityLoading) setTimeout(() => refreshAvailability(), 0);
    const playerOptions = (season?.players || []).filter(item => item.participating !== false && item.name).map(item => `<option value="${esc(item.name)}">${esc(item.name)}</option>`).join("");
    return `<div class="season-experience-page"><section class="experience-hero availability"><div><div class="eyebrow">OYUNCU UYGUNLUK PANOSU</div><h2>Kim Maça Hazır?</h2><p>Sabit maç takvimi kullanılmaz. Oyuncular kendi hesaplarıyla giriş yapıp o günkü müsaitlik durumlarını paylaşır.</p></div><button class="btn btn-ghost" data-exp-action="refresh-availability">Panoyu Yenile</button></section>${!configured ? `<section class="panel season-empty"><strong>Supabase bağlantısı gerekli</strong><p>Oyuncu üyeliği ve canlı uygunluk panosu için V39 SQL dosyasını çalıştırıp cloud-config.js bağlantısını tamamla.</p></section>` : ""}<section class="availability-board">${availabilityLoading && !availabilityRows.length ? `<div class="panel season-empty"><strong>Uygunluklar yükleniyor</strong></div>` : availabilityRows.length ? availabilityRows.sort((a,b)=>a.playerName.localeCompare(b.playerName,"tr")).map(availabilityStatusCard).join("") : `<div class="panel season-empty"><strong>Henüz durum paylaşılmadı</strong><p>Oyuncu hesapları bağlandığında pano burada dolacak.</p></div>`}</section>${configured && !user ? `<section class="panel member-login-panel"><div><div class="eyebrow">OYUNCU ÜYELİĞİ</div><h3>Oyuncu Giriş Merkezini Kullan</h3><p>E-posta hesabınla giriş yapmak veya kayıtlı oyuncu adını seçerek yeni hesap oluşturmak için özel oyuncu giriş sayfasını aç.</p></div><button class="btn btn-gold" data-nav="playeraccess">Oyuncu Girişine Git</button></section>` : ""}${configured && user && profile ? `<section class="panel availability-control"><div class="panel-header"><div><div class="eyebrow">${esc(profile.player_name)}</div><h3 class="panel-title">Uygunluk Durumum</h3><div class="panel-subtitle">Seçimin panoya anında yansır.</div></div><button class="btn btn-ghost btn-small" data-exp-action="member-signout">Çıkış Yap</button></div><div class="availability-status-buttons">${Object.entries(STATUS).map(([key,meta])=>`<button data-exp-action="set-availability" data-status="${key}" class="${availabilityRows.find(row=>row.userId===profile.user_id)?.status===key ? "active" : ""} ${meta.tone}"><b>${meta.icon}</b><span>${esc(meta.label)}</span></button>`).join("")}</div><label class="availability-note">Kısa not <input id="availabilityNote" maxlength="120" value="${esc(availabilityRows.find(row=>row.userId===profile.user_id)?.note || "")}" placeholder="Örn. 21.00 sonrası uygun"></label></section>` : ""}${configured && user && !profile && !canEdit() ? `<section class="panel season-empty"><strong>Oyuncu kimliği tamamlanmamış</strong><p>Kayıtlı FIFA09 oyuncuları arasından kendi adını seçerek hesabını tamamla.</p><button class="btn btn-gold" data-nav="playeraccess">Hesabı Tamamla</button><button class="btn btn-ghost" data-exp-action="member-signout">Çıkış Yap</button></section>` : ""}${configured && canEdit() ? `<section class="panel member-admin-panel"><div><div class="eyebrow">YÖNETİCİ</div><h3>Oyuncu Hesabı Bağla</h3><p>Önce Supabase Authentication bölümünde oyuncunun e-posta hesabını oluştur. Ardından aynı e-postayı oyuncu adıyla burada eşleştir.</p></div><form id="linkPlayerAccountForm"><label>Üye e-postası<input type="email" name="email" required></label><label>Oyuncu<select name="playerName" required><option value="">Oyuncu seç</option>${playerOptions}</select></label><button class="btn btn-gold" type="submit">Hesabı Bağla</button></form></section>` : ""}</div>`;
  }

  function playerAwards(name) {
    const key = String(name || "").trim().toLocaleLowerCase("tr-TR");
    const rows = [];
    for (const season of ctx()?.getState?.()?.seasonSystem?.seasons || []) {
      for (const leagueId of ["premier", "championship"]) {
        for (const [leg, record] of Object.entries(season.individualAwards?.[leagueId] || {})) {
          for (const [type, label] of [["performance", "Devrenin Oyuncusu"], ["goals", "Gol Kralı"], ["defense", "Defans Ödülü"]]) {
            const award = record?.[type];
            if (String(award?.playerName || "").trim().toLocaleLowerCase("tr-TR") !== key) continue;
            rows.push({ edition: season.edition, leagueId, leg: Number(leg), stars: record.stars, type, label, stats: award });
          }
        }
      }
    }
    return rows.sort((a,b)=>b.edition-a.edition || b.leg-a.leg);
  }

  function render(tab, season) {
    if (tab === "awards") return renderAwards(season);
    if (tab === "records") return renderRecords(season);
    if (tab === "availability") return renderAvailability(season);
    return "";
  }

  document.addEventListener("click", async event => {
    const action = event.target.closest("[data-exp-action]");
    if (!action) return;
    event.preventDefault();
    const type = action.dataset.expAction;
    const state = ctx()?.getState?.();
    const edition = Number(state?.seasonSystem?.activeEdition || 10);
    const season = state?.seasonSystem?.seasons?.find(item => Number(item.edition) === edition) || state?.seasonSystem?.seasons?.[0];
    if (type === "record-league") { recordLeague = action.dataset.value || "all"; ctx()?.refreshView?.(); return; }
    if (type === "record-stars") { recordStars = action.dataset.value || "all"; ctx()?.refreshView?.(); return; }
    if (type === "refresh-availability") { availabilityLoadedAt = 0; await refreshAvailability(true); return; }
    if (type === "member-signout") { await cloud()?.signOut?.(); availabilityLoadedAt = 0; ctx()?.toast?.("Oyuncu oturumu kapatıldı.", "success"); ctx()?.refreshView?.(); return; }
    if (type === "set-availability") {
      const note = document.querySelector("#availabilityNote")?.value?.trim() || "";
      try { await cloud()?.setAvailability?.(action.dataset.status, note); availabilityLoadedAt = 0; await refreshAvailability(true); ctx()?.toast?.("Uygunluk durumun güncellendi.", "success"); }
      catch (error) { ctx()?.toast?.(error.message, "error"); }
      return;
    }
    if (type === "finalize-awards") {
      if (!canEdit()) { ctx()?.toast?.("Ödülleri yalnızca yönetici kesinleştirebilir.", "error"); return; }
      await finalizeAwards(season, action.dataset.league, Number(action.dataset.leg));
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id === "linkPlayerAccountForm") {
      event.preventDefault();
      const data = new FormData(event.target);
      try {
        await cloud()?.linkPlayerAccount?.(String(data.get("email") || "").trim(), String(data.get("playerName") || "").trim());
        event.target.reset(); availabilityLoadedAt = 0; await refreshAvailability(true); ctx()?.toast?.("Oyuncu hesabı başarıyla bağlandı.", "success");
      } catch (error) { ctx()?.toast?.(error.message, "error"); }
    }
  });

  window.FIFA_SEASON_EXPERIENCE = { render, refreshAvailability, playerAwards, version: 39 };
})();
