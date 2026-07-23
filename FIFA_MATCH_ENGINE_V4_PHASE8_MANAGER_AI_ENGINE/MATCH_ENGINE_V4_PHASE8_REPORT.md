# Match Engine 4.0 — Phase 8 Technical Report

## Objective

Phase 8 converts the match from a fixed 90-minute simulation into a context-aware contest managed by AI coaches. The manager layer reads score, minute, shot production, xG balance, possession, player energy, booking risk and available substitutes.

## Control model

Each team has one of two control modes:

- `AI`: the manager applies tactical changes and substitutions.
- `HUMAN`: the system records actionable recommendations but does not modify the user's plan automatically.

## Tactical plans

The engine contains seven explicit plans:

- `BALANCED`
- `CONTROL`
- `PROTECT_LEAD`
- `HIGH_PRESS`
- `WIDE_ATTACK`
- `DIRECT_ATTACK`
- `ALL_OUT`

A plan changes mentality, tempo, risk, directness, pressing, defensive line, width, fullback duty, transition behaviour and time-wasting intensity as one coherent package.

## Review schedule

Manager reviews are scheduled at minutes 15, 30, 45, 55, 62, 70, 76, 82, 86 and 89. Manual reviews are also available through the public API.

## Substitution logic

The substitution evaluator combines:

- current energy and accumulated fatigue
- yellow-card risk for defensive roles
- tactical need in attacking roles
- role compatibility with available bench players
- five-substitution limit
- time separation between substitution windows
- current ball ownership safety

The on-field tactical slot remains stable while the replacement player's name, attributes, role profile, behaviour and condition are loaded into that slot.

## Emergency attack

When an AI team is behind from minute 86 onward, the engine can:

- activate `ALL_OUT`
- select the strongest aerial centre-back
- convert the player to a target-forward attacking profile
- raise fullback risk and defensive line
- flag the goalkeeper for the final attacking corner after minute 89

## Official data contract

The V4 snapshot exposes:

```js
snapshot.managerAI.home
snapshot.managerAI.away
```

The official match state receives:

- manager plan and reason
- decision history
- remaining bench
- tactical changes
- substitutions and windows
- emergency moves
- time-wasting seconds
- human-side recommendations

## Public API

```js
engine.applyTacticalPlan(side, planName, reason)
engine.makeSubstitution(side, outgoingId, incomingId, reason)
engine.reviewManager(side, force)
engine.setManagerControl(side, control)
engine.debugSetScore(home, away)
engine.debugSetPlayerEnergy(playerId, energy)
engine.debugSetPlayerYellow(playerId, true)
```

## Validation summary

Nine deterministic regression scenarios passed. A 20-match parallel calibration completed with deterministic manager plans, substitutions and event histories.

The calibration is an integration check, not final football balance. Goal conversion, fatigue curves and card frequency remain subjects for the final large-scale calibration phase.
