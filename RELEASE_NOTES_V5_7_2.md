# FIFA Universe V5.7.2 — Championship Frontline

## Purpose
FIFA 10 group league is complete. This release promotes the knockout operation from a deep Championship OS tab to the primary FIFA 10 workflow.

## New primary order
1. Matches and result entry
2. Live tournament bracket
3. Official sealed group standings
4. Qualification and intelligence modules

## Championship OS changes
- Championship is the default FIFA 10 operations tab after all 78 group fixtures are complete.
- The official journey is created automatically when an authenticated administrator opens the centre after group completion.
- Active/playable series appear first with admin result controls.
- A compact full bracket is displayed directly beneath match operations.
- The sealed official group table is displayed beneath the bracket and remains the seeding source.
- Player Result Desk is directly accessible from the Championship Frontline.

## Player Result Desk
- Available in the in-site Output Centre and the standalone `fifa10-print-centre.html` page.
- A signed-in player sees only knockout matches involving their linked player identity.
- One player submits score and both official teams.
- The opponent must confirm the exact same score and teams.
- Conflicting submissions are rejected.
- After two matching confirmations, the result is written to the official Championship JSON and the fixed bracket advances automatically.
- Team reuse across the FIFA 10 group league and Championship is rejected server-side.
- Series matches must be entered in order.

## Database migration
Run `SUPABASE_V5_7_2_PLAYER_RESULT_DESK.sql` once in Supabase SQL Editor before players use the Result Desk.

## Build
`572000`
