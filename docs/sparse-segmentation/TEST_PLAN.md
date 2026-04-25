# Test Plan

This plan lists required verification for the sparse segmentation hard cutover.

## Required command groups

At closure, run:

- `npm run check:architecture`
- `npm run typecheck`
- `npm run typecheck:tests`
- `npm run test`
- `npm run test:frontend`
- `npm run test:visual`
- `npm run build`

Run e2e and perf tests when the relevant paths are stable:

- `npm run test:e2e`
- `npm run test:perf`
- `npm run benchmark:nextgen-volume`
- `npm run benchmark:real-datasets`

## Schema tests

Required cases:

- valid intensity-only old/current manifest still validates
- valid new sparse segmentation manifest validates
- old dense segmentation manifest fails
- segmentation layer with dense `zarr.data` fails
- segmentation layer missing sparse representation fails
- segmentation layer with histogram fails
- segmentation layer with normalization fails
- segmentation layer with non-contiguous scales fails
- segmentation layer with invalid brick size fails
- segmentation layer with invalid label metadata fails

## Label validation tests

Required cases:

- label `0` remains background
- positive integer labels survive exactly
- labels above `65535` survive if within `uint32`
- negative labels fail
- non-integer floats fail
- NaN fails
- infinity fails
- labels above `uint32` fail

## Codec tests

For each required payload codec:

- round trip empty-disallowed occupied brick
- round trip single voxel
- round trip scattered voxels
- round trip contiguous x runs
- round trip multiple labels
- reject duplicate offsets
- reject zero labels in encoded foreground
- reject out-of-bounds local offsets
- reject truncated payloads
- reject byte-length mismatches

Adaptive codec selection tests:

- coordinate list wins for very sparse scattered data
- x-run-length wins for long runs
- bitmask plus label stream wins for moderately sparse data
- dense local brick wins for locally dense data
- tie-breaking is deterministic

## Preprocessing tests

Required cases:

- single timepoint sparse segmentation
- multiple timepoints with changing labels
- empty segmentation timepoint
- all-empty segmentation layer
- edge bricks at non-multiple dimensions
- many labels
- labels above `65535`
- categorical downsampling tie cases
- label metadata voxel counts and bounds
- sparse output contains no dense segmentation zarr data

Each preprocessing test should compare sparse query/slice outputs against a small dense reference built only inside the test.

## Canonical fixture set

Add these deterministic fixtures. Dense arrays may be built inside tests only as expected-output references.

### Fixture A: single sparse voxel

Dimensions:

- `depth = 4`
- `height = 4`
- `width = 4`

Foreground:

- `(z=1, y=2, x=3) -> label 7`

Expected:

- one occupied brick
- one label metadata record
- label `7` voxel count `1`
- z slice `1` has one colored pixel at `(x=3, y=2)`
- query at `(1, 2, 3)` returns `7`
- query at `(1, 2, 2)` returns `0`

### Fixture B: labels above uint16

Dimensions:

- `depth = 4`
- `height = 4`
- `width = 4`

Foreground:

- `(0, 0, 0) -> 65536`
- `(0, 0, 1) -> 4294967295`

Expected:

- both labels survive exactly
- color hash does not alias with label `0`
- CPU query returns exact labels
- WebGL2 byte packing round trips both labels

### Fixture C: downsample tie

Source dimensions:

- `depth = 2`
- `height = 2`
- `width = 2`

Foreground:

- `(0, 0, 0) -> 3`
- `(0, 0, 1) -> 4`
- remaining six voxels are `0`

Expected scale 1:

- output voxel label is `0` because zero has six votes

Second variant:

- `(0, 0, 0) -> 3`
- `(0, 0, 1) -> 4`
- `(0, 1, 0) -> 3`
- `(0, 1, 1) -> 4`
- remaining four voxels are `0`

Expected scale 1:

- output voxel label is `3` because labels `0`, `3`, and `4` tie by count, nonzero beats zero, then smaller label wins

### Fixture D: edge bricks

Dimensions:

- `depth = 33`
- `height = 35`
- `width = 37`
- brick size `32 x 32 x 32`

Foreground:

- one label in each edge brick
- one label at maximum valid coordinate `(32, 34, 36)`

Expected:

- invalid edge padding remains zero
- all edge labels query correctly
- no out-of-bounds local offset is accepted

### Fixture E: x-runs

Dimensions:

- `depth = 8`
- `height = 8`
- `width = 16`

Foreground:

- `(z=2, y=3, x=4..12) -> label 9`

Expected:

- x-run codec is selected
- decoded voxel count is `9`
- y slice and z slice match dense reference

### Fixture F: all-empty segmentation

Dimensions:

- `depth = 16`
- `height = 16`
- `width = 16`

Foreground:

- none

Expected:

- zero occupied bricks
- empty label metadata
- occupancy hierarchy top node is empty
- 3D render is transparent
- slices are transparent

## Provider tests

Required cases:

- load sparse index
- load label metadata
- load and decode specific brick
- query empty background
- query foreground label
- query edge voxel
- query missing occupied brick reports missing, not background
- abort during index load
- abort during payload load
- cache hit does not reread payload
- cache eviction preserves correctness

## Slice tests

Required cases:

- z slice through empty space is transparent
- z slice through labels matches dense reference
- y slice matches dense reference
- x slice matches dense reference
- edge slice matches dense reference
- multiple labels color consistently
- labels above `65535` color consistently

## WebGL2 resource tests

Required cases:

- page table packs empty sentinel
- page table packs occupied-missing sentinel
- page table packs resident atlas slot
- packed `uint32` labels decode correctly
- local brick atlas dimensions obey texture limits
- local sub-brick occupancy matches decoded payload
- resource readiness reports missing occupied bricks
- no full dense segmentation texture is allocated

## Shader and visual tests

Required cases:

- sparse segmentation 3D renders visible foreground
- empty segmentation renders transparent
- scattered sparse labels render correctly
- thin surfaces render correctly
- hover highlight matches label
- label colors are stable across timepoints
- slice and 3D color for same label are consistent
- camera motion does not turn missing bricks into false empty space

Where shader internals are hard to unit test, use visual or Playwright tests with deterministic fixtures.

## UI tests

Required cases:

- segmentation controls still show `3D` and `Slice`
- invert remains disabled
- histogram is absent
- sparse loading state is visible
- legacy dense segmentation rejection appears before viewer launch
- intensity-only old dataset still launches
- VR HUD preserves segmentation controls

## Performance acceptance tests

Measure at least:

- preprocessing time
- output dataset size
- manifest/index size
- load time to first render-ready frame
- CPU memory
- GPU memory
- slice extraction latency
- 3D frame time
- hover latency

Use datasets from `BENCHMARK_MATRIX.md`.
