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
      return { tag, style: {}, className: "", remove() { if (line === this) line = null; } };
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
    FIFA_MATCH_ENGINE_V4_PHASE3: { getSnapshot: () => null },
    FIFA_MANAGER_ROOM: { getActiveCareer: () => null }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "manager-match-engine-v4-phase3-live-bridge.js"), "utf8"), context);
  const api = context.FIFA_MATCH_ENGINE_V4_PHASE3_LIVE;
  assert(api, "phase3 live API not exposed");

  const simulation = {
    ball: { position: { x: 55, y: 34 }, velocity: { x: 3, y: 0 }, height: 1.2, reason: "PASS_FLIGHT" },
    ballControl: { state: "IN_FLIGHT", activeAction: { ownerId: "h1", receiverId: "h2", progress: 0.4 } },
    teams: {
      home: { players: [{ id: "h1", point: { x: 40, y: 30 } }, { id: "h2", point: { x: 65, y: 38 } }] },
      away: { players: [] }
    }
  };
  api.__diagnostics.applyBall(pitch, simulation, "V4_PASSING");
  assert.equal(ball.style.left, "55%");
  assert.equal(ball.style.top, "50%");
  assert(ball.classList.contains("me4-ball-in-flight"));
  assert(line, "pass trajectory line was not created");

  simulation.ballControl = { state: "LOOSE", activeAction: null, loose: { secondBall: true } };
  api.__diagnostics.applyBall(pitch, simulation, "V4_PASSING");
  assert(ball.classList.contains("me4-ball-loose"));
  assert.equal(line, null, "pass line should be removed after flight");

  api.__diagnostics.applyBall(pitch, simulation, "LEGACY_TERMINAL");
  assert(ball.classList.contains("me4-ball-external"));

  console.log("V4 PHASE 3 LIVE BRIDGE REGRESSION: PASS");
  console.log(JSON.stringify({ ballLeft: ball.style.left, ballTop: ball.style.top, classes: ball.classList.values() }, null, 2));
})();
