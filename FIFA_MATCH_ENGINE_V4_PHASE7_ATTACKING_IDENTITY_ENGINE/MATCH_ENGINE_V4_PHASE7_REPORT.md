# Match Engine 4.0 — Phase 7 Technical Report

## Scope
Phase 7 adds role-specific attacking intelligence and persistent player identities on top of Phase 6. Each outfield role now has a numerical behaviour profile controlling width, depth, box occupation, link play, runs behind, shooting, crossing, carrying, creative passing, roaming, hold-up play and aerial threat.

## Implemented role families
- Fullback / wingback: defend, overlap, attacking wingback, complete wingback, inverted fullback
- Centre-back: cover, ball-playing defender
- Defensive midfield: anchor, half-back, deep-lying playmaker, regista
- Central midfield: box-to-box, mezzala, carrilero, advanced playmaker
- Attacking midfield: advanced playmaker, shadow striker, enganche
- Wide roles: winger, inverted winger, inside forward, wide playmaker
- Strikers: poacher, advanced forward, complete forward, target forward, false nine, pressing forward

## Integrated behaviours
- Dynamic box slot assignment: near post, far post, penalty spot and edge
- Blind-side runner identification
- Winger/fullback relationship: overlap, underlap or inversion
- False-nine drops and link play
- Target-forward hold-up resolution
- Mezzala half-space occupation
- Ball-playing defender progression
- Role-modified shooting, crossing, passing and carrying utilities
- Actual career-player data ingestion when lineup/player arrays exist
- Official Phase 7 attacking metrics persisted into fixture.matchEngine.stats

## Safety contract
Phase 7 remains V4 full authority and retains all Phase 1–6 systems. The legacy career object remains the persistence container. No SQL migration is required.

## Validation summary
- Regression scenarios: 8/8 passed.
- Normalized role profiles: 27.
- Default 20-match balance: 1.80 goals, 25.75 shots, 82.60% passing accuracy per match.
- Contrasting-role 40-match pool: 1.50 goals and 21.03 shots per match; role choices materially change attacking volume and structure.

## New official metrics
`attackingRuns`, `blindSideRuns`, `overlaps`, `underlaps`, `halfSpaceRuns`, `widthRuns`, `boxRuns`, `falseNineDrops`, `linkPlayActions`, `targetManActions`, `defenderCarries`, `creativePasses`, `killerPassesAttempted`, `progressiveCarries`, `decoyRuns`, and `roleShots`.
