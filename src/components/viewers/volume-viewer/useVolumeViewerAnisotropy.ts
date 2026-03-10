import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';

export type VolumeAnisotropyScale = {
  x: number;
  y: number;
  z: number;
};

type TrackScaleLike = {
  x?: unknown;
  y?: unknown;
  z?: unknown;
} | null | undefined;

type UseVolumeViewerAnisotropyParams = {
  trackScale: TrackScaleLike;
  volumeAnisotropyScaleRef: MutableRefObject<VolumeAnisotropyScale>;
  volumeStepScaleBaseRef: MutableRefObject<number>;
  volumeStepScaleRatioRef: MutableRefObject<number>;
  volumeStepScaleRef: MutableRefObject<number>;
};

export function resolveAnisotropyAxis(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number.NaN;
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

export function resolveVolumeAnisotropyScale(trackScale: TrackScaleLike): VolumeAnisotropyScale {
  return {
    x: resolveAnisotropyAxis(trackScale?.x),
    y: resolveAnisotropyAxis(trackScale?.y),
    z: resolveAnisotropyAxis(trackScale?.z),
  };
}

export function computeAnisotropyStepRatio(scale: VolumeAnisotropyScale): number {
  const values = [scale.x, scale.y, scale.z];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const safeMin = Number.isFinite(min) && min > 0 ? min : 1;
  const safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  const ratio = safeMax / safeMin;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

export function useVolumeViewerAnisotropy({
  trackScale,
  volumeAnisotropyScaleRef,
  volumeStepScaleBaseRef,
  volumeStepScaleRatioRef,
  volumeStepScaleRef,
}: UseVolumeViewerAnisotropyParams) {
  const resolvedAnisotropyScale = useMemo(
    () => resolveVolumeAnisotropyScale(trackScale),
    [trackScale?.x, trackScale?.y, trackScale?.z],
  );

  const anisotropyStepRatio = useMemo(
    () => computeAnisotropyStepRatio(resolvedAnisotropyScale),
    [resolvedAnisotropyScale.x, resolvedAnisotropyScale.y, resolvedAnisotropyScale.z],
  );

  useEffect(() => {
    volumeAnisotropyScaleRef.current = resolvedAnisotropyScale;
    volumeStepScaleRatioRef.current = anisotropyStepRatio;
    const base = Math.max(volumeStepScaleBaseRef.current, 1e-3);
    volumeStepScaleRef.current = base * anisotropyStepRatio;
  }, [
    anisotropyStepRatio,
    resolvedAnisotropyScale,
    volumeAnisotropyScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeStepScaleRef,
  ]);

  return {
    resolvedAnisotropyScale,
    anisotropyStepRatio,
  } as const;
}
