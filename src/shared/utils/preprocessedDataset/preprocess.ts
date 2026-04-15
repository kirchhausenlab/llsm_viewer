import { fromBlob } from 'geotiff';
import * as zarr from 'zarrita';

import type { NormalizationParameters, NormalizedVolume } from '../../../core/volumeProcessing';
import {
  canonicalizeSegmentationVolume,
  computeNormalizationParameters,
  isSegmentationVolume,
  normalizeVolume,
  toSegmentationLabelId
} from '../../../core/volumeProcessing';
import type { PreprocessedStorage } from '../../storage/preprocessedStorage';
import { sortVolumeFiles } from '../appHelpers';
import { resolveImagejPageChannelLayout, type ImagejHyperstackLayout } from '../tiffHyperstack';
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
  PreprocessedBrickAtlasTextureFormat,
  PreprocessedScaleSkipHierarchyZarrDescriptor,
  PreprocessedScaleSkipHierarchyLevelZarrDescriptor,
  PreprocessedScalePlaybackAtlasZarrDescriptor,
  PreprocessedScaleSubcellZarrDescriptor,
  PreprocessedShardedBlobDescriptor,
  PreprocessedTrackSetSummary,
  TrackSetExportMetadata,
  ZarrArrayShardingPlan,
  ZarrArrayDescriptor,
  ZarrArrayShardingPlanArrayKind
} from './types';
import { PREPROCESSED_DATASET_FORMAT } from './types';
import { createZarrStoreFromPreprocessedStorage } from '../zarrStore';
import { buildChannelSummariesFromManifest, buildTrackSummariesFromManifest } from './manifest';
import { createTracksDescriptor, encodeCompiledTrackSetFiles } from './tracks';
import { encodeUint32ArrayLE, HISTOGRAM_BINS } from '../histogram';
import { encodeInt32ArrayLE } from '../int32';
import {
  buildPreprocessScalePyramidInWorker,
  supportsPreprocessScalePyramidWorker,
  type PreprocessScalePyramidWorkerResultScale
} from './preprocessScalePyramidWorker';
import { computeMultiscaleGeometryLevels } from './mipPolicy';
import {
  applyBackgroundMaskInPlace,
  buildBackgroundMaskFromTypedArray,
  coerceBackgroundMaskValuesForDataType,
  downsampleBackgroundMaskByAllMasked,
  findMinMaxExcludingBackgroundMask,
  type BackgroundMaskVolume
} from '../backgroundMask';
import {
  buildBrickSubcellChunkData,
  buildBrickSubcellTextureSize,
  resolveBrickSubcellGrid,
  writeBrickSubcellChunkData
} from '../brickSubcell';
import {
  DEFAULT_CHUNK_TARGET_BYTES,
  DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES,
  DEFAULT_SHARD_MAX_CHUNKS_PER_AXIS,
  DEFAULT_SHARD_TARGET_BYTES,
  buildSkipHierarchyGridShapes,
  computeLeafGridShapeForScaleDescriptor,
  createZarrBackgroundMaskArrayPath,
  createZarrScaleDataArrayPath,
  createZarrScaleHistogramArrayPath,
  createZarrScalePlaybackAtlasDataPath,
  createZarrScalePlaybackAtlasIndicesArrayPath,
  createZarrScaleSkipHierarchyArrayPath,
  createZarrScaleSubcellArrayPath,
  normalizePositiveInteger,
  resolvePreprocessExecutionMode,
  resolvePreprocessStreamingThresholdBytes,
  resolveWorkerizeNormalizationDownsample,
  type ResolvedPreprocessExecutionMode
} from './preprocess/config';
import { createChunkWriteDispatcher, type ChunkWriteDispatcher } from './preprocess/chunkWriter';
import {
  assertSkipHierarchyDescriptorMatchesGrid,
  buildPlaybackAtlasBlock,
  buildSkipHierarchyLevelBuffersFromLeaf,
  chunkLength,
  chunkStart,
  createSyntheticDescriptorForBlob,
  extractDataChunkBytesAndComputeStatistics,
  writeBackgroundMaskChunksForScale,
  writeDataChunksForScale
} from './preprocess/chunkEncoding';

