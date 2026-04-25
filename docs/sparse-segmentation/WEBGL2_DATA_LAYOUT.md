# WebGL2 Data Layout

This document defines the exact WebGL2 texture packing and shader data contract for sparse segmentation.

The storage format remains backend-neutral. Everything in this file is a derived runtime representation for the current WebGL2 renderer.

## Texture conventions

All segmentation WebGL2 textures use:

- nearest filtering
- no mipmaps
- no color-space conversion
- unpack alignment `1`
- byte-exact data generated on CPU

Use `THREE.NoColorSpace` for all sparse segmentation textures.

## Label byte order

Logical labels are `uint32`.

Pack labels into RGBA bytes in little-endian order:

```text
r = label & 255
g = (label >> 8) & 255
b = (label >> 16) & 255
a = (label >> 24) & 255
```

GLSL decoding must reconstruct or compare labels byte-wise. Do not depend on exact single-float representation for arbitrary `uint32` values.

## Page table texture

The page table maps global brick coordinate to residency state.

Texture:

- type: `DataTexture`
- format: `RGBAFormat`
- data type: `UnsignedByteType`
- dimensionality: 2D

Logical node index:

```text
brickIndex = (brickZ * brickGridY + brickY) * brickGridX + brickX
```

Texture dimensions:

```text
pageTableWidth = min(maxTextureSize, 4096)
pageTableHeight = ceil(brickCount / pageTableWidth)
```

If `pageTableHeight > maxTextureSize`, the renderer must fail with a WebGL2 resource-limit error instead of falling back to dense segmentation.

Texel coordinate:

```text
u = brickIndex % pageTableWidth
v = floor(brickIndex / pageTableWidth)
```

### Page table values

Values are four raw bytes.

| Meaning | RGBA bytes |
| --- | --- |
| Empty brick | `[255, 255, 255, 255]` |
| Occupied but not resident | `[254, 255, 255, 255]` |
| Resident atlas slot `s` | `[s & 255, (s >> 8) & 255, (s >> 16) & 255, 0]` |

Resident slot range:

```text
0 <= s <= 16777213
```

Do not use alpha `255` for resident slots. The shader can classify a page-table entry without reconstructing a full 32-bit integer:

- `a == 255 && r == 255` means empty
- `a == 255 && r == 254` means occupied missing
- `a == 0` means resident slot

Any other byte combination is invalid and should be treated as occupied missing in shader and as an error in CPU diagnostics.

## Resident label atlas texture

Resident occupied bricks are decoded on CPU and packed into a dense local atlas. This atlas contains only resident occupied bricks, not the full volume.

Texture:

- type: `Data3DTexture`
- format: `RGBAFormat`
- data type: `UnsignedByteType`
- dimensionality: 3D

Atlas layout:

```text
bricksPerRow = floor(max3DTextureSize / brickSizeX)
bricksPerColumn = floor(max3DTextureSize / brickSizeY)
slotsPerSlab = bricksPerRow * bricksPerColumn
slabCount = ceil(residentSlotCount / slotsPerSlab)

atlasWidth = bricksPerRow * brickSizeX
atlasHeight = bricksPerColumn * brickSizeY
atlasDepth = slabCount * brickSizeZ
```

If any atlas dimension exceeds the device max 3D texture size, reduce resident slot budget. If the budget cannot hold the required visible bricks, report an incomplete resource state.

Slot to texel:

```text
tileX = slot % bricksPerRow
tileY = floor(slot / bricksPerRow) % bricksPerColumn
tileZ = floor(slot / slotsPerSlab)

texX = tileX * brickSizeX + localX
texY = tileY * brickSizeY + localY
texZ = tileZ * brickSizeZ + localZ
```

Edge bricks:

- invalid padding voxels are uploaded as label `0`
- shader must also check global voxel bounds before accepting a hit

## Local sub-brick occupancy texture

Each resident 32 x 32 x 32 brick has 4 x 4 x 4 local occupancy cells.

One local occupancy cell covers:

```text
8 x 8 x 8 voxels
```

Each resident brick needs 64 occupancy bits. Store as 64 bytes for simple shader access.

Texture:

- type: `DataTexture`
- format: `RGBAFormat`
- data type: `UnsignedByteType`
- dimensionality: 2D

Logical storage:

- 16 RGBA texels per resident slot
- each texel stores occupancy for 4 local cells
- byte value `0` means empty
- byte value `255` means occupied

Texture dimensions:

```text
logicalTexels = residentSlotCount * 16
localOccupancyWidth = 256
localOccupancyHeight = ceil(logicalTexels / 256)
```

If height exceeds max texture size, reduce resident slot budget.

Local cell index:

```text
cellX = floor(localX / 8)
cellY = floor(localY / 8)
cellZ = floor(localZ / 8)
cellIndex = (cellZ * 4 + cellY) * 4 + cellX
```

