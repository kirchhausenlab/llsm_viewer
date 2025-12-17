import type { PreprocessedManifest } from '../utils/preprocessedDataset/types';
import { ensureArrayBuffer } from '../utils/buffer';

export type PreprocessedStorage = {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  finalizeManifest(manifest: PreprocessedManifest): Promise<void>;
};

export type PreprocessedStorageBackend = 'opfs' | 'memory' | 'directory';

export type PreprocessedStorageHandle = {
  backend: PreprocessedStorageBackend;
  id: string;
  storage: PreprocessedStorage;
  dispose?: () => Promise<void>;
};

function assertSafePath(path: string): string {
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

function createDatasetId(prefix: string): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const random = Math.random().toString(16).slice(2, 10);
  return `${prefix}-${stamp}-${random}`;
}

function ensureZarrDirectoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Dataset id must not be empty.');
  }
  return trimmed.toLowerCase().endsWith('.zarr') ? trimmed : `${trimmed}.zarr`;
}

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
};

type FileSystemFileHandleLike = {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type FileSystemWritableFileStreamLike = {
  write(data: BufferSource | Blob | string): Promise<void> | void;
  close(): Promise<void> | void;
};

async function getOpfsRoot(): Promise<FileSystemDirectoryHandleLike> {
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new Error('Origin private file system is not available in this environment.');
  }
  return navigator.storage.getDirectory() as unknown as FileSystemDirectoryHandleLike;
}

async function getOrCreateDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string
): Promise<FileSystemDirectoryHandleLike> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true });
  }
  return current;
}

async function getDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string
): Promise<FileSystemDirectoryHandleLike> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await current.getDirectoryHandle(part);
  }
  return current;
}

async function writeFileToDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  data: Uint8Array
): Promise<void> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/');
  const name = parts.pop();
  if (!name) {
    throw new Error('Storage file path is missing a file name.');
  }
  const dir = parts.length > 0 ? await getOrCreateDirectory(root, parts.join('/')) : root;
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(ensureArrayBuffer(data));
  await writable.close();
}

async function readFileFromDirectory(root: FileSystemDirectoryHandleLike, path: string): Promise<Uint8Array> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/');
  const name = parts.pop();
  if (!name) {
    throw new Error('Storage file path is missing a file name.');
  }
  const dir = parts.length > 0 ? await getDirectory(root, parts.join('/')) : root;
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

function resolveRootDir(rootDir: string | undefined, fallback: string): string {
  return rootDir?.trim() ? rootDir.trim() : fallback;
}

export async function createOpfsPreprocessedStorage(
  options?: { datasetId?: string; rootDir?: string }
): Promise<PreprocessedStorageHandle> {
  const root = await getOpfsRoot();
  const datasetId = options?.datasetId ?? createDatasetId('preprocessed');
  const rootDir = resolveRootDir(options?.rootDir, 'llsm-viewer-preprocessed');
  const datasetDirName = ensureZarrDirectoryName(datasetId);
  const datasetRoot = await getOrCreateDirectory(root, `${rootDir}/${datasetDirName}`);

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(datasetRoot, path, data);
    },
    async readFile(path) {
      return readFileFromDirectory(datasetRoot, path);
    },
    async finalizeManifest(manifest) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(JSON.stringify(manifest));
      await writeFileToDirectory(datasetRoot, 'manifest.json', bytes);
    }
  };

  return { backend: 'opfs', id: datasetId, storage };
}

export async function createDirectoryPreprocessedStorage(
  directory: FileSystemDirectoryHandleLike,
  options?: { datasetId?: string; rootDir?: string }
): Promise<PreprocessedStorageHandle> {
  if (!directory) {
    throw new Error('Missing directory handle for preprocessed storage.');
  }

  const datasetId = options?.datasetId ?? createDatasetId('preprocessed-export');
  const rootDir = resolveRootDir(options?.rootDir, 'llsm-viewer-preprocessed');
  const datasetDirName = ensureZarrDirectoryName(datasetId);
  const datasetRoot = await getOrCreateDirectory(directory, `${rootDir}/${datasetDirName}`);

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(datasetRoot, path, data);
    },
    async readFile(path) {
      return readFileFromDirectory(datasetRoot, path);
    },
    async finalizeManifest(manifest) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(JSON.stringify(manifest));
      await writeFileToDirectory(datasetRoot, 'manifest.json', bytes);
    }
  };

  return { backend: 'directory', id: datasetId, storage };
}

export async function createDirectoryHandlePreprocessedStorage(
  directory: FileSystemDirectoryHandleLike,
  options?: { id?: string }
): Promise<PreprocessedStorageHandle> {
  if (!directory) {
    throw new Error('Missing directory handle for preprocessed storage.');
  }

  const id = options?.id?.trim() ? options.id.trim() : createDatasetId('preprocessed-folder');

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(directory, path, data);
    },
    async readFile(path) {
      return readFileFromDirectory(directory, path);
    },
    async finalizeManifest(manifest) {
      const encoder = new TextEncoder();
      const bytes = encoder.encode(JSON.stringify(manifest));
      await writeFileToDirectory(directory, 'manifest.json', bytes);
    }
  };

  return { backend: 'directory', id, storage };
}

export function createInMemoryPreprocessedStorage(options?: { datasetId?: string }): PreprocessedStorageHandle {
  const datasetId = options?.datasetId ?? createDatasetId('preprocessed-memory');
  const files = new Map<string, Uint8Array>();

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      const safePath = assertSafePath(path);
      files.set(safePath, data.slice());
    },
    async readFile(path) {
      const safePath = assertSafePath(path);
      const entry = files.get(safePath);
      if (!entry) {
        throw new Error(`Storage entry not found: ${safePath}`);
      }
      return entry.slice();
    },
    async finalizeManifest(manifest) {
      const encoder = new TextEncoder();
      files.set('manifest.json', encoder.encode(JSON.stringify(manifest)));
    }
  };

  return { backend: 'memory', id: datasetId, storage };
}
