import { VR_UI_TOUCH_SURFACE_MARGIN } from './constants';
import type {
  ResolveWristMenuUiCandidateParams,
  WristMenuCandidate,
} from './controllerRayHudCandidateTypes';

export type ResolveWristMenuUiCandidateResult = {
  candidate: WristMenuCandidate | null;
  hover:
    | {
        hud: WristMenuCandidate['hud'];
        region: WristMenuCandidate['region'];
      }
    | null;
};

export function resolveWristMenuUiCandidate({
  entry,
  wristMenuHuds,
  vrHudPlaneRef,
  vrHudPlanePointRef,
  vrHudForwardRef,
  wristMenuLocalPoint,
  wristMenuTouchPoint,
  wristMenuCandidatePoint,
}: ResolveWristMenuUiCandidateParams): ResolveWristMenuUiCandidateResult {
  if (entry.wristMenuActive || wristMenuHuds.length === 0) {
    return { candidate: null, hover: null };
  }

  let candidateTarget: WristMenuCandidate['target'] | null = null;
  let candidateDistance = Number.POSITIVE_INFINITY;
  let candidateRegion: WristMenuCandidate['region'] = null;
  let candidateHud: WristMenuCandidate['hud'] | null = null;

  const setCandidate = (
    target: WristMenuCandidate['target'],
    point: { x: number; y: number; z: number },
    distance: number,
    hud: WristMenuCandidate['hud'],
    region: WristMenuCandidate['region'],
  ) => {
    if (!Number.isFinite(distance) || distance < 0 || distance >= candidateDistance) {
      return;
    }
    candidateTarget = target;
    candidateDistance = distance;
    candidateRegion = region;
    candidateHud = hud;
    wristMenuCandidatePoint.set(point.x, point.y, point.z);
  };

  const plane = vrHudPlaneRef.current;
  const planePoint = vrHudPlanePointRef.current;
  const planeNormal = vrHudForwardRef.current;
  const activeType = entry.activeUiTarget?.type ?? null;
  const activeWristMenu = activeType ? activeType.startsWith('wrist-menu-') : false;
  const surfaceMargin = activeWristMenu ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5 : VR_UI_TOUCH_SURFACE_MARGIN;

  for (const hud of wristMenuHuds) {
    if (!hud.group.visible) {
      continue;
    }

    hud.panel.getWorldPosition(planePoint);
    planeNormal.set(0, 0, 1).applyQuaternion(hud.group.quaternion).normalize();
    plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);

    const denominator = planeNormal.dot(entry.rayDirection);
    if (Math.abs(denominator) <= 1e-5) {
      continue;
    }

    const signedDistance = plane.distanceToPoint(entry.rayOrigin);
    const distanceAlongRay = -signedDistance / denominator;
    if (distanceAlongRay < 0 || !Number.isFinite(distanceAlongRay)) {
      continue;
    }

    wristMenuTouchPoint
      .copy(entry.rayDirection)
      .multiplyScalar(distanceAlongRay)
      .add(entry.rayOrigin);
    wristMenuLocalPoint.copy(wristMenuTouchPoint);
    hud.panel.worldToLocal(wristMenuLocalPoint);

    const halfWidth = hud.width / 2 + surfaceMargin;
    const halfHeight = hud.height / 2 + surfaceMargin;
    if (
      wristMenuLocalPoint.x < -halfWidth ||
      wristMenuLocalPoint.x > halfWidth ||
      wristMenuLocalPoint.y < -halfHeight ||
      wristMenuLocalPoint.y > halfHeight
    ) {
      continue;
    }

    let region = hud.regions.find((candidateRegionOption) => {
      const { minX, maxX, minY, maxY } = candidateRegionOption.bounds;
      const minBoundX = Math.min(minX, maxX);
      const maxBoundX = Math.max(minX, maxX);
      const minBoundY = Math.min(minY, maxY);
      const maxBoundY = Math.max(minY, maxY);
      return (
        wristMenuLocalPoint.x >= minBoundX &&
        wristMenuLocalPoint.x <= maxBoundX &&
        wristMenuLocalPoint.y >= minBoundY &&
        wristMenuLocalPoint.y <= maxBoundY
      );
    }) ?? null;

    if (region?.disabled) {
      region = null;
    }

    if (region) {
      setCandidate(
        { type: 'wrist-menu-action', object: hud.panel, data: region },
        wristMenuTouchPoint,
        distanceAlongRay,
        hud,
        region,
      );
    } else {
      setCandidate(
        { type: 'wrist-menu-panel', object: hud.panel },
        wristMenuTouchPoint,
        distanceAlongRay,
        hud,
        null,
      );
    }
  }

  if (!candidateTarget || !candidateHud) {
    return { candidate: null, hover: null };
  }

  return {
    candidate: {
      category: 'wrist-menu',
      target: candidateTarget,
      point: wristMenuCandidatePoint,
      distance: candidateDistance,
      region: candidateRegion,
      hud: candidateHud,
    },
    hover: {
      hud: candidateHud,
      region: candidateRegion,
    },
  };
}
