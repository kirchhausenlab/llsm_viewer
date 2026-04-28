import { normalizeHexColor } from './layerColors';

export type TrackColorOption = {
  value: string;
  label: string;
};

export const TRACK_COLOR_SWATCHES: readonly TrackColorOption[] = [
  { value: '#3B82F6', label: 'Blue' },
  { value: '#22C55E', label: 'Green' },
  { value: '#EF4444', label: 'Red' },
  { value: '#D946EF', label: 'Purple' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#FACC15', label: 'Gold' }
] as const;

export const DEFAULT_TRACK_COLOR = TRACK_COLOR_SWATCHES[0].value;

export function normalizeTrackColor(color: string, fallback: string = DEFAULT_TRACK_COLOR) {
  return normalizeHexColor(color, fallback).toUpperCase();
}

const GOLDEN_ANGLE_DEGREES = 137.508;
const TRACK_COLOR_SATURATION = 0.75;
const TRACK_COLOR_LIGHTNESS = 0.55;

function toNumericSeed(seed: string | number): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(seed) + 1;
  }

  const value = String(seed);
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 131 + value.charCodeAt(index)) >>> 0;
  }
  return (hash % 1000000) + 1;
}

function hueToRgb(p: number, q: number, t: number): number {
  let value = t;
  if (value < 0) {
    value += 1;
  }
  if (value > 1) {
    value -= 1;
  }
  if (value < 1 / 6) {
    return p + (q - p) * 6 * value;
  }
  if (value < 1 / 2) {
    return q;
  }
  if (value < 2 / 3) {
    return p + (q - p) * (2 / 3 - value) * 6;
  }
  return p;
}

function toHexByte(value: number): string {
  const byte = Math.min(255, Math.max(0, Math.round(value * 255)));
  return byte.toString(16).padStart(2, '0');
}

function linearToSrgb(value: number): number {
  return value < 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 0.41666) - 0.055;
}

function createTrackColorHexFromHue(hueDegrees: number): string {
  const hue = (((hueDegrees % 360) + 360) % 360) / 360;
  const q =
    TRACK_COLOR_LIGHTNESS < 0.5
      ? TRACK_COLOR_LIGHTNESS * (1 + TRACK_COLOR_SATURATION)
      : TRACK_COLOR_LIGHTNESS + TRACK_COLOR_SATURATION - TRACK_COLOR_LIGHTNESS * TRACK_COLOR_SATURATION;
  const p = 2 * TRACK_COLOR_LIGHTNESS - q;
  const red = hueToRgb(p, q, hue + 1 / 3);
  const green = hueToRgb(p, q, hue);
  const blue = hueToRgb(p, q, hue - 1 / 3);
  return `#${toHexByte(linearToSrgb(red))}${toHexByte(linearToSrgb(green))}${toHexByte(linearToSrgb(blue))}`.toUpperCase();
}

export function getTrackColorHex(seed: string | number): string {
  const normalizedSeed = toNumericSeed(seed);
  return createTrackColorHexFromHue((normalizedSeed * GOLDEN_ANGLE_DEGREES) % 360);
}
