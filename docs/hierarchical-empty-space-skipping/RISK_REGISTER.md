# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`

## R-HES-001: False skip due to hierarchy reduction bug

- Status: `OPEN`
- Trigger:
  - parent-level min/max/occupancy reduction is incorrect
- Impact:
  - non-empty regions are skipped; visible holes and lost structures
- Mitigation:
  - strict reduction invariants in preprocess
  - targeted hierarchy fixtures/tests including adversarial sparse patterns

## R-HES-002: Axis-order mismatch between preprocess/provider/shader

- Status: `OPEN`
- Trigger:
  - inconsistent `(z,y,x)` vs `(x,y,z)` mapping in level indexing
- Impact:
  - skip decisions use wrong nodes; severe visual artifacts
- Mitigation:
  - one documented canonical axis order
  - cross-check tests that validate known node coordinates across stages

## R-HES-003: Traversal overshoot at node boundaries

- Status: `OPEN`
- Trigger:
  - jump distance computation advances past valid sample regions
- Impact:
  - missed hits, flicker, or unstable contours
- Mitigation:
  - robust ray-AABB exit math with epsilon controls
  - guard tests around boundary-aligned rays and grazing angles

## R-HES-004: BL event/overlay regressions with variable jumps

- Status: `OPEN`
- Trigger:
  - BL axis event progression still tied to fixed iteration count
- Impact:
  - incorrect crosshair overlay timing/intensity
- Mitigation:
  - convert event gating to ray-distance progression
  - BL-specific visual/logic tests

## R-HES-005: GPU uniform/texture limits for hierarchy metadata

- Status: `OPEN`
- Trigger:
  - hierarchy metadata representation exceeds practical WebGL2 limits
- Impact:
  - shader compile/runtime failures on some devices
- Mitigation:
  - packed single-texture hierarchy encoding
  - static upper bound on supported hierarchy levels
  - explicit failure when bounds exceeded

## R-HES-006: Perf regression on dense datasets

- Status: `OPEN`
- Trigger:
  - hierarchy traversal overhead exceeds skip gains in dense volumes
- Impact:
  - worse frame times where skipping is low-yield
- Mitigation:
  - tune traversal constants with benchmark matrix
  - optimize node fetch and branch structure

## R-HES-007: Hard-cutover migration friction

- Status: `MONITORING`
- Trigger:
  - old datasets remain in local storage and fail to load after cutover
- Impact:
  - local confusion during migration
- Mitigation:
  - explicit cutover note in docs/handoff
  - clear runtime error text with required re-preprocess action

