import assert from 'node:assert/strict';

import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/index.ts';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../src/core/volumeProvider.ts';
import { useLayerControls } from '../../../src/ui/app/hooks/useLayerControls.ts';
import { createDefaultLayerSettings } from '../../../src/state/layerSettings.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useLayerControls tests');

const createLoadedLayer = (): LoadedDatasetLayer => ({
  key: 'layer-a',
  label: 'Layer A',
  channelId: 'channel-a',
  isSegmentation: false,
  volumeCount: 2,
  width: 8,
  height: 8,
  depth: 8,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
});

const createPageTable = (timepoint: number, scaleLevel = 1): VolumeBrickPageTable => ({
  layerKey: 'layer-a',
  timepoint,
  scaleLevel,
  gridShape: [1, 1, 1],
  chunkShape: [8, 8, 8],
  volumeShape: [8, 8, 8],
  brickAtlasIndices: new Int32Array([0]),
  chunkMin: new Uint8Array([0]),
  chunkMax: new Uint8Array([255]),
  chunkOccupancy: new Float32Array([1]),
  occupiedBrickCount: 1,
});

const createAtlas = (timepoint: number, scaleLevel = 1): VolumeBrickAtlas => ({
  layerKey: 'layer-a',
  timepoint,
  scaleLevel,
  pageTable: createPageTable(timepoint, scaleLevel),
  width: 8,
  height: 8,
  depth: 8,
  textureFormat: 'red',
  sourceChannels: 1,
  data: new Uint8Array(8 * 8 * 8),
  enabled: true,
});

(() => {
  const layer = createLoadedLayer();
  const currentAtlas = createAtlas(0, 1);
  const warmupAtlas = createAtlas(1, 1);
  let playbackWarmupTimeIndex: number | null = null;
  let playbackWarmupLayerBrickAtlases: Record<string, VolumeBrickAtlas | null> = {};

  const hook = renderHook(() =>
    useLayerControls({
      layers: [layer],
      selectedIndex: 0,
      layerVolumes: {},
      layerPageTables: { 'layer-a': currentAtlas.pageTable },
      layerBrickAtlases: { 'layer-a': currentAtlas },
      backgroundMasksByScale: {},
      playbackWarmupTimeIndex,
      playbackWarmupLayerVolumes: {},
      playbackWarmupLayerPageTables: {},
      playbackWarmupLayerBrickAtlases,
      playbackWarmupBackgroundMasksByScale: {},
      loadVolume: null,
      layerAutoThresholds: {},
      setLayerAutoThresholds: () => {},
      createLayerDefaultSettings: () => createDefaultLayerSettings(),
      createLayerDefaultBrightnessState: () => createDefaultLayerSettings(),
      layerSettings: {},
      setLayerSettings: () => {},
      setChannelVisibility: () => {},
      channelVisibility: { 'channel-a': true },
      channelNameMap: new Map<string, string>([['channel-a', 'Channel A']]),
      layerChannelMap: new Map<string, string>([['layer-a', 'channel-a']]),
      loadedChannelIds: ['channel-a'],
      setActiveChannelTabId: () => {},
      setGlobalRenderStyle: () => {},
      setGlobalSamplingMode: () => {},
    })
  );

  const initialViewerLayers = hook.result.viewerLayers;
  assert.equal(initialViewerLayers.length, 1);

  playbackWarmupTimeIndex = 1;
  playbackWarmupLayerBrickAtlases = { 'layer-a': warmupAtlas };
  hook.rerender();

  assert.strictEqual(hook.result.viewerLayers, initialViewerLayers);
  assert.strictEqual(hook.result.viewerLayers[0], initialViewerLayers[0]);

  const initialWarmupLayers = hook.result.viewerPlaybackWarmupLayers;
  assert.equal(initialWarmupLayers.length, 1);

  playbackWarmupLayerBrickAtlases = { 'layer-a': warmupAtlas };
  hook.rerender();

  assert.strictEqual(hook.result.viewerLayers, initialViewerLayers);
  assert.strictEqual(hook.result.viewerPlaybackWarmupLayers, initialWarmupLayers);
  assert.strictEqual(hook.result.viewerPlaybackWarmupLayers[0], initialWarmupLayers[0]);

  hook.unmount();
})();

console.log('useLayerControls tests passed');
