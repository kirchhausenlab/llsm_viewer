# Implementation Spec

This spec defines the target architecture for the projection-aware residency refactor.

## 1) Current State And Definitive Findings

### 1.1 Orthographic currently forces direct-volume residency

Current implementation:

- `projectionMode === 'orthographic'` sets `forceVolumeResidency`
- residency mode selection receives `forceVolumeMode: true`
- atlas residency is disabled before any atlas-vs-volume decision can happen

Primary files:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`

### 1.2 This behavior was introduced intentionally

The orthographic feature commit (`686cfa8`) introduced:

- the force-volume residency rule
- tests that explicitly assert:
  - orthographic uses `getVolume(...)`
  - perspective uses `getBrickAtlas(...)`

Primary historical file:

- `tests/app/hooks/useRouteLayerVolumes.test.ts`

### 1.3 The docs do not justify force-volume residency as fundamental

The orthographic program docs describe orthographic GPU residency as a policy/prioritization problem:

- camera-position-centric priority may be insufficient
- orthographic residency behavior must be benchmarked
- projection-aware priority signals should be added if evidence demands it

They do **not** state:

- atlas residency is invalid in orthographic
- orthographic must remain direct-volume only

### 1.4 Current playback acceleration is mostly atlas-only

Today the fast playback path depends heavily on atlas-backed layers:

- buffered-start readiness checks only consider atlas-backed warmup eligibility
- the dedicated playback GPU cache consumes `PlaybackWarmupFrameState.layerBrickAtlases`
- direct-volume orthographic playback therefore misses most of the current acceleration stack

Primary files:

- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

### 1.5 Orthographic also disables a shader-side quality/perf optimization

Adaptive shader LOD is enabled only for:

- `samplingMode === 'linear'`
- `projectionMode === 'perspective'`

Primary file:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`

This is likely secondary compared with the residency-path issue, but it matters.

## 2) Root Cause

The root cause is **not**:

- orthographic rendering fundamentally cannot use atlases

The root cause is:

- residency selection and atlas prioritization are still perspective-biased
- orthographic was shipped with a conservative direct-volume fallback instead of a fully projection-aware residency model

## 3) Target Architecture

The target architecture is a unified, projection-aware residency pipeline with five layers:

1. **Projection-aware policy inputs**
2. **Residency decision**
3. **Preparation path**
4. **Playback cache / buffered-start**
5. **Promotion / active-frame binding**

### 3.1 Policy inputs

Policy must be able to consider at least:

- projection mode
- render style
- sampling mode
- playback state
- projected pixels per voxel
- current zoom / view slab characteristics
- renderer `MAX_3D_TEXTURE_SIZE`
- scale dimensions
- scale chunk shape
- occupied brick count
- estimated atlas bytes
- estimated direct-volume bytes
- cache pressure / memory pressure signals where available

### 3.2 Residency decision

The policy output should be explicit:

```ts
type ResidencyMode = 'atlas' | 'volume';

type ResidencyDecision = {
  mode: ResidencyMode;
  scaleLevel: number;
  rationale: string;
};
```

This decision should be made per `(layerKey, timeIndex, render context)` and must not depend on projection mode through a hard deny-list.

### 3.3 Preparation path

After policy selection:

- `atlas`
  - load page table
  - load atlas
  - prepare resident atlas / brick metadata
- `volume`
  - load volume
  - prepare direct volume texture

These are preparation outputs, not projection-specific viewer modes.

### 3.4 Playback cache / buffered-start

Playback caching must operate on prepared outputs, not on atlas-only frame shapes.

Target abstraction:

```ts
type PreparedPlaybackFrame =
  | {
      kind: 'atlas';
      layerKey: string;
      timeIndex: number;
      scaleLevel: number;
      pageTable: VolumeBrickPageTable;
      atlas: VolumeBrickAtlas;
      gpuReady: boolean;
    }
  | {
      kind: 'volume';
      layerKey: string;
      timeIndex: number;
      scaleLevel: number;
      volume: NormalizedVolume;
      gpuReady: boolean;
    };
```

The current atlas GPU cache can evolve toward this broader abstraction.

### 3.5 Promotion / active-frame binding

When playback advances:

- bind the prepared result for the chosen next frame
- do not rebuild from scratch if a prepared cache entry already exists

