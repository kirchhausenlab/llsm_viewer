# Execution Log

Record implementation progress here. Planning-only discussion does not count as implementation evidence.

## 2026-04-25

- Created the sparse segmentation hard-cutover documentation bundle.
- Expanded the bundle with concrete schema, binary layout, WebGL2 data layout, sparse algorithms, benchmark thresholds, fixture expectations, provider signatures, and migration map.
- No application code was changed.
- No verification commands were run because this was documentation-only work.

## 2026-04-25 Completion

Backlog item:

- B0.1 through B9.5.

Files changed:

- Sparse storage/codecs/provider/preprocessing: `src/shared/utils/preprocessedDataset/sparseSegmentation/*`, `src/shared/utils/preprocessedDataset/preprocess.ts`, `src/shared/utils/preprocessedDataset/schema.ts`, `src/shared/utils/preprocessedDataset/types.ts`, `src/core/volumeProvider.ts`.
- Viewer/rendering/routing: `src/ui/app/hooks/useAppRouteState.tsx`, `src/ui/app/hooks/useRouteLayerVolumes.ts`, `src/ui/app/volume-loading/*`, `src/components/viewers/volume-viewer/*`, `src/shaders/volumeRenderShader.ts`.
- Tests/fixtures/benchmarks: `tests/sparseSegmentation.test.ts`, sparse schema fixture, updated preprocessing/provider/rendering tests, `scripts/benchmark-sparse-segmentation.ts`, `docs/sparse-segmentation/BENCHMARK_RESULTS.json`.

Verification:

- `npm run verify:fast`: passed.
- `npm run test`: passed, 245 passing and 3 skipped before final shader subcell change; `verify:fast` coverage run later passed 258 passing and 5 skipped.
- `npm run test:frontend`: passed, 18 tests.
- `npm run test:visual`: passed, 3 tests.
- `npm run test:e2e`: passed after final shader changes, 21 smoke tests in 8.1 minutes.
- `npm run test:perf`: passed, 10 passing and 2 skipped because real datasets were absent.
- `npm run benchmark:nextgen-volume`: passed, 2/2 cases.
- `npm run benchmark:sparse-segmentation`: passed and wrote `BENCHMARK_RESULTS.json`.
- `npm run benchmark:real-datasets`: not runnable in this workspace because `data/test_fib_large.zarr` and `data/test_npc2_20.zarr` are absent.

Result:

- Sparse segmentation hard cutover is complete for available local verification.

Notes:

- Legacy dense segmentation manifests now fail before viewer launch with a reprocessing error.
- Sparse segmentation output uses `uint32` labels, sparse brick directories, payload shards with CRC32 validation, label metadata, occupancy hierarchy, sparse multiscale pyramids, provider sparse query/slice APIs, sparse WebGL2 atlas resources, local sub-brick occupancy, and hash-based label colors.
- The dense segmentation runtime helper type still exists for local/test utility code, but preprocessed segmentation cannot reach dense provider, slice, hover, or shader sampling paths.

## Entry template

Date:

Backlog item:

Files changed:

Verification:

Result:

Notes:
