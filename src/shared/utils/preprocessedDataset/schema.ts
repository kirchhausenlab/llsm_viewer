import { HISTOGRAM_BINS } from '../histogram';
import { buildBrickSubcellTextureSize, resolveBrickSubcellGrid } from '../brickSubcell';
import type {
  PreprocessedBackgroundMaskManifest,
  PreprocessedBackgroundMaskScaleManifestEntry,
  PreprocessedBrickAtlasTextureFormat,
  PreprocessedChannelManifest,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerScaleManifestEntry,
  PreprocessedManifest,
  PreprocessedScalePlaybackAtlasZarrDescriptor,
  PreprocessedScaleSkipHierarchyZarrDescriptor,
  PreprocessedScaleSubcellZarrDescriptor,
  PreprocessedShardedBlobDescriptor,
  PreprocessedTrackSetManifestEntry,
  ZarrArrayDescriptor,
  ZarrArrayShardingPlan,
  ZarrArrayShardingPlanArrayKind
} from './types';
import { PREPROCESSED_DATASET_FORMAT } from './types';
import {
  TEMPORAL_RESOLUTION_UNITS,
  VOXEL_RESOLUTION_UNITS,
  type TemporalResolutionMetadata,
  type VoxelResolutionValues
} from '../../../types/voxelResolution';
import type { VolumeDataType } from '../../../types/volume';

type UnknownRecord = Record<string, unknown>;

const VOLUME_DATA_TYPES: readonly VolumeDataType[] = [
  'uint8',
  'int8',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'float32',
  'float64'
];

const SHARDING_ARRAY_KINDS: readonly ZarrArrayShardingPlanArrayKind[] = [
  'volumeData',
  'skipHierarchy',
  'histogram',
  'subcell',
  'backgroundMask',
  'playbackAtlasIndices',
  'playbackAtlasData'
];

const BRICK_ATLAS_TEXTURE_FORMATS: readonly PreprocessedBrickAtlasTextureFormat[] = ['red', 'rg', 'rgba'];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectRecord(value: unknown, path: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`Invalid manifest schema at ${path}: expected object.`);
  }
  return value;
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid manifest schema at ${path}: expected array.`);
  }
  return value;
}

function expectString(value: unknown, path: string, options?: { nonEmpty?: boolean }): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid manifest schema at ${path}: expected string.`);
  }
  if (options?.nonEmpty && value.trim().length === 0) {
    throw new Error(`Invalid manifest schema at ${path}: expected non-empty string.`);
  }
  return value;
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid manifest schema at ${path}: expected boolean.`);
  }
  return value;
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid manifest schema at ${path}: expected finite number.`);
  }
  return value;
}

function expectInteger(value: unknown, path: string): number {
  const numeric = expectNumber(value, path);
  if (Math.floor(numeric) !== numeric) {
    throw new Error(`Invalid manifest schema at ${path}: expected integer.`);
  }
  return numeric;
}

function expectPositiveInteger(value: unknown, path: string): number {
  const integer = expectInteger(value, path);
  if (integer <= 0) {
    throw new Error(`Invalid manifest schema at ${path}: expected positive integer.`);
  }
  return integer;
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  const integer = expectInteger(value, path);
  if (integer < 0) {
    throw new Error(`Invalid manifest schema at ${path}: expected non-negative integer.`);
  }
  return integer;
}

function expectDataType(value: unknown, path: string): VolumeDataType {
  const dataType = expectString(value, path);
  if (!VOLUME_DATA_TYPES.includes(dataType as VolumeDataType)) {
    throw new Error(`Invalid manifest schema at ${path}: unsupported data type "${dataType}".`);
  }
  return dataType as VolumeDataType;
}

function expectIsoDate(value: unknown, path: string): string {
  const iso = expectString(value, path, { nonEmpty: true });
  if (Number.isNaN(Date.parse(iso))) {
    throw new Error(`Invalid manifest schema at ${path}: expected ISO-8601 date string.`);
  }
  return iso;
}

function expectIntegerTuple(
  value: unknown,
  path: string,
  expectedLength: number,
  options?: { positive?: boolean; nonNegative?: boolean }
): number[] {
  const entries = expectArray(value, path);
  if (entries.length !== expectedLength) {
    throw new Error(`Invalid manifest schema at ${path}: expected length ${expectedLength}, got ${entries.length}.`);
  }

  return entries.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (options?.positive) {
      return expectPositiveInteger(entry, entryPath);
    }
    if (options?.nonNegative) {
      return expectNonNegativeInteger(entry, entryPath);
    }
    return expectInteger(entry, entryPath);
  });
}

function expectNumberField(value: unknown, path: string): number {
  return expectNumber(value, path);
}

