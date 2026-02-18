# Decisions

Last updated: **2026-02-13**

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

## Open decisions

- None currently. Add new entries as `DR-00X` when needed.
