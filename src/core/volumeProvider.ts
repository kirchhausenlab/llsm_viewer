import type { NormalizedVolume } from './volumeProcessing';
import type {
  PreprocessedLayerManifestEntry,
  PreprocessedManifest,
  ZarrArrayDescriptor
} from '../shared/utils/preprocessedDataset/types';
import type { PreprocessedStorage } from '../shared/storage/preprocessedStorage';
import { createZarrChunkKeyFromCoords } from '../shared/utils/preprocessedDataset/chunkKey';
import {
  decodeShardEntry,
  getShardChunkLocation,
  isShardedArrayDescriptor
} from '../shared/utils/preprocessedDataset/sharding';
import { getBytesPerValue } from '../types/volume';
import { ensureArrayBuffer } from '../shared/utils/buffer';
import { decodeUint32ArrayLE, HISTOGRAM_BINS } from '../shared/utils/histogram';

export type VolumeProviderOptions = {
  manifest: PreprocessedManifest;
  storage: PreprocessedStorage;
  maxCachedVolumes: number;
  maxCachedChunkBytes: number;
  maxConcurrentChunkReads: number;
  maxConcurrentPrefetchLoads: number;
};

export type VolumePrefetchPolicy = 'missing-only' | 'force';

export type VolumePrefetchReason = 'manual' | 'playback' | 'warmup' | 'interactive';

export type VolumePrefetchOptions = {
  policy?: VolumePrefetchPolicy;
  reason?: VolumePrefetchReason;
  signal?: AbortSignal | null;
  maxConcurrentLayerLoads?: number;
  scaleLevels?: number[];
};

export type VolumeProviderStats = {
  getVolumeCalls: number;
  prefetchCalls: number;
  prefetchSkippedCached: number;
  prefetchSkippedInFlight: number;
  prefetchLoadsStarted: number;
  prefetchLoadsCompleted: number;
  prefetchLoadsFailed: number;
  prefetchLoadsCancelled: number;
  prefetchRequestsAborted: number;
  prefetchActiveRequests: number;
  cacheHits: number;
  cacheHitInFlight: number;
  cacheMisses: number;
  loadsStarted: number;
  loadsCompleted: number;
  loadsFailed: number;
  bytesRead: number;
  dataBytesRead: number;
  labelBytesRead: number;
  totalLoadMs: number;
  totalDataReadMs: number;
  totalLabelReadMs: number;
  lastLoadMs: number | null;
  lastDataReadMs: number | null;
  lastLabelReadMs: number | null;
  maxCachedVolumes: number;
  cacheSize: number;
  inFlightCount: number;
  chunkCacheHits: number;
  chunkCacheHitInFlight: number;
  chunkCacheMisses: number;
  chunkReadsStarted: number;
  chunkReadsCompleted: number;
  chunkReadsFailed: number;
  chunkBytesRead: number;
  chunkCacheEvictions: number;
  maxCachedChunkBytes: number;
  chunkCacheBytes: number;
  chunkCacheSize: number;
  chunkInFlightCount: number;
};

export type VolumeProviderDiagnostics = {
  capturedAt: string;
  residency: {
    cachedVolumes: number;
    inFlightVolumes: number;
    cachedChunks: number;
    inFlightChunks: number;
    chunkBytes: number;
  };
  cachePressure: {
    volume: number;
    chunk: number;
  };
  missRates: {
    volume: number;
    chunk: number;
  };
  activePrefetchRequests: Array<{
    id: number;
    timepoint: number;
    reason: VolumePrefetchReason;
    layerCount: number;
    ageMs: number;
    cancelled: boolean;
    scaleLevels: number[];
  }>;
  streaming: {
    scaleRequestCounts: Record<string, number>;
    cachedPageTables: number;
    cachedAtlases: number;
  };
  stats: VolumeProviderStats;
};

export type VolumeBrickPageTable = {
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  gridShape: [number, number, number];
  chunkShape: [number, number, number];
  volumeShape: [number, number, number];
  brickAtlasIndices: Int32Array;
  chunkMin: Uint8Array;
  chunkMax: Uint8Array;
  chunkOccupancy: Float32Array;
  occupiedBrickCount: number;
};

export type VolumeBrickAtlasTextureFormat = 'red' | 'rg' | 'rgba';

export type VolumeBrickAtlas = {
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  pageTable: VolumeBrickPageTable;
  histogram?: Uint32Array;
  width: number;
  height: number;
  depth: number;
  textureFormat: VolumeBrickAtlasTextureFormat;
  sourceChannels: number;
  data: Uint8Array;
  enabled: boolean;
};

export type VolumeProvider = {
  getVolume(
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<NormalizedVolume>;
  getBrickPageTable?(
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<VolumeBrickPageTable>;
  getBrickAtlas?(
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<VolumeBrickAtlas>;
  prefetchBrickAtlases?(
    layerKeys: string[],
    timepoint: number,
    options?: VolumePrefetchOptions
  ): Promise<void>;
  prefetch(layerKeys: string[], timepoint: number, options?: VolumePrefetchOptions): Promise<void>;
  hasVolume(layerKey: string, timepoint: number, options?: { scaleLevel?: number }): boolean;
  hasBrickAtlas?(layerKey: string, timepoint: number, options?: { scaleLevel?: number }): boolean;
  clear(): void;
  setMaxCachedVolumes(maxCachedVolumes: number): void;
  getStats(): VolumeProviderStats;
  getDiagnostics(): VolumeProviderDiagnostics;
  resetStats(): void;
};

type LayerIndexEntry = {
  layerKey: string;
  channelId: string;
  isSegmentation: boolean;
  layer: PreprocessedLayerManifestEntry;
};

type CachedVolumeEntry = {
  key: string;
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  volume: NormalizedVolume | null;
  inFlight: Promise<NormalizedVolume> | null;
};

type CachedChunkEntry = {
  key: string;
  chunkPath: string;
  bytes: Uint8Array | null;
  byteLength: number;
  inFlight: Promise<Uint8Array> | null;
};

type CachedBrickPageTableEntry = {
  key: string;
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  pageTable: VolumeBrickPageTable | null;
  inFlight: Promise<VolumeBrickPageTable> | null;
};

type CachedBrickAtlasEntry = {
  key: string;
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  atlas: VolumeBrickAtlas | null;
  inFlight: Promise<VolumeBrickAtlas> | null;
};

type ChunkReadPlan = {
  chunkCoords: number[];
  chunkPath: string;
  chunkStart: number[];
  chunkShape: number[];
  priority: number;
};

type PrefetchRequestState = {
  id: number;
  startedAtMs: number;
  timepoint: number;
  layerKeys: string[];
  reason: VolumePrefetchReason;
  cancelled: boolean;
  scaleLevels: number[];
};

export const DEFAULT_MAX_CACHED_VOLUMES = 12;
export const DEFAULT_MAX_CACHED_CHUNK_BYTES = 128 * 1024 * 1024;
export const DEFAULT_MAX_CONCURRENT_CHUNK_READS = 6;
export const DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS = 2;

function createCacheKey(layerKey: string, timepoint: number, scaleLevel: number): string {
  return `${layerKey}:${timepoint}:s${scaleLevel}`;
}

function createChunkCacheKey(chunkPath: string): string {
  return chunkPath;
}

function createBrickPageTableCacheKey(layerKey: string, timepoint: number, scaleLevel: number): string {
  return `${layerKey}:${timepoint}:s${scaleLevel}`;
}

function createBrickAtlasCacheKey(layerKey: string, timepoint: number, scaleLevel: number): string {
  return `${layerKey}:${timepoint}:s${scaleLevel}`;
}

function isValidTimepoint(timepoint: number): boolean {
  return Number.isFinite(timepoint) && Math.floor(timepoint) === timepoint && timepoint >= 0;
}

function isAbortLikeError(error: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

function createAbortError(reason: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') {
    return reason;
  }
  if (typeof DOMException !== 'undefined') {
    try {
      return new DOMException(
        typeof reason === 'string' && reason.trim().length > 0 ? reason : 'The operation was aborted.',
        'AbortError'
      );
    } catch {
      // Fall through to Error for environments without DOMException constructors.
    }
  }
  const error = new Error(typeof reason === 'string' && reason.trim().length > 0 ? reason : 'The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (!signal?.aborted) {
    return;
  }
  throw createAbortError(signal.reason);
}

function awaitWithAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError(signal.reason));
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) {
        return;
      }
      settled = true;
      reject(createAbortError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });

    void promise.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function normalizeScaleLevel(scaleLevel: number | undefined): number {
  if (!Number.isFinite(scaleLevel)) {
    return 0;
  }
  return Math.max(0, Math.floor(scaleLevel as number));
}

function normalizeScaleLevelSet(
  requested: number[] | undefined
): number[] {
  if (!requested || requested.length === 0) {
    return [];
  }
  const levels = Array.from(
    new Set(requested.map((value) => normalizeScaleLevel(value)))
  ).sort((left, right) => left - right);
  return levels;
}

