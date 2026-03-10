import type { ZarrArrayDescriptor } from './types';

export type ShardLayout = {
  chunkCounts: number[];
  chunksPerShard: number[];
  shardCounts: number[];
};

export type ShardChunkLocation = {
  shardCoords: number[];
  localChunkCoords: number[];
  shardPath: string;
};

export type ShardEntry = {
  localChunkCoords: number[];
  bytes: Uint8Array;
};

type EncodedShardHeader = {
  v: 1;
  r: number;
  e: Array<{
    k: string;
    o: number;
    l: number;
  }>;
};

const shardHeaderEncoder = new TextEncoder();
const shardHeaderDecoder = new TextDecoder();

function normalizeInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || Math.floor(value) !== value) {
    throw new Error(`Invalid ${label}: expected integer, got ${value}.`);
  }
  return value;
}

function assertNonNegativeInteger(value: number, label: string): number {
  const normalized = normalizeInteger(value, label);
  if (normalized < 0) {
    throw new Error(`Invalid ${label}: expected non-negative integer, got ${value}.`);
  }
  return normalized;
}

function assertPositiveInteger(value: number, label: string): number {
  const normalized = assertNonNegativeInteger(value, label);
  if (normalized <= 0) {
    throw new Error(`Invalid ${label}: expected positive integer, got ${value}.`);
  }
  return normalized;
}

export function isShardedArrayDescriptor(descriptor: ZarrArrayDescriptor): boolean {
  return Boolean(descriptor.sharding?.enabled);
}

export function createShardCoordKey(coords: readonly number[]): string {
  if (coords.length === 0) {
    throw new Error('Shard coordinate key cannot be built from empty coordinates.');
  }
  return coords.join('/');
}

export function createShardEntryKey(localChunkCoords: readonly number[]): string {
  if (localChunkCoords.length === 0) {
    throw new Error('Shard entry key cannot be built from empty local chunk coordinates.');
  }
  return localChunkCoords.join(',');
}

export function createShardFilePath(arrayPath: string, shardCoords: readonly number[]): string {
  const shardKey = createShardCoordKey(shardCoords);
  return `${arrayPath}/shards/${shardKey}.shard`;
}

export function getShardLayoutForArray(descriptor: ZarrArrayDescriptor): ShardLayout | null {
  const sharding = descriptor.sharding;
  if (!sharding?.enabled) {
    return null;
  }
  if (descriptor.shape.length === 0) {
    throw new Error(`Invalid sharded descriptor ${descriptor.path}: shape rank must be > 0.`);
  }
  if (descriptor.shape.length !== descriptor.chunkShape.length) {
    throw new Error(`Invalid sharded descriptor ${descriptor.path}: shape/chunk rank mismatch.`);
  }
  if (descriptor.shape.length !== sharding.shardShape.length) {
    throw new Error(`Invalid sharded descriptor ${descriptor.path}: shard rank mismatch.`);
  }

  const chunkCounts = descriptor.shape.map((shapeDim, axis) => {
    const shape = assertPositiveInteger(shapeDim, `${descriptor.path}.shape[${axis}]`);
    const chunk = assertPositiveInteger(descriptor.chunkShape[axis] ?? 0, `${descriptor.path}.chunkShape[${axis}]`);
    return Math.ceil(shape / chunk);
  });

  const chunksPerShard = descriptor.chunkShape.map((chunkDim, axis) => {
    const chunk = assertPositiveInteger(chunkDim, `${descriptor.path}.chunkShape[${axis}]`);
    const shard = assertPositiveInteger(sharding.shardShape[axis] ?? 0, `${descriptor.path}.shardShape[${axis}]`);
    if (shard % chunk !== 0) {
      throw new Error(
        `Invalid sharded descriptor ${descriptor.path}: shardShape[${axis}] (${shard}) must be divisible by chunkShape[${axis}] (${chunk}).`
      );
    }
    return Math.max(1, shard / chunk);
  });

  const shardCounts = chunkCounts.map((chunkCount, axis) =>
    Math.ceil(chunkCount / (chunksPerShard[axis] ?? 1))
  );

  return { chunkCounts, chunksPerShard, shardCounts };
}

export function getShardChunkLocation(
  descriptor: ZarrArrayDescriptor,
  chunkCoords: readonly number[]
): ShardChunkLocation {
  const layout = getShardLayoutForArray(descriptor);
  if (!layout) {
    throw new Error(`Descriptor ${descriptor.path} is not sharded.`);
  }
  return getShardChunkLocationForLayout(descriptor, layout, chunkCoords);
}

