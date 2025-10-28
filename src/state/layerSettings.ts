import { DEFAULT_LAYER_COLOR } from '../layerColors';

export type SamplingMode = 'linear' | 'nearest';

export const DEFAULT_CONTRAST = 1;
export const DEFAULT_GAMMA = 1;
export const DEFAULT_BRIGHTNESS = 0;
export const DEFAULT_RENDER_STYLE = 0;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';

export type LayerSettings = {
  contrast: number;
  gamma: number;
  brightness: number;
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: 0 | 1;
  invert: boolean;
  samplingMode: SamplingMode;
};

export const createDefaultLayerSettings = (): LayerSettings => ({
  contrast: DEFAULT_CONTRAST,
  gamma: DEFAULT_GAMMA,
  brightness: DEFAULT_BRIGHTNESS,
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0,
  renderStyle: DEFAULT_RENDER_STYLE,
  invert: false,
  samplingMode: DEFAULT_SAMPLING_MODE
});
