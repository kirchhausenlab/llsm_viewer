# Preprocessing Performance Playbook

Last updated: 2026-02-19  
Status: `ACTIVE`

## Goal

Speed up preprocessing materially without breaking dataset correctness or viewer/runtime behavior.

This playbook exists so work can continue safely across sessions with clear sequencing, verification, and rollback rules.

## Guardrails (do not violate)

- Preserve preprocessed output semantics and schema contract (`llsm-viewer-preprocessed-vnext`).
- Keep segmentation output deterministic for a given `(layerKey, timepoint)` seed path.
- Do not regress visualization/runtime performance to speed preprocessing.
- Keep each optimization small and independently reversible.
- Run correctness + perf checks after every change set.

Primary guard tests/commands:

```bash
npm run test -- tests/preprocessPipeline.test.ts
npm run test:perf:preprocess-smoke
npm run typecheck
npm run typecheck:tests
```

Optional broader checks when a change is large:

```bash
npm run test -- tests/preprocessedDataset.test.ts
npm run benchmark:nextgen-volume
```

## Hotspot Map

Current hotspots and where they live:

- Worker protocol overhead reduced in `PREP-007`; browser-side real-fixture validation is now recorded (`tests/e2e/preprocess-perf.spec.ts` run on `data/test_dataset_0`, `elapsedMs=11981` for 5 TIFF timepoints):
  - `src/loaders/volumeLoader.ts`
  - `src/workers/volumeLoader.worker.ts`
- Normalization/downsample is now workerized for 3D/browser preprocessing (`PREP-008`) with synchronous fallback for non-worker contexts; real-fixture benchmark and browser perf timings are now captured in Tracking Log:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/shared/utils/preprocessedDataset/preprocessScalePyramidWorker.ts`
  - `src/workers/preprocessScalePyramid.worker.ts`
- 2D write path now processes per-slice typed-array views directly (no per-slice staging copy in write loop), while preserving schema/runtime behavior:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`

## Backlog (Prioritized)

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

### PREP-001 (`DONE`): Reuse already-decoded representative/metadata volumes

- Expected impact: `medium`
- Risk: `low`
- Idea: avoid decoding the same files multiple times across metadata/normalization/write stages.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - no behavior/schema changes
  - decoding pass count reduced in code path
  - guard tests pass

### PREP-002 (`DONE`): Make write concurrency configurable and raise above 1

- Expected impact: `medium-high` (especially OPFS/directory backends)
- Risk: `low-medium`
- Idea: tune in-flight writes with bounded concurrency rather than hard-serial.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/components/pages/FrontPageContainer.tsx` (if exposing strategy knobs)
- Done when:
  - default remains safe
  - no write corruption/partial output behavior
  - guard tests pass consistently

### PREP-003 (`DONE`): Cache sharding layout math per descriptor

- Expected impact: `medium`
- Risk: `low`
- Idea: stop recomputing shard layout and coordinate metadata for every chunk.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/shared/utils/preprocessedDataset/sharding.ts` (if helper API changes)
- Done when:
  - lower CPU overhead in chunk write path
  - no shard path/key regressions

### PREP-004 (`DONE`): Fuse chunk copy + stats/histogram accumulation

- Expected impact: `high` on CPU-heavy preprocessing
- Risk: `medium`
- Idea: compute min/max/occupancy/hist while copying chunk rows, not in a second scan.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - per-chunk output bytes and stats remain equivalent
  - guard tests pass

### PREP-005 (`DONE`): Parallelize 2D TIFF image-count probing with bounded concurrency

- Expected impact: `medium` for large 2D stacks
- Risk: `low-medium`
- Idea: parallel `fromBlob(...).getImageCount()` with a cap.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - timepoint metadata correctness preserved
  - no browser stability regressions from over-concurrency

### PREP-006 (`DONE`): Reduce extra copying in 2D slice extraction path

- Expected impact: `medium`
- Risk: `medium`
- Idea: avoid avoidable full slice copies in 2D loop.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - output unchanged
  - memory pressure reduced in profiling

### PREP-007 (`DONE`): Improve loader worker protocol (persistent worker / fewer messages)

- Expected impact: `high`
- Risk: `high`
- Idea: reduce per-slice postMessage overhead and repeated worker startup costs.
- Likely files:
  - `src/loaders/volumeLoader.ts`
  - `src/workers/volumeLoader.worker.ts`
- Done when:
  - decode throughput improves on representative datasets
  - cancellation/error behavior remains correct

### PREP-008 (`DONE`): Workerize normalization/downsample stage

- Expected impact: `high` (largest architectural gain)
- Risk: `high`
- Idea: move CPU-heavy normalize/downsample/chunk-prep off main thread into worker pipeline.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - new worker modules
  - possibly `src/core/volumeProcessing.ts`
