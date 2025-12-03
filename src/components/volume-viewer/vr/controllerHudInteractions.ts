import * as THREE from 'three';

const MIN_RAY_LENGTH = 0.12;
const MAX_RAY_LENGTH = 8;

export function clampUiRayLength(distance: number): number {
  return Math.max(MIN_RAY_LENGTH, Math.min(distance, MAX_RAY_LENGTH));
}

export function isPointInsideHudSurface(
  localPoint: THREE.Vector3,
  halfWidth: number,
  halfHeight: number,
  margin: number,
): boolean {
  return (
    localPoint.x >= -halfWidth - margin &&
    localPoint.x <= halfWidth + margin &&
    localPoint.y >= -halfHeight - margin &&
    localPoint.y <= halfHeight + margin
  );
}
