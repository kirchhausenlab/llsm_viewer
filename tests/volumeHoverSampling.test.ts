import assert from 'node:assert/strict';

import {
  adjustWindowedIntensity,
  computeVolumeLuminance,
  sampleVolumeAtNormalizedPosition,
} from '../src/components/viewers/volume-viewer/volumeHoverSampling.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting volume hover sampling helper tests');

const createVolume = ({
  width,
  height,
  depth,
  channels,
  normalized,
}: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  normalized: Uint8Array;
}): NormalizedVolume => ({
  width,
  height,
  depth,
  channels,
  dataType: 'uint8',
  normalized,
  min: 0,
  max: 255,
});

(() => {
  const volume = createVolume({
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    normalized: new Uint8Array([
      0, 10,
      20, 30,
      40, 50,
      60, 70,
    ]),
  });

  const corner = sampleVolumeAtNormalizedPosition(volume, { x: 0, y: 0, z: 0 });
  assert.deepStrictEqual(corner.normalizedValues, [0]);
  assert.deepStrictEqual(corner.rawValues, [0]);

  const midpoint = sampleVolumeAtNormalizedPosition(volume, { x: 0.25, y: 0.25, z: 0.25 });
  assert.ok(Math.abs(midpoint.normalizedValues[0] - (35 / 255)) < 1e-9);
  assert.ok(Math.abs(midpoint.rawValues[0] - 35) < 1e-9);
})();

(() => {
  assert.strictEqual(computeVolumeLuminance([0.2], 1), 0.2);
  assert.strictEqual(computeVolumeLuminance([0.2, 0.6], 2), 0.4);

  const luminance3 = computeVolumeLuminance([1, 0, 0], 3);
  assert.ok(Math.abs(luminance3 - 0.2126) < 1e-9);

  assert.strictEqual(computeVolumeLuminance([0.1, 0.8, 0.3, 0.4], 4), 0.8);
})();

(() => {
  assert.strictEqual(adjustWindowedIntensity(0.5, 0, 1, false), 0.5);
  assert.strictEqual(adjustWindowedIntensity(0.5, 0, 1, true), 0.5);
  assert.strictEqual(adjustWindowedIntensity(-10, 0, 1, false), 0);
  assert.strictEqual(adjustWindowedIntensity(10, 0, 1, false), 1);
  assert.strictEqual(adjustWindowedIntensity(10, 0, 1, true), 0);
})();

console.log('volume hover sampling helper tests passed');
