# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Multiscale V2 Backlog (Current)

- `V2-001` (`DONE`): publish Multiscale V2 architecture + decision record.
  - Evidence:
    - `docs/refactor-nextgen-volume/MULTISCALE_V2_ARCHITECTURE.md`
    - `docs/refactor-nextgen-volume/DECISIONS.md`
- `V2-002` (`DONE`): enforce full-pyramid schema validation at load time.
  - Evidence:
    - `src/shared/utils/preprocessedDataset/schema.ts`
    - `tests/preprocessedSchemaValidation.test.ts`
- `V2-003` (`DONE`): unify scale selection under explicit quality profiles.
  - Evidence:
    - `src/ui/app/hooks/multiscaleQualityPolicy.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `src/ui/app/hooks/useAppRouteState.tsx`
- `V2-004` (`DONE`): surface scale-policy diagnostics in viewer overlay.
  - Evidence:
    - `src/components/viewers/VolumeViewer.tsx`
- `V2-005` (`DONE`): wire quality profile into runtime adaptive LOD uniforms.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/VolumeViewer.tsx`
    - `tests/useVolumeResources.test.ts`
- `V2-006` (`DONE`): implement demand-driven per-region scheduler with cancellation/hysteresis.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/VolumeViewer.tsx`
    - `tests/useVolumeResources.test.ts`
- `V2-007` (`DONE`): implement mixed-LOD composition and seam-safe sampling.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/shaders/volumeRenderShader.ts`
    - `tests/useVolumeResources.test.ts`
- `V2-008` (`DONE`): complete sliced-mode parity across XY/XZ/YZ under the new scheduler.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/shaders/volumeRenderShader.ts`
    - `tests/useVolumeResources.test.ts`
- `V2-009` (`DONE`): finalize playback QoS controller + forward-cone prefetch tuning.
  - Evidence:
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
- `V2-010` (`DONE`): remove legacy global-scale switching path (hard cutover).
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `tests/useVolumeResources.test.ts`

## Architecture Completion Backlog (Final)

- `NGR-090` (`DONE`): true GPU brick residency manager for 3D intensity rendering.
  - Implemented incremental GPU atlas paging with strict byte-budget enforcement and deterministic eviction.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/useVolumeResources.test.ts`
- `NGR-091` (`DONE`): view-driven brick streaming scheduler.
  - Implemented camera-priority brick scheduling and exposed scheduler metrics in runtime diagnostics overlay/resource metrics.
  - Evidence:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/VolumeViewer.tsx`
    - `tests/useVolumeResources.test.ts`
- `NGR-092` (`DONE`): multiscale runtime streaming beyond base scale.
  - Route/prefetch/provider now issue and consume requests across multiple scales (`zarr.scales[n]`).
  - Evidence:
    - `src/core/volumeProvider.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/hooks/useRoutePlaybackPrefetch.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`
    - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts`
    - `tests/preprocessedMultiscaleRuntime.test.ts`
- `NGR-093` (`DONE`): remove remaining full-volume 3D hot-path dependence.
  - 3D intensity atlas-residency path avoids `getVolume(...)` in normal operation; no hidden full-volume upload fallback in atlas-first mode.
  - Evidence:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`
    - `tests/useVolumeResources.test.ts`
- `NGR-094` (`DONE`): finalize multiscale labels/histogram contract.
  - Schema now requires segmentation labels for every scale; runtime and fixtures cover final behavior.
  - Evidence:
    - `src/shared/utils/preprocessedDataset/schema.ts`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`
    - `tests/preprocessedSchemaValidation.test.ts`
    - `tests/fixtures/preprocessed-schema/valid-segmentation-multiscale-labels.json`
    - `tests/fixtures/preprocessed-schema/invalid-segmentation-missing-label-scale1.json`
- `NGR-095` (`DONE`): remove mip truncation constraints.
  - Mip geometry policy is explicit and uncapped (full pyramid to terminal 1x1x1).
  - Evidence:
    - `src/shared/utils/preprocessedDataset/mipPolicy.ts`
    - `src/shared/utils/preprocessedDataset/preprocess.ts`
    - `tests/preprocessMipPolicy.test.ts`
- `NGR-096` (`DONE`): expand final-architecture performance gates.
  - Benchmark matrix/harness now enforces atlas/multiscale KPIs (`atlas_t0_scale0`, `atlas_t0_scale1`, `scale1RequestMin`) in addition to load/hit-rate gates.
  - Evidence:
    - `src/shared/utils/benchmarkMatrix.ts`
    - `scripts/benchmark-nextgen-volume.ts`
    - `docs/refactor-nextgen-volume/BENCHMARK_MATRIX.json`
    - `docs/refactor-nextgen-volume/BENCHMARK_MATRIX.md`
    - `tests/perf/benchmarkMatrixConfig.test.ts`
    - `tests/perf/nextgenVolumeRuntimeStress.test.ts`
- `NGR-097` (`DONE`): final closure cleanup and completion gate.
  - All refactor docs aligned to completion status with evidence-backed verification.
  - Evidence:
    - `docs/refactor-nextgen-volume/README.md`
    - `docs/refactor-nextgen-volume/ROADMAP.md`
    - `docs/refactor-nextgen-volume/SCHEMA_VNEXT.md`
    - `docs/refactor-nextgen-volume/SESSION_HANDOFF.md`
    - `docs/refactor-nextgen-volume/EXECUTION_LOG.md`

## Program status

- All scoped backlog items from Phases 0-6: `DONE`
- Phase 7 (true brick residency cutover): `DONE`
- Phase 8 (multiscale streaming and final closure): `DONE`
- Open blocked items: `None`

## Final verification gate

Executed on **2026-02-13**:

- `npm run -s typecheck` ✅
- `npm run -s typecheck:tests` ✅
- `npm run -s test` ✅
- `npm run -s benchmark:nextgen-volume` ✅
