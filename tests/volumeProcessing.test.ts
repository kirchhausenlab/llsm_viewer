import assert from 'node:assert/strict';

import { normalizeVolume } from '../src/volumeProcessing.ts';
import type { VolumePayload } from '../src/types/volume.ts';

console.log('Starting volumeProcessing normalization tests');

function normalize(
  data: ArrayBuffer,
  dataType: VolumePayload['dataType'],
  parameters: { min: number; max: number }
) {
  const volume: VolumePayload = {
    width: 5,
    height: 1,
    depth: 1,
    channels: 1,
    dataType,
    data,
    min: 0,
    max: 255
  };

  return normalizeVolume(volume, parameters);
}

try {
  const raw = new Uint8Array([0, 64, 128, 192, 255]);
  const identity = normalize(raw.buffer, 'uint8', { min: 0, max: 255 });
  assert.strictEqual(identity.min, 0);
  assert.strictEqual(identity.max, 255);
  assert.strictEqual(identity.normalized.length, raw.length);
  assert.strictEqual(identity.normalized.buffer, raw.buffer);
  assert.deepEqual(Array.from(identity.normalized), Array.from(raw));

  const windowed = normalize(raw.buffer, 'uint8', { min: 64, max: 192 });
  assert.notStrictEqual(windowed.normalized.buffer, raw.buffer);
  assert.deepEqual(Array.from(windowed.normalized), [0, 0, 128, 255, 255]);

  const floats = new Float32Array([-1, 0, 0.5, 1.5]);
  const floatVolume: VolumePayload = {
    width: 4,
    height: 1,
    depth: 1,
    channels: 1,
    dataType: 'float32',
    data: floats.buffer,
    min: -1,
    max: 1.5
  };

  const normalizedFloat = normalizeVolume(floatVolume, { min: 0, max: 1 });
  assert.notStrictEqual(normalizedFloat.normalized.buffer, floats.buffer);
  assert.deepEqual(Array.from(normalizedFloat.normalized), [0, 0, 128, 255]);

  console.log('volumeProcessing normalization tests passed');
} catch (error) {
  console.error('volumeProcessing normalization tests failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
