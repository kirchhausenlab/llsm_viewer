import * as THREE from 'three';

import type { TrackLineResource } from '../VolumeViewer.types';
import { getTrackIdFromObject } from './rendering';

type PerformTrackHoverHitTestOptions = {
  event: PointerEvent;
  camera: THREE.PerspectiveCamera | null;
  trackGroup: THREE.Group | null;
  raycaster: THREE.Raycaster | null;
  renderer: THREE.WebGLRenderer | null;
  trackLines: Map<string, TrackLineResource>;
  clearPointerHover: () => void;
  setPointerHover: (trackId: string, position: { x: number; y: number }) => void;
};

export function performTrackHoverHitTest({
  event,
  camera,
  trackGroup,
  raycaster,
  renderer,
  trackLines,
  clearPointerHover,
  setPointerHover
}: PerformTrackHoverHitTestOptions): string | null {
  if (!camera || !trackGroup || !raycaster || !trackGroup.visible || !renderer) {
    clearPointerHover();
    return null;
  }

  const domElement = renderer.domElement;
  const rect = domElement.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  if (width <= 0 || height <= 0) {
    clearPointerHover();
    return null;
  }

  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  if (offsetX < 0 || offsetY < 0 || offsetX > width || offsetY > height) {
    clearPointerHover();
    return null;
  }

  const pointerVector = new THREE.Vector2();
  pointerVector.set((offsetX / width) * 2 - 1, -(offsetY / height) * 2 + 1);
  raycaster.setFromCamera(pointerVector, camera);

  const visibleObjects: THREE.Object3D[] = [];
  for (const resource of trackLines.values()) {
    if (resource.line.visible) {
      visibleObjects.push(resource.line);
    }
    if (resource.endCap.visible) {
      visibleObjects.push(resource.endCap);
    }
  }

  if (visibleObjects.length === 0) {
    clearPointerHover();
    return null;
  }

  const intersections = raycaster.intersectObjects(visibleObjects, false);
  if (intersections.length === 0) {
    clearPointerHover();
    return null;
  }

  const intersection = intersections[0];
  const trackId = getTrackIdFromObject(intersection.object);
  if (trackId === null) {
    clearPointerHover();
    return null;
  }

  setPointerHover(trackId, { x: offsetX, y: offsetY });
  return trackId;
}
