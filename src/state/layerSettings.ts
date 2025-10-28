import { DEFAULT_LAYER_COLOR } from '../layerColors';
import {
  DEFAULT_BRIGHTNESS_CONTRAST_MODEL,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  MIN_WINDOW_WIDTH,
  type BrightnessContrastState
} from './brightnessContrastModel';

export type { BrightnessContrastState } from './brightnessContrastModel';
export { DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX, MIN_WINDOW_WIDTH } from './brightnessContrastModel';

export type SamplingMode = 'linear' | 'nearest';

export const DEFAULT_RENDER_STYLE = 0;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';

export type LayerSettings = BrightnessContrastState & {
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: 0 | 1;
  invert: boolean;
  samplingMode: SamplingMode;
};

export const createDefaultLayerSettings = (): LayerSettings => ({
  ...DEFAULT_BRIGHTNESS_CONTRAST_MODEL.createState(),
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0,
  renderStyle: DEFAULT_RENDER_STYLE,
  invert: false,
  samplingMode: DEFAULT_SAMPLING_MODE
});

export const brightnessContrastModel = DEFAULT_BRIGHTNESS_CONTRAST_MODEL;

export const clampWindowBounds = (
  windowMin: number,
  windowMax: number
): { windowMin: number; windowMax: number } => {
  const state = DEFAULT_BRIGHTNESS_CONTRAST_MODEL.applyWindow(windowMin, windowMax);
  return { windowMin: state.windowMin, windowMax: state.windowMax };
};

export const computeContrastMultiplier = (windowMin: number, windowMax: number): number => {
  const width = Math.max(windowMax - windowMin, MIN_WINDOW_WIDTH);
  const defaultRange = Math.max(DEFAULT_WINDOW_MAX - DEFAULT_WINDOW_MIN, MIN_WINDOW_WIDTH);
  if (defaultRange <= 0) {
    return 1;
  }
  return Math.max(1, defaultRange / width);
};

export const formatContrastMultiplier = (multiplier: number): string => {
  const clamped = Math.max(1, multiplier);
  if (clamped >= 100) {
    return clamped.toFixed(0);
  }
  if (clamped >= 10) {
    return clamped.toFixed(1);
  }
  return clamped.toFixed(2);
};
