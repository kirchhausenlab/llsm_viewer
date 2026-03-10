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
import {
  buildBrickSubcellChunkData,
  buildBrickSubcellTextureSize,
  resolveBrickSubcellGrid,
  writeBrickSubcellChunkData,
} from '../../src/shared/utils/brickSubcell.ts';
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

type HierarchyLevelBuffers = {
  gridShape: [number, number, number];
  min: Uint8Array;
  max: Uint8Array;
  occupancy: Uint8Array;
};

function buildHierarchyGridShapes(leafGridShape: [number, number, number]): [number, number, number][] {
  const levels: [number, number, number][] = [[...leafGridShape] as [number, number, number]];
  while (true) {
    const [z, y, x] = levels[levels.length - 1]!;
    if (z === 1 && y === 1 && x === 1) {
      break;
    }
    levels.push([
      Math.max(1, Math.ceil(z / 2)),
      Math.max(1, Math.ceil(y / 2)),
      Math.max(1, Math.ceil(x / 2)),
    ]);
  }
  return levels;
}

function reduceHierarchyLevel(child: HierarchyLevelBuffers): HierarchyLevelBuffers {
  const [childZ, childY, childX] = child.gridShape;
  const parentGridShape: [number, number, number] = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2)),
  ];
  const [parentZ, parentY, parentX] = parentGridShape;
  const parentCount = parentZ * parentY * parentX;
  const parentMin = new Uint8Array(parentCount);
  const parentMax = new Uint8Array(parentCount);
  const parentOccupancy = new Uint8Array(parentCount);
  const childPlane = childY * childX;
  const parentPlane = parentY * parentX;

  for (let z = 0; z < parentZ; z += 1) {
    for (let y = 0; y < parentY; y += 1) {
      for (let x = 0; x < parentX; x += 1) {
        const parentIndex = z * parentPlane + y * parentX + x;
        const childZStart = z * 2;
        const childYStart = y * 2;
        const childXStart = x * 2;
        let occupied = false;
        let localMin = 255;
        let localMax = 0;

        for (let localZ = 0; localZ < 2; localZ += 1) {
          const sourceZ = childZStart + localZ;
          if (sourceZ >= childZ) {
            continue;
          }
          for (let localY = 0; localY < 2; localY += 1) {
            const sourceY = childYStart + localY;
            if (sourceY >= childY) {
              continue;
            }
            for (let localX = 0; localX < 2; localX += 1) {
              const sourceX = childXStart + localX;
              if (sourceX >= childX) {
                continue;
              }
              const childIndex = sourceZ * childPlane + sourceY * childX + sourceX;
              if ((child.occupancy[childIndex] ?? 0) === 0) {
                continue;
              }
              occupied = true;
              const childMin = child.min[childIndex] ?? 0;
              const childMax = child.max[childIndex] ?? 0;
              if (childMin < localMin) {
                localMin = childMin;
              }
              if (childMax > localMax) {
                localMax = childMax;
              }
            }
          }
        }

        if (!occupied) {
          parentOccupancy[parentIndex] = 0;
          parentMin[parentIndex] = 0;
          parentMax[parentIndex] = 0;
          continue;
        }
        parentOccupancy[parentIndex] = 255;
        parentMin[parentIndex] = localMin;
        parentMax[parentIndex] = localMax;
      }
    }
  }

  return {
    gridShape: parentGridShape,
    min: parentMin,
    max: parentMax,
    occupancy: parentOccupancy,
  };
}

