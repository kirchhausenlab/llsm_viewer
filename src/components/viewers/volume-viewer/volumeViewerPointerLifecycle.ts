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
  paintbrushRef: MutableRefObject<VolumeViewerProps['paintbrush']>;
  paintStrokePointerIdRef: MutableRefObject<number | null>;
  hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  followedTrackIdRef: MutableRefObject<string | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateVoxelHover: (event: PointerEvent | MouseEvent) => void;
  isRoiDrawToolActiveRef: MutableRefObject<boolean>;
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
  camera: _camera,
  controlsRef,
  controls: staticControls,
  layersRef: _layersRef,
  resourcesRef: _resourcesRef,
  volumeRootGroupRef: _volumeRootGroupRef,
  paintbrushRef,
  paintStrokePointerIdRef,
  hoverIntensityRef,
  followTargetActiveRef,
  followedTrackIdRef,
  rotationTargetRef,
  updateVoxelHover,
  isRoiDrawToolActiveRef,
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

    if (!isRoiDrawToolActiveRef.current || !event || event.buttons !== 0) {
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

  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const paint = paintbrushRef.current;
    const shouldPaint = Boolean(paint?.enabled && event.ctrlKey);
    if (shouldPaint && paint) {
      domElement.style.cursor = '';
      paintStrokePointerIdRef.current = event.pointerId;
      try {
        domElement.setPointerCapture(event.pointerId);
      } catch {
        // Ignore: some platforms may reject capture.
      }
      paint.onStrokeStart();
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      return;
    }

    if (isRoiDrawToolActiveRef.current && event.shiftKey) {
      domElement.style.cursor = '';
      updateVoxelHover(event);
      if (handleRoiPointerDown(event, domElement)) {
        return;
      }
    }

    if (isRoiDrawToolActiveRef.current && !event.shiftKey) {
      updateVoxelHover(event);
      if (performRoiHitTest(event) && handleRoiPointerDown(event, domElement)) {
        updateRoiCursor(event);
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
    const paint = paintbrushRef.current;
    const isPainting = paintStrokePointerIdRef.current !== null;
    if (paint && isPainting && paintStrokePointerIdRef.current === event.pointerId) {
      domElement.style.cursor = '';
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      return;
    }

    if (isRoiDrawPreviewActiveRef.current) {
      updateVoxelHover(event);
      if (handleRoiPointerMove(event)) {
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
    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
      domElement.style.cursor = '';
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      paint.onStrokeEnd();
      paintStrokePointerIdRef.current = null;
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
    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
      paint.onStrokeEnd();
      paintStrokePointerIdRef.current = null;
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
