# FIFA Universe V2.1.0 — FIFA Player Index

Build: `201000`  
Release date: `31.07.2026`

## New public identity

The player-strength system is now presented as **FIFA Player Index (FPI)** throughout the tournament experience. Internal historical data fields remain compatible, so previous match records, registrations, draws and cloud data continue to work without migration.

The public model now gives two separate answers:

- **FPI Rating:** the official zero-sum strength rating used for seeding and pot order. It answers “Who is stronger?”
- **FPI/100:** an explainable context score. It answers “Why does this Rating exist, and how reliable is the evidence?”

Tournament standings are unchanged. FIFA 10 continues to rank players by `PPG`, then `GD/M`, followed by the approved remaining tie-breakers. FPI does not override the tournament table.

## FIFA Player Standing

The former simple rating list is now a complete **FIFA Player Standing** centre with:

- current Rating, historical peak and floor;
- FPI/100 profile score;
- latest-five Rating movement and rank movement;
- average opposition Rating;
- performance versus pre-match expectation;
- pressure-match performance;
- team-adjusted player impact;
- stability signal;
- evidence confidence and confidence band;
- strength tier from `OUTSIDER` to `ICON`;
- a selectable player dossier and latest-five match ledger.

## Explainable FPI/100 model

| Signal | Weight | Meaning |
|---|---:|---|
| Core Strength | 45% | Long-term zero-sum Rating from all official results |
| Above Expectation | 17% | Actual results compared with pre-match expectation |
| Opposition Quality | 11% | Average pre-match Rating of faced opponents |
| Current Form | 10% | Latest five official match results |
| Pressure Strength | 10% | Play-in, knockout, semi-final and final performance |
| Team-Adjusted Impact | 7% | Value produced relative to the general results of teams used |

Confidence is displayed separately from ability. A high score with limited match evidence remains marked as provisional; the model does not disguise uncertainty.

## Live home ticker

The Universe Home page now includes a continuously scrolling **FPI LIVE — FIFA PLAYER STANDING** ticker. It shows every ranked player with:

- rank;
- player name;
- FPI Rating;
- FPI/100;
- latest-five movement;
- current tier.

Each player is selectable from the ticker. The ticker pauses for hover/focus, supports keyboard interaction and disables forced animation when the device requests reduced motion.

## Full-site integration

FPI terminology is integrated into registration, seeding pots, group draw, fixture operations, player cards, simulation, Pressure Chamber, Power Exchange, Destiny Path, AI Tournament Director, Final Chapter Intelligence and the international English package.

Manager Career keeps its separate **Manager ELO** identity because it is an independent game-mode rating and is not the FIFA player-strength system.

## Compatibility and safety

- Existing official results and draw state are read without mutation.
- Existing internal `elo` fields remain supported for backward compatibility.
- FIFA 10 group allocation, 78-match fixture structure and team-pool rules are unchanged.
- Cloud configuration content is unchanged.
- Service-worker cache is advanced to `oruc-reis-fifa-universe-v2-1-0-fpi`.

