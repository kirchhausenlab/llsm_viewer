import { useEffect, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HoveredPixel, SliceData } from './types';
import { updatePlanarOffscreenCanvas } from './planarSliceCanvas';

type CanvasSize = { width: number; height: number };

type UsePlanarViewerCanvasLifecycleParams = {
  drawSlice: () => void;
  selectedTrackIds: ReadonlySet<string>;
  hoveredPixel: HoveredPixel;
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  setHasMeasured: Dispatch<SetStateAction<boolean>>;
  setCanvasSize: Dispatch<SetStateAction<CanvasSize>>;
  autoFitRequestRevision: number;
  requestAutoFit: () => void;
  resetView: () => void;
  sliceData: SliceData | null;
  xyCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  xyContextRef: MutableRefObject<CanvasRenderingContext2D | null>;
};

export function shouldAnimatePlanarSlice(
  selectedTrackCount: number,
  hoveredPixel: HoveredPixel,
): boolean {
  return selectedTrackCount > 0 || hoveredPixel !== null;
}

export function usePlanarViewerCanvasLifecycle({
  drawSlice,
  selectedTrackIds,
  hoveredPixel,
  canvasRef,
  containerRef,
  setHasMeasured,
  setCanvasSize,
  autoFitRequestRevision,
  requestAutoFit,
  resetView,
  sliceData,
  xyCanvasRef,
  xyContextRef,
}: UsePlanarViewerCanvasLifecycleParams) {
  const [sliceRevision, setSliceRevision] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frameId: number | null = null;
    let isRunning = true;

    const animate = () => {
      if (!isRunning) {
        return;
      }
      drawSlice();
      frameId = window.requestAnimationFrame(animate);
    };

    if (shouldAnimatePlanarSlice(selectedTrackIds.size, hoveredPixel)) {
      frameId = window.requestAnimationFrame(animate);
    }

    return () => {
      isRunning = false;
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [drawSlice, hoveredPixel, selectedTrackIds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        setHasMeasured(true);
      }
      setCanvasSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      requestAutoFit();
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, [canvasRef, containerRef, requestAutoFit, setCanvasSize, setHasMeasured]);

  useEffect(() => {
    const updatedXY = updatePlanarOffscreenCanvas(sliceData, xyCanvasRef, xyContextRef);
    if (updatedXY) {
      setSliceRevision((value) => value + 1);
    }
  }, [sliceData, xyCanvasRef, xyContextRef]);

  useEffect(() => {
    if (autoFitRequestRevision === 0) {
      return;
    }
    resetView();
  }, [autoFitRequestRevision, resetView]);

  useEffect(() => {
    drawSlice();
  }, [drawSlice, sliceRevision]);
}
