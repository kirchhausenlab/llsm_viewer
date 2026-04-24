import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import type { VolumeViewerProps } from '../VolumeViewer.types';
import {
  applyDesktopViewState,
  captureDesktopViewState,
  type DesktopViewStateMap,
  type DesktopViewerCamera,
  type ViewerProjectionMode,
} from '../../../hooks/useVolumeRenderSetup';
import { resolveInitialVrVolumePlacement } from './vr';

type UseVolumeViewerResetsParams = {
  projectionMode: ViewerProjectionMode;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  defaultViewStateRef: MutableRefObject<DesktopViewStateMap>;
  projectionViewStateRef: MutableRefObject<DesktopViewStateMap>;
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
  projectionMode,
  rendererRef,
  cameraRef,
  controlsRef,
  defaultViewStateRef,
  projectionViewStateRef,
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
    let nextYaw = 0;
    let nextPitch = 0;
    if (isVrPresenting) {
      const placement = resolveInitialVrVolumePlacement({
        renderer,
        camera: cameraRef.current,
        target: volumeRootBaseOffsetRef.current,
      });
      nextYaw = placement.yaw;
      nextPitch = placement.pitch;
    } else {
      volumeRootBaseOffsetRef.current.set(0, 0, 0);
    }

    volumeYawRef.current = nextYaw;
    volumePitchRef.current = nextPitch;
    volumeUserScaleRef.current = 1;
    applyVolumeRootTransform(currentDimensionsRef.current);

    if (isVrPresenting) {
      return;
    }

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls) {
      return;
    }

    const defaultViewState = defaultViewStateRef.current[projectionMode];
    if (defaultViewState && camera) {
      const width = renderer?.domElement.clientWidth ?? 1;
      const height = renderer?.domElement.clientHeight ?? 1;
      applyDesktopViewState(camera, controls, defaultViewState, width, height);
      rotationTargetRef.current.copy(defaultViewState.target);
      projectionViewStateRef.current[projectionMode] = captureDesktopViewState(
        camera,
        controls.target,
        projectionMode,
        controls,
      );
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
    projectionMode,
    projectionViewStateRef,
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