function validateShardingPlan(
  value: unknown,
  path: string,
  rank: number,
  chunkShape: readonly number[]
): ZarrArrayShardingPlan | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const sharding = expectRecord(value, path);
  const enabled = expectBoolean(sharding.enabled, `${path}.enabled`);
  const targetShardBytes = expectPositiveInteger(sharding.targetShardBytes, `${path}.targetShardBytes`);
  const shardShape = expectIntegerTuple(sharding.shardShape, `${path}.shardShape`, rank, { positive: true });
  const estimatedShardBytes = expectPositiveInteger(sharding.estimatedShardBytes, `${path}.estimatedShardBytes`);
  const arrayKindValue = sharding.arrayKind;
  const arrayKind =
    arrayKindValue === undefined
      ? undefined
      : (() => {
          const parsed = expectString(arrayKindValue, `${path}.arrayKind`, { nonEmpty: true });
          if (!SHARDING_ARRAY_KINDS.includes(parsed as ZarrArrayShardingPlanArrayKind)) {
            throw new Error(`Invalid manifest schema at ${path}.arrayKind: unsupported value "${parsed}".`);
          }
          return parsed as ZarrArrayShardingPlanArrayKind;
        })();
  const allowTemporalAxisValue = sharding.allowTemporalAxis;
  const allowTemporalAxis =
    allowTemporalAxisValue === undefined
      ? undefined
      : expectBoolean(allowTemporalAxisValue, `${path}.allowTemporalAxis`);
  const fullReadFallbackMaxBytesValue = sharding.fullReadFallbackMaxBytes;
  const fullReadFallbackMaxBytes =
    fullReadFallbackMaxBytesValue === undefined
      ? undefined
      : expectPositiveInteger(fullReadFallbackMaxBytesValue, `${path}.fullReadFallbackMaxBytes`);
  const reasonValue = sharding.reason;
  const reason =
    reasonValue === undefined
      ? undefined
      : expectString(reasonValue, `${path}.reason`, {
          nonEmpty: false
        });

  for (let axis = 0; axis < rank; axis += 1) {
    const shardAxis = shardShape[axis] ?? 0;
    const chunkAxis = chunkShape[axis] ?? 0;
    if (shardAxis % chunkAxis !== 0) {
      throw new Error(
        `Invalid manifest schema at ${path}.shardShape[${axis}]: ${shardAxis} must be divisible by chunkShape[${axis}] (${chunkAxis}).`
      );
    }
  }

  return {
    enabled,
    targetShardBytes,
    shardShape,
    estimatedShardBytes,
    ...(arrayKind !== undefined ? { arrayKind } : {}),
    ...(allowTemporalAxis !== undefined ? { allowTemporalAxis } : {}),
    ...(fullReadFallbackMaxBytes !== undefined ? { fullReadFallbackMaxBytes } : {}),
    ...(reason !== undefined ? { reason } : {})
  };
}

function validateDescriptor({
  value,
  path,
  expectedRank,
  expectedDataType,
  expectedShape
}: {
  value: unknown;
  path: string;
  expectedRank: number;
  expectedDataType?: VolumeDataType;
  expectedShape?: readonly number[];
}): ZarrArrayDescriptor {
  const descriptor = expectRecord(value, path);
  const descriptorPath = expectString(descriptor.path, `${path}.path`, { nonEmpty: true });
  const shape = expectIntegerTuple(descriptor.shape, `${path}.shape`, expectedRank, { positive: true });
  const chunkShape = expectIntegerTuple(descriptor.chunkShape, `${path}.chunkShape`, expectedRank, { positive: true });
  const dataType = expectDataType(descriptor.dataType, `${path}.dataType`);

  if (expectedDataType && dataType !== expectedDataType) {
    throw new Error(
      `Invalid manifest schema at ${path}.dataType: expected "${expectedDataType}", got "${dataType}".`
    );
  }

  if (expectedShape) {
    for (let axis = 0; axis < expectedShape.length; axis += 1) {
      const actual = shape[axis] ?? 0;
      const expected = expectedShape[axis] ?? 0;
      if (actual !== expected) {
        throw new Error(
          `Invalid manifest schema at ${path}.shape[${axis}]: expected ${expected}, got ${actual}.`
        );
      }
    }
  }

  const sharding = validateShardingPlan(descriptor.sharding, `${path}.sharding`, expectedRank, chunkShape);
  return {
    path: descriptorPath,
    shape,
    chunkShape,
    dataType,
    ...(sharding !== undefined ? { sharding } : {})
  };
}

function validateSkipHierarchyDescriptors({
  value,
  path,
  layerVolumeCount,
  expectedLeafGridShape
}: {
  value: unknown;
  path: string;
  layerVolumeCount: number;
  expectedLeafGridShape: readonly number[];
}): PreprocessedScaleSkipHierarchyZarrDescriptor {
  const skipHierarchy = expectRecord(value, path);
  const levelsValue = expectArray(skipHierarchy.levels, `${path}.levels`);
  if (levelsValue.length === 0) {
    throw new Error(`Invalid manifest schema at ${path}.levels: expected at least one hierarchy level.`);
  }

  const levels: PreprocessedScaleSkipHierarchyZarrDescriptor['levels'] = [];
  let previousLevel = -1;
  let previousGridShape: [number, number, number] | null = null;

  for (let index = 0; index < levelsValue.length; index += 1) {
    const levelPath = `${path}.levels[${index}]`;
    const levelEntry = expectRecord(levelsValue[index], levelPath);
    const level = expectNonNegativeInteger(levelEntry.level, `${levelPath}.level`);
    if (index === 0 && level !== 0) {
      throw new Error(`Invalid manifest schema at ${levelPath}.level: first hierarchy level must be 0.`);
    }
    if (level <= previousLevel) {
      throw new Error(`Invalid manifest schema at ${levelPath}.level: levels must be strictly increasing.`);
    }
    if (index > 0 && level !== previousLevel + 1) {
      throw new Error(
        `Invalid manifest schema at ${levelPath}.level: levels must be contiguous (expected ${previousLevel + 1}, got ${level}).`
      );
    }

    const gridShape = expectIntegerTuple(levelEntry.gridShape, `${levelPath}.gridShape`, 3, {
      positive: true
    }) as [number, number, number];
    const expectedGridShape: [number, number, number] = previousGridShape
      ? [
          Math.max(1, Math.ceil((previousGridShape[0] ?? 1) / 2)),
          Math.max(1, Math.ceil((previousGridShape[1] ?? 1) / 2)),
          Math.max(1, Math.ceil((previousGridShape[2] ?? 1) / 2))
        ]
      : [
          expectedLeafGridShape[0] ?? 1,
          expectedLeafGridShape[1] ?? 1,
          expectedLeafGridShape[2] ?? 1
        ];

    if (
      gridShape[0] !== expectedGridShape[0] ||
      gridShape[1] !== expectedGridShape[1] ||
      gridShape[2] !== expectedGridShape[2]
    ) {
      throw new Error(
        `Invalid manifest schema at ${levelPath}.gridShape: expected ${expectedGridShape.join('x')}, got ${gridShape.join('x')}.`
      );
    }

    const expectedShape = [layerVolumeCount, gridShape[0], gridShape[1], gridShape[2]];
    const occupancy = validateDescriptor({
      value: levelEntry.occupancy,
      path: `${levelPath}.occupancy`,
      expectedRank: 4,
      expectedDataType: 'uint8',
      expectedShape
    });
    const min = validateDescriptor({
      value: levelEntry.min,
      path: `${levelPath}.min`,
      expectedRank: 4,
      expectedDataType: 'uint8',
      expectedShape
    });
    const max = validateDescriptor({
      value: levelEntry.max,
      path: `${levelPath}.max`,
      expectedRank: 4,
      expectedDataType: 'uint8',
      expectedShape
    });
    levels.push({
      level,
      gridShape,
      occupancy,
      min,
      max
    });
    previousLevel = level;
    previousGridShape = gridShape;
  }

  const root = levels[levels.length - 1];
  if (
    !root ||
    root.gridShape[0] !== 1 ||
    root.gridShape[1] !== 1 ||
    root.gridShape[2] !== 1
  ) {
    throw new Error(
      `Invalid manifest schema at ${path}.levels: top hierarchy level must have gridShape [1,1,1].`
    );
  }

  return { levels };
}

