# Fresh Session Prompt

Use this prompt in a new agent session to continue orthographic implementation with continuity:

---

Implement orthographic projection mode using the docs workspace at `docs/refactor-orthographic-mode/`.

Required behavior:

1. Add projection toggle (`perspective` and `orthographic`) for the 3D viewer.
2. Preserve perspective behavior and performance baseline.
3. Make core 3D interactions work in orthographic mode (hover, picking, slicing, clipping).
4. Keep VR perspective-only; orthographic must be disabled during VR.

Autonomy requirement:

- Execute multiple backlog items per session when safe.
- Do not stop between small milestones unless blocked.
- Stop and ask only if a product decision is required or you hit a hard blocker.

Context management requirement:

- Read docs in this order:
  1. `DECISIONS.md`
  2. `FEASIBILITY_REPORT.md`
  3. `IMPLEMENTATION_SPEC.md`
  4. `BACKLOG.md`
  5. `TEST_PLAN.md`
- Keep docs updated as source of truth (`BACKLOG`, `EXECUTION_LOG`, `SESSION_HANDOFF`).

Execution protocol:

1. Claim backlog items by setting them to `IN_PROGRESS`.
2. Implement changes.
3. Run required checks from `TEST_PLAN.md`.
4. Mark completed items `DONE` with evidence paths.
5. Append dated summary in `EXECUTION_LOG.md`.
6. Refresh `SESSION_HANDOFF.md` with immediate next steps.

Quality bar:

- No perspective regressions in core behavior.
- Orthographic mode must not be partially wired without clear feature guards.
- If any item is blocked, mark `BLOCKED` and document root cause plus unblocking path.

---
