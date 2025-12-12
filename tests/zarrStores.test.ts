import assert from 'node:assert/strict';

import { createFetchStore, KeyedFileStore, readRangeFromStore } from '../src/data/zarr.ts';

console.log('Starting zarr store tests');

function readRangeHeader(init?: RequestInit): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return headers.get('Range') ?? undefined;
  }
  if (Array.isArray(headers)) {
    const entry = headers.find(([key]) => key.toLowerCase() === 'range');
    return entry?.[1];
  }
  const record = headers as Record<string, string>;
  return record.Range ?? record.range;
}

try {
  const payload = new Uint8Array([0, 1, 2, 3, 4, 5]);
  const store = new KeyedFileStore({ '/chunks/0': new Blob([payload]) });

  const slice = await readRangeFromStore(store, '/chunks/0', { offset: 2, length: 3 });
  assert.deepEqual(Array.from(slice ?? []), [2, 3, 4]);

  const suffix = await readRangeFromStore(store, '/chunks/0', { suffixLength: 2 });
  assert.deepEqual(Array.from(suffix ?? []), [4, 5]);

  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    if (init?.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { 'Content-Length': '10' } });
    }
    return new Response(new Uint8Array([9, 8, 7, 6]), { status: 206 });
  }) as typeof fetch;

  try {
    const remote = createFetchStore('https://example.com/data', { useSuffixRequest: true });
    await readRangeFromStore(remote, '/0.shard', { suffixLength: 4 });
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(readRangeHeader(requests[0]?.init), 'bytes=-4');

    requests.length = 0;
    const offsetStore = createFetchStore('https://example.com/data');
    await readRangeFromStore(offsetStore, '/0.shard', { offset: 2, length: 2 });
    assert.strictEqual(requests.length, 1);
    assert.strictEqual(readRangeHeader(requests[0]?.init), 'bytes=2-3');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('zarr store tests passed');
} catch (error) {
  console.error(error);
  process.exit(1);
}
