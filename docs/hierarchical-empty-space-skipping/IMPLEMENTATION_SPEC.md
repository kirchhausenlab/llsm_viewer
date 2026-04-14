# Implementation Spec

This spec defines a hard-cutover implementation for hierarchical empty-space skipping.

## 1) Current-state diagnosis (why prior brick skipping artifacted)

### 1.1 Skip is enabled at runtime under the hard-cutover contract

- `u_brickSkipEnabled` is bound from validated hierarchy/page-table data in `useVolumeResources`.
- Invalid hierarchy/page-table inputs fail fast instead of silently disabling skip.
- Touchpoints:
  - `src/components/viewers/volume-viewer/useVolumeResources.ts`
  - `tests/useVolumeResources.test.ts`

### 1.2 Old skip predicate mixes emptiness with atlas residency

- Shader skip predicate currently treats `atlasIndex < -0.5` as skippable.
- Atlas indices can be missing because of residency limits, not because volume data is empty.
- Touchpoint:
  - `src/shaders/volumeRenderShader.ts` (`should_skip_with_brick_stats_values`)

### 1.3 Residency remapping creates non-empty bricks with atlas index 0

- GPU residency remaps source bricks into resident slots.
- Non-resident occupied bricks become `0` in resident atlas-index texture.
- Old skip model interpreted this as empty/missing and skipped incorrectly.
- Touchpoints:
  - `src/components/viewers/volume-viewer/useVolumeResources.ts` (`updateGpuBrickResidency`)
  - `src/components/viewers/volume-viewer/useVolumeResources.ts` (`analyzeBrickSkipDiagnostics`)

### 1.4 Current metadata is leaf-only and per-step

