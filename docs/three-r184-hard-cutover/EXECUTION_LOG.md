# Execution Log

## 2026-04-24 - Documentation setup

Status: `DOCUMENTED`

Actions:

- Created the Three r184 hard-cutover documentation set.
- Added the program to the root docs index.

Evidence:

- Documentation files exist under `docs/three-r184-hard-cutover/`.

Implementation status:

- No dependency or source-code migration has started.
- No verification commands for implementation have been run as part of this documentation setup.

Next actions:

- Run baseline verification.
- Upgrade dependencies.
- Begin backlog execution.

## 2026-04-24 - Handoff detail expansion

Status: `DOCUMENTED`

Actions:

- Added `IMPLEMENTATION_NOTES.md`.
- Added exact addon import mappings.
- Added repo-specific migration-guide notes for r161 to r184.
- Added source touchpoint inventory.
- Added known first-failure checks.
- Added stricter backlog completion gates.
- Updated read order and resume prompt to include implementation notes.

Evidence:

- `IMPLEMENTATION_NOTES.md` exists under `docs/three-r184-hard-cutover/`.
- `BACKLOG.md` now includes per-item and final command evidence gates.

Implementation status:

- No dependency or source-code migration has started.
- Changes remain documentation-only.

## 2026-04-24 - Baseline verification before dependency cutover

Status: `BASELINE_CAPTURED`

Actions:

- Claimed `T184-001`.
- Ran the baseline command set from `TEST_PLAN.md` before changing Three.js packages.

Evidence:

- `npm run check:architecture` passed: `Import boundaries OK.`
- `npm run typecheck` passed.
- `npm run typecheck:tests` passed.
- `npm run typecheck:strict-unused` failed before migration with unused-declaration errors in:
  - `src/components/pages/ChannelCard.tsx`
  - `src/components/viewers/volume-viewer/useVolumeResources.ts`
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `npm run test` passed: 236 tests, 233 pass, 3 skipped, 0 failed.
- `npm run build` passed with the pre-existing Vite large-chunk warning.

Implementation status:

- Baseline failure recorded as pre-existing: `typecheck:strict-unused`.
- Dependency and source-code migration has not yet started.

## 2026-04-24 - Three r184 hard cutover implementation

Status: `IMPLEMENTED`

Actions:

- Upgraded `three` and `@types/three` to exact `0.184.0` and refreshed the lockfile.
- Standardized source and test addon imports to `three/addons/...js`.
- Switched TypeScript module resolution to `Bundler` so r184 addon subpath exports resolve cleanly.
- Removed r184-unsupported `THREE.LuminanceFormat` usage from tests.
- Made the production renderer require WebGL2 explicitly and preserve existing output color-space, alpha, pixel-ratio, clear, disposal, and XR setup behavior.
- Hardened `DataTexture` and `Data3DTexture` update helpers so dimension/format/type/internalFormat/color-space identity changes recreate and dispose textures.
- Made mipmap, unpack-alignment, type, internalFormat, and color-space intent explicit for volume, slice, colormap, palette, fallback/sentinel, ROI, and HUD/canvas texture paths.
- Added shader-patch tests for track `LineMaterial` time-window injection and ROI BL line-material injection.
- Fixed pre-existing strict-unused failures in `ChannelCard`, `useVolumeResources`, preprocessing, and route layer volume code.
- Fixed playback startup buffering so a missing/pending warmup request cannot leave playback stuck in `Cancel playback buffering` indefinitely.
- Updated e2e expectations for the visible VR menu item and refreshed the public-experiment visual snapshot to match the current source UI.

Dependency evidence:

- `npm ls three @types/three`:
  - `@types/three@0.184.0`
  - `three@0.184.0`
- `package.json` pins:
  - `"three": "0.184.0"`
  - `"@types/three": "0.184.0"`

Verification evidence:

- `npm run typecheck`: passed.
- `npm run typecheck:tests`: passed.
- `npm run typecheck:strict-unused`: passed.
- `npm run test`: passed; 236 tests, 233 pass, 3 skipped, 0 failed.
- `npm run test -- tests/useVolumeResources.test.ts`: passed.
- `npm run test -- tests/useTrackRendering.test.ts`: passed.
- `npm run test -- tests/roiRenderResource.test.ts`: passed.
- `npm run test -- tests/useVolumeRenderSetup.test.ts`: passed.
- `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-playback-smoke.spec.ts tests/e2e/viewer-16bit-playback.spec.ts tests/e2e/top-menu-smoke.spec.ts`: passed, 5 tests.
- `npm run test:e2e:visual`: passed, 3 tests.
- `npm run verify:ui`: passed end to end:
  - 18 frontend tests passed.
  - 3 visual tests passed.
  - 21 Chromium smoke tests passed.
  - 3 Chromium visual e2e tests passed.
- `npm run verify:fast`: passed end to end:
  - architecture check passed.
  - typecheck and test typecheck passed.
  - coverage suite passed with 246 passing tests and 5 expected skips.
  - hotspot coverage suite passed.
  - build passed with the existing Vite large-chunk warning.
- `npm run test:perf`: passed with 10 checks passed and 2 optional real-dataset checks skipped because fixtures were absent.
- `npm run test:e2e:preprocess-perf`: passed with `[preprocess-perf] elapsedMs=14126 files=5 budgetMs=240000`.
- `npm run test:e2e:closeup-perf`: passed with `farMedianMs=0.20`, `farP95Ms=0.30`, `closeMedianMs=0.20`, `closeP95Ms=0.30`.

Scan evidence:

- `rg -n "three/examples/jsm|THREE\\.REVISION|0\\.161|WebGL1Renderer|LuminanceFormat|LuminanceAlphaFormat|WebGLMultipleRenderTargets|copyTextureToTexture3D" src tests package.json package-lock.json || true`: no matches.
- `rg -n "safe mode|disable.*shader|disable.*texture|disable.*VR|old Three|legacy Three|compat(ibility)? mode|dual path|three r161|three-r161" src tests package.json package-lock.json || true`: no matches.
- `rg -n "from ['\\\"]three/addons|import\\(['\\\"]three/addons" src tests || true`: all addon imports use `three/addons/...js`.
- WebGL context scan found the production `new THREE.WebGLRenderer` path and e2e diagnostic/metrics probes only. The production renderer rejects non-WebGL2 contexts.

Blocked evidence:

- Real headset VR verification was not performed because this environment does not expose a physical WebXR headset.
- Automated/source VR evidence passed through `verify:fast` and `verify:ui`, including VR bridge/runtime/input/render-style tests and hotspot coverage.
