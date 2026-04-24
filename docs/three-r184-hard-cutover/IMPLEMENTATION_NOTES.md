# Implementation Notes

This file is the source-level handoff packet for the Three.js r184 hard cutover. A new agent should be able to start here after reading `DECISIONS.md` and `IMPLEMENTATION_SPEC.md`.

## 1) Verified package facts

Planning-time checks on `2026-04-24`:

- `npm view three version` returned `0.184.0`.
- `npm view @types/three version` returned `0.184.0`.
- `three@0.184.0` exports include:
  - `.`
  - `./examples/jsm/*`
  - `./addons`
  - `./addons/*`
  - `./src/*`
  - `./webgpu`
  - `./tsl`

Cutover target:

- Use exact `three@0.184.0`.
- Use exact `@types/three@0.184.0`.
- Prefer `three/addons/*.js` import specifiers for addon modules.

Reason for `.js` on addon imports:

- Three's public addon examples use `.js` suffixes.
- The package export pattern maps `three/addons/controls/OrbitControls.js` to `examples/jsm/controls/OrbitControls.js`.
- Avoid relying on extension inference through package exports.

## 2) Repo-relevant migration guide summary

Only the items relevant to this repo are listed here. The implementation agent should still use the official guide as the authority when a conflict appears.

### r161 to r162

- `WebGLMultipleRenderTargets` was removed.
- Texture mipmap behavior changed for the default `Texture.generateMipmaps` value.
- `VideoTexture.generateMipmaps` default changed to `false`.

Repo impact:

- Search for `WebGLMultipleRenderTargets`.
- Audit every explicit or implicit mipmap assumption.

### r162 to r163

- `WebGLRenderer` no longer supports WebGL1.
- `WebGLRenderer` stencil context attribute defaults to `false`.

Repo impact:

- No WebGL1 fallback is allowed.
- Make WebGL2 assumptions explicit.
- Confirm no stencil logic exists or explicitly request stencil if it does.

### r164 to r165

- `WebGLRenderer.copyTextureToTexture()` signature changed.
- `WebGLRenderer.copyTextureToTexture3D()` signature changed.
- `WebGLRenderer.copyFramebufferToTexture()` signature changed.

Repo impact:

- Current planning search did not find active use in `src`, but rerun the search after upgrading.

### r169 to r170

- `Material.type` became static and cannot be modified by app code.
- Mipmaps are always generated when `Texture.generateMipmaps` is `true`.
- `WebGLRenderer.copyTextureToTexture3D()` was deprecated in favor of `copyTextureToTexture()`.
- `WebXRManager` honors scene camera layer settings.

Repo impact:

- Search for material `type` mutation.
- Treat every `generateMipmaps = true` as an intentional memory/upload cost.
- Audit WebXR camera/layer assumptions even though current planning search found no app-level `camera.layers` usage.

### r170 to r184

Planning-time migration-guide scan did not identify source-level blockers for this repo's current WebGL2 volume stack, but still rerun targeted searches and checks after the package upgrade.

Important non-impact notes:

- Most r170 to r184 notes target WebGPU/TSL/loaders not used by this app's current renderer path.
- Do not use this as permission to skip tests; shader and texture regressions can still happen without a migration-guide bullet.

## 3) Exact addon import mapping

Replace all current `three/examples/jsm/*` imports with the corresponding `three/addons/*.js` import.

| Current import | Target import |
| --- | --- |
| `three/examples/jsm/controls/OrbitControls` | `three/addons/controls/OrbitControls.js` |
| `three/examples/jsm/lines/Line2` | `three/addons/lines/Line2.js` |
| `three/examples/jsm/lines/LineGeometry` | `three/addons/lines/LineGeometry.js` |
| `three/examples/jsm/lines/LineMaterial` | `three/addons/lines/LineMaterial.js` |
| `three/examples/jsm/lines/LineSegments2` | `three/addons/lines/LineSegments2.js` |
| `three/examples/jsm/lines/LineSegmentsGeometry` | `three/addons/lines/LineSegmentsGeometry.js` |
| `three/examples/jsm/webxr/XRControllerModelFactory` | `three/addons/webxr/XRControllerModelFactory.js` |

Current source/test files with addon imports:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerResets.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVr.types.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVrBridge.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerVr/helpers/session.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayTrackIntersections.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `tests/roiRenderResource.test.ts`

Verification search:

```bash
rg -n "three/examples/jsm|three/addons" src tests
```

Expected after import cutover:

- No `three/examples/jsm` imports.
- All addon imports are `three/addons/...js`.

## 4) Known first failures and first checks

### `THREE.LuminanceFormat`

Known current occurrence:

- `tests/useVolumeResources.test.ts`

Expected r184 action:

- Remove the test dependency on `THREE.LuminanceFormat`.
- Replace it with an r184-supported texture format appropriate to the test intent.
- Do not add a local compatibility constant.

Verification search:

```bash
rg -n "LuminanceFormat|LuminanceAlphaFormat" src tests
```

### Removed-copy API scan

Planning-time source scan did not find active use, but rerun after upgrade:

