import assert from 'node:assert/strict';

import { computeAdaptiveLodCpu } from '../src/shaders/volumeRenderShader.ts';

const EPSILON = 1e-6;

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: false,
    nearestSampling: false,
    step: [0.05, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'mip',
    currentMax: 0,
  });
  assert.equal(lod, 0);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: true,
    step: [0.05, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'iso',
  });
  assert.equal(lod, 0);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.0025, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'iso',
  });
  assert.equal(lod, 0);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.02, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'iso',
  });
  assert.ok(Math.abs(lod - 0.95) <= EPSILON);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.04, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'mip',
    currentMax: 0.75,
  });
  assert.ok(Math.abs(lod - 0.5) <= EPSILON);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.08, 0, 0],
    size: [100, 100, 100],
    lodScale: 2,
    lodMax: 1.5,
    mode: 'iso',
  });
  assert.ok(Math.abs(lod - 1.425) <= EPSILON);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.001, 0.001, 0.001],
    size: [100, 100, 100],
    projectedFootprint: 4,
    lodScale: 1,
    lodMax: 6,
    mode: 'iso',
  });
  assert.ok(Math.abs(lod - 1.9) <= EPSILON);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [0.04, 0, 0],
    size: [100, 100, 100],
    lodScale: 1,
    lodMax: 4,
    mode: 'bl',
    currentMax: 0.5,
  });
  assert.ok(Math.abs(lod - 1.15) <= EPSILON);
})();

(() => {
  const lod = computeAdaptiveLodCpu({
    adaptiveLodEnabled: true,
    nearestSampling: false,
    step: [Number.NaN, 0, 0],
    size: [100, 100, 100],
    lodScale: Number.NaN,
    lodMax: Number.NaN,
    mode: 'mip',
    currentMax: Number.NaN,
  });
  assert.equal(lod, 0);
})();
