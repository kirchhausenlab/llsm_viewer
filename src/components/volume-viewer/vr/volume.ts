import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import {
  VR_PITCH_HANDLE_FORWARD_OFFSET,
  VR_ROTATION_HANDLE_OFFSET,
  VR_ROTATION_HANDLE_RADIUS,
  VR_SCALE_HANDLE_OFFSET,
  VR_SCALE_HANDLE_RADIUS,
  VR_TRANSLATION_HANDLE_OFFSET,
  VR_TRANSLATION_HANDLE_RADIUS,
  VR_VOLUME_MAX_SCALE,
  VR_VOLUME_MIN_SCALE,
} from './constants';

export type VolumeDimensions = { width: number; height: number; depth: number };

export type UpdateVolumeHandlesParams = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  currentDimensionsRef: MutableRefObject<VolumeDimensions | null>;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3>;
  vrHandleLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
};

export type ApplyVolumeYawPitchParams = UpdateVolumeHandlesParams & {
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootRotatedCenterTempRef: MutableRefObject<THREE.Vector3>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  vrHudYawEulerRef: MutableRefObject<THREE.Euler>;
  vrHandleQuaternionTempRef: MutableRefObject<THREE.Quaternion>;
};

export type ApplyVolumeRootTransformParams = ApplyVolumeYawPitchParams & {
  volumeNormalizationScaleRef: MutableRefObject<number>;
};

export function updateVolumeHandles(params: UpdateVolumeHandlesParams) {
  const {
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
  } = params;

  const translationHandle = vrTranslationHandleRef.current;
  const scaleHandle = vrVolumeScaleHandleRef.current;
  const yawHandles = vrVolumeYawHandlesRef.current;
  const pitchHandle = vrVolumePitchHandleRef.current;

  if (!translationHandle && !scaleHandle && yawHandles.length === 0 && !pitchHandle) {
    return;
  }

  const renderer = params.rendererRef.current;
  const volumeRootGroup = params.volumeRootGroupRef.current;
  const dimensions = params.currentDimensionsRef.current;
  const has3D = params.hasActive3DLayerRef.current;
  const presenting = renderer?.xr?.isPresenting ?? false;

  const hideHandles = () => {
    if (translationHandle) {
      translationHandle.visible = false;
    }
    if (scaleHandle) {
      scaleHandle.visible = false;
    }
    yawHandles.forEach((handle) => {
      if (handle) {
        handle.visible = false;
      }
    });
    if (pitchHandle) {
      pitchHandle.visible = false;
    }
  };

  if (!presenting || !has3D || !dimensions || !volumeRootGroup || dimensions.depth <= 1) {
    hideHandles();
    return;
  }

  const { width, height, depth } = dimensions;
  const maxDimension = Math.max(width, height, depth);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    hideHandles();
    return;
  }

  const scale = 1 / maxDimension;
  const userScale = params.volumeUserScaleRef.current;
  const totalScale = scale * userScale;
  const safeScale = totalScale > 1e-6 ? totalScale : 1e-6;
  const centerUnscaled = params.volumeRootCenterUnscaledRef.current;
  const halfExtents = params.volumeRootHalfExtentsRef.current;
  const translationLocal = params.vrHandleLocalPointRef.current;

  translationLocal.set(
    centerUnscaled.x,
    centerUnscaled.y + (halfExtents.y + VR_TRANSLATION_HANDLE_OFFSET) / scale,
    centerUnscaled.z,
  );

  if (translationHandle) {
    translationHandle.position.copy(translationLocal);
    translationHandle.scale.setScalar(VR_TRANSLATION_HANDLE_RADIUS / safeScale);
    translationHandle.visible = true;
  }

  const lateralOffset = (halfExtents.x + VR_ROTATION_HANDLE_OFFSET) / scale;
  const verticalOffset = -(halfExtents.y + VR_ROTATION_HANDLE_OFFSET) / scale;
  const forwardOffset = (halfExtents.z + VR_PITCH_HANDLE_FORWARD_OFFSET) / scale;
  const handleScale = VR_ROTATION_HANDLE_RADIUS / safeScale;

  yawHandles.forEach((handle, index) => {
    if (!handle) {
      return;
    }
    const direction = index === 0 ? 1 : -1;
    handle.position.set(
      centerUnscaled.x + direction * lateralOffset,
      centerUnscaled.y,
      centerUnscaled.z,
    );
    handle.scale.setScalar(handleScale);
    handle.visible = true;
  });

  if (pitchHandle) {
    pitchHandle.position.set(
      centerUnscaled.x,
      centerUnscaled.y + verticalOffset,
      centerUnscaled.z - forwardOffset,
    );
    pitchHandle.scale.setScalar(handleScale);
    pitchHandle.visible = true;
  }

  if (scaleHandle) {
    scaleHandle.position.set(
      centerUnscaled.x + (halfExtents.x + VR_SCALE_HANDLE_OFFSET) / scale,
      centerUnscaled.y + (halfExtents.y + VR_SCALE_HANDLE_OFFSET) / scale,
      centerUnscaled.z,
    );
    scaleHandle.scale.setScalar(VR_SCALE_HANDLE_RADIUS / safeScale);
    scaleHandle.visible = true;
  }
}

