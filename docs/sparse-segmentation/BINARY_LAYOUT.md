# Binary Layout

This document defines the byte-level sparse segmentation files.

All binary values are little-endian. All offsets are byte offsets from the beginning of the containing file. Readers must validate every header before reading records.

Use `DataView` for parsing. Read `u64` values as `bigint`; convert to JavaScript `number` only after validating the value is `<= Number.MAX_SAFE_INTEGER`.

## Primitive types

| Name | Bytes | Meaning |
| --- | ---: | --- |
| `u8` | 1 | unsigned 8-bit integer |
| `u16` | 2 | unsigned 16-bit integer |
| `u32` | 4 | unsigned 32-bit integer |
| `u64` | 8 | unsigned 64-bit integer |
| `ascii[8]` | 8 | fixed ASCII magic |

## Codec IDs

| ID | Codec |
| ---: | --- |
| `1` | coordinate list |
| `2` | x-run-length |
| `3` | occupancy bitmask plus label stream |
| `4` | dense local brick |

ID `0` is invalid and reserved.

## Brick directory file

Path is declared by `SparseSegmentationBrickDirectoryDescriptor.path`.

### Header

Header length is exactly 64 bytes.

| Offset | Type | Field | Required value or meaning |
| ---: | --- | --- | --- |
| 0 | `ascii[8]` | magic | `SSBDIR01` |
| 8 | `u16` | version | `1` |
| 10 | `u16` | headerByteLength | `64` |
| 12 | `u16` | recordByteLength | `80` |
| 14 | `u16` | flags | `0` for v1 |
| 16 | `u32` | recordCount | number of records |
| 20 | `u32` | scaleLevel | scale level for this directory |
| 24 | `u32` | timepointCount | total timepoints in layer |
| 28 | `u32` | brickGridZ | grid depth in bricks |
| 32 | `u32` | brickGridY | grid height in bricks |
| 36 | `u32` | brickGridX | grid width in bricks |
| 40 | `u16` | brickSizeZ | usually `32` |
| 42 | `u16` | brickSizeY | usually `32` |
| 44 | `u16` | brickSizeX | usually `32` |
| 46 | `u16` | reserved0 | `0` |
| 48 | `u64` | recordsByteLength | `recordCount * 80` |
| 56 | `u64` | reserved1 | `0` |

The file length must equal `64 + recordsByteLength`.

### Record

Record length is exactly 80 bytes.

| Offset | Type | Field | Meaning |
| ---: | --- | --- | --- |
| 0 | `u32` | timepoint | timepoint index |
| 4 | `u32` | scaleLevel | repeated scale level |
| 8 | `u32` | brickZ | brick coordinate z |
| 12 | `u32` | brickY | brick coordinate y |
| 16 | `u32` | brickX | brick coordinate x |
| 20 | `u16` | localMinZ | inclusive local bound |
| 22 | `u16` | localMinY | inclusive local bound |
| 24 | `u16` | localMinX | inclusive local bound |
| 26 | `u16` | localMaxZ | inclusive local bound |
| 28 | `u16` | localMaxY | inclusive local bound |
| 30 | `u16` | localMaxX | inclusive local bound |
| 32 | `u32` | nonzeroVoxelCount | nonzero labels in brick |
| 36 | `u32` | labelMin | smallest nonzero label in brick |
| 40 | `u32` | labelMax | largest nonzero label in brick |
| 44 | `u8` | codecId | one of the codec IDs |
| 45 | `u8` | flags | `0` for v1 |
| 46 | `u16` | reserved0 | `0` |
| 48 | `u32` | shardId | payload shard number |
| 52 | `u32` | payloadByteLength | bytes for this brick payload |
| 56 | `u64` | payloadByteOffset | offset inside shard file |
| 64 | `u32` | decodedVoxelCount | must equal `nonzeroVoxelCount` except dense-local may include zeros in body |
| 68 | `u32` | payloadCrc32 | CRC32 of payload bytes, or `0` if descriptor disables checksums |
| 72 | `u32` | reserved1 | `0` |
| 76 | `u32` | reserved2 | `0` |

Record ordering is strict:

1. `timepoint`
2. `scaleLevel`
3. `brickZ`
4. `brickY`
5. `brickX`