function validateSubcellDescriptor({
  value,
  path,
  layerVolumeCount,
  chunkShape,
  expectedLeafGridShape
}: {
  value: unknown;
  path: string;
  layerVolumeCount: number;
  chunkShape: readonly number[];
  expectedLeafGridShape: readonly number[];
}): PreprocessedScaleSubcellZarrDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }
  const subcell = expectRecord(value, path);
  const gridShape = expectIntegerTuple(subcell.gridShape, `${path}.gridShape`, 3, {
    positive: true
  }) as [number, number, number];
  const expectedGridShape = resolveBrickSubcellGrid([
    chunkShape[0] ?? 1,
    chunkShape[1] ?? 1,
    chunkShape[2] ?? 1
  ]);
  if (!expectedGridShape) {
    throw new Error(`Invalid manifest schema at ${path}: subcell data is not expected for single-voxel bricks.`);
  }
  if (
    gridShape[0] !== expectedGridShape.z ||
    gridShape[1] !== expectedGridShape.y ||
    gridShape[2] !== expectedGridShape.x
  ) {
    throw new Error(
      `Invalid manifest schema at ${path}.gridShape: expected ${[
        expectedGridShape.z,
        expectedGridShape.y,
        expectedGridShape.x
      ].join('x')}, got ${gridShape.join('x')}.`
    );
  }

  const expectedTextureSize = buildBrickSubcellTextureSize({
    gridShape: [
      expectedLeafGridShape[0] ?? 1,
      expectedLeafGridShape[1] ?? 1,
      expectedLeafGridShape[2] ?? 1
    ] as [number, number, number],
    subcellGrid: expectedGridShape
  });
  const data = validateDescriptor({
    value: subcell.data,
    path: `${path}.data`,
    expectedRank: 5,
    expectedDataType: 'uint8',
    expectedShape: [
      layerVolumeCount,
      expectedTextureSize.depth,
      expectedTextureSize.height,
      expectedTextureSize.width,
      4
    ]
  });

  return {
    gridShape,
    data
  };
}

function validateBlobDescriptor({
  value,
  path,
  entryCount
}: {
  value: unknown;
  path: string;
  entryCount: number;
}): PreprocessedShardedBlobDescriptor {
  const descriptor = expectRecord(value, path);
  const descriptorPath = expectString(descriptor.path, `${path}.path`, { nonEmpty: true });
  const actualEntryCount = expectPositiveInteger(descriptor.entryCount, `${path}.entryCount`);
  if (actualEntryCount !== entryCount) {
    throw new Error(
      `Invalid manifest schema at ${path}.entryCount: expected ${entryCount}, got ${actualEntryCount}.`
    );
  }
  const sharding = validateShardingPlan(descriptor.sharding, `${path}.sharding`, 1, [1]);
  return {
    path: descriptorPath,
    entryCount: actualEntryCount,
    ...(sharding !== undefined ? { sharding } : {})
  };
}

