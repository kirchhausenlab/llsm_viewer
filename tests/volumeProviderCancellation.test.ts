import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  DEFAULT_MAX_CACHED_VOLUMES
} from '../src/core/volumeProvider.ts';
import type { PreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { createZarrChunkKeyFromCoords } from '../src/shared/utils/preprocessedDataset/chunkKey.ts';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE, HISTOGRAM_BINS } from '../src/shared/utils/histogram.ts';
import { PREPROCESSED_DATASET_FORMAT, type PreprocessedManifest } from '../src/shared/utils/preprocessedDataset/types.ts';

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
              isSegmentation: false,
              volumeCount: 1,
              width: 1,
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
                    width: 1,
                    height: 1,
                    depth: 1,
                    channels: 1,
                    zarr: {
                      data: {
                        path: 'channels/channel-a/layer-a/scales/0/data',
                        shape: [1, 1, 1, 1, 1],
                        chunkShape: [1, 1, 1, 1, 1],
                        dataType: 'uint8'
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

function createDelayedStorage(files: Map<string, Uint8Array>, delayMs: number): PreprocessedStorage {
  return {
    async writeFile(path, data) {
      files.set(path, data.slice());
    },
    async readFile(path) {
      const bytes = files.get(path);
      if (!bytes) {
        throw new Error(`Missing storage payload for ${path}`);
      }
      return new Promise<Uint8Array>((resolve) => {
        setTimeout(() => resolve(bytes.slice()), delayMs);
      });
    }
  };
}

test('volume provider allows aborting a caller without poisoning shared in-flight load', async () => {
  const manifest = buildManifest();
  const scale = manifest.dataset.channels[0]!.layers[0]!.zarr.scales[0]!;
  const voxel = new Uint8Array([42]);
  const histogram = computeUint8VolumeHistogram({
    width: 1,
    height: 1,
    depth: 1,
    channels: 1,
    normalized: voxel
  });

  const files = new Map<string, Uint8Array>();
  files.set(`${scale.zarr.data.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0, 0])}`, voxel);
  files.set(`${scale.zarr.histogram.path}/${createZarrChunkKeyFromCoords([0, 0])}`, encodeUint32ArrayLE(histogram));

  const provider = createVolumeProvider({
    manifest,
    storage: createDelayedStorage(files, 30),
    maxCachedVolumes: DEFAULT_MAX_CACHED_VOLUMES,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const controller = new AbortController();
  const abortedLoad = provider.getVolume('layer-a', 0, { signal: controller.signal });
  controller.abort();

  await assert.rejects(
    () => abortedLoad,
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 90);
  });

  const recovered = await provider.getVolume('layer-a', 0);
  assert.deepEqual(Array.from(recovered.normalized), [42]);
});
