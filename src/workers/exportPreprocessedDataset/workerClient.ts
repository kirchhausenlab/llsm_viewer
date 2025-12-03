import type {
  ExportPreprocessedDatasetOptions,
  PreprocessedManifest
} from '../../shared/utils/preprocessedDataset';
import {
  createBufferedUint8Stream,
  type BufferedUint8Stream,
  type ExportPreprocessedDatasetStreamResult
} from './mainThread';

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

type PendingRequest = {
  resolve: (result: ExportPreprocessedDatasetStreamResult) => void;
  reject: (error: Error) => void;
  stream: ReadableStream<Uint8Array>;
  bufferedStream: BufferedUint8Stream;
};

export class ExportPreprocessedDatasetWorkerClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private isDisposed = false;

  constructor() {
    this.worker = new Worker(new URL('../exportPreprocessedDataset.worker.ts', import.meta.url), {
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
        if (pending.bufferedStream.isCancelled()) {
          return;
        }
        const view = new Uint8Array(data.buffer);
        pending.bufferedStream.enqueue(view);
        return;
      }

      this.pending.delete(data.id);

      if (data.type === 'done') {
        pending.bufferedStream.close();
        pending.resolve({ manifest: data.manifest, stream: pending.stream });
        return;
      }

      const error = new Error(data.message);
      if (data.stack) {
        error.stack = data.stack;
      }
      pending.bufferedStream.error(error);
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
      const bufferedStream = createBufferedUint8Stream();
      const pending: PendingRequest = {
        resolve,
        reject,
        bufferedStream,
        stream: bufferedStream.stream
      };

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
      pending.bufferedStream.error(error);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

let workerClient: ExportPreprocessedDatasetWorkerClient | null = null;

export function isWorkerSupported(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

export async function getWorkerClient(): Promise<ExportPreprocessedDatasetWorkerClient | null> {
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

export function disposeWorkerClient(reason?: Error): void {
  if (!workerClient) {
    return;
  }
  workerClient.dispose(reason);
  workerClient = null;
}

export async function requestExportPreprocessedDatasetWithWorker(
  options: ExportPreprocessedDatasetOptions
): Promise<ExportPreprocessedDatasetStreamResult | null> {
  const client = await getWorkerClient();
  if (!client) {
    return null;
  }
  return client.request(options);
}
