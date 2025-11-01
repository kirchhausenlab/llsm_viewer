import { describe, expect, it } from 'vitest';

import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { deriveChannelTrackOffsets } from '../src/state/channelTrackOffsets.ts';
import type { LoadedLayer } from '../src/types/layers.ts';

describe('channel track offsets', () => {
  it('derives channel offsets from active layers and settings', () => {
    const layerA = { ...createDefaultLayerSettings(), xOffset: 12, yOffset: -4 };
    const layerB = { ...createDefaultLayerSettings(), xOffset: -7, yOffset: 9 };
    const layerC = { ...createDefaultLayerSettings(), xOffset: 3, yOffset: 5 };

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

    const offsets = deriveChannelTrackOffsets({
      channels: [
        { id: 'channel-a' },
        { id: 'channel-b' },
        { id: 'channel-c' },
        { id: 'channel-empty' }
      ],
      channelLayersMap,
      channelActiveLayer: {
        'channel-a': 'layer-a',
        'channel-b': 'layer-b'
      },
      layerSettings: {
        'layer-a': layerA,
        'layer-b': layerB,
        'layer-c': layerC
      }
    });

    expect(offsets['channel-a']).toEqual({ x: 12, y: -4 });
    expect(offsets['channel-b']).toEqual({ x: -7, y: 9 });
    expect(offsets['channel-c']).toEqual({ x: 3, y: 5 });
    expect(offsets['channel-empty']).toEqual({ x: 0, y: 0 });
  });
});