function computeElementCount(shape: number[], context: string): number {
  let total = 1;
  for (const dim of shape) {
    if (!Number.isFinite(dim) || dim < 0 || Math.floor(dim) !== dim) {
      throw new Error(`Invalid ${context} dimension: ${dim}`);
    }
    total *= dim;
  }
  return total;
}

function computeRowMajorStrides(shape: number[]): number[] {
  const strides = new Array<number>(shape.length);
  let stride = 1;
  for (let index = shape.length - 1; index >= 0; index -= 1) {
    strides[index] = stride;
    stride *= shape[index] ?? 0;
  }
  return strides;
}

function getBrickAtlasTextureFormat(sourceChannels: number): VolumeBrickAtlasTextureFormat {
  if (sourceChannels <= 1) {
    return 'red';
  }
  if (sourceChannels === 2) {
    return 'rg';
  }
  return 'rgba';
}

function getBrickAtlasTextureChannels(textureFormat: VolumeBrickAtlasTextureFormat): number {
  if (textureFormat === 'red') {
    return 1;
  }
  if (textureFormat === 'rg') {
    return 2;
  }
  return 4;
}

function mapSourceChannelToTextureChannel(
  sourceChannel: number,
  sourceChannelCount: number,
  textureFormat: VolumeBrickAtlasTextureFormat
): number | null {
  if (textureFormat === 'red') {
    return sourceChannel === 0 ? 0 : null;
  }
  if (textureFormat === 'rg') {
    return sourceChannel >= 0 && sourceChannel <= 1 ? sourceChannel : null;
  }
  if (sourceChannel < 0 || sourceChannel > 3) {
    return null;
  }
  if (sourceChannelCount === 3 && sourceChannel === 3) {
    return null;
  }
  return sourceChannel;
}

function copyChunkSliceToBuffer({
  destination,
  destinationShape,
  destinationStrides,
  chunkBytes,
  chunkShape,
  chunkStart,
  bytesPerValue,
  chunkPath
}: {
  destination: Uint8Array;
  destinationShape: number[];
  destinationStrides: number[];
  chunkBytes: Uint8Array;
  chunkShape: number[];
  chunkStart: number[];
  bytesPerValue: number;
  chunkPath: string;
}): void {
  if (destinationShape.length !== chunkShape.length || chunkShape.length !== chunkStart.length) {
    throw new Error(`Chunk rank mismatch while assembling ${chunkPath}.`);
  }

  const expectedChunkBytes = computeElementCount(chunkShape, `chunk shape for ${chunkPath}`) * bytesPerValue;
  if (chunkBytes.byteLength !== expectedChunkBytes) {
    throw new Error(
      `Chunk byte length mismatch for ${chunkPath} (expected ${expectedChunkBytes}, got ${chunkBytes.byteLength}).`
    );
  }

  for (let axis = 0; axis < chunkShape.length; axis += 1) {
    const start = chunkStart[axis] ?? 0;
    const length = chunkShape[axis] ?? 0;
    const destinationLength = destinationShape[axis] ?? 0;
    if (start < 0 || start + length > destinationLength) {
      throw new Error(`Chunk bounds exceed destination volume for ${chunkPath} on axis ${axis}.`);
    }
  }

  if (chunkShape.length === 0) {
    destination.set(chunkBytes, 0);
    return;
  }

  const sourceStrides = computeRowMajorStrides(chunkShape);
  const lastAxis = chunkShape.length - 1;

  const copyAxis = (axis: number, destinationBase: number, sourceBase: number): void => {
    if (axis === lastAxis) {
      const rowValues = chunkShape[lastAxis] ?? 0;
      const sourceByteStart = sourceBase * bytesPerValue;
      const sourceByteEnd = sourceByteStart + rowValues * bytesPerValue;
      const destinationByteStart =
        (destinationBase + (chunkStart[lastAxis] ?? 0) * (destinationStrides[lastAxis] ?? 0)) * bytesPerValue;
      destination.set(chunkBytes.subarray(sourceByteStart, sourceByteEnd), destinationByteStart);
      return;
    }

    const destinationStride = destinationStrides[axis] ?? 0;
    const sourceStride = sourceStrides[axis] ?? 0;
    const offset = chunkStart[axis] ?? 0;
    const length = chunkShape[axis] ?? 0;
    for (let index = 0; index < length; index += 1) {
      copyAxis(
        axis + 1,
        destinationBase + (offset + index) * destinationStride,
        sourceBase + index * sourceStride
      );
    }
  };

  copyAxis(0, 0, 0);
}

async function readTimepointChunkedArray({
  descriptor,
  timepoint,
  expectedNonTimeShape,
  maxConcurrentChunkReads,
  readChunk,
  signal
}: {
  descriptor: ZarrArrayDescriptor;
  timepoint: number;
  expectedNonTimeShape: number[];
  maxConcurrentChunkReads: number;
  readChunk: (
    chunkCoords: number[],
    options?: { signal?: AbortSignal | null }
  ) => Promise<{ bytes: Uint8Array; bytesRead: number }>;
  signal?: AbortSignal | null;
}): Promise<{ bytes: Uint8Array; bytesRead: number }> {
  throwIfAborted(signal);
  if (descriptor.shape.length === 0) {
    throw new Error(`Invalid Zarr descriptor at ${descriptor.path}: expected rank >= 1.`);
  }
  if (descriptor.shape.length !== descriptor.chunkShape.length) {
    throw new Error(`Invalid Zarr descriptor at ${descriptor.path}: shape/chunk rank mismatch.`);
  }
  if (timepoint < 0 || timepoint >= (descriptor.shape[0] ?? 0)) {
    throw new Error(`Timepoint ${timepoint} is out of bounds for ${descriptor.path}.`);
  }

  const nonTimeShape = descriptor.shape.slice(1);
  if (nonTimeShape.length !== expectedNonTimeShape.length) {
    throw new Error(
      `Unexpected rank for ${descriptor.path} (expected ${expectedNonTimeShape.length + 1}, got ${descriptor.shape.length}).`
    );
  }
  for (let axis = 0; axis < nonTimeShape.length; axis += 1) {
    if ((nonTimeShape[axis] ?? -1) !== (expectedNonTimeShape[axis] ?? -1)) {
      throw new Error(`Unexpected non-time shape for ${descriptor.path}.`);
    }
  }

  const bytesPerValue = getBytesPerValue(descriptor.dataType);
  const outputByteLength =
    computeElementCount(expectedNonTimeShape, `output shape for ${descriptor.path}`) * bytesPerValue;
  const outputBytes = new Uint8Array(outputByteLength);
  const destinationStrides = computeRowMajorStrides(expectedNonTimeShape);

  const timeChunkLength = descriptor.chunkShape[0] ?? 0;
  if (!Number.isFinite(timeChunkLength) || timeChunkLength <= 0 || Math.floor(timeChunkLength) !== timeChunkLength) {
    throw new Error(`Invalid time chunk size for ${descriptor.path}: ${timeChunkLength}`);
  }

  const timeChunkCoord = Math.floor(timepoint / timeChunkLength);
  const timeChunkStart = timeChunkCoord * timeChunkLength;
  const timeChunkExtent = Math.min(timeChunkLength, (descriptor.shape[0] ?? 0) - timeChunkStart);
  const timeOffsetInChunk = timepoint - timeChunkStart;

  let bytesRead = 0;
  const nonTimeRank = expectedNonTimeShape.length;
  const chunkCounts = descriptor.shape.map((shapeDim, axis) => {
    const chunkDim = descriptor.chunkShape[axis] ?? 0;
    if (!Number.isFinite(shapeDim) || shapeDim < 0 || Math.floor(shapeDim) !== shapeDim) {
      throw new Error(`Invalid shape dimension for ${descriptor.path}: ${shapeDim}`);
    }
    if (!Number.isFinite(chunkDim) || chunkDim <= 0 || Math.floor(chunkDim) !== chunkDim) {
      throw new Error(`Invalid chunk dimension for ${descriptor.path}: ${chunkDim}`);
    }
    return Math.ceil(shapeDim / chunkDim);
  });
  const nonTimeChunkCounts = chunkCounts.slice(1);
  if (nonTimeChunkCounts.some((count) => count === 0)) {
    return { bytes: outputBytes, bytesRead };
  }

  const chunkPlans: ChunkReadPlan[] = [];
  if (nonTimeRank === 0) {
    const chunkCoords = [timeChunkCoord];
    const chunkKey = createZarrChunkKeyFromCoords(chunkCoords);
    chunkPlans.push({
      chunkCoords,
      chunkPath: `${descriptor.path}/${chunkKey}`,
      chunkStart: [],
      chunkShape: [],
      priority: 0
    });
  } else {
    const chunkGridCenters = nonTimeChunkCounts.map((count) => (count - 1) / 2);
    const nonTimeChunkCoords = new Array<number>(nonTimeRank).fill(0);

    while (true) {
      const chunkCoords = new Array<number>(descriptor.shape.length).fill(0);
      chunkCoords[0] = timeChunkCoord;
      const chunkStart = new Array<number>(nonTimeRank);
      const chunkShape = new Array<number>(nonTimeRank);
      let priority = 0;

      for (let axis = 0; axis < nonTimeRank; axis += 1) {
        const fullAxis = axis + 1;
        const axisChunkCoord = nonTimeChunkCoords[axis] ?? 0;
        const axisChunkSize = descriptor.chunkShape[fullAxis] ?? 0;
        const axisStart = axisChunkCoord * axisChunkSize;
        const axisExtent = Math.min(axisChunkSize, (descriptor.shape[fullAxis] ?? 0) - axisStart);

        chunkCoords[fullAxis] = axisChunkCoord;
        chunkStart[axis] = axisStart;
        chunkShape[axis] = axisExtent;

        const distanceFromCenter = axisChunkCoord - (chunkGridCenters[axis] ?? 0);
        priority += distanceFromCenter * distanceFromCenter;
      }

      const chunkKey = createZarrChunkKeyFromCoords(chunkCoords);
      chunkPlans.push({
        chunkCoords,
        chunkPath: `${descriptor.path}/${chunkKey}`,
        chunkStart,
        chunkShape,
        priority
      });

      let axis = nonTimeRank - 1;
      while (axis >= 0) {
        const nextCoord = (nonTimeChunkCoords[axis] ?? 0) + 1;
        if (nextCoord < (nonTimeChunkCounts[axis] ?? 0)) {
          nonTimeChunkCoords[axis] = nextCoord;
          break;
        }
        nonTimeChunkCoords[axis] = 0;
        axis -= 1;
      }
      if (axis < 0) {
        break;
      }
    }
  }

  chunkPlans.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.chunkPath.localeCompare(right.chunkPath);
  });

  const normalizedMaxConcurrentChunkReads = Number.isFinite(maxConcurrentChunkReads)
    ? Math.max(1, Math.floor(maxConcurrentChunkReads))
    : 1;
  const workerCount = Math.min(normalizedMaxConcurrentChunkReads, chunkPlans.length);
  let nextPlanIndex = 0;

  const runWorker = async () => {
    while (true) {
      throwIfAborted(signal);
      const planIndex = nextPlanIndex;
      nextPlanIndex += 1;
      if (planIndex >= chunkPlans.length) {
        return;
      }

      const plan = chunkPlans[planIndex];
      if (!plan) {
        return;
      }

      const { bytes: chunkBytes, bytesRead: chunkBytesRead } = await readChunk(plan.chunkCoords, { signal });
      throwIfAborted(signal);
      bytesRead += chunkBytesRead;

      const valuesPerTimeSlice = computeElementCount(plan.chunkShape, `chunk shape for ${plan.chunkPath}`);
      const expectedChunkBytes = valuesPerTimeSlice * timeChunkExtent * bytesPerValue;
      if (chunkBytes.byteLength !== expectedChunkBytes) {
        throw new Error(
          `Chunk byte length mismatch for ${plan.chunkPath} (expected ${expectedChunkBytes}, got ${chunkBytes.byteLength}).`
        );
      }

      const sliceByteLength = valuesPerTimeSlice * bytesPerValue;
      const sliceByteStart = timeOffsetInChunk * sliceByteLength;
      const sliceBytes = chunkBytes.subarray(sliceByteStart, sliceByteStart + sliceByteLength);
      copyChunkSliceToBuffer({
        destination: outputBytes,
        destinationShape: expectedNonTimeShape,
        destinationStrides,
        chunkBytes: sliceBytes,
        chunkShape: plan.chunkShape,
        chunkStart: plan.chunkStart,
        bytesPerValue,
        chunkPath: plan.chunkPath
      });
    }
  };

  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  }

  throwIfAborted(signal);

  return { bytes: outputBytes, bytesRead };
}

