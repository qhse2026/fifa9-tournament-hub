# Match Engine V4 — Phase 10 Technical Report

## Scope
Phase 10 adds referee personality, foul adjudication, advantage, disciplinary sanctions and added-time calculation to the Phase 9 engine.

## Referee profiles
- lenient
- balanced
- strict
- disciplinarian

Each profile controls strictness, yellow/red thresholds, advantage preference, penalty sensitivity, dissent tolerance and time-wasting tolerance.

## Foul context
The decision combines pressure, aggression, tackling risk, field progress, transition state, challenge direction, reckless intensity and defenders behind the ball.

## Advantage state
`FOUL → ADVANTAGE_PLAYED → ADVANTAGE_REALIZED` or `ADVANTAGE_RECALLED → FREE_KICK`. Delayed sanctions are issued after the advantage phase ends.

## Discipline
Warnings, yellow cards, second yellows and direct red cards are supported. A dismissed player is removed from the active team. If the goalkeeper is dismissed, an outfield player becomes an emergency goalkeeper.

## Added time
Goals, substitutions, cards, injuries, penalties and time wasting contribute to delay banks. The second-half allowance extends the real match end beyond 90:00.

## Persistence
New referee and disciplinary statistics are written under `fixture.matchEngine.stats`. No mandatory database migration is required.
