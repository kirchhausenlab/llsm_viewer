# Legacy Dense Segmentation Runtime Cleanup

Status: **Complete**
Created: **2026-04-28**
Completed: **2026-04-28**

This document is the execution handoff for deleting or isolating the remaining legacy dense preprocessed segmentation runtime code after the sparse segmentation hard cutover and GPU atlas refactor.

The GPU atlas refactor is complete. Sparse segmentation is now represented on disk as sparse bricks and rendered through packed full-resident atlases or exact batched WebGL2 rendering. The remaining work is cleanup: preprocessed segmentation must no longer be representable in runtime code as one dense global label volume.

Implementation result: cleanup completed on 2026-04-28. Runtime `NormalizedVolume` is intensity-only, `provider.getVolume()` rejects segmentation, dense `volume.labels` CPU and GPU paths were removed, regular segmentation export materializes only from sparse traversal, and the dense segmentation shader uniform was deleted.

## Goal

Remove runtime support for legacy dense preprocessed segmentation while preserving:

- dense intensity volumes
- sparse segmentation preprocessing, storage, provider APIs, slice extraction, hover, and rendering
- sparse segmentation per-brick codecs, including `dense-local-v1`
- editable segmentation data structures unless a separate migration explicitly replaces them
- explicit UI metadata that says a layer is segmentation

After this cleanup, the only valid preprocessed segmentation path is:

```text
sparse manifest -> sparse provider APIs -> sparse page table / atlas / exact batches -> sparse sampling/rendering
```

The invalid path is:

```text
preprocessed segmentation -> getVolume() -> NormalizedVolume kind "segmentation" -> volume.labels -> dense texture/sampling
```

## Definitions

Legacy dense preprocessed segmentation means any runtime path that treats a preprocessed segmentation layer as:

- a dense global `Uint16Array` label volume
- `NormalizedVolume` with `kind: 'segmentation'`
- a dense label texture uploaded from `volume.labels`
- CPU slice or hover sampling from `volume.labels`
- dense Zarr segmentation accepted from a manifest

This does **not** mean:

- `dense-local-v1` sparse brick codec. That is a dense payload for one occupied brick, not dense global storage.
- raw source arrays used transiently during preprocessing before sparse brick emission.
- materialized export output. Export may create a dense TIFF payload as a user-requested output format, as long as it is built by sparse traversal.
- editable segmentation working arrays. Treat those as annotation state unless this task explicitly expands to editable segmentation migration.
- `VolumeBrickAtlas.kind === 'segmentation'`. That marks sparse segmentation atlas resources and must remain valid.

## Preconditions

Start from a clean tree containing the implemented GPU atlas refactor.

Run or confirm a recent successful baseline:

```bash
git status --short
npm run verify:fast
```

If `verify:fast` is too expensive for the baseline, run at least:

```bash
npm run typecheck
npm run typecheck:tests
node --import tsx --test tests/sparseSegmentation.test.ts tests/sparseSegmentationRenderPlanner.test.ts tests/sparseSegmentationExactBatchedRenderer.test.ts tests/useVolumeResources.test.ts tests/volumeHoverSampling.test.ts tests/volumeViewerRenderLoop.test.ts
```

## Non-Negotiable Invariants

- Legacy dense segmentation manifests still fail with the reprocessing error.
- Intensity-only legacy manifests still load.
- Sparse segmentation manifests still load.
- `provider.getVolume()` never returns a segmentation volume.
- Sparse segmentation hover and slice mode preserve exact `uint32` labels, including labels above `65535`.
- Sparse segmentation 3D rendering still supports both `full-resident-packed` and `exact-batched`.
- No code path silently treats missing occupied sparse bricks as empty.
- No code path falls back to a dense global segmentation texture.
- No code path silently changes segmentation scale to avoid resource limits.
- Intensity volume rendering, hover, slice, export, playback, and VR behavior continue to work.

## Work Phases

### Phase 1: Inventory Current Dense Runtime Hits

