# Session Prompt

Use this prompt only for future implementation sessions on the projection-aware residency refactor.

## Prompt

You are continuing the projection-aware residency refactor for Mirante4D.

Read, in order:

1. `docs/projection-aware-residency/README.md`
2. `docs/projection-aware-residency/DECISIONS.md`
3. `docs/projection-aware-residency/IMPLEMENTATION_SPEC.md`
4. `docs/projection-aware-residency/ROADMAP.md`
5. `docs/projection-aware-residency/BACKLOG.md`
6. `docs/projection-aware-residency/TEST_PLAN.md`
7. `docs/projection-aware-residency/BENCHMARK_MATRIX.md`
8. `docs/projection-aware-residency/RISK_REGISTER.md`
9. `docs/projection-aware-residency/SESSION_HANDOFF.md`
10. `docs/projection-aware-residency/EXECUTION_LOG.md`

Also review, as historical context:

1. `docs/orthographic-projection-mode/README.md`
2. `docs/orthographic-projection-mode/IMPLEMENTATION_SPEC.md`
3. `docs/orthographic-projection-mode/RISK_REGISTER.md`

## Guardrails

1. Do not preserve projection-forced residency mode as the end state.
2. Do not replace one hard switch with another (“orthographic always atlas” is also wrong).
3. Perspective regressions are blockers.
4. Playback architecture should converge toward residency-mode-agnostic behavior.

## Session procedure

1. Claim one or more `TODO` items in `BACKLOG.md` as `IN_PROGRESS`.
2. Make the smallest coherent architectural step.
3. Run the relevant checks from `TEST_PLAN.md`.
4. Update:
   - `BACKLOG.md`
   - `SESSION_HANDOFF.md`
   - `EXECUTION_LOG.md`
5. If architectural direction changes, update `DECISIONS.md` first.

