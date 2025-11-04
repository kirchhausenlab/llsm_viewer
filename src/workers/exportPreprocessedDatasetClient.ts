import type { ExportPreprocessedDatasetOptions } from '../utils/preprocessedDataset';
import {
  exportPreprocessedDatasetOnMainThread,
  type ExportPreprocessedDatasetStreamResult
} from './exportPreprocessedDataset/mainThread';
import {
  disposeWorkerClient,
  getWorkerClient
} from './exportPreprocessedDataset/workerClient';

export type { ExportPreprocessedDatasetStreamResult } from './exportPreprocessedDataset/mainThread';
export {
  canUseFileSystemSavePicker,
  collectStreamToBlob,
  requestFileSystemSaveHandle,
  saveStreamWithFilePicker,
  writeStreamToFileHandle,
  type FileSystemFileHandleLike,
  type FileSystemWritableFileStreamLike
} from './exportPreprocessedDataset/fileSystem';

export { exportPreprocessedDatasetOnMainThread } from './exportPreprocessedDataset/mainThread';

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
    disposeWorkerClient(error instanceof Error ? error : undefined);
    return exportPreprocessedDatasetOnMainThread(options);
  }
}
