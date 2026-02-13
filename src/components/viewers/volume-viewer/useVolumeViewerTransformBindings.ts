import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { VrChannelsHud, VrHudPlacement, VrPlaybackHud, VrTracksHud } from './vr';
import type { UseVolumeViewerVrResult } from './useVolumeViewerVr';
import type { VolumeAnisotropyScale } from './useVolumeViewerAnisotropy';

type VolumeDimensions = { width: number; height: number; depth: number };

type UseVolumeViewerTransformBindingsParams = {
  updateHudGroupFromPlacement: UseVolumeViewerVrResult['updateHudGroupFromPlacement'];
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  applyVolumeRootTransform: (dimensions: VolumeDimensions | null) => void;
  applyTrackGroupTransform: (dimensions: VolumeDimensions | null) => void;
  currentDimensionsRef: MutableRefObject<VolumeDimensions | null>;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  volumeStepScaleRef: MutableRefObject<number>;
  anisotropyStepRatio: number;
  resolvedAnisotropyScale: VolumeAnisotropyScale;
};

export function useVolumeViewerTransformBindings({
  updateHudGroupFromPlacement,
  vrPlaybackHudRef,
  vrChannelsHudRef,
  vrTracksHudRef,
  vrPlaybackHudPlacementRef,
  vrChannelsHudPlacementRef,
  vrTracksHudPlacementRef,
  applyVolumeRootTransform,
  applyTrackGroupTransform,
  currentDimensionsRef,
  applyVolumeStepScaleToResources,
  volumeStepScaleRef,
  anisotropyStepRatio,
  resolvedAnisotropyScale,
}: UseVolumeViewerTransformBindingsParams) {
  const refreshVrHudPlacements = useCallback(() => {
    updateHudGroupFromPlacement(
      vrPlaybackHudRef.current,
      vrPlaybackHudPlacementRef.current ?? null,
    );
    updateHudGroupFromPlacement(
      vrChannelsHudRef.current,
      vrChannelsHudPlacementRef.current ?? null,
    );
    updateHudGroupFromPlacement(
      vrTracksHudRef.current,
      vrTracksHudPlacementRef.current ?? null,
    );
  }, [
    updateHudGroupFromPlacement,
    vrChannelsHudPlacementRef,
    vrChannelsHudRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudRef,
  ]);

  const applyVolumeRootTransformRef = useRef(applyVolumeRootTransform);
  const applyTrackGroupTransformRef = useRef(applyTrackGroupTransform);
  const refreshVrHudPlacementsRef = useRef(refreshVrHudPlacements);

  useEffect(() => {
    applyVolumeRootTransformRef.current = applyVolumeRootTransform;
    applyTrackGroupTransformRef.current = applyTrackGroupTransform;
    refreshVrHudPlacementsRef.current = refreshVrHudPlacements;
  }, [applyTrackGroupTransform, applyVolumeRootTransform, refreshVrHudPlacements]);

  useEffect(() => {
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);
    applyTrackGroupTransformRef.current?.(currentDimensionsRef.current);
  }, [applyTrackGroupTransform, applyVolumeRootTransform, currentDimensionsRef]);

  useEffect(() => {
    applyVolumeRootTransformRef.current?.(currentDimensionsRef.current);
    applyVolumeStepScaleToResources(volumeStepScaleRef.current);
  }, [
    anisotropyStepRatio,
    applyVolumeStepScaleToResources,
    currentDimensionsRef,
    resolvedAnisotropyScale.x,
    resolvedAnisotropyScale.y,
    resolvedAnisotropyScale.z,
    volumeStepScaleRef,
  ]);

  return {
    applyVolumeRootTransformRef,
    applyTrackGroupTransformRef,
    refreshVrHudPlacementsRef,
  } as const;
}
