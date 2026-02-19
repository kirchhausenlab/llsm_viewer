import assert from 'node:assert/strict';
import * as zarr from 'zarrita';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE } from '../src/shared/utils/histogram.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import { createShardFilePath, encodeShardEntries } from '../src/shared/utils/preprocessedDataset/sharding.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest
} from '../src/shared/utils/preprocessedDataset/types.ts';
import { serializeTrackEntriesToCsvBytes } from '../src/shared/utils/preprocessedDataset/tracks.ts';
import { createZarrStoreFromPreprocessedStorage } from '../src/shared/utils/zarrStore.ts';

console.log('Starting preprocessed dataset Zarr tests');

const makeManifest = (): PreprocessedManifest => {
  const width = 2;
  const height = 2;
  const depth = 1;
  const timepoints = 2;

  const segChannels = 4;
  const segDataPath = 'channels/channel-a/seg/data';
  const segLabelsPath = 'channels/channel-a/seg/labels';
  const segChunkMinPath = 'channels/channel-a/seg/scales/0/chunk-stats/min';
  const segChunkMaxPath = 'channels/channel-a/seg/scales/0/chunk-stats/max';
  const segChunkOccupancyPath = 'channels/channel-a/seg/scales/0/chunk-stats/occupancy';
  const segHistogramPath = 'channels/channel-a/seg/scales/0/histogram';

  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          trackSets: [
            {
              id: 'track-set-a',
              name: 'Track set A',
              fileName: 'channel-a.csv',
              tracks: { path: 'tracks/track-set-a.csv', format: 'csv', columns: 8, decimalPlaces: 3 }
            }
          ],
          layers: [
            {
              key: 'seg',
              label: 'Segmentation',
              channelId: 'channel-a',
              isSegmentation: true,
              volumeCount: timepoints,
              width,
              height,
              depth,
              channels: segChannels,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                scales: [
                  {
                    level: 0,
                    downsampleFactor: [1, 1, 1],
                    width,
                    height,
                    depth,
                    channels: segChannels,
                    zarr: {
                      data: {
                        path: segDataPath,
                        shape: [timepoints, depth, height, width, segChannels],
                        chunkShape: [1, depth, 1, 1, segChannels],
                        dataType: 'uint8'
                      },
                      histogram: {
                        path: segHistogramPath,
                        shape: [timepoints, 256],
                        chunkShape: [1, 256],
                        dataType: 'uint32'
                      },
                      labels: {
                        path: segLabelsPath,
                        shape: [timepoints, depth, height, width],
                        chunkShape: [1, depth, 1, 1],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: segChunkMinPath,
                          shape: [timepoints, depth, height, width],
                          chunkShape: [1, depth, height, width],
                          dataType: 'uint8'
                        },
                        max: {
                          path: segChunkMaxPath,
                          shape: [timepoints, depth, height, width],
                          chunkShape: [1, depth, height, width],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: segChunkOccupancyPath,
                          shape: [timepoints, depth, height, width],
                          chunkShape: [1, depth, height, width],
                          dataType: 'float32'
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ],
      voxelResolution: null,
      anisotropyCorrection: null
    }
  };
};

await (async () => {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-dataset-main' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);

  const manifest = makeManifest();
  await zarr.create(zarr.root(zarrStore), { attributes: { llsmViewerPreprocessed: manifest } });

  const layer = manifest.dataset.channels[0]!.layers[0]!;
  const baseScale = layer.zarr.scales[0]!;
  const trackEntries = [
    ['1', '0', '1', '1.123456', '2.100000', '3.987654', '4.000000', '0.000000']
  ];
  await storageHandle.storage.writeFile(
    'tracks/track-set-a.csv',
    serializeTrackEntriesToCsvBytes(trackEntries, { decimalPlaces: 3 })
  );
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.data.path), {
    shape: baseScale.zarr.data.shape,
    data_type: baseScale.zarr.data.dataType,
    chunk_shape: baseScale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.labels!.path), {
    shape: baseScale.zarr.labels!.shape,
    data_type: baseScale.zarr.labels!.dataType,
    chunk_shape: baseScale.zarr.labels!.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.min.path), {
    shape: baseScale.zarr.chunkStats.min.shape,
    data_type: baseScale.zarr.chunkStats.min.dataType,
    chunk_shape: baseScale.zarr.chunkStats.min.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.max.path), {
    shape: baseScale.zarr.chunkStats.max.shape,
    data_type: baseScale.zarr.chunkStats.max.dataType,
    chunk_shape: baseScale.zarr.chunkStats.max.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.occupancy.path), {
    shape: baseScale.zarr.chunkStats.occupancy.shape,
    data_type: baseScale.zarr.chunkStats.occupancy.dataType,
    chunk_shape: baseScale.zarr.chunkStats.occupancy.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.histogram.path), {
    shape: baseScale.zarr.histogram.shape,
    data_type: baseScale.zarr.histogram.dataType,
    chunk_shape: baseScale.zarr.histogram.chunkShape,
    codecs: [],
    fill_value: 0
  });

  const segT0 = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
  const segT1 = new Uint8Array([255, 255, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255, 0, 0, 0, 0]);
  const labelsT0 = new Uint32Array([0, 1, 2, 3]);
  const labelsT1 = new Uint32Array([3, 2, 1, 0]);

  const writeSpatialDataChunks = async (timepoint: number, volume: Uint8Array) => {
    let voxelIndex = 0;
    for (let y = 0; y < layer.height; y += 1) {
      for (let x = 0; x < layer.width; x += 1) {
        const chunkStart = voxelIndex * layer.channels;
        const chunkBytes = volume.slice(chunkStart, chunkStart + layer.channels);
        await storageHandle.storage.writeFile(`${baseScale.zarr.data.path}/c/${timepoint}/0/${y}/${x}/0`, chunkBytes);
        voxelIndex += 1;
      }
    }
  };

  const writeSpatialLabelChunks = async (timepoint: number, labels: Uint32Array) => {
    let voxelIndex = 0;
    for (let y = 0; y < layer.height; y += 1) {
      for (let x = 0; x < layer.width; x += 1) {
        const chunkBytes = new Uint8Array(4);
        new DataView(chunkBytes.buffer).setUint32(0, labels[voxelIndex] ?? 0, true);
        await storageHandle.storage.writeFile(`${baseScale.zarr.labels!.path}/c/${timepoint}/0/${y}/${x}`, chunkBytes);
        voxelIndex += 1;
      }
    }
  };

  await writeSpatialDataChunks(0, segT0);
  await writeSpatialDataChunks(1, segT1);
  await writeSpatialLabelChunks(0, labelsT0);
  await writeSpatialLabelChunks(1, labelsT1);

  const histogramT0 = computeUint8VolumeHistogram({
    width: layer.width,
    height: layer.height,
    depth: layer.depth,
    channels: layer.channels,
    normalized: segT0
  });
  const histogramT1 = computeUint8VolumeHistogram({
    width: layer.width,
    height: layer.height,
    depth: layer.depth,
    channels: layer.channels,
    normalized: segT1
  });
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/0/0`, encodeUint32ArrayLE(histogramT0));
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/1/0`, encodeUint32ArrayLE(histogramT1));
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.min.path}/c/0/0/0/0`, new Uint8Array([0, 0, 0, 0]));
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.max.path}/c/0/0/0/0`, new Uint8Array([0, 255, 255, 255]));
  const chunkOccT0 = new Uint8Array(16);
  const chunkOccT0View = new DataView(chunkOccT0.buffer);
  chunkOccT0View.setFloat32(0, 0, true);
  chunkOccT0View.setFloat32(4, 0.5, true);
  chunkOccT0View.setFloat32(8, 0.5, true);
  chunkOccT0View.setFloat32(12, 0.5, true);
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.occupancy.path}/c/0/0/0/0`, chunkOccT0);
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.min.path}/c/1/0/0/0`, new Uint8Array([255, 10, 40, 0]));
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.max.path}/c/1/0/0/0`, new Uint8Array([255, 255, 255, 0]));
  const chunkOccT1 = new Uint8Array(16);
  const chunkOccT1View = new DataView(chunkOccT1.buffer);
  chunkOccT1View.setFloat32(0, 1, true);
  chunkOccT1View.setFloat32(4, 1, true);
  chunkOccT1View.setFloat32(8, 1, true);
  chunkOccT1View.setFloat32(12, 0, true);
  await storageHandle.storage.writeFile(`${baseScale.zarr.chunkStats.occupancy.path}/c/1/0/0/0`, chunkOccT1);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  assert.equal(opened.totalVolumeCount, 2);
  assert.equal(opened.channelSummaries.length, 1);
  assert.deepEqual(opened.channelSummaries[0]?.trackSets[0]?.entries, [['1', '0', '1', '1.123', '2.1', '3.988', '4', '0']]);

  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 12,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });
  const volume0 = await provider.getVolume('seg', 0);
  assert.deepEqual(Array.from(volume0.normalized), Array.from(segT0));
  assert.deepEqual(Array.from(volume0.segmentationLabels ?? []), Array.from(labelsT0));
  assert.deepEqual(Array.from(volume0.histogram ?? []), Array.from(histogramT0));

  const volume1 = await provider.getVolume('seg', 1);
  assert.deepEqual(Array.from(volume1.normalized), Array.from(segT1));
  assert.deepEqual(Array.from(volume1.segmentationLabels ?? []), Array.from(labelsT1));
  assert.deepEqual(Array.from(volume1.histogram ?? []), Array.from(histogramT1));

  assert.equal(typeof provider.getBrickPageTable, 'function');
  const pageTableT0 = await provider.getBrickPageTable!('seg', 0);
  assert.deepEqual(pageTableT0.gridShape, [1, 2, 2]);
  assert.deepEqual(pageTableT0.chunkShape, [1, 1, 1]);
  assert.deepEqual(Array.from(pageTableT0.brickAtlasIndices), [-1, 0, 1, 2]);
  assert.deepEqual(Array.from(pageTableT0.chunkMin), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(pageTableT0.chunkMax), [0, 255, 255, 255]);
  assert.equal(pageTableT0.occupiedBrickCount, 3);

  const pageTableT1 = await provider.getBrickPageTable!('seg', 1);
  assert.deepEqual(Array.from(pageTableT1.brickAtlasIndices), [0, 1, 2, -1]);
  assert.deepEqual(Array.from(pageTableT1.chunkMin), [255, 10, 40, 0]);
  assert.deepEqual(Array.from(pageTableT1.chunkMax), [255, 255, 255, 0]);
  assert.equal(pageTableT1.occupiedBrickCount, 3);

  assert.equal(typeof provider.getBrickAtlas, 'function');
  assert.equal(provider.hasBrickAtlas?.('seg', 0), false);
  const brickAtlasT0 = await provider.getBrickAtlas!('seg', 0);
  assert.equal(brickAtlasT0.enabled, true);
  assert.equal(brickAtlasT0.textureFormat, 'rgba');
  assert.equal(brickAtlasT0.sourceChannels, 4);
  assert.equal(brickAtlasT0.width, 1);
  assert.equal(brickAtlasT0.height, 1);
  assert.equal(brickAtlasT0.depth, 3);
  assert.deepEqual(Array.from(brickAtlasT0.pageTable.brickAtlasIndices), [-1, 0, 1, 2]);
  assert.deepEqual(
    Array.from(brickAtlasT0.data),
    [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]
  );
  assert.equal(provider.hasBrickAtlas?.('seg', 0), true);

  const brickAtlasT1 = await provider.getBrickAtlas!('seg', 1);
  assert.equal(brickAtlasT1.enabled, true);
  assert.equal(brickAtlasT1.textureFormat, 'rgba');
  assert.equal(brickAtlasT1.width, 1);
  assert.equal(brickAtlasT1.height, 1);
  assert.equal(brickAtlasT1.depth, 3);
  assert.deepEqual(
    Array.from(brickAtlasT1.data),
    [255, 255, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255]
  );
  provider.setMaxCachedVolumes(1);
  assert.equal(provider.hasBrickAtlas?.('seg', 1), true);
  assert.equal(provider.hasBrickAtlas?.('seg', 0), false);
  provider.setMaxCachedVolumes(12);
  await provider.getVolume('seg', 0);

  if (typeof provider.prefetchBrickAtlases === 'function') {
    await provider.prefetchBrickAtlases(['seg'], 1, { policy: 'missing-only' });
    assert.equal(provider.hasBrickAtlas?.('seg', 1), true);
  }

  provider.resetStats();
  await provider.prefetch(['seg'], 0, { policy: 'missing-only', reason: 'playback' });
  const skippedPrefetchStats = provider.getStats();
  assert.equal(skippedPrefetchStats.prefetchCalls, 1);
  assert.equal(skippedPrefetchStats.prefetchSkippedCached, 1);
  assert.equal(skippedPrefetchStats.prefetchLoadsStarted, 0);
  assert.equal(skippedPrefetchStats.prefetchLoadsCompleted, 0);

  provider.resetStats();
  await provider.prefetch(['seg'], 0, { policy: 'force', reason: 'warmup' });
  const forcedPrefetchStats = provider.getStats();
  assert.equal(forcedPrefetchStats.prefetchCalls, 1);
  assert.equal(forcedPrefetchStats.prefetchLoadsStarted, 1);
  assert.equal(forcedPrefetchStats.prefetchLoadsCompleted, 1);
  assert.equal(forcedPrefetchStats.prefetchLoadsFailed, 0);
  const forcedPrefetchDiagnostics = provider.getDiagnostics();
  assert.equal(forcedPrefetchDiagnostics.missRates.volume, 0);

  provider.resetStats();
  const prefetchAbortController = new AbortController();
  prefetchAbortController.abort();
  await provider.prefetch(['seg'], 1, { policy: 'force', reason: 'playback', signal: prefetchAbortController.signal });
  const abortedPrefetchStats = provider.getStats();
  assert.equal(abortedPrefetchStats.prefetchCalls, 1);
  assert.equal(abortedPrefetchStats.prefetchRequestsAborted, 1);
  assert.equal(abortedPrefetchStats.prefetchLoadsStarted, 0);
  const abortedPrefetchDiagnostics = provider.getDiagnostics();
  assert.equal(abortedPrefetchDiagnostics.missRates.volume, 0);

  const diagnostics = abortedPrefetchDiagnostics;
  assert.equal(typeof diagnostics.capturedAt, 'string');
  assert.equal(diagnostics.activePrefetchRequests.length, 0);
  assert.equal(diagnostics.stats.prefetchRequestsAborted, abortedPrefetchStats.prefetchRequestsAborted);
  assert.equal(diagnostics.cachePressure.volume >= 0 && diagnostics.cachePressure.volume <= 1, true);
  assert.equal(diagnostics.cachePressure.chunk >= 0 && diagnostics.cachePressure.chunk <= 1, true);

  console.log('preprocessed dataset Zarr tests passed');
})();

await (async () => {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-dataset-sharded' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);

  const width = 2;
  const height = 2;
  const depth = 1;
  const channels = 1;
  const timepoints = 2;
  const dataPath = 'channels/channel-sharded/layer-sharded/scales/0/data';
  const histogramPath = 'channels/channel-sharded/layer-sharded/scales/0/histogram';
  const chunkMinPath = 'channels/channel-sharded/layer-sharded/scales/0/chunk-stats/min';
  const chunkMaxPath = 'channels/channel-sharded/layer-sharded/scales/0/chunk-stats/max';
  const chunkOccPath = 'channels/channel-sharded/layer-sharded/scales/0/chunk-stats/occupancy';

  const manifest: PreprocessedManifest = {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      channels: [
        {
          id: 'channel-sharded',
          name: 'Channel Sharded',
          trackSets: [],
          layers: [
            {
              key: 'layer-sharded',
              label: 'Layer Sharded',
              channelId: 'channel-sharded',
              isSegmentation: false,
              volumeCount: timepoints,
              width,
              height,
              depth,
              channels,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                scales: [
                  {
                    level: 0,
                    downsampleFactor: [1, 1, 1],
                    width,
                    height,
                    depth,
                    channels,
                    zarr: {
                      data: {
                        path: dataPath,
                        shape: [timepoints, depth, height, width, channels],
                        chunkShape: [1, 1, 1, 1, 1],
                        dataType: 'uint8',
                        sharding: {
                          enabled: true,
                          targetShardBytes: 1024,
                          shardShape: [1, 1, 2, 2, 1],
                          estimatedShardBytes: 4
                        }
                      },
                      histogram: {
                        path: histogramPath,
                        shape: [timepoints, 256],
                        chunkShape: [1, 256],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: chunkMinPath,
                          shape: [timepoints, 1, 2, 2],
                          chunkShape: [1, 1, 2, 2],
                          dataType: 'uint8'
                        },
                        max: {
                          path: chunkMaxPath,
                          shape: [timepoints, 1, 2, 2],
                          chunkShape: [1, 1, 2, 2],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: chunkOccPath,
                          shape: [timepoints, 1, 2, 2],
                          chunkShape: [1, 1, 2, 2],
                          dataType: 'float32'
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ],
      voxelResolution: null,
      anisotropyCorrection: null
    }
  };

  await zarr.create(zarr.root(zarrStore), { attributes: { llsmViewerPreprocessed: manifest } });
  const layer = manifest.dataset.channels[0]!.layers[0]!;
  const baseScale = layer.zarr.scales[0]!;
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.data.path), {
    shape: baseScale.zarr.data.shape,
    data_type: baseScale.zarr.data.dataType,
    chunk_shape: baseScale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.min.path), {
    shape: baseScale.zarr.chunkStats.min.shape,
    data_type: baseScale.zarr.chunkStats.min.dataType,
    chunk_shape: baseScale.zarr.chunkStats.min.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.max.path), {
    shape: baseScale.zarr.chunkStats.max.shape,
    data_type: baseScale.zarr.chunkStats.max.dataType,
    chunk_shape: baseScale.zarr.chunkStats.max.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.chunkStats.occupancy.path), {
    shape: baseScale.zarr.chunkStats.occupancy.shape,
    data_type: baseScale.zarr.chunkStats.occupancy.dataType,
    chunk_shape: baseScale.zarr.chunkStats.occupancy.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(baseScale.zarr.histogram.path), {
    shape: baseScale.zarr.histogram.shape,
    data_type: baseScale.zarr.histogram.dataType,
    chunk_shape: baseScale.zarr.histogram.chunkShape,
    codecs: [],
    fill_value: 0
  });

  const t0 = new Uint8Array([10, 20, 30, 40]);
  const t1 = new Uint8Array([5, 15, 25, 35]);

  const writeShardedTimepoint = async (timepoint: number, values: Uint8Array) => {
    const entries = [
      { localChunkCoords: [0, 0, 0, 0, 0], bytes: new Uint8Array([values[0] ?? 0]) },
      { localChunkCoords: [0, 0, 0, 1, 0], bytes: new Uint8Array([values[1] ?? 0]) },
      { localChunkCoords: [0, 0, 1, 0, 0], bytes: new Uint8Array([values[2] ?? 0]) },
      { localChunkCoords: [0, 0, 1, 1, 0], bytes: new Uint8Array([values[3] ?? 0]) }
    ];
    const shardBytes = encodeShardEntries(5, entries);
    const shardPath = createShardFilePath(baseScale.zarr.data.path, [timepoint, 0, 0, 0, 0]);
    await storageHandle.storage.writeFile(shardPath, shardBytes);
  };

  await writeShardedTimepoint(0, t0);
  await writeShardedTimepoint(1, t1);

  await storageHandle.storage.writeFile(`${chunkMinPath}/c/0/0/0/0`, new Uint8Array([10, 10, 10, 10]));
  await storageHandle.storage.writeFile(`${chunkMaxPath}/c/0/0/0/0`, new Uint8Array([40, 40, 40, 40]));
  const occT0 = new Uint8Array(16);
  const occT0View = new DataView(occT0.buffer);
  occT0View.setFloat32(0, 1, true);
  occT0View.setFloat32(4, 1, true);
  occT0View.setFloat32(8, 1, true);
  occT0View.setFloat32(12, 1, true);
  await storageHandle.storage.writeFile(`${chunkOccPath}/c/0/0/0/0`, occT0);
  await storageHandle.storage.writeFile(`${chunkMinPath}/c/1/0/0/0`, new Uint8Array([5, 5, 5, 5]));
  await storageHandle.storage.writeFile(`${chunkMaxPath}/c/1/0/0/0`, new Uint8Array([35, 35, 35, 35]));
  const occT1 = new Uint8Array(16);
  const occT1View = new DataView(occT1.buffer);
  occT1View.setFloat32(0, 1, true);
  occT1View.setFloat32(4, 1, true);
  occT1View.setFloat32(8, 1, true);
  occT1View.setFloat32(12, 1, true);
  await storageHandle.storage.writeFile(`${chunkOccPath}/c/1/0/0/0`, occT1);

  const histogramT0 = computeUint8VolumeHistogram({ width, height, depth, channels, normalized: t0 });
  const histogramT1 = computeUint8VolumeHistogram({ width, height, depth, channels, normalized: t1 });
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/0/0`, encodeUint32ArrayLE(histogramT0));
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/1/0`, encodeUint32ArrayLE(histogramT1));

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const first = await provider.getVolume('layer-sharded', 0);
  assert.deepEqual(Array.from(first.normalized), Array.from(t0));
  assert.deepEqual(Array.from(first.histogram ?? []), Array.from(histogramT0));
  assert.equal(typeof provider.getBrickPageTable, 'function');
  const shardedPageTableT0 = await provider.getBrickPageTable!('layer-sharded', 0);
  assert.deepEqual(shardedPageTableT0.gridShape, [1, 2, 2]);
  assert.deepEqual(Array.from(shardedPageTableT0.brickAtlasIndices), [0, 1, 2, 3]);
  assert.equal(shardedPageTableT0.occupiedBrickCount, 4);
  assert.equal(typeof provider.getBrickAtlas, 'function');
  const shardedAtlasT0 = await provider.getBrickAtlas!('layer-sharded', 0);
  assert.equal(shardedAtlasT0.enabled, true);
  assert.equal(shardedAtlasT0.textureFormat, 'red');
  assert.equal(shardedAtlasT0.width, 1);
  assert.equal(shardedAtlasT0.height, 1);
  assert.equal(shardedAtlasT0.depth, 4);
  assert.deepEqual(Array.from(shardedAtlasT0.data), Array.from(t0));

  provider.resetStats();
  const second = await provider.getVolume('layer-sharded', 0);
  assert.deepEqual(Array.from(second.normalized), Array.from(t0));
  const stats = provider.getStats();
  assert.equal(stats.chunkCacheHits > 0, true);

  const cachedPageTableT0 = await provider.getBrickPageTable!('layer-sharded', 0);
  assert.notEqual(cachedPageTableT0, shardedPageTableT0);
  assert.deepEqual(cachedPageTableT0.gridShape, shardedPageTableT0.gridShape);
  assert.deepEqual(Array.from(cachedPageTableT0.brickAtlasIndices), Array.from(shardedPageTableT0.brickAtlasIndices));
})();
