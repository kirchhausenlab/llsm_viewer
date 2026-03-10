# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Phase 0 - Contract lock and instrumentation

- `HES-001` (`DONE`): hard-cutover format/storage identifiers.
  - Scope:
    - update `PREPROCESSED_DATASET_FORMAT`
    - update preprocessed storage root dir lineage
    - update any format-derived naming helpers
  - Evidence target:
    - `src/shared/utils/preprocessedDataset/types.ts`
    - `src/shared/storage/preprocessedStorage.ts`
    - `src/components/pages/FrontPageContainer.tsx`

- `HES-002` (`DONE`): hierarchy diagnostics payload contract.
  - Scope:
    - define hierarchy diagnostics type/reasons
    - wire into viewer resource diagnostics surface
  - Evidence target:
    - `src/components/viewers/VolumeViewer.types.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `HES-003` (`DONE`): remove runtime skip config-gate control path.
  - Scope:
    - remove `VITE_BRICK_SKIP_ENABLED` control behavior
    - ensure skip enablement is data-contract driven only
  - Evidence target:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

## Phase 1 - Schema and preprocess hierarchy emission

- `HES-010` (`DONE`): add schema/types for `skipHierarchy.levels[]`.
  - Scope:
    - add new descriptor types
    - remove/replace scale `chunkStats` contract
  - Evidence target:
    - `src/shared/utils/preprocessedDataset/types.ts`
    - `src/shared/utils/preprocessedDataset/schema.ts`

- `HES-011` (`DONE`): descriptor generation for all hierarchy levels.
  - Scope:
    - emit level descriptors with contiguous level ordering
    - enforce `[1,1,1]` root level
  - Evidence target:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `HES-012` (`DONE`): leaf + parent hierarchy construction (single write path).
  - Scope:
    - write leaf occupancy/min/max from chunk scan
    - reduce 2x2x2 parents with strict invariants
  - Evidence target:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `HES-013` (`DONE`): hierarchy construction in workerized/parallel write paths.
  - Scope:
    - ensure all preprocess paths emit identical hierarchy results
  - Evidence target:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `HES-014` (`DONE`): schema fixture migration and validation updates.
  - Scope:
    - rewrite valid/invalid fixtures to new hierarchy contract
    - keep strict schema rejection coverage
  - Evidence target:
    - `tests/fixtures/preprocessed-schema/*.json`
    - `tests/preprocessedSchemaValidation.test.ts`

## Phase 2 - Provider hierarchy ingestion

- `HES-020` (`DONE`): extend `VolumeBrickPageTable` with hierarchy payload.
  - Scope:
    - typed hierarchy levels in page-table model
  - Evidence target:
    - `src/core/volumeProvider.ts`

- `HES-021` (`DONE`): load hierarchy arrays in page-table path.
  - Scope:
    - read all levels per timepoint
    - validate lengths and level ordering
  - Evidence target:
    - `src/core/volumeProvider.ts`

- `HES-022` (`DONE`): derive leaf fields from hierarchy level 0.
  - Scope:
    - ensure `chunkMin/chunkMax/chunkOccupancy` and `brickAtlasIndices` stay coherent
  - Evidence target:
    - `src/core/volumeProvider.ts`

- `HES-023` (`DONE`): provider runtime tests for hierarchy contract.
  - Scope:
    - runtime read coverage for valid and malformed hierarchy datasets
  - Evidence target:
    - `tests/preprocessedDataset.test.ts`
    - `tests/preprocessedMultiscaleRuntime.test.ts`
    - `tests/preprocessedBrickAtlasEdgeCases.test.ts`

## Phase 3 - Viewer resource binding

- `HES-030` (`DONE`): resource model fields for hierarchy textures/metadata.
  - Scope:
    - add texture refs and diagnostics fields
  - Evidence target:
    - `src/components/viewers/VolumeViewer.types.ts`

- `HES-031` (`DONE`): build and upload hierarchy texture pack.
  - Scope:
    - pack occupancy/min/max per node into GPU texture(s)
    - maintain deterministic level offsets metadata
  - Evidence target:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `HES-032` (`DONE`): bind hierarchy uniforms to shader materials.
  - Scope:
    - new hierarchy uniforms for all style variants
    - remove old leaf-only skip uniform assumptions
  - Evidence target:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/shaders/volumeRenderShader.ts`

- `HES-033` (`DONE`): diagnostics migration away from atlas-residency skip reasons.
  - Scope:
    - remove `occupied-bricks-missing-from-atlas` as skip gating reason
  - Evidence target:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`

## Phase 4 - Shader traversal core

- `HES-040` (`DONE`): add hierarchy uniform declarations/helpers.
  - Scope:
    - node fetch helpers
    - node bounds and ray-exit helpers
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`

- `HES-041` (`DONE`): implement hierarchical traversal loop and skip jumps.
  - Scope:
    - replace per-step leaf skip checks in `MIP`/`ISO`/`BL`
    - guarantee forward progress and bounds safety
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`

- `HES-042` (`DONE`): remove atlas-index skip semantics.
  - Scope:
    - no `atlasIndex < 0` skip decision path
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`

- `HES-043` (`DONE`): CPU mirror updates for skip semantics.
  - Scope:
    - update `shouldSkipWithBrickStatsCpu` (or successor) to hierarchy-compatible semantics
    - keep deterministic edge-case coverage
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderSkipModel.test.ts`

## Phase 5 - Mode-specific correctness

- `HES-050` (`DONE`): MIP best-hit/refinement stability with variable jumps.
  - Scope:
    - refine around best distance, not loop index
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`

- `HES-051` (`DONE`): ISO threshold/refinement stability with hierarchical jumps.
  - Scope:
    - preserve threshold crossing correctness
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`

- `HES-052` (`DONE`): BL accumulation + axis-event correctness with jump traversal.
  - Scope:
    - convert axis-event gating to distance-based progression
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`
    - targeted BL test additions

- `HES-053` (`DONE`): preserve nearest/linear sampling invariants.
  - Scope:
    - ensure no sampling-mode behavior rewrite
  - Evidence target:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`

## Phase 6 - Perf calibration and acceptance

- `HES-060` (`DONE`): add skip traversal diagnostics counters.
  - Scope:
    - node visits, jump count, skipped-distance ratio, sampled-step ratio
  - Evidence target:
    - `src/shaders/volumeRenderShader.ts`
    - viewer diagnostics wiring touchpoints

- `HES-061` (`DONE`): stress/perf assertions for sparse and dense scenes.
  - Scope:
    - sparse scenes show meaningful sampling reduction
    - dense scenes avoid unacceptable regressions
  - Evidence target:
    - `tests/perf/nextgenVolumeRuntimeStress.test.ts`

- `HES-062` (`DONE`): benchmark matrix execution + threshold calibration.
  - Scope:
    - run documented benchmark matrix
    - finalize accepted thresholds
  - Evidence target:
    - `docs/hierarchical-empty-space-skipping/BENCHMARK_MATRIX.md`
    - `docs/hierarchical-empty-space-skipping/EXECUTION_LOG.md`

## Phase 7 - Closure

- `HES-070` (`DONE`): final docs sync and handoff closure.
  - Scope:
    - synchronize roadmap/backlog/log/handoff
    - capture final verification evidence
  - Evidence target:
    - `docs/hierarchical-empty-space-skipping/ROADMAP.md`
    - `docs/hierarchical-empty-space-skipping/BACKLOG.md`
    - `docs/hierarchical-empty-space-skipping/SESSION_HANDOFF.md`
    - `docs/hierarchical-empty-space-skipping/EXECUTION_LOG.md`

## High-contention files (avoid parallel edits)

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- `src/core/volumeProvider.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`

