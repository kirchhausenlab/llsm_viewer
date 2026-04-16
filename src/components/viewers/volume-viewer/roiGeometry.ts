import type { RoiDimensionMode, RoiShape } from '../../../types/roi';

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

const buildBox3dSegments = (segments: number[], start: Point3, end: Point3) => {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);

  const corners = {
    lbf: { x: minX, y: minY, z: minZ },
    rbf: { x: maxX, y: minY, z: minZ },
    rtf: { x: maxX, y: maxY, z: minZ },
    ltf: { x: minX, y: maxY, z: minZ },
    lbb: { x: minX, y: minY, z: maxZ },
    rbb: { x: maxX, y: minY, z: maxZ },
    rtb: { x: maxX, y: maxY, z: maxZ },
    ltb: { x: minX, y: maxY, z: maxZ },
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

const buildEllipsoid3dSegments = (segments: number[], start: Point3, end: Point3) => {
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2,
    z: (start.z + end.z) / 2,
  };
  const radiusX = Math.abs(end.x - start.x) / 2;
  const radiusY = Math.abs(end.y - start.y) / 2;
  const radiusZ = Math.abs(end.z - start.z) / 2;

  const xyPoints: Point3[] = [];
  const xzPoints: Point3[] = [];
  const yzPoints: Point3[] = [];

  for (let index = 0; index < ELLIPSE_SEGMENT_COUNT_3D; index += 1) {
    const angle = (index / ELLIPSE_SEGMENT_COUNT_3D) * Math.PI * 2;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    xyPoints.push({
      x: center.x + cosAngle * radiusX,
      y: center.y + sinAngle * radiusY,
      z: center.z,
    });
    xzPoints.push({
      x: center.x + cosAngle * radiusX,
      y: center.y,
      z: center.z + sinAngle * radiusZ,
    });
    yzPoints.push({
      x: center.x,
      y: center.y + cosAngle * radiusY,
      z: center.z + sinAngle * radiusZ,
    });
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
      buildBox3dSegments(segments, start, end);
    }
    return Float32Array.from(segments);
  }

  if (mode === '2d') {
    buildEllipse2dSegments(segments, start, end);
  } else {
    buildEllipsoid3dSegments(segments, start, end);
  }

  return Float32Array.from(segments);
}
