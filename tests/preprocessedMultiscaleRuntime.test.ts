import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { createZarrChunkKeyFromCoords } from '../src/shared/utils/preprocessedDataset/chunkKey.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest
} from '../src/shared/utils/preprocessedDataset/types.ts';

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
              width: 2,
              height: 1,
              depth: 1,
              channels: 1,
              dataType: 'uint8',
              storedDataType: 'uint8',
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
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 1, 1],
                            min: {
                              path: 'channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/0/min',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: 'channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/0/max',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: 'channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/0/occupancy',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            }
                          }
                        ]
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
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 1, 1],
                            min: {
                              path: 'channels/channel-a/layer-a/scales/1/skip-hierarchy/levels/0/min',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: 'channels/channel-a/layer-a/scales/1/skip-hierarchy/levels/0/max',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            occupancy: {
                              path: 'channels/channel-a/layer-a/scales/1/skip-hierarchy/levels/0/occupancy',
                              shape: [1, 1, 1, 1],
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
      sourceVoxelResolution: { x: 120, y: 120, z: 120, unit: 'nm' },
      storedVoxelResolution: { x: 120, y: 120, z: 120, unit: 'nm' },
      voxelResolution: { x: 120, y: 120, z: 120, unit: 'nm' },
      temporalResolution: { interval: 2.3, unit: 'ms' },
      isotropicResampling: {
        enabled: false,
        scale: { x: 1, y: 1, z: 1 },
        intensityInterpolation: 'linear',
        segmentationInterpolation: 'nearest'
      }
    }
  };
}

async function writeScalePayloads(manifest: PreprocessedManifest, storage: ReturnType<typeof createInMemoryPreprocessedStorage>['storage']) {
  const layer = manifest.dataset.channels[0]!.layers[0]!;
  const scale0 = layer.zarr.scales[0]!;
  const scale1 = layer.zarr.scales[1]!;

  const scale0Data = new Uint8Array([0, 7]);
  const scale1Data = new Uint8Array([7]);

  await storage.writeFile(
    `${scale0.zarr.data.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0, 0])}`,
    new Uint8Array(scale0Data.buffer, scale0Data.byteOffset, scale0Data.byteLength)
  );
  await storage.writeFile(
    `${scale1.zarr.data.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0, 0])}`,
    new Uint8Array(scale1Data.buffer, scale1Data.byteOffset, scale1Data.byteLength)
  );
  await storage.writeFile(
    `${scale0.zarr.skipHierarchy.levels[0]!.min.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([7])
  );
  await storage.writeFile(
    `${scale0.zarr.skipHierarchy.levels[0]!.max.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([7])
  );
  await storage.writeFile(
    `${scale0.zarr.skipHierarchy.levels[0]!.occupancy.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([255])
  );
  await storage.writeFile(
    `${scale1.zarr.skipHierarchy.levels[0]!.min.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([7])
  );
  await storage.writeFile(
    `${scale1.zarr.skipHierarchy.levels[0]!.max.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([7])
  );
  await storage.writeFile(
    `${scale1.zarr.skipHierarchy.levels[0]!.occupancy.path}/${createZarrChunkKeyFromCoords([0, 0, 0, 0])}`,
    new Uint8Array([255])
  );

  return {
    scale0Data,
    scale1Data,
  };
}

test('volume provider resolves requested multiscale intensity values', async () => {
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
  assert.equal(scale0Volume.kind, 'intensity');
  assert.deepEqual(Array.from(scale0Volume.normalized), Array.from(written.scale0Data));

  const scale1Volume = await provider.getVolume('layer-a', 0, { scaleLevel: 1 });
  assert.equal(scale1Volume.scaleLevel, 1);
  assert.equal(scale1Volume.width, 1);
  assert.equal(scale1Volume.kind, 'intensity');
  assert.deepEqual(Array.from(scale1Volume.normalized), Array.from(written.scale1Data));

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
