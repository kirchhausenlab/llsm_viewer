# Test Plan

This plan defines mandatory verification for hierarchical empty-space skipping hard-cutover delivery.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. `npm run -s test -- tests/preprocessedSchemaValidation.test.ts`
4. `npm run -s test -- tests/preprocessedDataset.test.ts tests/preprocessedMultiscaleRuntime.test.ts tests/preprocessedBrickAtlasEdgeCases.test.ts`
5. `npm run -s test -- tests/useVolumeResources.test.ts tests/volumeRenderShaderSkipModel.test.ts tests/volumeRenderShaderLodModel.test.ts`
6. `npm run -s test -- tests/perf/nextgenVolumeRuntimeStress.test.ts`

If viewer UI diagnostics surface changes, also run:

1. `npm run -s verify:fast`
2. `npm run -s verify:ui`

## Required new/updated coverage

### A. Schema and format hard cutover

- Old format manifests are rejected.
- New hierarchy schema is strictly validated.
- Invalid hierarchy (rank/shape/order) is rejected.

### B. Preprocess hierarchy correctness

- Leaf level equals chunk-grid stats.
- Parent reduction obeys occupancy/min/max invariants.
- Root level is `[1,1,1]`.

### C. Provider loading correctness

- Provider reads all hierarchy levels for the requested timepoint.
- Leaf page-table fields remain coherent with hierarchy level 0.
- Malformed hierarchy metadata throws deterministic errors.

### D. Shader traversal correctness

- Hierarchical skip does not depend on atlas residency index.
- Skip decisions are correct for:
  - invert on/off
  - MIP threshold state
  - ISO threshold state
  - BL background cutoff state
- Traversal always advances (no infinite loops).

### E. Render-mode correctness matrix

Mandatory manual and/or automated validation matrix:

1. `MIP` + `linear`
2. `MIP` + `nearest`
3. `ISO` + `linear`
4. `ISO` + `nearest`
5. `BL` + `linear`
6. `BL` + `nearest`

For each matrix case verify:

- no holes/tearing artifacts from skip traversal
- threshold behavior remains correct
- expected hover/crosshair overlays remain stable

### F. Perf acceptance

- Sparse volumes: skip traversal materially reduces sample work.
- Dense volumes: no unacceptable regressions.
- Camera-motion interactions remain responsive.

## Test evidence logging format

For each implementation session, append in `EXECUTION_LOG.md`:

- backlog IDs worked
- commands executed
- pass/fail results
- key perf numbers vs previous baseline
- unresolved issues with explicit follow-up IDs

