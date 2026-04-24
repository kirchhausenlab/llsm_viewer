import assert from 'node:assert/strict';

import { shouldPreferDirectVolumeSampling } from '../src/shared/utils/lod0Residency.ts';

console.log('Starting lod0Residency tests');

(() => {
  assert.equal(
    shouldPreferDirectVolumeSampling({
      scaleLevel: 1,
      volumeWidth: 256,
      volumeHeight: 256,
      volumeDepth: 128,
      textureChannels: 1,
      gridShape: [4, 8, 8],
      chunkShape: [32, 32, 32],
      occupiedBrickCount: 224,
      maxDirectVolumeBytes: 512 * 1024 * 1024
    }),
    true
  );
})();

(() => {
  assert.equal(
    shouldPreferDirectVolumeSampling({
      scaleLevel: 1,
      volumeWidth: 355,
      volumeHeight: 304,
      volumeDepth: 51,
      textureChannels: 1,
      gridShape: [4, 5, 6],
      chunkShape: [16, 64, 64],
      occupiedBrickCount: 120,
      maxDirectVolumeBytes: 384 * 1024 * 1024
    }),
    true
  );
})();

(() => {
  assert.equal(
    shouldPreferDirectVolumeSampling({
      scaleLevel: 1,
      volumeWidth: 4096,
      volumeHeight: 256,
      volumeDepth: 128,
      textureChannels: 1,
      gridShape: [4, 8, 8],
      chunkShape: [32, 32, 32],
      occupiedBrickCount: 224,
      maxDirectVolumeBytes: 512 * 1024 * 1024,
      max3DTextureSize: 2048
    }),
    false
  );
})();

console.log('lod0Residency tests passed');
