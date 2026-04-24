import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';

import type { TrackRenderResource } from '../../VolumeViewer.types';
import { resolveTrackIdFromIntersection } from '../trackHitTesting';
import type { ControllerEntry } from './types';

export function resolveControllerTrackIntersection(params: {
  entry: ControllerEntry;
  visibleLines: Line2[];
  trackResources: Map<string, TrackRenderResource>;
  renderer: THREE.WebGLRenderer;
  cameraInstance: THREE.PerspectiveCamera;
  containerInstance: HTMLElement | null;
  controllerProjectedPoint: THREE.Vector3;
  initialHoverTrackId: string | null;
  initialRayLength: number;
}): {
  hoverTrackId: string | null;
  hoverPosition: { x: number; y: number } | null;
  rayLength: number;
} {
  const {
    entry,
    visibleLines,
    trackResources,
    renderer,
    cameraInstance,
    containerInstance,
    controllerProjectedPoint,
    initialHoverTrackId,
    initialRayLength,
  } = params;

  let hoverTrackId = initialHoverTrackId;
  let hoverPosition: { x: number; y: number } | null = null;
  let rayLength = initialRayLength;

  if (visibleLines.length === 0) {
    return { hoverTrackId, hoverPosition, rayLength };
  }

  const raycastCamera = renderer.xr.isPresenting
    ? ((renderer.xr.getCamera() as THREE.Camera) ?? cameraInstance)
    : cameraInstance;
  entry.raycaster.camera = raycastCamera as unknown as THREE.Camera;
  const intersections = entry.raycaster.intersectObjects(visibleLines, false) as Array<{
    object: THREE.Object3D & { userData?: Record<string, unknown> };
    distance: number;
    point: THREE.Vector3;
    faceIndex?: number | null;
  }>;

  if (intersections.length === 0) {
    return { hoverTrackId, hoverPosition, rayLength };
  }

  let intersection = intersections[0]!;
  let trackId: string | null = null;
  for (const candidate of intersections) {
    const resolvedTrackId = resolveTrackIdFromIntersection(candidate, trackResources);
    if (resolvedTrackId) {
      intersection = candidate;
      trackId = resolvedTrackId;
      break;
    }
  }
  if (!trackId) {
    return { hoverTrackId, hoverPosition, rayLength };
  }

  hoverTrackId = entry.hoverUiTarget ? null : trackId;
  entry.hoverPoint.copy(intersection.point);
  const distance = Math.max(0.15, Math.min(intersection.distance, 8));
  rayLength = Math.min(rayLength, distance);
  if (!containerInstance) {
    return { hoverTrackId, hoverPosition, rayLength };
  }

  const width = containerInstance.clientWidth;
  const height = containerInstance.clientHeight;
  if (width <= 0 || height <= 0) {
    return { hoverTrackId, hoverPosition, rayLength };
  }

  controllerProjectedPoint.copy(intersection.point).project(cameraInstance);
  if (
    Number.isFinite(controllerProjectedPoint.x) &&
    Number.isFinite(controllerProjectedPoint.y)
  ) {
    hoverPosition = {
      x: (controllerProjectedPoint.x * 0.5 + 0.5) * width,
      y: (-controllerProjectedPoint.y * 0.5 + 0.5) * height,
    };
  }

  return { hoverTrackId, hoverPosition, rayLength };
}
