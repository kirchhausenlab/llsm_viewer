# Sparse Segmentation GPU Atlas Refactor

Status: **Implemented**
Created: **2026-04-28**

This document records the sparse segmentation GPU atlas refactor. It exists because the sparse storage hard cutover was not enough: the old runtime materialized sparse segmentation bricks into a pathological monolithic 3D atlas whose Z dimension was `brickDepth * occupiedBrickCount`. That failed WebGL2 texture-dimension limits for isotropic datasets and would fail harder for larger segmentations.

The implementation goal is a robust, correct, long-term GPU architecture:

- sparse segmentation storage remains sparse
- GPU resources never use one dimension proportional to total occupied brick count
- full exact scale-0 rendering is the primary path when it fits memory
- exact batched rendering is the required path when full residency does not fit memory
- no blank fallback
- no silent scale downgrade
- no partially loaded frame presented as correct
- no dense global segmentation volume

Implemented runtime summary:

- current scale-0 sparse segmentations use a balanced packed atlas when full residency fits
- oversized or forced low-budget sparse segmentations use an exact batched render path
- exact batches reuse one batch atlas and one batch page-table/base texture set
- every batch is rendered in the same frame with fragment depth written at the segmentation hit position, so the depth buffer selects the nearest exact foreground hit before presentation
- the main sparse segmentation mesh is hidden while exact batches are replayed, so no partial or fallback segmentation frame is displayed

## Read This First

This document supersedes any earlier sparse-segmentation runtime plan that implies a single Z-stacked resident atlas is acceptable. The storage format, sparse brick codecs, sparse manifest, and provider sparse APIs are still useful. The renderer-facing atlas layout must change.

Read these files before editing:

- `docs/sparse-segmentation/README.md`
- `docs/sparse-segmentation/WEBGL2_RENDERING.md`
- `docs/sparse-segmentation/WEBGL2_DATA_LAYOUT.md`
- `src/core/volumeProvider.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidencyPacking.ts`
- `src/shaders/volumeRenderShader.ts`
- `tests/gpuBrickResidencyPacking.test.ts`

## Current Failure

The dataset that exposed the bug:

```text
/home/jidacf/Dropbox/Shared/viewer_data/for_paper/aws/ap2_iso.zarr
```

It is sparse on disk and correct as data. The failure is GPU resource layout.

Current scale-0 sparse segmentation atlas sizes:

```text
ap2_reg.zarr
  occupied bricks: 487
  current atlas:   32 x 32 x 15584
  atlas bytes:     63,832,064

ap2_iso.zarr
  occupied bricks: 765
  current atlas:   32 x 32 x 24480
  atlas bytes:     100,270,080
```

On this workstation, headed Chrome/NVIDIA reports:

```text
MAX_3D_TEXTURE_SIZE = 16384
renderer = NVIDIA GeForce RTX 3070 Ti Laptop GPU via ANGLE/OpenGL
```

Therefore:

```text
ap2_reg scale 0: 15584 <= 16384, narrowly fits
ap2_iso scale 0: 24480 > 16384, cannot upload
```

The problem is not that the segmentation is too large in bytes. The problem is that the atlas chooses an invalid shape.

## Current Code Path

Sparse segmentation is detected correctly:

- Manifest sparse layer type: `src/shared/utils/preprocessedDataset/types.ts`
- Schema sparse validation: `src/shared/utils/preprocessedDataset/schema.ts`
- Preprocessor sparse layer emission: `src/shared/utils/preprocessedDataset/preprocess.ts`

Provider path:

- `src/core/volumeProvider.ts`
- `getBrickAtlas()` routes sparse segmentation to `loadSparseSegmentationBrickAtlas()`
- `loadSparseSegmentationBrickAtlas()` decodes every occupied brick and stacks them along Z
- atlas dimensions become:

```text
width  = brickWidth
height = brickHeight
depth  = brickDepth * occupiedBrickCount
```

Resource path:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `applyBrickPageTableUniforms()` has a GPU residency/repacking path
- that path is gated by `resolvedPageTable.scaleLevel > 0`
- scale 0 therefore tries to use the invalid Z-stacked atlas directly
- `exceeds3DTextureSizeLimit()` detects invalid dimensions
- fallback uniforms disable atlas rendering, making the segmentation look empty

Relevant current lines to inspect:

