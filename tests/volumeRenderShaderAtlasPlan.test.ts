import assert from 'node:assert/strict';

import { analyzeLinearAtlasSamplingCpu } from '../src/shaders/volumeRenderShader.ts';

(() => {
  const analysis = analyzeLinearAtlasSamplingCpu({
    texcoords: [0.2, 0.2, 0.2],
    size: [128, 128, 128],
    chunkSize: [32, 32, 32],
  });
  assert.equal(analysis.sameBrickFastPath, true);
  assert.deepEqual(analysis.spans, [false, false, false]);
  assert.equal(analysis.atlasIndexLookupCount, 1);
  assert.equal(analysis.atlasDataSampleCount, 1);
})();

(() => {
  const boundaryTexcoord = (31.5 / 128) as number;
  const analysis = analyzeLinearAtlasSamplingCpu({
    texcoords: [boundaryTexcoord, 0.2, 0.2],
    size: [128, 128, 128],
    chunkSize: [32, 32, 32],
  });
  assert.equal(analysis.sameBrickFastPath, false);
  assert.deepEqual(analysis.spans, [true, false, false]);
  assert.equal(analysis.atlasIndexLookupCount, 2);
  assert.equal(analysis.atlasDataSampleCount, 8);
})();

(() => {
  const boundaryTexcoord = (31.5 / 128) as number;
  const analysis = analyzeLinearAtlasSamplingCpu({
    texcoords: [boundaryTexcoord, boundaryTexcoord, boundaryTexcoord],
    size: [128, 128, 128],
    chunkSize: [32, 32, 32],
  });
  assert.equal(analysis.sameBrickFastPath, false);
  assert.deepEqual(analysis.spans, [true, true, true]);
  assert.equal(analysis.atlasIndexLookupCount, 8);
  assert.equal(analysis.atlasDataSampleCount, 8);
})();

(() => {
  const analysis = analyzeLinearAtlasSamplingCpu({
    texcoords: [1, 1, 1],
    size: [128, 128, 128],
    chunkSize: [32, 32, 32],
  });
  assert.equal(analysis.sameBrickFastPath, true);
  assert.deepEqual(analysis.spans, [false, false, false]);
  assert.equal(analysis.atlasIndexLookupCount, 1);
  assert.equal(analysis.atlasDataSampleCount, 1);
})();

(() => {
  const size: [number, number, number] = [128, 128, 128];
  const chunkSize: [number, number, number] = [32, 32, 32];
  let sameBrickCount = 0;
  let sampleCount = 0;
  for (let z = 0; z < size[2]; z += 4) {
    const tz = (z + 0.5) / size[2];
    for (let y = 0; y < size[1]; y += 4) {
      const ty = (y + 0.5) / size[1];
      for (let x = 0; x < size[0]; x += 4) {
        const tx = (x + 0.5) / size[0];
        const analysis = analyzeLinearAtlasSamplingCpu({
          texcoords: [tx, ty, tz],
          size,
          chunkSize,
        });
        sampleCount += 1;
        if (analysis.sameBrickFastPath) {
          sameBrickCount += 1;
        }
      }
    }
  }

  const hitRate = sameBrickCount / sampleCount;
  assert.ok(hitRate >= 0.85, `expected same-brick hit rate >= 0.85, got ${hitRate.toFixed(3)}`);
})();
