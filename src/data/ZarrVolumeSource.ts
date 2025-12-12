import type { MinimalZarrArray } from './zarr';
import { createWritableVolumeArray, getBytesPerValue, type VolumeDataType, type VolumeTypedArray } from '../types/volume';

export type ZarrMipLevel = {
  level: number;
  array: MinimalZarrArray;
  dataType: VolumeDataType;
  shape: [number, number, number, number];
  chunkShape: [number, number, number, number];
};

export type RegionRequest = {
  mipLevel: number;
  offset: [number, number, number, number];
  shape: [number, number, number, number];
  signal?: AbortSignal;
  priorityCenter?: [number, number, number, number];
};

type ChunkCoords = [number, number, number, number];

type CacheEntry = { key: string; bytes: number; value: VolumeTypedArray };

type PendingTask = {
  priority: number;
  key: string;
  run: () => Promise<VolumeTypedArray>;
  signal?: AbortSignal;
  reject: (reason: unknown) => void;
  resolve: (value: VolumeTypedArray) => void;
};

const createAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Aborted', 'AbortError');
  }
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

function computeStrides(shape: readonly number[]): number[] {
  const strides = new Array(shape.length).fill(1);
  for (let i = shape.length - 2; i >= 0; i -= 1) {
    strides[i] = strides[i + 1] * shape[i + 1];
  }
  return strides;
}

function distanceSquared(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = a[i] - b[i];
    total += delta * delta;
  }
  return total;
}

export class ZarrVolumeSource {
  private readonly mips: Map<number, ZarrMipLevel>;
  private readonly cacheLimitBytes: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly queue: PendingTask[] = [];
  private readonly maxConcurrency: number;
  private inFlight = 0;

  constructor(levels: ZarrMipLevel[], options?: { cacheSizeBytes?: number; maxConcurrency?: number }) {
    this.mips = new Map(levels.map((level) => [level.level, level]));
    this.cacheLimitBytes = options?.cacheSizeBytes ?? 64 * 1024 * 1024;
    this.maxConcurrency = options?.maxConcurrency ?? 4;
  }

  getMip(level: number): ZarrMipLevel {
    const mip = this.mips.get(level);
    if (!mip) {
      throw new Error(`Mip level ${level} is not available`);
    }
    return mip;
  }

  getCachedKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  getMipLevels(): number[] {
    return Array.from(this.mips.keys()).sort((a, b) => a - b);
  }

  async readChunk(
    mipLevel: number,
    coords: ChunkCoords,
    options?: { signal?: AbortSignal; priorityCenter?: ChunkCoords }
  ): Promise<VolumeTypedArray> {
    const cacheKey = this.getChunkKey(mipLevel, coords);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.value;
    }

    if (options?.signal?.aborted) {
      throw createAbortError();
    }

