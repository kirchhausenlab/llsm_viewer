import { FetchStore, Location, root } from 'zarrita';
import type { Array as ZarrArray, Group as ZarrGroup, Location as ZarrLocation } from 'zarrita';
import type { AbsolutePath, AsyncMutable, AsyncReadable, RangeQuery } from '@zarrita/storage';
import { open } from 'zarrita';

export type ZarrReadableStore = AsyncReadable;
export type ZarrMutableStore = AsyncMutable;

export type MinimalZarrArray<Store extends AsyncReadable = AsyncReadable> = Pick<
  ZarrArray<any, Store>,
  'chunks' | 'dtype' | 'getChunk' | 'shape'
>;

export type MinimalZarrGroup<Store extends AsyncReadable = AsyncReadable> = Pick<
  ZarrGroup<Store>,
  'attrs'
>;

function normalizeKey(key: string | AbsolutePath): AbsolutePath {
  if (key === '/') return '/' as AbsolutePath;
  return (key.startsWith('/') ? key : `/${key}`) as AbsolutePath;
}

function stripLeadingSlash(key: string | AbsolutePath): string {
  return key.startsWith('/') ? key.slice(1) : key;
}

function computeOffsets(range: RangeQuery, totalLength: number): { start: number; end: number } {
  if ('suffixLength' in range) {
    const start = Math.max(0, totalLength - range.suffixLength);
    return { start, end: totalLength };
  }
  const start = range.offset;
  return { start, end: Math.min(totalLength, range.offset + range.length) };
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

function sliceArray(data: Uint8Array, range: RangeQuery): Uint8Array {
  const { start, end } = computeOffsets(range, data.length);
  return data.slice(start, end);
}

type DirectoryEntriesIterator = AsyncIterableIterator<[string, FileSystemHandle]>;

type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries?: () => DirectoryEntriesIterator;
};

function getDirectoryEntriesIterator(handle: FileSystemDirectoryHandle): DirectoryEntriesIterator {
  const iterator = (handle as DirectoryHandleWithEntries).entries?.();
  if (!iterator) {
    throw new Error('FileSystemDirectoryHandle.entries() is not supported in this environment.');
  }
  return iterator;
}

export async function readRangeFromStore<Store extends AsyncReadable>(
  store: Store,
  key: string,
  range: RangeQuery
): Promise<Uint8Array | undefined> {
  const absoluteKey = normalizeKey(key);
  const withRange = (store as Partial<AsyncReadable>).getRange;
  if (withRange) {
    return withRange.call(store as AsyncReadable, absoluteKey, range);
  }
  const full = await (store as AsyncReadable).get(absoluteKey);
  if (!full) return undefined;
  return sliceArray(full, range);
}

function resolveLocation<Store>(
  target: ZarrLocation<Store> | Store,
  path?: string
): ZarrLocation<Store> {
  const base = target instanceof Location ? target : root(target);
  if (!path || path === '/' || path === '') return base;
  return base.resolve(normalizeKey(path));
}

export async function openGroupAt<Store extends AsyncReadable>(
  target: ZarrLocation<Store> | Store,
  path?: string
): Promise<ZarrGroup<Store>> {
  return open(resolveLocation(target, path), { kind: 'group' });
}

export async function openArrayAt<Store extends AsyncReadable>(
  target: ZarrLocation<Store> | Store,
  path?: string
): Promise<ZarrArray<any, Store>> {
  return open(resolveLocation(target, path), { kind: 'array' });
}

export function createFetchStore(
  url: string | URL,
  options?: { requestInit?: RequestInit; useSuffixRequest?: boolean }
): FetchStore {
  return new FetchStore(url, {
    overrides: options?.requestInit,
    useSuffixRequest: options?.useSuffixRequest
  });
}

export type FileLikeBlob = Blob | File;
export type FileMapping = Map<string, FileLikeBlob> | Record<string, FileLikeBlob>;

function toFileMap(files: FileMapping): Map<AbsolutePath, FileLikeBlob> {
  if (files instanceof Map) {
    return new Map(
      Array.from(files.entries()).map(([key, value]) => [normalizeKey(key), value])
    );
  }
  return new Map(
    Object.entries(files).map(([key, value]) => [normalizeKey(key), value])
  );
}

export class KeyedFileStore implements AsyncReadable {
  private readonly files: Map<AbsolutePath, FileLikeBlob>;

  constructor(files: FileMapping) {
    this.files = toFileMap(files);
  }

  private getBlob(key: AbsolutePath): FileLikeBlob | undefined {
    return this.files.get(normalizeKey(key));
  }

  async get(key: AbsolutePath): Promise<Uint8Array | undefined> {
    const blob = this.getBlob(key);
    if (!blob) return undefined;
    return blobToUint8Array(blob);
  }

  async getRange(key: AbsolutePath, range: RangeQuery): Promise<Uint8Array | undefined> {
    const blob = this.getBlob(key);
    if (!blob) return undefined;
    const { start, end } = computeOffsets(range, blob.size);
    const slice = blob.slice(start, end);
    return blobToUint8Array(slice);
  }
}

