# GPU Segmentation Slice Rendering

Status: **Planned**
Created: **2026-04-28**

This folder is the source of truth for fixing slow 2D Slice mode when regular or editable segmentation channels are visible.

## Problem

Segmentation Slice mode currently flattens atlas-backed segmentation into a full RGBA 2D texture on the CPU. For every relevant resource update, the viewer walks each pixel in the slice, performs brick/page-table lookup, decodes the label, colorizes it, and uploads a new `DataTexture`.

That makes 2D view slow on segmentation-heavy datasets even though the 3D segmentation path can sample sparse brick atlases on the GPU.

Editable segmentation can be even more noticeable because edits can also rebuild the editable packed atlas before the CPU slice extraction runs.

## Objective

Replace CPU flattening for atlas-backed segmentation Slice mode with a GPU slice shader that samples the existing sparse segmentation brick atlas/page table directly.

The target behavior:

- 2D Slice mode remains visually and interactively equivalent.
- Regular sparse segmentation channels use GPU sampling in Slice mode.
- Editable segmentation channels use GPU sampling in Slice mode.
- 3D segmentation rendering is unchanged.
- Dense intensity Slice mode can remain on the existing path unless later migrated intentionally.
- Annotation, export, hover, channel settings, top-menu 2D locking, and saved editable data behavior are unchanged.

## Non-Negotiable Constraints

1. Do not expand sparse segmentation into a dense full-volume label texture.
2. Do not change segmentation label semantics, color generation, alpha handling, or visibility behavior.
3. Do not change 3D rendering behavior.
4. Do not change preprocessing, storage, manifest schema, or save/export formats.
5. Do not introduce WebGPU as a requirement.
6. Keep the implementation on the current Three.js/WebGL2 stack.
7. Preserve CPU slice rendering for unsupported source types until the GPU path is verified.
8. Add regression coverage before removing or bypassing the old segmentation CPU path.

## Read Order

1. `CURRENT_STATE.md`
2. `DECISIONS.md`
3. `IMPLEMENTATION_SPEC.md`
4. `TEST_PLAN.md`
5. `BACKLOG.md`
6. `RISK_REGISTER.md`
7. `SESSION_PROMPT.md`

## Definition Of Done

This program is done only when:

- regular sparse segmentation Slice mode no longer calls `prepareSliceTextureFromBrickAtlas`
- editable segmentation Slice mode no longer calls `prepareSliceTextureFromBrickAtlas`
- visual output matches the old CPU path on representative labels, empty space, bounds, offsets, and z slices
- Slice mode remains locked by 2D view exactly as today
- hover and annotation continue to report/edit correct voxel labels
- 3D segmentation tests continue to pass
- targeted performance evidence shows the CPU slice-generation hot spot is removed or negligible
- all required tests in `TEST_PLAN.md` pass

