import assert from 'node:assert/strict';

import { create, root } from 'zarrita';
import type { AsyncMutable } from '@zarrita/storage';

import { buildMipmaps } from '../src/data/mipmapBuilder';
import { openArrayAt } from '../src/data/zarr';
import type { VolumeChunkShape } from '../src/data/zarrLayout';

console.log('Starting mipmap builder tests');

class InMemoryStore implements AsyncMutable {
  private readonly backing = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | undefined> {
    return this.backing.get(key);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.backing.set(key, value);
  }
}

function getZarrContext(zarrArray: object): {
  chunk_shape: VolumeChunkShape;
  encode_chunk_key(chunkCoords: number[]): string;
  codec: {
    encode(chunk: { data: Uint8Array; shape: number[]; stride: number[] }): Promise<Uint8Array>;
  };
  get_strides(shape: number[]): number[];
} {
  const contextSymbol = Object.getOwnPropertySymbols(zarrArray).find(
    (symbol) => symbol.description === 'zarrita.context'
  );
  const zarrContext = contextSymbol ? (zarrArray as Record<symbol, unknown>)[contextSymbol] : undefined;
  if (!zarrContext || typeof zarrContext !== 'object') {
    throw new Error('Failed to access Zarr array context.');
  }
  return zarrContext as {
    chunk_shape: VolumeChunkShape;
    encode_chunk_key(chunkCoords: number[]): string;
    codec: {
      encode(chunk: { data: Uint8Array; shape: number[]; stride: number[] }): Promise<Uint8Array>;
    };
    get_strides(shape: number[]): number[];
  };
}

try {
  const store = new InMemoryStore();
  const base = await create(root(store).resolve('/0'), {
    shape: [1, 2, 2, 2],
    data_type: 'uint8',
    chunk_shape: [1, 2, 2, 2],
    codecs: []
  });

  const context = getZarrContext(base);
  const stride = context.get_strides(context.chunk_shape);
  const data = new Uint8Array(8);
  const setVoxel = (z: number, y: number, x: number, value: number) => {
    const index = 0 * stride[0] + z * stride[1] + y * stride[2] + x * stride[3];
    data[index] = value;
  };

  setVoxel(0, 0, 0, 1);
  setVoxel(0, 0, 1, 2);
  setVoxel(0, 1, 0, 3);
  setVoxel(0, 1, 1, 4);
  setVoxel(1, 0, 0, 5);
  setVoxel(1, 0, 1, 6);
  setVoxel(1, 1, 0, 7);
  setVoxel(1, 1, 1, 8);

  const encoded = await context.codec.encode({ data, shape: context.chunk_shape, stride });
  const chunkPath = base.resolve(context.encode_chunk_key([0, 0, 0, 0])).path;
  await base.store.set(chunkPath as any, encoded);

  const result = await buildMipmaps({
    store,
    basePath: '/0',
    targetMaxDimension: 1,
    histogramBins: 8
  });

  assert.deepEqual(result.levels, ['/mipmaps/0/level-1']);
  const mipArray = await openArrayAt(store, '/mipmaps/0/level-1');
  const mipChunk = await mipArray.getChunk([0, 0, 0, 0]);
  assert.strictEqual(mipChunk.data[0], 8);

  const rootMetadataRaw = await store.get('/zarr.json');
  assert.ok(rootMetadataRaw, 'root metadata should be written');
  const rootMetadata = JSON.parse(new TextDecoder().decode(rootMetadataRaw!));
  const stats = (rootMetadata.attributes?.stats ?? {})['/0'];
  assert.ok(Array.isArray(stats));
  const channelStats = stats[0];
  assert.strictEqual(channelStats.min, 1);
  assert.strictEqual(channelStats.max, 8);
  assert.strictEqual(channelStats.histogram.counts.reduce((sum: number, value: number) => sum + value, 0), 8);

  const analyticsMetadataRaw = await store.get('/analytics/zarr.json');
  assert.ok(analyticsMetadataRaw, 'analytics group should be written');
  const analytics = JSON.parse(new TextDecoder().decode(analyticsMetadataRaw!));
  assert.ok(analytics.attributes?.histograms?.['/0']);

  console.log('mipmap builder tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
