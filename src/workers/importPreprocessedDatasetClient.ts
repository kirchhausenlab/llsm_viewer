import {
  getImportPreprocessedDatasetWorker,
  type ImportPreprocessedDatasetWorkerOptions,
  type PreprocessedImportProgress
} from './importPreprocessedDataset/workerClient';
import {
  importPreprocessedDataset,
  type ImportPreprocessedDatasetOptions,
  type ImportPreprocessedDatasetResult
} from '../shared/utils/preprocessedDataset';

export type ImportPreprocessedDatasetClientOptions = ImportPreprocessedDatasetWorkerOptions;

export async function importPreprocessedDatasetWithWorker(
  options: ImportPreprocessedDatasetClientOptions
): Promise<ImportPreprocessedDatasetResult> {
  const worker = getImportPreprocessedDatasetWorker();
  if (!worker) {
    console.warn('Import worker is not available. Falling back to main thread import.');

    if (!options.onProgress) {
      return importPreprocessedDataset(options.stream);
    }

    const progress: PreprocessedImportProgress = {
      bytesProcessed: 0,
      totalBytes: options.totalBytes,
      volumesDecoded: 0,
      totalVolumeCount: null
    };

    const emitProgress = () => {
      options.onProgress?.({ ...progress });
    };

    const fallbackOptions: ImportPreprocessedDatasetOptions = {
      onProgress: (bytesProcessed) => {
        progress.bytesProcessed = bytesProcessed;
        emitProgress();
      },
      onVolumeDecoded: (volumesDecoded, totalVolumeCount) => {
        progress.volumesDecoded = volumesDecoded;
        progress.totalVolumeCount = totalVolumeCount;
        emitProgress();
      },
      onMilestone: options.onMilestone
    };

    return importPreprocessedDataset(options.stream, fallbackOptions);
  }

  try {
    return await worker.import(options);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export { disposeImportPreprocessedDatasetWorker } from './importPreprocessedDataset/workerClient';
