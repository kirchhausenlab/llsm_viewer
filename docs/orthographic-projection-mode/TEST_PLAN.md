# Test Plan

This plan defines mandatory verification for orthographic projection delivery.

## Release-blocking rules

1. Perspective correctness regressions are blockers.
2. Perspective performance regressions are blockers.
3. Orthographic correctness regressions are blockers.
4. Orthographic performance problems are blockers if they violate the benchmark matrix acceptance criteria.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. Run all directly relevant unit/integration tests for touched files.

If UI or viewer-shell state is touched, also run:

1. `npm run -s test:frontend`

If volume rendering, hover, camera controls, or interaction code is touched, also run the relevant targeted suites, expected to include combinations of:

1. `npm run -s test -- tests/useCameraControls.test.ts`
2. `npm run -s test -- tests/useVolumeViewerInteractions.test.ts`
3. `npm run -s test -- tests/useVolumeViewerFollowTarget.test.ts`
4. `npm run -s test -- tests/volumeHoverSampling.test.ts tests/volumeHoverTargetLayer.test.ts tests/volumeHoverDimensions.test.ts`
5. `npm run -s test -- tests/useVolumeResources.test.ts tests/volumeRenderShaderLodModel.test.ts tests/volumeRenderShaderSkipModel.test.ts`
6. `npm run -s test -- tests/viewer-shell/ViewerSettingsWindow.test.tsx tests/viewer-shell/TopMenu.test.tsx tests/viewer-shell/NavigationHelpWindow.test.tsx`

If end-to-end interaction changes land, also run:

1. `npm run -s test:e2e`

If perf-critical viewer/render code changes land, also run:

1. `npm run -s test:perf`
2. any additional benchmark commands required by `BENCHMARK_MATRIX.md`

## Required new or updated coverage

### A. Projection state and UI contract

- Projection mode defaults are explicit and deterministic.
- Render settings UI exposes `Perspective` and `Orthographic`.
- VR-active state prevents unsupported orthographic switching.

### B. Camera lifecycle and switching

- Viewer can initialize in either projection mode.
- Switching projection mode preserves:
  - target
  - orientation
  - sane framing
- Reset view restores the current mode’s saved/default state.
- Resize behavior remains correct in both modes.

### C. Perspective protection

- Perspective mode visual expectations remain unchanged in baseline scenarios.
- Perspective interaction semantics remain unchanged in baseline scenarios.
- Perspective benchmark scenarios remain within the allowed regression envelope.

### D. Orthographic rendering correctness

Mandatory render-style matrix:

1. `Orthographic + MIP + linear`
2. `Orthographic + MIP + nearest`
3. `Orthographic + ISO + linear`
4. `Orthographic + ISO + nearest`
5. `Orthographic + BL + linear`
6. `Orthographic + BL + nearest`

For each case verify:

- the ray-marched volume is visible and stable
- zoom changes behave as expected
- clipping/front-face behavior remains correct
- hover/highlight remains spatially correct

### E. Interaction parity

Verify for both desktop projection modes:

- voxel hover
- track picking
- ROI preview and selection
- world prop selection and dragging
- track follow
- voxel follow
- playback during active navigation

### F. Policy correctness

- Perspective adaptive LOD remains stable and non-regressed.
- Orthographic adaptive LOD responds to zoom/magnification changes.
- Projection switching does not leave stale policy state behind.

### G. Residency/perf behavior

- Orthographic close-up views do not produce obviously pathological residency churn.
- Perspective residency metrics remain within baseline expectations.
- Orthographic behavior is acceptable under sparse and dense scenes.

## Verification evidence logging format

For every session, append to `EXECUTION_LOG.md`:

- backlog IDs worked
- commands executed
- pass/fail status
- benchmark scenarios run
- perspective regression summary
- orthographic acceptability summary
- unresolved issues with exact follow-up IDs