- `src/core/volumeProvider.ts`: `loadSparseSegmentationBrickAtlas`
- `src/core/volumeProvider.ts`: `getSparseSegmentationBrick`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`: `shouldUseGpuResidency`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`: `exceeds3DTextureSizeLimit`
- `src/components/viewers/volume-viewer/gpuBrickResidencyPacking.ts`: `resolveFullGpuBrickResidencyLayout`
- `src/shaders/volumeRenderShader.ts`: `u_brickAtlasBase`, `u_brickAtlasSlotGrid`, `sample_segmentation_brick_atlas_voxel_bytes`

## Non-Negotiable Requirements

1. Do not show incomplete segmentation as if it were correct.
2. Do not treat missing occupied bricks as empty.
3. Do not silently load a coarser segmentation scale to avoid a resource failure.
4. Do not bind fallback empty textures when the sparse source data is valid.
5. Do not expand sparse segmentation into a dense global volume.
6. Do not make a single 3D texture dimension scale linearly with occupied brick count.
7. Do not rely on trial-and-error GPU upload failure as the resource planner.
8. Do not optimize for visible-brick streaming as the primary correctness model; many expected views have all bricks visible.
9. Do not leave legacy dense segmentation as a supported preprocessed runtime path.
10. Do not regress intensity rendering.

## Target Architecture

Segmentation rendering should use a virtual bricked volume:

```text
storage: sparse compressed bricks
CPU:     sparse directory + occupancy hierarchy + decoded brick cache
GPU:     packed physical brick texture or exact batched render targets
shader:  virtual brick coord -> physical slot -> exact label sample
```

There are exactly two valid render strategies for sparse segmentation:

```text
1. full-resident-packed
2. exact-batched
```

Both strategies render exact labels at the requested scale.

### Strategy 1: Full-Resident Packed

Use this whenever all occupied bricks for the requested scale can fit in the configured GPU budget and texture limits.

Instead of:

```text
32 x 32 x (32 * occupiedBrickCount)
```

pack bricks into a 3D slot grid:

```text
(brickWidth  * slotGridX) x
(brickHeight * slotGridY) x
(brickDepth  * slotGridZ)
```

For `ap2_iso.zarr`, a balanced full-resident layout can be:

```text
occupied bricks: 765
slot grid:       28 x 28 x 1 = 784 slots
atlas:           896 x 896 x 32
bytes:           102,760,448 with 19 padded slots
```

This keeps exact labels and fits under `MAX_3D_TEXTURE_SIZE = 16384`.

The exact layout does not have to be `28 x 28 x 1`, but it must distribute slots across X/Y/Z so no dimension exceeds limits. Avoid the current Z-only stack. Prefer a balanced layout that minimizes padding, max dimension, and extreme aspect ratio.

### Strategy 2: Exact Batched

Use this when full-resident packed mode cannot fit the configured resource budget.

Exact batched rendering means:

```text
batch 1 bricks -> render exact candidate output into offscreen state
batch 2 bricks -> combine exactly into the same offscreen state
...
present final framebuffer only after all batches complete
```

It is not partial streaming. The user must not see missing bricks appear over time.

Correct presentation rule:

```text
Never present a segmentation frame as complete until all required batches have contributed.
```

If the camera changes while batching:

- cancel or supersede the old batch plan
- keep showing the last complete frame, or a loading/progress state
- present the new complete frame only when all batches finish

## Resource Planner

Add a deterministic planner that runs before GPU upload.

Suggested module:

```text
src/components/viewers/volume-viewer/sparseSegmentationRenderPlanner.ts
```

Suggested types:

```ts
export type SparseSegmentationRenderStrategy =
  | {
      kind: 'full-resident-packed';
      slotGrid: { x: number; y: number; z: number };
      atlasSize: { width: number; height: number; depth: number };
      allocatedSlots: number;
      occupiedSlots: number;
      atlasBytes: number;
    }
  | {
      kind: 'exact-batched';
      reason: 'texture-limit' | 'memory-budget' | 'page-table-limit' | 'allocation-limit';
      batchSlotGrid: { x: number; y: number; z: number };
      batchAtlasSize: { width: number; height: number; depth: number };
      batchSlotCapacity: number;
      batchCount: number;
      estimatedBytesPerBatch: number;
    };

export type SparseSegmentationRenderBudget = {
  max3DTextureSize: number;
  maxTextureSize: number;
  maxAtlasBytes: number;
  maxSingleAllocationBytes: number;
  safetyMarginBytes: number;
};
```

Inputs:

