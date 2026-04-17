# Benchmark Matrix and Acceptance

Last updated: **2026-02-28**

## Source of truth

- Config: `docs/lod0-native-resolution/BENCHMARK_MATRIX.json`
- Harness: `tests/perf/realDatasetBenchmarkHarness.ts` and `scripts/benchmark-real-datasets.ts`
- Regression gate: `tests/perf/realDatasetRegression.test.ts`

## KPI definitions

- `pausedLod0SelectionRateMin`: fraction of paused-view loads selecting LOD0.
- `pausedLod0ReadyP95MsMax`: p95 latency to reach LOD0 ready state in paused scenarios.
- `playbackLod0SelectionRateMin`: historical matrix field from the earlier LOD0 program target. It should not be read as a current requirement that active atlas playback promote visible playback frames to `L0`.
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
- Current runtime policy intentionally keeps active atlas playback on a coarser playback scale when available; paused-view `L0` readiness metrics should not be extrapolated to visible playback-frame scale selection.
