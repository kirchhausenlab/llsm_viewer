import assert from 'node:assert/strict';

console.log('Starting volume loader tests');

class StubWorker implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
  onerror: ((this: Worker, ev: ErrorEvent) => any) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
  addEventListener: Worker['addEventListener'] = () => undefined as any;
  dispatchEvent: Worker['dispatchEvent'] = () => false;
  removeEventListener: Worker['removeEventListener'] = () => undefined as any;

  constructor(private readonly script: (worker: StubWorker, message: any) => void) {}

  postMessage(message: any) {
    this.script(this, message);
  }

  terminate() {
    this.terminated = true;
  }

  closed = false;
  readonly name = 'stub-worker';
  readonly self: Worker = this;
  terminated = false;
}

class MemoryStore {
  private readonly data = new Map<string, Uint8Array>();

  constructor() {
    const rootDescriptor = { zarr_format: 3, node_type: 'group' };
    const encoded = new TextEncoder().encode(JSON.stringify(rootDescriptor));
    this.data.set('/zarr.json', encoded);
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    const value = this.data.get(this.normalize(key));
    return value ? new Uint8Array(value) : undefined;
  }

  async getRange(key: string, range: { offset: number; length: number }): Promise<Uint8Array | undefined> {
    const value = await this.get(this.normalize(key));
    if (!value) return undefined;
    const start = Math.max(0, range.offset);
    const end = Math.min(value.length, start + range.length);
    return value.slice(start, end);
  }

  async set(key: string, value: Uint8Array): Promise<void> {
    this.data.set(this.normalize(key), new Uint8Array(value));
  }

  async del(key: string): Promise<void> {
    this.data.delete(this.normalize(key));
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  listKeys(): string[] {
    return Array.from(this.data.keys());
  }

  private normalize(key: string): string {
    return key.startsWith('/') ? key : `/${key}`;
  }
}

function buildWorker(options: {
  metadata: { width: number; height: number; depth: number; channels: number; dataType: 'uint8' };
  slices: Uint8Array[];
  sliceCountOverride?: number;
}) {
  return () =>
    new StubWorker((worker, message: any) => {
      const requestId = message.requestId;
      const { metadata, slices, sliceCountOverride } = options;
      queueMicrotask(() => {
        worker.onmessage?.({ data: { type: 'volume-start', requestId, index: 0, metadata: { ...metadata, bytesPerValue: 1 } } });
        slices.forEach((slice, sliceIndex) => {
          worker.onmessage?.({
            data: {
              type: 'volume-slice',
              requestId,
              index: 0,
              sliceIndex,
              sliceCount: sliceCountOverride ?? slices.length,
              min: 0,
              max: 1,
              buffer: slice.buffer
            }
          });
        });
        worker.onmessage?.({
          data: {
            type: 'volume-loaded',
            requestId,
            index: 0,
            metadata: { ...metadata, min: 0, max: 1 }
          }
        });
        worker.onmessage?.({ data: { type: 'complete', requestId } });
      });
    });
}

(async () => {
  (import.meta as any).env = { VITE_STREAMING_BYTE_THRESHOLD: '8' };
  process.env.VITE_STREAMING_BYTE_THRESHOLD = '8';
  const { loadVolumesFromFiles } = await import('../src/loaders/volumeLoader.ts');

  const baseMetadata = { width: 2, height: 2, channels: 1, dataType: 'uint8' as const };

    const [bufferedVolume] = await loadVolumesFromFiles(
      [new File(['buffered'], 'buffered.tiff')],
      {},
      {
        workerFactory: buildWorker({
          metadata: { ...baseMetadata, depth: 1 },
          slices: [new Uint8Array([1, 2, 3, 4])]
        }),
        streamingByteThreshold: 16
      }
    );
    assert.ok(bufferedVolume);
    assert.strictEqual(bufferedVolume.data.byteLength, 4);
  assert.deepEqual(Array.from(new Uint8Array(bufferedVolume.data)), [1, 2, 3, 4]);

  const streamingStore = new MemoryStore();
  let preprocessingCalled = false;
  const streamingVolume = await loadVolumesFromFiles(
    [new File(['streaming'], 'streaming.tiff')],
    {
      preprocessingHooks: {
        onPreprocessingComplete: async (result) => {
          preprocessingCalled = true;
          assert.ok(result.arrays.length > 0);
          const keys = streamingStore.listKeys();
          assert.ok(keys.length > 1);
        }
      }
    },
    {
      workerFactory: buildWorker({
        metadata: { ...baseMetadata, depth: 2 },
        slices: [new Uint8Array([5, 6, 7, 8]), new Uint8Array([9, 10, 11, 12])]
      }),
      streamingByteThreshold: 4,
      preprocessingStoreFactory: async () => streamingStore
    }
  );

  assert.strictEqual(streamingVolume[0].data.byteLength, 0);
  assert.ok(preprocessingCalled);

  const failingStore = new MemoryStore();
  await assert.rejects(
    loadVolumesFromFiles(
      [new File(['undersized'], 'undersized.tiff')],
      {},
      {
        workerFactory: buildWorker({
          metadata: { ...baseMetadata, depth: 2 },
          slices: [new Uint8Array([1, 1, 1, 1])],
          sliceCountOverride: 2
        }),
        streamingByteThreshold: 4,
        preprocessingStoreFactory: async () => failingStore
      }
    ),
    (error: any) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /completed with 1 of 2 slices/);
      return true;
    }
  );
  assert.deepEqual(failingStore.listKeys(), []);

