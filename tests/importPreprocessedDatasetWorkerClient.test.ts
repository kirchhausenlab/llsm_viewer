import assert from 'node:assert/strict';

import type { ImportPreprocessedDatasetResult } from '../src/shared/utils/preprocessedDataset/index.ts';
import type { LoadedLayer } from '../src/types/layers.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import { __TEST_ONLY__ } from '../src/workers/importPreprocessedDataset/streamingAugmentation.ts';

const { augmentStreamingSources, hasValidStreamingSources } = __TEST_ONLY__;

type MockStreamingSource = { getMipLevels: () => number[] };

const manifest: ImportPreprocessedDatasetResult['manifest'] = {
  dataset: {
    channels: [],
    zarrStore: { source: 'http', url: 'https://example.com' }
  },
};

const baseVolume: NormalizedVolume = {
  width: 1,
  height: 1,
  depth: 1,
  channels: 1,
  dataType: 'uint8',
  normalized: new Uint8Array([0]),
  min: 0,
  max: 1
};

console.log('Starting importPreprocessedDatasetWorkerClient tests');

(async () => {
  const invalidLayers: LoadedLayer[] = [
    {
      key: 'layer',
      label: 'Layer',
      channelId: 'channel',
      isSegmentation: false,
      volumes: [{ ...baseVolume, streamingSource: {} }]
    }
  ];

  const invalidResult: ImportPreprocessedDatasetResult = {
    manifest,
    layers: invalidLayers
  } as ImportPreprocessedDatasetResult;

  assert.equal(hasValidStreamingSources(invalidResult), false);

  const validSource: MockStreamingSource = { getMipLevels: () => [0] };
  const updatedLayers: LoadedLayer[] = [
    {
      key: 'layer',
      label: 'Layer',
      channelId: 'channel',
      isSegmentation: false,
      volumes: [{ ...baseVolume, streamingSource: validSource } as LoadedLayer['volumes'][number] ]
    }
  ];

  let openCalls = 0;
  let buildCalls = 0;
  let attachCalls = 0;

  const openExternalZarrStore = async () => {
    openCalls += 1;
    return {};
  };
  const buildStreamingContexts = async () => {
    buildCalls += 1;
    return new Map();
  };
  const attachStreamingContexts = async () => {
    attachCalls += 1;
    return updatedLayers;
  };

  const rebuilt = await augmentStreamingSources(invalidResult, {
    openExternalZarrStore: openExternalZarrStore as any,
    buildStreamingContexts: buildStreamingContexts as any,
    attachStreamingContexts: attachStreamingContexts as any
  });

  assert.equal(rebuilt.layers, updatedLayers);
  assert.equal(openCalls, 1);
  assert.equal(buildCalls, 1);
  assert.equal(attachCalls, 1);
})();

console.log('importPreprocessedDatasetWorkerClient tests passed');