export function createVolumeProvider({
  manifest,
  storage,
  maxCachedVolumes: initialMaxCachedVolumes,
  maxCachedChunkBytes: initialMaxCachedChunkBytes,
  maxConcurrentChunkReads: initialMaxConcurrentChunkReads,
  maxConcurrentPrefetchLoads: initialMaxConcurrentPrefetchLoads
}: VolumeProviderOptions): VolumeProvider {
  const normalizedMaxCachedVolumes = Number.isFinite(initialMaxCachedVolumes)
    ? Math.floor(initialMaxCachedVolumes)
    : Number.NaN;
  if (!Number.isFinite(normalizedMaxCachedVolumes) || normalizedMaxCachedVolumes < 0) {
    throw new Error(
      `Volume provider requires a non-negative integer maxCachedVolumes value; received ${String(initialMaxCachedVolumes)}.`
    );
  }
  let maxCachedVolumes = normalizedMaxCachedVolumes;
  const layerIndex = new Map<string, LayerIndexEntry>();

  for (const channel of manifest.dataset.channels) {
    for (const layer of channel.layers) {
      if (layerIndex.has(layer.key)) {
        throw new Error(`Duplicate layer key detected in manifest: ${layer.key}`);
      }
      layerIndex.set(layer.key, {
        layerKey: layer.key,
        channelId: layer.channelId,
        isSegmentation: layer.isSegmentation,
        layer
      });
    }
  }

  const cache = new Map<string, CachedVolumeEntry>();
  const chunkCache = new Map<string, CachedChunkEntry>();
  const brickPageTableCache = new Map<string, CachedBrickPageTableEntry>();
  const brickAtlasCache = new Map<string, CachedBrickAtlasEntry>();
  const scaleRequestCounts = new Map<number, number>();
  let chunkCacheBytes = 0;
  const maxCachedChunkBytes = Number.isFinite(initialMaxCachedChunkBytes)
    ? Math.floor(initialMaxCachedChunkBytes)
    : Number.NaN;
  if (!Number.isFinite(maxCachedChunkBytes) || maxCachedChunkBytes < 0) {
    throw new Error(
      `Volume provider requires a non-negative integer maxCachedChunkBytes value; received ${String(initialMaxCachedChunkBytes)}.`
    );
  }
  const maxConcurrentChunkReads = Number.isFinite(initialMaxConcurrentChunkReads)
    ? Math.floor(initialMaxConcurrentChunkReads)
    : Number.NaN;
  if (!Number.isFinite(maxConcurrentChunkReads) || maxConcurrentChunkReads <= 0) {
    throw new Error(
      `Volume provider requires a positive integer maxConcurrentChunkReads value; received ${String(initialMaxConcurrentChunkReads)}.`
    );
  }
  const maxConcurrentPrefetchLoads = Number.isFinite(initialMaxConcurrentPrefetchLoads)
    ? Math.floor(initialMaxConcurrentPrefetchLoads)
    : Number.NaN;
  if (!Number.isFinite(maxConcurrentPrefetchLoads) || maxConcurrentPrefetchLoads <= 0) {
    throw new Error(
      `Volume provider requires a positive integer maxConcurrentPrefetchLoads value; received ${String(initialMaxConcurrentPrefetchLoads)}.`
    );
  }
  const activePrefetchRequests = new Map<number, PrefetchRequestState>();
  let nextPrefetchRequestId = 1;

  const resolveScaleEntry = (
    layer: LayerIndexEntry,
    requestedScaleLevel: number | undefined
  ) => {
    const sorted = [...layer.layer.zarr.scales].sort((left, right) => left.level - right.level);
    if (sorted.length === 0) {
      throw new Error(`Layer ${layer.layerKey} does not define any scales.`);
    }
    if (requestedScaleLevel === undefined) {
      const baseScale = sorted.find((entry) => entry.level === 0);
      return baseScale ?? sorted[0];
    }
    const wanted = normalizeScaleLevel(requestedScaleLevel);
    const exact = sorted.find((entry) => entry.level === wanted);
    if (!exact) {
      throw new Error(
        `Requested scale level ${wanted} is unavailable for layer ${layer.layerKey}. Available levels: ${sorted
          .map((entry) => entry.level)
          .join(', ')}`
      );
    }
    return exact;
  };

  const recordScaleRequest = (scaleLevel: number) => {
    const current = scaleRequestCounts.get(scaleLevel) ?? 0;
    scaleRequestCounts.set(scaleLevel, current + 1);
  };

  const stats: Omit<
    VolumeProviderStats,
    | 'prefetchActiveRequests'
    | 'maxCachedVolumes'
    | 'cacheSize'
    | 'inFlightCount'
    | 'maxCachedChunkBytes'
    | 'chunkCacheBytes'
    | 'chunkCacheSize'
    | 'chunkInFlightCount'
  > = {
    getVolumeCalls: 0,
    prefetchCalls: 0,
    prefetchSkippedCached: 0,
    prefetchSkippedInFlight: 0,
    prefetchLoadsStarted: 0,
    prefetchLoadsCompleted: 0,
    prefetchLoadsFailed: 0,
    prefetchLoadsCancelled: 0,
    prefetchRequestsAborted: 0,
    cacheHits: 0,
    cacheHitInFlight: 0,
    cacheMisses: 0,
    loadsStarted: 0,
    loadsCompleted: 0,
    loadsFailed: 0,
    bytesRead: 0,
    dataBytesRead: 0,
    labelBytesRead: 0,
    totalLoadMs: 0,
    totalDataReadMs: 0,
    totalLabelReadMs: 0,
    lastLoadMs: null,
    lastDataReadMs: null,
    lastLabelReadMs: null,
    chunkCacheHits: 0,
    chunkCacheHitInFlight: 0,
    chunkCacheMisses: 0,
    chunkReadsStarted: 0,
    chunkReadsCompleted: 0,
    chunkReadsFailed: 0,
    chunkBytesRead: 0,
    chunkCacheEvictions: 0
  };

  const nowMs = () => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  };

  const touch = (key: string, entry: CachedVolumeEntry) => {
    cache.delete(key);
    cache.set(key, entry);
  };

  const touchChunk = (key: string, entry: CachedChunkEntry) => {
    chunkCache.delete(key);
    chunkCache.set(key, entry);
  };

  const touchBrickPageTable = (key: string, entry: CachedBrickPageTableEntry) => {
    brickPageTableCache.delete(key);
    brickPageTableCache.set(key, entry);
  };

  const touchBrickAtlas = (key: string, entry: CachedBrickAtlasEntry) => {
    brickAtlasCache.delete(key);
    brickAtlasCache.set(key, entry);
  };

  const removeChunkEntry = (key: string, entry: CachedChunkEntry) => {
    if (entry.bytes) {
      chunkCacheBytes = Math.max(0, chunkCacheBytes - entry.byteLength);
    }
    chunkCache.delete(key);
  };

  const evictChunkCacheIfNeeded = () => {
    if (maxCachedChunkBytes <= 0) {
      for (const [key, entry] of chunkCache) {
        if (entry.inFlight) {
          if (entry.bytes) {
            chunkCacheBytes = Math.max(0, chunkCacheBytes - entry.byteLength);
            entry.bytes = null;
            entry.byteLength = 0;
          }
          continue;
        }
        removeChunkEntry(key, entry);
        stats.chunkCacheEvictions += 1;
      }
      return;
    }

    while (chunkCacheBytes > maxCachedChunkBytes) {
      let removed = false;
      for (const [key, entry] of chunkCache) {
        if (entry.inFlight || !entry.bytes) {
          continue;
        }
        removeChunkEntry(key, entry);
        stats.chunkCacheEvictions += 1;
        removed = true;
        break;
      }
      if (!removed) {
        return;
      }
    }
  };

  const evictIfNeeded = () => {
    if (maxCachedVolumes <= 0) {
      cache.clear();
      return;
    }

    while (cache.size > maxCachedVolumes) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      const oldest = cache.get(oldestKey);
      if (!oldest) {
        cache.delete(oldestKey);
        continue;
      }
      if (oldest.inFlight) {
        let removed = false;
        for (const [candidateKey, candidate] of cache) {
          if (!candidate.inFlight) {
            cache.delete(candidateKey);
            removed = true;
            break;
          }
        }
        if (!removed) {
          return;
        }
      } else {
        cache.delete(oldestKey);
      }
    }
  };

  const evictBrickPageTableCacheIfNeeded = () => {
    if (maxCachedVolumes <= 0) {
      brickPageTableCache.clear();
      return;
    }

    while (brickPageTableCache.size > maxCachedVolumes) {
      const oldestKey = brickPageTableCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      const oldest = brickPageTableCache.get(oldestKey);
      if (!oldest) {
        brickPageTableCache.delete(oldestKey);
        continue;
      }
      if (oldest.inFlight) {
        let removed = false;
        for (const [candidateKey, candidate] of brickPageTableCache) {
          if (!candidate.inFlight) {
            brickPageTableCache.delete(candidateKey);
            removed = true;
            break;
          }
        }
        if (!removed) {
          return;
        }
      } else {
        brickPageTableCache.delete(oldestKey);
      }
    }
  };

  const evictBrickAtlasCacheIfNeeded = () => {
    if (maxCachedVolumes <= 0) {
      brickAtlasCache.clear();
      return;
    }

    while (brickAtlasCache.size > maxCachedVolumes) {
      const oldestKey = brickAtlasCache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      const oldest = brickAtlasCache.get(oldestKey);
      if (!oldest) {
        brickAtlasCache.delete(oldestKey);
        continue;
      }
      if (oldest.inFlight) {
        let removed = false;
        for (const [candidateKey, candidate] of brickAtlasCache) {
          if (!candidate.inFlight) {
            brickAtlasCache.delete(candidateKey);
            removed = true;
            break;
          }
        }
        if (!removed) {
          return;
        }
      } else {
        brickAtlasCache.delete(oldestKey);
      }
    }
  };

  const readChunkWithCache = async (
    descriptor: ZarrArrayDescriptor,
    chunkCoords: number[],
    options?: { signal?: AbortSignal | null }
  ): Promise<{ bytes: Uint8Array; bytesRead: number }> => {
    const signal = options?.signal ?? null;
    throwIfAborted(signal);
    const isSharded = isShardedArrayDescriptor(descriptor);
    const shardLocation = isSharded ? getShardChunkLocation(descriptor, chunkCoords) : null;
    const chunkPath = shardLocation ? shardLocation.shardPath : `${descriptor.path}/${createZarrChunkKeyFromCoords(chunkCoords)}`;
    const cacheKey = createChunkCacheKey(chunkPath);

    const decodeBytes = (storedBytes: Uint8Array): Uint8Array => {
      if (!shardLocation) {
        return storedBytes;
      }
      return decodeShardEntry({
        shardBytes: storedBytes,
        rank: descriptor.shape.length,
        localChunkCoords: shardLocation.localChunkCoords
      });
    };

    const existing = chunkCache.get(cacheKey);
    if (existing) {
      touchChunk(cacheKey, existing);
      if (existing.bytes) {
        stats.chunkCacheHits += 1;
        return { bytes: decodeBytes(existing.bytes), bytesRead: 0 };
      }
      if (existing.inFlight) {
        stats.chunkCacheHitInFlight += 1;
        const bytes = await awaitWithAbort(existing.inFlight, signal);
        throwIfAborted(signal);
        return { bytes: decodeBytes(bytes), bytesRead: 0 };
      }
      chunkCache.delete(cacheKey);
    }

    stats.chunkCacheMisses += 1;
    const entry: CachedChunkEntry = {
      key: cacheKey,
      chunkPath,
      bytes: null,
      byteLength: 0,
      inFlight: null
    };

    const promise = (async () => {
      stats.chunkReadsStarted += 1;
      const chunkBytes = await storage.readFile(chunkPath);
      stats.chunkReadsCompleted += 1;
      stats.chunkBytesRead += chunkBytes.byteLength;
      return chunkBytes;
    })()
      .then((chunkBytes) => {
        entry.inFlight = null;
        const canCache = maxCachedChunkBytes > 0 && chunkBytes.byteLength <= maxCachedChunkBytes;
        if (canCache) {
          entry.bytes = chunkBytes;
          entry.byteLength = chunkBytes.byteLength;
          chunkCacheBytes += chunkBytes.byteLength;
          touchChunk(cacheKey, entry);
          evictChunkCacheIfNeeded();
        } else {
          chunkCache.delete(cacheKey);
        }
        return chunkBytes;
      })
      .catch((error) => {
        stats.chunkReadsFailed += 1;
        entry.inFlight = null;
        chunkCache.delete(cacheKey);
        throw error;
      });

    entry.inFlight = promise;
    chunkCache.set(cacheKey, entry);
    const chunkBytes = await awaitWithAbort(promise, signal);
    throwIfAborted(signal);
    return { bytes: decodeBytes(chunkBytes), bytesRead: chunkBytes.byteLength };
  };

  const loadVolume = async (
    layer: LayerIndexEntry,
    timepoint: number,
    requestedScaleLevel: number,
    signal: AbortSignal | null
  ): Promise<NormalizedVolume> => {
    throwIfAborted(signal);
    stats.loadsStarted += 1;
    const loadStart = nowMs();
    if (timepoint >= layer.layer.volumeCount) {
      throw new Error(`Timepoint ${timepoint} is out of bounds for layer ${layer.layerKey}.`);
    }

    const scale = resolveScaleEntry(layer, requestedScaleLevel);

    const dataDescriptor = scale.zarr.data;
    if (dataDescriptor.dataType !== 'uint8') {
      throw new Error(`Unsupported data type for ${dataDescriptor.path}: expected uint8, got ${dataDescriptor.dataType}.`);
    }
    const dataReadStart = nowMs();
    const {
      bytes: volumeBytes,
      bytesRead: volumeBytesRead
    } = await readTimepointChunkedArray({
      descriptor: dataDescriptor,
      timepoint,
      expectedNonTimeShape: [scale.depth, scale.height, scale.width, scale.channels],
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(dataDescriptor, chunkCoords, chunkOptions),
      signal
    });
    const dataReadMs = nowMs() - dataReadStart;
    stats.totalDataReadMs += dataReadMs;
    stats.lastDataReadMs = dataReadMs;
    stats.dataBytesRead += volumeBytesRead;
    stats.bytesRead += volumeBytesRead;

    const expectedByteLength = scale.width * scale.height * scale.depth * scale.channels;
    if (volumeBytes.byteLength !== expectedByteLength) {
      throw new Error(
        `Volume byte length mismatch for ${dataDescriptor.path} (expected ${expectedByteLength}, got ${volumeBytes.byteLength}).`
      );
    }

    let segmentationLabels: Uint32Array | undefined;
    if (scale.zarr.labels) {
      const labelsDescriptor = scale.zarr.labels;
      if (labelsDescriptor.dataType !== 'uint32') {
        throw new Error(
          `Unsupported label data type for ${labelsDescriptor.path}: expected uint32, got ${labelsDescriptor.dataType}.`
        );
      }
      const labelReadStart = nowMs();
      const {
        bytes: labelBytes,
        bytesRead: labelBytesRead
      } = await readTimepointChunkedArray({
        descriptor: labelsDescriptor,
        timepoint,
        expectedNonTimeShape: [scale.depth, scale.height, scale.width],
        maxConcurrentChunkReads,
        readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(labelsDescriptor, chunkCoords, chunkOptions),
        signal
      });
      const labelReadMs = nowMs() - labelReadStart;
      stats.totalLabelReadMs += labelReadMs;
      stats.lastLabelReadMs = labelReadMs;
      stats.labelBytesRead += labelBytesRead;
      stats.bytesRead += labelBytesRead;
      const expectedLabelBytes = scale.width * scale.height * scale.depth * 4;
      if (labelBytes.byteLength !== expectedLabelBytes) {
        throw new Error(
          `Segmentation label byte length mismatch for ${labelsDescriptor.path} (expected ${expectedLabelBytes}, got ${labelBytes.byteLength}).`
        );
      }
      const labelBuffer = ensureArrayBuffer(labelBytes);
      segmentationLabels = new Uint32Array(labelBuffer);
    }

    const histogramDescriptor = scale.zarr.histogram;
    const {
      bytes: histogramBytes,
      bytesRead: histogramBytesRead
    } = await readTimepointChunkedArray({
      descriptor: histogramDescriptor,
      timepoint,
      expectedNonTimeShape: [HISTOGRAM_BINS],
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(histogramDescriptor, chunkCoords, chunkOptions),
      signal
    });
    throwIfAborted(signal);
    stats.bytesRead += histogramBytesRead;
    const histogram = decodeUint32ArrayLE(histogramBytes, HISTOGRAM_BINS);

    const normalized =
      volumeBytes.byteOffset === 0 && volumeBytes.byteLength === volumeBytes.buffer.byteLength
        ? volumeBytes
        : volumeBytes.slice();

    const loadMs = nowMs() - loadStart;
    stats.totalLoadMs += loadMs;
    stats.lastLoadMs = loadMs;
    stats.loadsCompleted += 1;

    return {
      width: scale.width,
      height: scale.height,
      depth: scale.depth,
      channels: scale.channels,
      dataType: layer.layer.dataType,
      normalized,
      histogram,
      scaleLevel: scale.level,
      downsampleFactor: scale.downsampleFactor,
      min: layer.layer.normalization?.min ?? (() => {
        throw new Error(`Layer ${layer.layerKey} is missing normalization.min metadata.`);
      })(),
      max: layer.layer.normalization?.max ?? (() => {
        throw new Error(`Layer ${layer.layerKey} is missing normalization.max metadata.`);
      })(),
      ...(segmentationLabels ? { segmentationLabels, segmentationLabelDataType: 'uint32' } : {})
    };
  };

  const loadBrickPageTable = async (
    layer: LayerIndexEntry,
    timepoint: number,
    requestedScaleLevel: number,
    signal: AbortSignal | null
  ): Promise<VolumeBrickPageTable> => {
    throwIfAborted(signal);
    if (timepoint >= layer.layer.volumeCount) {
      throw new Error(`Timepoint ${timepoint} is out of bounds for layer ${layer.layerKey}.`);
    }

    const scale = resolveScaleEntry(layer, requestedScaleLevel);

    const dataDescriptor = scale.zarr.data;
    if (dataDescriptor.chunkShape.length !== 5) {
      throw new Error(`Invalid data chunk shape rank for ${dataDescriptor.path}: expected rank 5.`);
    }

    const chunkDepth = dataDescriptor.chunkShape[1] ?? 0;
    const chunkHeight = dataDescriptor.chunkShape[2] ?? 0;
    const chunkWidth = dataDescriptor.chunkShape[3] ?? 0;
    if (chunkDepth <= 0 || chunkHeight <= 0 || chunkWidth <= 0) {
      throw new Error(`Invalid chunk dimensions for ${dataDescriptor.path}.`);
    }

    const zChunks = Math.ceil(scale.depth / chunkDepth);
    const yChunks = Math.ceil(scale.height / chunkHeight);
    const xChunks = Math.ceil(scale.width / chunkWidth);
    const expectedGridShape: [number, number, number] = [zChunks, yChunks, xChunks];

    const minDescriptor = scale.zarr.chunkStats.min;
    const maxDescriptor = scale.zarr.chunkStats.max;
    const occupancyDescriptor = scale.zarr.chunkStats.occupancy;

    const {
      bytes: minBytes,
      bytesRead: minBytesRead
    } = await readTimepointChunkedArray({
      descriptor: minDescriptor,
      timepoint,
      expectedNonTimeShape: expectedGridShape,
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(minDescriptor, chunkCoords, chunkOptions),
      signal
    });
    const {
      bytes: maxBytes,
      bytesRead: maxBytesRead
    } = await readTimepointChunkedArray({
      descriptor: maxDescriptor,
      timepoint,
      expectedNonTimeShape: expectedGridShape,
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(maxDescriptor, chunkCoords, chunkOptions),
      signal
    });
    const {
      bytes: occupancyBytes,
      bytesRead: occupancyBytesRead
    } = await readTimepointChunkedArray({
      descriptor: occupancyDescriptor,
      timepoint,
      expectedNonTimeShape: expectedGridShape,
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(occupancyDescriptor, chunkCoords, chunkOptions),
      signal
    });
    throwIfAborted(signal);

    stats.bytesRead += minBytesRead + maxBytesRead + occupancyBytesRead;

    const chunkMin = minBytes;
    const chunkMax = maxBytes;
    const occupancyBuffer = ensureArrayBuffer(occupancyBytes);
    const chunkOccupancy = new Float32Array(occupancyBuffer);
    const expectedBrickCount = zChunks * yChunks * xChunks;
    if (
      chunkMin.length !== expectedBrickCount ||
      chunkMax.length !== expectedBrickCount ||
      chunkOccupancy.length !== expectedBrickCount
    ) {
      throw new Error(
        `Chunk-stats size mismatch for layer ${layer.layerKey} at timepoint ${timepoint}.`
      );
    }

    const brickAtlasIndices = new Int32Array(expectedBrickCount);
    let occupiedBrickCount = 0;
    for (let index = 0; index < expectedBrickCount; index += 1) {
      const occupancy = chunkOccupancy[index] ?? 0;
      if (occupancy > 0) {
        brickAtlasIndices[index] = occupiedBrickCount;
        occupiedBrickCount += 1;
      } else {
        brickAtlasIndices[index] = -1;
      }
    }

    return {
      layerKey: layer.layerKey,
      timepoint,
      scaleLevel: scale.level,
      gridShape: expectedGridShape,
      chunkShape: [chunkDepth, chunkHeight, chunkWidth],
      volumeShape: [scale.depth, scale.height, scale.width],
      brickAtlasIndices,
      chunkMin,
      chunkMax,
      chunkOccupancy,
      occupiedBrickCount
    };
  };

  const getVolume = async (
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<NormalizedVolume> => {
    const signal = options?.signal ?? null;
    throwIfAborted(signal);
    stats.getVolumeCalls += 1;
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const layer = layerIndex.get(layerKey);
    if (!layer) {
      throw new Error(`Unknown layer key: ${layerKey}`);
    }

    const scale = resolveScaleEntry(layer, options?.scaleLevel);
    recordScaleRequest(scale.level);
    const key = createCacheKey(layerKey, timepoint, scale.level);
    const existing = cache.get(key);
    if (existing) {
      touch(key, existing);
      if (existing.volume) {
        stats.cacheHits += 1;
        return existing.volume;
      }
      if (existing.inFlight) {
        stats.cacheHitInFlight += 1;
        return awaitWithAbort(existing.inFlight, signal);
      }
    }

    stats.cacheMisses += 1;
    const entry: CachedVolumeEntry = {
      key,
      layerKey,
      timepoint,
      scaleLevel: scale.level,
      volume: null,
      inFlight: null
    };

    const promise = loadVolume(layer, timepoint, scale.level, null)
      .then((volume) => {
        entry.volume = volume;
        entry.inFlight = null;
        touch(key, entry);
        evictIfNeeded();
        return volume;
      })
      .catch((error) => {
        stats.loadsFailed += 1;
        cache.delete(key);
        throw error;
      });

    entry.inFlight = promise;
    cache.set(key, entry);
    evictIfNeeded();
    return awaitWithAbort(promise, signal);
  };

  const getBrickPageTable = async (
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<VolumeBrickPageTable> => {
    const signal = options?.signal ?? null;
    throwIfAborted(signal);
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const layer = layerIndex.get(layerKey);
    if (!layer) {
      throw new Error(`Unknown layer key: ${layerKey}`);
    }
    const scale = resolveScaleEntry(layer, options?.scaleLevel);
    recordScaleRequest(scale.level);
    const key = createBrickPageTableCacheKey(layerKey, timepoint, scale.level);
    const existing = brickPageTableCache.get(key);
    if (existing) {
      touchBrickPageTable(key, existing);
      if (existing.pageTable) {
        return existing.pageTable;
      }
      if (existing.inFlight) {
        return awaitWithAbort(existing.inFlight, signal);
      }
    }

    const entry: CachedBrickPageTableEntry = {
      key,
      layerKey,
      timepoint,
      scaleLevel: scale.level,
      pageTable: null,
      inFlight: null
    };

    const promise = loadBrickPageTable(layer, timepoint, scale.level, null)
      .then((pageTable) => {
        entry.pageTable = pageTable;
        entry.inFlight = null;
        touchBrickPageTable(key, entry);
        evictBrickPageTableCacheIfNeeded();
        return pageTable;
      })
      .catch((error) => {
        brickPageTableCache.delete(key);
        throw error;
      });

    entry.inFlight = promise;
    brickPageTableCache.set(key, entry);
    evictBrickPageTableCacheIfNeeded();
    return awaitWithAbort(promise, signal);
  };

  const loadBrickAtlas = async (
    layer: LayerIndexEntry,
    timepoint: number,
    pageTable: VolumeBrickPageTable,
    signal: AbortSignal | null
  ): Promise<VolumeBrickAtlas> => {
    throwIfAborted(signal);
    const scale = resolveScaleEntry(layer, pageTable.scaleLevel);
    const histogramDescriptor = scale.zarr.histogram;
    const {
      bytes: histogramBytes,
      bytesRead: histogramBytesRead
    } = await readTimepointChunkedArray({
      descriptor: histogramDescriptor,
      timepoint,
      expectedNonTimeShape: [HISTOGRAM_BINS],
      maxConcurrentChunkReads,
      readChunk: (chunkCoords, chunkOptions) => readChunkWithCache(histogramDescriptor, chunkCoords, chunkOptions),
      signal
    });
    stats.bytesRead += histogramBytesRead;
    const histogram = decodeUint32ArrayLE(histogramBytes, HISTOGRAM_BINS);

    const dataDescriptor = scale.zarr.data;
    if (dataDescriptor.dataType !== 'uint8') {
      throw new Error(`Unsupported data type for ${dataDescriptor.path}: expected uint8, got ${dataDescriptor.dataType}.`);
    }
    if (dataDescriptor.chunkShape.length !== 5) {
      throw new Error(`Invalid data chunk shape rank for ${dataDescriptor.path}: expected rank 5.`);
    }

    const chunkDepth = dataDescriptor.chunkShape[1] ?? 0;
    const chunkHeight = dataDescriptor.chunkShape[2] ?? 0;
    const chunkWidth = dataDescriptor.chunkShape[3] ?? 0;
    const chunkChannels = dataDescriptor.chunkShape[4] ?? 0;
    if (chunkDepth <= 0 || chunkHeight <= 0 || chunkWidth <= 0 || chunkChannels <= 0) {
      throw new Error(`Invalid data chunk dimensions for ${dataDescriptor.path}.`);
    }

    const [gridZ, gridY, gridX] = pageTable.gridShape;
    const expectedBrickCount = gridZ * gridY * gridX;
    if (pageTable.brickAtlasIndices.length !== expectedBrickCount) {
      throw new Error(`Brick atlas index shape mismatch for layer ${layer.layerKey} at timepoint ${timepoint}.`);
    }

    const textureFormat = getBrickAtlasTextureFormat(scale.channels);
    const textureChannels = getBrickAtlasTextureChannels(textureFormat);
    const enabled = pageTable.occupiedBrickCount > 0;
    if (!enabled) {
      return {
        layerKey: layer.layerKey,
        timepoint,
        scaleLevel: scale.level,
        pageTable,
        histogram,
        width: 1,
        height: 1,
        depth: 1,
        textureFormat,
        sourceChannels: scale.channels,
        data: new Uint8Array([0]),
        enabled: false
      };
    }

    const atlasWidth = chunkWidth;
    const atlasHeight = chunkHeight;
    const atlasDepth = chunkDepth * pageTable.occupiedBrickCount;
    const atlasData = new Uint8Array(atlasWidth * atlasHeight * atlasDepth * textureChannels);

    const timeChunkLength = dataDescriptor.chunkShape[0] ?? 0;
    if (!Number.isFinite(timeChunkLength) || timeChunkLength <= 0 || Math.floor(timeChunkLength) !== timeChunkLength) {
      throw new Error(`Invalid time chunk size for ${dataDescriptor.path}: ${timeChunkLength}`);
    }
    const timeChunkCoord = Math.floor(timepoint / timeChunkLength);
    const timeChunkStart = timeChunkCoord * timeChunkLength;
    const timeChunkExtent = Math.min(timeChunkLength, (dataDescriptor.shape[0] ?? 0) - timeChunkStart);
    const timeOffsetInChunk = timepoint - timeChunkStart;
    const channelChunkCount = Math.ceil(scale.channels / chunkChannels);
    const chunksPerPlane = gridY * gridX;

    type BrickAtlasChunkPlan = {
      chunkCoords: number[];
      atlasZBase: number;
      zExtent: number;
      yExtent: number;
      xExtent: number;
      channelStart: number;
      channelExtent: number;
      voxelCountPerTimeSlice: number;
    };

    const chunkPlans: BrickAtlasChunkPlan[] = [];
    for (let flatBrickIndex = 0; flatBrickIndex < expectedBrickCount; flatBrickIndex += 1) {
      const atlasIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
      if (atlasIndex < 0) {
        continue;
      }

      const brickZ = Math.floor(flatBrickIndex / chunksPerPlane);
      const withinPlane = flatBrickIndex % chunksPerPlane;
      const brickY = Math.floor(withinPlane / gridX);
      const brickX = withinPlane % gridX;

      const zStart = brickZ * chunkDepth;
      const yStart = brickY * chunkHeight;
      const xStart = brickX * chunkWidth;
      const zExtent = Math.min(chunkDepth, scale.depth - zStart);
      const yExtent = Math.min(chunkHeight, scale.height - yStart);
      const xExtent = Math.min(chunkWidth, scale.width - xStart);
      if (zExtent <= 0 || yExtent <= 0 || xExtent <= 0) {
        continue;
      }

      const atlasZBase = atlasIndex * chunkDepth;
      for (let channelChunkCoord = 0; channelChunkCoord < channelChunkCount; channelChunkCoord += 1) {
        const channelStart = channelChunkCoord * chunkChannels;
        const channelExtent = Math.min(chunkChannels, scale.channels - channelStart);
        if (channelExtent <= 0) {
          continue;
        }

        chunkPlans.push({
          chunkCoords: [timeChunkCoord, brickZ, brickY, brickX, channelChunkCoord],
          atlasZBase,
          zExtent,
          yExtent,
          xExtent,
          channelStart,
          channelExtent,
          voxelCountPerTimeSlice: zExtent * yExtent * xExtent
        });
      }
    }

    let nextPlanIndex = 0;
    const workerCount = Math.min(Math.max(1, maxConcurrentChunkReads), chunkPlans.length);
    const runWorker = async () => {
      while (true) {
        throwIfAborted(signal);
        const planIndex = nextPlanIndex;
        nextPlanIndex += 1;
        if (planIndex >= chunkPlans.length) {
          return;
        }

        const plan = chunkPlans[planIndex];
        if (!plan) {
          return;
        }

        const { bytes: chunkBytes, bytesRead } = await readChunkWithCache(dataDescriptor, plan.chunkCoords, { signal });
        throwIfAborted(signal);
        stats.bytesRead += bytesRead;
        stats.dataBytesRead += bytesRead;

        if (chunkBytes.length % timeChunkExtent !== 0) {
          throw new Error(
            `Chunk byte length mismatch for ${dataDescriptor.path} at coords ${plan.chunkCoords.join(
              ','
            )} (expected a multiple of ${timeChunkExtent}, got ${chunkBytes.length}).`
          );
        }
        const valuesPerTimeSlice = chunkBytes.length / timeChunkExtent;
        const minimumValuesPerTimeSlice = plan.voxelCountPerTimeSlice * plan.channelExtent;
        if (valuesPerTimeSlice < minimumValuesPerTimeSlice) {
          throw new Error(
            `Chunk byte length mismatch for ${dataDescriptor.path} at coords ${plan.chunkCoords.join(
              ','
            )} (expected at least ${minimumValuesPerTimeSlice * timeChunkExtent}, got ${chunkBytes.length}).`
          );
        }
        if (valuesPerTimeSlice % plan.voxelCountPerTimeSlice !== 0) {
          throw new Error(
            `Chunk byte length mismatch for ${dataDescriptor.path} at coords ${plan.chunkCoords.join(
              ','
            )} (invalid channel stride for chunk bytes length ${chunkBytes.length}).`
          );
        }
        const chunkChannelStride = valuesPerTimeSlice / plan.voxelCountPerTimeSlice;
        if (!Number.isFinite(chunkChannelStride) || chunkChannelStride < plan.channelExtent) {
          throw new Error(
            `Chunk channel stride mismatch for ${dataDescriptor.path} at coords ${plan.chunkCoords.join(
              ','
            )} (expected at least ${plan.channelExtent}, got ${chunkChannelStride}).`
          );
        }

        const timeSliceOffset = timeOffsetInChunk * valuesPerTimeSlice;
        for (let localZ = 0; localZ < plan.zExtent; localZ += 1) {
          for (let localY = 0; localY < plan.yExtent; localY += 1) {
            for (let localX = 0; localX < plan.xExtent; localX += 1) {
              const atlasVoxelOffset =
                (((plan.atlasZBase + localZ) * atlasHeight + localY) * atlasWidth + localX) * textureChannels;

              if (textureFormat === 'rgba' && scale.channels === 3) {
                atlasData[atlasVoxelOffset + 3] = 255;
              }

              for (let localChannel = 0; localChannel < plan.channelExtent; localChannel += 1) {
                const sourceChannel = plan.channelStart + localChannel;
                const textureChannel = mapSourceChannelToTextureChannel(
                  sourceChannel,
                  scale.channels,
                  textureFormat
                );
                if (textureChannel === null) {
                  continue;
                }
                const chunkOffset =
                  (((localZ * plan.yExtent + localY) * plan.xExtent + localX) * chunkChannelStride + localChannel);
                const value = chunkBytes[timeSliceOffset + chunkOffset] ?? 0;
                atlasData[atlasVoxelOffset + textureChannel] = value;
              }
            }
          }
        }
      }
    };

    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }
    throwIfAborted(signal);

    return {
      layerKey: layer.layerKey,
      timepoint,
      scaleLevel: scale.level,
      pageTable,
      histogram,
      width: atlasWidth,
      height: atlasHeight,
      depth: atlasDepth,
      textureFormat,
      sourceChannels: scale.channels,
      data: atlasData,
      enabled: true
    };
  };

  const getBrickAtlas = async (
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number; signal?: AbortSignal | null }
  ): Promise<VolumeBrickAtlas> => {
    const signal = options?.signal ?? null;
    throwIfAborted(signal);
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const layer = layerIndex.get(layerKey);
    if (!layer) {
      throw new Error(`Unknown layer key: ${layerKey}`);
    }
    const scale = resolveScaleEntry(layer, options?.scaleLevel);
    recordScaleRequest(scale.level);
    const key = createBrickAtlasCacheKey(layerKey, timepoint, scale.level);
    const existing = brickAtlasCache.get(key);
    if (existing) {
      touchBrickAtlas(key, existing);
      if (existing.atlas) {
        return existing.atlas;
      }
      if (existing.inFlight) {
        return awaitWithAbort(existing.inFlight, signal);
      }
    }

    const entry: CachedBrickAtlasEntry = {
      key,
      layerKey,
      timepoint,
      scaleLevel: scale.level,
      atlas: null,
      inFlight: null
    };

    const promise = getBrickPageTable(layerKey, timepoint, { scaleLevel: scale.level })
      .then((pageTable) => loadBrickAtlas(layer, timepoint, pageTable, null))
      .then((atlas) => {
        entry.atlas = atlas;
        entry.inFlight = null;
        touchBrickAtlas(key, entry);
        evictBrickAtlasCacheIfNeeded();
        return atlas;
      })
      .catch((error) => {
        brickAtlasCache.delete(key);
        throw error;
      });

    entry.inFlight = promise;
    brickAtlasCache.set(key, entry);
    evictBrickAtlasCacheIfNeeded();
    return awaitWithAbort(promise, signal);
  };

  const hasBrickAtlas = (
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number }
  ): boolean => {
    const key = createBrickAtlasCacheKey(layerKey, timepoint, normalizeScaleLevel(options?.scaleLevel));
    const entry = brickAtlasCache.get(key);
    return Boolean(entry?.atlas);
  };

  const prefetchBrickAtlases = async (
    layerKeys: string[],
    timepoint: number,
    options?: VolumePrefetchOptions
  ): Promise<void> => {
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const uniqueKeys = Array.from(new Set(layerKeys.filter(Boolean)));
    if (uniqueKeys.length === 0) {
      return;
    }

    const policy: VolumePrefetchPolicy = options?.policy ?? 'missing-only';
    const signal = options?.signal ?? null;
    const requestedScaleLevels = normalizeScaleLevelSet(options?.scaleLevels);
    if (signal?.aborted) {
      return;
    }

    const maxConcurrentLayerLoads = Number.isFinite(options?.maxConcurrentLayerLoads)
      ? Math.max(1, Math.floor(options?.maxConcurrentLayerLoads ?? maxConcurrentPrefetchLoads))
      : maxConcurrentPrefetchLoads;
    let nextLayerIndex = 0;
    const workerCount = Math.min(maxConcurrentLayerLoads, uniqueKeys.length);
    const runWorker = async () => {
      while (true) {
        if (signal?.aborted) {
          return;
        }
        const layerIndexValue = nextLayerIndex;
        nextLayerIndex += 1;
        if (layerIndexValue >= uniqueKeys.length) {
          return;
        }

        const layerKey = uniqueKeys[layerIndexValue];
        if (!layerKey) {
          continue;
        }
        const layer = layerIndex.get(layerKey);
        if (!layer) {
          throw new Error(`Unknown layer key: ${layerKey}`);
        }
        const resolvedScaleLevels = normalizeScaleLevelSet(
          requestedScaleLevels.length > 0
            ? requestedScaleLevels.map((scaleLevel) => resolveScaleEntry(layer, scaleLevel).level)
            : [resolveScaleEntry(layer, undefined).level]
        );
        for (const scaleLevel of resolvedScaleLevels) {
          if (policy === 'missing-only' && hasBrickAtlas(layerKey, timepoint, { scaleLevel })) {
            continue;
          }
          try {
            await getBrickAtlas(layerKey, timepoint, { scaleLevel, signal });
          } catch (error) {
            if (signal?.aborted || isAbortLikeError(error)) {
              return;
            }
            throw error;
          }
        }
      }
    };

    if (workerCount > 0) {
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    }
  };

  const prefetch = async (
    layerKeys: string[],
    timepoint: number,
    options?: VolumePrefetchOptions
  ): Promise<void> => {
    stats.prefetchCalls += 1;
    if (!isValidTimepoint(timepoint)) {
      throw new Error(`Invalid timepoint: ${timepoint}`);
    }
    const uniqueKeys = Array.from(new Set(layerKeys.filter(Boolean)));
    if (uniqueKeys.length === 0) {
      return;
    }

    const policy: VolumePrefetchPolicy = options?.policy ?? 'missing-only';
    const reason: VolumePrefetchReason = options?.reason ?? 'manual';
    const signal = options?.signal ?? null;
    const requestedScaleLevels = normalizeScaleLevelSet(options?.scaleLevels);
    const maxConcurrentLayerLoads = Number.isFinite(options?.maxConcurrentLayerLoads)
      ? Math.max(1, Math.floor(options?.maxConcurrentLayerLoads ?? maxConcurrentPrefetchLoads))
      : maxConcurrentPrefetchLoads;

    if (signal?.aborted) {
      stats.prefetchRequestsAborted += 1;
      return;
    }

    const requestId = nextPrefetchRequestId++;
    const requestState: PrefetchRequestState = {
      id: requestId,
      startedAtMs: nowMs(),
      timepoint,
      layerKeys: uniqueKeys,
      reason,
      cancelled: false,
      scaleLevels: requestedScaleLevels
    };
    activePrefetchRequests.set(requestId, requestState);

    let requestAborted = false;
    const markRequestAborted = () => {
      if (requestAborted) {
        return;
      }
      requestAborted = true;
      requestState.cancelled = true;
      stats.prefetchRequestsAborted += 1;
    };
    const onAbort = () => {
      markRequestAborted();
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    let nextLayerIndex = 0;
    const workerCount = Math.min(maxConcurrentLayerLoads, uniqueKeys.length);
    const runWorker = async () => {
      while (true) {
        if (requestAborted || signal?.aborted) {
          return;
        }

        const layerIndexValue = nextLayerIndex;
        nextLayerIndex += 1;
        if (layerIndexValue >= uniqueKeys.length) {
          return;
        }

        const layerKey = uniqueKeys[layerIndexValue];
        if (!layerKey) {
          continue;
        }
        const layer = layerIndex.get(layerKey);
        if (!layer) {
          throw new Error(`Unknown layer key: ${layerKey}`);
        }

        const resolvedScaleLevels = normalizeScaleLevelSet(
          requestedScaleLevels.length > 0
            ? requestedScaleLevels.map((scaleLevel) => resolveScaleEntry(layer, scaleLevel).level)
            : [resolveScaleEntry(layer, undefined).level]
        );
        for (const scaleLevel of resolvedScaleLevels) {
          const existing = cache.get(createCacheKey(layerKey, timepoint, scaleLevel));
          if (policy === 'missing-only') {
            if (existing?.volume) {
              stats.prefetchSkippedCached += 1;
              continue;
            }
            if (existing?.inFlight) {
              stats.prefetchSkippedInFlight += 1;
              continue;
            }
          }

          if (requestAborted || signal?.aborted) {
            stats.prefetchLoadsCancelled += 1;
            continue;
          }

          stats.prefetchLoadsStarted += 1;
          try {
            await getVolume(layerKey, timepoint, { scaleLevel, signal });
            stats.prefetchLoadsCompleted += 1;
          } catch (error) {
            if (requestAborted || signal?.aborted || isAbortLikeError(error)) {
              stats.prefetchLoadsCancelled += 1;
              return;
            }
            stats.prefetchLoadsFailed += 1;
            throw error;
          }
        }
      }
    };

    try {
      if (workerCount > 0) {
        await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (!requestAborted && signal?.aborted) {
        markRequestAborted();
      }
      activePrefetchRequests.delete(requestId);
    }
  };

  const hasVolume = (
    layerKey: string,
    timepoint: number,
    options?: { scaleLevel?: number }
  ): boolean => {
    const key = createCacheKey(layerKey, timepoint, normalizeScaleLevel(options?.scaleLevel));
    const entry = cache.get(key);
    return Boolean(entry?.volume);
  };

  const clear = () => {
    cache.clear();
    chunkCache.clear();
    brickPageTableCache.clear();
    brickAtlasCache.clear();
    chunkCacheBytes = 0;
    activePrefetchRequests.clear();
    scaleRequestCounts.clear();
  };

  const setMaxCachedVolumes = (nextMaxCachedVolumes: number) => {
    const normalized = Number.isFinite(nextMaxCachedVolumes)
      ? Math.max(0, Math.floor(nextMaxCachedVolumes))
      : 0;
    if (normalized === maxCachedVolumes) {
      return;
    }
    maxCachedVolumes = normalized;
    evictIfNeeded();
    evictBrickPageTableCacheIfNeeded();
    evictBrickAtlasCacheIfNeeded();
  };

  const getStats = (): VolumeProviderStats => {
    let inFlightCount = 0;
    for (const entry of cache.values()) {
      if (entry.inFlight) {
        inFlightCount += 1;
      }
    }
    let chunkCacheSize = 0;
    let chunkInFlightCount = 0;
    for (const entry of chunkCache.values()) {
      if (entry.bytes) {
        chunkCacheSize += 1;
      }
      if (entry.inFlight) {
        chunkInFlightCount += 1;
      }
    }
    return {
      ...stats,
      prefetchActiveRequests: activePrefetchRequests.size,
      maxCachedVolumes,
      cacheSize: cache.size,
      inFlightCount,
      maxCachedChunkBytes,
      chunkCacheBytes,
      chunkCacheSize,
      chunkInFlightCount
    };
  };

  const getDiagnostics = (): VolumeProviderDiagnostics => {
    const statsSnapshot = getStats();
    const volumeLookups = statsSnapshot.cacheHits + statsSnapshot.cacheHitInFlight + statsSnapshot.cacheMisses;
    const chunkLookups = statsSnapshot.chunkCacheHits + statsSnapshot.chunkCacheHitInFlight + statsSnapshot.chunkCacheMisses;
    const volumePressure =
      statsSnapshot.maxCachedVolumes > 0 ? clamp01(statsSnapshot.cacheSize / statsSnapshot.maxCachedVolumes) : 0;
    const chunkPressure =
      statsSnapshot.maxCachedChunkBytes > 0
        ? clamp01(statsSnapshot.chunkCacheBytes / statsSnapshot.maxCachedChunkBytes)
        : 0;
    const capturedAtMs = nowMs();

    return {
      capturedAt: new Date().toISOString(),
      residency: {
        cachedVolumes: statsSnapshot.cacheSize,
        inFlightVolumes: statsSnapshot.inFlightCount,
        cachedChunks: statsSnapshot.chunkCacheSize,
        inFlightChunks: statsSnapshot.chunkInFlightCount,
        chunkBytes: statsSnapshot.chunkCacheBytes
      },
      cachePressure: {
        volume: volumePressure,
        chunk: chunkPressure
      },
      missRates: {
        volume: volumeLookups > 0 ? statsSnapshot.cacheMisses / volumeLookups : 0,
        chunk: chunkLookups > 0 ? statsSnapshot.chunkCacheMisses / chunkLookups : 0
      },
      activePrefetchRequests: Array.from(activePrefetchRequests.values())
        .map((request) => ({
          id: request.id,
          timepoint: request.timepoint,
          reason: request.reason,
          layerCount: request.layerKeys.length,
          ageMs: Math.max(0, capturedAtMs - request.startedAtMs),
          cancelled: request.cancelled,
          scaleLevels: request.scaleLevels
        }))
        .sort((left, right) => left.id - right.id),
      streaming: {
        scaleRequestCounts: Object.fromEntries(
          Array.from(scaleRequestCounts.entries())
            .sort((left, right) => left[0] - right[0])
            .map(([scaleLevel, requestCount]) => [String(scaleLevel), requestCount])
        ),
        cachedPageTables: brickPageTableCache.size,
        cachedAtlases: brickAtlasCache.size
      },
      stats: statsSnapshot
    };
  };

  const resetStats = () => {
    stats.getVolumeCalls = 0;
    stats.prefetchCalls = 0;
    stats.prefetchSkippedCached = 0;
    stats.prefetchSkippedInFlight = 0;
    stats.prefetchLoadsStarted = 0;
    stats.prefetchLoadsCompleted = 0;
    stats.prefetchLoadsFailed = 0;
    stats.prefetchLoadsCancelled = 0;
    stats.prefetchRequestsAborted = 0;
    stats.cacheHits = 0;
    stats.cacheHitInFlight = 0;
    stats.cacheMisses = 0;
    stats.loadsStarted = 0;
    stats.loadsCompleted = 0;
    stats.loadsFailed = 0;
    stats.bytesRead = 0;
    stats.dataBytesRead = 0;
    stats.labelBytesRead = 0;
    stats.totalLoadMs = 0;
    stats.totalDataReadMs = 0;
    stats.totalLabelReadMs = 0;
    stats.lastLoadMs = null;
    stats.lastDataReadMs = null;
    stats.lastLabelReadMs = null;
    stats.chunkCacheHits = 0;
    stats.chunkCacheHitInFlight = 0;
    stats.chunkCacheMisses = 0;
    stats.chunkReadsStarted = 0;
    stats.chunkReadsCompleted = 0;
    stats.chunkReadsFailed = 0;
    stats.chunkBytesRead = 0;
    stats.chunkCacheEvictions = 0;
    scaleRequestCounts.clear();
  };

  return {
    getVolume,
    getBrickPageTable,
    getBrickAtlas,
    prefetchBrickAtlases,
    prefetch,
    hasVolume,
    hasBrickAtlas,
    clear,
    setMaxCachedVolumes,
    getStats,
    getDiagnostics,
    resetStats
  };
}
