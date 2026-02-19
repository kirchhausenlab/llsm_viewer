# Per-Layer Render Style Program (MIP / ISO / BL)

Status: **Active (planning complete, implementation pending)**
Start date: **2026-02-18**

This folder is the source of truth for implementing Beer-Lambert (`BL`) as a third 3D render style and converting render-style selection from global to per-layer.

## Scope

- Add `BL` as a 3D volume render style, selectable alongside `MIP` and `ISO`.
- Make render style **per-layer** (not global).
- Expose BL controls immediately in the UI (first implementation pass).
- Keep MIP and ISO visual behavior unchanged when those modes are selected.
- Use per-mode shader variants so BL availability does not impose meaningful runtime overhead on MIP/ISO.

## Out of scope

- A full physically based lighting pipeline rewrite.
- Deep compositing between arbitrary transparent meshes and volume.
- Changes to 2D planar rendering behavior.

## Definition of done

All backlog items marked `DONE` in `BACKLOG.md`, all required verification in `TEST_PLAN.md` passes, and the final handoff/closure notes are updated in:

- `SESSION_HANDOFF.md`
- `EXECUTION_LOG.md`

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `ROADMAP.md`
4. `BACKLOG.md`
5. `TEST_PLAN.md`
6. `SESSION_HANDOFF.md`
7. `EXECUTION_LOG.md`
8. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Before coding, claim backlog items in `BACKLOG.md` by setting status to `IN_PROGRESS`.
2. After coding, add evidence paths and set completed items to `DONE`.
3. Append a dated entry in `EXECUTION_LOG.md` with:
   - what changed
   - verification run
   - risks or follow-ups
4. Refresh `SESSION_HANDOFF.md` with current state and immediate next actions.
5. Do not mark items `DONE` without code/test evidence paths.

