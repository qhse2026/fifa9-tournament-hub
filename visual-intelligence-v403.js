(() => {
  'use strict';

  const VERSION = '4.0.4';
  const BUILD = '572000';
  const ROOT_ID = 'vi402-root';
  const POLL_MS = 5000;
  let lastSignature = '';
  let busy = false;

  const app = () => window.FIFA_APP_CONTEXT || null;
  const intelligence = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const normalize = value => String(value || '').trim().toLocaleLowerCase('tr-TR')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const avg = values => {
    const clean = (values || []).map(Number).filter(Number.isFinite);
    return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
  };
  const pct = value => `${Number(value || 0).toFixed(0)}%`;

  function routeKey() {
    const raw = String(app()?.getActiveView?.() || document.body.dataset.v2Route || 'dashboard').toLowerCase();
    if (['dashboard', 'home'].includes(raw)) return 'dashboard';
    if (['playershub', 'players', 'player'].includes(raw)) return 'players';
    if (['alltime', 'recordshub', 'records'].includes(raw)) return 'alltime';
    if (['livehub', 'livematch', 'livestats'].includes(raw)) return 'live';
    if (['mediahub', 'media'].includes(raw)) return 'media';
    return 'other';
  }

  function selectedPlayerName() {
    const select = document.querySelector('#v2PlayerSelect');
    return String(select?.value || localStorage.getItem('fifa-universe-v2-player') || '').trim();
  }

  function cheapSignature() {
    const route = routeKey();
    let draw = null;
    try { draw = app()?.getFifa10Draw?.() || null; } catch (_) {}
    const fixtures = Array.isArray(draw?.fixtures) ? draw.fixtures : [];
    const completed = fixtures.filter(match => match.completed).length;
    const updated = draw?.updatedAt || fixtures.map(match => match.updatedAt || '').sort().at(-1) || '';
    return [route, selectedPlayerName(), completed, fixtures.length, updated, document.documentElement.lang || 'tr'].join('|');
  }

  function getBundle() {
    const context = app();
    if (!context || !intelligence()) return null;
    try {
      const state = context.getState?.() || {};
      const draw = context.getFifa10Draw?.() || null;
      const universe = intelligence().buildUniverse?.(state, draw) || { players: [], honours: [], rivalries: [], stories: [], matches: [] };
      const fpi = context.buildFpiAnalytics?.() || { players: [], summary: {}, records: [] };
      const alltime = context.buildAllTimeAnalytics?.() || { players: [], legacyTop10: [], records: {}, champions: [], rivalries: [], summary: {} };
      return { state, draw, universe, fpi, alltime };
    } catch (error) {
      console.warn('[Visual Intelligence V4.0.4] Data adapter skipped:', error);
      return null;
    }
  }

  function findPlayer(bundle, requestedName) {
    const name = requestedName || bundle?.fpi?.players?.[0]?.name || bundle?.universe?.players?.[0]?.name || '';
    const key = normalize(name);
    const universePlayer = (bundle.universe.players || []).find(row => normalize(row.name) === key) || bundle.universe.players?.[0] || null;
    const fpiPlayer = (bundle.fpi.players || []).find(row => normalize(row.name) === key) || bundle.fpi.players?.[0] || null;
    const alltimePlayer = (bundle.alltime.players || []).find(row => normalize(row.name) === key) || null;
    return { name: universePlayer?.name || fpiPlayer?.name || name || 'Oyuncu', universePlayer, fpiPlayer, alltimePlayer };
  }

  function playerMetrics(player) {
    const u = player.universePlayer || {};
    const f = player.fpiPlayer || {};
    const a = player.alltimePlayer || {};
    const attack = clamp(a.legacyBreakdown?.attack ?? (u.games ? (u.gf / u.games) / 4 * 100 : 50));
    const defense = clamp(a.legacyBreakdown?.defense ?? (u.games ? (3 - u.ga / u.games) / 3 * 100 : 50));
    const bigMatch = clamp(f.fpi?.pressureScore ?? (a.bigMatchGames ? a.bigMatchWins / a.bigMatchGames * 100 : 50));
    const consistency = clamp(f.fpi?.stabilityScore ?? 50);
    const momentum = clamp(f.fpi?.momentumScore ?? 50);
    const dominance = clamp(f.fpi?.dominanceScore ?? 50);
    const overall = Math.round(attack * .20 + defense * .20 + bigMatch * .18 + consistency * .14 + momentum * .13 + dominance * .15);
    const titleCount = Number(u.titles ?? a.titles ?? 0);
    const archetype = titleCount >= 2 && bigMatch >= 68 ? ['DYNASTY ENGINE', 'Kupa üretimi ve kritik maç etkisi birleşerek hanedan kimliği oluşturuyor.']
      : bigMatch >= 75 ? ['BIG MATCH HUNTER', 'Baskı seviyesi yükseldikçe daha değerli sonuç üretme eğiliminde.']
      : defense - attack >= 12 ? ['IRON WALL', 'Savunma güvenliği ve istikrar üzerinden rakibini tüketiyor.']
      : momentum >= 72 ? ['RISING SIGNAL', 'Form eğrisi yukarı yönlü; bir sonraki sıçrama için ivme taşıyor.']
      : ['BALANCED ARCHITECT', 'Hücum, savunma ve karar kalitesini dengeli bir kariyer profiline dönüştürüyor.'];
    const tier = overall >= 86 ? 'ICON' : overall >= 78 ? 'ELITE' : overall >= 70 ? 'CONTENDER' : overall >= 60 ? 'CHALLENGER' : 'RISING';
    return {
      attack, defense, bigMatch, consistency, momentum, dominance, overall, tier, titleCount,
      archetypeTitle: archetype[0], archetypeCopy: archetype[1],
      avgGF: Number(a.avgGoals ?? (u.games ? u.gf / u.games : 0)),
      avgGA: Number(a.gaPerGame ?? (u.games ? u.ga / u.games : 0)),
      games: Number(u.games ?? a.games ?? f.games ?? 0),
      rating: Number(f.rating ?? 1500), rank: Number(f.rank ?? 0), index: Number(f.standing?.index ?? f.fpi?.score ?? 0),
      legacy: Number(a.legacyRating ?? u.legacy ?? 0), prime: Number(u.prime?.score ?? 0)
    };
  }

  function currentRoot(create = false) {
    let root = document.getElementById(ROOT_ID);
    if (!root && create) {
      root = document.createElement('section');
      root.id = ROOT_ID;
      root.className = 'vi402-shell';
      root.setAttribute('aria-label', 'FIFA Universe Visual Intelligence');
      const view = document.getElementById('view');
      if (view) view.appendChild(root);
    }
    return root;
  }

  function removeRoot() {
    document.getElementById(ROOT_ID)?.remove();
    document.querySelectorAll('.vi402-museum-enhanced').forEach(el => el.classList.remove('vi402-museum-enhanced'));
  }

  function sectionHeader(kicker, title, copy, badge = '') {
    return `<header class="vi402-section-head"><div><span>${esc(kicker)}</span><h3>${esc(title)}</h3><p>${esc(copy)}</p></div>${badge ? `<b>${esc(badge)}</b>` : ''}</header>`;
  }

  function buildDashboard(bundle) {
    const fpiRows = (bundle.fpi.players || []).slice(0, 12);
    const honours = (bundle.universe.honours || []).filter(row => row.competition === 'oruc' && row.winner).sort((a, b) => Number(a.edition) - Number(b.edition));
    const stories = (bundle.universe.stories || []).slice(0, 4);
    const leader = fpiRows[0];
    const mover = bundle.fpi.summary?.mover;
    return `
      <div class="vi402-dashboard">
        ${sectionHeader('VISUAL INTELLIGENCE LAB', 'FIFA Universe V4.0 · Güvenli Görsel Katman', 'Mevcut çalışan siteyi değiştirmeden, gerçek uygulama verisini sinematik görsellere çevirir.', 'STABILITY CORE 4.0.4')}
        <div class="vi402-hero-grid">
          <article class="vi402-hero-card"><span>STANDING CROWN</span><strong>${esc(leader?.name || '—')}</strong><em>${leader ? `${leader.rating} Rating · World #${leader.rank}` : 'Veri bekleniyor'}</em></article>
          <article class="vi402-hero-card"><span>TOP MOVER</span><strong>${esc(mover?.name || '—')}</strong><em>${mover ? `${mover.last5Change >= 0 ? '+' : ''}${mover.last5Change} · ${mover.fpi?.signal || ''}` : 'Veri bekleniyor'}</em></article>
          <article class="vi402-hero-card"><span>HISTORY</span><strong>${bundle.alltime.summary?.matches || bundle.universe.matches?.length || 0} MP</strong><em>${bundle.alltime.summary?.editions || honours.length} edition · ${bundle.alltime.summary?.goals || 0} goals</em></article>
        </div>
        <div class="vi402-two-col">
          <section class="vi402-panel">
            ${sectionHeader('AI STORY CARDS', 'Günün anlatısı', 'Universe Intelligence motorunun ürettiği gerçek hikâye sinyalleri.')}
            <div class="vi402-story-grid">${stories.length ? stories.map(story => `<article style="--accent:${esc(story.accent || '#7bd6ff')}"><span>${esc(story.eyebrow || 'STORY')}</span><strong>${esc(story.title || '—')}</strong><p>${esc(story.subtitle || '')}</p></article>`).join('') : `<p class="vi402-empty">Hikâye verisi henüz oluşmadı.</p>`}</div>
          </section>
          <section class="vi402-panel">
            ${sectionHeader('DYNASTY MAP', 'Hanedan zaman çizgisi', 'Yalnız resmî honour kayıtları kullanılır; navigasyon metinleri veri kabul edilmez.')}
            <div class="vi402-dynasty">${dynastySvg(honours)}</div>
          </section>
        </div>
        <section class="vi402-panel">
          ${sectionHeader('PLAYER GALAXY', 'Oyuncu galaksisi', 'Node boyutu Standing Rating, merkez yakınlığı sıralama gücü; kaynak doğrudan Standing Intelligence motorudur.', 'LIVE DATA')}
          <div class="vi402-galaxy">${galaxySvg(fpiRows)}</div>
        </section>
      </div>`;
  }

  function buildPlayers(bundle) {
    const player = findPlayer(bundle, selectedPlayerName());
    const m = playerMetrics(player);
    const u = player.universePlayer || {};
    const f = player.fpiPlayer || {};
    const honours = (bundle.universe.honours || []).filter(row => row.competition === 'oruc');
    const editionHonours = new Map(honours.map(row => [Number(row.edition), row]));
    const editions = (u.editions || []).map(row => {
      const honour = editionHonours.get(Number(row.edition));
      const status = normalize(honour?.winner) === normalize(player.name) ? 'champion'
        : normalize(honour?.runnerUp) === normalize(player.name) ? 'runner'
        : normalize(honour?.third) === normalize(player.name) ? 'third' : 'standard';
      return { ...row, status };
    });
    const rivalries = (bundle.universe.rivalries || []).filter(row => [normalize(row.playerA), normalize(row.playerB)].includes(normalize(player.name)))
      .sort((a, b) => Number(b.heat || 0) - Number(a.heat || 0));
    const rival = rivalries[0];
    const rivalName = rival ? (normalize(rival.playerA) === normalize(player.name) ? rival.playerB : rival.playerA) : '—';
    return `
      <div class="vi402-player-lab">
        ${sectionHeader('LIVING PLAYER CARD', `${player.name} · Görsel Kimlik`, 'Player Passport verisi, Standing Intelligence ve All-Time motoru tek kartta birleşir.', `${m.tier} · OVR ${m.overall}`)}
        <div class="vi402-player-card-grid">
          <article class="vi402-living-card">
            <div class="vi402-overall">${m.overall}</div><span>${esc(m.tier)}</span>
            <h3>${esc(player.name)}</h3><p>${esc(m.archetypeTitle)}</p><small>${esc(m.archetypeCopy)}</small>
            <div class="vi402-mini"><b>World #${m.rank || '—'}</b><b>${m.rating} Rating</b><b>${m.titleCount} Titles</b></div>
          </article>
          <section class="vi402-dna-card">
            ${[['ATTACK',m.attack],['DEFENCE',m.defense],['BIG MATCH',m.bigMatch],['CONSISTENCY',m.consistency],['MOMENTUM',m.momentum],['DOMINANCE',m.dominance]].map(([label,value]) => `<article><span>${label}</span><i><em style="width:${clamp(value)}%"></em></i><b>${Number(value).toFixed(0)}</b></article>`).join('')}
            <div class="vi402-stat-six"><span>MP <b>${m.games}</b></span><span>GF/M <b>${m.avgGF.toFixed(2)}</b></span><span>GA/M <b>${m.avgGA.toFixed(2)}</b></span><span>INDEX <b>${m.index.toFixed(1)}</b></span><span>LEGACY <b>${m.legacy.toFixed(1)}</b></span><span>PRIME <b>${m.prime.toFixed(1)}</b></span></div>
          </section>
        </div>
        <section class="vi402-panel">
          ${sectionHeader('AI CAREER MOVIE TIMELINE', 'Kariyer filmi', 'Her node doğrudan oyuncunun edition kayıtlarından üretilir; şampiyonluk, ikincilik ve üçüncülük honour verisiyle işaretlenir.')}
          <div class="vi402-career-track">${editions.length ? editions.map(row => `<article class="${row.status}"><i></i><span>FIFA ${row.edition}</span><strong>${row.ppg?.toFixed?.(2) ?? '0.00'} PPG</strong><p>${row.games || 0} MP · ${row.gf || 0}-${row.ga || 0} goals</p><small>${row.status === 'champion' ? '🏆 CHAMPION' : row.status === 'runner' ? '🥈 RUNNER-UP' : row.status === 'third' ? '🥉 THIRD' : 'CAREER CHAPTER'}</small></article>`).join('') : `<p class="vi402-empty">Edition verisi bulunamadı.</p>`}</div>
        </section>
        <section class="vi402-panel vi402-rivalry">
          ${sectionHeader('AI RIVALRY POSTER', 'Poster seviyesinde rekabet', 'Heat, maç sayısı ve tarihsel denge doğrudan Rivalry Intelligence motorundan gelir.', rival ? `HEAT ${Number(rival.heat || 0).toFixed(0)}/100` : 'NO RIVALRY')}
          ${rival ? `<div class="vi402-versus"><div><span>PLAYER</span><strong>${esc(player.name)}</strong><small>${m.rating} Rating · #${m.rank || '—'}</small></div><b>VS</b><div><span>RIVAL</span><strong>${esc(rivalName)}</strong><small>${rival.matches} MP · ${rival.knockout || 0} pressure meetings</small></div></div><div class="vi402-rival-metrics"><span>Rivalry Heat <b>${Number(rival.heat || 0).toFixed(0)}</b></span><span>Meetings <b>${rival.matches}</b></span><span>Upsets <b>${rival.upsets || 0}</b></span></div>` : `<p class="vi402-empty">Bu oyuncu için yeterli rekabet verisi bulunmuyor.</p>`}
        </section>
      </div>`;
  }

  function recordRows(alltime) {
    const r = alltime.records || {};
    const rows = [];
    const push = (label, row, value) => { if (row) rows.push({ label, owner: row.name || row.winner || row.playerA || '—', value }); };
    push('En Fazla Şampiyonluk', r.titles, r.titles?.titles);
    push('En Fazla Final', r.finals, r.finals?.finals);
    push('En Fazla Galibiyet', r.wins, r.wins?.wins);
    push('En Fazla Gol', r.goals, r.goals?.gf);
    push('En İyi PPG', r.ppg, r.ppg?.ppg?.toFixed?.(3));
    push('En Sağlam Savunma', r.defense, r.defense?.gaPerGame?.toFixed?.(2));
    push('En Fazla Maç', r.matches, r.matches?.games);
    push('En İyi Averaj', r.goalDifference, r.goalDifference?.gd);
    push('En Yüksek Galibiyet %', r.winRate, r.winRate?.winRate?.toFixed?.(1));
    push('En Fazla Clean Sheet', r.cleanSheets, r.cleanSheets?.cleanSheets);
    if (r.biggestWin) rows.push({ label:'En Farklı Galibiyet', owner:r.biggestWin.winner, value:`${r.biggestWin.score} · +${r.biggestWin.margin}` });
    if (r.highestScoringMatch) rows.push({ label:'En Gollü Maç', owner:`${r.highestScoringMatch.homeName} vs ${r.highestScoringMatch.awayName}`, value:`${r.highestScoringMatch.score} · ${r.highestScoringMatch.totalGoals} goals` });
    if (r.topRivalry) rows.push({ label:'En Çok Oynanan Rekabet', owner:`${r.topRivalry.playerA} vs ${r.topRivalry.playerB}`, value:`${r.topRivalry.meetings} MP` });
    return rows;
  }

  function buildAllTime(bundle) {
    const records = recordRows(bundle.alltime);
    const immortals = (bundle.alltime.legacyTop10 || []).slice(0, 3);
    const galaxyRows = (bundle.fpi.players || []).slice(0, 12);
    return `
      <div class="vi402-alltime-lab">
        ${sectionHeader('VISUAL LEGACY INTELLIGENCE', 'Tarih artık görsel bir sistem', 'Tüm Zamanlar motorunun gerçek rekorları ve Legacy Rating sonuçları ayrı bir sinematik katmanda gösterilir.', 'ALL-TIME SAFE DATA')}
        <section class="vi402-panel">
          ${sectionHeader('RECORD WALL', 'Rekorların duvarı', 'Kartların tamamı buildAllTimeAnalytics() çıktısından gelir.')}
          <div class="vi402-record-grid">${records.map(row => `<article><span>${esc(row.label)}</span><strong>${esc(row.owner)}</strong><b>${esc(row.value)}</b></article>`).join('')}</div>
        </section>
        <section class="vi402-panel">
          ${sectionHeader('HALL OF IMMORTALS', 'Ölümsüzler salonu', 'Legacy Rating ilk üçü tarihsel vitrinde.')}
          <div class="vi402-immortal-grid">${immortals.map((row,index) => `<article><i>#${index+1}</i><strong>${esc(row.name)}</strong><b>${Number(row.legacyRating || 0).toFixed(1)}</b><p>${row.titles || 0} Titles · ${row.games || 0} MP · ${Number(row.ppg || 0).toFixed(3)} PPG</p></article>`).join('')}</div>
        </section>
        <section class="vi402-panel">
          ${sectionHeader('PLAYER GALAXY', 'All-Time yıldız haritası', 'Node verisi doğrudan Standing Intelligence sıralamasından alınır.')}
          <div class="vi402-galaxy">${galaxySvg(galaxyRows)}</div>
        </section>
      </div>`;
  }

  function buildMatchday(bundle, route) {
    const draw = bundle.draw || {};
    const participants = new Map((draw.participants || []).map(row => [String(row.id), row.name]));
    const fixtures = Array.isArray(draw.fixtures) ? draw.fixtures : [];
    const pending = fixtures.filter(match => !match.completed).sort((a,b) => Number(a.sequence || 0) - Number(b.sequence || 0));
    const completed = fixtures.filter(match => match.completed).sort((a,b) => Number(b.sequence || 0) - Number(a.sequence || 0));
    const next = pending[0];
    const latest = completed[0];
    const playerName = id => participants.get(String(id)) || '—';
    const gap = bundle.fpi.players?.[0] && bundle.fpi.players?.[1] ? bundle.fpi.players[0].rating - bundle.fpi.players[1].rating : null;
    const alerts = [];
    if (gap != null && gap <= 20) alerts.push(`CROWN PRESSURE · Liderlik farkı yalnız ${gap} Rating`);
    if (bundle.fpi.summary?.mover) alerts.push(`TOP MOVER · ${bundle.fpi.summary.mover.name} ${bundle.fpi.summary.mover.last5Change >= 0 ? '+' : ''}${bundle.fpi.summary.mover.last5Change}`);
    if (pending.length <= 10) alerts.push(`RUN-IN · Grup aşamasında yalnız ${pending.length} maç kaldı`);
    return `
      <div class="vi402-matchday-lab">
        ${sectionHeader(route === 'media' ? 'MATCHDAY VISUAL GENERATOR' : 'BROADCAST DIRECTOR', 'AI yayın katmanı', 'Gerçek FIFA 10 draw state üzerinden sıradaki maç, son sonuç ve yayın uyarıları görselleştirilir.', `${fixtures.length - pending.length}/${fixtures.length || 0} MP`)}
        <div class="vi402-match-grid">
          <article><span>UP NEXT</span><strong>${next ? `${esc(playerName(next.homeId))} vs ${esc(playerName(next.awayId))}` : 'Bekleyen maç yok'}</strong><p>${next ? `Group ${next.group || '—'} · ${next.stars || '—'}★` : 'Turnuva aşaması tamamlandı.'}</p></article>
          <article><span>LATEST RESULT</span><strong>${latest ? `${esc(playerName(latest.homeId))} ${latest.homeScore}-${latest.awayScore} ${esc(playerName(latest.awayId))}` : 'Sonuç bekleniyor'}</strong><p>${latest ? `Sequence ${latest.sequence || '—'}` : 'Henüz sonuç girilmedi.'}</p></article>
        </div>
        <div class="vi402-alerts">${alerts.length ? alerts.map(text => `<span>${esc(text)}</span>`).join('') : '<span>VISUAL DIRECTOR · Sistem güncel veriyi izliyor</span>'}</div>
      </div>`;
  }

  function dynastySvg(honours) {
    if (!honours.length) return `<p class="vi402-empty">Resmî honour verisi henüz oluşmadı.</p>`;
    const width = 900, height = 320, pad = 70;
    const min = Math.min(...honours.map(row => Number(row.edition))), max = Math.max(...honours.map(row => Number(row.edition)));
    const counts = honours.reduce((map,row) => (map.set(row.winner,(map.get(row.winner)||0)+1),map), new Map());
    const nodes = honours.map((row,index) => ({
      ...row,
      x: pad + ((Number(row.edition)-min)/Math.max(1,max-min))*(width-pad*2),
      y: 90 + (index%4)*52,
      count: counts.get(row.winner)||1
    }));
    const path = nodes.map((n,i) => `${i?'L':'M'} ${n.x} ${n.y}`).join(' ');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Dynasty Map"><path d="${path}" fill="none" stroke="rgba(126,163,255,.30)" stroke-width="3"/>${nodes.map(n => `<g transform="translate(${n.x} ${n.y})"><circle r="${12+n.count*3}" fill="${n.count>1?'#ffd877':'#7bd6ff'}"/><text y="-24" text-anchor="middle" fill="#8fb5ff" font-size="11">FIFA ${n.edition}</text><text y="32" text-anchor="middle" fill="#eef5ff" font-size="11">${esc(n.winner)}</text></g>`).join('')}</svg>`;
  }

  function galaxySvg(rows) {
    if (!rows.length) return `<p class="vi402-empty">Standing verisi henüz oluşmadı.</p>`;
    const width = 980, height = 380, cx = width/2, cy = height/2;
    const maxRating = Math.max(...rows.map(row => Number(row.rating || 1500)));
    const minRating = Math.min(...rows.map(row => Number(row.rating || 1500)));
    const span = Math.max(1,maxRating-minRating);
    const nodes = rows.map((row,index) => {
      const norm = (Number(row.rating||1500)-minRating)/span;
      const angle = Math.PI*2*index/Math.max(rows.length,8)-Math.PI/2;
      const radius = 70 + (1-norm)*115 + (index%3)*8;
      return { row, x:cx+Math.cos(angle)*radius, y:cy+Math.sin(angle)*radius*.62, r:12+norm*15 };
    });
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Player Galaxy"><circle cx="${cx}" cy="${cy}" r="36" fill="rgba(255,216,119,.12)" stroke="rgba(255,216,119,.38)"/><text x="${cx}" y="${cy+4}" text-anchor="middle" fill="#fff" font-size="12">CROWN</text>${nodes.map((n,i) => `<line x1="${cx}" y1="${cy}" x2="${n.x}" y2="${n.y}" stroke="rgba(126,163,255,.12)"/>`).join('')}${nodes.map((n,i)=>`<g transform="translate(${n.x} ${n.y})"><circle r="${n.r}" fill="${i===0?'#ffd877':i===1?'#7bd6ff':'#946cff'}"/><text y="${n.r+18}" text-anchor="middle" fill="#edf4ff" font-size="11">${esc(n.row.name)}</text><text y="${n.r+31}" text-anchor="middle" fill="#8fb3e8" font-size="9">${n.row.rating} · #${n.row.rank}</text></g>`).join('')}</svg>`;
  }

  function render(force = false) {
    if (busy) return;
    // Visual intelligence is presentation-only: never touch the page during operational input.
    if (document.getElementById("f10DrawModal") || document.querySelector(".modal-backdrop:not(.hidden)")) return;
    if (window.FIFA10_DRAW_ENGINE?.isBusy?.()) return;
    const route = routeKey();
    if (route === 'other') { removeRoot(); return; }
    const expected = document.getElementById(ROOT_ID);
    const signature = cheapSignature();
    if (!force && signature === lastSignature && expected) return;
    busy = true;
    try {
      const bundle = getBundle();
      if (!bundle) return;
      lastSignature = signature;
      removeRoot();
      const root = currentRoot(true);
      if (!root) return;
      root.dataset.route = route;
      if (route === 'dashboard') root.innerHTML = buildDashboard(bundle);
      else if (route === 'players') {
        root.innerHTML = buildPlayers(bundle);
        document.querySelector('.v2-player-museum')?.classList.add('vi402-museum-enhanced');
      }
      else if (route === 'alltime') root.innerHTML = buildAllTime(bundle);
      else if (route === 'live' || route === 'media') root.innerHTML = buildMatchday(bundle, route);
    } finally {
      busy = false;
    }
  }

  function boot() {
    if (window.__FIFA_VISUAL_INTELLIGENCE_V402__) return;
    window.__FIFA_VISUAL_INTELLIGENCE_V402__ = true;
    document.documentElement.dataset.visualIntelligence = VERSION;
    setTimeout(() => render(true), 350);
    setInterval(() => render(false), POLL_MS);
    window.addEventListener('storage', () => render(true));
    window.addEventListener('focus', () => render(false));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})();
