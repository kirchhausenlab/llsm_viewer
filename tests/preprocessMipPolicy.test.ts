import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeMultiscaleGeometryLevels } from '../src/shared/utils/preprocessedDataset/mipPolicy.ts';

test('computeMultiscaleGeometryLevels generates full pyramid without fixed cap', () => {
  const levels = computeMultiscaleGeometryLevels({
    width: 64,
    height: 64,
    depth: 1
  });

  assert.ok(levels.length > 4, `expected more than 4 levels, got ${levels.length}`);
  const last = levels[levels.length - 1];
  assert.ok(last);
  assert.equal(last?.width, 1);
  assert.equal(last?.height, 1);
  assert.equal(last?.depth, 1);
});

test('computeMultiscaleGeometryLevels downsample factors are monotonic and explicit', () => {
  const levels = computeMultiscaleGeometryLevels({
    width: 10,
    height: 6,
    depth: 3
  });

  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1]!;
    const current = levels[index]!;
    assert.ok(current.width <= previous.width);
    assert.ok(current.height <= previous.height);
    assert.ok(current.depth <= previous.depth);
    assert.ok(current.downsampleFactor[0] >= previous.downsampleFactor[0]);
    assert.ok(current.downsampleFactor[1] >= previous.downsampleFactor[1]);
    assert.ok(current.downsampleFactor[2] >= previous.downsampleFactor[2]);
  }
});
