# FIFA Tournament Hub V44.6.1 — Season Division Lock

## Root cause
`assignThreeLeagueDivisions()` re-sorted AI managers by current power every time the career was migrated. Fixtures remained attached to the original season divisions, while actor division labels and table rows moved. This produced apparent unplayed teams such as Yıldız FC and partial tables such as Çınar City.

## Fix
- Season division membership is inferred from the 324-fixture schedule and stored in `seasonDivisionMap`.
- Division membership stays locked for the active season regardless of ELO changes.
- Tables are rebuilt from played league fixtures as the authoritative source.
- Schedule integrity audit checks 108 fixtures, 36 pairings and 24 matches per manager in each division.
- Existing played scores, ELO changes and cup progress are preserved.
