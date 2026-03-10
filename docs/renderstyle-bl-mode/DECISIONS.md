# Decisions

This file records locked decisions for the per-layer render-style + BL implementation.

Status legend: `LOCKED`, `PROVISIONAL`, `SUPERSEDED`

## D-BL-001: Render style becomes per-layer

- Status: `LOCKED`
- Decision:
  - `renderStyle` is stored and edited per layer.
  - Global render-style toggling is removed as source of truth.
- Rationale:
  - User requirement.
  - Matches layer-local controls (windowing, color, invert).

## D-BL-002: Desktop uses explicit mode buttons

- Status: `LOCKED`
- Decision:
  - Desktop UI shows explicit `MIP`, `ISO`, `BL` buttons (not a toggle cycle).
  - Control is placed in layer-scoped UI (`ChannelsPanel`) for the selected layer.
- Rationale:
  - User requirement.
  - Prevents ambiguous mode state in multi-layer scenes.

## D-BL-003: BL controls are exposed in first release

- Status: `LOCKED`
- Decision:
  - First pass exposes the following per-layer controls:
    - `blDensityScale`
    - `blBackgroundCutoff`
    - `blOpacityScale`
    - `blEarlyExitAlpha`
  - Controls are visible only when selected layer render style is `BL`.
- Initial default values:
  - `blDensityScale = 1.0`
  - `blBackgroundCutoff = 0.08`
  - `blOpacityScale = 1.0`
  - `blEarlyExitAlpha = 0.98`
- Rationale:
  - User requirement.
  - Needed for noisy-background data where naive BL can look hazy.

## D-BL-004: Use per-mode shader variants

- Status: `LOCKED`
- Decision:
  - Implement separate shader/material variants for `MIP`, `ISO`, and `BL`.
  - Keep MIP and ISO paths unchanged in active runtime behavior.
- Rationale:
  - Avoid measurable MIP/ISO frame-time regression from dormant BL branch logic.
  - Cleaner evolution for mode-specific uniforms and optimizations.

## D-BL-005: Keep existing render-style numeric contract

- Status: `LOCKED`
- Decision:
  - Continue numeric mode ids in runtime (`0 | 1 | 2`) for minimal plumbing churn.
  - Introduce shared constants/types to remove magic numbers.
- Rationale:
  - Existing shader/state/plumbing already uses numeric render style.
  - Reduces migration risk and diff size.


- Status: `LOCKED`
- Decision:
  - Any type broadening to include `2` is accepted; no BL rendering changes in planar.
- Rationale:
  - BL is a 3D raymarching mode.
  - Reduces scope and risk.

## D-BL-007: VR uses existing interaction contract

- Status: `LOCKED`
- Decision:
  - VR render-style interaction remains in channels HUD.
  - Callback path stays `onLayerRenderStyleToggle(layerKey?)`, internally upgraded to cycle `MIP -> ISO -> BL -> MIP`.
- Rationale:
  - Minimal API churn.
  - Preserves current VR interaction wiring while adding third mode.

## D-BL-008: Backward compatibility

- Status: `LOCKED`
- Decision:
  - No special backward compatibility layer is required for this feature.
- Rationale:
  - Repo policy favors forward progress in early development.

