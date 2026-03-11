import assert from 'node:assert/strict';

import {
  computeSkipHierarchyNodeBoundsCpu,
  computeHierarchyNodeExitCpu,
  sampleSegmentationNearestLabelCpu,
  sampleSegmentationOccupancyCpu,
  shouldSkipWithBrickStatsCpu,
  VolumeRenderShaderVariants,
} from '../src/shaders/volumeRenderShader.ts';

function referenceShouldSkipWithBrickStats(args: {
  skipEnabled: boolean;
  occupancy: number;
  brickMinRaw: number;
  brickMaxRaw: number;
  currentMax: number;
  isoLowThreshold: number;
  invert: boolean;
  windowMin: number;
  windowMax: number;
}): boolean {
  if (!args.skipEnabled) {
    return false;
  }
  if (args.occupancy <= 0) {
    return true;
  }
  if (args.brickMaxRaw < args.brickMinRaw) {
    return false;
  }

  const range = Math.max(args.windowMax - args.windowMin, 1e-5);
  const rawCandidate = args.invert ? args.brickMinRaw : args.brickMaxRaw;
  const normalizedCandidate = Math.min(1, Math.max(0, (rawCandidate - args.windowMin) / range));
  const candidate = args.invert ? 1 - normalizedCandidate : normalizedCandidate;
  if (candidate <= args.currentMax + 1e-5) {
    return true;
  }
  if (args.isoLowThreshold > -0.5 && candidate <= args.isoLowThreshold + 1e-5) {
    return true;
  }
  return false;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: false,
    occupancy: 0,
    brickMinRaw: 255,
    brickMaxRaw: 0,
    currentMax: 1,
    isoLowThreshold: 1,
    invert: false,
    windowMin: 0,
    windowMax: 1,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 0,
    brickMaxRaw: 255,
    currentMax: 0,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, false);
})();

(() => {
  const exitSteps = computeHierarchyNodeExitCpu({
    rayVoxelCoords: [7.9, 1.25, 1.25],
    voxelStep: [1, 0.5, 0],
    nodeMin: [0, 0, 0],
    nodeMax: [8, 4, 4],
  });
  assert.ok(Math.abs(exitSteps - 0.1) <= 1e-6);
})();

