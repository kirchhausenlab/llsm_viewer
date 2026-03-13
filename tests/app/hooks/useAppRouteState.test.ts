import assert from 'node:assert/strict';

import {
  collectInitialHttpLaunchTrackedTargets,
  resolveInitialHttpLaunchTargetScaleLevel
} from '../../../src/ui/app/hooks/initialHttpLaunch.ts';

console.log('Starting useAppRouteState tests');

(() => {
  const finestScaleLevelByLayerKey = new Map<string, number>([
    ['layer-a', 0],
    ['layer-b', 0]
  ]);

  assert.strictEqual(
    resolveInitialHttpLaunchTargetScaleLevel({
      layerKey: 'layer-a',
      desiredScaleLevelByLayerKey: { 'layer-a': 1 },
      finestScaleLevelByLayerKey
    }),
    1
  );

  assert.strictEqual(
    resolveInitialHttpLaunchTargetScaleLevel({
      layerKey: 'layer-b',
      desiredScaleLevelByLayerKey: {},
      finestScaleLevelByLayerKey
    }),
    0
  );

  assert.strictEqual(
    resolveInitialHttpLaunchTargetScaleLevel({
      layerKey: 'layer-missing',
      desiredScaleLevelByLayerKey: {},
      finestScaleLevelByLayerKey
    }),
    null
  );
})();

(() => {
  const finestScaleLevelByLayerKey = new Map<string, number>([
    ['layer-a', 0],
    ['layer-b', 0],
    ['layer-c', 0]
  ]);
  const trackedTargets = collectInitialHttpLaunchTrackedTargets({
    layerKeys: ['layer-a', 'layer-b', 'layer-c'],
    loadedScaleLevelByLayerKey: {
      'layer-a': 2,
      'layer-b': null,
      'layer-c': 1
    },
    desiredScaleLevelByLayerKey: {
      'layer-a': 1,
      'layer-b': 1,
      'layer-c': 1
    },
    finestScaleLevelByLayerKey
  });

  assert.deepStrictEqual([...trackedTargets.entries()], [
    ['layer-a', 1],
    ['layer-b', 1]
  ]);
})();

console.log('useAppRouteState tests passed');
