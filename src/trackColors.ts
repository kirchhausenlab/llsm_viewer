import * as THREE from 'three';
import { normalizeHexColor } from './layerColors';

export type TrackColorOption = {
  value: string;
  label: string;
};

export const TRACK_COLOR_SWATCHES: readonly TrackColorOption[] = [
  { value: '#FF6B6B', label: 'Red' },
  { value: '#FF9F40', label: 'Orange' },
  { value: '#FFD93D', label: 'Yellow' },
  { value: '#6BCB77', label: 'Green' },
  { value: '#4D96FF', label: 'Blue' },
  { value: '#8E94F2', label: 'Indigo' },
  { value: '#FF6BF1', label: 'Magenta' }
] as const;

export const DEFAULT_TRACK_COLOR = TRACK_COLOR_SWATCHES[0].value;

export function normalizeTrackColor(color: string, fallback: string = DEFAULT_TRACK_COLOR) {
  return normalizeHexColor(color, fallback).toUpperCase();
}

const GOLDEN_ANGLE_DEGREES = 137.508;

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

export function createTrackColor(seed: string | number): THREE.Color {
  const color = new THREE.Color();
  const normalizedSeed = toNumericSeed(seed);
  const hue = ((normalizedSeed * GOLDEN_ANGLE_DEGREES) % 360) / 360;
  color.setHSL(hue, 0.75, 0.55);
  return color;
}

export function getTrackColorHex(seed: string | number): string {
  const color = createTrackColor(seed);
  return `#${color.getHexString()}`;
}
