# Sparse Segmentation Schema

This document defines the target manifest schema for the sparse segmentation hard cutover.

The TypeScript shapes here are the implementation target. A future agent should copy these shapes closely unless an existing local type name conflicts. Changes to these contracts require updating this document first.

## Format identifiers

Target root manifest format for newly preprocessed datasets:

```ts
export const SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT =
  'llsm-viewer-preprocessed-vnext-sparse-seg1' as const;
```

Reader behavior:

- `llsm-viewer-preprocessed-vnext-hes1` and `llsm-viewer-preprocessed-vnext-hes2` remain accepted only when every layer is intensity-only.
- `llsm-viewer-preprocessed-vnext-sparse-seg1` is required for any manifest containing sparse segmentation.
- Any manifest with a segmentation layer but without `representation: 'sparse-label-bricks-v1'` fails validation.

## Root manifest shape

```ts
export type PreprocessedDatasetFormat =
  | typeof LEGACY_PREPROCESSED_DATASET_FORMAT
  | typeof PREPROCESSED_DATASET_FORMAT
  | typeof SPARSE_SEGMENTATION_PREPROCESSED_DATASET_FORMAT;

export type PreprocessedManifest = {
  format: PreprocessedDatasetFormat;
  generatedAt: string;
  dataset: {
    movieMode: '3d';
    totalVolumeCount: number;
    channels: PreprocessedChannelManifest[];
    trackSets: PreprocessedTrackSetManifestEntry[];
    voxelResolution: VoxelResolutionValues;
    temporalResolution: TemporalResolutionMetadata;
    anisotropyCorrection?: AnisotropyCorrectionMetadata | null;
    backgroundMask?: PreprocessedBackgroundMaskManifest | null;
  };
};
```

## Channel and layer union

```ts
export type PreprocessedLayerKind = 'intensity' | 'segmentation';

export type PreprocessedChannelManifest = {
  id: string;
  name: string;
  layers: PreprocessedLayerManifestEntry[];
};

export type PreprocessedLayerManifestEntry =
  | PreprocessedIntensityLayerManifestEntry
  | PreprocessedSparseSegmentationLayerManifestEntry;
```

## Intensity layer shape

Intensity layers keep the current dense contract. New sparse-format manifests should write `kind: 'intensity'`. Older intensity-only manifests may omit `kind`, and the schema can infer intensity when `isSegmentation !== true`.

```ts
export type PreprocessedIntensityLayerManifestEntry = {
  kind: 'intensity';
  key: string;
  label: string;
  channelId: string;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  storedDataType: StoredIntensityDataType;
  normalization: NormalizationMetadata | null;
  isBinaryLike?: boolean;
  zarr: {
    scales: PreprocessedLayerScaleManifestEntry[];
  };
};
```

Compatibility rule:

- In `hes1` and `hes2` manifests, a layer with missing `kind` and `isSegmentation !== true` is normalized by validation to `kind: 'intensity'`.
- In `sparse-seg1` manifests, `kind` is required.

## Sparse segmentation layer shape

```ts
export type SparseSegmentationRepresentation = 'sparse-label-bricks-v1';
export type SparseSegmentationLabelDataType = 'uint32';

export type PreprocessedSparseSegmentationLayerManifestEntry = {
  kind: 'segmentation';
  key: string;
  label: string;
  channelId: string;
  volumeCount: number;
  width: number;
  height: number;
  depth: number;
  channels: 1;
  dataType: 'uint32';
  labelDataType: SparseSegmentationLabelDataType;
  emptyLabel: 0;
  normalization: null;
  representation: SparseSegmentationRepresentation;
  brickSize: [number, number, number];
  colorSeed: number;
  sparse: SparseSegmentationManifest;
};
```

Forbidden on sparse segmentation layers:

- `zarr`
- `storedDataType`
- `isBinaryLike`
- histograms
- dense `zarr.data`
- dense segmentation label arrays
- playback atlas descriptors

Validation must fail if any forbidden dense segmentation field is present in a segmentation layer.

## Sparse segmentation manifest