function validatePlaybackAtlasDescriptor({
  value,
  path,
  layerVolumeCount,
  expectedLeafGridShape,
  chunkShape,
  channels,
  dataType
}: {
  value: unknown;
  path: string;
  layerVolumeCount: number;
  expectedLeafGridShape: readonly number[];
  chunkShape: readonly number[];
  channels: number;
  dataType: 'uint8' | 'uint16';
}): PreprocessedScalePlaybackAtlasZarrDescriptor | undefined {
  if (value === undefined) {
    return undefined;
  }
  const playbackAtlas = expectRecord(value, path);
  const textureFormat = expectString(playbackAtlas.textureFormat, `${path}.textureFormat`, { nonEmpty: true });
  if (!BRICK_ATLAS_TEXTURE_FORMATS.includes(textureFormat as PreprocessedBrickAtlasTextureFormat)) {
    throw new Error(`Invalid manifest schema at ${path}.textureFormat: unsupported value "${textureFormat}".`);
  }
  const textureChannels = expectPositiveInteger(playbackAtlas.textureChannels, `${path}.textureChannels`);
  const expectedTextureChannels =
    textureFormat === 'red' ? 1 : textureFormat === 'rg' ? 2 : 4;
  if (textureChannels !== expectedTextureChannels) {
    throw new Error(
      `Invalid manifest schema at ${path}.textureChannels: expected ${expectedTextureChannels}, got ${textureChannels}.`
    );
  }
  const atlasDataType = expectString(playbackAtlas.dataType, `${path}.dataType`, { nonEmpty: true });
  if (atlasDataType !== dataType) {
    throw new Error(
      `Invalid manifest schema at ${path}.dataType: expected ${dataType}, got ${atlasDataType}.`
    );
  }
  const brickAtlasIndices = validateDescriptor({
    value: playbackAtlas.brickAtlasIndices,
    path: `${path}.brickAtlasIndices`,
    expectedRank: 4,
    expectedDataType: 'int32',
    expectedShape: [
      layerVolumeCount,
      expectedLeafGridShape[0] ?? 1,
      expectedLeafGridShape[1] ?? 1,
      expectedLeafGridShape[2] ?? 1
    ]
  });
  const data = validateBlobDescriptor({
    value: playbackAtlas.data,
    path: `${path}.data`,
    entryCount: layerVolumeCount
  });
  if ((data.sharding?.shardShape.length ?? 1) !== 1) {
    throw new Error(`Invalid manifest schema at ${path}.data.sharding.shardShape: expected rank 1.`);
  }
  const chunkDepth = chunkShape[0] ?? 1;
  const chunkHeight = chunkShape[1] ?? 1;
  const chunkWidth = chunkShape[2] ?? 1;
  if (chunkDepth <= 0 || chunkHeight <= 0 || chunkWidth <= 0) {
    throw new Error(`Invalid manifest schema at ${path}: playback atlas requires positive chunk dimensions.`);
  }
  if (channels <= 0) {
    throw new Error(`Invalid manifest schema at ${path}: playback atlas requires positive channel count.`);
  }
  return {
    textureFormat: textureFormat as PreprocessedBrickAtlasTextureFormat,
    textureChannels,
    dataType,
    brickAtlasIndices,
    data
  };
}

function validateScale({
  value,
  path,
  layerVolumeCount,
  layerDimensions
}: {
  value: unknown;
  path: string;
  layerVolumeCount: number;
  layerDimensions: {
    width: number;
    height: number;
    depth: number;
    channels: number;
    dataType: VolumeDataType;
    isSegmentation: boolean;
  };
}): PreprocessedLayerScaleManifestEntry {
  const scale = expectRecord(value, path);
  const level = expectNonNegativeInteger(scale.level, `${path}.level`);
  const downsampleFactor = expectIntegerTuple(scale.downsampleFactor, `${path}.downsampleFactor`, 3, {
    positive: true
  }) as [number, number, number];
  const width = expectPositiveInteger(scale.width, `${path}.width`);
  const height = expectPositiveInteger(scale.height, `${path}.height`);
  const depth = expectPositiveInteger(scale.depth, `${path}.depth`);
  const channels = expectPositiveInteger(scale.channels, `${path}.channels`);
  const zarr = expectRecord(scale.zarr, `${path}.zarr`);

  if (level === 0) {
    if (
      width !== layerDimensions.width ||
      height !== layerDimensions.height ||
      depth !== layerDimensions.depth ||
      channels !== layerDimensions.channels
    ) {
      throw new Error(
        `Invalid manifest schema at ${path}: level 0 dimensions must match layer dimensions (${layerDimensions.width}x${layerDimensions.height}x${layerDimensions.depth}x${layerDimensions.channels}).`
      );
    }
  }

  const expectedDataShape = [layerVolumeCount, depth, height, width, channels];
  const expectedStoredDataType: VolumeDataType = layerDimensions.isSegmentation ? 'uint16' : 'uint8';
  const data = validateDescriptor({
    value: zarr.data,
    path: `${path}.zarr.data`,
    expectedRank: 5,
    expectedDataType: expectedStoredDataType,
    expectedShape: expectedDataShape
  });

  const chunkDepth = data.chunkShape[1] ?? 1;
  const chunkHeight = data.chunkShape[2] ?? 1;
  const chunkWidth = data.chunkShape[3] ?? 1;
  const expectedLeafGridShape = [
    Math.ceil(depth / chunkDepth),
    Math.ceil(height / chunkHeight),
    Math.ceil(width / chunkWidth)
  ];
  const skipHierarchy = validateSkipHierarchyDescriptors({
    value: zarr.skipHierarchy,
    path: `${path}.zarr.skipHierarchy`,
    layerVolumeCount,
    expectedLeafGridShape
  });

  const histogramValue = zarr.histogram;
  let histogram: ZarrArrayDescriptor | undefined;
  if (histogramValue !== undefined) {
    histogram = validateDescriptor({
      value: histogramValue,
      path: `${path}.zarr.histogram`,
      expectedRank: 2,
      expectedDataType: 'uint32',
      expectedShape: [layerVolumeCount, HISTOGRAM_BINS]
    });
  }

  const subcell = validateSubcellDescriptor({
    value: zarr.subcell,
    path: `${path}.zarr.subcell`,
    layerVolumeCount,
    chunkShape: [chunkDepth, chunkHeight, chunkWidth],
    expectedLeafGridShape
  });
  const playbackAtlas = validatePlaybackAtlasDescriptor({
    value: zarr.playbackAtlas,
    path: `${path}.zarr.playbackAtlas`,
    layerVolumeCount,
    expectedLeafGridShape,
    chunkShape: [chunkDepth, chunkHeight, chunkWidth],
    channels,
    dataType: data.dataType as 'uint8' | 'uint16'
  });

  return {
    level,
    downsampleFactor,
    width,
    height,
    depth,
    channels,
    zarr: {
      data,
      skipHierarchy,
      ...(subcell ? { subcell } : {}),
      ...(playbackAtlas ? { playbackAtlas } : {}),
      ...(histogram ? { histogram } : {})
    }
  };
}