    return new Promise<VolumeTypedArray>((resolve, reject) => {
      const priority = this.computePriority(mipLevel, coords, options?.priorityCenter);
      const task: PendingTask = {
        priority,
        key: cacheKey,
        signal: options?.signal,
        resolve,
        reject,
        run: () => this.fetchChunk(mipLevel, coords, options?.signal)
      };
      this.enqueue(task);
    });
  }

  async readRegion(request: RegionRequest): Promise<VolumeTypedArray> {
    const level = this.getMip(request.mipLevel);
    const [cSize, zSize, ySize, xSize] = request.shape;
    const destination = createWritableVolumeArray(level.dataType, cSize * zSize * ySize * xSize);
    const destStrides = computeStrides(request.shape);

    const chunkRanges = request.offset.map((start, index) => {
      const size = request.shape[index];
      const chunk = level.chunkShape[index];
      return {
        startChunk: Math.floor(start / chunk),
        endChunk: Math.floor((start + size - 1) / chunk)
      };
    }) as Array<{ startChunk: number; endChunk: number }>;

    const pending: Array<Promise<void>> = [];
    for (let c = chunkRanges[0].startChunk; c <= chunkRanges[0].endChunk; c += 1) {
      for (let z = chunkRanges[1].startChunk; z <= chunkRanges[1].endChunk; z += 1) {
        for (let y = chunkRanges[2].startChunk; y <= chunkRanges[2].endChunk; y += 1) {
          for (let x = chunkRanges[3].startChunk; x <= chunkRanges[3].endChunk; x += 1) {
            const coords: ChunkCoords = [c, z, y, x];
            const priorityCenter = request.priorityCenter ?? coords;
            pending.push(
              this.readChunk(request.mipLevel, coords, {
                signal: request.signal,
                priorityCenter,
              }).then((chunk) => {
                this.copyChunkIntoDestination({
                  chunk,
                  chunkCoords: coords,
                  destination,
                  destStrides,
                  request,
                  level,
                });
              })
            );
          }
        }
      }
    }

    await Promise.all(pending);
    return destination;
  }

  private copyChunkIntoDestination(params: {
    chunk: VolumeTypedArray;
    chunkCoords: ChunkCoords;
    destination: VolumeTypedArray;
    destStrides: number[];
    request: RegionRequest;
    level: ZarrMipLevel;
  }) {
    const { chunk, chunkCoords, destination, destStrides, request, level } = params;
    const { chunkShape } = level;
    const chunkStrides = computeStrides(chunkShape);
    const [cOffset, zOffset, yOffset, xOffset] = request.offset;
    const [cSize, zSize, ySize, xSize] = request.shape;

    const baseC = chunkCoords[0] * chunkShape[0];
    const baseZ = chunkCoords[1] * chunkShape[1];
    const baseY = chunkCoords[2] * chunkShape[2];
    const baseX = chunkCoords[3] * chunkShape[3];

    for (let localC = 0; localC < chunkShape[0]; localC += 1) {
      const globalC = baseC + localC;
      if (globalC < cOffset || globalC >= cOffset + cSize) continue;
      for (let localZ = 0; localZ < chunkShape[1]; localZ += 1) {
        const globalZ = baseZ + localZ;
        if (globalZ < zOffset || globalZ >= zOffset + zSize) continue;
        for (let localY = 0; localY < chunkShape[2]; localY += 1) {
          const globalY = baseY + localY;
          if (globalY < yOffset || globalY >= yOffset + ySize) continue;
          for (let localX = 0; localX < chunkShape[3]; localX += 1) {
            const globalX = baseX + localX;
            if (globalX < xOffset || globalX >= xOffset + xSize) continue;

            const chunkIndex =
              localC * chunkStrides[0] +
              localZ * chunkStrides[1] +
              localY * chunkStrides[2] +
              localX * chunkStrides[3];
            const destIndex =
              (globalC - cOffset) * destStrides[0] +
              (globalZ - zOffset) * destStrides[1] +
              (globalY - yOffset) * destStrides[2] +
              (globalX - xOffset) * destStrides[3];

            destination[destIndex] = chunk[chunkIndex];
          }
        }
      }
    }
  }

  private async fetchChunk(mipLevel: number, coords: ChunkCoords, signal?: AbortSignal): Promise<VolumeTypedArray> {
    const level = this.getMip(mipLevel);
    if (signal?.aborted) {
      throw createAbortError();
    }
    const chunk = await level.array.getChunk(coords as any);
    if (signal?.aborted) {
      throw createAbortError();
    }
    const data = (chunk as any).data ?? chunk;
    const cacheKey = this.getChunkKey(mipLevel, coords);
    const bytes =
      (data as VolumeTypedArray).byteLength ?? data.length * getBytesPerValue(level.dataType);
    this.insertCacheEntry(cacheKey, bytes, data as VolumeTypedArray);
    return data as VolumeTypedArray;
  }

  private getChunkKey(mip: number, coords: ChunkCoords): string {
    return `${mip}:${coords.join(',')}`;
  }

  private insertCacheEntry(key: string, bytes: number, value: VolumeTypedArray) {
    if (bytes > this.cacheLimitBytes) {
      return;
    }
    this.cache.set(key, { key, bytes, value });
    this.enforceCacheLimit();
  }

  private enforceCacheLimit() {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.bytes;
    }
    const entries = Array.from(this.cache.entries());
    let index = 0;
    while (total > this.cacheLimitBytes && index < entries.length) {
      const [oldestKey, oldestEntry] = entries[index];
      this.cache.delete(oldestKey);
      total -= oldestEntry.bytes;
      index += 1;
    }
  }

  private computePriority(mipLevel: number, coords: ChunkCoords, center?: ChunkCoords): number {
    const mipBias = mipLevel * 1_000_000;
    const dist = center ? distanceSquared(coords, center) : 0;
    return mipBias + dist;
  }

  private enqueue(task: PendingTask) {
    const insertIndex = this.queue.findIndex((existing) => task.priority < existing.priority);
    if (insertIndex === -1) {
      this.queue.push(task);
    } else {
      this.queue.splice(insertIndex, 0, task);
    }
    this.pumpQueue();
  }

  private pumpQueue() {
    while (this.inFlight < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.signal?.aborted) {
        next.reject(createAbortError());
        continue;
      }
      this.inFlight += 1;
      const onAbort = () => {
        next.reject(createAbortError());
      };
      next.signal?.addEventListener('abort', onAbort, { once: true });

      next
        .run()
        .then((value) => {
          if (next.signal?.aborted) {
            next.reject(createAbortError());
            return;
          }
          next.resolve(value);
        })
        .catch((error) => next.reject(error))
        .finally(() => {
          this.inFlight -= 1;
          next.signal?.removeEventListener('abort', onAbort);
          this.pumpQueue();
        });
    }
  }
}
