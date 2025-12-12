import assert from 'node:assert/strict';

import {
  DEFAULT_CHUNK_TARGET_BYTES,
  DEFAULT_VOLUME_AXES,
  computeChunkShape,
  computeShardShape,
  createRootAttributes,
  getVolumeArrayPath,
  readRootAttributes,
  validateRootAttributes
} from '../src/data/zarrLayout.ts';

type ChunkOptions = Parameters<typeof computeChunkShape>[1];

type ShardOptions = Parameters<typeof computeShardShape>[1];

console.log('Starting zarr layout tests');

const voxelSize = { x: 0.5, y: 0.5, z: 1, unit: 'μm', correctAnisotropy: true } as const;

try {
  assert.strictEqual(getVolumeArrayPath(0), '/0');
  assert.strictEqual(getVolumeArrayPath(5), '/5');

  const chunkOptions: ChunkOptions = { bytesPerValue: 2, targetBytes: DEFAULT_CHUNK_TARGET_BYTES };
  const chunk = computeChunkShape({ width: 512, height: 512, depth: 32, channels: 3 }, chunkOptions);
  assert.deepEqual(chunk, [3, 16, 256, 64]);

  const shardOptions: ShardOptions = { bytesPerValue: 2 };
  const shard = computeShardShape(chunk, shardOptions);
  assert.deepEqual(shard, [3, 128, 2048, 64]);

  const attributes = createRootAttributes({
    axes: [...DEFAULT_VOLUME_AXES],
    voxelResolution: voxelSize,
    channelLabels: ['DNA', 'Actin'],
    stats: { '/0': { min: 0, max: 100 }, '/1': { min: 1, max: 5 } }
  });
  assert.deepEqual(attributes.voxelSize?.values, [0.5, 0.5, 1]);
  assert.deepEqual(attributes.channels?.map((channel) => channel.label), ['DNA', 'Actin']);

  const normalized = readRootAttributes(attributes, { expectedVolumes: 2 });
  assert.deepEqual(normalized.axes, [...DEFAULT_VOLUME_AXES]);
  assert.deepEqual(normalized.channelLabels, ['DNA', 'Actin']);
  assert.deepEqual(normalized.stats['/0'], { min: 0, max: 100 });
  assert.deepEqual(normalized.voxelResolution, {
    x: 0.5,
    y: 0.5,
    z: 1,
    unit: 'μm',
    correctAnisotropy: false
  });

  const legacy = readRootAttributes(
    {
      voxel_size: [1, 2, 3],
      voxel_size_unit: 'nm',
      channels: ['Nuclear'],
      stats: [{ min: 2, max: 4 }]
    },
    { expectedVolumes: 1 }
  );
  assert.deepEqual(legacy.channelLabels, ['Nuclear']);
  assert.deepEqual(legacy.stats['/0'], { min: 2, max: 4 });
  assert.deepEqual(legacy.voxelResolution, {
    x: 1,
    y: 2,
    z: 3,
    unit: 'nm',
    correctAnisotropy: false
  });

  const validation = validateRootAttributes({
    version: 0,
    axes: ['c', 'z', 'y', 'x'],
    stats: { '/0': { min: 0, max: 1 } }
  });
  assert.deepEqual(validation.errors, []);
  assert.ok(validation.warnings.length >= 2);

  console.log('zarr layout tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
