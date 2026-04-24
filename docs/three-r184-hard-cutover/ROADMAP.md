# Roadmap

Status legend: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

Overall program status: `BLOCKED`

## Phase 0 - Baseline and contract lock

Status: `COMPLETE`

Goals:

- Confirm the exact current dependency state.
- Capture current verification baseline.
- Lock hard-cutover, no-fallback, functional-parity requirements.

Exit criteria:

- Baseline commands and outcomes are recorded in `EXECUTION_LOG.md`.
- Any pre-existing failures are documented separately from migration failures.
- Backlog items for the first implementation session are claimed.

## Phase 1 - Dependency upgrade

Status: `COMPLETE`

Goals:

- Move runtime and types to exact `0.184.0`.
- Refresh lockfile.

Exit criteria:

- `package.json` and `package-lock.json` resolve exact r184 versions.
- `npm ls three @types/three` reports the expected dependency graph.

## Phase 2 - Static API and import repairs

Status: `COMPLETE`

Goals:

- Make source and tests compile with r184.
- Standardize addon imports.
- Remove removed API usage.

Exit criteria:

- `npm run check:architecture` passes.
- `npm run typecheck` passes.
- `npm run typecheck:tests` passes.

## Phase 3 - Texture and renderer correctness

Status: `COMPLETE`

Goals:

- Make texture lifecycle rules explicit and r184-safe.
- Verify renderer, render-target, and color-space behavior.

Exit criteria:

- Unit tests cover legal texture reuse and required texture recreation.
- Browser tests show no WebGL texture upload warnings.
- Screenshot and ROI render-target checks pass.

## Phase 4 - Shader and line-addon hardening

Status: `COMPLETE`

Goals:

- Verify custom volume/slice shaders.
- Verify all `LineMaterial` patches under r184.

Exit criteria:

- Shader smoke tests pass.
- MIP, ISO, BL, slice, track, and ROI line paths are verified.
- No shader fallback path exists.

## Phase 5 - Feature parity verification

Status: `COMPLETE`

Goals:

- Verify all desktop viewer features.
- Verify route/setup/preprocess flows.
- Verify visual behavior and playback.

Exit criteria:

- Required automated tests in `TEST_PLAN.md` pass.
- Manual feature checks are recorded.
- No uninvestigated functional difference remains.

## Phase 6 - VR verification

Status: `BLOCKED`

Goals:

- Verify WebXR session behavior on r184.
- Verify controller models, rays, HUDs, and volume manipulation.

Exit criteria:

- Manual VR evidence is recorded.
- No VR feature is skipped or downgraded.

## Phase 7 - Performance and cleanup

Status: `COMPLETE`

Goals:

- Check for performance regressions.
- Remove temporary migration scaffolding.
- Run no-fallback scans.

Exit criteria:

- Perf results are recorded.
- No forbidden compatibility/fallback pattern remains.
- Docs reflect final state.

## Phase 8 - Closure

Status: `BLOCKED`

Goals:

- Close backlog.
- Close or accept risks.
- Finalize handoff and execution log.

Exit criteria:

- `CUTOVER_CHECKLIST.md` is complete.
- `BACKLOG.md` required items are `DONE`.
- `RISK_REGISTER.md` is resolved.
- `SESSION_HANDOFF.md` is current.

## Final Status Notes - 2026-04-24

- Phases 1-5 and 7 are complete with automated evidence in `EXECUTION_LOG.md` and `BACKLOG.md`.
- Phase 6 is blocked only by missing physical headset access in this environment. Automated/source VR checks passed, but the documentation contract requires real headset evidence.
- Phase 8 is blocked only by the same external VR verification requirement; the code cutover and automated verification gates are complete.