Duplicate `(timepoint, scaleLevel, brickZ, brickY, brickX)` records are invalid.

## Payload shard file

Shard path is:

```text
<shardPathPrefix><shardId><shardFileExtension>
```

Example:

```text
layers/seg-layer/scale-0/payloads/shard-0.ssbp
```

### Header

Header length is exactly 64 bytes.

| Offset | Type | Field | Required value or meaning |
| ---: | --- | --- | --- |
| 0 | `ascii[8]` | magic | `SSBSHR01` |
| 8 | `u16` | version | `1` |
| 10 | `u16` | headerByteLength | `64` |
| 12 | `u32` | shardId | shard number |
| 16 | `u32` | payloadCount | number of brick payloads in this shard |
| 20 | `u32` | flags | `0` for v1 |
| 24 | `u64` | payloadBytes | bytes after this header |
| 32 | `u64` | fileByteLength | total file length |
| 40 | `u64` | reserved0 | `0` |
| 48 | `u64` | reserved1 | `0` |
| 56 | `u64` | reserved2 | `0` |

Payload byte offsets in directory records are absolute offsets from the beginning of the shard file. The first valid payload offset is `64`.

## Common brick payload header

Every brick payload starts with a 16-byte header.

| Offset | Type | Field | Meaning |
| ---: | --- | --- | --- |
| 0 | `u8` | codecId | one of the codec IDs |
| 1 | `u8` | version | `1` |
| 2 | `u16` | headerByteLength | `16` |
| 4 | `u32` | itemCount | codec-specific count |
| 8 | `u32` | nonzeroVoxelCount | nonzero voxels represented |
| 12 | `u32` | reserved0 | `0` |

The `codecId` must match the directory record. `nonzeroVoxelCount` must match the directory record.

## Codec 1: coordinate list

Use for sparse scattered voxels.

Header:

- common payload header with `codecId = 1`
- `itemCount = nonzeroVoxelCount`

Body:

| Section | Type | Count |
| --- | --- | ---: |
| localOffsets | `u16` | `itemCount` |
| labels | `u32` | `itemCount` |

Byte length:

```text
16 + itemCount * 2 + itemCount * 4
```

Validation:

- offsets are strictly increasing
- offsets are within the brick capacity
- labels are nonzero
- label min/max match directory record

## Codec 2: x-run-length

Use for contiguous x-axis spans.

Header:

- common payload header with `codecId = 2`
- `itemCount = runCount`
- `nonzeroVoxelCount = sum(run.length)`

Each run record is 16 bytes.

| Offset | Type | Field |
| ---: | --- | --- |
| 0 | `u16` | localZ |
| 2 | `u16` | localY |
| 4 | `u16` | xStart |
| 6 | `u16` | length |
| 8 | `u32` | label |
| 12 | `u32` | reserved0 |

Byte length:

```text
16 + runCount * 16
```

Validation:

- `length > 0`
- `xStart + length <= brickSizeX`
- `localY < brickSizeY`
- `localZ < brickSizeZ`
- labels are nonzero
- expanded offsets are strictly increasing and non-overlapping

## Codec 3: occupancy bitmask plus label stream

Use for moderately sparse bricks.

Header:

- common payload header with `codecId = 3`
- `itemCount = nonzeroVoxelCount`

Body:

| Section | Type | Count |
| --- | --- | ---: |
| bitmask | `u8` | `ceil(brickCapacity / 8)` |
| labels | `u32` | `itemCount` |

Bit order:

```text
byteIndex = floor(localOffset / 8)
bitIndex = localOffset % 8
occupied = (bitmask[byteIndex] & (1 << bitIndex)) != 0
```

Labels are stored in increasing local-offset order for set bits.

Validation:

- popcount of bitmask equals `itemCount`
- labels are nonzero
- bits outside valid edge-brick volume are zero

## Codec 4: dense local brick

Use only for occupied bricks whose local density makes sparse codecs larger or slower.

Header:

- common payload header with `codecId = 4`
- `itemCount = brickCapacity`
- `nonzeroVoxelCount` equals count of nonzero labels in body

Body:

| Section | Type | Count |
| --- | --- | ---: |
| labels | `u32` | `brickCapacity` |

Byte length:

