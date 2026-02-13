import * as THREE from 'three';

import type {
  ControllerEntry,
  VrChannelsHud,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
} from './types';
import { computeYawAngleForBasis } from './viewerYaw';

export function applyControllerHudTransforms(params: {
  entry: ControllerEntry;
  playbackHudInstance: VrPlaybackHud | null;
  channelsHudInstance: VrChannelsHud | null;
  tracksHudInstance: VrTracksHud | null;
  vrPlaybackHudPlacement: VrHudPlacement | null;
  vrChannelsHudPlacement: VrHudPlacement | null;
  vrTracksHudPlacement: VrHudPlacement | null;
  vrPlaybackHudDragTarget: THREE.Vector3;
  vrChannelsHudDragTarget: THREE.Vector3;
  vrTracksHudDragTarget: THREE.Vector3;
  vrHudYawVector: THREE.Vector3;
  vrHudPitchVector: THREE.Vector3;
  setVrPlaybackHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrChannelsHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrTracksHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrPlaybackHudPlacementYaw: (yaw: number) => void;
  setVrChannelsHudPlacementYaw: (yaw: number) => void;
  setVrTracksHudPlacementYaw: (yaw: number) => void;
  setVrPlaybackHudPlacementPitch: (pitch: number) => void;
  setVrChannelsHudPlacementPitch: (pitch: number) => void;
  setVrTracksHudPlacementPitch: (pitch: number) => void;
}): void {
  const {
    entry,
    playbackHudInstance,
    channelsHudInstance,
    tracksHudInstance,
    vrPlaybackHudPlacement,
    vrChannelsHudPlacement,
    vrTracksHudPlacement,
    vrPlaybackHudDragTarget,
    vrChannelsHudDragTarget,
    vrTracksHudDragTarget,
    vrHudYawVector,
    vrHudPitchVector,
    setVrPlaybackHudPlacementPosition,
    setVrChannelsHudPlacementPosition,
    setVrTracksHudPlacementPosition,
    setVrPlaybackHudPlacementYaw,
    setVrChannelsHudPlacementYaw,
    setVrTracksHudPlacementYaw,
    setVrPlaybackHudPlacementPitch,
    setVrChannelsHudPlacementPitch,
    setVrTracksHudPlacementPitch,
  } = params;

  if (
    entry.isSelecting &&
    entry.activeUiTarget?.type === 'playback-panel-grab' &&
    playbackHudInstance &&
    entry.hasHoverUiPoint
  ) {
    const newPosition = vrPlaybackHudDragTarget;
    newPosition.copy(entry.rayOrigin);
    if (entry.hudGrabOffsets.playback) {
      newPosition.add(entry.hudGrabOffsets.playback);
    }
    setVrPlaybackHudPlacementPosition(newPosition);
  }

  if (
    entry.isSelecting &&
    entry.activeUiTarget?.type === 'channels-panel-grab' &&
    channelsHudInstance &&
    entry.hasHoverUiPoint
  ) {
    const newPosition = vrChannelsHudDragTarget;
    newPosition.copy(entry.rayOrigin);
    if (entry.hudGrabOffsets.channels) {
      newPosition.add(entry.hudGrabOffsets.channels);
    }
    setVrChannelsHudPlacementPosition(newPosition);
  }

  if (
    entry.isSelecting &&
    entry.activeUiTarget?.type === 'tracks-panel-grab' &&
    tracksHudInstance &&
    entry.hasHoverUiPoint
  ) {
    const newPosition = vrTracksHudDragTarget;
    newPosition.copy(entry.rayOrigin);
    if (entry.hudGrabOffsets.tracks) {
      newPosition.add(entry.hudGrabOffsets.tracks);
    }
    setVrTracksHudPlacementPosition(newPosition);
  }

  if (!(entry.isSelecting && entry.hudRotationState)) {
    return;
  }

  const rotationState = entry.hudRotationState;
  const expectedTargetType = `${rotationState.hud}-panel-${rotationState.mode}` as const;
  if (entry.activeUiTarget?.type !== expectedTargetType) {
    entry.hudRotationState = null;
    return;
  }

  let placement: VrHudPlacement | null = null;
  let applyYaw: ((nextYaw: number) => void) | null = null;
  let applyPitch: ((nextPitch: number) => void) | null = null;
  if (rotationState.hud === 'playback') {
    placement = vrPlaybackHudPlacement;
    if (rotationState.mode === 'yaw') {
      applyYaw = setVrPlaybackHudPlacementYaw;
    } else {
      applyPitch = setVrPlaybackHudPlacementPitch;
    }
  } else if (rotationState.hud === 'channels') {
    placement = vrChannelsHudPlacement;
    if (rotationState.mode === 'yaw') {
      applyYaw = setVrChannelsHudPlacementYaw;
    } else {
      applyPitch = setVrChannelsHudPlacementPitch;
    }
  } else if (rotationState.hud === 'tracks') {
    placement = vrTracksHudPlacement;
    if (rotationState.mode === 'yaw') {
      applyYaw = setVrTracksHudPlacementYaw;
    } else {
      applyPitch = setVrTracksHudPlacementPitch;
    }
  }

  if (!placement || (!applyYaw && !applyPitch)) {
    entry.hudRotationState = null;
    return;
  }

  if (rotationState.mode === 'yaw' && applyYaw) {
    vrHudYawVector.copy(entry.rayOrigin).sub(placement.position);
    vrHudYawVector.y = 0;
    if (vrHudYawVector.lengthSq() > 1e-6) {
      const currentAngle = computeYawAngleForBasis(
        vrHudYawVector,
        rotationState.basisForward,
        rotationState.basisRight,
      );
      let delta = currentAngle - rotationState.initialAngle;
      const tau = Math.PI * 2;
      if (delta > Math.PI) {
        delta -= tau;
      } else if (delta < -Math.PI) {
        delta += tau;
      }
      const nextYaw = rotationState.initialYaw - delta;
      applyYaw(nextYaw);
    }
    return;
  }

  if (rotationState.mode === 'pitch' && applyPitch) {
    vrHudPitchVector.copy(entry.rayOrigin).sub(placement.position);
    vrHudPitchVector.x = 0;
    if (vrHudPitchVector.lengthSq() > 1e-6) {
      const forwardComponent = vrHudPitchVector.dot(rotationState.basisForward);
      const currentAngle = Math.atan2(vrHudPitchVector.y, forwardComponent);
      let delta = currentAngle - rotationState.initialAngle;
      const tau = Math.PI * 2;
      if (delta > Math.PI) {
        delta -= tau;
      } else if (delta < -Math.PI) {
        delta += tau;
      }
      const pitchLimit = Math.PI / 2 - 0.05;
      const nextPitch = Math.max(
        -pitchLimit,
        Math.min(pitchLimit, rotationState.initialPitch + delta),
      );
      applyPitch(nextPitch);
    }
  }
}