(() => {
  const nearestShader = VolumeRenderShaderVariants['mip-nearest'].fragmentShader;
  assert.match(
    nearestShader,
    /const int MAX_SEGMENTATION_STEPS = 4096;/,
  );
  assert.match(
    nearestShader,
    /int stepAdvance = hierarchy_skip_step_advance_voxel\(/,
  );
  assert.match(
    nearestShader,
    /bool segmentation_texcoords_in_bounds\(vec3 texcoords\)/,
  );
  assert.match(
    nearestShader,
    /float sample_segmentation_occupancy\(vec3 texcoords\)/,
  );
  assert.match(
    nearestShader,
    /if \(!segmentation_texcoords_in_bounds\(texcoords\)\) \{\s*return 0\.0;\s*\}/s,
  );
  assert.match(
    nearestShader,
    /vec3 segmentation_refine_surface_hit\(vec3 outsideLoc, vec3 insideLoc\)/,
  );
  assert.match(
    nearestShader,
    /float resolve_segmentation_surface_label\(vec3 hitLoc, vec3 step\)/,
  );
  assert.match(
    nearestShader,
    /vec3 brickCoords = brick_coords_for_voxel\(/,
  );
  assert.match(
    nearestShader,
    /uniform float u_backgroundMaskEnabled;/,
  );
  assert.match(
    nearestShader,
    /bool is_background_masked\(vec3 texcoords\)/,
  );
  assert.match(
    nearestShader,
    /uniform float u_backgroundMaskVisibleBoundsEnabled;/,
  );
  assert.match(
    nearestShader,
    /uniform vec3 u_backgroundMaskVisibleBoxMin;/,
  );
  assert.match(
    nearestShader,
    /uniform vec3 u_backgroundMaskVisibleBoxMax;/,
  );
  assert.match(
    nearestShader,
    /void cast_segmentation\(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray\) \{[\s\S]*float occupancy = sample_segmentation_occupancy\(loc\);[\s\S]*hitLabel = resolve_segmentation_surface_label\(hitLoc, step\);/s,
  );
  assert.match(
    nearestShader,
    /if \(gradientMagnitude <= EPSILON\) \{\s*return vec3\(0\.0\);\s*\}/s,
  );
})();

(() => {
  const linearShader = VolumeRenderShaderVariants.mip.fragmentShader;
  assert.match(
    linearShader,
    /if \(hasVisibleSample\) \{\s*vec3 iloc = start_loc \+ step \* \(float\(max_i\) - 0\.5\);/s,
  );
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 0,
    brickMinRaw: 0,
    brickMaxRaw: 255,
    currentMax: 0,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, true);
})();

(() => {
  const labels = new Uint16Array([1, 2]);
  const occupancy = sampleSegmentationOccupancyCpu({
    labels,
    size: [2, 1, 1],
    texcoords: [0.5, 0.5, 0.5],
    samplingMode: 'linear',
  });
  assert.equal(occupancy, 1);
  assert.equal(
    sampleSegmentationNearestLabelCpu({
      labels,
      size: [2, 1, 1],
      texcoords: [0.49, 0.5, 0.5],
    }),
    1,
  );
  assert.equal(
    sampleSegmentationNearestLabelCpu({
      labels,
      size: [2, 1, 1],
      texcoords: [0.51, 0.5, 0.5],
    }),
    2,
  );
})();

(() => {
  const labels = new Uint16Array([0, 4]);
  const occupancy = sampleSegmentationOccupancyCpu({
    labels,
    size: [2, 1, 1],
    texcoords: [0.5, 0.5, 0.5],
    samplingMode: 'linear',
  });
  assert.ok(Math.abs(occupancy - 0.5) <= 1e-6);
})();

(() => {
  const args = {
    hierarchyLevel: 0,
    grid: [12, 10, 7] as [number, number, number],
    chunkSize: [64, 64, 16] as [number, number, number],
    volumeSize: [710, 608, 102] as [number, number, number],
  };
  const left = computeSkipHierarchyNodeBoundsCpu({
    ...args,
    voxelCoords: [63.9, 0, 0]
  });
  assert.deepEqual(left.nodeCoords, [0, 0, 0]);
  assert.deepEqual(left.nodeMin, [0, 0, 0]);
  assert.deepEqual(left.nodeMax, [64, 64, 16]);

  const right = computeSkipHierarchyNodeBoundsCpu({
    ...args,
    voxelCoords: [64.1, 0, 0]
  });
  assert.deepEqual(right.nodeCoords, [1, 0, 0]);
  assert.deepEqual(right.nodeMin, [64, 0, 0]);
  assert.deepEqual(right.nodeMax, [128, 64, 16]);

  const tail = computeSkipHierarchyNodeBoundsCpu({
    ...args,
    voxelCoords: [709.9, 0, 0]
  });
  assert.deepEqual(tail.nodeCoords, [11, 0, 0]);
  assert.deepEqual(tail.nodeMin, [704, 0, 0]);
  assert.deepEqual(tail.nodeMax, [710, 64, 16]);
})();

(() => {
  const args = {
    hierarchyLevel: 1,
    grid: [6, 5, 4] as [number, number, number],
    chunkSize: [64, 64, 16] as [number, number, number],
    volumeSize: [710, 608, 102] as [number, number, number],
  };
  const left = computeSkipHierarchyNodeBoundsCpu({
    ...args,
    voxelCoords: [127.9, 0, 0]
  });
  assert.deepEqual(left.nodeCoords, [0, 0, 0]);
  assert.deepEqual(left.nodeMin, [0, 0, 0]);
  assert.deepEqual(left.nodeMax, [128, 128, 32]);

  const right = computeSkipHierarchyNodeBoundsCpu({
    ...args,
    voxelCoords: [128.1, 0, 0]
  });
  assert.deepEqual(right.nodeCoords, [1, 0, 0]);
  assert.deepEqual(right.nodeMin, [128, 0, 0]);
  assert.deepEqual(right.nodeMax, [256, 128, 32]);
})();

(() => {
  const rand = createPrng(0x5eed1234);
  for (let index = 0; index < 2000; index += 1) {
    const windowMin = rand() * 300 - 20;
    const windowMax = windowMin + rand() * 300;
    const args = {
      skipEnabled: rand() > 0.2,
      occupancy: rand() > 0.1 ? rand() : 0,
      brickMinRaw: rand() * 300 - 20,
      brickMaxRaw: rand() * 320 - 20,
      currentMax: rand() * 1.2 - 0.1,
      isoLowThreshold: rand() > 0.4 ? rand() * 1.2 - 0.1 : -1,
      invert: rand() > 0.5,
      windowMin,
      windowMax,
    };
    const expected = referenceShouldSkipWithBrickStats(args);
    const actual = shouldSkipWithBrickStatsCpu(args);
    assert.equal(actual, expected, `skip-model mismatch at case ${index}`);
  }
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 0,
    brickMaxRaw: 50,
    currentMax: 0.499995,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 100,
  });
  assert.equal(result, true);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 0,
    brickMaxRaw: 50,
    currentMax: 0.4999,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 100,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 10,
    brickMaxRaw: 240,
    currentMax: 0.95,
    isoLowThreshold: -1,
    invert: true,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 10,
    brickMaxRaw: 240,
    currentMax: -1,
    isoLowThreshold: 0.97,
    invert: true,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, true);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 0,
    brickMaxRaw: 500,
    currentMax: 0.999,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 200,
    brickMaxRaw: 100,
    currentMax: 0.5,
    isoLowThreshold: 0.5,
    invert: false,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 10,
    brickMaxRaw: 120,
    currentMax: 0.6,
    isoLowThreshold: -1,
    invert: false,
    windowMin: 0,
    windowMax: 200,
  });
  assert.equal(result, true);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 40,
    brickMaxRaw: 250,
    currentMax: 0.7,
    isoLowThreshold: -1,
    invert: true,
    windowMin: 0,
    windowMax: 100,
  });
  assert.equal(result, true);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 0,
    brickMaxRaw: 255,
    currentMax: -1,
    isoLowThreshold: 0.95,
    invert: false,
    windowMin: 0,
    windowMax: 255,
  });
  assert.equal(result, false);
})();

(() => {
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    occupancy: 1,
    brickMinRaw: 255,
    brickMaxRaw: 255,
    currentMax: 0,
    isoLowThreshold: 0.8,
    invert: true,
    windowMin: 10,
    windowMax: 10,
  });
  assert.equal(result, true);
})();
