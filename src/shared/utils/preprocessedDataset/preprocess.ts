import { fromBlob } from 'geotiff';
import * as zarr from 'zarrita';

import type { NormalizationParameters, NormalizedVolume } from '../../../core/volumeProcessing';
import {
  colorizeSegmentationVolume,
  computeNormalizationParameters,
  normalizeVolume
} from '../../../core/volumeProcessing';
import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { createSegmentationSeed, sortVolumeFiles } from '../appHelpers';
import { computeAnisotropyScale } from '../anisotropyCorrection';
import type { VolumePayload, VolumeTypedArray } from '../../../types/volume';
import { createVolumeTypedArray, createWritableVolumeArray, getBytesPerValue } from '../../../types/volume';

import type {
  ChannelExportMetadata,
  PreprocessedBackgroundMaskManifest,
  PreprocessedBackgroundMaskScaleManifestEntry,
  PreprocessedChannelSummary,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerScaleManifestEntry,
  PreprocessedManifest,
  PreprocessedMovieMode,
  PreprocessedScaleSkipHierarchyZarrDescriptor,
  PreprocessedScaleSkipHierarchyLevelZarrDescriptor,
  PreprocessedTrackSetSummary,
  TrackSetExportMetadata,
  ZarrArrayShardingPlan,
  ZarrArrayDescriptor
} from './types';
import { PREPROCESSED_DATASET_FORMAT } from './types';
import { createZarrStoreFromPreprocessedStorage } from '../zarrStore';
import { buildChannelSummariesFromManifest, buildTrackSummariesFromManifest } from './manifest';
import { createTracksDescriptor, serializeTrackEntriesToCsvBytes } from './tracks';
import { encodeUint32ArrayLE, HISTOGRAM_BINS } from '../histogram';
import {
  buildPreprocessScalePyramidInWorker,
  supportsPreprocessScalePyramidWorker,
  type PreprocessScalePyramidWorkerResultScale
} from './preprocessScalePyramidWorker';
import { createZarrChunkKeyFromCoords } from './chunkKey';
import { computeMultiscaleGeometryLevels } from './mipPolicy';
import {
  computeExpectedChunkCountForShard,
  createShardCoordKey,
  encodeShardEntries,
  getShardChunkLocationForLayout,
  getShardLayoutForArray,
  isShardedArrayDescriptor,
  type ShardLayout
} from './sharding';
import {
  applyBackgroundMaskInPlace,
  buildBackgroundMaskFromTypedArray,
  coerceBackgroundMaskValuesForDataType,
  downsampleBackgroundMaskByAllMasked,
  findMinMaxExcludingBackgroundMask,
  type BackgroundMaskVolume
} from '../backgroundMask';

export type PreprocessLayerSource = {
  channelId: string;
  channelLabel: string;
  key: string;
  label: string;
  files: File[];
  isSegmentation: boolean;
};

export type PreprocessDatasetProgress =
  | {
      stage: 'rep-stats';
      layerKey: string;
    }
  | {
      stage: 'write-volumes';
      processedVolumes: number;
      totalVolumes: number;
      layerKey: string;
      timepoint: number;
    }
  | {
      stage: 'finalize-manifest';
    };

type LoadVolumesFromFiles = (files: File[]) => Promise<VolumePayload[]>;
export type PreprocessInputInterpretation = '3d-movie' | '2d-movie' | 'single-3d-volume';

export type PreprocessDatasetToStorageOptions = {
  layers: PreprocessLayerSource[];
  channels: ChannelExportMetadata[];
  trackSets: TrackSetExportMetadata[];
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
  movieMode: PreprocessedMovieMode;
  storage: PreprocessedStorage;
  volumeLoader?: LoadVolumesFromFiles;
  storageStrategy?: {
    chunkTargetBytes?: number;
    maxInFlightChunkWrites?: number;
    sharding?: {
      enabled?: boolean;
      targetShardBytes?: number;
      maxChunksPerAxis?: number;
    };
  };
  processingStrategy?: {
    workerizeNormalizationDownsample?: boolean;
    executionMode?: 'auto' | 'in-memory' | 'streaming';
    streamingThresholdBytes?: number;
  };
  inputInterpretation?: PreprocessInputInterpretation;
  backgroundMask?: {
    values: number[];
  } | null;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
};

type SharedBackgroundMaskScale = PreprocessedBackgroundMaskScaleManifestEntry & {
  data: Uint8Array;
};

type SharedBackgroundMask = {
  sourceLayerKey: string;
  sourceDataType: VolumePayload['dataType'];
  values: number[];
  maskedVoxelCount: number;
  scales: SharedBackgroundMaskScale[];
};

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    const reason = signal.reason;
    if (reason instanceof Error) {
      throw reason;
    }
    throw new DOMException('Aborted', 'AbortError');
  }
}

function isAbortLikeError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function resolveWorkerizeNormalizationDownsample(
  options: PreprocessDatasetToStorageOptions['processingStrategy'] | undefined
): boolean {
  if (options?.workerizeNormalizationDownsample === false) {
    return false;
  }
  return true;
}

type ResolvedPreprocessExecutionMode = 'in-memory' | 'streaming';

function resolvePreprocessExecutionMode(
  options: PreprocessDatasetToStorageOptions['processingStrategy'] | undefined
): 'auto' | ResolvedPreprocessExecutionMode {
  const requested = options?.executionMode ?? DEFAULT_PREPROCESS_EXECUTION_MODE;
  if (requested === 'auto' || requested === 'in-memory' || requested === 'streaming') {
    return requested;
  }
  return DEFAULT_PREPROCESS_EXECUTION_MODE;
}

function resolvePreprocessStreamingThresholdBytes(
  options: PreprocessDatasetToStorageOptions['processingStrategy'] | undefined
): number {
  const configured = options?.streamingThresholdBytes;
  if (!Number.isFinite(configured) || (configured ?? 0) <= 0) {
    return DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES;
  }
  return Math.max(1, Math.floor(configured ?? DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES));
}

function createZarrScaleDataArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/data`;
}

function createZarrScaleLabelsArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/labels`;
}

function createZarrScaleSkipHierarchyArrayPath(
  channelId: string,
  layerKey: string,
  scaleLevel: number,
  hierarchyLevel: number,
  stat: 'min' | 'max' | 'occupancy'
): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/skip-hierarchy/levels/${hierarchyLevel}/${stat}`;
}

function createZarrScaleHistogramArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/histogram`;
}

function createZarrBackgroundMaskArrayPath(scaleLevel: number): string {
  return `background-mask/scales/${scaleLevel}/data`;
}

function computeLeafGridShapeForScaleDescriptor(dataDescriptor: ZarrArrayDescriptor): [number, number, number] {
  const chunkDepth = dataDescriptor.chunkShape[1] ?? 1;
  const chunkHeight = dataDescriptor.chunkShape[2] ?? 1;
  const chunkWidth = dataDescriptor.chunkShape[3] ?? 1;
  const depth = dataDescriptor.shape[1] ?? 1;
  const height = dataDescriptor.shape[2] ?? 1;
  const width = dataDescriptor.shape[3] ?? 1;
  return [
    Math.max(1, Math.ceil(depth / Math.max(1, chunkDepth))),
    Math.max(1, Math.ceil(height / Math.max(1, chunkHeight))),
    Math.max(1, Math.ceil(width / Math.max(1, chunkWidth)))
  ];
}

function buildSkipHierarchyGridShapes(leafGridShape: [number, number, number]): [number, number, number][] {
  const levels: [number, number, number][] = [leafGridShape];
  while (true) {
    const previous = levels[levels.length - 1];
    if (!previous) {
      break;
    }
    if (previous[0] === 1 && previous[1] === 1 && previous[2] === 1) {
      break;
    }
    levels.push([
      Math.max(1, Math.ceil(previous[0] / 2)),
      Math.max(1, Math.ceil(previous[1] / 2)),
      Math.max(1, Math.ceil(previous[2] / 2))
    ]);
  }
  return levels;
}

const DEFAULT_CHUNK_TARGET_BYTES = 256 * 1024;
const DEFAULT_SHARD_TARGET_BYTES = 16 * 1024 * 1024;
const DEFAULT_SHARD_MAX_CHUNKS_PER_AXIS = 8;
const DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES = 4;
const DEFAULT_PREPROCESS_EXECUTION_MODE = 'auto' as const;
const DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES = 512 * 1024 * 1024;

type ShardingStrategy = {
  chunkTargetBytes: number;
  maxInFlightChunkWrites: number;
  enabled: boolean;
  targetShardBytes: number;
  maxChunksPerAxis: number;
};

