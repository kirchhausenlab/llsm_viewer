# VR Input Regression Checklist

VR controller input has two separate phases:

1. Controller ray frames compute hover state and continue an already-active drag.
2. Native WebXR `selectstart` and `selectend` events start and end selection.

Do not start or end selection from the ray frame loop, gamepad polling, trigger values, or hover state. This prevents session-entry frames or noisy controller button state from accidentally grabbing world-fixed HUDs or the volume.

## Automated Guards

Before merging VR input changes, run:

```bash
npm run typecheck
npm run typecheck:tests
npm run typecheck:strict-unused
node --import tsx --test tests/controllerRayHudCandidates.test.ts tests/controllerRayUpdater.test.ts tests/controllerSelectHandlers.test.ts tests/controllerRayVolumeDomain.test.ts
npm run build
```

The focused tests must cover these invariants:

- `createControllerRayUpdater()` does not call `onSelectStart` or `onSelectEnd`, even when a controller exposes a pressed `gamepad.buttons[0]`.
- A presenting-frame ray update with no native select event does not move HUD placement, volume position, volume scale, volume yaw, or volume pitch.
- One controller missing a channels/tracks HUD target does not clear another controller's active HUD hover region.
- The wrist HUD calibration maps the measured left-wrist watch pose to book axes. In
  `tests/wristMenuPlacement.test.ts`, the measured grip pose must keep HUD `+Z`
  facing the viewer, HUD `+Y` vertical, and HUD `+X` horizontal. Do not replace
  the calibrated quaternion in `wristMenuPlacement.ts` with a guessed Euler or
  controller-axis mapping.

## Quest Smoke Pass

Use this pass for any change touching `src/components/viewers/volume-viewer/vr/**` or VR wiring:

- Enter VR on Meta Quest Browser and do not press anything.
- Move and rotate your head. HUDs and volume remain world-fixed.
- Both controller models and rays appear.
- Left controller hover highlights playback, channels, and tracks HUD widgets.
- Left controller click activates HUD widgets.
- Right controller hover and click still work.
- Hold the left controller in the watch pose and open the wrist HUD. The wrist
  HUD should read like a vertical book page. Its in-HUD debug row should show
  `hud front +Z` near `f -1`, `hud up +Y` near `u +1`, and `hud right +X`
  near `r +1`.
- HUD and volume dragging only start after intentionally selecting a drag or volume handle.
- Releasing selection stops dragging immediately.
- Exit VR and verify desktop camera/control state is restored.
