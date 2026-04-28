import * as THREE from 'three';

const scratchPointer = new THREE.Vector2();
const scratchRaycaster = new THREE.Raycaster();
const scratchInverseMatrix = new THREE.Matrix4();
const scratchLocalRay = new THREE.Ray();

export function resolveVolumeBounds(dimensions: { width: number; height: number; depth: number } | null) {
  if (!dimensions) {
    return null;
  }

  return new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(
      Math.max(-0.5, dimensions.width - 0.5),
      Math.max(-0.5, dimensions.height - 0.5),
      Math.max(-0.5, dimensions.depth - 0.5),
    ),
  );
}

export function resolvePointerLocalRay({
  event,
  domElement,
  camera,
  volumeRootGroup,
}: {
  event: Pick<PointerEvent, 'clientX' | 'clientY'>;
  domElement: Pick<HTMLCanvasElement, 'getBoundingClientRect'>;
  camera: THREE.Camera;
  volumeRootGroup: THREE.Group;
}) {
  const rect = domElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) {
    return null;
  }

  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
    return null;
  }

  scratchPointer.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
  scratchRaycaster.setFromCamera(scratchPointer, camera);

  volumeRootGroup.updateMatrixWorld(true);
  scratchInverseMatrix.copy(volumeRootGroup.matrixWorld).invert();
  scratchLocalRay.copy(scratchRaycaster.ray).applyMatrix4(scratchInverseMatrix);
  return scratchLocalRay;
}

export function resolvePlaneVoxelPoint(
  ray: THREE.Ray,
  bounds: THREE.Box3,
  zIndex: number,
) {
  const planeZ = THREE.MathUtils.clamp(zIndex, 0, Math.max(0, Math.floor(bounds.max.z)));
  const denominator = ray.direction.z;
  const parameter = Math.abs(denominator) > 1e-8 ? (planeZ - ray.origin.z) / denominator : 0;
  const point = ray.direction.clone().multiplyScalar(Math.max(0, parameter)).add(ray.origin);
  const isWithinBounds =
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y;

  return {
    point,
    isValid: isWithinBounds,
    voxelPoint: {
      x: THREE.MathUtils.clamp(Math.round(point.x), 0, Math.max(0, Math.floor(bounds.max.x))),
      y: THREE.MathUtils.clamp(Math.round(point.y), 0, Math.max(0, Math.floor(bounds.max.y))),
      z: planeZ,
    },
  };
}
