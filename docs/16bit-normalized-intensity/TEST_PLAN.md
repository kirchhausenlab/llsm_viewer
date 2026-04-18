# Test Plan

This plan defines required verification for optional 16-bit normalized intensity rendering.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. `npm run -s test -- tests/preprocessPipeline.test.ts`
4. `npm run -s test -- tests/preprocessedSchemaValidation.test.ts`
5. `npm run -s test -- tests/preprocessedDataset.test.ts`
6. `npm run -s test -- tests/useVolumeResources.test.ts`
7. `npm run -s test -- tests/volumeHoverSampling.test.ts`
8. `npm run -s test -- tests/roiMeasurements.test.ts`

If front-page or viewer-shell files changed, also run:

1. `npm run -s test -- tests/frontend`
2. `npm run -s test -- tests/viewer-shell`
3. `npm run -s test -- tests/app/hooks`

If provider/resource/perf-sensitive files changed, also run:

1. `npm run -s test -- tests/perf`
2. `npm run -s benchmark:nextgen-volume`

## Required e2e checks per milestone

At the end of each phase that changes user-visible behavior, run the relevant Playwright coverage. Minimum required end-to-end suites for final signoff:

1. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/frontpage-smoke.spec.ts`
2. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/channels-smoke.spec.ts`
3. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/hover-smoke.spec.ts`
4. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/roi-measurements.spec.ts`
5. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-playback-smoke.spec.ts`
6. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/projection-mode-smoke.spec.ts`
7. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/orthographic-regression.spec.ts`

If any relevant visual/rendering logic changed, also run:

1. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-3d-shader-smoke.spec.ts`
2. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/hover-diagnostic.spec.ts`
3. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/render-after-preprocess-diagnostic.spec.ts`

If perf-sensitive logic changed, also run:

1. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/preprocess-perf.spec.ts`
2. `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-closeup-perf.spec.ts`

## Feature acceptance checks

### A. Setup-page behavior

- `Render in 16bit` appears under `Background mask`.
- It defaults to unchecked.
- It is disabled when the front page is locked.
- When checked and all non-segmentation source layers are 8-bit, preprocessing is blocked with the expected warning.
- When checked and at least one non-segmentation source layer is above 8-bit, preprocessing proceeds without a warning.
- Export-while-preprocessing still works in both 8-bit and 16-bit modes.

### B. Schema and manifest behavior

- New preprocessing emits `hes2`.
- Old `hes1` datasets still open.
- Layer summaries expose both:
  - source dtype
  - stored intensity dtype
- Intensity scales may store `uint8` or `uint16`.
- Segmentation remains `uint16`.

### C. Preprocess normalization behavior

- `Render in 16bit = false` preserves current 8-bit output behavior.
- Source `uint16` + `Render in 16bit = true` stores identity `uint16` with `min=0`, `max=65535`.
- Source `float32` + `Render in 16bit = true` stores linearly normalized `uint16`.
- Source `uint8` + `Render in 16bit = true` remains stored as `uint8`.
- Mixed datasets produce mixed stored intensity dtypes correctly.

### D. Side-data behavior

- Intensity skip-hierarchy `min/max` precision matches stored intensity precision.
- Subcell precision matches stored intensity precision.
- Histograms remain 256 bins and are valid for `uint8` and `uint16` stored intensity.
- Playback atlas generation works for both stored intensity precisions.

### E. Runtime/provider behavior

- Provider loads intensity layers stored as either `uint8` or `uint16`.
- Old datasets still load.
- Mixed `uint8` + `uint16` intensity layers load in one dataset.
- Atlas runtime no longer treats `uint16` as segmentation by dtype alone.

### F. 3D rendering behavior

- Intensity 3D textures upload as:
  - `UnsignedByteType` for `uint8`
  - `UnsignedShortType` for `uint16`
- Shader output remains stable for old 8-bit datasets.
- 16-bit mode renders without crashes or obvious sampling corruption.
- Mixed-precision datasets render correctly with multiple visible layers.
- Intensity and segmentation layers still coexist correctly in the same scene.

### G. Slice rendering behavior

- Slice mode renders 8-bit datasets exactly as before.
- Slice mode renders 16-bit stored intensity without truncating back to 8-bit.
- Slice atlas rendering works for 16-bit intensity and segmentation independently.
- Slice-mode hover readouts remain correct for 16-bit intensity.

### H. Hover and ROI behavior

- Hover raw values for 16-bit identity layers match expected stored/source values within normal interpolation tolerance.
- Hover raw values for linearly normalized 16-bit layers denormalize with `/65535`, not `/255`.
- ROI measurements produce correct min/max/mean/median/std for stored `uint16` intensity.
- Existing 8-bit hover and ROI behavior remains unchanged.
- Hover remains correct when the active render source is:
  - direct scale-0 volume
  - direct coarse volume
  - brick atlas
- Hover remains correct in:
  - perspective mode
  - orthographic mode
  - slice mode

### I. Histogram and auto-window behavior

- Histogram UI still renders and updates.
- Auto-window continues to produce valid normalized `[0, 1]` window bounds for both stored precisions.
- Very sparse/high-value voxels still behave reasonably with the 256-bin histogram contract.

### J. Performance behavior

- `Render in 16bit = false` does not materially regress from the 8-bit baseline.
- Mixed datasets degrade roughly with the amount of 16-bit stored intensity actually present.
- Full 16-bit eligible datasets show the expected cost increase but remain stable.
- Volume-cache diagnostics reflect byte-aware residency.

### K. Legacy-compatibility behavior

- Existing `hes1` datasets still import and render.
- Mixed application sessions can open old and new datasets without reload-only hacks.

### L. End-to-end scenario matrix

Every row below should have at least one passing automated e2e case or a documented reason why it remains covered by unit/integration tests only.

- all-8-bit non-segmentation dataset with `Render in 16bit = true` is blocked before preprocess
- mixed dataset with one `uint8` intensity layer and one higher-precision intensity layer preprocesses successfully
- pure `uint16` intensity dataset preprocesses successfully
- `uint16` intensity plus segmentation dataset preprocesses and launches successfully
- `uint16` intensity hover values are correct after preprocessing
- `float32 -> uint16` normalized dataset hover values denormalize correctly
- ROI measurements are correct on 16-bit identity data
- ROI measurements are correct on 16-bit min/max-normalized data
- playback works on 16-bit intensity datasets
- orthographic rendering works on 16-bit intensity datasets
- slice rendering works on 16-bit intensity datasets
- imported legacy `hes1` dataset still launches and renders
- export-while-preprocessing still produces a loadable dataset in 16-bit mode

## Required new or updated e2e specs

The existing Playwright coverage is a strong base, but the final rollout should add or explicitly extend specs for:

1. `frontpage-16bit-validation.spec.ts`
   - all-8-bit warning path
   - allowed mixed/higher-precision path
2. `viewer-16bit-hover.spec.ts`
   - direct volume and atlas hover readout correctness
3. `viewer-16bit-roi-measurements.spec.ts`
   - ROI measurement correctness on identity and normalized 16-bit cases
4. `viewer-16bit-playback.spec.ts`
   - playback smoke on a 16-bit stored dataset
5. `viewer-16bit-legacy-compat.spec.ts`
   - open/render old `hes1` dataset under the new runtime
6. extend existing front-page/workflow helpers to drive the `Render in 16bit` checkbox and generate typed synthetic TIFF fixtures

## Recommended fixture families for e2e

Use synthetic TIFF fixtures where possible so the expected values are exact and reproducible:

1. single-channel `uint16` identity fixture
2. single-channel `float32` fixture normalized to `uint16`
3. mixed `uint8` + `uint16` intensity fixture
4. `uint16` intensity + segmentation fixture
5. legacy `hes1` import fixture

## Required new fixture/test scenarios

1. `uint16` identity dataset fixture
2. `float32 -> uint16` normalized dataset fixture
3. mixed `uint8 + uint16` intensity dataset fixture
4. legacy `hes1` dataset compatibility fixture
5. 16-bit intensity atlas fixture

## Test evidence recording format

For each implementation session, record:

- commands run
- pass/fail
- measured perf deltas when relevant
- if failed:
  - failing command
  - root cause
  - blocking backlog item id
