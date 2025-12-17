import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { PlanarLayout, PlanarLayoutView, ViewState } from '../types';
import { clamp } from '../utils';

export const ROTATION_KEY_STEP = 0.1;
export const PAN_STEP = 40;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 40;
export const ORTHOGONAL_GAP = 16;

function createLayout(
  primaryVolume: { width: number; height: number; depth: number } | null,
  orthogonalViewsEnabled: boolean,
  voxelScale: { x: number; y: number; z: number }
): PlanarLayout {
  if (!primaryVolume) {
    return {
      blockWidth: 0,
      blockHeight: 0,
      gap: ORTHOGONAL_GAP,
      xy: null,
      xz: null,
      zy: null
    };
  }

  const safeScaleX = Number.isFinite(voxelScale.x) && voxelScale.x > 0 ? voxelScale.x : 1;
  const safeScaleY = Number.isFinite(voxelScale.y) && voxelScale.y > 0 ? voxelScale.y : 1;
  const safeScaleZ = Number.isFinite(voxelScale.z) && voxelScale.z > 0 ? voxelScale.z : 1;

  const xyWidth = primaryVolume.width * safeScaleX;
  const xyHeight = primaryVolume.height * safeScaleY;

  const xy: PlanarLayoutView = {
    width: xyWidth,
    height: xyHeight,
    originX: 0,
    originY: 0,
    centerX: xyWidth / 2,
    centerY: xyHeight / 2
  };

  if (!orthogonalViewsEnabled || primaryVolume.depth <= 1) {
    return {
      blockWidth: xyWidth,
      blockHeight: xyHeight,
      gap: ORTHOGONAL_GAP,
      xy,
      xz: null,
      zy: null
    };
  }

  const xzWidth = primaryVolume.width * safeScaleX;
  const xzHeight = primaryVolume.depth * safeScaleZ;
  const zyWidth = primaryVolume.depth * safeScaleZ;
  const zyHeight = primaryVolume.height * safeScaleY;

  return {
    blockWidth: xyWidth + ORTHOGONAL_GAP + zyWidth,
    blockHeight: xyHeight + ORTHOGONAL_GAP + xzHeight,
    gap: ORTHOGONAL_GAP,
    xy,
    xz: {
      width: xzWidth,
      height: xzHeight,
      originX: 0,
      originY: xyHeight + ORTHOGONAL_GAP,
      centerX: xzWidth / 2,
      centerY: xyHeight + ORTHOGONAL_GAP + xzHeight / 2
    },
    zy: {
      width: zyWidth,
      height: zyHeight,
      originX: xyWidth + ORTHOGONAL_GAP,
      originY: 0,
      centerX: xyWidth + ORTHOGONAL_GAP + zyWidth / 2,
      centerY: zyHeight / 2
    }
  };
}

export function createInitialViewState(): ViewState {
  return { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };
}

type UsePlanarLayoutParams = {
  primaryVolume: { width: number; height: number; depth: number } | null;
  orthogonalViewsEnabled: boolean;
  voxelScale: { x: number; y: number; z: number };
  containerRef: MutableRefObject<HTMLDivElement | null>;
  onRegisterReset: (handler: (() => void) | null) => void;
};

export function usePlanarLayout({
  primaryVolume,
  orthogonalViewsEnabled,
  voxelScale,
  containerRef,
  onRegisterReset
}: UsePlanarLayoutParams) {
  const [viewState, setViewState] = useState<ViewState>(() => createInitialViewState());
  const viewStateRef = useRef(viewState);
  const previousLayoutRef = useRef<PlanarLayout | null>(null);

  useEffect(() => {
    viewStateRef.current = viewState;
  }, [viewState]);

  const layout = useMemo(
    () => createLayout(primaryVolume, orthogonalViewsEnabled, voxelScale),
    [orthogonalViewsEnabled, primaryVolume, voxelScale.x, voxelScale.y, voxelScale.z]
  );

  const updateViewState = useCallback(
    (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => {
      setViewState((previous) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: ViewState) => ViewState)(previous)
            : { ...previous, ...updater };
        viewStateRef.current = next;
        return next;
      });
    },
    []
  );

  useEffect(() => {
    const previous = previousLayoutRef.current;
    previousLayoutRef.current = layout;

    if (!previous || !previous.xy || !layout.xy) {
      return;
    }

    const previousOffsetFromCenter = {
      x: previous.xy.centerX - previous.blockWidth / 2,
      y: previous.xy.centerY - previous.blockHeight / 2
    };

    const nextOffsetFromCenter = {
      x: layout.xy.centerX - layout.blockWidth / 2,
      y: layout.xy.centerY - layout.blockHeight / 2
    };

    const deltaX = previousOffsetFromCenter.x - nextOffsetFromCenter.x;
    const deltaY = previousOffsetFromCenter.y - nextOffsetFromCenter.y;

    if (Math.abs(deltaX) < 1e-6 && Math.abs(deltaY) < 1e-6) {
      return;
    }

    updateViewState((previousView) => {
      const scale = Math.max(previousView.scale, 1e-6);
      const rotation = previousView.rotation;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const scaledX = deltaX * scale;
      const scaledY = deltaY * scale;

      const rotatedX = scaledX * cos - scaledY * sin;
      const rotatedY = scaledX * sin + scaledY * cos;

      const nextOffsetX = previousView.offsetX + rotatedX;
      const nextOffsetY = previousView.offsetY + rotatedY;

      if (
        Math.abs(nextOffsetX - previousView.offsetX) < 1e-3 &&
        Math.abs(nextOffsetY - previousView.offsetY) < 1e-3
      ) {
        return previousView;
      }

      return { ...previousView, offsetX: nextOffsetX, offsetY: nextOffsetY };
    });
  }, [layout, updateViewState]);

  const resetView = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.blockWidth <= 0 || layout.blockHeight <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width <= 0 || height <= 0) {
      updateViewState(createInitialViewState());
      return;
    }
    const scaleX = width / layout.blockWidth;
    const scaleY = height / layout.blockHeight;
    const fitScale = clamp(Math.min(scaleX, scaleY) || 1, MIN_SCALE, MAX_SCALE);
    updateViewState({ scale: fitScale, offsetX: 0, offsetY: 0, rotation: 0 });
  }, [containerRef, layout.blockHeight, layout.blockWidth, updateViewState]);

  useEffect(() => {
    onRegisterReset(resetView);
    return () => {
      onRegisterReset(null);
    };
  }, [onRegisterReset, resetView]);

  return { layout, viewState, viewStateRef, updateViewState, resetView };
}