- `VolumeBrickPageTable`
- brick size
- occupied brick count
- label bytes per voxel, currently `4`
- WebGL caps:
  - `MAX_3D_TEXTURE_SIZE`
  - `MAX_TEXTURE_SIZE`
  - any practical app-defined max allocation
- configured segmentation GPU memory budget
- render mode:
  - 3D full volume
  - slice

Planner output:

```text
full-resident-packed if it fits all hard limits
exact-batched if not
hard error only if neither exact path can be implemented under WebGL2 limits
```

Hard limits:

```text
atlasWidth  <= MAX_3D_TEXTURE_SIZE
atlasHeight <= MAX_3D_TEXTURE_SIZE
atlasDepth  <= MAX_3D_TEXTURE_SIZE
page table textures fit WebGL2 limits
single allocation is below configured max
total full-resident bytes are below configured budget
```

Do not use:

```text
try to upload -> catch failure -> render fallback
```

Use:

```text
plan -> allocate valid resources -> present only when complete
```

## Packed Slot Grid Selection

Implement a reusable layout function. It should replace Z-only stacking as the canonical segmentation atlas layout.

Inputs:

```text
slotCount
brickWidth
brickHeight
brickDepth
max3DTextureSize
preferBalanced = true
```

Output:

```text
slotGridX
slotGridY
slotGridZ
atlasWidth
atlasHeight
atlasDepth
allocatedSlotCapacity
```

Algorithm requirements:

- all atlas dimensions must fit `max3DTextureSize`
- allocated slots must be at least requested slots
- padding should be minimized
- extreme aspect ratios should be avoided when possible
- layout should be deterministic
- unit tests must cover edge cases

Reasonable search:

```text
maxSlotsX = floor(max3DTextureSize / brickWidth)
maxSlotsY = floor(max3DTextureSize / brickHeight)
maxSlotsZ = floor(max3DTextureSize / brickDepth)

Search candidate slotGridZ from 1..maxSlotsZ.
For each Z, choose X/Y near sqrt(ceil(slotCount / Z)).
Clamp to maxSlotsX/maxSlotsY.
Keep candidates with capacity >= slotCount.
Score by:
  padding slots
  max atlas dimension
  aspect ratio
  atlas surface area
Choose lowest score.
```

For current datasets this should choose a compact one-slab or few-slab layout, not a line.

## Provider Refactor

The provider currently exposes useful sparse brick APIs, but `getBrickAtlas()` still materializes the wrong renderer-facing object for sparse segmentation.

Target provider responsibilities:

- load sparse directory
- load occupancy hierarchy
- decode individual sparse bricks
- batch decode sparse bricks
- expose stable source indices from the page table
- never require sparse segmentation to become one monolithic Z-stacked atlas

Required additions:

```ts
getSparseSegmentationBrickBySourceIndex(
  layerKey: string,
  timepoint: number,
  scaleLevel: number,
  sourceIndex: number,
  options?: { signal?: AbortSignal | null }
): Promise<DecodedSparseSegmentationBrick>;

getSparseSegmentationBricksBySourceIndex(
  layerKey: string,
  timepoint: number,
  scaleLevel: number,
  sourceIndices: readonly number[],
  options?: { signal?: AbortSignal | null; concurrency?: number }
): Promise<DecodedSparseSegmentationBrick[]>;
```

Alternative: expose directory records by source index plus a batch payload reader. The important point is that the renderer worker can request exactly the bricks it needs without first building a huge linear atlas.

Temporary migration rule:

- `getBrickAtlas()` may remain for intensity.
- For sparse segmentation, `getBrickAtlas()` should be removed or changed to return a planner/brick source object, not a Z-stacked atlas.
- If kept temporarily, it must not be used by the segmentation renderer.

## Full-Resident Packed Implementation

This is the first implementation milestone because it fixes current datasets and matches the user's expected usage where all bricks are usually visible.

Required behavior:

1. Build sparse page table for the requested scale.
2. Run the resource planner.
3. If planner returns `full-resident-packed`, decode all occupied bricks.
4. Pack directly into the final balanced slot-grid atlas.
5. Build atlas index/base textures for virtual brick -> physical slot lookup.
6. Upload textures.
7. Mark the segmentation resource complete.
8. Present the frame.

Important: do not pack by first constructing the old `32 x 32 x (32 * occupied)` linear atlas. That doubles memory and preserves the bad abstraction.

Packing output:

```text
atlasData: Uint8Array RGBA label bytes
atlasSize: { width, height, depth }
slotGrid: { x, y, z }
atlasIndices: virtual brick grid -> physical slot + 1, 0 for empty
atlasBase: virtual brick grid -> base texel xyz + valid flag
```

Existing reusable pieces:

- `src/components/viewers/volume-viewer/gpuBrickResidencyPacking.ts`
- `buildFullGpuBrickResidencyAtlas()`
- `resolveFullGpuBrickResidencyLayout()`
- `src/workers/gpuBrickResidencyPack.worker.ts`
- `src/workers/gpuBrickResidencyPackMessages.ts`
- `buildBrickAtlasBaseTextureData()` in `useVolumeResources.ts`
- shader sampling through `u_brickAtlasBase`

Required changes:

- remove the `scaleLevel > 0` condition for sparse segmentation full-resident packing
- split "incremental residency" from "full-resident packed segmentation"
- do not use old atlas dimensions to decide whether sparse segmentation can render
- ensure `u_segmentationBrickAtlasData` is bound to the packed texture for segmentation
- ensure `u_brickAtlasSlotGrid` and `u_brickAtlasBase` describe the packed layout
- set all sparse segmentation textures to nearest filtering and `NoColorSpace`

## Exact Batched Renderer

This is required for larger volumes whose full-resident packed atlas exceeds the configured memory budget.

It is not a fallback in quality. It is a memory-bounded exact rendering path.

### Batched 3D Segmentation

Current segmentation 3D rendering behaves like surface extraction over label occupancy: find the foreground hit along the ray, resolve exact label bytes, shade/color that label.

For exact batching, each batch renders a subset of occupied bricks into an offscreen candidate buffer. The final composite must select the nearest valid foreground hit for each pixel across all batches.

Recommended offscreen buffers:

```text
candidateLabelBytes: RGBA8 or two RGBA8 attachments if needed
candidateDepthOrT:  R32F equivalent if available, otherwise RGBA packed float/depth
candidateNormal:    optional if final shading cannot be recomputed
validMask:          optional, can be encoded in depth sentinel
```

Per batch:

1. Upload batch bricks into a physical pool.
2. Render the segmentation shader restricted to that batch page table.
3. Produce candidate hit label and hit distance per pixel.
4. Run a full-screen reduction pass:
   - if batch candidate is valid and closer than accumulated candidate, replace accumulated candidate
   - otherwise keep accumulated candidate

After the last batch:

1. Shade/color the accumulated exact label result.
2. Present the completed framebuffer.

This avoids requiring all bricks simultaneously while preserving exact "nearest foreground hit" semantics.

If a render style is order-dependent alpha compositing rather than nearest-hit segmentation, batches must be rendered in deterministic front-to-back or back-to-front order with correct accumulated transmittance. If that style is not product-supported for segmentation, remove it from segmentation UI and tests instead of pretending it works.

### Batched Slice Rendering

Slice is simpler:

1. Determine bricks intersecting the slice.
2. If they fit full-resident, use normal packed path.
3. If not, decode/render intersecting bricks in batches into a slice framebuffer or CPU slice buffer.
4. Present only the complete slice.

For axis-aligned slices, CPU sparse extraction may be fastest and simplest. It is exact as long as it only decodes intersecting sparse bricks and does not scan a full dense volume.

### Presentation Contract

Batched mode must use an explicit generation token:

```text
renderRequestId
layerKey
timepoint
scaleLevel
camera/projection state hash
renderStyle
batchPlanHash
```

Only present a result if the completed token still matches the current requested view. If not, discard it.

During batching:

- keep the previous complete frame if it exists
- otherwise show a loading state
- never show partial batches as the live segmentation

## Page Table Scalability

The current shader uses 3D page/index textures keyed by virtual brick grid. That is acceptable for current grid sizes but may fail for huge virtual brick grids.

Long-term final state must support a page table whose texture dimensions do not exceed WebGL2 limits.

Acceptable designs:

1. Packed 2D page table:
   - flatten virtual brick index to 1D
   - store in a 2D RGBA/float texture
   - shader computes 2D texel coords

2. Two-level page table:
   - coarse block texture maps to page-table pages
   - page-table pages store brick slots for occupied regions only
   - better for very large mostly empty brick grids

3. Hashed page table:
   - only if deterministic collision handling is implemented and tested
   - more complex in GLSL, avoid unless needed

