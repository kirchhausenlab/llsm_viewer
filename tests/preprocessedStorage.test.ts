import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearOpfsPreprocessedStorageRoot,
  createDirectoryHandlePreprocessedStorage
} from '../src/shared/storage/preprocessedStorage.ts';

type MockDirectoryHandle = {
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

type MockWritableStream = {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
};

function createMockDirectoryHandle(initialFiles: Record<string, Uint8Array>) {
  const files = new Map<string, Uint8Array>(
    Object.entries(initialFiles).map(([path, bytes]) => [path, bytes.slice()])
  );
  const getFileCalls = new Map<string, number>();

  const createFile = (path: string) => {
    const bytes = files.get(path);
    if (!bytes) {
      throw new Error(`Missing file at ${path}`);
    }
    return {
      size: bytes.byteLength,
      async arrayBuffer() {
        const copy = bytes.slice();
        return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength);
      },
      slice(start = 0, end = bytes.byteLength) {
        const safeStart = Math.max(0, Math.min(bytes.byteLength, Math.floor(start)));
        const safeEnd = Math.max(safeStart, Math.min(bytes.byteLength, Math.floor(end)));
        const range = bytes.slice(safeStart, safeEnd);
        return {
          async arrayBuffer() {
            return range.buffer.slice(range.byteOffset, range.byteOffset + range.byteLength);
          }
        };
      }
    } as File;
  };

  const createFileHandle = (path: string) => ({
    async getFile() {
      getFileCalls.set(path, (getFileCalls.get(path) ?? 0) + 1);
      return createFile(path);
    },
    async createWritable(): Promise<MockWritableStream> {
      let nextBytes = files.get(path)?.slice() ?? new Uint8Array(0);
      return {
        async write(data) {
          if (typeof data === 'string') {
            nextBytes = new TextEncoder().encode(data);
            return;
          }
          const buffer = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : new Uint8Array(data as ArrayBufferLike);
          nextBytes = buffer.slice();
        },
        async close() {
          files.set(path, nextBytes.slice());
        }
      };
    }
  });

  const root = {
    async getDirectoryHandle(name: string) {
      return root;
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name) && !options?.create) {
        throw new Error(`Not found: ${name}`);
      }
      if (!files.has(name) && options?.create) {
        files.set(name, new Uint8Array(0));
      }
      return createFileHandle(name);
    },
    async removeEntry(name: string) {
      files.delete(name);
    }
  };

  return {
    root,
    files,
    getFileCalls,
  };
}

async function withMockNavigator(
  navigatorValue: unknown,
  run: () => Promise<void>
): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: navigatorValue
  });

  try {
    await run();
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, 'navigator', descriptor);
    } else {
      delete (globalThis as { navigator?: unknown }).navigator;
    }
  }
}

test('clearOpfsPreprocessedStorageRoot removes root recursively and ignores missing roots', async () => {
  {
    const calls: Array<{ name: string; recursive: boolean }> = [];
    const rootHandle: MockDirectoryHandle = {
      async removeEntry(name, options) {
        calls.push({ name, recursive: Boolean(options?.recursive) });
      }
    };

    await withMockNavigator(
      {
        storage: {
          getDirectory: async () => rootHandle
        }
      },
      async () => {
        await clearOpfsPreprocessedStorageRoot({ rootDir: '/llsm-viewer-preprocessed-vnext-hes1/' });
      }
    );

    assert.deepEqual(calls, [{ name: 'llsm-viewer-preprocessed-vnext-hes1', recursive: true }]);
  }

  {
    let calls = 0;
    const rootHandle: MockDirectoryHandle = {
      async removeEntry() {
        calls += 1;
        throw new Error('Not found');
      }
    };

    await withMockNavigator(
      {
        storage: {
          getDirectory: async () => rootHandle
        }
      },
      async () => {
        await clearOpfsPreprocessedStorageRoot({ rootDir: 'llsm-viewer-preprocessed-vnext-hes1' });
      }
    );

    assert.equal(calls, 1);
  }
});

test('directory-backed storage caches file snapshots across repeated range reads', async () => {
  const mock = createMockDirectoryHandle({
    'data.bin': Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]),
  });
  const storageHandle = await createDirectoryHandlePreprocessedStorage(mock.root as any, { id: 'dataset' });

  const first = await storageHandle.storage.readFileRange?.('data.bin', 1, 3);
  const second = await storageHandle.storage.readFileRange?.('data.bin', 4, 2);

  assert.deepEqual(Array.from(first ?? []), [1, 2, 3]);
  assert.deepEqual(Array.from(second ?? []), [4, 5]);
  assert.equal(mock.getFileCalls.get('data.bin') ?? 0, 1);
});

test('directory-backed storage invalidates cached file snapshots after writes', async () => {
  const mock = createMockDirectoryHandle({
    'data.bin': Uint8Array.from([1, 2, 3, 4]),
  });
  const storageHandle = await createDirectoryHandlePreprocessedStorage(mock.root as any, { id: 'dataset' });

  const before = await storageHandle.storage.readFile('data.bin');
  await storageHandle.storage.writeFile('data.bin', Uint8Array.from([9, 8, 7, 6]));
  const after = await storageHandle.storage.readFile('data.bin');

  assert.deepEqual(Array.from(before), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(after), [9, 8, 7, 6]);
  assert.equal(mock.getFileCalls.get('data.bin') ?? 0, 2);
});
