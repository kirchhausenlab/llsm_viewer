import * as THREE from 'three';

import type { RoiRenderResource } from '../VolumeViewer.types';

type PerformRoiHoverHitTestOptions = {
  event: PointerEvent;
  camera: THREE.PerspectiveCamera | null;
  roiGroup: THREE.Group | null;
  raycaster: THREE.Raycaster | null;
  renderer: THREE.WebGLRenderer | null;
  roiResources: Map<string, RoiRenderResource>;
};

export function performRoiHoverHitTest({
  event,
  camera,
  roiGroup,
  raycaster,
  renderer,
  roiResources,
}: PerformRoiHoverHitTestOptions): string | null {
  if (!camera || !roiGroup || !raycaster || !renderer || !roiGroup.visible) {
    return null;
  }

  const rect = renderer.domElement.getBoundingClientRect();
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

  const pointer = new THREE.Vector2((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);

  const visibleObjects: THREE.Object3D[] = [];
  for (const resource of roiResources.values()) {
    if (resource.line.visible) {
      visibleObjects.push(resource.line);
    }
  }

  if (visibleObjects.length === 0) {
    return null;
  }

  const intersections = raycaster.intersectObjects(visibleObjects, false);
  for (const intersection of intersections) {
    const resourceKey = intersection.object.userData?.resourceKey;
    if (typeof resourceKey !== 'string') {
      continue;
    }
    const resource = roiResources.get(resourceKey);
    if (resource) {
      return resource.roiId;
    }
  }

  return null;
}
