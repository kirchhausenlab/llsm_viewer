# Fresh Session Prompt

Use this prompt in a new agent session to execute the implementation with continuity:

---

Implement the per-layer render-style + BL feature using the docs workspace at `docs/renderstyle-bl-mode/`.

Required behavior:

1. Render style must be per-layer.
2. Desktop UI must show explicit `MIP`, `ISO`, and `BL` buttons.
3. BL controls must be exposed immediately.
4. Use per-mode shader variants so MIP/ISO runtime behavior is not penalized by dormant BL logic.

Autonomy requirement (important):

- Execute as much as possible in a single run.
- Do not stop just to ask "should I continue?" between backlog items.
- Assume continuation is approved unless a true blocker is encountered.
- Only stop and ask the user if:
  1. crucial product/behavior feedback is required to avoid likely wrong implementation, or
  2. session context usage exceeds ~85% and a safe handoff is needed.

Context management requirement:

- Aggressively manage context budget.
- Use subagents and parallel exploration where useful.
- Summarize and compress intermediate findings instead of carrying large raw dumps.
- Keep docs updated as the compact source of truth (`BACKLOG`, `EXECUTION_LOG`, `SESSION_HANDOFF`) so work can continue across sessions.

Before coding:

1. Read, in order:
   - `docs/renderstyle-bl-mode/DECISIONS.md`
   - `docs/renderstyle-bl-mode/IMPLEMENTATION_SPEC.md`
   - `docs/renderstyle-bl-mode/BACKLOG.md`
   - `docs/renderstyle-bl-mode/TEST_PLAN.md`
2. Set all items you actively take on to `IN_PROGRESS` in `BACKLOG.md`.

Execution strategy:

1. Work backlog items in order (`BLR-001` upward), but parallelize independent tasks when safe.
2. Keep implementing continuously across multiple backlog items in this same run.
3. After each completed item:
   - mark it `DONE` with evidence paths in `BACKLOG.md`
   - append a concise dated entry in `EXECUTION_LOG.md`
4. Keep `SESSION_HANDOFF.md` current with status and immediate next actions.

Verification:

- Run the minimum checks listed in `docs/renderstyle-bl-mode/TEST_PLAN.md`.
- Run additional relevant tests for touched areas.
- If failures occur, fix them in-session when feasible; otherwise log root cause + follow-up backlog id.

Deliverable for this session:

- Complete as many backlog items as possible end-to-end in one run (not only `BLR-001`/`BLR-002`), including implementation + verification + docs updates.
- Stop only for true blockers requiring crucial user feedback, or when context usage crosses ~85% and handoff is required.

---
