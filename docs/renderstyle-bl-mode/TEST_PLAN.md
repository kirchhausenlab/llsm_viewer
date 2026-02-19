# Test Plan

This plan defines required verification for BL mode and per-layer render-style changes.

## Minimum required checks per implementation session

1. `npm run -s typecheck`
2. `npm run -s test -- tests/app/hooks`
3. `npm run -s test -- tests/viewer-shell`
4. `npm run -s test -- tests/useVolumeResources.test.ts`

If relevant files were changed, include:

1. `npm run -s test -- tests/perf`
2. `npm run -s verify:fast`

## Feature acceptance checks

### A. Per-layer style behavior

- Changing render style for layer A does not change layer B.
- Persisted layer settings preserve mode and BL controls when switching selected layers/channels.
- Channel reset keeps render style behavior consistent with locked decisions.

### B. Desktop UI behavior

- `ChannelsPanel` shows explicit `MIP`, `ISO`, `BL` buttons.
- Active style button reflects selected layer state.
- BL controls are visible only when selected layer style is BL.

### C. VR behavior

- VR render-style interaction cycles in order:
  - `MIP -> ISO -> BL -> MIP`
- VR mode indicator reflects current layer style.

### D. Rendering behavior

- MIP output remains visually consistent with pre-BL baseline.
- ISO output remains visually consistent with pre-BL baseline.
- BL responds to:
  - density scale
  - background cutoff
  - opacity scale
  - early-exit alpha

### E. Performance behavior

- MIP/ISO frame-time should not regress materially from BL code presence.
- If observed first-toggle compile hitch is unacceptable, enable and verify prewarm strategy.

## Test evidence recording format

For each session, log this in `EXECUTION_LOG.md`:

- Commands run
- Pass/fail
- If failed:
  - failing command
  - root cause
  - follow-up backlog item id

