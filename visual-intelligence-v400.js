(() => {
  const BUILD = '4.0.1-visual-intelligence-hotfix';
  const BUILD_QUERY = '401000';
  const NS = 'vi400';
  let raf = 0;
  let observer;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const slug = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9çğıöşü]+/g, '-');
  const parseNum = (v) => {
    const m = String(v ?? '').replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const uniq = (arr) => [...new Map(arr.map((v) => [v.key || JSON.stringify(v), v])).values()];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  function boot() {
    if (window.__FIFA_VISUAL_INTELLIGENCE_V400__) return;
    window.__FIFA_VISUAL_INTELLIGENCE_V400__ = true;
    setBuildIndicators();
    attachObserver();
    scheduleHydrate();
    window.addEventListener('resize', scheduleHydrate, { passive: true });
  }

  function setBuildIndicators() {
    const meta = $('meta[name="fifa9-build"]');
    if (meta) meta.setAttribute('content', BUILD);
    const title = $('#pageTitle');
    if (title && /FIFA Universe/i.test(txt(title))) title.textContent = 'FIFA Universe 4.0';
    const bc = $('#hubBreadcrumb b');
    if (bc) bc.textContent = 'VERSION 4.0';
    const footer = $('.sidebar-version');
    if (footer) footer.textContent = 'FIFA Universe · V4.0 · Visual Intelligence';
    document.documentElement.style.setProperty('--vi-build-query', BUILD_QUERY);
  }

  const ROUTE_BLOCKS = {
    dashboard: new Set(['dashboard-hero', 'story-grid', 'galaxy', 'dynasty-map']),
    players: new Set(['living-card', 'prime-timeline', 'rivalry-poster']),
    alltime: new Set(['record-wall', 'hall-of-immortals', 'alltime-galaxy']),
    live: new Set(['matchday-live']),
    media: new Set(['matchday-media']),
    tournaments: new Set(),
    admin: new Set()
  };

  function attachObserver() {
    if (observer) observer.disconnect();
    const target = $('#view') || document.body;
    observer = new MutationObserver((records) => {
      const externalChange = records.some((record) => {
        const node = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
        return !node?.closest?.(`[data-${NS}]`);
      });
      if (externalChange) scheduleHydrate();
    });
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-v2-route'] });
  }

  function scheduleHydrate() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(hydrate);
  }

  function routeFromId(value) {
    const id = String(value || '').toLowerCase();
    if (['dashboard', 'home'].includes(id)) return 'dashboard';
    if (['playershub', 'players', 'player'].includes(id)) return 'players';
    if (['recordshub', 'alltime', 'records', 'archive'].includes(id)) return 'alltime';
    if (['livehub', 'livematch', 'livestats'].includes(id)) return 'live';
    if (['mediahub', 'media', 'print'].includes(id)) return 'media';
    if (['tournaments', 'seasonhub', 'knockout', 'benchmark'].includes(id)) return 'tournaments';
    if (['adminhub', 'backup', 'teams'].includes(id)) return 'admin';
    return '';
  }

  function cleanupRouteBlocks(route) {
    const allowed = ROUTE_BLOCKS[route] || new Set();
    $$(`[data-${NS}]`).forEach((node) => {
      const id = node.dataset[NS];
      if (!allowed.has(id)) node.remove();
    });
  }

  function hydrate() {
    if (observer) observer.disconnect();
    try {
      setBuildIndicators();
      const route = detectRoute();
      cleanupRouteBlocks(route);
      document.body.classList.remove('vi-route-dashboard', 'vi-route-players', 'vi-route-alltime', 'vi-route-live', 'vi-route-media', 'vi-route-tournaments', 'vi-route-admin');
      document.body.classList.add(`vi-route-${route}`);
      if (route === 'dashboard') enhanceDashboard();
      else if (route === 'players') enhancePlayers();
      else if (route === 'alltime') enhanceAllTime();
      else if (route === 'live' || route === 'media') enhanceMatchday(route);
    } finally {
      requestAnimationFrame(attachObserver);
    }
  }

  function detectRoute() {
    const bodyRoute = routeFromId(document.body.dataset.v2Route);
    if (bodyRoute) return bodyRoute;

    const activeButton = document.querySelector([
      '.os-primary-nav button.active',
      '.v2-primary-nav button.active',
      '.hub-nav .nav-item.active',
      '.main-nav .nav-item.active',
      '[data-nav][aria-current="page"]'
    ].join(','));
    const navRoute = routeFromId(activeButton?.dataset?.nav);
    if (navRoute) return navRoute;

    const pageTitle = txt($('#pageTitle')).toLowerCase();
    if (/oyuncu|player/.test(pageTitle)) return 'players';
    if (/tüm zaman|all[- ]?time|record|miras|legacy/.test(pageTitle)) return 'alltime';
    if (/turnuva|tournament|championship|final chapter/.test(pageTitle)) return 'tournaments';
    if (/canlı|live/.test(pageTitle)) return 'live';
    if (/medya|media|broadcast|print/.test(pageTitle)) return 'media';
    if (/admin|yönetim|operation/.test(pageTitle)) return 'admin';
    return 'dashboard';
  }

  function ensureBlock(id, className, html, parent, afterSelector) {
    if (!parent) return null;
    let node = parent.querySelector(`[data-${NS}="${id}"]`);
    if (!node) {
      node = document.createElement('section');
      node.dataset[NS] = id;
      node.className = className;
      if (afterSelector) {
        const anchor = parent.querySelector(afterSelector);
        if (anchor?.nextSibling) anchor.parentNode.insertBefore(node, anchor.nextSibling);
        else if (anchor?.parentNode) anchor.parentNode.appendChild(node);
        else parent.prepend(node);
      } else parent.prepend(node);
    }
    node.innerHTML = html;
    return node;
  }

  function deriveArchetype(metrics = {}) {
    const attack = metrics.attack ?? 55;
    const defense = metrics.defense ?? 55;
    const bigMatch = metrics.bigMatch ?? 55;
    const momentum = metrics.momentum ?? 55;
    const titles = metrics.titles ?? 0;
    if (titles >= 2 && bigMatch >= 70) return { key: 'dynasty', title: 'Dynasty Engine', desc: 'Kupa üretimi, yüksek tepe performans ve kalıcı kariyer ağırlığı ile hanedan etkisi yaratıyor.' };
    if (bigMatch >= 78) return { key: 'bigmarch', title: 'Big Match Hunter', desc: 'Büyük akşamlarda güçlenen, kritik eşiklerde seviyesini yükselten ölümcül oyuncu profili.' };
    if (defense - attack >= 10) return { key: 'wall', title: 'Iron Wall', desc: 'Savunma güvenliği, disiplin ve yıpratıcı dayanıklılık sayesinde rakibini tüketen profil.' };
    if (momentum >= 70) return { key: 'rising', title: 'Rising Signal', desc: 'Form eğrisi yukarı yönlü, ivmesi artan ve sıradaki sıçramaya hazır oyuncu profili.' };
    return { key: 'balanced', title: 'Balanced Architect', desc: 'Oyunun tüm fazlarına dokunan, denge ve akıl üzerinden sürdürülebilir başarı kurgulayan yapı.' };
  }

  function findTextNumber(root, label) {
    const nodes = $$('button,article,div,li,td', root);
    const target = nodes.find((el) => txt(el).toLowerCase().includes(label.toLowerCase()));
    return target ? parseNum(txt(target)) : null;
  }

  function metricValueByLabel(root, selector, label) {
    const wanted = label.toLowerCase();
    const node = $$(selector, root).find((el) => {
      const labelNode = el.querySelector('span');
      return txt(labelNode).toLowerCase() === wanted || txt(labelNode).toLowerCase().includes(wanted);
    });
    if (!node) return null;
    return parseNum(txt(node.querySelector('b,strong')));
  }

  function parsePlayerContext() {
    const root = $('#view') || document.body;
    const selected = $('select#v2PlayerSelect option:checked, .v2-player-picker select option:checked', root);
    let name = txt(selected);
    if (!name) {
      const identity = $('.v2-passport-hero .identity h3', root) || $('.v2-standing-identity h3', root);
      name = txt(identity).replace(/\s*·\s*World\s*#\d+.*/i, '').trim();
    }
    if (!name) name = 'Seçili Oyuncu';

    const heroMetrics = $('.v2-passport-hero .metrics', root);
    const standingMetrics = $('.v2-standing-identity-metrics', root);
    const standingDna = $('.v2-standing-dna', root);
    const performanceStrip = $('.v2-passport-performance-strip', root);
    const worldRank = parseNum((txt($('.v2-standing-identity h3', root)).match(/World\s*#(\d+)/i) || [])[1]) || 0;
    const liveRank = heroMetrics ? metricValueByLabel(heroMetrics, 'article', 'LIVE') : 0;
    const standingRating = standingMetrics ? metricValueByLabel(standingMetrics, 'article', 'STANDING RATING') : 1500;
    const standingIndex = standingMetrics ? metricValueByLabel(standingMetrics, 'article', 'STANDING INDEX') : 50;
    const momentum = standingDna ? (metricValueByLabel(standingDna, 'article', 'Momentum') ?? 55) : 55;
    const consistency = standingDna ? (metricValueByLabel(standingDna, 'article', 'Consistency') ?? 55) : 55;
    const dominance = standingDna ? (metricValueByLabel(standingDna, 'article', 'Dominance') ?? 55) : 55;
    const pressure = standingDna ? (metricValueByLabel(standingDna, 'article', 'Pressure Index') ?? 55) : 55;
    const attack = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Hücum') ?? metricValueByLabel(performanceStrip, 'button', 'Attack') ?? Math.round((dominance + pressure) / 2)) : Math.round((dominance + pressure) / 2);
    const defense = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Savunma') ?? metricValueByLabel(performanceStrip, 'button', 'Defence') ?? Math.round((consistency + (100 - Math.min(90, pressure))) / 2)) : Math.round((consistency + (100 - Math.min(90, pressure))) / 2);
    const bigMatch = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Büyük Maç') ?? metricValueByLabel(performanceStrip, 'button', 'Big Match') ?? Math.round((pressure + momentum) / 2)) : Math.round((pressure + momentum) / 2);
    const matches = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Oynadığı Maç') ?? metricValueByLabel(performanceStrip, 'button', 'Matches Played') ?? 0) : 0;
    const gfPerMatch = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Ort. Attığı Gol') ?? metricValueByLabel(performanceStrip, 'button', 'Avg Goals For')) : null;
    const gaPerMatch = performanceStrip ? (metricValueByLabel(performanceStrip, 'button', 'Ort. Yediği Gol') ?? metricValueByLabel(performanceStrip, 'button', 'Avg Goals Against')) : null;
    const legacy = heroMetrics ? (metricValueByLabel(heroMetrics, 'article', 'LEGACY') ?? 50) : 50;
    const prime = heroMetrics ? (metricValueByLabel(heroMetrics, 'article', 'PRIME') ?? 50) : 50;
    const titleShelf = $$('.v2-museum-shelf', root).find((el) => /şampiyonluk kupaları|championship trophies/i.test(txt(el.querySelector('h4'))));
    const titles = titleShelf ? (parseNum(txt(titleShelf.querySelector('header b'))) || 0) : 0;

    const ratingBase = [attack, defense, bigMatch, consistency, dominance, pressure].filter(Number.isFinite);
    const overall = Math.round(ratingBase.reduce((a, b) => a + b, 0) / Math.max(1, ratingBase.length));
    const tier = overall >= 86 ? 'ICON' : overall >= 78 ? 'ELITE' : overall >= 70 ? 'CONTENDER' : overall >= 60 ? 'CHALLENGER' : 'RISING';
    const archetype = deriveArchetype({ attack, defense, bigMatch, momentum, titles });
    return { name, worldRank, liveRank, standingRating, standingIndex, momentum, consistency, dominance, pressure, attack, defense, bigMatch, matches, gfPerMatch, gaPerMatch, titles, legacy, prime, overall, tier, archetype };
  }

  function parsePrimeTimeline() {
    const root = $('#view') || document.body;
    const cards = $$('.v2-career-line article', root);
    if (cards.length) {
      return cards.slice(0, 12).map((card) => {
        const title = txt(card.querySelector('b')) || 'FIFA';
        const desc = txt(card.querySelector('span')) || 'Kariyer durağı';
        const score = txt(card.querySelector('small'));
        const cls = card.className.toLowerCase();
        const status = /prime|peak|zirve/.test(`${cls} ${desc.toLowerCase()}`) ? 'prime' : /decline|down|düşüş/.test(`${cls} ${desc.toLowerCase()}`) ? 'down' : /rise|reborn|yükseliş|yeniden/.test(`${cls} ${desc.toLowerCase()}`) ? 'rise' : 'base';
        return { title, desc: score ? `${desc} · ${score}` : desc, status };
      });
    }
    return [];
  }

  function parseRivalries(playerName) {
    const root = $('#view') || document.body;
    const cards = $$('.v2-rival-list article', root);
    return cards.slice(0, 6).map((card) => ({
      key: `${txt(card.querySelector('strong'))}-${txt(card.querySelector('b'))}`,
      name: txt(card.querySelector('strong')) || 'Rakip',
      score: clamp(parseNum(txt(card.querySelector('b'))) || 0, 0, 100),
      mp: parseNum(txt(card.querySelector('span'))) || 0,
      source: txt(card)
    })).filter((row) => row.name && row.name !== playerName);
  }

  function parseStandings() {
    const root = $('#view') || document.body;
    const tickerRows = $$('.v2-fpi-ticker .v2-fpi-track > button, .v2-standing-pulse .v2-fpi-track > button', root);
    if (tickerRows.length) {
      return tickerRows.slice(0, 16).map((row) => ({
        key: `${txt(row.querySelector('strong'))}-${txt(row.querySelector('i'))}`,
        name: txt(row.querySelector('strong')) || 'Oyuncu',
        score: parseNum(txt(row.querySelector('b'))) || 0,
        rank: parseNum(txt(row.querySelector('i'))) || 0
      }));
    }
    const tableRows = $$('.v2-live-table tbody tr, .v2-live-table table tr', root).filter((tr) => tr.querySelectorAll('td').length >= 2);
    if (tableRows.length) {
      return tableRows.slice(0, 16).map((tr, index) => {
        const cells = Array.from(tr.querySelectorAll('td'));
        const raw = cells.map(txt);
        const name = raw.find((v) => /[A-Za-zÇĞİÖŞÜçğıöşü]+\s+[A-Za-zÇĞİÖŞÜçğıöşü]+/.test(v)) || `Oyuncu ${index + 1}`;
        const score = raw.map(parseNum).filter(Number.isFinite).at(-1) || 0;
        const rank = parseNum(raw[0]) || index + 1;
        return { key: `${name}-${rank}`, name, score, rank };
      });
    }
    return [];
  }

  function parseAllTimeRecords() {
    const root = $('#view') || document.body;
    const records = [];
    const candidates = $$('article,div,li', root).map((el) => ({ el, text: txt(el) })).filter((x) => x.text && x.text.length < 220);
    candidates.forEach(({ text }) => {
      const looksRecord = /en |most |highest |longest |legacy|clean sheet|ppg|galibiyet|gol|seri|maç/i.test(text);
      if (!looksRecord) return;
      const lines = text.split(/(?=[A-ZÇĞİÖŞÜ][a-zçğıöşü])/).map((t) => t.trim()).filter(Boolean);
      const title = lines[0]?.slice(0, 60) || text.slice(0, 60);
      const value = parseNum(text.match(/(\d+(?:\.\d+)?)(?!.*\d)/)?.[1]);
      const ownerMatch = text.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)/);
      records.push({ key: `${title}-${ownerMatch?.[1] || ''}-${value}`, title, owner: ownerMatch?.[1] || 'Rekor Sahibi', value: value ?? '—', detail: text });
    });
    return uniq(records).slice(0, 12);
  }

  function parseChampions() {
    const root = $('#view') || document.body;
    const champions = [];
    const blocks = $$('article,div,li', root).map((el) => txt(el)).filter((t) => /FIFA\s*\d+/i.test(t) && /şampiyon|champion/i.test(t));
    blocks.forEach((t) => {
      const edition = (t.match(/FIFA\s*(\d{1,2})/i) || [])[1];
      const name = (t.match(/([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)/) || [])[1];
      if (edition && name) champions.push({ key: `f${edition}-${name}`, edition: Number(edition), name });
    });
    return uniq(champions).sort((a, b) => a.edition - b.edition).slice(0, 16);
  }

  function storyCardsFromData(standings, player) {
    const stories = [];
    const leader = standings[0];
    const hunter = standings[1];
    if (leader) stories.push({ color: 'rgba(123,214,255,.35)', tag: 'Lineal Crown', title: `${leader.name} lider baskıyı taşıyor`, body: `${leader.score} puan/reyting sinyali ile evrenin merkezinde. ${hunter ? hunter.name + ' en yakın takip' : 'Tahtı koruma zamanı'}.` });
    if (player?.archetype) stories.push({ color: 'rgba(211,108,255,.34)', tag: 'Passport AI', title: `${player.name} · ${player.archetype.title}`, body: `${player.archetype.desc} Overall ${player.overall} ile ${player.tier} seviyesinde tanımlandı.` });
    if (standings.length >= 3) stories.push({ color: 'rgba(255,216,119,.32)', tag: 'Standing Pulse', title: `${standings[2].name} üst koridora göz kırpıyor`, body: `Güncel puan akışında ilk üç sıkışıyor. ${standings.slice(0, 3).map((x) => x.name).join(' / ')} kısa bantta çarpışıyor.` });
    stories.push({ color: 'rgba(255,115,151,.32)', tag: 'Visual Director', title: 'Her veri artık bir görsel hikâye', body: 'Ana ekran, oyuncu pasaportu, rekor duvarı ve maç günü afişleri aynı görsel zekâ motoru altında çalışıyor.' });
    return stories.slice(0, 4);
  }

  function enhanceDashboard() {
    const view = $('#view');
    if (!view) return;
    const standings = parseStandings();
    const player = parsePlayerContext();
    const stories = storyCardsFromData(standings, player);
    const hero = ensureBlock(
      'dashboard-hero',
      'vi-hero',
      `
        <div class="vi-hero-grid">
          <div>
            <div class="vi-badge">FIFA Universe V4.0 · Visual Intelligence</div>
            <h2>Data becomes identity.<br/>History becomes visual.</h2>
            <p>Bu sürümde turnuva, oyuncu ve rekor akışı yalnız tablo olarak değil; yaşayan hikâye, görsel kimlik ve yayın estetiği olarak işleniyor. Her güncel veri, ekranda yeni bir aura ve yeni bir hikâye üretiyor.</p>
            <div class="vi-hero-actions">
              <button class="primary" type="button">AI Story Stream</button>
              <button type="button">Player Galaxy</button>
              <button type="button">Dynasty Map</button>
            </div>
          </div>
          <div class="vi-hero-stats">
            <article><span>Lider</span><strong>${esc(standings[0]?.name || 'Bekleniyor')}</strong><small>${standings[0]?.score ?? '—'} puan/reyting ile ön koridor kontrolü.</small></article>
            <article><span>Yakın Takip</span><strong>${esc(standings[1]?.name || '—')}</strong><small>${standings[1]?.score ?? '—'} ile tahta baskı kuruyor.</small></article>
            <article><span>AI Persona</span><strong>${esc(player.archetype.title)}</strong><small>${esc(player.name)} için görsel kimlik üretildi.</small></article>
            <article><span>Living Engine</span><strong>ON</strong><small>Sıralama, müze ve yayın panelleri aynı veri evrenine bağlı.</small></article>
          </div>
        </div>
      `,
      view
    );

    ensureBlock(
      'story-grid',
      'vi-story-grid',
      `
        <div class="vi-section-header"><div><span>AI Story Cards</span><h3>Günün anlatısı</h3><p>Turnuvanın yaşayan başlıkları otomatik olarak öne çıkarılıyor. Bu kutular veri değiştikçe kendini yenilemek üzere tasarlandı.</p></div><div class="vi-badge">Live editorial layer</div></div>
        <div class="vi-story-cards">
          ${stories.map((story) => `<article class="vi-story-card" style="--story-color:${story.color}"><span>${esc(story.tag)}</span><h4>${esc(story.title)}</h4><p>${esc(story.body)}</p></article>`).join('')}
        </div>
      `,
      view
    );

    const galaxyData = standings.slice(0, 12);
    ensureBlock(
      'galaxy',
      'vi-galaxy-wrap vi-galaxy-shell',
      `
        <div class="vi-section-header"><div><span>Player Galaxy</span><h3>Oyuncu galaksisi</h3><p>Node büyüklüğü canlı güç sinyalini, merkeze yakınlık ise üst seviye rekabet çekimini temsil eder. Çizgiler aynı üst koridordaki oyuncular arasındaki rekabet gerilimini ima eder.</p></div><div class="vi-badge">Live visual constellation</div></div>
        <div class="vi-galaxy-canvas" data-vi-galaxy='${esc(JSON.stringify(galaxyData))}'></div>
        <div class="vi-galaxy-legend"><span class="vi-badge">Node boyutu = standing gücü</span><span class="vi-badge">Parlaklık = üst sıra baskısı</span><span class="vi-badge">Merkez = taç etkisi</span></div>
      `,
      view
    );
    renderGalaxy($('.vi-galaxy-canvas', view), galaxyData);

    const champions = parseChampions();
    ensureBlock(
      'dynasty-map',
      'vi-dynasty-wrap vi-dynasty-shell',
      `
        <div class="vi-section-header"><div><span>Dynasty Map</span><h3>Hanedan zaman çizgisi</h3><p>Şampiyonluk zincirleri, tekrar eden dominasyon dönemleri ve isimler arası geçişler tek bir zaman şeridinde toplanıyor.</p></div><div class="vi-badge">History compression</div></div>
        <div class="vi-dynasty-track" data-vi-dynasty='${esc(JSON.stringify(champions))}'></div>
        <div class="vi-dynasty-legend"><span class="vi-badge">Altın = Şampiyonluk yoğunluğu</span><span class="vi-badge">Tekrar eden isim = dynasty pulse</span></div>
      `,
      view
    );
    renderDynasty($('.vi-dynasty-track', view), champions);
  }

  function enhancePlayers() {
    const view = $('#view');
    if (!view) return;
    const player = parsePlayerContext();
    document.body.classList.remove('vi-archetype-dynasty', 'vi-archetype-bigmarch', 'vi-archetype-rising', 'vi-archetype-wall');
    if (player.archetype.key) document.body.classList.add(`vi-archetype-${player.archetype.key}`);

    ensureBlock(
      'living-card',
      'vi-living-card',
      `
        <div class="vi-section-header"><div><span>Living Player Card</span><h3>${esc(player.name)} · canlı kimlik kartı</h3><p>Oyuncunun kariyer DNA’sı hücum, savunma, baskı ve miras sinyallerinden yeniden işlenerek premium bir kart kimliğine dönüştürülüyor.</p></div><div class="vi-badge">${esc(player.tier)} · Overall ${player.overall}</div></div>
        <div class="vi-living-card-grid">
          <section class="vi-player-card">
            <div class="vi-card-top"><div class="vi-rating">${player.overall}</div><div class="vi-tier">${esc(player.tier)}</div></div>
            <h3>${esc(player.name)}</h3>
            <p>${esc(player.archetype.title)} · ${esc(player.archetype.desc)}</p>
            <div class="vi-card-mini">
              <article><span>Canlı</span><b>#${player.liveRank || '—'}</b></article>
              <article><span>World</span><b>#${player.worldRank || '—'}</b></article>
              <article><span>Miras</span><b>${player.legacy ?? '—'}</b></article>
            </div>
          </section>
          <section class="vi-card-right">
            <article><span>Standing Rating</span><strong>${player.standingRating}</strong><small>Canlı sıralama gücünün ana omurgası.</small></article>
            <article><span>Prime Index</span><strong>${player.prime}</strong><small>Kariyerin en yüksek parlaklık işareti.</small></article>
            <article><span>Big Match</span><strong>${player.bigMatch}</strong><small>Baskı anlarında seviye yükseltme kabiliyeti.</small></article>
            <article><span>Momentum</span><strong>${player.momentum}</strong><small>Son form akışının yönü ve hızlanma gücü.</small></article>
            <div class="vi-radar">
              <div class="vi-radar-bars">
                ${[
                  ['Attack', player.attack],
                  ['Defence', player.defense],
                  ['Big Match', player.bigMatch],
                  ['Consistency', player.consistency],
                  ['Dominance', player.dominance],
                  ['Pressure', player.pressure]
                ].map(([label, value]) => `<article><span>${label}</span><i><em style="width:${clamp(value, 1, 100)}%"></em></i><b>${value}</b></article>`).join('')}
              </div>
              <aside class="vi-archetype-card">
                <h4>${esc(player.archetype.title)}</h4>
                <p>${esc(player.archetype.desc)}</p>
                <div class="vi-chip-list">
                  <button type="button">GF/Match ${player.gfPerMatch ?? '—'}</button>
                  <button type="button">GA/Match ${player.gaPerMatch ?? '—'}</button>
                  <button type="button">Titles ${player.titles ?? 0}</button>
                </div>
              </aside>
            </div>
          </section>
        </div>
      `,
      view
    );

    const timeline = parsePrimeTimeline();
    ensureBlock(
      'prime-timeline',
      'vi-prime-timeline',
      `
        <div class="vi-section-header"><div><span>AI Career Movie Timeline</span><h3>Kariyer filmi</h3><p>Her FIFA bir sahne, her sahne oyuncunun hikâyesinde bir kırılma noktası. Sistem zirve ve düşüşleri otomatik vurgular.</p></div><div class="vi-badge">Prime era detector</div></div>
        <div class="vi-prime-track">
          ${timeline.map((node, i) => `<article class="vi-prime-node ${node.status}${i === 0 ? ' prime' : ''}"><h4>${esc(node.title)}</h4><p>${esc(node.desc)}</p><small>${i === 0 ? 'Prime candidate' : node.status === 'down' ? 'Düşüş bölgesi' : node.status === 'rise' ? 'Yükseliş koridoru' : 'Kariyer durağı'}</small></article>`).join('')}
        </div>
      `,
      view
    );

    const rivals = parseRivalries(player.name);
    const mainRival = rivals[0] || { name: 'En güçlü rakip', score: 88, mp: 8 };
    ensureBlock(
      'rivalry-poster',
      'vi-rivalry-poster',
      `
        <div class="vi-section-header"><div><span>AI Rivalry Poster</span><h3>Poster seviyesi rekabet</h3><p>Karşılaşma tarihi, baskı puanı ve rekabet ısısı tek bir dramatik afiş paneline dönüştürülüyor.</p></div><div class="vi-badge">Rivalry heat ${Math.round((parseNum(mainRival.score) || 82))}</div></div>
        <div class="vi-versus">
          <section class="side left"><h4>${esc(player.name)}</h4><p>${esc(player.archetype.title)} · ${player.worldRank ? 'World #' + player.worldRank : 'World signal'}</p></section>
          <div class="center"><b>VS</b><span>Rivalry Heat ${Math.round((parseNum(mainRival.score) || 82))}</span></div>
          <section class="side right"><h4>${esc(mainRival.name)}</h4><p>${mainRival.mp ? mainRival.mp + ' MP' : 'Arşivde kayıtlı rekabet'} · Heat ${mainRival.score ?? '—'}</p></section>
        </div>
        <div class="vi-versus-stats">
          <article><span>Big Match</span><b>${player.bigMatch}</b></article>
          <article><span>Standing</span><b>#${player.worldRank || '—'}</b></article>
          <article><span>Legacy</span><b>${player.legacy}</b></article>
        </div>
      `,
      view
    );

    const museum = $('.v2-player-museum', view);
    if (museum) museum.classList.add('vi-museum-3d');
  }

  function enhanceAllTime() {
    const view = $('#view');
    if (!view) return;
    const records = parseAllTimeRecords();
    const standings = parseStandings();
    const player = parsePlayerContext();
    const immortals = standings.slice(0, 3).map((entry, i) => ({ ...entry, index: i + 1 }));

    ensureBlock(
      'record-wall',
      'vi-record-wall',
      `
        <div class="vi-section-header"><div><span>Record Wall</span><h3>Rekorların duvarı</h3><p>En kritik tüm-zamanlar rekorları, صاحب oyuncu ve sayı değeri ile premium bir duvarda toplanıyor.</p></div><div class="vi-badge">Archive intelligence</div></div>
        <div class="vi-record-grid">
          ${records.slice(0, 8).map((r) => `<article class="vi-record-card"><span>${esc(r.owner)}</span><h4>${esc(r.title)}</h4><b>${esc(r.value)}</b><small>${esc(r.detail.slice(0, 90))}</small></article>`).join('') || `<article class="vi-record-card"><span>Arşiv</span><h4>Rekor akışı hazırlanıyor</h4><b>—</b><small>Sayfa veri bloğu görünür olduğunda canlı kartlara dönüşecektir.</small></article>`}
        </div>
      `,
      view
    );

    ensureBlock(
      'hall-of-immortals',
      'vi-hall',
      `
        <div class="vi-section-header"><div><span>Hall of Immortals</span><h3>Ölümsüzler salonu</h3><p>Legacy, sıralama ve tarihsel ağırlık bakımından evrenin en yüksek oyuncuları özel vitrinde toplanır.</p></div><div class="vi-badge">Auto-qualified elite</div></div>
        <div class="vi-hall-grid">
          ${immortals.map((item) => `<article class="vi-immortal-card"><h4>#${item.rank || item.index} · ${esc(item.name)}</h4><p>Evrenin ağır sıklet oyuncularından biri. Görsel zekâ motoru bu profili tarihi etki, canlı güç ve arşiv baskısı üzerinden ölümsüzler salonuna alıyor.</p><div class="vi-immortal-meta"><i>Signal ${item.score ?? '—'}</i><i>Tier ${item.index === 1 ? 'Crown' : item.index === 2 ? 'Elite' : 'Icon'}</i><i>Legacy mode</i></div></article>`).join('') || `<article class="vi-immortal-card"><h4>${esc(player.name)}</h4><p>Yeterli lider tablosu görünmediğinde mevcut oyuncu bağlamı öne çıkarılır.</p><div class="vi-immortal-meta"><i>Standing ${player.standingRating}</i><i>World #${player.worldRank || '—'}</i></div></article>`}
        </div>
      `,
      view
    );

    ensureBlock(
      'alltime-galaxy',
      'vi-galaxy-wrap vi-galaxy-shell',
      `
        <div class="vi-section-header"><div><span>Player Galaxy</span><h3>All-time yıldız haritası</h3><p>Uzun dönemli etki ve rekabet yoğunluğu, tarihi oyuncu ağını görsel bir kozmosa dönüştürür.</p></div><div class="vi-badge">Historical constellation</div></div>
        <div class="vi-galaxy-canvas" data-vi-galaxy='${esc(JSON.stringify(standings.slice(0, 12)))}'></div>
      `,
      view
    );
    renderGalaxy($('.vi-galaxy-canvas', view), standings.slice(0, 12));
  }

  function enhanceMatchday(route) {
    const view = $('#view');
    if (!view) return;
    const standings = parseStandings();
    const p1 = standings[0]?.name || 'Player A';
    const p2 = standings[1]?.name || 'Player B';
    ensureBlock(
      `matchday-${route}`,
      'vi-matchday-grid',
      `
        <div class="vi-section-header"><div><span>${route === 'media' ? 'Matchday Visual Generator' : 'Broadcast Director'}</span><h3>AI yayın katmanı</h3><p>Maç günü afişleri, yayın uyarıları ve görsel anlatı kartları tek panelden üretilecek şekilde kurgulandı.</p></div><div class="vi-badge">Presentation intelligence</div></div>
        <div class="vi-matchday-cards">
          <article class="vi-matchday-card">
            <h4>Matchday Poster Generator</h4>
            <p>Bu panel, mevcut canlı güç sinyaline göre afiş başlığı, alt hikâye ve kilit metrik satırlarını otomatik üretir. WhatsApp paylaşımları için premium görsel omurga sağlar.</p>
            <div class="vi-matchday-strip"><div class="team">${esc(p1)}</div><div class="vs">VS</div><div class="team" style="text-align:right">${esc(p2)}</div></div>
            <div class="vi-matchday-metrics"><i>Story angle: Crown pressure</i><i>Live signal: ${standings[0]?.score ?? '—'}</i><i>Rivalry heat: 88</i></div>
          </article>
          <article class="vi-matchday-card">
            <h4>Broadcast Motion Director</h4>
            <p>Gol, liderlik değişimi, geri dönüş ve kritik dakikalar için otomatik alert şeritleri ve vurucu yayın başlıkları oluşturur.</p>
            <div class="vi-alert-tape">
              <span class="vi-alert-chip"><strong>LIVE STANDING CHANGE</strong> · Taç baskısı artıyor</span>
              <span class="vi-alert-chip"><strong>PRESSURE ZONE</strong> · Son bölümde hata payı yok</span>
              <span class="vi-alert-chip"><strong>COMEBACK WATCH</strong> · Momentum kırılması mümkün</span>
            </div>
          </article>
        </div>
      `,
      view
    );
  }

  function renderGalaxy(container, data) {
    if (!container) return;
    if (!Array.isArray(data) || !data.length) {
      container.innerHTML = '<div class="vi-badge" style="margin:18px">Galaxy verisi görünür olduğunda yıldız haritası burada oluşur.</div>';
      return;
    }
    const width = container.clientWidth || 900;
    const height = Math.max(340, Math.round(width * 0.42));
    const maxScore = Math.max(...data.map((d) => parseNum(d.score) || 1), 1);
    const nodes = data.map((d, i) => {
      const score = parseNum(d.score) || (maxScore - i);
      const angle = (Math.PI * 2 * i) / Math.max(data.length, 8);
      const radius = 60 + (1 - score / maxScore) * (Math.min(width, height) * 0.28) + (i % 3) * 10;
      const cx = width / 2 + Math.cos(angle) * radius;
      const cy = height / 2 + Math.sin(angle) * (radius * 0.72);
      const r = 10 + (score / maxScore) * 18;
      return { ...d, cx, cy, r, score };
    });
    const lines = nodes.slice(1, 8).map((n, i) => `<line x1="${width / 2}" y1="${height / 2}" x2="${n.cx}" y2="${n.cy}" stroke="rgba(132,168,255,.15)" stroke-width="${i < 3 ? 2 : 1}" />`).join('');
    const stars = nodes.map((n, i) => `
      <g class="vi-g-node" data-name="${esc(n.name)}" data-score="${esc(n.score)}" transform="translate(${n.cx},${n.cy})">
        <circle r="${n.r + 6}" fill="rgba(123,214,255,.08)" />
        <circle r="${n.r}" fill="${i === 0 ? 'rgba(255,216,119,.96)' : i === 1 ? 'rgba(123,214,255,.96)' : 'rgba(148,108,255,.92)'}" opacity="0.95" />
        <text y="${n.r + 22}" text-anchor="middle" font-size="12" fill="#e9f0ff">${esc(n.name)}</text>
      </g>`).join('');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <defs><radialGradient id="viGalaxyGlow"><stop offset="0%" stop-color="rgba(255,255,255,.45)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient></defs>
      <rect width="100%" height="100%" fill="transparent"/>
      <circle cx="${width / 2}" cy="${height / 2}" r="34" fill="rgba(255,216,119,.16)" stroke="rgba(255,216,119,.38)" />
      <text x="${width / 2}" y="${height / 2 + 5}" text-anchor="middle" font-size="12" fill="#fff">CROWN</text>
      ${lines}
      ${stars}
    </svg>`;
  }

  function renderDynasty(container, champions) {
    if (!container) return;
    if (!Array.isArray(champions) || !champions.length) {
      container.innerHTML = '<div class="vi-badge" style="margin:18px">Turnuva kartları görünür olduğunda şampiyonluk zinciri burada akacaktır.</div>';
      return;
    }
    const width = container.clientWidth || 920;
    const height = 360;
    const minEd = Math.min(...champions.map((c) => c.edition));
    const maxEd = Math.max(...champions.map((c) => c.edition));
    const counts = champions.reduce((acc, c) => ((acc[c.name] = (acc[c.name] || 0) + 1), acc), {});
    const nodes = champions.map((c, i) => ({
      ...c,
      x: 80 + ((c.edition - minEd) / Math.max(1, maxEd - minEd)) * (width - 160),
      y: 110 + (i % 4) * 54,
      count: counts[c.name]
    }));
    const path = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`).join(' ');
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <path d="${path}" fill="none" stroke="rgba(132,168,255,.24)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${nodes.map((n) => `<g transform="translate(${n.x},${n.y})"><circle r="${12 + n.count * 4}" fill="${n.count > 1 ? 'rgba(255,216,119,.95)' : 'rgba(123,214,255,.92)'}"/><text y="-24" text-anchor="middle" font-size="12" fill="#9cbcff">FIFA ${n.edition}</text><text y="4" text-anchor="middle" font-size="11" fill="#071022">${esc((n.name || '').split(' ')[0])}</text><text y="28" text-anchor="middle" font-size="12" fill="#eff5ff">${esc(n.name)}</text></g>`).join('')}
    </svg>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
