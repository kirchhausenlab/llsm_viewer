# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## BL implementation backlog

- `BLR-001` (`DONE`): render-style type migration to `0 | 1 | 2`.
  - Scope:
    - update shared setting/types contracts and all call sites
  - Evidence (target):
    - `src/state/layerSettings.ts`
    - `src/hooks/useChannelLayerState.tsx`
    - `src/hooks/dataset/useChannelDatasetLoader.ts`
    - `src/components/viewers/VolumeViewer.types.ts`
    - `src/components/viewers/viewer-shell/types.ts`
    - `src/components/viewers/planar-viewer/types.ts`
    - `src/components/viewers/volume-viewer/vr/types.ts`

- `BLR-002` (`DONE`): add BL setting fields and defaults in layer settings.
  - Scope:
    - `blDensityScale`, `blBackgroundCutoff`, `blOpacityScale`, `blEarlyExitAlpha`
    - include in create/reset/load flows
  - Evidence (target):
    - `src/state/layerSettings.ts`
    - `src/hooks/useChannelLayerState.tsx`
    - `src/hooks/dataset/useChannelDatasetLoader.ts`
    - `src/ui/app/hooks/useLayerControls.ts`

- `BLR-003` (`DONE`): convert render-style control logic from global to per-layer.
  - Scope:
    - update `handleLayerRenderStyleToggle` to target one layer key
    - preserve deterministic behavior when no layer key is provided
  - Evidence (target):
    - `src/ui/app/hooks/useLayerControls.ts`
    - `src/ui/app/hooks/useAppRouteState.tsx`

- `BLR-004` (`DONE`): desktop UI explicit per-layer `MIP`/`ISO`/`BL` buttons.
  - Scope:
    - add row in `ChannelsPanel` selected-layer controls
    - remove global render-style source usage in viewer settings panel
  - Evidence (target):
    - `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
    - `src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx`
    - `src/components/viewers/viewer-shell/types.ts`

- `BLR-005` (`DONE`): expose BL controls in desktop UI.
  - Scope:
    - add slider controls for BL parameters in `ChannelsPanel`
    - add callback props plumbing for BL parameters
  - Evidence (target):
    - `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
    - `src/components/viewers/viewer-shell/types.ts`
    - `src/ui/app/hooks/useAppRouteState.tsx`
    - `src/ui/app/hooks/useLayerControls.ts`

- `BLR-006` (`DONE`): VR render-style cycle supports 3 modes.
  - Scope:
    - update cycle behavior to include BL
    - update HUD text/highlight logic
  - Evidence (target):
    - `src/components/viewers/volume-viewer/vr/controllerSelectEnd.ts`
    - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsLayerSections.ts`
    - `src/components/viewers/volume-viewer/useVolumeViewerVr/useVrHudBindings.ts`

- `BLR-007` (`DONE`): per-mode shader variant infrastructure.
  - Scope:
    - add variant selection by layer style
    - avoid dormant BL branch in active MIP/ISO path
  - Evidence (target):
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/shaders/volumeRenderShader.ts`

- `BLR-008` (`DONE`): BL raymarch implementation and uniform wiring.
  - Scope:
    - Beer-Lambert accumulation path
    - BL uniform defaults and runtime updates
  - Evidence (target):
    - `src/shaders/volumeRenderShader.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`

- `BLR-009` (`DONE`): tests for per-layer style and BL controls.
  - Scope:
    - layer state/control tests
    - UI render-style + BL-control visibility tests
  - Evidence (target):
    - `tests/app/hooks/*`
    - `tests/viewer-shell/*`

- `BLR-010` (`DONE`): tests for shader/resource variant mapping and BL uniforms.
  - Scope:
    - ensure correct variant selected by render style
    - ensure BL uniforms bind/update as expected
  - Evidence (target):
    - `tests/useVolumeResources.test.ts`
    - shader model tests if needed

- `BLR-011` (`DONE`): performance verification and optional prewarm.
  - Scope:
    - compare MIP/ISO before vs after
    - add optional prewarm if first-toggle hitches are unacceptable
  - Evidence (target):
    - updated perf notes in `EXECUTION_LOG.md`
    - any perf test/code updates

- `BLR-012` (`DONE`): closure docs and final handoff.
  - Scope:
    - complete backlog state
    - summarize verification and residual risks
  - Evidence (target):
    - `docs/renderstyle-bl-mode/SESSION_HANDOFF.md`
    - `docs/renderstyle-bl-mode/EXECUTION_LOG.md`

## Suggested parallelization

- Group A (state/ui): `BLR-001` through `BLR-005`
- Group B (VR): `BLR-006`
- Group C (renderer/shader): `BLR-007`, `BLR-008`
- Group D (tests/perf/docs): `BLR-009` through `BLR-012`

Avoid concurrent edits to these high-contention files:

- `src/ui/app/hooks/useLayerControls.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
