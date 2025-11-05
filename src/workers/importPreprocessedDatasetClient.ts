import {
  getImportPreprocessedDatasetWorker,
  type ImportPreprocessedDatasetWorkerOptions
} from './importPreprocessedDataset/workerClient';
import {
  importPreprocessedDataset,
  type ImportPreprocessedDatasetOptions,
  type ImportPreprocessedDatasetResult
} from '../utils/preprocessedDataset';

export type ImportPreprocessedDatasetClientOptions = ImportPreprocessedDatasetWorkerOptions;

export async function importPreprocessedDatasetWithWorker(
  options: ImportPreprocessedDatasetClientOptions
): Promise<ImportPreprocessedDatasetResult> {
  const worker = getImportPreprocessedDatasetWorker();
  if (!worker) {
    console.warn('Import worker is not available. Falling back to main thread import.');
    const fallbackOptions: ImportPreprocessedDatasetOptions | undefined = options.onProgress
      ? { onProgress: (bytesProcessed) => options.onProgress?.(bytesProcessed, options.totalBytes) }
      : undefined;
    return importPreprocessedDataset(options.stream, fallbackOptions);
  }

  try {
    return await worker.import(options);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export { disposeImportPreprocessedDatasetWorker } from './importPreprocessedDataset/workerClient';
