import assert from 'node:assert/strict';

import type { ImportPreprocessedDatasetResult } from '../src/shared/utils/preprocessedDataset/index.ts';
import type { LoadedLayer } from '../src/types/layers.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import { __TEST_ONLY__ } from '../src/workers/importPreprocessedDataset/streamingAugmentation.ts';

const { augmentStreamingSources, hasValidStreamingSources } = __TEST_ONLY__;

type MockStreamingSource = { getMipLevels: () => number[] };

const manifest: ImportPreprocessedDatasetResult['manifest'] = {
  format: 'llsm-viewer-preprocessed',
  version: 1,
  generatedAt: '2024-01-01T00:00:00.000Z',
  dataset: {
    movieMode: '3d',
    voxelResolution: null,
    anisotropyCorrection: null,
    totalVolumeCount: 2,
    channels: [
      {
        id: 'channel',
        name: 'Channel',
        trackEntries: [],
        layers: [
          {
            key: 'layer',
            label: 'Layer',
            channelId: 'channel',
            isSegmentation: false,
            volumes: [
              {
                path: 'vol-0',
                timepoint: 0,
                width: 1,
                height: 1,
                depth: 1,
                channels: 1,
                dataType: 'uint8',
                min: 0,
                max: 1,
                byteLength: 1,
                digest: 'vol-0'
              },
              {
                path: 'vol-1',
                timepoint: 0,
                width: 1,
                height: 1,
                depth: 1,
                channels: 1,
                dataType: 'uint8',
                min: 0,
                max: 1,
                byteLength: 1,
                digest: 'vol-1'
              }
            ]
          }
        ]
      }
    ],
    zarrStore: { source: 'url', url: 'https://example.com' }
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

// All volumes invalid should trigger a full rebuild.
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
      volumes: [
        { ...baseVolume, streamingSource: validSource } as LoadedLayer['volumes'][number],
      ]
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

// Mixed valid/invalid sources should rebuild only the broken volumes and leave valid ones intact.
(async () => {
  const validSource: MockStreamingSource = { getMipLevels: () => [0] };
  const rebuiltSource: MockStreamingSource = { getMipLevels: () => [0, 1] };

  const mixedLayers: LoadedLayer[] = [
    {
      key: 'layer',
      label: 'Layer',
      channelId: 'channel',
      isSegmentation: false,
      volumes: [
        { ...baseVolume, streamingSource: validSource },
        { ...baseVolume }
      ]
    }
  ];

  const mixedResult: ImportPreprocessedDatasetResult = {
    manifest,
    layers: mixedLayers
  } as ImportPreprocessedDatasetResult;

  assert.equal(hasValidStreamingSources(mixedResult), false);

  let openCalls = 0;
  let buildCalls = 0;
  let attachCalls = 0;
  let attachedContextCount = 0;

  const openExternalZarrStore = async () => {
    openCalls += 1;
    return {};
  };
  const buildStreamingContexts = async () => {
    buildCalls += 1;
    return new Map([
      [
        'vol-0',
        {
          streamingSource: validSource,
          streamingBaseShape: [1, 1, 1, 1, 1],
          streamingBaseChunkShape: [1, 1, 1, 1, 1]
        }
      ],
      [
        'vol-1',
        {
          streamingSource: rebuiltSource,
          streamingBaseShape: [1, 1, 1, 1, 1],
          streamingBaseChunkShape: [1, 1, 1, 1, 1]
        }
      ]
    ]);
  };
  const attachStreamingContexts = async (
    _manifest: ImportPreprocessedDatasetResult['manifest'],
    layers: LoadedLayer[],
    contexts: Map<string, { streamingSource: MockStreamingSource }>
  ) => {
    attachCalls += 1;
    attachedContextCount = contexts.size;
    return layers.map((layer) => ({
      ...layer,
      volumes: layer.volumes.map((volume, index) => {
        const context = contexts.get(`vol-${index}`);
        if (!context) {
          return volume;
        }
        return { ...volume, streamingSource: context.streamingSource } as LoadedLayer['volumes'][number];
      })
    }));
  };

  const rebuilt = await augmentStreamingSources(mixedResult, {
    openExternalZarrStore: openExternalZarrStore as any,
    buildStreamingContexts: buildStreamingContexts as any,
    attachStreamingContexts: attachStreamingContexts as any
  });

  assert.equal(openCalls, 1);
  assert.equal(buildCalls, 1);
  assert.equal(attachCalls, 1);
  assert.equal(attachedContextCount, 1);
  assert.equal(typeof rebuilt.layers[0].volumes[0].streamingSource?.getMipLevels, 'function');
  assert.equal(typeof rebuilt.layers[0].volumes[1].streamingSource?.getMipLevels, 'function');
  assert.equal(rebuilt.layers[0].volumes[0].streamingSource, validSource);
  assert.equal(rebuilt.layers[0].volumes[1].streamingSource, rebuiltSource);
})();

console.log('importPreprocessedDatasetWorkerClient tests passed');