  const defaultStore = new MemoryStore();
  const [defaultStreamingVolume] = await loadVolumesFromFiles(
    [new File(['default'], 'default.tiff')],
    {},
    {
      workerFactory: buildWorker({
        metadata: { ...baseMetadata, depth: 3 },
        slices: [new Uint8Array([13, 14, 15, 16]), new Uint8Array([17, 18, 19, 20]), new Uint8Array([21, 22, 23, 24])]
      }),
      preprocessingStoreFactory: async () => defaultStore
    }
  );

  assert.strictEqual(defaultStreamingVolume.data.byteLength, 0);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

console.log('Starting volume loader worker slice validation tests');

(async () => {
  const previousSelf = (globalThis as any).self;

  let resolveCompletion: (() => void) | undefined;
  const onComplete = new Promise<void>((resolve, reject) => {
    resolveCompletion = resolve;
    setTimeout(() => reject(new Error('Timed out waiting for worker error')), 1000);
  });

  const workerMessages: any[] = [];
  const workerErrors: any[] = [];

  const mockSelf: any = {
    navigator: { hardwareConcurrency: 1 },
    onmessage: null,
    postMessage: (message: any) => {
      if (message.type === 'volume-loaded') {
        workerMessages.push(message);
      }
      if (message.type === 'error') {
        workerErrors.push(message);
        resolveCompletion?.();
      }
    }
  };

  (globalThis as any).self = mockSelf;

  const { __TEST_ONLY__ } = await import('../src/workers/volumeLoader.worker.ts');

  __TEST_ONLY__.setFromBlobImplementation(async () => {
    const slices = [new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7, 8])];

    return {
      getImageCount: async () => 3,
      getImage: async (sliceIndex: number) => {
        const slice = slices[sliceIndex];

        if (!slice) {
          throw new Error('Slice missing');
        }

        return {
          getWidth: () => 2,
          getHeight: () => 2,
          getSamplesPerPixel: () => 1,
          readRasters: async () => slice
        };
      }
    } as const;
  });

  try {
    mockSelf.onmessage?.({
      data: { type: 'load-volumes', requestId: 99, files: [new File(['mock'], 'missing-slice.tiff')] }
    });

    await onComplete;

    assert.equal(workerMessages.length, 0);
    assert.equal(workerErrors.length, 1);
  } finally {
    __TEST_ONLY__.resetFromBlobImplementation();
    (globalThis as any).self = previousSelf;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