function validateBackgroundMaskScale({
  value,
  path,
  expectedDimensions
}: {
  value: unknown;
  path: string;
  expectedDimensions: { width: number; height: number; depth: number };
}): PreprocessedBackgroundMaskScaleManifestEntry {
  const scale = expectRecord(value, path);
  const level = expectNonNegativeInteger(scale.level, `${path}.level`);
  const downsampleFactor = expectIntegerTuple(scale.downsampleFactor, `${path}.downsampleFactor`, 3, {
    positive: true
  }) as [number, number, number];
  const width = expectPositiveInteger(scale.width, `${path}.width`);
  const height = expectPositiveInteger(scale.height, `${path}.height`);
  const depth = expectPositiveInteger(scale.depth, `${path}.depth`);
  const zarr = expectRecord(scale.zarr, `${path}.zarr`);
  const data = validateDescriptor({
    value: zarr.data,
    path: `${path}.zarr.data`,
    expectedRank: 3,
    expectedDataType: 'uint8',
    expectedShape: [depth, height, width]
  });

  if (
    level === 0 &&
    (
      width !== expectedDimensions.width ||
      height !== expectedDimensions.height ||
      depth !== expectedDimensions.depth
    )
  ) {
    throw new Error(
      `Invalid manifest schema at ${path}: level 0 dimensions must match ${expectedDimensions.width}x${expectedDimensions.height}x${expectedDimensions.depth}.`
    );
  }

  return {
    level,
    downsampleFactor,
    width,
    height,
    depth,
    zarr: { data }
  };
}

function validateBackgroundMask(
  value: unknown,
  path: string
): PreprocessedBackgroundMaskManifest | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const backgroundMask = expectRecord(value, path);
  const sourceLayerKey = expectString(backgroundMask.sourceLayerKey, `${path}.sourceLayerKey`, { nonEmpty: true });
  const sourceDataType = expectDataType(backgroundMask.sourceDataType, `${path}.sourceDataType`);
  const rawValues = expectArray(backgroundMask.values, `${path}.values`);
  if (rawValues.length === 0) {
    throw new Error(`Invalid manifest schema at ${path}.values: expected at least one value.`);
  }
  const values = rawValues.map((entry, index) => expectNumber(entry, `${path}.values[${index}]`));
  const zarr = expectRecord(backgroundMask.zarr, `${path}.zarr`);
  const scalesValue = expectArray(zarr.scales, `${path}.zarr.scales`);
  if (scalesValue.length === 0) {
    throw new Error(`Invalid manifest schema at ${path}.zarr.scales: expected at least one scale.`);
  }

  const scales: PreprocessedBackgroundMaskScaleManifestEntry[] = [];
  let previousLevel = -1;
  let previousDimensions: { width: number; height: number; depth: number } | null = null;
  for (let index = 0; index < scalesValue.length; index += 1) {
    const scale = validateBackgroundMaskScale({
      value: scalesValue[index],
      path: `${path}.zarr.scales[${index}]`,
      expectedDimensions: previousDimensions ?? {
        width: expectPositiveInteger(
          expectRecord(scalesValue[0], `${path}.zarr.scales[0]`).width,
          `${path}.zarr.scales[0].width`
        ),
        height: expectPositiveInteger(
          expectRecord(scalesValue[0], `${path}.zarr.scales[0]`).height,
          `${path}.zarr.scales[0].height`
        ),
        depth: expectPositiveInteger(
          expectRecord(scalesValue[0], `${path}.zarr.scales[0]`).depth,
          `${path}.zarr.scales[0].depth`
        )
      }
    });
    if (index === 0 && scale.level !== 0) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[0].level: expected 0.`);
    }
    if (scale.level <= previousLevel) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[${index}].level: levels must increase.`);
    }
    if (index > 0 && scale.level !== previousLevel + 1) {
      throw new Error(
        `Invalid manifest schema at ${path}.zarr.scales[${index}].level: expected ${previousLevel + 1}, got ${scale.level}.`
      );
    }
    if (previousDimensions) {
      const expectedWidth = Math.max(1, Math.ceil(previousDimensions.width / 2));
      const expectedHeight = Math.max(1, Math.ceil(previousDimensions.height / 2));
      const expectedDepth = Math.max(1, Math.ceil(previousDimensions.depth / 2));
      if (
        scale.width !== expectedWidth ||
        scale.height !== expectedHeight ||
        scale.depth !== expectedDepth
      ) {
        throw new Error(
          `Invalid manifest schema at ${path}.zarr.scales[${index}]: expected ${expectedWidth}x${expectedHeight}x${expectedDepth}, got ${scale.width}x${scale.height}x${scale.depth}.`
        );
      }
    }
    previousLevel = scale.level;
    previousDimensions = { width: scale.width, height: scale.height, depth: scale.depth };
    scales.push(scale);
  }

  const lastScale = scales[scales.length - 1];
  if (!lastScale || lastScale.width !== 1 || lastScale.height !== 1 || lastScale.depth !== 1) {
    throw new Error(`Invalid manifest schema at ${path}.zarr.scales: final scale must be 1x1x1.`);
  }

  return {
    sourceLayerKey,
    sourceDataType,
    values,
    zarr: { scales }
  };
}

