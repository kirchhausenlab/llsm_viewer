# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Completion gates

These gates apply to every backlog item.

1. Do not mark `DONE` from static reasoning alone.
2. Record exact changed files.
3. Record exact verification commands.
4. Record observed command results.
5. If a command cannot be run, mark the item `BLOCKED` or leave it `TODO`; do not call it done.
6. If behavior is only manually verified, record the dataset, browser/device, viewport or headset, and observed result.
7. If an item touches rendering, record whether browser console was checked for shader, program-link, and WebGL texture messages.
8. If an item touches VR, record real headset verification or leave the item open.
9. No fallback, disabled feature, old/new branch, or weakened assertion can be used as evidence.

## Required final command gate

Before final cutover closure, all of these commands must pass or be explicitly blocked by environment before the work can be considered incomplete rather than done:

```bash
npm run check:architecture
npm run typecheck
npm run typecheck:tests
npm run typecheck:strict-unused
npm run test
npm run test:coverage
npm run test:coverage:hotspots
npm run build
npm run test:frontend
npm run test:visual
npm run test:e2e
npm run test:e2e:visual
npm run test:perf
```

The preferred single-command gate, when local environment and time allow, is:

```bash
npm run verify:full
```

## Dependency and import work

### T184-001 - Pin Three.js packages to exact r184

- Status: `DONE`
- Scope:
  - update `three`
  - update `@types/three`
  - refresh lockfile
- Evidence required:
  - `npm ls three @types/three`
  - package diff

### T184-002 - Standardize addon imports

- Status: `DONE`
- Scope:
  - controls imports
  - lines imports
  - WebXR addon imports
  - matching test imports
- Evidence required:
  - import search output
  - typecheck output

### T184-003 - Remove unsupported r184 API usage

- Status: `DONE`
- Scope:
  - remove `THREE.LuminanceFormat`
  - scan for removed APIs from the r161 to r184 migration range
- Evidence required:
  - targeted `rg` output
  - typecheck output

## Renderer and texture work

### T184-004 - Audit renderer setup for r184

- Status: `DONE`
- Scope:
  - WebGL2 target
  - context attributes
  - output color space
  - XR enablement
  - lifecycle disposal
- Evidence required:
  - source references
  - browser smoke output

### T184-005 - Harden `Data3DTexture` lifecycle

- Status: `DONE`
- Scope:
  - volume textures
  - segmentation label textures
  - brick atlas textures
  - metadata textures
  - background mask textures
  - skip hierarchy textures
- Evidence required:
  - unit tests
  - browser texture-warning check

### T184-006 - Harden `DataTexture` lifecycle

- Status: `DONE`
- Scope:
  - slice textures
  - colormap textures
  - palette textures
  - ROI fallback/sentinel textures
  - render-target readback path
- Evidence required:
  - unit tests
  - targeted e2e checks

### T184-007 - Audit mipmap behavior

- Status: `DONE`
- Scope:
  - linear volume sampling
  - nearest metadata textures
  - render targets
  - canvas textures
- Evidence required:
  - source references
  - perf or memory notes where relevant

### T184-008 - Audit color-space behavior

- Status: `DONE`
- Scope:
  - renderer output
  - numeric volume textures
  - colormap and palette textures
  - canvas/HUD textures
  - screenshot output
- Evidence required:
  - source references
  - visual/e2e results

## Shader and interaction work

### T184-009 - Verify volume shader variants

- Status: `DONE`
- Scope:
  - MIP
  - ISO
  - BL
  - segmentation
  - brick atlas
  - skip hierarchy
- Evidence required:
  - shader smoke test output
  - targeted render checks

### T184-010 - Verify slice shader

- Status: `DONE`
- Scope:
  - intensity slices
  - segmentation slices
  - background masks
  - hover outlines
- Evidence required:
  - unit test output
  - browser smoke output

### T184-011 - Verify `LineMaterial` patches

- Status: `DONE`
- Scope:
  - track time-window patch
  - ROI BL occlusion patch
  - ROI prepass patch
  - line resolution behavior
- Evidence required:
  - tests proving shader injection
  - tracks/ROI e2e or manual evidence

### T184-012 - Verify raycasting interactions

- Status: `DONE`
- Scope:
  - voxel hover
  - track hover
  - ROI hit testing
  - prop interaction
  - pointer lifecycle
- Evidence required:
  - targeted tests
  - e2e smoke checks

## Feature parity work

### T184-013 - Verify setup and import flows

- Status: `DONE`
- Scope:
  - front page
  - public experiments
  - local preprocessing
  - preprocessed import
- Evidence required:
  - e2e smoke output
  - manual notes if needed

### T184-014 - Verify playback

- Status: `DONE`
- Scope:
  - frame stepping
  - play/pause
  - target FPS
  - warmup gate
  - route/provider/resource sync
- Evidence required:
  - unit tests
  - e2e playback checks

### T184-015 - Verify camera and projection behavior

- Status: `DONE`
- Scope:
  - perspective
  - orthographic
  - projection switching
  - saved camera views
  - follow target behavior
- Evidence required:
  - orthographic regression output
  - camera-window e2e output

### T184-016 - Verify annotations and overlays

- Status: `DONE`
- Scope:
  - ROI drawing
  - measurements
  - paintbrush
  - viewer props
  - backgrounds
