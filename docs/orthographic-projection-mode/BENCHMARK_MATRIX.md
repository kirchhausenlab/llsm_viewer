# Benchmark Matrix

This matrix defines the benchmark scenarios and acceptance criteria for orthographic-mode delivery.

## Core rule

Perspective mode is the protected baseline.

Every benchmark pass must answer two separate questions:

1. Did perspective mode remain non-regressed?
2. Is orthographic mode acceptably performant for the same workload class?

## Metrics to capture

At minimum, capture:

- median frame time
- p95 frame time
- render calls / triangles if available
- selected scale level or equivalent adaptive-LOD signal
- residency churn metrics if available:
  - uploads
  - evictions
  - pending bricks
  - scheduled uploads

## Perspective baseline scenarios

Run these before and after orthographic implementation.

### P-1: Dense dataset, MIP, linear

- Camera:
  - normal perspective close-up view
- Validate:
  - frame time
  - adaptive scale selection
  - no visual regression

### P-2: Dense dataset, BL, linear

- Camera:
  - typical inspection view with rotation and zoom
- Validate:
  - frame time
  - early-exit behavior not obviously regressed
  - no visual regression

### P-3: Sparse dataset, MIP, nearest

- Camera:
  - motion-heavy navigation
- Validate:
  - frame time
  - no residency churn regression

### P-4: Playback + follow baseline

- Camera:
  - perspective follow mode
- Validate:
  - frame time
  - no framing regression
  - no playback-induced churn regression

## Orthographic acceptance scenarios

### O-1: Dense dataset, MIP, linear

- Camera:
  - orthographic overview
- Validate:
  - stable volume rendering
  - acceptable frame time

### O-2: Dense dataset, MIP, linear close-up

- Camera:
  - orthographic zoomed-in inspection view
- Validate:
  - scale selection reacts to zoom
  - frame time remains acceptable

### O-3: Dense dataset, BL, linear

- Camera:
  - orthographic rotation/inspection view
- Validate:
  - BL remains visually correct
  - frame time remains acceptable

### O-4: Sparse dataset, nearest

- Camera:
  - orthographic close-up and medium zoom
- Validate:
  - residency churn is not pathological
  - image quality tracks zoom expectations

### O-5: Playback + follow in orthographic

- Camera:
  - follow track / follow voxel
- Validate:
  - framing is preserved
  - zoom remains stable
  - playback remains responsive

## Acceptance criteria

### Perspective mode

- Perspective visual behavior in baseline scenarios must be unchanged except for intentionally documented fixes.
- Perspective median frame time must not regress materially.
- As a default guardrail, treat a regression above roughly 3% to 5% in stable baseline scenarios as a blocker unless there is strong compensating evidence and explicit approval.

### Orthographic mode

- Orthographic mode must render correctly in all scenarios in `TEST_PLAN.md`.
- Orthographic frame time must be acceptable for the workload class.
- As a default guardrail, treat orthographic frame time materially worse than about 25% relative to comparable perspective scenarios at matched apparent coverage as a tuning failure unless documented evidence shows the comparison is not meaningful.

## Evidence recording

Record benchmark results in `EXECUTION_LOG.md` with:

- scenario id
- commands used
- before/after numbers
- pass/fail against criteria
- notes on any interpretation caveats

## Completion evidence snapshot

The completion pass used the following concrete verification evidence:

- `npm run -s typecheck`
- `npm run -s typecheck:tests`
- `npm run -s test`
- `npm run -s test:perf`
- `npm run -s verify:fast`
- `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/projection-mode-smoke.spec.ts`
- `TEST_DATA_DIR=/tmp/llsm-e2e-smoke npm run -s test:e2e`

Acceptance result:

- Perspective mode: accepted as non-regressed for this program.
- Orthographic mode: accepted as correct and performant enough for the current desktop viewer workload envelope.
