# Roadmap

## Phase 0 - Type-model and compatibility foundation

Goal:

- separate source dtype from stored intensity dtype
- define the new schema/version contract

Exit criteria:

- `hes2` format defined
- runtime/intake types have explicit stored intensity dtype fields
- compatibility approach for `hes1` + `hes2` is documented and implemented

## Phase 1 - Setup-page opt-in and validation

Goal:

- expose the `Render in 16bit` checkbox
- block useless all-8-bit runs before preprocessing starts

Exit criteria:

- checkbox is present and disabled when the page is locked
- preprocess click warns and aborts when all non-segmentation source layers are 8-bit
- preprocess click proceeds silently when at least one non-segmentation source layer is above 8-bit

## Phase 2 - Preprocess precision selection and schema emission

Goal:

- route the new option through preprocessing
- emit mixed `uint8` / `uint16` intensity scale data correctly

Exit criteria:

- stored intensity dtype is resolved per layer
- `uint16` identity path works
- non-identity `uint16` normalization works
- manifest/schema fixtures cover the new format

## Phase 3 - Side-data generalization

Goal:

- ensure skip-hierarchy, atlas, histogram, and subcell structures remain coherent with the main data precision

Exit criteria:

- intensity skip-hierarchy min/max precision matches stored precision
- subcell precision matches stored precision
- histogram generation works for `uint8` and `uint16`
- atlas generation works for `uint8` and `uint16` intensity

## Phase 4 - Runtime provider and cache refactor

Goal:

- load mixed-precision datasets safely
- stop inferring semantics from `uint16`
- make cache accounting precision-aware

Exit criteria:

- provider accepts intensity `uint8` and `uint16`
- explicit atlas semantic flag replaces `uint16 === segmentation`
- cache/diagnostics expose byte-aware volume residency

## Phase 5 - Viewer and slice-path refactor

Goal:

- make 3D and slice rendering accept either stored precision without breaking old data

Exit criteria:

- intensity volume textures upload as either byte or ushort
- slice textures upload as either byte or ushort
- texture cache and resource rebuild logic handle both widths
- old `hes1` datasets still render unchanged

## Phase 6 - Hover, ROI, and histogram correctness

Goal:

- remove all remaining `/255` assumptions
- preserve UI semantics over mixed precision

Exit criteria:

- hover denormalization is correct for `uint8` and `uint16`
- ROI measurements are correct for `uint8` and `uint16`
- auto-window and histogram UI remain stable

## Phase 7 - Performance hardening and closure

Goal:

- verify the expected tradeoff
- ensure no unacceptable regressions for old/default flows

Exit criteria:

- benchmark evidence recorded for 8-bit baseline vs 16-bit mode
- mixed-precision datasets behave predictably
- documentation, tests, and compatibility notes are synchronized
