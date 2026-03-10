# Fresh Session Prompt

Use this exact prompt in a fresh coding-agent session.

---

You are implementing the entire native-resolution LOD0 program end-to-end.

Source of truth:
- `docs/lod0-native-resolution/README.md`
- `docs/lod0-native-resolution/DECISIONS.md`
- `docs/lod0-native-resolution/IMPLEMENTATION_SPEC.md`
- `docs/lod0-native-resolution/ROADMAP.md`
- `docs/lod0-native-resolution/BACKLOG.md`
- `docs/lod0-native-resolution/TEST_PLAN.md`
- `docs/lod0-native-resolution/BENCHMARK_MATRIX.json`
- `docs/lod0-native-resolution/BENCHMARK_MATRIX.md`
- `docs/lod0-native-resolution/RISK_REGISTER.md`
- `docs/lod0-native-resolution/SESSION_HANDOFF.md`
- `docs/lod0-native-resolution/EXECUTION_LOG.md`

Primary objective:
- Implement 100% of the documented LOD0 program in one continuous run.
- Do not stop after partial milestones.
- Do not ask for “continue?” approval between phases.
- Stop only when every backlog item is complete and verified, or when a true hard blocker prevents progress.

Hard constraints:
1. Implement the WHOLE plan ALL AT ONCE (all phases, all backlog items, all required docs updates, all required tests).
2. Keep context-length utilization strictly below 80% at all times.
3. Use aggressive context management:
   - subagents for scoped exploration and implementation
   - parallel sessions for independent workstreams
   - short summaries, never carry large dumps forward
4. Do not enable shader brick-skip in this program.
5. Maintain feature-flagged rollout safety and fallback behavior as specified.

Execution rules:
1. Start by reading all LOD0 docs listed above.
2. Immediately update `BACKLOG.md`:
   - set claimed items to `IN_PROGRESS`
   - keep status accurate throughout execution
3. Implement in dependency order, but parallelize independent tasks safely.
4. After each completed item:
   - set status to `DONE` in `BACKLOG.md`
   - add concrete evidence file paths
   - append timestamped implementation + verification notes in `EXECUTION_LOG.md`
5. Keep `ROADMAP.md` phase status synchronized with actual progress.
6. Keep `SESSION_HANDOFF.md` continuously updated with real current state.
7. Update benchmark docs and acceptance contracts when required by implementation.
8. Remove or replace outdated regression assumptions that block target behavior (per decisions/spec).

Verification requirements:
1. Run required commands from `TEST_PLAN.md` as features land.
2. Run all additional relevant tests for touched areas.
3. Run perf/benchmark gates required by the plan.
4. Fix failures immediately; do not defer unless truly impossible in-session.
5. If any item cannot be fully completed, log exact blocker and continue all other work.

Completion condition (strict):
- Only finish when:
  - every backlog item in `docs/lod0-native-resolution/BACKLOG.md` is `DONE`
  - all roadmap phases are `COMPLETE`
  - all required verification passes
  - docs are fully synchronized (`BACKLOG`, `ROADMAP`, `EXECUTION_LOG`, `SESSION_HANDOFF`, benchmark docs)
  - there is nothing meaningful left to implement for this program

Output expectations at the end:
1. concise summary of shipped changes by phase
2. full verification command list with pass/fail
3. residual risks (if any)
4. explicit statement whether program is fully complete

Remember: this is a single uninterrupted execution to full completion, with strict context budget discipline (<80%) and heavy use of subagents/parallelism.

---
