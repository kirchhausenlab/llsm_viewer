import type { Dispatch, SetStateAction } from 'react';
import { DEFAULT_LAYER_COLOR } from '../shared/colorMaps/layerColors';
import {
  DEFAULT_BRIGHTNESS_CONTRAST_MODEL,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  MIN_WINDOW_WIDTH,
  type BrightnessContrastState,
  type WindowBounds
} from './brightnessContrastModel';

export type { BrightnessContrastState } from './brightnessContrastModel';
export { DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX, MIN_WINDOW_WIDTH } from './brightnessContrastModel';

export type SamplingMode = 'linear' | 'nearest';

export const RENDER_STYLE_MIP = 0 as const;
export const RENDER_STYLE_ISO = 1 as const;
export const RENDER_STYLE_BL = 2 as const;

export type RenderStyle = typeof RENDER_STYLE_MIP | typeof RENDER_STYLE_ISO | typeof RENDER_STYLE_BL;

export const DEFAULT_RENDER_STYLE: RenderStyle = RENDER_STYLE_MIP;
export const DEFAULT_SAMPLING_MODE: SamplingMode = 'linear';
export const DEFAULT_BL_DENSITY_SCALE = 1.0;
export const DEFAULT_BL_BACKGROUND_CUTOFF = 0.08;
export const DEFAULT_BL_OPACITY_SCALE = 1.0;
export const DEFAULT_BL_EARLY_EXIT_ALPHA = 0.98;

export type LayerSettings = BrightnessContrastState & {
  color: string;
  xOffset: number;
  yOffset: number;
  renderStyle: RenderStyle;
  blDensityScale: number;
  blBackgroundCutoff: number;
  blOpacityScale: number;
  blEarlyExitAlpha: number;
  invert: boolean;
  samplingMode: SamplingMode;
};

export const createDefaultLayerSettings = (initialWindow?: WindowBounds | null): LayerSettings => ({
  ...DEFAULT_BRIGHTNESS_CONTRAST_MODEL.createState(
    initialWindow?.windowMin,
    initialWindow?.windowMax
  ),
  color: DEFAULT_LAYER_COLOR,
  xOffset: 0,
  yOffset: 0,
  renderStyle: DEFAULT_RENDER_STYLE,
  blDensityScale: DEFAULT_BL_DENSITY_SCALE,
  blBackgroundCutoff: DEFAULT_BL_BACKGROUND_CUTOFF,
  blOpacityScale: DEFAULT_BL_OPACITY_SCALE,
  blEarlyExitAlpha: DEFAULT_BL_EARLY_EXIT_ALPHA,
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

const layerSettingsChanged = (
  previous: LayerSettings,
  next: BrightnessContrastState
): boolean => {
  return (
    previous.windowMin !== next.windowMin ||
    previous.windowMax !== next.windowMax ||
    previous.contrastSliderIndex !== next.contrastSliderIndex ||
    previous.brightnessSliderIndex !== next.brightnessSliderIndex ||
    previous.minSliderIndex !== next.minSliderIndex ||
    previous.maxSliderIndex !== next.maxSliderIndex
  );
};

export const updateLayerSettings = (
  key: string,
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>,
  createLayerDefaultSettings: (key: string) => LayerSettings,
  updater: (args: {
    previous: LayerSettings;
    brightnessContrastModel: typeof DEFAULT_BRIGHTNESS_CONTRAST_MODEL;
  }) => BrightnessContrastState | null
): void => {
  setLayerSettings((current) => {
    const previous = current[key] ?? createLayerDefaultSettings(key);
    const updated = updater({ previous, brightnessContrastModel: DEFAULT_BRIGHTNESS_CONTRAST_MODEL });
    if (!updated || !layerSettingsChanged(previous, updated)) {
      return current;
    }
    return {
      ...current,
      [key]: {
        ...previous,
        ...updated
      }
    };
  });
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