function normalizePositiveInteger(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer, received ${String(value)}.`);
  }
  return Math.floor(value);
}

function resolveShardingStrategy(
  options: PreprocessDatasetToStorageOptions['storageStrategy'] | undefined
): ShardingStrategy {
  const sharding = options?.sharding;
  return {
    chunkTargetBytes: normalizePositiveInteger(
      options?.chunkTargetBytes,
      DEFAULT_CHUNK_TARGET_BYTES,
      'storageStrategy.chunkTargetBytes'
    ),
    maxInFlightChunkWrites: normalizePositiveInteger(
      options?.maxInFlightChunkWrites,
      DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES,
      'storageStrategy.maxInFlightChunkWrites'
    ),
    enabled: Boolean(sharding?.enabled),
    targetShardBytes: normalizePositiveInteger(
      sharding?.targetShardBytes,
      DEFAULT_SHARD_TARGET_BYTES,
      'storageStrategy.sharding.targetShardBytes'
    ),
    maxChunksPerAxis: normalizePositiveInteger(
      sharding?.maxChunksPerAxis,
      DEFAULT_SHARD_MAX_CHUNKS_PER_AXIS,
      'storageStrategy.sharding.maxChunksPerAxis'
    )
  };
}

function computeChunkStorageBytes(chunkShape: number[], dataType: ZarrArrayDescriptor['dataType']): number {
  return chunkShape.reduce((product, dim) => product * dim, 1) * getBytesPerValue(dataType);
}

function createShardingPlan({
  shape,
  chunkShape,
  dataType,
  strategy
}: {
  shape: number[];
  chunkShape: number[];
  dataType: ZarrArrayDescriptor['dataType'];
  strategy: ShardingStrategy;
}): ZarrArrayShardingPlan {
  const chunkCounts = shape.map((shapeDim, axis) => {
    const axisChunk = chunkShape[axis] ?? 0;
    return Math.ceil(shapeDim / Math.max(1, axisChunk));
  });
  const multipliers = chunkShape.map(() => 1);
  const axisCandidates = chunkShape.map((_, axis) => axis).filter((axis) => axis !== 0);
  let estimatedShardBytes = computeChunkStorageBytes(chunkShape, dataType);

  while (estimatedShardBytes < strategy.targetShardBytes) {
    let selectedAxis = -1;
    let selectedCapacity = 0;

    for (const axis of axisCandidates) {
      const count = chunkCounts[axis] ?? 1;
      const currentMultiplier = multipliers[axis] ?? 1;
      const maxMultiplier = Math.min(count, strategy.maxChunksPerAxis);
      if (currentMultiplier >= maxMultiplier) {
        continue;
      }
      const remaining = maxMultiplier - currentMultiplier;
      if (remaining > selectedCapacity) {
        selectedAxis = axis;
        selectedCapacity = remaining;
      }
    }

    if (selectedAxis < 0) {
      break;
    }

    const current = multipliers[selectedAxis] ?? 1;
    const maxMultiplier = Math.min(chunkCounts[selectedAxis] ?? 1, strategy.maxChunksPerAxis);
    multipliers[selectedAxis] = Math.min(maxMultiplier, current * 2);
    const shardShape = chunkShape.map((dim, axis) => dim * (multipliers[axis] ?? 1));
    estimatedShardBytes = computeChunkStorageBytes(shardShape, dataType);
  }

  const shardShape = chunkShape.map((dim, axis) => dim * (multipliers[axis] ?? 1));
  return {
    enabled: strategy.enabled,
    targetShardBytes: strategy.targetShardBytes,
    shardShape,
    estimatedShardBytes,
    reason: strategy.enabled
      ? 'Sharded write/read path enabled.'
      : 'Advisory sharding plan. Enable storageStrategy.sharding.enabled to write/read real shards.'
  };
}

function chooseSpatialChunkDimensions({
  depth,
  height,
  width,
  bytesPerVoxel,
  targetChunkBytes,
  preferDepthChunkOne
}: {
  depth: number;
  height: number;
  width: number;
  bytesPerVoxel: number;
  targetChunkBytes: number;
  preferDepthChunkOne?: boolean;
}): [number, number, number] {
  let chunkDepth = preferDepthChunkOne ? 1 : Math.max(1, Math.min(depth, depth > 1 ? 16 : 1));
  let chunkHeight = Math.max(1, Math.min(height, 64));
  let chunkWidth = Math.max(1, Math.min(width, 64));

  const estimateChunkBytes = () => chunkDepth * chunkHeight * chunkWidth * bytesPerVoxel;

  while (
    estimateChunkBytes() > targetChunkBytes &&
    (chunkDepth > 1 || chunkHeight > 1 || chunkWidth > 1)
  ) {
    if (chunkWidth >= chunkHeight && chunkWidth >= chunkDepth && chunkWidth > 1) {
      chunkWidth = Math.max(1, Math.ceil(chunkWidth / 2));
      continue;
    }
    if (chunkHeight >= chunkDepth && chunkHeight > 1) {
      chunkHeight = Math.max(1, Math.ceil(chunkHeight / 2));
      continue;
    }
    if (chunkDepth > 1) {
      chunkDepth = Math.max(1, Math.ceil(chunkDepth / 2));
      continue;
    }
    break;
  }

  return [chunkDepth, chunkHeight, chunkWidth];
}

function countMaskedVoxels(mask: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if ((mask[index] ?? 0) > 0) {
      count += 1;
    }
  }
  return count;
}

function buildBackgroundMaskScales({
  baseMask,
  sourceLayerKey,
  sourceDataType,
  values,
  shardingStrategy
}: {
  baseMask: BackgroundMaskVolume;
  sourceLayerKey: string;
  sourceDataType: VolumePayload['dataType'];
  values: number[];
  shardingStrategy: ShardingStrategy;
}): SharedBackgroundMask {
  const geometryLevels = computeMultiscaleGeometryLevels({
    width: baseMask.width,
    height: baseMask.height,
    depth: baseMask.depth
  });
  const scales: SharedBackgroundMaskScale[] = [];
  let maskForLevel = baseMask;

  for (let index = 0; index < geometryLevels.length; index += 1) {
    const geometryLevel = geometryLevels[index];
    if (!geometryLevel) {
      continue;
    }
    if (index > 0) {
      maskForLevel = downsampleBackgroundMaskByAllMasked(maskForLevel);
    }
    if (
      maskForLevel.width !== geometryLevel.width ||
      maskForLevel.height !== geometryLevel.height ||
      maskForLevel.depth !== geometryLevel.depth
    ) {
      throw new Error(
        `Background mask geometry mismatch at scale ${geometryLevel.level}: expected ${geometryLevel.width}x${geometryLevel.height}x${geometryLevel.depth}, got ${maskForLevel.width}x${maskForLevel.height}x${maskForLevel.depth}.`
      );
    }

    const [chunkDepth, chunkHeight, chunkWidth] = chooseSpatialChunkDimensions({
      depth: geometryLevel.depth,
      height: geometryLevel.height,
      width: geometryLevel.width,
      bytesPerVoxel: 1,
      targetChunkBytes: shardingStrategy.chunkTargetBytes
    });
    const dataDescriptor: ZarrArrayDescriptor = {
      path: createZarrBackgroundMaskArrayPath(geometryLevel.level),
      shape: [geometryLevel.depth, geometryLevel.height, geometryLevel.width],
      chunkShape: [chunkDepth, chunkHeight, chunkWidth],
      dataType: 'uint8',
      sharding: createShardingPlan({
        shape: [geometryLevel.depth, geometryLevel.height, geometryLevel.width],
        chunkShape: [chunkDepth, chunkHeight, chunkWidth],
        dataType: 'uint8',
        strategy: shardingStrategy
      })
    };

    scales.push({
      level: geometryLevel.level,
      downsampleFactor: geometryLevel.downsampleFactor,
      width: geometryLevel.width,
      height: geometryLevel.height,
      depth: geometryLevel.depth,
      zarr: {
        data: dataDescriptor
      },
      data: maskForLevel.data
    });
  }

  return {
    sourceLayerKey,
    sourceDataType,
    values,
    maskedVoxelCount: countMaskedVoxels(baseMask.data),
    scales
  };
}

function buildLayerScaleDescriptors({
  layer,
  layerMetadata,
  expectedTimepoints,
  shardingStrategy,
  preferDepthChunkOne
}: {
  layer: PreprocessLayerSource;
  layerMetadata: LayerMetadata;
  expectedTimepoints: number;
  shardingStrategy: ShardingStrategy;
  preferDepthChunkOne?: boolean;
}): PreprocessedLayerScaleManifestEntry[] {
  const scales: PreprocessedLayerScaleManifestEntry[] = [];
  const geometryLevels = computeMultiscaleGeometryLevels({
    width: layerMetadata.width,
    height: layerMetadata.height,
    depth: layerMetadata.depth
  });

  for (const geometryLevel of geometryLevels) {
    const currentDepth = geometryLevel.depth;
    const currentHeight = geometryLevel.height;
    const currentWidth = geometryLevel.width;
    const level = geometryLevel.level;
    const downsampleFactor = geometryLevel.downsampleFactor;

    const [dataChunkDepth, dataChunkHeight, dataChunkWidth] = chooseSpatialChunkDimensions({
      depth: currentDepth,
      height: currentHeight,
      width: currentWidth,
      bytesPerVoxel: Math.max(1, layerMetadata.channels),
      targetChunkBytes: shardingStrategy.chunkTargetBytes,
      preferDepthChunkOne
    });

    const dataDescriptor: ZarrArrayDescriptor = {
      path: createZarrScaleDataArrayPath(layer.channelId, layer.key, level),
      shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth, layerMetadata.channels],
      chunkShape: [1, dataChunkDepth, dataChunkHeight, dataChunkWidth, layerMetadata.channels],
      dataType: 'uint8',
      sharding: createShardingPlan({
        shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth, layerMetadata.channels],
        chunkShape: [1, dataChunkDepth, dataChunkHeight, dataChunkWidth, layerMetadata.channels],
        dataType: 'uint8',
        strategy: shardingStrategy
      })
    };
    const leafGridShape = computeLeafGridShapeForScaleDescriptor(dataDescriptor);
    const hierarchyGridShapes = buildSkipHierarchyGridShapes(leafGridShape);
    const skipHierarchyLevels: PreprocessedScaleSkipHierarchyLevelZarrDescriptor[] = hierarchyGridShapes.map(
      (gridShape, hierarchyLevel): PreprocessedScaleSkipHierarchyLevelZarrDescriptor => {
        const shape: [number, number, number, number] = [
          expectedTimepoints,
          gridShape[0],
          gridShape[1],
          gridShape[2]
        ];
        const chunkShape: [number, number, number, number] = [1, gridShape[0], gridShape[1], gridShape[2]];
        return {
          level: hierarchyLevel,
          gridShape,
          occupancy: {
            path: createZarrScaleSkipHierarchyArrayPath(layer.channelId, layer.key, level, hierarchyLevel, 'occupancy'),
            shape,
            chunkShape,
            dataType: 'uint8',
            sharding: createShardingPlan({
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy
            })
          },
          min: {
            path: createZarrScaleSkipHierarchyArrayPath(layer.channelId, layer.key, level, hierarchyLevel, 'min'),
            shape,
            chunkShape,
            dataType: 'uint8',
            sharding: createShardingPlan({
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy
            })
          },
          max: {
            path: createZarrScaleSkipHierarchyArrayPath(layer.channelId, layer.key, level, hierarchyLevel, 'max'),
            shape,
            chunkShape,
            dataType: 'uint8',
            sharding: createShardingPlan({
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy
            })
          }
        };
      }
    );
    const skipHierarchyDescriptor: PreprocessedScaleSkipHierarchyZarrDescriptor = {
      levels: skipHierarchyLevels
    };
    const histogramDescriptor: ZarrArrayDescriptor = {
      path: createZarrScaleHistogramArrayPath(layer.channelId, layer.key, level),
      shape: [expectedTimepoints, HISTOGRAM_BINS],
      chunkShape: [1, HISTOGRAM_BINS],
      dataType: 'uint32',
      sharding: createShardingPlan({
        shape: [expectedTimepoints, HISTOGRAM_BINS],
        chunkShape: [1, HISTOGRAM_BINS],
        dataType: 'uint32',
        strategy: shardingStrategy
      })
    };

    let labelsDescriptor: ZarrArrayDescriptor | undefined;
    if (layer.isSegmentation) {
      const [labelsChunkDepth, labelsChunkHeight, labelsChunkWidth] = chooseSpatialChunkDimensions({
        depth: currentDepth,
        height: currentHeight,
        width: currentWidth,
        bytesPerVoxel: 4,
        targetChunkBytes: shardingStrategy.chunkTargetBytes,
        preferDepthChunkOne
      });
      labelsDescriptor = {
        path: createZarrScaleLabelsArrayPath(layer.channelId, layer.key, level),
        shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth],
        chunkShape: [1, labelsChunkDepth, labelsChunkHeight, labelsChunkWidth],
        dataType: 'uint32',
        sharding: createShardingPlan({
          shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth],
          chunkShape: [1, labelsChunkDepth, labelsChunkHeight, labelsChunkWidth],
          dataType: 'uint32',
          strategy: shardingStrategy
        })
      };
    }

    scales.push({
      level,
      downsampleFactor,
      width: currentWidth,
      height: currentHeight,
      depth: currentDepth,
      channels: layerMetadata.channels,
      zarr: {
        data: dataDescriptor,
        skipHierarchy: skipHierarchyDescriptor,
        histogram: histogramDescriptor,
        ...(labelsDescriptor ? { labels: labelsDescriptor } : {})
      }
    });
  }

  return scales;
}

type PendingShard = {
  descriptor: ZarrArrayDescriptor;
  layout: ShardLayout;
  shardCoords: number[];
  shardPath: string;
  expectedChunkCount: number;
  entriesByLocalCoords: Map<string, { localChunkCoords: number[]; bytes: Uint8Array }>;
};

type ChunkWriteDispatcher = {
  writeChunk: (params: {
    descriptor: ZarrArrayDescriptor;
    chunkCoords: readonly number[];
    bytes: Uint8Array;
    signal?: AbortSignal;
  }) => Promise<void>;
  flush: (signal?: AbortSignal) => Promise<void>;
};

function createChunkWriteDispatcher(
  storage: PreprocessedStorage,
  options?: { maxInFlightWrites?: number }
): ChunkWriteDispatcher {
  const pendingShardsByPath = new Map<string, PendingShard>();
  const shardLayoutByDescriptorPath = new Map<string, ShardLayout>();
  const maxInFlightWrites = normalizePositiveInteger(
    options?.maxInFlightWrites,
    DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES,
    'storageStrategy.maxInFlightChunkWrites'
  );
  const inFlightWrites = new Set<Promise<void>>();
  let writeFailure: Error | null = null;

  const throwIfWriteFailed = () => {
    if (writeFailure) {
      throw writeFailure;
    }
  };

  const awaitWriteCapacity = async (signal?: AbortSignal) => {
    while (inFlightWrites.size >= maxInFlightWrites) {
      throwIfAborted(signal);
      const writes = Array.from(inFlightWrites);
      await Promise.race(writes);
      throwIfWriteFailed();
    }
  };

  const queueWrite = async (writeOp: () => Promise<void>, signal?: AbortSignal) => {
    throwIfAborted(signal);
    throwIfWriteFailed();
    await awaitWriteCapacity(signal);
    throwIfWriteFailed();

    let writePromise: Promise<void>;
    writePromise = writeOp()
      .catch((error) => {
        if (!writeFailure) {
          writeFailure = error instanceof Error ? error : new Error(String(error));
        }
      })
      .finally(() => {
        inFlightWrites.delete(writePromise);
      });

    inFlightWrites.add(writePromise);
  };

  const flushQueuedWrites = async (signal?: AbortSignal) => {
    while (inFlightWrites.size > 0) {
      throwIfAborted(signal);
      const writes = Array.from(inFlightWrites);
      await Promise.allSettled(writes);
    }
    throwIfWriteFailed();
  };

  const flushShard = async (pendingShard: PendingShard, signal?: AbortSignal) => {
    throwIfAborted(signal);
    if (pendingShard.entriesByLocalCoords.size === 0) {
      pendingShardsByPath.delete(pendingShard.shardPath);
      return;
    }
    const encodedShard = encodeShardEntries(
      pendingShard.shardCoords.length,
      Array.from(pendingShard.entriesByLocalCoords.values())
    );
    await queueWrite(() => storage.writeFile(pendingShard.shardPath, encodedShard), signal);
    pendingShardsByPath.delete(pendingShard.shardPath);
  };

  const getCachedShardLayout = (descriptor: ZarrArrayDescriptor): ShardLayout => {
    const cached = shardLayoutByDescriptorPath.get(descriptor.path);
    if (cached) {
      return cached;
    }
    const resolved = getShardLayoutForArray(descriptor);
    if (!resolved) {
      throw new Error(`Failed to resolve sharding layout for ${descriptor.path}.`);
    }
    shardLayoutByDescriptorPath.set(descriptor.path, resolved);
    return resolved;
  };

  const writeChunk: ChunkWriteDispatcher['writeChunk'] = async ({
    descriptor,
    chunkCoords,
    bytes,
    signal
  }) => {
    throwIfAborted(signal);
    throwIfWriteFailed();
    if (!isShardedArrayDescriptor(descriptor)) {
      const chunkKey = createZarrChunkKeyFromCoords(chunkCoords);
      await queueWrite(() => storage.writeFile(`${descriptor.path}/${chunkKey}`, bytes), signal);
      return;
    }

    const layout = getCachedShardLayout(descriptor);
    const location = getShardChunkLocationForLayout(descriptor, layout, chunkCoords);
    const shardKey = location.shardPath;
    let pendingShard = pendingShardsByPath.get(shardKey) ?? null;
    if (!pendingShard) {
      pendingShard = {
        descriptor,
        layout,
        shardCoords: location.shardCoords,
        shardPath: location.shardPath,
        expectedChunkCount: computeExpectedChunkCountForShard(layout, location.shardCoords),
        entriesByLocalCoords: new Map()
      };
      pendingShardsByPath.set(shardKey, pendingShard);
    }

    const localKey = createShardCoordKey(location.localChunkCoords);
    if (pendingShard.entriesByLocalCoords.has(localKey)) {
      throw new Error(
        `Duplicate chunk write while encoding shard ${location.shardPath} at local coord ${localKey}.`
      );
    }
    pendingShard.entriesByLocalCoords.set(localKey, {
      localChunkCoords: location.localChunkCoords,
      bytes: bytes.slice()
    });

    if (pendingShard.entriesByLocalCoords.size >= pendingShard.expectedChunkCount) {
      await flushShard(pendingShard, signal);
    }
  };

  const flush: ChunkWriteDispatcher['flush'] = async (signal) => {
    const pending = Array.from(pendingShardsByPath.values());
    for (const pendingShard of pending) {
      await flushShard(pendingShard, signal);
    }
    await flushQueuedWrites(signal);
  };

  return { writeChunk, flush };
}

function computeSliceMinMax(slice: VolumeTypedArray): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < slice.length; i += 1) {
    const value = slice[i] as number;
    if (Number.isNaN(value)) {
      continue;
    }
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (!Number.isFinite(min) || min === Number.POSITIVE_INFINITY) {
    min = 0;
  }
  if (!Number.isFinite(max) || max === Number.NEGATIVE_INFINITY) {
    max = min === 0 ? 1 : min + 1;
  }
  if (min === max) {
    max = min + 1;
  }

  return { min, max };
}

type VolumeShapeExpectation = {
  width: number;
  height: number;
  depth?: number;
  channels: number;
  dataType: VolumePayload['dataType'];
};

function assertVolumeMatchesExpectedShape(
  volume: Pick<VolumePayload, 'width' | 'height' | 'depth' | 'channels' | 'dataType'>,
  expected: VolumeShapeExpectation,
  context: string
): void {
  const depthMatches = expected.depth === undefined || volume.depth === expected.depth;
  if (
    volume.width !== expected.width ||
    volume.height !== expected.height ||
    !depthMatches ||
    volume.channels !== expected.channels ||
    volume.dataType !== expected.dataType
  ) {
    const expectedDepthLabel = expected.depth === undefined ? '*' : String(expected.depth);
    throw new Error(
      `${context} has shape ${volume.width}×${volume.height}×${volume.depth} (${volume.channels}ch ${volume.dataType}) but expected ${expected.width}×${expected.height}×${expectedDepthLabel} (${expected.channels}ch ${expected.dataType}).`
    );
  }
}

async function loadVolumeFor3dTimepoint(
  file: File,
  loader: LoadVolumesFromFiles,
  signal?: AbortSignal
): Promise<VolumePayload> {
  throwIfAborted(signal);
  const [volume] = await loader([file]);
  if (!volume) {
    throw new Error(`Failed to decode volume from file "${file.name}".`);
  }
  return volume;
}

type DecodedVolumeCacheByLayerKey = Map<string, Map<number, VolumePayload>>;

function getCachedLayerVolume(
  cache: DecodedVolumeCacheByLayerKey,
  layerKey: string,
  fileIndex: number
): VolumePayload | null {
  return cache.get(layerKey)?.get(fileIndex) ?? null;
}

function cacheLayerVolume(
  cache: DecodedVolumeCacheByLayerKey,
  layerKey: string,
  fileIndex: number,
  volume: VolumePayload
): void {
  const byFileIndex = cache.get(layerKey);
  if (byFileIndex) {
    byFileIndex.set(fileIndex, volume);
    return;
  }
  cache.set(layerKey, new Map([[fileIndex, volume]]));
}

async function loadLayerVolumeByFileIndex({
  layer,
  fileIndex,
  loader,
  decodedVolumeCacheByLayerKey,
  signal
}: {
  layer: PreprocessLayerSource;
  fileIndex: number;
  loader: LoadVolumesFromFiles;
  decodedVolumeCacheByLayerKey: DecodedVolumeCacheByLayerKey;
  signal?: AbortSignal;
}): Promise<VolumePayload> {
  const cached = getCachedLayerVolume(decodedVolumeCacheByLayerKey, layer.key, fileIndex);
  if (cached) {
    return cached;
  }
  const file = layer.files[fileIndex];
  if (!file) {
    throw new Error(`Missing source file #${fileIndex + 1} for layer "${layer.key}".`);
  }
  const volume = await loadVolumeFor3dTimepoint(file, loader, signal);
  cacheLayerVolume(decodedVolumeCacheByLayerKey, layer.key, fileIndex, volume);
  return volume;
}

function createDepthOneVolumeFromSlice({
  volume,
  sliceIndex,
  context
}: {
  volume: VolumePayload;
  sliceIndex: number;
  context: string;
}): VolumePayload {
  if (sliceIndex < 0 || sliceIndex >= volume.depth) {
    throw new Error(`${context}: slice index ${sliceIndex + 1} is out of range for depth ${volume.depth}.`);
  }
  const sliceLength = volume.width * volume.height * volume.channels;
  const values = createVolumeTypedArray(volume.dataType, volume.data);
  const start = sliceIndex * sliceLength;
  const end = start + sliceLength;
  if (end > values.length) {
    throw new Error(`${context}: slice ${sliceIndex + 1} exceeds decoded buffer bounds.`);
  }

  const slice = values.subarray(start, end);
  const writable = createWritableVolumeArray(volume.dataType, sliceLength);
  writable.set(slice);
  const { min, max } = computeSliceMinMax(slice);

  return {
    width: volume.width,
    height: volume.height,
    depth: 1,
    channels: volume.channels,
    dataType: volume.dataType,
    min,
    max,
    data: writable.buffer
  };
}

function stackDepthOneVolumes({
  volumes,
  context
}: {
  volumes: VolumePayload[];
  context: string;
}): VolumePayload {
  const first = volumes[0];
  if (!first) {
    throw new Error(`${context}: cannot stack an empty volume sequence.`);
  }
  if (first.depth !== 1) {
    throw new Error(`${context}: expected 2D slices with depth 1, got depth ${first.depth}.`);
  }

  const sliceLength = first.width * first.height * first.channels;
  const stacked = createWritableVolumeArray(first.dataType, sliceLength * volumes.length);
  let globalMin = Number.POSITIVE_INFINITY;
  let globalMax = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < volumes.length; index += 1) {
    const volume = volumes[index];
    if (!volume) {
      throw new Error(`${context}: missing decoded slice at position ${index + 1}.`);
    }
    if (volume.depth !== 1) {
      throw new Error(`${context}: file #${index + 1} is 3D (depth ${volume.depth}); all files must be 2D.`);
    }
    if (
      volume.width !== first.width ||
      volume.height !== first.height ||
      volume.channels !== first.channels ||
      volume.dataType !== first.dataType
    ) {
      throw new Error(
        `${context}: file #${index + 1} has shape ${volume.width}×${volume.height}×${volume.depth} (${volume.channels}ch ${volume.dataType}), expected ${first.width}×${first.height}×1 (${first.channels}ch ${first.dataType}).`
      );
    }

    const values = createVolumeTypedArray(volume.dataType, volume.data);
    if (values.length !== sliceLength) {
      throw new Error(`${context}: file #${index + 1} returned an unexpected data length.`);
    }

    stacked.set(values, index * sliceLength);
    if (volume.min < globalMin) {
      globalMin = volume.min;
    }
    if (volume.max > globalMax) {
      globalMax = volume.max;
    }
  }

  if (!Number.isFinite(globalMin)) {
    globalMin = 0;
  }
  if (!Number.isFinite(globalMax) || globalMax === globalMin) {
    globalMax = globalMin + 1;
  }

  return {
    width: first.width,
    height: first.height,
    depth: volumes.length,
    channels: first.channels,
    dataType: first.dataType,
    min: globalMin,
    max: globalMax,
    data: stacked.buffer
  };
}

type PreparedLayerSource = {
  layer: PreprocessLayerSource;
  timepointCount: number;
  getTimepointVolume: (timepoint: number, signal?: AbortSignal) => Promise<VolumePayload>;
};

type StreamingTimepointSliceSource =
  | {
      kind: 'single-file';
      file: File;
      startSlice: number;
      depth: number;
      expectedFileDepth: number;
      depthValidation: 'shape' | '2d-movie-depth1' | 'single-3d-depth1';
    }
  | {
      kind: 'multi-file-depth1';
      files: File[];
      depthValidation: 'single-3d-depth1';
    };

type StreamingPreparedLayerSource = {
  layer: PreprocessLayerSource;
  timepointCount: number;
  sourceMetadata: LayerMetadata;
  getTimepointSource: (timepoint: number) => StreamingTimepointSliceSource;
};

type ProbedTiffFileMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumePayload['dataType'];
};

type SupportedTypedArray = VolumeTypedArray;

function detectVolumeDataTypeFromTypedArray(array: SupportedTypedArray): VolumePayload['dataType'] {
  if (array instanceof Uint8Array) {
    return 'uint8';
  }
  if (array instanceof Int8Array) {
    return 'int8';
  }
  if (array instanceof Uint16Array) {
    return 'uint16';
  }
  if (array instanceof Int16Array) {
    return 'int16';
  }
  if (array instanceof Uint32Array) {
    return 'uint32';
  }
  if (array instanceof Int32Array) {
    return 'int32';
  }
  if (array instanceof Float32Array) {
    return 'float32';
  }
  if (array instanceof Float64Array) {
    return 'float64';
  }
  throw new Error('Unsupported raster data type.');
}

function ensureTypedArrayMatchesExpectedDataType(
  array: SupportedTypedArray,
  expected: VolumePayload['dataType'],
  fileName: string,
  sliceIndex: number
): SupportedTypedArray {
  const actual = detectVolumeDataTypeFromTypedArray(array);
  if (actual !== expected) {
    throw new Error(`Slice ${sliceIndex + 1} in "${fileName}" changed its sample type.`);
  }
  return array;
}

function toSegmentationLabelId(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const rounded = Math.round(value);
  return rounded <= 0 ? 0 : rounded;
}

function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const hueSector = hue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSector % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hueSector >= 0 && hueSector < 1) {
    r1 = chroma;
    g1 = intermediate;
  } else if (hueSector >= 1 && hueSector < 2) {
    r1 = intermediate;
    g1 = chroma;
  } else if (hueSector >= 2 && hueSector < 3) {
    g1 = chroma;
    b1 = intermediate;
  } else if (hueSector >= 3 && hueSector < 4) {
    g1 = intermediate;
    b1 = chroma;
  } else if (hueSector >= 4 && hueSector < 5) {
    r1 = intermediate;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = intermediate;
  }

  const match = v - chroma;
  const toByte = (value: number): number => {
    const adjusted = value + match;
    const clamped = Math.max(0, Math.min(1, adjusted));
    return Math.round(clamped * 255);
  };

  return [toByte(r1), toByte(g1), toByte(b1)];
}

