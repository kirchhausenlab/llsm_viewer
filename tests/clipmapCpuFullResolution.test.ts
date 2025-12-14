import assert from 'node:assert/strict';
import * as THREE from 'three';

import { VolumeClipmapManager } from '../src/components/viewers/volume-viewer/rendering/clipmap.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

(async () => {
  const size = 256;
  const channels = 1;
  const normalized = new Uint8Array(size * size * size * channels);
  normalized.forEach((_, index) => {
    normalized[index] = index % 251;
  });

  const volume: NormalizedVolume = {
    width: size,
    height: size,
    depth: size,
    channels,
    dataType: 'uint8',
    normalized,
    min: 0,
    max: 250,
    chunkShape: [32, 32, 32],
  };

  const clipmap = new VolumeClipmapManager(volume);
  assert.equal(clipmap.clipSize, size);
  assert.equal(clipmap.getActiveLevelCount(), 1);
  assert.equal(clipmap.getScale(0), 1);

  await clipmap.update(new THREE.Vector3(size / 2, size / 2, size / 2));
  const level = clipmap.levels[0];

  const samplePoints: Array<[number, number, number]> = [
    [0, 0, 0],
    [size - 1, size - 1, size - 1],
    [size >> 1, size >> 1, size >> 1],
  ];

  for (const [x, y, z] of samplePoints) {
    const localX = Math.floor((x - level.origin.x) / level.scale);
    const localY = Math.floor((y - level.origin.y) / level.scale);
    const localZ = Math.floor((z - level.origin.z) / level.scale);
    const destIndex = ((localZ * clipmap.clipSize + localY) * clipmap.clipSize + localX) * channels;
    const sourceIndex = (((z * size + y) * size + x) * channels) | 0;
    assert.equal(level.buffer[destIndex], normalized[sourceIndex]);
  }

  clipmap.dispose();
  console.log('clipmap CPU full-resolution test passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
