# Roadmap

Status values:

- `PENDING`
- `IN_PROGRESS`
- `COMPLETE`
- `BLOCKED`

## Phase 0: Baseline and inventory

Status: `COMPLETE`

Goals:

- confirm current tests pass before refactor
- inventory every dense segmentation touchpoint
- record baseline storage, load, memory, and render numbers

Deliverables:

- updated `CURRENT_STATE.md` if new touchpoints are found
- baseline entries in `BENCHMARK_MATRIX.md`
- first `SESSION_HANDOFF.md` implementation note

## Phase 1: Types and manifest schema

Status: `COMPLETE`

Goals:

- introduce explicit layer kind and sparse segmentation manifest descriptors
- accept intensity-only legacy/current manifests
- reject legacy dense segmentation manifests
- add schema fixtures for sparse segmentation

Deliverables:

- schema validation tests
- manifest fixture tests
- clear legacy segmentation rejection error

## Phase 2: Sparse brick storage primitives

Status: `COMPLETE`

Goals:

- implement brick coordinate utilities
- implement brick directory records
- implement payload shard writing/reading
- implement required brick codecs
- implement codec validation and round-trip tests

Deliverables:

- codec unit tests
- corrupt payload tests
- deterministic directory ordering tests

## Phase 3: Sparse segmentation preprocessing

Status: `COMPLETE`

Goals:

- stream segmentation TIFF input into sparse bricks
- emit sparse scale descriptors
- build multiscale categorical sparse pyramids
- emit label metadata
- avoid dense global label arrays

Deliverables:

- preprocessing tests against dense reference fixtures
- generated sparse manifest fixtures
- memory behavior checks for large sparse fixtures

## Phase 4: Provider and CPU query APIs

Status: `COMPLETE`

Goals:

- load sparse segmentation indexes
- load/decode brick payloads
- provide exact label lookup
- provide sparse slice extraction
- cache decoded bricks safely

Deliverables:

- provider tests
- hover lookup tests
- slice extraction tests
- missing-brick correctness tests

## Phase 5: Viewer contract and resource manager

Status: `COMPLETE`

Goals:

- update viewer layer types
- represent sparse readiness
- pack sparse segmentation GPU resources
- track CPU/GPU residency
- remove dense segmentation texture upload

Deliverables:

- resource packing tests
- GPU texture layout tests
- readiness state tests

## Phase 6: WebGL2 sparse 3D renderer

Status: `COMPLETE`

Goals:

- implement sparse brick DDA traversal
- implement packed `uint32` label decoding
- implement hash-based label coloring
- implement local sub-brick skipping
- preserve hover highlight and lighting

Deliverables:

- shader planning tests where practical
- visual tests for sparse segmentation scenes
- performance tests across sparsity regimes

## Phase 7: Sparse slice renderer

Status: `COMPLETE`

Goals:

- replace dense segmentation slice preparation
- extract only intersecting sparse bricks
- color labels consistently with 3D

Deliverables:

- exact dense-reference slice tests
- visual slice tests
- slice latency benchmarks

## Phase 8: UI, VR, and integration cleanup

Status: `COMPLETE`

Goals:

- update desktop controls
- update VR HUD controls
- update hover display
- update paintbrush assumptions
- update ROI exclusion assumptions
- delete dense segmentation paths

Deliverables:

- frontend tests
- VR HUD tests
- typecheck with no stale dense segmentation references

## Phase 9: Verification and closure

Status: `COMPLETE`

Goals:

- run full verification
- run benchmark matrix
- update docs with final implementation notes
- mark backlog complete with evidence

Deliverables:

- passing `verify:fast`
- passing relevant UI/visual/e2e tests
- benchmark report
- completed `CUTOVER_CHECKLIST.md`