function createSegmentationColorTable(maxLabel: number, seed: number): Uint8Array {
  const table = new Uint8Array((maxLabel + 1) * 3);
  table[0] = 0;
  table[1] = 0;
  table[2] = 0;

  if (maxLabel === 0) {
    return table;
  }

  const rng = createDeterministicRng(seed);
  for (let label = 1; label <= maxLabel; label += 1) {
    const hue = rng() * 360;
    const [r, g, b] = hsvToRgb(hue, 1, 1);
    const index = label * 3;
    table[index] = r;
    table[index + 1] = g;
    table[index + 2] = b;
  }

  return table;
}

function resolveInputInterpretation(
  mode: PreprocessDatasetToStorageOptions['inputInterpretation']
): PreprocessInputInterpretation {
  return mode ?? '3d-movie';
}

async function probeTiffFileMetadata(file: File, signal?: AbortSignal): Promise<ProbedTiffFileMetadata> {
  throwIfAborted(signal);
  const tiff = await fromBlob(file);
  throwIfAborted(signal);
  const imageCount = await tiff.getImageCount();
  if (imageCount <= 0) {
    throw new Error(`File "${file.name}" does not contain any images.`);
  }

  const firstImage = await tiff.getImage(0);
  const width = firstImage.getWidth();
  const height = firstImage.getHeight();
  const channels = firstImage.getSamplesPerPixel();
  const firstRasterRaw = (await firstImage.readRasters({ interleave: true })) as unknown;
  if (!ArrayBuffer.isView(firstRasterRaw)) {
    throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
  }

  const firstRaster = firstRasterRaw as SupportedTypedArray;
  const dataType = detectVolumeDataTypeFromTypedArray(firstRaster);
  const expectedLength = width * height * channels;
  if (firstRaster.length !== expectedLength) {
    throw new Error(`File "${file.name}" returned an unexpected slice length.`);
  }

  return {
    width,
    height,
    depth: imageCount,
    channels,
    dataType
  };
}

function estimatePreparedLayerVolumeBytes(layer: StreamingPreparedLayerSource): number {
  const metadata = layer.sourceMetadata;
  const voxelCount = metadata.width * metadata.height * metadata.depth;
  const sourceBytes = voxelCount * metadata.channels * getBytesPerValue(metadata.dataType);
  const normalizedChannels = layer.layer.isSegmentation ? 4 : metadata.channels;
  const normalizedBytes = voxelCount * normalizedChannels;
  return sourceBytes + normalizedBytes * 2;
}

function resolveDatasetExecutionMode({
  requestedMode,
  estimatedMaxLayerVolumeBytes,
  streamingThresholdBytes
}: {
  requestedMode: 'auto' | ResolvedPreprocessExecutionMode;
  estimatedMaxLayerVolumeBytes: number;
  streamingThresholdBytes: number;
}): ResolvedPreprocessExecutionMode {
  if (requestedMode === 'in-memory') {
    return 'in-memory';
  }
  if (requestedMode === 'streaming') {
    return 'streaming';
  }
  return estimatedMaxLayerVolumeBytes >= streamingThresholdBytes ? 'streaming' : 'in-memory';
}

async function prepareStreamingLayerSources({
  sortedLayerSources,
  inputInterpretation,
  signal
}: {
  sortedLayerSources: PreprocessLayerSource[];
  inputInterpretation: PreprocessInputInterpretation;
  signal?: AbortSignal;
}): Promise<{ preparedLayerSources: StreamingPreparedLayerSource[]; estimatedMaxLayerVolumeBytes: number }> {
  const preparedLayerSources: StreamingPreparedLayerSource[] = [];
  let estimatedMaxLayerVolumeBytes = 0;

  for (const layer of sortedLayerSources) {
    throwIfAborted(signal);
    if (layer.files.length === 0) {
      throw new Error(`Layer "${layer.channelLabel}" does not contain TIFF files.`);
    }

    const firstFile = layer.files[0];
    if (!firstFile) {
      throw new Error(`Layer "${layer.channelLabel}" does not contain TIFF files.`);
    }
    const firstMetadata = await probeTiffFileMetadata(firstFile, signal);

    if (inputInterpretation === '3d-movie') {
      const sourceMetadata: LayerMetadata = {
        width: firstMetadata.width,
        height: firstMetadata.height,
        depth: firstMetadata.depth,
        channels: firstMetadata.channels,
        dataType: firstMetadata.dataType
      };
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: layer.files.length,
        sourceMetadata,
        getTimepointSource: (timepoint) => {
          const file = layer.files[timepoint];
          if (!file) {
            throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
          }
          return {
            kind: 'single-file',
            file,
            startSlice: 0,
            depth: sourceMetadata.depth,
            expectedFileDepth: sourceMetadata.depth,
            depthValidation: 'shape'
          };
        }
      };
      preparedLayerSources.push(prepared);
      estimatedMaxLayerVolumeBytes = Math.max(estimatedMaxLayerVolumeBytes, estimatePreparedLayerVolumeBytes(prepared));
      continue;
    }

    if (inputInterpretation === '2d-movie') {
      if (layer.files.length === 1) {
        const sourceMetadata: LayerMetadata = {
          width: firstMetadata.width,
          height: firstMetadata.height,
          depth: 1,
          channels: firstMetadata.channels,
          dataType: firstMetadata.dataType
        };
        const timepointCount = firstMetadata.depth;
        if (timepointCount <= 0) {
          throw new Error(`Layer "${layer.channelLabel}" did not decode any image planes.`);
        }
        const prepared: StreamingPreparedLayerSource = {
          layer,
          timepointCount,
          sourceMetadata,
          getTimepointSource: (timepoint) => ({
            kind: 'single-file',
            file: firstFile,
            startSlice: timepoint,
            depth: 1,
            expectedFileDepth: firstMetadata.depth,
            depthValidation: 'shape'
          })
        };
        preparedLayerSources.push(prepared);
        estimatedMaxLayerVolumeBytes = Math.max(
          estimatedMaxLayerVolumeBytes,
          estimatePreparedLayerVolumeBytes(prepared)
        );
        continue;
      }

      if (firstMetadata.depth !== 1) {
        throw new Error(
          `Layer "${layer.channelLabel}" in 2D movie mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${firstFile.name}" is 3D (depth ${firstMetadata.depth}).`
        );
      }

      const sourceMetadata: LayerMetadata = {
        width: firstMetadata.width,
        height: firstMetadata.height,
        depth: 1,
        channels: firstMetadata.channels,
        dataType: firstMetadata.dataType
      };
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: layer.files.length,
        sourceMetadata,
        getTimepointSource: (timepoint) => {
          const file = layer.files[timepoint];
          if (!file) {
            throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
          }
          return {
            kind: 'single-file',
            file,
            startSlice: 0,
            depth: 1,
            expectedFileDepth: 1,
            depthValidation: '2d-movie-depth1'
          };
        }
      };
      preparedLayerSources.push(prepared);
      estimatedMaxLayerVolumeBytes = Math.max(estimatedMaxLayerVolumeBytes, estimatePreparedLayerVolumeBytes(prepared));
      continue;
    }

    if (layer.files.length === 1) {
      const sourceMetadata: LayerMetadata = {
        width: firstMetadata.width,
        height: firstMetadata.height,
        depth: firstMetadata.depth,
        channels: firstMetadata.channels,
        dataType: firstMetadata.dataType
      };
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: 1,
        sourceMetadata,
        getTimepointSource: () => ({
          kind: 'single-file',
          file: firstFile,
          startSlice: 0,
          depth: sourceMetadata.depth,
          expectedFileDepth: sourceMetadata.depth,
          depthValidation: 'shape'
        })
      };
      preparedLayerSources.push(prepared);
      estimatedMaxLayerVolumeBytes = Math.max(estimatedMaxLayerVolumeBytes, estimatePreparedLayerVolumeBytes(prepared));
      continue;
    }

    if (firstMetadata.depth !== 1) {
      throw new Error(
        `Layer "${layer.channelLabel}" in Single 3D volume mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${firstFile.name}" is 3D (depth ${firstMetadata.depth}).`
      );
    }

    const sourceMetadata: LayerMetadata = {
      width: firstMetadata.width,
      height: firstMetadata.height,
      depth: layer.files.length,
      channels: firstMetadata.channels,
      dataType: firstMetadata.dataType
    };
    const prepared: StreamingPreparedLayerSource = {
      layer,
      timepointCount: 1,
      sourceMetadata,
      getTimepointSource: () => ({
        kind: 'multi-file-depth1',
        files: layer.files,
        depthValidation: 'single-3d-depth1'
      })
    };
    preparedLayerSources.push(prepared);
    estimatedMaxLayerVolumeBytes = Math.max(estimatedMaxLayerVolumeBytes, estimatePreparedLayerVolumeBytes(prepared));
  }

  return { preparedLayerSources, estimatedMaxLayerVolumeBytes };
}

type TiffByFileCache = Map<File, Promise<any>>;

async function getCachedTiffForFile(
  file: File,
  cache: TiffByFileCache,
  signal?: AbortSignal
): Promise<any> {
  throwIfAborted(signal);
  let pending = cache.get(file);
  if (!pending) {
    pending = fromBlob(file);
    cache.set(file, pending);
  }
  const tiff = await pending;
  throwIfAborted(signal);
  return tiff;
}

function formatDepthValidationError({
  validation,
  layer,
  file,
  depth
}: {
  validation: StreamingTimepointSliceSource['depthValidation'];
  layer: PreprocessLayerSource;
  file: File;
  depth: number;
}): string {
  if (validation === '2d-movie-depth1') {
    return `Layer "${layer.channelLabel}" in 2D movie mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${file.name}" is 3D (depth ${depth}).`;
  }
  if (validation === 'single-3d-depth1') {
    return `Layer "${layer.channelLabel}" in Single 3D volume mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${file.name}" is 3D (depth ${depth}).`;
  }
  return '';
}

function createShapeMismatchErrorMessage({
  layer,
  timepoint,
  width,
  height,
  depth,
  channels,
  dataType,
  expected
}: {
  layer: PreprocessLayerSource;
  timepoint: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumePayload['dataType'];
  expected: LayerMetadata;
}): string {
  return `Layer "${layer.channelLabel}" timepoint ${timepoint + 1} has shape ${width}×${height}×${depth} (${channels}ch ${dataType}) but expected ${expected.width}×${expected.height}×${expected.depth} (${expected.channels}ch ${expected.dataType}).`;
}

async function forEachSliceInStreamingTimepointSource({
  layer,
  timepoint,
  source,
  expectedMetadata,
  tiffByFileCache,
  signal,
  onSlice
}: {
  layer: PreprocessLayerSource;
  timepoint: number;
  source: StreamingTimepointSliceSource;
  expectedMetadata: LayerMetadata;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
  onSlice: (slice: SupportedTypedArray, z: number) => Promise<void> | void;
}): Promise<void> {
  const expectedSliceLength = expectedMetadata.width * expectedMetadata.height * expectedMetadata.channels;

  if (source.kind === 'single-file') {
    const tiff = await getCachedTiffForFile(source.file, tiffByFileCache, signal);
    const imageCount = await tiff.getImageCount();
    throwIfAborted(signal);

    if (source.depthValidation !== 'shape' && imageCount !== 1) {
      throw new Error(
        formatDepthValidationError({
          validation: source.depthValidation,
          layer,
          file: source.file,
          depth: imageCount
        })
      );
    }
    if (source.depthValidation === 'shape' && imageCount !== source.expectedFileDepth) {
      throw new Error(
        createShapeMismatchErrorMessage({
          layer,
          timepoint,
          width: expectedMetadata.width,
          height: expectedMetadata.height,
          depth: imageCount,
          channels: expectedMetadata.channels,
          dataType: expectedMetadata.dataType,
          expected: expectedMetadata
        })
      );
    }

    if (source.startSlice < 0 || source.startSlice + source.depth > imageCount) {
      throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
    }

    for (let localZ = 0; localZ < source.depth; localZ += 1) {
      throwIfAborted(signal);
      const imageIndex = source.startSlice + localZ;
      const image = await tiff.getImage(imageIndex);
      const width = image.getWidth();
      const height = image.getHeight();
      const channels = image.getSamplesPerPixel();
      if (width !== expectedMetadata.width || height !== expectedMetadata.height || channels !== expectedMetadata.channels) {
        throw new Error(
          createShapeMismatchErrorMessage({
            layer,
            timepoint,
            width,
            height,
            depth: source.depth,
            channels,
            dataType: expectedMetadata.dataType,
            expected: expectedMetadata
          })
        );
      }

      const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
      if (!ArrayBuffer.isView(rasterRaw)) {
        throw new Error(`File "${source.file.name}" does not provide raster data as a typed array.`);
      }
      const typed = ensureTypedArrayMatchesExpectedDataType(
        rasterRaw as SupportedTypedArray,
        expectedMetadata.dataType,
        source.file.name,
        imageIndex
      );
      if (typed.length !== expectedSliceLength) {
        throw new Error(`Slice ${imageIndex + 1} in file "${source.file.name}" returned an unexpected slice length.`);
      }
      await onSlice(typed, localZ);
    }
    return;
  }

  for (let z = 0; z < source.files.length; z += 1) {
    throwIfAborted(signal);
    const file = source.files[z];
    if (!file) {
      throw new Error(`Missing source file #${z + 1} for layer "${layer.key}".`);
    }
    const tiff = await getCachedTiffForFile(file, tiffByFileCache, signal);
    const imageCount = await tiff.getImageCount();
    if (source.depthValidation === 'single-3d-depth1' && imageCount !== 1) {
      throw new Error(
        `Layer "${layer.channelLabel}" in Single 3D volume mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${file.name}" is 3D (depth ${imageCount}).`
      );
    }

    const image = await tiff.getImage(0);
    const width = image.getWidth();
    const height = image.getHeight();
    const channels = image.getSamplesPerPixel();
    if (width !== expectedMetadata.width || height !== expectedMetadata.height || channels !== expectedMetadata.channels) {
      throw new Error(
        createShapeMismatchErrorMessage({
          layer,
          timepoint,
          width,
          height,
          depth: source.files.length,
          channels,
          dataType: expectedMetadata.dataType,
          expected: expectedMetadata
        })
      );
    }

    const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
    if (!ArrayBuffer.isView(rasterRaw)) {
      throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
    }
    const typed = ensureTypedArrayMatchesExpectedDataType(
      rasterRaw as SupportedTypedArray,
      expectedMetadata.dataType,
      file.name,
      0
    );
    if (typed.length !== expectedSliceLength) {
      throw new Error(`Slice 1 in file "${file.name}" returned an unexpected slice length.`);
    }
    await onSlice(typed, z);
  }
}

function computeNormalizationParametersFromScannedMinMax({
  dataType,
  min,
  max
}: {
  dataType: VolumePayload['dataType'];
  min: number;
  max: number;
}): NormalizationParameters {
  if (dataType === 'uint8') {
    return { min: 0, max: 255 };
  }
  let normalizedMin = Number.isFinite(min) ? min : 0;
  let normalizedMax = Number.isFinite(max) ? max : normalizedMin + 1;
  if (normalizedMin === normalizedMax) {
    // Preserve constant positive signals: avoid collapsing them to zero during uint8 normalization.
    if (normalizedMax > 0) {
      normalizedMin = 0;
    } else if (normalizedMin < 0) {
      normalizedMax = 0;
    } else {
      normalizedMax = 1;
    }
  }
  return { min: normalizedMin, max: normalizedMax };
}

function normalizeSliceToUint8({
  source,
  dataType,
  parameters
}: {
  source: SupportedTypedArray;
  dataType: VolumePayload['dataType'];
  parameters: NormalizationParameters;
}): Uint8Array {
  if (dataType === 'uint8' && parameters.min === 0 && parameters.max === 255 && source instanceof Uint8Array) {
    return source;
  }

  const range = parameters.max - parameters.min || 1;
  const normalized = new Uint8Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    const normalizedValue = ((source[i] as number) - parameters.min) / range;
    const clamped = Math.max(0, Math.min(1, normalizedValue));
    normalized[i] = Math.round(clamped * 255);
  }
  return normalized;
}

function colorizeSegmentationSlice({
  source,
  colorTable
}: {
  source: SupportedTypedArray;
  colorTable: Uint8Array;
}): { normalized: Uint8Array; labels: Uint32Array } {
  const labels = new Uint32Array(source.length);
  const normalized = new Uint8Array(source.length * 4);
  const maxLabel = Math.floor(colorTable.length / 3) - 1;
  for (let i = 0; i < source.length; i += 1) {
    const rawLabel = toSegmentationLabelId(source[i] as number);
    const label = rawLabel > maxLabel ? maxLabel : rawLabel;
    labels[i] = label;
    const tableIndex = label * 3;
    const destination = i * 4;
    normalized[destination] = colorTable[tableIndex] ?? 0;
    normalized[destination + 1] = colorTable[tableIndex + 1] ?? 0;
    normalized[destination + 2] = colorTable[tableIndex + 2] ?? 0;
    normalized[destination + 3] = label === 0 ? 0 : 255;
  }
  return { normalized, labels };
}

function downsampleDataSliceXYByMax({
  source,
  width,
  height,
  channels
}: {
  source: Uint8Array;
  width: number;
  height: number;
  channels: number;
}): Uint8Array {
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const downsampled = new Uint8Array(nextWidth * nextHeight * channels);

  for (let y = 0; y < nextHeight; y += 1) {
    const sourceYStart = y * 2;
    const sourceYEnd = Math.min(height, sourceYStart + 2);
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceXStart = x * 2;
      const sourceXEnd = Math.min(width, sourceXStart + 2);
      const destinationBase = (y * nextWidth + x) * channels;
      for (let channel = 0; channel < channels; channel += 1) {
        let maxValue = 0;
        for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
          for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
            const sourceIndex = (sourceY * width + sourceX) * channels + channel;
            const value = source[sourceIndex] ?? 0;
            if (value > maxValue) {
              maxValue = value;
            }
          }
        }
        downsampled[destinationBase + channel] = maxValue;
      }
    }
  }

  return downsampled;
}

