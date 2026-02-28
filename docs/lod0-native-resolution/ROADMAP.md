# Roadmap

Status legend: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

## Phase 0 - Baseline and observability

Status: `COMPLETE`

Goals:

- Define and wire LOD0-focused KPIs.
- Add runtime diagnostics required for safe adaptive control.
- Rework benchmark acceptance to avoid locking coarse selected scales.

Exit criteria:

- New benchmark schema fields are populated.
- Existing behavior is captured in a reference baseline.
- Perf regression tests run with updated acceptance semantics.

## Phase 1 - Adaptive scale selection

Status: `COMPLETE`

Goals:

- Replace binary play/pause scale policy with projected-footprint selection.
- Add hysteresis/cooldowns to prevent scale thrash.

Exit criteria:

- Paused scenes prefer LOD0 when feasible.
- Camera jitter does not cause rapid promote/demote cycling.

## Phase 2 - Coarse-to-fine transitions

Status: `COMPLETE`

Goals:

- Introduce explicit warm/promotion states per layer.
- Keep coarse visible until fine readiness is met.

Exit criteria:

- No blank holes during scale upgrades.
- Promotion behavior is deterministic and diagnosable.

## Phase 3 - Prefetch scheduler redesign

Status: `COMPLETE`

Goals:

- Move to priority queue over layer/timepoint/scale tasks.
- Add motion-aware and uncertainty-aware scheduling.

Exit criteria:

- Fewer target-scale misses during playback/scrub.
- Prefetch waste and cancellation churn are reduced.

## Phase 4 - GPU residency controller tuning

Status: `COMPLETE`

Goals:

- Improve residency replacement stability and reduce churn.
- Refine upload throttling behavior under pressure.

Exit criteria:

- Upload/eviction churn is reduced at steady camera.
- Resident set stability improves without latency regressions.

## Phase 5 - Shader LOD model + BL refinement

Status: `COMPLETE`

Goals:

- Use projected-footprint base LOD.
- Add explicit BL local refinement behavior.

Exit criteria:

- MIP/ISO/BL detail stability improves at equal or better frame budget.
- Shader LOD model tests cover new policy branches.

## Phase 6 - Runtime decode/sharding throughput

Status: `COMPLETE`

Goals:

- Cache shard index metadata and reduce repeated parse costs.
- Add optional range reads where backends support it.
- Workerize runtime decode and chunk assembly.

Exit criteria:

- Main-thread decode pressure is materially reduced.
- Transition latency for LOD0-heavy paths improves.

## Phase 7 - Hardening and staged rollout

Status: `COMPLETE`

Goals:

- Expand stress tests and long-run scenario validation.
- Roll out flags progressively to default-on.

Exit criteria:

- All acceptance gates pass on supported benchmark datasets.
- Rollback and incident handling docs are complete.