```ts
export type SparseSegmentationManifest = {
  version: 1;
  labels: SparseSegmentationLabelMetadataDescriptor;
  scales: SparseSegmentationScaleManifestEntry[];
};

export type SparseSegmentationScaleManifestEntry = {
  level: number;
  downsampleFactor: [number, number, number];
  width: number;
  height: number;
  depth: number;
  brickSize: [number, number, number];
  brickGridShape: [number, number, number];
  occupiedBrickCount: number;
  nonzeroVoxelCount: number;
  directory: SparseSegmentationBrickDirectoryDescriptor;
  payload: SparseSegmentationPayloadShardSetDescriptor;
  occupancyHierarchy: SparseSegmentationOccupancyHierarchyDescriptor;
};
```

Scale validation:

- `level` values are contiguous and start at `0`.
- `downsampleFactor` is positive on all axes.
- level `0` dimensions match layer dimensions.
- each next level dimension is `ceil(previous / 2)` per axis unless an existing project-wide multiscale policy explicitly chooses a different divisor.
- terminal scale reaches `1 x 1 x 1`.
- `brickGridShape` equals `ceil([depth, height, width] / brickSize)`.
- `occupiedBrickCount` equals the brick directory record count for that scale.
- `nonzeroVoxelCount` equals the sum of directory record `nonzeroVoxelCount`.

## Binary descriptor shapes

```ts
export type SparseSegmentationBinaryDescriptor = {
  path: string;
  byteLength: number;
  checksum?: {
    algorithm: 'crc32';
    value: number;
  } | null;
};

export type SparseSegmentationBrickDirectoryDescriptor =
  SparseSegmentationBinaryDescriptor & {
    format: 'sparse-brick-directory-v1';
    recordCount: number;
    recordByteLength: 80;
  };

export type SparseSegmentationPayloadShardSetDescriptor = {
  format: 'sparse-brick-payload-shards-v1';
  shardCount: number;
  shardPathPrefix: string;
  shardFileExtension: '.ssbp';
  targetShardBytes: number;
  totalPayloadBytes: number;
};

export type SparseSegmentationOccupancyHierarchyDescriptor = {
  format: 'sparse-occupancy-hierarchy-v1';
  levels: SparseSegmentationOccupancyHierarchyLevelDescriptor[];
};

export type SparseSegmentationOccupancyHierarchyLevelDescriptor =
  SparseSegmentationBinaryDescriptor & {
    level: number;
    gridShape: [number, number, number];
    dataType: 'uint8';
    occupiedNodeCount: number;
  };

export type SparseSegmentationLabelMetadataDescriptor =
  SparseSegmentationBinaryDescriptor & {
    format: 'sparse-label-metadata-v1';
    recordCount: number;
    recordByteLength: 96;
  };
```

## Codec enum

```ts
export type SparseSegmentationBrickCodec =
  | 'coord-list-v1'
  | 'x-run-v1'
  | 'bitmask-labels-v1'
  | 'dense-local-v1';
```

The binary files store numeric codec IDs. The manifest exposes semantic codec support only through the format version. Exact binary IDs are defined in `BINARY_LAYOUT.md`.

## Valid sparse segmentation example

This is intentionally small but schema-valid.

```json
{
  "format": "llsm-viewer-preprocessed-vnext-sparse-seg1",
  "generatedAt": "2026-04-25T00:00:00.000Z",
  "dataset": {
    "movieMode": "3d",
    "totalVolumeCount": 1,
    "channels": [
      {
        "id": "seg-channel",
        "name": "Segmentation",
        "layers": [
          {
            "kind": "segmentation",
            "key": "seg-layer",
            "label": "Segmentation",
            "channelId": "seg-channel",
            "volumeCount": 1,
            "width": 64,
            "height": 64,
            "depth": 32,
            "channels": 1,
            "dataType": "uint32",
            "labelDataType": "uint32",
            "emptyLabel": 0,
            "normalization": null,
            "representation": "sparse-label-bricks-v1",
            "brickSize": [32, 32, 32],
            "colorSeed": 305419896,
            "sparse": {
              "version": 1,
              "labels": {
                "format": "sparse-label-metadata-v1",
                "path": "layers/seg-layer/labels.bin",
                "byteLength": 160,
                "recordCount": 1,
                "recordByteLength": 96,
                "checksum": null
              },
              "scales": [
                {
                  "level": 0,
                  "downsampleFactor": [1, 1, 1],
                  "width": 64,
                  "height": 64,
                  "depth": 32,
                  "brickSize": [32, 32, 32],
                  "brickGridShape": [1, 2, 2],
                  "occupiedBrickCount": 1,
                  "nonzeroVoxelCount": 3,
                  "directory": {
                    "format": "sparse-brick-directory-v1",
                    "path": "layers/seg-layer/scale-0/directory.bin",
                    "byteLength": 144,
                    "recordCount": 1,
                    "recordByteLength": 80,
                    "checksum": null
                  },
                  "payload": {
                    "format": "sparse-brick-payload-shards-v1",
                    "shardCount": 1,
                    "shardPathPrefix": "layers/seg-layer/scale-0/payloads/shard-",
                    "shardFileExtension": ".ssbp",
                    "targetShardBytes": 8388608,
                    "totalPayloadBytes": 98
                  },
                  "occupancyHierarchy": {
                    "format": "sparse-occupancy-hierarchy-v1",
                    "levels": [
                      {
                        "level": 0,
                        "path": "layers/seg-layer/scale-0/occupancy-level-0.bin",
                        "byteLength": 68,
                        "gridShape": [1, 2, 2],
                        "dataType": "uint8",
                        "occupiedNodeCount": 1,
                        "checksum": null
                      },
                      {
                        "level": 1,
                        "path": "layers/seg-layer/scale-0/occupancy-level-1.bin",
                        "byteLength": 65,
                        "gridShape": [1, 1, 1],
                        "dataType": "uint8",
                        "occupiedNodeCount": 1,
                        "checksum": null
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    ],
    "trackSets": [],
    "voxelResolution": {
      "x": 1,
      "y": 1,
      "z": 1,
      "unit": "um",
      "correctAnisotropy": false
    },
    "temporalResolution": {
      "value": 1,
      "unit": "s"
    },
    "backgroundMask": null
  }
}
```

