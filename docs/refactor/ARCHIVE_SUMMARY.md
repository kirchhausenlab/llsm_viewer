# Refactor Program Archive Summary

Status: **Completed**  
Completion date: **2026-02-12**

This file is the consolidated archive for the completed refactor program that originally tracked work across `BACKLOG.md`, `BASELINE.md`, `ROADMAP.md`, and `SESSION_HANDOFF.md`.

## Program outcome

All planned backlog items were completed:

- `RF-001` done: removed dead/stale surfaces (`controllerRays.ts`, `volumeWindow.ts`, test-only `useDatasetLaunch` path).
- `RF-002` done: decomposed route orchestration (`useAppRouteState`) into focused helpers (`useRouteDatasetSetupState`, `useRouteDatasetResetState`, `useRouteLaunchSessionState`, `useRoutePlaybackPrefetch`, `useRouteViewerProps`).
- `RF-003` done: reduced viewer shell contract complexity and split shell-prop mapping into feature-oriented mappers.
- `RF-004` done: split `VolumeViewer` runtime boundaries (pointer lifecycle + render loop modules).
- `RF-005` done: split VR responsibilities by domain (`useVrHudInteractions`, `controllerRayVolumeDomain`, related orchestration cleanups).
- `RF-006` done: decomposed planar interactions into hover/input/hit-test/keyboard modules.
- `RF-007` done: clarified dataset setup/load surfaces (`useChannelDatasetLoader`, `useChannelSources`, `useChannelLayerState` wiring).
- `RF-008` done: modularized large viewer CSS ownership boundaries.
- `RF-009` done: added targeted tests for VR and orchestration refactor hotspots.
- `RF-010` done: added maintained optional strict-unused gate (`npm run typecheck:strict-unused`) with scoped config in `tsconfig.strict-unused.json`.

## Verification and quality gates

- Required slice gate throughout program: `npm run verify:fast`.
- UI-affecting slice verification used where applicable: `npm run verify:ui`.
- Final hardening additions:
  - targeted hotspot tests added under `tests/*` for VR/orchestration boundaries.
  - optional strict-unused type gate added:
    - command: `npm run typecheck:strict-unused`
    - config: `tsconfig.strict-unused.json`

## Lasting structural outcomes

- Route wiring is now split into focused hooks instead of one monolithic orchestration block.
- Viewer shell prop assembly and mapping are split by feature ownership.
- `VolumeViewer` runtime lifecycle responsibilities are separated into dedicated modules.
- VR internals now have clearer domain boundaries for HUD interactions and volume-handle ray behavior.
- Planar interactions are split into dedicated interaction modules.
- Dataset setup/load flow has clearer separation between source state and load/apply runtime behavior.
- Large viewer CSS ownership is split into feature-oriented files.

## Optional follow-up (post-program)

- Expand `tsconfig.strict-unused.json` scope incrementally as additional legacy surfaces are cleaned up.
- Continue adding seam-focused tests when future refactors introduce new orchestration boundaries.
