# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`

## R-LOD0-001: Scale oscillation (thrash)

- Status: `MONITORING`
- Trigger:
  - rapid promote/demote events during small camera jitter
- Impact:
  - visible instability and cache churn
- Mitigation:
  - hysteresis bands + minimum dwell timers
  - diagnostics counter and automatic fallback mode

## R-LOD0-002: LOD0 starvation under playback

- Status: `MONITORING`
- Trigger:
  - prefetch queue dominated by coarse/speculative tasks
- Impact:
  - LOD0 rarely available during motion
- Mitigation:
  - priority classes and visible-now reservation budget

## R-LOD0-003: GPU residency churn

- Status: `MONITORING`
- Trigger:
  - high upload/eviction rates with steady camera
- Impact:
  - stutter and wasted bandwidth
- Mitigation:
  - temporal stickiness and improved replacement policy

## R-LOD0-004: Shader quality regressions in BL

- Status: `MITIGATED`
- Trigger:
  - adaptive LOD coarsens BL without local refinement
- Impact:
  - haze and detail loss
- Mitigation:
  - BL refinement stage and mode-specific LOD curves

## R-LOD0-005: Main-thread jank from runtime decode

- Status: `MONITORING`
- Trigger:
  - heavy sharded decode/assembly on UI thread
- Impact:
  - input lag and frame spikes
- Mitigation:
  - workerized runtime decode/assembly path

## R-LOD0-006: Shard decode overhead remains high

- Status: `MONITORING`
- Trigger:
  - repeated shard header parse for many subchunks
- Impact:
  - poor large-shard throughput
- Mitigation:
  - shard-index metadata cache + optional range reads

## R-LOD0-007: Benchmark contract mismatch with implementation

- Status: `CLOSED`
- Trigger:
  - tests still gate old selected-scale equality semantics
- Impact:
  - blocks intended policy improvements
- Mitigation:
  - migrated regression tests to outcome-based acceptance semantics
