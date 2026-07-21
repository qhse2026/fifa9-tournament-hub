# FIFA Lig Sistemi v38.0 Feature Model

## Season Launch Wizard

The wizard writes directly to the selected season record. It confirms participation, assigns league membership, configures test/official mode, applies team rules and optionally generates the three-leg round-robin fixtures.

## Team Pools

Stored under:

```js
season.teamPools = {
  "4": { label, stars, teams },
  "4.5": { label, stars, teams },
  "5": { label, stars, teams },
  "cup": { label, stars, teams }
}
```

Related controls:

```js
season.teamPoolLocked
season.enforceTeamPool
season.preventTeamReuse
```

## Career Passport

Career data is calculated at render time from:

- Historical FIFA01-FIFA08 match data
- Completed FIFA09 honour data
- FIFA10+ league and cup matches
- Custom museum honour records

No duplicated career database is required.
