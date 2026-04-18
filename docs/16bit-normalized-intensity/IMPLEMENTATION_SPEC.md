# Implementation Spec

This document defines the full architecture for optional 16-bit normalized intensity storage and rendering.

## 1) Product contract

### Setup-page behavior

- Add a checkbox labeled `Render in 16bit`.
- Place it directly below the `Background mask` row in the experiment configuration section.
- Default value is `false`.
- The control is disabled when the front page is locked, consistent with the existing preprocessing controls.

Primary touchpoints:

- `src/components/pages/ExperimentConfiguration.tsx`
- `src/components/pages/FrontPageContainer.tsx`
- `src/hooks/dataset/useChannelSources.ts`

### Preprocess validation behavior

- Validation runs when `Preprocess experiment` is clicked.
- When `Render in 16bit` is `true`, preprocessing must abort with a warning if:
  - there are no non-segmentation layers, or
  - every non-segmentation source layer is 8-bit wide
- The warning should be shown through the existing `showInteractionWarning(...)` interaction-error path.
- No warning is shown when at least one non-segmentation source layer has precision above 8 bits.

Recommended warning text:

- `Render in 16bit is only useful when at least one non-segmentation layer has source precision above 8 bits. Uncheck "Render in 16bit" to continue.`

### Channel-source metadata behavior

- The setup-page channel source model should gain cached dtype metadata so the validation does not need to re-probe TIFF files on every preprocess click.
- Recommended addition to `ChannelVolumeSource`:
  - `sourceDataType?: VolumeDataType`
- If caching source dtype during upload is too invasive for the first pass, preprocess-time probing is acceptable, but cached metadata is preferred.

Primary touchpoints:

- `src/hooks/dataset/useChannelSources.ts`
- `src/hooks/dataset/useDatasetSetup.ts`
- `src/components/pages/FrontPageContainer.tsx`

## 2) Precision-selection contract

### Intensity storage selection

For each non-segmentation layer:

- if `Render in 16bit` is `false`:
  - stored intensity dtype = `uint8`
- if `Render in 16bit` is `true`:
  - source `uint8` / `int8` -> stored intensity dtype = `uint8`
  - source `uint16` -> stored intensity dtype = `uint16`
  - source `int16` / `uint32` / `int32` / `float32` / `float64` -> stored intensity dtype = `uint16`

Segmentation remains unchanged:

- segmentation stored data dtype = `uint16`

### Rationale

- This preserves the requested 16-bit mode for higher-precision data.
- It avoids doubling the cost of layers that are already limited to 8-bit precision.
- It allows mixed `uint8` + `uint16` intensity layers in one dataset.

## 3) Normalization contract

### Unchanged policy

- This refactor does **not** change representative-timepoint normalization.
- The selected representative timepoint remains `floor(timepointCount / 2)`.
- Layer-level `min` / `max` metadata remain derived the same way as today unless the `uint16` identity rule below applies.

### 8-bit mode

- Current behavior remains unchanged.
- `uint8` identity path remains `min=0`, `max=255`.
- All other non-segmentation dtypes linearly normalize into `uint8`.

### 16-bit mode

#### Source `uint16`

- Stored intensity dtype = `uint16`
- Use identity mapping over the full range:
  - `min = 0`
  - `max = 65535`
- Do **not** compute representative `min` / `max` for the identity path.

#### All other non-segmentation source dtypes above 8-bit

- Stored intensity dtype = `uint16`
- Compute representative layer `min` / `max` exactly as today.
- Normalize with:

`normalized = round(clamp((value - min) / (max - min), 0, 1) * 65535)`

- Clamp to `0..65535`

#### Source `uint8` / `int8` under the mixed-precision refinement

- Source `uint8` remains the current identity path `0..255`.
- Source `int8` remains stored as normalized `uint8` with the existing `uint8` min/max mapping rules.

### Denormalization contract

