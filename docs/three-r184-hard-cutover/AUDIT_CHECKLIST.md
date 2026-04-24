# Audit Checklist

This checklist exists because a Three.js upgrade can compile successfully while still breaking runtime rendering or interaction.

Status legend: `UNREVIEWED`, `REVIEWED`, `UPDATED`, `VERIFIED`

## 1) Dependency and lockfile audit

- Status: `VERIFIED`
- Required review points:
  - `three` exact version is `0.184.0`
  - `@types/three` exact version is `0.184.0`
  - lockfile resolves both packages to `0.184.0`
  - no package alias or vendored old Three.js remains

Primary files:

- `package.json`
- `package-lock.json`

## 2) Import-contract audit

- Status: `VERIFIED`
- Required review points:
  - all Three addon imports use the selected r184 public path
  - no old/new import fallback logic exists
  - Vite manual chunks still isolate Three.js as intended
  - tests import the same addon paths as source code

Primary files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `vite.config.ts`

## 3) Removed/deprecated API audit

- Status: `VERIFIED`
- Required review points:
  - no `THREE.LuminanceFormat`
  - no WebGL1 renderer dependency
  - no `WebGLMultipleRenderTargets`
  - no `copyTextureToTexture3D`
  - no removed examples/addon API usage
  - no compatibility branch based on `THREE.REVISION`

Suggested searches:

- `rg "LuminanceFormat|WebGL1|WebGLMultipleRenderTargets|copyTextureToTexture3D|THREE.REVISION" src tests`

## 4) Renderer setup audit

- Status: `VERIFIED`
- Required review points:
  - WebGL2 target is explicit
  - no WebGL1 fallback exists
  - canvas alpha behavior is preserved
  - clear color behavior is preserved
  - output color space is preserved
  - pixel ratio cap behavior is preserved
  - XR enablement is preserved
  - stencil behavior is intentional

Primary files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.tsx`

## 5) Render target audit

- Status: `VERIFIED`
- Required review points:
  - screenshot render target behavior is unchanged
  - ROI BL alpha target behavior is unchanged
  - ROI BL depth target behavior is unchanged
  - ROI prepass behavior is unchanged
  - MSAA sample behavior remains valid
  - `readRenderTargetPixels` output is correct

Primary files:

- `src/components/viewers/VolumeViewer.tsx`
- `tests/e2e/roi-bl-attenuation.spec.ts`
- `tests/e2e/viewer-16bit-playback.spec.ts`

## 6) Data texture audit

- Status: `VERIFIED`
- Required review points:
  - `DataTexture` format/type/internalFormat changes recreate textures
  - `DataTexture` dimension changes recreate textures
  - slice textures remain correct for intensity and segmentation
  - colormap and palette textures keep expected filtering
  - unpack alignment is explicit where required

Primary files:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/rendering/colormap.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/VolumeViewer.tsx`

## 7) Data3D texture audit

- Status: `VERIFIED`
- Required review points:
  - volume texture identity changes recreate textures
  - brick atlas texture identity changes recreate textures
  - metadata textures do not accidentally generate mipmaps
  - linear volume sampling mipmaps are intentional
  - segmentation label packing remains correct
  - background mask textures remain correct
  - skip hierarchy textures remain correct

Primary files:

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/fallbackTextures.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidencyWorker.ts`

## 8) Color-space audit

- Status: `VERIFIED`
- Required review points:
  - renderer output color space remains `SRGBColorSpace`
  - canvas/HUD textures remain `SRGBColorSpace`
  - numeric textures preserve previous shader-visible values
  - colormap output remains visually equivalent
  - screenshots preserve expected brightness/color

Primary files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/rendering/colormap.ts`
- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`

## 9) Volume shader audit

- Status: `VERIFIED`
- Required review points:
  - MIP compiles and renders
  - ISO compiles and renders
  - BL compiles and renders
  - adaptive LOD behavior is unchanged
  - brick atlas sampling is unchanged
  - skip hierarchy traversal is unchanged
  - hover/crosshair overlay behavior is unchanged
  - segmentation palette lookup is unchanged

Primary files:

- `src/shaders/volumeRenderShader.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

