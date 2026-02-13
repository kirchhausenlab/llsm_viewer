import assert from 'node:assert/strict';

import { shouldClearPlanarHoverState } from '../src/components/viewers/planar-viewer/usePlanarViewerBindings.ts';

console.log('Starting planar viewer bindings helper tests');

(() => {
  assert.strictEqual(shouldClearPlanarHoverState(null), true);
  assert.strictEqual(
    shouldClearPlanarHoverState({
      width: 10,
      height: 10,
      buffer: new Uint8ClampedArray(100),
      hasLayer: false,
    }),
    true,
  );
  assert.strictEqual(
    shouldClearPlanarHoverState({
      width: 10,
      height: 10,
      buffer: new Uint8ClampedArray(100),
      hasLayer: true,
    }),
    false,
  );
})();

console.log('planar viewer bindings helper tests passed');
