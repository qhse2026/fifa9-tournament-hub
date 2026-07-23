# Match Engine 4.0 — Phase 8

Phase 8 adds manager AI and 90-minute match management to the Phase 7 attacking-identity engine.

## Main capabilities

- Score- and minute-aware tactical reviews
- AI versus human-control separation
- Human-side recommendations without automatic intervention
- Seven tactical match plans
- Fatigue, card-risk and tactical substitutions
- Five-substitution and substitution-window tracking
- Late emergency target-forward conversion
- Lead protection and time-wasting behaviour
- Official manager statistics and live `managerAI` snapshots

## Files

- `manager-match-engine-v4-phase8.bundle.js`: production bundle
- `match-engine-v4-phase8-lab.html`: standalone manager AI laboratory
- `tests/v4-phase8-regression.js`: deterministic scenario tests
- `tests/v4-phase8-calibration-parallel.js`: 20-match parallel calibration
- `START_HERE_MATCH_ENGINE_V4_PHASE8_TR.txt`: installation instructions

## Installation

Load Phase 8 after the legacy match engine and remove older V4 phase bundles.

```html
<script src="manager-match-engine.js"></script>
<script src="manager-match-engine-v4-phase8.bundle.js?v=4.0.0-phase8.1"></script>
```
