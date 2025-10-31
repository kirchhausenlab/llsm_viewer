import {
  exportPreprocessedDataset,
  type ExportPreprocessedDatasetOptions,
  type ExportPreprocessedDatasetResult
} from '../utils/preprocessedDataset';

type WorkerResponse =
  | {
      id: number;
      type: 'success';
      payload: ExportPreprocessedDatasetResult;
    }
  | {
      id: number;
      type: 'error';
      message: string;
      stack?: string;
    };

type PendingRequest = {
  resolve: (result: ExportPreprocessedDatasetResult) => void;
  reject: (error: Error) => void;
};

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
      if (!data || typeof data.id !== 'number') {
        return;
      }
      const pending = this.pending.get(data.id);
      if (!pending) {
        return;
      }
      this.pending.delete(data.id);
      if (data.type === 'success') {
        pending.resolve(data.payload);
        return;
      }
      const error = new Error(data.message);
      if (data.stack) {
        error.stack = data.stack;
      }
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

  request(options: ExportPreprocessedDatasetOptions): Promise<ExportPreprocessedDatasetResult> {
    if (this.isDisposed) {
      return Promise.reject(new Error('Export worker is not available'));
    }
    const requestId = this.nextRequestId++;
    return new Promise<ExportPreprocessedDatasetResult>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
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

export async function exportPreprocessedDatasetInWorker(
  options: ExportPreprocessedDatasetOptions
): Promise<ExportPreprocessedDatasetResult> {
  const client = await getWorkerClient();
  if (!client) {
    return exportPreprocessedDataset(options);
  }

  try {
    return await client.request(options);
  } catch (error) {
    console.warn('Export worker failed. Falling back to main thread export.', error);
    client.dispose(error instanceof Error ? error : undefined);
    workerClient = null;
    return exportPreprocessedDataset(options);
  }
}