The final robust implementation should at minimum support packed 2D page tables. Do not rely on `gridX`, `gridY`, or `gridZ` all fitting `MAX_3D_TEXTURE_SIZE` for future datasets.

## Correctness Invariants

These invariants must be tested:

- label `0` is transparent
- all nonzero labels preserve exact `uint32` identity
- labels above `65535` render and hover correctly
- nearest sampling only for labels
- no linear interpolation of label IDs
- edge brick padding samples as label `0`
- virtual brick coordinates map to the correct physical slot
- missing occupied bricks are represented as incomplete, never empty
- full-resident mode has zero missing occupied bricks
- batched mode presents only after every batch completes
- camera changes invalidate pending batched results
- scale selection never silently changes to avoid resource limits
- old dense segmentation manifests are rejected
- intensity channels still render through the existing dense path

## Dense Segmentation Cleanup

Once full-resident packed sparse segmentation and exact batched rendering are in place, delete or isolate the old dense segmentation runtime path.

Candidate cleanup targets:

- `SegmentationVolume` in `src/core/volumeProcessing.ts`
- `canonicalizeSegmentationVolume()` if only used by legacy dense runtime
- `loadVolume()` segmentation branch in `src/core/volumeProvider.ts`
- dense `u_segmentationLabels` upload path in `useVolumeResources.ts`
- CPU hover paths that sample `volume.labels`
- rendering utilities that sample dense segmentation labels

Do not delete:

- sparse brick codec `dense-local-v1`; it is a per-brick sparse payload codec, not dense dataset storage
- editable segmentation dense working arrays unless editable segmentation is also migrated to a sparse delta source
- export/materialization helpers unless replaced with sparse traversal equivalents

Cleanup rule:

```text
preprocessed segmentation must not be representable as a dense global runtime volume
```

## Implementation Phases

### Phase 1: Planner And Layout Tests

Add the planner module and balanced slot-grid layout. Tests must cover:

- `ap2_iso` style case: 765 bricks, 32-cubed, max 16384 -> full-resident packed fits
- current failure shape never selected: no `32 x 32 x 24480`
- low max texture size triggers exact-batched
- memory budget trigger
- padding minimization
- deterministic output

Suggested tests:

```text
tests/sparseSegmentationRenderPlanner.test.ts
tests/gpuBrickResidencyPacking.test.ts
```

### Phase 2: Provider Brick Batch API

Add source-index based sparse brick loading. Keep existing coordinate API for hover/query.

Tests:

- source index maps to the same brick as page-table `brickAtlasIndices`
- batch API preserves order
- abort works
- cache reuse works
- missing/empty source indices fail clearly

### Phase 3: Full-Resident Packed Sparse Segmentation

Wire the planner into `useRouteLayerVolumes.ts` / `useVolumeResources.ts`.

Required behavior:

- scale 0 sparse segmentation uses packed full residency when it fits
- no `scaleLevel > 0` restriction for sparse segmentation
- no monolithic atlas upload for sparse segmentation
- no fallback empty bind for valid sparse source
- initial viewer launch waits for complete packed resources

Tests:

- unit test packed bytes map to exact labels
- Playwright/WebGL test with synthetic over-limit Z-stack but valid packed layout
- e2e launch test for `ap2_iso.zarr` if environment data access permits

### Phase 4: Exact Batched Rendering

Implement batched exact rendering for segmentation 3D and slice.

Tests:

- force tiny budget so batching is required
- output equals full-resident packed output for a small synthetic dataset
- camera changes cancel stale batch result
- no partial batches are presented
- no missing bricks are treated as empty

### Phase 5: Page Table Scalability

Move sparse segmentation page table/base texture to a limit-safe representation, preferably packed 2D.

Tests:

- virtual brick grid dimension exceeding `MAX_3D_TEXTURE_SIZE` still plans/render if occupied data fits batch mode
- shader lookup matches CPU lookup for randomized brick coords

### Phase 6: Dense Path Deletion

Delete or make unreachable legacy dense segmentation runtime code.

Tests:

- schema rejects legacy dense segmentation
- `getVolume()` throws for segmentation
- no preprocessed segmentation call site expects `SegmentationVolume`
- hover/export/slice use sparse APIs

## Files Most Likely To Change

Provider:

- `src/core/volumeProvider.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/*`

Renderer resources:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidencyPacking.ts`
- `src/workers/gpuBrickResidencyPack.worker.ts`
- `src/workers/gpuBrickResidencyPackMessages.ts`

Shader:

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts` if slice path remains shader-backed