- Denormalization must use a per-layer denominator:
  - `255` for stored `uint8`
  - `65535` for stored `uint16`
- Current hard-coded `/255` behavior is invalid once intensity can be stored as `uint16`.

Recommended helper:

- `getNormalizedDenominator(type: 'uint8' | 'uint16'): 255 | 65535`

Primary touchpoints:

- `src/shared/utils/intensityFormatting.ts`
- `src/shared/utils/hoverSampling.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/shared/utils/roiMeasurements.ts`

## 4) Schema and manifest contract

### Versioning

- Bump the preprocessed dataset format version from `hes1` to `hes2`.
- Old datasets remain loadable.
- New preprocessing writes only the new format version.

Primary touchpoints:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/open.ts`

### Layer manifest semantics

- `PreprocessedLayerManifestEntry.dataType` remains the source/original dtype.
- Add `storedDataType: 'uint8' | 'uint16'` for all layers.
- `normalization` remains:
  - `null` for segmentation
  - `{ min, max }` for intensity
- `normalization.min/max` continue to describe the raw-domain inverse-normalization range, not the stored normalized domain.

### Scale descriptor semantics

- `zarr.data.dataType` for intensity scales becomes `uint8 | uint16`.
- Segmentation remains `uint16`.
- For intensity, all scales of one layer use the same stored dtype.

### Summary semantics

- `PreprocessedLayerSummary`
- `LoadedDatasetLayer`

should expose both:

- source dtype
- stored intensity dtype

This is required so:

- UI/formatting can keep using the source dtype
- runtime can use the stored dtype for texture upload, histogram logic, and denormalization

## 5) Runtime type-model contract

### Intensity volume

Current runtime model:

- `dataType`: source dtype
- `normalized: Uint8Array`

Required runtime model:

- `dataType`: source dtype
- `normalizedDataType: 'uint8' | 'uint16'`
- `normalized: Uint8Array | Uint16Array`
- `min`, `max`: raw-domain inverse-normalization metadata

Recommended update:

```ts
type IntensityVolume = {
  kind: 'intensity';
  channels: number;
  dataType: VolumeDataType;
  normalizedDataType: 'uint8' | 'uint16';
  normalized: Uint8Array | Uint16Array;
  histogram?: Uint32Array;
  min: number;
  max: number;
}
```

### Volume provider

- `getVolume()` must accept intensity scale data stored as either `uint8` or `uint16`.
- The returned `IntensityVolume` must preserve:
  - source dtype
  - stored normalized dtype

### Brick atlas

Current problem:

- atlas helpers infer segmentation from `dataType === 'uint16'`

Required change:

- add an explicit semantic field on the atlas source, e.g.:
  - `kind: 'intensity' | 'segmentation'`
  - or `isSegmentation: boolean`

This applies to:

- `VolumeBrickAtlas`
- CPU atlas sample helpers
- slice texture builders
- direct-atlas preparation logic

### Page-table min/max side data

Current model:

- `chunkMin: Uint8Array`
- `chunkMax: Uint8Array`

Required model:

- `chunkMin: Uint8Array | Uint16Array`
- `chunkMax: Uint8Array | Uint16Array`
- same for skip-hierarchy `min` / `max`

Occupancy remains `Uint8Array`.

Primary touchpoints:

- `src/core/volumeProcessing.ts`
- `src/core/volumeProvider.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`

## 6) Preprocessing pipeline contract

### Front-page options

- Add `renderIn16Bit?: boolean` to `PreprocessDatasetToStorageOptions`.
- `FrontPageContainer` passes the checkbox value through to preprocessing.

### Source-dtype probe

- Probe the first raster typed array for each non-segmentation layer source.
- Validation should use `getBytesPerValue(sourceDataType)`.

### Stored-dtype resolution

Add one authoritative resolver:

- `resolveStoredIntensityDataType({ sourceDataType, renderIn16Bit })`

Do not duplicate this logic across:

- setup validation
- manifest generation
- normalization workers
- chunk encoding

### Generic normalization helpers

Replace `uint8`-specific helpers with target-dtype-aware variants:

- `computeNormalizationParametersFromScannedMinMax(...)`
- `normalizeSliceToUint8(...)`
- `normalizeVolume(...)`
- `normalizeTypedArray(...)`

Recommended replacements:

- `normalizeSliceToStoredIntensityType(...)`
- `normalizeTypedArrayToStoredIntensityType(...)`
- `getStoredIntensityDenominator(...)`

### Generic downsampling

Current downsampling helpers are `Uint8Array`-specific for intensity.

Required:

- downsample intensity slices/volumes generically for `Uint8Array | Uint16Array`
- preserve same downsample policy and mip behavior

Primary touchpoints:

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/workers/preprocessScalePyramid.worker.ts`
- `src/workers/preprocessScalePyramidMessages.ts`

