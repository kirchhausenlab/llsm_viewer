import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { DesktopViewerCamera } from '../../../hooks/useVolumeRenderSetup';
import type {
  FollowedVoxelTarget,
  VolumeResources,
  VolumeViewerProps,
} from '../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../../types/hover';
import {
  resolvePlaneVoxelPoint,
  resolvePointerLocalRay,
  resolveVolumeBounds,
} from './pointerPlaneCoordinates';

type PointerLookHandlers = {
  beginPointerLook: (event: PointerEvent) => void;
  updatePointerLook: (event: PointerEvent) => void;
  endPointerLook: (event?: PointerEvent) => void;
};

type AttachVolumeViewerPointerLifecycleParams = PointerLookHandlers & {
  domElement: HTMLCanvasElement;
  camera: DesktopViewerCamera;
  controlsRef?: MutableRefObject<OrbitControls | null>;
  controls?: OrbitControls;
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  annotationRef: MutableRefObject<VolumeViewerProps['annotation']>;
  annotationStrokePointerIdRef: MutableRefObject<number | null>;
  hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  followedTrackIdRef: MutableRefObject<string | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateVoxelHover: (event: PointerEvent | MouseEvent) => void;
  isRoiDrawToolActiveRef: MutableRefObject<boolean>;
  isRoiMoveToolActiveRef: MutableRefObject<boolean>;
  isRoiDrawPreviewActiveRef: MutableRefObject<boolean>;
  isRoiMoveInteractionActiveRef: MutableRefObject<boolean>;
  isRoiMoveActiveRef: MutableRefObject<boolean>;
  handleRoiPointerDown: (event: PointerEvent, domElement: HTMLCanvasElement) => boolean;
  handleRoiPointerMove: (event: PointerEvent) => boolean;
  handleRoiPointerUp: (event: PointerEvent, domElement: HTMLCanvasElement) => boolean;
  handleRoiPointerLeave: (event: PointerEvent | undefined, domElement: HTMLCanvasElement | null) => boolean;
  performRoiHitTest: (event: PointerEvent) => string | null;
  performPropHitTest: (event: PointerEvent) => string | null;
  resolveWorldPropDragPosition: (
    propId: string,
    event: PointerEvent
  ) => { x: number; y: number } | null;
  performHoverHitTest: (event: PointerEvent) => string | null;
  clearHoverState: (source?: 'pointer' | 'controller') => void;
  clearVoxelHover: () => void;
  resolveHoveredFollowTarget: () => FollowedVoxelTarget | null;
  onPropSelect: (propId: string) => void;
  onWorldPropPositionChange: (propId: string, nextPosition: { x: number; y: number }) => void;
  onTrackSelectionToggle: (trackId: string) => void;
  onVoxelFollowRequest: (target: FollowedVoxelTarget) => void;
};

