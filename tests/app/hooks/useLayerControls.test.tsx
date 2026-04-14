import { useState } from 'react';
import assert from 'node:assert/strict';

import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/useDatasetSetup.ts';
import { useLayerControls } from '../../../src/ui/app/hooks/useLayerControls.ts';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
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

const createSegmentationLayer = (key: string, channelId: string): LoadedDatasetLayer => ({
  ...createLayer(key, channelId),
  isSegmentation: true,
  dataType: 'uint16',
});

const defaultLayers = [createLayer('layer-a', 'channel-a'), createLayer('layer-b', 'channel-b')];

function useLayerControlsHarness(
  initialRenderStyle: RenderStyle = RENDER_STYLE_MIP,
  harnessLayers: LoadedDatasetLayer[] = defaultLayers,
  initialSamplingMode: SamplingMode = 'linear',
) {
  const sortedChannelIds = [...new Set(harnessLayers.map((layer) => layer.channelId))];
  const channelNameEntries = sortedChannelIds.map((channelId) => [channelId, channelId]) as Array<[string, string]>;
  const layerChannelEntries = harnessLayers.map((layer) => [layer.key, layer.channelId]) as Array<[string, string]>;
  const [layerSettings, setLayerSettings] = useState<Record<string, LayerSettings>>(() => ({
    [harnessLayers[0]?.key ?? 'layer-a']: {
      ...createDefaultLayerSettings(),
      renderStyle: initialRenderStyle,
      samplingMode: initialSamplingMode,
    },
    ...Object.fromEntries(
      harnessLayers.slice(1).map((layer) => [layer.key, createDefaultLayerSettings()]),
    ),
  }));
  const [layerAutoThresholds, setLayerAutoThresholds] = useState<Record<string, number>>(
    () => Object.fromEntries(harnessLayers.map((layer) => [layer.key, 0])),
  );
  const [channelVisibility, setChannelVisibility] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sortedChannelIds.map((channelId) => [channelId, true])),
  );
  const [activeChannelTabId, setActiveChannelTabId] = useState<string | null>(sortedChannelIds[0] ?? null);
  const [globalSamplingMode, setGlobalSamplingMode] = useState<SamplingMode>(initialSamplingMode);
  const [globalBlDensityScale, setGlobalBlDensityScale] = useState(1);
  const [globalBlBackgroundCutoff, setGlobalBlBackgroundCutoff] = useState(0.08);
  const [globalBlOpacityScale, setGlobalBlOpacityScale] = useState(1);
  const [globalBlEarlyExitAlpha, setGlobalBlEarlyExitAlpha] = useState(0.98);
  const [globalMipEarlyExitThreshold, setGlobalMipEarlyExitThreshold] = useState(0.999);

  const controls = useLayerControls({
    layers: harnessLayers,
    selectedIndex: 0,
    layerVolumes: {},
    layerPageTables: {},
    layerBrickAtlases: {},
    backgroundMasksByScale: {},
    loadVolume: null,
    layerAutoThresholds,
    setLayerAutoThresholds,
    createLayerDefaultSettings: (_key) => createDefaultLayerSettings(),
    createLayerDefaultBrightnessState: (_key) => brightnessContrastModel.createState(0, 1),
    layerSettings,
    setLayerSettings,
    setChannelVisibility,
    channelVisibility,
    channelNameMap: new Map(channelNameEntries),
    layerChannelMap: new Map(layerChannelEntries),
    loadedChannelIds: sortedChannelIds,
    setActiveChannelTabId,
    setGlobalSamplingMode,
    setGlobalBlDensityScale,
    setGlobalBlBackgroundCutoff,
    setGlobalBlOpacityScale,
    setGlobalBlEarlyExitAlpha,
    setGlobalMipEarlyExitThreshold,
  });

  return {
    controls,
    layerSettings,
    globalSamplingMode,
    globalBlDensityScale,
    globalBlBackgroundCutoff,
    globalBlOpacityScale,
    globalBlEarlyExitAlpha,
    globalMipEarlyExitThreshold,
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
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'linear');

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleChange('layer-a', RENDER_STYLE_MIP, 'nearest');
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'nearest');
  assert.equal(hook.result.globalSamplingMode, 'nearest');

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleChange('layer-a', RENDER_STYLE_ISO);
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_ISO);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'linear');
  assert.equal(hook.result.globalSamplingMode, 'linear');

  hook.act(() => {
    hook.result.controls.handleLayerBlDensityScaleChange('layer-a', 2.4);
    hook.result.controls.handleLayerBlBackgroundCutoffChange('layer-a', 0.2);
    hook.result.controls.handleLayerBlOpacityScaleChange('layer-a', 1.8);
    hook.result.controls.handleLayerBlEarlyExitAlphaChange('layer-a', 0.9);
  });

  assert.equal(hook.result.layerSettings['layer-a']?.blDensityScale, 2.4);
  assert.equal(hook.result.layerSettings['layer-b']?.blDensityScale, 2.4);
  assert.equal(hook.result.layerSettings['layer-a']?.blBackgroundCutoff, 0.2);
  assert.equal(hook.result.layerSettings['layer-b']?.blBackgroundCutoff, 0.2);
  assert.equal(hook.result.layerSettings['layer-a']?.blOpacityScale, 1.8);
  assert.equal(hook.result.layerSettings['layer-b']?.blOpacityScale, 1.8);
  assert.equal(hook.result.layerSettings['layer-a']?.blEarlyExitAlpha, 0.9);
  assert.equal(hook.result.layerSettings['layer-b']?.blEarlyExitAlpha, 0.9);
  assert.equal(hook.result.globalBlDensityScale, 2.4);
  assert.equal(hook.result.globalBlBackgroundCutoff, 0.2);
  assert.equal(hook.result.globalBlOpacityScale, 1.8);
  assert.equal(hook.result.globalBlEarlyExitAlpha, 0.9);

  hook.act(() => {
    hook.result.controls.handleLayerMipEarlyExitThresholdChange('layer-b', 0.77);
  });
  assert.equal(hook.result.layerSettings['layer-a']?.mipEarlyExitThreshold, 0.77);
  assert.equal(hook.result.layerSettings['layer-b']?.mipEarlyExitThreshold, 0.77);
  assert.equal(hook.result.globalMipEarlyExitThreshold, 0.77);

  hook.unmount();
})();

