import { useState } from 'react';
import assert from 'node:assert/strict';

import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/useDatasetSetup.ts';
import { useLayerControls } from '../../../src/ui/app/hooks/useLayerControls.ts';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  createDefaultLayerSettings,
  brightnessContrastModel,
  type LayerSettings,
  type RenderStyle,
  type SamplingMode
} from '../../../src/state/layerSettings.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useLayerControls tests');

const createLayer = (key: string, channelId: string): LoadedDatasetLayer => ({
  key,
  label: key,
  channelId,
  isSegmentation: false,
  volumeCount: 1,
  width: 6,
  height: 5,
  depth: 4,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
});

const layers = [createLayer('layer-a', 'channel-a'), createLayer('layer-b', 'channel-b')];

function useLayerControlsHarness(initialRenderStyle: RenderStyle = RENDER_STYLE_MIP) {
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>(() => ({
    'layer-a': { ...createDefaultLayerSettings(), renderStyle: initialRenderStyle },
    'layer-b': createDefaultLayerSettings(),
  }));
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>({
    'layer-a': 0,
    'layer-b': 0,
  });
  const [channelActiveLayer, setChannelActiveLayer] = useState<Record<string, string>>({
    'channel-a': 'layer-a',
    'channel-b': 'layer-b',
  });
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>({
    'channel-a': true,
    'channel-b': true,
  });
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>('channel-a');
  const [globalRenderStyle, setGlobalRenderStyle] = useState<RenderStyle>(RENDER_STYLE_MIP);
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>('linear');

  const controls = useLayerControls({
    layers,
    selectedIndex: 0,
    layerVolumes: {},
    layerPageTables: {},
    layerBrickAtlases: {},
    loadVolume: null,
    layerAutoThresholds,
    setLayerAutoThresholds,
    createLayerDefaultSettings: (_key) => createDefaultLayerSettings(),
    createLayerDefaultBrightnessState: (_key) => brightnessContrastModel.createState(0, 1),
    layerSettings,
    setLayerSettings,
    setChannelActiveLayer,
    setChannelVisibility,
    channelVisibility,
    channelActiveLayer,
    channelNameMap: new Map([
      ['channel-a', 'Channel A'],
      ['channel-b', 'Channel B'],
    ]),
    layerChannelMap: new Map([
      ['layer-a', 'channel-a'],
      ['layer-b', 'channel-b'],
    ]),
    loadedChannelIds: ['channel-a', 'channel-b'],
    setActiveChannelTabId,
    setGlobalRenderStyle,
    setGlobalSamplingMode,
  });

  return {
    controls,
    layerSettings,
    globalRenderStyle,
    globalSamplingMode,
    activeChannelTabId,
  };
}

(() => {
  const hook = renderHook(() => useLayerControlsHarness());

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleChange('layer-a', RENDER_STYLE_BL);
  });

  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_BL);
  assert.equal(hook.result.layerSettings['layer-b']?.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.globalRenderStyle, RENDER_STYLE_BL);

  hook.act(() => {
    hook.result.controls.handleLayerBlDensityScaleChange('layer-a', 2.4);
    hook.result.controls.handleLayerBlBackgroundCutoffChange('layer-a', 0.2);
    hook.result.controls.handleLayerBlOpacityScaleChange('layer-a', 1.8);
    hook.result.controls.handleLayerBlEarlyExitAlphaChange('layer-a', 0.9);
  });

  assert.equal(hook.result.layerSettings['layer-a']?.blDensityScale, 2.4);
  assert.equal(hook.result.layerSettings['layer-a']?.blBackgroundCutoff, 0.2);
  assert.equal(hook.result.layerSettings['layer-a']?.blOpacityScale, 1.8);
  assert.equal(hook.result.layerSettings['layer-a']?.blEarlyExitAlpha, 0.9);

  hook.unmount();
})();

(() => {
  const hook = renderHook(() => useLayerControlsHarness(RENDER_STYLE_ISO));

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle('layer-a');
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_BL);

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.layerSettings['layer-b']?.renderStyle, RENDER_STYLE_MIP);

  hook.unmount();
})();

console.log('useLayerControls tests passed');
