# Test Plan

## Unit Tests

### Source-Mode Selection

Add tests for a pure source-mode resolver.

Cases:

- dense intensity volume -> `texture`
- atlas-backed regular segmentation with complete metadata -> `segmentation-atlas`
- editable segmentation with complete metadata -> `segmentation-atlas`
- segmentation with disabled/missing atlas -> `texture`
- segmentation with missing page table -> `texture`
- unsupported WebGL capability or texture size -> `texture`

Suggested location:

- `tests/volume-viewer/segmentationSliceSourceMode.test.ts`

### Shader Contract Tests

Add tests that inspect the new shader module.

Assert the shader exposes or contains:

- `u_sliceIndex`
- volume/atlas/page-table uniforms
- segmentation atlas sampler
- label decode logic
- palette/hash color logic
- transparent handling for label `0`

Suggested location:

- `tests/sliceRenderShader.test.ts`
- or `tests/segmentationAtlasSliceShader.test.ts`

### CPU Reference Comparison

Use `prepareSliceTextureFromBrickAtlas(...)` as the reference while the CPU fallback still exists.

Create a small synthetic segmentation atlas with:

- empty bricks
- one occupied brick
- labels requiring 1-byte, 2-byte, and 3-byte decode if supported
- labels on brick boundaries
- labels on slice boundaries

Compare GPU-rendered pixels to CPU reference.

Suggested test levels:

- shader math/unit test if a GPU harness exists
- Playwright canvas pixel test if shader output must be validated in browser

## Resource Lifecycle Tests

Add tests around `useVolumeResources` or extracted resource builders.

Required assertions:

- atlas-backed segmentation Slice mode does not call `prepareSliceTextureFromBrickAtlas(...)`
- z slice changes update `u_sliceIndex` without rebuilding the material
- atlas object changes update atlas/page-table bindings
- dense intensity Slice mode still uses existing texture path
- fallback path still works when atlas is unavailable

If direct spying is difficult due module imports, extract the source-mode and slice-resource build decisions into testable helpers first.

## Editable Segmentation Tests

Add coverage for:

- create editable segmentation channel
- draw/edit a label
- force Slice mode
- verify GPU slice output reflects the new label
- change z slice and verify the label appears only on the correct slice

Existing useful files:

- `tests/useAnnotate.test.ts`
- `tests/AnnotateWindow.test.tsx`
- e2e helpers in `tests/e2e/helpers`

## UI Regression Tests

Keep existing tests passing:

- `tests/viewer-shell/ChannelsPanel.test.tsx`
- `tests/viewer-shell/TopMenu.test.tsx`
- `tests/viewer-shell/ViewerShell2dLayerModes.test.ts`

Add a specific assertion if needed:

- pressing 2D view still locks regular and editable segmentation channels to Slice mode
- the new GPU slice path is selected after the lock

## E2E Smoke Tests

Add or extend a Playwright smoke test that opens a dataset with segmentation visible, enters 2D view, and verifies:

- canvas is nonblank
- segmentation colors are visible
- z slider changes visible slice
- no console errors

Candidate files:

- `tests/e2e/projection-mode-smoke.spec.ts`
- `tests/e2e/multi-channel-segmentation-nightly.spec.ts`
- a new targeted smoke spec if existing ones are too broad

## Performance Tests

Add a benchmark or diagnostic test that measures:

- 2D view toggle latency with segmentation visible
- z slider update latency with segmentation visible
- editable segmentation brush update latency in 2D view

Expected result:

- CPU time in `prepareSliceTextureFromBrickAtlas(...)` disappears from the hot path for atlas-backed segmentation
- z slider updates are dominated by uniform updates and GPU draw, not CPU texture generation

## Required Commands

Run at minimum:

```bash
npm run typecheck
npm run typecheck:tests
npm test -- tests/viewer-shell/ViewerShell2dLayerModes.test.ts tests/viewer-shell/ChannelsPanel.test.tsx tests/sliceRenderShader.test.ts
```

Also run any new targeted tests added for this program.

Before merging a complete implementation, run the broader verification set used by the repo owner when feasible:

```bash
npm run verify:fast
```