function validateNormalization(value: unknown, path: string): { min: number; max: number } | null {
  if (value === null) {
    return null;
  }
  const normalization = expectRecord(value, path);
  const min = expectNumberField(normalization.min, `${path}.min`);
  const max = expectNumberField(normalization.max, `${path}.max`);
  if (min > max) {
    throw new Error(`Invalid manifest schema at ${path}: expected min <= max.`);
  }
  return { min, max };
}

function validateTrackSet(value: unknown, path: string): PreprocessedTrackSetManifestEntry {
  const trackSet = expectRecord(value, path);
  const id = expectString(trackSet.id, `${path}.id`, { nonEmpty: true });
  const name = expectString(trackSet.name, `${path}.name`, { nonEmpty: true });
  const fileName = expectString(trackSet.fileName, `${path}.fileName`, { nonEmpty: true });
  let boundChannelId: string | null;
  if (trackSet.boundChannelId === null) {
    boundChannelId = null;
  } else {
    boundChannelId = expectString(trackSet.boundChannelId, `${path}.boundChannelId`, { nonEmpty: true });
  }
  const tracks = expectRecord(trackSet.tracks, `${path}.tracks`);
  const format = expectString(tracks.format, `${path}.tracks.format`);
  if (format !== 'compiled-v3') {
    throw new Error(`Invalid manifest schema at ${path}.tracks.format: expected "compiled-v3", got "${format}".`);
  }
  const header = expectRecord(tracks.header, `${path}.tracks.header`);
  const headerTrackSetId = expectString(header.trackSetId, `${path}.tracks.header.trackSetId`, { nonEmpty: true });
  const headerTrackSetName = expectString(header.trackSetName, `${path}.tracks.header.trackSetName`, { nonEmpty: true });
  let headerBoundChannelId: string | null;
  if (header.boundChannelId === null) {
    headerBoundChannelId = null;
  } else {
    headerBoundChannelId = expectString(header.boundChannelId, `${path}.tracks.header.boundChannelId`, { nonEmpty: true });
  }
  const totalTracks = expectNonNegativeInteger(header.totalTracks, `${path}.tracks.header.totalTracks`);
  const totalPoints = expectNonNegativeInteger(header.totalPoints, `${path}.tracks.header.totalPoints`);
  const totalSegments = expectNonNegativeInteger(header.totalSegments, `${path}.tracks.header.totalSegments`);
  const totalCentroids = expectNonNegativeInteger(header.totalCentroids, `${path}.tracks.header.totalCentroids`);
  const time = expectRecord(header.time, `${path}.tracks.header.time`);
  const timeMin = expectNumber(time.min, `${path}.tracks.header.time.min`);
  const timeMax = expectNumber(time.max, `${path}.tracks.header.time.max`);
  if (timeMin > timeMax) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.header.time: expected min <= max.`);
  }
  const amplitude = expectRecord(header.amplitude, `${path}.tracks.header.amplitude`);
  const amplitudeMin = expectNumber(amplitude.min, `${path}.tracks.header.amplitude.min`);
  const amplitudeMax = expectNumber(amplitude.max, `${path}.tracks.header.amplitude.max`);
  if (amplitudeMin > amplitudeMax) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.header.amplitude: expected min <= max.`);
  }
  const catalog = expectRecord(tracks.catalog, `${path}.tracks.catalog`);
  const catalogPath = expectString(catalog.path, `${path}.tracks.catalog.path`, { nonEmpty: true });
  const catalogFormat = expectString(catalog.format, `${path}.tracks.catalog.format`);
  if (catalogFormat !== 'binary') {
    throw new Error(`Invalid manifest schema at ${path}.tracks.catalog.format: expected "binary", got "${catalogFormat}".`);
  }
  const catalogVersion = expectInteger(catalog.version, `${path}.tracks.catalog.version`);
  if (catalogVersion !== 1) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.catalog.version: expected 1, got ${catalogVersion}.`);
  }
  const catalogStrideBytes = expectPositiveInteger(catalog.strideBytes, `${path}.tracks.catalog.strideBytes`);
  if (catalogStrideBytes !== 52) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.catalog.strideBytes: expected 52, got ${catalogStrideBytes}.`);
  }
  const catalogCount = expectNonNegativeInteger(catalog.count, `${path}.tracks.catalog.count`);

  const validateBinaryDescriptor = (
    descriptorValue: unknown,
    descriptorPath: string,
    expectedFormat: 'float32' | 'uint32',
    expectedStride: number,
  ) => {
    const descriptor = expectRecord(descriptorValue, descriptorPath);
    const binaryPath = expectString(descriptor.path, `${descriptorPath}.path`, { nonEmpty: true });
    const binaryFormat = expectString(descriptor.format, `${descriptorPath}.format`);
    if (binaryFormat !== expectedFormat) {
      throw new Error(
        `Invalid manifest schema at ${descriptorPath}.format: expected "${expectedFormat}", got "${binaryFormat}".`
      );
    }
    const stride = expectPositiveInteger(descriptor.stride, `${descriptorPath}.stride`);
    if (stride !== expectedStride) {
      throw new Error(
        `Invalid manifest schema at ${descriptorPath}.stride: expected ${expectedStride}, got ${stride}.`
      );
    }
    const count = expectNonNegativeInteger(descriptor.count, `${descriptorPath}.count`);
    return {
      path: binaryPath,
      format: expectedFormat,
      stride: expectedStride,
      count
    } as const;
  };

  return {
    id,
    name,
    fileName,
    boundChannelId,
    tracks: {
      format: 'compiled-v3',
      header: {
        trackSetId: headerTrackSetId,
        trackSetName: headerTrackSetName,
        boundChannelId: headerBoundChannelId,
        totalTracks,
        totalPoints,
        totalSegments,
        totalCentroids,
        time: {
          min: timeMin,
          max: timeMax
        },
        amplitude: {
          min: amplitudeMin,
          max: amplitudeMax
        }
      },
      catalog: {
        path: catalogPath,
        format: 'binary',
        version: 1,
        strideBytes: 52,
        count: catalogCount
      },
      pointData: validateBinaryDescriptor(tracks.pointData, `${path}.tracks.pointData`, 'float32', 5),
      segmentPositions: validateBinaryDescriptor(
        tracks.segmentPositions,
        `${path}.tracks.segmentPositions`,
        'float32',
        6
      ),
      segmentTimes: validateBinaryDescriptor(tracks.segmentTimes, `${path}.tracks.segmentTimes`, 'float32', 2),
      segmentTrackIndices: validateBinaryDescriptor(
        tracks.segmentTrackIndices,
        `${path}.tracks.segmentTrackIndices`,
        'uint32',
        1
      ),
      centroidData: validateBinaryDescriptor(tracks.centroidData, `${path}.tracks.centroidData`, 'float32', 4)
    }
  };
}

