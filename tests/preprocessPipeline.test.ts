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
import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CACHED_VOLUMES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../src/core/volumeProvider.ts';

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

test('preprocessDatasetToStorage writes loadable manifest and chunk data for mixed channels', async () => {
  const channels: ChannelExportMetadata[] = [
    {
      id: 'channel-a',
      name: 'Channel A'
    },
    {
      id: 'channel-b',
      name: 'Channel B'
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
      channelId: 'channel-b',
      channelLabel: 'Channel B',
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
  assert.equal(result.manifest.dataset.channels.length, 2);
  assert.equal(result.channelSummaries.length, 2);
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
  for (const summary of opened.channelSummaries) {
    assert.equal(summary.layers.length, 1);
  }
  assert.equal(opened.trackSummaries[0]?.entries.length, 1);

  const intensityLayer = result.manifest.dataset.channels.find((channel) => channel.id === 'channel-a')?.layers[0];
  const segmentationLayer = result.manifest.dataset.channels.find((channel) => channel.id === 'channel-b')?.layers[0];
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

test('preprocessDatasetToStorage rejects multiple volumes assigned to one channel', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a-1',
      label: 'Layer A1',
      files: [new File(['volume-0'], 'volume-0.tif', { type: 'image/tiff' })],
      isSegmentation: false
    },
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a-2',
      label: 'Layer A2',
      files: [new File(['volume-1'], 'volume-1.tif', { type: 'image/tiff' })],
      isSegmentation: true
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'volume-0.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [0, 1, 2, 3]
      })
    ],
    [
      'volume-1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [3, 2, 1, 0]
      })
    ]
  ]);
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-reject-multi-volume-channel' });

  await assert.rejects(
    () =>
      preprocessDatasetToStorage({
        layers,
        channels,
        trackSets: [],
        voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
        movieMode: '3d',
        storage: storageHandle.storage,
        volumeLoader: createLoaderByFileName(volumeByFileName),
        storageStrategy: { sharding: { enabled: false } }
      }),
    /requires exactly one volume per channel/
  );
});

test('preprocessDatasetToStorage maps single 3D TIFF to 2D movie timepoints', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files: [new File(['movie'], 'movie-3d.tif', { type: 'image/tiff' })],
      isSegmentation: false
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'movie-3d.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 1,
        depth: 3,
        channels: 1,
        values: [1, 2, 3, 4, 5, 6]
      })
    ]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-2d-movie-single-3d' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets: [],
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
    movieMode: '3d',
    inputInterpretation: '2d-movie',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(volumeByFileName),
    storageStrategy: { sharding: { enabled: false } }
  });

  assert.equal(result.totalVolumeCount, 3);
  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  assert.equal(layer?.volumeCount, 3);
  assert.equal(layer?.depth, 1);
});

test('preprocessDatasetToStorage writes sharded chunks that volume provider reads correctly', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const files = [new File(['intensity-0'], 'intensity-t0.tif', { type: 'image/tiff' })];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files,
      isSegmentation: false,
    },
  ];

  const sourceValues = [0, 64, 128, 255];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'intensity-t0.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: sourceValues,
      }),
    ],
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-sharded-provider-roundtrip' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets: [],
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
    movieMode: '3d',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(volumeByFileName),
    storageStrategy: { sharding: { enabled: true } },
  });

  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  const scale0 = layer?.zarr.scales[0];
  assert.ok(scale0);
  assert.equal(scale0?.zarr.data.sharding?.enabled, true);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const loaded = await provider.getVolume('layer-a', 0, { scaleLevel: 0 });
  assert.deepEqual(Array.from(loaded.normalized), sourceValues);
});

test('preprocessDatasetToStorage stacks 2D TIFF sequence into one single-3D volume', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files: [
        new File(['slice-1'], 'slice-1.tif', { type: 'image/tiff' }),
        new File(['slice-2'], 'slice-2.tif', { type: 'image/tiff' }),
        new File(['slice-3'], 'slice-3.tif', { type: 'image/tiff' })
      ],
      isSegmentation: false
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'slice-1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [1, 2, 3, 4]
      })
    ],
    [
      'slice-2.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [5, 6, 7, 8]
      })
    ],
    [
      'slice-3.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [9, 10, 11, 12]
      })
    ]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-single-3d-stack-2d' });
  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets: [],
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
    movieMode: '3d',
    inputInterpretation: 'single-3d-volume',
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(volumeByFileName),
    storageStrategy: { sharding: { enabled: false } }
  });

  assert.equal(result.totalVolumeCount, 1);
  const layer = result.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  assert.equal(layer?.volumeCount, 1);
  assert.equal(layer?.depth, 3);
});

