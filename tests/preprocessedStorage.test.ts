import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clearOpfsPreprocessedStorageRoot } from '../src/shared/storage/preprocessedStorage.ts';

type MockDirectoryHandle = {
  removeEntry: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

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
        await clearOpfsPreprocessedStorageRoot({ rootDir: '/llsm-viewer-preprocessed-vnext/' });
      }
    );

    assert.deepEqual(calls, [{ name: 'llsm-viewer-preprocessed-vnext', recursive: true }]);
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
        await clearOpfsPreprocessedStorageRoot({ rootDir: 'llsm-viewer-preprocessed-vnext' });
      }
    );

    assert.equal(calls, 1);
  }
});
