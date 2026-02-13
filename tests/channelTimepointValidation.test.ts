import assert from 'node:assert/strict';

import {
  computeGlobalTimepointMismatch,
  getKnownLayerTimepointCount,
  hasPendingLayerTimepointCount,
} from '../src/hooks/dataset/channelTimepointValidation.ts';

console.log('Starting channel timepoint validation tests');

const createLayer = (id: string, filesCount = 1) => ({
  id,
  files: Array.from({ length: filesCount }, (_, index) => new File(['data'], `${id}-${index}.tif`)),
});

(() => {
  const counts = { 'layer-a': 5 };
  assert.strictEqual(getKnownLayerTimepointCount(createLayer('layer-a'), counts), 5);
  assert.strictEqual(getKnownLayerTimepointCount(createLayer('layer-missing'), counts), null);
  assert.strictEqual(getKnownLayerTimepointCount(null, counts), null);
})();

(() => {
  const layer = createLayer('layer-a');
  assert.strictEqual(hasPendingLayerTimepointCount(layer, {}), true);
  assert.strictEqual(hasPendingLayerTimepointCount(layer, { 'layer-a': 3 }), false);
  assert.strictEqual(hasPendingLayerTimepointCount({ id: 'layer-empty', files: [] }, {}), false);
})();

(() => {
  const channels = [
    { layers: [createLayer('layer-a')] },
    { layers: [createLayer('layer-b')] },
  ];

  assert.strictEqual(computeGlobalTimepointMismatch(channels, {}), false);
  assert.strictEqual(
    computeGlobalTimepointMismatch(channels, {
      'layer-a': 4,
      'layer-b': 6,
    }),
    true,
  );
  assert.strictEqual(
    computeGlobalTimepointMismatch(channels, {
      'layer-a': 4,
    }),
    false,
  );
})();

console.log('channel timepoint validation tests passed');