## Invalid legacy dense segmentation example

This must fail, even if the dense zarr descriptor is otherwise valid.

```json
{
  "format": "llsm-viewer-preprocessed-vnext-hes2",
  "dataset": {
    "channels": [
      {
        "id": "seg-channel",
        "name": "Segmentation",
        "layers": [
          {
            "key": "seg-layer",
            "label": "Segmentation",
            "channelId": "seg-channel",
            "isSegmentation": true,
            "volumeCount": 1,
            "width": 64,
            "height": 64,
            "depth": 32,
            "channels": 1,
            "dataType": "uint16",
            "storedDataType": "uint16",
            "normalization": null,
            "zarr": {
              "scales": [
                {
                  "level": 0,
                  "downsampleFactor": [1, 1, 1],
                  "width": 64,
                  "height": 64,
                  "depth": 32,
                  "channels": 1,
                  "zarr": {
                    "data": {
                      "path": "layers/seg-layer/scale-0/data",
                      "shape": [1, 32, 64, 64, 1],
                      "chunkShape": [1, 32, 32, 32, 1],
                      "dataType": "uint16"
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

Required error shape:

```text
Unsupported legacy dense segmentation layer "seg-layer". This dataset must be reprocessed with sparse segmentation support before launching the viewer.
```

## Invalid sparse segmentation examples

Reject a segmentation layer with both sparse and dense storage:

```json
{
  "kind": "segmentation",
  "representation": "sparse-label-bricks-v1",
  "zarr": { "scales": [] },
  "sparse": { "version": 1, "labels": {}, "scales": [] }
}
```

Reject a segmentation layer with `uint16` labels:

```json
{
  "kind": "segmentation",
  "representation": "sparse-label-bricks-v1",
  "labelDataType": "uint16"
}
```

Reject a sparse segmentation manifest under an old root format:

```json
{
  "format": "llsm-viewer-preprocessed-vnext-hes2",
  "dataset": {
    "channels": [
      {
        "id": "seg-channel",
        "name": "Segmentation",
        "layers": [
          {
            "kind": "segmentation",
            "representation": "sparse-label-bricks-v1"
          }
        ]
      }
    ]
  }
}
```

## Validation order

Validation must run in this order:

1. Validate root object and root format.
2. Validate dataset container and channel list.
3. For each layer, classify it:
   - `kind === 'segmentation'` means sparse segmentation is required.
   - legacy `isSegmentation === true` means reject unless the layer is already valid sparse segmentation under the sparse root format.
   - missing `kind` with `isSegmentation !== true` can be treated as intensity for old intensity-only formats.
4. If any segmentation layer exists and root format is not `sparse-seg1`, reject.
5. Validate intensity layers with the existing dense schema.
6. Validate segmentation layers with the sparse schema.
7. Validate cross-layer totals and track bindings.

Do not read any binary payload before manifest validation finishes.