export type PreprocessLayerSource = {
  channelId: string;
  channelLabel: string;
  key: string;
  label: string;
  files: File[];
  isSegmentation: boolean;
  sourceChannelCount?: number;
  sourceChannelIndex?: number | null;
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

function getLogicalSourceChannelCount(
  layer: Pick<PreprocessLayerSource, 'isSegmentation' | 'sourceChannelCount' | 'sourceChannelIndex'>,
  rawChannels: number
): number {
  if (!layer.isSegmentation && rawChannels > 1 && typeof layer.sourceChannelIndex === 'number') {
    return 1;
  }
  return rawChannels;
}

function getResolvedSourceChannelIndex(
  layer: Pick<PreprocessLayerSource, 'isSegmentation' | 'sourceChannelIndex'>,
): number | null {
  if (layer.isSegmentation) {
    return null;
  }
  return typeof layer.sourceChannelIndex === 'number' && Number.isFinite(layer.sourceChannelIndex)
    ? Math.max(0, Math.floor(layer.sourceChannelIndex))
    : null;
}

export type PreprocessArrayShardingPolicyOverrides = {
  targetShardBytes?: number;
  maxChunksPerAxis?: number;
  allowTemporalAxis?: boolean;
  fullReadFallbackMaxBytes?: number;
};

export type PreprocessDatasetToStorageOptions = {
  layers: PreprocessLayerSource[];
  channels: ChannelExportMetadata[];
  trackSets: TrackSetExportMetadata[];
  voxelResolution: NonNullable<PreprocessedManifest['dataset']['voxelResolution']>;
  temporalResolution: PreprocessedManifest['dataset']['temporalResolution'];
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
      fullReadFallbackMaxBytes?: number;
      arrayPolicies?: Partial<
        Record<ZarrArrayShardingPlanArrayKind, PreprocessArrayShardingPolicyOverrides>
      >;
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

type ShardingArrayPolicy = {
  targetShardBytes: number;
  maxChunksPerAxis: number;
  allowTemporalAxis: boolean;
  fullReadFallbackMaxBytes: number;
  reason: string;
};

const DEFAULT_SHARDING_POLICY_BY_ARRAY_KIND: Record<ZarrArrayShardingPlanArrayKind, ShardingArrayPolicy> = {
  volumeData: {
    targetShardBytes: 12 * 1024 * 1024,
    maxChunksPerAxis: 8,
    allowTemporalAxis: false,
    fullReadFallbackMaxBytes: 1 * 1024 * 1024,
    reason: 'Dense voxel payloads stay time-local and shard only across spatial axes.'
  },
  skipHierarchy: {
    targetShardBytes: 2 * 1024 * 1024,
    maxChunksPerAxis: 64,
    allowTemporalAxis: true,
    fullReadFallbackMaxBytes: 512 * 1024,
    reason: 'Skip-hierarchy metadata may group neighboring timepoints to collapse file counts.'
  },
  histogram: {
    targetShardBytes: 512 * 1024,
    maxChunksPerAxis: 256,
    allowTemporalAxis: true,
    fullReadFallbackMaxBytes: 512 * 1024,
    reason: 'Histograms group many tiny timepoint records into compact metadata shards.'
  },
  subcell: {
    targetShardBytes: 2 * 1024 * 1024,
    maxChunksPerAxis: 8,
    allowTemporalAxis: true,
    fullReadFallbackMaxBytes: 1 * 1024 * 1024,
    reason: 'Subcell metadata can group timepoints when range reads are available.'
  },
  playbackAtlasIndices: {
    targetShardBytes: 2 * 1024 * 1024,
    maxChunksPerAxis: 64,
    allowTemporalAxis: true,
    fullReadFallbackMaxBytes: 512 * 1024,
    reason: 'Playback atlas indices group neighboring timepoints into compact metadata shards.'
  },
  playbackAtlasData: {
    targetShardBytes: 8 * 1024 * 1024,
    maxChunksPerAxis: 8,
    allowTemporalAxis: true,
    fullReadFallbackMaxBytes: 1 * 1024 * 1024,
    reason: 'Playback atlas payloads are prepacked into timepoint blobs for direct upload.'
  },
  backgroundMask: {
    targetShardBytes: 4 * 1024 * 1024,
    maxChunksPerAxis: 8,
    allowTemporalAxis: false,
    fullReadFallbackMaxBytes: 1 * 1024 * 1024,
    reason: 'Background masks shard spatially and never mix unrelated data classes.'
  }
};

type ShardingStrategy = {
  chunkTargetBytes: number;
  maxInFlightChunkWrites: number;
  enabled: boolean;
  arrayPolicies: Record<ZarrArrayShardingPlanArrayKind, ShardingArrayPolicy>;
};

function resolveShardingStrategy(
  options: PreprocessDatasetToStorageOptions['storageStrategy'] | undefined
): ShardingStrategy {
  const sharding = options?.sharding;
  const sharedTargetShardBytes =
    sharding?.targetShardBytes === undefined
      ? undefined
      : normalizePositiveInteger(
          sharding.targetShardBytes,
          DEFAULT_SHARD_TARGET_BYTES,
          'storageStrategy.sharding.targetShardBytes'
        );
  const sharedMaxChunksPerAxis =
    sharding?.maxChunksPerAxis === undefined
      ? undefined
      : normalizePositiveInteger(
          sharding.maxChunksPerAxis,
          DEFAULT_SHARD_MAX_CHUNKS_PER_AXIS,
          'storageStrategy.sharding.maxChunksPerAxis'
        );
  const sharedFullReadFallbackMaxBytes =
    sharding?.fullReadFallbackMaxBytes === undefined
      ? undefined
      : normalizePositiveInteger(
          sharding.fullReadFallbackMaxBytes,
          DEFAULT_SHARD_TARGET_BYTES,
          'storageStrategy.sharding.fullReadFallbackMaxBytes'
        );

  const arrayPolicies = Object.fromEntries(
    Object.entries(DEFAULT_SHARDING_POLICY_BY_ARRAY_KIND).map(([arrayKind, defaults]) => {
      const overrides = sharding?.arrayPolicies?.[arrayKind as ZarrArrayShardingPlanArrayKind];
      const resolvedPolicy: ShardingArrayPolicy = {
        targetShardBytes: normalizePositiveInteger(
          overrides?.targetShardBytes,
          sharedTargetShardBytes ?? defaults.targetShardBytes,
          `storageStrategy.sharding.arrayPolicies.${arrayKind}.targetShardBytes`
        ),
        maxChunksPerAxis: normalizePositiveInteger(
          overrides?.maxChunksPerAxis,
          sharedMaxChunksPerAxis ?? defaults.maxChunksPerAxis,
          `storageStrategy.sharding.arrayPolicies.${arrayKind}.maxChunksPerAxis`
        ),
        allowTemporalAxis: overrides?.allowTemporalAxis ?? defaults.allowTemporalAxis,
        fullReadFallbackMaxBytes: normalizePositiveInteger(
          overrides?.fullReadFallbackMaxBytes,
          sharedFullReadFallbackMaxBytes ?? defaults.fullReadFallbackMaxBytes,
          `storageStrategy.sharding.arrayPolicies.${arrayKind}.fullReadFallbackMaxBytes`
        ),
        reason: defaults.reason
      };
      return [
        arrayKind,
        resolvedPolicy
      ];
    })
  ) as Record<ZarrArrayShardingPlanArrayKind, ShardingArrayPolicy>;

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
    arrayPolicies
  };
}

function computeChunkStorageBytes(chunkShape: number[], dataType: ZarrArrayDescriptor['dataType']): number {
  return chunkShape.reduce((product, dim) => product * dim, 1) * getBytesPerValue(dataType);
}

function createShardingPlan({
  arrayKind,
  shape,
  chunkShape,
  dataType,
  strategy,
  temporalAxisIndex
}: {
  arrayKind: ZarrArrayShardingPlanArrayKind;
  shape: number[];
  chunkShape: number[];
  dataType: ZarrArrayDescriptor['dataType'];
  strategy: ShardingStrategy;
  temporalAxisIndex?: number | null;
}): ZarrArrayShardingPlan {
  const policy = strategy.arrayPolicies[arrayKind];
  const chunkCounts = shape.map((shapeDim, axis) => {
    const axisChunk = chunkShape[axis] ?? 0;
    return Math.ceil(shapeDim / Math.max(1, axisChunk));
  });
  const multipliers = chunkShape.map(() => 1);
  const normalizedTemporalAxisIndex =
    temporalAxisIndex === null || temporalAxisIndex === undefined ? null : temporalAxisIndex;
  const axisCandidates = chunkShape.map((_, axis) => axis).filter((axis) => {
    if (policy.allowTemporalAxis) {
      return true;
    }
    return axis !== normalizedTemporalAxisIndex;
  });
  let estimatedShardBytes = computeChunkStorageBytes(chunkShape, dataType);

  while (estimatedShardBytes < policy.targetShardBytes) {
    let selectedAxis = -1;
    let selectedCapacity = 0;

    for (const axis of axisCandidates) {
      const count = chunkCounts[axis] ?? 1;
      const currentMultiplier = multipliers[axis] ?? 1;
      const maxMultiplier = Math.min(count, policy.maxChunksPerAxis);
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
    const maxMultiplier = Math.min(chunkCounts[selectedAxis] ?? 1, policy.maxChunksPerAxis);
    multipliers[selectedAxis] = Math.min(maxMultiplier, current * 2);
    const shardShape = chunkShape.map((dim, axis) => dim * (multipliers[axis] ?? 1));
    estimatedShardBytes = computeChunkStorageBytes(shardShape, dataType);
  }

  const shardShape = chunkShape.map((dim, axis) => dim * (multipliers[axis] ?? 1));
  return {
    enabled: strategy.enabled,
    targetShardBytes: policy.targetShardBytes,
    shardShape,
    estimatedShardBytes,
    arrayKind,
    allowTemporalAxis: policy.allowTemporalAxis,
    fullReadFallbackMaxBytes: policy.fullReadFallbackMaxBytes,
    reason: strategy.enabled
      ? policy.reason
      : `Advisory sharding plan. Enable storageStrategy.sharding.enabled to write/read real shards. ${policy.reason}`
  };
}

function shouldCreatePlaybackAtlasSidecar(scaleLevel: number, totalScaleCount: number): boolean {
  return totalScaleCount === 1 || scaleLevel > 0;
}

function getPlaybackBrickAtlasTextureFormat(sourceChannels: number): PreprocessedBrickAtlasTextureFormat {
  if (sourceChannels <= 1) {
    return 'red';
  }
  if (sourceChannels === 2) {
    return 'rg';
  }
  return 'rgba';
}

function getPlaybackBrickAtlasTextureChannels(textureFormat: PreprocessedBrickAtlasTextureFormat): number {
  if (textureFormat === 'red') {
    return 1;
  }
  if (textureFormat === 'rg') {
    return 2;
  }
  return 4;
}

function createPlaybackAtlasBlobDescriptor({
  path,
  entryCount,
  estimatedEntryBytes,
  strategy
}: {
  path: string;
  entryCount: number;
  estimatedEntryBytes: number;
  strategy: ShardingStrategy;
}): PreprocessedShardedBlobDescriptor {
  const policy = strategy.arrayPolicies.playbackAtlasData;
  const safeEstimatedEntryBytes = Math.max(1, Math.floor(estimatedEntryBytes));
  const entriesPerShard = Math.max(
    1,
    Math.min(
      entryCount,
      policy.maxChunksPerAxis,
      Math.max(1, Math.floor(policy.targetShardBytes / safeEstimatedEntryBytes))
    )
  );

  return {
    path,
    entryCount,
    sharding: {
      enabled: strategy.enabled,
      targetShardBytes: policy.targetShardBytes,
      shardShape: [entriesPerShard],
      estimatedShardBytes: safeEstimatedEntryBytes * entriesPerShard,
      arrayKind: 'playbackAtlasData',
      allowTemporalAxis: true,
      fullReadFallbackMaxBytes: policy.fullReadFallbackMaxBytes,
      reason: strategy.enabled
        ? policy.reason
        : `Advisory sharding plan. Enable storageStrategy.sharding.enabled to write/read real shards. ${policy.reason}`
    }
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
        arrayKind: 'backgroundMask',
        shape: [geometryLevel.depth, geometryLevel.height, geometryLevel.width],
        chunkShape: [chunkDepth, chunkHeight, chunkWidth],
        dataType: 'uint8',
        strategy: shardingStrategy,
        temporalAxisIndex: null
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
    const storedDataType: 'uint8' | 'uint16' = layer.isSegmentation ? 'uint16' : 'uint8';

    const [dataChunkDepth, dataChunkHeight, dataChunkWidth] = chooseSpatialChunkDimensions({
      depth: currentDepth,
      height: currentHeight,
      width: currentWidth,
      bytesPerVoxel: Math.max(1, layerMetadata.channels) * getBytesPerValue(storedDataType),
      targetChunkBytes: shardingStrategy.chunkTargetBytes,
      preferDepthChunkOne
    });

    const dataDescriptor: ZarrArrayDescriptor = {
      path: createZarrScaleDataArrayPath(layer.channelId, layer.key, level),
      shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth, layerMetadata.channels],
      chunkShape: [1, dataChunkDepth, dataChunkHeight, dataChunkWidth, layerMetadata.channels],
      dataType: storedDataType,
      sharding: createShardingPlan({
        arrayKind: 'volumeData',
        shape: [expectedTimepoints, currentDepth, currentHeight, currentWidth, layerMetadata.channels],
        chunkShape: [1, dataChunkDepth, dataChunkHeight, dataChunkWidth, layerMetadata.channels],
        dataType: storedDataType,
        strategy: shardingStrategy,
        temporalAxisIndex: 0
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
              arrayKind: 'skipHierarchy',
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy,
              temporalAxisIndex: 0
            })
          },
          min: {
            path: createZarrScaleSkipHierarchyArrayPath(layer.channelId, layer.key, level, hierarchyLevel, 'min'),
            shape,
            chunkShape,
            dataType: 'uint8',
            sharding: createShardingPlan({
              arrayKind: 'skipHierarchy',
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy,
              temporalAxisIndex: 0
            })
          },
          max: {
            path: createZarrScaleSkipHierarchyArrayPath(layer.channelId, layer.key, level, hierarchyLevel, 'max'),
            shape,
            chunkShape,
            dataType: 'uint8',
            sharding: createShardingPlan({
              arrayKind: 'skipHierarchy',
              shape,
              chunkShape,
              dataType: 'uint8',
              strategy: shardingStrategy,
              temporalAxisIndex: 0
            })
          }
        };
      }
    );
    const skipHierarchyDescriptor: PreprocessedScaleSkipHierarchyZarrDescriptor = {
      levels: skipHierarchyLevels
    };
    const subcellGrid = layer.isSegmentation
      ? null
      : resolveBrickSubcellGrid([dataChunkDepth, dataChunkHeight, dataChunkWidth]);
    const subcellDescriptor: PreprocessedScaleSubcellZarrDescriptor | undefined = subcellGrid
      ? (() => {
          const subcellTextureSize = buildBrickSubcellTextureSize({
            gridShape: leafGridShape,
            subcellGrid
          });
          return {
            gridShape: [subcellGrid.z, subcellGrid.y, subcellGrid.x],
            data: {
              path: createZarrScaleSubcellArrayPath(layer.channelId, layer.key, level),
              shape: [
                expectedTimepoints,
                subcellTextureSize.depth,
                subcellTextureSize.height,
                subcellTextureSize.width,
                4
              ],
              chunkShape: [
                1,
                subcellTextureSize.depth,
                subcellTextureSize.height,
                subcellTextureSize.width,
                4
              ],
              dataType: 'uint8',
              sharding: createShardingPlan({
                arrayKind: 'subcell',
                shape: [
                  expectedTimepoints,
                  subcellTextureSize.depth,
                  subcellTextureSize.height,
                  subcellTextureSize.width,
                  4
                ],
                chunkShape: [
                  1,
                  subcellTextureSize.depth,
                  subcellTextureSize.height,
                  subcellTextureSize.width,
                  4
                ],
                dataType: 'uint8',
                strategy: shardingStrategy,
                temporalAxisIndex: 0
              })
            }
          };
        })()
      : undefined;
    const playbackAtlasDescriptor: PreprocessedScalePlaybackAtlasZarrDescriptor | undefined =
      shouldCreatePlaybackAtlasSidecar(level, geometryLevels.length)
        ? (() => {
            const textureFormat = getPlaybackBrickAtlasTextureFormat(layerMetadata.channels);
            const textureChannels = getPlaybackBrickAtlasTextureChannels(textureFormat);
            const expectedBrickCount = leafGridShape[0] * leafGridShape[1] * leafGridShape[2];
            const atlasBlockBytes =
              dataChunkDepth *
              dataChunkHeight *
              dataChunkWidth *
              textureChannels *
              getBytesPerValue(storedDataType);
            return {
              textureFormat,
              textureChannels,
              dataType: storedDataType,
              brickAtlasIndices: {
                path: createZarrScalePlaybackAtlasIndicesArrayPath(layer.channelId, layer.key, level),
                shape: [expectedTimepoints, leafGridShape[0], leafGridShape[1], leafGridShape[2]],
                chunkShape: [1, leafGridShape[0], leafGridShape[1], leafGridShape[2]],
                dataType: 'int32',
                sharding: createShardingPlan({
                  arrayKind: 'playbackAtlasIndices',
                  shape: [expectedTimepoints, leafGridShape[0], leafGridShape[1], leafGridShape[2]],
                  chunkShape: [1, leafGridShape[0], leafGridShape[1], leafGridShape[2]],
                  dataType: 'int32',
                  strategy: shardingStrategy,
                  temporalAxisIndex: 0
                })
              },
              data: createPlaybackAtlasBlobDescriptor({
                path: createZarrScalePlaybackAtlasDataPath(layer.channelId, layer.key, level),
                entryCount: expectedTimepoints,
                estimatedEntryBytes: atlasBlockBytes * expectedBrickCount,
                strategy: shardingStrategy
              })
            };
          })()
        : undefined;
    const histogramDescriptor: ZarrArrayDescriptor | undefined = layer.isSegmentation
      ? undefined
      : {
          path: createZarrScaleHistogramArrayPath(layer.channelId, layer.key, level),
          shape: [expectedTimepoints, HISTOGRAM_BINS],
          chunkShape: [1, HISTOGRAM_BINS],
          dataType: 'uint32',
          sharding: createShardingPlan({
            arrayKind: 'histogram',
            shape: [expectedTimepoints, HISTOGRAM_BINS],
            chunkShape: [1, HISTOGRAM_BINS],
            dataType: 'uint32',
            strategy: shardingStrategy,
            temporalAxisIndex: 0
          })
        };

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
        ...(subcellDescriptor ? { subcell: subcellDescriptor } : {}),
        ...(playbackAtlasDescriptor ? { playbackAtlas: playbackAtlasDescriptor } : {}),
        ...(histogramDescriptor ? { histogram: histogramDescriptor } : {})
      }
    });
  }

  return scales;
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
  const volume = extractSelectedSourceChannelFromVolumePayload(
    await loadVolumeFor3dTimepoint(file, loader, signal),
    layer
  );
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
  rawSourceMetadata: LayerMetadata;
  sourceMetadata: LayerMetadata;
  imagejPageChannelLayout: ImagejHyperstackLayout | null;
  getTimepointSource: (timepoint: number) => StreamingTimepointSliceSource;
};