### Histogram generation

Current histogram contract:

- 256 bins
- assumes `Uint8Array`

Required:

- keep 256 bins for UI compatibility
- compute histograms from stored normalized values for both `uint8` and `uint16`
- bucket mapping:
  - `uint8`: direct `0..255`
  - `uint16`: collapse `0..65535` into `256` bins

Recommended rule:

- `bin = round(value * 255 / denominator)`

This preserves:

- `Uint32Array(256)` histogram storage
- current UI histogram panel
- current auto-window semantics in normalized `[0, 1]`

### Skip hierarchy

Current issue:

- intensity skip-hierarchy `min` / `max` are always `uint8`

Required:

- for intensity layers, `skipHierarchy.min/max.dataType` must match `storedDataType`
- `occupancy.dataType` stays `uint8`

Reason:

- leaving `min/max` at `uint8` would remain conservative but would destroy skip precision and performance in 16-bit mode

### Subcell data

Current issue:

- subcell data is always `uint8`
- subcell min/max values clamp to `0..255`

Required:

- for intensity layers, subcell data dtype must match `storedDataType`
- occupancy remains encoded as:
  - `0` / `255` for `uint8`
  - `0` / `65535` for `uint16`

Reason:

- subcell data participates in runtime rendering decisions and should not silently reintroduce 8-bit precision loss for 16-bit layers

## 7) Viewer/resource upload contract

### 3D textures

- The generic `createByte3dTexture(...)` helper already supports `Uint16Array`.
- The intensity path must stop forcing `UnsignedByteType`.
- Resource rebuild checks must treat either `Uint8Array` or `Uint16Array` as valid intensity texture sources.

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/core/textureCache.ts`

### Texture cache

Current issue:

- `PreparedTexture.data` is `Uint8Array`

Required:

- `PreparedTexture.data` becomes `Uint8Array | Uint16Array`
- packing paths for 3-channel and `>4` channel data must preserve source element width
- for 16-bit packed alpha fill, use `65535` instead of `255`

### Slice rendering

Current issue:

- CPU slice preparation emits `Uint8Array` RGBA

Required:

- direct-volume intensity slice prep must emit:
  - `Uint8Array` when stored dtype is `uint8`
  - `Uint16Array` when stored dtype is `uint16`
- slice `DataTexture.type` must match the buffer element width
- atlas slice preparation must use semantic segmentation flags rather than `uint16 === segmentation`

Primary touchpoints:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/sliceRenderShader.ts`

## 8) Shader contract

### Intensity volume shader

- The intensity shader should continue to use normal normalized samplers.
- No integer-sampler refactor is required for intensity.
- `texture(...)` and `texelFetch(...)` should read normalized floats from either:
  - `UnsignedByteType`
  - `UnsignedShortType`

### Windowing

- `u_windowMin` / `u_windowMax` remain normalized `[0, 1]`.
- No raw-domain shader windowing is introduced.

### Skip/min/max/subcell textures

