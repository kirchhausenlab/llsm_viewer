import { useEffect, useMemo, useRef } from 'react';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { ViewerLayer } from './types';

export type PlanarVolumeShape = {
  width: number;
  height: number;
  depth: number;
};

export function findPrimaryPlanarVolume(layers: ViewerLayer[]): NormalizedVolume | null {
  for (const layer of layers) {
    if (layer.volume) {
      return layer.volume;
    }
  }
  return null;
}

export function toPlanarVolumeShape(
  volume: Pick<NormalizedVolume, 'width' | 'height' | 'depth'> | null,
): PlanarVolumeShape | null {
  if (!volume) {
    return null;
  }
  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
  };
}

export function shouldRequestPlanarAutoFit(
  previous: PlanarVolumeShape | null,
  current: PlanarVolumeShape | null,
): boolean {
  if (!current) {
    return true;
  }
  if (!previous) {
    return true;
  }
  return (
    previous.width !== current.width
    || previous.height !== current.height
    || previous.depth !== current.depth
  );
}

export function usePlanarPrimaryVolume({
  layers,
  requestAutoFit,
}: {
  layers: ViewerLayer[];
  requestAutoFit: () => void;
}) {
  const previousShapeRef = useRef<PlanarVolumeShape | null>(null);
  const primaryVolume = useMemo(() => findPrimaryPlanarVolume(layers), [layers]);

  useEffect(() => {
    const currentShape = toPlanarVolumeShape(primaryVolume);
    const previousShape = previousShapeRef.current;

    if (!currentShape) {
      previousShapeRef.current = null;
      requestAutoFit();
      return;
    }

    previousShapeRef.current = currentShape;
    if (shouldRequestPlanarAutoFit(previousShape, currentShape)) {
      requestAutoFit();
    }
  }, [primaryVolume, requestAutoFit]);

  return { primaryVolume } as const;
}
