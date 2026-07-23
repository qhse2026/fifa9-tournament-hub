(() => {
  "use strict";

  const VERSION = "4.0.0-phase10.1";
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
    setPieceRisk: 52,
    pressingTrap: "auto",
    defensiveWidth: 50,
    offsideTrap: true,
    counterPressWindow: 5.5,
    boxDefence: "hybrid",
    tacklingRisk: 50
  });


  const PHYSICAL_STATUS = Object.freeze({
    FIT: "FIT",
    FATIGUED: "FATIGUED",
    KNOCK: "KNOCK",
    TIGHTNESS: "TIGHTNESS",
    CRAMP: "CRAMP",
    INJURED: "INJURED"
  });

  const PHYSICAL_LOAD = Object.freeze({
    RECOVERY: 0.18,
    WALK: 0.32,
    JOG: 0.62,
    RUN: 0.92,
    SPRINT: 1.28,
    PRESS: 1.18,
    DUEL: 1.12,
    EXPLOSIVE: 1.24
  });

  const REFEREE_PROFILES = Object.freeze({
    lenient: Object.freeze({ id:"lenient", strictness:34, yellowThreshold:70, redThreshold:95, advantagePreference:78, penaltySensitivity:42, dissentTolerance:82, timeWastingTolerance:76 }),
    balanced: Object.freeze({ id:"balanced", strictness:52, yellowThreshold:62, redThreshold:92, advantagePreference:64, penaltySensitivity:55, dissentTolerance:60, timeWastingTolerance:55 }),
    strict: Object.freeze({ id:"strict", strictness:72, yellowThreshold:54, redThreshold:88, advantagePreference:52, penaltySensitivity:68, dissentTolerance:42, timeWastingTolerance:34 }),
    disciplinarian: Object.freeze({ id:"disciplinarian", strictness:86, yellowThreshold:48, redThreshold:84, advantagePreference:44, penaltySensitivity:76, dissentTolerance:26, timeWastingTolerance:22 })
  });

  const REFEREE_DELAY_SECONDS = Object.freeze({
    GOAL:34, SUBSTITUTION:28, INJURY_SUBSTITUTION:34, MUSCLE_INJURY:42, CONTACT_INJURY:42,
    YELLOW_CARD:18, SECOND_YELLOW:24, RED_CARD:32, PENALTY_AWARDED:42, VAR_CHECK:48,
    CRAMP:20, KNOCK:12, MUSCLE_TIGHTNESS:16
  });

  const INTENSE_INTENTS = new Set([
    "PRESS_TRIGGER", "PRIMARY_PRESS", "SECONDARY_PRESS", "COUNTER_PRESS", "RUN_BEHIND",
    "BLIND_SIDE_RUN", "OVERLAP", "UNDERLAP", "BOX_RUN", "SHADOW_BOX_RUN", "POACH_BOX",
    "ATTACK_HEADER", "GOALKEEPER_FORWARD", "RECOVERY_RUN", "STOP_CROSS"
  ]);

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

  const ATTACKING_ROLE_PROFILES = Object.freeze({
    "fullback-defend": { width: 44, depth: 26, box: 8, link: 45, runBehind: 16, shoot: 8, cross: 42, carry: 30, creativePass: 28, roam: 12, holdUp: 18, aerial: 20 },
    "overlap": { width: 88, depth: 72, box: 20, link: 48, runBehind: 70, shoot: 16, cross: 78, carry: 58, creativePass: 36, roam: 38, holdUp: 16, aerial: 24 },
    "attacking-wingback": { width: 92, depth: 80, box: 28, link: 50, runBehind: 78, shoot: 22, cross: 84, carry: 66, creativePass: 40, roam: 54, holdUp: 14, aerial: 28 },
    "complete-wingback": { width: 78, depth: 82, box: 36, link: 70, runBehind: 74, shoot: 32, cross: 82, carry: 72, creativePass: 58, roam: 72, holdUp: 20, aerial: 32 },
    "inverted-fullback": { width: 30, depth: 54, box: 18, link: 78, runBehind: 28, shoot: 20, cross: 34, carry: 52, creativePass: 66, roam: 48, holdUp: 30, aerial: 22 },
    "cover": { width: 28, depth: 22, box: 8, link: 40, runBehind: 4, shoot: 5, cross: 4, carry: 18, creativePass: 26, roam: 8, holdUp: 20, aerial: 62 },
    "ball-playing-defender": { width: 34, depth: 40, box: 10, link: 72, runBehind: 8, shoot: 12, cross: 10, carry: 58, creativePass: 68, roam: 28, holdUp: 34, aerial: 58 },
    "anchor": { width: 28, depth: 34, box: 12, link: 62, runBehind: 8, shoot: 12, cross: 12, carry: 36, creativePass: 48, roam: 14, holdUp: 48, aerial: 44 },
    "half-back": { width: 32, depth: 28, box: 8, link: 66, runBehind: 6, shoot: 8, cross: 12, carry: 34, creativePass: 52, roam: 18, holdUp: 50, aerial: 48 },
    "deep-lying-playmaker": { width: 38, depth: 44, box: 14, link: 84, runBehind: 12, shoot: 22, cross: 28, carry: 44, creativePass: 82, roam: 36, holdUp: 42, aerial: 30 },
    "regista": { width: 46, depth: 54, box: 22, link: 88, runBehind: 24, shoot: 30, cross: 32, carry: 58, creativePass: 92, roam: 74, holdUp: 38, aerial: 24 },
    "box-to-box": { width: 50, depth: 68, box: 66, link: 62, runBehind: 54, shoot: 52, cross: 32, carry: 62, creativePass: 56, roam: 62, holdUp: 34, aerial: 42 },
    "mezzala": { width: 66, depth: 70, box: 62, link: 70, runBehind: 64, shoot: 48, cross: 48, carry: 68, creativePass: 76, roam: 78, holdUp: 28, aerial: 30 },
    "carrilero": { width: 62, depth: 52, box: 30, link: 72, runBehind: 34, shoot: 28, cross: 42, carry: 52, creativePass: 62, roam: 54, holdUp: 34, aerial: 30 },
    "advanced-playmaker": { width: 44, depth: 68, box: 44, link: 92, runBehind: 42, shoot: 46, cross: 48, carry: 64, creativePass: 96, roam: 66, holdUp: 34, aerial: 18 },
    "shadow-striker": { width: 38, depth: 84, box: 88, link: 54, runBehind: 82, shoot: 84, cross: 18, carry: 66, creativePass: 48, roam: 58, holdUp: 22, aerial: 34 },
    "enganche": { width: 34, depth: 58, box: 34, link: 94, runBehind: 18, shoot: 44, cross: 36, carry: 42, creativePass: 98, roam: 18, holdUp: 46, aerial: 16 },
    "winger": { width: 96, depth: 76, box: 42, link: 52, runBehind: 72, shoot: 40, cross: 92, carry: 78, creativePass: 58, roam: 42, holdUp: 18, aerial: 20 },
    "inverted-winger": { width: 54, depth: 78, box: 70, link: 66, runBehind: 74, shoot: 70, cross: 54, carry: 82, creativePass: 70, roam: 68, holdUp: 20, aerial: 26 },
    "inside-forward": { width: 38, depth: 86, box: 86, link: 54, runBehind: 88, shoot: 86, cross: 32, carry: 80, creativePass: 58, roam: 62, holdUp: 18, aerial: 34 },
    "wide-playmaker": { width: 62, depth: 62, box: 38, link: 88, runBehind: 42, shoot: 46, cross: 68, carry: 66, creativePass: 92, roam: 64, holdUp: 30, aerial: 18 },
    "poacher": { width: 20, depth: 94, box: 98, link: 20, runBehind: 92, shoot: 98, cross: 4, carry: 42, creativePass: 18, roam: 28, holdUp: 20, aerial: 44 },
    "advanced-forward": { width: 42, depth: 92, box: 92, link: 42, runBehind: 96, shoot: 90, cross: 16, carry: 72, creativePass: 38, roam: 58, holdUp: 32, aerial: 46 },
    "complete-forward": { width: 48, depth: 84, box: 88, link: 78, runBehind: 82, shoot: 88, cross: 26, carry: 76, creativePass: 72, roam: 72, holdUp: 74, aerial: 68 },
    "target-forward": { width: 28, depth: 72, box: 88, link: 66, runBehind: 42, shoot: 72, cross: 8, carry: 32, creativePass: 42, roam: 20, holdUp: 98, aerial: 96 },
    "false-nine": { width: 40, depth: 48, box: 46, link: 98, runBehind: 24, shoot: 64, cross: 20, carry: 68, creativePass: 92, roam: 84, holdUp: 68, aerial: 28 },
    "pressing-forward": { width: 42, depth: 80, box: 78, link: 58, runBehind: 72, shoot: 76, cross: 14, carry: 58, creativePass: 44, roam: 58, holdUp: 62, aerial: 58 }
  });

  const GOALKEEPER_ARCHETYPES = Object.freeze({
    "line-keeper": { start: 10, sweep: 25, cross: 45, handling: 84, reflex: 88, distribution: 52, eccentricity: 15 },
    "sweeper-keeper": { start: 18, sweep: 86, cross: 62, handling: 78, reflex: 82, distribution: 82, eccentricity: 28 },
    "cross-commander": { start: 12, sweep: 44, cross: 90, handling: 86, reflex: 81, distribution: 58, eccentricity: 18 },
    "playmaker-keeper": { start: 16, sweep: 70, cross: 58, handling: 77, reflex: 80, distribution: 91, eccentricity: 31 },
    "eccentric-keeper": { start: 19, sweep: 78, cross: 70, handling: 72, reflex: 85, distribution: 74, eccentricity: 86 }
  });

  const MANAGER_PLANS = Object.freeze({
    BALANCED: { mentality:"balanced", tempo:50, risk:50, passingDirectness:50, pressing:50, defensiveLine:52, width:52, fullbackDuty:"balanced", outPossession:"mid-block", winTransition:"secure", lossTransition:"regroup", timeWasting:0 },
    CONTROL: { mentality:"controlled", tempo:40, risk:36, passingDirectness:42, pressing:45, defensiveLine:47, width:50, fullbackDuty:"balanced", outPossession:"mid-block", winTransition:"secure", lossTransition:"regroup", timeWasting:28 },
    PROTECT_LEAD: { mentality:"protect", tempo:32, risk:28, passingDirectness:40, pressing:38, defensiveLine:39, width:45, fullbackDuty:"defend", outPossession:"low-block", winTransition:"secure", lossTransition:"regroup", timeWasting:68 },
    HIGH_PRESS: { mentality:"aggressive", tempo:70, risk:62, passingDirectness:55, pressing:82, defensiveLine:72, width:54, fullbackDuty:"balanced", outPossession:"high-press", winTransition:"counter", lossTransition:"counter-press", timeWasting:0 },
    WIDE_ATTACK: { mentality:"attacking", tempo:66, risk:66, passingDirectness:56, pressing:62, defensiveLine:58, width:76, fullbackDuty:"attack", outPossession:"mid-block", winTransition:"counter", lossTransition:"counter-press", timeWasting:0 },
    DIRECT_ATTACK: { mentality:"attacking", tempo:72, risk:72, passingDirectness:80, pressing:70, defensiveLine:64, width:58, fullbackDuty:"attack", outPossession:"high-press", winTransition:"counter", lossTransition:"counter-press", timeWasting:0 },
    ALL_OUT: { mentality:"all-out", tempo:82, risk:88, passingDirectness:84, pressing:88, defensiveLine:78, width:70, fullbackDuty:"attack", outPossession:"high-press", winTransition:"counter", lossTransition:"counter-press", timeWasting:0 }
  });

  const MANAGER_REVIEW_MINUTES = Object.freeze([15, 30, 45, 55, 62, 70, 76, 82, 86, 89]);


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

  function normalizeAttackingRole(role, group) {
    const raw = String(role || "").toLowerCase().trim().replace(/_/g, "-").replace(/\s+/g, "-");
    const aliases = {
      "wing-back-attack": "attacking-wingback", "wingback": "attacking-wingback", "complete-wing-back": "complete-wingback",
      "inverted-wing-back": "inverted-fullback", "fullback-defend": "fullback-defend", "stay-back": "fullback-defend",
      "ball-playing-centre-back": "ball-playing-defender", "bpd": "ball-playing-defender", "no-nonsense": "cover",
      "dlp": "deep-lying-playmaker", "deep-lying-playmaker-support": "deep-lying-playmaker", "halfback": "half-back",
      "b2b": "box-to-box", "box-to-box-midfielder": "box-to-box", "ap": "advanced-playmaker", "playmaker": "advanced-playmaker",
      "inside-forward-attack": "inside-forward", "inverted-winger-attack": "inverted-winger", "wide-midfielder": "winger",
      "advanced-striker": "advanced-forward", "target-man": "target-forward", "target-man-support": "target-forward",
      "false-9": "false-nine", "complete-striker": "complete-forward", "pressing-striker": "pressing-forward"
    };
    const normalized = aliases[raw] || raw;
    if (ATTACKING_ROLE_PROFILES[normalized]) return normalized;
    return ({ GK: "line-keeper", FB: "overlap", WB: "attacking-wingback", CB: "cover", DM: "anchor", CM: "box-to-box", AM: "advanced-playmaker", WING: "winger", ST: "advanced-forward" })[group] || "box-to-box";
  }

  function attackingProfile(role, group) {
    const normalizedRole = normalizeAttackingRole(role, group);
    return { role: normalizedRole, ...(ATTACKING_ROLE_PROFILES[normalizedRole] || ATTACKING_ROLE_PROFILES["box-to-box"]) };
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
      selfishness: clamp(base.goalHunger * 0.48 + base.risk * 0.22 + rng.int(-12, 16), 8, 94),
      roaming: clamp(42 + rng.int(-18, 22), 8, 94),
      oneTouchBias: clamp(48 + rng.int(-18, 18), 8, 92),
      killerBallBias: clamp(44 + rng.int(-18, 24), 8, 96),
      ...overrides
    };
  }



  function createPhysicalProfile(group, attributes, supplied = {}, rng = null) {
    const source = supplied?.physical || supplied || {};
    const naturalFitness = clamp(Number(
      source.naturalFitness ?? source.natural_fitness ??
      (attributes.stamina * .58 + attributes.workRate * .24 + attributes.strength * .08 + 9)
    ), 35, 96);
    const condition = clamp(Number(source.condition ?? source.matchCondition ?? source.fitness ?? 100), 60, 100);
    const injuryProneness = clamp(Number(
      source.injuryProneness ?? source.injury_proneness ??
      (48 + (78 - naturalFitness) * .42 + (rng ? rng.int(-8, 8) : 0))
    ), 8, 95);
    const recovery = clamp(naturalFitness * .62 + attributes.stamina * .28 + 10, 35, 98);
    return {
      condition,
      shortEnergy: condition,
      accumulatedFatigue: clamp((100 - condition) * .20, 0, 32),
      acuteLoad: 0,
      matchLoad: 0,
      totalDistance: 0,
      sprintDistance: 0,
      highIntensityRuns: 0,
      lastHighIntensity: false,
      highIntensityCooldown: 0,
      contactLoad: 0,
      explosiveLoad: 0,
      naturalFitness,
      recovery,
      injuryProneness,
      status: PHYSICAL_STATUS.FIT,
      severity: 0,
      discomfort: 0,
      availability: "AVAILABLE",
      injuryType: null,
      injurySource: null,
      warningLevel: 0,
      lastRiskCheckAt: -999,
      lastIncidentAt: -999,
      recoverySeconds: 0,
      limitedSince: null,
      performanceModifier: 1
    };
  }

  function physicalStatusPenalty(player) {
    const status = player?.physical?.status || PHYSICAL_STATUS.FIT;
    return ({
      FIT: 0,
      FATIGUED: .035,
      KNOCK: .06,
      TIGHTNESS: .11,
      CRAMP: .18,
      INJURED: .34
    })[status] || 0;
  }

  function physicalPerformanceModifier(player, domain = "general") {
    const physical = player?.physical;
    if (!physical) return 1;
    const energy = clamp(Number(physical.shortEnergy ?? player.energy ?? 100), 20, 100);
    const fatigue = clamp(Number(physical.accumulatedFatigue ?? player.fatigue ?? 0), 0, 100);
    const energyPenalty = Math.max(0, 72 - energy) / 210;
    const fatiguePenalty = fatigue / 360;
    const conditionPenalty = Math.max(0, 88 - Number(physical.condition || 100)) / 250;
    const statusPenalty = physicalStatusPenalty(player);
    const domainWeight = domain === "physical" ? 1.25 : domain === "mental" ? .72 : domain === "technical" ? .82 : 1;
    return clamp(1 - (energyPenalty + fatiguePenalty + conditionPenalty + statusPenalty) * domainWeight, .52, 1.03);
  }

  function effectiveAttribute(player, key, domain = "general") {
    const base = Number(player?.attributes?.[key] || 50);
    return clamp(base * physicalPerformanceModifier(player, domain), 18, 99);
  }

  function syncPhysicalLegacy(player) {
    if (!player?.physical) return;
    player.energy = clamp(player.physical.shortEnergy, 20, 100);
    player.fatigue = clamp(player.physical.accumulatedFatigue, 0, 100);
    player.physical.performanceModifier = physicalPerformanceModifier(player);
  }

  function registerExplosiveLoad(player, amount = 1) {
    if (!player?.physical) return;
    player.physical.explosiveLoad += Math.max(0, Number(amount || 0));
    player.physical.acuteLoad += Math.max(0, Number(amount || 0)) * .65;
    player.physical.shortEnergy = clamp(player.physical.shortEnergy - Math.max(0, Number(amount || 0)) * .34, 20, 100);
    syncPhysicalLegacy(player);
  }

  function applyPhysicalIncident(engine, player, status, source, options = {}) {
    if (!engine || !player?.physical) return null;
    const p = player.physical;
    if (p.status === PHYSICAL_STATUS.INJURED && status !== PHYSICAL_STATUS.INJURED) return null;
    if (engine.clockSeconds - p.lastIncidentAt < 120 && status !== PHYSICAL_STATUS.INJURED) return null;
    const team = teamBySide(engine, player.side);
    const severity = clamp(Number(options.severity ?? (
      status === PHYSICAL_STATUS.INJURED ? 72 :
      status === PHYSICAL_STATUS.CRAMP ? 42 :
      status === PHYSICAL_STATUS.TIGHTNESS ? 32 : 18
    )), 5, 100);
    p.status = status;
    p.severity = Math.max(p.severity, severity);
    p.discomfort = Math.max(p.discomfort, severity);
    p.injuryType = options.injuryType || (
      status === PHYSICAL_STATUS.CRAMP ? "CRAMP" :
      status === PHYSICAL_STATUS.TIGHTNESS ? "MUSCLE_TIGHTNESS" :
      status === PHYSICAL_STATUS.INJURED ? "MATCH_INJURY" : "MINOR_KNOCK"
    );
    p.injurySource = source;
    p.lastIncidentAt = engine.clockSeconds;
    p.limitedSince = p.limitedSince ?? engine.clockSeconds;
    p.availability = status === PHYSICAL_STATUS.INJURED ? "REMOVE" : status === PHYSICAL_STATUS.CRAMP || status === PHYSICAL_STATUS.TIGHTNESS ? "LIMITED" : "AVAILABLE";
    if (status === PHYSICAL_STATUS.KNOCK) team.stats.knocks += 1;
    if (status === PHYSICAL_STATUS.CRAMP) team.stats.cramps += 1;
    if (status === PHYSICAL_STATUS.TIGHTNESS) team.stats.muscleTightness += 1;
    if (status === PHYSICAL_STATUS.INJURED) {
      team.stats.playersInjured += 1;
      if (String(source).includes("CONTACT")) team.stats.contactInjuries += 1;
      else team.stats.muscleInjuries += 1;
    }
    const eventType = status === PHYSICAL_STATUS.INJURED
      ? (String(source).includes("CONTACT") ? "CONTACT_INJURY" : "MUSCLE_INJURY")
      : status === PHYSICAL_STATUS.CRAMP ? "CRAMP"
      : status === PHYSICAL_STATUS.TIGHTNESS ? "MUSCLE_TIGHTNESS" : "KNOCK";
    emit(engine, eventType, {
      side: player.side,
      playerId: player.id,
      source,
      injuryType: p.injuryType,
      severity: Math.round(severity),
      energy: Math.round(p.shortEnergy),
      fatigue: Math.round(p.accumulatedFatigue)
    });
    syncPhysicalLegacy(player);
    return { playerId: player.id, status, severity, source };
  }

  function maybeContactIncident(engine, player, source = "CONTACT_DUEL", intensity = .5) {
    if (!player?.physical || player.physical.status === PHYSICAL_STATUS.INJURED) return null;
    const p = player.physical;
    p.contactLoad += Math.max(0, intensity);
    const chance = clamp(
      .00075 * Math.max(.2, intensity) *
      (p.injuryProneness / 50) *
      (1 + p.accumulatedFatigue / 90) *
      (1 + Math.max(0, 58 - p.shortEnergy) / 65),
      .0001, .012
    );
    if (!engine.rng.chance(chance)) return null;
    const serious = engine.rng.chance(clamp(.10 + intensity * .10 + p.injuryProneness / 520, .10, .34));
    return applyPhysicalIncident(
      engine,
      player,
      serious ? PHYSICAL_STATUS.INJURED : PHYSICAL_STATUS.KNOCK,
      `${source}_CONTACT`,
      { severity: serious ? engine.rng.range(58, 84) : engine.rng.range(12, 28), injuryType: serious ? "CONTACT_INJURY" : "IMPACT_KNOCK" }
    );
  }

  function updatePhysicalPlayer(engine, player, dt, actualSpeed, maxSpeed) {
    if (!player?.physical) return;
    const p = player.physical;
    const team = teamBySide(engine, player.side);
    const speedRatio = clamp(actualSpeed / Math.max(.25, maxSpeed), 0, 1.4);
    const intenseIntent = INTENSE_INTENTS.has(player.currentIntent);
    const tacticalPress = team.tactics.outPossession === "high-press" ? 1.12 : team.tactics.outPossession === "low-block" ? .92 : 1;
    const intentLoad = intenseIntent ? 1.18 : 1;
    const load = clamp((.22 + speedRatio * .78) * tacticalPress * intentLoad, .12, 1.55);
    const distanceMetres = actualSpeed * dt * 1.05;
    p.totalDistance += distanceMetres;
    team.stats.totalDistance += distanceMetres;
    const qualifiesSprint = speedRatio >= .94 && intenseIntent;
    if (qualifiesSprint) {
      const sprintMetres = distanceMetres * .42;
      p.sprintDistance += sprintMetres;
      team.stats.sprintDistance += sprintMetres;
    }
    const isHigh = qualifiesSprint || (speedRatio >= .97 && intenseIntent);
    p.highIntensityCooldown = Math.max(0, p.highIntensityCooldown - dt);
    if (isHigh && !p.lastHighIntensity && p.highIntensityCooldown <= 0) {
      p.highIntensityRuns += 1;
      team.stats.highIntensityRuns += 1;
      p.highIntensityCooldown = 28;
    }
    p.lastHighIntensity = isHigh;
    const staminaEfficiency = clamp((effectiveAttribute(player, "stamina", "physical") + p.naturalFitness) / 175, .48, 1.08);
    const drain = dt * (.0036 + Math.pow(speedRatio, 1.75) * .0260) * load / staminaEfficiency;
    const recoveryRate = speedRatio < .22 && !intenseIntent
      ? dt * (.00135 + p.recovery / 52000)
      : speedRatio < .40 ? dt * .00042 : 0;
    p.shortEnergy = clamp(p.shortEnergy - drain + recoveryRate, 20, p.condition);
    if (recoveryRate > 0) {
      p.recoverySeconds += dt;
      team.stats.recoverySeconds += dt;
    }
    const accumulation = dt * (.0036 + Math.pow(speedRatio, 1.55) * .0145) * load * (1.13 - p.naturalFitness / 280);
    p.accumulatedFatigue = clamp(p.accumulatedFatigue + accumulation, 0, 100);
    p.acuteLoad = clamp(p.acuteLoad * Math.pow(.99935, dt) + load * dt * .11, 0, 100);
    p.matchLoad += load * dt;
    team.stats.physicalLoad += load * dt;
    if (p.status === PHYSICAL_STATUS.KNOCK && p.discomfort > 0 && speedRatio < .45) {
      p.discomfort = Math.max(0, p.discomfort - dt * .010);
      if (p.discomfort <= 5) {
        p.status = p.shortEnergy < 60 ? PHYSICAL_STATUS.FATIGUED : PHYSICAL_STATUS.FIT;
        p.severity = 0;
        p.injuryType = null;
        p.injurySource = null;
        p.availability = "AVAILABLE";
        emit(engine, "PLAYER_RECOVERED", { side: player.side, playerId: player.id, source: "KNOCK_RECOVERY" });
      }
    }
    const warning = p.shortEnergy < 42 || p.accumulatedFatigue > 36 ? 2 : p.shortEnergy < 58 || p.accumulatedFatigue > 25 ? 1 : 0;
    if (warning > p.warningLevel) {
      p.warningLevel = warning;
      team.stats.fatigueWarnings += 1;
      emit(engine, "FATIGUE_WARNING", {
        side: player.side, playerId: player.id, level: warning,
        energy: Math.round(p.shortEnergy), fatigue: Math.round(p.accumulatedFatigue)
      });
    }
    if ([PHYSICAL_STATUS.FIT, PHYSICAL_STATUS.FATIGUED].includes(p.status)) {
      p.status = warning >= 2 ? PHYSICAL_STATUS.FATIGUED : PHYSICAL_STATUS.FIT;
    }
    if (engine.clockSeconds - p.lastRiskCheckAt >= 1) {
      p.lastRiskCheckAt = engine.clockSeconds;
      const minute = engine.clockSeconds / 60;
      const lateFactor = 1 + Math.max(0, minute - 62) / 65;
      const muscleChance = clamp(
        .0000018 * lateFactor *
        (p.injuryProneness / 48) *
        (1 + p.accumulatedFatigue / 42) *
        (1 + Math.max(0, 55 - p.shortEnergy) / 42) *
        (isHigh ? 2.8 : .42),
        .0000001, .00011
      );
      if (engine.rng.chance(muscleChance)) {
        const serious = engine.rng.chance(clamp(.18 + p.accumulatedFatigue / 210 + p.injuryProneness / 520, .16, .42));
        applyPhysicalIncident(
          engine,
          player,
          serious ? PHYSICAL_STATUS.INJURED : PHYSICAL_STATUS.TIGHTNESS,
          "NON_CONTACT_MUSCLE_LOAD",
          { severity: serious ? engine.rng.range(58, 82) : engine.rng.range(24, 40), injuryType: serious ? "MUSCLE_INJURY" : "MUSCLE_TIGHTNESS" }
        );
      } else if (minute >= 72 && p.shortEnergy < 38 && p.status !== PHYSICAL_STATUS.CRAMP) {
        const crampChance = clamp(.000040 * (1 + (38 - p.shortEnergy) / 15) * (1 + p.accumulatedFatigue / 60), .000012, .00012);
        if (engine.rng.chance(crampChance)) {
          applyPhysicalIncident(engine, player, PHYSICAL_STATUS.CRAMP, "LATE_MATCH_FATIGUE", { severity: engine.rng.range(34, 50), injuryType: "CRAMP" });
        }
      }
    }
    if (p.status === PHYSICAL_STATUS.CRAMP) p.shortEnergy = Math.min(p.shortEnergy, 42);
    if (p.status === PHYSICAL_STATUS.INJURED) p.shortEnergy = Math.min(p.shortEnergy, 28);
    syncPhysicalLegacy(player);
  }

  function physicalTeamSummary(team) {
    const players = team.players || [];
    const total = Math.max(1, players.length);
    return {
      averageEnergy: Math.round(players.reduce((sum, p) => sum + Number(p.physical?.shortEnergy ?? p.energy ?? 100), 0) / total * 10) / 10,
      averageFatigue: Math.round(players.reduce((sum, p) => sum + Number(p.physical?.accumulatedFatigue ?? p.fatigue ?? 0), 0) / total * 10) / 10,
      limitedPlayers: players.filter(p => ["LIMITED", "REMOVE"].includes(p.physical?.availability)).length,
      injuredPlayers: players.filter(p => p.physical?.status === PHYSICAL_STATUS.INJURED).length,
      totalDistance: Math.round(players.reduce((sum, p) => sum + Number(p.physical?.totalDistance || 0), 0)),
      sprintDistance: Math.round(players.reduce((sum, p) => sum + Number(p.physical?.sprintDistance || 0), 0)),
      highIntensityRuns: players.reduce((sum, p) => sum + Number(p.physical?.highIntensityRuns || 0), 0)
    };
  }


  function createBench(config, side, rating, rng) {
  const supplied = Array.isArray(config.players) ? config.players.slice(11, 18) : [];
  const templates = ["GK","CB","FB","DM","CM","WING","ST"];
  return templates.map((group, index) => {
    const row = supplied[index] || {};
    const base = clamp(rating + rng.int(-6, 4), 55, 94);
    const position = row.position || ({GK:"GK",CB:"CB",FB:"RB",DM:"DM",CM:"CM",WING:"RW",ST:"ST"}[group]);
    const attributes = { ...normalizedAttributes(base, positionalAdjustments(group)), ...(row.attributes || {}) };
    const physical = createPhysicalProfile(group, attributes, row, rng);
    return {
      id: row.id || `${side}-bench-${index+1}`,
      name: row.name || `${config.name || side} SUB ${index+1}`,
      number: row.number || 12 + index,
      group,
      position,
      role: row.role || defaultRoleFor(position),
      attributes,
      behaviour: createBehaviour(group, rng, row.behaviour),
      physical,
      energy: physical.shortEnergy,
      fatigue: physical.accumulatedFatigue,
      yellow: false,
      yellowCards: 0,
      redCard: false,
      sentOff: false,
      foulsCommitted: 0,
      foulsSuffered: 0,
      used: false
    };
  });
}
  function createManagerState(team) {
    return {
      side: team.side,
      control: String(team.managerControl || "AI").toUpperCase(),
      profile: team.managerProfile || "adaptive",
      currentPlan: "BALANCED",
      previousPlan: null,
      lastDecision: "MATCH_START",
      lastReason: "INITIAL_PLAN",
      lastReviewAt: -999,
      nextReviewAt: 15 * 60,
      substitutionsUsed: 0,
      substitutionWindows: 0,
      lastSubstitutionAt: -999,
      recommendations: [],
      decisionHistory: [],
      emergencyMode: false,
      goalkeeperForward: false,
      timeWasting: 0,
      reviewIndex: 0
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
    const mergedAttributes = { ...attributes, ...(supplied?.attributes || {}) };
    const physical = createPhysicalProfile(group, mergedAttributes, supplied || {}, rng);
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
      physical,
      energy: physical.shortEnergy,
      fatigue: physical.accumulatedFatigue,
      yellow: false,
      yellowCards: 0,
      redCard: false,
      sentOff: false,
      foulsCommitted: 0,
      foulsSuffered: 0,
      attributes: mergedAttributes,
      behaviour: createBehaviour(group, rng, supplied?.behaviour),
      goalkeeper: group === "GK" ? { ...(GOALKEEPER_ARCHETYPES[goalkeeperArchetype] || GOALKEEPER_ARCHETYPES["line-keeper"]), archetype: goalkeeperArchetype } : null
    };
  });
  players.forEach(player => {
    player.attackProfile = attackingProfile(player.role, player.group);
    player.identity = {
      role: player.attackProfile.role,
      goalHunger: player.behaviour.goalHunger,
      selfishness: player.behaviour.selfishness,
      creativity: player.behaviour.creativity,
      roaming: clamp((player.behaviour.roaming + player.attackProfile.roam) / 2, 0, 100),
      linkPlay: player.attackProfile.link,
      runBehind: player.attackProfile.runBehind,
      boxThreat: player.attackProfile.box
    };
    player.lastAttackIntent = null;
    player.lastAttackIntentAt = -999;
  });
  const defensiveLeader = players.filter(player => ["CB", "DM", "FB", "WB"].includes(player.group))
    .sort((a, b) => (b.attributes.positioning + b.attributes.concentration + b.attributes.decisions + b.attributes.teamwork) - (a.attributes.positioning + a.attributes.concentration + a.attributes.decisions + a.attributes.teamwork))[0];
  return {
    id: config.id || side,
    name: config.name || (side === "home" ? "Home" : "Away"),
    side,
    direction,
    formation,
    rating,
    tactics: { ...DEFAULT_TACTICS, ...(config.tactics || {}) },
    baseTactics: { ...DEFAULT_TACTICS, ...(config.tactics || {}) },
    managerControl: config.managerControl || "AI",
    managerProfile: config.managerProfile || "adaptive",
    players,
    bench: createBench(config, side, rating, rng),
    score: 0,
    stats: createStats(),
    possessionSeconds: 0,
    phase: "BUILD_UP",
    emergencyTargetId: null,
    defensiveLeaderId: defensiveLeader?.id || null,
    defensiveContext: null,
    dismissedPlayers: []
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
    foulsCommitted: 0, foulsSuffered: 0, yellowCards: 0, redCards: 0, secondYellowCards: 0,
    tacticalFouls: 0, dangerousFouls: 0, penaltiesConceded: 0,
    advantagesPlayed: 0, advantagesRealized: 0, advantagesRecalled: 0,
    refereeWarnings: 0, dissentCards: 0, addedTimeSeconds: 0,
    tacklesAttempted: 0, tacklesWon: 0, interceptions: 0,
    pressures: 0, successfulPressures: 0, pressureRegains: 0, forcedTurnovers: 0, forcedErrors: 0,
    doubleTeams: 0, passingLanesBlocked: 0, counterPressRegains: 0, transitionDelays: 0,
    offsideTraps: 0, offsidesWon: 0, cutbacksDefended: 0, boxEntriesDenied: 0, defensiveLineBreaks: 0,
    recoveries: 0, turnovers: 0, badTouches: 0,
    looseBalls: 0, looseBallsWon: 0, secondBallsWon: 0,
    entriesFinalThird: 0, entriesBox: 0, offsides: 0,
    attackingRuns: 0, blindSideRuns: 0, overlaps: 0, underlaps: 0, halfSpaceRuns: 0, widthRuns: 0,
    boxRuns: 0, falseNineDrops: 0, linkPlayActions: 0, targetManActions: 0, defenderCarries: 0,
    creativePasses: 0, killerPassesAttempted: 0, progressiveCarries: 0, decoyRuns: 0, roleShots: 0,
    managerReviews: 0, tacticalChanges: 0, mentalityChanges: 0, substitutions: 0, substitutionWindows: 0,
    fatigueSubstitutions: 0, cardRiskSubstitutions: 0, tacticalSubstitutions: 0, emergencyMoves: 0,
    timeWastingSeconds: 0, aiRecommendations: 0,
    totalDistance: 0, sprintDistance: 0, highIntensityRuns: 0, physicalLoad: 0, recoverySeconds: 0,
    fatigueWarnings: 0, cramps: 0, knocks: 0, muscleTightness: 0, muscleInjuries: 0, contactInjuries: 0,
    injurySubstitutions: 0, playersInjured: 0, conditionDrops: 0,
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
    registerRefereeDelay(engine, type, payload);
    if (engine.events.length > 500) engine.events.splice(0, engine.events.length - 500);
    engine.listeners.forEach(listener => {
      try { listener(event); } catch (error) { console.warn("V4 event listener failed", error); }
    });
    return event;
  }

  function nearestPlayers(players, point, limit = 3, predicate = () => true) {
    return players.filter(predicate).map(player => ({ player, d: distance(player.positionNow, point) })).sort((a, b) => a.d - b.d).slice(0, limit);
  }

  function basePressureAt(engine, player) {
    const opponents = opponentTeam(engine, player.side).players;
    const nearest = nearestPlayers(opponents, player.positionNow, 3);
    return clamp(nearest.reduce((sum, row) => sum + Math.max(0, 12 - row.d) * 4.5, 0), 0, 100);
  }

  function pressureAt(engine, player) {
    let pressure = basePressureAt(engine, player);
    const defendingSide = opponentSide(player.side);
    const context = engine.defensiveContexts?.[defendingSide];
    if (context?.active && context.ownerId === player.id) {
      pressure += context.triggerScore * 0.04;
      if (context.primaryPresserId) pressure += 5;
      if (context.secondaryPresserId) pressure += 3;
      if (context.trap === "TOUCHLINE") pressure += 2;
    }
    return clamp(pressure, 0, 100);
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


  const ATTACKING_INTENTS = Object.freeze(["BLIND_SIDE_RUN", "RUN_BEHIND", "POACH_BOX", "FALSE_NINE_DROP", "TARGET_HOLD_UP", "OVERLAP", "UNDERLAP", "INVERT_SUPPORT", "MEZZALA_HALF_SPACE", "LATE_BOX_RUN", "SHADOW_BOX_RUN", "HOLD_WIDTH", "INSIDE_FORWARD_RUN", "WIDE_PLAYMAKER_LINK", "DEFENDER_CARRY", "REGISTA_ROAM", "PLAYMAKER_BETWEEN_LINES", "DECOY_RUN"]);
  const RUN_EPISODE_INTENTS = Object.freeze(["BLIND_SIDE_RUN", "RUN_BEHIND", "POACH_BOX", "OVERLAP", "UNDERLAP", "MEZZALA_HALF_SPACE", "LATE_BOX_RUN", "SHADOW_BOX_RUN", "INSIDE_FORWARD_RUN", "DECOY_RUN"]);

  function setAttackingIntent(engine, player, intent, meta = {}) {
    player.currentIntent = intent;
    const elapsed = engine.clockSeconds - Number(player.lastAttackIntentAt || -999);
    const changed = player.lastAttackIntent !== intent;
    if (!changed || elapsed < 12) return;
    player.lastAttackIntentAt = engine.clockSeconds;
    player.lastAttackIntent = intent;
    const team = teamBySide(engine, player.side);
    if (RUN_EPISODE_INTENTS.includes(intent)) team.stats.attackingRuns += 1;
    const statByIntent = {
      BLIND_SIDE_RUN: "blindSideRuns", OVERLAP: "overlaps", UNDERLAP: "underlaps", INVERT_SUPPORT: "underlaps",
      MEZZALA_HALF_SPACE: "halfSpaceRuns", HOLD_WIDTH: "widthRuns", POACH_BOX: "boxRuns", LATE_BOX_RUN: "boxRuns",
      SHADOW_BOX_RUN: "boxRuns", INSIDE_FORWARD_RUN: "boxRuns", FALSE_NINE_DROP: "falseNineDrops",
      TARGET_HOLD_UP: "targetManActions", DEFENDER_CARRY: "defenderCarries", WIDE_PLAYMAKER_LINK: "linkPlayActions",
      PLAYMAKER_BETWEEN_LINES: "linkPlayActions", REGISTA_ROAM: "linkPlayActions", DECOY_RUN: "decoyRuns"
    };
    const stat = statByIntent[intent];
    if (stat) team.stats[stat] = Number(team.stats[stat] || 0) + 1;
    emit(engine, "ATTACKING_ROLE_RUN", { side: player.side, playerId: player.id, role: player.attackProfile?.role, intent, ...meta });
  }

  function boxSlotPoint(team, slot, ball) {
    const goal = attackGoalX(team);
    const nearY = ball.y < 34 ? 30.8 : 37.2;
    const farY = ball.y < 34 ? 38.1 : 29.9;
    if (slot === "NEAR_POST") return { x: goal - team.direction * 8.4, y: nearY };
    if (slot === "FAR_POST") return { x: goal - team.direction * 9.2, y: farY };
    if (slot === "PENALTY_SPOT") return { x: goal - team.direction * 11.2, y: 34 };
    if (slot === "EDGE") return { x: goal - team.direction * 18.2, y: 34 + (ball.y < 34 ? 4 : -4) };
    return { x: goal - team.direction * 15, y: 34 };
  }

  function blindSideScore(engine, team, player) {
    const defenders = opponentTeam(engine, team.side).players.filter(row => row.group === "CB");
    const nearest = nearestPlayers(defenders, player.positionNow, 1)[0];
    const profile = player.attackProfile || attackingProfile(player.role, player.group);
    const lineSpace = Math.abs(attackGoalX(team) - player.positionNow.x);
    const blindAngle = nearest ? Math.abs(nearest.player.positionNow.y - player.positionNow.y) * 2.2 : 18;
    return clamp(profile.runBehind * .38 + player.attributes.offBall * .24 + player.attributes.anticipation * .19 + player.attributes.acceleration * .13 + blindAngle - lineSpace * .08, 0, 100);
  }

  function buildAttackingContext(engine, side) {
    const team = teamBySide(engine, side);
    const owner = engine.ball.ownerId ? getPlayer(engine, engine.ball.ownerId) : null;
    if (!owner || owner.side !== side || engine.restart || engine.activeSetPieceAction) return { active: false, side, phase: team.phase, assignments: {}, relationships: {}, generatedAt: engine.clockSeconds };
    const phase = determinePhase(engine, team);
    const ball = engine.ball.position;
    const candidates = team.players.filter(player => player.id !== owner.id && player.group !== "GK");
    const ranked = candidates.map(player => {
      const profile = player.attackProfile || attackingProfile(player.role, player.group);
      const progress = progressFor(team, player.positionNow.x);
      const score = profile.box * .34 + profile.runBehind * .20 + player.attributes.offBall * .20 + player.attributes.anticipation * .12 + player.behaviour.goalHunger * .10 + Math.max(0, progress - 62) * .18;
      return { player, profile, score, blind: blindSideScore(engine, team, player) };
    }).sort((a,b)=>b.score-a.score);
    const assignments = {};
    const used = new Set();
    function assign(slot, predicate = () => true) {
      const row = ranked.find(item => !used.has(item.player.id) && predicate(item));
      if (!row) return null;
      used.add(row.player.id); assignments[row.player.id] = slot; return row.player.id;
    }
    if (["FINAL_THIRD", "CHANCE_CREATION"].includes(phase)) {
      assign("NEAR_POST", item => ["ST", "AM", "WING"].includes(item.player.group));
      assign("FAR_POST", item => ["WING", "ST", "AM"].includes(item.player.group));
      assign("PENALTY_SPOT", item => ["AM", "CM", "ST"].includes(item.player.group));
      assign("EDGE", item => ["CM", "DM", "AM"].includes(item.player.group));
    }
    const blindSide = ranked.filter(item => ["ST", "WING", "AM"].includes(item.player.group)).sort((a,b)=>b.blind-a.blind)[0]?.player || null;
    const linkPlayer = ranked.filter(item => item.profile.link >= 70).sort((a,b)=>(b.profile.link+b.player.attributes.vision)-(a.profile.link+a.player.attributes.vision))[0]?.player || null;
    const widthHolder = ranked.filter(item => item.profile.width >= 72).sort((a,b)=>b.profile.width-a.profile.width)[0]?.player || null;
    const relationships = {};
    team.players.filter(player => ["FB","WB"].includes(player.group)).forEach(back => {
      const sameSideWing = team.players.filter(player => player.group === "WING" && Math.sign(player.anchor.y-34) === Math.sign(back.anchor.y-34)).sort((a,b)=>Math.abs(a.positionNow.y-back.positionNow.y)-Math.abs(b.positionNow.y-back.positionNow.y))[0];
      if (!sameSideWing) return;
      const wingProfile = sameSideWing.attackProfile || attackingProfile(sameSideWing.role, sameSideWing.group);
      relationships[back.id] = { wingerId: sameSideWing.id, wingerRole: wingProfile.role, mode: wingProfile.width <= 58 ? "OVERLAP" : back.attackProfile?.role === "inverted-fullback" ? "INVERT" : "UNDERLAP" };
    });
    return { active: true, side, phase, ownerId: owner.id, assignments, blindSideRunnerId: blindSide?.id || null, linkPlayerId: linkPlayer?.id || null, widthHolderId: widthHolder?.id || null, relationships, generatedAt: engine.clockSeconds };
  }

  function updateAttackingContexts(engine) {
    engine.attackingContexts = engine.attackingContexts || { home: null, away: null };
    ["home", "away"].forEach(side => {
      const previous = engine.attackingContexts[side];
      const owner = engine.ball.ownerId ? getPlayer(engine, engine.ball.ownerId) : null;
      const team = teamBySide(engine, side);
      const phase = owner?.side === side ? determinePhase(engine, team) : team.phase;
      const reusable = previous?.active && owner?.side === side && previous.ownerId === owner.id && previous.phase === phase && engine.clockSeconds - Number(previous.generatedAt || 0) < 5.5;
      engine.attackingContexts[side] = reusable ? previous : buildAttackingContext(engine, side);
    });
  }

  function attackingRoleTarget(engine, player, team, opponent, phase, progress, ballShiftY) {
    const profile = player.attackProfile || attackingProfile(player.role, player.group);
    const context = engine.attackingContexts?.[player.side] || { assignments: {}, relationships: {} };
    const ball = engine.ball.position;
    const direction = team.direction;
    const goal = attackGoalX(team);
    const assignedSlot = context.assignments?.[player.id];
    if (assignedSlot && phase === "CHANCE_CREATION" && !["FB","WB","CB","DM"].includes(player.group)) {
      const point = boxSlotPoint(team, assignedSlot, ball);
      const intent = assignedSlot === "NEAR_POST" ? "POACH_BOX" : assignedSlot === "FAR_POST" ? "BLIND_SIDE_RUN" : assignedSlot === "PENALTY_SPOT" ? "LATE_BOX_RUN" : "SUPPORT_EDGE";
      setAttackingIntent(engine, player, intent, { slot: assignedSlot });
      return { x: point.x, y: point.y };
    }
    if (["FB","WB"].includes(player.group)) {
      const relation = context.relationships?.[player.id] || { mode: "OVERLAP" };
      const licence = fullbackAttackLicence(engine, player, team, opponent) + (profile.depth - 50) * .36;
      const otherBackHigh = team.players.some(row => row.id !== player.id && ["FB","WB"].includes(row.group) && progressFor(team, row.targetPosition?.x ?? row.positionNow.x) > 69);
      if (profile.role === "fullback-defend" || licence < 52 || (otherBackHigh && restDefenceSecurity(engine, team) < 70)) {
        setAttackingIntent(engine, player, "REST_DEFENCE");
        return { x: player.anchor.x + direction * 7, y: player.anchor.y };
      }
      if (relation.mode === "INVERT") {
        setAttackingIntent(engine, player, "INVERT_SUPPORT", relation);
        return { x: player.anchor.x + direction * 19, y: lerp(player.anchor.y, 34, .72) };
      }
      if (relation.mode === "UNDERLAP") {
        setAttackingIntent(engine, player, "UNDERLAP", relation);
        return { x: stayOnsideX(engine, team, player.anchor.x + direction * 34, 1.1), y: lerp(player.anchor.y, 34, .52) };
      }
      setAttackingIntent(engine, player, "OVERLAP", relation);
      return { x: stayOnsideX(engine, team, player.anchor.x + direction * (player.group === "WB" ? 38 : 34), 1.1), y: player.anchor.y < 34 ? 6.5 : 61.5 };
    }
    if (player.group === "CB") {
      const isBpd = profile.role === "ball-playing-defender";
      const owner = engine.ball.ownerId ? getPlayer(engine, engine.ball.ownerId) : null;
      const space = 100 - pressureAt(engine, player);
      if (isBpd && ["BUILD_UP","PROGRESSION"].includes(phase) && owner?.side === player.side && space > 54 && restDefenceSecurity(engine, team) > 58) {
        setAttackingIntent(engine, player, "DEFENDER_CARRY");
        return { x: player.anchor.x + direction * (owner.id === player.id ? 18 : 11), y: clamp(player.anchor.y + ballShiftY * .25, 19, 49) };
      }
      setAttackingIntent(engine, player, "BUILD_SUPPORT");
      return { x: player.anchor.x + direction * 6, y: clamp(player.anchor.y + ballShiftY * .25, 18, 50) };
    }
    if (player.group === "DM") {
      if (profile.role === "half-back") { setAttackingIntent(engine, player, "HALF_BACK_DROP"); return { x: ownGoalX(team)+direction*24, y:34 }; }
      if (profile.role === "regista") { setAttackingIntent(engine, player, "REGISTA_ROAM"); return { x: player.anchor.x+direction*13, y: clamp(34+ballShiftY*.75,18,50) }; }
      if (profile.role === "deep-lying-playmaker") { setAttackingIntent(engine, player, "PLAYMAKER_BASE"); return { x: player.anchor.x+direction*8, y: clamp(34+ballShiftY*.42,22,46) }; }
      setAttackingIntent(engine, player, "SECURE_CENTRE"); return { x: player.anchor.x+direction*6, y:34 };
    }
    if (player.group === "CM") {
      const sideSign = player.anchor.y < 34 ? -1 : 1;
      if (profile.role === "mezzala") { setAttackingIntent(engine, player, "MEZZALA_HALF_SPACE"); return { x: stayOnsideX(engine, team, player.anchor.x+direction*(phase === "CHANCE_CREATION"?25:15),1.4), y:34+sideSign*13 }; }
      if (profile.role === "carrilero") { setAttackingIntent(engine, player, "CARRILERO_SUPPORT"); return { x: player.anchor.x+direction*10, y:34+sideSign*18 }; }
      if (profile.role === "advanced-playmaker") { setAttackingIntent(engine, player, "PLAYMAKER_BETWEEN_LINES"); return { x: player.anchor.x+direction*16, y:clamp(34+ballShiftY*.35,22,46) }; }
      if (phase === "CHANCE_CREATION" || profile.box >= 60) { setAttackingIntent(engine, player, "LATE_BOX_RUN"); return { x: goal-direction*14, y:34+sideSign*6 }; }
      setAttackingIntent(engine, player, "SUPPORT_TRIANGLE"); return { x: player.anchor.x+direction*9, y:player.anchor.y+ballShiftY*.3 };
    }
    if (player.group === "AM") {
      if (profile.role === "shadow-striker") { setAttackingIntent(engine, player, "SHADOW_BOX_RUN"); return { x: goal-direction*10.5, y:clamp(34+ballShiftY*.15,27,41) }; }
      if (profile.role === "enganche") { setAttackingIntent(engine, player, "ENGANCHE_LINK"); return { x: player.anchor.x+direction*7, y:34 }; }
      setAttackingIntent(engine, player, "PLAYMAKER_BETWEEN_LINES"); return { x: player.anchor.x+direction*13, y:clamp(34+ballShiftY*.28,21,47) };
    }
    if (player.group === "WING") {
      const sideSign = player.anchor.y < 34 ? -1 : 1;
      if (profile.role === "winger") { setAttackingIntent(engine, player, "HOLD_WIDTH"); return { x: player.anchor.x+direction*16, y:sideSign<0?5.5:62.5 }; }
      if (profile.role === "wide-playmaker") { setAttackingIntent(engine, player, "WIDE_PLAYMAKER_LINK"); return { x: player.anchor.x+direction*11, y:34+sideSign*15 }; }
      if (profile.role === "inside-forward") { setAttackingIntent(engine, player, context.blindSideRunnerId===player.id?"BLIND_SIDE_RUN":"INSIDE_FORWARD_RUN"); return { x: goal-direction*10.5, y:34+sideSign*7 }; }
      setAttackingIntent(engine, player, "INSIDE_FORWARD_RUN"); return { x: player.anchor.x+direction*20, y:34+sideSign*11 };
    }
    if (player.group === "ST") {
      const sideSign = player.anchor.y < 34 ? -1 : player.anchor.y > 34 ? 1 : (ball.y<34?1:-1);
      if (profile.role === "false-nine") { setAttackingIntent(engine, player, "FALSE_NINE_DROP"); return { x: ownGoalX(team)+direction*64, y:clamp(34+ballShiftY*.5,24,44) }; }
      if (profile.role === "target-forward") { setAttackingIntent(engine, player, "TARGET_HOLD_UP"); return { x: ownGoalX(team)+direction*73, y:34+sideSign*3 }; }
      if (profile.role === "poacher") { setAttackingIntent(engine, player, "POACH_BOX"); return { x: goal-direction*8, y:34+sideSign*3.5 }; }
      const blind = context.blindSideRunnerId === player.id;
      setAttackingIntent(engine, player, blind?"BLIND_SIDE_RUN":"RUN_BEHIND");
      return { x: goal-direction*(profile.role === "complete-forward"?11:9), y:34+sideSign*(profile.role === "advanced-forward"?8:4) };
    }
    return null;
  }

  const PRESSING_TRIGGERS = Object.freeze(["BAD_TOUCH", "BACK_PASS", "TOUCHLINE", "WEAK_FOOT", "GOALKEEPER", "COUNTER_PRESS", "ISOLATED_RECEIVER"]);

  function defensiveLineCoordinate(team) {
    const defenders = team.players.filter(player => ["CB", "FB", "WB"].includes(player.group));
    if (!defenders.length) return ownGoalX(team) + team.direction * 22;
    const lineProgress = defenders.reduce((sum, player) => sum + progressFor(team, player.positionNow.x), 0) / defenders.length;
    const tactical = clamp(team.tactics.defensiveLine, 25, 82);
    const targetProgress = clamp(lineProgress * 0.56 + tactical * 0.44, 16, 72);
    return ownGoalX(team) + team.direction * targetProgress;
  }

  function secondLastDefenderLine(engine, attackingTeam) {
    const defending = opponentTeam(engine, attackingTeam.side);
    const rows = defending.players.filter(player => player.group !== "GK").map(player => player.positionNow.x);
    if (rows.length < 2) return attackGoalX(attackingTeam);
    rows.sort((a, b) => attackingTeam.direction === 1 ? b - a : a - b);
    return rows[1];
  }

  function stayOnsideX(engine, attackingTeam, proposedX, margin = 0.8) {
    const lineX = secondLastDefenderLine(engine, attackingTeam);
    return attackingTeam.direction === 1 ? Math.min(proposedX, lineX - margin) : Math.max(proposedX, lineX + margin);
  }

  function evaluateOffside(engine, owner, receiver, targetPoint) {
    const attacking = teamBySide(engine, owner.side);
    const lineX = secondLastDefenderLine(engine, attacking);
    const receiveX = Number(targetPoint?.x ?? receiver.positionNow.x);
    const beyondHalf = attacking.direction === 1 ? receiveX > 50 : receiveX < 50;
    const margin = attacking.direction === 1 ? receiveX - lineX : lineX - receiveX;
    const beyondLine = margin > 0.65;
    const aheadOfBall = attacking.direction === 1 ? receiveX > owner.positionNow.x + 0.2 : receiveX < owner.positionNow.x - 0.2;
    const activeRole = ["ST", "WING", "AM", "CM"].includes(receiver.group);
    return { isOffside: activeRole && beyondHalf && beyondLine && aheadOfBall, lineX, receiveX, margin };
  }

  function pressingTriggerScore(engine, defending, owner) {
    const attacking = teamBySide(engine, owner.side);
    const forwardFacing = Math.cos(owner.facing - (attacking.direction === 1 ? 0 : Math.PI));
    const reason = String(engine.ball.reason || "");
    const badTouch = /HEAVY|MISCONTROL|LOOSE|SECOND_BALL/.test(reason) ? 21 : 0;
    const backFacing = forwardFacing < -0.15 ? 12 : 0;
    const touchline = isWide(owner.positionNow.y) ? 14 : 0;
    const goalkeeper = owner.group === "GK" ? 16 : 0;
    const counterPress = engine.transitionLoss?.side === defending.side && engine.clockSeconds - engine.transitionLoss.at <= Number(defending.tactics.counterPressWindow || 5.5) && defending.tactics.lossTransition === "counterpress" ? 25 : 0;
    const isolated = nearestPlayers(attacking.players.filter(player => player.id !== owner.id), owner.positionNow, 1)[0]?.d > 12 ? 10 : 0;
    const intensity = defending.tactics.pressing * 0.44 + (defending.tactics.outPossession === "high-press" ? 10 : defending.tactics.outPossession === "low-block" ? -10 : 3);
    const fatiguePenalty = defending.players.reduce((sum, player) => sum + player.fatigue, 0) / Math.max(1, defending.players.length) * 0.16;
    return clamp(intensity + badTouch + backFacing + touchline + goalkeeper + counterPress + isolated - fatiguePenalty, 0, 100);
  }

  function likelyOutlet(attacking, owner) {
    return attacking.players.filter(player => player.id !== owner.id && player.group !== "GK")
      .map(player => ({ player, value: progressFor(attacking, player.positionNow.x) * 0.55 + player.attributes.passing * 0.10 + player.attributes.offBall * 0.18 - distance(owner.positionNow, player.positionNow) * 0.55 }))
      .sort((a, b) => b.value - a.value)[0]?.player || null;
  }

  function buildDefensiveContext(engine, defendingSide) {
    const defending = teamBySide(engine, defendingSide);
    const owner = engine.ball.ownerId ? getPlayer(engine, engine.ball.ownerId) : null;
    if (!owner || owner.side === defendingSide || engine.restart || engine.activeSetPieceAction) {
      return { active: false, side: defendingSide, ownerId: owner?.id || null, lineX: defensiveLineCoordinate(defending), leaderId: defending.defensiveLeaderId, triggerScore: 0, trap: "BLOCK" };
    }
    const attacking = teamBySide(engine, owner.side);
    const triggerScore = pressingTriggerScore(engine, defending, owner);
    const candidates = nearestPlayers(defending.players, owner.positionNow, 7, player => player.group !== "GK");
    const primary = candidates[0]?.player || null;
    const touchline = isWide(owner.positionNow.y);
    const secondaryCandidate = candidates.find((row, index) => index > 0 && row.d <= (touchline ? 10 : 7.5));
    const secondary = triggerScore >= 62 ? secondaryCandidate?.player || null : null;
    const outlet = likelyOutlet(attacking, owner);
    const shadow = outlet ? nearestPlayers(defending.players, { x: lerp(owner.positionNow.x, outlet.positionNow.x, 0.55), y: lerp(owner.positionNow.y, outlet.positionNow.y, 0.55) }, 4, player => player.group !== "GK" && player.id !== primary?.id && player.id !== secondary?.id)[0]?.player : null;
    const ownerProgress = progressFor(attacking, owner.positionNow.x);
    const cutbackThreat = ownerProgress >= 85 && (owner.positionNow.y < 15 || owner.positionNow.y > 53);
    const boxThreat = isInBox(attacking, owner.positionNow) || ownerProgress >= 82;
    const counterDelay = engine.lastPossessionChangeAgo < 6;
    return {
      active: triggerScore >= 62,
      side: defendingSide,
      ownerId: owner.id,
      ownerSide: owner.side,
      primaryPresserId: primary?.id || null,
      secondaryPresserId: secondary?.id || null,
      shadowMarkerId: shadow?.id || null,
      shadowTargetId: outlet?.id || null,
      lineX: defensiveLineCoordinate(defending),
      leaderId: defending.defensiveLeaderId,
      triggerScore,
      trap: touchline ? "TOUCHLINE" : owner.group === "GK" || owner.group === "CB" ? "BUILD_UP" : counterDelay ? "TRANSITION" : "CENTRAL_SCREEN",
      cutbackThreat,
      boxThreat,
      counterDelay,
      doubleTeam: Boolean(secondary)
    };
  }

  function updateDefensiveContexts(engine) {
    engine.defensiveContexts = engine.defensiveContexts || { home: null, away: null };
    ["home", "away"].forEach(side => {
      const previous = engine.defensiveContexts[side];
      const next = buildDefensiveContext(engine, side);
      engine.defensiveContexts[side] = next;
      teamBySide(engine, side).defensiveContext = next;
      engine.pressRecords = engine.pressRecords || { home: { at: -999, ownerId: null }, away: { at: -999, ownerId: null } };
      const record = engine.pressRecords[side];
      const ownerChanged = record.ownerId !== next.ownerId;
      const interval = ownerChanged ? 18.0 : 42.0;
      if (next.active && engine.clockSeconds - record.at >= interval) {
        const stats = teamBySide(engine, side).stats;
        stats.pressures += 1;
        if (next.doubleTeam) stats.doubleTeams += 1;
        if (next.counterDelay) stats.transitionDelays += 1;
        record.at = engine.clockSeconds;
        record.ownerId = next.ownerId;
        emit(engine, "PRESS_TRIGGERED", { side, ownerId: next.ownerId, primaryPresserId: next.primaryPresserId, secondaryPresserId: next.secondaryPresserId, trap: next.trap, triggerScore: Math.round(next.triggerScore) });
      }
    });
  }

  function passingShadowPenalty(engine, owner, receiver) {
    const defendingSide = opponentSide(owner.side);
    const context = engine.defensiveContexts?.[defendingSide];
    if (!context?.active) return 0;
    if (context.shadowTargetId === receiver.id) return 24 + context.triggerScore * 0.10;
    const marker = context.shadowMarkerId ? getPlayer(engine, context.shadowMarkerId) : null;
    if (!marker) return 0;
    const projection = projectToSegment(marker.positionNow, owner.positionNow, receiver.positionNow);
    return projection.distance < 4.2 ? clamp(18 - projection.distance * 3.5, 0, 18) : 0;
  }

  function isPressParticipant(context, playerId) {
    return Boolean(context && playerId && [context.primaryPresserId, context.secondaryPresserId, context.shadowMarkerId].includes(playerId));
  }

  function recordCutbackDefence(engine, side, payload = {}) {
    engine.cutbackRecords = engine.cutbackRecords || { home: { at: -999, ownerId: null }, away: { at: -999, ownerId: null } };
    const record = engine.cutbackRecords[side];
    const ownerId = payload.ownerId || payload.passerId || payload.opponentId || null;
    if (engine.clockSeconds - record.at < 24) return false;
    record.at = engine.clockSeconds;
    record.ownerId = ownerId;
    const stats = teamBySide(engine, side).stats;
    stats.cutbacksDefended += 1;
    stats.boxEntriesDenied += 1;
    emit(engine, "CUTBACK_DEFENDED", { side, ...payload });
    return true;
  }

  function defensiveContextSnapshot(context) {
    if (!context) return null;
    return {
      active: Boolean(context.active), ownerId: context.ownerId || null, primaryPresserId: context.primaryPresserId || null,
      secondaryPresserId: context.secondaryPresserId || null, shadowMarkerId: context.shadowMarkerId || null,
      shadowTargetId: context.shadowTargetId || null, leaderId: context.leaderId || null,
      triggerScore: Math.round(Number(context.triggerScore || 0)), trap: context.trap || "BLOCK",
      lineX: Math.round(Number(context.lineX || 0) * 10) / 10, cutbackThreat: Boolean(context.cutbackThreat),
      boxThreat: Boolean(context.boxThreat), counterDelay: Boolean(context.counterDelay), doubleTeam: Boolean(context.doubleTeam)
    };
  }

  function goalSidePoint(team, owner, separation = 1.8) {
    return { x: clamp(owner.positionNow.x - team.direction * separation, 1, 99), y: clamp(owner.positionNow.y, 2, 66) };
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
      const roleTarget = attackingRoleTarget(engine, player, team, opponent, phase, progress, ballShiftY);
      if (roleTarget) return { x: clamp(roleTarget.x, 1.5, 98.5), y: clamp(roleTarget.y, 1.5, 66.5) };
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
      const defensive = engine.defensiveContexts?.[player.side];
      const ballOwner = defensive?.ownerId ? getPlayer(engine, defensive.ownerId) : null;
      if ((defensive?.active || defensive?.cutbackThreat) && ballOwner) {
        if (player.id === defensive.primaryPresserId) {
          const sameFlank = Math.sign(player.anchor.y - 34) === Math.sign(ballOwner.positionNow.y - 34);
          if (defensive.cutbackThreat && ["FB", "WB"].includes(player.group) && sameFlank) {
            player.currentIntent = "STOP_CROSS";
            return { x: clamp(ballOwner.positionNow.x - direction * 2.2, 1, 99), y: clamp(ballOwner.positionNow.y + (ballOwner.positionNow.y < 34 ? 1.8 : -1.8), 2, 66) };
          }
          const point = goalSidePoint(team, ballOwner, defensive.counterDelay ? 2.8 : 1.4);
          player.currentIntent = defensive.counterDelay ? "CONTAIN_TRANSITION" : "PRESS_BALL";
          return point;
        }
        if (player.id === defensive.secondaryPresserId) {
          const inward = ballOwner.positionNow.y < 34 ? 3.2 : -3.2;
          player.currentIntent = defensive.trap === "TOUCHLINE" ? "DOUBLE_TEAM" : "COVER_PRESS";
          return { x: clamp(ballOwner.positionNow.x - direction * 1.1, 1, 99), y: clamp(ballOwner.positionNow.y + inward, 2, 66) };
        }
        if (player.id === defensive.shadowMarkerId && defensive.shadowTargetId) {
          const target = getPlayer(engine, defensive.shadowTargetId);
          if (target) {
            player.currentIntent = "COVER_SHADOW";
            return { x: clamp(lerp(ballOwner.positionNow.x, target.positionNow.x, 0.56), 1, 99), y: clamp(lerp(ballOwner.positionNow.y, target.positionNow.y, 0.56), 2, 66) };
          }
        }
        if (defensive.cutbackThreat) {
          const sameFlank = Math.sign(player.anchor.y - 34) === Math.sign(ballOwner.positionNow.y - 34);
          if (["FB", "WB"].includes(player.group) && sameFlank) {
            player.currentIntent = "STOP_CROSS";
            return { x: clamp(ballOwner.positionNow.x - direction * 2.2, 1, 99), y: clamp(ballOwner.positionNow.y + (ballOwner.positionNow.y < 34 ? 1.8 : -1.8), 2, 66) };
          }
          if (player.group === "DM") {
            player.currentIntent = "CUTBACK_SCREEN";
            return { x: clamp(ownGoalX(team) + direction * 19, 1, 99), y: 34 };
          }
          if (player.group === "CB") {
            const nearSide = Math.sign(player.anchor.y - 34) === Math.sign(ballOwner.positionNow.y - 34);
            player.currentIntent = nearSide ? "PROTECT_NEAR_POST" : "MARK_CENTRE";
            return { x: clamp(ownGoalX(team) + direction * (nearSide ? 10.5 : 12.5), 1, 99), y: nearSide ? (ballOwner.positionNow.y < 34 ? 27 : 41) : 34 };
          }
        }
        if (["CB", "FB", "WB"].includes(player.group) && !defensive.counterDelay) {
          x = defensive.lineX;
          y = clamp(34 + (player.anchor.y - 34) * compactness + ballShiftY * 0.4, 7, 61);
          player.currentIntent = player.id === defensive.leaderId ? "LEAD_DEFENSIVE_LINE" : "HOLD_OFFSIDE_LINE";
          return { x: clamp(x, 2, 98), y };
        }
      }
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
  updateDefensiveContexts(engine);
  updateAttackingContexts(engine);
  const all = engine.teams.home.players.concat(engine.teams.away.players);
  all.forEach(player => {
    player.previousPosition = { ...player.positionNow };
    player.targetPosition = tacticalTarget(engine, player);
    const d = distance(player.positionNow, player.targetPosition);
    const effectivePace = effectiveAttribute(player, "pace", "physical");
    const effectiveAcceleration = effectiveAttribute(player, "acceleration", "physical");
    const maxSpeed = (effectivePace / 10.5) * (.70 + Number(player.physical?.shortEnergy ?? player.energy ?? 100) / 280);
    const statusLimit = player.physical?.status === PHYSICAL_STATUS.INJURED ? .38 : player.physical?.status === PHYSICAL_STATUS.CRAMP ? .58 : player.physical?.status === PHYSICAL_STATUS.TIGHTNESS ? .78 : 1;
    const desired = Math.min(maxSpeed * statusLimit, d * 1.8);
    const ux = d > 0.001 ? (player.targetPosition.x - player.positionNow.x) / d : 0;
    const uy = d > 0.001 ? (player.targetPosition.y - player.positionNow.y) / d : 0;
    const acceleration = effectiveAcceleration / 18;
    player.velocity.x = lerp(player.velocity.x, ux * desired, clamp(acceleration * dt, 0, 1));
    player.velocity.y = lerp(player.velocity.y, uy * desired, clamp(acceleration * dt, 0, 1));
    player.positionNow.x = clamp(player.positionNow.x + player.velocity.x * dt, 1, 99);
    player.positionNow.y = clamp(player.positionNow.y + player.velocity.y * dt, 2, 66);
    const actualSpeed = Math.hypot(player.velocity.x, player.velocity.y);
    if (actualSpeed > 0.2) player.facing = Math.atan2(player.velocity.y, player.velocity.x);
    updatePhysicalPlayer(engine, player, dt, actualSpeed, Math.max(.2, maxSpeed));
  });
}
  function contextLinkBonus(engine, owner, receiver, ownerProfile, receiverProfile) {
    const context = engine.attackingContexts?.[owner.side];
    let bonus = 0;
    if (context?.linkPlayerId === receiver.id) bonus += receiverProfile.link * .10;
    if (["FALSE_NINE_DROP", "TARGET_HOLD_UP", "PLAYMAKER_BETWEEN_LINES", "WIDE_PLAYMAKER_LINK"].includes(receiver.currentIntent)) bonus += 11;
    if (ownerProfile.creativePass >= 78 && ["BLIND_SIDE_RUN", "RUN_BEHIND"].includes(receiver.currentIntent)) bonus += 12;
    return bonus;
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
      const shadowPenalty = passingShadowPenalty(engine, owner, receiver);
      const progressValue = clamp(forward * 2.2, -25, 50);
      const receiverProfile = receiver.attackProfile || attackingProfile(receiver.role, receiver.group);
      const ownerProfile = owner.attackProfile || attackingProfile(owner.role, owner.group);
      const movementBonus = ["RUN_BEHIND", "BLIND_SIDE_RUN", "POACH_BOX", "SHADOW_BOX_RUN"].includes(receiver.currentIntent) && forward > 0 ? 16 + receiverProfile.runBehind * .12 : 0;
      const linkBonus = contextLinkBonus(engine, owner, receiver, ownerProfile, receiverProfile);
      const roleBonus = receiverProfile.box * .045 + receiverProfile.link * .035 + movementBonus + linkBonus;
      const score = receiverSpace * 0.31 + progressValue + owner.attributes.vision * 0.18 + roleBonus - laneOpponents * 17 - shadowPenalty - d * 0.35;
      return { receiver, d, forward, laneOpponents, receiverSpace, shadowPenalty, score, movementBonus, linkBonus, killerBall: movementBonus >= 18 || (forward > 12 && ownerProfile.creativePass >= 72) };
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
    const profile = owner.attackProfile || attackingProfile(owner.role, owner.group);
    const progress = progressFor(team, owner.positionNow.x);
    const pressure = pressureAt(engine, owner);
    const opportunity = scoringOpportunity(engine, owner);
    const passOptions = findPassOptions(engine, owner);
    const bestPass = passOptions[0];
    const actions = [];

    const finishingWindow = opportunity + owner.attributes.anticipation * 0.10 + owner.attributes.composure * 0.08 - pressure * 0.34 + engine.rng.range(-9, 9);
    const windowProbability = clamp((finishingWindow - 64) / 980, 0, 0.038);
    const shotWindowOpen = progress >= 74 && finishingWindow >= 66 && Number(engine.possessionActions || 0) >= 2 && engine.clockSeconds - Number(engine.lastShotAt || -999) >= 23 && engine.rng.chance(windowProbability);
    if (shotWindowOpen) {
      const teamMateBetterPlaced = passOptions[0]?.receiverSpace > 72 && passOptions[0]?.forward > 5 ? (100 - owner.behaviour.selfishness) * .10 : 0;
      const shotUrge = 58 + (opportunity - 55) * 0.42 + owner.attributes.finishing * 0.10 + owner.behaviour.goalHunger * 0.06 + profile.shoot * .16 + owner.behaviour.selfishness * .07 - teamMateBetterPlaced - pressure * 0.12;
      actions.push({ type: "SHOT", score: shotUrge });
    }
    if (isWide(owner.positionNow.y) && progress >= 66 && engine.clockSeconds - Number(engine.lastCrossAt || -999) >= 10 && engine.rng.chance(0.068)) {
      const targets = team.players.filter(player => ["ST", "AM", "CM", "CB"].includes(player.group) && progressFor(team, player.positionNow.x) >= 72);
      const crossScore = owner.attributes.crossing * 0.42 + targets.length * 7 + (100 - pressure) * 0.18 + team.tactics.width * 0.16 + profile.cross * .18 + 2;
      actions.push({ type: "CROSS", score: crossScore });
    }
    if (bestPass) {
      const passScore = bestPass.score + owner.attributes.passing * 0.18 + profile.creativePass * .12 + profile.link * .08 + (team.tactics.inPossession === "vertical" ? bestPass.forward * 0.55 : 0);
      actions.push({ type: "PASS", score: passScore, option: bestPass });
    }
    const carryScore = owner.attributes.dribbling * 0.22 + owner.attributes.acceleration * 0.10 + (100 - pressure) * 0.14 + (progress < 74 ? 5 : -6) + team.tactics.risk * 0.08 + profile.carry * .14;
    actions.push({ type: "CARRY", score: carryScore });
    if (["target-forward", "complete-forward", "false-nine"].includes(profile.role) && pressure >= 28) {
      actions.push({ type: "HOLD_UP", score: profile.holdUp * .48 + owner.attributes.strength * .22 + owner.attributes.firstTouch * .14 + owner.attributes.teamwork * .10 - pressure * .10 });
    }
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
    const previousLoss = engine.transitionLoss;
    setBallOwner(engine, player, type);
    engine.lastPossessionChangeAgo = 0;
    engine.possessionActions = 0;
    if (previousSide && previousSide !== player.side) {
      teamBySide(engine, previousSide).stats.turnovers += 1;
      teamBySide(engine, player.side).stats.recoveries += 1;
      if (previousLoss?.side === player.side && engine.clockSeconds - previousLoss.at <= Number(teamBySide(engine, player.side).tactics.counterPressWindow || 5.5)) {
        teamBySide(engine, player.side).stats.counterPressRegains += 1;
        emit(engine, "COUNTER_PRESS_REGAIN", { side: player.side, playerId: player.id, elapsed: Math.round((engine.clockSeconds - previousLoss.at) * 10) / 10 });
      }
      engine.transitionLoss = { side: previousSide, at: engine.clockSeconds };
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
  const quality =
    effectiveAttribute(receiver, "firstTouch", "technical") * 0.35 +
    effectiveAttribute(receiver, "technique", "technical") * 0.15 +
    effectiveAttribute(receiver, "composure", "mental") * 0.12 +
    effectiveAttribute(receiver, "anticipation", "mental") * 0.08 +
    action.passQuality * 0.22 + 18 -
    pressure * 0.18 - passSpeedPenalty * 0.60 - aerialPenalty * 0.50 +
    engine.rng.range(-8, 8);
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
        const defendingStats = opponentTeam(engine, owner.side).stats;
        defendingStats.interceptions += 1;
        const pressContext = engine.defensiveContexts?.[interceptor.side];
        if (action.forcedByPress && (isPressParticipant(pressContext, interceptor.id) || action.pressuringPlayerIds?.includes(interceptor.id))) { defendingStats.successfulPressures += 1; defendingStats.pressureRegains += 1; defendingStats.forcedTurnovers += 1; }
        if (Number(action.shadowPenalty || 0) > 0) defendingStats.passingLanesBlocked += 1;
        if (pressContext?.cutbackThreat) recordCutbackDefence(engine, interceptor.side, { playerId: interceptor.id, passerId: owner.id, ownerId: owner.id });
        changePossession(engine, interceptor, "INTERCEPTION");
        emit(engine, "PASS_INTERCEPTED", { side: owner.side, playerId: owner.id, receiverId: receiver.id, opponentId: interceptor.id, at: { ...engine.ball.position } });
        engine.nextDecisionIn = engine.rng.range(3.0, 5.5);
        return;
      }
    }
    if (action.outcome === "DEFLECTION") {
      if (action.forcedByPress) { opponentTeam(engine, owner.side).stats.forcedErrors += 1; }
      emit(engine, action.isCross ? "CROSS_DEFLECTED" : "PASS_DEFLECTED", { side: owner.side, playerId: owner.id, receiverId: receiver.id, at: { ...engine.ball.position } });
      createLooseBall(engine, engine.ball.position, { sourceSide: owner.side, source: action.isCross ? "CROSS_DEFLECTION" : "PASS_DEFLECTION", secondBall: true, velocity: { x: team.direction * engine.rng.range(-1.5, 2.5), y: engine.rng.range(-2.4, 2.4) } });
      return;
    }
    if (action.outcome === "MISPLACED") {
      if (action.forcedByPress) { opponentTeam(engine, owner.side).stats.forcedErrors += 1; }
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
      if (action.forcedByPress && action.forward > 6) {
        const burst = clamp(action.forward * 0.10, 1.4, 3.8);
        receiver.positionNow.x = clamp(receiver.positionNow.x + team.direction * burst, 1, 99);
        engine.ball.position = { ...receiver.positionNow };
        team.stats.defensiveLineBreaks += 1;
        emit(engine, "PRESS_BROKEN", { side: receiver.side, playerId: receiver.id, passerId: owner.id, gain: Math.round(burst * 10) / 10 });
        engine.nextDecisionIn = engine.rng.range(1.4, 2.8);
      } else {
        engine.nextDecisionIn = engine.rng.range(3.0, 5.4);
      }
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
    const basePressure = basePressureAt(engine, owner);
    const structuredPressure = Math.max(0, pressure - basePressure);
    const structuredContext = engine.defensiveContexts?.[opponentSide(owner.side)] || null;
    const pressuringPlayerIds = structuredContext ? [structuredContext.primaryPresserId, structuredContext.secondaryPresserId, structuredContext.shadowMarkerId].filter(Boolean) : [];
    const offsideGeometry = !debug.ignoreOffside && !engine.setPieceContext ? evaluateOffside(engine, owner, receiver, receiver.positionNow) : { isOffside: false, margin: 0 };
    const timingDiscipline = effectiveAttribute(receiver, "offBall", "mental") * 0.004 + effectiveAttribute(receiver, "anticipation", "mental") * 0.003;
    const offsideProbability = clamp(0.012 + Math.max(0, Number(offsideGeometry.margin || 0) - 1) * 0.0015 - timingDiscipline * 0.012, 0.006, 0.032);
    const offside = { ...offsideGeometry, isOffside: Boolean(debug.forceOffside) || (offsideGeometry.isOffside && engine.rng.chance(offsideProbability)) };
    if (offside.isOffside) {
      const defending = opponentTeam(engine, owner.side);
      team.stats.passesAttempted += 1;
      team.stats.offsides += 1;
      defending.stats.offsideTraps += 1;
      defending.stats.offsidesWon += 1;
      const restartPlayer = nearestPlayers(defending.players, receiver.positionNow, 1, player => player.group !== "GK")[0]?.player || defending.players.find(player => player.group === "GK");
      setBallOwner(engine, restartPlayer, "OFFSIDE_RESTART");
      restartPlayer.currentIntent = "OFFSIDE_TRAP_WON";
      emit(engine, "OFFSIDE", { side: owner.side, playerId: receiver.id, passerId: owner.id, defendingSide: defending.side, lineX: offside.lineX, receiveX: offside.receiveX });
      engine.nextDecisionIn = engine.rng.range(2.1, 3.6);
      return { type: "OFFSIDE", side: owner.side, receiverId: receiver.id, lineX: offside.lineX };
    }
    const execution = effectiveAttribute(owner, "passing", "technical") * 0.40 + effectiveAttribute(owner, "vision", "mental") * 0.19 + effectiveAttribute(owner, "technique", "technical") * 0.13 + effectiveAttribute(owner, "composure", "mental") * 0.12 + (100 - pressure) * 0.10 - structuredPressure * 0.20;
    registerExplosiveLoad(owner, isCross ? .62 : passDistance > 24 ? .42 : .20);
    const passQuality = clamp(execution + engine.rng.range(-8, 8) - (isCross ? 4 : 0), 25, 98);
    const speed = clamp(13 + passQuality / 7 + (isCross ? 2 : 0), 14, 29);
    const duration = clamp(passDistance / speed, 0.32, 2.7);
    const shadowPenalty = Number(option?.shadowPenalty || passingShadowPenalty(engine, owner, receiver));
    const candidate = laneInterceptionCandidate(engine, owner, receiver, start, intendedEnd, duration);
    let outcome = debug.outcome || "TEAMMATE";
    let end = intendedEnd;
    let interceptorId = null;
    if (!debug.outcome && candidate) {
      const laneRisk = clamp(0.12 + candidate.margin * 0.36 + pressure / 340 + structuredPressure / 260 + shadowPenalty / 230 + (100 - passQuality) / 270, 0.05, 0.76);
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
    if (option?.killerBall) {
      team.stats.killerPassesAttempted += 1;
      if ((owner.attackProfile?.creativePass || 0) >= 70) team.stats.creativePasses += 1;
      emit(engine, "KILLER_PASS_ATTEMPT", { side: owner.side, playerId: owner.id, receiverId: receiver.id, role: owner.attackProfile?.role, receiverIntent: receiver.currentIntent });
    }
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
      shadowPenalty,
      band,
      forward: (intendedEnd.x - start.x) * team.direction,
      outcome,
      finalThirdEntry,
      finalThirdPass: progressFor(team, intendedEnd.x) >= 67,
      boxEntry,
      debugTouchOutcome: debug.touchOutcome || null,
      forcedByPress: structuredPressure >= 7 || Number(option?.shadowPenalty || 0) >= 12,
      pressingSide: structuredPressure >= 7 ? opponentSide(owner.side) : null,
      pressuringPlayerIds
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
    const profile = owner.attackProfile || attackingProfile(owner.role, owner.group);
    team.stats.carries += 1;
    if (owner.group === "CB" && profile.role === "ball-playing-defender") team.stats.defenderCarries += 1;
    team.stats.dribblesAttempted += pressure > 28 ? 1 : 0;
    const defendingContext = engine.defensiveContexts?.[opponentSide(owner.side)];
    const underStructuredPress = defendingContext?.active && defendingContext.ownerId === owner.id;
    const carryDistance = engine.rng.range(2.2, 6.8) * (0.75 + effectiveAttribute(owner, "acceleration", "physical") / 180) * (0.78 + profile.carry / 240) * (underStructuredPress ? 0.82 : 1);
    const lateralBias = ["mezzala", "inside-forward", "inverted-winger"].includes(profile.role) ? (owner.anchor.y < 34 ? 1.6 : -1.6) : 0;
    const lateral = engine.rng.range(-3.3, 3.3) + lateralBias;
    const target = { x: clamp(owner.positionNow.x + team.direction * carryDistance, 2, 98), y: clamp(owner.positionNow.y + lateral, 3, 65) };
    if (carryDistance >= 5.2 || (progressFor(team, target.x) >= 67 && progressFor(team, owner.positionNow.x) < 67)) team.stats.progressiveCarries += 1;
    const defender = nearestPlayers(opponentTeam(engine, owner.side).players, target, 1)[0];
    const contest = defender && defender.d < 5.2;
    if (contest) {
      registerExplosiveLoad(owner, .78);
      registerExplosiveLoad(defender.player, .48);
      maybeContactIncident(engine, owner, "TACKLE_DUEL", .68);
      maybeContactIncident(engine, defender.player, "TACKLE_DUEL", .54);
      const attackerScore = effectiveAttribute(owner, "dribbling", "technical") + effectiveAttribute(owner, "agility", "physical") + effectiveAttribute(owner, "acceleration", "physical") + engine.rng.range(-18, 18);
      const defenderScore = effectiveAttribute(defender.player, "tackling", "technical") + effectiveAttribute(defender.player, "positioning", "mental") + effectiveAttribute(defender.player, "strength", "physical") + (underStructuredPress ? 13 : 0) + engine.rng.range(-18, 18);
      opponentTeam(engine, owner.side).stats.tacklesAttempted += 1;
      if (attackerScore > defenderScore) {
        team.stats.dribblesCompleted += 1;
        const securedTarget = underStructuredPress ? { x: clamp(target.x + team.direction * engine.rng.range(1.8, 4.2), 2, 98), y: target.y } : target;
        if (underStructuredPress) { team.stats.defensiveLineBreaks += 1; emit(engine, "PRESS_BROKEN", { side: owner.side, playerId: owner.id, opponentId: defender.player.id, gain: Math.round(distance(target, securedTarget) * 10) / 10 }); }
        owner.positionNow = securedTarget;
        engine.ball.position = { ...securedTarget };
        emit(engine, "DRIBBLE_SUCCESS", { side: owner.side, playerId: owner.id, opponentId: defender.player.id, to: target });
      } else {
        const defendingStats = opponentTeam(engine, owner.side).stats;
        defendingStats.tacklesWon += 1;
        if (underStructuredPress && isPressParticipant(defendingContext, defender.player.id)) { defendingStats.successfulPressures += 1; defendingStats.pressureRegains += 1; defendingStats.forcedTurnovers += 1; }
        if (defendingContext?.cutbackThreat) recordCutbackDefence(engine, defender.player.side, { playerId: defender.player.id, opponentId: owner.id, ownerId: owner.id });
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
    const positioningQuality = effectiveAttribute(goalkeeper, "positioning", "mental") * 0.35 + effectiveAttribute(goalkeeper, "decisions", "mental") * 0.18 + profile.reflex * 0.24 + profile.handling * 0.13 + profile.start * 0.10;
    const targetDifficulty = Math.abs(context.targetY - goalkeeper.positionNow.y) * 2.25 + context.targetZ * 7.2 + Math.max(0, 16 - shotDistance) * 0.55;
    const typeModifier = ({ CHIP: -5, POWER: -8, PLACED: -3, DRIVEN: -5, HEADER: 2, FIRST_TIME: -4 })[context.shotType] || 0;
    const keeperQualityFactor = clamp(1.08 - positioningQuality / 780, 0.88, 1.02);
    const difficultyBoost = clamp((targetDifficulty - 10) / 420, -0.025, 0.08);
    const typeBoost = clamp(-typeModifier / 420, -0.02, 0.035);
    let goalProbability = clamp(context.xgot * keeperQualityFactor * 0.76 + difficultyBoost + typeBoost + sightPenalty * 0.018, 0.018, 0.62);
    let saveProbability = clamp(1 - goalProbability, 0.18, 0.975);
    let holdProbability = clamp(0.14 + profile.handling / 118 + effectiveAttribute(goalkeeper, "composure", "mental") / 520 - context.shotPower / 170 - context.xgot * 0.20, 0.14, 0.88);
    if (["CORNER", "INDIRECT_FREE_KICK", "LONG_THROW"].includes(context.source)) {
      saveProbability = clamp(saveProbability - 0.07 - context.sightObstruction * 0.012, 0.14, 0.91);
      holdProbability = clamp(holdProbability * 0.68, 0.12, 0.60);
    }
    if (context.source === "PENALTY") {
      saveProbability = clamp(0.11 + profile.reflex / 620 + effectiveAttribute(goalkeeper, "anticipation", "mental") / 980 + engine.rng.range(-0.04, 0.04), 0.12, 0.29);
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
    const aimDiscipline = effectiveAttribute(shooter, "finishing", "technical") * 0.34 + effectiveAttribute(shooter, "composure", "mental") * 0.25 + effectiveAttribute(shooter, "technique", "technical") * 0.17 + effectiveAttribute(shooter, "decisions", "mental") * 0.10 + opportunity * 0.14;
    const errorScale = clamp(5.8 - aimDiscipline / 24 + pressure / 34 + Math.max(0, distanceValue - 18) / 11, 0.35, 7.8);
    const targetY = Number.isFinite(Number(debug.targetY)) ? Number(debug.targetY) : preferredCorner + engine.rng.range(-errorScale, errorScale);
    const baseHeight = type === "CHIP" ? 1.9 : type === "POWER" ? 1.05 : isHeader ? 1.45 : type === "PLACED" ? 0.72 : 0.92;
    const targetZ = Number.isFinite(Number(debug.targetZ)) ? Number(debug.targetZ) : clamp(baseHeight + engine.rng.range(-0.62, 0.78) + Math.max(0, distanceValue - 20) / 45, -0.2, 3.2);
    registerExplosiveLoad(shooter, type === "POWER" ? 1.15 : .82);
    const shotPower = clamp(48 + effectiveAttribute(shooter, "technique", "technical") * 0.18 + (type === "POWER" ? effectiveAttribute(shooter, "longShots", "technical") * 0.30 : effectiveAttribute(shooter, "finishing", "technical") * 0.20) + engine.rng.range(-7, 7), 44, 98);
    const speed = clamp(20 + shotPower / 4.3, 28, 45);
    const duration = clamp(distanceValue / speed, 0.24, 1.18);
    const goalPoint = { x: goalX + team.direction * 0.75, y: targetY };
    const angleFactor = clamp(Math.atan2(7.32, Math.max(1, distanceValue)) / 0.65, 0.12, 1);
    const distanceFactor = clamp(1 - Math.max(0, distanceValue - 7) / 35, 0.06, 1);
    const pressureFactor = clamp(1 - pressure / 142, 0.22, 1);
    const techniqueFactor = clamp((effectiveAttribute(shooter, "finishing", "technical") * 0.50 + effectiveAttribute(shooter, "composure", "mental") * 0.30 + effectiveAttribute(shooter, "technique", "technical") * 0.20) / 83, 0.46, 1.20);
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
    team.stats.roleShots += 1;
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
    })[0] || team.players[0] || null;
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
  return (role === "ATTACK" ? effectiveAttribute(player, "heading", "technical") : effectiveAttribute(player, "marking", "mental")) * .25 +
    effectiveAttribute(player, "jumping", "physical") * .25 +
    effectiveAttribute(player, "strength", "physical") * .16 +
    effectiveAttribute(player, "anticipation", "mental") * .12 +
    effectiveAttribute(player, "bravery", "mental") * .08 +
    effectiveAttribute(player, "concentration", "mental") * .07 +
    effectiveAttribute(player, "positioning", "mental") * .07 + momentum;
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
    if (target) { registerExplosiveLoad(target, .72); maybeContactIncident(engine, target, "AERIAL_DUEL", .48); }
    if (marker) { registerExplosiveLoad(marker, .62); maybeContactIncident(engine, marker, "AERIAL_DUEL", .46); }
    const attackerScore = aerialScore(target, "ATTACK", clamp(effectiveAttribute(target, "acceleration", "physical") * .08 + effectiveAttribute(target, "offBall", "mental") * .12 + action.quality * .09 + engine.rng.range(-7, 7), 0, 30));
    const defenderScore = aerialScore(marker, "DEFEND", clamp(effectiveAttribute(marker, "positioning", "mental") * .08 + effectiveAttribute(marker, "concentration", "mental") * .10 + engine.rng.range(-6, 6), 0, 20)) + (a.markingStyle === "zonal" ? 3 : a.markingStyle === "man" ? 4 : 5);
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
    if (!a.taker) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: attackingSide, reason: "NO_SET_PIECE_TAKER" }); return; }
    if (a.routine === "short") { const receiver = a.edge || a.rebound || a.secondary || team.players.find(player => player.id !== a.taker.id); if (!receiver) { clearSetPieceContext(engine, "SHORT_CORNER_NO_RECEIVER"); setBallOwner(engine, a.taker, "SHORT_CORNER_RECYCLE"); engine.nextDecisionIn = 1; return; } receiver.positionNow = { x: restart.spot.x - team.direction * 7, y: restart.spot.y < 34 ? 7 : 61 }; a.taker.positionNow = { ...restart.spot }; clearSetPieceContext(engine, "SHORT_CORNER_START"); setBallOwner(engine, a.taker, "SHORT_CORNER"); startPassFlight(engine, a.taker, receiver, { receiver, forward: (receiver.positionNow.x - a.taker.positionNow.x) * team.direction }, false, { forceQuality: 88 }); emit(engine, "SHORT_CORNER_TAKEN", { side: attackingSide, playerId: a.taker.id, receiverId: receiver.id }); return; }
    startSetPieceDelivery(engine, a, "CORNER", target, { targetId: a.routine === "edge" ? a.edge?.id : a.primary?.id, peakHeight: a.routine === "crowd-keeper" ? 4.8 : 4.2 });
  }

  function resolveDirectFreeKick(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "DIRECT_FREE_KICK", restart.routine), taker = a.taker || team.players[0];
    if (!taker) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: attackingSide, reason: "NO_FREE_KICK_TAKER" }); return; }
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
    const taker = a.taker || team.players[0];
    if (!taker) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: attackingSide, reason: "NO_THROW_IN_TAKER" }); return; }
    a.taker = taker;
    const receiver = (a.routine === "long-throw" ? a.primary : a.edge || a.rebound || a.secondary) || team.players.find(player => player.id !== taker.id); taker.positionNow = { ...restart.spot };
    if (!receiver) { clearSetPieceContext(engine, "THROW_IN_NO_RECEIVER"); setBallOwner(engine, taker, "THROW_IN_RECYCLE"); engine.nextDecisionIn = 1; return; }
    if (a.routine === "long-throw") { startSetPieceDelivery(engine, a, "THROW_IN", { x: attackGoalX(team) - team.direction * 8, y: restart.spot.y < 34 ? 28 : 40 }, { targetId: receiver?.id, peakHeight: 2.8 }); emit(engine, "LONG_THROW_TAKEN", { side: attackingSide, playerId: taker.id, targetId: receiver?.id }); return; }
    receiver.positionNow = { x: clamp(restart.spot.x + team.direction * (a.routine === "channel" ? 10 : 4), 3, 97), y: restart.spot.y < 34 ? engine.rng.range(5, 16) : engine.rng.range(52, 63) };
    clearSetPieceContext(engine, "THROW_IN_PASS"); setBallOwner(engine, taker, "THROW_IN"); startPassFlight(engine, taker, receiver, { receiver, forward: (receiver.positionNow.x - taker.positionNow.x) * team.direction }, false, { forceQuality: 82 }); emit(engine, "THROW_IN_TAKEN", { side: attackingSide, playerId: taker.id, receiverId: receiver.id, routine: a.routine });
  }
  function resolvePenalty(engine, attackingSide, restart = {}) {
    const team = teamBySide(engine, attackingSide), a = setPieceAssignments(engine, attackingSide, "PENALTY", restart.routine), taker = a.taker || team.players[0];
    if (!taker) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: attackingSide, reason: "NO_PENALTY_TAKER" }); return; }
    taker.positionNow = { x: attackGoalX(team) - team.direction * 11, y: 34 }; if (a.goalkeeper) a.goalkeeper.positionNow = { x: attackGoalX(team) - team.direction * .7, y: 34 };
    team.stats.setPieceShots += 1; clearSetPieceContext(engine, "PENALTY_SHOT"); setBallOwner(engine, taker, "PENALTY"); emit(engine, "PENALTY_TAKEN", { side: attackingSide, playerId: taker.id, goalkeeperId: a.goalkeeper?.id });
    resolveShot(engine, taker, "PENALTY", { shotType: engine.rng.chance(.18) ? "POWER" : "PLACED", targetY: 34 + engine.rng.range(-3.35, 3.35), targetZ: engine.rng.range(.25, 2.05) });
  }

  function resolveRestart(engine) {
    const restart = engine.restart; if (!restart || engine.clockSeconds < restart.executeAt) return; engine.restart = null; const team = teamBySide(engine, restart.side);
    if (restart.type === "KICK_OFF") { clearSetPieceContext(engine, "KICK_OFF"); const striker = team.players.find(player => player.group === "ST") || team.players[9] || team.players.find(player => player.group !== "GK") || team.players[0]; if (!striker) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: restart.side, reason: "NO_ELIGIBLE_PLAYERS" }); return; } striker.positionNow = { x: 50 - team.direction * 1.5, y: 34 }; setBallOwner(engine, striker, "KICK_OFF"); emit(engine, "KICK_OFF", { side: restart.side }); return; }
    if (restart.type === "GOAL_KICK") { clearSetPieceContext(engine, "GOAL_KICK"); const goalkeeper = team.players.find(player => player.group === "GK") || team.players[0]; if (!goalkeeper) { engine.status = "fulltime"; emit(engine, "MATCH_ABANDONED", { side: restart.side, reason: "NO_GOALKEEPER_OR_PLAYERS" }); return; } setBallOwner(engine, goalkeeper, "GOAL_KICK"); emit(engine, "GOAL_KICK", { side: restart.side, playerId: goalkeeper.id }); return; }
    if (restart.type === "CORNER") return resolveCorner(engine, restart.side, restart);
    if (restart.type === "DIRECT_FREE_KICK") return resolveDirectFreeKick(engine, restart.side, restart);
    if (restart.type === "INDIRECT_FREE_KICK") return resolveIndirectFreeKick(engine, restart.side, restart);
    if (restart.type === "THROW_IN") return resolveThrowIn(engine, restart.side, restart);
    if (restart.type === "PENALTY") return resolvePenalty(engine, restart.side, restart);
  }

  function resolveRefereeProfile(input) {
    if (typeof input === "string") return { ...(REFEREE_PROFILES[input] || REFEREE_PROFILES.balanced) };
    const base = REFEREE_PROFILES[input?.id] || REFEREE_PROFILES.balanced;
    return { ...base, ...(input || {}) };
  }

  function createRefereeState(input) {
    const profile = resolveRefereeProfile(input);
    return {
      profile,
      advantage: null,
      pendingCard: null,
      firstHalfDelayBank: 0,
      secondHalfDelayBank: 0,
      firstHalfAdded: null,
      secondHalfAdded: null,
      addedTimeAnnounced: false,
      warnings: new Map(),
      lastFoulAt: -999,
      reviewCount: 0,
      lastBehaviourCheck: -999,
      timeWastingWarnings: { home:0, away:0 },
      dissentRecords: { home:-999, away:-999 }
    };
  }

  function registerRefereeDelay(engine, type, payload = {}) {
    if (!engine.referee) return;
    const base = Number(REFEREE_DELAY_SECONDS[type] || 0);
    if (!base) return;
    const variation = engine.rng.range(.82, 1.18);
    const seconds = base * variation;
    if (engine.clockSeconds < 45 * 60) engine.referee.firstHalfDelayBank += seconds;
    else engine.referee.secondHalfDelayBank += seconds;
  }

  function activeDefendersBehind(engine, attackingSide, point) {
    const attacking = teamBySide(engine, attackingSide);
    const defending = opponentTeam(engine, attackingSide);
    const progress = progressFor(attacking, point.x);
    return defending.players.filter(p => p.group !== "GK" && progressFor(attacking, p.positionNow.x) > progress + 1).length;
  }

  function dismissPlayer(engine, player, reason = "RED_CARD") {
    if (!player || player.sentOff) return;
    const team = teamBySide(engine, player.side);
    player.sentOff = true;
    player.redCard = true;
    player.yellow = false;
    player.hasBall = false;
    player.currentIntent = "SENT_OFF";
    team.dismissedPlayers = team.dismissedPlayers || [];
    team.dismissedPlayers.push({ id:player.id, name:player.name, number:player.number, position:player.position, reason, minute:Math.floor(engine.clockSeconds/60), yellowCards:player.yellowCards || 0 });
    const wasGoalkeeper = player.group === "GK";
    const index = team.players.findIndex(row => row.id === player.id);
    if (index >= 0) team.players.splice(index,1);
    if (wasGoalkeeper) {
      const emergency = team.players.slice().sort((a,b)=>(b.attributes?.jumping||50)+(b.attributes?.handling||0)-(a.attributes?.jumping||50)-(a.attributes?.handling||0))[0];
      if (emergency) {
        emergency.group = "GK"; emergency.position = "GK"; emergency.role = "emergency-goalkeeper";
        emergency.goalkeeper = { ...(GOALKEEPER_ARCHETYPES["line-keeper"] || {}), archetype:"emergency-goalkeeper" };
        emergency.positionNow = { x: ownGoalX(team) + team.direction * 5.5, y:34 };
        emergency.anchor = { ...emergency.positionNow }; emergency.targetPosition = { ...emergency.positionNow };
        emit(engine, "OUTFIELD_GOALKEEPER", { side:team.side, playerId:emergency.id, dismissedGoalkeeperId:player.id });
      }
    }
    if (engine.ball.ownerId === player.id) {
      const receiver = nearestPlayers(opponentTeam(engine, player.side).players, engine.ball.position, 1)[0]?.player;
      if (receiver) changePossession(engine, receiver, "RED_CARD_POSSESSION");
    }
  }

  function issueRefereeSanction(engine, sanction) {
    if (!sanction?.offenderId) return null;
    const offender = getPlayer(engine, sanction.offenderId);
    if (!offender || offender.sentOff) return null;
    const team = teamBySide(engine, offender.side);
    const profile = engine.referee.profile;
    let card = sanction.card;
    if (!card) {
      const severity=Number(sanction.severity||0);
      const directRed=Boolean(sanction.denialOfGoalOpportunity || severity >= Math.max(98, profile.redThreshold + 5));
      const tacticalYellow=Boolean(sanction.tactical && severity >= profile.yellowThreshold - 8);
      if (directRed) card = "RED";
      else if (severity >= profile.yellowThreshold || tacticalYellow) card = "YELLOW";
      else return null;
    }
    if (card === "WARNING") {
      team.stats.refereeWarnings += 1;
      emit(engine, "REFEREE_WARNING", { side:offender.side, playerId:offender.id, reason:sanction.reason, severity:Math.round(sanction.severity || 0) });
      return card;
    }
    if (card === "YELLOW") {
      const currentYellows=Number(offender.yellowCards||0);
      const severity=Number(sanction.severity||0);
      const behaviouralSecond=["DISSENT","TIME_WASTING"].includes(String(sanction.reason||""));
      const secondYellowEligible=severity>=profile.yellowThreshold+18 || behaviouralSecond || Boolean(sanction.denialOfGoalOpportunity);
      if(currentYellows>=1 && !secondYellowEligible){
        team.stats.refereeWarnings += 1;
        emit(engine,"REFEREE_WARNING",{side:offender.side,playerId:offender.id,reason:"FINAL_WARNING",severity:Math.round(severity)});
        return "FINAL_WARNING";
      }
      offender.yellowCards = currentYellows + 1;
      offender.yellow = true;
      team.stats.yellow += 1;
      team.stats.yellowCards += 1;
      emit(engine, "YELLOW_CARD", { side:offender.side, playerId:offender.id, reason:sanction.reason, severity:Math.round(sanction.severity || 0), yellowCards:offender.yellowCards });
      if (offender.yellowCards >= 2) {
        team.stats.red += 1; team.stats.redCards += 1; team.stats.secondYellowCards += 1;
        emit(engine, "SECOND_YELLOW", { side:offender.side, playerId:offender.id, reason:sanction.reason });
        emit(engine, "RED_CARD", { side:offender.side, playerId:offender.id, reason:"SECOND_YELLOW" });
        dismissPlayer(engine, offender, "SECOND_YELLOW");
        return "SECOND_YELLOW";
      }
      return card;
    }
    team.stats.red += 1; team.stats.redCards += 1;
    emit(engine, "RED_CARD", { side:offender.side, playerId:offender.id, reason:sanction.reason, severity:Math.round(sanction.severity || 0), denialOfGoalOpportunity:Boolean(sanction.denialOfGoalOpportunity) });
    dismissPlayer(engine, offender, sanction.reason || "RED_CARD");
    return card;
  }

  function foulSeverity(engine, offender, victim, context = {}) {
    const defendingTeam = teamBySide(engine, offender.side);
    const attackingTeam = teamBySide(engine, victim.side);
    const pressure = pressureAt(engine, victim);
    const aggression = Number(offender.behaviour?.aggression || offender.attributes?.aggression || 50);
    const tackleRisk = Number(defendingTeam.tactics?.tacklingRisk || 50);
    const progress = progressFor(attackingTeam, victim.positionNow.x);
    const defendersBehind = activeDefendersBehind(engine, victim.side, victim.positionNow);
    const tactical = Boolean(
      (context.transition && progress > 58 && defendersBehind <= 3 && pressure > 30) ||
      (progress > 70 && defendersBehind <= 2 && pressure > 38)
    );
    const centrality = 1 - Math.min(1, Math.abs(Number(victim.positionNow?.y || 34) - 34) / 34);
    const attackingControl = Boolean(victim.hasBall || engine.ball.ownerId === victim.id);
    const denialOfGoalOpportunity = Boolean(
      progress > 91 && defendersBehind === 0 && centrality > .72 && attackingControl &&
      context.transition && !context.penalty && ["ST","AM"].includes(victim.group)
    );
    let severity = 22 + aggression * .12 + tackleRisk * .10 + pressure * .07 + Number(context.intensity || 0) * 18 + engine.rng.range(-15,15);
    if (tactical) severity += 6;
    if (denialOfGoalOpportunity) severity += 18;
    if (context.reckless) severity += 25;
    if (context.fromBehind) severity += 10;
    return { severity:clamp(severity,0,100), tactical, denialOfGoalOpportunity };
  }

  function finalizeFoulDecision(engine, decision, stopPlay = true) {
    const offender = getPlayer(engine, decision.offenderId);
    const victim = getPlayer(engine, decision.victimId);
    if (!offender || !victim) return false;
    const defending = teamBySide(engine, offender.side);
    const attacking = teamBySide(engine, victim.side);
    defending.stats.fouls += 1; defending.stats.foulsCommitted += 1;
    attacking.stats.foulsSuffered += 1;
    offender.foulsCommitted = Number(offender.foulsCommitted || 0) + 1;
    victim.foulsSuffered = Number(victim.foulsSuffered || 0) + 1;
    if (decision.tactical) defending.stats.tacticalFouls += 1;
    if (decision.severity >= 74) defending.stats.dangerousFouls += 1;
    if (decision.penalty) defending.stats.penaltiesConceded += 1;
    engine.referee.lastFoulAt = engine.clockSeconds;
    emit(engine, "FOUL", { side:offender.side, playerId:offender.id, victimId:victim.id, penalty:Boolean(decision.penalty), severity:Math.round(decision.severity), tactical:Boolean(decision.tactical), denialOfGoalOpportunity:Boolean(decision.denialOfGoalOpportunity) });
    if (stopPlay) {
      issueRefereeSanction(engine, decision);
      if (decision.penalty) schedulePenalty(engine, victim.side, "REFEREE_PENALTY");
      else scheduleFreeKick(engine, victim.side, decision.spot, "REFEREE_FOUL");
    }
    return true;
  }

  function startAdvantage(engine, decision) {
    const attacking = teamBySide(engine, decision.victimSide);
    attacking.stats.advantagesPlayed += 1;
    engine.referee.advantage = {
      ...decision,
      startedAt:engine.clockSeconds,
      expiresAt:engine.clockSeconds + engine.rng.range(3.4,5.2),
      startProgress:progressFor(attacking, decision.spot.x)
    };
    emit(engine, "ADVANTAGE_PLAYED", { side:decision.victimSide, offenderId:decision.offenderId, victimId:decision.victimId, severity:Math.round(decision.severity) });
    return true;
  }

  function refereeBehaviourChecks(engine) {
    const referee = engine.referee;
    if (!referee || engine.clockSeconds - referee.lastBehaviourCheck < 30) return;
    referee.lastBehaviourCheck = engine.clockSeconds;
    const minute = engine.clockSeconds / 60;
    if (minute < 65) return;
    ["home","away"].forEach(side => {
      const team = teamBySide(engine, side);
      const state = engine.managerStates?.[side];
      const wasting = Number(state?.timeWasting || 0);
      if (wasting > referee.profile.timeWastingTolerance && engine.rng.chance((wasting-referee.profile.timeWastingTolerance)/240)) {
        const candidate = team.players.find(p=>p.group==="GK" && Number(p.yellowCards||0)===0) || team.players.find(p=>Number(p.yellowCards||0)===0) || team.players[0];
        const warnings = referee.timeWastingWarnings[side] = Number(referee.timeWastingWarnings[side]||0)+1;
        if (warnings === 1) issueRefereeSanction(engine,{offenderId:candidate?.id,card:"WARNING",reason:"TIME_WASTING",severity:38});
        else issueRefereeSanction(engine,{offenderId:candidate?.id,card:"YELLOW",reason:"TIME_WASTING",severity:66});
        team.stats.timeWastingSeconds += engine.rng.range(8,18);
      }
      const leader = getPlayer(engine, team.defensiveLeaderId) || team.players.find(p=>p.group==="CM") || team.players[0];
      const emotional = Number(leader?.behaviour?.aggression || 50) + (100-Number(leader?.attributes?.composure || 60));
      if (engine.clockSeconds-referee.dissentRecords[side] > 8*60 && emotional > referee.profile.dissentTolerance+55 && engine.rng.chance((emotional-referee.profile.dissentTolerance-45)/1300)) {
        referee.dissentRecords[side]=engine.clockSeconds;
        team.stats.dissentCards += 1;
        issueRefereeSanction(engine,{offenderId:leader?.id,card:referee.profile.strictness>68?"YELLOW":"WARNING",reason:"DISSENT",severity:58});
      }
    });
  }

  function updateRefereeState(engine) {
    const referee = engine.referee;
    if (!referee) return;
    refereeBehaviourChecks(engine);
    if (referee.firstHalfAdded == null && engine.clockSeconds >= 44.5*60) {
      referee.firstHalfAdded = Math.round(clamp(referee.firstHalfDelayBank, 45, 240) / 30) * 30;
      emit(engine, "FIRST_HALF_ADDED_TIME", { seconds:referee.firstHalfAdded });
    }
    const advantage = referee.advantage;
    if (advantage) {
      const attacking = teamBySide(engine, advantage.victimSide);
      const currentOwner = getPlayer(engine, engine.ball.ownerId);
      const currentProgress = currentOwner?.side === advantage.victimSide ? progressFor(attacking, currentOwner.positionNow.x) : advantage.startProgress;
      const realized = currentOwner?.side === advantage.victimSide && (engine.activeShotAction || currentProgress >= advantage.startProgress + 5.5 || isInBox(attacking, currentOwner.positionNow));
      const lost = currentOwner && currentOwner.side !== advantage.victimSide;
      if (realized || (engine.clockSeconds >= advantage.expiresAt && !lost)) {
        attacking.stats.advantagesRealized += 1;
        emit(engine, "ADVANTAGE_REALIZED", { side:advantage.victimSide, offenderId:advantage.offenderId, victimId:advantage.victimId });
        issueRefereeSanction(engine, advantage);
        referee.advantage = null;
      } else if (lost || engine.clockSeconds >= advantage.expiresAt) {
        attacking.stats.advantagesRecalled += 1;
        emit(engine, "ADVANTAGE_RECALLED", { side:advantage.victimSide, offenderId:advantage.offenderId, victimId:advantage.victimId });
        issueRefereeSanction(engine, advantage);
        scheduleFreeKick(engine, advantage.victimSide, advantage.spot, "ADVANTAGE_RECALLED");
        referee.advantage = null;
      }
    }
    if (referee.secondHalfAdded == null && engine.clockSeconds >= 88*60) {
      const timeWasting = Number(engine.teams.home.stats.timeWastingSeconds || 0) + Number(engine.teams.away.stats.timeWastingSeconds || 0);
      const strictnessFactor = .45 + referee.profile.strictness / 130;
      referee.secondHalfAdded = Math.round(clamp(referee.secondHalfDelayBank + timeWasting * strictnessFactor, 90, 480) / 30) * 30;
      engine.matchEndSeconds = MATCH_SECONDS + referee.secondHalfAdded;
      engine.teams.home.stats.addedTimeSeconds = referee.secondHalfAdded;
      engine.teams.away.stats.addedTimeSeconds = referee.secondHalfAdded;
    }
    if (!referee.addedTimeAnnounced && referee.secondHalfAdded != null && engine.clockSeconds >= 89.75*60) {
      referee.addedTimeAnnounced = true;
      emit(engine, "ADDED_TIME_ANNOUNCED", { seconds:referee.secondHalfAdded, minutes:Math.round(referee.secondHalfAdded/60) });
    }
  }

  function maybeAwardSetPiece(engine, owner) {
    if (!owner || engine.clockSeconds < 20 || engine.lastPossessionChangeAgo < 1.4 || engine.referee?.advantage) return false;
    const team = teamBySide(engine, owner.side), opponent = opponentTeam(engine, owner.side), pressure = pressureAt(engine, owner), progress = progressFor(team, owner.positionNow.x), wide = isWide(owner.positionNow.y);
    const nearest = nearestPlayers(opponent.players, owner.positionNow, 1)[0]?.player;
    if (!nearest) return false;
    const intensity = pressure * .55 + opponent.tactics.pressing * .22 + nearest.behaviour.aggression * .10 + engine.rng.range(-8, 8);
    const profile = engine.referee.profile;
    const inPenaltyArea = isInBox(team, owner.positionNow);
    const penaltyChance = inPenaltyArea ? clamp((.00014 + Math.max(0, intensity - 54) / 6200) * (profile.penaltySensitivity/55), 0, .0034) : 0;
    const foulChance = clamp((.0031 + pressure / 16800 + (progress > 58 ? .0016 : 0)) * (.72 + profile.strictness/105), .0022, .0155);
    const isPenalty = penaltyChance > 0 && engine.rng.chance(penaltyChance);
    if (isPenalty || engine.rng.chance(foulChance)) {
      const meta = foulSeverity(engine, nearest, owner, { penalty:isPenalty, intensity:clamp(intensity/100,0,1), transition:engine.lastPossessionChangeAgo < 5.5, fromBehind:engine.rng.chance(.12), reckless:engine.rng.chance(.025 + opponent.tactics.tacklingRisk/4200) });
      const decision = { ...meta, offenderId:nearest.id, victimId:owner.id, offenderSide:nearest.side, victimSide:owner.side, spot:{...owner.positionNow}, penalty:isPenalty, reason:isPenalty?"FOUL_IN_BOX":meta.tactical?"TACTICAL_FOUL":"FOUL" };
      const advantageValue = !isPenalty && progress > 48 && engine.ball.ownerId === owner.id && (profile.advantagePreference + team.tactics.tempo*.18 + team.tactics.risk*.12 - pressure*.20) > engine.rng.range(42,92);
      if (advantageValue) {
        finalizeFoulDecision(engine, decision, false);
        return startAdvantage(engine, decision) && false;
      }
      return finalizeFoulDecision(engine, decision, true);
    }
    if (wide && progress > 64 && pressure > 28 && engine.rng.chance(.0032)) { scheduleCorner(engine, owner.side, "WIDE_DEFLECTION", { y: owner.positionNow.y < 34 ? 0 : 68 }); return true; }
    if (engine.rng.chance(wide ? .0072 : .0010)) { scheduleThrowIn(engine, owner.side, owner.positionNow, "DEFLECTION_OUT"); return true; }
    return false;
  }

  function resolveHoldUp(engine, owner) {
    const team = teamBySide(engine, owner.side);
    const opponent = opponentTeam(engine, owner.side);
    const profile = owner.attackProfile || attackingProfile(owner.role, owner.group);
    const marker = nearestPlayers(opponent.players.filter(player => player.group !== "GK"), owner.positionNow, 1)[0];
    team.stats.targetManActions += profile.role === "target-forward" ? 1 : 0;
    team.stats.linkPlayActions += 1;
    owner.currentIntent = profile.role === "false-nine" ? "FALSE_NINE_LINK" : "TARGET_HOLD_UP";
    registerExplosiveLoad(owner, .35);
    if (marker) {
      registerExplosiveLoad(marker.player, .28);
      maybeContactIncident(engine, owner, "HOLD_UP_DUEL", .38);
      maybeContactIncident(engine, marker.player, "HOLD_UP_DUEL", .32);
    }
    const secure = effectiveAttribute(owner, "strength", "physical") * .30 + effectiveAttribute(owner, "firstTouch", "technical") * .24 + effectiveAttribute(owner, "composure", "mental") * .17 + profile.holdUp * .22 + engine.rng.range(-10,10);
    const challenge = marker ?  effectiveAttribute(marker.player, "strength", "physical") * .24 + effectiveAttribute(marker.player, "tackling", "technical") * .22 + marker.player.attributes.aggression * .16 + engine.rng.range(-10,10) : 30;
    if (marker && secure < challenge) {
      changePossession(engine, marker.player, "HOLD_UP_LOST");
      emit(engine, "HOLD_UP_LOST", { side: owner.side, playerId: owner.id, opponentId: marker.player.id, role: profile.role });
    } else {
      const support = findPassOptions(engine, owner).filter(row => row.receiver.group !== "GK")[0];
      emit(engine, "HOLD_UP_SUCCESS", { side: owner.side, playerId: owner.id, role: profile.role, supportId: support?.receiver?.id || null });
      if (support) return resolvePass(engine, owner, support, false);
    }
    engine.nextDecisionIn = engine.rng.range(.8,1.6);
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
    else if (action.type === "HOLD_UP") resolveHoldUp(engine, owner);
    else resolveCarry(engine, owner);
  }


  function managerPlanSnapshot(team, state) {
    return {
      control: state.control,
      profile: state.profile,
      currentPlan: state.currentPlan,
      previousPlan: state.previousPlan,
      lastDecision: state.lastDecision,
      lastReason: state.lastReason,
      substitutionsUsed: state.substitutionsUsed,
      substitutionWindows: state.substitutionWindows,
      recommendations: state.recommendations.slice(-3),
      emergencyMode: state.emergencyMode,
      goalkeeperForward: state.goalkeeperForward,
      timeWasting: state.timeWasting,
      lastReviewAt: state.lastReviewAt,
      nextReviewAt: state.nextReviewAt,
      tactics: { ...team.tactics }
    };
  }

  function recordManagerDecision(engine, team, state, type, reason, payload = {}) {
    const item = { type, reason, side: team.side, second: Math.floor(engine.clockSeconds), minute: Math.floor(engine.clockSeconds/60), ...payload };
    state.lastDecision = type;
    state.lastReason = reason;
    state.decisionHistory.push(item);
    if (state.decisionHistory.length > 40) state.decisionHistory.shift();
    emit(engine, type, item);
    return item;
  }

  function applyManagerPlan(engine, side, planName, reason = "MANAGER_DECISION", options = {}) {
    const team = teamBySide(engine, side);
    const state = engine.managerStates[side];
    const plan = MANAGER_PLANS[planName] || MANAGER_PLANS.BALANCED;
    if (!team || !state) return null;
    if (state.currentPlan === planName && !options.force) return managerPlanSnapshot(team, state);
    state.previousPlan = state.currentPlan;
    state.currentPlan = planName;
    const previousMentality = team.tactics.mentality;
    Object.entries(plan).forEach(([key,value]) => {
      if (key !== "timeWasting") team.tactics[key] = value;
    });
    state.timeWasting = Number(plan.timeWasting || 0);
    team.stats.tacticalChanges += 1;
    if (previousMentality !== team.tactics.mentality) team.stats.mentalityChanges += 1;
    recordManagerDecision(engine, team, state, "TACTICAL_CHANGE", reason, { plan: planName, previousPlan: state.previousPlan });
    engine.nextDecisionIn = Math.min(engine.nextDecisionIn, 0.8);
    return managerPlanSnapshot(team, state);
  }

  function roleCompatibility(group, benchGroup) {
    if (group === benchGroup) return 100;
    const pairs = { FB:["WB","CB"], WB:["FB","WING"], CB:["DM","FB"], DM:["CM","CB"], CM:["DM","AM"], AM:["CM","WING","ST"], WING:["AM","ST","FB"], ST:["WING","AM"] };
    return (pairs[group] || []).includes(benchGroup) ? 68 : 18;
  }

  function chooseSubstitution(engine, side, reasonHint = null) {
  const team = teamBySide(engine, side);
  const state = engine.managerStates[side];
  if (!team || !state || state.substitutionsUsed >= 5 || engine.clockSeconds - state.lastSubstitutionAt < 180) return null;
  const ownerId = engine.ball.ownerId;
  const candidates = team.players.filter(player => player.group !== "GK" && player.id !== ownerId).map(player => {
    const physical = player.physical || {};
    const injuryNeed = physical.availability === "REMOVE" ? 120 : physical.availability === "LIMITED" ? 58 : 0;
    const cardRisk = player.yellow && ["CB","FB","WB","DM"].includes(player.group) ? 38 : 0;
    const fatigueNeed = Math.max(0, 76 - player.energy) * 1.9 + player.fatigue * .48 + Math.max(0, Number(physical.acuteLoad || 0) - 18) * .30;
    const tacticalNeed = reasonHint === "TACTICAL" && ["CM","AM","WING","ST"].includes(player.group) ? 18 : 0;
    return { player, score: injuryNeed + fatigueNeed + cardRisk + tacticalNeed, injuryNeed };
  }).sort((a,b)=>b.score-a.score);
  const outgoing = candidates[0];
  if (!outgoing || (outgoing.score < 18 && !reasonHint)) return null;
  const options = team.bench.filter(row=>!row.used).map(row=>({
    row,
    score: roleCompatibility(outgoing.player.group,row.group) +
      effectiveAttribute(row, "stamina", "physical") * .16 +
      effectiveAttribute(row, "decisions", "mental") * .10 +
      Number(row.physical?.condition || 100) * .08
  })).sort((a,b)=>b.score-a.score);
  const incoming = options[0]?.row;
  if (!incoming || options[0].score < 42) return null;
  const reason = outgoing.injuryNeed > 0 ? "INJURY" : outgoing.player.yellow ? "CARD_RISK" : outgoing.player.energy < 76 ? "FATIGUE" : (reasonHint || "TACTICAL");
  return { outgoing: outgoing.player, incoming, reason };
}
  function makeSubstitution(engine, side, outgoingId, incomingId, reason = "MANAGER_SUBSTITUTION") {
    const team = teamBySide(engine, side);
    const state = engine.managerStates[side];
    const outgoing = team?.players.find(player=>player.id===outgoingId);
    const incoming = team?.bench.find(player=>player.id===incomingId && !player.used);
    if (!team || !state || !outgoing || !incoming || state.substitutionsUsed >= 5 || outgoing.id === engine.ball.ownerId) return null;
    const previous = { name: outgoing.name, sourcePlayerId: outgoing.sourcePlayerId || outgoing.id, role: outgoing.role, attributes: { ...outgoing.attributes }, behaviour: { ...outgoing.behaviour }, physical: outgoing.physical ? { ...outgoing.physical } : null };
    outgoing.sourcePlayerId = incoming.id;
    outgoing.name = incoming.name;
    outgoing.number = incoming.number;
    outgoing.role = incoming.role;
    outgoing.attributes = { ...incoming.attributes };
    outgoing.behaviour = { ...incoming.behaviour };
    outgoing.attackProfile = attackingProfile(outgoing.role, outgoing.group);
    outgoing.identity = { role: outgoing.attackProfile.role, goalHunger: outgoing.behaviour.goalHunger, selfishness: outgoing.behaviour.selfishness, creativity: outgoing.behaviour.creativity, roaming: clamp((outgoing.behaviour.roaming + outgoing.attackProfile.roam)/2,0,100), linkPlay: outgoing.attackProfile.link, runBehind: outgoing.attackProfile.runBehind, boxThreat: outgoing.attackProfile.box };
    outgoing.physical = incoming.physical ? { ...incoming.physical } : createPhysicalProfile(outgoing.group, outgoing.attributes, {}, engine.rng);
    outgoing.physical.status = PHYSICAL_STATUS.FIT;
    outgoing.physical.availability = "AVAILABLE";
    outgoing.physical.discomfort = 0;
    outgoing.energy = outgoing.physical.shortEnergy;
    outgoing.fatigue = outgoing.physical.accumulatedFatigue;
    outgoing.yellow = false;
    incoming.used = true;
    incoming.replaced = previous;
    state.substitutionsUsed += 1;
    const newWindow = engine.clockSeconds - state.lastSubstitutionAt > 90;
    if (newWindow) state.substitutionWindows += 1;
    state.lastSubstitutionAt = engine.clockSeconds;
    team.stats.substitutions += 1;
    team.stats.substitutionWindows = state.substitutionWindows;
    if (reason === "FATIGUE") team.stats.fatigueSubstitutions += 1;
    else if (reason === "CARD_RISK") team.stats.cardRiskSubstitutions += 1;
    else if (reason === "INJURY") { team.stats.injurySubstitutions += 1; emit(engine, "INJURY_SUBSTITUTION", { side, outgoingId, outgoingName: previous.name, incomingId: incoming.id, incomingName: incoming.name, injuryType: previous.physical?.injuryType || null }); }
    else team.stats.tacticalSubstitutions += 1;
    engine.attackingContexts[side] = null;
    engine.defensiveContexts[side] = null;
    recordManagerDecision(engine, team, state, "SUBSTITUTION", reason, { outgoingId, outgoingName: previous.name, incomingId: incoming.id, incomingName: incoming.name, slotId: outgoing.id });
    return { side, outgoing: previous.name, incoming: incoming.name, reason, substitutionsUsed: state.substitutionsUsed };
  }
  function setEmergencyMode(engine, side, enabled, reason = "LATE_GAME") {
    const team = teamBySide(engine, side);
    const state = engine.managerStates[side];
    if (!team || !state || state.emergencyMode === Boolean(enabled)) return;
    state.emergencyMode = Boolean(enabled);
    state.goalkeeperForward = Boolean(enabled && engine.clockSeconds >= 89*60);
    if (enabled) {
      const target = team.players.filter(player=>player.group==="CB").sort((a,b)=>(b.attributes.heading+b.attributes.jumping+b.attributes.strength)-(a.attributes.heading+a.attributes.jumping+a.attributes.strength))[0];
      if (target) {
        team.emergencyTargetId = target.id;
        target.attackProfile = attackingProfile("target-forward", "ST");
        target.identity.role = "target-forward";
        team.stats.emergencyMoves += 1;
        recordManagerDecision(engine, team, state, "EMERGENCY_ATTACK", reason, { playerId: target.id, playerName: target.name, goalkeeperForward: state.goalkeeperForward });
      }
    } else {
      team.emergencyTargetId = null;
      state.goalkeeperForward = false;
    }
  }

  function managerRecommendation(engine, team, state, plan, reason) {
    const key = `${plan}:${reason}`;
    if (state.recommendations.at(-1)?.key === key) return;
    const row = { key, plan, reason, minute: Math.floor(engine.clockSeconds/60) };
    state.recommendations.push(row);
    if (state.recommendations.length > 8) state.recommendations.shift();
    team.stats.aiRecommendations += 1;
    recordManagerDecision(engine, team, state, "MANAGER_RECOMMENDATION", reason, { plan });
  }

  function determineManagerPlan(engine, team) {
    const opponent = opponentTeam(engine, team.side);
    const minute = engine.clockSeconds / 60;
    const deficit = opponent.score - team.score;
    const lead = team.score - opponent.score;
    const shotGap = team.stats.shots - opponent.stats.shots;
    const xgGap = team.stats.xg - opponent.stats.xg;
    if (minute >= 86 && deficit > 0) return { plan:"ALL_OUT", reason:"LATE_GOAL_REQUIRED", emergency:true };
    if (minute >= 78 && deficit > 0) return { plan:"DIRECT_ATTACK", reason:"CHASE_RESULT" };
    if (minute >= 82 && lead > 0) return { plan:"PROTECT_LEAD", reason:"PROTECT_ADVANTAGE" };
    if (minute >= 70 && lead > 0) return { plan:"CONTROL", reason:"CONTROL_MATCH" };
    if (minute >= 62 && deficit >= 2) return { plan:"ALL_OUT", reason:"MULTI_GOAL_DEFICIT", emergency:minute>=80 };
    if (minute >= 55 && deficit > 0) return { plan:"WIDE_ATTACK", reason:"NEED_EQUALISER" };
    if (minute >= 45 && shotGap <= -4 && xgGap < -.55) return { plan:"HIGH_PRESS", reason:"OPPONENT_DOMINANCE" };
    if (minute >= 30 && team.stats.shots <= 2) return { plan:"WIDE_ATTACK", reason:"LOW_CHANCE_CREATION" };
    if (minute >= 25 && team.stats.possession < 38) return { plan:"HIGH_PRESS", reason:"LOW_CONTROL" };
    return { plan:"BALANCED", reason:"MATCH_BALANCE" };
  }

  function reviewManagerAI(engine, side, force = false) {
    const team = teamBySide(engine, side);
    const state = engine.managerStates[side];
    if (!team || !state) return null;
    if (!force && engine.clockSeconds < state.nextReviewAt) return null;
    state.lastReviewAt = engine.clockSeconds;
    state.reviewIndex += 1;
    const minute = engine.clockSeconds/60;
    const nextMinute = MANAGER_REVIEW_MINUTES.find(value=>value>minute) || 90;
    state.nextReviewAt = nextMinute*60;
    team.stats.managerReviews += 1;
    const decision = determineManagerPlan(engine, team);
    if (state.control === "AI") {
      applyManagerPlan(engine, side, decision.plan, decision.reason);
      if (decision.emergency) setEmergencyMode(engine, side, true, decision.reason);
      else if (state.emergencyMode && team.score >= opponentTeam(engine, side).score) setEmergencyMode(engine, side, false, "SCORE_RECOVERED");
      if (minute >= 55) {
        const proposal = chooseSubstitution(engine, side, decision.plan !== "BALANCED" ? "TACTICAL" : null);
        if (proposal) makeSubstitution(engine, side, proposal.outgoing.id, proposal.incoming.id, proposal.reason);
      }
    } else {
      managerRecommendation(engine, team, state, decision.plan, decision.reason);
    }
    return managerPlanSnapshot(team, state);
  }

  function updateManagerAI(engine) {
  reviewManagerAI(engine, "home", false);
  reviewManagerAI(engine, "away", false);
  ["home","away"].forEach(side=>{
    const team=teamBySide(engine,side), state=engine.managerStates[side];
    if (state?.control === "AI" && state.substitutionsUsed < 5 && engine.clockSeconds - state.lastSubstitutionAt >= 180) {
      const injured = team.players.find(player => player.group !== "GK" && player.physical?.availability === "REMOVE" && player.id !== engine.ball.ownerId);
      if (injured) {
        const proposal = chooseSubstitution(engine, side, "INJURY");
        if (proposal) makeSubstitution(engine, side, proposal.outgoing.id, proposal.incoming.id, "INJURY");
      }
    }
    if (state?.control === "HUMAN") {
      const limited = team.players.find(player => ["LIMITED","REMOVE"].includes(player.physical?.availability) && !player.physical?.recommendationSent);
      if (limited) {
        limited.physical.recommendationSent = true;
        managerRecommendation(engine, team, state, "SUBSTITUTION", `${limited.name}: ${limited.physical.injuryType || limited.physical.status}`);
      }
    }
    if (state?.timeWasting>0 && team.score>opponentTeam(engine,side).score && engine.ball.teamSide===side) {
      team.stats.timeWastingSeconds += FIXED_STEP * state.timeWasting/100;
      engine.nextDecisionIn += FIXED_STEP * state.timeWasting/155;
    }
    if (state?.goalkeeperForward && engine.restart?.type==="CORNER" && engine.restart.side===side) {
      const gk=team.players.find(player=>player.group==="GK");
      if (gk) { gk.currentIntent="GOALKEEPER_FORWARD"; gk.positionNow={x:attackGoalX(team)-team.direction*14,y:34}; }
    }
  });
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
      engine.clockSeconds = Math.min(Math.max(MATCH_SECONDS, Number(engine.matchEndSeconds || MATCH_SECONDS)), engine.clockSeconds + FIXED_STEP);
      engine.lastPossessionChangeAgo += FIXED_STEP;
      if (engine.nextDecisionIn < 900) engine.nextDecisionIn -= FIXED_STEP;
      updateManagerAI(engine);
      updateRefereeState(engine);
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
      if (engine.clockSeconds >= Number(engine.matchEndSeconds || MATCH_SECONDS)) {
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
      matchEndSeconds: MATCH_SECONDS,
      accumulator: 0,
      nextDecisionIn: 3.2,
      lastPossessionChangeAgo: 999,
      possessionActions: 0,
      lastShotAt: -999,
      lastCrossAt: -999,
      possessionSide: "home",
      transitionLoss: null,
      defensiveContexts: { home: null, away: null },
      attackingContexts: { home: null, away: null },
      pressRecords: { home: { at: -999, ownerId: null }, away: { at: -999, ownerId: null } },
      cutbackRecords: { home: { at: -999, ownerId: null }, away: { at: -999, ownerId: null } },
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
      referee: createRefereeState(config.refereeProfile || config.referee || "balanced"),
      teams: {
        home: createTeam(config.home || {}, "home", rng),
        away: createTeam(config.away || {}, "away", rng)
      },
      ball: { position: { x: 50, y: 34 }, velocity: { x: 0, y: 0 }, height: 0, ownerId: null, teamSide: "home", reason: "KICK_OFF", state: "RESTART" },
      step(deltaSeconds) { return stepEngine(engine, deltaSeconds); },
      runTo(second, maxIterations = 90000) {
        let guard = 0;
        const target = clamp(Number(second || 0), 0, Math.max(MATCH_SECONDS, Number(engine.matchEndSeconds || MATCH_SECONDS)));
        while (engine.clockSeconds < target && engine.status === "live" && guard++ < maxIterations) stepEngine(engine, Math.min(2, target - engine.clockSeconds));
        return engine.getSnapshot();
      },
      runFullMatch() { let guard=0; while(engine.status === "live" && guard++ < 220000) stepEngine(engine, 2); return engine.getSnapshot(); },
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
      applyTacticalPlan(side, planName, reason = "MANUAL_TACTICAL_CHANGE") { return applyManagerPlan(engine, side, String(planName || "BALANCED").toUpperCase(), reason, { force:true }); },
      makeSubstitution(side, outgoingId, incomingId, reason = "MANUAL_SUBSTITUTION") { return makeSubstitution(engine, side, outgoingId, incomingId, reason); },
      reviewManager(side, force = true) { return reviewManagerAI(engine, side, force); },
      setManagerControl(side, control) { if (!engine.managerStates[side]) return null; engine.managerStates[side].control = String(control || "AI").toUpperCase(); return managerPlanSnapshot(engine.teams[side], engine.managerStates[side]); },
      debugSetScore(home, away) { engine.teams.home.score=Math.max(0,Number(home)||0); engine.teams.away.score=Math.max(0,Number(away)||0); return engine.getSnapshot(); },
      debugSetPlayerEnergy(playerId, energy) { const player=getPlayer(engine,playerId); if(!player) throw new Error("invalid player"); if(player.physical){ player.physical.shortEnergy=clamp(Number(energy),20,100); player.physical.accumulatedFatigue=clamp((100-player.physical.shortEnergy)/1.55,0,100); syncPhysicalLegacy(player); } else { player.energy=clamp(Number(energy),20,100); player.fatigue=clamp((100-player.energy)/.92,0,100); } return engine.getSnapshot(); },
      debugSetPlayerPhysical(playerId, physical = {}) { const player=getPlayer(engine,playerId); if(!player) throw new Error("invalid player"); Object.assign(player.physical, physical); syncPhysicalLegacy(player); return engine.getSnapshot(); },
      debugInjurePlayer(playerId, status = "INJURED", source = "DEBUG_INJURY") { const player=getPlayer(engine,playerId); if(!player) throw new Error("invalid player"); return applyPhysicalIncident(engine, player, PHYSICAL_STATUS[String(status).toUpperCase()] || PHYSICAL_STATUS.INJURED, source, { severity: status === "INJURED" ? 72 : 32 }); },
      debugSetPlayerYellow(playerId, yellow = true) { const player=getPlayer(engine,playerId); if(!player) throw new Error("invalid player"); player.yellow=Boolean(yellow); player.yellowCards=yellow?Math.max(1,Number(player.yellowCards||0)):0; return engine.getSnapshot(); },
      debugIssueCard(playerId, card = "YELLOW", reason = "DEBUG_CARD") { const player=getPlayer(engine,playerId); if(!player) throw new Error("invalid player"); issueRefereeSanction(engine,{offenderId:player.id,card:String(card).toUpperCase(),reason,severity:card==="RED"?99:70}); return engine.getSnapshot(); },
      debugAwardFoul(offenderId, victimId, options = {}) { const offender=getPlayer(engine,offenderId), victim=getPlayer(engine,victimId); if(!offender||!victim||offender.side===victim.side) throw new Error("debugAwardFoul requires opponents"); const meta=foulSeverity(engine,offender,victim,{...options,intensity:Number(options.intensity??.7)}); const decision={...meta,...options,offenderId:offender.id,victimId:victim.id,offenderSide:offender.side,victimSide:victim.side,spot:{...(options.spot||victim.positionNow)},penalty:Boolean(options.penalty),reason:options.reason||"DEBUG_FOUL"}; if(options.advantage){finalizeFoulDecision(engine,decision,false);startAdvantage(engine,decision);} else finalizeFoulDecision(engine,decision,true); return engine.getSnapshot(); },
      debugSetClock(second) { engine.clockSeconds=clamp(Number(second||0),0,120*60); updateRefereeState(engine); return engine.getSnapshot(); },
      debugAddRefereeDelay(seconds, half = "second") { if(String(half).toLowerCase().startsWith("first")) engine.referee.firstHalfDelayBank+=Math.max(0,Number(seconds)||0); else engine.referee.secondHalfDelayBank+=Math.max(0,Number(seconds)||0); return engine.getSnapshot(); },
      debugSetTimeWasting(side, value) { if(!engine.managerStates[side]) throw new Error("invalid side"); engine.managerStates[side].timeWasting=clamp(Number(value),0,100); engine.referee.lastBehaviourCheck=-999; refereeBehaviourChecks(engine); return engine.getSnapshot(); },
      debugRefereeUpdate() { updateRefereeState(engine); return engine.getSnapshot(); },
      debugSetPlayerPosition(playerId, point = {}) {
        const player = getPlayer(engine, playerId);
        if (!player) throw new Error("debugSetPlayerPosition requires a valid player");
        player.positionNow = { x: clamp(Number(point.x), 1, 99), y: clamp(Number(point.y), 2, 66) };
        player.previousPosition = { ...player.positionNow };
        player.targetPosition = { ...player.positionNow };
        player.velocity = { x: 0, y: 0 };
        if (player.hasBall) engine.ball.position = { ...player.positionNow };
        return engine.getSnapshot();
      },
      debugSetBallOwner(playerId, reason = "DEBUG_POSSESSION") {
        const player = getPlayer(engine, playerId);
        if (!player) throw new Error("debugSetBallOwner requires a valid player");
        engine.restart = null; engine.activeSetPieceAction = null; engine.setPieceContext = null;
        setBallOwner(engine, player, reason);
        updateDefensiveContexts(engine);
        return engine.getSnapshot();
      },
      debugChangePossession(playerId, reason = "DEBUG_CHANGE") {
        const player = getPlayer(engine, playerId);
        if (!player) throw new Error("debugChangePossession requires a valid player");
        engine.restart = null; engine.activeSetPieceAction = null; engine.setPieceContext = null;
        changePossession(engine, player, reason);
        updateDefensiveContexts(engine);
        return engine.getSnapshot();
      },
      debugSetBallReason(reason = "DEBUG") { engine.ball.reason = String(reason); updateDefensiveContexts(engine); return engine.getSnapshot(); },
      debugRefreshDefence() { updateDefensiveContexts(engine); updatePlayerMovement(engine, 0.01); return engine.getSnapshot(); },
      debugRefreshAttack() { updateAttackingContexts(engine); updatePlayerMovement(engine, 0.01); return engine.getSnapshot(); },
      debugSetRole(playerId, role) {
        const player = getPlayer(engine, playerId); if (!player) throw new Error("debugSetRole requires a valid player");
        player.role = String(role); player.attackProfile = attackingProfile(player.role, player.group); player.identity.role = player.attackProfile.role;
        updateAttackingContexts(engine); updatePlayerMovement(engine, .01); return engine.getSnapshot();
      },
      debugChooseAction(playerId) { const player = getPlayer(engine, playerId); if (!player) throw new Error("debugChooseAction requires a valid player"); return chooseAction(engine, player); },
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
          shadowPenalty: engine.activeBallAction.shadowPenalty || 0,
          forcedByPress: Boolean(engine.activeBallAction.forcedByPress),
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
          },
          defensiveAI: {
            home: defensiveContextSnapshot(engine.defensiveContexts?.home),
            away: defensiveContextSnapshot(engine.defensiveContexts?.away)
          },
          attackingAI: {
            home: attackingContextSnapshot(engine.attackingContexts?.home),
            away: attackingContextSnapshot(engine.attackingContexts?.away)
          },
          managerAI: {
            home: { ...managerPlanSnapshot(engine.teams.home, engine.managerStates.home), bench: engine.teams.home.bench.filter(row=>!row.used).map(row=>({id:row.id,name:row.name,group:row.group,role:row.role,energy:row.energy})) },
            away: { ...managerPlanSnapshot(engine.teams.away, engine.managerStates.away), bench: engine.teams.away.bench.filter(row=>!row.used).map(row=>({id:row.id,name:row.name,group:row.group,role:row.role,energy:row.energy})) }
          },
          referee: { profile:{...engine.referee.profile}, advantage:engine.referee.advantage?{...engine.referee.advantage}:null, firstHalfAdded:engine.referee.firstHalfAdded, secondHalfAdded:engine.referee.secondHalfAdded, matchEndSeconds:engine.matchEndSeconds }
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
          attackingIdentity: {
            home: engine.teams.home.players.map(player => ({ id: player.id, name: player.name, role: player.attackProfile?.role, intent: player.currentIntent })),
            away: engine.teams.away.players.map(player => ({ id: player.id, name: player.name, role: player.attackProfile?.role, intent: player.currentIntent }))
          },
          managerAI: {
            home: { ...managerPlanSnapshot(engine.teams.home, engine.managerStates.home), history: [...engine.managerStates.home.decisionHistory] },
            away: { ...managerPlanSnapshot(engine.teams.away, engine.managerStates.away), history: [...engine.managerStates.away.decisionHistory] }
          },
          referee: { profile:{...engine.referee.profile}, firstHalfAdded:engine.referee.firstHalfAdded, secondHalfAdded:engine.referee.secondHalfAdded, matchEndSeconds:engine.matchEndSeconds },
          events: [...engine.events]
        };
      }
    };
    engine.managerStates = {
      home: createManagerState(engine.teams.home),
      away: createManagerState(engine.teams.away)
    };
    engine.teams.home.managerState = engine.managerStates.home;
    engine.teams.away.managerState = engine.managerStates.away;
    restartKickoff(engine, "home");
    return engine;
  }

  function attackingContextSnapshot(context) {
    if (!context) return { active: false, assignments: {}, relationships: {} };
    return {
      active: Boolean(context.active), side: context.side, phase: context.phase, ownerId: context.ownerId || null,
      assignments: { ...(context.assignments || {}) }, blindSideRunnerId: context.blindSideRunnerId || null,
      linkPlayerId: context.linkPlayerId || null, widthHolderId: context.widthHolderId || null,
      relationships: { ...(context.relationships || {}) }, generatedAt: Number(context.generatedAt || 0)
    };
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
    physical: physicalTeamSummary(team),
    emergencyTargetId: team.emergencyTargetId,
    dismissedPlayers: [...(team.dismissedPlayers || [])],
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
      condition: Math.round(Number(player.physical?.condition || 100) * 10) / 10,
      shortTermEnergy: Math.round(Number(player.physical?.shortEnergy ?? player.energy) * 10) / 10,
      accumulatedFatigue: Math.round(Number(player.physical?.accumulatedFatigue ?? player.fatigue) * 10) / 10,
      physicalStatus: player.physical?.status || PHYSICAL_STATUS.FIT,
      availability: player.physical?.availability || "AVAILABLE",
      discomfort: Math.round(Number(player.physical?.discomfort || 0)),
      injuryType: player.physical?.injuryType || null,
      performanceModifier: Math.round(physicalPerformanceModifier(player) * 1000) / 1000,
      totalDistance: Math.round(Number(player.physical?.totalDistance || 0)),
      sprintDistance: Math.round(Number(player.physical?.sprintDistance || 0)),
      highIntensityRuns: Number(player.physical?.highIntensityRuns || 0),
      matchLoad: Math.round(Number(player.physical?.matchLoad || 0) * 10) / 10,
      yellowCards: Number(player.yellowCards || 0),
      redCard: Boolean(player.redCard),
      foulsCommitted: Number(player.foulsCommitted || 0),
      foulsSuffered: Number(player.foulsSuffered || 0),
      goalkeeperArchetype: player.goalkeeper?.archetype || null,
      attackRole: player.attackProfile?.role || player.role,
      attackProfile: player.attackProfile ? { ...player.attackProfile } : null,
      identity: player.identity ? { ...player.identity } : null
    }))
  };
}
  function createDefaultConfig(overrides = {}) {
    return {
      matchId: overrides.matchId || "v4-demo",
      mode: overrides.mode || "FULL_SIMULATION",
      seed: overrides.seed || "v4-demo-seed",
      refereeProfile: overrides.refereeProfile || "balanced",
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
    DEFENSIVE_PRESSING_VERSION: 6,
    ATTACKING_IDENTITY_VERSION: 7,
    MANAGER_AI_VERSION: 8,
    PHYSICAL_CONDITION_VERSION: 9,
    REFEREE_DISCIPLINE_VERSION: 10,
    PHYSICAL_STATUS,
    PHYSICAL_LOAD,
    MANAGER_PLANS,
    MANAGER_REVIEW_MINUTES,
    PRESSING_TRIGGERS,
    ATTACKING_ROLE_PROFILES,
    ATTACKING_INTENTS,
    RUN_EPISODE_INTENTS,
    SET_PIECE_ROUTINES,
    REFEREE_PROFILES
  });

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof globalThis !== "undefined") globalThis.FIFA_MATCH_ENGINE_V4 = API;
})();
(() => {
  "use strict";

  const VERSION = "4.0.0-phase10-authority.1";
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
      setPieceRisk: Number(plan.setPieces?.risk || plan.setPieceRisk || 52),
      pressingTrap: plan.defence?.pressingTrap || plan.pressingTrap || "auto",
      defensiveWidth: clamp(Number(plan.defence?.width || plan.defensiveWidth || width), 28, 82),
      offsideTrap: plan.defence?.offsideTrap !== false && plan.offsideTrap !== false && out !== "low-block",
      counterPressWindow: clamp(Number(plan.defence?.counterPressWindow || plan.counterPressWindow || 5.5), 3, 8),
      boxDefence: plan.defence?.boxDefence || plan.boxDefence || "hybrid",
      tacklingRisk: clamp(Number(plan.defence?.tacklingRisk || plan.tacklingRisk || risk), 25, 85)
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

  function readNumber(source, keys, fallback = undefined) {
    for (const key of keys) { const value = source?.[key] ?? source?.attributes?.[key] ?? source?.stats?.[key]; if (Number.isFinite(Number(value))) return Number(value); }
    return fallback;
  }

  function extractTeamPlayers(team = {}) {
    const list = [team.startingXI, team.lineup, team.starters, team.players, team.squad].find(Array.isArray) || [];
    return list.filter(Boolean).slice(0, 18).map((player, index) => {
      const attributes = {};
      const aliases = {
        pace:["pace","speed"], acceleration:["acceleration","accel"], stamina:["stamina","fitness"], strength:["strength","physical"], agility:["agility"],
        passing:["passing","pass"], vision:["vision","creativity"], technique:["technique","technical"], firstTouch:["firstTouch","first_touch","control"], dribbling:["dribbling","dribble"],
        finishing:["finishing","shooting"], longShots:["longShots","long_shots"], crossing:["crossing","cross"], tackling:["tackling","tackle"], marking:["marking"],
        heading:["heading"], jumping:["jumping","jump"], decisions:["decisions","decision"], anticipation:["anticipation"], composure:["composure"], concentration:["concentration"],
        bravery:["bravery"], offBall:["offBall","off_ball","movement"], positioning:["positioning"], teamwork:["teamwork"], workRate:["workRate","work_rate"]
      };
      Object.entries(aliases).forEach(([key, keys]) => { const value = readNumber(player, keys); if (value !== undefined) attributes[key] = clamp(value, 35, 96); });
      return {
        id: player.id || player.playerId || `player-${index+1}`,
        name: player.name || player.playerName || player.displayName || `Player ${index+1}`,
        number: player.number || player.shirtNumber || index+1,
        role: player.role || player.playerRole || null,
        attributes,
        behaviour: player.behaviour || player.personality || undefined,
        physical: {
          condition: readNumber(player, ["condition","matchCondition","fitness","match_fitness"]) ?? 100,
          naturalFitness: readNumber(player, ["naturalFitness","natural_fitness"]) ?? undefined,
          injuryProneness: readNumber(player, ["injuryProneness","injury_proneness"]) ?? undefined
        }
      };
    });
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
      seed: `${career.id}|${fixture.id}|ME4-PHASE10`,
      refereeProfile: fixture.refereeProfile || fixture.matchEngine?.refereeProfile || career.settings?.refereeProfile || "balanced",
      home: {
        id: fixture.homeId,
        name: homeActor.clubName || homeTeam.clubName || fixture.homeTeam || "Home",
        rating: Number(homeTeam.overall || homeTeam.ovr || 80),
        managerControl: plans.humanSide === "home" ? "HUMAN" : "AI",
        managerProfile: homeActor.managerProfile || homeActor.styleSeed?.managerProfile || "adaptive",
        formation: plans.home.formation || "4-3-3",
        players: extractTeamPlayers(homeTeam),
        roles: roleMap(plans.home),
        goalkeeperArchetype: inferGoalkeeper(plans.home),
        tactics: mapTactics(plans.home, homeActor)
      },
      away: {
        id: fixture.awayId,
        name: awayActor.clubName || awayTeam.clubName || fixture.awayTeam || "Away",
        rating: Number(awayTeam.overall || awayTeam.ovr || 80),
        managerControl: plans.humanSide === "away" ? "HUMAN" : "AI",
        managerProfile: awayActor.managerProfile || awayActor.styleSeed?.managerProfile || "adaptive",
        formation: plans.away.formation || "4-2-3-1",
        players: extractTeamPlayers(awayTeam),
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
    runtime.engine.setBallAuthority(false, { source: "PHASE7_FULL_AUTHORITY", nextDecisionIn: 0.8 });
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
      "carries", "dribblesAttempted", "dribblesCompleted", "corners", "cornerShots", "cornerGoals", "freeKicks", "directFreeKicks", "indirectFreeKicks", "freeKickShots", "freeKickGoals", "throwIns", "penaltiesTaken", "penaltiesScored", "penaltiesSaved", "penaltiesMissed", "setPieceShots", "setPieceGoals", "setPieceSecondBalls", "aerialDuels", "aerialDuelsWon", "defensiveAerialDuels", "defensiveAerialDuelsWon", "clearances", "goalkeeperClaims", "goalkeeperPunches", "goalkeeperMissedClaims", "tacklesAttempted", "tacklesWon",
      "pressures", "successfulPressures", "pressureRegains", "forcedTurnovers", "forcedErrors", "doubleTeams", "passingLanesBlocked", "counterPressRegains", "transitionDelays", "offsideTraps", "offsidesWon", "cutbacksDefended", "boxEntriesDenied", "defensiveLineBreaks", "offsides",
      "attackingRuns", "blindSideRuns", "overlaps", "underlaps", "halfSpaceRuns", "widthRuns", "boxRuns", "falseNineDrops", "linkPlayActions", "targetManActions", "defenderCarries", "creativePasses", "killerPassesAttempted", "progressiveCarries", "decoyRuns", "roleShots", "managerReviews", "tacticalChanges", "mentalityChanges", "substitutions", "substitutionWindows", "fatigueSubstitutions", "cardRiskSubstitutions", "tacticalSubstitutions", "emergencyMoves", "timeWastingSeconds", "aiRecommendations", "totalDistance", "sprintDistance", "highIntensityRuns", "physicalLoad", "recoverySeconds", "fatigueWarnings", "cramps", "knocks", "muscleTightness", "muscleInjuries", "contactInjuries", "injurySubstitutions", "playersInjured", "conditionDrops", "fouls", "yellow", "red", "foulsCommitted", "foulsSuffered", "yellowCards", "redCards", "secondYellowCards", "tacticalFouls", "dangerousFouls", "penaltiesConceded", "advantagesPlayed", "advantagesRealized", "advantagesRecalled", "refereeWarnings", "dissentCards", "addedTimeSeconds", "possession"
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
    const visibleTypes = new Set(["SHOT", "SHOT_BLOCKED", "SHOT_OFF_TARGET", "WOODWORK", "SAVE_HELD", "SAVE_PARRIED", "REBOUND", "GOAL", "CORNER_AWARDED", "SET_PIECE_ORGANIZED", "SET_PIECE_DELIVERY", "DIRECT_FREE_KICK_AWARDED", "INDIRECT_FREE_KICK_AWARDED", "THROW_IN_AWARDED", "PENALTY_AWARDED", "DIRECT_FREE_KICK_TAKEN", "PENALTY_TAKEN", "GOALKEEPER_CLAIM", "GOALKEEPER_PUNCH", "AERIAL_DUEL_WON", "SET_PIECE_CLEARED", "SET_PIECE_COUNTER_STARTED", "PRESS_TRIGGERED", "PRESS_BROKEN", "COUNTER_PRESS_REGAIN", "OFFSIDE", "CUTBACK_DEFENDED", "ATTACKING_ROLE_RUN", "KILLER_PASS_ATTEMPT", "HOLD_UP_SUCCESS", "HOLD_UP_LOST", "TACTICAL_CHANGE", "SUBSTITUTION", "EMERGENCY_ATTACK", "MANAGER_RECOMMENDATION", "FATIGUE_WARNING", "CRAMP", "KNOCK", "MUSCLE_TIGHTNESS", "MUSCLE_INJURY", "CONTACT_INJURY", "INJURY_SUBSTITUTION", "PLAYER_RECOVERED", "ADVANTAGE_PLAYED", "ADVANTAGE_REALIZED", "ADVANTAGE_RECALLED", "REFEREE_WARNING", "YELLOW_CARD", "SECOND_YELLOW", "RED_CARD", "ADDED_TIME_ANNOUNCED", "FIRST_HALF_ADDED_TIME"]);
    if (!visibleTypes.has(event.type)) return;
    const labels = {
      SHOT: "ŞUT", SHOT_BLOCKED: "ŞUT BLOKE", SHOT_OFF_TARGET: "ŞUT DIŞARI", WOODWORK: "DİREK",
      SAVE_HELD: "KALECİ TUTTU", SAVE_PARRIED: "KALECİ ÇELDİ", REBOUND: "DÖNEN TOP", GOAL: "GOL",
      CORNER_AWARDED: "KORNER", SET_PIECE_ORGANIZED: "DURAN TOP ORGANİZASYONU", SET_PIECE_DELIVERY: "DURAN TOP SERVİSİ",
      DIRECT_FREE_KICK_AWARDED: "DİREKT SERBEST VURUŞ", INDIRECT_FREE_KICK_AWARDED: "ENDİREKT SERBEST VURUŞ", THROW_IN_AWARDED: "TAÇ", PENALTY_AWARDED: "PENALTI",
      DIRECT_FREE_KICK_TAKEN: "SERBEST VURUŞ KULLANILDI", PENALTY_TAKEN: "PENALTI KULLANILDI", GOALKEEPER_CLAIM: "KALECİ ÇIKIŞI", GOALKEEPER_PUNCH: "KALECİ YUMRUKLADI",
      AERIAL_DUEL_WON: "HAVA TOPU KAZANILDI", SET_PIECE_CLEARED: "DURAN TOP UZAKLAŞTIRILDI", SET_PIECE_COUNTER_STARTED: "KONTRA BAŞLADI",
      PRESS_TRIGGERED: "PRES TETİKLENDİ", PRESS_BROKEN: "PRES KIRILDI", COUNTER_PRESS_REGAIN: "KARŞI PRES KAZANIMI", OFFSIDE: "OFSAYT", CUTBACK_DEFENDED: "GERİ PAS SAVUNULDU", ATTACKING_ROLE_RUN: "ROL KOŞUSU", KILLER_PASS_ATTEMPT: "ÖLDÜRÜCÜ PAS DENEMESİ", HOLD_UP_SUCCESS: "TOP SAKLANDI", HOLD_UP_LOST: "SIRTI DÖNÜK TOP KAYBI", TACTICAL_CHANGE: "TAKTİK DEĞİŞİKLİĞİ", SUBSTITUTION: "OYUNCU DEĞİŞİKLİĞİ", EMERGENCY_ATTACK: "ACİL HÜCUM PLANI", MANAGER_RECOMMENDATION: "MENAJER ÖNERİSİ",
      FATIGUE_WARNING: "YORGUNLUK UYARISI", CRAMP: "KRAMP", KNOCK: "DARBE", MUSCLE_TIGHTNESS: "KAS GERGİNLİĞİ",
      MUSCLE_INJURY: "KAS SAKATLIĞI", CONTACT_INJURY: "TEMAS SAKATLIĞI", INJURY_SUBSTITUTION: "SAKATLIK DEĞİŞİKLİĞİ", PLAYER_RECOVERED: "OYUNCU TOPARLANDI", ADVANTAGE_PLAYED:"AVANTAJ OYNATILDI", ADVANTAGE_REALIZED:"AVANTAJ DEVAM ETTİ", ADVANTAGE_RECALLED:"AVANTAJ GERİ ÇAĞRILDI", REFEREE_WARNING:"HAKEM UYARISI", YELLOW_CARD:"SARI KART", SECOND_YELLOW:"İKİNCİ SARI KART", RED_CARD:"KIRMIZI KART", ADDED_TIME_ANNOUNCED:"UZATMA SÜRESİ", FIRST_HALF_ADDED_TIME:"İLK YARI UZATMASI"
    };
    const item = {
      id: `me4p10-${event.id}`,
      source: "ME4_PHASE10",
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
      defensiveIntelligenceOfficial: true,
      pressingOfficial: true,
      offsideLineOfficial: true,
      attackingIdentityOfficial: true,
      roleMovementOfficial: true,
      boxOccupationOfficial: true,
      managerAIOfficial: true,
      substitutionsOfficial: true,
      matchManagementOfficial: true,
      refereeOfficial: true,
      cardsOfficial: true,
      advantageOfficial: true,
      addedTimeOfficial: true,
      updatedAtSecond: Number(legacy.clockSeconds || 0),
      ballState: snapshot.ballControl?.state || snapshot.ball?.state || "UNKNOWN",
      activeShot: snapshot.ballControl?.activeShot || null,
      eventCount: snapshot.eventCount,
      contract: {
        players: "V4", passingBall: "V4", passControl: "V4", shots: "V4", goalkeeper: "V4", goals: "V4", score: "V4", setPieces: "V4", aerialDuels: "V4", defence: "V4", pressing: "V4", offsideLine: "V4", attackingIdentity: "V4", playerRoles: "V4", boxOccupation: "V4", managerAI: "V4", substitutions: "V4", matchManagement: "V4", referee: "V4", cards: "V4", advantage: "V4", addedTime: "V4",
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
      source: "ME4_PHASE10"
    };
    legacy.visual2D.possession = snapshot.possessionSide;
    legacy.visual2D.phase = phaseLabel(snapshot);
    legacy.visual2D.ballControl = snapshot.ballControl;
    legacy.visual2D.shotAction = snapshot.ballControl?.activeShot || null;
    legacy.visual2D.defensiveAI = snapshot.defensiveAI || null;
    legacy.visual2D.attackingAI = snapshot.attackingAI || null;
    legacy.visual2D.managerAI = snapshot.managerAI || null;
    legacy.visual2D.referee = snapshot.referee || null;
    legacy.referee = snapshot.referee || null;
    legacy.managerAI = snapshot.managerAI || null;
    publishOfficialEvent(legacy, snapshot, report);
  }

  function phaseLabel(snapshot) {
    const state = snapshot?.ballControl?.state;
    const recentManager = [snapshot?.managerAI?.home, snapshot?.managerAI?.away].find(row => row?.lastDecision && row.lastDecision !== "MATCH_START" && Number(snapshot.simulationTime || 0) - Number(row.lastReviewAt || 0) < 8);
    const shot = snapshot?.ballControl?.activeShot;
    if (snapshot?.ballControl?.activeSetPiece) return `V4 ${String(snapshot.ballControl.activeSetPiece.type || "DURAN TOP").replace(/_/g, " ")} · ${Math.round((snapshot.ballControl.activeSetPiece.progress || 0) * 100)}%`;
    if (state === "SHOT_FLIGHT" && shot) return `V4 ${String(shot.shotType || "ŞUT").replace(/_/g, " ")} · ${Math.round((shot.progress || 0) * 100)}%`;
    if (state === "GOAL") return "V4 GOL";
    if (state === "IN_FLIGHT") return snapshot.ballControl.activeAction?.type === "CROSS" ? "V4 ORTA UÇUŞU" : "V4 PAS UÇUŞU";
    if (state === "LOOSE") return snapshot.ballControl?.loose?.secondBall ? "V4 İKİNCİ TOP" : "V4 BOŞTA TOP";
    if (state === "CONTROLLED") {
      const activeDefence = snapshot?.defensiveAI?.home?.active ? snapshot.defensiveAI.home : snapshot?.defensiveAI?.away?.active ? snapshot.defensiveAI.away : null;
      if (activeDefence) return `V4 PRESS ${String(activeDefence.trap || "BLOCK").replace(/_/g, " ")} · ${activeDefence.triggerScore}`;
      const attacking = snapshot?.attackingAI?.[snapshot.possessionSide];
      if (attacking?.active) return `V4 ROLE AI · ${String(attacking.phase || snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
      return `V4 ${String(snapshot.phase || "AKAN OYUN").replace(/_/g, " ")}`;
    }
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
      v4Second: report.status === "fulltime" ? Number(snapshot?.referee?.matchEndSeconds || 5400) : runtime.engine.clockSeconds,
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
    globalThis.dispatchEvent(new globalThis.CustomEvent("fifa-match-engine-v4-phase10", { detail: getSnapshot() }));
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
      console.info(`[Match Engine V4] Phase 10 referee, advantage and discipline authority enabled · ${VERSION}`);
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
      memo.pressures += row.home.stats.pressures + row.away.stats.pressures;
      memo.successfulPressures += row.home.stats.successfulPressures + row.away.stats.successfulPressures;
      memo.pressureRegains += row.home.stats.pressureRegains + row.away.stats.pressureRegains;
      memo.offsidesWon += row.home.stats.offsidesWon + row.away.stats.offsidesWon;
      memo.doubleTeams += row.home.stats.doubleTeams + row.away.stats.doubleTeams;
      return memo;
    }, { goals: 0, shots: 0, xg: 0, corners: 0, passes: 0, freeKicks: 0, throwIns: 0, penalties: 0, setPieceGoals: 0, aerialDuels: 0, pressures: 0, successfulPressures: 0, pressureRegains: 0, offsidesWon: 0, doubleTeams: 0 });
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
    __diagnostics: { activeContext, mapTactics, roleMap, phaseBehaviors, extractTeamPlayers, stableSignature, synchronizeOfficialState, applyV4OfficialState, applyOfficialStats, publishOfficialEvent }
  });
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE10 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE9 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE8 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE7 = API;
  globalThis.FIFA_MATCH_ENGINE_V4_SHADOW = API;
})();
(() => {
  "use strict";

  const VERSION = "4.0.0-phase10-live.1";
  const STORAGE_KEY = "fifa-me4-phase10-referee-discipline";
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
  const adapter = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE10 || globalThis.FIFA_MATCH_ENGINE_V4_PHASE9 || globalThis.FIFA_MATCH_ENGINE_V4_PHASE8 || globalThis.FIFA_MATCH_ENGINE_V4_PHASE7 || globalThis.FIFA_MATCH_ENGINE_V4_SHADOW;
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
      "blind-side-run": "KÖR TARAF KOŞUSU", "poach-box": "GOL BÖLGESİ", "false-nine-drop": "SAHTE 9 GERİ GEL", "target-hold-up": "TOPU SAKLA",
      "invert-support": "İÇ BEK DESTEĞİ", "mezzala-half-space": "MEZZALA YARI KORİDOR", "late-box-run": "GEÇ CEZA SAHASI KOŞUSU",
      "shadow-box-run": "GÖLGE FORVET KOŞUSU", "hold-width": "GENİŞLİĞİ KORU", "inside-forward-run": "İÇ FORVET KOŞUSU",
      "wide-playmaker-link": "KANAT OYUN KURUCU", "defender-carry": "STOPERLE ÇIKIŞ", "regista-roam": "REGISTA SERBESTLİK",
      "playmaker-between-lines": "HATLAR ARASI OYUN KURUCU", "half-back-drop": "STOPER ARASINA GİR", "target-hold-up": "HEDEF FORVET TOP SAKLA",
      "enganche-link": "ENGANCHE BAĞLANTI", "carrilero-support": "CARRILERO DESTEĞİ", "support-edge": "CEZA YAYI DESTEĞİ",
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
      "counter-outlet": "KONTRA ÇIKIŞI", "set-piece-delivery": "DURAN TOP SERVİSİ", "long-throw-delivery": "UZUN TAÇ", "claim-cross": "ORTAYI AL", "missed-claim": "HATALI ÇIKIŞ", "attack-header": "KAFA VURUŞU", "aerial-clearance": "HAVA TOPU UZAKLAŞTIR",
      "press-ball": "TOPA PRES", "double-team": "İKİLİ SIKIŞTIRMA", "cover-press": "PRES KADEMESİ", "cover-shadow": "PAS GÖLGESİ",
      "contain-transition": "KONTRAYI GECİKTİR", "stop-cross": "ORTAYI ENGELLE", "cutback-screen": "GERİ PASI KAPAT",
      "protect-near-post": "ÖN DİREĞİ KORU", "mark-centre": "MERKEZ MARKAJ", "lead-defensive-line": "SAVUNMA LİDERİ",
      "hold-offside-line": "OFSAYT ÇİZGİSİ", "offside-trap-won": "OFSAYT TUZAĞI"
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
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="press"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="press-ball"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="double-team"],
      .manager-2d-pitch.me4-visual-active .match-player[data-v4-intent="cover-press"]{box-shadow:0 0 0 3px rgba(255,94,94,.22),0 6px 15px rgba(0,0,0,.48);}
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

  function ensureHud(pitch, simulation, phase9Snapshot) {
    const view = pitch?.closest?.(".manager-2d-view");
    const header = view?.querySelector?.(":scope > header") || view?.querySelector?.("header");
    if (!header) return;
    let hud = header.querySelector(".me4-live-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "me4-live-hud";
      hud.innerHTML = `<span>ME4 <b>REFEREE · DISCIPLINE AI</b></span><span data-me4-phase>—</span><span data-me4-ball class="me4-ball-state">BALL —</span><span data-me4-authority>AUTH —</span><span data-me4-pass>PASS —</span><span data-me4-rest>REST DEF —</span><span data-me4-defence>PRESS —</span><span data-me4-manager>MANAGER —</span><span data-me4-physical>PHYSICAL —</span><span data-me4-referee>REFEREE —</span><button type="button" data-me4-toggle class="active">V4 PHASE 10</button>`;
      header.appendChild(hud);
      hud.querySelector("[data-me4-toggle]")?.addEventListener("click", toggle);
    }
    const phase = hud.querySelector("[data-me4-phase]");
    if (phase) phase.textContent = String(simulation?.phase || "AKAN OYUN").replace(/_/g, " ");
    const ballState = simulation?.ballControl?.state || simulation?.ball?.state || "CONTROLLED";
    const ball = hud.querySelector("[data-me4-ball]");
    if (ball) ball.textContent = `BALL ${String(ballState).replace(/_/g, " ")}`;
    const authorityValue = phase9Snapshot?.authority || simulation?.ballAuthority || "V4_FULL_AUTHORITY";
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
    const defence = hud.querySelector("[data-me4-defence]");
    const activeAttack = simulation?.attackingAI?.[simulation?.possessionSide];
    if (defence) defence.textContent = activeAttack?.active ? `ROLE ${String(activeAttack.phase || "ATTACK").replace(/_/g," ")} · ${Object.keys(activeAttack.assignments || {}).length} RUNNERS` : "ROLE SHAPE";
    const manager = hud.querySelector("[data-me4-manager]");
    if (manager) {
      const homePlan = simulation?.managerAI?.home?.currentPlan || "BALANCED";
      const awayPlan = simulation?.managerAI?.away?.currentPlan || "BALANCED";
      const last = [simulation?.managerAI?.home, simulation?.managerAI?.away].find(row=>row?.lastDecision && row.lastDecision!=="MATCH_START");
      manager.textContent = `MGR ${homePlan} · ${awayPlan}${last ? ` · ${String(last.lastDecision).replace(/_/g," ")}` : ""}`;
    }
    const physical = hud.querySelector("[data-me4-physical]");
    if (physical) {
      const hp = simulation?.teams?.home?.physical || {};
      const ap = simulation?.teams?.away?.physical || {};
      physical.textContent = `ENERJİ ${Math.round(hp.averageEnergy || 0)} · ${Math.round(ap.averageEnergy || 0)} · YÜK ${Math.round(hp.averageFatigue || 0)} · ${Math.round(ap.averageFatigue || 0)}${(hp.limitedPlayers || ap.limitedPlayers) ? ` · LIMIT ${Number(hp.limitedPlayers||0)+Number(ap.limitedPlayers||0)}` : ""}`;
    }
    const refereeHud = hud.querySelector("[data-me4-referee]");
    if (refereeHud) {
      const ref = simulation?.referee || {};
      const hstats = simulation?.teams?.home?.stats || {};
      const astats = simulation?.teams?.away?.stats || {};
      const cards = Number(hstats.yellowCards||0)+Number(astats.yellowCards||0);
      const reds = Number(hstats.redCards||0)+Number(astats.redCards||0);
      const advantage = ref.advantage ? " · AVANTAJ" : "";
      const added = ref.secondHalfAdded != null ? ` · +${Math.round(Number(ref.secondHalfAdded||0)/60)}` : "";
      refereeHud.textContent = `REF ${String(ref.profile?.id||"balanced").toUpperCase()} · YC ${cards} · RC ${reds}${advantage}${added}`;
    }
    const toggleButton = hud.querySelector("[data-me4-toggle]");
    if (toggleButton) {
      toggleButton.classList.toggle("active", runtime.enabled);
      toggleButton.textContent = runtime.enabled ? "V4 PHASE 10" : "LEGACY GÖRÜNTÜ";
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
      node.title = `${player.name} · ${player.position} · ${player.role} · ${intentLabel(intent)} · Enerji ${Math.round(player.shortTermEnergy ?? player.energy)} · Yorgunluk ${Math.round(player.accumulatedFatigue ?? player.fatigue)} · ${String(player.physicalStatus || "FIT").replace(/_/g," ")}${player.injuryType ? ` · ${player.injuryType}` : ""}`;
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
    const phase9Snapshot = adapter()?.getSnapshot?.();
    const simulation = phase9Snapshot?.simulation;
    const mount = document.getElementById("managerMatchMount");
    const pitch = mount?.querySelector?.(".manager-2d-pitch");
    if (!pitch) return false;
    ensureStyles();
    ensureHud(pitch, simulation, phase9Snapshot);
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
    const phase9 = adapter()?.getSnapshot?.() || null;
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.lastFixtureId,
      appliedFrames: runtime.appliedFrames,
      phase9,
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
        attackingIdentity: "V4_OFFICIAL",
        playerRoles: "V4_OFFICIAL",
        blindSideRuns: "V4_OFFICIAL",
        boxOccupation: "V4_OFFICIAL",
        managerAI: "V4_OFFICIAL",
        substitutions: "V4_OFFICIAL",
        matchManagement: "V4_OFFICIAL",
        physicalCondition: "V4_OFFICIAL",
        fatiguePerformance: "V4_OFFICIAL",
        injuries: "V4_OFFICIAL",
        matchLoad: "V4_OFFICIAL",
        referee: "V4_OFFICIAL",
        cards: "V4_OFFICIAL",
        advantage: "V4_OFFICIAL",
        addedTime: "V4_OFFICIAL",
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
    console.info(`[Match Engine V4] Phase 10 referee, advantage and discipline authority ready · ${VERSION}`);
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
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE10_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE9_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE8_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE7_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_LIVE = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();


(() => {
  "use strict";

  const VERSION = "4.0.0-phase11-visual.1";
  const STORAGE_KEY = "fifa-me4-phase11-visual-experience";
  const PITCH_WIDTH = 68;
  const FRAME_INTERVAL = 1000 / 60;
  const SNAPSHOT_INTERVAL = 125;
  const REPLAY_MAX_FRAMES = 140;
  const runtime = {
    enabled: true,
    raf: null,
    observer: null,
    lastFrameAt: 0,
    previousSnapshot: null,
    currentSnapshot: null,
    snapshotAt: 0,
    previousSnapshotAt: 0,
    lastSimulationTime: -1,
    lastEventSignature: null,
    lastGoalSignature: null,
    appliedFrames: 0,
    cameraMode: "BROADCAST",
    overlays: true,
    autoReplay: true,
    replay: { active: false, frames: [], index: 0, startedAt: 0, speed: 0.72 },
    replayBuffer: [],
    lastRecordedAt: 0,
    bannerUntil: 0,
    bannerText: "",
    bannerTone: "neutral",
    lastFixtureId: null,
    trailNodes: []
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, t) => Number(a || 0) + (Number(b || 0) - Number(a || 0)) * clamp(t, 0, 1);
  const adapter = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE10 || globalThis.FIFA_MATCH_ENGINE_V4_PHASE9 || globalThis.FIFA_MATCH_ENGINE_V4_SHADOW;
  const oldLive = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE10_LIVE;
  const room = () => globalThis.FIFA_MANAGER_ROOM;

  function readPreference() {
    try {
      const raw = globalThis.localStorage?.getItem?.(STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch { return {}; }
  }

  function savePreference() {
    try {
      globalThis.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify({
        enabled: runtime.enabled,
        cameraMode: runtime.cameraMode,
        overlays: runtime.overlays,
        autoReplay: runtime.autoReplay
      }));
    } catch {}
  }

  function activeContext() {
    const api = room();
    const career = api?.getCareer?.();
    const fixture = api?.getSelectedFixture?.() || career?.fixtures?.find?.(row => row?.id === career?.selectedFixtureId) || career?.fixtures?.find?.(row => row?.matchEngine?.status === "live");
    if (!career || !fixture?.matchEngine) return null;
    return { api, career, fixture, engine: fixture.matchEngine };
  }

  function point(value) {
    return { x: Number(value?.x || 0), y: Number(value?.y || 0) };
  }

  function interpolatePoint(a, b, alpha) {
    return { x: lerp(a?.x, b?.x, alpha), y: lerp(a?.y, b?.y, alpha) };
  }

  function angleBetween(a, b, fallback = 0) {
    const dx = Number(b?.x || 0) - Number(a?.x || 0);
    const dy = Number(b?.y || 0) - Number(a?.y || 0);
    if (Math.hypot(dx, dy) < 0.02) return Number(fallback || 0);
    return Math.atan2(dy, dx) * 180 / Math.PI;
  }

  function normalizeEventType(value) {
    return String(value || "").trim().toUpperCase();
  }

  function eventSignature(event) {
    if (!event) return "";
    return String(event.id || `${event.type || "EVENT"}:${event.at || event.minute || 0}:${event.playerId || ""}:${event.side || ""}`);
  }

  function inferAnimation(player, simulation, event, speed = 0) {
    if (!player) return "IDLE";
    if (player.redCard) return "DISMISSED";
    const type = normalizeEventType(event?.type);
    const isActor = event?.playerId === player.id || event?.shooterId === player.id || event?.goalkeeperId === player.id;
    const elapsed = Math.abs(Number(simulation?.simulationTime || 0) - Number(event?.at || 0));
    if (type === "GOAL" && elapsed < 3.2 && event?.side === (player.side || simulation?.possessionSide)) return player.group === "GK" ? "GK_REACTION" : "CELEBRATE";
    if (isActor && elapsed < 1.4) {
      if (["SHOT", "PENALTY_TAKEN"].includes(type)) return "SHOOT";
      if (["PASS", "PASS_COMPLETED", "CROSS", "THROUGH_BALL"].includes(type)) return "PASS";
      if (["TACKLE", "FOUL", "YELLOW_CARD", "RED_CARD", "SECOND_YELLOW"].includes(type)) return "TACKLE";
      if (["AERIAL_DUEL", "HEADER", "GOALKEEPER_PUNCH", "GOALKEEPER_CLAIM"].includes(type)) return player.group === "GK" ? "GK_CLAIM" : "HEADER";
      if (["SAVE_HELD", "SAVE_PARRIED", "GOALKEEPER_SET"].includes(type)) return "GK_DIVE";
    }
    const intent = String(player.intent || "").toUpperCase();
    if (player.group === "GK" && /SAVE|DIVE|CLAIM|PUNCH|SWEEP|RUSH/.test(intent)) return /CLAIM|PUNCH/.test(intent) ? "GK_CLAIM" : "GK_DIVE";
    if (/TACKLE|SLIDE/.test(intent)) return "TACKLE";
    if (/HEADER|AERIAL/.test(intent)) return "HEADER";
    if (/JOCKEY|DELAY|BLOCK|MARK|SCREEN|COMPACT|COVER/.test(intent)) return "JOCKEY";
    if (/PRESS|COUNTER_PRESS|CLOSE_DOWN/.test(intent)) return "PRESS";
    if (/SHOOT|FINISH/.test(intent)) return "SHOOT";
    if (/PASS|CROSS|DELIVER/.test(intent)) return "PASS";
    if (speed > 5.4) return "SPRINT";
    if (speed > 3.0) return "RUN";
    if (speed > 0.65) return "JOG";
    return "IDLE";
  }

  function computeCollisionOffsets(players, minimumDistance = 1.35, visualStrength = 0.42) {
    const offsets = new Map((players || []).map(player => [player.id, { x: 0, y: 0 }]));
    for (let i = 0; i < (players || []).length; i += 1) {
      for (let j = i + 1; j < players.length; j += 1) {
        const a = players[i], b = players[j];
        const dx = Number(b.point?.x || 0) - Number(a.point?.x || 0);
        const dy = Number(b.point?.y || 0) - Number(a.point?.y || 0);
        const distance = Math.hypot(dx, dy);
        if (distance <= 0.001 || distance >= minimumDistance) continue;
        const pressure = (minimumDistance - distance) / minimumDistance * visualStrength;
        const nx = -dy / distance, ny = dx / distance;
        const ao = offsets.get(a.id), bo = offsets.get(b.id);
        ao.x -= nx * pressure; ao.y -= ny * pressure;
        bo.x += nx * pressure; bo.y += ny * pressure;
      }
    }
    return offsets;
  }

  function cameraPreset(mode, simulation) {
    const ball = point(simulation?.ball?.position || { x: 50, y: 34 });
    const shot = simulation?.ballControl?.activeShot;
    const setPiece = simulation?.ballControl?.activeSetPiece;
    if (mode === "TACTICAL") return { scale: 1, originX: 50, originY: 50, label: "TACTICAL" };
    if (mode === "FOLLOW_BALL") return { scale: shot ? 1.22 : 1.13, originX: clamp(ball.x, 12, 88), originY: clamp(ball.y / PITCH_WIDTH * 100, 14, 86), label: "FOLLOW BALL" };
    if (mode === "HIGHLIGHT") return { scale: shot ? 1.25 : setPiece ? 1.16 : 1.08, originX: clamp(ball.x, 8, 92), originY: clamp(ball.y / PITCH_WIDTH * 100, 10, 90), label: "HIGHLIGHT" };
    return { scale: shot ? 1.15 : setPiece ? 1.08 : 1.035, originX: clamp(ball.x, 18, 82), originY: clamp(ball.y / PITCH_WIDTH * 100, 20, 80), label: "BROADCAST" };
  }

  function copyFrame(simulation) {
    if (!simulation) return null;
    return {
      simulationTime: Number(simulation.simulationTime || 0),
      score: { ...(simulation.score || {}) },
      event: simulation.lastEvent ? { ...simulation.lastEvent } : null,
      ball: {
        position: point(simulation.ball?.position),
        velocity: point(simulation.ball?.velocity),
        height: Number(simulation.ball?.height || 0),
        state: simulation.ball?.state || simulation.ballControl?.state || "CONTROLLED"
      },
      teams: {
        home: { players: (simulation.teams?.home?.players || []).map(player => ({ ...player, point: point(player.point), previousPoint: point(player.previousPoint), velocity: point(player.velocity) })) },
        away: { players: (simulation.teams?.away?.players || []).map(player => ({ ...player, point: point(player.point), previousPoint: point(player.previousPoint), velocity: point(player.velocity) })) }
      },
      ballControl: simulation.ballControl ? JSON.parse(JSON.stringify(simulation.ballControl)) : null,
      referee: simulation.referee ? JSON.parse(JSON.stringify(simulation.referee)) : null
    };
  }

  class ReplayBuffer {
    constructor(limit = REPLAY_MAX_FRAMES) { this.limit = limit; this.frames = []; }
    push(frame) { if (!frame) return; this.frames.push(frame); if (this.frames.length > this.limit) this.frames.splice(0, this.frames.length - this.limit); }
    sliceLast(seconds = 7) {
      if (!this.frames.length) return [];
      const end = this.frames.at(-1).simulationTime;
      return this.frames.filter(frame => frame.simulationTime >= end - seconds);
    }
    clear() { this.frames.length = 0; }
  }

  const replayStore = new ReplayBuffer();

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("me4-phase11-styles")) return;
    const style = document.createElement("style");
    style.id = "me4-phase11-styles";
    style.textContent = `
      .manager-2d-pitch.me11-visual-active{overflow:hidden;transform-origin:var(--me11-camera-x,50%) var(--me11-camera-y,50%);transform:scale(var(--me11-camera-scale,1));transition:transform .42s cubic-bezier(.2,.8,.2,1),transform-origin .32s ease;will-change:transform}
      .manager-2d-pitch .me11-motion-core{position:absolute;inset:-4px;border-radius:999px;pointer-events:none;transform:rotate(var(--me11-facing,0deg));transition:transform .12s linear,opacity .18s ease}
      .manager-2d-pitch .me11-motion-core:before{content:"";position:absolute;right:-5px;top:50%;width:8px;height:3px;border-radius:99px;background:rgba(255,255,255,.92);transform:translateY(-50%);box-shadow:0 0 6px rgba(255,255,255,.8)}
      [data-motion-player].me11-state-sprint .me11-motion-core{animation:me11Sprint .24s infinite alternate}
      [data-motion-player].me11-state-run .me11-motion-core{animation:me11Run .34s infinite alternate}
      [data-motion-player].me11-state-jog .me11-motion-core{animation:me11Jog .5s infinite alternate}
      [data-motion-player].me11-state-jockey .me11-motion-core{animation:me11Jockey .38s infinite alternate}
      [data-motion-player].me11-state-press .me11-motion-core{box-shadow:0 0 0 5px rgba(255,132,54,.24),0 0 16px rgba(255,97,34,.45);animation:me11Press .3s infinite alternate}
      [data-motion-player].me11-state-tackle .me11-motion-core{animation:me11Tackle .48s ease-out}
      [data-motion-player].me11-state-header .me11-motion-core{animation:me11Header .45s ease-out}
      [data-motion-player].me11-state-shoot .me11-motion-core,[data-motion-player].me11-state-pass .me11-motion-core{animation:me11Kick .34s ease-out}
      [data-motion-player].me11-state-gk_dive .me11-motion-core{border-radius:8px;box-shadow:0 0 0 5px rgba(64,206,255,.25);animation:me11Dive .5s ease-out}
      [data-motion-player].me11-state-gk_claim .me11-motion-core{animation:me11Claim .52s ease-out}
      [data-motion-player].me11-state-celebrate .me11-motion-core{box-shadow:0 0 0 8px rgba(255,217,73,.38);animation:me11Celebrate .62s infinite alternate}
      [data-motion-player].me11-state-dismissed{opacity:.28;filter:grayscale(.8)}
      [data-motion-player].me11-near-collision{filter:drop-shadow(0 0 4px rgba(255,255,255,.5))}
      [data-live-ball].me11-ball{z-index:40;transform:translate(-50%,-50%) scale(var(--me11-ball-scale,1)) rotate(var(--me11-ball-spin,0deg));box-shadow:var(--me11-ball-shadow,0 3px 4px rgba(0,0,0,.35));transition:box-shadow .08s linear;will-change:left,top,transform}
      .me11-ball-trail{position:absolute;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.48);transform:translate(-50%,-50%);pointer-events:none;z-index:35;filter:blur(.4px)}
      .me11-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:18;overflow:visible}
      .me11-svg .offside{stroke:#ffe06a;stroke-width:.42;stroke-dasharray:2 1;opacity:.72}
      .me11-svg .press{stroke:#ff7a4a;stroke-width:.35;stroke-dasharray:1.2 1;opacity:.72}
      .me11-svg .run{stroke:#6de2ff;stroke-width:.32;stroke-dasharray:1.1 1.4;opacity:.6}
      .me11-hud{position:absolute;left:10px;bottom:10px;z-index:80;display:flex;gap:6px;align-items:center;flex-wrap:wrap;max-width:calc(100% - 20px);font-family:Inter,system-ui,sans-serif}
      .me11-hud button,.me11-hud select,.me11-hud span{border:1px solid rgba(255,255,255,.2);background:rgba(4,20,30,.88);color:#eaf8fa;border-radius:8px;padding:6px 8px;font-size:10px;font-weight:900;backdrop-filter:blur(7px)}
      .me11-hud button{cursor:pointer}.me11-hud button.active{background:#82671f;color:#fff4b5}.me11-hud .replay{background:#793b38}
      .me11-banner{position:absolute;left:50%;top:12%;transform:translateX(-50%);z-index:90;background:rgba(3,16,24,.92);color:#fff;padding:9px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.22);font:950 13px/1.1 Inter,system-ui,sans-serif;letter-spacing:.06em;opacity:0;transition:opacity .2s ease,transform .2s ease;pointer-events:none}
      .me11-banner.show{opacity:1;transform:translateX(-50%) translateY(4px)}.me11-banner.goal{color:#ffe77c;box-shadow:0 0 30px rgba(255,210,67,.35)}.me11-banner.card{color:#ff8580}.me11-banner.replay{color:#7fe6ff}
      .me11-replay-badge{position:absolute;right:10px;top:10px;z-index:90;background:#9b352f;color:white;padding:7px 10px;border-radius:8px;font:950 10px Inter,system-ui;letter-spacing:.11em;display:none}.me11-replay-badge.show{display:block}
      @keyframes me11Sprint{to{transform:rotate(var(--me11-facing,0deg)) scaleX(1.18) scaleY(.88)}}
      @keyframes me11Run{to{transform:rotate(var(--me11-facing,0deg)) scaleX(1.1) scaleY(.93)}}
      @keyframes me11Jog{to{transform:rotate(var(--me11-facing,0deg)) translateY(-1px)}}
      @keyframes me11Jockey{to{transform:rotate(var(--me11-facing,0deg)) scaleX(1.12)}}
      @keyframes me11Press{to{transform:rotate(var(--me11-facing,0deg)) scale(1.13)}}
      @keyframes me11Tackle{45%{transform:rotate(var(--me11-facing,0deg)) scaleX(1.55) scaleY(.55)}100%{transform:rotate(var(--me11-facing,0deg)) scale(1)}}
      @keyframes me11Header{45%{transform:rotate(var(--me11-facing,0deg)) translateY(-9px) scale(1.12)}100%{transform:rotate(var(--me11-facing,0deg)) translateY(0)}}
      @keyframes me11Kick{45%{transform:rotate(var(--me11-facing,0deg)) scaleX(1.28) scaleY(.9)}100%{transform:rotate(var(--me11-facing,0deg)) scale(1)}}
      @keyframes me11Dive{45%{transform:rotate(var(--me11-facing,0deg)) scaleX(1.65) scaleY(.72)}100%{transform:rotate(var(--me11-facing,0deg)) scale(1)}}
      @keyframes me11Claim{45%{transform:rotate(var(--me11-facing,0deg)) translateY(-8px) scale(1.24)}100%{transform:rotate(var(--me11-facing,0deg)) translateY(0)}}
      @keyframes me11Celebrate{to{transform:rotate(var(--me11-facing,0deg)) translateY(-7px) scale(1.17)}}
    `;
    document.head.appendChild(style);
  }

  function ensurePlayerCore(node) {
    let core = node.querySelector?.(".me11-motion-core");
    if (!core && typeof document !== "undefined") {
      core = document.createElement("i");
      core.className = "me11-motion-core";
      node.appendChild(core);
    }
    return core;
  }

  function ensureOverlay(pitch) {
    let svg = pitch.querySelector?.(".me11-svg");
    if (!svg && typeof document !== "undefined") {
      svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "me11-svg");
      svg.setAttribute("viewBox", "0 0 100 100");
      pitch.appendChild(svg);
    }
    return svg;
  }

  function ensureUi(pitch) {
    let hud = pitch.querySelector?.(".me11-hud");
    if (!hud && typeof document !== "undefined") {
      hud = document.createElement("div");
      hud.className = "me11-hud";
      hud.innerHTML = `<span data-me11-status>ME11 VISUAL</span><select data-me11-camera><option value="BROADCAST">Broadcast</option><option value="TACTICAL">Tactical</option><option value="FOLLOW_BALL">Follow Ball</option><option value="HIGHLIGHT">Highlight</option></select><button data-me11-overlay>TAKTİK ÇİZGİLER</button><button data-me11-replay class="replay">TEKRAR</button><button data-me11-auto>AUTO REPLAY</button>`;
      pitch.appendChild(hud);
      hud.querySelector("[data-me11-camera]").value = runtime.cameraMode;
      hud.querySelector("[data-me11-camera]").onchange = event => { runtime.cameraMode = event.target.value; savePreference(); };
      hud.querySelector("[data-me11-overlay]").onclick = event => { runtime.overlays = !runtime.overlays; event.currentTarget.classList.toggle("active", runtime.overlays); savePreference(); };
      hud.querySelector("[data-me11-replay]").onclick = () => startReplay(7);
      hud.querySelector("[data-me11-auto]").onclick = event => { runtime.autoReplay = !runtime.autoReplay; event.currentTarget.classList.toggle("active", runtime.autoReplay); savePreference(); };
    }
    if (hud) {
      hud.querySelector("[data-me11-overlay]")?.classList.toggle("active", runtime.overlays);
      hud.querySelector("[data-me11-auto]")?.classList.toggle("active", runtime.autoReplay);
    }
    let banner = pitch.querySelector?.(".me11-banner");
    if (!banner && typeof document !== "undefined") { banner = document.createElement("div"); banner.className = "me11-banner"; pitch.appendChild(banner); }
    let replayBadge = pitch.querySelector?.(".me11-replay-badge");
    if (!replayBadge && typeof document !== "undefined") { replayBadge = document.createElement("div"); replayBadge.className = "me11-replay-badge"; replayBadge.textContent = "REPLAY · ME11"; pitch.appendChild(replayBadge); }
    return { hud, banner, replayBadge };
  }

  function showBanner(text, tone = "neutral", milliseconds = 1800) {
    runtime.bannerText = text;
    runtime.bannerTone = tone;
    runtime.bannerUntil = (globalThis.performance?.now?.() || Date.now()) + milliseconds;
  }

  function updateBanner(ui, now) {
    if (!ui?.banner) return;
    const visible = now < runtime.bannerUntil;
    ui.banner.textContent = runtime.bannerText;
    ui.banner.className = `me11-banner ${visible ? "show" : ""} ${runtime.bannerTone}`;
  }

  function snapshotPlayers(simulation) {
    return [
      ...(simulation?.teams?.home?.players || []).map(player => ({ ...player, side: "home" })),
      ...(simulation?.teams?.away?.players || []).map(player => ({ ...player, side: "away" }))
    ];
  }

  function findPlayerFrames(previous, current, side, index) {
    const cp = current?.teams?.[side]?.players?.[index];
    if (!cp) return null;
    const pp = previous?.teams?.[side]?.players?.find?.(player => player.id === cp.id) || previous?.teams?.[side]?.players?.[index] || cp;
    return { previous: pp, current: cp };
  }

  function drawOverlays(svg, simulation, displayedPlayers) {
    if (!svg) return;
    if (!runtime.overlays || runtime.replay.active) { svg.innerHTML = ""; return; }
    const lines = [];
    ["home", "away"].forEach(side => {
      const players = displayedPlayers.filter(player => player.side === side && player.group !== "GK" && !player.redCard);
      if (!players.length) return;
      const direction = side === "home" ? 1 : -1;
      const defenderCandidates = players.filter(player => ["CB", "FB", "WB", "DM"].includes(player.group));
      if (defenderCandidates.length) {
        const x = direction > 0 ? Math.min(...defenderCandidates.map(player => player.display.x)) : Math.max(...defenderCandidates.map(player => player.display.x));
        lines.push(`<line class="offside" x1="${x}" y1="2" x2="${x}" y2="98"/>`);
      }
    });
    const defence = simulation?.defensiveAI || {};
    ["home", "away"].forEach(side => {
      const ctx = defence[side];
      if (!ctx?.active) return;
      const ids = [ctx.primaryPresserId, ctx.secondaryPresserId].filter(Boolean);
      const ball = { x: Number(simulation.ball?.position?.x || 50), y: Number(simulation.ball?.position?.y || 34) / PITCH_WIDTH * 100 };
      ids.forEach(id => {
        const p = displayedPlayers.find(player => player.id === id);
        if (p) lines.push(`<line class="press" x1="${p.display.x}" y1="${p.display.y / PITCH_WIDTH * 100}" x2="${ball.x}" y2="${ball.y}"/>`);
      });
    });
    const attack = simulation?.attackingAI?.[simulation?.possessionSide];
    const runner = displayedPlayers.find(player => player.id === attack?.blindSideRunnerId);
    if (runner?.targetPoint) lines.push(`<line class="run" x1="${runner.display.x}" y1="${runner.display.y / PITCH_WIDTH * 100}" x2="${runner.targetPoint.x}" y2="${runner.targetPoint.y / PITCH_WIDTH * 100}"/>`);
    svg.innerHTML = lines.join("");
  }

  function recordFrame(simulation, now) {
    if (!simulation || runtime.replay.active || now - runtime.lastRecordedAt < 90) return;
    runtime.lastRecordedAt = now;
    replayStore.push(copyFrame(simulation));
  }

  function startReplay(seconds = 7) {
    const frames = replayStore.sliceLast(seconds);
    if (frames.length < 5) return false;
    runtime.replay.active = true;
    runtime.replay.frames = frames;
    runtime.replay.index = 0;
    runtime.replay.startedAt = globalThis.performance?.now?.() || Date.now();
    showBanner("REPLAY", "replay", 1300);
    return true;
  }

  function stopReplay() {
    runtime.replay.active = false;
    runtime.replay.frames = [];
    runtime.replay.index = 0;
  }

  function replayFrame(now) {
    if (!runtime.replay.active || !runtime.replay.frames.length) return null;
    const elapsed = (now - runtime.replay.startedAt) * runtime.replay.speed;
    const index = Math.floor(elapsed / 95);
    if (index >= runtime.replay.frames.length) { stopReplay(); return null; }
    runtime.replay.index = index;
    return runtime.replay.frames[index];
  }

  function eventPresentation(simulation, now) {
    const event = simulation?.lastEvent;
    const signature = eventSignature(event);
    if (!signature || signature === runtime.lastEventSignature) return;
    runtime.lastEventSignature = signature;
    const type = normalizeEventType(event?.type);
    if (type === "GOAL") {
      showBanner(`GOOOL · ${String(event.side || "").toUpperCase()}`, "goal", 2400);
      if (runtime.autoReplay && runtime.lastGoalSignature !== signature) {
        runtime.lastGoalSignature = signature;
        globalThis.setTimeout?.(() => { if (!runtime.replay.active) startReplay(7); }, 650);
      }
    } else if (["RED_CARD", "SECOND_YELLOW"].includes(type)) showBanner(type === "RED_CARD" ? "KIRMIZI KART" : "İKİNCİ SARI · KIRMIZI", "card", 2100);
    else if (type === "SAVE_PARRIED") showBanner("KALECİDEN KRİTİK KURTARIŞ", "neutral", 1200);
    else if (type === "GOALKEEPER_PUNCH") showBanner("KALECİ YUMRUKLADI", "neutral", 1000);
  }

  function updateSnapshots(simulation, now) {
    if (!simulation) return;
    const time = Number(simulation.simulationTime || 0);
    if (!runtime.currentSnapshot) {
      runtime.previousSnapshot = copyFrame(simulation);
      runtime.currentSnapshot = copyFrame(simulation);
      runtime.previousSnapshotAt = now;
      runtime.snapshotAt = now;
      runtime.lastSimulationTime = time;
      return;
    }
    if (time !== runtime.lastSimulationTime || Number(simulation.eventCount || 0) !== Number(runtime.currentSnapshot.eventCount || 0)) {
      runtime.previousSnapshot = runtime.currentSnapshot;
      runtime.currentSnapshot = copyFrame(simulation);
      runtime.previousSnapshotAt = runtime.snapshotAt;
      runtime.snapshotAt = now;
      runtime.lastSimulationTime = time;
    }
  }

  function displaySimulation(now, liveSimulation) {
    const replay = replayFrame(now);
    if (replay) return { simulation: replay, alpha: 1, replay: true };
    updateSnapshots(liveSimulation, now);
    const interval = Math.max(70, runtime.snapshotAt - runtime.previousSnapshotAt || SNAPSHOT_INTERVAL);
    const alpha = clamp((now - runtime.snapshotAt) / interval, 0, 1);
    return { simulation: runtime.currentSnapshot || liveSimulation, previous: runtime.previousSnapshot || runtime.currentSnapshot || liveSimulation, alpha, replay: false };
  }

  function renderPlayers(pitch, display) {
    const simulation = display.simulation;
    const previous = display.previous || simulation;
    const alpha = display.alpha;
    const displayedPlayers = [];
    ["home", "away"].forEach(side => {
      const nodes = Array.from(pitch.querySelectorAll(`[data-motion-player][data-side="${side}"]`));
      const currentPlayers = simulation?.teams?.[side]?.players || [];
      const collisionInput = currentPlayers.map(player => ({ ...player, side, point: point(player.point) }));
      const offsets = computeCollisionOffsets(collisionInput);
      nodes.forEach((node, index) => {
        const frames = findPlayerFrames(previous, simulation, side, index);
        if (!frames) return;
        const current = frames.current, prev = frames.previous;
        const raw = interpolatePoint(prev.point, current.point, alpha);
        const offset = offsets.get(current.id) || { x: 0, y: 0 };
        const displayPoint = { x: clamp(raw.x + offset.x, .3, 99.7), y: clamp(raw.y + offset.y, .3, 67.7) };
        const velocity = current.velocity || { x: current.point.x - prev.point.x, y: current.point.y - prev.point.y };
        const speed = Math.hypot(Number(velocity.x || 0), Number(velocity.y || 0));
        const facing = speed > .08 ? angleBetween({ x: 0, y: 0 }, velocity, current.facing) : Number(current.facing || angleBetween(prev.point, current.point));
        const state = inferAnimation({ ...current, side }, simulation, simulation.lastEvent, speed);
        node.style.left = `${displayPoint.x}%`;
        node.style.top = `${displayPoint.y / PITCH_WIDTH * 100}%`;
        node.style.setProperty("--me11-facing", `${facing}deg`);
        ensurePlayerCore(node);
        Array.from(node.classList).filter(name => name.startsWith("me11-state-")).forEach(name => node.classList.remove(name));
        node.classList.add(`me11-state-${state.toLowerCase()}`);
        node.classList.toggle("me11-near-collision", Math.hypot(offset.x, offset.y) > .04);
        node.dataset.me11Animation = state;
        node.dataset.me11Speed = speed.toFixed(2);
        node.title = `${current.name} · ${current.role} · ${state} · Hız ${speed.toFixed(1)} · Enerji ${Math.round(current.shortTermEnergy ?? current.energy ?? 0)}`;
        displayedPlayers.push({ ...current, side, display: displayPoint, targetPoint: current.targetPoint });
      });
    });
    return displayedPlayers;
  }

  function renderBall(pitch, display, now) {
    const simulation = display.simulation, previous = display.previous || simulation;
    const node = pitch.querySelector("[data-live-ball]");
    if (!node || !simulation?.ball) return;
    const position = interpolatePoint(previous?.ball?.position, simulation.ball.position, display.alpha);
    const height = lerp(previous?.ball?.height, simulation.ball.height, display.alpha);
    const velocity = simulation.ball.velocity || { x: 0, y: 0 };
    const speed = Math.hypot(Number(velocity.x || 0), Number(velocity.y || 0));
    node.classList.add("me11-ball");
    node.style.left = `${clamp(position.x, .2, 99.8)}%`;
    node.style.top = `${clamp(position.y / PITCH_WIDTH * 100 - height * .35, .3, 99.7)}%`;
    node.style.setProperty("--me11-ball-scale", String(clamp(1 + height * .11, 1, 1.65)));
    node.style.setProperty("--me11-ball-spin", `${(now / 8 * clamp(speed, .2, 8)) % 360}deg`);
    node.style.setProperty("--me11-ball-shadow", `0 ${Math.round(3 + height * 3)}px ${Math.round(4 + height * 2)}px rgba(0,0,0,${clamp(.42 - height * .04,.18,.42)})`);
    const state = String(simulation.ballControl?.state || simulation.ball.state || "CONTROLLED");
    node.dataset.me11State = state;
    if (speed > 5 || state === "SHOT_FLIGHT") createTrail(pitch, position, height);
  }

  function createTrail(pitch, position, height) {
    if (typeof document === "undefined") return;
    const trail = document.createElement("i");
    trail.className = "me11-ball-trail";
    trail.style.left = `${position.x}%`;
    trail.style.top = `${position.y / PITCH_WIDTH * 100 - height * .35}%`;
    pitch.appendChild(trail);
    runtime.trailNodes.push(trail);
    globalThis.setTimeout?.(() => { trail.style.opacity = "0"; trail.style.transition = "opacity .3s"; }, 40);
    globalThis.setTimeout?.(() => { trail.remove(); runtime.trailNodes = runtime.trailNodes.filter(node => node !== trail); }, 360);
    if (runtime.trailNodes.length > 12) runtime.trailNodes.shift()?.remove?.();
  }

  function applyCamera(pitch, simulation) {
    const preset = cameraPreset(runtime.cameraMode, simulation);
    pitch.style.setProperty("--me11-camera-scale", String(preset.scale));
    pitch.style.setProperty("--me11-camera-x", `${preset.originX}%`);
    pitch.style.setProperty("--me11-camera-y", `${preset.originY}%`);
    return preset;
  }

  function markOfficialVisual(context) {
    const state = context?.engine;
    if (!state) return;
    state.matchEngineV4 = state.matchEngineV4 || {};
    state.matchEngineV4.visualPresentationOfficial = true;
    state.matchEngineV4.visualVersion = VERSION;
    state.matchEngineV4.contract = { ...(state.matchEngineV4.contract || {}), visualRenderer: "V4_PHASE11", replay: "V4_PHASE11", camera: "V4_PHASE11", animationState: "V4_PHASE11" };
  }

  function renderSimulation(pitch, simulation, now = (globalThis.performance?.now?.() || Date.now())) {
    if (!pitch || !simulation) return false;
    ensureStyles();
    pitch.classList.add("me11-visual-active");
    const ui = ensureUi(pitch);
    const display = displaySimulation(now, simulation);
    const players = renderPlayers(pitch, display);
    renderBall(pitch, display, now);
    const preset = applyCamera(pitch, display.simulation);
    drawOverlays(ensureOverlay(pitch), display.simulation, players);
    updateBanner(ui, now);
    ui.replayBadge?.classList.toggle("show", runtime.replay.active);
    const status = ui.hud?.querySelector?.("[data-me11-status]");
    if (status) status.textContent = `${runtime.replay.active ? "REPLAY" : "ME11"} · ${preset.label} · ${Math.round((display.simulation.simulationTime || 0)/60)}'`;
    runtime.appliedFrames += 1;
    return true;
  }

  function applyFrame(force = false) {
    if (typeof document === "undefined" || !runtime.enabled) return false;
    const now = globalThis.performance?.now?.() || Date.now();
    if (!force && now - runtime.lastFrameAt < FRAME_INTERVAL - 1) return false;
    runtime.lastFrameAt = now;
    const context = activeContext();
    const snapshot = adapter()?.getSnapshot?.();
    const simulation = snapshot?.simulation;
    const pitch = document.getElementById("managerMatchMount")?.querySelector?.(".manager-2d-pitch");
    if (!context || !simulation || !pitch) return false;
    eventPresentation(simulation, now);
    recordFrame(simulation, now);
    markOfficialVisual(context);
    runtime.lastFixtureId = context.fixture.id;
    return renderSimulation(pitch, simulation, now);
  }

  function loop() {
    applyFrame(false);
    runtime.raf = typeof globalThis.requestAnimationFrame === "function" ? globalThis.requestAnimationFrame(loop) : globalThis.setTimeout(loop, 16);
  }

  function startObserver() {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined" || runtime.observer) return;
    runtime.observer = new MutationObserver(() => applyFrame(true));
    runtime.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function enable() {
    runtime.enabled = true;
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    oldLive()?.disable?.();
    savePreference();
    if (!runtime.raf) loop();
    applyFrame(true);
    return getStatus();
  }

  function disable() {
    runtime.enabled = false;
    savePreference();
    stopReplay();
    return getStatus();
  }

  function setCameraMode(mode) {
    const safe = ["BROADCAST", "TACTICAL", "FOLLOW_BALL", "HIGHLIGHT"].includes(String(mode).toUpperCase()) ? String(mode).toUpperCase() : "BROADCAST";
    runtime.cameraMode = safe; savePreference(); return safe;
  }

  function getStatus() {
    return {
      version: VERSION,
      enabled: runtime.enabled,
      fixtureId: runtime.lastFixtureId,
      appliedFrames: runtime.appliedFrames,
      cameraMode: runtime.cameraMode,
      overlays: runtime.overlays,
      autoReplay: runtime.autoReplay,
      replayActive: runtime.replay.active,
      replayFrames: replayStore.frames.length,
      contract: {
        simulationAuthority: "PHASE10_CORE",
        interpolation: "PHASE11_60FPS",
        animationState: "PHASE11",
        collisionAvoidance: "PHASE11_VISUAL_ONLY",
        ballHeightSpinTrail: "PHASE11",
        camera: "PHASE11",
        replay: "PHASE11",
        tacticalOverlay: "PHASE11",
        matchOutcomeInfluence: "NONE"
      }
    };
  }

  function boot() {
    const preference = readPreference();
    runtime.enabled = preference.enabled !== false;
    runtime.cameraMode = preference.cameraMode || "BROADCAST";
    runtime.overlays = preference.overlays !== false;
    runtime.autoReplay = preference.autoReplay !== false;
    ensureStyles();
    oldLive()?.disable?.();
    adapter()?.enable?.();
    adapter()?.setPollInterval?.(125);
    startObserver();
    loop();
    applyFrame(true);
    console.info(`[Match Engine V4] Phase 11 2D visual experience ready · ${VERSION}`);
  }

  const API = Object.freeze({
    VERSION,
    enable,
    disable,
    applyFrame,
    renderSimulation,
    startReplay,
    stopReplay,
    setCameraMode,
    getStatus,
    __diagnostics: { interpolatePoint, angleBetween, inferAnimation, computeCollisionOffsets, cameraPreset, ReplayBuffer, copyFrame, eventSignature }
  });

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE11 = adapter();
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE = API;
  globalThis.FIFA_MATCH_ENGINE_V4_LIVE = API;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();
(() => {
  "use strict";

  const BASE = globalThis.FIFA_MATCH_ENGINE_V4;
  if (!BASE?.createEngine) return;

  const VERSION = "4.0.0-phase12.1";
  const HEAT_COLS = 12;
  const HEAT_ROWS = 8;
  const MOMENTUM_BUCKET_SECONDS = 300;
  const REPLAY_SAMPLE_SECONDS = 1;
  const HEAT_SAMPLE_SECONDS = 2;
  const MAX_REPLAY_FRAMES = 7600;
  const REGISTRY = new Map();
  let latestAnalytics = null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const round = (value, digits = 2) => {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
  };
  const clone = value => {
    if (value == null) return value;
    try { return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)); }
    catch { return JSON.parse(JSON.stringify(value)); }
  };
  const point = value => ({ x: Number(value?.x || 0), y: Number(value?.y || 0) });
  const eventTime = event => Number(event?.second ?? event?.at ?? 0);
  const eventType = event => String(event?.type || "").toUpperCase();
  const opponent = side => side === "home" ? "away" : "home";
  const progress = (side, x) => side === "home" ? clamp(x, 0, 100) : clamp(100 - x, 0, 100);

  function zoneValue(side, position) {
    const p = progress(side, Number(position?.x || 0));
    const y = clamp(Number(position?.y || 34), 0, 68);
    const centrality = 1 - Math.min(1, Math.abs(y - 34) / 34);
    const boxBoost = p >= 83 && y >= 13.84 && y <= 54.16 ? 0.22 : 0;
    const finalThird = p >= 67 ? 0.09 : 0;
    return clamp(
      0.008 + Math.pow(p / 100, 2.15) * (0.32 + centrality * 0.50) + boxBoost + finalThird,
      0,
      0.98
    );
  }

  function newGrid() {
    return Array.from({ length: HEAT_ROWS }, () => Array(HEAT_COLS).fill(0));
  }

  function addGrid(grid, position, weight = 1) {
    const col = clamp(Math.floor(Number(position?.x || 0) / 100 * HEAT_COLS), 0, HEAT_COLS - 1);
    const row = clamp(Math.floor(Number(position?.y || 0) / 68 * HEAT_ROWS), 0, HEAT_ROWS - 1);
    grid[row][col] += Number(weight || 0);
  }

  function normalizedGrid(grid) {
    const max = Math.max(1, ...grid.flat());
    return grid.map(row => row.map(value => round(value / max, 4)));
  }

  function emptyPlayerMetrics(player, side) {
    return {
      id: player.id,
      name: player.name,
      number: player.number,
      side,
      group: player.group,
      role: player.attackRole || player.role,
      minutes: 0,
      goals: 0,
      assists: 0,
      shots: 0,
      shotsOnTarget: 0,
      xg: 0,
      xgot: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      progressivePasses: 0,
      keyPasses: 0,
      expectedAssists: 0,
      xtPass: 0,
      carries: 0,
      progressiveCarries: 0,
      xtCarry: 0,
      dribblesCompleted: 0,
      tacklesWon: 0,
      interceptions: 0,
      recoveries: 0,
      pressures: 0,
      foulsCommitted: 0,
      foulsSuffered: 0,
      yellowCards: 0,
      redCards: 0,
      saves: 0,
      savesHeld: 0,
      savesParried: 0,
      goalsConceded: 0,
      turnovers: 0,
      touches: 0,
      distance: 0,
      sprintDistance: 0,
      averagePosition: { x: 0, y: 0, samples: 0 },
      rating: 6.5
    };
  }

  function emptyTeamMetrics(side) {
    return {
      side,
      xg: 0,
      xgot: 0,
      xt: 0,
      xtPass: 0,
      xtCarry: 0,
      shots: 0,
      shotsOnTarget: 0,
      bigChances: 0,
      goals: 0,
      keyPasses: 0,
      progressivePasses: 0,
      progressiveCarries: 0,
      boxEntries: 0,
      finalThirdEntries: 0,
      pressureRegains: 0,
      fieldTiltTouches: 0,
      possessionSamples: 0,
      possessionOwnSamples: 0,
      sequenceCount: 0,
      averageSequenceDuration: 0,
      averageSequencePasses: 0,
      ppda: null
    };
  }

  class MatchAnalytics {
    constructor(engine, config = {}, snapshotProvider = null) {
      this.engine = engine;
      this.snapshotProvider = snapshotProvider || (() => engine.getSnapshot());
      this.matchId = config.matchId || engine.seed || `analysis-${Date.now()}`;
      this.seed = engine.seed;
      this.events = [];
      this.shots = [];
      this.passes = [];
      this.carries = [];
      this.timeline = [];
      this.possessionChains = [];
      this.currentChain = null;
      this.pendingPasses = [];
      this.lastCompletedPass = { home: null, away: null };
      this.team = { home: emptyTeamMetrics("home"), away: emptyTeamMetrics("away") };
      this.players = new Map();
      this.playerSides = new Map();
      this.heatmaps = { home: newGrid(), away: newGrid(), players: new Map() };
      this.averagePositions = new Map();
      this.passNetwork = new Map();
      this.momentum = Array.from({ length: 24 }, (_, index) => ({
        from: index * 5,
        to: (index + 1) * 5,
        home: 0,
        away: 0,
        homeXg: 0,
        awayXg: 0,
        homePossession: 0,
        awayPossession: 0
      }));
      this.replayFrames = [];
      this.replayClips = [];
      this.pendingClips = [];
      this.lastHeatSampleAt = -999;
      this.lastReplaySampleAt = -999;
      this.lastPosition = new Map();
      this.lastSnapshot = null;
      this.finalized = false;
      this.playerLookupInitialized = false;
      this.unsubscribe = engine.onEvent(event => this.consume(event));
      this.sample(true);
    }

    initializePlayers(snapshot = this.snapshotProvider()) {
      if (this.playerLookupInitialized || !snapshot?.teams) return;
      ["home", "away"].forEach(side => {
        (snapshot.teams[side]?.players || []).forEach(player => {
          this.players.set(player.id, emptyPlayerMetrics(player, side));
          this.playerSides.set(player.id, side);
          this.heatmaps.players.set(player.id, newGrid());
          this.averagePositions.set(player.id, { x: 0, y: 0, samples: 0 });
          this.lastPosition.set(player.id, point(player.point));
        });
      });
      this.playerLookupInitialized = true;
    }

    playerMetric(id) {
      return id ? this.players.get(id) || null : null;
    }

    momentumBucket(second) {
      const index = clamp(Math.floor(Number(second || 0) / MOMENTUM_BUCKET_SECONDS), 0, this.momentum.length - 1);
      return this.momentum[index];
    }

    addMomentum(side, value, second, kind = null) {
      if (!this.team[side]) return;
      const bucket = this.momentumBucket(second);
      bucket[side] += Number(value || 0);
      if (kind === "xg") bucket[`${side}Xg`] += Number(value || 0);
    }

    openChain(side, second, reason = "POSSESSION") {
      if (this.currentChain?.side === side) return this.currentChain;
      this.closeChain(second, "CHANGE");
      this.currentChain = {
        id: `chain-${this.possessionChains.length + 1}`,
        side,
        start: second,
        end: second,
        reason,
        events: [],
        passes: 0,
        carries: 0,
        shots: 0,
        xg: 0,
        xt: 0,
        outcome: "OPEN"
      };
      return this.currentChain;
    }

    closeChain(second, outcome = "TURNOVER") {
      if (!this.currentChain) return;
      this.currentChain.end = Math.max(this.currentChain.start, Number(second || this.currentChain.start));
      this.currentChain.duration = round(this.currentChain.end - this.currentChain.start, 1);
      this.currentChain.outcome = outcome;
      this.possessionChains.push(this.currentChain);
      if (this.possessionChains.length > 800) this.possessionChains.shift();
      this.currentChain = null;
    }

    chainEvent(event, side) {
      if (!side || !this.team[side]) return;
      const chain = this.openChain(side, eventTime(event), "EVENT");
      chain.end = eventTime(event);
      chain.events.push(event.id);
      if (chain.events.length > 80) chain.events.shift();
    }

    consume(event) {
      this.initializePlayers();
      const row = clone(event);
      const type = eventType(row);
      const second = eventTime(row);
      const side = row.side || this.playerSides.get(row.playerId) || null;
      this.events.push(row);
      if (this.events.length > 8000) this.events.shift();
      if (side && type !== "POSSESSION_CHANGE") this.chainEvent(row, side);

      const metric = this.playerMetric(row.playerId);
      if (metric) metric.touches += 1;

      if (["PASS_ATTEMPT", "CROSS_ATTEMPT"].includes(type)) this.registerPassAttempt(row);
      else if (["PASS_COMPLETE", "CROSS_COMPLETE"].includes(type)) this.completePass(row, "COMPLETE");
      else if (["PASS_INTERCEPTED", "PASS_MISPLACED", "CROSS_MISPLACED", "PASS_DEFLECTED", "CROSS_DEFLECTED", "OFFSIDE"].includes(type)) this.completePass(row, type);
      else if (type === "SHOT") this.registerShot(row);
      else if (["SHOT_BLOCKED", "SHOT_OFF_TARGET", "WOODWORK", "SAVE_HELD", "SAVE_PARRIED", "GOAL"].includes(type)) this.completeShot(row, type);
      else if (type === "CARRY") this.registerCarry(row);
      else if (type === "DRIBBLE_SUCCESS") {
        if (metric) metric.dribblesCompleted += 1;
        this.addMomentum(side, 0.7, second);
      } else if (type === "TACKLE_WON") {
        if (metric) metric.tacklesWon += 1;
        this.addMomentum(side, 0.55, second);
      } else if (type === "PASS_INTERCEPTED") {
        const defender = this.playerMetric(row.opponentId);
        if (defender) defender.interceptions += 1;
      } else if (["LOOSE_BALL_WON", "SECOND_BALL_WON", "COUNTER_PRESS_REGAIN", "POSSESSION_CHANGE"].includes(type)) {
        if (metric) metric.recoveries += 1;
        if (type === "COUNTER_PRESS_REGAIN" && side) this.team[side].pressureRegains += 1;
        this.addMomentum(side, type === "COUNTER_PRESS_REGAIN" ? 1.2 : 0.45, second);
      }

      if (["PRESS_TRIGGERED"].includes(type) && side) {
        const presser = this.playerMetric(row.primaryPresserId);
        if (presser) presser.pressures += 1;
      }
      if (type === "FOUL") {
        const offender = this.playerMetric(row.playerId);
        const victim = this.playerMetric(row.victimId);
        if (offender) offender.foulsCommitted += 1;
        if (victim) victim.foulsSuffered += 1;
      }
      if (type === "YELLOW_CARD" && metric) metric.yellowCards += 1;
      if (["SAVE_HELD", "SAVE_PARRIED"].includes(type) && metric) { metric.saves += 1; if (type === "SAVE_HELD") metric.savesHeld += 1; else metric.savesParried += 1; }
      if (type === "GOAL" && row.goalkeeperId) { const goalkeeperMetric = this.playerMetric(row.goalkeeperId); if (goalkeeperMetric) goalkeeperMetric.goalsConceded += 1; }
      if (["RED_CARD", "SECOND_YELLOW"].includes(type) && metric) metric.redCards = 1;
      if (["PASS_INTERCEPTED", "PASS_MISPLACED", "CROSS_MISPLACED", "MISCONTROL", "HEAVY_FIRST_TOUCH", "HOLD_UP_LOST"].includes(type) && metric) metric.turnovers += 1;

      if (type === "POSSESSION_CHANGE") {
        this.closeChain(second, row.reason || "POSSESSION_CHANGE");
        this.openChain(side, second, row.reason || "POSSESSION_CHANGE");
      }
      if (type === "GOAL") {
        this.closeChain(second, "GOAL");
        this.addTimeline(row, "GOAL", 100);
        this.queueReplayClip(row, 12, 10);
      } else if (type === "RED_CARD") {
        this.addTimeline(row, "RED_CARD", 90);
        this.queueReplayClip(row, 8, 7);
      } else if (type === "PENALTY_TAKEN") {
        this.addTimeline(row, "PENALTY", 80);
        this.queueReplayClip(row, 7, 7);
      } else if (type === "SHOT" && Number(row.xg || 0) >= 0.28) {
        this.addTimeline(row, "BIG_CHANCE", 70);
        this.queueReplayClip(row, 9, 7);
      } else if (["TACTICAL_CHANGE", "SUBSTITUTION", "INJURY_SUBSTITUTION", "SECOND_YELLOW", "WOODWORK"].includes(type)) {
        this.addTimeline(row, type, type === "WOODWORK" ? 65 : 50);
      }
      if (type === "FULL_TIME") {
        this.closeChain(second, "FULL_TIME");
        this.finalize();
      }
    }

    addTimeline(event, category, importance = 50) {
      this.timeline.push({
        id: event.id,
        second: eventTime(event),
        minute: Number(event.minute ?? Math.floor(eventTime(event) / 60)),
        type: eventType(event),
        category,
        importance,
        side: event.side || null,
        playerId: event.playerId || event.shooterId || null,
        payload: clone(event)
      });
      this.timeline.sort((a, b) => a.second - b.second || b.importance - a.importance);
      if (this.timeline.length > 500) this.timeline.shift();
    }

    registerPassAttempt(event) {
      const side = event.side;
      if (!this.team[side]) return;
      const start = point(event.from);
      const end = point(event.to);
      const passer = this.playerMetric(event.playerId);
      if (passer) passer.passesAttempted += 1;
      const startValue = zoneValue(side, start);
      const endValue = zoneValue(side, end);
      const xtPotential = Math.max(0, endValue - startValue) * 0.035;
      const progressive = progress(side, end.x) - progress(side, start.x) >= 10 || progress(side, end.x) >= 67 && progress(side, start.x) < 67;
      const pass = {
        id: event.id,
        second: eventTime(event),
        minute: event.minute,
        side,
        playerId: event.playerId,
        receiverId: event.receiverId,
        from: start,
        to: end,
        distance: Number(event.distance || 0),
        band: event.band || null,
        type: eventType(event).startsWith("CROSS") ? "CROSS" : "PASS",
        predictedOutcome: event.predictedOutcome || null,
        outcome: "PENDING",
        completed: false,
        progressive,
        xtPotential: round(xtPotential, 4),
        xt: 0,
        keyPass: false,
        assist: false,
        expectedAssist: 0
      };
      this.passes.push(pass);
      this.pendingPasses.push(pass);
      if (this.passes.length > 4500) this.passes.shift();
      if (this.currentChain?.side === side) this.currentChain.passes += 1;
      if (progress(side, end.x) >= 67) this.team[side].finalThirdEntries += 1;
      if (progress(side, end.x) >= 83 && end.y >= 13.84 && end.y <= 54.16) this.team[side].boxEntries += 1;
    }

    findPendingPass(event) {
      for (let index = this.pendingPasses.length - 1; index >= 0; index -= 1) {
        const pass = this.pendingPasses[index];
        if (pass.outcome !== "PENDING") continue;
        if (pass.playerId !== event.playerId && pass.receiverId !== event.playerId && pass.receiverId !== event.receiverId) continue;
        if (Math.abs(pass.second - eventTime(event)) > 6) continue;
        return pass;
      }
      return this.pendingPasses.findLast?.(pass => pass.outcome === "PENDING") || null;
    }

    completePass(event, outcome) {
      const pass = this.findPendingPass(event);
      if (!pass) return;
      pass.outcome = outcome;
      pass.completed = outcome === "COMPLETE";
      const passer = this.playerMetric(pass.playerId);
      if (pass.completed) {
        pass.xt = pass.xtPotential;
        if (passer) {
          passer.passesCompleted += 1;
          passer.xtPass += pass.xt;
          if (pass.progressive) passer.progressivePasses += 1;
        }
        this.team[pass.side].xtPass += pass.xt;
        this.team[pass.side].xt += pass.xt;
        if (pass.progressive) this.team[pass.side].progressivePasses += 1;
        this.lastCompletedPass[pass.side] = pass;
        const networkKey = `${pass.side}:${pass.playerId}>${pass.receiverId}`;
        const edge = this.passNetwork.get(networkKey) || { side: pass.side, fromId: pass.playerId, toId: pass.receiverId, passes: 0, xt: 0, progressive: 0 };
        edge.passes += 1;
        edge.xt += pass.xt;
        if (pass.progressive) edge.progressive += 1;
        this.passNetwork.set(networkKey, edge);
        this.addMomentum(pass.side, 0.12 + pass.xt * 9 + (pass.progressive ? 0.35 : 0), eventTime(event));
        if (this.currentChain?.side === pass.side) this.currentChain.xt += pass.xt;
      }
      if (outcome === "PASS_INTERCEPTED") {
        const defender = this.playerMetric(event.opponentId);
        if (defender) defender.interceptions += 1;
        this.addMomentum(opponent(pass.side), 0.65, eventTime(event));
      }
      this.pendingPasses = this.pendingPasses.filter(row => row !== pass);
    }

    registerCarry(event) {
      const side = event.side;
      if (!this.team[side]) return;
      const to = point(event.to);
      const from = point(this.lastPosition.get(event.playerId) || to);
      const xt = Math.max(0, zoneValue(side, to) - zoneValue(side, from)) * 0.035;
      const progressive = progress(side, to.x) - progress(side, from.x) >= 8;
      const row = {
        id: event.id,
        second: eventTime(event),
        side,
        playerId: event.playerId,
        from,
        to,
        xt: round(xt, 4),
        progressive
      };
      this.carries.push(row);
      if (this.carries.length > 2500) this.carries.shift();
      const metric = this.playerMetric(event.playerId);
      if (metric) {
        metric.carries += 1;
        metric.xtCarry += xt;
        if (progressive) metric.progressiveCarries += 1;
      }
      this.team[side].xtCarry += xt;
      this.team[side].xt += xt;
      if (progressive) this.team[side].progressiveCarries += 1;
      this.addMomentum(side, 0.18 + xt * 10 + (progressive ? 0.25 : 0), eventTime(event));
      if (this.currentChain?.side === side) {
        this.currentChain.carries += 1;
        this.currentChain.xt += xt;
      }
    }

    registerShot(event) {
      const side = event.side;
      if (!this.team[side]) return;
      const shot = {
        id: event.id,
        second: eventTime(event),
        minute: event.minute,
        side,
        playerId: event.playerId,
        goalkeeperId: event.goalkeeperId || null,
        from: point(event.from),
        target: clone(event.target),
        xg: Number(event.xg || 0),
        xgot: Number(event.xgot || 0),
        shotType: event.shotType || "SHOT",
        source: event.source || "OPEN_PLAY",
        opportunity: Number(event.opportunity || 0),
        predictedOutcome: event.predictedOutcome || null,
        outcome: "PENDING",
        onTarget: !["OFF_TARGET", "POST", "BLOCK"].includes(event.predictedOutcome),
        goal: false,
        assistPlayerId: null
      };
      this.shots.push(shot);
      if (this.shots.length > 1000) this.shots.shift();
      this.team[side].shots += 1;
      this.team[side].xg += shot.xg;
      this.team[side].xgot += shot.xgot;
      if (shot.onTarget) this.team[side].shotsOnTarget += 1;
      if (shot.xg >= 0.28) this.team[side].bigChances += 1;
      const shooter = this.playerMetric(shot.playerId);
      if (shooter) {
        shooter.shots += 1;
        shooter.xg += shot.xg;
        shooter.xgot += shot.xgot;
        if (shot.onTarget) shooter.shotsOnTarget += 1;
      }
      const pass = this.lastCompletedPass[side];
      if (pass && shot.second - pass.second <= 10 && pass.receiverId === shot.playerId) {
        pass.keyPass = true;
        pass.expectedAssist += shot.xg;
        shot.assistPlayerId = pass.playerId;
        const passer = this.playerMetric(pass.playerId);
        if (passer) {
          passer.keyPasses += 1;
          passer.expectedAssists += shot.xg;
        }
        this.team[side].keyPasses += 1;
      }
      this.addMomentum(side, 1.2 + shot.xg * 10, shot.second);
      this.momentumBucket(shot.second)[`${side}Xg`] += shot.xg;
      if (this.currentChain?.side === side) {
        this.currentChain.shots += 1;
        this.currentChain.xg += shot.xg;
      }
    }

    findPendingShot(event) {
      const actor = event.playerId || event.shooterId;
      for (let index = this.shots.length - 1; index >= 0; index -= 1) {
        const shot = this.shots[index];
        if (shot.outcome !== "PENDING") continue;
        if (actor && shot.playerId !== actor) continue;
        if (Math.abs(shot.second - eventTime(event)) <= 6) return shot;
      }
      return this.shots.findLast?.(shot => shot.outcome === "PENDING") || null;
    }

    completeShot(event, outcome) {
      const shot = this.findPendingShot(event);
      if (!shot) return;
      shot.outcome = outcome;
      shot.goal = outcome === "GOAL";
      if (outcome === "GOAL") {
        this.team[shot.side].goals += 1;
        const shooter = this.playerMetric(shot.playerId);
        if (shooter) shooter.goals += 1;
        if (shot.assistPlayerId) {
          const pass = [...this.passes].reverse().find(row => row.playerId === shot.assistPlayerId && row.receiverId === shot.playerId && row.keyPass && shot.second - row.second <= 12);
          if (pass) {
            pass.assist = true;
            const assister = this.playerMetric(pass.playerId);
            if (assister) assister.assists += 1;
          }
        }
      }
      if (["SAVE_HELD", "SAVE_PARRIED", "GOAL"].includes(outcome)) shot.onTarget = true;
      if (outcome === "WOODWORK") this.addMomentum(shot.side, 1.0, eventTime(event));
    }

    sample(force = false) {
      const snapshot = this.snapshotProvider();
      if (!snapshot?.teams) return;
      this.initializePlayers(snapshot);
      this.lastSnapshot = snapshot;
      const second = Number(snapshot.simulationTime || 0);
      if (force || second - this.lastHeatSampleAt >= HEAT_SAMPLE_SECONDS) {
        this.lastHeatSampleAt = second;
        ["home", "away"].forEach(side => {
          const own = snapshot.possessionSide === side;
          this.team[side].possessionSamples += 1;
          if (own) this.team[side].possessionOwnSamples += 1;
          this.momentumBucket(second)[`${side}Possession`] += own ? 1 : 0;
          (snapshot.teams[side]?.players || []).forEach(player => {
            const pos = point(player.point);
            addGrid(this.heatmaps[side], pos, 1);
            addGrid(this.heatmaps.players.get(player.id), pos, 1);
            const average = this.averagePositions.get(player.id);
            if (average) {
              average.x += pos.x;
              average.y += pos.y;
              average.samples += 1;
            }
            const metric = this.playerMetric(player.id);
            if (metric) {
              metric.minutes = Math.max(metric.minutes, second / 60);
              metric.distance = Number(player.totalDistance || metric.distance || 0);
              metric.sprintDistance = Number(player.sprintDistance || metric.sprintDistance || 0);
            }
            this.lastPosition.set(player.id, pos);
            if (progress(side, pos.x) >= 67 && own) this.team[side].fieldTiltTouches += 1;
          });
        });
      }
      if (force || second - this.lastReplaySampleAt >= REPLAY_SAMPLE_SECONDS) {
        this.lastReplaySampleAt = second;
        const frame = {
          second: round(second, 1),
          score: clone(snapshot.score),
          possessionSide: snapshot.possessionSide,
          phase: snapshot.phase,
          ball: [round(snapshot.ball?.position?.x, 2), round(snapshot.ball?.position?.y, 2), round(snapshot.ball?.height, 2)],
          players: []
        };
        ["home", "away"].forEach(side => {
          (snapshot.teams[side]?.players || []).forEach(player => {
            frame.players.push([
              player.id,
              round(player.point?.x, 2),
              round(player.point?.y, 2),
              round(player.shortTermEnergy ?? player.energy, 1),
              player.physicalStatus || "FIT"
            ]);
          });
        });
        this.replayFrames.push(frame);
        if (this.replayFrames.length > MAX_REPLAY_FRAMES) this.replayFrames.shift();
        this.finalizePendingClips(second);
      }
    }

    queueReplayClip(event, before = 8, after = 6) {
      const second = eventTime(event);
      this.pendingClips.push({
        id: `clip-${event.id}`,
        eventId: event.id,
        type: eventType(event),
        side: event.side || null,
        playerId: event.playerId || event.shooterId || null,
        second,
        before,
        after,
        finalizeAt: second + after
      });
    }

    finalizePendingClips(second) {
      const ready = this.pendingClips.filter(clip => second >= clip.finalizeAt);
      ready.forEach(clip => {
        const from = clip.second - clip.before;
        const to = clip.second + clip.after;
        const frames = this.replayFrames.filter(frame => frame.second >= from && frame.second <= to);
        this.replayClips.push({ ...clip, from, to, frames: clone(frames) });
      });
      this.pendingClips = this.pendingClips.filter(clip => second < clip.finalizeAt);
      if (this.replayClips.length > 80) this.replayClips.splice(0, this.replayClips.length - 80);
    }

    calculateRatings() {
      this.initializePlayers();
      this.players.forEach(metric => {
        const passAccuracy = metric.passesAttempted ? metric.passesCompleted / metric.passesAttempted : 0.72;
        const discipline = metric.yellowCards * 0.17 + metric.redCards * 1.15;
        const waste = metric.turnovers * 0.025;
        const creation = metric.keyPasses * 0.13 + metric.expectedAssists * 0.42 + metric.assists * 0.62;
        const threat = metric.goals * 0.88 + metric.xg * 0.12 + metric.xtPass * 1.8 + metric.xtCarry * 1.6;
        const defence = metric.tacklesWon * 0.045 + metric.interceptions * 0.06 + metric.recoveries * 0.025;
        const retention = (passAccuracy - 0.72) * 1.1;
        if (metric.group === "GK") {
          const cleanSheet = metric.goalsConceded === 0 ? 0.28 : 0;
          metric.rating = round(clamp(6.15 + metric.saves * 0.13 + metric.savesHeld * 0.04 + cleanSheet - metric.goalsConceded * 0.30 - discipline, 3.5, 10), 2);
        } else {
          metric.rating = round(clamp(6.35 + creation + threat + defence + retention - discipline - waste, 3.5, 10), 2);
        }
        const average = this.averagePositions.get(metric.id);
        if (average?.samples) metric.averagePosition = { x: round(average.x / average.samples, 2), y: round(average.y / average.samples, 2), samples: average.samples };
      });
    }

    calculateTeamMetrics() {
      ["home", "away"].forEach(side => {
        const team = this.team[side];
        const chains = this.possessionChains.filter(chain => chain.side === side);
        team.sequenceCount = chains.length;
        team.averageSequenceDuration = chains.length ? round(chains.reduce((sum, row) => sum + Number(row.duration || 0), 0) / chains.length, 2) : 0;
        team.averageSequencePasses = chains.length ? round(chains.reduce((sum, row) => sum + Number(row.passes || 0), 0) / chains.length, 2) : 0;
        team.possession = team.possessionSamples ? round(team.possessionOwnSamples / team.possessionSamples * 100, 1) : 50;
        const opponentPasses = this.passes.filter(row => row.side === opponent(side) && row.completed && progress(row.side, row.from.x) <= 60).length;
        const defensiveActions = [...this.players.values()].filter(player => player.side === side).reduce((sum, player) => sum + player.tacklesWon + player.interceptions + player.pressures, 0);
        team.ppda = defensiveActions ? round(opponentPasses / defensiveActions, 2) : null;
      });
    }

    finalize() {
      if (this.finalized) return;
      this.finalized = true;
      this.sample(true);
      this.finalizePendingClips(999999);
      this.calculateRatings();
      this.calculateTeamMetrics();
    }

    lightweightSummary() {
      this.calculateRatings();
      this.calculateTeamMetrics();
      return {
        version: VERSION,
        matchId: this.matchId,
        teams: clone(this.team),
        topPlayers: [...this.players.values()].sort((a, b) => b.rating - a.rating).slice(0, 5).map(player => ({ id: player.id, name: player.name, side: player.side, rating: player.rating, goals: player.goals, assists: player.assists, xg: round(player.xg, 2), xa: round(player.expectedAssists, 2), xt: round(player.xtPass + player.xtCarry, 3) })),
        momentum: this.momentum.map(row => ({ ...row, home: round(row.home, 2), away: round(row.away, 2), net: round(row.home - row.away, 2) })),
        shots: this.shots.length,
        passes: this.passes.length,
        replayFrames: this.replayFrames.length,
        replayClips: this.replayClips.length
      };
    }

    getReport(options = {}) {
      if (this.engine.status === "fulltime") this.finalize();
      else {
        this.calculateRatings();
        this.calculateTeamMetrics();
      }
      const includeFrames = options.includeReplayFrames === true;
      return {
        version: VERSION,
        matchId: this.matchId,
        seed: this.seed,
        generatedAtSecond: round(Number(this.engine.clockSeconds || 0), 1),
        teams: clone(this.team),
        shotMap: clone(this.shots),
        passMap: clone(this.passes),
        carryMap: clone(this.carries),
        passNetwork: [...this.passNetwork.values()].map(row => ({ ...row, xt: round(row.xt, 4) })).sort((a, b) => b.passes - a.passes),
        heatmaps: {
          home: normalizedGrid(this.heatmaps.home),
          away: normalizedGrid(this.heatmaps.away),
          players: Object.fromEntries([...this.heatmaps.players.entries()].map(([id, grid]) => [id, normalizedGrid(grid)]))
        },
        averagePositions: Object.fromEntries([...this.averagePositions.entries()].map(([id, value]) => [id, value.samples ? { x: round(value.x / value.samples, 2), y: round(value.y / value.samples, 2), samples: value.samples } : { x: 0, y: 0, samples: 0 }])),
        momentum: this.momentum.map(row => ({ ...row, home: round(row.home, 2), away: round(row.away, 2), net: round(row.home - row.away, 2) })),
        players: [...this.players.values()].map(player => ({ ...clone(player), xg: round(player.xg, 3), xgot: round(player.xgot, 3), expectedAssists: round(player.expectedAssists, 3), xtPass: round(player.xtPass, 4), xtCarry: round(player.xtCarry, 4) })).sort((a, b) => b.rating - a.rating),
        possessionChains: clone(this.possessionChains).sort((a, b) => (b.xg + b.xt) - (a.xg + a.xt)).slice(0, 100),
        timeline: clone(this.timeline),
        replayArchive: {
          frameIntervalSeconds: REPLAY_SAMPLE_SECONDS,
          frameCount: this.replayFrames.length,
          clips: clone(this.replayClips),
          frames: includeFrames ? clone(this.replayFrames) : undefined
        }
      };
    }

    exportReplayArchive() {
      return {
        version: VERSION,
        matchId: this.matchId,
        seed: this.seed,
        frameIntervalSeconds: REPLAY_SAMPLE_SECONDS,
        frames: clone(this.replayFrames),
        clips: clone(this.replayClips),
        timeline: clone(this.timeline)
      };
    }

    getReplayClip(id) {
      return clone(this.replayClips.find(clip => clip.id === id || clip.eventId === id) || null);
    }
  }

  function decorateEngine(engine, config = {}) {
    if (engine.__phase12Analytics) return engine;
    const baseStep = engine.step.bind(engine);
    const baseSnapshot = engine.getSnapshot.bind(engine);
    const baseReport = engine.getReport.bind(engine);
    const analytics = new MatchAnalytics(engine, config, baseSnapshot);
    engine.__phase12Analytics = analytics;
    engine.version = VERSION;
    REGISTRY.set(config.matchId || engine.seed, analytics);
    REGISTRY.set(engine.seed, analytics);
    while (REGISTRY.size > 8) REGISTRY.delete(REGISTRY.keys().next().value);
    latestAnalytics = analytics;

    engine.step = delta => {
      const result = baseStep(delta);
      analytics.sample();
      return result;
    };
    engine.runTo = (second, maxIterations = 120000) => {
      let guard = 0;
      const target = clamp(Number(second || 0), 0, Math.max(Number(engine.matchEndSeconds || 5400), 7200));
      while (engine.clockSeconds < target && engine.status === "live" && guard++ < maxIterations) engine.step(Math.min(1, target - engine.clockSeconds));
      return engine.getSnapshot();
    };
    engine.runFullMatch = () => {
      let guard = 0;
      while (engine.status === "live" && guard++ < 240000) engine.step(1);
      analytics.finalize();
      return engine.getSnapshot();
    };
    engine.getSnapshot = () => {
      const snapshot = baseSnapshot();
      return { ...snapshot, analytics: analytics.lightweightSummary() };
    };
    engine.getReport = () => {
      const report = baseReport();
      return { ...report, analysis: analytics.getReport() };
    };
    engine.getAnalytics = options => analytics.getReport(options);
    engine.getMatchAnalysis = options => analytics.getReport(options);
    engine.exportReplayArchive = () => analytics.exportReplayArchive();
    engine.getReplayClip = id => analytics.getReplayClip(id);
    return engine;
  }

  const CORE_API = Object.freeze({
    ...BASE,
    VERSION,
    ADVANCED_ANALYTICS_VERSION: 12,
    createEngine(config = {}) { return decorateEngine(BASE.createEngine(config), config); },
    getAnalyticsRegistry() { return REGISTRY; },
    getLatestAnalytics() { return latestAnalytics; },
    __phase12Base: BASE,
    __diagnostics: { MatchAnalytics, zoneValue, normalizedGrid, decorateEngine, REGISTRY }
  });

  globalThis.FIFA_MATCH_ENGINE_V4 = CORE_API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE12_CORE = CORE_API;

  const STORAGE_KEY = "fifa-me4-phase12-analysis";
  const LIVE = {
    enabled: true,
    timer: null,
    observer: null,
    activeTab: "summary",
    panelOpen: false,
    fixtureId: null,
    lastPersistAt: 0,
    renders: 0
  };

  const adapter = () => globalThis.FIFA_MATCH_ENGINE_V4_PHASE10 || globalThis.FIFA_MATCH_ENGINE_V4_PHASE9 || globalThis.FIFA_MATCH_ENGINE_V4_SHADOW;
  const room = () => globalThis.FIFA_MANAGER_ROOM;

  function activeContext() {
    const api = room();
    const career = api?.getCareer?.() || api?.getActiveCareer?.();
    const fixture = api?.getSelectedFixture?.() || career?.fixtures?.find?.(row => row?.id === career?.activeMatchFixtureId) || career?.fixtures?.find?.(row => ["live", "decision", "paused"].includes(row?.matchEngine?.status));
    if (!career || !fixture?.matchEngine) return null;
    return { api, career, fixture };
  }

  function currentAnalytics() {
    const snapshot = adapter()?.getSnapshot?.();
    const matchId = snapshot?.config?.matchId || snapshot?.fixtureId;
    return REGISTRY.get(matchId) || REGISTRY.get(snapshot?.simulation?.seed) || latestAnalytics;
  }

  function ensureStyles() {
    if (typeof document === "undefined" || document.getElementById("me12-style")) return;
    const style = document.createElement("style");
    style.id = "me12-style";
    style.textContent = `
      .me12-open{background:#153c4a!important;color:#f4d678!important;border-color:rgba(244,214,120,.48)!important}
      .me12-panel{position:absolute;inset:7% 4%;z-index:48;background:rgba(4,20,28,.97);border:1px solid rgba(118,205,230,.3);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.62);display:none;color:#eef8fa;overflow:hidden;font-family:Inter,system-ui,sans-serif}
      .me12-panel.open{display:grid;grid-template-rows:auto 1fr}.me12-head{display:flex;align-items:center;gap:7px;padding:10px 12px;background:#0a2834;border-bottom:1px solid rgba(255,255,255,.09);flex-wrap:wrap}
      .me12-title{font-weight:950;color:#f0cf72;margin-right:auto}.me12-tabs{display:flex;gap:5px;flex-wrap:wrap}.me12-tab,.me12-close{border:1px solid rgba(255,255,255,.16);background:#123744;color:#cce3e9;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:900;cursor:pointer}.me12-tab.active{background:#765d22;color:#fff0b2}
      .me12-body{overflow:auto;padding:12px}.me12-kpis{display:grid;grid-template-columns:repeat(6,minmax(90px,1fr));gap:8px}.me12-kpi{background:#09232e;border-radius:10px;padding:9px}.me12-kpi span{display:block;color:#86aab5;font-size:9px;font-weight:900}.me12-kpi b{font-size:17px;color:#f1d174}
      .me12-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.me12-card{background:#08212b;border-radius:12px;padding:10px}.me12-card h4{margin:0 0 8px;color:#f1cf71}.me12-svg{width:100%;aspect-ratio:100/68;background:repeating-linear-gradient(90deg,#17623e 0 10%,#1b6b43 10% 20%);border-radius:9px;border:1px solid rgba(255,255,255,.25)}
      .me12-table{width:100%;border-collapse:collapse;font-size:11px}.me12-table th,.me12-table td{padding:6px;border-bottom:1px solid rgba(255,255,255,.07);text-align:right}.me12-table th:first-child,.me12-table td:first-child{text-align:left}.me12-rating{color:#f1d174;font-weight:950}.me12-momentum{display:grid;grid-template-columns:repeat(18,1fr);gap:3px;height:150px;align-items:end}.me12-mbar{display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:2px}.me12-homebar{background:#37a9df;min-height:2px}.me12-awaybar{background:#e46d60;min-height:2px}.me12-heat{display:grid;grid-template-columns:repeat(12,1fr);aspect-ratio:100/68;border-radius:9px;overflow:hidden;background:#123d31}.me12-heat i{display:block;border:1px solid rgba(255,255,255,.025)}
      .me12-timeline{display:grid;gap:6px}.me12-event{display:grid;grid-template-columns:45px 90px 1fr;gap:8px;padding:7px;background:#09232e;border-radius:8px;font-size:11px}.me12-event b{color:#f0cf71}.me12-empty{padding:30px;text-align:center;color:#8daab3}
      @media(max-width:900px){.me12-panel{inset:4% 2%}.me12-kpis{grid-template-columns:repeat(3,1fr)}.me12-grid2{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if (typeof document === "undefined") return null;
    ensureStyles();
    const pitch = document.getElementById("managerMatchMount")?.querySelector?.(".manager-2d-pitch");
    if (!pitch) return null;
    const hud = pitch.querySelector(".me11-hud");
    if (hud && !hud.querySelector("[data-me12-open]")) {
      const button = document.createElement("button");
      button.dataset.me12Open = "";
      button.className = "me12-open";
      button.textContent = "ANALİZ";
      button.onclick = () => { LIVE.panelOpen = !LIVE.panelOpen; renderPanel(); };
      hud.appendChild(button);
    }
    let panel = pitch.querySelector(".me12-panel");
    if (!panel) {
      panel = document.createElement("section");
      panel.className = "me12-panel";
      panel.innerHTML = `<header class="me12-head"><div class="me12-title">ME12 · MATCH ANALYSIS</div><div class="me12-tabs">${["summary","momentum","shots","passes","heatmap","players","timeline"].map(tab => `<button class="me12-tab" data-me12-tab="${tab}">${tab.toUpperCase()}</button>`).join("")}</div><button class="me12-tab" data-me12-export>JSON</button><button class="me12-tab" data-me12-replay-export>REPLAY</button><button class="me12-close" data-me12-close>✕</button></header><div class="me12-body"></div>`;
      pitch.appendChild(panel);
      panel.querySelectorAll("[data-me12-tab]").forEach(button => button.onclick = () => { LIVE.activeTab = button.dataset.me12Tab; renderPanel(); });
      panel.querySelector("[data-me12-export]").onclick = () => downloadAnalysis();
      panel.querySelector("[data-me12-replay-export]").onclick = () => downloadReplayArchive();
      panel.querySelector("[data-me12-close]").onclick = () => { LIVE.panelOpen = false; renderPanel(); };
    }
    return panel;
  }

  function pitchSvg(report, mode = "shots") {
    const items = mode === "shots" ? report.shotMap : report.passMap.slice(-90);
    const body = items.map(item => {
      if (mode === "shots") {
        const fill = item.goal ? "#f4d15f" : item.outcome?.startsWith("SAVE") ? "#54c7ef" : item.outcome === "SHOT_BLOCKED" ? "#c69455" : "#ee7467";
        const radius = 0.8 + Math.sqrt(Math.max(0.01, item.xg || 0.01)) * 3.2;
        return `<circle cx="${item.from.x}" cy="${item.from.y}" r="${radius}" fill="${fill}" opacity=".85"><title>${item.playerId} · xG ${round(item.xg,2)} · ${item.outcome}</title></circle>`;
      }
      const color = item.completed ? item.side === "home" ? "#57c4ef" : "#f18b7e" : "#697b82";
      return `<line x1="${item.from.x}" y1="${item.from.y}" x2="${item.to.x}" y2="${item.to.y}" stroke="${color}" stroke-width="${item.progressive ? .55 : .28}" opacity="${item.completed ? .55 : .25}"/>`;
    }).join("");
    return `<svg class="me12-svg" viewBox="0 0 100 68" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="66" fill="none" stroke="rgba(255,255,255,.75)" stroke-width=".4"/><line x1="50" y1="1" x2="50" y2="67" stroke="rgba(255,255,255,.65)" stroke-width=".35"/><circle cx="50" cy="34" r="8" fill="none" stroke="rgba(255,255,255,.65)" stroke-width=".35"/>${body}</svg>`;
  }

  function heatHtml(grid) {
    return `<div class="me12-heat">${grid.flat().map(value => `<i style="background:rgba(242,199,75,${clamp(value,0,1)*.82})"></i>`).join("")}</div>`;
  }

  function renderPanel() {
    const panel = ensurePanel();
    if (!panel) return;
    panel.classList.toggle("open", LIVE.panelOpen);
    panel.querySelectorAll("[data-me12-tab]").forEach(button => button.classList.toggle("active", button.dataset.me12Tab === LIVE.activeTab));
    if (!LIVE.panelOpen) return;
    const analytics = currentAnalytics();
    const body = panel.querySelector(".me12-body");
    if (!analytics) { body.innerHTML = `<div class="me12-empty">Aktif Phase 12 analiz verisi bulunamadı.</div>`; return; }
    const report = analytics.getReport();
    const home = report.teams.home, away = report.teams.away;
    if (LIVE.activeTab === "summary") {
      body.innerHTML = `<div class="me12-kpis">
        <div class="me12-kpi"><span>xG</span><b>${round(home.xg,2)} – ${round(away.xg,2)}</b></div>
        <div class="me12-kpi"><span>xT</span><b>${round(home.xt,2)} – ${round(away.xt,2)}</b></div>
        <div class="me12-kpi"><span>ŞUT</span><b>${home.shots} – ${away.shots}</b></div>
        <div class="me12-kpi"><span>KEY PASS</span><b>${home.keyPasses} – ${away.keyPasses}</b></div>
        <div class="me12-kpi"><span>POSSESSION</span><b>${home.possession}% – ${away.possession}%</b></div>
        <div class="me12-kpi"><span>PPDA</span><b>${home.ppda ?? "—"} – ${away.ppda ?? "—"}</b></div>
      </div><div class="me12-grid2"><div class="me12-card"><h4>SHOT MAP</h4>${pitchSvg(report,"shots")}</div><div class="me12-card"><h4>TOP PLAYERS</h4>${playerTable(report.players.slice(0,8))}</div></div>`;
    } else if (LIVE.activeTab === "momentum") {
      const max = Math.max(1, ...report.momentum.flatMap(row => [row.home, row.away]));
      body.innerHTML = `<div class="me12-card"><h4>5 DAKİKALIK MOMENTUM</h4><div class="me12-momentum">${report.momentum.slice(0,18).map(row => `<div class="me12-mbar" title="${row.from}-${row.to}'"><i class="me12-awaybar" style="height:${row.away/max*48}%"></i><i class="me12-homebar" style="height:${row.home/max*48}%"></i></div>`).join("")}</div></div>`;
    } else if (LIVE.activeTab === "shots") {
      body.innerHTML = `<div class="me12-grid2"><div class="me12-card"><h4>SHOT MAP</h4>${pitchSvg(report,"shots")}</div><div class="me12-card"><h4>ŞUT LİSTESİ</h4><table class="me12-table"><thead><tr><th>Dk</th><th>Oyuncu</th><th>xG</th><th>Sonuç</th></tr></thead><tbody>${report.shotMap.slice().reverse().map(row => `<tr><td>${row.minute}'</td><td>${row.playerId}</td><td>${round(row.xg,2)}</td><td>${row.outcome}</td></tr>`).join("")}</tbody></table></div></div>`;
    } else if (LIVE.activeTab === "passes") {
      body.innerHTML = `<div class="me12-grid2"><div class="me12-card"><h4>PASS MAP</h4>${pitchSvg(report,"passes")}</div><div class="me12-card"><h4>PASS NETWORK</h4><table class="me12-table"><thead><tr><th>Bağlantı</th><th>Pas</th><th>xT</th></tr></thead><tbody>${report.passNetwork.slice(0,14).map(row => `<tr><td>${row.fromId} → ${row.toId}</td><td>${row.passes}</td><td>${round(row.xt,3)}</td></tr>`).join("")}</tbody></table></div></div>`;
    } else if (LIVE.activeTab === "heatmap") {
      body.innerHTML = `<div class="me12-grid2"><div class="me12-card"><h4>HOME HEATMAP</h4>${heatHtml(report.heatmaps.home)}</div><div class="me12-card"><h4>AWAY HEATMAP</h4>${heatHtml(report.heatmaps.away)}</div></div>`;
    } else if (LIVE.activeTab === "players") {
      body.innerHTML = `<div class="me12-card"><h4>OYUNCU PERFORMANSI</h4>${playerTable(report.players)}</div>`;
    } else {
      body.innerHTML = `<div class="me12-timeline">${report.timeline.slice().reverse().map(row => `<div class="me12-event"><b>${row.minute}'</b><span>${row.category}</span><span>${row.type} · ${row.playerId || ""}</span></div>`).join("") || `<div class="me12-empty">Önemli event henüz oluşmadı.</div>`}</div>`;
    }
    LIVE.renders += 1;
  }

  function playerTable(players) {
    return `<table class="me12-table"><thead><tr><th>Oyuncu</th><th>Rtg</th><th>G</th><th>A</th><th>xG</th><th>xA</th><th>xT</th></tr></thead><tbody>${players.map(player => `<tr><td>${player.name}</td><td class="me12-rating">${player.rating}</td><td>${player.goals}</td><td>${player.assists}</td><td>${round(player.xg,2)}</td><td>${round(player.expectedAssists,2)}</td><td>${round(player.xtPass+player.xtCarry,2)}</td></tr>`).join("")}</tbody></table>`;
  }

  function persistAnalysis() {
    const context = activeContext();
    const analytics = currentAnalytics();
    if (!context || !analytics) return;
    const now = Date.now();
    if (now - LIVE.lastPersistAt < 1200) return;
    LIVE.lastPersistAt = now;
    const report = analytics.getReport();
    context.fixture.matchEngine.matchAnalysis = {
      version: VERSION,
      generatedAtSecond: report.generatedAtSecond,
      teams: report.teams,
      players: report.players.slice(0, 22),
      momentum: report.momentum,
      shotMap: report.shotMap,
      passNetwork: report.passNetwork.slice(0, 50),
      averagePositions: report.averagePositions,
      timeline: report.timeline,
      replayClips: report.replayArchive.clips.map(clip => ({ id: clip.id, eventId: clip.eventId, type: clip.type, second: clip.second, from: clip.from, to: clip.to, frameCount: clip.frames.length }))
    };
    context.fixture.matchEngine.matchEngineV4 = context.fixture.matchEngine.matchEngineV4 || {};
    context.fixture.matchEngine.matchEngineV4.analyticsOfficial = true;
    context.fixture.matchEngine.matchEngineV4.analyticsVersion = VERSION;
    LIVE.fixtureId = context.fixture.id;
  }

  function poll() {
    if (!LIVE.enabled) return getStatus();
    ensurePanel();
    persistAnalysis();
    if (LIVE.panelOpen) renderPanel();
    return getStatus();
  }

  function startObserver() {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined" || LIVE.observer) return;
    LIVE.observer = new MutationObserver(() => ensurePanel());
    LIVE.observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function enable() {
    LIVE.enabled = true;
    if (!LIVE.timer) LIVE.timer = globalThis.setInterval?.(poll, 400);
    startObserver();
    poll();
    return getStatus();
  }

  function disable() {
    LIVE.enabled = false;
    if (LIVE.timer) globalThis.clearInterval?.(LIVE.timer);
    LIVE.timer = null;
    return getStatus();
  }

  function openAnalysis(tab = "summary") {
    LIVE.activeTab = tab;
    LIVE.panelOpen = true;
    renderPanel();
    return getStatus();
  }

  function closeAnalysis() {
    LIVE.panelOpen = false;
    renderPanel();
    return getStatus();
  }

  function getReport(options = {}) {
    return currentAnalytics()?.getReport(options) || null;
  }

  function exportReplayArchive() {
    return currentAnalytics()?.exportReplayArchive() || null;
  }

  function downloadJson(payload, filename) {
    if (typeof document === "undefined" || typeof Blob === "undefined" || !payload) return false;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = filename; link.style.display = "none"; document.body.appendChild(link); link.click(); link.remove();
    globalThis.setTimeout?.(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  function downloadAnalysis(filename = `match-analysis-phase12-${Date.now()}.json`) {
    return downloadJson(getReport({ includeReplayFrames: false }), filename);
  }

  function downloadReplayArchive(filename = `match-replay-phase12-${Date.now()}.json`) {
    return downloadJson(exportReplayArchive(), filename);
  }

  function getStatus() {
    return {
      version: VERSION,
      enabled: LIVE.enabled,
      fixtureId: LIVE.fixtureId,
      panelOpen: LIVE.panelOpen,
      activeTab: LIVE.activeTab,
      renders: LIVE.renders,
      analyticsAvailable: Boolean(currentAnalytics()),
      contract: {
        eventSource: "V4_OFFICIAL_EVENT_STREAM",
        shotMap: "PHASE12",
        passMap: "PHASE12",
        heatmap: "PHASE12",
        momentum: "PHASE12",
        xT: "PHASE12",
        playerRatings: "PHASE12",
        replayArchive: "PHASE12",
        matchOutcomeInfluence: "NONE"
      }
    };
  }

  const LIVE_API = Object.freeze({
    VERSION,
    enable,
    disable,
    poll,
    openAnalysis,
    closeAnalysis,
    getReport,
    exportReplayArchive,
    downloadAnalysis,
    downloadReplayArchive,
    getStatus,
    registry: REGISTRY,
    __diagnostics: { currentAnalytics, activeContext, pitchSvg, heatHtml, playerTable }
  });

  if (typeof module !== "undefined" && module.exports) module.exports = CORE_API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE12 = LIVE_API;
  globalThis.FIFA_MATCH_ENGINE_V4_ANALYTICS = LIVE_API;

  if (typeof document !== "undefined") {
    const boot = () => {
      enable();
      console.info(`[Match Engine V4] Phase 12 advanced analytics and replay ready · ${VERSION}`);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
  }
})();


(() => {
  "use strict";

  const BASE = globalThis.FIFA_MATCH_ENGINE_V4;
  if (!BASE) throw new Error("Phase 13 requires the embedded Phase 12 engine.");

  const VERSION = "4.0.0-phase13.1";
  const CALIBRATION_VERSION = 13;
  const PROFILE_VERSION = "ME4-BALANCE-2026.07-R1";

  const TARGETS = Object.freeze({
    goalsPerMatch: Object.freeze({ min: 2.0, max: 3.1, weight: 14, unit: "goals" }),
    shotsPerMatch: Object.freeze({ min: 20, max: 31, weight: 8, unit: "shots" }),
    shotsOnTargetPerMatch: Object.freeze({ min: 8, max: 15, weight: 7, unit: "shots" }),
    xgPerMatch: Object.freeze({ min: 2.8, max: 4.8, weight: 8, unit: "xG" }),
    passAccuracy: Object.freeze({ min: 76, max: 86, weight: 8, unit: "%" }),
    cornersPerMatch: Object.freeze({ min: 3, max: 9, weight: 4, unit: "corners" }),
    foulsPerMatch: Object.freeze({ min: 14, max: 34, weight: 5, unit: "fouls" }),
    yellowCardsPerMatch: Object.freeze({ min: 1.5, max: 7.0, weight: 5, unit: "cards" }),
    redCardsPerMatch: Object.freeze({ min: 0, max: 0.30, weight: 3, unit: "cards" }),
    injuriesPerMatch: Object.freeze({ min: 0, max: 0.30, weight: 3, unit: "injuries" }),
    drawRate: Object.freeze({ min: 0.20, max: 0.36, weight: 8, unit: "ratio" }),
    homeWinRate: Object.freeze({ min: 0.34, max: 0.54, weight: 8, unit: "ratio" }),
    awayWinRate: Object.freeze({ min: 0.18, max: 0.40, weight: 6, unit: "ratio" }),
    strongerTeamNonLossRate: Object.freeze({ min: 0.62, max: 0.90, weight: 10, unit: "ratio" }),
    setPieceGoalShare: Object.freeze({ min: 0.08, max: 0.28, weight: 3, unit: "ratio" })
  });

  const PROFILES = Object.freeze({
    neutral: Object.freeze({ id:"neutral", label:"Neutral / Engine Native", tempoScale:1, riskScale:1, pressingScale:1, directnessScale:1, setPieceRiskScale:1, tacklingRiskScale:1, homeRatingBonus:0, ratingSpreadScale:1, refereeProfile:null }),
    masterpiece: Object.freeze({ id:"masterpiece", label:"Masterpiece Balanced R1", tempoScale:1.03, riskScale:1.04, pressingScale:.96, directnessScale:1.03, setPieceRiskScale:1.08, tacklingRiskScale:.96, homeRatingBonus:.6, ratingSpreadScale:1.25, refereeProfile:"balanced" }),
    controlled: Object.freeze({ id:"controlled", label:"Controlled Tactical", tempoScale:.90, riskScale:.88, pressingScale:.92, directnessScale:.94, setPieceRiskScale:1, tacklingRiskScale:.92, homeRatingBonus:.4, ratingSpreadScale:1.15, refereeProfile:"balanced" }),
    aggressive: Object.freeze({ id:"aggressive", label:"High-Intensity", tempoScale:1.10, riskScale:1.10, pressingScale:1.12, directnessScale:1.06, setPieceRiskScale:1.04, tacklingRiskScale:1.08, homeRatingBonus:.7, ratingSpreadScale:1.20, refereeProfile:"strict" })
  });

  const DEFAULT_TOLERANCES = Object.freeze({
    goalsPerMatch:.30, shotsPerMatch:2.8, shotsOnTargetPerMatch:1.8, xgPerMatch:.55,
    passAccuracy:2.5, cornersPerMatch:1.4, foulsPerMatch:3.2, yellowCardsPerMatch:1.0,
    redCardsPerMatch:.10, injuriesPerMatch:.10, drawRate:.08, homeWinRate:.08,
    awayWinRate:.08, strongerTeamNonLossRate:.10, setPieceGoalShare:.07
  });

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const clamp = (value,min,max) => Math.max(min,Math.min(max,Number(value)||0));
  const round = (value, digits=3) => Number(Number(value||0).toFixed(digits));
  const mean = rows => rows.length ? rows.reduce((a,b)=>a+Number(b||0),0)/rows.length : 0;
  const stddev = rows => { const m=mean(rows); return rows.length ? Math.sqrt(mean(rows.map(v=>(Number(v||0)-m)**2))) : 0; };
  const ci95 = rows => rows.length ? 1.96*stddev(rows)/Math.sqrt(rows.length) : 0;
  const merge = (a,b) => ({...(a||{}),...(b||{})});
  const metric = (stats, key) => Number(stats?.[key] || 0);

  function resolveProfile(input="masterpiece") {
    if (typeof input === "string") return { ...(PROFILES[input] || PROFILES.masterpiece) };
    const base = PROFILES[input?.base || input?.id] || PROFILES.masterpiece;
    return { ...base, ...(input || {}), id: input?.id || base.id };
  }

  function scaleTactics(tactics={}, profile) {
    const next = { ...tactics };
    if (Number.isFinite(Number(next.tempo))) next.tempo = clamp(next.tempo*profile.tempoScale, 20, 90);
    if (Number.isFinite(Number(next.risk))) next.risk = clamp(next.risk*profile.riskScale, 20, 92);
    if (Number.isFinite(Number(next.pressing))) next.pressing = clamp(next.pressing*profile.pressingScale, 20, 92);
    if (Number.isFinite(Number(next.passingDirectness))) next.passingDirectness = clamp(next.passingDirectness*profile.directnessScale, 20, 90);
    if (Number.isFinite(Number(next.setPieceRisk))) next.setPieceRisk = clamp(next.setPieceRisk*profile.setPieceRiskScale, 20, 90);
    if (Number.isFinite(Number(next.tacklingRisk))) next.tacklingRisk = clamp(next.tacklingRisk*profile.tacklingRiskScale, 20, 88);
    return next;
  }

  function applyBalanceProfile(config={}, profileInput="masterpiece") {
    const profile = resolveProfile(profileInput || config.balanceProfile || "masterpiece");
    const baseConfig = clone(config);
    const home = merge(baseConfig.home, { tactics: scaleTactics(baseConfig.home?.tactics || {}, profile) });
    const away = merge(baseConfig.away, { tactics: scaleTactics(baseConfig.away?.tactics || {}, profile) });
    const spread=Number(profile.ratingSpreadScale||1);
    if (Number.isFinite(Number(home.rating))) home.rating = clamp(80+(Number(home.rating)-80)*spread+Number(profile.homeRatingBonus||0), 35, 99);
    if (Number.isFinite(Number(away.rating))) away.rating = clamp(80+(Number(away.rating)-80)*spread, 35, 99);
    return {
      ...baseConfig,
      refereeProfile: profile.refereeProfile || baseConfig.refereeProfile || "balanced",
      balanceProfile: profile.id,
      balanceManifestVersion: PROFILE_VERSION,
      balanceApplied: PROFILE_VERSION,
      home,
      away
    };
  }

  function createDefaultConfig(overrides={}) {
    const native = BASE.createDefaultConfig(overrides);
    const profile = overrides.balanceProfile || "masterpiece";
    return applyBalanceProfile({ ...native, ...overrides, home:{...native.home,...(overrides.home||{}),tactics:{...native.home.tactics,...(overrides.home?.tactics||{})}}, away:{...native.away,...(overrides.away||{}),tactics:{...native.away.tactics,...(overrides.away?.tactics||{})}} }, profile);
  }

  function decorateEngine(engine, config, profile) {
    engine.version = VERSION;
    engine.balanceProfile = clone(profile);
    engine.balanceManifestVersion = PROFILE_VERSION;
    const baseSnapshot = engine.getSnapshot.bind(engine);
    const baseReport = engine.getReport.bind(engine);
    engine.getBalanceProfile = () => clone(profile);
    engine.runFullMatch = () => {
      let guard=0;
      const hardEnd=Math.min(6300,Math.max(5940,Number(engine.matchEndSeconds||5400)+480));
      while(engine.status==="live"&&guard++<6400&&Number(engine.clockSeconds||0)<hardEnd) engine.step(1);
      if(engine.status==="live"){
        engine.status="finished";
        engine.clockSeconds=Math.min(hardEnd,Math.max(Number(engine.clockSeconds||0),Number(engine.matchEndSeconds||5400)));
        engine.safetyTermination={reason:"PHASE13_WATCHDOG",guard,hardEnd};
      }
      engine.__phase12Analytics?.finalize?.();
      return engine.getSnapshot();
    };
    engine.getSnapshot = () => ({ ...baseSnapshot(), balance:{ version:VERSION, manifest:PROFILE_VERSION, profile:clone(profile), safetyTermination:clone(engine.safetyTermination||null) } });
    engine.getReport = () => ({ ...baseReport(), balance:{ version:VERSION, manifest:PROFILE_VERSION, profile:clone(profile), safetyTermination:clone(engine.safetyTermination||null) } });
    return engine;
  }

  function createEngine(config={}) {
    const profile = resolveProfile(config.balanceProfile || "masterpiece");
    const calibrated = config.balanceApplied===PROFILE_VERSION ? clone(config) : applyBalanceProfile(config, profile);
    return decorateEngine(BASE.createEngine(calibrated), calibrated, profile);
  }

  function scenarioFor(index, seedPrefix, profile) {
    const formations=["4-3-3","4-2-3-1","4-4-2","3-5-2"];
    const referees=["balanced","lenient","balanced","strict"];
    const homeRating=76+(index*5)%12;
    const awayRating=76+(index*7+3)%12;
    return createDefaultConfig({
      matchId:`${seedPrefix}-${index}`,
      seed:`${seedPrefix}-${index}`,
      balanceProfile:profile,
      refereeProfile:referees[index%referees.length],
      home:{ rating:homeRating, formation:formations[index%formations.length] },
      away:{ rating:awayRating, formation:formations[(index+1)%formations.length] }
    });
  }

  function matchMetrics(report, elapsedMs=0, config=null) {
    const hs=report.home.stats||{}, as=report.away.stats||{};
    const goals=Number(report.score.home||0)+Number(report.score.away||0);
    const shots=metric(hs,"shots")+metric(as,"shots");
    const sot=metric(hs,"shotsOnTarget")+metric(as,"shotsOnTarget")+metric(hs,"onTarget")+metric(as,"onTarget");
    const passes=metric(hs,"passesAttempted")+metric(as,"passesAttempted");
    const completed=metric(hs,"passesCompleted")+metric(as,"passesCompleted");
    const setPieceGoals=metric(hs,"setPieceGoals")+metric(as,"setPieceGoals");
    const injuries=metric(hs,"muscleInjuries")+metric(as,"muscleInjuries")+metric(hs,"contactInjuries")+metric(as,"contactInjuries");
    const homeRating=Number(config?.home?.rating||report.home?.rating||report.config?.home?.rating||0);
    const awayRating=Number(config?.away?.rating||report.away?.rating||report.config?.away?.rating||0);
    const ratingGap=Math.abs(homeRating-awayRating);
    const stronger = ratingGap < 3 ? "equal" : homeRating>awayRating ? "home" : "away";
    const strongerNonLoss = stronger==="equal" ? null : stronger==="home" ? Number(report.score.home)>=Number(report.score.away) : Number(report.score.away)>=Number(report.score.home);
    return {
      goals, shots, shotsOnTarget:sot,
      xg:metric(hs,"xg")+metric(as,"xg"),
      passAccuracy:passes?completed/passes*100:0,
      corners:metric(hs,"corners")+metric(as,"corners"),
      fouls:metric(hs,"foulsCommitted")+metric(as,"foulsCommitted"),
      yellowCards:metric(hs,"yellowCards")+metric(as,"yellowCards"),
      redCards:metric(hs,"redCards")+metric(as,"redCards"),
      injuries,
      setPieceGoalShare:goals?setPieceGoals/goals:0,
      result:Number(report.score.home)>Number(report.score.away)?"home":Number(report.score.home)<Number(report.score.away)?"away":"draw",
      strongerNonLoss,
      score:`${report.score.home}-${report.score.away}`,
      elapsedMs
    };
  }

  function aggregate(rows) {
    const pick=key=>rows.map(r=>r[key]);
    const resultCount=key=>rows.filter(r=>r.result===key).length;
    const stronger=rows.filter(r=>r.strongerNonLoss!==null);
    return {
      matches:rows.length,
      goalsPerMatch:round(mean(pick("goals"))),
      goalsCi95:round(ci95(pick("goals"))),
      shotsPerMatch:round(mean(pick("shots"))),
      shotsOnTargetPerMatch:round(mean(pick("shotsOnTarget"))),
      xgPerMatch:round(mean(pick("xg"))),
      passAccuracy:round(mean(pick("passAccuracy"))),
      cornersPerMatch:round(mean(pick("corners"))),
      foulsPerMatch:round(mean(pick("fouls"))),
      yellowCardsPerMatch:round(mean(pick("yellowCards"))),
      redCardsPerMatch:round(mean(pick("redCards"))),
      injuriesPerMatch:round(mean(pick("injuries"))),
      setPieceGoalShare:round(mean(pick("setPieceGoalShare"))),
      homeWinRate:round(rows.length?resultCount("home")/rows.length:0),
      drawRate:round(rows.length?resultCount("draw")/rows.length:0),
      awayWinRate:round(rows.length?resultCount("away")/rows.length:0),
      strongerTeamNonLossRate:round(stronger.length?mean(stronger.map(r=>r.strongerNonLoss?1:0)):0),
      averageRuntimeMs:round(mean(pick("elapsedMs")),2),
      p95RuntimeMs:round(pick("elapsedMs").sort((a,b)=>a-b)[Math.max(0,Math.ceil(rows.length*.95)-1)]||0,2),
      goalDistribution:{ zero:rows.filter(r=>r.goals===0).length, one:rows.filter(r=>r.goals===1).length, two:rows.filter(r=>r.goals===2).length, three:rows.filter(r=>r.goals===3).length, fourPlus:rows.filter(r=>r.goals>=4).length }
    };
  }

  function evaluateMetrics(metrics, targets=TARGETS) {
    let earned=0,total=0;
    const checks={};
    for(const [key,target] of Object.entries(targets)){
      const value=Number(metrics[key]); const weight=Number(target.weight||1); total+=weight;
      let status="PASS",distance=0;
      const sampleSize=Math.max(1,Number(metrics.matches||0));
      const rateUncertainty=target.unit==="ratio" ? .98/Math.sqrt(sampleSize) : 0;
      const warningBand=Math.max((target.max-target.min)*.35,DEFAULT_TOLERANCES[key]||0,rateUncertainty);
      if(value<target.min){distance=target.min-value;status=distance<=warningBand?"WARN":"FAIL";}
      else if(value>target.max){distance=value-target.max;status=distance<=warningBand?"WARN":"FAIL";}
      earned += status==="PASS"?weight:status==="WARN"?weight*.55:0;
      checks[key]={value:round(value),min:target.min,max:target.max,unit:target.unit,status,distance:round(distance)};
    }
    const score=round(total?earned/total*100:0,1);
    const failCount=Object.values(checks).filter(row=>row.status==="FAIL").length;
    const warnCount=Object.values(checks).filter(row=>row.status==="WARN").length;
    const status=failCount>=2||score<65?"FAIL":failCount>=1||warnCount>=3||score<85?"WARN":"PASS";
    return { score, status, checks };
  }

  function recommendTuning(evaluation) {
    const c=evaluation.checks||{}, rows=[];
    const low=(k)=>c[k]?.value<c[k]?.min, high=(k)=>c[k]?.value>c[k]?.max;
    if(low("goalsPerMatch")) rows.push({area:"SCORING",direction:"UP",action:"Increase finishing-window quality or reduce save conversion by 3–6%."});
    if(high("goalsPerMatch")) rows.push({area:"SCORING",direction:"DOWN",action:"Reduce high-quality shot conversion or improve goalkeeper set position by 3–6%."});
    if(low("shotsPerMatch")) rows.push({area:"CHANCE_VOLUME",direction:"UP",action:"Increase final-third action frequency without directly increasing conversion."});
    if(high("shotsPerMatch")) rows.push({area:"CHANCE_VOLUME",direction:"DOWN",action:"Raise low-value shot rejection and recycle possession more often."});
    if(low("passAccuracy")) rows.push({area:"PASSING",direction:"UP",action:"Reduce ordinary pass error and heavy-touch frequency by 2–4%."});
    if(high("passAccuracy")) rows.push({area:"PASSING",direction:"DOWN",action:"Increase pressure-sensitive pass variance, especially in progression zones."});
    if(low("drawRate")) rows.push({area:"RESULT_DISTRIBUTION",direction:"DRAW_UP",action:"Slightly reduce late-game all-out conversion and comeback volatility."});
    if(high("drawRate")) rows.push({area:"RESULT_DISTRIBUTION",direction:"DRAW_DOWN",action:"Increase late tactical differentiation and elite-player chance conversion."});
    if(low("strongerTeamNonLossRate")) rows.push({area:"TEAM_STRENGTH",direction:"UP",action:"Increase attribute influence in decisions, duels and shot execution by 3–5%."});
    if(high("redCardsPerMatch")) rows.push({area:"DISCIPLINE",direction:"DOWN",action:"Raise direct-red severity threshold and reduce repeated-foul escalation."});
    if(high("injuriesPerMatch")) rows.push({area:"PHYSICAL",direction:"DOWN",action:"Reduce serious injury hazard while preserving fatigue and minor discomfort."});
    if(low("setPieceGoalShare")) rows.push({area:"SET_PIECES",direction:"UP",action:"Improve delivery-target alignment rather than raw header conversion."});
    return rows;
  }

  function fingerprint(rows) {
    let h=2166136261>>>0;
    const text=rows.map(r=>`${r.score}|${r.shots}|${round(r.xg,2)}|${round(r.passAccuracy,1)}|${r.yellowCards}|${r.redCards}`).join(";");
    for(const ch of text){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)>>>0;}
    return h.toString(16).padStart(8,"0");
  }

  function runCalibration(options={}) {
    const matches=clamp(Math.floor(options.matches||20),1,10000);
    const seedPrefix=String(options.seedPrefix||"phase13-calibration");
    const profile=resolveProfile(options.profile||"masterpiece");
    const rows=[]; const started=Date.now();
    for(let i=0;i<matches;i++){
      const config=typeof options.scenarioFactory==="function" ? options.scenarioFactory(i,profile) : scenarioFor(i,seedPrefix,profile);
      const t=Date.now(); const engine=createEngine(config); engine.runFullMatch();
      rows.push(matchMetrics(engine.getReport(),Date.now()-t,config));
      BASE.getAnalyticsRegistry?.().clear?.();
      if(typeof options.onProgress==="function") options.onProgress({completed:i+1,total:matches,last:rows.at(-1)});
    }
    const metrics=aggregate(rows); const evaluation=evaluateMetrics(metrics,options.targets||TARGETS);
    return { version:VERSION, calibrationVersion:CALIBRATION_VERSION, manifest:PROFILE_VERSION, profile, seedPrefix, startedAt:new Date(started).toISOString(), elapsedMs:Date.now()-started, metrics, evaluation, recommendations:recommendTuning(evaluation), fingerprint:fingerprint(rows), sample:rows.slice(0,20) };
  }

  function runDeterminismAudit(options={}) {
    const matches=clamp(Math.floor(options.matches||3),1,20); const profile=resolveProfile(options.profile||"masterpiece"); const pairs=[];
    for(let i=0;i<matches;i++){
      const config=scenarioFor(i,options.seedPrefix||"phase13-determinism",profile);
      const a=createEngine(config); const b=createEngine(config); a.runFullMatch(); b.runFullMatch();
      const ar=matchMetrics(a.getReport(),0,config), br=matchMetrics(b.getReport(),0,config);
      pairs.push({seed:config.seed,pass:JSON.stringify(ar)===JSON.stringify(br),a:ar,b:br});
      BASE.getAnalyticsRegistry?.().clear?.();
    }
    return {pass:pairs.every(x=>x.pass),pairs};
  }

  function createBaseline(calibration, name="baseline") {
    return { name, version:VERSION, manifest:PROFILE_VERSION, createdAt:new Date().toISOString(), profile:clone(calibration.profile), metrics:clone(calibration.metrics), evaluation:clone(calibration.evaluation), fingerprint:calibration.fingerprint };
  }

  function compareBaseline(current, baseline, tolerances=DEFAULT_TOLERANCES) {
    const deltas={}, failures=[];
    for(const [key,tolerance] of Object.entries(tolerances)){
      if(!Number.isFinite(Number(current?.metrics?.[key]))||!Number.isFinite(Number(baseline?.metrics?.[key]))) continue;
      const delta=Number(current.metrics[key])-Number(baseline.metrics[key]); const pass=Math.abs(delta)<=Number(tolerance);
      deltas[key]={current:round(current.metrics[key]),baseline:round(baseline.metrics[key]),delta:round(delta),tolerance,pass};
      if(!pass) failures.push(key);
    }
    return {pass:failures.length===0,failures,deltas,currentFingerprint:current.fingerprint,baselineFingerprint:baseline.fingerprint};
  }

  function exportCalibration(calibration) { return JSON.stringify(calibration,null,2); }

  const API=Object.freeze({
    ...BASE,
    VERSION,
    GRAND_CALIBRATION_VERSION:CALIBRATION_VERSION,
    BALANCE_MANIFEST_VERSION:PROFILE_VERSION,
    BALANCE_TARGETS:TARGETS,
    BALANCE_PROFILES:PROFILES,
    DEFAULT_BALANCE_TOLERANCES:DEFAULT_TOLERANCES,
    createDefaultConfig,
    createEngine,
    resolveBalanceProfile:resolveProfile,
    applyBalanceProfile,
    runCalibration,
    runBatchCalibration:runCalibration,
    runDeterminismAudit,
    evaluateBalance:evaluateMetrics,
    recommendTuning,
    createBalanceBaseline:createBaseline,
    compareBalanceBaseline:compareBaseline,
    exportCalibration,
    __phase13Base:BASE,
    __diagnostics:{aggregate,matchMetrics,scenarioFor,fingerprint,scaleTactics}
  });

  globalThis.FIFA_MATCH_ENGINE_V4=API;
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE13_CORE=API;
  if(typeof module!=="undefined"&&module.exports) module.exports=API;

  const LIVE={enabled:true,timer:null,lastPersistAt:0};
  function activeContext(){ const room=globalThis.FIFA_MANAGER_ROOM; const career=room?.getCareer?.()||room?.getActiveCareer?.(); const fixture=room?.getSelectedFixture?.()||career?.fixtures?.find?.(x=>x?.id===career?.activeMatchFixtureId); return career&&fixture?.matchEngine?{career,fixture}:null; }
  function ensureBadge(){ if(typeof document==="undefined")return; const hud=document.querySelector("#managerMatchMount .me11-hud"); if(!hud||hud.querySelector("[data-me13-badge]"))return; const badge=document.createElement("span"); badge.dataset.me13Badge=""; badge.textContent="ME13 · BALANCED R1"; badge.style.cssText="padding:5px 8px;border-radius:7px;background:#2a513c;color:#dff7df;font:900 9px Inter,system-ui;border:1px solid rgba(170,240,180,.28)"; hud.appendChild(badge); }
  function persist(){ const ctx=activeContext(); if(!ctx)return; const now=Date.now(); if(now-LIVE.lastPersistAt<1200)return; LIVE.lastPersistAt=now; ctx.fixture.matchEngine.matchEngineV4=ctx.fixture.matchEngine.matchEngineV4||{}; Object.assign(ctx.fixture.matchEngine.matchEngineV4,{balanceOfficial:true,balanceVersion:VERSION,balanceManifest:PROFILE_VERSION,balanceProfile:"masterpiece"}); }
  function poll(){ if(!LIVE.enabled)return; ensureBadge(); persist(); }
  function enable(){LIVE.enabled=true;if(!LIVE.timer)LIVE.timer=globalThis.setInterval?.(poll,500);poll();return getStatus();}
  function disable(){LIVE.enabled=false;if(LIVE.timer)globalThis.clearInterval?.(LIVE.timer);LIVE.timer=null;return getStatus();}
  function getStatus(){return{version:VERSION,manifest:PROFILE_VERSION,enabled:LIVE.enabled,profile:"masterpiece",authority:"CALIBRATION_AND_REGRESSION",matchOutcomeInfluence:"PROFILE_ONLY_BEFORE_KICKOFF"};}
  globalThis.FIFA_MATCH_ENGINE_V4_PHASE13=Object.freeze({VERSION,enable,disable,poll,getStatus,runCalibration,runDeterminismAudit,compareBaseline,createBaseline});
  if(typeof document!=="undefined"){const boot=()=>{enable();console.info(`[Match Engine V4] Phase 13 grand calibration ready · ${VERSION}`)};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",boot,{once:true}):boot();}
})();

