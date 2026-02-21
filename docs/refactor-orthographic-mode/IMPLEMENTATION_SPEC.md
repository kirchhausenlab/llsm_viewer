# Implementation Spec

This spec defines target architecture and likely touchpoints for orthographic mode.

## 1) Current-state summary

Current rendering stack is perspective-centric:

- Render context creates and types camera as perspective.
- Shader ray setup assumes ray origin is camera position.
- Controls and resize logic use perspective-specific properties (`fov`, `aspect`).
- Pointer/hover/slice interactions repeatedly derive rays from perspective assumptions.
- Camera fit/reset logic uses FOV geometry.

Primary code areas:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx`
- `src/shaders/volumeRenderShader.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`

## 2) Target state

- Projection mode state: `perspective | orthographic`.
- Render context exposes camera via projection-aware abstraction.
- Shader accepts projection mode and camera basis/ray data needed for orthographic path.
- Interaction systems use shared ray helper compatible with both camera types.
- VR path is guarded to perspective-only.

## 3) Projection model and camera abstraction

Recommended additions:

- Add `projectionMode` to viewer state/props and render context.
- Update `VolumeRenderContext` camera typing to support both camera classes.
- Introduce projection helpers (examples):
  - `isPerspectiveCamera(camera)`
  - `applyResize(camera, width, height, mode)`
  - `fitCameraToVolume(camera, bounds, mode)`
  - `buildPointerRay(raycaster, pointer, camera)`

Design constraint:

- Keep perspective default code path behavior identical unless projection mode is orthographic.

## 4) Shader and uniform changes

Current perspective ray generation should be preserved as one branch.

Add orthographic support by providing enough data to derive:

- Parallel ray direction from camera forward vector.
- Per-fragment ray origin from near/far plane varyings (or equivalent camera-plane data).

Potential uniform additions:

- `u_projectionMode`
- `u_cameraForward`
- `u_cameraRight`
- `u_cameraUp`

Potential usage:

- Perspective:
  - keep current `rayOrigin = cameraPos` path.
- Orthographic:
  - `rayDir = normalize(nearPos - farPos)` (or camera forward in local space)
  - `rayOrigin` projected from near/far varying for current fragment.

Important:

- Step-size and early-exit behavior must be revalidated after ray setup changes.

## 5) Camera controls and fit/reset behavior

Perspective behavior to preserve:

- Existing orbit/move semantics.
- Existing target/follow behavior.

Orthographic behavior to add:

- Resize updates orthographic frustum extents or zoom scaling.
- Reset/fit uses volume bounds projected into orthographic camera extents.
- No FOV-derived fit math in orthographic path.

## 6) Interaction and picking changes

Create shared projection-aware ray helper and migrate callers:

- Pointer lifecycle (slice plane interactions).
- Hover intensity/position sampling.
- Track hit testing and camera follow helpers.

Required guarantee:

- Same pointer target semantics in both projection modes (within tolerance).

## 7) Resource management and tuning

Review for projection-sensitive logic:

- Camera-distance based scheduling or residency prioritization.
- Any FOV-derived camera offset assumptions.
- Sample scale (`volumeStepScaleRef`) behavior under orthographic rays.

Add instrumentation to compare:

- ray travel distance distributions
- average step counts
- early-exit rates

## 8) VR behavior

- Keep VR and XR code path perspective-only.
- If orthographic is active when VR starts:
  - either force perspective before session start, or
  - block VR start with explicit reason.
- Document final UX in `DECISIONS.md` if changed.

## 9) Rollout sequencing

1. Projection state + context abstraction.
2. Shader dual-path rays and uniforms.
3. Interaction helper migration.
4. Resource/fit tuning.
5. VR guard and UI polish.
6. Full tests and performance signoff.

## 10) Acceptance criteria

- Perspective mode: no behavior regressions from baseline checks.
- Orthographic mode: compatible feature set works from `COMPATIBILITY_MATRIX.md`.
- Required tests in `TEST_PLAN.md` pass.
