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
  const segLeafMinPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/0/min';
  const segLeafMaxPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/0/max';
  const segLeafOccupancyPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/0/occupancy';
  const segRootMinPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/1/min';
  const segRootMaxPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/1/max';
  const segRootOccupancyPath = 'channels/channel-a/seg/scales/0/skip-hierarchy/levels/1/occupancy';
  const segHistogramPath = 'channels/channel-a/seg/scales/0/histogram';

  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      trackSets: [
        {
          id: 'track-set-a',
          name: 'Track set A',
          fileName: 'channel-a.csv',
          boundChannelId: 'channel-a',
          tracks: { path: 'tracks/track-set-a.csv', format: 'csv', columns: 8, decimalPlaces: 3 }
        }
      ],
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
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
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 2, 2],
                            min: {
                              path: segLeafMinPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            max: {
                              path: segLeafMaxPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: segLeafOccupancyPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            }
                          },
                          {
                            level: 1,
                            gridShape: [1, 1, 1],
                            min: {
                              path: segRootMinPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: segRootMaxPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: segRootOccupancyPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            }
                          }
                        ]
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
  for (const hierarchy of baseScale.zarr.skipHierarchy.levels) {
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.min.path), {
      shape: hierarchy.min.shape,
      data_type: hierarchy.min.dataType,
      chunk_shape: hierarchy.min.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.max.path), {
      shape: hierarchy.max.shape,
      data_type: hierarchy.max.dataType,
      chunk_shape: hierarchy.max.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.occupancy.path), {
      shape: hierarchy.occupancy.shape,
      data_type: hierarchy.occupancy.dataType,
      chunk_shape: hierarchy.occupancy.chunkShape,
      codecs: [],
      fill_value: 0
    });
  }
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
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.min.path}/c/0/0/0/0`,
    new Uint8Array([0, 0, 0, 0])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.max.path}/c/0/0/0/0`,
    new Uint8Array([0, 255, 255, 255])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.occupancy.path}/c/0/0/0/0`,
    new Uint8Array([0, 255, 255, 255])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.min.path}/c/0/0/0/0`,
    new Uint8Array([0])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.max.path}/c/0/0/0/0`,
    new Uint8Array([255])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.occupancy.path}/c/0/0/0/0`,
    new Uint8Array([255])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.min.path}/c/1/0/0/0`,
    new Uint8Array([255, 10, 40, 0])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.max.path}/c/1/0/0/0`,
    new Uint8Array([255, 255, 255, 0])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[0]!.occupancy.path}/c/1/0/0/0`,
    new Uint8Array([255, 255, 255, 0])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.min.path}/c/1/0/0/0`,
    new Uint8Array([10])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.max.path}/c/1/0/0/0`,
    new Uint8Array([255])
  );
  await storageHandle.storage.writeFile(
    `${baseScale.zarr.skipHierarchy.levels[1]!.occupancy.path}/c/1/0/0/0`,
    new Uint8Array([255])
  );

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  assert.equal(opened.totalVolumeCount, 2);
  assert.equal(opened.channelSummaries.length, 1);
  assert.deepEqual(opened.trackSummaries[0]?.entries, [['1', '0', '1', '1.123', '2.1', '3.988', '4', '0']]);

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
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-dataset-subcell' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);

  const manifest: PreprocessedManifest = {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: 1,
      trackSets: [],
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          layers: [
            {
              key: 'layer-subcell',
              label: 'Layer Subcell',
              channelId: 'channel-a',
              isSegmentation: false,
              volumeCount: 1,
              width: 2,
              height: 2,
              depth: 1,
              channels: 1,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                scales: [
                  {
                    level: 0,
                    downsampleFactor: [1, 1, 1],
                    width: 2,
                    height: 2,
                    depth: 1,
                    channels: 1,
                    zarr: {
                      data: {
                        path: 'channels/channel-a/layer-subcell/scales/0/data',
                        shape: [1, 1, 2, 2, 1],
                        chunkShape: [1, 1, 2, 2, 1],
                        dataType: 'uint8'
                      },
                      histogram: {
                        path: 'channels/channel-a/layer-subcell/scales/0/histogram',
                        shape: [1, 256],
                        chunkShape: [1, 256],
                        dataType: 'uint32'
                      },
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 1, 1],
                            min: {
                              path: 'channels/channel-a/layer-subcell/scales/0/skip-hierarchy/levels/0/min',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: 'channels/channel-a/layer-subcell/scales/0/skip-hierarchy/levels/0/max',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: 'channels/channel-a/layer-subcell/scales/0/skip-hierarchy/levels/0/occupancy',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            }
                          }
                        ]
                      },
                      subcell: {
                        gridShape: [1, 2, 2],
                        data: {
                          path: 'channels/channel-a/layer-subcell/scales/0/subcell',
                          shape: [1, 1, 2, 2, 4],
                          chunkShape: [1, 1, 2, 2, 4],
                          dataType: 'uint8'
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

  const root = zarr.root(zarrStore);
  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  const scale = manifest.dataset.channels[0]!.layers[0]!.zarr.scales[0]!;
  await zarr.create(root.resolve(scale.zarr.data.path), {
    shape: scale.zarr.data.shape,
    data_type: scale.zarr.data.dataType,
    chunk_shape: scale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(root.resolve(scale.zarr.histogram.path), {
    shape: scale.zarr.histogram.shape,
    data_type: scale.zarr.histogram.dataType,
    chunk_shape: scale.zarr.histogram.chunkShape,
    codecs: [],
    fill_value: 0
  });
  for (const hierarchy of scale.zarr.skipHierarchy.levels) {
    await zarr.create(root.resolve(hierarchy.min.path), {
      shape: hierarchy.min.shape,
      data_type: hierarchy.min.dataType,
      chunk_shape: hierarchy.min.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(root.resolve(hierarchy.max.path), {
      shape: hierarchy.max.shape,
      data_type: hierarchy.max.dataType,
      chunk_shape: hierarchy.max.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(root.resolve(hierarchy.occupancy.path), {
      shape: hierarchy.occupancy.shape,
      data_type: hierarchy.occupancy.dataType,
      chunk_shape: hierarchy.occupancy.chunkShape,
      codecs: [],
      fill_value: 0
    });
  }
  await zarr.create(root.resolve(scale.zarr.subcell!.data.path), {
    shape: scale.zarr.subcell!.data.shape,
    data_type: scale.zarr.subcell!.data.dataType,
    chunk_shape: scale.zarr.subcell!.data.chunkShape,
    codecs: [],
    fill_value: 0
  });

  const volume = new Uint8Array([10, 20, 30, 40]);
  const histogram = computeUint8VolumeHistogram({
    width: 2,
    height: 2,
    depth: 1,
    channels: 1,
    normalized: volume
  });
  const subcell = new Uint8Array([
    255, 10, 10, 255,
    255, 20, 20, 255,
    255, 30, 30, 255,
    255, 40, 40, 255
  ]);

  await storageHandle.storage.writeFile(`${scale.zarr.data.path}/c/0/0/0/0/0`, volume);
  await storageHandle.storage.writeFile(`${scale.zarr.histogram.path}/c/0/0`, encodeUint32ArrayLE(histogram));
  await storageHandle.storage.writeFile(
    `${scale.zarr.skipHierarchy.levels[0]!.min.path}/c/0/0/0/0`,
    new Uint8Array([10])
  );
  await storageHandle.storage.writeFile(
    `${scale.zarr.skipHierarchy.levels[0]!.max.path}/c/0/0/0/0`,
    new Uint8Array([40])
  );
  await storageHandle.storage.writeFile(
    `${scale.zarr.skipHierarchy.levels[0]!.occupancy.path}/c/0/0/0/0`,
    new Uint8Array([255])
  );
  await storageHandle.storage.writeFile(`${scale.zarr.subcell!.data.path}/c/0/0/0/0/0`, subcell);

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 4,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });
  assert.equal(typeof provider.getBrickPageTable, 'function');
  const pageTable = await provider.getBrickPageTable!('layer-subcell', 0);
  assert.deepEqual(pageTable.chunkShape, [1, 2, 2]);
  assert.deepEqual(pageTable.subcell?.gridShape, [1, 2, 2]);
  assert.equal(pageTable.subcell?.width, 2);
  assert.equal(pageTable.subcell?.height, 2);
  assert.equal(pageTable.subcell?.depth, 1);
  assert.deepEqual(Array.from(pageTable.subcell?.data ?? []), Array.from(subcell));
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
  const skipLeafMinPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/0/min';
  const skipLeafMaxPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/0/max';
  const skipLeafOccPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/0/occupancy';
  const skipRootMinPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/1/min';
  const skipRootMaxPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/1/max';
  const skipRootOccPath = 'channels/channel-sharded/layer-sharded/scales/0/skip-hierarchy/levels/1/occupancy';

  const manifest: PreprocessedManifest = {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      trackSets: [],
      channels: [
        {
          id: 'channel-sharded',
          name: 'Channel Sharded',
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
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 2, 2],
                            min: {
                              path: skipLeafMinPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            max: {
                              path: skipLeafMaxPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: skipLeafOccPath,
                              shape: [timepoints, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            }
                          },
                          {
                            level: 1,
                            gridShape: [1, 1, 1],
                            min: {
                              path: skipRootMinPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: skipRootMaxPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: skipRootOccPath,
                              shape: [timepoints, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            }
                          }
                        ]
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
  for (const hierarchy of baseScale.zarr.skipHierarchy.levels) {
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.min.path), {
      shape: hierarchy.min.shape,
      data_type: hierarchy.min.dataType,
      chunk_shape: hierarchy.min.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.max.path), {
      shape: hierarchy.max.shape,
      data_type: hierarchy.max.dataType,
      chunk_shape: hierarchy.max.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(hierarchy.occupancy.path), {
      shape: hierarchy.occupancy.shape,
      data_type: hierarchy.occupancy.dataType,
      chunk_shape: hierarchy.occupancy.chunkShape,
      codecs: [],
      fill_value: 0
    });
  }
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

  await storageHandle.storage.writeFile(`${skipLeafMinPath}/c/0/0/0/0`, new Uint8Array([10, 10, 10, 10]));
  await storageHandle.storage.writeFile(`${skipLeafMaxPath}/c/0/0/0/0`, new Uint8Array([40, 40, 40, 40]));
  await storageHandle.storage.writeFile(`${skipLeafOccPath}/c/0/0/0/0`, new Uint8Array([255, 255, 255, 255]));
  await storageHandle.storage.writeFile(`${skipRootMinPath}/c/0/0/0/0`, new Uint8Array([10]));
  await storageHandle.storage.writeFile(`${skipRootMaxPath}/c/0/0/0/0`, new Uint8Array([40]));
  await storageHandle.storage.writeFile(`${skipRootOccPath}/c/0/0/0/0`, new Uint8Array([255]));
  await storageHandle.storage.writeFile(`${skipLeafMinPath}/c/1/0/0/0`, new Uint8Array([5, 5, 5, 5]));
  await storageHandle.storage.writeFile(`${skipLeafMaxPath}/c/1/0/0/0`, new Uint8Array([35, 35, 35, 35]));
  await storageHandle.storage.writeFile(`${skipLeafOccPath}/c/1/0/0/0`, new Uint8Array([255, 255, 255, 255]));
  await storageHandle.storage.writeFile(`${skipRootMinPath}/c/1/0/0/0`, new Uint8Array([5]));
  await storageHandle.storage.writeFile(`${skipRootMaxPath}/c/1/0/0/0`, new Uint8Array([35]));
  await storageHandle.storage.writeFile(`${skipRootOccPath}/c/1/0/0/0`, new Uint8Array([255]));

  const histogramT0 = computeUint8VolumeHistogram({ width, height, depth, channels, normalized: t0 });
  const histogramT1 = computeUint8VolumeHistogram({ width, height, depth, channels, normalized: t1 });
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/0/0`, encodeUint32ArrayLE(histogramT0));
  await storageHandle.storage.writeFile(`${baseScale.zarr.histogram.path}/c/1/0`, encodeUint32ArrayLE(histogramT1));

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const readFileCalls: string[] = [];
  const readFileRangeCalls: Array<{ path: string; offset: number; length: number }> = [];
  const trackedStorage = {
    async writeFile(path: string, data: Uint8Array) {
      await storageHandle.storage.writeFile(path, data);
    },
    async readFile(path: string) {
      readFileCalls.push(path);
      return storageHandle.storage.readFile(path);
    },
    async readFileRange(path: string, offset: number, length: number) {
      readFileRangeCalls.push({ path, offset, length });
      return storageHandle.storage.readFileRange!(path, offset, length);
    }
  };
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: trackedStorage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const first = await provider.getVolume('layer-sharded', 0);
  assert.deepEqual(Array.from(first.normalized), Array.from(t0));
  assert.deepEqual(Array.from(first.histogram ?? []), Array.from(histogramT0));
  assert.equal(readFileRangeCalls.some((call) => call.path.endsWith('.shard')), true);
  assert.equal(readFileCalls.some((path) => path.endsWith('.shard')), false);
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
