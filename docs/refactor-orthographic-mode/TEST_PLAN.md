# Test Plan

This plan defines required verification for orthographic projection rollout.

## 1) Required automated checks

Minimum required before marking major backlog slices `DONE`:

- `npm run -s typecheck`
- `npm run -s typecheck:tests`
- targeted test suites for touched modules
- `npm run -s test` (before major merge/cutover)

If UI/interaction behavior changes materially:

- `npm run verify:ui` or equivalent targeted UI/browser tests

## 2) Required test coverage areas

- camera abstraction and mode switching
- shader uniform and mode-path correctness
- pointer ray helper behavior for both camera types
- hover/picking/slicing parity checks
- camera fit/reset behavior in both modes
- VR guard behavior with orthographic active
- perspective non-regression checks

## 3) Manual verification checklist

Run manual checks in both projection modes where applicable:

- volume is visible and stable while orbiting/panning/zooming
- clipping/slice interactions behave as expected
- hover sample coordinates/intensity remain sensible
- labels/tooltips follow correct picked target
- screenshot/recording still works
- entering VR from orthographic follows decided guard behavior

Record findings in `EXECUTION_LOG.md` with date and environment.

## 4) Performance verification

Use `PERF_PLAN.md` matrix:

- compare perspective-before vs perspective-after
- compare perspective vs orthographic across required scene/camera cases
- record avg and p95 frame time and any available sampling diagnostics

## 5) Failure handling policy

- Do not mark backlog items `DONE` when failures remain unresolved.
- If blocked, set item to `BLOCKED` and document root cause plus next action in:
  - `BACKLOG.md`
  - `SESSION_HANDOFF.md`
  - `EXECUTION_LOG.md`
