# Session Handoff

Last updated: **2026-04-25**

## Current status

Sparse segmentation hard cutover is implemented and verified in this workspace.

## 2026-04-25 Implementation Note

Claimed backlog item `B0.1` and started baseline `npm run verify:fast` before sparse segmentation code changes. The implementation goal for this session is the full hard cutover across schema, preprocessing, provider, viewer resources, rendering, hover, tests, and benchmarks.

## 2026-04-25 Closure Note

Implemented the full sparse segmentation cutover:

- new sparse manifest/type/schema path with legacy dense segmentation rejection
- sparse preprocessing writer with strict `uint32` label validation, brick codecs, CRC-validated payload shards, label metadata, occupancy hierarchy, and sparse multiscale downsampling
- provider sparse field, brick, query, slice, prefetch, page-table, and atlas APIs
- route loading/residency/prefetch changes that use sparse segmentation atlases instead of dense volumes
- viewer resource packing for sparse page tables, resident RGBA8 `uint32` label atlases, and local sub-brick occupancy textures
- WebGL2 packed-label decode, hash colors, exact hit-label resolution, and hover-label byte comparison
- sparse slice extraction and shared hash colors for 3D/slice
- tests and benchmarks covering codecs, corrupt payloads, `uint32` labels above `65535`, provider exact query/slice, schema rejection, resources, shader expectations, frontend, visual, e2e smoke, perf, and synthetic sparse benchmark rows

Final verification:

- `npm run verify:fast`: passed
- `npm run test`: passed
- `npm run test:frontend`: passed
- `npm run test:visual`: passed
- `npm run test:e2e`: passed, 21 smoke tests
- `npm run test:perf`: passed; real dataset cases skipped because local data is absent
- `npm run benchmark:nextgen-volume`: passed
- `npm run benchmark:sparse-segmentation`: passed
- `npm run benchmark:real-datasets`: blocked by missing `data/test_fib_large.zarr` and `data/test_npc2_20.zarr`

## Important constraints

- Hard cutover for segmentation.
- Intensity-only old/current datasets remain loadable.
- Legacy dense segmentation datasets must fail during loading.
- No dense global segmentation fallback.
- No meshes or geometry conversion.
- WebGL2 only for this program.
- Future WebGPU migration should remain possible through clean boundaries.

## Final implementation references

The schema, binary format, WebGL2 layout, algorithms, benchmark thresholds, and migration order are specified in:

- `SCHEMA_SPARSE_SEGMENTATION.md`
- `BINARY_LAYOUT.md`
- `WEBGL2_DATA_LAYOUT.md`
- `SPARSE_ALGORITHMS.md`
- `MIGRATION_MAP.md`

## Remaining external dependency

Real-dataset benchmarks require local files that are not present in this workspace:

- `data/test_fib_large.zarr`
- `data/test_npc2_20.zarr`

When those datasets are available, rerun `npm run benchmark:real-datasets` and append the measured rows to `BENCHMARK_MATRIX.md`.
