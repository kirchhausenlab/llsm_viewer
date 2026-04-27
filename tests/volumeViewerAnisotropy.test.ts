import assert from 'node:assert/strict';

import { computeAnisotropyStepRatio } from '../src/components/viewers/volume-viewer/useVolumeViewerAnisotropy.ts';

console.log('Starting volume viewer anisotropy helper tests');

(() => {
  assert.strictEqual(computeAnisotropyStepRatio({ x: 1, y: 1, z: 1 }), 1);
  assert.strictEqual(computeAnisotropyStepRatio({ x: 4, y: 2, z: 1 }), 4);
  assert.strictEqual(computeAnisotropyStepRatio({ x: Number.POSITIVE_INFINITY, y: 2, z: 1 }), 1);
})();

console.log('volume viewer anisotropy helper tests passed');
