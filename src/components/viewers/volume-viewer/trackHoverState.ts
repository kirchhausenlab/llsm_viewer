import { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

const HOVER_STATE_SOURCES = ['pointer', 'controller'] as const;

type HoverSource = (typeof HOVER_STATE_SOURCES)[number];

type HoverState = {
  trackId: string | null;
  position: { x: number; y: number } | null;
};

const createEmptyHoverState = (): HoverState => ({
  trackId: null,
  position: null
});

const createEmptyHoverSources = (): Record<HoverSource, HoverState> => ({
  pointer: createEmptyHoverState(),
  controller: createEmptyHoverState()
});

type UseTrackHoverStateResult = {
  hoveredTrackIdRef: MutableRefObject<string | null>;
  hoveredTrackId: string | null;
  tooltipPosition: { x: number; y: number } | null;
  updateHoverState: (
    trackId: string | null,
    position: { x: number; y: number } | null,
    source?: HoverSource
  ) => void;
  clearHoverState: (source?: HoverSource) => void;
};

export function useTrackHoverState(): UseTrackHoverStateResult {
  const hoveredTrackIdRef = useRef<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const hoverSourcesRef = useRef<Record<HoverSource, HoverState>>(createEmptyHoverSources());

  const applyHoverState = useCallback(() => {
    const pointerState = hoverSourcesRef.current.pointer;
    const controllerState = hoverSourcesRef.current.controller;
    const nextState =
      pointerState.trackId !== null
        ? pointerState
        : controllerState.trackId !== null
          ? controllerState
          : createEmptyHoverState();

    if (hoveredTrackIdRef.current !== nextState.trackId) {
      hoveredTrackIdRef.current = nextState.trackId;
      setHoveredTrackId(nextState.trackId);
    }

    setTooltipPosition((current) => {
      const next = nextState.position;
      if (current === next) {
        return current;
      }
      if (current === null || next === null) {
        return next;
      }
      if (current.x === next.x && current.y === next.y) {
        return current;
      }
      return next;
    });
  }, []);

  const updateHoverState = useCallback(
    (
      trackId: string | null,
      position: { x: number; y: number } | null,
      source: HoverSource = 'pointer'
    ) => {
      hoverSourcesRef.current[source] = { trackId, position };
      applyHoverState();
    },
    [applyHoverState]
  );

  const clearHoverState = useCallback(
    (source?: HoverSource) => {
      if (source) {
        hoverSourcesRef.current[source] = createEmptyHoverState();
      } else {
        for (const key of HOVER_STATE_SOURCES) {
          hoverSourcesRef.current[key] = createEmptyHoverState();
        }
      }
      applyHoverState();
    },
    [applyHoverState]
  );

  return {
    hoveredTrackIdRef,
    hoveredTrackId,
    tooltipPosition,
    updateHoverState,
    clearHoverState
  };
}