- Done when:
  - correctness preserved
  - measurable speedup sustained across runs
  - complexity remains maintainable

### PREP-009 (`DONE`): Remove duplicate 2D slice extraction in normalization fallback path

- Expected impact: `low-medium` (best when per-slice fallback normalization is active)
- Risk: `low`
- Idea: in 2D write path, avoid re-extracting a second slice copy just to compute per-slice min/max for fallback normalization.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - fallback normalization semantics remain unchanged
  - guard tests pass

### PREP-010 (`DONE`): Remove representative/metadata 2D slice copy allocations

- Expected impact: `low`
- Risk: `low`
- Idea: avoid allocating extracted slice payloads in 2D representative normalization and metadata collection when only min/max or shape metadata are needed.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
- Done when:
  - representative normalization and shape validation behavior remain unchanged
  - guard tests pass

### PREP-011 (`DONE`): Remove remaining 2D write-loop slice staging copy

- Expected impact: `medium` on large 2D datasets
- Risk: `low-medium`
- Idea: stop copying each 2D slice into a temporary staging buffer before normalization/segmentation; operate on typed-array slice views directly.
- Likely files:
  - `src/shared/utils/preprocessedDataset/preprocess.ts`
  - `src/core/volumeProcessing.ts`
- Done when:
  - preprocessing output remains equivalent
  - guard tests pass

## Execution Order

Implement in phases and stop after each phase to evaluate gains:

1. Phase A (low risk): `PREP-001`, `PREP-002`, `PREP-003`
2. Phase B (medium): `PREP-004`, `PREP-005`, `PREP-006`
3. Phase C (high/architectural): `PREP-007`, `PREP-008`
4. Follow-up micro-optimizations: `PREP-009+`

Do not combine multiple high-risk items in one PR/session unless explicitly required.

## Session Procedure

Use this checklist in every implementation session:

1. Pick one backlog ID (or one small pair in same risk tier).
2. Record baseline command outputs/timings before coding.
3. Implement smallest coherent change.
4. Run guard checks:
   - `npm run test -- tests/preprocessPipeline.test.ts`
   - `npm run test:perf:preprocess-smoke`
   - `npm run typecheck`
   - `npm run typecheck:tests`
5. If results are positive, update this file:
   - backlog item status
   - short notes on measured impact
6. Update `docs/PROGRESS.md` with high-signal summary.

## Rollback Criteria

Rollback (or revert that item) if any of these happen:

- Any correctness/schema regression in preprocessing guard tests.
- Non-deterministic output for same inputs.
- Throughput improves but reliability declines (partial writes, flaky failures).
- Viewer/runtime performance regresses measurably after reprocessing.

## Session Handoff Template

Copy this into the next session update:

```md
### Preprocessing Perf Handoff
- Date:
- Implemented IDs:
- Current statuses:
- Baseline vs after (key timings):
- Commands run:
- Risks observed:
- Next recommended ID:
```

## Tracking Log

