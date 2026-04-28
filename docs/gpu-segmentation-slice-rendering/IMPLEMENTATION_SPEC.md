# Implementation Spec

## Summary

Add a GPU slice shader path for atlas-backed segmentation layers.

Instead of preparing an RGBA CPU slice with `prepareSliceTextureFromBrickAtlas(...)`, the renderer should draw the existing slice plane and sample the sparse segmentation atlas/page table in the fragment shader using:

- plane UV -> voxel `x/y`
- uniform slice index -> voxel `z`
- page-table textures/uniforms -> brick and atlas slot
- atlas label texture -> packed label
- existing palette/hash behavior -> RGBA output

## Scope

In scope:

- regular sparse segmentation Slice mode
- editable segmentation Slice mode
- WebGL2 shader and uniforms
- resource lifecycle in `useVolumeResources`
- tests and performance evidence

Out of scope:

- dense intensity Slice mode rewrite
- 3D rendering changes except shared helper extraction
- hover algorithm changes unless needed for compatibility
- annotation editing semantics
- preprocessing/storage/schema changes
- WebGPU

## Target Architecture

Introduce a new slice source mode:

- `sliceTexture`
  - current behavior
  - shader samples `u_slice`
  - used for dense volumes and fallback paths

- `segmentationBrickAtlas`
  - new behavior
  - shader samples atlas/page-table directly
  - used for `viewerMode === 'slice'` when `layer.isSegmentation === true` and `brickAtlas?.enabled`

The `VolumeResources` object should continue to represent a single layer resource. For segmentation GPU Slice mode, its texture fields should reflect atlas/page-table resources rather than a CPU RGBA slice texture.

## Source Selection

In `useVolumeResources.ts`, when resolving `viewerMode === 'slice'`:

Select GPU segmentation slice if all are true:

- `layer.isSegmentation === true`
- `volume === null`
- `pageTable !== null`
- `brickAtlas?.enabled === true`
- `brickAtlas.kind === 'segmentation'`
- `brickAtlas.data` is available
- required WebGL2 texture sizes are supported

Otherwise, use the existing CPU slice texture path.

Do not use GPU segmentation slice for dense intensity volumes in the first implementation.

## Shader Design

Create a new shader module, or extend `SliceRenderShader` with variants.

Recommended approach:

- keep current `SliceRenderShader` as the texture-slice shader
- add `SegmentationAtlasSliceRenderShader`

Rationale:

The current shader expects `u_slice` as a precomputed 2D texture. The new shader needs page-table and atlas bindings. Separate shaders reduce conditional complexity and make tests clearer.

## Shader Inputs

The segmentation atlas slice shader needs:

- volume dimensions
  - `u_size`
  - or equivalent vec3/ivec3 dimensions

- slice index
  - `u_sliceIndex`

- brick metadata/page-table inputs
  - reuse existing page-table uniform/texture bindings from 3D path where possible
  - atlas index texture
  - chunk shape/grid shape/volume shape
  - optional subcell metadata if the current atlas representation requires it

- segmentation atlas data
  - the packed label atlas texture
  - same byte packing assumptions as 3D segmentation

- color inputs
  - segmentation palette texture if used
  - segmentation color seed bytes or equivalent hash seed

- display inputs
  - `u_windowMin`, `u_windowMax` if still part of generic material contract
  - `u_invert` should remain ignored or no-op for segmentation, matching current behavior
  - `u_additive` if additive blending changes alpha/composition behavior

## Fragment Shader Behavior

For each fragment:

1. Map UV to voxel coordinates:
   - `x = floor(v_uv.x * width)`
   - `y = floor(v_uv.y * height)`
   - `z = clamp(u_sliceIndex, 0, depth - 1)`

2. Sample sparse segmentation label:
   - compute brick coordinate from voxel coordinate and chunk shape
   - read brick atlas index from page table
   - if missing, label is `0`
   - compute local brick coordinate
   - compute atlas voxel coordinate from atlas slot grid
   - decode label bytes

3. Colorize label:
   - label `0` must produce transparent background, matching current CPU path
   - nonzero labels must match current segmentation coloring
   - prefer reusing shader code from existing 3D segmentation rendering

4. Output RGBA:
   - preserve existing blending behavior
   - preserve channel opacity behavior, if any is encoded in palette alpha

## Reuse Existing 3D Shader Logic

Before writing new shader logic, inspect:

- `src/shaders/volumeRenderShader.ts`
- page-table sampling helpers embedded in the shader
- label decode logic
- segmentation color hash/palette logic

If helper code is currently duplicated inside shader strings, extract shared GLSL snippets into a local shader helper module. Avoid copy-pasting divergent label decode code.

The final state should make it difficult for 3D segmentation and 2D segmentation to disagree about:

- brick lookup
- missing brick behavior
- packed label decoding
- label color hash
- palette sampling

## Resource Lifecycle

In `useVolumeResources.ts`, the `viewerMode === 'slice'` branch currently creates a `THREE.DataTexture` from CPU RGBA data.

For GPU segmentation slice:

- create a plane mesh just like current Slice mode
- create a shader material using the new segmentation atlas slice shader
- do not allocate `resources.sliceBuffer`
- do not create/update a CPU `DataTexture` for the slice
- bind brick atlas/page-table textures through existing helpers
- update `u_sliceIndex` when z changes
- update layer offset/visibility/blending as current Slice mode does

The resource should rebuild only when necessary:

- source mode changes
- dimensions change
- atlas/page-table identity changes in a way existing helpers cannot update in place
- render style/mode changes
- shader variant changes

The resource should not rebuild merely because:

- z slice changes
- camera projection changes
- 2D view stays active
- hover state changes

For z changes, only update `u_sliceIndex`.

## Existing Helper Integration

Investigate and reuse these where possible:

- `applyBrickPageTableUniforms(...)`
- texture creation helpers for atlas data
- segmentation palette texture creation
- `createSegmentationSeed(...)`
- render-order and blending utilities
- existing slice plane geometry setup

If existing helpers assume a 3D volume material, refactor them into source-agnostic helpers rather than duplicating.

## Editable Segmentation Integration

Editable segmentation already produces a `VolumeBrickAtlas` through:

- `buildEditableSegmentationBrickAtlas(...)`

Do not change editable data structures for the first implementation.

When an edit changes the atlas:

- `useAnnotate` should continue to update `editableLayerBrickAtlases`
- `VolumeViewer` should receive the new atlas object
- resource update should refresh atlas/page-table bindings
- slice shader should immediately sample new labels

No new editable-specific rendering path should be added.

## CPU Fallback Rules

The old path remains valid fallback when:

- the source is a dense volume
- atlas metadata is incomplete
- WebGL limits prevent required texture allocation
- a test explicitly needs CPU reference output

Add a clear internal predicate for source-mode selection. Avoid scattering fallback decisions across the slice branch.

Suggested predicate shape:

```ts
type SliceSourceMode = 'texture' | 'segmentation-atlas';

function resolveSliceSourceMode(args: {
  layer: ViewerLayer;
  volume: NormalizedVolume | null;
  pageTable: VolumeBrickPageTable | null;
  brickAtlas: VolumeBrickAtlas | null;
  capabilities: { webgl2: boolean; maxTextureSize: number; max3DTextureSize: number };
}): SliceSourceMode;
```

## Tests Required Before Implementation Is Considered Complete

At minimum:

- unit tests for source-mode selection
- shader tests verifying the segmentation atlas slice shader includes required uniforms and decode logic
- render-resource tests proving atlas-backed segmentation Slice mode does not call CPU slice preparation
- visual or pixel tests comparing CPU reference output to GPU output
- editable segmentation regression test proving Slice mode reflects edits
- top-menu 2D lock regression remains passing

See `TEST_PLAN.md`.

## Performance Validation

Add or update a benchmark that measures:

- entering 2D view with one segmentation channel visible
- changing z slice with one segmentation channel visible
- changing z slice with multiple segmentation channels visible
- editing an editable segmentation channel while in 2D view

Evidence should show:

- no per-frame full CPU slice flattening for segmentation
- z changes do not scale with `width * height` on CPU
- texture uploads are limited to atlas/page-table updates, not full RGBA slice uploads

## Rollout Strategy

Recommended sequence:

1. Add source-mode predicate and tests.
2. Add shader module and shader string tests.
3. Build GPU segmentation slice material using existing atlas/page-table bindings.
4. Keep CPU path as fallback.
5. Add correctness tests comparing CPU reference to GPU output.
6. Add editable segmentation update test.
7. Add performance evidence.
8. Only then consider deleting or narrowing the CPU atlas slice path.