function validateLayer({
  value,
  path,
  channelId,
  totalVolumeCount
}: {
  value: unknown;
  path: string;
  channelId: string;
  totalVolumeCount: number;
}): PreprocessedLayerManifestEntry {
  const layer = expectRecord(value, path);
  const key = expectString(layer.key, `${path}.key`, { nonEmpty: true });
  const label = expectString(layer.label, `${path}.label`, { nonEmpty: true });
  const manifestChannelId = expectString(layer.channelId, `${path}.channelId`, { nonEmpty: true });
  if (manifestChannelId !== channelId) {
    throw new Error(
      `Invalid manifest schema at ${path}.channelId: expected "${channelId}", got "${manifestChannelId}".`
    );
  }
  const isSegmentation = expectBoolean(layer.isSegmentation, `${path}.isSegmentation`);
  const volumeCount = expectPositiveInteger(layer.volumeCount, `${path}.volumeCount`);
  if (volumeCount !== totalVolumeCount) {
    throw new Error(
      `Invalid manifest schema at ${path}.volumeCount: expected ${totalVolumeCount}, got ${volumeCount}.`
    );
  }

  const width = expectPositiveInteger(layer.width, `${path}.width`);
  const height = expectPositiveInteger(layer.height, `${path}.height`);
  const depth = expectPositiveInteger(layer.depth, `${path}.depth`);
  const channels = expectPositiveInteger(layer.channels, `${path}.channels`);
  const dataType = expectDataType(layer.dataType, `${path}.dataType`);
  const normalization = validateNormalization(layer.normalization, `${path}.normalization`);
  const zarr = expectRecord(layer.zarr, `${path}.zarr`);
  const scalesValue = expectArray(zarr.scales, `${path}.zarr.scales`);
  if (scalesValue.length === 0) {
    throw new Error(`Invalid manifest schema at ${path}.zarr.scales: expected at least one scale.`);
  }

  const scales: PreprocessedLayerScaleManifestEntry[] = [];
  let previousLevel = -1;
  for (let index = 0; index < scalesValue.length; index += 1) {
    const scale = validateScale({
      value: scalesValue[index],
      path: `${path}.zarr.scales[${index}]`,
      layerVolumeCount: volumeCount,
      layerDimensions: { width, height, depth, channels, dataType, isSegmentation }
    });
    if (scale.level <= previousLevel) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[${index}].level: levels must be strictly increasing.`);
    }
    if (index === 0 && scale.level !== 0) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[0].level: first scale must be level 0.`);
    }
    if (index > 0 && scale.level !== previousLevel + 1) {
      throw new Error(
        `Invalid manifest schema at ${path}.zarr.scales[${index}].level: levels must be contiguous (expected ${previousLevel + 1}, got ${scale.level}).`
      );
    }
    previousLevel = scale.level;
    scales.push(scale);
  }

  return {
    key,
    label,
    channelId: manifestChannelId,
    isSegmentation,
    volumeCount,
    width,
    height,
    depth,
    channels,
    dataType,
    normalization,
    zarr: {
      scales
    }
  };
}

function validateVoxelResolution(value: unknown, path: string): VoxelResolutionValues {
  const resolution = expectRecord(value, path);
  const x = expectNumberField(resolution.x, `${path}.x`);
  const y = expectNumberField(resolution.y, `${path}.y`);
  const z = expectNumberField(resolution.z, `${path}.z`);
  if (x <= 0 || y <= 0 || z <= 0) {
    throw new Error(`Invalid manifest schema at ${path}: voxel resolution values must be positive.`);
  }
  const unit = expectString(resolution.unit, `${path}.unit`);
  if (!VOXEL_RESOLUTION_UNITS.includes(unit as VoxelResolutionValues['unit'])) {
    throw new Error(`Invalid manifest schema at ${path}.unit: unsupported unit "${unit}".`);
  }
  const correctAnisotropy = expectBoolean(resolution.correctAnisotropy, `${path}.correctAnisotropy`);
  return {
    x,
    y,
    z,
    unit: unit as VoxelResolutionValues['unit'],
    correctAnisotropy
  };
}

function validateTemporalResolution(
  value: unknown,
  path: string
): TemporalResolutionMetadata {
  const resolution = expectRecord(value, path);
  const interval = expectNumberField(resolution.interval, `${path}.interval`);
  if (interval <= 0) {
    throw new Error(`Invalid manifest schema at ${path}.interval: expected positive number.`);
  }
  const unit = expectString(resolution.unit, `${path}.unit`);
  if (!TEMPORAL_RESOLUTION_UNITS.includes(unit as TemporalResolutionMetadata['unit'])) {
    throw new Error(`Invalid manifest schema at ${path}.unit: unsupported unit "${unit}".`);
  }
  return {
    interval,
    unit: unit as TemporalResolutionMetadata['unit']
  };
}

