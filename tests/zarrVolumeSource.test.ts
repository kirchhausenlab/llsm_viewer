import assert from 'node:assert/strict';

import { ZarrVolumeSource, type ZarrMipLevel } from '../src/data/ZarrVolumeSource.ts';

console.log('Starting ZarrVolumeSource tests');

const createMockArray = (resolverList?: Array<() => void>) => {
  const array = {
    chunks: [1, 1, 1, 1] as const,
    dtype: '|u1',
    shape: [4, 4, 4, 4] as const,
    getChunk: (coords: number[]) => {
      if (resolverList) {
        return new Promise<Uint8Array>((resolve) => {
          resolverList.push(() => resolve(new Uint8Array([coords[3] ?? 0])));
        });
      }
      return Promise.resolve(new Uint8Array([coords[3] ?? 0]));
    }
  } satisfies Partial<ZarrMipLevel['array']>;
  return array as ZarrMipLevel['array'];
};

try {
  const evictionLevel: ZarrMipLevel = {
    level: 0,
    array: createMockArray(),
    dataType: 'uint8',
    shape: [4, 4, 4, 4],
    chunkShape: [1, 1, 1, 1]
  };

  const evictionSource = new ZarrVolumeSource([evictionLevel], { cacheSizeBytes: 2 });
  await evictionSource.readChunk(0, [0, 0, 0, 0]);
  await evictionSource.readChunk(0, [0, 0, 0, 1]);
  await evictionSource.readChunk(0, [0, 0, 0, 2]);

  const cacheKeys = evictionSource.getCachedKeys();
  assert.ok(cacheKeys.includes('0:0,0,0,1'));
  assert.ok(cacheKeys.includes('0:0,0,0,2'));
  assert.ok(!cacheKeys.includes('0:0,0,0,0'));

  const resolvers: Array<() => void> = [];
  const slowArray = createMockArray(resolvers);
  let fetchCalls = 0;
  const slowLevel: ZarrMipLevel = {
    level: 0,
    array: {
      ...slowArray,
      getChunk: (coords: number[]) => {
        fetchCalls += 1;
        return slowArray.getChunk(coords);
      }
    },
    dataType: 'uint8',
    shape: [4, 4, 4, 4],
    chunkShape: [1, 1, 1, 1]
  };

  const cancellationSource = new ZarrVolumeSource([slowLevel], { maxConcurrency: 1 });
  const first = cancellationSource.readChunk(0, [0, 0, 0, 0]);
  const controller = new AbortController();
  const pending = cancellationSource.readChunk(0, [0, 0, 0, 1], { signal: controller.signal });
  controller.abort();
  resolvers.shift()?.();
  await first;

  await assert.rejects(pending, (error) => error?.name === 'AbortError');
  assert.equal(fetchCalls, 1);

  console.log('ZarrVolumeSource tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
