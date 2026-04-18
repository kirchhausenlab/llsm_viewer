# Audit Checklist

This checklist exists because the codebase has multiple hidden dtype couplings. A refactor of this size should not be considered complete until every section below has been explicitly reviewed.

Status legend: `UNREVIEWED`, `REVIEWED`, `UPDATED`, `VERIFIED`

## 1) Setup-page and preprocess-entry audit

- Status: `UNREVIEWED`
- Required review points:
  - `Render in 16bit` checkbox wiring from UI state into preprocess options
  - all-8-bit preprocessing guard
  - source dtype probing and caching
  - warning-window behavior and interaction-error path
  - export-while-preprocessing behavior with the new mode

Primary files:

- `src/components/pages/ExperimentConfiguration.tsx`
- `src/components/pages/FrontPage.tsx`
- `src/components/pages/FrontPageContainer.tsx`
- `src/hooks/dataset/useDatasetSetup.ts`
- `src/hooks/dataset/useChannelSources.ts`

## 2) Type-model audit

- Status: `UNREVIEWED`
- Required review points:
  - source dtype vs stored intensity dtype separation
  - `IntensityVolume.normalized` width assumptions
  - manifest summary objects exposing both dtype concepts
  - any UI code using `layer.dataType` where it should use stored dtype instead

Primary files:

- `src/core/volumeProcessing.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- `src/hooks/dataset/useDatasetSetup.ts`
- `src/ui/contracts/viewerLayer.ts`

## 3) Schema/import/export audit

- Status: `UNREVIEWED`
- Required review points:
  - `hes2` manifest write path
  - `hes1` compatibility read path
  - intensity scale descriptors allowing `uint8 | uint16`
  - stored dtype presence and validation
  - fixture coverage for both old and new formats

Primary files:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/open.ts`
- `src/shared/utils/preprocessedDataset/manifest.ts`

## 4) Preprocess normalization audit

- Status: `UNREVIEWED`
- Required review points:
  - `uint16` identity path
  - `uint16` linear min/max normalization path
  - unchanged 8-bit mode behavior
  - mixed-precision per-layer stored dtype resolution
  - representative-timepoint behavior still being intentional

Primary files:

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/core/volumeProcessing.ts`
- `src/workers/preprocessScalePyramid.worker.ts`
- `src/workers/preprocessScalePyramidMessages.ts`

## 5) Chunk-encoding and side-data audit

- Status: `UNREVIEWED`
- Required review points:
  - intensity chunk extraction for `uint8` and `uint16`
  - chunk statistics min/max width
  - playback atlas block encoding width
  - skip-hierarchy min/max width
  - occupancy remaining `uint8`
  - histogram generation width

Primary files:

- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/histogram.ts`

## 6) Subcell audit

- Status: `UNREVIEWED`
- Required review points:
  - `uint8` assumptions in subcell min/max/occupancy packing
  - subcell descriptor dtype
  - runtime shader expectations for subcell stats textures

Primary files:

- `src/shared/utils/brickSubcell.ts`
- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`

## 7) Provider and cache audit

- Status: `UNREVIEWED`
- Required review points:
  - intensity scale-load acceptance for `uint8` and `uint16`
  - page-table chunk min/max typing
  - brick-atlas typing and semantics
  - byte-aware volume-cache budgeting
  - stats/diagnostics correctness after mixed-precision support

Primary files:

- `src/core/volumeProvider.ts`
- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`

## 8) Semantic-flag audit (`uint16` must not imply segmentation)

- Status: `UNREVIEWED`
- Required review points:
  - every `dataType === 'uint16'` branch
  - every path where atlas/slice/hover assumes `uint16 => segmentation`
  - every render-preparation helper that needs an explicit semantic flag

Known high-risk spots:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/core/volumeProvider.ts`

## 9) 3D texture upload audit

- Status: `UNREVIEWED`
- Required review points:
  - texture cache output width
  - texture creation/update type (`UnsignedByteType` vs `UnsignedShortType`)
  - resource rebuild conditions
  - mixed-precision layer coexistence

Primary files:

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

## 10) Slice-path audit

- Status: `UNREVIEWED`
- Required review points:
  - direct slice CPU packing width
  - slice atlas CPU packing width
  - `DataTexture.type` selection
  - segmentation/intensity divergence using semantics rather than raw dtype

Primary files:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/sliceRenderShader.ts`

## 11) Shader audit

- Status: `UNREVIEWED`
- Required review points:
  - normalized sampling correctness for ushort textures
  - side-data texture precision handling
  - segmentation decode path unaffected
  - no hidden byte-only assumptions in shader helper comments or CPU mirror logic

Primary files:

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`

## 12) Hover audit

- Status: `UNREVIEWED`
- Required review points:
  - direct-volume hover using correct denominator
  - brick-atlas hover using semantic flags, not `uint16`
  - volume-vs-atlas behavior across projection/render modes
  - hover display formatting using source dtype and stored denominator correctly

Primary files:

- `src/shared/utils/intensityFormatting.ts`
- `src/shared/utils/hoverSampling.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`

## 13) ROI and measurements audit

- Status: `UNREVIEWED`
- Required review points:
  - voxel measurements
  - interpolated measurements
  - `ViewerShell` lazy-load path for measurement volumes
  - scale-0 assumptions staying valid

Primary files:

- `src/shared/utils/roiMeasurements.ts`
- `src/components/viewers/ViewerShell.tsx`

## 14) Histogram and auto-window audit

- Status: `UNREVIEWED`
- Required review points:
  - 256-bin histogram bucketing from `uint16`
  - auto-window thresholds and quantile behavior
  - histogram cache invalidation assumptions
  - histogram display consistency across precision modes

Primary files:

- `src/shared/utils/histogram.ts`
- `src/autoContrast.ts`
- `src/components/viewers/BrightnessContrastHistogram.tsx`
- `src/ui/app/hooks/layerDefaults.ts`

## 15) Route/prefetch/playback audit

- Status: `UNREVIEWED`
- Required review points:
  - launch path
  - playback warmup
  - atlas-vs-volume source switching
  - playback prefetch and promotion logic under larger texture/data sizes
  - orthographic force-volume mode

Primary files:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
- `src/ui/app/volume-loading/policy.ts`
- `src/components/viewers/VolumeViewer.tsx`

## 16) Legacy-dataset compatibility audit

- Status: `UNREVIEWED`
- Required review points:
  - open old `hes1` datasets
  - render old 8-bit-only datasets exactly as before
  - no new required manifest fields break import

Primary files:

- `src/shared/utils/preprocessedDataset/open.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/core/volumeProvider.ts`

## 17) End-to-end audit

- Status: `UNREVIEWED`
- Required review points:
  - front-page setup validation
  - preprocess success/failure conditions
  - mixed-precision rendering
  - hover
  - ROI measurements
  - playback
  - import/export
  - segmentation coexistence

Primary files:

- `tests/e2e/helpers/workflows.ts`
- `tests/e2e/helpers/syntheticTiff.ts`
- `tests/e2e/*.spec.ts`

## Completion gate

This refactor should not be considered complete until:

1. Every section above is marked `VERIFIED`.
2. The matching backlog item is `DONE`.
3. The e2e matrix in `TEST_PLAN.md` has passing evidence for the required scenarios.
