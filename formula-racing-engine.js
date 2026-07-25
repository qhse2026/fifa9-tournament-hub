(() => {
  "use strict";

  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));
  const wrap = (value,max) => ((value % max) + max) % max;
  const formatTime = milliseconds => {
    const value = Number(milliseconds);
    if (!Number.isFinite(value) || value <= 0) return "—";
    const minutes = Math.floor(value / 60000);
    const seconds = (value - minutes * 60000) / 1000;
    return `${minutes}:${seconds.toFixed(3).padStart(6,"0")}`;
  };

  class FormulaHorizonEngine {
    constructor(canvas, options = {}) {
      if (!canvas) throw new Error("Formula Horizon canvas missing.");
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha:false });
      this.options = options;
      this.track = window.F1_TRACKS.getTrack(options.trackId);
      this.theme = window.F1_TRACKS.THEMES[this.track.theme];
      this.segments = window.F1_TRACKS.buildSegments(this.track);
      this.segmentLength = window.F1_TRACKS.SEGMENT_LENGTH;
      this.trackLength = this.segments.length * this.segmentLength;
      this.lapsTarget = 5;
      this.drawDistance = 170;
      this.running = false;
      this.paused = false;
      this.finished = false;
      this.position = 0;
      this.speed = 0;
      this.maxSpeed = 332;
      this.playerX = 0;
      this.steerVisual = 0;
      this.currentLap = 1;
      this.lapTimes = [];
      this.currentLapClean = true;
      this.currentLapPenalty = 0;
      this.totalPenalty = 0;
      this.offRoadActive = false;
      this.offRoadStartedAt = 0;
      this.countdown = 3.2;
      this.startedAt = 0;
      this.lapStartedAt = 0;
      this.lastFrame = 0;
      this.lastUiAt = 0;
      this.raf = 0;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.controls = {left:false,right:false,throttle:false,brake:false};
      this.keyDown = event => this.onKey(event,true);
      this.keyUp = event => this.onKey(event,false);
      this.resize = this.resize.bind(this);
      this.loop = this.loop.bind(this);
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(canvas.parentElement || canvas);
      window.addEventListener("keydown", this.keyDown, { passive:false });
      window.addEventListener("keyup", this.keyUp, { passive:false });
      this.resize();
    }

    onKey(event,pressed) {
      const key = String(event.key || "").toLowerCase();
      if (["arrowleft","arrowright","arrowup","arrowdown","w","a","s","d","escape"].includes(key)) event.preventDefault();
      if (key === "arrowleft" || key === "a") this.controls.left = pressed;
      if (key === "arrowright" || key === "d") this.controls.right = pressed;
      if (key === "arrowup" || key === "w") this.controls.throttle = pressed;
      if (key === "arrowdown" || key === "s") this.controls.brake = pressed;
      if (key === "escape" && pressed) this.togglePause();
    }

    setControl(name,value) {
      if (name in this.controls) this.controls[name] = Boolean(value);
    }

    resize() {
      const host = this.canvas.parentElement || this.canvas;
      const rect = host.getBoundingClientRect();
      this.width = Math.max(480,Math.floor(rect.width || 1280));
      this.height = Math.max(320,Math.floor(rect.height || 720));
      this.dpr = Math.min(1.35,window.devicePixelRatio || 1);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
      this.draw(performance.now());
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }

    togglePause(force) {
      if (this.finished) return;
      this.paused = typeof force === "boolean" ? force : !this.paused;
      this.options.onPause?.(this.paused);
    }

    destroy() {
      this.running = false;
      cancelAnimationFrame(this.raf);
      this.resizeObserver?.disconnect();
      window.removeEventListener("keydown",this.keyDown);
      window.removeEventListener("keyup",this.keyUp);
    }

    currentSegment() {
      return this.segments[Math.floor(this.position / this.segmentLength) % this.segments.length];
    }

    update(dt,now) {
      if (this.countdown > 0) {
        this.countdown = Math.max(0,this.countdown - dt);
        if (this.countdown === 0) {
          this.startedAt = now;
          this.lapStartedAt = now;
        }
        return;
      }

      const throttle = this.controls.throttle ? 1 : 0;
      const brake = this.controls.brake ? 1 : 0;
      const steer = (this.controls.left ? -1 : 0) + (this.controls.right ? 1 : 0);
      const speedRatio = clamp(this.speed / this.maxSpeed,0,1);

      if (throttle) this.speed += (96 - speedRatio * 30) * dt;
      else this.speed -= (18 + speedRatio * 8) * dt;
      if (brake) this.speed -= (170 + speedRatio * 40) * dt;

      const segment = this.currentSegment();
      const steeringPower = (.58 + speedRatio * 1.25) * dt;
      this.playerX += steer * steeringPower;
      this.playerX -= segment.curve * speedRatio * speedRatio * dt * .56;
      this.steerVisual += (steer - this.steerVisual) * Math.min(1,dt * 8);

      const offRoad = Math.abs(this.playerX) > 1.02;
      if (offRoad) {
        this.speed -= 78 * dt;
        this.speed = Math.min(this.speed,160);
        if (!this.offRoadActive) {
          this.offRoadActive = true;
          this.offRoadStartedAt = now;
          this.currentLapClean = false;
          this.currentLapPenalty += 1500;
          this.totalPenalty += 1500;
          this.options.onTrackLimit?.({
            lap:this.currentLap,
            penaltyMs:1500
          });
        }
      } else if (Math.abs(this.playerX) < .94) {
        this.offRoadActive = false;
      }

      this.playerX = clamp(this.playerX,-1.72,1.72);
      this.speed = clamp(this.speed,0,this.maxSpeed);

      const previousPosition = this.position;
      this.position += this.speed * dt * 4.55;

      if (this.position >= this.trackLength) {
        this.position -= this.trackLength;
        const rawLap = now - this.lapStartedAt;
        const lapTime = Math.round(rawLap + this.currentLapPenalty);
        this.lapTimes.push({
          lap:this.currentLap,
          timeMs:lapTime,
          rawMs:Math.round(rawLap),
          penaltyMs:this.currentLapPenalty,
          clean:this.currentLapClean
        });
        this.options.onLap?.(this.lapTimes[this.lapTimes.length - 1]);

        if (this.currentLap >= this.lapsTarget) {
          this.finish(now);
          return;
        }

        this.currentLap += 1;
        this.lapStartedAt = now;
        this.currentLapClean = true;
        this.currentLapPenalty = 0;
        this.offRoadActive = false;
      }

      if (previousPosition > this.position && this.currentLap === 1) {
        this.lapStartedAt = now;
      }
    }

    finish(now) {
      this.finished = true;
      this.speed = 0;
      const validLaps = this.lapTimes.filter(item => item.clean);
      const best = validLaps.length ? Math.min(...validLaps.map(item => item.timeMs)) : null;
      const total = Math.round((now - this.startedAt) + this.totalPenalty);
      const result = {
        trackId:this.track.id,
        trackName:this.track.name,
        laps:this.lapTimes.slice(),
        bestLapMs:best,
        fiveLapMs:total,
        cleanLapCount:validLaps.length,
        totalPenaltyMs:this.totalPenalty,
        official:true,
        completed:true
      };
      this.options.onFinish?.(result);
    }

    snapshot(now) {
      const elapsed = this.startedAt ? Math.max(0,now - this.startedAt) : 0;
      const currentLapTime = this.lapStartedAt ? Math.max(0,now - this.lapStartedAt + this.currentLapPenalty) : 0;
      const validLaps = this.lapTimes.filter(item => item.clean);
      return {
        track:this.track,
        lap:this.currentLap,
        lapsTarget:this.lapsTarget,
        speed:Math.round(this.speed),
        position:this.position,
        progress:this.position / this.trackLength,
        playerX:this.playerX,
        currentLapTime,
        elapsed:elapsed + this.totalPenalty,
        lapTimes:this.lapTimes.slice(),
        bestLapMs:validLaps.length ? Math.min(...validLaps.map(item => item.timeMs)) : null,
        clean:this.currentLapClean,
        currentPenaltyMs:this.currentLapPenalty,
        totalPenaltyMs:this.totalPenalty,
        countdown:this.countdown,
        paused:this.paused,
        finished:this.finished
      };
    }

    loop(now) {
      if (!this.running || !this.canvas.isConnected) {
        this.destroy();
        return;
      }
      const dt = clamp((now - this.lastFrame) / 1000,0,.04);
      this.lastFrame = now;

      if (!this.paused && !this.finished) this.update(dt,now);
      this.draw(now);

      if (now - this.lastUiAt > 90) {
        this.lastUiAt = now;
        this.options.onTick?.(this.snapshot(now));
      }
      this.raf = requestAnimationFrame(this.loop);
    }

    drawPolygon(ctx,color,x1,y1,x2,y2,x3,y3,x4,y4) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x1,y1);
      ctx.lineTo(x2,y2);
      ctx.lineTo(x3,y3);
      ctx.lineTo(x4,y4);
      ctx.closePath();
      ctx.fill();
    }

    drawScenery(ctx,point,segment,index) {
      if (index % 11 !== 0 || point.perspective < .08) return;
      const size = Math.max(2,point.perspective * 72);
      const side = index % 22 === 0 ? -1 : 1;
      const x = point.center + side * (point.roadHalf + size * 1.25);
      const y = point.y;
      const type = this.theme.scenery;

      ctx.save();
      ctx.globalAlpha = clamp(point.perspective * 1.35,.12,.95);
      if (type === "forest") {
        ctx.fillStyle = "#123c28";
        ctx.fillRect(x-size*.12,y-size*.8,size*.24,size*.8);
        ctx.fillStyle = "#2a7a47";
        ctx.beginPath();
        ctx.moveTo(x,y-size*1.8);
        ctx.lineTo(x-size*.7,y-size*.45);
        ctx.lineTo(x+size*.7,y-size*.45);
        ctx.closePath();
        ctx.fill();
      } else if (type === "city" || type === "neon" || type === "harbour") {
        ctx.fillStyle = type === "neon" ? "#24143d" : "#233542";
        ctx.fillRect(x-size*.5,y-size*1.8,size,size*1.8);
        ctx.fillStyle = this.theme.accent;
        for (let row=0;row<3;row+=1) {
          ctx.fillRect(x-size*.33,y-size*1.55+row*size*.42,size*.18,size*.12);
          ctx.fillRect(x+size*.10,y-size*1.55+row*size*.42,size*.18,size*.12);
        }
      } else if (type === "volcano") {
        ctx.fillStyle = "#2c1515";
        ctx.beginPath();
        ctx.moveTo(x-size,y);
        ctx.lineTo(x,y-size*1.6);
        ctx.lineTo(x+size,y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#ff6b3f";
        ctx.fillRect(x-size*.12,y-size*1.38,size*.24,size*.72);
      } else if (type === "snow") {
        ctx.fillStyle = "#f2fbff";
        ctx.beginPath();
        ctx.moveTo(x-size,y);
        ctx.lineTo(x,y-size*1.7);
        ctx.lineTo(x+size,y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#96bad1";
        ctx.beginPath();
        ctx.moveTo(x-size*.34,y-size*.58);
        ctx.lineTo(x,y-size*1.7);
        ctx.lineTo(x+size*.22,y-size*.85);
        ctx.closePath();
        ctx.fill();
      } else if (type === "ocean" || type === "sunset") {
        ctx.fillStyle = "#153e49";
        ctx.fillRect(x-size*.08,y-size*1.05,size*.16,size*1.05);
        ctx.fillStyle = type === "sunset" ? "#a84b34" : "#d8edf0";
        ctx.beginPath();
        ctx.moveTo(x,y-size*1.55);
        ctx.lineTo(x,y-size*.55);
        ctx.lineTo(x+side*size*.75,y-size*.78);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#70401d";
        ctx.fillRect(x-size*.10,y-size*.82,size*.20,size*.82);
        ctx.fillStyle = "#b76e2d";
        ctx.beginPath();
        ctx.moveTo(x,y-size*1.45);
        ctx.lineTo(x-size*.65,y-size*.28);
        ctx.lineTo(x+size*.65,y-size*.28);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    projectRoad() {
      const points = [];
      const baseIndex = Math.floor(this.position / this.segmentLength);
      const basePercent = (this.position % this.segmentLength) / this.segmentLength;
      const horizon = this.height * .26;
      const bottom = this.height * .94;
      let curveX = 0;
      let curveVelocity = -this.segments[baseIndex % this.segments.length].curve * basePercent * .35;
      let hillY = 0;

      for (let n=0;n<=this.drawDistance;n+=1) {
        const segment = this.segments[(baseIndex+n) % this.segments.length];
        const depth = n / this.drawDistance;
        const perspective = 1 - depth;
        curveX += curveVelocity;
        curveVelocity += segment.curve * .012;
        hillY += segment.hill * .20;

        const roadHalf = 10 + Math.pow(perspective,1.62) * this.width * .47;
        const center = this.width/2
          + curveX * Math.pow(perspective,2.05) * this.width * .072
          - this.playerX * roadHalf * .78;
        const y = horizon
          + Math.pow(perspective,2.05) * (bottom-horizon)
          - hillY * perspective * 1.75;

        points.push({
          n,
          segment,
          perspective,
          center,
          roadHalf,
          y
        });
      }
      return points;
    }

    drawCar(ctx) {
      const x = this.width/2 + this.steerVisual * 22;
      const y = this.height * .83;
      const scale = clamp(this.width / 1500,.68,1.08);

      ctx.save();
      ctx.translate(x,y);
      ctx.rotate(this.steerVisual * .035);
      ctx.scale(scale,scale);

      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(0,36,78,18,0,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "#07090d";
      ctx.fillRect(-70,7,22,51);
      ctx.fillRect(48,7,22,51);

      const body = ctx.createLinearGradient(0,-55,0,54);
      body.addColorStop(0,"#f7c75b");
      body.addColorStop(.42,"#d69c25");
      body.addColorStop(1,"#6f4510");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-48,52);
      ctx.lineTo(-62,2);
      ctx.lineTo(-36,-43);
      ctx.lineTo(-16,-64);
      ctx.lineTo(16,-64);
      ctx.lineTo(36,-43);
      ctx.lineTo(62,2);
      ctx.lineTo(48,52);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#111927";
      ctx.beginPath();
      ctx.moveTo(-24,-40);
      ctx.lineTo(-12,-61);
      ctx.lineTo(12,-61);
      ctx.lineTo(24,-40);
      ctx.lineTo(17,-12);
      ctx.lineTo(-17,-12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#f5d370";
      ctx.fillRect(-77,45,154,12);
      ctx.fillStyle = "#17191d";
      ctx.fillRect(-82,54,164,9);

      ctx.fillStyle = "#eaf7ff";
      ctx.fillRect(-45,23,17,9);
      ctx.fillRect(28,23,17,9);
      ctx.restore();
    }

    draw(now) {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;
      if (!width || !height) return;

      const sky = ctx.createLinearGradient(0,0,0,height*.55);
      sky.addColorStop(0,this.theme.skyTop);
      sky.addColorStop(1,this.theme.skyBottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0,0,width,height);

      // Sun / moon
      ctx.save();
      ctx.globalAlpha = .62;
      ctx.fillStyle = this.track.theme === "neon" ? "#d9c8ff" : "#ffe3a0";
      ctx.beginPath();
      ctx.arc(width*.78,height*.14,Math.max(18,width*.025),0,Math.PI*2);
      ctx.fill();
      ctx.restore();

      const horizon = height*.26;
      ctx.fillStyle = this.theme.groundA;
      ctx.fillRect(0,horizon,width,height-horizon);

      const points = this.projectRoad();
      for (let index=points.length-2;index>=0;index-=1) {
        const far = points[index+1];
        const near = points[index];
        if (near.y <= far.y) continue;

        const grass = near.segment.stripe ? this.theme.groundA : this.theme.groundB;
        ctx.fillStyle = grass;
        ctx.fillRect(0,far.y,width,near.y-far.y+1);

        const rumbleWidthNear = near.roadHalf * .10;
        const rumbleWidthFar = far.roadHalf * .10;
        const rumble = near.segment.stripe ? this.theme.rumbleA : this.theme.rumbleB;
        const road = near.segment.stripe ? this.theme.roadA : this.theme.roadB;

        this.drawPolygon(ctx,rumble,
          far.center-far.roadHalf-rumbleWidthFar,far.y,
          far.center-far.roadHalf,far.y,
          near.center-near.roadHalf,near.y,
          near.center-near.roadHalf-rumbleWidthNear,near.y
        );
        this.drawPolygon(ctx,rumble,
          far.center+far.roadHalf,far.y,
          far.center+far.roadHalf+rumbleWidthFar,far.y,
          near.center+near.roadHalf+rumbleWidthNear,near.y,
          near.center+near.roadHalf,near.y
        );
        this.drawPolygon(ctx,road,
          far.center-far.roadHalf,far.y,
          far.center+far.roadHalf,far.y,
          near.center+near.roadHalf,near.y,
          near.center-near.roadHalf,near.y
        );

        if (index % 8 < 4 && near.perspective > .12) {
          const laneFar = far.roadHalf * .015;
          const laneNear = near.roadHalf * .015;
          this.drawPolygon(ctx,"rgba(245,245,235,.78)",
            far.center-laneFar,far.y,
            far.center+laneFar,far.y,
            near.center+laneNear,near.y,
            near.center-laneNear,near.y
          );
        }

        this.drawScenery(ctx,near,near.segment,index);
      }

      // Speed streaks increase the sensation that the road is coming toward the player.
      if (this.speed > 180) {
        ctx.save();
        ctx.globalAlpha = clamp((this.speed-180)/230,.04,.22);
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = 2;
        for (let i=0;i<16;i+=1) {
          const side = i%2 ? -1 : 1;
          const x = width/2 + side*(width*.24 + (i%8)*width*.025);
          const y = height*.42 + (i%8)*height*.058;
          ctx.beginPath();
          ctx.moveTo(x,y);
          ctx.lineTo(x+side*30,y+70);
          ctx.stroke();
        }
        ctx.restore();
      }

      this.drawCar(ctx);

      if (this.countdown > 0) {
        const number = Math.max(1,Math.ceil(this.countdown));
        ctx.fillStyle = "rgba(2,8,14,.70)";
        ctx.fillRect(0,0,width,height);
        ctx.textAlign = "center";
        ctx.fillStyle = "#f2c55b";
        ctx.font = `900 ${Math.max(72,width*.08)}px system-ui`;
        ctx.fillText(String(number),width/2,height*.53);
        ctx.font = `800 ${Math.max(16,width*.016)}px system-ui`;
        ctx.fillStyle = "#f6fbff";
        ctx.fillText("5 LAP GLOBAL CHALLENGE",width/2,height*.62);
      }

      if (this.paused) {
        ctx.fillStyle = "rgba(2,8,14,.68)";
        ctx.fillRect(0,0,width,height);
      }
    }
  }

  window.F1_RACE_ENGINE = Object.freeze({
    FormulaHorizonEngine,
    formatTime
  });
})();
