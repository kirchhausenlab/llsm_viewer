# Three r184 Hard Cutover

Status: `IMPLEMENTED_WITH_EXTERNAL_VR_BLOCKER`
Start date: `2026-04-24`

This folder is the source of truth for migrating the viewer from Three.js `0.161.0` to Three.js `0.184.0`.

Implementation and automated verification are complete as of `2026-04-24`. The only remaining blocker is real WebXR headset verification, which cannot be performed in this environment.

## Program objective

Move the app to exact Three.js `0.184.0` while preserving every user-visible behavior of the webapp.

Functional parity is mandatory. After the refactor, the viewer must behave the same for dataset setup, preprocessing, loading, rendering, playback, interaction, annotations, tracks, screenshots, and VR. A feature that works today must still work after the cutover.

## Non-negotiable constraints

1. Hard cutover only.
   - The app targets Three.js `0.184.0`.
   - No runtime branch for old Three.js behavior.
   - No compatibility shim for removed Three.js APIs.
   - No package downgrade path.

2. No fallbacks.
   - Do not catch an r184 failure and silently disable a feature.
   - Do not add alternate old/new renderer, shader, texture, or import paths.
   - Do not add "safe mode" rendering that hides broken MIP, ISO, BL, slice, track, ROI, hover, or VR behavior.
   - Do not treat a blank texture, disabled overlay, disabled line shader patch, or disabled VR controller model as acceptable recovery.

3. Exact behavior preservation.
   - Existing features must remain available.
   - Visual output must remain equivalent except for differences proven to be unavoidable Three.js engine changes and approved before merge.
   - Interaction semantics must not change.
   - Performance must not regress beyond documented thresholds.

4. Fail explicitly instead of falling back.
   - Unsupported platform conditions should produce clear errors.
   - WebGL2 is the renderer target.
   - The cutover must not attempt WebGL1 recovery.

5. Do not introduce broader renderer architecture changes.
   - No WebGPU migration.
   - No React Three Fiber rewrite.
   - No visual-design or product-behavior redesign.

## Scope

- Upgrade `three` and `@types/three` to exact `0.184.0`.
- Refresh `package-lock.json`.
- Standardize Three addon imports for the r184 package contract.
- Repair TypeScript, bundling, and runtime issues caused by the upgrade.
- Audit all WebGL texture creation/update paths.
- Audit custom GLSL and `onBeforeCompile` shader patches.
- Verify desktop rendering, slice rendering, annotations, tracks, screenshots, playback, and VR.
- Remove or rename migration-only compatibility concepts introduced during the work.

## Locked out of scope

- Backward compatibility with Three.js `0.161.0`.
- Feature flags that switch between r161 and r184 behavior.
- Legacy browser support through WebGL1.
- Runtime fallback to disabled rendering features.
- Any schema, preprocessing, or UI behavior change unrelated to the Three.js cutover.

## Definition of done

The cutover is complete only when:

1. `package.json` and `package-lock.json` resolve `three` and `@types/three` to exact `0.184.0`.
2. No old/new Three.js compatibility branch remains.
3. No migration fallback path remains.
4. Every item in `CUTOVER_CHECKLIST.md` is complete.
5. Required checks in `TEST_PLAN.md` pass.
6. Manual verification covers any feature not realistically covered by automated tests, especially VR.
7. All open risks are closed or explicitly accepted.
8. `BACKLOG.md`, `ROADMAP.md`, and `EXECUTION_LOG.md` are updated with evidence.

## Source references

- Three.js migration guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide
- Three npm package: https://www.npmjs.com/package/three
- `@types/three` npm package: https://www.npmjs.com/package/@types/three

Planning-time package check:

- `npm view three version` returned `0.184.0`.
- `npm view @types/three version` returned `0.184.0`.

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `IMPLEMENTATION_NOTES.md`
4. `AUDIT_CHECKLIST.md`
5. `CUTOVER_CHECKLIST.md`
6. `ROADMAP.md`
7. `BACKLOG.md`
8. `TEST_PLAN.md`
9. `RISK_REGISTER.md`
10. `SESSION_HANDOFF.md`
11. `EXECUTION_LOG.md`
12. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Before implementation, mark claimed backlog items as `IN_PROGRESS`.
2. Keep one active `IN_PROGRESS` item per high-contention file group.
3. Do not mark an item `DONE` without command output, test evidence, or a manual verification note.
4. Do not use a fallback to get past a failing verification item.
5. Update `SESSION_HANDOFF.md` before stopping work.
6. Append dated implementation and verification notes to `EXECUTION_LOG.md`.
