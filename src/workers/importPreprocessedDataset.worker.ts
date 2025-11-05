/// <reference lib="webworker" />

import {
  importPreprocessedDataset,
  type ImportPreprocessedDatasetOptions,
  type ImportPreprocessedDatasetResult
} from '../utils/preprocessedDataset';

type ImportWorkerRequest = {
  id: number;
  type: 'import';
  stream: ReadableStream<Uint8Array>;
  totalBytes: number | null;
};

type ImportWorkerCancel = {
  id: number;
  type: 'cancel';
};

type WorkerRequest = ImportWorkerRequest | ImportWorkerCancel;

type WorkerProgress = {
  id: number;
  type: 'progress';
  bytesProcessed: number;
  totalBytes: number | null;
};

type WorkerDone = {
  id: number;
  type: 'done';
  result: ImportPreprocessedDatasetResult;
};

type WorkerError = {
  id: number;
  type: 'error';
  message: string;
  stack?: string;
};

type WorkerCancelled = {
  id: number;
  type: 'cancelled';
};

type ActiveTask = {
  cancel: () => void;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const activeTasks = new Map<number, ActiveTask>();

function collectTransferables(result: ImportPreprocessedDatasetResult): Transferable[] {
  const transferables: Transferable[] = [];
  for (const layer of result.layers) {
    for (const volume of layer.volumes) {
      transferables.push(volume.normalized.buffer);
    }
  }
  return transferables;
}

function handleImport(request: ImportWorkerRequest): void {
  const { id, stream, totalBytes } = request;

  if (activeTasks.has(id)) {
    ctx.postMessage({ id, type: 'error', message: 'Import already in progress for this id.' } satisfies WorkerError);
    return;
  }

  let cancelled = false;

  const options: ImportPreprocessedDatasetOptions = {
    onProgress: (bytesProcessed) => {
      if (cancelled) {
        return;
      }
      const progressMessage: WorkerProgress = {
        id,
        type: 'progress',
        bytesProcessed,
        totalBytes
      };
      ctx.postMessage(progressMessage);
    }
  };

  const abort = () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    stream.cancel().catch(() => {
      // Ignore cancellation failures – the reader might already be closed.
    });
  };

  activeTasks.set(id, { cancel: abort });

  importPreprocessedDataset(stream, options)
    .then((result) => {
      activeTasks.delete(id);
      if (cancelled) {
        const response: WorkerCancelled = { id, type: 'cancelled' };
        ctx.postMessage(response);
        return;
      }
      const transferables = collectTransferables(result);
      const response: WorkerDone = { id, type: 'done', result };
      ctx.postMessage(response, transferables);
    })
    .catch((error: unknown) => {
      activeTasks.delete(id);
      if (cancelled) {
        const response: WorkerCancelled = { id, type: 'cancelled' };
        ctx.postMessage(response);
        return;
      }
      const response: WorkerError = {
        id,
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      };
      ctx.postMessage(response);
    });
}

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (!message) {
    return;
  }

  if (message.type === 'import') {
    handleImport(message);
    return;
  }

  if (message.type === 'cancel') {
    const task = activeTasks.get(message.id);
    if (task) {
      task.cancel();
      activeTasks.delete(message.id);
      const response: WorkerCancelled = { id: message.id, type: 'cancelled' };
      ctx.postMessage(response);
    }
  }
};
