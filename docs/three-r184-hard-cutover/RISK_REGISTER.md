# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`, `ACCEPTED`

## R-T184-001: Texture identity mutation breaks GPU uploads

- Status: `MITIGATED`
- Trigger:
  - code mutates dimensions, format, type, or internal format on an already-uploaded texture
- Impact:
  - stale GPU state, WebGL errors, blank volumes, incorrect slices, or wrong labels
- Mitigation:
  - recreate textures on identity changes
  - add tests for rebuild conditions
  - run browser texture-warning checks

## R-T184-002: `LineMaterial` shader patch anchor changes

- Status: `MITIGATED`
- Trigger:
  - r184 addon shader source differs from r161 at string replacement anchors
- Impact:
  - track time-window clipping, ROI attenuation, or ROI prepass behavior silently disappears
- Mitigation:
  - audit r184 `LineMaterial` shader source
  - add tests proving injected uniforms/code are present
  - verify tracks and ROI in browser

## R-T184-003: Removed constants or APIs surface only in tests

- Status: `CLOSED`
- Trigger:
  - source compiles but tests still reference removed APIs like `LuminanceFormat`
- Impact:
  - incomplete cutover or hidden compatibility assumptions
- Mitigation:
  - scan source and tests for removed APIs
  - update tests to r184-supported APIs without weakening assertions

## R-T184-004: Color-space behavior changes visual output

- Status: `MITIGATED`
- Trigger:
  - r184 color management or texture color-space behavior differs from r161
- Impact:
  - brightness/color changes in volume, colormap, HUD, screenshots, or props
- Mitigation:
  - keep existing color-space assignments unless proven wrong
  - compare visual/e2e output
  - verify screenshots

## R-T184-005: Mipmap generation changes memory or visual behavior

- Status: `MITIGATED`
- Trigger:
  - r184 generates mipmaps whenever `generateMipmaps` is true
- Impact:
  - extra memory, slower uploads, or changed sampling behavior
- Mitigation:
  - make mipmap intent explicit for every texture class
  - keep metadata textures mipmap-free
  - performance-test large volumes

## R-T184-006: WebXR behavior changes under r184

- Status: `OPEN`
- Trigger:
  - r184 WebXR manager behavior differs from r161
- Impact:
  - broken session start/end, controller models, rays, HUD interactions, or camera restoration
- Mitigation:
  - audit WebXR code paths
  - test with real headset
  - preserve behavior without fallback or omission

## R-T184-007: Addon import path change breaks bundling

- Status: `CLOSED`
- Trigger:
  - TypeScript or Vite does not resolve selected addon import specifiers
- Impact:
  - build failure or duplicate bundled modules
- Mitigation:
  - standardize imports once
  - run typecheck and build
  - inspect output chunking if needed

## R-T184-008: Shader compiles differ by browser/GPU

- Status: `MITIGATED`
- Trigger:
  - shader code accepted before r184 now fails or warns in browser
- Impact:
  - blank rendering, missing overlays, or device-specific failure
- Mitigation:
  - run shader smoke tests in Chromium
  - inspect browser console
  - keep custom shader source compatible with the r184 renderer

## R-T184-009: No-fallback rule is accidentally violated

- Status: `CLOSED`
- Trigger:
  - implementation bypasses a failing path by disabling a feature or adding old/new branches
- Impact:
  - apparent success with hidden functionality loss
- Mitigation:
  - use `CUTOVER_CHECKLIST.md`
  - run no-fallback scans
  - reject any solution that degrades behavior

## R-T184-010: Automated tests miss manual UI or VR regressions

- Status: `OPEN`
- Trigger:
  - test suite passes but untested interactions fail
- Impact:
  - shipped behavioral regression
- Mitigation:
  - complete manual feature matrix
  - record manual VR verification
  - add targeted tests for regressions found manually

## R-T184-011: Performance regression from r184 internals

- Status: `MITIGATED`
- Trigger:
  - renderer, texture, line, or mipmap behavior changes frame time or upload cost
- Impact:
  - worse playback, camera movement, or VR responsiveness
- Mitigation:
  - run perf tests and benchmarks
  - inspect texture/mipmap memory behavior
  - optimize without falling back to disabled features

## R-T184-012: Screenshot output changes

- Status: `MITIGATED`
- Trigger:
  - render target, color-space, alpha, or readback behavior differs
- Impact:
  - screenshots are flipped, too dark/bright, transparent incorrectly, or blank
- Mitigation:
  - run screenshot e2e/manual checks
  - verify readback orientation and color

## Final Risk Notes - 2026-04-24

- Texture identity, removed APIs, addon imports, shader compilation, color space, mipmap, no-fallback, screenshot, and performance risks are mitigated or closed by the final command and scan evidence recorded in `BACKLOG.md` and `EXECUTION_LOG.md`.
- `R-T184-006` remains `OPEN` only for real WebXR headset verification. Source imports, VR runtime helpers, VR bridge tests, controller/input math tests, hotspot coverage, typechecks, and build all passed.
- `R-T184-010` remains `OPEN` only for the missing physical VR pass. Desktop feature parity is covered by `verify:ui`, targeted e2e perf, and `verify:fast`.
