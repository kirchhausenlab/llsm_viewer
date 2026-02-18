# Next-Gen Volume Refactor

Status: **Complete (100% Architecture Complete)**  
Start date: **2026-02-13**  
Completion date: **2026-02-13**

This folder is the source of truth for the next-gen volume architecture and its completion evidence.

## Final outcome

- Architecture Completion Backlog `NGR-090` through `NGR-097` is fully `DONE` in `BACKLOG.md`.
- Runtime 3D intensity rendering now uses GPU brick residency with explicit budgeted paging and view-priority scheduling.
- Runtime multiscale streaming consumes `zarr.scales[n]` beyond base scale in route/prefetch/provider flows.
- Schema/runtime multiscale labels+histogram contract is finalized and covered by fixtures/tests.
- Mip generation policy is explicit and uncapped to full pyramid completion.
- Final-architecture perf gates include multiscale atlas KPIs and are threshold-enforced by benchmark matrix validation.

## Verification evidence (final gate)

Executed on **2026-02-13**:

- `npm run -s typecheck`
- `npm run -s typecheck:tests`
- `npm run -s test`
- `npm run -s benchmark:nextgen-volume`

All passed.

Benchmark summary from `BASELINE_REPORT.json`:

- `tier-a-single-channel`: generation `36.89ms`, cold `31.21ms`, warm `19.40ms`, mixed `19.33ms`, atlas0 `8.80ms`, atlas1 `0.84ms`, hitRate `0.424`, scale1Req `2`
- `tier-a-multichannel`: generation `116.23ms`, cold `49.63ms`, warm `44.67ms`, mixed `46.13ms`, atlas0 `16.66ms`, atlas1 `1.62ms`, hitRate `0.440`, scale1Req `2`

## Read order

1. `docs/refactor-nextgen-volume/SCHEMA_VNEXT.md`
2. `docs/refactor-nextgen-volume/ROADMAP.md`
3. `docs/refactor-nextgen-volume/BACKLOG.md`
4. `docs/refactor-nextgen-volume/SESSION_HANDOFF.md`
5. `docs/refactor-nextgen-volume/EXECUTION_LOG.md`
