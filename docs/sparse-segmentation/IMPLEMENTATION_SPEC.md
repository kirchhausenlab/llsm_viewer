# Implementation Spec

This spec defines the complete end-to-end sparse segmentation hard cutover.

## 1) Architecture summary

The implementation introduces a new segmentation data path:

- setup still lets users add segmentation channels
- preprocessing writes sparse segmentation brick data
- manifest schema validates sparse segmentation representation
- provider loads sparse segmentation fields
- viewer resources upload sparse WebGL2 textures
- 3D renderer traverses sparse voxel bricks
- slice renderer decodes only intersecting sparse bricks
- hover queries exact sparse labels

Intensity channels remain on the dense volume path.

## 2) Data type split

Create an explicit runtime split between:

- dense intensity volume
- sparse segmentation field

The existing `NormalizedVolume` model should not grow more segmentation-specific branches. Instead, introduce sparse segmentation types and provider APIs that make the representation explicit.

Required runtime objects:

- dense intensity volume
- sparse segmentation layer index
- sparse segmentation brick payload
- sparse segmentation field handle
- sparse segmentation GPU resource set

Use the module boundaries in `MIGRATION_MAP.md`. Do not collapse sparse segmentation into the dense volume modules as another boolean branch.

## 3) Preprocessing

### 3.1 Input validation

Segmentation input constraints:

- one source channel only
- finite numeric source values
- values must be non-negative integers
- label `0` is background
- labels must fit `uint32`

Reject:

- multichannel segmentation TIFF sources
- negative labels
- non-integer float labels
- NaN or infinite labels
- labels above `uint32`

Do not silently round segmentation labels.

### 3.2 Streaming sparse construction

Preprocessing must build sparse bricks while reading input. It must not build a full dense global segmentation volume as the normal implementation.

Allowed memory shape:

- current input slice
- current working brick accumulators
- bounded caches for brick payload construction
- per-label metadata accumulators

Forbidden memory shape:

- full global dense segmentation labels for a timepoint
- full global dense segmentation labels for a scale

### 3.3 Brick construction

For each nonzero voxel:

1. canonicalize the label
2. compute brick coordinate
3. compute local voxel offset
4. append to the brick accumulator
5. update per-label metadata

Empty bricks are never written.

At flush time:

1. sort local offsets
2. reject duplicates
3. compute local bounds
4. choose payload codec
5. write payload into shard
6. append brick directory record

### 3.4 Multiscale generation

Generate sparse segmentation scales using categorical majority downsampling.

Implementation options:

- stream from the previous sparse scale into accumulators for the next scale
- decode previous-scale bricks only as needed
- avoid dense global intermediate arrays

The downsampling rule is locked in `DECISIONS.md`.

### 3.5 Label metadata

Preprocessing must emit base-scale label metadata:

- voxel count
- bounding box
- centroid
- timepoint presence

Centroid should be computed from integer coordinate sums and converted to floating point only when stored or displayed.

### 3.6 Background mask and normalization

Segmentation does not participate in intensity normalization.

Background masks, if present, are derived from non-segmentation layers as today. Segmentation preprocessing should not apply background masks to labels unless a future product decision explicitly asks for label masking.

## 4) Manifest and schema

### 4.1 Root format

New preprocessed outputs use `llsm-viewer-preprocessed-isotropic-sparse-v1`.

The reader accepts older/current formats only if no segmentation layer is present.

### 4.2 Layer validation

For intensity layers:

- preserve existing dense validation

For segmentation layers:

- require sparse segmentation representation
- require `uint32` label data type
- require brick directory and payload descriptors
- require occupancy hierarchy
- require label metadata
- reject dense `zarr.data`
- reject histograms
- reject normalization values other than `null`

### 4.3 Legacy rejection

If a manifest contains `isSegmentation: true` or equivalent legacy segmentation identity but lacks the new sparse representation, schema validation must throw.

The error should identify:

- layer key or channel name
- that the dataset uses legacy dense segmentation
- that reprocessing is required

## 5) Provider

### 5.1 API split

The provider should expose separate methods for intensity and segmentation.

Intensity examples:

- get dense volume
- get intensity page table
- get intensity brick atlas