Texture lookup:

```text
logicalTexel = slot * 16 + floor(cellIndex / 4)
channel = cellIndex % 4
```

## Global occupancy hierarchy texture

Use a packed 2D red-byte texture for global hierarchy levels.

Texture:

- type: `DataTexture`
- format: `RedFormat`
- data type: `UnsignedByteType`
- dimensionality: 2D

Packing:

```text
hierarchyWidth = min(maxTextureSize, 4096)
levelOffset[level] = cumulative node count before this level
hierarchyHeight = ceil(totalNodeCount / hierarchyWidth)
```

Node index inside a level:

```text
nodeIndex = (nodeZ * gridY + nodeY) * gridX + nodeX
packedIndex = levelOffset[level] + nodeIndex
u = packedIndex % hierarchyWidth
v = floor(packedIndex / hierarchyWidth)
```

Values:

- `0` empty
- `255` occupied

CPU upload converts storage value `1` to GPU value `255`.

## Required uniforms

Sparse segmentation shader uniforms:

```text
u_sparseSegEnabled: float
u_sparseSegVolumeSize: vec3
u_sparseSegBrickSize: vec3
u_sparseSegBrickGrid: vec3

u_sparseSegPageTable: sampler2D
u_sparseSegPageTableSize: vec2

u_sparseSegLabelAtlas: sampler3D
u_sparseSegAtlasSize: vec3
u_sparseSegAtlasLayout: vec4
  x = bricksPerRow
  y = bricksPerColumn
  z = slotsPerSlab
  w = residentSlotCount

u_sparseSegLocalOccupancy: sampler2D
u_sparseSegLocalOccupancySize: vec2

u_sparseSegHierarchy: sampler2D
u_sparseSegHierarchySize: vec2
u_sparseSegHierarchyLevelCount: float
u_sparseSegHierarchyLevelGrid[MAX_SPARSE_SEG_LEVELS]: vec3
u_sparseSegHierarchyLevelOffset[MAX_SPARSE_SEG_LEVELS]: float

u_sparseSegColorSeed: vec4
u_sparseSegMissingBrickMode: float
```

`u_sparseSegColorSeed` stores the 32-bit color seed as four bytes normalized to `[0, 1]`.

`u_sparseSegMissingBrickMode`:

- `0`: no missing occupied bricks in the required render set
- `1`: missing bricks exist; shader should discard or show incomplete diagnostic color according to UI state

The first complete implementation should avoid rendering with mode `1` by keeping the layer not render-ready until required bricks are resident.

## Shader helper contracts

Required helper concepts:

```text
PageEntry classifyPageEntry(vec4 rawBytes)
vec4 fetchLabelBytes(float slot, vec3 localVoxel)
bool localSubBrickOccupied(float slot, vec3 localVoxel)
vec4 labelColorFromBytes(vec4 labelBytes, vec4 seedBytes)
bool labelBytesAreZero(vec4 labelBytes)
bool labelBytesEqual(vec4 a, vec4 b)
```

Where `PageEntry` is conceptual. GLSL can represent it as separate values:

- state: empty, missing, resident
- slot low/mid/high bytes
- slot float for atlas addressing

## Slot decoding limit

Resident slots are limited to 24 bits because the page table uses alpha for state.

Slot decoding:

```text
slot = r + g * 256 + b * 65536
```

This is exact for all allowed slot values in highp float.

## Label color hashing

Hash input:

- label RGBA bytes
- seed RGBA bytes

Required properties:

- label zero returns transparent
- same label and same seed return same color
- different labels should be visually distinct enough for neighboring labels
- labels above `65535` must not alias with low labels

Implementation guidance:

- build a byte-wise integer hash using float arithmetic over byte values
- produce hue from hash
- keep saturation and value in readable ranges
- output alpha `1` for nonzero labels

The CPU slice renderer must use the same hash algorithm or a generated lookup function from the same source constants.

## Resource readiness contract

The resource manager computes the required brick set before upload.

For the first complete implementation:

- 3D mode requires all occupied bricks at the selected scale/timepoint to be resident.
- Slice mode requires all occupied bricks intersecting the slice to be resident.

Later optimization may restrict 3D to the visible brick set, but only with tests proving missing occupied bricks cannot appear as empty.

Readiness states:

```ts
type SparseSegmentationResourceState =
  | 'idle'
  | 'loading-index'
  | 'loading-bricks'
  | 'uploading'
  | 'ready'
  | 'incomplete'
  | 'error';
```

## WebGL2 failure modes

Fail explicitly when:

- page table exceeds max texture size
- hierarchy texture exceeds max texture size
- local occupancy texture exceeds max texture size
- no resident slot budget can satisfy required bricks
- atlas dimensions exceed max 3D texture size
- packed labels cannot be uploaded as RGBA8

Do not fall back to dense segmentation textures.

