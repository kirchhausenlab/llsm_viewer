import { BlobReader, Uint8ArrayWriter, ZipReader } from '@zip.js/zip.js';
import type { FileEntry } from '@zip.js/zip.js';

import type { PreprocessedStorage, PreprocessedStorageHandle } from './preprocessedStorage';

function normalizePath(path: string): string {
  const normalized = path.replace(/^\/+/, '').trim();
  if (!normalized) {
    throw new Error('Storage path must not be empty.');
  }
  const parts = normalized.split('/').filter(Boolean);
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`Storage path "${path}" contains unsafe segment "${part}".`);
    }
  }
  return parts.join('/');
}

export async function createZipPreprocessedStorage(
  source: Blob,
  options?: { id?: string }
): Promise<PreprocessedStorageHandle> {
  const reader = new ZipReader(new BlobReader(source));
  const entries = await reader.getEntries();
  const fileEntries = new Map<string, FileEntry>();

  for (const entry of entries) {
    if (entry.directory) {
      continue;
    }
    fileEntries.set(entry.filename, entry as FileEntry);
  }

  let queue = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  const storage: PreprocessedStorage = {
    async writeFile() {
      throw new Error('ZIP storage is read-only.');
    },
    async finalizeManifest() {
      throw new Error('ZIP storage is read-only.');
    },
    async readFile(path: string): Promise<Uint8Array> {
      const safePath = normalizePath(path);
      const entry = fileEntries.get(safePath);
      if (!entry) {
        throw new Error(`Archive is missing file at ${safePath}.`);
      }
      return enqueue(async () => entry.getData(new Uint8ArrayWriter()));
    }
  };

  const id = options?.id?.trim() ? options.id.trim() : `zip-${Date.now().toString(16)}`;

  const dispose = async () => {
    try {
      await reader.close();
    } catch (error) {
      console.warn('Failed to close zip reader', error);
    }
  };

  return { backend: 'zip', id, storage, dispose };
}

