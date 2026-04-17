import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  type RenderStyle,
} from '../../state/layerSettings';
import type { HoverSettings, HoverType } from '../../types/hover';

export const HOVER_SLIDER_MIN = 0;
export const HOVER_SLIDER_MAX = 100;
export const DEFAULT_HOVER_STRENGTH = 50;
export const DEFAULT_HOVER_RADIUS = 50;

export const DEFAULT_HOVER_SETTINGS: HoverSettings = {
  enabled: true,
  type: 'default',
  strength: DEFAULT_HOVER_STRENGTH,
  radius: DEFAULT_HOVER_RADIUS,
};

export const clampHoverSliderValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return HOVER_SLIDER_MIN;
  }
  return Math.min(HOVER_SLIDER_MAX, Math.max(HOVER_SLIDER_MIN, Math.round(value)));
};

function smoothstep01(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function resolveDefaultHoverSliderScale(value: number, defaultValue: number): number {
  const clampedValue = clampHoverSliderValue(value);
  const clampedDefault = clampHoverSliderValue(defaultValue);

  if (clampedValue === clampedDefault) {
    return 1;
  }

  if (clampedValue < clampedDefault) {
    const range = Math.max(1, clampedDefault - HOVER_SLIDER_MIN);
    return smoothstep01((clampedValue - HOVER_SLIDER_MIN) / range);
  }

  const range = Math.max(1, HOVER_SLIDER_MAX - clampedDefault);
  return 1 + smoothstep01((clampedValue - clampedDefault) / range);
}

export function resolveDefaultHoverStrengthScale(value: number): number {
  return resolveDefaultHoverSliderScale(value, DEFAULT_HOVER_STRENGTH);
}

export function resolveDefaultHoverRadiusScale(value: number): number {
  return resolveDefaultHoverSliderScale(value, DEFAULT_HOVER_RADIUS);
}

export const normalizeHoverSettings = (
  settings: Partial<HoverSettings> | HoverSettings | null | undefined,
): HoverSettings => {
  const nextType = settings?.type === 'crosshair' ? 'crosshair' : 'default';

  return {
    enabled: settings?.enabled ?? DEFAULT_HOVER_SETTINGS.enabled,
    type: nextType,
    strength: clampHoverSliderValue(settings?.strength ?? DEFAULT_HOVER_SETTINGS.strength),
    radius: clampHoverSliderValue(settings?.radius ?? DEFAULT_HOVER_SETTINGS.radius),
  };
};

export const isHoverTypeSupportedForRenderStyle = (
  renderStyle: RenderStyle,
  hoverType: HoverType,
): boolean => {
  if (renderStyle === RENDER_STYLE_MIP || renderStyle === RENDER_STYLE_SLICE) {
    return hoverType === 'default';
  }
  if (renderStyle === RENDER_STYLE_ISO) {
    return hoverType === 'default';
  }
  if (renderStyle === RENDER_STYLE_BL) {
    return hoverType === 'default' || hoverType === 'crosshair';
  }
  return false;
};

export const isHoverEnabledForRenderStyle = (
  renderStyle: RenderStyle,
  hoverSettings: Pick<HoverSettings, 'enabled' | 'type'>,
): boolean => {
  if (!hoverSettings.enabled) {
    return false;
  }
  return isHoverTypeSupportedForRenderStyle(renderStyle, hoverSettings.type);
};
