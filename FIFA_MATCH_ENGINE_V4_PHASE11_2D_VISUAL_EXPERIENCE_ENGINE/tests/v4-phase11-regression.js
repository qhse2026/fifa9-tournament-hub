const assert = require("assert");
require("../manager-match-engine-v4-phase11.bundle.js");
const live = globalThis.FIFA_MATCH_ENGINE_V4_PHASE11_LIVE;
const core = globalThis.FIFA_MATCH_ENGINE_V4;
const d = live.__diagnostics;
let passed = 0;
function test(name, fn){ fn(); console.log(`PASS ${name}`); passed++; }

test("Phase 11 API contract",()=>{
  assert.equal(live.VERSION,"4.0.0-phase11-visual.1");
  assert.equal(typeof live.renderSimulation,"function");
  assert.equal(typeof live.startReplay,"function");
});

test("Interpolation is deterministic",()=>{
  assert.deepStrictEqual(d.interpolatePoint({x:0,y:10},{x:10,y:30},.5),{x:5,y:20});
});

test("Facing angle follows movement",()=>{
  assert.equal(Math.round(d.angleBetween({x:0,y:0},{x:1,y:0})),0);
  assert.equal(Math.round(d.angleBetween({x:0,y:0},{x:0,y:1})),90);
});

test("Animation inference distinguishes movement",()=>{
  const base={id:"p",intent:"",group:"ST",redCard:false,side:"home"};
  assert.equal(d.inferAnimation(base,{simulationTime:1},null,6),"SPRINT");
  assert.equal(d.inferAnimation({...base,intent:"JOCKEY"},{simulationTime:1},null,1),"JOCKEY");
  assert.equal(d.inferAnimation({...base,group:"GK",intent:"FULL_STRETCH_SAVE"},{simulationTime:1},null,0),"GK_DIVE");
});

test("Collision offsets separate close players",()=>{
  const offsets=d.computeCollisionOffsets([{id:"a",point:{x:10,y:10}},{id:"b",point:{x:10.4,y:10}}]);
  assert.ok(Math.abs(offsets.get("a").y)>0);
  assert.ok(Math.abs(offsets.get("b").y)>0);
  assert.ok(offsets.get("a").y * offsets.get("b").y < 0);
});

test("Camera modes are bounded",()=>{
  const sim={ball:{position:{x:99,y:68}},ballControl:{activeShot:{}}};
  const p=d.cameraPreset("FOLLOW_BALL",sim);
  assert.ok(p.scale>1.1 && p.scale<1.3);
  assert.ok(p.originX<=88 && p.originY<=86);
});

test("Replay buffer retains recent frames",()=>{
  const b=new d.ReplayBuffer(3); b.push({simulationTime:1}); b.push({simulationTime:2}); b.push({simulationTime:3}); b.push({simulationTime:4});
  assert.equal(b.frames.length,3); assert.deepStrictEqual(b.frames.map(x=>x.simulationTime),[2,3,4]);
});

test("Phase 10 core remains deterministic",()=>{
  const a=core.createEngine(core.createDefaultConfig({seed:"phase11-core"}));
  const b=core.createEngine(core.createDefaultConfig({seed:"phase11-core"}));
  a.runTo(600); b.runTo(600);
  assert.deepStrictEqual(a.getSnapshot().score,b.getSnapshot().score);
  assert.deepStrictEqual(a.getSnapshot().ball.position,b.getSnapshot().ball.position);
});

test("Visual copy does not mutate core snapshot",()=>{
  const e=core.createEngine(core.createDefaultConfig({seed:"phase11-copy"})); e.runTo(120);
  const s=e.getSnapshot(); const f=d.copyFrame(s); f.ball.position.x=0;
  assert.notEqual(s.ball.position.x,0);
});

console.log(JSON.stringify({tests:passed,passed,failed:0},null,2));