function buildHierarchyLevelsFromLeaf(
  leafGridShape: [number, number, number],
  leafMin: Uint8Array,
  leafMax: Uint8Array,
  leafOccupancy: Uint8Array,
  levelCount: number,
): HierarchyLevelBuffers[] {
  const levels: HierarchyLevelBuffers[] = [
    {
      gridShape: leafGridShape,
      min: leafMin,
      max: leafMax,
      occupancy: leafOccupancy,
    },
  ];
  while (levels.length < levelCount) {
    levels.push(reduceHierarchyLevel(levels[levels.length - 1]!));
  }
  return levels;
}

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
  const hierarchyGridShapes = buildHierarchyGridShapes([zChunks, yChunks, xChunks]);
  const subcellGrid = resolveBrickSubcellGrid([chunkShape[1], chunkShape[2], chunkShape[3]]);
  const subcellTextureSize =
    subcellGrid
      ? buildBrickSubcellTextureSize({
          gridShape: [zChunks, yChunks, xChunks],
          subcellGrid
        })
      : null;

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
                      skipHierarchy: {
                        levels: hierarchyGridShapes.map((gridShape, level) => ({
                          level,
                          gridShape,
                          min: {
                            path: `channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/${level}/min`,
                            shape: [timepoints, gridShape[0], gridShape[1], gridShape[2]],
                            chunkShape: [1, gridShape[0], gridShape[1], gridShape[2]],
                            dataType: 'uint8',
                          },
                          max: {
                            path: `channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/${level}/max`,
                            shape: [timepoints, gridShape[0], gridShape[1], gridShape[2]],
                            chunkShape: [1, gridShape[0], gridShape[1], gridShape[2]],
                            dataType: 'uint8',
                          },
                          occupancy: {
                            path: `channels/channel-a/layer-a/scales/0/skip-hierarchy/levels/${level}/occupancy`,
                            shape: [timepoints, gridShape[0], gridShape[1], gridShape[2]],
                            chunkShape: [1, gridShape[0], gridShape[1], gridShape[2]],
                            dataType: 'uint8',
                          },
                        })),
                      },
                      ...(subcellGrid && subcellTextureSize
                        ? {
                            subcell: {
                              gridShape: [subcellGrid.z, subcellGrid.y, subcellGrid.x] as [number, number, number],
                              data: {
                                path: 'channels/channel-a/layer-a/scales/0/subcell',
                                shape: [
                                  timepoints,
                                  subcellTextureSize.depth,
                                  subcellTextureSize.height,
                                  subcellTextureSize.width,
                                  4,
                                ],
                                chunkShape: [
                                  1,
                                  subcellTextureSize.depth,
                                  subcellTextureSize.height,
                                  subcellTextureSize.width,
                                  4,
                                ],
                                dataType: 'uint8',
                              },
                            },
                          }
                        : {}),
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
      voxelResolution: { x: 120, y: 120, z: 300, unit: 'nm', correctAnisotropy: false },
      temporalResolution: { interval: 2.3, unit: 'ms' },
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
  const histogramDescriptor = scale.zarr.histogram;
  assert.ok(histogramDescriptor);

  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  await zarr.create(root.resolve(scale.zarr.data.path), {
    shape: scale.zarr.data.shape,
    data_type: scale.zarr.data.dataType,
    chunk_shape: scale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  await zarr.create(root.resolve(histogramDescriptor.path), {
    shape: histogramDescriptor.shape,
    data_type: histogramDescriptor.dataType,
    chunk_shape: histogramDescriptor.chunkShape,
    codecs: [],
    fill_value: 0,
  });
  if (scale.zarr.subcell) {
    await zarr.create(root.resolve(scale.zarr.subcell.data.path), {
      shape: scale.zarr.subcell.data.shape,
      data_type: scale.zarr.subcell.data.dataType,
      chunk_shape: scale.zarr.subcell.data.chunkShape,
      codecs: [],
      fill_value: 0,
    });
  }
  for (const hierarchy of scale.zarr.skipHierarchy.levels) {
    await zarr.create(root.resolve(hierarchy.min.path), {
      shape: hierarchy.min.shape,
      data_type: hierarchy.min.dataType,
      chunk_shape: hierarchy.min.chunkShape,
      codecs: [],
      fill_value: 0,
    });
    await zarr.create(root.resolve(hierarchy.max.path), {
      shape: hierarchy.max.shape,
      data_type: hierarchy.max.dataType,
      chunk_shape: hierarchy.max.chunkShape,
      codecs: [],
      fill_value: 0,
    });
    await zarr.create(root.resolve(hierarchy.occupancy.path), {
      shape: hierarchy.occupancy.shape,
      data_type: hierarchy.occupancy.dataType,
      chunk_shape: hierarchy.occupancy.chunkShape,
      codecs: [],
      fill_value: 0,
    });
  }

  const [, chunkDepth, chunkHeight, chunkWidth] = scale.zarr.data.chunkShape;
  const zChunks = Math.ceil(spec.depth / chunkDepth);
  const yChunks = Math.ceil(spec.height / chunkHeight);
  const xChunks = Math.ceil(spec.width / chunkWidth);
  const subcellGrid = scale.zarr.subcell
    ? {
        x: scale.zarr.subcell.gridShape[2],
        y: scale.zarr.subcell.gridShape[1],
        z: scale.zarr.subcell.gridShape[0],
      }
    : null;
  const subcellTextureSize =
    scale.zarr.subcell && subcellGrid
      ? buildBrickSubcellTextureSize({
          gridShape: [zChunks, yChunks, xChunks],
          subcellGrid
        })
      : null;

  for (let timepoint = 0; timepoint < spec.timepoints; timepoint += 1) {
    const volume = fillDeterministicVolume(spec, timepoint);
    const chunkMin = new Uint8Array(zChunks * yChunks * xChunks);
    const chunkMax = new Uint8Array(zChunks * yChunks * xChunks);
    const chunkOcc = new Uint8Array(zChunks * yChunks * xChunks);
    const subcellTexture = subcellTextureSize
      ? new Uint8Array(subcellTextureSize.width * subcellTextureSize.height * subcellTextureSize.depth * 4)
      : null;

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
          chunkOcc[chunkIndex] = occupied > 0 ? 255 : 0;
          if (subcellTexture && subcellGrid) {
            const subcellChunk = buildBrickSubcellChunkData({
              chunkShape: [chunkDepth, chunkHeight, chunkWidth],
              components: spec.channels,
              readVoxelComponent: (localZ, localY, localX, component) => {
                if (localZ < 0 || localZ >= zLength || localY < 0 || localY >= yLength || localX < 0 || localX >= xLength) {
                  return 0;
                }
                const sourceIndex = (((localZ * yLength + localY) * xLength + localX) * spec.channels) + component;
                return chunk[sourceIndex] ?? 0;
              }
            });
            assert.ok(subcellChunk);
            writeBrickSubcellChunkData({
              targetData: subcellTexture,
              targetSize: subcellTextureSize as { width: number; height: number; depth: number },
              brickCoords: { x: xChunk, y: yChunk, z: zChunk },
              chunkData: subcellChunk.data,
              subcellGrid: subcellChunk.subcellGrid
            });
          }
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
      `${histogramDescriptor.path}/${createZarrChunkKeyFromCoords([timepoint, 0])}`,
      encodeUint32ArrayLE(histogram),
    );
    const hierarchyLevels = buildHierarchyLevelsFromLeaf(
      [zChunks, yChunks, xChunks],
      chunkMin,
      chunkMax,
      chunkOcc,
      scale.zarr.skipHierarchy.levels.length,
    );
    for (let level = 0; level < scale.zarr.skipHierarchy.levels.length; level += 1) {
      const descriptor = scale.zarr.skipHierarchy.levels[level]!;
      const hierarchy = hierarchyLevels[level]!;
      await storageHandle.storage.writeFile(
        `${descriptor.min.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        hierarchy.min,
      );
      await storageHandle.storage.writeFile(
        `${descriptor.max.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        hierarchy.max,
      );
      await storageHandle.storage.writeFile(
        `${descriptor.occupancy.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        hierarchy.occupancy,
      );
    }
    if (scale.zarr.subcell && subcellTexture) {
      await storageHandle.storage.writeFile(
        `${scale.zarr.subcell.data.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0, 0])}`,
        subcellTexture,
      );
    }
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
    assert.ok(atlas.pageTable.subcell);
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

test('stability: rapid scrub-playback scale transitions keep diagnostics coherent', async () => {
  const { manifest, storage } = await sharedDatasetPromise;
  const provider = createVolumeProvider({
    manifest,
    storage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS,
  });

  const totalTimepoints = STRESS_DATASET_SPEC.timepoints;
  const availableScaleLevels = (
    manifest.dataset.channels[0]?.layers[0]?.zarr.scales.map((scale) => scale.level) ?? [0]
  ).filter((level, index, source) => Number.isFinite(level) && source.indexOf(level) === index);
  const orderedScaleLevels = availableScaleLevels.length > 0 ? availableScaleLevels : [0];
  for (let step = 0; step < 20; step += 1) {
    const timepoint = step % totalTimepoints;
    const targetScaleLevel = orderedScaleLevels[step % orderedScaleLevels.length] ?? 0;
    await provider.prefetch(['layer-a'], timepoint, {
      policy: 'missing-only',
      reason: step % 3 === 0 ? 'interactive' : 'playback',
      scaleLevels: [targetScaleLevel]
    });
    await provider.getVolume('layer-a', timepoint, { scaleLevel: targetScaleLevel });
    if (typeof provider.getBrickAtlas === 'function') {
      await provider.getBrickAtlas('layer-a', timepoint, { scaleLevel: targetScaleLevel });
    }
  }

  const diagnostics = provider.getDiagnostics();
  const stats = provider.getStats();
  assert.equal(diagnostics.activePrefetchRequests.length, 0);
  assert.equal(stats.prefetchActiveRequests, 0);
  assert.equal(stats.chunkInFlightCount, 0);
  assert.ok((diagnostics.streaming.scaleRequestCounts['0'] ?? 0) > 0);
  if (orderedScaleLevels.includes(1)) {
    assert.ok((diagnostics.streaming.scaleRequestCounts['1'] ?? 0) > 0);
  }
});
