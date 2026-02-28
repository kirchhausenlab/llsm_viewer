# Implementation Spec

This spec defines the target architecture and implementation details for reliable LOD0 delivery.

## 1) Current-state summary

- Route scale selection currently prefers level `0` when paused and `1` when playing for atlas paths.
- Playback prefetch mirrors the same `0/1` policy.
- Fallback to coarser scales is triggered by fixed atlas/volume size hints and allocation-like errors.
- Shader adaptive LOD is based on ray-step length, not projected pixel footprint.
- MIP and ISO include local LOD0 refinement loops; BL currently does not.
- GPU brick residency already has budgeting, upload throttling, and camera-distance priority ordering.
- Provider and prefetch infrastructure already expose useful diagnostics and cache pressure signals.

## 2) Target architecture

### 2.1 LOD control surfaces

The program has three interacting control surfaces:

1. Dataset scale selection (`zarr.scales[n]`) at route/prefetch level.
2. GPU brick residency scheduling inside selected scale.
3. Per-sample shader LOD/refinement behavior.

### 2.2 New runtime policy model

Each layer gets a policy state machine:

- `desiredScaleLevel`
- `activeScaleLevel`
- `fallbackScaleLevel`
- `promotionState` (`idle`, `warming`, `ready`, `promoted`)
- hysteresis timestamps (`lastPromoteMs`, `lastDemoteMs`)

Selection and promotion must be deterministic under identical camera/timepoint inputs.

### 2.3 Projected-footprint scale selection

Replace binary desired scale with projected-footprint estimation:

- estimate screen pixels per voxel at current camera pose
- compare against per-scale voxel size (from `downsampleFactor`)
- choose finest scale meeting target quality window
- apply hysteresis bands to avoid oscillation

### 2.4 Coarse-to-fine transition contract

- coarse level stays visible while fine level warms
- fine level promotion requires threshold readiness
- demotion on pressure uses cooldown and does not oscillate frame-to-frame

### 2.5 Prefetch priority model

Prefetch queue is unified over `(layer, timepoint, scale)` and ranked by:

1. visible-now requirements
2. near-future motion prediction
3. speculative warmup

Queue must be cancellation-aware and bounded by per-class concurrency.

### 2.6 GPU residency policy upgrades

- keep explicit budget enforcement
- augment camera-distance ordering with temporal stickiness
- minimize upload/eviction churn under steady camera
- maintain deterministic replacement ordering

### 2.7 Shader LOD upgrades

- base LOD derived from projected footprint (not step length only)
- mode-specific LOD response curves (`MIP`, `ISO`, `BL`)
- BL receives local refinement stage near dominant contributions

### 2.8 Runtime data-path throughput

- cache shard index/header metadata per shard blob
- avoid repeated shard-header parse for every subchunk decode
- add optional range-read storage API and use where available
- move runtime decode/assembly to worker pipeline

## 3) File touchpoints

### 3.1 Policy and route orchestration

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`

### 3.2 Provider and cache/scheduling

- `src/core/volumeProvider.ts`
- `src/core/textureCache.ts`

### 3.3 GPU residency and renderer bindings

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/VolumeViewer.types.ts`

### 3.4 Shader model

- `src/shaders/volumeRenderShader.ts`

### 3.5 Storage/sharding/decode path

- `src/shared/storage/preprocessedStorage.ts`
- `src/shared/utils/preprocessedDataset/sharding.ts`
- `src/workers/*` (new runtime worker modules expected)

### 3.6 Tests and benchmark harness

- `tests/app/hooks/useRouteLayerVolumes.test.ts`
- `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
- `tests/useVolumeResources.test.ts`
- `tests/volumeRenderShaderLodModel.test.ts`
- `tests/perf/realDatasetRegression.test.ts`
- `tests/perf/nextgenVolumeRuntimeStress.test.ts`
- `tests/perf/realDatasetBenchmarkHarness.ts`
- `scripts/benchmark-real-datasets.ts`

## 4) Implementation phases (technical)

### Phase 0: Instrumentation and KPI plumbing

- add per-layer LOD policy diagnostics payload
- add promotion/demotion event counters
- expose scheduler queue stats and residency churn metrics
- update benchmark report schema to include LOD0-specific metrics

### Phase 1: Adaptive scale selector

- implement projected-footprint estimator and hysteresis
- replace route `isPlaying ? 1 : 0` selection logic
- update playback prefetch scale resolution to match selector

### Phase 2: Coarse-to-fine promotion

- add explicit per-layer promotion state
- hold coarse until fine readiness threshold
- avoid one-frame gaps during transitions

### Phase 3: Prefetch scheduler redesign

- introduce priority classes and weighted queue
- add motion-aware lookahead and uncertainty window
- bound concurrency by priority class

### Phase 4: Residency controller tuning

- add temporal stickiness to replacement strategy
- tune bootstrap burst behavior under pressure
- reduce avoidable churn while preserving responsiveness

### Phase 5: Shader LOD + BL refinement

- implement projected-footprint base LOD path
- keep MIP/ISO refinement behavior and improve BL refinement
- maintain nearest/linear mode invariants and sampling correctness

### Phase 6: Data-path throughput

- cache shard decode metadata per shard blob
- add optional range-read path and backend fallbacks
- workerize runtime decode/assembly path

### Phase 7: Hardening and rollout

- expand stress/perf/visual checks
- stage feature flags from opt-in to default-on
- finalize docs, thresholds, and rollback playbook

## 5) Feature flags and rollout controls

Introduce independent flags for:

- adaptive scale selector
- promotion state machine
- advanced prefetch scheduler
- residency tuning
- projected-footprint shader LOD
- BL refinement
- workerized runtime decode path

Each flag must support runtime disable and safe fallback to previous behavior.

## 6) Safety and fallback requirements

- If diagnostics are unavailable or invalid, use conservative fallback policy.
- If worker path fails, fall back to current main-thread path with warning diagnostics.
- If new policy causes repeated promote/demote oscillation, auto-disable adaptive policy for session and log diagnostics.

## 7) Benchmark and acceptance updates

- Replace strict selected-scale equality checks with quality/latency/stability gates.
- Add dataset-specific LOD0 readiness targets.
- Keep chunk hit-rate and cache-pressure regression thresholds.

## 8) Documentation and traceability requirements

Every merged phase must update:

- `BACKLOG.md`
- `EXECUTION_LOG.md`
- `SESSION_HANDOFF.md`
- `ROADMAP.md` phase status

No phase is considered complete without evidence links and verification command results.
