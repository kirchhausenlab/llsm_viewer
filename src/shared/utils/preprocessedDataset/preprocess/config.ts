import type {
  ZarrArrayDescriptor
} from '../types';

export const DEFAULT_CHUNK_TARGET_BYTES = 256 * 1024;
export const DEFAULT_SHARD_TARGET_BYTES = 16 * 1024 * 1024;
export const DEFAULT_SHARD_MAX_CHUNKS_PER_AXIS = 8;
export const DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES = 4;
export const DEFAULT_PREPROCESS_EXECUTION_MODE = 'auto' as const;
export const DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES = 512 * 1024 * 1024;

export type ResolvedPreprocessExecutionMode = 'in-memory' | 'streaming';

export function resolveWorkerizeNormalizationDownsample(
  options: { workerizeNormalizationDownsample?: boolean } | undefined
): boolean {
  if (options?.workerizeNormalizationDownsample === false) {
    return false;
  }
  return true;
}

export function resolvePreprocessExecutionMode(
  options: { executionMode?: 'auto' | 'in-memory' | 'streaming' } | undefined
): 'auto' | ResolvedPreprocessExecutionMode {
  const requested = options?.executionMode ?? DEFAULT_PREPROCESS_EXECUTION_MODE;
  if (requested === 'auto' || requested === 'in-memory' || requested === 'streaming') {
    return requested;
  }
  return DEFAULT_PREPROCESS_EXECUTION_MODE;
}

export function resolvePreprocessStreamingThresholdBytes(
  options: { streamingThresholdBytes?: number } | undefined
): number {
  const configured = options?.streamingThresholdBytes;
  if (!Number.isFinite(configured) || (configured ?? 0) <= 0) {
    return DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES;
  }
  return Math.max(1, Math.floor(configured ?? DEFAULT_PREPROCESS_STREAMING_THRESHOLD_BYTES));
}

export function createZarrScaleDataArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/data`;
}

export function createZarrScaleSkipHierarchyArrayPath(
  channelId: string,
  layerKey: string,
  scaleLevel: number,
  hierarchyLevel: number,
  stat: 'min' | 'max' | 'occupancy'
): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/skip-hierarchy/levels/${hierarchyLevel}/${stat}`;
}

export function createZarrScaleHistogramArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/histogram`;
}

export function createZarrScaleSubcellArrayPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/subcell`;
}

export function createZarrScalePlaybackAtlasIndicesArrayPath(
  channelId: string,
  layerKey: string,
  scaleLevel: number
): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/playback-atlas/indices`;
}

export function createZarrScalePlaybackAtlasDataPath(channelId: string, layerKey: string, scaleLevel: number): string {
  return `channels/${channelId}/${layerKey}/scales/${scaleLevel}/playback-atlas/data`;
}

export function createZarrBackgroundMaskArrayPath(scaleLevel: number): string {
  return `background-mask/scales/${scaleLevel}/data`;
}

export function computeLeafGridShapeForScaleDescriptor(dataDescriptor: ZarrArrayDescriptor): [number, number, number] {
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

export function buildSkipHierarchyGridShapes(leafGridShape: [number, number, number]): [number, number, number][] {
  const shapes: [number, number, number][] = [leafGridShape];
  while (true) {
    const previous = shapes[shapes.length - 1];
    if (!previous) {
      break;
    }
    if (previous[0] === 1 && previous[1] === 1 && previous[2] === 1) {
      break;
    }
    shapes.push([
      Math.max(1, Math.ceil(previous[0] / 2)),
      Math.max(1, Math.ceil(previous[1] / 2)),
      Math.max(1, Math.ceil(previous[2] / 2))
    ]);
  }
  return shapes;
}

export function normalizePositiveInteger(value: number | undefined, fallback: number, label: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  if (normalized <= 0) {
    throw new Error(`${label} must be a positive integer; received ${String(value)}.`);
  }
  return normalized;
}
