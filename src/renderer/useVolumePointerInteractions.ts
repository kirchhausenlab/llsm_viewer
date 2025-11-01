import { useEffect, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { UseRendererCanvasResult } from './useRendererCanvas';
import type { VolumeViewerProps } from './types';
import type { MovementState } from './useRayMarchLoop';
import type { TrackLineResource } from './useTrackOverlay';

type TooltipPosition = { x: number; y: number } | null;

type HoverResult = {
  trackId: string | null;
  position: TooltipPosition;
};

type PointerMode = 'default' | 'select' | 'pan' | 'dolly';

type PointerState = {
  pointerId: number;
  mode: PointerMode;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  hasDragged: boolean;
  selectionTrackId: string | null;
  previousControlsEnabled: boolean;
  previousControlsPan: boolean;
};

type UseVolumePointerInteractionsParams = {
  rendererCanvas: UseRendererCanvasResult;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  movementStateRef: MutableRefObject<MovementState>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  hoveredTrackIdRef: MutableRefObject<string | null>;
  setHoveredTrackId: (trackId: string | null) => void;
  setTooltipPosition: (position: TooltipPosition) => void;
  onTrackSelectionToggle: VolumeViewerProps['onTrackSelectionToggle'];
};

const DRAG_THRESHOLD_SQ = 9;
const DOLLY_BASE_SPEED = 0.0025;
const PAN_SENSITIVITY = 1;

export function useVolumePointerInteractions({
  rendererCanvas,
  rotationTargetRef,
  movementStateRef,
  trackLinesRef,
  hoveredTrackIdRef,
  setHoveredTrackId,
  setTooltipPosition,
  onTrackSelectionToggle
}: UseVolumePointerInteractionsParams) {
  const pointerStateRef = useRef<PointerState | null>(null);
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const pointerVectorRef = useRef(new THREE.Vector2());
  const forwardVectorRef = useRef(new THREE.Vector3());

  useEffect(() => {
    const renderer = rendererCanvas.renderer;
    const camera = rendererCanvas.camera;
    const controls = rendererCanvas.controls;
    if (!renderer || !camera || !controls) {
      return;
    }

    const canvas = renderer.domElement;
    if (!canvas) {
      return;
    }

    const raycaster = new THREE.Raycaster();
    raycaster.params.Line2 = { threshold: 0.2 } as { threshold: number } & Record<string, unknown>;
    raycasterRef.current = raycaster;

    const pointerVector = pointerVectorRef.current;

    const updateHoverState = (result: HoverResult) => {
      if (result.trackId !== null) {
        if (hoveredTrackIdRef.current !== result.trackId) {
          hoveredTrackIdRef.current = result.trackId;
          setHoveredTrackId(result.trackId);
        }
        if (result.position) {
          setTooltipPosition(result.position);
        }
      } else {
        if (hoveredTrackIdRef.current !== null) {
          hoveredTrackIdRef.current = null;
          setHoveredTrackId(null);
        }
        setTooltipPosition(null);
      }
    };

    const clearHoverState = () => {
      if (hoveredTrackIdRef.current !== null) {
        hoveredTrackIdRef.current = null;
        setHoveredTrackId(null);
      }
      setTooltipPosition(null);
    };

    const performHoverHitTest = (event: PointerEvent): HoverResult => {
      if (!camera) {
        return { trackId: null, position: null };
      }
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return { trackId: null, position: null };
      }

      pointerVector.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerVector.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(pointerVector, camera);

      const visibleLines: THREE.Object3D[] = [];
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleLines.push(resource.line);
        }
      }

      if (visibleLines.length === 0) {
        return { trackId: null, position: null };
      }

      const intersections = raycaster.intersectObjects(visibleLines, false);
      for (const intersection of intersections) {
        const candidate = intersection.object as { userData?: { trackId?: unknown } };
        const hitTrackId = candidate.userData?.trackId;
        if (typeof hitTrackId === 'string') {
          return {
            trackId: hitTrackId,
            position: { x: event.clientX - rect.left, y: event.clientY - rect.top }
          };
        }
      }

      return { trackId: null, position: null };
    };

    const releasePointerCapture = (pointerId: number) => {
      if (typeof (canvas as { releasePointerCapture?: (id: number) => void }).releasePointerCapture === 'function') {
        try {
          canvas.releasePointerCapture(pointerId);
        } catch (error) {
          // Ignore capture release errors in tests or detached DOM nodes.
        }
      }
    };

    const restoreControlsState = () => {
      const pointerState = pointerStateRef.current;
      if (!pointerState) {
        return;
      }
      controls.enabled = pointerState.previousControlsEnabled;
      controls.enablePan = pointerState.previousControlsPan;
    };

    const resetPointerState = () => {
      const pointerState = pointerStateRef.current;
      if (pointerState) {
        restoreControlsState();
        releasePointerCapture(pointerState.pointerId);
        pointerStateRef.current = null;
      }
    };

    const handlePanDrag = (event: PointerEvent, pointerState: PointerState) => {
      const deltaX = (event.clientX - pointerState.lastX) * PAN_SENSITIVITY;
      const deltaY = (event.clientY - pointerState.lastY) * PAN_SENSITIVITY;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;
      pointerState.hasDragged = true;

      const controlsWithPan = controls as OrbitControls & { pan?: (deltaX: number, deltaY: number) => void };
      if (typeof controlsWithPan.pan === 'function') {
        controlsWithPan.pan(deltaX, deltaY);
        controls.update();
      }
    };

    const handleDollyDrag = (event: PointerEvent, pointerState: PointerState) => {
      if (!camera) {
        return;
      }

      const deltaY = event.clientY - pointerState.lastY;
      pointerState.lastX = event.clientX;
      pointerState.lastY = event.clientY;
      pointerState.hasDragged = true;

      const rotationTarget = rotationTargetRef.current;
      const forward = forwardVectorRef.current;
      camera.getWorldDirection(forward).normalize();

      const distance = Math.max(camera.position.distanceTo(rotationTarget), 1e-4);
      const movementScale = Math.max(distance * DOLLY_BASE_SPEED, DOLLY_BASE_SPEED);
      const movement = -deltaY * movementScale;

      camera.position.addScaledVector(forward, movement);
      rotationTarget.addScaledVector(forward, movement);
      controls.target.copy(rotationTarget);
      controls.update();
    };

    const clearKeyboardMovement = () => {
      const movementState = movementStateRef.current;
      movementState.moveForward = false;
      movementState.moveBackward = false;
      movementState.moveLeft = false;
      movementState.moveRight = false;
      movementState.moveUp = false;
      movementState.moveDown = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      const pointerState: PointerState = {
        pointerId: event.pointerId,
        mode: 'default',
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        hasDragged: false,
        selectionTrackId: null,
        previousControlsEnabled: controls.enabled,
        previousControlsPan: controls.enablePan
      };

      const modifiers = {
        shift: event.shiftKey,
        ctrl: event.ctrlKey || event.metaKey,
        alt: event.altKey
      };

      if (modifiers.shift && !modifiers.ctrl && !modifiers.alt) {
        pointerState.mode = 'pan';
        controls.enabled = false;
        controls.enablePan = true;
        clearHoverState();
        clearKeyboardMovement();
        if (typeof canvas.setPointerCapture === 'function') {
          canvas.setPointerCapture(event.pointerId);
        }
      } else if (modifiers.ctrl && !modifiers.alt) {
        pointerState.mode = 'dolly';
        controls.enabled = false;
        controls.enablePan = pointerState.previousControlsPan;
        clearHoverState();
        clearKeyboardMovement();
        if (typeof canvas.setPointerCapture === 'function') {
          canvas.setPointerCapture(event.pointerId);
        }
      } else {
        const hit = performHoverHitTest(event);
        if (hit.trackId !== null) {
          pointerState.mode = 'select';
          pointerState.selectionTrackId = hit.trackId;
          controls.enabled = false;
          controls.enablePan = pointerState.previousControlsPan;
          updateHoverState(hit);
          if (typeof canvas.setPointerCapture === 'function') {
            canvas.setPointerCapture(event.pointerId);
          }
        } else {
          pointerState.mode = 'default';
        }
      }

      pointerStateRef.current = pointerState;
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointerState = pointerStateRef.current;
      if (!pointerState || pointerState.pointerId !== event.pointerId) {
        const result = performHoverHitTest(event);
        updateHoverState(result);
        return;
      }

      const dx = event.clientX - pointerState.startX;
      const dy = event.clientY - pointerState.startY;
      if (!pointerState.hasDragged && dx * dx + dy * dy >= DRAG_THRESHOLD_SQ) {
        pointerState.hasDragged = true;
      }

      switch (pointerState.mode) {
        case 'pan':
          handlePanDrag(event, pointerState);
          clearHoverState();
          event.preventDefault();
          break;
        case 'dolly':
          handleDollyDrag(event, pointerState);
          clearHoverState();
          event.preventDefault();
          break;
        case 'select': {
          const result = performHoverHitTest(event);
          updateHoverState(result);
          pointerState.lastX = event.clientX;
          pointerState.lastY = event.clientY;
          break;
        }
        default: {
          if (pointerState.hasDragged) {
            clearHoverState();
          } else {
            const result = performHoverHitTest(event);
            updateHoverState(result);
          }
          pointerState.lastX = event.clientX;
          pointerState.lastY = event.clientY;
          break;
        }
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pointerState = pointerStateRef.current;
      if (pointerState && pointerState.pointerId === event.pointerId) {
        const shouldToggleSelection =
          pointerState.mode === 'select' &&
          !pointerState.hasDragged &&
          pointerState.selectionTrackId !== null;

        resetPointerState();

        const result = performHoverHitTest(event);
        updateHoverState(result);

        if (
          shouldToggleSelection &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          pointerState.selectionTrackId
        ) {
          onTrackSelectionToggle(pointerState.selectionTrackId);
        }
      } else {
        const result = performHoverHitTest(event);
        updateHoverState(result);
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const pointerState = pointerStateRef.current;
      if (pointerState && pointerState.pointerId === event.pointerId) {
        resetPointerState();
      }
      clearHoverState();
    };

    const handlePointerLeave = (event: PointerEvent) => {
      const pointerState = pointerStateRef.current;
      if (pointerState && pointerState.pointerId === event.pointerId) {
        resetPointerState();
      }
      clearHoverState();
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerCancel);
    canvas.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerCancel);
      canvas.removeEventListener('pointerleave', handlePointerLeave);
      resetPointerState();
      raycasterRef.current = null;
    };
  }, [
    rendererCanvas.renderer,
    rendererCanvas.camera,
    rendererCanvas.controls,
    rotationTargetRef,
    movementStateRef,
    trackLinesRef,
    hoveredTrackIdRef,
    setHoveredTrackId,
    setTooltipPosition,
    onTrackSelectionToggle
  ]);
}
