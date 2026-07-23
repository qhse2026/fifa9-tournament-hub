"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

function classList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach(name => set.add(name)),
    remove: (...names) => names.forEach(name => set.delete(name)),
    toggle: (name, enabled) => enabled ? set.add(name) : set.delete(name),
    contains: name => set.has(name),
    values: () => [...set]
  };
}

(function run() {
  const ball = { style: {}, dataset: {}, classList: classList(), title: "" };
  let line = null;
  const pitch = {
    children: [],
    offsetWidth: 100,
    querySelector(selector) {
      if (selector === "[data-live-ball]") return ball;
      if (selector === ".me4-pass-line") return line;
      return null;
    },
    appendChild(node) { line = node; this.children.push(node); },
    classList: classList()
  };
  const document = {
    readyState: "loading",
    addEventListener() {},
    createElement(tag) {
      return { tag, style: {}, className: "", classList: classList(), remove() { if (line === this) line = null; } };
    }
  };
  const context = {
    console,
    Math,
    Date,
    document,
    performance: { now: () => 1000 },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    FIFA_MATCH_ENGINE_V4_PHASE4: { getSnapshot: () => null },
    FIFA_MANAGER_ROOM: { getActiveCareer: () => null }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "manager-match-engine-v4-phase4-live-bridge.js"), "utf8"), context);
  const api = context.FIFA_MATCH_ENGINE_V4_PHASE4_LIVE;
  assert(api, "phase4 live API not exposed");

  const simulation = {
    ball: { position: { x: 86, y: 33 }, velocity: { x: 25, y: 1 }, height: 1.4, reason: "PLACED_SHOT_FLIGHT" },
    ballControl: {
      state: "SHOT_FLIGHT",
      activeAction: null,
      activeShot: { shooterId: "h9", side: "home", shotType: "PLACED", progress: 0.52, xg: 0.31, target: { y: 36, z: 1.2 }, goalkeeperAction: "FULL_STRETCH" }
    },
    teams: {
      home: { players: [{ id: "h9", point: { x: 78, y: 32 } }] },
      away: { players: [{ id: "a1", point: { x: 95, y: 34 } }] }
    }
  };
  api.__diagnostics.applyBall(pitch, simulation);
  assert.equal(ball.style.left, "86%");
  assert(ball.classList.contains("me4-ball-shot"), "shot-flight class missing");
  assert(line, "shot trajectory line missing");
  assert(line.classList.contains("me4-shot-line"), "shot line style missing");

  simulation.ballControl = { state: "LOOSE", activeAction: null, activeShot: null, loose: { secondBall: true } };
  api.__diagnostics.applyBall(pitch, simulation);
  assert(ball.classList.contains("me4-ball-loose"));
  assert.equal(line, null, "shot line should clear after flight");

  console.log("V4 PHASE 4 LIVE BRIDGE REGRESSION: PASS");
  console.log(JSON.stringify({ ballLeft: ball.style.left, classes: ball.classList.values() }, null, 2));
})();
