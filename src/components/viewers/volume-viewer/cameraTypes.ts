import type * as THREE from 'three';

import type { ProjectionMode } from '../../../types/projection';

export type VolumeProjectionMode = ProjectionMode;
export type VolumeCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export function isPerspectiveVolumeCamera(
  camera: THREE.Camera | null | undefined,
): camera is THREE.PerspectiveCamera {
  return Boolean(camera && (camera as THREE.PerspectiveCamera).isPerspectiveCamera);
}

export function isOrthographicVolumeCamera(
  camera: THREE.Camera | null | undefined,
): camera is THREE.OrthographicCamera {
  return Boolean(camera && (camera as THREE.OrthographicCamera).isOrthographicCamera);
}