export function applyVolumeYawPitch(
  params: ApplyVolumeYawPitchParams,
  yaw: number,
  pitch: number,
) {
  const volumeRootGroup = params.volumeRootGroupRef.current;
  if (!volumeRootGroup) {
    return;
  }

  params.volumeYawRef.current = yaw;
  params.volumePitchRef.current = pitch;

  const euler = params.vrHudYawEulerRef.current;
  const quaternion = params.vrHandleQuaternionTempRef.current;
  euler.set(pitch, yaw, 0, 'YXZ');
  quaternion.setFromEuler(euler);
  volumeRootGroup.quaternion.copy(quaternion);

  const baseOffset = params.volumeRootBaseOffsetRef.current;
  const centerOffset = params.volumeRootCenterOffsetRef.current;
  const rotatedCenter = params.volumeRootRotatedCenterTempRef.current;
  const userScale = params.volumeUserScaleRef.current;

  rotatedCenter.copy(centerOffset).multiplyScalar(userScale).applyQuaternion(volumeRootGroup.quaternion);

  volumeRootGroup.position.set(
    baseOffset.x - rotatedCenter.x,
    baseOffset.y - rotatedCenter.y,
    baseOffset.z - rotatedCenter.z,
  );

  volumeRootGroup.updateMatrixWorld(true);
  updateVolumeHandles(params);
}

export function applyVolumeRootTransform(
  params: ApplyVolumeRootTransformParams,
  dimensions: VolumeDimensions | null,
) {
  const volumeRootGroup = params.volumeRootGroupRef.current;
  if (!volumeRootGroup) {
    return;
  }

  if (!dimensions) {
    params.volumeRootCenterOffsetRef.current.set(0, 0, 0);
    params.volumeRootCenterUnscaledRef.current.set(0, 0, 0);
    params.volumeRootHalfExtentsRef.current.set(0, 0, 0);
    params.volumeNormalizationScaleRef.current = 1;
    params.volumeUserScaleRef.current = 1;
    volumeRootGroup.scale.set(1, 1, 1);
    params.volumeYawRef.current = 0;
    params.volumePitchRef.current = 0;
    applyVolumeYawPitch(params, 0, 0);
    return;
  }

  const { width, height, depth } = dimensions;
  const maxDimension = Math.max(width, height, depth);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    params.volumeRootCenterOffsetRef.current.set(0, 0, 0);
    params.volumeRootCenterUnscaledRef.current.set(0, 0, 0);
    params.volumeRootHalfExtentsRef.current.set(0, 0, 0);
    params.volumeNormalizationScaleRef.current = 1;
    params.volumeUserScaleRef.current = 1;
    volumeRootGroup.scale.set(1, 1, 1);
    params.volumeYawRef.current = 0;
    params.volumePitchRef.current = 0;
    applyVolumeYawPitch(params, 0, 0);
    return;
  }

  const scale = 1 / maxDimension;
  params.volumeNormalizationScaleRef.current = scale;

  const clampedUserScale = Math.min(
    VR_VOLUME_MAX_SCALE,
    Math.max(VR_VOLUME_MIN_SCALE, params.volumeUserScaleRef.current),
  );
  params.volumeUserScaleRef.current = clampedUserScale;

  const centerUnscaled = params.volumeRootCenterUnscaledRef.current;
  centerUnscaled.set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);

  const centerOffset = params.volumeRootCenterOffsetRef.current;
  centerOffset.copy(centerUnscaled).multiplyScalar(scale);

  const halfExtents = params.volumeRootHalfExtentsRef.current;
  halfExtents.set(
    ((width - 1) / 2) * scale,
    ((height - 1) / 2) * scale,
    ((depth - 1) / 2) * scale,
  );

  volumeRootGroup.scale.setScalar(scale * clampedUserScale);
  applyVolumeYawPitch(params, params.volumeYawRef.current, params.volumePitchRef.current);
}
