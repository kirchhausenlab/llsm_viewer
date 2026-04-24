import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import { isIntensityVolume, type NormalizedVolume } from '../../../core/volumeProcessing';
import type { PlaybackIndexWindow } from '../../../shared/utils';
import { computeLoopedNextTimeIndex } from '../../../shared/utils';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import type { PlaybackWarmupFrameState } from './types';

export const DIAGNOSTICS_POLL_INTERVAL_MS = 500;
export const LOD_POLICY_WINDOW_MS = 60_000;
export const LOD_POLICY_THRASH_WINDOW_MS = 4_000;
export const LOD_PROMOTE_COOLDOWN_MS = 1_200;
export const LOD_MIN_PROJECTED_PIXELS_PER_VOXEL = 0.75;
export const LOD_THRASH_AUTO_DISABLE_PER_MINUTE = 60;
export const MAX_BRICK_ATLAS_DEPTH_HINT = 2048;
export const MAX_BRICK_ATLAS_BYTES_HINT = 384 * 1024 * 1024;
export const MAX_VOLUME_BYTES_HINT = 384 * 1024 * 1024;
export const MAX_ADAPTIVE_DOWNSAMPLE_MULTIPLIER = 8;
export const MAX_ADAPTIVE_DEMOTION_STEPS = 4;
export const CAMERA_PROJECTED_PIXELS_REFERENCE_DISTANCE = 1.2;
export const CAMERA_PROJECTED_PIXELS_AT_REFERENCE = 1.4;
export const HTTP_INITIAL_LAUNCH_MAX_DATA_CHUNKS = 32;

export type LoadedLayerResources = readonly [
  layerKey: string,
  volume: NormalizedVolume | null,
  pageTable: VolumeBrickPageTable | null,
  brickAtlas: VolumeBrickAtlas | null
];

export function nowMs(): number {
  return Date.now();
}

export function isAllocationLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes('array buffer allocation failed') ||
    message.includes('allocation failed') ||
    message.includes('invalid typed array length') ||
    message.includes('out of memory') ||
    message.includes('cannot allocate')
  );
}

export function getTextureChannelCountForSourceChannels(sourceChannels: number): number {
  if (sourceChannels <= 1) {
    return 1;
  }
  if (sourceChannels === 2) {
    return 2;
  }
  return 4;
}

export function selectDeterministicLayerKey(layers: ReadonlyArray<{ key: string }>): string | null {
  if (layers.length === 0) {
    return null;
  }
  return [...layers].sort((left, right) => left.key.localeCompare(right.key))[0]?.key ?? null;
}

export function collectActiveLayerKeys(
  loadedChannelIds: string[],
  channelLayersMap: Map<string, LoadedDatasetLayer[]>
): string[] {
  const keys: string[] = [];
  for (const channelId of loadedChannelIds) {
    const channelLayers = channelLayersMap.get(channelId) ?? [];
    if (channelLayers.length === 0) {
      continue;
    }
    const resolvedLayerKey = selectDeterministicLayerKey(channelLayers);
    if (resolvedLayerKey) {
      keys.push(resolvedLayerKey);
    }
  }
  return keys;
}

export function collectVisibleLayerKeys({
  loadedChannelIds,
  channelLayersMap,
  layerChannelMap,
  channelVisibility
}: {
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  layerChannelMap: Map<string, string>;
  channelVisibility: Record<string, boolean>;
}): string[] {
  return collectActiveLayerKeys(loadedChannelIds, channelLayersMap).filter((layerKey) => {
    const channelId = layerChannelMap.get(layerKey);
    if (!channelId) {
      return true;
    }
    return channelVisibility[channelId] ?? true;
  });
}

export function normalizeChunkDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : null;
}

export function estimateDataChunkCount(scale: PreprocessedLayerScaleManifestEntry | null | undefined): number | null {
  const descriptor = scale?.zarr?.data;
  if (!descriptor || !Array.isArray(descriptor.shape) || !Array.isArray(descriptor.chunkShape)) {
    return null;
  }
  if (descriptor.shape.length !== descriptor.chunkShape.length || descriptor.shape.length <= 1) {
    return null;
  }

  let chunkCount = 1;
  for (let axis = 1; axis < descriptor.shape.length; axis += 1) {
    const shapeDim = normalizeChunkDimension(descriptor.shape[axis]);
    const chunkDim = normalizeChunkDimension(descriptor.chunkShape[axis]);
    if (shapeDim === null || chunkDim === null) {
      return null;
    }
    chunkCount *= Math.ceil(shapeDim / chunkDim);
  }

  return chunkCount;
}

export function collectActiveScaleLevels(resources: readonly LoadedLayerResources[]): number[] {
  const levels = new Set<number>();
  for (const [, volume, pageTable, brickAtlas] of resources) {
    const scaleLevel =
      brickAtlas?.scaleLevel ??
      volume?.scaleLevel ??
      pageTable?.scaleLevel;
    if (typeof scaleLevel !== 'number' || !Number.isFinite(scaleLevel)) {
      continue;
    }
    levels.add(Math.max(0, Math.floor(scaleLevel)));
  }
  return [...levels].sort((left, right) => left - right);
}

