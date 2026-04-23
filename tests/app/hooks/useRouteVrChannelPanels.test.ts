import assert from 'node:assert/strict';

import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/useDatasetSetup.ts';
import {
  createDefaultLayerSettings,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
} from '../../../src/state/layerSettings.ts';
import { useRouteVrChannelPanels } from '../../../src/ui/app/hooks/useRouteVrChannelPanels.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useRouteVrChannelPanels tests');

const createLayer = (key: string, channelId: string, options?: Partial<LoadedDatasetLayer>): LoadedDatasetLayer => ({
  key,
  label: key,
  channelId,
  isSegmentation: false,
  volumeCount: 4,
  width: 5,
  height: 6,
  depth: 7,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
  ...options,
});

(() => {
  const defaultSettingsCalls: string[] = [];
  const defaultSettings = createDefaultLayerSettings({ windowMin: 0, windowMax: 1 });

  const hook = renderHook(() =>
    useRouteVrChannelPanels({
      trackSets: [
        { id: 'track-set-1', name: 'Main tracks' },
        { id: 'track-set-2', name: '' },
      ],
      loadedChannelIds: ['channel-a', 'channel-b'],
      channelNameMap: new Map<string, string>([['channel-a', 'Main channel']]),
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLayer('layer-a', 'channel-a')]],
        ['channel-b', [createLayer('layer-b', 'channel-b', { channels: 2, isSegmentation: true })]],
      ]),
      channelVisibility: { 'channel-a': false },
      layerSettings: {},
      currentLayerVolumes: {
        'layer-a': {
          width: 1,
          height: 1,
          depth: 1,
          channels: 1,
          dataType: 'uint8',
          normalized: new Uint8Array([1]),
          histogram: new Uint32Array([3, 4]),
          min: 0,
          max: 255,
        },
      },
      createLayerDefaultSettings: (layerKey) => {
        defaultSettingsCalls.push(layerKey);
        return defaultSettings;
      },
    }),
  );

  assert.deepStrictEqual(hook.result.trackChannels, [
    { id: 'track-set-1', name: 'Main tracks' },
    { id: 'track-set-2', name: 'Tracks' },
  ]);

  const panelA = hook.result.vrChannelPanels[0];
  assert.strictEqual(panelA?.id, 'channel-a');
  assert.strictEqual(panelA?.visible, false);
  assert.strictEqual(panelA?.activeLayerKey, 'layer-a');
  assert.deepStrictEqual(panelA?.layers[0]?.histogram, new Uint32Array([3, 4]));
  assert.strictEqual(panelA?.layers[0]?.isGrayscale, true);

  const panelB = hook.result.vrChannelPanels[1];
  assert.strictEqual(panelB?.id, 'channel-b');
  assert.strictEqual(panelB?.visible, true);
  assert.strictEqual(panelB?.activeLayerKey, 'layer-b');
  assert.strictEqual(panelB?.layers[0]?.isGrayscale, false);
  assert.strictEqual(panelB?.layers[0]?.isSegmentation, true);
  assert.deepStrictEqual(defaultSettingsCalls, ['layer-a', 'layer-b']);

  hook.unmount();
})();

(() => {
  const sliceSettings = {
    ...createDefaultLayerSettings(),
    renderStyle: RENDER_STYLE_SLICE,
    samplingMode: 'nearest' as const,
  };

  const hook = renderHook(() =>
    useRouteVrChannelPanels({
      trackSets: [],
      isVrActive: true,
      loadedChannelIds: ['channel-a'],
      channelNameMap: new Map<string, string>(),
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLayer('layer-a', 'channel-a')]],
      ]),
      channelVisibility: {},
      layerSettings: { 'layer-a': sliceSettings },
      currentLayerVolumes: {},
      createLayerDefaultSettings: () => sliceSettings,
    }),
  );

  assert.equal(hook.result.vrChannelPanels[0]?.layers[0]?.settings.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.vrChannelPanels[0]?.layers[0]?.settings.samplingMode, 'nearest');

  hook.unmount();
})();

console.log('useRouteVrChannelPanels tests passed');
