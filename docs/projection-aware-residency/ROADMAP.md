# Roadmap

Status legend: `PLANNED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

## Phase 0 - Baseline and guardrails

Status: `COMPLETE`

Delivered:

- definitive investigation summary documented
- root cause separated from surface-level orthographic symptoms
- protected perspective non-regression requirements recorded

## Phase 1 - Residency decision extraction

Status: `COMPLETE`

Delivered when complete:

- explicit residency decision seam exists
- current semantics are preserved through the seam
- projection is an input to policy, not a hard override

## Phase 2 - Remove projection-forced residency mode

Status: `COMPLETE`

Delivered when complete:

- `projectionMode === 'orthographic'` no longer forces direct-volume residency
- policy can choose atlas or volume for either projection
- direct-volume remains available as a legitimate policy outcome

## Phase 3 - Projection-aware atlas prioritization

Status: `COMPLETE`

Delivered when complete:

- orthographic atlas residency uses projection-aware prioritization inputs
- close-up orthographic views no longer depend on perspective-biased camera-position-only priority
- residency churn and visual stability are benchmarked

## Phase 4 - Playback architecture unification

Status: `COMPLETE`

Delivered when complete:

- playback cache supports prepared atlas and prepared volume outcomes
- buffered-start and readiness checks are residency-mode-agnostic
- promotion/reuse does not assume atlas-only warmup frames

## Phase 5 - Benchmarking and hardening

Status: `IN_PROGRESS`

Delivered when complete:

- perspective baseline remains non-regressed
- orthographic playback and close-up performance are materially improved over the current force-volume baseline
- temporary compatibility seams are removed or explicitly documented

## Phase 6 - Closure

Status: `IN_PROGRESS`

Delivered when complete:

- docs updated to match implementation
- backlog cleared
- handoff and execution log synchronized
