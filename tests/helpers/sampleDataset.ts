import type { HydratedDataset, HydratedLayer } from '../../src/collaboration/serialization.ts';
import type { NormalizedVolume } from '../../src/volumeProcessing.ts';

function createVolume(): NormalizedVolume {
  return {
    width: 2,
    height: 1,
    depth: 1,
    channels: 1,
    min: 0,
    max: 255,
    normalized: new Uint8Array([0, 128])
  };
}

function createLayer(key: string, volume: NormalizedVolume): HydratedLayer {
  return {
    key,
    label: `Layer ${key}`,
    channelId: 'channel-1',
    channelName: 'Channel 1',
    isSegmentation: false,
    volumes: [volume]
  };
}

export function createSampleDataset(createdAt = Date.now()): HydratedDataset {
  const volume = createVolume();
  const layer = createLayer('layer-1', volume);
  return {
    layers: [layer],
    layerSettings: {
      [layer.key]: {
        contrast: 1,
        gamma: 1,
        brightness: 0,
        color: '#ffffff',
        xOffset: 0,
        yOffset: 0,
        renderStyle: 0,
        invert: false
      }
    },
    channels: [
      {
        channelId: 'channel-1',
        visibility: true,
        activeLayerKey: layer.key
      }
    ],
    tracks: { definitions: [] },
    trackStates: [
      {
        channelId: 'channel-1',
        opacity: 1,
        lineWidth: 1,
        colorMode: { type: 'random' },
        visibility: {}
      }
    ],
    viewerState: {
      selectedIndex: 0,
      isPlaying: false,
      fps: 30,
      viewerMode: '3d',
      sliceIndex: 0,
      followedTrackId: null
    },
    createdAt
  };
}

