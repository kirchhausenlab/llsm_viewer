# Schema vNext

Last updated: **2026-02-13**

This document describes the implemented and validated preprocessed dataset contract for the completed next-gen volume architecture.

## Format identifier

- Manifest root `format`:
  - `llsm-viewer-preprocessed-vnext`
- Reader behavior:
  - rejects any non-vNext format value
  - no backward-compat fallback path

## Layer Zarr layout

Each layer stores `zarr.scales[]` ordered by `level` (`0` base).

Per scale:

- `downsampleFactor: [dz, dy, dx]`
- `width`, `height`, `depth`, `channels`
- `zarr.data` descriptor (`uint8`)
- `zarr.histogram` descriptor (`uint32`, shape `[timepoints, 256]`)
- segmentation layers: `zarr.labels` descriptor (`uint32`) **required for every scale**
- `zarr.chunkStats` descriptors:
  - `min` (`uint8`)
  - `max` (`uint8`)
  - `occupancy` (`float32`)

## Chunk key coordinates

- Data chunk key: `[t, z, y, x, c]`
- Label chunk key: `[t, z, y, x]`
- Histogram chunk key: `[t, 0]`
- Chunk-stats key: `[t, 0, 0, 0]`

Chunk path form:

- `<arrayPath>/c/<coord0>/<coord1>/...`

Sharded descriptor path form (when enabled):

- `<arrayPath>/shards/<shardCoord0>/<shardCoord1>/.../<shardCoordN>.shard`

## Preprocessing behavior (final)

- Spatial chunking for data/labels with configurable target bytes.
- Full multiscale pyramid generation with explicit uncapped policy (terminal `1x1x1`).
- Max-pooled mip generation for normalized intensity data.
- Segmentation label mip generation for every emitted scale.
- Per-scale histogram and per-scale chunk-stat arrays emitted for every timepoint.
- Real shard payload writing is supported when `storageStrategy.sharding.enabled=true`.

## Runtime behavior (final)

- Runtime/provider supports scale-aware loads:
  - `getVolume(layerKey, timepoint, { scaleLevel })`
  - `getBrickPageTable(layerKey, timepoint, { scaleLevel })`
  - `getBrickAtlas(layerKey, timepoint, { scaleLevel })`
  - scale-aware `has*` and prefetch APIs (`scaleLevels[]`)
- Route/playback selects and prefetches multiple scales in active 3D atlas-residency workflows.
- Shader/render path supports adaptive LOD and atlas/page-table-driven sampling.
- 3D intensity rendering uses GPU brick residency with incremental paging, explicit budgeting, and deterministic eviction.

## Closure status

Mandatory closure gaps are resolved. There are no unresolved schema/runtime architecture blockers for this program.
