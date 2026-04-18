# Decisions

## D16-001: Feature is opt-in at preprocess time

- The setup page adds a checkbox labeled `Render in 16bit`.
- Default is `false`.
- The flag affects only newly preprocessed datasets.
- Existing preprocessed datasets remain readable without migration.

## D16-002: 16-bit mode uses mixed precision per non-segmentation layer

- This refactor does **not** blindly upconvert every non-segmentation layer to `uint16`.
- In `Render in 16bit` mode:
  - source `uint8` and `int8` intensity layers remain stored as `uint8`
  - source `uint16` intensity layers remain stored as `uint16` with identity mapping
  - source `int16`, `uint32`, `int32`, `float32`, and `float64` intensity layers are stored as normalized `uint16`
- Reason:
  - source 8-bit layers gain no precision from `uint16`
  - leaving them `uint8` avoids unnecessary storage, memory, upload, and bandwidth cost

## D16-003: Source dtype and stored intensity dtype must be separate concepts

- `dataType` continues to mean source/original dtype.
- A new stored-intensity dtype field is required for non-segmentation runtime logic.
- Recommended names:
  - manifest / summaries / loaded layers: `storedDataType`
  - runtime intensity volume: `normalizedDataType`
- Do **not** overload `dataType` to mean both source dtype and stored dtype.

## D16-004: The new dataset format requires a manifest version bump

- Current format is `llsm-viewer-preprocessed-vnext-hes1`.
- The new mixed-precision intensity contract requires a new format string, e.g. `llsm-viewer-preprocessed-vnext-hes2`.
- The importer/schema must accept both `hes1` and `hes2`.

## D16-005: 16-bit intensity uses normalized texture sampling, not integer samplers

- Intensity textures remain sampled through normal `sampler2D` / `sampler3D`.
- `Uint16Array + UnsignedShortType` should be uploaded as normalized textures.
- Shader math continues to operate in normalized `[0, 1]` sample space.
- This avoids a full rewrite to integer-texture sampling for intensity.

## D16-006: Viewer window state remains normalized `[0, 1]`

- `windowMin` / `windowMax` remain normalized viewer-space values.
- Auto-window, manual window sliders, and shader windowing continue to operate on normalized intensity.
- Raw-domain metadata (`min` / `max`) remains separate and is used for denormalization and formatting.

## D16-007: Side-data precision must track stored intensity precision where it affects runtime quality

- For non-segmentation intensity data:
  - scale `zarr.data` uses `uint8` or `uint16`
  - skip-hierarchy `min` / `max` should use the same stored dtype as the main data
  - `subcell.data` should use the same stored dtype as the main data
  - occupancy remains `uint8`
- Reason:
  - leaving `min` / `max` or subcell stats at `uint8` would preserve correctness only conservatively, but would badly degrade skip efficiency and window-sensitive behavior in 16-bit mode

## D16-008: Atlas/CPU helpers must stop using `uint16` as a proxy for segmentation

- `uint16` currently means segmentation in several atlas and slice helpers.
- That becomes invalid once intensity can also be `uint16`.
- Atlas/runtime structures need an explicit semantic field such as:
  - `kind: 'intensity' | 'segmentation'`
  - or `isSegmentation: boolean`

## D16-009: Front-page validation uses source precision width, not exact dtype name

- The preprocess-time warning should trigger when every non-segmentation source layer is 8-bit wide.
- This includes both `uint8` and `int8`.
- It should proceed when at least one non-segmentation source layer has `getBytesPerValue(sourceDataType) > 1`.

## D16-010: Hover and ROI denormalization must be denominator-driven

- Current logic assumes `255`.
- All inverse-normalization helpers must instead use the layer’s normalized denominator:
  - `255` for `uint8`
  - `65535` for `uint16`
