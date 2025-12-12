import assert from 'node:assert/strict';
import * as THREE from 'three';

import { VolumeClipmapManager } from '../src/components/viewers/volume-viewer/rendering/clipmap.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting clipmap renderer tests');

try {
  const size = 8;
  const channels = 1;
  const normalized = new Uint8Array(size * size * size * channels);
  normalized.forEach((_, index) => {
    normalized[index] = index % 255;
  });

  const volume: NormalizedVolume = {
    width: size,
    height: size,
    depth: size,
    channels,
    dataType: 'uint8',
    chunkShape: [4, 4, 4],
    normalized,
    min: 0,
    max: 255
  };

  const clipmap = new VolumeClipmapManager(volume, 4);
  assert.equal(clipmap.getActiveLevelCount(), 2);
  assert.equal(clipmap.getScale(0), 1);
  assert.equal(clipmap.getScale(1), 2);

  const target = new THREE.Vector3(4, 4, 4);
  clipmap.update(target);
  clipmap.uploadPending();

  const firstLevel = clipmap.levels[0];
  assert.deepEqual(firstLevel.origin.toArray(), [0, 0, 0]);
  assert.equal(firstLevel.buffer[0], normalized[0]);
  assert.equal(firstLevel.buffer[5], normalized[5 * channels]);
  assert.equal(firstLevel.needsUpload, false);

  clipmap.setInteractionLod(true);

  const uniforms = {
    u_clipmapTextures: { value: new Array(6).fill(null) as (THREE.Data3DTexture | null)[] },
    u_clipmapOrigins: { value: new Array(6).fill(null).map(() => new THREE.Vector3()) },
    u_clipmapScales: { value: new Array(6).fill(0) },
    u_clipmapLevelCount: { value: 0 },
    u_clipmapSize: { value: 0 },
    u_minClipLevel: { value: 0 },
    u_useClipmap: { value: 0 },
  } as const;

  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: '', fragmentShader: '' });
  clipmap.applyToMaterial(material);

  assert.equal(uniforms.u_clipmapLevelCount.value, 2);
  assert.equal(uniforms.u_clipmapSize.value, 4);
  assert.equal(uniforms.u_minClipLevel.value, 1);
  assert.equal(uniforms.u_useClipmap.value, 1);
  assert.equal(uniforms.u_clipmapOrigins.value[0]?.x, 0);

  clipmap.dispose();
  console.log('clipmap renderer tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
