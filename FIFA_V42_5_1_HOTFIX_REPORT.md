# V42.5.1 Hotfix

Fixed the match-start crash: `Cannot read properties of undefined (reading 'find')`.

Cause: V42.5 added formation, player-role and press-conference fields to the match plan. The legacy tactical aggregator attempted to resolve every field through the five standard tactical option groups.

Resolution: the aggregator now processes only `mentality`, `pressing`, `buildUp`, `tempo` and `risk`. Formation, player roles and press answers remain in the match state and are handled by their own systems.

Existing careers, draws and results are preserved. No SQL change is required.
