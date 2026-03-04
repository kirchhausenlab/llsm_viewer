# Cutover Checklist

This checklist is mandatory for completing the hard cutover.

## A) Preprocess contract cutover

1. New format id is in code and tests.
2. New storage root dir lineage is in code and tests.
3. Scale schema now uses `skipHierarchy.levels[]` (no legacy `chunkStats` contract).
4. All schema fixtures are migrated.

## B) Runtime cutover

1. Provider reads hierarchy metadata from new contract only.
2. Viewer binds hierarchy textures/uniforms.
3. Shader uses hierarchical traversal.
4. Atlas-residency-based skip predicates are removed.
5. No skip fallback control path remains.

## C) Correctness cutover

1. All render modes verified: `MIP`, `ISO`, `BL`.
2. Both sampling modes verified: `linear`, `nearest`.
3. Invert on/off verified.
4. No known artifact reproductions remain.

## D) Perf cutover

1. Benchmark matrix executed.
2. Sparse-scene speedup targets met.
3. Dense-scene regression guardrails met.

## E) Docs cutover

1. `BACKLOG.md` all `DONE`.
2. `ROADMAP.md` all phases `COMPLETE`.
3. `SESSION_HANDOFF.md` reflects final state.
4. `EXECUTION_LOG.md` includes commands + outcomes + perf results.

