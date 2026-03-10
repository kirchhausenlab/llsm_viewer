import * as THREE from 'three';

import { computeYawAngleForBasis } from './viewerYaw';

export type VolumeScaleState = {
  direction: THREE.Vector3;
  baseLength: number;
};

export function computeYawRotation(
  direction: THREE.Vector3,
  basisForward: THREE.Vector3,
  basisRight: THREE.Vector3,
): number | null {
  if (direction.lengthSq() <= 1e-6) {
    return null;
  }
  return computeYawAngleForBasis(direction, basisForward, basisRight);
}

export function computePitchRotation(
  direction: THREE.Vector3,
  basisForward: THREE.Vector3,
): number | null {
  if (direction.lengthSq() <= 1e-6) {
    return null;
  }
  const forwardComponent = direction.dot(basisForward);
  return Math.atan2(direction.y, forwardComponent);
}

export function createVolumeScaleState(
  handlePoint: THREE.Vector3,
  centerPoint: THREE.Vector3,
  userScale: number,
): VolumeScaleState | null {
  const direction = handlePoint.clone().sub(centerPoint);
  const length = direction.length();
  if (length <= 1e-6) {
    return null;
  }
  const normalizedDirection = direction.divideScalar(length);
  const safeScale = Math.max(userScale, 1e-6);
  return {
    direction: normalizedDirection,
    baseLength: length / safeScale,
  };
}
