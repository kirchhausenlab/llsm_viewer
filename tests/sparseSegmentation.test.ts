import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createVolumeProvider, DEFAULT_MAX_CACHED_CHUNK_BYTES, DEFAULT_MAX_CACHED_VOLUMES, DEFAULT_MAX_CONCURRENT_CHUNK_READS, DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS } from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import {
  preprocessDatasetToStorage,
  type PreprocessLayerSource,
} from '../src/shared/utils/preprocessedDataset/preprocess.ts';
import {
  buildSparseSegmentationPayloadShard,
  computeSparseSegmentationCrc32,
  decodeSparseSegmentationBrickDirectory,
  decodeSparseSegmentationBrickPayload,
  downsampleSparseSegmentationVoxels,
  encodeSparseSegmentationBrickDirectory,
  encodeSparseSegmentationBrickPayload,
  extractSparseSegmentationSliceFromField,
  hashSparseSegmentationLabelColor,
  localCoordForOffset,
  readSparseSegmentationPayloadFromShard,
  type SparseSegmentationBrickDirectoryRecord,
  type SparseSegmentationBrickSize,
  type SparseSegmentationField,
  type SparseSegmentationLocalVoxel,
} from '../src/shared/utils/preprocessedDataset/sparseSegmentation/index.ts';
import { isSparseSegmentationLayerManifest } from '../src/shared/utils/preprocessedDataset/types.ts';
import type { VolumePayload } from '../src/types/volume.ts';

function createRecord({
  voxels,
  brickSize,
  codec,
  bytes,
  payloadByteOffset = 64,
}: {
  voxels: readonly SparseSegmentationLocalVoxel[];
  brickSize: SparseSegmentationBrickSize;
  codec: SparseSegmentationBrickDirectoryRecord['codec'];
  bytes: Uint8Array;
  payloadByteOffset?: number;
}): SparseSegmentationBrickDirectoryRecord {
  let minZ = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxZ = 0;
  let maxY = 0;
  let maxX = 0;
  let labelMin = Number.POSITIVE_INFINITY;
  let labelMax = 0;
  for (const voxel of voxels) {
    const local = localCoordForOffset(voxel.offset, brickSize);
    minZ = Math.min(minZ, local.z);
    minY = Math.min(minY, local.y);
    minX = Math.min(minX, local.x);
    maxZ = Math.max(maxZ, local.z);
    maxY = Math.max(maxY, local.y);
    maxX = Math.max(maxX, local.x);
    labelMin = Math.min(labelMin, voxel.label);
    labelMax = Math.max(labelMax, voxel.label);
  }
  return {
    timepoint: 0,
    scaleLevel: 0,
    brickCoord: { z: 0, y: 0, x: 0 },
    localBounds: {
      min: { z: minZ, y: minY, x: minX },
      max: { z: maxZ, y: maxY, x: maxX },
    },
    nonzeroVoxelCount: voxels.length,
    labelMin,
    labelMax,
    codec,
    shardId: 0,
    payloadByteLength: bytes.byteLength,
    payloadByteOffset,
    decodedVoxelCount: voxels.length,
    payloadCrc32: computeSparseSegmentationCrc32(bytes),
  };
}

function roundTripBrick(voxels: SparseSegmentationLocalVoxel[], brickSize: SparseSegmentationBrickSize) {
  const encoded = encodeSparseSegmentationBrickPayload({ voxels, brickSize });
  const record = createRecord({ voxels, brickSize, codec: encoded.codec, bytes: encoded.bytes });
  const decoded = decodeSparseSegmentationBrickPayload({
    layerKey: 'layer-seg',
    bytes: encoded.bytes,
    record,
    brickSize,
  });
  return { encoded, record, decoded };
}

function createUint32VolumePayload({
  width,
  height,
  depth,
  values,
}: {
  width: number;
  height: number;
  depth: number;
  values: readonly number[];
}): VolumePayload {
  assert.equal(values.length, width * height * depth);
  const data = Uint32Array.from(values);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of data) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint32',
    min,
    max,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
  };
}

