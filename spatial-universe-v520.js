(() => {
  'use strict';

  const VERSION = '5.2.0';
  const BUILD = '520000';
  const STATE_KEY = 'fifa-spatial-universe-v520';
  const PLAYER_KEY = 'fifa-universe-v2-player';
  const SCENES = ['core', 'museum', 'galaxy', 'compare', 'dynasty', 'records'];
  const app = () => window.FIFA_APP_CONTEXT || null;
  const drawEngine = () => window.FIFA10_DRAW_ENGINE || null;
  const universeEngine = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const isTR = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');

  const persisted = (() => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  })();

  const state = {
    open: false,
    scene: SCENES.includes(persisted.scene) ? persisted.scene : 'core',
    museumPlayer: persisted.museumPlayer || localStorage.getItem(PLAYER_KEY) || '',
    galaxyPlayer: persisted.galaxyPlayer || localStorage.getItem(PLAYER_KEY) || '',
    compareA: persisted.compareA || '',
    compareB: persisted.compareB || '',
    rx: -8,
    ry: 0,
    zoom: 0,
    cinematic: false,
    cinematicIndex: 0,
    cinematicTimer: null,
    renderToken: 0
  };

  const normalize = value => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
  const num = value => Number(value || 0);
  const pct = value => `${clamp(value).toFixed(0)}%`;
  const fmt = (value, digits = 1) => Number(value || 0).toLocaleString(isTR() ? 'tr-TR' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const initials = name => String(name || '?').split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase('tr-TR');

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({
        scene: state.scene,
        museumPlayer: state.museumPlayer,
        galaxyPlayer: state.galaxyPlayer,
        compareA: state.compareA,
        compareB: state.compareB
      }));
    } catch (_) {}
  }

  function getData() {
    const ctx = app();
    const draw = ctx?.getFifa10Draw?.() || null;
    let allTime = { players: [], eligiblePlayers: [], records: {}, rivalries: [], summary: {}, highestScoringDraws: [], highestScoringMatches: [], biggestWins: [] };
    let fpi = { players: [], summary: {} };
    let universe = { players: [], playerMap: new Map(), honours: [], editions: [], rivalries: [], records: [], stories: [], matches: [] };
    let standings = [];
    let matches = [];
    try { allTime = ctx?.buildAllTimeAnalytics?.() || allTime; } catch (_) {}
    try { fpi = ctx?.buildFpiAnalytics?.() || fpi; } catch (_) {}
    try { universe = universeEngine()?.buildUniverse?.(ctx?.getState?.(), draw) || universe; } catch (_) {}
    try { standings = drawEngine()?.standings?.(draw) || []; } catch (_) {}
    try { matches = ctx?.buildUnifiedAllTimeMatches?.() || []; } catch (_) {}
    return { ctx, draw, allTime, fpi, universe, standings, matches };
  }

  function playerNames(data) {
    const names = new Set();
    (data.universe.players || []).forEach(row => row?.name && names.add(row.name));
    (data.allTime.players || []).forEach(row => row?.name && names.add(row.name));
    (data.fpi.players || []).forEach(row => row?.name && names.add(row.name));
    return [...names].sort((a, b) => a.localeCompare(b, 'tr'));
  }

  function playerInfo(name, data) {
    const key = normalize(name);
    if (!key) return null;
    const universe = (data.universe.players || []).find(row => normalize(row.name) === key) || null;
    const all = (data.allTime.players || []).find(row => normalize(row.name) === key) || null;
    const fpi = (data.fpi.players || []).find(row => normalize(row.name) === key) || null;
    const current = (data.standings || []).find(row => normalize(row.name) === key) || null;
    if (!universe && !all && !fpi && !current) return null;
    return { name: universe?.name || all?.name || fpi?.name || current?.name || name, universe, all, fpi, current };
  }

  function preferredPlayer(data) {
    const stored = state.museumPlayer || state.galaxyPlayer || localStorage.getItem(PLAYER_KEY) || '';
    if (stored && playerInfo(stored, data)) return playerInfo(stored, data).name;
    return data.universe.players?.[0]?.name || data.allTime.players?.[0]?.name || data.fpi.players?.[0]?.name || '';
  }

  function setContextPlayer(name) {
    if (!name) return;
    state.museumPlayer = name;
    state.galaxyPlayer = name;
    try { localStorage.setItem(PLAYER_KEY, name); } catch (_) {}
    saveState();
  }

  function navigate(route, callback) {
    const ctx = app();
    if (!ctx?.navigate) return false;
    close();
    ctx.navigate(route);
    if (typeof callback === 'function') setTimeout(callback, 650);
    return true;
  }

  function openPassport(name) {
    if (!name) return;
    setContextPlayer(name);
    navigate('playershub', () => {
      const select = document.querySelector('#v2PlayerSelect');
      if (select) {
        select.value = name;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  function latestResult(data) {
    const rows = (data.matches || []).filter(row => Number.isFinite(Number(row.homeScore)) && Number.isFinite(Number(row.awayScore)));
    return rows[rows.length - 1] || null;
  }

  function currentTournamentProgress(data) {
    const fixtures = data.draw?.fixtures || [];
    const completed = fixtures.filter(row => row.completed || (Number.isFinite(Number(row.homeScore)) && Number.isFinite(Number(row.awayScore)))).length;
    return { completed, total: fixtures.length || 0 };
  }

  function recordsForPlayer(info, data) {
    if (!info) return [];
    const key = normalize(info.name);
    const records = data.allTime.records || {};
    const medals = [];
    const add = (label, value, detail, symbol) => medals.push({ label, value, detail, symbol });
    const holder = row => row && normalize(row.name || row.player || row.winner || '') === key;
    const defs = [
      ['titles', isTR() ? 'En Çok Şampiyonluk' : 'Most Titles', row => `${row.titles} TITLES`, '♛'],
      ['finals', isTR() ? 'En Çok Final' : 'Most Finals', row => `${row.finals} FINALS`, '◆'],
      ['wins', isTR() ? 'En Çok Galibiyet' : 'Most Wins', row => `${row.wins} WINS`, 'W'],
      ['goals', isTR() ? 'En Çok Gol' : 'Most Goals', row => `${row.gf} GOALS`, 'GF'],
      ['ppg', isTR() ? 'En İyi PPG' : 'Best PPG', row => `${fmt(row.ppg, 2)} PPG`, 'PPG'],
      ['defense', isTR() ? 'En İyi Savunma' : 'Best Defence', row => `${fmt(row.gaPerGame, 2)} GA/M`, 'DEF'],
      ['matches', isTR() ? 'En Çok Maç' : 'Most Matches', row => `${row.games} MP`, 'MP'],
      ['goalDifference', isTR() ? 'En İyi Averaj' : 'Best Goal Difference', row => `${row.gd > 0 ? '+' : ''}${row.gd}`, 'GD'],
      ['winRate', isTR() ? 'En Yüksek Galibiyet Oranı' : 'Best Win Rate', row => `${fmt(row.winRate, 1)}%`, 'W%'],
      ['cleanSheets', isTR() ? 'En Çok Clean Sheet' : 'Most Clean Sheets', row => `${row.cleanSheets} CS`, 'CS']
    ];
    defs.forEach(([id, label, valueFn, symbol]) => { const row = records[id]; if (holder(row)) add(label, valueFn(row), `${row.games || ''} MP`.trim(), symbol); });
    const eligible = data.allTime.eligiblePlayers || [];
    const streaks = [
      ['longestWinStreak', isTR() ? 'En Uzun Galibiyet Serisi' : 'Longest Win Streak', 'W'],
      ['longestUnbeatenStreak', isTR() ? 'En Uzun Yenilmezlik' : 'Longest Unbeaten', 'U'],
      ['longestScoringStreak', isTR() ? 'En Uzun Gol Serisi' : 'Longest Scoring Streak', 'GF'],
      ['longestCleanSheetStreak', isTR() ? 'En Uzun Clean Sheet Serisi' : 'Longest Clean-Sheet Streak', 'CS']
    ];
    streaks.forEach(([metric, label, symbol]) => {
      const leader = [...eligible].filter(row => Number.isFinite(num(row[metric]))).sort((a, b) => num(b[metric]) - num(a[metric]) || num(b.games) - num(a.games))[0];
      if (holder(leader)) add(label, `${leader[metric]} ${isTR() ? 'MAÇ' : 'MATCHES'}`, `${leader.games} MP`, symbol);
    });
    if (records.biggestWin && normalize(records.biggestWin.winner) === key) add(isTR() ? 'En Farklı Galibiyet' : 'Biggest Win', records.biggestWin.score, `${records.biggestWin.editionLabel || ''} · ${records.biggestWin.stage || ''}`, '↗');
    if (records.highestScoringMatch && [records.highestScoringMatch.homeName, records.highestScoringMatch.awayName].some(name => normalize(name) === key)) add(isTR() ? 'En Gollü Maç' : 'Highest-Scoring Match', records.highestScoringMatch.score, `${records.highestScoringMatch.totalGoals} ${isTR() ? 'gol' : 'goals'}`, '◎');
    const highDraw = data.allTime.highestScoringDraws?.[0];
    if (highDraw && [highDraw.homeName, highDraw.awayName].some(name => normalize(name) === key)) add(isTR() ? 'En Gollü Beraberlik' : 'Highest-Scoring Draw', highDraw.score, `${highDraw.totalGoals} ${isTR() ? 'gol' : 'goals'}`, '=');
    if (records.topRivalry && [records.topRivalry.playerA, records.topRivalry.playerB].some(name => normalize(name) === key)) add(isTR() ? 'En Çok Oynanan Rekabet' : 'Most-Played Rivalry', `${records.topRivalry.meetings} MP`, `${records.topRivalry.playerA} vs ${records.topRivalry.playerB}`, '∞');
    return medals;
  }

  function museumHonours(info, data) {
    const key = normalize(info?.name);
    const honours = (data.universe.honours || []).filter(row => row.competition === 'oruc');
    return {
      titles: honours.filter(row => normalize(row.winner) === key),
      runnerUps: honours.filter(row => normalize(row.runnerUp) === key),
      thirds: honours.filter(row => normalize(row.third) === key)
    };
  }

  function sceneHeading(kicker, title, text, stat, statLabel) {
    return `<header class="su-scene-heading"><div><span>${esc(kicker)}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div><aside><b>${esc(stat)}</b><small>${esc(statLabel)}</small></aside></header>`;
  }

  function corePlanets(data) {
    const recent = latestResult(data);
    const tournamentLeader = data.standings?.[0];
    const standingLeader = data.fpi.summary?.leader || data.fpi.players?.[0];
    const progress = currentTournamentProgress(data);
    const allLeader = data.universe.players?.[0];
    return [
      { scene:'museum', icon:'♛', title:'TROPHY MUSEUM', sub:allLeader ? `${allLeader.name} · ${allLeader.titles || 0} ${isTR() ? 'kupa' : 'titles'}` : (isTR()?'Kupa salonu':'Trophy hall'), value:`${(data.universe.honours || []).filter(row => row.winner).length} HONOURS`, x:-385,y:-175,z:-80 },
      { scene:'galaxy', icon:'✦', title:'PLAYER GALAXY', sub:`${data.universe.players?.length || data.allTime.players?.length || 0} ${isTR()?'oyuncu · yaşayan ağ':'players · living network'}`, value:standingLeader ? `#${standingLeader.rank} ${standingLeader.name}` : 'GALAXY', x:0,y:-258,z:85 },
      { scene:'compare', icon:'VS', title:'COMPARISON CHAMBER', sub:isTR()?'İki kariyeri boyut boyut karşılaştır':'Compare two careers dimension by dimension', value:'DUEL', x:380,y:-168,z:-40 },
      { scene:'dynasty', icon:'10', title:'DYNASTY CORRIDOR', sub:isTR()?'FIFA01 → FIFA10 şampiyonluk hattı':'FIFA01 → FIFA10 championship lineage', value:`${data.universe.editions?.length || 10} ERAS`, x:430,y:75,z:90 },
      { scene:'records', icon:'◆', title:'RECORD VAULT', sub:data.allTime.records?.titles ? `${data.allTime.records.titles.name} · ${data.allTime.records.titles.titles} ${isTR()?'şampiyonluk':'titles'}` : (isTR()?'Tüm zamanlar kasası':'All-time vault'), value:`${data.allTime.summary?.matches || data.matches.length || 0} MP`, x:250,y:250,z:-70 },
      { route:'seasonhub', icon:'F10', title:'FIFA 10 LIVE', sub:tournamentLeader ? `${tournamentLeader.name} · ${fmt(tournamentLeader.ppg,3)} PPG` : (isTR()?'Aktif sezon':'Active season'), value:progress.total ? `${progress.completed}/${progress.total}` : 'LIVE', x:-10,y:298,z:95 },
      { route:'livehub', icon:'●', title:'LIVE ARENA', sub:recent ? `${recent.homeName || recent.home} ${recent.homeScore}-${recent.awayScore} ${recent.awayName || recent.away}` : (isTR()?'Sonuç bekleniyor':'Awaiting results'), value:isTR()?'SON 10':'LAST 10', x:-300,y:240,z:-30 },
      { route:'alltime', icon:'Σ', title:'ALL-TIME ELITE', sub:isTR()?'Klasik tablo ve detaylı rekor merkezi':'Classic table and detailed records', value:'DATA', x:-445,y:58,z:70 }
    ];
  }

  function renderCore(data) {
    const root = document.querySelector('#suSceneCore');
    if (!root) return;
    const standingLeader = data.fpi.summary?.leader || data.fpi.players?.[0];
    const planets = corePlanets(data);
    root.innerHTML = `<div class="su-scene-inner">
      ${sceneHeading('SPATIAL COMMAND UNIVERSE', isTR()?'FIFA Evrenine Gir':'Enter the FIFA Universe', isTR()?'Klasik menü artık yalnızca yedek kapı. Müzeye, galaksiye, rekabet odasına, hanedan koridoruna ve rekor kasasına uzaysal olarak geç.':'The classic menu is now only a fallback gate. Move spatially through the museum, galaxy, duel chamber, dynasty corridor and record vault.', `V${VERSION}`, 'SPATIAL BUILD')}
      <div class="su-core-stage" id="suCoreStage"><div class="su-core-grid"></div><div class="su-core-world" id="suCoreWorld">
        <div class="su-orbit o1"></div><div class="su-orbit o2"></div><div class="su-orbit o3"></div>
        <div class="su-core-sun"><div><span>INFANTINO VISUAL AI</span><strong>FIFA UNIVERSE<br>V5.2</strong><small>${standingLeader ? `${standingLeader.name} · Standing #${standingLeader.rank}` : 'SPATIAL CORE ONLINE'}</small></div></div>
        ${planets.map(node => `<button type="button" class="su-planet" ${node.scene ? `data-su-scene="${node.scene}"` : `data-su-route="${node.route}"`} style="transform:translate3d(${node.x}px,${node.y}px,${node.z}px)"><i>${esc(node.icon)}</i><strong>${esc(node.title)}</strong><small>${esc(node.sub)}</small><b>${esc(node.value)}</b></button>`).join('')}
      </div><div class="su-core-hud"><div><span>${isTR()?'Sürükle · Evreni döndür':'Drag · Rotate universe'}</span><span>${isTR()?'Tekerlek · Yaklaş/Uzaklaş':'Wheel · Zoom'}</span></div><div><span>ESC · ${isTR()?'Kapat':'Close'}</span><span>C · CINEMATIC TOUR</span></div></div></div>
    </div>`;
    const world = document.querySelector('#suCoreWorld');
    if (world) { world.style.setProperty('--su-rx', `${state.rx}deg`); world.style.setProperty('--su-ry', `${state.ry}deg`); world.style.setProperty('--su-z', `${state.zoom}px`); }
    bindCoreDrag();
  }

  function renderMuseum(data) {
    const root = document.querySelector('#suSceneMuseum');
    if (!root) return;
    const names = playerNames(data);
    const selectedName = playerInfo(state.museumPlayer, data)?.name || preferredPlayer(data) || names[0] || '';
    state.museumPlayer = selectedName;
    const info = playerInfo(selectedName, data);
    if (!info) { root.innerHTML = `<div class="su-error">${isTR()?'Oyuncu verisi bulunamadı.':'Player data not available.'}</div>`; return; }
    const honours = museumHonours(info, data);
    const medals = recordsForPlayer(info, data);
    const uni = info.universe || {};
    const all = info.all || {};
    const standing = info.fpi || {};
    const trophyHtml = (rows, type) => rows.length ? rows.map(row => `<div class="su-trophy ${type}"><div class="su-cup">${type==='gold'?'🏆':type==='silver'?'🥈':'🥉'}</div><div class="su-plinth"><strong>FIFA ${row.edition}</strong><small>${type==='gold'?(isTR()?'ŞAMPİYON':'CHAMPION'):type==='silver'?(isTR()?'FİNALİST':'RUNNER-UP'):(isTR()?'ÜÇÜNCÜ':'THIRD')}</small></div></div>`).join('') : `<div class="su-empty-display">${isTR()?'Bu vitrinde henüz kayıt yok.':'No entry in this showcase yet.'}</div>`;
    root.innerHTML = `<div class="su-scene-inner">
      ${sceneHeading('SPATIAL TROPHY MUSEUM', `${selectedName} · ${isTR()?'Kariyer Müzesi':'Career Museum'}`, isTR()?'Kupalar, kürsüler ve tüm-zamanlar rekor madalyaları üç boyutlu bir kariyer salonunda.':'Trophies, podium finishes and all-time record medals inside a three-dimensional career hall.', `${honours.titles.length}`, isTR()?'ŞAMPİYONLUK':'TITLES')}
      <div class="su-museum-layout">
        <aside class="su-museum-sidebar"><label class="su-field-label">${isTR()?'MÜZE SAHİBİ':'MUSEUM OWNER'}</label><select class="su-select" id="suMuseumPlayer">${names.map(name => `<option value="${esc(name)}" ${normalize(name)===normalize(selectedName)?'selected':''}>${esc(name)}</option>`).join('')}</select>
          <div class="su-museum-profile"><div class="su-museum-avatar">${esc(initials(selectedName))}</div><h3>${esc(selectedName)}</h3><p>${uni.editions?.length || all.editionsPlayed || 0} ${isTR()?'edisyon':'editions'} · ${uni.games || all.games || 0} MP</p>
          <div class="su-mini-stats"><article><span>LEGACY</span><b>${fmt(uni.legacy ?? all.legacyRating,1)}</b></article><article><span>STANDING</span><b>${standing.rank ? `#${standing.rank}` : '—'}</b></article><article><span>PPG</span><b>${fmt(uni.ppg ?? all.ppg,2)}</b></article><article><span>PRIME</span><b>${fmt(uni.prime?.score,0)}</b></article></div></div>
          <div class="su-detail-actions"><button data-su-open-passport="${esc(selectedName)}">${isTR()?'Pasaportu Aç':'Open Passport'}</button><button data-su-scene="galaxy" data-su-focus-player="${esc(selectedName)}">${isTR()?'Galakside Bul':'Find in Galaxy'}</button></div>
        </aside>
        <section class="su-museum-stage"><div class="su-museum-ceiling"></div><div class="su-museum-floor"></div><header class="su-museum-title"><span>HALL OF HONOURS</span><h3>${esc(selectedName)}</h3><p>${isTR()?'Kariyerinin fiziksel bir müzeye dönüşmüş hali.':'A spatial museum built from the player’s career record.'}</p></header>
          <div class="su-trophy-hall"><article class="su-showcase"><header><span>CHAMPIONSHIP WING</span><strong>${isTR()?'Şampiyonluk Kupaları':'Championship Trophies'}</strong></header><div class="su-pedestals">${trophyHtml(honours.titles,'gold')}</div></article>
          <article class="su-showcase"><header><span>PODIUM WING</span><strong>${isTR()?'Final & Üçüncülük':'Runner-up & Third Place'}</strong></header><div class="su-pedestals">${trophyHtml(honours.runnerUps,'silver')}${trophyHtml(honours.thirds,'bronze')}</div></article>
          <article class="su-showcase"><header><span>RECORD WALL</span><strong>${isTR()?'Bireysel Rekor Madalyaları':'Individual Record Medals'}</strong></header>${medals.length ? `<div class="su-medal-wall">${medals.slice(0,12).map(item => `<div class="su-medal"><i>${esc(item.symbol)}</i><strong>${esc(item.label)}</strong><small>${esc(item.value)}${item.detail?` · ${esc(item.detail)}`:''}</small></div>`).join('')}</div>` : `<div class="su-empty-display">${isTR()?'Aktif tüm-zamanlar rekor madalyası bulunmuyor. Rekor el değiştirirse bu duvar otomatik değişir.':'No active all-time record medals. This wall changes automatically when a record changes hands.'}</div>`}</article></div>
        </section>
      </div></div>`;
  }

  function galaxyCoordinates(players) {
    const coords = new Map();
    const count = Math.max(1, players.length);
    const golden = Math.PI * (3 - Math.sqrt(5));
    players.forEach((player, index) => {
      const t = count === 1 ? 0 : index / (count - 1);
      const angle = index * golden;
      const radius = 11 + Math.sqrt(t) * 39;
      const x = 50 + Math.cos(angle) * radius;
      const y = 50 + Math.sin(angle) * radius * .72;
      coords.set(normalize(player.name), { x: clamp(x,5,95), y: clamp(y,7,93) });
    });
    return coords;
  }

  function galaxyMetrics(info) {
    const u = info?.universe || {};
    const a = info?.all || {};
    return {
      legacy: clamp(u.legacy ?? a.legacyRating ?? 0),
      prime: clamp(u.prime?.score ?? 0),
      pressure: clamp(u.pressureScore ?? ((a.bigMatchGames || 0) ? (a.bigMatchWins / Math.max(1,a.bigMatchGames) * 100) : 0)),
      versatility: clamp(u.versatility ?? 0),
      longevity: clamp(u.longevity ?? Math.min(100,(a.games || 0)/100*100)),
      titles: num(u.titles ?? a.titles),
      games: num(u.games ?? a.games),
      ppg: num(u.ppg ?? a.ppg)
    };
  }

  function renderGalaxy(data) {
    const root = document.querySelector('#suSceneGalaxy');
    if (!root) return;
    const players = [...(data.universe.players?.length ? data.universe.players : data.allTime.players || [])].slice(0, 30);
    const selectedName = playerInfo(state.galaxyPlayer, data)?.name || preferredPlayer(data) || players[0]?.name || '';
    state.galaxyPlayer = selectedName;
    const coords = galaxyCoordinates(players);
    const selected = playerInfo(selectedName, data);
    const metrics = galaxyMetrics(selected);
    const maxLegacy = Math.max(1, ...players.map(row => num(row.legacy ?? row.legacyRating)));
    const lines = (data.universe.rivalries || data.allTime.rivalries || []).slice(0, 18).map((rivalry, index) => {
      const a = coords.get(normalize(rivalry.playerA)); const b = coords.get(normalize(rivalry.playerB));
      if (!a || !b) return '';
      return `<line class="${index < 5 ? 'hot' : ''}" x1="${a.x*10}" y1="${a.y*6.5}" x2="${b.x*10}" y2="${b.y*6.5}" />`;
    }).join('');
    root.innerHTML = `<div class="su-scene-inner">
      ${sceneHeading('PLAYER GALAXY', isTR()?'Oyuncular artık tablo değil, yıldız sistemi':'Players are no longer rows; they are a star system', isTR()?'Yıldızın büyüklüğü kariyer mirasını, ışığı şampiyonluk gücünü; bağlantılar ise en yoğun rekabetleri temsil eder.':'Star size represents career legacy, brightness represents honours, and links represent the strongest rivalries.', `${players.length}`, isTR()?'AKTİF YILDIZ':'ACTIVE STARS')}
      <div class="su-galaxy-wrap"><section class="su-galaxy-panel" id="suGalaxyPanel"><svg class="su-galaxy-svg" viewBox="0 0 1000 650" preserveAspectRatio="none">${lines}</svg><div class="su-galaxy-center"><div><span>FIFA UNIVERSE</span><strong>PLAYER<br>GALAXY</strong></div></div>
        ${players.map((player,index) => { const c=coords.get(normalize(player.name)); const legacy=num(player.legacy ?? player.legacyRating); const titles=num(player.titles); const size=18 + clamp(legacy/maxLegacy*34,0,34) + Math.min(8,titles*2.5); return `<button type="button" class="su-star-node ${normalize(player.name)===normalize(selectedName)?'selected':''}" data-su-galaxy-player="${esc(player.name)}" style="left:${c.x}%;top:${c.y}%"><span class="su-star-light" style="width:${size}px;height:${size}px;filter:brightness(${1+Math.min(.55,titles*.1)})"></span><strong>${esc(player.name)}</strong><small>${legacy ? `${fmt(legacy,0)} Legacy` : `${num(player.games)} MP`}</small></button>`; }).join('')}
      </section><aside class="su-galaxy-panel su-galaxy-detail"><span class="su-chip">SELECTED STAR</span><h3>${esc(selected?.name || '—')}</h3><p>${selected ? `${metrics.games} MP · ${fmt(metrics.ppg,2)} PPG · ${metrics.titles} TITLES` : ''}</p><div class="su-galaxy-rank"><b>${selected?.fpi?.rank ? `#${selected.fpi.rank}` : '—'}</b><span>PLAYER STANDING<br>${selected?.fpi?.rating ? `${selected.fpi.rating} RATING` : 'HISTORICAL PROFILE'}</span></div>
        <div class="su-meter-list">${[['LEGACY',metrics.legacy],['PRIME',metrics.prime],['BIG MATCH',metrics.pressure],['VERSATILITY',metrics.versatility],['LONGEVITY',metrics.longevity]].map(([label,value]) => `<div class="su-meter"><label><span>${label}</span><b>${fmt(value,0)}</b></label><i><b style="width:${pct(value)}"></b></i></div>`).join('')}</div>
        <div class="su-detail-actions"><button data-su-open-passport="${esc(selected?.name || '')}">${isTR()?'Pasaportu Aç':'Open Passport'}</button><button data-su-scene="museum" data-su-focus-player="${esc(selected?.name || '')}">${isTR()?'Müzesine Uç':'Fly to Museum'}</button></div></aside></div></div>`;
  }

  function compareMetrics(info) {
    const u = info?.universe || {};
    const a = info?.all || {};
    const f = info?.fpi || {};
    return [
      { key:'legacy', label:'LEGACY', raw:num(u.legacy ?? a.legacyRating), value:clamp(u.legacy ?? a.legacyRating) },
      { key:'prime', label:'PRIME', raw:num(u.prime?.score), value:clamp(u.prime?.score) },
      { key:'ppg', label:'PPG', raw:num(u.ppg ?? a.ppg), value:clamp(num(u.ppg ?? a.ppg)/3*100) },
      { key:'win', label:'WIN RATE', raw:num(u.winRate ?? a.winRate), value:clamp(u.winRate ?? a.winRate) },
      { key:'pressure', label:'BIG MATCH', raw:num(u.pressureScore), value:clamp(u.pressureScore ?? ((a.bigMatchGames||0)?a.bigMatchWins/Math.max(1,a.bigMatchGames)*100:0)) },
      { key:'versatility', label:'VERSATILITY', raw:num(u.versatility), value:clamp(u.versatility) },
      { key:'longevity', label:'LONGEVITY', raw:num(u.longevity), value:clamp(u.longevity ?? Math.min(100,num(a.games)/100*100)) },
      { key:'standing', label:'STANDING', raw:num(f.rating), value:f.rank ? clamp(100 - (f.rank-1)*5) : 0 }
    ];
  }

  function duelPlayer(info, side) {
    const metrics = compareMetrics(info);
    const u = info?.universe || {}; const a = info?.all || {}; const f = info?.fpi || {};
    const overall = metrics.length ? metrics.reduce((s,m)=>s+m.value,0)/metrics.length : 0;
    return `<article class="su-duelist ${side==='right'?'right':''}"><div class="su-duel-avatar">${esc(initials(info?.name))}</div><h3>${esc(info?.name || '—')}</h3><div class="su-duel-sub">${num(u.games ?? a.games)} MP · ${fmt(u.ppg ?? a.ppg,2)} PPG · ${num(u.titles ?? a.titles)} TITLES · ${f.rank ? `STANDING #${f.rank}`:'HISTORICAL'}</div><div class="su-compare-bars">${metrics.map(metric => `<div class="su-cbar"><header><span>${metric.label}</span><b>${metric.key==='ppg'?fmt(metric.raw,2):fmt(metric.raw,0)}</b></header><i><b style="width:${pct(metric.value)}"></b></i></div>`).join('')}</div><div class="su-edge"><span>SPATIAL PROFILE SCORE</span><strong>${fmt(overall,1)} / 100</strong></div></article>`;
  }

  function renderCompare(data) {
    const root = document.querySelector('#suSceneCompare');
    if (!root) return;
    const names = playerNames(data);
    if (!state.compareA || !playerInfo(state.compareA,data)) state.compareA = state.galaxyPlayer || preferredPlayer(data) || names[0] || '';
    if (!state.compareB || !playerInfo(state.compareB,data) || normalize(state.compareB)===normalize(state.compareA)) state.compareB = names.find(name => normalize(name)!==normalize(state.compareA)) || state.compareA;
    const a = playerInfo(state.compareA,data); const b = playerInfo(state.compareB,data);
    const ma=compareMetrics(a), mb=compareMetrics(b);
    const scoreA=ma.reduce((s,m)=>s+m.value,0)/Math.max(1,ma.length); const scoreB=mb.reduce((s,m)=>s+m.value,0)/Math.max(1,mb.length);
    root.innerHTML = `<div class="su-scene-inner">${sceneHeading('AI COMPARISON CHAMBER', isTR()?'Kariyerleri aynı odada çarpıştır':'Put two careers in the same chamber', isTR()?'Legacy, Prime, PPG, galibiyet oranı, büyük maç, çok yönlülük, uzun ömür ve güncel Standing aynı ölçekte karşılaştırılır.':'Legacy, Prime, PPG, win rate, big-match strength, versatility, longevity and current Standing are compared on one scale.', `${fmt(Math.abs(scoreA-scoreB),1)}`, isTR()?'PROFİL FARKI':'PROFILE GAP')}
      <section class="su-compare-panel"><div class="su-compare-controls"><select class="su-select" id="suCompareA">${names.map(n=>`<option value="${esc(n)}" ${normalize(n)===normalize(state.compareA)?'selected':''}>${esc(n)}</option>`).join('')}</select><b>VS</b><select class="su-select" id="suCompareB">${names.map(n=>`<option value="${esc(n)}" ${normalize(n)===normalize(state.compareB)?'selected':''}>${esc(n)}</option>`).join('')}</select></div><div class="su-duel">${duelPlayer(a,'left')}<div class="su-duel-score"><span>EDGE</span><b>${scoreA===scoreB?'=':scoreA>scoreB?'←':'→'}</b><span>${scoreA>scoreB?esc(a?.name):scoreB>scoreA?esc(b?.name):(isTR()?'DENGE':'EVEN')}</span></div>${duelPlayer(b,'right')}</div></section></div>`;
  }

  function renderDynasty(data) {
    const root = document.querySelector('#suSceneDynasty');
    if (!root) return;
    const honoursMap = new Map((data.universe.honours || []).filter(row=>row.competition==='oruc').map(row=>[num(row.edition),row]));
    const editionMap = new Map((data.universe.editions || []).map(row=>[num(row.edition),row]));
    const cards = Array.from({length:10},(_,i)=>i+1).map(edition=>{
      const h=honoursMap.get(edition)||{}; const e=editionMap.get(edition)||{}; const current=edition===10;
      return `<article class="su-era-card ${current?'current':''}" data-su-edition="${edition}"><span class="era-label">${current?'CURRENT ERA':'SEALED HISTORY'}</span><div class="edition">${String(edition).padStart(2,'0')}</div><h3>FIFA ${String(edition).padStart(2,'0')}</h3><div class="champion"><span>${isTR()?'ŞAMPİYON':'CHAMPION'}</span><strong>${esc(h.winner || (current ? (isTR()?'Belirlenecek':'To be decided') : '—'))}</strong></div><div class="su-podium-row"><div><span>🥈 ${isTR()?'İKİNCİ':'RUNNER-UP'}</span><b>${esc(h.runnerUp || '—')}</b></div><div><span>🥉 ${isTR()?'ÜÇÜNCÜ':'THIRD'}</span><b>${esc(h.third || '—')}</b></div></div><div class="su-era-footer"><span>${num(e.matches || e.games || 0) ? `${num(e.matches || e.games)} MP` : current?'LIVE':'ARCHIVE'}</span><span>${current?'FIFA10':'HISTORY'}</span></div></article>`;
    }).join('');
    const champions=(data.universe.honours||[]).filter(r=>r.competition==='oruc'&&r.winner).length;
    root.innerHTML=`<div class="su-scene-inner">${sceneHeading('DYNASTY CORRIDOR', isTR()?'On edisyonluk şampiyonluk koridoru':'A ten-edition corridor of champions', isTR()?'FIFA01’den FIFA10’a kadar her dönem fiziksel bir galeri paneli gibi sıralanır. Aktif dönem altın sinyal taşır.':'Every era from FIFA01 to FIFA10 is displayed like a physical gallery panel. The active era carries a gold signal.', `${champions}/10`, isTR()?'MÜHÜRLENEN ŞAMPİYON':'SEALED CHAMPIONS')}<section class="su-dynasty-panel"><div class="su-corridor" id="suCorridor">${cards}</div></section></div>`;
  }

  function buildRecordCards(data) {
    const r=data.allTime.records||{}; const eligible=data.allTime.eligiblePlayers||[];
    const cards=[]; const add=(title,name,value,detail,symbol='◆')=>{ if(name||value) cards.push({title,name:name||'—',value:value||'—',detail:detail||'',symbol}); };
    if(r.titles)add(isTR()?'En Çok Şampiyonluk':'Most Titles',r.titles.name,`${r.titles.titles} TITLES`,`${r.titles.finals||0} finals`,'♛');
    if(r.finals)add(isTR()?'En Çok Final':'Most Finals',r.finals.name,`${r.finals.finals} FINALS`,`${r.finals.podiums||0} podiums`,'◇');
    if(r.wins)add(isTR()?'En Çok Galibiyet':'Most Wins',r.wins.name,`${r.wins.wins} WINS`,`${r.wins.games} MP`,'W');
    if(r.goals)add(isTR()?'En Çok Gol':'Most Goals',r.goals.name,`${r.goals.gf} GOALS`,`${fmt(r.goals.avgGoals,2)} GF/M`,'GF');
    if(r.ppg)add(isTR()?'En İyi PPG · 20+':'Best PPG · 20+',r.ppg.name,`${fmt(r.ppg.ppg,2)} PPG`,`${r.ppg.games} MP`,'PPG');
    if(r.defense)add(isTR()?'En Sağlam Savunma · 20+':'Best Defence · 20+',r.defense.name,`${fmt(r.defense.gaPerGame,2)} GA/M`,`${r.defense.cleanSheets} CS`,'DEF');
    if(r.matches)add(isTR()?'En Çok Maç':'Most Matches',r.matches.name,`${r.matches.games} MP`,`${r.matches.editionsPlayed||0} editions`,'MP');
    if(r.goalDifference)add(isTR()?'En İyi Gol Farkı':'Best Goal Difference',r.goalDifference.name,`${r.goalDifference.gd>0?'+':''}${r.goalDifference.gd} GD`,`${fmt(r.goalDifference.gdPerGame,2)} GD/M`,'GD');
    if(r.winRate)add(isTR()?'En Yüksek Galibiyet Oranı':'Highest Win Rate',r.winRate.name,`${fmt(r.winRate.winRate,1)}%`,`${r.winRate.games} MP`,'W%');
    if(r.cleanSheets)add(isTR()?'En Çok Clean Sheet':'Most Clean Sheets',r.cleanSheets.name,`${r.cleanSheets.cleanSheets} CS`,`${fmt(r.cleanSheets.cleanSheetRate,1)}%`,'CS');
    if(r.biggestWin)add(isTR()?'En Farklı Galibiyet':'Biggest Victory',r.biggestWin.winner,r.biggestWin.score,`${r.biggestWin.editionLabel||''} · ${r.biggestWin.stage||''}`,'↗');
    if(r.highestScoringMatch)add(isTR()?'En Gollü Maç':'Highest-Scoring Match',`${r.highestScoringMatch.homeName} vs ${r.highestScoringMatch.awayName}`,r.highestScoringMatch.score,`${r.highestScoringMatch.totalGoals} goals`,'◎');
    const draw=data.allTime.highestScoringDraws?.[0]; if(draw)add(isTR()?'En Gollü Beraberlik':'Highest-Scoring Draw',`${draw.homeName} vs ${draw.awayName}`,draw.score,`${draw.totalGoals} goals`,'=');
    if(r.topRivalry)add(isTR()?'En Çok Oynanan Rekabet':'Most-Played Rivalry',`${r.topRivalry.playerA} vs ${r.topRivalry.playerB}`,`${r.topRivalry.meetings} MP`,r.topRivalry.summary||'','∞');
    const streakDefs=[['longestWinStreak',isTR()?'En Uzun Galibiyet Serisi':'Longest Win Streak','W'],['longestUnbeatenStreak',isTR()?'En Uzun Yenilmezlik Serisi':'Longest Unbeaten Streak','U'],['longestScoringStreak',isTR()?'En Uzun Gol Atma Serisi':'Longest Scoring Streak','GF'],['longestCleanSheetStreak',isTR()?'En Uzun Clean Sheet Serisi':'Longest Clean-Sheet Streak','CS']];
    streakDefs.forEach(([metric,title,symbol])=>{const row=[...eligible].sort((a,b)=>num(b[metric])-num(a[metric])||num(b.games)-num(a.games))[0];if(row)add(title,row.name,`${row[metric]} ${isTR()?'MAÇ':'MATCHES'}`,`${row.games} MP`,symbol);});
    return cards;
  }

  function renderRecords(data) {
    const root=document.querySelector('#suSceneRecords'); if(!root)return;
    const cards=buildRecordCards(data);
    root.innerHTML=`<div class="su-scene-inner">${sceneHeading('RECORD VAULT', isTR()?'Tüm zamanlar kasası':'The all-time vault', isTR()?'Rekor sahibi değiştiğinde bu kasa otomatik olarak yeni sahibini gösterir. DOM tahmini yok; doğrudan All-Time Analytics motoru okunur.':'When a record changes hands, the vault automatically displays the new owner. No DOM guessing; it reads directly from the All-Time Analytics engine.', `${cards.length}`, isTR()?'CANLI REKOR':'LIVE RECORDS')}<section class="su-record-panel"><div class="su-record-grid">${cards.map(card=>`<article class="su-record-card" data-symbol="${esc(card.symbol)}"><span>${esc(card.title)}</span><h3>${esc(card.name)}</h3><div class="value">${esc(card.value)}</div><small>${esc(card.detail)}</small>${playerInfo(card.name,data)?`<button data-su-open-passport="${esc(card.name)}">${isTR()?'Oyuncuyu Aç':'Open Player'} ↗</button>`:''}</article>`).join('')}</div></section></div>`;
  }

  function renderScene(scene = state.scene) {
    const data=getData(); state.scene=SCENES.includes(scene)?scene:'core'; saveState();
    document.querySelectorAll('.su-scene').forEach(el=>el.classList.toggle('active',el.dataset.scene===state.scene));
    document.querySelectorAll('[data-su-tab]').forEach(btn=>btn.classList.toggle('active',btn.dataset.suTab===state.scene));
    if(state.scene==='core')renderCore(data);
    if(state.scene==='museum')renderMuseum(data);
    if(state.scene==='galaxy')renderGalaxy(data);
    if(state.scene==='compare')renderCompare(data);
    if(state.scene==='dynasty')renderDynasty(data);
    if(state.scene==='records')renderRecords(data);
    updateCinematicHud();
  }

  function shellMarkup() {
    const tabs=[['core','◎','UNIVERSE'],['museum','♛','MUSEUM'],['galaxy','✦','GALAXY'],['compare','VS','COMPARE'],['dynasty','10','DYNASTY'],['records','◆','RECORDS']];
    return `<header class="su-topbar"><div class="su-brand"><div class="su-brand-mark">IF</div><div><strong>INFANTINO · SPATIAL UNIVERSE</strong><small>FIFA UNIVERSE V5.2 · VISUAL INTELLIGENCE LAYER</small></div></div><nav class="su-scene-tabs">${tabs.map(([id,icon,label])=>`<button type="button" data-su-tab="${id}">${icon} ${label}</button>`).join('')}</nav><div class="su-top-actions"><button type="button" data-su-cinematic>◈ CINEMATIC</button><button type="button" data-su-normal-site>${isTR()?'NORMAL SİTE':'NORMAL SITE'}</button><button type="button" class="su-close" data-su-close>✕</button></div></header><main class="su-body">${SCENES.map(id=>`<section class="su-scene" data-scene="${id}" id="suScene${id[0].toUpperCase()+id.slice(1)}"></section>`).join('')}</main><div class="su-cinematic-hud" id="suCinematicHud"><i></i><span>CINEMATIC TOUR · <b id="suCinematicLabel">UNIVERSE</b></span><button type="button" data-su-stop-cinematic>✕</button></div>`;
  }

  function ensureShell() {
    if (!document.querySelector('.su-launcher')) {
      const launcher=document.createElement('button'); launcher.type='button'; launcher.className='su-launcher'; launcher.setAttribute('aria-label','Infantino Spatial Universe'); launcher.innerHTML='<span>IF</span>'; document.body.appendChild(launcher); launcher.addEventListener('click',()=>open());
    }
    if(document.querySelector('#suShell'))return;
    const shell=document.createElement('section'); shell.id='suShell'; shell.className='su-shell'; shell.setAttribute('aria-hidden','true'); shell.innerHTML=shellMarkup(); document.body.appendChild(shell); bindShell();
  }

  function open(scene) {
    ensureShell(); state.open=true; document.body.classList.add('su-open'); const shell=document.querySelector('#suShell'); shell?.classList.add('open'); shell?.setAttribute('aria-hidden','false'); renderScene(scene||state.scene);
  }

  function close() {
    stopCinematic(false); state.open=false; document.body.classList.remove('su-open'); const shell=document.querySelector('#suShell'); shell?.classList.remove('open'); shell?.setAttribute('aria-hidden','true');
  }

  function switchScene(scene, focusPlayer='') {
    if(focusPlayer){setContextPlayer(focusPlayer); if(scene==='museum')state.museumPlayer=focusPlayer; if(scene==='galaxy')state.galaxyPlayer=focusPlayer;}
    renderScene(scene);
  }

  function startCinematic() {
    if(state.cinematic)return; state.cinematic=true; state.cinematicIndex=Math.max(0,SCENES.indexOf(state.scene));
    document.querySelector('[data-su-cinematic]')?.classList.add('active'); updateCinematicHud();
    const advance=()=>{ if(!state.open||!state.cinematic)return; state.cinematicIndex=(state.cinematicIndex+1)%SCENES.length; const next=SCENES[state.cinematicIndex]; switchScene(next); if(next==='museum'){const data=getData();const top=(data.universe.players||[])[state.cinematicIndex%(Math.max(1,(data.universe.players||[]).length))];if(top){state.museumPlayer=top.name;renderMuseum(data);}} };
    state.cinematicTimer=setInterval(advance,6500);
  }

  function stopCinematic(update=true) {
    state.cinematic=false; if(state.cinematicTimer){clearInterval(state.cinematicTimer);state.cinematicTimer=null;} document.querySelector('[data-su-cinematic]')?.classList.remove('active'); if(update)updateCinematicHud();
  }

  function toggleCinematic(){ state.cinematic?stopCinematic():startCinematic(); }
  function updateCinematicHud(){ const hud=document.querySelector('#suCinematicHud'); hud?.classList.toggle('show',state.cinematic&&state.open); const label=document.querySelector('#suCinematicLabel'); if(label)label.textContent=state.scene.toUpperCase(); }

  function bindCoreDrag(){
    const stage=document.querySelector('#suCoreStage'); if(!stage||stage.dataset.bound==='1')return; stage.dataset.bound='1'; let dragging=false,startX=0,startY=0,baseRY=0,baseRX=0;
    stage.addEventListener('pointerdown',event=>{if(event.target.closest('.su-planet'))return;dragging=true;startX=event.clientX;startY=event.clientY;baseRY=state.ry;baseRX=state.rx;stage.setPointerCapture?.(event.pointerId);});
    stage.addEventListener('pointermove',event=>{if(!dragging)return;state.ry=baseRY+(event.clientX-startX)*.26;state.rx=clamp(baseRX-(event.clientY-startY)*.18,-34,20);const w=document.querySelector('#suCoreWorld');if(w){w.style.setProperty('--su-rx',`${state.rx}deg`);w.style.setProperty('--su-ry',`${state.ry}deg`);}});
    const stop=event=>{dragging=false;try{stage.releasePointerCapture?.(event.pointerId);}catch(_){}};stage.addEventListener('pointerup',stop);stage.addEventListener('pointercancel',stop);
    stage.addEventListener('wheel',event=>{event.preventDefault();state.zoom=clamp(state.zoom-event.deltaY*.18,-220,260);document.querySelector('#suCoreWorld')?.style.setProperty('--su-z',`${state.zoom}px`);},{passive:false});
  }

  function bindShell() {
    const shell=document.querySelector('#suShell'); if(!shell)return;
    shell.addEventListener('click',event=>{
      const tab=event.target.closest('[data-su-tab]'); if(tab){switchScene(tab.dataset.suTab);return;}
      const sceneBtn=event.target.closest('[data-su-scene]'); if(sceneBtn){switchScene(sceneBtn.dataset.suScene,sceneBtn.dataset.suFocusPlayer||'');return;}
      const routeBtn=event.target.closest('[data-su-route]'); if(routeBtn){navigate(routeBtn.dataset.suRoute);return;}
      const passport=event.target.closest('[data-su-open-passport]'); if(passport){openPassport(passport.dataset.suOpenPassport);return;}
      const star=event.target.closest('[data-su-galaxy-player]'); if(star){state.galaxyPlayer=star.dataset.suGalaxyPlayer;setContextPlayer(state.galaxyPlayer);renderGalaxy(getData());return;}
      if(event.target.closest('[data-su-close]')||event.target.closest('[data-su-normal-site]')){close();return;}
      if(event.target.closest('[data-su-cinematic]')){toggleCinematic();return;}
      if(event.target.closest('[data-su-stop-cinematic]')){stopCinematic();return;}
    });
    shell.addEventListener('change',event=>{
      if(event.target.id==='suMuseumPlayer'){state.museumPlayer=event.target.value;setContextPlayer(state.museumPlayer);renderMuseum(getData());}
      if(event.target.id==='suCompareA'){state.compareA=event.target.value;if(normalize(state.compareA)===normalize(state.compareB)){const names=playerNames(getData());state.compareB=names.find(n=>normalize(n)!==normalize(state.compareA))||state.compareB;}saveState();renderCompare(getData());}
      if(event.target.id==='suCompareB'){state.compareB=event.target.value;if(normalize(state.compareB)===normalize(state.compareA)){const names=playerNames(getData());state.compareA=names.find(n=>normalize(n)!==normalize(state.compareB))||state.compareA;}saveState();renderCompare(getData());}
    });
  }

  function bindGlobal() {
    document.addEventListener('keydown',event=>{
      if(event.ctrlKey&&event.shiftKey&&event.code==='Space'){event.preventDefault();state.open?close():open();return;}
      if(event.key==='Escape'&&state.open){close();return;}
      if((event.key==='c'||event.key==='C')&&state.open&&!/input|select|textarea/i.test(document.activeElement?.tagName||'')){toggleCinematic();}
      if(state.open&&['1','2','3','4','5','6'].includes(event.key)&&!/input|select|textarea/i.test(document.activeElement?.tagName||'')){switchScene(SCENES[Number(event.key)-1]);}
    });
    window.addEventListener('storage',event=>{if(event.key===PLAYER_KEY&&event.newValue){state.museumPlayer=event.newValue;state.galaxyPlayer=event.newValue;saveState();if(state.open&&(state.scene==='museum'||state.scene==='galaxy'))renderScene(state.scene);}});
    window.addEventListener('fifa10:draw-updated',()=>{if(state.open)renderScene(state.scene);});
    window.addEventListener('fifa:state-updated',()=>{if(state.open)renderScene(state.scene);});
  }

  function boot() {
    if(window.__FIFA_SPATIAL_UNIVERSE_V520__)return; window.__FIFA_SPATIAL_UNIVERSE_V520__=true;
    ensureShell(); bindGlobal();
    window.INFANTINO_VISUAL={version:VERSION,build:BUILD,open,close,scene:switchScene,museum:name=>{setContextPlayer(name);open('museum');},galaxy:name=>{setContextPlayer(name);open('galaxy');},compare:(a,b)=>{state.compareA=a||state.compareA;state.compareB=b||state.compareB;open('compare');},cinematic:startCinematic,data:getData};
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
