# Migration Map

This document gives a file-by-file implementation order.

The order is designed to make the hard cutover reviewable while avoiding long-lived fallback paths.

## Rule for all phases

Do not add a dense segmentation fallback.

Temporary compile-time scaffolding is acceptable only if:

- it is not reachable in production behavior
- it is removed before the phase is marked complete
- tests prove legacy dense segmentation fails

## Phase 1: Schema and manifest

Primary files:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/manifest.ts`
- `src/hooks/preprocessedExperiment/usePreprocessedImport.ts`
- `tests/preprocessedSchemaValidation.test.ts`
- `tests/fixtures/preprocessed-schema/`

Changes:

- add sparse segmentation format identifier
- add layer kind union
- add sparse segmentation manifest types
- normalize old intensity-only layers to intensity
- reject legacy dense segmentation layers
- reject sparse segmentation under old root formats
- update summaries to expose segmentation metadata without dense volume assumptions

Test fixtures to add:

- valid sparse segmentation manifest
- invalid legacy dense segmentation manifest
- invalid segmentation with both `zarr` and `sparse`
- invalid segmentation with `uint16` label data type
- valid old/current intensity-only manifest

## Phase 2: Sparse binary/storage utilities

New folder:

- `src/shared/utils/preprocessedDataset/sparseSegmentation/`

New files:

- `types.ts`
- `binaryLayout.ts`
- `brickCoordinates.ts`
- `brickDirectory.ts`
- `payloadShard.ts`
- `codecs.ts`
- `labelMetadata.ts`
- `occupancyHierarchy.ts`
- `sliceExtraction.ts`
- `downsample.ts`
- `index.ts`

Tests:

- `tests/sparseSegmentationBinaryLayout.test.ts`
- `tests/sparseSegmentationCodecs.test.ts`
- `tests/sparseSegmentationDownsample.test.ts`
- `tests/sparseSegmentationSliceExtraction.test.ts`

Changes:

- implement exact layouts from `BINARY_LAYOUT.md`
- implement exact algorithms from `SPARSE_ALGORITHMS.md`
- keep these modules independent from React and Three.js

## Phase 3: Preprocessing integration

Primary files:

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/preprocessScalePyramidWorker.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/core/volumeProcessing.ts`
- `tests/preprocessPipeline.test.ts`
- `tests/preprocessedDataset.test.ts`

Changes:

- remove dense segmentation zarr writing
- route segmentation layers to sparse preprocessing
- keep intensity layers on dense preprocessing
- replace silent segmentation rounding with strict label validation
- write sparse label metadata
- write sparse scale directories, payload shards, and occupancy hierarchy
- generate sparse categorical multiscale pyramid

Cleanup:

- `canonicalizeSegmentationVolume` should no longer be part of production preprocessing
- dense `SegmentationVolume` may remain only as a test helper until viewer/provider phases remove it

## Phase 4: Provider split

Primary files:

- `src/core/volumeProvider.ts`
- `src/core/volumeProcessing.ts`
- `src/types/layers.ts`
- `src/ui/app/volume-loading/types.ts`
- `src/ui/app/volume-loading/policy.ts`
- `src/ui/app/volume-loading/residencyPolicy.ts`
- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
- `tests/app/hooks/useRouteLayerVolumes.test.ts`
- `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
- `tests/volumeProviderCancellation.test.ts`

New files:

- `src/core/sparseSegmentationProvider.ts`
- `src/core/sparseSegmentationTypes.ts`

Changes:

- keep `getVolume` intensity-only
- add sparse segmentation provider methods
- update route loading state to store intensity volumes and sparse segmentation fields separately
- update playback prefetch to prefetch sparse indexes and required sparse bricks
- preserve abort/cancellation semantics

Required provider signatures are documented in `IMPLEMENTATION_SPEC.md`. Do not diverge from them without updating that spec and the affected tests in the same change.

## Phase 5: Viewer contracts

Primary files:

- `src/ui/contracts/viewerLayer.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/ViewerShell.tsx`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/layerRenderSource.ts`
- `src/ui/app/hooks/useLayerControls.ts`
- `tests/layerRenderSource.test.ts`
- `tests/useLayerControls.test.ts`

