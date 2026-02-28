# Benchmark Matrix and Acceptance

Last updated: **2026-02-28**

## Source of truth

- Config: `docs/lod0-native-resolution/BENCHMARK_MATRIX.json`
- Harness: `tests/perf/realDatasetBenchmarkHarness.ts` and `scripts/benchmark-real-datasets.ts`
- Regression gate: `tests/perf/realDatasetRegression.test.ts`

## KPI definitions

- `pausedLod0SelectionRateMin`: fraction of paused-view loads selecting LOD0.
- `pausedLod0ReadyP95MsMax`: p95 latency to reach LOD0 ready state in paused scenarios.
- `playbackLod0SelectionRateMin`: fraction of playback steps that can use LOD0 under budget.
- `scaleThrashEventsPerMinuteMax`: max promote/demote oscillation events per minute.
- `chunkHitRateMin`: minimum chunk cache hit rate.

## Commands

- Generate benchmark report:
  - `npm run -s benchmark:real-datasets`
- Enforce perf regression test:
  - `npm run -s test:perf:real-datasets`
- Full perf suite:
  - `npm run -s test:perf`

## Notes

- Matrix calibration and first full pass completed on **2026-02-28**.
- Real-dataset regression now validates outcome metrics (latency/readiness/thrash/hit-rate) instead of fixed selected-scale equality.
