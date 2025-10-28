import { DEFAULT_LAYER_COLOR } from '../layerColors';

export type SamplingMode = 'linear' | 'nearest';

export const DEFAULT_CONTRAST_POSITION = 1;
export const DEFAULT_BRIGHTNESS_POSITION = 0;
export const DEFAULT_WINDOW_MIN = 0;
export const DEFAULT_WINDOW_MAX = 1;
export const DEFAULT_RENDER_STYLE = 0;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';
export const MIN_WINDOW_WIDTH = 0.01;
export const MAX_CONTRAST_POSITION = 1 / MIN_WINDOW_WIDTH;

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

export const clampWindowBounds = (
  windowMin: number,
  windowMax: number
): { windowMin: number; windowMax: number } => {
  const clampedMin = Math.max(
    DEFAULT_WINDOW_MIN,
    Math.min(windowMin, DEFAULT_WINDOW_MAX - MIN_WINDOW_WIDTH)
  );
  const clampedMax = Math.max(
    clampedMin + MIN_WINDOW_WIDTH,
    Math.min(windowMax, DEFAULT_WINDOW_MAX)
  );
  return { windowMin: clampedMin, windowMax: clampedMax };
};

export const computeWindowBounds = (
  brightnessPosition: number,
  contrastPosition: number
): { windowMin: number; windowMax: number } => {
  const clampedBrightness = Math.max(-1, Math.min(1, brightnessPosition));
  const slope = Math.max(contrastPosition, 1e-3);
  const defaultCenter = (DEFAULT_WINDOW_MAX + DEFAULT_WINDOW_MIN) / 2;
  const defaultHalfRange = (DEFAULT_WINDOW_MAX - DEFAULT_WINDOW_MIN) / 2;
  const center = Math.max(
    DEFAULT_WINDOW_MIN,
    Math.min(DEFAULT_WINDOW_MAX, defaultCenter + clampedBrightness * defaultHalfRange)
  );
  const halfWidth = Math.max(MIN_WINDOW_WIDTH / 2, Math.min(defaultHalfRange, defaultHalfRange / slope));
  const preliminaryMin = center - halfWidth;
  const preliminaryMax = center + halfWidth;
  return clampWindowBounds(preliminaryMin, preliminaryMax);
};

export const computeControlPositionsFromWindow = (
  windowMin: number,
  windowMax: number
): { brightnessPosition: number; contrastPosition: number } => {
  const { windowMin: clampedMin, windowMax: clampedMax } = clampWindowBounds(windowMin, windowMax);
  const windowWidth = clampedMax - clampedMin;
  const center = clampedMin + windowWidth / 2;
  const defaultCenter = (DEFAULT_WINDOW_MAX + DEFAULT_WINDOW_MIN) / 2;
  const defaultHalfRange = (DEFAULT_WINDOW_MAX - DEFAULT_WINDOW_MIN) / 2;
  const brightnessPosition = Math.max(
    -1,
    Math.min(1, (center - defaultCenter) / defaultHalfRange)
  );
  const slope = Math.max(1, 1 / windowWidth);
  const contrastPosition = Math.max(1, Math.min(MAX_CONTRAST_POSITION, slope));
  return { brightnessPosition, contrastPosition };
};
