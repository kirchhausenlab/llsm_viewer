import assert from 'node:assert/strict';

import {
  computeAnisotropyStepRatio,
  resolveAnisotropyAxis,
  resolveVolumeAnisotropyScale,
} from '../src/components/viewers/volume-viewer/useVolumeViewerAnisotropy.ts';

console.log('Starting volume viewer anisotropy helper tests');

(() => {
  assert.strictEqual(resolveAnisotropyAxis(2), 2);
  assert.strictEqual(resolveAnisotropyAxis(0), 1);
  assert.strictEqual(resolveAnisotropyAxis(-4), 1);
  assert.strictEqual(resolveAnisotropyAxis(Number.NaN), 1);
  assert.strictEqual(resolveAnisotropyAxis(undefined), 1);
  assert.strictEqual(resolveAnisotropyAxis('2'), 1);
})();

(() => {
  assert.deepStrictEqual(resolveVolumeAnisotropyScale(undefined), { x: 1, y: 1, z: 1 });
  assert.deepStrictEqual(resolveVolumeAnisotropyScale({ x: 0.5 }), { x: 0.5, y: 1, z: 1 });
  assert.deepStrictEqual(resolveVolumeAnisotropyScale({ x: 4, y: 2, z: 1 }), { x: 4, y: 2, z: 1 });
})();

(() => {
  assert.strictEqual(computeAnisotropyStepRatio({ x: 1, y: 1, z: 1 }), 1);
  assert.strictEqual(computeAnisotropyStepRatio({ x: 4, y: 2, z: 1 }), 4);
  assert.strictEqual(computeAnisotropyStepRatio({ x: Number.POSITIVE_INFINITY, y: 2, z: 1 }), 1);
})();

console.log('volume viewer anisotropy helper tests passed');
