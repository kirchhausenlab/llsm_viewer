import assert from 'node:assert/strict';

import { buildRoiSegmentPositions } from '../src/components/viewers/volume-viewer/roiGeometry.ts';
import { reorientRoiDefinitionForAlignment } from '../src/shared/utils/roiGeometry.ts';

console.log('Starting roiGeometry tests');

(() => {
  const line = buildRoiSegmentPositions({
    shape: 'line',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 6 },
  });
  assert.equal(line.length, 6);

  const rectangle2d = buildRoiSegmentPositions({
    shape: 'rectangle',
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 3 },
  });
  assert.equal(rectangle2d.length, 24, '2D rectangle should emit four line segments');

  const rectangle3d = buildRoiSegmentPositions({
    shape: 'rectangle',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 6 },
  });
  assert.equal(rectangle3d.length, 72, '3D rectangle should emit twelve box edges');

  const glassRectangle3d = buildRoiSegmentPositions({
    shape: 'rectangle',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 6 },
    alignment: 'glass',
    deskew: { angleRadians: Math.PI / 3, direction: 'X' },
  });
  assert.equal(glassRectangle3d.length, 72, 'glass 3D rectangle should preserve box edge count');
  assert.notEqual(
    glassRectangle3d[2],
    glassRectangle3d[5],
    'glass 3D rectangle should tilt edges away from regular voxel axes',
  );

  const noSkewGlassRectangle3d = buildRoiSegmentPositions({
    shape: 'rectangle',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 4, y: 5, z: 6 },
    alignment: 'glass',
    deskew: { angleRadians: Math.PI / 2, direction: 'X' },
  });
  assert.deepEqual(
    Array.from(noSkewGlassRectangle3d),
    Array.from(rectangle3d),
    'glass 3D rectangle should use the complementary angle, so 90 degrees has no ROI tilt',
  );

  const axesRoi = {
    shape: 'rectangle',
    mode: '3d',
    start: { x: 0, y: 0, z: 2 },
    end: { x: 4, y: 0, z: 2 },
    color: '#FFFFFF',
  } as const;
  const glassRoi = reorientRoiDefinitionForAlignment(
    axesRoi,
    'glass',
    { angleRadians: Math.PI / 4, direction: 'X' },
  );
  assert.notDeepEqual(glassRoi.start, axesRoi.start);
  assert.notDeepEqual(glassRoi.end, axesRoi.end);
  assert.equal(glassRoi.alignment, 'glass');
  assert.ok(Math.abs(glassRoi.start.x - (2 - Math.SQRT2)) < 1e-9);
  assert.ok(Math.abs(glassRoi.start.z - (2 + Math.SQRT2)) < 1e-9);
  assert.ok(Math.abs(glassRoi.end.x - (2 + Math.SQRT2)) < 1e-9);
  assert.ok(Math.abs(glassRoi.end.z - (2 - Math.SQRT2)) < 1e-9);
  const roundTrippedAxesRoi = reorientRoiDefinitionForAlignment(
    glassRoi,
    'axes',
    { angleRadians: Math.PI / 4, direction: 'X' },
  );
  assert.equal(roundTrippedAxesRoi.alignment, undefined);
  assert.ok(Math.abs(roundTrippedAxesRoi.start.x - axesRoi.start.x) < 1e-9);
  assert.ok(Math.abs(roundTrippedAxesRoi.start.y - axesRoi.start.y) < 1e-9);
  assert.ok(Math.abs(roundTrippedAxesRoi.start.z - axesRoi.start.z) < 1e-9);
  assert.ok(Math.abs(roundTrippedAxesRoi.end.x - axesRoi.end.x) < 1e-9);
  assert.ok(Math.abs(roundTrippedAxesRoi.end.y - axesRoi.end.y) < 1e-9);
  assert.ok(Math.abs(roundTrippedAxesRoi.end.z - axesRoi.end.z) < 1e-9);

  const ellipse2d = buildRoiSegmentPositions({
    shape: 'ellipse',
    mode: '2d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 7, y: 6, z: 3 },
  });
  assert.equal(ellipse2d.length, 48 * 6, '2D ellipse should emit a closed loop');

  const ellipse3d = buildRoiSegmentPositions({
    shape: 'ellipse',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 7, y: 8, z: 9 },
  });
  assert.equal(ellipse3d.length, 3 * 40 * 6, '3D ellipsoid should emit three orthogonal loops');

  const center = { x: 4, y: 5, z: 6 };
  for (let index = 0; index < ellipse3d.length; index += 6) {
    const segment = ellipse3d.subarray(index, index + 6);
    const x1 = segment[0]!;
    const y1 = segment[1]!;
    const z1 = segment[2]!;
    const x2 = segment[3]!;
    const y2 = segment[4]!;
    const z2 = segment[5]!;
    const liesOnXY = z1 === center.z && z2 === center.z;
    const liesOnXZ = y1 === center.y && y2 === center.y;
    const liesOnYZ = x1 === center.x && x2 === center.x;
    assert.ok(liesOnXY || liesOnXZ || liesOnYZ, '3D ellipse segments must lie on XY, XZ, or YZ center planes');
  }

  const glassEllipse3d = buildRoiSegmentPositions({
    shape: 'ellipse',
    mode: '3d',
    start: { x: 1, y: 2, z: 3 },
    end: { x: 7, y: 8, z: 9 },
    alignment: 'glass',
    deskew: { angleRadians: Math.PI / 4, direction: 'Y' },
  });
  const hasTiltedSegment = Array.from({ length: glassEllipse3d.length / 6 }, (_, index) => index * 6).some((index) => {
    const segment = glassEllipse3d.subarray(index, index + 6);
    const x1 = segment[0]!;
    const y1 = segment[1]!;
    const z1 = segment[2]!;
    const x2 = segment[3]!;
    const y2 = segment[4]!;
    const z2 = segment[5]!;
    return x1 !== center.x && x2 !== center.x && y1 !== center.y && y2 !== center.y && z1 !== center.z && z2 !== center.z;
  });
  assert.equal(hasTiltedSegment, true, 'glass 3D ellipse should tilt loops away from regular center planes');
})();

console.log('roiGeometry tests passed');