test('sparse segmentation payload codecs round trip and choose deterministic adaptive codecs', () => {
  const cases: Array<{
    name: string;
    brickSize: SparseSegmentationBrickSize;
    voxels: SparseSegmentationLocalVoxel[];
    expectedCodec: SparseSegmentationBrickDirectoryRecord['codec'];
  }> = [
    {
      name: 'single voxel',
      brickSize: [4, 4, 4],
      voxels: [{ offset: 21, label: 0xffffffff }],
      expectedCodec: 'coord-list-v1',
    },
    {
      name: 'long x run',
      brickSize: [1, 1, 32],
      voxels: Array.from({ length: 17 }, (_, index) => ({ offset: 4 + index, label: 9 })),
      expectedCodec: 'x-run-v1',
    },
    {
      name: 'moderately sparse scattered labels',
      brickSize: [4, 4, 4],
      voxels: [0, 7, 14, 21, 28, 35, 42, 49].map((offset, index) => ({ offset, label: index + 1 })),
      expectedCodec: 'bitmask-labels-v1',
    },
    {
      name: 'dense local brick',
      brickSize: [4, 4, 4],
      voxels: Array.from({ length: 64 }, (_, offset) => ({ offset, label: offset + 1 })),
      expectedCodec: 'dense-local-v1',
    },
  ];

  for (const entry of cases) {
    const { encoded, decoded } = roundTripBrick(entry.voxels, entry.brickSize);
    assert.equal(encoded.codec, entry.expectedCodec, entry.name);
    for (const voxel of entry.voxels) {
      assert.equal(decoded.labelAtOffset(voxel.offset), voxel.label, entry.name);
    }
    assert.equal(decoded.labelAtOffset(-1), 0, entry.name);
  }
});

test('sparse segmentation payload validation rejects malformed foreground data and corrupt shards', () => {
  assert.throws(
    () =>
      encodeSparseSegmentationBrickPayload({
        brickSize: [4, 4, 4],
        voxels: [
          { offset: 1, label: 7 },
          { offset: 1, label: 8 },
        ],
      }),
    /Duplicate sparse segmentation local offset/
  );
  assert.throws(
    () => encodeSparseSegmentationBrickPayload({ brickSize: [4, 4, 4], voxels: [{ offset: 1, label: 0 }] }),
    /must not encode label 0/
  );

  const voxels = [{ offset: 3, label: 65536 }];
  const brickSize: SparseSegmentationBrickSize = [4, 4, 4];
  const { encoded, record } = roundTripBrick(voxels, brickSize);
  assert.throws(
    () =>
      decodeSparseSegmentationBrickPayload({
        layerKey: 'layer-seg',
        bytes: encoded.bytes.slice(0, encoded.bytes.byteLength - 1),
        record,
        brickSize,
      }),
    /byte-length mismatch/
  );

  const shard = buildSparseSegmentationPayloadShard({ shardId: 0, payloads: [encoded.bytes] });
  const shardRecord = { ...record, payloadByteOffset: shard.payloadOffsets[0] ?? 64 };
  assert.deepEqual(
    Array.from(readSparseSegmentationPayloadFromShard({ shardBytes: shard.bytes, record: shardRecord, path: 'shard.ssbp' })),
    Array.from(encoded.bytes)
  );
  const corruptedShard = shard.bytes.slice();
  corruptedShard[(shard.payloadOffsets[0] ?? 64) + encoded.bytes.byteLength - 1] ^= 0xff;
  assert.throws(
    () => readSparseSegmentationPayloadFromShard({ shardBytes: corruptedShard, record: shardRecord, path: 'shard.ssbp' }),
    /checksum mismatch/
  );
});

test('sparse segmentation downsampling applies implicit-zero majority and deterministic ties', () => {
  assert.deepEqual(
    downsampleSparseSegmentationVoxels({
      width: 2,
      height: 2,
      depth: 2,
      voxels: [
        { z: 0, y: 0, x: 0, label: 3 },
        { z: 0, y: 0, x: 1, label: 4 },
      ],
    }).voxels,
    []
  );
  assert.deepEqual(
    downsampleSparseSegmentationVoxels({
      width: 2,
      height: 2,
      depth: 1,
      voxels: [
        { z: 0, y: 0, x: 0, label: 7 },
        { z: 0, y: 1, x: 1, label: 7 },
      ],
    }).voxels,
    [{ z: 0, y: 0, x: 0, label: 7 }]
  );
  assert.deepEqual(
    downsampleSparseSegmentationVoxels({
      width: 2,
      height: 2,
      depth: 1,
      voxels: [
        { z: 0, y: 0, x: 0, label: 7 },
        { z: 0, y: 0, x: 1, label: 5 },
        { z: 0, y: 1, x: 0, label: 7 },
        { z: 0, y: 1, x: 1, label: 5 },
      ],
    }).voxels,
    [{ z: 0, y: 0, x: 0, label: 5 }]
  );
});