function mergeDataSlicesByMaxInPlace(target: Uint8Array, candidate: Uint8Array): void {
  if (target.length !== candidate.length) {
    throw new Error(`Cannot merge slices with different lengths (${target.length} vs ${candidate.length}).`);
  }
  for (let i = 0; i < target.length; i += 1) {
    if ((candidate[i] ?? 0) > (target[i] ?? 0)) {
      target[i] = candidate[i] ?? 0;
    }
  }
}

function downsampleLabelSlicesByMode({
  first,
  second,
  width,
  height
}: {
  first: Uint32Array;
  second: Uint32Array | null;
  width: number;
  height: number;
}): Uint32Array {
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const downsampled = new Uint32Array(nextWidth * nextHeight);

  for (let y = 0; y < nextHeight; y += 1) {
    const sourceYStart = y * 2;
    const sourceYEnd = Math.min(height, sourceYStart + 2);
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceXStart = x * 2;
      const sourceXEnd = Math.min(width, sourceXStart + 2);
      const destinationIndex = y * nextWidth + x;

      const candidateLabels = new Uint32Array(8);
      const candidateCounts = new Uint8Array(8);
      let candidateSize = 0;
      let bestLabel = 0;
      let bestCount = -1;

      const accumulate = (slice: Uint32Array) => {
        for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
          for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
            const label = slice[sourceY * width + sourceX] ?? 0;
            let slot = -1;
            for (let candidateIndex = 0; candidateIndex < candidateSize; candidateIndex += 1) {
              if ((candidateLabels[candidateIndex] ?? 0) === label) {
                slot = candidateIndex;
                break;
              }
            }
            if (slot < 0) {
              slot = candidateSize;
              candidateLabels[slot] = label;
              candidateCounts[slot] = 0;
              candidateSize += 1;
            }
            const nextCount = (candidateCounts[slot] ?? 0) + 1;
            candidateCounts[slot] = nextCount;
            if (
              nextCount > bestCount ||
              (nextCount === bestCount && bestLabel === 0 && label !== 0) ||
              (nextCount === bestCount && label > bestLabel)
            ) {
              bestCount = nextCount;
              bestLabel = label;
            }
          }
        }
      };

      accumulate(first);
      if (second) {
        accumulate(second);
      }

      downsampled[destinationIndex] = bestLabel;
    }
  }

  return downsampled;
}

async function prepareLayerSources({
  sortedLayerSources,
  inputInterpretation,
  volumeLoader,
  decodedVolumeCacheByLayerKey,
  signal
}: {
  sortedLayerSources: PreprocessLayerSource[];
  inputInterpretation: PreprocessInputInterpretation;
  volumeLoader: LoadVolumesFromFiles;
  decodedVolumeCacheByLayerKey: DecodedVolumeCacheByLayerKey;
  signal?: AbortSignal;
}): Promise<PreparedLayerSource[]> {
  const prepared: PreparedLayerSource[] = [];

  for (const layer of sortedLayerSources) {
    throwIfAborted(signal);
    if (layer.files.length === 0) {
      throw new Error(`Layer "${layer.channelLabel}" does not contain TIFF files.`);
    }

    if (inputInterpretation === '3d-movie') {
      const timepointCount = layer.files.length;
      prepared.push({
        layer,
        timepointCount,
        getTimepointVolume: async (timepoint, nextSignal) => {
          if (timepoint < 0 || timepoint >= timepointCount) {
            throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
          }
          return loadLayerVolumeByFileIndex({
            layer,
            fileIndex: timepoint,
            loader: volumeLoader,
            decodedVolumeCacheByLayerKey,
            signal: nextSignal
          });
        }
      });
      continue;
    }

    if (inputInterpretation === '2d-movie') {
      if (layer.files.length === 1) {
        const sourceVolume = await loadLayerVolumeByFileIndex({
          layer,
          fileIndex: 0,
          loader: volumeLoader,
          decodedVolumeCacheByLayerKey,
          signal
        });
        const timepointCount = sourceVolume.depth;
        if (timepointCount <= 0) {
          throw new Error(`Layer "${layer.channelLabel}" did not decode any image planes.`);
        }
        const splitTimepointCache = new Map<number, VolumePayload>();
        prepared.push({
          layer,
          timepointCount,
          getTimepointVolume: async (timepoint) => {
            if (timepoint < 0 || timepoint >= timepointCount) {
              throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
            }
            const cached = splitTimepointCache.get(timepoint);
            if (cached) {
              return cached;
            }
            const split = createDepthOneVolumeFromSlice({
              volume: sourceVolume,
              sliceIndex: timepoint,
              context: `Layer "${layer.channelLabel}" (2D movie)`
            });
            splitTimepointCache.set(timepoint, split);
            return split;
          }
        });
      } else {
        const timepointCount = layer.files.length;
        prepared.push({
          layer,
          timepointCount,
          getTimepointVolume: async (timepoint, nextSignal) => {
            if (timepoint < 0 || timepoint >= timepointCount) {
              throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
            }
            const volume = await loadLayerVolumeByFileIndex({
              layer,
              fileIndex: timepoint,
              loader: volumeLoader,
              decodedVolumeCacheByLayerKey,
              signal: nextSignal
            });
            if (volume.depth !== 1) {
              throw new Error(
                `Layer "${layer.channelLabel}" in 2D movie mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${layer.files[timepoint]?.name ?? `#${timepoint + 1}`}" is 3D (depth ${volume.depth}).`
              );
            }
            return volume;
          }
        });
      }
      continue;
    }

    if (layer.files.length === 1) {
      prepared.push({
        layer,
        timepointCount: 1,
        getTimepointVolume: async (timepoint, nextSignal) => {
          if (timepoint !== 0) {
            throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
          }
          return loadLayerVolumeByFileIndex({
            layer,
            fileIndex: 0,
            loader: volumeLoader,
            decodedVolumeCacheByLayerKey,
            signal: nextSignal
          });
        }
      });
      continue;
    }

    let stackedVolumePromise: Promise<VolumePayload> | null = null;
    prepared.push({
      layer,
      timepointCount: 1,
      getTimepointVolume: async (timepoint, nextSignal) => {
        if (timepoint !== 0) {
          throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
        }
        if (!stackedVolumePromise) {
          stackedVolumePromise = (async () => {
            const slices: VolumePayload[] = [];
            for (let fileIndex = 0; fileIndex < layer.files.length; fileIndex += 1) {
              const volume = await loadLayerVolumeByFileIndex({
                layer,
                fileIndex,
                loader: volumeLoader,
                decodedVolumeCacheByLayerKey,
                signal: nextSignal
              });
              if (volume.depth !== 1) {
                throw new Error(
                  `Layer "${layer.channelLabel}" in Single 3D volume mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${layer.files[fileIndex]?.name ?? `#${fileIndex + 1}`}" is 3D (depth ${volume.depth}).`
                );
              }
              slices.push(volume);
            }
            return stackDepthOneVolumes({
              volumes: slices,
              context: `Layer "${layer.channelLabel}" (Single 3D volume)`
            });
          })();
        }
        return stackedVolumePromise;
      }
    });
  }

  return prepared;
}

let cachedDefaultVolumeLoader: LoadVolumesFromFiles | null = null;

async function resolveVolumeLoader(
  providedLoader: LoadVolumesFromFiles | undefined
): Promise<LoadVolumesFromFiles> {
  if (providedLoader) {
    return providedLoader;
  }
  if (cachedDefaultVolumeLoader) {
    return cachedDefaultVolumeLoader;
  }
  const module = await import('../../../loaders/volumeLoader');
  cachedDefaultVolumeLoader = module.loadVolumesFromFiles;
  return cachedDefaultVolumeLoader;
}

type LayerMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumePayload['dataType'];
};

async function computeLayerTimepointMetadata({
  preparedLayerSources,
  signal
}: {
  preparedLayerSources: Array<{ timepointCount: number }>;
  signal?: AbortSignal;
}): Promise<{
  expectedTimepoints: number;
}> {
  const layerTimepointCounts: number[] = [];

  for (const layer of preparedLayerSources) {
    throwIfAborted(signal);
    layerTimepointCounts.push(layer.timepointCount);
  }

  const expectedTimepoints = layerTimepointCounts[0] ?? 0;
  if (expectedTimepoints <= 0) {
    throw new Error('The selected dataset does not contain any TIFF frames.');
  }
  for (let index = 0; index < layerTimepointCounts.length; index += 1) {
    if (layerTimepointCounts[index] !== expectedTimepoints) {
      throw new Error('All layers must contain the same number of timepoints.');
    }
  }

  return {
    expectedTimepoints
  };
}

function selectFirstNonSegmentationPreparedLayer<T extends { layer: PreprocessLayerSource }>(
  preparedLayerSources: T[]
): T | null {
  for (const preparedLayer of preparedLayerSources) {
    if (!preparedLayer.layer.isSegmentation) {
      return preparedLayer;
    }
  }
  return null;
}

function computeRepresentativeNormalization(
  volume: VolumePayload,
  backgroundMask: BackgroundMaskVolume | null
): NormalizationParameters {
  if (!backgroundMask) {
    return computeNormalizationParameters([volume]);
  }
  const source = createVolumeTypedArray(volume.dataType, volume.data);
  const { min, max } = findMinMaxExcludingBackgroundMask({
    source,
    channels: volume.channels,
    mask: backgroundMask.data
  });
  return computeNormalizationParametersFromScannedMinMax({
    dataType: volume.dataType,
    min,
    max
  });
}

async function buildBackgroundMaskForPreparedLayers({
  preparedLayerSources,
  backgroundMaskValues,
  shardingStrategy,
  signal
}: {
  preparedLayerSources: PreparedLayerSource[];
  backgroundMaskValues: number[] | null | undefined;
  shardingStrategy: ShardingStrategy;
  signal?: AbortSignal;
}): Promise<SharedBackgroundMask | null> {
  if (!backgroundMaskValues || backgroundMaskValues.length === 0) {
    return null;
  }

  const preparedLayer = selectFirstNonSegmentationPreparedLayer(preparedLayerSources);
  if (!preparedLayer) {
    throw new Error('Background mask requires at least one non-segmentation channel.');
  }

  const volume = await preparedLayer.getTimepointVolume(0, signal);
  const coercedValues = coerceBackgroundMaskValuesForDataType(backgroundMaskValues, volume.dataType);
  const source = createVolumeTypedArray(volume.dataType, volume.data);
  const baseMask = buildBackgroundMaskFromTypedArray({
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    channels: volume.channels,
    source,
    values: coercedValues
  });
  return buildBackgroundMaskScales({
    baseMask,
    sourceLayerKey: preparedLayer.layer.key,
    sourceDataType: volume.dataType,
    values: coercedValues,
    shardingStrategy
  });
}

async function buildBackgroundMaskForStreamingPreparedLayers({
  preparedLayerSources,
  backgroundMaskValues,
  shardingStrategy,
  tiffByFileCache,
  signal
}: {
  preparedLayerSources: StreamingPreparedLayerSource[];
  backgroundMaskValues: number[] | null | undefined;
  shardingStrategy: ShardingStrategy;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
}): Promise<SharedBackgroundMask | null> {
  if (!backgroundMaskValues || backgroundMaskValues.length === 0) {
    return null;
  }

  const preparedLayer = selectFirstNonSegmentationPreparedLayer(preparedLayerSources);
  if (!preparedLayer) {
    throw new Error('Background mask requires at least one non-segmentation channel.');
  }

  const sourceMetadata = preparedLayer.sourceMetadata;
  const coercedValues = coerceBackgroundMaskValuesForDataType(backgroundMaskValues, sourceMetadata.dataType);
  const raw = createWritableVolumeArray(
    sourceMetadata.dataType,
    sourceMetadata.width * sourceMetadata.height * sourceMetadata.depth * sourceMetadata.channels
  ) as VolumeTypedArray;
  const sliceLength = sourceMetadata.width * sourceMetadata.height * sourceMetadata.channels;
  const timepointSource = preparedLayer.getTimepointSource(0);

  await forEachSliceInStreamingTimepointSource({
    layer: preparedLayer.layer,
    timepoint: 0,
    source: timepointSource,
    expectedMetadata: sourceMetadata,
    tiffByFileCache,
    signal,
    onSlice: (slice, z) => {
      raw.set(slice, z * sliceLength);
    }
  });

  const baseMask = buildBackgroundMaskFromTypedArray({
    width: sourceMetadata.width,
    height: sourceMetadata.height,
    depth: sourceMetadata.depth,
    channels: sourceMetadata.channels,
    source: raw,
    values: coercedValues
  });
  return buildBackgroundMaskScales({
    baseMask,
    sourceLayerKey: preparedLayer.layer.key,
    sourceDataType: sourceMetadata.dataType,
    values: coercedValues,
    shardingStrategy
  });
}

async function computeLayerRepresentativeNormalization({
  preparedLayerSources,
  representativeTimepoint,
  backgroundMask,
  signal,
  onProgress
}: {
  preparedLayerSources: PreparedLayerSource[];
  representativeTimepoint: number;
  backgroundMask: SharedBackgroundMask | null;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
}): Promise<Map<string, NormalizationParameters>> {
  const normalizationByLayerKey = new Map<string, NormalizationParameters>();

  for (const preparedLayer of preparedLayerSources) {
    const layer = preparedLayer.layer;
    if (layer.isSegmentation) {
      continue;
    }

    throwIfAborted(signal);
    onProgress?.({ stage: 'rep-stats', layerKey: layer.key });

    const volume = await preparedLayer.getTimepointVolume(representativeTimepoint, signal);
    normalizationByLayerKey.set(
      layer.key,
      computeRepresentativeNormalization(volume, backgroundMask?.scales[0] ?? null)
    );
  }

  return normalizationByLayerKey;
}

async function computeLayerRepresentativeNormalizationForStreaming({
  preparedLayerSources,
  representativeTimepoint,
  backgroundMask,
  tiffByFileCache,
  signal,
  onProgress
}: {
  preparedLayerSources: StreamingPreparedLayerSource[];
  representativeTimepoint: number;
  backgroundMask: SharedBackgroundMask | null;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
}): Promise<Map<string, NormalizationParameters>> {
  const normalizationByLayerKey = new Map<string, NormalizationParameters>();

  for (const preparedLayer of preparedLayerSources) {
    const layer = preparedLayer.layer;
    if (layer.isSegmentation) {
      continue;
    }
    throwIfAborted(signal);
    onProgress?.({ stage: 'rep-stats', layerKey: layer.key });

    const source = preparedLayer.getTimepointSource(representativeTimepoint);
    let scannedMin = Number.POSITIVE_INFINITY;
    let scannedMax = Number.NEGATIVE_INFINITY;
    let sliceCount = 0;
    const maskData = backgroundMask?.scales[0]?.data ?? null;
    const maskSliceLength =
      (backgroundMask?.scales[0]?.width ?? 0) * (backgroundMask?.scales[0]?.height ?? 0);

    await forEachSliceInStreamingTimepointSource({
      layer,
      timepoint: representativeTimepoint,
      source,
      expectedMetadata: preparedLayer.sourceMetadata,
      tiffByFileCache,
      signal,
      onSlice: (slice, z) => {
        const maskSlice =
          maskData && maskSliceLength > 0
            ? maskData.subarray(z * maskSliceLength, (z + 1) * maskSliceLength)
            : null;
        const { min, max } = findMinMaxExcludingBackgroundMask({
          source: slice,
          channels: preparedLayer.sourceMetadata.channels,
          mask: maskSlice
        });
        if (Number.isFinite(min) && min < scannedMin) {
          scannedMin = min;
        }
        if (Number.isFinite(max) && max > scannedMax) {
          scannedMax = max;
        }
        sliceCount += 1;
      }
    });

    if (sliceCount <= 0) {
      throw new Error(`Layer "${layer.channelLabel}" did not decode any image planes.`);
    }
    normalizationByLayerKey.set(
      layer.key,
      computeNormalizationParametersFromScannedMinMax({
        dataType: preparedLayer.sourceMetadata.dataType,
        min: scannedMin,
        max: scannedMax
      })
    );
  }

  return normalizationByLayerKey;
}

async function collectLayerMetadata({
  preparedLayerSources,
  signal
}: {
  preparedLayerSources: PreparedLayerSource[];
  signal?: AbortSignal;
}): Promise<{
  sourceMetadataByLayerKey: Map<string, LayerMetadata>;
  layerMetadataByKey: Map<string, LayerMetadata>;
}> {
  let referenceShape3d: { width: number; height: number; depth: number } | null = null;

  const sourceMetadataByLayerKey = new Map<string, LayerMetadata>();
  const layerMetadataByKey = new Map<string, LayerMetadata>();

  for (const preparedLayer of preparedLayerSources) {
    const layer = preparedLayer.layer;
    throwIfAborted(signal);

    const firstVolume = await preparedLayer.getTimepointVolume(0, signal);
    sourceMetadataByLayerKey.set(layer.key, {
      width: firstVolume.width,
      height: firstVolume.height,
      depth: firstVolume.depth,
      channels: firstVolume.channels,
      dataType: firstVolume.dataType
    });
    layerMetadataByKey.set(layer.key, {
      width: firstVolume.width,
      height: firstVolume.height,
      depth: firstVolume.depth,
      channels: layer.isSegmentation ? 4 : firstVolume.channels,
      dataType: layer.isSegmentation ? 'uint8' : firstVolume.dataType
    });
    if (!referenceShape3d) {
      referenceShape3d = {
        width: firstVolume.width,
        height: firstVolume.height,
        depth: firstVolume.depth
      };
    } else if (
      firstVolume.width !== referenceShape3d.width ||
      firstVolume.height !== referenceShape3d.height ||
      firstVolume.depth !== referenceShape3d.depth
    ) {
      throw new Error(
        `Channel "${layer.channelLabel}" has volume dimensions ${firstVolume.width}×${firstVolume.height}×${firstVolume.depth} that do not match the reference shape ${referenceShape3d.width}×${referenceShape3d.height}×${referenceShape3d.depth}.`
      );
    }
  }

  return {
    sourceMetadataByLayerKey,
    layerMetadataByKey
  };
}

