import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import * as zarr from 'zarrita';

import { createVolumeProvider } from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import {
  assertBenchmarkMatrixApprovedForThresholdEnforcement,
  BENCHMARK_ATLAS_STEP_LABELS,
  BENCHMARK_LOAD_STEP_LABELS,
  normalizeBenchmarkMatrixConfig,
  type BenchmarkAcceptance,
  type BenchmarkAtlasStepLabel,
  type BenchmarkDatasetSpec,
  type BenchmarkLoadStepLabel,
  type BenchmarkMatrixCase,
  type BenchmarkMatrixConfig
} from '../src/shared/utils/benchmarkMatrix.ts';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE } from '../src/shared/utils/histogram.ts';
import { createZarrChunkKeyFromCoords } from '../src/shared/utils/preprocessedDataset/chunkKey.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest
} from '../src/shared/utils/preprocessedDataset/types.ts';
import { createZarrStoreFromPreprocessedStorage } from '../src/shared/utils/zarrStore.ts';

type BenchmarkCaseLoadStepReport = {
  label: BenchmarkLoadStepLabel;
  elapsedMs: number;
  normalizedBytes: number;
};

type BenchmarkCaseAtlasStepReport = {
  label: BenchmarkAtlasStepLabel;
  elapsedMs: number;
  atlasBytes: number;
  residentBricks: number;
};

type BenchmarkRuntimeOverrides = {
  maxCachedChunkBytes?: number;
  maxConcurrentChunkReads?: number;
  maxConcurrentPrefetchLoads?: number;
  chunkSpatial?: [number, number, number];
};

type BenchmarkCaseReport = {
  caseId: string;
  caseName: string;
  tierId: string;
  dataset: BenchmarkDatasetSpec;
  generationMs: number;
  loadSteps: BenchmarkCaseLoadStepReport[];
  atlasSteps: BenchmarkCaseAtlasStepReport[];
  providerStats: ReturnType<ReturnType<typeof createVolumeProvider>['getStats']>;
  acceptance: {
    passed: boolean;
    failures: string[];
    thresholds: BenchmarkAcceptance;
    observed: {
      chunkHitRate: number;
      scale1Requests: number;
    };
  };
};

type BenchmarkMatrixReport = {
  generatedAt: string;
  matrixConfigPath: string;
  matrixVersion: string;
  matrixApproval: BenchmarkMatrixConfig['approval'];
  environment: {
    platform: string;
    arch: string;
    nodeVersion: string;
    cpus: number;
    cpuModel: string;
    runtimeOverrides: {
      maxCachedChunkBytes?: number;
      maxConcurrentChunkReads?: number;
      maxConcurrentPrefetchLoads?: number;
      chunkSpatial?: [number, number, number];
    };
  };
  cases: BenchmarkCaseReport[];
  summary: {
    totalCases: number;
    passedCases: number;
    failedCases: number;
  };
};

const DEFAULT_OUTPUT_PATH = 'docs/refactor-nextgen-volume/BASELINE_REPORT.json';
const DEFAULT_MATRIX_CONFIG_PATH = 'docs/refactor-nextgen-volume/BENCHMARK_MATRIX.json';
const DEFAULT_PROVIDER_MAX_CACHED_CHUNK_BYTES = 64 * 1024 * 1024;
const DEFAULT_PROVIDER_MAX_CONCURRENT_CHUNK_READS = 10;
const DEFAULT_PROVIDER_MAX_CONCURRENT_PREFETCH_LOADS = 4;

function readOptionalPositiveIntegerEnv(key: string): number | undefined {
  const raw = process.env[key];
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${key} value: "${raw}"`);
  }
  return Math.max(1, Math.floor(parsed));
}

function readOptionalPositiveIntegerTupleEnv(
  key: string,
  expectedLength: number,
): number[] | undefined {
  const raw = process.env[key]?.trim();
  if (!raw) {
    return undefined;
  }
  const values = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => Number(entry));
  if (values.length !== expectedLength) {
    throw new Error(`Invalid ${key} value: expected ${expectedLength} comma-separated integers.`);
  }
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid ${key} value: "${raw}"`);
    }
  }
  return values.map((value) => Math.max(1, Math.floor(value)));
}

