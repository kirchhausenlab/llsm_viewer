import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clampToRange,
  computeHistogramMappingPoints,
  computeHistogramShape,
  formatNormalizedIntensity
} from '../src/components/viewers/volume-viewer/vr/hudMath.ts';

test('formatNormalizedIntensity trims trailing zeros', () => {
  assert.equal(formatNormalizedIntensity(0.5), '0.5');
  assert.equal(formatNormalizedIntensity(0.1234), '0.123');
  assert.equal(formatNormalizedIntensity(1), '1');
});

test('clampToRange clamps values to provided range', () => {
  assert.equal(clampToRange(-1, 0, 10), 0);
  assert.equal(clampToRange(5, 0, 10), 5);
  assert.equal(clampToRange(11, 0, 10), 10);
});

test('computeHistogramShape ignores leading invalid histogram bins', () => {
  const histogram = new Uint32Array([100, 10, 20]);
  const shape = computeHistogramShape(histogram, 2, 10);

  assert.equal(shape.isEmpty, false);
  assert.equal(shape.points.length, 2);
  assert.deepEqual(shape.points[0], { x: 1, y: 5 });
  assert.deepEqual(shape.points[1], { x: 2, y: 0 });
});

test('computeHistogramShape returns empty shape for empty histogram', () => {
  const shape = computeHistogramShape(null, 10, 10);
  assert.equal(shape.isEmpty, true);
  assert.deepEqual(shape.points, []);
});

test('computeHistogramMappingPoints returns clamped transfer points', () => {
  const points = computeHistogramMappingPoints(0.25, 0.75, 0, 1, 100, 100);
  assert.deepEqual(points, [
    { x: 0, y: 100 },
    { x: 25, y: 100 },
    { x: 75, y: 0 },
    { x: 100, y: 0 }
  ]);
});
