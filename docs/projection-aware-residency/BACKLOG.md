# Backlog

Status legend: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`

## Phase 0 - Baseline and guardrails

- `RES-000` (`DONE`): create the projection-aware residency documentation packet.
  - Evidence:
    - `docs/projection-aware-residency/README.md`
    - `docs/projection-aware-residency/IMPLEMENTATION_SPEC.md`
    - `docs/projection-aware-residency/ROADMAP.md`

- `RES-001` (`DONE`): capture the current orthographic force-volume behavior as an explicit baseline in regression docs and tests.
  - Evidence target:
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`
    - `docs/projection-aware-residency/EXECUTION_LOG.md`

- `RES-002` (`DONE`): define the target end-state assertions for orthographic atlas eligibility and playback readiness.
  - Evidence target:
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`
    - `tests/useVolumeResources.test.ts`
    - `tests/playbackWarmupGate.test.ts`

## Phase 1 - Residency decision extraction

- `RES-010` (`DONE`): introduce an explicit residency-decision helper/module without changing existing semantics.
  - Files:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/volume-loading/policy.ts`
    - optional new `src/ui/app/volume-loading/residencyPolicy.ts`

- `RES-011` (`DONE`): make the decision helper return an explicit structured result (`mode`, `scaleLevel`, `rationale`).
  - Files:
    - same as above
    - diagnostics surfaces if needed

- `RES-012` (`DONE`): thread decision rationale into diagnostics for debugging and benchmark evidence.
  - Files:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/components/viewers/VolumeViewer.tsx`

## Phase 2 - Remove projection-forced residency mode

- `RES-020` (`DONE`): remove the projection-based `forceVolumeResidency` hard switch from route residency selection.
  - Files:
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`
    - `src/ui/app/volume-loading/policy.ts`

- `RES-021` (`DONE`): replace `forceVolumeMode` in `buildLayerResidencyModeMap(...)` with policy-driven atlas/volume eligibility logic.
  - Files:
    - `src/ui/app/volume-loading/policy.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`

- `RES-022` (`DONE`): verify orthographic layers can take the atlas path when policy chooses it.
  - Evidence target:
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`
    - `tests/useVolumeResources.test.ts`

## Phase 3 - Projection-aware atlas prioritization

- `RES-030` (`DONE`): audit the current camera-position-centric brick prioritization against orthographic close-up scenarios.
  - Files:
    - `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
    - `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`

- `RES-031` (`DONE`): introduce projection-aware orthographic priority inputs for atlas brick selection.
  - Candidate signals:
    - distance to orbit target
    - distance to view slab / projected overlap
    - visible centerline proximity

- `RES-032` (`DONE`): validate orthographic atlas prioritization against dense and sparse close-up benchmark scenarios.
  - Evidence target:
    - `docs/projection-aware-residency/BENCHMARK_MATRIX.md`
    - `docs/projection-aware-residency/EXECUTION_LOG.md`

## Phase 4 - Playback architecture unification

- `RES-040` (`DONE`): generalize playback cache entries so they can represent prepared atlas or prepared direct-volume results.
  - Files:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/components/viewers/VolumeViewer.types.ts`

- `RES-041` (`DONE`): refactor playback readiness checks to operate on generic prepared-frame readiness rather than atlas-only warmup status.
  - Files:
    - `src/components/viewers/VolumeViewer.tsx`
    - `src/components/viewers/volume-viewer/playbackWarmupGate.ts`

- `RES-042` (`DONE`): make promotion/reuse independent of atlas-specific warmup resources.
  - Files:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/ui/app/hooks/useRouteLayerVolumes.ts`

- `RES-043` (`DONE`): ensure buffered-start works for whichever residency mode the policy selects.
  - Evidence target:
    - `tests/app/hooks/useViewerModePlayback.test.ts`
    - `tests/playbackWarmupGate.test.ts`
    - `tests/useVolumeResources.test.ts`

## Phase 5 - Benchmarking and hardening

- `RES-050` (`TODO`): benchmark perspective non-regression against the current baseline.
  - Evidence target:
    - `docs/projection-aware-residency/BENCHMARK_MATRIX.md`
    - `docs/projection-aware-residency/EXECUTION_LOG.md`

- `RES-051` (`TODO`): benchmark orthographic playback and close-up scenarios against the current force-volume baseline.
  - Evidence target:
    - same as above

- `RES-052` (`DONE`): decide whether adaptive shader LOD should remain perspective-only or gain an orthographic-aware equivalent after residency is fixed.
  - Files:
    - `src/components/viewers/volume-viewer/useVolumeResources.ts`
    - `src/shaders/volumeRenderShader.ts`
  - Decision:
    - keep adaptive shader LOD perspective-only for now; the residency split was the primary architectural problem addressed in this refactor.

- `RES-053` (`DONE`): remove or quarantine transitional compatibility behavior that keeps the old projection split alive.
  - Files:
    - all high-contention files

## Phase 6 - Closure

- `RES-060` (`DONE`): synchronize docs to the implemented end state and closure evidence.
  - Evidence target:
    - all files in `docs/projection-aware-residency/`

## High-contention files

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/shaders/volumeRenderShader.ts`
- `src/ui/app/volume-loading/lodPolicyController.ts`
