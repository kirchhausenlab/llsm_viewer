import { useMemo } from 'react';
import type * as THREE from 'three';
import type { RefObject } from 'react';
import { useLoadingOverlay } from './useLoadingOverlay';
import { useVolumeResources } from './useVolumeResources';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../types/hover';

export function useVolumeViewerDataState({
  layers,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
}: {
  layers: VolumeViewerProps['layers'];
  isLoading: VolumeViewerProps['isLoading'];
  loadingProgress: VolumeViewerProps['loadingProgress'];
  loadedVolumes: VolumeViewerProps['loadedVolumes'];
  expectedVolumes: VolumeViewerProps['expectedVolumes'];
}) {
  const { showLoadingOverlay } = useLoadingOverlay({
    isLoading,
    loadingProgress,
    loadedVolumes,
    expectedVolumes,
  });

  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);

  const hasRenderableLayer = Boolean(primaryVolume);
  const hasActive3DLayer = useMemo(
    () =>
      layers.some((layer) => {
        if (!layer.volume) {
          return false;
        }
        const viewerMode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : layer.volume.depth > 1
              ? '3d'
              : 'slice';

        return viewerMode === '3d';
      }),
    [layers],
  );

  return { showLoadingOverlay, primaryVolume, hasRenderableLayer, hasActive3DLayer } as const;
}

export function useVolumeViewerResources({
  layers,
  primaryVolume,
  isAdditiveBlending,
  renderContextRevision,
  sceneRef,
  cameraRef,
  controlsRef,
  rotationTargetRef,
  defaultViewStateRef,
  trackGroupRef,
  resourcesRef,
  currentDimensionsRef,
  colormapCacheRef,
  volumeRootGroupRef,
  volumeRootBaseOffsetRef,
  volumeRootCenterOffsetRef,
  volumeRootCenterUnscaledRef,
  volumeRootHalfExtentsRef,
  volumeNormalizationScaleRef,
  volumeUserScaleRef,
  volumeStepScaleRef,
  volumeYawRef,
  volumePitchRef,
  volumeRootRotatedCenterTempRef,
  applyTrackGroupTransform,
  applyVolumeRootTransform,
  applyVolumeStepScaleToResources,
  applyHoverHighlightToResources,
}: {
  layers: VolumeViewerProps['layers'];
  primaryVolume: ReturnType<typeof useVolumeViewerDataState>['primaryVolume'];
  isAdditiveBlending: boolean;
  renderContextRevision: number;
  sceneRef: RefObject<THREE.Scene | null>;
  cameraRef: RefObject<THREE.PerspectiveCamera | null>;
  controlsRef: RefObject<any>;
  rotationTargetRef: RefObject<THREE.Vector3 | null>;
  defaultViewStateRef: RefObject<any>;
  trackGroupRef: RefObject<THREE.Group | null>;
  resourcesRef: RefObject<Map<string, VolumeResources>>;
  currentDimensionsRef: RefObject<{ width: number; height: number; depth: number } | null>;
  colormapCacheRef: RefObject<Map<string, THREE.DataTexture>>;
  volumeRootGroupRef: RefObject<THREE.Group | null>;
  volumeRootBaseOffsetRef: RefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: RefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef: RefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: RefObject<THREE.Vector3>;
  volumeNormalizationScaleRef: RefObject<number>;
  volumeUserScaleRef: RefObject<number>;
  volumeStepScaleRef: RefObject<number>;
  volumeYawRef: RefObject<number>;
  volumePitchRef: RefObject<number>;
  volumeRootRotatedCenterTempRef: RefObject<THREE.Vector3>;
  applyTrackGroupTransform: (dimensions: { width: number; height: number; depth: number }) => void;
  applyVolumeRootTransform: () => void;
  applyVolumeStepScaleToResources: (value: number) => void;
  applyHoverHighlightToResources: (value?: HoveredVoxelInfo | null) => void;
}) {
  const { getColormapTexture } = useVolumeResources({
    layers,
    primaryVolume,
    isAdditiveBlending,
    renderContextRevision,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    trackGroupRef,
    resourcesRef,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    applyHoverHighlightToResources,
  });

  return { getColormapTexture } as const;
}
