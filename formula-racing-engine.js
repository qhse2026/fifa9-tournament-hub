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
        pitStops:0, drsSeconds:0, rainSeconds:0, tyreWarnings:0
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
      const controlled = ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","r","p","shift","escape"];
      if (controlled.includes(key) && this.running) event.preventDefault();
      if (key === "escape" && pressed && this.running) this.togglePause();
      if (key === "r" && pressed && this.running) this.resetPlayer();
      if (key === "p" && pressed && this.running) this.requestPit();
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
          lastCompletedLap:0
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
      this.emitEvent("RACE START", `${this.track.name} · ${this.weather.mode.toUpperCase()} koşullar`);
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
      car.pitStops += 1;
      if (car.isPlayer) {
        this.stats.pitStops += 1;
        this.emitEvent("PIT STOP", `${compound(car.tyreCompound).label} takıldı · ${car.pitTimer.toFixed(1)} sn`);
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
      return clamp(base * wearPenalty * wetSkill, .48, 1.12);
    }

    updateTyre(car, dt) {
      const tyre = compound(car.tyreCompound);
      const management = car.isPlayer
        ? 1 - (Number(this.driverAttributes.tyreManagement || 60) - 60) * .004 - (Number(this.carDevelopment.tyre || 60) - 60) * .003
        : .96 + ((Number(car.id.split("-")[1] || 1) % 5) * .012);
      const load = clamp(Math.abs(car.speed) / Math.max(1, car.baseMaxSpeed), .15, 1.2);
      car.tyreWear = clamp(car.tyreWear + dt * .43 * Number(this.track.tireWear || 1) * tyre.wear * management * load, 0, 100);
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
      car.drsAvailable = Boolean(car.completedLaps >= 1 && this.weather.wetness < .22 && Math.abs(car.steer) < .22 && car.speed > 120);
      car.drs = Boolean(drs && car.drsAvailable);
    }

    aiPitDecision(car) {
      if (car.finished || car.pitRequested || car.pitTimer > 0 || car.completedLaps >= this.lapsTarget - 1) return;
      const wet = this.weather.wetness;
      const dryTyre = ["soft","medium","hard"].includes(car.tyreCompound);
      const wrongWetTyre = wet > .42 && dryTyre;
      const wrongDryTyre = wet < .16 && ["intermediate","wet"].includes(car.tyreCompound);
      if (car.tyreWear > 72 || wrongWetTyre || wrongDryTyre) {
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
      car.boost = car.ers > 35 && Math.abs(difference) < .16 && car.speed > car.baseMaxSpeed * .68 && Math.random() < .012;
      car.drsAvailable = Boolean(car.completedLaps >= 1 && this.weather.wetness < .22 && Math.abs(difference) < .13 && car.speed > 125);
      car.drs = Boolean(car.drsAvailable && Math.random() < .42);
      this.aiPitDecision(car);
    }

    updateCar(car, dt, now) {
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
      const boostFactor = car.boost ? 1.20 : 1;
      const drsFactor = car.drs ? 1.075 : 1;
      const maxSpeed = car.baseMaxSpeed * tyre.pace * boostFactor * drsFactor * (onRoad ? 1 : .43) * clamp(grip, .65, 1.06);
      const acceleration = car.accel * car.throttle * (car.boost ? 1.22 : 1) * clamp(grip, .64, 1.08);
      const braking = car.brake * car.brakeInput * clamp(grip, .55, 1.05);
      car.speed += (acceleration - braking) * dt;
      if (!car.throttle && !car.brakeInput) car.speed *= Math.pow(.986, dt * 60);
      car.speed *= Math.pow(onRoad ? .998 : .955, dt * 60);
      car.speed = clamp(car.speed, -55, maxSpeed);

      const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.baseMaxSpeed), 0, 1);
      const steerRate = (1.12 + speedRatio * 1.75) * clamp(grip, .55, 1.08);
      car.angle += car.steer * steerRate * dt * (car.speed >= 0 ? 1 : -1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;

      if (car.boost) car.ers = Math.max(0, car.ers - 25 * dt);
      else car.ers = Math.min(100, car.ers + (car.isPlayer ? 5 : 6.5) * dt);
      if (car.isPlayer && car.drs) this.stats.drsSeconds += dt;

      this.updateTyre(car, dt);
      car.x = clamp(car.x, 5, this.width - 5);
      car.y = clamp(car.y, 5, this.height - 5);
      this.updateProgress(car, now);
      if (car.isPlayer && car.offRoad) {
        this.stats.offTrackSeconds += dt;
        if (this.stats.offTrackSeconds > 1.5) this.stats.clean = false;
      }
    }

    collisions() {
      for (let a = 0; a < this.cars.length; a += 1) {
        for (let b = a + 1; b < this.cars.length; b += 1) {
          const first = this.cars[a];
          const second = this.cars[b];
          if (first.pitTimer > 0 || second.pitTimer > 0) continue;
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
            first.speed *= .84;
            second.speed *= .84;
            if (first.isPlayer || second.isPlayer) {
              this.stats.collisions += 1;
              this.stats.clean = false;
            }
          }
        }
      }
    }

    standings() {
      return [...this.cars].sort((a, b) => {
        if (a.finished && b.finished) return a.finishTime - b.finishTime;
        if (a.finished) return -1;
        if (b.finished) return 1;
        if (a.pitTimer > 0 && b.pitTimer <= 0) return 1;
        if (b.pitTimer > 0 && a.pitTimer <= 0) return -1;
        return b.totalProgress - a.totalProgress;
      });
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
          this.cars.forEach(car => this.updateCar(car, dt, now));
          this.collisions();
          const standings = this.standings();
          const rank = standings.findIndex(car => car.isPlayer) + 1;
          if (rank < this.lastPlayerRank) this.stats.overtakes += this.lastPlayerRank - rank;
          this.lastPlayerRank = rank;
          const player = this.cars[0];
          if (player.finished) this.finishRace(standings);
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
        pitCompound:this.nextPitCompound,
        track:this.track
      };
    }

    finishRace(standings) {
      if (this.finished) return;
      this.finished = true;
      const player = this.cars[0];
      const rank = standings.findIndex(car => car.isPlayer) + 1;
      const elapsed = player.finishTime || (performance.now() - this.startedAt) / 1000;
      this.options.onFinish?.({
        rank,
        elapsed,
        bestLap:player.bestLap,
        standings,
        stats:{ ...this.stats },
        track:this.track,
        difficulty:this.difficulty,
        weather:{ ...this.weather },
        tyreCompound:player.tyreCompound,
        tyreWear:player.tyreWear,
        pitStops:player.pitStops
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
      ctx.restore();
      if (car.isPlayer || rank <= 3) {
        ctx.font = car.isPlayer ? "800 11px system-ui" : "700 9px system-ui";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,.92)";
        ctx.fillText(car.isPlayer ? "YOU" : String(rank), car.x, car.y - 12);
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
