import * as THREE from 'three';

import {
  DEFAULT_DESKTOP_CAMERA_NEAR,
  type DesktopViewerCamera,
} from '../../../hooks/useVolumeRenderSetup';

export type VolumeDimensions = { width: number; height: number; depth: number };

export type SceneWorldBounds = {
  centerWorld: THREE.Vector3;
  radius: number;
};

const FRUSTUM_RADIUS_MARGIN_MULTIPLIER = 0.25;

const boundsCenterLocal = new THREE.Vector3();
const boundsCornerLocal = new THREE.Vector3();
const boundsCenterWorld = new THREE.Vector3();
const boundsCornerWorld = new THREE.Vector3();
const frustumCenterCamera = new THREE.Vector3();

function clampFinitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveSceneWorldBounds(
  dimensions: VolumeDimensions | null | undefined,
  volumeRootGroup: THREE.Group | null | undefined,
): SceneWorldBounds | null {
  if (!dimensions || !volumeRootGroup) {
    return null;
  }

  const { width, height, depth } = dimensions;
  if (width <= 0 || height <= 0 || depth <= 0) {
    return null;
  }

  boundsCenterLocal.set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);
  boundsCornerLocal.set(width - 1, height - 1, depth - 1);

  volumeRootGroup.updateMatrixWorld(true);
  const centerWorld = volumeRootGroup.localToWorld(boundsCenterWorld.copy(boundsCenterLocal));
  const cornerWorld = volumeRootGroup.localToWorld(boundsCornerWorld.copy(boundsCornerLocal));
  const radius = Math.max(centerWorld.distanceTo(cornerWorld), 1e-3);

  return {
    centerWorld: centerWorld.clone(),
    radius,
  };
}

export function resolveAdaptiveCameraFrustum(
  camera: DesktopViewerCamera,
  bounds: SceneWorldBounds,
): { near: number; far: number } {
  frustumCenterCamera.copy(bounds.centerWorld).applyMatrix4(camera.matrixWorldInverse);
  const centerDepth = -frustumCenterCamera.z;
  const radius = clampFinitePositive(bounds.radius, 1);
  const margin = Math.max(radius * FRUSTUM_RADIUS_MARGIN_MULTIPLIER, 0.25);
  const far = Math.max(centerDepth + radius + margin, DEFAULT_DESKTOP_CAMERA_NEAR * 2);
  const nearestVisibleDepth = centerDepth - radius - margin;
  const near =
    nearestVisibleDepth > DEFAULT_DESKTOP_CAMERA_NEAR
      ? Math.max(DEFAULT_DESKTOP_CAMERA_NEAR, nearestVisibleDepth * 0.5)
      : DEFAULT_DESKTOP_CAMERA_NEAR;

  return {
    near,
    far: Math.max(far, near * 2),
  };
}
