# Cutover Checklist

This checklist is mandatory for completing the Three.js r184 hard cutover.

## A) Dependency cutover

1. `three` is pinned to exact `0.184.0`.
2. `@types/three` is pinned to exact `0.184.0`.
3. `package-lock.json` resolves both packages to exact `0.184.0`.
4. `npm ls three @types/three` shows no unexpected duplicate versions.
5. No r161 dependency, alias, vendored module, or compatibility shim remains.

## B) Import cutover

1. Three addon imports use the selected r184 public import path.
2. Source and tests use the same import convention.
3. No old/new addon import fallback exists.
4. Vite build chunks Three.js correctly.

## C) API cutover

1. Removed constants and APIs are gone.
2. `THREE.LuminanceFormat` is removed.
3. No `WebGL1Renderer` or WebGL1 fallback is used.
4. No `WebGLMultipleRenderTargets` path exists.
5. No `copyTextureToTexture3D` usage remains.
6. No code branches on `THREE.REVISION`.

## D) Renderer cutover

1. Renderer setup works with r184.
2. WebGL2 target is explicit.
3. Canvas alpha behavior is unchanged.
4. Output color space is unchanged.
5. Pixel-ratio behavior is unchanged.
6. XR enablement is unchanged.
7. Screenshot and ROI render targets work.

## E) Texture cutover

1. Texture identity changes recreate textures.
2. Data-only changes update existing textures only when legal.
3. `DataTexture` paths are verified.
4. `Data3DTexture` paths are verified.
5. Mipmap behavior is explicit.
6. Color-space behavior is explicit.
7. No WebGL texture upload warnings remain.

## F) Shader cutover

1. Volume shader compiles in all active variants.
2. Slice shader compiles.
3. Inline background/ROI shaders compile.
4. `LineMaterial` patches apply under r184.
5. No shader path is disabled as a migration fallback.
6. Browser console has no shader compile errors.

## G) Feature parity cutover

1. Front page/setup behavior is unchanged.
2. Preprocess/import behavior is unchanged.
3. Perspective rendering is unchanged.
4. Orthographic rendering is unchanged.
5. MIP rendering is unchanged.
6. ISO rendering is unchanged.
7. BL rendering is unchanged.
8. Slice rendering is unchanged.
9. Segmentation rendering is unchanged.
10. Playback behavior is unchanged.
11. Hover behavior is unchanged.
12. ROI behavior is unchanged.
13. Paintbrush behavior is unchanged.
14. Track behavior is unchanged.
15. Screenshot/recording behavior is unchanged.
16. VR behavior is unchanged.

## H) No-fallback cutover

1. No old/new Three.js runtime branch remains.
2. No old/new shader branch remains.
3. No old/new texture branch remains.
4. No old/new addon import branch remains.
5. No feature-disable recovery path was added.
6. No migration fallback mode remains in UI, state, tests, or docs.

## I) Verification cutover

1. `npm run check:architecture` passes.
2. `npm run typecheck` passes.
3. `npm run typecheck:tests` passes.
4. `npm run typecheck:strict-unused` passes.
5. `npm run test` passes.
6. `npm run test:coverage` passes.
7. `npm run test:coverage:hotspots` passes.
8. `npm run build` passes.
9. Required e2e tests pass.
10. Required visual tests pass.
11. Required perf tests pass or accepted perf notes are documented.
12. Manual VR verification is recorded.

## J) Documentation cutover

1. `BACKLOG.md` has no unfinished required item.
2. `ROADMAP.md` phases are complete.
3. `RISK_REGISTER.md` has no unaccepted open risk.
4. `SESSION_HANDOFF.md` reflects final state.
5. `EXECUTION_LOG.md` includes commands, outcomes, and manual evidence.

## Completion Status - 2026-04-24

- Sections A-H are complete for source code, dependency state, automated browser behavior, and no-fallback scans.
- Section I items 1-11 are complete. The exact command evidence is recorded in `EXECUTION_LOG.md` and `BACKLOG.md`.
- Section I item 12 is blocked by the absence of a physical WebXR headset in this environment. Automated/source VR checks passed, but the real-device requirement remains open.
- Section J is current, with the same real-headset VR blocker reflected in `BACKLOG.md`, `ROADMAP.md`, `RISK_REGISTER.md`, and `SESSION_HANDOFF.md`.
