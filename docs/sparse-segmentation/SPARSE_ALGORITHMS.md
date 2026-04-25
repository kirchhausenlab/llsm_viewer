# Sparse Algorithms

This document gives implementation-level algorithms for preprocessing, storage construction, querying, slicing, and WebGL2 traversal.

The snippets are pseudocode. They are not application code.

## Coordinate helpers

Inputs:

- dimensions are ordered as `[depth, height, width]`
- brick size is `[brickDepth, brickHeight, brickWidth]`
- voxel coordinates are `[z, y, x]`

Brick coordinate:

```text
brickZ = floor(z / brickDepth)
brickY = floor(y / brickHeight)
brickX = floor(x / brickWidth)
```

Local coordinate:

```text
localZ = z - brickZ * brickDepth
localY = y - brickY * brickHeight
localX = x - brickX * brickWidth
```

Local offset:

```text
localOffset = (localZ * brickHeight + localY) * brickWidth + localX
```

Global brick index:

```text
brickIndex = (brickZ * brickGridY + brickY) * brickGridX + brickX
```

## Strict label canonicalization

Segmentation labels are categorical IDs. Do not round.

Pseudocode:

```text
canonicalizeLabel(value, sourcePath, timepoint, z, y, x):
  if value is not finite:
    fail
  if value < 0:
    fail
  if floor(value) != value:
    fail
  if value > 4294967295:
    fail
  return uint32(value)
```

Label `0` is valid background and is not stored as foreground.

## Base-scale streaming preprocessing

Read input in z order for each timepoint.

Data structures:

```text
activeBrickSlabs: map<brickZ, map<brickKey, BrickAccumulator>>
labelStats: map<labelId, LabelAccumulator>
directoryRecords: list<BrickDirectoryRecord>
payloadShardWriter
```

Algorithm:

```text
for timepoint in timepoints:
  clear activeBrickSlabs

  for z in 0 .. depth - 1:
    sourceSlice = readInputSlice(timepoint, z)

    for y in 0 .. height - 1:
      for x in 0 .. width - 1:
        label = canonicalizeLabel(sourceSlice[y, x], ...)
        if label == 0:
          continue

        brickCoord = brickCoordFor(z, y, x)
        localOffset = localOffsetFor(z, y, x)
        accumulator = getOrCreateAccumulator(activeBrickSlabs, brickCoord)
        accumulator.append(localOffset, label)
        labelStats[label].add(timepoint, z, y, x)

    completedBrickZ = floor((z + 1) / brickDepth) - 1
    flush all active brick slabs with brickZ < completedBrickZ

  flush all remaining active brick slabs

write label metadata
write directory
write occupancy hierarchy
```

The flush-by-brickZ-slab rule keeps memory bounded without needing a full dense timepoint.

## Brick accumulator flush

Pseudocode:

```text
flushAccumulator(acc):
  sort pairs by localOffset
  reject duplicate offsets
  compute local bounds
  compute nonzero count
  compute label min and max

  encodedCandidates = [
    encodeCoordList(acc),
    encodeXRuns(acc),
    encodeBitmaskLabels(acc),
    encodeDenseLocal(acc)
  ]

  chosen = smallestByteLength(encodedCandidates)
  if tie:
    choose by codec order: coord-list, x-run, bitmask-labels, dense-local

  payloadLocation = shardWriter.write(chosen.bytes)
  directoryRecords.append(recordFor(acc, chosen, payloadLocation))
```

Codec encoder functions must return validation metadata before bytes are accepted.

## X-run generation

Input pairs are sorted by local offset.

Pseudocode:

```text
currentRun = null
for each voxel in sorted voxels:
  z, y, x = localCoordFromOffset(voxel.offset)

  if currentRun exists
     and currentRun.z == z
     and currentRun.y == y
     and currentRun.label == voxel.label
     and currentRun.xStart + currentRun.length == x:
       currentRun.length += 1
  else:
       emit currentRun if present
       currentRun = new run at z, y, x, label
emit currentRun if present
```

## Bitmask generation

Pseudocode:

```text
bitmask = zero bytes ceil(brickCapacity / 8)
labels = []
for voxel in sorted voxels:
  byteIndex = floor(voxel.offset / 8)
  bitIndex = voxel.offset % 8
  bitmask[byteIndex] |= 1 << bitIndex
  labels.append(voxel.label)
```

## Dense local generation

Pseudocode:

```text
labels = uint32 array of brickCapacity initialized to zero
for voxel in sorted voxels:
  labels[voxel.offset] = voxel.label
zero invalid edge-brick padding
```

## Sparse categorical downsampling

Downsampling from scale `N` to scale `N + 1` must include implicit zero labels.

For each nonzero source voxel:

```text
targetZ = floor(sourceZ / 2)
targetY = floor(sourceY / 2)
targetX = floor(sourceX / 2)
targetKey = [targetZ, targetY, targetX]
votes[targetKey][sourceLabel] += 1
votes[targetKey].nonzeroVoteTotal += 1
```

After all nonzero source voxels are visited, decide each target voxel that received at least one nonzero vote:

```text
validSourceCount = count valid source voxels covered by this target voxel
zeroVotes = validSourceCount - nonzeroVoteTotal

winnerLabel = 0
winnerCount = zeroVotes

for each nonzero label vote:
  if count > winnerCount:
    winnerLabel = label
    winnerCount = count
  else if count == winnerCount:
    winnerLabel = breakTie(winnerLabel, label)

if winnerLabel != 0:
  emit target voxel with winnerLabel
```

