# FIFA Universe V5.7.3 — Championship Draw System

## Official knockout rules
- Play-In remains fixed: #5–#12, #6–#11, #7–#10, #8–#9.
- Quarter-finals are NOT pre-linked. Pot 1 contains League #1–#4 (seeded); Pot 2 contains the four Play-In winners. Each QF is created by an official draw pairing one player from each pot.
- Semi-finals are NOT pre-linked. All four QF winners enter one open pot and a completely new draw creates SF1 and SF2.
- Third-place match = two SF losers.
- Grand Final = two SF winners.

## Site behaviour
- Match Operations pauses when a draw is required.
- QF Draw Centre appears only after all four Play-In series are complete.
- SF Draw Centre appears only after all four QF series are complete.
- Admin can record a physical/manual draw or run a digital random draw.
- Draw can be reset only before a match in that round (or later) has been completed.
- Existing V5.7.2 fixed-bracket state is safely migrated when no QF-or-later result exists.
- If QF-or-later results already exist on the legacy route, automatic migration is blocked to protect official data.

## Player Result Desk
The Supabase function no longer advances PI winners into fixed QF slots or QF winners into fixed SF slots. Player-confirmed results stop at the draw gate until an admin records the official draw.
