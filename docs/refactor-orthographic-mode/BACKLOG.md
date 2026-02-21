# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Phase 0: Baseline capture and guards

- `ORTHO-001` (`DONE`): capture perspective baseline behavior and performance snapshot.
  - Evidence:
    - `npm run -s typecheck`
    - `npm run -s typecheck:tests`
    - `npm run -s test`
- `ORTHO-002` (`DONE`): add temporary projection-mode diagnostics hooks for debugging.
  - Evidence:
    - `src/components/viewers/VolumeViewer.tsx`

## Phase 1: Projection state and camera abstraction

- `ORTHO-010` (`DONE`): add viewer-level `projectionMode` state and toggle plumbing.
  - Evidence:
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `src/components/viewers/viewer-shell/types.ts`
    - `src/components/viewers/viewer-shell/hooks/useViewerModeControls.ts`
    - `src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx`
    - `src/components/viewers/useViewerShellProps.ts`
- `ORTHO-011` (`DONE`): refactor `VolumeRenderContext` to support both perspective and orthographic cameras.
  - Evidence:
    - `src/hooks/useVolumeRenderSetup.ts`
    - `src/components/viewers/volume-viewer/cameraTypes.ts`
    - `src/types/projection.ts`
- `ORTHO-012` (`DONE`): ensure render loop/lifecycle operate on projection-agnostic camera abstraction.
  - Evidence:
    - `src/components/viewers/volume-viewer/useCameraControls.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
    - `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
    - `src/components/viewers/volume-viewer/volumeViewerRuntimeArgs.ts`

## Phase 2: Shader dual-path ray generation

- `ORTHO-020` (`DONE`): add projection-aware shader uniforms and mode switch.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `ORTHO-021` (`DONE`): implement orthographic ray origin/direction path using near/far plane data.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
- `ORTHO-022` (`DONE`): preserve perspective visual parity after shader changes.
  - Evidence:
    - `npm run -s test`
    - `tests/useVolumeResources.test.ts`

## Phase 3: Interaction and controls parity

- `ORTHO-030` (`DONE`): build projection-agnostic pointer ray path.
  - Evidence:
    - `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
    - `src/components/viewers/volume-viewer/useVolumeHover.ts`
    - `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `ORTHO-031` (`DONE`): migrate hover/picking/measurement flows to projection-safe camera typing.
  - Evidence:
    - `src/components/viewers/volume-viewer/useTrackRendering.ts`
    - `src/components/viewers/volume-viewer/useVolumeHover.ts`
    - `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `ORTHO-032` (`DONE`): update camera controls for orthographic resize/fit/reset behavior.
  - Evidence:
    - `src/components/viewers/volume-viewer/useCameraControls.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerResets.ts`
- `ORTHO-033` (`DONE`): validate slice and clipping behavior under orthographic rays.
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
    - `tests/volumeViewerPointerLifecycle.test.ts`

## Phase 4: Resource tuning and performance

- `ORTHO-040` (`DONE`): remove perspective-only fit-distance logic from orthographic path.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `ORTHO-041` (`DONE`): validate residency/LOD heuristics with orthographic camera behavior.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`
- `ORTHO-042` (`DONE`): run performance matrix from `PERF_PLAN.md` and record results.
  - Evidence:
    - `npm run -s test` (includes `tests/perf/**/*.test.ts`)

## Phase 5: VR guard and UI completion

- `ORTHO-050` (`DONE`): implement deterministic VR guard behavior when orthographic mode is active.
  - Evidence:
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `src/components/viewers/VolumeViewer.tsx`
- `ORTHO-051` (`DONE`): finalize projection toggle UI and user-facing messaging.
  - Evidence:
    - `src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx`
    - `tests/viewer-shell/PlaybackControlsPanel.test.tsx`

## Phase 6: Tests and hardening

- `ORTHO-060` (`DONE`): add/expand unit tests for projection abstraction and camera behavior.
  - Evidence:
    - `tests/useVolumeResources.test.ts`
    - `tests/ViewerShellContainer.test.ts`
- `ORTHO-061` (`DONE`): add/expand interaction parity tests (hover/picking/slicing).
  - Evidence:
    - `tests/volumeViewerPointerLifecycle.test.ts`
    - `tests/useTrackRendering.test.ts`
    - `tests/useVolumeResources.test.ts`
- `ORTHO-062` (`DONE`): add regression tests for perspective non-regression in key paths.
  - Evidence:
    - `npm run -s test`
- `ORTHO-063` (`DONE`): run required verification gate from `TEST_PLAN.md`.
  - Evidence:
    - `npm run -s typecheck`
    - `npm run -s typecheck:tests`
    - `npm run -s test`

## Phase 7: Closure

- `ORTHO-070` (`DONE`): update all refactor docs to final status and capture unresolved follow-ups.
- `ORTHO-071` (`DONE`): produce final compatibility and performance signoff summary.

## Current blockers

- None.
