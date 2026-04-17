# Decisions

Status legend: `LOCKED`, `PROVISIONAL`, `SUPERSEDED`

## D-BL-001: Render Style Is Per-Layer

- Status: `LOCKED`
- Decision:
  - `renderStyle` is stored and edited per layer.
  - Global render-style toggling is not the source of truth.
- Rationale:
  - Matches layer-local visualization state.

## D-BL-002: Desktop Uses Explicit Mode Buttons

- Status: `LOCKED`
- Decision:
  - Desktop UI uses explicit `MIP`, `ISO`, `BL` buttons in `ChannelsPanel`.
- Rationale:
  - Makes multi-layer state unambiguous.

## D-BL-003: BL Tuning Controls Are Shared Global Values

- Status: `LOCKED`
- Decision:
  - `blDensityScale`, `blBackgroundCutoff`, `blOpacityScale`, and `blEarlyExitAlpha` are shared global values.
  - They are exposed in the selected-layer UI when the selected layer render style is `BL`.
- Initial defaults:
  - `blDensityScale = 1.0`
  - `blBackgroundCutoff = 0.08`
  - `blOpacityScale = 1.0`
  - `blEarlyExitAlpha = 0.98`
- Rationale:
  - Keeps tuning behavior simple and consistent across visible layers while still making the controls easy to find.

## D-BL-004: Use Per-Mode Shader Variants

- Status: `LOCKED`
- Decision:
  - Use separate shader/material variants for `MIP`, `ISO`, and `BL`.
- Rationale:
  - Avoids measurable MIP/ISO regression from dormant BL branches.

## D-BL-005: Keep Existing Numeric Render-Style Contract

- Status: `LOCKED`
- Decision:
  - Runtime render style remains numeric (`0 | 1 | 2`).
- Rationale:
  - Minimizes plumbing churn.

## D-BL-006: Planar Views Do Not Implement BL

- Status: `LOCKED`
- Decision:
  - Type broadening to include `2` is accepted, but planar rendering does not implement BL behavior.
- Rationale:
  - BL is a 3D raymarching mode.

## D-BL-007: VR Keeps the Existing Interaction Contract

- Status: `LOCKED`
- Decision:
  - VR continues to use `onLayerRenderStyleToggle(layerKey?)`, upgraded to cycle `MIP -> ISO -> BL -> MIP`.
- Rationale:
  - Preserves current VR wiring with minimal API churn.

## D-BL-008: No Special Backward-Compatibility Layer

- Status: `LOCKED`
- Decision:
  - No dedicated backward-compatibility layer was added for this feature track.
- Rationale:
  - The repo favors forward cleanup over compatibility scaffolding for this area.
