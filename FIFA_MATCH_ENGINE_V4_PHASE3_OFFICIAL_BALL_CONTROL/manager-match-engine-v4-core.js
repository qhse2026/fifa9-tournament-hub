(() => {
  "use strict";

  const VERSION = "4.0.0-phase3.1";
  const PITCH = Object.freeze({ length: 100, width: 68, goalY1: 30.34, goalY2: 37.66 });
  const MATCH_SECONDS = 90 * 60;
  const FIXED_STEP = 0.1;

  const FORMATIONS = Object.freeze({
    "4-3-3": [
      ["GK", 6, 34], ["RB", 20, 8], ["RCB", 18, 26], ["LCB", 18, 42], ["LB", 20, 60],
      ["DM", 36, 34], ["RCM", 49, 25], ["LCM", 49, 43], ["RW", 70, 10], ["ST", 81, 34], ["LW", 70, 58]
    ],
    "4-2-3-1": [
      ["GK", 6, 34], ["RB", 20, 8], ["RCB", 18, 26], ["LCB", 18, 42], ["LB", 20, 60],
      ["RDM", 37, 27], ["LDM", 37, 41], ["RW", 65, 10], ["AM", 62, 34], ["LW", 65, 58], ["ST", 81, 34]
    ],
    "4-4-2": [
      ["GK", 6, 34], ["RB", 20, 8], ["RCB", 18, 26], ["LCB", 18, 42], ["LB", 20, 60],
      ["RM", 49, 9], ["RCM", 47, 27], ["LCM", 47, 41], ["LM", 49, 59], ["RST", 78, 27], ["LST", 78, 41]
    ],
    "3-5-2": [
      ["GK", 6, 34], ["RCB", 19, 21], ["CB", 17, 34], ["LCB", 19, 47], ["RWB", 39, 7],
      ["DM", 37, 34], ["RCM", 50, 25], ["LCM", 50, 43], ["LWB", 39, 61], ["RST", 78, 27], ["LST", 78, 41]
    ]
  });

  const DEFAULT_TACTICS = Object.freeze({
    mentality: "balanced",
    inPossession: "positional",
    outPossession: "mid-block",
    winTransition: "secure",
    lossTransition: "regroup",
    tempo: 50,
    width: 52,
    passingDirectness: 48,
    defensiveLine: 52,
    pressing: 50,
    risk: 50,
    fullbackDuty: "balanced",
    cornerRoutine: "mixed"
  });

  const ROLE_BEHAVIOUR = Object.freeze({
    GK: { goalHunger: 0, positionalDiscipline: 95, defensiveResponsibility: 98, risk: 22 },
    FB: { goalHunger: 22, positionalDiscipline: 68, defensiveResponsibility: 78, risk: 48 },
    WB: { goalHunger: 31, positionalDiscipline: 55, defensiveResponsibility: 62, risk: 62 },
    CB: { goalHunger: 18, positionalDiscipline: 88, defensiveResponsibility: 92, risk: 28 },
    DM: { goalHunger: 24, positionalDiscipline: 82, defensiveResponsibility: 86, risk: 36 },
    CM: { goalHunger: 46, positionalDiscipline: 64, defensiveResponsibility: 61, risk: 52 },
    AM: { goalHunger: 72, positionalDiscipline: 44, defensiveResponsibility: 36, risk: 68 },
    WING: { goalHunger: 70, positionalDiscipline: 45, defensiveResponsibility: 44, risk: 71 },
    ST: { goalHunger: 92, positionalDiscipline: 32, defensiveResponsibility: 24, risk: 78 }
  });

  const GOALKEEPER_ARCHETYPES = Object.freeze({
    "line-keeper": { start: 10, sweep: 25, cross: 45, handling: 84, reflex: 88, distribution: 52, eccentricity: 15 },
    "sweeper-keeper": { start: 18, sweep: 86, cross: 62, handling: 78, reflex: 82, distribution: 82, eccentricity: 28 },
    "cross-commander": { start: 12, sweep: 44, cross: 90, handling: 86, reflex: 81, distribution: 58, eccentricity: 18 },
    "playmaker-keeper": { start: 16, sweep: 70, cross: 58, handling: 77, reflex: 80, distribution: 91, eccentricity: 31 },
    "eccentric-keeper": { start: 19, sweep: 78, cross: 70, handling: 72, reflex: 85, distribution: 74, eccentricity: 86 }
  });

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function roleGroup(position) {
    if (position === "GK") return "GK";
    if (["RB", "LB"].includes(position)) return "FB";
    if (["RWB", "LWB"].includes(position)) return "WB";
    if (["CB", "RCB", "LCB"].includes(position)) return "CB";
    if (["DM", "RDM", "LDM"].includes(position)) return "DM";
    if (["CM", "RCM", "LCM"].includes(position)) return "CM";
    if (position === "AM") return "AM";
    if (["RW", "LW", "RM", "LM"].includes(position)) return "WING";
    return "ST";
  }

  function hashSeed(text) {
    let h = 2166136261 >>> 0;
    for (const char of String(text)) {
      h ^= char.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 1;
  }

  class SeededRandom {
    constructor(seed) { this.state = hashSeed(seed); }
    next() {
      let t = this.state += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    int(min, max) { return Math.floor(this.range(min, max + 1)); }
    chance(probability) { return this.next() < clamp(probability, 0, 1); }
    pick(rows) { return rows[Math.floor(this.next() * rows.length)] || rows[0]; }
  }

  function normalizedAttributes(base = 78, positional = {}) {
    const keys = ["pace", "acceleration", "stamina", "strength", "agility", "passing", "vision", "technique", "firstTouch", "dribbling", "finishing", "longShots", "crossing", "tackling", "marking", "heading", "jumping", "decisions", "anticipation", "composure", "concentration", "offBall", "positioning", "teamwork", "workRate"];
    const result = {};
    keys.forEach(key => { result[key] = clamp(Math.round(base + Number(positional[key] || 0)), 35, 96); });
    return result;
  }

  function positionalAdjustments(group) {
    const map = {
      GK: { pace: -18, acceleration: -14, passing: 0, vision: 0, finishing: -40, crossing: -25, tackling: -20, marking: -18, heading: -12, jumping: 10, decisions: 5, positioning: 10 },
      FB: { pace: 7, acceleration: 6, stamina: 9, crossing: 7, tackling: 3, marking: 2, finishing: -10, heading: -6 },
      WB: { pace: 8, acceleration: 8, stamina: 11, crossing: 8, dribbling: 4, tackling: 0, marking: -2, finishing: -6 },
      CB: { pace: -4, acceleration: -5, strength: 10, tackling: 9, marking: 10, heading: 10, jumping: 9, finishing: -17, crossing: -18, agility: -5 },
      DM: { stamina: 6, strength: 5, passing: 4, tackling: 7, marking: 6, positioning: 8, finishing: -9 },
      CM: { stamina: 7, passing: 7, vision: 6, firstTouch: 5, teamwork: 6, finishing: -2 },
      AM: { passing: 8, vision: 10, firstTouch: 8, dribbling: 6, finishing: 4, offBall: 7, tackling: -14, marking: -12 },
      WING: { pace: 9, acceleration: 10, agility: 8, dribbling: 9, crossing: 6, finishing: 3, tackling: -11, marking: -9 },
      ST: { pace: 5, acceleration: 7, strength: 5, finishing: 12, heading: 5, offBall: 11, composure: 8, tackling: -18, marking: -18 }
    };
    return map[group] || {};
  }

  function createBehaviour(group, rng, overrides = {}) {
    const base = ROLE_BEHAVIOUR[group] || ROLE_BEHAVIOUR.CM;
    return {
      goalHunger: clamp(base.goalHunger + rng.int(-8, 8), 0, 100),
      riskAppetite: clamp(base.risk + rng.int(-10, 10), 0, 100),
      positionalDiscipline: clamp(base.positionalDiscipline + rng.int(-8, 8), 0, 100),
      defensiveResponsibility: clamp(base.defensiveResponsibility + rng.int(-8, 8), 0, 100),
      creativity: clamp(50 + rng.int(-15, 20), 10, 95),
      aggression: clamp(50 + rng.int(-18, 18), 10, 95),
      patience: clamp(50 + rng.int(-18, 18), 10, 95),
      transitionUrgency: clamp(50 + rng.int(-15, 20), 10, 95),
      ...overrides
    };
  }

  function defaultRoleFor(position) {
    const group = roleGroup(position);
    return ({ GK: "sweeper-keeper", FB: "overlap", WB: "attacking-wingback", CB: "cover", DM: "anchor", CM: "box-to-box", AM: "shadow-striker", WING: "inverted-winger", ST: "complete-forward" })[group];
  }

  function createTeam(config, side, rng) {
    const formation = FORMATIONS[config.formation] ? config.formation : "4-3-3";
    const direction = side === "home" ? 1 : -1;
    const rating = clamp(Number(config.rating || config.overall || 80), 60, 95);
    const layout = FORMATIONS[formation];
    const goalkeeperArchetype = config.goalkeeperArchetype || (side === "home" ? "sweeper-keeper" : "line-keeper");
    const players = layout.map((row, index) => {
      const [position, baseX, baseY] = row;
      const group = roleGroup(position);
      const ownX = direction === 1 ? baseX : 100 - baseX;
      const positional = positionalAdjustments(group);
      const attributes = normalizedAttributes(rating + rng.int(-4, 4), positional);
      const supplied = Array.isArray(config.players) ? config.players[index] : null;
      return {
        id: supplied?.id || `${side}-${position}-${index + 1}`,
        name: supplied?.name || `${config.name || side} ${position}`,
        number: supplied?.number || index + 1,
        side,
        teamId: config.id || side,
        position,
        group,
        role: supplied?.role || config.roles?.[position] || defaultRoleFor(position),
        anchor: { x: ownX, y: baseY },
        positionNow: { x: ownX, y: baseY },
        previousPosition: { x: ownX, y: baseY },
        targetPosition: { x: ownX, y: baseY },
        velocity: { x: 0, y: 0 },
        facing: direction === 1 ? 0 : Math.PI,
        hasBall: false,
        currentIntent: "HOLD_SHAPE",
        energy: 100,
        fatigue: 0,
        yellow: false,
        attributes: { ...attributes, ...(supplied?.attributes || {}) },
        behaviour: createBehaviour(group, rng, supplied?.behaviour),
        goalkeeper: group === "GK" ? { ...(GOALKEEPER_ARCHETYPES[goalkeeperArchetype] || GOALKEEPER_ARCHETYPES["line-keeper"]), archetype: goalkeeperArchetype } : null
      };
    });
    return {
      id: config.id || side,
      name: config.name || (side === "home" ? "Home" : "Away"),
      side,
      direction,
      formation,
      rating,
      tactics: { ...DEFAULT_TACTICS, ...(config.tactics || {}) },
      players,
      score: 0,
      stats: createStats(),
      possessionSeconds: 0,
      phase: "BUILD_UP",
      emergencyTargetId: null
    };
  }

  function createStats() {
    return {
      shots: 0, onTarget: 0, blocked: 0, goals: 0, xg: 0,
      passesAttempted: 0, passesCompleted: 0, progressivePasses: 0,
      shortPassesAttempted: 0, shortPassesCompleted: 0,
      mediumPassesAttempted: 0, mediumPassesCompleted: 0,
      longPassesAttempted: 0, longPassesCompleted: 0,
      finalThirdPassesAttempted: 0, finalThirdPassesCompleted: 0,
      carries: 0, dribblesAttempted: 0, dribblesCompleted: 0,
      crossesAttempted: 0, crossesCompleted: 0,
      corners: 0, fouls: 0, yellow: 0, red: 0,
      tacklesAttempted: 0, tacklesWon: 0, interceptions: 0,
      recoveries: 0, turnovers: 0, badTouches: 0,
      looseBalls: 0, looseBallsWon: 0, secondBallsWon: 0,
      entriesFinalThird: 0, entriesBox: 0, offsides: 0,
      possession: 50
    };
  }

  function getPlayer(engine, id) {
    return engine.teams.home.players.concat(engine.teams.away.players).find(player => player.id === id) || null;
  }

  function teamBySide(engine, side) { return engine.teams[side]; }
  function opponentSide(side) { return side === "home" ? "away" : "home"; }
  function opponentTeam(engine, side) { return teamBySide(engine, opponentSide(side)); }
  function attackGoalX(team) { return team.direction === 1 ? 100 : 0; }
  function ownGoalX(team) { return team.direction === 1 ? 0 : 100; }
  function progressFor(team, x) { return team.direction === 1 ? x : 100 - x; }
  function isWide(y) { return y < 23 || y > 45; }
  function isInBox(team, point) {
    const progress = progressFor(team, point.x);
    return progress >= 83 && point.y >= 13.84 && point.y <= 54.16;
  }

  function emit(engine, type, payload = {}) {
    const event = {
      id: `v4-${engine.events.length + 1}`,
      type,
      second: Math.floor(engine.clockSeconds),
      minute: Math.floor(engine.clockSeconds / 60),
      ...payload
    };
    engine.events.push(event);
    if (engine.events.length > 500) engine.events.splice(0, engine.events.length - 500);
    engine.listeners.forEach(listener => {
      try { listener(event); } catch (error) { console.warn("V4 event listener failed", error); }
    });
    return event;
  }

  function nearestPlayers(players, point, limit = 3, predicate = () => true) {
    return players.filter(predicate).map(player => ({ player, d: distance(player.positionNow, point) })).sort((a, b) => a.d - b.d).slice(0, limit);
  }

  function pressureAt(engine, player) {
    const opponents = opponentTeam(engine, player.side).players;
    const nearest = nearestPlayers(opponents, player.positionNow, 3);
    return clamp(nearest.reduce((sum, row) => sum + Math.max(0, 12 - row.d) * 4.5, 0), 0, 100);
  }

  function coverCount(team, ballX) {
    return team.players.filter(player => player.group !== "GK" && progressFor(team, player.positionNow.x) < progressFor(team, ballX) - 3).length;
  }

  function opponentCounterThreat(team, opponent) {
    const attackers = opponent.players.filter(player => ["ST", "WING", "AM"].includes(player.group));
    const speed = attackers.reduce((sum, player) => sum + player.attributes.pace, 0) / Math.max(1, attackers.length);
    return clamp((attackers.length * 12 + speed * 0.65 + (opponent.tactics.winTransition === "counter" ? 12 : 0)), 0, 100);
  }

  function fullbackAttackLicence(engine, player, team, opponent) {
    const ball = engine.ball.position;
    const sameSide = (player.positionNow.y < 34 && ball.y < 38) || (player.positionNow.y > 34 && ball.y > 30);
    const wideSpace = isWide(ball.y) ? 68 : 48;
    const possessionSecurity = engine.ball.ownerId ? clamp(100 - pressureAt(engine, getPlayer(engine, engine.ball.ownerId)), 10, 95) : 40;
    const cover = coverCount(team, ball.x);
    const counterThreat = opponentCounterThreat(team, opponent);
    const urgency = matchUrgency(engine, team);
    const duty = team.tactics.fullbackDuty === "attack" ? 18 : team.tactics.fullbackDuty === "defend" ? -22 : 0;
    const score =
      duty + wideSpace * 0.20 + possessionSecurity * 0.18 + cover * 5.5 + urgency * 0.18 + player.behaviour.riskAppetite * 0.12 +
      (sameSide ? 9 : -4) - counterThreat * 0.18 - player.fatigue * 0.35;
    return clamp(score, 0, 100);
  }

  function matchUrgency(engine, team) {
    const opponent = opponentTeam(engine, team.side);
    const minute = engine.clockSeconds / 60;
    const deficit = opponent.score - team.score;
    if (minute < 55) return clamp(45 + deficit * 8, 20, 75);
    return clamp(48 + deficit * 18 + Math.max(0, minute - 70) * 1.25, 15, 100);
  }

  function restDefenceSecurity(engine, team) {
    const opponent = opponentTeam(engine, team.side);
    const behind = team.players.filter(player => player.group !== "GK" && progressFor(team, player.positionNow.x) < 54).length;
    const centralCover = team.players.filter(player => ["CB", "DM"].includes(player.group) && progressFor(team, player.positionNow.x) < 58).length;
    const recovery = team.players.filter(player => ["CB", "FB", "WB", "DM"].includes(player.group)).reduce((sum, player) => sum + player.attributes.pace, 0) / 6;
    return clamp(behind * 7 + centralCover * 10 + recovery * 0.28 - opponentCounterThreat(team, opponent) * 0.30, 0, 100);
  }

  function determinePhase(engine, team) {
    if (engine.restart) return "SET_PIECE";
    const p = progressFor(team, engine.ball.position.x);
    if (engine.lastPossessionChangeAgo < 6) return engine.ball.teamSide === team.side ? "ATTACKING_TRANSITION" : "DEFENSIVE_TRANSITION";
    if (p < 34) return "BUILD_UP";
    if (p < 67) return "PROGRESSION";
    if (p < 82) return "FINAL_THIRD";
    return "CHANCE_CREATION";
  }

  function updateEmergencyTarget(engine, team) {
    const minute = engine.clockSeconds / 60;
    const opponent = opponentTeam(engine, team.side);
    const externalScore = engine.externalContext?.score;
    const ownScore = Number.isFinite(Number(externalScore?.[team.side])) ? Number(externalScore[team.side]) : team.score;
    const opponentScore = Number.isFinite(Number(externalScore?.[opponent.side])) ? Number(externalScore[opponent.side]) : opponent.score;
    if (minute < 82 || ownScore >= opponentScore) {
      team.emergencyTargetId = null;
      return;
    }
    const candidate = team.players.filter(player => player.group === "CB").sort((a, b) => (b.attributes.heading + b.attributes.jumping + b.attributes.strength) - (a.attributes.heading + a.attributes.jumping + a.attributes.strength))[0];
    team.emergencyTargetId = candidate?.id || null;
  }

  function tacticalTarget(engine, player) {
    const team = teamBySide(engine, player.side);
    const opponent = opponentTeam(engine, player.side);
    const ball = engine.ball.position;
    const teamInPossession = engine.ball.teamSide === player.side;
    const phase = determinePhase(engine, team);
    team.phase = phase;
    updateEmergencyTarget(engine, team);

    let x = player.anchor.x;
    let y = player.anchor.y;
    const direction = team.direction;
    const progress = progressFor(team, ball.x);
    const ballShiftY = (ball.y - 34) * 0.23;
    const compactness = team.tactics.outPossession === "low-block" ? 0.62 : team.tactics.outPossession === "high-press" ? 1.08 : 0.82;

    if (player.group === "GK") {
      const gk = player.goalkeeper;
      const base = ownGoalX(team) + direction * (6 + gk.start * 0.11 + team.tactics.defensiveLine * 0.055);
      x = base;
      y = clamp(34 + (ball.y - 34) * 0.22, 25, 43);
      if (teamInPossession) x += direction * 2.5;
      player.currentIntent = gk.sweep > 70 && progressFor(opponent, ball.x) > 68 ? "SWEEP_SPACE" : "GOALKEEPER_POSITION";
      return { x: clamp(x, 2, 98), y };
    }

    if (teamInPossession) {
      const shiftX = direction * clamp((progress - 38) * 0.24, -4, 12);
      x += shiftX;
      y = clamp(y + ballShiftY, 4, 64);

      if (["FB", "WB"].includes(player.group)) {
        const licence = fullbackAttackLicence(engine, player, team, opponent);
        const otherWideBacks = team.players.filter(p => p.id !== player.id && ["FB", "WB"].includes(p.group));
        const otherHigh = otherWideBacks.some(p => progressFor(team, p.targetPosition?.x ?? p.positionNow.x) > 66);
        const restSecurity = restDefenceSecurity(engine, team);
        const allowed = licence >= 58 && (!otherHigh || restSecurity >= 68);
        if (allowed) {
          const insideWinger = team.players.some(p => p.group === "WING" && Math.sign(p.anchor.y - 34) === Math.sign(player.anchor.y - 34) && Math.abs(p.positionNow.y - 34) < 18);
          x = player.anchor.x + direction * (player.group === "WB" ? 31 : 34);
          y = insideWinger ? (player.anchor.y < 34 ? 7 : 61) : clamp(player.anchor.y + (player.anchor.y < 34 ? 7 : -7), 8, 60);
          player.currentIntent = insideWinger ? "OVERLAP" : "UNDERLAP_SUPPORT";
        } else {
          x = player.anchor.x + direction * 8;
          player.currentIntent = "REST_DEFENCE";
        }
      } else if (player.group === "CB" && team.emergencyTargetId === player.id) {
        x = attackGoalX(team) - direction * 13;
        y = 34 + (player.anchor.y < 34 ? -5 : 5);
        player.currentIntent = "EMERGENCY_TARGET_FORWARD";
      } else if (player.group === "CB") {
        x += direction * 6;
        y = clamp(y + ballShiftY * 0.35, 17, 51);
        player.currentIntent = "BUILD_SUPPORT";
      } else if (player.group === "DM") {
        x += direction * 8;
        y = clamp(34 + ballShiftY * 0.45, 22, 46);
        player.currentIntent = "SECURE_CENTRE";
      } else if (player.group === "CM") {
        x += direction * (phase === "CHANCE_CREATION" ? 14 : 7);
        player.currentIntent = phase === "CHANCE_CREATION" ? "LATE_BOX_RUN" : "SUPPORT_TRIANGLE";
      } else if (player.group === "AM") {
        x += direction * 10;
        y = clamp(34 + ballShiftY * 0.25, 21, 47);
        player.currentIntent = "BETWEEN_LINES";
      } else if (player.group === "WING") {
        const inverted = player.role.includes("inverted") || player.behaviour.goalHunger > 72;
        x += direction * 10;
        if (inverted && progress > 60) y = lerp(y, 34, 0.42);
        else y = player.anchor.y < 34 ? clamp(6 + ballShiftY * 0.15, 4, 18) : clamp(62 + ballShiftY * 0.15, 50, 64);
        player.currentIntent = inverted ? "INSIDE_FORWARD_RUN" : "HOLD_WIDTH";
      } else if (player.group === "ST") {
        const passer = engine.ball.ownerId ? getPlayer(engine, engine.ball.ownerId) : null;
        const passerControl = passer ? 100 - pressureAt(engine, passer) : 30;
        const spaceBehind = clamp((team.direction === 1 ? 92 - x : x - 8) + opponent.tactics.defensiveLine * 0.22, 0, 100);
        const runScore = spaceBehind * 0.31 + passerControl * 0.28 + player.attributes.offBall * 0.23 + player.attributes.acceleration * 0.18;
        x = runScore > 61 ? attackGoalX(team) - direction * 8.5 : player.anchor.x + direction * 5;
        y = clamp(34 + (player.anchor.y - 34) * 0.42 + ballShiftY * 0.1, 22, 46);
        player.currentIntent = runScore > 61 ? "RUN_BEHIND" : "PIN_CENTRE_BACK";
      }
    } else {
      x = ownGoalX(team) + direction * (progressFor(team, player.anchor.x) * compactness + (team.tactics.outPossession === "low-block" ? 5 : 10));
      y = clamp(34 + (player.anchor.y - 34) * compactness + ballShiftY * 0.55, 6, 62);
      if (player.group === "ST") {
        x = ownGoalX(team) + direction * (team.tactics.outPossession === "high-press" ? 62 : team.tactics.outPossession === "low-block" ? 44 : 53);
        player.currentIntent = team.tactics.outPossession === "high-press" ? "PRESS_TRIGGER" : "SCREEN_PIVOT";
      } else if (player.group === "WING") {
        player.currentIntent = "TRACK_CHANNEL";
      } else if (["CB", "FB", "WB"].includes(player.group)) {
        player.currentIntent = "PROTECT_BOX";
      } else {
        player.currentIntent = "COMPACT_BLOCK";
      }
    }
    return { x: clamp(x, 2, 98), y: clamp(y, 3, 65) };
  }

  function updatePlayerMovement(engine, dt) {
    const all = engine.teams.home.players.concat(engine.teams.away.players);
    all.forEach(player => {
      player.previousPosition = { ...player.positionNow };
      player.targetPosition = tacticalTarget(engine, player);
      const d = distance(player.positionNow, player.targetPosition);
      const maxSpeed = (player.attributes.pace / 10.5) * (0.65 + player.energy / 250);
      const desired = Math.min(maxSpeed, d * 1.8);
      const ux = d > 0.001 ? (player.targetPosition.x - player.positionNow.x) / d : 0;
      const uy = d > 0.001 ? (player.targetPosition.y - player.positionNow.y) / d : 0;
      const acceleration = player.attributes.acceleration / 18;
      player.velocity.x = lerp(player.velocity.x, ux * desired, clamp(acceleration * dt, 0, 1));
      player.velocity.y = lerp(player.velocity.y, uy * desired, clamp(acceleration * dt, 0, 1));
      player.positionNow.x = clamp(player.positionNow.x + player.velocity.x * dt, 1, 99);
      player.positionNow.y = clamp(player.positionNow.y + player.velocity.y * dt, 2, 66);
      if (Math.hypot(player.velocity.x, player.velocity.y) > 0.2) player.facing = Math.atan2(player.velocity.y, player.velocity.x);
      const work = Math.hypot(player.velocity.x, player.velocity.y) / Math.max(1, maxSpeed);
      const tacticalLoad = teamBySide(engine, player.side).tactics.outPossession === "high-press" ? 1.22 : 1;
      player.fatigue = clamp(player.fatigue + dt * 0.0018 * work * tacticalLoad, 0, 100);
      player.energy = clamp(100 - player.fatigue * 0.92, 35, 100);
    });
  }

  function findPassOptions(engine, owner) {
    const team = teamBySide(engine, owner.side);
    return team.players.filter(player => player.id !== owner.id).map(receiver => {
      const d = distance(owner.positionNow, receiver.positionNow);
      const forward = (receiver.positionNow.x - owner.positionNow.x) * team.direction;
      const laneOpponents = opponentTeam(engine, owner.side).players.filter(opponent => {
        const ax = owner.positionNow.x, ay = owner.positionNow.y;
        const bx = receiver.positionNow.x, by = receiver.positionNow.y;
        const vx = bx - ax, vy = by - ay;
        const wx = opponent.positionNow.x - ax, wy = opponent.positionNow.y - ay;
        const len2 = vx * vx + vy * vy || 1;
        const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
        const px = ax + vx * t, py = ay + vy * t;
        return Math.hypot(opponent.positionNow.x - px, opponent.positionNow.y - py) < 4.8;
      }).length;
      const receiverSpace = 100 - pressureAt(engine, receiver);
      const progressValue = clamp(forward * 2.2, -25, 50);
      const roleBonus = ["ST", "WING", "AM"].includes(receiver.group) ? 6 : 0;
      const score = receiverSpace * 0.31 + progressValue + owner.attributes.vision * 0.18 + roleBonus - laneOpponents * 17 - d * 0.35;
      return { receiver, d, forward, laneOpponents, receiverSpace, score };
    }).filter(row => row.d < 45).sort((a, b) => b.score - a.score);
  }

  function scoringOpportunity(engine, shooter) {
    const team = teamBySide(engine, shooter.side);
    const goal = { x: attackGoalX(team), y: 34 };
    const d = distance(shooter.positionNow, goal);
    const angle = Math.atan2(7.32, Math.max(1, d)) * 180 / Math.PI;
    const pressure = pressureAt(engine, shooter);
    const goalkeeper = opponentTeam(engine, shooter.side).players.find(player => player.group === "GK");
    const keeperDisplacement = goalkeeper ? Math.abs(goalkeeper.positionNow.y - shooter.positionNow.y) : 0;
    const body = Math.max(0, Math.cos(shooter.facing - (team.direction === 1 ? 0 : Math.PI)));
    return clamp(
      112 - d * 2.25 + angle * 0.65 - pressure * 0.45 + keeperDisplacement * 0.65 + body * 12 + shooter.attributes.offBall * 0.12,
      0, 100
    );
  }

  function chooseAction(engine, owner) {
    const team = teamBySide(engine, owner.side);
    const progress = progressFor(team, owner.positionNow.x);
    const pressure = pressureAt(engine, owner);
    const opportunity = scoringOpportunity(engine, owner);
    const passOptions = findPassOptions(engine, owner);
    const bestPass = passOptions[0];
    const actions = [];

    const finishingWindow = opportunity + owner.attributes.anticipation * 0.10 + owner.attributes.composure * 0.08 - pressure * 0.34 + engine.rng.range(-9, 9);
    const windowProbability = clamp((finishingWindow - 62) / 850, 0, 0.045);
    const shotWindowOpen = progress >= 74 && finishingWindow >= 66 && Number(engine.possessionActions || 0) >= 2 && engine.clockSeconds - Number(engine.lastShotAt || -999) >= 21 && engine.rng.chance(windowProbability);
    if (shotWindowOpen) {
      const shotUrge = 62 + (opportunity - 55) * 0.42 + owner.attributes.finishing * 0.10 + owner.behaviour.goalHunger * 0.06 - pressure * 0.12;
      actions.push({ type: "SHOT", score: shotUrge });
    }
    if (isWide(owner.positionNow.y) && progress >= 66 && engine.clockSeconds - Number(engine.lastCrossAt || -999) >= 10 && engine.rng.chance(0.068)) {
      const targets = team.players.filter(player => ["ST", "AM", "CM", "CB"].includes(player.group) && progressFor(team, player.positionNow.x) >= 72);
      const crossScore = owner.attributes.crossing * 0.42 + targets.length * 7 + (100 - pressure) * 0.18 + team.tactics.width * 0.16 + 8;
      actions.push({ type: "CROSS", score: crossScore });
    }
    if (bestPass) {
      const passScore = bestPass.score + owner.attributes.passing * 0.18 + 8 + (team.tactics.inPossession === "vertical" ? bestPass.forward * 0.55 : 0);
      actions.push({ type: "PASS", score: passScore, option: bestPass });
    }
    const carryScore = owner.attributes.dribbling * 0.22 + owner.attributes.acceleration * 0.10 + (100 - pressure) * 0.14 + (progress < 74 ? 5 : -6) + team.tactics.risk * 0.08;
    actions.push({ type: "CARRY", score: carryScore });
    actions.sort((a, b) => b.score - a.score);
    const top = actions[0];
    const second = actions[1];
    if (second && engine.rng.chance(0.18 + owner.behaviour.creativity / 500)) return engine.rng.chance(0.32) ? second : top;
    return top;
  }

  function setBallOwner(engine, player, reason = "CONTROL", options = {}) {
    engine.teams.home.players.concat(engine.teams.away.players).forEach(row => { row.hasBall = false; });
    if (player) {
      player.hasBall = true;
      engine.ball.ownerId = player.id;
      engine.ball.teamSide = player.side;
      engine.ball.position = { ...player.positionNow };
      engine.ball.velocity = { x: 0, y: 0 };
      engine.ball.height = 0;
      engine.ball.state = "CONTROLLED";
      engine.possessionSide = player.side;
    } else {
      engine.ball.ownerId = null;
      if (!options.keepState) engine.ball.state = "LOOSE";
    }
    if (!options.keepAction) engine.activeBallAction = null;
    engine.ball.reason = reason;
  }

  function changePossession(engine, player, type) {
    const previousSide = engine.possessionSide;
    setBallOwner(engine, player, type);
    engine.lastPossessionChangeAgo = 0;
    engine.possessionActions = 0;
    if (previousSide && previousSide !== player.side) {
      teamBySide(engine, previousSide).stats.turnovers += 1;
      teamBySide(engine, player.side).stats.recoveries += 1;
    }
    emit(engine, "POSSESSION_CHANGE", { side: player.side, playerId: player.id, previousSide, reason: type });
  }


  function passBand(distanceValue) {
    if (distanceValue < 14) return "short";
    if (distanceValue < 29) return "medium";
    return "long";
  }

  function incrementPassBand(stats, band, completed = false) {
    const suffix = completed ? "Completed" : "Attempted";
    const key = `${band}Passes${suffix}`;
    stats[key] = Number(stats[key] || 0) + 1;
  }

  function pointOnSegment(start, end, t) {
    return { x: lerp(start.x, end.x, t), y: lerp(start.y, end.y, t) };
  }

  function projectToSegment(point, start, end) {
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const lengthSquared = vx * vx + vy * vy || 1;
    const t = clamp(((point.x - start.x) * vx + (point.y - start.y) * vy) / lengthSquared, 0, 1);
    const projection = pointOnSegment(start, end, t);
    return { t, point: projection, distance: distance(point, projection) };
  }

  function playerTravelSpeed(player) {
    return 4.2 + player.attributes.pace / 18 + player.energy / 100;
  }

  function laneInterceptionCandidate(engine, owner, receiver, start, end, ballDuration) {
    const opponents = opponentTeam(engine, owner.side).players.filter(player => player.group !== "GK" || distance(player.positionNow, end) < 18);
    let best = null;
    opponents.forEach(player => {
      const projection = projectToSegment(player.positionNow, start, end);
      if (projection.t < 0.10 || projection.t > 0.94 || projection.distance > 8.5) return;
      const reaction = clamp((100 - player.attributes.anticipation) / 115 + (100 - player.attributes.concentration) / 180, 0.05, 1.15);
      const arrival = projection.distance / playerTravelSpeed(player) + reaction;
      const ballArrival = ballDuration * projection.t;
      const margin = ballArrival - arrival + player.attributes.positioning / 420 + engine.rng.range(-0.12, 0.12);
      if (!best || margin > best.margin) best = { player, margin, projection };
    });
    return best && best.margin > -0.03 ? best : null;
  }

  function createLooseBall(engine, point, options = {}) {
    const sourceSide = options.sourceSide || engine.ball.teamSide || engine.possessionSide;
    engine.activeBallAction = null;
    engine.ball.ownerId = null;
    engine.ball.position = { x: clamp(point.x, 1, 99), y: clamp(point.y, 2, 66) };
    engine.ball.velocity = { x: Number(options.velocity?.x || 0), y: Number(options.velocity?.y || 0) };
    engine.ball.height = clamp(Number(options.height || 0), 0, 8);
    engine.ball.state = "LOOSE";
    engine.ball.reason = options.reason || "LOOSE_BALL";
    const all = engine.teams.home.players.concat(engine.teams.away.players);
    all.forEach(player => { player.hasBall = false; });
    const contenders = nearestPlayers(all, engine.ball.position, 8).map(row => {
      const player = row.player;
      const reaction = clamp((100 - player.attributes.anticipation) / 120 + (100 - player.attributes.concentration) / 190, 0.04, 1.1);
      const aggressionBonus = player.behaviour.aggression / 540;
      const arrival = row.d / playerTravelSpeed(player) + reaction - aggressionBonus + engine.rng.range(-0.08, 0.08);
      return { playerId: player.id, arrival };
    }).sort((a, b) => a.arrival - b.arrival);
    engine.looseBallState = {
      startedAt: engine.clockSeconds,
      settleAt: engine.clockSeconds + clamp(Number(options.settleSeconds || contenders[0]?.arrival || 0.8), 0.35, 2.1),
      sourceSide,
      source: options.source || "OPEN_PLAY",
      secondBall: Boolean(options.secondBall),
      contenders
    };
    if (sourceSide && teamBySide(engine, sourceSide)) teamBySide(engine, sourceSide).stats.looseBalls += 1;
    emit(engine, "BALL_LOOSE", { position: { ...engine.ball.position }, sourceSide, source: engine.looseBallState.source, secondBall: engine.looseBallState.secondBall });
    engine.nextDecisionIn = 999;
  }

  function updateLooseBall(engine, dt) {
    const loose = engine.looseBallState;
    if (!loose) return false;
    engine.ball.position.x = clamp(engine.ball.position.x + engine.ball.velocity.x * dt, 1, 99);
    engine.ball.position.y = clamp(engine.ball.position.y + engine.ball.velocity.y * dt, 2, 66);
    engine.ball.velocity.x *= Math.pow(0.32, dt);
    engine.ball.velocity.y *= Math.pow(0.32, dt);
    engine.ball.height = Math.max(0, engine.ball.height - dt * 5.8);
    if (engine.clockSeconds + 1e-6 < loose.settleAt) return true;
    const winner = loose.contenders.map(row => ({ row, player: getPlayer(engine, row.playerId) })).filter(item => item.player).sort((a, b) => a.row.arrival - b.row.arrival)[0]?.player;
    engine.looseBallState = null;
    if (!winner) {
      engine.nextDecisionIn = 0.4;
      return false;
    }
    const sameSide = winner.side === loose.sourceSide;
    setBallOwner(engine, winner, loose.secondBall ? "SECOND_BALL_WON" : "LOOSE_BALL_RECOVERY");
    teamBySide(engine, winner.side).stats.looseBallsWon += 1;
    if (loose.secondBall) teamBySide(engine, winner.side).stats.secondBallsWon += 1;
    if (!sameSide) {
      teamBySide(engine, loose.sourceSide).stats.turnovers += 1;
      teamBySide(engine, winner.side).stats.recoveries += 1;
      engine.lastPossessionChangeAgo = 0;
      engine.possessionActions = 0;
    }
    emit(engine, loose.secondBall ? "SECOND_BALL_WON" : "LOOSE_BALL_WON", { side: winner.side, playerId: winner.id, previousSide: loose.sourceSide, source: loose.source });
    engine.nextDecisionIn = engine.rng.range(2.0, 4.0);
    return false;
  }

  function firstTouchResult(engine, receiver, action) {
    if (action.debugTouchOutcome) return action.debugTouchOutcome;
    const pressure = pressureAt(engine, receiver);
    const passSpeedPenalty = clamp((action.speed - 17) * 2.4, 0, 26);
    const aerialPenalty = action.isCross ? 8 + action.peakHeight * 1.5 : action.peakHeight * 0.8;
    const quality = receiver.attributes.firstTouch * 0.35 + receiver.attributes.technique * 0.15 + receiver.attributes.composure * 0.12 + receiver.attributes.anticipation * 0.08 + action.passQuality * 0.22 + 18 - pressure * 0.18 - passSpeedPenalty * 0.60 - aerialPenalty * 0.50 + engine.rng.range(-8, 8);
    if (quality >= 72) return "CLEAN";
    if (quality >= 57) return "HEAVY";
    return "MISCONTROL";
  }

  function completePassArrival(engine, action) {
    const owner = getPlayer(engine, action.ownerId);
    const receiver = getPlayer(engine, action.receiverId);
    const team = owner ? teamBySide(engine, owner.side) : null;
    engine.activeBallAction = null;
    if (!owner || !receiver || !team) {
      createLooseBall(engine, engine.ball.position, { sourceSide: action.side, source: "ORPHANED_PASS", secondBall: true });
      return;
    }
    if (action.outcome === "INTERCEPTION") {
      const interceptor = getPlayer(engine, action.interceptorId);
      if (interceptor) {
        opponentTeam(engine, owner.side).stats.interceptions += 1;
        changePossession(engine, interceptor, "INTERCEPTION");
        emit(engine, "PASS_INTERCEPTED", { side: owner.side, playerId: owner.id, receiverId: receiver.id, opponentId: interceptor.id, at: { ...engine.ball.position } });
        engine.nextDecisionIn = engine.rng.range(3.0, 5.5);
        return;
      }
    }
    if (action.outcome === "DEFLECTION") {
      emit(engine, action.isCross ? "CROSS_DEFLECTED" : "PASS_DEFLECTED", { side: owner.side, playerId: owner.id, receiverId: receiver.id, at: { ...engine.ball.position } });
      createLooseBall(engine, engine.ball.position, { sourceSide: owner.side, source: action.isCross ? "CROSS_DEFLECTION" : "PASS_DEFLECTION", secondBall: true, velocity: { x: team.direction * engine.rng.range(-1.5, 2.5), y: engine.rng.range(-2.4, 2.4) } });
      return;
    }
    if (action.outcome === "MISPLACED") {
      const missPoint = {
        x: clamp(engine.ball.position.x + team.direction * engine.rng.range(-1.5, 3.8), 1, 99),
        y: clamp(engine.ball.position.y + engine.rng.range(-4.5, 4.5), 2, 66)
      };
      emit(engine, action.isCross ? "CROSS_MISPLACED" : "PASS_MISPLACED", { side: owner.side, playerId: owner.id, receiverId: receiver.id, at: missPoint });
      createLooseBall(engine, missPoint, { sourceSide: owner.side, source: action.isCross ? "CROSS_MISPLACED" : "PASS_MISPLACED", secondBall: false, velocity: { x: team.direction * engine.rng.range(-0.8, 1.8), y: engine.rng.range(-1.7, 1.7) } });
      return;
    }
    team.stats.passesCompleted += 1;
    incrementPassBand(team.stats, action.band, true);
    if (action.isCross) team.stats.crossesCompleted += 1;
    if (action.finalThirdPass) team.stats.finalThirdPassesCompleted += 1;
    if (action.forward > 8) team.stats.progressivePasses += 1;
    if (action.finalThirdEntry) team.stats.entriesFinalThird += 1;
    if (action.boxEntry) team.stats.entriesBox += 1;
    const touch = firstTouchResult(engine, receiver, action);
    emit(engine, action.isCross ? "CROSS_COMPLETE" : "PASS_COMPLETE", { side: owner.side, playerId: owner.id, receiverId: receiver.id, touch });
    if (touch === "CLEAN") {
      setBallOwner(engine, receiver, action.isCross ? "CROSS_CONTROLLED" : "PASS_CONTROLLED");
      engine.nextDecisionIn = engine.rng.range(3.0, 5.4);
      return;
    }
    team.stats.badTouches += 1;
    const push = touch === "HEAVY" ? engine.rng.range(2.0, 4.7) : engine.rng.range(3.4, 7.2);
    const loosePoint = {
      x: clamp(receiver.positionNow.x + team.direction * push, 1, 99),
      y: clamp(receiver.positionNow.y + engine.rng.range(-3.5, 3.5), 2, 66)
    };
    emit(engine, touch === "HEAVY" ? "HEAVY_FIRST_TOUCH" : "MISCONTROL", { side: receiver.side, playerId: receiver.id, position: loosePoint });
    createLooseBall(engine, loosePoint, {
      sourceSide: receiver.side,
      source: touch === "HEAVY" ? "HEAVY_FIRST_TOUCH" : "MISCONTROL",
      secondBall: true,
      velocity: { x: team.direction * engine.rng.range(0.6, 2.3), y: engine.rng.range(-1.3, 1.3) }
    });
  }

  function updateBallFlight(engine, dt) {
    const action = engine.activeBallAction;
    if (!action) return false;
    action.elapsed = Math.min(action.duration, action.elapsed + dt);
    const raw = clamp(action.elapsed / action.duration, 0, 1);
    const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
    const previous = { ...engine.ball.position };
    engine.ball.position = pointOnSegment(action.start, action.end, eased);
    engine.ball.velocity = { x: (engine.ball.position.x - previous.x) / Math.max(dt, 0.001), y: (engine.ball.position.y - previous.y) / Math.max(dt, 0.001) };
    engine.ball.height = Math.sin(Math.PI * raw) * action.peakHeight;
    engine.ball.state = "IN_FLIGHT";
    engine.ball.reason = action.isCross ? "CROSS_FLIGHT" : "PASS_FLIGHT";
    if (raw >= 1) completePassArrival(engine, action);
    return true;
  }

  function startPassFlight(engine, owner, receiver, option = {}, isCross = false, debug = {}) {
    const team = teamBySide(engine, owner.side);
    const start = { ...owner.positionNow };
    const lead = clamp(distance(owner.positionNow, receiver.positionNow) / 25, 0.18, 0.85);
    const intendedEnd = debug.end || {
      x: clamp(receiver.positionNow.x + receiver.velocity.x * lead, 1, 99),
      y: clamp(receiver.positionNow.y + receiver.velocity.y * lead, 2, 66)
    };
    const passDistance = distance(start, intendedEnd);
    const pressure = pressureAt(engine, owner);
    const execution = owner.attributes.passing * 0.40 + owner.attributes.vision * 0.19 + owner.attributes.technique * 0.13 + owner.attributes.composure * 0.12 + (100 - pressure) * 0.10;
    const passQuality = clamp(execution + engine.rng.range(-8, 8) - (isCross ? 4 : 0), 25, 98);
    const speed = clamp(13 + passQuality / 7 + (isCross ? 2 : 0), 14, 29);
    const duration = clamp(passDistance / speed, 0.32, 2.7);
    const candidate = laneInterceptionCandidate(engine, owner, receiver, start, intendedEnd, duration);
    let outcome = debug.outcome || "TEAMMATE";
    let end = intendedEnd;
    let interceptorId = null;
    if (!debug.outcome && candidate) {
      const laneRisk = clamp(0.12 + candidate.margin * 0.36 + pressure / 340 + (100 - passQuality) / 270, 0.05, 0.64);
      if (engine.rng.chance(laneRisk)) {
        const outcomeRoll = engine.rng.next();
        outcome = outcomeRoll < 0.30 ? "INTERCEPTION" : outcomeRoll < 0.64 ? "DEFLECTION" : "MISPLACED";
        end = candidate.projection.point;
        interceptorId = candidate.player.id;
      }
    }
    if (debug.outcome === "INTERCEPTION" && debug.interceptorId) interceptorId = debug.interceptorId;
    const band = passBand(passDistance);
    team.stats.passesAttempted += 1;
    incrementPassBand(team.stats, band, false);
    if (isCross) team.stats.crossesAttempted += 1;
    const finalThirdEntry = progressFor(team, intendedEnd.x) >= 67 && progressFor(team, start.x) < 67;
    const boxEntry = isInBox(team, intendedEnd) && !isInBox(team, start);
    if (progressFor(team, intendedEnd.x) >= 67) team.stats.finalThirdPassesAttempted += 1;
    engine.teams.home.players.concat(engine.teams.away.players).forEach(player => { player.hasBall = false; });
    engine.ball.ownerId = null;
    engine.ball.teamSide = owner.side;
    engine.ball.state = "IN_FLIGHT";
    engine.ball.reason = isCross ? "CROSS_FLIGHT" : "PASS_FLIGHT";
    engine.activeBallAction = {
      id: `ball-action-${engine.ballActionSequence += 1}`,
      type: isCross ? "CROSS" : "PASS",
      isCross,
      side: owner.side,
      ownerId: owner.id,
      receiverId: receiver.id,
      interceptorId,
      start,
      intendedEnd,
      end,
      duration: outcome === "TEAMMATE" ? duration : clamp(duration * projectToSegment(end, start, intendedEnd).t, 0.22, duration),
      elapsed: 0,
      peakHeight: isCross ? clamp(2.3 + passDistance / 13, 2.6, 7.5) : clamp(passDistance / 24, 0.08, 1.5),
      speed,
      passQuality,
      band,
      forward: (intendedEnd.x - start.x) * team.direction,
      outcome,
      finalThirdEntry,
      finalThirdPass: progressFor(team, intendedEnd.x) >= 67,
      boxEntry,
      debugTouchOutcome: debug.touchOutcome || null
    };
    emit(engine, isCross ? "CROSS_ATTEMPT" : "PASS_ATTEMPT", {
      side: owner.side,
      playerId: owner.id,
      receiverId: receiver.id,
      from: start,
      to: intendedEnd,
      distance: Math.round(passDistance * 10) / 10,
      band,
      passQuality: Math.round(passQuality),
      predictedOutcome: outcome
    });
    engine.nextDecisionIn = 999;
    return engine.activeBallAction;
  }

  function resolvePass(engine, owner, option, isCross = false) {
    if (engine.activeBallAction || engine.looseBallState) return;
    const receiver = option?.receiver;
    if (!receiver) return resolveCarry(engine, owner);
    if (isCross) engine.lastCrossAt = engine.clockSeconds;
    return startPassFlight(engine, owner, receiver, option, isCross);
  }

  function resolveCarry(engine, owner) {
    const team = teamBySide(engine, owner.side);
    const pressure = pressureAt(engine, owner);
    team.stats.carries += 1;
    team.stats.dribblesAttempted += pressure > 28 ? 1 : 0;
    const carryDistance = engine.rng.range(2.2, 6.8) * (0.75 + owner.attributes.acceleration / 180);
    const lateral = engine.rng.range(-3.3, 3.3);
    const target = { x: clamp(owner.positionNow.x + team.direction * carryDistance, 2, 98), y: clamp(owner.positionNow.y + lateral, 3, 65) };
    const defender = nearestPlayers(opponentTeam(engine, owner.side).players, target, 1)[0];
    const contest = defender && defender.d < 5.2;
    if (contest) {
      const attackerScore = owner.attributes.dribbling + owner.attributes.agility + owner.attributes.acceleration + engine.rng.range(-18, 18);
      const defenderScore = defender.player.attributes.tackling + defender.player.attributes.positioning + defender.player.attributes.strength + engine.rng.range(-18, 18);
      opponentTeam(engine, owner.side).stats.tacklesAttempted += 1;
      if (attackerScore > defenderScore) {
        team.stats.dribblesCompleted += 1;
        owner.positionNow = target;
        engine.ball.position = { ...target };
        emit(engine, "DRIBBLE_SUCCESS", { side: owner.side, playerId: owner.id, opponentId: defender.player.id, to: target });
      } else {
        opponentTeam(engine, owner.side).stats.tacklesWon += 1;
        changePossession(engine, defender.player, "TACKLE");
        emit(engine, "TACKLE_WON", { side: defender.player.side, playerId: defender.player.id, opponentId: owner.id });
      }
    } else {
      owner.positionNow = target;
      engine.ball.position = { ...target };
      emit(engine, "CARRY", { side: owner.side, playerId: owner.id, to: target });
    }
    engine.nextDecisionIn = engine.rng.range(2.4, 4.5);
  }

  function shotType(engine, shooter, goalkeeper) {
    const team = teamBySide(engine, shooter.side);
    const d = distance(shooter.positionNow, { x: attackGoalX(team), y: 34 });
    const keeperOut = goalkeeper ? Math.abs(goalkeeper.positionNow.x - attackGoalX(team)) : 0;
    if (keeperOut > 12 && shooter.attributes.technique > 76 && engine.rng.chance(0.35)) return "CHIP";
    if (d < 10 && engine.rng.chance(0.35)) return "PLACED";
    if (d > 22 && shooter.attributes.longShots > 78) return "POWER";
    return shooter.attributes.composure > 80 ? "PLACED" : "DRIVEN";
  }

  function resolveShot(engine, shooter, source = "OPEN_PLAY") {
    const team = teamBySide(engine, shooter.side);
    engine.lastShotAt = engine.clockSeconds;
    const opponent = opponentTeam(engine, shooter.side);
    const goalkeeper = opponent.players.find(player => player.group === "GK");
    const goal = { x: attackGoalX(team), y: 34 };
    const d = distance(shooter.positionNow, goal);
    const pressure = pressureAt(engine, shooter);
    const opportunity = scoringOpportunity(engine, shooter);
    const blockers = opponent.players.filter(player => player.group !== "GK" && distance(player.positionNow, shooter.positionNow) < 9 && progressFor(team, player.positionNow.x) > progressFor(team, shooter.positionNow.x)).length;
    const type = shotType(engine, shooter, goalkeeper);
    const angleFactor = clamp(Math.atan2(7.32, Math.max(1, d)) / 0.65, 0.15, 1);
    const distanceFactor = clamp(1 - Math.max(0, d - 7) / 34, 0.07, 1);
    const pressureFactor = clamp(1 - pressure / 145, 0.25, 1);
    const techniqueFactor = clamp((shooter.attributes.finishing * 0.55 + shooter.attributes.composure * 0.28 + shooter.attributes.firstTouch * 0.17) / 84, 0.55, 1.18);
    const sourceFactor = source === "CORNER" ? 0.74 : source === "CROSS" ? 0.86 : 1;
    let xg = clamp(0.008 + 0.34 * angleFactor * distanceFactor * pressureFactor * techniqueFactor * sourceFactor, 0.006, 0.62);
    if (type === "CHIP") xg *= goalkeeper?.goalkeeper?.sweep > 65 ? 1.08 : 0.88;
    if (type === "POWER" && d > 22) xg *= 0.78;
    if (source === "CORNER") xg = clamp(xg, 0.03, 0.24);
    const blockProbability = clamp(blockers * 0.11 + pressure * 0.0022, 0.03, 0.48);

    team.stats.shots += 1;
    team.stats.xg += xg;
    emit(engine, "SHOT", { side: shooter.side, playerId: shooter.id, xg, shotType: type, source, from: { ...shooter.positionNow }, opportunity });

    if (engine.rng.chance(blockProbability)) {
      team.stats.blocked += 1;
      opponent.stats.blocks = (opponent.stats.blocks || 0) + 1;
      emit(engine, "SHOT_BLOCKED", { side: shooter.side, playerId: shooter.id });
      if (engine.rng.chance(0.42)) scheduleCorner(engine, shooter.side, "BLOCKED_SHOT");
      else looseBall(engine, shooter.positionNow);
      return;
    }

    const onTargetProbability = clamp(0.28 + shooter.attributes.finishing * 0.0042 + shooter.attributes.composure * 0.0015 - pressure * 0.002 - Math.max(0, d - 18) * 0.008, 0.22, 0.82);
    if (!engine.rng.chance(onTargetProbability)) {
      emit(engine, "SHOT_OFF_TARGET", { side: shooter.side, playerId: shooter.id, xg });
      restartGoalKick(engine, opponent.side);
      return;
    }

    team.stats.onTarget += 1;
    const keeperQuality = goalkeeper ? goalkeeper.goalkeeper.reflex * 0.44 + goalkeeper.goalkeeper.handling * 0.28 + goalkeeper.attributes.positioning * 0.28 : 70;
    const visionPenalty = blockers > 0 ? 7 : 0;
    const effectiveGoalProbability = clamp(xg * 1.04 * (0.52 + shooter.attributes.finishing / 270 + shooter.attributes.composure / 450) * (1.17 - keeperQuality / 245 + visionPenalty / 100), 0.018, 0.78);
    if (engine.rng.chance(effectiveGoalProbability)) {
      team.score += 1;
      team.stats.goals += 1;
      emit(engine, "GOAL", { side: shooter.side, playerId: shooter.id, xg, shotType: type, source, score: { home: engine.teams.home.score, away: engine.teams.away.score } });
      restartKickoff(engine, opponent.side);
    } else {
      emit(engine, "SAVE", { side: opponent.side, playerId: goalkeeper?.id, shooterId: shooter.id, xg });
      const hold = goalkeeper ? clamp(goalkeeper.goalkeeper.handling / 110 - xg * 0.32, 0.22, 0.82) : 0.4;
      if (engine.rng.chance(hold)) {
        setBallOwner(engine, goalkeeper, "SAVE_HELD");
        engine.nextDecisionIn = engine.rng.range(3.0, 5.2);
      } else if (engine.rng.chance(0.32)) {
        scheduleCorner(engine, shooter.side, "SAVE_DEFLECTION");
      } else {
        const rebound = { x: attackGoalX(team) - team.direction * engine.rng.range(7, 14), y: clamp(34 + engine.rng.range(-10, 10), 15, 53) };
        looseBall(engine, rebound);
        emit(engine, "REBOUND", { position: rebound });
      }
    }
  }

  function looseBall(engine, point, options = {}) {
    createLooseBall(engine, point, {
      sourceSide: options.sourceSide || engine.ball.teamSide || engine.possessionSide,
      source: options.source || "SECOND_BALL",
      secondBall: options.secondBall !== false,
      velocity: options.velocity,
      height: options.height,
      settleSeconds: options.settleSeconds
    });
  }

  function restartKickoff(engine, side) {
    engine.restart = { type: "KICK_OFF", side, executeAt: engine.clockSeconds + 3.5 };
    engine.activeBallAction = null;
    engine.looseBallState = null;
    engine.ball.ownerId = null;
    engine.ball.teamSide = side;
    engine.ball.position = { x: 50, y: 34 };
    engine.ball.velocity = { x: 0, y: 0 };
    engine.ball.height = 0;
    engine.ball.state = "RESTART";
    engine.nextDecisionIn = 4;
  }

  function restartGoalKick(engine, side) {
    engine.restart = { type: "GOAL_KICK", side, executeAt: engine.clockSeconds + 3 };
    engine.activeBallAction = null;
    engine.looseBallState = null;
    engine.ball.ownerId = null;
    const team = teamBySide(engine, side);
    engine.ball.teamSide = side;
    engine.ball.position = { x: ownGoalX(team) + team.direction * 6, y: 34 };
    engine.ball.velocity = { x: 0, y: 0 };
    engine.ball.height = 0;
    engine.ball.state = "RESTART";
    engine.nextDecisionIn = 3.5;
  }

  function scheduleCorner(engine, attackingSide, reason) {
    const team = teamBySide(engine, attackingSide);
    team.stats.corners += 1;
    engine.restart = { type: "CORNER", side: attackingSide, reason, executeAt: engine.clockSeconds + 4.5 };
    engine.activeBallAction = null;
    engine.looseBallState = null;
    engine.ball.ownerId = null;
    engine.ball.teamSide = attackingSide;
    engine.ball.position = { x: attackGoalX(team), y: engine.rng.chance(0.5) ? 0 : 68 };
    engine.ball.velocity = { x: 0, y: 0 };
    engine.ball.height = 0;
    engine.ball.state = "RESTART";
    emit(engine, "CORNER_AWARDED", { side: attackingSide, reason });
  }

  function resolveRestart(engine) {
    const restart = engine.restart;
    if (!restart || engine.clockSeconds < restart.executeAt) return;
    engine.restart = null;
    const team = teamBySide(engine, restart.side);
    if (restart.type === "KICK_OFF") {
      const striker = team.players.find(player => player.group === "ST") || team.players[9];
      striker.positionNow = { x: 50 - team.direction * 1.5, y: 34 };
      setBallOwner(engine, striker, "KICK_OFF");
      emit(engine, "KICK_OFF", { side: restart.side });
      return;
    }
    if (restart.type === "GOAL_KICK") {
      const goalkeeper = team.players.find(player => player.group === "GK");
      setBallOwner(engine, goalkeeper, "GOAL_KICK");
      emit(engine, "GOAL_KICK", { side: restart.side, playerId: goalkeeper.id });
      return;
    }
    if (restart.type === "CORNER") {
      resolveCorner(engine, restart.side);
    }
  }

  function cornerAssignments(team) {
    const outfield = team.players.filter(player => player.group !== "GK");
    const aerial = [...outfield].sort((a, b) => (b.attributes.heading + b.attributes.jumping + b.attributes.strength) - (a.attributes.heading + a.attributes.jumping + a.attributes.strength));
    const taker = [...outfield].sort((a, b) => (b.attributes.crossing + b.attributes.passing + b.attributes.technique) - (a.attributes.crossing + a.attributes.passing + a.attributes.technique))[0];
    const primary = aerial.find(player => player.id !== taker.id);
    const secondary = aerial.find(player => player.id !== taker.id && player.id !== primary?.id);
    const edge = [...outfield].filter(player => ![taker.id, primary?.id, secondary?.id].includes(player.id)).sort((a, b) => b.attributes.longShots - a.attributes.longShots)[0];
    const rest = outfield.filter(player => ![taker.id, primary?.id, secondary?.id, edge?.id].includes(player.id)).sort((a, b) => (b.attributes.pace + b.attributes.positioning) - (a.attributes.pace + a.attributes.positioning)).slice(0, 2);
    return { taker, primary, secondary, edge, rest };
  }

  function resolveCorner(engine, attackingSide) {
    const team = teamBySide(engine, attackingSide);
    const opponent = opponentTeam(engine, attackingSide);
    const assignments = cornerAssignments(team);
    const goalkeeper = opponent.players.find(player => player.group === "GK");
    const routine = team.tactics.cornerRoutine || "mixed";
    const deliveryQuality = (assignments.taker.attributes.crossing * 0.58 + assignments.taker.attributes.technique * 0.24 + assignments.taker.attributes.composure * 0.18) / 100;
    const primaryAerial = assignments.primary.attributes.heading * 0.35 + assignments.primary.attributes.jumping * 0.35 + assignments.primary.attributes.strength * 0.18 + assignments.primary.attributes.anticipation * 0.12;
    const marker = opponent.players.filter(player => player.group !== "GK").sort((a, b) => (b.attributes.marking + b.attributes.jumping + b.attributes.strength) - (a.attributes.marking + a.attributes.jumping + a.attributes.strength))[0];
    const markerScore = marker.attributes.marking * 0.34 + marker.attributes.jumping * 0.32 + marker.attributes.strength * 0.18 + marker.attributes.concentration * 0.16;
    const runMomentum = assignments.primary.attributes.acceleration * 0.10 + assignments.primary.attributes.offBall * 0.16 + engine.rng.range(-9, 9);
    const goalkeeperCommand = goalkeeper.goalkeeper.cross * 0.46 + goalkeeper.attributes.jumping * 0.19 + goalkeeper.attributes.decisions * 0.18 + goalkeeper.goalkeeper.handling * 0.17;
    const crowdPenalty = 8 + engine.rng.range(0, 8);
    const duelMargin = primaryAerial + runMomentum + deliveryQuality * 20 - markerScore - (goalkeeperCommand - crowdPenalty) * 0.10;

    emit(engine, "CORNER_TAKEN", {
      side: attackingSide,
      playerId: assignments.taker.id,
      targetId: assignments.primary.id,
      routine,
      assignments: { primary: assignments.primary.id, secondary: assignments.secondary?.id, edge: assignments.edge?.id, rest: assignments.rest.map(player => player.id) }
    });

    assignments.primary.positionNow = { x: attackGoalX(team) - team.direction * engine.rng.range(5.5, 9), y: routine === "near-post" ? 29 : routine === "far-post" ? 41 : engine.rng.range(30, 42) };
    if (duelMargin > engine.rng.range(-4, 12)) {
      resolveShot(engine, assignments.primary, "CORNER");
    } else if (engine.rng.chance(0.28) && assignments.edge) {
      assignments.edge.positionNow = { x: attackGoalX(team) - team.direction * 20, y: 34 + engine.rng.range(-7, 7) };
      setBallOwner(engine, assignments.edge, "CORNER_SECOND_BALL");
      emit(engine, "CORNER_SECOND_BALL", { side: attackingSide, playerId: assignments.edge.id });
      engine.nextDecisionIn = 2.2;
    } else {
      const clearer = marker;
      changePossession(engine, clearer, "CORNER_CLEARANCE");
      emit(engine, "CORNER_CLEARED", { side: opponent.side, playerId: clearer.id });
    }
  }

  function executeDecision(engine) {
    if (engine.restart || engine.activeBallAction || engine.looseBallState || engine.ballAuthoritySuspended) return;
    const owner = getPlayer(engine, engine.ball.ownerId);
    if (!owner) {
      looseBall(engine, engine.ball.position, { source: "UNCONTROLLED", secondBall: false });
      return;
    }
    const action = chooseAction(engine, owner);
    engine.possessionActions = Number(engine.possessionActions || 0) + 1;
    owner.currentIntent = action.type;
    if (action.type === "SHOT") {
      if (engine.mode === "PASS_AUTHORITY") {
        engine.ballAuthoritySuspended = true;
        engine.ball.state = "WAITING_TERMINAL";
        engine.nextDecisionIn = 999;
        emit(engine, "TERMINAL_HANDOFF_REQUEST", { side: owner.side, playerId: owner.id, reason: "SHOT_WINDOW", position: { ...owner.positionNow }, opportunity: scoringOpportunity(engine, owner) });
      } else resolveShot(engine, owner, "OPEN_PLAY");
    } else if (action.type === "CROSS") {
      const team = teamBySide(engine, owner.side);
      const targets = team.players.filter(player => ["ST", "AM", "CM", "CB"].includes(player.group)).map(receiver => ({ receiver, d: distance(owner.positionNow, receiver.positionNow), forward: (receiver.positionNow.x - owner.positionNow.x) * team.direction, laneOpponents: 0, score: receiver.attributes.offBall + receiver.attributes.heading + progressFor(team, receiver.positionNow.x) })).sort((a, b) => b.score - a.score);
      resolvePass(engine, owner, targets[0], true);
    } else if (action.type === "PASS") resolvePass(engine, owner, action.option, false);
    else resolveCarry(engine, owner);
  }

  function updateStats(engine, dt) {
    if (engine.possessionSide) teamBySide(engine, engine.possessionSide).possessionSeconds += dt;
    const total = engine.teams.home.possessionSeconds + engine.teams.away.possessionSeconds || 1;
    engine.teams.home.stats.possession = Math.round(engine.teams.home.possessionSeconds / total * 100);
    engine.teams.away.stats.possession = 100 - engine.teams.home.stats.possession;
  }

  function stepEngine(engine, deltaSeconds) {
    if (engine.status !== "live") return engine.getSnapshot();
    engine.accumulator += Math.max(0, Number(deltaSeconds || 0));
    while (engine.accumulator >= FIXED_STEP && engine.status === "live") {
      engine.accumulator -= FIXED_STEP;
      engine.clockSeconds = Math.min(MATCH_SECONDS, engine.clockSeconds + FIXED_STEP);
      engine.lastPossessionChangeAgo += FIXED_STEP;
      if (engine.nextDecisionIn < 900) engine.nextDecisionIn -= FIXED_STEP;
      resolveRestart(engine);
      updatePlayerMovement(engine, FIXED_STEP);
      if (engine.ballAuthoritySuspended) {
        engine.ball.state = "EXTERNAL";
      } else if (engine.activeBallAction) {
        updateBallFlight(engine, FIXED_STEP);
      } else if (engine.looseBallState) {
        updateLooseBall(engine, FIXED_STEP);
      } else if (engine.ball.ownerId) {
        const owner = getPlayer(engine, engine.ball.ownerId);
        if (owner) {
          engine.ball.position = { ...owner.positionNow };
          engine.ball.velocity = { ...owner.velocity };
          engine.ball.height = 0;
          engine.ball.state = "CONTROLLED";
        }
      }
      if (!engine.restart && !engine.activeBallAction && !engine.looseBallState && !engine.ballAuthoritySuspended && engine.nextDecisionIn <= 0) executeDecision(engine);
      updateStats(engine, FIXED_STEP);
      if (engine.clockSeconds >= MATCH_SECONDS) {
        engine.status = "fulltime";
        emit(engine, "FULL_TIME", { score: { home: engine.teams.home.score, away: engine.teams.away.score } });
      }
    }
    return engine.getSnapshot();
  }

  function createEngine(config = {}) {
    const seed = config.seed || `${config.matchId || "match"}|${config.home?.name || "home"}|${config.away?.name || "away"}`;
    const rng = new SeededRandom(seed);
    const engine = {
      version: VERSION,
      seed,
      rng,
      status: "live",
      mode: config.mode || "FULL_SIMULATION",
      clockSeconds: 0,
      accumulator: 0,
      nextDecisionIn: 3.2,
      lastPossessionChangeAgo: 999,
      possessionActions: 0,
      lastShotAt: -999,
      lastCrossAt: -999,
      possessionSide: "home",
      restart: null,
      activeBallAction: null,
      looseBallState: null,
      ballActionSequence: 0,
      ballAuthoritySuspended: false,
      events: [],
      listeners: new Set(),
      teams: {
        home: createTeam(config.home || {}, "home", rng),
        away: createTeam(config.away || {}, "away", rng)
      },
      ball: { position: { x: 50, y: 34 }, velocity: { x: 0, y: 0 }, height: 0, ownerId: null, teamSide: "home", reason: "KICK_OFF", state: "RESTART" },
      step(deltaSeconds) { return stepEngine(engine, deltaSeconds); },
      runTo(second, maxIterations = 90000) {
        let guard = 0;
        const target = clamp(Number(second || 0), 0, MATCH_SECONDS);
        while (engine.clockSeconds < target && engine.status === "live" && guard++ < maxIterations) stepEngine(engine, Math.min(2, target - engine.clockSeconds));
        return engine.getSnapshot();
      },
      runFullMatch() { return engine.runTo(MATCH_SECONDS, 180000); },
      setBallAuthority(suspended, external = {}) {
        engine.ballAuthoritySuspended = Boolean(suspended);
        if (engine.ballAuthoritySuspended) {
          engine.activeBallAction = null;
          engine.looseBallState = null;
          engine.ball.state = "EXTERNAL";
          engine.nextDecisionIn = 999;
          if (external.ball || external.possessionSide) engine.syncExternalState({ ...external, preserveAction: true });
        } else {
          engine.nextDecisionIn = clamp(Number(external.nextDecisionIn ?? 0.8), 0.2, 2.5);
          if (external.ball || external.possessionSide) engine.syncExternalState({ ...external, preserveAction: false });
        }
        emit(engine, "BALL_AUTHORITY_CHANGED", { authority: engine.ballAuthoritySuspended ? "LEGACY_TERMINAL" : "V4_PASSING" });
        return engine.getSnapshot();
      },
      syncExternalState(external = {}) {
        const point = external.ball;
        if (point && Number.isFinite(Number(point.x)) && Number.isFinite(Number(point.y))) {
          engine.ball.position = { x: clamp(Number(point.x), 1, 99), y: clamp(Number(point.y), 2, 66) };
          engine.ball.velocity = { x: Number(point.vx || 0), y: Number(point.vy || 0) };
          engine.ball.height = clamp(Number(point.height || 0), 0, 20);
          engine.ball.reason = external.reason || "EXTERNAL_OFFICIAL_BALL";
          engine.ball.state = engine.ballAuthoritySuspended ? "EXTERNAL" : "CONTROLLED";
        }
        if (["home", "away"].includes(external.possessionSide)) {
          engine.possessionSide = external.possessionSide;
          engine.ball.teamSide = external.possessionSide;
        }
        engine.externalContext = {
          score: {
            home: Number(external.score?.home || engine.externalContext?.score?.home || 0),
            away: Number(external.score?.away || engine.externalContext?.score?.away || 0)
          },
          source: external.source || "LEGACY_OFFICIAL",
          synchronizedAt: engine.clockSeconds
        };
        if (!external.preserveAction) {
          engine.activeBallAction = null;
          engine.looseBallState = null;
        }
        if (point || external.reassignOwner) {
          const all = engine.teams.home.players.concat(engine.teams.away.players);
          all.forEach(player => { player.hasBall = false; });
          const ownerTeam = ["home", "away"].includes(engine.ball.teamSide) ? engine.teams[engine.ball.teamSide] : null;
          const nearest = ownerTeam ? nearestPlayers(ownerTeam.players, engine.ball.position, 1)[0]?.player : null;
          engine.ball.ownerId = nearest?.id || null;
          if (nearest) nearest.hasBall = true;
        }
        updatePlayerMovement(engine, clamp(Number(external.settleSeconds ?? 0.18), 0.03, 0.6));
        return engine.getSnapshot();
      },
      injectOfficialEvent(event = {}) {
        const type = String(event.type || "").toUpperCase();
        const side = ["home", "away"].includes(event.side) ? event.side : engine.possessionSide;
        if (type === "GOAL") {
          engine.externalContext = engine.externalContext || { score: { home: 0, away: 0 } };
          if (event.score) engine.externalContext.score = { home: Number(event.score.home || 0), away: Number(event.score.away || 0) };
          restartKickoff(engine, opponentSide(side));
        } else if (type === "CORNER") {
          scheduleCorner(engine, side, "OFFICIAL_EVENT");
        } else if (["GOAL_KICK", "SAVE_HELD"].includes(type)) {
          restartGoalKick(engine, side);
        }
        emit(engine, "OFFICIAL_EVENT_MIRRORED", { officialType: type, side, officialId: event.id || null });
        return engine.getSnapshot();
      },
      debugStartPass(ownerId, receiverId, options = {}) {
        const owner = getPlayer(engine, ownerId);
        const receiver = getPlayer(engine, receiverId);
        if (!owner || !receiver || owner.side !== receiver.side) throw new Error("debugStartPass requires two teammates");
        engine.restart = null;
        engine.looseBallState = null;
        setBallOwner(engine, owner, "DEBUG_CONTROL");
        return startPassFlight(engine, owner, receiver, { receiver, forward: (receiver.positionNow.x - owner.positionNow.x) * teamBySide(engine, owner.side).direction }, Boolean(options.isCross), options);
      },
      onEvent(listener) { engine.listeners.add(listener); return () => engine.listeners.delete(listener); },
      getSnapshot() {
        const activeAction = engine.activeBallAction ? {
          id: engine.activeBallAction.id,
          type: engine.activeBallAction.type,
          side: engine.activeBallAction.side,
          ownerId: engine.activeBallAction.ownerId,
          receiverId: engine.activeBallAction.receiverId,
          interceptorId: engine.activeBallAction.interceptorId,
          outcome: engine.activeBallAction.outcome,
          progress: clamp(engine.activeBallAction.elapsed / engine.activeBallAction.duration, 0, 1),
          duration: engine.activeBallAction.duration,
          passQuality: engine.activeBallAction.passQuality,
          band: engine.activeBallAction.band
        } : null;
        return {
          version: VERSION,
          seed: engine.seed,
          status: engine.status,
          mode: engine.mode,
          simulationTime: engine.clockSeconds,
          minute: engine.clockSeconds / 60,
          score: { home: engine.teams.home.score, away: engine.teams.away.score },
          officialScore: { ...(engine.externalContext?.score || { home: engine.teams.home.score, away: engine.teams.away.score }) },
          phase: engine.restart ? "SET_PIECE" : determinePhase(engine, teamBySide(engine, engine.ball.teamSide || "home")),
          possessionSide: engine.possessionSide,
          ballAuthority: engine.ballAuthoritySuspended ? "LEGACY_TERMINAL" : "V4_PASSING",
          ball: { ...engine.ball, position: { ...engine.ball.position }, velocity: { ...engine.ball.velocity } },
          ballControl: {
            state: engine.ball.state,
            activeAction,
            loose: engine.looseBallState ? {
              source: engine.looseBallState.source,
              sourceSide: engine.looseBallState.sourceSide,
              secondBall: engine.looseBallState.secondBall,
              remaining: Math.max(0, engine.looseBallState.settleAt - engine.clockSeconds)
            } : null
          },
          teams: {
            home: snapshotTeam(engine.teams.home),
            away: snapshotTeam(engine.teams.away)
          },
          lastEvent: engine.events.at(-1) || null,
          eventCount: engine.events.length,
          restDefence: {
            home: restDefenceSecurity(engine, engine.teams.home),
            away: restDefenceSecurity(engine, engine.teams.away)
          }
        };
      },
      getReport() {
        return {
          version: VERSION,
          seed: engine.seed,
          status: engine.status,
          mode: engine.mode,
          score: { home: engine.teams.home.score, away: engine.teams.away.score },
          officialScore: { ...(engine.externalContext?.score || { home: engine.teams.home.score, away: engine.teams.away.score }) },
          home: { name: engine.teams.home.name, stats: { ...engine.teams.home.stats }, averageEnergy: averageEnergy(engine.teams.home), goalkeeper: engine.teams.home.players.find(player => player.group === "GK")?.goalkeeper?.archetype },
          away: { name: engine.teams.away.name, stats: { ...engine.teams.away.stats }, averageEnergy: averageEnergy(engine.teams.away), goalkeeper: engine.teams.away.players.find(player => player.group === "GK")?.goalkeeper?.archetype },
          events: [...engine.events]
        };
      }
    };
    restartKickoff(engine, "home");
    return engine;
  }

  function averageEnergy(team) {
    return Math.round(team.players.reduce((sum, player) => sum + player.energy, 0) / team.players.length * 10) / 10;
  }

  function snapshotTeam(team) {
    return {
      id: team.id,
      name: team.name,
      side: team.side,
      formation: team.formation,
      score: team.score,
      phase: team.phase,
      stats: { ...team.stats },
      averageEnergy: averageEnergy(team),
      emergencyTargetId: team.emergencyTargetId,
      players: team.players.map(player => ({
        id: player.id,
        name: player.name,
        number: player.number,
        position: player.position,
        group: player.group,
        role: player.role,
        point: { ...player.positionNow },
        previousPoint: { ...player.previousPosition },
        targetPoint: { ...player.targetPosition },
        velocity: { ...player.velocity },
        facing: player.facing,
        hasBall: player.hasBall,
        intent: player.currentIntent,
        energy: Math.round(player.energy * 10) / 10,
        fatigue: Math.round(player.fatigue * 10) / 10,
        goalkeeperArchetype: player.goalkeeper?.archetype || null
      }))
    };
  }

  function createDefaultConfig(overrides = {}) {
    return {
      matchId: overrides.matchId || "v4-demo",
      mode: overrides.mode || "FULL_SIMULATION",
      seed: overrides.seed || "v4-demo-seed",
      home: {
        id: "HOME",
        name: "Home XI",
        rating: 82,
        formation: "4-3-3",
        goalkeeperArchetype: "sweeper-keeper",
        tactics: { ...DEFAULT_TACTICS, fullbackDuty: "attack", inPossession: "positional", outPossession: "high-press" },
        ...(overrides.home || {})
      },
      away: {
        id: "AWAY",
        name: "Away XI",
        rating: 80,
        formation: "4-2-3-1",
        goalkeeperArchetype: "line-keeper",
        tactics: { ...DEFAULT_TACTICS, fullbackDuty: "balanced", inPossession: "vertical", outPossession: "mid-block", winTransition: "counter" },
        ...(overrides.away || {})
      }
    };
  }

  const API = Object.freeze({
    VERSION,
    PITCH,
    MATCH_SECONDS,
    FIXED_STEP,
    FORMATIONS,
    DEFAULT_TACTICS,
    GOALKEEPER_ARCHETYPES,
    createEngine,
    createDefaultConfig,
    BALL_CONTROL_VERSION: 3
  });

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof globalThis !== "undefined") globalThis.FIFA_MATCH_ENGINE_V4 = API;
})();
