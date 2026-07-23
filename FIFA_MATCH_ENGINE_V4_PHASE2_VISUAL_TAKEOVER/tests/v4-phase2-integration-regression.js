"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function buildContext() {
  const storage = new Map();
  let activeCareer = null;
  const teams = {
    H: { id: "TH", clubName: "Home Team", overall: 84 },
    A: { id: "TA", clubName: "Away Team", overall: 81 }
  };
  const room = {
    getActiveCareer: () => activeCareer,
    getActor: (career, id) => career.actors.find(row => row.id === id),
    getTeamForActor: (_fixture, id) => teams[id]
  };
  const context = {
    console,
    Math,
    Date,
    performance: { now: () => 1000 },
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    setInterval: () => 1,
    clearInterval() {},
    setTimeout: () => 1,
    clearTimeout() {},
    dispatchEvent() {},
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    FIFA_MANAGER_ROOM: room
  };
  context.globalThis = context;
  vm.createContext(context);
  return { context, setCareer: value => { activeCareer = value; } };
}

function load(context, filename) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, filename), "utf8"), context, { filename });
}

function fakeNode(side, index) {
  const classes = new Set();
  return {
    dataset: { side, index: String(index) },
    style: {},
    title: "",
    attributes: {},
    children: [],
    classList: {
      toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    querySelector() { return null; },
    appendChild(child) { this.children.push(child); }
  };
}

(function run() {
  const { context, setCareer } = buildContext();
  load(context, "manager-match-engine-v4-core.js");
  load(context, "manager-match-engine-v4-shadow-adapter.js");
  load(context, "manager-match-engine-v4-live-bridge.js");

  const fixture = {
    id: "F-1",
    homeId: "H",
    awayId: "A",
    homeTeam: "home-team",
    awayTeam: "away-team",
    matchEngine: {
      status: "live",
      clockSeconds: 600,
      minute: 10,
      humanSide: "home",
      scoreHome: 0,
      scoreAway: 0,
      stats: { home: { shots: 2 }, away: { shots: 1 } },
      visual2D: { ball: { x: 63, y: 25 }, possession: "home", phase: "YERLEŞİK HÜCUM" },
      userPlan: {
        formation: "4-3-3",
        mentality: "aggressive",
        pressing: "high",
        buildUp: "wings",
        tempo: "high",
        risk: "bold",
        positionRoles: { LB: "attacking-wingback", GK: "playmaker-keeper" },
        phaseBehaviors: { inPossession: "positional", outPossession: "high-press", winTransition: "counter", lossTransition: "counterpress" }
      },
      aiPlan: {
        formation: "4-2-3-1",
        mentality: "controlled",
        pressing: "mid",
        buildUp: "patient",
        tempo: "normal",
        risk: "safe",
        positionRoles: { RB: "fullback-defend", GK: "shot-stopper" },
        phaseBehaviors: { inPossession: "patient", outPossession: "mid-block", winTransition: "secure", lossTransition: "regroup" }
      }
    }
  };
  const career = {
    id: "C-1",
    activeMatchFixtureId: fixture.id,
    fixtures: [fixture],
    actors: [
      { id: "H", type: "human", clubName: "Human FC", styleSeed: { tempo: 58, pressing: 61, risk: 55, width: 60 } },
      { id: "A", type: "ai", clubName: "AI FC", styleSeed: { tempo: 50, pressing: 50, risk: 45, width: 45 } }
    ]
  };
  setCareer(career);

  const shadow = context.FIFA_MATCH_ENGINE_V4_SHADOW;
  const live = context.FIFA_MATCH_ENGINE_V4_LIVE;
  shadow.enable();
  let snapshot = shadow.getSnapshot();

  assert.equal(snapshot.simulation.simulationTime, 600, "shadow engine did not synchronize to legacy clock");
  assert.equal(snapshot.config.home.formation, "4-3-3");
  assert.equal(snapshot.config.home.tactics.fullbackDuty, "attack", "positionRoles were not mapped");
  assert.equal(snapshot.config.home.goalkeeperArchetype, "playmaker-keeper");
  assert.equal(snapshot.config.home.tactics.outPossession, "high-press", "phaseBehaviors were not mapped");
  assert.equal(snapshot.config.away.goalkeeperArchetype, "line-keeper");
  assert.equal(snapshot.config.home.rating, 84, "team catalog rating was not read through Manager Room API");
  assert.equal(snapshot.simulation.ball.position.x, 63, "official legacy ball x was not synchronized");
  assert.equal(Math.round(snapshot.simulation.ball.position.y * 100) / 100, 17, "official legacy ball y was not converted to 68m pitch coordinates");
  assert.equal(snapshot.simulation.possessionSide, "home", "official possession was not synchronized");

  const oldSignature = snapshot.configSignature;
  fixture.matchEngine.userPlan.formation = "4-2-3-1";
  fixture.matchEngine.userPlan.positionRoles.LB = "fullback-defend";
  fixture.matchEngine.clockSeconds = 720;
  shadow.poll();
  snapshot = shadow.getSnapshot();
  assert.notEqual(snapshot.configSignature, oldSignature, "tactical changes did not rebuild V4 configuration");
  assert.equal(snapshot.config.home.formation, "4-2-3-1");
  assert.equal(snapshot.config.home.tactics.fullbackDuty, "defend");
  assert.equal(snapshot.simulation.simulationTime, 720, "rebuilt V4 engine did not catch up to live clock");

  const point = live.__diagnostics.toPercentPoint({ x: 55, y: 34 });
  assert.equal(point.x, 55);
  assert.equal(point.y, 50, "68m pitch width was not converted to DOM percentage");

  const node = fakeNode("home", 0);
  live.__diagnostics.applyTeam([node], {
    players: [{
      name: "Keeper",
      position: "GK",
      role: "sweeper-keeper",
      point: { x: 12, y: 34 },
      intent: "sweep",
      hasBall: true,
      energy: 91
    }]
  });
  assert.equal(node.style.left, "12%");
  assert.equal(node.style.top, "50%");
  assert(node.classList.contains("v4-has-ball"), "ball-owner emphasis was not applied");
  assert.equal(node.dataset.v4Intent, "sweep");
  assert(node.title.includes("SÜPÜRÜCÜ ÇIKIŞ"));

  const engine = context.FIFA_MATCH_ENGINE_V4.createEngine(context.FIFA_MATCH_ENGINE_V4.createDefaultConfig({ seed: "phase2-calibration" }));
  engine.runFullMatch();
  const report = engine.getReport();
  assert.equal(report.status, "fulltime");
  assert(report.home.stats.passesAttempted + report.away.stats.passesAttempted > 500, "full simulation did not produce match-scale passing");

  console.log("V4 PHASE 2 INTEGRATION REGRESSION: PASS");
  console.log(JSON.stringify({
    clock: snapshot.simulation.simulationTime,
    formation: snapshot.config.home.formation,
    fullbackDuty: snapshot.config.home.tactics.fullbackDuty,
    mappedPoint: point,
    sampleScore: report.score,
    sampleShots: report.home.stats.shots + report.away.stats.shots
  }, null, 2));
})();
