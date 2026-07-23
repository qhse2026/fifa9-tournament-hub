# FIFA Match Engine V4 — Phase 6

Phase 6 adds coordinated defensive intelligence to the official V4 match engine.

## Included

- Press triggers
- Primary and secondary pressing roles
- Touchline traps and double teams
- Cover shadows and passing-lane control
- Defensive line leadership
- Offside trap resolution
- Transition delay and counter-press regain
- Cutback and near-post box defence
- Defensive telemetry and official statistics
- Phase 1–5 systems inside the same bundle

## Production file

`manager-match-engine-v4-phase6.bundle.js`

Load it immediately after the legacy base file:

```html
<script src="manager-match-engine.js"></script>
<script src="manager-match-engine-v4-phase6.bundle.js?v=4.0.0-phase6.1"></script>
```

Do not load earlier V4 phase bundles at the same time.

## Tests

```bash
node tests/v4-phase6-regression.js
```

## Laboratory

Open `match-engine-v4-phase6-lab.html` beside the production bundle.
