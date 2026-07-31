# FIFA Universe V3.0.0 — Standing Universe

## Product identity

Player Standing is now a complete competitive universe rather than a single ranking table. The existing zero-sum Standing Rating remains the official order; the new V3.0 layer explains movement, future scenarios, rivalries, leadership history, career identity and data integrity.

## New modules

### Standing Universe Command Centre
- Unified selected-player identity
- Official, Season and Active Form standings
- Live performance titles
- Standing Forecast probabilities

### Standing Race — Road to No.1
- Visual route from the selected player to the leader
- Next-target gap and points required
- Estimated valuable-win path
- Rating downside exposure
- Leadership reign history and active reign
- The Movement narrative feed

### Standing Impact Lab
- Player-versus-player scenario selector
- Stage multipliers: standard, knockout, quarter-final, semi-final, third-place and final
- Score-margin multipliers
- Experience-calibrated K factor
- Zero-sum before/after Rating projection
- Matchday Standing cards
- Post-match Standing reports

### Rivalry Intelligence
- Rivalry Heat /100
- Rating transferred between opponents
- Pressure wins, upsets and final meetings
- Nemesis, Favourite Opponent and Ranking Blocker
- Rivalry timeline

### Standing Legacy
- Dynamic player archetypes and secondary archetypes
- Rating milestones and career peaks
- Longest unbeaten and winning streaks
- Comeback/Recovery wins
- Historical No.1 leadership timeline

### Standing Titles
- The No.1
- The Hunter
- Giant Killer
- Big Match Player
- The Climber
- The Fortress
- Chaos Agent
- The Untouchable
- Comeback King
- Hottest Rivalry

### Standing Integrity Centre
- Zero-sum validation
- Rating-chain continuity
- Duplicate match-ID detection
- Invalid player-name detection
- Stage-mapping validation
- Total Rating conservation
- Rating Replay ledger
- Exportable audit JSON

## Architecture

V3.0 is implemented as a separate `player-standing-universe-v300.js` and `player-standing-universe-v300.css` layer. The 928 KB core `app.js` is not rewritten, reducing regression risk and making rollback straightforward.

## Compatibility

- No database migration required
- Existing local storage and cloud data preserved
- Existing Player Standing V2.2 remains functional
- Service Worker cache upgraded to V3.0
- Responsive layouts included
- Reduced-motion accessibility supported
