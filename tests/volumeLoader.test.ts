import assert from 'node:assert/strict';

import { loadVolumesFromFiles } from '../src/loaders/volumeLoader.ts';

class StubWorker implements Worker {
  onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
  onerror: ((this: Worker, ev: ErrorEvent) => any) | null = null;
  onmessageerror: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
  addEventListener: Worker['addEventListener'] = () => undefined as any;
  dispatchEvent: Worker['dispatchEvent'] = () => false;
  removeEventListener: Worker['removeEventListener'] = () => undefined as any;
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

  constructor(private readonly script: (worker: StubWorker, message: any) => void) {}
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
}) {
  return () =>
    new StubWorker((worker, message: any) => {
      const requestId = message.requestId;
      const { metadata, slices } = options;
      queueMicrotask(() => {
        worker.onmessage?.({ data: { type: 'volume-start', requestId, index: 0, metadata: { ...metadata, bytesPerValue: 1 } } });
        slices.forEach((slice, sliceIndex) => {
          worker.onmessage?.({
            data: {
              type: 'volume-slice',
              requestId,
              index: 0,
              sliceIndex,
              sliceCount: slices.length,
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

try {
  (async () => {
    const metadata = { width: 2, height: 2, depth: 1, channels: 1 };
    const workerFactory = buildWorker({ metadata: { ...metadata, dataType: 'uint8' }, slices: [new Uint8Array([1, 2, 3, 4])] });

    const [volume] = await loadVolumesFromFiles([new File(['buffered'], 'buffered.tiff')], {}, { workerFactory });
    assert.strictEqual(volume.data.byteLength, 4);
    assert.deepEqual(Array.from(new Uint8Array(volume.data)), [1, 2, 3, 4]);

    const store = new MemoryStore();
    let preprocessingCalled = false;
    const streamingVolume = await loadVolumesFromFiles(
      [new File(['streaming'], 'streaming.tiff')],
      {
        preprocessingHooks: {
          onPreprocessingComplete: async (result) => {
            preprocessingCalled = true;
            assert.ok(result.arrays.length > 0);
            const keys = store.listKeys();
            assert.ok(keys.length > 1);
          }
        }
      },
      {
        workerFactory: buildWorker({ metadata: { ...metadata, dataType: 'uint8' }, slices: [new Uint8Array([5, 6, 7, 8])] }),
        streamingByteThreshold: 1,
        preprocessingStoreFactory: async () => store
      }
    );

    assert.strictEqual(streamingVolume[0].data.byteLength, 0);
    assert.ok(preprocessingCalled);
  })();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

