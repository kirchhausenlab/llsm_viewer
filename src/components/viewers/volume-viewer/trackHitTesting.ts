import * as THREE from 'three';

import type { TrackBatchResource, TrackRenderResource } from '../VolumeViewer.types';

function getTrackIdFromBatchIntersection(
  resource: TrackBatchResource,
  segmentIndex: number | undefined
): string | null {
  if (!Number.isFinite(segmentIndex)) {
    return null;
  }

  const resolvedSegmentIndex = Math.trunc(segmentIndex ?? -1);
  if (resolvedSegmentIndex < 0 || resolvedSegmentIndex >= resource.segmentTrackIds.length) {
    return null;
  }

  const timeBase = resolvedSegmentIndex * 2;
  const timeStart = resource.segmentTimes[timeBase] ?? Number.POSITIVE_INFINITY;
  const timeEnd = resource.segmentTimes[timeBase + 1] ?? Number.NEGATIVE_INFINITY;
  if (timeEnd < resource.visibleTimeMin || timeStart > resource.visibleTimeMax) {
    return null;
  }

  return resource.segmentTrackIds[resolvedSegmentIndex] ?? null;
}

export function resolveTrackIdFromIntersection(
  intersection: { object: THREE.Object3D; faceIndex?: number | null },
  trackLines: Map<string, TrackRenderResource>
): string | null {
  const resourceKey = intersection.object.userData?.resourceKey;
  if (typeof resourceKey === 'string') {
    const resource = trackLines.get(resourceKey);
    if (resource?.kind === 'overlay') {
      return resource.trackId;
    }
    if (resource?.kind === 'batch') {
      return getTrackIdFromBatchIntersection(resource, intersection.faceIndex ?? undefined);
    }
  }

  const trackId = intersection.object.userData?.trackId;
  return typeof trackId === 'string' ? trackId : null;
}

type PerformTrackHoverHitTestOptions = {
  event: PointerEvent;
  camera: THREE.PerspectiveCamera | null;
  trackGroup: THREE.Group | null;
  raycaster: THREE.Raycaster | null;
  renderer: THREE.WebGLRenderer | null;
  trackLines: Map<string, TrackRenderResource>;
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
    if (resource.kind === 'overlay' && resource.endCap.visible) {
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

  let trackId: string | null = null;
  for (const intersection of intersections) {
    trackId = resolveTrackIdFromIntersection(intersection, trackLines);
    if (trackId) {
      break;
    }
  }
  if (trackId === null) {
    clearPointerHover();
    return null;
  }

  setPointerHover(trackId, { x: offsetX, y: offsetY });
  return trackId;
}
