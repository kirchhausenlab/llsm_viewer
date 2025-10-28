import { DEFAULT_LAYER_COLOR } from '../layerColors';

export type SamplingMode = 'linear' | 'nearest';

export const DEFAULT_CONTRAST_POSITION = 1;
export const DEFAULT_BRIGHTNESS_POSITION = 0;
export const DEFAULT_WINDOW_MIN = 0;
export const DEFAULT_WINDOW_MAX = 1;
export const DEFAULT_RENDER_STYLE = 0;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';
export const MIN_WINDOW_WIDTH = 0.01;

export type LayerSettings = {
  contrastPosition: number;
  brightnessPosition: number;
  windowMin: number;
  windowMax: number;
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: 0 | 1;
  invert: boolean;
  samplingMode: SamplingMode;
};

export const createDefaultLayerSettings = (): LayerSettings => ({
  contrastPosition: DEFAULT_CONTRAST_POSITION,
  brightnessPosition: DEFAULT_BRIGHTNESS_POSITION,
  windowMin: DEFAULT_WINDOW_MIN,
  windowMax: DEFAULT_WINDOW_MAX,
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0,
  renderStyle: DEFAULT_RENDER_STYLE,
  invert: false,
  samplingMode: DEFAULT_SAMPLING_MODE
});

export const computeWindowBounds = (
  brightnessPosition: number,
  contrastPosition: number
): { windowMin: number; windowMax: number } => {
  const clampedBrightness = Math.max(-1, Math.min(1, brightnessPosition));
  const safeContrast = Math.max(contrastPosition, 1e-3);
  const center = Math.max(0, Math.min(1, 0.5 + clampedBrightness * 0.5));
  const windowWidth = Math.max(MIN_WINDOW_WIDTH, Math.min(1, 1 / safeContrast));
  let windowMin = center - windowWidth / 2;
  let windowMax = center + windowWidth / 2;

  if (windowMin < 0) {
    const offset = -windowMin;
    windowMin = 0;
    windowMax = Math.min(1, windowMax + offset);
  }

  if (windowMax > 1) {
    const offset = windowMax - 1;
    windowMax = 1;
    windowMin = Math.max(0, windowMin - offset);
  }

  return { windowMin, windowMax };
};
