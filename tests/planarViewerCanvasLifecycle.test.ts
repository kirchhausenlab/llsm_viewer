import assert from 'node:assert/strict';

import { shouldAnimatePlanarSlice } from '../src/components/viewers/planar-viewer/usePlanarViewerCanvasLifecycle.ts';

console.log('Starting planar viewer canvas lifecycle helper tests');

(() => {
  assert.strictEqual(shouldAnimatePlanarSlice(0, null), false);
  assert.strictEqual(shouldAnimatePlanarSlice(1, null), true);
  assert.strictEqual(shouldAnimatePlanarSlice(0, { x: 1, y: 2 }), true);
})();

console.log('planar viewer canvas lifecycle helper tests passed');
