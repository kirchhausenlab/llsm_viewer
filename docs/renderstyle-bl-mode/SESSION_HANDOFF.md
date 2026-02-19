# Session Handoff

Last updated: **2026-02-18**

## Program state

- Status: **Implementation complete for BLR-001 through BLR-012**
- Backlog status:
  - `DONE`: `BLR-001` through `BLR-012`
  - `IN_PROGRESS`: none
  - `TODO`: none
  - `BLOCKED`: none

## Locked scope reminders

1. Render style is per-layer.
2. Desktop uses explicit `MIP`/`ISO`/`BL` buttons.
3. BL controls are exposed immediately.
4. Use per-mode shader variants.

## What shipped this session

- Per-layer render style (`0|1|2`) is propagated through state, loaders, desktop UI, VR HUD/state, and volume renderer contracts.
- Desktop `ChannelsPanel` now has explicit per-layer `MIP`, `ISO`, `BL` controls and BL sliders (visible only in BL mode).
- Global desktop render-style toggle was removed from `PlaybackControlsPanel` viewer settings.
- VR render-style action now cycles `MIP -> ISO -> BL -> MIP` and displays current mode label.
- Shader system now uses per-mode compiled variants and BL mode includes Beer-Lambert accumulation with four exposed uniforms.
- Tests were added/updated for layer controls, channel UI visibility, and shader/resource variant + BL uniform behavior.

## Verification summary

- `npm run -s typecheck` passed.
- Folder-scoped checks now pass directly:
  - `npm run -s test -- tests/app/hooks`
  - `npm run -s test -- tests/viewer-shell`
  - `npm run -s test -- tests/useVolumeResources.test.ts`
- `npm run -s test:perf` passed.
- `npm run -s verify:fast` passed.

## Recommended next actions

1. No blocking follow-up required for this feature track.
