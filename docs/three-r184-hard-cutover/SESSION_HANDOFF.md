# Session Handoff

Last updated: `2026-04-24`

## Current state

- Code and dependency cutover to `three@0.184.0` and `@types/three@0.184.0` is implemented.
- `package.json` and `package-lock.json` pin both packages to exact `0.184.0`.
- Addon imports use `three/addons/...js`; no `three/examples/jsm` imports remain.
- Removed API scans are clean for `THREE.LuminanceFormat`, `THREE.REVISION`, WebGL1 renderer paths, `WebGLMultipleRenderTargets`, and `copyTextureToTexture3D`.
- Renderer setup now requires WebGL2 explicitly.
- Texture update paths were hardened so identity changes recreate `DataTexture` / `Data3DTexture` instances instead of mutating uploaded identity in place.
- Shader patch coverage was added for track and ROI line-material injections.
- Playback startup buffering now has a bounded wait so it cannot leave the UI stuck in `Cancel playback buffering` when warmup resources remain missing or pending.
- Automated verification is green.

## Verification evidence

- `npm ls three @types/three`: only `three@0.184.0` and `@types/three@0.184.0`.
- `npm run typecheck:strict-unused`: passed.
- `npm run test`: passed; 236 tests, 233 pass, 3 skipped.
- `npm run verify:fast`: passed; coverage suites passed with 246 passing tests and 5 expected skips, build passed with the existing large-chunk warning.
- `npm run verify:ui`: passed; 18 frontend tests, 3 visual tests, 21 Chromium smoke tests, and 3 Chromium visual e2e tests.
- `npm run test:perf`: passed; 10 checks passed, 2 optional real-dataset checks skipped because fixtures were absent.
- `npm run test:e2e:preprocess-perf`: passed; `elapsedMs=14126`, `files=5`, `budgetMs=240000`.
- `npm run test:e2e:closeup-perf`: passed; `farP95Ms=0.30`, `closeP95Ms=0.30`.

## Remaining blocker

- Real headset VR verification is not complete because no physical WebXR headset is attached in this environment.
- Automated/source VR evidence passed through typecheck, build, VR bridge/runtime/input/render-style tests, hotspot coverage, and browser smoke coverage.
- `BACKLOG.md` item `T184-019`, `ROADMAP.md` Phase 6, and the WebXR/manual-regression risks remain open only for that physical-device pass.

## Do not regress

- Do not add `THREE.REVISION` branches.
- Do not add old/new import fallbacks.
- Do not reintroduce WebGL1 renderer fallback behavior.
- Do not disable shader, texture, or VR features to get tests passing.
- Keep texture identity changes as recreate/dispose operations, not metadata mutation on already-uploaded textures.
