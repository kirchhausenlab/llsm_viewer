# Hover Invariants

This document captures non-negotiable runtime behavior for voxel hover in the 3D viewer.

If you change hover sampling, layer selection, atlas residency, or viewer-space transforms, preserve these invariants.

## Invariants

1. Hover must work for atlas-only layers (`layer.volume === null`).
   - Atlas playback mode intentionally keeps full volumes unloaded on the frame path.
   - Hover cannot depend on `layer.volume` being present.

2. Hover ray mapping must use render-space dimensions, not atlas sample-space dimensions.
   - Use mesh/resource or full-resolution layer dimensions to normalize the pointer ray.
   - Atlas `pageTable.volumeShape` is sample space and may be downsampled.
   - Mixing these spaces causes large pointer-to-voxel offsets.

3. Hover layer selection must keep the existing priority order.
   - Prefer a `3d` resource when available.
   - Fall back to `slice` resources for depth volumes.
   - Fall back to CPU sampling only when no GPU/slice resource is available.

4. Atlas and playback guardrails must stay intact while hover remains functional.
   - Do not reintroduce full-volume loads in atlas playback paths just to support hover.
   - Hover sampling must operate on atlas/page-table data when in atlas mode.

5. Hover intensity readout must be discrete after the hover position is resolved.
   - The 3D hover finder may still choose a continuous/sub-voxel position along the ray.
   - After that position is chosen, the displayed hover intensity must come from exactly one voxel, not a trilinear blend of neighbors.
   - The voxel used for the readout must match the displayed hover coordinates in the top menu.
   - If render-space hover coordinates and layer data-space dimensions differ (for example atlas/downsampled layers), map the displayed render-space voxel deterministically to one data voxel before reading the stored value.
   - Rationale: if the UI says the pointer is still on the same voxel, the reported intensity must stay stable for that voxel. "One displayed voxel -> one denormalized raw value" is the contract.

## Regression Coverage

These tests are intended to fail if the above behavior regresses:

- `tests/volumeHoverSampling.test.ts`
  - Atlas and volume sampling behavior, channel mapping, denormalization, and discrete post-resolution hover readout behavior.
- `tests/volumeHoverTargetLayer.test.ts`
  - Hover target selection priorities and atlas-only layer eligibility.
- `tests/volumeHoverDimensions.test.ts`
  - Render-space dimension precedence (prevents pointer-to-voxel drift).
- `tests/useVolumeViewerInteractions.test.ts`
  - Hover highlight integration sanity checks.
- `tests/e2e/hover-smoke.spec.ts`
  - Browser-level smoke coverage for hover intensity and coordinate updates.

## Change Checklist

Before merging hover-related changes:

1. Run:
   - `npm run typecheck`
   - `npm run typecheck:tests`
   - `npm run test:hover-guards`
2. For UI/runtime changes, run:
   - `TEST_DATA_DIR=data/test_dataset_0 npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/hover-smoke.spec.ts`
   - `TEST_DATA_DIR=data/test_dataset_0 npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-playback-smoke.spec.ts`

## CI Enforcement

- Pull requests that touch hover paths trigger a dedicated guard step in:
  - `.github/workflows/deploy.yml` (`Run hover regression guard tests`)
