# LOD0 Native-Resolution Program

Status: **Complete (all phases delivered and verified)**
Start date: **2026-02-28**
Completion date: **2026-02-28**

This folder is the source of truth for delivering stable native-resolution (`LOD0`) rendering in the 3D viewer (`MIP`, `ISO`, `BL`) with long-term performance and stability guarantees.

## Program objective

Render `LOD0` by default whenever feasible while preserving interactive performance and visual stability across playback, scrubbing, and camera motion.

## Scope

- Replace binary play/pause scale policy with adaptive, view-driven multiscale selection.
- Keep coarse scales visible while finer scales stream in; avoid blank holes.
- Redesign prefetch scheduling around motion + scale + timepoint priority.
- Improve GPU brick residency behavior for stable, low-churn LOD0 operation.
- Upgrade shader LOD behavior to projected-footprint-aware sampling and mode-specific refinement.
- Improve sharded read/decode throughput and move heavy runtime decode/assembly off the main thread.
- Expand benchmark and regression gates to include LOD0 readiness/stability metrics.

## Locked out of scope for this program

- Re-enabling shader brick-skip (`u_brickSkipEnabled`) in production.
- Changing core dataset format id or breaking schema compatibility for existing vNext datasets.
- Migrating renderer backend from WebGL2 to WebGPU.

## Definition of done

All backlog items in `BACKLOG.md` are `DONE`, all required checks in `TEST_PLAN.md` pass, and program closure is documented in:

- `SESSION_HANDOFF.md`
- `EXECUTION_LOG.md`
- `ROADMAP.md` (all phases `COMPLETE`)

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

1. Before coding, set claimed items to `IN_PROGRESS` in `BACKLOG.md`.
2. Keep one active `IN_PROGRESS` item per high-contention area.
3. After each completed item:
   - mark `DONE` in `BACKLOG.md`
   - add concrete evidence paths
   - append a dated entry in `EXECUTION_LOG.md`
4. Update `SESSION_HANDOFF.md` every session with exact next actions.
5. Do not mark an item `DONE` without verification evidence.
