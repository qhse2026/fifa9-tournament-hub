# FIFA Universe V5.7.4 — Result Save Hotfix

## Root cause
V5.7.3 upgraded Championship OS to schema `version: 2` for the QF/SF draw system, while `FIFA10_DRAW_ENGINE.validateChampionshipState()` still accepted only schema version 1. Every Championship result save therefore failed at the final persistence validation step.

## Fix
- Championship validator now accepts schema versions 1 and 2.
- No knockout draw rules were changed.
- Play-In results save normally and stop at QF draw when all four series are complete.
- QF results save normally and stop at SF open draw when all four series are complete.
- Existing local-first / background-cloud save behavior remains unchanged.
- Build/cache marker bumped to `574000`.
