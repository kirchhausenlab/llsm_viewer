import { ensureArrayBuffer } from '../utils/buffer';

export type PreprocessedStorage = {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
};

export type PreprocessedStorageBackend = 'opfs' | 'memory' | 'directory';

export type PreprocessedStorageHandle = {
  backend: PreprocessedStorageBackend;
  id: string;
  storage: PreprocessedStorage;
  dispose?: () => Promise<void>;
};

export const PREPROCESSED_STORAGE_ROOT_DIR = 'llsm-viewer-preprocessed-vnext';

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

function ensureZarrDirectoryName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Dataset id must not be empty.');
  }
  return trimmed.toLowerCase().endsWith('.zarr') ? trimmed : `${trimmed}.zarr`;
}

function requireNonEmptyName(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be empty.`);
  }
  return trimmed;
}

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandleLike>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
};

type FileSystemFileHandleLike = {
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type FileSystemWritableFileStreamLike = {
  write(data: BufferSource | Blob | string): Promise<void> | void;
  close(): Promise<void> | void;
};

type DirectoryHandleCache = Map<string, Promise<FileSystemDirectoryHandleLike>>;

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

function isMissingStorageEntryError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'NotFoundError';
  }
  if (error instanceof Error) {
    return /not found/i.test(error.message);
  }
  return false;
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

async function getDirectoryWithCache({
  root,
  path,
  create,
  cache
}: {
  root: FileSystemDirectoryHandleLike;
  path: string;
  create: boolean;
  cache: DirectoryHandleCache;
}): Promise<FileSystemDirectoryHandleLike> {
  const safePath = assertSafePath(path);
  const existing = cache.get(safePath);
  if (existing) {
    return existing;
  }

  const parts = safePath.split('/').filter(Boolean);
  let current = root;
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const cachedSegment = cache.get(currentPath);
    if (cachedSegment) {
      current = await cachedSegment;
      continue;
    }

    let segmentPromise: Promise<FileSystemDirectoryHandleLike>;
    const segmentPath = currentPath;
    segmentPromise = current
      .getDirectoryHandle(part, create ? { create: true } : undefined)
      .catch((error) => {
        cache.delete(segmentPath);
        throw error;
      });
    cache.set(segmentPath, segmentPromise);
    current = await segmentPromise;
  }
  return current;
}

async function writeFileToDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  data: Uint8Array,
  directoryCache?: DirectoryHandleCache
): Promise<void> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/');
  const name = parts.pop();
  if (!name) {
    throw new Error('Storage file path is missing a file name.');
  }
  const directoryPath = parts.join('/');
  const dir = directoryPath
    ? directoryCache
      ? await getDirectoryWithCache({ root, path: directoryPath, create: true, cache: directoryCache })
      : await getOrCreateDirectory(root, directoryPath)
    : root;
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(ensureArrayBuffer(data));
  await writable.close();
}

async function removeEntryFromDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/');
  const name = parts.pop();
  if (!name) {
    throw new Error('Storage entry path is missing a name.');
  }
  const directoryPath = parts.join('/');

  try {
    const dir = directoryPath ? await getDirectory(root, directoryPath) : root;
    await dir.removeEntry(name, options);
  } catch (error) {
    if (isMissingStorageEntryError(error)) {
      return;
    }
    throw error;
  }
}

async function readFileFromDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  directoryCache?: DirectoryHandleCache
): Promise<Uint8Array> {
  const safePath = assertSafePath(path);
  const parts = safePath.split('/');
  const name = parts.pop();
  if (!name) {
    throw new Error('Storage file path is missing a file name.');
  }
  const directoryPath = parts.join('/');
  const dir = directoryPath
    ? directoryCache
      ? await getDirectoryWithCache({ root, path: directoryPath, create: false, cache: directoryCache })
      : await getDirectory(root, directoryPath)
    : root;
  const handle = await dir.getFileHandle(name);
  const file = await handle.getFile();
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function createOpfsPreprocessedStorage(
  options: { datasetId: string; rootDir: string }
): Promise<PreprocessedStorageHandle> {
  const root = await getOpfsRoot();
  const datasetId = requireNonEmptyName(options.datasetId, 'datasetId');
  const rootDir = requireNonEmptyName(options.rootDir, 'rootDir');
  const datasetDirName = ensureZarrDirectoryName(datasetId);
  const datasetRoot = await getOrCreateDirectory(root, `${rootDir}/${datasetDirName}`);
  const directoryCache: DirectoryHandleCache = new Map();

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(datasetRoot, path, data, directoryCache);
    },
    async readFile(path) {
      return readFileFromDirectory(datasetRoot, path, directoryCache);
    }
  };

  return {
    backend: 'opfs',
    id: datasetId,
    storage,
    async dispose() {
      await removeEntryFromDirectory(root, `${rootDir}/${datasetDirName}`, { recursive: true });
    }
  };
}

export async function clearOpfsPreprocessedStorageRoot(options: { rootDir: string }): Promise<void> {
  const rootDir = requireNonEmptyName(options.rootDir, 'rootDir');
  const root = await getOpfsRoot();
  await removeEntryFromDirectory(root, rootDir, { recursive: true });
}

export async function createDirectoryHandlePreprocessedStorage(
  directory: FileSystemDirectoryHandleLike,
  options: { id: string }
): Promise<PreprocessedStorageHandle> {
  if (!directory) {
    throw new Error('Missing directory handle for preprocessed storage.');
  }

  const id = requireNonEmptyName(options.id, 'id');
  const directoryCache: DirectoryHandleCache = new Map();

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(directory, path, data, directoryCache);
    },
    async readFile(path) {
      return readFileFromDirectory(directory, path, directoryCache);
    }
  };

  return { backend: 'directory', id, storage };
}

export function createInMemoryPreprocessedStorage(options: { datasetId: string }): PreprocessedStorageHandle {
  const datasetId = requireNonEmptyName(options.datasetId, 'datasetId');
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
    }
  };

  return { backend: 'memory', id: datasetId, storage };
}
