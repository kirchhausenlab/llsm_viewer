import { useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { HoveredPixel, PlanarViewerProps, SliceData } from './types';

export function shouldClearPlanarHoverState(sliceData: SliceData | null): boolean {
  return !sliceData || !sliceData.hasLayer;
}

type UsePlanarViewerBindingsParams = {
  onRegisterCaptureTarget: PlanarViewerProps['onRegisterCaptureTarget'];
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  sliceData: SliceData | null;
  setHoveredPixel: Dispatch<SetStateAction<HoveredPixel>>;
  onHoverVoxelChange: PlanarViewerProps['onHoverVoxelChange'];
};

export function usePlanarViewerBindings({
  onRegisterCaptureTarget,
  canvasRef,
  sliceData,
  setHoveredPixel,
  onHoverVoxelChange,
}: UsePlanarViewerBindingsParams) {
  useEffect(() => {
    if (!onRegisterCaptureTarget) {
      return;
    }

    const getCanvas = () => canvasRef.current;
    onRegisterCaptureTarget(canvasRef.current ? getCanvas : null);

    return () => {
      onRegisterCaptureTarget(null);
    };
  }, [canvasRef, onRegisterCaptureTarget]);

  useEffect(() => {
    if (!shouldClearPlanarHoverState(sliceData)) {
      return;
    }
    setHoveredPixel(null);
    onHoverVoxelChange?.(null);
  }, [onHoverVoxelChange, setHoveredPixel, sliceData]);
}
