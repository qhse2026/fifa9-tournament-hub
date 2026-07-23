# Phase 13 CI Gate

Quick gate:

```bash
ME4_CAL_MATCHES=4 node tests/v4-phase13-ci-gate.js
```

Baseline gate:

```bash
ME4_CAL_MATCHES=20 node tests/v4-phase13-ci-gate.js 20 BALANCE_BASELINE_R1.json
```

The process exits with code 1 when the absolute KPI gate fails or an approved-baseline tolerance is exceeded.