Tie rule:

```text
breakTie(a, b):
  if a == 0 and b != 0:
    return b
  if b == 0 and a != 0:
    return a
  return min(a, b)
```

This rule matches `DECISIONS.md`: highest count, then nonzero over zero, then smaller label.

Important edge rule:

- `validSourceCount` is the number of in-bounds source voxels covered by the target voxel.
- It is less than 8 at odd volume edges.

## Occupancy hierarchy construction

Level 0 is the brick grid.

```text
level0[node] = directory contains occupied brick at node ? 1 : 0
```

Parent construction:

```text
while current grid is not [1, 1, 1]:
  parentGrid = ceil(currentGrid / 2)
  parent = zeros(parentGrid)

  for child node in current:
    if child occupied:
      parentCoord = floor(childCoord / 2)
      parent[parentCoord] = 1

  append parent
  current = parent
```

The top level must be exactly `[1, 1, 1]`.

## Exact CPU label query

Pseudocode:

```text
queryLabel(field, timepoint, scaleLevel, z, y, x):
  if coordinate outside volume:
    return 0

  brickCoord = brickCoordFor(z, y, x)
  record = directory.lookup(timepoint, scaleLevel, brickCoord)
  if no record:
    return 0

  brick = decodedBrickCache.getOrLoad(record)
  localOffset = localOffsetFor(z, y, x)
  return brick.labelAtOffset(localOffset)
```

If the brick record exists but payload is unavailable or corrupt, throw. Do not return `0`.

## Axis-aligned slice extraction

Inputs:

- axis: `x`, `y`, or `z`
- slice index in voxel coordinates
- scale/timepoint

Pseudocode:

```text
extractSlice(field, axis, sliceIndex):
  output = transparent RGBA buffer for slice dimensions
  candidateRecords = directory.recordsIntersectingSlice(axis, sliceIndex)

  for record in candidateRecords:
    brick = decodedBrickCache.getOrLoad(record)
    for each nonzero voxel in brick:
      globalCoord = brickCoordToGlobal(record.coord, voxel.localCoord)
      if globalCoord[axis] != sliceIndex:
        continue
      outputCoord = projectToSlice(globalCoord, axis)
      output[outputCoord] = colorHash(voxel.label, colorSeed)

  return output
```

The simple implementation can scan all directory records to find candidates. If benchmarks require it, add optional slab indexes later.

## Required brick set

For the first complete implementation:

3D mode:

```text
requiredBricks = all occupied bricks at current timepoint and scale
```

Slice mode:

```text
requiredBricks = occupied bricks intersecting selected slice
```

This is deliberately conservative. It avoids rendering false empty space while the sparse renderer is being established.

## WebGL2 global brick DDA

Inputs:

- ray origin and direction in normalized volume coordinates
- volume dimensions
- brick size
- brick grid shape

Convert normalized entry point to voxel coordinates:

```text
voxel = entryNormalized * volumeSize
brick = floor(voxel / brickSize)
```

DDA setup per axis:

```text
if rayDirVoxel[axis] > 0:
  step[axis] = 1
  nextBoundaryVoxel = (brick[axis] + 1) * brickSize[axis]
  tMax[axis] = distance to nextBoundaryVoxel along ray
  tDelta[axis] = brickSize[axis] / rayDirVoxel[axis]
else if rayDirVoxel[axis] < 0:
  step[axis] = -1
  nextBoundaryVoxel = brick[axis] * brickSize[axis]
  tMax[axis] = distance to nextBoundaryVoxel along ray
  tDelta[axis] = abs(brickSize[axis] / rayDirVoxel[axis])
else:
  step[axis] = 0
  tMax[axis] = infinity
  tDelta[axis] = infinity
```

Traversal:

```text
while brick is inside grid and rayT <= rayExitT:
  pageEntry = lookupPageTable(brick)

  if pageEntry.empty:
    advance to next brick boundary
    continue

  if pageEntry.occupiedMissing:
    mark incomplete and stop or discard

  if pageEntry.resident:
    hit = traverseResidentBrick(pageEntry.slot, ray segment inside brick)
    if hit:
      return hit

  advance to next brick boundary
```

Advance:

```text
axis = argmin(tMax.x, tMax.y, tMax.z)
rayT = tMax[axis] + epsilon
brick[axis] += step[axis]
tMax[axis] += tDelta[axis]
```

Epsilon must be positive and small relative to voxel size. It prevents boundary re-hits.

## Resident brick traversal

Start with local coordinates inside the brick.

Recommended first implementation:

1. DDA through 4 x 4 x 4 local sub-bricks.
2. Skip local sub-bricks whose occupancy byte is zero.
3. Inside an occupied sub-brick, step voxel-by-voxel with nearest label samples.
4. The first nonzero label is the hit.

This is simpler and more exact than trying to analytically intersect sparse runs in shader.

## Surface normal for sparse segmentation

Compute normal from occupancy samples around the hit voxel:

```text
nx = occupied(x - 1, y, z) - occupied(x + 1, y, z)
ny = occupied(x, y - 1, z) - occupied(x, y + 1, z)
nz = occupied(x, y, z - 1) - occupied(x, y, z + 1)
normal = normalize([nx, ny, nz])
```

If the normal length is zero, fall back to `-viewRay`.

## Hover from 3D hit

The 3D shader resolves label bytes at the hit. CPU hover display can use the CPU query for the hovered voxel coordinate. The two must agree for deterministic fixtures.

Test requirement:

- render-hit label and CPU query label match on controlled sparse fixtures.

