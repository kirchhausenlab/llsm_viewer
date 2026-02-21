# Feasibility Report

Date: **2026-02-21**

## Executive verdict

Adding orthographic mode is feasible with moderate/high implementation scope. Core render architecture supports the change, but perspective assumptions are currently embedded in camera typing, raymarch ray setup, and interaction systems.

Verdict: **Proceed with staged rollout**.

## Why this is feasible

- The renderer already uses a centralized render context and lifecycle flow.
- Raymarch logic is centralized in `volumeRenderShader.ts`.
- Orthographic support can be layered through projection-aware camera/ray abstraction rather than full rewrite.

## Scope concentration vs spread

- Concentrated:
  - Camera creation/context and render loop plumbing.
  - Raymarch shader ray-generation block.
- Spread:
  - Interaction subsystems (pointer, hover, slicing, track-follow helpers).
  - Resource heuristics that use perspective-only FOV/distance logic.

## Perspective assumptions found (high impact)

- Render context camera type/construction:
  - `src/hooks/useVolumeRenderSetup.ts`
- Controls and resize path (`aspect`, `fov`, movement behavior):
  - `src/components/viewers/volume-viewer/useCameraControls.ts`
- Camera-distance fit logic using `boundingRadius / sin(fov/2)`:
  - `src/components/viewers/volume-viewer/useVolumeResources.ts`
- Shader ray setup using camera position to fragment direction:
  - `src/shaders/volumeRenderShader.ts`
- Pointer/hover raycasting paths:
  - `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
  - `src/components/viewers/volume-viewer/useVolumeHover.ts`
- Track camera presenter expectation of perspective camera:
  - `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx`

## Subsystem effort estimates

- Render context + lifecycle: **Medium**
- Shader ray-generation + uniforms: **Medium**
- Controls + pointer/hover/slicing interactions: **Large**
- Resource/LOD/residency tuning: **Medium**
- VR integration (orthographic disabled path): **Small to medium**
- Tests (new dual-projection coverage): **Medium**

## Compatibility summary

- Directly impacted and rework required:
  - Raymarching entry/exit ray setup
  - Slicing and clipping behavior
  - Hover/picking/measurement rays
  - Camera control semantics and fit/reset
- Mostly unaffected (assuming pick/ray outputs remain correct):
  - DOM overlays, labels/tooltips layout
  - Canvas recording/screenshot pipeline
- Intentionally unavailable in orthographic:
  - VR rendering path

Full matrix: `COMPATIBILITY_MATRIX.md`.

## Performance expectations

Expected behavior (to be measured):

- Orthographic should produce more uniform per-pixel ray travel lengths.
- Perspective can have larger variance in step count due to oblique rays.
- Net frame-time impact is scene- and orientation-dependent.
- Biggest risk is not shader branch cost; it is camera-distance/LOD heuristics currently tuned to perspective FOV distance.

Measurement and thresholds: `PERF_PLAN.md`.

## Major risks

- Silent perspective regressions while introducing abstraction.
- Interaction drift (hover/picking/slicing mismatch between projections).
- Incorrect near/far/fit behavior causing clipping or low sample quality.
- Resource scheduler using camera-position heuristics that underperform in orthographic views.

## Recommended rollout

1. Add projection abstraction and keep perspective untouched by default.
2. Land dual-path ray generation in shader and uniform updates.
3. Migrate interaction rays to shared projection-aware helpers.
4. Retune resource heuristics and validate performance.
5. Gate VR behavior explicitly and lock tests.

## Go/no-go criteria

Proceed if:

- Perspective parity is verified by tests and manual checks.
- Orthographic mode is stable for agreed feature set.
- Performance is within defined thresholds in `PERF_PLAN.md`.

Pause if:

- Perspective baseline regresses and cannot be isolated quickly.
- Interaction correctness remains inconsistent after helper unification.
