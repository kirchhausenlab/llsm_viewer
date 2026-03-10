# Playback Invariants

This document captures non-negotiable runtime behavior for movie playback and volume streaming.

If you change playback, prefetch, atlas loading, or GPU residency code, preserve these invariants.

## Invariants

1. Atlas playback must not fetch full volumes in the frame loading path.
   - In `useRouteLayerVolumes`, atlas mode must stay on brick atlas + page table only.
   - Reintroducing `getVolume(...)` in the atlas branch causes severe playback stalls and miss-rate inflation.

2. Segmentation layers must stay on volume loading, not atlas residency mode.
   - Segmentation data requires full-volume behavior in this pipeline.

3. `missRates.volume` must represent interactive lookup behavior, not background prefetch warmups.
   - Prefetch calls must use `getVolume(..., recordLookup: false)`.
   - Interactive/timepoint render path calls must keep `recordLookup: true` (default).

4. Per-frame GPU residency updates must be incremental.
   - Do not force full residency on each camera/render tick.
   - `forceFullResidency` in per-frame updater paths should remain `false`.

5. Playback progression should be gated by prefetch/readiness checks, not a hard "current frame fully loaded" lock.
   - Hard frame-lock gating collapses effective playback FPS under load.

## Regression Coverage

These tests are intended to fail if the above behavior regresses:

- `tests/app/hooks/useRouteLayerVolumes.test.ts`
  - Asserts atlas-mode loading does not call `getVolume` and uses atlas/page-table path.
  - Asserts segmentation stays on volume path.
- `tests/preprocessedDataset.test.ts`
  - Asserts prefetch operations do not inflate `missRates.volume`.
- `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
  - Asserts playback prefetch scheduling/readiness behavior.
- `tests/app/hooks/useViewerModePlayback.test.ts`
- `tests/usePlaybackControls.test.ts`

## Change Checklist

Before merging playback/streaming changes:

1. Run:
   - `npm run typecheck`
   - `node --import tsx --test tests/app/hooks/useRouteLayerVolumes.test.ts tests/app/hooks/useRoutePlaybackPrefetch.test.ts tests/preprocessedDataset.test.ts tests/app/hooks/useViewerModePlayback.test.ts tests/usePlaybackControls.test.ts`
2. Confirm diagnostics in a heavy playback run:
   - Playback remains smooth.
   - `V` miss rate is not pinned by prefetch math artifacts.
   - GPU does not spike from full-residency uploads each frame.

## CI Enforcement

- Pull requests that touch playback/streaming paths trigger a dedicated guard step in:
  - `.github/workflows/deploy.yml` (`Run playback regression guard tests`)