function clampChunkSpatialToDataset({
  dataset,
  chunkSpatial,
}: {
  dataset: BenchmarkDatasetSpec;
  chunkSpatial: [number, number, number];
}): [number, number, number] {
  return [
    Math.min(dataset.depth, chunkSpatial[0]),
    Math.min(dataset.height, chunkSpatial[1]),
    Math.min(dataset.width, chunkSpatial[2]),
  ];
}

function resolveRuntimeOverrides(): BenchmarkRuntimeOverrides {
  const maxCachedChunkBytes = readOptionalPositiveIntegerEnv('BENCHMARK_MAX_CACHED_CHUNK_BYTES');
  const maxConcurrentChunkReads = readOptionalPositiveIntegerEnv('BENCHMARK_MAX_CONCURRENT_CHUNK_READS');
  const maxConcurrentPrefetchLoads = readOptionalPositiveIntegerEnv(
    'BENCHMARK_MAX_CONCURRENT_PREFETCH_LOADS'
  );
  const chunkSpatial = readOptionalPositiveIntegerTupleEnv('BENCHMARK_CHUNK_SPATIAL', 3) as
    | [number, number, number]
    | undefined;
  return {
    ...(maxCachedChunkBytes ? { maxCachedChunkBytes } : {}),
    ...(maxConcurrentChunkReads ? { maxConcurrentChunkReads } : {}),
    ...(maxConcurrentPrefetchLoads ? { maxConcurrentPrefetchLoads } : {}),
    ...(chunkSpatial ? { chunkSpatial } : {}),
  };
}

function resolveDatasetForRun(
  dataset: BenchmarkDatasetSpec,
  overrides: BenchmarkRuntimeOverrides,
): BenchmarkDatasetSpec {
  if (!overrides.chunkSpatial) {
    return dataset;
  }
  const chunkSpatial = clampChunkSpatialToDataset({ dataset, chunkSpatial: overrides.chunkSpatial });
  return {
    ...dataset,
    chunkShape: [1, chunkSpatial[0], chunkSpatial[1], chunkSpatial[2], dataset.channels],
  };
}

function fillDeterministicVolume(dataset: BenchmarkDatasetSpec, timepoint: number): Uint8Array {
  const { width, height, depth, channels } = dataset;
  const data = new Uint8Array(width * height * depth * channels);
  for (let z = 0; z < depth; z += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const voxelBase = ((z * height + y) * width + x) * channels;
        for (let c = 0; c < channels; c += 1) {
          data[voxelBase + c] = (x * 3 + y * 5 + z * 7 + c * 13 + timepoint * 11) % 256;
        }
      }
    }
  }
  return data;
}

function extractChunk({
  width,
  height,
  channels,
  source,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength
}: {
  width: number;
  height: number;
  channels: number;
  source: Uint8Array;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
}): Uint8Array {
  const rowStride = width * channels;
  const planeStride = height * rowStride;
  const lineLength = xLength * channels;
  const chunk = new Uint8Array(zLength * yLength * lineLength);

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart * channels;
      chunk.set(source.subarray(sourceOffset, sourceOffset + lineLength), destinationOffset);
      destinationOffset += lineLength;
    }
  }

  return chunk;
}

async function timed<T>(
  label: BenchmarkLoadStepLabel | BenchmarkAtlasStepLabel | 'generate_dataset',
  fn: () => Promise<T>
) {
  const start = performance.now();
  const value = await fn();
  return {
    label,
    value,
    elapsedMs: performance.now() - start
  };
}

type SyntheticScaleSpec = {
  level: number;
  downsampleFactor: [number, number, number];
  width: number;
  height: number;
  depth: number;
  channels: number;
  chunkDepth: number;
  chunkHeight: number;
  chunkWidth: number;
};

