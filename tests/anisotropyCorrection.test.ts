import assert from 'node:assert/strict';

import { computeAnisotropyScale, resampleVolume } from '../src/utils/anisotropyCorrection.ts';
import type { VoxelResolutionValues } from '../src/types/voxelResolution.ts';
import type { VolumePayload } from '../src/types/volume.ts';

console.log('Starting anisotropy correction tests');

(() => {
  const isotropic: VoxelResolutionValues = {
    x: 1,
    y: 1,
    z: 1,
    unit: 'μm',
    correctAnisotropy: false
  };
  assert.strictEqual(computeAnisotropyScale(isotropic), null);

  const anisotropic: VoxelResolutionValues = {
    x: 5,
    y: 3.6,
    z: 2.1,
    unit: 'μm',
    correctAnisotropy: true
  };
  const scale = computeAnisotropyScale(anisotropic);
  assert.ok(scale);
  const minSpacing = Math.min(anisotropic.x, anisotropic.y, anisotropic.z);
  assert.strictEqual(scale.x, anisotropic.x / minSpacing);
  assert.strictEqual(scale.y, anisotropic.y / minSpacing);
  assert.strictEqual(scale.z, anisotropic.z / minSpacing);
})();

(() => {
  const sourceData = new Float32Array([0, 10]);
  const payload: VolumePayload = {
    width: 2,
    height: 1,
    depth: 1,
    channels: 1,
    dataType: 'float32',
    data: sourceData.buffer,
    min: 0,
    max: 10
  };
  const resampled = resampleVolume(payload, {
    scale: { x: 2, y: 1, z: 1 },
    interpolation: 'linear',
    targetDataType: 'float32'
  });
  assert.strictEqual(resampled.width, 4);
  assert.strictEqual(resampled.height, 1);
  assert.strictEqual(resampled.depth, 1);
  const result = Array.from(new Float32Array(resampled.data));
  assert.deepEqual(result.map((value) => Number(value.toFixed(6))), [0, 3.333333, 6.666667, 10]);
})();

(() => {
  const segmentationData = new Uint8Array([0, 255]);
  const payload: VolumePayload = {
    width: 1,
    height: 2,
    depth: 1,
    channels: 1,
    dataType: 'uint8',
    data: segmentationData.buffer,
    min: 0,
    max: 255
  };
  const resampled = resampleVolume(payload, {
    scale: { x: 1, y: 2, z: 1 },
    interpolation: 'nearest',
    targetDataType: 'uint8'
  });
  assert.strictEqual(resampled.width, 1);
  assert.strictEqual(resampled.height, 4);
  assert.strictEqual(resampled.depth, 1);
  assert.deepEqual(Array.from(new Uint8Array(resampled.data)), [0, 0, 255, 255]);
})();

console.log('anisotropy correction tests passed');
