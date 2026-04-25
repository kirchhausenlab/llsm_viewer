# WebGL2 Rendering Plan

This document defines the target WebGL2 rendering architecture for sparse segmentation.

No part of this plan depends on WebGPU. The storage and provider boundaries should still be backend-neutral so a future WebGPU renderer can replace the WebGL2 resource path.

## Rendering model

Segmentation rendering remains voxel-based.

The renderer does not draw meshes, surfaces, point clouds, splats, instanced cubes, or generated geometry. It ray-traverses a sparse voxel field.

The central idea:

- traverse a coarse sparse brick grid
- skip empty bricks by jumping to brick boundaries
- sample only resident occupied bricks
- resolve exact labels from local brick payload data
- color labels deterministically by hash

## CPU to GPU resource stages

The provider exposes sparse segmentation field handles. The WebGL2 resource manager converts the currently needed sparse data into GPU textures.

Stages:

1. Load sparse brick directory and occupancy hierarchy for layer, timepoint, and scale.
2. Determine required bricks for the current render state.
3. Load and decode required brick payloads into CPU resident brick objects.
4. Pack resident bricks into GPU-friendly local brick atlas textures.
5. Upload brick page tables and hierarchy textures.
6. Mark segmentation layer render-ready only when required occupied bricks are resident.

## GPU texture representation

Use WebGL2-compatible texture data. Avoid assumptions that require storage buffers or compute shaders.

Required GPU resources:

- brick directory/page table texture
- occupancy hierarchy texture or packed hierarchy textures
- resident brick atlas texture for local labels
- resident brick metadata texture
- optional local sub-brick occupancy texture

### Brick page table

The page table maps global brick coordinate to resident atlas slot.

Values:

- empty brick sentinel
- occupied but not resident sentinel
- resident atlas slot index

The shader must distinguish empty from occupied-but-not-resident. Occupied-but-not-resident must not render as empty.

Packing:

- prefer integer-safe byte packing into RGBA8 textures
- reserve an explicit sentinel for empty
- reserve an explicit sentinel for occupied missing
- support enough atlas slots for configured GPU budgets

### Resident label atlas

Resident occupied bricks are decoded into local brick atlas slots.

For WebGL2, use byte-packed labels:

- `uint32` label split across RGBA8 bytes
- nearest filtering
- no color-space conversion

This is not dense global storage. It is a dense local GPU representation for resident occupied bricks only.

### Local sub-brick occupancy

Sparse occupied bricks may still contain mostly zeros. Add a local occupancy hierarchy inside each resident brick.

Default local subdivision:

- 4 x 4 x 4 or 8 x 8 x 8 sub-bricks inside a 32-cubed brick

The shader can skip empty local sub-bricks before sampling individual voxels.

This matters for scattered sparse labels where many global bricks contain only a few nonzero voxels.

## Ray traversal

The segmentation 3D shader should use brick DDA traversal rather than fixed dense-volume stepping.

High-level flow:

1. Compute ray entry and exit in normalized volume coordinates.
2. Convert entry to voxel and brick coordinates.
3. Step through global bricks using DDA.
4. For each global brick:
   - if empty, advance to next brick boundary
   - if occupied but not resident, emit loading/incomplete state or discard according to render-ready policy
   - if resident, traverse local sub-bricks
   - sample local labels only when inside occupied local regions
5. On first foreground hit, resolve exact label.
6. Color label by hash.
7. Apply segmentation lighting and hover highlight.

The current fixed-step segmentation loop in `src/shaders/volumeRenderShader.ts` should be replaced for segmentation. Intensity render styles keep their existing logic unless shared utilities need minor extraction.

## Correctness rules

- Label `0` is transparent background.
- Nonzero label is occupied foreground.
- Nearest-neighbor label lookup is required.
- Interpolation must never blend label IDs.
- Surface refinement may interpolate positions, but final label resolution must sample discrete labels.
- Missing resident occupied bricks are not background.
- Ray traversal must guarantee forward progress at every iteration.
- Shader loop bounds must be fixed enough for WebGL2 compilation.

## Hash-based label color

The shader should compute deterministic colors from label ID and layer seed.

Requirements:

- no fixed 65,536-label palette limit
- same label keeps same color across timepoints and scales
- label `0` returns transparent
- color generation works for `uint32` labels represented as packed bytes/floats

If GLSL integer support is awkward in the current Three.js/WebGL2 path, use byte-safe arithmetic and documented packing helpers. Tests should validate representative labels above 65,535.

## Slice rendering

Axis-aligned slice rendering should use a CPU-assisted sparse extraction path first.

Flow:

1. Identify occupied bricks intersecting the requested slice.
2. Load/decode those bricks if needed.
3. Create a transparent RGBA slice buffer.
4. Draw nonzero labels from intersecting bricks into the buffer.
5. Upload the RGBA slice texture.

The slice path should not scan every voxel in the full slice if the brick directory can avoid it.

Oblique slice support, if present or added, should query the sparse provider per sample or use a shader path through the same sparse brick textures.

## Hover and picking

CPU hover lookup:

1. Convert normalized hover coordinate to voxel coordinate.
2. Compute brick coordinate.
3. Query brick directory.
4. If no occupied brick, return label `0`.
5. If brick is occupied, require resident payload or load it.
6. Query exact local label.

3D shader hit lookup:

- the ray traversal path resolves exact label at the hit
- hover highlight compares hit label to selected hover label
- labels are compared as exact integer IDs, not approximate normalized intensity values

## Residency and readiness

The renderer may use GPU residency budgets, but readiness must remain honest.

Required states:

- no segmentation data
- loading sparse index
- loading required bricks
- render-ready
- incomplete due to missing occupied bricks
- error

An occupied brick missing from GPU residency may be skipped only if the layer is visibly marked incomplete or the frame is blocked until residency is complete.

## WebGL2 limitations to respect

- no compute shaders
- no storage buffers
- texture size limits vary by device
- integer texture support is more constrained than WebGPU
- shader dynamic loops must stay bounded
- excessive dependent texture reads can erase sparsity gains

Design implications:

- keep page-table lookup simple
- prefer byte-packed textures with nearest filtering
- keep brick and sub-brick metadata compact
- use CPU preprocessing/resource packing to simplify shader logic
- benchmark on realistic sparse shapes, not only random voxels

## Future WebGPU migration

The future WebGPU renderer should be able to reuse:

- sparse manifest format
- brick directory
- payload codecs
- label metadata
- CPU provider/query API
- tests for correctness

The WebGPU implementation would replace:

- RGBA8 packed page tables
- RGBA8 packed label atlases
- texture-based metadata
- GLSL traversal shader

Do not bake WebGL2-only assumptions into the storage format.