Segmentation methods:

- get sparse segmentation field
- get sparse segmentation scale index
- get sparse segmentation brick payload
- query segmentation label at voxel
- extract segmentation slice
- prepare segmentation GPU brick set

Use the required signatures below. Call sites must not ask `getVolume` and receive a dense-like segmentation object.

### 5.1.1 Required provider signatures

The implementation should converge on these signatures.

```ts
export type VolumeProvider = {
  getIntensityVolume(
    layerKey: string,
    timepoint: number,
    options?: VolumeLoadOptions
  ): Promise<IntensityVolume>;

  getSparseSegmentationField(
    layerKey: string,
    timepoint: number,
    options?: SparseSegmentationFieldLoadOptions
  ): Promise<SparseSegmentationField>;

  getSparseSegmentationBrick(
    layerKey: string,
    timepoint: number,
    scaleLevel: number,
    brickCoord: SparseSegmentationBrickCoord,
    options?: AbortableLoadOptions
  ): Promise<DecodedSparseSegmentationBrick>;

  querySparseSegmentationLabel(
    layerKey: string,
    timepoint: number,
    scaleLevel: number,
    voxel: SparseSegmentationVoxelCoord,
    options?: AbortableLoadOptions
  ): Promise<number>;

  extractSparseSegmentationSlice(
    layerKey: string,
    timepoint: number,
    scaleLevel: number,
    request: SparseSegmentationSliceRequest,
    options?: AbortableLoadOptions
  ): Promise<SparseSegmentationSlice>;

  prefetchSparseSegmentationBricks(
    layerKey: string,
    timepoint: number,
    scaleLevel: number,
    bricks: SparseSegmentationBrickCoord[],
    options?: AbortableLoadOptions
  ): Promise<void>;

  hasSparseSegmentationField(layerKey: string, timepoint: number, scaleLevel?: number): boolean;
  hasIntensityVolume(layerKey: string, timepoint: number, scaleLevel?: number): boolean;

  getStats(): VolumeProviderStats;
  getDiagnostics(): VolumeProviderDiagnostics;
};
```

Compatibility rule during migration:

- Existing `getVolume` may remain temporarily for intensity call sites, but it must throw if called for a segmentation layer.
- The final state should either rename `getVolume` to `getIntensityVolume` or keep `getVolume` as an intensity-only alias with tests proving segmentation calls fail.

Required supporting types:

```ts
export type AbortableLoadOptions = {
  signal?: AbortSignal | null;
};

export type VolumeLoadOptions = AbortableLoadOptions & {
  scaleLevel?: number;
  includeHistogram?: boolean;
  recordLookup?: boolean;
};

export type SparseSegmentationFieldLoadOptions = AbortableLoadOptions & {
  scaleLevel?: number;
  loadDirectory?: boolean;
  loadLabelMetadata?: boolean;
};

export type SparseSegmentationBrickCoord = {
  z: number;
  y: number;
  x: number;
};

export type SparseSegmentationVoxelCoord = {
  z: number;
  y: number;
  x: number;
};

export type SparseSegmentationField = {
  kind: 'sparse-segmentation';
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  width: number;
  height: number;
  depth: number;
  brickSize: [number, number, number];
  brickGridShape: [number, number, number];
  occupiedBrickCount: number;
  nonzeroVoxelCount: number;
  colorSeed: number;
  labels: SparseSegmentationLabelMetadata[];
  directory: SparseSegmentationBrickDirectory;
  occupancyHierarchy: SparseSegmentationOccupancyHierarchy;
};

export type DecodedSparseSegmentationBrick = {
  kind: 'decoded-sparse-segmentation-brick';
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  brickCoord: SparseSegmentationBrickCoord;
  brickSize: [number, number, number];
  codec: SparseSegmentationBrickCodec;
  nonzeroVoxelCount: number;
  localBounds: {
    min: SparseSegmentationVoxelCoord;
    max: SparseSegmentationVoxelCoord;
  };
  labelAtOffset(offset: number): number;
  forEachNonzero(callback: (offset: number, label: number) => void): void;
};

export type SparseSegmentationSliceRequest = {
  axis: 'x' | 'y' | 'z';
  index: number;
};

export type SparseSegmentationSlice = {
  kind: 'sparse-segmentation-slice';
  axis: 'x' | 'y' | 'z';
  index: number;
  width: number;
  height: number;
  rgba: Uint8Array;
};
```

