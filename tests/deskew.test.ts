import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDeskewBackgroundMask,
  computeDeskewGlassTiltRadians,
  degreesToRadians,
  resolveDeskewGeometry
} from '../src/shared/utils/deskew.ts';

test('buildDeskewBackgroundMask masks X-skew edge regions through Y', () => {
  const mask = buildDeskewBackgroundMask({
    width: 4,
    height: 2,
    depth: 2,
    angleRadians: degreesToRadians(45),
    direction: 'X'
  });

  assert.deepEqual(Array.from(mask.data), [
    0, 0, 255, 255,
    0, 0, 255, 255,
    255, 0, 0, 255,
    255, 0, 0, 255
  ]);
});

test('buildDeskewBackgroundMask mirrors negative X skew', () => {
  const mask = buildDeskewBackgroundMask({
    width: 4,
    height: 1,
    depth: 2,
    angleRadians: degreesToRadians(-45),
    direction: 'X'
  });

  assert.deepEqual(Array.from(mask.data), [
    255, 0, 0, 255,
    0, 0, 255, 255
  ]);
});

test('buildDeskewBackgroundMask masks Y-skew regions through X', () => {
  const mask = buildDeskewBackgroundMask({
    width: 2,
    height: 4,
    depth: 2,
    angleRadians: degreesToRadians(45),
    direction: 'Y'
  });

  assert.deepEqual(Array.from(mask.data), [
    0, 0,
    0, 0,
    255, 255,
    255, 255,
    255, 255,
    0, 0,
    0, 0,
    255, 255
  ]);
});

test('resolveDeskewGeometry rejects angles below the dataset-specific minimum', () => {
  assert.throws(
    () =>
      resolveDeskewGeometry({
        width: 4,
        height: 4,
        depth: 4,
        angleRadians: degreesToRadians(45),
        direction: 'X'
      }),
    /leaves no valid data interior/
  );
});

test('computeDeskewGlassTiltRadians uses the configured skew angle', () => {
  assert.equal(computeDeskewGlassTiltRadians(degreesToRadians(90)), degreesToRadians(90));
  assert.equal(computeDeskewGlassTiltRadians(degreesToRadians(-90)), degreesToRadians(-90));
  assert.ok(Math.abs(computeDeskewGlassTiltRadians(degreesToRadians(60)) - degreesToRadians(60)) < 1e-9);
  assert.ok(Math.abs(computeDeskewGlassTiltRadians(degreesToRadians(-60)) - degreesToRadians(-60)) < 1e-9);
});
