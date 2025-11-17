import type { ImportPreprocessedDatasetResult } from '../../utils/preprocessedDataset';
import WorkerScript from '../importPreprocessedDataset.worker?worker';

export type PreprocessedImportProgress = {
  bytesProcessed: number;
  totalBytes: number | null;
  volumesDecoded: number;
  totalVolumeCount: number | null;
};

type WorkerResponse =
  | { id: number; type: 'progress' } & PreprocessedImportProgress
  | { id: number; type: 'done'; result: ImportPreprocessedDatasetResult }
  | { id: number; type: 'error'; message: string; stack?: string }
  | { id: number; type: 'cancelled' };

type WorkerRequest =
  | { id: number; type: 'import'; stream: ReadableStream<Uint8Array>; totalBytes: number | null }
  | { id: number; type: 'cancel' };

type PendingRequest = {
  resolve: (result: ImportPreprocessedDatasetResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: PreprocessedImportProgress) => void;
  abortController: AbortController;
  abortListener?: () => void;
};

export type ImportPreprocessedDatasetWorkerOptions = {
  stream: ReadableStream<Uint8Array>;
  totalBytes: number | null;
  onProgress?: (progress: PreprocessedImportProgress) => void;
  signal?: AbortSignal;
};

export class ImportPreprocessedDatasetWorkerClient {
  private readonly worker: Worker;

  private readonly pending = new Map<number, PendingRequest>();

  private nextRequestId = 1;

  private isDisposed = false;

  constructor() {
    this.worker = new WorkerScript();
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      this.handleMessage(event.data);
    };
    this.worker.onerror = (event: ErrorEvent) => {
      const error = new Error(event.message || 'Import worker failed');
      this.failAll(error);
    };
    this.worker.onmessageerror = () => {
      const error = new Error('Received malformed message from import worker');
      this.failAll(error);
    };
  }

  import(options: ImportPreprocessedDatasetWorkerOptions): Promise<ImportPreprocessedDatasetResult> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Import worker is not available'));
    }

    if (options.signal?.aborted) {
      const reason = options.signal.reason;
      if (reason instanceof Error) {
        return Promise.reject(reason);
      }
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    }

    const requestId = this.nextRequestId++;
    const abortController = new AbortController();

    const request: PendingRequest = {
      resolve: () => {},
      reject: () => {},
      onProgress: options.onProgress,
      abortController
    };

    const promise = new Promise<ImportPreprocessedDatasetResult>((resolve, reject) => {
      request.resolve = resolve;
      request.reject = reject;
    });

    this.pending.set(requestId, request);

    const cleanup = () => {
      this.pending.delete(requestId);
      abortController.abort();
      if (request.abortListener && options.signal) {
        options.signal.removeEventListener('abort', request.abortListener);
      }
    };

    promise.finally(cleanup).catch(() => {
      // The rejection is already handled by the consumer.
    });

    if (options.signal) {
      const abortHandler = () => {
        this.worker.postMessage({ id: requestId, type: 'cancel' } satisfies WorkerRequest);
      };
      request.abortListener = abortHandler;
      options.signal.addEventListener('abort', abortHandler, { once: true });
    }

    try {
      this.worker.postMessage(
        { id: requestId, type: 'import', stream: options.stream, totalBytes: options.totalBytes } satisfies WorkerRequest,
        [options.stream as unknown as Transferable]
      );
    } catch (error) {
      this.pending.delete(requestId);
      abortController.abort();
      if (request.abortListener && options.signal) {
        options.signal.removeEventListener('abort', request.abortListener);
      }
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }

    return promise;
  }

  dispose(reason?: Error): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.worker.terminate();
    const error = reason ?? new Error('Import worker disposed');
    this.failAll(error);
  }

  private handleMessage(message: WorkerResponse): void {
    const request = this.pending.get(message.id);
    if (!request) {
      return;
    }

    switch (message.type) {
      case 'progress': {
        request.onProgress?.({
          bytesProcessed: message.bytesProcessed,
          totalBytes: message.totalBytes,
          volumesDecoded: message.volumesDecoded,
          totalVolumeCount: message.totalVolumeCount
        });
        break;
      }
      case 'done': {
        this.pending.delete(message.id);
        request.abortController.abort();
        request.resolve(message.result);
        break;
      }
      case 'cancelled': {
        this.pending.delete(message.id);
        request.abortController.abort();
        request.reject(new DOMException('Import cancelled', 'AbortError'));
        break;
      }
      case 'error': {
        this.pending.delete(message.id);
        request.abortController.abort();
        const error = new Error(message.message);
        error.stack = message.stack;
        request.reject(error);
        break;
      }
      default: {
        const error = new Error('Received unknown message from import worker');
        this.failAll(error);
        break;
      }
    }
  }

  private failAll(error: Error): void {
    for (const [id, request] of this.pending) {
      this.pending.delete(id);
      request.abortController.abort();
      request.reject(error);
    }
  }
}

let workerClient: ImportPreprocessedDatasetWorkerClient | null = null;

export function getImportPreprocessedDatasetWorker(): ImportPreprocessedDatasetWorkerClient | null {
  if (workerClient) {
    return workerClient;
  }
  try {
    workerClient = new ImportPreprocessedDatasetWorkerClient();
    return workerClient;
  } catch (error) {
    console.warn('Failed to initialize import worker. Falling back to main thread.', error);
    workerClient = null;
    return null;
  }
}

export function disposeImportPreprocessedDatasetWorker(reason?: Error): void {
  if (!workerClient) {
    return;
  }
  workerClient.dispose(reason);
  workerClient = null;
}

export function importPreprocessedDatasetInWorker(
  options: ImportPreprocessedDatasetWorkerOptions
): Promise<ImportPreprocessedDatasetResult> {
  const client = getImportPreprocessedDatasetWorker();
  if (!client) {
    return Promise.reject(new Error('Import worker is not available'));
  }
  return client.import(options);
}
