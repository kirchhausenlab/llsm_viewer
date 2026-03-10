# Benchmark Matrix and Acceptance

Last updated: **2026-02-13**

## Source of truth

- Config: `docs/refactor-nextgen-volume/BENCHMARK_MATRIX.json`
- Harness: `scripts/benchmark-nextgen-volume.ts`
- Report output: `docs/refactor-nextgen-volume/BASELINE_REPORT.json`

## Approval

- Status: `approved`
- Approved at: `2026-02-13`
- Approved by: `nextgen-volume-program`

## Final-architecture KPI gates

Per case thresholds include:

- generation latency
- volume load latency:
  - `volume_t0_cold`
  - `volume_t0_chunk_warm`
  - `volume_t1_mixed_cache`
- atlas latency:
  - `atlas_t0_scale0`
  - `atlas_t0_scale1`
- chunk hit rate minimum (`chunkHitRateMin`)
- multiscale request minimum (`scale1RequestMin`)

## Cases

- `tier-a-single-channel`
  - dataset: `96x96x48`, channels `1`, timepoints `3`
  - chunk: `[1,16,64,64,1]`
  - thresholds:
    - generation `<=160ms`
    - cold `<=140ms`, warm `<=90ms`, mixed `<=100ms`
    - atlas scale0 `<=160ms`, atlas scale1 `<=120ms`
    - chunk hit rate `>=0.30`
    - scale1 requests `>=1`

- `tier-a-multichannel`
  - dataset: `128x128x64`, channels `2`, timepoints `4`
  - chunk: `[1,16,64,64,2]`
  - thresholds:
    - generation `<=650ms`
    - cold `<=300ms`, warm `<=220ms`, mixed `<=240ms`
    - atlas scale0 `<=320ms`, atlas scale1 `<=240ms`
    - chunk hit rate `>=0.30`
    - scale1 requests `>=1`

## Run commands

- Full matrix with threshold enforcement:
  - `npm run -s benchmark:nextgen-volume`
- Subset of cases:
  - `BENCHMARK_CASES=tier-a-single-channel npm run -s benchmark:nextgen-volume`
- Report-only mode:
  - `ENFORCE_BENCHMARK_THRESHOLDS=0 npm run -s benchmark:nextgen-volume`
- Runtime tuning overrides:
  - `BENCHMARK_MAX_CACHED_CHUNK_BYTES=<bytes>`
  - `BENCHMARK_MAX_CONCURRENT_CHUNK_READS=<count>`
  - `BENCHMARK_MAX_CONCURRENT_PREFETCH_LOADS=<count>`
  - `BENCHMARK_CHUNK_SPATIAL=<depth,height,width>`
