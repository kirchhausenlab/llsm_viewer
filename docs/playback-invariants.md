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

6. Atlas playback scale policy is intentionally coarser than paused-view policy when a coarser scale exists.
   - Paused/interactive view may adapt toward `L0`.
   - Active atlas playback should keep using the route-selected playback scale instead of promoting the current frame back to `L0` from camera proximity alone.
   - Warmup and prefetch paths must use the same playback scale policy as the visible playback frame.

7. UI playback progress must not outrun authoritative route/provider state.
   - A moving top-menu counter or VR HUD label is not enough.
   - If playback appears to advance, the route-selected timepoint and loaded render resources must have advanced too.
   - Do not "fix" playback by mutating local viewer playback refs while the route/provider path is still stalled.

8. Directory/OPFS `readFileRange` is on the hot playback path and must stay cache-friendly.
   - Repeatedly rebuilding `File` snapshots via `getFile()` for every shard slice can destroy playback throughput.
   - Directory-backed range reads must reuse cached file handles/snapshots and invalidate them correctly on writes.

9. Playback regressions should be debugged bottom-up, not top-down.
   - First confirm storage/range reads complete.
   - Then confirm `volumeProvider` page-table/atlas or volume loads complete.
   - Then confirm route warmup/current-frame promotion.
   - Only after that should you debug shell/top-menu playback UI.

10. A "fail-open" workaround is only acceptable if it preserves loaded-state truthfulness.
   - It is not acceptable to let the play button/counter advance while the loaded frame is still the old one.
   - Prefer fixing the actual data path over masking a stall in the viewer loop.

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
- `tests/app/hooks/useRouteLayerVolumes.test.ts`
  - Asserts active playback requests and warmup frames stay pinned to the playback scale.
- `tests/preprocessedStorage.test.ts`
  - Asserts directory-backed storage reuses file snapshots for repeated range reads and invalidates that cache on writes.
- `tests/useVolumeResources.test.ts`
  - Asserts projection-only changes refresh live resource shader/uniform state instead of waiting for unrelated reload triggers.

## Change Checklist

Before merging playback/streaming changes:

1. Run:
   - `npm run typecheck`
   - `node --import tsx --test tests/app/hooks/useRouteLayerVolumes.test.ts tests/app/hooks/useRoutePlaybackPrefetch.test.ts tests/preprocessedDataset.test.ts tests/app/hooks/useViewerModePlayback.test.ts tests/usePlaybackControls.test.ts tests/preprocessedStorage.test.ts tests/useVolumeResources.test.ts`
2. Confirm diagnostics in a heavy playback run:
   - Playback remains smooth.
   - `V` miss rate is not pinned by prefetch math artifacts.
   - GPU does not spike from full-residency uploads each frame.
   - UI timepoint/counter movement matches actual loaded-frame movement.
   - Directory-imported preprocessed datasets do not stall in page-table/atlas or direct-volume hot paths.

## CI Enforcement

- Pull requests that touch playback/streaming paths trigger a dedicated guard step in:
  - `.github/workflows/deploy.yml` (`Run playback regression guard tests`)
