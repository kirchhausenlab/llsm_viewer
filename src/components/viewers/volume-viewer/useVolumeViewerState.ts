import { useRef, useState } from 'react';
import * as THREE from 'three';
import { DESKTOP_VOLUME_STEP_SCALE } from './vr';
import type {
  FollowedVoxelTarget,
  TrackLineResource,
  VolumeViewerProps,
} from '../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../../types/hover';

export function useVolumeViewerState() {
  const currentDimensionsRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const volumeRootGroupRef = useRef<THREE.Group | null>(null);
  const volumeRootBaseOffsetRef = useRef(new THREE.Vector3());
  const volumeRootCenterOffsetRef = useRef(new THREE.Vector3());
  const volumeRootCenterUnscaledRef = useRef(new THREE.Vector3());
  const volumeRootHalfExtentsRef = useRef(new THREE.Vector3());
  const volumeNormalizationScaleRef = useRef(1);
  const volumeUserScaleRef = useRef(1);
  const volumeStepScaleRef = useRef(DESKTOP_VOLUME_STEP_SCALE);
  const volumeYawRef = useRef(0);
  const volumePitchRef = useRef(0);
  const volumeRootRotatedCenterTempRef = useRef(new THREE.Vector3());
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const trackLinesRef = useRef<Map<string, TrackLineResource>>(new Map());
  const followedTrackIdRef = useRef<string | null>(null);
  const followTargetOffsetRef = useRef<THREE.Vector3 | null>(null);
  const previousFollowTargetKeyRef = useRef<string | null>(null);
  const followTargetActiveRef = useRef(false);
  const followedVoxelRef = useRef<FollowedVoxelTarget | null>(null);
  const hasActive3DLayerRef = useRef(false);
  const [hasMeasured, setHasMeasured] = useState(false);
  const [renderContextRevision, setRenderContextRevision] = useState(0);
  const layersRef = useRef<VolumeViewerProps['layers']>([] as VolumeViewerProps['layers']);
  const hoverIntensityRef = useRef<HoveredVoxelInfo | null>(null);
  const hoveredVoxelRef = useRef<{
    layerKey: string | null;
    normalizedPosition: THREE.Vector3 | null;
    segmentationLabel: number | null;
  }>({
    layerKey: null,
    normalizedPosition: null,
    segmentationLabel: null,
  });
  const voxelHoverDebugRef = useRef<string | null>(null);
  const [voxelHoverDebug, setVoxelHoverDebug] = useState<string | null>(null);
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const resetVolumeCallbackRef = useRef<() => void>(() => {});
  const resetHudPlacementCallbackRef = useRef<() => void>(() => {});
  const trackFollowRequestCallbackRef = useRef<(trackId: string) => void>(() => {});

  return {
    containerNode,
    setContainerNode,
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
    trackGroupRef,
    trackLinesRef,
    followedTrackIdRef,
    followTargetOffsetRef,
    previousFollowTargetKeyRef,
    followTargetActiveRef,
    followedVoxelRef,
    hasActive3DLayerRef,
    hasMeasured,
    setHasMeasured,
    renderContextRevision,
    setRenderContextRevision,
    layersRef,
    hoverIntensityRef,
    hoveredVoxelRef,
    voxelHoverDebugRef,
    voxelHoverDebug,
    setVoxelHoverDebug,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
    trackFollowRequestCallbackRef,
  } as const;
}