function downsampleVolumeByMaxPool2({
  source,
  width,
  height,
  depth,
  channels
}: {
  source: Uint8Array;
  width: number;
  height: number;
  depth: number;
  channels: number;
}): { data: Uint8Array; width: number; height: number; depth: number } {
  const nextDepth = Math.max(1, Math.ceil(depth / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const downsampled = new Uint8Array(nextDepth * nextHeight * nextWidth * channels);

  for (let z = 0; z < nextDepth; z += 1) {
    for (let y = 0; y < nextHeight; y += 1) {
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceZStart = z * 2;
        const sourceYStart = y * 2;
        const sourceXStart = x * 2;
        const destinationBase = ((z * nextHeight + y) * nextWidth + x) * channels;
        for (let channel = 0; channel < channels; channel += 1) {
          let maxValue = 0;
          for (let localZ = 0; localZ < 2; localZ += 1) {
            const sourceZ = sourceZStart + localZ;
            if (sourceZ >= depth) {
              continue;
            }
            for (let localY = 0; localY < 2; localY += 1) {
              const sourceY = sourceYStart + localY;
              if (sourceY >= height) {
                continue;
              }
              for (let localX = 0; localX < 2; localX += 1) {
                const sourceX = sourceXStart + localX;
                if (sourceX >= width) {
                  continue;
                }
                const sourceOffset = ((sourceZ * height + sourceY) * width + sourceX) * channels + channel;
                const value = source[sourceOffset] ?? 0;
                if (value > maxValue) {
                  maxValue = value;
                }
              }
            }
          }
          downsampled[destinationBase + channel] = maxValue;
        }
      }
    }
  }

  return {
    data: downsampled,
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth
  };
}

function buildSyntheticScaleSpecs(dataset: BenchmarkDatasetSpec): SyntheticScaleSpec[] {
  const baseChunkDepth = dataset.chunkShape[1];
  const baseChunkHeight = dataset.chunkShape[2];
  const baseChunkWidth = dataset.chunkShape[3];
  const scale1Depth = Math.max(1, Math.ceil(dataset.depth / 2));
  const scale1Height = Math.max(1, Math.ceil(dataset.height / 2));
  const scale1Width = Math.max(1, Math.ceil(dataset.width / 2));

  return [
    {
      level: 0,
      downsampleFactor: [1, 1, 1],
      width: dataset.width,
      height: dataset.height,
      depth: dataset.depth,
      channels: dataset.channels,
      chunkDepth: baseChunkDepth,
      chunkHeight: baseChunkHeight,
      chunkWidth: baseChunkWidth
    },
    {
      level: 1,
      downsampleFactor: [
        scale1Depth < dataset.depth ? 2 : 1,
        scale1Height < dataset.height ? 2 : 1,
        scale1Width < dataset.width ? 2 : 1
      ],
      width: scale1Width,
      height: scale1Height,
      depth: scale1Depth,
      channels: dataset.channels,
      chunkDepth: Math.max(1, Math.min(baseChunkDepth, scale1Depth)),
      chunkHeight: Math.max(1, Math.min(baseChunkHeight, scale1Height)),
      chunkWidth: Math.max(1, Math.min(baseChunkWidth, scale1Width))
    }
  ];
}

function buildManifest(dataset: BenchmarkDatasetSpec): PreprocessedManifest {
  const { channels, timepoints } = dataset;
  const scales = buildSyntheticScaleSpecs(dataset);

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
          trackSets: [],
          layers: [
            {
              key: 'layer-a',
              label: 'Layer A',
              channelId: 'channel-a',
              isSegmentation: false,
              volumeCount: timepoints,
              width: dataset.width,
              height: dataset.height,
              depth: dataset.depth,
              channels,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                scales: scales.map((scale) => {
                  const zChunks = Math.ceil(scale.depth / scale.chunkDepth);
                  const yChunks = Math.ceil(scale.height / scale.chunkHeight);
                  const xChunks = Math.ceil(scale.width / scale.chunkWidth);
                  return {
                    level: scale.level,
                    downsampleFactor: scale.downsampleFactor,
                    width: scale.width,
                    height: scale.height,
                    depth: scale.depth,
                    channels: scale.channels,
                    zarr: {
                      data: {
                        path: `channels/channel-a/layer-a/scales/${scale.level}/data`,
                        shape: [timepoints, scale.depth, scale.height, scale.width, channels],
                        chunkShape: [1, scale.chunkDepth, scale.chunkHeight, scale.chunkWidth, channels],
                        dataType: 'uint8'
                      },
                      histogram: {
                        path: `channels/channel-a/layer-a/scales/${scale.level}/histogram`,
                        shape: [timepoints, 256],
                        chunkShape: [1, 256],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: `channels/channel-a/layer-a/scales/${scale.level}/chunk-stats/min`,
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'uint8'
                        },
                        max: {
                          path: `channels/channel-a/layer-a/scales/${scale.level}/chunk-stats/max`,
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: `channels/channel-a/layer-a/scales/${scale.level}/chunk-stats/occupancy`,
                          shape: [timepoints, zChunks, yChunks, xChunks],
                          chunkShape: [1, zChunks, yChunks, xChunks],
                          dataType: 'float32'
                        }
                      }
                    }
                  };
                })
              }
            }
          ]
        }
      ],
      voxelResolution: { x: 1, y: 1, z: 1, unit: 'μm', correctAnisotropy: false },
      anisotropyCorrection: null
    }
  };
}

