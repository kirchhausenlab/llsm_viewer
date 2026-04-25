# Risk Register

## R1: Sparse WebGL2 traversal underperforms dense texture sampling

Risk:

Sparse data reduces bytes but adds indirection, branching, and dependent texture reads.

Mitigation:

- keep page table simple
- use brick DDA to skip large empty regions
- add local sub-brick occupancy to avoid wasting work inside sparse bricks
- benchmark multiple spatial patterns, not only ideal sparse blobs

## R2: Random sparse voxels occupy too many bricks

Risk:

Very scattered foreground can make many bricks occupied, increasing local atlas overhead.

Mitigation:

- default to 32-cubed bricks
- use local sub-brick skipping
- keep adaptive storage codecs
- benchmark random isolated voxels as a worst case

## R3: WebGL2 texture limits block large resident sets

Risk:

Large sparse datasets may exceed max 3D texture size or memory budgets.

Mitigation:

- query WebGL2 limits
- shard atlas resources when needed
- implement explicit residency budgets
- expose honest loading/incomplete states

## R4: Missing bricks render as false background

Risk:

The renderer may accidentally treat occupied-but-not-resident bricks as empty.

Mitigation:

- use separate sentinels for empty and occupied-missing
- test missing-brick states
- fail closed with loading/incomplete state

## R5: Schema accepts legacy dense segmentation accidentally

Risk:

Old dense segmentation datasets could silently launch, keeping unsupported behavior alive.

Mitigation:

- add invalid legacy dense segmentation fixtures
- reject any segmentation layer without sparse representation
- make the error message explicit

## R6: Preprocessing accidentally builds dense global labels

Risk:

Implementation may reuse current dense code and lose memory benefits.

Mitigation:

- add code review checklist item
- add large sparse fixture memory checks where practical
- isolate sparse preprocessing from dense volume preprocessing

## R7: Label precision is lost in shader packing

Risk:

Labels above `65535` or above 24-bit ranges may decode incorrectly.

Mitigation:

- pack `uint32` labels into four bytes
- use nearest sampling
- avoid color-space conversion
- test representative high labels

## R8: Categorical downsampling ambiguity causes flicker or test instability

Risk:

Tie cases in downsampling may be inconsistent across worker paths.

Mitigation:

- use the locked deterministic tie rule
- test tie cases in single-thread and worker paths

## R9: Slice extraction becomes CPU-bound

Risk:

Sparse slice rendering may still spend too much CPU time decoding bricks repeatedly.

Mitigation:

- cache decoded bricks
- cache recent slices if needed
- add optional slab indexes only after profiling

## R10: Future WebGPU migration is made harder by WebGL2-specific storage

Risk:

Packing decisions for WebGL2 could leak into disk format.

Mitigation:

- keep storage codec independent from GPU texture packing
- treat WebGL2 atlas/page-table as derived resources
- document backend-neutral provider APIs

