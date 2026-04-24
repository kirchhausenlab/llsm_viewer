# Test Plan

This plan defines the mandatory verification for the projection-aware residency refactor.

## Release-blocking rules

1. Perspective correctness regressions are blockers.
2. Perspective performance regressions are blockers.
3. Orthographic correctness regressions are blockers.
4. The program is not complete if orthographic remains on a hidden projection-forced fallback path.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. Run all directly relevant unit/integration tests for touched files.

If route residency or playback scheduling changes:

1. `npm run -s test -- tests/app/hooks/useRouteLayerVolumes.test.ts`
2. `npm run -s test -- tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
3. `npm run -s test -- tests/app/hooks/useViewerModePlayback.test.ts`

If resource preparation or GPU residency changes:

1. `npm run -s test -- tests/useVolumeResources.test.ts`
2. `npm run -s test -- tests/gpuBrickResidencyPacking.test.ts`
3. `npm run -s test -- tests/playbackWarmupGate.test.ts`
4. `npm run -s test -- tests/volumeRenderShaderLodModel.test.ts tests/volumeRenderShaderSkipModel.test.ts`

If viewer-shell/UI playback controls change:

1. `npm run -s test -- tests/viewer-shell/ViewerSettingsWindow.test.tsx`
2. `npm run -s test -- tests/viewer-shell/TopMenu.test.tsx`
3. `npm run -s test -- tests/ViewerShellContainer.test.ts`

If end-to-end playback behavior changes:

1. `npm run -s test:e2e`
2. Run the directly relevant viewer playback / orthographic smoke specs

## Required new or updated coverage

### A. Residency-policy contract

- Projection mode is an input to residency policy, not a hard selector.
- Orthographic can select atlas when policy chooses it.
- Direct-volume remains available as a valid policy result.

### B. Perspective protection

- Perspective route/resource behavior remains correct in atlas-friendly and volume-friendly scenarios.
- Perspective playback buffering remains correct.
- Perspective benchmark envelope remains acceptable.

### C. Orthographic atlas eligibility

- Orthographic no longer hard-forces direct-volume residency.
- Orthographic atlas selection occurs when policy inputs justify it.
- Orthographic direct-volume selection still occurs when policy inputs justify it.

### D. Orthographic playback parity

Verify buffered playback under orthographic for:

1. atlas-backed selected frames
2. direct-volume selected frames
3. pause/resume reuse
4. buffered-start gating

### E. Cache and promotion parity

- Prepared atlas frames and prepared direct-volume frames both:
  - become ready
  - can be promoted
  - can be reused after pause/resume
  - do not duplicate unnecessary work under stable intents

### F. Residency prioritization correctness

- Orthographic close-up views do not show pathological atlas churn.
- Atlas prioritization reacts to orthographic framing / zoom changes appropriately.

### G. Shader/perf follow-up

- If orthographic shader-side adaptive LOD changes, perspective remains compile-time protected and non-regressed.

## Verification evidence logging format

For every implementation session, append to `EXECUTION_LOG.md`:

- backlog IDs worked
- commands executed
- pass/fail status
- benchmark scenarios run
- perspective regression summary
- orthographic improvement summary
- unresolved issues with exact follow-up IDs

