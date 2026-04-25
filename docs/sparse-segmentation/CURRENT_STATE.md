# Current State

This document summarizes the current dense segmentation implementation and the files most likely to change.

## Setup and channel identity

Current segmentation channels are ordinary channel sources marked as segmentation.

Important files:

- `src/hooks/dataset/useChannelSources.ts`
- `src/hooks/dataset/channelClassification.ts`
- `src/ui/app/hooks/useRouteDatasetSetupState.ts`
- `src/components/pages/ChannelListPanel.tsx`
- `src/hooks/dataset/useDatasetSetup.ts`

Current behavior:

- setup creates segmentation channels using `channelType: 'segmentation'`
- imported or legacy state may also infer segmentation from `volume.isSegmentation`
- segmentation uploads are forced to a single logical source channel
- multichannel upload splitting is used for intensity channels, not segmentation channels

The setup-level distinction can remain, but downstream processing must stop producing dense segmentation volumes.

## Current preprocessing model

Important files:

- `src/shared/utils/preprocessedDataset/preprocess.ts`
- `src/shared/utils/preprocessedDataset/preprocessScalePyramidWorker.ts`
- `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`
- `src/core/volumeProcessing.ts`

Current behavior:

- segmentation is canonicalized into dense `Uint16Array` labels
- stored segmentation data is dense `uint16`
- segmentation has no histogram
- segmentation normalization is `null`
- segmentation downsampling is label-aware, not intensity max-pooling
- scale descriptors still use dense `zarr.data`
- skip hierarchy is derived from dense chunk grids

This must be replaced with streaming sparse brick construction.

## Current manifest/schema model

Important files:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/manifest.ts`
- `tests/preprocessedSchemaValidation.test.ts`
- `tests/fixtures/preprocessed-schema/`

Current behavior:

- manifest format currently includes `llsm-viewer-preprocessed-vnext-hes2`
- `PreprocessedLayerManifestEntry` uses `isSegmentation: boolean`
- segmentation scales still validate dense `zarr.data` as `uint16`
- segmentation skip hierarchy uses `uint8` min/max/occupancy descriptors
- old dense segmentation can still be considered valid if it matches the dense schema

Target behavior:

- sparse segmentation layers have a new explicit sparse representation
- dense segmentation layers fail schema validation
- intensity-only manifests from older accepted formats can still validate

## Current runtime loading model

Important files:

- `src/core/volumeProvider.ts`
- `src/core/volumeProcessing.ts`
- `src/ui/app/volume-loading/residencyPolicy.ts`
- `src/ui/contracts/viewerLayer.ts`

Current behavior:

- `loadVolume` reads dense zarr data for every layer
- segmentation requires one channel and `uint16`
- segmentation returns `SegmentationVolume` with a dense `labels: Uint16Array`
- residency policy prefers direct volume for segmentation

Target behavior:

- intensity loading remains dense
- segmentation loading returns a sparse segmentation field handle
- no segmentation provider API should require full dense label reads
- residency policy must reason about sparse brick indexes and payload residency

## Current GPU/resource model

Important files:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`

Current behavior:

- dense segmentation labels are packed into a 3D label texture
- label `uint16` is packed into two 8-bit texture channels
- palette texture is 256 x 256 RGBA
- 3D segmentation shader samples labels from full-volume or brick-atlas paths
- slice rendering builds RGBA slices from dense labels or atlas data

Target behavior:

- GPU resources are built from sparse resident bricks
- labels use logical `uint32`
- no full dense segmentation label texture exists
- 3D shader traverses sparse brick grids
- slice path decodes only intersecting sparse bricks

## Current hover and picking model

Important files:

- `src/components/viewers/volume-viewer/volumeHoverSampling.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts`
- `src/shaders/volumeRenderShader.ts`

Current behavior:

- CPU hover can sample dense `volume.labels`
- shader hover can highlight the matched dense label

Target behavior:

- CPU hover queries sparse brick directory and resident payloads
- shader hit path resolves exact `uint32` label from sparse resident brick data
- missing resident occupied bricks cannot return false background

## Current UI behavior that should mostly remain

Important files:

- `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
- `src/components/viewers/ViewerShell.tsx`
- `src/components/viewers/viewer-shell/VolumeChannelTabs.tsx`
- `src/state/layerSettings.ts`
- VR HUD channel controls under `src/components/viewers/volume-viewer/vr/`

Current behavior to preserve conceptually:

- segmentation channels use simplified render controls
- segmentation supports `3D` and `Slice`
- invert is disabled for segmentation
- histograms are absent for segmentation
- label `0` is transparent
- channel tabs can show segmentation-specific styling

Internal props and data types will change, but the user-facing control model does not need a redesign for this refactor.

## Paintbrush and measurements

Important files:

- `src/components/viewers/viewer-shell/hooks/useViewerPaintbrushIntegration.ts`
- `src/hooks/paintbrush/usePaintbrush.ts`
- `src/shared/utils/roiMeasurements.ts`

Current behavior:

- paintbrush creates a separate RGBA intensity overlay
- paintbrush does not mutate segmentation labels
- ROI measurements are intensity-oriented

Target behavior:

- paintbrush may continue as an overlay
- it must not assume segmentation has dense dimensions/data arrays beyond global dimensions
- ROI measurement logic should continue to exclude segmentation unless a future explicit label measurement feature is added