```bash
rg -n "copyTextureToTexture3D|copyTextureToTexture|copyFramebufferToTexture|WebGLMultipleRenderTargets" src tests
```

### WebGL1 scan

Rerun after upgrade:

```bash
rg -n "WebGL1|WebGL1Renderer|getContext\\('webgl'|getContext\\(\"webgl\"" src tests
```

Existing e2e helper code may probe `webgl` after `webgl2` for raw canvas metrics. That is test utility behavior, not renderer fallback. If retained, document why it is not part of app runtime fallback.

### Three revision branching scan

Must remain empty:

```bash
rg -n "THREE\\.REVISION|REVISION|0\\.161|0\\.184" src tests
```

Package files will contain `0.184.0`; app source must not branch on it.

## 5) Renderer touchpoints

Primary renderer setup:

- `src/hooks/useVolumeRenderSetup.ts`

Current important behavior:

- constructs `new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })`
- sets `renderer.outputColorSpace = THREE.SRGBColorSpace`
- applies desktop pixel ratio cap
- sets transparent clear color
- enables `renderer.xr`
- sets reference space type to `local-floor`
- disposes renderer, render lists, and XR manager on teardown

Implementation requirements:

- Keep transparent canvas behavior.
- Keep `SRGBColorSpace` output.
- Keep XR setup.
- Add explicit WebGL2/capability handling if needed.
- Do not add WebGL1 fallback.
- If stencil is not used, leave it intentionally disabled or explicitly set `stencil: false` for clarity.

Render-target touchpoints:

- `src/components/viewers/VolumeViewer.tsx`

Current render targets:

- screenshot render target
- ROI BL alpha target
- ROI BL depth target
- ROI prepass target

Verification:

- screenshot output must be nonblank and correctly oriented
- ROI BL attenuation tests must pass
- browser console must not show render-target or shader errors

## 6) Texture hot spots

### `Data3DTexture` hot spots

Primary files:

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/fallbackTextures.ts`

Important functions in `useVolumeResources.ts`:

- `applyVolumeTextureSampling`
- `createByte3dTexture`
- `createFloat3dTexture`
- `updateOrCreatePreparedVolumeTexture`
- `applyByteTextureFilter`
- `updateOrCreateByte3dTexture`
- `updateOrCreateFloat3dTexture`
- `buildBrickAtlasDataTexture`
- `createFallbackVolumeDataTexture`

Known mutation pattern to audit:

- assigning `texture.image.data`
- assigning `texture.image.width`
- assigning `texture.image.height`
- assigning `texture.image.depth`
- assigning `texture.format`
- assigning `texture.type`
- assigning `texture.internalFormat`

Rule:

- Same dimensions, format, type, internal format, and texture class can reuse a texture for data-only upload.
- Any identity change must dispose and recreate.

### `DataTexture` hot spots

Primary files:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/volume-viewer/rendering/colormap.ts`
- `src/components/viewers/VolumeViewer.tsx`

Important texture types:

- slice textures
- segmentation palette texture
- colormap texture
- ROI transmittance/sentinel textures
- screenshot/readback textures through render targets

Rule:

- Keep numeric data values shader-equivalent.
- Recreate on dimensions/format/type/internal-format identity changes.
- Do not use placeholder textures as migration recovery.

### Canvas texture hot spots

Primary files:

- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`

Current behavior:

- canvas-backed labels and HUD panels use `THREE.SRGBColorSpace`.
- min/mag filters are set for HUD textures.

Rule:

- Preserve current visual output and readability.

## 7) Mipmap audit notes

Current high-risk line:

- `src/components/viewers/volume-viewer/useVolumeResources.ts` uses `THREE.LinearMipmapLinearFilter` and sets `texture.generateMipmaps = !nearest` for linear volume sampling.

Required decision:

- Confirm this is still intended under r184 where mipmaps are always generated when `generateMipmaps` is `true`.
- Metadata textures must keep `generateMipmaps = false`.
- Render targets must keep `generateMipmaps = false` where currently set.

Verification:

- no WebGL mipmap warnings
- no memory/perf regression beyond accepted thresholds
- linear sampling visual output remains equivalent

## 8) Color-space audit notes

Current color-space assignments:

- renderer output: `THREE.SRGBColorSpace`
- intensity volume/slice textures: `THREE.LinearSRGBColorSpace` in several paths
- colormap texture: `THREE.SRGBColorSpace`
- screenshot target texture: `THREE.SRGBColorSpace`
- canvas/HUD textures: `THREE.SRGBColorSpace`

Implementation rule:

- Do not change color-space assignments unless a failing test proves they are wrong under r184.
- If changed, record visual before/after evidence.

Verification:

- visual tests
- 16-bit playback render brightness checks
- screenshot manual/e2e checks

## 9) Shader patch anchors

Planning-time check against `three@0.184.0/examples/jsm/lines/LineMaterial.js` found these anchors still present:

- `attribute vec3 instanceColorEnd;`
- `void main() {`
- `uniform float linewidth;`
- `float alpha = opacity;`
- `gl_FragColor = vec4( diffuseColor.rgb, alpha );`
- `#include <colorspace_fragment>`

Current patch locations:

- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/VolumeViewer.tsx`

Required tests:

- Track shader patch injects `instanceTimeRange`, `vTrackTimeRange`, `trackVisibleTimeMin`, and `trackVisibleTimeMax`.
- ROI BL shader patch injects ROI BL uniforms and applies alpha attenuation.
- ROI composite/prepass shader patches still produce expected depth/transmittance behavior.

Do not:

- skip `onBeforeCompile`
- remove the custom cache key
- disable line overlays
- weaken track/ROI assertions

## 10) WebXR touchpoints

Primary files:

- `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`
- `src/components/viewers/volume-viewer/VolumeViewerVrBridge.tsx`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/vr/sessionManager.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`
- `src/components/viewers/volume-viewer/vr/controllerRayTrackIntersections.ts`
- `src/components/viewers/volume-viewer/vr/volume.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`

Current behavior to preserve:

- `renderer.xr.isPresenting` gates desktop movement and hover behavior.
- `renderer.xr.updateCamera(camera)` is used in the render loop during XR presentation.
- `renderer.xr.getCamera()` is used for controller ray/volume logic.
- `navigator.xr.requestSession` requests optional `local-floor`, `bounded-floor`, and `hand-tracking`.
- `renderer.xr.setSession(session)` starts presentation.
- `XRControllerModelFactory` creates controller grip models.

Manual verification is mandatory:

- Browser automation is not enough for VR completion.
- `T184-019` stays open until a real headset verification note exists.

## 11) Source touchpoint inventory

### Dependency and build

- `package.json`
- `package-lock.json`
- `vite.config.ts`
- `tsconfig.json`
- `tsconfig.tests.json`

### Renderer and lifecycle

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`

### Textures and resources

- `src/core/textureCache.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/fallbackTextures.ts`
- `src/components/viewers/volume-viewer/rendering/colormap.ts`
- `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidencyWorker.ts`

### Shaders

- `src/shaders/volumeRenderShader.ts`
- `src/shaders/sliceRenderShader.ts`
- inline shaders in `src/components/viewers/VolumeViewer.tsx`

### Lines/tracks/ROI

- `src/components/viewers/volume-viewer/useTrackRendering.ts`
- `src/components/viewers/volume-viewer/useRoiRendering.ts`
- `src/components/viewers/VolumeViewer.types.ts`

### Camera, controls, hover, interaction

- `src/components/viewers/volume-viewer/useCameraControls.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerInteractions.ts`
- `src/components/viewers/volume-viewer/trackHitTesting.ts`
- `src/components/viewers/volume-viewer/roiHitTesting.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`

### Canvas/HUD/props

- `src/components/viewers/volume-viewer/useViewerPropsRendering.ts`
- `src/components/viewers/volume-viewer/vr/hudFactory.ts`
- `src/components/viewers/volume-viewer/vr/hudRenderers.ts`
- `src/components/viewers/volume-viewer/vr/hudRenderersChannels.ts`
- `src/components/viewers/volume-viewer/vr/hudRenderersTracks.ts`

### Tests to inspect first

- `tests/useVolumeResources.test.ts`
- `tests/textureCache.test.ts`
- `tests/useVolumeViewerInteractions.test.ts`
- `tests/volumeViewerRenderLoop.test.ts`
- `tests/controllerRayUpdater.test.ts`
- `tests/controllerSelectHandlers.test.ts`
- `tests/roiRenderResource.test.ts`
- `tests/sliceRenderShader.test.ts`
- `tests/e2e/viewer-3d-shader-smoke.spec.ts`
- `tests/e2e/viewer-16bit-playback.spec.ts`
- `tests/e2e/roi-bl-attenuation.spec.ts`
- `tests/e2e/orthographic-regression.spec.ts`
- `tests/e2e/tracks-smoke.spec.ts`

## 12) Implementation order for a fresh agent

1. Read docs in the README read order.
2. Mark `T184-001` as `IN_PROGRESS`.
3. Run the baseline command set in `TEST_PLAN.md`.
4. Record baseline evidence in `EXECUTION_LOG.md`.
5. Upgrade and pin packages.
6. Run `npm ls three @types/three`.
7. Fix package/import/type errors.
8. Fix known removed API usage.
9. Run static checks.
10. Audit texture identity paths before chasing visual symptoms.
11. Verify shader patch anchors and add tests for injected shader code.
12. Run browser smoke checks and inspect console.
13. Run UI/visual/perf gates.
14. Perform manual VR verification.
15. Run no-fallback scans.
16. Close checklist/backlog/docs only after evidence exists.

## 13) Forbidden implementation shortcuts

- Do not introduce `if (THREE.REVISION...)`.
- Do not import both examples and addons paths.
- Do not keep both old and new texture code paths.
- Do not swallow shader compile failure and render without an overlay.
- Do not swallow texture upload failure and bind a blank texture.
- Do not skip VR verification.
- Do not change visual behavior without before/after evidence and explicit acceptance.
- Do not mark a backlog item done because TypeScript passes if browser/runtime behavior is part of its scope.
