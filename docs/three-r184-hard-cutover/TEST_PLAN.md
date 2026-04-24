# Test Plan

This plan verifies that the r184 cutover preserves existing behavior without fallback paths.

## 1) Baseline before dependency changes

Run before changing packages:

```bash
npm run check:architecture
npm run typecheck
npm run typecheck:tests
npm run typecheck:strict-unused
npm run test
npm run build
```

Record:

- command
- pass/fail
- key output
- date
- local environment notes

If a baseline command fails before the migration, record it as pre-existing and do not count it as a migration regression.

## 2) Static verification after upgrade

Run after dependency and static repairs:

```bash
npm run check:architecture
npm run typecheck
npm run typecheck:tests
npm run typecheck:strict-unused
```

Required result:

- all pass

## 3) Unit and integration verification

Run:

```bash
npm run test
npm run test:coverage
npm run test:coverage:hotspots
npm run test:hover-guards
```

Targeted tests to watch:

- `tests/useVolumeResources.test.ts`
- `tests/textureCache.test.ts`
- `tests/useVolumeViewerInteractions.test.ts`
- `tests/volumeViewerRenderLoop.test.ts`
- `tests/controllerRayUpdater.test.ts`
- `tests/controllerSelectHandlers.test.ts`
- `tests/roiRenderResource.test.ts`
- `tests/sliceRenderShader.test.ts`

Required result:

- all pass
- no test is weakened to accept disabled behavior

## 4) Build verification

Run:

```bash
npm run build
```

Required result:

- build passes
- no Vite/Rollup module resolution errors
- no unexpected Three.js duplicate chunking

## 5) Browser smoke verification

Run:

```bash
npm run test:e2e
```

Required result:

- smoke suite passes
- no browser console shader compile errors
- no WebGL texture upload warnings
- rendered canvas is nonblank where expected

High-value smoke specs:

- `tests/e2e/frontpage-smoke.spec.ts`
- `tests/e2e/viewer-3d-shader-smoke.spec.ts`
- `tests/e2e/hover-smoke.spec.ts`
- `tests/e2e/channels-smoke.spec.ts`
- `tests/e2e/tracks-smoke.spec.ts`
- `tests/e2e/viewer-playback-smoke.spec.ts`
- `tests/e2e/projection-mode-smoke.spec.ts`
- `tests/e2e/orthographic-regression.spec.ts`

## 6) Rendering-specific browser checks

Run:

```bash
npm run test:e2e:visual
npm run test:e2e:closeup-perf
npm run test:e2e:preprocess-perf
```

Also run targeted specs when not included by script filters:

```bash
playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-3d-shader-smoke.spec.ts
playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-16bit-playback.spec.ts
playwright test --config=playwright.config.ts --project=chromium tests/e2e/roi-bl-attenuation.spec.ts
playwright test --config=playwright.config.ts --project=chromium tests/e2e/orthographic-regression.spec.ts
```

Required result:

- MIP, ISO, BL, slice, segmentation, 16-bit, ROI attenuation, and orthographic paths work.

## 7) Frontend and visual verification

Run:

```bash
npm run test:frontend
npm run test:visual
```

Required result:

- all pass
- snapshots change only for reviewed and accepted r184 rendering differences

## 8) Performance verification

Run:

```bash
npm run test:perf
```

When real datasets are available:

```bash
npm run benchmark:real-datasets
npm run benchmark:nextgen-volume
```

Required result:

- no unacceptable visualization-stage regression
- no unexplained memory regression from texture/mipmap behavior
- playback throughput remains acceptable

## 9) Full verification gate

Preferred final local gate:

```bash
npm run verify:fast
npm run verify:ui
npm run test:perf
```

If environment allows, run:

```bash
npm run verify:full
```

Required result:

- all pass or documented environment-only limitations are explicitly recorded
- no functional limitation is waived

## 10) Manual feature matrix

Manual checks are required for areas not fully covered by automation.

### Dataset/setup

- front page loads
- setup flow opens and returns
- local TIFF fixture preprocesses
- preprocessed dataset imports
- public experiment opens

### Rendering

- MIP looks correct
- ISO looks correct
- BL looks correct
- slice mode looks correct
- segmentation looks correct
- multichannel overlays look correct
- background masks look correct
- 8-bit and 16-bit intensity render correctly

### Interaction

- hover readout updates
- camera movement works
- projection switch works
- saved camera views work
- playback works
- ROI drawing works
- ROI measurements work
- paintbrush works
- tracks upload and render
- track hover and selection work
- tooltips work

### Output

- screenshot export works
- screenshot orientation is correct
- screenshot color/brightness is correct
- recording UI behavior is unchanged

### VR

- VR session starts
- VR session ends and restores desktop state
- controller models appear
- controller rays appear
- playback HUD works
- channels HUD works
- tracks HUD works
- volume transform controls work
- foveation behavior is unchanged where supported

## 11) No-fallback verification

Run targeted searches after implementation:

```bash
rg "THREE.REVISION|0\\.161|WebGL1Renderer|LuminanceFormat|WebGLMultipleRenderTargets|copyTextureToTexture3D" src tests package.json package-lock.json
rg "safe mode|fallback|disable.*shader|disable.*texture|disable.*VR|old Three|legacy Three" src tests
```

Required result:

- no forbidden migration fallback remains
- any fallback-named existing sentinel resource is reviewed and documented as normal shader-uniform infrastructure, not migration recovery

## 12) Browser console acceptance

During e2e/manual checks, browser console must not contain:

- shader compile errors
- program link errors
- WebGL texture upload errors
- unsupported format/type warnings
- module resolution failures
- feature-disable warnings introduced by the migration

Any such message is a blocker until fixed or explicitly proven unrelated to the migration.
