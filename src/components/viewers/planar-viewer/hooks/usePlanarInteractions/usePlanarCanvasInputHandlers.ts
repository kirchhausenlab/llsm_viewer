import { useCallback, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { MAX_SCALE, MIN_SCALE } from '../usePlanarLayout';
import { clamp } from '../../utils';
import type { HoveredPixel, PlanarViewerProps, TrackHitTestResult, ViewState } from '../../types';

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffsetX: number;
  startOffsetY: number;
};

type UsePlanarCanvasInputHandlersParams = {
  clampedSliceIndex: number;
  paintbrush?: PlanarViewerProps['paintbrush'];
  hoveredPixelRef: MutableRefObject<HoveredPixel>;
  viewStateRef: MutableRefObject<ViewState>;
  updateViewState: (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => void;
  onTrackSelectionToggle: (trackId: string) => void;
  performTrackHitTest: (event: PointerEvent) => TrackHitTestResult;
  updateHoverState: (trackId: string | null, position: { x: number; y: number } | null) => void;
  clearHoverState: () => void;
  updatePixelHover: (event: PointerEvent) => void;
};

export function usePlanarCanvasInputHandlers({
  clampedSliceIndex,
  paintbrush,
  hoveredPixelRef,
  viewStateRef,
  updateViewState,
  onTrackSelectionToggle,
  performTrackHitTest,
  updateHoverState,
  clearHoverState,
  updatePixelHover
}: UsePlanarCanvasInputHandlersParams) {
  const pointerStateRef = useRef<PointerState | null>(null);
  const paintStrokePointerIdRef = useRef<number | null>(null);

  const applyPaintAtHover = useCallback(
    (event: PointerEvent) => {
      const paint = paintbrush;
      const activePointerId = paintStrokePointerIdRef.current;
      if (!paint || !paint.enabled || activePointerId === null || activePointerId !== event.pointerId) {
        return;
      }
      updatePixelHover(event);
      const hovered = hoveredPixelRef.current;
      if (hovered) {
        paint.onStrokeApply({ x: hovered.x, y: hovered.y, z: clampedSliceIndex });
      }
    },
    [clampedSliceIndex, paintbrush, hoveredPixelRef, updatePixelHover]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) {
        return;
      }
      const nativeEvent = event.nativeEvent;

      const paint = paintbrush;
      const shouldPaint = Boolean(paint?.enabled && nativeEvent.shiftKey);
      if (shouldPaint && paint) {
        pointerStateRef.current = null;
        paintStrokePointerIdRef.current = nativeEvent.pointerId;
        const target = event.currentTarget;
        target.setPointerCapture(nativeEvent.pointerId);
        paint.onStrokeStart();
        updatePixelHover(nativeEvent);
        const hovered = hoveredPixelRef.current;
        if (hovered) {
          paint.onStrokeApply({ x: hovered.x, y: hovered.y, z: clampedSliceIndex });
        }
        return;
      }

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null) {
        pointerStateRef.current = null;
        onTrackSelectionToggle(trackId);
        if (pointer) {
          updateHoverState(trackId, pointer);
        }
        return;
      }

      const target = event.currentTarget;
      const currentView = viewStateRef.current;
      pointerStateRef.current = {
        pointerId: nativeEvent.pointerId,
        startX: nativeEvent.clientX,
        startY: nativeEvent.clientY,
        startOffsetX: currentView.offsetX,
        startOffsetY: currentView.offsetY
      };
      target.setPointerCapture(nativeEvent.pointerId);
    },
    [
      clampedSliceIndex,
      hoveredPixelRef,
      onTrackSelectionToggle,
      paintbrush,
      performTrackHitTest,
      updateHoverState,
      updatePixelHover,
      viewStateRef
    ]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const nativeEvent = event.nativeEvent;

      const paint = paintbrush;
      const activePointerId = paintStrokePointerIdRef.current;
      if (paint && paint.enabled && activePointerId !== null && activePointerId === nativeEvent.pointerId) {
        applyPaintAtHover(nativeEvent);
        return;
      }

      const state = pointerStateRef.current;
      if (state && state.pointerId === nativeEvent.pointerId) {
        const deltaX = nativeEvent.clientX - state.startX;
        const deltaY = nativeEvent.clientY - state.startY;
        const nextOffsetX = state.startOffsetX + deltaX;
        const nextOffsetY = state.startOffsetY + deltaY;
        updateViewState((previous) => {
          if (
            Math.abs(previous.offsetX - nextOffsetX) < 1e-3 &&
            Math.abs(previous.offsetY - nextOffsetY) < 1e-3
          ) {
            return previous;
          }
          return {
            ...previous,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY
          };
        });
        clearHoverState();
        updatePixelHover(nativeEvent);
        return;
      }

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(nativeEvent);
    },
    [
      applyPaintAtHover,
      clearHoverState,
      paintbrush,
      performTrackHitTest,
      updateHoverState,
      updatePixelHover,
      updateViewState
    ]
  );

  const handlePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const nativeEvent = event.nativeEvent;

      const paint = paintbrush;
      const activePointerId = paintStrokePointerIdRef.current;
      if (paint && paint.enabled && activePointerId !== null && activePointerId === nativeEvent.pointerId) {
        applyPaintAtHover(nativeEvent);
        const target = event.currentTarget;
        target.releasePointerCapture(nativeEvent.pointerId);
        paint.onStrokeEnd();
        paintStrokePointerIdRef.current = null;
        return;
      }

      const state = pointerStateRef.current;
      if (state && state.pointerId === nativeEvent.pointerId) {
        const target = event.currentTarget;
        target.releasePointerCapture(nativeEvent.pointerId);
        pointerStateRef.current = null;
      }

      const { trackId, pointer } = performTrackHitTest(nativeEvent);
      if (trackId !== null && pointer) {
        updateHoverState(trackId, pointer);
      } else {
        clearHoverState();
      }
      updatePixelHover(nativeEvent);
    },
    [applyPaintAtHover, clearHoverState, paintbrush, performTrackHitTest, updateHoverState, updatePixelHover]
  );

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLCanvasElement>) => {
      if (event.deltaY === 0) {
        return;
      }
      event.preventDefault();
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      updateViewState((previous) => {
        const nextScale = clamp(previous.scale * zoomFactor, MIN_SCALE, MAX_SCALE);
        return { ...previous, scale: nextScale };
      });
    },
    [updateViewState]
  );

  return {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerEnd,
    onPointerCancel: handlePointerEnd,
    onPointerLeave: handlePointerEnd,
    onWheel: handleWheel
  };
}
