# Decisions

## D-GSSR-001: Use WebGL2 Shader Sampling, Not CPU Flattening

Status: **Accepted**

Atlas-backed segmentation Slice mode must sample segmentation brick atlases directly in a fragment shader.

Rationale:

- avoids `width * height` CPU flattening
- avoids full RGBA slice texture upload on every update
- reuses the representation already required for 3D segmentation rendering
- preserves sparse segmentation constraints

## D-GSSR-002: Do Not Change Storage Or Editable State

Status: **Accepted**

This program is viewer-rendering only.

The following are out of scope:

- manifest schema changes
- preprocessing changes
- export format changes
- editable channel save format changes
- annotation history/state model changes

Rationale:

The bottleneck is render-path CPU work, not data model correctness.

## D-GSSR-003: Keep CPU Path As Temporary Fallback

Status: **Accepted**

Do not delete `prepareSliceTextureFromBrickAtlas(...)` in the first implementation.

The GPU path should be selected for atlas-backed segmentation when required WebGL2 capabilities and metadata are available. The CPU path remains as a fallback until tests and visual evidence prove complete replacement.

Rationale:

This lowers rollout risk and gives tests a reference path.

## D-GSSR-004: Regular And Editable Segmentation Must Share The Same GPU Slice Path

Status: **Accepted**

Editable segmentation should not get a special rendering implementation once its `VolumeBrickAtlas` exists.

Rationale:

Both regular and editable segmentation expose the same relevant render contract:

- `brickAtlas.kind === 'segmentation'`
- `brickAtlas.data`
- `brickAtlas.pageTable`
- `brickAtlas.textureFormat`
- `brickAtlas.slotGrid`

Different code paths would risk visual drift.

## D-GSSR-005: Preserve Current Color Semantics

Status: **Accepted**

GPU slice rendering must match existing segmentation colors and transparency.

The implementation must preserve:

- background label `0` behavior
- deterministic label color generation
- palette texture behavior if present
- additive/normal blending behavior
- channel visibility and offset behavior

## D-GSSR-006: Do Not Require WebGPU

Status: **Accepted**

The fix must use the current Three.js/WebGL2 stack.

Rationale:

The project already has WebGL2 atlas rendering infrastructure. Requiring WebGPU would make the fix much larger and unrelated to the specific bottleneck.