test('sparse segmentation directory lookup and CPU slice extraction preserve hashed uint32 labels', async () => {
  const brickSize: SparseSegmentationBrickSize = [2, 2, 2];
  const voxels = [
    { offset: 0, label: 1 },
    { offset: 3, label: 65536 },
    { offset: 6, label: 0xffffffff },
  ];
  const { encoded, record, decoded } = roundTripBrick(voxels, brickSize);
  const directoryBytes = encodeSparseSegmentationBrickDirectory({
    records: [record],
    scaleLevel: 0,
    timepointCount: 1,
    brickGridShape: [1, 1, 1],
    brickSize,
  });
  const directory = decodeSparseSegmentationBrickDirectory(directoryBytes);
  assert.equal(directory.lookup(0, { z: 0, y: 0, x: 0 })?.payloadCrc32, computeSparseSegmentationCrc32(encoded.bytes));
  assert.equal(directory.recordsIntersectingSlice(0, 'z', 1).length, 1);
  assert.equal(directory.recordsIntersectingSlice(0, 'x', 1).length, 1);

  const field: SparseSegmentationField = {
    kind: 'sparse-segmentation',
    layerKey: 'layer-seg',
    timepoint: 0,
    scaleLevel: 0,
    width: 2,
    height: 2,
    depth: 2,
    brickSize,
    brickGridShape: [1, 1, 1],
    occupiedBrickCount: 1,
    nonzeroVoxelCount: voxels.length,
    colorSeed: 1234,
    labels: [],
    directory,
    occupancyHierarchy: { levels: [] },
  };
  const zSlice = await extractSparseSegmentationSliceFromField({
    field,
    axis: 'z',
    index: 1,
    loadBrick: async () => decoded,
  });
  assert.equal(zSlice.width, 2);
  assert.equal(zSlice.height, 2);
  assert.deepEqual(Array.from(zSlice.rgba.slice(0, 4)), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(zSlice.rgba.slice(8, 12)), hashSparseSegmentationLabelColor(0xffffffff, 1234));
});

test('preprocessing and provider keep sparse segmentation uint32 labels exact without dense volume fallback', async () => {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'sparse-segmentation-u32' });
  const file = new File(['seg-u32'], 'seg-u32.tif', { type: 'image/tiff' });
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-seg',
      channelLabel: 'Segmentation',
      key: 'seg-u32',
      label: 'Segmentation',
      files: [file],
      isSegmentation: true,
    },
  ];
  const payload = createUint32VolumePayload({
    width: 4,
    height: 2,
    depth: 1,
    values: [0, 65536, 0xffffffff, 0, 0, 17, 0, 0],
  });

  const result = await preprocessDatasetToStorage({
    layers,
    channels: [{ id: 'channel-seg', name: 'Segmentation' }],
    trackSets: [],
    voxelResolution: { x: 1000, y: 1000, z: 1000, unit: 'nm', correctAnisotropy: false },
    temporalResolution: { interval: 1, unit: 's' },
    movieMode: '3d',
    storage: storageHandle.storage,
    storageStrategy: { sharding: { enabled: false } },
    volumeLoader: async () => [{ ...payload, data: (payload.data as ArrayBuffer).slice(0) }],
  });

  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer && isSparseSegmentationLayerManifest(layer));
  assert.equal('zarr' in layer, false);
  assert.equal(layer.dataType, 'uint32');
  assert.equal(layer.sparse.scales[0]?.payload.shardCount, 1);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  await assert.rejects(() => provider.getVolume('seg-u32', 0), /sparse segmentation layer/);
  assert.equal(await provider.querySparseSegmentationLabel?.('seg-u32', 0, 0, { z: 0, y: 0, x: 1 }), 65536);
  assert.equal(await provider.querySparseSegmentationLabel?.('seg-u32', 0, 0, { z: 0, y: 0, x: 2 }), 0xffffffff);
  assert.equal(await provider.querySparseSegmentationLabel?.('seg-u32', 0, 0, { z: 0, y: 1, x: 0 }), 0);

  const field = await provider.getSparseSegmentationField?.('seg-u32', 0, { scaleLevel: 0 });
  assert.ok(field);
  assert.equal(field.labels.some((entry) => entry.labelId === 65536), true);
  assert.equal(field.labels.some((entry) => entry.labelId === 0xffffffff), true);

  const brick = await provider.getSparseSegmentationBrick?.('seg-u32', 0, 0, { z: 0, y: 0, x: 0 });
  assert.equal(brick?.labelAtOffset(1), 65536);
  assert.equal(brick?.labelAtOffset(2), 0xffffffff);

  const atlas = await provider.getBrickAtlas?.('seg-u32', 0, { scaleLevel: 0 });
  assert.ok(atlas);
  assert.equal(atlas.kind, 'segmentation');
  assert.equal(atlas.textureFormat, 'rgba');
  assert.deepEqual(Array.from((atlas.data as Uint8Array).slice(4, 8)), [0, 0, 1, 0]);
  assert.deepEqual(Array.from((atlas.data as Uint8Array).slice(8, 12)), [255, 255, 255, 255]);

  const slice = await provider.extractSparseSegmentationSlice?.('seg-u32', 0, 0, { axis: 'z', index: 0 });
  assert.ok(slice);
  assert.equal(slice.width, 4);
  assert.equal(slice.height, 2);
  assert.deepEqual(
    Array.from(slice.rgba.slice(4, 8)),
    hashSparseSegmentationLabelColor(65536, field.colorSeed)
  );
  assert.deepEqual(
    Array.from(slice.rgba.slice(8, 12)),
    hashSparseSegmentationLabelColor(0xffffffff, field.colorSeed)
  );
});
