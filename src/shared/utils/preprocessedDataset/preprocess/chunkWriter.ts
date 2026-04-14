import { throwIfAborted } from '../../abort';
import type { PreprocessedStorage } from '../../../storage/preprocessedStorage';
import { createZarrChunkKeyFromCoords } from '../chunkKey';
import {
  computeExpectedChunkCountForShard,
  createShardCoordKey,
  encodeShardEntries,
  getShardChunkLocationForLayout,
  getShardLayoutForArray,
  isShardedArrayDescriptor,
  type ShardLayout
} from '../sharding';
import type { ZarrArrayDescriptor } from '../types';
import {
  DEFAULT_PREPROCESS_MAX_IN_FLIGHT_WRITES,
  normalizePositiveInteger
} from './config';

type PendingShard = {
  descriptor: ZarrArrayDescriptor;
  layout: ShardLayout;
  shardCoords: number[];
  shardPath: string;
  expectedChunkCount: number;
  entriesByLocalCoords: Map<string, { localChunkCoords: number[]; bytes: Uint8Array }>;
};

export type ChunkWriteDispatcher = {
  writeChunk: (params: {
    descriptor: ZarrArrayDescriptor;
    chunkCoords: readonly number[];
    bytes: Uint8Array;
    signal?: AbortSignal;
  }) => Promise<void>;
  flush: (signal?: AbortSignal) => Promise<void>;
};

export function createChunkWriteDispatcher(
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