function collectLayerMetadataFromStreamingSources({
  preparedLayerSources
}: {
  preparedLayerSources: StreamingPreparedLayerSource[];
}): {
  sourceMetadataByLayerKey: Map<string, LayerMetadata>;
  layerMetadataByKey: Map<string, LayerMetadata>;
} {
  let referenceShape3d: { width: number; height: number; depth: number } | null = null;
  const sourceMetadataByLayerKey = new Map<string, LayerMetadata>();
  const layerMetadataByKey = new Map<string, LayerMetadata>();

  for (const preparedLayer of preparedLayerSources) {
    const layer = preparedLayer.layer;
    const source = preparedLayer.sourceMetadata;
    sourceMetadataByLayerKey.set(layer.key, {
      width: source.width,
      height: source.height,
      depth: source.depth,
      channels: source.channels,
      dataType: source.dataType
    });
    layerMetadataByKey.set(layer.key, {
      width: source.width,
      height: source.height,
      depth: source.depth,
      channels: layer.isSegmentation ? 4 : source.channels,
      dataType: layer.isSegmentation ? 'uint8' : source.dataType
    });

    if (!referenceShape3d) {
      referenceShape3d = {
        width: source.width,
        height: source.height,
        depth: source.depth
      };
      continue;
    }
    if (
      source.width !== referenceShape3d.width ||
      source.height !== referenceShape3d.height ||
      source.depth !== referenceShape3d.depth
    ) {
      throw new Error(
        `Channel "${layer.channelLabel}" has volume dimensions ${source.width}×${source.height}×${source.depth} that do not match the reference shape ${referenceShape3d.width}×${referenceShape3d.height}×${referenceShape3d.depth}.`
      );
    }
  }

  return { sourceMetadataByLayerKey, layerMetadataByKey };
}

function groupLayersByChannel(sortedLayerSources: PreprocessLayerSource[]): Map<string, PreprocessLayerSource[]> {
  const layersByChannel = new Map<string, PreprocessLayerSource[]>();
  for (const layer of sortedLayerSources) {
    const bucket = layersByChannel.get(layer.channelId);
    if (bucket) {
      bucket.push(layer);
    } else {
      layersByChannel.set(layer.channelId, [layer]);
    }
  }
  return layersByChannel;
}

function validateSingleVolumePerChannel({
  channels,
  layersByChannel
}: {
  channels: ChannelExportMetadata[];
  layersByChannel: Map<string, PreprocessLayerSource[]>;
}): void {
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));

  for (const [channelId, layerSources] of layersByChannel) {
    const channel = channelById.get(channelId);
    if (!channel) {
      throw new Error(`Layer source references unknown channel "${channelId}".`);
    }
    if (layerSources.length > 1) {
      throw new Error(
        `Channel "${channel.name}" contains ${layerSources.length} volumes. This build requires exactly one volume per channel.`
      );
    }
  }

  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    if (layerSources.length === 0) {
      throw new Error(`Channel "${channel.name}" has no volume. This build requires exactly one volume per channel.`);
    }
  }
}

function buildManifestFromLayerMetadata({
  channels,
  trackSets,
  layersByChannel,
  layerMetadataByKey,
  expectedTimepoints,
  normalizationByLayerKey,
  movieMode,
  totalVolumeCount,
  voxelResolution,
  backgroundMask,
  shardingStrategy,
  preferDepthChunkOne
}: {
  channels: ChannelExportMetadata[];
  trackSets: TrackSetExportMetadata[];
  layersByChannel: Map<string, PreprocessLayerSource[]>;
  layerMetadataByKey: Map<string, LayerMetadata>;
  expectedTimepoints: number;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  movieMode: PreprocessedMovieMode;
  totalVolumeCount: number;
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
  backgroundMask: SharedBackgroundMask | null;
  shardingStrategy: ShardingStrategy;
  preferDepthChunkOne?: boolean;
}): {
  manifest: PreprocessedManifest;
  layerManifestByKey: Map<string, PreprocessedLayerManifestEntry>;
  trackEntriesByTrackSetId: Map<string, string[][]>;
} {
  const manifestChannels: PreprocessedManifest['dataset']['channels'] = [];
  const layerManifestByKey = new Map<string, PreprocessedLayerManifestEntry>();
  const trackEntriesByTrackSetId = new Map<string, string[][]>();
  const manifestTrackSets: PreprocessedManifest['dataset']['trackSets'] = trackSets.map((trackSet) => {
    trackEntriesByTrackSetId.set(trackSet.id, trackSet.entries);
    return {
      id: trackSet.id,
      name: trackSet.name,
      fileName: trackSet.fileName,
      boundChannelId: trackSet.boundChannelId,
      tracks: createTracksDescriptor(`tracks/${encodeURIComponent(trackSet.id)}.csv`)
    };
  });

  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    const manifestLayers: PreprocessedLayerManifestEntry[] = [];

    for (const layer of layerSources) {
      const layerMetadata = layerMetadataByKey.get(layer.key);
      if (!layerMetadata) {
        throw new Error(`Missing metadata for layer "${layer.key}".`);
      }

      const scales = buildLayerScaleDescriptors({
        layer,
        layerMetadata,
        expectedTimepoints,
        shardingStrategy,
        preferDepthChunkOne
      });

      const manifestLayer: PreprocessedLayerManifestEntry = {
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        isSegmentation: layer.isSegmentation,
        volumeCount: expectedTimepoints,
        width: layerMetadata.width,
        height: layerMetadata.height,
        depth: layerMetadata.depth,
        channels: layerMetadata.channels,
        dataType: layerMetadata.dataType,
        normalization: layer.isSegmentation
          ? { min: 0, max: 255 }
          : (normalizationByLayerKey.get(layer.key) ?? null),
        zarr: {
          scales
        }
      };

      manifestLayers.push(manifestLayer);
      layerManifestByKey.set(layer.key, manifestLayer);
    }

    manifestChannels.push({
      id: channel.id,
      name: channel.name,
      layers: manifestLayers
    });
  }

  const anisotropyScale = computeAnisotropyScale(voxelResolution);
  const anisotropyCorrection = anisotropyScale ? { scale: anisotropyScale } : null;
  const manifestBackgroundMask: PreprocessedBackgroundMaskManifest | null = backgroundMask
    ? {
        sourceLayerKey: backgroundMask.sourceLayerKey,
        sourceDataType: backgroundMask.sourceDataType,
        values: [...backgroundMask.values],
        zarr: {
          scales: backgroundMask.scales.map((scale) => ({
            level: scale.level,
            downsampleFactor: scale.downsampleFactor,
            width: scale.width,
            height: scale.height,
            depth: scale.depth,
            zarr: {
              data: scale.zarr.data
            }
          }))
        }
      }
    : null;

  const manifest: PreprocessedManifest = {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode,
      totalVolumeCount,
      channels: manifestChannels,
      trackSets: manifestTrackSets,
      voxelResolution,
      anisotropyCorrection,
      backgroundMask: manifestBackgroundMask
    }
  };

  return {
    manifest,
    layerManifestByKey,
    trackEntriesByTrackSetId
  };
}

async function writeTrackSetCsvFiles({
  manifest,
  trackEntriesByTrackSetId,
  storage
}: {
  manifest: PreprocessedManifest;
  trackEntriesByTrackSetId: Map<string, string[][]>;
  storage: PreprocessedStorage;
}): Promise<void> {
  for (const trackSet of manifest.dataset.trackSets) {
    const entries = trackEntriesByTrackSetId.get(trackSet.id) ?? [];
    const payload = serializeTrackEntriesToCsvBytes(entries, { decimalPlaces: trackSet.tracks.decimalPlaces });
    await storage.writeFile(trackSet.tracks.path, payload);
  }
}

function resolveArrayCodecsForDescriptor(descriptor: ZarrArrayDescriptor): any[] {
  // Sharded writes are handled by the custom chunk dispatcher, not by Zarr codec-based set/indexing.
  // Keep array metadata unsharded at the codec layer and store shard payloads under descriptor.path/shards/.
  void descriptor;
  return [];
}

async function createManifestZarrArrays({
  root,
  manifest
}: {
  root: any;
  manifest: PreprocessedManifest;
}): Promise<void> {
  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      for (const scale of layer.zarr.scales) {
        const data = scale.zarr.data;
        await zarr.create(root.resolve(data.path), {
          shape: data.shape,
          data_type: data.dataType,
          chunk_shape: data.chunkShape,
          codecs: resolveArrayCodecsForDescriptor(data),
          fill_value: 0
        });

        for (const hierarchyLevel of scale.zarr.skipHierarchy.levels) {
          await zarr.create(root.resolve(hierarchyLevel.occupancy.path), {
            shape: hierarchyLevel.occupancy.shape,
            data_type: hierarchyLevel.occupancy.dataType,
            chunk_shape: hierarchyLevel.occupancy.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(hierarchyLevel.occupancy),
            fill_value: 0
          });
          await zarr.create(root.resolve(hierarchyLevel.min.path), {
            shape: hierarchyLevel.min.shape,
            data_type: hierarchyLevel.min.dataType,
            chunk_shape: hierarchyLevel.min.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(hierarchyLevel.min),
            fill_value: 0
          });
          await zarr.create(root.resolve(hierarchyLevel.max.path), {
            shape: hierarchyLevel.max.shape,
            data_type: hierarchyLevel.max.dataType,
            chunk_shape: hierarchyLevel.max.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(hierarchyLevel.max),
            fill_value: 0
          });
        }

        const histogram = scale.zarr.histogram;
        await zarr.create(root.resolve(histogram.path), {
          shape: histogram.shape,
          data_type: histogram.dataType,
          chunk_shape: histogram.chunkShape,
          codecs: resolveArrayCodecsForDescriptor(histogram),
          fill_value: 0
        });

        if (scale.zarr.labels) {
          const labels = scale.zarr.labels;
          await zarr.create(root.resolve(labels.path), {
            shape: labels.shape,
            data_type: labels.dataType,
            chunk_shape: labels.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(labels),
            fill_value: 0
          });
        }
      }
    }
  }

  for (const scale of manifest.dataset.backgroundMask?.zarr.scales ?? []) {
    const data = scale.zarr.data;
    await zarr.create(root.resolve(data.path), {
      shape: data.shape,
      data_type: data.dataType,
      chunk_shape: data.chunkShape,
      codecs: resolveArrayCodecsForDescriptor(data),
      fill_value: 0
    });
  }
}

function chunkStart(chunkIndex: number, chunkSize: number): number {
  return chunkIndex * chunkSize;
}

function chunkLength(totalSize: number, start: number, chunkSize: number): number {
  return Math.max(0, Math.min(chunkSize, totalSize - start));
}

function extractDataChunkBytesAndComputeStatistics({
  source,
  width,
  height,
  channels,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength,
  histogram,
  backgroundMask
}: {
  source: Uint8Array;
  width: number;
  height: number;
  channels: number;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
  histogram: Uint32Array;
  backgroundMask?: BackgroundMaskVolume | null;
}): {
  chunk: Uint8Array;
  stats: {
    min: number;
    max: number;
    occupancy: number;
  };
} {
  if (channels <= 0) {
    throw new Error(`Invalid channel count while computing chunk statistics: ${channels}.`);
  }
  if (histogram.length !== HISTOGRAM_BINS) {
    throw new Error(
      `Histogram length mismatch while computing chunk statistics: expected ${HISTOGRAM_BINS}, got ${histogram.length}.`
    );
  }

  const rowStride = width * channels;
  const planeStride = height * rowStride;
  const maskRowStride = width;
  const maskPlaneStride = height * maskRowStride;
  const lineLength = xLength * channels;
  const chunk = new Uint8Array(zLength * yLength * lineLength);
  if (chunk.length === 0) {
    return {
      chunk,
      stats: { min: 0, max: 0, occupancy: 0 }
    };
  }
  if (
    backgroundMask &&
    (
      backgroundMask.width !== width ||
      backgroundMask.height !== height ||
      backgroundMask.depth < zStart + zLength
    )
  ) {
    throw new Error('Background mask dimensions do not match the chunk source dimensions.');
  }

  let min = 255;
  let max = 0;
  let occupiedVoxelCount = 0;
  const voxelCount = zLength * yLength * xLength;
  let consideredVoxelCount = 0;

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    const maskZBase = backgroundMask ? (zStart + localZ) * maskPlaneStride : 0;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart * channels;
      const sourceLine = source.subarray(sourceOffset, sourceOffset + lineLength);
      chunk.set(sourceLine, destinationOffset);
      const maskOffset = maskZBase + (yStart + localY) * maskRowStride + xStart;
      const maskLine = backgroundMask
        ? backgroundMask.data.subarray(maskOffset, maskOffset + xLength)
        : null;

      if (channels === 1) {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const value = sourceLine[voxelIndex] ?? 0;
          if (value < min) {
            min = value;
          }
          if (value > max) {
            max = value;
          }
          if (value > 0) {
            occupiedVoxelCount += 1;
          }
          histogram[value] += 1;
          consideredVoxelCount += 1;
        }
      } else if (channels === 2) {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const voxelBase = voxelIndex * 2;
          const red = sourceLine[voxelBase] ?? 0;
          const green = sourceLine[voxelBase + 1] ?? 0;
          if (red < min) {
            min = red;
          }
          if (green < min) {
            min = green;
          }
          if (red > max) {
            max = red;
          }
          if (green > max) {
            max = green;
          }
          if (red > 0 || green > 0) {
            occupiedVoxelCount += 1;
          }
          histogram[Math.round((red + green) * 0.5)] += 1;
          consideredVoxelCount += 1;
        }
      } else {
        for (let voxelIndex = 0; voxelIndex < xLength; voxelIndex += 1) {
          if (maskLine && (maskLine[voxelIndex] ?? 0) > 0) {
            continue;
          }
          const voxelBase = voxelIndex * channels;
          const red = sourceLine[voxelBase] ?? 0;
          const green = sourceLine[voxelBase + 1] ?? 0;
          const blue = sourceLine[voxelBase + 2] ?? 0;
          let voxelMin = red;
          let voxelMax = red;
          let voxelOccupied = red > 0 || green > 0 || blue > 0;

          if (green < voxelMin) {
            voxelMin = green;
          }
          if (green > voxelMax) {
            voxelMax = green;
          }
          if (blue < voxelMin) {
            voxelMin = blue;
          }
          if (blue > voxelMax) {
            voxelMax = blue;
          }

          for (let channel = 3; channel < channels; channel += 1) {
            const value = sourceLine[voxelBase + channel] ?? 0;
            if (value < voxelMin) {
              voxelMin = value;
            }
            if (value > voxelMax) {
              voxelMax = value;
            }
            if (!voxelOccupied && value > 0) {
              voxelOccupied = true;
            }
          }

          if (voxelMin < min) {
            min = voxelMin;
          }
          if (voxelMax > max) {
            max = voxelMax;
          }

          const intensity = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
          const clampedIntensity = intensity < 0 ? 0 : intensity > 255 ? 255 : intensity;
          histogram[clampedIntensity] += 1;

          if (voxelOccupied) {
            occupiedVoxelCount += 1;
          }
          consideredVoxelCount += 1;
        }
      }

      destinationOffset += lineLength;
    }
  }

  return {
    chunk,
    stats: {
      min: consideredVoxelCount > 0 ? min : 0,
      max: consideredVoxelCount > 0 ? max : 0,
      occupancy: voxelCount > 0 ? occupiedVoxelCount / voxelCount : 0
    }
  };
}

function extractBackgroundMaskChunkBytes({
  source,
  width,
  height,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength
}: {
  source: Uint8Array;
  width: number;
  height: number;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
}): Uint8Array {
  const rowStride = width;
  const planeStride = height * rowStride;
  const chunk = new Uint8Array(zLength * yLength * xLength);

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart;
      const sourceLine = source.subarray(sourceOffset, sourceOffset + xLength);
      chunk.set(sourceLine, destinationOffset);
      destinationOffset += xLength;
    }
  }

  return chunk;
}

function extractLabelChunkBytes({
  source,
  width,
  height,
  zStart,
  zLength,
  yStart,
  yLength,
  xStart,
  xLength
}: {
  source: Uint32Array;
  width: number;
  height: number;
  zStart: number;
  zLength: number;
  yStart: number;
  yLength: number;
  xStart: number;
  xLength: number;
}): Uint8Array {
  const rowStride = width;
  const planeStride = height * rowStride;
  const chunkValues = new Uint32Array(zLength * yLength * xLength);

  let destinationOffset = 0;
  for (let localZ = 0; localZ < zLength; localZ += 1) {
    const sourceZBase = (zStart + localZ) * planeStride;
    for (let localY = 0; localY < yLength; localY += 1) {
      const sourceOffset = sourceZBase + (yStart + localY) * rowStride + xStart;
      chunkValues.set(source.subarray(sourceOffset, sourceOffset + xLength), destinationOffset);
      destinationOffset += xLength;
    }
  }

  return new Uint8Array(chunkValues.buffer);
}

function assertSkipHierarchyDescriptorMatchesGrid({
  descriptor,
  expectedTimepoints,
  expectedGridShape,
  expectedDataType,
  label
}: {
  descriptor: ZarrArrayDescriptor;
  expectedTimepoints: number;
  expectedGridShape: [number, number, number];
  expectedDataType: ZarrArrayDescriptor['dataType'];
  label: string;
}): void {
  if (descriptor.dataType !== expectedDataType) {
    throw new Error(
      `Skip hierarchy descriptor dtype mismatch for ${label} (${descriptor.path}): expected ${expectedDataType}, got ${descriptor.dataType}.`
    );
  }
  if (descriptor.shape.length !== 4) {
    throw new Error(`Skip hierarchy descriptor for ${label} (${descriptor.path}) must have rank 4.`);
  }
  const [shapeTimepoints, shapeZ, shapeY, shapeX] = descriptor.shape;
  if (
    shapeTimepoints !== expectedTimepoints ||
    shapeZ !== expectedGridShape[0] ||
    shapeY !== expectedGridShape[1] ||
    shapeX !== expectedGridShape[2]
  ) {
    throw new Error(
      `Skip hierarchy descriptor shape mismatch for ${label} (${descriptor.path}): expected ${expectedTimepoints}x${expectedGridShape[0]}x${expectedGridShape[1]}x${expectedGridShape[2]}, got ${shapeTimepoints}x${shapeZ}x${shapeY}x${shapeX}.`
    );
  }
  if (descriptor.chunkShape.length !== 4) {
    throw new Error(`Skip hierarchy descriptor chunk shape for ${label} (${descriptor.path}) must have rank 4.`);
  }
  const [chunkTimepoints, chunkZ, chunkY, chunkX] = descriptor.chunkShape;
  if (
    chunkTimepoints !== 1 ||
    chunkZ !== expectedGridShape[0] ||
    chunkY !== expectedGridShape[1] ||
    chunkX !== expectedGridShape[2]
  ) {
    throw new Error(
      `Skip hierarchy descriptor chunk shape mismatch for ${label} (${descriptor.path}): expected 1x${expectedGridShape[0]}x${expectedGridShape[1]}x${expectedGridShape[2]}, got ${chunkTimepoints}x${chunkZ}x${chunkY}x${chunkX}.`
    );
  }
}

