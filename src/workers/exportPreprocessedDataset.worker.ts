/// <reference lib="webworker" />

import {
  exportPreprocessedDataset,
  type ExportPreprocessedDatasetOptions,
  type ExportPreprocessedDatasetResult
} from '../utils/preprocessedDataset';

type WorkerRequest = {
  id: number;
  type: 'export';
  payload: ExportPreprocessedDatasetOptions;
};

type WorkerSuccess = {
  id: number;
  type: 'success';
  payload: ExportPreprocessedDatasetResult;
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
    const result = await exportPreprocessedDataset(message.payload);
    const response: WorkerSuccess = {
      id: message.id,
      type: 'success',
      payload: result
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