Labels are returned as JavaScript `number` because `uint32` values are exactly representable. Do not use signed 32-bit operations that convert labels above `2147483647` to negative numbers.

### 5.2 Sparse field handle

The sparse field handle owns:

- layer metadata
- scale metadata
- brick directory
- occupancy hierarchy
- label metadata
- payload loading functions
- decoded brick cache
- exact label query
- slice extraction

It should be immutable for a given layer/timepoint/scale except for internal caches.

### 5.3 Caching

Required caches:

- parsed brick directory cache
- decoded brick payload cache
- slice extraction cache where useful
- GPU residency cache in viewer resources

Cache keys must include:

- layer key
- timepoint
- scale level
- brick coordinate
- codec version

Eviction must never make occupied bricks look empty. It may make the layer temporarily not render-ready.

## 6) Viewer resource integration

### 6.1 Viewer layer contract

Viewer layer contracts need to describe segmentation as sparse.

Layer state should expose:

- global dimensions
- current scale
- segmentation render mode
- sparse readiness state
- hover label state
- optional label metadata

Avoid exposing dense arrays or dense texture requirements.

### 6.2 Resource manager

The resource manager prepares:

- page table texture
- occupancy hierarchy texture
- resident local brick atlas texture
- resident metadata texture
- local sub-brick occupancy texture

It tracks:

- requested brick set
- loaded CPU brick set
- uploaded GPU brick set
- missing occupied bricks
- GPU memory estimate

### 6.3 Readiness

The viewer must not present a segmentation layer as complete if required occupied bricks are missing.

For first implementation, prefer correctness:

- determine all occupied bricks needed for current scale/timepoint/render mode
- load and upload them
- then mark render-ready

After correctness is proven, optimize residency policies while preserving the missing-brick invariant.

## 7) 3D rendering

Replace segmentation dense sampling in `volumeRenderShader` with sparse brick traversal.

Required functions conceptually:

- decode packed `uint32` label
- hash label to color
- lookup brick page-table entry
- DDA through global brick grid
- DDA or bounded stepping inside resident local brick
- resolve foreground hit label
- compute surface normal from sparse occupancy samples
- apply hover highlight

Intensity render paths should remain separate.

## 8) Slice rendering

Replace dense segmentation slice preparation with sparse slice extraction.

Required behavior:

- transparent output buffer by default
- query only bricks intersecting the slice
- decode only those bricks
- draw nonzero labels by exact coordinate
- use same label color hash as 3D

Slice correctness must be compared against dense reference outputs in tests.

## 9) Hover

Hover label lookup must use sparse query.

Required behavior:

- return `0` or null for empty background
- return exact `uint32` label for occupied voxel
- never return background because an occupied brick is merely not resident
- preserve current hover UI semantics

3D hover should use the label found by ray traversal where available.

## 10) UI and VR controls

Preserve the user-facing segmentation control model:

- `3D`
- `Slice`
- no invert
- no histogram
- transparent background
- deterministic colors

Update desktop and VR channel panels to use sparse readiness and sparse label metadata where needed.

## 11) Deletion and cleanup

Remove or make unreachable:

- dense `SegmentationVolume` as a runtime-loaded viewer data path
- dense segmentation label zarr validation
- full-volume segmentation label texture upload
- dense segmentation slice extraction
- dense segmentation hover sampling
- old segmentation palette limit assumptions

Keep setup-level segmentation classification only as user intent and metadata.

## 12) Error handling

Errors must include enough context to debug:

- dataset format
- channel/layer key
- timepoint
- scale level
- brick coordinate when relevant
- codec when relevant
- expected vs actual shape or byte length

Important user-facing errors:

- legacy dense segmentation dataset must be reprocessed
- invalid segmentation source labels
- unsupported segmentation source channel count
- corrupt sparse segmentation payload
- missing occupied brick payload
- WebGL2 sparse segmentation resource limit exceeded
