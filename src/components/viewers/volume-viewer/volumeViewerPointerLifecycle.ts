import type { MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { FollowedVoxelTarget, VolumeViewerProps } from '../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../../types/hover';

type PointerLookHandlers = {
  beginPointerLook: (event: PointerEvent) => void;
  updatePointerLook: (event: PointerEvent) => void;
  endPointerLook: (event?: PointerEvent) => void;
};

type AttachVolumeViewerPointerLifecycleParams = PointerLookHandlers & {
  domElement: HTMLCanvasElement;
  controls: OrbitControls;
  paintbrushRef: MutableRefObject<VolumeViewerProps['paintbrush']>;
  paintStrokePointerIdRef: MutableRefObject<number | null>;
  hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  followedTrackIdRef: MutableRefObject<string | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  updateVoxelHover: (event: PointerEvent | MouseEvent) => void;
  performHoverHitTest: (event: PointerEvent) => string | null;
  clearHoverState: (source?: 'pointer' | 'controller') => void;
  clearVoxelHover: () => void;
  resolveHoveredFollowTarget: () => FollowedVoxelTarget | null;
  onTrackSelectionToggle: (trackId: string) => void;
  onVoxelFollowRequest: (target: FollowedVoxelTarget) => void;
};

export function attachVolumeViewerPointerLifecycle({
  domElement,
  controls,
  paintbrushRef,
  paintStrokePointerIdRef,
  hoverIntensityRef,
  followTargetActiveRef,
  followedTrackIdRef,
  rotationTargetRef,
  updateVoxelHover,
  performHoverHitTest,
  clearHoverState,
  clearVoxelHover,
  resolveHoveredFollowTarget,
  onTrackSelectionToggle,
  onVoxelFollowRequest,
  beginPointerLook,
  updatePointerLook,
  endPointerLook
}: AttachVolumeViewerPointerLifecycleParams): () => void {
  const handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return;
    }

    const paint = paintbrushRef.current;
    const shouldPaint = Boolean(paint?.enabled && event.shiftKey);
    if (shouldPaint && paint) {
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

    rotationTargetRef.current.copy(controls.target);
    if (!followTargetActiveRef.current) {
      beginPointerLook(event);
    }

    updateVoxelHover(event);
    const hitTrackId = performHoverHitTest(event);
    if (hitTrackId !== null) {
      onTrackSelectionToggle(hitTrackId);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    const paint = paintbrushRef.current;
    const isPainting = paintStrokePointerIdRef.current !== null;
    if (paint && isPainting && paintStrokePointerIdRef.current === event.pointerId) {
      updateVoxelHover(event);
      const hovered = hoverIntensityRef.current;
      if (hovered) {
        paint.onStrokeApply(hovered.coordinates);
      }
      return;
    }

    if (followTargetActiveRef.current) {
      rotationTargetRef.current.copy(controls.target);
    }

    if (!followTargetActiveRef.current) {
      updatePointerLook(event);
    }

    updateVoxelHover(event);
    performHoverHitTest(event);
  };

  const handlePointerUp = (event: PointerEvent) => {
    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
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

    updateVoxelHover(event);
    performHoverHitTest(event);

    if (!followTargetActiveRef.current) {
      endPointerLook(event);
    }
  };

  const handlePointerLeave = (event: PointerEvent) => {
    const paint = paintbrushRef.current;
    const activePointerId = paintStrokePointerIdRef.current;
    if (paint && activePointerId !== null && activePointerId === event.pointerId) {
      paint.onStrokeEnd();
      paintStrokePointerIdRef.current = null;
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
