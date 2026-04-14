# Implementation Spec

This document describes the implemented architecture for Beer-Lambert mode and render-style control.

## 1) State contract

- `renderStyle` is per-layer.
- `renderStyle` supports `MIP`, `ISO`, and `BL`.
- BL tuning values are shared global values:
  - `blDensityScale`
  - `blBackgroundCutoff`
  - `blOpacityScale`
  - `blEarlyExitAlpha`
- Shared tuning values are surfaced in the selected-layer UI when that layer is in `BL`.

Primary touchpoints:

- `src/state/layerSettings.ts`
- `src/hooks/useChannelLayerState.tsx`
- `src/ui/app/hooks/useLayerControls.ts`

## 2) UI contract

Desktop:

- `ChannelsPanel` exposes explicit `MIP`, `ISO`, `BL` buttons for the selected layer.
- BL tuning controls are shown only when the selected layer style is `BL`.
- The old global render-style toggle is removed from viewer settings.

VR:

- Channels HUD cycles `MIP -> ISO -> BL -> MIP`.
- HUD text reflects the current mode.

## 3) Renderer contract

- Renderer uses per-mode shader/material variants.
- MIP and ISO stay on their own active runtime paths.
- BL uses Beer-Lambert accumulation with:
  - density scale
  - background cutoff
  - opacity scale
  - early-exit alpha

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/components/viewers/VolumeViewer.types.ts`

## 4) Verification contract

- Per-layer render-style changes must affect only the targeted layer.
- Shared BL tuning controls must update consistently across layers.
- BL controls must only be visible when the selected layer is in `BL`.
- VR render-style cycling must include all three modes.
- MIP/ISO behavior must remain stable when BL is present.
