(() => {
  "use strict";

  const VERSION = "42.0";
  const STORAGE_KEY = "fifa-manager-room-v42";
  const LEGS = [
    { id: 1, label: "1. Devre", stars: 4 },
    { id: 2, label: "2. Devre", stars: 4.5 },
    { id: 3, label: "3. Devre", stars: 5 }
  ];

  let bootstrap = null;
  let bootstrapLoading = false;
  let activeTab = "overview";
  let remoteLeaderboard = [];
  let remoteLoading = false;
  let remoteLoadedAt = 0;

  const ctx = () => window.FIFA_APP_CONTEXT;
  const cloud = () => window.FIFA_CLOUD;
  const esc = value => ctx()?.escapeHTML ? ctx().escapeHTML(String(value ?? "")) : String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : { version: VERSION, careers: [], activeCareerId: null };
    } catch (_) {
      return { version: VERSION, careers: [], activeCareerId: null };
    }
  }

  let managerState = loadLocal();

  function saveLocal() {
    managerState.version = VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(managerState));
  }

  function activeCareer() {
    return managerState.careers.find(item => item.id === managerState.activeCareerId) || managerState.careers[0] || null;
  }

  async function ensureBootstrap() {
    if (bootstrap || bootstrapLoading) return;
    bootstrapLoading = true;
    try {
      const response = await fetch("data/manager-bootstrap-v42.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Manager başlangıç verisi yüklenemedi.");
      bootstrap = await response.json();
    } catch (error) {
      console.warn("Manager bootstrap fallback", error);
      bootstrap = buildRuntimeBootstrap();
    } finally {
      bootstrapLoading = false;
      if (["managerroom", "managerhall"].includes(ctx()?.getActiveView?.())) ctx()?.refreshView?.();
    }
  }

  function buildRuntimeBootstrap() {
    const historical = ctx()?.getHistorical?.() || { allTime: [], champions: [], summary: {} };
    const currentNames = (ctx()?.getParticipants?.() || []).map(item => String(item.name || "").trim()).filter(Boolean);
    const names = [];
    (historical.allTime || []).forEach(item => { if (item.name && !names.includes(item.name)) names.push(item.name); });
    currentNames.forEach(name => { if (!names.includes(name)) names.push(name); });
    const top = (historical.allTime || []).slice(0, 10).map(item => item.name);
    const champions = new Map((historical.champions || []).map(item => [item.name, item]));
    const profiles = names.map((name, index) => {
      const row = (historical.allTime || []).find(item => item.name === name) || {};
      const honours = champions.get(name) || { titles: 0, finals: 0, podiums: 0 };
      const powerSeed = Math.max(900, Math.min(1900, Math.round(1000 + (Number(row.ppg) || 0) * 230 + (Number(row.winRate) || 0) * 1.7 + honours.titles * 65 - (Number(row.rank) || 25) * 4)));
      return { id: `AI-${String(index + 1).padStart(2, "0")}`, name, historicalRank: row.rank || null, historical: row, honours, powerSeed, powerClass: powerSeed >= 1550 ? "Elite" : powerSeed >= 1350 ? "Strong" : powerSeed >= 1150 ? "Competitive" : "Challenger", hiddenStyle: {} };
    });
    return {
      version: 42,
      readiness: { combinedAiPlayers: profiles.length, premierAiTeams: top.length, championshipAiTeams: Math.max(0, profiles.length - top.length), championshipWithHumanClub: Math.max(1, profiles.length - top.length + 1) },
      competitionRules: { premier: { aiTeams: 10, relegation: 2, legs: [4, 4.5, 5] }, championship: { directPromotion: 1, playoffRanks: [2, 3, 4, 5], playoffBestOf: 3, playoffStars: 4.5, legs: [4, 4.5, 5] }, orucReisCup: { premierQualifiers: 5, championshipQualifiers: 3, allRoundsBestOf: 3, stars: 4.5 }, superCup: { enabled: true } },
      premierPlayerNames: top,
      championshipPlayerNames: names.filter(name => !top.includes(name)),
      aiProfiles: profiles
    };
  }

  function slug(value) {
    return String(value || "club").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function managerClubName(name) {
    const pieces = String(name || "AI").trim().split(/\s+/);
    const base = pieces.length > 1 ? pieces[pieces.length - 1] : pieces[0];
    const suffixes = ["Athletic", "United", "City", "Sporting", "Rovers", "FC"];
    let score = 0;
    for (const char of String(name)) score += char.charCodeAt(0);
    return `${base} ${suffixes[score % suffixes.length]}`;
  }

  function createActors(profileNames, division) {
    return profileNames.map(name => {
      const profile = bootstrap.aiProfiles.find(item => item.name === name) || { id: `AI-${slug(name)}`, name, powerSeed: 1100, powerClass: "Competitive" };
      return {
        id: profile.id,
        type: "ai",
        managerName: profile.name,
        clubName: managerClubName(profile.name),
        shortName: managerClubName(profile.name).replace(/[^A-Za-zÇĞİÖŞÜçğıöşü ]/g, "").split(/\s+/).map(item => item[0]).join("").slice(0, 4).toUpperCase(),
        division,
        power: profile.powerSeed,
        powerClass: profile.powerClass,
        styleVisible: false,
        historicalRank: profile.historicalRank
      };
    });
  }

  function roundRobin(ids, division, leg) {
    const list = [...ids];
    if (list.length % 2) list.push(null);
    const rounds = [];
    let rotation = [...list];
    for (let round = 0; round < rotation.length - 1; round += 1) {
      const matches = [];
      for (let index = 0; index < rotation.length / 2; index += 1) {
        let homeId = rotation[index];
        let awayId = rotation[rotation.length - 1 - index];
        if (!homeId || !awayId) continue;
        if ((round + index) % 2) [homeId, awayId] = [awayId, homeId];
        if (leg === 2) [homeId, awayId] = [awayId, homeId];
        matches.push({
          id: `MR-${division}-L${leg}-R${round + 1}-${homeId}-${awayId}`,
          division,
          competition: "league",
          leg,
          stars: LEGS.find(item => item.id === leg)?.stars || 4,
          matchday: round + 1 + (leg - 1) * (rotation.length - 1),
          homeId,
          awayId,
          status: "scheduled",
          homeTeam: null,
          awayTeam: null,
          homeScore: null,
          awayScore: null,
          decisions: []
        });
      }
      rounds.push(...matches);
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, rotation.length - 1)];
    }
    return rounds;
  }

  function initialTable(actors) {
    return actors.map(actor => ({ actorId: actor.id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }));
  }

  function createCareerPayload(formData) {
    const playerName = String(formData.get("playerName") || "").trim();
    const clubName = String(formData.get("clubName") || "").trim();
    const shortName = String(formData.get("shortName") || "").trim().toUpperCase().slice(0, 5);
    const primaryColor = String(formData.get("primaryColor") || "#0b2440");
    const secondaryColor = String(formData.get("secondaryColor") || "#d5a84e");
    const pin = String(formData.get("pin") || "").trim();
    if (!playerName || !clubName || shortName.length < 2) throw new Error("Oyuncu, kulüp adı ve kısa ad zorunludur.");
    if (!/^\d{6}$/.test(pin)) throw new Error("Manager PIN tam olarak 6 rakam olmalıdır.");
    if (managerState.careers.some(item => item.playerName === playerName)) throw new Error("Bu oyuncu için bu cihazda zaten bir kariyer bulunuyor.");

    const premierActors = createActors(bootstrap.premierPlayerNames, "premier");
    const championshipActors = createActors(bootstrap.championshipPlayerNames, "championship");
    const human = {
      id: `HUMAN-${slug(playerName)}-${Date.now()}`,
      type: "human",
      managerName: playerName,
      clubName,
      shortName,
      division: "championship",
      power: 1000,
      powerClass: "New Club",
      primaryColor,
      secondaryColor,
      styleVisible: true
    };
    championshipActors.push(human);
    const premierIds = premierActors.map(item => item.id);
    const championshipIds = championshipActors.map(item => item.id);
    const fixtures = [1, 2, 3].flatMap(leg => [
      ...roundRobin(premierIds, "premier", leg),
      ...roundRobin(championshipIds, "championship", leg)
    ]);

    return {
      id: uid("career"),
      playerName,
      clubName,
      shortName,
      primaryColor,
      secondaryColor,
      pin,
      mode: formData.get("mode") === "official" ? "official" : "test",
      createdAt: now(),
      updatedAt: now(),
      status: "foundation-ready",
      seasonNo: 1,
      matchday: 1,
      division: "championship",
      managerElo: 1000,
      careerPoints: 0,
      prestige: 0,
      tacticalIQ: 50,
      completionRate: 0,
      trophies: { premier: 0, championship: 0, oruc: 0, super: 0 },
      humanActorId: human.id,
      actors: [...premierActors, ...championshipActors],
      tables: { premier: initialTable(premierActors), championship: initialTable(championshipActors) },
      fixtures,
      rules: bootstrap.competitionRules,
      development: { foundation: true, matchEngine: false, decisionEngine: false, competitionProgression: false },
      cloudCareerId: null
    };
  }

  function client() {
    return cloud()?.getClient?.() || null;
  }

  async function createRemoteCareer(career, pin) {
    const supabase = client();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc("manager_create_career", {
      p_player_name: career.playerName,
      p_club_name: career.clubName,
      p_club_short_name: career.shortName,
      p_primary_color: career.primaryColor,
      p_secondary_color: career.secondaryColor,
      p_pin: pin,
      p_snapshot: career
    });
    if (error) throw error;
    return data;
  }

  async function refreshLeaderboard(force = false) {
    if (remoteLoading || (!force && Date.now() - remoteLoadedAt < 15000)) return;
    const supabase = client();
    if (!supabase) return;
    remoteLoading = true;
    try {
      const { data, error } = await supabase.from("manager_leaderboard_public").select("*").order("career_points", { ascending: false }).order("manager_elo", { ascending: false }).limit(100);
      if (error) throw error;
      remoteLeaderboard = Array.isArray(data) ? data : [];
      remoteLoadedAt = Date.now();
    } catch (error) {
      console.warn("Manager leaderboard unavailable", error);
      remoteLeaderboard = [];
    } finally {
      remoteLoading = false;
      if (ctx()?.getActiveView?.() === "managerhall") ctx()?.refreshView?.();
    }
  }

  function openCareerModal() {
    if (!bootstrap) return;
    const options = bootstrap.aiProfiles.map(profile => `<option value="${esc(profile.name)}">${esc(profile.name)}</option>`).join("");
    ctx()?.openModal?.("Yeni Manager Kariyeri", `
      <form id="managerCareerForm" class="manager-career-form">
        <div class="manager-form-intro"><div class="eyebrow">THE MANAGER'S ROOM</div><h3>Championship'ten kendi hikâyeni başlat</h3><p>Gerçek oyuncu evrenine yeni bir kulüp olarak katılacaksın. Tarihî oyuncuların AI sürümleri rakip olarak kalır.</p></div>
        <div class="manager-form-grid">
          <label>Oyuncu kimliğin<select name="playerName" required><option value="">Oyuncu seç</option>${options}</select></label>
          <label>Kulüp adı<input name="clubName" maxlength="34" placeholder="Örn. CCT Athletic" required></label>
          <label>Kısa ad<input name="shortName" maxlength="5" placeholder="CCTA" required></label>
          <label>6 haneli Manager PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required></label>
          <label>Ana renk<input name="primaryColor" type="color" value="#0b2440"></label>
          <label>İkinci renk<input name="secondaryColor" type="color" value="#d5a84e"></label>
        </div>
        <div class="manager-mode-picker">
          <label><input type="radio" name="mode" value="test" checked><span><b>Test Kariyeri</b><small>Motor geliştirme sürecinde güvenli deneme.</small></span></label>
          <label><input type="radio" name="mode" value="official"><span><b>Resmî Kariyer</b><small>Supabase kuruluysa Manager Hall'a bağlanır.</small></span></label>
        </div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Kulübü Kur ve Evreni Oluştur</button></div>
      </form>
    `, "CAREER FOUNDATION");
  }

  function actor(career, id) {
    return career.actors.find(item => item.id === id) || { id, managerName: "—", clubName: "—", power: 0 };
  }

  function nextHumanFixture(career) {
    return career.fixtures.filter(item => item.status === "scheduled" && [item.homeId, item.awayId].includes(career.humanActorId)).sort((a, b) => a.matchday - b.matchday || a.leg - b.leg)[0] || null;
  }

  function powerLabel(power) {
    if (power >= 1550) return "ELITE";
    if (power >= 1350) return "STRONG";
    if (power >= 1150) return "COMPETITIVE";
    return "CHALLENGER";
  }

  function renderLanding(view) {
    const ready = bootstrap?.readiness || {};
    view.innerHTML = `
      <section class="manager-hero">
        <div class="manager-hero-copy">
          <div class="eyebrow">V42 · OFFICIAL GAME FOUNDATION</div>
          <h2>The Manager's Room</h2>
          <p>Kendi kulübünü kur, Championship'ten başla ve gerçek Oruç Reis turnuva tarihinden üretilen AI menajerlere karşı kalıcı bir kariyer oluştur.</p>
          <div class="manager-hero-actions"><button class="btn btn-gold" data-manager-action="open-career">Kariyeri Başlat</button><button class="btn btn-ghost" data-manager-action="set-tab" data-tab="engine">Motor Mimarisini Gör</button></div>
          <div class="manager-foundation-tags"><span>3 Devre</span><span>Gizli AI Stilleri</span><span>5 Dakikalık Maç Motoru</span><span>Ortak Manager Hall</span></div>
        </div>
        <div class="manager-hero-visual">
          <div class="manager-orbit manager-orbit-one"></div><div class="manager-orbit manager-orbit-two"></div>
          <div class="manager-emblem"><span>MR</span><strong>ORUÇ REİS</strong><small>FOOTBALL UNIVERSE</small></div>
        </div>
      </section>
      <section class="manager-readiness-grid">
        <article><span>AI MENAJER EVRENİ</span><strong>${ready.combinedAiPlayers ?? "—"}</strong><small>Tarihî + FIFA09 aktif oyuncular</small></article>
        <article><span>PREMIER LEAGUE</span><strong>${ready.premierAiTeams ?? 10}</strong><small>Tüm zamanların ilk 10'u</small></article>
        <article><span>CHAMPIONSHIP</span><strong>${ready.championshipWithHumanClub ?? "—"}</strong><small>AI kulüpleri + senin kulübün</small></article>
        <article><span>ALTYAPI DURUMU</span><strong>V42.0</strong><small>Foundation build aktif</small></article>
      </section>
      ${renderRulesStrip()}
      ${renderBuildRoadmap()}
    `;
  }

  function renderRulesStrip() {
    return `<section class="manager-rules-strip">
      <div><b>PREMIER</b><span>10 AI · Son 2 düşer</span></div>
      <div><b>CHAMPIONSHIP</b><span>1. direkt · 2–5 play-off</span></div>
      <div><b>ORUÇ REİS KUPASI</b><span>Premier ilk 5 + Championship ilk 3</span></div>
      <div><b>KUPA FORMAT</b><span>Best of 3 · 4.5★</span></div>
    </section>`;
  }

  function renderBuildRoadmap() {
    const items = [
      ["01", "Foundation", "Kariyer, lig evreni, AI seed ve veri katmanı", true],
      ["02", "Match Engine Alpha", "Takım kurası, momentum ve skor motoru", false],
      ["03", "Decision Intelligence", "Bağlamsal taktik soruları ve adaptasyon", false],
      ["04", "Competition Universe", "Yükselme, kupalar ve sezon geçişi", false],
      ["05", "Manager Hall", "Ortak sıralama, kupalar ve kariyer karşılaştırması", false]
    ];
    return `<section class="manager-roadmap"><div class="manager-section-head"><div><span>DEVELOPMENT ROADMAP</span><h3>Oyun artık resmî geliştirme hattında</h3></div><small>Her katman ayrı test edilerek sonraki motora bağlanacak.</small></div><div class="manager-roadmap-grid">${items.map(item => `<article class="${item[3] ? "active" : ""}"><b>${item[0]}</b><strong>${item[1]}</strong><p>${item[2]}</p><span>${item[3] ? "BUILD COMPLETE" : "NEXT BUILD"}</span></article>`).join("")}</div></section>`;
  }

  function renderCareer(view, career) {
    const next = nextHumanFixture(career);
    const opponentId = next ? (next.homeId === career.humanActorId ? next.awayId : next.homeId) : null;
    const rival = opponentId ? actor(career, opponentId) : null;
    const human = actor(career, career.humanActorId);
    const premierCount = career.actors.filter(item => item.division === "premier").length;
    const championshipCount = career.actors.filter(item => item.division === "championship").length;
    view.innerHTML = `
      <section class="manager-club-hero" style="--club-primary:${esc(career.primaryColor)};--club-secondary:${esc(career.secondaryColor)}">
        <div class="manager-club-badge"><span>${esc(career.shortName)}</span></div>
        <div class="manager-club-copy"><div class="eyebrow">SEASON ${career.seasonNo} · CHAMPIONSHIP</div><h2>${esc(career.clubName)}</h2><p>${esc(career.playerName)} yönetiminde yeni kulüp projesi. Tarihî AI menajer evrenine ilave takım olarak katıldı.</p><div class="manager-club-meta"><span>Manager ELO <b>${career.managerElo}</b></span><span>Taktik IQ <b>${career.tacticalIQ}</b></span><span>Kariyer Puanı <b>${career.careerPoints}</b></span><span>${career.mode === "official" ? "RESMÎ" : "TEST"}</span></div></div>
        <div class="manager-season-ring"><strong>${career.matchday}</strong><span>MATCHDAY</span><small>1. Devre · 4★</small></div>
      </section>
      <nav class="manager-tabs">${[["overview","Kulüp Merkezi"],["universe","Lig Evreni"],["scouting","AI Rakipler"],["engine","Motor Laboratuvarı"]].map(([id,label])=>`<button class="${activeTab===id?"active":""}" data-manager-action="set-tab" data-tab="${id}">${label}</button>`).join("")}</nav>
      ${activeTab === "overview" ? renderOverview(career, human, rival, next) : activeTab === "universe" ? renderUniverse(career, premierCount, championshipCount) : activeTab === "scouting" ? renderScouting(career) : renderEngineLab(career)}
    `;
  }

  function renderOverview(career, human, rival, next) {
    return `<section class="manager-dashboard-grid">
      <article class="manager-next-match">
        <div class="manager-panel-head"><div><span>NEXT MATCHDAY</span><h3>${next ? `Matchday ${next.matchday}` : "Fikstür tamamlandı"}</h3></div><em>${next ? `${next.stars}★` : "—"}</em></div>
        ${next ? `<div class="manager-versus"><div><b style="--team-color:${esc(career.primaryColor)}">${esc(human.shortName)}</b><strong>${esc(human.clubName)}</strong><small>${esc(career.playerName)}</small></div><span>VS</span><div><b>${esc(rival.shortName)}</b><strong>${esc(rival.clubName)}</strong><small>${esc(rival.managerName)} AI · Güç ${rival.power}</small></div></div><div class="manager-match-lock"><span>Rakip oyun tarzı</span><strong>GİZLİ</strong><small>Maç içinde davranış sinyallerinden okunacak.</small></div><button class="btn btn-gold btn-wide" disabled>Match Engine V42.2 ile açılacak</button>` : `<div class="empty-state">Yeni sezon oluşturulması gerekiyor.</div>`}
      </article>
      <article class="manager-progress-panel"><div class="manager-panel-head"><div><span>CLUB DEVELOPMENT</span><h3>Baseline</h3></div><em>1000</em></div>${[["Takım Gücü",human.power,1900],["Taktik IQ",career.tacticalIQ,100],["Tamamlama",career.completionRate,100],["Prestij",career.prestige,100]].map(row=>`<div class="manager-meter"><span>${row[0]}</span><i><b style="width:${Math.max(3,Math.min(100,row[1]/row[2]*100))}%"></b></i><strong>${row[1]}</strong></div>`).join("")}<div class="manager-baseline-note">Güç artışı yalnızca oynanan maç, karar kalitesi ve sezon hedefleriyle kazanılacak.</div></article>
      <article class="manager-trophy-panel"><div class="manager-panel-head"><div><span>CLUB MUSEUM</span><h3>Kupa Kabini</h3></div></div><div class="manager-mini-trophies">${[["Premier",career.trophies.premier],["Championship",career.trophies.championship],["Oruç Reis",career.trophies.oruc],["Süper Kupa",career.trophies.super]].map(row=>`<div><span>♜</span><strong>${row[1]}</strong><small>${row[0]}</small></div>`).join("")}</div></article>
      <article class="manager-status-panel"><div class="manager-panel-head"><div><span>ENGINE STATUS</span><h3>Foundation Build</h3></div><em>V42.0</em></div><ul><li class="done">Kariyer ve kulüp oluşturma</li><li class="done">25 AI menajer profili</li><li class="done">Üç devreli lig fikstürü</li><li>Takım kura motoru</li><li>Canlı momentum simülasyonu</li><li>Bağlamsal karar zekâsı</li></ul></article>
    </section>`;
  }

  function renderUniverse(career, premierCount, championshipCount) {
    const premier = career.actors.filter(item => item.division === "premier").sort((a,b)=>b.power-a.power);
    const championship = career.actors.filter(item => item.division === "championship").sort((a,b)=>(a.type === "human" ? -1 : b.power-a.power));
    const rows = list => list.map((item,index)=>`<tr class="${item.type === "human" ? "human-row" : ""}"><td>${index+1}</td><td><strong>${esc(item.clubName)}</strong><small>${esc(item.managerName)}${item.type === "human" ? " · SEN" : " AI"}</small></td><td>${item.power}</td><td><span class="manager-power-class">${powerLabel(item.power)}</span></td></tr>`).join("");
    return `<section class="manager-universe-grid"><article class="manager-league-card premier"><div class="manager-panel-head"><div><span>PREMIER LEAGUE</span><h3>${premierCount} AI Kulüp</h3></div><em>Son 2 düşer</em></div><table><thead><tr><th>#</th><th>Kulüp / Manager</th><th>Güç</th><th>Sınıf</th></tr></thead><tbody>${rows(premier)}</tbody></table></article><article class="manager-league-card championship"><div class="manager-panel-head"><div><span>CHAMPIONSHIP</span><h3>${championshipCount} Kulüp</h3></div><em>1 direkt · 2–5 PO</em></div><table><thead><tr><th>#</th><th>Kulüp / Manager</th><th>Güç</th><th>Sınıf</th></tr></thead><tbody>${rows(championship)}</tbody></table></article><article class="manager-cup-route"><div><span>ORUÇ REİS KUPASI</span><strong>8</strong><small>Premier ilk 5 + Championship ilk 3</small></div><div>ÇEYREK FİNAL<b>Best of 3 · 4.5★</b></div><i>→</i><div>YARI FİNAL<b>Best of 3 · 4.5★</b></div><i>→</i><div>FİNAL<b>Best of 3 · 4.5★</b></div></article></section>`;
  }

  function renderScouting(career) {
    const rivals = career.actors.filter(item => item.type === "ai").sort((a,b)=>b.power-a.power);
    return `<section class="manager-scouting"><div class="manager-section-head"><div><span>AI OPPONENT DATABASE</span><h3>Güç görünür, oyun tarzı gizli</h3></div><small>Stil profilleri maç sırasında davranışlardan ve scouting raporlarından açılacak.</small></div><div class="manager-scout-grid">${rivals.map((item,index)=>`<article><div class="manager-ai-rank">${String(index+1).padStart(2,"0")}</div><div class="manager-ai-avatar">${esc(item.managerName.split(/\s+/).map(x=>x[0]).join("").slice(0,2))}</div><div><span>${esc(item.clubName)}</span><h4>${esc(item.managerName)}</h4><small>${item.division === "premier" ? "Premier League" : "Championship"} · ${item.powerClass}</small></div><div class="manager-ai-power"><strong>${item.power}</strong><small>POWER</small></div><footer><span>PRESS: ???</span><span>RISK: ???</span><span>ADAPT: ???</span></footer></article>`).join("")}</div></section>`;
  }

  function renderEngineLab(career) {
    const modules = [
      ["Career Engine",100,"Kulüp, sezon ve kalıcı kariyer state"],
      ["Competition Engine",55,"Lig evreni ve üç devreli fikstür hazır"],
      ["Opponent Engine",50,"25 AI power seed ve gizli stil vektörü hazır"],
      ["Team Draw Engine",15,"FC 25 takım kataloğu entegrasyonu bekliyor"],
      ["Match Simulation",5,"Durum vektörü ve tick motoru sıradaki build"],
      ["Decision Intelligence",5,"Senaryo aileleri ve outcome resolver sırada"],
      ["Narrative Engine",0,"Maç anlatımı ve taktik rapor katmanı"],
      ["Balance Telemetry",0,"Otomatik milyonlarca maç simülasyonu"],
    ];
    return `<section class="manager-engine-lab"><div class="manager-engine-core"><div class="manager-core-ring"><span>V42</span><strong>CORE</strong></div><div><span>ADVANCED SIMULATION ARCHITECTURE</span><h3>Tek bir rastgele skor fonksiyonu değil, birlikte çalışan motorlar</h3><p>Takım gücü, ELO, gizli rakip stili, momentum, saha hâkimiyeti, baskı ve karar etkisi bağımsız modüllerde hesaplanacak.</p></div></div><div class="manager-module-grid">${modules.map(row=>`<article><div><span>${row[0]}</span><strong>${row[1]}%</strong></div><i><b style="width:${row[1]}%"></b></i><p>${row[2]}</p></article>`).join("")}</div><div class="manager-engine-contract"><strong>V42.1 SONRAKİ RESMÎ BUILD</strong><span>FC 25 takım kataloğu + Team Draw Theatre + ilk gerçek kariyer veritabanı senkronizasyonu</span></div></section>`;
  }

  function render(view) {
    ensureBootstrap();
    if (!bootstrap) {
      view.innerHTML = `<section class="manager-loading"><div class="manager-loading-ball">⚽</div><h2>Manager evreni hazırlanıyor</h2><p>Son yedek, turnuva tarihi ve AI profilleri birleştiriliyor.</p></section>`;
      return;
    }
    const career = activeCareer();
    if (!career) renderLanding(view); else renderCareer(view, career);
  }

  function localLeaderboard() {
    return [...managerState.careers].sort((a,b)=>b.careerPoints-a.careerPoints||b.managerElo-a.managerElo).map((item,index)=>({ rank:index+1, player_name:item.playerName, club_name:item.clubName, division:item.division, season_no:item.seasonNo, career_points:item.careerPoints, manager_elo:item.managerElo, tactical_iq:item.tacticalIQ, trophy_count:Object.values(item.trophies||{}).reduce((a,b)=>a+Number(b||0),0), source:"local" }));
  }

  function renderHall(view) {
    ensureBootstrap();
    refreshLeaderboard();
    const rows = remoteLeaderboard.length ? remoteLeaderboard : localLeaderboard();
    view.innerHTML = `<section class="manager-hall-hero"><div><div class="eyebrow">GLOBAL CAREER RANKING</div><h2>Manager Hall</h2><p>Bütün bağımsız kariyerlerin ortak prestij, güç ve taktik zekâ sıralaması.</p></div><div class="manager-hall-stat"><strong>${rows.length}</strong><span>AKTİF KARİYER</span></div></section><section class="manager-hall-table"><div class="manager-panel-head"><div><span>ALL MANAGERS</span><h3>Kariyer Liderlik Tablosu</h3></div><em>${remoteLeaderboard.length ? "SUPABASE LIVE" : "LOCAL TEST"}</em></div>${rows.length ? `<table><thead><tr><th>#</th><th>Manager / Kulüp</th><th>Lig</th><th>Sezon</th><th>Taktik IQ</th><th>ELO</th><th>Kupa</th><th>Kariyer Puanı</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td><b>${index+1}</b></td><td><strong>${esc(row.player_name)}</strong><small>${esc(row.club_name)}</small></td><td>${esc(row.division || "Championship")}</td><td>${row.season_no || 1}</td><td>${row.tactical_iq || 50}</td><td>${row.manager_elo || 1000}</td><td>${row.trophy_count || 0}</td><td><strong>${row.career_points || 0}</strong></td></tr>`).join("")}</tbody></table>` : `<div class="empty-state">İlk Manager kariyeri henüz kurulmadı.</div>`}</section>`;
  }

  async function handleSubmit(event) {
    if (event.target.id !== "managerCareerForm") return;
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = "Evren oluşturuluyor...";
    try {
      const data = new FormData(form);
      const pin = String(data.get("pin") || "");
      const career = createCareerPayload(data);
      delete career.pin;
      if (career.mode === "official") {
        try {
          const remoteId = await createRemoteCareer(career, pin);
          career.cloudCareerId = remoteId || null;
        } catch (error) {
          console.warn("Official career cloud creation failed", error);
          throw new Error(`Bulut kariyeri oluşturulamadı: ${error.message}. Önce V42 SQL kurulumunu tamamla veya Test Kariyeri seç.`);
        }
      }
      managerState.careers.push(career);
      managerState.activeCareerId = career.id;
      saveLocal();
      ctx()?.closeModal?.();
      ctx()?.toast?.(`${career.clubName} Championship evrenine katıldı.`, "success");
      activeTab = "overview";
      ctx()?.refreshView?.();
    } catch (error) {
      ctx()?.toast?.(error.message, "error");
      button.disabled = false;
      button.textContent = "Kulübü Kur ve Evreni Oluştur";
    }
  }

  function handleClick(event) {
    const action = event.target.closest("[data-manager-action]");
    if (!action) return;
    const type = action.dataset.managerAction;
    if (type === "open-career") openCareerModal();
    if (type === "set-tab") { activeTab = action.dataset.tab || "overview"; ctx()?.refreshView?.(); }
  }

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);

  window.FIFA_MANAGER_ROOM = { render, renderHall, refreshLeaderboard, version: VERSION };
})();
