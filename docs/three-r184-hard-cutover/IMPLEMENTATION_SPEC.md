# Implementation Spec

This spec defines the hard-cutover implementation plan for moving the app to Three.js `0.184.0`.

## 1) Current-state diagnosis

### 1.1 Dependency versions are misaligned

Current package state:

- `three`: `^0.161.0`
- `@types/three`: `^0.180.0`

Primary touchpoints:

- `package.json`
- `package-lock.json`

Consequences:

- TypeScript is already checking against a newer API shape than the runtime package.
- Some migration issues may already be hidden by type/runtime skew.
- The cutover must align runtime and types to exact `0.184.0`.

### 1.2 Three usage is concentrated in a few runtime domains

The important Three.js surfaces are:

- renderer/context setup
- desktop cameras and `OrbitControls`
- custom volume and slice shaders
- `DataTexture` and `Data3DTexture` upload/update paths
- `WebGLRenderTarget` screenshot and ROI prepass paths
- `LineMaterial`, `Line2`, and `LineSegments2` addons
- WebXR session/controller/HUD runtime
- raycasting for hover, ROI, props, and tracks

Primary touchpoints:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`

### 1.3 Addon imports use the older examples path

Current imports include:

- `three/examples/jsm/controls/OrbitControls`
- `three/examples/jsm/lines/Line2`
- `three/examples/jsm/lines/LineGeometry`
- `three/examples/jsm/lines/LineMaterial`
- `three/examples/jsm/lines/LineSegments2`
- `three/examples/jsm/lines/LineSegmentsGeometry`
- `three/examples/jsm/webxr/XRControllerModelFactory`

Target:

- Standardize to r184 addon imports.
- Do not keep old/new import fallback logic.

### 1.4 Renderer setup is already close to the target

Current renderer setup:

- `THREE.WebGLRenderer`
- `antialias: true`
- `alpha: true`
- `powerPreference: 'high-performance'`
- `renderer.outputColorSpace = THREE.SRGBColorSpace`
- `renderer.xr.enabled = true`
- reference space type set to `local-floor`

Primary touchpoint:

- `src/hooks/useVolumeRenderSetup.ts`

Required audit:

- Make WebGL2 assumptions explicit.
- Make context attributes explicit where correctness depends on them, especially stencil.
- Confirm no code assumes WebGL1 recovery.

### 1.5 Texture upload/update is the highest code-level risk

The app creates and updates many textures:

- volume intensity textures
- segmentation label textures
- segmentation palette textures
- brick atlas textures
- occupancy/min/max/page-table textures
- background mask textures
- skip hierarchy textures
- slice textures
- colormap textures
- ROI prepass/composite textures
- VR HUD canvas textures
- prop label textures

Primary touchpoints:

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/fallbackTextures.ts`
- `src/components/viewers/volume-viewer/rendering/colormap.ts`
- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`
- `src/components/viewers/VolumeViewer.tsx`

Required target behavior:

- Updating pixel data without changing texture identity may reuse a texture.
- Changing width, height, depth, format, type, or internal format must recreate the texture.
- Mipmap generation must be intentional and explicit.
- Numeric data textures must keep their intended color-space behavior.
- Failed uploads must be fixed, not hidden behind placeholder rendering.

### 1.6 Custom shaders use GLSL1 conventions

Current shader code uses:

- `varying`
- `texture2D`
- `gl_FragColor`
- `sampler3D`
- `usampler3D`

Primary touchpoints:

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- inline shaders in `src/components/viewers/VolumeViewer.tsx`

Target:

- Keep existing shader semantics unless r184 requires a syntax change.
- Do not rewrite shaders to GLSL3 unless it is required for correctness.
- Browser shader-smoke tests must prove shaders compile without warnings/errors.

### 1.7 `LineMaterial` patches depend on addon shader source

The app patches `LineMaterial` shader source for:

- track visibility time windows
- ROI Beer-Lambert occlusion/transmittance
- ROI depth prepass behavior

Primary touchpoints:

- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/VolumeViewer.tsx`

