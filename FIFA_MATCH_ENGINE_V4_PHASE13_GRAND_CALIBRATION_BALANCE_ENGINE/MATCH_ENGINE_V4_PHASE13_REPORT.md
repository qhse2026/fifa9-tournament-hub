# Match Engine V4 — Phase 13 Technical Report

## 1. Scope
Phase 13 is the grand calibration, balance-manifest and regression-control layer built on Phase 12. It applies a versioned profile once before kickoff and evaluates official match outputs across deterministic seed pools.

## 2. Masterpiece Balance R1
The final profile controls tempo, risk, directness, pressing, set-piece risk, tackling risk, home advantage and rating-spread visibility. Profile application is idempotent: the same manifest cannot be applied twice to one configuration.

## 3. Calibrated discipline correction
Phase 13 includes final balance corrections to the embedded referee engine:

- DOGSO requires a central, controlled, direct chance very close to goal.
- Ordinary transition fouls are no longer automatically tactical cautions.
- Direct red requires DOGSO or extreme severity.
- Routine second-caution situations may receive a final warning unless severity or behaviour justifies dismissal.

These corrections reduced the validation red-card average to **0 per match**.

## 4. Calibration APIs

- `runCalibration(options)` / `runBatchCalibration(options)`
- `runDeterminismAudit(options)`
- `evaluateBalance(metrics)`
- `recommendTuning(evaluation)`
- `createBalanceBaseline(calibration)`
- `compareBalanceBaseline(current, baseline)`

The runner supports 1–10,000 matches. Large browser batches should be executed in a Web Worker or CI/Node process.

## 5. KPI gate
The gate evaluates scoring, chance volume, shots on target, xG, passing, corners, discipline, injuries, result distribution, set-piece share and stronger-team fairness.

Rate metrics are sample-size aware. A small batch cannot produce a false hard failure solely because of binomial variance.

## 6. Regression baseline
`BALANCE_BASELINE_R1.json` contains the approved validation metrics and fingerprint. The CI gate compares every supported metric against explicit tolerances.

## 7. Safety controls

- Phase 12 analytics registries are cleared between batch matches to control memory.
- A deterministic simulation-step watchdog prevents pathological seeds from blocking a batch indefinitely.
- Calibration never modifies a completed match after kickoff.

## 8. Final validation snapshot

- Matches: **8**
- Balance score: **92.4/100**
- Gate: **WARN**
- Goals: **2.25**
- Shots: **20.25**
- Shots on target: **8.25**
- xG: **3.917**
- Pass accuracy: **80.684%**
- Yellow cards: **3.5**
- Red cards: **0**
- Stronger-team non-loss: **0.833**
- Fingerprint: `5b163a64`

## 9. Release recommendation
The package is suitable as the final Phase 13 engineering layer. The included eight-match validation is a smoke calibration, not a final statistical certification. Use 100 matches for release candidates and 1,000+ for a production balance lock.
