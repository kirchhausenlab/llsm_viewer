# Implementation Spec

This spec defines the intended implementation architecture and file touchpoints.

## 1) Current-state summary

- Current 3D render styles are binary (`MIP` and `ISO`) selected via `renderStyle: 0 | 1`.
- Render-style state is effectively global in app flow (`globalRenderStyle` toggles all layers).
- Volume shader dispatch currently branches by `u_renderstyle`.
- Volume render resources are built in `useVolumeResources.ts`.
- Viewer settings panel currently exposes a global render toggle.
- VR channels HUD already has a render-style action path, but logic is binary.

Primary touchpoints:

- `src/state/layerSettings.ts`
- `src/hooks/useChannelLayerState.tsx`
- `src/hooks/dataset/useChannelDatasetLoader.ts`
- `src/ui/app/hooks/useLayerControls.ts`
- `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
- `src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx`
- `src/components/viewers/viewer-shell/types.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `src/components/viewers/volume-viewer/vr/*`

## 2) Target state

- Render style is per-layer with three explicit modes:
  - `0 = MIP`
  - `1 = ISO`
  - `2 = BL`
- Desktop layer UI exposes explicit `MIP`, `ISO`, `BL` buttons.
- BL parameter controls are per-layer and available immediately.
- Renderer uses per-mode shader/material variants.
- MIP/ISO runtime behavior remains equivalent when those modes are selected.

## 3) Data model changes

Add a shared render-style type and constants.

Recommended location:

- `src/state/layerSettings.ts` (source of shared setting types)

Add BL per-layer settings fields:

- `blDensityScale: number`
- `blBackgroundCutoff: number`
- `blOpacityScale: number`
- `blEarlyExitAlpha: number`

Ensure these are:

- in defaults (`createDefaultLayerSettings`)
- preserved by channel reset logic where appropriate
- copied through dataset load/setup paths

## 4) UI behavior changes

### Desktop (required)

Layer-scoped controls in `ChannelsPanel` for selected layer:

- Render style row with 3 buttons:
  - `MIP`
  - `ISO`
  - `BL`
- BL controls section shown only when selected layer is `BL`.

Global viewer settings panel (`PlaybackControlsPanel`):

- Remove/replace the global render-style toggle as source of truth.
- Keep unrelated controls (sampling/blending/fps/etc.) unchanged unless explicitly required later.

### VR (required)

Channels HUD render-style action remains same target type:

- Update visual label to show current mode text.
- Update callback handling to cycle 3 states instead of 2.

## 5) Shader/material architecture

### Variant strategy

Create per-mode shader/material variants:

- `MIP` variant
- `ISO` variant
- `BL` variant

Implementation options:

- Option A: One shader source + compile-time define per mode.
- Option B: Separate fragment entry points with shared helpers.

Requirement:

- Active material for MIP/ISO must not execute BL branch logic.

### BL algorithm (first pass)

Per-ray step:

1. Sample intensity/color.
2. Apply background cutoff.
3. Convert to extinction via density and opacity scale.
4. Accumulate front-to-back transmittance:
   - `alpha_step = 1 - exp(-sigma_t * ds)`
   - `accumColor += transmittance * alpha_step * sampleColor`
   - `transmittance *= (1 - alpha_step)`
5. Early exit when accumulated alpha reaches `blEarlyExitAlpha`.

### BL-specific uniforms

- `u_blDensityScale`
- `u_blBackgroundCutoff`
- `u_blOpacityScale`
- `u_blEarlyExitAlpha`

These uniforms are ignored by MIP/ISO variants.

## 6) Resource plumbing changes

In `useVolumeResources.ts`:

- Build materials according to layer render style.
- Maintain existing texture/uniform lifecycle.
- Ensure updates that do not change style reuse the current material path.
- Ensure style changes swap material variant safely.

Important:

- Keep existing camera uniform updates, blending mode wiring, and page-table/atlas metadata behavior unchanged unless required.

## 7) Test requirements

Required test classes:

- Type/state tests:
  - render style accepts `2`
  - BL settings default and persistence behavior
- Layer controls tests:
  - per-layer style updates only target layer
  - no global style overwrite
- UI tests:
  - explicit MIP/ISO/BL buttons render
  - active state reflects current layer style
  - BL controls visible only in BL mode
- Shader/resource tests:
  - style-to-variant mapping works
  - BL uniforms are bound/updated
  - MIP/ISO variant behavior unaffected
- VR tests:
  - render-style cycles through 3 modes

## 8) Performance expectations

When BL is not selected:

- MIP/ISO frame-time impact should be negligible.
- Possible one-time compile hitch when a mode is first selected is acceptable.

Recommended mitigation:

- Optional shader prewarm pass after viewer initialization.

## 9) Risks and mitigations

Risk: Noisy backgrounds produce BL haze.

- Mitigation:
  - expose `blBackgroundCutoff` and `blOpacityScale`
  - set conservative defaults

Risk: First-toggle compile stutter with variants.

- Mitigation:
  - optional prewarm
  - cache and reuse materials per mode

Risk: Partial migration leaves binary `0 | 1` types.

- Mitigation:
  - complete type sweep before UI/shader changes
  - add compile-time tests and search checks

