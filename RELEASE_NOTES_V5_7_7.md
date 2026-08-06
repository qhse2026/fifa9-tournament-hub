# FIFA Universe V5.7.7 — Semi-Final Draw Reset Hotfix

- Fixed Semi-Final draw reset when no SF match has been played.
- Removed blocking native confirm() from QF/SF draw reset actions.
- SF reset now checks only actual completed SF matches.
- Successful SF reset preserves all Play-In and Quarter-Final results.
- SF pairings, draw mode/timestamp, series participants and downstream Third Place / Final placeholders are cleared.
- QF reset follows the same dependency-safe model and preserves Play-In results.
- Unified Official Match Feed and Unified Team Passport remain unchanged.
- Build: 577000.