async function createSyntheticPreprocessedDataset(
  dataset: BenchmarkDatasetSpec,
  options: { datasetId: string }
) {
  const manifest = buildManifest(dataset);
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: options.datasetId });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);
  const root = zarr.root(zarrStore);
  const layer = manifest.dataset.channels[0]!.layers[0]!;

  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  for (const scale of layer.zarr.scales) {
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
    await zarr.create(root.resolve(scale.zarr.chunkStats.min.path), {
      shape: scale.zarr.chunkStats.min.shape,
      data_type: scale.zarr.chunkStats.min.dataType,
      chunk_shape: scale.zarr.chunkStats.min.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(root.resolve(scale.zarr.chunkStats.max.path), {
      shape: scale.zarr.chunkStats.max.shape,
      data_type: scale.zarr.chunkStats.max.dataType,
      chunk_shape: scale.zarr.chunkStats.max.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(root.resolve(scale.zarr.chunkStats.occupancy.path), {
      shape: scale.zarr.chunkStats.occupancy.shape,
      data_type: scale.zarr.chunkStats.occupancy.dataType,
      chunk_shape: scale.zarr.chunkStats.occupancy.chunkShape,
      codecs: [],
      fill_value: 0
    });
  }

  for (let timepoint = 0; timepoint < dataset.timepoints; timepoint += 1) {
    const scale0Data = fillDeterministicVolume(dataset, timepoint);
    const downsampledScale1 = downsampleVolumeByMaxPool2({
      source: scale0Data,
      width: dataset.width,
      height: dataset.height,
      depth: dataset.depth,
      channels: dataset.channels
    });
    const volumesByScale = new Map<number, { width: number; height: number; depth: number; data: Uint8Array }>([
      [0, { width: dataset.width, height: dataset.height, depth: dataset.depth, data: scale0Data }],
      [1, downsampledScale1]
    ]);

    for (const scale of layer.zarr.scales) {
      const scaleVolume = volumesByScale.get(scale.level);
      if (!scaleVolume) {
        continue;
      }
      const [, chunkDepth, chunkHeight, chunkWidth] = scale.zarr.data.chunkShape;
      const zChunks = Math.ceil(scaleVolume.depth / chunkDepth);
      const yChunks = Math.ceil(scaleVolume.height / chunkHeight);
      const xChunks = Math.ceil(scaleVolume.width / chunkWidth);
      const chunkMin = new Uint8Array(zChunks * yChunks * xChunks);
      const chunkMax = new Uint8Array(zChunks * yChunks * xChunks);
      const chunkOcc = new Float32Array(zChunks * yChunks * xChunks);

      for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
        const zStart = zChunk * chunkDepth;
        const zLength = Math.min(chunkDepth, scaleVolume.depth - zStart);
        for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
          const yStart = yChunk * chunkHeight;
          const yLength = Math.min(chunkHeight, scaleVolume.height - yStart);
          for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
            const xStart = xChunk * chunkWidth;
            const xLength = Math.min(chunkWidth, scaleVolume.width - xStart);
            const chunk = extractChunk({
              width: scaleVolume.width,
              height: scaleVolume.height,
              channels: dataset.channels,
              source: scaleVolume.data,
              zStart,
              zLength,
              yStart,
              yLength,
              xStart,
              xLength
            });
            await storageHandle.storage.writeFile(
              `${scale.zarr.data.path}/${createZarrChunkKeyFromCoords([timepoint, zChunk, yChunk, xChunk, 0])}`,
              chunk
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
        width: scaleVolume.width,
        height: scaleVolume.height,
        depth: scaleVolume.depth,
        channels: dataset.channels,
        normalized: scaleVolume.data
      });
      await storageHandle.storage.writeFile(
        `${scale.zarr.histogram.path}/${createZarrChunkKeyFromCoords([timepoint, 0])}`,
        encodeUint32ArrayLE(histogram)
      );
      await storageHandle.storage.writeFile(
        `${scale.zarr.chunkStats.min.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        chunkMin
      );
      await storageHandle.storage.writeFile(
        `${scale.zarr.chunkStats.max.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        chunkMax
      );
      const occupancyBytes = new Uint8Array(chunkOcc.length * 4);
      const occupancyView = new DataView(occupancyBytes.buffer);
      for (let index = 0; index < chunkOcc.length; index += 1) {
        occupancyView.setFloat32(index * 4, chunkOcc[index] ?? 0, true);
      }
      await storageHandle.storage.writeFile(
        `${scale.zarr.chunkStats.occupancy.path}/${createZarrChunkKeyFromCoords([timepoint, 0, 0, 0])}`,
        occupancyBytes
      );
    }
  }

  return { manifest, storage: storageHandle.storage };
}

function evaluateCaseAcceptance({
  benchmarkCase,
  generationMs,
  loadSteps,
  atlasSteps,
  providerStats,
  scale1Requests
}: {
  benchmarkCase: BenchmarkMatrixCase;
  generationMs: number;
  loadSteps: BenchmarkCaseLoadStepReport[];
  atlasSteps: BenchmarkCaseAtlasStepReport[];
  providerStats: ReturnType<ReturnType<typeof createVolumeProvider>['getStats']>;
  scale1Requests: number;
}): { passed: boolean; failures: string[]; chunkHitRate: number; scale1Requests: number } {
  const failures: string[] = [];
  const thresholds = benchmarkCase.acceptance;

  if (generationMs > thresholds.generationMaxMs) {
    failures.push(
      `generationMs ${generationMs.toFixed(2)} > max ${thresholds.generationMaxMs.toFixed(2)}`
    );
  }

  for (const label of BENCHMARK_LOAD_STEP_LABELS) {
    const maxMs = thresholds.loadStepMaxMs[label];
    const step = loadSteps.find((entry) => entry.label === label);
    if (!step) {
      failures.push(`missing step "${label}"`);
      continue;
    }
    if (step.elapsedMs > maxMs) {
      failures.push(`${label} ${step.elapsedMs.toFixed(2)}ms > max ${maxMs.toFixed(2)}ms`);
    }
  }

  for (const label of BENCHMARK_ATLAS_STEP_LABELS) {
    const maxMs = thresholds.atlasStepMaxMs[label];
    const step = atlasSteps.find((entry) => entry.label === label);
    if (!step) {
      failures.push(`missing step "${label}"`);
      continue;
    }
    if (step.elapsedMs > maxMs) {
      failures.push(`${label} ${step.elapsedMs.toFixed(2)}ms > max ${maxMs.toFixed(2)}ms`);
    }
  }

  const chunkLookups =
    providerStats.chunkCacheHits + providerStats.chunkCacheHitInFlight + providerStats.chunkCacheMisses;
  const chunkHitRate =
    chunkLookups > 0
      ? (providerStats.chunkCacheHits + providerStats.chunkCacheHitInFlight) / chunkLookups
      : 1;
  if (chunkHitRate < thresholds.chunkHitRateMin) {
    failures.push(
      `chunkHitRate ${chunkHitRate.toFixed(3)} < min ${thresholds.chunkHitRateMin.toFixed(3)}`
    );
  }
  if (scale1Requests < thresholds.scale1RequestMin) {
    failures.push(
      `scale1Requests ${scale1Requests.toFixed(0)} < min ${thresholds.scale1RequestMin.toFixed(0)}`
    );
  }

  return {
    passed: failures.length === 0,
    failures,
    chunkHitRate,
    scale1Requests
  };
}

async function runBenchmarkCase(
  benchmarkCase: BenchmarkMatrixCase,
  overrides: BenchmarkRuntimeOverrides,
): Promise<BenchmarkCaseReport> {
  const dataset = resolveDatasetForRun(benchmarkCase.dataset, overrides);
  const generation = await timed('generate_dataset', async () =>
    createSyntheticPreprocessedDataset(dataset, { datasetId: `benchmark-${benchmarkCase.id}` })
  );
  const provider = createVolumeProvider({
    manifest: generation.value.manifest,
    storage: generation.value.storage,
    maxCachedVolumes: 0,
    maxCachedChunkBytes: overrides.maxCachedChunkBytes ?? DEFAULT_PROVIDER_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: overrides.maxConcurrentChunkReads ?? DEFAULT_PROVIDER_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads:
      overrides.maxConcurrentPrefetchLoads ?? DEFAULT_PROVIDER_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const t1Timepoint = Math.min(benchmarkCase.dataset.timepoints - 1, 1);
  const firstLoad = await timed('volume_t0_cold', async () => provider.getVolume('layer-a', 0));
  const secondLoad = await timed('volume_t0_chunk_warm', async () => provider.getVolume('layer-a', 0));
  const thirdLoad = await timed('volume_t1_mixed_cache', async () => provider.getVolume('layer-a', t1Timepoint));
  if (typeof provider.getBrickAtlas !== 'function') {
    throw new Error('Volume provider does not expose getBrickAtlas; benchmark requires atlas streaming APIs.');
  }
  const atlasScale0 = await timed('atlas_t0_scale0', async () =>
    provider.getBrickAtlas!('layer-a', 0, { scaleLevel: 0 })
  );
  const atlasScale1 = await timed('atlas_t0_scale1', async () =>
    provider.getBrickAtlas!('layer-a', 0, { scaleLevel: 1 })
  );

  const loadSteps: BenchmarkCaseLoadStepReport[] = [
    {
      label: firstLoad.label,
      elapsedMs: firstLoad.elapsedMs,
      normalizedBytes: firstLoad.value.normalized.byteLength
    },
    {
      label: secondLoad.label,
      elapsedMs: secondLoad.elapsedMs,
      normalizedBytes: secondLoad.value.normalized.byteLength
    },
    {
      label: thirdLoad.label,
      elapsedMs: thirdLoad.elapsedMs,
      normalizedBytes: thirdLoad.value.normalized.byteLength
    }
  ];
  const atlasSteps: BenchmarkCaseAtlasStepReport[] = [
    {
      label: atlasScale0.label,
      elapsedMs: atlasScale0.elapsedMs,
      atlasBytes: atlasScale0.value.data.byteLength,
      residentBricks: atlasScale0.value.pageTable.occupiedBrickCount
    },
    {
      label: atlasScale1.label,
      elapsedMs: atlasScale1.elapsedMs,
      atlasBytes: atlasScale1.value.data.byteLength,
      residentBricks: atlasScale1.value.pageTable.occupiedBrickCount
    }
  ];

  const providerStats = provider.getStats();
  const providerDiagnostics = provider.getDiagnostics();
  const scale1Requests = providerDiagnostics.streaming.scaleRequestCounts['1'] ?? 0;
  const acceptance = evaluateCaseAcceptance({
    benchmarkCase,
    generationMs: generation.elapsedMs,
    loadSteps,
    atlasSteps,
    providerStats,
    scale1Requests
  });

  return {
    caseId: benchmarkCase.id,
    caseName: benchmarkCase.name,
    tierId: benchmarkCase.tierId,
    dataset,
    generationMs: generation.elapsedMs,
    loadSteps,
    atlasSteps,
    providerStats,
    acceptance: {
      passed: acceptance.passed,
      failures: acceptance.failures,
      thresholds: benchmarkCase.acceptance,
      observed: {
        chunkHitRate: acceptance.chunkHitRate,
        scale1Requests: acceptance.scale1Requests
      }
    }
  };
}

async function loadBenchmarkMatrixConfig(matrixConfigPath: string): Promise<BenchmarkMatrixConfig> {
  const content = await fs.promises.readFile(matrixConfigPath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  return normalizeBenchmarkMatrixConfig(parsed);
}

function resolveRequestedCases(config: BenchmarkMatrixConfig): BenchmarkMatrixCase[] {
  const requestedRaw = process.env.BENCHMARK_CASES?.trim();
  if (!requestedRaw) {
    return config.cases;
  }

  const requestedIds = requestedRaw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (requestedIds.length === 0) {
    return config.cases;
  }

  const caseById = new Map(config.cases.map((entry) => [entry.id, entry]));
  const selected: BenchmarkMatrixCase[] = [];
  for (const requestedId of requestedIds) {
    const entry = caseById.get(requestedId);
    if (!entry) {
      throw new Error(`Unknown benchmark case id: "${requestedId}"`);
    }
    selected.push(entry);
  }
  return selected;
}

async function main() {
  const outputPath = path.resolve(process.cwd(), process.env.BASELINE_OUTPUT?.trim() || DEFAULT_OUTPUT_PATH);
  const matrixConfigPath = path.resolve(
    process.cwd(),
    process.env.BENCHMARK_MATRIX_PATH?.trim() || DEFAULT_MATRIX_CONFIG_PATH
  );
  const enforceThresholds = process.env.ENFORCE_BENCHMARK_THRESHOLDS !== '0';
  const allowUnapprovedMatrix = process.env.ALLOW_UNAPPROVED_BENCHMARK_MATRIX === '1';

  const matrixConfig = await loadBenchmarkMatrixConfig(matrixConfigPath);
  assertBenchmarkMatrixApprovedForThresholdEnforcement({
    config: matrixConfig,
    enforceThresholds,
    allowUnapprovedMatrix
  });
  const selectedCases = resolveRequestedCases(matrixConfig);
  const runtimeOverrides = resolveRuntimeOverrides();
  const caseReports: BenchmarkCaseReport[] = [];

  for (const benchmarkCase of selectedCases) {
    const report = await runBenchmarkCase(benchmarkCase, runtimeOverrides);
    caseReports.push(report);

    console.log(
      `[${report.caseId}] generation=${report.generationMs.toFixed(2)}ms cold=${report.loadSteps[0]?.elapsedMs.toFixed(2)}ms warm=${report.loadSteps[1]?.elapsedMs.toFixed(2)}ms mixed=${report.loadSteps[2]?.elapsedMs.toFixed(2)}ms atlas0=${report.atlasSteps[0]?.elapsedMs.toFixed(2)}ms atlas1=${report.atlasSteps[1]?.elapsedMs.toFixed(2)}ms hitRate=${report.acceptance.observed.chunkHitRate.toFixed(3)} scale1Req=${report.acceptance.observed.scale1Requests.toFixed(0)}`
    );
    if (!report.acceptance.passed) {
      for (const failure of report.acceptance.failures) {
        console.log(`[${report.caseId}] threshold failure: ${failure}`);
      }
    }
  }

  const failedCases = caseReports.filter((entry) => !entry.acceptance.passed);
  const report: BenchmarkMatrixReport = {
    generatedAt: new Date().toISOString(),
    matrixConfigPath: path.relative(process.cwd(), matrixConfigPath),
    matrixVersion: matrixConfig.version,
    matrixApproval: matrixConfig.approval,
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      runtimeOverrides,
    },
    cases: caseReports,
    summary: {
      totalCases: caseReports.length,
      passedCases: caseReports.length - failedCases.length,
      failedCases: failedCases.length
    }
  };

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`Wrote baseline report: ${outputPath}`);
  console.log(
    `Benchmark cases passed: ${report.summary.passedCases}/${report.summary.totalCases}`
  );
  if (allowUnapprovedMatrix && matrixConfig.approval.status !== 'approved') {
    console.log(
      'Warning: benchmark matrix approval override is active (ALLOW_UNAPPROVED_BENCHMARK_MATRIX=1).'
    );
  }

  if (enforceThresholds && failedCases.length > 0) {
    throw new Error(
      `Benchmark acceptance failed for case(s): ${failedCases.map((entry) => entry.caseId).join(', ')}`
    );
  }
}

await main();