Use these searches to build the exact edit list before changing code:

```bash
rg -n "SegmentationVolume|canonicalizeSegmentationVolume|canonicalizeSegmentationTypedArray|isSegmentationVolume|volume\\.labels|u_segmentationLabels|packSegmentationLabelTextureData" src tests
rg -n "kind: 'segmentation'|kind === 'segmentation'|kind !== 'segmentation'" src tests
rg -n "Unsupported legacy dense segmentation|isSegmentation: true|representation: 'sparse-label-bricks-v1'" src/shared/utils/preprocessedDataset tests docs/sparse-segmentation
```

Classify every hit as one of:

- delete: legacy dense preprocessed runtime
- keep: sparse manifest/provider/atlas/resource marker
- keep: setup/UI segmentation intent
- keep: sparse preprocessing
- keep: editable segmentation
- keep: test fixture for schema rejection

Do not make broad text deletions from these searches. The word `segmentation` is valid in many sparse and UI contexts.

### Phase 2: Tighten The Runtime Type Boundary

Target files:

- `src/core/volumeProcessing.ts`
- `src/workers/preprocessScalePyramid.worker.ts`
- `tests/volumeProcessing.test.ts`

Desired end state:

- `NormalizedVolume` is intensity-only, or all dense segmentation members are moved to a preprocessing-only module that is not accepted by viewer/provider runtime APIs.
- `isSegmentationVolume()` is deleted from runtime-facing imports.
- `SegmentationVolume` is deleted from runtime-facing types.
- `canonicalizeSegmentationVolume()` and `canonicalizeSegmentationTypedArray()` are either deleted or renamed/moved to make their preprocessing-only role explicit.
- `createSegmentationColorTable()` is kept or moved if still used for sparse segmentation palette textures.
- `MAX_SEGMENTATION_LABEL_ID = 0xffff` must not remain a runtime segmentation identity limit. Sparse labels are `uint32`.

Important constraint:

The preprocessing worker may still need to read raw segmentation source data and generate label pyramids before sparse brick emission. That is not the legacy runtime path. If helper code remains for that purpose, name and locate it so it cannot be confused with viewer `NormalizedVolume` support.

### Phase 3: Remove Dense Segmentation From The Provider Runtime

Target files:

- `src/core/volumeProvider.ts`
- provider-related tests in `tests/sparseSegmentation.test.ts`, `tests/preprocessedDataset.test.ts`, and any test that calls `getVolume()` for segmentation

Desired end state:

- `getVolume()` is intensity-only.
- `getVolume()` keeps the existing hard error for sparse segmentation layers.
- `loadVolume()` does not contain a branch that reads a dense segmentation Zarr and returns `kind: 'segmentation'`.
- Dense segmentation byte-length, `uint16`, and `maxLabel` handling for preprocessed runtime are removed.
- Sparse APIs remain:
  - `getSparseSegmentationField()`
  - `getSparseSegmentationBrick()`
  - `getSparseSegmentationBrickBySourceIndex()`
  - `getSparseSegmentationBricksBySourceIndex()`
  - `querySparseSegmentationLabel()`
  - `extractSparseSegmentationSlice()`
  - `prefetchSparseSegmentationBricks()`
- `getBrickAtlas()` may continue to return `VolumeBrickAtlas` for intensity and sparse segmentation. Sparse segmentation atlas resources are not dense global volumes.

Tests must prove:

- `getVolume(segmentationLayerKey, ...)` rejects.
- `getVolume(intensityLayerKey, ...)` still returns intensity data.
- sparse page table and atlas loading still pass.

### Phase 4: Remove Dense Label Texture Binding

Target files:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `tests/useVolumeResources.test.ts`
- `tests/useVolumeViewerInteractions.test.ts`

Desired end state:

