# FIFA Universe V2.2.0 — Player Standing Intelligence

Build: `202000`  
Release date: `31.07.2026`

## Main identity

The public player-strength system is now **FIFA Player Standing**. The previous FPI implementation remains the compatible technical foundation, but the visible product is organised around four clearer concepts:

- **Standing Rating:** official zero-sum competitive order.
- **Standing Shift:** separate Rating and rank movement.
- **Standing Index / 100:** explainable profile score.
- **Standing DNA:** Result Efficiency, Opposition Level, Dominance, Pressure, Consistency and Momentum.

## Mathematical upgrade

- Experience-calibrated K-factor: 36 / 30 / 24 / 20.
- Correct stage detection for play-in, quarter-final, semi-final, third-place and final.
- Final weight 1.35; semi-final 1.25; quarter-final 1.15; knockout 1.10.
- Score impact capped at 1.28 so a single blowout cannot erase a career history.
- Maximum one-match Rating movement capped at 48.
- Zero-sum movement is preserved.

## New Standing Centre

- Why This Standing narrative.
- Next Target and points required to pass the next player.
- Gap to leader and gap to next position.
- Standing Timeline chart.
- Latest Shift Anatomy with expectation, K-factor, stage weight, score impact and final shift.
- Standing DNA panel and separate evidence confidence.
- Biggest upset and smallest standing gap summaries.
- Standing table separates rank movement, Rating shift and form.

## Home and Player Passport

- **Standing Pulse** continuously scrolls the complete ranking on the Universe home page.
- Ticker footer surfaces Top Mover, Biggest Upset and Smallest Gap.
- Universal Player Passport now includes a permanent Standing Identity module.

## Compatibility

Internal `elo`, FPI action names and historical state fields remain unchanged for backward compatibility. Manager Career keeps its independent Manager ELO identity. Tournament standings remain PPG / GD-per-match based and are not replaced by Player Standing.

## Competitive Class bands

- ICON: 1750+
- ELITE: 1650–1749
- TITLE CONTENDER: 1550–1649
- CHALLENGER: 1450–1549
- RISING: 1350–1449
- OUTSIDER: below 1350

Visible FPI terminology has been retired in favour of Player Standing. Legacy internal field and action names remain unchanged only for data compatibility.
