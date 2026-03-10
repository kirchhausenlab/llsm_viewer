# Roadmap

Status legend: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

## Phase 0 - Baseline and scaffolding

Status: `NOT_STARTED`

Goals:

- Confirm baseline behavior and collect references.
- Add shared render-style constants/type and BL setting fields in one pass-ready design.

Exit criteria:

- Baseline references documented.
- Implementation branch ready for Phase 1.

## Phase 1 - Type and state migration (`0|1 -> 0|1|2`)

Status: `NOT_STARTED`

Goals:

- Update type contracts across state/viewer/VR/dataset paths.
- Ensure layer default settings include BL fields.

Exit criteria:

- Typecheck passes with no remaining binary render-style type references.

## Phase 2 - Per-layer desktop controls

Status: `NOT_STARTED`

Goals:

- Add explicit per-layer MIP/ISO/BL controls in `ChannelsPanel`.
- Remove global render-style source of truth.

Exit criteria:

- Changing one layer style does not mutate other layers.
- UI reflects selected layer mode correctly.

## Phase 3 - VR 3-mode support

Status: `NOT_STARTED`

Goals:

- Update VR channels render-style action to 3-state cycle.
- Update HUD text/visual state for BL.

Exit criteria:

- VR render-style action cycles MIP -> ISO -> BL -> MIP.

## Phase 4 - Shader variant infrastructure

Status: `NOT_STARTED`

Goals:

- Add per-mode shader/material variant selection in `useVolumeResources`.
- Keep MIP/ISO paths stable.

Exit criteria:

- Active variant matches layer render style.
- No BL branch in active MIP/ISO runtime path.

## Phase 5 - BL shader implementation

Status: `NOT_STARTED`

Goals:

- Implement Beer-Lambert accumulation path.
- Bind BL uniforms and defaults.

Exit criteria:

- BL renders valid images and supports early exit.

## Phase 6 - BL controls and tuning path

Status: `NOT_STARTED`

Goals:

- Expose BL controls in desktop UI and state updates.
- Ensure controls update selected layer in real-time.

Exit criteria:

- BL controls are visible only in BL mode and affect render output.

## Phase 7 - Verification and closure

Status: `NOT_STARTED`

Goals:

- Complete tests and performance checks.
- Close docs, backlog, and handoff.

Exit criteria:

- Required commands in `TEST_PLAN.md` pass.
- Backlog items are all `DONE`.

