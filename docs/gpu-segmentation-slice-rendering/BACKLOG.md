# Backlog

## Phase 0 - Orientation

- `GSSR-001` (`PENDING`): Read this folder and the sparse segmentation docs listed in `README.md`.
- `GSSR-002` (`PENDING`): Inspect current Slice mode resource creation/update in `useVolumeResources.ts`.
- `GSSR-003` (`PENDING`): Inspect existing 3D segmentation atlas/page-table shader logic in `volumeRenderShader.ts`.
- `GSSR-004` (`PENDING`): Identify reusable GLSL snippets and TypeScript binding helpers.

## Phase 1 - Source Mode And Contracts

- `GSSR-010` (`PENDING`): Add a pure `resolveSliceSourceMode(...)` helper.
- `GSSR-011` (`PENDING`): Add unit tests for dense, regular segmentation, editable segmentation, and fallback cases.
- `GSSR-012` (`PENDING`): Update or extend `VolumeResources` typing to distinguish texture slice vs segmentation atlas slice resources.

## Phase 2 - Shader Infrastructure

- `GSSR-020` (`PENDING`): Add `SegmentationAtlasSliceRenderShader`.
- `GSSR-021` (`PENDING`): Reuse or extract GLSL for brick lookup and packed-label decode from the 3D segmentation shader.
- `GSSR-022` (`PENDING`): Reuse or extract GLSL for segmentation label color generation.
- `GSSR-023` (`PENDING`): Add shader contract tests.

## Phase 3 - Resource Integration

- `GSSR-030` (`PENDING`): Build segmentation atlas slice material in `useVolumeResources.ts`.
- `GSSR-031` (`PENDING`): Bind page-table, atlas, palette, and color-seed uniforms.
- `GSSR-032` (`PENDING`): Ensure z changes update only `u_sliceIndex`.
- `GSSR-033` (`PENDING`): Ensure atlas object changes update bindings without unnecessary material rebuilds.
- `GSSR-034` (`PENDING`): Keep current CPU slice texture path for dense/fallback cases.

## Phase 4 - Correctness Tests

- `GSSR-040` (`PENDING`): Add CPU-reference comparison for regular segmentation slice output.
- `GSSR-041` (`PENDING`): Add editable segmentation slice output test after an edit.
- `GSSR-042` (`PENDING`): Add missing-brick/empty-space tests.
- `GSSR-043` (`PENDING`): Add label-boundary and brick-boundary tests.
- `GSSR-044` (`PENDING`): Verify 3D segmentation tests remain unchanged and passing.

## Phase 5 - Performance Evidence

- `GSSR-050` (`PENDING`): Add instrumentation or benchmark for Slice z changes with segmentation.
- `GSSR-051` (`PENDING`): Add editable segmentation 2D edit benchmark or diagnostic.
- `GSSR-052` (`PENDING`): Capture before/after evidence showing CPU slice flattening is gone.

## Phase 6 - Cleanup

- `GSSR-060` (`PENDING`): Narrow `prepareSliceTextureFromBrickAtlas(...)` to fallback/reference use only.
- `GSSR-061` (`PENDING`): Remove dead branches only after tests prove they are unreachable.
- `GSSR-062` (`PENDING`): Update this documentation with final implementation notes.

