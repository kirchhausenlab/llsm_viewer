import type { VoxelResolutionValues, VoxelResolutionUnit } from '../types/voxelResolution';

export type VolumeArrayPath = `/${number}`;
export type VolumeChunkShape = [number, number, number, number]; // [c, z, y, x]

export type AxisLabel = 'c' | 'z' | 'y' | 'x';
export const DEFAULT_VOLUME_AXES: readonly AxisLabel[] = ['c', 'z', 'y', 'x'] as const;

export type ChannelMetadata = { label: string };

export type VolumeStatistics = { min: number; max: number };

export type ZarrLayoutRootAttributes = {
  layout: 'llsm-viewer.zarr';
  version: 1;
  axes?: AxisLabel[];
  voxelSize?: { unit: VoxelResolutionUnit; values: [number, number, number] };
  channels?: ChannelMetadata[];
  stats?: Record<string, VolumeStatistics>;
};

export type NormalizedLayoutMetadata = {
  axes: AxisLabel[];
  voxelResolution: VoxelResolutionValues | null;
  channelLabels: string[];
  stats: Record<string, VolumeStatistics>;
};

export type LayoutValidationResult = {
  errors: string[];
  warnings: string[];
};

export const DEFAULT_CHUNK_TARGET_BYTES = 2 * 1024 * 1024; // 2 MiB
export const DEFAULT_SHARD_TARGET_BYTES = 64 * 1024 * 1024; // 64 MiB
const MAX_SHARD_MULTIPLIER = 8;

function clampPositiveInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;
  return Math.floor(value);
}

function chunkByteSize(shape: VolumeChunkShape, bytesPerValue: number): number {
  return shape.reduce((product, value) => product * value, 1) * bytesPerValue;
}

export function getVolumeArrayPath(index: number): VolumeArrayPath {
  const normalized = clampPositiveInteger(index, 0);
  return `/${normalized}` as VolumeArrayPath;
}

export function computeChunkShape(
  dimensions: { width: number; height: number; depth: number; channels: number },
  options: { bytesPerValue?: number; targetBytes?: number } = {}
): VolumeChunkShape {
  const bytesPerValue = options.bytesPerValue ?? 2;
  const targetBytes = options.targetBytes ?? DEFAULT_CHUNK_TARGET_BYTES;

  const shape: VolumeChunkShape = [
    clampPositiveInteger(Math.min(dimensions.channels, 4), 1),
    clampPositiveInteger(Math.min(dimensions.depth, 16), 1),
    clampPositiveInteger(Math.min(dimensions.height, 256), 1),
    clampPositiveInteger(Math.min(dimensions.width, 256), 1)
  ];

  const shrinkOrder: (keyof VolumeChunkShape)[] = [3, 2, 1, 0];

  while (chunkByteSize(shape, bytesPerValue) > targetBytes) {
    const dimensionToShrink = shrinkOrder.find((dimension) => shape[dimension] > 1);
    if (dimensionToShrink === undefined) {
      break;
    }
    shape[dimensionToShrink] = Math.max(1, Math.floor(shape[dimensionToShrink] / 2)) as number;
  }

  return shape;
}

export function computeShardShape(
  chunkShape: VolumeChunkShape,
  options: { bytesPerValue?: number; targetBytes?: number } = {}
): VolumeChunkShape {
  const bytesPerValue = options.bytesPerValue ?? 2;
  const targetBytes = options.targetBytes ?? DEFAULT_SHARD_TARGET_BYTES;
  const shard: VolumeChunkShape = [...chunkShape];
  const maxShape = chunkShape.map((value) => value * MAX_SHARD_MULTIPLIER) as VolumeChunkShape;

  const expandOrder: (keyof VolumeChunkShape)[] = [1, 2, 3, 0];

  let size = chunkByteSize(shard, bytesPerValue);
  for (const dimension of expandOrder) {
    while (size < targetBytes && shard[dimension] < maxShape[dimension]) {
      shard[dimension] = Math.min(maxShape[dimension], shard[dimension] * 2) as number;
      size = chunkByteSize(shard, bytesPerValue);
    }
  }

  return shard;
}

function parseAxes(raw: unknown): AxisLabel[] {
  if (!Array.isArray(raw)) {
    return [...DEFAULT_VOLUME_AXES];
  }
  const axes = raw.filter((axis): axis is AxisLabel => axis === 'c' || axis === 'z' || axis === 'y' || axis === 'x');
  if (axes.length !== DEFAULT_VOLUME_AXES.length) {
    return [...DEFAULT_VOLUME_AXES];
  }
  return axes;
}

function isVoxelArray(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function parseVoxelResolution(raw: unknown): VoxelResolutionValues | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const attributes = raw as Partial<ZarrLayoutRootAttributes & { voxel_size?: [number, number, number]; voxel_size_unit?: VoxelResolutionUnit }>;
  if (attributes.voxelSize && isVoxelArray(attributes.voxelSize.values) && attributes.voxelSize.unit) {
    const [x, y, z] = attributes.voxelSize.values;
    return { x, y, z, unit: attributes.voxelSize.unit, correctAnisotropy: false };
  }

  if (isVoxelArray(attributes.voxel_size) && attributes.voxel_size_unit) {
    const [x, y, z] = attributes.voxel_size;
    return { x, y, z, unit: attributes.voxel_size_unit, correctAnisotropy: false };
  }

  return null;
}

