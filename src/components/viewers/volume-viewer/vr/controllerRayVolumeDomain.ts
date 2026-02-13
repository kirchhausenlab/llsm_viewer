import * as THREE from 'three';

import type { VolumeHandleCandidate } from '../useVolumeViewerVr.types';
import { VR_UI_TOUCH_DISTANCE, VR_VOLUME_MAX_SCALE, VR_VOLUME_MIN_SCALE } from './constants';
import { clampUiRayLength } from './controllerHudInteractions';
import type { ControllerEntry, VrUiTarget } from './types';
import { computeYawAngleForBasis } from './viewerYaw';

type VolumeDomainVectorTemps = {
  translationHandleWorldPoint: THREE.Vector3;
  rotationCenterWorldPoint: THREE.Vector3;
  rotationDirectionTemp: THREE.Vector3;
  rotationHandleWorldPoint: THREE.Vector3;
  scaleHandleWorldPoint: THREE.Vector3;
  scaleDirectionTemp: THREE.Vector3;
  scaleTargetWorldPoint: THREE.Vector3;
};

type ResolveVolumeRayDomainParams = {
  entry: ControllerEntry;
  initialRayLength: number;
  translationHandle: THREE.Mesh | null;
  scaleHandle: THREE.Mesh | null;
  yawHandles: THREE.Mesh[];
  pitchHandle: THREE.Mesh | null;
  applyVolumeYawPitch: (yaw: number, pitch: number) => void;
  volumeRootGroup: THREE.Group | null;
  volumeRootCenterUnscaledRef: { current: THREE.Vector3 };
  volumeRootBaseOffsetRef: { current: THREE.Vector3 };
  volumeNormalizationScaleRef: { current: number };
  volumeAnisotropyScaleRef: { current: { x: number; y: number; z: number } };
  volumeUserScaleRef: { current: number };
  volumeYawRef: { current: number };
  volumePitchRef: { current: number };
  temps: VolumeDomainVectorTemps;
};

export type ResolveVolumeRayDomainResult = {
  handleCandidateTarget: VrUiTarget | null;
  handleCandidatePoint: THREE.Vector3 | null;
  handleCandidateDistance: number;
  rayLength: number;
  rotationHandleHovered: boolean;
  rotationHandleActive: boolean;
};