Loading and policy:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/residencyPolicy.ts`
- `src/ui/app/volume-loading/lodPolicyController.ts` only if scale readiness semantics need adjustment

Hover/export:

- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/shared/utils/channelExport.ts`

Tests:

- `tests/gpuBrickResidencyPacking.test.ts`
- add `tests/sparseSegmentationRenderPlanner.test.ts`
- add e2e or synthetic Playwright tests under `tests/e2e/`

Docs:

- `docs/sparse-segmentation/WEBGL2_DATA_LAYOUT.md`
- `docs/sparse-segmentation/WEBGL2_RENDERING.md`
- `docs/sparse-segmentation/TEST_PLAN.md`
- `docs/sparse-segmentation/EXECUTION_LOG.md`
- `docs/sparse-segmentation/SESSION_HANDOFF.md`

## Diagnostics

Expose enough diagnostics to prove the planner made the right decision.

Per layer:

```text
sparseSegmentationStrategy
scaleLevel
occupiedBrickCount
requiredBrickCount
residentBrickCount
missingOccupiedBrickCount
slotGrid
atlasSize
atlasBytes
max3DTextureSize
budgetBytes
batchCount
currentBatchIndex
presentationState: loading | complete | stale | error
```

The diagnostics must make it obvious when:

- full-resident packed is used
- exact batched is used
- a resource is waiting for completion
- a frame is stale and intentionally not presented
- a hard WebGL2 resource limit is reached

## Acceptance Criteria

The refactor is complete only when all of these are true:

1. `ap2_iso.zarr` segmentation renders at scale 0 in normal mode.
2. `ap2_reg.zarr` segmentation still renders at scale 0 in normal mode.
3. The renderer never attempts to upload `32 x 32 x 24480` for `ap2_iso`.
4. The planner reports a packed layout that fits `MAX_3D_TEXTURE_SIZE`.
5. Forced tiny budget triggers exact batched rendering.
6. Batched output matches full-resident output on synthetic fixtures.
7. No incomplete segmentation frame is presented as complete.
8. No silent coarser-scale substitution occurs for segmentation resource failures.
9. Dense legacy segmentation manifests still fail schema validation.
10. Dense preprocessed segmentation runtime code is deleted or proven unreachable.
11. Intensity channels still pass existing tests.
12. Hover returns exact labels for sparse segmentation.
13. Slice mode returns exact labels for sparse segmentation.
14. Labels above `65535` render, hover, and export correctly.
15. Documentation and diagnostics describe which strategy was selected and why.

## Common Traps

- Treating `dense-local-v1` as dense segmentation. It is only a sparse per-brick codec.
- Letting `scaleLevel > 0` determine whether packing is allowed. Scale 0 must pack.
- Reusing the old Z-stacked atlas as the source of truth. It should be removed from sparse rendering.
- Letting missing resident bricks return label `0`. That is data corruption in the displayed frame.
- Rendering batches directly to the screen. Batches must render offscreen and present only after completion.
- Optimizing for visible-brick streaming when expected views often include all occupied bricks.
- Assuming WebGL exposes reliable free VRAM. Use explicit budgets and diagnostics.
- Depending on one giant 3D page-table dimension for future datasets.
- Keeping dense segmentation code because tests still use it. Update tests to sparse semantics.

## Suggested Fresh-Agent Prompt

Use this prompt for a new implementation agent:

```text
You are working in /home/jidacf/code/llsm_viewer.

Implement the sparse segmentation GPU atlas refactor described in
docs/sparse-segmentation/GPU_ATLAS_REFACTOR.md.

Start with Phase 1 and proceed through the phases in order. Do not introduce
fallback rendering, silent scale downgrades, or partial segmentation frames.
Sparse segmentation scale 0 must use a limit-safe packed slot-grid atlas when
full residency fits the configured budget. When it does not fit, implement exact
batched rendering that presents only complete frames.

Use ap2_iso.zarr and ap2_reg.zarr as the motivating datasets:
- ap2_iso scale 0 has 765 occupied 32-cubed bricks and must not upload a
  32 x 32 x 24480 texture.
- ap2_reg scale 0 has 487 occupied 32-cubed bricks and must continue to render.

Keep intensity rendering working. Preserve sparse storage. Remove or make
unreachable legacy dense preprocessed segmentation runtime paths after the new
sparse render paths are complete.
```