type ProbedTiffFileMetadata = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType: VolumePayload['dataType'];
  imagejPageChannelLayout: ImagejHyperstackLayout | null;
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

function extractSelectedSourceChannelFromTypedArray({
  source,
  sourceChannels,
  channelIndex,
  dataType,
  context
}: {
  source: SupportedTypedArray;
  sourceChannels: number;
  channelIndex: number;
  dataType: VolumePayload['dataType'];
  context: string;
}): SupportedTypedArray {
  if (sourceChannels <= 1) {
    if (channelIndex > 0) {
      throw new Error(`${context} cannot select channel ${channelIndex + 1} from a single-channel source.`);
    }
    return source;
  }
  if (channelIndex < 0 || channelIndex >= sourceChannels) {
    throw new Error(`${context} requested source channel ${channelIndex + 1} of ${sourceChannels}.`);
  }
  if (source.length % sourceChannels !== 0) {
    throw new Error(`${context} returned a sample count that is not divisible by its channel count.`);
  }

  const voxelCount = Math.floor(source.length / sourceChannels);
  const extracted = createWritableVolumeArray(dataType, voxelCount) as SupportedTypedArray;
  for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex += 1) {
    extracted[voxelIndex] = source[voxelIndex * sourceChannels + channelIndex] ?? 0;
  }
  return extracted;
}

