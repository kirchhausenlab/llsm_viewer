# Traversal Algorithm

This document defines the exact traversal/reduction behavior expected by the program.

## 1) Coordinate conventions (must stay consistent)

- Hierarchy grid indexing is `(z, y, x)` in CPU arrays and manifest descriptors.
- Shader uniforms use `vec3(x, y, z)` for texture coordinates.
- Conversion must be explicit at each boundary; do not rely on implicit axis assumptions.

## 2) Hierarchy reduction pseudocode (preprocess)

```text
Input (level 0):
  occ0[z,y,x] in {0,255}
  min0[z,y,x] in [0,255]
  max0[z,y,x] in [0,255]

For each parent level L+1 from child level L:
  parentShape = ceil(childShape / 2)
  for each parent node p:
    collect valid child nodes c in 2x2x2 neighborhood
    occ = max(c.occ)
    if occ == 0:
      parentOcc = 0
      parentMin = 0
      parentMax = 0
    else:
      parentOcc = 255
      parentMin = min(c.min where c.occ > 0)
      parentMax = max(c.max where c.occ > 0)
      assert(parentMin <= parentMax)
```

## 3) Packed hierarchy texture layout (runtime)

Recommended packing:

- one `Data3DTexture` for hierarchy stats
- channels:
  - `R`: occupancy (`0` or `255`)
  - `G`: min
  - `B`: max
  - `A`: reserved (`255`)

Level packing metadata:

- `levelCount`
- `levelGrid[level]` as `(x,y,z)`
- `levelZBase[level]` in the packed texture

Lookup contract:

1. convert level node coords to packed texture voxel coords
2. sample texel exactly (nearest)
3. decode occupancy/min/max in shader

## 4) Shared skip predicate

Given current mode state and node stats:

```text
if occupancy <= 0 -> SKIP
candidateBound = invert ? normalize(min) and invert : normalize(max) and invert

MIP: skip if candidateBound <= currentMipMax + eps
ISO: skip if candidateBound <= isoLowThreshold + eps
BL:  skip if candidateBound <= blBackgroundCutoff + eps
```

Notes:

- Skip predicate must not read atlas residency index.
- Candidate bound normalization must match current window/invert behavior exactly.

## 5) Ray traversal pseudocode

```text
Initialize ray entry/exit.
rayT = rayEntry
while rayT < rayExit and iter < MAX_STEPS:
  loc = rayOrigin + rayDir * rayT

  // Hierarchy phase
  skippableNodeFound = false
  for level from coarsest to finest:
    node = nodeContaining(loc, level)
    stats = fetchNodeStats(level, node)
    if isSkippable(stats, modeState):
      nodeBounds = nodeAabbInVoxelSpace(level, node)
      nodeExitT = rayExitTForAabb(rayOrigin, rayDir, nodeBounds)
      rayT = max(nodeExitT + eps, rayT + minAdvance)
      skippableNodeFound = true
      break

  if skippableNodeFound:
    continue

  // Sample phase (leaf not skippable)
  sampleAt(loc)
  updateModeState()
  rayT += baseSampleStep
```

Required safeguards:

- `minAdvance` must be positive and scale-aware.
- `nodeExitT` math must handle axis-parallel rays robustly.
- If computed advance is non-finite, fail current fragment safely (do not loop forever).

## 6) Mode-specific loop integration notes

### MIP

- Keep tracking best value and best location.
- Refinement window must use best ray distance/location, not fixed loop index.

### ISO

- Threshold crossing detection remains at sampled steps.
- Refinement starts around crossing location from current ray distance.

### BL

- Accumulation logic remains front-to-back.
- Axis/crosshair event gating must use ray-distance fraction, not iteration index.

## 7) Numeric constants (initial values to tune)

- `SKIP_EPSILON_VOXELS = 1e-3`
- `SKIP_MIN_ADVANCE_VOXELS = 0.25`
- `BOUND_COMPARE_EPSILON = 1e-5`

These are starting points and must be calibrated against the benchmark matrix.

## 8) Must-pass edge cases

1. Ray aligned with major axes (`dx=0` or `dy=0` or `dz=0`).
2. Ray grazing exact node boundaries.
3. Invert on/off transitions.
4. Very sparse volume with tiny bright structures.
5. Dense volume with almost no empty nodes.
6. BL mode with active hover/crosshair overlays.