- Evidence required:
  - targeted unit/e2e/manual checks

### T184-017 - Verify tracks

- Status: `DONE`
- Scope:
  - track upload
  - rendering
  - selection
  - hover/tooltip
  - time-window display
- Evidence required:
  - unit tests
  - tracks smoke output

### T184-018 - Verify screenshots and recording

- Status: `DONE`
- Scope:
  - screenshot readback
  - image orientation
  - alpha/color
  - recording panel behavior
- Evidence required:
  - e2e/manual output

### T184-019 - Verify VR

- Status: `BLOCKED`
- Scope:
  - session request/end
  - controller models
  - controller rays
  - playback HUD
  - channels HUD
  - tracks HUD
  - volume manipulation
- Evidence required:
  - manual headset verification notes
  - source/typecheck evidence

## Verification and closure work

### T184-020 - Run fast verification

- Status: `DONE`
- Scope:
  - architecture
  - typecheck
  - tests
  - build
- Evidence required:
  - command output

### T184-021 - Run UI verification

- Status: `DONE`
- Scope:
  - frontend tests
  - visual tests
  - e2e smoke tests
  - visual e2e tests
- Evidence required:
  - command output

### T184-022 - Run performance verification

- Status: `DONE`
- Scope:
  - perf test suite
  - real dataset benchmark where available
  - playback/render frame-time comparison
- Evidence required:
  - command output
  - perf notes

### T184-023 - Run no-fallback scan

- Status: `DONE`
- Scope:
  - search for old/new branches
  - search for migration fallbacks
  - search for temporary TODOs
- Evidence required:
  - search output

### T184-024 - Update project docs and progress

- Status: `DONE`
- Scope:
  - `docs/PROGRESS.md`
  - `SESSION_HANDOFF.md`
  - `EXECUTION_LOG.md`
  - cutover docs
- Evidence required:
  - doc diff

### T184-025 - Final cutover review

- Status: `DONE`
- Scope:
  - review changed files
  - review test evidence
  - review risk register
  - confirm no accepted behavior regressions
- Evidence required:
  - final review notes

## Final Evidence - 2026-04-24

Changed implementation/test/doc areas:

- Dependency files: `package.json`, `package-lock.json`.
- TypeScript config: `tsconfig.json`.
- Renderer/setup: `src/hooks/useVolumeRenderSetup.ts`.
- Texture/rendering resources: `src/components/viewers/volume-viewer/useVolumeResources.ts`, `fallbackTextures.ts`, `rendering/colormap.ts`, `useRoiRendering.ts`, `useViewerPropsRendering.ts`, `hudFactory.ts`, `VolumeViewer.tsx`.
- Addon imports/types: viewer, track, ROI, VR, camera, render-loop, pointer lifecycle modules.
- Tests/snapshots: texture lifecycle, renderer setup, shader patch, ROI resource, pointer lifecycle, e2e menu/playback, public-experiment visual snapshot.
- Docs: cutover docs and `docs/PROGRESS.md`.

Command evidence:

- `npm ls three @types/three`: `three@0.184.0`, `@types/three@0.184.0`.
- `npm run typecheck:strict-unused`: passed.
- `npm run test`: passed; 236 tests, 233 pass, 3 skipped.
- `npm run verify:fast`: passed; 246 tests passed, 5 skipped under coverage, build passed with existing large-chunk warning.
- `npm run verify:ui`: passed; 18 frontend tests, 3 visual tests, 21 Chromium smoke tests, 3 Chromium visual e2e tests.
- `npm run test:perf`: passed; 10 passed, 2 skipped because optional real-dataset fixtures were absent.
- `npm run test:e2e:preprocess-perf`: passed; `[preprocess-perf] elapsedMs=14126 files=5 budgetMs=240000`.
- `npm run test:e2e:closeup-perf`: passed; `farMedianMs=0.20`, `farP95Ms=0.30`, `closeMedianMs=0.20`, `closeP95Ms=0.30`.

Scan evidence:

- `rg -n "three/examples/jsm|THREE\\.REVISION|0\\.161|WebGL1Renderer|LuminanceFormat|LuminanceAlphaFormat|WebGLMultipleRenderTargets|copyTextureToTexture3D" src tests package.json package-lock.json || true`: no matches.
- `rg -n "safe mode|disable.*shader|disable.*texture|disable.*VR|old Three|legacy Three|compat(ibility)? mode|dual path|three r161|three-r161" src tests package.json package-lock.json || true`: no matches.
- Broad `fallback` scan returns existing domain fallbacks only: sentinel textures/resources, LOD fallback scale naming, Suspense fallback UI, color/value fallbacks, worker-build fallback, and VR placement fallback offsets. No old/new Three path or migration feature-disable path was found.
- WebGL context scan found only the production `new THREE.WebGLRenderer` plus e2e diagnostic/metrics probes. The production renderer checks `renderer.capabilities.isWebGL2` and throws `WebGL2 is required for the volume viewer renderer.` if unavailable.

Blocked evidence:

- `T184-019` remains `BLOCKED` only for physical headset verification. Automated/source VR coverage passed through `verify:fast` and `verify:ui`, including VR bridge/runtime/input/render-style tests, but no real headset is attached in this environment.
