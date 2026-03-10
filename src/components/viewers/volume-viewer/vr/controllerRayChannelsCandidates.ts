import { VR_UI_TOUCH_DISTANCE, VR_UI_TOUCH_SURFACE_MARGIN } from './constants';
import type * as THREE from 'three';
import type {
  ChannelsCandidate,
  ResolveChannelsUiCandidateParams,
} from './controllerRayHudCandidateTypes';

export type ResolveChannelsUiCandidateResult = {
  candidate: ChannelsCandidate | null;
  hoverRegion: ChannelsCandidate['region'];
};

export function resolveChannelsUiCandidate({
  entry,
  channelsHudInstance,
  resolveChannelsRegionFromPoint,
  applyVrChannelsSliderFromPointRef,
  vrHudPlaneRef,
  vrHudPlanePointRef,
  vrHudForwardRef,
  vrHandleWorldPointRef,
  vrHandleSecondaryPointRef,
  vrChannelsLocalPointRef,
  channelsTouchPoint,
  channelsCandidatePoint,
}: ResolveChannelsUiCandidateParams): ResolveChannelsUiCandidateResult {
  if (!channelsHudInstance || !channelsHudInstance.group.visible) {
    return { candidate: null, hoverRegion: null };
  }

  let candidateTarget: ChannelsCandidate['target'] | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;
  let candidateRegion: ChannelsCandidate['region'] = null;

  const setCandidate = (
    target: ChannelsCandidate['target'],
    point: { x: number; y: number; z: number },
    distance: number,
    region: ChannelsCandidate['region'],
  ) => {
    if (!Number.isFinite(distance) || distance < 0 || distance >= candidateDistance) {
      return;
    }
    candidateTarget = target;
    candidateDistance = distance;
    candidateRegion = region;
    channelsCandidatePoint.set(point.x, point.y, point.z);
  };

  const plane = vrHudPlaneRef.current;
  const planePoint = vrHudPlanePointRef.current;
  channelsHudInstance.panel.getWorldPosition(planePoint);
  const planeNormal = vrHudForwardRef.current;
  planeNormal.set(0, 0, 1).applyQuaternion(channelsHudInstance.group.quaternion).normalize();
  plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

  const activeType = entry.activeUiTarget?.type ?? null;
  const activeChannels = activeType ? activeType.startsWith('channels-') : false;
  const channelsSliderActive = activeType === 'channels-slider';
  const activeChannelsSliderRegion =
    channelsSliderActive &&
    entry.isSelecting &&
    entry.activeUiTarget?.data &&
    !(entry.activeUiTarget.data as NonNullable<ChannelsCandidate['region']>).disabled
      ? (entry.activeUiTarget.data as NonNullable<ChannelsCandidate['region']>)
      : null;
  const channelsSliderLocked = Boolean(activeChannelsSliderRegion);

  const translateHandle = channelsHudInstance.panelTranslateHandle;
  const yawHandles = channelsHudInstance.panelYawHandles;
  const pitchHandle = channelsHudInstance.panelPitchHandle;
  const handleWorldPoint = vrHandleWorldPointRef.current;
  const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

  if (translateHandle && !channelsSliderLocked) {
    translateHandle.getWorldPosition(handleWorldPoint);
    const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
    if (activeType === 'channels-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
      setCandidate({ type: 'channels-panel-grab', object: translateHandle }, handleWorldPoint, distance, null);
    }
  }

  if (yawHandles.length > 0 && !channelsSliderLocked) {
    const activeYawObject =
      activeType === 'channels-panel-yaw' ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
    for (const yawHandle of yawHandles) {
      const isActiveHandle = activeYawObject === yawHandle;
      if (!isActiveHandle && activeYawObject && activeType === 'channels-panel-yaw') {
        continue;
      }
      yawHandle.getWorldPosition(handleSecondaryPoint);
      const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
      if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
        setCandidate({ type: 'channels-panel-yaw', object: yawHandle }, handleSecondaryPoint, distance, null);
      }
    }
  }

  if (pitchHandle && !channelsSliderLocked) {
    pitchHandle.getWorldPosition(handleSecondaryPoint);
    const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
    const isActivePitch = activeType === 'channels-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
    if (isActivePitch || (activeType !== 'channels-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
      setCandidate({ type: 'channels-panel-pitch', object: pitchHandle }, handleSecondaryPoint, distance, null);
    }
  }

  const denominator = planeNormal.dot(entry.rayDirection);
  if (Math.abs(denominator) > 1e-5) {
    const signedDistance = plane.distanceToPoint(entry.rayOrigin);
    const distanceAlongRay = -signedDistance / denominator;
    if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
      channelsTouchPoint.copy(entry.rayDirection).multiplyScalar(distanceAlongRay).add(entry.rayOrigin);
      vrChannelsLocalPointRef.current.copy(channelsTouchPoint);
      channelsHudInstance.group.worldToLocal(vrChannelsLocalPointRef.current);

      const surfaceMargin = activeChannels ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;
      const halfWidth = channelsHudInstance.width / 2 + surfaceMargin;
      const halfHeight = channelsHudInstance.height / 2 + surfaceMargin;

      if (
        vrChannelsLocalPointRef.current.x >= -halfWidth &&
        vrChannelsLocalPointRef.current.x <= halfWidth &&
        vrChannelsLocalPointRef.current.y >= -halfHeight &&
        vrChannelsLocalPointRef.current.y <= halfHeight
      ) {
        const rawDistance = distanceAlongRay;
        let region = resolveChannelsRegionFromPoint(channelsHudInstance, channelsTouchPoint);
        if (region?.disabled) {
          region = null;
        }
        const isActiveSliderRegion =
          Boolean(region) &&
          Boolean(activeChannelsSliderRegion) &&
          region?.targetType === 'channels-slider' &&
          region === activeChannelsSliderRegion;

        if (region && (!channelsSliderLocked || isActiveSliderRegion)) {
          setCandidate(
            { type: region.targetType, object: channelsHudInstance.panel, data: region },
            channelsTouchPoint,
            rawDistance,
            region,
          );

          if (channelsSliderActive && region.targetType === 'channels-slider' && isActiveSliderRegion) {
            applyVrChannelsSliderFromPointRef.current?.(region, channelsTouchPoint);
          }
        }

        if (channelsSliderLocked && activeChannelsSliderRegion) {
          setCandidate(
            { type: 'channels-slider', object: channelsHudInstance.panel, data: activeChannelsSliderRegion },
            channelsTouchPoint,
            rawDistance,
            activeChannelsSliderRegion,
          );
          applyVrChannelsSliderFromPointRef.current?.(activeChannelsSliderRegion, channelsTouchPoint);
        }

        if (!channelsSliderLocked) {
          setCandidate({ type: 'channels-panel', object: channelsHudInstance.panel }, channelsTouchPoint, rawDistance, null);
        }
      }
    }
  }

  if (!candidateTarget) {
    return { candidate: null, hoverRegion: null };
  }

  return {
    candidate: {
      category: 'channels',
      target: candidateTarget,
      point: channelsCandidatePoint,
      distance: candidateDistance,
      region: candidateRegion,
    },
    hoverRegion: candidateRegion,
  };
}
