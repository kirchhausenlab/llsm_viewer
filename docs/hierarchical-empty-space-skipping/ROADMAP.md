# Roadmap

Status legend: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

Overall program status: `COMPLETE` (2026-03-03)

## Phase 0 - Contract lock and instrumentation

Status: `COMPLETE`

Goals:

- Freeze hard-cutover contract (`format`, schema, no fallback).
- Add hierarchy diagnostics scaffolding for runtime observability.

Exit criteria:

- Decisions and schema contract are implemented in code.
- Runtime diagnostics can report hierarchy readiness and validation state.

## Phase 1 - Schema and preprocess hierarchy emission

Status: `COMPLETE`

Goals:

- Replace scale `chunkStats` contract with `skipHierarchy.levels[]`.
- Emit hierarchy arrays for every `(layer, scale, timepoint)`.

Exit criteria:

- Preprocess writes valid hierarchy metadata for all scales/timepoints.
- Schema validation fixtures/tests are updated and passing.

## Phase 2 - Provider hierarchy ingestion

Status: `COMPLETE`

Goals:

- Load hierarchy arrays in `loadBrickPageTable`.
- Extend `VolumeBrickPageTable` to carry hierarchy levels.

Exit criteria:

- Provider returns hierarchy metadata with strict shape/range validation.
- Runtime rejects malformed hierarchy metadata with explicit errors.

## Phase 3 - Viewer texture packing and uniform plumbing

Status: `COMPLETE`

Goals:

- Upload hierarchy into GPU textures.
- Bind hierarchy metadata uniforms for shader traversal.

Exit criteria:

- Resource lifecycle supports hierarchy textures without leaks/stale bindings.
- Skip diagnostics reflect hierarchy state (ready/invalid reasons).

## Phase 4 - Shader hierarchical traversal core

Status: `COMPLETE`

Goals:

- Implement node-based skip traversal and ray jumps.
- Remove atlas-index-driven skip semantics.

Exit criteria:

- MIP/ISO/BL use shared traversal core.
- Traversal guarantees forward progress and correct box-boundary handling.

## Phase 5 - Mode-specific correctness hardening

Status: `COMPLETE`

Goals:

- Ensure MIP refinement remains stable with variable jump distances.
- Ensure ISO threshold crossing remains correct.
- Ensure BL accumulation and crosshair events remain correct with skip jumps.

Exit criteria:

- All mode-specific tests and visual checks pass.
- No regressions in nearest/linear sampling behavior.

## Phase 6 - Perf calibration and acceptance

Status: `COMPLETE`

Goals:

- Calibrate hierarchy traversal constants.
- Validate sparse-scene speedups under stress/perf harnesses.

Exit criteria:

- Benchmark matrix targets are met.
- No unacceptable regressions on dense scenes.

## Phase 7 - Closure and handoff

Status: `COMPLETE`

Goals:

- Complete backlog closure.
- Synchronize docs and session handoff artifacts.

Exit criteria:

- All backlog items are `DONE`.
- `SESSION_HANDOFF.md` + `EXECUTION_LOG.md` reflect final verification evidence.
