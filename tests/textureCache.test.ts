import assert from 'node:assert/strict';
import * as THREE from 'three';

import { clearTextureCache, getCachedTextureData } from '../src/core/textureCache.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting textureCache tests');

(() => {
  clearTextureCache();

  const width = 2;
  const height = 2;
  const depth = 1;
  const channels = 3;
  const voxelCount = width * height * depth;

  const volume: NormalizedVolume = {
    width,
    height,
    depth,
    channels,
    dataType: 'uint8',
    normalized: new Uint8Array(voxelCount * channels),
    min: 0,
    max: 255,
  };

  const prepared = getCachedTextureData(volume);
  assert.ok(prepared.format != null, 'Expected a valid THREE texture format for 3-channel volumes');

  const runtimeRgbFormat = (THREE as unknown as { RGBFormat?: unknown }).RGBFormat;
  if (typeof runtimeRgbFormat === 'number') {
    assert.strictEqual(prepared.format, runtimeRgbFormat);
    assert.strictEqual(prepared.data.length, voxelCount * channels);
  } else {
    assert.strictEqual(prepared.format, THREE.RGBAFormat);
    assert.strictEqual(prepared.data.length, voxelCount * 4);
  }
})();

console.log('textureCache tests passed');

