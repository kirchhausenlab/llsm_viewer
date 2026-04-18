# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Phase 0 - Type-model and compatibility foundation

- `D16-001` (`TODO`): define stored-intensity dtype fields across manifest, summaries, and runtime types.
  - Scope:
    - add explicit stored dtype metadata
    - preserve existing source dtype semantics
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/types.ts`
    - `src/core/volumeProcessing.ts`
    - `src/hooks/dataset/useDatasetSetup.ts`

- `D16-002` (`TODO`): bump preprocessed dataset format to `hes2` and support dual-format import.
  - Scope:
    - write `hes2`
    - read both `hes1` and `hes2`
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/types.ts`
    - `src/shared/utils/preprocessedDataset/schema.ts`
    - `src/shared/utils/preprocessedDataset/open.ts`

## Phase 1 - Setup-page opt-in and validation

- `D16-010` (`TODO`): add `Render in 16bit` checkbox to experiment configuration UI.
  - Scope:
    - place checkbox below `Background mask`
    - wire locked-state behavior
  - Expected evidence:
    - `src/components/pages/ExperimentConfiguration.tsx`
    - `src/components/pages/FrontPage.tsx`

- `D16-011` (`TODO`): capture and persist source dtype metadata for uploaded layer sources.
  - Scope:
    - extend `ChannelVolumeSource`
    - probe TIFF typed-array dtype at upload time or preprocess preflight
  - Expected evidence:
    - `src/hooks/dataset/useChannelSources.ts`
    - `src/hooks/dataset/useDatasetSetup.ts`

- `D16-012` (`TODO`): add preprocess-time all-8-bit guard for 16-bit mode.
  - Scope:
    - ignore segmentation layers
    - treat `uint8` and `int8` as 8-bit
    - abort with interaction warning when no eligible non-segmentation layers exist
  - Expected evidence:
    - `src/components/pages/FrontPageContainer.tsx`
    - tests covering the warning behavior

## Phase 2 - Preprocess precision selection and schema emission

- `D16-020` (`TODO`): add `renderIn16Bit` to preprocess options and route it from front-page state.
  - Expected evidence:
    - `src/components/pages/FrontPageContainer.tsx`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `D16-021` (`TODO`): implement per-layer stored-intensity dtype resolver.
  - Scope:
    - `uint8`/`int8` stay `uint8`
    - `uint16` identity path
    - all other higher-precision non-segmentation dtypes normalize to `uint16`
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `D16-022` (`TODO`): generalize intensity normalization helpers to support `uint8` and `uint16` targets.
  - Expected evidence:
    - `src/core/volumeProcessing.ts`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

- `D16-023` (`TODO`): emit `hes2` layer manifests with stored-intensity dtype metadata and mixed scale-data dtypes.
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`
    - schema fixtures in `tests/fixtures/preprocessed-schema`

## Phase 3 - Side-data generalization

- `D16-030` (`TODO`): make intensity skip-hierarchy `min/max` match stored intensity precision.
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/preprocess.ts`
    - `src/shared/utils/preprocessedDataset/schema.ts`
    - `src/core/volumeProvider.ts`

- `D16-031` (`TODO`): generalize chunk-encoding statistics and data slicing for `uint16` intensity.
  - Expected evidence:
    - `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`

- `D16-032` (`TODO`): make subcell side-data precision match stored intensity precision.
  - Expected evidence:
    - `src/shared/utils/brickSubcell.ts`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`
    - `src/shared/utils/preprocessedDataset/schema.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `D16-033` (`TODO`): generalize workerized preprocess scale-pyramid flow for `uint16` intensity.
  - Expected evidence:
    - `src/workers/preprocessScalePyramid.worker.ts`
    - `src/workers/preprocessScalePyramidMessages.ts`

