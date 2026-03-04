# Hierarchical Empty-Space Skipping Program

Status: **Active (planning complete, implementation pending)**
Start date: **2026-03-03**

This folder is the source of truth for a hard-cutover reimplementation of brick skipping using hierarchical empty-space skipping in the 3D viewer.

## Program objective

Re-enable skip acceleration with robust correctness and strong speedups by replacing per-step leaf-brick checks with hierarchical empty-space traversal that works across all 3D render styles:

- `MIP`
- `ISO`
- `BL`

## Scope

- Replace current leaf-only skip checks with hierarchical node traversal.
- Change preprocessing output schema to include skip hierarchy metadata.
- Hard-cutover dataset/runtime contracts (no backward compatibility path).
- Keep skip behavior correct with current WebGL2 + Three.js stack.
- Ensure behavior is correct for both sampling modes:
  - `linear`
  - `nearest`
- Keep skip active during camera motion.

## Locked out of scope

- Rust/WebGPU migration.
- Compatibility with old preprocessed dataset format.
- Runtime "safe mode" fallback to no-skip behavior.

## Definition of done

All backlog items in `BACKLOG.md` are `DONE`, all required checks in `TEST_PLAN.md` pass, and closure is documented in:

- `SESSION_HANDOFF.md`
- `EXECUTION_LOG.md`
- `ROADMAP.md` (all phases `COMPLETE`)

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `TRAVERSAL_ALGORITHM.md`
4. `CUTOVER_CHECKLIST.md`
5. `ROADMAP.md`
6. `BACKLOG.md`
7. `TEST_PLAN.md`
8. `BENCHMARK_MATRIX.md`
9. `RISK_REGISTER.md`
10. `SESSION_HANDOFF.md`
11. `EXECUTION_LOG.md`
12. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Before coding, set claimed items to `IN_PROGRESS` in `BACKLOG.md`.
2. Keep one active `IN_PROGRESS` item per high-contention file group.
3. After each completed item:
   - mark `DONE` in `BACKLOG.md`
   - add concrete evidence paths
   - append a dated entry in `EXECUTION_LOG.md`
4. Update `SESSION_HANDOFF.md` every session with exact next actions.
5. Do not mark any item `DONE` without verification evidence.
