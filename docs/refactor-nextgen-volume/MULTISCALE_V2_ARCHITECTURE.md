# Multiscale V2 Architecture

Status: Implemented (V2 cutover)
Last updated: 2026-02-21
Owner: viewer runtime

## Why this exists

The current runtime chooses a single scale per `(layer, timepoint)` and then applies camera-priority paging inside that scale.
That meets memory-safety goals but fails detail-retention goals on large datasets, because users can remain stuck on coarse levels.

This document defines a hard refactor target that keeps all three goals simultaneously:

1. Avoid OOM in preprocessing and viewer runtime.
2. Keep interaction smooth (latency/FPS).
3. Preserve fine detail where visible and resolvable.

## Locked decisions

1. Hardware target: optimize first for `16 GB RAM`, `8 GB VRAM`.
2. LOD policy: per-region detail by projected error. Far regions stay coarse even when camera is still.
3. Playback policy: lower quality while playing, refine quickly on pause.
4. Permanent downscaling is forbidden.
5. Hover semantics: report native-grid voxel coordinates (stable, independent from render LOD).
6. LOD metric: screen-space error.
7. Quality model: explicit profiles (`inspect`, `interactive`, `playback`).
8. Memory policy: hard caps plus adaptive scheduler under those caps.
9. Prefetch policy: mode-aware hybrid (`moderate` interaction, `forward-cone aggressive` playback).
10. Dataset contract: full pyramid required. Missing levels are load-time errors.
11. Seams policy: correctness before speed shortcuts.
12. Timepoints: architecture supports them, first implementation pass focuses on single volume.
13. Debug tooling: required (overlay + counters).
14. Rollout: hard cutover after gates pass.

## Non-negotiable runtime invariants

0. **NEVER SHOW WRONG DATA.**
1. Memory caps are never exceeded.
2. Any visible region can converge to max available detail if projected error requires it.
3. No mode may permanently lock a region to a coarser scale.
4. Sliced mode hover coordinates and hovered-voxel outline always map to native voxel space.
5. Incomplete pyramids fail at launch with explicit diagnostics.

Forbidden:

- remapping missing bricks to unrelated bricks
- substituting values from different spatial coordinates/timepoints/channels
- silently fabricating placeholder measurements as if they were real data

## Budget model (initial defaults)

1. GPU brick cache hard cap: `4.0 GB`.
2. GPU upload staging hard cap: `0.4 GB`.
3. CPU decoded cache hard cap: `3.0 GB`.
4. CPU compressed cache hard cap: `4.0 GB`.
5. IO/decode in-flight hard cap: `1.0 GB`.
6. Scheduler uses adaptive soft targets under hard caps based on motion and frame time.

## Required data contract

For every layer:

1. Scales must be contiguous: `0..N` with no gaps.
2. Scale `0` must match layer base dimensions.
3. Each scale `k>0` must have valid downsample metadata and physically consistent dimensions.
4. Segmentation layers must provide labels for every scale.

Runtime behavior on contract violation:

1. Dataset launch stops before viewer allocation.
2. Error includes layer id, offending scale, and reason.

## Runtime architecture (target)

### 1) Visibility and demand model

Each frame builds demand records for visible regions:

- key: `(layer, timepoint, brick)`
- expected screen footprint
- current resident scale
- target scale from screen-space error policy
- priority score (visibility, proximity, temporal persistence)

### 2) Scale selector

For each visible region, choose target scale using screen-space error thresholds by profile.

Profiles:

- `inspect`: aggressive refinement, low error threshold.
- `interactive`: balanced.
- `playback`: conservative threshold, favors throughput.

Hysteresis prevents flapping between adjacent scales.

### 3) Scheduler and queues

Two queues are maintained:

1. `required_now`: ensures the frame can render (coarse accepted).
2. `refine_next`: upgrades resident data toward target scales.

Queue operations support cancellation on camera or playback direction changes.

### 4) Multi-tier caches

Tiered cache ownership:

1. compressed chunks
2. decoded bricks
3. GPU resident atlas slots

Eviction key combines utility and recency, constrained by per-tier hard caps.

### 5) Renderer behavior

Renderer can simultaneously consume mixed LOD within a layer.

- Near/high-projection regions: finer bricks.
- Far/low-projection regions: coarser bricks.

Boundary handling prioritizes correctness (no black seams, no invalid sampling).

### 6) Sliced mode behavior

Sliced mode uses the same LOD policy with plane/tile demand.

- Hover coordinate mapping always resolves to native-grid coordinates.
- Hover outline size is derived from native voxel dimensions, not temporary render scale.

## Implementation phases

### Phase 0: instrumentation and baseline

Deliverables:

1. Structured metrics for cache pressure, queue depth, per-scale requests, and frame timing.
2. Debug HUD overlays for per-region scale and residency state.
3. Benchmark scenes and pass/fail gates.

Exit gate:

- Metrics and overlays are available in dev mode.

### Phase 1: strict pyramid validator

Deliverables:

1. Load-time validator for full pyramid contract.
2. Explicit error messages and test fixtures.

Exit gate:

- Incomplete pyramids fail early and predictably.

### Phase 2: policy unification

Deliverables:

1. Centralized quality profile and scale policy module.
2. Load and prefetch paths use the same policy (no duplicated defaults like `isPlaying ? 1 : 0`).

Exit gate:

- Policy changes are profile-driven and observable in diagnostics.

### Phase 3: demand-driven residency

Deliverables:

1. Demand model + scheduler queues.
2. Camera-motion cancellation and starvation prevention.

Exit gate:

- Stable frame behavior under rapid camera changes.

### Phase 4: mixed LOD rendering

Deliverables:

1. Mixed LOD composition path.
2. Seam-correct sampling behavior.

Exit gate:

- No black faces, no seam artifacts beyond accepted tolerance.

### Phase 5: sliced-mode parity

Deliverables:

1. Per-tile/per-region LOD behavior on all slice orientations.
2. Verified hover and outline correctness.

Exit gate:

- XY/XZ/YZ all pass coordinate and visual correctness tests.

### Phase 6: playback QoS

Deliverables:

1. Playback profile + forward-cone prefetch.
2. Fast refine-on-pause behavior.

Exit gate:

- Playback floor FPS met with acceptable refinement latency.

### Phase 7: hard cutover and cleanup

Deliverables:

1. old simplistic switching path removed
2. docs/tests/benchmarks updated to new architecture

Exit gate:

- all acceptance gates pass on target hardware.

## Acceptance gates

1. Memory safety: no cap violations in stress tests.
2. Performance: minimum `12 FPS` floor (initial target) in inspect and playback benchmarks.
3. Detail convergence: visible high-importance regions refine to required scale thresholds.
4. Sliced correctness: hover coordinates and voxel outline match native grid.
5. Stability: no black-face regressions and no array-buffer allocation failures caused by scale-selection policy.

## Risks and mitigations

1. Mixed-LOD seams: address with boundary-aware sampling and overlap blending.
2. Cache thrash: apply hysteresis, cancellation, and utility-based eviction.
3. Upload stalls: cap burst uploads and stage transfers.
4. Strict pyramid requirement impacts usability: provide validator diagnostics and preprocessing checks.

## Work tracking note

Implementation is intentionally staged, but engineering execution should continue end-to-end without waiting for per-bullet approvals once this spec is accepted.
