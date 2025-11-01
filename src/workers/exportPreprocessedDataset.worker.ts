/// <reference lib="webworker" />

import {
  exportPreprocessedDataset,
  type ExportPreprocessedDatasetOptions,
  type PreprocessedManifest
} from '../utils/preprocessedDataset';
import { ensureArrayBuffer } from '../utils/buffer';

type WorkerRequest = {
  id: number;
  type: 'export';
  payload: ExportPreprocessedDatasetOptions;
};

type WorkerChunk = {
  id: number;
  type: 'chunk';
  buffer: ArrayBuffer;
};

type WorkerDone = {
  id: number;
  type: 'done';
  manifest: PreprocessedManifest;
};

type WorkerError = {
  id: number;
  type: 'error';
  message: string;
  stack?: string;
};

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (!message || message.type !== 'export') {
    return;
  }

  try {
    const result = await exportPreprocessedDataset(message.payload, (chunk) => {
      const transferable = ensureArrayBuffer(chunk);
      const chunkMessage: WorkerChunk = {
        id: message.id,
        type: 'chunk',
        buffer: transferable
      };
      ctx.postMessage(chunkMessage, [transferable]);
    });
    const response: WorkerDone = {
      id: message.id,
      type: 'done',
      manifest: result.manifest
    };
    ctx.postMessage(response);
  } catch (error) {
    const response: WorkerError = {
      id: message.id,
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
    ctx.postMessage(response);
  }
};
