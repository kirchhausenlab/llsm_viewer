import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { VR_HUD_MIN_HEIGHT, VR_HUD_PLACEMENT_EPSILON } from './constants';
import type {
  VolumeHudFrame,
  VrChannelsHud,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
} from './types';

export function constrainHudPlacementPosition(target: THREE.Vector3): void {
  target.y = Math.max(target.y, VR_HUD_MIN_HEIGHT);
}

export function getHudQuaternionFromAngles(
  yaw: number,
  pitch: number,
  yawEuler: THREE.Euler,
  yawQuaternion: THREE.Quaternion,
): THREE.Quaternion {
  yawEuler.set(pitch, yaw, 0, 'YXZ');
  yawQuaternion.setFromEuler(yawEuler);
  return yawQuaternion;
}

export function updateHudGroupFromPlacement(
  hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
  placement: VrHudPlacement | null,
  yawEuler: THREE.Euler,
  yawQuaternion: THREE.Quaternion,
): void {
  if (!hud || !placement) {
    return;
  }

  const positionChanged =
    hud.cacheDirty ||
    Math.abs(hud.cachedPosition.x - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
    Math.abs(hud.cachedPosition.y - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
    Math.abs(hud.cachedPosition.z - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
  const yawChanged = hud.cacheDirty || Math.abs(hud.cachedYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
  const pitchChanged =
    hud.cacheDirty || Math.abs(hud.cachedPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;

  if (!positionChanged && !yawChanged && !pitchChanged) {
    return;
  }

  hud.group.position.copy(placement.position);
  if (yawChanged || pitchChanged || hud.cacheDirty) {
    const quaternion = getHudQuaternionFromAngles(placement.yaw + Math.PI, placement.pitch, yawEuler, yawQuaternion);
    hud.group.quaternion.copy(quaternion);
  }
  hud.group.updateMatrixWorld(true);
  hud.cachedPosition.copy(placement.position);
  hud.cachedYaw = placement.yaw;
  hud.cachedPitch = placement.pitch;
  hud.cacheDirty = false;
}

export function setHudPlacement(
  placementRef: MutableRefObject<VrHudPlacement | null>,
  dragTargetRef: MutableRefObject<THREE.Vector3>,
  hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
  position: THREE.Vector3,
  yaw: number,
  pitch: number,
  yawEuler: THREE.Euler,
  yawQuaternion: THREE.Quaternion,
): void {
  const placement =
    placementRef.current ?? ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
  const prevX = placement.position.x;
  const prevY = placement.position.y;
  const prevZ = placement.position.z;
  const prevYaw = placement.yaw;
  const prevPitch = placement.pitch;

  placement.position.copy(position);
  constrainHudPlacementPosition(placement.position);
  placement.yaw = yaw;
  placement.pitch = pitch;

  const positionChanged =
    Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
    Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
    Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
  const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
  const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;

  placementRef.current = placement;
  dragTargetRef.current.copy(placement.position);

  const hud = hudRef.current;
  if (hud && (positionChanged || yawChanged || pitchChanged)) {
    hud.cacheDirty = true;
  }

  updateHudGroupFromPlacement(hud, placement, yawEuler, yawQuaternion);
}

export type ResetHudPlacementParams = {
  placementRef: MutableRefObject<VrHudPlacement | null>;
  dragTargetRef: MutableRefObject<THREE.Vector3>;
  hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>;
  fallbackOffset: THREE.Vector3;
  verticalOffset: number;
  lateralOffset: number;
  computeHudFrame: () => VolumeHudFrame | null;
  camera: THREE.PerspectiveCamera | null;
  target: THREE.Vector3;
  yawEuler: THREE.Euler;
  yawQuaternion: THREE.Quaternion;
};

export function resetHudPlacement({
  placementRef,
  dragTargetRef,
  hudRef,
  fallbackOffset,
  verticalOffset,
  lateralOffset,
  computeHudFrame,
  camera,
  target,
  yawEuler,
  yawQuaternion,
}: ResetHudPlacementParams): void {
  const hud = hudRef.current;
  if (!camera || !hud) {
    return;
  }

  const frame = computeHudFrame();
  if (frame) {
    target
      .copy(frame.center)
      .addScaledVector(frame.right, lateralOffset)
      .addScaledVector(frame.up, verticalOffset);
    setHudPlacement(placementRef, dragTargetRef, hudRef, target, frame.yaw, frame.pitch, yawEuler, yawQuaternion);
    return;
  }

  const existingPlacement = placementRef.current;
  if (existingPlacement) {
    target.copy(existingPlacement.position);
    setHudPlacement(
      placementRef,
      dragTargetRef,
      hudRef,
      target,
      existingPlacement.yaw,
      existingPlacement.pitch,
      yawEuler,
      yawQuaternion,
    );
    return;
  }

  target.copy(fallbackOffset);
  const q = camera.quaternion;
  const sinYaw = 2 * (q.w * q.y + q.x * q.z);
  const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yaw = Math.atan2(sinYaw, cosYaw);
  const cosValue = Math.cos(yaw);
  const sinValue = Math.sin(yaw);
  const rotatedX = target.x * cosValue - target.z * sinValue;
  const rotatedZ = target.x * sinValue + target.z * cosValue;
  target.set(rotatedX, target.y, rotatedZ);
  target.add(camera.position);
  setHudPlacement(placementRef, dragTargetRef, hudRef, target, yaw, 0, yawEuler, yawQuaternion);
}
