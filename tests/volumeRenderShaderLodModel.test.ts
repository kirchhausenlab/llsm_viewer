import assert from 'node:assert/strict';

import {
  computeAdaptiveLodCpu,
  resolveAtlasLinearLodBandCpu,
} from '../src/shaders/volumeRenderShader.ts';

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
  const band = resolveAtlasLinearLodBandCpu(0.75, 0.75);
  assert.equal(band.useCoarseSampling, false);
  assert.equal(band.lowLevel, 0);
  assert.equal(band.highLevel, 0);
  assert.equal(band.blend, 0);
})();

(() => {
  const band = resolveAtlasLinearLodBandCpu(1.25, 2);
  assert.equal(band.useCoarseSampling, true);
  assert.equal(band.lowLevel, 1);
  assert.equal(band.highLevel, 2);
  assert.ok(Math.abs(band.blend - 0.25) <= EPSILON);
})();

(() => {
  const band = resolveAtlasLinearLodBandCpu(2.8, 2.2);
  assert.equal(band.useCoarseSampling, true);
  assert.equal(band.lowLevel, 2);
  assert.equal(band.highLevel, 2);
  assert.equal(band.blend, 0);
})();

(() => {
  const band = resolveAtlasLinearLodBandCpu(Number.NaN, Number.NaN);
  assert.equal(band.useCoarseSampling, false);
  assert.equal(band.lowLevel, 0);
  assert.equal(band.highLevel, 0);
  assert.equal(band.blend, 0);
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
