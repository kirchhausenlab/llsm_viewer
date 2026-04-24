import { ensureArrayBuffer } from '../utils/buffer';

export type PreprocessedStorage = {
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  readFileRange?(path: string, offset: number, length: number): Promise<Uint8Array>;
};

export type PreprocessedStorageBackend = 'opfs' | 'memory' | 'directory' | 'http';

export type PreprocessedStorageHandle = {
  backend: PreprocessedStorageBackend;
  id: string;
  storage: PreprocessedStorage;
  dispose?: () => Promise<void>;
};

export const PREPROCESSED_STORAGE_ROOT_DIR = 'llsm-viewer-preprocessed-vnext-hes1';

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

function normalizeHttpBaseUrl(baseUrl: string): string {
  const trimmed = requireNonEmptyName(baseUrl, 'baseUrl');
  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid baseUrl "${baseUrl}".`);
  }
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
type FileHandleCache = Map<string, Promise<FileSystemFileHandleLike>>;
type FileSnapshotCache = Map<string, Promise<File>>;
type FetchLike = typeof fetch;

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
  directoryCache?: DirectoryHandleCache,
  fileHandleCache?: FileHandleCache,
  fileSnapshotCache?: FileSnapshotCache
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
  fileHandleCache?.delete(safePath);
  fileSnapshotCache?.delete(safePath);
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
  directoryCache?: DirectoryHandleCache,
  fileHandleCache?: FileHandleCache,
  fileSnapshotCache?: FileSnapshotCache
): Promise<Uint8Array> {
  const file = await readFileSnapshotFromDirectory(root, path, directoryCache, fileHandleCache, fileSnapshotCache);
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

async function getFileHandleFromDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  directoryCache?: DirectoryHandleCache,
  fileHandleCache?: FileHandleCache
): Promise<FileSystemFileHandleLike> {
  const safePath = assertSafePath(path);
  const cachedHandle = fileHandleCache?.get(safePath);
  if (cachedHandle) {
    return cachedHandle;
  }
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
  const handlePromise = dir.getFileHandle(name).catch((error) => {
    fileHandleCache?.delete(safePath);
    throw error;
  });
  fileHandleCache?.set(safePath, handlePromise);
  return handlePromise;
}

async function readFileSnapshotFromDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  directoryCache?: DirectoryHandleCache,
  fileHandleCache?: FileHandleCache,
  fileSnapshotCache?: FileSnapshotCache
): Promise<File> {
  const safePath = assertSafePath(path);
  const cachedFile = fileSnapshotCache?.get(safePath);
  if (cachedFile) {
    return cachedFile;
  }
  const filePromise = getFileHandleFromDirectory(root, safePath, directoryCache, fileHandleCache)
    .then((handle) => handle.getFile())
    .catch((error) => {
      fileSnapshotCache?.delete(safePath);
      throw error;
    });
  fileSnapshotCache?.set(safePath, filePromise);
  return filePromise;
}

function normalizeRange(offset: number, length: number, totalLength: number): { start: number; end: number } {
  const safeOffset = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const safeLength = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  const start = Math.min(safeOffset, totalLength);
  const end = Math.min(totalLength, start + safeLength);
  return { start, end };
}

function normalizeOpenEndedRange(offset: number, length: number): { start: number; endInclusive: number } | null {
  const start = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0;
  const safeLength = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  if (safeLength <= 0) {
    return null;
  }
  return {
    start,
    endInclusive: start + safeLength - 1
  };
}

function buildHttpStorageUrl(baseUrl: string, path: string): string {
  const safePath = assertSafePath(path);
  return new URL(safePath, `${baseUrl}/`).toString();
}

function createMissingStorageEntryError(path: string): Error {
  return new Error(`Storage entry not found: ${path}`);
}

async function readHttpResponseBytes(response: Response): Promise<Uint8Array> {
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function readFileFromHttpStorage(fetchImpl: FetchLike, baseUrl: string, path: string): Promise<Uint8Array> {
  const safePath = assertSafePath(path);
  const response = await fetchImpl(buildHttpStorageUrl(baseUrl, safePath), {
    method: 'GET'
  });

  if (response.status === 404) {
    throw createMissingStorageEntryError(safePath);
  }
  if (!response.ok) {
    throw new Error(
      `Failed to read "${safePath}" from remote storage (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
    );
  }

  return readHttpResponseBytes(response);
}