function extractSelectedSourceChannelFromVolumePayload(
  volume: VolumePayload,
  layer: Pick<PreprocessLayerSource, 'channelLabel' | 'sourceChannelCount' | 'sourceChannelIndex' | 'isSegmentation'>
): VolumePayload {
  const channelIndex = getResolvedSourceChannelIndex(layer);
  if (channelIndex === null) {
    return volume;
  }

  const expectedSourceChannels =
    typeof layer.sourceChannelCount === 'number' && Number.isFinite(layer.sourceChannelCount)
      ? Math.max(1, Math.floor(layer.sourceChannelCount))
      : volume.channels;
  if (volume.channels !== expectedSourceChannels) {
    throw new Error(
      `Layer "${layer.channelLabel}" expected ${expectedSourceChannels} source channels but decoded ${volume.channels}.`
    );
  }

  const source = createVolumeTypedArray(volume.dataType, volume.data);
  const extracted = extractSelectedSourceChannelFromTypedArray({
    source,
    sourceChannels: volume.channels,
    channelIndex,
    dataType: volume.dataType,
    context: `Layer "${layer.channelLabel}"`
  });
  const { min, max } = computeSliceMinMax(extracted);

  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    channels: 1,
    dataType: volume.dataType,
    min,
    max,
    data: extracted.buffer.slice(extracted.byteOffset, extracted.byteOffset + extracted.byteLength)
  };
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
  const imagejPageChannelLayout = resolveImagejPageChannelLayout({
    samplesPerPixel: channels,
    imageCount,
    imageDescription: firstImage.fileDirectory.ImageDescription ?? null
  });
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
    dataType,
    imagejPageChannelLayout
  };
}

