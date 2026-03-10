import { VR_UI_TOUCH_DISTANCE, VR_UI_TOUCH_SURFACE_MARGIN } from './constants';
import type * as THREE from 'three';
import type {
  ResolveTracksUiCandidateParams,
  TracksCandidate,
} from './controllerRayHudCandidateTypes';

export type ResolveTracksUiCandidateResult = {
  candidate: TracksCandidate | null;
  hoverRegion: TracksCandidate['region'];
};

export function resolveTracksUiCandidate({
  entry,
  tracksHudInstance,
  resolveTracksRegionFromPoint,
  applyVrTracksSliderFromPointRef,
  applyVrTracksScrollFromPointRef,
  vrHudPlaneRef,
  vrHudPlanePointRef,
  vrHudForwardRef,
  vrHandleWorldPointRef,
  vrHandleSecondaryPointRef,
  vrTracksLocalPointRef,
  tracksTouchPoint,
  tracksCandidatePoint,
}: ResolveTracksUiCandidateParams): ResolveTracksUiCandidateResult {
  if (!tracksHudInstance || !tracksHudInstance.group.visible) {
    return { candidate: null, hoverRegion: null };
  }

  let candidateTarget: TracksCandidate['target'] | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;
  let candidateRegion: TracksCandidate['region'] = null;

  const setCandidate = (
    target: TracksCandidate['target'],
    point: { x: number; y: number; z: number },
    distance: number,
    region: TracksCandidate['region'],
  ) => {
    if (!Number.isFinite(distance) || distance < 0 || distance >= candidateDistance) {
      return;
    }
    candidateTarget = target;
    candidateDistance = distance;
    candidateRegion = region;
    tracksCandidatePoint.set(point.x, point.y, point.z);
  };

  const plane = vrHudPlaneRef.current;
  const planePoint = vrHudPlanePointRef.current;
  tracksHudInstance.panel.getWorldPosition(planePoint);
  const planeNormal = vrHudForwardRef.current;
  planeNormal.set(0, 0, 1).applyQuaternion(tracksHudInstance.group.quaternion).normalize();
  plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  const activeType = entry.activeUiTarget?.type ?? null;
  const activeTracks = activeType ? activeType.startsWith('tracks-') : false;
  const tracksSliderActive = activeType === 'tracks-slider';
  const activeTracksSliderRegion =
    tracksSliderActive &&
    entry.isSelecting &&
    entry.activeUiTarget?.data &&
    !(entry.activeUiTarget.data as NonNullable<TracksCandidate['region']>).disabled
      ? (entry.activeUiTarget.data as NonNullable<TracksCandidate['region']>)
      : null;
  const tracksSliderLocked = Boolean(activeTracksSliderRegion);

  const translateHandle = tracksHudInstance.panelTranslateHandle;
  const yawHandles = tracksHudInstance.panelYawHandles;
  const pitchHandle = tracksHudInstance.panelPitchHandle;
  const handleWorldPoint = vrHandleWorldPointRef.current;
  const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

  if (translateHandle && !tracksSliderLocked) {
    translateHandle.getWorldPosition(handleWorldPoint);
    const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
    if (activeType === 'tracks-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
      setCandidate({ type: 'tracks-panel-grab', object: translateHandle }, handleWorldPoint, distance, null);
    }
  }

  if (yawHandles.length > 0 && !tracksSliderLocked) {
    const activeYawObject =
      activeType === 'tracks-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
    for (const yawHandle of yawHandles) {
      const isActiveHandle = activeYawObject === yawHandle;
      if (!isActiveHandle && activeYawObject && activeType === 'tracks-panel-yaw') {
        continue;
      }
      yawHandle.getWorldPosition(handleSecondaryPoint);
      const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
      if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
        setCandidate({ type: 'tracks-panel-yaw', object: yawHandle }, handleSecondaryPoint, distance, null);
      }
    }
  }

  if (pitchHandle && !tracksSliderLocked) {
    pitchHandle.getWorldPosition(handleSecondaryPoint);
    const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
    const isActivePitch = activeType === 'tracks-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
    if (isActivePitch || (activeType !== 'tracks-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
      setCandidate({ type: 'tracks-panel-pitch', object: pitchHandle }, handleSecondaryPoint, distance, null);
    }
  }

  const denominator = planeNormal.dot(entry.rayDirection);
  if (Math.abs(denominator) > 1e-5) {
    const signedDistance = plane.distanceToPoint(entry.rayOrigin);
    const distanceAlongRay = -signedDistance / denominator;
    if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
      tracksTouchPoint.copy(entry.rayDirection).multiplyScalar(distanceAlongRay).add(entry.rayOrigin);
      vrTracksLocalPointRef.current.copy(tracksTouchPoint);
      tracksHudInstance.group.worldToLocal(vrTracksLocalPointRef.current);

      const surfaceMargin = activeTracks ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;
      const halfWidth = tracksHudInstance.width / 2 + surfaceMargin;
      const halfHeight = tracksHudInstance.height / 2 + surfaceMargin;

      if (
        vrTracksLocalPointRef.current.x >= -halfWidth &&
        vrTracksLocalPointRef.current.x <= halfWidth &&
        vrTracksLocalPointRef.current.y >= -halfHeight &&
        vrTracksLocalPointRef.current.y <= halfHeight
      ) {
        const rawDistance = distanceAlongRay;
        const region = resolveTracksRegionFromPoint(tracksHudInstance, tracksTouchPoint);
        const isActiveSliderRegion =
          Boolean(region) &&
          Boolean(activeTracksSliderRegion) &&
          region?.targetType === 'tracks-slider' &&
          region === activeTracksSliderRegion;

        if (region && (!tracksSliderLocked || isActiveSliderRegion)) {
          setCandidate(
            { type: region.targetType, object: tracksHudInstance.panel, data: region },
            tracksTouchPoint,
            rawDistance,
            region,
          );

          if (entry.isSelecting && entry.activeUiTarget) {
            if (
              entry.activeUiTarget.type === 'tracks-slider' &&
              region.targetType === 'tracks-slider' &&
              isActiveSliderRegion
            ) {
              applyVrTracksSliderFromPointRef.current?.(region, tracksTouchPoint);
            } else if (
              entry.activeUiTarget.type === 'tracks-scroll' &&
              region.targetType === 'tracks-scroll'
            ) {
              applyVrTracksScrollFromPointRef.current?.(region, tracksTouchPoint);
            }
          }
        }

        if (tracksSliderLocked && activeTracksSliderRegion) {
          setCandidate(
            { type: 'tracks-slider', object: tracksHudInstance.panel, data: activeTracksSliderRegion },
            tracksTouchPoint,
            rawDistance,
            activeTracksSliderRegion,
          );
          applyVrTracksSliderFromPointRef.current?.(activeTracksSliderRegion, tracksTouchPoint);
        } else if (
          entry.isSelecting &&
          entry.activeUiTarget?.type === 'tracks-scroll' &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as NonNullable<TracksCandidate['region']>).disabled
        ) {
          const activeRegion = entry.activeUiTarget.data as NonNullable<TracksCandidate['region']>;
          setCandidate(
            { type: 'tracks-scroll', object: tracksHudInstance.panel, data: activeRegion },
            tracksTouchPoint,
            rawDistance,
            activeRegion,
          );
          applyVrTracksScrollFromPointRef.current?.(activeRegion, tracksTouchPoint);
        }

        if (!tracksSliderLocked) {
          setCandidate({ type: 'tracks-panel', object: tracksHudInstance.panel }, tracksTouchPoint, rawDistance, null);
        }
      }
    }
  }

  if (!candidateTarget) {
    return { candidate: null, hoverRegion: null };
  }

  return {
    candidate: {
      category: 'tracks',
      target: candidateTarget,
      point: tracksCandidatePoint,
      distance: candidateDistance,
      region: candidateRegion,
    },
    hoverRegion: candidateRegion,
  };
}
