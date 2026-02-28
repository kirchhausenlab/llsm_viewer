# Test Plan

This plan defines required verification for native-resolution LOD0 delivery.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. `npm run -s test -- tests/app/hooks/useRouteLayerVolumes.test.ts`
4. `npm run -s test -- tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
5. `npm run -s test -- tests/useVolumeResources.test.ts`
6. `npm run -s test -- tests/volumeRenderShaderLodModel.test.ts`

If provider/storage/sharding paths changed, also run:

1. `npm run -s test -- tests/preprocessedMultiscaleRuntime.test.ts`
2. `npm run -s test -- tests/preprocessedDataset.test.ts`
3. `npm run -s test -- tests/volumeProviderCancellation.test.ts`

If policy/perf behavior changed, also run:

1. `npm run -s test:perf`
2. `npm run -s benchmark:real-datasets`
3. `npm run -s test:perf:real-datasets`

If UI/overlay diagnostics changed, also run:

1. `npm run -s verify:fast`
2. `npm run -s verify:ui`

## Acceptance checks by phase

### A. Scale policy behavior

- LOD selection is no longer fixed to `isPlaying ? 1 : 0`.
- Paused view biases to LOD0 when memory/perf budget allows.
- Scale oscillation remains below configured threshold under camera jitter.

### B. Coarse-to-fine transition behavior

- Coarse level remains visible while fine level loads.
- No blank frame/holes during promotion.
- Promotion and demotion are deterministic with matching inputs.

### C. Prefetch behavior

- Prefetch queue prioritizes visible and near-future needs before speculative tasks.
- Cancellation and session reset leave no leaked in-flight requests.
- Scale-aware prefetch requests align with active policy decisions.

### D. Residency behavior

- Upload/eviction churn is reduced in steady camera scenarios.
- Residency budget remains enforced.
- Pending brick count converges rapidly after camera settles.

### E. Shader quality behavior

- MIP and ISO refinement quality is maintained.
- BL quality improves under adaptive LOD due to local refinement.
- Nearest/linear invariants remain correct.

### F. Stability behavior

- Long-run playback and rapid interaction stress tests complete without crashes.
- Runtime diagnostics remain available and coherent for policy debugging.

## Test evidence logging format

For each implementation session, append in `EXECUTION_LOG.md`:

- backlog IDs worked
- commands executed
- pass/fail summary
- performance deltas from previous baseline
- follow-up IDs for unresolved failures
