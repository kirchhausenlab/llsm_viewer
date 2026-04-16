# Implementation Spec

This spec defines the target architecture for desktop orthographic projection support.

## 1) Current-state diagnosis

### 1.1 Camera creation is hard-coded to perspective

Current render-context creation always builds a `THREE.PerspectiveCamera`.

Primary touchpoint:

- `src/hooks/useVolumeRenderSetup.ts`

Notable consequences:

- Render lifecycle assumes one perspective camera instance.
- The current viewer state surface has no projection-mode concept.

### 1.2 A large portion of the viewer type surface is perspective-typed

Many hooks and utility contracts use `THREE.PerspectiveCamera` explicitly:

- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVr.types.ts`

This is mostly a type-contract problem, not necessarily a runtime math problem, because many of these call sites rely only on:

- `camera.quaternion`
- `camera.position`
- `camera.getWorldDirection(...)`
- `raycaster.setFromCamera(...)`

### 1.3 View persistence stores only position and target

Current reset/preserved view state stores:

- `position`
- `target`

but not:

- perspective distance semantics
- orthographic zoom
- projection mode

Primary touchpoints:

- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerResets.ts`

### 1.4 Initial framing is perspective-specific

The default fit-to-view logic derives camera distance from `camera.fov`.

Primary touchpoint:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`

This logic is invalid for orthographic framing and must become projection-aware.

### 1.5 The 3D volume shader currently assumes perspective ray construction

The 3D shader:

- uploads local camera position via `u_cameraPos`
- derives the ray direction from `v_position - u_cameraPos`

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`

This is the most important rendering-specific change required for orthographic mode.

### 1.6 App-level LOD policy is distance-only today

Adaptive scale selection currently converts a camera-distance sample into a projected-pixels proxy.

Primary touchpoints:

- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/ui/app/volume-loading/lodPolicyController.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`

This works for perspective mode, but not for orthographic zoom where projected footprint changes even if distance does not.

### 1.7 GPU brick residency prioritization is camera-position centric

Brick residency ordering uses camera position as a priority source.

Primary touchpoint:

- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`

That may remain acceptable for early orthographic delivery, but it must be benchmarked rather than assumed.

### 1.8 Hover/picking/ROI math is closer to camera-agnostic

The following systems already use `Raycaster.setFromCamera(...)` and local-ray intersection:

- voxel hover
- track hover
- ROI preview
- prop dragging

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`

This makes them strong candidates for low-risk camera-type generalization.

### 1.9 VR is explicitly perspective-based

The VR bridge, HUD placement, and related session types are all perspective-typed.

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeViewerVr.types.ts`
- `src/components/viewers/volume-viewer/vr/hudPlacement.ts`
- `node_modules/three/src/renderers/webxr/WebXRManager.js`

Therefore VR support is locked to perspective in this program.

## 2) Target architecture

## 2.1 New top-level state contract

Introduce:

- `ViewerProjectionMode = 'perspective' | 'orthographic'`

Thread it through:

- app route state
- viewer-shell mode controls
- render settings UI
- volume viewer props

Primary touchpoints:

- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/components/viewers/viewer-shell/types.ts`
- `src/components/viewers/viewer-shell/hooks/useViewerModeControls.ts`
- `src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx`
- `src/components/viewers/useViewerShellProps.ts`
- `src/components/viewers/VolumeViewer.types.ts`

## 2.2 Desktop camera abstraction

Define a desktop camera union for non-VR paths, e.g.:

- `DesktopViewerCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera`

Use `THREE.Camera` only where the call site truly does not depend on perspective-only fields.

Use the union where code still needs projection-specific narrowing for:

- `fov`
- `aspect`
- `zoom`
- ortho frustum bounds

## 2.3 Camera/controls swap strategy

The preferred design is:

1. Keep the existing renderer and scene alive.
2. Introduce a dedicated projection-switch routine that replaces only:
   - camera
   - orbit controls
3. Preserve existing:
   - volume resources
   - track resources
   - ROI resources
   - capture target
   - hover system state where possible
4. Update refs and loop bindings without forcing a full viewer teardown.

Why this is preferred:

- It avoids unnecessary volume-resource churn on toggle.
- It reduces the chance of visible flicker or reload pauses.
- It keeps the user-facing “switch any time” requirement credible.

Implementation implication:

- `useVolumeViewerLifecycle` and the render loop should stop assuming that camera/controls are immutable after initial mount.

## 2.4 Projection-specific view state

Replace the current position/target-only view state with a projection-aware structure.

Recommended model:

- common fields:
  - `projectionMode`
  - `position`
  - `target`
  - `up`
- perspective fields:
  - `distanceToTarget`
  - optional `fov`
- orthographic fields:
  - `zoom`
  - frustum-height or framing scalar

Maintain separate saved/default state for:

- last perspective desktop view
- last orthographic desktop view

This is required for:

- reset view
- mode toggle restoration
- preserving follow/orbit behavior across switches

## 2.5 Projection switching semantics

Switching from perspective to orthographic should:

1. Keep the same orbit target.
2. Keep camera orientation.
3. Estimate orthographic zoom so the scene footprint near the target appears approximately unchanged.

Switching from orthographic to perspective should:

1. Keep the same orbit target.
2. Keep camera orientation.
3. Estimate a perspective camera distance that yields similar framing.

If exact equivalence is not practical, preserve:

- target
- orientation
- rough screen coverage

and never preserve by simply resetting to a default camera.

## 3) UI contract

## 3.1 Control location

Expose projection mode in the existing render/settings flow rather than as an isolated hidden debug toggle.

Recommended touchpoint:

- `ViewerSettingsWindow`

Possible UI:

- two explicit buttons:
  - `Perspective`
  - `Orthographic`

This is clearer than a single toggle because the mode names are user-facing concepts.

## 3.2 Availability rules

- Orthographic controls are enabled only for desktop 3D mode.
- Orthographic controls are disabled while VR is active.
- Slice-mode-only datasets may still expose projection controls if the 3D viewer surface is active, but the initial implementation may gate them behind `is3dModeAvailable`.

## 3.3 Reset semantics

`Reset view` must reset:

- volume transform state as today
- the current projection mode’s saved camera state

It must not silently switch the user back to perspective.

## 4) Camera/control contract

## 4.1 Resize behavior

Resize must become projection-aware:

- perspective:
  - update `camera.aspect`
- orthographic:
  - recompute left/right/top/bottom while preserving current zoom or framing scalar

## 4.2 OrbitControls behavior

`OrbitControls` already supports orthographic cameras, but the viewer’s custom movement/look code is currently perspective-biased.

Required outcomes:

- orbit remains functional in both modes
- zoom changes distance in perspective and `zoom` in orthographic
- keyboard move/look behavior remains intuitive in both modes
- orthographic motion speed must not be derived only from camera-target distance

## 4.3 Follow mode

Follow mode currently preserves a positional offset from target.

That is correct for perspective but incomplete for orthographic.

Orthographic follow must preserve:

- orientation
- target lock
- zoom

not just positional offset.

## 5) Rendering contract

## 5.1 Perspective rendering path isolation

Perspective mode must remain on a perspective-specific render path.

Recommended strategy:

- keep the current perspective ray construction intact
- add a separate orthographic projection variant
- select the shader/material variant at resource creation/update time

Do not put a hot projection branch inside the perspective fragment path unless benchmarks prove it is neutral.

## 5.2 Orthographic ray construction

The current shader already computes:

- `v_nearpos`
- `v_farpos`

These should be used by the orthographic variant.

Recommended orthographic ray model:

- `rayOrigin = nearpos`
- `rayDir = normalize(farpos - nearpos)`

Perspective variant can continue using the current local camera-position model.

## 5.3 Shader/material variant contract

Recommended variants:

- by render style:
  - `mip`
  - `mip-nearest`
  - `iso`
  - `bl`
- by projection:
  - `perspective`
  - `orthographic`

This can be modeled as either:

- render-style variants that internally include projection suffixes
- a higher-level projection selector layered over existing render-style variants

The important requirement is that perspective materials do not pay orthographic branching cost.

## 5.4 Hover/render overlay contract

Hover highlighting, segmentation overlays, and slice rendering must remain projection-correct.

Important notes:

- slice rendering is already projection-agnostic at shader level because it uses standard raster projection
- 3D hover ray mapping must remain consistent with the displayed projection

## 6) Interaction subsystem contract

## 6.1 Hover/picking/ROI/props generalization

Generalize these systems from `PerspectiveCamera` to `THREE.Camera` or the desktop camera union when they rely on:

- `raycaster.setFromCamera(...)`
- camera quaternion
- camera position

Touchpoints:

- `useVolumeHover`
- `trackHitTesting`
- `roiHitTesting`
- `useRoiRendering`
- `useViewerPropsRendering`

## 6.2 Billboard props

World props that billboard toward the camera should remain correct in orthographic mode because they rely on camera quaternion, not FOV.

This still requires verification, especially for:

- outline behavior
- drag-plane behavior
- screen-perceived scaling of scalebar props

## 7) Projection-aware quality and residency policy

## 7.1 Navigation sample contract

The current camera sample reports:

- `distanceToTarget`
- `isMoving`
- `capturedAtMs`

This is insufficient for orthographic mode.

Recommended replacement:

- preserve `distanceToTarget` for diagnostics
- add a projection-aware screen-coverage metric such as:
  - `projectedPixelsPerReferenceVoxel`
  - or a semantically equivalent normalized magnification metric

This lets the LOD policy reason correctly about orthographic zoom.

## 7.2 LOD policy

Adaptive scale selection must become projection-aware:

- perspective:
  - may continue to use distance-derived projected footprint if still accurate
- orthographic:
  - must derive projected coverage from zoom/frustum world size, not distance

Perspective behavior should remain as close as possible to the current implementation.

## 7.3 GPU residency

Initial expectation:

- camera-position-based brick prioritization may still be usable
- but it is not sufficient to assume good orthographic behavior without evidence

Required program rule:

- benchmark orthographic residency behavior explicitly
- if center-biased zoom or orthographic close-up views show poor residency selection, add a projection-aware priority term

Examples of candidate orthographic priority signals:

- distance to current orbit target
- distance to current visible volume centerline
- projected overlap with current view slab

## 8) Perspective-mode protection strategy

This program must actively prevent “small shared refactors” from degrading perspective mode.

Mandatory protection rules:

1. Keep perspective shader/material behavior isolated.
2. Do not alter perspective fit/reset math unless required by a common abstraction.
3. When generalizing camera types, do not accidentally change perspective control semantics.
4. Benchmark perspective before and after implementation.
5. Treat any perspective-only bug as a blocker, not as acceptable collateral damage.

## 9) VR compatibility contract

In this program:

- VR session entry remains perspective-only.
- Desktop orthographic toggle is disabled during active VR.
- Saved orthographic desktop state may remain dormant while VR is running.

No attempt should be made to reinterpret XR projection matrices as orthographic desktop behavior.

## 10) File touchpoint map

High-priority architectural files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/ui/app/volume-loading/lodPolicyController.ts`
- `src/components/viewers/viewer-shell/types.ts`
- `src/components/viewers/viewer-shell/hooks/useViewerModeControls.ts`
- `src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx`

Likely low-risk camera-generalization files:

- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `src/components/viewers/volume-viewer/roiHitTesting.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`

VR-guard files:

- `src/components/viewers/volume-viewer/useVolumeViewerVr.types.ts`
- `src/components/viewers/volume-viewer/vr/hudPlacement.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVrBridge.ts`

## 11) Acceptance summary

The architecture is acceptable only if all of the following are true:

- runtime projection switching works on desktop
- perspective behavior remains stable
- perspective performance is explicitly benchmarked as non-regressed
- orthographic mode is correct for volume rendering and interaction
- orthographic mode performs acceptably under its own benchmark matrix
- VR remains explicitly protected from unsupported projection switching
