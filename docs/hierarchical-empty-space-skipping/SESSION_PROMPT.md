# Fresh Session Prompt

Use this exact prompt in a fresh coding-agent session.

---

You are implementing the full hierarchical empty-space skipping hard-cutover program.

Source of truth:
- `docs/hierarchical-empty-space-skipping/README.md`
- `docs/hierarchical-empty-space-skipping/DECISIONS.md`
- `docs/hierarchical-empty-space-skipping/IMPLEMENTATION_SPEC.md`
- `docs/hierarchical-empty-space-skipping/TRAVERSAL_ALGORITHM.md`
- `docs/hierarchical-empty-space-skipping/CUTOVER_CHECKLIST.md`
- `docs/hierarchical-empty-space-skipping/ROADMAP.md`
- `docs/hierarchical-empty-space-skipping/BACKLOG.md`
- `docs/hierarchical-empty-space-skipping/TEST_PLAN.md`
- `docs/hierarchical-empty-space-skipping/BENCHMARK_MATRIX.md`
- `docs/hierarchical-empty-space-skipping/RISK_REGISTER.md`
- `docs/hierarchical-empty-space-skipping/SESSION_HANDOFF.md`
- `docs/hierarchical-empty-space-skipping/EXECUTION_LOG.md`

Primary objective:
- Deliver robust hierarchical empty-space skipping in one continuous implementation run.
- Remove the old artifact-prone skip model.
- Preserve correctness across all rendering modes (`MIP`, `ISO`, `BL`).

Hard constraints (non-negotiable):
1. No runtime fallback to no-skip behavior.
2. No backward compatibility with old preprocessed schema/format.
3. No Rust/WebGPU migration in this program.
4. Skip logic must not rely on atlas residency as an emptiness proxy.
5. User sampling mode is authoritative; do not auto-switch `linear`/`nearest`.
6. Complete all backlog phases unless a true hard blocker prevents completion.

Execution rules:
1. Read all source-of-truth docs first.
2. Immediately claim active backlog items by setting them `IN_PROGRESS`.
3. Implement in dependency order:
   - contract/schema/preprocess
   - provider
   - viewer resource plumbing
   - shader traversal
   - mode-specific hardening
   - perf calibration
4. After each completed item:
   - mark `DONE` in `BACKLOG.md`
   - add concrete evidence paths
   - append dated implementation + verification notes in `EXECUTION_LOG.md`
5. Keep `ROADMAP.md` and `SESSION_HANDOFF.md` synchronized with reality.

Verification requirements:
1. Run required checks from `TEST_PLAN.md`.
2. Add and run tests needed for touched logic (schema/provider/resource/shader/perf).
3. Execute benchmark matrix checks and record results in `EXECUTION_LOG.md`.
4. Fix failing checks immediately.

Strict completion condition:
- Only finish when:
  - all backlog items are `DONE`
  - all roadmap phases are `COMPLETE`
  - all required checks pass
  - docs are synchronized (`BACKLOG`, `ROADMAP`, `SESSION_HANDOFF`, `EXECUTION_LOG`)

Final output requirements:
1. concise phase-by-phase summary
2. full verification command list with pass/fail
3. benchmark deltas and acceptance status
4. explicit statement whether the program is fully complete

---