- Delete `packSegmentationLabelTextureData()` if no preprocessing-only caller needs it.
- `resolvePreparedVolumeTextureState()` handles intensity only.
- 3D resources never create a data texture from `volume.labels`.
- `u_segmentationLabels` is removed from shader uniforms if practical.
- If shader compatibility makes immediate uniform removal too noisy, bind only a fallback texture and add a test proving no non-fallback dense segmentation texture can be bound.
- Sparse segmentation continues to bind:
  - `u_segmentationBrickAtlasData`
  - brick atlas index/base/page-table textures
  - `u_brickAtlasSlotGrid`
  - sparse segmentation palette and label hashing uniforms
- Sparse segmentation textures remain nearest-filtered and `THREE.NoColorSpace`.

Tests must prove:

- sparse full-resident packed resources bind the packed atlas, not a dense label volume
- exact-batched resources render through the batch state
- no resource test can construct a valid preprocessed dense segmentation texture path

### Phase 5: Remove Dense CPU Slice And Hover Sampling

Target files:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/shared/utils/hoverSampling.ts`
- `tests/volumeHoverSampling.test.ts`

Desired end state:

- Slice preparation from `NormalizedVolume` handles intensity only.
- Sparse segmentation slices use sparse extraction or packed atlas sampling, not `volume.labels`.
- Hover over segmentation uses sparse atlas/provider sampling, not `volume.labels`.
- Shared hover helpers either become intensity-only or expose sparse-specific entry points.

Tests must prove:

- intensity hover still reports raw and normalized values
- sparse segmentation hover returns exact `uint32` labels
- sparse segmentation slice mode returns correct colors/alpha for labels above `65535`
- edge padding and empty bricks return label `0`

### Phase 6: Remove Dense Segmentation Export Fallback

Target file:

- `src/shared/utils/channelExport.ts`

Desired end state:

- Regular segmentation export materializes labels by sparse traversal only.
- The fallback that calls `provider.getVolume()` and copies `volume.labels` is deleted.
- If a regular segmentation layer is not sparse `uint32`, export throws the same reprocess-style error used by loading.
- Editable segmentation export remains unchanged unless this task explicitly includes editable migration.

Tests must prove:

- sparse segmentation export still works if currently covered
- intensity export still works
- editable segmentation export still works
- dense legacy segmentation export cannot be reached

### Phase 7: Schema And Manifest Guard Review

Target files:

- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- schema fixtures and tests

Desired end state:

- Keep explicit rejection of legacy dense segmentation manifests.
- Keep sparse manifest validation.
- Keep intensity-only legacy manifest compatibility.
- Consider tightening `isSparseSegmentationLayerManifest()` so `isSegmentation === true` alone is not treated as valid sparse segmentation outside validated manifests. Do this only if call sites are updated safely.
- Do not remove rejection fixtures. They are evidence that old dense segmentation cannot re-enter runtime.

Tests must prove:

- old dense segmentation manifests fail before binary payload reads
- sparse segmentation manifests require the sparse root format and representation
- old intensity-only manifests still validate

### Phase 8: Clean Tests And Fixtures

Remove tests that assert dense segmentation runtime behavior, then replace them with negative tests or sparse equivalents.

Likely updates:

- `tests/volumeProcessing.test.ts`: remove dense segmentation canonicalization runtime expectations; keep intensity normalization tests and palette tests if palette helper remains.
- `tests/useVolumeResources.test.ts`: remove dense segmentation volume fixtures; keep sparse atlas/exact batch fixtures.
- `tests/volumeHoverSampling.test.ts`: remove dense `volume.labels` expectations; keep sparse atlas label sampling.
- `tests/app/hooks/useRouteLayerVolumes.test.ts`: replace any dense segmentation loaded volume fixture with sparse layer state or rejection expectation.

Keep schema rejection fixtures for legacy dense segmentation.

## Expected Allowed Hits After Cleanup

After implementation, run:

```bash
rg -n "SegmentationVolume|canonicalizeSegmentationVolume|canonicalizeSegmentationTypedArray|isSegmentationVolume|volume\\.labels|packSegmentationLabelTextureData" src tests
rg -n "kind: 'segmentation'|kind === 'segmentation'|kind !== 'segmentation'" src tests
rg -n "u_segmentationLabels" src tests
```

The first command should ideally return no runtime hits. Any remaining hit must be preprocessing-only and named accordingly.

The second command may still return valid sparse/UI/editable hits, including:

- sparse manifest construction
- schema validation
- sparse atlas/resource kind checks
- editable segmentation metadata
- UI mode logic
- rejection fixtures

The third command should return no hits if the shader uniform is removed. If it remains temporarily, all hits must be fallback-only and covered by a test proving no dense label data is bound.

## Verification

Run focused tests first:

```bash
npm run typecheck
npm run typecheck:tests
node --import tsx --test tests/volumeProcessing.test.ts tests/sparseSegmentation.test.ts tests/sparseSegmentationRenderPlanner.test.ts tests/sparseSegmentationExactBatchedRenderer.test.ts tests/useVolumeResources.test.ts tests/volumeHoverSampling.test.ts tests/volumeViewerRenderLoop.test.ts
```

Then run broader verification:

```bash
npm test
npm run verify:fast
npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-3d-shader-smoke.spec.ts
git diff --check
```

Manual smoke checks:

- load an intensity-only old preprocessed dataset
- load a sparse segmentation dataset that uses `full-resident-packed`
- force a tiny sparse segmentation atlas budget and confirm `exact-batched`
- confirm runtime diagnostics do not mention a dense segmentation volume path

## Success Criteria

The cleanup is complete when:

- `NormalizedVolume` cannot represent preprocessed segmentation in viewer/provider runtime code
- `getVolume()` is intensity-only
- dense legacy segmentation manifests still fail clearly
- sparse segmentation render, slice, hover, export, and diagnostics still work
- no dense label texture can be uploaded for preprocessed segmentation
- no dense CPU `volume.labels` sampling remains in runtime
- verification commands pass

## Fresh Agent Prompt

Use this prompt for a new agent:

```text
Implement the legacy dense preprocessed segmentation runtime cleanup documented in
docs/sparse-segmentation/LEGACY_DENSE_SEGMENTATION_CLEANUP.md.

