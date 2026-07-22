# FIFA Tournament Hub V44.2.1 — Critical Recovery Hotfix

## Corrected failure

V44.2.0 introduced the title screen but could display `Kariyerlerim: 0` when the previous Manager state was stored in a legacy wrapper, recovery key, save slot or nested backup structure. The exit action also used `activeCareerId = null`, making the saved career selection fragile.

## Changes

- Exit now opens the title screen through `ui.launcherOpen` and keeps the selected career ID intact.
- Existing careers are scanned and recovered from:
  - `fifa-manager-room-v42`
  - `fifa-manager-room-recovery-v43`
  - `fifa-manager-room-last-good-v44`
  - save-slot snapshots
  - other local JSON storage entries containing a valid Manager career
  - imported JSON backup files
- A last-known-good Manager backup is written whenever valid careers exist.
- Empty state writes no longer overwrite a valid recovery snapshot.
- Real Game / Test buttons wait for bootstrap and team catalogue loading instead of failing silently.
- Added Save Recovery Centre, JSON import, Manager backup export and Return to Tournament Hub controls.
- Service Worker cache updated to V44.2.1.
- TR/EN strings added for the recovery workflow.

## Compatibility

No SQL change. No schema reset. Existing V44.1 and V44.2 careers remain compatible.