type SkipHierarchyLevelBuffers = {
  gridShape: [number, number, number];
  min: Uint8Array;
  max: Uint8Array;
  occupancy: Uint8Array;
};

function reduceSkipHierarchyLevelBuffers(child: SkipHierarchyLevelBuffers): SkipHierarchyLevelBuffers {
  const [childZ, childY, childX] = child.gridShape;
  const parentGridShape: [number, number, number] = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2))
  ];
  const [parentZ, parentY, parentX] = parentGridShape;
  const parentVoxelCount = parentZ * parentY * parentX;
  const parentMin = new Uint8Array(parentVoxelCount);
  const parentMax = new Uint8Array(parentVoxelCount);
  const parentOccupancy = new Uint8Array(parentVoxelCount);
  const childPlaneSize = childY * childX;
  const parentPlaneSize = parentY * parentX;

  for (let z = 0; z < parentZ; z += 1) {
    const childZStart = z * 2;
    for (let y = 0; y < parentY; y += 1) {
      const childYStart = y * 2;
      for (let x = 0; x < parentX; x += 1) {
        const childXStart = x * 2;
        const parentIndex = (z * parentPlaneSize) + (y * parentX) + x;
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
              const childIndex = (sourceZ * childPlaneSize) + (sourceY * childX) + sourceX;
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
    occupancy: parentOccupancy
  };
}

function buildSkipHierarchyLevelBuffersFromLeaf({
  leafGridShape,
  leafMin,
  leafMax,
  leafOccupancy,
  levelCount
}: {
  leafGridShape: [number, number, number];
  leafMin: Uint8Array;
  leafMax: Uint8Array;
  leafOccupancy: Uint8Array;
  levelCount: number;
}): SkipHierarchyLevelBuffers[] {
  if (levelCount <= 0) {
    return [];
  }
  const levels: SkipHierarchyLevelBuffers[] = [
    {
      gridShape: leafGridShape,
      min: leafMin,
      max: leafMax,
      occupancy: leafOccupancy
    }
  ];
  while (levels.length < levelCount) {
    const previous = levels[levels.length - 1];
    if (!previous) {
      break;
    }
    levels.push(reduceSkipHierarchyLevelBuffers(previous));
  }
  return levels;
}

async function writeDataChunksForScale({
  chunkWriter,
  descriptor,
  skipHierarchyDescriptor,
  timepoint,
  volume,
  backgroundMask,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  descriptor: ZarrArrayDescriptor;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
  timepoint: number;
  volume: {
    width: number;
    height: number;
    depth: number;
    channels: number;
    data: Uint8Array;
  };
  backgroundMask?: BackgroundMaskVolume | null;
  signal?: AbortSignal;
}): Promise<Uint32Array> {
  const expectedDataLength = volume.depth * volume.height * volume.width * volume.channels;
  if (volume.data.length !== expectedDataLength) {
    throw new Error(
      `Scale payload size mismatch for ${descriptor.path}: expected ${expectedDataLength} bytes, got ${volume.data.length}.`
    );
  }

  const [, descriptorDepth, descriptorHeight, descriptorWidth, descriptorChannels] = descriptor.shape;
  if (
    descriptorDepth !== volume.depth ||
    descriptorHeight !== volume.height ||
    descriptorWidth !== volume.width ||
    descriptorChannels !== volume.channels
  ) {
    throw new Error(
      `Scale descriptor shape mismatch for ${descriptor.path}: expected ${descriptorDepth}x${descriptorHeight}x${descriptorWidth}x${descriptorChannels}, got ${volume.depth}x${volume.height}x${volume.width}x${volume.channels}.`
    );
  }
  if (descriptor.chunkShape.length !== 5) {
    throw new Error(`Data chunk shape for ${descriptor.path} must have rank 5.`);
  }

  const [, chunkDepth, chunkHeight, chunkWidth, chunkChannels] = descriptor.chunkShape;
  if (chunkChannels !== volume.channels) {
    throw new Error(
      `Data chunk channel dimension mismatch for ${descriptor.path}: expected ${volume.channels}, got ${chunkChannels}.`
    );
  }

  const zChunks = Math.ceil(volume.depth / chunkDepth);
  const yChunks = Math.ceil(volume.height / chunkHeight);
  const xChunks = Math.ceil(volume.width / chunkWidth);
  const chunkCount = zChunks * yChunks * xChunks;
  const leafGridShape: [number, number, number] = [zChunks, yChunks, xChunks];
  const expectedTimepoints = descriptor.shape[0] ?? 0;
  const histogram = new Uint32Array(HISTOGRAM_BINS);

  let leafMinValues: Uint8Array | null = null;
  let leafMaxValues: Uint8Array | null = null;
  let leafOccupancyValues: Uint8Array | null = null;
  if (skipHierarchyDescriptor) {
    const leafLevel = skipHierarchyDescriptor.levels[0];
    if (!leafLevel) {
      throw new Error(`Skip hierarchy is missing level 0 for ${descriptor.path}.`);
    }
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.min,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'min'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.max,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'max'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.occupancy,
      expectedTimepoints,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'occupancy'
    });

    leafMinValues = new Uint8Array(chunkCount);
    leafMaxValues = new Uint8Array(chunkCount);
    leafOccupancyValues = new Uint8Array(chunkCount);
  }

  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    const zStart = chunkStart(zChunk, chunkDepth);
    const zLength = chunkLength(volume.depth, zStart, chunkDepth);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = chunkStart(yChunk, chunkHeight);
      const yLength = chunkLength(volume.height, yStart, chunkHeight);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = chunkStart(xChunk, chunkWidth);
        const xLength = chunkLength(volume.width, xStart, chunkWidth);
        const { chunk, stats } = extractDataChunkBytesAndComputeStatistics({
          source: volume.data,
          width: volume.width,
          height: volume.height,
          channels: volume.channels,
          zStart,
          zLength,
          yStart,
          yLength,
          xStart,
          xLength,
          histogram,
          backgroundMask
        });
        await chunkWriter.writeChunk({
          descriptor,
          chunkCoords: [timepoint, zChunk, yChunk, xChunk, 0],
          bytes: chunk,
          signal
        });
        if (leafMinValues && leafMaxValues && leafOccupancyValues) {
          const chunkIndex = (zChunk * yChunks + yChunk) * xChunks + xChunk;
          leafMinValues[chunkIndex] = stats.min;
          leafMaxValues[chunkIndex] = stats.max;
          leafOccupancyValues[chunkIndex] = stats.occupancy > 0 ? 255 : 0;
        }
      }
    }
  }

  if (skipHierarchyDescriptor && leafMinValues && leafMaxValues && leafOccupancyValues) {
    const hierarchyBuffers = buildSkipHierarchyLevelBuffersFromLeaf({
      leafGridShape,
      leafMin: leafMinValues,
      leafMax: leafMaxValues,
      leafOccupancy: leafOccupancyValues,
      levelCount: skipHierarchyDescriptor.levels.length
    });
    if (hierarchyBuffers.length !== skipHierarchyDescriptor.levels.length) {
      throw new Error(`Skip hierarchy build mismatch for ${descriptor.path}.`);
    }
    for (let hierarchyLevel = 0; hierarchyLevel < skipHierarchyDescriptor.levels.length; hierarchyLevel += 1) {
      const hierarchyDescriptor = skipHierarchyDescriptor.levels[hierarchyLevel];
      const hierarchyData = hierarchyBuffers[hierarchyLevel];
      if (!hierarchyDescriptor || !hierarchyData) {
        throw new Error(`Skip hierarchy level mismatch for ${descriptor.path} at level ${hierarchyLevel}.`);
      }
      const expectedGridShape = hierarchyDescriptor.gridShape;
      const actualGridShape = hierarchyData.gridShape;
      if (
        expectedGridShape[0] !== actualGridShape[0] ||
        expectedGridShape[1] !== actualGridShape[1] ||
        expectedGridShape[2] !== actualGridShape[2]
      ) {
        throw new Error(
          `Skip hierarchy grid mismatch for ${descriptor.path} at level ${hierarchyLevel}: expected ${expectedGridShape.join('x')}, got ${actualGridShape.join('x')}.`
        );
      }
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.min,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.min,
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.max,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.max,
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.occupancy,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.occupancy,
        signal
      });
    }
  }

  return histogram;
}

async function writeLabelChunksForScale({
  chunkWriter,
  descriptor,
  timepoint,
  labels,
  depth,
  height,
  width,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  descriptor: ZarrArrayDescriptor;
  timepoint: number;
  labels: Uint32Array;
  depth: number;
  height: number;
  width: number;
  signal?: AbortSignal;
}): Promise<void> {
  const expectedLabelCount = depth * height * width;
  if (labels.length !== expectedLabelCount) {
    throw new Error(
      `Label payload size mismatch for ${descriptor.path}: expected ${expectedLabelCount} values, got ${labels.length}.`
    );
  }

  const [, descriptorDepth, descriptorHeight, descriptorWidth] = descriptor.shape;
  if (descriptorDepth !== depth || descriptorHeight !== height || descriptorWidth !== width) {
    throw new Error(
      `Label descriptor shape mismatch for ${descriptor.path}: expected ${descriptorDepth}x${descriptorHeight}x${descriptorWidth}, got ${depth}x${height}x${width}.`
    );
  }
  if (descriptor.chunkShape.length !== 4) {
    throw new Error(`Label chunk shape for ${descriptor.path} must have rank 4.`);
  }

  const [, chunkDepth, chunkHeight, chunkWidth] = descriptor.chunkShape;
  const zChunks = Math.ceil(depth / chunkDepth);
  const yChunks = Math.ceil(height / chunkHeight);
  const xChunks = Math.ceil(width / chunkWidth);

  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    const zStart = chunkStart(zChunk, chunkDepth);
    const zLength = chunkLength(depth, zStart, chunkDepth);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = chunkStart(yChunk, chunkHeight);
      const yLength = chunkLength(height, yStart, chunkHeight);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = chunkStart(xChunk, chunkWidth);
        const xLength = chunkLength(width, xStart, chunkWidth);
        const chunkBytes = extractLabelChunkBytes({
          source: labels,
          width,
          height,
          zStart,
          zLength,
          yStart,
          yLength,
          xStart,
          xLength
        });
        await chunkWriter.writeChunk({
          descriptor,
          chunkCoords: [timepoint, zChunk, yChunk, xChunk],
          bytes: chunkBytes,
          signal
        });
      }
    }
  }
}

async function writeBackgroundMaskChunksForScale({
  chunkWriter,
  descriptor,
  mask,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  descriptor: ZarrArrayDescriptor;
  mask: BackgroundMaskVolume;
  signal?: AbortSignal;
}): Promise<void> {
  const expectedMaskCount = mask.depth * mask.height * mask.width;
  if (mask.data.length !== expectedMaskCount) {
    throw new Error(
      `Background mask payload size mismatch for ${descriptor.path}: expected ${expectedMaskCount}, got ${mask.data.length}.`
    );
  }
  const [descriptorDepth, descriptorHeight, descriptorWidth] = descriptor.shape;
  if (
    descriptorDepth !== mask.depth ||
    descriptorHeight !== mask.height ||
    descriptorWidth !== mask.width
  ) {
    throw new Error(
      `Background mask descriptor shape mismatch for ${descriptor.path}: expected ${descriptorDepth}x${descriptorHeight}x${descriptorWidth}, got ${mask.depth}x${mask.height}x${mask.width}.`
    );
  }
  if (descriptor.chunkShape.length !== 3) {
    throw new Error(`Background mask chunk shape for ${descriptor.path} must have rank 3.`);
  }

  const [chunkDepth, chunkHeight, chunkWidth] = descriptor.chunkShape;
  const zChunks = Math.ceil(mask.depth / chunkDepth);
  const yChunks = Math.ceil(mask.height / chunkHeight);
  const xChunks = Math.ceil(mask.width / chunkWidth);

  for (let zChunk = 0; zChunk < zChunks; zChunk += 1) {
    const zStart = chunkStart(zChunk, chunkDepth);
    const zLength = chunkLength(mask.depth, zStart, chunkDepth);
    for (let yChunk = 0; yChunk < yChunks; yChunk += 1) {
      const yStart = chunkStart(yChunk, chunkHeight);
      const yLength = chunkLength(mask.height, yStart, chunkHeight);
      for (let xChunk = 0; xChunk < xChunks; xChunk += 1) {
        const xStart = chunkStart(xChunk, chunkWidth);
        const xLength = chunkLength(mask.width, xStart, chunkWidth);
        const chunkBytes = extractBackgroundMaskChunkBytes({
          source: mask.data,
          width: mask.width,
          height: mask.height,
          zStart,
          zLength,
          yStart,
          yLength,
          xStart,
          xLength
        });
        await chunkWriter.writeChunk({
          descriptor,
          chunkCoords: [zChunk, yChunk, xChunk],
          bytes: chunkBytes,
          signal
        });
      }
    }
  }
}

type StreamingScaleWriteState = {
  scale: PreprocessedLayerScaleManifestEntry;
  backgroundMaskScale: BackgroundMaskVolume | null;
  dataDescriptor: ZarrArrayDescriptor;
  labelsDescriptor?: ZarrArrayDescriptor;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
  histogram: Uint32Array;
  chunkDepth: number;
  chunkHeight: number;
  chunkWidth: number;
  yChunks: number;
  xChunks: number;
  zChunks: number;
  nextSliceIndex: number;
  leafMinValues: Uint8Array | null;
  leafMaxValues: Uint8Array | null;
  leafOccupancyValues: Uint8Array | null;
};

type StreamingScaleTransition = {
  pendingDataSlice: Uint8Array | null;
  pendingLabelSlice: Uint32Array | null;
  sourceWidth: number;
  sourceHeight: number;
  sourceChannels: number;
  expectsLabels: boolean;
};

function createStreamingScaleWriteState({
  scale,
  backgroundMaskScale,
  skipHierarchyDescriptor
}: {
  scale: PreprocessedLayerScaleManifestEntry;
  backgroundMaskScale: BackgroundMaskVolume | null;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
}): StreamingScaleWriteState {
  const dataDescriptor = scale.zarr.data;
  if (dataDescriptor.chunkShape.length !== 5) {
    throw new Error(`Data chunk shape for ${dataDescriptor.path} must have rank 5.`);
  }
  const [, chunkDepth, chunkHeight, chunkWidth, chunkChannels] = dataDescriptor.chunkShape;
  if (chunkDepth !== 1) {
    throw new Error(
      `Streaming preprocessing requires depth chunk size of 1 for ${dataDescriptor.path}, got ${chunkDepth}.`
    );
  }
  if (chunkChannels !== scale.channels) {
    throw new Error(
      `Data chunk channel dimension mismatch for ${dataDescriptor.path}: expected ${scale.channels}, got ${chunkChannels}.`
    );
  }
  const zChunks = Math.ceil(scale.depth / chunkDepth);
  const yChunks = Math.ceil(scale.height / chunkHeight);
  const xChunks = Math.ceil(scale.width / chunkWidth);
  const chunkCount = zChunks * yChunks * xChunks;
  const leafGridShape: [number, number, number] = [zChunks, yChunks, xChunks];

  let leafMinValues: Uint8Array | null = null;
  let leafMaxValues: Uint8Array | null = null;
  let leafOccupancyValues: Uint8Array | null = null;
  if (skipHierarchyDescriptor) {
    const leafLevel = skipHierarchyDescriptor.levels[0];
    if (!leafLevel) {
      throw new Error(`Skip hierarchy is missing level 0 for ${dataDescriptor.path}.`);
    }
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.min,
      expectedTimepoints: dataDescriptor.shape[0] ?? 0,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'min'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.max,
      expectedTimepoints: dataDescriptor.shape[0] ?? 0,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'max'
    });
    assertSkipHierarchyDescriptorMatchesGrid({
      descriptor: leafLevel.occupancy,
      expectedTimepoints: dataDescriptor.shape[0] ?? 0,
      expectedGridShape: leafGridShape,
      expectedDataType: 'uint8',
      label: 'occupancy'
    });
    leafMinValues = new Uint8Array(chunkCount);
    leafMaxValues = new Uint8Array(chunkCount);
    leafOccupancyValues = new Uint8Array(chunkCount);
  }

  const labelsDescriptor = scale.zarr.labels;
  if (labelsDescriptor) {
    if (labelsDescriptor.chunkShape.length !== 4) {
      throw new Error(`Label chunk shape for ${labelsDescriptor.path} must have rank 4.`);
    }
    const [, labelsChunkDepth] = labelsDescriptor.chunkShape;
    if (labelsChunkDepth !== 1) {
      throw new Error(
        `Streaming preprocessing requires depth chunk size of 1 for ${labelsDescriptor.path}, got ${labelsChunkDepth}.`
      );
    }
  }

  return {
    scale,
    backgroundMaskScale,
    dataDescriptor,
    labelsDescriptor,
    skipHierarchyDescriptor,
    histogram: new Uint32Array(HISTOGRAM_BINS),
    chunkDepth,
    chunkHeight,
    chunkWidth,
    yChunks,
    xChunks,
    zChunks,
    nextSliceIndex: 0,
    leafMinValues,
    leafMaxValues,
    leafOccupancyValues
  };
}