- Preprocessing writes only leaf-level chunk stats (`min`, `max`, `occupancy`).
- Shader tests skip per sample step, which is high-ALU and low skip-distance efficiency.
- Touchpoints:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/core/volumeProvider.ts` (`loadBrickPageTable`)

## 2) Target architecture

### 2.1 End-to-end data flow

1. Preprocess emits a multi-level skip hierarchy per `(layer, scale, timepoint)`.
2. Provider loads hierarchy metadata with page table.
3. Viewer uploads hierarchy into GPU textures + level metadata uniforms.
4. Shader performs hierarchical node traversal and ray-distance jumps.
5. Render-style loops (`MIP`, `ISO`, `BL`) share one traversal core and mode-specific predicates.

### 2.2 Hard-cutover contract

- No legacy format support.
- No no-skip fallback mode.
- Invalid hierarchy metadata throws and fails fast.

## 3) Data contract changes (schema + types)

### 3.1 New format and storage identifiers

- Update format id constant in `src/shared/utils/preprocessedDataset/types.ts`:
  - from `llsm-viewer-preprocessed-vnext`
  - to `llsm-viewer-preprocessed-vnext-hes1`
- Update storage root dir in `src/shared/storage/preprocessedStorage.ts` to the same lineage.
- Update generated dataset naming paths where format lineage is embedded.

### 3.2 Replace leaf-only chunk stats with explicit skip hierarchy

Current scale contract:

- `zarr.data`
- `zarr.chunkStats.{min,max,occupancy}`
- `zarr.histogram`
- `zarr.labels?`

Target scale contract:

- `zarr.data`
- `zarr.skipHierarchy.levels[]`
- `zarr.histogram`
- `zarr.labels?`

Recommended types:

- `PreprocessedScaleSkipHierarchyLevelZarrDescriptor`
- `PreprocessedScaleSkipHierarchyZarrDescriptor`

Each hierarchy level entry includes:

- `level` (0 = leaf brick grid, increasing toward coarser root)
- `gridShape` (`[z, y, x]`)
- `occupancy` descriptor (`uint8`, shape `[t, z, y, x]`)
- `min` descriptor (`uint8`, shape `[t, z, y, x]`)
- `max` descriptor (`uint8`, shape `[t, z, y, x]`)

Schema invariants:

1. `levels[0].gridShape` equals leaf chunk grid.
2. `levels` are contiguous and strictly increasing.
3. `levels[n+1].gridShape = ceil(levels[n].gridShape / 2)` per axis.
4. Top level has shape `[1,1,1]`.
5. All descriptor chunk shapes and ranks are validated strictly.

## 4) Preprocessing algorithm

### 4.1 Descriptor generation

Touchpoint:

- `src/shared/utils/preprocessedDataset/preprocess.ts` (`buildLayerScaleDescriptors`)

Add skip hierarchy descriptor generation for every scale:

1. Compute leaf grid from data chunk shape.
2. Generate parent grids by repeated `ceil(child / 2)`.
3. Emit descriptors for `occupancy/min/max` at every level.

### 4.2 Timepoint write path

Touchpoints:

- `src/shared/utils/preprocessedDataset/preprocess.ts` (single-thread and workerized write paths)

For each timepoint and scale:

1. Build leaf arrays while writing data chunks (already available as chunk stats).
2. Build parent levels from child arrays using fixed 2x2x2 reduction.
3. Write all levels to storage.

Parent reduction rules (critical correctness):

- `parentOccupancy = max(childOccupancy)` over valid children.
- If `parentOccupancy == 0`:
  - `parentMin = 0`
  - `parentMax = 0`
- If `parentOccupancy > 0`:
  - `parentMin = min(childMin where childOccupancy > 0)`
  - `parentMax = max(childMax where childOccupancy > 0)`
- Enforce invariant: occupied node must satisfy `parentMin <= parentMax`.

### 4.3 Manifest/schema updates

Touchpoints:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `tests/fixtures/preprocessed-schema/*.json`
- `tests/preprocessedSchemaValidation.test.ts`

## 5) Runtime provider changes

### 5.1 Page table model extension

Touchpoint:

- `src/core/volumeProvider.ts`

Extend `VolumeBrickPageTable` with hierarchy payload, e.g.:

- `skipHierarchy.levels[]` with typed arrays for occupancy/min/max and per-level grid shape.

Important:

- Leaf `chunkMin/chunkMax/chunkOccupancy` should be sourced from hierarchy level 0.
- `brickAtlasIndices` generation should still use leaf occupancy (`>0`).

### 5.2 Loading path

Touchpoint:

- `src/core/volumeProvider.ts` (`loadBrickPageTable`)

Implementation contract:

1. Read all hierarchy level arrays for target `(layer, scale, timepoint)`.
2. Validate array lengths against declared grid shapes.
3. Throw on any mismatch.
4. Populate page table + hierarchy in one consistent object.

## 6) Viewer resource/uniform binding changes

### 6.1 Resource model updates

Touchpoints:

- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

Add resource fields for hierarchy textures and metadata versioning.

### 6.2 Uniform contract updates

Touchpoint:

- `src/shaders/volumeRenderShader.ts` (uniform declarations)

Replace leaf-only skip bindings with hierarchy-aware uniforms:

- `u_skipHierarchyData` (`sampler3D` packed occupancy/min/max)
- `u_skipHierarchyLevelCount`
- `u_skipHierarchyLevelGrid[MAX_SKIP_LEVELS]` (ivec3/vec3)
- `u_skipHierarchyLevelZBase[MAX_SKIP_LEVELS]`
- keep existing atlas uniforms for data sampling, but remove atlas residency from skip predicate.

### 6.3 Diagnostics contract

Touchpoints:

- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

Replace old reasons tied to atlas residency with hierarchy-health reasons:

- `invalid-hierarchy-shape`
- `invalid-hierarchy-range`
- `invalid-hierarchy-level-order`
- `hierarchy-ready`

Remove `occupied-bricks-missing-from-atlas` as a skip gating reason.

## 7) Shader traversal design

### 7.1 Core traversal

Touchpoint:

- `src/shaders/volumeRenderShader.ts`

Implement hierarchical skip traversal with ray-distance jumps:

1. Compute ray entry/exit as today.
2. Maintain current ray distance `rayT` and location `loc`.
3. At each iteration:
   - evaluate coarsest relevant hierarchy node containing `loc`
   - if node is skippable for current mode state, jump `rayT` to node exit + epsilon
   - otherwise descend until leaf and sample normally
4. Guarantee forward progress via minimum jump epsilon.

### 7.2 Mode-specific skip predicates

- `MIP`:
  - skip if node unoccupied
  - skip if node candidate max <= current MIP max
- `ISO`:
  - skip if node unoccupied
  - skip if node candidate max <= low iso threshold
- `BL`:
  - skip if node unoccupied
  - skip if node candidate max <= background cutoff threshold

`invert` handling:

- candidate bound for skip uses `nodeMin` when inverted, `nodeMax` otherwise.

### 7.3 MIP/ISO refinement stability

Current implementation uses fixed step index (`max_i`) for refinement windows.

Required update:

- track best-hit ray distance directly.
- run refinement around best-hit distance, not loop index.

### 7.4 BL crosshair/event stability with variable skip jumps

Current BL axis events rely on fixed-step `iter/safeSteps` progression.

Required update:

- switch event gating to ray-distance fraction (`rayT / totalRayDistance`) so events remain correct when jumps skip multiple base steps.

## 8) Why this implementation avoids previous artifact classes

1. Skip no longer depends on atlas residency index presence.
2. Hierarchy is built from source data during preprocessing, not transient residency state.
3. Skip predicates are monotonic bound checks (`occupancy`, `min/max`) with strict preprocessing/runtime invariants.
4. Traversal jumps use geometric node boundaries, reducing per-step branch noise and avoiding false-skip holes from residency remaps.

## 9) File touchpoints (expected)

### 9.1 Schema and preprocessing

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/storage/preprocessedStorage.ts`
- `src/components/pages/FrontPageContainer.tsx`

### 9.2 Runtime provider

- `src/core/volumeProvider.ts`

### 9.3 Viewer resource binding

- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

### 9.4 Shader

- `src/shaders/volumeRenderShader.ts`

### 9.5 Tests/fixtures/perf

- `tests/preprocessedSchemaValidation.test.ts`
- `tests/preprocessedDataset.test.ts`
- `tests/preprocessedMultiscaleRuntime.test.ts`
- `tests/preprocessedBrickAtlasEdgeCases.test.ts`
- `tests/useVolumeResources.test.ts`
- `tests/volumeRenderShaderSkipModel.test.ts`
- `tests/volumeRenderShaderLodModel.test.ts`
- `tests/perf/nextgenVolumeRuntimeStress.test.ts`
- `tests/fixtures/preprocessed-schema/*.json`

## 10) Legacy code that must be removed in this program

- Legacy format id usage (`llsm-viewer-preprocessed-vnext`).
- Runtime env-config skip gate (`VITE_BRICK_SKIP_ENABLED`) as a control path.
- Atlas-index-driven skip reasoning (`atlasIndex < 0` skip semantics).
- Diagnostics branches that equate atlas residency misses with empty-space eligibility.
