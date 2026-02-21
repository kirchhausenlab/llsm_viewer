import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import * as zarr from 'zarrita';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
} from '../../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../../src/shared/storage/preprocessedStorage.ts';
import {
  computeUint8VolumeHistogram,
  encodeUint32ArrayLE,
  HISTOGRAM_BINS,
} from '../../src/shared/utils/histogram.ts';
import { createZarrChunkKeyFromCoords } from '../../src/shared/utils/preprocessedDataset/chunkKey.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest,
} from '../../src/shared/utils/preprocessedDataset/types.ts';
import { createZarrStoreFromPreprocessedStorage } from '../../src/shared/utils/zarrStore.ts';

const LARGE_VOLUME_COLD_BUDGET_MS = 1200;
const LARGE_VOLUME_WARM_BUDGET_MS = 1000;
const LARGE_VOLUME_MIXED_BUDGET_MS = 1000;
const LARGE_VOLUME_ATLAS_BUDGET_MS = 1000;
const LARGE_VOLUME_HIT_RATE_MIN = 0.3;

type DatasetSpec = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  timepoints: number;
  chunkShape: [number, number, number, number, number];
};

type SyntheticDataset = {
  manifest: PreprocessedManifest;
  storage: ReturnType<typeof createInMemoryPreprocessedStorage>['storage'];
};

function fillDeterministicVolume(spec: DatasetSpec, timepoint: number): Uint8Array {
  const { width, height, depth, channels } = spec;
  const data = new Uint8Array(width * height * depth * channels);
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const voxelBase = ((z * height + y) * width + x) * channels;
        for (let c = 0; c < channels; c += 1) {
          data[voxelBase + c] = (x * 3 + y * 5 + z * 7 + c * 11 + timepoint * 13) % 256;
        }
      }
    }
  }
  return data;
}

function extractChunk({
  spec,
  source,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength,
}: {
  spec: DatasetSpec;
  source: Uint8Array;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
}): Uint8Array {
  const rowStride = spec.width * spec.channels;
  const planeStride = spec.height * rowStride;
  const lineLength = xLength * spec.channels;
  const chunk = new Uint8Array(zLength * yLength * lineLength);

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart * spec.channels;
      chunk.set(source.subarray(sourceOffset, sourceOffset + lineLength), destinationOffset);
      destinationOffset += lineLength;
    }
  }

  return chunk;
}

function buildManifest(spec: DatasetSpec): PreprocessedManifest {
  const { width, height, depth, channels, timepoints, chunkShape } = spec;
  const zChunks = Math.ceil(depth / chunkShape[1]);
  const yChunks = Math.ceil(height / chunkShape[2]);
  const xChunks = Math.ceil(width / chunkShape[3]);

  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      trackSets: [],
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          layers: [
            {
              key: 'layer-a',
              label: 'Layer A',
              channelId: 'channel-a',
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
                        path: 'channels/channel-a/layer-a/scales/0/data',
                        shape: [timepoints, depth, height, width, channels],
                        chunkShape: [...chunkShape],
                        dataType: 'uint8',
                      },
                      histogram: {
                        path: 'channels/channel-a/layer-a/scales/0/histogram',
                        shape: [timepoints, HISTOGRAM_BINS],
                        chunkShape: [1, HISTOGRAM_BINS],
                        dataType: 'uint32',
                      },
                      chunkStats: {
                        min: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/min',
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'uint8',
                        },
                        max: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/max',
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'uint8',
                        },
                        occupancy: {
                          path: 'channels/channel-a/layer-a/scales/0/chunk-stats/occupancy',
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'float32',
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      voxelResolution: null,
      anisotropyCorrection: null,
    },
  };
}

