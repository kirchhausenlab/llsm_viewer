import assert from 'node:assert/strict';

import {
  createLayerAutoThresholdRecord,
  createVolumeDerivedBrightnessState,
  createLayerDefaultSettingsFromLayer,
  createLayerDefaultSettingsRecord,
  layerBrightnessStatesMatch
} from '../../../src/ui/app/hooks/layerDefaults.ts';
import type { LoadedDatasetLayer } from '../../../src/hooks/dataset/useDatasetSetup.ts';
import { DEFAULT_LAYER_COLOR } from '../../../src/shared/colorMaps/layerColors.ts';
import type { IntensityVolume } from '../../../src/core/volumeProcessing.ts';
import { DEFAULT_RENDER_STYLE, brightnessContrastModel } from '../../../src/state/layerSettings.ts';

console.log('Starting layerDefaults tests');

const createLoadedLayer = (
  key: string,
  channelId: string,
  isSegmentation = false
): LoadedDatasetLayer => ({
  key,
  label: key,
  channelId,
  isSegmentation,
  volumeCount: 1,
  width: 8,
  height: 6,
  depth: 4,
  channels: 1,
  dataType: isSegmentation ? 'uint16' : 'uint8',
  min: 0,
  max: isSegmentation ? 42 : 255
});

(() => {
  const layer = createLoadedLayer('layer-a', 'channel-a', false);
  const settings = createLayerDefaultSettingsFromLayer({
    layer,
    getChannelDefaultColor: (channelId) => (channelId === 'channel-a' ? '#123456' : '#abcdef'),
    globalSamplingMode: 'nearest',
    globalBlDensityScale: 2,
    globalBlBackgroundCutoff: 0.2,
    globalBlOpacityScale: 1.5,
    globalBlEarlyExitAlpha: 0.85,
    globalMipEarlyExitThreshold: 0.77
  });

  assert.equal(settings.renderStyle, DEFAULT_RENDER_STYLE);
  assert.equal(settings.color, '#123456');
  assert.equal(settings.samplingMode, 'nearest');
  assert.equal(settings.blDensityScale, 2);
  assert.equal(settings.blBackgroundCutoff, 0.2);
  assert.equal(settings.blOpacityScale, 1.5);
  assert.equal(settings.blEarlyExitAlpha, 0.85);
  assert.equal(settings.mipEarlyExitThreshold, 0.77);
})();

(() => {
  const layer = createLoadedLayer('layer-seg', 'channel-b', true);
  const settings = createLayerDefaultSettingsFromLayer({
    layer,
    getChannelDefaultColor: () => '#ff0000',
    globalSamplingMode: 'nearest',
    globalBlDensityScale: 1,
    globalBlBackgroundCutoff: 0.08,
    globalBlOpacityScale: 1,
    globalBlEarlyExitAlpha: 0.98,
    globalMipEarlyExitThreshold: 0.999
  });

  assert.equal(settings.color, DEFAULT_LAYER_COLOR);
  assert.equal(settings.samplingMode, 'linear');
})();

(() => {
  const layers = [
    createLoadedLayer('layer-a', 'channel-a'),
    createLoadedLayer('layer-b', 'channel-b', true)
  ];
  const settingsRecord = createLayerDefaultSettingsRecord({
    layers,
    getChannelDefaultColor: (channelId) => (channelId === 'channel-a' ? '#0f0f0f' : '#f0f0f0'),
    globalSamplingMode: 'linear',
    globalBlDensityScale: 1.2,
    globalBlBackgroundCutoff: 0.12,
    globalBlOpacityScale: 1.3,
    globalBlEarlyExitAlpha: 0.91,
    globalMipEarlyExitThreshold: 0.88
  });
  const thresholds = createLayerAutoThresholdRecord(layers);

  assert.deepEqual(Object.keys(settingsRecord).sort(), ['layer-a', 'layer-b']);
  assert.equal(settingsRecord['layer-a']?.color, '#0f0f0f');
  assert.equal(settingsRecord['layer-b']?.color, DEFAULT_LAYER_COLOR);
  assert.deepEqual(thresholds, { 'layer-a': 0, 'layer-b': 0 });
})();

(() => {
  const histogram = new Uint32Array(256);
  for (let index = 10; index <= 200; index += 10) {
    histogram[index] = 5;
  }
  const volume: IntensityVolume = {
    kind: 'intensity',
    width: 1000,
    height: 1,
    depth: 1,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(1000),
    histogram,
    min: 0,
    max: 255
  };

  const { autoThreshold, brightnessState } = createVolumeDerivedBrightnessState(volume);
  const defaultState = brightnessContrastModel.createState();

  assert.equal(autoThreshold, 10000);
  assert.equal(brightnessState.windowMin, 10 / 255);
  assert.equal(brightnessState.windowMax, 200 / 255);
  assert.equal(layerBrightnessStatesMatch(brightnessState, defaultState), false);
})();

console.log('layerDefaults tests passed');
