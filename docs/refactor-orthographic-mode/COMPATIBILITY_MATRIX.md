# Compatibility Matrix

This matrix tracks feature compatibility after orthographic cutover.

Status legend: `COMPATIBLE`, `COMPATIBLE_WITH_CHANGES`, `INCOMPATIBLE`, `UNKNOWN`

| Area | Status | Notes | Primary Touchpoints |
|---|---|---|---|
| Core volume raymarch rendering | `COMPATIBLE` | Projection-aware shader path is implemented. | `src/shaders/volumeRenderShader.ts`, `src/components/viewers/volume-viewer/useVolumeResources.ts` |
| Clipping planes | `COMPATIBLE` | Slice-plane uniforms and clipping now run under projection-aware ray setup. | `src/shaders/volumeRenderShader.ts`, `src/components/viewers/volume-viewer/useVolumeResources.ts` |
| Slice planes and slice dragging | `COMPATIBLE` | Pointer lifecycle now accepts projection-safe camera typing. | `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts` |
| Hover sampling / voxel probe | `COMPATIBLE` | Hover ray setup now works with generic camera type. | `src/components/viewers/volume-viewer/useVolumeHover.ts` |
| Picking / hit testing | `COMPATIBLE` | Track hit-testing camera typing generalized to `THREE.Camera`. | `src/components/viewers/volume-viewer/trackHitTesting.ts`, `src/components/viewers/volume-viewer/useTrackRendering.ts` |
| Measurements derived from hover/picking | `COMPATIBLE` | Measurement path rides on hover/picking ray parity. | `src/components/viewers/volume-viewer/useVolumeHover.ts` |
| Camera controls (orbit/move/reset) | `COMPATIBLE` | Resize/fit/reset now branch for perspective vs orthographic behavior. | `src/components/viewers/volume-viewer/useCameraControls.ts`, `src/components/viewers/volume-viewer/useVolumeResources.ts`, `src/components/viewers/volume-viewer/useVolumeViewerResets.ts` |
| Track camera presenter/follow | `COMPATIBLE` | Presenter camera typing updated to projection-safe union. | `src/components/viewers/volume-viewer/TrackCameraPresenter.tsx` |
| Segmentation overlay in volume view | `COMPATIBLE_WITH_CHANGES` | No dedicated orthographic-specific segmentation visuals were added; existing overlay path remains active and test-covered in current suite. | `src/components/viewers/volume-viewer/useVolumeResources.ts` |
| 2D planar views | `COMPATIBLE` | No orthographic-specific changes required. | planar viewer modules |
| UI overlays/tool windows | `COMPATIBLE` | Projection toggle added in viewer settings. | `src/components/viewers/viewer-shell/PlaybackControlsPanel.tsx` |
| Labels/tooltips | `COMPATIBLE` | Label rendering remains projection-agnostic with updated picking/hover flow. | `src/components/viewers/volume-viewer/TrackTooltip.tsx`, hover paths |
| Screenshot/recording | `COMPATIBLE` | Canvas capture path unchanged. | `src/components/viewers/viewer-shell/hooks/useViewerRecording.ts` |
| VR/XR | `INCOMPATIBLE` (by design) | VR entry is blocked in orthographic mode and forced to perspective flow. | `src/ui/app/hooks/useAppRouteState.tsx`, `src/components/viewers/VolumeViewer.tsx` |

## Signoff

Date: **2026-02-21**

Verification commands:

- `npm run -s typecheck`
- `npm run -s typecheck:tests`
- `npm run -s test`

All passed.
