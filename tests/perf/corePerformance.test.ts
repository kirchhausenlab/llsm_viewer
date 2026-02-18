import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';

import { normalizeVolume } from '../../src/core/volumeProcessing.ts';
import { smoothTrackPoints } from '../../src/shared/utils/trackSmoothing.ts';
import type { VolumePayload } from '../../src/types/volume.ts';

const NORMALIZE_MS_BUDGET = 3000;
const TRACK_SMOOTH_MS_BUDGET = 1500;

test('performance: normalizeVolume stays within local budget', () => {
  const width = 128;
  const height = 128;
  const depth = 96;
  const voxelCount = width * height * depth;
  const source = new Uint16Array(voxelCount);
  for (let index = 0; index < voxelCount; index += 1) {
    source[index] = index % 4096;
  }

  const payload: VolumePayload = {
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint16',
    data: source.buffer,
    min: 0,
    max: 4095
  };

  const startedAt = performance.now();
  const normalized = normalizeVolume(payload, { min: 0, max: 4095 });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(normalized.normalized.length, voxelCount);
  assert.ok(
    elapsedMs <= NORMALIZE_MS_BUDGET,
    `normalizeVolume exceeded budget: ${elapsedMs.toFixed(2)}ms > ${NORMALIZE_MS_BUDGET}ms`
  );
});

test('performance: smoothTrackPoints stays within local budget', () => {
  const points = Array.from({ length: 50_000 }, (_, index) => ({
    time: index,
    x: Math.sin(index / 17),
    y: Math.cos(index / 19),
    z: Math.sin(index / 23),
    amplitude: Math.cos(index / 11)
  }));

  const startedAt = performance.now();
  const smoothed = smoothTrackPoints(points, 2.5);
  const elapsedMs = performance.now() - startedAt;

  assert.equal(smoothed.length, points.length);
  assert.ok(
    elapsedMs <= TRACK_SMOOTH_MS_BUDGET,
    `smoothTrackPoints exceeded budget: ${elapsedMs.toFixed(2)}ms > ${TRACK_SMOOTH_MS_BUDGET}ms`
  );
});
