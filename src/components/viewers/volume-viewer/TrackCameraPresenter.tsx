import { useEffect, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { DesktopViewerCamera } from '../../../hooks/useVolumeRenderSetup';
import type { FollowedVoxelTarget, MovementState } from '../VolumeViewer.types';

type TrackCameraPresenterProps = {
  followedTrackId: string | null;
  followedVoxel: FollowedVoxelTarget | null;
  clampedTimeIndex: number;
  computeTrackCentroid: (trackId: string, timeIndex: number) => THREE.Vector3 | null;
  computeVoxelWorldPosition: (target: FollowedVoxelTarget) => THREE.Vector3 | null;
  movementStateRef: MutableRefObject<MovementState | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  cameraRef: MutableRefObject<DesktopViewerCamera | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3 | null>;
  followTargetOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  previousFollowTargetKeyRef: MutableRefObject<string | null>;
  endPointerLookRef: MutableRefObject<(() => void) | null>;
  rotationLocked?: boolean;
};

export function TrackCameraPresenter({
  followedTrackId,
  followedVoxel,
  clampedTimeIndex,
  computeTrackCentroid,
  computeVoxelWorldPosition,
  movementStateRef,
  controlsRef,
  cameraRef,
  rotationTargetRef,
  followTargetOffsetRef,
  previousFollowTargetKeyRef,
  endPointerLookRef,
  rotationLocked = false,
}: TrackCameraPresenterProps) {
  const followTargetKey = useMemo(
    () =>
      followedTrackId !== null
        ? `track:${followedTrackId}`
        : followedVoxel
          ? `voxel:${followedVoxel.coordinates.x},${followedVoxel.coordinates.y},${followedVoxel.coordinates.z}`
          : null,
    [followedTrackId, followedVoxel],
  );

  const controls = controlsRef.current;
  const camera = cameraRef.current;
  const rotationTarget = rotationTargetRef.current;

  useEffect(() => {
    if (controls) {
      controls.enableRotate = followTargetKey !== null && !rotationLocked;
    }

    const wasFollowingTarget = previousFollowTargetKeyRef.current !== null;
    previousFollowTargetKeyRef.current = followTargetKey;

    if (followTargetKey === null) {
      followTargetOffsetRef.current = null;
      previousFollowTargetKeyRef.current = null;
      if (wasFollowingTarget) {
        endPointerLookRef.current?.();
      }
    }
  }, [
    controls,
    endPointerLookRef,
    followTargetKey,
    followTargetOffsetRef,
    previousFollowTargetKeyRef,
    rotationLocked,
  ]);

  useEffect(() => {
    if (!followTargetKey) {
      return;
    }

    const movementState = movementStateRef.current;
    if (movementState) {
      movementState.moveForward = false;
      movementState.moveBackward = false;
      movementState.moveLeft = false;
      movementState.moveRight = false;
      movementState.moveUp = false;
      movementState.moveDown = false;
      movementState.rollLeft = false;
      movementState.rollRight = false;
    }

    if (!camera || !controls || !rotationTarget) {
      return;
    }

    const targetPosition =
      followedTrackId !== null
        ? computeTrackCentroid(followedTrackId, clampedTimeIndex)
        : followedVoxel
          ? computeVoxelWorldPosition(followedVoxel)
          : null;

    if (!targetPosition) {
      return;
    }

    const previousTargetKey = previousFollowTargetKeyRef.current;
    previousFollowTargetKeyRef.current = followTargetKey;

    let offset: THREE.Vector3;
    if (previousTargetKey === followTargetKey && followTargetOffsetRef.current) {
      offset = followTargetOffsetRef.current.clone();
    } else {
      offset = camera.position.clone().sub(rotationTarget);
    }

    rotationTarget.copy(targetPosition);
    controls.target.copy(targetPosition);
    camera.position.copy(targetPosition).add(offset);
    controls.update();

    followTargetOffsetRef.current = camera.position.clone().sub(rotationTarget);
  }, [
    clampedTimeIndex,
    computeTrackCentroid,
    computeVoxelWorldPosition,
    followTargetOffsetRef,
    movementStateRef,
    previousFollowTargetKeyRef,
    camera,
    controls,
    followTargetKey,
    rotationTarget,
  ]);

  return null;
}