test('preprocessDatasetToStorage rejects multiple 3D files in 2D movie mode', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files: [
        new File(['vol-1'], 'vol-1.tif', { type: 'image/tiff' }),
        new File(['vol-2'], 'vol-2.tif', { type: 'image/tiff' })
      ],
      isSegmentation: false
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'vol-1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 3,
        channels: 1,
        values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
      })
    ],
    [
      'vol-2.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 2,
        channels: 1,
        values: [1, 2, 3, 4, 5, 6, 7, 8]
      })
    ]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-2d-movie-reject-multi-3d' });
  await assert.rejects(
    () =>
      preprocessDatasetToStorage({
        layers,
        channels,
        trackSets: [],
        voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
        movieMode: '3d',
        inputInterpretation: '2d-movie',
        storage: storageHandle.storage,
        volumeLoader: createLoaderByFileName(volumeByFileName),
        storageStrategy: { sharding: { enabled: false } }
      }),
    /accepts either a single 3D TIFF or a sequence of 2D TIFFs/
  );
});

test('preprocessDatasetToStorage validates consistent 2D slice shape in single-3D mode', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files: [
        new File(['slice-1'], 'slice-1.tif', { type: 'image/tiff' }),
        new File(['slice-2'], 'slice-2.tif', { type: 'image/tiff' })
      ],
      isSegmentation: false
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'slice-1.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [1, 2, 3, 4]
      })
    ],
    [
      'slice-2.tif',
      createSyntheticVolumePayload({
        width: 3,
        height: 2,
        depth: 1,
        channels: 1,
        values: [5, 6, 7, 8, 9, 10]
      })
    ]
  ]);

  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-single-3d-shape-mismatch' });
  await assert.rejects(
    () =>
      preprocessDatasetToStorage({
        layers,
        channels,
        trackSets: [],
        voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
        movieMode: '3d',
        inputInterpretation: 'single-3d-volume',
        storage: storageHandle.storage,
        volumeLoader: createLoaderByFileName(volumeByFileName),
        storageStrategy: { sharding: { enabled: false } }
      }),
    /expected 2×2×1/
  );
});

test('preprocessDatasetToStorage writes and serves a shared background mask', async () => {
  const channels: ChannelExportMetadata[] = [{ id: 'channel-a', name: 'Channel A' }];
  const layers: PreprocessLayerSource[] = [
    {
      channelId: 'channel-a',
      channelLabel: 'Channel A',
      key: 'layer-a',
      label: 'Layer A',
      files: [new File(['volume-0'], 'volume-0.tif', { type: 'image/tiff' })],
      isSegmentation: false
    }
  ];
  const volumeByFileName = new Map<string, VolumePayload>([
    [
      'volume-0.tif',
      createSyntheticVolumePayload({
        width: 2,
        height: 2,
        depth: 1,
        channels: 1,
        values: [5, 10, 5, 20]
      })
    ]
  ]);
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocess-background-mask' });

  const result = await preprocessDatasetToStorage({
    layers,
    channels,
    trackSets: [],
    voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
    movieMode: '3d',
    backgroundMask: { values: [5] },
    storage: storageHandle.storage,
    volumeLoader: createLoaderByFileName(volumeByFileName),
    storageStrategy: { sharding: { enabled: false } }
  });

  assert.ok(result.manifest.dataset.backgroundMask);
  assert.equal(result.manifest.dataset.backgroundMask?.sourceLayerKey, 'layer-a');
  assert.deepEqual(result.manifest.dataset.backgroundMask?.values, [5]);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const loadedVolume = await provider.getVolume('layer-a', 0, { scaleLevel: 0 });
  assert.deepEqual(Array.from(loadedVolume.normalized), [0, 10, 0, 20]);

  const loadedMask = await provider.getBackgroundMask?.({ scaleLevel: 0 });
  assert.ok(loadedMask);
  assert.deepEqual(Array.from(loadedMask?.data ?? []), [255, 0, 255, 0]);

  const layer = opened.manifest.dataset.channels[0]?.layers[0];
  assert.ok(layer);
  const scale0 = layer?.zarr.scales[0];
  assert.ok(scale0);
  const histogramChunk = await storageHandle.storage.readFile(
    `${scale0?.zarr.histogram.path}/${createZarrChunkKeyFromCoords([0, 0])}`
  );
  const histogram = decodeUint32ArrayLE(histogramChunk);
  const histogramTotal = histogram.reduce((sum, value) => sum + value, 0);
  assert.equal(histogramTotal, 2);
});
