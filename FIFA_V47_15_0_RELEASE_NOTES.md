# FIFA Tournament Hub V47.15.0 — Tournament Experience Suite

V47.15.0 turns the live FIFA 10 operations area into a complete tournament-day
suite while preserving the existing official record, 78 fixtures, fixed groups,
team passports and connected analytics.

## Player Match Centre

- One selectable page for every registered player.
- Personal next match, remaining fixtures and completed results.
- Overall rank, PPG, goal difference per match and qualification path.
- Used and remaining eligible teams for 4★, 4.5★ and 5★ tiers.
- Public read access; result editing remains administrator-only.

## Administrator Quick Result Entry

- A compact pending-match panel above the full fixture list.
- Player filter for immediately locating the next relevant match.
- Uses the existing official result modal and save pipeline.

## Standings Scenario Centre

- Every player name in the overall table opens a projection.
- Shows current position plus win, draw and loss outcomes for the next match.
- Recalculates PPG and GD/M on a cloned draw state, so scenarios never mutate
  the official tournament record.

## Device and Cloud Sync History

- Device saves and cloud outcomes are logged separately with timestamps.
- The latest state is visible directly in Tournament Operations.
- A failed cloud attempt keeps the device save safe and exposes an admin retry.
- Historical failures do not remain marked as pending after a later cloud save.

## TV / Wall Mode

- Full-screen live table for all 14 players.
- Latest completed results and next scheduled matches.
- Direct-QF, Championship Play-in and eliminated zones remain visually distinct.
- Responsive fallback keeps the full table readable on smaller displays.

## Printed Player QR Access

- Every printed player board contains an offline-generated QR code.
- The code opens the matching Player Match Centre deep link.
- QR generation is bundled locally with `qrcode-generator` 2.0.4; no external
  network request is required during printing.

## Preserved Competition Logic

- Ranking: PPG → goal difference per match → total goals for → win rate → draw lot.
- Goals for and against remain totals; total points and total goal difference
  remain visual values in parentheses.
- Ranks 1–4 advance directly to the quarter-finals.
- Ranks 5–12 enter Best-of-3 Championship Play-in pairings:
  5–12, 6–11, 7–10 and 8–9.
- Ranks 13–14 are directly eliminated; no Preliminary stage exists.
- Official men-only team pools remain 48 + 19 + 9 = 76 clubs.
