# FIFA Tournament Hub V44.2.0

## Exit-career root cause fixed

`activeCareer()` previously returned the first saved career whenever `activeCareerId` was `null`. Consequently, **Exit Career** cleared the active ID, but the next render immediately reopened the first career. V44.2 returns `null` when there is no active career and renders a proper title screen instead.

## Real Game access

- Dedicated Official Career card
- Dedicated Test Laboratory card
- Resume latest career by mode
- Saved-career selection cards
- Cloud career unlock remains available
- Exit saves locally, attempts the official cloud save, stops the live engine, and returns to the title screen

## English interface

A replacement `language.js` provides persistent TR/EN selection, dynamic DOM translation, Manager Room and Match Engine terminology, attributes/placeholders, and retranslation after view renders. Brand names, player names and club names are intentionally preserved.

## Compatibility

The existing `fifa-manager-room-v42` storage key and career schema are retained. Match Engine 4.1 logic is unchanged.