async function writeStreamingScaleSlice({
  chunkWriter,
  state,
  timepoint,
  dataSlice,
  labelsSlice,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  state: StreamingScaleWriteState;
  timepoint: number;
  dataSlice: Uint8Array;
  labelsSlice?: Uint32Array;
  signal?: AbortSignal;
}): Promise<void> {
  const { scale, dataDescriptor, labelsDescriptor, histogram } = state;
  const sliceLength = scale.width * scale.height * scale.channels;
  if (dataSlice.length !== sliceLength) {
    throw new Error(
      `Scale slice length mismatch for ${dataDescriptor.path}: expected ${sliceLength}, got ${dataSlice.length}.`
    );
  }
  const zIndex = state.nextSliceIndex;
  state.nextSliceIndex += 1;
  if (zIndex >= scale.depth) {
    throw new Error(`Received too many slices for scale ${scale.level} (${dataDescriptor.path}).`);
  }
  const backgroundMaskSlice = (() => {
    if (!state.backgroundMaskScale) {
      return null;
    }
    const sliceLength = state.backgroundMaskScale.width * state.backgroundMaskScale.height;
    const start = zIndex * sliceLength;
    return {
      width: state.backgroundMaskScale.width,
      height: state.backgroundMaskScale.height,
      depth: 1,
      data: state.backgroundMaskScale.data.subarray(start, start + sliceLength)
    } satisfies BackgroundMaskVolume;
  })();

  for (let yChunk = 0; yChunk < state.yChunks; yChunk += 1) {
    const yStart = chunkStart(yChunk, state.chunkHeight);
    const yLength = chunkLength(scale.height, yStart, state.chunkHeight);
    for (let xChunk = 0; xChunk < state.xChunks; xChunk += 1) {
      const xStart = chunkStart(xChunk, state.chunkWidth);
      const xLength = chunkLength(scale.width, xStart, state.chunkWidth);
      const { chunk, stats } = extractDataChunkBytesAndComputeStatistics({
        source: dataSlice,
        width: scale.width,
        height: scale.height,
        channels: scale.channels,
        zStart: 0,
        zLength: 1,
        yStart,
        yLength,
        xStart,
        xLength,
        histogram,
        backgroundMask: backgroundMaskSlice
      });
      await chunkWriter.writeChunk({
        descriptor: dataDescriptor,
        chunkCoords: [timepoint, zIndex, yChunk, xChunk, 0],
        bytes: chunk,
        signal
      });
      if (state.leafMinValues && state.leafMaxValues && state.leafOccupancyValues) {
        const chunkIndex = (zIndex * state.yChunks + yChunk) * state.xChunks + xChunk;
        state.leafMinValues[chunkIndex] = stats.min;
        state.leafMaxValues[chunkIndex] = stats.max;
        state.leafOccupancyValues[chunkIndex] = stats.occupancy > 0 ? 255 : 0;
      }

      if (labelsDescriptor) {
        if (!labelsSlice) {
          throw new Error(`Missing label slice for segmentation scale ${labelsDescriptor.path}.`);
        }
        const labelChunkBytes = extractLabelChunkBytes({
          source: labelsSlice,
          width: scale.width,
          height: scale.height,
          zStart: 0,
          zLength: 1,
          yStart,
          yLength,
          xStart,
          xLength
        });
        await chunkWriter.writeChunk({
          descriptor: labelsDescriptor,
          chunkCoords: [timepoint, zIndex, yChunk, xChunk],
          bytes: labelChunkBytes,
          signal
        });
      }
    }
  }
}

async function finalizeStreamingScaleWriteState({
  chunkWriter,
  state,
  timepoint,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  state: StreamingScaleWriteState;
  timepoint: number;
  signal?: AbortSignal;
}): Promise<void> {
  if (state.nextSliceIndex !== state.scale.depth) {
    throw new Error(
      `Scale depth mismatch for ${state.dataDescriptor.path}: expected ${state.scale.depth} slices, got ${state.nextSliceIndex}.`
    );
  }

  if (state.skipHierarchyDescriptor && state.leafMinValues && state.leafMaxValues && state.leafOccupancyValues) {
    const hierarchyBuffers = buildSkipHierarchyLevelBuffersFromLeaf({
      leafGridShape: [state.zChunks, state.yChunks, state.xChunks],
      leafMin: state.leafMinValues,
      leafMax: state.leafMaxValues,
      leafOccupancy: state.leafOccupancyValues,
      levelCount: state.skipHierarchyDescriptor.levels.length
    });
    if (hierarchyBuffers.length !== state.skipHierarchyDescriptor.levels.length) {
      throw new Error(`Skip hierarchy build mismatch for ${state.dataDescriptor.path}.`);
    }
    for (let hierarchyLevel = 0; hierarchyLevel < state.skipHierarchyDescriptor.levels.length; hierarchyLevel += 1) {
      const hierarchyDescriptor = state.skipHierarchyDescriptor.levels[hierarchyLevel];
      const hierarchyData = hierarchyBuffers[hierarchyLevel];
      if (!hierarchyDescriptor || !hierarchyData) {
        throw new Error(
          `Skip hierarchy level mismatch for ${state.dataDescriptor.path} at level ${hierarchyLevel}.`
        );
      }
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.min,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.min,
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.max,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.max,
        signal
      });
      await chunkWriter.writeChunk({
        descriptor: hierarchyDescriptor.occupancy,
        chunkCoords: [timepoint, 0, 0, 0],
        bytes: hierarchyData.occupancy,
        signal
      });
    }
  }

  await chunkWriter.writeChunk({
    descriptor: state.scale.zarr.histogram,
    chunkCoords: [timepoint, 0],
    bytes: encodeUint32ArrayLE(state.histogram),
    signal
  });
}

function createStreamingScaleTransition({
  fromScale,
  expectsLabels
}: {
  fromScale: PreprocessedLayerScaleManifestEntry;
  expectsLabels: boolean;
}): StreamingScaleTransition {
  return {
    pendingDataSlice: null,
    pendingLabelSlice: null,
    sourceWidth: fromScale.width,
    sourceHeight: fromScale.height,
    sourceChannels: fromScale.channels,
    expectsLabels
  };
}

function pushStreamingScaleTransitionSlice({
  transition,
  dataSlice,
  labelsSlice
}: {
  transition: StreamingScaleTransition;
  dataSlice: Uint8Array;
  labelsSlice?: Uint32Array;
}): { data: Uint8Array; labels?: Uint32Array } | null {
  const xyDownsampledData = downsampleDataSliceXYByMax({
    source: dataSlice,
    width: transition.sourceWidth,
    height: transition.sourceHeight,
    channels: transition.sourceChannels
  });

  if (transition.pendingDataSlice === null) {
    transition.pendingDataSlice = xyDownsampledData;
    if (transition.expectsLabels) {
      if (!labelsSlice) {
        throw new Error('Missing segmentation labels while building streaming scale pyramid.');
      }
      transition.pendingLabelSlice = labelsSlice;
    }
    return null;
  }

  mergeDataSlicesByMaxInPlace(transition.pendingDataSlice, xyDownsampledData);
  const outputData = transition.pendingDataSlice;
  transition.pendingDataSlice = null;

  if (!transition.expectsLabels) {
    return { data: outputData };
  }
  if (!transition.pendingLabelSlice || !labelsSlice) {
    throw new Error('Missing segmentation labels while finalizing streaming scale pyramid pair.');
  }
  const outputLabels = downsampleLabelSlicesByMode({
    first: transition.pendingLabelSlice,
    second: labelsSlice,
    width: transition.sourceWidth,
    height: transition.sourceHeight
  });
  transition.pendingLabelSlice = null;
  return {
    data: outputData,
    labels: outputLabels
  };
}

function flushStreamingScaleTransition(
  transition: StreamingScaleTransition
): { data: Uint8Array; labels?: Uint32Array } | null {
  if (!transition.pendingDataSlice) {
    return null;
  }

  const outputData = transition.pendingDataSlice;
  transition.pendingDataSlice = null;

  if (!transition.expectsLabels) {
    return { data: outputData };
  }
  if (!transition.pendingLabelSlice) {
    throw new Error('Missing pending segmentation labels while flushing streaming scale transition.');
  }
  const outputLabels = downsampleLabelSlicesByMode({
    first: transition.pendingLabelSlice,
    second: null,
    width: transition.sourceWidth,
    height: transition.sourceHeight
  });
  transition.pendingLabelSlice = null;
  return {
    data: outputData,
    labels: outputLabels
  };
}

async function writeStreamingLayerTimepoint({
  chunkWriter,
  preparedLayer,
  manifestLayer,
  sourceMetadata,
  normalization,
  backgroundMask,
  tiffByFileCache,
  signal,
  timepoint
}: {
  chunkWriter: ChunkWriteDispatcher;
  preparedLayer: StreamingPreparedLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  sourceMetadata: LayerMetadata;
  normalization: NormalizationParameters | null;
  backgroundMask: SharedBackgroundMask | null;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
  timepoint: number;
}): Promise<void> {
  const sortedScales = [...manifestLayer.zarr.scales].sort((left, right) => left.level - right.level);
  if (sortedScales.length === 0) {
    throw new Error(`Layer "${preparedLayer.layer.key}" is missing Zarr scale metadata.`);
  }
  const backgroundMaskByLevel = new Map<number, SharedBackgroundMaskScale>(
    (backgroundMask?.scales ?? []).map((scale) => [scale.level, scale])
  );

  const scaleStates = sortedScales.map((scale) =>
    createStreamingScaleWriteState({
      scale,
      backgroundMaskScale: backgroundMaskByLevel.get(scale.level)
        ? {
            width: backgroundMaskByLevel.get(scale.level)!.width,
            height: backgroundMaskByLevel.get(scale.level)!.height,
            depth: backgroundMaskByLevel.get(scale.level)!.depth,
            data: backgroundMaskByLevel.get(scale.level)!.data
          }
        : null,
      skipHierarchyDescriptor: scale.zarr.skipHierarchy
    })
  );
  const transitions = sortedScales.slice(0, -1).map((scale, index) => {
    const nextScale = sortedScales[index + 1];
    if (!nextScale) {
      throw new Error(`Missing next scale while preparing streaming transition for layer "${preparedLayer.layer.key}".`);
    }
    return createStreamingScaleTransition({
      fromScale: scale,
      expectsLabels: Boolean(nextScale.zarr.labels)
    });
  });

  const processScaleSlice = async (
    scaleIndex: number,
    dataSlice: Uint8Array,
    labelsSlice?: Uint32Array
  ): Promise<void> => {
    const state = scaleStates[scaleIndex];
    if (!state) {
      throw new Error(`Missing streaming scale state at index ${scaleIndex}.`);
    }
    await writeStreamingScaleSlice({
      chunkWriter,
      state,
      timepoint,
      dataSlice,
      labelsSlice,
      signal
    });
    const transition = transitions[scaleIndex];
    if (!transition) {
      return;
    }
    const produced = pushStreamingScaleTransitionSlice({
      transition,
      dataSlice,
      labelsSlice
    });
    if (produced) {
      await processScaleSlice(scaleIndex + 1, produced.data, produced.labels);
    }
  };

  const timepointSource = preparedLayer.getTimepointSource(timepoint);

  if (preparedLayer.layer.isSegmentation) {
    if (sourceMetadata.channels !== 1) {
      throw new Error(
        `Segmentation layer "${preparedLayer.layer.channelLabel}" must decode to exactly one source channel.`
      );
    }

    let maxLabel = 0;
    await forEachSliceInStreamingTimepointSource({
      layer: preparedLayer.layer,
      timepoint,
      source: timepointSource,
      expectedMetadata: sourceMetadata,
      tiffByFileCache,
      signal,
      onSlice: (slice) => {
        for (let i = 0; i < slice.length; i += 1) {
          const label = toSegmentationLabelId(slice[i] as number);
          if (label > maxLabel) {
            maxLabel = label;
          }
        }
      }
    });

    const colorTable = createSegmentationColorTable(
      maxLabel,
      createSegmentationSeed(preparedLayer.layer.key, timepoint)
    );
    await forEachSliceInStreamingTimepointSource({
      layer: preparedLayer.layer,
      timepoint,
      source: timepointSource,
      expectedMetadata: sourceMetadata,
      tiffByFileCache,
      signal,
      onSlice: async (slice) => {
        const colorized = colorizeSegmentationSlice({
          source: slice,
          colorTable
        });
        await processScaleSlice(0, colorized.normalized, colorized.labels);
      }
    });
  } else {
    const resolvedNormalization = normalization ?? computeNormalizationParametersFromScannedMinMax({
      dataType: sourceMetadata.dataType,
      min: 0,
      max: 1
    });
    await forEachSliceInStreamingTimepointSource({
      layer: preparedLayer.layer,
      timepoint,
      source: timepointSource,
      expectedMetadata: sourceMetadata,
      tiffByFileCache,
      signal,
      onSlice: async (slice, z) => {
        const normalizedSlice = normalizeSliceToUint8({
          source: slice,
          dataType: sourceMetadata.dataType,
          parameters: resolvedNormalization
        });
        const maskScale = backgroundMask?.scales[0] ?? null;
        if (!maskScale || (backgroundMask?.maskedVoxelCount ?? 0) <= 0) {
          await processScaleSlice(0, normalizedSlice);
          return;
        }
        const maskedSlice = normalizedSlice.slice();
        const maskSliceLength = maskScale.width * maskScale.height;
        const maskSlice = maskScale.data.subarray(z * maskSliceLength, (z + 1) * maskSliceLength);
        applyBackgroundMaskInPlace({
          target: maskedSlice,
          channels: sourceMetadata.channels,
          mask: maskSlice
        });
        await processScaleSlice(0, maskedSlice);
      }
    });
  }

  for (let index = 0; index < transitions.length; index += 1) {
    const produced = flushStreamingScaleTransition(transitions[index]!);
    if (produced) {
      await processScaleSlice(index + 1, produced.data, produced.labels);
    }
  }

  for (const state of scaleStates) {
    await finalizeStreamingScaleWriteState({
      chunkWriter,
      state,
      timepoint,
      signal
    });
  }
}

