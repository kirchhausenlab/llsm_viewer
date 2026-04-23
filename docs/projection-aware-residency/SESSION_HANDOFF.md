# Session Handoff

Last updated: **2026-04-22**

## Program state

- Status: **Implemented, benchmark follow-up pending**
- Backlog status:
  - `DONE`: `RES-000`, `RES-001`, `RES-002`, `RES-010` through `RES-043`, `RES-052`, `RES-053`, `RES-060`
  - `IN_PROGRESS`: none
  - `TODO`: `RES-050`, `RES-051`
  - `BLOCKED`: none

## Definitive findings to preserve

1. Orthographic volume-only residency was introduced intentionally in `686cfa8`.
2. That behavior is enforced by tests.
3. The docs do **not** justify it as fundamental.
4. The docs instead frame orthographic atlas residency as a policy/prioritization problem that should be solved if evidence requires it.
5. Therefore the proper target is unified projection-aware residency, not an orthographic-only workaround stack.

## Immediate next recommendation

Capture benchmark evidence:

1. run the perspective baseline scenarios from `BENCHMARK_MATRIX.md`
2. run the orthographic close-up / playback scenarios from `BENCHMARK_MATRIX.md`
3. resolve why `npm run -s test:e2e` smoke did not complete locally after starting Chromium

## High-contention files

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/shaders/volumeRenderShader.ts`

## Minimum verification checklist per implementation session

1. `npm run -s typecheck`
2. `npm run -s typecheck:tests`
3. directly relevant targeted tests from `TEST_PLAN.md`

## Handoff template

Copy this block into the next update:

```md
### Projection-Aware Residency Handoff
- Date:
- Backlog IDs worked:
- Current phase:
- Commands run:
- Perspective regression summary:
- Orthographic improvement summary:
- Open risks:
- Recommended next ID:
```
