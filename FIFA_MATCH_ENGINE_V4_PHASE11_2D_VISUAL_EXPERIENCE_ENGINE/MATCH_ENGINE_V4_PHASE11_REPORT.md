# Match Engine V4 — Phase 11 Technical Report

## Scope
Phase 11 adds a presentation-only 2D rendering layer over the deterministic Phase 10 simulation.

## Architecture
- Phase 10 remains authoritative for match logic, ball physics, score and statistics.
- Phase 11 samples official snapshots and interpolates positions in a requestAnimationFrame loop.
- Collision offsets are visual-only and never feed back into simulation coordinates.

## Visual state machine
`IDLE → JOG → RUN → SPRINT`, with contextual `JOCKEY`, `PRESS`, `TACKLE`, `HEADER`, `PASS`, `SHOOT`, `GK_DIVE`, `GK_CLAIM`, `CELEBRATE` and `DISMISSED`.

## Ball presentation
Ball height controls scale and shadow. Velocity controls spin and trail. Official ball coordinates remain unchanged.

## Camera
Broadcast, Tactical, Follow Ball and Highlight modes use smooth transform-origin tracking.

## Replay
A bounded ring buffer stores recent visual frames. Goal events can trigger a seven-second replay while the official simulation continues in the background.

## Persistence
No migration is required. The active fixture receives only visual-version metadata under `matchEngineV4`.
