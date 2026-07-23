(() => {
  "use strict";

  const VERSION = "4.0.0-phase5.1";
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
    cornerRoutine: "mixed",
    freeKickRoutine: "mixed",
    throwInRoutine: "support",
    setPieceMarking: "hybrid",
    setPieceRisk: 52
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
    const keys = ["pace", "acceleration", "stamina", "strength", "agility", "passing", "vision", "technique", "firstTouch", "dribbling", "finishing", "longShots", "crossing", "tackling", "marking", "heading", "jumping", "decisions", "anticipation", "composure", "concentration", "bravery", "offBall", "positioning", "teamwork", "workRate"];
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
      shots: 0, onTarget: 0, blocked: 0, goals: 0, xg: 0, xgot: 0, saves: 0, savesHeld: 0, savesParried: 0, woodwork: 0, bigChances: 0, bigChancesMissed: 0,
      passesAttempted: 0, passesCompleted: 0, progressivePasses: 0,
      shortPassesAttempted: 0, shortPassesCompleted: 0,
      mediumPassesAttempted: 0, mediumPassesCompleted: 0,
      longPassesAttempted: 0, longPassesCompleted: 0,
      finalThirdPassesAttempted: 0, finalThirdPassesCompleted: 0,
      carries: 0, dribblesAttempted: 0, dribblesCompleted: 0,
      crossesAttempted: 0, crossesCompleted: 0,
      corners: 0, cornerShots: 0, cornerGoals: 0,
      freeKicks: 0, directFreeKicks: 0, indirectFreeKicks: 0, freeKickShots: 0, freeKickGoals: 0,
      throwIns: 0, penaltiesTaken: 0, penaltiesScored: 0, penaltiesSaved: 0, penaltiesMissed: 0,
      setPieceShots: 0, setPieceGoals: 0, setPieceSecondBalls: 0,
      aerialDuels: 0, aerialDuelsWon: 0, defensiveAerialDuels: 0, defensiveAerialDuelsWon: 0,
      clearances: 0, goalkeeperClaims: 0, goalkeeperPunches: 0, goalkeeperMissedClaims: 0,
      cornersWonFromSetPieces: 0, fouls: 0, yellow: 0, red: 0,
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
      id: `v4-${engine.eventSequence += 1}`,
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
    if (engine.restart || engine.activeSetPieceAction || engine.setPieceContext) return "SET_PIECE";
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
    const staged = engine.setPieceContext?.positions?.[player.id];
    if (staged) {
      player.currentIntent = staged.intent || "SET_PIECE_POSITION";
      return { x: clamp(staged.x, 1.5, 98.5), y: clamp(staged.y, 1.5, 66.5) };
    }
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
    engine.activeShotAction = null;
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


  function shotType(engine, shooter, goalkeeper, context = {}) {
    const team = teamBySide(engine, shooter.side);
    const d = context.distance || distance(shooter.positionNow, { x: attackGoalX(team), y: 34 });
    const keeperOut = goalkeeper ? Math.abs(goalkeeper.positionNow.x - attackGoalX(team)) : 0;
    if (context.isHeader) return "HEADER";
    if (keeperOut > 11 && shooter.attributes.technique > 76 && engine.rng.chance(0.34)) return "CHIP";
    if (d < 11 && shooter.attributes.composure > 74 && engine.rng.chance(0.38)) return "PLACED";
    if (d > 21 && shooter.attributes.longShots > 76) return "POWER";
    if (context.firstTime && shooter.attributes.technique > 72) return "FIRST_TIME";
    return shooter.attributes.composure > 80 ? "PLACED" : "DRIVEN";
  }

  function shotBlockCandidate(engine, shooter, start, goalPoint, duration) {
    const defenders = opponentTeam(engine, shooter.side).players.filter(player => player.group !== "GK");
    let best = null;
    defenders.forEach(player => {
      const projection = projectToSegment(player.positionNow, start, goalPoint);
      if (projection.t < 0.06 || projection.t > 0.84 || projection.distance > 20) return;
      const reaction = clamp((100 - player.attributes.anticipation) / 155 + (100 - player.attributes.concentration) / 230, 0.03, 0.78);
      const arrival = projection.distance / (3.8 + player.attributes.acceleration / 22) + reaction;
      const ballArrival = duration * projection.t;
      const reach = 0.22 + player.attributes.tackling / 330 + player.attributes.bravery / 460;
      const margin = ballArrival + reach - arrival + engine.rng.range(-0.08, 0.08);
      if (!best || margin > best.margin) best = { player, projection, margin };
    });
    return best;
  }

  function goalkeeperShotDecision(engine, goalkeeper, shooter, context) {
    if (!goalkeeper) return { action: "NO_GOALKEEPER", saveProbability: 0, holdProbability: 0, reactionDelay: 0.32, intercept: { ...context.goalPoint } };
    const profile = goalkeeper.goalkeeper || GOALKEEPER_ARCHETYPES["line-keeper"];
    const distanceToTarget = distance(goalkeeper.positionNow, context.goalPoint);
    const shotDistance = context.distance;
    const sightPenalty = context.sightObstruction * 0.055;
    const reactionDelay = clamp(0.54 - profile.reflex / 245 + sightPenalty + goalkeeper.fatigue / 750, 0.12, 0.62);
    const positioningQuality = goalkeeper.attributes.positioning * 0.35 + goalkeeper.attributes.decisions * 0.18 + profile.reflex * 0.24 + profile.handling * 0.13 + profile.start * 0.10;
    const targetDifficulty = Math.abs(context.targetY - goalkeeper.positionNow.y) * 2.25 + context.targetZ * 7.2 + Math.max(0, 16 - shotDistance) * 0.55;
    const typeModifier = ({ CHIP: -5, POWER: -8, PLACED: -3, DRIVEN: -5, HEADER: 2, FIRST_TIME: -4 })[context.shotType] || 0;
    const keeperQualityFactor = clamp(1.08 - positioningQuality / 780, 0.88, 1.02);
    const difficultyBoost = clamp((targetDifficulty - 10) / 420, -0.025, 0.08);
    const typeBoost = clamp(-typeModifier / 420, -0.02, 0.035);
    let goalProbability = clamp(context.xgot * keeperQualityFactor * 0.76 + difficultyBoost + typeBoost + sightPenalty * 0.018, 0.018, 0.62);
    let saveProbability = clamp(1 - goalProbability, 0.18, 0.975);
    let holdProbability = clamp(0.14 + profile.handling / 118 + goalkeeper.attributes.composure / 520 - context.shotPower / 170 - context.xgot * 0.20, 0.14, 0.88);
    if (["CORNER", "INDIRECT_FREE_KICK", "LONG_THROW"].includes(context.source)) {
      saveProbability = clamp(saveProbability - 0.07 - context.sightObstruction * 0.012, 0.14, 0.91);
      holdProbability = clamp(holdProbability * 0.68, 0.12, 0.60);
    }
    if (context.source === "PENALTY") {
      saveProbability = clamp(0.11 + profile.reflex / 620 + goalkeeper.attributes.anticipation / 980 + engine.rng.range(-0.04, 0.04), 0.12, 0.29);
      holdProbability = clamp(0.18 + profile.handling / 330, 0.22, 0.48);
      goalProbability = 1 - saveProbability;
    }
    const nearFeet = context.targetZ < 0.65 && Math.abs(context.targetY - goalkeeper.positionNow.y) < 3.2;
    const action = nearFeet ? "FOOT_SAVE" : context.targetZ > 1.85 ? "HIGH_DIVE" : Math.abs(context.targetY - goalkeeper.positionNow.y) > 3.5 ? "FULL_STRETCH" : "SET_SAVE";
    return {
      action,
      saveProbability,
      holdProbability,
      reactionDelay,
      intercept: {
        x: attackGoalX(teamBySide(engine, shooter.side)) - teamBySide(engine, shooter.side).direction * clamp(distanceToTarget * 0.08, 0.4, 2.4),
        y: clamp(context.targetY, PITCH.goalY1 - 1.2, PITCH.goalY2 + 1.2),
        z: context.targetZ
      }
    };
  }

  function computeShotPlan(engine, shooter, source = "OPEN_PLAY", debug = {}) {
    const team = teamBySide(engine, shooter.side);
    const opponent = opponentTeam(engine, shooter.side);
    const goalkeeper = opponent.players.find(player => player.group === "GK");
    const goalX = attackGoalX(team);
    const start = { ...shooter.positionNow };
    const distanceValue = distance(start, { x: goalX, y: 34 });
    const pressure = source === "PENALTY" ? 4 : pressureAt(engine, shooter);
    const opportunity = scoringOpportunity(engine, shooter);
    const firstTime = Boolean(debug.firstTime || source === "CROSS" || source === "CORNER" || source === "INDIRECT_FREE_KICK");
    const isHeader = Boolean(debug.isHeader || source === "CORNER" || source === "INDIRECT_FREE_KICK");
    const preliminary = { distance: distanceValue, firstTime, isHeader };
    const type = debug.shotType || shotType(engine, shooter, goalkeeper, preliminary);
    const preferredCorner = goalkeeper ? (goalkeeper.positionNow.y <= 34 ? PITCH.goalY2 - 0.45 : PITCH.goalY1 + 0.45) : 34;
    const aimDiscipline = shooter.attributes.finishing * 0.34 + shooter.attributes.composure * 0.25 + shooter.attributes.technique * 0.17 + shooter.attributes.decisions * 0.10 + opportunity * 0.14;
    const errorScale = clamp(5.8 - aimDiscipline / 24 + pressure / 34 + Math.max(0, distanceValue - 18) / 11, 0.35, 7.8);
    const targetY = Number.isFinite(Number(debug.targetY)) ? Number(debug.targetY) : preferredCorner + engine.rng.range(-errorScale, errorScale);
    const baseHeight = type === "CHIP" ? 1.9 : type === "POWER" ? 1.05 : isHeader ? 1.45 : type === "PLACED" ? 0.72 : 0.92;
    const targetZ = Number.isFinite(Number(debug.targetZ)) ? Number(debug.targetZ) : clamp(baseHeight + engine.rng.range(-0.62, 0.78) + Math.max(0, distanceValue - 20) / 45, -0.2, 3.2);
    const shotPower = clamp(48 + shooter.attributes.technique * 0.18 + (type === "POWER" ? shooter.attributes.longShots * 0.30 : shooter.attributes.finishing * 0.20) + engine.rng.range(-7, 7), 48, 98);
    const speed = clamp(20 + shotPower / 4.3, 28, 45);
    const duration = clamp(distanceValue / speed, 0.24, 1.18);
    const goalPoint = { x: goalX + team.direction * 0.75, y: targetY };
    const angleFactor = clamp(Math.atan2(7.32, Math.max(1, distanceValue)) / 0.65, 0.12, 1);
    const distanceFactor = clamp(1 - Math.max(0, distanceValue - 7) / 35, 0.06, 1);
    const pressureFactor = clamp(1 - pressure / 142, 0.22, 1);
    const techniqueFactor = clamp((shooter.attributes.finishing * 0.50 + shooter.attributes.composure * 0.30 + shooter.attributes.technique * 0.20) / 83, 0.52, 1.20);
    const sourceFactor = source === "CORNER" ? 0.70 : source === "INDIRECT_FREE_KICK" ? 0.76 : source === "DIRECT_FREE_KICK" ? 0.82 : source === "CROSS" ? 0.84 : 1;
    let xg = clamp(0.007 + 0.36 * angleFactor * distanceFactor * pressureFactor * techniqueFactor * sourceFactor, 0.005, 0.68);
    if (type === "POWER" && distanceValue > 22) xg *= 0.78;
    if (type === "CHIP") xg *= goalkeeper?.goalkeeper?.sweep > 68 ? 1.07 : 0.88;
    if (source === "CORNER") xg = clamp(xg, 0.025, 0.23);
    if (source === "INDIRECT_FREE_KICK") xg = clamp(xg, 0.02, 0.25);
    if (source === "DIRECT_FREE_KICK") xg = clamp(xg * 0.72, 0.025, 0.19);
    if (source === "PENALTY") xg = 0.76;
    const insideWidth = targetY > PITCH.goalY1 && targetY < PITCH.goalY2;
    const insideHeight = targetZ >= 0 && targetZ < 2.44;
    const nearPost = Math.min(Math.abs(targetY - PITCH.goalY1), Math.abs(targetY - PITCH.goalY2)) < 0.20;
    const nearBar = Math.abs(targetZ - 2.44) < 0.16;
    const sightObstruction = opponent.players.filter(player => player.group !== "GK" && projectToSegment(player.positionNow, start, goalPoint).distance < 2.8).length;
    const xgot = insideWidth && insideHeight ? clamp(xg * (1.06 + (1 - Math.abs(targetY - 34) / 4) * -0.08 + targetZ * 0.035) * (1 + shotPower / 380), 0.01, 0.82) : 0;
    const context = { start, goalPoint, targetY, targetZ, distance: distanceValue, pressure, opportunity, shotType: type, shotPower, duration, xg, xgot, sightObstruction, firstTime, isHeader, source };
    let blocker = source === "PENALTY" ? null : shotBlockCandidate(engine, shooter, start, goalPoint, duration);
    if (!blocker && source !== "PENALTY") {
      const fallback = nearestPlayers(opponent.players.filter(player => player.group !== "GK"), start, 1)[0];
      if (fallback) blocker = { player: fallback.player, projection: projectToSegment(fallback.player.positionNow, start, goalPoint), margin: -0.32 };
    }
    const keeper = goalkeeperShotDecision(engine, goalkeeper, shooter, context);
    let outcome = "OFF_TARGET";
    let end = { ...goalPoint };
    let resolutionPoint = { ...goalPoint };
    if (debug.forceOutcome) outcome = String(debug.forceOutcome).toUpperCase();
    else if (blocker && engine.rng.chance(clamp(0.28 + blocker.margin * 0.42 + pressure / 260, 0.14, 0.78))) outcome = "BLOCK";
    else if ((!insideWidth || !insideHeight) && (nearPost || nearBar) && engine.rng.chance(0.48)) outcome = "POST";
    else if (!insideWidth || !insideHeight) outcome = "OFF_TARGET";
    else if (engine.rng.chance(keeper.saveProbability)) outcome = engine.rng.chance(keeper.holdProbability) ? "SAVE_HOLD" : (engine.rng.chance(0.34) ? "SAVE_PARRY_WIDE" : "SAVE_PARRY_DANGER");
    else outcome = "GOAL";
    if (outcome === "BLOCK" && blocker) {
      end = { ...blocker.projection.point };
      resolutionPoint = { ...end };
    } else if (outcome.startsWith("SAVE")) {
      end = { x: keeper.intercept.x, y: keeper.intercept.y };
      resolutionPoint = { ...end };
    } else if (outcome === "POST") {
      const postY = Math.abs(targetY - PITCH.goalY1) < Math.abs(targetY - PITCH.goalY2) ? PITCH.goalY1 : PITCH.goalY2;
      end = { x: goalX, y: postY };
      resolutionPoint = { ...end };
    }
    return { ...context, side: shooter.side, shooterId: shooter.id, goalkeeperId: goalkeeper?.id || null, blockerId: blocker?.player?.id || null, keeper, outcome, end, resolutionPoint, source };
  }

  function startShotFlight(engine, shooter, source = "OPEN_PLAY", debug = {}) {
    if (!shooter || engine.activeBallAction || engine.activeShotAction || engine.looseBallState) return null;
    const team = teamBySide(engine, shooter.side);
    const opponent = opponentTeam(engine, shooter.side);
    const goalkeeper = opponent.players.find(player => player.group === "GK");
    const plan = computeShotPlan(engine, shooter, source, debug);
    engine.lastShotAt = engine.clockSeconds;
    team.stats.shots += 1;
    team.stats.xg += plan.xg;
    if (plan.xg >= 0.28) team.stats.bigChances += 1;
    if (!["OFF_TARGET", "POST", "BLOCK"].includes(plan.outcome)) {
      team.stats.onTarget += 1;
      team.stats.xgot += plan.xgot;
    }
    if (plan.outcome === "BLOCK") team.stats.blocked += 1;
    engine.teams.home.players.concat(engine.teams.away.players).forEach(player => { player.hasBall = false; });
    engine.ball.ownerId = null;
    engine.ball.teamSide = shooter.side;
    engine.ball.state = "SHOT_FLIGHT";
    engine.ball.reason = `${plan.shotType}_SHOT`;
    engine.activeShotAction = {
      id: `shot-${engine.shotSequence += 1}`,
      ...plan,
      elapsed: 0,
      progress: 0,
      peakHeight: Math.max(plan.targetZ, plan.shotType === "CHIP" ? 2.8 : 1.05),
      resolved: false
    };
    shooter.currentIntent = "SHOOT";
    if (goalkeeper) {
      goalkeeper.currentIntent = plan.keeper.action;
      goalkeeper.targetPosition = { x: plan.keeper.intercept.x, y: plan.keeper.intercept.y };
    }
    emit(engine, "SHOT", { side: shooter.side, playerId: shooter.id, goalkeeperId: goalkeeper?.id, xg: plan.xg, xgot: plan.xgot, shotType: plan.shotType, source, from: { ...plan.start }, target: { x: plan.goalPoint.x, y: plan.targetY, z: plan.targetZ }, predictedOutcome: plan.outcome, opportunity: plan.opportunity });
    emit(engine, "GOALKEEPER_SET", { side: opponent.side, playerId: goalkeeper?.id, action: plan.keeper.action, reactionDelay: plan.keeper.reactionDelay });
    engine.nextDecisionIn = 999;
    return engine.activeShotAction;
  }

  function completeShot(engine, action) {
    if (!action || action.resolved) return;
    action.resolved = true;
    engine.activeShotAction = null;
    const shooter = getPlayer(engine, action.shooterId);
    const goalkeeper = getPlayer(engine, action.goalkeeperId);
    const blocker = getPlayer(engine, action.blockerId);
    const team = teamBySide(engine, action.side);
    const opponent = opponentTeam(engine, action.side);
    const goalX = attackGoalX(team);
    if (action.outcome === "BLOCK") {
      opponent.stats.blocks = Number(opponent.stats.blocks || 0) + 1;
      emit(engine, "SHOT_BLOCKED", { side: action.side, playerId: action.shooterId, blockerId: blocker?.id, position: { ...action.resolutionPoint } });
      if (engine.rng.chance(0.30)) scheduleCorner(engine, action.side, "SHOT_BLOCKED");
      else createLooseBall(engine, action.resolutionPoint, { sourceSide: action.side, source: "SHOT_BLOCK", secondBall: true, velocity: { x: -team.direction * engine.rng.range(1.2, 4.2), y: engine.rng.range(-3.2, 3.2) } });
      return;
    }
    if (action.outcome === "OFF_TARGET") {
      if (action.source === "PENALTY") team.stats.penaltiesMissed += 1;
      if (action.xg >= 0.28) team.stats.bigChancesMissed += 1;
      emit(engine, "SHOT_OFF_TARGET", { side: action.side, playerId: action.shooterId, xg: action.xg, target: { y: action.targetY, z: action.targetZ } });
      restartGoalKick(engine, opponent.side);
      return;
    }
    if (action.outcome === "POST") {
      if (action.source === "PENALTY") team.stats.penaltiesMissed += 1;
      team.stats.woodwork += 1;
      if (action.xg >= 0.28) team.stats.bigChancesMissed += 1;
      emit(engine, "WOODWORK", { side: action.side, playerId: action.shooterId, xg: action.xg, position: { x: goalX, y: action.end.y, z: action.targetZ } });
      const rebound = { x: goalX - team.direction * engine.rng.range(4.5, 11), y: clamp(action.end.y + engine.rng.range(-4.2, 4.2), 12, 56) };
      createLooseBall(engine, rebound, { sourceSide: action.side, source: "WOODWORK_REBOUND", secondBall: true, velocity: { x: -team.direction * engine.rng.range(2.0, 5.0), y: engine.rng.range(-2.8, 2.8) } });
      return;
    }
    if (action.outcome === "GOAL") {
      team.score += 1;
      team.stats.goals += 1;
      if (["CORNER", "INDIRECT_FREE_KICK", "DIRECT_FREE_KICK", "PENALTY", "LONG_THROW"].includes(action.source)) team.stats.setPieceGoals += 1;
      if (action.source === "CORNER") team.stats.cornerGoals += 1;
      if (["INDIRECT_FREE_KICK", "DIRECT_FREE_KICK"].includes(action.source)) team.stats.freeKickGoals += 1;
      if (action.source === "PENALTY") team.stats.penaltiesScored += 1;
      engine.externalContext = engine.externalContext || { score: { home: 0, away: 0 } };
      engine.externalContext.score = { home: engine.teams.home.score, away: engine.teams.away.score };
      engine.ball.position = { x: goalX + team.direction * 0.65, y: clamp(action.targetY, PITCH.goalY1 + 0.04, PITCH.goalY2 - 0.04) };
      engine.ball.height = clamp(action.targetZ, 0, 2.4);
      engine.ball.state = "GOAL";
      engine.ball.reason = "GOAL_LINE_CROSSED";
      emit(engine, "GOAL_LINE_CROSSED", { side: action.side, playerId: action.shooterId, position: { ...engine.ball.position }, height: engine.ball.height });
      emit(engine, "GOAL", { side: action.side, playerId: action.shooterId, goalkeeperId: action.goalkeeperId, xg: action.xg, xgot: action.xgot, shotType: action.shotType, source: action.source, score: { home: engine.teams.home.score, away: engine.teams.away.score } });
      restartKickoff(engine, opponent.side);
      return;
    }
    opponent.stats.saves += 1;
    if (action.source === "PENALTY") team.stats.penaltiesSaved += 1;
    if (action.outcome === "SAVE_HOLD") {
      opponent.stats.savesHeld += 1;
      emit(engine, "SAVE_HELD", { side: opponent.side, playerId: goalkeeper?.id, shooterId: shooter?.id, xgot: action.xgot, action: action.keeper.action });
      setBallOwner(engine, goalkeeper, "SAVE_HELD");
      engine.nextDecisionIn = engine.rng.range(3.1, 5.3);
      return;
    }
    opponent.stats.savesParried += 1;
    emit(engine, "SAVE_PARRIED", { side: opponent.side, playerId: goalkeeper?.id, shooterId: shooter?.id, xgot: action.xgot, direction: action.outcome === "SAVE_PARRY_WIDE" ? "WIDE" : "DANGER", action: action.keeper.action });
    if (action.outcome === "SAVE_PARRY_WIDE") {
      if (engine.rng.chance(0.72)) scheduleCorner(engine, action.side, "GOALKEEPER_PARRY");
      else restartGoalKick(engine, opponent.side);
      return;
    }
    const rebound = { x: goalX - team.direction * engine.rng.range(5.5, 12.5), y: clamp(action.targetY + engine.rng.range(-7.5, 7.5), 13, 55) };
    createLooseBall(engine, rebound, { sourceSide: action.side, source: "GOALKEEPER_REBOUND", secondBall: true, velocity: { x: -team.direction * engine.rng.range(1.5, 4.5), y: engine.rng.range(-2.5, 2.5) } });
    emit(engine, "REBOUND", { side: action.side, position: rebound, goalkeeperId: goalkeeper?.id });
  }

  function updateShotFlight(engine, dt) {
    const action = engine.activeShotAction;
    if (!action) return false;
    action.elapsed = Math.min(action.duration, action.elapsed + dt);
    const raw = clamp(action.elapsed / action.duration, 0, 1);
    action.progress = raw;
    const previous = { ...engine.ball.position };
    const travel = raw < 0.62 ? raw * 1.08 : 0.6696 + (raw - 0.62) * 0.8695;
    engine.ball.position = pointOnSegment(action.start, action.end, clamp(travel, 0, 1));
    engine.ball.velocity = { x: (engine.ball.position.x - previous.x) / Math.max(dt, 0.001), y: (engine.ball.position.y - previous.y) / Math.max(dt, 0.001) };
    engine.ball.height = clamp(Math.sin(Math.PI * raw) * Math.max(0.35, action.peakHeight - action.targetZ) + action.targetZ * raw, 0, 5.5);
    engine.ball.state = "SHOT_FLIGHT";
    engine.ball.reason = `${action.shotType}_SHOT_FLIGHT`;
    if (raw >= 1) completeShot(engine, action);
    return true;
  }

  function resolveShot(engine, shooter, source = "OPEN_PLAY", debug = {}) {
    return startShotFlight(engine, shooter, source, debug);
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
    engine.activeShotAction = null;
    engine.activeSetPieceAction = null;
    engine.setPieceContext = null;
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
    engine.activeShotAction = null;
    engine.activeSetPieceAction = null;
    engine.setPieceContext = null;
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

  const SET_PIECE_ROUTINES = Object.freeze({
    corner: ["near-post", "far-post", "crowd-keeper", "short", "edge", "mixed"],
    indirect: ["near-post", "far-post", "screen", "second-phase", "mixed"],
    throwIn: ["support", "channel", "long-throw", "recycle"]
  });

  function uniquePlayers(players = []) {
    const seen = new Set();
    return players.filter(player => player && !seen.has(player.id) && seen.add(player.id));
  }

  function attackingSetPieceTaker(team, type) {
    const outfield = team.players.filter(player => player.group !== "GK");
    return [...outfield].sort((a, b) => {
      const score = player => type === "DIRECT_FREE_KICK"
        ? player.attributes.longShots * 0.38 + player.attributes.technique * 0.28 + player.attributes.finishing * 0.18 + player.attributes.composure * 0.16
        : type === "PENALTY"
          ? player.attributes.finishing * 0.38 + player.attributes.composure * 0.34 + player.attributes.technique * 0.18 + player.attributes.decisions * 0.10
          : player.attributes.crossing * 0.40 + player.attributes.passing * 0.25 + player.attributes.technique * 0.22 + player.attributes.composure * 0.13;
      return score(b) - score(a);
    })[0];
  }

  function chooseSetPieceRoutine(engine, team, type, override) {
    if (override && override !== "mixed") return override;
    const tactical = type === "CORNER" ? team.tactics.cornerRoutine : type === "THROW_IN" ? team.tactics.throwInRoutine : team.tactics.freeKickRoutine;
    if (tactical && tactical !== "mixed") return tactical;
    const list = type === "CORNER" ? SET_PIECE_ROUTINES.corner : type === "THROW_IN" ? SET_PIECE_ROUTINES.throwIn : SET_PIECE_ROUTINES.indirect;
    return engine.rng.pick(list.filter(item => item !== "mixed"));
  }

  function setPieceAssignments(engine, attackingSide, type, routineOverride) {
    const team = teamBySide(engine, attackingSide);
    const opponent = opponentTeam(engine, attackingSide);
    const outfield = team.players.filter(player => player.group !== "GK");
    const defenders = opponent.players.filter(player => player.group !== "GK");
    const routine = chooseSetPieceRoutine(engine, team, type, routineOverride);
    const taker = attackingSetPieceTaker(team, type);
    const aerial = [...outfield].filter(player => player.id !== taker?.id).sort((a, b) =>
      (b.attributes.heading * 0.31 + b.attributes.jumping * 0.31 + b.attributes.strength * 0.19 + b.attributes.offBall * 0.19) -
      (a.attributes.heading * 0.31 + a.attributes.jumping * 0.31 + a.attributes.strength * 0.19 + a.attributes.offBall * 0.19));
    const primary = aerial[0], secondary = aerial[1], nearRunner = aerial[2] || primary, farRunner = aerial[3] || secondary;
    const usedA = () => new Set(uniquePlayers([taker, primary, secondary, nearRunner, farRunner]).map(player => player.id));
    const blocker = [...outfield].filter(player => !usedA().has(player.id)).sort((a, b) =>
      (b.attributes.strength + b.attributes.aggression + b.attributes.teamwork) - (a.attributes.strength + a.attributes.aggression + a.attributes.teamwork))[0];
    const usedB = new Set(uniquePlayers([taker, primary, secondary, nearRunner, farRunner, blocker]).map(player => player.id));
    const edge = [...outfield].filter(player => !usedB.has(player.id)).sort((a, b) =>
      (b.attributes.longShots + b.attributes.technique + b.attributes.anticipation) - (a.attributes.longShots + a.attributes.technique + a.attributes.anticipation))[0];
    const usedC = new Set(uniquePlayers([taker, primary, secondary, nearRunner, farRunner, blocker, edge]).map(player => player.id));
    const rebound = [...outfield].filter(player => !usedC.has(player.id)).sort((a, b) =>
      (b.attributes.anticipation + b.attributes.offBall + b.attributes.acceleration) - (a.attributes.anticipation + a.attributes.offBall + a.attributes.acceleration))[0];
    const excluded = new Set(uniquePlayers([taker, primary, secondary, nearRunner, farRunner, blocker, edge, rebound]).map(player => player.id));
    const rest = [...outfield].filter(player => !excluded.has(player.id)).sort((a, b) =>
      (b.attributes.pace + b.attributes.positioning + b.attributes.tackling + b.attributes.decisions) - (a.attributes.pace + a.attributes.positioning + a.attributes.tackling + a.attributes.decisions)).slice(0, 2);
    const markerPool = [...defenders].sort((a, b) =>
      (b.attributes.marking * 0.30 + b.attributes.jumping * 0.27 + b.attributes.strength * 0.20 + b.attributes.concentration * 0.13 + b.attributes.positioning * 0.10) -
      (a.attributes.marking * 0.30 + a.attributes.jumping * 0.27 + a.attributes.strength * 0.20 + a.attributes.concentration * 0.13 + a.attributes.positioning * 0.10));
    const goalkeeper = opponent.players.find(player => player.group === "GK");
    const outlet = [...opponent.players].filter(player => ["ST", "WING", "AM"].includes(player.group)).sort((a, b) =>
      (b.attributes.pace + b.attributes.acceleration + b.attributes.firstTouch) - (a.attributes.pace + a.attributes.acceleration + a.attributes.firstTouch))[0];
    return { type, routine, markingStyle: opponent.tactics.setPieceMarking || "hybrid", taker, primary, secondary, nearRunner, farRunner, blocker, edge, rebound, rest,
      goalkeeper, markerPool, primaryMarker: markerPool[0], secondaryMarker: markerPool[1], zoneNear: markerPool[2], zoneCentral: markerPool[3], zoneFar: markerPool[4], outlet };
  }

  function setSetPiecePosition(positions, player, x, y, intent) {
    if (player) positions[player.id] = { x, y, intent };
  }

  function stageSetPiece(engine, attackingSide, type, spot, options = {}) {
    const team = teamBySide(engine, attackingSide);
    const opponent = opponentTeam(engine, attackingSide);
    const a = setPieceAssignments(engine, attackingSide, type, options.routine);
    const direction = team.direction, goalX = attackGoalX(team), positions = {};
    const cornerY = Number.isFinite(Number(spot?.y)) ? Number(spot.y) : (engine.rng.chance(0.5) ? 0 : 68);
    const nearY = cornerY < 34 ? 30 : 38, farY = cornerY < 34 ? 40.5 : 27.5;
    const restartX = Number.isFinite(Number(spot?.x)) ? Number(spot.x) : goalX;
    const restartY = Number.isFinite(Number(spot?.y)) ? Number(spot.y) : cornerY;
    setSetPiecePosition(positions, a.taker, restartX - direction * (type === "CORNER" ? .8 : 0), clamp(restartY, 1, 67), "SET_PIECE_TAKER");
    setSetPiecePosition(positions, a.primary, goalX - direction * 7, a.routine === "far-post" ? farY : nearY, "PRIMARY_AERIAL_TARGET");
    setSetPiecePosition(positions, a.secondary, goalX - direction * 9, a.routine === "far-post" ? 34 : farY, "SECONDARY_AERIAL_TARGET");
    setSetPiecePosition(positions, a.nearRunner, goalX - direction * 5, nearY + (cornerY < 34 ? -1.4 : 1.4), "NEAR_POST_RUN");
    setSetPiecePosition(positions, a.farRunner, goalX - direction * 5.5, farY, "FAR_POST_RUN");
    setSetPiecePosition(positions, a.blocker, goalX - direction * 4.5, 34, "SCREEN_GOALKEEPER");
    setSetPiecePosition(positions, a.edge, goalX - direction * 20.5, 34 + engine.rng.range(-5, 5), "EDGE_OF_BOX");
    setSetPiecePosition(positions, a.rebound, goalX - direction * 14.5, 34 + engine.rng.range(-8, 8), "SECOND_BALL_ATTACK");
    a.rest.forEach((player, index) => setSetPiecePosition(positions, player, goalX - direction * (35 + index * 3), 27 + index * 14, "REST_DEFENCE"));
    const targets = [a.primary, a.secondary, a.nearRunner, a.farRunner, a.blocker];
    a.markerPool.slice(0, 5).forEach((marker, index) => {
      const target = targets[index], staged = target ? positions[target.id] : null;
      const zonalY = [nearY, 34, farY, 31, 37][index];
      const y = a.markingStyle === "zonal" || !staged ? zonalY : staged.y + (index % 2 ? .8 : -.8);
      setSetPiecePosition(positions, marker, goalX - direction * (a.markingStyle === "zonal" ? 6.2 : 6.7), y, a.markingStyle === "zonal" ? "ZONAL_SET_PIECE" : "MAN_MARK_SET_PIECE");
    });
    setSetPiecePosition(positions, a.goalkeeper, goalX - direction * 1.2, 34, "COMMAND_AREA");
    setSetPiecePosition(positions, a.outlet, ownGoalX(opponent) + opponent.direction * 44, cornerY < 34 ? 52 : 16, "COUNTER_OUTLET");
    engine.setPieceContext = { id: `set-piece-${engine.setPieceSequence += 1}`, type, side: attackingSide, routine: a.routine, markingStyle: a.markingStyle,
      spot: { x: restartX, y: restartY }, positions,
      assignments: Object.fromEntries(Object.entries(a).filter(([, value]) => value?.id).map(([key, value]) => [key, value.id])), createdAt: engine.clockSeconds };
    emit(engine, "SET_PIECE_ORGANIZED", { side: attackingSide, setPieceType: type, routine: a.routine, markingStyle: a.markingStyle, assignments: engine.setPieceContext.assignments });
    return a;
  }

  function clearSetPieceContext(engine, reason = "COMPLETE") {
    if (engine.setPieceContext) emit(engine, "SET_PIECE_SHAPE_RELEASED", { side: engine.setPieceContext.side, setPieceType: engine.setPieceContext.type, reason });
    engine.setPieceContext = null;
  }

  function scheduleSetPiece(engine, type, attackingSide, spot = {}, reason = "MATCH_EVENT", options = {}) {
    const team = teamBySide(engine, attackingSide);
    if (type === "CORNER" && options.countStat !== false) team.stats.corners += 1;
    if (type === "DIRECT_FREE_KICK") { team.stats.freeKicks += 1; team.stats.directFreeKicks += 1; }
    if (type === "INDIRECT_FREE_KICK") { team.stats.freeKicks += 1; team.stats.indirectFreeKicks += 1; }
    if (type === "THROW_IN") team.stats.throwIns += 1;
    if (type === "PENALTY") team.stats.penaltiesTaken += 1;
    const delay = ({ CORNER: 4.5, DIRECT_FREE_KICK: 5.2, INDIRECT_FREE_KICK: 5, THROW_IN: 2.8, PENALTY: 6.2 })[type] || 4;
    engine.restart = { type, side: attackingSide, reason, spot: { x: Number(spot.x ?? engine.ball.position.x), y: Number(spot.y ?? engine.ball.position.y) }, routine: options.routine, executeAt: engine.clockSeconds + delay };
    engine.activeBallAction = null; engine.activeShotAction = null; engine.activeSetPieceAction = null; engine.looseBallState = null;
    engine.ball.ownerId = null; engine.ball.teamSide = attackingSide; engine.ball.position = { ...engine.restart.spot }; engine.ball.velocity = { x: 0, y: 0 }; engine.ball.height = 0; engine.ball.state = "RESTART"; engine.nextDecisionIn = 999;
    stageSetPiece(engine, attackingSide, type, engine.restart.spot, options);
    emit(engine, `${type}_AWARDED`, { side: attackingSide, reason, spot: { ...engine.restart.spot }, routine: engine.setPieceContext?.routine });
  }

  function scheduleCorner(engine, attackingSide, reason, options = {}) {
    const team = teamBySide(engine, attackingSide), y = Number.isFinite(Number(options.y)) ? Number(options.y) : (engine.rng.chance(.5) ? 0 : 68);
    scheduleSetPiece(engine, "CORNER", attackingSide, { x: attackGoalX(team), y }, reason, options);
  }
  function scheduleFreeKick(engine, attackingSide, spot, reason = "FOUL", options = {}) {
    const team = teamBySide(engine, attackingSide), progress = progressFor(team, spot.x), central = spot.y > 19 && spot.y < 49;
    scheduleSetPiece(engine, (options.direct ?? (progress >= 68 && progress <= 84 && central)) ? "DIRECT_FREE_KICK" : "INDIRECT_FREE_KICK", attackingSide, spot, reason, options);
  }
  function scheduleThrowIn(engine, attackingSide, spot, reason = "BALL_OUT", options = {}) {
    scheduleSetPiece(engine, "THROW_IN", attackingSide, { x: clamp(spot.x, 5, 95), y: spot.y < 34 ? .5 : 67.5 }, reason, options);
  }
  function schedulePenalty(engine, attackingSide, reason = "FOUL_IN_BOX", options = {}) {
    const team = teamBySide(engine, attackingSide);
    scheduleSetPiece(engine, "PENALTY", attackingSide, { x: attackGoalX(team) - team.direction * 11, y: 34 }, reason, options);
  }

  function startSetPieceDelivery(engine, a, type, target, options = {}) {
    const taker = a.taker, start = { ...engine.ball.position }, d = distance(start, target);
    const quality = clamp(taker.attributes.crossing * .42 + taker.attributes.passing * .18 + taker.attributes.technique * .22 + taker.attributes.composure * .10 + taker.attributes.decisions * .08 + engine.rng.range(-8, 8), 35, 98);
    const duration = clamp(d / clamp(16 + quality / 7 + (type === "THROW_IN" ? -3 : 0), 13, 31), .52, 2.1);
    engine.activeSetPieceAction = { id: `set-piece-action-${engine.setPieceActionSequence += 1}`, type, side: taker.side, takerId: taker.id,
      targetId: options.targetId || a.primary?.id || null, start, end: { ...target }, elapsed: 0, duration, quality, curve: engine.rng.range(-1.8, 1.8),
      peakHeight: options.peakHeight ?? (type === "THROW_IN" ? 1.9 : 4.1), routine: a.routine, markingStyle: a.markingStyle, assignments: a };
    taker.currentIntent = type === "THROW_IN" ? "LONG_THROW_DELIVERY" : "SET_PIECE_DELIVERY";
    engine.ball.ownerId = null; taker.hasBall = false; engine.ball.teamSide = taker.side; engine.ball.state = "SET_PIECE_FLIGHT"; engine.ball.reason = type; engine.nextDecisionIn = 999;
    emit(engine, "SET_PIECE_DELIVERY", { side: taker.side, playerId: taker.id, setPieceType: type, routine: a.routine, targetId: engine.activeSetPieceAction.targetId, quality });
    return engine.activeSetPieceAction;
  }

  function goalkeeperCrossDecision(engine, goalkeeper, action, a) {
    if (!goalkeeper) return { action: "STAY", success: false, command: 0 };
    const profile = goalkeeper.goalkeeper || GOALKEEPER_ARCHETYPES["line-keeper"], crowd = [a.primary, a.secondary, a.blocker, a.nearRunner, a.farRunner].filter(Boolean).length;
    const command = profile.cross * .35 + profile.handling * .20 + goalkeeper.attributes.jumping * .14 + goalkeeper.attributes.decisions * .13 + goalkeeper.attributes.bravery * .08 + goalkeeper.attributes.positioning * .10 - crowd * 1.7 + engine.rng.range(-8, 8);
    const selected = command >= 81 ? "CLAIM" : command >= 69 ? "PUNCH" : "STAY";
    const successChance = clamp(.22 + command / 185 + (action.quality - 70) * -.004, .34, .82);
    return { action: selected, success: selected !== "STAY" && engine.rng.chance(successChance), command, successChance };
  }

  function aerialScore(player, role = "ATTACK", momentum = 0) {
    if (!player) return 0;
    return (role === "ATTACK" ? player.attributes.heading : player.attributes.marking) * .25 + player.attributes.jumping * .25 + player.attributes.strength * .16 + player.attributes.anticipation * .12 + player.attributes.bravery * .08 + player.attributes.concentration * .07 + player.attributes.positioning * .07 + momentum;
  }

  function resolveSetPieceArrival(engine, action) {
    const attacking = teamBySide(engine, action.side), defending = opponentTeam(engine, action.side), a = action.assignments;
    const target = getPlayer(engine, action.targetId) || a.primary;
    const marker = a.primaryMarker || nearestPlayers(defending.players.filter(player => player.group !== "GK"), action.end, 1)[0]?.player;
    const goalkeeper = a.goalkeeper;
    const keeperDecision = ["CORNER", "INDIRECT_FREE_KICK"].includes(action.type) ? goalkeeperCrossDecision(engine, goalkeeper, action, a) : { action: "STAY", success: false, command: 0 };
    if (keeperDecision.action === "CLAIM" && keeperDecision.success) {
      defending.stats.goalkeeperClaims += 1; goalkeeper.currentIntent = "CLAIM_CROSS"; engine.activeSetPieceAction = null; clearSetPieceContext(engine, "GOALKEEPER_CLAIM");
      setBallOwner(engine, goalkeeper, "SET_PIECE_CLAIM"); emit(engine, "GOALKEEPER_CLAIM", { side: defending.side, playerId: goalkeeper.id, setPieceType: action.type, command: keeperDecision.command }); engine.nextDecisionIn = engine.rng.range(3, 5); return;
    }
    if (keeperDecision.action === "PUNCH" && keeperDecision.success) {
      defending.stats.goalkeeperPunches += 1; const p = { x: action.end.x - attacking.direction * engine.rng.range(8, 14), y: clamp(action.end.y + engine.rng.range(-8, 8), 10, 58) };
      emit(engine, "GOALKEEPER_PUNCH", { side: defending.side, playerId: goalkeeper.id, setPieceType: action.type, position: p }); engine.activeSetPieceAction = null; clearSetPieceContext(engine, "GOALKEEPER_PUNCH");
      createLooseBall(engine, p, { source: "SET_PIECE_PUNCH", sourceSide: action.side, secondBall: true, settleSeconds: .35 }); attacking.stats.setPieceSecondBalls += 1; return;
    }
    if (keeperDecision.action !== "STAY" && !keeperDecision.success) { defending.stats.goalkeeperMissedClaims += 1; goalkeeper.currentIntent = "MISSED_CLAIM"; emit(engine, "GOALKEEPER_MISSED_CLAIM", { side: defending.side, playerId: goalkeeper.id, setPieceType: action.type, command: keeperDecision.command }); }
    const attackerScore = aerialScore(target, "ATTACK", clamp(target?.attributes.acceleration * .08 + target?.attributes.offBall * .12 + action.quality * .09 + engine.rng.range(-7, 7), 0, 30));
    const defenderScore = aerialScore(marker, "DEFEND", clamp(marker?.attributes.positioning * .08 + marker?.attributes.concentration * .10 + engine.rng.range(-6, 6), 0, 20)) + (a.markingStyle === "zonal" ? 3 : a.markingStyle === "man" ? 4 : 5);
    attacking.stats.aerialDuels += 1; defending.stats.defensiveAerialDuels += 1; const margin = attackerScore - defenderScore + engine.rng.range(-8, 8); engine.activeSetPieceAction = null;
    if (margin > 2.5 && target) {
      attacking.stats.aerialDuelsWon += 1; attacking.stats.setPieceShots += 1; if (action.type === "CORNER") attacking.stats.cornerShots += 1; else if (action.type === "INDIRECT_FREE_KICK") attacking.stats.freeKickShots += 1;
      target.positionNow = { ...action.end }; target.currentIntent = "ATTACK_HEADER"; emit(engine, "AERIAL_DUEL_WON", { side: attacking.side, playerId: target.id, opponentId: marker?.id, setPieceType: action.type, margin }); clearSetPieceContext(engine, "ATTACK_HEADER");
      resolveShot(engine, target, action.type === "CORNER" ? "CORNER" : action.type === "THROW_IN" ? "LONG_THROW" : "INDIRECT_FREE_KICK", { firstTime: true, isHeader: true }); return;
    }
    if (margin < -1.5 && marker) {
      defending.stats.defensiveAerialDuelsWon += 1; defending.stats.clearances += 1; marker.currentIntent = "AERIAL_CLEARANCE"; emit(engine, "SET_PIECE_CLEARED", { side: defending.side, playerId: marker.id, opponentId: target?.id, setPieceType: action.type, margin }); clearSetPieceContext(engine, "DEFENSIVE_CLEARANCE");
      if (engine.rng.chance(.56) && a.outlet) { a.outlet.positionNow = { x: ownGoalX(defending) + defending.direction * 48, y: a.outlet.positionNow.y }; setBallOwner(engine, a.outlet, "SET_PIECE_COUNTER"); emit(engine, "SET_PIECE_COUNTER_STARTED", { side: defending.side, playerId: a.outlet.id }); engine.nextDecisionIn = 1; }
      else { const p = { x: action.end.x - attacking.direction * engine.rng.range(12, 21), y: clamp(action.end.y + engine.rng.range(-10, 10), 8, 60) }; createLooseBall(engine, p, { source: "SET_PIECE_CLEARANCE", sourceSide: action.side, secondBall: true, settleSeconds: .35 }); attacking.stats.setPieceSecondBalls += 1; }
      return;
    }
    const p = { x: action.end.x - attacking.direction * engine.rng.range(2, 8), y: clamp(action.end.y + engine.rng.range(-5, 5), 15, 53) };
    emit(engine, "SET_PIECE_SCRAMBLE", { side: action.side, setPieceType: action.type, position: p, margin }); clearSetPieceContext(engine, "SCRAMBLE"); createLooseBall(engine, p, { source: "SET_PIECE_SCRAMBLE", sourceSide: action.side, secondBall: true, settleSeconds: .24 }); attacking.stats.setPieceSecondBalls += 1;
  }

  function updateSetPieceFlight(engine, dt) {
    const action = engine.activeSetPieceAction; if (!action) return; action.elapsed += dt;
    const raw = clamp(action.elapsed / action.duration, 0, 1), smooth = raw * raw * (3 - 2 * raw), curve = Math.sin(Math.PI * raw) * action.curve;
    engine.ball.position = { x: lerp(action.start.x, action.end.x, smooth), y: lerp(action.start.y, action.end.y, smooth) + curve };
    engine.ball.velocity = { x: (action.end.x - action.start.x) / Math.max(.01, action.duration), y: (action.end.y - action.start.y) / Math.max(.01, action.duration) };
    engine.ball.height = Math.max(0, Math.sin(Math.PI * raw) * action.peakHeight); engine.ball.state = "SET_PIECE_FLIGHT"; engine.ball.reason = action.type;
    if (raw >= 1) resolveSetPieceArrival(engine, action);
  }

  function resolveCorner(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), context = engine.setPieceContext;
    const a = setPieceAssignments(engine, attackingSide, "CORNER", context?.routine || restart.routine); a.routine = context?.routine || a.routine; a.markingStyle = context?.markingStyle || a.markingStyle;
    const goalX = attackGoalX(team); let target = { x: goalX - team.direction * 6.5, y: 34 };
    if (a.routine === "near-post") target.y = restart.spot?.y < 34 ? 29.5 : 38.5; else if (a.routine === "far-post") target.y = restart.spot?.y < 34 ? 41 : 27; else if (a.routine === "crowd-keeper") target = { x: goalX - team.direction * 3.8, y: 34 }; else if (a.routine === "edge" && a.edge) target = { x: goalX - team.direction * 20, y: a.edge.positionNow.y };
    if (a.routine === "short") { const receiver = a.edge || a.rebound || a.secondary; receiver.positionNow = { x: restart.spot.x - team.direction * 7, y: restart.spot.y < 34 ? 7 : 61 }; a.taker.positionNow = { ...restart.spot }; clearSetPieceContext(engine, "SHORT_CORNER_START"); setBallOwner(engine, a.taker, "SHORT_CORNER"); startPassFlight(engine, a.taker, receiver, { receiver, forward: (receiver.positionNow.x - a.taker.positionNow.x) * team.direction }, false, { forceQuality: 88 }); emit(engine, "SHORT_CORNER_TAKEN", { side: attackingSide, playerId: a.taker.id, receiverId: receiver.id }); return; }
    startSetPieceDelivery(engine, a, "CORNER", target, { targetId: a.routine === "edge" ? a.edge?.id : a.primary?.id, peakHeight: a.routine === "crowd-keeper" ? 4.8 : 4.2 });
  }

  function resolveDirectFreeKick(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "DIRECT_FREE_KICK", restart.routine), taker = a.taker;
    taker.positionNow = { ...restart.spot }; if (a.goalkeeper) a.goalkeeper.positionNow = { x: attackGoalX(team) - team.direction * 1.2, y: 34 };
    team.stats.freeKickShots += 1; team.stats.setPieceShots += 1; clearSetPieceContext(engine, "DIRECT_FREE_KICK_SHOT"); setBallOwner(engine, taker, "DIRECT_FREE_KICK"); emit(engine, "DIRECT_FREE_KICK_TAKEN", { side: attackingSide, playerId: taker.id, spot: { ...restart.spot } });
    resolveShot(engine, taker, "DIRECT_FREE_KICK", { shotType: engine.rng.chance(.55) ? "PLACED" : "POWER", targetY: 34 + engine.rng.range(-3.1, 3.1), targetZ: engine.rng.range(.65, 2.25) });
  }
  function resolveIndirectFreeKick(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "INDIRECT_FREE_KICK", engine.setPieceContext?.routine || restart.routine); a.routine = engine.setPieceContext?.routine || a.routine; a.markingStyle = engine.setPieceContext?.markingStyle || a.markingStyle;
    const target = { x: attackGoalX(team) - team.direction * engine.rng.range(6, 10), y: a.routine === "far-post" ? (restart.spot.y < 34 ? 41 : 27) : a.routine === "near-post" ? (restart.spot.y < 34 ? 29 : 39) : 34 + engine.rng.range(-5, 5) };
    startSetPieceDelivery(engine, a, "INDIRECT_FREE_KICK", target, { targetId: a.primary?.id, peakHeight: 3.8 });
  }
  function resolveThrowIn(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "THROW_IN", engine.setPieceContext?.routine || restart.routine); a.routine = engine.setPieceContext?.routine || a.routine;
    const receiver = a.routine === "long-throw" ? a.primary : a.edge || a.rebound || a.secondary; a.taker.positionNow = { ...restart.spot };
    if (a.routine === "long-throw") { startSetPieceDelivery(engine, a, "THROW_IN", { x: attackGoalX(team) - team.direction * 8, y: restart.spot.y < 34 ? 28 : 40 }, { targetId: receiver?.id, peakHeight: 2.8 }); emit(engine, "LONG_THROW_TAKEN", { side: attackingSide, playerId: a.taker.id, targetId: receiver?.id }); return; }
    receiver.positionNow = { x: clamp(restart.spot.x + team.direction * (a.routine === "channel" ? 10 : 4), 3, 97), y: restart.spot.y < 34 ? engine.rng.range(5, 16) : engine.rng.range(52, 63) };
    clearSetPieceContext(engine, "THROW_IN_PASS"); setBallOwner(engine, a.taker, "THROW_IN"); startPassFlight(engine, a.taker, receiver, { receiver, forward: (receiver.positionNow.x - a.taker.positionNow.x) * team.direction }, false, { forceQuality: 82 }); emit(engine, "THROW_IN_TAKEN", { side: attackingSide, playerId: a.taker.id, receiverId: receiver.id, routine: a.routine });
  }
  function resolvePenalty(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "PENALTY", restart.routine), taker = a.taker;
    taker.positionNow = { x: attackGoalX(team) - team.direction * 11, y: 34 }; if (a.goalkeeper) a.goalkeeper.positionNow = { x: attackGoalX(team) - team.direction * .7, y: 34 };
    team.stats.setPieceShots += 1; clearSetPieceContext(engine, "PENALTY_SHOT"); setBallOwner(engine, taker, "PENALTY"); emit(engine, "PENALTY_TAKEN", { side: attackingSide, playerId: taker.id, goalkeeperId: a.goalkeeper?.id });
    resolveShot(engine, taker, "PENALTY", { shotType: engine.rng.chance(.18) ? "POWER" : "PLACED", targetY: 34 + engine.rng.range(-3.35, 3.35), targetZ: engine.rng.range(.25, 2.05) });
  }

  function resolveRestart(engine) {
    const restart = engine.restart; if (!restart || engine.clockSeconds < restart.executeAt) return; engine.restart = null; const team = teamBySide(engine, restart.side);
    if (restart.type === "KICK_OFF") { clearSetPieceContext(engine, "KICK_OFF"); const striker = team.players.find(player => player.group === "ST") || team.players[9]; striker.positionNow = { x: 50 - team.direction * 1.5, y: 34 }; setBallOwner(engine, striker, "KICK_OFF"); emit(engine, "KICK_OFF", { side: restart.side }); return; }
    if (restart.type === "GOAL_KICK") { clearSetPieceContext(engine, "GOAL_KICK"); const goalkeeper = team.players.find(player => player.group === "GK"); setBallOwner(engine, goalkeeper, "GOAL_KICK"); emit(engine, "GOAL_KICK", { side: restart.side, playerId: goalkeeper.id }); return; }
    if (restart.type === "CORNER") return resolveCorner(engine, restart.side, restart);
    if (restart.type === "DIRECT_FREE_KICK") return resolveDirectFreeKick(engine, restart.side, restart);
    if (restart.type === "INDIRECT_FREE_KICK") return resolveIndirectFreeKick(engine, restart.side, restart);
    if (restart.type === "THROW_IN") return resolveThrowIn(engine, restart.side, restart);
    if (restart.type === "PENALTY") return resolvePenalty(engine, restart.side, restart);
  }

  function maybeAwardSetPiece(engine, owner) {
    if (!owner || engine.clockSeconds < 20 || engine.lastPossessionChangeAgo < 1.4) return false;
    const team = teamBySide(engine, owner.side), opponent = opponentTeam(engine, owner.side), pressure = pressureAt(engine, owner), progress = progressFor(team, owner.positionNow.x), wide = isWide(owner.positionNow.y);
    const intensity = pressure * .55 + opponent.tactics.pressing * .22 + owner.behaviour.aggression * .10 + engine.rng.range(-8, 8);
    const penaltyChance = isInBox(team, owner.positionNow) ? clamp(.00018 + Math.max(0, intensity - 52) / 5200, 0, .0028) : 0;
    if (penaltyChance > 0 && engine.rng.chance(penaltyChance)) { opponent.stats.fouls += 1; schedulePenalty(engine, owner.side, "FOUL_IN_BOX"); emit(engine, "FOUL", { side: opponent.side, playerId: nearestPlayers(opponent.players, owner.positionNow, 1)[0]?.player?.id, victimId: owner.id, penalty: true }); return true; }
    const foulChance = clamp(.0034 + pressure / 15500 + (progress > 58 ? .0018 : 0), .0025, .0125);
    if (engine.rng.chance(foulChance)) { opponent.stats.fouls += 1; scheduleFreeKick(engine, owner.side, { ...owner.positionNow }, "FOUL"); emit(engine, "FOUL", { side: opponent.side, playerId: nearestPlayers(opponent.players, owner.positionNow, 1)[0]?.player?.id, victimId: owner.id, penalty: false }); return true; }
    if (wide && progress > 64 && pressure > 28 && engine.rng.chance(.0032)) { scheduleCorner(engine, owner.side, "WIDE_DEFLECTION", { y: owner.positionNow.y < 34 ? 0 : 68 }); return true; }
    if (engine.rng.chance(wide ? .0072 : .0010)) { scheduleThrowIn(engine, owner.side, owner.positionNow, "DEFLECTION_OUT"); return true; }
    return false;
  }

  function executeDecision(engine) {
    if (engine.restart || engine.activeBallAction || engine.activeShotAction || engine.activeSetPieceAction || engine.looseBallState || engine.ballAuthoritySuspended) return;
    const owner = getPlayer(engine, engine.ball.ownerId);
    if (!owner) {
      looseBall(engine, engine.ball.position, { source: "UNCONTROLLED", secondBall: false });
      return;
    }
    if (maybeAwardSetPiece(engine, owner)) return;
    const action = chooseAction(engine, owner);
    engine.possessionActions = Number(engine.possessionActions || 0) + 1;
    owner.currentIntent = action.type;
    if (action.type === "SHOT") {
      resolveShot(engine, owner, "OPEN_PLAY");
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
      } else if (engine.activeSetPieceAction) {
        updateSetPieceFlight(engine, FIXED_STEP);
      } else if (engine.activeShotAction) {
        updateShotFlight(engine, FIXED_STEP);
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
      if (!engine.restart && !engine.activeBallAction && !engine.activeShotAction && !engine.activeSetPieceAction && !engine.looseBallState && !engine.ballAuthoritySuspended && engine.nextDecisionIn <= 0) executeDecision(engine);
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
      activeShotAction: null,
      activeSetPieceAction: null,
      setPieceContext: null,
      looseBallState: null,
      ballActionSequence: 0,
      shotSequence: 0,
      setPieceSequence: 0,
      setPieceActionSequence: 0,
      ballAuthoritySuspended: false,
      events: [],
      eventSequence: 0,
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
          engine.activeShotAction = null;
          engine.activeSetPieceAction = null;
          engine.setPieceContext = null;
          engine.looseBallState = null;
          engine.ball.state = "EXTERNAL";
          engine.nextDecisionIn = 999;
          if (external.ball || external.possessionSide) engine.syncExternalState({ ...external, preserveAction: true });
        } else {
          engine.nextDecisionIn = clamp(Number(external.nextDecisionIn ?? 0.8), 0.2, 2.5);
          if (external.ball || external.possessionSide) engine.syncExternalState({ ...external, preserveAction: false });
        }
        emit(engine, "BALL_AUTHORITY_CHANGED", { authority: engine.ballAuthoritySuspended ? "EXTERNAL_SUSPENDED" : "V4_FULL_AUTHORITY" });
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
          engine.activeShotAction = null;
          engine.activeSetPieceAction = null;
          engine.setPieceContext = null;
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
        engine.activeShotAction = null;
        engine.activeSetPieceAction = null;
        engine.setPieceContext = null;
        engine.looseBallState = null;
        setBallOwner(engine, owner, "DEBUG_CONTROL");
        return startPassFlight(engine, owner, receiver, { receiver, forward: (receiver.positionNow.x - owner.positionNow.x) * teamBySide(engine, owner.side).direction }, Boolean(options.isCross), options);
      },
      debugStartShot(shooterId, options = {}) {
        const shooter = getPlayer(engine, shooterId);
        if (!shooter) throw new Error("debugStartShot requires a valid shooter");
        engine.restart = null;
        engine.activeBallAction = null;
        engine.activeShotAction = null;
        engine.activeSetPieceAction = null;
        engine.setPieceContext = null;
        engine.looseBallState = null;
        setBallOwner(engine, shooter, "DEBUG_SHOT_CONTROL");
        return startShotFlight(engine, shooter, options.source || "OPEN_PLAY", options);
      },
      debugStartSetPiece(type = "CORNER", side = "home", options = {}) {
        const safeType = String(type || "CORNER").toUpperCase();
        const team = teamBySide(engine, side);
        const spots = {
          CORNER: { x: attackGoalX(team), y: Number(options.y ?? 0) },
          DIRECT_FREE_KICK: { x: attackGoalX(team) - team.direction * Number(options.distance ?? 22), y: Number(options.y ?? 34) },
          INDIRECT_FREE_KICK: { x: attackGoalX(team) - team.direction * Number(options.distance ?? 27), y: Number(options.y ?? 20) },
          THROW_IN: { x: Number(options.x ?? 72), y: Number(options.y ?? .5) },
          PENALTY: { x: attackGoalX(team) - team.direction * 11, y: 34 }
        };
        if (!spots[safeType]) throw new Error("Unsupported debug set piece type");
        engine.restart = null; engine.activeBallAction = null; engine.activeShotAction = null; engine.activeSetPieceAction = null; engine.looseBallState = null;
        scheduleSetPiece(engine, safeType, side, spots[safeType], "DEBUG_SET_PIECE", { routine: options.routine, countStat: options.countStat !== false });
        if (options.immediate !== false) { engine.restart.executeAt = engine.clockSeconds; resolveRestart(engine); }
        return engine.getSnapshot();
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
        const activeSetPiece = engine.activeSetPieceAction ? {
          id: engine.activeSetPieceAction.id,
          type: engine.activeSetPieceAction.type,
          side: engine.activeSetPieceAction.side,
          takerId: engine.activeSetPieceAction.takerId,
          targetId: engine.activeSetPieceAction.targetId,
          routine: engine.activeSetPieceAction.routine,
          markingStyle: engine.activeSetPieceAction.markingStyle,
          progress: clamp(engine.activeSetPieceAction.elapsed / engine.activeSetPieceAction.duration, 0, 1),
          duration: engine.activeSetPieceAction.duration,
          quality: engine.activeSetPieceAction.quality,
          target: { ...engine.activeSetPieceAction.end }
        } : null;
        const activeShot = engine.activeShotAction ? {
          id: engine.activeShotAction.id,
          type: "SHOT",
          side: engine.activeShotAction.side,
          shooterId: engine.activeShotAction.shooterId,
          goalkeeperId: engine.activeShotAction.goalkeeperId,
          blockerId: engine.activeShotAction.blockerId,
          shotType: engine.activeShotAction.shotType,
          outcome: engine.activeShotAction.outcome,
          source: engine.activeShotAction.source,
          progress: clamp(engine.activeShotAction.progress || engine.activeShotAction.elapsed / engine.activeShotAction.duration, 0, 1),
          duration: engine.activeShotAction.duration,
          xg: engine.activeShotAction.xg,
          xgot: engine.activeShotAction.xgot,
          target: { y: engine.activeShotAction.targetY, z: engine.activeShotAction.targetZ },
          goalkeeperAction: engine.activeShotAction.keeper?.action || null
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
          ballAuthority: engine.ballAuthoritySuspended ? "EXTERNAL_SUSPENDED" : "V4_FULL_AUTHORITY",
          ball: { ...engine.ball, position: { ...engine.ball.position }, velocity: { ...engine.ball.velocity } },
          ballControl: {
            state: engine.ball.state,
            activeAction,
            activeShot,
            activeSetPiece,
            setPiece: engine.setPieceContext ? { id: engine.setPieceContext.id, type: engine.setPieceContext.type, side: engine.setPieceContext.side, routine: engine.setPieceContext.routine, markingStyle: engine.setPieceContext.markingStyle, assignments: { ...engine.setPieceContext.assignments } } : null,
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
    BALL_CONTROL_VERSION: 4,
    SHOT_GOALKEEPER_VERSION: 4,
    SET_PIECE_AERIAL_VERSION: 5,
    SET_PIECE_ROUTINES
  });

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof globalThis !== "undefined") globalThis.FIFA_MATCH_ENGINE_V4 = API;
})();
(() => {
  "use strict";

  const VERSION = "4.0.0-phase5-authority.1";
  const DEFAULT_POLL_MS = 125;
  const runtime = {
    enabled: false,
    timer: null,
    pollMs: DEFAULT_POLL_MS,
    fixtureId: null,
    engine: null,
    lastLegacySecond: 0,
    diagnostics: null,
    configSignature: null,
    lastConfig: null,
    authority: "V4_FULL_AUTHORITY",
    terminalUntil: 0,
    lastOfficialEventSignature: null,
    lastAuthorityChangeAt: 0,
    statsWrites: 0
  };

  const room = () => globalThis.FIFA_MANAGER_ROOM;
  const core = () => globalThis.FIFA_MATCH_ENGINE_V4;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  function activeContext() {
    const career = room()?.getActiveCareer?.();
    if (!career) return null;
    const fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    const activeId = career.activeMatchFixtureId;
    const fixture = (activeId ? fixtures.find(item => item.id === activeId) : null) ||
      fixtures.find(item => ["live", "decision", "paused"].includes(item.matchEngine?.status)) ||
      fixtures.find(item => item.id === runtime.fixtureId);
    if (!fixture?.matchEngine) return null;
    return { career, fixture };
  }

  function actor(career, id) {
    return room()?.getActor?.(career, id) || (career.actors || []).find(item => item.id === id) || {};
  }

  function teamFor(fixture, id) {
    return room()?.getTeamForActor?.(fixture, id) ||
      (id === fixture.homeId ? fixture.homeTeamData : fixture.awayTeamData) || {};
  }

  function numericChoice(value, choices, fallback) {
    if (Number.isFinite(Number(value))) return Number(value);
    return Object.prototype.hasOwnProperty.call(choices, value) ? choices[value] : fallback;
  }

  function phaseBehaviors(plan = {}) {
    return plan.phaseBehaviors || plan.phases || {
      inPossession: plan.inPossession,
      outPossession: plan.outPossession,
      winTransition: plan.winTransition,
      lossTransition: plan.lossTransition
    };
  }

  function roleMap(plan = {}) {
    return plan.positionRoles || plan.roles || {};
  }

  function mapMentality(plan = {}) {
    return plan.mentality || plan.base?.mentality || "balanced";
  }

  function inferFullbackDuty(plan = {}) {
    const roles = Object.values(roleMap(plan)).map(value => String(value).toLowerCase());
    if (roles.some(value => /attacking-wingback|wing-back-attack|overlap|complete-wingback/.test(value))) return "attack";
    if (roles.some(value => /stay-back|defensive-wingback|fullback-defend|no-nonsense/.test(value))) return "defend";
    const mentality = mapMentality(plan);
    if (["aggressive", "attacking", "all-out"].includes(mentality)) return "attack";
    if (["controlled", "defensive", "protect"].includes(mentality)) return "defend";
    return "balanced";
  }

  function inferGoalkeeper(plan = {}) {
    const roles = Object.values(roleMap(plan)).map(value => String(value).toLowerCase());
    if (roles.some(value => /distributor|playmaker-keeper|ball-playing-keeper/.test(value))) return "playmaker-keeper";
    if (roles.some(value => /sweeper/.test(value))) return "sweeper-keeper";
    if (roles.some(value => /shot-stopper|line-keeper/.test(value))) return "line-keeper";
    if (roles.some(value => /cross-commander|aerial/.test(value))) return "cross-commander";
    if (roles.some(value => /eccentric/.test(value))) return "eccentric-keeper";
    return "sweeper-keeper";
  }

  function mapTactics(plan = {}, actorRow = {}) {
    const style = actorRow.styleSeed || {};
    const phases = phaseBehaviors(plan);
    const mentality = mapMentality(plan);
    const tempo = numericChoice(plan.tempo, { low: 38, normal: 52, high: 70, extreme: 82 }, Number(style.tempo || 50));
    const pressing = numericChoice(plan.pressing, { low: 35, mid: 52, high: 72, extreme: 84 }, Number(style.pressing || 50));
    const risk = numericChoice(plan.risk, { safe: 35, measured: 50, bold: 70, reckless: 84 }, Number(style.risk || 50));
    const directness = numericChoice(plan.buildUp, { patient: 32, central: 48, balanced: 50, wings: 56, direct: 74, transition: 78 }, Number(style.directness || 50));
    const width = numericChoice(plan.width, { narrow: 38, balanced: 52, wide: 72 }, plan.buildUp === "wings" ? 72 : plan.buildUp === "central" ? 42 : Number(style.width || 50));
    const out = phases.outPossession || "mid-block";
    return {
      mentality,
      inPossession: phases.inPossession || "positional",
      outPossession: out,
      winTransition: phases.winTransition || "secure",
      lossTransition: phases.lossTransition || "regroup",
      tempo: clamp(tempo, 20, 90),
      width: clamp(width, 25, 85),
      pressing: clamp(pressing, 20, 90),
      risk: clamp(risk, 20, 90),
      passingDirectness: clamp(directness, 20, 90),
      defensiveLine: out === "high-press" ? 70 : out === "low-block" ? 36 : 52,
      fullbackDuty: inferFullbackDuty(plan),
      cornerRoutine: plan.setPieces?.cornerRoutine || plan.cornerRoutine || "mixed",
      freeKickRoutine: plan.setPieces?.freeKickRoutine || plan.freeKickRoutine || "mixed",
      throwInRoutine: plan.setPieces?.throwInRoutine || plan.throwInRoutine || "support",
      setPieceMarking: plan.setPieces?.marking || plan.setPieceMarking || "hybrid",
      setPieceRisk: Number(plan.setPieces?.risk || plan.setPieceRisk || 52)
    };
  }

  function sidePlans(fixture) {
    const legacy = fixture.matchEngine || {};
    const humanSide = legacy.humanSide || null;
    const humanPlan = legacy.userPlan || fixture.matchPlan?.human || fixture.matchPlan || {};
    const aiPlan = legacy.aiPlan || fixture.matchPlan?.ai || {};
    return {
      humanSide,
      home: humanSide === "home" ? humanPlan : humanSide === "away" ? aiPlan : fixture.matchPlan?.home || humanPlan,
      away: humanSide === "away" ? humanPlan : humanSide === "home" ? aiPlan : fixture.matchPlan?.away || aiPlan
    };
  }

  function buildConfig(career, fixture) {
    const plans = sidePlans(fixture);
    const homeActor = actor(career, fixture.homeId);
    const awayActor = actor(career, fixture.awayId);
    const homeTeam = teamFor(fixture, fixture.homeId);
    const awayTeam = teamFor(fixture, fixture.awayId);
    return {
      matchId: fixture.id,
      mode: "FULL_AUTHORITY",
      seed: `${career.id}|${fixture.id}|ME4-PHASE5`,
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || homeTeam.clubName || fixture.homeTeam || "Home",
        rating: Number(homeTeam.overall || homeTeam.ovr || 80),
        formation: plans.home.formation || "4-3-3",
        roles: roleMap(plans.home),
        goalkeeperArchetype: inferGoalkeeper(plans.home),
        tactics: mapTactics(plans.home, homeActor)
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || awayTeam.clubName || fixture.awayTeam || "Away",
        rating: Number(awayTeam.overall || awayTeam.ovr || 80),
        formation: plans.away.formation || "4-2-3-1",
        roles: roleMap(plans.away),
        goalkeeperArchetype: inferGoalkeeper(plans.away),
        tactics: mapTactics(plans.away, awayActor)
      }
    };
  }

  function stableSignature(config) {
    return JSON.stringify({
      matchId: config.matchId,
      home: config.home,
      away: config.away
    });
  }

  function attach(career, fixture, targetSecond = 0) {
    if (!core()) throw new Error("manager-match-engine-v4-core.js yüklenmedi.");
    const config = buildConfig(career, fixture);
    runtime.engine = core().createEngine(config);
    runtime.fixtureId = fixture.id;
    runtime.lastLegacySecond = 0;
    runtime.diagnostics = null;
    runtime.configSignature = stableSignature(config);
    runtime.lastConfig = config;
    runtime.authority = "V4_FULL_AUTHORITY";
    runtime.terminalUntil = 0;
    runtime.lastOfficialEventSignature = null;
    const second = Math.max(0, Number(targetSecond || 0));
    if (second > 0) runtime.engine.runTo(second);
    runtime.lastLegacySecond = second;
    runtime.engine.setBallAuthority(false, { source: "PHASE5_FULL_AUTHORITY", nextDecisionIn: 0.8 });
    applyV4OfficialState(fixture);
    return runtime.engine;
  }



  function applyOfficialStats(target = {}, source = {}) {
    const keys = [
      "shots", "onTarget", "blocked", "goals", "xg", "xgot", "saves", "savesHeld", "savesParried", "woodwork", "bigChances", "bigChancesMissed",
      "passesAttempted", "passesCompleted", "shortPassesAttempted", "shortPassesCompleted",
      "mediumPassesAttempted", "mediumPassesCompleted", "longPassesAttempted", "longPassesCompleted",
      "finalThirdPassesAttempted", "finalThirdPassesCompleted", "progressivePasses",
      "crossesAttempted", "crossesCompleted", "interceptions", "recoveries", "turnovers",
      "badTouches", "looseBalls", "looseBallsWon", "secondBallsWon", "entriesFinalThird", "entriesBox",
      "carries", "dribblesAttempted", "dribblesCompleted", "corners", "cornerShots", "cornerGoals", "freeKicks", "directFreeKicks", "indirectFreeKicks", "freeKickShots", "freeKickGoals", "throwIns", "penaltiesTaken", "penaltiesScored", "penaltiesSaved", "penaltiesMissed", "setPieceShots", "setPieceGoals", "setPieceSecondBalls", "aerialDuels", "aerialDuelsWon", "defensiveAerialDuels", "defensiveAerialDuelsWon", "clearances", "goalkeeperClaims", "goalkeeperPunches", "goalkeeperMissedClaims", "tacklesAttempted", "tacklesWon", "possession"
    ];
    keys.forEach(key => { target[key] = Number(source[key] || 0); });
    target.passes = target.passesCompleted;
    target.passAccuracy = target.passesAttempted ? Math.round(target.passesCompleted / target.passesAttempted * 100) : 0;
    target.shotsOnTarget = target.onTarget;
    target.expectedGoals = Math.round(target.xg * 100) / 100;
    target.expectedGoalsOnTarget = Math.round(target.xgot * 100) / 100;
    return target;
  }

  function publishOfficialEvent(legacy, snapshot, report) {
    const event = snapshot?.lastEvent;
    if (!event || event.id === runtime.lastOfficialEventSignature) return;
    runtime.lastOfficialEventSignature = event.id;
    const visibleTypes = new Set(["SHOT", "SHOT_BLOCKED", "SHOT_OFF_TARGET", "WOODWORK", "SAVE_HELD", "SAVE_PARRIED", "REBOUND", "GOAL", "CORNER_AWARDED", "SET_PIECE_ORGANIZED", "SET_PIECE_DELIVERY", "DIRECT_FREE_KICK_AWARDED", "INDIRECT_FREE_KICK_AWARDED", "THROW_IN_AWARDED", "PENALTY_AWARDED", "DIRECT_FREE_KICK_TAKEN", "PENALTY_TAKEN", "GOALKEEPER_CLAIM", "GOALKEEPER_PUNCH", "AERIAL_DUEL_WON", "SET_PIECE_CLEARED", "SET_PIECE_COUNTER_STARTED"]);
    if (!visibleTypes.has(event.type)) return;
    const labels = {
      SHOT: "ŞUT", SHOT_BLOCKED: "ŞUT BLOKE", SHOT_OFF_TARGET: "ŞUT DIŞARI", WOODWORK: "DİREK",
      SAVE_HELD: "KALECİ TUTTU", SAVE_PARRIED: "KALECİ ÇELDİ", REBOUND: "DÖNEN TOP", GOAL: "GOL",
      CORNER_AWARDED: "KORNER", SET_PIECE_ORGANIZED: "DURAN TOP ORGANİZASYONU", SET_PIECE_DELIVERY: "DURAN TOP SERVİSİ",
      DIRECT_FREE_KICK_AWARDED: "DİREKT SERBEST VURUŞ", INDIRECT_FREE_KICK_AWARDED: "ENDİREKT SERBEST VURUŞ", THROW_IN_AWARDED: "TAÇ", PENALTY_AWARDED: "PENALTI",
      DIRECT_FREE_KICK_TAKEN: "SERBEST VURUŞ KULLANILDI", PENALTY_TAKEN: "PENALTI KULLANILDI", GOALKEEPER_CLAIM: "KALECİ ÇIKIŞI", GOALKEEPER_PUNCH: "KALECİ YUMRUKLADI",
      AERIAL_DUEL_WON: "HAVA TOPU KAZANILDI", SET_PIECE_CLEARED: "DURAN TOP UZAKLAŞTIRILDI", SET_PIECE_COUNTER_STARTED: "KONTRA BAŞLADI"
    };
    const item = {
      id: `me4p4-${event.id}`,
      source: "ME4_PHASE5",
      type: event.type,
      title: labels[event.type] || event.type,
      text: event.type === "GOAL" ? `GOL! ${event.side === "home" ? report.home.name : report.away.name}` : (labels[event.type] || event.type),
      side: event.side || snapshot.possessionSide,
      minute: event.minute,
      second: event.second,
      playerId: event.playerId || event.shooterId || null,
      xg: Number(event.xg || 0),
      xgot: Number(event.xgot || 0),
      score: { ...report.score }
    };
    legacy.broadcastEvent = item;
    legacy.currentBroadcastEvent = item;
    legacy.events = Array.isArray(legacy.events) ? legacy.events : [];
    if (!legacy.events.some(row => row.id === item.id)) legacy.events.push(item);
    if (legacy.events.length > 300) legacy.events.splice(0, legacy.events.length - 300);
  }

  function applyV4OfficialState(fixture) {
    if (!runtime.engine) return;
    const legacy = fixture.matchEngine || {};
    const snapshot = runtime.engine.getSnapshot();
    const report = runtime.engine.getReport();
    legacy.stats = legacy.stats || {};
    legacy.stats.home = applyOfficialStats(legacy.stats.home || {}, report.home.stats);
    legacy.stats.away = applyOfficialStats(legacy.stats.away || {}, report.away.stats);
    legacy.homeGoals = report.score.home;
    legacy.aiGoals = report.score.away;
    legacy.scoreHome = report.score.home;
    legacy.scoreAway = report.score.away;
    legacy.homeScore = report.score.home;
    legacy.awayScore = report.score.away;
    fixture.homeScore = report.score.home;
    fixture.awayScore = report.score.away;
    legacy.matchEngineV4 = {
      version: VERSION,
      coreVersion: snapshot.version,
      authority: "V4_FULL_AUTHORITY",
      passStatsOfficial: true,
      shotStatsOfficial: true,
      scoreOfficial: true,
      goalkeeperOfficial: true,
      setPiecesOfficial: true,
      aerialDuelsOfficial: true,
      updatedAtSecond: Number(legacy.clockSeconds || 0),
      ballState: snapshot.ballControl?.state || snapshot.ball?.state || "UNKNOWN",
      activeShot: snapshot.ballControl?.activeShot || null,
      eventCount: snapshot.eventCount,
      contract: {
        players: "V4", passingBall: "V4", passControl: "V4", shots: "V4", goalkeeper: "V4", goals: "V4", score: "V4", setPieces: "V4", aerialDuels: "V4",
        persistence: "LEGACY_CAREER_WITH_V4_OFFICIAL_MATCH_STATE"
      }
    };
    runtime.statsWrites += 1;
    legacy.visual2D = legacy.visual2D || {};
    legacy.visual2D.ball = {
      x: clamp(snapshot.ball.position.x, 0.3, 99.7),
      y: clamp(snapshot.ball.position.y / 68 * 100, 0.5, 99.5),
      height: Number(snapshot.ball.height || 0),
      vx: Number(snapshot.ball.velocity?.x || 0),
      vy: Number(snapshot.ball.velocity?.y || 0),
      source: "ME4_PHASE5"
    };
    legacy.visual2D.possession = snapshot.possessionSide;
    legacy.visual2D.phase = phaseLabel(snapshot);
    legacy.visual2D.ballControl = snapshot.ballControl;
    legacy.visual2D.shotAction = snapshot.ballControl?.activeShot || null;
    publishOfficialEvent(legacy, snapshot, report);
  }

  function phaseLabel(snapshot) {
    const state = snapshot?.ballControl?.state;
    const shot = snapshot?.ballControl?.activeShot;
    if (snapshot?.ballControl?.activeSetPiece) return `V4 ${String(snapshot.ballControl.activeSetPiece.type || "DURAN TOP").replace(/_/g, " ")} · ${Math.round((snapshot.ballControl.activeSetPiece.progress || 0) * 100)}%`;
    if (state === "SHOT_FLIGHT" && shot) return `V4 ${String(shot.shotType || "ŞUT").replace(/_/g, " ")} · ${Math.round((shot.progress || 0) * 100)}%`;
    if (state === "GOAL") return "V4 GOL";
    if (state === "IN_FLIGHT") return snapshot.ballControl.activeAction?.type === "CROSS" ? "V4 ORTA UÇUŞU" : "V4 PAS UÇUŞU";
    if (state === "LOOSE") return snapshot.ballControl?.loose?.secondBall ? "V4 İKİNCİ TOP" : "V4 BOŞTA TOP";
    if (state === "CONTROLLED") return `V4 ${String(snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
    return `V4 ${String(state || snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
  }

  function synchronizeOfficialState(fixture) {
    if (!runtime.engine) return;
    runtime.authority = "V4_FULL_AUTHORITY";
    applyV4OfficialState(fixture);
  }

  function compare(fixture, report) {
    const legacy = fixture.matchEngine || {};
    const snapshot = runtime.engine.getSnapshot();
    return {
      fixtureId: fixture.id,
      authority: "V4_FULL_AUTHORITY",
      legacySecond: Number(legacy.clockSeconds || legacy.minute * 60 || 0),
      v4Second: report.status === "fulltime" ? 5400 : runtime.engine.clockSeconds,
      officialScore: { ...report.score },
      ballState: snapshot.ballControl?.state,
      activePass: snapshot.ballControl?.activeAction || null,
      looseBall: snapshot.ballControl?.loose || null,
      passStats: {
        home: { attempted: report.home.stats.passesAttempted, completed: report.home.stats.passesCompleted, accuracy: report.home.stats.passesAttempted ? Math.round(report.home.stats.passesCompleted / report.home.stats.passesAttempted * 100) : 0 },
        away: { attempted: report.away.stats.passesAttempted, completed: report.away.stats.passesCompleted, accuracy: report.away.stats.passesAttempted ? Math.round(report.away.stats.passesCompleted / report.away.stats.passesAttempted * 100) : 0 }
      },
      v4RestDefence: snapshot.restDefence,
      v4LastEvent: report.events.at(-1) || null,
      generatedAt: new Date().toISOString()
    };
  }

  function emitSnapshot() {
    if (typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
    globalThis.dispatchEvent(new globalThis.CustomEvent("fifa-match-engine-v4-phase5", { detail: getSnapshot() }));
    globalThis.dispatchEvent(new globalThis.CustomEvent("fifa-match-engine-v4-shadow", { detail: getSnapshot() }));
  }

  function poll() {
    if (!runtime.enabled) return getSnapshot();
    const context = activeContext();
    if (!context) return getSnapshot();
    const { career, fixture } = context;
    const legacySecond = Math.max(0, Number(fixture.matchEngine?.clockSeconds || fixture.matchEngine?.minute * 60 || 0));
    const nextConfig = buildConfig(career, fixture);
    const nextSignature = stableSignature(nextConfig);
    if (!runtime.engine || runtime.fixtureId !== fixture.id || legacySecond < runtime.lastLegacySecond || nextSignature !== runtime.configSignature) {
      attach(career, fixture, legacySecond);
    } else if (legacySecond > runtime.engine.clockSeconds) {
      runtime.engine.runTo(legacySecond);
      runtime.lastLegacySecond = legacySecond;
    }
    synchronizeOfficialState(fixture);
    runtime.diagnostics = compare(fixture, runtime.engine.getReport());
    emitSnapshot();
    return getSnapshot();
  }

  function restartTimer() {
    if (runtime.timer) globalThis.clearInterval(runtime.timer);
    runtime.timer = runtime.enabled ? globalThis.setInterval(poll, runtime.pollMs) : null;
  }

  function enable() {
    if (!runtime.enabled) {
      runtime.enabled = true;
      restartTimer();
      console.info(`[Match Engine V4] Phase 5 set-piece and aerial authority enabled · ${VERSION}`);
    }
    poll();
    return getSnapshot();
  }

  function disable() {
    runtime.enabled = false;
    restartTimer();
    runtime.fixtureId = null;
    runtime.engine = null;
    runtime.configSignature = null;
    runtime.lastConfig = null;
    runtime.authority = "V4_FULL_AUTHORITY";
    runtime.terminalUntil = 0;
    runtime.lastOfficialEventSignature = null;
    return getSnapshot();
  }

  function setPollInterval(milliseconds) {
    runtime.pollMs = clamp(milliseconds, 60, 2000);
    restartTimer();
    return runtime.pollMs;
  }

  function getSnapshot() {
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.fixtureId,
      authority: "V4_FULL_AUTHORITY",
      terminalUntil: runtime.terminalUntil,
      statsWrites: runtime.statsWrites,
      configSignature: runtime.configSignature,
      config: runtime.lastConfig,
      simulation: runtime.engine?.getSnapshot?.() || null,
      diagnostics: runtime.diagnostics
    };
  }

  function runCalibration(count = 100, seedPrefix = "calibration") {
    if (!core()) throw new Error("V4 core unavailable");
    const safeCount = Math.max(1, Math.min(5000, Number(count) || 100));
    const rows = [];
    for (let index = 0; index < safeCount; index += 1) {
      const engine = core().createEngine(core().createDefaultConfig({ seed: `${seedPrefix}-${index}` }));
      engine.runFullMatch();
      rows.push(engine.getReport());
    }
    const total = rows.reduce((memo, row) => {
      memo.goals += row.score.home + row.score.away;
      memo.shots += row.home.stats.shots + row.away.stats.shots;
      memo.xg += row.home.stats.xg + row.away.stats.xg;
      memo.corners += row.home.stats.corners + row.away.stats.corners;
      memo.passes += row.home.stats.passesAttempted + row.away.stats.passesAttempted;
      memo.freeKicks += row.home.stats.freeKicks + row.away.stats.freeKicks;
      memo.throwIns += row.home.stats.throwIns + row.away.stats.throwIns;
      memo.penalties += row.home.stats.penaltiesTaken + row.away.stats.penaltiesTaken;
      memo.setPieceGoals += row.home.stats.setPieceGoals + row.away.stats.setPieceGoals;
      memo.aerialDuels += row.home.stats.aerialDuels + row.away.stats.aerialDuels;
      return memo;
    }, { goals: 0, shots: 0, xg: 0, corners: 0, passes: 0, freeKicks: 0, throwIns: 0, penalties: 0, setPieceGoals: 0, aerialDuels: 0 });
    return {
      matches: safeCount,
      averages: Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value / safeCount * 100) / 100])),
      samples: rows.slice(0, 5).map(row => ({ score: row.score, homeShots: row.home.stats.shots, awayShots: row.away.stats.shots }))
    };
  }

  const API = Object.freeze({
    VERSION,
    enable,
    disable,
    attach,
    poll,
    getSnapshot,
    runCalibration,
    buildConfig,
    setPollInterval,
    __diagnostics: { activeContext, mapTactics, roleMap, phaseBehaviors, stableSignature, synchronizeOfficialState, applyV4OfficialState, applyOfficialStats, publishOfficialEvent }
  });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE5 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_SHADOW = API;
})();
(() => {
  "use strict";

  const VERSION = "4.0.0-phase5-live.1";
  const STORAGE_KEY = "fifa-me4-phase5-set-piece-authority";
  const PITCH_WIDTH = 68;
  const runtime = {
    enabled: true,
    raf: null,
    observer: null,
    lastAppliedAt: 0,
    lastFixtureId: null,
    appliedFrames: 0
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const adapter = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE5 || globalThis.FIFA_MATCH_ENGINE_V4_SHADOW;
  const room = () => globalThis.FIFA_MANAGER_ROOM;

  function readPreference() {
    try {
      const value = globalThis.localStorage?.getItem?.(STORAGE_KEY);
      return value !== "0";
    } catch (_) {
      return true;
    }
  }

  function savePreference(value) {
    try { globalThis.localStorage?.setItem?.(STORAGE_KEY, value ? "1" : "0"); } catch (_) {}
  }

  function activeContext() {
    const career = room()?.getActiveCareer?.();
    if (!career) return null;
    const fixtures = Array.isArray(career.fixtures) ? career.fixtures : [];
    const fixture = (career.activeMatchFixtureId ? fixtures.find(item => item.id === career.activeMatchFixtureId) : null) ||
      fixtures.find(item => ["live", "decision", "paused"].includes(item.matchEngine?.status));
    if (!fixture?.matchEngine) return null;
    return { career, fixture, engine: fixture.matchEngine };
  }

  function toPercentPoint(point = {}) {
    return {
      x: clamp(point.x, 1.2, 98.8),
      y: clamp(Number(point.y || 0) / PITCH_WIDTH * 100, 2.5, 97.5)
    };
  }

  function safeIntent(intent) {
    return String(intent || "hold-shape").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  }

  function intentLabel(intent) {
    const labels = {
      "hold-shape": "ŞEKLİ KORU",
      "support": "DESTEK",
      "support-run": "DESTEK KOŞUSU",
      "overlap": "BİNDİRME",
      "underlap": "İÇ KORİDOR",
      "invert": "MERKEZE GİR",
      "run-behind": "SAVUNMA ARKASI",
      "attack-box": "CEZA SAHASI",
      "press": "PRES",
      "cover": "KADEME",
      "mark": "MARKAJ",
      "recover": "GERİ DÖNÜŞ",
      "carry": "TOP TAŞI",
      "receive": "PAS İSTASYONU",
      "goalkeeper-position": "KALECİ POZİSYONU",
      "sweep": "SÜPÜRÜCÜ ÇIKIŞ",
      "pass": "PAS",
      "cross": "ORTA",
      "waiting-terminal": "ŞUT HAZIRLIĞI",
      "shoot": "ŞUT", "set-save": "KALECİ SET", "full-stretch": "TAM UZANIŞ", "high-dive": "YÜKSEK UZANIŞ", "foot-save": "AYAKLA KURTARIŞ",
      "set-piece-taker": "DURAN TOP KULLANICI", "primary-aerial-target": "ANA HAVA HEDEFİ", "secondary-aerial-target": "İKİNCİ HAVA HEDEFİ",
      "near-post-run": "ÖN DİREK KOŞUSU", "far-post-run": "ARKA DİREK KOŞUSU", "screen-goalkeeper": "KALECİ PERDESİ", "edge-of-box": "CEZA YAYI",
      "second-ball-attack": "İKİNCİ TOP", "zonal-set-piece": "ALAN MARKAJI", "man-mark-set-piece": "ADAM MARKAJI", "command-area": "ALAN HAKİMİYETİ",
      "counter-outlet": "KONTRA ÇIKIŞI", "set-piece-delivery": "DURAN TOP SERVİSİ", "long-throw-delivery": "UZUN TAÇ", "claim-cross": "ORTAYI AL", "missed-claim": "HATALI ÇIKIŞ", "attack-header": "KAFA VURUŞU", "aerial-clearance": "HAVA TOPU UZAKLAŞTIR"
    };
    return labels[safeIntent(intent)] || String(intent || "POZİSYON").replace(/-/g, " ").toLocaleUpperCase("tr-TR");
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("me4LiveBridgeStyles")) return;
    const style = document.createElement("style");
    style.id = "me4LiveBridgeStyles";
    style.textContent = `
      .manager-2d-pitch.me4-visual-active .match-player{transition:left .16s linear,top .16s linear,transform .16s ease,box-shadow .16s ease;will-change:left,top;}
      .manager-2d-pitch.me4-visual-active .match-player.v4-has-ball{transform:translate(-50%,-50%) scale(1.14);box-shadow:0 0 0 4px rgba(246,202,91,.24),0 7px 17px rgba(0,0,0,.52);}
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="press"]{box-shadow:0 0 0 3px rgba(255,94,94,.18),0 6px 15px rgba(0,0,0,.48);}
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="overlap"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="underlap"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="run-behind"]{box-shadow:0 0 0 3px rgba(93,213,255,.18),0 6px 15px rgba(0,0,0,.48);}
      .match-player .me4-intent-label{display:none;position:absolute;z-index:12;left:50%;bottom:31px;transform:translateX(-50%);min-width:max-content;padding:3px 5px;border:1px solid rgba(255,255,255,.16);border-radius:5px;background:rgba(2,11,18,.88);color:#d9edf5;font-size:5px;font-style:normal;font-weight:900;letter-spacing:.04em;pointer-events:none;}
      .match-player.v4-has-ball .me4-intent-label,.match-player:hover .me4-intent-label{display:block;}
      .me4-live-hud{display:flex!important;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:5px;margin-left:auto;text-align:right;}
      .me4-live-hud span,.me4-live-hud button{display:inline-flex!important;align-items:center;gap:4px;margin:0!important;padding:5px 7px;border:1px solid rgba(92,195,235,.18);border-radius:8px;background:rgba(6,25,38,.74);color:#83ccec;font-size:6px!important;font-weight:950;letter-spacing:.07em;line-height:1;}
      .me4-live-hud span b{display:inline!important;margin:0;color:#f0c968;font-size:7px!important;}
      .me4-live-hud button{cursor:pointer;color:#dfeaf0;}
      .me4-live-hud button.active{border-color:rgba(240,201,104,.42);background:rgba(177,126,35,.22);color:#f5d98e;}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-in-flight{transition:left .08s linear,top .08s linear,transform .08s linear;transform:translate(-50%,-50%) scale(1.12);filter:drop-shadow(0 0 7px rgba(240,201,104,.72));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-loose{animation:me4LoosePulse .45s ease-in-out infinite alternate;filter:drop-shadow(0 0 8px rgba(255,107,107,.75));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-external{filter:drop-shadow(0 0 7px rgba(113,189,255,.65));}
      .manager-2d-pitch.me4-visual-active .match-ball.me4-ball-shot{transition:left .045s linear,top .045s linear,transform .045s linear;transform:translate(-50%,-50%) scale(1.24);filter:drop-shadow(0 0 9px rgba(255,244,181,.92));}
      .manager-2d-pitch.me4-goal-flash{animation:me4GoalFlash .7s ease-out;}
      .me4-pass-line{position:absolute;z-index:7;height:1px;transform-origin:0 50%;border-top:1px dashed rgba(240,201,104,.48);pointer-events:none;opacity:.8;}
      .me4-pass-line.me4-shot-line{border-top:2px solid rgba(255,238,158,.78);box-shadow:0 0 8px rgba(255,221,108,.36);opacity:1;}
      .me4-ball-state{color:#f4d782!important}.me4-authority-v4{color:#70e6ac!important}.me4-authority-legacy{color:#82bfff!important}
      @keyframes me4LoosePulse{from{transform:translate(-50%,-50%) scale(.94)}to{transform:translate(-50%,-50%) scale(1.2)}}
      @keyframes me4GoalFlash{0%{box-shadow:inset 0 0 0 rgba(255,226,112,0)}35%{box-shadow:inset 0 0 70px rgba(255,226,112,.48)}100%{box-shadow:inset 0 0 0 rgba(255,226,112,0)}}
      @media(max-width:760px){.me4-live-hud{width:100%;justify-content:flex-start;margin-top:7px}.me4-live-hud span:nth-child(n+3){display:none!important}.match-player .me4-intent-label{bottom:25px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHud(pitch, simulation, phase5Snapshot) {
    const view = pitch?.closest?.(".manager-2d-view");
    const header = view?.querySelector?.(":scope > header") || view?.querySelector?.("header");
    if (!header) return;
    let hud = header.querySelector(".me4-live-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "me4-live-hud";
      hud.innerHTML = `<span>ME4 <b>SET PIECE · AERIAL AI</b></span><span data-me4-phase>—</span><span data-me4-ball class="me4-ball-state">BALL —</span><span data-me4-authority>AUTH —</span><span data-me4-pass>PASS —</span><span data-me4-rest>REST DEF —</span><button type="button" data-me4-toggle class="active">V4 PHASE 5</button>`;
      header.appendChild(hud);
      hud.querySelector("[data-me4-toggle]")?.addEventListener("click", toggle);
    }
    const phase = hud.querySelector("[data-me4-phase]");
    if (phase) phase.textContent = String(simulation?.phase || "AKAN OYUN").replace(/_/g, " ");
    const ballState = simulation?.ballControl?.state || simulation?.ball?.state || "CONTROLLED";
    const ball = hud.querySelector("[data-me4-ball]");
    if (ball) ball.textContent = `BALL ${String(ballState).replace(/_/g, " ")}`;
    const authorityValue = phase5Snapshot?.authority || simulation?.ballAuthority || "V4_FULL_AUTHORITY";
    const authority = hud.querySelector("[data-me4-authority]");
    if (authority) {
      authority.textContent = "V4 TAM MAÇ YETKİSİ";
      authority.className = "me4-authority-v4";
    }
    const pass = hud.querySelector("[data-me4-pass]");
    const action = simulation?.ballControl?.activeAction;
    const shot = simulation?.ballControl?.activeShot;
    const setPiece = simulation?.ballControl?.activeSetPiece;
    if (pass) pass.textContent = setPiece ? `${String(setPiece.type).replace(/_/g, " ")} · ${String(setPiece.routine || "").replace(/-/g, " ")} · ${Math.round((setPiece.progress || 0) * 100)}%` : shot ? `${shot.shotType} ${Math.round((shot.progress || 0) * 100)}% · xG ${Number(shot.xg || 0).toFixed(2)} · ${shot.goalkeeperAction || "GK"}` : action ? `${action.type} ${Math.round(action.progress * 100)}% · Q${Math.round(action.passQuality || 0)}` : simulation?.ballControl?.loose ? "İKİNCİ TOP MÜCADELESİ" : "TOP KONTROLDE";
    const rest = hud.querySelector("[data-me4-rest]");
    if (rest) rest.textContent = `REST DEF ${Math.round(simulation?.restDefence?.home || 0)} · ${Math.round(simulation?.restDefence?.away || 0)}`;
    const toggleButton = hud.querySelector("[data-me4-toggle]");
    if (toggleButton) {
      toggleButton.classList.toggle("active", runtime.enabled);
      toggleButton.textContent = runtime.enabled ? "V4 PHASE 5" : "LEGACY GÖRÜNTÜ";
    }
  }

  function ensureIntentNode(node) {
    let label = node.querySelector?.(".me4-intent-label");
    if (!label && typeof document !== "undefined") {
      label = document.createElement("em");
      label.className = "me4-intent-label";
      node.appendChild(label);
    }
    return label;
  }

  function applyTeam(nodes, teamSnapshot) {
    const players = teamSnapshot?.players || [];
    nodes.forEach(node => {
      const player = players[Number(node.dataset.index)];
      if (!player?.point) return;
      const point = toPercentPoint(player.point);
      node.style.left = `${point.x}%`;
      node.style.top = `${point.y}%`;
      const intent = safeIntent(player.intent);
      node.dataset.v4Intent = intent;
      node.classList.toggle("v4-has-ball", Boolean(player.hasBall));
      node.setAttribute("aria-label", `${player.name} · ${player.role} · ${intentLabel(intent)}`);
      node.title = `${player.name} · ${player.position} · ${player.role} · ${intentLabel(intent)} · Enerji ${Math.round(player.energy)}`;
      const label = ensureIntentNode(node);
      if (label) label.textContent = intentLabel(intent);
    });
  }


  function clearPassLine(pitch) {
    pitch?.querySelector?.(".me4-pass-line")?.remove?.();
  }


  function drawLine(pitch, from, to, shot = false) {
    let line = pitch.querySelector(".me4-pass-line");
    if (!line) {
      line = document.createElement("i");
      line.className = "me4-pass-line";
      pitch.appendChild(line);
    }
    line.classList.toggle("me4-shot-line", shot);
    const dx = to.x - from.x, dy = to.y - from.y;
    line.style.left = `${from.x}%`;
    line.style.top = `${from.y}%`;
    line.style.width = `${Math.hypot(dx, dy)}%`;
    line.style.transform = `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)`;
  }

  function applyBall(pitch, simulation) {
    const node = pitch?.querySelector?.("[data-live-ball]");
    if (!node || !simulation?.ball?.position) return;
    const point = toPercentPoint(simulation.ball.position);
    node.style.left = `${point.x}%`;
    node.style.top = `${point.y}%`;
    const state = String(simulation.ballControl?.state || simulation.ball.state || "CONTROLLED");
    const shot = simulation.ballControl?.activeShot;
    node.classList.toggle("me4-ball-in-flight", state === "IN_FLIGHT" || state === "SET_PIECE_FLIGHT");
    node.classList.toggle("me4-ball-shot", state === "SHOT_FLIGHT");
    node.classList.toggle("me4-ball-loose", state === "LOOSE");
    node.classList.remove("me4-ball-external");
    node.dataset.me4BallState = state.toLowerCase();
    node.title = `${state.replace(/_/g, " ")} · ${simulation.ball.reason || "V4 BALL"} · h${Number(simulation.ball.height || 0).toFixed(1)}`;
    if (state === "GOAL") {
      pitch.classList.remove("me4-goal-flash");
      void pitch.offsetWidth;
      pitch.classList.add("me4-goal-flash");
    }
    if (shot) {
      const players = [simulation.teams?.home, simulation.teams?.away].flatMap(team => team?.players || []);
      const shooter = players.find(player => player.id === shot.shooterId);
      if (shooter?.point) {
        const from = toPercentPoint(shooter.point);
        const to = { x: shot.side === "home" ? 99.2 : 0.8, y: clamp(Number(shot.target?.y || 34) / PITCH_WIDTH * 100, 1, 99) };
        drawLine(pitch, from, to, true);
      }
      return;
    }
    const action = simulation.ballControl?.activeAction;
    if (!action) {
      clearPassLine(pitch);
      return;
    }
    const players = [simulation.teams?.home, simulation.teams?.away].flatMap(team => team?.players || []);
    const owner = players.find(player => player.id === action.ownerId);
    const receiver = players.find(player => player.id === action.receiverId);
    if (owner?.point && receiver?.point) drawLine(pitch, toPercentPoint(owner.point), toPercentPoint(receiver.point), false);
  }

  function restoreLegacy(context) {
    if (typeof document === "undefined") return;
    const mount = document.getElementById("managerMatchMount");
    const state = context?.engine?.visual2D;
    if (!mount || !state) return;
    mount.querySelectorAll("[data-motion-player]").forEach(node => {
      const player = state[node.dataset.side]?.[Number(node.dataset.index)];
      if (!player) return;
      node.style.left = `${player.x}%`;
      node.style.top = `${player.y}%`;
      node.classList.remove("v4-has-ball");
      delete node.dataset.v4Intent;
    });
    const ball = mount.querySelector("[data-live-ball]");
    if (ball && state.ball) {
      ball.style.left = `${state.ball.x}%`;
      ball.style.top = `${state.ball.y}%`;
      ball.classList.remove("me4-ball-in-flight", "me4-ball-loose", "me4-ball-external");
    }
    const pitch = mount.querySelector(".manager-2d-pitch");
    clearPassLine(pitch);
    pitch?.classList.remove("me4-visual-active");
  }

  function applyFrame(force = false) {
    if (typeof document === "undefined") return false;
    const now = globalThis.performance?.now?.() || Date.now();
    if (!force && now - runtime.lastAppliedAt < 35) return false;
    runtime.lastAppliedAt = now;
    const context = activeContext();
    if (!context) return false;
    const phase5Snapshot = adapter()?.getSnapshot?.();
    const simulation = phase5Snapshot?.simulation;
    const mount = document.getElementById("managerMatchMount");
    const pitch = mount?.querySelector?.(".manager-2d-pitch");
    if (!pitch) return false;
    ensureStyles();
    ensureHud(pitch, simulation, phase5Snapshot);
    if (!runtime.enabled || !simulation?.teams) {
      restoreLegacy(context);
      return false;
    }
    pitch.classList.add("me4-visual-active");
    applyTeam(Array.from(pitch.querySelectorAll('[data-motion-player][data-side="home"]')), simulation.teams.home);
    applyTeam(Array.from(pitch.querySelectorAll('[data-motion-player][data-side="away"]')), simulation.teams.away);
    applyBall(pitch, simulation);
    runtime.lastFixtureId = context.fixture.id;
    runtime.appliedFrames += 1;
    return true;
  }

  function loop() {
    applyFrame(false);
    runtime.raf = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame(loop)
      : globalThis.setTimeout(loop, 50);
  }

  function startObserver() {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined" || runtime.observer) return;
    runtime.observer = new MutationObserver(() => applyFrame(true));
    runtime.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function startLoop() {
    if (runtime.raf) return;
    loop();
  }

  function stopLoop() {
    if (!runtime.raf) return;
    if (typeof globalThis.cancelAnimationFrame === "function") globalThis.cancelAnimationFrame(runtime.raf);
    else globalThis.clearTimeout(runtime.raf);
    runtime.raf = null;
  }

  function enable() {
    runtime.enabled = true;
    savePreference(true);
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    startLoop();
    applyFrame(true);
    return getStatus();
  }

  function disable() {
    runtime.enabled = false;
    savePreference(false);
    restoreLegacy(activeContext());
    applyFrame(true);
    return getStatus();
  }

  function toggle() {
    return runtime.enabled ? disable() : enable();
  }

  function getStatus() {
    const phase5 = adapter()?.getSnapshot?.() || null;
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.lastFixtureId,
      appliedFrames: runtime.appliedFrames,
      phase5,
      contract: {
        playerPositions: "V4",
        passingBall: "V4_OFFICIAL",
        firstTouch: "V4_OFFICIAL",
        interceptions: "V4_OFFICIAL",
        secondBalls: "V4_OFFICIAL",
        terminalActions: "V4_OFFICIAL",
        setPieces: "V4_OFFICIAL",
        aerialDuels: "V4_OFFICIAL",
        goalkeeperCrosses: "V4_OFFICIAL",
        shots: "V4_OFFICIAL",
        goalkeeper: "V4_OFFICIAL",
        score: "V4_OFFICIAL",
        passStatistics: "V4_OFFICIAL",
        persistence: "LEGACY_CAREER_PLUS_V4_OFFICIAL_MATCH_STATE"
      }
    };
  }

  function boot() {
    runtime.enabled = readPreference();
    ensureStyles();
    startObserver();
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    startLoop();
    applyFrame(true);
    console.info(`[Match Engine V4] Phase 5 set-piece visual authority ready · ${VERSION}`);
  }

  const API = Object.freeze({
    VERSION,
    enable,
    disable,
    toggle,
    applyFrame,
    getStatus,
    __diagnostics: { activeContext, toPercentPoint, safeIntent, intentLabel, applyTeam, applyBall, restoreLegacy }
  });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE5_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_LIVE = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();
