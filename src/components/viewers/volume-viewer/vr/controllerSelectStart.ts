import * as THREE from 'three';

import type { ControllerInputDependencies } from './controllerInputDependencies';
import { computeViewerYawBasis } from './viewerYaw';
import { getHudCategoryFromTarget } from './hudTargets';
import type {
  ControllerEntry,
  VrChannelsInteractiveRegion,
  VrTracksInteractiveRegion,
  VrUiTargetType,
} from './types';
import {
  computePitchRotation,
  computeYawRotation,
  createVolumeScaleState,
} from './controllerVolumeGestures';

type ControllerSelectStartDependencies = Pick<
  ControllerInputDependencies,
  | 'rendererRef'
  | 'cameraRef'
  | 'playbackStateRef'
  | 'applyPlaybackSliderFromWorldPointRef'
  | 'applyFpsSliderFromWorldPointRef'
  | 'vrPlaybackHudRef'
  | 'vrPlaybackHudPlacementRef'
  | 'vrPlaybackHudDragTargetRef'
  | 'vrChannelsHudRef'
  | 'vrChannelsHudPlacementRef'
  | 'vrChannelsHudDragTargetRef'
  | 'vrTracksHudRef'
  | 'vrTracksHudPlacementRef'
  | 'vrTracksHudDragTargetRef'
  | 'applyVrChannelsSliderFromPointRef'
  | 'applyVrTracksSliderFromPointRef'
  | 'applyVrTracksScrollFromPointRef'
  | 'vrTranslationHandleRef'
  | 'vrVolumeScaleHandleRef'
  | 'vrHandleWorldPointRef'
  | 'vrHandleSecondaryPointRef'
  | 'vrHandleDirectionTempRef'
  | 'volumeRootGroupRef'
  | 'volumeRootCenterUnscaledRef'
  | 'volumeUserScaleRef'
  | 'volumeYawRef'
  | 'volumePitchRef'
  | 'vrHudYawVectorRef'
  | 'vrHudPitchVectorRef'
> & {
  log: (...args: Parameters<typeof console.debug>) => void;
};