export function resolveVolumeRayDomain({
  entry,
  initialRayLength,
  translationHandle,
  scaleHandle,
  yawHandles,
  pitchHandle,
  applyVolumeYawPitch,
  volumeRootGroup,
  volumeRootCenterUnscaledRef,
  volumeRootBaseOffsetRef,
  volumeNormalizationScaleRef,
  volumeAnisotropyScaleRef,
  volumeUserScaleRef,
  volumeYawRef,
  volumePitchRef,
  temps,
}: ResolveVolumeRayDomainParams): ResolveVolumeRayDomainResult {
  const {
    translationHandleWorldPoint,
    rotationCenterWorldPoint,
    rotationDirectionTemp,
    rotationHandleWorldPoint,
    scaleHandleWorldPoint,
    scaleDirectionTemp,
    scaleTargetWorldPoint,
  } = temps;

  let rayLength = initialRayLength;
  let handleCandidateTarget: VrUiTarget | null = null;
  let handleCandidatePoint: THREE.Vector3 | null = null;
  let handleCandidateDistance = Infinity;
  let rotationHandleHovered = false;

  const isActiveTranslate = entry.activeUiTarget?.type === 'volume-translate-handle';
  const isActiveScale = entry.activeUiTarget?.type === 'volume-scale-handle';
  const isActiveYaw = entry.activeUiTarget?.type === 'volume-yaw-handle';
  const isActivePitch = entry.activeUiTarget?.type === 'volume-pitch-handle';
  const rotationHandleActive = isActiveYaw || isActivePitch;

  const considerHandleCandidate = (candidate: VolumeHandleCandidate) => {
    if (handleCandidateTarget === null || candidate.distance < handleCandidateDistance) {
      handleCandidateTarget = candidate.target;
      handleCandidatePoint = candidate.point;
      handleCandidateDistance = candidate.distance;
    }
  };

  if (translationHandle && translationHandle.visible) {
    translationHandle.getWorldPosition(translationHandleWorldPoint);
    const distance = translationHandleWorldPoint.distanceTo(entry.rayOrigin);
    if (isActiveTranslate || distance <= VR_UI_TOUCH_DISTANCE) {
      considerHandleCandidate({
        target: { type: 'volume-translate-handle', object: translationHandle },
        point: translationHandleWorldPoint.clone(),
        distance,
      });
    }
  }

  if (scaleHandle && scaleHandle.visible) {
    scaleHandle.getWorldPosition(scaleHandleWorldPoint);
    const distance = scaleHandleWorldPoint.distanceTo(entry.rayOrigin);
    if (isActiveScale || distance <= VR_UI_TOUCH_DISTANCE) {
      considerHandleCandidate({
        target: { type: 'volume-scale-handle', object: scaleHandle },
        point: scaleHandleWorldPoint.clone(),
        distance,
      });
    }
  }

  if (yawHandles.length > 0) {
    const activeYawObject = isActiveYaw ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
    for (const yawHandle of yawHandles) {
      if (!yawHandle.visible) {
        continue;
      }
      const isActiveHandle = activeYawObject === yawHandle;
      if (!isActiveHandle && activeYawObject) {
        continue;
      }
      yawHandle.getWorldPosition(rotationHandleWorldPoint);
      const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
      if (distance <= VR_UI_TOUCH_DISTANCE) {
        rotationHandleHovered = true;
      }
      if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
        considerHandleCandidate({
          target: { type: 'volume-yaw-handle', object: yawHandle },
          point: rotationHandleWorldPoint.clone(),
          distance,
        });
      }
    }
  }

  if (pitchHandle && pitchHandle.visible) {
    pitchHandle.getWorldPosition(rotationHandleWorldPoint);
    const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
    if (distance <= VR_UI_TOUCH_DISTANCE) {
      rotationHandleHovered = true;
    }
    const isActiveHandle = isActivePitch && entry.activeUiTarget?.object === pitchHandle;
    if (isActiveHandle || (!isActivePitch && distance <= VR_UI_TOUCH_DISTANCE)) {
      considerHandleCandidate({
        target: { type: 'volume-pitch-handle', object: pitchHandle },
        point: rotationHandleWorldPoint.clone(),
        distance,
      });
    }
  }

  if (entry.isSelecting && isActiveTranslate) {
    if (translationHandle && volumeRootGroup) {
      const desiredPosition = rotationHandleWorldPoint;
      desiredPosition.copy(entry.rayOrigin);
      if (entry.translateGrabOffset) {
        desiredPosition.add(entry.translateGrabOffset);
      }
      translationHandle.getWorldPosition(translationHandleWorldPoint);
      rotationDirectionTemp.copy(desiredPosition).sub(translationHandleWorldPoint);
      if (rotationDirectionTemp.lengthSq() > 1e-10) {
        volumeRootGroup.position.add(rotationDirectionTemp);
        volumeRootBaseOffsetRef.current.add(rotationDirectionTemp);
        volumeRootGroup.updateMatrixWorld(true);
      }
      translationHandle.getWorldPosition(translationHandleWorldPoint);
      entry.hoverUiPoint.copy(translationHandleWorldPoint);
      entry.hasHoverUiPoint = true;
      const distance = entry.rayOrigin.distanceTo(translationHandleWorldPoint);
      rayLength = Math.min(rayLength, clampUiRayLength(distance));
      const candidateTarget = handleCandidateTarget as VrUiTarget | null;
      if (candidateTarget && candidateTarget.type === 'volume-translate-handle') {
        handleCandidatePoint = translationHandleWorldPoint.clone();
        handleCandidateDistance = distance;
      }
    }
  }

  if (entry.isSelecting && isActiveScale) {
    const scaleState = entry.volumeScaleState;
    if (!scaleHandle || !volumeRootGroup || !scaleState) {
      entry.volumeScaleState = null;
    } else {
      const desiredPosition = scaleTargetWorldPoint;
      desiredPosition.copy(entry.rayOrigin);
      if (entry.scaleGrabOffset) {
        desiredPosition.add(entry.scaleGrabOffset);
      }
      rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
      volumeRootGroup.localToWorld(rotationCenterWorldPoint);
      scaleDirectionTemp.copy(desiredPosition).sub(rotationCenterWorldPoint);
      const projection = scaleDirectionTemp.dot(scaleState.direction);
      const minLength = scaleState.baseLength * VR_VOLUME_MIN_SCALE;
      const maxLength = scaleState.baseLength * VR_VOLUME_MAX_SCALE;
      const clampedLength = Math.min(Math.max(projection, minLength), maxLength);
      const safeBaseLength = Math.max(scaleState.baseLength, 1e-6);
      const unclampedScale = clampedLength / safeBaseLength;
      const nextUserScale = Math.min(VR_VOLUME_MAX_SCALE, Math.max(VR_VOLUME_MIN_SCALE, unclampedScale));
      volumeUserScaleRef.current = nextUserScale;
      const baseScale = volumeNormalizationScaleRef.current;
      const anisotropy = volumeAnisotropyScaleRef.current;
      const anisX = Number.isFinite(anisotropy?.x) && anisotropy.x > 0 ? anisotropy.x : 1;
      const anisY = Number.isFinite(anisotropy?.y) && anisotropy.y > 0 ? anisotropy.y : 1;
      const anisZ = Number.isFinite(anisotropy?.z) && anisotropy.z > 0 ? anisotropy.z : 1;
      volumeRootGroup.scale.set(
        baseScale * nextUserScale * anisX,
        baseScale * nextUserScale * anisY,
        baseScale * nextUserScale * anisZ,
      );
      applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
      scaleHandle.getWorldPosition(scaleHandleWorldPoint);
      entry.hoverUiPoint.copy(scaleHandleWorldPoint);
      entry.hasHoverUiPoint = true;
      const distance = entry.rayOrigin.distanceTo(scaleHandleWorldPoint);
      rayLength = Math.min(rayLength, clampUiRayLength(distance));
      const candidateTarget = handleCandidateTarget as VrUiTarget | null;
      if (candidateTarget && candidateTarget.type === 'volume-scale-handle') {
        handleCandidatePoint = scaleHandleWorldPoint.clone();
        handleCandidateDistance = distance;
      }
    }
  }

  if (entry.isSelecting && (isActiveYaw || isActivePitch)) {
    const rotationState = entry.volumeRotationState;
    if (!volumeRootGroup || !rotationState) {
      entry.volumeRotationState = null;
    } else {
      rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
      volumeRootGroup.localToWorld(rotationCenterWorldPoint);
      rotationDirectionTemp.copy(entry.rayOrigin).sub(rotationCenterWorldPoint);
      const tau = Math.PI * 2;
      if (rotationState.mode === 'yaw') {
        rotationDirectionTemp.y = 0;
        if (rotationDirectionTemp.lengthSq() > 1e-8) {
          const currentAngle = computeYawAngleForBasis(
            rotationDirectionTemp,
            rotationState.basisForward,
            rotationState.basisRight,
          );
          let delta = currentAngle - rotationState.initialAngle;
          if (delta > Math.PI) {
            delta -= tau;
          } else if (delta < -Math.PI) {
            delta += tau;
          }
          const nextYaw = rotationState.initialYaw - delta;
          applyVolumeYawPitch(nextYaw, volumePitchRef.current);
        }
      } else if (rotationState.mode === 'pitch') {
        rotationDirectionTemp.x = 0;
        if (rotationDirectionTemp.lengthSq() > 1e-8) {
          const forwardComponent = rotationDirectionTemp.dot(rotationState.basisForward);
          const currentAngle = Math.atan2(rotationDirectionTemp.y, forwardComponent);
          let delta = currentAngle - rotationState.initialAngle;
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
          applyVolumeYawPitch(volumeYawRef.current, nextPitch);
        }
      }
      const activeHandle = entry.activeUiTarget?.object as THREE.Object3D | null;
      if (activeHandle) {
        activeHandle.getWorldPosition(rotationHandleWorldPoint);
        entry.hoverUiPoint.copy(rotationHandleWorldPoint);
        entry.hasHoverUiPoint = true;
        const distance = entry.rayOrigin.distanceTo(rotationHandleWorldPoint);
        rayLength = Math.min(rayLength, clampUiRayLength(distance));
        const candidateTarget = handleCandidateTarget as VrUiTarget | null;
        if (
          candidateTarget &&
          (candidateTarget.type === 'volume-yaw-handle' || candidateTarget.type === 'volume-pitch-handle')
        ) {
          handleCandidatePoint = rotationHandleWorldPoint.clone();
          handleCandidateDistance = distance;
        }
      }
    }
  }

  return {
    handleCandidateTarget,
    handleCandidatePoint,
    handleCandidateDistance,
    rayLength,
    rotationHandleHovered,
    rotationHandleActive,
  };
}
