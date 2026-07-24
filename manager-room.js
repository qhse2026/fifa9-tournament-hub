(() => {
  "use strict";

  const VERSION = "44.8.6";
  const STORAGE_KEY = "fifa-manager-room-v42";
  const RECOVERY_KEY = "fifa-manager-room-recovery-v43";
  const CATALOG_URL = "data/manager-team-catalog-fc25.json";
  const BOOTSTRAP_URL = "data/manager-bootstrap-v42.json";
  const PIN_SESSION_PREFIX = "fifa-manager-pin:";
  const LEGS = [
    { id: 1, label: "1. Devre", stars: 4 },
    { id: 2, label: "2. Devre", stars: 4.5 },
    { id: 3, label: "3. Devre", stars: 5 }
  ];
  const LEAGUE_DIVISIONS = ["premier", "championship", "league-a"];
  const FIXTURE_INTEGRITY_VERSION = 2;
  const MANAGER_ORUC_FORMAT_VERSION = 5;

  let bootstrap = null;
  let teamCatalog = null;
  let resourcesLoading = false;
  let activeTab = "overview";
  let poolFilter = "all";
  let drawAnimating = false;
  let remoteLeaderboard = [];
  let remoteLoading = false;
  let remoteLoadedAt = 0;
  let selectedFriendlyOpponent = null;
  let hallRowsCache = [];
  let hallSortMode = "career_points";
  let hallDivisionMode = "all";
  let hallSearchTerm = "";
  const FRIENDLY_HISTORY_LIMIT = 60;
  let selectedArchiveFixtureId = null;
  let selectedFixtureMatchday = "all";
  let selectedCupRound = null;
  let calendarFilter = "all";
  let cloudSyncTimer = null;
  let cloudSyncInFlight = false;
  let cloudPollInFlight = false;
  let lastCloudPollAt = 0;
  let storageWarningShown = false;
  const dirtyCareerIds = new Set();
  const CLOUD_SYNC_DEBOUNCE_MS = 1200;
  const CLOUD_POLL_INTERVAL_MS = 30000;
  const STORAGE_SOFT_LIMIT = 4_250_000;
  const DEVICE_KEY = "fifa-manager-device-id-v1";
  const CLOUD_CONFLICT_TOLERANCE_MS = 1500;
  let cloudSyncPromise = null;

  function seededNumber(seedText){let h=2166136261;for(const char of String(seedText)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
  function shuffled(rows,seedText){const next=seededNumber(seedText),copy=[...rows];for(let i=copy.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]];}return copy;}
  function legacyCupSeriesMatches(career,round,index,actorA,actorB,matchdays,seedText){
    const id=`oruc-s${career.seasonNo}-r${round}-${index+1}`,next=seededNumber(`${seedText}|${id}`);
    return [1,2,3].map((leg,gameIndex)=>({
      id:`${id}-m${leg}`,competition:"oruc",cupSeriesId:id,cupRound:round,leg,
      matchday:matchdays[gameIndex],stars:[4,4.5,5][Math.floor(next()*3)],
      homeId:leg===2?actorB:actorA,awayId:leg===2?actorA:actorB,
      division:"oruc",status:"scheduled",decisions:[]
    }));
  }

  function singleCupFixture(career,round,index,actorA,actorB,matchday){
    const id=`oruc-s${career.seasonNo}-r${round}-${index+1}`;
    return {
      id:`${id}-m1`,
      competition:"oruc",
      cupSeriesId:id,
      cupRound:round,
      leg:1,
      matchday,
      stars:4.5,
      homeId:actorA,
      awayId:actorB,
      division:"oruc",
      status:"scheduled",
      decisions:[],
      winnerId:null,
      shootout:null
    };
  }

  function pendingOfficialFixtures(career){
    return (career.fixtures||[]).filter(fixture =>
      fixture.competition !== "friendly" &&
      ["scheduled","in-progress"].includes(fixture.status)
    );
  }

  function leagueCompetitionComplete(career){
    return !(career.fixtures||[]).some(fixture =>
      fixture.competition === "league" &&
      ["scheduled","in-progress"].includes(fixture.status)
    );
  }

  function qualifiedManagerCupEntrants(career){
    const premier=sortedLeagueRows(career,"premier").slice(0,5).map((row,index)=>({
      id:row.actorId,league:"premier",qualification:`Premier ${index+1}`
    }));
    const championship=sortedLeagueRows(career,"championship").slice(0,3).map((row,index)=>({
      id:row.actorId,league:"championship",qualification:`Championship ${index+1}`
    }));
    const unique=[];
    [...premier,...championship].forEach(row=>{
      if(row.id&&!unique.some(item=>item.id===row.id))unique.push(row);
    });
    return {premier,championship,all:unique};
  }

  function createManagerOrucCupV5(career){
    const existing=career.orucCup;
    if(existing?.formatVersion===MANAGER_ORUC_FORMAT_VERSION&&existing.series?.length)return existing;
    const qualified=qualifiedManagerCupEntrants(career);
    if(qualified.all.length<8){
      career.orucCup={
        version:VERSION,formatVersion:MANAGER_ORUC_FORMAT_VERSION,status:"unavailable",
        series:[],round:0,totalRounds:3,entrantCount:qualified.all.length,
        entrants:qualified.all,reason:"Premier ilk 5 ve Championship ilk 3 tamamlanamadı."
      };
      return career.orucCup;
    }

    career.fixtures=(career.fixtures||[]).filter(fixture=>fixture.competition!=="oruc");
    const seed=`${career.id}|${career.seasonNo}|ORUC-V5`;
    const draw=shuffled(qualified.all.map(row=>row.id),seed);
    const lastLeagueMatchday=Math.max(
      0,
      ...(career.fixtures||[])
        .filter(fixture=>fixture.competition==="league")
        .map(fixture=>Number(fixture.matchday||0))
    );
    const matchday=lastLeagueMatchday+1;
    const series=[];

    for(let index=0;index<4;index+=1){
      const fixture=singleCupFixture(career,1,index,draw[index*2],draw[index*2+1],matchday);
      career.fixtures.push(fixture);
      series.push({
        id:fixture.cupSeriesId,round:1,actorA:fixture.homeId,actorB:fixture.awayId,
        matchIds:[fixture.id],winnerId:null,scoreA:0,scoreB:0,drawOrder:index+1,bestOf:1
      });
    }

    career.orucCup={
      version:VERSION,
      formatVersion:MANAGER_ORUC_FORMAT_VERSION,
      format:"premier-top5-championship-top3-single-match",
      status:"active",
      series,
      round:1,
      totalRounds:3,
      entrantCount:8,
      entrants:qualified.all,
      bestOf:1,
      firstTo:1,
      drawSeed:seed,
      drawOrder:draw,
      drawLocked:true,
      roundNames:{1:"ÇEYREK FİNAL",2:"YARI FİNAL",3:"FİNAL"},
      generatedAt:now()
    };
    return career.orucCup;
  }

  function ensureOrucCup(career) {
    if(!career?.actors?.length)return;

    const cup=career.orucCup;
    if(cup?.formatVersion===4&&cup.series?.length){
      cup.version=VERSION;
      cup.legacyPreserved=true;
      cup.migrationNote ||= "Mevcut Best of 3 kupa ilerlemesi korunuyor. Yeni sezonda 8 oyunculu tek maç formatı başlayacak.";
      return;
    }

    if(cup?.formatVersion===MANAGER_ORUC_FORMAT_VERSION){
      cup.version=VERSION;
      if(cup.status==="locked"&&leagueCompetitionComplete(career))createManagerOrucCupV5(career);
      return;
    }

    career.orucCup={
      version:VERSION,
      formatVersion:MANAGER_ORUC_FORMAT_VERSION,
      format:"premier-top5-championship-top3-single-match",
      status:"locked",
      series:[],
      round:0,
      totalRounds:3,
      entrantCount:8,
      entrants:[],
      bestOf:1,
      firstTo:1,
      drawLocked:false,
      roundNames:{1:"ÇEYREK FİNAL",2:"YARI FİNAL",3:"FİNAL"}
    };

    if(leagueCompetitionComplete(career))createManagerOrucCupV5(career);
  }

  function advanceLegacyOrucCup(career){
    const cup=career.orucCup;
    if(!cup)return;
    const current=cup.series.filter(series=>series.round===cup.round);

    current.forEach(series=>{
      if(series.winnerId)return;
      const matches=series.matchIds.map(id=>career.fixtures.find(fixture=>fixture.id===id));
      let a=0,b=0;
      matches.filter(fixture=>fixture?.status==="played").forEach(fixture=>{
        const winner=fixture.winnerId||(
          fixture.homeScore===fixture.awayScore
            ? null
            : fixture.homeScore>fixture.awayScore?fixture.homeId:fixture.awayId
        );
        if(winner===series.actorA)a++;
        if(winner===series.actorB)b++;
      });
      series.scoreA=a;
      series.scoreB=b;
      if(a>=2||b>=2){
        series.winnerId=a>b?series.actorA:series.actorB;
        series.completedAt=now();
        matches.filter(fixture=>fixture?.status==="scheduled").forEach(fixture=>{
          fixture.status="cancelled";
          fixture.cancelReason="SERİ 2 GALİBİYETTE TAMAMLANDI";
        });
      }
    });

    if(!current.length||!current.every(series=>series.winnerId))return;
    let winners=current.map(series=>series.winnerId);
    if(winners.length===1){
      cup.championId=winners[0];
      cup.status="finished";
      cup.completedAt=now();
      if(winners[0]===career.humanActorId&&!cup.humanTrophyApplied){
        career.trophies.oruc=Number(career.trophies.oruc||0)+1;
        cup.humanTrophyApplied=true;
      }
      return;
    }

    if(cup.series.some(series=>series.round===cup.round+1)){
      cup.round+=1;
      return;
    }

    const currentMatchdays=current.flatMap(series=>
      series.matchIds.map(id=>career.fixtures.find(fixture=>fixture.id===id)?.matchday||0)
    );
    const lastCupMd=Math.max(0,...currentMatchdays);
    cup.round+=1;
    winners=shuffled(winners,`${cup.drawSeed}|ROUND-${cup.round}`);
    const base=Math.max(lastCupMd,cup.round===2?9:0)+3;

    for(let index=0;index<winners.length;index+=2){
      if(!winners[index+1])continue;
      const matches=legacyCupSeriesMatches(
        career,cup.round,index/2,winners[index],winners[index+1],
        [base,base+3,base+6],cup.drawSeed
      );
      career.fixtures.push(...matches);
      cup.series.push({
        id:matches[0].cupSeriesId,round:cup.round,
        actorA:winners[index],actorB:winners[index+1],
        matchIds:matches.map(fixture=>fixture.id),
        winnerId:null,scoreA:0,scoreB:0,drawOrder:index/2+1
      });
    }
  }

  function advanceOrucCup(career) {
    ensureOrucCup(career);
    const cup=career.orucCup;
    if(!cup||["finished","unavailable","locked"].includes(cup.status))return;
    if(Number(cup.formatVersion||0)<MANAGER_ORUC_FORMAT_VERSION){
      advanceLegacyOrucCup(career);
      return;
    }

    const current=cup.series.filter(series=>series.round===cup.round);
    current.forEach(series=>{
      if(series.winnerId)return;
      const fixture=career.fixtures.find(row=>row.id===series.matchIds?.[0]);
      if(!fixture||fixture.status!=="played")return;
      const winner=fixture.winnerId||(
        fixture.homeScore===fixture.awayScore
          ? (fixture.shootout?.home>fixture.shootout?.away?fixture.homeId:fixture.awayId)
          : fixture.homeScore>fixture.awayScore?fixture.homeId:fixture.awayId
      );
      if(!winner)return;
      series.winnerId=winner;
      series.scoreA=winner===series.actorA?1:0;
      series.scoreB=winner===series.actorB?1:0;
      series.completedAt=now();
    });

    if(!current.length||!current.every(series=>series.winnerId))return;
    let winners=current.map(series=>series.winnerId);

    if(winners.length===1){
      cup.championId=winners[0];
      cup.status="finished";
      cup.completedAt=now();
      if(winners[0]===career.humanActorId&&!cup.humanTrophyApplied){
        career.trophies.oruc=Number(career.trophies.oruc||0)+1;
        cup.humanTrophyApplied=true;
      }
      return;
    }

    const nextRound=cup.round+1;
    if(cup.series.some(series=>series.round===nextRound)){
      cup.round=nextRound;
      return;
    }

    winners=shuffled(winners,`${cup.drawSeed}|ROUND-${nextRound}`);
    const lastMatchday=Math.max(
      0,
      ...current.flatMap(series=>
        (series.matchIds||[]).map(id=>Number(career.fixtures.find(fixture=>fixture.id===id)?.matchday||0))
      )
    );
    const matchday=lastMatchday+1;
    const nextSeries=[];

    for(let index=0;index<winners.length;index+=2){
      if(!winners[index+1])continue;
      const fixture=singleCupFixture(
        career,nextRound,index/2,winners[index],winners[index+1],matchday
      );
      career.fixtures.push(fixture);
      nextSeries.push({
        id:fixture.cupSeriesId,round:nextRound,
        actorA:fixture.homeId,actorB:fixture.awayId,
        matchIds:[fixture.id],winnerId:null,scoreA:0,scoreB:0,
        drawOrder:index/2+1,bestOf:1
      });
    }

    cup.round=nextRound;
    cup.series.push(...nextSeries);
    cup.status="active";
  }

  function seasonGateState(career){
    const pending=pendingOfficialFixtures(career);
    const pendingHuman=pending.filter(fixture=>
      [fixture.homeId,fixture.awayId].includes(career.humanActorId)
    );
    const pendingAi=pending.filter(fixture=>
      ![fixture.homeId,fixture.awayId].includes(career.humanActorId)
    );
    const leaguePending=pending.filter(fixture=>fixture.competition==="league");
    const cupPending=pending.filter(fixture=>fixture.competition==="oruc");
    const cup=career.orucCup||{};
    const leagueComplete=leaguePending.length===0;
    const cupFinished=cup.status==="finished"||(
      Boolean(cup.championId)&&cupPending.length===0
    );
    return {
      leagueComplete,
      cupFinished,
      seasonComplete:leagueComplete&&cupFinished&&pending.length===0,
      pending,
      pendingHuman,
      pendingAi,
      leaguePending,
      cupPending,
      cupStatus:cup.status||"locked",
      cupRound:Number(cup.round||0),
      cupChampionId:cup.championId||null,
      humanCupFixture:pendingHuman.find(fixture=>fixture.competition==="oruc")||null
    };
  }

  const ctx = () => window.FIFA_APP_CONTEXT;
  const cloud = () => window.FIFA_CLOUD;
  const esc = value => ctx()?.escapeHTML
    ? ctx().escapeHTML(String(value ?? ""))
    : String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 9)}`;

  function deviceId() {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid("device");
      try { localStorage.setItem(DEVICE_KEY, id); } catch (_) {}
    }
    return id;
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : { version: VERSION, careers: [], activeCareerId: null };
    } catch (_) {
      try{const recovery=JSON.parse(localStorage.getItem(RECOVERY_KEY)||"null");if(recovery&&typeof recovery==="object")return recovery;}catch(__){}
      return { version: VERSION, careers: [], activeCareerId: null };
    }
  }

  let managerState = loadLocal();

  function migrateCareer(career) {
    if (!career || typeof career !== "object") return career;
    career.teamCatalogVersion ||= null;
    career.teamDrawHistory ||= [];
    career.development ||= {};
    career.development.foundation = true;
    career.development.teamDraw = true;
    career.development.matchEngine = true;
    career.development.decisionEngine = true;
    career.development.matchCentre = true;
    career.development.dynamicElo = true;
    career.development.competitionProgression = Boolean(career.development.competitionProgression);
    career.fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    career.matchHistory = Array.isArray(career.matchHistory) ? career.matchHistory : [];
    career.friendlyHistory = Array.isArray(career.friendlyHistory) ? career.friendlyHistory.slice(0, FRIENDLY_HISTORY_LIMIT) : [];
    career.friendlyGuests = Array.isArray(career.friendlyGuests) ? career.friendlyGuests.slice(-40) : [];
    career.friendlyStats ||= { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
    career.matchEngineStats ||= { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, decisions: 0 };
    career.managerIdentity ||= { level:"manager", sound:true, reputation:50, dna:{ attack:50, control:50, adaptability:50, motivation:50, bigMatch:50 }, skills:{ tacticalReading:0, motivation:0, fitness:0, scouting:0 } };
    career.rivalries ||= {};
    career.actors.forEach(item=>{ item.tacticalIQ=Number(item.tacticalIQ||Math.max(42,Math.min(92,Math.round(48+(item.power-900)/18)))); item.reputation=Number(item.reputation||Math.max(35,Math.min(95,Math.round(45+(item.power-900)/16)))); item.formRating=Number(item.formRating||50); item.managerMemory ||= { meetings:0,wins:0,draws:0,losses:0,plans:{},lastPlan:null,confidence:50,notes:[] }; item.managerMemory.patterns ||= {formations:{},buildUps:{},pressing:{},mentalities:{},phaseBehaviors:{},responses:{}}; item.personality ||= buildManagerPersonality(item); item.managerAttributes ||= {adaptation:item.tacticalIQ,gameReading:item.tacticalIQ,riskManagement:50,bigMatch:50,consistency:50,mentality:50}; item.psychology ||= {confidence:50,pressure:35,composure:55,streak:0,mood:"DENGELİ"}; });
    career.intelligence ||= { version:VERSION, humanPatterns:{}, insights:[] };
    career.managerAttributes ||= {adaptation:career.tacticalIQ||50,gameReading:career.tacticalIQ||50,riskManagement:50,bigMatch:50,consistency:50,mentality:50};
    career.playerStyle ||= {label:"ANALİZ BEKLİYOR",tempo:50,directness:50,pressing:50,risk:50,control:50,samples:0};
    career.managerRating=Number(career.managerRating||Math.round((career.tacticalIQ||50)*.5+25));
    career.storyFeed=Array.isArray(career.storyFeed)?career.storyFeed:[];
    career.seasonAwards=Array.isArray(career.seasonAwards)?career.seasonAwards:[];
    managerState.saveSlots ||= {};
    if(career.orucCup){
      career.orucCup.version=VERSION;
      career.orucCup.firstTo=Number(career.orucCup.formatVersion||0)>=MANAGER_ORUC_FORMAT_VERSION?1:2;
      career.orucCup.bestOf=Number(career.orucCup.formatVersion||0)>=MANAGER_ORUC_FORMAT_VERSION?1:Number(career.orucCup.bestOf||3);
      (career.orucCup.series||[]).forEach(series=>{
        series.scoreA=Number(series.scoreA||0);
        series.scoreB=Number(series.scoreB||0);
        if(Number(career.orucCup.formatVersion||0)>=MANAGER_ORUC_FORMAT_VERSION)series.bestOf=1;
      });
    }
    career.fixtures.forEach(fixture => {
      fixture.status ||= "scheduled";
      if (fixture.homeTeam === "") fixture.homeTeam = null;
      if (fixture.awayTeam === "") fixture.awayTeam = null;
      fixture.teamDraw ||= null;
      fixture.matchPlan ||= null;
      if(fixture.matchPlan){fixture.matchPlan.phaseBehaviors ||= {inPossession:"positional",outPossession:"mid-block",winTransition:"secure",lossTransition:"regroup"};fixture.matchPlan.autoOrders=Array.isArray(fixture.matchPlan.autoOrders)?fixture.matchPlan.autoOrders:["trailing-60","leading-70","fatigue-60","own-red"];}
      fixture.matchEngine ||= null;
      fixture.stats ||= null;
      fixture.decisions = Array.isArray(fixture.decisions) ? fixture.decisions : [];
      if (fixture.matchEngine) {
        fixture.matchEngine.version = VERSION;
        fixture.matchEngine.userPlan ||= fixture.matchPlan || {};
        fixture.matchEngine.userPlan.phaseBehaviors ||= {inPossession:"positional",outPossession:"mid-block",winTransition:"secure",lossTransition:"regroup"};
        fixture.matchEngine.userPlan.autoOrders=Array.isArray(fixture.matchEngine.userPlan.autoOrders)?fixture.matchEngine.userPlan.autoOrders:["trailing-60","leading-70","fatigue-60","own-red"];
        fixture.matchEngine.aiPlan ||= {};
        fixture.matchEngine.aiPlan.phaseBehaviors ||= {inPossession:"positional",outPossession:"mid-block",winTransition:"counter",lossTransition:"regroup"};
        fixture.matchEngine.aiPlan.autoOrders=Array.isArray(fixture.matchEngine.aiPlan.autoOrders)?fixture.matchEngine.aiPlan.autoOrders:["leading-70","fatigue-60","opponent-red","own-red"];
        fixture.matchEngine.humanSide ||= fixture.homeId===career.humanActorId?"home":"away";
        fixture.matchEngine.phaseState ||= {possession:"home",previousPossession:"home",transitionSide:null,transitionUntil:0,home:"inPossession",away:"outPossession"};
        fixture.matchEngine.phaseUsage ||= {home:{inPossession:0,outPossession:0,winTransition:0,lossTransition:0},away:{inPossession:0,outPossession:0,winTransition:0,lossTransition:0}};
        fixture.matchEngine.triggeredOrders ||= {human:[],ai:[]};
        fixture.matchEngine.clockSeconds=Number.isFinite(Number(fixture.matchEngine.clockSeconds))?Number(fixture.matchEngine.clockSeconds):Math.max(0,Math.min(5400,Number(fixture.matchEngine.minute||0)*60));
        fixture.matchEngine.lastSimulatedMinute=Number.isFinite(Number(fixture.matchEngine.lastSimulatedMinute))?Number(fixture.matchEngine.lastSimulatedMinute):Math.floor(fixture.matchEngine.clockSeconds/60);
        fixture.matchEngine.playbackSpeed=[1,2,4,8,16].includes(Number(fixture.matchEngine.playbackSpeed))?Number(fixture.matchEngine.playbackSpeed):8;
        fixture.matchEngine.motionRngState=Number.isFinite(Number(fixture.matchEngine.motionRngState))?Number(fixture.matchEngine.motionRngState):((Number(fixture.matchEngine.seed||fixture.matchEngine.rngState||1)^0x9E3779B9)>>>0);
        fixture.matchEngine.commentary=Array.isArray(fixture.matchEngine.commentary)?fixture.matchEngine.commentary:(fixture.matchEngine.events||[]).slice(0,8).reverse().map(row=>({second:Number(row.minute||0)*60,minute:Number(row.minute||0),clock:`${String(Number(row.minute||0)).padStart(2,"0")}:00`,side:row.side||"neutral",type:row.type||"flow",text:row.text||"Maç devam ediyor."}));
        fixture.matchEngine.matchVolatility ||= 1;
        fixture.matchEngine.lastChanceMinute = Number.isFinite(fixture.matchEngine.lastChanceMinute) ? fixture.matchEngine.lastChanceMinute : -5;
        ["home", "away"].forEach(side => {
          const stats = fixture.matchEngine.stats?.[side];
          if (!stats) return;
          ["shots","onTarget","offTarget","blocked","xg","attacks","dangerous","possession","corners","fouls","yellow","red","passes","passAccuracy","penalties","penaltiesScored","penaltiesMissed","saves","offsides","woodwork","freeKicks","varOverturns","passesAttempted","passesCompleted","shortPassesAttempted","shortPassesCompleted","mediumPassesAttempted","mediumPassesCompleted","longPassesAttempted","longPassesCompleted","finalThirdPassesAttempted","finalThirdPassesCompleted","crossesAttempted","crossesCompleted","progressivePasses","dribblesAttempted","dribblesCompleted","tacklesAttempted","tacklesWon","interceptions","recoveries","clearances","blocks","duelsTotal","duelsWon","aerialDuelsTotal","aerialDuelsWon","turnovers","highRecoveries","entriesFinalThird","entriesBox","goalsInsideBox","goalsOutsideBox","possessionSeconds"].forEach(key => stats[key] = Number(stats[key] || 0));
          if(!stats.passesAttempted&&stats.passes){stats.passesCompleted=stats.passes;stats.passesAttempted=Math.max(stats.passes,Math.round(stats.passes/Math.max(.55,stats.passAccuracy/100)));}
        });
        fixture.matchEngine.pulse = Array.isArray(fixture.matchEngine.pulse) ? fixture.matchEngine.pulse : [];
        fixture.matchEngine.tacticalSnapshots = Array.isArray(fixture.matchEngine.tacticalSnapshots) ? fixture.matchEngine.tacticalSnapshots : [];
        fixture.matchEngine.possessionChains = Array.isArray(fixture.matchEngine.possessionChains) ? fixture.matchEngine.possessionChains : [];
        fixture.matchEngine.causalEvents = Array.isArray(fixture.matchEngine.causalEvents) ? fixture.matchEngine.causalEvents : [];
        fixture.matchEngine.geometryHistory = Array.isArray(fixture.matchEngine.geometryHistory) ? fixture.matchEngine.geometryHistory : [];
        fixture.matchEngine.exploitGuard ||= {humanRepeat:0,preparedness:0,brokenAt:null,openingSignature:null};
        fixture.matchEngine.shotMap = Array.isArray(fixture.matchEngine.shotMap) ? fixture.matchEngine.shotMap : [];
        fixture.matchEngine.zoneEntries ||= { home:{left:0,centre:0,right:0}, away:{left:0,centre:0,right:0} };
        fixture.matchEngine.managerBattle = Array.isArray(fixture.matchEngine.managerBattle) ? fixture.matchEngine.managerBattle : [];
        fixture.matchEngine.tacticalDeceptions = Number(fixture.matchEngine.tacticalDeceptions||0);
        fixture.matchEngine.turningPoints = Array.isArray(fixture.matchEngine.turningPoints)?fixture.matchEngine.turningPoints:[];
        fixture.matchEngine.fogOfWar ||= {diagnosis:"control",actual:"control",readCorrect:false,signalAccuracy:50,revealed:true};
      }
    });
    ensureThreeLeagueUniverse(career);
    ensureOrucCup(career);
    return career;
  }

  managerState.careers = Array.isArray(managerState.careers) ? managerState.careers.map(migrateCareer) : [];
  managerState.careers.forEach(career => {
    career.cloudSync ||= {};
    career.cloudSync.revision = Math.max(0, Number(career.cloudSync.revision || 0));
    if (career.mode === "official" && ["pending", "error", "conflict"].includes(career.cloudSync.status)) dirtyCareerIds.add(career.id);
  });
  managerState.version = VERSION;

  function isQuotaError(error) {
    return Boolean(error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014));
  }

  function importantArchivedEvent(event) {
    return ["goal","penalty","penalty-goal","penalty-miss","red","yellow","var-overturn","woodwork","decision","adapt","auto-order","shootout","full-time"].includes(event?.type);
  }

  function compactMatchEngine(engine, aggressive = false) {
    if (!engine || typeof engine !== "object") return engine;
    const copy = JSON.parse(JSON.stringify(engine));
    const finished = ["finished","full-time"].includes(copy.status);
    const keepTail = (rows, size) => Array.isArray(rows) ? rows.slice(-size) : [];
    if (finished) {
      copy.events = (copy.events || []).filter(importantArchivedEvent).slice(-(aggressive ? 12 : 24));
      copy.commentary = [];
      copy.geometryHistory = aggressive ? [] : keepTail(copy.geometryHistory, 8);
      copy.causalEvents = keepTail(copy.causalEvents, aggressive ? 5 : 10);
      copy.pulse = keepTail(copy.pulse, aggressive ? 24 : 45);
      copy.possessionChains = keepTail(copy.possessionChains, aggressive ? 4 : 10);
      copy.turningPoints = keepTail(copy.turningPoints, 8);
      copy.shotMap = keepTail(copy.shotMap, aggressive ? 18 : 32);
      copy.managerBattle = keepTail(copy.managerBattle, 12);
      delete copy.visual2D;
      delete copy.matchFlow;
      delete copy.motion;
      delete copy.geometryCache;
      delete copy.squads;
    } else {
      copy.events = keepTail(copy.events, aggressive ? 55 : 90);
      copy.commentary = keepTail(copy.commentary, aggressive ? 12 : 24);
      copy.geometryHistory = keepTail(copy.geometryHistory, aggressive ? 16 : 30);
      copy.causalEvents = keepTail(copy.causalEvents, aggressive ? 8 : 16);
      copy.pulse = keepTail(copy.pulse, 90);
      copy.possessionChains = keepTail(copy.possessionChains, aggressive ? 8 : 16);
      copy.shotMap = keepTail(copy.shotMap, 45);
      if (copy.matchFlow?.passTrail) copy.matchFlow.passTrail = keepTail(copy.matchFlow.passTrail, 14);
    }
    return copy;
  }

  function compactCareerSnapshot(career, aggressive = false) {
    const copy = JSON.parse(JSON.stringify(career));
    copy.fixtures = (copy.fixtures || []).map(fixture => {
      if (!fixture?.matchEngine) return fixture;
      return { ...fixture, matchEngine: compactMatchEngine(fixture.matchEngine, aggressive) };
    });
    copy.seasonArchive = (copy.seasonArchive || []).slice(-(aggressive ? 1 : 3)).map(season => ({
      ...season,
      fixtures: (season.fixtures || []).map(fixture => fixture?.matchEngine ? { ...fixture, matchEngine: compactMatchEngine(fixture.matchEngine, true) } : fixture)
    }));
    copy.matchHistory = (copy.matchHistory || []).slice(0, aggressive ? 80 : 180);
    copy.friendlyHistory = (copy.friendlyHistory || []).slice(0, aggressive ? 25 : FRIENDLY_HISTORY_LIMIT);
    copy.friendlyGuests = (copy.friendlyGuests || []).slice(-(aggressive ? 15 : 40));
    copy.storyFeed = (copy.storyFeed || []).slice(0, aggressive ? 30 : 60);
    return copy;
  }

  function compactManagerState(aggressive = false) {
    const copy = {
      ...managerState,
      version: VERSION,
      careers: (managerState.careers || []).map(career => compactCareerSnapshot(career, aggressive)),
      saveSlots: {}
    };
    Object.entries(managerState.saveSlots || {}).forEach(([careerId, slots]) => {
      copy.saveSlots[careerId] = {};
      Object.entries(slots || {}).forEach(([slot, row]) => {
        if (!row?.career) return;
        copy.saveSlots[careerId][slot] = { ...row, career: compactCareerSnapshot(row.career, true) };
      });
    });
    return copy;
  }

  function saveLocal() {
    managerState.version = VERSION;
    let payload = JSON.stringify(compactManagerState(false));
    if (payload.length > STORAGE_SOFT_LIMIT) payload = JSON.stringify(compactManagerState(true));
    try {
      localStorage.removeItem(RECOVERY_KEY);
      localStorage.setItem(STORAGE_KEY, payload);
      storageWarningShown = false;
      return true;
    } catch (error) {
      if (isQuotaError(error)) {
        try {
          localStorage.removeItem(RECOVERY_KEY);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(compactManagerState(true)));
          if (!storageWarningShown) ctx()?.toast?.("Kayıt alanı optimize edildi; eski ağır maç telemetrileri küçültüldü.", "warning");
          storageWarningShown = true;
          return true;
        } catch (retryError) {
          console.error("Manager local save quota exceeded", retryError);
          if (!storageWarningShown) ctx()?.toast?.("Tarayıcı kayıt alanı dolu. Kariyer buluta senkronize edilmeye devam edecek.", "warning");
          storageWarningShown = true;
          return false;
        }
      }
      console.error("Manager local save failed", error);
      return false;
    }
  }

  function activeCareer() {
    return managerState.careers.find(item => item.id === managerState.activeCareerId) || null;
  }

  function setSessionPin(career, pin) {
    if (!career?.id || !/^\d{6}$/.test(String(pin || ""))) return;
    sessionStorage.setItem(`${PIN_SESSION_PREFIX}${career.id}`, String(pin));
  }

  function getSessionPin(career) {
    if (!career?.id) return "";
    return sessionStorage.getItem(`${PIN_SESSION_PREFIX}${career.id}`) || "";
  }

  async function ensureResources() {
    if ((bootstrap && teamCatalog) || resourcesLoading) return;
    resourcesLoading = true;
    try {
      const [bootstrapResponse, catalogResponse] = await Promise.all([
        fetch(BOOTSTRAP_URL, { cache: "no-store" }),
        fetch(CATALOG_URL, { cache: "no-store" })
      ]);
      if (!bootstrapResponse.ok) throw new Error("Manager başlangıç verisi yüklenemedi.");
      if (!catalogResponse.ok) throw new Error("FC 25 takım kataloğu yüklenemedi.");
      bootstrap = await bootstrapResponse.json();
      teamCatalog = await catalogResponse.json();
    } catch (error) {
      console.warn("Manager resource fallback", error);
      bootstrap ||= buildRuntimeBootstrap();
      teamCatalog ||= buildCatalogFallback();
    } finally {
      resourcesLoading = false;
      managerState.careers.forEach(career => {
        career.teamCatalogVersion ||= teamCatalog?.version || VERSION;
      });
      saveLocal();
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
      return {
        id: `AI-${String(index + 1).padStart(2, "0")}`,
        name,
        historicalRank: row.rank || null,
        historical: row,
        honours,
        powerSeed,
        powerClass: powerSeed >= 1550 ? "Elite" : powerSeed >= 1350 ? "Strong" : powerSeed >= 1150 ? "Competitive" : "Challenger",
        hiddenStyle: { tempo: 50, pressing: 50, directness: 50, width: 50, risk: 50, control: 50, resilience: 50, adaptation: 50, clutch: 50, volatility: 50 }
      };
    });
    return {
      version: 42,
      readiness: {
        combinedAiPlayers: profiles.length,
        premierAiTeams: top.length,
        championshipAiTeams: Math.max(0, profiles.length - top.length),
        championshipWithHumanClub: Math.max(1, profiles.length - top.length + 1)
      },
      competitionRules: {
        premier: { aiTeams: 10, relegation: 2, legs: [4, 4.5, 5] },
        championship: { directPromotion: 1, playoffRanks: [2, 3, 4, 5], playoffBestOf: 3, playoffStars: 4.5, legs: [4, 4.5, 5] },
        orucReisCup: { premierQualifiers: 5, championshipQualifiers: 3, allRoundsBestOf: 3, stars: 4.5 },
        superCup: { enabled: true }
      },
      premierPlayerNames: top,
      championshipPlayerNames: names.filter(name => !top.includes(name)),
      aiProfiles: profiles
    };
  }

  function buildCatalogFallback() {
    const teams = [
      ["real-madrid", "Real Madrid", 5, 85, 88, 86, 81],
      ["manchester-city", "Manchester City", 5, 85, 86, 83, 79],
      ["inter", "Inter", 5, 84, 86, 84, 83],
      ["fc-barcelona", "FC Barcelona", 5, 84, 85, 85, 83],
      ["newcastle-united", "Newcastle United", 4.5, 81, 81, 80, 80],
      ["aston-villa", "Aston Villa", 4.5, 81, 84, 80, 80],
      ["galatasaray", "Galatasaray", 4.5, 79, 85, 78, 77],
      ["stuttgart", "VfB Stuttgart", 4, 77, 77, 77, 75],
      ["ajax", "Ajax", 4, 76, 76, 77, 74],
      ["besiktas", "Beşiktaş", 4, 76, 82, 76, 75]
    ].map(row => ({ id: row[0], clubName: row[1], country: "Europe", league: "FC 25", stars: row[2], overall: row[3], attack: row[4], midfield: row[5], defence: row[6], active: true, attributes: {} }));
    return { version: VERSION, counts: { total: teams.length }, teams };
  }

  function slug(value) {
    return String(value || "club").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function initials(value, max = 3) {
    return String(value || "FC").split(/\s+/).filter(Boolean).map(part => part[0]).join("").slice(0, max).toUpperCase();
  }

  function managerClubName(name) {
    const pieces = String(name || "AI").trim().split(/\s+/);
    const base = pieces.length > 1 ? pieces[pieces.length - 1] : pieces[0];
    const suffixes = ["Athletic", "United", "City", "Sporting", "Rovers", "FC"];
    let score = 0;
    for (const char of String(name)) score += char.charCodeAt(0);
    return `${base} ${suffixes[score % suffixes.length]}`;
  }

  function buildManagerPersonality(item={}) {
    const style=item.styleSeed||{}; let seed=0; for(const c of String(item.id||item.managerName||"AI"))seed=(seed*31+c.charCodeAt(0))>>>0;
    const axis=(key,fallback,spread=16)=>Math.max(18,Math.min(94,Math.round(Number(style[key]??fallback)+((seed%(spread*2+1))-spread))));
    const personality={attack:axis("risk",55),control:axis("control",52),aggression:axis("pressing",54),risk:axis("risk",50),adaptation:axis("adaptation",58),patience:axis("tempo",50),bigMatch:axis("variance",58),unpredictability:35+(seed%58)};
    const traits=[]; if(personality.aggression>68)traits.push("ERKEN BASKICI");if(personality.control>68)traits.push("SABIRLI KURUCU");if(personality.risk>72)traits.push("KAOS ÜRETİCİSİ");if(personality.patience>68)traits.push("SKOR KORUYUCU");if(Number(style.width||50)>62)traits.push("KANAT AVCISI");if(Number(style.width||50)<40)traits.push("MERKEZ USTASI");if(personality.adaptation>72)traits.push("İKİNCİ YARI UZMANI");if(personality.unpredictability>72)traits.push("ÖNGÖRÜLEMEZ");
    personality.traits=traits.slice(0,3).length?traits.slice(0,3):["DENGELİ STRATEJİST"];return personality;
  }

  function createActors(profileNames, division) {
    return profileNames.map(name => {
      const profile = bootstrap.aiProfiles.find(item => item.name === name) || { id: `AI-${slug(name)}`, name, powerSeed: 1100, powerClass: "Competitive", hiddenStyle: {} };
      const clubName = managerClubName(profile.name);
      return {
        id: profile.id,
        type: "ai",
        managerName: profile.name,
        clubName,
        shortName: initials(clubName, 4),
        division,
        power: profile.powerSeed,
        powerClass: profile.powerClass,
        tacticalIQ: Math.max(42,Math.min(92,Math.round(48+(profile.powerSeed-900)/18))),
        reputation: Math.max(35,Math.min(95,Math.round(45+(profile.powerSeed-900)/16))),
        formRating: 50,
        styleVisible: false,
        styleSeed: profile.hiddenStyle || {},
        historicalRank: profile.historicalRank,
        personality: buildManagerPersonality({id:profile.id,managerName:profile.name,styleSeed:profile.hiddenStyle||{}}),
        managerAttributes: {adaptation:Math.max(40,Math.min(92,Math.round(50+Number(profile.hiddenStyle?.adaptation||50)/5))),gameReading:Math.max(40,Math.min(92,Math.round(48+(profile.powerSeed-900)/20))),riskManagement:50,bigMatch:50,consistency:50,mentality:50}
      };
    });
  }

  function syntheticActor(index){const names=["Atlas Koral","Mert Vardar","Levent Kuzey","Arda Tanay"],name=names[index%names.length],id=`AI-V44-${index+1}-${slug(name)}`,power=980+index*17,item={id,type:"ai",managerName:name,clubName:managerClubName(name),shortName:initials(managerClubName(name),4),division:"league-a",power,powerClass:"Competitive",tacticalIQ:Math.round(52+index*2),reputation:48+index,formRating:50,styleVisible:false,styleSeed:{tempo:44+index*5,directness:52+index*4,pressing:48+index*6,risk:46+index*5,adaptation:54+index*3,width:45+index*7}};item.personality=buildManagerPersonality(item);item.managerAttributes={adaptation:item.tacticalIQ,gameReading:item.tacticalIQ,riskManagement:50,bigMatch:50,consistency:50,mentality:50};item.managerMemory={meetings:0,wins:0,draws:0,losses:0,plans:{},lastPlan:null,confidence:50,notes:[]};item.psychology={confidence:50,pressure:35,composure:55,streak:0,mood:"DENGELİ"};return item;}

  function assignThreeLeagueDivisions(actors, humanId) {
    const human = actors.find(actor => actor.id === humanId);
    const ai = actors
      .filter(actor => actor.id !== humanId)
      .sort((a, b) => Number(b.power || 0) - Number(a.power || 0) || String(a.id).localeCompare(String(b.id)))
      .slice(0, 26);
    while (ai.length < 26) ai.push(syntheticActor(ai.length));
    ai.forEach((item, index) => { item.division = index < 9 ? "premier" : index < 17 ? "championship" : "league-a"; });
    if (human) human.division = "championship";
    return [...ai, human].filter(Boolean);
  }

  function buildThreeLeagueActors(playerName, human) {
    const source = [...(bootstrap.premierPlayerNames || []), ...(bootstrap.championshipPlayerNames || [])]
      .filter((name, index, rows) => rows.indexOf(name) === index && String(name).toLocaleLowerCase("tr-TR") !== String(playerName).toLocaleLowerCase("tr-TR"));
    const ai = createActors(source.slice(0, 26), "league-a");
    while (ai.length < 26) ai.push(syntheticActor(ai.length));
    return assignThreeLeagueDivisions([...ai, human], human.id);
  }

  function buildLeagueFixtures(actors, offset = 0) {
    return [1, 2, 3]
      .flatMap(leg => LEAGUE_DIVISIONS.flatMap(division => roundRobin(actors.filter(actor => actor.division === division).map(actor => actor.id), division, leg)))
      .map(fixture => ({ ...fixture, matchday: Number(fixture.matchday || 0) + offset }));
  }

  function divisionMapIsValid(career, map) {
    if (!map || typeof map !== "object") return false;
    const actorIds = new Set((career.actors || []).map(actor => actor.id));
    const counts = { premier: 0, championship: 0, "league-a": 0 };
    for (const actorId of actorIds) {
      const division = map[actorId];
      if (!LEAGUE_DIVISIONS.includes(division)) return false;
      counts[division] += 1;
    }
    return actorIds.size === 27 && LEAGUE_DIVISIONS.every(division => counts[division] === 9);
  }

  function inferSeasonDivisionMap(career) {
    if (divisionMapIsValid(career, career.seasonDivisionMap)) return { ...career.seasonDivisionMap };

    const membership = new Map();
    (career.fixtures || []).forEach(fixture => {
      if (fixture.competition !== "league" || !LEAGUE_DIVISIONS.includes(fixture.division)) return;
      [fixture.homeId, fixture.awayId].forEach(actorId => {
        if (!actorId) return;
        if (!membership.has(actorId)) membership.set(actorId, { premier: 0, championship: 0, "league-a": 0 });
        membership.get(actorId)[fixture.division] += 1;
      });
    });

    const fromFixtures = {};
    (career.actors || []).forEach(actor => {
      const counts = membership.get(actor.id);
      if (!counts) return;
      const ranked = LEAGUE_DIVISIONS
        .map(division => [division, Number(counts[division] || 0)])
        .sort((a, b) => b[1] - a[1]);
      if (ranked[0][1] > 0 && ranked[0][1] > ranked[1][1]) fromFixtures[actor.id] = ranked[0][0];
    });
    if (divisionMapIsValid(career, fromFixtures)) return fromFixtures;

    const fromActors = Object.fromEntries((career.actors || []).map(actor => [actor.id, actor.division]));
    if (divisionMapIsValid(career, fromActors)) return fromActors;

    career.actors = assignThreeLeagueDivisions(career.actors || [], career.humanActorId);
    return Object.fromEntries(career.actors.map(actor => [actor.id, actor.division]));
  }

  function applySeasonDivisionMap(career, map) {
    career.seasonDivisionMap = { ...map };
    (career.actors || []).forEach(actor => {
      if (LEAGUE_DIVISIONS.includes(map[actor.id])) actor.division = map[actor.id];
    });
    career.division = map[career.humanActorId] || career.division || "championship";
  }

  function rebuildThreeLeagueTables(career) {
    const rowsByDivision = {};
    LEAGUE_DIVISIONS.forEach(division => {
      rowsByDivision[division] = new Map(
        (career.actors || [])
          .filter(actor => career.seasonDivisionMap?.[actor.id] === division)
          .map(actor => [actor.id, { actorId: actor.id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }])
      );
    });

    (career.fixtures || []).forEach(fixture => {
      if (fixture.competition !== "league" || fixture.status !== "played" || !LEAGUE_DIVISIONS.includes(fixture.division)) return;
      const homeScore = Number(fixture.homeScore);
      const awayScore = Number(fixture.awayScore);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return;
      const divisionRows = rowsByDivision[fixture.division];
      if (!divisionRows) return;
      const ensureRow = actorId => {
        if (!divisionRows.has(actorId)) divisionRows.set(actorId, { actorId, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 });
        return divisionRows.get(actorId);
      };
      const home = ensureRow(fixture.homeId);
      const away = ensureRow(fixture.awayId);
      home.mp += 1; away.mp += 1;
      home.gf += homeScore; home.ga += awayScore;
      away.gf += awayScore; away.ga += homeScore;
      if (homeScore > awayScore) { home.w += 1; away.l += 1; home.pts += 3; }
      else if (awayScore > homeScore) { away.w += 1; home.l += 1; away.pts += 3; }
      else { home.d += 1; away.d += 1; home.pts += 1; away.pts += 1; }
      home.gd = home.gf - home.ga;
      away.gd = away.gf - away.ga;
      fixture.tableApplied = true;
    });

    career.tables = Object.fromEntries(LEAGUE_DIVISIONS.map(division => [division, [...rowsByDivision[division].values()]]));
  }

  function repairLeagueSchedule(career) {
    const nonLeague = (career.fixtures || []).filter(fixture => fixture.competition !== "league");
    const existingLeague = (career.fixtures || []).filter(fixture => fixture.competition === "league");
    const seenIds = new Set();
    const repaired = [];
    let removedDuplicates = 0;
    let removedStale = 0;

    existingLeague.forEach(fixture => {
      if (seenIds.has(fixture.id)) { removedDuplicates += 1; return; }
      seenIds.add(fixture.id);
      const homeDivision = career.seasonDivisionMap?.[fixture.homeId];
      const awayDivision = career.seasonDivisionMap?.[fixture.awayId];
      const validMembership = homeDivision === fixture.division && awayDivision === fixture.division;
      if (!validMembership && fixture.status !== "played") { removedStale += 1; return; }
      repaired.push(fixture);
    });

    const audit = {};
    LEAGUE_DIVISIONS.forEach(division => {
      const rows = repaired.filter(fixture => fixture.division === division);
      const pairCounts = new Map();
      const actorCounts = new Map();
      const matchdayActors = new Map();
      rows.forEach(fixture => {
        const pairKey = [fixture.homeId, fixture.awayId].sort().join("|");
        pairCounts.set(pairKey, Number(pairCounts.get(pairKey) || 0) + 1);
        [fixture.homeId, fixture.awayId].forEach(actorId => actorCounts.set(actorId, Number(actorCounts.get(actorId) || 0) + 1));
        const mdKey = Number(fixture.matchday || 0);
        if (!matchdayActors.has(mdKey)) matchdayActors.set(mdKey, new Set());
        [fixture.homeId, fixture.awayId].forEach(actorId => matchdayActors.get(mdKey).add(actorId));
      });
      const members = Object.entries(career.seasonDivisionMap || {}).filter(([, value]) => value === division).map(([actorId]) => actorId);
      const complete = rows.length === 108
        && members.length === 9
        && members.every(actorId => actorCounts.get(actorId) === 24)
        && pairCounts.size === 36
        && [...pairCounts.values()].every(count => count === 3)
        && [...matchdayActors.entries()].every(([matchday, actors]) => matchday >= 1 && matchday <= 27 && actors.size === 8);
      audit[division] = { complete, fixtures: rows.length, uniquePairs: pairCounts.size };
    });

    repaired.sort((a, b) => Number(a.matchday || 0) - Number(b.matchday || 0) || String(a.division).localeCompare(String(b.division)) || String(a.id).localeCompare(String(b.id)));
    career.fixtures = [...repaired, ...nonLeague];
    return { addedMissing: 0, removedDuplicates, removedStale, audit };
  }


  function ensureThreeLeagueUniverse(career) {
    if (!career?.actors?.length) return;
    career.fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];

    const hasFullLeagueUniverse = career.fixtures.filter(fixture => fixture.competition === "league").length >= 300;
    if (!hasFullLeagueUniverse || career.competitionStructureVersion !== 4) {
      const playedLeague = career.fixtures.filter(fixture => fixture.competition === "league" && fixture.status === "played");
      const other = career.fixtures.filter(fixture => fixture.competition !== "league");
      career.actors = assignThreeLeagueDivisions(career.actors, career.humanActorId);
      const lastPlayedMd = Math.max(0, ...playedLeague.map(fixture => Number(fixture.matchday || 0)));
      const generated = buildLeagueFixtures(career.actors, lastPlayedMd);
      const used = new Set(playedLeague.map(fixture => fixture.id));
      career.fixtures = [...playedLeague, ...generated.filter(fixture => !used.has(fixture.id)), ...other];
      career.competitionStructureVersion = 4;
      career.competitionMigration = lastPlayedMd ? { appliedAt: now(), preservedMatches: playedLeague.length, newScheduleStarts: lastPlayedMd + 1 } : null;
    }

    const seasonMap = inferSeasonDivisionMap(career);
    applySeasonDivisionMap(career, seasonMap);
    const scheduleRepair = repairLeagueSchedule(career);
    rebuildThreeLeagueTables(career);
    career.fixtureIntegrity = {
      version: FIXTURE_INTEGRITY_VERSION,
      checkedAt: now(),
      ...scheduleRepair,
      leagueFixtures: career.fixtures.filter(fixture => fixture.competition === "league").length
    };
  }

  function roundRobin(ids, division, leg) {
    const list = [...ids];
    if (list.length % 2) list.push(null);
    const matches = [];
    let rotation = [...list];
    for (let round = 0; round < rotation.length - 1; round += 1) {
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
          teamDraw: null,
          homeScore: null,
          awayScore: null,
          decisions: []
        });
      }
      rotation = [rotation[0], rotation[rotation.length - 1], ...rotation.slice(1, rotation.length - 1)];
    }
    return matches;
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
    const actors=buildThreeLeagueActors(playerName,human),fixtures=buildLeagueFixtures(actors);

    return {
      id: uid("career"),
      playerName,
      clubName,
      shortName,
      primaryColor,
      secondaryColor,
      mode: formData.get("mode") === "official" ? "official" : "test",
      createdAt: now(),
      updatedAt: now(),
      status: "match-engine-ready",
      seasonNo: 1,
      matchday: 1,
      division: "championship",
      managerElo: 1000,
      careerPoints: 0,
      prestige: 0,
      tacticalIQ: 50,
      managerRating: 50,
      managerAttributes: {adaptation:50,gameReading:50,riskManagement:50,bigMatch:50,consistency:50,mentality:50},
      playerStyle: {label:"ANALİZ BEKLİYOR",tempo:50,directness:50,pressing:50,risk:50,control:50,samples:0},
      completionRate: 0,
      trophies: { premier: 0, championship: 0, oruc: 0, super: 0 },
      humanActorId: human.id,
      actors,
      tables: { premier: initialTable(actors.filter(a=>a.division==="premier")), championship: initialTable(actors.filter(a=>a.division==="championship")), "league-a": initialTable(actors.filter(a=>a.division==="league-a")) },
      fixtures,
      competitionStructureVersion:4,
      seasonDivisionMap: Object.fromEntries(actors.map(actor => [actor.id, actor.division])),
      fixtureIntegrity: { version: FIXTURE_INTEGRITY_VERSION, checkedAt: now(), addedMissing: 0, removedDuplicates: 0, removedStale: 0, leagueFixtures: fixtures.filter(fixture => fixture.competition === "league").length },
      rules: bootstrap.competitionRules,
      teamCatalogVersion: teamCatalog?.version || VERSION,
      teamDrawHistory: [],
      matchHistory: [],
      matchEngineStats: { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, decisions: 0 },
      managerIdentity: { level:"manager", sound:true, reputation:50, dna:{ attack:50, control:50, adaptability:50, motivation:50, bigMatch:50 }, skills:{ tacticalReading:0, motivation:0, fitness:0, scouting:0 } },
      rivalries: {},
      development: { foundation: true, teamDraw: true, matchEngine: true, decisionEngine: true, competitionProgression: false },
      cloudCareerId: null
    };
  }

  function client() {
    return cloud()?.getClient?.() || null;
  }

  function trophyCount(career) {
    return Object.values(career?.trophies || {}).reduce((total, value) => total + Number(value || 0), 0);
  }

  async function createRemoteCareer(career, pin) {
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
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

  async function saveRemoteCareer(career, pin = getSessionPin(career)) {
    if (career.mode !== "official" || !career.cloudCareerId) return true;
    if (!/^\d{6}$/.test(pin)) throw new Error("Bulut kaydı için kariyeri PIN ile yeniden açman gerekiyor.");
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
    const snapshot = compactCareerSnapshot(career, false);
    snapshot.cloudSync = {
      ...(snapshot.cloudSync || {}),
      status: "synced",
      detail: "Bulut kayıt noktası",
      lastSyncedAt: now(),
      lastWriterDevice: deviceId(),
      revision: Math.max(0, Number(career.cloudSync?.revision || 0))
    };
    const { data, error } = await supabase.rpc("manager_save_career_snapshot", {
      p_career_id: career.cloudCareerId,
      p_pin: pin,
      p_snapshot: snapshot,
      p_division: career.division,
      p_season_no: career.seasonNo,
      p_matchday: career.matchday,
      p_manager_elo: career.managerElo,
      p_tactical_iq: career.tacticalIQ,
      p_career_points: career.careerPoints,
      p_prestige: career.prestige,
      p_completion_rate: career.completionRate,
      p_trophy_count: trophyCount(career)
    });
    if (error) throw error;
    if (!data) throw new Error("Manager PIN doğrulanamadı; bulut kaydı yapılmadı.");
    return true;
  }

  function careerTimestamp(career) {
    const value = Date.parse(career?.updatedAt || career?.cloudSync?.lastChangedAt || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function setCareerSyncStatus(career, status, detail = "") {
    if (!career) return;
    career.cloudSync ||= {};
    career.cloudSync.status = status;
    career.cloudSync.detail = detail;
    if (status === "synced") career.cloudSync.lastSyncedAt = now();
  }

  async function fetchRemoteCareerSnapshot(playerName, pin) {
    const supabase = client();
    if (!supabase) throw new Error("Supabase bağlantısı bulunamadı.");
    const { data, error } = await supabase.rpc("manager_unlock_career", { p_player_name: playerName, p_pin: pin });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.career_id || !row?.snapshot) throw new Error("Oyuncu adı veya Manager PIN doğrulanamadı.");
    const career = migrateCareer({ ...row.snapshot, cloudCareerId: row.career_id, mode: "official" });
    career.id ||= uid("career");
    return career;
  }

  function replaceCareerFromCloud(localCareer, remoteCareer, pin) {
    const index = managerState.careers.findIndex(item => item.id === localCareer?.id || item.playerName?.toLocaleLowerCase("tr-TR") === remoteCareer.playerName?.toLocaleLowerCase("tr-TR"));
    if (index >= 0) managerState.careers[index] = remoteCareer;
    else managerState.careers.push(remoteCareer);
    managerState.activeCareerId = remoteCareer.id;
    setSessionPin(remoteCareer, pin);
    dirtyCareerIds.delete(remoteCareer.id);
    setCareerSyncStatus(remoteCareer, "synced", "Buluttaki en güncel kayıt yüklendi.");
    saveLocal();
    return remoteCareer;
  }

  async function syncOfficialCareer(career, { mode = "auto", silent = true, overwriteRemote = false } = {}) {
    if (!career || career.mode !== "official" || !career.cloudCareerId) return career;
    const pin = getSessionPin(career);
    if (!/^\d{6}$/.test(pin)) {
      setCareerSyncStatus(career, "pin-required", "Bu cihazda Manager PIN ile kariyeri bir kez açmalısın.");
      saveLocal();
      if (!silent) throw new Error("Senkronizasyon için bu cihazda Manager PIN ile kariyeri açmalısın.");
      return career;
    }
    if (cloudSyncPromise) return cloudSyncPromise;

    cloudSyncPromise = (async () => {
      cloudSyncInFlight = true;
      setCareerSyncStatus(career, "syncing", "Bulut kaydı karşılaştırılıyor.");
      try {
        const remoteCareer = await fetchRemoteCareerSnapshot(career.playerName, pin);
        const remoteTime = careerTimestamp(remoteCareer);
        const localTime = careerTimestamp(career);
        const remoteRevision = Math.max(0, Number(remoteCareer.cloudSync?.revision || 0));
        const localRevision = Math.max(0, Number(career.cloudSync?.revision || 0));
        const localDirty = dirtyCareerIds.has(career.id) || career.cloudSync?.status === "pending";
        const remoteNewer = remoteRevision > localRevision || (remoteRevision === localRevision && remoteTime > localTime + CLOUD_CONFLICT_TOLERANCE_MS);
        const localNewer = localRevision > remoteRevision || (localRevision === remoteRevision && localTime > remoteTime + CLOUD_CONFLICT_TOLERANCE_MS);

        if (mode === "pull") {
          const loaded = replaceCareerFromCloud(career, remoteCareer, pin);
          if (!silent) ctx()?.toast?.("Buluttaki kariyer bu cihaza yüklendi.", "success");
          return loaded;
        }

        if (remoteNewer && localDirty && !overwriteRemote) {
          setCareerSyncStatus(career, "conflict", "Bulutta ve bu cihazda farklı ilerleme var. Hangi kaydın korunacağını seç.");
          saveLocal();
          throw new Error("Senkronizasyon çakışması: Bulutta daha yeni bir kayıt var.");
        }

        if (remoteNewer && !overwriteRemote) {
          const loaded = replaceCareerFromCloud(career, remoteCareer, pin);
          if (!silent) ctx()?.toast?.("Buluttaki daha yeni kariyer bu cihaza yüklendi.", "success");
          return loaded;
        }

        const shouldPush = overwriteRemote || localDirty || localNewer || mode === "push";
        if (shouldPush) {
          career.updatedAt = now();
          career.cloudSync ||= {};
          career.cloudSync.revision = Math.max(localRevision, remoteRevision) + (localDirty || localNewer || overwriteRemote ? 1 : 0);
          career.cloudSync.lastWriterDevice = deviceId();
          await saveRemoteCareer(career, pin);
          dirtyCareerIds.delete(career.id);
          setCareerSyncStatus(career, "synced", "Telefon ve bilgisayar aynı kariyer kayıt noktasını kullanıyor.");
          saveLocal();
          if (!silent) ctx()?.toast?.("Kariyer bulutla senkronize edildi.", "success");
          return career;
        }

        setCareerSyncStatus(career, "synced", "Bulut ve cihaz kayıtları eşit.");
        saveLocal();
        return career;
      } catch (error) {
        if (career.cloudSync?.status !== "conflict") setCareerSyncStatus(career, "error", error.message || "Bulut senkronizasyonu başarısız.");
        saveLocal();
        if (!silent) throw error;
        console.warn("Manager cloud sync failed", error);
        return career;
      } finally {
        cloudSyncInFlight = false;
        cloudSyncPromise = null;
      }
    })();

    return cloudSyncPromise;
  }

  function scheduleCloudSync(career, { reason = "autosave", force = false } = {}) {
    if (!career) return Promise.resolve(false);
    career.updatedAt = now();
    career.cloudSync ||= {};
    career.cloudSync.lastChangedAt = career.updatedAt;
    career.cloudSync.reason = reason;
    career.cloudSync.lastWriterDevice = deviceId();
    career.cloudSync.revision = Math.max(0, Number(career.cloudSync.revision || 0)) + 1;
    if (career.mode === "official" && career.cloudCareerId) {
      dirtyCareerIds.add(career.id);
      setCareerSyncStatus(career, "pending", "Yerel değişiklik buluta gönderilecek.");
    }
    saveLocal();
    if (career.mode !== "official" || !career.cloudCareerId || !/^\d{6}$/.test(getSessionPin(career))) return Promise.resolve(false);
    clearTimeout(cloudSyncTimer);
    if (force) return syncOfficialCareer(career, { mode: "auto", silent: true }).then(result => result?.cloudSync?.status === "synced");
    cloudSyncTimer = window.setTimeout(() => syncOfficialCareer(career, { mode: "auto", silent: true }), CLOUD_SYNC_DEBOUNCE_MS);
    return Promise.resolve(true);
  }

  async function persistCareer(career, { silent = false } = {}) {
    career.updatedAt = now();
    migrateCareer(career);
    dirtyCareerIds.add(career.id);
    saveLocal();
    if (career.mode === "official" && career.cloudCareerId) {
      try {
        await syncOfficialCareer(career, { mode: "auto", silent });
      } catch (error) {
        if (!silent) ctx()?.toast?.(`${error.message} Değişiklik cihazda korundu.`, "warning");
        throw error;
      }
    } else {
      dirtyCareerIds.delete(career.id);
      if (!silent) ctx()?.toast?.("Kariyer bu cihazda kaydedildi.", "success");
    }
    return true;
  }

  async function unlockRemoteCareer(playerName, pin) {
    const career = await fetchRemoteCareerSnapshot(playerName, pin);
    const existingIndex = managerState.careers.findIndex(item => item.playerName.toLocaleLowerCase("tr-TR") === career.playerName.toLocaleLowerCase("tr-TR"));
    if (existingIndex >= 0) managerState.careers[existingIndex] = career;
    else managerState.careers.push(career);
    managerState.activeCareerId = career.id;
    setSessionPin(career, pin);
    dirtyCareerIds.delete(career.id);
    setCareerSyncStatus(career, "synced", "Buluttaki kariyer bu cihaza yüklendi.");
    saveLocal();
    return career;
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
        <div class="manager-form-intro"><div class="eyebrow">THE MANAGER'S ROOM · V44.3</div><h3>Championship'ten kendi hikâyeni başlat</h3><p>Gerçek oyuncu evrenine ilave kulüp olarak katılacaksın. Maç öncesi Avrupa kulüpleri, devrenin yıldız havuzundan kilitli kura ile belirlenecek.</p></div>
        <div class="manager-form-grid">
          <label>Oyuncu kimliğin<select name="playerName" required><option value="">Oyuncu seç</option>${options}</select></label>
          <label>Kulüp adı<input name="clubName" maxlength="34" placeholder="Örn. CCT Athletic" required></label>
          <label>Kısa ad<input name="shortName" maxlength="5" placeholder="CCTA" required></label>
          <label>6 haneli Manager PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required></label>
          <label>Ana renk<input name="primaryColor" type="color" value="#0b2440"></label>
          <label>İkinci renk<input name="secondaryColor" type="color" value="#d5a84e"></label>
        </div>
        <div class="manager-mode-picker">
          <label><input type="radio" name="mode" value="test" checked><span><b>Test Kariyeri</b><small>Takım kurasını tekrar deneyebilirsin.</small></span></label>
          <label><input type="radio" name="mode" value="official"><span><b>Resmî Kariyer</b><small>Kura kilitlenir ve Manager Hall'a bağlanır.</small></span></label>
        </div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Kulübü Kur ve Evreni Oluştur</button></div>
      </form>
    `, "CAREER + TEAM DRAW FOUNDATION");
  }

  function openUnlockModal() {
    const options = (bootstrap?.aiProfiles || []).map(profile => `<option value="${esc(profile.name)}">${esc(profile.name)}</option>`).join("");
    ctx()?.openModal?.("Manager Kariyerini Aç", `
      <form id="managerUnlockForm" class="manager-career-form">
        <div class="manager-form-intro"><div class="eyebrow">CLOUD CAREER ACCESS</div><h3>Başka cihazdaki kariyerine dön</h3><p>Oyuncu adını ve altı haneli Manager PIN'ini kullan. Bulut snapshot'ı bu cihaza güvenli şekilde yüklenir.</p></div>
        <div class="manager-form-grid manager-form-grid-single">
          <label>Oyuncu<select name="playerName" required><option value="">Oyuncu seç</option>${options}</select></label>
          <label>Manager PIN<input name="pin" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required></label>
        </div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Kariyeri Aç</button></div>
      </form>
    `, "SUPABASE CAREER SYNC");
  }

  function actor(career, id) {
    return career.actors.find(item => item.id === id)
      || (career.friendlyGuests || []).find(item => item.id === id)
      || { id, managerName: "—", clubName: "—", power: 0 };
  }

  function nextHumanFixture(career) {
    const active = career.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
    if (active && active.status !== "played") return active;
    return career.fixtures
      .filter(item => item.status === "scheduled" && [item.homeId, item.awayId].includes(career.humanActorId))
      .sort((a, b) => a.matchday - b.matchday || a.leg - b.leg)[0] || null;
  }

  function powerLabel(power) {
    if (power >= 1550) return "ELITE";
    if (power >= 1350) return "STRONG";
    if (power >= 1150) return "COMPETITIVE";
    return "CHALLENGER";
  }

  function starText(stars) {
    return `${Number(stars).toFixed(stars % 1 ? 1 : 0)}★`;
  }

  function poolFor(stars) {
    return (teamCatalog?.teams || []).filter(team => team.active !== false && Number(team.stars) === Number(stars));
  }

  function secureRandomIndex(length) {
    if (!Number.isInteger(length) || length <= 0) throw new Error("Takım havuzu boş.");
    if (window.crypto?.getRandomValues) {
      const max = Math.floor(0xffffffff / length) * length;
      const array = new Uint32Array(1);
      do window.crypto.getRandomValues(array); while (array[0] >= max);
      return array[0] % length;
    }
    return Math.floor(Math.random() * length);
  }

  function pickTeam(pool, excludedId = null) {
    const eligible = pool.filter(team => team.id !== excludedId);
    if (!eligible.length) throw new Error("Bu kura için yeterli takım bulunmuyor.");
    return eligible[secureRandomIndex(eligible.length)];
  }

  function teamById(id) {
    return (teamCatalog?.teams || []).find(team => team.id === id) || null;
  }

  function fixtureTeams(fixture) {
    return {
      home: teamById(fixture?.homeTeam?.id || fixture?.homeTeam),
      away: teamById(fixture?.awayTeam?.id || fixture?.awayTeam)
    };
  }

  function teamForActor(fixture, actorId) {
    if (!fixture) return null;
    const teams = fixtureTeams(fixture);
    return fixture.homeId === actorId ? teams.home : teams.away;
  }

  function teamFit(team, actorRow) {
    if (!team || !actorRow) return 0;
    const base = Number(team.overall || 0) * 0.62 + Number(actorRow.power || 1000) / 100 * 1.7;
    const style = actorRow.styleSeed || {};
    const styleFit = (
      (Number(style.tempo || 50) / 100) * Number(team.attributes?.tempo || team.attack || 75) * 0.12 +
      (Number(style.control || 50) / 100) * Number(team.attributes?.control || team.midfield || 75) * 0.12 +
      (Number(style.resilience || 50) / 100) * Number(team.attributes?.defensiveShape || team.defence || 75) * 0.12
    );
    return Math.round(Math.max(0, Math.min(99, base * 0.72 + styleFit)));
  }

  async function executeTeamDraw(career, fixture) {
    if (!career || !fixture) throw new Error("Sıradaki maç bulunamadı.");
    const alreadyDrawn = Boolean(fixture.homeTeam && fixture.awayTeam);
    if (alreadyDrawn && career.mode === "official") throw new Error("Resmî kariyerde bu maçın kurası kilitli.");
    const pool = poolFor(fixture.stars);
    if (pool.length < 2) throw new Error(`${starText(fixture.stars)} takım havuzu hazır değil.`);
    const homeTeam = pickTeam(pool);
    const awayTeam = pickTeam(pool, homeTeam.id);
    const drawId = uid("draw");
    fixture.homeTeam = homeTeam.id;
    fixture.awayTeam = awayTeam.id;
    fixture.teamDraw = {
      id: drawId,
      version: VERSION,
      catalogVersion: teamCatalog?.version || VERSION,
      stars: fixture.stars,
      drawnAt: now(),
      locked: career.mode === "official",
      method: "crypto-random-without-replacement"
    };
    career.teamDrawHistory.push({
      drawId,
      fixtureId: fixture.id,
      matchday: fixture.matchday,
      stars: fixture.stars,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      drawnAt: fixture.teamDraw.drawnAt,
      official: career.mode === "official"
    });
    career.status = "team-draw-ready";
    career.teamCatalogVersion = teamCatalog?.version || VERSION;
    await persistCareer(career);
    return { homeTeam, awayTeam };
  }

  function renderSavedCareers() {
    const rows = (managerState.careers || []).slice().sort((a,b)=>careerTimestamp(b)-careerTimestamp(a));
    if (!rows.length) return "";
    return `<section class="manager-saved-careers"><div class="manager-section-head"><div><span>KAYITLI KARİYERLER</span><h3>Kaldığın yerden devam et</h3></div><small>Resmî kariyerler bulutla, test kariyerleri yalnızca bu cihazla çalışır.</small></div><div>${rows.map(career=>{const active=career.activeMatchFixtureId&&career.fixtures?.find(f=>f.id===career.activeMatchFixtureId&&f.status!=="played");const sync=careerSyncLabel(career);return `<article><div class="manager-saved-badge" style="--saved-primary:${esc(career.primaryColor||"#0b2440")};--saved-secondary:${esc(career.secondaryColor||"#d5a84e")}">${esc(career.shortName||"FC")}</div><section><span>${career.mode==="official"?"RESMÎ · CLOUD":"TEST · LOCAL"}</span><h4>${esc(career.clubName)}</h4><p>${esc(career.playerName)} · Sezon ${career.seasonNo} · Matchday ${career.matchday}${active?` · ${Math.floor(Number(active.matchEngine?.minute||0))}' canlı maç`:""}</p><small class="sync-${sync.className}">${esc(sync.label)}</small></section><button class="btn btn-gold" data-manager-action="resume-career" data-career-id="${esc(career.id)}">${active?"Canlı Maça Dön":"Devam Et"}</button></article>`}).join("")}</div></section>`;
  }

  function renderLanding(view) {
    const ready = bootstrap?.readiness || {};
    const catalogCounts = teamCatalog?.counts || {};
    view.innerHTML = `
      <section class="manager-hero">
        <div class="manager-hero-copy">
          <div class="eyebrow">V44.5 · UNIFIED CAREER</div>
          <h2>The Manager's Room</h2>
          <p>Kendi kulübünü kur, Championship'ten başla ve gerçek Oruç Reis turnuva tarihinden üretilen AI menajerlere karşı kalıcı bir kariyer oluştur. Her maçın Avrupa kulüpleri kura ile belirlenir; ardından canlı momentum, saha hâkimiyeti ve bağlamsal taktik kararlarıyla yaklaşık beş dakikalık maç oynanır.</p>
          <div class="manager-hero-actions"><button class="btn btn-gold" data-manager-action="open-career">Yeni Kariyer</button><button class="btn btn-ghost" data-manager-action="open-unlock">Kariyerimi Aç</button></div>
          <div class="manager-foundation-tags"><span>65 Avrupa Kulübü</span><span>Canlı Maç Motoru</span><span>Dinamik Karar Anları</span><span>Supabase Kariyer Senkronu</span></div>
        </div>
        <div class="manager-hero-visual"><div class="manager-orbit manager-orbit-one"></div><div class="manager-orbit manager-orbit-two"></div><div class="manager-emblem"><span>MR</span><strong>ORUÇ REİS</strong><small>FOOTBALL UNIVERSE</small></div></div>
      </section>
      <section class="manager-readiness-grid">
        <article><span>AI MENAJER EVRENİ</span><strong>${ready.combinedAiPlayers ?? "—"}</strong><small>Tarihî + FIFA09 aktif oyuncular</small></article>
        <article><span>FC 25 KULÜP HAVUZU</span><strong>${catalogCounts.total ?? "—"}</strong><small>${catalogCounts["4"] || 0} × 4★ · ${catalogCounts["4.5"] || 0} × 4.5★ · ${catalogCounts["5"] || 0} × 5★</small></article>
        <article><span>CHAMPIONSHIP</span><strong>${ready.championshipWithHumanClub ?? "—"}</strong><small>AI kulüpleri + senin kulübün</small></article>
        <article><span>ALTYAPI DURUMU</span><strong>V44.5</strong><small>Unified exit · fatigue · sync · Final Chapter</small></article>
      </section>
      ${renderSavedCareers()}
      ${renderRulesStrip()}
      ${renderBuildRoadmap()}
    `;
  }

  function renderRulesStrip() {
    return `<section class="manager-rules-strip">
      <div><b>1. DEVRE</b><span>4★ Avrupa kulüpleri</span></div>
      <div><b>2. DEVRE</b><span>4.5★ Avrupa kulüpleri</span></div>
      <div><b>3. DEVRE</b><span>5★ Avrupa kulüpleri</span></div>
      <div><b>RESMÎ KURA</b><span>Tek çekim · maç bazında kilitli</span></div>
    </section>`;
  }

  function renderBuildRoadmap() {
    const items = [
      ["01", "Foundation", "Kariyer, lig evreni, AI seed ve veri katmanı", true],
      ["02", "Team Draw", "FC 25 kulüp kataloğu, kura sahnesi ve bulut senkronu", true],
      ["03", "Match Engine Alpha", "Canlı dakika, momentum, skor ve saha state motoru", true],
      ["04", "Decision Intelligence", "İlk bağlamsal taktik aileleri ve AI adaptasyonu", true],
      ["05", "Competition Universe", "Yükselme, kupalar ve sezon geçişi", false]
    ];
    return `<section class="manager-roadmap"><div class="manager-section-head"><div><span>DEVELOPMENT ROADMAP</span><h3>İlk oynanabilir maç motoru oyuna bağlandı</h3></div><small>Takım kurası, Manager ELO, gizli AI stili, canlı momentum ve taktik kararları artık aynı maç state’inde çalışır.</small></div><div class="manager-roadmap-grid">${items.map(item => `<article class="${item[3] ? "active" : ""}"><b>${item[0]}</b><strong>${item[1]}</strong><p>${item[2]}</p><span>${item[3] ? "BUILD COMPLETE" : "NEXT BUILD"}</span></article>`).join("")}</div></section>`;
  }

  function careerSyncLabel(career) {
    if (career?.mode !== "official") return { label:"YEREL", className:"local", title:"Test kariyeri yalnızca bu cihazda saklanır." };
    const status = career.cloudSync?.status || (/^\d{6}$/.test(getSessionPin(career)) ? "ready" : "pin-required");
    const labels = {
      synced:"SENKRONİZE", syncing:"SENKRONİZE EDİLİYOR", pending:"BULUTA GÖNDERİLECEK", error:"SENKRON HATASI",
      conflict:"KAYIT ÇAKIŞMASI", "pin-required":"PIN GEREKLİ", ready:"BULUT HAZIR"
    };
    return { label:labels[status] || "BULUT HAZIR", className:status, title:career.cloudSync?.detail || "Telefon ve bilgisayar arasında ortak kariyer kaydı." };
  }

  function renderCareer(view, career) {
    const next = nextHumanFixture(career);
    const opponentId = next ? (next.homeId === career.humanActorId ? next.awayId : next.homeId) : null;
    const rival = opponentId ? actor(career, opponentId) : null;
    const reportFixture = career.activeMatchFixtureId ? career.fixtures.find(item => item.id === career.activeMatchFixtureId) : null;
    const matchFixture = reportFixture || next;
    const matchOpponentId = matchFixture ? (matchFixture.homeId === career.humanActorId ? matchFixture.awayId : matchFixture.homeId) : null;
    const matchRival = matchOpponentId ? actor(career, matchOpponentId) : rival;
    const human = actor(career, career.humanActorId);
    const premierCount = career.actors.filter(item => item.division === "premier").length;
    const championshipCount = career.actors.filter(item => item.division === "championship").length;
    const leagueACount = career.actors.filter(item => item.division === "league-a").length;
    const legInfo = LEGS.find(item => item.id === Number(next?.leg || 1)) || LEGS[0];
    const tabs = [["overview", "Bugün"], ["calendar", "Football Calendar"], ["universe", "Lig Evreni"], ["oruc", "Oruç Reis Kupası"], ["intelligence", "Career Intelligence"], ["rivalry", "Rivalry History"], ["stories", "Season Stories"], ["statistics", "İstatistik Merkezi"], ["identity", "Manager Identity"], ["draw", "Team Draw Theatre"], ["match", "Canlı Maç"], ["scouting", "AI Rakipler"], ["engine", "V44.5 Lab"]];
    const slots=managerState.saveSlots?.[career.id]||{};
    view.innerHTML = `
      <section class="manager-club-hero" style="--club-primary:${esc(career.primaryColor)};--club-secondary:${esc(career.secondaryColor)}">
        <div class="manager-club-badge"><span>${esc(career.shortName)}</span></div>
        <div class="manager-club-copy"><div class="eyebrow">SEASON ${career.seasonNo} · ${career.division.toUpperCase()}</div><h2>${esc(career.clubName)}</h2><p>${esc(career.playerName)} yönetiminde bağımsız kariyer. FC 25 kulüp kurası, rakip ELO gücü ve gizli oyun tarzı aynı maç state'inde birleşecek.</p><div class="manager-club-meta"><span>Manager ELO <b>${career.managerElo}</b></span><span>Manager Rating <b>${career.managerRating||50}</b></span><span>Taktik IQ <b>${career.tacticalIQ}</b></span><span>Kariyer Puanı <b>${career.careerPoints}</b></span><span>${career.mode === "official" ? "RESMÎ · CLOUD" : "TEST · LOCAL"}</span></div></div>
        <div class="manager-season-ring"><strong>${career.matchday}</strong><span>MATCHDAY</span><small>${esc(legInfo.label)} · ${starText(legInfo.stars)}</small></div>
      </section>
      <nav class="manager-tabs">${tabs.map(([id, label]) => `<button class="${activeTab === id ? "active" : ""}" data-manager-action="set-tab" data-tab="${id}">${label}</button>`).join("")}</nav>
      <div class="manager-career-toolbar"><span>${career.mode === "official" ? "RESMÎ KARİYER" : "TEST KARİYERİ"} · SEZON ${career.seasonNo}</span><div>${career.mode === "official" ? `<button class="manager-sync-button ${careerSyncLabel(career).className}" data-manager-action="sync-career" title="${esc(careerSyncLabel(career).title)}">↻ ${careerSyncLabel(career).label}</button>${career.cloudSync?.status === "conflict" ? `<button class="manager-conflict-pull" data-manager-action="pull-career">Buluttan Al</button><button class="manager-conflict-push" data-manager-action="push-career">Bu Cihazı Gönder</button>` : ""}` : ""}${[1,2,3].map(slot=>`<button class="slot" data-manager-action="save-slot" data-slot="${slot}">S${slot} KAYDET</button>${slots[slot]?`<button class="slot load" data-manager-action="load-slot" data-slot="${slot}">YÜKLE</button>`:""}`).join("")}<button data-manager-action="exit-career">Kariyerden Çık</button></div></div>
      ${activeTab === "overview" ? renderOverview(career, human, rival, next) : activeTab === "calendar" || activeTab === "fixtures" ? renderCalendar(career) : activeTab === "oruc" ? renderOrucCup(career) : activeTab === "intelligence" ? renderCareerIntelligence(career, rival) : activeTab === "rivalry" ? renderRivalryHistory(career) : activeTab === "stories" ? renderSeasonStories(career) : activeTab === "statistics" ? renderStatistics(career) : activeTab === "identity" ? renderIdentity(career) : activeTab === "archive" ? renderArchive(career) : activeTab === "draw" ? renderTeamDraw(career, human, rival, next) : activeTab === "match" ? (window.FIFA_MANAGER_MATCH?.render?.(career, human, matchRival, matchFixture) || `<section class="manager-loading"><h2>Maç motoru yükleniyor</h2></section>`) : activeTab === "universe" ? renderUniverse(career, premierCount, championshipCount, leagueACount) : activeTab === "scouting" ? renderScouting(career) : renderEngineLab(career)}
    `;
  }

  function renderOverview(career, human, rival, next) {
    const userTeam = teamForActor(next, career.humanActorId);
    const rivalTeam = rival ? teamForActor(next, rival.id) : null;
    const drawReady = Boolean(userTeam && rivalTeam);
    const gate=seasonGateState(career);
    const meetings=rival?(career.matchHistory||[]).filter(history=>history.opponentId===rival.id):[];
    const form=(career.matchHistory||[]).slice(0,5).map(history=>history.result).join(" · ")||"—";
    const importance=next?.competition==="oruc"?"KUPA MAÇI":meetings.length>=3?"REKABET MAÇI":Number(next?.matchday)>=35?"SEZON KRİTİĞİ":"LİG MAÇI";

    const broadcast=next
      ? `<section class="manager-matchday-broadcast"><div><span>MATCHDAY BROADCAST · ${importance}</span><h2>${esc(career.clubName)} <i>VS</i> ${esc(rival?.clubName||"—")}</h2><p>${meetings.length?`${meetings.length}. randevu · Son seri ${form}`:"İlk karşılaşma. Rakibin sana özel geçmiş verisi bulunmuyor."}</p></div><div class="manager-broadcast-duel"><article><small>SEN</small><strong>${career.managerElo}</strong><span>ELO · R${career.managerRating||50} · IQ${career.tacticalIQ}</span></article><b>⚔</b><article><small>RAKİP</small><strong>${rival?.power||0}</strong><span>ELO · IQ${rival?.tacticalIQ||50} · ${esc(rival?.psychology?.mood||"DENGELİ")}</span></article></div></section>`
      : gate.seasonComplete
        ? `<section class="manager-matchday-broadcast manager-season-complete-broadcast"><div><span>SEASON COMPLETE · SEZON ${career.seasonNo}</span><h2>SEZON TAMAMLANDI</h2><p>Ligler ve Oruç Reis Kupası sonuçlandı. Sezon ödüllerini kaydedip yeni sezona geçebilirsin.</p></div><div class="manager-season-complete-mark"><strong>✓</strong><span>READY</span></div></section>`
        : `<section class="manager-matchday-broadcast manager-cup-continuation-broadcast"><div><span>SEASON GATE · ORUÇ REİS KUPASI</span><h2>LİG BİTTİ · KUPA DEVAM EDİYOR</h2><p>Kalan AI karşılaşmaları tamamlandığında sıradaki kupa maçın veya sezon kapanışı otomatik açılacak.</p></div><div class="manager-season-complete-mark cup"><strong>${gate.cupPending.length}</strong><span>BEKLEYEN MAÇ</span></div></section>`;

    const noNextContent=gate.seasonComplete
      ? `<div class="manager-season-gate complete">
          <div><span>SEZON KAPANIŞI HAZIR</span><h4>Sezon ${career.seasonNo} tamamlandı</h4><p>Lig, kupa ve evren maçlarının tamamı sonuçlandı. Arşiv ve ödüller kaydedildikten sonra yeni fikstür oluşturulacak.</p></div>
          <button class="btn btn-gold" data-manager-action="new-season">Sezonu Kapat ve Yeni Sezona Geç</button>
        </div>`
      : `<div class="manager-season-gate cup-pending">
          <div><span>ORUÇ REİS KUPASI DEVAM EDİYOR</span><h4>Sezon henüz kapanmadı</h4><p>${gate.pendingAi.length} AI karşılaşması ve ${gate.cupPending.length} kupa fikstürü bekliyor. Sistem bunları otomatik sonuçlandırarak ${gate.humanCupFixture?"kupa maçını açacak":"kupayı şampiyona kadar ilerletecek"}.</p></div>
          <button class="btn btn-gold" data-manager-action="resolve-season-gate">Kupayı Devam Ettir</button>
          <button class="btn btn-ghost" data-manager-action="set-tab" data-tab="oruc">Kupa Ağacını Aç</button>
        </div>`;

    return `${broadcast}<section class="manager-dashboard-grid">
      <article class="manager-next-match">
        <div class="manager-panel-head"><div><span>NEXT MATCHDAY</span><h3>${next ? `${next.competition==="oruc"?"Oruç Reis Kupası":"Matchday"} ${next.matchday}` : gate.seasonComplete ? "Sezon tamamlandı" : "Kupa ilerlemesi bekleniyor"}</h3></div><em>${next ? starText(next.stars) : gate.seasonComplete ? "✓" : "KUPA"}</em></div>
        ${next ? `<div class="manager-versus"><div><b>${esc(human.shortName)}</b><strong>${esc(human.clubName)}</strong><small>${esc(career.playerName)}</small></div><span>VS</span><div><b>${esc(rival?.shortName || "AI")}</b><strong>${esc(rival?.clubName || "—")}</strong><small>${esc(rival?.managerName || "—")} · ${rival?.power || 0}</small></div></div>
        <div class="manager-match-lock"><span>TEAM DRAW STATUS</span><strong>${drawReady ? `${esc(userTeam.clubName)} vs ${esc(rivalTeam.clubName)}` : "Takım kurası bekleniyor"}</strong><small>${drawReady ? `Kura ${next.teamDraw?.locked ? "resmî olarak kilitli" : "test modunda açık"}.` : `${starText(next.stars)} havuzundan iki farklı Avrupa kulübü çekilecek.`}</small></div>
        <button class="btn btn-gold btn-wide" data-manager-action="set-tab" data-tab="${drawReady ? "match" : "draw"}">${drawReady ? (next.matchEngine?.status === "finished" ? "Maç Raporunu Aç" : next.matchEngine ? "Canlı Maça Dön" : "Taktik Odasına Geç") : "Takım Kurasına Geç"}</button>` : noNextContent}
      </article>
      <article class="manager-progress-panel"><div class="manager-panel-head"><div><span>MANAGER DEVELOPMENT</span><h3>Performance Lab</h3></div><em>V44.8.6</em></div>${[["Manager ELO", career.managerElo, 2200], ["Manager Rating", career.managerRating||50, 100], ["Taktik IQ", career.tacticalIQ, 100], ["Oyun Okuma", career.managerAttributes?.gameReading||50, 100], ["Adaptasyon", career.managerAttributes?.adaptation||50, 100], ["Risk Yönetimi", career.managerAttributes?.riskManagement||50, 100]].map(row => `<div class="manager-meter"><span>${row[0]}</span><i><b style="width:${Math.max(3, Math.min(100, row[1] / row[2] * 100))}%"></b></i><strong>${row[1]}</strong></div>`).join("")}<div class="manager-dev-kpis"><div><span>FORM</span><b>${(career.matchHistory || []).slice(0,5).map(item => item.result).join(" · ") || "—"}</b></div><div><span>OYUNCU TARZI</span><b>${esc(career.playerStyle?.label||"ANALİZ BEKLİYOR")}</b></div><div><span>KARAR / MAÇ</span><b>${career.matchEngineStats?.matches ? (career.matchEngineStats.decisions / career.matchEngineStats.matches).toFixed(1) : "0.0"}</b></div><div><span>GOL FARKI</span><b>${(career.matchEngineStats?.goalsFor || 0) - (career.matchEngineStats?.goalsAgainst || 0)}</b></div></div><div class="manager-baseline-note">Gelişim; sonuçtan tek başına değil, rakip gücü, oyun okuma, rol uyumu, risk yönetimi ve maç içi karar kalitesinden hesaplanır.</div></article>
      <article class="manager-trophy-panel"><div class="manager-panel-head"><div><span>CLUB MUSEUM</span><h3>Kupa Kabini</h3></div></div><div class="manager-mini-trophies">${[["Premier", career.trophies.premier], ["Championship", career.trophies.championship], ["Oruç Reis", career.trophies.oruc], ["Süper Kupa", career.trophies.super]].map(row => `<div><span>♜</span><strong>${row[1]}</strong><small>${row[0]}</small></div>`).join("")}</div></article>
      <article class="manager-status-panel"><div class="manager-panel-head"><div><span>SEASON STATUS</span><h3>Competition Closure</h3></div><em>V44.8.6</em></div><ul><li class="${gate.leagueComplete?"done":""}">Lig fikstürü ${gate.leagueComplete?"tamamlandı":"devam ediyor"}</li><li class="${gate.cupFinished?"done":""}">Oruç Reis Kupası ${gate.cupFinished?"tamamlandı":"devam ediyor"}</li><li class="${gate.pendingAi.length===0?"done":""}">AI evreninde ${gate.pendingAi.length} bekleyen maç</li><li class="${gate.seasonComplete?"done":""}">Yeni sezon geçişi ${gate.seasonComplete?"hazır":"kilitli"}</li></ul></article>
    </section>`;
  }

  function teamCard(team, side, actorRow, hidden = false) {
    if (!team || hidden) {
      return `<article class="manager-team-card sealed ${side}"><div class="manager-seal-orbit"></div><div class="manager-team-crest"><span>?</span></div><div class="manager-team-copy"><span>${side === "human" ? "SENİN TAKIMIN" : "RAKİP TAKIM"}</span><h3>KART KAPALI</h3><p>Kura başladığında ${starText(activeCareer()?.fixtures?.find(item => item.id === nextHumanFixture(activeCareer())?.id)?.stars || 4)} havuzundan açılacak.</p></div></article>`;
    }
    const fit = teamFit(team, actorRow);
    const metrics = [["ATK", team.attack], ["MID", team.midfield], ["DEF", team.defence]];
    return `<article class="manager-team-card revealed ${side}">
      <div class="manager-team-glow"></div>
      <header><span>${side === "human" ? "SENİN TAKIMIN" : "RAKİP TAKIM"}</span><b>${starText(team.stars)}</b></header>
      <div class="manager-team-identity"><div class="manager-team-crest"><span>${esc(initials(team.clubName, 3))}</span></div><div><small>${esc(team.country)} · ${esc(team.league)}</small><h3>${esc(team.clubName)}</h3><p>Güçlü birim: ${esc(team.strongestUnit || "Balanced")}</p></div><strong>${team.overall}</strong></div>
      <div class="manager-team-bars">${metrics.map(row => `<div><span>${row[0]}</span><i><b style="width:${row[1]}%"></b></i><strong>${row[1]}</strong></div>`).join("")}</div>
      <footer><span>UYUM SKORU</span><strong>${fit}</strong><small>Takım gücü + Manager ELO + gizli stil uyumu</small></footer>
    </article>`;
  }

  function renderTeamDraw(career, human, rival, next) {
    if (!next || !rival) return `<section class="manager-draw-empty"><h3>Kura için sıradaki maç bulunamadı.</h3></section>`;
    const userTeam = teamForActor(next, career.humanActorId);
    const rivalTeam = teamForActor(next, rival.id);
    const hasDraw = Boolean(userTeam && rivalTeam);
    const officialLocked = hasDraw && career.mode === "official";
    const pool = poolFor(next.stars);
    return `<section class="manager-draw-theatre ${drawAnimating ? "is-drawing" : ""}">
      <div class="manager-draw-head"><div><span>TEAM DRAW THEATRE · MATCHDAY ${next.matchday}</span><h2>${starText(next.stars)} Avrupa Kulüp Kurası</h2><p>${esc(human.clubName)} ve ${esc(rival.clubName)} için aynı güç bandından iki farklı takım çekilir. Rakibin ELO gücü görünür; oyun tarzı maç başlayana kadar gizlidir.</p></div><div class="manager-draw-security"><b>${career.mode === "official" ? "OFFICIAL LOCK" : "TEST MODE"}</b><span>${pool.length} takım uygun</span><small>Crypto random · without replacement</small></div></div>
      <div class="manager-draw-stage">
        ${teamCard(userTeam, "human", human, drawAnimating || !hasDraw)}
        <div class="manager-draw-core"><div class="manager-draw-spinner"><span>MR</span></div><small>${drawAnimating ? "KULÜPLER KARIŞTIRILIYOR" : hasDraw ? "KURA TAMAMLANDI" : "KURA HAZIR"}</small><strong>${esc(human.shortName)} <i>VS</i> ${esc(rival.shortName)}</strong></div>
        ${teamCard(rivalTeam, "rival", rival, drawAnimating || !hasDraw)}
      </div>
      <div class="manager-draw-actions">
        <div><span>RAKİP MANAGER POWER</span><strong>${rival.power}</strong><small>${powerLabel(rival.power)} · Stil profili gizli</small></div>
        <button class="btn btn-gold manager-draw-button" data-manager-action="draw-teams" ${drawAnimating || officialLocked ? "disabled" : ""}>${drawAnimating ? "Kura çekiliyor..." : hasDraw ? "Test Kurasını Yenile" : "Takım Kurasını Başlat"}</button>
        <div><span>KURA DURUMU</span><strong>${officialLocked ? "KİLİTLİ" : hasDraw ? "AÇIK" : "BEKLİYOR"}</strong><small>${officialLocked ? "Bu maç için yeniden çekilemez" : career.mode === "test" ? "Test modunda tekrar çekilebilir" : "İlk çekim kalıcıdır"}</small></div>
      </div>
      ${hasDraw ? `<div class="manager-draw-receipt"><span>DRAW ID</span><b>${esc(next.teamDraw?.id || "—")}</b><span>CATALOG</span><b>${esc(next.teamDraw?.catalogVersion || teamCatalog?.version || "—")}</b><span>TIME</span><b>${esc(new Date(next.teamDraw?.drawnAt || now()).toLocaleString("tr-TR"))}</b></div><button class="btn btn-gold btn-wide manager-to-match" data-manager-action="open-match">${next.matchEngine ? "Canlı Maça Dön" : "Taktik Odasına Geç"}</button>` : ""}
      ${renderTeamPoolExplorer(next.stars)}
    </section>`;
  }

  function renderTeamPoolExplorer(activeStars) {
    const filters = [["all", "Tüm Havuz"], ["4", "4★"], ["4.5", "4.5★"], ["5", "5★"]];
    const visible = (teamCatalog?.teams || []).filter(team => poolFilter === "all" || String(team.stars) === poolFilter);
    return `<section class="manager-pool-explorer"><div class="manager-section-head"><div><span>FC 25 CLUB CATALOG</span><h3>Avrupa Kulüp Havuzları</h3></div><small>Aktif maç havuzu: <b>${starText(activeStars)}</b>. OVR/ATK/MID/DEF değerleri takım kartlarına ve sonraki maç motoruna taşınır.</small></div><div class="manager-pool-filters">${filters.map(([id, label]) => `<button class="${poolFilter === id ? "active" : ""}" data-manager-action="pool-filter" data-pool="${id}">${label}</button>`).join("")}</div><div class="manager-pool-grid">${visible.map(team => `<article class="${Number(team.stars) === Number(activeStars) ? "match-pool" : ""}"><div class="manager-pool-crest">${esc(initials(team.clubName, 3))}</div><div><span>${esc(team.country)}</span><strong>${esc(team.clubName)}</strong><small>${esc(team.league)}</small></div><b>${team.overall}</b><footer><span>${starText(team.stars)}</span><span>A ${team.attack}</span><span>M ${team.midfield}</span><span>D ${team.defence}</span></footer></article>`).join("")}</div></section>`;
  }

  function sortedLeagueRows(career, division) {
    const table = Array.isArray(career.tables?.[division]) ? career.tables[division] : [];
    return [...table].sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || actor(career, b.actorId).power - actor(career, a.actorId).power);
  }

  function renderFixtures(career, forcedMatchday=null,scope="all") {
    const allRows=[...career.fixtures].sort((a,b)=>Number(a.matchday)-Number(b.matchday)||String(a.division).localeCompare(String(b.division))); const matchdays=[...new Set(allRows.map(x=>Number(x.matchday)))].sort((a,b)=>a-b); const filterDay=forcedMatchday??selectedFixtureMatchday; let rows=filterDay==="all"?allRows:allRows.filter(x=>Number(x.matchday)===Number(filterDay));if(scope==="mine")rows=rows.filter(x=>[x.homeId,x.awayId].includes(career.humanActorId));if(scope==="league")rows=rows.filter(x=>x.competition!=="oruc");if(scope==="cup")rows=rows.filter(x=>x.competition==="oruc"); const played=allRows.filter(x=>x.status==="played").length;
    const filters=forcedMatchday===null?`<div class="manager-matchday-filter"><button data-manager-action="fixture-matchday" data-matchday="all" class="${selectedFixtureMatchday==="all"?"active":""}">TÜMÜ</button>${matchdays.map(md=>`<button data-manager-action="fixture-matchday" data-matchday="${md}" class="${Number(selectedFixtureMatchday)===md?"active":""}">MD ${md}</button>`).join("")}</div>`:"";
    const list=rows.map(item=>{const home=actor(career,item.homeId),away=actor(career,item.awayId),done=item.status==="played",elo=item.eloChange,archive=done&&item.matchEngine&&[item.homeId,item.awayId].includes(career.humanActorId),leagueName=item.division==="premier"?"PREMIER LEAGUE":item.division==="championship"?"CHAMPIONSHIP":"LİG A";return `<article class="${done?"played":"scheduled"} ${[item.homeId,item.awayId].includes(career.humanActorId)?"human":""}"><time>MD ${item.matchday}</time><div><small>${item.competition==="oruc"?`ORUÇ REİS KUPASI · BEST OF 3 · ${starText(item.stars)}`:`${leagueName} · ${starText(item.stars)}`}</small><strong>${esc(home.clubName)} <b>${done?item.homeScore:"–"} : ${done?item.awayScore:"–"}</b> ${esc(away.clubName)}</strong><span>${esc(home.managerName)} · ${esc(away.managerName)}</span></div><aside><b>${done?"FT":"SCHEDULED"}</b>${elo?`<small>${elo.homeDelta>=0?"+":""}${elo.homeDelta} / ${elo.awayDelta>=0?"+":""}${elo.awayDelta} ELO</small>`:""}${archive?`<button data-manager-action="open-archive" data-fixture-id="${esc(item.id)}">MAÇ ANALİZİ</button>`:""}</aside></article>`}).join("");
    return `<section class="manager-fixture-centre"><div class="manager-section-head"><div><span>SEASON COMMAND CENTRE</span><h3>Matchday Fikstür ve Sonuçları</h3></div><small>${played}/${allRows.length} maç tamamlandı</small></div>${filters}<div class="manager-fixture-list">${list||`<div class="empty-state">Bu Matchday için maç bulunmuyor.</div>`}</div></section>`;
  }

  function renderCalendar(career) {
    const fixtures=[...career.fixtures];
    const matchdays=[...new Set(fixtures.map(f=>Number(f.matchday)))].sort((a,b)=>a-b);
    const current=selectedFixtureMatchday==="all"?Number(career.matchday||matchdays[0]||1):Number(selectedFixtureMatchday);
    const dayRows=fixtures.filter(f=>Number(f.matchday)===current);
    const league=dayRows.filter(f=>f.competition!=="oruc");
    const cup=dayRows.filter(f=>f.competition==="oruc");
    const human=dayRows.find(f=>[f.homeId,f.awayId].includes(career.humanActorId));
    const status=human?.status==="played"?"TAMAMLANDI":human?.status==="in-progress"?"CANLI":human?"MAÇ GÜNÜ":"PROGRAM YOK";
    const rail=`<div class="manager-calendar-rail">${matchdays.map(md=>{const rows=fixtures.filter(f=>Number(f.matchday)===md),played=rows.length&&rows.every(f=>f.status==="played"),hasHuman=rows.some(f=>[f.homeId,f.awayId].includes(career.humanActorId)),hasCup=rows.some(f=>f.competition==="oruc");return `<button class="${md===current?"active":""} ${played?"complete":""}" data-manager-action="fixture-matchday" data-matchday="${md}"><small>${hasCup?"KUPA + LİG":"LİG"}</small><strong>MD ${md}</strong><span>${hasHuman?"SENİN MAÇIN":"EVREN"}</span></button>`}).join("")}</div>`;
    const scopes=`<nav class="manager-calendar-filters">${[["all","Tüm Maçlar"],["mine","Benim Maçlarım"],["league","Lig"],["cup","Kupa"]].map(([id,label])=>`<button class="${calendarFilter===id?"active":""}" data-manager-action="calendar-filter" data-filter="${id}">${label}</button>`).join("")}</nav>`;
    return `<section class="manager-football-calendar"><header><div><span>UNIFIED SEASON TIMELINE</span><h2>Football Calendar</h2><p>Lig ve Oruç Reis Kupası aynı sezon akışında. Bir Matchday seç; yalnızca o günün programını ve sonuçlarını gör.</p></div><div class="manager-calendar-status"><small>AKTİF GÜN</small><strong>MD ${current}</strong><span>${status}</span></div></header>${rail}${scopes}<div class="manager-calendar-summary"><article><span>LİG MAÇI</span><strong>${league.length}</strong></article><article><span>KUPA MAÇI</span><strong>${cup.length}</strong></article><article><span>TAMAMLANAN</span><strong>${dayRows.filter(f=>f.status==="played").length}/${dayRows.length}</strong></article><article><span>SEZON İLERLEMESİ</span><strong>${Math.round(fixtures.filter(f=>f.status==="played").length/Math.max(1,fixtures.length)*100)}%</strong></article></div>${renderFixtures(career,current,calendarFilter)}</section>`;
  }

  function renderCareerIntelligence(career, nextRival) {
    const history=career.matchHistory||[];
    const plans={};
    history.forEach(h=>{const p=h.planSummary||"Dengeli";plans[p]=(plans[p]||0)+1});
    const favorite=Object.entries(plans).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Henüz yeterli veri yok";
    const rivals=career.actors.filter(a=>a.type==="ai").map(a=>({actor:a,m:a.managerMemory||{}})).sort((a,b)=>Number(b.m.meetings||0)-Number(a.m.meetings||0));
    const memory=nextRival?.managerMemory||{};
    const counters=Object.entries(memory.plans||{}).sort((a,b)=>b[1]-a[1]).slice(0,3);
    return `<section class="manager-intelligence-centre"><header><div><span>CAREER INTELLIGENCE NETWORK</span><h2>Rakipler Seni Hatırlıyor</h2><p>Her AI menajer karşılaşmaları, kullandığın maç planını ve sonuçları kendi hafızasında tutar. Bir sonraki maçta karşı plan üretir.</p></div><div class="manager-intel-score"><strong>${Math.min(99,45+history.length*3)}</strong><span>DATA DEPTH</span></div></header><div class="manager-intel-kpis"><article><span>ANALİZ EDİLEN MAÇ</span><strong>${history.length}</strong></article><article><span>BASKIN PLANIN</span><strong>${esc(favorite)}</strong></article><article><span>ADAPTASYON</span><strong>${career.matchEngineStats?.decisions||0}</strong></article><article><span>RAKİP HAFIZASI</span><strong>${rivals.filter(x=>x.m.meetings).length}</strong></article></div>${nextRival?`<section class="manager-next-intel"><div><span>NEXT OPPONENT FILE</span><h3>${esc(nextRival.managerName)} · ${esc(nextRival.clubName)}</h3><p>Sana karşı ${memory.meetings||0} maç: ${memory.wins||0}G ${memory.draws||0}B ${memory.losses||0}M. Güven seviyesi ${memory.confidence||50}/100.</p></div><aside>${counters.length?counters.map(([k,v])=>`<b>${esc(k)} <small>${v} kez görüldü</small></b>`).join(""):`<b>İLK TEMAS <small>Rakibin özel karşı plan verisi yok</small></b>`}</aside></section>`:""}<div class="manager-memory-grid">${rivals.slice(0,12).map(({actor:a,m})=>`<article><div><span>${esc(a.clubName)}</span><h4>${esc(a.managerName)}</h4></div><strong>${m.meetings||0}<small>MEETING</small></strong><footer><span>${m.wins||0}G</span><span>${m.draws||0}B</span><span>${m.losses||0}M</span><span>IQ ${a.tacticalIQ}</span></footer></article>`).join("")}</div></section>`;
  }

  function renderRivalryHistory(career){
    const history=career.matchHistory||[];const groups=career.actors.filter(a=>a.type==="ai").map(a=>{const matches=history.filter(h=>h.opponentId===a.id);const wins=matches.filter(h=>h.result==="W").length,draws=matches.filter(h=>h.result==="D").length,losses=matches.filter(h=>h.result==="L").length,totalFor=matches.reduce((s,h)=>s+Number(h.humanGoals||0),0),totalAgainst=matches.reduce((s,h)=>s+Number(h.aiGoals||0),0);return {a,matches,wins,draws,losses,totalFor,totalAgainst,level:matches.length>=5?"EZELİ RAKİP":matches.length>=3?"BÜYÜK REKABET":matches.length?"REKABET":"YENİ RAKİP"}}).filter(x=>x.matches.length).sort((a,b)=>b.matches.length-a.matches.length);
    return `<section class="manager-rivalry-centre"><header><div><span>HEAD-TO-HEAD ARCHIVE</span><h2>Rivalry History</h2><p>Her rakiple oynanan PlayStation maçları, taktik geçmişi ve rekabet hikâyesi tek dosyada.</p></div><strong>${groups.length}<small>AKTİF REKABET</small></strong></header><div class="manager-rivalry-grid">${groups.length?groups.map(x=>{const biggest=[...x.matches].sort((a,b)=>(b.humanGoals-b.aiGoals)-(a.humanGoals-a.aiGoals))[0];return `<article><header><div><span>${x.level}</span><h3>${esc(x.a.managerName)}</h3><small>${esc(x.a.clubName)}</small></div><b>${x.wins}-${x.draws}-${x.losses}</b></header><div class="manager-rivalry-score"><span>TOPLAM SKOR</span><strong>${x.totalFor} — ${x.totalAgainst}</strong></div><div class="manager-rivalry-form">${x.matches.slice(0,5).map(m=>`<i class="${m.result}">${m.result}<small>${m.humanGoals}-${m.aiGoals}</small></i>`).join("")}</div><footer><span>En iyi sonuç ${biggest?`${biggest.humanGoals}-${biggest.aiGoals}`:"—"}</span><span>${esc(x.a.managerMemory?.lastPlan||"Plan verisi yok")}</span></footer></article>`}).join(""):`<div class="empty-state">İlk tekrar karşılaşmalarıyla rekabet dosyaları oluşacak.</div>`}</div></section>`;
  }

  function seasonNarratives(career){
    const division=career.division||"championship",rows=sortedLeagueRows(career,division),humanIndex=rows.findIndex(r=>r.actorId===career.humanActorId),history=career.matchHistory||[],last5=history.slice(0,5),unbeaten=last5.length>=3&&last5.every(h=>h.result!=="L"),losing=last5.length>=3&&last5.slice(0,3).every(h=>h.result==="L"),top=rows[0],cup=career.orucCup;const stories=[];
    if(humanIndex===0)stories.push(["MANŞET","Zirvenin Yeni Sahibi",`${career.clubName}, ${rows[0]?.pts||0} puanla ligin kontrolünü ele geçirdi.`]);
    if(humanIndex>=0&&humanIndex<5)stories.push(["ŞAMPİYONLUK YARIŞI","Hedef Görünüyor",`${career.clubName} kritik yarışın ${humanIndex+1}. sırasında.`]);
    if(unbeaten)stories.push(["FORM","Yenilmezlik Dalgası",`Son ${last5.length} maçta mağlubiyet yok; rakiplerin baskısı artıyor.`]);
    if(losing)stories.push(["BASKI","Kırılma Haftası",`Üç maçlık mağlubiyet serisi menajer psikolojisini ve yönetim güvenini zorluyor.`]);
    if(cup?.status==="active")stories.push(["ORUÇ REİS",`Round ${cup.round} Devam Ediyor`,"Best of 3 serileri lig takvimiyle eşzamanlı ilerliyor."]);
    if(top&&top.actorId!==career.humanActorId)stories.push(["RAKİP RADARI","Lider Takipte",`${actor(career,top.actorId).clubName} ${top.pts} puanla sezonun referans takımı.`]);
    return stories.length?stories:[["SEZON BAŞLANGICI","Hikâye Yazılmayı Bekliyor","İlk sonuçlarla form, rekabet ve şampiyonluk anlatıları oluşacak."]];
  }

  function renderSeasonStories(career){const stories=seasonNarratives(career);const played=career.fixtures.filter(f=>f.status==="played").length,awards=career.seasonAwards||[];return `<section class="manager-story-centre"><header><div><span>LIVING SEASON NARRATIVE</span><h2>Season Story Engine</h2><p>Tablo, form, kupa ve rekabetlerden otomatik üretilen yaşayan sezon anlatısı.</p></div><strong>${played}<small>MAÇLIK EVREN</small></strong></header><div class="manager-story-lead"><span>${stories[0][0]}</span><h3>${esc(stories[0][1])}</h3><p>${esc(stories[0][2])}</p></div><div class="manager-story-grid">${stories.slice(1).map((s,i)=>`<article><span>${esc(s[0])}</span><h3>${esc(s[1])}</h3><p>${esc(s[2])}</p><small>SEZON ${career.seasonNo} · STORY ${String(i+2).padStart(2,"0")}</small></article>`).join("")}</div>${awards.length?`<section class="manager-season-awards"><h3>Sezon Ödülleri</h3>${awards.slice().reverse().map(a=>`<article><b>S${a.seasonNo}</b><span>Premier: ${esc(a.premier||"—")}</span><span>Championship: ${esc(a.championship||"—")}</span><span>Lig A: ${esc(a.leagueA||"—")}</span><span>Oruç Reis: ${esc(a.oruc||"—")}</span><strong>Yılın Menajeri: ${esc(a.managerOfYear||"—")}</strong></article>`).join("")}</section>`:""}<section class="manager-season-timeline">${(career.matchHistory||[]).slice(0,12).reverse().map(h=>`<i class="${h.result}"><span>${new Date(h.playedAt).toLocaleDateString("tr-TR")}</span><b>${h.humanGoals}-${h.aiGoals}</b><small>${esc(h.opponentName)}</small></i>`).join("")}</section></section>`;}

  function renderArchive(career) {
    const fixture = career.fixtures.find(item=>item.id===selectedArchiveFixtureId);
    return `<section class="manager-archive-shell"><button class="btn btn-ghost" data-manager-action="set-tab" data-tab="fixtures">← Fikstürlere Dön</button>${window.FIFA_MANAGER_MATCH?.renderArchive?.(career,fixture)||`<div class="empty-state">Maç analizi yüklenemedi.</div>`}</section>`;
  }

  function renderOrucCup(career) {
    const cup=career.orucCup||{series:[],round:0,totalRounds:3,entrantCount:8,status:"locked"};
    const modern=Number(cup.formatVersion||0)>=MANAGER_ORUC_FORMAT_VERSION;
    const rounds=Array.from({length:Number(cup.totalRounds||(modern?3:5))},(_,index)=>index+1);
    const active=Number(selectedCupRound||cup.round||1);
    const roundSeries=round=>(cup.series||[]).filter(series=>series.round===round);

    if(cup.status==="locked"){
      return `<section class="manager-oruc-cup v45"><div class="manager-cup-hero"><div><span>PREMIER İLK 5 · CHAMPIONSHIP İLK 3</span><h2>Oruç Reis Kupası</h2><p>Ligler tamamlandığında sekiz oyuncu rastgele eşleşecek. Çeyrek final, yarı final ve final tek maç oynanacak.</p></div><div><strong>8</strong><small>KATILIMCI</small></div><div><strong>1</strong><small>TEK MAÇ</small></div></div><div class="manager-season-gate cup-pending"><div><span>KUPA KURASI BEKLİYOR</span><h4>${leagueCompetitionComplete(career)?"Kura oluşturuluyor":"Liglerin tamamlanması gerekiyor"}</h4><p>Yeni format Premier League ilk 5 ve Championship ilk 3 sıralamasını kullanır.</p></div></div></section>`;
    }

    const tabs=`<nav class="manager-cup-round-tabs">${rounds.map(round=>{
      const rows=roundSeries(round);
      return `<button class="${round===active?"active":""}" data-manager-action="cup-round" data-round="${round}"><small>ROUND ${round}</small><strong>${cup.roundNames?.[round]||cupRoundLabel(round,modern?3:5)}</strong><span>${rows.length?`${rows.filter(series=>series.winnerId).length}/${rows.length}`:"BEKLİYOR"}</span></button>`;
    }).join("")}</nav>`;

    const bracket=`<div class="manager-cup-bracket">${rounds.map(round=>{
      const rows=roundSeries(round);
      return `<section class="${round===cup.round?"current":""}"><header><span>R${round}</span><b>${cup.roundNames?.[round]||cupRoundLabel(round,modern?3:5)}</b></header>${rows.length?rows.map(series=>{
        const a=actor(career,series.actorA),b=series.actorB?actor(career,series.actorB):null;
        return `<button data-manager-action="cup-round" data-round="${round}" class="${series.winnerId?"complete":""}"><small>${series.bye?"BAY":modern?"TEK MAÇ":`SERİ ${series.scoreA||0}-${series.scoreB||0}`}</small><strong>${esc(a?.shortName||"—")}</strong><i>vs</i><strong>${esc(b?.shortName||"BAY")}</strong></button>`;
      }).join(""):`<div class="bracket-wait"><span>?</span><small>Önceki tur bekleniyor</small></div>`}</section>`;
    }).join("")}</div>`;

    const cards=roundSeries(active).map(series=>{
      const a=actor(career,series.actorA),b=series.actorB?actor(career,series.actorB):null;
      const matches=(series.matchIds||[]).map(id=>career.fixtures.find(fixture=>fixture.id===id)).filter(Boolean);
      let playedA=0,playedB=0;
      matches.filter(fixture=>fixture.status==="played").forEach(fixture=>{
        const winner=fixture.winnerId||(
          fixture.homeScore===fixture.awayScore
            ? null
            : fixture.homeScore>fixture.awayScore?fixture.homeId:fixture.awayId
        );
        if(winner===series.actorA)playedA++;
        if(winner===series.actorB)playedB++;
      });
      const scoreA=Math.max(playedA,Number(series.scoreA||0));
      const scoreB=Math.max(playedB,Number(series.scoreB||0));

      if(series.bye){
        return `<article class="manager-series-card bye complete ${series.actorA===career.humanActorId?"human":""}"><header><span>KURA BAYI</span><b>DOĞRUDAN TUR</b></header><div class="manager-series-score"><section class="winner"><strong>${esc(a.clubName)}</strong><small>${esc(a.managerName)}</small><b>✓</b></section><i>—</i><section><b>—</b><strong>BYE</strong><small>Kura dengesi</small></section></div><footer><strong>✓ ${esc(a.clubName)} TUR ATLADI</strong></footer></article>`;
      }

      return `<article class="manager-series-card ${series.winnerId?"complete":""} ${[series.actorA,series.actorB].includes(career.humanActorId)?"human":""}"><header><span>${modern?"TEK MAÇ · 4.5★":"BEST OF 3 · İLK 2 GALİBİYET"}</span><b>${series.winnerId?"TUR TAMAMLANDI":modern?"MAÇ BEKLİYOR":"SERİ DEVAM EDİYOR"}</b></header><div class="manager-series-score"><section class="${series.winnerId===series.actorA?"winner":""}"><strong>${esc(a.clubName)}</strong><small>${esc(a.managerName)}</small><b>${scoreA}</b></section><i>—</i><section class="${series.winnerId===series.actorB?"winner":""}"><b>${scoreB}</b><strong>${esc(b?.clubName||"—")}</strong><small>${esc(b?.managerName||"—")}</small></section></div><div class="manager-series-games">${matches.map((fixture,index)=>`<div class="${fixture.status||"scheduled"}"><span>${modern?"TEK MAÇ":`MAÇ ${index+1}`}</span><strong>${fixture.status==="played"?`${esc(actor(career,fixture.homeId).shortName)} ${fixture.homeScore}-${fixture.awayScore} ${esc(actor(career,fixture.awayId).shortName)}`:fixture.status==="cancelled"?"GEREK KALMADI":`MD ${fixture.matchday} · ${starText(fixture.stars)}`}</strong>${fixture.shootout?`<small>Penaltılar: ${fixture.shootout.home}-${fixture.shootout.away}</small>`:""}</div>`).join("")}</div><footer>${series.winnerId?`<strong>✓ ${esc(actor(career,series.winnerId).clubName)} TUR ATLADI</strong>`:`<span>${modern?"Kazanan bir sonraki tura yükselir":"Sıradaki hedef: 2 galibiyet"}</span>`}</footer></article>`;
    }).join("");

    const gate=seasonGateState(career);
    return `<section class="manager-oruc-cup ${modern?"v45":"v44"}"><div class="manager-cup-hero"><div><span>${cup.entrantCount||career.actors.length} MENAJER · ${modern?"TOP 5 + TOP 3":"LEGACY RANDOM DRAW"}</span><h2>Oruç Reis Kupası</h2><p>${modern?"Premier ilk 5 ve Championship ilk 3 arasında rastgele, kilitli ve tek maç eleme kupası.":"Mevcut Best of 3 kupa ilerlemesi veri kaybı olmadan korunuyor."}</p></div><div><strong>${modern?0:roundSeries(1).filter(series=>series.bye).length}</strong><small>KURA BAYI</small></div><div><strong>${(cup.series||[]).filter(series=>series.winnerId&&!series.bye).length}</strong><small>TAMAMLANAN TUR</small></div></div>${bracket}${tabs}<div class="manager-series-grid">${cards||`<div class="empty-state">Bu tur önceki tur tamamlandığında oluşacak.</div>`}</div>${!gate.humanCupFixture&&!gate.cupFinished?`<div class="manager-season-gate cup-pending"><div><span>AI KUPA AKIŞI</span><h4>Sıradaki insan maçı henüz oluşmadı</h4><p>Kalan AI maçlarını tamamlayarak bir sonraki turu açabilirsin.</p></div><button class="btn btn-gold" data-manager-action="resolve-season-gate">Kupayı Devam Ettir</button></div>`:""}${cup.migrationNote?`<p class="manager-cup-migration">${esc(cup.migrationNote)}</p>`:""}${cup.championId?`<div class="manager-cup-champion"><span>ŞAMPİYON</span><strong>${esc(actor(career,cup.championId).clubName)}</strong></div>`:""}</section>`;
  }

  function cupRoundLabel(round,total){const remaining=Math.max(1,Math.round(Math.pow(2,total-round)));return remaining===1?"FİNAL":remaining===2?"YARI FİNAL":remaining===4?"ÇEYREK FİNAL":remaining===8?"SON 16":`SON ${remaining*2}`;}

  function renderStatistics(career) {
    const played = career.fixtures.filter(item=>item.status==="played"&&item.matchEngine&&[item.homeId,item.awayId].includes(career.humanActorId));
    const totals = { shots:0,onTarget:0,offTarget:0,blocked:0,xg:0,attacks:0,dangerous:0,corners:0,fouls:0,yellow:0,red:0,passes:0,penalties:0,penaltiesScored:0,penaltiesMissed:0,possession:0,goalsFor:0,goalsAgainst:0,cleanSheets:0 };
    played.forEach(fixture=>{ const home=fixture.homeId===career.humanActorId; const own=fixture.matchEngine.stats[home?"home":"away"]; const goalsFor=home?fixture.homeScore:fixture.awayScore; const goalsAgainst=home?fixture.awayScore:fixture.homeScore; Object.keys(totals).forEach(key=>{ if(key in own) totals[key]+=Number(own[key]||0); }); totals.goalsFor+=Number(goalsFor||0); totals.goalsAgainst+=Number(goalsAgainst||0); if(!goalsAgainst)totals.cleanSheets+=1; });
    const n=Math.max(1,played.length); const accuracy=totals.shots?Math.round(totals.onTarget/totals.shots*100):0; const passAccuracy=played.length?Math.round(played.reduce((sum,f)=>{const own=f.matchEngine.stats[f.homeId===career.humanActorId?"home":"away"];return sum+Number(own.passAccuracy||0)},0)/n):0;
    const cards=[["Maç",played.length],["Gol",totals.goalsFor],["Yenilen Gol",totals.goalsAgainst],["Maç/Gol",(totals.goalsFor/n).toFixed(2)],["Şut",totals.shots],["İsabetli",totals.onTarget],["Şut İsabet %",accuracy],["Toplam xG",totals.xg.toFixed(1)],["Ort. Top %",Math.round(totals.possession/n)],["Pas",totals.passes],["Pas Başarı %",passAccuracy],["Atak",totals.attacks],["Tehlikeli Atak",totals.dangerous],["Korner",totals.corners],["Faul",totals.fouls],["Sarı Kart",totals.yellow],["Kırmızı Kart",totals.red],["Penaltı",totals.penalties],["Penaltı Gol",totals.penaltiesScored],["Penaltı Kaçtı",totals.penaltiesMissed],["Clean Sheet",totals.cleanSheets],["Taktik Karar",career.matchEngineStats?.decisions||0]];
    const recent=[...played].sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||""))).slice(0,2);const comparison=recent.length===2?`<section class="manager-match-comparison"><h3>Son İki Maç Karşılaştırması</h3>${recent.map(f=>{const home=f.homeId===career.humanActorId,s=f.matchEngine.stats[home?"home":"away"];return `<article><span>MD ${f.matchday} · ${esc(actor(career,home?f.awayId:f.homeId).clubName)}</span><strong>${home?f.homeScore:f.awayScore}-${home?f.awayScore:f.homeScore}</strong><div><b>${s.shots} ŞUT</b><b>${s.xg} xG</b><b>${s.possession}% TOP</b><b>${f.matchEngine.report?.managerRating||career.managerRating} RATING</b></div></article>`}).join("")}</section>`:"";
    return `<section class="manager-statistics-centre"><div class="manager-section-head"><div><span>PERFORMANCE INTELLIGENCE</span><h3>İstatistik Merkezi</h3></div><small>Maç, sezon ve kariyer gelişimini tek merkezden oku.</small></div>${played.length?`<div class="manager-stat-grid">${cards.map(([label,value])=>`<article><span>${label}</span><strong>${value}</strong><small>${label.includes("Gol")||label.includes("Şut")?`Maç başı ${(Number(value)/n).toFixed(2)}`:"SEASON TOTAL"}</small></article>`).join("")}</div><section class="manager-form-strip"><h4>SON MAÇLAR</h4>${[...played].reverse().slice(0,10).map(f=>{const home=f.homeId===career.humanActorId;const gf=home?f.homeScore:f.awayScore;const ga=home?f.awayScore:f.homeScore;return `<button data-manager-action="open-archive" data-fixture-id="${esc(f.id)}"><b>${gf}-${ga}</b><span>MD ${f.matchday}</span></button>`}).join("")}</section>${comparison}`:`<div class="empty-state">İlk V43 maçı tamamlandığında bütün parametreler burada birikmeye başlayacak.</div>`}</section>`;
  }

  function renderUniverse(career, premierCount, championshipCount, leagueACount) {
    const renderTable = division => sortedLeagueRows(career, division).map((row, index) => {
      const item = actor(career, row.actorId);
      const count=career.actors.filter(a=>a.division===division).length;const marker = division === "premier" ? (index >= Math.max(0, count - 2) ? "danger" : "") : (index === 0 ? "promote" : index >= 1 && index <= 3 ? "playoff" : index>=count-2?"danger":"");
      const form = career.fixtures.filter(f=>f.status==="played"&&[f.homeId,f.awayId].includes(item.id)).sort((a,b)=>Number(b.matchday)-Number(a.matchday)).slice(0,5).map(f=>{const gf=f.homeId===item.id?f.homeScore:f.awayScore;const ga=f.homeId===item.id?f.awayScore:f.homeScore;return gf>ga?"G":gf===ga?"B":"M"}).join("");
      const last = career.fixtures.filter(f=>f.status==="played"&&[f.homeId,f.awayId].includes(item.id)&&f.eloChange).sort((a,b)=>Number(b.matchday)-Number(a.matchday))[0];
      const delta = last?.eloChange ? (last.homeId===item.id?last.eloChange.homeDelta:last.eloChange.awayDelta) : 0;
      return `<tr class="${item.type === "human" ? "human-row" : ""} ${marker}"><td>${index + 1}</td><td><strong>${esc(item.clubName)}</strong><small>${esc(item.managerName)}${item.type === "human" ? " · SEN" : " AI"}</small></td><td>${row.mp}</td><td>${row.w}</td><td>${row.d}</td><td>${row.l}</td><td>${row.gf}</td><td>${row.ga}</td><td>${row.gd}</td><td><b>${row.pts}</b></td><td><span class="manager-table-form">${form||"—"}</span></td><td>${item.power}<small class="${delta>=0?"positive":"negative"}">${delta>=0?"+":""}${delta}</small></td><td>${item.tacticalIQ||50}</td><td>${item.reputation||50}</td></tr>`;
    }).join("");
    const head=`<thead><tr><th>#</th><th>Kulüp / Manager</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AG</th><th>YG</th><th>AV</th><th>P</th><th>FORM</th><th>ELO</th><th>IQ</th><th>REP</th></tr></thead>`;
    const leagueCard=(division,label,count,note)=>`<article class="manager-league-card ${division}"><div class="manager-panel-head"><div><span>${label}</span><h3>${count} Menajer · 24 Maç</h3></div><em>${note}</em></div><div class="manager-table-scroll"><table>${head}<tbody>${renderTable(division)}</tbody></table></div></article>`;
    return `<section class="manager-league-pyramid"><header><div><span>27 MANAGER · 3 DIVISION</span><h2>Living League Pyramid</h2></div><strong>9 <i>—</i> 9 <i>—</i> 9</strong></header><div class="manager-universe-grid">${leagueCard("premier","PREMIER LEAGUE",premierCount,"Son 2 düşer")}${leagueCard("championship","CHAMPIONSHIP",championshipCount,"1 direkt · 2–4 PO")}${leagueCard("league-a","LİG A",leagueACount,"1 direkt · 2–4 PO")}</div></section>`;
  }

  function renderScouting(career) {
    const rivals = career.actors.filter(item => item.type === "ai").sort((a, b) => b.power - a.power);
    return `<section class="manager-scouting"><div class="manager-section-head"><div><span>AI MANAGER DATABASE</span><h3>Her Rakip Yaşayan Bir Teknik Direktör</h3></div><small>ELO, Taktik IQ, karakter, reputation ve form her sonuçtan sonra oyun davranışına taşınır.</small></div><div class="manager-scout-grid">${rivals.map((item,index)=>`<article><div class="manager-ai-rank">${String(index+1).padStart(2,"0")}</div><div class="manager-ai-avatar">${esc(initials(item.managerName,2))}</div><div><span>${esc(item.clubName)}</span><h4>${esc(item.managerName)}</h4><small>${item.division==="premier"?"Premier League":item.division==="championship"?"Championship":"Lig A"} · ${item.powerClass}</small><p>${esc((item.personality?.traits||["DENGELİ STRATEJİST"]).join(" · "))}</p></div><div class="manager-ai-power"><strong>${item.power}</strong><small>MANAGER ELO</small></div><footer><span>TACTICAL IQ <b>${item.tacticalIQ}</b></span><span>ADAPT <b>${item.personality?.adaptation||50}</b></span><span>AGGRESSION <b>${item.personality?.aggression||50}</b></span><span>UNPREDICTABLE <b>${item.personality?.unpredictability||50}</b></span><span>FORM <b>${item.formRating}</b></span></footer></article>`).join("")}</div></section>`;
  }

  function renderIdentity(career) {
    const identity=career.managerIdentity; const history=career.matchHistory||[]; const wins=history.filter(x=>x.result==="W").length; const dna={attack:clampUi(45+(career.matchEngineStats?.goalsFor||0)*2),control:clampUi(48+(career.tacticalIQ||50)/3),adaptability:clampUi(40+(career.matchEngineStats?.decisions||0)),motivation:clampUi(45+(career.prestige||0)/2),bigMatch:clampUi(45+wins*3)}; identity.dna=dna;
    const rivals=career.actors.filter(a=>a.type==="ai").map(a=>({actor:a,matches:history.filter(h=>h.opponentId===a.id)})).filter(x=>x.matches.length).sort((a,b)=>b.matches.length-a.matches.length).slice(0,5);
    const records=[["En Yüksek ELO",career.managerElo],["Galibiyet",wins],["Yenilmezlik",longestRun(history,x=>x.result!=="L")],["Galibiyet Serisi",longestRun(history,x=>x.result==="W")],["Toplam Gol",career.matchEngineStats?.goalsFor||0],["Kupa",Object.values(career.trophies||{}).reduce((s,v)=>s+Number(v||0),0)]];
    const attrs=career.managerAttributes||{},style=career.playerStyle||{};
    return `<section class="manager-identity-centre"><div class="manager-identity-hero"><div><span>MANAGER DNA</span><h2>${esc(career.playerName)}</h2><p>${dna.attack>70?"Hücumcu":dna.control>70?"Kontrol Uzmanı":dna.adaptability>70?"Taktik Bukalemun":"Dengeli Stratejist"} · Reputation ${identity.reputation}/100</p></div><strong>${career.managerElo}<small>ELO</small></strong></div><section class="manager-rating-centre"><div><span>MANAGER RATING</span><strong>${career.managerRating||50}</strong><small>ELO kimi yendiğini, Rating maçı nasıl yönettiğini gösterir.</small></div><div class="manager-rating-axes">${[["Oyun Okuma",attrs.gameReading],["Adaptasyon",attrs.adaptation],["Risk Yönetimi",attrs.riskManagement],["Büyük Maç",attrs.bigMatch],["İstikrar",attrs.consistency],["Mentalite",attrs.mentality]].map(([k,v])=>`<article><span>${k}</span><b>${v||50}</b><i><em style="width:${v||50}%"></em></i></article>`).join("")}</div><aside><span>PLAYER STYLE</span><strong>${esc(style.label||"ANALİZ BEKLİYOR")}</strong><small>${style.samples||0} maçlık davranış verisi</small><p>Tempo ${style.tempo||50} · Direktlik ${style.directness||50} · Pres ${style.pressing||50} · Risk ${style.risk||50} · Kontrol ${style.control||50}</p></aside></section><div class="manager-dna-grid">${Object.entries(dna).map(([k,v])=>`<article><span>${k.toUpperCase()}</span><i><b style="width:${v}%"></b></i><strong>${v}</strong></article>`).join("")}</div><section class="manager-skill-tree"><h3>Manager Skill Tree</h3>${Object.entries(identity.skills).map(([k,v])=>`<button data-manager-action="upgrade-skill" data-skill="${k}" ${career.careerPoints<100||v>=5?"disabled":""}><span>${k}</span><strong>LV ${v}/5</strong><small>100 CP</small></button>`).join("")}</section><section class="manager-experience-settings"><h3>Kullanıcı Seviyesi</h3>${[["casual","Casual"],["manager","Manager"],["analyst","Analyst"]].map(([id,label])=>`<button class="${identity.level===id?"active":""}" data-manager-action="experience-level" data-level="${id}">${label}</button>`).join("")}<button data-manager-action="toggle-sound">SES & ATMOSFER: ${identity.sound?"AÇIK":"KAPALI"}</button></section><div class="manager-identity-panels"><article><h3>Rekabetler & Derbiler</h3>${rivals.length?rivals.map(x=>`<div><b>${esc(x.actor.clubName)}</b><span>${x.matches.length} maç · ${x.matches.length>=5?"EZELİ RAKİP":x.matches.length>=3?"BÜYÜK REKABET":"REKABET"}</span></div>`).join(""):`<p>Tekrarlanan karşılaşmalar doğal rekabet oluşturacak.</p>`}</article><article><h3>Hall of Fame & Rekor Kitabı</h3>${records.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join("")}</article></div><button class="btn btn-gold" data-manager-action="new-season" ${seasonGateState(career).seasonComplete?"":"disabled"}>Sezonu Tamamla ve Yeni Sezona Geç</button></section>`;
  }

  function clampUi(value){return Math.max(0,Math.min(100,Math.round(value)))}
  function longestRun(history,test){let best=0,run=0;[...history].reverse().forEach(x=>{if(test(x)){run++;best=Math.max(best,run)}else run=0});return best}

  function renderEngineLab(career) {
    const modules = [
      ["Career Engine", 100, "Kulüp, sezon ve kalıcı kariyer state"],
      ["Competition Engine", 70, "Üç devreli fikstür ve canlı puan tabloları"],
      ["Opponent Engine", 75, "AI power seed, gizli stil ve adaptasyon"],
      ["Team Draw Engine", 100, "65 Avrupa kulübü ve resmî kura kilidi"],
      ["Live Match Simulation", 91, "Tek kaynaklı 90 dakika, duran top ve ofsayt motoru"],
      ["Football Geometry", 88, "Savunma çizgisi, takım boyu, genişlik ve yarım alanlar"],
      ["Adaptive Intelligence", 84, "Rakip hafızası, taktik aldatma ve anti-exploit"],
      ["Cause & Effect", 86, "Her kritik pozisyon için fiziksel taktik açıklaması"]
    ];
    const cal=career?.calibrationReport;return `<section class="manager-engine-lab"><div class="manager-engine-core"><div class="manager-core-ring"><span>V44.3</span><strong>ENGINE 4.3</strong></div><div><span>TACTICAL REALITY FOOTBALL</span><h3>Her taktik kararını saha geometrisi, rakip hafızası ve fiziksel aksiyonla görünür hâle getiren maç çekirdeği</h3><p>Kadro/transfer yoktur. Savunma çizgisi, yarım alan, baskı mesafesi, duran top ve pozisyonun sebebi aynı deterministik motor tarafından çözülür.</p></div></div><div class="manager-module-grid">${modules.map(row => `<article><div><span>${row[0]}</span><strong>${row[1]}%</strong></div><i><b style="width:${row[1]}%"></b></i><p>${row[2]}</p></article>`).join("")}</div><section class="manager-calibration-lab"><div><span>10.000 MATCH SIMULATION</span><h3>Calibration Lab</h3><p>Gol, şut, beraberlik, disiplin ve güç dengesi dağılımını deterministik seed ile test eder.</p></div><button class="btn btn-gold" data-manager-action="run-calibration">10.000 MAÇ TEST ET</button>${cal?`<div class="manager-calibration-results">${[["Gol / Maç",cal.goalsPerMatch],["Şut / Maç",cal.shotsPerMatch],["Beraberlik",`${cal.drawRate}%`],["Kırmızı",`${cal.redEvery} maçta 1`],["Penaltı",`${cal.penaltyEvery} maçta 1`],["Güçlü Taraf",`${cal.strongSideWinRate}%`]].map(([k,v])=>`<article><span>${k}</span><strong>${v}</strong></article>`).join("")}</div>`:""}</section><div class="manager-engine-contract"><strong>V44.3 MATCH ENGINE 4.3</strong><span>Futbol geometrisi, ofsayt, duran top, taktiksel sebep–sonuç, rakip hafızası ve anti-exploit katmanı aktiftir.</span></div></section>`;
  }

  function render(view) {
    ensureResources();
    if (!bootstrap || !teamCatalog) {
      view.innerHTML = `<section class="manager-loading"><div class="manager-loading-ball">⚽</div><h2>Manager evreni hazırlanıyor</h2><p>AI profilleri ve FC 25 Avrupa kulüp kataloğu yükleniyor.</p></section>`;
      return;
    }
    const career = activeCareer();
    if (!career) renderLanding(view); else renderCareer(view, career);
  }

  function currentRun(history, predicate) {
    let total = 0;
    for (const item of history || []) {
      if (!predicate(item)) break;
      total += 1;
    }
    return total;
  }

  function localLeaderboard() {
    return [...managerState.careers]
      .sort((a, b) => b.careerPoints - a.careerPoints || b.managerElo - a.managerElo)
      .map((item, index) => {
        const history = (item.matchHistory || []).filter(row => !row.friendly);
        const stats = item.matchEngineStats || {};
        const style = item.playerStyle || {};
        const identity = item.managerIdentity || {};
        const dna = identity.dna || {};
        const attrs = item.managerAttributes || {};
        const friendly = item.friendlyStats || {};
        const matches = Number(stats.matches || history.length || 0);
        const wins = Number(stats.wins || history.filter(row => row.result === "W").length || 0);
        const draws = Number(stats.draws || history.filter(row => row.result === "D").length || 0);
        const losses = Number(stats.losses || history.filter(row => row.result === "L").length || 0);
        return {
          rank: index + 1,
          career_id: item.cloudCareerId || item.id,
          player_name: item.playerName,
          club_name: item.clubName,
          club_short_name: item.shortName,
          primary_color: item.primaryColor,
          secondary_color: item.secondaryColor,
          division: item.division,
          season_no: item.seasonNo,
          matchday: item.matchday,
          career_points: item.careerPoints,
          manager_elo: item.managerElo,
          tactical_iq: item.tacticalIQ,
          manager_rating: item.managerRating,
          prestige: item.prestige,
          completion_rate: item.completionRate,
          manager_reputation: identity.reputation,
          trophy_count: trophyCount(item),
          matches_played: matches,
          wins,
          draws,
          losses,
          goals_for: Number(stats.goalsFor || 0),
          goals_against: Number(stats.goalsAgainst || 0),
          decisions: Number(stats.decisions || 0),
          recent_form: history.slice(0, 5).map(row => row.result).join(" · "),
          current_streak: history[0]?.result ? currentRun(history, row => row.result === history[0].result) : 0,
          win_streak: currentRun(history, row => row.result === "W"),
          unbeaten_streak: currentRun(history, row => row.result !== "L"),
          latest_plan: history[0]?.planSummary || "",
          player_style_label: style.label,
          style_tempo: style.tempo,
          style_directness: style.directness,
          style_pressing: style.pressing,
          style_risk: style.risk,
          style_control: style.control,
          style_samples: style.samples,
          dna_attack: dna.attack,
          dna_control: dna.control,
          dna_adaptability: dna.adaptability,
          dna_motivation: dna.motivation,
          dna_big_match: dna.bigMatch,
          attr_game_reading: attrs.gameReading,
          attr_adaptation: attrs.adaptation,
          attr_risk_management: attrs.riskManagement,
          attr_big_match: attrs.bigMatch,
          attr_consistency: attrs.consistency,
          attr_mentality: attrs.mentality,
          friendly_matches: Number(friendly.matches || 0),
          friendly_wins: Number(friendly.wins || 0),
          friendly_draws: Number(friendly.draws || 0),
          friendly_losses: Number(friendly.losses || 0),
          friendly_goals_for: Number(friendly.goalsFor || 0),
          friendly_goals_against: Number(friendly.goalsAgainst || 0),
          updated_at: item.updatedAt,
          source: "local"
        };
      });
  }

  function hallNumber(row, keys, fallback = null) {
    for (const key of keys) {
      const value = row?.[key];
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function hallText(row, keys, fallback = "") {
    for (const key of keys) {
      const value = row?.[key];
      if (value === null || value === undefined || value === "") continue;
      return String(value);
    }
    return fallback;
  }

  function hallDivisionLabel(value) {
    const id = String(value || "").toLowerCase();
    if (id === "premier") return "Premier League";
    if (id === "championship") return "Championship";
    if (id === "league-a") return "Lig A";
    return value || "Manager Hall";
  }

  function hallFormArray(value) {
    if (Array.isArray(value)) return value.map(String).filter(item => ["W", "D", "L"].includes(item)).slice(0, 5);
    return String(value || "")
      .toUpperCase()
      .split(/[^WDL]+/)
      .filter(item => ["W", "D", "L"].includes(item))
      .slice(0, 5);
  }

  function hallDate(value) {
    const parsed = Date.parse(value || "");
    if (!Number.isFinite(parsed)) return "—";
    return new Date(parsed).toLocaleString("tr-TR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
  }

  function hallResultBadge(result) {
    const label = result === "W" ? "G" : result === "D" ? "B" : "M";
    return `<i class="manager-hall-form-${result.toLowerCase()}">${label}</i>`;
  }

  function normalizeHallProfile(row, sourceIndex, career) {
    const matches = hallNumber(row, ["matches_played", "matches", "official_matches"], null);
    const wins = hallNumber(row, ["wins", "official_wins"], null);
    const draws = hallNumber(row, ["draws", "official_draws"], null);
    const losses = hallNumber(row, ["losses", "official_losses"], null);
    const goalsFor = hallNumber(row, ["goals_for", "gf"], null);
    const goalsAgainst = hallNumber(row, ["goals_against", "ga"], null);
    const form = hallFormArray(hallText(row, ["recent_form", "form_line", "form"], ""));
    const meetings = career ? friendlyHistoryAgainst(career, row) : [];
    const h2h = {
      matches: meetings.length,
      wins: meetings.filter(item => item.result === "W").length,
      draws: meetings.filter(item => item.result === "D").length,
      losses: meetings.filter(item => item.result === "L").length,
      goalsFor: meetings.reduce((sum, item) => sum + Number(item.humanGoals || 0), 0),
      goalsAgainst: meetings.reduce((sum, item) => sum + Number(item.opponentGoals || 0), 0)
    };
    const winRate = matches && wins !== null ? Math.round(wins / Math.max(1, matches) * 100) : hallNumber(row, ["win_rate"], null);
    const pointsPerMatch = matches && wins !== null && draws !== null
      ? Math.round(((wins * 3 + draws) / Math.max(1, matches)) * 100) / 100
      : hallNumber(row, ["points_per_match", "ppm"], null);
    const elo = hallNumber(row, ["manager_elo", "elo"], 1000);
    const iq = hallNumber(row, ["tactical_iq", "iq"], 50);
    const rating = hallNumber(row, ["manager_rating", "rating"], null);
    const careerPoints = hallNumber(row, ["career_points"], 0);
    const trophies = hallNumber(row, ["trophy_count", "trophies"], 0);
    const hallIndex = Math.round(
      Math.max(0, Math.min(100,
        (elo - 800) / 10 * .34 +
        iq * .28 +
        (rating ?? iq) * .18 +
        Math.min(100, careerPoints / 15) * .12 +
        Math.min(100, trophies * 18) * .08
      ))
    );
    const coverageValues = [
      matches, wins, goalsFor, rating,
      hallNumber(row, ["style_tempo"], null),
      hallNumber(row, ["dna_attack"], null),
      hallNumber(row, ["attr_game_reading"], null),
      hallText(row, ["player_style_label"], "")
    ];
    const coverage = Math.round(coverageValues.filter(value => value !== null && value !== "").length / coverageValues.length * 100);
    return {
      row,
      sourceIndex,
      key: friendlyKey(row),
      self: sameManager(row, career),
      rank: Number(row.rank || sourceIndex + 1),
      playerName: hallText(row, ["player_name"], "Manager"),
      clubName: hallText(row, ["club_name"], "Club"),
      shortName: hallText(row, ["club_short_name"], initials(row.club_name || "Club", 4)).slice(0, 5),
      primary: hallText(row, ["primary_color"], "#12364b"),
      secondary: hallText(row, ["secondary_color"], "#75dcff"),
      division: hallText(row, ["division"], "championship"),
      season: hallNumber(row, ["season_no"], 1),
      matchday: hallNumber(row, ["matchday"], null),
      careerPoints,
      elo,
      iq,
      rating,
      prestige: hallNumber(row, ["prestige"], null),
      completion: hallNumber(row, ["completion_rate"], null),
      reputation: hallNumber(row, ["manager_reputation", "reputation"], null),
      trophies,
      matches,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor !== null && goalsAgainst !== null ? goalsFor - goalsAgainst : null,
      winRate,
      pointsPerMatch,
      decisions: hallNumber(row, ["decisions"], null),
      form,
      currentStreak: hallNumber(row, ["current_streak"], null),
      winStreak: hallNumber(row, ["win_streak"], null),
      unbeatenStreak: hallNumber(row, ["unbeaten_streak"], null),
      latestPlan: hallText(row, ["latest_plan", "preferred_plan"], ""),
      styleLabel: hallText(row, ["player_style_label", "style_label"], ""),
      style: {
        tempo: hallNumber(row, ["style_tempo", "tempo"], null),
        directness: hallNumber(row, ["style_directness", "directness"], null),
        pressing: hallNumber(row, ["style_pressing", "pressing"], null),
        risk: hallNumber(row, ["style_risk", "risk"], null),
        control: hallNumber(row, ["style_control", "control"], null),
        samples: hallNumber(row, ["style_samples"], null)
      },
      dna: {
        attack: hallNumber(row, ["dna_attack"], null),
        control: hallNumber(row, ["dna_control"], null),
        adaptability: hallNumber(row, ["dna_adaptability"], null),
        motivation: hallNumber(row, ["dna_motivation"], null),
        bigMatch: hallNumber(row, ["dna_big_match"], null)
      },
      attributes: {
        gameReading: hallNumber(row, ["attr_game_reading"], null),
        adaptation: hallNumber(row, ["attr_adaptation"], null),
        riskManagement: hallNumber(row, ["attr_risk_management"], null),
        bigMatch: hallNumber(row, ["attr_big_match"], null),
        consistency: hallNumber(row, ["attr_consistency"], null),
        mentality: hallNumber(row, ["attr_mentality"], null)
      },
      friendlyPublic: {
        matches: hallNumber(row, ["friendly_matches"], null),
        wins: hallNumber(row, ["friendly_wins"], null),
        draws: hallNumber(row, ["friendly_draws"], null),
        losses: hallNumber(row, ["friendly_losses"], null),
        goalsFor: hallNumber(row, ["friendly_goals_for"], null),
        goalsAgainst: hallNumber(row, ["friendly_goals_against"], null)
      },
      h2h,
      updatedAt: hallText(row, ["updated_at", "last_active_at"], ""),
      source: hallText(row, ["source"], "supabase"),
      hallIndex,
      coverage
    };
  }

  function hallValue(value, suffix = "") {
    return value === null || value === undefined || value === "" ? "—" : `${value}${suffix}`;
  }

  function hallBadges(profile) {
    const badges = [];
    if (profile.elo >= 1450) badges.push(["ELITE", "elo"]);
    if (profile.iq >= 75) badges.push(["TAKTİK USTASI", "iq"]);
    if ((profile.rating || 0) >= 75) badges.push(["YÜKSEK RATING", "rating"]);
    if ((profile.winRate || 0) >= 60 && (profile.matches || 0) >= 5) badges.push(["WINNING MANAGER", "wins"]);
    if ((profile.unbeatenStreak || 0) >= 10) badges.push(["IRON RUN", "run"]);
    if (profile.trophies >= 3) badges.push(["TROPHY HUNTER", "trophy"]);
    if (profile.careerPoints >= 750) badges.push(["HALL STAR", "career"]);
    if (!badges.length) badges.push(["RISING MANAGER", "rising"]);
    return badges.slice(0, 4);
  }

  function renderHallBars(values, labels) {
    return labels.map(([key, label]) => {
      const value = values[key];
      return `<div class="manager-hall-bar"><span>${label}</span><i><b style="width:${value === null ? 0 : Math.max(0, Math.min(100, value))}%"></b></i><strong>${hallValue(value)}</strong></div>`;
    }).join("");
  }

  function openHallProfile(row, sourceIndex = 0) {
    const career = activeCareer();
    const profile = normalizeHallProfile(row, sourceIndex, career);
    const opponents = publicFriendlyRows(hallRowsCache, career);
    const friendlyIndex = opponents.findIndex(item => friendlyKey(item) === profile.key);
    const form = profile.form.length
      ? `<div class="manager-hall-form-line">${profile.form.map(hallResultBadge).join("")}</div>`
      : `<span class="manager-hall-no-data">FORM VERİSİ YOK</span>`;
    const badges = hallBadges(profile).map(([label, type]) => `<span class="manager-hall-achievement ${type}">${label}</span>`).join("");
    const officialStats = [
      ["Maç", profile.matches],
      ["Galibiyet", profile.wins],
      ["Beraberlik", profile.draws],
      ["Mağlubiyet", profile.losses],
      ["Attığı Gol", profile.goalsFor],
      ["Yediği Gol", profile.goalsAgainst],
      ["Averaj", profile.goalDifference],
      ["Galibiyet %", profile.winRate === null ? null : `${profile.winRate}%`],
      ["Puan / Maç", profile.pointsPerMatch]
    ];
    const h2hText = profile.h2h.matches
      ? `${profile.h2h.matches} maç · ${profile.h2h.wins}G ${profile.h2h.draws}B ${profile.h2h.losses}M · ${profile.h2h.goalsFor}-${profile.h2h.goalsAgainst}`
      : "Henüz karşılaşmadınız.";
    const friendlyButton = career && !profile.self && friendlyIndex >= 0
      ? `<button class="btn btn-gold" data-manager-action="friendly-challenge" data-friendly-index="${friendlyIndex}">Friendly Match</button>`
      : "";
    ctx()?.openModal?.("Manager Intelligence Profile", `
      <section class="manager-hall-profile-modal">
        <header class="manager-hall-profile-hero" style="--profile-primary:${esc(profile.primary)};--profile-secondary:${esc(profile.secondary)}">
          <div class="manager-hall-profile-mark">${esc(profile.shortName)}</div>
          <div>
            <span>#${profile.rank} · ${esc(hallDivisionLabel(profile.division))} · SEZON ${profile.season}</span>
            <h2>${esc(profile.playerName)}</h2>
            <p>${esc(profile.clubName)}</p>
            <div class="manager-hall-achievements">${badges}</div>
          </div>
          <aside><strong>${profile.hallIndex}</strong><span>HALL INDEX</span><small>Profil kapsamı %${profile.coverage}</small></aside>
        </header>
        <div class="manager-hall-profile-kpis">
          ${[
            ["Manager ELO", profile.elo],
            ["Taktik IQ", profile.iq],
            ["Manager Rating", profile.rating],
            ["Kariyer Puanı", profile.careerPoints],
            ["Kupa", profile.trophies],
            ["Prestij", profile.prestige],
            ["Tamamlama", profile.completion === null ? null : `${profile.completion}%`],
            ["Reputation", profile.reputation]
          ].map(([label, value]) => `<article><span>${label}</span><strong>${hallValue(value)}</strong></article>`).join("")}
        </div>
        <div class="manager-hall-profile-grid">
          <article>
            <h3>Resmî Maç Karnesi</h3>
            <div class="manager-hall-stat-list">${officialStats.map(([label, value]) => `<div><span>${label}</span><b>${hallValue(value)}</b></div>`).join("")}</div>
            <div class="manager-hall-form-block"><span>SON FORM</span>${form}</div>
            <div class="manager-hall-streaks">
              <span>Güncel Seri <b>${hallValue(profile.currentStreak)}</b></span>
              <span>Galibiyet Serisi <b>${hallValue(profile.winStreak)}</b></span>
              <span>Yenilmezlik <b>${hallValue(profile.unbeatenStreak)}</b></span>
            </div>
          </article>
          <article>
            <h3>Taktik Kimlik</h3>
            <div class="manager-hall-style-name"><span>PLAYER STYLE</span><strong>${esc(profile.styleLabel || "PUBLIC VERİ BEKLENİYOR")}</strong><small>${profile.style.samples === null ? "Örnek sayısı paylaşılmadı" : `${profile.style.samples} maçlık örnek`}</small></div>
            ${renderHallBars(profile.style, [["tempo","Tempo"],["directness","Direktlik"],["pressing","Pres"],["risk","Risk"],["control","Kontrol"]])}
            <div class="manager-hall-plan"><span>SON TAKTİK İMZA</span><p>${esc(profile.latestPlan || "Public profile verisi bulunmuyor.")}</p></div>
          </article>
          <article>
            <h3>Manager DNA</h3>
            ${renderHallBars(profile.dna, [["attack","Hücum"],["control","Kontrol"],["adaptability","Adaptasyon"],["motivation","Motivasyon"],["bigMatch","Büyük Maç"]])}
          </article>
          <article>
            <h3>Manager Attributes</h3>
            ${renderHallBars(profile.attributes, [["gameReading","Oyun Okuma"],["adaptation","Adaptasyon"],["riskManagement","Risk Yönetimi"],["bigMatch","Büyük Maç"],["consistency","İstikrar"],["mentality","Mentalite"]])}
          </article>
          <article class="manager-hall-h2h">
            <h3>Seninle Friendly H2H</h3>
            <strong>${h2hText}</strong>
            <small>Friendly sonuçları resmî ELO ve kariyer puanını değiştirmez.</small>
          </article>
          <article class="manager-hall-data-note">
            <h3>Public Profil Durumu</h3>
            <p>Son aktiflik: <b>${hallDate(profile.updatedAt)}</b></p>
            <p>Kaynak: <b>${profile.source === "local" ? "Bu cihazdaki kariyer" : "Supabase public profil"}</b></p>
            <p>Eksik değerler tahmin edilmez; <b>—</b> olarak gösterilir.</p>
          </article>
        </div>
        <footer class="manager-hall-profile-actions">${friendlyButton}<button class="btn btn-ghost" data-action="close-modal">Kapat</button></footer>
      </section>
    `);
  }

  function sortHallProfiles(profiles) {
    const rows = [...profiles];
    const sorters = {
      career_points: (a, b) => b.careerPoints - a.careerPoints || b.elo - a.elo,
      elo: (a, b) => b.elo - a.elo || b.iq - a.iq,
      iq: (a, b) => b.iq - a.iq || b.elo - a.elo,
      rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || b.elo - a.elo,
      win_rate: (a, b) => (b.winRate ?? -1) - (a.winRate ?? -1) || (b.matches ?? 0) - (a.matches ?? 0),
      trophies: (a, b) => b.trophies - a.trophies || b.careerPoints - a.careerPoints,
      hall_index: (a, b) => b.hallIndex - a.hallIndex || b.elo - a.elo
    };
    return rows.sort(sorters[hallSortMode] || sorters.career_points);
  }

  function friendlyKey(row) {
    return String(row?.career_id || row?.id || `${row?.player_name || "manager"}|${row?.club_name || "club"}`);
  }

  function sameManager(row, career) {
    if (!row || !career) return false;
    if (row.career_id && career.cloudCareerId && String(row.career_id) === String(career.cloudCareerId)) return true;
    return String(row.player_name || "").trim().toLocaleLowerCase("tr-TR") === String(career.playerName || "").trim().toLocaleLowerCase("tr-TR");
  }

  function publicFriendlyRows(rows, career) {
    return (rows || []).filter(row => row?.player_name && row?.club_name && !sameManager(row, career));
  }

  function friendlyHistoryAgainst(career, row) {
    const key = friendlyKey(row);
    return (career?.friendlyHistory || []).filter(item => item.opponentKey === key || String(item.opponentPlayerName || "").toLocaleLowerCase("tr-TR") === String(row.player_name || "").toLocaleLowerCase("tr-TR"));
  }

  function friendlyFormLine(career, row) {
    const rows = friendlyHistoryAgainst(career, row).slice(0, 5);
    return rows.length ? rows.map(item => item.result).join(" · ") : "İLK RANDEVU";
  }

  function deterministicFriendlyTeam(row, excludedId = null) {
    const elo = Number(row?.manager_elo || 1000);
    const stars = elo >= 1500 ? 5 : elo >= 1225 ? 4.5 : 4;
    let pool = poolFor(stars).filter(team => team.id !== excludedId);
    if (!pool.length) pool = (teamCatalog?.teams || []).filter(team => team.active !== false && team.id !== excludedId);
    if (!pool.length) return null;
    const random = seededNumber(`FRIENDLY|${friendlyKey(row)}|${elo}|${row?.season_no || 1}`);
    return pool[Math.floor(random() * pool.length)] || pool[0];
  }

  function recentHumanFriendlyTeam(career, excludedId = null) {
    const active = career?.activeMatchFixtureId ? career.fixtures?.find(item => item.id === career.activeMatchFixtureId) : null;
    const candidates = [
      active ? teamForActor(active, career.humanActorId)?.id : null,
      ...(career?.matchHistory || []).map(item => item.humanTeamId),
      ...(career?.friendlyHistory || []).map(item => item.humanTeamId)
    ].filter(Boolean);
    const found = candidates.find(id => id !== excludedId && teamById(id));
    if (found) return teamById(found);
    return deterministicFriendlyTeam({ player_name: career?.playerName, club_name: career?.clubName, manager_elo: career?.managerElo }, excludedId);
  }

  function friendlyTeamOptions(selectedId) {
    return (teamCatalog?.teams || [])
      .filter(team => team.active !== false)
      .sort((a, b) => Number(b.stars || 0) - Number(a.stars || 0) || String(a.clubName).localeCompare(String(b.clubName), "tr"))
      .map(team => `<option value="${esc(team.id)}" ${team.id === selectedId ? "selected" : ""}>${esc(team.clubName)} · ${starText(team.stars)} · OVR ${team.overall}</option>`)
      .join("");
  }

  function openFriendlyModal(row) {
    const career = activeCareer();
    if (!career) {
      ctx()?.toast?.("Friendly Match için önce Manager Room kariyerini açmalısın.", "warning");
      ctx()?.navigate?.("managerroom");
      return;
    }
    if (!(teamCatalog?.teams || []).length) {
      ctx()?.toast?.("FC 25 takım kataloğu henüz yükleniyor. Birkaç saniye sonra tekrar dene.", "warning");
      ensureResources();
      return;
    }
    const activeFixture = career.activeMatchFixtureId ? career.fixtures?.find(item => item.id === career.activeMatchFixtureId) : null;
    if (activeFixture?.matchEngine && activeFixture.matchEngine.status !== "finished") {
      ctx()?.toast?.("Önce devam eden maçı tamamla veya maç merkezinden çık.", "warning");
      return;
    }

    selectedFriendlyOpponent = { ...row };
    let opponentTeam = teamById(row.current_team_id || row.team_id || row.club_team_id || row.active_team_id) || deterministicFriendlyTeam(row);
    let humanTeam = recentHumanFriendlyTeam(career, opponentTeam?.id);
    if (!opponentTeam) opponentTeam = deterministicFriendlyTeam(row, humanTeam?.id);
    if (!humanTeam) humanTeam = deterministicFriendlyTeam({ player_name: career.playerName, club_name: career.clubName, manager_elo: career.managerElo }, opponentTeam?.id);
    if (humanTeam?.id === opponentTeam?.id) opponentTeam = deterministicFriendlyTeam(row, humanTeam.id);

    const meetings = friendlyHistoryAgainst(career, row);
    const record = {
      w: meetings.filter(item => item.result === "W").length,
      d: meetings.filter(item => item.result === "D").length,
      l: meetings.filter(item => item.result === "L").length
    };

    ctx()?.openModal?.("Manager Hall Friendly Match", `
      <form id="managerFriendlyForm" class="manager-career-form manager-friendly-form">
        <input type="hidden" name="opponentKey" value="${esc(friendlyKey(row))}">
        <div class="manager-form-intro manager-friendly-modal-hero">
          <div class="eyebrow">ASYNC MANAGER FRIENDLY</div>
          <h3>${esc(career.clubName)} vs ${esc(row.club_name)}</h3>
          <p>${esc(row.player_name)} adlı Manager'ın Manager Hall'daki güncel public ELO ve Taktik IQ profili rakip AI kimliği olarak kullanılacaktır. Bu canlı çok oyunculu maç değildir.</p>
          <div class="manager-friendly-modal-stats"><span>RAKİP ELO <b>${Number(row.manager_elo || 1000)}</b></span><span>TAKTİK IQ <b>${Number(row.tactical_iq || 50)}</b></span><span>FRIENDLY SERİSİ <b>${record.w}G · ${record.d}B · ${record.l}M</b></span></div>
        </div>
        <div class="manager-form-grid manager-friendly-team-selectors">
          <label>Senin FC 25 takımın<select name="humanTeamId" required>${friendlyTeamOptions(humanTeam?.id)}</select></label>
          <label>Rakibin FC 25 takımı<select name="opponentTeamId" required>${friendlyTeamOptions(opponentTeam?.id)}</select></label>
        </div>
        <fieldset class="manager-friendly-venue"><legend>Maç Yeri</legend><label><input type="radio" name="venue" value="home" checked><span><b>Ev Sahibi</b><small>Sen solda ve ev sahibi olarak başlarsın.</small></span></label><label><input type="radio" name="venue" value="away"><span><b>Deplasman</b><small>Rakip ev sahibi olur.</small></span></label></fieldset>
        <div class="manager-friendly-rules"><b>FRIENDLY KURALLARI</b><span>Puan tablosu değişmez</span><span>Manager ELO değişmez</span><span>Kariyer puanı verilmez</span><span>Sonuç yalnızca Friendly History'ye yazılır</span></div>
        <div class="manager-modal-actions"><button type="button" class="btn btn-ghost" data-action="close-modal">Vazgeç</button><button class="btn btn-gold" type="submit">Friendly Maçını Kur</button></div>
      </form>
    `, "MANAGER HALL · EXHIBITION ARENA");
  }

  function friendlyStyleSeed(row) {
    const random = seededNumber(`FRIENDLY-STYLE|${friendlyKey(row)}`);
    const value = () => Math.round(36 + random() * 42);
    return {
      tempo: Number(row.tempo || row.style_tempo || value()),
      directness: Number(row.directness || row.style_directness || value()),
      pressing: Number(row.pressing || row.style_pressing || value()),
      risk: Number(row.risk || row.style_risk || value()),
      adaptation: Number(row.adaptation || row.tactical_iq || value()),
      width: Number(row.width || row.style_width || value()),
      control: Number(row.control || row.style_control || value()),
      resilience: Number(row.resilience || value())
    };
  }

  function upsertFriendlyGuest(career, row) {
    career.friendlyGuests ||= [];
    const key = friendlyKey(row);
    const id = `FRIENDLY-${slug(key).slice(0, 58) || slug(row.player_name)}`;
    let guest = career.friendlyGuests.find(item => item.id === id);
    const power = Math.max(700, Math.min(2200, Number(row.manager_elo || 1000)));
    const iq = Math.max(20, Math.min(99, Number(row.tactical_iq || 50)));
    const seed = friendlyStyleSeed(row);
    const payload = {
      id,
      type: "friendly-guest",
      friendlyGuest: true,
      publicCareerKey: key,
      managerName: String(row.player_name || "Guest Manager"),
      clubName: String(row.club_name || "Guest Club"),
      shortName: String(row.club_short_name || initials(row.club_name || row.player_name, 4)).toUpperCase().slice(0, 5),
      division: "friendly",
      power,
      powerClass: powerLabel(power),
      tacticalIQ: iq,
      reputation: Math.max(35, Math.min(100, Math.round(45 + (power - 900) / 18))),
      formRating: 50,
      styleVisible: true,
      styleSeed: seed,
      primaryColor: row.primary_color || "#102f46",
      secondaryColor: row.secondary_color || "#75dcff",
      managerMemory: guest?.managerMemory || { meetings:0, wins:0, draws:0, losses:0, plans:{}, lastPlan:null, confidence:50, notes:[], patterns:{formations:{},buildUps:{},pressing:{},mentalities:{},phaseBehaviors:{},responses:{}} },
      psychology: { confidence:55, pressure:25, composure:60, streak:0, mood:"FRIENDLY" },
      managerAttributes: { adaptation:iq, gameReading:iq, riskManagement:50, bigMatch:50, consistency:50, mentality:50 },
      friendlySource: { source: row.source || "manager-hall", seasonNo:Number(row.season_no || 1), division:row.division || "—", careerPoints:Number(row.career_points || 0), trophyCount:Number(row.trophy_count || 0), updatedAt:now() }
    };
    if (guest) Object.assign(guest, payload);
    else { guest = payload; guest.personality = buildManagerPersonality(guest); career.friendlyGuests.push(guest); }
    career.friendlyGuests = career.friendlyGuests.slice(-40);
    return guest;
  }

  async function createManagerHallFriendly(formData) {
    const career = activeCareer();
    const row = selectedFriendlyOpponent;
    if (!career || !row) throw new Error("Friendly rakibi artık seçili değil. Manager Hall'dan yeniden seç.");
    if (String(formData.get("opponentKey") || "") !== friendlyKey(row)) throw new Error("Friendly rakip doğrulaması başarısız.");

    const humanTeam = teamById(String(formData.get("humanTeamId") || ""));
    const opponentTeam = teamById(String(formData.get("opponentTeamId") || ""));
    if (!humanTeam || !opponentTeam) throw new Error("İki FC 25 takımı da seçilmelidir.");
    if (humanTeam.id === opponentTeam.id) throw new Error("Friendly maçında iki farklı takım seçmelisin.");

    const activeFixture = career.activeMatchFixtureId ? career.fixtures?.find(item => item.id === career.activeMatchFixtureId) : null;
    if (activeFixture?.matchEngine && activeFixture.matchEngine.status !== "finished") throw new Error("Devam eden maç varken yeni Friendly başlatılamaz.");

    // Remove abandoned unplayed friendlies so they cannot block or bloat the career.
    career.fixtures = (career.fixtures || []).filter(item => !(item.competition === "friendly" && item.status === "scheduled" && !item.matchEngine));
    const guest = upsertFriendlyGuest(career, row);
    const humanHome = String(formData.get("venue") || "home") !== "away";
    const fixtureId = uid("friendly");
    const fixture = {
      id: fixtureId,
      competition: "friendly",
      division: "friendly",
      friendly: true,
      officialImpact: false,
      friendlySource: "manager-hall",
      friendlyOpponentKey: friendlyKey(row),
      friendlyOpponentPlayerName: guest.managerName,
      friendlyOpponentClubName: guest.clubName,
      leg: 0,
      matchday: Number(career.matchday || 1),
      stars: Math.max(Number(humanTeam.stars || 4), Number(opponentTeam.stars || 4)),
      homeId: humanHome ? career.humanActorId : guest.id,
      awayId: humanHome ? guest.id : career.humanActorId,
      homeTeam: humanHome ? humanTeam.id : opponentTeam.id,
      awayTeam: humanHome ? opponentTeam.id : humanTeam.id,
      status: "scheduled",
      homeScore: null,
      awayScore: null,
      decisions: [],
      teamDraw: { id:uid("friendly-draw"), version:VERSION, stars:Math.max(Number(humanTeam.stars || 4), Number(opponentTeam.stars || 4)), drawnAt:now(), locked:true, method:"manager-hall-friendly-selection" },
      createdAt: now()
    };
    career.fixtures.push(fixture);
    career.activeMatchFixtureId = fixture.id;
    career.status = "friendly-ready";
    career.lastFriendlyOpponentKey = friendlyKey(row);
    await persistCareer(career, { silent:true });
    return fixture;
  }

  function renderFriendlyArena(rows, career) {
    const opponents = publicFriendlyRows(rows, career);
    if (!career) {
      return `<section class="manager-friendly-arena manager-friendly-locked"><div><span>MANAGER HALL FRIENDLY ARENA</span><h3>Diğer Manager kulüplerine meydan oku</h3><p>Friendly maç oluşturmak ve kişisel H2H verisini izlemek için önce The Manager's Room içinden kariyerini aç.</p></div><button class="btn btn-gold" data-manager-action="friendly-open-career">Kariyerimi Aç</button></section>`;
    }
    const stats = career.friendlyStats || {matches:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0};
    const cards = opponents.slice(0, 12).map((row, index) => {
      const profile = normalizeHallProfile(row, hallRowsCache.findIndex(item => friendlyKey(item) === friendlyKey(row)), career);
      const record = profile.h2h;
      const form = profile.form.length ? profile.form.map(hallResultBadge).join("") : `<small>FORM YOK</small>`;
      return `<article class="manager-friendly-card manager-friendly-card-rich">
        <header><span>#${profile.rank} · ${esc(hallDivisionLabel(profile.division))}</span><b>ELO ${profile.elo}</b></header>
        <div class="manager-friendly-club-mark" style="--friendly-primary:${esc(profile.primary)};--friendly-secondary:${esc(profile.secondary)}">${esc(profile.shortName)}</div>
        <section>
          <h4>${esc(profile.clubName)}</h4>
          <p>${esc(profile.playerName)} · IQ ${profile.iq} · INDEX ${profile.hallIndex}</p>
          <div class="manager-friendly-mini-kpis"><span>RATING <b>${hallValue(profile.rating)}</b></span><span>WIN% <b>${hallValue(profile.winRate, "%")}</b></span><span>KUPA <b>${profile.trophies}</b></span></div>
          <div class="manager-friendly-mini-form">${form}</div>
          <small>${record.matches ? `SANA KARŞI ${record.wins}G · ${record.draws}B · ${record.losses}M` : "SANA KARŞI İLK RANDEVU"}</small>
        </section>
        <div class="manager-friendly-card-actions">
          <button class="btn btn-ghost" data-manager-action="hall-profile" data-hall-index="${profile.sourceIndex}">Profili İncele</button>
          <button class="btn btn-gold" data-manager-action="friendly-challenge" data-friendly-index="${index}">Friendly Match</button>
        </div>
      </article>`;
    }).join("");
    return `<section class="manager-friendly-arena"><div class="manager-friendly-arena-head"><div><span>MANAGER HALL FRIENDLY ARENA</span><h3>Manager istihbaratından doğrudan maça</h3><p>Rakibin public kariyer verisini incele, sana karşı H2H karnesini gör ve puansız Friendly Match başlat.</p></div><aside><strong>${stats.matches || 0}</strong><span>FRIENDLY</span><small>${stats.wins || 0}G · ${stats.draws || 0}B · ${stats.losses || 0}M · ${stats.goalsFor || 0}-${stats.goalsAgainst || 0}</small></aside></div>${opponents.length ? `<div class="manager-friendly-grid">${cards}</div>` : `<div class="empty-state">Meydan okunabilecek başka bir Manager kariyeri bulunamadı.</div>`}</section>`;
  }

  function renderHallPodium(profiles) {
    const top = profiles.slice(0, 3);
    if (!top.length) return "";
    return `<section class="manager-hall-podium">${top.map((profile, index) => `
      <article class="place-${index + 1}" style="--profile-primary:${esc(profile.primary)};--profile-secondary:${esc(profile.secondary)}">
        <span class="manager-hall-medal">${index + 1}</span>
        <div class="manager-hall-podium-mark">${esc(profile.shortName)}</div>
        <h3>${esc(profile.playerName)}</h3>
        <p>${esc(profile.clubName)}</p>
        <div><span>ELO <b>${profile.elo}</b></span><span>IQ <b>${profile.iq}</b></span><span>INDEX <b>${profile.hallIndex}</b></span></div>
        <button data-manager-action="hall-profile" data-hall-index="${profile.sourceIndex}">Profili Aç</button>
      </article>`).join("")}</section>`;
  }

  function renderManagerIntelligenceCards(profiles, career) {
    if (!profiles.length) return `<div class="empty-state">Bu filtreye uygun Manager bulunamadı.</div>`;
    return `<div class="manager-hall-profile-grid">${profiles.map(profile => {
      const form = profile.form.length ? profile.form.map(hallResultBadge).join("") : `<span class="manager-hall-no-data">FORM YOK</span>`;
      const badge = hallBadges(profile)[0];
      const opponents = publicFriendlyRows(hallRowsCache, career);
      const friendlyIndex = opponents.findIndex(item => friendlyKey(item) === profile.key);
      return `<article class="manager-hall-profile-card ${profile.self ? "is-self" : ""}" style="--profile-primary:${esc(profile.primary)};--profile-secondary:${esc(profile.secondary)}">
        <header><span>#${profile.rank} · ${esc(hallDivisionLabel(profile.division))}</span><b>${badge[0]}</b></header>
        <div class="manager-hall-profile-card-main">
          <div class="manager-hall-profile-card-mark">${esc(profile.shortName)}</div>
          <div><h3>${esc(profile.playerName)}</h3><p>${esc(profile.clubName)}</p><small>Sezon ${profile.season}${profile.matchday ? ` · Hafta ${profile.matchday}` : ""}</small></div>
          <aside><strong>${profile.hallIndex}</strong><span>INDEX</span></aside>
        </div>
        <div class="manager-hall-card-kpis">
          <span>ELO <b>${profile.elo}</b></span><span>IQ <b>${profile.iq}</b></span><span>RATING <b>${hallValue(profile.rating)}</b></span><span>CP <b>${profile.careerPoints}</b></span>
        </div>
        <div class="manager-hall-card-record">
          <span>O <b>${hallValue(profile.matches)}</b></span><span>G <b>${hallValue(profile.wins)}</b></span><span>B <b>${hallValue(profile.draws)}</b></span><span>M <b>${hallValue(profile.losses)}</b></span><span>WIN% <b>${hallValue(profile.winRate, "%")}</b></span>
        </div>
        <div class="manager-hall-card-form">${form}<small>${esc(profile.styleLabel || "STYLE DATA PENDING")}</small></div>
        <footer>
          <button class="btn btn-ghost" data-manager-action="hall-profile" data-hall-index="${profile.sourceIndex}">Detaylı Profil</button>
          ${career && !profile.self && friendlyIndex >= 0 ? `<button class="btn btn-gold" data-manager-action="friendly-challenge" data-friendly-index="${friendlyIndex}">Friendly</button>` : profile.self ? `<span class="manager-friendly-self">SENİN PROFİLİN</span>` : ""}
        </footer>
      </article>`;
    }).join("")}</div>`;
  }

  function renderHall(view) {
    ensureResources();
    refreshLeaderboard();
    const rows = remoteLeaderboard.length ? remoteLeaderboard : localLeaderboard();
    hallRowsCache = rows;
    const career = activeCareer();
    const profiles = rows.map((row, index) => normalizeHallProfile(row, index, career));
    const ranked = sortHallProfiles(profiles);
    const filtered = ranked.filter(profile => {
      const divisionMatch = hallDivisionMode === "all" || profile.division === hallDivisionMode;
      const term = hallSearchTerm.trim().toLocaleLowerCase("tr-TR");
      const searchMatch = !term || `${profile.playerName} ${profile.clubName} ${profile.shortName}`.toLocaleLowerCase("tr-TR").includes(term);
      return divisionMatch && searchMatch;
    });
    const avg = key => profiles.length ? Math.round(profiles.reduce((sum, profile) => sum + Number(profile[key] || 0), 0) / profiles.length) : 0;
    const totalTrophies = profiles.reduce((sum, profile) => sum + profile.trophies, 0);
    const totalMatches = profiles.reduce((sum, profile) => sum + Number(profile.matches || 0), 0);
    const sortLabels = {career_points:"Kariyer Puanı",elo:"ELO",iq:"Taktik IQ",rating:"Manager Rating",win_rate:"Galibiyet %",trophies:"Kupa",hall_index:"Hall Index"};
    const tableRows = filtered.map(profile => `<tr>
      <td><b>${profile.rank}</b></td>
      <td><button class="manager-hall-name-button" data-manager-action="hall-profile" data-hall-index="${profile.sourceIndex}"><strong>${esc(profile.playerName)}</strong><small>${esc(profile.clubName)}</small></button></td>
      <td>${esc(hallDivisionLabel(profile.division))}</td>
      <td>${profile.season}</td>
      <td>${hallValue(profile.matches)}</td>
      <td>${hallValue(profile.wins)}-${hallValue(profile.draws)}-${hallValue(profile.losses)}</td>
      <td>${hallValue(profile.goalsFor)}:${hallValue(profile.goalsAgainst)}</td>
      <td>${hallValue(profile.winRate, "%")}</td>
      <td><div class="manager-hall-table-form">${profile.form.length ? profile.form.map(hallResultBadge).join("") : "—"}</div></td>
      <td>${hallValue(profile.rating)}</td>
      <td>${profile.iq}</td>
      <td><b>${profile.elo}</b></td>
      <td>${profile.trophies}</td>
      <td><strong>${profile.careerPoints}</strong></td>
    </tr>`).join("");
    view.innerHTML = `
      <section class="manager-hall-hero manager-hall-hero-v2">
        <div><div class="eyebrow">GLOBAL MANAGER INTELLIGENCE</div><h2>The Manager Hall</h2><p>Public kariyer performansı, taktik kimlik, Manager DNA, başarı rozetleri, form, H2H ve Friendly Arena tek merkezde.</p></div>
        <div class="manager-hall-hero-stats">
          <article><strong>${profiles.length}</strong><span>MANAGER</span></article>
          <article><strong>${avg("elo")}</strong><span>ORT. ELO</span></article>
          <article><strong>${avg("iq")}</strong><span>ORT. IQ</span></article>
          <article><strong>${totalTrophies}</strong><span>KUPA</span></article>
          <article><strong>${totalMatches}</strong><span>PUBLIC MAÇ</span></article>
        </div>
      </section>
      ${renderHallPodium(sortHallProfiles([...profiles]))}
      <section class="manager-hall-controls">
        <div><span>SIRALAMA</span>${Object.entries(sortLabels).map(([key,label]) => `<button class="${hallSortMode === key ? "active" : ""}" data-manager-action="hall-sort" data-hall-sort="${key}">${label}</button>`).join("")}</div>
        <div><span>LİG</span>${[["all","Tümü"],["premier","Premier"],["championship","Championship"],["league-a","Lig A"]].map(([key,label]) => `<button class="${hallDivisionMode === key ? "active" : ""}" data-manager-action="hall-division" data-hall-division="${key}">${label}</button>`).join("")}</div>
        <div class="manager-hall-search-actions"><button data-manager-action="hall-search">Manager / Kulüp Ara</button>${hallSearchTerm ? `<button data-manager-action="hall-clear-search">“${esc(hallSearchTerm)}” Temizle</button>` : ""}</div>
      </section>
      <section class="manager-hall-intelligence">
        <div class="manager-panel-head"><div><span>MANAGER INTELLIGENCE CARDS</span><h3>${filtered.length} Public Profil</h3></div><em>${remoteLeaderboard.length ? "SUPABASE LIVE" : "LOCAL TEST"}</em></div>
        ${renderManagerIntelligenceCards(filtered, career)}
      </section>
      ${renderFriendlyArena(rows, career)}
      <section class="manager-hall-table manager-hall-table-v2">
        <div class="manager-panel-head"><div><span>ADVANCED LEADERBOARD</span><h3>Detaylı Kariyer Liderlik Tablosu</h3></div><em>${sortLabels[hallSortMode]}</em></div>
        ${filtered.length ? `<div class="manager-table-scroll"><table><thead><tr><th>#</th><th>Manager / Kulüp</th><th>Lig</th><th>S</th><th>O</th><th>G-B-M</th><th>GF:GA</th><th>Win%</th><th>Form</th><th>Rating</th><th>IQ</th><th>ELO</th><th>Kupa</th><th>CP</th></tr></thead><tbody>${tableRows}</tbody></table></div>` : `<div class="empty-state">Filtre sonucunda Manager bulunamadı.</div>`}
      </section>`;
  }

  async function handleSubmit(event) {
    if (!["managerCareerForm", "managerUnlockForm", "managerFriendlyForm"].includes(event.target.id)) return;
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const original = button.textContent;
    try {
      const data = new FormData(form);
      if (form.id === "managerFriendlyForm") {
        button.textContent = "Friendly hazırlanıyor...";
        const fixture = await createManagerHallFriendly(data);
        selectedFriendlyOpponent = null;
        ctx()?.closeModal?.();
        activeTab = "match";
        ctx()?.toast?.(`${fixture.friendlyOpponentClubName} ile Friendly Match hazır.`, "success");
        ctx()?.navigate?.("managerroom");
        return;
      }
      const pin = String(data.get("pin") || "");
      if (form.id === "managerCareerForm") {
        button.textContent = "Evren oluşturuluyor...";
        const career = createCareerPayload(data);
        ensureOrucCup(career);
        if (career.mode === "official") {
          const remoteId = await createRemoteCareer(career, pin);
          career.cloudCareerId = remoteId || null;
        }
        managerState.careers.push(career);
        managerState.activeCareerId = career.id;
        setSessionPin(career, pin);
        saveLocal();
        ctx()?.closeModal?.();
        ctx()?.toast?.(`${career.clubName} Championship evrenine katıldı.`, "success");
        activeTab = "draw";
      } else {
        button.textContent = "Kariyer doğrulanıyor...";
        const career = await unlockRemoteCareer(String(data.get("playerName") || ""), pin);
        ctx()?.closeModal?.();
        ctx()?.toast?.(`${career.clubName} buluttan açıldı.`, "success");
        activeTab = career.activeMatchFixtureId ? "match" : "overview";
      }
      ctx()?.refreshView?.();
    } catch (error) {
      ctx()?.toast?.(error.message, "error");
      button.disabled = false;
      button.textContent = original;
    }
  }

  function exitCareerToLanding() {
    const career = activeCareer();
    window.FIFA_MANAGER_MATCH?.stop?.();
    managerState.activeCareerId = null;
    activeTab = "overview";
    const saved = saveLocal();
    ctx()?.refreshView?.();
    ctx()?.toast?.(saved ? "Kariyer kaydedildi. Manager ana ekranındasın." : "Ana ekrana dönüldü; yerel kayıt alanı dolu olduğu için bulut kaydı deneniyor.", saved ? "success" : "warning");
    if (career) scheduleCloudSync(career, { reason: "exit", force: true }).catch(error => console.warn("Exit cloud sync failed", error));
    return true;
  }

  async function resolveSeasonGate(career,{silent=false}={}){
    if(!career)return {status:"NO_CAREER",simulated:0};
    const resolver=window.FIFA_MANAGER_MATCH?.resolvePendingUniverse;
    if(typeof resolver!=="function"){
      if(!silent)ctx()?.toast?.("Sezon ilerletme motoru yüklenemedi.","error");
      return {status:"ENGINE_MISSING",simulated:0};
    }

    const result=resolver(career,{maxBatches:128});
    advanceOrucCup(career);
    saveLocal();
    scheduleCloudSync(career,{reason:"season-gate-resolve",force:true}).catch(()=>{});

    const next=nextHumanFixture(career);
    const gate=seasonGateState(career);
    if(!silent){
      if(next){
        ctx()?.toast?.(
          next.competition==="oruc"
            ? "Kalan AI maçları tamamlandı. Sıradaki Oruç Reis Kupası maçın hazır."
            : "Sıradaki maçın hazır.",
          "success"
        );
      }else if(gate.seasonComplete){
        ctx()?.toast?.("Oruç Reis Kupası tamamlandı. Yeni sezon geçişi açıldı.","success");
      }else{
        ctx()?.toast?.("Kupa ilerletildi; kalan aşamalar kontrol ediliyor.","info");
      }
    }
    return {...result,nextFixtureId:next?.id||null,seasonComplete:gate.seasonComplete};
  }

  async function completeAndStartNewSeason(career){
    if(!career)return false;

    let gate=seasonGateState(career);
    if(!gate.seasonComplete&&!gate.pendingHuman.length){
      await resolveSeasonGate(career,{silent:true});
      gate=seasonGateState(career);
    }

    if(!gate.seasonComplete){
      activeTab=gate.humanCupFixture?"overview":"oruc";
      ctx()?.toast?.(
        gate.humanCupFixture
          ? "Yeni sezondan önce sıradaki Oruç Reis Kupası maçını tamamlamalısın."
          : "Yeni sezondan önce Oruç Reis Kupası tamamlanmalıdır.",
        "warning"
      );
      ctx()?.refreshView?.();
      return false;
    }

    const premierWinner=actor(career,sortedLeagueRows(career,"premier")[0]?.actorId);
    const championshipWinner=actor(career,sortedLeagueRows(career,"championship")[0]?.actorId);
    const leagueAWinner=actor(career,sortedLeagueRows(career,"league-a")[0]?.actorId);
    const managerOfYear=[...career.actors].sort((a,b)=>
      (b.managerRating||b.tacticalIQ||50)-(a.managerRating||a.tacticalIQ||50)||b.power-a.power
    )[0];

    career.seasonAwards||=[];
    career.seasonAwards.push({
      seasonNo:career.seasonNo,
      premier:premierWinner?.clubName,
      championship:championshipWinner?.clubName,
      leagueA:leagueAWinner?.clubName,
      oruc:actor(career,career.orucCup?.championId)?.clubName||null,
      managerOfYear:managerOfYear?.managerName,
      createdAt:now()
    });

    career.seasonArchive||=[];
    career.seasonArchive.push({
      seasonNo:career.seasonNo,
      fixtures:JSON.parse(JSON.stringify(career.fixtures)),
      orucCup:JSON.parse(JSON.stringify(career.orucCup||null)),
      endedAt:now()
    });

    career.seasonNo+=1;
    career.matchday=1;
    career.seasonDivisionMap=Object.fromEntries(career.actors.map(row=>[row.id,row.division]));
    career.fixtures=buildLeagueFixtures(career.actors);
    career.tables={
      premier:initialTable(career.actors.filter(row=>row.division==="premier")),
      championship:initialTable(career.actors.filter(row=>row.division==="championship")),
      "league-a":initialTable(career.actors.filter(row=>row.division==="league-a"))
    };
    career.fixtureIntegrity={
      version:FIXTURE_INTEGRITY_VERSION,
      checkedAt:now(),
      addedMissing:0,
      removedDuplicates:0,
      removedStale:0,
      leagueFixtures:career.fixtures.filter(fixture=>fixture.competition==="league").length
    };
    career.orucCup=null;
    ensureOrucCup(career);
    career.activeMatchFixtureId=null;
    career.status="team-draw-ready";

    saveLocal();
    scheduleCloudSync(career,{reason:"new-season",force:true}).catch(()=>{});
    ctx()?.toast?.(`Sezon ${career.seasonNo} başladı.`,"success");
    activeTab="overview";
    ctx()?.refreshView?.();
    return true;
  }

  async function handleClick(event) {
    const action = event.target.closest("[data-manager-action]");
    if (!action) return;
    const type = action.dataset.managerAction;
    if (type === "hall-profile") {
      const row = hallRowsCache[Number(action.dataset.hallIndex)];
      if (!row) { ctx()?.toast?.("Manager profili artık listede bulunamadı. Manager Hall'ı yenile.", "error"); return; }
      openHallProfile(row, Number(action.dataset.hallIndex));
      return;
    }
    if (type === "hall-sort") {
      hallSortMode = action.dataset.hallSort || "career_points";
      ctx()?.refreshView?.();
      return;
    }
    if (type === "hall-division") {
      hallDivisionMode = action.dataset.hallDivision || "all";
      ctx()?.refreshView?.();
      return;
    }
    if (type === "hall-search") {
      const value = window.prompt("Manager adı, kulüp adı veya kısa ad:", hallSearchTerm || "");
      if (value === null) return;
      hallSearchTerm = String(value).trim();
      ctx()?.refreshView?.();
      return;
    }
    if (type === "hall-clear-search") {
      hallSearchTerm = "";
      ctx()?.refreshView?.();
      return;
    }
    if (type === "friendly-open-career") { ctx()?.navigate?.("managerroom"); return; }
    if (type === "friendly-challenge") {
      const career = activeCareer();
      if (!career) { ctx()?.toast?.("Friendly Match için önce kariyerini açmalısın.", "warning"); ctx()?.navigate?.("managerroom"); return; }
      const rows = remoteLeaderboard.length ? remoteLeaderboard : localLeaderboard();
      const opponents = publicFriendlyRows(rows, career);
      const row = opponents[Number(action.dataset.friendlyIndex)];
      if (!row) { ctx()?.toast?.("Friendly rakibi artık listede bulunamadı. Manager Hall'ı yenile.", "error"); return; }
      openFriendlyModal(row);
      return;
    }
    if (type === "open-career") openCareerModal();
    if (type === "resume-career") { const career=managerState.careers.find(item=>item.id===action.dataset.careerId); if(!career)return; managerState.activeCareerId=career.id; activeTab=career.activeMatchFixtureId?"match":"overview"; saveLocal(); if(career.mode==="official"&&/^\d{6}$/.test(getSessionPin(career))) await syncOfficialCareer(career,{mode:"auto",silent:true}).catch(()=>{}); ctx()?.refreshView?.(); }
    if (type === "exit-career") { exitCareerToLanding(); return; }
    if (type === "sync-career") { const career=activeCareer(); if(!career)return; if(!/^\d{6}$/.test(getSessionPin(career))){ctx()?.toast?.("Bu cihazda önce Kariyerimi Aç üzerinden Manager PIN ile giriş yap.","warning");openUnlockModal();return;} await syncOfficialCareer(career,{mode:"auto",silent:false}).catch(error=>ctx()?.toast?.(error.message,"error"));ctx()?.refreshView?.(); }
    if (type === "pull-career") { const career=activeCareer(); if(!career||!window.confirm("Bu cihazdaki senkronize edilmemiş ilerleme silinip buluttaki kayıt yüklensin mi?"))return; await syncOfficialCareer(career,{mode:"pull",silent:false}).catch(error=>ctx()?.toast?.(error.message,"error"));ctx()?.refreshView?.(); }
    if (type === "push-career") { const career=activeCareer(); if(!career||!window.confirm("Bu cihazdaki ilerleme buluttaki daha yeni kaydın üzerine yazılsın mı?"))return; await syncOfficialCareer(career,{mode:"push",silent:false,overwriteRemote:true}).catch(error=>ctx()?.toast?.(error.message,"error"));ctx()?.refreshView?.(); }
    if (type === "open-unlock") openUnlockModal();
    if (type === "open-match") { activeTab = "match"; ctx()?.refreshView?.(); }
    if (type === "open-archive") { selectedArchiveFixtureId = action.dataset.fixtureId || null; activeTab = "archive"; ctx()?.refreshView?.(); }
    if (type === "fixture-matchday") { selectedFixtureMatchday=action.dataset.matchday||"all"; ctx()?.refreshView?.(); }
    if (type === "calendar-filter") { calendarFilter=action.dataset.filter||"all"; ctx()?.refreshView?.(); }
    if (type === "cup-round") { selectedCupRound=Number(action.dataset.round||1); ctx()?.refreshView?.(); }
    if(type==="save-slot"){const c=activeCareer(),slot=String(action.dataset.slot||1);if(c){managerState.saveSlots||={};managerState.saveSlots[c.id]||={};managerState.saveSlots[c.id][slot]={savedAt:now(),career:JSON.parse(JSON.stringify(c))};saveLocal();scheduleCloudSync(c,{reason:`slot-${slot}`});ctx()?.toast?.(`Kariyer S${slot} yuvasına kaydedildi.`,"success");}}
    if(type==="load-slot"){const c=activeCareer(),slot=String(action.dataset.slot||1),saved=c&&managerState.saveSlots?.[c.id]?.[slot];if(saved&&window.confirm(`S${slot} kaydı yüklensin mi? Mevcut ilerleme bu yuvaya dönmeden önce korunmaz.`)){const restored=migrateCareer(JSON.parse(JSON.stringify(saved.career)));const index=managerState.careers.findIndex(x=>x.id===c.id);managerState.careers[index]=restored;saveLocal();ctx()?.toast?.(`S${slot} kaydı yüklendi.`,"success");ctx()?.refreshView?.();}}
    if(type==="run-calibration"){const c=activeCareer();if(c&&window.FIFA_MANAGER_MATCH?.calibrate){c.calibrationReport=window.FIFA_MANAGER_MATCH.calibrate(c,10000);saveLocal();ctx()?.toast?.("10.000 maçlık kalibrasyon tamamlandı.","success");ctx()?.refreshView?.();}}
    if (type === "experience-level") { const c=activeCareer(); if(c){c.managerIdentity.level=action.dataset.level||"manager";saveLocal();ctx()?.refreshView?.();} }
    if (type === "toggle-sound") { const c=activeCareer(); if(c){c.managerIdentity.sound=!c.managerIdentity.sound;saveLocal();ctx()?.refreshView?.();} }
    if (type === "upgrade-skill") { const c=activeCareer(),key=action.dataset.skill;if(c&&key&&c.careerPoints>=100&&Number(c.managerIdentity.skills[key]||0)<5){c.careerPoints-=100;c.managerIdentity.skills[key]=Number(c.managerIdentity.skills[key]||0)+1;c.managerIdentity.reputation=Math.min(100,c.managerIdentity.reputation+2);saveLocal();ctx()?.toast?.("Manager yeteneği geliştirildi.","success");ctx()?.refreshView?.();} }
    if (type === "resolve-season-gate") { const c=activeCareer(); if(c){await resolveSeasonGate(c); activeTab=nextHumanFixture(c)?"overview":seasonGateState(c).seasonComplete?"overview":"oruc"; ctx()?.refreshView?.();} return; }
    if (type === "new-season") { const c=activeCareer(); if(c) await completeAndStartNewSeason(c); return; }
    if (type === "set-tab") {
      activeTab = action.dataset.tab || "overview";
      ctx()?.refreshView?.();
    }
    if (type === "pool-filter") {
      poolFilter = action.dataset.pool || "all";
      ctx()?.refreshView?.();
    }
    if (type === "draw-teams") {
      const career = activeCareer();
      const fixture = career ? nextHumanFixture(career) : null;
      if (!career || !fixture || drawAnimating) return;
      if (career.mode === "official" && !getSessionPin(career)) {
        ctx()?.toast?.("Resmî kura için kariyerini Manager PIN ile açmalısın.", "warning");
        openUnlockModal();
        return;
      }
      drawAnimating = true;
      ctx()?.refreshView?.();
      await new Promise(resolve => setTimeout(resolve, 1150));
      try {
        await executeTeamDraw(career, fixture);
        ctx()?.toast?.("Takım kurası tamamlandı ve maç kartına işlendi.", "success");
      } catch (error) {
        ctx()?.toast?.(error.message, "error");
      } finally {
        drawAnimating = false;
        ctx()?.refreshView?.();
      }
    }
  }

  async function pollCloudCareer() {
    const career = activeCareer();
    if (!career || career.mode !== "official" || !career.cloudCareerId || !/^\d{6}$/.test(getSessionPin(career))) return;
    if (document.visibilityState === "hidden" || cloudPollInFlight || dirtyCareerIds.has(career.id)) return;
    if (Date.now() - lastCloudPollAt < CLOUD_POLL_INTERVAL_MS) return;
    cloudPollInFlight = true;
    lastCloudPollAt = Date.now();
    try {
      const previousId = career.id;
      const current = await syncOfficialCareer(career, { mode:"auto", silent:true });
      if (current?.id !== previousId || careerTimestamp(current) > careerTimestamp(career)) ctx()?.refreshView?.();
    } finally {
      cloudPollInFlight = false;
    }
  }

  document.addEventListener("visibilitychange", () => {
    const career = activeCareer();
    if (!career) return;
    if (document.visibilityState === "hidden") scheduleCloudSync(career, { reason:"background", force:true }).catch(()=>{});
    else pollCloudCareer().catch(()=>{});
  });
  window.addEventListener("pagehide", () => {
    const career = activeCareer();
    if (career) scheduleCloudSync(career, { reason:"pagehide", force:true }).catch(()=>{});
  });
  window.setInterval(() => pollCloudCareer().catch(()=>{}), CLOUD_POLL_INTERVAL_MS);

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);

  window.FIFA_MANAGER_ROOM = {
    render,
    renderHall,
    refreshLeaderboard,
    ensureResources,
    version: VERSION,
    getActiveCareer: activeCareer,
    getActor: actor,
    getNextHumanFixture: nextHumanFixture,
    getTeamCatalog: () => teamCatalog,
    getTeamById: teamById,
    getTeamForActor: teamForActor,
    getBootstrap: () => bootstrap,
    persistCareer,
    saveLocal,
    scheduleCloudSync,
    syncOfficialCareer,
    exitCareerToLanding,
    getManagerState: () => managerState,
    getFriendlyRows: () => publicFriendlyRows(remoteLeaderboard.length ? remoteLeaderboard : localLeaderboard(), activeCareer()),
    getFriendlyHistory: career => (career || activeCareer())?.friendlyHistory || [],
    scheduleCloudSync,
    syncOfficialCareer,
    compactCareerSnapshot,
    setActiveTab: tab => { activeTab = tab || "overview"; ctx()?.refreshView?.(); },
    refresh: () => ctx()?.refreshView?.(),
    starText,
    powerLabel
    ,
    ensureOrucCup,
    advanceOrucCup,
    seasonGateState,
    resolveSeasonGate,
    completeAndStartNewSeason,
    __diagnostics:{
      roundRobin,assignThreeLeagueDivisions,buildLeagueFixtures,inferSeasonDivisionMap,
      rebuildThreeLeagueTables,repairLeagueSchedule,ensureThreeLeagueUniverse,
      ensureOrucCup,advanceOrucCup,seasonGateState,qualifiedManagerCupEntrants,
      createManagerOrucCupV5
    }
  };
})();