export function collectPlaybackWarmupTimeIndices(
  currentIndex: number,
  totalTimepoints: number,
  playbackWindow: PlaybackIndexWindow | null,
  slotCount: number
): number[] {
  if (totalTimepoints <= 1 || slotCount <= 0) {
    return [];
  }
  const indices: number[] = [];
  const seen = new Set<number>([currentIndex]);
  let candidate = currentIndex;
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    candidate = computeLoopedNextTimeIndex(candidate, totalTimepoints, playbackWindow);
    if (seen.has(candidate)) {
      break;
    }
    seen.add(candidate);
    indices.push(candidate);
  }
  return indices;
}

export function sortWarmupFramesByTargetOrder(
  frames: PlaybackWarmupFrameState[],
  targetTimeIndices: number[]
): PlaybackWarmupFrameState[] {
  const orderByTimeIndex = new Map<number, number>();
  targetTimeIndices.forEach((timeIndex, index) => {
    orderByTimeIndex.set(timeIndex, index);
  });
  return [...frames].sort((left, right) => {
    const leftOrder = orderByTimeIndex.get(left.timeIndex) ?? Number.POSITIVE_INFINITY;
    const rightOrder = orderByTimeIndex.get(right.timeIndex) ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.slotIndex - right.slotIndex;
  });
}

export function arePlaybackWarmupFramesEquivalent(
  left: PlaybackWarmupFrameState[],
  right: PlaybackWarmupFrameState[]
): boolean {
  return (
    left.length === right.length &&
    left.every((frame, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        frame.slotIndex === other.slotIndex &&
        frame.timeIndex === other.timeIndex &&
        frame.scaleSignature === other.scaleSignature &&
        frame.layerVolumes === other.layerVolumes &&
        frame.layerPageTables === other.layerPageTables &&
        frame.layerBrickAtlases === other.layerBrickAtlases &&
        frame.backgroundMasksByScale === other.backgroundMasksByScale
      );
    })
  );
}

export function applyPlaybackScaleOverride({
  levels,
  resolvedScaleLevel,
  isPlaying
}: {
  levels: number[];
  resolvedScaleLevel: number;
  isPlaying: boolean;
}): number {
  if (!isPlaying || resolvedScaleLevel !== 0) {
    return resolvedScaleLevel;
  }
  if (levels.includes(1)) {
    return 1;
  }
  return levels.find((level) => level > 0) ?? 0;
}

export function applyScaleSelectionModeOverrides({
  levels,
  resolvedScaleLevel,
  isPlaying,
  isPerformanceMode
}: {
  levels: number[];
  resolvedScaleLevel: number;
  isPlaying: boolean;
  isPerformanceMode: boolean;
}): number {
  const playbackResolvedScaleLevel = applyPlaybackScaleOverride({
    levels,
    resolvedScaleLevel,
    isPlaying
  });
  if (!isPerformanceMode) {
    return playbackResolvedScaleLevel;
  }
  if (playbackResolvedScaleLevel <= 0) {
    return levels.find((level) => level > 0) ?? levels[levels.length - 1] ?? playbackResolvedScaleLevel;
  }
  const resolvedIndex = levels.findIndex((level) => level === playbackResolvedScaleLevel);
  if (resolvedIndex >= 0) {
    return levels[Math.min(levels.length - 1, resolvedIndex + 1)] ?? playbackResolvedScaleLevel;
  }
  return levels.find((level) => level > playbackResolvedScaleLevel) ?? levels[levels.length - 1] ?? playbackResolvedScaleLevel;
}

export function downsampleMagnitude(scale: PreprocessedLayerScaleManifestEntry | null): number {
  if (!scale) {
    return 1;
  }
  const factors = (scale as { downsampleFactor?: [number, number, number] }).downsampleFactor;
  if (!Array.isArray(factors) || factors.length < 3) {
    return 1;
  }
  const [depth, height, width] = factors;
  const values = [depth, height, width].map((value) =>
    Number.isFinite(value) && value > 0 ? value : 1
  );
  return Math.cbrt(values[0] * values[1] * values[2]);
}

export function isPromotionReadyForResource({
  volume,
  pageTable,
  brickAtlas,
  cachePressure
}: {
  volume: NormalizedVolume | null;
  pageTable: VolumeBrickPageTable | null;
  brickAtlas: VolumeBrickAtlas | null;
  cachePressure: { volume: number; chunk: number } | null;
}): boolean {
  const pressure = cachePressure
    ? Math.max(0, Math.min(1, (cachePressure.volume + cachePressure.chunk) / 2))
    : 0;
  if (pressure >= 0.98) {
    return false;
  }
  if (brickAtlas) {
    return brickAtlas.enabled && brickAtlas.pageTable.occupiedBrickCount > 0;
  }
  if (volume) {
    return isIntensityVolume(volume) ? volume.normalized.byteLength > 0 : volume.labels.byteLength > 0;
  }
  return pageTable ? pageTable.occupiedBrickCount > 0 : false;
}
