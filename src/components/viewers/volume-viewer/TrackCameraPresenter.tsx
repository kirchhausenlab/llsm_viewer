import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

type TrackCameraPresenterProps = {
  followedTrackId: string | null;
  clampedTimeIndex: number;
  computeTrackCentroid: (trackId: string, timeIndex: number) => THREE.Vector3 | null;
  movementStateRef: MutableRefObject<{ moveForward: boolean; moveBackward: boolean; moveLeft: boolean; moveRight: boolean; moveUp: boolean; moveDown: boolean } | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3 | null>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  previousFollowedTrackIdRef: MutableRefObject<string | null>;
  endPointerLookRef: MutableRefObject<(() => void) | null>;
};

export function TrackCameraPresenter({
  followedTrackId,
  clampedTimeIndex,
  computeTrackCentroid,
  movementStateRef,
  controlsRef,
  cameraRef,
  rotationTargetRef,
  trackFollowOffsetRef,
  previousFollowedTrackIdRef,
  endPointerLookRef,
}: TrackCameraPresenterProps) {
  useEffect(() => {
    const controls = controlsRef.current;
    if (controls) {
      controls.enableRotate = followedTrackId !== null;
    }

    const wasFollowingTrack = previousFollowedTrackIdRef.current !== null;
    previousFollowedTrackIdRef.current = followedTrackId;

    if (followedTrackId === null) {
      trackFollowOffsetRef.current = null;
      previousFollowedTrackIdRef.current = null;
      if (wasFollowingTrack) {
        endPointerLookRef.current?.();
      }
    }
  }, [controlsRef, endPointerLookRef, followedTrackId, previousFollowedTrackIdRef, trackFollowOffsetRef]);

  useEffect(() => {
    if (followedTrackId === null) {
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
    }

    const controls = controlsRef.current;
    const camera = cameraRef.current;
    const rotationTarget = rotationTargetRef.current;

    if (!camera || !controls || !rotationTarget) {
      return;
    }

    const centroid = computeTrackCentroid(followedTrackId, clampedTimeIndex);
    if (!centroid) {
      return;
    }

    const previousTrackId = previousFollowedTrackIdRef.current;
    previousFollowedTrackIdRef.current = followedTrackId;

    let offset: THREE.Vector3;
    if (previousTrackId === followedTrackId && trackFollowOffsetRef.current) {
      offset = trackFollowOffsetRef.current.clone();
    } else {
      offset = camera.position.clone().sub(rotationTarget);
    }

    rotationTarget.copy(centroid);
    controls.target.copy(centroid);
    camera.position.copy(centroid).add(offset);
    controls.update();

    trackFollowOffsetRef.current = camera.position.clone().sub(rotationTarget);
  }, [cameraRef, clampedTimeIndex, computeTrackCentroid, controlsRef, followedTrackId, movementStateRef, previousFollowedTrackIdRef, rotationTargetRef, trackFollowOffsetRef]);

  return null;
}
