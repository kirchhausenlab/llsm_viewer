import assert from 'node:assert/strict';

import type { AsyncMutable } from '@zarrita/storage';

import { VolumePreprocessingWriter } from '../src/loaders/volumeLoader';

class InMemoryStore implements AsyncMutable {
  private readonly backing = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.backing.get(key);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.backing.set(key, value);
  }

  async getRange(
    key: string,
    options: { offset?: number; length?: number; suffixLength?: number }
  ): Promise<Uint8Array | undefined> {
    const value = this.backing.get(key);
    if (!value) {
      return undefined;
    }

    if (typeof options.suffixLength === 'number') {
      const start = Math.max(0, value.length - options.suffixLength);
      return value.subarray(start);
    }

    const offset = options.offset ?? 0;
    const end = options.length ? offset + options.length : value.length;
    return value.subarray(offset, end);
  }
}

function getZarrContext(zarrArray: object): {
  encode_chunk_key(chunkCoords: number[]): string;
  codec: { decode(chunk: Uint8Array): Promise<{ data: Uint8Array }> };
} {
  const contextSymbol = Object.getOwnPropertySymbols(zarrArray).find(
    (symbol) => symbol.description === 'zarrita.context'
  );
  const zarrContext = contextSymbol ? (zarrArray as Record<symbol, unknown>)[contextSymbol] : undefined;
  if (!zarrContext || typeof zarrContext !== 'object') {
    throw new Error('Failed to access Zarr array context.');
  }
  return zarrContext as {
    encode_chunk_key(chunkCoords: number[]): string;
    codec: { decode(chunk: Uint8Array): Promise<{ data: Uint8Array }> };
  };
}

async function run() {
  const store = new InMemoryStore();
  const metadata = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8' as const,
    bytesPerValue: 1
  };

  const writer = new VolumePreprocessingWriter(store, 0, metadata);

  const slice0 = Uint8Array.from([1, 2, 3, 4]);
  const slice1 = Uint8Array.from([5, 6, 7, 8]);

  await writer.writeSlice(slice0, 0);
  await writer.writeSlice(slice1, 1);
  await writer.finalize();

  const reopened = await writer.reopen();
  const zarrContext = getZarrContext(reopened.array);
  const chunkPath = reopened.array.resolve(zarrContext.encode_chunk_key([0, 0, 0, 0])).path;
  const encodedChunk = await reopened.array.store.get(chunkPath as any);
  const chunk = encodedChunk ? await zarrContext.codec.decode(encodedChunk) : null;
  const values = chunk ? Array.from(chunk.data as Uint8Array).slice(0, 8) : [];

  assert.ok(values.some((value) => value !== 0), 'chunk should contain non-zero values');
  assert.deepEqual(values.slice(0, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
