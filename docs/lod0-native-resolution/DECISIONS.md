# Decisions

Status legend: `LOCKED`, `PROVISIONAL`, `SUPERSEDED`

## D-LOD0-001: No shader brick-skip in this program

- Status: `LOCKED`
- Decision:
  - Keep `u_brickSkipEnabled` disabled for this roadmap.
  - Do not use shader skip logic as a dependency for LOD0 delivery.
- Rationale:
  - Prior artifact risk is unacceptable for the current delivery goal.
  - LOD0 can be delivered through scheduling/residency/LOD policy improvements.

## D-LOD0-002: LOD policy is view-driven with hysteresis

- Status: `LOCKED`
- Decision:
  - Replace fixed play/pause (`0/1`) scale choice with camera/view-dependent policy.
  - Add hysteresis and cooldown windows to prevent scale thrash.
- Rationale:
  - Binary policy underuses LOD0 and overuses coarse levels.

## D-LOD0-003: Coarse-to-fine promotion is explicit and gated

- Status: `LOCKED`
- Decision:
  - Keep coarse level rendered while fine level warms.
  - Promote only when readiness thresholds are met.
- Rationale:
  - Prevent holes and unstable visual transitions.

## D-LOD0-004: Degradation order is deterministic

- Status: `LOCKED`
- Decision:
  - On pressure, degrade in this order:
    1. reduce speculative prefetch
    2. reduce upload burst
    3. hold current scale longer
    4. demote selected layers to coarser scale
- Rationale:
  - Predictable behavior improves debuggability and user trust.

## D-LOD0-005: Benchmarks must not freeze historical selected scale

- Status: `LOCKED`
- Decision:
  - Remove strict equality gate for `selectedScaleLevel` in real-dataset regression.
  - Replace with range/ratio gates focused on quality and latency outcomes.
- Rationale:
  - Existing gate locks in coarse-scale behavior and blocks intended improvements.

## D-LOD0-006: Runtime heavy decode path moves off main thread

- Status: `LOCKED`
- Decision:
  - Runtime chunk/shard decode and assembly should execute in worker path once introduced.
- Rationale:
  - Main-thread decode creates avoidable jank in high-load transitions.

## D-LOD0-007: Feature-flagged rollout with kill switches

- Status: `LOCKED`
- Decision:
  - New policies ship behind explicit runtime flags and can be disabled independently.
- Rationale:
  - Limits blast radius while tuning across datasets/hardware.

## D-LOD0-008: Keep current dataset schema semantics

- Status: `LOCKED`
- Decision:
  - Preserve current vNext schema semantics and path contracts.
  - Optional metadata additions must be backward-compatible.
- Rationale:
  - Avoid broad format migration during runtime optimization program.

## D-LOD0-009: BL quality parity is required

- Status: `LOCKED`
- Decision:
  - BL must receive explicit local refinement behavior comparable to MIP/ISO.
- Rationale:
  - BL currently lags in detail stability at coarse adaptive LOD.

## D-LOD0-010: Diagnostics-first tuning

- Status: `LOCKED`
- Decision:
  - Every adaptive controller must expose sufficient diagnostics before being made default.
- Rationale:
  - Performance tuning without observability is non-repeatable and unsafe.
