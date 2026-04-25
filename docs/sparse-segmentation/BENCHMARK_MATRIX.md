# Benchmark Matrix

Benchmarks must compare old dense segmentation behavior against new sparse segmentation behavior where an old baseline is available.

## Metrics

Record:

- source dimensions
- timepoint count
- label count
- foreground voxel count
- foreground occupancy percent
- occupied brick count
- output storage size
- preprocessing time
- index load time
- first render-ready time
- CPU memory
- GPU memory
- 3D frame time
- slice extraction latency
- hover query latency

## Synthetic occupancy regimes

Use at least:

- 0 percent occupancy
- 0.01 percent occupancy
- 0.1 percent occupancy
- 1 percent occupancy
- 5 percent occupancy
- 20 percent occupancy

The new sparse path should still behave correctly at higher occupancy, even if speedups are smaller.

## Synthetic spatial patterns

Use:

- random isolated voxels
- long thin filaments
- thin surfaces
- compact blobs
- hollow shells
- many tiny labels
- few large labels
- labels touching brick boundaries
- labels crossing many bricks
- empty timepoints between occupied timepoints

Random isolated voxels are a worst case for brick locality. Thin surfaces and compact blobs are closer to likely segmentation data.

## Dimensions

Use:

- small unit-test volumes, around `32 x 32 x 32`
- medium fixtures, around `256 x 256 x 128`
- large fixtures, around `1024 x 1024 x 256`
- real dataset dimensions where available

Include non-multiple dimensions to test edge bricks.

## Expected outcomes

For sparse regimes below 1 percent occupancy:

- storage should be substantially smaller than dense segmentation
- CPU loaded memory should be substantially smaller
- GPU uploaded segmentation data should be substantially smaller
- slice extraction should avoid full-slice label scanning where possible
- 3D rendering should skip empty bricks effectively

For random isolated voxels:

- storage should still improve
- GPU local brick atlas overhead may be higher
- local sub-brick skipping should prevent severe shader waste

For 20 percent occupancy:

- sparse path may not beat dense path on every metric
- correctness is still required
- performance should not catastrophically degrade

## Acceptance thresholds

These thresholds are the initial acceptance bar. Tighten them after real-dataset baselines are recorded.

For occupancy <= 1 percent on medium or larger volumes:

- output segmentation storage must be at least 5x smaller than dense uncompressed `uint16` label storage
- CPU resident segmentation memory after first render-ready frame must be at least 5x smaller than dense `uint16` labels
- GPU segmentation payload memory must be at least 5x smaller than a full dense RGBA8 label texture
- first render-ready time must not exceed dense baseline by more than 25 percent
- steady 3D frame time must be faster than dense baseline by at least 20 percent on compact blobs, thin surfaces, and filaments
- axis-aligned slice latency must be faster than dense baseline by at least 20 percent when the slice intersects <= 1 percent foreground pixels

For occupancy <= 0.1 percent:

- output segmentation storage should be at least 20x smaller than dense uncompressed `uint16` label storage
- GPU segmentation payload memory should be at least 20x smaller than a full dense RGBA8 label texture
- hover label lookup p95 latency should stay below 10 ms after indexes are loaded

For random isolated voxels:

- storage and memory must improve over dense
- 3D frame time may be equal to dense but must not be worse by more than 25 percent
- local sub-brick skipping must be enabled and measured

For 20 percent occupancy:

- storage should not exceed dense uncompressed `uint16` label storage by more than 20 percent
- 3D frame time must not be worse than dense by more than 50 percent
- if either threshold fails, document the break-even occupancy and consider a dense-local-heavy sparse-brick policy, not a dense global fallback

All benchmark reports must include whether dense comparison is:

- dense uncompressed theoretical size
- current dense zarr stored size
- current runtime dense CPU memory
- current runtime dense GPU memory

Do not mix these baselines without labeling them.

## Baseline table

Fill this table during implementation.

| Dataset | Occupancy | Pattern | Old storage | New storage | Old GPU memory | New GPU memory | Old frame time | New frame time | Notes |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| synthetic sparse segmentation 64x128x128 | 0% | compact block | 2.00 MiB dense uint16 theoretical | 1.3 KiB | 4.00 MiB dense RGBA8 theoretical | 4 B | n/a | first-ready 2.17 ms | `npm run benchmark:sparse-segmentation`; 0 occupied bricks; slice 0.23 ms; hover avg 0.011 ms |
| synthetic sparse segmentation 64x128x128 | 0.010% | compact block | 2.00 MiB dense uint16 theoretical | 2.0 KiB | 4.00 MiB dense RGBA8 theoretical | 128.0 KiB | n/a | first-ready 1.15 ms | 104 foreground voxels; 1 occupied brick; slice 0.07 ms; hover avg 0.004 ms |
| synthetic sparse segmentation 64x128x128 | 0.10% | compact block | 2.00 MiB dense uint16 theoretical | 3.3 KiB | 4.00 MiB dense RGBA8 theoretical | 128.0 KiB | n/a | first-ready 1.94 ms | 1,048 foreground voxels; 1 occupied brick; slice 0.04 ms; hover avg 0.003 ms |
| synthetic sparse segmentation 64x128x128 | 1.00% | compact block | 2.00 MiB dense uint16 theoretical | 9.3 KiB | 4.00 MiB dense RGBA8 theoretical | 128.0 KiB | n/a | first-ready 6.77 ms | 10,485 foreground voxels; 1 occupied brick; slice 0.05 ms; hover avg 0.003 ms |
| synthetic sparse segmentation 64x128x128 | 5.00% | compact block | 2.00 MiB dense uint16 theoretical | 33.4 KiB | 4.00 MiB dense RGBA8 theoretical | 256.0 KiB | n/a | first-ready 9.83 ms | 52,428 foreground voxels; 2 occupied bricks; slice 0.05 ms; hover avg 0.002 ms |
| synthetic sparse segmentation 64x128x128 | 20.00% | compact block | 2.00 MiB dense uint16 theoretical | 121.9 KiB | 4.00 MiB dense RGBA8 theoretical | 896.0 KiB | n/a | first-ready 29.73 ms | 209,715 foreground voxels; 7 occupied bricks; slice 0.07 ms; hover avg 0.002 ms |
| synthetic sparse segmentation 64x128x128 | 0.10% | random isolated | 2.00 MiB dense uint16 theoretical | 108.8 KiB | 4.00 MiB dense RGBA8 theoretical | 4.00 MiB | n/a | first-ready 3.22 ms | 1,048 foreground voxels touch all 32 bricks; slice 0.77 ms; hover avg 0.003 ms |
| synthetic sparse segmentation 64x128x128 | 1.00% | random isolated | 2.00 MiB dense uint16 theoretical | 1.02 MiB | 4.00 MiB dense RGBA8 theoretical | 4.00 MiB | n/a | first-ready 15.25 ms | 10,485 foreground voxels touch all 32 bricks; slice 4.33 ms; hover avg 0.003 ms |

Detailed JSON output is recorded in `BENCHMARK_RESULTS.json`.

`npm run benchmark:real-datasets` could not run in this workspace because `data/test_fib_large.zarr` and `data/test_npc2_20.zarr` are absent. The benchmark rows above therefore use theoretical dense storage/GPU baselines, as allowed by the baseline labeling rules in this document.
