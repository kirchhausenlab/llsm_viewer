import assert from 'node:assert/strict';
import * as THREE from 'three';

import { VolumeClipmapManager } from '../src/components/viewers/volume-viewer/rendering/clipmap.ts';
import type { StreamableNormalizedVolume } from '../src/components/viewers/VolumeViewer.types.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import type { MinimalZarrArray } from '../src/data/zarr.ts';
import { ZarrVolumeSource } from '../src/data/ZarrVolumeSource.ts';

console.log('Starting clipmap renderer tests');

(async () => {
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
  await clipmap.update(target);
  clipmap.uploadPending();

  const firstLevel = clipmap.levels[0];
  assert.deepEqual(firstLevel.origin.toArray(), [0, 0, 0]);
  assert.equal(firstLevel.buffer[0], normalized[0]);
  const expectedIndex = (((0 * size + 1) * size + 1) * channels) | 0;
  assert.equal(firstLevel.buffer[5], normalized[expectedIndex]);
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

  const streamingSize = 4;
  const streamingData = new Uint8Array(streamingSize * streamingSize * streamingSize).fill(7);
  const streamingChunks: [number, number, number, number, number] = [
    1,
    1,
    streamingSize,
    streamingSize,
    streamingSize,
  ];
  const streamingArray: MinimalZarrArray = {
    shape: [1, 1, streamingSize, streamingSize, streamingSize],
    chunks: streamingChunks,
    dtype: '<u1',
    async getChunk() {
      return { data: streamingData } as any;
    },
  };
  const streamingSource = new ZarrVolumeSource([
    {
      level: 0,
      array: streamingArray,
      dataType: 'uint8',
      shape: [1, 1, streamingSize, streamingSize, streamingSize],
      chunkShape: streamingChunks,
    },
  ]);
  const streamingVolume: StreamableNormalizedVolume = {
    width: streamingSize,
    height: streamingSize,
    depth: streamingSize,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(streamingSize * streamingSize * streamingSize),
    min: 0,
    max: 255,
    chunkShape: [streamingSize, streamingSize, streamingSize],
    streamingSource,
    streamingBaseShape: [1, 1, streamingSize, streamingSize, streamingSize],
  };
  const streamingClipmap = new VolumeClipmapManager(streamingVolume, 2);
  await streamingClipmap.update(new THREE.Vector3(streamingSize / 2, streamingSize / 2, streamingSize / 2));
  const coarseLevel = streamingClipmap.levels[streamingClipmap.levels.length - 1];
  assert.equal(coarseLevel.buffer[0], 7);
  assert.equal(coarseLevel.needsUpload, false);

  const timeAwareRequests: Array<number | undefined> = [];
  const timeAwareSource = {
    getMipLevels: () => [0],
    getMip: (_level: number) => ({
      level: 0,
      shape: [2, 1, streamingSize, streamingSize, streamingSize],
      chunkShape: [1, 1, streamingSize, streamingSize, streamingSize],
    }),
    async readRegion(request: any) {
      timeAwareRequests.push(request.time);
      const [cSize, zSize, ySize, xSize] = request.shape as number[];
      return new Uint8Array(cSize * zSize * ySize * xSize);
    },
  } as unknown as ZarrVolumeSource;

  const timeAwareVolume: StreamableNormalizedVolume = {
    width: streamingSize,
    height: streamingSize,
    depth: streamingSize,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(streamingSize * streamingSize * streamingSize),
    min: 0,
    max: 255,
    chunkShape: [streamingSize, streamingSize, streamingSize],
    streamingSource: timeAwareSource,
    streamingBaseShape: [2, 1, streamingSize, streamingSize, streamingSize],
  };

  const timeAwareClipmap = new VolumeClipmapManager(timeAwareVolume, streamingSize);
  const timeAwareTarget = new THREE.Vector3(streamingSize / 2, streamingSize / 2, streamingSize / 2);

  await timeAwareClipmap.update(timeAwareTarget);
  timeAwareClipmap.setTimeIndex(1);
  await timeAwareClipmap.update(timeAwareTarget);

  assert.deepEqual(timeAwareRequests, [0, 1]);
  timeAwareClipmap.dispose();

  const mipLevels = [
    { level: 0, shape: [1, 1, 8, 8, 8], chunkShape: [1, 1, 4, 4, 4] },
    { level: 1, shape: [1, 1, 4, 4, 4], chunkShape: [1, 1, 2, 2, 2] },
    { level: 2, shape: [1, 1, 2, 2, 2], chunkShape: [1, 1, 2, 2, 2] },
  ];
  const regionRequests: Array<{ mip: number; offset: number[]; shape: number[] }> = [];
  const multiMipSource = {
    getMipLevels: () => mipLevels.map((entry) => entry.level),
    getMip: (level: number) => {
      const entry = mipLevels.find((candidate) => candidate.level === level);
      if (!entry) {
        throw new Error(`Missing mip level ${level}`);
      }
      return entry as any;
    },
    async readRegion(request: any) {
      regionRequests.push({ mip: request.mipLevel, offset: [...request.offset], shape: [...request.shape] });
      const [cSize, zSize, ySize, xSize] = request.shape as number[];
      return new Uint8Array(cSize * zSize * ySize * xSize);
    },
  } as unknown as ZarrVolumeSource;

  const multiMipVolume: StreamableNormalizedVolume = {
    width: 8,
    height: 8,
    depth: 8,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8 * 8 * 8),
    min: 0,
    max: 255,
    chunkShape: [4, 4, 4],
    streamingSource: multiMipSource,
    streamingBaseShape: mipLevels[0].shape,
    streamingBaseChunkShape: mipLevels[0].chunkShape,
  };

  const multiMipClipmap = new VolumeClipmapManager(multiMipVolume, 2);
  await multiMipClipmap.update(new THREE.Vector3(4, 4, 4));

  const requestedMips = regionRequests.map((entry) => entry.mip).sort((a, b) => a - b);
  assert.deepEqual(requestedMips, [0, 1, 2]);

  const mip2Request = regionRequests.find((entry) => entry.mip === 2);
  assert.deepEqual(mip2Request?.shape, [1, 2, 2, 2]);
  assert.deepEqual(mip2Request?.offset, [0, 0, 0, 0]);

  multiMipClipmap.dispose();
  const uint16Size = 4;
  const uint16Value = 1234;
  const uint16Data = new Uint16Array(uint16Size * uint16Size * uint16Size).fill(uint16Value);
  const uint16Chunks: [number, number, number, number, number] = [1, 1, uint16Size, uint16Size, uint16Size];
  const uint16Array: MinimalZarrArray = {
    shape: [1, 1, uint16Size, uint16Size, uint16Size],
    chunks: uint16Chunks,
    dtype: '<u2',
    async getChunk() {
      return { data: uint16Data } as any;
    },
  };
  const uint16Source = new ZarrVolumeSource([
    {
      level: 0,
      array: uint16Array,
      dataType: 'uint16',
      shape: [1, 1, uint16Size, uint16Size, uint16Size],
      chunkShape: uint16Chunks,
    },
  ]);
  const uint16Volume: StreamableNormalizedVolume = {
    width: uint16Size,
    height: uint16Size,
    depth: uint16Size,
    channels: 1,
    dataType: 'uint16',
    normalized: new Uint8Array(uint16Size * uint16Size * uint16Size),
    min: 0,
    max: 65535,
    chunkShape: [uint16Size, uint16Size, uint16Size],
    streamingSource: uint16Source,
    streamingBaseShape: [1, 1, uint16Size, uint16Size, uint16Size],
  };
  const uint16Clipmap = new VolumeClipmapManager(uint16Volume, 2);
  await uint16Clipmap.update(new THREE.Vector3(uint16Size / 2, uint16Size / 2, uint16Size / 2));
  const uint16Level = uint16Clipmap.levels[0];
  assert(uint16Level.buffer instanceof Uint8Array);
  assert.equal(uint16Level.texture.type, THREE.UnsignedByteType);
  assert.equal(uint16Level.buffer[0], Math.round((uint16Value / 65535) * 255));

  const floatSize = 2;
  const floatData = new Float32Array(floatSize * floatSize * floatSize).fill(10);
  floatData[1] = 20;
  const floatChunks: [number, number, number, number, number] = [
    1,
    1,
    floatSize,
    floatSize,
    floatSize,
  ];
  const floatArray: MinimalZarrArray = {
    shape: [1, 1, floatSize, floatSize, floatSize],
    chunks: floatChunks,
    dtype: '<f4',
    async getChunk() {
      return { data: floatData } as any;
    },
  };
  const floatSource = new ZarrVolumeSource([
    { level: 0, array: floatArray, dataType: 'float32', shape: floatArray.shape, chunkShape: floatChunks },
  ]);
  const floatVolume: StreamableNormalizedVolume = {
    width: floatSize,
    height: floatSize,
    depth: floatSize,
    channels: 1,
    dataType: 'float32',
    normalized: new Uint8Array(floatSize * floatSize * floatSize),
    min: 10,
    max: 20,
    chunkShape: [floatSize, floatSize, floatSize],
    streamingSource: floatSource,
    streamingBaseShape: [1, 1, floatSize, floatSize, floatSize],
  };

  const floatClipmap = new VolumeClipmapManager(floatVolume, 2);
  await floatClipmap.update(new THREE.Vector3(floatSize / 2, floatSize / 2, floatSize / 2));
  const floatLevel = floatClipmap.levels[0];
  assert(floatLevel.buffer[0] < floatLevel.buffer[1]);
  assert.deepEqual([floatLevel.buffer[0], floatLevel.buffer[1]], [0, 255]);

  floatClipmap.dispose();
  uint16Clipmap.dispose();
  streamingClipmap.dispose();
  clipmap.dispose();
  console.log('clipmap renderer tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
