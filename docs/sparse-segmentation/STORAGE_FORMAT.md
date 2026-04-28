# Storage Format

This document defines the target sparse segmentation dataset contract.

The exact TypeScript manifest shapes are defined in `SCHEMA_SPARSE_SEGMENTATION.md`. The exact byte-level layouts are defined in `BINARY_LAYOUT.md`.

## Format lineage

New preprocessing output should use a new manifest format identifier:

- `llsm-viewer-preprocessed-isotropic-sparse-v1`

Reader behavior:

- accept current intensity-only manifests that contain no segmentation layers
- accept new sparse segmentation manifests
- reject any manifest containing a segmentation layer without the sparse segmentation representation

The rejection must be specific enough for users to understand that the dataset must be reprocessed.

## Layer kind

The manifest should move away from boolean-only segmentation identity.

Target layer identity:

- `kind: intensity`
- `kind: segmentation`

An `isSegmentation` boolean may exist as a derived runtime convenience, but schema validation should treat `kind` and representation as authoritative.

## Intensity layer contract

Intensity layers keep the existing dense zarr scale contract unless unrelated work changes it.

Intensity layers continue to own:

- dense `zarr.data`
- histograms
- skip hierarchy
- optional subcell data
- optional playback atlas
- normalization metadata

## Segmentation layer contract

A segmentation layer owns sparse scales instead of dense `zarr.data`.

Required layer fields:

- `key`
- `label`
- `channelId`
- `kind: segmentation`
- `volumeCount`
- base `width`, `height`, `depth`
- `labelDataType: uint32`
- `emptyLabel: 0`
- `representation: sparse-label-bricks-v1`
- `brickSize`, default `[32, 32, 32]`
- `colorSeed`
- `sparse.scales[]`
- `labels`, a label metadata descriptor

Forbidden on segmentation layers:

- dense `zarr.data`
- dense label zarr arrays
- histogram descriptors
- intensity normalization
- dense segmentation playback atlas

## Segmentation scale contract

Each sparse segmentation scale records:

- `level`
- `downsampleFactor`
- `width`, `height`, `depth`
- `brickSize`
- `brickGridShape`
- `occupiedBrickCount`
- `nonzeroVoxelCount`
- `index`
- `payload`
- `occupancyHierarchy`

Scale levels must be contiguous starting at `0`.

The terminal scale policy should match the current full multiscale policy: continue until the scale reaches `1 x 1 x 1`, unless the project-wide policy changes separately.

## Brick coordinates

Brick coordinates are integer grid coordinates:

- `brickZ = floor(z / brickDepth)`
- `brickY = floor(y / brickHeight)`
- `brickX = floor(x / brickWidth)`

Local coordinates inside a brick:

- `localZ = z - brickZ * brickDepth`
- `localY = y - brickY * brickHeight`
- `localX = x - brickX * brickWidth`

Local linear offset for a default 32-cubed brick:

- `offset = localZ * brickHeight * brickWidth + localY * brickWidth + localX`

With 32-cubed bricks, local offsets fit in `uint16`.

## Brick directory

The brick directory is the authoritative sparse index for a scale and timepoint.

Each occupied brick record includes:

- timepoint
- scale level
- brick coordinate `[z, y, x]`
- local nonzero voxel count
- local bounding box inside the brick
- sorted label count or label range summary
- payload codec
- payload shard id
- payload byte offset
- payload byte length
- checksum or byte-length validation metadata

Directory order:

- sorted by timepoint
- then scale level
- then brick z
- then brick y
- then brick x

The provider may build auxiliary maps from this sorted directory, but the stored order must be deterministic.

## Payload sharding

Do not write one file per brick.

Payloads should be written to shard files. The directory points into these shard files by byte offset and byte length.

Shard goals:

- avoid thousands of small files
- allow range reads
- support local filesystem and OPFS-backed storage
- keep single read units reasonably large for streaming
- keep corruption/error messages local to a shard and brick record

The storage layer already has sharding concepts for dense arrays. Reuse those abstractions where they fit, but do not force sparse bricks into dense zarr semantics.

## Brick payload codecs

The storage format supports multiple per-brick codecs. Preprocessing chooses the smallest valid codec per brick.

Required codecs:

- coordinate list
- x-run-length encoding
- occupancy bitmask plus label stream
- dense local brick

All codecs represent only one brick.

### Coordinate list

Use for extremely sparse bricks.

Payload content:

- sorted local offsets
- corresponding `uint32` labels

Invariants:

- offsets are strictly increasing
- labels are nonzero
- count matches brick directory nonzero count

### X-run-length encoding

Use for contiguous spans, especially thin surfaces or masks that form runs along x.

Payload content:

- local `z`
- local `y`
- x start
- length
- `uint32` label

Invariants:

- runs are sorted by z, y, x
- runs do not overlap
- labels are nonzero
- all covered voxels are within brick bounds

### Occupancy bitmask plus label stream

Use for moderately sparse bricks.

Payload content:

- one bit per voxel in local linear order
- labels for set bits in local linear order

Invariants:

- bit count equals label count
- labels are nonzero

### Dense local brick

Use only when a non-empty brick is locally dense enough that compressed codecs are larger or slower.

Payload content:

- full local brick labels

Invariants:

- empty global bricks are still omitted
- dense local brick payloads are allowed only for occupied bricks
- edge bricks store only valid in-bounds voxels or include clear padding metadata

This is not a dense global fallback. It is an internal codec for a non-empty local brick.

## Codec selection

Preprocessing should evaluate all required codecs and choose by:

1. smallest encoded bytes
2. if tied, fastest expected decode
3. if still tied, deterministic codec order

The selected codec is stored in the brick directory.

## Label metadata

The sparse preprocessing output must include label metadata.

Per label:

- label ID
- voxel count at base scale
- bounding box at base scale
- centroid in voxel coordinates
- first and last timepoint where present
- per-timepoint voxel count or compact presence bitmap

Per scale label metadata may be added if needed, but base-scale metadata is required.

Label metadata enables:

- label list UI
- future label visibility controls
- hover diagnostics
- "zoom to label"
- benchmark validation

## Occupancy hierarchy

Each sparse segmentation scale needs an occupancy hierarchy for rendering.

Level 0 is the brick grid. Parent levels reduce 2 x 2 x 2 child nodes.

Each node stores:

- occupied flag
- child range or implicit child coordinate
- optional nonzero voxel count

Required invariants:

- level 0 occupied flag matches the brick directory
- parent occupied is true if any child is occupied
- levels are contiguous
- top level is `1 x 1 x 1`

This hierarchy is separate from dense intensity skip hierarchy. Segmentation does not need min/max intensity bounds.

## Slice acceleration metadata

Axis-aligned slice extraction can be implemented from the brick directory by selecting bricks whose brick slab intersects the requested slice.

If performance requires additional metadata, add optional per-axis slab indexes:

- z slab to occupied brick records
- y slab to occupied brick records
- x slab to occupied brick records

Do not make slab indexes required until benchmarks prove they are needed. The required brick directory must be sufficient for correctness.

## Checksums and validation

Each payload shard should have enough validation metadata to catch:

- missing shard
- incorrect byte range
- truncated payload
- invalid codec tag
- decoded voxel count mismatch
- decoded local bounds outside brick
- decoded zero labels
- duplicate voxel offsets

Validation failures must throw with layer key, scale level, timepoint, brick coordinate, and codec.
