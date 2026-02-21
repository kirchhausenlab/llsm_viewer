# Decisions

Last updated: **2026-02-21**

## DR-001: Break compatibility with old preprocessed format

Status: **Locked**

- Decision: do not preserve backward compatibility for legacy preprocessed datasets or legacy runtime interfaces.
- Rationale: clean architecture and performance-first rewrite outweigh migration complexity during early development.
- Consequences:
  - manifest and storage schema can change freely
  - old loading paths should be removed, not maintained in parallel
  - tests should target only the new pipeline once cutover is complete

## DR-002: Data model is bricked multiscale volumes

Status: **Locked**

- Decision: move from full-volume-per-timepoint loads to keys shaped like `(layer, timepoint, mip, z, y, x)`.
- Rationale: enables selective loading, cache locality, and progressive rendering for large volumes.
- Consequences:
  - chunk address logic must support non-zero spatial coordinates
  - cache architecture changes from whole-volume entries to brick entries

## DR-003: Chunk sizing policy is world-space-targeted bricks

Status: **Locked**

- Decision: choose `(bz, by, bx)` using physical-space balance, not fixed voxel cubes.
- Initial target: ~256 KB to 1 MB uncompressed per brick.
- Rationale: handles anisotropic voxels better and stabilizes request/upload granularity.

## DR-004: Mip downsampling for MIP rendering uses max pooling

Status: **Locked**

- Decision: intensity mip pyramid is max-reduced (or max-biased) to preserve bright sparse structures.
- Rationale: mean pooling can erase features important for transparent-ray maximum projection.

## DR-005: Storage layout uses Zarr v3 + sharding

Status: **Locked**

- Decision: keep Zarr v3, but use sharding to avoid small-file explosion from multiscale bricks.
- Initial shard target: ~8 MB to 32 MB objects (tuned by benchmark).
- Consequences:
  - preprocessing writes sharded arrays
  - runtime read path must efficiently fetch/decode shard-backed chunks

## DR-006: Renderer rollout is WebGL2-first, WebGPU-later

Status: **Locked**

- Decision: ship the new architecture on WebGL2 first; keep runtime abstractions clean for a later WebGPU backend.
- Rationale: minimizes delivery risk and preserves broad browser support while still unlocking core gains.

## DR-007: Rendering strategy is progressive refinement with brick pruning

Status: **Locked**

- Decision: render coarse mip first, then refine visible/high-impact bricks; skip bricks via occupancy + min/max bounds.
- Rationale: transparent-ray rendering touches deep volume spans; hierarchical rejection is mandatory for scale.

## DR-008: Full multiscale pyramid is required at load time

Status: **Locked**

- Decision: datasets must provide contiguous scales `0..N` for each layer; incomplete pyramids are launch-time errors.
- Rationale: correctness and predictability are better than fallback heuristics that silently degrade detail.
- Consequences:
  - manifest validation enforces contiguous levels and scale invariants
  - viewer launch fails early with explicit diagnostics when contract is violated

## DR-009: Quality policy is explicit profiles, not implicit play/pause defaults

Status: **Locked**

- Decision: scale/LOD behavior is driven by named quality profiles (`inspect`, `interactive`, `playback`).
- Rationale: removes hidden heuristics (`isPlaying ? 1 : 0`) and makes tradeoffs tunable and testable.
- Consequences:
  - load and prefetch paths use the same policy source
  - diagnostics must expose active profile and resolved scale targets

## DR-010: Hover coordinates are native-grid authoritative

Status: **Locked**

- Decision: hover coordinates in UI report native-grid voxel coordinates regardless of transient render LOD.
- Rationale: avoids LOD-dependent coordinate jitter and preserves user trust in measurements/inspection.
- Consequences:
  - hover mapping uses the native coordinate transform as source-of-truth
  - optional debug output may include sampled render LOD separately

## DR-011: NEVER SHOW WRONG DATA

Status: **Locked**

- Decision: the viewer must never display data from the wrong spatial location/timepoint/channel as a substitute for missing data.
- Rationale: this is a scientific tool; incorrect data display is worse than reduced quality, reduced coverage, or explicit failure.
- Consequences:
  - missing bricks/samples may render empty/transparent, but must not be remapped to unrelated bricks
  - runtime must not silently fabricate or substitute measurements
  - when required data is unavailable, surface explicit diagnostics/errors instead of incorrect visuals

## Open decisions

- None currently. Add new entries as `DR-00X` when needed.
