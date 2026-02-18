import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import {
  computeUint8VolumeHistogram,
  encodeUint32ArrayLE,
  HISTOGRAM_BINS
} from '../src/shared/utils/histogram.ts';
import { createZarrChunkKeyFromCoords } from '../src/shared/utils/preprocessedDataset/chunkKey.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest
} from '../src/shared/utils/preprocessedDataset/types.ts';

function encodeUint32Values(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setUint32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

function encodeFloat32Values(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    view.setFloat32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

function buildManifest(): PreprocessedManifest {
  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: 1,
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          trackSets: [],
          layers: [
            {
              key: 'layer-a',
              label: 'Layer A',
              channelId: 'channel-a',
              isSegmentation: true,
              volumeCount: 1,
              width: 2,
              height: 1,
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
                    height: 1,
                    depth: 1,
                    channels: 1,
                    zarr: {
                      data: {
                        path: 'channels/channel-a/layer-a/scales/0/data',
                        shape: [1, 1, 1, 2, 1],
                        chunkShape: [1, 1, 1, 2, 1],
                        dataType: 'uint8'
                      },
                      labels: {
                        path: 'channels/channel-a/layer-a/scales/0/labels',
                        shape: [1, 1, 1, 2],
                        chunkShape: [1, 1, 1, 2],
                        dataType: 'uint32'
                      },
                      histogram: {
                        path: 'channels/channel-a/layer-a/scales/0/histogram',
                        shape: [1, HISTOGRAM_BINS],
                        chunkShape: [1, HISTOGRAM_BINS],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/min',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
                          dataType: 'uint8'
                        },
                        max: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/max',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/occupancy',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
                          dataType: 'float32'
                        }
                      }
                    }
                  },
                  {
                    level: 1,
                    downsampleFactor: [1, 1, 2],
                    width: 1,
                    height: 1,
                    depth: 1,
                    channels: 1,
                    zarr: {
                      data: {
                        path: 'channels/channel-a/layer-a/scales/1/data',
                        shape: [1, 1, 1, 1, 1],
                        chunkShape: [1, 1, 1, 1, 1],
                        dataType: 'uint8'
                      },
                      labels: {
                        path: 'channels/channel-a/layer-a/scales/1/labels',
                        shape: [1, 1, 1, 1],
                        chunkShape: [1, 1, 1, 1],
                        dataType: 'uint32'
                      },
                      histogram: {
                        path: 'channels/channel-a/layer-a/scales/1/histogram',
                        shape: [1, HISTOGRAM_BINS],
                        chunkShape: [1, HISTOGRAM_BINS],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: 'channels/channel-a/layer-a/scales/1/chunk-stats/min',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
                          dataType: 'uint8'
                        },
                        max: {
                          path: 'channels/channel-a/layer-a/scales/1/chunk-stats/max',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: 'channels/channel-a/layer-a/scales/1/chunk-stats/occupancy',
                          shape: [1, 1, 1, 1],
                          chunkShape: [1, 1, 1, 1],
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
}

async function writeScalePayloads(manifest: PreprocessedManifest, storage: ReturnType<typeof createInMemoryPreprocessedStorage>['storage']) {
  const layer = manifest.dataset.channels[0]!.layers[0]!;
  const scale0 = layer.zarr.scales[0]!;
  const scale1 = layer.zarr.scales[1]!;

  const scale0Data = new Uint8Array([8, 240]);
  const scale1Data = new Uint8Array([240]);
  const scale0Labels = new Uint32Array([0, 7]);
  const scale1Labels = new Uint32Array([7]);
  const scale0Histogram = computeUint8VolumeHistogram({
    width: 2,
    height: 1,
    depth: 1,
    channels: 1,
    normalized: scale0Data
  });
  const scale1Histogram = computeUint8VolumeHistogram({
    width: 1,
    height: 1,
    depth: 1,
    channels: 1,
    normalized: scale1Data
  });

  await storage.writeFile(
    `${scale0.zarr.data.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0, 0])}`,
    scale0Data
  );
  await storage.writeFile(
    `${scale1.zarr.data.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0, 0])}`,
    scale1Data
  );
  await storage.writeFile(
    `${scale0.zarr.labels!.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    encodeUint32Values(scale0Labels)
  );
  await storage.writeFile(
    `${scale1.zarr.labels!.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    encodeUint32Values(scale1Labels)
  );
  await storage.writeFile(
    `${scale0.zarr.histogram.path}/${createZarrChunkKeyFromCoords([0, 0])}`,
    encodeUint32ArrayLE(scale0Histogram)
  );
  await storage.writeFile(
    `${scale1.zarr.histogram.path}/${createZarrChunkKeyFromCoords([0, 0])}`,
    encodeUint32ArrayLE(scale1Histogram)
  );
  await storage.writeFile(
    `${scale0.zarr.chunkStats.min.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([8])
  );
  await storage.writeFile(
    `${scale0.zarr.chunkStats.max.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([240])
  );
  await storage.writeFile(
    `${scale0.zarr.chunkStats.occupancy.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    encodeFloat32Values(new Float32Array([0.5]))
  );
  await storage.writeFile(
    `${scale1.zarr.chunkStats.min.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([240])
  );
  await storage.writeFile(
    `${scale1.zarr.chunkStats.max.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([240])
  );
  await storage.writeFile(
    `${scale1.zarr.chunkStats.occupancy.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    encodeFloat32Values(new Float32Array([1]))
  );

  return {
    scale0Data,
    scale1Data,
    scale0Labels,
    scale1Labels,
    scale0Histogram,
    scale1Histogram
  };
}

test('volume provider resolves requested multiscale data/histogram/labels', async () => {
  const manifest = buildManifest();
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-multiscale-resolve' });
  const written = await writeScalePayloads(manifest, storageHandle.storage);
  const provider = createVolumeProvider({
    manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 12,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const scale0Volume = await provider.getVolume('layer-a', 0, { scaleLevel: 0 });
  assert.equal(scale0Volume.scaleLevel, 0);
  assert.equal(scale0Volume.width, 2);
  assert.deepEqual(Array.from(scale0Volume.normalized), Array.from(written.scale0Data));
  assert.deepEqual(Array.from(scale0Volume.segmentationLabels ?? []), Array.from(written.scale0Labels));
  assert.deepEqual(Array.from(scale0Volume.histogram ?? []), Array.from(written.scale0Histogram));

  const scale1Volume = await provider.getVolume('layer-a', 0, { scaleLevel: 1 });
  assert.equal(scale1Volume.scaleLevel, 1);
  assert.equal(scale1Volume.width, 1);
  assert.deepEqual(Array.from(scale1Volume.normalized), Array.from(written.scale1Data));
  assert.deepEqual(Array.from(scale1Volume.segmentationLabels ?? []), Array.from(written.scale1Labels));
  assert.deepEqual(Array.from(scale1Volume.histogram ?? []), Array.from(written.scale1Histogram));

  await assert.rejects(
    () => provider.getVolume('layer-a', 0, { scaleLevel: 9 }),
    /Requested scale level 9 is unavailable/
  );
});

test('volume provider records multiscale brick requests in diagnostics', async () => {
  const manifest = buildManifest();
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-multiscale-diagnostics' });
  await writeScalePayloads(manifest, storageHandle.storage);
  const provider = createVolumeProvider({
    manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 12,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  await provider.prefetch(['layer-a'], 0, {
    policy: 'force',
    reason: 'interactive',
    scaleLevels: [0, 1]
  });
  if (typeof provider.prefetchBrickAtlases === 'function') {
    await provider.prefetchBrickAtlases(['layer-a'], 0, {
      policy: 'force',
      reason: 'interactive',
      scaleLevels: [0, 1]
    });
  }

  const diagnostics = provider.getDiagnostics();
  const scaleCounts = diagnostics.streaming.scaleRequestCounts;
  assert.ok((scaleCounts['0'] ?? 0) > 0);
  assert.ok((scaleCounts['1'] ?? 0) > 0);
  assert.equal(provider.hasVolume('layer-a', 0, { scaleLevel: 0 }), true);
  assert.equal(provider.hasVolume('layer-a', 0, { scaleLevel: 1 }), true);
  if (typeof provider.hasBrickAtlas === 'function') {
    assert.equal(provider.hasBrickAtlas('layer-a', 0, { scaleLevel: 0 }), true);
    assert.equal(provider.hasBrickAtlas('layer-a', 0, { scaleLevel: 1 }), true);
  }
});