export function handleControllerSelectStart(
  entry: ControllerEntry,
  index: number,
  deps: ControllerSelectStartDependencies,
) {
  const {
    rendererRef,
    cameraRef,
    playbackStateRef,
    applyPlaybackSliderFromWorldPointRef,
    applyFpsSliderFromWorldPointRef,
    vrPlaybackHudRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudDragTargetRef,
    vrChannelsHudRef,
    vrChannelsHudPlacementRef,
    vrChannelsHudDragTargetRef,
    vrTracksHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudDragTargetRef,
    applyVrChannelsSliderFromPointRef,
    applyVrTracksSliderFromPointRef,
    applyVrTracksScrollFromPointRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrHandleDirectionTempRef,
    volumeRootGroupRef,
    volumeRootCenterUnscaledRef,
    volumeUserScaleRef,
    volumeYawRef,
    volumePitchRef,
    vrHudYawVectorRef,
    vrHudPitchVectorRef,
    log,
  } = deps;

  entry.isSelecting = true;
  entry.activeUiTarget = entry.hoverUiTarget;
  entry.hudRotationState = null;
  entry.volumeRotationState = null;
  const activeType = entry.activeUiTarget?.type ?? null;
  const hudCategory = getHudCategoryFromTarget(activeType as VrUiTargetType | null);
  const rendererInstance = rendererRef.current;
  const camera = cameraRef.current;
  if (
    activeType === 'playback-panel-yaw' ||
    activeType === 'channels-panel-yaw' ||
    activeType === 'tracks-panel-yaw' ||
    activeType === 'playback-panel-pitch' ||
    activeType === 'channels-panel-pitch' ||
    activeType === 'tracks-panel-pitch'
  ) {
    let placement = null;
    if (activeType === 'playback-panel-yaw' || activeType === 'playback-panel-pitch') {
      placement = vrPlaybackHudPlacementRef.current;
    } else if (activeType === 'channels-panel-yaw' || activeType === 'channels-panel-pitch') {
      placement = vrChannelsHudPlacementRef.current;
    } else if (activeType === 'tracks-panel-yaw' || activeType === 'tracks-panel-pitch') {
      placement = vrTracksHudPlacementRef.current;
    }
    if (placement && hudCategory) {
      if (
        activeType === 'playback-panel-yaw' ||
        activeType === 'channels-panel-yaw' ||
        activeType === 'tracks-panel-yaw'
      ) {
        const yawVector = vrHudYawVectorRef.current;
        yawVector.copy(entry.rayOrigin).sub(placement.position);
        yawVector.y = 0;
        const yawBasisForward = new THREE.Vector3();
        const yawBasisRight = new THREE.Vector3();
        computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
        const initialAngle = computeYawRotation(
          yawVector,
          yawBasisForward,
          yawBasisRight
        );
        if (initialAngle === null) {
          entry.activeUiTarget = null;
        } else {
          entry.hudRotationState = {
            hud: hudCategory,
            mode: 'yaw',
            initialYaw: placement.yaw,
            initialAngle,
            basisForward: yawBasisForward,
            basisRight: yawBasisRight,
          };
        }
      } else {
        const pitchVector = vrHudPitchVectorRef.current;
        pitchVector.copy(entry.rayOrigin).sub(placement.position);
        pitchVector.x = 0;
        const pitchBasisForward = new THREE.Vector3();
        const pitchBasisRight = new THREE.Vector3();
        computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
        const initialAngle = computePitchRotation(
          pitchVector,
          pitchBasisForward
        );
        if (initialAngle === null) {
          entry.activeUiTarget = null;
        } else {
          entry.hudRotationState = {
            hud: hudCategory,
            mode: 'pitch',
            initialPitch: placement.pitch ?? 0,
            initialAngle,
            basisForward: pitchBasisForward,
          };
        }
      }
    } else {
      entry.activeUiTarget = null;
    }
  }

  const playbackState = playbackStateRef.current;
  if (entry.activeUiTarget?.type === 'playback-play-toggle' && playbackState.playbackDisabled) {
    entry.activeUiTarget = null;
  }
  if (
    entry.activeUiTarget?.type === 'playback-slider' &&
    entry.hasHoverUiPoint &&
    !playbackState.playbackDisabled
  ) {
    applyPlaybackSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
  }
  if (
    entry.activeUiTarget?.type === 'playback-fps-slider' &&
    entry.hasHoverUiPoint &&
    playbackState.totalTimepoints > 1
  ) {
    applyFpsSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
  }
  if (entry.activeUiTarget?.type === 'playback-panel-grab') {
    const hud = vrPlaybackHudRef.current;
    if (hud) {
      const placement = vrPlaybackHudPlacementRef.current;
      const referencePosition = vrPlaybackHudDragTargetRef.current;
      referencePosition.copy(placement?.position ?? hud.group.position);
      if (!entry.hasHoverUiPoint) {
        entry.hoverUiPoint.copy(referencePosition);
        entry.hasHoverUiPoint = true;
      }
      if (!entry.hudGrabOffsets.playback) {
        entry.hudGrabOffsets.playback = new THREE.Vector3();
      }
      entry.hudGrabOffsets.playback.copy(referencePosition).sub(entry.rayOrigin);
    }
  }
  if (
    entry.activeUiTarget?.type === 'channels-slider' &&
    entry.hasHoverUiPoint &&
    entry.activeUiTarget.data &&
    !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
  ) {
    applyVrChannelsSliderFromPointRef.current?.(
      entry.activeUiTarget.data as VrChannelsInteractiveRegion,
      entry.hoverUiPoint,
    );
  }
  if (entry.activeUiTarget?.type === 'channels-panel-grab') {
    const hud = vrChannelsHudRef.current;
    if (hud) {
      const placement = vrChannelsHudPlacementRef.current;
      const referencePosition = vrChannelsHudDragTargetRef.current;
      referencePosition.copy(placement?.position ?? hud.group.position);
      if (!entry.hasHoverUiPoint) {
        entry.hoverUiPoint.copy(referencePosition);
        entry.hasHoverUiPoint = true;
      }
      if (!entry.hudGrabOffsets.channels) {
        entry.hudGrabOffsets.channels = new THREE.Vector3();
      }
      entry.hudGrabOffsets.channels.copy(referencePosition).sub(entry.rayOrigin);
    }
  }
  if (
    entry.activeUiTarget &&
    (entry.activeUiTarget.type === 'tracks-slider' || entry.activeUiTarget.type === 'tracks-scroll') &&
    entry.hasHoverUiPoint &&
    entry.activeUiTarget.data &&
    !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
  ) {
    const region = entry.activeUiTarget.data as VrTracksInteractiveRegion;
    if (entry.activeUiTarget.type === 'tracks-slider') {
      applyVrTracksSliderFromPointRef.current?.(region, entry.hoverUiPoint);
    } else {
      applyVrTracksScrollFromPointRef.current?.(region, entry.hoverUiPoint);
    }
  }
  if (entry.activeUiTarget?.type === 'tracks-panel-grab') {
    const hud = vrTracksHudRef.current;
    if (hud) {
      const placement = vrTracksHudPlacementRef.current;
      const referencePosition = vrTracksHudDragTargetRef.current;
      referencePosition.copy(placement?.position ?? hud.group.position);
      if (!entry.hasHoverUiPoint) {
        entry.hoverUiPoint.copy(referencePosition);
        entry.hasHoverUiPoint = true;
      }
      if (!entry.hudGrabOffsets.tracks) {
        entry.hudGrabOffsets.tracks = new THREE.Vector3();
      }
      entry.hudGrabOffsets.tracks.copy(referencePosition).sub(entry.rayOrigin);
    }
  }
  if (entry.activeUiTarget?.type === 'volume-translate-handle') {
    const handle = vrTranslationHandleRef.current;
    if (handle) {
      handle.getWorldPosition(vrHandleWorldPointRef.current);
      if (!entry.translateGrabOffset) {
        entry.translateGrabOffset = new THREE.Vector3();
      }
      entry.translateGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
    }
  } else if (entry.activeUiTarget?.type === 'volume-scale-handle') {
    const handle = vrVolumeScaleHandleRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    if (handle && volumeRootGroup) {
      handle.getWorldPosition(vrHandleWorldPointRef.current);
      if (!entry.scaleGrabOffset) {
        entry.scaleGrabOffset = new THREE.Vector3();
      }
      entry.scaleGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
      vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
      volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
      const scaleState = createVolumeScaleState(
        vrHandleWorldPointRef.current,
        vrHandleSecondaryPointRef.current,
        volumeUserScaleRef.current,
      );
      if (scaleState) {
        entry.volumeScaleState = scaleState;
      } else {
        entry.volumeScaleState = null;
        entry.activeUiTarget = null;
      }
    } else {
      entry.volumeScaleState = null;
      entry.activeUiTarget = null;
    }
  }
  if (
    entry.activeUiTarget?.type === 'volume-yaw-handle' ||
    entry.activeUiTarget?.type === 'volume-pitch-handle'
  ) {
    const volumeRootGroup = volumeRootGroupRef.current;
    if (volumeRootGroup) {
      vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
      volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
      vrHandleDirectionTempRef.current.copy(entry.rayOrigin).sub(vrHandleSecondaryPointRef.current);
      if (entry.activeUiTarget.type === 'volume-yaw-handle') {
        vrHandleDirectionTempRef.current.y = 0;
        const yawBasisForward = new THREE.Vector3();
        const yawBasisRight = new THREE.Vector3();
        computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
        const initialAngle = computeYawRotation(
          vrHandleDirectionTempRef.current,
          yawBasisForward,
          yawBasisRight
        );
        if (initialAngle === null) {
          entry.activeUiTarget = null;
        } else {
          entry.volumeRotationState = {
            mode: 'yaw',
            initialYaw: volumeYawRef.current,
            initialAngle,
            basisForward: yawBasisForward,
            basisRight: yawBasisRight,
          };
        }
      } else {
        vrHandleDirectionTempRef.current.x = 0;
        const pitchBasisForward = new THREE.Vector3();
        const pitchBasisRight = new THREE.Vector3();
        computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
        const initialAngle = computePitchRotation(
          vrHandleDirectionTempRef.current,
          pitchBasisForward
        );
        if (initialAngle === null) {
          entry.activeUiTarget = null;
        } else {
          entry.volumeRotationState = {
            mode: 'pitch',
            initialPitch: volumePitchRef.current,
            initialAngle,
            basisForward: pitchBasisForward,
          };
        }
      }
    } else {
      entry.activeUiTarget = null;
    }
  }
  log('[VR] selectstart', index, {
    hoverTrackId: entry.hoverTrackId,
    uiTarget: entry.activeUiTarget?.type ?? null,
  });
}
