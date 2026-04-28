import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createVolumeProvider } from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import { preprocessDatasetToStorage, type PreprocessLayerSource } from '../src/shared/utils/preprocessedDataset/preprocess.ts';
import type { ChannelExportMetadata } from '../src/shared/utils/preprocessedDataset/types.ts';
import type { VolumeDataType, VolumePayload } from '../src/types/volume.ts';

function createPayloadFromValues(options: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumeDataType;
  values: number[];
  min?: number;
  max?: number;
}): VolumePayload {
  const { width, height, depth, channels, dataType, values } = options;
  const expectedLength = width * height * depth * channels;
  assert.equal(values.length, expectedLength);

  let data: ArrayBuffer;
  switch (dataType) {
    case 'uint8':
      data = Uint8Array.from(values).buffer;
      break;
    case 'uint16':
      data = Uint16Array.from(values).buffer;
      break;
    case 'float32':
      data = Float32Array.from(values).buffer;
      break;
    default:
      throw new Error(`Unsupported test data type ${dataType}`);
  }

  const min = options.min ?? Math.min(...values);
  const max = options.max ?? Math.max(...values);

  return {
    width,
    height,
    depth,
    channels,
    dataType,
    min,
    max,
    data,
  };
}

function createLoaderByFileName(payloads: Map<string, VolumePayload>) {
  return async (files: File[]): Promise<VolumePayload[]> =>
    files.map((file) => {
      const payload = payloads.get(file.name);
      if (!payload) {
        throw new Error(`Missing payload for ${file.name}`);
      }
      return payload;
    });
}

const CHANNELS: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];

test('renderIn16Bit keeps uint16 intensity in full-range identity storage', async () => {
  const file = new File(['u16'], 'u16-t0.tif', { type: 'image/tiff' });
  const layers: PreprocessLayerSource[] = [{
    channelId: 'channel-a',
    channelLabel: 'Channel A',
    key: 'layer-a',
    label: 'Volume',
    files: [file],
    isSegmentation: false,
    sourceDataType: 'uint16'
  }];
  const payloads = new Map<string, VolumePayload>([
    ['u16-t0.tif', createPayloadFromValues({
      width: 2,
      height: 2,
      depth: 1,
      channels: 1,
      dataType: 'uint16',
      values: [0, 1024, 32768, 65535],
      min: 0,
      max: 65535
    })]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'render16-u16' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels: CHANNELS,
    trackSets: [],
    voxelResolution: { x: 1, y: 1, z: 1, unit: 'μm' },
    temporalResolution: { interval: 1, unit: 's' },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(payloads),
    renderIn16Bit: true,
    storageStrategy: { sharding: { enabled: false } }
  });

  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  assert.equal(layer?.storedDataType, 'uint16');
  assert.equal(layer?.normalization?.min, 0);
  assert.equal(layer?.normalization?.max, 65535);
  assert.equal(layer?.zarr.scales[0]?.zarr.data.dataType, 'uint16');

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 4,
    maxCachedChunkBytes: 1024 * 1024,
    maxConcurrentChunkReads: 2,
    maxConcurrentPrefetchLoads: 2
  });
  const volume = await provider.getVolume('layer-a', 0);
  assert.equal(volume.kind, 'intensity');
  assert.equal(volume.normalizedDataType, 'uint16');
  assert.deepEqual(Array.from(volume.normalized), [0, 1024, 32768, 65535]);
});

test('renderIn16Bit normalizes float32 intensity to uint16', async () => {
  const file = new File(['f32'], 'f32-t0.tif', { type: 'image/tiff' });
  const layers: PreprocessLayerSource[] = [{
    channelId: 'channel-a',
    channelLabel: 'Channel A',
    key: 'layer-a',
    label: 'Volume',
    files: [file],
    isSegmentation: false,
    sourceDataType: 'float32'
  }];
  const payloads = new Map<string, VolumePayload>([
    ['f32-t0.tif', createPayloadFromValues({
      width: 3,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'float32',
      values: [0, 0.5, 1],
      min: 0,
      max: 1
    })]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'render16-f32' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels: CHANNELS,
    trackSets: [],
    voxelResolution: { x: 1, y: 1, z: 1, unit: 'μm' },
    temporalResolution: { interval: 1, unit: 's' },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(payloads),
    renderIn16Bit: true,
    storageStrategy: { sharding: { enabled: false } }
  });

  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  assert.equal(layer?.storedDataType, 'uint16');
  assert.equal(layer?.normalization?.min, 0);
  assert.equal(layer?.normalization?.max, 1);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 4,
    maxCachedChunkBytes: 1024 * 1024,
    maxConcurrentChunkReads: 2,
    maxConcurrentPrefetchLoads: 2
  });
  const volume = await provider.getVolume('layer-a', 0);
  assert.equal(volume.kind, 'intensity');
  assert.equal(volume.normalizedDataType, 'uint16');
  assert.deepEqual(Array.from(volume.normalized), [0, 32768, 65535]);
});

test('renderIn16Bit keeps 8-bit intensity layers stored as uint8 in mixed-precision datasets', async () => {
  const channels: ChannelExportMetadata[] = [
    { id: 'channel-a', name: 'Channel A' },
    { id: 'channel-b', name: 'Channel B' }
  ];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Volume',
      files: [new File(['u8'], 'u8-t0.tif', { type: 'image/tiff' })],
      isSegmentation: false,
      sourceDataType: 'uint8'
    },
    {
      channelId: 'channel-b',
      channelLabel: 'Channel B',
      key: 'layer-b',
      label: 'Volume',
      files: [new File(['u16'], 'u16-t0.tif', { type: 'image/tiff' })],
      isSegmentation: false,
      sourceDataType: 'uint16'
    }
  ];
  const payloads = new Map<string, VolumePayload>([
    ['u8-t0.tif', createPayloadFromValues({
      width: 1,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'uint8',
      values: [123],
      min: 0,
      max: 255
    })],
    ['u16-t0.tif', createPayloadFromValues({
      width: 1,
      height: 1,
      depth: 1,
      channels: 1,
      dataType: 'uint16',
      values: [4567],
      min: 0,
      max: 65535
    })]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'render16-mixed' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets: [],
    voxelResolution: { x: 1, y: 1, z: 1, unit: 'μm' },
    temporalResolution: { interval: 1, unit: 's' },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(payloads),
    renderIn16Bit: true,
    storageStrategy: { sharding: { enabled: false } }
  });

  const layerA = result.manifest.dataset.channels[0]?.layers[0];
  const layerB = result.manifest.dataset.channels[1]?.layers[0];
  assert.equal(layerA?.storedDataType, 'uint8');
  assert.equal(layerA?.zarr.scales[0]?.zarr.data.dataType, 'uint8');
  assert.equal(layerB?.storedDataType, 'uint16');
  assert.equal(layerB?.zarr.scales[0]?.zarr.data.dataType, 'uint16');
});
