import assert from 'node:assert/strict';

import { shouldSkipWithBrickStatsCpu } from '../src/shaders/volumeRenderShader.ts';

function referenceShouldSkipWithBrickStats(args: {
  skipEnabled: boolean;
  atlasIndex: number;
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
  if (args.atlasIndex < -0.5) {
    return true;
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
    atlasIndex: -1,
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
    atlasIndex: -1,
    occupancy: 1,
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
  const result = shouldSkipWithBrickStatsCpu({
    skipEnabled: true,
    atlasIndex: 0,
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
  const rand = createPrng(0x5eed1234);
  for (let index = 0; index < 2000; index += 1) {
    const windowMin = rand() * 300 - 20;
    const windowMax = windowMin + rand() * 300;
    const args = {
      skipEnabled: rand() > 0.2,
      atlasIndex: Math.floor(rand() * 8) - 2,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
    atlasIndex: 0,
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