export function getShardChunkLocationForLayout(
  descriptor: ZarrArrayDescriptor,
  layout: ShardLayout,
  chunkCoords: readonly number[]
): ShardChunkLocation {
  if (chunkCoords.length !== descriptor.shape.length) {
    throw new Error(
      `Chunk coordinate rank mismatch for ${descriptor.path}: expected ${descriptor.shape.length}, got ${chunkCoords.length}.`
    );
  }

  const shardCoords = new Array<number>(chunkCoords.length);
  const localChunkCoords = new Array<number>(chunkCoords.length);

  for (let axis = 0; axis < chunkCoords.length; axis += 1) {
    const coord = assertNonNegativeInteger(chunkCoords[axis] ?? 0, `${descriptor.path}.chunkCoords[${axis}]`);
    const chunkCount = layout.chunkCounts[axis] ?? 0;
    if (coord >= chunkCount) {
      throw new Error(
        `Chunk coordinate out of bounds for ${descriptor.path} on axis ${axis}: ${coord} >= ${chunkCount}.`
      );
    }
    const perShard = layout.chunksPerShard[axis] ?? 1;
    const shardCoord = Math.floor(coord / perShard);
    const localCoord = coord - shardCoord * perShard;
    shardCoords[axis] = shardCoord;
    localChunkCoords[axis] = localCoord;
  }

  return {
    shardCoords,
    localChunkCoords,
    shardPath: createShardFilePath(descriptor.path, shardCoords)
  };
}

export function computeExpectedChunkCountForShard(
  layout: ShardLayout,
  shardCoords: readonly number[]
): number {
  if (shardCoords.length !== layout.chunkCounts.length) {
    throw new Error(
      `Shard coordinate rank mismatch: expected ${layout.chunkCounts.length}, got ${shardCoords.length}.`
    );
  }
  let expectedCount = 1;
  for (let axis = 0; axis < shardCoords.length; axis += 1) {
    const shardCoord = assertNonNegativeInteger(shardCoords[axis] ?? 0, `shardCoords[${axis}]`);
    const chunkCount = layout.chunkCounts[axis] ?? 0;
    const perShard = layout.chunksPerShard[axis] ?? 1;
    const shardCount = layout.shardCounts[axis] ?? 0;
    if (shardCoord >= shardCount) {
      throw new Error(`Shard coordinate out of bounds on axis ${axis}: ${shardCoord} >= ${shardCount}.`);
    }
    const firstChunk = shardCoord * perShard;
    const remaining = Math.max(0, chunkCount - firstChunk);
    const axisChunkCount = Math.min(perShard, remaining);
    expectedCount *= axisChunkCount;
  }
  return expectedCount;
}

export function encodeShardEntries(rank: number, entries: ShardEntry[]): Uint8Array {
  const normalizedRank = assertPositiveInteger(rank, 'shard rank');
  if (entries.length === 0) {
    throw new Error('Cannot encode shard with no entries.');
  }

  const sortedEntries = [...entries].sort((left, right) =>
    createShardEntryKey(left.localChunkCoords).localeCompare(createShardEntryKey(right.localChunkCoords))
  );

  const manifestEntries: EncodedShardHeader['e'] = [];
  let payloadLength = 0;
  const seenKeys = new Set<string>();
  for (const entry of sortedEntries) {
    if (entry.localChunkCoords.length !== normalizedRank) {
      throw new Error(
        `Shard entry rank mismatch: expected ${normalizedRank}, got ${entry.localChunkCoords.length}.`
      );
    }
    const key = createShardEntryKey(entry.localChunkCoords);
    if (seenKeys.has(key)) {
      throw new Error(`Duplicate shard entry key detected: ${key}`);
    }
    seenKeys.add(key);
    manifestEntries.push({
      k: key,
      o: payloadLength,
      l: entry.bytes.byteLength
    });
    payloadLength += entry.bytes.byteLength;
  }

  const header: EncodedShardHeader = {
    v: 1,
    r: normalizedRank,
    e: manifestEntries
  };
  const headerBytes = shardHeaderEncoder.encode(JSON.stringify(header));
  const output = new Uint8Array(4 + headerBytes.byteLength + payloadLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, headerBytes.byteLength, true);
  output.set(headerBytes, 4);

  let payloadOffset = 4 + headerBytes.byteLength;
  for (const entry of sortedEntries) {
    output.set(entry.bytes, payloadOffset);
    payloadOffset += entry.bytes.byteLength;
  }
  return output;
}

export type ShardEntryIndex = {
  rank: number;
  payloadStart: number;
  entries: Map<string, { offset: number; length: number }>;
};

