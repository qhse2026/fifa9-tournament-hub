# Formula Horizon Reborn V45.0.0 — Architecture

## 1. Integration model

The existing Tournament Universe remains a static Vercel/PWA application. Formula Reborn is integrated through the existing public contract:

```js
window.F1_RACING = {
  render,
  stopRace,
  dashboardCard,
  getState
};
```

`formula-reborn-loader.js` is a classic script loaded with the rest of the site. It creates the public API immediately, but lazy-loads the ES-module game only when the Formula view is opened.

This avoids loading Three.js or creating WebGL resources while the user is using FIFA, Manager's Room, Season Hub or other modes.

## 2. Runtime lifecycle

```text
Navigation to formula1
→ window.F1_RACING.render(view)
→ dynamic import formula-reborn-app.js
→ Challenge Hub
→ RaceSession.mount()
→ WebGL renderer + track mesh + physics + input + timing + audio
→ fixed game loop
→ result validation and persistence
→ RaceSession.destroy()
→ Three.js resources, event handlers and audio nodes disposed
```

When navigation leaves Formula mode, `app.js` invokes `window.F1_RACING.stopRace()`.

## 3. Modules

### Application
- `app/formula-reborn-app.js`: Challenge Hub, settings, circuit selection, records, state persistence.
- `app/race-session.js`: owns one official five-lap session and coordinates all engine services.

### Engine
- `renderer.js`: Three.js scene, vehicle, ghost, lighting, circuit environment and WebGL quality profile.
- `game-loop.js`: fixed 1/120-second physics timestep with interpolated rendering.
- `vehicle-physics.js`: longitudinal/lateral arcade-simulation physics, surface grip, barriers and damage.
- `input-controller.js`: keyboard and Pointer Events mobile controls.
- `camera-controller.js`: Chase, Close Chase and Nose/Cockpit Lite cameras with damped follow.
- `lap-timing.js`: start/finish, three sectors, validity, fastest clean lap and five-lap total.
- `ghost-system.js`: local replay recording, compression/persistence and interpolated playback.
- `audio-system.js`: user-unlocked procedural Web Audio engine and event cues.

### Tracks
- `track-schema.js`: circuit authoring contract and validation.
- `track-builder.js`: Catmull-Rom centerline, sampled world model, asphalt, kerbs, runoff, barriers and scenery.
- `oruc-reis-coastal.js`: high-speed maritime circuit.
- `filyos-harbour.js`: narrow braking-dependent harbour circuit.
- `dragon-mountain.js`: elevated volcanic mountain circuit.

### Cloud
- `leaderboard-service.js`: local records, existing `window.FIFA_CLOUD` reuse, Supabase RPC access.
- `session-validator.js`: client-side session envelope, input checksum, session hash and plausibility checks.
- `supabase/formula_v45_reborn.sql`: isolated RLS-enabled Formula V45 data model and secure RPC functions.

## 4. State separation

Formula state is stored under:

```text
fifa9_formula_reborn_v45_state
```

It does not modify the FIFA tournament state, fixtures, Manager careers or historical data.

Old Formula times are intentionally not migrated into official V45 records because they were created by a different physics and track engine. Safe preferences such as driver name may be reused through existing profile/local fallbacks.

## 5. Rendering

- Three.js WebGL renderer.
- Closed `CatmullRomCurve3` centerline.
- Generated world-space meshes for asphalt, kerbs and runoff.
- Barrier instances sampled from circuit geometry.
- Procedural Formula car and circuit-specific scenery.
- Adaptive quality profiles.
- No top-down camera and no screen-space pseudo-road translation.

Three.js is pinned to `0.185.1` through an ES-module URL. The first Formula load requires network access; successful CORS responses can be cached by the service worker.

## 6. Physics model

The player is not magnetically locked to the circuit.

Core effects:
- throttle and progressive braking;
- speed-dependent steering;
- lateral grip limit using speed and surface friction;
- understeer when requested yaw exceeds available grip;
- mild controllable oversteer/slip;
- ABS and traction-control assists;
- asphalt, kerb, runoff and grass friction differences;
- barrier impact, speed loss and damage;
- controlled reset that invalidates the current lap.

The fixed-timestep architecture prevents official timing from depending on render FPS.

## 7. Timing and records

Every official session contains exactly five completed laps.

Independent metrics:
1. fastest valid lap;
2. five-lap total.

Each track has three sectors. `performance.now()` is used for local monotonic timing. Client validation creates hashes and event metadata before cloud submission.

## 8. Cloud security model

The V45 migration:
- creates isolated Formula tables;
- enables RLS;
- revokes direct anonymous/authenticated table access;
- exposes only security-definer RPC functions;
- validates track, physics and session versions;
- checks plausible timing and speed ranges;
- stores suspicious results as `under-review` rather than claiming professional anti-cheat protection.

## 9. Preserved systems

The implementation does not rewrite:
- FIFA tournament state;
- Manager's Room;
- Match Engine 4;
- Season Hub;
- Final Chapter;
- chat/community;
- historical data.

Only controlled integration changes were made to `index.html`, `app.js`, `fifa9-experience-hub.js` and `service-worker.js`.
