import assert from 'node:assert/strict';

import { buildRoiSegmentPositions } from '../src/components/viewers/volume-viewer/roiGeometry.ts';

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
})();

console.log('roiGeometry tests passed');
