# Benchmark Matrix

This matrix defines performance acceptance checks for hierarchical skip.

Status legend: `PENDING`, `PASS`, `FAIL`

## Metrics to capture

For each benchmark case, capture at least:

- median frame time (`ms`)
- p95 frame time (`ms`)
- samples-per-ray estimate (or proxy)
- skipped-distance ratio
- node-visits-per-ray

## Required benchmark cases

1. Sparse single-channel, static camera (`MIP`, `linear`)
2. Sparse single-channel, camera orbit (`MIP`, `linear`)
3. Sparse single-channel, camera orbit (`ISO`, `linear`)
4. Sparse single-channel, camera orbit (`BL`, `linear`)
5. Dense single-channel, camera orbit (`MIP`, `linear`)
6. Dense single-channel, camera orbit (`BL`, `linear`)
7. Sparse multichannel, camera orbit (`MIP`, `nearest`)
8. Sparse multichannel, camera orbit (`BL`, `nearest`)

## Acceptance targets

### Sparse datasets

- Skip must reduce samples-per-ray proxy by at least **30%** vs no-hierarchy baseline.
- Median frame time must improve by at least **20%** in motion scenarios.

### Dense datasets

- Median frame-time regression must stay below **10%**.
- p95 frame-time regression must stay below **15%**.

### Stability

- No visible skip artifacts in any mode from the test matrix.
- No traversal stalls or infinite-loop behavior.

## Recording template

For each case append:

- case id
- dataset id
- mode/sampling
- baseline values
- new values
- delta (%)
- status: `PASS` or `FAIL`

