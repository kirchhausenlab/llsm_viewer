# Architecture Boundaries

This document captures the active structural seams that should be preserved during future changes.

## App contracts

- Route and container contracts live in `src/ui/contracts/*`.
- App hooks should depend on these contracts, not on component files.
- Components remain free to consume the same contracts, but they should not define the contracts the app layer depends on.

## Loading policy

- `src/ui/app/hooks/useRouteLayerVolumes.ts` is the React adapter for viewer launch/timepoint loading.
- Pure loading policy now lives under `src/ui/app/volume-loading/*`.
- `policy.ts` holds scale/warmup/resource-selection helpers.
- `lodPolicyController.ts` owns the adaptive LOD state machine and diagnostics bookkeeping.
- `types.ts` holds the shared launch/warmup contracts used across route hooks.

## Viewer resource runtime

- `src/components/viewers/volume-viewer/useVolumeResources.ts` remains the orchestration hook for now.
- Layer render-source resolution and warmup promotion matching live in `src/components/viewers/volume-viewer/layerRenderSource.ts`.
- GPU brick-atlas residency budgeting and packing live in `src/components/viewers/volume-viewer/gpuBrickResidency.ts`.
- New resource/runtime extractions should follow the same pattern: move pure resource policy out of the hook before changing behavior.

## Preprocess pipeline

- `src/shared/utils/preprocessedDataset/preprocess.ts` remains the pipeline entrypoint.
- Preprocess execution/config/path policy now lives in `src/shared/utils/preprocessedDataset/preprocess/config.ts`.
- Chunk/shard queueing now lives in `src/shared/utils/preprocessedDataset/preprocess/chunkWriter.ts`.
- Chunk encoding and per-scale write helpers now live in `src/shared/utils/preprocessedDataset/preprocess/chunkEncoding.ts`.
- Additional preprocess splits should continue by stage boundary, not by arbitrary helper count.

## Guardrail

- `npm run check:architecture` enforces the current hook-to-component boundary.
- `src/hooks/**` must not import from `src/components/**`.
- `src/ui/app/hooks/**` must not import from `src/components/**`; shared contracts belong in `src/ui/contracts/**` or other neutral modules.
