import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import {
  preprocessDatasetToStorage,
  type PreprocessDatasetProgress,
  type PreprocessLayerSource
} from '../src/shared/utils/preprocessedDataset/preprocess.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import { createZarrChunkKeyFromCoords } from '../src/shared/utils/preprocessedDataset/chunkKey.ts';
import type { ChannelExportMetadata, TrackSetExportMetadata } from '../src/shared/utils/preprocessedDataset/types.ts';
import type { VolumePayload } from '../src/types/volume.ts';

type SyntheticVolume = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  values: number[];
};

function createSyntheticVolumePayload(volume: SyntheticVolume): VolumePayload {
  const expectedLength = volume.width * volume.height * volume.depth * volume.channels;
  assert.equal(volume.values.length, expectedLength, 'Synthetic volume values must match declared shape.');

  const data = Uint8Array.from(volume.values);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? 0;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }
  if (!Number.isFinite(min)) {
    min = 0;
  }
  if (!Number.isFinite(max) || max === min) {
    max = min + 1;
  }

  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    channels: volume.channels,
    dataType: 'uint8',
    min,
    max,
    data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  };
}

function createLoaderByFileName(volumeByFileName: Map<string, VolumePayload>) {
  return async (files: File[]): Promise<VolumePayload[]> => {
    return files.map((file) => {
      const payload = volumeByFileName.get(file.name);
      if (!payload) {
        throw new Error(`Missing synthetic volume payload for "${file.name}".`);
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

function createTrackEntries(): TrackSetExportMetadata['entries'] {
  return [['1', '0', '1', '1.000', '2.000', '3.000', '4.000', '0.000']];
}

function decodeUint32ArrayLE(bytes: Uint8Array): Uint32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = Math.floor(bytes.byteLength / 4);
  const decoded = new Uint32Array(length);
  for (let index = 0; index < length; index += 1) {
    decoded[index] = view.getUint32(index * 4, true);
  }
  return decoded;
}

test('preprocessDatasetToStorage writes loadable manifest and chunk data for mixed layers', async () => {
  const channels: ChannelExportMetadata[] = [
    {
      id: 'channel-a',
      name: 'Channel A'
    }
  ];
  const trackSets: TrackSetExportMetadata[] = [
    {
      id: 'tracks-a',
      name: 'Tracks A',
      fileName: 'tracks-a.csv',
      boundChannelId: 'channel-a',
      entries: createTrackEntries()
    }
  ];

  const intensityFiles = [
    new File(['intensity-0'], 'intensity-t0.tif', { type: 'image/tiff' }),
    new File(['intensity-1'], 'intensity-t1.tif', { type: 'image/tiff' })
  ];
  const segmentationFiles = [
    new File(['seg-0'], 'seg-t0.tif', { type: 'image/tiff' }),
    new File(['seg-1'], 'seg-t1.tif', { type: 'image/tiff' })
  ];

  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'intensity',
      label: 'Intensity',
      files: intensityFiles,
      isSegmentation: false
    },
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'segmentation',
      label: 'Segmentation',
      files: segmentationFiles,
      isSegmentation: true
    }
  ];

  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'intensity-t0.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [0, 64, 128, 255]
      })
    ],
    [
      'intensity-t1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [10, 20, 30, 40]
      })
    ],
    [
      'seg-t0.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [0, 1, 1, 2]
      })
    ],
    [
      'seg-t1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [2, 2, 1, 0]
      })
    ]
  ]);

  const progressEvents: PreprocessDatasetProgress[] = [];
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-pipeline' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets,
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: true },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(volumeByFileName),
    storageStrategy: { sharding: { enabled: false } },
    onProgress: (event) => {
      progressEvents.push(event);
    }
  });

  assert.equal(result.totalVolumeCount, 2);
  assert.equal(result.manifest.dataset.channels.length, 1);
  assert.equal(result.channelSummaries.length, 1);
  assert.equal(result.trackSummaries[0]?.entries.length, 1);

  const finalizeIndex = progressEvents.findIndex((event) => event.stage === 'finalize-manifest');
  const firstWriteIndex = progressEvents.findIndex((event) => event.stage === 'write-volumes');
  assert.ok(finalizeIndex >= 0, 'Expected finalize-manifest progress event.');
  assert.ok(firstWriteIndex > finalizeIndex, 'Expected write-volumes progress after manifest finalization.');
  assert.equal(
    progressEvents.filter((event) => event.stage === 'rep-stats').length,
    1,
    'Expected representative-stat pass for non-segmentation layer only.'
  );
  const writeProgress = progressEvents.filter((event) => event.stage === 'write-volumes');
  assert.ok(writeProgress.length > 0, 'Expected write-volumes progress events.');
  const lastWriteProgress = writeProgress[writeProgress.length - 1];
  assert.ok(lastWriteProgress && lastWriteProgress.stage === 'write-volumes');
  assert.equal(lastWriteProgress?.processedVolumes, 4);
  assert.equal(lastWriteProgress?.totalVolumes, 4);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  assert.equal(opened.totalVolumeCount, 2);
  assert.equal(opened.channelSummaries[0]?.layers.length, 2);
  assert.equal(opened.trackSummaries[0]?.entries.length, 1);

  const channel = result.manifest.dataset.channels[0];
  assert.ok(channel);
  const intensityLayer = channel.layers.find((layer) => layer.key === 'intensity');
  const segmentationLayer = channel.layers.find((layer) => layer.key === 'segmentation');
  assert.ok(intensityLayer);
  assert.ok(segmentationLayer);
  assert.equal(intensityLayer?.zarr.scales[0]?.zarr.labels, undefined);
  assert.ok(segmentationLayer?.zarr.scales[0]?.zarr.labels);

  const intensityScale = intensityLayer?.zarr.scales[0];
  assert.ok(intensityScale);
  const firstDataChunkCoords = new Array<number>(intensityScale?.zarr.data.shape.length ?? 0).fill(0);
  const intensityDataChunk = await storageHandle.storage.readFile(
    `${intensityScale?.zarr.data.path}/${createZarrChunkKeyFromCoords(firstDataChunkCoords)}`
  );
  assert.ok(intensityDataChunk.byteLength > 0, 'Expected at least one stored data chunk.');

  const intensityHistogramChunk = await storageHandle.storage.readFile(
    `${intensityScale?.zarr.histogram.path}/${createZarrChunkKeyFromCoords([0, 0])}`
  );
  const histogram = decodeUint32ArrayLE(intensityHistogramChunk);
  assert.equal(histogram.length, 256);
  const histogramTotal = histogram.reduce((sum, value) => sum + value, 0);
  assert.equal(histogramTotal, 4);

  const segmentationScale = segmentationLayer?.zarr.scales[0];
  assert.ok(segmentationScale?.zarr.labels);
  const firstLabelChunkCoords = new Array<number>(segmentationScale?.zarr.labels?.shape.length ?? 0).fill(0);
  const labelChunk = await storageHandle.storage.readFile(
    `${segmentationScale?.zarr.labels?.path}/${createZarrChunkKeyFromCoords(firstLabelChunkCoords)}`
  );
  assert.ok(labelChunk.byteLength >= 4);
  const firstLabel = new DataView(labelChunk.buffer, labelChunk.byteOffset, labelChunk.byteLength).getUint32(0, true);
  assert.equal(firstLabel, 0);
});
