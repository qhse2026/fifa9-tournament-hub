# Match Engine V4 — Phase 9 Technical Report

## Scope
Phase 9 adds a unified physical-condition model to the Phase 8 match-management engine.

## Physical state
Each player now tracks:
- pre-match condition
- short-term energy
- accumulated fatigue
- acute and total match load
- total and sprint distance
- high-intensity runs
- natural fitness and recovery capacity
- injury proneness
- discomfort, availability and injury state

## Performance coupling
Physical condition modifies:
- pace and acceleration
- passing, first touch and technique
- finishing and shot power
- concentration, anticipation, decisions and composure
- goalkeeper reaction and positioning
- aerial-duel and physical-contact performance

## Injury state machine
`FIT → FATIGUED / KNOCK / TIGHTNESS / CRAMP → INJURED`

A knock may recover during lower-intensity play. Tightness and cramp limit performance. An injured player is marked for removal.

## Manager integration
AI managers may make an immediate injury substitution. Human-controlled teams receive a recommendation without automatic intervention.

## Persistence
The existing career object remains the persistence container. New physical statistics are written under `fixture.matchEngine.stats`. No database migration is mandatory.

## Known calibration boundary
The distance model uses normalized pitch coordinates. Values are calibrated for believable match totals, not sports-science GPS certification.
