(() => {
  "use strict";

  const T = () => window.F1_TRACKS;
  const TAU = Math.PI * 2;
  const normalizeAngle = angle => {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = (value, length) => ((value % length) + length) % length;

  const CAR_COLORS = [
    "#f7c85c", "#ef4444", "#38bdf8", "#22c55e", "#a78bfa", "#f97316",
    "#e879f9", "#14b8a6", "#f43f5e", "#84cc16", "#60a5fa", "#facc15",
    "#fb7185", "#2dd4bf", "#c084fc", "#f59e0b", "#4ade80", "#818cf8",
    "#f472b6", "#06b6d4", "#a3e635", "#f87171", "#67e8f9", "#d8b4fe"
  ];

  // FIFA Tournament Hub all-time roster: the human driver plus 23 AI rivals.
  const AI_NAMES = [
    "Kerim Özmen", "Ercan Köseoğlu", "Sultan Atasaral", "Oğuzhan Dindar",
    "Ersin Darıcı", "Fırat Berk", "Aziz Sarıoğlu", "Sergei Smirnov",
    "Denar Batuhan", "Emre Çınar", "Asen Sabuncu", "Soyhan Belen",
    "Emre Babaoğlu", "Emrullah Gök", "Abdülkadir Yıldız", "Samet Nemli",
    "Denar Mehmet", "Şafak Denar", "Ömer Gülhaş", "Affan Volkan Akbal",
    "Mohd Khairull Muzammil Bin Ramly", "Denar Ilia Zelentsov", "Denar Aleksandr Shulev"
  ];

  // Static ability profiles are derived from the tournament universe's historical/current strength data.
  // They never read the human player's pace or race position, so no rubber-band behaviour is introduced.
  const AI_PROFILE_OFFSETS = [
     .055, .014, .034, .036, .004, .031, -.003, -.008,
     .052, -.004, -.014, -.016, -.015, -.017, -.015, -.022,
    -.006, -.040, -.042, .030, .006, -.005, -.019
  ];
  const AI_CONSISTENCY = [
    1.026,1.012,1.018,1.020,1.002,1.016,1.006,.998,
    1.024,1.004,.994,.992,.995,.991,.996,.988,
    1.000,.982,.980,1.015,1.005,1.001,.989
  ];

  const COMPOUNDS = Object.freeze({
    soft:{ id:"soft", label:"SOFT", color:"#ef4444", pace:1.025, wear:1.34, dryGrip:1.02, wetGrip:.58 },
    medium:{ id:"medium", label:"MEDIUM", color:"#f4c75e", pace:1.0, wear:1.0, dryGrip:1.0, wetGrip:.62 },
    hard:{ id:"hard", label:"HARD", color:"#e7eef2", pace:.982, wear:.76, dryGrip:.985, wetGrip:.65 },
    intermediate:{ id:"intermediate", label:"INTER", color:"#55e29d", pace:.94, wear:1.08, dryGrip:.79, wetGrip:1.04 },
    wet:{ id:"wet", label:"WET", color:"#38bdf8", pace:.90, wear:.88, dryGrip:.68, wetGrip:1.10 }
  });

  function compound(id) {
    return COMPOUNDS[id] || COMPOUNDS.medium;
  }

  function seededNumber(seed) {
    let value = 2166136261;
    const text = String(seed || "F1");
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return () => {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ result >>> 15, result | 1);
      result ^= result + Math.imul(result ^ result >>> 7, result | 61);
      return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
  }

  class FormulaRaceEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha:false });
      this.options = options;
      this.performanceMode = options.performanceMode || "auto";
      this.performance = this.resolvePerformanceProfile(this.performanceMode);
      this.trackId = options.trackId || "oruc-reis";
      this.lapsTarget = Number(options.laps || 5);
      this.difficulty = options.difficulty || "standard";
      this.playerName = options.playerName || "Player";
      this.mode = options.mode || "race";
      this.gridOrder = Array.isArray(options.gridOrder) ? options.gridOrder : [];
      this.driverAttributes = {
        pace:60, racecraft:60, tyreManagement:60, wetSkill:60, consistency:60,
        ...(options.driverAttributes || {})
      };
      this.carDevelopment = {
        power:60, aero:60, tyre:60, pitCrew:60, reliability:60,
        ...(options.carDevelopment || {})
      };
      this.mastery = Number(options.mastery || 0);
      this.startingCompound = options.startingCompound || "medium";
      this.nextPitCompound = options.pitCompound || "hard";
      this.weatherMode = options.weather || "dynamic";
      this.weatherSeed = options.weatherSeed || `${this.trackId}|${this.lapsTarget}|${Date.now()}`;
      this.weatherRandom = seededNumber(this.weatherSeed);
      this.weather = {
        mode:this.resolveWeatherMode(),
        wetness:0,
        rain:0,
        label:"DRY",
        changed:false
      };
      this.trackEvolution = {
        rubber:.10,
        grip:1.0,
        trend:"BUILDING"
      };
      this.incidentLevel = options.incidentLevel || "realistic";
      this.drivingMode = options.drivingMode || "balanced";
      this.raceRandom = seededNumber(`${this.weatherSeed}|RACE-CONTROL`);
      this.raceControl = {
        status:"GREEN",
        reason:"Track clear",
        timer:0,
        phase:"racing",
        incidents:0,
        lastChangeAt:0
      };
      this.incidentCheckTimer = 2.8;
      this.incidentCooldown = 0;
      this.greenFlagSeconds = 0;
      this.raceability = this.createRaceabilityPolicy();
      this.running = false;
      this.paused = false;
      this.finished = false;
      this.startedAt = 0;
      this.lastFrame = 0;
      this.raf = 0;
      this.lastUiTick = 0;
      this.lastDrawAt = 0;
      this.lastStandingsAt = 0;
      this.cachedStandings = null;
      this.frameCounter = 0;
      this.staticTrackLayer = null;
      this.staticTrackKey = "";
      this.cars = [];
      this.keys = Object.create(null);
      this.mobile = { left:false, right:false, throttle:false, brake:false, boost:false, drs:false, pit:false };
      this.stats = {
        collisions:0, offTrackSeconds:0, overtakes:0, clean:true,
        pitStops:0, drsSeconds:0, rainSeconds:0, tyreWarnings:0,
        trackLimitWarnings:0, penaltySeconds:0, safetyCars:0, virtualSafetyCars:0,
        localYellows:0, raceControlDowngrades:0, greenFlagSeconds:0,
        damageTaken:0, punctures:0, retirements:0
      };
      this.lastPlayerRank = 24;
      this.countdown = 3.4;
      this.lastEventAt = 0;
      this.resizeObserver = typeof ResizeObserver === "function"
        ? new ResizeObserver(() => this.resize())
        : null;
      this.resizeObserver?.observe(canvas.parentElement || canvas);
      this.boundResize = () => this.resize();
      if (!this.resizeObserver) window.addEventListener("resize", this.boundResize);
      this.boundKeyDown = event => this.onKey(event, true);
      this.boundKeyUp = event => this.onKey(event, false);
      window.addEventListener("keydown", this.boundKeyDown, { passive:false });
      window.addEventListener("keyup", this.boundKeyUp, { passive:false });
      this.resize();
    }

    resolvePerformanceProfile(mode = "auto") {
      const coarse = typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches;
      const cores = Number(navigator.hardwareConcurrency || 4);
      const memory = Number(navigator.deviceMemory || 4);
      let resolved = mode;
      if (resolved === "auto") resolved = coarse || cores <= 4 || memory <= 4 ? "performance" : "balanced";
      const profiles = {
        quality:{ mode:"quality", dpr:Math.min(2, window.devicePixelRatio || 1), targetFps:60, uiInterval:105, timingInterval:240, intelligenceInterval:250, rainFactor:1, collisionEvery:1 },
        balanced:{ mode:"balanced", dpr:Math.min(1.35, window.devicePixelRatio || 1), targetFps:60, uiInterval:130, timingInterval:280, intelligenceInterval:310, rainFactor:.62, collisionEvery:1 },
        performance:{ mode:"performance", dpr:1, targetFps:50, uiInterval:180, timingInterval:360, intelligenceInterval:420, rainFactor:.32, collisionEvery:2 }
      };
      return profiles[resolved] || profiles.balanced;
    }

    refreshStaticTrackLayer(force = false) {
      if (!this.track || !this.width || !this.height) return;
      const wetBucket = Math.round(Number(this.weather?.wetness || 0) * 5) / 5;
      const key = `${this.trackId}|${this.width}|${this.height}|${this.performance.dpr}|${wetBucket}`;
      if (!force && this.staticTrackLayer && this.staticTrackKey === key) return;
      const layer = this.staticTrackLayer || document.createElement("canvas");
      const dpr = this.performance.dpr;
      layer.width = Math.round(this.width * dpr);
      layer.height = Math.round(this.height * dpr);
      const layerCtx = layer.getContext("2d", { alpha:false });
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layerCtx.clearRect(0, 0, this.width, this.height);
      this.drawTrack(layerCtx);
      this.staticTrackLayer = layer;
      this.staticTrackKey = key;
    }

    resolveWeatherMode() {
      if (["dry","mixed","wet"].includes(this.weatherMode)) return this.weatherMode;
      const track = T().getTrack(this.trackId);
      const roll = this.weatherRandom() * 100;
      if (roll < Number(track.rainChance || 20) * .35) return "wet";
      if (roll < Number(track.rainChance || 20)) return "mixed";
      return "dry";
    }


    createRaceabilityPolicy() {
      const level = this.incidentLevel || "realistic";
      const shortRace = this.lapsTarget <= 3;
      const mediumRace = this.lapsTarget <= 7;
      const presets = {
        off:{
          safetyCarMax:0, vscMax:0, randomFactor:0,
          startProtection:999, restartProtection:999, finalProtection:.0
        },
        low:{
          safetyCarMax:0, vscMax:1, randomFactor:.28,
          startProtection:24, restartProtection:24, finalProtection:.72
        },
        realistic:{
          safetyCarMax:1, vscMax:shortRace ? 1 : 2, randomFactor:.72,
          startProtection:18, restartProtection:20, finalProtection:shortRace ? .66 : .82
        },
        high:{
          safetyCarMax:mediumRace ? 1 : 2, vscMax:mediumRace ? 2 : 3, randomFactor:1.25,
          startProtection:14, restartProtection:16, finalProtection:.88
        }
      };
      const selected = presets[level] || presets.realistic;
      return {
        ...selected,
        safetyCarDeployments:0,
        vscDeployments:0,
        denied:0,
        downgraded:0,
        restartGuard:0,
        lastGreenAt:0
      };
    }

    raceElapsedSeconds(now = performance.now()) {
      if (!this.startedAt) return 0;
      return Math.max(0, (now - this.startedAt) / 1000 - 3.4);
    }

    leaderProgressRatio() {
      if (!this.track?.path?.length || !this.cars.length) return 0;
      const leader = this.cars
        .filter(car => !car.retired)
        .reduce((best, car) => !best || car.totalProgress > best.totalProgress ? car : best, null);
      if (!leader) return 0;
      return clamp(leader.totalProgress / (this.track.path.length * this.lapsTarget), 0, 1);
    }

    raceControlDecision(requestedStatus, metadata = {}) {
      let status = requestedStatus;
      const elapsed = this.raceElapsedSeconds();
      const progress = this.leaderProgressRatio();
      const emergency = Boolean(metadata.emergency);
      const policy = this.raceability;

      if (this.incidentLevel === "off") {
        return { status:"YELLOW", downgraded:requestedStatus !== "YELLOW", reason:"Race First mode" };
      }

      const startProtected = elapsed < policy.startProtection || progress < .10;
      const restartProtected = policy.restartGuard > 0 || this.greenFlagSeconds < Math.min(12, policy.restartProtection);
      const finalProtected = progress >= policy.finalProtection;

      if (status === "SAFETY CAR") {
        const capReached = policy.safetyCarDeployments >= policy.safetyCarMax;
        if (capReached || startProtected || restartProtected || finalProtected || !emergency) {
          status = policy.vscDeployments < policy.vscMax && !finalProtected ? "VSC" : "YELLOW";
          return {
            status,
            downgraded:true,
            reason:capReached ? "Safety Car race limit reached"
              : startProtected ? "Opening phase protected"
              : restartProtected ? "Green-flag racing window protected"
              : finalProtected ? "Final-race protection"
              : "Incident does not require full Safety Car"
          };
        }
      }

      if (status === "VSC") {
        const capReached = policy.vscDeployments >= policy.vscMax;
        if (capReached || startProtected || restartProtected || finalProtected) {
          return {
            status:"YELLOW",
            downgraded:true,
            reason:capReached ? "VSC race limit reached"
              : startProtected ? "Opening phase protected"
              : restartProtected ? "Green-flag racing window protected"
              : "Final-race protection"
          };
        }
      }

      return { status, downgraded:false, reason:"Approved" };
    }

    resize() {
      const parent = this.canvas.parentElement;
      const rect = parent?.getBoundingClientRect?.() || { width:window.innerWidth, height:window.innerHeight };
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(360, Math.round(rect.height));
      const dpr = this.performance.dpr;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.dpr = dpr;
      this.width = width;
      this.height = height;
      this.track = T().buildTrack(this.trackId, width, height);
      if (this.cars.length) this.reprojectCars();
      this.staticTrackKey = "";
      this.refreshStaticTrackLayer(true);
      this.draw();
    }

    reprojectCars() {
      this.cars.forEach(car => {
        const index = wrap(Math.round(car.progressIndex || 0), this.track.path.length);
        const point = this.track.path[index];
        car.x = point.x;
        car.y = point.y;
      });
    }

    onKey(event, pressed) {
      const key = event.key.toLowerCase();
      const controlled = ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","r","p","shift","escape","1","2","3"];
      if (controlled.includes(key) && this.running) event.preventDefault();
      if (key === "escape" && pressed && this.running) this.togglePause();
      if (key === "r" && pressed && this.running) this.resetPlayer();
      if (key === "p" && pressed && this.running) this.requestPit();
      if (pressed && key === "1") this.setDrivingMode("conserve");
      if (pressed && key === "2") this.setDrivingMode("balanced");
      if (pressed && key === "3") this.setDrivingMode("attack");
      this.keys[key] = pressed;
    }

    setMobileControl(control, active) {
      if (!(control in this.mobile)) return;
      this.mobile[control] = active;
      if (control === "pit" && active) this.requestPit();
    }

    setPitCompound(id) {
      if (COMPOUNDS[id]) this.nextPitCompound = id;
    }

    setDrivingMode(mode) {
      if (!["conserve","balanced","attack"].includes(mode)) return false;
      if (this.drivingMode === mode) return true;
      this.drivingMode = mode;
      const labels = { conserve:"CONSERVE", balanced:"BALANCED", attack:"ATTACK" };
      const messages = {
        conserve:"Lastik ve ERS korunuyor. Tempo kontrollü.",
        balanced:"Standart yarış temposuna dönüldü.",
        attack:"Maksimum tempo. Lastik ve motor yükü artacak."
      };
      this.emitEvent("DRIVE MODE", `${labels[mode]} · ${messages[mode]}`);
      return true;
    }

    requestPit(compoundId = this.nextPitCompound) {
      const player = this.cars[0];
      if (!player || player.finished || player.pitTimer > 0) return false;
      this.setPitCompound(compoundId);
      player.pitRequested = true;
      player.nextCompound = this.nextPitCompound;
      this.emitEvent("PIT REQUEST", `${compound(player.nextCompound).label} lastiği hazır. Tur sonunda pit-stop.`);
      return true;
    }

    emitEvent(title, text) {
      const now = performance.now();
      if (now - this.lastEventAt < 350 && title !== "PIT STOP") return;
      this.lastEventAt = now;
      this.options.onEvent?.({ title, text, at:now });
    }

    gridPosition(id, fallback) {
      const position = this.gridOrder.indexOf(id);
      return position >= 0 ? position : fallback;
    }

    aiProfile(index, difficultyFactor) {
      const slot = Math.max(0, index - 1);
      const skillSpread = Number(AI_PROFILE_OFFSETS[slot] ?? 0);
      const consistencySpread = Number(AI_CONSISTENCY[slot] ?? 1);
      return {
        pace: clamp(difficultyFactor + skillSpread, .84, 1.10),
        consistency: consistencySpread,
        lane: ((index % 5) - 2) * .11,
        attackBias: .30 + ((index * 7) % 7) * .075
      };
    }

    activeCarAhead(car, distanceWindow = 46) {
      let nearest = null;
      let bestDelta = Infinity;
      for (const rival of this.cars) {
        if (rival === car || rival.retired || rival.finished || rival.pitTimer > 0 || rival.parcFerme) continue;
        const delta = rival.totalProgress - car.totalProgress;
        if (delta > 0 && delta < distanceWindow && delta < bestDelta) {
          bestDelta = delta;
          nearest = rival;
        }
      }
      return nearest ? { car:nearest, delta:bestDelta } : null;
    }

    timingGap(progressDelta) {
      if (!Number.isFinite(progressDelta) || progressDelta <= 0) return 0;
      const lapSamples = Math.max(1, this.track.path.length);
      const lapSeconds = Number(this.track.baseLapSeconds || 72);
      return progressDelta / lapSamples * lapSeconds;
    }

    timingRows(standings = this.standings()) {
      const leader = standings.find(car => !car.retired) || standings[0];
      return standings.map((car, index) => {
        const ahead = index > 0 ? standings[index - 1] : null;
        let gapToLeader = null;
        let interval = null;
        let status = "RACING";
        if (car.retired) status = "DNF";
        else if (car.pitTimer > 0) status = "PIT";
        else if (car.finished) status = "FIN";
        if (index === 0) {
          gapToLeader = 0;
          interval = 0;
        } else if (leader?.finished && car.finished && Number.isFinite(leader.finishTime) && Number.isFinite(car.finishTime)) {
          gapToLeader = Math.max(0, car.finishTime - leader.finishTime);
          interval = ahead?.finished && Number.isFinite(ahead.finishTime) ? Math.max(0, car.finishTime - ahead.finishTime) : gapToLeader;
        } else {
          const leaderDelta = Math.max(0, Number(leader?.totalProgress || 0) - Number(car.totalProgress || 0));
          const aheadDelta = Math.max(0, Number(ahead?.totalProgress || 0) - Number(car.totalProgress || 0));
          const lapSamples = Math.max(1, this.track.path.length);
          if (leaderDelta >= lapSamples) gapToLeader = { laps:Math.floor(leaderDelta / lapSamples) };
          else gapToLeader = this.timingGap(leaderDelta);
          if (aheadDelta >= lapSamples) interval = { laps:Math.floor(aheadDelta / lapSamples) };
          else interval = this.timingGap(aheadDelta);
        }
        return { car, position:index + 1, gapToLeader, interval, status };
      });
    }

    createCars() {
      const path = this.track.path;
      const spacing = Math.max(7, Math.round(path.length / 92));
      const difficultyFactor = { rookie:.91, standard:.985, elite:1.045 }[this.difficulty] || .985;
      const paceBonus = (Number(this.driverAttributes.pace || 60) - 60) * .55;
      const powerBonus = (Number(this.carDevelopment.power || 60) - 60) * .46;
      const aeroBonus = (Number(this.carDevelopment.aero || 60) - 60) * .004;
      const masteryBonus = Math.min(4, this.mastery * .035);
      const ids = ["player", ...AI_NAMES.map((_, index) => `ai-${index + 1}`)];

      this.cars = ids.map((id, index) => {
        const grid = this.gridPosition(id, index);
        const gridRow = Math.floor(grid / 2);
        const gridLane = grid % 2 === 0 ? -.16 : .16;
        const offset = gridRow * spacing + (grid % 2) * .04;
        const pathIndex = wrap(Math.round(-offset), path.length);
        const point = path[pathIndex];
        const next = path[wrap(pathIndex + 3, path.length)];
        const tangent = Math.atan2(next.y - point.y, next.x - point.x);
        const lanePixels = gridLane * this.track.roadWidth;
        const startX = point.x + Math.cos(tangent + Math.PI / 2) * lanePixels;
        const startY = point.y + Math.sin(tangent + Math.PI / 2) * lanePixels;
        const isPlayer = id === "player";
        const aiVariation = ((index * 17) % 11) / 100;
        const aiProfile = isPlayer ? null : this.aiProfile(index, difficultyFactor);
        const initialCompound = isPlayer
          ? this.startingCompound
          : (this.weather.mode === "wet" ? "wet" : this.weather.mode === "mixed" && index % 3 === 0 ? "intermediate" : ["soft","medium","hard"][index % 3]);
        return {
          id,
          name:isPlayer ? this.playerName : AI_NAMES[index - 1],
          color:CAR_COLORS[index % CAR_COLORS.length],
          isPlayer,
          gridPosition:grid + 1,
          x:startX,
          y:startY,
          angle:tangent,
          speed:0,
          baseMaxSpeed:isPlayer ? 293 + paceBonus + powerBonus + masteryBonus : (289 + ((index * 7) % 10)) * aiProfile.pace,
          maxSpeed:isPlayer ? 293 + paceBonus + powerBonus + masteryBonus : (289 + ((index * 7) % 10)) * aiProfile.pace,
          accel:isPlayer ? 178 + (Number(this.driverAttributes.racecraft || 60) - 60) * .7 : (171 + (index % 4) * 2.3) * aiProfile.pace,
          brake:235,
          steer:0,
          throttle:0,
          brakeInput:0,
          progressIndex:pathIndex,
          lastIndex:pathIndex,
          totalProgress:-offset - (grid % 2) * .025,
          completedLaps:0,
          finished:false,
          finishTime:null,
          ers:100,
          boost:false,
          drs:false,
          drsAvailable:false,
          offRoad:false,
          nearestDistance:0,
          aiSkill:isPlayer ? 1 : aiProfile.pace,
          aiAero:isPlayer ? 1 + aeroBonus : .99 + aiVariation * .28,
          aiConsistency:isPlayer ? 1 : aiProfile.consistency,
          gridLane,
          aiLaneOffset:gridLane,
          aiTargetLane:gridLane,
          aiAttackBias:isPlayer ? 0 : aiProfile.attackBias,
          aiDecisionTimer:isPlayer ? 0 : .2 + index * .04,
          lapStartedAt:0,
          bestLap:null,
          lastLap:null,
          lapTimes:[],
          currentSector:3,
          sectorStarted:false,
          sectorStartedAt:0,
          currentLapSectors:[null,null,null],
          lastLapSectors:[null,null,null],
          bestSectors:[null,null,null],
          lastSector:null,
          liveLapDelta:null,
          tyreCompound:initialCompound,
          tyreWear:0,
          pitRequested:false,
          nextCompound:isPlayer ? this.nextPitCompound : "hard",
          pitTimer:0,
          pitStops:0,
          lastCompletedLap:0,
          damage:{ frontWing:100, floor:100, engine:100 },
          puncture:false,
          retired:false,
          retirementReason:"",
          retirementCleanupTimer:0,
          collisionCooldown:0,
          offTrackContinuous:0,
          trackLimitThreshold:3,
          penaltySeconds:0,
          smokePhase:index * .7,
          finishExitTimer:0,
          parcFerme:false
        };
      });
      this.lastPlayerRank = this.gridPosition("player", 23) + 1;
    }

    start() {
      this.createCars();
      this.running = true;
      this.paused = false;
      this.finished = false;
      this.startedAt = performance.now();
      this.lastFrame = this.startedAt;
      this.countdown = 3.4;
      this.raceControl = {
        status:"GREEN", reason:"Track clear", timer:0, phase:"racing", incidents:0,
        lastChangeAt:this.startedAt, safetyCarDeployments:0, vscDeployments:0
      };
      this.incidentCheckTimer = 2.8;
      this.incidentCooldown = 0;
      this.greenFlagSeconds = 0;
      this.raceability = this.createRaceabilityPolicy();
      this.emitEvent("RACE START", `${this.track.name} · ${this.weather.mode.toUpperCase()} koşullar`);
      this.emitEvent("TEAM RADIO", "Race mode BALANCED. Build temperature and protect the front wing.");
      this.loop(this.lastFrame);
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.resizeObserver?.disconnect();
      window.removeEventListener("resize", this.boundResize);
      window.removeEventListener("keydown", this.boundKeyDown);
      window.removeEventListener("keyup", this.boundKeyUp);
    }

    togglePause(force) {
      if (!this.running || this.finished) return;
      this.paused = typeof force === "boolean" ? force : !this.paused;
      this.options.onPause?.(this.paused);
    }

    resetPlayer() {
      const car = this.cars[0];
      if (!car) return;
      const index = wrap(car.progressIndex, this.track.path.length);
      const point = this.track.path[index];
      const next = this.track.path[wrap(index + 4, this.track.path.length)];
      car.x = point.x;
      car.y = point.y;
      car.angle = Math.atan2(next.y - point.y, next.x - point.x);
      car.speed *= .35;
      this.emitEvent("RESET", "Araç güvenli yarış çizgisine döndürüldü.");
    }

    nearestIndex(car) {
      const path = this.track.path;
      const count = path.length;
      const center = Number.isFinite(car.progressIndex) ? car.progressIndex : 0;
      const radius = Math.max(38, Math.round(count / 13));
      let bestIndex = center;
      let bestDistance = Infinity;
      for (let delta = -radius; delta <= radius; delta += 1) {
        const index = wrap(center + delta, count);
        const point = path[index];
        const dx = point.x - car.x;
        const dy = point.y - car.y;
        const distance = dx*dx + dy*dy;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      car.nearestDistance = Math.sqrt(bestDistance);
      return bestIndex;
    }

    startPitStop(car) {
      const pitCrew = car.isPlayer ? Number(this.carDevelopment.pitCrew || 60) : 58 + (Number(car.id.split("-")[1] || 1) % 6) * 3;
      const baseLoss = Number(this.track.pitLoss || 3.2);
      car.pitTimer = clamp(baseLoss - (pitCrew - 60) * .018, 2.35, 4.2);
      car.speed = 0;
      car.pitRequested = false;
      car.tyreCompound = car.nextCompound || this.nextPitCompound || "hard";
      car.tyreWear = 0;
      car.puncture = false;
      let repairTime = 0;
      const repairs = [];
      if (car.damage.frontWing < 92) {
        repairTime += 1.35;
        car.damage.frontWing = 100;
        repairs.push("front wing");
      }
      if (car.damage.floor < 78) {
        repairTime += .65;
        car.damage.floor = Math.min(100, car.damage.floor + 18);
        repairs.push("floor");
      }
      car.pitTimer += repairTime;
      car.pitStops += 1;
      if (car.isPlayer) {
        this.stats.pitStops += 1;
        const repairText = repairs.length ? ` · ${repairs.join(" + ")} repaired` : "";
        this.emitEvent("PIT STOP", `${compound(car.tyreCompound).label} takıldı${repairText} · ${car.pitTimer.toFixed(1)} sn`);
      }
    }

    updateProgress(car, now) {
      const count = this.track.path.length;
      const index = Number.isFinite(car.aiAnchorIndex) ? car.aiAnchorIndex : this.nearestIndex(car);
      car.aiAnchorIndex = null;
      let delta = index - car.lastIndex;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      if (Math.abs(delta) < count / 7 && car.nearestDistance < this.track.roadWidth * 1.8) car.totalProgress += delta;
      car.progressIndex = index;
      car.lastIndex = index;

      const lapPosition = wrap(car.totalProgress, count) / count;
      const sector = Math.min(3, Math.floor(lapPosition * 3) + 1);
      if (!car.sectorStarted) {
        if (sector === 1 && this.countdown <= 0) {
          car.sectorStarted = true;
          car.currentSector = 1;
          car.sectorStartedAt = now;
        } else {
          car.currentSector = sector;
        }
      } else if (sector !== car.currentSector && this.countdown <= 0) {
        const completedSector = car.currentSector;
        const sectorTime = Math.max(0, (now - (car.sectorStartedAt || now)) / 1000);
        if (sectorTime > .45 && sectorTime < 180) {
          car.currentLapSectors[completedSector - 1] = sectorTime;
          car.lastSector = { sector:completedSector, time:sectorTime };
          const best = car.bestSectors[completedSector - 1];
          car.bestSectors[completedSector - 1] = best === null ? sectorTime : Math.min(best, sectorTime);
          if (car.isPlayer) this.emitEvent(`SECTOR ${completedSector}`, `${sectorTime.toFixed(3)} sn`);
        }
        if (completedSector === 3 && sector === 1) {
          car.lastLapSectors = [...car.currentLapSectors];
          car.currentLapSectors = [null,null,null];
        }
        car.currentSector = sector;
        car.sectorStartedAt = now;
      }

      const completed = Math.max(0, Math.floor(car.totalProgress / count));
      if (completed > car.completedLaps) {
        const lapTime = (now - (car.lapStartedAt || this.startedAt)) / 1000;
        if (lapTime > 8) {
          car.lastLap = lapTime;
          car.lapTimes.push(lapTime);
          car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
        }
        car.lapStartedAt = now;
        car.completedLaps = completed;
        car.lastCompletedLap = completed;
        if (car.pitRequested && completed < this.lapsTarget) this.startPitStop(car);
      }

      const currentLapElapsed = Math.max(0, (now - (car.lapStartedAt || this.startedAt)) / 1000);
      car.liveLapDelta = car.bestLap && lapPosition > .025
        ? currentLapElapsed - car.bestLap * lapPosition
        : null;

      if (!car.finished && car.completedLaps >= this.lapsTarget) {
        car.finished = true;
        car.finishTime = (now - this.startedAt) / 1000;
        car.finishExitTimer = car.isPlayer ? 0 : 2.4;
        car.speed *= car.isPlayer ? .7 : .84;
      }
    }

    progressRatio() {
      const player = this.cars[0];
      if (!player || !this.track?.path?.length) return 0;
      return clamp(player.totalProgress / (this.track.path.length * this.lapsTarget), 0, 1);
    }

    raceControlFactor() {
      if (this.raceControl.status === "SAFETY CAR") return .46;
      if (this.raceControl.status === "VSC") return .62;
      if (this.raceControl.status === "YELLOW") return .76;
      return 1;
    }

    triggerRaceControl(status, reason, duration, metadata = {}) {
      const priority = { GREEN:0, YELLOW:1, VSC:2, "SAFETY CAR":3 };
      const decision = this.raceControlDecision(status, metadata);
      const approvedStatus = decision.status;

      if ((priority[approvedStatus] || 0) < (priority[this.raceControl.status] || 0) && this.raceControl.timer > 2) return false;
      if (approvedStatus === this.raceControl.status && this.raceControl.timer > 1.5) return false;

      if (decision.downgraded) {
        this.raceability.downgraded += 1;
        this.stats.raceControlDowngrades += 1;
        this.emitEvent("RACEABILITY GUARD", `${status} request reduced to ${approvedStatus} · ${decision.reason}.`);
      }

      this.raceControl.status = approvedStatus;
      this.raceControl.reason = reason || "Incident";
      const minimumDuration = approvedStatus === "SAFETY CAR" ? 10 : approvedStatus === "VSC" ? 6 : 3.2;
      const maximumDuration = approvedStatus === "SAFETY CAR" ? 13 : approvedStatus === "VSC" ? 8 : 4.5;
      this.raceControl.timer = clamp(Math.max(Number(duration || 0), minimumDuration), minimumDuration, maximumDuration);
      this.raceControl.phase = "neutralised";
      this.raceControl.incidents += 1;
      this.raceControl.lastChangeAt = performance.now();

      if (approvedStatus === "SAFETY CAR") {
        this.raceability.safetyCarDeployments += 1;
        this.raceControl.safetyCarDeployments = this.raceability.safetyCarDeployments;
        this.stats.safetyCars += 1;
      } else if (approvedStatus === "VSC") {
        this.raceability.vscDeployments += 1;
        this.raceControl.vscDeployments = this.raceability.vscDeployments;
        this.stats.virtualSafetyCars += 1;
      } else {
        this.stats.localYellows += 1;
      }

      this.incidentCooldown = Math.max(this.incidentCooldown, this.raceControl.timer + 6);
      this.greenFlagSeconds = 0;
      this.cars.forEach(car => { car.drs = false; car.boost = false; });
      this.emitEvent(approvedStatus, `${this.raceControl.reason} · ${approvedStatus === "YELLOW" ? "Local caution" : "Delta uygulanıyor"}.`);
      return true;
    }

    updateRaceControl(dt) {
      this.incidentCooldown = Math.max(0, this.incidentCooldown - dt);
      this.raceability.restartGuard = Math.max(0, Number(this.raceability.restartGuard || 0) - dt);

      if (this.raceControl.status === "GREEN") {
        this.greenFlagSeconds += dt;
        this.stats.greenFlagSeconds += dt;
      } else {
        this.raceControl.timer = Math.max(0, this.raceControl.timer - dt);
        if (this.raceControl.timer <= 0) {
          if (this.raceControl.phase === "neutralised" && this.raceControl.status !== "YELLOW") {
            this.raceControl.phase = "restart";
            this.raceControl.timer = 2.2;
            this.raceControl.reason = "Restart preparation";
            this.emitEvent("RACE CONTROL", `${this.raceControl.status} ending. Prepare for restart.`);
          } else {
            this.raceControl.status = "GREEN";
            this.raceControl.reason = "Track clear";
            this.raceControl.phase = "racing";
            this.raceControl.timer = 0;
            this.greenFlagSeconds = 0;
            this.raceability.restartGuard = this.raceability.restartProtection;
            this.incidentCooldown = Math.max(this.incidentCooldown, this.raceability.restartProtection);
            this.emitEvent("GREEN FLAG", `Racing resumed · ${Math.round(this.raceability.restartProtection)}s Raceability Guard active.`);
          }
        }
      }

      this.incidentCheckTimer -= dt;
      if (this.incidentCheckTimer > 0 || this.countdown > 0 || this.finished) return;
      this.incidentCheckTimer = 3.4;
      if (this.raceControl.status !== "GREEN" || this.incidentCooldown > 0 || this.raceability.restartGuard > 0) return;
      if (this.incidentLevel === "off") return;

      const activeAi = this.cars.filter(car => !car.isPlayer && !car.finished && !car.retired);
      if (!activeAi.length) return;
      const candidate = activeAi[Math.floor(this.raceRandom() * activeAi.length)];
      const reliability = 58 + (Number(candidate.id.split("-")[1] || 1) % 7) * 4;
      const probability = .00155 * this.raceability.randomFactor * (1 + (70 - reliability) * .009);

      if (this.raceRandom() < probability) {
        const severity = this.raceRandom();
        if (severity > .88) {
          this.retireCar(candidate, "Mechanical failure");
          const obstruction = this.raceRandom() > .58;
          this.triggerRaceControl(
            obstruction ? "SAFETY CAR" : "VSC",
            `${candidate.name} stopped on circuit`,
            obstruction ? 11 : 7,
            { emergency:obstruction, source:"technical" }
          );
        } else if (severity > .52) {
          candidate.damage.engine = Math.max(42, candidate.damage.engine - 18);
          candidate.speed *= .62;
          this.triggerRaceControl("VSC", `${candidate.name} reported a technical issue`, 6.5, { source:"technical" });
        } else {
          candidate.damage.engine = Math.max(55, candidate.damage.engine - 10);
          candidate.speed *= .74;
          this.triggerRaceControl("YELLOW", `${candidate.name} running slowly`, 3.5, { source:"technical" });
        }
      }
    }

    applyDamage(car, amount, component = "frontWing", reason = "Contact") {
      if (!car || car.retired || !car.damage) return;
      const reliability = car.isPlayer ? Number(this.carDevelopment.reliability || 60) : 62;
      const resistance = clamp(.82 + (reliability - 60) * .004, .78, .95);
      const effective = Math.max(.4, Number(amount || 0) * resistance);
      car.damage[component] = clamp(Number(car.damage[component] || 100) - effective, 0, 100);
      if (car.isPlayer) {
        this.stats.damageTaken += effective;
        const health = Math.round(car.damage[component]);
        this.emitEvent("CAR DAMAGE", `${reason} · ${component.toUpperCase()} ${health}%`);
      }
      if (component === "engine" && car.damage.engine <= 3) this.retireCar(car, "Power unit failure");
      if (component === "frontWing" && car.damage.frontWing < 28 && car.isPlayer) {
        this.emitEvent("TEAM RADIO", "Front wing critical. Box for repairs.");
      }
    }

    retireCar(car, reason = "Retired") {
      if (!car || car.retired || car.finished) return;
      car.retired = true;
      car.retirementReason = reason;
      car.retirementCleanupTimer = car.isPlayer ? 0 : 3.2;
      car.speed = 0;
      car.throttle = 0;
      car.brakeInput = 1;
      car.boost = false;
      car.drs = false;
      car.finishTime = null;
      if (car.isPlayer) {
        this.stats.retirements += 1;
        this.stats.clean = false;
        this.emitEvent("DNF", reason);
      } else {
        this.emitEvent("YELLOW FLAG", `${car.name} retired · ${reason}`);
      }
    }

    damageFactors(car) {
      const frontWing = clamp(Number(car.damage?.frontWing ?? 100) / 100, 0, 1);
      const floor = clamp(Number(car.damage?.floor ?? 100) / 100, 0, 1);
      const engine = clamp(Number(car.damage?.engine ?? 100) / 100, 0, 1);
      return {
        grip:.70 + frontWing * .20 + floor * .10,
        speed:.72 + engine * .28,
        steer:.76 + frontWing * .24
      };
    }

    updateTrackLimits(car, dt) {
      if (!car.isPlayer) return;
      if (car.offRoad && Math.abs(car.speed) > 65) {
        car.offTrackContinuous += dt;
      } else if (car.offTrackContinuous > 0) {
        if (car.offTrackContinuous >= 1.15) {
          this.stats.trackLimitWarnings += 1;
          this.emitEvent("TRACK LIMITS", `Warning ${this.stats.trackLimitWarnings} · Lap time may be compromised.`);
          if (this.stats.trackLimitWarnings >= car.trackLimitThreshold) {
            this.stats.penaltySeconds += 5;
            car.penaltySeconds += 5;
            car.trackLimitThreshold += 3;
            this.emitEvent("5 SECOND PENALTY", "Repeated track-limit violations.");
          }
        }
        car.offTrackContinuous = 0;
      }
    }

    updateReliability(car, dt) {
      if (car.retired || car.finished) return;
      const modeLoad = car.isPlayer && this.drivingMode === "attack" ? 1.32 : car.isPlayer && this.drivingMode === "conserve" ? .68 : 1;
      const boostLoad = car.boost ? 1.42 : 1;
      const reliability = car.isPlayer ? Number(this.carDevelopment.reliability || 60) : 64;
      const wear = dt * .0036 * modeLoad * boostLoad * clamp(1.24 - (reliability - 50) * .008, .72, 1.22);
      car.damage.engine = clamp(car.damage.engine - wear, 0, 100);
      if (car.damage.engine <= 3) this.retireCar(car, "Power unit failure");
    }

    updateWeather(dt) {
      const progress = this.progressRatio();
      let target = 0;
      if (this.weather.mode === "wet") target = .86;
      else if (this.weather.mode === "mixed") {
        if (progress < .22) target = .05;
        else if (progress < .48) target = clamp((progress - .22) / .26 * .78, 0, .78);
        else if (progress < .74) target = .78;
        else target = clamp(.78 - (progress - .74) / .26 * .7, .08, .78);
      }
      const previous = this.weather.wetness;
      this.weather.wetness += (target - this.weather.wetness) * clamp(dt * .55, 0, 1);
      this.weather.rain = clamp((this.weather.wetness - .08) * 1.25, 0, 1);
      this.weather.label = this.weather.wetness > .68 ? "HEAVY RAIN" : this.weather.wetness > .25 ? "RAIN" : this.weather.wetness > .08 ? "DAMP" : "DRY";
      if (!this.weather.changed && previous < .12 && this.weather.wetness >= .12) {
        this.weather.changed = true;
        this.emitEvent("RAIN ARRIVING", "Pist ıslanıyor. Intermediate lastik penceresi açıldı.");
      }
      if (this.weather.rain > .2) this.stats.rainSeconds += dt;
    }

    updateTrackEvolution(dt) {
      const wetness = Number(this.weather.wetness || 0);
      if (wetness < .10) {
        this.trackEvolution.rubber = clamp(this.trackEvolution.rubber + dt * .00145, 0, 1);
        this.trackEvolution.trend = "BUILDING";
      } else {
        this.trackEvolution.rubber = clamp(this.trackEvolution.rubber - dt * (.0025 + wetness * .0045), 0, 1);
        this.trackEvolution.trend = wetness > .42 ? "WASHING OUT" : "STABLE";
      }
      this.trackEvolution.grip = clamp(.992 + this.trackEvolution.rubber * .022 - wetness * .012, .965, 1.018);
    }

    tyreGrip(car) {
      const tyre = compound(car.tyreCompound);
      const wetness = this.weather.wetness;
      const base = tyre.dryGrip * (1 - wetness) + tyre.wetGrip * wetness;
      const wearPenalty = car.tyreWear < 58 ? 1 : clamp(1 - (car.tyreWear - 58) * .008, .62, 1);
      const wetSkill = car.isPlayer ? 1 + (Number(this.driverAttributes.wetSkill || 60) - 60) * .0035 * wetness : 1;
      const puncturePenalty = car.puncture ? .38 : 1;
      const evolutionGrip = Number(this.trackEvolution?.grip || 1);
      return clamp(base * wearPenalty * wetSkill * puncturePenalty * evolutionGrip, .28, 1.12);
    }

    updateTyre(car, dt) {
      const tyre = compound(car.tyreCompound);
      const management = car.isPlayer
        ? 1 - (Number(this.driverAttributes.tyreManagement || 60) - 60) * .004 - (Number(this.carDevelopment.tyre || 60) - 60) * .003
        : .96 + ((Number(car.id.split("-")[1] || 1) % 5) * .012);
      const load = clamp(Math.abs(car.speed) / Math.max(1, car.baseMaxSpeed), .15, 1.2);
      const modeWear = car.isPlayer && this.drivingMode === "attack" ? 1.24 : car.isPlayer && this.drivingMode === "conserve" ? .74 : 1;
      car.tyreWear = clamp(car.tyreWear + dt * .43 * Number(this.track.tireWear || 1) * tyre.wear * management * load * modeWear, 0, 100);
      if (!car.puncture && car.tyreWear > 96 && this.raceRandom() < dt * .085) {
        car.puncture = true;
        car.speed *= .42;
        car.pitRequested = true;
        car.nextCompound = this.weather.wetness > .55 ? "wet" : this.weather.wetness > .2 ? "intermediate" : "hard";
        if (car.isPlayer) {
          this.stats.punctures += 1;
          this.stats.clean = false;
          this.emitEvent("PUNCTURE", "Tyre failure detected. Pit request activated.");
        }
        if (this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
          this.triggerRaceControl("YELLOW", `${car.name} slow with puncture`, 3.6, { source:"puncture" });
        }
      }
      if (car.isPlayer && car.tyreWear > 78 && !car.tyreWarningSent) {
        car.tyreWarningSent = true;
        this.stats.tyreWarnings += 1;
        this.emitEvent("TYRE WARNING", `${tyre.label} aşınması %${Math.round(car.tyreWear)}. Pit-stop düşün.`);
      }
    }

    playerInput(car) {
      const throttle = this.keys.arrowup || this.keys.w || this.mobile.throttle;
      const brake = this.keys.arrowdown || this.keys.s || this.mobile.brake;
      const left = this.keys.arrowleft || this.keys.a || this.mobile.left;
      const right = this.keys.arrowright || this.keys.d || this.mobile.right;
      const boost = this.keys[" "] || this.mobile.boost;
      const drs = this.keys.shift || this.mobile.drs;
      car.throttle = throttle ? 1 : 0;
      car.brakeInput = brake ? 1 : 0;
      car.steer = (right ? 1 : 0) - (left ? 1 : 0);
      car.boost = Boolean(boost && car.ers > .5 && car.speed > 50);
      car.drsAvailable = Boolean(this.raceControl.status === "GREEN" && car.completedLaps >= 1 && this.weather.wetness < .22 && Math.abs(car.steer) < .22 && car.speed > 120);
      car.drs = Boolean(drs && car.drsAvailable);
    }

    aiPitDecision(car) {
      if (car.finished || car.pitRequested || car.pitTimer > 0 || car.completedLaps >= this.lapsTarget - 1) return;
      const wet = this.weather.wetness;
      const dryTyre = ["soft","medium","hard"].includes(car.tyreCompound);
      const wrongWetTyre = wet > .42 && dryTyre;
      const wrongDryTyre = wet < .16 && ["intermediate","wet"].includes(car.tyreCompound);
      if (car.tyreWear > 72 || car.puncture || car.damage.frontWing < 42 || wrongWetTyre || wrongDryTyre) {
        car.pitRequested = true;
        car.nextCompound = wet > .68 ? "wet" : wet > .25 ? "intermediate" : car.completedLaps < this.lapsTarget * .55 ? "medium" : "hard";
      }
    }

    trackFrame(index, span = 2) {
      const path = this.track.path;
      const centerIndex = wrap(Math.round(index), path.length);
      const point = path[centerIndex];
      const behind = path[wrap(centerIndex - span, path.length)];
      const ahead = path[wrap(centerIndex + span, path.length)];
      const tangent = Math.atan2(ahead.y - behind.y, ahead.x - behind.x);
      return {
        index:centerIndex,
        point,
        tangent,
        normalX:Math.cos(tangent + Math.PI / 2),
        normalY:Math.sin(tangent + Math.PI / 2)
      };
    }

    stabilizeAiToTrack(car, dt) {
      const index = this.nearestIndex(car);
      const frame = this.trackFrame(index, 2);
      const roadWidth = Number(this.track.roadWidth || 70);
      const laneLimit = roadWidth * .18;
      const requestedLane = clamp(Number(car.aiLaneOffset || 0) * roadWidth, -laneLimit, laneLimit);
      const targetX = frame.point.x + frame.normalX * requestedLane;
      const targetY = frame.point.y + frame.normalY * requestedLane;
      const centerDistance = Math.hypot(frame.point.x - car.x, frame.point.y - car.y);

      if (centerDistance > roadWidth * .72) {
        car.x = targetX;
        car.y = targetY;
        car.angle = frame.tangent;
        car.speed = Math.min(car.speed, car.baseMaxSpeed * .67);
        car.aiTargetLane = 0;
        car.aiLaneOffset *= .35;
      } else {
        const correctionRate = centerDistance > roadWidth * .42 ? 8.5 : centerDistance > roadWidth * .28 ? 4.8 : 1.75;
        const correction = clamp(dt * correctionRate, 0, centerDistance > roadWidth * .42 ? .58 : .20);
        car.x += (targetX - car.x) * correction;
        car.y += (targetY - car.y) * correction;
        const headingCorrection = clamp(dt * (centerDistance > roadWidth * .35 ? 6.8 : 2.2), 0, .42);
        car.angle += normalizeAngle(frame.tangent - car.angle) * headingCorrection;
      }

      car.aiAnchorIndex = index;
      car.nearestDistance = Math.hypot(frame.point.x - car.x, frame.point.y - car.y);
    }

    aiInput(car, dt = .016) {
      const path = this.track.path;
      const sampleLength = Math.max(1, Number(this.track.pathLength || path.length) / Math.max(1, path.length));
      const elapsed = this.raceElapsedSeconds();
      car.aiDecisionTimer = Math.max(0, Number(car.aiDecisionTimer || 0) - dt);
      const traffic = this.activeCarAhead(car, Math.max(30, path.length / 11));

      if (elapsed < 4.5) {
        const startBlend = clamp(1 - elapsed / 4.5, 0, 1);
        car.aiTargetLane = Number(car.gridLane || 0) * startBlend;
      } else if (car.aiDecisionTimer <= 0) {
        if (car.nearestDistance > this.track.roadWidth * .34) {
          car.aiTargetLane = 0;
        } else if (traffic && traffic.delta < Math.max(15, path.length / 28)) {
          const direction = ((Number(car.id.split("-")[1] || 1) + Math.floor(car.completedLaps)) % 2 === 0) ? 1 : -1;
          car.aiTargetLane = direction * (.105 + Number(car.aiAttackBias || .4) * .055);
        } else {
          car.aiTargetLane = ((Number(car.id.split("-")[1] || 1) % 3) - 1) * .065;
        }
        car.aiDecisionTimer = .62 + this.raceRandom() * .95;
      }

      car.aiTargetLane = clamp(car.aiTargetLane, -.18, .18);
      car.aiLaneOffset += (car.aiTargetLane - car.aiLaneOffset) * Math.min(1, dt * 1.65);

      // Look-ahead is expressed in metres/pixels and converted to path samples.
      // This prevents the AI from aiming through the inside of hairpins.
      const lookAheadPixels = clamp(42 + Math.abs(car.speed) * .16, 42, 94);
      const lookAhead = clamp(Math.round(lookAheadPixels / sampleLength), 3, 9);
      const targetIndex = wrap(car.progressIndex + lookAhead, path.length);
      const targetFrame = this.trackFrame(targetIndex, 2);
      const futureFrame = this.trackFrame(targetIndex + lookAhead, 2);
      const curvature = Math.abs(normalizeAngle(futureFrame.tangent - targetFrame.tangent));
      const laneCurveFactor = clamp(1 - curvature * 2.15, .12, 1);
      const lanePixels = clamp(
        Number(car.aiLaneOffset || 0) * this.track.roadWidth * laneCurveFactor,
        -this.track.roadWidth * .18,
        this.track.roadWidth * .18
      );

      const targetX = targetFrame.point.x + targetFrame.normalX * lanePixels;
      const targetY = targetFrame.point.y + targetFrame.normalY * lanePixels;
      const desired = Math.atan2(targetY - car.y, targetX - car.x);
      const difference = normalizeAngle(desired - car.angle);
      car.steer = clamp(difference * 3.45, -1, 1);

      const cornerPenalty = clamp(curvature * 1.22 + Math.abs(difference) * .30, 0, .72);
      const grip = this.tyreGrip(car);
      const paceNoise = 1 + Math.sin((car.totalProgress + Number(car.id.split("-")[1] || 1) * 31) * .021) * .005 * Number(car.aiConsistency || 1);
      let targetSpeed = car.baseMaxSpeed * (1 - cornerPenalty) * grip * car.aiAero * paceNoise;

      if (car.nearestDistance > this.track.roadWidth * .38) targetSpeed *= .72;
      if (traffic && traffic.delta < Math.max(12, path.length / 38) && curvature < .16) {
        targetSpeed *= 1.008 + Number(car.aiAttackBias || .4) * .018;
      }

      car.throttle = car.speed < targetSpeed ? 1 : .18;
      car.brakeInput = car.speed > targetSpeed * 1.025 ? .92 : 0;
      const attacking = Boolean(traffic && traffic.delta < Math.max(18, path.length / 22) && curvature < .14);
      car.boost = car.ers > 28 && Math.abs(difference) < .13 && curvature < .11 && car.speed > car.baseMaxSpeed * .60 && (attacking || this.raceRandom() < .010);
      car.drsAvailable = Boolean(this.raceControl.status === "GREEN" && car.completedLaps >= 1 && this.weather.wetness < .22 && Math.abs(difference) < .12 && curvature < .10 && car.speed > 122);
      car.drs = Boolean(car.drsAvailable && (attacking || this.raceRandom() < .34));
      this.aiPitDecision(car);
    }

    updateCar(car, dt, now) {
      if (car.collisionCooldown > 0) car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
      if (car.retired) {
        car.speed = 0;
        car.throttle = 0;
        car.brakeInput = 1;
        if (!car.isPlayer) {
          car.retirementCleanupTimer = Math.max(0, Number(car.retirementCleanupTimer || 0) - dt);
          if (car.retirementCleanupTimer <= 0) car.parcFerme = true;
        }
        return;
      }
      if (car.pitTimer > 0) {
        car.pitTimer = Math.max(0, car.pitTimer - dt);
        car.speed = 0;
        car.throttle = 0;
        car.brakeInput = 1;
        return;
      }

      if (car.finished) {
        if (!car.isPlayer) {
          car.finishExitTimer = Math.max(0, Number(car.finishExitTimer || 0) - dt);
          if (car.finishExitTimer <= 0) {
            car.parcFerme = true;
            car.speed = 0;
            car.throttle = 0;
            car.brakeInput = 1;
            return;
          }
          this.aiInput(car, dt);
          car.throttle = Math.min(car.throttle, .42);
        } else {
          car.throttle = .18;
          car.brakeInput = 0;
        }
      } else if (car.isPlayer) this.playerInput(car);
      else this.aiInput(car, dt);

      const onRoad = car.nearestDistance <= this.track.roadWidth * .54;
      car.offRoad = !onRoad;
      const tyre = compound(car.tyreCompound);
      const grip = this.tyreGrip(car);
      const damage = this.damageFactors(car);
      const mode = car.isPlayer ? this.drivingMode : "balanced";
      const modeSpeed = mode === "attack" ? 1.022 : mode === "conserve" ? .966 : 1;
      const modeAccel = mode === "attack" ? 1.075 : mode === "conserve" ? .91 : 1;
      const cautionFactor = this.raceControlFactor();
      if (this.raceControl.status !== "GREEN") {
        car.boost = false;
        car.drs = false;
      }
      const boostFactor = car.boost ? 1.20 : 1;
      const drsFactor = car.drs ? 1.075 : 1;
      const punctureFactor = car.puncture ? .46 : 1;
      const maxSpeed = car.baseMaxSpeed * tyre.pace * boostFactor * drsFactor * modeSpeed * damage.speed * cautionFactor * punctureFactor * (onRoad ? 1 : .43) * clamp(grip, .65, 1.06);
      const acceleration = car.accel * car.throttle * (car.boost ? 1.22 : 1) * modeAccel * damage.speed * clamp(grip, .64, 1.08);
      const braking = car.brake * car.brakeInput * clamp(grip, .55, 1.05);
      car.speed += (acceleration - braking) * dt;
      if (!car.throttle && !car.brakeInput) car.speed *= Math.pow(.986, dt * 60);
      car.speed *= Math.pow(onRoad ? .998 : .955, dt * 60);
      car.speed = clamp(car.speed, -55, maxSpeed);

      const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.baseMaxSpeed), 0, 1);
      const steerRate = (1.12 + speedRatio * 1.75) * clamp(grip, .55, 1.08) * damage.steer;
      car.angle += car.steer * steerRate * dt * (car.speed >= 0 ? 1 : -1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (!car.isPlayer) this.stabilizeAiToTrack(car, dt);

      if (car.boost) car.ers = Math.max(0, car.ers - 25 * dt);
      else {
        const recovery = car.isPlayer && this.drivingMode === "conserve" ? 1.45 : car.isPlayer && this.drivingMode === "attack" ? .78 : 1;
        car.ers = Math.min(100, car.ers + (car.isPlayer ? 5 : 6.5) * recovery * dt);
      }
      if (car.isPlayer && car.drs) this.stats.drsSeconds += dt;

      this.updateTyre(car, dt);
      this.updateReliability(car, dt);
      car.x = clamp(car.x, 5, this.width - 5);
      car.y = clamp(car.y, 5, this.height - 5);
      this.updateProgress(car, now);
      if (car.isPlayer && car.offRoad) {
        this.stats.offTrackSeconds += dt;
        if (this.stats.offTrackSeconds > 1.5) this.stats.clean = false;
        if (Math.abs(car.speed) > 145 && this.raceRandom() < dt * .035) this.applyDamage(car, 1.7, "floor", "Off-track impact");
      }
      this.updateTrackLimits(car, dt);
    }

    collisions() {
      const elapsed = this.raceElapsedSeconds();
      const openingPhase = elapsed < this.raceability.startProtection;
      for (let a = 0; a < this.cars.length; a += 1) {
        for (let b = a + 1; b < this.cars.length; b += 1) {
          const first = this.cars[a];
          const second = this.cars[b];
          if (first.pitTimer > 0 || second.pitTimer > 0 || first.retired || second.retired || first.parcFerme || second.parcFerme) continue;
          const sampleDelta = Math.abs(Number(first.progressIndex || 0) - Number(second.progressIndex || 0));
          const wrappedDelta = Math.min(sampleDelta, Math.max(0, this.track.path.length - sampleDelta));
          if (wrappedDelta > Math.max(14, this.track.path.length / 28)) continue;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy);
          const minimum = openingPhase ? 11.8 : 12.8;
          if (distance > 0 && distance < minimum) {
            const push = (minimum - distance) / 2;
            const nx = dx / distance;
            const ny = dy / distance;
            first.x -= nx * push;
            first.y -= ny * push;
            second.x += nx * push;
            second.y += ny * push;

            const headingDifference = Math.abs(normalizeAngle(first.angle - second.angle)) / Math.PI;
            const rawImpact = Math.abs(first.speed - second.speed) + Math.min(Math.abs(first.speed), Math.abs(second.speed)) * (.045 + headingDifference * .27);
            const impact = rawImpact * (openingPhase ? .34 : 1);
            first.speed *= impact > 105 ? .68 : .88;
            second.speed *= impact > 105 ? .68 : .88;

            if (first.collisionCooldown <= 0 && second.collisionCooldown <= 0 && impact > 36) {
              first.collisionCooldown = openingPhase ? .62 : 1.05;
              second.collisionCooldown = openingPhase ? .62 : 1.05;
              const damage = clamp(impact * .052, .6, openingPhase ? 4.5 : 14);
              this.applyDamage(first, damage, impact > 118 ? "floor" : "frontWing", `Contact with ${second.name}`);
              this.applyDamage(second, damage, impact > 118 ? "floor" : "frontWing", `Contact with ${first.name}`);

              if (first.isPlayer || second.isPlayer) {
                this.stats.collisions += 1;
                if (impact > 72) this.stats.clean = false;
              }

              let retiredVictim = null;
              if (!openingPhase && impact > 158 && this.raceRandom() < .22) {
                retiredVictim = this.raceRandom() < .5 ? first : second;
                this.retireCar(retiredVictim, "Collision damage");
              }

              if (retiredVictim && this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
                const obstruction = impact > 188 && this.raceRandom() > .52;
                this.triggerRaceControl(
                  obstruction ? "SAFETY CAR" : "VSC",
                  `${retiredVictim.name} stopped after collision`,
                  obstruction ? 11 : 6.5,
                  { emergency:obstruction, source:"collision" }
                );
              } else if (!openingPhase && impact > 132 && this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
                this.triggerRaceControl("VSC", "Debris reported after heavy contact", 6.2, { source:"collision" });
              } else if (impact > 92 && this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
                this.triggerRaceControl("YELLOW", "Contact reported · local caution", 3.2, { source:"collision" });
              }
            }
          }
        }
      }
    }

    standings() {
      return [...this.cars].sort((a, b) => {
        if (a.finished && b.finished) return (a.finishTime + Number(a.penaltySeconds || 0)) - (b.finishTime + Number(b.penaltySeconds || 0));
        if (a.finished) return -1;
        if (b.finished) return 1;
        if (a.retired && b.retired) return b.totalProgress - a.totalProgress;
        if (a.retired) return 1;
        if (b.retired) return -1;
        if (a.pitTimer > 0 && b.pitTimer <= 0) return 1;
        if (b.pitTimer > 0 && a.pitTimer <= 0) return -1;
        return b.totalProgress - a.totalProgress;
      });
    }

    finalStandings() {
      const ordered = this.standings();
      const playerIndex = ordered.findIndex(car => car.isPlayer);
      const player = ordered[playerIndex];
      if (!player || player.retired || Number(player.penaltySeconds || 0) <= 0) return ordered;
      const shift = Math.min(ordered.length - playerIndex - 1, Math.ceil(Number(player.penaltySeconds || 0) / 5));
      if (shift <= 0) return ordered;
      ordered.splice(playerIndex, 1);
      ordered.splice(playerIndex + shift, 0, player);
      return ordered;
    }

    loop = now => {
      if (!this.running || !this.canvas.isConnected) {
        this.destroy();
        return;
      }
      const dt = clamp((now - this.lastFrame) / 1000, 0, .034);
      this.lastFrame = now;
      this.frameCounter += 1;

      if (!this.paused) {
        if (this.countdown > 0) this.countdown -= dt;
        else if (!this.finished) {
          this.updateWeather(dt);
          this.updateTrackEvolution(dt);
          this.updateRaceControl(dt);
          this.cars.forEach(car => this.updateCar(car, dt, now));
          if (this.frameCounter % this.performance.collisionEvery === 0) this.collisions();

          if (!this.cachedStandings || now - this.lastStandingsAt >= 55) {
            this.cachedStandings = this.standings();
            this.lastStandingsAt = now;
          }
          const standings = this.cachedStandings;
          const rank = standings.findIndex(car => car.isPlayer) + 1;
          if (rank < this.lastPlayerRank) this.stats.overtakes += this.lastPlayerRank - rank;
          this.lastPlayerRank = rank;
          const player = this.cars[0];
          if (player.finished || player.retired) this.finishRace(this.finalStandings());

          if (now - this.lastUiTick >= this.performance.uiInterval || this.finished) {
            this.lastUiTick = now;
            this.options.onTick?.(this.snapshot(standings, now));
          }
        }
      }

      const frameDuration = 1000 / this.performance.targetFps;
      if (now - this.lastDrawAt >= frameDuration || this.countdown > 0 || this.paused) {
        this.lastDrawAt = now;
        this.draw(now);
      }
      this.raf = requestAnimationFrame(this.loop);
    };

    snapshot(standings = this.standings(), now = performance.now()) {
      const player = this.cars[0];
      return {
        elapsed:Math.max(0, (now - this.startedAt) / 1000 - 3.4),
        player,
        standings,
        timing:this.timingRows(standings),
        rank:standings.findIndex(car => car.isPlayer) + 1,
        lap:Math.min(this.lapsTarget, player.completedLaps + 1),
        lapsTarget:this.lapsTarget,
        stats:{ ...this.stats },
        weather:{ ...this.weather },
        raceControl:{ ...this.raceControl },
        raceability:{
          safetyCarMax:this.raceability.safetyCarMax,
          vscMax:this.raceability.vscMax,
          safetyCarDeployments:this.raceability.safetyCarDeployments,
          vscDeployments:this.raceability.vscDeployments,
          restartGuard:this.raceability.restartGuard,
          greenFlagSeconds:this.greenFlagSeconds,
          downgraded:this.raceability.downgraded
        },
        drivingMode:this.drivingMode,
        damage:{ ...player.damage },
        pitCompound:this.nextPitCompound,
        track:this.track,
        trackEvolution:{ ...this.trackEvolution },
        performance:{ ...this.performance },
        sector:{
          current:Number(player.currentSector || 1),
          currentLap:[...(player.currentLapSectors || [null,null,null])],
          lastLap:[...(player.lastLapSectors || [null,null,null])],
          best:[...(player.bestSectors || [null,null,null])],
          last:player.lastSector ? { ...player.lastSector } : null,
          liveDelta:Number.isFinite(Number(player.liveLapDelta)) ? Number(player.liveLapDelta) : null
        }
      };
    }

    finishRace(standings) {
      if (this.finished) return;
      this.finished = true;
      const finalOrder = Array.isArray(standings) ? standings : this.finalStandings();
      const player = this.cars[0];
      const rank = finalOrder.findIndex(car => car.isPlayer) + 1;
      const elapsed = player.finishTime || (performance.now() - this.startedAt) / 1000;
      this.options.onFinish?.({
        rank,
        elapsed,
        bestLap:player.bestLap,
        standings:finalOrder,
        stats:{ ...this.stats },
        track:this.track,
        difficulty:this.difficulty,
        weather:{ ...this.weather },
        tyreCompound:player.tyreCompound,
        tyreWear:player.tyreWear,
        pitStops:player.pitStops,
        retired:player.retired,
        retirementReason:player.retirementReason,
        damage:{ ...player.damage },
        penaltySeconds:Number(player.penaltySeconds || 0),
        drivingMode:this.drivingMode,
        raceControl:{ ...this.raceControl },
        raceability:{
          safetyCarMax:this.raceability.safetyCarMax,
          vscMax:this.raceability.vscMax,
          safetyCarDeployments:this.raceability.safetyCarDeployments,
          vscDeployments:this.raceability.vscDeployments,
          downgraded:this.raceability.downgraded
        },
        trackEvolution:{ ...this.trackEvolution },
        sector:{
          lastLap:[...(player.lastLapSectors || [null,null,null])],
          best:[...(player.bestSectors || [null,null,null])]
        }
      });
    }

    drawEnvironment(ctx, wet) {
      const theme = this.track.theme || "grass";
      const w = this.width;
      const h = this.height;
      const colors = {
        ocean:["#06344a","#08708a"], volcanic:["#160c0a","#4a1711"], street:["#101820","#1b2a33"],
        arena:["#083326","#13543a"], strait:["#063047","#0b6680"], desert:["#8b5b2d","#c89a58"],
        storm:["#071f2b","#163c49"], neon:["#120d2d","#3a1750"], grass:["#0b3a24","#153f2b"]
      };
      const [base, glow] = colors[theme] || colors.grass;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const gradient = ctx.createRadialGradient(w*.52,h*.45,18,w*.52,h*.45,Math.max(w,h)*.78);
      gradient.addColorStop(0, glow);
      gradient.addColorStop(1, base);
      ctx.globalAlpha = wet > .2 ? .68 : .88;
      ctx.fillStyle = gradient;
      ctx.fillRect(0,0,w,h);
      ctx.globalAlpha = 1;

      ctx.save();
      if (theme === "ocean" || theme === "strait" || theme === "storm") {
        ctx.strokeStyle = theme === "storm" ? "rgba(150,220,235,.13)" : "rgba(130,225,245,.16)";
        ctx.lineWidth = 1;
        for (let y = 22; y < h; y += 28) {
          ctx.beginPath();
          for (let x = -30; x <= w + 30; x += 30) {
            const wave = Math.sin((x + y) * .035) * 4;
            if (x === -30) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
          }
          ctx.stroke();
        }
      }
      if (theme === "ocean") {
        ctx.fillStyle = "rgba(10,45,34,.76)";
        ctx.beginPath();ctx.ellipse(w*.53,h*.51,w*.36,h*.31,-.12,0,TAU);ctx.fill();
        ctx.fillStyle = "rgba(240,245,230,.15)";
        ctx.fillRect(w*.09,h*.72,w*.13,5);
        ctx.fillRect(w*.78,h*.18,w*.12,5);
      } else if (theme === "volcanic") {
        ctx.strokeStyle = "rgba(255,75,35,.22)";ctx.lineWidth=3;
        for(let i=0;i<12;i+=1){const x=(i*137)%w,y=(i*83)%h;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+30,y+18);ctx.lineTo(x+12,y+42);ctx.stroke();}
        ctx.fillStyle="rgba(255,74,38,.12)";ctx.beginPath();ctx.arc(w*.52,h*.49,Math.min(w,h)*.17,0,TAU);ctx.fill();
      } else if (theme === "street") {
        ctx.fillStyle = "rgba(4,11,16,.62)";
        const blockW=Math.max(52,w/11),blockH=Math.max(42,h/9);
        for(let row=0;row<9;row+=1)for(let col=0;col<11;col+=1){if((row+col)%3===0)continue;ctx.fillRect(col*blockW+6,row*blockH+6,blockW-12,blockH-12);}
        ctx.fillStyle="rgba(101,217,255,.13)";for(let i=0;i<38;i+=1)ctx.fillRect((i*83)%w,(i*47)%h,3,3);
      } else if (theme === "arena") {
        ctx.strokeStyle="rgba(210,235,225,.12)";ctx.lineWidth=18;ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*.45,h*.41,0,0,TAU);ctx.stroke();
        ctx.strokeStyle="rgba(85,226,157,.13)";ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*.39,h*.35,0,0,TAU);ctx.stroke();
      } else if (theme === "strait") {
        ctx.fillStyle="rgba(18,65,47,.82)";ctx.fillRect(0,0,w*.29,h);ctx.fillRect(w*.71,0,w*.29,h);
        ctx.strokeStyle="rgba(235,240,230,.28)";ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(w*.25,h*.48);ctx.lineTo(w*.75,h*.52);ctx.stroke();
      } else if (theme === "desert") {
        ctx.strokeStyle="rgba(255,224,166,.16)";ctx.lineWidth=2;
        for(let i=0;i<12;i+=1){const y=i*h/12;ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(w*.25,y-30,w*.65,y+30,w,y-5);ctx.stroke();}
      } else if (theme === "storm") {
        ctx.fillStyle="rgba(205,230,235,.055)";for(let i=0;i<15;i+=1){ctx.beginPath();ctx.arc((i*97)%w,(i*61)%h,24+(i%4)*9,0,TAU);ctx.fill();}
      } else if (theme === "neon") {
        const lights=["#22d3ee","#c084fc","#fb7185"];
        for(let i=0;i<30;i+=1){ctx.fillStyle=lights[i%lights.length];ctx.globalAlpha=.18;ctx.fillRect((i*107)%w,(i*59)%h,3,12);}
        ctx.globalAlpha=1;ctx.strokeStyle="rgba(192,132,252,.16)";ctx.lineWidth=2;ctx.strokeRect(w*.08,h*.08,w*.84,h*.84);
      }
      ctx.restore();
    }

    drawTrack(ctx) {
      const path = this.track.path;
      const drawPath = () => {
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let index = 1; index < path.length; index += 1) ctx.lineTo(path[index].x, path[index].y);
        ctx.closePath();
      };

      const wet = this.weather.wetness;
      this.drawEnvironment(ctx, wet);

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawPath();
      ctx.strokeStyle = "rgba(0,0,0,.55)";
      ctx.lineWidth = this.track.roadWidth + 18;
      ctx.stroke();
      drawPath();
      ctx.strokeStyle = this.track.kerbA || "#ef4444";
      ctx.lineWidth = this.track.roadWidth + 9;
      ctx.setLineDash([12,12]);
      ctx.stroke();
      ctx.lineDashOffset = 12;
      drawPath();
      ctx.strokeStyle = this.track.kerbB || "#ffffff";
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      drawPath();
      ctx.strokeStyle = wet > .2 ? "#263640" : "#2b3339";
      ctx.lineWidth = this.track.roadWidth;
      ctx.stroke();
      if (wet > .12) {
        drawPath();
        ctx.strokeStyle = `rgba(94,180,210,${.05 + wet * .11})`;
        ctx.lineWidth = this.track.roadWidth - 8;
        ctx.stroke();
      }
      drawPath();
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.lineWidth = 2;
      ctx.setLineDash([15,15]);
      ctx.stroke();
      ctx.setLineDash([]);

      const start = path[0];
      const ahead = path[5];
      const angle = Math.atan2(ahead.y-start.y,ahead.x-start.x) + Math.PI/2;
      ctx.save();
      ctx.translate(start.x,start.y);
      ctx.rotate(angle);
      const width = this.track.roadWidth*.82;
      const block = 8;
      for(let x=-width/2;x<width/2;x+=block){
        ctx.fillStyle=(Math.floor((x+width/2)/block)%2)?"#fff":"#111";
        ctx.fillRect(x,-5,block,10);
      }
      ctx.restore();
      ctx.save();
      ctx.fillStyle = "rgba(2,10,16,.72)";
      ctx.fillRect(14, this.height - 45, 168, 30);
      ctx.strokeStyle = this.track.kerbA || "#f4c75e";
      ctx.strokeRect(14, this.height - 45, 168, 30);
      ctx.fillStyle = this.track.kerbA || "#f4c75e";
      ctx.font = "950 10px system-ui";
      ctx.fillText(`${this.track.layoutCode || "GP"} · ${(this.track.theme || "CIRCUIT").toUpperCase()}`, 24, this.height - 26);
      ctx.restore();
    }

    drawRain(ctx, now) {
      if (this.weather.rain <= .04) return;
      const count = Math.round((35 + this.weather.rain * 95) * this.performance.rainFactor);
      ctx.save();
      ctx.strokeStyle = `rgba(170,220,245,${.10 + this.weather.rain * .20})`;
      ctx.lineWidth = 1;
      const seed = Math.floor(now / 22);
      for (let index = 0; index < count; index += 1) {
        const x = (index * 97 + seed * 13) % this.width;
        const y = (index * 53 + seed * 21) % this.height;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + 18);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCar(ctx, car, rank) {
      if (car.pitTimer > 0 || car.parcFerme) return;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const scale = car.isPlayer ? 1.30 : 1.14;
      ctx.scale(scale, scale);
      ctx.shadowColor = car.isPlayer ? "rgba(247,200,92,.8)" : "rgba(0,0,0,.45)";
      ctx.shadowBlur = car.isPlayer ? 12 : 5;
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.roundRect(-10,-5,20,10,3);
      ctx.fill();
      ctx.fillStyle = "#091018";
      ctx.fillRect(-4,-4,8,8);
      ctx.fillStyle = compound(car.tyreCompound).color;
      ctx.fillRect(-8,-6,4,2);
      ctx.fillRect(4,-6,4,2);
      ctx.fillRect(-8,4,4,2);
      ctx.fillRect(4,4,4,2);
      ctx.fillStyle = "#dcecf4";
      ctx.fillRect(6,-2,5,4);
      if (car.boost) {
        ctx.fillStyle = "#5ee7ff";
        ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(-18,0);ctx.lineTo(-10,3);ctx.fill();
      }
      if (car.drs) {
        ctx.fillStyle = "#67e8f9";
        ctx.fillRect(-11,-7,4,2);
      }
      if (car.damage?.frontWing < 55) {
        ctx.fillStyle = "#111827";
        ctx.fillRect(8,-5,4,10);
      }
      if (car.retired || car.damage?.engine < 28) {
        ctx.fillStyle = "rgba(180,190,200,.35)";
        for (let puff = 0; puff < 4; puff += 1) {
          ctx.beginPath();
          ctx.arc(-13 - puff * 4, -5 + Math.sin(car.smokePhase + puff) * 3, 3 + puff, 0, TAU);
          ctx.fill();
        }
      }
      if (car.retired) {
        ctx.globalAlpha = .55;
        ctx.fillStyle = "#111";
        ctx.fillRect(-10,-5,20,10);
      }
      ctx.restore();
      if (car.isPlayer || rank <= 3) {
        ctx.font = car.isPlayer ? "900 14px system-ui" : "800 11px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.fillText(car.retired ? "DNF" : car.isPlayer ? "YOU" : String(rank), car.x, car.y - 15);
      }
    }

    draw(now = performance.now()) {
      const ctx = this.ctx;
      ctx.clearRect(0,0,this.width,this.height);
      if (!this.track) return;
      this.refreshStaticTrackLayer();
      if (this.staticTrackLayer) ctx.drawImage(this.staticTrackLayer, 0, 0, this.width, this.height);
      else this.drawTrack(ctx);
      const standings = this.cachedStandings || this.standings();
      [...standings].reverse().forEach((car, reverseIndex) => {
        const rank = standings.length - reverseIndex;
        this.drawCar(ctx, car, rank);
      });
      this.drawRain(ctx, now);
      if (this.raceControl.status !== "GREEN" && this.countdown <= 0) {
        const palette = this.raceControl.status === "SAFETY CAR" ? ["#f4c75e","#181102"] : this.raceControl.status === "VSC" ? ["#facc15","#171302"] : ["#fde047","#171302"];
        ctx.save();
        ctx.fillStyle = palette[1];
        ctx.globalAlpha = .78;
        ctx.fillRect(this.width/2-150,16,300,38);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = palette[0];
        ctx.strokeRect(this.width/2-150,16,300,38);
        ctx.textAlign = "center";
        ctx.fillStyle = palette[0];
        ctx.font = "950 15px system-ui";
        ctx.fillText(`${this.raceControl.status} · ${Math.ceil(this.raceControl.timer)}s`,this.width/2,40);
        ctx.restore();
      }
      if (this.countdown > 0 && this.running) {
        const value = Math.ceil(this.countdown);
        ctx.fillStyle = "rgba(2,10,16,.64)";
        ctx.fillRect(0,0,this.width,this.height);
        ctx.textAlign="center";
        ctx.fillStyle="#fff";
        ctx.font=`950 ${Math.min(130,this.width*.12)}px system-ui`;
        ctx.fillText(value > 0 ? String(value) : "GO",this.width/2,this.height/2+30);
        ctx.font="800 14px system-ui";
        ctx.fillStyle="#f7c85c";
        ctx.fillText(`${this.track.name.toUpperCase()} · ${this.weather.mode.toUpperCase()}`,this.width/2,this.height/2+66);
      }
      if (this.paused) {
        ctx.fillStyle="rgba(1,8,13,.72)";ctx.fillRect(0,0,this.width,this.height);
        ctx.textAlign="center";ctx.fillStyle="#fff";ctx.font="900 42px system-ui";
        ctx.fillText("PAUSED",this.width/2,this.height/2);
        ctx.font="700 13px system-ui";ctx.fillStyle="#9bb1ba";
        ctx.fillText("ESC veya devam düğmesi",this.width/2,this.height/2+34);
      }
    }
  }

  window.F1_RACE_ENGINE = Object.freeze({
    FormulaRaceEngine,
    CAR_COLORS,
    AI_NAMES,
    AI_PROFILE_OFFSETS,
    COMPOUNDS,
    normalizeAngle,
    compound
  });
})();