- `D16-034` (`TODO`): generalize preprocess-time histogram generation to stored `uint8` and `uint16`.
  - Expected evidence:
    - `src/shared/utils/histogram.ts`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`

## Phase 4 - Runtime provider and cache refactor

- `D16-040` (`TODO`): load intensity scale data as either `uint8` or `uint16`.
  - Expected evidence:
    - `src/core/volumeProvider.ts`

- `D16-041` (`TODO`): add explicit semantic flags to atlas/runtime helpers and remove `uint16 === segmentation` assumptions.
  - Expected evidence:
    - `src/core/volumeProvider.ts`
    - `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
    - `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `D16-042` (`TODO`): make page-table chunk min/max types precision-aware.
  - Expected evidence:
    - `src/core/volumeProvider.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `D16-043` (`TODO`): add byte-aware cached-volume accounting and diagnostics.
  - Expected evidence:
    - `src/core/volumeProvider.ts`
    - diagnostics consumers/tests

## Phase 5 - Viewer and slice-path refactor

- `D16-050` (`TODO`): generalize `IntensityVolume.normalized` handling to `Uint8Array | Uint16Array`.
  - Expected evidence:
    - `src/core/volumeProcessing.ts`
    - `src/core/textureCache.ts`

- `D16-051` (`TODO`): update texture-cache packing paths for mixed stored precision.
  - Expected evidence:
    - `src/core/textureCache.ts`

- `D16-052` (`TODO`): stop forcing `UnsignedByteType` for intensity 3D textures.
  - Expected evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `D16-053` (`TODO`): generalize slice CPU packing and `DataTexture` typing for `uint16` intensity.
  - Expected evidence:
    - `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `D16-054` (`TODO`): validate shader-side normalized sampling with `UnsignedShortType` intensity textures.
  - Expected evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/shaders/sliceRenderShader.ts`
    - rendering tests

## Phase 6 - Hover, ROI, and histogram correctness

- `D16-060` (`TODO`): replace all hard-coded `/255` denormalization with stored-dtype-aware helpers.
  - Expected evidence:
    - `src/shared/utils/intensityFormatting.ts`
    - `src/shared/utils/hoverSampling.ts`
    - `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
    - `src/shared/utils/roiMeasurements.ts`

- `D16-061` (`TODO`): generalize histogram helpers for mixed stored precision while keeping 256 bins.
  - Expected evidence:
    - `src/shared/utils/histogram.ts`
    - `src/autoContrast.ts`
    - `src/components/viewers/BrightnessContrastHistogram.tsx`

- `D16-062` (`TODO`): preserve hover and ROI behavior for mixed `uint8` + `uint16` datasets.
  - Expected evidence:
    - `src/components/viewers/volume-viewer/useVolumeHover.ts`
    - `src/components/viewers/ViewerShell.tsx`

## Phase 7 - Tests, benchmarks, and closure

- `D16-070` (`TODO`): add preprocess/schema fixtures for 16-bit intensity datasets.
  - Expected evidence:
    - `tests/fixtures/preprocessed-schema`
    - `tests/preprocessPipeline.test.ts`
    - `tests/preprocessedSchemaValidation.test.ts`

- `D16-071` (`TODO`): add runtime/provider tests for mixed stored precision.
  - Expected evidence:
    - `tests/preprocessedDataset.test.ts`
    - `tests/preprocessedMultiscaleRuntime.test.ts`
    - `tests/useVolumeResources.test.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

- `D16-072` (`TODO`): add hover and ROI correctness tests for 16-bit stored intensity.
  - Expected evidence:
    - `tests/volumeHoverSampling.test.ts`
    - `tests/roiMeasurements.test.ts`

- `D16-073` (`TODO`): add setup-page validation coverage for the `Render in 16bit` UX guard.
  - Expected evidence:
    - `tests/frontend/FrontPage.test.ts`
    - `tests/frontend/LaunchActions.test.tsx`

- `D16-074` (`TODO`): extend performance harnesses for 8-bit vs 16-bit normalized intensity scenarios.
  - Expected evidence:
    - `tests/perf/preprocessSmoke.test.ts`
    - `tests/perf/nextgenVolumeRuntimeStress.test.ts`
    - benchmark scripts and logged evidence

- `D16-075` (`TODO`): finalize docs and record measured tradeoffs.
  - Expected evidence:
    - this folder
    - `docs/PROGRESS.md` if desired

## High-contention files (avoid parallel edits)

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- `src/core/volumeProvider.ts`
- `src/core/volumeProcessing.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
