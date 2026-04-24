import {
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  resolveIntensityRenderModeConfig,
  resolveIntensityRenderModeValue,
  resolveLayerSamplingMode,
  type IntensityRenderModeValue,
  type LayerSettings,
  type RenderStyle,
  type SamplingMode,
} from '../../state/layerSettings';

type VrCompatibleRenderStyle = {
  renderStyle: RenderStyle;
  samplingMode: SamplingMode;
};

function resolveVrFallbackIntensityMode(samplingMode: SamplingMode): IntensityRenderModeValue {
  return samplingMode === 'nearest' ? 'mip-v' : 'mip';
}

export function resolveVrCompatibleRenderStyle(
  settings: Pick<LayerSettings, 'renderStyle' | 'samplingMode'>,
  isSegmentation: boolean,
): VrCompatibleRenderStyle {
  if (settings.renderStyle !== RENDER_STYLE_SLICE) {
    return {
      renderStyle: settings.renderStyle,
      samplingMode: resolveLayerSamplingMode(settings.renderStyle, settings.samplingMode, isSegmentation),
    };
  }

  if (isSegmentation) {
    return {
      renderStyle: RENDER_STYLE_MIP,
      samplingMode: resolveLayerSamplingMode(RENDER_STYLE_MIP, settings.samplingMode, true),
    };
  }

  const nextConfig = resolveIntensityRenderModeConfig(
    resolveVrFallbackIntensityMode(settings.samplingMode),
  );
  return {
    renderStyle: nextConfig.renderStyle,
    samplingMode: resolveLayerSamplingMode(nextConfig.renderStyle, nextConfig.samplingMode, false),
  };
}

export function normalizeLayerSettingsForVr(
  settings: LayerSettings,
  isSegmentation: boolean,
): LayerSettings {
  const compatible = resolveVrCompatibleRenderStyle(settings, isSegmentation);
  if (
    compatible.renderStyle === settings.renderStyle &&
    compatible.samplingMode === settings.samplingMode
  ) {
    return settings;
  }

  return {
    ...settings,
    renderStyle: compatible.renderStyle,
    samplingMode: compatible.samplingMode,
  };
}

export function getNextVrCompatibleRenderStyle(
  settings: Pick<LayerSettings, 'renderStyle' | 'samplingMode'>,
  isSegmentation: boolean,
): VrCompatibleRenderStyle | null {
  if (isSegmentation) {
    return null;
  }

  const compatible = resolveVrCompatibleRenderStyle(settings, false);
  const currentMode = resolveIntensityRenderModeValue(
    compatible.renderStyle,
    compatible.samplingMode,
  );

  let nextMode: IntensityRenderModeValue;
  if (currentMode === 'mip') {
    nextMode = 'mip-v';
  } else if (currentMode === 'mip-v') {
    nextMode = 'iso';
  } else if (currentMode === 'iso') {
    nextMode = 'bl';
  } else {
    nextMode = 'mip';
  }

  const nextConfig = resolveIntensityRenderModeConfig(nextMode);
  return {
    renderStyle: nextConfig.renderStyle,
    samplingMode: resolveLayerSamplingMode(nextConfig.renderStyle, nextConfig.samplingMode, false),
  };
}