```text
16 + brickCapacity * 4
```

Validation:

- invalid edge-brick padding voxels are zero
- nonzero count matches header and directory
- all nonzero labels are within directory label min/max

Dense local bricks are allowed only as a per-occupied-brick codec. They are not a dense global segmentation representation.

## Occupancy hierarchy file

Path is declared per hierarchy level.

### Header

Header length is exactly 64 bytes.

| Offset | Type | Field | Required value or meaning |
| ---: | --- | --- | --- |
| 0 | `ascii[8]` | magic | `SSBOCC01` |
| 8 | `u16` | version | `1` |
| 10 | `u16` | headerByteLength | `64` |
| 12 | `u32` | level | hierarchy level |
| 16 | `u32` | gridZ | level grid depth |
| 20 | `u32` | gridY | level grid height |
| 24 | `u32` | gridX | level grid width |
| 28 | `u32` | occupiedNodeCount | count of nonzero body bytes |
| 32 | `u64` | bodyByteLength | `gridZ * gridY * gridX` |
| 40 | `u64` | reserved0 | `0` |
| 48 | `u64` | reserved1 | `0` |
| 56 | `u64` | reserved2 | `0` |

Body:

- one `u8` per node
- value `0` means empty
- value `1` means occupied
- all other values are invalid in storage

Node order:

```text
index = (z * gridY + y) * gridX + x
```

## Label metadata file

Path is declared by `SparseSegmentationLabelMetadataDescriptor.path`.

### Header

Header length is exactly 64 bytes.

| Offset | Type | Field | Required value or meaning |
| ---: | --- | --- | --- |
| 0 | `ascii[8]` | magic | `SSBLAB01` |
| 8 | `u16` | version | `1` |
| 10 | `u16` | headerByteLength | `64` |
| 12 | `u16` | recordByteLength | `96` |
| 14 | `u16` | flags | `0` for v1 |
| 16 | `u32` | recordCount | number of labels |
| 20 | `u32` | timepointCount | total timepoints |
| 24 | `u64` | recordsByteLength | `recordCount * 96` |
| 32 | `u64` | presenceTableOffset | byte offset of presence bitsets, or `0` |
| 40 | `u64` | presenceTableByteLength | bytes of presence table |
| 48 | `u64` | reserved0 | `0` |
| 56 | `u64` | reserved1 | `0` |

### Record

Record length is exactly 96 bytes.

| Offset | Type | Field | Meaning |
| ---: | --- | --- | --- |
| 0 | `u32` | labelId | nonzero label |
| 4 | `u32` | flags | `0` for v1 |
| 8 | `u64` | voxelCount | base-scale voxel count |
| 16 | `u32` | minZ | inclusive base-scale bound |
| 20 | `u32` | minY | inclusive base-scale bound |
| 24 | `u32` | minX | inclusive base-scale bound |
| 28 | `u32` | maxZ | inclusive base-scale bound |
| 32 | `u32` | maxY | inclusive base-scale bound |
| 36 | `u32` | maxX | inclusive base-scale bound |
| 40 | `u64` | sumZ | sum of base-scale z coordinates |
| 48 | `u64` | sumY | sum of base-scale y coordinates |
| 56 | `u64` | sumX | sum of base-scale x coordinates |
| 64 | `u32` | firstTimepoint | first timepoint where label appears |
| 68 | `u32` | lastTimepoint | last timepoint where label appears |
| 72 | `u64` | presenceBitsetOffset | absolute file offset, or `0` |
| 80 | `u32` | presenceBitsetByteLength | bytes |
| 84 | `u32` | reserved0 | `0` |
| 88 | `u64` | reserved1 | `0` |

Records are sorted by `labelId`. Label `0` is never present.

Presence bitsets use the same bit order as codec 3, with one bit per timepoint.

## Corruption handling

Any of these conditions must throw:

- invalid magic
- unsupported version
- mismatched byte length
- nonzero reserved fields
- record order violation
- duplicate brick records
- duplicate label records
- directory points outside shard file
- payload codec mismatch
- decoded count mismatch
- checksum mismatch when checksum is enabled
- zero label in foreground codec section
- invalid edge-brick padding

Error messages must include layer key, scale level, timepoint where known, brick coordinate where known, and file path.

