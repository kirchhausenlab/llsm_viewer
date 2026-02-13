import { useCallback, useEffect, useRef, useState } from 'react';

type TooltipPosition = { x: number; y: number } | null;

export function usePlanarTrackHoverState() {
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>(null);
  const hoveredTrackIdRef = useRef<string | null>(null);

  useEffect(() => {
    hoveredTrackIdRef.current = hoveredTrackId;
  }, [hoveredTrackId]);

  const updateHoverState = useCallback((trackId: string | null, position: TooltipPosition) => {
    if (hoveredTrackIdRef.current !== trackId) {
      hoveredTrackIdRef.current = trackId;
      setHoveredTrackId(trackId);
    }
    setTooltipPosition(position);
  }, []);

  const clearHoverState = useCallback(() => {
    if (hoveredTrackIdRef.current !== null) {
      hoveredTrackIdRef.current = null;
      setHoveredTrackId(null);
    }
    setTooltipPosition(null);
  }, []);

  return {
    hoveredTrackId,
    tooltipPosition,
    updateHoverState,
    clearHoverState
  };
}
