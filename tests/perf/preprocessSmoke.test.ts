import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';

import { createInMemoryPreprocessedStorage } from '../../src/shared/storage/preprocessedStorage.ts';
import { preprocessDatasetToStorage } from '../../src/shared/utils/preprocessedDataset/preprocess.ts';
import type { ChannelExportMetadata } from '../../src/shared/utils/preprocessedDataset/types.ts';
import type { VolumePayload } from '../../src/types/volume.ts';

const PREPROCESSING_SMOKE_BUDGET_MS = 12_000;
const WIDTH = 96;
const HEIGHT = 80;
const DEPTH = 24;
const TIMEPOINTS = 12;

function createSyntheticVolumePayload(timepoint: number): VolumePayload {
  const voxelCount = WIDTH * HEIGHT * DEPTH;
  const data = new Uint8Array(voxelCount);
  for (let index = 0; index < voxelCount; index += 1) {
    data[index] = (index * 13 + timepoint * 29) & 0xff;
  }
  return {
    width: WIDTH,
    height: HEIGHT,
    depth: DEPTH,
    channels: 1,
    dataType: 'uint8',
    min: 0,
    max: 255,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
}

function createVolumeLoader(volumeByFileName: Map<string, VolumePayload>) {
  return async (files: File[]): Promise<VolumePayload[]> => {
    return files.map((file) => {
      const payload = volumeByFileName.get(file.name);
      if (!payload) {
        throw new Error(`Missing synthetic volume for "${file.name}".`);
      }
      const typed = new Uint8Array(payload.data as ArrayBufferLike);
      const cloned = typed.slice();
      return {
        ...payload,
        data: cloned.buffer
      };
    });
  };
}

test('preprocessing perf: end-to-end smoke check stays under budget', async () => {
  const files: File[] = [];
  const volumeByFileName = new Map<string, VolumePayload>();
  for (let timepoint = 0; timepoint < TIMEPOINTS; timepoint += 1) {
    const fileName = `tp-${String(timepoint).padStart(3, '0')}.tif`;
    files.push(new File([`volume-${timepoint}`], fileName, { type: 'image/tiff' }));
    volumeByFileName.set(fileName, createSyntheticVolumePayload(timepoint));
  }

  const channels: ChannelExportMetadata[] = [
    {
      id: 'channel-a',
      name: 'Channel A',
      trackSets: []
    }
  ];
  const layers = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files,
      isSegmentation: false
    }
  ];

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-perf-smoke' });
  const startedAt = performance.now();
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    voxelResolution: { x: 100, y: 100, z: 200, unit: 'nm', correctAnisotropy: true },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createVolumeLoader(volumeByFileName),
    storageStrategy: { sharding: { enabled: false } }
  });
  const elapsedMs = performance.now() - startedAt;

  assert.equal(result.totalVolumeCount, TIMEPOINTS);
  assert.equal(result.channelSummaries.length, 1);
  assert.equal(result.channelSummaries[0]?.layers[0]?.volumeCount, TIMEPOINTS);
  assert.ok(
    elapsedMs <= PREPROCESSING_SMOKE_BUDGET_MS,
    `Preprocessing smoke check exceeded ${PREPROCESSING_SMOKE_BUDGET_MS}ms: ${elapsedMs.toFixed(1)}ms`
  );
});
