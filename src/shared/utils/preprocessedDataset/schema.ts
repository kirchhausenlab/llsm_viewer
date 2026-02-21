import { HISTOGRAM_BINS } from '../histogram';
import type {
  PreprocessedChannelManifest,
  PreprocessedLayerManifestEntry,
  PreprocessedLayerScaleManifestEntry,
  PreprocessedManifest,
  PreprocessedScaleChunkStatsZarrDescriptor,
  PreprocessedTrackSetManifestEntry,
  ZarrArrayDescriptor,
  ZarrArrayShardingPlan
} from './types';
import { PREPROCESSED_DATASET_FORMAT } from './types';
import { VOXEL_RESOLUTION_UNITS, type VoxelResolutionValues } from '../../../types/voxelResolution';
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

function validateChunkStatsDescriptors({
  value,
  path,
  expectedShape
}: {
  value: unknown;
  path: string;
  expectedShape: readonly number[];
}): PreprocessedScaleChunkStatsZarrDescriptor {
  const chunkStats = expectRecord(value, path);
  const min = validateDescriptor({
    value: chunkStats.min,
    path: `${path}.min`,
    expectedRank: 4,
    expectedDataType: 'uint8',
    expectedShape
  });
  const max = validateDescriptor({
    value: chunkStats.max,
    path: `${path}.max`,
    expectedRank: 4,
    expectedDataType: 'uint8',
    expectedShape
  });
  const occupancy = validateDescriptor({
    value: chunkStats.occupancy,
    path: `${path}.occupancy`,
    expectedRank: 4,
    expectedDataType: 'float32',
    expectedShape
  });
  return { min, max, occupancy };
}

function validateScale({
  value,
  path,
  layerVolumeCount,
  layerDimensions,
  isSegmentation
}: {
  value: unknown;
  path: string;
  layerVolumeCount: number;
  layerDimensions: { width: number; height: number; depth: number; channels: number };
  isSegmentation: boolean;
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
  const data = validateDescriptor({
    value: zarr.data,
    path: `${path}.zarr.data`,
    expectedRank: 5,
    expectedDataType: 'uint8',
    expectedShape: expectedDataShape
  });

  const chunkDepth = data.chunkShape[1] ?? 1;
  const chunkHeight = data.chunkShape[2] ?? 1;
  const chunkWidth = data.chunkShape[3] ?? 1;
  const expectedStatsShape = [
    layerVolumeCount,
    Math.ceil(depth / chunkDepth),
    Math.ceil(height / chunkHeight),
    Math.ceil(width / chunkWidth)
  ];
  const chunkStats = validateChunkStatsDescriptors({
    value: zarr.chunkStats,
    path: `${path}.zarr.chunkStats`,
    expectedShape: expectedStatsShape
  });

  const histogram = validateDescriptor({
    value: zarr.histogram,
    path: `${path}.zarr.histogram`,
    expectedRank: 2,
    expectedDataType: 'uint32',
    expectedShape: [layerVolumeCount, HISTOGRAM_BINS]
  });

  const labelsValue = zarr.labels;
  let labels: ZarrArrayDescriptor | undefined;
  if (labelsValue !== undefined) {
    labels = validateDescriptor({
      value: labelsValue,
      path: `${path}.zarr.labels`,
      expectedRank: 4,
      expectedDataType: 'uint32',
      expectedShape: [layerVolumeCount, depth, height, width]
    });
  }

  if (isSegmentation && !labels) {
    throw new Error(
      `Invalid manifest schema at ${path}.zarr.labels: segmentation layers require labels for every scale.`
    );
  }

  return {
    level,
    downsampleFactor,
    width,
    height,
    depth,
    channels,
    zarr: {
      data,
      ...(labels ? { labels } : {}),
      chunkStats,
      histogram
    }
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
  const trackPath = expectString(tracks.path, `${path}.tracks.path`, { nonEmpty: true });
  const format = expectString(tracks.format, `${path}.tracks.format`);
  if (format !== 'csv') {
    throw new Error(`Invalid manifest schema at ${path}.tracks.format: expected "csv", got "${format}".`);
  }
  const columns = expectInteger(tracks.columns, `${path}.tracks.columns`);
  if (columns !== 8) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.columns: expected 8, got ${columns}.`);
  }
  const decimalPlaces = expectInteger(tracks.decimalPlaces, `${path}.tracks.decimalPlaces`);
  if (decimalPlaces !== 3) {
    throw new Error(`Invalid manifest schema at ${path}.tracks.decimalPlaces: expected 3, got ${decimalPlaces}.`);
  }

  return {
    id,
    name,
    fileName,
    boundChannelId,
    tracks: {
      path: trackPath,
      format: 'csv',
      columns: 8,
      decimalPlaces: 3
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
      layerDimensions: { width, height, depth, channels },
      isSegmentation
    });
    if (scale.level <= previousLevel) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[${index}].level: levels must be strictly increasing.`);
    }
    if (index === 0 && scale.level !== 0) {
      throw new Error(`Invalid manifest schema at ${path}.zarr.scales[0].level: first scale must be level 0.`);
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

function validateVoxelResolution(value: unknown, path: string): VoxelResolutionValues | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
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
  if (layersValue.length === 0) {
    throw new Error(`Invalid manifest schema at ${path}.layers: expected at least one layer.`);
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
  validateAnisotropyCorrection(dataset.anisotropyCorrection, 'manifest.dataset.anisotropyCorrection');

  return manifest as PreprocessedManifest;
}
