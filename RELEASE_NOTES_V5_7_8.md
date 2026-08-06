# FIFA Universe V5.7.8 — Quota-Safe Storage Hotfix

## Fixed
- Resolves `QuotaExceededError` on the main `fifa-tournament-hub-v1` localStorage payload.
- Semi-final draw reset can now persist when no SF match result has been recorded.
- All critical local writes now pass through QuotaSafe Storage.
- If storage is full, historical Black Box snapshots are compacted progressively while official match results, Championship state, draws, team selections and current statistics are preserved.
- Non-critical UI/cache keys may be cleared only after a quota failure.
- Build/cache marker updated to `578000`.

## SF reset rule
- Allowed only if SF match results are still unplayed.
- QF and Play-In results remain untouched.
- SF draw metadata/equations and downstream Final/3rd-place placeholders are cleared.