async function readFileRangeFromHttpStorage(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  offset: number,
  length: number
): Promise<Uint8Array> {
  const safePath = assertSafePath(path);
  const range = normalizeOpenEndedRange(offset, length);
  if (!range) {
    return new Uint8Array(0);
  }

  const response = await fetchImpl(buildHttpStorageUrl(baseUrl, safePath), {
    method: 'GET',
    headers: {
      Range: `bytes=${range.start}-${range.endInclusive}`
    }
  });

  if (response.status === 404) {
    throw createMissingStorageEntryError(safePath);
  }
  if (response.status === 206) {
    return readHttpResponseBytes(response);
  }
  if (response.status === 200) {
    const bytes = await readHttpResponseBytes(response);
    const end = Math.min(bytes.byteLength, range.endInclusive + 1);
    if (range.start >= bytes.byteLength) {
      return new Uint8Array(0);
    }
    return bytes.slice(range.start, end);
  }

  throw new Error(
    `Failed to range-read "${safePath}" from remote storage (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
  );
}

async function readFileRangeFromDirectory(
  root: FileSystemDirectoryHandleLike,
  path: string,
  offset: number,
  length: number,
  directoryCache?: DirectoryHandleCache,
  fileHandleCache?: FileHandleCache,
  fileSnapshotCache?: FileSnapshotCache
): Promise<Uint8Array> {
  const file = await readFileSnapshotFromDirectory(root, path, directoryCache, fileHandleCache, fileSnapshotCache);
  const { start, end } = normalizeRange(offset, length, file.size);
  if (end <= start) {
    return new Uint8Array(0);
  }
  const buffer = await file.slice(start, end).arrayBuffer();
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
  const fileHandleCache: FileHandleCache = new Map();
  const fileSnapshotCache: FileSnapshotCache = new Map();

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(datasetRoot, path, data, directoryCache, fileHandleCache, fileSnapshotCache);
    },
    async readFile(path) {
      return readFileFromDirectory(datasetRoot, path, directoryCache, fileHandleCache, fileSnapshotCache);
    },
    async readFileRange(path, offset, length) {
      return readFileRangeFromDirectory(
        datasetRoot,
        path,
        offset,
        length,
        directoryCache,
        fileHandleCache,
        fileSnapshotCache
      );
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
  const fileHandleCache: FileHandleCache = new Map();
  const fileSnapshotCache: FileSnapshotCache = new Map();

  const storage: PreprocessedStorage = {
    async writeFile(path, data) {
      await writeFileToDirectory(directory, path, data, directoryCache, fileHandleCache, fileSnapshotCache);
    },
    async readFile(path) {
      return readFileFromDirectory(directory, path, directoryCache, fileHandleCache, fileSnapshotCache);
    },
    async readFileRange(path, offset, length) {
      return readFileRangeFromDirectory(
        directory,
        path,
        offset,
        length,
        directoryCache,
        fileHandleCache,
        fileSnapshotCache
      );
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
    },
    async readFileRange(path, offset, length) {
      const safePath = assertSafePath(path);
      const entry = files.get(safePath);
      if (!entry) {
        throw new Error(`Storage entry not found: ${safePath}`);
      }
      const { start, end } = normalizeRange(offset, length, entry.byteLength);
      if (end <= start) {
        return new Uint8Array(0);
      }
      return entry.slice(start, end);
    }
  };

  return { backend: 'memory', id: datasetId, storage };
}

export function createHttpPreprocessedStorage(options: {
  id: string;
  baseUrl: string;
  fetchImpl?: FetchLike;
}): PreprocessedStorageHandle {
  const id = requireNonEmptyName(options.id, 'id');
  const baseUrl = normalizeHttpBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('HTTP preprocessed storage requires fetch support.');
  }

  const storage: PreprocessedStorage = {
    async writeFile() {
      throw new Error('Remote HTTP preprocessed storage is read-only.');
    },
    async readFile(path) {
      return readFileFromHttpStorage(fetchImpl, baseUrl, path);
    },
    async readFileRange(path, offset, length) {
      return readFileRangeFromHttpStorage(fetchImpl, baseUrl, path, offset, length);
    }
  };

  return {
    backend: 'http',
    id,
    storage
  };
}
