import { VR_PLAYBACK_PANEL_HEIGHT, VR_PLAYBACK_PANEL_WIDTH, VR_UI_TOUCH_DISTANCE, VR_UI_TOUCH_SURFACE_MARGIN } from './constants';
import type * as THREE from 'three';
import type { PlaybackCandidate, ResolvePlaybackUiCandidateParams } from './controllerRayHudCandidateTypes';

export function resolvePlaybackUiCandidate({
  entry,
  playbackStateRef,
  playbackHudInstance,
  applyPlaybackSliderFromWorldPointRef,
  applyFpsSliderFromWorldPointRef,
  vrHudPlaneRef,
  vrHudPlanePointRef,
  vrHudForwardRef,
  vrHandleWorldPointRef,
  vrHandleSecondaryPointRef,
  playbackTouchPoint,
  playbackLocalPoint,
  playbackPlaneNormal,
  playbackSliderPoint,
  fpsSliderPoint,
  playbackCandidatePoint,
}: ResolvePlaybackUiCandidateParams): PlaybackCandidate | null {
  if (!playbackHudInstance || !playbackHudInstance.group.visible) {
    return null;
  }

  let candidateTarget: PlaybackCandidate['target'] | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;

  const setCandidate = (target: PlaybackCandidate['target'], point: { x: number; y: number; z: number }, distance: number) => {
    if (!Number.isFinite(distance) || distance < 0 || distance >= candidateDistance) {
      return;
    }
    candidateTarget = target;
    candidateDistance = distance;
    playbackCandidatePoint.set(point.x, point.y, point.z);
  };

  const plane = vrHudPlaneRef.current;
  const planePoint = vrHudPlanePointRef.current;
  playbackHudInstance.panel.getWorldPosition(planePoint);
  const planeNormal = vrHudForwardRef.current;
  planeNormal.set(0, 0, 1).applyQuaternion(playbackHudInstance.group.quaternion).normalize();
  plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  const activeType = entry.activeUiTarget?.type ?? null;
  const activePlayback = activeType ? activeType.startsWith('playback-') : false;
  const playbackSliderActive = activeType === 'playback-slider';
  const fpsSliderActive = activeType === 'playback-fps-slider';
  const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
  const fpsSliderLocked = fpsSliderActive && entry.isSelecting;

  const translateHandle = playbackHudInstance.panelTranslateHandle;
  const yawHandles = playbackHudInstance.panelYawHandles;
  const pitchHandle = playbackHudInstance.panelPitchHandle;
  const handleWorldPoint = vrHandleWorldPointRef.current;
  const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

  if (translateHandle && !playbackSliderLocked && !fpsSliderLocked) {
    translateHandle.getWorldPosition(handleWorldPoint);
    const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
    if (activeType === 'playback-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
      setCandidate({ type: 'playback-panel-grab', object: translateHandle }, handleWorldPoint, distance);
    }
  }

  if (yawHandles.length > 0 && !playbackSliderLocked && !fpsSliderLocked) {
    const activeYawObject =
      activeType === 'playback-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
    for (const yawHandle of yawHandles) {
      const isActiveHandle = activeYawObject === yawHandle;
      if (!isActiveHandle && activeYawObject && activeType === 'playback-panel-yaw') {
        continue;
      }
      yawHandle.getWorldPosition(handleSecondaryPoint);
      const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
      if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
        setCandidate({ type: 'playback-panel-yaw', object: yawHandle }, handleSecondaryPoint, distance);
      }
    }
  }

  if (pitchHandle && !playbackSliderLocked && !fpsSliderLocked) {
    pitchHandle.getWorldPosition(handleSecondaryPoint);
    const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
    if (
      (activeType === 'playback-panel-pitch' && entry.activeUiTarget?.object === pitchHandle) ||
      (activeType !== 'playback-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)
    ) {
      setCandidate({ type: 'playback-panel-pitch', object: pitchHandle }, handleSecondaryPoint, distance);
    }
  }

  const denominator = planeNormal.dot(entry.rayDirection);
  if (Math.abs(denominator) > 1e-5) {
    const signedDistance = plane.distanceToPoint(entry.rayOrigin);
    const distanceAlongRay = -signedDistance / denominator;
    if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
      playbackTouchPoint.copy(entry.rayDirection).multiplyScalar(distanceAlongRay).add(entry.rayOrigin);
      playbackPlaneNormal.copy(planeNormal);
      playbackLocalPoint.copy(playbackTouchPoint);
      playbackHudInstance.group.worldToLocal(playbackLocalPoint);

      const surfaceMargin = activePlayback ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;
      const halfWidth = VR_PLAYBACK_PANEL_WIDTH / 2 + surfaceMargin;
      const halfHeight = VR_PLAYBACK_PANEL_HEIGHT / 2 + surfaceMargin;

      if (
        playbackLocalPoint.x >= -halfWidth &&
        playbackLocalPoint.x <= halfWidth &&
        playbackLocalPoint.y >= -halfHeight &&
        playbackLocalPoint.y <= halfHeight
      ) {
        const rawDistance = distanceAlongRay;
        const playbackSliderMargin = playbackSliderActive ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;
        const fpsSliderMargin = fpsSliderActive ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;

        const playbackSliderHalfWidth =
          (playbackHudInstance.playbackSliderWidth + 0.04) / 2 + playbackSliderMargin;
        const playbackSliderHalfHeight = 0.08 / 2 + playbackSliderMargin;
        const playbackSliderLocalX = playbackLocalPoint.x - playbackHudInstance.playbackSliderGroup.position.x;
        const playbackSliderLocalY = playbackLocalPoint.y - playbackHudInstance.playbackSliderGroup.position.y;
        const inPlaybackSliderArea =
          playbackSliderLocalX >= -playbackSliderHalfWidth &&
          playbackSliderLocalX <= playbackSliderHalfWidth &&
          playbackSliderLocalY >= -playbackSliderHalfHeight &&
          playbackSliderLocalY <= playbackSliderHalfHeight;

        const fpsSliderHalfWidth = (playbackHudInstance.fpsSliderWidth + 0.04) / 2 + fpsSliderMargin;
        const fpsSliderHalfHeight = 0.08 / 2 + fpsSliderMargin;
        const fpsSliderLocalX = playbackLocalPoint.x - playbackHudInstance.fpsSliderGroup.position.x;
        const fpsSliderLocalY = playbackLocalPoint.y - playbackHudInstance.fpsSliderGroup.position.y;
        const inFpsSliderArea =
          fpsSliderLocalX >= -fpsSliderHalfWidth &&
          fpsSliderLocalX <= fpsSliderHalfWidth &&
          fpsSliderLocalY >= -fpsSliderHalfHeight &&
          fpsSliderLocalY <= fpsSliderHalfHeight;
        const fpsSliderEnabled = playbackStateRef.current.totalTimepoints > 1;

        const playCenter = playbackHudInstance.playButton.position;
        const playRadius = 0.045 + surfaceMargin;
        const playDeltaX = playbackLocalPoint.x - playCenter.x;
        const playDeltaY = playbackLocalPoint.y - playCenter.y;
        const inPlayButton = playDeltaX * playDeltaX + playDeltaY * playDeltaY <= playRadius * playRadius;

        const resetVolumeCenter = playbackHudInstance.resetVolumeButton.position;
        const resetVolumeHalfWidth = playbackHudInstance.resetVolumeButtonHalfWidth + surfaceMargin;
        const resetVolumeHalfHeight = playbackHudInstance.resetVolumeButtonHalfHeight + surfaceMargin;
        const resetVolumeDeltaX = playbackLocalPoint.x - resetVolumeCenter.x;
        const resetVolumeDeltaY = playbackLocalPoint.y - resetVolumeCenter.y;
        const inResetVolumeButton =
          Math.abs(resetVolumeDeltaX) <= resetVolumeHalfWidth && Math.abs(resetVolumeDeltaY) <= resetVolumeHalfHeight;

        const resetHudCenter = playbackHudInstance.resetHudButton.position;
        const resetHudHalfWidth = playbackHudInstance.resetHudButtonHalfWidth + surfaceMargin;
        const resetHudHalfHeight = playbackHudInstance.resetHudButtonHalfHeight + surfaceMargin;
        const resetHudDeltaX = playbackLocalPoint.x - resetHudCenter.x;
        const resetHudDeltaY = playbackLocalPoint.y - resetHudCenter.y;
        const inResetHudButton =
          Math.abs(resetHudDeltaX) <= resetHudHalfWidth && Math.abs(resetHudDeltaY) <= resetHudHalfHeight;

        const exitCenter = playbackHudInstance.exitButton.position;
        const exitHalfWidth = playbackHudInstance.exitButtonHalfWidth + surfaceMargin;
        const exitHalfHeight = playbackHudInstance.exitButtonHalfHeight + surfaceMargin;
        const exitDeltaX = playbackLocalPoint.x - exitCenter.x;
        const exitDeltaY = playbackLocalPoint.y - exitCenter.y;
        const inExitButton = Math.abs(exitDeltaX) <= exitHalfWidth && Math.abs(exitDeltaY) <= exitHalfHeight;

        const modeCenter = playbackHudInstance.modeButton.position;
        const modeHalfWidth = playbackHudInstance.modeButtonHalfWidth + surfaceMargin;
        const modeHalfHeight = playbackHudInstance.modeButtonHalfHeight + surfaceMargin;
        const modeDeltaX = playbackLocalPoint.x - modeCenter.x;
        const modeDeltaY = playbackLocalPoint.y - modeCenter.y;
        const inModeButton =
          playbackHudInstance.modeButton.visible &&
          Math.abs(modeDeltaX) <= modeHalfWidth &&
          Math.abs(modeDeltaY) <= modeHalfHeight;

        if (!playbackSliderLocked && !fpsSliderLocked && inResetVolumeButton) {
          setCandidate({ type: 'playback-reset-volume', object: playbackHudInstance.resetVolumeButton }, playbackTouchPoint, rawDistance);
        } else if (!playbackSliderLocked && !fpsSliderLocked && inResetHudButton) {
          setCandidate({ type: 'playback-reset-hud', object: playbackHudInstance.resetHudButton }, playbackTouchPoint, rawDistance);
        } else if (!playbackSliderLocked && !fpsSliderLocked && inExitButton) {
          setCandidate({ type: 'playback-exit-vr', object: playbackHudInstance.exitButton }, playbackTouchPoint, rawDistance);
        } else if (!playbackSliderLocked && !fpsSliderLocked && inModeButton) {
          setCandidate({ type: 'playback-toggle-mode', object: playbackHudInstance.modeButton }, playbackTouchPoint, rawDistance);
        } else if (!playbackSliderLocked && !fpsSliderLocked && inPlayButton) {
          setCandidate({ type: 'playback-play-toggle', object: playbackHudInstance.playButton }, playbackTouchPoint, rawDistance);
        }

        if (playbackSliderLocked || inPlaybackSliderArea) {
          const sliderDepth =
            playbackHudInstance.playbackSliderGroup.position.z +
            playbackHudInstance.playbackSliderHitArea.position.z;
          playbackSliderPoint.copy(playbackTouchPoint).addScaledVector(playbackPlaneNormal, sliderDepth);
          setCandidate({ type: 'playback-slider', object: playbackHudInstance.playbackSliderHitArea }, playbackSliderPoint, rawDistance);
          if (playbackSliderActive && !playbackStateRef.current.playbackDisabled) {
            applyPlaybackSliderFromWorldPointRef.current?.(playbackSliderPoint);
          }
        }

        if (fpsSliderEnabled && (fpsSliderLocked || inFpsSliderArea)) {
          const fpsDepth = playbackHudInstance.fpsSliderGroup.position.z + playbackHudInstance.fpsSliderHitArea.position.z;
          fpsSliderPoint.copy(playbackTouchPoint).addScaledVector(playbackPlaneNormal, fpsDepth);
          setCandidate({ type: 'playback-fps-slider', object: playbackHudInstance.fpsSliderHitArea }, fpsSliderPoint, rawDistance);
          if (fpsSliderActive) {
            applyFpsSliderFromWorldPointRef.current?.(fpsSliderPoint);
          }
        }

        if (!playbackSliderLocked) {
          setCandidate({ type: 'playback-panel', object: playbackHudInstance.panel }, playbackTouchPoint, rawDistance);
        }
      }
    }
  }

  if (!candidateTarget) {
    return null;
  }

  return {
    category: 'playback',
    target: candidateTarget,
    point: playbackCandidatePoint,
    distance: candidateDistance,
    region: null,
  };
}
