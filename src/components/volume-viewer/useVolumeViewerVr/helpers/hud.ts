import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { VR_PLAYBACK_MAX_FPS, VR_PLAYBACK_MIN_FPS } from '../../vr';
import { createHudController, computeHudFrameFromVolume } from '../../vr/hud';
import {
  setVrPlaybackFpsFraction,
  setVrPlaybackFpsLabel,
  setVrPlaybackLabel,
  setVrPlaybackProgressFraction,
} from '../../vr/hudMutators';
import type {
  PlaybackState,
  VrChannelsHud,
  VrChannelsState,
  VrHoverState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from '../../vr';
import type { UseVolumeViewerVrResult } from '../../useVolumeViewerVr.types';

export type CreateHudHelpersParams = {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3 | null>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrHudOffsetTempRef: MutableRefObject<THREE.Vector3>;
  vrHudYawEulerRef: MutableRefObject<THREE.Euler>;
  vrHudYawQuaternionRef: MutableRefObject<THREE.Quaternion>;
  sliderLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
};

export type CreateHudHelpersResult = {
  computeVolumeHudFrame: () => ReturnType<typeof computeHudFrameFromVolume>;
  applyPlaybackSliderFromWorldPoint: UseVolumeViewerVrResult['applyPlaybackSliderFromWorldPoint'];
  applyFpsSliderFromWorldPoint: UseVolumeViewerVrResult['applyFpsSliderFromWorldPoint'];
  resolveChannelsRegionFromPoint: UseVolumeViewerVrResult['resolveChannelsRegionFromPoint'];
  resolveTracksRegionFromPoint: UseVolumeViewerVrResult['resolveTracksRegionFromPoint'];
} & ReturnType<typeof createHudController>;

export function createHudHelpers({
  cameraRef,
  volumeRootGroupRef,
  volumeRootBaseOffsetRef,
  volumeRootHalfExtentsRef,
  playbackStateRef,
  vrHoverStateRef,
  vrChannelsStateRef,
  vrTracksStateRef,
  vrPlaybackHudRef,
  vrChannelsHudRef,
  vrTracksHudRef,
  vrPlaybackHudPlacementRef,
  vrChannelsHudPlacementRef,
  vrTracksHudPlacementRef,
  vrPlaybackHudDragTargetRef,
  vrChannelsHudDragTargetRef,
  vrTracksHudDragTargetRef,
  vrHudOffsetTempRef,
  vrHudYawEulerRef,
  vrHudYawQuaternionRef,
  sliderLocalPointRef,
  vrChannelsLocalPointRef,
  vrTracksLocalPointRef,
}: CreateHudHelpersParams): CreateHudHelpersResult {
  const computeVolumeHudFrame = () =>
    computeHudFrameFromVolume({
      baseOffset: volumeRootBaseOffsetRef.current,
      volumeRootGroup: volumeRootGroupRef.current,
      halfExtents: volumeRootHalfExtentsRef.current,
    });

  const hudController = createHudController({
    playbackHudRef: vrPlaybackHudRef,
    channelsHudRef: vrChannelsHudRef,
    tracksHudRef: vrTracksHudRef,
    playbackStateRef,
    hoverStateRef: vrHoverStateRef,
    channelsStateRef: vrChannelsStateRef,
    tracksStateRef: vrTracksStateRef,
    playbackHudPlacementRef: vrPlaybackHudPlacementRef,
    channelsHudPlacementRef: vrChannelsHudPlacementRef,
    tracksHudPlacementRef: vrTracksHudPlacementRef,
    playbackHudDragTargetRef: vrPlaybackHudDragTargetRef,
    channelsHudDragTargetRef: vrChannelsHudDragTargetRef,
    tracksHudDragTargetRef: vrTracksHudDragTargetRef,
    hudOffsetTempRef: vrHudOffsetTempRef,
    hudYawEulerRef: vrHudYawEulerRef,
    hudYawQuaternionRef: vrHudYawQuaternionRef,
    computeHudFrame: computeVolumeHudFrame,
    cameraRef,
  });

  const applyPlaybackSliderFromWorldPoint: UseVolumeViewerVrResult['applyPlaybackSliderFromWorldPoint'] = (
    worldPoint,
  ) => {
    const hud = vrPlaybackHudRef.current;
    if (!hud) {
      return;
    }
    const state = playbackStateRef.current;
    if (state.totalTimepoints <= 0 || state.playbackDisabled) {
      return;
    }
    sliderLocalPointRef.current.copy(worldPoint);
    hud.playbackSliderTrack.worldToLocal(sliderLocalPointRef.current);
    const rawRatio =
      (sliderLocalPointRef.current.x + hud.playbackSliderWidth / 2) /
      Math.max(hud.playbackSliderWidth, 1e-5);
    const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const tentativeIndex = Math.round(clampedRatio * maxIndex);
    const boundedIndex = Math.min(Math.max(tentativeIndex, 0), maxIndex);
    const fraction = maxIndex > 0 ? boundedIndex / maxIndex : 0;
    if (boundedIndex !== state.timeIndex) {
      state.onTimeIndexChange?.(boundedIndex);
      state.timeIndex = boundedIndex;
    }
    const total = Math.max(0, state.totalTimepoints);
    const labelCurrent = total > 0 ? Math.min(boundedIndex + 1, total) : 0;
    const label = `${labelCurrent} / ${total}`;
    state.playbackLabel = label;
    setVrPlaybackProgressFraction(hud, fraction);
    setVrPlaybackLabel(hud, label);
  };

  const applyFpsSliderFromWorldPoint: UseVolumeViewerVrResult['applyFpsSliderFromWorldPoint'] = (
    worldPoint,
  ) => {
    const hud = vrPlaybackHudRef.current;
    if (!hud) {
      return;
    }
    const state = playbackStateRef.current;
    if (state.totalTimepoints <= 1) {
      return;
    }
    sliderLocalPointRef.current.copy(worldPoint);
    hud.fpsSliderTrack.worldToLocal(sliderLocalPointRef.current);
    const rawRatio =
      (sliderLocalPointRef.current.x + hud.fpsSliderWidth / 2) /
      Math.max(hud.fpsSliderWidth, 1e-5);
    const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
    const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
    const tentativeFps = Math.round(VR_PLAYBACK_MIN_FPS + clampedRatio * fpsRange);
    const boundedFps = Math.min(
      VR_PLAYBACK_MAX_FPS,
      Math.max(VR_PLAYBACK_MIN_FPS, tentativeFps),
    );
    if (boundedFps !== state.fps) {
      state.onFpsChange?.(boundedFps);
      state.fps = boundedFps;
    }
    const fpsFraction =
      fpsRange > 0
        ? (Math.min(Math.max(boundedFps, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) -
            VR_PLAYBACK_MIN_FPS) /
          fpsRange
        : 0;
    setVrPlaybackFpsFraction(hud, fpsFraction);
    const fpsLabelText = `frames per second ${boundedFps}`;
    setVrPlaybackFpsLabel(hud, fpsLabelText);
  };

  const resolveChannelsRegionFromPoint: UseVolumeViewerVrResult['resolveChannelsRegionFromPoint'] = (
    hud,
    worldPoint,
  ) => {
    if (!hud) {
      return null;
    }
    const localPoint = vrChannelsLocalPointRef.current;
    localPoint.copy(worldPoint);
    hud.panel.worldToLocal(localPoint);
    const localX = localPoint.x;
    const localY = localPoint.y;
    for (const region of hud.regions) {
      const { minX, maxX, minY, maxY } = region.bounds;
      const minBoundX = Math.min(minX, maxX);
      const maxBoundX = Math.max(minX, maxX);
      const minBoundY = Math.min(minY, maxY);
      const maxBoundY = Math.max(minY, maxY);
      if (localX >= minBoundX && localX <= maxBoundX && localY >= minBoundY && localY <= maxBoundY) {
        return region;
      }
    }
    return null;
  };

  const resolveTracksRegionFromPoint: UseVolumeViewerVrResult['resolveTracksRegionFromPoint'] = (
    hud,
    worldPoint,
  ) => {
    if (!hud) {
      return null;
    }
    const localPoint = vrTracksLocalPointRef.current;
    localPoint.copy(worldPoint);
    hud.panel.worldToLocal(localPoint);
    const localX = localPoint.x;
    const localY = localPoint.y;
    for (const region of hud.regions) {
      const { minX, maxX, minY, maxY } = region.bounds;
      const minBoundX = Math.min(minX, maxX);
      const maxBoundX = Math.max(minX, maxX);
      const minBoundY = Math.min(minY, maxY);
      const maxBoundY = Math.max(minY, maxY);
      if (localX >= minBoundX && localX <= maxBoundX && localY >= minBoundY && localY <= maxBoundY) {
        return region;
      }
    }
    return null;
  };

  return {
    ...hudController,
    computeVolumeHudFrame,
    applyPlaybackSliderFromWorldPoint,
    applyFpsSliderFromWorldPoint,
    resolveChannelsRegionFromPoint,
    resolveTracksRegionFromPoint,
  };
}
