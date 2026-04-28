import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';

export type VolumeAnisotropyScale = {
  x: number;
  y: number;
  z: number;
};

type UseVolumeViewerAnisotropyParams = {
  volumeAnisotropyScaleRef: MutableRefObject<VolumeAnisotropyScale>;
  volumeStepScaleBaseRef: MutableRefObject<number>;
  volumeStepScaleRatioRef: MutableRefObject<number>;
  volumeStepScaleRef: MutableRefObject<number>;
};

const IDENTITY_VOLUME_ANISOTROPY_SCALE: VolumeAnisotropyScale = { x: 1, y: 1, z: 1 };

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
  volumeAnisotropyScaleRef,
  volumeStepScaleBaseRef,
  volumeStepScaleRatioRef,
  volumeStepScaleRef,
}: UseVolumeViewerAnisotropyParams) {
  const resolvedAnisotropyScale = useMemo(
    () => IDENTITY_VOLUME_ANISOTROPY_SCALE,
    [],
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
