(() => {
  'use strict';

  const VERSION = '5.0.1';
  const BUILD = '501000';
  const STATE_KEY = 'orion-spatial-ai-v500';
  const PLAYER_KEY = 'fifa-universe-v2-player';
  const app = () => window.FIFA_APP_CONTEXT || null;
  const drawEngine = () => window.FIFA10_DRAW_ENGINE || null;
  const universeEngine = () => window.FIFA_UNIVERSE_INTELLIGENCE || null;
  const tr = () => (window.FIFA_I18N?.language || document.documentElement.lang || 'tr').toLowerCase().startsWith('tr');
  const isMobile = () => Boolean(navigator.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  let listenTimeout = null;

  const safeState = (() => {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') || {}; }
    catch (_) { return {}; }
  })();

  const state = {
    open: false,
    listening: false,
    speaking: false,
    muted: safeState.muted === true,
    contextPlayer: safeState.contextPlayer || localStorage.getItem(PLAYER_KEY) || '',
    rx: -7,
    ry: 0,
    zoom: 0,
    cinematic: false,
    recognition: null,
    messages: [],
    activeCompare: null,
    recognitionSupported: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  };

  const normalize = value => String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const escapeHTML = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const compact = value => Number(value || 0).toLocaleString(tr() ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 });
  const capitalize = value => { const s = String(value || ''); return s ? s.charAt(0).toLocaleUpperCase(tr() ? 'tr-TR' : 'en-US') + s.slice(1) : s; };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function savePrefs() {
    localStorage.setItem(STATE_KEY, JSON.stringify({ muted: state.muted, contextPlayer: state.contextPlayer }));
  }

  function getData() {
    const ctx = app();
    const draw = ctx?.getFifa10Draw?.() || null;
    let fpi = { players: [], summary: {}, playerMap: new Map() };
    let allTime = { players: [], records: {}, rivalries: [], summary: {}, highestScoringDraws: [], highestScoringMatches: [], biggestWins: [] };
    let universe = { players: [], honours: [], matches: [], stories: [], editions: [], rivalries: [] };
    try { fpi = ctx?.buildFpiAnalytics?.() || fpi; } catch (_) {}
    try { allTime = ctx?.buildAllTimeAnalytics?.() || allTime; } catch (_) {}
    try { universe = universeEngine()?.buildUniverse?.(ctx?.getState?.(), draw) || universe; } catch (_) {}
    let standings = [];
    try { standings = drawEngine()?.standings?.(draw) || []; } catch (_) {}
    let matches = [];
    try { matches = ctx?.buildUnifiedAllTimeMatches?.() || []; } catch (_) {}
    return { ctx, draw, fpi, allTime, universe, standings, matches, activeView: ctx?.getActiveView?.() || 'dashboard' };
  }

  function allPlayerNames(data = getData()) {
    const names = new Set();
    (data.fpi.players || []).forEach(row => row?.name && names.add(row.name));
    (data.allTime.players || []).forEach(row => row?.name && names.add(row.name));
    (data.universe.players || []).forEach(row => row?.name && names.add(row.name));
    (data.draw?.participants || []).forEach(row => row?.name && names.add(row.name));
    return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b, 'tr'));
  }

  function matchedPlayers(phrase, data = getData()) {
    const normalizedPhrase = ` ${normalize(phrase)} `;
    const names = allPlayerNames(data);
    const found = [];
    const seen = new Set();
    const push = name => {
      const key = normalize(name);
      if (key && !seen.has(key)) { seen.add(key); found.push(name); }
    };
    for (const name of names) {
      const key = normalize(name);
      if (key && normalizedPhrase.includes(` ${key} `)) push(name);
    }
    const aliasOwners = new Map();
    names.forEach(name => {
      const parts = normalize(name).split(' ').filter(Boolean);
      const aliases = [parts[0], parts[parts.length - 1]].filter(alias => alias && alias.length >= 4);
      aliases.forEach(alias => {
        if (!aliasOwners.has(alias)) aliasOwners.set(alias, []);
        aliasOwners.get(alias).push(name);
      });
    });
    for (const [alias, owners] of aliasOwners) {
      if (owners.length === 1 && normalizedPhrase.includes(` ${alias} `)) push(owners[0]);
    }
    return found;
  }

  function findPlayerInPhrase(phrase, data = getData()) { return matchedPlayers(phrase, data)[0] || ''; }
  function findTwoPlayers(phrase, data = getData()) { return matchedPlayers(phrase, data).slice(0, 2); }

  function playerInfo(name, data = getData()) {
    if (!name) return null;
    const n = normalize(name);
    const fpi = (data.fpi.players || []).find(row => normalize(row.name) === n) || null;
    const all = (data.allTime.players || []).find(row => normalize(row.name) === n) || null;
    const uni = (data.universe.players || []).find(row => normalize(row.name) === n) || null;
    const current = (data.standings || []).find(row => normalize(row.name) === n) || null;
    return { name: fpi?.name || all?.name || uni?.name || name, fpi, all, uni, current };
  }

  function currentContextPlayer(data = getData()) {
    const stored = state.contextPlayer || localStorage.getItem(PLAYER_KEY) || '';
    if (stored) { const info = playerInfo(stored, data); if (info && (info.fpi || info.all || info.uni || info.current)) return info.name; }
    if (data.activeView === 'playershub') {
      const selected = document.querySelector('#v2PlayerSelect');
      if (selected?.value) return selected.value;
    }
    return '';
  }

  function routeLabel(route) {
    const map = {
      dashboard: tr() ? 'Ana Sayfa' : 'Home', livehub: tr() ? 'Canlı Merkez' : 'Live Centre',
      tournaments: tr() ? 'Turnuvalar' : 'Tournaments', playershub: tr() ? 'Oyuncu Pasaportları' : 'Player Passports',
      alltime: tr() ? 'Tüm Zamanlar' : 'All-Time', mediahub: tr() ? 'Medya' : 'Media', seasonhub: 'FIFA 10',
      livematch: tr() ? 'Canlı Maç Studio' : 'Live Match Studio', livestats: tr() ? 'Canlı İstatistikler' : 'Live Statistics',
      form: tr() ? 'Form Merkezi' : 'Form Centre', odds: tr() ? 'Maç Oranları' : 'Match Odds', intelligence: tr() ? 'Zekâ Merkezi' : 'Intelligence',
      archive: tr() ? 'Turnuva Arşivi' : 'Tournament Archive', benchmark: tr() ? 'Turnuva Karnesi' : 'Tournament Benchmark'
    };
    return map[route] || route;
  }

  function navigate(route, followUp, keepSpatial = false) {
    const ctx = app();
    if (!ctx?.navigate) return false;
    ctx.navigate(route);
    if (typeof followUp === 'function') setTimeout(followUp, 650);
    updateContextDisplay();
    if (state.open && !keepSpatial) setTimeout(() => closeSpatial(true), 720);
    return true;
  }

  function selectPlayer(name, options = {}) {
    if (!name) return false;
    state.contextPlayer = name;
    localStorage.setItem(PLAYER_KEY, name);
    savePrefs();
    navigate('playershub', () => {
      const select = document.querySelector('#v2PlayerSelect');
      if (select) {
        select.value = name;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (options.scrollTo) {
        setTimeout(() => {
          const target = document.querySelector(options.scrollTo);
          target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        }, 450);
      }
      if (options.chart) {
        setTimeout(() => document.querySelector(`[data-v2-passport-chart="${options.chart}"]`)?.click(), 500);
      }
    });
    return true;
  }

  function openStandingCentre() {
    const existing = document.querySelector('[data-action="open-fpi-centre"], [data-v2-fpi-centre]');
    if (existing) { existing.click(); return true; }
    navigate('dashboard', () => document.querySelector('[data-action="open-fpi-centre"], [data-v2-fpi-centre]')?.click());
    return true;
  }

  function latestResults(data, count = 10) {
    const rows = (data.matches || []).filter(match => Number.isFinite(Number(match.homeScore)) && Number.isFinite(Number(match.awayScore)));
    return rows.slice(-count).reverse().map((match, index) => ({
      id: match.id || `${match.edition || ''}-${index}`,
      home: match.homeName || match.p1 || '—', away: match.awayName || match.p2 || '—',
      homeScore: Number(match.homeScore), awayScore: Number(match.awayScore), edition: match.editionLabel || `FIFA ${match.edition || 10}`, stage: match.stage || ''
    }));
  }

  function topTournamentRows(data, count = 5) {
    return (data.standings || []).slice(0, count).map((row, index) => ({ rank: row.rank || index + 1, name: row.name, ppg: Number(row.ppg || 0), pts: row.pts, mp: row.mp }));
  }

  function topStandingRows(data, count = 5) {
    return (data.fpi.players || []).slice(0, count).map(row => ({ rank: row.rank, name: row.name, rating: row.rating, shift: row.last5Change }));
  }

  function recordAnswer(kind, data) {
    const records = data.allTime.records || {};
    if (kind === 'biggestWin') {
      const r = records.biggestWin || data.allTime.biggestWins?.[0];
      if (!r) return null;
      return { text: tr() ? `Tüm zamanların en farklı galibiyeti ${r.winner} tarafından ${r.loser} karşısında ${r.score} ile alındı.` : `The biggest all-time win is ${r.winner}'s ${r.score} victory over ${r.loser}.`, rich: [{ left: r.winner, right: `${r.score} · ${r.loser}` }] };
    }
    if (kind === 'highScore') {
      const r = records.highestScoringMatch || data.allTime.highestScoringMatches?.[0];
      if (!r) return null;
      return { text: tr() ? `En gollü maç ${r.homeName} ${r.homeScore}-${r.awayScore} ${r.awayName}. Toplam ${r.totalGoals} gol.` : `The highest-scoring match is ${r.homeName} ${r.homeScore}-${r.awayScore} ${r.awayName}, with ${r.totalGoals} goals.`, rich: [{ left: `${r.homeName} vs ${r.awayName}`, right: `${r.homeScore}-${r.awayScore}` }] };
    }
    if (kind === 'highDraw') {
      const r = data.allTime.highestScoringDraws?.[0];
      if (!r) return null;
      return { text: tr() ? `En gollü beraberlik ${r.homeName} ile ${r.awayName} arasında ${r.score} sona erdi.` : `The highest-scoring draw was ${r.homeName} versus ${r.awayName}, finishing ${r.score}.`, rich: [{ left: `${r.homeName} vs ${r.awayName}`, right: r.score }] };
    }
    if (kind === 'unbeaten') {
      const row = [...(data.allTime.players || [])].sort((a, b) => Number(b.longestUnbeatenStreak || 0) - Number(a.longestUnbeatenStreak || 0))[0];
      if (!row) return null;
      return { text: tr() ? `En uzun yenilmezlik serisi ${row.name} tarafından ${row.longestUnbeatenStreak} maç ile tutuluyor.` : `${row.name} holds the longest unbeaten run at ${row.longestUnbeatenStreak} matches.`, rich: [{ left: row.name, right: `${row.longestUnbeatenStreak} MP` }] };
    }
    if (kind === 'winStreak') {
      const row = [...(data.allTime.players || [])].sort((a, b) => Number(b.longestWinStreak || 0) - Number(a.longestWinStreak || 0))[0];
      if (!row) return null;
      return { text: tr() ? `En uzun galibiyet serisi ${row.name} tarafından ${row.longestWinStreak} maç ile tutuluyor.` : `${row.name} holds the longest winning run at ${row.longestWinStreak} matches.`, rich: [{ left: row.name, right: `${row.longestWinStreak} W` }] };
    }
    const rowMap = { titles: records.titles, goals: records.goals, matches: records.matches, ppg: records.ppg, defense: records.defense };
    const row = rowMap[kind];
    if (!row) return null;
    const value = kind === 'titles' ? row.titles : kind === 'goals' ? row.gf : kind === 'matches' ? row.games : kind === 'ppg' ? Number(row.ppg).toFixed(3) : Number(row.gaPerGame).toFixed(2);
    const labels = { titles: tr() ? 'en fazla şampiyonluk' : 'most titles', goals: tr() ? 'en çok gol' : 'most goals', matches: tr() ? 'en çok maç' : 'most matches', ppg: tr() ? 'en yüksek PPG' : 'highest PPG', defense: tr() ? 'en iyi savunma ortalaması' : 'best defensive average' };
    return { text: tr() ? `${capitalize(labels[kind])} rekoru ${row.name} üzerinde: ${value}.` : `${capitalize(labels[kind])} belongs to ${row.name}: ${value}.`, rich: [{ left: row.name, right: String(value) }] };
  }

  function comparePlayers(first, second, data) {
    const a = playerInfo(first, data); const b = playerInfo(second, data);
    if (!a || !b) return null;
    const metrics = row => ({
      standing: row.fpi?.rating ?? '—', rank: row.fpi?.rank ?? '—', legacy: row.all?.legacyRating ?? row.uni?.legacy ?? '—',
      ppg: row.all?.ppg ?? row.uni?.ppg ?? 0, titles: row.all?.titles ?? row.uni?.titles ?? 0,
      attack: row.all?.avgGoals ?? row.uni?.gfPerMatch ?? 0, defense: row.all?.gaPerGame ?? row.uni?.gaPerMatch ?? 0,
      big: row.all?.bigMatchGames ? (row.all.bigMatchWins / row.all.bigMatchGames * 100) : row.fpi?.fpi?.pressureScore ?? 50
    });
    return { first: a.name, second: b.name, a: metrics(a), b: metrics(b) };
  }

  function setComparison(compare) {
    state.activeCompare = compare;
    const box = document.querySelector('#orionComparison');
    if (!box) return;
    if (!compare) { box.classList.remove('open'); return; }
    box.innerHTML = `<header><h3>${escapeHTML(compare.first)} vs ${escapeHTML(compare.second)}</h3><button type="button" data-orion-close-compare>×</button></header>
      <div class="orion-compare-grid">
        <section class="orion-compare-player"><h4>${escapeHTML(compare.first)}</h4><div class="big">#${escapeHTML(compare.a.rank)}</div><div class="orion-compare-metrics"><article><span>RATING</span><b>${escapeHTML(compare.a.standing)}</b></article><article><span>PPG</span><b>${Number(compare.a.ppg || 0).toFixed(2)}</b></article><article><span>TITLES</span><b>${escapeHTML(compare.a.titles)}</b></article><article><span>BIG</span><b>${Number(compare.a.big || 0).toFixed(0)}</b></article></div></section>
        <div class="orion-compare-vs">VS</div>
        <section class="orion-compare-player"><h4>${escapeHTML(compare.second)}</h4><div class="big">#${escapeHTML(compare.b.rank)}</div><div class="orion-compare-metrics"><article><span>RATING</span><b>${escapeHTML(compare.b.standing)}</b></article><article><span>PPG</span><b>${Number(compare.b.ppg || 0).toFixed(2)}</b></article><article><span>TITLES</span><b>${escapeHTML(compare.b.titles)}</b></article><article><span>BIG</span><b>${Number(compare.b.big || 0).toFixed(0)}</b></article></div></section>
      </div>`;
    box.classList.add('open');
  }

  function addMessage(role, text, rich = []) {
    state.messages.push({ role, text, rich, at: Date.now() });
    state.messages = state.messages.slice(-18);
    renderTranscript();
  }

  function renderTranscript() {
    const root = document.querySelector('#orionTranscript');
    if (!root) return;
    root.innerHTML = state.messages.map(msg => `<div class="orion-msg ${msg.role === 'user' ? 'user' : 'ai'}"><span class="tag">${msg.role === 'user' ? (tr() ? 'SEN' : 'YOU') : 'ORION'}</span>${escapeHTML(msg.text)}${msg.rich?.length ? `<div class="orion-rich">${msg.rich.map(row => `<article><strong>${escapeHTML(row.left)}</strong><span>${escapeHTML(row.right)}</span></article>`).join('')}</div>` : ''}</div>`).join('');
    root.scrollTop = root.scrollHeight;
  }

  function speak(text) {
    if (state.muted || !('speechSynthesis' in window) || !text) return;
    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/#/g, tr() ? 'sıra ' : 'rank '));
      utterance.lang = tr() ? 'tr-TR' : 'en-US';
      utterance.rate = .96; utterance.pitch = .92; utterance.volume = 1;
      const voices = speechSynthesis.getVoices?.() || [];
      const preferred = voices.find(v => v.lang?.toLowerCase().startsWith(tr() ? 'tr' : 'en') && /google|microsoft|natural|premium/i.test(v.name)) || voices.find(v => v.lang?.toLowerCase().startsWith(tr() ? 'tr' : 'en'));
      if (preferred) utterance.voice = preferred;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      speechSynthesis.speak(utterance);
    } catch (_) { setSpeaking(false); }
  }

  function setSpeaking(value) {
    state.speaking = value;
    document.querySelector('.orion-launcher')?.classList.toggle('speaking', value);
    document.querySelector('#orionConsoleOrb')?.classList.toggle('speaking', value);
    document.querySelector('#orionWave')?.classList.toggle('active', value || state.listening);
  }

  function reply(text, rich = [], options = {}) {
    addMessage('ai', text, rich);
    if (options.speak !== false) speak(text);
  }

  function summaryReply(data) {
    const leader = data.fpi.summary?.leader || data.fpi.players?.[0];
    const tourLeader = data.standings?.[0];
    const recent = latestResults(data, 1)[0];
    const text = tr()
      ? `Turnuva özeti hazır. Player Standing lideri ${leader?.name || 'henüz belirlenmedi'}${leader ? `, ${leader.rating} rating` : ''}. Aktif turnuva lideri ${tourLeader?.name || 'henüz belirlenmedi'}${tourLeader ? `, ${Number(tourLeader.ppg || 0).toFixed(3)} PPG` : ''}. ${recent ? `Son sonuç: ${recent.home} ${recent.homeScore}-${recent.awayScore} ${recent.away}.` : ''}`
      : `Tournament summary ready. Player Standing leader: ${leader?.name || 'not set yet'}${leader ? ` on ${leader.rating}` : ''}. Current tournament leader: ${tourLeader?.name || 'not set yet'}${tourLeader ? ` at ${Number(tourLeader.ppg || 0).toFixed(3)} PPG` : ''}. ${recent ? `Latest result: ${recent.home} ${recent.homeScore}-${recent.awayScore} ${recent.away}.` : ''}`;
    return { text, rich: [leader && { left: `Standing #${leader.rank}`, right: `${leader.name} · ${leader.rating}` }, tourLeader && { left: `Tournament #${tourLeader.rank || 1}`, right: `${tourLeader.name} · ${Number(tourLeader.ppg || 0).toFixed(3)} PPG` }].filter(Boolean) };
  }

  async function executeCommand(raw) {
    const input = String(raw || '').trim();
    if (!input) return;
    addMessage('user', input);
    let phrase = normalize(input).replace(/^(orion|hey orion|ok orion)\s+/, '');
    const data = getData();
    const players = findTwoPlayers(phrase, data);
    const namedPlayer = players[0] || findPlayerInPhrase(phrase, data) || (/\b(onun|bu oyuncu|this player|he|she)\b/.test(phrase) ? currentContextPlayer(data) : '');

    // Global controls
    if (/^(kapat|close|cikis|exit)$/.test(phrase)) { closeSpatial(); return reply(tr() ? 'Spatial AI kapatıldı.' : 'Spatial AI closed.', [], { speak: false }); }
    if (/sessiz|mute/.test(phrase)) { state.muted = true; savePrefs(); updateMuteButton(); return reply(tr() ? 'Sesli yanıt kapatıldı.' : 'Voice responses muted.', [], { speak: false }); }
    if (/sesli|unmute|konus/.test(phrase) && !/kiminle|kimle/.test(phrase)) { state.muted = false; savePrefs(); updateMuteButton(); return reply(tr() ? 'Sesli yanıt aktif.' : 'Voice responses enabled.'); }
    if (/sinematik|cinematic/.test(phrase)) { toggleCinematic(); return reply(state.cinematic ? (tr() ? 'Sinematik uçuş başlatıldı.' : 'Cinematic flight started.') : (tr() ? 'Sinematik uçuş durduruldu.' : 'Cinematic flight stopped.')); }

    // Comparison before single-player actions
    if ((/karsilastir|vs|versus|compare/.test(phrase)) && players.length >= 2) {
      const compare = comparePlayers(players[0], players[1], data);
      if (compare) {
        setComparison(compare);
        state.contextPlayer = compare.first; savePrefs();
        const text = tr() ? `${compare.first} ile ${compare.second} karşılaştırmasını açtım. Standing, PPG, şampiyonluk ve büyük maç sinyalleri hazır.` : `I opened the comparison between ${compare.first} and ${compare.second}. Standing, PPG, titles and big-match signals are ready.`;
        return reply(text);
      }
    }

    // All-time records
    const recordIntents = [
      [/en farkli|biggest win|largest win/, 'biggestWin'],
      [/en gollu beraberlik|highest scoring draw/, 'highDraw'],
      [/en gollu mac|highest scoring match/, 'highScore'],
      [/yenilmezlik seri|unbeaten/, 'unbeaten'],
      [/galibiyet seri|winning streak/, 'winStreak'],
      [/en fazla sampiyon|most titles/, 'titles'],
      [/en cok gol|most goals/, 'goals'],
      [/en cok mac|most matches/, 'matches'],
      [/en yuksek ppg|best ppg|highest ppg/, 'ppg'],
      [/en iyi savunma|best defense|best defence/, 'defense']
    ];
    for (const [pattern, kind] of recordIntents) {
      if (pattern.test(phrase)) {
        const answer = recordAnswer(kind, data);
        if (answer) { navigate('alltime'); return reply(answer.text, answer.rich); }
      }
    }

    // Player actions and questions
    if (namedPlayer) {
      state.contextPlayer = namedPlayer; savePrefs();
      const info = playerInfo(namedPlayer, data);
      if (/muze|museum|kupa|trophy/.test(phrase)) {
        selectPlayer(namedPlayer, { scrollTo: '.v2-player-museum' });
        const count = info?.all?.titles ?? info?.uni?.titles ?? 0;
        return reply(tr() ? `${namedPlayer} müzesini açıyorum. Kayıtlarda ${count} şampiyonluk bulunuyor.` : `Opening ${namedPlayer}'s museum. The records show ${count} titles.`);
      }
      if (/hucum grafik|attack graph/.test(phrase)) { selectPlayer(namedPlayer, { chart: 'attack' }); return reply(tr() ? `${namedPlayer} hücum grafiğini açıyorum.` : `Opening ${namedPlayer}'s attack graph.`); }
      if (/savunma grafik|defen[cs]e graph/.test(phrase)) { selectPlayer(namedPlayer, { chart: 'defense' }); return reply(tr() ? `${namedPlayer} savunma grafiğini açıyorum.` : `Opening ${namedPlayer}'s defence graph.`); }
      if (/gol grafik|goals? graph/.test(phrase)) { selectPlayer(namedPlayer, { chart: 'gfPerMatch' }); return reply(tr() ? `${namedPlayer} gol grafiğini açıyorum.` : `Opening ${namedPlayer}'s goals graph.`); }
      if (/pasaport|passport|profil|profile|ac|goster|open|show/.test(phrase)) {
        selectPlayer(namedPlayer);
        const rank = info?.fpi?.rank; const rating = info?.fpi?.rating;
        return reply(tr() ? `${namedPlayer} oyuncu pasaportunu açıyorum${rank ? `. World Standing #${rank}, rating ${rating}` : ''}.` : `Opening ${namedPlayer}'s player passport${rank ? `. World Standing #${rank}, rating ${rating}` : ''}.`);
      }
      if (/kacinci|sira|standing|rating/.test(phrase)) {
        const rank = info?.fpi?.rank; const rating = info?.fpi?.rating;
        return reply(rank ? (tr() ? `${namedPlayer}, Player Standing'de #${rank}. Standing Rating ${rating}.` : `${namedPlayer} is #${rank} in Player Standing with a ${rating} rating.`) : (tr() ? `${namedPlayer} için Standing verisi bulamadım.` : `I couldn't find Standing data for ${namedPlayer}.`));
      }
      if (/kac sampiyon|sampiyonluk|titles?/.test(phrase)) {
        const titles = info?.all?.titles ?? info?.uni?.titles ?? 0;
        return reply(tr() ? `${namedPlayer} kariyerinde ${titles} şampiyonluk bulunuyor.` : `${namedPlayer} has ${titles} career titles.`);
      }
      if (/ozet|analiz|nasil|summary|analyse|analyze/.test(phrase)) {
        const rank = info?.fpi?.rank ?? '—'; const rating = info?.fpi?.rating ?? '—'; const ppg = info?.all?.ppg ?? info?.uni?.ppg ?? 0; const titles = info?.all?.titles ?? 0;
        return reply(tr() ? `${namedPlayer}: Standing #${rank}, rating ${rating}, tüm zamanlar PPG ${Number(ppg).toFixed(2)}, ${titles} şampiyonluk. ${info?.fpi?.fpi?.signal || ''}` : `${namedPlayer}: Standing #${rank}, rating ${rating}, all-time PPG ${Number(ppg).toFixed(2)}, ${titles} titles. ${info?.fpi?.fpi?.signal || ''}`,
          [{ left: 'Standing', right: `#${rank} · ${rating}` }, { left: 'PPG', right: Number(ppg).toFixed(2) }, { left: tr() ? 'Şampiyonluk' : 'Titles', right: String(titles) }]);
      }
    }

    // Navigation and table intents
    if (/kim lider|standing lider|who leads|leader/.test(phrase)) {
      const leader = data.fpi.summary?.leader || data.fpi.players?.[0];
      if (leader) { openStandingCentre(); return reply(tr() ? `Player Standing lideri ${leader.name}. Rating ${leader.rating}.` : `Player Standing leader is ${leader.name}, rated ${leader.rating}.`, [{ left: `#${leader.rank}`, right: `${leader.name} · ${leader.rating}` }]); }
    }
    if (/player standing|standing merkezi|standing centre|elo/.test(phrase)) { openStandingCentre(); return reply(tr() ? 'Player Standing merkezini açıyorum.' : 'Opening Player Standing Centre.'); }
    if (/puan durumu|puan tablosu|current table|standings|ppg/.test(phrase)) {
      const rows = topTournamentRows(data, 5); navigate('seasonhub');
      const text = rows.length ? (tr() ? `Güncel ilk üç: ${rows.slice(0,3).map(r => `${r.rank}. ${r.name}, ${r.ppg.toFixed(3)} PPG`).join('; ')}.` : `Current top three: ${rows.slice(0,3).map(r => `${r.rank}. ${r.name}, ${r.ppg.toFixed(3)} PPG`).join('; ')}.`) : (tr() ? 'Aktif puan tablosu henüz oluşmadı.' : 'The active table is not available yet.');
      return reply(text, rows.map(r => ({ left: `#${r.rank} ${r.name}`, right: `${r.ppg.toFixed(3)} PPG` })));
    }
    if (/son ?10 mac|son on mac|last ?10|latest results|sonuclari/.test(phrase)) {
      const rows = latestResults(data, 10); navigate('livehub');
      const lead = rows.slice(0, 3).map(r => `${r.home} ${r.homeScore}-${r.awayScore} ${r.away}`).join('; ');
      return reply(rows.length ? (tr() ? `Son 10 sonuç ekranını açıyorum. En yeniler: ${lead}.` : `Opening the last 10 results. Latest: ${lead}.`) : (tr() ? 'Henüz kayıtlı sonuç yok.' : 'No results are recorded yet.'), rows.map(r => ({ left: `${r.home} ${r.homeScore}-${r.awayScore} ${r.away}`, right: r.edition })));
    }
    if (/turnuva agac|bracket|eslesme agac/.test(phrase)) { navigate('dashboard', () => document.querySelector('.ltm-tree, .live-tournament-tree, [data-live-table-motion]')?.scrollIntoView?.({ behavior:'smooth', block:'center' })); return reply(tr() ? 'Canlı turnuva ağacına gidiyorum.' : 'Taking you to the live tournament tree.'); }
    if (/turnuva|fifa ?10/.test(phrase) && /ac|git|goster|open|go|show/.test(phrase)) { navigate('seasonhub'); return reply(tr() ? 'FIFA 10 turnuva merkezini açıyorum.' : 'Opening the FIFA 10 tournament centre.'); }
    if (/canli mac|live match/.test(phrase)) { navigate('livematch'); return reply(tr() ? 'Canlı Maç Studio açılıyor.' : 'Opening Live Match Studio.'); }
    if (/canli istatistik|live stats/.test(phrase)) { navigate('livestats'); return reply(tr() ? 'Canlı İstatistikler açılıyor.' : 'Opening live statistics.'); }
    if (/form merkezi|form centre|form center/.test(phrase)) { navigate('form'); return reply(tr() ? 'Form Merkezi açılıyor.' : 'Opening Form Centre.'); }
    if (/oran|odds/.test(phrase)) { navigate('odds'); return reply(tr() ? 'Maç Oranları merkezini açıyorum.' : 'Opening Match Odds.'); }
    if (/tum zaman|all time|rekor|history/.test(phrase)) { navigate('alltime'); return reply(tr() ? 'Tüm Zamanlar merkezini açıyorum.' : 'Opening All-Time Centre.'); }
    if (/oyuncular|players/.test(phrase)) { navigate('playershub'); return reply(tr() ? 'Oyuncu pasaportlarını açıyorum.' : 'Opening Player Passports.'); }
    if (/medya|media/.test(phrase)) { navigate('mediahub'); return reply(tr() ? 'Medya merkezini açıyorum.' : 'Opening Media Centre.'); }
    if (/ana sayfa|home|universe/.test(phrase) && /ac|git|don|open|go|back/.test(phrase)) { navigate('dashboard'); return reply(tr() ? 'Universe ana sayfasına dönüyorum.' : 'Returning to Universe Home.'); }
    if (/ozet|durum|ne oluyor|brief|summary/.test(phrase)) { const s = summaryReply(data); return reply(s.text, s.rich); }

    // Help / fallback
    const suggestions = tr()
      ? ['“Puan durumunu göster”', '“Son 10 maçı göster”', '“Kerim Özmen müzesini aç”', '“Çağlar Can Tatar ile Kerim Özmen’i karşılaştır”', '“En farklı galibiyet kimde?”']
      : ['“Show the standings”', '“Show the last 10 results”', '“Open Kerim Özmen museum”', '“Compare Çağlar Can Tatar and Kerim Özmen”', '“Who has the biggest win?”'];
    reply(tr() ? `Bu komutu henüz güvenle eşleştiremedim. Şunları deneyebilirsin: ${suggestions.join(', ')}.` : `I couldn't safely map that command yet. Try: ${suggestions.join(', ')}.`);
  }

  async function ensureMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) return { ok: true, legacy: true };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      stream.getTracks().forEach(track => track.stop());
      return { ok: true };
    } catch (error) {
      const name = String(error?.name || '');
      if (/NotAllowedError|SecurityError/i.test(name)) {
        reply(tr()
          ? 'Chrome mikrofon erişimini engelliyor. Android Ayarlar > Uygulamalar > Chrome > İzinler > Mikrofon bölümünü İzin Ver yap; sonra Chrome içinde site ayarlarından Mikrofonu da İzin Ver seç.'
          : 'Chrome is blocking microphone access. Allow microphone access for Chrome in system settings and for this site in Chrome site settings.', [], { speak: false });
      } else if (/NotFoundError|DevicesNotFoundError/i.test(name)) {
        reply(tr() ? 'Telefonda kullanılabilir mikrofon bulunamadı.' : 'No usable microphone was found on this device.', [], { speak: false });
      } else {
        reply(tr() ? `Mikrofon ön kontrolü başarısız: ${name || 'unknown'}.` : `Microphone preflight failed: ${name || 'unknown'}.`, [], { speak: false });
      }
      return { ok: false, error };
    }
  }

  function speechErrorMessage(code) {
    const c = String(code || 'unknown');
    if (c === 'not-allowed' || c === 'service-not-allowed') return tr()
      ? 'Ses tanıma izni reddedildi. Chrome site ayarlarında Mikrofon = İzin ver olmalı.'
      : 'Speech recognition permission was denied. Set Microphone to Allow in Chrome site settings.';
    if (c === 'audio-capture') return tr() ? 'Chrome mikrofondan ses alamıyor. Telefonun Chrome mikrofon iznini kontrol et.' : 'Chrome cannot capture microphone audio. Check Chrome microphone permission.';
    if (c === 'network') return tr()
      ? 'Chrome ses tanıma servisine bağlanamadı. İnternet bağlantısını ve Android’de Google / Speech Services güncellemelerini kontrol et.'
      : 'Chrome could not reach the speech recognition service. Check your connection and speech services.';
    if (c === 'no-speech') return tr() ? 'Seni duyamadım. Mikrofona biraz daha yakın konuşup tekrar dokun.' : 'I did not hear speech. Try again closer to the microphone.';
    if (c === 'language-not-supported') return tr() ? 'Türkçe ses tanıma bu cihazda hazır değil.' : 'This speech-recognition language is not available on the device.';
    if (c === 'aborted') return '';
    return tr() ? `Ses tanıma hatası: ${c}.` : `Speech recognition error: ${c}.`;
  }

  async function startListening() {
    if (!state.recognitionSupported) {
      reply(tr() ? 'Bu Chrome sürümünde Web Speech Recognition hazır değil. Yazı kutusuna dokunup telefon klavyesindeki mikrofonu kullanabilirsin.' : 'Web Speech Recognition is not available in this Chrome build. Focus the text field and use the keyboard microphone.', [], { speak: false });
      document.querySelector('#orionCommandInput')?.focus();
      return;
    }
    if (state.listening) { try { state.recognition?.stop?.(); } catch (_) {} return; }

    // Mobile Chrome behaves more reliably if microphone permission is explicitly
    // established by getUserMedia before SpeechRecognition starts.
    if (isMobile()) {
      const permission = await ensureMicrophonePermission();
      if (!permission.ok) return;
      await sleep(120);
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    state.recognition = recognition;
    recognition.lang = tr() ? 'tr-TR' : 'en-US';
    recognition.continuous = false;
    // Chrome Android has partial Web Speech support. One-shot final results are
    // substantially more stable than interim streaming on mobile.
    recognition.interimResults = !isMobile();
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setListening(true);
      clearTimeout(listenTimeout);
      listenTimeout = setTimeout(() => {
        try { recognition.stop(); } catch (_) {}
      }, isMobile() ? 9000 : 14000);
    };
    recognition.onend = () => {
      clearTimeout(listenTimeout);
      setListening(false);
    };
    recognition.onerror = event => {
      clearTimeout(listenTimeout);
      setListening(false);
      const message = speechErrorMessage(event.error);
      if (message) reply(message, [], { speak: false });
      if (isMobile() && ['network','not-allowed','service-not-allowed','audio-capture'].includes(String(event.error))) {
        const input = document.querySelector('#orionCommandInput');
        if (input) {
          input.focus();
          input.placeholder = tr() ? 'Alternatif: klavyedeki 🎤 mikrofonuna dokun…' : 'Fallback: tap the 🎤 microphone on your keyboard…';
        }
      }
    };
    recognition.onresult = event => {
      let interim = ''; let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += text; else interim += text;
      }
      const input = document.querySelector('#orionCommandInput');
      if (input) input.value = finalText || interim;
      if (finalText.trim()) executeCommand(finalText.trim());
    };
    try {
      recognition.start();
    } catch (error) {
      clearTimeout(listenTimeout);
      setListening(false);
      reply(tr() ? `Ses motoru başlatılamadı: ${error?.name || 'unknown'}. Klavye mikrofonunu kullanabilirsin.` : `Speech engine could not start: ${error?.name || 'unknown'}. You can use the keyboard microphone.`, [], { speak: false });
      document.querySelector('#orionCommandInput')?.focus();
    }
  }

  function setListening(value) {
    state.listening = value;
    document.querySelector('.orion-launcher')?.classList.toggle('listening', value);
    document.querySelector('#orionWave')?.classList.toggle('active', value || state.speaking);
    const status = document.querySelector('#orionListenStatus');
    if (status) status.textContent = value ? (tr() ? 'DİNLİYOR' : 'LISTENING') : (tr() ? 'HAZIR' : 'READY');
  }

  function updateMuteButton() {
    const btn = document.querySelector('[data-orion-mute]');
    if (btn) btn.textContent = state.muted ? '🔇' : '🔊';
  }

  function updateContextDisplay() {
    const data = getData();
    const view = document.querySelector('#orionContextView');
    const player = document.querySelector('#orionContextPlayer');
    if (view) view.innerHTML = `${tr() ? 'EKRAN' : 'VIEW'} · <b>${escapeHTML(routeLabel(data.activeView))}</b>`;
    if (player) player.innerHTML = `${tr() ? 'BAĞLAM' : 'CONTEXT'} · <b>${escapeHTML(currentContextPlayer(data) || (tr() ? 'Genel Evren' : 'Universe'))}</b>`;
  }

  function spatialNodes(data) {
    const standingLeader = data.fpi.summary?.leader || data.fpi.players?.[0];
    const tournamentLeader = data.standings?.[0];
    const recent = latestResults(data, 1)[0];
    const completed = (data.draw?.fixtures || []).filter(row => row.completed).length;
    const total = data.draw?.fixtures?.length || 78;
    const contextName = currentContextPlayer(data);
    const context = playerInfo(contextName, data);
    return [
      { route:'dashboard', icon:'◎', title:'UNIVERSE CORE', sub:tr()?'Ana komuta merkezi':'Primary command core', value:`${data.allTime.summary?.matches || data.matches.length || 0} MP`, x:-370,y:-165,z:-60 },
      { route:'livehub', icon:'●', title:'LIVE ARENA', sub:recent ? `${recent.home} ${recent.homeScore}-${recent.awayScore} ${recent.away}` : (tr()?'Sonuç bekleniyor':'Awaiting result'), value:tr()?'CANLI':'LIVE', x:0,y:-245,z:70 },
      { route:'seasonhub', icon:'10', title:'FIFA 10', sub:tournamentLeader ? `${tournamentLeader.name} · ${Number(tournamentLeader.ppg||0).toFixed(3)} PPG` : (tr()?'Turnuva sistemi':'Tournament system'), value:`${completed}/${total}`, x:360,y:-155,z:-30 },
      { route:'playershub', icon:'✦', title:'PLAYER GALAXY', sub:contextName ? contextName : `${data.allTime.summary?.players || data.fpi.players?.length || 0} ${tr()?'oyuncu':'players'}`, value:context?.fpi ? `#${context.fpi.rank}` : 'PASSPORT', x:410,y:80,z:80 },
      { route:'alltime', icon:'♛', title:'ALL-TIME VAULT', sub:data.allTime.records?.titles ? `${data.allTime.records.titles.name} · ${data.allTime.records.titles.titles} ${tr()?'kupa':'titles'}` : (tr()?'Rekorlar ve miras':'Records & legacy'), value:`${data.allTime.summary?.editions || 10} ERA`, x:255,y:245,z:-60 },
      { route:'intelligence', icon:'Σ', title:'AI ANALYTICS', sub:standingLeader ? `${standingLeader.name} · ${standingLeader.rating}` : (tr()?'Standing zekâsı':'Standing intelligence'), value:standingLeader ? `#${standingLeader.rank}` : 'AI', x:-20,y:285,z:90 },
      { route:'mediahub', icon:'▤', title:'MEDIA STUDIO', sub:tr()?'Yayın, afiş ve hikâye':'Broadcast, posters & stories', value:'VISUAL', x:-300,y:235,z:-30 },
      { route:'livematch', icon:'◉', title:'LIVE MATCH STUDIO', sub:tr()?'Canlı anlatım ve baskı':'Live commentary & pressure', value:'STUDIO', x:-425,y:55,z:65 }
    ];
  }

  function renderSpatialWorld() {
    const data = getData();
    const nodes = spatialNodes(data);
    const leader = data.fpi.summary?.leader || data.fpi.players?.[0];
    const core = document.querySelector('#spatialWorld');
    if (!core) return;
    core.style.setProperty('--rx', `${state.rx}deg`); core.style.setProperty('--ry', `${state.ry}deg`); core.style.setProperty('--zoom', `${state.zoom}px`);
    core.innerHTML = `<div class="spatial-orbit o1"></div><div class="spatial-orbit o2"></div>
      <div class="spatial-core"><div><span>SPATIAL AI</span><strong>FIFA UNIVERSE<br>V5.0</strong><small>${leader ? `${leader.name} · #${leader.rank}` : 'ORION ONLINE'}</small></div></div>
      ${nodes.map(node => `<button type="button" class="spatial-node" data-spatial-route="${node.route}" style="transform:translate3d(${node.x}px,${node.y}px,${node.z}px)"><i>${node.icon}</i><strong>${node.title}</strong><small>${escapeHTML(node.sub)}</small><b>${escapeHTML(node.value)}</b></button>`).join('')}`;
    updateContextDisplay();
  }

  function renderShell() {
    if (document.querySelector('#spatialAiShell')) return;
    const launcher = document.createElement('button');
    launcher.type = 'button'; launcher.className = 'orion-launcher'; launcher.setAttribute('aria-label', 'ORION Spatial AI'); launcher.innerHTML = '<span class="orion-glyph">OR</span>';
    document.body.appendChild(launcher);

    const shell = document.createElement('section');
    shell.id = 'spatialAiShell'; shell.className = 'spatial-ai-shell'; shell.setAttribute('aria-hidden','true');
    shell.innerHTML = `<header class="spatial-ai-topbar">
      <div class="spatial-ai-brand"><i>OR</i><div><strong>ORION · SPATIAL AI</strong><small>FIFA UNIVERSE V5.0 · CONTEXT ENGINE</small></div></div>
      <div class="spatial-ai-status"><i></i><span id="orionTopStatus">ONLINE · LOCAL INTELLIGENCE</span></div>
      <button type="button" data-orion-cinematic>◈ ${tr()?'Sinematik':'Cinematic'}</button>
      <button type="button" data-orion-mute>${state.muted ? '🔇' : '🔊'}</button>
      <button type="button" data-orion-close>✕</button>
    </header>
    <div class="spatial-ai-body">
      <section class="spatial-stage" id="spatialStage">
        <div class="spatial-stage-grid"></div>
        <div class="spatial-world" id="spatialWorld"></div>
        <div class="spatial-help"><span>${tr()?'Sürükle: evreni döndür':'Drag: rotate universe'}</span><span>${tr()?'Tekerlek: zoom':'Wheel: zoom'}</span><span>Ctrl+Shift+Space: ORION</span></div>
        <aside class="orion-comparison" id="orionComparison"></aside>
      </section>
      <aside class="orion-console">
        <header><div class="orb" id="orionConsoleOrb"></div><div><strong>ORION</strong><small><span id="orionListenStatus">${tr()?'HAZIR':'READY'}</span> · ${state.recognitionSupported ? (tr()?'SES AKTİF':'VOICE READY') : (tr()?'YAZILI MOD':'TEXT MODE')}</small></div><button type="button" data-orion-clear>⌫</button></header>
        <div class="orion-context"><span id="orionContextView"></span><span id="orionContextPlayer"></span></div>
        <div class="orion-transcript" id="orionTranscript"></div>
        <div class="orion-input-zone"><form id="orionCommandForm"><div class="orion-input-row"><button type="button" class="listen" data-orion-listen>◉</button><input id="orionCommandInput" autocomplete="off" placeholder="${tr()?'ORION’a bir şey söyle veya yaz…':'Tell ORION what you need…'}"/><button type="submit">↗</button></div></form><button type="button" class="orion-keyboard-mic" data-orion-keyboard-mic>${tr()?'⌨️ Telefon klavyesi mikrofonu':'⌨️ Keyboard microphone'}</button>
          <div class="orion-quick"><button data-orion-command="puan durumunu göster">${tr()?'Puan durumu':'Standings'}</button><button data-orion-command="son 10 maçı göster">${tr()?'Son 10':'Last 10'}</button><button data-orion-command="kim lider">${tr()?'Lider kim?':'Leader?'}</button><button data-orion-command="en farklı galibiyet">${tr()?'Rekor':'Record'}</button><button data-orion-command="turnuva ağacını göster">${tr()?'Ağaç':'Bracket'}</button></div>
          <div class="orion-wave" id="orionWave">${'<i></i>'.repeat(7)}</div>
        </div>
      </aside>
    </div>`;
    document.body.appendChild(shell);

    addMessage('ai', tr() ? 'ORION çevrimiçi. “Puan durumunu göster”, “Son 10 maçı göster” veya bir oyuncunun adını söyleyebilirsin.' : 'ORION online. Try “show the standings”, “show the last 10 results”, or say a player name.');
    bindUI();
  }

  function openSpatial() {
    renderShell();
    state.open = true;
    document.body.classList.add('orion-space-open');
    const shell = document.querySelector('#spatialAiShell'); shell?.classList.add('open'); shell?.setAttribute('aria-hidden','false');
    renderSpatialWorld();
    updateContextDisplay();
    setTimeout(() => document.querySelector('#orionCommandInput')?.focus(), 80);
  }

  function closeSpatial(preserveSpeech = false) {
    state.open = false; state.cinematic = false;
    document.body.classList.remove('orion-space-open');
    const shell = document.querySelector('#spatialAiShell'); shell?.classList.remove('open'); shell?.setAttribute('aria-hidden','true');
    if (state.listening) try { state.recognition?.stop?.(); } catch (_) {}
    if (!preserveSpeech && 'speechSynthesis' in window) speechSynthesis.cancel();
  }

  let cinematicTimer = null;
  function toggleCinematic() {
    state.cinematic = !state.cinematic;
    if (cinematicTimer) { clearInterval(cinematicTimer); cinematicTimer = null; }
    if (state.cinematic) {
      cinematicTimer = setInterval(() => {
        if (!state.open) return;
        state.ry = (state.ry + 22) % 360;
        state.rx = -9 + Math.sin(state.ry * Math.PI / 180) * 5;
        const world = document.querySelector('#spatialWorld');
        if (world) { world.style.setProperty('--ry', `${state.ry}deg`); world.style.setProperty('--rx', `${state.rx}deg`); }
      }, 1500);
    }
    const button = document.querySelector('[data-orion-cinematic]');
    if (button) button.classList.toggle('active', state.cinematic);
  }

  function bindSpatialDrag(stage) {
    let dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;
    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('.spatial-node,.orion-comparison')) return;
      dragging = true; startX = event.clientX; startY = event.clientY; baseX = state.ry; baseY = state.rx; stage.setPointerCapture?.(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
      if (!dragging) return;
      state.ry = baseX + (event.clientX - startX) * .28;
      state.rx = clamp(baseY - (event.clientY - startY) * .2, -35, 24);
      const world = document.querySelector('#spatialWorld'); if (world) { world.style.setProperty('--ry', `${state.ry}deg`); world.style.setProperty('--rx', `${state.rx}deg`); }
    });
    const stop = event => { dragging = false; try { stage.releasePointerCapture?.(event.pointerId); } catch (_) {} };
    stage.addEventListener('pointerup', stop); stage.addEventListener('pointercancel', stop);
    stage.addEventListener('wheel', event => {
      event.preventDefault(); state.zoom = clamp(state.zoom - event.deltaY * .18, -240, 260); document.querySelector('#spatialWorld')?.style.setProperty('--zoom', `${state.zoom}px`);
    }, { passive:false });
  }

  function bindUI() {
    document.querySelector('.orion-launcher')?.addEventListener('click', openSpatial);
    document.querySelector('[data-orion-close]')?.addEventListener('click', closeSpatial);
    document.querySelector('[data-orion-mute]')?.addEventListener('click', () => { state.muted = !state.muted; savePrefs(); updateMuteButton(); if (state.muted && 'speechSynthesis' in window) speechSynthesis.cancel(); });
    document.querySelector('[data-orion-listen]')?.addEventListener('click', startListening);
    document.querySelector('[data-orion-keyboard-mic]')?.addEventListener('click', () => { const input=document.querySelector('#orionCommandInput'); input?.focus(); if(input) input.placeholder=tr()?'Klavyedeki 🎤 simgesine dokun ve konuş…':'Tap the 🎤 icon on your keyboard and speak…'; });
    document.querySelector('[data-orion-cinematic]')?.addEventListener('click', toggleCinematic);
    document.querySelector('[data-orion-clear]')?.addEventListener('click', () => { state.messages = []; addMessage('ai', tr() ? 'Yeni oturum hazır.' : 'New session ready.'); });
    document.querySelector('#orionCommandForm')?.addEventListener('submit', event => { event.preventDefault(); const input = document.querySelector('#orionCommandInput'); const value = input?.value?.trim(); if (value) { input.value = ''; executeCommand(value); } });
    document.querySelectorAll('[data-orion-command]').forEach(button => button.addEventListener('click', () => executeCommand(button.dataset.orionCommand)));
    document.querySelector('#spatialAiShell')?.addEventListener('click', event => {
      const route = event.target.closest('[data-spatial-route]')?.dataset.spatialRoute;
      if (route) { navigate(route); reply(tr() ? `${routeLabel(route)} açılıyor.` : `Opening ${routeLabel(route)}.`); return; }
      if (event.target.closest('[data-orion-close-compare]')) setComparison(null);
    });
    const stage = document.querySelector('#spatialStage'); if (stage) bindSpatialDrag(stage);
  }

  function bindGlobal() {
    document.addEventListener('keydown', event => {
      if (event.ctrlKey && event.shiftKey && event.code === 'Space') { event.preventDefault(); state.open ? closeSpatial() : openSpatial(); return; }
      if (event.key === 'Escape' && state.open) { closeSpatial(); return; }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && state.open) { event.preventDefault(); document.querySelector('#orionCommandInput')?.focus(); }
    });
    document.addEventListener('change', event => {
      if (event.target?.id === 'v2PlayerSelect') { state.contextPlayer = event.target.value; savePrefs(); updateContextDisplay(); }
    });
    window.addEventListener('storage', event => { if (event.key === PLAYER_KEY) { state.contextPlayer = event.newValue || ''; updateContextDisplay(); } });
    // Keep the lightweight orb alive without touching app rendering.
    const watch = new MutationObserver(() => {
      if (!document.querySelector('.orion-launcher')) renderShell();
      if (state.open) updateContextDisplay();
    });
    watch.observe(document.body, { childList:true, subtree:false });
  }

  function boot() {
    if (window.__FIFA_SPATIAL_AI_V500__) return;
    window.__FIFA_SPATIAL_AI_V500__ = true;
    renderShell(); bindGlobal();
    window.ORION = { open: openSpatial, close: closeSpatial, ask: executeCommand, listen: startListening, data: getData, version: VERSION };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