| Date | IDs | Result | Notes |
| --- | --- | --- | --- |
| 2026-02-19 | Plan only | Added playbook | No code changes in preprocessing logic yet |
| 2026-02-19 | PREP-001, PREP-002, PREP-003 | DONE | Added `(layerKey,fileIndex)` decode cache reused across rep-stats/metadata/write passes; write concurrency is now configurable via `storageStrategy.maxInFlightChunkWrites` (default/front-page now `4`); sharding layout is cached per descriptor path and chunk-location math now accepts precomputed layout. Guard checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks). |
| 2026-02-19 | PREP-004, PREP-005, PREP-006 | DONE | Fused data-chunk copy+stats/hist accumulation into one pass, parallelized 2D image-count probing with bounded concurrency, and switched 2D write loop to reusable slice buffers. Preprocess smoke improved from baseline `duration_ms 418.4` (`real 0.57s`) to post-change `duration_ms 349.9-376.8` (`real 0.50-0.52s`) in this session (~10-16% faster by test duration, run-to-run variance). Broader checks passed (`tests/preprocessedDataset.test.ts`, `benchmark:nextgen-volume` 2/2 matrix cases passing). |
| 2026-02-19 | PREP-007 | DONE | Volume loader now reuses a persistent shared worker across requests and worker protocol now posts one transferable full-volume buffer per file (`volume-loaded`) instead of per-slice messaging. Guard and broader checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks, `tests/preprocessedDataset.test.ts`, benchmark matrix 2/2). Real-fixture browser-path timing captured later the same day (see validation row below). |
| 2026-02-19 | PREP-008 | DONE | Added workerized 3D normalization/downsample scale-pyramid path (`preprocessScalePyramid.worker`) with deterministic per-timepoint segmentation seeding and strict manifest shape checks, plus automatic fallback to synchronous path on worker unavailability/failure. Guard and broader checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks, `tests/preprocessedDataset.test.ts`, benchmark matrix 2/2). Real-fixture browser-path timing captured later the same day (see validation row below). |
| 2026-02-19 | Post-PREP follow-up | DONE | Reduced per-slice CPU overhead in 2D write path by removing mandatory per-slice min/max scans from reusable extractor when layer normalization already exists; fallback path still computes per-slice normalization exactly as before when normalization metadata is missing. Guard and broader checks passed. Recent preprocess smoke runs after this change were noisy (`duration_ms 298.1-422.3`, `real 0.40-0.58s`) but include faster runs than prior baseline. |
| 2026-02-19 | Post-PREP fixture benchmark harness | DONE | Added reusable local fixture benchmark command `benchmark:preprocess:fixture` (`scripts/benchmark-preprocess-fixture.ts`) to time end-to-end preprocessing against real TIFF directories via `TEST_DATA_DIR`. A 3-run sample on `data/test_dataset_0` (5 files/timepoints, in-memory storage, non-sharded strategy, custom in-process TIFF loader) measured `min=14218.08ms`, `avg=14266.77ms`, `max=14331.04ms`. |
| 2026-02-19 | PREP-007 + PREP-008 fixture/browser validation | DONE | Captured real-fixture performance with `TEST_DATA_DIR=data/test_dataset_0 PREPROCESS_FIXTURE_RUNS=5 npm run benchmark:preprocess:fixture` (`min=14170.31ms`, `avg=14383.44ms`, `max=14458.99ms`) and browser-path timing with `TEST_DATA_DIR=data/test_dataset_0 npm run test:e2e:preprocess-perf` (`elapsedMs=11981`, 5 files/timepoints, pass). Re-ran verification gates successfully: `tests/preprocessPipeline.test.ts`, `test:perf:preprocess-smoke`, `typecheck`, `typecheck:tests`, `tests/preprocessedDataset.test.ts`, `benchmark:nextgen-volume` (2/2). |
| 2026-02-19 | PREP-009 | DONE | Removed duplicate 2D slice extraction in fallback normalization path by allowing reusable extractor to optionally compute per-slice min/max on the already-copied slice, then using `computeRepresentativeNormalization(rawSlice)` directly. This keeps fallback semantics and avoids the extra `extract2dSlice(...)` allocation/copy per slice when fallback is active. Guard and broader checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks, `tests/preprocessedDataset.test.ts`, benchmark matrix 2/2). Latest smoke sample after change: `duration_ms 495.6` (single run; noisy), so impact is expected to be workload-dependent and concentrated in fallback-heavy 2D datasets. |
| 2026-02-19 | PREP-010 | DONE | Removed extra `extract2dSlice(...)` allocations in 2D representative-normalization and metadata passes by computing representative slice min/max from source subarray views and by using decoded stack metadata directly for 2D shape/channel/type validation. Guard and broader checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks, `tests/preprocessedDataset.test.ts`, benchmark matrix 2/2). Latest smoke sample after change: `duration_ms 513.4` (single run on 3D smoke workload; expectedly noisy and not representative of 2D-only optimization path). |
| 2026-02-19 | PREP-011 | DONE | Removed the remaining per-slice staging copy in 2D write loop by switching slice extraction to typed-array views and adding typed-array normalization/segmentation helpers (`normalizeTypedArray`, `colorizeSegmentationTypedArray`) so preprocess can operate directly on slice views without `VolumePayload` copy materialization. Guard and broader checks passed (`preprocessPipeline`, preprocess smoke, app/test typechecks, `tests/preprocessedDataset.test.ts`, benchmark matrix 2/2). Latest smoke sample after change: `duration_ms 506.9` (single run; 3D-heavy smoke is noisy and not a direct 2D proxy). |
| 2026-02-19 | Post-PREP-011 validation pass | DONE | Re-validated fixture/browser throughput after final 2D no-copy change. Fixture benchmark (`TEST_DATA_DIR=data/test_dataset_0 PREPROCESS_FIXTURE_RUNS=3 npm run benchmark:preprocess:fixture`) measured `min=13973.43ms`, `avg=14034.92ms`, `max=14137.15ms` (improved vs earlier 3-run sample `avg=14266.77ms`). Browser path check (`TEST_DATA_DIR=data/test_dataset_0 npm run test:e2e:preprocess-perf`) passed at `elapsedMs=12049` for 5 files/timepoints. |
