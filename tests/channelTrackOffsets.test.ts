import assert from 'node:assert/strict';

import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { deriveChannelTrackOffsets } from '../src/state/channelTrackOffsets.ts';
import type { LoadedLayer } from '../src/types/layers.ts';

console.log('Starting channel track offset tests');

const layerA = { ...createDefaultLayerSettings(), xOffset: 12, yOffset: -4 };
const layerB = { ...createDefaultLayerSettings(), xOffset: -7, yOffset: 9 };
const layerC = { ...createDefaultLayerSettings(), xOffset: 3, yOffset: 5 };

const channels = [{ id: 'channel-a' }, { id: 'channel-b' }, { id: 'channel-c' }, { id: 'channel-empty' }];

const channelLayersMap = new Map<string, LoadedLayer[]>([
  [
    'channel-a',
    [
      {
        key: 'layer-a',
        label: 'Layer A',
        channelId: 'channel-a',
        volumes: [],
        isSegmentation: false
      }
    ]
  ],
  [
    'channel-b',
    [
      {
        key: 'layer-b',
        label: 'Layer B',
        channelId: 'channel-b',
        volumes: [],
        isSegmentation: false
      }
    ]
  ],
  [
    'channel-c',
    [
      {
        key: 'layer-c',
        label: 'Layer C',
        channelId: 'channel-c',
        volumes: [],
        isSegmentation: false
      }
    ]
  ],
  ['channel-empty', []]
]);

const channelActiveLayer: Record<string, string | undefined> = {
  'channel-a': 'layer-a',
  'channel-b': 'layer-b'
  // channel-c intentionally omitted to verify fallback behaviour
};

const layerSettings = {
  'layer-a': layerA,
  'layer-b': layerB,
  'layer-c': layerC
};

const offsets = deriveChannelTrackOffsets({
  channels,
  channelLayersMap,
  channelActiveLayer,
  layerSettings
});

assert.deepEqual(offsets['channel-a'], { x: 12, y: -4 });
assert.deepEqual(offsets['channel-b'], { x: -7, y: 9 });
assert.deepEqual(offsets['channel-c'], { x: 3, y: 5 });
assert.deepEqual(offsets['channel-empty'], { x: 0, y: 0 });

console.log('channel track offset tests passed');
