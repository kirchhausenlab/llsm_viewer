import { DEFAULT_LAYER_COLOR } from '../layerColors';

export type SamplingMode = 'linear' | 'nearest';

export const DEFAULT_CONTRAST_POSITION = 1;
export const DEFAULT_BRIGHTNESS_POSITION = 0;
export const DEFAULT_WINDOW_MIN = 0;
export const DEFAULT_WINDOW_MAX = 1;
export const DEFAULT_WINDOW_RANGE = DEFAULT_WINDOW_MAX - DEFAULT_WINDOW_MIN;
export const DEFAULT_RENDER_STYLE = 0;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';
export const MIN_WINDOW_WIDTH = 0.0001;
export const MAX_CONTRAST_POSITION = DEFAULT_WINDOW_RANGE / MIN_WINDOW_WIDTH;
export const CONTRAST_SLIDER_MIN = Math.log(DEFAULT_CONTRAST_POSITION);
export const CONTRAST_SLIDER_MAX = Math.log(MAX_CONTRAST_POSITION);
export const CONTRAST_SLIDER_STEP = 0.02;

export const toContrastSliderValue = (contrastPosition: number): number => {
  const clamped = Math.max(1, Math.min(MAX_CONTRAST_POSITION, contrastPosition));
  return Math.log(clamped);
};

export const fromContrastSliderValue = (sliderValue: number): number => {
  const clamped = Math.max(CONTRAST_SLIDER_MIN, Math.min(CONTRAST_SLIDER_MAX, sliderValue));
  return Math.exp(clamped);
};

export const formatContrastMultiplier = (value: number): string => {
  const clamped = Math.max(1, Math.min(MAX_CONTRAST_POSITION, value));
  if (clamped >= 100) {
    return clamped.toFixed(0);
  }
  if (clamped >= 10) {
    return clamped.toFixed(1);
  }
  return clamped.toFixed(2);
};

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

const clampWindowValue = (value: number): number =>
  Math.max(DEFAULT_WINDOW_MIN, Math.min(DEFAULT_WINDOW_MAX, value));

export const clampWindowBounds = (
  windowMin: number,
  windowMax: number
): { windowMin: number; windowMax: number } => {
  const orderedMin = Math.min(windowMin, windowMax);
  const orderedMax = Math.max(windowMin, windowMax);
  const clampedMin = clampWindowValue(orderedMin);
  const clampedMax = clampWindowValue(orderedMax);
  const span = clampedMax - clampedMin;
  if (span >= MIN_WINDOW_WIDTH) {
    return { windowMin: clampedMin, windowMax: clampedMax };
  }
  const halfWidth = MIN_WINDOW_WIDTH / 2;
  const minCenter = DEFAULT_WINDOW_MIN + halfWidth;
  const maxCenter = DEFAULT_WINDOW_MAX - halfWidth;
  const center = Math.max(
    minCenter,
    Math.min(maxCenter, (clampedMin + clampedMax) / 2)
  );
  return { windowMin: center - halfWidth, windowMax: center + halfWidth };
};

export const computeWindowBounds = (
  brightnessPosition: number,
  contrastPosition: number
): { windowMin: number; windowMax: number } => {
  const clampedBrightness = Math.max(-1, Math.min(1, brightnessPosition));
  const clampedContrast = Math.max(1, Math.min(MAX_CONTRAST_POSITION, contrastPosition));
  const width = Math.max(MIN_WINDOW_WIDTH, DEFAULT_WINDOW_RANGE / clampedContrast);
  const halfWidth = width / 2;
  const minCenter = DEFAULT_WINDOW_MIN + halfWidth;
  const maxCenter = DEFAULT_WINDOW_MAX - halfWidth;
  const normalizedBrightness = (clampedBrightness + 1) / 2;
  const center = minCenter + normalizedBrightness * (maxCenter - minCenter);
  const windowMin = center - halfWidth;
  const windowMax = center + halfWidth;
  return {
    windowMin,
    windowMax
  };
};

export const computeControlPositionsFromWindow = (
  windowMin: number,
  windowMax: number
): { brightnessPosition: number; contrastPosition: number } => {
  const orderedMin = Math.min(windowMin, windowMax);
  const orderedMax = Math.max(windowMin, windowMax);
  const clampedMin = clampWindowValue(orderedMin);
  const clampedMax = clampWindowValue(orderedMax);
  const windowWidth = clampedMax - clampedMin;
  const effectiveWidth = Math.max(windowWidth, MIN_WINDOW_WIDTH);
  const halfWidth = effectiveWidth / 2;
  const minCenter = DEFAULT_WINDOW_MIN + halfWidth;
  const maxCenter = DEFAULT_WINDOW_MAX - halfWidth;
  const rawCenter = clampedMin + windowWidth / 2;
  const center = Math.max(minCenter, Math.min(maxCenter, rawCenter));
  const brightnessPosition =
    maxCenter > minCenter
      ? Math.max(
          -1,
          Math.min(1, ((center - minCenter) / (maxCenter - minCenter)) * 2 - 1)
        )
      : 0;
  const contrastPosition = Math.max(
    1,
    Math.min(MAX_CONTRAST_POSITION, DEFAULT_WINDOW_RANGE / effectiveWidth)
  );
  return { brightnessPosition, contrastPosition };
};
