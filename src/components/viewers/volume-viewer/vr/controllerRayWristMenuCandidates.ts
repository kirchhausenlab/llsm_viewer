import {
  VR_UI_TOUCH_SURFACE_MARGIN,
  VR_WRIST_MENU_PROXIMITY_DEPTH,
  VR_WRIST_MENU_PROXIMITY_MARGIN,
} from './constants';
import type {
  ResolveWristMenuUiCandidateParams,
  WristMenuCandidate,
} from './controllerRayHudCandidateTypes';
import type { VrWristMenuInteractiveRegion } from './types';

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

  const activeType = entry.activeUiTarget?.type ?? null;
  const activeWristMenu = activeType ? activeType.startsWith('wrist-menu-') : false;
  const panelMargin = activeWristMenu
    ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
    : VR_UI_TOUCH_SURFACE_MARGIN;
  const regionMargin = activeWristMenu
    ? VR_WRIST_MENU_PROXIMITY_MARGIN * 1.5
    : VR_WRIST_MENU_PROXIMITY_MARGIN;
  const proximityDepth = activeWristMenu
    ? VR_WRIST_MENU_PROXIMITY_DEPTH * 1.25
    : VR_WRIST_MENU_PROXIMITY_DEPTH;

  const findNearestRegion = (
    hud: WristMenuCandidate['hud'],
  ): VrWristMenuInteractiveRegion | null => {
    let nearestRegion: VrWristMenuInteractiveRegion | null = null;
    let nearestScore = Number.POSITIVE_INFINITY;

    for (const regionOption of hud.regions) {
      if (regionOption.disabled) {
        continue;
      }
      const { minX, maxX, minY, maxY } = regionOption.bounds;
      const minBoundX = Math.min(minX, maxX);
      const maxBoundX = Math.max(minX, maxX);
      const minBoundY = Math.min(minY, maxY);
      const maxBoundY = Math.max(minY, maxY);
      if (
        wristMenuLocalPoint.x < minBoundX - regionMargin ||
        wristMenuLocalPoint.x > maxBoundX + regionMargin ||
        wristMenuLocalPoint.y < minBoundY - regionMargin ||
        wristMenuLocalPoint.y > maxBoundY + regionMargin
      ) {
        continue;
      }

      const outsideX =
        wristMenuLocalPoint.x < minBoundX
          ? minBoundX - wristMenuLocalPoint.x
          : wristMenuLocalPoint.x > maxBoundX
            ? wristMenuLocalPoint.x - maxBoundX
            : 0;
      const outsideY =
        wristMenuLocalPoint.y < minBoundY
          ? minBoundY - wristMenuLocalPoint.y
          : wristMenuLocalPoint.y > maxBoundY
            ? wristMenuLocalPoint.y - maxBoundY
            : 0;
      const centerX = (minBoundX + maxBoundX) * 0.5;
      const centerY = (minBoundY + maxBoundY) * 0.5;
      const centerDistanceSq =
        (wristMenuLocalPoint.x - centerX) * (wristMenuLocalPoint.x - centerX) +
        (wristMenuLocalPoint.y - centerY) * (wristMenuLocalPoint.y - centerY);
      const score = outsideX * outsideX + outsideY * outsideY + centerDistanceSq * 1e-3;
      if (score < nearestScore) {
        nearestScore = score;
        nearestRegion = regionOption;
      }
    }

    return nearestRegion;
  };

  for (const hud of wristMenuHuds) {
    if (!hud.group.visible) {
      continue;
    }

    wristMenuLocalPoint.copy(entry.rayOrigin);
    hud.panel.worldToLocal(wristMenuLocalPoint);
    const planeDistance = Math.abs(wristMenuLocalPoint.z);
    if (planeDistance > proximityDepth || !Number.isFinite(planeDistance)) {
      continue;
    }

    const halfWidth = hud.width / 2 + panelMargin;
    const halfHeight = hud.height / 2 + panelMargin;
    if (
      wristMenuLocalPoint.x < -halfWidth ||
      wristMenuLocalPoint.x > halfWidth ||
      wristMenuLocalPoint.y < -halfHeight ||
      wristMenuLocalPoint.y > halfHeight
    ) {
      continue;
    }

    wristMenuTouchPoint.copy(wristMenuLocalPoint);
    wristMenuTouchPoint.z = 0;
    hud.panel.localToWorld(wristMenuTouchPoint);

    const region = findNearestRegion(hud);

    if (region) {
      setCandidate(
        { type: 'wrist-menu-action', object: hud.panel, data: region },
        wristMenuTouchPoint,
        planeDistance,
        hud,
        region,
      );
    } else {
      setCandidate(
        { type: 'wrist-menu-panel', object: hud.panel },
        wristMenuTouchPoint,
        planeDistance,
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
