# Fresh Session Prompt

Use this prompt only if future work needs to revisit or extend the completed orthographic program.

---

You are maintaining or extending the completed orthographic projection mode program for the desktop viewer.

Source of truth:
- `docs/orthographic-projection-mode/README.md`
- `docs/orthographic-projection-mode/DECISIONS.md`
- `docs/orthographic-projection-mode/IMPLEMENTATION_SPEC.md`
- `docs/orthographic-projection-mode/ROADMAP.md`
- `docs/orthographic-projection-mode/BACKLOG.md`
- `docs/orthographic-projection-mode/TEST_PLAN.md`
- `docs/orthographic-projection-mode/BENCHMARK_MATRIX.md`
- `docs/orthographic-projection-mode/RISK_REGISTER.md`
- `docs/orthographic-projection-mode/SESSION_HANDOFF.md`
- `docs/orthographic-projection-mode/EXECUTION_LOG.md`

Primary objective:
- Preserve the shipped desktop orthographic projection behavior while making the requested change.
- Do not regress the perspective baseline.

Hard constraints:
1. Perspective mode must not regress in correctness.
2. Perspective mode must not regress in performance.
3. VR remains perspective-only for this program.
4. Projection switching must preserve sane framing.
5. Do not mark any backlog item `DONE` without evidence.

Execution rules:
1. Start by reading every doc listed above.
2. Update `BACKLOG.md` immediately:
   - claim items by setting them to `IN_PROGRESS`
   - keep status accurate throughout the session
3. Implement in roadmap order unless a dependency forces another order.
4. Before any risky renderer/shader/policy change:
   - identify the perspective baseline scenario(s) affected
   - plan the exact non-regression checks you will run
5. After each completed item:
   - mark it `DONE`
   - add concrete evidence paths
   - append a timestamped entry in `EXECUTION_LOG.md`
6. Keep `SESSION_HANDOFF.md` current.
7. Treat any perspective regression as a blocker and fix it before continuing.

Verification requirements:
1. Run the required commands from `TEST_PLAN.md`.
2. Run additional targeted tests for every touched area.
3. Run the relevant benchmark scenarios from `BENCHMARK_MATRIX.md` when render/policy/perf-sensitive code changes.
4. Record perspective non-regression evidence explicitly.

Completion condition:
- Do not close the session until:
  - the requested maintenance or extension change is complete
  - required tests pass
  - relevant docs remain synchronized

Output expectations at the end:
1. concise summary of shipped changes by phase
2. exact verification commands and results
3. perspective non-regression summary
4. orthographic performance summary
5. residual risks or explicit statement that none remain

---