## 10) Slice shader audit

- Status: `VERIFIED`
- Required review points:
  - slice rendering compiles
  - intensity slice output is unchanged
  - segmentation slice output is unchanged
  - background mask behavior is unchanged
  - hover outline behavior is unchanged

Primary files:

- `src/shaders/sliceRenderShader.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

## 11) Line addon shader patch audit

- Status: `VERIFIED`
- Required review points:
  - track time-window shader injection is present
  - ROI BL shader injection is present
  - ROI prepass shader injection is present
  - patch anchors match r184 addon shader source
  - no line feature is disabled as a fallback

Primary files:

- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/VolumeViewer.tsx`

## 12) Camera and controls audit

- Status: `VERIFIED`
- Required review points:
  - perspective behavior is unchanged
  - orthographic behavior is unchanged
  - `OrbitControls` behavior is unchanged
  - camera save/load/reset behavior is unchanged
  - keyboard movement/rotation behavior is unchanged
  - projection-switch resource refresh behavior is unchanged

Primary files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerResets.ts`

## 13) Raycasting and interaction audit

- Status: `VERIFIED`
- Required review points:
  - voxel hover works
  - track hover works
  - ROI hover/preview works
  - prop dragging works
  - controller ray interaction works

Primary files:

- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts`
- `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `src/components/viewers/volume-viewer/roiHitTesting.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`

## 14) WebXR audit

- Status: `REVIEWED`
- Required review points:
  - session request succeeds on a supported device
  - session end restores desktop state
  - controller models load
  - controller rays render
  - HUD panels render and interact
  - foveation behavior remains correct where supported
  - no VR fallback path exists

Primary files:

- `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`
- `src/components/viewers/volume-viewer/VolumeViewerVrBridge.tsx`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`

## 15) No-fallback audit

- Status: `VERIFIED`
- Required review points:
  - no `THREE.REVISION` branching
  - no old/new import fallback
  - no disabled-feature fallback on shader failure
  - no disabled-feature fallback on texture upload failure
  - no disabled-feature fallback on VR failure
  - fallback-named sentinel resources are not used as migration recovery

Suggested searches:

- `rg "fallback|safe mode|THREE.REVISION|0.161|0.184|catch .*disable|disable.*shader|disable.*texture|disable.*VR" src tests docs/three-r184-hard-cutover`

## 16) Performance audit

- Status: `VERIFIED`
- Required review points:
  - no unacceptable frame-time regression
  - no texture memory regression from unintended mipmaps
  - no playback throughput regression
  - no VR frame-rate regression
  - no preprocessing regression unrelated to the cutover

Primary files:

- `tests/perf/**/*.test.ts`
- `docs/performance/real-dataset-baseline.json`
- `scripts/benchmark-real-datasets.ts`
- `scripts/benchmark-nextgen-volume.ts`

## Final Audit Evidence - 2026-04-24

- Dependency/import/API audits are verified by `npm ls three @types/three`, `npm run typecheck`, `npm run typecheck:tests`, `npm run build`, and the legacy API/import scans recorded in `BACKLOG.md`.
- Renderer, texture, color-space, shader, camera, raycasting, setup, playback, screenshot, and feature-parity audits are verified by `npm run verify:fast`, `npm run verify:ui`, targeted shader/texture tests, and the browser smoke/visual suites recorded in `EXECUTION_LOG.md`.
- Performance audit is verified by `npm run test:perf`, `npm run test:e2e:preprocess-perf`, and `npm run test:e2e:closeup-perf`.
- WebXR audit is source/type/automated-test reviewed, but not physically verified. Real headset verification remains the only open external blocker.
