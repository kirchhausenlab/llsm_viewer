import {
  exportPreprocessedDataset,
  type ExportPreprocessedDatasetOptions,
  type PreprocessedManifest
} from '../utils/preprocessedDataset';

export type ExportPreprocessedDatasetStreamResult = {
  manifest: PreprocessedManifest;
  stream: ReadableStream<Uint8Array>;
};

type WorkerChunkMessage = {
  id: number;
  type: 'chunk';
  buffer: ArrayBuffer;
};

type WorkerDoneMessage = {
  id: number;
  type: 'done';
  manifest: PreprocessedManifest;
};

type WorkerErrorMessage = {
  id: number;
  type: 'error';
  message: string;
  stack?: string;
};

type WorkerResponse = WorkerChunkMessage | WorkerDoneMessage | WorkerErrorMessage;

type FilePickerAcceptType = {
  description?: string;
  accept: Record<string, string[]>;
};

type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: FilePickerAcceptType[];
};

export type FileSystemWritableFileStreamLike = WritableStream<Uint8Array> & {
  abort?: (reason?: unknown) => Promise<void>;
};

export type FileSystemFileHandleLike = {
  createWritable(): Promise<FileSystemWritableFileStreamLike>;
};

type PendingRequest = {
  resolve: (result: ExportPreprocessedDatasetStreamResult) => void;
  reject: (error: Error) => void;
  stream: ReadableStream<Uint8Array>;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  bufferedChunks: Uint8Array[];
  isCancelled: boolean;
};

const ZIP_MIME_TYPE = 'application/zip';
const ZIP_ACCEPT: FilePickerAcceptType = {
  description: 'ZIP archive',
  accept: { [ZIP_MIME_TYPE]: ['.zip'] }
};

function getShowSaveFilePicker():
  | ((options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>)
  | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const candidate = (window as Window & {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;
  }).showSaveFilePicker;
  return typeof candidate === 'function' ? candidate : undefined;
}

class ExportPreprocessedDatasetWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private isDisposed = false;

  constructor() {
    this.worker = new Worker(new URL('./exportPreprocessedDataset.worker.ts', import.meta.url), {
      type: 'module'
    });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const data = event.data;
      if (!data || typeof (data as { id?: unknown }).id !== 'number') {
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) {
        return;
      }

      if (data.type === 'chunk') {
        if (pending.isCancelled) {
          return;
        }
        const view = new Uint8Array(data.buffer);
        if (pending.controller) {
          pending.controller.enqueue(view);
        } else {
          pending.bufferedChunks.push(view);
        }
        return;
      }

      this.pending.delete(data.id);

      if (data.type === 'done') {
        if (!pending.isCancelled && pending.controller) {
          pending.controller.close();
        }
        pending.controller = null;
        pending.bufferedChunks.length = 0;
        pending.resolve({ manifest: data.manifest, stream: pending.stream });
        return;
      }

      const error = new Error(data.message);
      if (data.stack) {
        error.stack = data.stack;
      }
      if (!pending.isCancelled && pending.controller) {
        pending.controller.error(error);
      }
      pending.controller = null;
      pending.bufferedChunks.length = 0;
      pending.reject(error);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      const error = new Error(event.message || 'Export worker failed');
      this.dispose(error);
    };
    this.worker.onmessageerror = () => {
      const error = new Error('Received malformed message from export worker');
      this.dispose(error);
    };
  }

  request(options: ExportPreprocessedDatasetOptions): Promise<ExportPreprocessedDatasetStreamResult> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Export worker is not available'));
    }
    const requestId = this.nextRequestId++;
    return new Promise<ExportPreprocessedDatasetStreamResult>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        controller: null,
        bufferedChunks: [],
        isCancelled: false,
        stream: undefined as unknown as ReadableStream<Uint8Array>
      };

      pending.stream = new ReadableStream<Uint8Array>({
        start: (controller) => {
          if (pending.isCancelled) {
            pending.controller = null;
            return;
          }
          pending.controller = controller;
          if (pending.bufferedChunks.length > 0) {
            for (const chunk of pending.bufferedChunks) {
              controller.enqueue(chunk);
            }
            pending.bufferedChunks.length = 0;
          }
        },
        cancel: () => {
          pending.isCancelled = true;
          pending.controller = null;
          pending.bufferedChunks.length = 0;
        }
      });

      this.pending.set(requestId, pending);
      this.worker.postMessage({ id: requestId, type: 'export', payload: options });
    });
  }

  dispose(reason?: Error): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    const error = reason ?? new Error('Export worker disposed');
    this.rejectAll(error);
    this.worker.terminate();
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      if (!pending.isCancelled && pending.controller) {
        pending.controller.error(error);
      }
      pending.bufferedChunks.length = 0;
      pending.reject(error);
    }
    this.pending.clear();
  }
}

