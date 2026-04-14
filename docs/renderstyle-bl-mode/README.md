# Per-Layer Render Style Program (MIP / ISO / BL)

Status: **Complete**
Start date: **2026-02-18**

This folder records the implemented Beer-Lambert (`BL`) feature and the current render-style contract.

## Implemented behavior

- Render style is selected per layer (`MIP`, `ISO`, `BL`).
- Desktop UI exposes explicit per-layer `MIP`/`ISO`/`BL` buttons.
- VR render-style interaction cycles `MIP -> ISO -> BL -> MIP`.
- BL tuning controls are shared global values exposed in the selected-layer UI when that layer is in `BL`.
- Renderer uses per-mode shader/material variants so MIP/ISO do not carry dormant BL branch cost.

## Out of scope

- Physically based lighting.
- Deep compositing with arbitrary transparent meshes.

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `TEST_PLAN.md`
4. `SESSION_HANDOFF.md`
5. `EXECUTION_LOG.md`
