# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Phase 0 - Baseline and observability

- `LOD0-001` (`DONE`): define runtime KPI schema for LOD0 readiness/stability.
  - Scope delivered:
    - added report fields for LOD0 selection ratio, readiness latency, and transition stability
  - Evidence:
    - `tests/perf/realDatasetBenchmarkHarness.ts`
    - `scripts/benchmark-real-datasets.ts`
    - `docs/performance/real-dataset-baseline.json`
    - `docs/lod0-native-resolution/BENCHMARK_MATRIX.json`

- `LOD0-002` (`DONE`): expose per-layer policy diagnostics in viewer runtime overlay.
  - Scope delivered:
    - added selected/desired/promotion-state metrics to diagnostics payload and viewer runtime diagnostics
  - Evidence:
    - `src/core/lodPolicyDiagnostics.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/components/viewers/VolumeViewer.types.ts`
    - `src/components/viewers/VolumeViewer.tsx`

- `LOD0-003` (`DONE`): update real-dataset regression acceptance semantics.
  - Scope delivered:
    - removed strict selected-scale equality gating and replaced with outcome-based assertions
  - Evidence:
    - `tests/perf/realDatasetRegression.test.ts`
    - `docs/performance/real-dataset-baseline.json`

## Phase 1 - Adaptive scale selection

- `LOD0-010` (`DONE`): implement projected-footprint scale estimator.
  - Scope delivered:
    - per-layer target scale uses projected pixel footprint proxy and `downsampleFactor`
  - Evidence:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

- `LOD0-011` (`DONE`): add hysteresis/cooldown logic for scale transitions.
  - Scope delivered:
    - promote/demote cooldowns plus anti-thrash auto-disable behavior
  - Evidence:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

- `LOD0-012` (`DONE`): unify playback prefetch scale policy with adaptive selector.
  - Scope delivered:
    - replaced fixed `0/1` route mapping with per-layer selector output wiring into playback prefetch
  - Evidence:
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`

## Phase 2 - Coarse-to-fine transitions

- `LOD0-020` (`DONE`): add explicit promotion-state machine.
  - Scope delivered:
    - per-layer `idle/warming/ready/promoted` state tracked and published via diagnostics
  - Evidence:
    - `src/core/lodPolicyDiagnostics.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`

- `LOD0-021` (`DONE`): add promotion readiness gates.
  - Scope delivered:
    - readiness gates based on atlas/page-table/volume readiness and pressure signals
  - Evidence:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

- `LOD0-022` (`DONE`): preserve coarse rendering until promotion completion.
  - Scope delivered:
    - atomic resource swap and retained current-layer state on load errors/aborts to avoid transient holes
  - Evidence:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

## Phase 3 - Prefetch scheduler redesign

- `LOD0-030` (`DONE`): implement unified priority queue over layer/timepoint/scale.
  - Scope delivered:
    - prefetch now runs scored work items with classed queue dispatch and per-layer scale bucketing
  - Evidence:
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`

- `LOD0-031` (`DONE`): add motion-aware prefetch scoring.
  - Scope delivered:
    - direction-aware near-future prioritization and opposite-direction speculative scheduling
  - Evidence:
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`

- `LOD0-032` (`DONE`): add prefetch budget partitioning by priority class.
  - Scope delivered:
    - visible-now vs near-future vs speculative class budgets with bounded dispatch
  - Evidence:
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`

## Phase 4 - GPU residency controller tuning

- `LOD0-040` (`DONE`): add temporal stickiness to replacement policy.
  - Scope delivered:
    - replacement logic protects recently used bricks for a stickiness window before eviction
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`

- `LOD0-041` (`DONE`): tune bootstrap burst behavior under pressure.
  - Scope delivered:
    - bootstrap upload burst now adapts to pending/capacity pressure ratios
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`
    - `tests/perf/nextgenVolumeRuntimeStress.test.ts`

- `LOD0-042` (`DONE`): expose residency churn counters for policy feedback.
  - Scope delivered:
    - stable counters and residency diagnostics surfaced to viewer/runtime payloads
  - Evidence:
    - `src/components/viewers/VolumeViewer.types.ts`
    - `src/components/viewers/VolumeViewer.tsx`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

## Phase 5 - Shader LOD model and BL refinement

- `LOD0-050` (`DONE`): implement projected-footprint base adaptive LOD model.
  - Scope delivered:
    - adaptive LOD base upgraded to include projected footprint in CPU + shader paths
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`

- `LOD0-051` (`DONE`): add mode-specific adaptive LOD response curves.
  - Scope delivered:
    - dedicated adaptive response behavior for `MIP`, `ISO`, and `BL`
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`

- `LOD0-052` (`DONE`): add BL local refinement pass.
  - Scope delivered:
    - BL mode receives local refinement pass and runtime uniform gate
  - Evidence:
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/volumeRenderShaderLodModel.test.ts`

## Phase 6 - Runtime decode/sharding throughput

- `LOD0-060` (`DONE`): cache parsed shard index metadata.
  - Scope delivered:
    - parsed shard-entry metadata cached and reused across reads
  - Evidence:
    - `src/core/volumeProvider.ts`
    - `src/shared/utils/preprocessedDataset/sharding.ts`
    - `tests/preprocessedDataset.test.ts`

- `LOD0-061` (`DONE`): add optional range-read storage API.
  - Scope delivered:
    - storage interface extended with offset/length range reads with full-file fallback
  - Evidence:
    - `src/shared/storage/preprocessedStorage.ts`
    - `src/core/volumeProvider.ts`
    - `tests/preprocessedDataset.test.ts`

- `LOD0-062` (`DONE`): workerize runtime decode/assembly path.
  - Scope delivered:
    - optional workerized shard decode path added with safe fallback to main-thread decode
  - Evidence:
    - `src/workers/runtimeShardDecodeMessages.ts`
    - `src/workers/runtimeShardDecode.worker.ts`
    - `src/core/volumeProvider.ts`
    - `tests/volumeProviderCancellation.test.ts`

## Phase 7 - Hardening and rollout

- `LOD0-070` (`DONE`): expand stress scenarios for scale transitions.
  - Scope delivered:
    - added rapid scrub/playback transition stress and diagnostics coherency coverage
  - Evidence:
    - `tests/perf/nextgenVolumeRuntimeStress.test.ts`

- `LOD0-071` (`DONE`): add flag-controlled staged rollout.
  - Scope delivered:
    - independent feature flags added with safe fallback paths across route/prefetch/resource/provider surfaces
  - Evidence:
    - `src/config/lod0Flags.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/core/volumeProvider.ts`

- `LOD0-072` (`DONE`): closure pass and docs finalization.
  - Scope delivered:
    - roadmap/backlog/log/handoff/benchmark docs synchronized to completed state with verification evidence
  - Evidence:
    - `docs/lod0-native-resolution/ROADMAP.md`
    - `docs/lod0-native-resolution/SESSION_HANDOFF.md`
    - `docs/lod0-native-resolution/EXECUTION_LOG.md`
    - `docs/lod0-native-resolution/BENCHMARK_MATRIX.md`

## High-contention files (avoid parallel edits)

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/core/volumeProvider.ts`