export function attachVolumeViewerPointerLifecycle({
  domElement,
  camera,
  controlsRef,
  controls: staticControls,
  layersRef: _layersRef,
  resourcesRef: _resourcesRef,
  volumeRootGroupRef: _volumeRootGroupRef,
  annotationRef,
  annotationStrokePointerIdRef,
  hoverIntensityRef,
  followTargetActiveRef,
  followedTrackIdRef,
  rotationTargetRef,
  updateVoxelHover,
  isRoiDrawToolActiveRef,
  isRoiMoveToolActiveRef,
  isRoiDrawPreviewActiveRef,
  isRoiMoveInteractionActiveRef,
  isRoiMoveActiveRef,
  handleRoiPointerDown,
  handleRoiPointerMove,
  handleRoiPointerUp,
  handleRoiPointerLeave,
  performRoiHitTest,
  performPropHitTest,
  resolveWorldPropDragPosition,
  performHoverHitTest,
  clearHoverState,
  clearVoxelHover,
  resolveHoveredFollowTarget,
  onPropSelect,
  onWorldPropPositionChange,
  onTrackSelectionToggle,
  onVoxelFollowRequest,
  beginPointerLook,
  updatePointerLook,
  endPointerLook,
}: AttachVolumeViewerPointerLifecycleParams): () => void {
  const resolveControls = () => controlsRef?.current ?? staticControls ?? null;
  const updateRoiCursor = (event?: PointerEvent) => {
    if (isRoiMoveActiveRef.current) {
      domElement.style.cursor = 'grabbing';
      return;
    }

    if (isRoiMoveInteractionActiveRef.current) {
      domElement.style.cursor = 'grab';
      return;
    }

    if (!isRoiMoveToolActiveRef.current || !event || event.buttons !== 0) {
      domElement.style.cursor = '';
      return;
    }

    domElement.style.cursor = performRoiHitTest(event) ? 'grab' : '';
  };
  let activeWorldPropDrag:
    | {
        propId: string;
        pointerId: number;
      }
    | null = null;

  const suppressCanvasGesture = (event: PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  const applyAnnotationStrokeAtEvent = (
    annotation: NonNullable<VolumeViewerProps['annotation']>,
    event: PointerEvent,
  ) => {
    if (annotation.hoverMode === '2d') {
      const volumeRootGroup = _volumeRootGroupRef.current;
      const bounds = resolveVolumeBounds(annotation.dimensions ?? null);
      if (!volumeRootGroup || !bounds) {
        return;
      }
      const localRay = resolvePointerLocalRay({
        event,
        domElement,
        camera,
        volumeRootGroup,
      });
      if (!localRay) {
        return;
      }
      const point = resolvePlaneVoxelPoint(localRay, bounds, annotation.selectedZIndex ?? 0);
      if (point.isValid) {
        annotation.onStrokeApply(point.voxelPoint);
      }
      return;
    }

    updateVoxelHover(event);
    const hovered = hoverIntensityRef.current;
    if (hovered) {
      annotation.onStrokeApply(hovered.coordinates);
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const annotation = annotationRef.current;
    const shouldAnnotate = Boolean(annotation?.enabled && event.shiftKey);
    if (shouldAnnotate && annotation) {
      domElement.style.cursor = '';
      annotationStrokePointerIdRef.current = event.pointerId;
      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore: some platforms may reject capture.
      }
      annotation.onStrokeStart();
      applyAnnotationStrokeAtEvent(annotation, event);
      return;
    }

    if (isRoiMoveToolActiveRef.current && !event.shiftKey) {
      updateVoxelHover(event);
      if (performRoiHitTest(event) && handleRoiPointerDown(event, domElement)) {
        suppressCanvasGesture(event);
        updateRoiCursor(event);
        return;
      }
    }

    if (isRoiDrawToolActiveRef.current && event.shiftKey) {
      domElement.style.cursor = '';
      updateVoxelHover(event);
      if (handleRoiPointerDown(event, domElement)) {
        suppressCanvasGesture(event);
        return;
      }
    }

    const hitPropId = performPropHitTest(event);
    if (hitPropId !== null) {
      event.preventDefault();
      onPropSelect(hitPropId);
      activeWorldPropDrag = {
        propId: hitPropId,
        pointerId: event.pointerId,
      };
      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore: some platforms may reject capture.
      }
      domElement.style.cursor = '';
      return;
    }

    const controls = resolveControls();
    if (controls) {
      rotationTargetRef.current.copy(controls.target);
    }
    if (!followTargetActiveRef.current) {
      beginPointerLook(event);
    }

    updateVoxelHover(event);
    const hitTrackId = performHoverHitTest(event);
    if (hitTrackId !== null) {
      onTrackSelectionToggle(hitTrackId);
    }
    updateRoiCursor(event);
  };

  const handlePointerMove = (event: PointerEvent) => {
    const annotation = annotationRef.current;
    const isAnnotating = annotationStrokePointerIdRef.current !== null;
    if (annotation && isAnnotating && annotationStrokePointerIdRef.current === event.pointerId) {
      domElement.style.cursor = '';
      applyAnnotationStrokeAtEvent(annotation, event);
      return;
    }

    if (isRoiDrawPreviewActiveRef.current) {
      updateVoxelHover(event);
      if (handleRoiPointerMove(event)) {
        suppressCanvasGesture(event);
        updateRoiCursor(event);
        return;
      }
    }

    if (activeWorldPropDrag && activeWorldPropDrag.pointerId === event.pointerId) {
      domElement.style.cursor = '';
      event.preventDefault();
      const nextPosition = resolveWorldPropDragPosition(activeWorldPropDrag.propId, event);
      if (nextPosition) {
        onWorldPropPositionChange(activeWorldPropDrag.propId, nextPosition);
      }
      return;
    }

    if (followTargetActiveRef.current) {
      const controls = resolveControls();
      if (controls) {
        rotationTargetRef.current.copy(controls.target);
      }
    }

    if (!followTargetActiveRef.current) {
      updatePointerLook(event);
    }

    updateVoxelHover(event);
    performHoverHitTest(event);
    updateRoiCursor(event);
  };

  const handlePointerUp = (event: PointerEvent) => {
    const annotation = annotationRef.current;
    const activePointerId = annotationStrokePointerIdRef.current;
    if (annotation && activePointerId !== null && activePointerId === event.pointerId) {
      domElement.style.cursor = '';
      applyAnnotationStrokeAtEvent(annotation, event);
      annotation.onStrokeEnd();
      annotationStrokePointerIdRef.current = null;
      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
      return;
    }

    if (isRoiDrawPreviewActiveRef.current) {
      updateVoxelHover(event);
      if (handleRoiPointerUp(event, domElement)) {
        suppressCanvasGesture(event);
        updateRoiCursor(event);
        return;
      }
    }

    if (activeWorldPropDrag && activeWorldPropDrag.pointerId === event.pointerId) {
      domElement.style.cursor = '';
      event.preventDefault();
      activeWorldPropDrag = null;
      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
      return;
    }

    updateVoxelHover(event);
    performHoverHitTest(event);
    updateRoiCursor(event);

    if (!followTargetActiveRef.current) {
      endPointerLook(event);
    }
  };

  const handlePointerLeave = (event: PointerEvent) => {
    domElement.style.cursor = '';
    const annotation = annotationRef.current;
    const activePointerId = annotationStrokePointerIdRef.current;
    if (annotation && activePointerId !== null && activePointerId === event.pointerId) {
      annotation.onStrokeEnd();
      annotationStrokePointerIdRef.current = null;
    }
    if (activeWorldPropDrag && activeWorldPropDrag.pointerId === event.pointerId) {
      activeWorldPropDrag = null;
      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
    }
    if (isRoiDrawPreviewActiveRef.current) {
      handleRoiPointerLeave(event, domElement);
      clearHoverState('pointer');
      clearVoxelHover();
      return;
    }
    clearHoverState('pointer');
    clearVoxelHover();
    if (!followTargetActiveRef.current) {
      endPointerLook(event);
    }
  };

  const handleDoubleClick = (event: MouseEvent) => {
    updateVoxelHover(event);

    if (followedTrackIdRef.current !== null) {
      return;
    }

    const hoveredTarget = resolveHoveredFollowTarget();
    if (hoveredTarget) {
      onVoxelFollowRequest(hoveredTarget);
    }
  };

  const pointerDownOptions: AddEventListenerOptions = { capture: true };
  domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
  domElement.addEventListener('pointermove', handlePointerMove);
  domElement.addEventListener('pointerup', handlePointerUp);
  domElement.addEventListener('pointercancel', handlePointerUp);
  domElement.addEventListener('pointerleave', handlePointerLeave);
  domElement.addEventListener('dblclick', handleDoubleClick);

  return () => {
    domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    domElement.removeEventListener('pointermove', handlePointerMove);
    domElement.removeEventListener('pointerup', handlePointerUp);
    domElement.removeEventListener('pointercancel', handlePointerUp);
    domElement.removeEventListener('pointerleave', handlePointerLeave);
    domElement.removeEventListener('dblclick', handleDoubleClick);
  };
}
