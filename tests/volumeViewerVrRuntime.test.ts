import assert from 'node:assert/strict';

import { resolveVolumeViewerVrRuntime } from '../src/components/viewers/volume-viewer/volumeViewerVrRuntime.ts';

console.log('Starting volume viewer VR runtime helper tests');

(() => {
  const runtime = resolveVolumeViewerVrRuntime(undefined);
  assert.strictEqual(runtime.isVrPassthroughSupported, false);
  assert.deepStrictEqual(runtime.trackChannels, []);
  assert.strictEqual(runtime.activeTrackChannelId, null);
  assert.deepStrictEqual(runtime.channelPanels, []);
  assert.strictEqual(runtime.activeChannelPanelId, null);
  assert.strictEqual(runtime.onRegisterVrSession, undefined);
})();

(() => {
  const onRegisterVrSession = () => {};
  const runtime = resolveVolumeViewerVrRuntime({
    isVrPassthroughSupported: true,
    trackChannels: [{ id: 'channel-a', name: 'A' }],
    activeTrackChannelId: 'channel-a',
    onTrackChannelSelect: () => {},
    onTrackVisibilityToggle: () => {},
    onTrackVisibilityAllChange: () => {},
    onTrackOpacityChange: () => {},
    onTrackLineWidthChange: () => {},
    onTrackColorSelect: () => {},
    onTrackColorReset: () => {},
    onStopTrackFollow: () => {},
    channelPanels: [
      {
        id: 'panel-a',
        name: 'Panel A',
        visible: true,
        activeLayerKey: null,
        layers: [],
      },
    ],
    activeChannelPanelId: 'panel-a',
    onChannelPanelSelect: () => {},
    onChannelVisibilityToggle: () => {},
    onChannelReset: () => {},
    onChannelLayerSelect: () => {},
    onLayerContrastChange: () => {},
    onLayerBrightnessChange: () => {},
    onLayerWindowMinChange: () => {},
    onLayerWindowMaxChange: () => {},
    onLayerAutoContrast: () => {},
    onLayerOffsetChange: () => {},
    onLayerColorChange: () => {},
    onLayerRenderStyleToggle: () => {},
    onLayerSamplingModeToggle: () => {},
    onLayerInvertToggle: () => {},
    onRegisterVrSession,
  });

  assert.strictEqual(runtime.isVrPassthroughSupported, true);
  assert.deepStrictEqual(runtime.trackChannels, [{ id: 'channel-a', name: 'A' }]);
  assert.strictEqual(runtime.activeTrackChannelId, 'channel-a');
  assert.strictEqual(runtime.channelPanels.length, 1);
  assert.strictEqual(runtime.activeChannelPanelId, 'panel-a');
  assert.strictEqual(runtime.onRegisterVrSession, onRegisterVrSession);
})();

console.log('volume viewer VR runtime helper tests passed');