let workerClient: ExportPreprocessedDatasetWorkerClient | null = null;

function isWorkerSupported(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

async function getWorkerClient(): Promise<ExportPreprocessedDatasetWorkerClient | null> {
  if (!isWorkerSupported()) {
    return null;
  }
  if (workerClient) {
    return workerClient;
  }

  try {
    workerClient = new ExportPreprocessedDatasetWorkerClient();
    return workerClient;
  } catch (error) {
    console.warn('Failed to initialize export worker. Falling back to main thread.', error);
    workerClient = null;
    return null;
  }
}

async function exportPreprocessedDatasetOnMainThread(
  options: ExportPreprocessedDatasetOptions
): Promise<ExportPreprocessedDatasetStreamResult> {
  const bufferedChunks: Uint8Array[] = [];
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let isCancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    start: (streamController) => {
      if (isCancelled) {
        controller = null;
        return;
      }
      controller = streamController;
      if (bufferedChunks.length > 0) {
        for (const chunk of bufferedChunks) {
          streamController.enqueue(chunk);
        }
        bufferedChunks.length = 0;
      }
    },
    cancel: () => {
      isCancelled = true;
      controller = null;
      bufferedChunks.length = 0;
    }
  });

  const enqueue = (chunk: Uint8Array) => {
    if (isCancelled) {
      return;
    }
    if (controller) {
      controller.enqueue(chunk);
    } else {
      bufferedChunks.push(chunk);
    }
  };

  try {
    const { manifest } = await exportPreprocessedDataset(options, (chunk) => {
      enqueue(chunk.slice());
    });
    if (!isCancelled && controller) {
      controller.close();
    }
    controller = null;
    bufferedChunks.length = 0;
    return { manifest, stream };
  } catch (error) {
    if (!isCancelled && controller) {
      controller.error(error);
    }
    controller = null;
    bufferedChunks.length = 0;
    throw error;
  }
}

export async function exportPreprocessedDatasetInWorker(
  options: ExportPreprocessedDatasetOptions
): Promise<ExportPreprocessedDatasetStreamResult> {
  const client = await getWorkerClient();
  if (!client) {
    return exportPreprocessedDatasetOnMainThread(options);
  }

  try {
    return await client.request(options);
  } catch (error) {
    console.warn('Export worker failed. Falling back to main thread export.', error);
    client.dispose(error instanceof Error ? error : undefined);
    workerClient = null;
    return exportPreprocessedDatasetOnMainThread(options);
  }
}

export function canUseFileSystemSavePicker(): boolean {
  return typeof getShowSaveFilePicker() === 'function';
}

export function requestFileSystemSaveHandle(
  suggestedName: string
): Promise<FileSystemFileHandleLike> {
  const showSaveFilePicker = getShowSaveFilePicker();
  if (!showSaveFilePicker) {
    throw new Error('File System Access API is not available in this browser.');
  }
  return showSaveFilePicker({
    suggestedName,
    types: [ZIP_ACCEPT]
  });
}

export async function writeStreamToFileHandle(
  stream: ReadableStream<Uint8Array>,
  handle: FileSystemFileHandleLike
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await stream.pipeTo(writable);
  } catch (error) {
    if (typeof writable.abort === 'function') {
      await writable.abort(error);
    }
    throw error;
  }
}

export async function saveStreamWithFilePicker(
  stream: ReadableStream<Uint8Array>,
  suggestedName: string
): Promise<void> {
  const handle = await requestFileSystemSaveHandle(suggestedName);
  await writeStreamToFileHandle(stream, handle);
}

export async function collectStreamToBlob(
  stream: ReadableStream<Uint8Array>,
  type: string = ZIP_MIME_TYPE
): Promise<Blob> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
        totalLength += value.byteLength;
      }
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Blob([combined], { type });
}