function normalizeChannelLabels(
  channels: unknown,
  expectedCount?: number
): string[] {
  if (Array.isArray(channels)) {
    if (channels.every((entry) => typeof entry === 'string')) {
      return channels as string[];
    }
    const metadataList = channels.filter((entry): entry is ChannelMetadata =>
      entry && typeof entry === 'object' && typeof (entry as ChannelMetadata).label === 'string'
    );
    if (metadataList.length > 0) {
      return metadataList.map((entry) => entry.label);
    }
  }

  const total = expectedCount ?? 0;
  return Array.from({ length: total }, (_, index) => `Channel ${index + 1}`);
}

function normalizeStats(stats: unknown, expectedCount?: number): Record<string, VolumeStatistics> {
  if (stats && typeof stats === 'object') {
    if (!Array.isArray(stats)) {
      const entries = Object.entries(stats as Record<string, unknown>);
      const normalized: Record<string, VolumeStatistics> = {};
      for (const [path, value] of entries) {
        if (value && typeof value === 'object' && typeof (value as VolumeStatistics).min === 'number' && typeof (value as VolumeStatistics).max === 'number') {
          normalized[path] = { min: (value as VolumeStatistics).min, max: (value as VolumeStatistics).max };
        }
      }
      if (Object.keys(normalized).length > 0) {
        return normalized;
      }
    } else {
      const normalized: Record<string, VolumeStatistics> = {};
      stats.forEach((value, index) => {
        if (value && typeof value === 'object' && typeof (value as VolumeStatistics).min === 'number' && typeof (value as VolumeStatistics).max === 'number') {
          normalized[getVolumeArrayPath(index)] = { min: (value as VolumeStatistics).min, max: (value as VolumeStatistics).max };
        }
      });
      if (Object.keys(normalized).length > 0) {
        return normalized;
      }
    }
  }

  const normalized: Record<string, VolumeStatistics> = {};
  const total = expectedCount ?? 0;
  for (let index = 0; index < total; index += 1) {
    normalized[getVolumeArrayPath(index)] = { min: 0, max: 1 };
  }
  return normalized;
}

export function createRootAttributes(options: {
  axes?: AxisLabel[];
  voxelResolution?: VoxelResolutionValues | null;
  channelLabels?: string[];
  stats?: Record<string, VolumeStatistics> | VolumeStatistics[];
}): ZarrLayoutRootAttributes {
  const { axes = [...DEFAULT_VOLUME_AXES], voxelResolution = null, channelLabels, stats } = options;
  const normalizedStats = normalizeStats(stats, channelLabels?.length);

  return {
    layout: 'llsm-viewer.zarr',
    version: 1,
    axes: parseAxes(axes),
    voxelSize: voxelResolution
      ? { unit: voxelResolution.unit, values: [voxelResolution.x, voxelResolution.y, voxelResolution.z] }
      : undefined,
    channels: channelLabels?.map((label) => ({ label })),
    stats: normalizedStats
  };
}

export function readRootAttributes(
  raw: unknown,
  options: { expectedVolumes?: number; fallbackVoxelResolution?: VoxelResolutionValues | null } = {}
): NormalizedLayoutMetadata {
  const { expectedVolumes, fallbackVoxelResolution = null } = options;
  const axes = parseAxes((raw as ZarrLayoutRootAttributes | undefined)?.axes);
  const voxelResolution = parseVoxelResolution(raw) ?? fallbackVoxelResolution;
  const channelLabels = normalizeChannelLabels((raw as ZarrLayoutRootAttributes | undefined)?.channels, expectedVolumes);
  const stats = normalizeStats((raw as ZarrLayoutRootAttributes | undefined)?.stats, expectedVolumes);

  return { axes, voxelResolution, channelLabels, stats };
}

export function validateRootAttributes(raw: unknown): LayoutValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!raw || typeof raw !== 'object') {
    errors.push('Root attributes are missing or unreadable.');
    return { errors, warnings };
  }

  const attributes = raw as Partial<ZarrLayoutRootAttributes>;

  if (attributes.version !== undefined && attributes.version !== 1) {
    warnings.push(`Unexpected layout version: ${attributes.version}. Proceeding with compatibility defaults.`);
  }

  if (attributes.axes && parseAxes(attributes.axes).length !== DEFAULT_VOLUME_AXES.length) {
    warnings.push('Axes definition is invalid. Falling back to c-zyx ordering.');
  }

  if (!parseVoxelResolution(attributes)) {
    warnings.push('Voxel size metadata missing or invalid; viewer will rely on provided launch settings.');
  }

  const stats = normalizeStats(attributes.stats);
  if (Object.keys(stats).length === 0) {
    warnings.push('No per-volume statistics found; defaults will be applied.');
  }

  return { errors, warnings };
}
