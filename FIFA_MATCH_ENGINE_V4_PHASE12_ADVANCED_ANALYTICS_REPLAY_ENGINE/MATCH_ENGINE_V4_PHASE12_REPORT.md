# Match Engine V4 — Phase 12 Technical Report

## 1. Scope
Phase 12 adds an event-sourced match-analysis and replay layer on top of Phase 11. The analysis layer does not generate match outcomes. It consumes the official V4 event stream and official positional snapshots.

## 2. Architecture

```text
Phase 10 core simulation
  → official events and snapshots
Phase 11 visual renderer
  → 60 FPS presentation and short replay
Phase 12 analytics
  → maps, models, player ratings, timeline and full replay archive
```

The core `createEngine()` method is decorated rather than replaced. Every Phase 12 engine exposes:

- `getAnalytics(options)`
- `getMatchAnalysis(options)`
- `exportReplayArchive()`
- `getReplayClip(id)`

## 3. Event-sourced analytics
The following products are created directly from official events:

- Shot map and shot outcomes
- Pass map and pass outcomes
- Carry map
- Pass network
- Key passes and expected assists
- Progressive passes and carries
- Possession sequences
- Key-event timeline

Statistics are not generated separately after the score is known.

## 4. Expected Threat model
Phase 12 uses a custom spatial xT function based on:

- Progress toward the attacking goal
- Centrality
- Final-third entry
- Penalty-area entry

Only positive territorial value is credited to completed passes and carries. This is a game-specific model and is not represented as an Opta/StatsBomb proprietary model.

## 5. Heatmaps and average positions
Player positions are sampled every two simulated seconds into a 12 × 8 grid. The system produces:

- Home team heatmap
- Away team heatmap
- Individual player heatmaps
- Average player positions
- Field-tilt touch counts

## 6. Momentum
Momentum is grouped into five-minute buckets and combines:

- Shot volume and xG
- Progressive passes and carries
- Territorial xT
- Pressing regains and recoveries
- Possession samples

Momentum is an explanatory visual metric, not a hidden gameplay bonus.

## 7. Player ratings
Player ratings use role-neutral event contributions including:

- Goals and assists
- xG, xA and xT
- Key passes
- Passing retention
- Tackles, interceptions and recoveries
- Turnovers
- Cards
- Goalkeeper saves and goals conceded

Ratings are clamped to 3.5–10.0.

## 8. Replay archive
Phase 12 stores compact replay frames at approximately one-second intervals. Each frame contains:

- Match time and score
- Ball position and height
- Possession and phase
- 22 player coordinates
- Energy and physical status

Automatic clips are indexed around goals, red cards, penalties, high-xG chances and woodwork. Full frames are exported separately to avoid inflating the career save.

## 9. Live interface
The Phase 11 HUD receives an `ANALİZ` button. The Phase 12 panel provides:

- Summary
- Momentum
- Shot map
- Pass map and network
- Heatmaps
- Player cards
- Timeline
- JSON export
- Replay archive export

## 10. Persistence
A lightweight analysis product is written under:

```text
fixture.matchEngine.matchAnalysis
```

The full replay-frame archive remains runtime/export data. No database migration is required.

## 11. Stability fixes included in the Phase 12 bundle
- Added-time clock progression now continues beyond 90:00.
- Restart handlers include safe fallbacks after extreme dismissal scenarios.

## 12. Calibration snapshot
Eight deterministic full matches produced these two-team averages:

- Goals: 1.75
- Shots: 20.12
- xG: 3.50
- xGOT: 2.42
- xT: 4.24
- Passes: 1043.00
- Pass accuracy: 80.06%
- Progressive passes: 244.00
- Key passes: 15.25
- Carries: 103.75
- Replay frames: 4212.00
- Replay clips: 9.00

## 13. Known boundaries
- The xT model is calibrated for this simulation, not an external commercial data provider.
- One-second replay sampling is sufficient for tactical replay; Phase 11 remains responsible for smooth 60 FPS rendering.
- Browser memory depends on match duration and exported replay-frame count. The live registry retains only a limited number of recent analysis instances.
