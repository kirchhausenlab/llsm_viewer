import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BACKGROUND_MASK_MASKED,
  BACKGROUND_MASK_VISIBLE,
  buildBackgroundMaskFromTypedArray,
  computeBackgroundMaskVisibleRegion,
  coerceBackgroundMaskValuesForDataType,
  parseBackgroundMaskValues
} from '../src/shared/utils/backgroundMask.ts';

test('parseBackgroundMaskValues accepts semicolon-separated numeric values', () => {
  const parsed = parseBackgroundMaskValues('0; 1.5; -2');
  assert.equal(parsed.error, null);
  assert.deepEqual(parsed.values, [0, 1.5, -2]);
});

test('coerceBackgroundMaskValuesForDataType quantizes float32 inputs before exact comparison', () => {
  const requestedValue = 0.1;
  const coerced = coerceBackgroundMaskValuesForDataType([requestedValue], 'float32');
  const quantized = new Float32Array([requestedValue])[0] ?? 0;
  assert.deepEqual(coerced, [quantized]);

  const source = new Float32Array([quantized, 0.2]);
  const mask = buildBackgroundMaskFromTypedArray({
    width: 2,
    height: 1,
    depth: 1,
    channels: 1,
    source,
    values: coerced
  });
  assert.deepEqual(Array.from(mask.data), [BACKGROUND_MASK_MASKED, BACKGROUND_MASK_VISIBLE]);
});

test('coerceBackgroundMaskValuesForDataType rejects non-integral values for integer datasets', () => {
  assert.throws(
    () => coerceBackgroundMaskValuesForDataType([1.25], 'uint16'),
    /must be an integer/
  );
});

test('computeBackgroundMaskVisibleRegion trims fully masked border slabs', () => {
  const region = computeBackgroundMaskVisibleRegion({
    width: 4,
    height: 3,
    depth: 2,
    data: new Uint8Array([
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255,
      255, 0, 0, 255
    ])
  });
  assert.equal(region.hasVisibleVoxels, true);
  assert.deepEqual(region.minVoxel, [1, 0, 0]);
  assert.deepEqual(region.maxVoxel, [2, 2, 1]);
  assert.deepEqual(region.minFaceFractions, [0.25, 0, 0]);
  assert.deepEqual(region.maxFaceFractions, [0.75, 1, 1]);
});
