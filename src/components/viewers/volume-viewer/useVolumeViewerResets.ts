import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { VolumeViewerProps } from '../VolumeViewer.types';
import { VR_VOLUME_BASE_OFFSET } from './vr';

type UseVolumeViewerResetsParams = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  defaultViewStateRef: MutableRefObject<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeStepScaleBaseRef: MutableRefObject<number>;
  volumeStepScaleRatioRef: MutableRefObject<number>;
  volumeStepScaleRef: MutableRefObject<number>;
  resetVolumeCallbackRef: MutableRefObject<(() => void) | null>;
  resetHudPlacementCallbackRef: MutableRefObject<(() => void) | null>;
  applyVolumeRootTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeStepScaleToResources: (scale: number) => void;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  onRegisterVolumeStepScaleChange: VolumeViewerProps['onRegisterVolumeStepScaleChange'];
  onRegisterReset: VolumeViewerProps['onRegisterReset'];
  hasRenderableLayer: boolean;
};

export function useVolumeViewerResets({
  rendererRef,
  cameraRef,
  controlsRef,
  defaultViewStateRef,
  rotationTargetRef,
  currentDimensionsRef,
  volumeRootBaseOffsetRef,
  volumeYawRef,
  volumePitchRef,
  volumeUserScaleRef,
  volumeStepScaleBaseRef,
  volumeStepScaleRatioRef,
  volumeStepScaleRef,
  resetVolumeCallbackRef,
  resetHudPlacementCallbackRef,
  applyVolumeRootTransform,
  applyVolumeStepScaleToResources,
  resetVrPlaybackHudPlacement,
  resetVrChannelsHudPlacement,
  resetVrTracksHudPlacement,
  onRegisterVolumeStepScaleChange,
  onRegisterReset,
  hasRenderableLayer,
}: UseVolumeViewerResetsParams) {
  const handleResetHudPlacement = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (!isVrPresenting) {
      return;
    }
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
  }, [
    rendererRef,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
  ]);
  resetHudPlacementCallbackRef.current = handleResetHudPlacement;

  const handleResetVolume = useCallback(() => {
    const renderer = rendererRef.current;
    const isVrPresenting = renderer?.xr?.isPresenting ?? false;
    if (isVrPresenting) {
      volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
    } else {
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
    }

    volumeYawRef.current = 0;
    volumePitchRef.current = 0;
    volumeUserScaleRef.current = 1;
    applyVolumeRootTransform(currentDimensionsRef.current);

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls) {
      return;
    }

    const defaultViewState = defaultViewStateRef.current;
    if (defaultViewState && camera) {
      camera.up.set(0, 1, 0);
      camera.position.copy(defaultViewState.position);
      controls.target.copy(defaultViewState.target);
      rotationTargetRef.current.copy(defaultViewState.target);
      camera.lookAt(defaultViewState.target);
      controls.update();
      return;
    }

    controls.reset();
    controls.target.copy(rotationTargetRef.current);
    if (camera) {
      camera.up.set(0, 1, 0);
      camera.lookAt(controls.target);
    }
    controls.update();
  }, [
    applyVolumeRootTransform,
    cameraRef,
    controlsRef,
    currentDimensionsRef,
    defaultViewStateRef,
    rendererRef,
    rotationTargetRef,
    volumePitchRef,
    volumeRootBaseOffsetRef,
    volumeUserScaleRef,
    volumeYawRef,
  ]);
  resetVolumeCallbackRef.current = handleResetVolume;

  const handleResetView = useCallback(() => {
    handleResetVolume();
    handleResetHudPlacement();
  }, [handleResetHudPlacement, handleResetVolume]);

  const handleVolumeStepScaleChange = useCallback(
    (stepScale: number) => {
      const clampedStepScale = Math.max(stepScale, 1e-3);
      volumeStepScaleBaseRef.current = clampedStepScale;
      const ratio = Math.max(volumeStepScaleRatioRef.current, 1);
      const effectiveStepScale = clampedStepScale * ratio;
      volumeStepScaleRef.current = effectiveStepScale;
      applyVolumeStepScaleToResources(effectiveStepScale);
    },
    [
      applyVolumeStepScaleToResources,
      volumeStepScaleBaseRef,
      volumeStepScaleRatioRef,
      volumeStepScaleRef,
    ],
  );

  useEffect(() => {
    if (!onRegisterVolumeStepScaleChange) {
      return undefined;
    }

    onRegisterVolumeStepScaleChange(handleVolumeStepScaleChange);
    return () => {
      onRegisterVolumeStepScaleChange(null);
    };
  }, [handleVolumeStepScaleChange, onRegisterVolumeStepScaleChange]);

  useEffect(() => {
    onRegisterReset(hasRenderableLayer ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, hasRenderableLayer, onRegisterReset]);
}