Promotion should be independent of whether the entry is atlas-backed or volume-backed.

## 4) Required Refactor Workstreams

## 4.1 Remove projection-forced residency mode

Current force-volume logic must be removed from:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`

Replacement:

- a residency decision helper that receives projection-aware inputs
- a policy result that may choose either `atlas` or `volume`

## 4.2 Extract residency decision into an explicit controller/helper

Introduce a dedicated policy module or helper boundary responsible for:

- scale selection
- atlas-vs-volume decision
- decision rationale / diagnostics

Do **not** leave this spread implicitly across:

- route load path
- warmup generation
- playback gating
- GPU cache setup

Recommended touchpoints:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`
- possibly a new `src/ui/app/volume-loading/residencyPolicy.ts`

## 4.3 Make atlas prioritization projection-aware

Current atlas residency prioritization is camera-position-centric.

Orthographic support likely requires additional or replacement signals such as:

- projected overlap with current view slab
- distance to current orbit target
- distance to visible centerline / view center
- distance in projected screen space rather than only world-space camera position

Primary touchpoints:

- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts`
- `src/hooks/useVolumeRenderSetup.ts`

## 4.4 Generalize playback cache from atlas-only to residency-mode-agnostic

Current playback cache should be extended so that it can hold either:

- prepared atlas frame entries
- prepared direct-volume frame entries

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/ui/app/hooks/useRouteLayerVolumes.ts`

## 4.5 Make buffered-start rely on generic frame readiness

Current buffered-start logic should no longer care whether the next frame is:

- atlas-backed
- volume-backed

It should care only whether required layer outputs for the next frame are:

- present
- GPU-ready

Primary touchpoints:

- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/volume-viewer/playbackWarmupGate.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`

## 4.6 Preserve perspective protections

The refactor must keep perspective-path protections:

- perspective shader/material path isolation
- perspective benchmark non-regression
- perspective playback no-regression

Primary touchpoints:

- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/shaders/volumeRenderShader.ts`
- `tests/volumeRenderShader*.test.ts`
- `docs/projection-aware-residency/BENCHMARK_MATRIX.md`

## 5) Migration Strategy

This program should be executed in the following order.

### Step 1: Document and preserve the current force-volume baseline

Before changing behavior:

- preserve tests that demonstrate current orthographic volume-only behavior
- add new tests that define the desired end state separately

Goal:

- distinguish “current baseline” from “target architecture”

### Step 2: Introduce explicit residency-decision seams

Add a dedicated residency-decision helper without changing semantics yet.

Goal:

- isolate the decision surface before changing what it decides

### Step 3: Remove projection hard-force from the policy layer

Change policy inputs so projection affects decision scoring, not residency eligibility.

Goal:

- orthographic atlas residency becomes possible

### Step 4: Tune orthographic atlas prioritization

Implement and validate projection-aware priority inputs for orthographic atlas residency.

Goal:

- atlas residency in orthographic is correct and stable, not just enabled

### Step 5: Generalize playback cache and gating

Refactor playback buffering so:

- atlas and volume entries share a common readiness model
- buffered-start works for both
- promotion/reuse works for both

Goal:

- playback acceleration follows residency policy outcomes automatically

### Step 6: Benchmark, tune, and remove transitional fallback assumptions

Goal:

- no remaining architecture-level dependency on `projectionMode === 'orthographic' => volume`

## 6) What The Final State Must Not Look Like

The program is **not complete** if the end state is any of the following:

- orthographic “usually still uses volumes” because atlas remains effectively disabled
- a second orthographic-only playback subsystem exists as a permanent architecture fork
- atlas is enabled in orthographic, but playback cache/buffered-start still only accelerate perspective
- projection mode is still deciding residency mode through a hidden fallback path

## 7) File Touchpoint Map

Highest-contention files:

- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/volume-loading/policy.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/gpuBrickResidency.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/shaders/volumeRenderShader.ts`
- `src/ui/app/volume-loading/lodPolicyController.ts`

Likely supporting files:

- `src/hooks/useVolumeRenderSetup.ts`
- `src/components/viewers/viewer-shell/ViewerSettingsWindow.tsx`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `tests/app/hooks/useRouteLayerVolumes.test.ts`
- `tests/useVolumeResources.test.ts`
- `tests/playbackWarmupGate.test.ts`

