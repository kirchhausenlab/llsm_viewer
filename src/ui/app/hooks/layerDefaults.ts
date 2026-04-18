import { computeAutoWindow } from '../../../autoContrast';
import { isIntensityVolume, type NormalizedVolume } from '../../../core/volumeProcessing';
import { DEFAULT_LAYER_COLOR } from '../../../shared/colorMaps/layerColors';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import {
  brightnessContrastModel,
  clampWindowBounds,
  createDefaultLayerSettings,
  DEFAULT_RENDER_STYLE,
  RENDER_STYLE_ISO,
  resolveLayerSamplingMode,
  type BrightnessContrastState,
  type LayerSettings,
  type SamplingMode
} from '../../../state/layerSettings';

type LayerDefaultSettingsOptions = {
  layer: LoadedDatasetLayer | null;
  getChannelDefaultColor: (channelId: string) => string;
  globalSamplingMode: SamplingMode;
  globalBlDensityScale: number;
  globalBlBackgroundCutoff: number;
  globalBlOpacityScale: number;
  globalBlEarlyExitAlpha: number;
  globalMipEarlyExitThreshold: number;
};

type LayerBrightnessStateFields = Pick<
  BrightnessContrastState,
  | 'sliderRange'
  | 'windowMin'
  | 'windowMax'
  | 'minSliderIndex'
  | 'maxSliderIndex'
  | 'brightnessSliderIndex'
  | 'contrastSliderIndex'
>;

export function createVolumeDerivedBrightnessState(
  volume: NormalizedVolume | null | undefined
): {
  autoThreshold: number;
  brightnessState: BrightnessContrastState;
} {
  if (!volume || !isIntensityVolume(volume)) {
    return {
      autoThreshold: 0,
      brightnessState: brightnessContrastModel.createState()
    };
  }

  const { windowMin, windowMax, nextThreshold } = computeAutoWindow(volume);
  const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);

  return {
    autoThreshold: nextThreshold,
    brightnessState: brightnessContrastModel.createState(clampedMin, clampedMax)
  };
}

export function layerBrightnessStatesMatch(
  left: LayerBrightnessStateFields,
  right: LayerBrightnessStateFields
): boolean {
  return (
    left.sliderRange === right.sliderRange &&
    left.windowMin === right.windowMin &&
    left.windowMax === right.windowMax &&
    left.minSliderIndex === right.minSliderIndex &&
    left.maxSliderIndex === right.maxSliderIndex &&
    left.brightnessSliderIndex === right.brightnessSliderIndex &&
    left.contrastSliderIndex === right.contrastSliderIndex
  );
}

export function createLayerDefaultSettingsFromLayer({
  layer,
  getChannelDefaultColor,
  globalSamplingMode,
  globalBlDensityScale,
  globalBlBackgroundCutoff,
  globalBlOpacityScale,
  globalBlEarlyExitAlpha,
  globalMipEarlyExitThreshold
}: LayerDefaultSettingsOptions): LayerSettings {
  const defaultColor =
    layer?.isSegmentation === true
      ? DEFAULT_LAYER_COLOR
      : getChannelDefaultColor(layer?.channelId ?? '');
  const defaultRenderStyle =
    layer?.isBinaryLike && layer.isSegmentation !== true
      ? RENDER_STYLE_ISO
      : DEFAULT_RENDER_STYLE;

  return {
    ...createDefaultLayerSettings(),
    color: defaultColor,
    renderStyle: defaultRenderStyle,
    samplingMode: resolveLayerSamplingMode(
      defaultRenderStyle,
      globalSamplingMode,
      layer?.isSegmentation === true
    ),
    blDensityScale: globalBlDensityScale,
    blBackgroundCutoff: globalBlBackgroundCutoff,
    blOpacityScale: globalBlOpacityScale,
    blEarlyExitAlpha: globalBlEarlyExitAlpha,
    mipEarlyExitThreshold: globalMipEarlyExitThreshold
  };
}

export function createLayerDefaultSettingsRecord({
  layers,
  getChannelDefaultColor,
  globalSamplingMode,
  globalBlDensityScale,
  globalBlBackgroundCutoff,
  globalBlOpacityScale,
  globalBlEarlyExitAlpha,
  globalMipEarlyExitThreshold
}: {
  layers: ReadonlyArray<LoadedDatasetLayer>;
  getChannelDefaultColor: (channelId: string) => string;
  globalSamplingMode: SamplingMode;
  globalBlDensityScale: number;
  globalBlBackgroundCutoff: number;
  globalBlOpacityScale: number;
  globalBlEarlyExitAlpha: number;
  globalMipEarlyExitThreshold: number;
}): Record<string, LayerSettings> {
  return Object.fromEntries(
    layers.map((layer) => [
      layer.key,
      createLayerDefaultSettingsFromLayer({
        layer,
        getChannelDefaultColor,
        globalSamplingMode,
        globalBlDensityScale,
        globalBlBackgroundCutoff,
        globalBlOpacityScale,
        globalBlEarlyExitAlpha,
        globalMipEarlyExitThreshold
      })
    ])
  );
}

export function createLayerAutoThresholdRecord(
  layers: ReadonlyArray<LoadedDatasetLayer>
): Record<string, number> {
  return Object.fromEntries(layers.map((layer) => [layer.key, 0]));
}