- When intensity side-data becomes `uint16`, their GPU textures must also be uploaded as `UnsignedShortType`.
- Shader code remains valid if these textures are sampled as normalized floats.

### Segmentation shader path

- Segmentation remains unchanged.
- Packed-RG label decode stays intact.
- Any code path using `uint16` as a segmentation proxy must be replaced by an explicit semantic flag.

Primary touchpoints:

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`

## 9) Hover, ROI, histogram, and measurement contract

### Hover

- Hover sampling from direct volume must support `Uint8Array | Uint16Array`.
- Hover sampling from brick atlas must use:
  - semantic segmentation flag
  - correct inverse-normalization denominator

### ROI measurements

- Per-voxel and interpolated ROI measurements must denormalize using the layer-specific denominator.
- No logic may assume `/255`.

### Histograms and auto-window

- The histogram shape stays `256`.
- `computeAutoWindow(...)` continues to work over normalized `[0, 1]` bins.
- Replace `computeUint8VolumeHistogram(...)` with a generic normalized-value histogram helper.

Primary touchpoints:

- `src/shared/utils/hoverSampling.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/shared/utils/roiMeasurements.ts`
- `src/shared/utils/histogram.ts`
- `src/autoContrast.ts`

## 10) Cache and performance contract

### Byte-aware cache policy

Current issue:

- volume cache budgeting is count-based, not byte-based

Required:

- add explicit cached-volume byte accounting
- add a byte-based limit for loaded volumes, or replace the count-only policy
- diagnostics should expose cached volume bytes

Reason:

- mixed `uint8` + `uint16` layers make volume-count limits misleading

### Expected performance impact

For layers stored as `uint16`:

- storage: about `2x`
- CPU resident volume memory: about `2x`
- GPU texture memory: about `2x`
- upload bandwidth: about `2x`
- render texture bandwidth: materially higher

Expected user-visible impact:

- most noticeable in `BL`, `MIP`, `VR`, and atlas-heavy paths
- minimal impact on layers that remain `uint8`

### Performance target

- 8-bit datasets should not regress materially when `Render in 16bit` is disabled
- mixed datasets should degrade roughly in proportion to the number/size of `uint16` intensity layers
- all-16-bit-eligible datasets are expected to be slower; this is acceptable if correctness and stability remain intact

## 11) Compatibility contract

- Old `hes1` datasets remain readable without conversion.
- New preprocessing writes `hes2`.
- The viewer must support mixed old/new datasets in the same application build.
- Export/import flows must not assume a single manifest format string.

## 12) High-contention files

Avoid parallel edits across these files:

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/core/volumeProvider.ts`
- `src/core/volumeProcessing.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- `src/shared/utils/hoverSampling.ts`
- `src/shared/utils/roiMeasurements.ts`
- `src/autoContrast.ts`

## 13) Expected file touchpoints

### Setup / front page

- `src/components/pages/ExperimentConfiguration.tsx`
- `src/components/pages/FrontPage.tsx`
- `src/components/pages/FrontPageContainer.tsx`
- `src/hooks/dataset/useChannelSources.ts`
- `src/hooks/dataset/useDatasetSetup.ts`

### Schema / manifest / summaries

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/open.ts`
- `src/shared/utils/preprocessedDataset/manifest.ts`
- `src/hooks/dataset/useDatasetSetup.ts`

### Preprocessing

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/workers/preprocessScalePyramid.worker.ts`
- `src/workers/preprocessScalePyramidMessages.ts`
- `src/core/volumeProcessing.ts`

### Runtime provider

- `src/core/volumeProvider.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/ui/app/hooks/useRouteLayerVolumes.ts`

### Rendering / viewer

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`

### Analysis / histogram / measurements

- `src/shared/utils/intensityFormatting.ts`
- `src/shared/utils/histogram.ts`
- `src/autoContrast.ts`
- `src/shared/utils/hoverSampling.ts`
- `src/shared/utils/roiMeasurements.ts`
