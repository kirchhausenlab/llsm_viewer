import { useCallback, useState } from 'react';
import { downloadStream, sanitizeExportFileName } from '../../shared/utils/downloads';
import {
  canUseFileSystemSavePicker,
  requestFileSystemSaveHandle,
  type FileSystemFileHandleLike
} from '../../workers/exportPreprocessedDatasetClient';
import { exportPreprocessedDatasetFromStorage } from '../../shared/utils/preprocessedDataset';
import { createBufferedUint8Stream } from '../../workers/exportPreprocessedDataset/mainThread';
import { cloneUint8Array } from '../../shared/utils/buffer';
import type { ChannelSource, StagedPreprocessedExperiment } from '../dataset';

export type UsePreprocessedExportOptions = {
  channels: ChannelSource[];
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  clearDatasetError: () => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
};

export type UsePreprocessedExportResult = {
  isExportingPreprocessed: boolean;
  handleExportPreprocessedExperiment: () => Promise<void>;
};

export function usePreprocessedExport({
  channels,
  preprocessedExperiment,
  clearDatasetError,
  showInteractionWarning,
  isLaunchingViewer
}: UsePreprocessedExportOptions): UsePreprocessedExportResult {
  const [isExportingPreprocessed, setIsExportingPreprocessed] = useState(false);

  const handleExportPreprocessedExperiment = useCallback(async () => {
    if (isExportingPreprocessed || isLaunchingViewer) {
      return;
    }

    if (!preprocessedExperiment) {
      showInteractionWarning('Preprocess the experiment before exporting.');
      return;
    }

    const totalVolumes = preprocessedExperiment.totalVolumeCount ?? 0;
    if (totalVolumes <= 0) {
      showInteractionWarning('There are no volumes available to export.');
      return;
    }

    setIsExportingPreprocessed(true);
    try {
      const suggestionSource =
        preprocessedExperiment?.sourceName ?? channels[0]?.name ?? 'preprocessed-experiment';
      const suggestionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestionBase = sanitizeExportFileName(suggestionSource);
      const suggestedFileName = `${suggestionBase}-${suggestionTimestamp}.zip`;

      let fileHandle: FileSystemFileHandleLike | null = null;
      if (canUseFileSystemSavePicker()) {
        try {
          fileHandle = await requestFileSystemSaveHandle(suggestedFileName);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            console.info('Preprocessed dataset export cancelled by user');
            return;
          }
          throw error;
        }
      }

      const bufferedStream = createBufferedUint8Stream();
      const { manifest } = await exportPreprocessedDatasetFromStorage(
        { manifest: preprocessedExperiment.manifest, storage: preprocessedExperiment.storageHandle.storage },
        (chunk) => {
          if (!bufferedStream.isCancelled()) {
            bufferedStream.enqueue(cloneUint8Array(chunk));
          }
        }
      );
      bufferedStream.close();
      const stream = bufferedStream.stream;

      const baseNameSource =
        preprocessedExperiment?.sourceName ?? channels[0]?.name ?? 'preprocessed-experiment';
      const fileBase = sanitizeExportFileName(baseNameSource);
      const timestamp = manifest.generatedAt.replace(/[:.]/g, '-');
      const fileName = `${fileBase}-${timestamp}.zip`;

      await downloadStream(stream, fileName, fileHandle);
      clearDatasetError();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.info('Preprocessed dataset export cancelled by user');
      } else {
        console.error('Failed to export preprocessed dataset', error);
        const message = error instanceof Error ? error.message : 'Failed to export preprocessed dataset.';
        showInteractionWarning(message);
      }
    } finally {
      setIsExportingPreprocessed(false);
    }
  }, [
    channels,
    clearDatasetError,
    isExportingPreprocessed,
    isLaunchingViewer,
    preprocessedExperiment,
    showInteractionWarning
  ]);

  return {
    isExportingPreprocessed,
    handleExportPreprocessedExperiment
  };
}
