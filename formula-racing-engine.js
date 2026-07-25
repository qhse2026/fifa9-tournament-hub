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
    "#e879f9", "#14b8a6", "#f43f5e", "#84cc16", "#60a5fa", "#facc15"
  ];

  const AI_NAMES = [
    "Kerim", "Oğuzhan", "Ercan", "Aziz", "Sultan", "Ersin",
    "Asen", "Affan", "Sergei", "Emre", "Denar"
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
      this.incidentCheckTimer = 1.5;
      this.incidentCooldown = 0;
      this.running = false;
      this.paused = false;
      this.finished = false;
      this.startedAt = 0;
      this.lastFrame = 0;
      this.raf = 0;
      this.cars = [];
      this.keys = Object.create(null);
      this.mobile = { left:false, right:false, throttle:false, brake:false, boost:false, drs:false, pit:false };
      this.stats = {
        collisions:0, offTrackSeconds:0, overtakes:0, clean:true,
        pitStops:0, drsSeconds:0, rainSeconds:0, tyreWarnings:0,
        trackLimitWarnings:0, penaltySeconds:0, safetyCars:0, virtualSafetyCars:0,
        damageTaken:0, punctures:0, retirements:0
      };
      this.lastPlayerRank = 12;
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

    resolveWeatherMode() {
      if (["dry","mixed","wet"].includes(this.weatherMode)) return this.weatherMode;
      const track = T().getTrack(this.trackId);
      const roll = this.weatherRandom() * 100;
      if (roll < Number(track.rainChance || 20) * .35) return "wet";
      if (roll < Number(track.rainChance || 20)) return "mixed";
      return "dry";
    }

    resize() {
      const parent = this.canvas.parentElement;
      const rect = parent?.getBoundingClientRect?.() || { width:window.innerWidth, height:window.innerHeight };
      const width = Math.max(320, Math.round(rect.width));
      const height = Math.max(360, Math.round(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.width = width;
      this.height = height;
      this.track = T().buildTrack(this.trackId, width, height);
      if (this.cars.length) this.reprojectCars();
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

    createCars() {
      const path = this.track.path;
      const spacing = Math.max(8, Math.round(path.length / 95));
      const difficultyFactor = { rookie:.88, standard:.97, elite:1.055 }[this.difficulty] || .97;
      const paceBonus = (Number(this.driverAttributes.pace || 60) - 60) * .55;
      const powerBonus = (Number(this.carDevelopment.power || 60) - 60) * .46;
      const aeroBonus = (Number(this.carDevelopment.aero || 60) - 60) * .004;
      const masteryBonus = Math.min(4, this.mastery * .035);
      const ids = ["player", ...AI_NAMES.map((_, index) => `ai-${index + 1}`)];

      this.cars = ids.map((id, index) => {
        const grid = this.gridPosition(id, index);
        const offset = grid * spacing;
        const pathIndex = wrap(-offset, path.length);
        const point = path[pathIndex];
        const next = path[wrap(pathIndex + 2, path.length)];
        const isPlayer = id === "player";
        const aiVariation = ((index * 17) % 11) / 100;
        const initialCompound = isPlayer
          ? this.startingCompound
          : (this.weather.mode === "wet" ? "wet" : this.weather.mode === "mixed" && index % 3 === 0 ? "intermediate" : ["soft","medium","hard"][index % 3]);
        return {
          id,
          name:isPlayer ? this.playerName : AI_NAMES[index - 1],
          color:CAR_COLORS[index],
          isPlayer,
          gridPosition:grid + 1,
          x:point.x,
          y:point.y,
          angle:Math.atan2(next.y - point.y, next.x - point.x),
          speed:0,
          baseMaxSpeed:isPlayer ? 293 + paceBonus + powerBonus + masteryBonus : (278 + (index % 4) * 6) * difficultyFactor,
          maxSpeed:isPlayer ? 293 + paceBonus + powerBonus + masteryBonus : (278 + (index % 4) * 6) * difficultyFactor,
          accel:isPlayer ? 178 + (Number(this.driverAttributes.racecraft || 60) - 60) * .7 : 164 * difficultyFactor,
          brake:235,
          steer:0,
          throttle:0,
          brakeInput:0,
          progressIndex:pathIndex,
          lastIndex:pathIndex,
          totalProgress:-offset,
          completedLaps:0,
          finished:false,
          finishTime:null,
          ers:100,
          boost:false,
          drs:false,
          drsAvailable:false,
          offRoad:false,
          nearestDistance:0,
          aiSkill:isPlayer ? 1 : difficultyFactor * (.94 + aiVariation),
          aiAero:isPlayer ? 1 + aeroBonus : .98 + aiVariation * .4,
          lapStartedAt:0,
          bestLap:null,
          lastLap:null,
          lapTimes:[],
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
          collisionCooldown:0,
          offTrackContinuous:0,
          trackLimitThreshold:3,
          penaltySeconds:0,
          smokePhase:index * .7
        };
      });
      this.lastPlayerRank = this.gridPosition("player", 11) + 1;
    }

    start() {
      this.createCars();
      this.running = true;
      this.paused = false;
      this.finished = false;
      this.startedAt = performance.now();
      this.lastFrame = this.startedAt;
      this.countdown = 3.4;
      this.raceControl = { status:"GREEN", reason:"Track clear", timer:0, phase:"racing", incidents:0, lastChangeAt:this.startedAt };
      this.incidentCheckTimer = 1.5;
      this.incidentCooldown = 0;
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
      const index = this.nearestIndex(car);
      let delta = index - car.lastIndex;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      if (Math.abs(delta) < count / 7 && car.nearestDistance < this.track.roadWidth * 1.8) car.totalProgress += delta;
      car.progressIndex = index;
      car.lastIndex = index;
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
      if (!car.finished && car.completedLaps >= this.lapsTarget) {
        car.finished = true;
        car.finishTime = (now - this.startedAt) / 1000;
        car.speed *= .7;
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

    triggerRaceControl(status, reason, duration) {
      const priority = { GREEN:0, YELLOW:1, VSC:2, "SAFETY CAR":3 };
      if ((priority[status] || 0) < (priority[this.raceControl.status] || 0) && this.raceControl.timer > 2) return false;
      this.raceControl.status = status;
      this.raceControl.reason = reason || "Incident";
      this.raceControl.timer = Math.max(Number(duration || 0), status === "SAFETY CAR" ? 12 : status === "VSC" ? 8 : 4);
      this.raceControl.phase = "neutralised";
      this.raceControl.incidents += 1;
      this.raceControl.lastChangeAt = performance.now();
      this.incidentCooldown = Math.max(this.incidentCooldown, this.raceControl.timer + 4);
      if (status === "SAFETY CAR") this.stats.safetyCars += 1;
      if (status === "VSC") this.stats.virtualSafetyCars += 1;
      this.cars.forEach(car => { car.drs = false; car.boost = false; });
      this.emitEvent(status, `${this.raceControl.reason} · Delta uygulanıyor.`);
      return true;
    }

    updateRaceControl(dt) {
      this.incidentCooldown = Math.max(0, this.incidentCooldown - dt);
      if (this.raceControl.status !== "GREEN") {
        this.raceControl.timer = Math.max(0, this.raceControl.timer - dt);
        if (this.raceControl.timer <= 0) {
          if (this.raceControl.phase === "neutralised") {
            this.raceControl.phase = "restart";
            this.raceControl.timer = 3.2;
            this.raceControl.reason = "Restart preparation";
            this.emitEvent("RACE CONTROL", `${this.raceControl.status} ending. Prepare for restart.`);
          } else {
            this.raceControl.status = "GREEN";
            this.raceControl.reason = "Track clear";
            this.raceControl.phase = "racing";
            this.raceControl.timer = 0;
            this.emitEvent("GREEN FLAG", "Racing resumed. DRS remains subject to normal conditions.");
          }
        }
      }
      this.incidentCheckTimer -= dt;
      if (this.incidentCheckTimer > 0 || this.countdown > 0 || this.finished) return;
      this.incidentCheckTimer = 2.2;
      if (this.raceControl.status !== "GREEN" || this.incidentCooldown > 0) return;
      const factors = { low:.35, realistic:1, high:1.9 };
      const factor = factors[this.incidentLevel] || 1;
      const activeAi = this.cars.filter(car => !car.isPlayer && !car.finished && !car.retired);
      if (!activeAi.length) return;
      const candidate = activeAi[Math.floor(this.raceRandom() * activeAi.length)];
      const reliability = 58 + (Number(candidate.id.split("-")[1] || 1) % 7) * 4;
      const probability = .0042 * factor * (1 + (70 - reliability) * .012);
      if (this.raceRandom() < probability) {
        const severity = this.raceRandom();
        if (severity > .72) {
          this.retireCar(candidate, "Mechanical failure");
          this.triggerRaceControl("SAFETY CAR", `${candidate.name} stopped on circuit`, 13 + this.raceRandom() * 5);
        } else {
          candidate.damage.engine = Math.max(35, candidate.damage.engine - 24);
          candidate.speed *= .52;
          this.triggerRaceControl("VSC", `${candidate.name} reported a technical issue`, 7 + this.raceRandom() * 3);
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

    tyreGrip(car) {
      const tyre = compound(car.tyreCompound);
      const wetness = this.weather.wetness;
      const base = tyre.dryGrip * (1 - wetness) + tyre.wetGrip * wetness;
      const wearPenalty = car.tyreWear < 58 ? 1 : clamp(1 - (car.tyreWear - 58) * .008, .62, 1);
      const wetSkill = car.isPlayer ? 1 + (Number(this.driverAttributes.wetSkill || 60) - 60) * .0035 * wetness : 1;
      const puncturePenalty = car.puncture ? .38 : 1;
      return clamp(base * wearPenalty * wetSkill * puncturePenalty, .28, 1.12);
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
        if (this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) this.triggerRaceControl("YELLOW", `${car.name} slow with puncture`, 4.5);
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

    aiInput(car) {
      const path = this.track.path;
      const lookAhead = Math.round(12 + Math.abs(car.speed) * .055);
      const target = path[wrap(car.progressIndex + lookAhead, path.length)];
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      const difference = normalizeAngle(desired - car.angle);
      car.steer = clamp(difference * 2.4, -1, 1);
      const cornerPenalty = clamp(Math.abs(difference) / 1.5, 0, .65);
      const grip = this.tyreGrip(car);
      const targetSpeed = car.baseMaxSpeed * (1 - cornerPenalty) * car.aiSkill * grip * car.aiAero;
      car.throttle = car.speed < targetSpeed ? 1 : .15;
      car.brakeInput = car.speed > targetSpeed * 1.06 ? .75 : 0;
      car.boost = car.ers > 35 && Math.abs(difference) < .16 && car.speed > car.baseMaxSpeed * .68 && this.raceRandom() < .012;
      car.drsAvailable = Boolean(this.raceControl.status === "GREEN" && car.completedLaps >= 1 && this.weather.wetness < .22 && Math.abs(difference) < .13 && car.speed > 125);
      car.drs = Boolean(car.drsAvailable && this.raceRandom() < .42);
      this.aiPitDecision(car);
    }

    updateCar(car, dt, now) {
      if (car.collisionCooldown > 0) car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
      if (car.retired) {
        car.speed = 0;
        car.throttle = 0;
        car.brakeInput = 1;
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
        car.throttle = .18;
        car.brakeInput = 0;
        if (!car.isPlayer) this.aiInput(car);
      } else if (car.isPlayer) this.playerInput(car);
      else this.aiInput(car);

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
      for (let a = 0; a < this.cars.length; a += 1) {
        for (let b = a + 1; b < this.cars.length; b += 1) {
          const first = this.cars[a];
          const second = this.cars[b];
          if (first.pitTimer > 0 || second.pitTimer > 0 || first.retired || second.retired) continue;
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy);
          const minimum = 15;
          if (distance > 0 && distance < minimum) {
            const push = (minimum - distance) / 2;
            const nx = dx / distance;
            const ny = dy / distance;
            first.x -= nx * push;
            first.y -= ny * push;
            second.x += nx * push;
            second.y += ny * push;
            const headingDifference = Math.abs(normalizeAngle(first.angle - second.angle)) / Math.PI;
            const impact = Math.abs(first.speed - second.speed) + Math.min(Math.abs(first.speed), Math.abs(second.speed)) * (.06 + headingDifference * .34);
            first.speed *= impact > 90 ? .60 : .82;
            second.speed *= impact > 90 ? .60 : .82;
            if (first.collisionCooldown <= 0 && second.collisionCooldown <= 0) {
              first.collisionCooldown = 1.15;
              second.collisionCooldown = 1.15;
              const damage = clamp(impact * .075, 1.1, 18);
              this.applyDamage(first, damage, impact > 105 ? "floor" : "frontWing", `Contact with ${second.name}`);
              this.applyDamage(second, damage, impact > 105 ? "floor" : "frontWing", `Contact with ${first.name}`);
              if (first.isPlayer || second.isPlayer) {
                this.stats.collisions += 1;
                this.stats.clean = false;
              }
              if (impact > 112 && this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
                this.triggerRaceControl("SAFETY CAR", `Heavy contact: ${first.name} / ${second.name}`, 13 + this.raceRandom() * 4);
              } else if (impact > 76 && this.raceControl.status === "GREEN" && this.incidentCooldown <= 0) {
                this.triggerRaceControl("VSC", "Debris reported after contact", 7 + this.raceRandom() * 3);
              }
              if (impact > 168 && this.raceRandom() < .32) {
                const victim = this.raceRandom() < .5 ? first : second;
                this.retireCar(victim, "Collision damage");
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
      if (!this.paused) {
        if (this.countdown > 0) this.countdown -= dt;
        else if (!this.finished) {
          this.updateWeather(dt);
          this.updateRaceControl(dt);
          this.cars.forEach(car => this.updateCar(car, dt, now));
          this.collisions();
          const standings = this.standings();
          const rank = standings.findIndex(car => car.isPlayer) + 1;
          if (rank < this.lastPlayerRank) this.stats.overtakes += this.lastPlayerRank - rank;
          this.lastPlayerRank = rank;
          const player = this.cars[0];
          if (player.finished || player.retired) this.finishRace(this.finalStandings());
          this.options.onTick?.(this.snapshot(standings, now));
        }
      }
      this.draw(now);
      this.raf = requestAnimationFrame(this.loop);
    };

    snapshot(standings = this.standings(), now = performance.now()) {
      const player = this.cars[0];
      return {
        elapsed:Math.max(0, (now - this.startedAt) / 1000 - 3.4),
        player,
        standings,
        rank:standings.findIndex(car => car.isPlayer) + 1,
        lap:Math.min(this.lapsTarget, player.completedLaps + 1),
        lapsTarget:this.lapsTarget,
        stats:{ ...this.stats },
        weather:{ ...this.weather },
        raceControl:{ ...this.raceControl },
        drivingMode:this.drivingMode,
        damage:{ ...player.damage },
        pitCompound:this.nextPitCompound,
        track:this.track
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
        raceControl:{ ...this.raceControl }
      });
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
      ctx.fillStyle = wet > .2 ? "#092c25" : "#0b3a24";
      ctx.fillRect(0, 0, this.width, this.height);
      const grass = ctx.createRadialGradient(this.width*.55,this.height*.45,20,this.width*.55,this.height*.45,Math.max(this.width,this.height));
      grass.addColorStop(0, wet > .2 ? "rgba(28,78,65,.42)" : "rgba(35,105,66,.36)");
      grass.addColorStop(1,"rgba(2,28,18,.72)");
      ctx.fillStyle = grass;
      ctx.fillRect(0,0,this.width,this.height);

      drawPath();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,.42)";
      ctx.lineWidth = this.track.roadWidth + 16;
      ctx.stroke();
      drawPath();
      ctx.strokeStyle = wet > .2 ? "#25333a" : "#27323a";
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
    }

    drawRain(ctx, now) {
      if (this.weather.rain <= .04) return;
      const count = Math.round(35 + this.weather.rain * 95);
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
      if (car.pitTimer > 0) return;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      const scale = car.isPlayer ? 1.12 : 1;
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
        ctx.font = car.isPlayer ? "800 11px system-ui" : "700 9px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.fillText(car.retired ? "DNF" : car.isPlayer ? "YOU" : String(rank), car.x, car.y - 12);
      }
    }

    draw(now = performance.now()) {
      const ctx = this.ctx;
      ctx.clearRect(0,0,this.width,this.height);
      if (!this.track) return;
      this.drawTrack(ctx);
      const standings = this.standings();
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
    COMPOUNDS,
    normalizeAngle,
    compound
  });
})();
