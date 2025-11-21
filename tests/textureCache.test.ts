import assert from 'node:assert/strict';
import * as THREE from 'three';

import { clearTextureCache, getCachedTextureData } from '../src/textureCache.ts';
import type { NormalizedVolume } from '../src/volumeProcessing.ts';

console.log('Starting texture cache tests');

try {
  clearTextureCache();

  const volume: NormalizedVolume = {
    width: 2,
    height: 1,
    depth: 1,
    channels: 3,
    dataType: 'uint8',
    normalized: new Uint8Array([10, 20, 30, 40, 50, 60]),
    min: 0,
    max: 255,
  };

  const prepared = getCachedTextureData(volume);
  assert.strictEqual(prepared.format, THREE.RGBAFormat);
  assert.strictEqual(prepared.data.length, volume.width * volume.height * volume.depth * 4);

  const alpha = Math.round((10 + 20 + 30) / 3);
  assert.deepEqual(Array.from(prepared.data.slice(0, 4)), [10, 20, 30, alpha]);

  const cached = getCachedTextureData(volume);
  assert.strictEqual(cached, prepared);

  console.log('texture cache tests passed');
} catch (error) {
  console.error('Texture cache tests failed:', error);
  process.exit(1);
}
