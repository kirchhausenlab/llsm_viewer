import type { RoiAlignment, RoiDimensionMode, RoiShape } from '../../../types/roi';
import {
  addScaledRoiGeometryPoint,
  resolveRoiGeometryBounds,
  resolveRoiGeometryBasis,
  type RoiGeometryBasis,
  type RoiGeometryDeskew,
} from '../../../shared/utils/roiGeometry';

type Point3 = {
  x: number;
  y: number;
  z: number;
};

type BuildRoiSegmentsOptions = {
  shape: RoiShape;
  mode: RoiDimensionMode;
  start: Point3;
  end: Point3;
  alignment?: RoiAlignment;
  deskew?: RoiGeometryDeskew | null;
};

const ELLIPSE_SEGMENT_COUNT_2D = 48;
const ELLIPSE_SEGMENT_COUNT_3D = 40;

const pushSegment = (segments: number[], start: Point3, end: Point3) => {
  segments.push(start.x, start.y, start.z, end.x, end.y, end.z);
};

const buildLineSegments = (segments: number[], start: Point3, end: Point3) => {
  pushSegment(segments, start, end);
};

const buildRectangle2dSegments = (segments: number[], start: Point3, end: Point3) => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const z = start.z;
  const corners = [
    { x: minX, y: minY, z },
    { x: maxX, y: minY, z },
    { x: maxX, y: maxY, z },
    { x: minX, y: maxY, z },
  ];

  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index]!;
    const next = corners[(index + 1) % corners.length]!;
    pushSegment(segments, current, next);
  }
};

const buildBox3dSegments = (
  segments: number[],
  start: Point3,
  end: Point3,
  basis: RoiGeometryBasis,
) => {
  const { center, radius } = resolveRoiGeometryBounds(start, end, basis);
  const buildCorner = (signX: number, signY: number, signZ: number) => {
    const withX = addScaledRoiGeometryPoint(center, basis.x, signX * radius.x);
    const withY = addScaledRoiGeometryPoint(withX, basis.y, signY * radius.y);
    return addScaledRoiGeometryPoint(withY, basis.z, signZ * radius.z);
  };

  const corners = {
    lbf: buildCorner(-1, -1, -1),
    rbf: buildCorner(1, -1, -1),
    rtf: buildCorner(1, 1, -1),
    ltf: buildCorner(-1, 1, -1),
    lbb: buildCorner(-1, -1, 1),
    rbb: buildCorner(1, -1, 1),
    rtb: buildCorner(1, 1, 1),
    ltb: buildCorner(-1, 1, 1),
  };

  [
    [corners.lbf, corners.rbf],
    [corners.rbf, corners.rtf],
    [corners.rtf, corners.ltf],
    [corners.ltf, corners.lbf],
    [corners.lbb, corners.rbb],
    [corners.rbb, corners.rtb],
    [corners.rtb, corners.ltb],
    [corners.ltb, corners.lbb],
    [corners.lbf, corners.lbb],
    [corners.rbf, corners.rbb],
    [corners.rtf, corners.rtb],
    [corners.ltf, corners.ltb],
  ].forEach(([segmentStart, segmentEnd]) => {
    pushSegment(segments, segmentStart!, segmentEnd!);
  });
};

const buildLoopSegments = (segments: number[], points: Point3[]) => {
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    pushSegment(segments, current, next);
  }
};

const buildEllipse2dSegments = (segments: number[], start: Point3, end: Point3) => {
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: start.z,
  };
  const radiusX = Math.abs(end.x - start.x) / 2;
  const radiusY = Math.abs(end.y - start.y) / 2;
  const points: Point3[] = [];

  for (let index = 0; index < ELLIPSE_SEGMENT_COUNT_2D; index += 1) {
    const angle = (index / ELLIPSE_SEGMENT_COUNT_2D) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
      z: center.z,
    });
  }

  buildLoopSegments(segments, points);
};

const buildEllipsoid3dSegments = (
  segments: number[],
  start: Point3,
  end: Point3,
  basis: RoiGeometryBasis,
) => {
  const { center, radius } = resolveRoiGeometryBounds(start, end, basis);

  const xyPoints: Point3[] = [];
  const xzPoints: Point3[] = [];
  const yzPoints: Point3[] = [];

  for (let index = 0; index < ELLIPSE_SEGMENT_COUNT_3D; index += 1) {
    const angle = (index / ELLIPSE_SEGMENT_COUNT_3D) * Math.PI * 2;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    xyPoints.push(addScaledRoiGeometryPoint(
      addScaledRoiGeometryPoint(center, basis.x, cosAngle * radius.x),
      basis.y,
      sinAngle * radius.y,
    ));
    xzPoints.push(addScaledRoiGeometryPoint(
      addScaledRoiGeometryPoint(center, basis.x, cosAngle * radius.x),
      basis.z,
      sinAngle * radius.z,
    ));
    yzPoints.push(addScaledRoiGeometryPoint(
      addScaledRoiGeometryPoint(center, basis.y, cosAngle * radius.y),
      basis.z,
      sinAngle * radius.z,
    ));
  }

  buildLoopSegments(segments, xyPoints);
  buildLoopSegments(segments, xzPoints);
  buildLoopSegments(segments, yzPoints);
};

export function buildRoiSegmentPositions({
  shape,
  mode,
  start,
  end,
  alignment,
  deskew,
}: BuildRoiSegmentsOptions): Float32Array {
  const segments: number[] = [];

  if (shape === 'line') {
    buildLineSegments(segments, start, end);
    return Float32Array.from(segments);
  }

  if (shape === 'rectangle') {
    if (mode === '2d') {
      buildRectangle2dSegments(segments, start, end);
    } else {
      buildBox3dSegments(segments, start, end, resolveRoiGeometryBasis(alignment, deskew));
    }
    return Float32Array.from(segments);
  }

  if (mode === '2d') {
    buildEllipse2dSegments(segments, start, end);
  } else {
    buildEllipsoid3dSegments(segments, start, end, resolveRoiGeometryBasis(alignment, deskew));
  }

  return Float32Array.from(segments);
}
