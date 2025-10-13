import * as THREE from 'three';

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
