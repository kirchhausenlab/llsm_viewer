import type { AbsolutePath, AsyncMutable } from '@zarrita/storage';

import type { PreprocessedStorage } from '../storage/preprocessedStorage';

type ZarrStore = AsyncMutable;

function normalizeAbsolutePath(path: AbsolutePath): string {
  const normalized = path.replace(/^\/+/, '').trim();
  return normalized;
}

function isProbablyMissingKeyError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'NotFoundError';
  }
  if (error instanceof Error) {
    return /not found/i.test(error.message);
  }
  return false;
}

export function createZarrStoreFromPreprocessedStorage(storage: PreprocessedStorage): ZarrStore {
  return {
    async get(key) {
      const path = normalizeAbsolutePath(key);
      if (!path) {
        return undefined;
      }
      try {
        return await storage.readFile(path);
      } catch (error) {
        if (isProbablyMissingKeyError(error)) {
          return undefined;
        }
        throw error;
      }
    },
    async set(key, value) {
      const path = normalizeAbsolutePath(key);
      if (!path) {
        throw new Error('Zarr storage key must not be empty.');
      }
      await storage.writeFile(path, value);
    }
  };
}

