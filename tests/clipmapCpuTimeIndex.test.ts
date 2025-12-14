import assert from 'node:assert/strict';
import * as THREE from 'three';

import { VolumeClipmapManager } from '../src/components/viewers/volume-viewer/rendering/clipmap.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

(async () => {
  const size = 4;
  const channels = 1;
  const baseData = new Uint8Array(size * size * size * channels).fill(3);
  const nextData = new Uint8Array(size * size * size * channels).fill(9);

  const timeZeroVolume: NormalizedVolume = {
    width: size,
    height: size,
    depth: size,
    channels,
    dataType: 'uint8',
    normalized: baseData,
    min: 0,
    max: 255,
  };

  const timeOneVolume: NormalizedVolume = {
    ...timeZeroVolume,
    normalized: nextData,
  };

  const clipmap = new VolumeClipmapManager(
    { ...timeZeroVolume, timeSlices: [timeZeroVolume, timeOneVolume] },
    4,
  );

  const target = new THREE.Vector3(size / 2, size / 2, size / 2);
  await clipmap.update(target);
  clipmap.uploadPending();
  const level = clipmap.levels[0];
  assert.equal(level.buffer[0], baseData[0]);
  assert.equal((level.texture.image.data as Uint8Array)[0], baseData[0]);

  clipmap.setTimeIndex(1);
  await clipmap.update(target);
  clipmap.uploadPending();
  assert.equal(level.buffer[0], nextData[0]);
  assert.equal((level.texture.image.data as Uint8Array)[0], nextData[0]);

  clipmap.dispose();
  console.log('clipmap CPU time index tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