function estimatePreparedLayerVolumeBytes(layer: StreamingPreparedLayerSource): number {
  const rawMetadata = layer.rawSourceMetadata;
  const metadata = layer.sourceMetadata;
  const voxelCount = metadata.width * metadata.height * metadata.depth;
  const sourceBytes = voxelCount * rawMetadata.channels * getBytesPerValue(rawMetadata.dataType);
  const outputBytes = voxelCount * metadata.channels * getBytesPerValue(layer.layer.isSegmentation ? 'uint16' : 'uint8');
  return sourceBytes + outputBytes * 2;
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
    const rawSourceMetadata: LayerMetadata = {
      width: firstMetadata.width,
      height: firstMetadata.height,
      depth: firstMetadata.depth,
      channels: firstMetadata.channels,
      dataType: firstMetadata.dataType
    };
    const sourceChannelCount = firstMetadata.imagejPageChannelLayout?.channels ?? firstMetadata.channels;
    const logicalDepth = firstMetadata.imagejPageChannelLayout?.slices ?? firstMetadata.depth;
    const resolvedSourceChannelIndex = getResolvedSourceChannelIndex(layer);
    if (resolvedSourceChannelIndex !== null && resolvedSourceChannelIndex >= sourceChannelCount) {
      throw new Error(
        `Layer "${layer.channelLabel}" requested source channel ${resolvedSourceChannelIndex + 1} of ${sourceChannelCount}.`
      );
    }
    const logicalSourceMetadata: LayerMetadata = {
      width: firstMetadata.width,
      height: firstMetadata.height,
      depth: logicalDepth,
      channels: getLogicalSourceChannelCount(layer, sourceChannelCount),
      dataType: firstMetadata.dataType
    };

    if (inputInterpretation === '3d-movie') {
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: layer.files.length,
        rawSourceMetadata,
        sourceMetadata: logicalSourceMetadata,
        imagejPageChannelLayout: firstMetadata.imagejPageChannelLayout,
        getTimepointSource: (timepoint) => {
          const file = layer.files[timepoint];
          if (!file) {
            throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
          }
          return {
            kind: 'single-file',
            file,
            startSlice: 0,
            depth: rawSourceMetadata.depth,
            expectedFileDepth: rawSourceMetadata.depth,
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
          channels: getLogicalSourceChannelCount(layer, sourceChannelCount),
          dataType: firstMetadata.dataType
        };
        const timepointCount = logicalDepth;
        if (timepointCount <= 0) {
          throw new Error(`Layer "${layer.channelLabel}" did not decode any image planes.`);
        }
        const prepared: StreamingPreparedLayerSource = {
          layer,
          timepointCount,
          rawSourceMetadata,
          sourceMetadata,
          imagejPageChannelLayout: firstMetadata.imagejPageChannelLayout,
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

      if (logicalDepth !== 1) {
        throw new Error(
          `Layer "${layer.channelLabel}" in 2D movie mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${firstFile.name}" is 3D (depth ${logicalDepth}).`
        );
      }

      const sourceMetadata: LayerMetadata = {
        width: firstMetadata.width,
        height: firstMetadata.height,
        depth: 1,
        channels: getLogicalSourceChannelCount(layer, sourceChannelCount),
        dataType: firstMetadata.dataType
      };
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: layer.files.length,
        rawSourceMetadata,
        sourceMetadata,
        imagejPageChannelLayout: firstMetadata.imagejPageChannelLayout,
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
        depth: logicalDepth,
        channels: getLogicalSourceChannelCount(layer, sourceChannelCount),
        dataType: firstMetadata.dataType
      };
      const prepared: StreamingPreparedLayerSource = {
        layer,
        timepointCount: 1,
        rawSourceMetadata,
        sourceMetadata,
        imagejPageChannelLayout: firstMetadata.imagejPageChannelLayout,
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

    if (logicalDepth !== 1) {
      throw new Error(
        `Layer "${layer.channelLabel}" in Single 3D volume mode accepts either a single 3D TIFF or a sequence of 2D TIFFs. File "${firstFile.name}" is 3D (depth ${logicalDepth}).`
      );
    }

    const sourceMetadata: LayerMetadata = {
      width: firstMetadata.width,
      height: firstMetadata.height,
      depth: layer.files.length,
      channels: getLogicalSourceChannelCount(layer, sourceChannelCount),
      dataType: firstMetadata.dataType
    };
    const prepared: StreamingPreparedLayerSource = {
      layer,
      timepointCount: 1,
      rawSourceMetadata,
      sourceMetadata,
      imagejPageChannelLayout: firstMetadata.imagejPageChannelLayout,
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
  rawExpectedMetadata,
  outputMetadata,
  selectedSourceChannelIndex,
  imagejPageChannelLayout,
  tiffByFileCache,
  signal,
  onSlice
}: {
  layer: PreprocessLayerSource;
  timepoint: number;
  source: StreamingTimepointSliceSource;
  rawExpectedMetadata: LayerMetadata;
  outputMetadata: LayerMetadata;
  selectedSourceChannelIndex: number | null;
  imagejPageChannelLayout: ImagejHyperstackLayout | null;
  tiffByFileCache: TiffByFileCache;
  signal?: AbortSignal;
  onSlice: (slice: SupportedTypedArray, z: number) => Promise<void> | void;
}): Promise<void> {
  const rawExpectedSliceLength =
    rawExpectedMetadata.width * rawExpectedMetadata.height * rawExpectedMetadata.channels;
  const outputSliceLength = outputMetadata.width * outputMetadata.height * outputMetadata.channels;

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
          width: rawExpectedMetadata.width,
          height: rawExpectedMetadata.height,
          depth: imageCount,
          channels: rawExpectedMetadata.channels,
          dataType: rawExpectedMetadata.dataType,
          expected: rawExpectedMetadata
        })
      );
    }

    const availableDepth = imagejPageChannelLayout ? imagejPageChannelLayout.slices : imageCount;
    if (source.startSlice < 0 || source.startSlice + source.depth > availableDepth) {
      throw new Error(`Layer "${layer.channelLabel}" timepoint ${timepoint + 1} is out of range.`);
    }

    const readRawPage = async (pageIndex: number): Promise<SupportedTypedArray> => {
      const image = await tiff.getImage(pageIndex);
      const width = image.getWidth();
      const height = image.getHeight();
      const channels = image.getSamplesPerPixel();
      if (
        width !== rawExpectedMetadata.width ||
        height !== rawExpectedMetadata.height ||
        channels !== rawExpectedMetadata.channels
      ) {
        throw new Error(
          createShapeMismatchErrorMessage({
            layer,
            timepoint,
            width,
            height,
            depth: source.depth,
            channels,
            dataType: rawExpectedMetadata.dataType,
            expected: rawExpectedMetadata
          })
        );
      }

      const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
      if (!ArrayBuffer.isView(rasterRaw)) {
        throw new Error(`File "${source.file.name}" does not provide raster data as a typed array.`);
      }
      const typed = ensureTypedArrayMatchesExpectedDataType(
        rasterRaw as SupportedTypedArray,
        rawExpectedMetadata.dataType,
        source.file.name,
        pageIndex
      );
      if (typed.length !== rawExpectedSliceLength) {
        throw new Error(`Slice ${pageIndex + 1} in file "${source.file.name}" returned an unexpected slice length.`);
      }
      return typed;
    };

    if (imagejPageChannelLayout) {
      const logicalChannelCount = imagejPageChannelLayout.channels;
      for (let localZ = 0; localZ < source.depth; localZ += 1) {
        const logicalSliceIndex = source.startSlice + localZ;
        if (selectedSourceChannelIndex !== null) {
          const pageIndex = logicalSliceIndex * logicalChannelCount + selectedSourceChannelIndex;
          const preparedSlice = await readRawPage(pageIndex);
          if (preparedSlice.length !== outputSliceLength) {
            throw new Error(`Slice ${pageIndex + 1} in file "${source.file.name}" returned an unexpected extracted slice length.`);
          }
          await onSlice(preparedSlice, localZ);
          continue;
        }

        if (outputMetadata.channels !== logicalChannelCount) {
          throw new Error(
            `Layer "${layer.channelLabel}" requires ${logicalChannelCount} logical channels but has no selected source channel.`
          );
        }

        const combined = createWritableVolumeArray(
          rawExpectedMetadata.dataType,
          outputSliceLength
        ) as SupportedTypedArray;
        const voxelCount = rawExpectedSliceLength;
        for (let channelIndex = 0; channelIndex < logicalChannelCount; channelIndex += 1) {
          const pageIndex = logicalSliceIndex * logicalChannelCount + channelIndex;
          const channelSlice = await readRawPage(pageIndex);
          for (let voxelIndex = 0; voxelIndex < voxelCount; voxelIndex += 1) {
            combined[voxelIndex * logicalChannelCount + channelIndex] = channelSlice[voxelIndex] ?? 0;
          }
        }
        await onSlice(combined, localZ);
      }
      return;
    }

    for (let localZ = 0; localZ < source.depth; localZ += 1) {
      throwIfAborted(signal);
      const imageIndex = source.startSlice + localZ;
      const typed = await readRawPage(imageIndex);
      if (typed.length !== rawExpectedSliceLength) {
        throw new Error(`Slice ${imageIndex + 1} in file "${source.file.name}" returned an unexpected slice length.`);
      }
      const preparedSlice = selectedSourceChannelIndex === null
        ? typed
        : extractSelectedSourceChannelFromTypedArray({
            source: typed,
            sourceChannels: rawExpectedMetadata.channels,
            channelIndex: selectedSourceChannelIndex,
            dataType: rawExpectedMetadata.dataType,
            context: `Slice ${imageIndex + 1} in file "${source.file.name}"`
          });
      if (preparedSlice.length !== outputSliceLength) {
        throw new Error(`Slice ${imageIndex + 1} in file "${source.file.name}" returned an unexpected extracted slice length.`);
      }
      await onSlice(preparedSlice, localZ);
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
    if (
      width !== rawExpectedMetadata.width ||
      height !== rawExpectedMetadata.height ||
      channels !== rawExpectedMetadata.channels
    ) {
      throw new Error(
        createShapeMismatchErrorMessage({
          layer,
          timepoint,
          width,
          height,
          depth: source.files.length,
          channels,
          dataType: rawExpectedMetadata.dataType,
          expected: rawExpectedMetadata
        })
      );
    }

    const rasterRaw = (await image.readRasters({ interleave: true })) as unknown;
    if (!ArrayBuffer.isView(rasterRaw)) {
      throw new Error(`File "${file.name}" does not provide raster data as a typed array.`);
    }
    const typed = ensureTypedArrayMatchesExpectedDataType(
      rasterRaw as SupportedTypedArray,
      rawExpectedMetadata.dataType,
      file.name,
      0
    );
    if (typed.length !== rawExpectedSliceLength) {
      throw new Error(`Slice 1 in file "${file.name}" returned an unexpected slice length.`);
    }
    const preparedSlice = selectedSourceChannelIndex === null
      ? typed
      : extractSelectedSourceChannelFromTypedArray({
          source: typed,
          sourceChannels: rawExpectedMetadata.channels,
          channelIndex: selectedSourceChannelIndex,
          dataType: rawExpectedMetadata.dataType,
          context: `Slice 1 in file "${file.name}"`
        });
    if (preparedSlice.length !== outputSliceLength) {
      throw new Error(`Slice 1 in file "${file.name}" returned an unexpected extracted slice length.`);
    }
    await onSlice(preparedSlice, z);
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

function canonicalizeSegmentationSlice(source: SupportedTypedArray): Uint16Array {
  const labels = new Uint16Array(source.length);
  for (let i = 0; i < source.length; i += 1) {
    labels[i] = toSegmentationLabelId(source[i] as number);
  }
  return labels;
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

function downsampleSegmentationSlicesByMode({
  first,
  second,
  width,
  height
}: {
  first: Uint16Array;
  second: Uint16Array | null;
  width: number;
  height: number;
}): Uint16Array {
  const nextWidth = Math.max(1, Math.ceil(width / 2));
  const nextHeight = Math.max(1, Math.ceil(height / 2));
  const downsampled = new Uint16Array(nextWidth * nextHeight);

  for (let y = 0; y < nextHeight; y += 1) {
    const sourceYStart = y * 2;
    const sourceYEnd = Math.min(height, sourceYStart + 2);
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceXStart = x * 2;
      const sourceXEnd = Math.min(width, sourceXStart + 2);
      const destinationIndex = y * nextWidth + x;

      const candidateLabels = new Uint16Array(8);
      const candidateCounts = new Uint8Array(8);
      let candidateSize = 0;
      let bestLabel = 0;
      let bestCount = -1;

      const accumulate = (slice: Uint16Array) => {
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
    rawExpectedMetadata: preparedLayer.rawSourceMetadata,
    outputMetadata: sourceMetadata,
    selectedSourceChannelIndex: getResolvedSourceChannelIndex(preparedLayer.layer),
    imagejPageChannelLayout: preparedLayer.imagejPageChannelLayout,
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
      rawExpectedMetadata: preparedLayer.rawSourceMetadata,
      outputMetadata: preparedLayer.sourceMetadata,
      selectedSourceChannelIndex: getResolvedSourceChannelIndex(preparedLayer.layer),
      imagejPageChannelLayout: preparedLayer.imagejPageChannelLayout,
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
      channels: layer.isSegmentation ? 1 : firstVolume.channels,
      dataType: layer.isSegmentation ? 'uint16' : firstVolume.dataType
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
      channels: layer.isSegmentation ? 1 : source.channels,
      dataType: layer.isSegmentation ? 'uint16' : source.dataType
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
  temporalResolution,
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
  temporalResolution: PreprocessedManifest['dataset']['temporalResolution'];
  backgroundMask: SharedBackgroundMask | null;
  shardingStrategy: ShardingStrategy;
  preferDepthChunkOne?: boolean;
}): {
  manifest: PreprocessedManifest;
  layerManifestByKey: Map<string, PreprocessedLayerManifestEntry>;
  compiledTrackSetsByTrackSetId: Map<string, TrackSetExportMetadata['compiled']>;
} {
  const manifestChannels: PreprocessedManifest['dataset']['channels'] = [];
  const layerManifestByKey = new Map<string, PreprocessedLayerManifestEntry>();
  const compiledTrackSetsByTrackSetId = new Map<string, TrackSetExportMetadata['compiled']>();
  const manifestTrackSets: PreprocessedManifest['dataset']['trackSets'] = trackSets.map((trackSet) => {
    compiledTrackSetsByTrackSetId.set(trackSet.id, trackSet.compiled);
    return {
      id: trackSet.id,
      name: trackSet.name,
      fileName: trackSet.fileName,
      boundChannelId: trackSet.boundChannelId,
      tracks: createTracksDescriptor(trackSet.id, trackSet.compiled.summary)
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
          ? null
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
      temporalResolution,
      anisotropyCorrection,
      backgroundMask: manifestBackgroundMask
    }
  };

  return {
    manifest,
    layerManifestByKey,
    compiledTrackSetsByTrackSetId
  };
}

async function writeTrackSetFiles({
  manifest,
  compiledTrackSetsByTrackSetId,
  storage
}: {
  manifest: PreprocessedManifest;
  compiledTrackSetsByTrackSetId: Map<string, TrackSetExportMetadata['compiled']>;
  storage: PreprocessedStorage;
}): Promise<void> {
  for (const trackSet of manifest.dataset.trackSets) {
    const compiled = compiledTrackSetsByTrackSetId.get(trackSet.id);
    if (!compiled) {
      throw new Error(`Missing compiled tracks for track set "${trackSet.id}".`);
    }
    const payload = encodeCompiledTrackSetFiles(compiled);
    await storage.writeFile(trackSet.tracks.catalog.path, payload.catalogBytes);
    await storage.writeFile(trackSet.tracks.pointData.path, payload.pointBytes);
    await storage.writeFile(trackSet.tracks.segmentPositions.path, payload.segmentPositionBytes);
    await storage.writeFile(trackSet.tracks.segmentTimes.path, payload.segmentTimeBytes);
    await storage.writeFile(trackSet.tracks.segmentTrackIndices.path, payload.segmentTrackIndexBytes);
    await storage.writeFile(trackSet.tracks.centroidData.path, payload.centroidBytes);
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

        if (scale.zarr.histogram) {
          const histogram = scale.zarr.histogram;
          await zarr.create(root.resolve(histogram.path), {
            shape: histogram.shape,
            data_type: histogram.dataType,
            chunk_shape: histogram.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(histogram),
            fill_value: 0
          });
        }

        if (scale.zarr.subcell) {
          const subcell = scale.zarr.subcell.data;
          await zarr.create(root.resolve(subcell.path), {
            shape: subcell.shape,
            data_type: subcell.dataType,
            chunk_shape: subcell.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(subcell),
            fill_value: 0
          });
        }

        if (scale.zarr.playbackAtlas) {
          const indices = scale.zarr.playbackAtlas.brickAtlasIndices;
          await zarr.create(root.resolve(indices.path), {
            shape: indices.shape,
            data_type: indices.dataType,
            chunk_shape: indices.chunkShape,
            codecs: resolveArrayCodecsForDescriptor(indices),
            fill_value: -1
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

type StreamingScaleWriteState = {
  scale: PreprocessedLayerScaleManifestEntry;
  backgroundMaskScale: BackgroundMaskVolume | null;
  dataDescriptor: ZarrArrayDescriptor;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
  subcellDescriptor?: PreprocessedScaleSubcellZarrDescriptor;
  playbackAtlasDescriptor?: PreprocessedScalePlaybackAtlasZarrDescriptor;
  playbackAtlasDataEntryDescriptor?: ZarrArrayDescriptor;
  histogram: Uint32Array | null;
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
  subcellTextureBytes: Uint8Array | null;
  subcellTextureSize: { width: number; height: number; depth: number } | null;
  playbackAtlasIndices: Int32Array | null;
  playbackAtlasOccupiedBrickCount: number;
  playbackAtlasBlockByteLength: number;
  playbackAtlasBlocks: Uint8Array[];
};

type StreamingIntensityScaleTransition = {
  isSegmentation: false;
  pendingSlice: Uint8Array | null;
  sourceWidth: number;
  sourceHeight: number;
  sourceChannels: number;
};

type StreamingSegmentationScaleTransition = {
  isSegmentation: true;
  pendingSlice: Uint16Array | null;
  sourceWidth: number;
  sourceHeight: number;
};

type StreamingScaleTransition = StreamingIntensityScaleTransition | StreamingSegmentationScaleTransition;

function createStreamingScaleWriteState({
  scale,
  backgroundMaskScale,
  skipHierarchyDescriptor,
  subcellDescriptor
}: {
  scale: PreprocessedLayerScaleManifestEntry;
  backgroundMaskScale: BackgroundMaskVolume | null;
  skipHierarchyDescriptor?: PreprocessedScaleSkipHierarchyZarrDescriptor;
  subcellDescriptor?: PreprocessedScaleSubcellZarrDescriptor;
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

  let subcellTextureBytes: Uint8Array | null = null;
  let subcellTextureSize: { width: number; height: number; depth: number } | null = null;
  if (subcellDescriptor) {
    const subcellGrid = {
      x: subcellDescriptor.gridShape[2],
      y: subcellDescriptor.gridShape[1],
      z: subcellDescriptor.gridShape[0]
    };
    subcellTextureSize = buildBrickSubcellTextureSize({
      gridShape: leafGridShape,
      subcellGrid
    });
    const expectedTextureLength = subcellTextureSize.width * subcellTextureSize.height * subcellTextureSize.depth * 4;
    const expectedTimepointShape = [
      subcellTextureSize.depth,
      subcellTextureSize.height,
      subcellTextureSize.width,
      4
    ];
    const actualTimepointShape = subcellDescriptor.data.shape.slice(1);
    if (
      actualTimepointShape.length !== expectedTimepointShape.length ||
      actualTimepointShape.some((value, index) => value !== expectedTimepointShape[index])
    ) {
      throw new Error(`Subcell descriptor shape mismatch for ${dataDescriptor.path}.`);
    }
    subcellTextureBytes = new Uint8Array(expectedTextureLength);
  }

  const playbackAtlasDescriptor = scale.zarr.playbackAtlas;
  const playbackAtlasIndices = playbackAtlasDescriptor ? new Int32Array(chunkCount).fill(-1) : null;
  const playbackAtlasBlockByteLength = playbackAtlasDescriptor
    ? chunkDepth *
      chunkHeight *
      chunkWidth *
      playbackAtlasDescriptor.textureChannels *
      getBytesPerValue(playbackAtlasDescriptor.dataType)
    : 0;

  return {
    scale,
    backgroundMaskScale,
    dataDescriptor,
    skipHierarchyDescriptor,
    subcellDescriptor,
    playbackAtlasDescriptor,
    playbackAtlasDataEntryDescriptor: playbackAtlasDescriptor
      ? createSyntheticDescriptorForBlob(playbackAtlasDescriptor.data)
      : undefined,
    histogram: scale.zarr.histogram ? new Uint32Array(HISTOGRAM_BINS) : null,
    chunkDepth,
    chunkHeight,
    chunkWidth,
    yChunks,
    xChunks,
    zChunks,
    nextSliceIndex: 0,
    leafMinValues,
    leafMaxValues,
    leafOccupancyValues,
    subcellTextureBytes,
    subcellTextureSize,
    playbackAtlasIndices,
    playbackAtlasOccupiedBrickCount: 0,
    playbackAtlasBlockByteLength,
    playbackAtlasBlocks: []
  };
}

async function writeStreamingScaleSlice({
  chunkWriter,
  state,
  timepoint,
  dataSlice,
  signal
}: {
  chunkWriter: ChunkWriteDispatcher;
  state: StreamingScaleWriteState;
  timepoint: number;
  dataSlice: Uint8Array | Uint16Array;
  signal?: AbortSignal;
}): Promise<void> {
  const { scale, dataDescriptor, histogram } = state;
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
        dataType: dataDescriptor.dataType as 'uint8' | 'uint16',
        width: scale.width,
        height: scale.height,
        channels: scale.channels,
        zStart: 0,
        zLength: 1,
        yStart,
        yLength,
        xStart,
        xLength,
        histogram: histogram ?? undefined,
        backgroundMask: backgroundMaskSlice
      });
      await chunkWriter.writeChunk({
        descriptor: dataDescriptor,
        chunkCoords: [timepoint, zIndex, yChunk, xChunk, 0],
        bytes: chunk,
        signal
      });
      const chunkIndex = (zIndex * state.yChunks + yChunk) * state.xChunks + xChunk;
      if (state.leafMinValues && state.leafMaxValues && state.leafOccupancyValues) {
        state.leafMinValues[chunkIndex] = stats.min;
        state.leafMaxValues[chunkIndex] = stats.max;
        state.leafOccupancyValues[chunkIndex] = stats.occupancy > 0 ? 255 : 0;
      }
      if (state.playbackAtlasDescriptor && state.playbackAtlasIndices && stats.occupancy > 0) {
        state.playbackAtlasIndices[chunkIndex] = state.playbackAtlasOccupiedBrickCount;
        state.playbackAtlasOccupiedBrickCount += 1;
        state.playbackAtlasBlocks.push(
          buildPlaybackAtlasBlock({
            chunkBytes: chunk,
            dataType: state.playbackAtlasDescriptor.dataType,
            zExtent: 1,
            yExtent: yLength,
            xExtent: xLength,
            sourceChannels: scale.channels,
            chunkDepth: state.chunkDepth,
            chunkHeight: state.chunkHeight,
            chunkWidth: state.chunkWidth,
            textureFormat: state.playbackAtlasDescriptor.textureFormat,
            textureChannels: state.playbackAtlasDescriptor.textureChannels
          })
        );
      }
      if (state.subcellDescriptor && state.subcellTextureBytes && state.subcellTextureSize) {
        const subcellChunk = buildBrickSubcellChunkData({
          chunkShape: [state.chunkDepth, state.chunkHeight, state.chunkWidth],
          components: scale.channels,
          readVoxelComponent: (localZ, localY, localX, component) => {
            if (localZ !== 0 || localY < 0 || localY >= yLength || localX < 0 || localX >= xLength) {
              return 0;
            }
            const sourceIndex = ((localY * xLength + localX) * scale.channels) + component;
            return chunk[sourceIndex] ?? 0;
          }
        });
        if (!subcellChunk) {
          throw new Error(`Failed to build subcell texture data for ${dataDescriptor.path}.`);
        }
        if (
          subcellChunk.subcellGrid.z !== state.subcellDescriptor.gridShape[0] ||
          subcellChunk.subcellGrid.y !== state.subcellDescriptor.gridShape[1] ||
          subcellChunk.subcellGrid.x !== state.subcellDescriptor.gridShape[2]
        ) {
          throw new Error(`Subcell grid mismatch for ${dataDescriptor.path}.`);
        }
          writeBrickSubcellChunkData({
            targetData: state.subcellTextureBytes,
            targetSize: state.subcellTextureSize,
            brickCoords: { x: xChunk, y: yChunk, z: zIndex },
            chunkData: subcellChunk.data,
            subcellGrid: subcellChunk.subcellGrid
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

  if (state.subcellDescriptor && state.subcellTextureBytes) {
    await chunkWriter.writeChunk({
      descriptor: state.subcellDescriptor.data,
      chunkCoords: [timepoint, 0, 0, 0, 0],
      bytes: state.subcellTextureBytes,
      signal
    });
  }

  if (state.playbackAtlasDescriptor && state.playbackAtlasIndices && state.playbackAtlasDataEntryDescriptor) {
    const atlasBytes = new Uint8Array(state.playbackAtlasOccupiedBrickCount * state.playbackAtlasBlockByteLength);
    for (let blockIndex = 0; blockIndex < state.playbackAtlasBlocks.length; blockIndex += 1) {
      const block = state.playbackAtlasBlocks[blockIndex];
      if (!block) {
        continue;
      }
      atlasBytes.set(block, blockIndex * state.playbackAtlasBlockByteLength);
    }
    await chunkWriter.writeChunk({
      descriptor: state.playbackAtlasDescriptor.brickAtlasIndices,
      chunkCoords: [timepoint, 0, 0, 0],
      bytes: encodeInt32ArrayLE(state.playbackAtlasIndices),
      signal
    });
    await chunkWriter.writeChunk({
      descriptor: state.playbackAtlasDataEntryDescriptor,
      chunkCoords: [timepoint],
      bytes: atlasBytes,
      signal
    });
  }

  if (state.scale.zarr.histogram && state.histogram) {
    await chunkWriter.writeChunk({
      descriptor: state.scale.zarr.histogram,
      chunkCoords: [timepoint, 0],
      bytes: encodeUint32ArrayLE(state.histogram),
      signal
    });
  }
}

function createStreamingScaleTransition({
  fromScale,
  isSegmentation
}: {
  fromScale: PreprocessedLayerScaleManifestEntry;
  isSegmentation: boolean;
}): StreamingScaleTransition {
  if (isSegmentation) {
    return {
      isSegmentation: true,
      pendingSlice: null,
      sourceWidth: fromScale.width,
      sourceHeight: fromScale.height
    };
  }
  return {
    isSegmentation: false,
    pendingSlice: null,
    sourceWidth: fromScale.width,
    sourceHeight: fromScale.height,
    sourceChannels: fromScale.channels
  };
}

function pushStreamingScaleTransitionSlice({
  transition,
  dataSlice
}: {
  transition: StreamingScaleTransition;
  dataSlice: Uint8Array | Uint16Array;
}): { data: Uint8Array | Uint16Array } | null {
  if (transition.isSegmentation) {
    if (!(dataSlice instanceof Uint16Array)) {
      throw new Error('Segmentation streaming transition expects uint16 slices.');
    }
    if (transition.pendingSlice === null) {
      transition.pendingSlice = dataSlice;
      return null;
    }
    const outputLabels = downsampleSegmentationSlicesByMode({
      first: transition.pendingSlice,
      second: dataSlice,
      width: transition.sourceWidth,
      height: transition.sourceHeight
    });
    transition.pendingSlice = null;
    return { data: outputLabels };
  }

  if (!(dataSlice instanceof Uint8Array)) {
    throw new Error('Intensity streaming transition expects uint8 slices.');
  }
  const xyDownsampledData = downsampleDataSliceXYByMax({
    source: dataSlice,
    width: transition.sourceWidth,
    height: transition.sourceHeight,
    channels: transition.sourceChannels
  });

  if (transition.pendingSlice === null) {
    transition.pendingSlice = xyDownsampledData;
    return null;
  }

  mergeDataSlicesByMaxInPlace(transition.pendingSlice, xyDownsampledData);
  const outputData = transition.pendingSlice;
  transition.pendingSlice = null;
  return { data: outputData };
}

function flushStreamingScaleTransition(
  transition: StreamingScaleTransition
): { data: Uint8Array | Uint16Array } | null {
  if (!transition.pendingSlice) {
    return null;
  }

  if (transition.isSegmentation) {
    const outputLabels = downsampleSegmentationSlicesByMode({
      first: transition.pendingSlice,
      second: null,
      width: transition.sourceWidth,
      height: transition.sourceHeight
    });
    transition.pendingSlice = null;
    return { data: outputLabels };
  }

  const outputData = transition.pendingSlice;
  transition.pendingSlice = null;
  return { data: outputData };
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
      skipHierarchyDescriptor: scale.zarr.skipHierarchy,
      subcellDescriptor: scale.zarr.subcell
    })
  );
  const transitions = sortedScales.slice(0, -1).map((scale, index) => {
    const nextScale = sortedScales[index + 1];
    if (!nextScale) {
      throw new Error(`Missing next scale while preparing streaming transition for layer "${preparedLayer.layer.key}".`);
    }
    return createStreamingScaleTransition({
      fromScale: scale,
      isSegmentation: preparedLayer.layer.isSegmentation
    });
  });

  const processScaleSlice = async (
    scaleIndex: number,
    dataSlice: Uint8Array | Uint16Array
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
      signal
    });
    const transition = transitions[scaleIndex];
    if (!transition) {
      return;
    }
    const produced = pushStreamingScaleTransitionSlice({
      transition,
      dataSlice
    });
    if (produced) {
      await processScaleSlice(scaleIndex + 1, produced.data);
    }
  };

  const timepointSource = preparedLayer.getTimepointSource(timepoint);

  if (preparedLayer.layer.isSegmentation) {
    if (sourceMetadata.channels !== 1) {
      throw new Error(
        `Segmentation layer "${preparedLayer.layer.channelLabel}" must decode to exactly one source channel.`
      );
    }
    await forEachSliceInStreamingTimepointSource({
      layer: preparedLayer.layer,
      timepoint,
      source: timepointSource,
      rawExpectedMetadata: preparedLayer.rawSourceMetadata,
      outputMetadata: sourceMetadata,
      selectedSourceChannelIndex: null,
      imagejPageChannelLayout: preparedLayer.imagejPageChannelLayout,
      tiffByFileCache,
      signal,
      onSlice: async (slice) => {
        await processScaleSlice(0, canonicalizeSegmentationSlice(slice));
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
      rawExpectedMetadata: preparedLayer.rawSourceMetadata,
      outputMetadata: sourceMetadata,
      selectedSourceChannelIndex: getResolvedSourceChannelIndex(preparedLayer.layer),
      imagejPageChannelLayout: preparedLayer.imagejPageChannelLayout,
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
      await processScaleSlice(index + 1, produced.data);
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
  channels: 1;
  data: Uint16Array;
}): {
  width: number;
  height: number;
  depth: number;
  channels: 1;
  data: Uint16Array;
} {
  const nextDepth = Math.max(1, Math.ceil(volume.depth / 2));
  const nextHeight = Math.max(1, Math.ceil(volume.height / 2));
  const nextWidth = Math.max(1, Math.ceil(volume.width / 2));
  const downsampled = new Uint16Array(nextDepth * nextHeight * nextWidth);

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

        const candidateLabels = new Uint16Array(8);
        const candidateCounts = new Uint8Array(8);
        let candidateSize = 0;
        let bestLabel = 0;
        let bestCount = -1;
        for (let sourceZ = sourceZStart; sourceZ < sourceZEnd; sourceZ += 1) {
          for (let sourceY = sourceYStart; sourceY < sourceYEnd; sourceY += 1) {
            for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX += 1) {
              const sourceIndex = (sourceZ * volume.height + sourceY) * volume.width + sourceX;
              const label = volume.data[sourceIndex] ?? 0;
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
    channels: 1,
    data: downsampled
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

  let volumeForScale = isSegmentationVolume(normalized)
    ? {
        width: normalized.width,
        height: normalized.height,
        depth: normalized.depth,
        channels: normalized.channels,
        data: normalized.labels,
        isSegmentation: true as const
      }
    : {
        width: normalized.width,
        height: normalized.height,
        depth: normalized.depth,
        channels: normalized.channels,
        data: normalized.normalized,
        isSegmentation: false as const
      };
  const backgroundMaskByLevel = new Map<number, SharedBackgroundMaskScale>(
    (backgroundMask?.scales ?? []).map((scale) => [scale.level, scale])
  );

  for (let scaleIndex = 0; scaleIndex < sortedScales.length; scaleIndex += 1) {
    const scale = sortedScales[scaleIndex]!;
    const histogram = await writeDataChunksForScale({
      chunkWriter,
      descriptor: scale.zarr.data,
      skipHierarchyDescriptor: scale.zarr.skipHierarchy,
      subcellDescriptor: scale.zarr.subcell,
      playbackAtlasDescriptor: scale.zarr.playbackAtlas,
      timepoint,
      volume: volumeForScale,
      backgroundMask: backgroundMaskByLevel.get(scale.level) ?? null,
      signal
    });
    if (scale.zarr.histogram && histogram) {
      await chunkWriter.writeChunk({
        descriptor: scale.zarr.histogram,
        chunkCoords: [timepoint, 0],
        bytes: encodeUint32ArrayLE(histogram),
        signal
      });
    }

    const hasNextScale = scaleIndex < sortedScales.length - 1;
    if (!hasNextScale) {
      continue;
    }

    volumeForScale = volumeForScale.isSegmentation
      ? {
          ...downsampleLabelsByMode(volumeForScale),
          isSegmentation: true as const
        }
      : {
          ...downsampleDataByMaxPooling(volumeForScale),
          isSegmentation: false as const
        };
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
      subcellDescriptor: scale.zarr.subcell,
      playbackAtlasDescriptor: scale.zarr.playbackAtlas,
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
    if (scale.zarr.histogram && histogram) {
      await chunkWriter.writeChunk({
        descriptor: scale.zarr.histogram,
        chunkCoords: [timepoint, 0],
        bytes: encodeUint32ArrayLE(histogram),
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
        ? canonicalizeSegmentationVolume(raw)
        : normalizeVolume(
            raw,
            normalization ?? computeRepresentativeNormalization(raw, backgroundMask?.scales[0] ?? null)
          );

      if (normalized.kind === 'intensity' && backgroundMask && backgroundMask.maskedVoxelCount > 0) {
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
  temporalResolution,
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
  const { manifest, layerManifestByKey, compiledTrackSetsByTrackSetId } = buildManifestFromLayerMetadata({
    channels,
    trackSets,
    layersByChannel,
    layerMetadataByKey,
    expectedTimepoints,
    normalizationByLayerKey,
    movieMode,
    totalVolumeCount,
    voxelResolution,
    temporalResolution,
    backgroundMask,
    shardingStrategy,
    preferDepthChunkOne: datasetExecutionMode === 'streaming'
  });

  const zarrStore = createZarrStoreFromPreprocessedStorage(storage);
  const root = zarr.root(zarrStore);

  throwIfAborted(signal);
  onProgress?.({ stage: 'finalize-manifest' });
  await zarr.create(root, { attributes: { llsmViewerPreprocessed: manifest } });
  await writeTrackSetFiles({ manifest, compiledTrackSetsByTrackSetId, storage });
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
  const trackSummaries = buildTrackSummariesFromManifest(manifest);
  return { manifest, channelSummaries, trackSummaries, totalVolumeCount };
}
