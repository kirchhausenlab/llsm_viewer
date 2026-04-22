import { useMemo } from 'react';
import type * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { useLoadingOverlay } from '../../../shared/hooks/useLoadingOverlay';
import type {
  DesktopViewStateMap,
  DesktopViewerCamera,
  ViewerProjectionMode,
} from '../../../hooks/useVolumeRenderSetup';
import { useVolumeResources } from './useVolumeResources';
import type { VolumeResources, VolumeViewerProps } from '../VolumeViewer.types';
import { RENDER_STYLE_SLICE } from '../../../state/layerSettings';

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
  const hasAtlasOnlyLayer = useMemo(
    () =>
      layers.some(
        (layer) =>
          !layer.volume &&
          layer.brickAtlas?.enabled &&
          layer.brickAtlas.pageTable.volumeShape[0] > 0 &&
          layer.brickAtlas.pageTable.volumeShape[1] > 0 &&
          layer.brickAtlas.pageTable.volumeShape[2] > 0
      ),
    [layers]
  );
  const hasActive3DLayer = useMemo(
    () =>
      layers.some((layer) => {
        if (layer.renderStyle === RENDER_STYLE_SLICE) {
          return false;
        }
        const depth = layer.volume?.depth ?? layer.brickAtlas?.pageTable.volumeShape[0] ?? 0;
        if (depth <= 0) {
          return false;
        }
        const viewerMode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : depth > 1
              ? '3d'
              : 'slice';

        return viewerMode === '3d';
      }),
    [layers],
  );

  return {
    showLoadingOverlay,
    primaryVolume,
    hasRenderableLayer: hasRenderableLayer || hasAtlasOnlyLayer,
    hasActive3DLayer
  } as const;
}

export function useVolumeViewerResources({
  layers,
  playbackWarmupLayers,
  playbackWarmupFrames,
  primaryVolume,
  isAdditiveBlending,
  zClipFrontFraction,
  projectionMode,
  renderContextRevision,
  rendererRef,
  sceneRef,
  cameraRef,
  controlsRef,
  rotationTargetRef,
  defaultViewStateRef,
  projectionViewStateRef,
  trackGroupRef,
  roiBlOcclusionAlphaSceneRef,
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
  playbackWarmupLayers?: VolumeViewerProps['playbackWarmupLayers'];
  playbackWarmupFrames?: VolumeViewerProps['playbackWarmupFrames'];
  primaryVolume: ReturnType<typeof useVolumeViewerDataState>['primaryVolume'];
  isAdditiveBlending: boolean;
  zClipFrontFraction: number;
  projectionMode: ViewerProjectionMode;
  renderContextRevision: number;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  controlsRef: MutableRefObject<any>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  defaultViewStateRef: MutableRefObject<DesktopViewStateMap>;
  projectionViewStateRef: MutableRefObject<DesktopViewStateMap>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  roiBlOcclusionAlphaSceneRef: MutableRefObject<THREE.Scene | null>;
  roiBlOcclusionDepthSceneRef: MutableRefObject<THREE.Scene | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  colormapCacheRef: MutableRefObject<Map<string, THREE.DataTexture>>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef: MutableRefObject<number>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeStepScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  volumeRootRotatedCenterTempRef: MutableRefObject<THREE.Vector3>;
  applyTrackGroupTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeRootTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeStepScaleToResources: (value: number) => void;
  applyHoverHighlightToResources: () => void;
}) {
  const { getColormapTexture, getPlaybackWarmupStatus } = useVolumeResources({
    layers,
    playbackWarmupLayers,
    playbackWarmupFrames,
    primaryVolume,
    isAdditiveBlending,
    zClipFrontFraction,
    projectionMode,
    renderContextRevision,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    projectionViewStateRef,
    trackGroupRef,
    roiBlOcclusionAlphaSceneRef,
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

  return { getColormapTexture, getPlaybackWarmupStatus } as const;
}
