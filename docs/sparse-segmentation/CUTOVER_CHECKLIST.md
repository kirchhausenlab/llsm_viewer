# Cutover Checklist

All items must be checked before calling the sparse segmentation hard cutover complete.

## Schema and compatibility

- [x] New sparse segmentation manifest format exists.
- [x] New sparse segmentation fixtures validate.
- [x] Intensity-only old/current manifests still validate.
- [x] Legacy dense segmentation manifests fail validation.
- [x] Error message tells users to reprocess legacy dense segmentation datasets.

## Preprocessing

- [x] Segmentation preprocessing writes sparse brick directories.
- [x] Segmentation preprocessing writes payload shards.
- [x] Segmentation preprocessing writes label metadata.
- [x] Segmentation preprocessing writes occupancy hierarchy.
- [x] Segmentation preprocessing writes sparse multiscale pyramids.
- [x] Segmentation preprocessing does not write dense segmentation zarr data.
- [x] Segmentation preprocessing does not build full dense global label arrays.

## Provider

- [x] Provider exposes sparse segmentation API.
- [x] Provider no longer returns dense segmentation volumes.
- [x] Exact label lookup works.
- [x] Sparse slice extraction works.
- [x] Missing occupied bricks are not treated as empty.
- [x] Decoded brick cache has bounded eviction.

## Rendering

- [x] WebGL2 sparse page table upload works.
- [x] WebGL2 resident brick atlas upload works.
- [x] WebGL2 packed `uint32` labels decode correctly.
- [x] 3D sparse brick traversal works.
- [x] Local sub-brick skipping works.
- [x] Slice mode uses sparse extraction.
- [x] No full dense segmentation label texture is allocated.
- [x] Label colors are hash-based and support labels above `65535`.

## UI

- [x] Desktop controls show segmentation `3D` and `Slice` modes.
- [x] VR controls show segmentation `3D` and `Slice` modes.
- [x] Invert remains disabled for segmentation.
- [x] Histogram remains absent for segmentation.
- [x] Loading/incomplete states are visible and honest.
- [x] Hover displays exact labels.

## Cleanup

- [x] Dense segmentation runtime type is removed or unreachable.
- [x] Dense segmentation shader sampling path is removed.
- [x] Dense segmentation slice path is removed.
- [x] Dense segmentation hover path is removed.
- [x] Tests no longer expect dense segmentation manifests to load.
- [x] Docs are updated with final implementation evidence.

## Verification

- [x] `npm run check:architecture` passes.
- [x] `npm run typecheck` passes.
- [x] `npm run typecheck:tests` passes.
- [x] `npm run test` passes.
- [x] `npm run test:frontend` passes.
- [x] `npm run test:visual` passes.
- [x] `npm run build` passes.
- [x] Relevant e2e tests pass.
- [x] Performance benchmark matrix is recorded.
