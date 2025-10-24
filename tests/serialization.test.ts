import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { deserializeDataset, serializeDataset } from '../src/collaboration/serialization.ts';
import { createSampleDataset } from './helpers/sampleDataset.ts';

console.log('Starting collaboration dataset serialization tests');

await (async () => {
  try {
    const dataset = createSampleDataset(1735689600000);
    const serialized = serializeDataset(dataset);

    assert.strictEqual(serialized.layers.length, dataset.layers.length);
    const originalVolume = dataset.layers[0].volumes[0];
    const encoded = Buffer.from(originalVolume.normalized).toString('base64');
    assert.strictEqual(serialized.layers[0].volumes[0].data, encoded);

    const hydrated = deserializeDataset(serialized);
    assert.strictEqual(hydrated.layers.length, dataset.layers.length);
    assert.strictEqual(hydrated.layers[0].volumes.length, dataset.layers[0].volumes.length);

    const hydratedVolume = hydrated.layers[0].volumes[0];
    assert.strictEqual(hydratedVolume.width, originalVolume.width);
    assert.strictEqual(hydratedVolume.height, originalVolume.height);
    assert.strictEqual(hydratedVolume.depth, originalVolume.depth);
    assert.strictEqual(hydratedVolume.channels, originalVolume.channels);
    assert.deepStrictEqual(
      Array.from(hydratedVolume.normalized),
      Array.from(originalVolume.normalized)
    );
    assert.notStrictEqual(hydratedVolume.normalized, originalVolume.normalized);

    assert.deepStrictEqual(hydrated.layerSettings, dataset.layerSettings);
    assert.deepStrictEqual(hydrated.channels, dataset.channels);
    assert.deepStrictEqual(hydrated.trackStates, dataset.trackStates);
    assert.deepStrictEqual(hydrated.tracks, dataset.tracks);
    assert.deepStrictEqual(hydrated.viewerState, dataset.viewerState);
    assert.strictEqual(hydrated.createdAt, dataset.createdAt);

    console.log('Collaboration dataset serialization tests passed');
  } catch (error) {
    console.error('Collaboration dataset serialization tests failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
})();

