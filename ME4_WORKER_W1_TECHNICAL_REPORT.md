# Match Engine V4 — Worker W1 Technical Report

## Objective
Move the heavy Phase 13 simulation core off the browser main thread and provide a fail-open visual takeover.

## Authority
- Official score, clock, ball and persistence: legacy `manager-match-engine.js`.
- Tactical player coordinates and player intent visualization: ME4 Worker.
- Failure behaviour: Worker is terminated and legacy rendering continues.

## Synchronization
The bridge sends official clock, ball coordinates, possession and score approximately four times per second. The Worker keeps external ball authority and computes team shapes around the official state.

## Performance boundary
The 389 KB Phase 13 bundle is loaded through `importScripts()` inside the Worker. Parsing and simulation no longer occupy the UI event loop.

## Limitations
This is the first takeover stage. It does not yet make V4 the official ball or score authority. Unsupported formations fall back to a safe 4-3-3 Worker shape while the legacy official engine remains unchanged.