async function collectDirectoryEntries(
  handle: FileSystemDirectoryHandle,
  prefix: string,
  files: Map<AbsolutePath, File>
): Promise<void> {
  const iterator = getDirectoryEntriesIterator(handle);

  for await (const [name, entry] of iterator) {
    if (entry.kind === 'file') {
      const file = await (entry as FileSystemFileHandle).getFile();
      const fullPath = normalizeKey(prefix ? `${prefix}/${name}` : name);
      files.set(fullPath, file);
    } else if (entry.kind === 'directory') {
      const nextPrefix = prefix ? `${prefix}/${name}` : name;
      await collectDirectoryEntries(entry as FileSystemDirectoryHandle, nextPrefix, files);
    }
  }
}

export async function filesFromDirectory(
  handle: FileSystemDirectoryHandle
): Promise<Map<AbsolutePath, File>> {
  const files = new Map<AbsolutePath, File>();
  await collectDirectoryEntries(handle, '', files);
  return files;
}

export class DirectoryHandleStore implements AsyncMutable {
  constructor(private readonly directory: FileSystemDirectoryHandle) {}

  async clear(): Promise<void> {
    const iterator = getDirectoryEntriesIterator(this.directory);
    for await (const [name] of iterator) {
      await this.directory.removeEntry(name, { recursive: true });
    }
  }

  private async getFileHandle(
    key: AbsolutePath,
    create: boolean
  ): Promise<FileSystemFileHandle | undefined> {
    const parts = stripLeadingSlash(key).split('/').filter(Boolean);
    if (parts.length === 0) return undefined;
    const fileName = parts.pop();
    let current: FileSystemDirectoryHandle = this.directory;
    for (const part of parts) {
      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch (error) {
        if (!create) return undefined;
        throw error;
      }
    }
    try {
      return await current.getFileHandle(fileName!, { create });
    } catch (error) {
      if (!create) return undefined;
      throw error;
    }
  }

  private async readFile(key: AbsolutePath): Promise<File | undefined> {
    const handle = await this.getFileHandle(key, false);
    if (!handle) return undefined;
    return handle.getFile();
  }

  async get(key: AbsolutePath): Promise<Uint8Array | undefined> {
    const file = await this.readFile(key);
    if (!file) return undefined;
    return blobToUint8Array(file);
  }

  async getRange(key: AbsolutePath, range: RangeQuery): Promise<Uint8Array | undefined> {
    const file = await this.readFile(key);
    if (!file) return undefined;
    const { start, end } = computeOffsets(range, file.size);
    return blobToUint8Array(file.slice(start, end));
  }

  async set(key: AbsolutePath, value: Uint8Array): Promise<void> {
    const handle = await this.getFileHandle(key, true);
    if (!handle) throw new Error(`Cannot create file for key ${key}`);
    const writer = await handle.createWritable();
    const buffer = new ArrayBuffer(value.byteLength);
    new Uint8Array(buffer).set(value);
    await writer.write(buffer);
    await writer.close();
  }
}

function requestDatabase(
  dbName: string,
  storeName: string
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDBStore implements AsyncMutable {
  private constructor(
    private readonly db: IDBDatabase,
    private readonly storeName: string
  ) {}

  async clear(): Promise<void> {
    await this.transaction('readwrite', (store) => store.clear());
  }

  static async create(dbName = 'llsm-zarr', storeName = 'chunks'): Promise<IndexedDBStore> {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not available in this environment.');
    }
    const db = await requestDatabase(dbName, storeName);
    return new IndexedDBStore(db, storeName);
  }

  private transaction<T = unknown>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const tx = this.db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);
      const request = action(store);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: AbsolutePath): Promise<Uint8Array | undefined> {
    const result = await this.transaction<unknown>('readonly', (store) =>
      store.get(normalizeKey(key))
    );
    if (!result) return undefined;
    const value = result as ArrayBuffer | Uint8Array;
    return value instanceof Uint8Array ? value : new Uint8Array(value);
  }

  async getRange(key: AbsolutePath, range: RangeQuery): Promise<Uint8Array | undefined> {
    const full = await this.get(key);
    if (!full) return undefined;
    return sliceArray(full, range);
  }

  async set(key: AbsolutePath, value: Uint8Array): Promise<void> {
    await this.transaction('readwrite', (store) => store.put(value, normalizeKey(key)));
  }
}

export async function createPreprocessingStore(options?: {
  directoryHandle?: FileSystemDirectoryHandle;
  indexedDBName?: string;
  indexedDBObjectStore?: string;
}): Promise<AsyncMutable> {
  if (options?.directoryHandle) {
    return new DirectoryHandleStore(options.directoryHandle);
  }
  return IndexedDBStore.create(options?.indexedDBName, options?.indexedDBObjectStore);
}