function parseShardHeaderFromBytes(shardBytes: Uint8Array): { header: EncodedShardHeader; payloadStart: number } {
  if (shardBytes.byteLength < 4) {
    throw new Error('Invalid shard file: missing header length.');
  }
  const view = new DataView(shardBytes.buffer, shardBytes.byteOffset, shardBytes.byteLength);
  const headerLength = view.getUint32(0, true);
  const payloadStart = 4 + headerLength;
  if (payloadStart > shardBytes.byteLength) {
    throw new Error('Invalid shard file: header exceeds file size.');
  }

  const headerBytes = shardBytes.subarray(4, payloadStart);
  const headerText = shardHeaderDecoder.decode(headerBytes);
  const parsed = JSON.parse(headerText) as Partial<EncodedShardHeader>;
  if (parsed.v !== 1) {
    throw new Error(`Unsupported shard format version: ${String(parsed.v)}.`);
  }
  if (!Array.isArray(parsed.e)) {
    throw new Error('Invalid shard file: missing entry index.');
  }
  if (!Number.isFinite(parsed.r ?? Number.NaN)) {
    throw new Error('Invalid shard file: missing rank.');
  }

  return {
    header: parsed as EncodedShardHeader,
    payloadStart
  };
}

function parseShardHeaderText(headerText: string, payloadStart: number): ShardEntryIndex {
  const parsed = JSON.parse(headerText) as Partial<EncodedShardHeader>;
  if (parsed.v !== 1) {
    throw new Error(`Unsupported shard format version: ${String(parsed.v)}.`);
  }
  if (!Array.isArray(parsed.e)) {
    throw new Error('Invalid shard file: missing entry index.');
  }
  const rank = assertPositiveInteger(parsed.r ?? Number.NaN, 'shard rank');
  const entries = new Map<string, { offset: number; length: number }>();
  for (const entry of parsed.e) {
    const key = String(entry.k ?? '');
    if (!key) {
      throw new Error('Invalid shard file: empty entry key.');
    }
    const offset = assertNonNegativeInteger(entry.o ?? Number.NaN, `entry offset for ${key}`);
    const length = assertNonNegativeInteger(entry.l ?? Number.NaN, `entry length for ${key}`);
    entries.set(key, { offset, length });
  }
  return {
    rank,
    payloadStart,
    entries
  };
}

export function parseShardEntryIndex(shardBytes: Uint8Array): ShardEntryIndex {
  const { header, payloadStart } = parseShardHeaderFromBytes(shardBytes);
  const entries = new Map<string, { offset: number; length: number }>();
  for (const entry of header.e) {
    const key = String(entry.k ?? '');
    if (!key) {
      throw new Error('Invalid shard file: empty entry key.');
    }
    const offset = assertNonNegativeInteger(entry.o, `entry offset for ${key}`);
    const length = assertNonNegativeInteger(entry.l, `entry length for ${key}`);
    entries.set(key, { offset, length });
  }
  return {
    rank: header.r,
    payloadStart,
    entries
  };
}

export function parseShardEntryIndexFromHeaderBytes(
  headerBytes: Uint8Array,
  payloadStart: number
): ShardEntryIndex {
  const headerText = shardHeaderDecoder.decode(headerBytes);
  return parseShardHeaderText(headerText, payloadStart);
}

export function decodeShardEntryFromIndex({
  shardBytes,
  rank,
  localChunkCoords,
  entryIndex
}: {
  shardBytes: Uint8Array;
  rank: number;
  localChunkCoords: readonly number[];
  entryIndex: ShardEntryIndex;
}): Uint8Array {
  const normalizedRank = assertPositiveInteger(rank, 'shard rank');
  if (localChunkCoords.length !== normalizedRank) {
    throw new Error(
      `Local chunk coordinate rank mismatch: expected ${normalizedRank}, got ${localChunkCoords.length}.`
    );
  }
  if (entryIndex.rank !== normalizedRank) {
    throw new Error(`Shard rank mismatch: expected ${normalizedRank}, got ${entryIndex.rank}.`);
  }
  const targetKey = createShardEntryKey(localChunkCoords);
  const entry = entryIndex.entries.get(targetKey);
  if (!entry) {
    throw new Error(`Shard entry not found for local chunk ${targetKey}.`);
  }
  const byteStart = entryIndex.payloadStart + entry.offset;
  const byteEnd = byteStart + entry.length;
  if (byteEnd > shardBytes.byteLength) {
    throw new Error(`Shard entry range for ${targetKey} exceeds shard payload bounds.`);
  }
  return shardBytes.slice(byteStart, byteEnd);
}

export function decodeShardEntry({
  shardBytes,
  rank,
  localChunkCoords
}: {
  shardBytes: Uint8Array;
  rank: number;
  localChunkCoords: readonly number[];
}): Uint8Array {
  const normalizedRank = assertPositiveInteger(rank, 'shard rank');
  if (localChunkCoords.length !== normalizedRank) {
    throw new Error(
      `Local chunk coordinate rank mismatch: expected ${normalizedRank}, got ${localChunkCoords.length}.`
    );
  }
  const entryIndex = parseShardEntryIndex(shardBytes);
  return decodeShardEntryFromIndex({
    shardBytes,
    rank,
    localChunkCoords,
    entryIndex
  });
}