(() => {
  const hook = renderHook(() => useLayerControlsHarness(RENDER_STYLE_MIP));

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle('layer-a');
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'nearest');

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_ISO);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'linear');
  assert.equal(hook.result.layerSettings['layer-b']?.renderStyle, RENDER_STYLE_MIP);

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_BL);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'linear');

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_SLICE);

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-a']?.renderStyle, RENDER_STYLE_MIP);
  assert.equal(hook.result.layerSettings['layer-a']?.samplingMode, 'linear');
  assert.equal(hook.result.layerSettings['layer-b']?.renderStyle, RENDER_STYLE_MIP);

  hook.unmount();
})();

(() => {
  const segmentationLayers = [
    createSegmentationLayer('layer-seg', 'channel-a'),
    createLayer('layer-raw', 'channel-b'),
  ];
  const hook = renderHook(() => useLayerControlsHarness(RENDER_STYLE_MIP, segmentationLayers, 'nearest'));

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleChange('layer-seg', RENDER_STYLE_MIP);
  });
  assert.equal(hook.result.layerSettings['layer-seg']?.samplingMode, 'linear');
  assert.equal(hook.result.globalSamplingMode, 'linear');

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle('layer-seg');
  });
  assert.equal(hook.result.layerSettings['layer-seg']?.renderStyle, RENDER_STYLE_SLICE);

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle('layer-seg');
  });
  assert.equal(hook.result.layerSettings['layer-seg']?.renderStyle, RENDER_STYLE_MIP);

  hook.act(() => {
    hook.result.controls.handleLayerRenderStyleToggle();
  });
  assert.equal(hook.result.layerSettings['layer-seg']?.renderStyle, RENDER_STYLE_SLICE);
  assert.equal(hook.result.layerSettings['layer-raw']?.renderStyle, RENDER_STYLE_MIP);

  hook.unmount();
})();

console.log('useLayerControls tests passed');