function validateAnisotropyCorrection(
  value: unknown,
  path: string
): { scale: { x: number; y: number; z: number } } | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const correction = expectRecord(value, path);
  const scale = expectRecord(correction.scale, `${path}.scale`);
  const x = expectNumberField(scale.x, `${path}.scale.x`);
  const y = expectNumberField(scale.y, `${path}.scale.y`);
  const z = expectNumberField(scale.z, `${path}.scale.z`);
  if (x <= 0 || y <= 0 || z <= 0) {
    throw new Error(`Invalid manifest schema at ${path}.scale: anisotropy scale values must be positive.`);
  }
  return {
    scale: { x, y, z }
  };
}

function validateChannel({
  value,
  path,
  totalVolumeCount
}: {
  value: unknown;
  path: string;
  totalVolumeCount: number;
}): PreprocessedChannelManifest {
  const channel = expectRecord(value, path);
  const id = expectString(channel.id, `${path}.id`, { nonEmpty: true });
  const name = expectString(channel.name, `${path}.name`, { nonEmpty: true });
  const layersValue = expectArray(channel.layers, `${path}.layers`);
  if (layersValue.length !== 1) {
    throw new Error(`Invalid manifest schema at ${path}.layers: expected exactly one layer.`);
  }

  const layers: PreprocessedLayerManifestEntry[] = [];
  for (let index = 0; index < layersValue.length; index += 1) {
    const layer = validateLayer({
      value: layersValue[index],
      path: `${path}.layers[${index}]`,
      channelId: id,
      totalVolumeCount
    });
    layers.push(layer);
  }

  return { id, name, layers };
}

export function coercePreprocessedManifest(value: unknown): PreprocessedManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('Missing preprocessed manifest in Zarr attributes.');
  }

  const manifest = expectRecord(value, 'manifest');
  const format = expectString(manifest.format, 'manifest.format');
  if (format !== PREPROCESSED_DATASET_FORMAT) {
    throw new Error('Unsupported preprocessed dataset format.');
  }

  expectIsoDate(manifest.generatedAt, 'manifest.generatedAt');
  const dataset = expectRecord(manifest.dataset, 'manifest.dataset');
  const movieMode = expectString(dataset.movieMode, 'manifest.dataset.movieMode');
  if (movieMode !== '3d') {
    throw new Error(
      `Invalid manifest schema at manifest.dataset.movieMode: expected "3d", got "${movieMode}".`
    );
  }

  const totalVolumeCount = expectPositiveInteger(dataset.totalVolumeCount, 'manifest.dataset.totalVolumeCount');
  const channelsValue = expectArray(dataset.channels, 'manifest.dataset.channels');
  if (channelsValue.length === 0) {
    throw new Error('Invalid manifest schema at manifest.dataset.channels: expected at least one channel.');
  }

  const channelIds = new Set<string>();
  const layerKeys = new Set<string>();
  for (let index = 0; index < channelsValue.length; index += 1) {
    const channel = validateChannel({
      value: channelsValue[index],
      path: `manifest.dataset.channels[${index}]`,
      totalVolumeCount
    });
    if (channelIds.has(channel.id)) {
      throw new Error(
        `Invalid manifest schema at manifest.dataset.channels[${index}].id: duplicate "${channel.id}".`
      );
    }
    channelIds.add(channel.id);

    for (let layerIndex = 0; layerIndex < channel.layers.length; layerIndex += 1) {
      const layerKey = channel.layers[layerIndex]?.key;
      if (!layerKey) {
        continue;
      }
      if (layerKeys.has(layerKey)) {
        throw new Error(
          `Invalid manifest schema at manifest.dataset.channels[${index}].layers[${layerIndex}].key: duplicate "${layerKey}".`
        );
      }
      layerKeys.add(layerKey);
    }
  }

  const trackSetsValue = expectArray(dataset.trackSets, 'manifest.dataset.trackSets');
  const trackSetIds = new Set<string>();
  for (let index = 0; index < trackSetsValue.length; index += 1) {
    const trackSet = validateTrackSet(trackSetsValue[index], `manifest.dataset.trackSets[${index}]`);
    if (trackSetIds.has(trackSet.id)) {
      throw new Error(
        `Invalid manifest schema at manifest.dataset.trackSets[${index}].id: duplicate "${trackSet.id}".`
      );
    }
    trackSetIds.add(trackSet.id);
    if (trackSet.boundChannelId && !channelIds.has(trackSet.boundChannelId)) {
      throw new Error(
        `Invalid manifest schema at manifest.dataset.trackSets[${index}].boundChannelId: unknown channel "${trackSet.boundChannelId}".`
      );
    }
  }

  validateVoxelResolution(dataset.voxelResolution, 'manifest.dataset.voxelResolution');
  validateTemporalResolution(dataset.temporalResolution, 'manifest.dataset.temporalResolution');
  validateAnisotropyCorrection(dataset.anisotropyCorrection, 'manifest.dataset.anisotropyCorrection');
  const backgroundMask = validateBackgroundMask(dataset.backgroundMask, 'manifest.dataset.backgroundMask');
  if (backgroundMask && !layerKeys.has(backgroundMask.sourceLayerKey)) {
    throw new Error(
      `Invalid manifest schema at manifest.dataset.backgroundMask.sourceLayerKey: unknown layer "${backgroundMask.sourceLayerKey}".`
    );
  }

  return manifest as PreprocessedManifest;
}