function downsampleDataByMaxPooling(volume: {
  width: number;
  height: number;
  depth: number;
  channels: number;
  data: Uint8Array;
}): {
  width: number;
  height: number;
  depth: number;
  channels: number;
  data: Uint8Array;
} {
  const nextDepth = Math.max(1, Math.ceil(volume.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(volume.height / 2));
  const nextWidth = Math.max(1, Math.ceil(volume.width / 2));
  const downsampled = new Uint8Array(nextDepth * nextHeight * nextWidth * volume.channels);

  for (let z = 0; z < nextDepth; z += 1) {
    const sourceZStart = z * 2;
    const sourceZEnd = Math.min(volume.depth, sourceZStart + 2);
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceYStart = y * 2;
      const sourceYEnd = Math.min(volume.height, sourceYStart + 2);
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceXStart = x * 2;
        const sourceXEnd = Math.min(volume.width, sourceXStart + 2);
        const destinationBase = ((z * nextHeight + y) * nextWidth + x) * volume.channels;
        for (let channel = 0; channel < volume.channels; channel += 1) {
          let maxValue = 0;
          for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
            for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
              for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
                const sourceIndex =
                  ((sourceZ * volume.height + sourceY) * volume.width + sourceX) * volume.channels + channel;
                const value = volume.data[sourceIndex];
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
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    channels: volume.channels,
    data: downsampled
  };
}

function downsampleLabelsByMode(volume: {
  width: number;
  height: number;
  depth: number;
  labels: Uint32Array;
}): {
  width: number;
  height: number;
  depth: number;
  labels: Uint32Array;
} {
  const nextDepth = Math.max(1, Math.ceil(volume.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(volume.height / 2));
  const nextWidth = Math.max(1, Math.ceil(volume.width / 2));
  const downsampled = new Uint32Array(nextDepth * nextHeight * nextWidth);

  for (let z = 0; z < nextDepth; z += 1) {
    const sourceZStart = z * 2;
    const sourceZEnd = Math.min(volume.depth, sourceZStart + 2);
    for (let y = 0; y < nextHeight; y += 1) {
      const sourceYStart = y * 2;
      const sourceYEnd = Math.min(volume.height, sourceYStart + 2);
      for (let x = 0; x < nextWidth; x += 1) {
        const sourceXStart = x * 2;
        const sourceXEnd = Math.min(volume.width, sourceXStart + 2);
        const destinationIndex = (z * nextHeight + y) * nextWidth + x;

        const candidateLabels = new Uint32Array(8);
        const candidateCounts = new Uint8Array(8);
        let candidateSize = 0;
        let bestLabel = 0;
        let bestCount = -1;
        for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
          for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
            for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
              const sourceIndex = (sourceZ * volume.height + sourceY) * volume.width + sourceX;
              const label = volume.labels[sourceIndex] ?? 0;
              let slot = -1;
              for (let candidateIndex = 0; candidateIndex < candidateSize; candidateIndex += 1) {
                if ((candidateLabels[candidateIndex] ?? 0) === label) {
                  slot = candidateIndex;
                  break;
                }
              }
              if (slot < 0) {
                slot = candidateSize;
                candidateLabels[slot] = label;
                candidateCounts[slot] = 0;
                candidateSize += 1;
              }
              const nextCount = (candidateCounts[slot] ?? 0) + 1;
              candidateCounts[slot] = nextCount;
              if (
                nextCount > bestCount ||
                (nextCount === bestCount && bestLabel === 0 && label !== 0) ||
                (nextCount === bestCount && label > bestLabel)
              ) {
                bestCount = nextCount;
                bestLabel = label;
              }
            }
          }
        }
        downsampled[destinationIndex] = bestLabel;
      }
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
    depth: nextDepth,
    labels: downsampled
  };
}

async function writeNormalizedLayerTimepoint({
  chunkWriter,
  normalized,
  layer,
  manifestLayer,
  backgroundMask,
  signal,
  timepoint
}: {
  chunkWriter: ChunkWriteDispatcher;
  normalized: NormalizedVolume;
  layer: PreprocessLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  backgroundMask: SharedBackgroundMask | null;
  signal?: AbortSignal;
  timepoint: number;
}): Promise<void> {
  const sortedScales = [...manifestLayer.zarr.scales].sort((left, right) => left.level - right.level);
  const baseScale = sortedScales[0];
  if (!baseScale) {
    throw new Error(`Layer "${layer.key}" is missing level 0 Zarr scale metadata.`);
  }

  let volumeForScale = {
    width: normalized.width,
    height: normalized.height,
    depth: normalized.depth,
    channels: normalized.channels,
    data: normalized.normalized
  };
  let labelsForScale =
    layer.isSegmentation && normalized.segmentationLabels
      ? {
          width: normalized.width,
          height: normalized.height,
          depth: normalized.depth,
          labels: normalized.segmentationLabels
        }
      : null;
  const backgroundMaskByLevel = new Map<number, SharedBackgroundMaskScale>(
    (backgroundMask?.scales ?? []).map((scale) => [scale.level, scale])
  );

  for (let scaleIndex = 0; scaleIndex < sortedScales.length; scaleIndex += 1) {
    const scale = sortedScales[scaleIndex]!;
    const histogram = await writeDataChunksForScale({
      chunkWriter,
      descriptor: scale.zarr.data,
      skipHierarchyDescriptor: scale.zarr.skipHierarchy,
      timepoint,
      volume: volumeForScale,
      backgroundMask: backgroundMaskByLevel.get(scale.level) ?? null,
      signal
    });
    await chunkWriter.writeChunk({
      descriptor: scale.zarr.histogram,
      chunkCoords: [timepoint, 0],
      bytes: encodeUint32ArrayLE(histogram),
      signal
    });
    if (scale.zarr.labels && labelsForScale) {
      await writeLabelChunksForScale({
        chunkWriter,
        descriptor: scale.zarr.labels,
        timepoint,
        labels: labelsForScale.labels,
        depth: labelsForScale.depth,
        height: labelsForScale.height,
        width: labelsForScale.width,
        signal
      });
    }

    const hasNextScale = scaleIndex < sortedScales.length - 1;
    if (!hasNextScale) {
      continue;
    }

    volumeForScale = downsampleDataByMaxPooling(volumeForScale);
    const nextScale = sortedScales[scaleIndex + 1]!;
    if (
      volumeForScale.depth !== nextScale.depth ||
      volumeForScale.height !== nextScale.height ||
      volumeForScale.width !== nextScale.width ||
      volumeForScale.channels !== nextScale.channels
    ) {
      throw new Error(
        `Generated mip dimensions for layer "${layer.key}" scale ${nextScale.level} do not match manifest metadata.`
      );
    }
    if (labelsForScale && nextScale.zarr.labels) {
      labelsForScale = downsampleLabelsByMode(labelsForScale);
      if (
        labelsForScale.depth !== nextScale.depth ||
        labelsForScale.height !== nextScale.height ||
        labelsForScale.width !== nextScale.width
      ) {
        throw new Error(
          `Generated label mip dimensions for layer "${layer.key}" scale ${nextScale.level} do not match manifest metadata.`
        );
      }
    }
  }
}

async function writePrecomputedLayerTimepointScales({
  chunkWriter,
  layer,
  manifestLayer,
  precomputedScales,
  signal,
  timepoint
}: {
  chunkWriter: ChunkWriteDispatcher;
  layer: PreprocessLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  precomputedScales: PreprocessScalePyramidWorkerResultScale[];
  signal?: AbortSignal;
  timepoint: number;
}): Promise<void> {
  const sortedScales = [...manifestLayer.zarr.scales].sort((left, right) => left.level - right.level);
  if (sortedScales.length !== precomputedScales.length) {
    throw new Error(
      `Precomputed scale count mismatch for layer "${layer.key}" at timepoint ${timepoint}: expected ${sortedScales.length}, got ${precomputedScales.length}.`
    );
  }

  for (let index = 0; index < sortedScales.length; index += 1) {
    const scale = sortedScales[index]!;
    const prepared = precomputedScales[index];
    if (!prepared) {
      throw new Error(
        `Missing precomputed scale payload for layer "${layer.key}" scale ${scale.level} at timepoint ${timepoint}.`
      );
    }
    if (
      prepared.level !== scale.level ||
      prepared.width !== scale.width ||
      prepared.height !== scale.height ||
      prepared.depth !== scale.depth ||
      prepared.channels !== scale.channels
    ) {
      throw new Error(
        `Precomputed scale metadata mismatch for layer "${layer.key}" scale ${scale.level} at timepoint ${timepoint}.`
      );
    }

    const histogram = await writeDataChunksForScale({
      chunkWriter,
      descriptor: scale.zarr.data,
      skipHierarchyDescriptor: scale.zarr.skipHierarchy,
      timepoint,
      volume: {
        width: prepared.width,
        height: prepared.height,
        depth: prepared.depth,
        channels: prepared.channels,
        data: prepared.data
      },
      signal
    });
    await chunkWriter.writeChunk({
      descriptor: scale.zarr.histogram,
      chunkCoords: [timepoint, 0],
      bytes: encodeUint32ArrayLE(histogram),
      signal
    });

    if (scale.zarr.labels) {
      if (!prepared.labels) {
        throw new Error(
          `Missing precomputed labels for layer "${layer.key}" scale ${scale.level} at timepoint ${timepoint}.`
        );
      }
      await writeLabelChunksForScale({
        chunkWriter,
        descriptor: scale.zarr.labels,
        timepoint,
        labels: prepared.labels,
        depth: prepared.depth,
        height: prepared.height,
        width: prepared.width,
        signal
      });
    }
  }
}

async function writeLayerVolumesFor3dStreaming({
  chunkWriter,
  preparedLayer,
  manifestLayer,
  sourceMetadata,
  normalizationByLayerKey,
  backgroundMask,
  tiffByFileCache,
  signal,
  onProgress,
  totalVolumeCount,
  progressState
}: {
  chunkWriter: ChunkWriteDispatcher;
  preparedLayer: StreamingPreparedLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  sourceMetadata: LayerMetadata;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  backgroundMask: SharedBackgroundMask | null;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
  totalVolumeCount: number;
  progressState: { processedVolumes: number };
}): Promise<void> {
  const layer = preparedLayer.layer;
  const normalization = layer.isSegmentation
    ? null
    : normalizationByLayerKey.get(layer.key) ??
      computeNormalizationParametersFromScannedMinMax({
        dataType: sourceMetadata.dataType,
        min: 0,
        max: 1
      });

  for (let timepoint = 0; timepoint < preparedLayer.timepointCount; timepoint += 1) {
    throwIfAborted(signal);
    await writeStreamingLayerTimepoint({
      chunkWriter,
      preparedLayer,
      manifestLayer,
      sourceMetadata,
      normalization,
      backgroundMask,
      tiffByFileCache,
      signal,
      timepoint
    });

    progressState.processedVolumes += 1;
    onProgress?.({
      stage: 'write-volumes',
      processedVolumes: progressState.processedVolumes,
      totalVolumes: totalVolumeCount,
      layerKey: layer.key,
      timepoint
    });
  }
}

async function writeLayerVolumesFor3d({
  chunkWriter,
  preparedLayer,
  manifestLayer,
  sourceMetadata,
  representativeTimepoint,
  normalizationByLayerKey,
  backgroundMask,
  workerizeNormalizationDownsample,
  signal,
  onProgress,
  totalVolumeCount,
  progressState
}: {
  chunkWriter: ChunkWriteDispatcher;
  preparedLayer: PreparedLayerSource;
  manifestLayer: PreprocessedLayerManifestEntry;
  sourceMetadata: LayerMetadata;
  representativeTimepoint: number;
  normalizationByLayerKey: Map<string, NormalizationParameters>;
  backgroundMask: SharedBackgroundMask | null;
  workerizeNormalizationDownsample: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: PreprocessDatasetProgress) => void;
  totalVolumeCount: number;
  progressState: { processedVolumes: number };
}): Promise<void> {
  const layer = preparedLayer.layer;
  const normalization = layer.isSegmentation
    ? null
    : normalizationByLayerKey.get(layer.key) ??
      computeRepresentativeNormalization(
        await preparedLayer.getTimepointVolume(representativeTimepoint, signal),
        backgroundMask?.scales[0] ?? null
      );
  let useWorkerizedNormalizationDownsample =
    workerizeNormalizationDownsample && supportsPreprocessScalePyramidWorker();

  for (let timepoint = 0; timepoint < preparedLayer.timepointCount; timepoint += 1) {
    throwIfAborted(signal);
    const raw = await preparedLayer.getTimepointVolume(timepoint, signal);
    assertVolumeMatchesExpectedShape(raw, sourceMetadata, `Layer "${layer.channelLabel}" timepoint ${timepoint + 1}`);

    let wroteWithWorker = false;
    if (useWorkerizedNormalizationDownsample) {
      try {
        const precomputedScales = await buildPreprocessScalePyramidInWorker({
          rawVolume: raw,
          scales: manifestLayer.zarr.scales,
          layerKey: layer.key,
          isSegmentation: layer.isSegmentation,
          segmentationSeed: createSegmentationSeed(layer.key, timepoint),
          normalization,
          signal
        });
        await writePrecomputedLayerTimepointScales({
          chunkWriter,
          layer,
          manifestLayer,
          precomputedScales,
          signal,
          timepoint
        });
        wroteWithWorker = true;
      } catch (error) {
        if (isAbortLikeError(error)) {
          throw error;
        }
        useWorkerizedNormalizationDownsample = false;
        console.warn(
          `Falling back to synchronous normalization/downsample for layer "${layer.key}" after worker failure.`,
          error
        );
      }
    }

    if (!wroteWithWorker) {
      const normalized = layer.isSegmentation
        ? colorizeSegmentationVolume(raw, createSegmentationSeed(layer.key, timepoint))
        : normalizeVolume(
            raw,
            normalization ?? computeRepresentativeNormalization(raw, backgroundMask?.scales[0] ?? null)
          );

      if (!layer.isSegmentation && backgroundMask && backgroundMask.maskedVoxelCount > 0) {
        const maskedNormalized = normalized.normalized.slice();
        applyBackgroundMaskInPlace({
          target: maskedNormalized,
          channels: normalized.channels,
          mask: backgroundMask.scales[0]!.data
        });
        await writeNormalizedLayerTimepoint({
          chunkWriter,
          normalized: {
            ...normalized,
            normalized: maskedNormalized
          },
          layer,
          manifestLayer,
          backgroundMask,
          signal,
          timepoint
        });
      } else {
        await writeNormalizedLayerTimepoint({
          chunkWriter,
          normalized,
          layer,
          manifestLayer,
          backgroundMask,
          signal,
          timepoint
        });
      }
    }

    progressState.processedVolumes += 1;
    onProgress?.({
      stage: 'write-volumes',
      processedVolumes: progressState.processedVolumes,
      totalVolumes: totalVolumeCount,
      layerKey: layer.key,
      timepoint
    });
  }
}

export async function preprocessDatasetToStorage({
  layers,
  channels,
  trackSets,
  voxelResolution,
  movieMode,
  storage,
  volumeLoader: providedVolumeLoader,
  storageStrategy,
  processingStrategy,
  inputInterpretation,
  backgroundMask: backgroundMaskConfig,
  signal,
  onProgress
}: PreprocessDatasetToStorageOptions): Promise<{
  manifest: PreprocessedManifest;
  channelSummaries: PreprocessedChannelSummary[];
  trackSummaries: PreprocessedTrackSetSummary[];
  totalVolumeCount: number;
}> {
  const sortedLayerSources = layers
    .map((layer) => ({ ...layer, files: sortVolumeFiles(layer.files) }))
    .filter((layer) => layer.files.length > 0);

  if (sortedLayerSources.length === 0) {
    throw new Error('No TIFF files were provided for preprocessing.');
  }
  const layersByChannel = groupLayersByChannel(sortedLayerSources);
  validateSingleVolumePerChannel({ channels, layersByChannel });

  const resolvedInputInterpretation = resolveInputInterpretation(inputInterpretation);
  const requestedExecutionMode = resolvePreprocessExecutionMode(processingStrategy);
  const streamingThresholdBytes = resolvePreprocessStreamingThresholdBytes(processingStrategy);
  const shardingStrategy = resolveShardingStrategy(storageStrategy);
  const canUseStreamingPipeline = typeof FileReader !== 'undefined' && !providedVolumeLoader;
  let datasetExecutionMode: ResolvedPreprocessExecutionMode = 'in-memory';
  let streamingPreparedLayerSources: StreamingPreparedLayerSource[] = [];
  if (requestedExecutionMode !== 'in-memory' && canUseStreamingPipeline) {
    const preparedStreaming = await prepareStreamingLayerSources({
      sortedLayerSources,
      inputInterpretation: resolvedInputInterpretation,
      signal
    });
    streamingPreparedLayerSources = preparedStreaming.preparedLayerSources;
    datasetExecutionMode = resolveDatasetExecutionMode({
      requestedMode: requestedExecutionMode,
      estimatedMaxLayerVolumeBytes: preparedStreaming.estimatedMaxLayerVolumeBytes,
      streamingThresholdBytes
    });
  }

  let expectedTimepoints: number;
  let normalizationByLayerKey: Map<string, NormalizationParameters>;
  let sourceMetadataByLayerKey: Map<string, LayerMetadata>;
  let layerMetadataByKey: Map<string, LayerMetadata>;
  let representativeTimepoint = 0;
  let preparedLayerByKey: Map<string, PreparedLayerSource> | null = null;
  let streamingPreparedLayerByKey: Map<string, StreamingPreparedLayerSource> | null = null;
  let tiffByFileCache: TiffByFileCache | null = null;
  let backgroundMask: SharedBackgroundMask | null = null;

  if (datasetExecutionMode === 'in-memory') {
    const volumeLoader = await resolveVolumeLoader(providedVolumeLoader);
    const decodedVolumeCacheByLayerKey: DecodedVolumeCacheByLayerKey = new Map();
    const preparedLayerSources = await prepareLayerSources({
      sortedLayerSources,
      inputInterpretation: resolvedInputInterpretation,
      volumeLoader,
      decodedVolumeCacheByLayerKey,
      signal
    });
    preparedLayerByKey = new Map<string, PreparedLayerSource>(
      preparedLayerSources.map((preparedLayer) => [preparedLayer.layer.key, preparedLayer])
    );
    throwIfAborted(signal);
    ({ expectedTimepoints } = await computeLayerTimepointMetadata({
      preparedLayerSources,
      signal
    }));
    representativeTimepoint = Math.floor(expectedTimepoints / 2);
    ({ sourceMetadataByLayerKey, layerMetadataByKey } = await collectLayerMetadata({
      preparedLayerSources,
      signal
    }));
    backgroundMask = await buildBackgroundMaskForPreparedLayers({
      preparedLayerSources,
      backgroundMaskValues: backgroundMaskConfig?.values,
      shardingStrategy,
      signal
    });
    normalizationByLayerKey = await computeLayerRepresentativeNormalization({
      preparedLayerSources,
      representativeTimepoint,
      backgroundMask,
      signal,
      onProgress
    });
  } else {
    streamingPreparedLayerByKey = new Map<string, StreamingPreparedLayerSource>(
      streamingPreparedLayerSources.map((preparedLayer) => [preparedLayer.layer.key, preparedLayer])
    );
    throwIfAborted(signal);
    ({ expectedTimepoints } = await computeLayerTimepointMetadata({
      preparedLayerSources: streamingPreparedLayerSources,
      signal
    }));
    representativeTimepoint = Math.floor(expectedTimepoints / 2);
    tiffByFileCache = new Map<File, Promise<any>>();
    ({ sourceMetadataByLayerKey, layerMetadataByKey } = collectLayerMetadataFromStreamingSources({
      preparedLayerSources: streamingPreparedLayerSources
    }));
    backgroundMask = await buildBackgroundMaskForStreamingPreparedLayers({
      preparedLayerSources: streamingPreparedLayerSources,
      backgroundMaskValues: backgroundMaskConfig?.values,
      shardingStrategy,
      tiffByFileCache,
      signal
    });
    normalizationByLayerKey = await computeLayerRepresentativeNormalizationForStreaming({
      preparedLayerSources: streamingPreparedLayerSources,
      representativeTimepoint,
      backgroundMask,
      tiffByFileCache,
      signal,
      onProgress
    });
  }

  const totalVolumeCount = expectedTimepoints;
  const totalWritableVolumes = expectedTimepoints * sortedLayerSources.length;
  const workerizeNormalizationDownsample =
    datasetExecutionMode === 'in-memory' &&
    !backgroundMask &&
    resolveWorkerizeNormalizationDownsample(processingStrategy);
  const { manifest, layerManifestByKey, trackEntriesByTrackSetId } = buildManifestFromLayerMetadata({
    channels,
    trackSets,
    layersByChannel,
    layerMetadataByKey,
    expectedTimepoints,
    normalizationByLayerKey,
    movieMode,
    totalVolumeCount,
    voxelResolution,
    backgroundMask,
    shardingStrategy,
    preferDepthChunkOne: datasetExecutionMode === 'streaming'
  });

  const zarrStore = createZarrStoreFromPreprocessedStorage(storage);
  const root = zarr.root(zarrStore);

  throwIfAborted(signal);
  onProgress?.({ stage: 'finalize-manifest' });
  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  await writeTrackSetCsvFiles({ manifest, trackEntriesByTrackSetId, storage });
  await createManifestZarrArrays({ root, manifest });

  const chunkWriter = createChunkWriteDispatcher(storage, {
    maxInFlightWrites: shardingStrategy.maxInFlightChunkWrites
  });
  if (backgroundMask) {
    for (const scale of backgroundMask.scales) {
      await writeBackgroundMaskChunksForScale({
        chunkWriter,
        descriptor: scale.zarr.data,
        mask: {
          width: scale.width,
          height: scale.height,
          depth: scale.depth,
          data: scale.data
        },
        signal
      });
    }
  }
  const progressState = { processedVolumes: 0 };
  for (const channel of channels) {
    const layerSources = layersByChannel.get(channel.id) ?? [];
    for (const layer of layerSources) {
      const manifestLayer = layerManifestByKey.get(layer.key);
      if (!manifestLayer) {
        throw new Error(`Missing manifest entry for layer "${layer.key}".`);
      }
      const sourceMetadata = sourceMetadataByLayerKey.get(layer.key);
      if (!sourceMetadata) {
        throw new Error(`Missing source metadata for layer "${layer.key}".`);
      }
      if (datasetExecutionMode === 'in-memory') {
        const preparedLayer = preparedLayerByKey?.get(layer.key);
        if (!preparedLayer) {
          throw new Error(`Missing prepared layer for "${layer.key}".`);
        }
        await writeLayerVolumesFor3d({
          chunkWriter,
          preparedLayer,
          manifestLayer,
          sourceMetadata,
          representativeTimepoint,
          normalizationByLayerKey,
          backgroundMask: layer.isSegmentation ? null : backgroundMask,
          workerizeNormalizationDownsample,
          signal,
          onProgress,
          totalVolumeCount: totalWritableVolumes,
          progressState
        });
      } else {
        const preparedLayer = streamingPreparedLayerByKey?.get(layer.key);
        if (!preparedLayer) {
          throw new Error(`Missing streaming prepared layer for "${layer.key}".`);
        }
        if (!tiffByFileCache) {
          throw new Error('Missing TIFF cache for streaming preprocessing.');
        }
        await writeLayerVolumesFor3dStreaming({
          chunkWriter,
          preparedLayer,
          manifestLayer,
          sourceMetadata,
          normalizationByLayerKey,
          backgroundMask: layer.isSegmentation ? null : backgroundMask,
          tiffByFileCache,
          signal,
          onProgress,
          totalVolumeCount: totalWritableVolumes,
          progressState
        });
      }
    }
  }
  await chunkWriter.flush(signal);

  const channelSummaries = buildChannelSummariesFromManifest(manifest);
  const trackSummaries = buildTrackSummariesFromManifest(manifest, trackEntriesByTrackSetId);
  return { manifest, channelSummaries, trackSummaries, totalVolumeCount };
}
