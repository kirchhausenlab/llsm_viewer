# Optional 16-Bit Normalized Intensity Rendering

Status: **Proposed**  
Start date: **2026-04-17**

This folder is the source of truth for the optional `Render in 16bit` preprocessing and runtime refactor.

## Problem statement

- Non-segmentation channels are currently normalized to `uint8` before rendering.
- That is essential for current runtime performance, but it introduces visible precision loss for:
  - inverse-normalized hover values
  - ROI measurements
  - narrow-window rendering on high-bit-depth inputs
- The viewer currently assumes non-segmentation stored intensity data is always `uint8`.

## Target outcome

- Front-page experiment setup exposes an opt-in `Render in 16bit` checkbox under `Background mask`.
- When disabled, preprocessing/runtime behavior stays unchanged.
- When enabled:
  - datasets with only 8-bit non-segmentation source layers are blocked with a warning
  - datasets with at least one higher-precision non-segmentation source layer preprocess successfully
  - non-segmentation intensity storage becomes mixed-precision:
    - source `uint8` / `int8` layers stay `uint8`
    - source `uint16` layers use identity `uint16` storage over `0..65535`
    - all other non-segmentation source dtypes normalize to `uint16`
- The viewer loads and renders mixed `uint8` + `uint16` intensity layers correctly.
- Hover and ROI measurement paths denormalize with the correct denominator for each layer.

## Scope

- Setup-page UI and preprocess validation
- Preprocess schema/manifest versioning
- Mixed-precision intensity storage in Zarr output
- Volume provider, atlas, slice, hover, ROI, histogram, auto-window, and shader updates
- Runtime cache and diagnostics updates required for the larger per-layer byte footprint

## Non-goals

- Replacing representative-timepoint normalization with per-timepoint normalization
- Adding raw full-precision sidecar datasets
- Changing segmentation storage/behavior
- Reworking UI window sliders away from normalized `[0, 1]` semantics

## Read order

1. `IMPLEMENTATION_SPEC.md`
2. `DECISIONS.md`
3. `AUDIT_CHECKLIST.md`
4. `ROADMAP.md`
5. `BACKLOG.md`
6. `RISK_REGISTER.md`
7. `TEST_PLAN.md`
