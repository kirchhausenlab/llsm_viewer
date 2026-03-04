# Session Handoff

Last updated: **2026-03-03**

## Program state

- Status: **Implementation complete**
- Backlog status:
  - `DONE`: `HES-001` through `HES-070`
  - `IN_PROGRESS`: none
  - `TODO`: none
  - `BLOCKED`: none

## Delivered outcomes

1. Hard cutover schema/data contract is live:
   - format/storage lineage moved to `llsm-viewer-preprocessed-vnext-hes1`
   - `chunkStats` fully replaced with `skipHierarchy.levels[]`
2. Preprocessing emits full hierarchical occupancy/min/max for every scale.
3. Runtime provider ingests hierarchy levels and derives leaf page-table fields from level 0.
4. Viewer/shader binding now uses hierarchy uniforms and hierarchical traversal; no config gate fallback path.
5. CPU skip model, tests, fixtures, and benchmark generators migrated to hierarchy semantics.
6. Real-dataset perf harness now skips incompatible legacy-format datasets under hard cutover.

## Locked constraints (satisfied)

1. No runtime fallback path to no-skip behavior.
2. No backward compatibility with old preprocessed schema/format.
3. No Rust/WebGPU migration in this program.
4. Skip logic does not use atlas residency as an emptiness proxy.
5. User sampling mode (`linear`/`nearest`) remains user-controlled.
6. Implementation works across `MIP`, `ISO`, and `BL` traversal paths.

## Verification evidence

- `npm run typecheck`
- `npm run typecheck:tests`
- `node --import tsx --test tests/preprocessedSchemaValidation.test.ts tests/preprocessedDataset.test.ts tests/preprocessedMultiscaleRuntime.test.ts tests/preprocessedBrickAtlasEdgeCases.test.ts tests/volumeProviderCancellation.test.ts tests/useVolumeResources.test.ts tests/volumeRenderShaderSkipModel.test.ts`
- `npm test` (77/77 pass)

## Natural follow-up (optional)

1. Re-preprocess external/real datasets to `llsm-viewer-preprocessed-vnext-hes1` so perf regression cases run instead of skip.
2. Execute nightly perf matrix and refresh baseline reports if needed.
