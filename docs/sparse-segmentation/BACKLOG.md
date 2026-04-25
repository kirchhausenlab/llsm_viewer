# Backlog

Each item must be claimed before implementation by changing `PENDING` to `IN_PROGRESS`. Mark `DONE` only with test or benchmark evidence.

## Phase 0

- `DONE` B0.1: Run baseline `npm run verify:fast` and record result in `SESSION_HANDOFF.md`.
- `DONE` B0.2: Run current segmentation-focused tests and record failures, if any.
- `DONE` B0.3: Add baseline benchmark numbers for dense segmentation storage/load/render.
- `DONE` B0.4: Update `CURRENT_STATE.md` with any segmentation touchpoints missed in planning.

## Phase 1

- `DONE` B1.1: Define sparse segmentation manifest/types.
- `DONE` B1.2: Add new manifest format identifier for sparse segmentation output.
- `DONE` B1.3: Update schema validation to accept sparse segmentation layers.
- `DONE` B1.4: Update schema validation to reject legacy dense segmentation layers.
- `DONE` B1.5: Keep intensity-only legacy/current manifest validation working.
- `DONE` B1.6: Add valid sparse segmentation schema fixtures.
- `DONE` B1.7: Add invalid legacy dense segmentation schema fixtures.

## Phase 2

- `DONE` B2.1: Add brick coordinate and bounds utilities.
- `DONE` B2.2: Add sparse brick directory writer/reader.
- `DONE` B2.3: Add payload shard writer/reader.
- `DONE` B2.4: Add coordinate-list codec.
- `DONE` B2.5: Add x-run-length codec.
- `DONE` B2.6: Add occupancy-bitmask-plus-label-stream codec.
- `DONE` B2.7: Add dense-local-brick codec.
- `DONE` B2.8: Add adaptive codec selection.
- `DONE` B2.9: Add corrupt payload validation tests.

## Phase 3

- `DONE` B3.1: Replace segmentation dense canonicalization in preprocessing with strict streaming label validation.
- `DONE` B3.2: Build sparse base-scale brick accumulators from TIFF slices.
- `DONE` B3.3: Emit sparse brick directory and payload shards.
- `DONE` B3.4: Emit base-scale label metadata.
- `DONE` B3.5: Generate sparse categorical multiscale pyramid.
- `DONE` B3.6: Emit occupancy hierarchy for every sparse segmentation scale.
- `DONE` B3.7: Remove dense segmentation zarr output.

## Phase 4

- `DONE` B4.1: Add sparse segmentation provider/index loader.
- `DONE` B4.2: Add decoded brick cache.
- `DONE` B4.3: Add exact sparse label query.
- `DONE` B4.4: Add sparse axis-aligned slice extraction.
- `DONE` B4.5: Add missing occupied brick handling.
- `DONE` B4.6: Add provider tests for cache and abort behavior.

## Phase 5

- `DONE` B5.1: Update viewer layer contracts for sparse segmentation.
- `DONE` B5.2: Add sparse segmentation resource state.
- `DONE` B5.3: Pack brick page table texture.
- `DONE` B5.4: Pack resident label atlas texture.
- `DONE` B5.5: Pack local sub-brick occupancy texture.
- `DONE` B5.6: Add resource readiness and missing-brick diagnostics.
- `DONE` B5.7: Remove dense segmentation label texture upload.

## Phase 6

- `DONE` B6.1: Add WebGL2 packed `uint32` label decode helpers.
- `DONE` B6.2: Add shader label hash color function.
- `DONE` B6.3: Implement global sparse brick traversal.
- `DONE` B6.4: Implement local sub-brick skipping.
- `DONE` B6.5: Implement exact hit label resolution.
- `DONE` B6.6: Preserve hover highlight for sparse labels.
- `DONE` B6.7: Remove dense segmentation shader sampling paths.

## Phase 7

- `DONE` B7.1: Replace dense segmentation slice preparation with sparse extraction.
- `DONE` B7.2: Ensure 3D and slice modes share label color hashing.
- `DONE` B7.3: Add slice visual tests.
- `DONE` B7.4: Add slice latency benchmarks.

## Phase 8

- `DONE` B8.1: Update desktop channel controls for sparse readiness.
- `DONE` B8.2: Update VR HUD channel controls for sparse readiness.
- `DONE` B8.3: Update hover UI to display `uint32` labels.
- `DONE` B8.4: Update paintbrush integration to avoid dense segmentation assumptions.
- `DONE` B8.5: Update ROI/measurement exclusions if type contracts change.
- `DONE` B8.6: Delete or make unreachable dense segmentation runtime types.

## Phase 9

- `DONE` B9.1: Run `npm run verify:fast`.
- `DONE` B9.2: Run relevant frontend and visual tests.
- `DONE` B9.3: Run performance benchmark matrix.
- `DONE` B9.4: Complete `CUTOVER_CHECKLIST.md`.
- `DONE` B9.5: Update `SESSION_HANDOFF.md` with closure evidence.