async function createSyntheticDataset(spec: DatasetSpec): Promise<SyntheticDataset> {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'perf-nextgen-runtime-stress' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);
  const root = zarr.root(zarrStore);
  const manifest = buildManifest(spec);
  const scale = manifest.dataset.channels[0]!.layers[0]!.zarr.scales[0]!;

  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  await zarr.create(root.resolve(scale.zarr.data.path), {
    shape: scale.zarr.data.shape,
    data_type: scale.zarr.data.dataType,
    chunk_shape: scale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  await zarr.create(root.resolve(scale.zarr.histogram.path), {
    shape: scale.zarr.histogram.shape,
    data_type: scale.zarr.histogram.dataType,
    chunk_shape: scale.zarr.histogram.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  await zarr.create(root.resolve(scale.zarr.chunkStats.min.path), {
    shape: scale.zarr.chunkStats.min.shape,
    data_type: scale.zarr.chunkStats.min.dataType,
    chunk_shape: scale.zarr.chunkStats.min.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  await zarr.create(root.resolve(scale.zarr.chunkStats.max.path), {
    shape: scale.zarr.chunkStats.max.shape,
    data_type: scale.zarr.chunkStats.max.dataType,
    chunk_shape: scale.zarr.chunkStats.max.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  await zarr.create(root.resolve(scale.zarr.chunkStats.occupancy.path), {
    shape: scale.zarr.chunkStats.occupancy.shape,
    data_type: scale.zarr.chunkStats.occupancy.dataType,
    chunk_shape: scale.zarr.chunkStats.occupancy.chunkShape,
    codecs: [],
    fill_value: 0,
  });

  const [, chunkDepth, chunkHeight, chunkWidth] = scale.zarr.data.chunkShape;
  const zChunks = Math.ceil(spec.depth / chunkDepth);
  const yChunks = Math.ceil(spec.height / chunkHeight);
  const xChunks = Math.ceil(spec.width / chunkWidth);

  for (let timepoint = 0; timepoint < spec.timepoints; timepoint += 1) {
    const volume = fillDeterministicVolume(spec, timepoint);
    const chunkMin = new Uint8Array(zChunks * yChunks * xChunks);
    const chunkMax = new Uint8Array(zChunks * yChunks * xChunks);
    const chunkOcc = new Float32Array(zChunks * yChunks * xChunks);

    for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
      const zStart = zChunk * chunkDepth;
      const zLength = Math.min(chunkDepth, spec.depth - zStart);
      for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
        const yStart = yChunk * chunkHeight;
        const yLength = Math.min(chunkHeight, spec.height - yStart);
        for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
          const xStart = xChunk * chunkWidth;
          const xLength = Math.min(chunkWidth, spec.width - xStart);
          const chunk = extractChunk({
            spec,
            source: volume,
            zStart,
            zLength,
            yStart,
            yLength,
            xStart,
            xLength,
          });
          await storageHandle.storage.writeFile(
            `${scale.zarr.data.path}/${createZarrChunkKeyFromCoords([timepoint, zChunk, yChunk, xChunk, 0])}`,
            chunk,
          );

          let min = 255;
          let max = 0;
          let occupied = 0;
          for (let index = 0; index < chunk.length; index += 1) {
            const value = chunk[index] ?? 0;
            if (value < min) {
              min = value;
            }
            if (value > max) {
              max = value;
            }
            if (value > 0) {
              occupied += 1;
            }
          }
          const chunkIndex = (zChunk * yChunks + yChunk) * xChunks + xChunk;
          chunkMin[chunkIndex] = min;
          chunkMax[chunkIndex] = max;
          chunkOcc[chunkIndex] = chunk.length > 0 ? occupied / chunk.length : 0;
        }
      }
    }

    const histogram = computeUint8VolumeHistogram({
      width: spec.width,
      height: spec.height,
      depth: spec.depth,
      channels: spec.channels,
      normalized: volume,
    });
    await storageHandle.storage.writeFile(
      `${scale.zarr.histogram.path}/${createZarrChunkKeyFromCoords([timepoint, 0])}`,
      encodeUint32ArrayLE(histogram),
    );
    await storageHandle.storage.writeFile(
      `${scale.zarr.chunkStats.min.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
      chunkMin,
    );
    await storageHandle.storage.writeFile(
      `${scale.zarr.chunkStats.max.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
      chunkMax,
    );
    const occupancyBytes = new Uint8Array(chunkOcc.length * 4);
    const occupancyView = new DataView(occupancyBytes.buffer);
    for (let index = 0; index < chunkOcc.length; index += 1) {
      occupancyView.setFloat32(index * 4, chunkOcc[index] ?? 0, true);
    }
    await storageHandle.storage.writeFile(
      `${scale.zarr.chunkStats.occupancy.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
      occupancyBytes,
    );
  }

  return {
    manifest,
    storage: storageHandle.storage,
  };
}

const STRESS_DATASET_SPEC: DatasetSpec = {
  width: 128,
  height: 128,
  depth: 64,
  channels: 2,
  timepoints: 8,
  chunkShape: [1, 16, 32, 32, 2],
};

const sharedDatasetPromise = createSyntheticDataset(STRESS_DATASET_SPEC);

test('performance: nextgen runtime large-volume loading remains within local budget', async () => {
  const { manifest, storage } = await sharedDatasetPromise;
  const provider = createVolumeProvider({
    manifest,
    storage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const startedCold = performance.now();
  await provider.getVolume('layer-a', 0);
  const coldMs = performance.now() - startedCold;

  const startedWarm = performance.now();
  await provider.getVolume('layer-a', 0);
  const warmMs = performance.now() - startedWarm;

  const startedMixed = performance.now();
  await provider.getVolume('layer-a', 1);
  const mixedMs = performance.now() - startedMixed;
  let atlasMs = 0;
  if (typeof provider.getBrickAtlas === 'function') {
    const startedAtlas = performance.now();
    const atlas = await provider.getBrickAtlas('layer-a', 0, { scaleLevel: 0 });
    atlasMs = performance.now() - startedAtlas;
    assert.ok(atlas.enabled);
    assert.ok(atlas.pageTable.occupiedBrickCount > 0);
  }

  const stats = provider.getStats();
  const diagnostics = provider.getDiagnostics();
  const chunkLookups = stats.chunkCacheHits + stats.chunkCacheHitInFlight + stats.chunkCacheMisses;
  const chunkHitRate =
    chunkLookups > 0
      ? (stats.chunkCacheHits + stats.chunkCacheHitInFlight) / chunkLookups
      : 0;

  assert.ok(
    coldMs <= LARGE_VOLUME_COLD_BUDGET_MS,
    `large-volume cold load exceeded budget: ${coldMs.toFixed(2)}ms > ${LARGE_VOLUME_COLD_BUDGET_MS}ms`,
  );
  assert.ok(
    warmMs <= LARGE_VOLUME_WARM_BUDGET_MS,
    `large-volume warm load exceeded budget: ${warmMs.toFixed(2)}ms > ${LARGE_VOLUME_WARM_BUDGET_MS}ms`,
  );
  assert.ok(
    mixedMs <= LARGE_VOLUME_MIXED_BUDGET_MS,
    `large-volume mixed load exceeded budget: ${mixedMs.toFixed(2)}ms > ${LARGE_VOLUME_MIXED_BUDGET_MS}ms`,
  );
  if (typeof provider.getBrickAtlas === 'function') {
    assert.ok(
      atlasMs <= LARGE_VOLUME_ATLAS_BUDGET_MS,
      `large-volume atlas load exceeded budget: ${atlasMs.toFixed(2)}ms > ${LARGE_VOLUME_ATLAS_BUDGET_MS}ms`,
    );
    assert.ok(diagnostics.streaming.cachedPageTables >= 0);
    assert.ok((diagnostics.streaming.scaleRequestCounts['0'] ?? 0) >= 1);
  }
  assert.ok(
    chunkHitRate >= LARGE_VOLUME_HIT_RATE_MIN,
    `large-volume chunk hit rate below budget: ${chunkHitRate.toFixed(3)} < ${LARGE_VOLUME_HIT_RATE_MIN.toFixed(3)}`,
  );
});

test('stability: long playback-style prefetch cancellation leaves no active requests', async () => {
  const { manifest, storage } = await sharedDatasetPromise;
  const provider = createVolumeProvider({
    manifest,
    storage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const prefetchCalls: Promise<void>[] = [];
  let previousController: AbortController | null = null;
  for (let index = 0; index < 24; index += 1) {
    previousController?.abort();
    const controller = new AbortController();
    prefetchCalls.push(
      provider.prefetch(['layer-a'], index % STRESS_DATASET_SPEC.timepoints, {
        policy: 'missing-only',
        reason: 'playback',
        signal: controller.signal,
      }),
    );
    previousController = controller;
  }
  previousController?.abort();
  await Promise.all(prefetchCalls);

  const stats = provider.getStats();
  const diagnostics = provider.getDiagnostics();
  assert.equal(diagnostics.activePrefetchRequests.length, 0);
  assert.equal(stats.prefetchActiveRequests, 0);
  assert.equal(stats.chunkInFlightCount, 0);
  assert.ok(stats.prefetchCalls >= 24);
  assert.ok(stats.prefetchRequestsAborted >= 1);
});
