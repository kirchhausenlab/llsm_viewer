import * as THREE from 'three';

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const VIEWER_YAW_FORWARD_REFERENCE = new THREE.Vector3(0, 0, -1);
const VIEWER_YAW_RIGHT_REFERENCE = new THREE.Vector3(1, 0, 0);
const viewerYawQuaternionTemp = new THREE.Quaternion();
const viewerYawForwardTemp = new THREE.Vector3();

export function computeViewerYawBasis(
  renderer: THREE.WebGLRenderer | null,
  camera: THREE.PerspectiveCamera | null,
  outForward: THREE.Vector3,
  outRight: THREE.Vector3,
) {
  outForward.copy(VIEWER_YAW_FORWARD_REFERENCE);
  outRight.copy(VIEWER_YAW_RIGHT_REFERENCE);
  if (!camera) {
    return;
  }

  const isPresenting = !!renderer?.xr?.isPresenting;
  const referenceCamera = isPresenting
    ? ((renderer?.xr.getCamera() as THREE.Camera) ?? camera)
    : camera;
  referenceCamera.getWorldQuaternion(viewerYawQuaternionTemp);

  viewerYawForwardTemp.set(0, 0, -1).applyQuaternion(viewerYawQuaternionTemp);
  viewerYawForwardTemp.y = 0;

  if (viewerYawForwardTemp.lengthSq() < 1e-6) {
    return;
  }

  viewerYawForwardTemp.normalize();
  outForward.copy(viewerYawForwardTemp);
  outRight.crossVectors(outForward, WORLD_UP);

  if (outRight.lengthSq() < 1e-6) {
    outForward.copy(VIEWER_YAW_FORWARD_REFERENCE);
    outRight.copy(VIEWER_YAW_RIGHT_REFERENCE);
    return;
  }

  outRight.normalize();
  outForward.copy(WORLD_UP).cross(outRight).normalize();
}

export function computeYawAngleForBasis(
  vector: THREE.Vector3,
  basisForward: THREE.Vector3,
  basisRight: THREE.Vector3,
) {
  const forwardComponent = vector.dot(basisForward);
  const rightComponent = vector.dot(basisRight);
  return Math.atan2(rightComponent, forwardComponent);
}