The sparse segmentation hard cutover and GPU atlas refactor are already implemented.
Your job is cleanup only: delete or isolate the remaining code that lets preprocessed
segmentation behave as a dense global runtime volume.

Hard requirements:
- Do not change the sparse on-disk format.
- Do not require reprocessing already-sparse datasets.
- Do not add any dense global segmentation fallback.
- Do not convert segmentation to meshes, surfaces, splats, point clouds, or instanced geometry.
- Keep dense intensity rendering/loading working.
- Keep sparse segmentation full-resident packed rendering working.
- Keep sparse segmentation exact-batched rendering working.
- Keep editable segmentation working unless a change is explicitly preprocessing/runtime-only and does not affect editable state.
- Keep legacy dense segmentation manifest rejection.
- Keep intensity-only legacy manifest compatibility.
- Use apply_patch for manual edits.

Before coding:
1. Read docs/sparse-segmentation/README.md.
2. Read docs/sparse-segmentation/GPU_ATLAS_REFACTOR.md.
3. Read docs/sparse-segmentation/LEGACY_DENSE_SEGMENTATION_CLEANUP.md completely.
4. Run the inventory rg commands from Phase 1.
5. Run baseline verification or record why it was not run.

Implementation order:
1. Tighten the runtime volume type boundary.
2. Remove dense segmentation from provider loading.
3. Remove dense label texture upload/binding.
4. Remove dense CPU slice and hover sampling.
5. Remove dense regular segmentation export fallback.
6. Review schema guards and update tests.
7. Run focused tests, then verify:fast and shader smoke.

Do not stop after analysis. Implement the cleanup, update tests, update docs if behavior changes,
and leave SESSION_HANDOFF.md with exact verification results and any remaining risks.
```
