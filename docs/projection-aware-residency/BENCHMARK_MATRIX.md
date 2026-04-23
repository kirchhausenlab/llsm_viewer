# Benchmark Matrix

This matrix defines the benchmark scenarios and acceptance criteria for the projection-aware residency refactor.

## Core questions

Every benchmark pass must answer all of the following:

1. Did perspective mode remain non-regressed?
2. Did orthographic mode stop depending on the force-volume fallback?
3. Did orthographic playback and close-up performance improve on atlas-friendly datasets?
4. Is any remaining direct-volume selection in orthographic policy-driven rather than projection-forced?

## Metrics to capture

At minimum capture:

- median frame time
- p95 frame time
- selected residency mode
- selected scale level
- if available:
  - resident bricks
  - uploads
  - evictions
  - pending bricks
  - scheduled uploads
- startup latency for buffered-start

## Perspective baseline scenarios

### P-1: Dense dataset, MIP, linear

- Validate:
  - perspective residency mode remains reasonable
  - no material frame-time regression

### P-2: Dense dataset playback

- Validate:
  - playback remains smooth
  - buffered-start semantics remain correct
  - no new residency churn pathologies

### P-3: Sparse dataset navigation

- Validate:
  - atlas prioritization remains healthy
  - no perspective churn regression

## Orthographic target scenarios

### O-1: Dense dataset overview

- Validate:
  - selected residency mode is policy-driven
  - atlas is allowed when appropriate
  - frame time is acceptable

### O-2: Dense dataset close-up

- Validate:
  - orthographic atlas prioritization reacts to zoom / framing
  - frame time improves over the current force-volume baseline

### O-3: Dense dataset playback

- Validate:
  - orthographic playback uses the same acceleration architecture where policy selects atlas
  - buffered-start works
  - playback is materially improved over the current baseline

### O-4: Sparse dataset close-up

- Validate:
  - residency churn is not pathological
  - policy can still choose direct volume when justified

### O-5: Orthographic follow/playback

- Validate:
  - framing and zoom remain stable
  - residency selection does not thrash under follow

## Acceptance criteria

### Perspective mode

- Perspective visual behavior must remain unchanged except for intentionally documented fixes.
- Perspective median frame time must not regress materially.
- As a default guardrail, treat a regression above roughly 3% to 5% in stable baseline scenarios as a blocker unless there is strong compensating evidence and explicit approval.

### Orthographic mode

- Orthographic must no longer be projection-forced to direct volumes.
- Orthographic atlas-friendly scenarios must show a material improvement over the current force-volume baseline.
- Orthographic mode must render correctly and remain policy-consistent in all scenarios in `TEST_PLAN.md`.

### Policy integrity

- Any residency mode selected in orthographic must be explainable by policy inputs other than projection alone.
- A benchmark pass is a failure if “orthographic => volume” remains effectively true due to hidden hard-coded rules.

## Evidence recording

Record benchmark results in `EXECUTION_LOG.md` with:

- scenario id
- command used
- residency mode selected
- before/after numbers
- pass/fail against criteria
- interpretation caveats if any

