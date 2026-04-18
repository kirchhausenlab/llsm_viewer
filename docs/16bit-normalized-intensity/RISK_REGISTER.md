# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`

## R-D16-001: Performance regression from doubled texture bandwidth

- Status: `OPEN`
- Trigger:
  - large higher-precision intensity layers stored as `uint16`
- Impact:
  - slower uploads, lower frame rate, worse VR responsiveness
- Mitigation:
  - mixed-precision per-layer storage
  - byte-aware cache budgets
  - benchmark 8-bit baseline vs 16-bit mode explicitly

## R-D16-002: `uint16` still being interpreted as segmentation

- Status: `OPEN`
- Trigger:
  - atlas, slice, or hover helpers continue to use `uint16` as a segmentation proxy
- Impact:
  - broken intensity sampling, broken slice rendering, broken hover values
- Mitigation:
  - add explicit semantic flags
  - audit all `dataType === 'uint16'` logic

## R-D16-003: Backward-compatibility break for existing preprocessed datasets

- Status: `OPEN`
- Trigger:
  - importer/schema only understands the new format
- Impact:
  - old `.zarr` datasets fail to open
- Mitigation:
  - dual-format schema support for `hes1` and `hes2`
  - runtime tests for old fixtures

## R-D16-004: Count-based cache limits silently become invalid

- Status: `OPEN`
- Trigger:
  - stored `uint16` volumes occupy much more memory under unchanged cache-count limits
- Impact:
  - unexpected RAM pressure, eviction churn, instability
- Mitigation:
  - add byte-aware volume cache accounting and diagnostics

## R-D16-005: Side-data stays 8-bit and nullifies 16-bit benefits

- Status: `OPEN`
- Trigger:
  - skip-hierarchy min/max or subcell data remain `uint8` for 16-bit intensity layers
- Impact:
  - conservative but much less effective skipping
  - weaker close-up behavior and wasted bandwidth
- Mitigation:
  - align side-data precision with stored intensity precision

## R-D16-006: Hover and ROI paths keep hard-coded `/255`

- Status: `OPEN`
- Trigger:
  - only the renderer is updated
- Impact:
  - wrong raw values for 16-bit stored layers
- Mitigation:
  - centralize normalized-denominator helpers
  - test hover and ROI values on identity and min/max-normalized 16-bit cases

## R-D16-007: Slice path remains 8-bit even when 3D path is 16-bit

- Status: `OPEN`
- Trigger:
  - direct volume rendering is updated but CPU slice packing still emits `Uint8Array`
- Impact:
  - inconsistent viewer behavior between 3D and slice modes
- Mitigation:
  - update `renderingUtils.ts` and slice texture upload typing alongside the 3D path

## R-D16-008: Histogram/auto-window regressions

- Status: `OPEN`
- Trigger:
  - histogram code assumes raw `Uint8Array`
- Impact:
  - broken auto contrast or misleading histograms
- Mitigation:
  - keep 256 bins but generalize normalized-value bucketing for `uint8` and `uint16`

## R-D16-009: Browser/GPU quirks with normalized ushort 3D textures

- Status: `MONITORING`
- Trigger:
  - driver/browser-specific behavior around `UnsignedShortType` 3D textures
- Impact:
  - incorrect rendering or runtime failures on some platforms
- Mitigation:
  - validate on supported browser targets
  - keep old 8-bit path intact
  - consider fallback to 8-bit rendering if a platform check fails

## R-D16-010: Preprocess-time dtype guard becomes misleading for mixed datasets

- Status: `OPEN`
- Trigger:
  - guard only checks `sourceDataType !== 'uint8'`
- Impact:
  - incorrect behavior for `int8`
- Mitigation:
  - use byte width (`getBytesPerValue(sourceDataType)`) rather than exact dtype string
