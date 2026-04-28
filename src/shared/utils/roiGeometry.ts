import type { RoiAlignment, RoiDefinition } from '../../types/roi';
import { cloneRoiDefinition, normalizeRoiAlignment } from '../../types/roi';
import { computeDeskewGlassTiltRadians } from './deskew';

export type RoiGeometryPoint = {
  x: number;
  y: number;
  z: number;
};

export type RoiGeometryDeskew = {
  angleRadians: number;
  direction: 'X' | 'Y';
};

export type RoiGeometryBasis = {
  x: RoiGeometryPoint;
  y: RoiGeometryPoint;
  z: RoiGeometryPoint;
};

export type RoiGeometryBounds = {
  center: RoiGeometryPoint;
  radius: RoiGeometryPoint;
};

export const ROI_AXES_BASIS: RoiGeometryBasis = {
  x: { x: 1, y: 0, z: 0 },
  y: { x: 0, y: 1, z: 0 },
  z: { x: 0, y: 0, z: 1 },
};

const EPSILON = 1e-9;

function rotateForGlass(vector: RoiGeometryPoint, deskew: RoiGeometryDeskew): RoiGeometryPoint {
  const deskewAngle = computeDeskewGlassTiltRadians(deskew.angleRadians);
  if (!Number.isFinite(deskewAngle)) {
    return { ...vector };
  }

  const sign = deskewAngle < 0 ? -1 : 1;
  const tilt = sign * (Math.PI / 2 - Math.abs(deskewAngle));
  if (!Number.isFinite(tilt) || Math.abs(tilt) <= EPSILON) {
    return { ...vector };
  }

  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  if (deskew.direction === 'X') {
    return {
      x: vector.x * cos + vector.z * sin,
      y: vector.y,
      z: -vector.x * sin + vector.z * cos,
    };
  }

  return {
    x: vector.x,
    y: vector.y * cos - vector.z * sin,
    z: vector.y * sin + vector.z * cos,
  };
}

export function isGlassRoiAlignmentActive(
  alignment: RoiAlignment | null | undefined,
  deskew: RoiGeometryDeskew | null | undefined,
): boolean {
  return normalizeRoiAlignment(alignment) === 'glass' && deskew !== null && deskew !== undefined;
}

export function resolveRoiGeometryBasis(
  alignment: RoiAlignment | null | undefined,
  deskew: RoiGeometryDeskew | null | undefined,
): RoiGeometryBasis {
  const glassDeskew = deskew ?? null;
  if (normalizeRoiAlignment(alignment) !== 'glass' || !glassDeskew) {
    return ROI_AXES_BASIS;
  }

  return {
    x: rotateForGlass(ROI_AXES_BASIS.x, glassDeskew),
    y: rotateForGlass(ROI_AXES_BASIS.y, glassDeskew),
    z: rotateForGlass(ROI_AXES_BASIS.z, glassDeskew),
  };
}

export function dotRoiGeometryPoint(left: RoiGeometryPoint, right: RoiGeometryPoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

export function negateRoiGeometryPoint(point: RoiGeometryPoint): RoiGeometryPoint {
  return {
    x: -point.x,
    y: -point.y,
    z: -point.z,
  };
}

export function subtractRoiGeometryPoint(left: RoiGeometryPoint, right: RoiGeometryPoint): RoiGeometryPoint {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

export function midpointRoiGeometryPoint(left: RoiGeometryPoint, right: RoiGeometryPoint): RoiGeometryPoint {
  return {
    x: (left.x + right.x) * 0.5,
    y: (left.y + right.y) * 0.5,
    z: (left.z + right.z) * 0.5,
  };
}

export function addScaledRoiGeometryPoint(
  point: RoiGeometryPoint,
  direction: RoiGeometryPoint,
  scale: number,
): RoiGeometryPoint {
  return {
    x: point.x + direction.x * scale,
    y: point.y + direction.y * scale,
    z: point.z + direction.z * scale,
  };
}

export function resolveSignedRoiGeometryRadius(
  start: RoiGeometryPoint,
  end: RoiGeometryPoint,
  basis: RoiGeometryBasis,
): RoiGeometryPoint {
  const halfDiagonal = {
    x: (end.x - start.x) * 0.5,
    y: (end.y - start.y) * 0.5,
    z: (end.z - start.z) * 0.5,
  };
  return {
    x: dotRoiGeometryPoint(halfDiagonal, basis.x),
    y: dotRoiGeometryPoint(halfDiagonal, basis.y),
    z: dotRoiGeometryPoint(halfDiagonal, basis.z),
  };
}

export function resolveRoiGeometryBounds(
  start: RoiGeometryPoint,
  end: RoiGeometryPoint,
  basis: RoiGeometryBasis,
): RoiGeometryBounds {
  const signedRadius = resolveSignedRoiGeometryRadius(start, end, basis);
  return {
    center: midpointRoiGeometryPoint(start, end),
    radius: {
      x: Math.abs(signedRadius.x),
      y: Math.abs(signedRadius.y),
      z: Math.abs(signedRadius.z),
    },
  };
}

export function composeRoiGeometryVector(
  basis: RoiGeometryBasis,
  components: RoiGeometryPoint,
): RoiGeometryPoint {
  const withX = addScaledRoiGeometryPoint({ x: 0, y: 0, z: 0 }, basis.x, components.x);
  const withY = addScaledRoiGeometryPoint(withX, basis.y, components.y);
  return addScaledRoiGeometryPoint(withY, basis.z, components.z);
}

export function reorientRoiGeometryEndpoints(
  start: RoiGeometryPoint,
  end: RoiGeometryPoint,
  fromBasis: RoiGeometryBasis,
  toBasis: RoiGeometryBasis,
): { start: RoiGeometryPoint; end: RoiGeometryPoint } {
  const center = midpointRoiGeometryPoint(start, end);
  const signedRadius = resolveSignedRoiGeometryRadius(start, end, fromBasis);
  const nextHalfDiagonal = composeRoiGeometryVector(toBasis, signedRadius);
  return {
    start: subtractRoiGeometryPoint(center, nextHalfDiagonal),
    end: addScaledRoiGeometryPoint(center, nextHalfDiagonal, 1),
  };
}

export function reorientRoiDefinitionForAlignment(
  roi: RoiDefinition,
  nextAlignment: RoiAlignment,
  deskew: RoiGeometryDeskew | null | undefined,
): RoiDefinition {
  const normalizedNextAlignment = normalizeRoiAlignment(nextAlignment);
  const normalizedCurrentAlignment = normalizeRoiAlignment(roi.alignment);
  const cloned = cloneRoiDefinition(roi);
  const nextBase = {
    ...cloned,
    ...(normalizedNextAlignment === 'glass' ? { alignment: normalizedNextAlignment } : { alignment: undefined }),
  };

  if (
    cloned.mode !== '3d' ||
    cloned.shape === 'line' ||
    normalizedCurrentAlignment === normalizedNextAlignment ||
    !deskew
  ) {
    return nextBase;
  }

  const fromBasis = resolveRoiGeometryBasis(normalizedCurrentAlignment, deskew);
  const toBasis = resolveRoiGeometryBasis(normalizedNextAlignment, deskew);
  const endpoints = reorientRoiGeometryEndpoints(cloned.start, cloned.end, fromBasis, toBasis);

  return {
    ...nextBase,
    start: endpoints.start,
    end: endpoints.end,
  };
}
