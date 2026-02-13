import { useCallback, useEffect, type MutableRefObject } from 'react';
import { clamp } from '../../utils';
import type {
  HoveredIntensityInfo,
  HoveredPixel,
  PlanarLayout,
  PlanarViewerProps,
  SliceData,
  ViewState
} from '../../types';

type UsePlanarPixelHoverParams = {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  layout: PlanarLayout;
  viewStateRef: MutableRefObject<ViewState>;
  sliceData: SliceData | null;
  samplePixelValue: (x: number, y: number) => HoveredIntensityInfo | null;
  clampedSliceIndex: number;
  trackScale: { x: number; y: number };
  hoveredPixelRef: MutableRefObject<HoveredPixel>;
  onHoveredPixelChange: (value: HoveredPixel) => void;
  onHoverVoxelChange?: PlanarViewerProps['onHoverVoxelChange'];
};

export function usePlanarPixelHover({
  canvasRef,
  layout,
  viewStateRef,
  sliceData,
  samplePixelValue,
  clampedSliceIndex,
  trackScale,
  hoveredPixelRef,
  onHoveredPixelChange,
  onHoverVoxelChange
}: UsePlanarPixelHoverParams) {
  const emitHoverVoxel = useCallback(
    (value: Parameters<NonNullable<PlanarViewerProps['onHoverVoxelChange']>>[0]) => {
      onHoverVoxelChange?.(value);
    },
    [onHoverVoxelChange]
  );

  const updateHoveredPixel = useCallback(
    (value: HoveredPixel) => {
      const previous = hoveredPixelRef.current;
      if (
        (previous === null && value === null) ||
        (previous && value && previous.x === value.x && previous.y === value.y)
      ) {
        return;
      }

      hoveredPixelRef.current = value;
      onHoveredPixelChange(value);
    },
    [hoveredPixelRef, onHoveredPixelChange]
  );

  const clearPixelInfo = useCallback(() => {
    updateHoveredPixel(null);
    emitHoverVoxel(null);
  }, [emitHoverVoxel, updateHoveredPixel]);

  const updatePixelHover = useCallback(
    (event: PointerEvent) => {
      if (!sliceData || !sliceData.hasLayer || !layout.xy) {
        clearPixelInfo();
        return;
      }

      const canvas = (event.currentTarget as HTMLCanvasElement | null) ?? canvasRef.current;
      if (!canvas) {
        clearPixelInfo();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width <= 0 || height <= 0) {
        clearPixelInfo();
        return;
      }

      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      if (pointerX < 0 || pointerY < 0 || pointerX > width || pointerY > height) {
        clearPixelInfo();
        return;
      }

      const currentView = viewStateRef.current;
      const scale = Math.max(currentView.scale, 1e-6);
      const rotation = currentView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const centerX = width / 2 + currentView.offsetX;
      const centerY = height / 2 + currentView.offsetY;
      const dx = pointerX - centerX;
      const dy = pointerY - centerY;
      const rotatedX = dx * cos + dy * sin;
      const rotatedY = -dx * sin + dy * cos;
      const blockX = rotatedX / scale + layout.blockWidth / 2;
      const blockY = rotatedY / scale + layout.blockHeight / 2;

      const xyView = layout.xy;
      if (
        !xyView ||
        blockX < xyView.originX ||
        blockY < xyView.originY ||
        blockX >= xyView.originX + xyView.width ||
        blockY >= xyView.originY + xyView.height
      ) {
        clearPixelInfo();
        return;
      }

      const sliceX = blockX - xyView.originX;
      const sliceY = blockY - xyView.originY;

      const scaleX = Math.max(trackScale.x, 1e-6);
      const scaleY = Math.max(trackScale.y, 1e-6);
      const voxelXFloat = sliceX / scaleX;
      const voxelYFloat = sliceY / scaleY;

      const intensity = samplePixelValue(voxelXFloat, voxelYFloat);
      if (!intensity) {
        clearPixelInfo();
        return;
      }

      const voxelX = Math.round(clamp(voxelXFloat, 0, Math.max(0, sliceData.width - 1)));
      const voxelY = Math.round(clamp(voxelYFloat, 0, Math.max(0, sliceData.height - 1)));
      updateHoveredPixel({ x: voxelX, y: voxelY });
      emitHoverVoxel({
        intensity: intensity.intensity,
        components: intensity.components,
        coordinates: {
          x: voxelX,
          y: voxelY,
          z: clampedSliceIndex
        }
      });
    },
    [
      clampedSliceIndex,
      clearPixelInfo,
      emitHoverVoxel,
      samplePixelValue,
      sliceData,
      layout,
      trackScale.x,
      trackScale.y,
      updateHoveredPixel,
      viewStateRef,
      canvasRef
    ]
  );

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
    };
  }, [emitHoverVoxel]);

  return { updatePixelHover };
}