Changes:

- viewer layer contract must support sparse segmentation field references
- remove `NormalizedVolume` as the only loaded-layer data shape
- preserve desktop and VR segmentation controls
- expose sparse readiness state to UI

## Phase 6: WebGL2 resource packing

Primary files:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `tests/useVolumeResources.test.ts`
- `tests/gpuBrickResidencyPacking.test.ts`

New files:

- `src/components/viewers/volume-viewer/sparseSegmentationResources.ts`
- `src/components/viewers/volume-viewer/sparseSegmentationPacking.ts`

Changes:

- pack page table texture using `WEBGL2_DATA_LAYOUT.md`
- pack resident label atlas
- pack local sub-brick occupancy
- pack global occupancy hierarchy
- track sparse readiness and missing occupied bricks
- delete dense full-volume segmentation label texture upload

## Phase 7: Shaders

Primary files:

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- `tests/volumeRenderShaderAtlasPlan.test.ts`
- `tests/sliceRenderShader.test.ts`
- visual/e2e viewer tests as needed

New file:

- `src/shaders/sparseSegmentationShader.ts`

Changes:

- replace dense segmentation sampling helpers
- add page table decoding
- add sparse global brick DDA
- add resident local brick traversal
- add packed `uint32` label handling
- add hash-based label color
- preserve hover highlighting

Do not alter intensity render styles beyond necessary shared utility changes.

## Phase 8: Slice and hover

Primary files:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts`
- `tests/volumeHoverSampling.test.ts`
- `tests/volumeHoverTargetLayer.test.ts`
- `tests/useVolumeViewerInteractions.test.ts`

Changes:

- route segmentation slice rendering to sparse slice extraction
- remove dense segmentation slice code
- route segmentation hover to sparse query
- ensure hover label supports `uint32`
- ensure missing occupied payloads are errors/loading states, not background

## Phase 9: UI, VR, paintbrush, measurements

Primary files:

- `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
- `src/components/viewers/volume-viewer/vr/hudRenderersChannelsLayerSections.ts`
- `src/components/viewers/viewer-shell/hooks/useViewerPaintbrushIntegration.ts`
- `src/hooks/paintbrush/usePaintbrush.ts`
- `src/shared/utils/roiMeasurements.ts`
- `src/components/viewers/BrightnessContrastHistogram.tsx`
- `src/autoContrast.ts`

Changes:

- preserve segmentation `3D` and `Slice` controls
- keep invert disabled
- keep histograms absent
- prevent intensity-only utilities from accepting sparse segmentation fields
- ensure paintbrush uses only global dimensions from sparse segmentation if it uses segmentation as spatial reference
- keep ROI scalar measurements intensity-only

## Phase 10: Test and benchmark cleanup

Primary files:

- `tests/useVolumeResources.test.ts`
- `tests/preprocessedDataset.test.ts`
- `tests/preprocessPipeline.test.ts`
- `tests/volumeHoverSampling.test.ts`
- `tests/perf/nextgenVolumeRuntimeStress.test.ts`
- `tests/perf/realDatasetBenchmarkHarness.ts`
- `scripts/benchmark-nextgen-volume.ts`
- `scripts/benchmark-real-datasets.ts`

Changes:

- remove tests expecting provider to return dense segmentation volumes
- add sparse segmentation benchmarks
- add legacy dense segmentation rejection tests
- update visual tests for sparse segmentation

## Phase 11: Final deletion pass

Searches that should produce no production dense segmentation hits:

```text
rg "SegmentationVolume|labels: Uint16Array|u_segmentationLabels|packSegmentationLabelTextureData|sample_segmentation_full_volume_label" src
```

Allowed remaining references:

- docs
- tests that explicitly verify legacy rejection
- small dense reference builders inside sparse correctness tests

Final checks:

- `npm run check:architecture`
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run test`
- `npm run test:frontend`
- `npm run test:visual`
- `npm run build`
- relevant e2e/perf commands from `TEST_PLAN.md`
