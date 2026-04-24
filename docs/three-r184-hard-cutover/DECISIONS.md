# Decisions

Status legend: `LOCKED`, `PROPOSED`, `SUPERSEDED`

## DR-T184-001: Target exact Three.js r184

- Status: `LOCKED`
- Decision:
  - Pin `three` to exact `0.184.0`.
  - Pin `@types/three` to exact `0.184.0`.
- Rationale:
  - The migration target is a single known runtime and type surface.
  - The current app already has runtime/type drift: `three` is `^0.161.0`, while `@types/three` is `^0.180.0`.
- Consequence:
  - The lockfile must resolve both packages to `0.184.0`.
  - No caret range should allow an unreviewed future Three.js release.

## DR-T184-002: Hard cutover, no backward compatibility

- Status: `LOCKED`
- Decision:
  - The app supports the r184 runtime after the cutover.
  - It does not support r161 after the cutover.
- Rationale:
  - Keeping dual Three.js compatibility creates test matrix expansion and hidden behavior drift.
  - This project prioritizes clean forward progress over legacy support.
- Consequence:
  - No conditional code based on `THREE.REVISION`.
  - No compatibility wrappers for removed constants or APIs.
  - No package alias for old Three.js.

## DR-T184-003: No fallbacks

- Status: `LOCKED`
- Decision:
  - Do not add runtime fallback paths during the migration.
- Rationale:
  - The required outcome is exact functional continuity on r184, not graceful degradation.
  - Fallbacks can mask broken shader, texture, import, or VR behavior.
- Consequence:
  - Broken MIP/ISO/BL rendering must be fixed, not bypassed.
  - Broken track/ROI line patches must be fixed, not disabled.
  - Broken VR controller/HUD behavior must be fixed, not omitted.
  - Unsupported WebGL conditions must fail explicitly.

## DR-T184-004: WebGL2 remains the renderer backend

- Status: `LOCKED`
- Decision:
  - Keep `THREE.WebGLRenderer` as the renderer.
  - Treat WebGL2 as the runtime target.
- Rationale:
  - Three.js removed WebGL1 support from `WebGLRenderer` after r161.
  - The app's volume renderer, 3D textures, and shader stack are already WebGL2-oriented.
- Consequence:
  - No WebGL1 fallback.
  - No WebGPU migration in this program.
  - Any WebGL2 capability failure must be explicit and actionable.

## DR-T184-005: Use r184 addon import contract

- Status: `LOCKED`
- Decision:
  - Standardize addon imports to the r184 package contract during implementation.
- Rationale:
  - r184 exposes `three/addons/*` as the modern public addon path.
  - Using one import convention avoids accidental compatibility thinking.
- Consequence:
  - Audit all imports from `three/examples/jsm/*`.
  - Replace them with the corresponding `three/addons/*` imports if TypeScript, Vite, and tests accept the path cleanly.

## DR-T184-006: Texture identity changes require texture recreation

- Status: `LOCKED`
- Decision:
  - Any change to texture dimensions, format, type, internal format, or immutable upload identity must recreate the texture.
- Rationale:
  - Modern Three.js and WebGL texture handling are stricter about dimensions and format after first upload.
  - Silent in-place mutation risks stale GPU state or invalid uploads.
- Consequence:
  - Texture update helpers must distinguish data refresh from identity change.
  - Rebuild conditions must be explicit and tested.

## DR-T184-007: Shader patch anchors are owned behavior

- Status: `LOCKED`
- Decision:
  - Any `onBeforeCompile` string patch used by the app is considered owned behavior and must be tested.
- Rationale:
  - The app patches `LineMaterial` shaders for track time windows and ROI Beer-Lambert attenuation.
  - Three.js addon shader source can change without TypeScript detecting a problem.
- Consequence:
  - If a patch anchor changes, update the patch for r184.
  - Do not skip the patch or disable the feature.
  - Add or update tests that prove the injected uniforms and shader code are present.

## DR-T184-008: Functional parity is the release gate

- Status: `LOCKED`
- Decision:
  - Passing typecheck and build is insufficient.
  - The release gate is functional parity across the viewer feature matrix.
- Rationale:
  - Three.js migrations can fail at shader compile time, WebGL upload time, or interaction time.
  - The app is a visual/interactive application, so runtime verification is mandatory.
- Consequence:
  - Automated browser checks and manual checks are required.
  - VR requires manual evidence unless a real-device automation harness exists.

## DR-T184-009: Existing sentinel resources must not become migration fallbacks

- Status: `LOCKED`
- Decision:
  - Existing placeholder or sentinel textures may remain only if they are part of normal shader uniform binding semantics.
  - They must not be used to hide a failed r184 migration.
- Rationale:
  - Some current files contain fallback-named texture helpers for valid shader-uniform defaults.
  - The migration must not use those helpers as error recovery.
- Consequence:
  - Audit fallback-named resources.
  - Rename or document sentinel resources if needed to avoid confusing them with forbidden fallbacks.
