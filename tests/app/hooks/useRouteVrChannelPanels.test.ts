import assert from 'node:assert/strict';

import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/useDatasetSetup.ts';
import { createDefaultLayerSettings } from '../../../src/state/layerSettings.ts';
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
      loadedChannelIds: ['channel-a', 'channel-b'],
      channelNameMap: new Map<string, string>([['channel-a', 'Main channel']]),
      channelLayersMap: new Map<string, LoadedDatasetLayer[]>([
        ['channel-a', [createLayer('layer-a', 'channel-a')]],
        ['channel-b', [createLayer('layer-b', 'channel-b', { channels: 2, isSegmentation: true })]],
      ]),
      channelVisibility: { 'channel-a': false },
      channelActiveLayer: { 'channel-a': 'layer-a' },
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
    { id: 'channel-a', name: 'Main channel' },
    { id: 'channel-b', name: 'Untitled channel' },
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

console.log('useRouteVrChannelPanels tests passed');
