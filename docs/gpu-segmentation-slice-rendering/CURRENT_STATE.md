# Current State

## User-Visible Symptom

2D view becomes slow when segmentation or editable segmentation channels are visible.

The slowdown is not caused by the top-menu 2D toggle. The toggle only forces layer render settings to Slice mode. The expensive work happens after segmentation layers enter Slice mode.

## Relevant Runtime Data Shapes

Regular segmentation channels are sparse atlas-backed layers. They usually have:

- `layer.volume === null`
- `layer.brickAtlas?.kind === 'segmentation'`
- `layer.brickAtlas.data` containing packed label bytes
- `layer.brickAtlas.pageTable` describing sparse brick layout

Editable segmentation channels are also exposed to the viewer as atlas-backed segmentation layers. Their atlas is built from in-memory editable bricks.

## Current Slice Mode Source Selection

The viewer resolves layer mode in:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`

The important branch is:

- `viewerMode === 'slice'`

Slice resources are created or updated in two places:

- initial build path around `prepareSliceTexture(...)` and `prepareSliceTextureFromBrickAtlas(...)`
- update path around the later call to `prepareSliceTexture(...)` and `prepareSliceTextureFromBrickAtlas(...)`

For atlas-backed segmentation, the slice branch calls:

- `prepareSliceTextureFromBrickAtlas(...)`

defined in:

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`

## CPU Hot Path

`prepareSliceTextureFromBrickAtlas(...)` does the following for segmentation:

1. Determine slice width/height/depth from `pageTable.volumeShape`.
2. Allocate or reuse an RGBA output buffer sized `width * height * 4`.
3. For each pixel `(x, y)` in the slice:
   - locate the brick containing `(x, y, z)`
   - look up the brick atlas slot via `pageTable.brickAtlasIndices`
   - compute local brick coordinates
   - decode packed label bytes from atlas data
   - map label to RGBA either through a table or hash
   - write RGBA into the CPU buffer
4. Upload or update a `THREE.DataTexture`.

This is `O(width * height)` per visible segmentation layer per slice update, with a heavy constant factor.

## Why Segmentation Is Worse Than Intensity

Dense intensity Slice mode also loops over pixels, but it reads contiguous dense data directly.

Atlas-backed segmentation Slice mode performs per-pixel sparse lookup:

- brick coordinate math
- page-table lookup
- slot-grid lookup
- packed label decode
- label colorization

This makes large segmentations slow even when only a small number of voxels are labeled.

## Editable Segmentation Extra Cost

Editable segmentation atlas generation is handled in:

- `src/hooks/annotation/useAnnotate.ts`
- `src/shared/utils/annotation/editableSegmentationState.ts`

`useAnnotate` builds editable atlases through:

- `buildEditableSegmentationBrickAtlas(...)`

That function:

- iterates dirty/current editable bricks
- packs nonzero labels into atlas data
- rebuilds page-table and skip-hierarchy metadata
- caches the result by editable timepoint revision

The editable atlas cache prevents rebuilding on every render when nothing changed. However, after edits or timepoint changes, the rebuild cost can combine with the CPU slice flattening cost.

## Current 3D Path

3D segmentation already uses GPU-side atlas/page-table sampling through the volume rendering shader path and related brick residency helpers.

The desired fix should reuse the same source data and binding concepts for Slice mode, not create another CPU label pipeline.

## Important Existing Functions And Files

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
  - Slice resource lifecycle
  - texture creation/update
  - shader material creation
  - brick atlas uniform binding

- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
  - `prepareSliceTextureFromBrickAtlas(...)`
  - current CPU fallback implementation

- `src/shaders/sliceRenderShader.ts`
  - current slice shader for prebuilt slice texture

- `src/shaders/volumeRenderShader.ts`
  - existing GPU atlas/page-table sampling behavior to reuse or factor

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
  - `applyBrickPageTableUniforms(...)`
  - texture creation helpers
  - segmentation palette binding

- `src/shared/utils/annotation/editableSegmentationState.ts`
  - editable atlas generation

