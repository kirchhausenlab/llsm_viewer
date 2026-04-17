# Orthographic Projection Mode Program

Status: **Complete**
Start date: **2026-04-15**

This folder is the source of truth for adding a desktop orthographic projection mode alongside the current desktop perspective mode.

## Program objective

Allow the user to switch between:

- `perspective`
- `orthographic`

at any time in the desktop viewer, while preserving the current functional surface of the viewer and protecting the existing perspective mode from correctness or performance regressions.

## Non-negotiable invariants

1. Perspective mode behavior must remain correct.
2. Perspective mode performance must not regress as a consequence of orthographic support.
3. Orthographic mode must be designed as a first-class runtime path, not a low-quality fallback.
4. Desktop projection switching must preserve a sensible framing of the current scene instead of snapping to an unrelated view.
5. VR remains perspective-only for the initial program unless a later, separately approved design supersedes that decision.

## Scope

- Add explicit viewer projection state and UI controls.
- Support runtime toggling between perspective and orthographic camera behavior on desktop.
- Make reset, fit-to-view, follow-target, hover, picking, ROI, props, and playback work under both desktop projection modes.
- Make LOD/prefetch/performance policy projection-aware where distance-only heuristics are no longer valid.
- Add regression tests and benchmark gates that protect perspective mode.

## Locked out of scope

- WebXR orthographic support.
- Mobile-specific camera redesign.
- Large viewer-shell UX redesign unrelated to projection selection.
- Unifying desktop and VR camera semantics in this program.

## Definition of done

The program is complete only when all of the following are true:

1. Every backlog item in `BACKLOG.md` is `DONE`.
2. All roadmap phases in `ROADMAP.md` are `COMPLETE`.
3. Required checks in `TEST_PLAN.md` pass.
4. Required scenarios in `BENCHMARK_MATRIX.md` pass.
5. Perspective mode has explicit pre/post evidence showing no unacceptable correctness or performance regression.
6. `SESSION_HANDOFF.md` and `EXECUTION_LOG.md` are synchronized with the final implementation state.

## Completion summary

- Desktop viewer now supports runtime switching between perspective and orthographic projection.
- Perspective and orthographic use projection-aware camera/view-state handling.
- 3D volume rendering now has projection-specific shader/material variants.
- Adaptive LOD policy now consumes a projection-aware projected-pixels-per-voxel signal.
- Perspective mode remained green through:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `npm run -s test`
  - `npm run -s verify:fast`
- Smoke E2E coverage passed, including the new projection-switch scenario.

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `ROADMAP.md`
4. `BACKLOG.md`
5. `TEST_PLAN.md`
6. `BENCHMARK_MATRIX.md`
7. `RISK_REGISTER.md`
8. `SESSION_HANDOFF.md`
9. `EXECUTION_LOG.md`
10. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Before coding, claim items in `BACKLOG.md` by setting them to `IN_PROGRESS`.
2. Keep one active `IN_PROGRESS` item per high-contention file group.
3. Do not mark any item `DONE` without adding verification evidence paths.
4. After each session:
   - update `SESSION_HANDOFF.md`
   - append a timestamped note to `EXECUTION_LOG.md`
   - keep `ROADMAP.md` phase state accurate
5. Treat any perspective regression as a release blocker, not a follow-up item.