Risk:

- Three.js can change internal shader source while keeping TypeScript APIs stable.

Target:

- Confirm every patch anchor still exists in r184.
- Add tests that fail if the patch is not applied.
- Do not skip or disable patched line features.

### 1.8 WebXR remains in scope

Current VR runtime uses:

- `renderer.xr`
- `navigator.xr.requestSession`
- `XRControllerModelFactory`
- controller rays
- VR playback HUD
- VR channels HUD
- VR tracks HUD
- foveation manager methods when available

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`
- `src/components/viewers/volume-viewer/VolumeViewerVrBridge.tsx`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`

Target:

- VR behavior remains unchanged.
- If r184 WebXR behavior differs, adapt the app to preserve current user behavior.
- Do not disable VR or skip controller models as a fallback.

### 1.9 Existing tests cover important migration surfaces

Useful existing automated checks include:

- TypeScript checks
- architecture boundary check
- unit tests for texture/resource behavior
- shader smoke tests
- hover tests
- orthographic regression tests
- 16-bit render/playback tests
- ROI BL attenuation tests
- tracks smoke tests
- visual screenshots

Primary commands:

- `npm run verify:fast`
- `npm run verify:ui`
- `npm run test:e2e:full`
- `npm run test:perf`

## 2) Target architecture

### 2.1 Single Three.js runtime contract

The app must have exactly one Three.js runtime:

- `three@0.184.0`
- `@types/three@0.184.0`

Forbidden:

- dynamic import fallback
- `THREE.REVISION` compatibility branches
- vendored old Three.js modules
- old API polyfills

### 2.2 Renderer contract

Renderer behavior:

- Use `THREE.WebGLRenderer`.
- Target WebGL2.
- Preserve transparent canvas behavior.
- Preserve SRGB output behavior.
- Preserve XR enablement.
- Preserve pixel-ratio cap behavior.
- Preserve antialiasing behavior.

Required explicit checks:

- WebGL2 context is available.
- Shader compile errors are surfaced.
- Context attributes are deliberate.

Forbidden:

- WebGL1 fallback.
- Canvas 2D rendering fallback.
- Feature disablement after WebGL errors.

### 2.3 Texture resource contract

Texture helpers must classify changes into two categories:

1. Data-only update:
   - same dimensions
   - same format
   - same type
   - same internal format
   - same texture class
   - update buffer and set `needsUpdate`

2. Identity update:
   - changed dimensions
   - changed format
   - changed type
   - changed internal format
   - changed texture class
   - dispose old texture and create a new one

This contract applies to:

- `THREE.DataTexture`
- `THREE.Data3DTexture`
- `THREE.CanvasTexture`
- `THREE.WebGLRenderTarget` textures

### 2.4 Shader contract

Shader behavior must remain equivalent for:

- MIP rendering
- ISO rendering
- BL rendering
- slice rendering
- segmentation rendering
- hover outlines
- ROI overlays
- background masks
- skip hierarchy traversal
- brick atlas sampling
- adaptive LOD

No shader path may be removed or bypassed to satisfy the migration.

### 2.5 Addon line-rendering contract

Line-based features must remain equivalent:

- track trails
- selected-track styling
- track hover
- ROI outlines
- ROI occlusion/composite behavior
- line width/resolution behavior

The r184 line addon shader is treated as an external dependency that must be audited and tested.

### 2.6 WebXR contract

VR must preserve:

- session start/end behavior
- VR/AR preferred mode behavior
- controller connection/disconnection behavior
- controller rays
- controller hover/select behavior
- playback HUD
- channels HUD
- tracks HUD
- volume transforms
- foveation behavior where supported

No VR fallback or feature omission is acceptable.

### 2.7 Functional parity matrix

The cutover must verify these feature groups:

- Front page and setup flow
- Public experiment loading
- local TIFF preprocessing
- preprocessed dataset loading
- channel/layer visibility
- MIP, ISO, BL rendering
- slice rendering
- segmentation rendering
- 8-bit intensity
- 16-bit intensity
- multichannel overlays
- playback and frame stepping
- hover readout
- orthographic and perspective projection
- camera save/load/reset/follow
- ROI drawing and measurements
- paintbrush workflows
- track upload/rendering/selection/tooltips
- background masks
- screenshots and recording surfaces
- VR session and HUDs

## 3) Workstream sequence

### Phase 0 - Baseline capture

Goals:

- Establish the current behavior baseline before dependency changes.
- Capture command outputs and any known local limitations.

Required actions:

- Run static checks.
- Run fast tests.
- Run targeted e2e and visual tests.
- Record any failing baseline separately from migration failures.

Exit criteria:

- Baseline evidence is appended to `EXECUTION_LOG.md`.

### Phase 1 - Dependency cutover

Goals:

- Update dependency and lockfile state.
- Align runtime and types.

Required actions:

- Set `three` to `0.184.0`.
- Set `@types/three` to `0.184.0`.
- Refresh `package-lock.json`.
- Confirm lockfile resolution.

Exit criteria:

- `npm ls three @types/three` shows exact `0.184.0`.

### Phase 2 - Import and static API repairs

Goals:

- Make the project compile against r184.

Required actions:

- Replace unsupported constants or APIs.
- Standardize addon imports.
- Remove old path assumptions.
- Run TypeScript checks after each focused repair set.

Known starting issue:

- `THREE.LuminanceFormat` is used in `tests/useVolumeResources.test.ts`.

Exit criteria:

- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run check:architecture`

### Phase 3 - Renderer and context audit

Goals:

- Make renderer behavior explicit and correct under r184.

Required actions:

- Audit `createVolumeRenderContext`.
- Audit render targets.
- Verify screenshots and ROI prepass targets.
- Verify canvas alpha and output color-space behavior.

Exit criteria:

- Browser rendering smoke checks show nonblank output and no shader/context errors.

### Phase 4 - Texture lifecycle hardening

Goals:

- Ensure every texture upload/update path is valid under r184.

Required actions:

- Audit all `DataTexture` and `Data3DTexture` helper paths.
- Enforce texture recreation on identity changes.
- Verify mipmap generation intent.
- Verify color-space intent.
- Verify resource disposal.

Exit criteria:

- Unit tests cover data-only updates and identity updates.
- Browser console shows no WebGL texture upload warnings.

### Phase 5 - Shader and addon patch verification

Goals:

- Preserve all shader behavior under r184.

Required actions:

- Run shader smoke tests.
- Audit `LineMaterial` patch anchors.
- Add tests for injected line shader uniforms/code where missing.
- Verify MIP/ISO/BL/slice/segmentation visually and with automated checks.

Exit criteria:

- No shader compile errors.
- Patched line features still work.

### Phase 6 - WebXR verification

Goals:

- Preserve VR behavior under r184.

Required actions:

- Static-check WebXR types and addon imports.
- Browser-check non-headset XR code paths where possible.
- Manually verify real headset behavior.

Exit criteria:

- Manual VR evidence is recorded.
- No VR feature is skipped or downgraded.

### Phase 7 - Full parity verification

Goals:

- Prove the migrated app works the same.

Required actions:

- Run required command matrix from `TEST_PLAN.md`.
- Run manual feature matrix.
- Record evidence.

Exit criteria:

- `CUTOVER_CHECKLIST.md` is complete.
- No unaccepted open risks remain.

### Phase 8 - Cleanup and closure

Goals:

- Remove migration scaffolding and finalize docs.

Required actions:

- Search for forbidden compatibility/fallback patterns.
- Update docs and logs.
- Ensure no temporary comments or TODOs remain.

Exit criteria:

- `ROADMAP.md` phases are `COMPLETE`.
- `BACKLOG.md` items are `DONE`.
- `SESSION_HANDOFF.md` reflects final state.
