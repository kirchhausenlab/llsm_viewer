import * as THREE from 'three';

const GOLDEN_ANGLE_DEGREES = 137.508;

export function createTrackColor(trackId: number): THREE.Color {
  const color = new THREE.Color();
  const normalizedId = Math.abs(trackId) + 1;
  const hue = ((normalizedId * GOLDEN_ANGLE_DEGREES) % 360) / 360;
  color.setHSL(hue, 0.75, 0.55);
  return color;
}

export function getTrackColorHex(trackId: number): string {
  const color = createTrackColor(trackId);
  return `#${color.getHexString()}`;
}
