# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

All orthographic-program backlog items are complete.

## Phase 0 - Baseline and guardrails

- `ORTHO-001` (`DONE`): document perspective baseline scenarios and metrics.
  - Evidence:
    - `docs/orthographic-projection-mode/BENCHMARK_MATRIX.md`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

- `ORTHO-002` (`DONE`): add perspective non-regression acceptance criteria to verification flow.
  - Evidence:
    - `docs/orthographic-projection-mode/TEST_PLAN.md`
    - `docs/orthographic-projection-mode/SESSION_HANDOFF.md`

## Phase 1 - Projection state and UI plumbing

- `ORTHO-010` (`DONE`): add `projectionMode` to viewer-shell mode controls and route state.
  - Evidence:
    - `src/components/viewers/viewer-shell/types.ts`
    - `src/components/viewers/viewer-shell/hooks/useViewerModeControls.ts`
    - `src/components/viewers/useViewerShellProps.ts`
    - `src/ui/app/hooks/useAppRouteState.tsx`

- `ORTHO-011` (`DONE`): expose explicit `Perspective` / `Orthographic` controls in render settings.
  - Evidence:
    - `src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx`
    - `tests/viewer-shell/ViewerSettingsWindow.test.tsx`

- `ORTHO-012` (`DONE`): add VR guard behavior for the orthographic control surface.
  - Evidence:
    - `src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx`
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `tests/viewer-shell/ViewerSettingsWindow.test.tsx`

## Phase 2 - Desktop camera/control abstraction

- `ORTHO-020` (`DONE`): generalize desktop camera types from perspective-only to a projection-aware desktop camera contract.
  - Evidence:
    - `src/hooks/useVolumeRenderSetup.ts`
    - `src/components/viewers/VolumeViewer.types.ts`
    - `tests/useVolumeRenderSetup.test.ts`

- `ORTHO-021` (`DONE`): make resize logic projection-aware.
  - Evidence:
    - `src/hooks/useVolumeRenderSetup.ts`
    - `src/components/viewers/volume-viewer/useCameraControls.ts`

- `ORTHO-022` (`DONE`): make default/preserved/reset view state projection-aware.
  - Evidence:
    - `src/components/viewers/VolumeViewer.tsx`
    - `src/components/viewers/volume-viewer/useCameraControls.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerResets.ts`

- `ORTHO-023` (`DONE`): implement runtime camera/controls switching without full viewer teardown.
  - Evidence:
    - `src/components/viewers/volume-viewer/useCameraControls.ts`
    - `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`

- `ORTHO-024` (`DONE`): implement projection-switch framing preservation.
  - Evidence:
    - `src/hooks/useVolumeRenderSetup.ts`
    - `src/components/viewers/volume-viewer/useCameraControls.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx`

## Phase 3 - Projection-aware volume rendering

- `ORTHO-030` (`DONE`): introduce projection-specific 3D shader/material variants.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/volumeRenderShaderSkipModel.test.ts`

- `ORTHO-031` (`DONE`): implement orthographic ray construction for 3D volume render styles.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderSkipModel.test.ts`

- `ORTHO-032` (`DONE`): preserve perspective-path behavior and benchmark it as non-regressed.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `docs/orthographic-projection-mode/BENCHMARK_MATRIX.md`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

- `ORTHO-033` (`DONE`): make fit-to-view projection-aware for both volume dimensions and current projection mode.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`

## Phase 4 - Interaction and overlay parity

- `ORTHO-040` (`DONE`): generalize hover/picking systems to non-perspective desktop cameras.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeHover.ts`
    - `src/components/viewers/volume-viewer/trackHitTesting.ts`
    - `src/components/viewers/volume-viewer/roiHitTesting.ts`
    - `tests/useVolumeViewerInteractions.test.ts`

- `ORTHO-041` (`DONE`): generalize ROI preview/edit math to projection-aware cameras.
  - Evidence:
    - `src/components/viewers/volume-viewer/useRoiRendering.ts`
    - `tests/roiGeometry.test.ts`
    - `tests/roiRenderResource.test.ts`

- `ORTHO-042` (`DONE`): generalize world-prop hit testing and drag behavior.
  - Evidence:
    - `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
    - `tests/volume-viewer/ViewerPropsOverlay.test.tsx`

- `ORTHO-043` (`DONE`): preserve follow-target semantics for both projection modes.
  - Evidence:
    - `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx`
    - `src/components/viewers/volume-viewer/useVolumeViewerFollowTarget.ts`
    - `tests/useVolumeViewerFollowTarget.test.ts`

- `ORTHO-044` (`DONE`): update navigation help and any user-facing projection descriptions.
  - Evidence:
    - `src/components/viewers/viewer-shell/NavigationHelpWindow.tsx`
    - `tests/viewer-shell/NavigationHelpWindow.test.tsx`

## Phase 5 - Projection-aware policy and performance

- `ORTHO-050` (`DONE`): replace distance-only camera sampling with a projection-aware screen-coverage metric.
  - Evidence:
    - `src/hooks/useVolumeRenderSetup.ts`
    - `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `tests/volumeViewerRenderLoop.test.ts`

- `ORTHO-051` (`DONE`): update adaptive LOD policy to use projection-aware coverage instead of distance-only heuristics.
  - Evidence:
    - `src/ui/app/volume-loading/lodPolicyController.ts`
    - `src/ui/app/volume-loading/types.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

- `ORTHO-052` (`DONE`): benchmark GPU residency behavior under orthographic zoom and tune if required.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `docs/orthographic-projection-mode/BENCHMARK_MATRIX.md`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

- `ORTHO-053` (`DONE`): verify shader adaptive-LOD behavior remains correct under orthographic projection.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`
    - `tests/volumeRenderShaderSkipModel.test.ts`

## Phase 6 - Hardening and closure

- `ORTHO-060` (`DONE`): add targeted unit/integration coverage for projection switching and state preservation.
  - Evidence:
    - `tests/useVolumeRenderSetup.test.ts`
    - `tests/useCameraControls.test.ts`
    - `tests/volumeViewerRenderLoop.test.ts`
    - `tests/useVolumeResources.test.ts`
    - `tests/volumeRenderShaderSkipModel.test.ts`

- `ORTHO-061` (`DONE`): add end-to-end smoke coverage for switching, interaction, and playback in both modes.
  - Evidence:
    - `tests/e2e/projection-mode-smoke.spec.ts`
    - `tests/e2e/channels-smoke.spec.ts`
    - `tests/e2e/helpers/workflows.ts`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

- `ORTHO-062` (`DONE`): run full benchmark matrix and document perspective non-regression plus orthographic acceptability.
  - Evidence:
    - `docs/orthographic-projection-mode/BENCHMARK_MATRIX.md`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

- `ORTHO-063` (`DONE`): closure pass and documentation finalization.
  - Evidence:
    - `docs/orthographic-projection-mode/README.md`
    - `docs/orthographic-projection-mode/ROADMAP.md`
    - `docs/orthographic-projection-mode/SESSION_HANDOFF.md`
    - `docs/orthographic-projection-mode/EXECUTION_LOG.md`

## High-contention files (historical)

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/ui/app/volume-loading/lodPolicyController.ts`
