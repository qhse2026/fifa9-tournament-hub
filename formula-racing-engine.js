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

  class FormulaRaceEngine {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.options = options;
      this.trackId = options.trackId || "oruc-reis";
      this.lapsTarget = Number(options.laps || 3);
      this.difficulty = options.difficulty || "standard";
      this.playerName = options.playerName || "Player";
      this.mode = options.mode || "race";
      this.running = false;
      this.paused = false;
      this.finished = false;
      this.startedAt = 0;
      this.lastFrame = 0;
      this.raf = 0;
      this.cars = [];
      this.keys = Object.create(null);
      this.mobile = { left:false, right:false, throttle:false, brake:false, boost:false };
      this.stats = { collisions:0, offTrackSeconds:0, overtakes:0, clean:true };
      this.lastPlayerRank = 12;
      this.countdown = 3.4;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas.parentElement || canvas);
      this.boundKeyDown = event => this.onKey(event, true);
      this.boundKeyUp = event => this.onKey(event, false);
      window.addEventListener("keydown", this.boundKeyDown, { passive:false });
      window.addEventListener("keyup", this.boundKeyUp, { passive:false });
      this.resize();
    }

    resize() {
      const parent = this.canvas.parentElement;
      const rect = parent?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight };
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
      const controlled = ["arrowup","arrowdown","arrowleft","arrowright","w","a","s","d"," ","r","escape"];
      if (controlled.includes(key) && this.running) event.preventDefault();
      if (key === "escape" && pressed && this.running) this.togglePause();
      if (key === "r" && pressed && this.running) this.resetPlayer();
      this.keys[key] = pressed;
    }

    setMobileControl(control, active) {
      if (control in this.mobile) this.mobile[control] = active;
    }

    createCars() {
      const path = this.track.path;
      const spacing = Math.max(8, Math.round(path.length / 95));
      const difficultyFactor = { rookie:0.88, standard:0.97, elite:1.055 }[this.difficulty] || .97;
      this.cars = Array.from({ length:12 }, (_, index) => {
        const offset = index * spacing;
        const pathIndex = wrap(-offset, path.length);
        const point = path[pathIndex];
        const next = path[wrap(pathIndex + 2, path.length)];
        return {
          id:index === 0 ? "player" : `ai-${index}`,
          name:index === 0 ? this.playerName : AI_NAMES[index - 1],
          color:CAR_COLORS[index],
          isPlayer:index === 0,
          x:point.x,
          y:point.y,
          angle:Math.atan2(next.y - point.y, next.x - point.x),
          speed:0,
          maxSpeed:index === 0 ? 300 : (276 + (index % 4) * 6) * difficultyFactor,
          accel:index === 0 ? 185 : 165 * difficultyFactor,
          brake:235,
          steer:0,
          throttle:0,
          progressIndex:pathIndex,
          lastIndex:pathIndex,
          totalProgress:-offset,
          completedLaps:0,
          finished:false,
          finishTime:null,
          ers:100,
          boost:false,
          offRoad:false,
          nearestDistance:0,
          aiSkill:index === 0 ? 1 : difficultyFactor * (0.94 + ((index * 17) % 11) / 100),
          lapStartedAt:0,
          bestLap:null,
          lastLap:null,
          lapTimes:[]
        };
      });
      this.lastPlayerRank = 12;
    }

    start() {
      this.createCars();
      this.running = true;
      this.paused = false;
      this.finished = false;
      this.startedAt = performance.now();
      this.lastFrame = this.startedAt;
      this.countdown = 3.4;
      this.loop(this.lastFrame);
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.resizeObserver?.disconnect();
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

    updateProgress(car, now) {
      const count = this.track.path.length;
      const index = this.nearestIndex(car);
      let delta = index - car.lastIndex;
      if (delta > count / 2) delta -= count;
      if (delta < -count / 2) delta += count;
      if (Math.abs(delta) < count / 7 && car.nearestDistance < this.track.roadWidth * 1.8) {
        car.totalProgress += delta;
      }
      car.progressIndex = index;
      car.lastIndex = index;
      const completed = Math.max(0, Math.floor(car.totalProgress / count));
      if (completed > car.completedLaps) {
        const lapTime = (now - (car.lapStartedAt || this.startedAt)) / 1000;
        if (car.completedLaps >= 0 && lapTime > 8) {
          car.lastLap = lapTime;
          car.lapTimes.push(lapTime);
          car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
        }
        car.lapStartedAt = now;
        car.completedLaps = completed;
      }
      if (!car.finished && car.completedLaps >= this.lapsTarget) {
        car.finished = true;
        car.finishTime = (now - this.startedAt) / 1000;
        car.speed *= .7;
      }
    }

    playerInput(car) {
      const throttle = this.keys.arrowup || this.keys.w || this.mobile.throttle;
      const brake = this.keys.arrowdown || this.keys.s || this.mobile.brake;
      const left = this.keys.arrowleft || this.keys.a || this.mobile.left;
      const right = this.keys.arrowright || this.keys.d || this.mobile.right;
      const boost = this.keys[" "] || this.mobile.boost;
      car.throttle = throttle ? 1 : 0;
      car.brakeInput = brake ? 1 : 0;
      car.steer = (right ? 1 : 0) - (left ? 1 : 0);
      car.boost = Boolean(boost && car.ers > .5 && car.speed > 50);
    }

    aiInput(car) {
      const path = this.track.path;
      const lookAhead = Math.round(12 + Math.abs(car.speed) * .055);
      const target = path[wrap(car.progressIndex + lookAhead, path.length)];
      const desired = Math.atan2(target.y - car.y, target.x - car.x);
      const difference = normalizeAngle(desired - car.angle);
      car.steer = clamp(difference * 2.4, -1, 1);
      const cornerPenalty = clamp(Math.abs(difference) / 1.5, 0, .65);
      const targetSpeed = car.maxSpeed * (1 - cornerPenalty) * car.aiSkill;
      car.throttle = car.speed < targetSpeed ? 1 : .15;
      car.brakeInput = car.speed > targetSpeed * 1.06 ? .75 : 0;
      car.boost = car.ers > 35 && Math.abs(difference) < .16 && car.speed > car.maxSpeed * .68 && Math.random() < .012;
    }

    updateCar(car, dt, now) {
      if (car.finished) {
        car.throttle = .18;
        car.brakeInput = 0;
        if (!car.isPlayer) this.aiInput(car);
      } else if (car.isPlayer) {
        this.playerInput(car);
      } else {
        this.aiInput(car);
      }

      const onRoad = car.nearestDistance <= this.track.roadWidth * .54;
      car.offRoad = !onRoad;
      const boostFactor = car.boost ? 1.22 : 1;
      const maxSpeed = car.maxSpeed * boostFactor * (onRoad ? 1 : .43);
      const acceleration = car.accel * car.throttle * (car.boost ? 1.24 : 1);
      const braking = car.brake * car.brakeInput;
      car.speed += (acceleration - braking) * dt;
      if (!car.throttle && !car.brakeInput) car.speed *= Math.pow(.986, dt * 60);
      car.speed *= Math.pow(onRoad ? .998 : .955, dt * 60);
      car.speed = clamp(car.speed, -55, maxSpeed);

      const speedRatio = clamp(Math.abs(car.speed) / Math.max(1, car.maxSpeed), 0, 1);
      const steerRate = 1.15 + speedRatio * 1.75;
      car.angle += car.steer * steerRate * dt * (car.speed >= 0 ? 1 : -1);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;

      if (car.boost) car.ers = Math.max(0, car.ers - 25 * dt);
      else car.ers = Math.min(100, car.ers + (car.isPlayer ? 5 : 6.5) * dt);

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
        if (this.countdown > 0) {
          this.countdown -= dt;
        } else if (!this.finished) {
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
        elapsed: Math.max(0, (now - this.startedAt) / 1000 - 3.4),
        player,
        standings,
        rank: standings.findIndex(car => car.isPlayer) + 1,
        lap: Math.min(this.lapsTarget, player.completedLaps + 1),
        lapsTarget: this.lapsTarget,
        stats: { ...this.stats }
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
        difficulty:this.difficulty
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

      ctx.fillStyle = "#0b3a24";
      ctx.fillRect(0, 0, this.width, this.height);
      const grass = ctx.createRadialGradient(this.width*.55,this.height*.45,20,this.width*.55,this.height*.45,Math.max(this.width,this.height));
      grass.addColorStop(0,"rgba(35,105,66,.36)");
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
      ctx.strokeStyle = "#27323a";
      ctx.lineWidth = this.track.roadWidth;
      ctx.stroke();
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
      const w=this.track.roadWidth*.82;
      const block=8;
      for(let x=-w/2;x<w/2;x+=block){
        ctx.fillStyle=(Math.floor((x+w/2)/block)%2)?"#fff":"#111";
        ctx.fillRect(x,-5,block,10);
      }
      ctx.restore();
    }

    drawCar(ctx, car, rank) {
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
      ctx.fillStyle = "#dcecf4";
      ctx.fillRect(6,-2,5,4);
      if (car.boost) {
        ctx.fillStyle = "#5ee7ff";
        ctx.beginPath();ctx.moveTo(-10,-3);ctx.lineTo(-18,0);ctx.lineTo(-10,3);ctx.fill();
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
        ctx.fillText(this.track.name.toUpperCase(),this.width/2,this.height/2+66);
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

  window.F1_RACE_ENGINE = Object.freeze({ FormulaRaceEngine, CAR_COLORS, AI_NAMES, normalizeAngle });
})();
