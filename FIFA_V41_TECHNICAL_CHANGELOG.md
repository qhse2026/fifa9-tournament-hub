# FIFA Tournament Hub V41 — Final Chapter Engine

## Added
- Dedicated `current.finalChapter` state model.
- Controlled administrator activation after the V40.4 poll.
- Three fixed direct quarter-finalists by registered player name.
- Nine-player playoff draw with four series and one lucky quarter-finalist.
- Redraw and lock workflow for playoff, quarter-final, and semi-final stages.
- Best-of-three sequential match control and automatic series winners.
- 4★ playoff, 4.5★ quarter-final and 5★ semi-final team pools.
- Per-player team-repeat validation in quarter-final and semi-final rounds.
- Same-team single-match final.
- Legacy knockout backup and safe cancellation before results begin.
- Final Chapter matches included in current match exports and tournament statistics.

## Preserved
- V40.4 public group-only poll.
- League Phase data.
- Gold and Silver Group data.
- Live match archive.
- Supabase `tournament_state` persistence.
- V39 membership and availability infrastructure.

## Database
No new SQL migration is required for V41. The engine is stored inside the existing tournament state payload.
