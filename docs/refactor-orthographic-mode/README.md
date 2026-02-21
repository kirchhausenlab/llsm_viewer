# Orthographic Projection Refactor Program

Status: **Complete**
Start date: **2026-02-21**
Completion date: **2026-02-21**

This folder is the source of truth for adding an orthographic projection mode to the 3D volume viewer while preserving the existing perspective mode.

## Objectives

- Add viewer-level projection toggle: `Perspective` <-> `Orthographic`.
- Preserve current perspective behavior as baseline (visual and performance parity).
- Keep core 3D interactions functional in both projection modes.
- Keep VR behavior explicit: orthographic is disabled during VR sessions.
- Enable multi-session execution with low context loss.

## Out of scope

- Orthographic rendering inside VR/XR.
- A full rewrite of the entire raymarching model beyond what is required for dual projection support.
- UI redesign beyond projection-mode controls and compatibility messaging.

## Final outcome

- Orthographic projection mode is implemented alongside perspective mode.
- Projection mode is viewer-level and exposed in viewer settings controls.
- Core render context, shader ray generation, and interaction/camera flows are projection-aware.
- VR is explicitly guarded to perspective mode.
- Verification gates (`typecheck`, `typecheck:tests`, `test`) pass.

## Feasibility summary

- Feasibility: **High**.
- Complexity: **Medium to large** due to perspective assumptions across camera typing, shader ray generation, and interaction ray setup.
- Main risk areas: shader ray math parity, interaction regression (hover/picking/slicing), and resource/LOD heuristics currently tuned for perspective distance/FOV.

See `FEASIBILITY_REPORT.md` and `COMPATIBILITY_MATRIX.md` for detail.

## Definition of done

All required conditions are satisfied:

- Backlog items in `BACKLOG.md` are `DONE` or intentionally descoped with rationale.
- Required checks in `TEST_PLAN.md` pass.
- Perspective mode remains non-regressed in behavior and runtime performance bounds.
- Orthographic mode supports agreed-compatible features.
- VR flow is explicitly guarded (orthographic unavailable during VR).
- `SESSION_HANDOFF.md` and `EXECUTION_LOG.md` reflect current truth.

## Read order

1. `DECISIONS.md`
2. `FEASIBILITY_REPORT.md`
3. `IMPLEMENTATION_SPEC.md`
4. `COMPATIBILITY_MATRIX.md`
5. `PERF_PLAN.md`
6. `ROADMAP.md`
7. `BACKLOG.md`
8. `TEST_PLAN.md`
9. `SESSION_HANDOFF.md`
10. `EXECUTION_LOG.md`
11. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Before coding, set claimed backlog items to `IN_PROGRESS`.
2. After implementation, mark items `DONE` only with evidence paths.
3. Append a dated entry to `EXECUTION_LOG.md` after each coding session.
4. Refresh `SESSION_HANDOFF.md` before ending session.
5. Do not change assumptions in `DECISIONS.md` without recording why.
